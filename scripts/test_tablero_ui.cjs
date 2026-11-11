// Tablero ejecutivo · controlador del cliente (78) con la vista real (77) y el
// modelo real (76) como servidor simulado de `control_tablero`. Datos ficticios.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{parseHTML}=require('linkedom'),XLSX=require('xlsx-js-style');
const {performance}=require('node:perf_hooks');
const MOD=require('../frontend/modulos/76-tablero-modelo.js');
const {window,document}=parseHTML('<html><head></head><body><div id="modals"></div><div id="toasts"></div><div id="tbody"></div></body></html>');
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._valor??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._valor=v;}});
let activo=null;Object.defineProperty(document,'activeElement',{configurable:true,get(){return activo&&activo.isConnected?activo:document.body;}});
window.HTMLElement.prototype.focus=function(){activo=this;};
let n=0;const ok=(c,m)=>{assert(c,m);n++;},eq=(a,b,m)=>{const j=x=>x===undefined?x:JSON.parse(JSON.stringify(x));assert.deepStrictEqual(j(a),j(b),m);n++;};
const tick=async(k=8)=>{for(let i=0;i<k;i++)await new Promise(r=>setImmediate(r));};
const espera=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- Fuentes ficticias de volumen representativo ---------- */
const obras=[{id:'O1',nombre:'CENTRO NORTE',fecha_inicio:'2026-03-30',empresa_codigo:'PLATINUM',activa:true},{id:'O2',nombre:'CENTRO SUR',fecha_inicio:'2026-04-08',empresa_codigo:'PLATINUM',activa:true},
 {id:'O3',nombre:'CENTRO JIRE',fecha_inicio:'2026-03-30',empresa_codigo:'JIRE',activa:true}];
const F={ahora:'2026-11-11T18:00:00Z',obras,trabajadores:[],cierres:[],versiones:[],obligaciones:[],pagos:[],evidencias:[],aplicaciones:[],cheques:[],historial:[],cuadrillas:[],flujo:[]};
const POR=220,SEM={O1:[25,32],O2:[25,31],O3:[25,32]};let k=0;const id=p=>p+String(++k).padStart(6,'0');
for(const o of obras){
 for(let i=1;i<=POR;i++)F.trabajadores.push({id:`${o.id}-W${String(i).padStart(3,'0')}`,obra_id:o.id,no_trab:i,nombres:'PERSONA '+i,primer_apellido:'FICTICIA '+o.id,estatus:'ACTIVO',periodo_pago:'SEMANAL',fecha_alta:'2026-04-01',eliminado:false,contratista:i%3?'CONTRATISTA A':'CONTRATISTA B'});
 for(let s=SEM[o.id][0];s<=SEM[o.id][1];s++){
  const c={id:`C-${o.id}-${s}`,obra_id:o.id,semana:s,periodo:'SEMANAL',estado:'AUTORIZADO',snapshot:{}},v={id:`V-${o.id}-${s}`,cierre_id:c.id,snapshot:{}};F.cierres.push(c);F.versiones.push(v);
  const viernes=MOD.calendario.periodo(o,s,'SEMANAL').fecha_pago;
  for(let i=1;i<=POR;i++){
   const w=`${o.id}-W${String(i).padStart(3,'0')}`,imp=2500+((i*37+s*11)%900)+(i%7)/100,ob={id:`OB-${o.id}-${s}-${i}`,cierre_id:c.id,version_id:v.id,obra_id:o.id,trabajador_id:w,semana:s,tipo:'NOMINA',numero:i,nombre:'FICTICIA '+o.id+' PERSONA '+i,contratista:i%3?'CONTRATISTA A':'CONTRATISTA B',importe:imp,metodo:'TRANSFERENCIA',vigente:true};
   F.obligaciones.push(ob);
   if(o.id==='O1'&&i<=5)F.obligaciones.push({...ob,id:ob.id+'-PS',tipo:'PREVISION_SOCIAL',importe:300});
   if(i%10===0)continue; // sin pago
   const pagado=i%10===5?Math.round(imp*50)/100:imp,pg={id:id('PG'),obra_id:o.id,trabajador_id:w,semana:s,medio:'TRANSFERENCIA',banco:'BBVA',importe:pagado,estado:'EXITOSO',fecha_pago:viernes,folio_lote:'L'+k,origen:'GLOBAL',created_at:viernes+'T10:00:00Z',archivo:`conciliacion-nomina/${o.id}/s${s}.pdf`};
   const ev={id:id('EV'),obra_id:o.id,trabajador_id:w,semana:s,clave:'K'+k,importe:pagado,pago_id:pg.id,created_at:pg.created_at};
   F.pagos.push(pg);F.evidencias.push(ev);F.aplicaciones.push({id:id('AP'),obra_id:o.id,obligacion_id:ob.id,evidencia_id:ev.id,version_id:v.id,importe:pagado,created_at:pg.created_at,retirado_en:null});
  }
 }
}
const USUARIOS={admin:{id:'u-admin',email:'admin@ejemplo.test',permisos:{vip:true}},rest:{id:'u-rest',email:'consulta@ejemplo.test',permisos:{vip:false,obras:['O1']}}};
const fuentes={admin:{...F,permisos:USUARIOS.admin.permisos},rest:{...F,permisos:USUARIOS.rest.permisos}};

