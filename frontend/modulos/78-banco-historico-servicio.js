/* Archivo y lectura bancaria recuperables. No contiene fórmulas de nómina. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_BANCO_HISTORICO=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const copia=x=>JSON.parse(JSON.stringify(x));
 const llave=r=>[String(r.titular||'').toUpperCase().replace(/\s+/g,' '),String(r.cuenta||r.mask||'').replace(/\D/g,'').slice(-4),r.fecha,r.importe,r.estado].join('|');
 function combinarPagina(previos,nuevos,core){
  // Conserva cada ocurrencia correcta, incluso dos operaciones idénticas.
  const salida=previos.map(copia),usadas=new Set();
  for(const n of nuevos){
   let i=salida.findIndex((r,j)=>!usadas.has(j)&&llave(r)===llave(n));
   if(i>=0){usadas.add(i);continue;}
   i=salida.findIndex((r,j)=>!usadas.has(j)&&!core.revisarBanco({records:[r]}).ok&&
    (!(r.cuenta||r.mask)||String(n.cuenta||n.mask||'').endsWith(String(r.cuenta||r.mask)))&&(!r.fecha||n.fecha===r.fecha)&&
    (!!(r.cuenta||r.mask)||!!r.fecha));
   if(i>=0){const r=salida[i],completa={...n,...r};for(const k of ['titular','cuenta','mask','fecha','importe','estado'])if(r[k]==null||r[k]===''||k==='importe'&&!(Number(r[k])>0))completa[k]=n[k];salida[i]=completa;usadas.add(i);}
   else{salida.push(copia(n));usadas.add(salida.length-1);}
  }
  return salida;
 }
 function crear(cfg){
  let estado=null,secuencia=0,ocupado=false,cacheBytes=new Map();
  const avisar=()=>cfg.onChange?.(estado,ocupado),scope=()=>cfg.context();
  const vigente=t=>estado&&t===secuencia&&scope().usuario_id===estado.usuario_id&&scope().obra_id===estado.obra_id&&scope().firma===estado.firma;
  function exigir(t){if(!vigente(t))throw Error('Cambió el centro o la sesión. Vuelve a abrir el archivo en su contexto.');}
  async function rpc(accion,j,t=secuencia){exigir(t);const r=await cfg.rpc('control_importacion_bancaria',{p_accion:accion,p_datos:j});exigir(t);if(r.error)throw Error(r.error.message||'No se confirmó la operación bancaria');if(!r.data)throw Error('Respuesta bancaria incompleta');return r.data;}
  async function tarea(fn){if(ocupado)throw Error('Espera a que termine la operación actual');const t=secuencia;ocupado=true;avisar();try{return await fn(t);}finally{ocupado=false;avisar();}}
  // Contexto por secciones: permisos mínimos primero; personas, archivos, originales anteriores y fuentes
 // se consultan por separado, paginados, con estado propio y sin bloquear el archivo de comprobantes.
 const CTX='control_importacion_contexto';
 const faltaRpc=e=>/PGRST202|42883/.test(String(e?.code||''))||/could not find the function|does not exist/i.test(String(e?.message||''));
 async function rpcCtx(accion,j,t){exigir(t);const c=estado.contexto;const r=await cfg.rpc(CTX,{p_accion:accion,p_datos:{obra_id:estado.obra_id,anio:c.anio,periodicidad:c.periodicidad,...j}});exigir(t);
  if(r.error){const e=Error(r.error.message||'No se consultó el contexto bancario');e.code=r.error.code;throw e;}if(!r.data)throw Error('Respuesta de contexto incompleta');return r.data;}
 function marcar(sec,cambios,t){if(!vigente(t))return;estado.secciones[sec]={...estado.secciones[sec],...cambios};avisar();}
 async function seccion(sec,t,fn){if(!vigente(t))return false;marcar(sec,{estado:'CARGANDO',error:null},t);
  try{await fn();marcar(sec,{estado:'LISTO'},t);return true;}catch(e){if(vigente(t))marcar(sec,{estado:'ERROR',error:e.message},t);return false;}}
 const cargadores={
  async personas(t){const todas=[];let despues=null,n=0;do{const r=await rpcCtx('PERSONAS',{despues,limite:500},t);todas.push(...r.filas);despues=r.siguiente||null;if(++n>200)throw Error('Paginación de personas sin fin');}while(despues);
   estado.personas=todas;const total=estado.totales?.personas;marcar('personas',{total:todas.length,aviso:total!=null&&total!==todas.length?'El padrón cambió durante la consulta ('+todas.length+' de '+total+'); reintenta para actualizar.':null},t);},
  async archivos(t,mas){const r=await rpcCtx('ARCHIVOS',{...(mas?estado.archivosSiguiente:{}),limite:50},t);const ids=new Set(estado.archivos.map(a=>a.id));for(const a of r.filas)if(!ids.has(a.id))estado.archivos.push(a);
   estado.archivosSiguiente=r.siguiente||null;marcar('archivos',{total:estado.archivos.length,mas:!!r.siguiente},t);},
  async anteriores(t,mas){const r=await rpcCtx('ANTERIORES',{...(mas?estado.anterioresSiguiente:{}),limite:50},t);const ids=new Set(estado.anteriores.map(a=>a.id));for(const a of r.filas)if(!ids.has(a.id))estado.anteriores.push(a);
   estado.anterioresSiguiente=r.siguiente||null;marcar('anteriores',{total:estado.anteriores.length,mas:!!r.siguiente},t);}
 };
 function cargarSeccion(sec,t,mas){const p=seccion(sec,t,()=>cargadores[sec](t,mas));if(estado)estado.cargas[sec]=p;return p;}
 function iso(d){return d.toISOString().slice(0,10);}
 // Periodos a consultar: semana elegida; si no, las fechas de las operaciones leídas (lote mixto) o los días de la quincena.
 function filtroFuentes(records){const c=estado.contexto,semanas=c.semana?[Number(c.semana)]:[];
  let fechas=semanas.length?[]:[...new Set((records||[]).map(r=>r.fecha).filter(f=>/^\d{4}-\d{2}-\d{2}$/.test(f||'')))].sort();
  if(!semanas.length&&!fechas.length&&c.periodicidad==='QUINCENAL'&&c.mes){const a=Number(c.anio),m=Number(c.mes)-1,fin=new Date(Date.UTC(a,m+1,0)).getUTCDate();
   const d0=c.quincena===2?16:1,d1=c.quincena===1?15:fin;for(let d=d0;d<=d1;d+=6)fechas.push(iso(new Date(Date.UTC(a,m,d))));fechas.push(iso(new Date(Date.UTC(a,m,d1))));fechas=[...new Set(fechas)];}
  return{semanas,fechas,concepto:c.concepto&&c.concepto!=='TODOS'?c.concepto:null};}
 async function asegurarFuentes(records,t){if(estado.modo==='LEGADO')return true;const f=filtroFuentes(records);if(!f.semanas.length&&!f.fechas.length)return true;
  const llave=JSON.stringify(f);if(estado.cacheFuentes.has(llave))return estado.cacheFuentes.get(llave);
  const p=seccion('fuentes',t,async()=>{const r=await rpcCtx('FUENTES',f,t);const vistos=new Set(estado.fuentes.map(x=>x.clave));for(const x of r.fuentes||[])if(!vistos.has(x.clave)){vistos.add(x.clave);estado.fuentes.push(x);}
   marcar('fuentes',{total:estado.fuentes.length,semanas:r.semanas||f.semanas},t);});
  estado.cacheFuentes.set(llave,p);const ok=await p;if(!ok&&estado)estado.cacheFuentes.delete(llave);return ok;}
 async function prepararAsociacion(records,t){if(estado.modo==='LEGADO')return;await estado.cargas.personas;exigir(t);await asegurarFuentes(records,t);exigir(t);}
 async function abrir(contexto){const c=scope(),t=++secuencia;
  estado={...c,contexto:copia(contexto),archivos:[],archivo:null,previa:null,resultados:[],personas:[],fuentes:[],anteriores:[],archivosSiguiente:null,anterioresSiguiente:null,
   secciones:{contexto:{estado:'CARGANDO'},archivos:{estado:'PENDIENTE'},personas:{estado:'PENDIENTE'},anteriores:{estado:'PENDIENTE'},fuentes:{estado:'PENDIENTE'}},cacheFuentes:new Map(),cargas:{},modo:'SECCIONES'};
  cacheBytes.clear();avisar();let d;
  try{d=await rpcCtx('CONTEXTO',{},t);}
  catch(e){if(!faltaRpc(e)){if(vigente(t))marcar('contexto',{estado:'ERROR',error:e.message},t);throw e;}
   // Compatibilidad con un servidor sin contexto por secciones.
   d=await rpc('CONTEXTO',{obra_id:c.obra_id,anio:contexto.anio,periodicidad:contexto.periodicidad},t);Object.assign(estado,d,{modo:'LEGADO'});
   for(const k of ['archivos','personas','anteriores','fuentes'])estado.secciones[k]={estado:'LISTO',total:(d[k]||[]).length};estado.secciones.contexto={estado:'LISTO'};avisar();return estado;}
  Object.assign(estado,{empresa_codigo:d.empresa_codigo,puede_importar:d.puede_importar,puede_conciliar:d.puede_conciliar,totales:d.totales||{},fecha_inicio:d.fecha_inicio});
  estado.secciones.contexto={estado:'LISTO'};avisar();
  cargarSeccion('personas',t);cargarSeccion('archivos',t);if(d.puede_importar)cargarSeccion('anteriores',t);asegurarFuentes([],t);
  return estado;}
 function reintentar(sec){const t=secuencia;if(!estado)return Promise.resolve(false);if(sec==='fuentes')return asegurarFuentes(estado.archivo?.propuesta?.records||[],t);if(!cargadores[sec])throw Error('Sección desconocida');
  if(sec!=='personas'){if(sec==='archivos'){estado.archivos=estado.archivos.filter(a=>a.id===estado.archivo?.id);estado.archivosSiguiente=null;}else{estado.anteriores=[];estado.anterioresSiguiente=null;}}return cargarSeccion(sec,t);}
 function mas(sec){if(!estado||!['archivos','anteriores'].includes(sec))return Promise.resolve(false);if(!estado[sec+'Siguiente'])return Promise.resolve(true);return cargarSeccion(sec,secuencia,true);}
 async function seleccionar(id){return tarea(async t=>{estado.archivo=await rpc('ABRIR',{archivo_id:id},t);estado.previa=null;estado.resultados=estado.archivo.resoluciones?.map(r=>r.resultado)||[];avisar();return estado.archivo;});}
  async function guardar(propuesta,t=secuencia){const a=estado.archivo;estado.archivo=await rpc('PROPUESTA',{archivo_id:a.id,revision:a.revision,propuesta},t);estado.previa=null;avisar();return estado.archivo;}
  async function archivar(bytes,nombre,contexto,t,padre,pagina){
   const sha256=await cfg.hash(bytes);exigir(t);
   let a=await rpc('INICIAR',{obra_id:estado.obra_id,contexto,nombre,sha256,tamano:bytes.byteLength,mime:'application/pdf',...(padre?{padre_id:padre,paginas:[pagina]}:{})},t);
   if(a.obra_id!==estado.obra_id)throw Error('El original pertenece a otro centro');
   if(a.estado==='SUBIENDO'){
    const r=await cfg.storage.from('conciliacion-nomina').upload(a.ruta,cfg.file(bytes,nombre),{contentType:'application/pdf',upsert:false});exigir(t);
    if(r.error&&!/already exists|duplicate/i.test(r.error.message||''))throw Error(r.error.message);
    a=await rpc('ARCHIVADO',{archivo_id:a.id},t);
   }
   cacheBytes.set(a.id,bytes.slice(0));while(cacheBytes.size>2)cacheBytes.delete(cacheBytes.keys().next().value);return a;
  }
  async function bytesOriginal(a,t){if(cacheBytes.has(a.id))return cacheBytes.get(a.id).slice(0);const r=await cfg.storage.from('conciliacion-nomina').download(a.ruta);exigir(t);if(r.error||!r.data)throw Error(r.error?.message||'No se descargó el original archivado');const b=await r.data.arrayBuffer();if(await cfg.hash(b)!==a.sha256)throw Error('La huella del original cambió');exigir(t);cacheBytes.set(a.id,b.slice(0));return b;}
  function asociar(rows){const personas=new Map();for(const f of estado.fuentes||[])personas.set(f.trabajador_id,{id:f.trabajador_id,nombre:f.nombre,cuenta:f.cuenta,clabe:f.clabe});for(const w of estado.personas||[])if(!personas.has(w.id))personas.set(w.id,w);
   return rows.map(r=>{if(r.trabajador_id)return r;const a=cfg.core.asociar(r,[...personas.values()]);return{...r,asociacion:a,trabajador_id:a.trabajador_id,seleccionado:!!a.trabajador_id,concepto:estado.archivo.contexto.concepto};});}
  function reunir(p){const anteriores=new Map((p.records||[]).map(r=>[r.pagina+':'+r.ordinal_pagina+':'+llave(r),r]));return asociar(p.paginas.flatMap(pg=>pg.records.map((r,i)=>({
   ...r,...(anteriores.get(pg.numero+':'+(i+1)+':'+llave(r))||{}),pagina:pg.numero,ordinal_pagina:i+1}))));}
  async function completarInterno(pagina,t){
   const a=estado.archivo,p=copia(a.propuesta),pg=p.paginas.find(x=>x.numero===pagina);if(!pg)throw Error('No existe esa página del original');
   try{
    const bytes=await bytesOriginal(a,t),fragmento=await cfg.fragmento(bytes,pagina);exigir(t);
    const f=await archivar(fragmento,'FRAGMENTO_'+pagina+'_'+a.nombre,a.contexto,t,a.id,pagina);
    const j=await cfg.ia(f.id);exigir(t);if(!j?.ok)throw Error(j?.error||'Lectura complementaria pendiente');
    const lectura=cfg.core.validarIA(j,pg.texto||'');
    if(!lectura.records.length)throw Error(lectura.validacion.errores.join('. ')||'No se reconocieron operaciones en el fragmento');
    pg.records=combinarPagina(pg.records||[],lectura.records,cfg.core);pg.fragmento_id=f.id;pg.lector='TRADICIONAL_Y_COMPLEMENTARIO';pg.error=null;
    pg.pendiente=pg.records.some(r=>!cfg.core.revisarBanco({records:[r]}).ok);if(pg.pendiente)pg.error=lectura.validacion.errores.join('. ');
   }catch(e){pg.pendiente=true;pg.error=e.message;}
   await prepararAsociacion(p.paginas.flatMap(x=>x.records||[]),t);p.records=reunir(p);
   p.validacion=cfg.core.revisarBanco({...p,records:p.records},p.paginas.map(x=>x.texto||'').join('\n'));
   return guardar(p,t);
  }
  async function leerInterno(a,bytes,t){
   if(a.propuesta?.records?.length){estado.archivo=a;avisar();return a;}
   const paginas=await cfg.paginas(bytes.slice(0));exigir(t);
   const global=paginas.some(x=>/RESUMEN GENERAL|GRUPO DE PAGO|TOTAL DE OPERACIONES|NUMERO DE REGISTROS/i.test(String(x.texto).normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
   let esperados=null,totalEsperado=null,tipo=global?'GLOBAL':'INDIVIDUAL';
   const pp=[];
   for(const x of paginas){const text=global&&!/RESUMEN GENERAL|GRUPO DE PAGO/i.test(x.texto)?'RESUMEN GENERAL '+x.texto:x.texto;
    const r=cfg.core.leerTradicional(text,cfg.legacy);if(r.esperados!=null&&global)esperados=r.esperados;if(r.totalEsperado!=null&&global)totalEsperado=r.totalEsperado;
    const pendiente=!r.records.length||r.records.some(y=>!cfg.core.revisarBanco({records:[y]}).ok);
    pp.push({numero:x.numero,texto:x.texto,records:r.records,lector:'TRADICIONAL',pendiente,error:pendiente?'Página con lectura pendiente':null});
   }
   let p={tipo,esperados:global?esperados:null,totalEsperado:global?totalEsperado:null,paginas:pp,records:[]};
   const crudos=pp.flatMap(pg=>pg.records.map((r,i)=>({...r,pagina:pg.numero,ordinal_pagina:i+1})));await prepararAsociacion(crudos,t);
   p.records=asociar(crudos);p.validacion=cfg.core.revisarBanco(p,paginas.map(x=>x.texto).join('\n'));
   await guardar(p,t);
   for(const pg of pp.filter(x=>x.pendiente)){exigir(t);await completarInterno(pg.numero,t);}
   return estado.archivo;
  }
  async function subir(files){return tarea(async t=>{const resultados=[];
   for(const file of files){exigir(t);let a;
    try{if(!/\.pdf$/i.test(file.name)||!(file.size>0&&file.size<=12582912))throw Error('Se admite PDF de hasta 12 MB');const b=await file.arrayBuffer();
     a=await archivar(b,file.name,estado.contexto,t);estado.archivo=a;estado.previa=null;if(!estado.archivos.some(x=>x.id===a.id))estado.archivos.unshift(a);avisar();await leerInterno(a,b,t);resultados.push({id:a.id,estado:estado.archivo.estado});
    }catch(e){if(!vigente(t))throw e;if(a){estado.archivo=await rpc('ERROR',{archivo_id:a.id,revision:estado.archivo?.id===a.id?estado.archivo.revision:a.revision,error:e.message},t);}resultados.push({id:a?.id,error:e.message});}
   }avisar();return resultados;});}
  async function completar(pagina){return tarea(t=>completarInterno(pagina,t));}
  async function recuperar(id){return tarea(async t=>{const f=estado.anteriores?.find(x=>x.id===id);if(!f)throw Error('Original anterior no disponible en este contexto');const bytes=await bytesOriginal(f,t);const a=await archivar(bytes,f.nombre,estado.contexto,t);estado.archivo=a;estado.previa=null;if(!estado.archivos.some(x=>x.id===a.id))estado.archivos.unshift(a);return leerInterno(a,bytes,t);});}
  async function reanudar(){return tarea(async t=>{const a=estado.archivo;if(!a)throw Error('Selecciona un original');return leerInterno(a,await bytesOriginal(a,t),t);});}
  async function editar(i,cambios){return tarea(t=>{const p=copia(estado.archivo.propuesta);if(!p.records[i])throw Error('La operación no existe');p.records[i]={...p.records[i],...cambios};return guardar(p,t);});}
  async function revisar(){return tarea(async t=>{const a=estado.archivo;estado.previa=await rpc('PREVISUALIZAR',{archivo_id:a.id,revision:a.revision},t);avisar();return estado.previa;});}
  async function confirmar(confirmaciones){return tarea(async t=>{const a=estado.archivo;if(!estado.previa||estado.previa.revision!==a.revision)throw Error('Actualiza la vista previa antes de confirmar');
   let r;try{r=await rpc('CONFIRMAR',{archivo_id:a.id,revision:a.revision,confirmado:true,confirmaciones},t);}
   catch(error){
    exigir(t);let guardado;try{guardado=await rpc('ABRIR',{archivo_id:a.id},t);}catch{throw error;}
    estado.archivo=guardado;estado.previa=null;
    const porFila=new Map((guardado.resoluciones||[]).map(x=>[x.fila||x.resultado?.fila,x.resultado]));
    if(!confirmaciones.some(c=>porFila.has(c.fila)))throw error;
    r={archivo_id:a.id,recuperado:true,resultados:confirmaciones.map(c=>porFila.get(c.fila)||{fila:c.fila,estado:'ERROR_RECUPERABLE',explicacion:'No hay confirmación guardada para esta operación. Revisa y reintenta sólo este pendiente.'})};
   }
   estado.resultados=r.resultados;estado.archivo=await rpc('ABRIR',{archivo_id:a.id},t);estado.previa=null;avisar();await cfg.onConfirmed?.(r,estado);return r;});}
  function cerrar(){secuencia++;estado=null;cacheBytes.clear();avisar();}
  return Object.freeze({abrir,reintentar,mas,seleccionar,subir,completar,recuperar,reanudar,editar,revisar,confirmar,cerrar,estado:()=>estado,ocupado:()=>ocupado});
 }
 return Object.freeze({crear,combinarPagina,llave});
});
