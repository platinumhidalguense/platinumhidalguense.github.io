/* =====================================================================
   78 · TABLERO EJECUTIVO — CONTROLADOR DEL CLIENTE
   Estado de filtros, consultas a `control_tablero` (sb.rpc), caché por
   sesión y permisos, invalidación por turno, detalle bajo demanda y
   paginado, navegación al detalle (ficha, obligación, cierre, pago,
   evidencia autorizada), regreso con filtros y desplazamiento, y
   exportación filtrada del tablero (distinta del respaldo integral).
   No calcula medidas: las define 83-tablero-modelo.js y las calcula el
   servidor; la pintura es de 84-tablero-vista.js. Ver docs del equipo.
   ===================================================================== */
(function(G){
 'use strict';
 if(!G)return;
 const VERSION='2026-11-11.1',RPC='control_tablero';
 const BASE={por_pagina:50,por_pagina_export:500,concurrencia_export:3,ttl_ms:180000,max_cache:60,debounce_filtros_ms:220,
  debounce_busqueda_ms:350,tiempo_max_ms:45000,vigencia_minutos:15,vigilancia_ms:1500,hoy:null,limite_filas_hoja:1000000};
 let CFG={...BASE};

 /* ---------------- Acceso a la plataforma (globales del script concatenado) ---------------- */
 const X={
  sb:()=>typeof sb!=='undefined'?sb:null,
  user:()=>typeof USER!=='undefined'?USER:null,
  obra:()=>typeof OBRA!=='undefined'?OBRA:null,
  obras:()=>typeof OBRAS!=='undefined'&&Array.isArray(OBRAS)?OBRAS:[],
  empresa:()=>typeof EMPRESA_ACTIVA!=='undefined'?EMPRESA_ACTIVA:null,
  empresas:()=>typeof EMPRESAS!=='undefined'&&EMPRESAS?EMPRESAS:{},
  workers:()=>typeof WORKERS!=='undefined'&&Array.isArray(WORKERS)?WORKERS:[],
  docsx:()=>typeof DOCSX!=='undefined'&&Array.isArray(DOCSX)?DOCSX:[],
  vip:()=>{try{return typeof esVip==='function'&&!!esVip();}catch(e){return false;}},
  admin:()=>{try{return typeof esAdmin==='function'&&!!esAdmin();}catch(e){return false;}}
 };
 const doc=()=>G.document||null;
 const $id=id=>doc()?doc().getElementById(id):null;
 const E=s=>typeof esc==='function'?esc(s):String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const avisar=(m,c)=>{try{if(typeof toast==='function')toast(m,c||'');}catch(e){}};
 const V=()=>G.PLATINUM_TABLERO_VISTA||null,M=()=>G.PLATINUM_TABLERO_MODELO||null;
 const reloj=()=>G.performance&&typeof G.performance.now==='function'?G.performance.now():Date.now();
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
 const r2=v=>Math.round(v*100)/100;
 const clon=v=>v===undefined?v:JSON.parse(JSON.stringify(v));
 const errorT=(codigo,mensaje)=>Object.assign(Error(mensaje),{codigo});
 const empresaDe=o=>{try{if(typeof empresaDeObra==='function')return empresaDeObra(o);}catch(e){}return String(o&&o.empresa_codigo||'PLATINUM').toUpperCase();};
 const nombreEmpresa=k=>{try{if(X.empresas()[k]&&typeof razonSocialEmpresa==='function')return razonSocialEmpresa(k);}catch(e){}return (X.empresas()[k]||{}).nombre||k||'—';};
 const entero=n=>Number(n||0).toLocaleString('es-MX');

 /* ---------------- Fechas y calendario interno de cada centro ---------------- */
 const fechaOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
 const dU=s=>new Date(String(s).slice(0,10)+'T12:00:00Z');
 const sumarDias=(s,n)=>{const d=dU(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const ultimoDia=(y,m)=>new Date(Date.UTC(y,m,0,12)).getUTCDate();
 const fmtFecha=v=>{const m=String(v||'').match(/^(\d{4})-(\d\d)-(\d\d)/);return m?`${m[3]}/${m[2]}/${m[1]}`:(v?String(v):'');};
 const fc=s=>s?String(s).slice(8,10)+'/'+String(s).slice(5,7):'';
 function hoyMx(){
  if(fechaOK(CFG.hoy))return CFG.hoy;
  const C=M()&&M().calendario;try{if(C&&C.fechaLocal)return C.fechaLocal(new Date().toISOString());}catch(e){}
  return typeof today==='function'?today():new Date().toISOString().slice(0,10);
 }
 function inicioObra(o){const C=M()&&M().calendario;if(C&&C.inicioObra)return C.inicioObra(o);return fechaOK(o&&o.fecha_inicio)?String(o.fecha_inicio).slice(0,10):'2026-03-30';}
 function semanaInterna(o,fecha){const C=M()&&M().calendario;if(C&&C.semanaInterna)return C.semanaInterna(o,fecha);return Math.floor(Math.round((dU(fecha)-dU(inicioObra(o)))/86400000)/7)+1;}
 function periodoCentro(o,fecha,per){
  const C=M()&&M().calendario,n=semanaInterna(o,fecha);
  if(C&&C.periodo)return C.periodo(o,n,per);
  const d=sumarDias(inicioObra(o),(n-1)*7);
  if(per==='QUINCENAL'){const y=+fecha.slice(0,4),m=+fecha.slice(5,7),mm=fecha.slice(5,7),seg=+fecha.slice(8,10)>15;const h=seg?`${y}-${mm}-${String(ultimoDia(y,m)).padStart(2,'0')}`:`${y}-${mm}-15`;return {semana:n,periodicidad:per,desde:`${y}-${mm}-${seg?'16':'01'}`,hasta:h,fecha_pago:h};}
  return {semana:n,periodicidad:'SEMANAL',desde:d,hasta:sumarDias(d,6),fecha_pago:sumarDias(d,4)};
 }

 /* ---------------- Estado ---------------- */
 const S={abierto:false,raiz:null,host:null,turno:0,turnoDetalle:0,turnoExc:0,turnoPlant:0,ctx:null,filtros:null,vista:'GENERAL',
  datos:{},cargando:{},errores:{},detalle:null,excepciones:null,plantillaPedida:false,plantillaPagina:1,generacion:0,cache:new Map(),enVuelo:new Map(),
  tDebounce:null,tBusqueda:null,tVigilancia:null,metricas:[],red:{solicitudes:0,ms:0},renderMs:0,exportando:false,desactualizado:false,
  retorno:null,ultimoFoco:null,ultimoEl:null,origenApertura:null,pintaProgramada:false,pintaPendiente:false,observador:null,enfocarDetalle:false,focoPanel:null,cargaActual:null};
 const firmaPermisos=()=>{const u=X.user();return [u&&u.id||'',X.vip()?1:0,X.admin()?1:0].join('|');};
 const firmaContexto=()=>{const o=X.obra();return [firmaPermisos(),X.empresa()||'',o&&o.id||''].join('|');};
 const vigente=t=>{if(!S.abierto||t!==S.turno)return false;if(S.ctx!==firmaContexto()){Promise.resolve().then(vigilar);return false;}return true;};

 /* ---------------- Métricas ---------------- */
 function medir(ruta,t0){
  const inicio=t0??reloj(),sol=S.red.solicitudes,red=S.red.ms,ren=S.renderMs,e={ruta,inicio_ms:0};
  return {marca(n){e[n+'_ms']=r2(reloj()-inicio);},fin(estado='ok'){e.estado=estado;e.total_ms=r2(reloj()-inicio);e.solicitudes=S.red.solicitudes-sol;e.red_ms=r2(S.red.ms-red);e.render_ms=r2(S.renderMs-ren);
   S.metricas.push(e);if(S.metricas.length>120)S.metricas.shift();return e;}};
 }

 /* ---------------- Filtros ---------------- */
 const MULTI=['obras','contratistas','cuadrillas','periodicidades','periodos','conceptos','medios'];
 const CLAVES=['empresa','perspectiva','preset','desde','hasta','comparar',...MULTI];
 const PRESETS=['HISTORICO','ACUMULADO','EJERCICIO','MES','ACTUAL','QUINCENA','PERSONALIZADO'],ALIAS_PRESET={SEMANA:'ACTUAL'};
 const COMPARAR_RPC={PERIODO_ANTERIOR:'ANTERIOR',ANTERIOR:'ANTERIOR',ANIO_ANTERIOR:'ANIO_ANTERIOR',NINGUNO:null};
 function obrasLocales(empresa){return X.obras().filter(o=>o.activa!==false&&empresaDe(o)===empresa);}
 function obrasCatalogo(empresa){
  const c=S.datos.catalogos&&S.datos.catalogos.crudo,lista=c&&arr(c.obras).length?arr(c.obras).filter(o=>!o.empresa||o.empresa===empresa):[];
  return lista.length?lista.map(o=>({id:o.id,nombre:o.nombre,fecha_inicio:o.fecha_inicio,empresa_codigo:o.empresa})):obrasLocales(empresa);
 }
 function obrasDeFiltro(f){const todas=obrasCatalogo(f.empresa);if(!arr(f.obras).length)return todas;const ids=new Set(f.obras.map(String));
  const extra=X.obras().filter(o=>ids.has(String(o.id))&&!todas.some(t=>t.id===o.id));return todas.filter(o=>ids.has(String(o.id))).concat(extra);}
 function aplicarPreset(f){
  const hoy=hoyMx(),y=+hoy.slice(0,4),m=+hoy.slice(5,7),mm=hoy.slice(5,7);
  f.calendario=[];if(ALIAS_PRESET[f.preset])f.preset=ALIAS_PRESET[f.preset];
  switch(f.preset){
   case 'ACTUAL':case 'QUINCENA':{
    const per=f.preset==='QUINCENA'?'QUINCENAL':'SEMANAL',ps=obrasDeFiltro(f).map(o=>({o,p:periodoCentro(o,hoy,per)}));
    if(!ps.length){const p=periodoCentro({fecha_inicio:sumarDias(hoy,-((dU(hoy).getUTCDay()+6)%7))},hoy,per);f.desde=p.desde;f.hasta=p.hasta;break;}
    f.desde=ps.map(x=>x.p.desde).sort()[0];f.hasta=ps.map(x=>x.p.hasta).sort().slice(-1)[0];
    f.calendario=ps.map(x=>({obra_id:x.o.id,obra:x.o.nombre||x.o.id,semana:x.p.semana,periodicidad:per,desde:x.p.desde,hasta:x.p.hasta,fecha_pago:x.p.fecha_pago}));break;}
   case 'MES':f.desde=`${y}-${mm}-01`;f.hasta=`${y}-${mm}-${String(ultimoDia(y,m)).padStart(2,'0')}`;break;
   case 'EJERCICIO':f.desde=`${y}-01-01`;f.hasta=`${y}-12-31`;break;
   case 'ACUMULADO':f.desde=`${y}-01-01`;f.hasta=hoy;break;
   case 'HISTORICO':f.desde=obrasDeFiltro(f).map(inicioObra).sort()[0]||`${y}-01-01`;f.hasta=hoy;break;
   default:f.preset='PERSONALIZADO';
  }
  return f;
 }
 function presetInicial(obras){
  const o=X.obra();if(!o||obras.length!==1||obras[0]!==o.id)return 'ACTUAL';
  const act=X.workers().filter(w=>w.obra_id===o.id&&String(w.estatus||'').toUpperCase()==='ACTIVO');
  return act.length&&act.every(w=>String(w.periodo_pago||'').toUpperCase()==='QUINCENAL')?'QUINCENA':'ACTUAL';
 }
 function filtrosIniciales(op={}){
  const empresa=op.empresa||X.empresa()||'PLATINUM',o=X.obra();
  const obras=Array.isArray(op.obras)?op.obras.map(String):(o&&empresaDe(o)===empresa?[o.id]:[]);
  const f={empresa,obras,perspectiva:op.perspectiva==='PAGO'?'PAGO':'PERIODO',preset:PRESETS.includes(ALIAS_PRESET[op.preset]||op.preset)?(ALIAS_PRESET[op.preset]||op.preset):presetInicial(obras),desde:op.desde||null,hasta:op.hasta||null,
   comparar:op.comparar||'ANTERIOR',contratistas:[],cuadrillas:[],periodicidades:[],periodos:[],conceptos:[],medios:[]};
  if(op.desde&&op.hasta&&!op.preset)f.preset='PERSONALIZADO';
  return aplicarPreset(f);
 }
 function validar(f){
  if(!fechaOK(f.desde)||!fechaOK(f.hasta))return 'Indica fechas válidas en «Desde» y «Hasta».';
  if(f.desde>f.hasta)return 'La fecha «Desde» no puede ser posterior a «Hasta».';
  if(!['PERIODO','PAGO'].includes(f.perspectiva))return 'Perspectiva de fecha no reconocida.';
  return null;
 }
 const ordenar=xs=>[...new Set(arr(xs).filter(v=>v!==null&&v!==undefined&&v!=='').map(String))].sort();
 function filtrosRPC(f=S.filtros){
  return {empresa:f.empresa,obras:ordenar(f.obras),perspectiva:f.perspectiva,desde:f.desde,hasta:f.hasta,contratistas:ordenar(f.contratistas),cuadrillas:ordenar(f.cuadrillas),
   periodicidades:ordenar(f.periodicidades),periodos:ordenar(f.periodos).map(Number).filter(Number.isFinite).sort((a,b)=>a-b),conceptos:ordenar(f.conceptos),medios:ordenar(f.medios),
   comparar:COMPARAR_RPC[f.comparar]===undefined?'ANTERIOR':COMPARAR_RPC[f.comparar],preset:f.preset};
 }

 /* ---------------- Red: RPC con límite de tiempo, caché y deduplicación ---------------- */
 function mensajeError(e){
  const m=String(e&&(e.message||e.details||e.hint)||e||'');
  if(/42501|permission|permiso|no autorizado|NO_AUTORIZADO|not allowed/i.test(m))return 'No tienes permiso para consultar este alcance.';
  if(/Failed to fetch|NetworkError|network|conexi[oó]n/i.test(m))return 'Sin conexión con el servidor. Revisa tu conexión y reintenta.';
  if(/PGRST202|42883|could not find the function|does not exist/i.test(m))return 'El servicio del tablero aún no está disponible en el servidor.';
  return m||'Error desconocido del servidor.';
 }
 async function rpc(accion,datos){
  const cliente=X.sb();if(!cliente||typeof cliente.rpc!=='function')throw errorT('SIN_CLIENTE','No hay conexión con el servidor. Recarga la plataforma.');
  const t=reloj();S.red.solicitudes++;let id;
  const limite=new Promise((_,rej)=>{id=setTimeout(()=>rej(errorT('TIEMPO_AGOTADO','El servidor tardó demasiado en responder.')),CFG.tiempo_max_ms);});
  try{
   const r=await Promise.race([cliente.rpc(RPC,{p_accion:accion,p_datos:datos}),limite]);
   if(!r||r.error)throw errorT(r&&r.error&&r.error.code||'RPC',mensajeError(r&&r.error));
   if(!r.data||typeof r.data!=='object')throw errorT('RESPUESTA','Respuesta incompleta del servidor ('+accion+').');
   return r.data;
  }finally{clearTimeout(id);S.red.ms+=reloj()-t;}
 }
 function canon(v){if(Array.isArray(v))return '['+v.map(canon).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';return JSON.stringify(v);}
 const claveCache=(accion,datos)=>firmaPermisos()+'#'+accion+'#'+canon(datos);
 function deCache(k){const e=S.cache.get(k);if(!e)return null;if(reloj()-e.t>CFG.ttl_ms){S.cache.delete(k);return null;}S.cache.delete(k);S.cache.set(k,e);return e;}
 function aCache(k,data){S.cache.set(k,{t:reloj(),data});while(S.cache.size>CFG.max_cache)S.cache.delete(S.cache.keys().next().value);}
 async function consultar(accion,datos,op={}){
  const k=claveCache(accion,datos),usar=op.cache!==false;
  if(usar&&!op.forzar){const c=deCache(k);if(c)return {data:c.data,cache:true,clave:k};}
  // Una lectura forzada nunca reutiliza una pendiente; la caché sólo acepta respuestas de la generación vigente
  // (avisarCambio() abre una generación nueva y las lecturas anteriores ya no pueden quedar como vigentes).
  if(usar&&!op.forzar&&S.enVuelo.has(k))return S.enVuelo.get(k);
  const gen=S.generacion;
  const p=(async()=>{const data=await rpc(accion,datos);if(usar&&gen===S.generacion&&k.startsWith(firmaPermisos()+'#'))aCache(k,data);return {data,cache:false,clave:k,generacion:gen};})();
  if(usar)S.enVuelo.set(k,p);
  try{return await p;}finally{if(S.enVuelo.get(k)===p)S.enVuelo.delete(k);}
 }

 /* ---------------- Adaptación de la forma del modelo (76/RPC) a la vista (77) ----------------
    La vista (77) consume la forma del modelo: porcentajes en escala 0–100,
    severidades ROJO/AMBAR/INFO y unidades CHEQUES/EVENTOS. Aquí sólo se suben
    las llaves de navegación al nivel de la fila y se añaden alias de lectura. */
 const esA1=d=>!!(d&&typeof d.version==='string'&&/^TABLERO_/.test(d.version));
 const TIPOS_EXC={SIN_PAGO:'Sin pago',PAGO_PARCIAL:'Pago parcial',EXCEDENTE_APLICADO:'Excedente aplicado',CIERRE_PROVISIONAL:'Cierre provisional',ADSCRIPCION_PENDIENTE:'Adscripción pendiente',
  DIFERENCIA_FISCAL:'Diferencia fiscal',CFDI_CONTRADICTORIO:'CFDI contradictorio',POR_VINCULAR:'Por vincular',EXCEDENTE_NO_APLICADO:'Excedente sin aplicar',SIN_ASIGNAR:'Sin asignar',
  OPERACION_ANULADA:'Operación anulada',EFECTIVO_SIN_COMPROBANTE:'Efectivo sin comprobante',POSIBLE_DUPLICADO:'Posible duplicado',DEVOLUCION_O_REVERSO:'Devolución o reverso',
  REPRESENTACIONES_UNIFICADAS:'Representaciones unificadas',CHEQUE_POR_ENTREGAR:'Cheque por entregar',OPERACION_SOBREAPLICADA:'Operación sobreaplicada',TRANSFERENCIA_RECHAZADA:'Transferencia rechazada',
  TRANSFERENCIA_PENDIENTE_BANCO:'Pendiente de banco',CHEQUE_SIN_EXPEDIR:'Cheque sin expedir',CHEQUE_CANCELADO_SIN_REPONER:'Cheque cancelado sin reponer',DECLARADO_SIN_COMPROBANTE:'Declarado sin comprobante',
  APLICACION_RETIRADA:'Aplicación retirada',PERIODO_SIN_CIERRE:'Periodo sin cierre'};
 const ESTADO_PAGO={NO_EXIGIBLE:'No exigible',SIN_OBLIGACION:'Sin obligación',EXCEDENTE:'Con excedente',REGISTRADO_POR_CONCILIAR:'Registrado por conciliar',CONCILIADO:'Conciliado',PARCIAL:'Pago parcial',SIN_PAGO:'Sin pago'};
 const SITUACION={EXITOSA:'Exitosa',REVERTIDA:'Revertida',ANULADO:'Anulado',EXPEDIDO:'Expedido',ENTREGADO:'Entregado',DECLARADO:'Efectivo declarado'};
 function adaptarMedida(m){
  if(!m||typeof m!=='object'||Array.isArray(m))return m;
  const x={...m},d=m.desglose&&typeof m.desglose==='object'?m.desglose:null;
  if(d&&num(d.operaciones)!==null&&x.operaciones===undefined)x.operaciones=d.operaciones;
  if(d&&typeof d.etiqueta==='string'&&!x.etiqueta_alcance)x.etiqueta_alcance=d.etiqueta;
  if(m.disponible===false&&!x.motivo)x.motivo=m.motivo_no_disponible||null;
  return x;
 }
 function etiquetaPeriodo(per,desde,hasta,semanas){
  if(per==='QUINCENAL')return `Quincena ${fc(desde)}–${fc(hasta)}`;
  if(per==='SEMANA_DE_PAGO')return `Semana de pago ${fc(desde)}`;
  const s=[...new Set(arr(semanas))];return s.length===1?`S${s[0]} · ${fc(desde)}`:`Semana del ${fc(desde)}`;
 }
 const llavesArriba=f=>({...(f.llaves||{}),...f,pago_id:f.pago_id??(f.llaves&&f.llaves.pago_id)??arr(f.pago_ids)[0]??null});
 function adaptarExcepciones(x){
  return {...x,filas:arr(x.filas).map(f=>({...llavesArriba(f),tipo_texto:TIPOS_EXC[f.tipo]||f.tipo,motivo:f.motivo??f.descripcion}))};
 }
 function adaptarDetalle(d,spec){
  const grano=d.grano||spec&&spec.grano||'OBLIGACION';
  if(d.accion==='PLANTILLA'){const ev=d.eventos||{};return {grano:'MOVIMIENTO',titulo:spec&&spec.titulo,filas:arr(ev.filas).map(e=>({...e,movimiento:e.tipo,fecha_efectiva:e.fecha,obra:nombreObra(e.obra_id)})),total:ev.total,pagina:ev.pagina,por_pagina:ev.por_pagina};}
  const filas=arr(d.filas).map(f=>grano==='OPERACION'?{...llavesArriba(f),fecha:f.fecha_efectiva??f.fecha,aplicado:f.conciliado??f.aplicado,por_aplicar:f.pendiente_conciliacion??f.por_aplicar,estado_texto:SITUACION[f.situacion]||f.situacion,referencia:f.folio??f.referencia??null}
   :{...llavesArriba(f),medio:f.medio??f.metodo,neto_conciliado:f.neto_conciliado??f.importe,saldo_por_cubrir:f.saldo_por_cubrir??f.saldo,estado_texto:ESTADO_PAGO[f.estado_pago]||f.estado_pago||f.estado,
    cuadrilla_pendiente:f.cuadrilla_pendiente??(String(f.cuadrilla||'')===(M()&&M().ADSCRIPCION_PENDIENTE||'Adscripción histórica pendiente'))});
  return {...d,grano,titulo:spec&&spec.titulo,filas};
 }
 function agregarPlantilla(p){
  const ev=p.eventos||{},filas=arr(ev.filas),completo=num(ev.total)!==null&&filas.length>=num(ev.total),out={...p,medidas:{}};
  for(const [k,m] of Object.entries(p.medidas||{}))out.medidas[k]=adaptarMedida(m);
  if(!completo)return {...out,tendencia:null,por_centro:null};
  const g=new Map(),c=new Map(),obras=new Map(obrasCatalogo(S.filtros.empresa).concat(X.obras()).map(o=>[o.id,o]));
  for(const e of filas){
   const o=obras.get(e.obra_id)||{id:e.obra_id},p2=periodoCentro(o,e.fecha,'SEMANAL'),k=p2.desde;
   if(!g.has(k))g.set(k,{periodo:k,desde:p2.desde,hasta:p2.hasta,semanas:[],altas:0,bajas:0,reingresos:0});
   const x=g.get(k);x.semanas.push(p2.semana);if(p2.hasta>x.hasta)x.hasta=p2.hasta;
   if(!c.has(e.obra_id))c.set(e.obra_id,{clave:e.obra_id,etiqueta:nombreObra(e.obra_id),plantilla:null,altas:0,bajas:0,reingresos:0});
   const campo=e.tipo==='ALTA'?'altas':e.tipo==='BAJA'?'bajas':e.tipo==='REINGRESO'?'reingresos':null;if(campo){x[campo]++;c.get(e.obra_id)[campo]++;}
  }
  out.tendencia=[...g.values()].sort((a,b)=>a.desde<b.desde?-1:1).map(x=>({...x,etiqueta:etiquetaPeriodo('SEMANAL',x.desde,x.hasta,x.semanas)}));
  out.por_centro=[...c.values()];out.etiqueta_alcance=out.medidas.plantilla_actual&&out.medidas.plantilla_actual.etiqueta_alcance;
  return out;
 }
 function adaptar(fuente,d,spec){
  if(!esA1(d))return d;
  switch(fuente){
   case 'resumen':{const out={...d,medidas:{}};for(const [k,m] of Object.entries(d.medidas||{}))out.medidas[k]=adaptarMedida(m);
    out.calidad=arr(d.calidad).map(c=>({...c,obra:c.obra||nombreObra(c.obra_id)}));return out;}
   case 'excepciones':return adaptarExcepciones(d);
   case 'detalle':return adaptarDetalle(d,spec);
   case 'plantilla':return agregarPlantilla(d);
  }
  return d;
 }
 function nombreObra(id){
  const c=S.datos.catalogos&&S.datos.catalogos.crudo,o=arr(c&&c.obras).find(x=>x.id===id)||X.obras().find(x=>x.id===id);
  return o?(o.nombre||String(id)):String(id??'');
 }
 const ETQ_PER={SEMANAL:'Semanal',QUINCENAL:'Quincenal'},ETQ_CONC={NOMINA:'Nómina',FINIQUITO:'Finiquito',PREVISION_SOCIAL:'Previsión social',SIN_CONCEPTO:'Sin concepto'},
  ETQ_MEDIO={TRANSFERENCIA:'Transferencia',CHEQUE:'Cheque',EFECTIVO:'Efectivo','POR DEFINIR':'Por definir'};
 function catalogosVista(){
  const c=S.datos.catalogos&&S.datos.catalogos.crudo,op=(x,etq)=>typeof x==='object'&&x?{valor:String(x.clave??x.valor??x.id),etiqueta:String(x.etiqueta??x.nombre??x.clave??x.valor)}:{valor:String(x),etiqueta:etq?etq(x):String(x)};
  const emp=new Set(arr(c&&c.empresas).map(x=>typeof x==='object'?(x.valor??x.codigo??x.clave):x));X.obras().forEach(o=>emp.add(empresaDe(o)));if(S.filtros)emp.add(S.filtros.empresa);
  const obras=obrasCatalogo(S.filtros.empresa);
  return {empresas:[...emp].filter(Boolean).sort().map(k=>({valor:k,etiqueta:nombreEmpresa(k)})),
   obras:obras.map(o=>({valor:String(o.id),etiqueta:o.nombre||String(o.id),sub:'Inicio de calendario '+fmtFecha(inicioObra(o))})),
   contratistas:arr(c&&c.contratistas).map(x=>op(x)),cuadrillas:arr(c&&c.cuadrillas).map(x=>op(x)),
   periodicidades:arr(c&&c.periodicidades).map(x=>op(x,v=>ETQ_PER[v]||v)),periodos:arr(c&&c.periodos).map(x=>op(x,v=>'Semana interna '+v)),
   conceptos:arr(c&&c.conceptos).map(x=>op(x,v=>ETQ_CONC[v]||v)),medios:arr(c&&c.medios).map(x=>op(x,v=>ETQ_MEDIO[v]||v))};
 }

 /* ---------------- Carga por fuentes (tarjetas primero) ---------------- */
 const ACCION={catalogos:'CATALOGOS',resumen:'RESUMEN',tendencia:'TENDENCIA',comparativos:'COMPARATIVOS'};
 const NOMBRE={catalogos:'los catálogos de filtros',resumen:'los indicadores',tendencia:'la tendencia',comparativos:'los comparativos',excepciones:'las excepciones',detalle:'el detalle',plantilla:'la plantilla'};
 const datosFuente=f=>f==='catalogos'?{empresa:S.filtros.empresa}:filtrosRPC();
 function aplicarDatos(fuente,data,clave,cache,spec){
  S.datos[fuente]={valor:adaptar(fuente,data,spec),crudo:data,clave,recibido:new Date().toISOString(),cache:!!cache};
  delete S.errores[fuente];S.cargando[fuente]=false;
 }
 function aplicarError(fuente,e,clave){
  S.cargando[fuente]=false;S.errores[fuente]={mensaje:e.message||String(e),codigo:e.codigo||null,en:new Date().toISOString()};
  const d=S.datos[fuente];if(d){if(d.clave===clave)d.desactualizado=true;else delete S.datos[fuente];}
  alerta(`No se pudo leer ${NOMBRE[fuente]||fuente}: ${S.errores[fuente].mensaje} Usa «Reintentar».`);
 }
 async function pedirFuente(fuente,t,op={}){
  const accion=ACCION[fuente],datos=datosFuente(fuente),clave=claveCache(accion,datos);
  if(!op.forzar){const c=deCache(clave);if(c){aplicarDatos(fuente,c.data,clave,true);pintarPronto();return 'cache';}}
  S.cargando[fuente]=true;pintarPronto();
  try{
   const r=await consultar(accion,datos,op);
   if(!vigente(t))return 'descartada';
   aplicarDatos(fuente,r.data,clave,r.cache);
   if(fuente==='catalogos'&&S.filtros.preset!=='PERSONALIZADO'&&!S.datos.catalogos.ajustado){S.datos.catalogos.ajustado=true;const f=aplicarPreset({...S.filtros});
    if(f.desde!==S.filtros.desde||f.hasta!==S.filtros.hasta){S.filtros=f;}else S.filtros.calendario=f.calendario;}
   pintarPronto();return 'ok';
  }catch(e){if(!vigente(t))return 'descartada';aplicarError(fuente,e,clave);pintarPronto();return 'error';}
 }
 async function cargar(op={}){
  if(!S.abierto)return 'cerrado';
  const inval=validar(S.filtros);
  if(inval){S.errores.filtros={mensaje:inval};pintar();return 'invalido';}
  delete S.errores.filtros;
  const t=++S.turno,gen=S.generacion;S.ctx=firmaContexto();
  const met=medir(op.ruta||'carga',op.t0);
  const p=(async()=>{
   const f0=JSON.stringify(filtrosRPC());
   const fase1=await Promise.all(['catalogos','resumen'].map(k=>pedirFuente(k,t,op)));
   if(!vigente(t))return met.fin('descartada');
   if(JSON.stringify(filtrosRPC())!==f0){return cargar({...op,t0:op.t0??reloj()});} // el catálogo ajustó el calendario del rango
   pintar();met.marca('tarjetas');
   const fase2=await Promise.all(['tendencia','comparativos'].map(k=>pedirFuente(k,t,op)));
   if(!vigente(t))return met.fin('descartada');
   pintar();met.marca('tendencia_comparativos');
   const extra=[];
   if(S.detalle)extra.push(cargarDetalle({...op,t}));
   if(S.excepciones)extra.push(cargarExcepciones({...op,t}));
   if(S.vista==='PLANTILLA'&&S.plantillaPedida)extra.push(cargarPlantilla({...op,t}));
   await Promise.all(extra);
   if(!vigente(t))return met.fin('descartada');
   const errs=[...fase1,...fase2].filter(x=>x==='error').length;
   if(op.forzar&&!errs&&gen===S.generacion)S.desactualizado=false;
   pintar();
   if(!errs)anunciar(`Resultados actualizados: ${fechaHora(S.datos.resumen&&S.datos.resumen.crudo&&S.datos.resumen.crudo.actualizado_en)}.`);
   return met.fin(errs?'parcial':'ok');
  })();
  S.cargaActual=p;return p;
 }
 const fechaHora=v=>{if(!v)return 'sin dato';const F=V()&&V().formatos;try{if(F&&F.fechaHora)return F.fechaHora(v);}catch(e){}return String(v);};

 /* ---------------- Detalle, excepciones y plantilla bajo demanda ---------------- */
 const OPERACION=new Set(['pagado_registrado','pendiente_conciliacion','excedentes','sin_asignar','cheques_por_estado','trabajadores_con_pago','promedio_pagado_trabajador','mediana_pagado_trabajador']);
 const MOVIMIENTO=new Set(['plantilla_actual','altas','bajas','reingresos','rotacion']);
 const granoDe=m=>MOVIMIENTO.has(m)?'MOVIMIENTO':OPERACION.has(m)?'OPERACION':'OBLIGACION';
 const etiqueta=k=>{try{if(V()&&V().etiqueta)return V().etiqueta(k);}catch(e){}return k;};
 function ajusteDimension(dim,valor){
  if(valor===null||valor===undefined||valor==='')return {};
  switch(dim){
   case 'obra':return {obras:[String(valor)]};
   case 'contratista':return {contratistas:[String(valor)]};
   case 'medio':return {medios:[String(valor)]};
   // PERIODO: el filtro `medios` del modelo/RPC se aplica al método planeado de la obligación (pasaDims(o,a,'metodo')).
   case 'metodo_planeado':case 'metodo':return {medios:[String(valor)]};
   case 'cuadrilla':return {cuadrillas:[String(valor)]};
   case 'concepto':return {conceptos:[String(valor)]};
   case 'periodo':{if(fechaOK(valor))return {desde:String(valor),hasta:sumarDias(String(valor),6),preset:'PERSONALIZADO'};
    const [per,ini]=String(valor).split('|');if(fechaOK(ini))return {desde:ini,hasta:sumarDias(ini,per==='QUINCENAL'?14:6),...(['SEMANAL','QUINCENAL'].includes(per)?{periodicidades:[per]}:{})};return {};}
  }
  return {};
 }
 function datosDetalle(d){
  const s=d.spec,base={...filtrosRPC(),...s.ajuste};
  if(s.grano==='MOVIMIENTO')return {accion:'PLANTILLA',datos:{...base,pagina:d.pagina,por_pagina:d.por_pagina}};
  const x={...base,grano:s.grano,medida:s.medida,pagina:d.pagina,por_pagina:d.por_pagina};
  if(s.dimension){x.dimension=s.dimension;x.valor=s.valor;}
  if(d.busqueda)x.busqueda=d.busqueda;
  return {accion:'DETALLE',datos:x};
 }
 function abrirDetalle(clave,ctx={}){
  ctx=ctx||{};
  if(!clave&&ctx.fila)return mostrarFila(ctx.fila,ctx.origen);
  if(clave==='obligacion'&&ctx.fila)return abrirObligacion(ctx.id||ctx.fila.obligacion_id,ctx.fila);
  if(!clave&&!ctx.grano)return null;
  const medida=clave==='tendencia'||!clave?'neto_conciliado':clave,grano=ctx.grano||granoDe(medida),ajuste=ajusteDimension(ctx.dimension,ctx.valor);
  const titulo=[ctx.titulo||etiqueta(medida),ctx.etiqueta||(ctx.valor&&ctx.dimension?String(ctx.valor):'')].filter(Boolean).join(' · ');
  S.detalle={spec:{medida,grano,dimension:ctx.dimension||null,valor:ctx.valor??null,ajuste,titulo,origen:ctx.origen||null},pagina:1,por_pagina:CFG.por_pagina,busqueda:'',focoOrigen:claveFoco()||S.ultimoFoco||(ctx.origen==='indicador'?'kpi-'+medida:null)};
  S.enfocarDetalle=true;delete S.datos.detalle;
  return cargarDetalle();
 }
 async function cargarDetalle(op={}){
  const d=S.detalle;if(!d||!S.abierto)return null;
  const t=op.t??S.turno,td=++S.turnoDetalle,{accion,datos}=datosDetalle(d),clave=claveCache(accion,datos),met=medir('detalle');
  S.cargando.detalle=true;delete S.errores.detalle;pintarPronto();
  try{
   const r=await consultar(accion,datos,op);
   if(!vigente(t)||td!==S.turnoDetalle||S.detalle!==d){met.fin('descartada');return 'descartada';}
   aplicarDatos('detalle',r.data,clave,r.cache,d.spec);pintar();
   if(S.enfocarDetalle){S.enfocarDetalle=false;enfocarDetalle();}
   const v=S.datos.detalle.valor,pags=Math.max(1,Math.ceil((num(v.total)||0)/(num(v.por_pagina)||d.por_pagina)));
   anunciar(`Detalle de ${d.spec.titulo}: ${entero(v.total)} filas; página ${entero(v.pagina||d.pagina)} de ${entero(pags)}.`);
   met.fin();return 'ok';
  }catch(e){if(!vigente(t)||td!==S.turnoDetalle){met.fin('descartada');return 'descartada';}aplicarError('detalle',e,clave);pintar();met.fin('error');return 'error';}
 }
 function cerrarDetalle(){
  const k=S.detalle&&S.detalle.focoOrigen;S.detalle=null;S.turnoDetalle++;delete S.datos.detalle;delete S.errores.detalle;S.cargando.detalle=false;
  pintar();enfocarClave(k);anunciar('Detalle cerrado.');
 }
 function buscarDetalle(texto){
  if(!S.detalle)return;S.detalle.busqueda=String(texto||'').trim();S.turnoDetalle++;
  clearTimeout(S.tBusqueda);S.tBusqueda=setTimeout(()=>{if(S.detalle){S.detalle.pagina=1;cargarDetalle();}},CFG.debounce_busqueda_ms);
 }
 async function cargarExcepciones(op={}){
  if(!S.excepciones)S.excepciones={pagina:1,por_pagina:CFG.por_pagina};
  const x=S.excepciones,t=op.t??S.turno,te=++S.turnoExc,datos={...filtrosRPC(),pagina:x.pagina,por_pagina:x.por_pagina},clave=claveCache('EXCEPCIONES',datos);
  S.cargando.excepciones=true;delete S.errores.excepciones;pintarPronto();
  try{
   const r=await consultar('EXCEPCIONES',datos,op);
   if(!vigente(t)||te!==S.turnoExc||S.excepciones!==x)return 'descartada';
   aplicarDatos('excepciones',r.data,clave,r.cache);pintar();anunciar(`Excepciones: ${entero(r.data.total)} en total.`);return 'ok';
  }catch(e){if(!vigente(t)||te!==S.turnoExc)return 'descartada';aplicarError('excepciones',e,clave);pintar();return 'error';}
 }
 async function cargarPlantilla(op={}){
  S.plantillaPedida=true;const t=op.t??S.turno,tp=++S.turnoPlant,base=filtrosRPC(),clave=claveCache('PLANTILLA',base);
  S.cargando.plantilla=true;delete S.errores.plantilla;pintarPronto();
  try{
   const r=await todasLasPaginas('PLANTILLA',base,{...op,lista:d=>d.eventos});
   if(!vigente(t)||tp!==S.turnoPlant)return 'descartada';
   aplicarDatos('plantilla',r.data,clave,false);pintar();return 'ok';
  }catch(e){if(!vigente(t)||tp!==S.turnoPlant)return 'descartada';aplicarError('plantilla',e,clave);pintar();return 'error';}
 }
 function paginar(fuente,n){
  const d=fuente==='detalle'?S.datos.detalle&&S.datos.detalle.valor:S.datos.excepciones&&S.datos.excepciones.valor;
  const por=num(d&&d.por_pagina)||CFG.por_pagina,total=num(d&&d.total),max=total===null?Infinity:Math.max(1,Math.ceil(total/por));
  const p=Math.min(max,Math.max(1,Math.trunc(Number(n))||1));
  if(fuente==='detalle'&&S.detalle){if(p===S.detalle.pagina&&S.datos.detalle)return null;S.detalle.pagina=p;return cargarDetalle();}
  if(fuente==='plantilla'){S.plantillaPagina=Math.max(1,Math.trunc(Number(n))||1);pintar();return null;}
  if(fuente==='excepciones'){if(!S.excepciones)S.excepciones={pagina:p,por_pagina:CFG.por_pagina};else{if(p===S.excepciones.pagina&&S.datos.excepciones)return null;S.excepciones.pagina=p;}return cargarExcepciones();}
  return null;
 }

 /* ---------------- Acciones de filtros, vista y actualización ---------------- */
 function cambiarFiltros(p){
  if(!p||typeof p!=='object'||!S.filtros)return null;
  if(p.paginas&&typeof p.paginas==='object'){for(const [k,n] of Object.entries(p.paginas))paginar(k,n);const {paginas,...resto}=p;p=resto;if(!Object.keys(p).length)return null;}
  const f={...S.filtros};
  for(const k of Object.keys(p))if(CLAVES.includes(k))f[k]=MULTI.includes(k)?ordenar(p[k]):p[k];
  if('empresa' in p&&p.empresa!==S.filtros.empresa){if(!('obras' in p))f.obras=[];for(const k of MULTI)if(k!=='obras'&&!(k in p))f[k]=[];delete S.datos.catalogos;}
  if(('desde' in p||'hasta' in p)&&!('preset' in p))f.preset='PERSONALIZADO';
  if(ALIAS_PRESET[f.preset])f.preset=ALIAS_PRESET[f.preset];
  if(!PRESETS.includes(f.preset))f.preset='PERSONALIZADO';
  if(f.preset!=='PERSONALIZADO'&&('preset' in p||'obras' in p||'empresa' in p))aplicarPreset(f);
  else if(f.preset==='PERSONALIZADO')f.calendario=[];
  const inval=validar(f);
  if(inval){S.errores.filtros={mensaje:inval};pintar();alerta(inval);return 'invalido';}
  delete S.errores.filtros;
  if(JSON.stringify(filtrosRPC(f))===JSON.stringify(filtrosRPC())&&f.preset===S.filtros.preset){S.filtros=f;return null;}
  S.filtros=f;S.turno++;
  if(S.detalle){S.detalle.pagina=1;S.turnoDetalle++;}
  if(S.excepciones){S.excepciones.pagina=1;S.turnoExc++;}
  for(const k of ['resumen','tendencia','comparativos'])S.cargando[k]=true;
  pintar();
  const t0=reloj();clearTimeout(S.tDebounce);
  return new Promise(res=>{S.tDebounce=setTimeout(()=>{res(cargar({ruta:'cambio-filtros',t0}));},CFG.debounce_filtros_ms);});
 }
 function restablecer(){
  const v=S.filtros;S.filtros=filtrosIniciales();S.detalle=null;delete S.datos.detalle;S.excepciones=null;delete S.datos.excepciones;
  if(v&&JSON.stringify(filtrosRPC(v))===JSON.stringify(filtrosRPC())){pintar();return null;}
  anunciar('Filtros restablecidos.');return cargar({ruta:'restablecer'});
 }
 function cambiarVista(v){
  const vistas=(V()&&arr(V().VISTAS).map(x=>x.clave))||['GENERAL','NOMINA_PAGOS','CONCILIACION','PLANTILLA'];
  if(!vistas.includes(v)||v===S.vista)return null;
  S.vista=v;pintar();
  if(v==='CONCILIACION'&&!S.excepciones)return cargarExcepciones();
  if(v==='PLANTILLA'&&!S.datos.plantilla)return cargarPlantilla();
  return null;
 }
 function reintentar(fuente='todo'){
  if(fuente==='todo')return cargar({forzar:true,ruta:'actualizar'});
  if(ACCION[fuente])return pedirFuente(fuente,S.turno,{forzar:true}).then(r=>{pintar();return r;});
  if(fuente==='detalle')return cargarDetalle({forzar:true});
  if(fuente==='excepciones')return cargarExcepciones({forzar:true});
  if(fuente==='plantilla')return cargarPlantilla({forzar:true});
  if(fuente==='filtros'){delete S.errores.filtros;S.filtros=filtrosIniciales();return cargar({ruta:'restablecer'});}
  return null;
 }
 /* Aviso del sincronizador en vivo (onDeferred): lo leído pudo cambiar. */
 function avisarCambio(){
  S.generacion++;S.cache.clear();S.enVuelo.clear();S.desactualizado=true;
  if(S.abierto){pintarPronto();anunciar('Hay cambios compartidos. Usa «Actualizar» para ver las cifras vigentes.');}
 }

 /* ---------------- Pintura, foco, anuncios y desplazamiento ---------------- */
 function estadoVista(){
  const d=k=>S.datos[k]?S.datos[k].valor:null,res=d('resumen');
  const comparativos=d('comparativos');
  const exc=d('excepciones'),det=d('detalle');
  return {filtros:{...S.filtros},catalogos:catalogosVista(),resumen:res,tendencia:d('tendencia'),comparativos,excepciones:S.excepciones?exc:null,detalle:S.detalle?det:null,plantilla:plantillaVista(d('plantilla')),
   vista:S.vista,cargando:{...S.cargando},errores:{...S.errores},actualizado_en:res&&res.actualizado_en||null,
   desactualizado:S.desactualizado||Object.values(S.datos).some(x=>x&&x.desactualizado),ahora:new Date().toISOString(),vigencia_minutos:CFG.vigencia_minutos,
   bajo_demanda:{excepciones:!S.excepciones,detalle:!S.detalle},controlador:VERSION};
 }
 /* Eventos de PLANTILLA: leídos completos para la serie; la tabla se muestra por páginas. */
 function plantillaVista(p){
  if(!p||!p.eventos)return p;const todos=arr(p.eventos.filas),por=CFG.por_pagina,max=Math.max(1,Math.ceil(todos.length/por)),pag=Math.min(max,Math.max(1,S.plantillaPagina||1));
  return {...p,eventos:{...p.eventos,filas:todos.slice((pag-1)*por,pag*por),total:todos.length,pagina:pag,por_pagina:por}};
 }
 const scrollers=()=>{const ov=S.raiz&&S.raiz.closest?S.raiz.closest('.overlay'):null;return [ov,S.host];};
 const leerScroll=()=>scrollers().map(x=>x?x.scrollTop||0:0);
 function restaurarScroll(v){if(!v)return;scrollers().forEach((x,i)=>{if(x&&num(v[i])!==null&&x.scrollTop!==v[i])x.scrollTop=v[i];});}
 function cubierto(){const m=$id('modals'),ov=S.raiz&&S.raiz.closest?S.raiz.closest('.overlay'):null;if(!m||!ov)return false;const l=m.querySelectorAll('.overlay');return l.length>0&&l[l.length-1]!==ov;}
 function observarRegreso(){
  const m=$id('modals');if(S.observador||!m||typeof G.MutationObserver!=='function')return;
  S.observador=new G.MutationObserver(()=>{if(!cubierto()){S.observador.disconnect();S.observador=null;if(S.pintaPendiente){S.pintaPendiente=false;pintar();}}});
  S.observador.observe(m,{childList:true});
 }
 function claveFoco(){const d=doc(),a=d&&d.activeElement;if(!a||!S.raiz||!S.raiz.contains(a))return null;return a.getAttribute&&(a.getAttribute('data-foco')||a.getAttribute('data-tablero-foco'))||null;}
 const css=s=>String(s).replace(/["\\]/g,'\\$&');
 function enfocarClave(k){
  if(!k||!S.host)return false;const el=S.host.querySelector(`[data-foco="${css(k)}"],[data-tablero-foco="${css(k)}"]`);
  if(el&&typeof el.focus==='function'){try{el.focus({preventScroll:true});}catch(e){el.focus();}return true;}return false;
 }
 function enfocarDetalle(){
  const s=S.host&&S.host.querySelector('section[aria-labelledby$="-det-t"]'),h=s&&s.querySelector('h3');
  if(!h)return false;h.setAttribute('tabindex','-1');try{h.focus({preventScroll:false});}catch(e){h.focus();}if(typeof h.scrollIntoView==='function')try{h.scrollIntoView({block:'start'});}catch(e){}return true;
 }
 function anunciar(t){const el=$id('tablero-aviso');if(el)el.textContent=t;}
 function alerta(t){const el=$id('tablero-alerta');if(el)el.textContent=t;}
 function pintarPronto(){if(S.pintaProgramada)return;S.pintaProgramada=true;Promise.resolve().then(()=>{if(S.pintaProgramada)pintar();});}
 function pintar(){
  S.pintaProgramada=false;
  if(!S.abierto||!S.host||!S.host.isConnected)return;
  if(cubierto()){S.pintaPendiente=true;observarRegreso();return;}
  const scroll=leerScroll(),foco=claveFoco(),t=reloj(),est=estadoVista(),vista=V();
  try{if(vista&&typeof vista.render==='function')vista.render(S.host,est,ACCIONES);else renderMinimo(S.host,est);}
  catch(e){if(typeof console!=='undefined')console.error('Tablero: falló la vista; se usa la pintura mínima',e);renderMinimo(S.host,est);}
  complementar(S.host);
  restaurarScroll(scroll);
  const d=doc();if(foco&&(!d.activeElement||!S.raiz.contains(d.activeElement)))enfocarClave(foco);
  S.renderMs+=reloj()-t;S.ultimoEstado=est;
 }
 /* Controles propios del controlador dentro de la vista: consulta bajo demanda y cierre del detalle. */
 function reemplazarVacio(sec,html){
  const v=sec.querySelector('.tb-vacio'),d=doc().createElement('div');d.innerHTML=html;const n=d.firstElementChild;
  if(v&&v.parentNode)v.parentNode.replaceChild(n,v);else sec.appendChild(n);
 }
 function complementar(host){
  if(!V())return;
  const exc=host.querySelector('section[aria-labelledby$="-exc-t"]');
  if(exc&&!S.excepciones&&!exc.querySelector('[data-tablero-accion]'))reemplazarVacio(exc,`<div class="tb-vacio" data-tablero-bajo-demanda="excepciones"><p class="tb-vacio-t">Excepciones bajo demanda</p><p>Se consultan sólo cuando las pides, por páginas de ${entero(CFG.por_pagina)} filas.</p><button type="button" class="btn" data-tablero-accion="cargar-excepciones" data-tablero-foco="cargar-excepciones">Consultar excepciones</button></div>`);
  const det=host.querySelector('section[aria-labelledby$="-det-t"]');if(!det)return;
  if(!S.detalle&&!det.querySelector('[data-tablero-accion]'))reemplazarVacio(det,`<div class="tb-vacio" data-tablero-bajo-demanda="detalle"><p class="tb-vacio-t">Detalle bajo demanda</p><p>Elige una cifra (indicador, barra o periodo) para ver sus filas, o consulta el detalle completo del alcance por páginas.</p><button type="button" class="btn" data-tablero-accion="detalle-general" data-grano="${S.vista==='PLANTILLA'?'MOVIMIENTO':'OBLIGACION'}" data-tablero-foco="detalle-general">Ver detalle ${S.vista==='PLANTILLA'?'de movimientos':'por obligación'}</button>${S.vista==='PLANTILLA'?'':' <button type="button" class="btn" data-tablero-accion="detalle-general" data-grano="OPERACION" data-tablero-foco="detalle-operacion">Ver detalle por operación</button>'}</div>`);
  else if(S.detalle&&!det.querySelector('[data-tablero-detalle-ctx]')){
   const h=det.querySelector('h3'),p=doc().createElement('p');p.className='tb-mut';p.setAttribute('data-tablero-detalle-ctx','');
   p.innerHTML=`Detalle de: <strong>${E(S.detalle.spec.titulo)}</strong>${S.detalle.busqueda?` · búsqueda «${E(S.detalle.busqueda)}»`:''} · <button type="button" class="tb-link" data-tablero-accion="cerrar-detalle" data-tablero-foco="cerrar-detalle">Cerrar detalle</button> <span class="tb-sr">(o pulsa Escape)</span>`;
   if(h&&h.nextSibling)h.parentNode.insertBefore(p,h.nextSibling);else det.appendChild(p);
  }
 }
 /* Pintura mínima si 77 no cargó: indicadores, errores con «Reintentar», detalle y exportación. */
 function renderMinimo(host,e){
  const med=e.resumen&&e.resumen.medidas||{},err=Object.entries(e.errores||{});
  const val=m=>m&&typeof m==='object'?(m.valor===null||m.valor===undefined?'No disponible':typeof m.valor==='number'?(m.unidad==='PORCENTAJE'?r2(m.valor)+'%':m.unidad==='MXN'?'$'+(typeof money==='function'?money(m.valor):m.valor):entero(m.valor)):'—'):String(m??'—');
  const det=e.detalle;
  host.innerHTML=`<section class="tb tb-minimo"><h2 id="tbm-titulo" tabindex="-1">Tablero ejecutivo</h2><p>Actualizado: ${E(fechaHora(e.actualizado_en))}${e.desactualizado?' · puede estar desactualizado':''}</p>
   ${err.map(([k,x])=>`<p role="alert">No se pudo leer ${E(NOMBRE[k]||k)}: ${E(x.mensaje)} <button type="button" class="btn" data-tablero-accion="reintentar" data-fuente="${E(k)}">Reintentar</button></p>`).join('')}
   <ul>${Object.entries(med).filter(([,m])=>m&&typeof m==='object'&&typeof m.valor!=='object').map(([k,m])=>`<li><button type="button" class="tb-enlace" data-tablero-accion="detalle" data-clave="${E(k)}" data-tablero-foco="kpi-${E(k)}">${E(etiqueta(k))}: ${E(val(m))}</button></li>`).join('')}</ul>
   <button type="button" class="btn dark" data-tablero-accion="exportar">Exportar Excel</button>
   <section aria-labelledby="tbm-det-t"><h3 id="tbm-det-t">Detalle</h3>${det?`<p>${entero(det.total)} filas · página ${entero(det.pagina)}</p><table><tbody>${arr(det.filas).map(f=>`<tr><td>${E(f.nombre||f.obra||'')}</td><td>${E(f.importe??'')}</td></tr>`).join('')}</tbody></table>
    <button type="button" class="btn" data-tablero-accion="pagina" data-pagina="${(num(det.pagina)||1)+1}">Siguiente</button>`:'<div class="tb-vacio"></div>'}</section></section>`;
 }

 /* ---------------- Paneles de drill-through (obligación, pago, fila) ---------------- */
 const CAMPOS={
  OBLIGACION:[['obra','Centro'],['periodicidad','Periodicidad'],['semana','Semana interna'],['periodo_desde','Periodo desde','FECHA'],['periodo_hasta','Periodo hasta','FECHA'],['fecha_pago','Fecha de pago programada','FECHA'],
   ['numero','No. trabajador'],['nombre','Trabajador'],['contratista','Contratista'],['cuadrilla','Cuadrilla'],['concepto','Concepto'],['metodo','Medio'],['estado_cierre','Estado del cierre'],
   ['importe','Neto conciliado','MXN'],['pagado_conciliado','Pagado conciliado','MXN'],['pendiente_conciliacion','Pendiente de conciliación','MXN'],['saldo','Saldo por cubrir','MXN'],['excedente','Excedentes','MXN'],['estado_texto','Estado de pago'],['respaldo_fiscal','Respaldo fiscal']],
  OPERACION:[['fecha_efectiva','Fecha efectiva','FECHA'],['fuente_fecha','Fuente de la fecha'],['obra','Centro'],['medio','Medio'],['semana','Semana interna'],['importe','Importe en el alcance','MXN'],
   ['conciliado','Pagado conciliado','MXN'],['pendiente_conciliacion','Pendiente de conciliación','MXN'],['excedente','Excedentes','MXN'],['sin_asignar','Sin asignar','MXN'],['estado_texto','Situación'],['representaciones','Representaciones']],
  EXCEPCION:[['tipo_texto','Tipo'],['severidad','Severidad'],['descripcion','Descripción'],['obra','Centro'],['numero','No. trabajador'],['nombre','Trabajador'],['semana','Semana interna'],['fecha','Fecha','FECHA'],['importe','Importe','MXN']]
 };
 const tipoFila=f=>f&&f.tipo&&f.descripcion!==undefined?'EXCEPCION':f&&f.operacion_id&&!f.obligacion_id||f&&f.fecha_efectiva!==undefined?'OPERACION':'OBLIGACION';
 function panel(titulo,fila,tipo){
  if(typeof modal2!=='function'){avisar(titulo,'');return null;}
  const a=doc().activeElement,dentro=a&&a!==doc().body&&S.raiz&&S.raiz.contains(a);S.focoPanel={clave:dentro?claveFoco():S.ultimoFoco,el:dentro?a:S.ultimoEl};
  const campos=CAMPOS[tipo].filter(([k])=>fila&&fila[k]!==undefined&&fila[k]!==null&&fila[k]!=='').map(([clave,etq,t])=>({clave,etiqueta:etq,tipo:t}));
  modal2(`<div class="m-head"><h2 id="tablero-panel-t" tabindex="-1">${E(titulo)}</h2><button type="button" class="x" data-tablero-panel="cerrar" aria-label="Cerrar ${E(titulo)}">×</button></div><div class="m-body" id="tablero-panel"></div>`,'md');
  const ovs=$id('modals').querySelectorAll('.overlay'),ov=ovs[ovs.length-1],cont=ov.querySelector('#tablero-panel');
  ov.setAttribute('data-tablero-panel-ov','');const m=ov.querySelector('.modal');if(m){m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-labelledby','tablero-panel-t');}
  const fil={...fila};
  if(V()&&typeof V().pintarDetalle==='function')V().pintarDetalle(cont,{fila:fil,titulo,campos},ACCIONES);
  else cont.innerHTML=`<dl>${campos.map(c=>`<dt>${E(c.etiqueta)}</dt><dd>${E(fil[c.clave])}</dd>`).join('')}</dl>`;
  const ids=[['obligacion_id','ID obligación'],['operacion_id','ID operación'],['cierre_id','ID cierre'],['pago_id','ID pago'],['cheque_id','ID cheque'],['evidencia_id','ID evidencia']].filter(([k])=>fil[k]);
  if(ids.length)cont.insertAdjacentHTML('beforeend',`<p class="tb-mut tablero-ids">${ids.map(([k,t])=>`${E(t)}: <code>${E(fil[k])}</code>`).join(' · ')}</p>`);
  const cerrar=()=>cerrarPanel(ov);
  ov.addEventListener('click',e=>{const b=e.target&&e.target.closest?e.target.closest('[data-tablero-panel="cerrar"]'):null;if(b){e.preventDefault();cerrar();}else if(e.target===ov)restaurarFocoPanel();});
  ov.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();cerrar();}});
  const h=ov.querySelector('#tablero-panel-t');if(h)try{h.focus({preventScroll:true});}catch(e){h.focus();}
  anunciar(titulo+' abierto.');
  return ov;
 }
 function restaurarFocoPanel(){const k=S.focoPanel||{};S.focoPanel=null;Promise.resolve().then(()=>{if(S.pintaPendiente&&!cubierto()){S.pintaPendiente=false;pintar();}if(k.el&&k.el.isConnected&&typeof k.el.focus==='function')k.el.focus({preventScroll:true});else enfocarClave(k.clave);});}
 function cerrarPanel(ov){if(!ov||!ov.isConnected)return;if(typeof closeModal2==='function')closeModal2();else ov.remove();restaurarFocoPanel();}
 function mostrarFila(fila,origen){const t=tipoFila(fila);return panel(t==='EXCEPCION'?'Excepción · '+(fila.tipo_texto||fila.tipo):t==='OPERACION'?'Operación de pago':'Obligación de pago',fila,t);}
 function abrirObligacion(id,fila){
  const f=fila&&(fila.obligacion_id===id||!id)?fila:{obligacion_id:id,...(fila||{})};
  return panel('Obligación de pago',{...f,obligacion_id:id||f.obligacion_id,estado_texto:f.estado_texto||ESTADO_PAGO[f.estado_pago]||f.estado_pago},'OBLIGACION');
 }
 function abrirPago(id,fila){
  const f={...(fila||{})};if(!f.pago_id&&!f.cheque_id){if(arr(f.pago_ids).includes(id))f.pago_id=id;else f.pago_id=id;}
  return panel(f.cheque_id&&(!f.pago_id||f.pago_id===f.cheque_id)?'Cheque registrado':'Pago registrado',{...f,estado_texto:f.estado_texto||SITUACION[f.situacion]||f.situacion},'OPERACION');
 }

 /* ---------------- Navegación al detalle operativo ---------------- */
 const confirmar=m=>typeof G.confirm==='function'?!!G.confirm(m):false;
 function elementoOrigen(){
  const d=doc(),a=d&&d.activeElement;if(a&&a!==d.body&&S.raiz&&S.raiz.contains(a))return a;
  const el=S.ultimoEl;if(el&&el.isConnected)return el;
  const k=S.ultimoFoco;return k&&S.raiz?S.raiz.ownerDocument.querySelector(`[data-foco="${css(k)}"],[data-tablero-foco="${css(k)}"]`):null;
 }
 async function cambiarCentro(obraId,texto){
  const destino=X.obras().find(o=>o.id===obraId);
  if(!destino){avisar('Ese centro no está en tu alcance.','err');return false;}
  if(!confirmar(`${texto} pertenece a «${destino.nombre}». Para abrirlo se cambiará el centro abierto; el tablero conserva tus filtros. ¿Continuar?`))return false;
  if(typeof selectObra!=='function'){avisar('No se puede cambiar de centro desde aquí.','err');return false;}
  try{await selectObra(destino.id);}catch(e){avisar('No se pudo abrir el centro: '+(e.message||e),'err');return false;}
  if(!X.obra()||X.obra().id!==destino.id){avisar('No se pudo abrir el centro de destino.','err');return false;}
  return true;
 }
 async function abrirTrabajador(id,fila){
  if(!id)return false;
  const obraId=fila&&fila.obra_id||null,actual=X.obra(),aqui=()=>X.workers().some(w=>w.id===id&&w.obra_id===(X.obra()&&X.obra().id));
  if(!aqui()){
   if(!obraId||(actual&&obraId===actual.id)){avisar('El trabajador no está en el padrón cargado de este centro.','err');return false;}
   if(!await cambiarCentro(obraId,`${fila&&fila.nombre||'El trabajador'}`))return false;
   if(!aqui()){avisar('El trabajador ya no está disponible en ese centro.','err');return false;}
  }
  if(!G.PLATINUM_FICHA||typeof G.PLATINUM_FICHA.abrir!=='function'){avisar('No cargó la ficha del trabajador. Recarga la plataforma.','err');return false;}
  // Ficha anidada (modal2) sobre el tablero: al volver quedan intactos filtros, vista y desplazamiento,
  // y la ficha devuelve el foco al control de origen (document.activeElement al abrir).
  const el=elementoOrigen();if(el&&typeof el.focus==='function')try{el.focus({preventScroll:true});}catch(e){el.focus();}
  await G.PLATINUM_FICHA.abrir(id,null,{ids:[id]});
  return true;
 }
 async function abrirCierre(id,fila){
  if(!id)return false;
  const F=G.PLATINUM_FLOWS;if(!F||typeof F.abrirCierre!=='function'){avisar('No cargó el flujo de cierres. Recarga la plataforma.','err');return false;}
  const obraId=fila&&fila.obra_id;
  if(obraId&&(!X.obra()||obraId!==X.obra().id)&&!await cambiarCentro(obraId,'El cierre'))return false;
  guardarRetorno('cierre');
  await F.abrirCierre(id);
  vigilar();
  return true;
 }
 async function abrirEvidencia(id,fila){
  const f=fila||{};
  if(f.evidencia_autorizada===false){avisar('No tienes permiso para ver esta evidencia.','err');return false;}
  const cliente=X.sb();if(!cliente){avisar('Sin conexión con el servidor.','err');return false;}
  const firmada=async(bucket,ruta)=>{const r=await cliente.storage.from(bucket).createSignedUrl(ruta,60);if(r.error||!r.data||!r.data.signedUrl)throw Error('No se pudo abrir el archivo privado.');G.open(r.data.signedUrl,'_blank','noopener,noreferrer');};
  try{
   if(f.documento_id){
    if(X.docsx().some(d=>d.id===f.documento_id)&&typeof verDoc==='function'){await verDoc(f.documento_id);return true;}
    const r=await cliente.from('documentos').select('id,archivo,anulado').eq('id',f.documento_id).maybeSingle();
    if(r.error||!r.data||r.data.anulado||!r.data.archivo){avisar('No tienes permiso para ver este documento o ya no está disponible.','err');return false;}
    await firmada('expedientes',r.data.archivo);return true;
   }
   let pago=f.pago_id||arr(f.pago_ids)[0]||null,cheque=f.cheque_id||null;
   if(!pago&&!cheque&&id){const r=await cliente.from('control_evidencias_pago').select('id,pago_id,cheque_id').eq('id',id).maybeSingle();
    if(r.error||!r.data){avisar('No tienes permiso para ver esta evidencia o ya no existe.','err');return false;}pago=r.data.pago_id;cheque=r.data.cheque_id;}
   if(pago){
    const r=await cliente.from('pagos').select('id,archivo').eq('id',pago).maybeSingle();
    if(r.error||!r.data){avisar('No tienes permiso para ver el comprobante de este pago.','err');return false;}
    if(!r.data.archivo){avisar('El pago no tiene comprobante bancario archivado.','err');return false;}
    if(G.PLATINUM_CONCILIADOR&&typeof G.PLATINUM_CONCILIADOR.archivoBancario==='function')await G.PLATINUM_CONCILIADOR.archivoBancario(r.data.archivo);
    else{const nuevo=String(r.data.archivo).startsWith('conciliacion-nomina/');await firmada(nuevo?'conciliacion-nomina':'expedientes',nuevo?String(r.data.archivo).slice('conciliacion-nomina/'.length):r.data.archivo);}
    return true;
   }
   if(cheque){abrirPago(cheque,{...f,cheque_id:cheque});return true;}
   avisar('La evidencia no tiene archivo asociado.','err');return false;
  }catch(e){avisar('No se pudo abrir la evidencia: '+(e.message||e),'err');return false;}
 }

 /* ---------------- Regreso al tablero tras navegar fuera ---------------- */
 function guardarRetorno(motivo){
  S.retorno={motivo,filtros:clon(S.filtros),vista:S.vista,detalle:S.detalle?{spec:clon(S.detalle.spec),pagina:S.detalle.pagina,por_pagina:S.detalle.por_pagina,busqueda:S.detalle.busqueda,focoOrigen:S.detalle.focoOrigen}:null,
   excepciones:S.excepciones?{...S.excepciones}:null,plantilla:S.plantillaPedida,scroll:leerScroll(),foco:S.ultimoFoco,permisos:firmaPermisos(),en:Date.now()};
 }
 function mostrarVolver(){
  const d=doc();if(!d||!d.body||$id('tablero-volver')||!S.retorno)return;
  const b=d.createElement('button');b.type='button';b.id='tablero-volver';b.className='btn dark tablero-volver tb-no-imprimir';
  b.textContent='← Volver al tablero';b.setAttribute('aria-label','Volver al tablero ejecutivo con los mismos filtros');
  b.setAttribute('style','position:fixed;right:16px;bottom:16px;z-index:90;box-shadow:0 6px 18px rgba(0,0,0,.25)');
  b.addEventListener('click',()=>{volver();});d.body.appendChild(b);
 }
 function quitarVolver(){const b=$id('tablero-volver');if(b)b.remove();}
 function volver(){return abrir({restaurar:true});}

 /* ---------------- Vigilancia de contexto (sesión, permisos, empresa y centro) ---------------- */
 function vigilar(){
  if(!S.abierto)return;
  if(!S.host||!S.host.isConnected){cerrado(false);return;}
  const f=firmaContexto();if(f!==S.ctx)cambioContexto(f);
 }
 function cambioContexto(f){
  const antes=String(S.ctx||'').split('|').slice(0,3).join('|'),ahora=f.split('|').slice(0,3).join('|');
  S.ctx=f;
  if(antes!==ahora){S.cache.clear();S.enVuelo.clear();S.datos={};S.errores={};S.cargando={};S.detalle=null;S.excepciones=null;S.plantillaPedida=false;S.retorno=null;S.filtros=filtrosIniciales();
   anunciar('Cambió la sesión o los permisos: el tablero se recargó con tu alcance vigente.');}
  return cargar({ruta:'cambio-contexto'});
 }
 function iniciarVigilancia(){detenerVigilancia();if(CFG.vigilancia_ms>0&&typeof setInterval==='function')S.tVigilancia=setInterval(vigilar,CFG.vigilancia_ms);}
 function detenerVigilancia(){if(S.tVigilancia){clearInterval(S.tVigilancia);S.tVigilancia=null;}}
 function cerrado(explicito){
  S.abierto=false;S.turno++;S.turnoDetalle++;S.turnoExc++;S.turnoPlant++;detenerVigilancia();clearTimeout(S.tDebounce);clearTimeout(S.tBusqueda);
  if(S.observador){S.observador.disconnect();S.observador=null;}
  if(explicito){S.retorno=null;const o=S.origenApertura;S.origenApertura=null;if(o&&o.isConnected&&typeof o.focus==='function')try{o.focus({preventScroll:true});}catch(e){}}
  else if(S.retorno)mostrarVolver();
 }
 function cerrar(){
  if(S.abierto&&S.raiz&&S.raiz.isConnected){
   const ov=S.raiz.closest('.overlay'),m=$id('modals'),todos=m?[...m.querySelectorAll('.overlay')]:[];
   if(todos.length>1&&todos[0]!==ov)ov.remove();else if(typeof closeModal==='function')closeModal();else if(ov)ov.remove();
  }
  cerrado(true);quitarVolver();
 }

 /* ---------------- Exportación filtrada del tablero ---------------- */
 async function todasLasPaginas(accion,base,op={}){
  const lista=op.lista||(d=>d),por=CFG.por_pagina_export;
  const p1=await consultar(accion,{...base,pagina:1,por_pagina:por},{cache:false});
  const l1=lista(p1.data)||{},total=num(l1.total);if(total===null)throw Error(`La respuesta de ${accion} no informa el total de filas.`);
  const filas=arr(l1.filas).slice(),paginas=Math.max(1,Math.ceil(total/por));
  for(let p=2;p<=paginas;p+=CFG.concurrencia_export){
   const lote=[];for(let q=p;q<Math.min(paginas+1,p+CFG.concurrencia_export);q++)lote.push(consultar(accion,{...base,pagina:q,por_pagina:por},{cache:false}).then(r=>({q,r})));
   for(const {q,r} of (await Promise.all(lote)).sort((a,b)=>a.q-b.q)){const l=lista(r.data)||{};if(num(l.total)!==total)throw errorT('INCONSISTENTE','El total de filas cambió durante la exportación.');filas.push(...arr(l.filas));}
  }
  if(filas.length!==total)throw errorT('INCONSISTENTE',`Se recibieron ${filas.length} de ${total} filas de ${accion}.`);
  const data=lista===op.lista&&op.lista?{...p1.data,eventos:{...l1,filas,pagina:1,por_pagina:total}}:{...p1.data,filas,pagina:1,por_pagina:total};
  return {data,total,paginas};
 }
 async function reunir(fr){
  const r0=await consultar('RESUMEN',fr,{cache:false});
  const [tend,comp]=await Promise.all([consultar('TENDENCIA',fr,{cache:false}),consultar('COMPARATIVOS',fr,{cache:false})]);
  const obl=await todasLasPaginas('DETALLE',{...fr,grano:'OBLIGACION'}),ope=await todasLasPaginas('DETALLE',{...fr,grano:'OPERACION'}),exc=await todasLasPaginas('EXCEPCIONES',fr);
  const r1=await consultar('RESUMEN',fr,{cache:false});
  const h0=r0.data.huella??canon(r0.data.medidas),h1=r1.data.huella??canon(r1.data.medidas);
  return {consistente:h0===h1,resumen:r1.data,tendencia:tend.data,comparativos:comp.data,obligaciones:obl,operaciones:ope,excepciones:exc};
 }
 const ESTILO={
  pct:()=>({...(typeof ST!=='undefined'?ST.cell:{}),numFmt:'0.0"%"',alignment:{horizontal:'right',vertical:'center'}}),
  ent:()=>({...(typeof ST!=='undefined'?ST.cell:{}),numFmt:'#,##0',alignment:{horizontal:'right',vertical:'center'}}),
  txt:()=>({...(typeof ST!=='undefined'?ST.cell:{}),numFmt:'@'})
 };
 /* Anti-fórmula: un texto que empieza con = + - @ (o tabulador/retorno) se escribe con apóstrofo inicial; los números no se tocan. */
 const antiFormula=v=>typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'"+v:v;
 function neutralizar(rows){return rows.map(r=>Array.isArray(r)?r.map(c=>c&&typeof c==='object'&&c.t==='s'?{...c,v:antiFormula(String(c.v))}:antiFormula(c)):r);}
 function celda(v,tipo){
  if(v===null||v===undefined||v==='')return '';
  switch(tipo){
   case 'id':return {t:'s',v:Array.isArray(v)?v.join(', '):String(v),z:'@'};
   case 'MXN':case 'PCT':case 'ENT':{const n=num(v);return n===null?String(v):n;}
   case 'FECHA':return fmtFecha(v);
   case 'BOOL':return v===true?'Sí':v===false?'No':String(v);
   case 'LISTA':return Array.isArray(v)?v.join(', '):typeof v==='object'?JSON.stringify(v):String(v);
   default:return typeof v==='object'?JSON.stringify(v):(typeof v==='number'?v:String(v));
  }
 }
 function estiloDe(tipo){
  if(typeof ST==='undefined')return {};
  return tipo==='MXN'?ST.money:tipo==='PCT'?ESTILO.pct():tipo==='ENT'?ESTILO.ent():tipo==='id'?ESTILO.txt():tipo==='FECHA'||tipo==='BOOL'?ST.cellC:ST.cell;
 }
 const n$=k=>etiqueta(k);
 const COLS={
  OBLIGACION:()=>[['obligacion_id','ID obligación','id'],['cierre_id','ID cierre','id'],['version_id','ID versión de cierre','id'],['obra_id','ID centro','id'],['obra','Centro'],['empresa','Razón social'],
   ['trabajador_id','ID trabajador','id'],['numero','No. trabajador','id'],['nombre','Trabajador'],['contratista','Contratista'],['fuente_adscripcion','Fuente de la adscripción'],['cuadrilla','Cuadrilla'],
   ['periodicidad','Periodicidad'],['semana','Semana interna','ENT'],['periodo_desde','Periodo desde','FECHA'],['periodo_hasta','Periodo hasta','FECHA'],['fecha_pago','Fecha de pago programada','FECHA'],
   ['concepto','Concepto'],['metodo','Medio de pago'],['estado_cierre','Estado del cierre'],['exigible','Exigible','BOOL'],['provisional','Provisional','BOOL'],
   ['importe',n$('neto_conciliado'),'MXN'],['pagado_conciliado',n$('pagado_conciliado'),'MXN'],['pendiente_conciliacion',n$('pendiente_conciliacion'),'MXN'],['pagado_registrado',n$('pagado_registrado'),'MXN'],
   ['saldo',n$('saldo_por_cubrir'),'MXN'],['excedente',n$('excedentes'),'MXN'],['estado_pago','Estado de pago'],['respaldo_fiscal','Respaldo fiscal'],['operaciones','IDs de operaciones','id']],
  OPERACION:()=>[['operacion_id','ID operación','id'],['medio','Medio de pago'],['obra_id','ID centro','id'],['obra','Centro'],['empresa','Razón social'],['trabajador_id','ID trabajador','id'],
   ['semana','Semana interna','ENT'],['fecha_efectiva','Fecha efectiva','FECHA'],['fuente_fecha','Fuente de la fecha'],['importe','Importe en el alcance','MXN'],['importe_operacion','Importe total de la operación','MXN'],
   ['conciliado',n$('pagado_conciliado'),'MXN'],['pendiente_conciliacion',n$('pendiente_conciliacion'),'MXN'],['excedente',n$('excedentes'),'MXN'],['sin_asignar','Sin asignar','MXN'],['situacion','Situación'],
   ['representaciones','Representaciones','ENT'],['origenes','Orígenes','LISTA'],['pago_ids','IDs de pago','id'],['cheque_id','ID cheque','id'],['num_cheque','Folio de cheque','id'],['folio','Folio bancario','id'],
   ['evidencia_id','ID evidencia','id'],['obligaciones','IDs de obligaciones','id']],
  EXCEPCION:()=>[['severidad','Severidad'],['tipo','Tipo'],['descripcion','Descripción'],['obra_id','ID centro','id'],['obra','Centro'],['trabajador_id','ID trabajador','id'],['numero','No. trabajador','id'],
   ['nombre','Trabajador'],['semana','Semana interna','ENT'],['fecha','Fecha','FECHA'],['importe','Importe','MXN'],['llaves.obligacion_id','ID obligación','id'],['llaves.cierre_id','ID cierre','id'],
   ['llaves.pago_id','ID pago','id'],['llaves.cheque_id','ID cheque','id'],['llaves.evidencia_id','ID evidencia','id'],['llaves.aplicacion_id','ID aplicación','id'],['llaves.operacion_id','ID operación','id']]
 };
 const leer=(f,k)=>k.includes('.')?k.split('.').reduce((o,p)=>o==null?o:o[p],f):f[k];
 function columnasCon(base,filas){
  const vistas=new Set(base.map(c=>c[0].split('.')[0])),extra=new Set();
  for(const f of filas)for(const k of Object.keys(f))if(!vistas.has(k))extra.add(k);
  return base.concat([...extra].sort().map(k=>[k,k,/(^|_)id$|_ids$/.test(k)?'id':undefined]));
 }
 function hojaTabla(wb,nombre,titulo,cols,filas,pie){
  const lim=CFG.limite_filas_hoja,partes=Math.max(1,Math.ceil(filas.length/lim)),hojas=[];
  for(let i=0;i<partes;i++){
   const tramo=filas.slice(i*lim,(i+1)*lim),rows=[[titulo+(partes>1?` (parte ${i+1} de ${partes})`:'')],cols.map(c=>c[1])],styles=[ST.title,ST.head];
   for(const f of tramo){rows.push(cols.map(c=>celda(leer(f,c[0]),c[2])));styles.push(cols.map(c=>estiloDe(c[2])));}
   if(pie&&i===partes-1){rows.push(cols.map((c,j)=>j===0?`TOTAL · ${entero(filas.length)} filas`:c[2]==='MXN'?r2(filas.reduce((s,f)=>s+(num(leer(f,c[0]))||0),0)):''));styles.push(cols.map(c=>c[2]==='MXN'?ST.totalMoney:ST.total));}
   const ws=buildSheet(neutralizar(rows),styles,cols.map(c=>c[2]==='id'?38:c[2]==='MXN'?18:Math.min(40,Math.max(12,String(c[1]).length+2))),[{s:{r:0,c:0},e:{r:0,c:Math.max(0,cols.length-1)}}]);
   if(rows.length>2&&typeof XLSX!=='undefined'&&XLSX.utils&&XLSX.utils.encode_range)ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1+tramo.length,c:cols.length-1}})};
   const n=(partes>1?`${nombre} ${i+1}`:nombre).slice(0,31);XLSX.utils.book_append_sheet(wb,ws,n);hojas.push(n);
  }
  return hojas;
 }
 const VISTA_MEDIDA=(estado,k)=>{try{if(V()&&V().medida)return V().medida(estado,k);}catch(e){}const m=estado.resumen&&estado.resumen.medidas&&estado.resumen.medidas[k]||{};return {clave:k,etiqueta:k,unidad:m.unidad||'MXN',valor:num(m.valor),definicion:m.definicion||'',formula:m.formula||'',variacion:m.variacion||null};};
 const TIPO_UNIDAD=u=>u==='PORCENTAJE'?'PCT':['PERSONAS','CONTEO','OPERACIONES','CHEQUES','EVENTOS','DIAS'].includes(u)?'ENT':u==='MXN'?'MXN':'';
 function cuadre(r,fr){
  const res=r.resumen.medidas||{},ob=r.obligaciones.data.filas,op=r.operaciones.data.filas,pago=fr.perspectiva==='PAGO',S2=(xs,f)=>r2(xs.reduce((s,x)=>s+(num(f(x))||0),0));
  const obR=pago?ob.filter(o=>o.exigible!==false&&o.fecha_pago>=fr.desde&&o.fecha_pago<=fr.hasta):ob;
  const personas=new Set(op.filter(o=>o.trabajador_id&&(pago?num(o.importe):(num(o.conciliado)||0)+(num(o.pendiente_conciliacion)||0))>0).map(o=>o.trabajador_id)).size;
  const lineas=[
   ['neto_conciliado',S2(obR,o=>o.importe),'DETALLE OBLIGACIONES · Σ '+n$('neto_conciliado')+(pago?' (fecha de pago programada en el rango)':''),pago&&fr.medios.length],
   ['saldo_por_cubrir',S2(obR,o=>o.saldo),'DETALLE OBLIGACIONES · Σ '+n$('saldo_por_cubrir'),pago&&fr.medios.length],
   ['pagado_conciliado',S2(op,o=>o.conciliado),'DETALLE OPERACIONES · Σ '+n$('pagado_conciliado')],
   ['pendiente_conciliacion',S2(op,o=>o.pendiente_conciliacion),'DETALLE OPERACIONES · Σ '+n$('pendiente_conciliacion')],
   ['excedentes',S2(op,o=>o.excedente),'DETALLE OPERACIONES · Σ '+n$('excedentes')],
   ['sin_asignar',S2(op,o=>o.sin_asignar),'DETALLE OPERACIONES · Σ sin asignar'],
   ['pagado_registrado',pago?S2(op,o=>o.importe):S2(op,o=>(num(o.conciliado)||0)+(num(o.pendiente_conciliacion)||0)),'DETALLE OPERACIONES · '+(pago?'Σ importe':'Σ (conciliado + pendiente)')],
   ['trabajadores_con_pago',personas,'DETALLE OPERACIONES · personas únicas con pago']
  ];
  return lineas.filter(([k])=>res[k]&&num(res[k].valor)!==null).map(([k,suma,fuente,noAplica])=>{const v=num(res[k].valor);
   return {clave:k,indicador:n$(k),resumen:v,detalle:suma,diferencia:r2(v-suma),fuente,resultado:noAplica?'NO APLICA':Math.round(v*100)===Math.round(suma*100)?'CUADRA':'NO CUADRA'};});
 }
 function construirLibro(r,fr){
  if(typeof XLSX==='undefined'||typeof buildSheet!=='function'||typeof ST==='undefined')throw Error('No cargó el componente de Excel. Recarga la plataforma.');
  const wb=XLSX.utils.book_new(),res=r.resumen,alc=res.alcance||{},estado={resumen:adaptar('resumen',res),filtros:S.filtros},ahora=new Date().toISOString();
  const P=V()&&V().PERSPECTIVAS||{},pr=(V()&&arr(V().PRESETS).find(x=>x[0]===fr.preset))||[fr.preset,fr.preset],cmp=res.comparable;
  const obrasAlc=arr(alc.obras).map(id=>({id,nombre:nombreObra(id)}));
  const cal=obrasAlc.map(o=>{const ob=obrasCatalogo(fr.empresa).concat(X.obras()).find(x=>x.id===o.id)||{id:o.id};const a=periodoCentro(ob,fr.desde,'SEMANAL'),b=periodoCentro(ob,fr.hasta,'SEMANAL');
   return [`Calendario interno · ${o.nombre}`,`Inicio ${fmtFecha(inicioObra(ob))} · semanas internas S${a.semana} a S${b.semana} (${fmtFecha(a.desde)} – ${fmtFecha(b.hasta)})`];});
  const lista=(k,xs,etq)=>[k,arr(xs).length?arr(xs).map(etq||String).join(', '):'Todos'];
  const rest=alc.restringido||{};
  const filtrosRows=[['TABLERO EJECUTIVO · EXPORTACIÓN FILTRADA',''],['Exportación del alcance filtrado del tablero; no sustituye al respaldo integral.',''],['Concepto','Valor'],
   ['Razón social',nombreEmpresa(fr.empresa)],['Centros en el alcance (resuelto por el servidor)',obrasAlc.map(o=>o.nombre).join(', ')||'Ninguno'],
   lista('Centros solicitados',fr.obras,id=>obrasAlc.some(o=>o.id===id)?nombreObra(id):'Centro fuera de tu alcance'),['Perspectiva de fecha',`${(P[fr.perspectiva]||{}).etiqueta||fr.perspectiva}: ${(P[fr.perspectiva]||{}).texto||''}`],
   ['Rango de fechas',`${fmtFecha(alc.desde||fr.desde)} – ${fmtFecha(alc.hasta||fr.hasta)}`],['Rango con nombre',pr[1]],...cal,
   ['Comparar contra',cmp&&cmp.desde?`${cmp.modo==='ANIO_ANTERIOR'?'Mismo periodo del año anterior':'Periodo anterior equivalente'}: ${fmtFecha(cmp.desde)} – ${fmtFecha(cmp.hasta)}${cmp.incompleto?' · incompleto ('+arr(cmp.motivos).join(', ')+')':''}`:'Sin comparación'],
   lista('Contratistas',fr.contratistas),lista('Cuadrillas',fr.cuadrillas),lista('Periodicidades',fr.periodicidades),lista('Semanas internas',fr.periodos),lista('Conceptos',fr.conceptos),lista('Medios de pago',fr.medios),
   ['Restricciones de acceso',[rest.prevision_social?'Previsión social no incluida (sin permiso)':'',rest.datos_internos?'Datos internos no incluidos':'',rest.obras_no_autorizadas?`${rest.obras_no_autorizadas} centro(s) solicitado(s) fuera de tu alcance`:''].filter(Boolean).join(' · ')||'Ninguna'],
   ['Actualizado (servidor)',fechaHora(res.actualizado_en)],['Huella de los datos',{t:'s',v:String(res.huella||''),z:'@'}],['Generado',fechaHora(ahora)],['Generado por',String((X.user()||{}).email||'')],
   ['Versión del modelo',String(res.version||'')],['Controlador del tablero',VERSION]];
  let ws=buildSheet(neutralizar(filtrosRows),[ST.title,ST.sub,ST.head,...filtrosRows.slice(3).map(()=>[ST.total,ST.cell])],[44,110],[{s:{r:0,c:0},e:{r:0,c:1}},{s:{r:1,c:0},e:{r:1,c:1}}]);
  XLSX.utils.book_append_sheet(wb,ws,'FILTROS');
  const orden=[...new Set([...Object.keys(V()&&V().MEDIDAS||{}),...Object.keys(res.medidas||{})])].filter(k=>res.medidas&&res.medidas[k]);
  const defs=orden.map(k=>{const m=VISTA_MEDIDA(estado,k),raw=res.medidas[k];return {clave:k,indicador:m.etiqueta,unidad:m.unidad,definicion:raw.definicion||m.definicion,formula:raw.formula||m.formula,grano:raw.grano||'',perspectiva:raw.perspectiva_aplicada||''};});
  const extrasDef=[...Object.entries(P).map(([k,p])=>({clave:'perspectiva:'+k,indicador:p.etiqueta,unidad:'',definicion:p.texto,formula:'',grano:'',perspectiva:k})),
   ...Object.entries(V()&&V().CALIDAD||{}).map(([k,c])=>({clave:'calidad:'+k,indicador:c.etiqueta,unidad:'',definicion:c.texto,formula:'',grano:'centro',perspectiva:''}))];
  hojaTabla(wb,'DEFINICIONES','Definiciones de las medidas',[['clave','Clave','id'],['indicador','Indicador'],['unidad','Unidad'],['definicion','Definición'],['formula','Fórmula'],['grano','Grano'],['perspectiva','Perspectiva aplicada']],defs.concat(extrasDef));
  const filasRes=orden.filter(k=>k!=='variacion').map(k=>{const m=VISTA_MEDIDA(estado,k),raw=estado.resumen.medidas[k]||{},tipo=TIPO_UNIDAD(m.unidad),v=raw.variacion||{};
   return {indicador:m.etiqueta,clave:k,valor:m.valor,unidad:m.unidad,comparable:raw.comparable&&typeof raw.comparable==='object'?raw.comparable.valor:null,abs:v.absoluta,pct:v.porcentaje,inc:v.incompleto,prov:raw.provisional,disp:raw.disponible!==false,motivo:raw.motivo||raw.motivo_no_disponible||'',tipo};});
  const resRows=[['Resumen de indicadores'],['Indicador','Clave','Valor','Unidad','Comparable','Variación absoluta','Variación %','Comparable incompleto','Provisional','Disponible','Motivo (no disponible)']],resSt=[ST.title,ST.head];
  for(const f of filasRes){resRows.push([f.indicador,{t:'s',v:f.clave,z:'@'},celda(f.valor,f.tipo),f.unidad,celda(f.comparable,f.tipo),celda(f.abs,f.tipo),celda(f.pct,'PCT'),f.inc===undefined?'':celda(f.inc,'BOOL'),celda(f.prov,'BOOL'),celda(f.disp,'BOOL'),f.motivo]);
   resSt.push([ST.cell,ESTILO.txt(),estiloDe(f.tipo),ST.cellC,estiloDe(f.tipo),estiloDe(f.tipo),ESTILO.pct(),ST.cellC,ST.cellC,ST.cellC,ST.cell]);}
  resRows.push(['Desgloses']);resSt.push(ST.sect);resRows.push(['Indicador','Componente','Valor']);resSt.push(ST.head);
  const plano=(pref,o,out)=>{for(const [k,v] of Object.entries(o||{})){if(v&&typeof v==='object'&&!Array.isArray(v))plano(pref+k+' · ',v,out);else if(Array.isArray(v))v.forEach((x,i)=>typeof x==='object'?plano(pref+k+' ['+(x.motivo||x.contratista||x.clave||i+1)+'] · ',x,out):out.push([pref+k,x]));else out.push([pref+k,v]);}return out;};
  for(const k of orden){const d=res.medidas[k].desglose;if(!d||typeof d!=='object')continue;for(const [c,v] of plano('',d,[])){resRows.push([n$(k),c,typeof v==='number'?v:String(v??'')]);resSt.push([ST.cell,ST.cell,typeof v==='number'?ESTILO.ent():ST.cell]);}}
  resRows.push(['Calidad por centro']);resSt.push(ST.sect);resRows.push(['Centro','Estado','Periodos esperados','Periodos autorizados','Periodos provisionales','Periodos faltantes','Errores']);resSt.push(ST.head);
  for(const c of arr(res.calidad)){resRows.push([c.obra||nombreObra(c.obra_id),(V()&&V().CALIDAD&&V().CALIDAD[c.estado]||{}).etiqueta||c.estado,num(c.periodos_esperados)??'',num(c.periodos_autorizados)??'',num(c.periodos_provisionales)??'',arr(c.periodos_faltantes).map(p=>`S${p.semana} ${fmtFecha(p.desde)}–${fmtFecha(p.hasta)}`).join(', '),arr(c.errores).join('; ')]);resSt.push(ST.cell);}
  ws=buildSheet(neutralizar(resRows),resSt,[34,26,18,14,18,18,14,14,12,12,40],[{s:{r:0,c:0},e:{r:0,c:10}}]);XLSX.utils.book_append_sheet(wb,ws,'RESUMEN');
  const MED=['neto_conciliado','pagado_registrado','pagado_conciliado','pendiente_conciliacion','saldo_por_cubrir','excedentes'].map(k=>[k,n$(k),'MXN']);
  hojaTabla(wb,'TENDENCIA','Tendencia por periodo y centro (fechas reales)',[['obra_id','ID centro','id'],['obra','Centro'],['periodicidad','Periodicidad'],['semanas','Semanas internas','LISTA'],['periodo_desde','Periodo desde','FECHA'],
   ['periodo_hasta','Periodo hasta','FECHA'],['fecha_pago','Fecha de pago','FECHA'],...MED,['sin_asignar','Sin asignar','MXN'],['cobertura',n$('cobertura'),'PCT']],arr(r.tendencia.filas),true);
  const compFilas=[];for(const [dim,nom] of [['por_centro','Centro'],['por_contratista','Contratista'],['por_medio','Medio de pago']])for(const f of arr(r.comparativos[dim]))compFilas.push({dimension:nom,...f});
  hojaTabla(wb,'COMPARATIVOS','Comparativos por centro, contratista y medio',[['dimension','Dimensión'],['clave','Clave','id'],['etiqueta','Etiqueta'],...MED,['sin_asignar','Sin asignar','MXN'],['cobertura',n$('cobertura'),'PCT'],['trabajadores_con_pago',n$('trabajadores_con_pago'),'ENT']],compFilas);
  const ob=r.obligaciones.data.filas,op=r.operaciones.data.filas,ex=r.excepciones.data.filas;
  const hObl=hojaTabla(wb,'DETALLE OBLIGACIONES','Detalle por obligación (todas las páginas)',columnasCon(COLS.OBLIGACION(),ob),ob,true);
  const hOpe=hojaTabla(wb,'DETALLE OPERACIONES','Detalle por operación de pago (todas las páginas)',columnasCon(COLS.OPERACION(),op),op,true);
  hojaTabla(wb,'EXCEPCIONES','Excepciones (todas las páginas)',columnasCon(COLS.EXCEPCION(),ex).filter(c=>c[0]!=='llaves'),ex,true);
  const cq=cuadre(r,fr);
  hojaTabla(wb,'CUADRE','Cuadre del detalle contra el resumen',[['indicador','Indicador'],['clave','Clave','id'],['resumen','Valor en RESUMEN',''],['detalle','Suma del detalle',''],['diferencia','Diferencia',''],['fuente','Fuente del detalle'],['resultado','Resultado']],cq);
  wb.__auditObraIds=arr(alc.obras).slice();
  return {wb,cuadre:cq,hojas:{obligaciones:hObl,operaciones:hOpe}};
 }
 async function exportar(formato,info){
  if(S.exportando){avisar('Ya se está generando la exportación del tablero.');return null;}
  if(!S.filtros){avisar('Abre el tablero antes de exportar.','err');return null;}
  const inval=validar(S.filtros);if(inval){avisar(inval,'err');return null;}
  S.exportando=true;const met=medir('exportacion'),fr=filtrosRPC();
  anunciar('Preparando la exportación del tablero: se leen todas las páginas del detalle…');avisar('Preparando Excel del tablero…');
  try{
   let r=null;for(let i=0;i<2&&!(r&&r.consistente);i++)r=await reunir(fr);
   if(!r.consistente)throw errorT('INCONSISTENTE','Los datos cambiaron mientras se exportaba. Intenta de nuevo.');
   met.marca('lectura');
   const {wb,cuadre:cq}=construirLibro(r,fr),malos=cq.filter(x=>x.resultado==='NO CUADRA');
   const nombre=`TABLERO_${String(fr.empresa||'').replace(/[^A-Z0-9]/gi,'')}_${fr.desde}_${fr.hasta}_${fr.perspectiva}.xlsx`;
   if(typeof dl!=='function')throw Error('No cargó la descarga de Excel.');
   await dl(wb,nombre);
   const e=met.fin(malos.length?'descuadre':'ok');
   if(malos.length){avisar(`Excel generado, pero ${malos.length} indicador(es) no cuadran con su detalle: revisa la hoja CUADRE.`,'err');alerta('Exportación con diferencias: revisa la hoja CUADRE.');}
   else{avisar('Excel del tablero generado: filtros, definiciones, resumen, tendencia, comparativos y detalle completo.','ok');anunciar(`Exportación lista: ${entero(r.obligaciones.total)} obligaciones y ${entero(r.operaciones.total)} operaciones.`);}
   return {ok:true,nombre,hojas:wb.SheetNames.slice(),filas:{obligaciones:r.obligaciones.total,operaciones:r.operaciones.total,excepciones:r.excepciones.total},cuadre:cq,ms:e.total_ms,wb};
  }catch(e){
   met.fin('error');const m=e.message||String(e);avisar('No se pudo exportar el tablero: '+m,'err');alerta('No se pudo exportar el tablero: '+m);return {ok:false,error:m};
  }finally{S.exportando=false;}
 }

 /* ---------------- Apertura ---------------- */
 function asegurarCss(){
  const d=doc(),href=V()&&V().css;if(!d||!d.head||!href)return;
  if([...d.querySelectorAll('link[rel="stylesheet"]')].some(l=>String(l.getAttribute('href')||'').includes('platinum-tablero.css')))return;
  const l=d.createElement('link');l.rel='stylesheet';l.href=href;d.head.appendChild(l);
 }
 function enlazar(raiz){
  raiz.addEventListener('click',ev=>{const t=ev.target,f=t&&t.closest?t.closest('[data-foco],[data-tablero-foco]'):null,el=t&&t.closest?t.closest('button,a,input,select,[tabindex]'):null;
   if(el)S.ultimoEl=el;if(f){S.ultimoFoco=f.getAttribute('data-foco')||f.getAttribute('data-tablero-foco');if(!el)S.ultimoEl=f;}},true);
  raiz.addEventListener('click',ev=>{
   const b=ev.target&&ev.target.closest?ev.target.closest('[data-tablero-accion]'):null;if(!b||!raiz.contains(b))return;
   const a=b.getAttribute('data-tablero-accion');ev.preventDefault();
   switch(a){
    case 'cerrar':cerrar();break;
    case 'cargar-excepciones':S.excepciones={pagina:1,por_pagina:CFG.por_pagina};cargarExcepciones();break;
    case 'detalle-general':abrirDetalle('',{grano:b.getAttribute('data-grano')||'OBLIGACION',titulo:b.getAttribute('data-grano')==='OPERACION'?'Todas las operaciones del alcance':b.getAttribute('data-grano')==='MOVIMIENTO'?'Movimientos de personal del alcance':'Todas las obligaciones del alcance',origen:'detalle-general'});break;
    case 'cerrar-detalle':cerrarDetalle();break;
    case 'reintentar':reintentar(b.getAttribute('data-fuente')||'todo');break;
    case 'detalle':abrirDetalle(b.getAttribute('data-clave'),{origen:'indicador'});break;
    case 'pagina':paginar('detalle',b.getAttribute('data-pagina'));break;
    case 'exportar':exportar('xlsx');break;
   }
  });
  raiz.addEventListener('keydown',ev=>{
   if(ev.key!=='Escape'||ev.defaultPrevented)return;
   const det=ev.target&&ev.target.closest?ev.target.closest('section[aria-labelledby$="-det-t"]'):null;
   ev.preventDefault();if(det&&S.detalle)cerrarDetalle();else cerrar();
  });
  raiz.addEventListener('focusin',()=>{if(S.pintaPendiente&&!cubierto()){S.pintaPendiente=false;pintar();}});
 }
 async function abrir(opciones={}){
  opciones=opciones||{};
  if(opciones.config)configurar(opciones.config);
  if(!X.sb()||!X.user()){avisar('Inicia sesión para consultar el tablero ejecutivo.','err');return null;}
  if(typeof modal!=='function'){avisar('No se pudo abrir la ventana del tablero.','err');return null;}
  if(S.abierto&&S.host&&S.host.isConnected){vigilar();return S.cargaActual;}
  const t0=reloj(),restaurar=!!(opciones.restaurar&&S.retorno&&S.retorno.permisos===firmaPermisos()),ret=restaurar?S.retorno:null;
  const d=doc(),a=d&&d.activeElement;S.origenApertura=a&&a!==d.body&&a.id!=='tablero-volver'?a:null;
  quitarVolver();asegurarCss();
  modal(`<div id="tablero-ejecutivo" class="tablero-ejecutivo" data-tablero="${VERSION}">
   <div class="m-head tb-no-imprimir"><span class="tb-mut">PLATINUM OS · Tablero ejecutivo</span><button type="button" class="x" data-tablero-accion="cerrar" aria-label="Cerrar tablero ejecutivo">×</button></div>
   <div class="m-body" id="tablero-host"></div>
   <p id="tablero-aviso" class="tb-sr" role="status" aria-live="polite" aria-atomic="true"></p><p id="tablero-alerta" class="tb-sr" role="alert" aria-atomic="true"></p></div>`,'tb-pantalla');
  S.raiz=$id('tablero-ejecutivo');S.host=$id('tablero-host');
  const m=S.raiz.closest('.modal');if(m){m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','Tablero ejecutivo');}
  enlazar(S.raiz);
  S.abierto=true;S.ctx=firmaContexto();S.datos={};S.errores={};S.cargando={};S.desactualizado=false;S.pintaPendiente=false;S.ultimoFoco=null;S.ultimoEl=null;
  if(ret){S.filtros=ret.filtros;S.vista=ret.vista;S.detalle=ret.detalle?{...ret.detalle}:null;S.excepciones=ret.excepciones;S.plantillaPedida=ret.plantilla;}
  else{S.filtros=filtrosIniciales(opciones);S.vista=opciones.vista||'GENERAL';S.detalle=null;S.excepciones=null;S.plantillaPedida=false;S.retorno=null;}
  iniciarVigilancia();
  pintar();
  const tit=S.host.querySelector('.tb-titulo,h2');if(tit){tit.setAttribute('tabindex','-1');try{tit.focus({preventScroll:true});}catch(e){tit.focus();}}
  const p=cargar({ruta:ret?'regreso':'primera-apertura',t0});
  if(ret){
   const r=await p;restaurarScroll(ret.scroll);if(!enfocarClave(ret.foco))enfocarClave(ret.detalle&&ret.detalle.focoOrigen);S.retorno=null;
   anunciar('Regresaste al tablero con los mismos filtros.');return r;
  }
  return p;
 }
 function configurar(op){if(op&&typeof op==='object')for(const k of Object.keys(BASE))if(k in op)CFG[k]=op[k];return {...CFG};}

 const proteger=(nombre,f)=>(...a)=>{try{const r=f(...a);if(r&&typeof r.catch==='function')return r.catch(e=>{avisar('Tablero: '+(e.message||e),'err');return null;});return r;}
  catch(e){avisar('Tablero: '+(e.message||e),'err');if(typeof console!=='undefined')console.error('Tablero: '+nombre,e);return null;}};
 const ACCIONES=Object.freeze(Object.fromEntries(Object.entries({cambiarFiltros,restablecer,abrirDetalle,cerrarDetalle,buscarDetalle,paginar,abrirTrabajador,abrirObligacion,abrirCierre,abrirPago,abrirEvidencia,
  exportar,cambiarVista,reintentar,cargarExcepciones:()=>{if(!S.excepciones)S.excepciones={pagina:1,por_pagina:CFG.por_pagina};return cargarExcepciones();}}).map(([k,f])=>[k,proteger(k,f)])));

 G.PLATINUM_TABLERO=Object.freeze({
  version:VERSION,abrir:proteger('abrir',abrir),cerrar,volver:proteger('volver',volver),avisarCambio,configurar,acciones:ACCIONES,
  estado:()=>S.abierto?clon(estadoVista()):null,
  metricas:()=>S.metricas.map(e=>({...e})),
  _pruebas:Object.freeze({S,filtrosRPC:()=>filtrosRPC(),filtrosIniciales,aplicarPreset,adaptar,cuadre,vigilar,claveCache,granoDe,limpiarCache:()=>{S.cache.clear();S.enVuelo.clear();},
   reiniciar:()=>{if(S.abierto)cerrado(true);S.cache.clear();S.enVuelo.clear();S.datos={};S.retorno=null;S.metricas=[];CFG={...BASE};quitarVolver();}})
 });
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null));