/* ---------- Servidor simulado: control_tablero sobre el modelo de referencia ---------- */
const eventos=[],llamadas=[],desde=[],retenidas=[];let retener=null,fallar=null;
function servir(accion,d,u){
 const f=fuentes[u.id==='u-rest'?'rest':'admin'];
 switch(accion){
  case 'CATALOGOS':return MOD.catalogos(f,d);case 'RESUMEN':return MOD.calcular(f,d);case 'TENDENCIA':return MOD.tendencia(f,d);case 'COMPARATIVOS':return MOD.comparativos(f,d);
  case 'EXCEPCIONES':return MOD.excepciones(f,d,d);case 'DETALLE':return MOD.detalle(f,d,d);case 'PLANTILLA':return MOD.plantilla(f,d,d);
 }
 throw Error('acción no esperada '+accion);
}
let box;
const sb={
 rpc:async(fn,args)=>{
  assert.equal(fn,'control_tablero');const a=JSON.parse(JSON.stringify(args)),u=box.USER;llamadas.push({accion:a.p_accion,datos:a.p_datos,usuario:u.id});eventos.push('>'+a.p_accion);
  await new Promise(r=>setImmediate(r));
  if(retener&&retener(a.p_accion,a.p_datos)){await new Promise(r=>retenidas.push(r));}
  if(fallar&&fallar(a.p_accion,a.p_datos)){eventos.push('!'+a.p_accion);return {data:null,error:{message:'Fallo simulado de la fuente '+a.p_accion}};}
  const data=JSON.parse(JSON.stringify(servir(a.p_accion,a.p_datos,u)));eventos.push('<'+a.p_accion);return {data,error:null};
 },
 from(tabla){const cond={};const q={select(){return q;},eq(k,v){cond[k]=v;return q;},maybeSingle:async()=>{desde.push({tabla,cond:{...cond}});
  if(box.USER.id==='u-rest')return {data:null,error:null};
  if(tabla==='pagos'){const p=F.pagos.find(x=>x.id===cond.id);return {data:p?{id:p.id,archivo:p.archivo}:null,error:null};}
  if(tabla==='control_evidencias_pago'){const e=F.evidencias.find(x=>x.id===cond.id);return {data:e||null,error:null};}
  return {data:null,error:null};}};return q;},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'about:blank'}})})}
};

