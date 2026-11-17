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
  async function rpc(accion,j,t=secuencia){exigir(t);const r=await cfg.rpc('control_importacion_bancaria',{p_accion:accion,p_datos:j});exigir(t);if(r.error){const e=Error(r.error.message||'No se confirmó la operación bancaria');e.code=r.error.code;throw e;}if(!r.data)throw Error('Respuesta bancaria incompleta');return r.data;}
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
  // Marcar o desmarcar todas: un solo guardado de la propuesta (las conciliadas conservan su lectura; sólo cambia «seleccionado»).
  async function marcarTodas(valor){return tarea(t=>{const p=copia(estado.archivo.propuesta);if(!p.records?.length)throw Error('No hay operaciones');
   if(p.records.every(r=>!!r.seleccionado===!!valor))return estado.archivo;p.records=p.records.map(r=>({...r,seleccionado:!!valor}));return guardar(p,t);});}
  // Confirmación global: sólo operaciones listas y marcadas, con la misma acción CONFIRMAR (revalidación de huellas, subtransacción
  // por operación, idempotencia del servidor). Tramos secuenciales para no exceder el límite por llamada.
  const LISTAS=new Set(['LISTO','YA_CONCILIADO']),FINALES=new Set(['CONCILIADO','CONCILIADO_REUTILIZADO','CHEQUE_CANCELADO']),TRAMO=20;
  const categoria=p=>p.estado==='DUPLICADO_EN_ARCHIVO'?'DUPLICADO':p.accion_cheque==='CONFIRMAR_CANCELACION'||/CHEQUE/.test(p.estado)?'CHEQUE':['PAGO_PARCIAL','EXCEDENTE'].includes(p.estado)?'IMPORTE':'REVISION';
  function resumenListas(){
   const a=estado?.archivo,pv=estado?.previa;if(!a||!pv||pv.revision!==a.revision)return null;
   const recs=a.propuesta?.records||[],hechas=new Map((estado.resultados||[]).map(r=>[r?.fila,r])),listas=[],excluidas={CHEQUE:[],IMPORTE:[],REVISION:[],DUPLICADO:[]};let conciliadas=0,desmarcadas=0;
   for(const p of pv.filas){const r=recs[p.fila-1]||{};
    if(FINALES.has(hechas.get(p.fila)?.estado)){conciliadas++;continue;}
    if(!LISTAS.has(p.estado)||p.accion_cheque==='CONFIRMAR_CANCELACION'){excluidas[categoria(p)].push({fila:p.fila,titular:r.titular||'Titular pendiente',motivo:p.explicacion||p.motivo||p.estado});continue;}
    if(!r.seleccionado){desmarcadas++;continue;}
    listas.push({fila:p.fila,huella:p.huella,titular:r.titular||'',importe:r.importe});
   }
   return{listas,excluidas,conciliadas,desmarcadas,importe:listas.reduce((x,y)=>x+(Number(y.importe)||0),0)};
  }
  const totalesLote=l=>{const t={CONFIRMADO:0,YA_EXISTENTE:0,FALLIDO:0,PENDIENTE:0,total:0,procesados:0};for(const x of Object.values(l.filas)){t.total++;t[x.estado==='PROCESANDO'?'PENDIENTE':x.estado]++;if(!['PENDIENTE','PROCESANDO'].includes(x.estado))t.procesados++;}return t;};
  const sinPermiso=e=>e?.code==='42501'||/permiso|Cambió el centro o la sesión/i.test(e?.message||'');
  let loteEnCurso=null,numLote=0;
  function confirmarListas(){return loteEnCurso||=loteBanco(false).finally(()=>{loteEnCurso=null;});}
  function reintentarFallidas(){return loteEnCurso||=loteBanco(true).finally(()=>{loteEnCurso=null;});}
  function loteBanco(soloFallidas){return tarea(async t=>{
   if(!estado.archivo)throw Error('Selecciona un original');if(!estado.puede_importar)throw Error('Tu cuenta no puede importar en este centro');
   if(soloFallidas&&!estado.lote)throw Error('No hay un lote previo para reintentar');
   const id=estado.archivo.id;
   // Revalida la versión: vista previa de la revisión vigente antes de confirmar.
   if(!estado.previa||estado.previa.revision!==estado.archivo.revision){estado.previa=await rpc('PREVISUALIZAR',{archivo_id:id,revision:estado.archivo.revision},t);avisar();}
   let res=resumenListas(),l=estado.lote,filas;
   if(soloFallidas){const f=new Set(Object.keys(l.filas).filter(k=>l.filas[k].estado==='FALLIDO').map(Number));filas=res.listas.filter(x=>f.has(x.fila));
    for(const k of f)l.filas[k]=filas.some(x=>x.fila===k)?{...l.filas[k],estado:'PENDIENTE',motivo:null}:{...l.filas[k],estado:'PENDIENTE',motivo:'Ya no está lista en la vista previa; revísala'};}
   else{l=estado.lote={id:'B'+(++numLote),archivo_id:id,filas:{},excluidas:res.excluidas};filas=res.listas;for(const x of filas)l.filas[x.fila]={estado:'PENDIENTE',titular:x.titular};}
   l.detenido=null;l.en_curso=true;l.totales=totalesLote(l);avisar();
   const detener=m=>{l.detenido||=m;};
   const anotar=(rs,repetido)=>{for(const rr of rs||[]){const f=l.filas[rr.fila];if(!f)continue;
    if(FINALES.has(rr.estado))Object.assign(f,{estado:repetido||rr.estado==='CONCILIADO_REUTILIZADO'?'YA_EXISTENTE':'CONFIRMADO',motivo:repetido?'Ya conciliada':rr.estado==='CONCILIADO_REUTILIZADO'?'Pago existente reutilizado':null});
    else if(rr.estado==='ERROR_RECUPERABLE')Object.assign(f,{estado:'FALLIDO',motivo:rr.explicacion||'Error recuperable'});
    else Object.assign(f,{estado:'PENDIENTE',motivo:rr.explicacion||rr.estado});}};
   const enviar=async tramo=>{for(let intento=0;;intento++){
    try{return await rpc('CONFIRMAR',{archivo_id:id,revision:estado.archivo.revision,confirmado:true,confirmaciones:tramo.map(x=>({fila:x.fila,huella:x.huella}))},t);}
    catch(e){
     if(intento>0||!/FUENTES_CAMBIARON|cambió en otra sesión/.test(e.message))throw e;
     // La versión cambió: nueva vista previa; sólo siguen las que continúan listas.
     estado.archivo=await rpc('ABRIR',{archivo_id:id},t);estado.previa=await rpc('PREVISUALIZAR',{archivo_id:id,revision:estado.archivo.revision},t);
     const vig=new Map(resumenListas().listas.map(x=>[x.fila,x])),quedan=[];
     for(const x of tramo){const n=vig.get(x.fila);if(n)quedan.push(n);else Object.assign(l.filas[x.fila],{estado:'PENDIENTE',motivo:'Su vista previa cambió y ya no está lista; revísala'});}
     if(!quedan.length)return null;tramo.splice(0,tramo.length,...quedan);
    }}};
   try{
    // Cola de tramos: si el servidor agota su tiempo (revierte todo el tramo), el tramo se divide y se reintenta.
    const cola=[];for(let i=0;i<filas.length;i+=TRAMO)cola.push(filas.slice(i,i+TRAMO));
    for(let tramo;(tramo=cola.shift());){
     if(!vigente(t)){detener('Cambió el centro o la sesión; el lote se detuvo sin mezclar resultados.');break;}
     for(const x of tramo)l.filas[x.fila].estado='PROCESANDO';l.totales=totalesLote(l);avisar();
     try{const r=await enviar(tramo);
      if(r){estado.archivo={...estado.archivo,revision:r.revision,estado:r.estado};anotar(r.resultados,r.repetido);for(const x of tramo)if(l.filas[x.fila].estado==='PROCESANDO')Object.assign(l.filas[x.fila],{estado:'PENDIENTE',motivo:'No marcada en el servidor'});}
     }catch(e){
      if(e.code==='57014'||/statement timeout/i.test(e.message)){
       if(tramo.length>1){const m=Math.ceil(tramo.length/2);for(const x of tramo)l.filas[x.fila].estado='PENDIENTE';cola.unshift(tramo.slice(0,m),tramo.slice(m));l.totales=totalesLote(l);avisar();continue;}
       Object.assign(l.filas[tramo[0].fila],{estado:'FALLIDO',motivo:'El servidor agotó su tiempo de espera; reintenta esta operación.'});l.totales=totalesLote(l);avisar();continue;
      }
      if(sinPermiso(e)||!vigente(t)){for(const x of tramo)Object.assign(l.filas[x.fila],{estado:'PENDIENTE',motivo:e.message});detener(e.message);break;}
      // Respuesta perdida: consulta lo guardado antes de marcar fallo.
      let g=null;try{g=await rpc('ABRIR',{archivo_id:id},t);}catch{}
      if(g)estado.archivo=g;const guardadas=new Map((g?.resoluciones||[]).map(x=>[x.fila||x.resultado?.fila,x.resultado]));
      for(const x of tramo){const rr=guardadas.get(x.fila);if(FINALES.has(rr?.estado))Object.assign(l.filas[x.fila],{estado:'CONFIRMADO',motivo:'Respuesta recuperada del servidor'});else Object.assign(l.filas[x.fila],{estado:'FALLIDO',motivo:e.message});}
     }
     l.totales=totalesLote(l);avisar();
    }
    if(l.detenido)for(const x of Object.values(l.filas))if(x.estado==='PENDIENTE'&&!x.motivo)x.motivo=l.detenido;
    if(vigente(t)){estado.archivo=await rpc('ABRIR',{archivo_id:id},t);estado.resultados=estado.archivo.resoluciones?.map(r=>r.resultado)||[];estado.previa=null;}
    if(l.totales.CONFIRMADO+l.totales.YA_EXISTENTE)await cfg.onConfirmed?.({archivo_id:id,lote:true,resultados:estado.resultados},estado);
    return l;
   }finally{l.en_curso=false;l.totales=totalesLote(l);}
  });}
  function cerrar(){secuencia++;estado=null;cacheBytes.clear();avisar();}
  return Object.freeze({abrir,reintentar,mas,seleccionar,subir,completar,recuperar,reanudar,editar,marcarTodas,revisar,confirmar,resumenListas,confirmarListas,reintentarFallidas,cerrar,estado:()=>estado,ocupado:()=>ocupado});
 }
 return Object.freeze({crear,combinarPagina,llave});
});
