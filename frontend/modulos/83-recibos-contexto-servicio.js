/* Orquestación documental sin fotografía; lectores y evidencia fiscal compartidos. */
(function(root){
 'use strict';
 function crear(dep){
  let generacion=0,estado=null,ocupado=false,cerrado=false,pausaIA=0;
  const valido=g=>!cerrado&&g===generacion&&dep.vigente();
  const emitir=()=>{if(!cerrado&&dep.vigente())dep.cambio(estado,ocupado);};
  async function rpc(accion,datos={}){
   const {data,error}=await dep.rpc('control_archivo_recibos',{p_accion:accion,p_datos:{modo_archivo:'INDEPENDIENTE',obra_id:estado.obra_id,contexto:estado.contexto,...datos}});
   if(error)throw Error(error.message||'No se completó el archivo.');return data;
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
  async function confirmar(id){return ejecutar(async()=>{
   const f=estado.archivos.find(x=>x.id===id);if(!f)throw Error('Archivo no disponible.');
   Object.assign(f,await rpc('REGISTRAR',{archivo_id:id,confirmado:true}));
   if(f.documento_id)await verificar(f);emitir();return f;
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
  async function vincular(id,cierre_id,confirmado=false){return ejecutar(async()=>rpc(confirmado?'VINCULAR':'PROPONER_VINCULOS',{archivo_id:id,cierre_id,confirmado}));}
  async function completar(id,k,literal,ia=false){return ejecutar(async()=>{
   const g=generacion,f=estado.archivos.find(x=>x.id===id),region=f?.lectura?.pendientes?.[k]?.region;
   if(!region)throw Error('Relee el original para aislar el campo pendiente.');
   if(ia){
    if(Date.now()<pausaIA)throw Error('Lectura asistida en pausa; espera y reintenta sólo este campo.');
    const r=await dep.fragmento({tipo:'recibo_fragmento',obra_id:estado.obra_id,huella:f.huella,region});
    if([429,503].includes(r.error?.context?.status)||r.data?.temporal){pausaIA=Date.now()+45000;throw Error('Gemini temporalmente ocupado. El original y las lecturas correctas se conservaron.');}
    if(r.error||!r.data?.ok)throw Error(r.data?.error||r.error?.message||'No se obtuvo transcripción comprobable.');literal=r.data.literal;
   }
   if(!valido(g))return;const evidencia={region,literal};dep.incorporar(f,evidencia);(f.transcripciones??=[]).push(evidencia);await lecturaGuardar(f,g);
  });}
  return Object.freeze({abrir,subir,reanudar,confirmar,vincular,completar,verificar:id=>ejecutar(()=>verificar(estado.archivos.find(f=>f.id===id))),estado:()=>estado,ocupado:()=>ocupado,cerrar:()=>{cerrado=true;generacion++;}});
 }
 root.PLATINUM_RECIBOS_CONTEXTO=Object.freeze({crear});
})(window);