/* ---------- Código real de la plataforma ---------- */
const code=[],mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules;
for(const p of mods){const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.init&&['ST','BORD','SEMANA1','MES'].includes(x.id.name)))code.push(s.slice(node.start,node.end));}
const toasts=[],descargas=[],flujos=[],archivos=[],fichas=[];
const WORK=o=>F.trabajadores.filter(w=>w.obra_id===o);
box={window:null,document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,WeakMap,Promise,Error,RegExp,Symbol,Intl,BigInt,TextEncoder,performance,setImmediate,setTimeout,clearTimeout,setInterval,clearInterval,
 MutationObserver:window.MutationObserver,HTMLElement:window.HTMLElement,sb,USER:USUARIOS.admin,OBRA:obras[0],OBRAS:obras,WORKERS:WORK('O1'),EMPRESA_ACTIVA:'PLATINUM',
 EMPRESAS:{PLATINUM:{nombre:'PLATINUM',corto:'PLATINUM'},JIRE:{nombre:'JIRE',corto:'JIRE'}},CFGEMP:{},DOCSX:[],PAGOS:[],CHEQUES:[],DESC:[],CUADS:[],ES_VIP:true,
 NAV_STEP:'trabajadores',OBRA_CARGA_COMPLETA:true,OBRA_LECTURA_VERIFICADA:null,XLSX,confirm:()=>true,scrollTo:()=>{},open:(u,t)=>archivos.push({u,t})};
box.window=box;box.globalThis=box;vm.createContext(box);
vm.runInContext(`const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fullName=w=>[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' ').trim();
const money=v=>v==null||v===''?'':Number(v).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtD=v=>{if(!v)return'';const[y,m,d]=String(v).slice(0,10).split('-');return d+'/'+m+'/'+y;};
const today=()=>'2026-11-11';
`+code.join('\n'),box);
const existe={m76:fs.existsSync('frontend/modulos/76-tablero-modelo.js'),m77:fs.existsSync('frontend/modulos/77-tablero-vista.js')};
for(const m of ['69-personal-lecturas','71-ficha-personal','76-tablero-modelo','77-tablero-vista','78-tablero-ejecutivo'])vm.runInContext(fs.readFileSync('frontend/modulos/'+m+'.js','utf8'),box);
Object.assign(box,{toast:(s,t)=>toasts.push({s,t}),esVip:()=>box.USER.id==='u-admin',esAdmin:()=>box.USER.id==='u-admin',puedeEditarTrabajador:()=>false,razonSocialEmpresa:c=>'RAZÓN '+c,
 fichaResumenHTML:w=>'<p>Resumen ficticio de '+w.id+'</p>',agruparExpedienteFicha:()=>'<p>Sección ficticia</p>',navTrabajadores:()=>[],
 dl:async(wb,nombre)=>{descargas.push({wb,nombre});},
 selectObra:async oid=>{const o=obras.find(x=>x.id===oid);box.OBRA=o;box.EMPRESA_ACTIVA=o.empresa_codigo;box.WORKERS=WORK(oid);box.OBRA_LECTURA_VERIFICADA={obra:oid,sesion:box.USER.id+':'+box.esVip()};},
 PLATINUM_FLOWS:{abrirCierre:async cid=>{flujos.push(cid);box.closeModal();}},
 PLATINUM_CONCILIADOR:{archivoBancario:async ruta=>{archivos.push({ruta});}}});
box.OBRA_LECTURA_VERIFICADA={obra:'O1',sesion:'u-admin:true'};
const T=box.PLATINUM_TABLERO,P=T._pruebas,S=P.S,$=i=>document.getElementById(i),q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const click=el=>{assert(el,'elemento inexistente');el.dispatchEvent(new window.Event('click',{bubbles:true}));};
const tecla=(el,key)=>el.dispatchEvent(Object.assign(new window.Event('keydown',{bubbles:true,cancelable:true}),{key}));
const desdeIdx=e=>eventos.indexOf(e);
const tiempos={};

