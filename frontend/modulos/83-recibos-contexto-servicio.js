/* Orquestación documental sin fotografía; lectores y evidencia fiscal compartidos. */
(function(root){
 'use strict';
 function crear(dep){
  let generacion=0,estado=null,ocupado=false,cerrado=false,secuenciaLote=0;
  const valido=g=>!cerrado&&g===generacion&&dep.vigente();
  const emitir=()=>{if(!cerrado&&dep.vigente())dep.cambio(estado,ocupado);};
  async function rpc(accion,datos={}){
   const {data,error}=await dep.rpc('control_archivo_recibos',{p_accion:accion,p_datos:{modo_archivo:'INDEPENDIENTE',obra_id:estado.obra_id,contexto:estado.contexto,...datos}});
   if(error){const e=Error(error.message||'No se completó el archivo.');e.code=error.code;throw e;}return data;
  }
  async function ejecutar(fn){if(ocupado)throw Error('Espera a que termine la operación actual.');ocupado=true;emitir();try{return await fn();}finally{ocupado=false;emitir();}}
  async function abrir(obra_id,contexto){
   if(ocupado)throw Error('Termina la carga antes de cambiar de periodo.');
   const g=++generacion;estado={obra_id,contexto,archivos:[],cierres:[],escritura:false};emitir();
   const r=await rpc('CONTEXTO');if(!valido(g))return;
   Object.assign(estado,r);emitir();return estado;
  }
  async function lecturaGuardar(f,g){
    if(!valido(g))return;
    const errores=[...(f.lectura?.errores||[]),...(f.lectura?.pendientes||[]).filter(x=>x.campo!=='cfdi_uuid').map(x=>x.campo+': '+x.causa)];
    if(f.lectura?.datos?.recibos!==1)errores.push('No se identificó un recibo individual');
    const d=f.lectura?.datos;
    if(d?.percepciones!=null&&d?.deducciones!=null&&Math.round((d.percepciones+(d.otros_pagos||0)-d.deducciones)*100)!==Math.round(d.neto*100))errores.push('La suma de conceptos no coincide con el neto');
    const propuesta={...f.datos,transcripciones:f.transcripciones||[],...(errores.length?{neto:null,errores}:{})};
    Object.assign(f,await rpc('LECTURA',{archivo_id:f.id,lectura:propuesta}));
    if(errores.length)f.motivo=errores.join(' · ');
   emitir();return f;
  }
  async function leer(f,g){
   try{await dep.leer(f);for(const x of f.transcripciones||[])dep.incorporar(f,x);return await lecturaGuardar(f,g);}
   catch(e){f.estado='REVISAR';f.motivo=e.message;await rpc('LECTURA',{archivo_id:f.id,lectura:{error:e.message}});emitir();return f;}
  }
  async function subir(files){return ejecutar(async()=>{
   const g=generacion;
   for(const file of files){
    if(!valido(g))break;
    const f={file,estado:'RECIBIENDO',datos:{}};estado.archivos.push(f);emitir();
    try{
     const formato=file.name.split('.').pop().toUpperCase();
     if(!['PDF','XML'].includes(formato)||file.size<1||file.size>25*1024*1024)throw Error('Selecciona PDF/XML individuales de hasta 25 MB.');
     const huella=await dep.hash(new Uint8Array(await file.arrayBuffer()));if(!valido(g))break;
     const a=await rpc('INICIAR',{archivo:{nombre:file.name,tamano:file.size,formato,huella}});Object.assign(f,a);f.transcripciones=a.datos?.transcripciones||[];
     if(!valido(g))break;
     if(!a.ya_subido){
      const r=await dep.storage.from('expedientes').upload(a.ruta,file,{upsert:false,contentType:formato==='XML'?'application/xml':'application/pdf'});
      if(r.error){const check=await rpc('ABRIR',{archivo_id:a.id});if(!check.ya_subido)throw Error(r.error.message);}
     }
     await rpc('RECIBIDO',{archivo_id:a.id});if(!valido(g))break;
     if(a.documento_id){f.estado='ARCHIVADO';f.motivo='Original registrado; puedes comprobar su evidencia fiscal.';}else await leer(f,g);
    }catch(e){f.estado='FALLO';f.motivo=e.message;}
    emitir();
   }
  });}
  async function reanudar(id){return ejecutar(async()=>{
   const g=generacion,f=estado.archivos.find(x=>x.id===id);if(!f)throw Error('Selecciona un archivo del periodo.');
   const a=await rpc('ABRIR',{archivo_id:id});if(!valido(g))return;
   const {data,error}=await dep.storage.from('expedientes').download(a.ruta);if(error)throw Error(error.message);
   if(!valido(g))return;f.file=dep.archivo(data,a.datos.nombre);f.id=a.id;f.transcripciones=a.datos?.transcripciones||[];
   if(await dep.hash(new Uint8Array(await f.file.arrayBuffer()))!==a.huella)throw Error('La huella no corresponde al original.');
   if(!a.documento_id)await leer(f,g);else Object.assign(f,a,{estado:'ARCHIVADO'});
  });}
  // Registro documental de un original: misma llamada y validaciones de servidor para la confirmación individual y la global.
  async function registrar(f){const r=await rpc('REGISTRAR',{archivo_id:f.id,confirmado:true});Object.assign(f,r);return r;}
  async function confirmar(id){return ejecutar(async()=>{
   const f=estado.archivos.find(x=>x.id===id);if(!f)throw Error('Archivo no disponible.');
   await registrar(f);
   if(f.documento_id)await verificar(f);emitir();return f;
  });}
  // Confirmación global: sólo registros listos; PDF y XML del mismo UUID forman un grupo (XML primero → una sola representación del CFDI).
  const CONCURRENCIA=3,txt=x=>String(x??'').trim(),uuidDe=f=>txt(f.datos?.uuid||f.uuid_fiscal).toUpperCase()||null;
  const nombreDe=f=>f.datos?.nombre||f.file?.name||'Original';
  function clasificar(f){
   if(f.documento_id)return{categoria:'REGISTRADO',motivo:'Registro documental existente'};
   const r=f.datos?.resultado,motivo=f.motivo||r?.motivo||f.datos?.motivo;
   if(!f.id||['RECIBIENDO','PENDIENTE'].includes(f.estado))return{categoria:'LECTURA',motivo:motivo||'Lectura pendiente'};
   if(f.estado==='FALLO')return{categoria:'ERROR',motivo:motivo||'No se completó'};
   if(f.estado==='VALIDO'||(f.estado==='CONFLICTO'&&r?.estado==='VALIDO'))return{categoria:'LISTO'};
   if((f.lectura?.pendientes||[]).length||(f.estado==='CONFLICTO'&&!r))return{categoria:'LECTURA',motivo:motivo||'Lectura pendiente'};
   return{categoria:'DISCREPANCIA',motivo:motivo||'Revisión pendiente'};
  }
  const firma=f=>['trabajador_id','neto','desde','hasta','concepto'].map(k=>txt(k==='trabajador_id'?f.trabajador_id||f.datos?.resultado?.trabajador_id:f.datos?.[k])).join('|');
  function resumen(excluir=[]){
   const fuera=new Set(excluir),excluidos={LECTURA:[],DISCREPANCIA:[],ERROR:[],DUPLICADO:[]},grupos=new Map(),listos=[];let registrados=0,omitidos=0;
   for(const f of estado?.archivos||[]){
    const c=clasificar(f);if(c.categoria==='REGISTRADO'){registrados++;continue;}
    if(c.categoria!=='LISTO'){excluidos[c.categoria].push({id:f.id||null,nombre:nombreDe(f),motivo:c.motivo});continue;}
    if(fuera.has(f.id)){omitidos++;continue;}
    const u=uuidDe(f),k=u||'ID:'+f.id;if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(f);
   }
   const lista=[];
   for(const [k,g] of grupos){
    if(g.length>1&&new Set(g.map(firma)).size>1){for(const f of g)excluidos.DUPLICADO.push({id:f.id,nombre:nombreDe(f),motivo:'Mismo UUID con identidad, periodo, concepto o importe distintos; revisa cada original'});continue;}
    const vistos=new Set(),grupo=[];
    for(const f of [...g].sort((a,b)=>(a.formato==='XML'?0:1)-(b.formato==='XML'?0:1))){
     const fmt=f.formato||nombreDe(f).split('.').pop().toUpperCase();
     if(vistos.has(fmt)){excluidos.DUPLICADO.push({id:f.id,nombre:nombreDe(f),motivo:'Otro '+fmt+' del mismo UUID ya está en el lote; se conserva el primero'});continue;}
     vistos.add(fmt);grupo.push(f.id);listos.push(f.id);
    }
    lista.push(grupo);
   }
   return{listos,grupos:lista,cfdi:lista.length,excluidos,registrados,omitidos};
  }
  const totales=l=>{const t={CONFIRMADO:0,YA_EXISTENTE:0,FALLIDO:0,PENDIENTE:0,total:0,procesados:0};for(const x of Object.values(l.filas)){t.total++;t[x.estado==='PROCESANDO'?'PENDIENTE':x.estado]++;if(!['PENDIENTE','PROCESANDO'].includes(x.estado))t.procesados++;}return t;};
  const sinPermiso=e=>e?.code==='42501'||/permiso|cuenta operativa|sesi[oó]n/i.test(e?.message||'');
  let loteEnCurso=null;
  function confirmarLote(excluir=[]){return loteEnCurso||=lote(()=>resumen(excluir),false).finally(()=>{loteEnCurso=null;});}
  function reintentarFallidos(){return loteEnCurso||=lote(null,true).finally(()=>{loteEnCurso=null;});}
  function lote(plan,soloFallidos){return ejecutar(async()=>{
   const g=generacion,usuario=dep.usuario?.()??null;
   if(soloFallidos&&!estado.lote)throw Error('No hay un lote previo para reintentar.');
   const l=soloFallidos?estado.lote:(estado.lote={id:'L'+(++secuenciaLote),filas:{},excluidos:null,detenido:null});
   const ids=soloFallidos?Object.keys(l.filas).filter(id=>l.filas[id].estado==='FALLIDO'):null;
   const p=soloFallidos?null:plan();
   if(p){l.excluidos=p.excluidos;l.cfdi=p.cfdi;for(const id of p.listos)l.filas[id]={estado:'PENDIENTE',nombre:nombreDe(estado.archivos.find(f=>f.id===id))};}
   for(const id of ids||[])l.filas[id]={...l.filas[id],estado:'PENDIENTE',motivo:null};
   l.detenido=null;l.en_curso=true;l.totales=totales(l);emitir();
   const detener=m=>{if(!l.detenido)l.detenido=m;};
   const vigente=()=>{if(!valido(g))detener('La sesión o el periodo cambió; el lote se detuvo sin mezclar resultados.');else if(usuario!=null&&dep.usuario?.()!==usuario)detener('La sesión cambió; el lote se detuvo.');return !l.detenido;};
   try{
    // Revalida contexto, permisos y versiones antes de confirmar.
    const srv=await rpc('CONTEXTO');if(!vigente())return l;
    if(!srv.escritura)detener('Tu cuenta ya no tiene permiso de escritura en este centro.');
    else if(JSON.stringify(srv.contexto)!==JSON.stringify(estado.contexto))detener('El periodo del servidor cambió; vuelve a cargar el contexto.');
    if(l.detenido)return l;
    const remoto=new Map((srv.archivos||[]).map(a=>[a.id,a]));
    const grupos=(p?p.grupos:[ids]).map(gr=>gr.filter(id=>l.filas[id]?.estado==='PENDIENTE'));
    for(const gr of grupos)for(const id of [...gr]){
     const a=remoto.get(id),f=estado.archivos.find(x=>x.id===id),fila=l.filas[id];
     const cambio=a&&['uuid','neto','desde','hasta','concepto'].some(k=>f.datos?.[k]!=null&&a.datos?.[k]!=null&&txt(f.datos[k])!==txt(a.datos[k]));
     if(!a)Object.assign(fila,{estado:'PENDIENTE',motivo:'El original ya no pertenece a este periodo; vuelve a cargar el contexto.'});
     else if(a.documento_id){Object.assign(f,{documento_id:a.documento_id,estado:'ARCHIVADO'});Object.assign(fila,{estado:'YA_EXISTENTE',motivo:'Registrado en otra sesión'});}
     else if(cambio||a.datos?.resultado?.estado!=='VALIDO')Object.assign(fila,{estado:'PENDIENTE',motivo:'La lectura cambió o ya no está lista: '+(a.datos?.resultado?.motivo||'vuelve a revisarla')});
     else continue;
     gr.splice(gr.indexOf(id),1);
    }
    l.totales=totales(l);emitir();
    const cola=grupos.filter(gr=>gr.length);
    const procesar=async id=>{
     const f=estado.archivos.find(x=>x.id===id),fila=l.filas[id];fila.estado='PROCESANDO';emitir();
     try{
      const r=await registrar(f);
      if(!f.documento_id)Object.assign(fila,{estado:'PENDIENTE',motivo:r.motivo||'El servidor no lo consideró listo ('+(r.estado||'sin estado')+')'});
      else Object.assign(fila,{estado:r.vinculacion?'CONFIRMADO':'YA_EXISTENTE',motivo:null});
     }catch(e){
      if(sinPermiso(e)){Object.assign(fila,{estado:'PENDIENTE',motivo:e.message});detener(e.message);return;}
      // Respuesta perdida: comprueba si el registro sí ocurrió antes de marcar fallo (REGISTRAR es idempotente).
      let a=null;try{a=await rpc('ABRIR',{archivo_id:id});}catch{}
      if(a?.documento_id){Object.assign(f,{documento_id:a.documento_id,estado:'ARCHIVADO'});Object.assign(fila,{estado:'CONFIRMADO',motivo:'Respuesta recuperada del servidor'});}
      else{Object.assign(fila,{estado:'FALLIDO',motivo:e.message});return;}
     }
     if(f.documento_id&&valido(g))try{await verificar(f);}catch(e){fila.aviso='Evidencia fiscal pendiente: '+e.message;}
    };
    const trabajador=async()=>{for(let gr;(gr=cola.shift());)for(const id of gr){if(!vigente()){for(const x of gr)if(l.filas[x].estado==='PENDIENTE')l.filas[x].motivo=l.detenido;break;}await procesar(id);l.totales=totales(l);emitir();}};
    await Promise.all(Array.from({length:Math.min(CONCURRENCIA,cola.length)},trabajador));
    if(l.detenido)for(const x of Object.values(l.filas))if(x.estado==='PENDIENTE'&&!x.motivo)x.motivo=l.detenido;
    return l;
   }finally{l.en_curso=false;l.totales=totales(l);}
  });}
  async function verificar(f){
   const p={obra_id:estado.obra_id,documento_id:f.documento_id};
   const llamada=async accion=>{const r=await dep.rpc('control_revision_recibo',{p_accion:accion,p_datos:p});if(r.error)throw Error(r.error.message);return r.data;};
   const preparado=await llamada('PREPARAR');
   if(preparado.estado==='LISTO'){
    const resultado=await dep.verificar({lote_id:preparado.lote_id,token:preparado.token,individual:true,huella:f.huella,transcripciones:f.transcripciones||f.datos?.transcripciones||[]});
    const final=await llamada('ESTADO');Object.assign(f,final);
    if(resultado.error&&final.estado!=='VERIFICADO')f.motivo=final.motivo||resultado.error.message;
   }else Object.assign(f,preparado);
   return f;
  }
  // Original subido en un periodo que no contiene sus fechas: el servidor lo reubica al periodo del
  // calendario del centro que sí las contiene (sin volver a subirlo y sólo si aún no está registrado).
  async function reubicar(id){return ejecutar(async()=>{
   if(!estado.archivos.some(x=>x.id===id))throw Error('Selecciona un archivo del periodo.');
   return rpc('REUBICAR',{archivo_id:id});
  });}
  async function vincular(id,cierre_id,confirmado=false){return ejecutar(async()=>rpc(confirmado?'VINCULAR':'PROPONER_VINCULOS',{archivo_id:id,cierre_id,confirmado}));}
  async function completar(id,k,literal,ia=false){return ejecutar(async()=>{
   const g=generacion,f=estado.archivos.find(x=>x.id===id),region=f?.lectura?.pendientes?.[k]?.region;
   if(!region)throw Error('Relee el original para aislar el campo pendiente.');
   if(ia){
    literal=await root.PLATINUM_LECTURA_ASISTIDA.leer({usuario:dep.usuario?.()||'',obra_id:estado.obra_id,huella:f.huella,region},dep.fragmento,progreso=>{f.asistencia=progreso;emitir();});
   }
   if(!valido(g))return;const evidencia={region,literal};dep.incorporar(f,evidencia);(f.transcripciones??=[]).push(evidencia);await lecturaGuardar(f,g);
  });}
  return Object.freeze({abrir,subir,reanudar,reubicar,confirmar,resumen,confirmarLote,reintentarFallidos,vincular,completar,verificar:id=>ejecutar(()=>verificar(estado.archivos.find(f=>f.id===id))),estado:()=>estado,ocupado:()=>ocupado,cerrar:()=>{cerrado=true;generacion++;}});
 }
 root.PLATINUM_RECIBOS_CONTEXTO=Object.freeze({crear});
})(window);