(async()=>{
 T.configurar({hoy:'2026-11-11',debounce_filtros_ms:5,debounce_busqueda_ms:15,vigilancia_ms:0});
 ok(existe.m76&&existe.m77,'76 y 77 reales cargados (sin dobles)');

 // ---------- 1. Apertura: filtros iniciales y orden de carga ----------
 let t0=performance.now();const r0=await T.abrir();tiempos.apertura=performance.now()-t0;
 const est=T.estado();
 eq([est.filtros.empresa,est.filtros.obras,est.filtros.perspectiva,est.filtros.preset,est.filtros.desde,est.filtros.hasta],['PLATINUM',['O1'],'PERIODO','ACTUAL','2026-11-09','2026-11-15'],'filtro inicial: empresa activa, centro abierto, periodo, semana interna actual');
 eq(est.filtros.calendario.map(c=>[c.obra_id,c.semana]),[['O1',33]],'semana interna del calendario del centro');
 ok(q('.modal.tb-pantalla')&&q('.modal.tb-pantalla').getAttribute('role')==='dialog','vista amplia con el patrón modal()');
 ok(desdeIdx('>CATALOGOS')<desdeIdx('<RESUMEN')&&desdeIdx('>RESUMEN')<desdeIdx('<CATALOGOS'),'catálogos y resumen se piden juntos al inicio');
 ok(desdeIdx('>TENDENCIA')>desdeIdx('<RESUMEN')&&desdeIdx('>COMPARATIVOS')>desdeIdx('<RESUMEN'),'tendencia y comparativos sólo después de las tarjetas');
 ok(!llamadas.some(c=>['DETALLE','EXCEPCIONES','PLANTILLA'].includes(c.accion))&&!desde.length,'sin detalle, excepciones ni lecturas de tablas al abrir');
 ok(qa('.tb-kpi').length>=6&&q('.tb-actualizado').textContent.includes('Actualizado'),'tarjetas y fecha/hora de actualización pintadas por la vista');
 const metA=T.metricas().find(m=>m.ruta==='primera-apertura');ok(metA&&metA.tarjetas_ms!==undefined&&metA.solicitudes===4,'métrica de la primera apertura: 4 solicitudes');

 // ---------- 2. Presets con el calendario interno de cada centro ----------
 const pre=(obrasF,preset)=>{const f=P.aplicarPreset({empresa:'PLATINUM',obras:obrasF,preset});return [f.desde,f.hasta];};
 eq(pre(['O2'],'ACTUAL'),['2026-11-11','2026-11-17'],'semana interna de un centro que inicia en miércoles');
 eq(pre([],'ACTUAL'),['2026-11-09','2026-11-17'],'todos los centros: unión de sus semanas internas');
 eq([pre(['O1'],'QUINCENA'),pre(['O1'],'MES'),pre(['O1'],'EJERCICIO'),pre(['O1'],'ACUMULADO'),pre([],'HISTORICO')],[['2026-11-01','2026-11-15'],['2026-11-01','2026-11-30'],['2026-01-01','2026-12-31'],['2026-01-01','2026-11-11'],['2026-03-30','2026-11-11']],'quincena, mes, ejercicio, ejercicio a la fecha y acumulado histórico');
 eq(await T.acciones.cambiarFiltros({preset:'PERSONALIZADO',desde:'2026-11-20',hasta:'2026-11-01'}),'invalido','rango invertido rechazado sin consultar');

 // ---------- 3. Cambio de filtros con volumen ----------
 let antes=llamadas.length;t0=performance.now();
 await T.acciones.cambiarFiltros({obras:[],preset:'PERSONALIZADO',desde:'2026-09-14',hasta:'2026-11-10'});tiempos.cambio=performance.now()-t0;
 const fr=P.filtrosRPC(),ref=MOD.calcular(fuentes.admin,fr);
 eq(llamadas.slice(antes).map(c=>c.accion).sort(),['COMPARATIVOS','RESUMEN','TENDENCIA'],'un cambio de filtros: una consulta por fuente (catálogos de la misma empresa desde caché)');
 const R=T.estado().resumen;eq(R.medidas.neto_conciliado.valor,ref.medidas.neto_conciliado.valor,'el resumen es el del servidor para los filtros elegidos');
 eq(R.medidas.cobertura.valor,ref.medidas.cobertura.valor,'porcentaje en la escala 0–100 del modelo, sin reconversión');
 { const tx=q('.tb-kpi[data-medida="cobertura"] .tb-kpi-valor').textContent; ok(tx===ref.medidas.cobertura.valor.toFixed(1)+"%","cobertura mostrada en % (escala 0–100 del modelo): "+tx); }
 ok(T.estado().tendencia.filas.length>=15&&T.estado().tendencia.filas.every(p=>p.periodo_desde&&p.periodo_hasta&&p.obra)&&qa('[data-accion="detalle"][data-dim="periodo"]').length>=7,'tendencia por periodo y centro con fechas reales, pintada con enlaces al detalle');
 const totObl=ref.medidas.neto_conciliado.desglose.obligaciones;ok(totObl>=3000,'volumen representativo: '+totObl+' obligaciones');

 // ---------- 4. Invalidación por turno: respuesta tardía descartada ----------
 retener=(a,d)=>a==='RESUMEN'&&d.perspectiva==='PAGO';
 T.acciones.cambiarFiltros({perspectiva:'PAGO'});await espera(20);await tick();
 ok(retenidas.length===1,'la consulta de la perspectiva PAGO quedó pendiente');retener=null;
 await T.acciones.cambiarFiltros({perspectiva:'PERIODO',medios:['TRANSFERENCIA']});
 retenidas.splice(0).forEach(r=>r());await tick(20);
 eq([S.datos.resumen.crudo.alcance.perspectiva,S.datos.resumen.crudo.alcance.medios],['PERIODO',['TRANSFERENCIA']],'la respuesta tardía no sustituye a la vigente');
 ok(T.metricas().some(m=>m.estado==='descartada'),'la carga anterior quedó registrada como descartada');
 await T.acciones.cambiarFiltros({medios:[]});

 // ---------- 5. Error visible, reintento y datos desactualizados ----------
 let fallas=0;fallar=a=>a==='TENDENCIA'&&fallas++<1;
 await T.acciones.cambiarFiltros({comparar:'ANIO_ANTERIOR'});
 ok(S.errores.tendencia&&q('.tb-error[data-fuente-error="tendencia"]'),'error de la fuente visible en su sección');
 ok(T.estado().resumen&&!S.errores.resumen,'las demás fuentes siguen vigentes');
 click(q('[data-accion="reintentar"][data-fuente="tendencia"]'));await tick(20);
 ok(!S.errores.tendencia&&!q('.tb-error[data-fuente-error="tendencia"]')&&T.estado().tendencia,'«Reintentar» recupera la fuente');
 fallar=a=>a==='RESUMEN';await T.acciones.reintentar('todo');
 ok(S.errores.resumen&&T.estado().resumen&&T.estado().desactualizado,'falla al actualizar: se conservan los datos anteriores marcados como desactualizados');
 ok(document.body.textContent.includes('Se muestran los últimos datos leídos')&&$('tablero-alerta').textContent.includes('Reintentar'),'aviso visible y anuncio de error');
 fallar=null;await T.acciones.reintentar('todo');ok(!S.errores.resumen&&!T.estado().desactualizado,'actualización correcta limpia la marca');
 T.avisarCambio();ok(T.estado().desactualizado&&S.cache.size===0,'aviso del sincronizador en vivo: caché invalidada y datos marcados');
 await T.acciones.reintentar('todo');

 // ---------- 6. Detalle bajo demanda, paginado, foco y búsqueda con debounce ----------
 ok(q('[data-tablero-bajo-demanda="detalle"]')&&q('[data-tablero-bajo-demanda="excepciones"]'),'detalle y excepciones bajo demanda');
 antes=llamadas.length;const kpi=q('[data-accion="detalle"][data-clave="neto_conciliado"]');kpi.focus();t0=performance.now();click(kpi);await tick(30);tiempos.detalle=performance.now()-t0;
 const c1=llamadas.slice(antes).find(c=>c.accion==='DETALLE');eq([c1.datos.grano,c1.datos.pagina,c1.datos.por_pagina,c1.datos.medida],['OBLIGACION',1,50,'neto_conciliado'],'detalle por obligación, página 1 de 50 filas');
 ok(qa('section[aria-labelledby$="-det-t"] tbody tr').length===50&&T.estado().detalle.total===MOD.detalle(fuentes.admin,P.filtrosRPC(),{grano:'OBLIGACION'}).total,'una página pintada; total del servidor');
 ok(document.activeElement.id.endsWith('-det-t'),'el foco pasa al encabezado del detalle');
 ok($('tablero-aviso').textContent.includes('Detalle de Neto conciliado'),'anuncio aria-live del detalle');
 click(q('[data-accion="pagina"][data-fuente="detalle"][data-pagina="2"]'));await tick(20);eq(llamadas.at(-1).datos.pagina,2,'página siguiente bajo demanda');
 antes=llamadas.length;for(const t of ['F','FI','FIC','FICT','FICTICIA'])T.acciones.buscarDetalle(t);await espera(40);await tick(10);
 const busq=llamadas.slice(antes).filter(c=>c.accion==='DETALLE');eq([busq.length,busq[0]&&busq[0].datos.busqueda,busq[0]&&busq[0].datos.pagina],[1,'FICTICIA',1],'búsqueda con debounce: una sola consulta');
 tecla(q('section[aria-labelledby$="-det-t"] h3'),'Escape');await tick();
console.log("DBG",!!T.estado().detalle,document.activeElement.tagName,document.activeElement.getAttribute("data-foco"),S.detalle&&S.detalle.focoOrigen); ok(!T.estado().detalle&&document.activeElement.getAttribute('data-foco')==='kpi-neto_conciliado','Escape cierra el detalle y devuelve el foco a la cifra');
 click(q('[data-accion="detalle"][data-dim="obra"][data-valor="O2"]'));await tick(20);eq(llamadas.at(-1).datos.obras,['O2'],'desde una barra: detalle del centro elegido');
 click(q('[data-tablero-accion="cargar-excepciones"]'));await tick(20);eq([llamadas.at(-1).accion,llamadas.at(-1).datos.pagina],['EXCEPCIONES',1],'excepciones paginadas sólo al pedirlas');

 // ---------- 7. Navegación al detalle y regreso ----------
 const ov=q('#tablero-ejecutivo').closest('.overlay');ov.scrollTop=420;const filtrosAntes=JSON.stringify(P.filtrosRPC());
 // Detalle del centro abierto (O1) para la ficha anidada.
 T.acciones.abrirDetalle('neto_conciliado',{dimension:'obra',valor:'O1',etiqueta:'CENTRO NORTE'});await tick(20);
 let i=T.estado().detalle.filas.findIndex(f=>f.obra_id==='O1');const bt=q(`[data-accion="trabajador"][data-fuente="detalle"][data-i="${i}"]`);
 click(bt);await tick(20);
 ok(qa('#modals .overlay').length===2&&$('tablero-host').isConnected&&$('ficha-personal'),'ficha del trabajador anidada sobre el tablero');
 box.closeModal2();await tick(10);
 ok(qa('#modals .overlay').length===1&&JSON.stringify(P.filtrosRPC())===filtrosAntes&&ov.scrollTop===420&&document.activeElement===bt,'al volver: mismos filtros, desplazamiento y foco');
 // Trabajador de otro centro: confirmación y cambio de centro.
 T.acciones.abrirDetalle('neto_conciliado',{dimension:'obra',valor:'O2',etiqueta:'CENTRO SUR'});await tick(20);
 const turno=S.turno;i=0;click(q(`[data-accion="trabajador"][data-fuente="detalle"][data-i="${i}"]`));await tick(30);
 ok(box.OBRA.id==='O2'&&$('ficha-personal')&&qa('#modals .overlay').length===2,'otro centro: se confirma, se cambia de centro y se abre la ficha');
 P.vigilar();await tick(20);ok(S.turno>turno&&JSON.stringify(P.filtrosRPC())===filtrosAntes,'el cambio de centro incrementa el turno y conserva los filtros');
 box.closeModal2();await tick(10);
 // Cierre: sale del tablero; «Volver al tablero» restaura todo sin consultar de nuevo.
 S.ultimoFoco=null;const fila0=T.estado().detalle.filas[0],pag=S.detalle.pagina;ov.scrollTop=420;
 click(q('[data-accion="cierre"][data-fuente="detalle"][data-i="0"]'));await tick(20);
 ok(flujos.at(-1)===fila0.cierre_id&&!$('tablero-host')&&$('tablero-volver'),'abre el cierre con PLATINUM_FLOWS y ofrece volver');
 antes=llamadas.length;click($('tablero-volver'));await tick(30);
 ok($('tablero-host')&&!$('tablero-volver')&&JSON.stringify(P.filtrosRPC())===filtrosAntes&&S.detalle.pagina===pag&&T.estado().detalle&&T.estado().excepciones,'regreso con filtros, detalle y excepciones');
 ok(q('#tablero-ejecutivo').closest('.overlay').scrollTop===420&&llamadas.length===antes,'regreso con la misma posición y desde caché');
 // Pago y evidencia autorizada.
 T.acciones.abrirDetalle('pagado_registrado');await tick(20);
 i=T.estado().detalle.filas.findIndex(f=>f.evidencia_id);const fe=T.estado().detalle.filas[i];
 click(q(`[data-accion="evidencia"][data-fuente="detalle"][data-i="${i}"]`));await tick(20);
 eq(archivos.at(-1).ruta,F.pagos.find(p=>p.id===fe.pago_ids[0]).archivo,'evidencia: comprobante privado con el mecanismo del conciliador');
 const bp=q(`[data-accion="pago"][data-fuente="detalle"][data-i="${i}"]`);click(bp);await tick();
 ok(qa('#modals .overlay').length===2&&q('#tablero-panel').textContent.includes('Pagado conciliado')&&document.activeElement.id==='tablero-panel-t','panel del pago anidado con foco en su título');
 tecla(q('#tablero-panel-t'),'Escape');await tick();ok(qa('#modals .overlay').length===1&&document.activeElement===bp,'Escape cierra el panel y devuelve el foco');

 // ---------- 8. Exportación filtrada ----------
 t0=performance.now();const ex=await T.acciones.exportar('xlsx',{});tiempos.exportacion=performance.now()-t0;
 ok(ex&&ex.ok,'exportación generada');const wb=XLSX.read(XLSX.write(descargas.at(-1).wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 eq(wb.SheetNames,['FILTROS','DEFINICIONES','RESUMEN','TENDENCIA','COMPARATIVOS','DETALLE OBLIGACIONES','DETALLE OPERACIONES','EXCEPCIONES','CUADRE'],'hojas del libro');
 const filas=n=>XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true});
 const fil=filas('FILTROS').map(r=>r.join(' | ')).join('\n');
 ok(fil.includes('Perspectiva de fecha | Periodo de nómina')&&fil.includes('14/09/2026 – 10/11/2026')&&fil.includes('Calendario interno · CENTRO SUR')&&fil.includes('no sustituye al respaldo integral'),'hoja de filtros y perspectiva');
 ok(filas('DEFINICIONES').some(r=>r[1]==='Neto conciliado'&&String(r[3]).length>20&&r[4]),'definiciones con fórmula y el mismo nombre de pantalla');
 const dob=filas('DETALLE OBLIGACIONES'),cab=dob[1],ci=cab.indexOf('Neto conciliado');
 eq(dob.length-3,ex.filas.obligaciones,'detalle completo: todas las páginas');ok(ex.filas.obligaciones>3000&&ex.filas.operaciones>2500,'miles de filas exportadas');
 eq(Math.round(dob.slice(2,-1).reduce((s,r)=>s+(r[ci]||0),0)*100)/100,T.estado().resumen.medidas.neto_conciliado.valor,'el detalle reproduce el neto del RESUMEN');
 ok(ex.cuadre.length>=6&&ex.cuadre.every(c=>c.resultado==='CUADRA'),'hoja CUADRE: todas las medidas cuadran');
 const ws=wb.Sheets['DETALLE OBLIGACIONES'];ok(ws['A3'].t==='s'&&ws[XLSX.utils.encode_cell({r:2,c:ci})].t==='n','IDs como texto y montos como número');
 ok(filas('RESUMEN').some(r=>r[0]==='Cobertura de pago'&&r[2]===ref.medidas.cobertura.valor&&r[3]==='PORCENTAJE')&&wb.Sheets.RESUMEN['C'+(filas('RESUMEN').findIndex(r=>r[0]==='Cobertura de pago')+1)].z==='0.0"%"','misma unidad que la pantalla (porcentaje 0–100 con formato %)');

 // ---------- 9. Sesión restringida: respuesta tardía de la sesión anterior y alcance parcial ----------
 retener=a=>a==='RESUMEN';T.acciones.cambiarFiltros({comparar:'ANTERIOR'});await espera(20);retener=null;
 box.USER=USUARIOS.rest;P.vigilar();await tick(40);retenidas.splice(0).forEach(r=>r());await tick(30);
 ok([...S.cache.keys()].every(k=>k.startsWith('u-rest|')),'cambio de sesión: caché sólo de la sesión vigente');
 ok(S.datos.resumen.crudo.alcance.restringido.prevision_social&&llamadas.filter(c=>c.accion==='RESUMEN').at(-1).usuario==='u-rest','respuesta tardía de la sesión anterior descartada');
 await T.acciones.cambiarFiltros({obras:['O1','O2'],preset:'PERSONALIZADO',desde:'2026-09-14',hasta:'2026-11-10'});
 eq(T.estado().resumen.alcance.obras,['O1'],'el servidor resuelve el alcance autorizado');
 const er=await T.acciones.exportar();const wr=XLSX.read(XLSX.write(descargas.at(-1).wb,{type:'buffer'}),{type:'buffer'});
 const txt=wr.SheetNames.map(s=>XLSX.utils.sheet_to_csv(wr.Sheets[s])).join('\n');
 ok(er.ok&&!txt.includes('CENTRO SUR')&&!txt.includes('FICTICIA O2')&&!txt.includes('PREVISION_SOCIAL')&&txt.includes('fuera de tu alcance'),'usuario restringido: exporta sólo su alcance, sin datos del cliente');
 ok(er.cuadre.every(c=>c.resultado==='CUADRA'),'cuadre también en alcance parcial');
 const d0=desde.length;T.acciones.abrirEvidencia('X',{evidencia_id:'X',pago_ids:[F.pagos[0].id]});await tick(10);
 ok(desde.length>d0&&toasts.at(-1).s.includes('permiso'),'evidencia sin permiso: se respeta el servidor');
 T.cerrar();ok(!$('tablero-host')&&!S.abierto,'cierre del tablero');

 const f=x=>Math.round(x)+' ms';
 console.log(`PASS tablero UI: ${n} comprobaciones; orden de carga, presets por calendario de centro, turnos y respuestas tardías, error/reintento/desactualizado, detalle bajo demanda (foco, paginado, debounce), navegación y regreso, exportación con cuadre y usuario restringido. Tiempos (simulados, ${totObl} obligaciones): apertura ${f(tiempos.apertura)}, cambio de filtros ${f(tiempos.cambio)}, detalle ${f(tiempos.detalle)}, exportación ${f(tiempos.exportacion)} (${ex.filas.obligaciones}+${ex.filas.operaciones}+${ex.filas.excepciones} filas).`);
})().catch(e=>{console.error(e);process.exit(1);});
