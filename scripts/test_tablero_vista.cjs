// Tablero ejecutivo · capa de presentación (77-tablero-vista.js).
// Pinta un `estado` ficticio completo y estados de carga, error, vacío y
// calidad; verifica estructura, orden, roles/aria, tablas alternativas,
// emisión de acciones con la clave correcta y escape de texto.
// Sin red ni Supabase: el módulo corre en una VM con linkedom.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{parseHTML}=require('linkedom');
const raiz=path.resolve(__dirname,'..'),RUTA=path.join(raiz,'frontend/modulos/77-tablero-vista.js'),CSS=path.join(raiz,'assets/platinum-tablero.css');
let n=0;const ok=(c,m)=>{assert(c,m);n++;},eq=(a,b,m)=>{const j=x=>x===undefined?x:JSON.parse(JSON.stringify(x));assert.deepStrictEqual(j(a),j(b),m);n++;};

/* ---------- Estado ficticio completo (datos inventados) ---------- */
const XSS='<img src=x onerror="alert(1)"><script>alert(2)</script><u>u</u>';
function estadoCompleto(){
 const semanas=Array.from({length:12},(_,i)=>{const d=new Date(Date.UTC(2026,7,17+7*i)),h=new Date(d.getTime()+6*864e5),iso=x=>x.toISOString().slice(0,10);
  return {periodo:'S'+(34+i),etiqueta:'S'+(34+i),desde:iso(d),hasta:iso(h),neto_conciliado:100000+i*2500,pagado_conciliado:i===11?60000:98000+i*2400,saldo_por_cubrir:i===11?(100000+i*2500-60000):2000+i*100,provisional:i===11};});
 return {
  vista:'GENERAL',cargando:false,errores:{},actualizado_en:'2026-11-11T16:30:00Z',
  filtros:{empresa:'PLATINUM',obras:['o1','o2'],perspectiva:'PERIODO',preset:'EJERCICIO',desde:'2026-01-01',hasta:'2026-11-11',contratistas:['MG'],cuadrillas:[],periodicidades:[],periodos:[],conceptos:[],medios:[],comparar:'PERIODO_ANTERIOR'},
  catalogos:{empresas:[{valor:'PLATINUM',etiqueta:'PLATINUM'},{valor:'JIRE',etiqueta:'JIRE'}],
   obras:[{id:'o1',nombre:'CENTRO NORTE'},{id:'o2',nombre:'CENTRO SUR'},{id:'o3',nombre:'CENTRO PONIENTE'},{id:'o4',nombre:'CENTRO ORIENTE'}],
   contratistas:['MG','ARACELI',XSS],cuadrillas:[{valor:'q1',etiqueta:'CUADRILLA UNO'}],periodicidades:[{valor:'SEMANAL',etiqueta:'Semanal'},{valor:'QUINCENAL',etiqueta:'Quincenal'}],
   periodos:[{valor:'o1:S45',etiqueta:'S45',grupo:'CENTRO NORTE',desde:'2026-11-02',hasta:'2026-11-08'},{valor:'o2:S45',etiqueta:'S45',grupo:'CENTRO SUR',desde:'2026-11-04',hasta:'2026-11-10'}],
   conceptos:[{valor:'NOMINA',etiqueta:'Nómina'},{valor:'FINIQUITO',etiqueta:'Finiquito'}],medios:[{valor:'TRANSFERENCIA',etiqueta:'Transferencia'},{valor:'CHEQUE',etiqueta:'Cheque'},{valor:'POR DEFINIR',etiqueta:'Por definir'}]},
  resumen:{
   medidas:{
    neto_conciliado:{valor:1250000.5,variacion:{absoluta:50000,porcentaje:0.0417}},
    pagado_registrado:{valor:1190000,variacion:{absoluta:20000,porcentaje:0.0171}},
    pagado_conciliado:{valor:1180000.25,variacion:{absoluta:-10000,porcentaje:-0.0084,incompleto:true}},
    saldo_por_cubrir:{valor:70000.25,provisional:true,variacion:{absoluta:60000,porcentaje:6}},
    excedentes:{valor:0,variacion:{absoluta:0,porcentaje:null}},
    cobertura:{valor:0.944,variacion:{absoluta:-0.012,porcentaje:-0.0126}},
    pendiente_conciliacion:{importe:10000,operaciones:3,por_motivo:[{motivo:'SIN_ASIGNAR',etiqueta:'Pago sin asignar',importe:6000,operaciones:2},{motivo:'DIFERENCIA',etiqueta:XSS,importe:4000,operaciones:1}]},
    trabajadores_con_pago:{valor:212,variacion:{absoluta:5,porcentaje:0.024}},
    promedio_pagado_trabajador:{valor:5566.04},mediana_pagado_trabajador:{valor:5200},trabajadores_pago_parcial:{valor:4},concentracion_contratista:{valor:0.62},bruto:{valor:1400000},
    costo_patronal:{valor:null,motivo:'Sin base de cálculo explícita registrada.'}
   },
   comparable:{desde:'2025-01-01',hasta:'2025-11-11',incompleto:false},
   calidad:[{obra_id:'o1',obra:'CENTRO NORTE',estado:'COMPLETO'},{obra_id:'o2',obra:'CENTRO SUR',estado:'CERO_CONFIRMADO'}],
   provisional:true,periodos_abiertos:['S45'],adscripcion_pendiente:3,actualizado_en:'2026-11-11T16:30:00Z',huella:'H-FICTICIA'
  },
  tendencia:{serie:semanas,por_centro:[{obra:'CENTRO NORTE',periodo:'S45',etiqueta:'S45',desde:'2026-11-02',hasta:'2026-11-08',neto_conciliado:70000,pagado_conciliado:40000,saldo_por_cubrir:30000},
   {obra:'CENTRO SUR',periodo:'S45',etiqueta:'S45',desde:'2026-11-04',hasta:'2026-11-10',neto_conciliado:57500,pagado_conciliado:20000,saldo_por_cubrir:37500}]},
  comparativos:{panorama_general:true,
   por_centro:[{clave:'o1',etiqueta:'CENTRO NORTE',periodos:'S1–S45',desde:'2026-01-05',hasta:'2026-11-08',neto_conciliado:700000,pagado_conciliado:660000,saldo_por_cubrir:40000,seleccionado:true},
    {clave:'o2',etiqueta:'CENTRO SUR',periodos:'S1–S45',desde:'2026-01-07',hasta:'2026-11-10',neto_conciliado:550000.5,pagado_conciliado:520000.25,saldo_por_cubrir:30000.25,seleccionado:true},
    {clave:'o3',etiqueta:'CENTRO PONIENTE',periodos:'S1–S30',desde:'2026-03-30',hasta:'2026-10-25',neto_conciliado:300000,pagado_conciliado:300000,saldo_por_cubrir:0,seleccionado:false},
    {clave:'o4',etiqueta:XSS,neto_conciliado:0,pagado_conciliado:0,saldo_por_cubrir:0,seleccionado:false}],
   por_contratista:[{clave:'MG',etiqueta:'MG',neto_conciliado:800000,pagado_conciliado:760000,saldo_por_cubrir:40000},{clave:'ARACELI',etiqueta:'ARACELI',neto_conciliado:450000.5,pagado_conciliado:420000.25,saldo_por_cubrir:30000.25}],
   por_medio:[{clave:'TRANSFERENCIA',importe:1100000,operaciones:2100},{clave:'CHEQUE',importe:90000,operaciones:45}],
   cheques_por_estado:[{estado:'ENTREGADO',cantidad:30,importe:60000},{estado:'PENDIENTE',cantidad:10,importe:20000},{estado:'CANCELADO',cantidad:5,importe:10000}],
   saldo_por_antiguedad:[{tramo:'>60',importe:5000,obligaciones:2},{tramo:'0-7',importe:40000,obligaciones:20},{tramo:'8-14',importe:15000,obligaciones:6},{tramo:'15-30',importe:7000.25,obligaciones:3},{tramo:'31-60',importe:3000,obligaciones:1}]},
  excepciones:{filas:[{clave:'exc-1',severidad:'CRITICO',tipo:'EXCEDENTE',tipo_texto:'Excedente',motivo:'Pago mayor a la obligación',obra:'CENTRO NORTE',trabajador_id:'w1',numero:12,nombre:'PERSONA FICTICIA UNO',periodo:'S44',periodo_desde:'2026-10-26',periodo_hasta:'2026-11-01',importe:1500,obligacion_id:'ob1',pago_id:'p9'},
   {clave:'exc-2',severidad:'ATENCION',tipo:'SIN_ASIGNAR',tipo_texto:'Pago sin asignar',motivo:XSS,obra:'CENTRO SUR',fecha:'2026-11-07',importe:6000,pago_id:'p10'}],total:3,pagina:1,por_pagina:2},
  detalle:{grano:'OBLIGACION',total:120,pagina:1,por_pagina:2,filas:[
   {clave:'det-1',obra:'CENTRO NORTE',periodo:'S45',periodo_desde:'2026-11-02',periodo_hasta:'2026-11-08',provisional:true,trabajador_id:'w1',numero:12,nombre:'PERSONA FICTICIA UNO',contratista:'MG',cuadrilla:'CUADRILLA UNO',concepto:'NOMINA',medio:'TRANSFERENCIA',neto_conciliado:3000,pagado_conciliado:3000,saldo_por_cubrir:0,estado:'Pagada',obligacion_id:'ob1',cierre_id:'c1',pago_id:'p1',evidencia_id:'e1'},
   {clave:'det-2',obra:'CENTRO SUR',periodo:'S44',periodo_desde:'2026-10-28',periodo_hasta:'2026-11-03',trabajador_id:'w2',numero:7,nombre:XSS,contratista:'MG',cuadrilla:null,cuadrilla_pendiente:true,concepto:'FINIQUITO',medio:'CHEQUE',neto_conciliado:5000,pagado_conciliado:2500,saldo_por_cubrir:2500,estado:'Pago parcial',obligacion_id:'ob2',cierre_id:'c2',cheque_id:'ch2',evidencia_id:'e2',evidencia_autorizada:false}]},
  plantilla:{medidas:{plantilla_actual:{valor:230,etiqueta_alcance:'Padrón al 11/11/2026'},altas:{valor:18,variacion:{absoluta:3,porcentaje:0.2}},bajas:{valor:9},reingresos:{valor:2},rotacion:{valor:0.039}},
   tendencia:semanas.map((s,i)=>({periodo:s.periodo,etiqueta:s.etiqueta,desde:s.desde,hasta:s.hasta,altas:i%3,bajas:i%2,reingresos:i===5?1:0,plantilla:220+i})),
   por_centro:[{clave:'o1',etiqueta:'CENTRO NORTE',plantilla:130,altas:10,bajas:5,reingresos:1},{clave:'o2',etiqueta:'CENTRO SUR',plantilla:100,altas:8,bajas:4,reingresos:1}]}
 };
}
module.exports={estadoCompleto,XSS};
if(require.main!==module)return;

/* ---------- 1. Fuente: IIFE, sin globales de nivel superior ni red ---------- */
const fuente=fs.readFileSync(RUTA,'utf8');
const ast=acorn.parse(fuente,{ecmaVersion:'latest'});
ok(ast.body.length===1&&ast.body[0].type==='ExpressionStatement'&&ast.body[0].expression.type==='CallExpression','el módulo es una sola IIFE sin declaraciones globales');
ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|\bsb\s*\.|supabase|localStorage|sessionStorage|indexedDB|sendBeacon|\bimport\s*\(/i.test(fuente),'sin red, Supabase ni almacenamiento');
ok(!/\beval\s*\(|new Function/.test(fuente),'sin eval');
const css=fs.readFileSync(CSS,'utf8');
ok(/@media print/.test(css)&&/prefers-reduced-motion/.test(css)&&/prefers-color-scheme:dark/.test(css)&&/\[data-theme="dark"\]/.test(css),'CSS con impresión, movimiento reducido y modo oscuro');
ok(/var\(--card/.test(css)&&/var\(--navy/.test(css)&&/var\(--accent/.test(css),'CSS usa las variables de identidad PLATINUM');

/* ---------- Contexto VM con DOM ---------- */
function contexto(conEsc){
 const {window,document}=parseHTML('<html><body><div id="host"></div><div id="host2"></div><div id="det"></div></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._valor??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._valor=v;}});
 const impresiones=[];
 const box={document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,WeakMap,Promise,Error,RegExp,Symbol,Intl,setTimeout,print:()=>impresiones.push(1)};
 box.window=box;box.globalThis=box;vm.createContext(box);
 if(conEsc)vm.runInContext(`const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));`,box);
 vm.runInContext(fuente,box,{filename:'77-tablero-vista.js'});
 return {box,window,document,V:box.PLATINUM_TABLERO_VISTA,impresiones};
}
const {box,window,document,V,impresiones}=contexto(true);
const host=document.getElementById('host');
const q=(s,el=host)=>el.querySelector(s),qa=(s,el=host)=>[...el.querySelectorAll(s)];
const ev=(el,tipo,props={})=>{assert(el,'elemento inexistente para '+tipo);const e=new window.Event(tipo,{bubbles:true,cancelable:true});for(const[k,v]of Object.entries(props))Object.defineProperty(e,k,{value:v});el.dispatchEvent(e);return e;};
const click=el=>ev(el,'click'),tecla=(el,key)=>ev(el,'keydown',{key});
const texto=el=>(el&&el.textContent||'').replace(/\s+/g,' ').trim();
let llamadas=[];
const registrar=nombre=>(...args)=>{llamadas.push({nombre,args:JSON.parse(JSON.stringify(args))});};
const NOMBRES=['cambiarFiltros','restablecer','abrirDetalle','abrirTrabajador','abrirCierre','abrirPago','abrirEvidencia','exportar','cambiarVista','reintentar','paginar','imprimir'];
const acciones=(omitir=[])=>Object.fromEntries(NOMBRES.filter(k=>!omitir.includes(k)).map(k=>[k,registrar(k)]));
const ultima=()=>llamadas[llamadas.length-1];
const limpiar=()=>{llamadas=[];};
const refsAria=(raizEl)=>{let malos=[];for(const el of raizEl.querySelectorAll('[aria-controls],[aria-labelledby],[aria-describedby]'))for(const a of ['aria-controls','aria-labelledby','aria-describedby']){const v=el.getAttribute(a);if(!v)continue;for(const id of v.split(/\s+/))if(!raizEl.querySelector('#'+id))malos.push(a+'→'+id);}return malos;};

/* ---------- 2. API y catálogos ---------- */
ok(typeof V.render==='function'&&typeof V.pintarDetalle==='function'&&typeof V.formatos==='object'&&V.css==='assets/platinum-tablero.css','API expuesta en window.PLATINUM_TABLERO_VISTA');
for(const k of ['neto_conciliado','pagado_registrado','pagado_conciliado','saldo_por_cubrir','excedentes','cobertura','pendiente_conciliacion','variacion','trabajadores_con_pago','promedio_pagado_trabajador','mediana_pagado_trabajador','saldo_por_antiguedad','cheques_por_estado','trabajadores_pago_parcial','concentracion_contratista','percepciones_retenciones','bruto','costo_patronal','plantilla_actual','altas','bajas','reingresos','rotacion'])
 ok(V.MEDIDAS[k]&&V.MEDIDAS[k].etiqueta&&V.MEDIDAS[k].definicion&&V.MEDIDAS[k].formula,'medida con etiqueta, definición y fórmula: '+k);
eq(V.VISTAS.map(v=>v.clave),['GENERAL','NOMINA_PAGOS','CONCILIACION','PLANTILLA'],'cuatro vistas agrupadas');
for(const v of V.VISTAS)ok(v.kpis.length>=6&&v.kpis.length<=8,'6 a 8 indicadores en '+v.clave);
eq(Object.keys(V.CALIDAD).filter(k=>k!=='COMPLETO'),['CERO_CONFIRMADO','SIN_REGISTROS','INCOMPLETO','ERROR_LECTURA'],'estados de calidad del contrato');

/* ---------- 3. Formatos ---------- */
const F=V.formatos;
eq(F.mxn(1234.5),'$1,234.50','MXN');eq(F.mxn(-5),'-$5.00','MXN negativo');eq(F.mxn(-0.001),'$0.00','sin -0');eq(F.mxn(null),'—','MXN nulo');
eq(F.mxnFirmado(50000),'+$50,000.00','MXN con signo');eq(F.pct(0.853),'85.3%','porcentaje');eq(F.pctFirmado(-0.0084),'-0.8%','porcentaje con signo');eq(F.pp(-0.012),'-1.2 pp','puntos porcentuales');
eq(F.fecha('2026-11-11'),'11/11/2026','fecha');eq(F.rango('2026-11-02','2026-11-08'),'02/11/2026 – 08/11/2026','rango');eq(F.fechaHora('2026-11-11T16:30:00Z'),'11/11/2026 10:30','fecha y hora CDMX');
eq(F.mxnCompacto(1250000),'$1.25 M','compacto');eq(F.entero(2100),'2,100','entero');

/* ---------- 4. Pintura completa: estructura y orden ---------- */
let E0=estadoCompleto(),A=acciones();
const res=V.render(host,E0,A);
eq(res.vista,'GENERAL','vista inicial');
const html=host.innerHTML;
const pos=s=>{const i=html.indexOf(s);assert(i>=0,'falta '+s);return i;};
ok(pos('class="tb-cab"')<pos('class="tb-filtros')&&pos('class="tb-filtros')<pos('class="tb-alcance"')&&pos('class="tb-alcance"')<pos('role="tablist"')&&pos('role="tablist"')<pos('class="tb-kpis"')&&pos('class="tb-kpis"')<pos('data-graf-id="tendencia"')&&pos('data-graf-id="tendencia"')<pos('Excepciones por revisar')&&pos('Excepciones por revisar')<pos('Detalle por obligación'),'orden: encabezado → filtros → alcance → vistas → indicadores → tendencia → excepciones → detalle');
const kpis=qa('.tb-kpi');eq(kpis.length,8,'8 indicadores en General');
eq(kpis.map(k=>k.getAttribute('data-medida')),V.VISTAS[0].kpis,'indicadores en orden de prioridad');
for(const k of kpis){
 const b=q('.tb-kpi-valor',k),d=q('[data-accion="definicion"]',k);
 ok(b.tagName==='BUTTON'&&b.getAttribute('data-clave')===k.getAttribute('data-medida'),'el valor es un botón con la clave de la medida');
 ok(texto(q('.tb-kpi-estado',k)).length>3,'estado textual además del color: '+k.getAttribute('data-medida'));
 ok(d&&d.getAttribute('aria-expanded')==='false'&&q('#'+d.getAttribute('aria-controls'),k).hasAttribute('hidden'),'definición accesible y plegada');
 ok(q('h4',k)&&k.getAttribute('aria-labelledby')===q('h4',k).id,'tarjeta etiquetada por su título');
}
const kp=c=>q(`.tb-kpi[data-medida="${c}"]`);
ok(texto(q('.tb-kpi-valor',kp('neto_conciliado')))==='$1,250,000.50','valor MXN con centavos');
ok(/▲ \+\$50,000\.00 \(\+4\.2%\)/.test(texto(q('.tb-kpi-var',kp('neto_conciliado'))))&&/vs\. 01\/01\/2025 – 11\/11\/2025/.test(texto(kp('neto_conciliado'))),'variación absoluta y % contra el periodo comparable');
ok(/sube/.test(texto(q('.tb-kpi-var',kp('neto_conciliado')))),'variación con texto (no sólo color)');
ok(/Periodo comparable incompleto/.test(texto(kp('pagado_conciliado'))),'aviso de periodo comparable incompleto');
ok(q('.tb-var--desfavorable',kp('saldo_por_cubrir'))&&/desfavorable/.test(texto(kp('saldo_por_cubrir'))),'sentido de la variación explicado en texto');
ok(/% no disponible/.test(texto(kp('excedentes'))),'variación % con comparable en cero');
ok(/Provisional/.test(texto(q('.tb-kpi-cab',kp('saldo_por_cubrir')))),'marca Provisional por medida');
ok(/Con saldo por cubrir/.test(texto(kp('saldo_por_cubrir')))&&/Sin excedentes/.test(texto(kp('excedentes'))),'estado de negocio en texto');
ok(/3 operaciones/.test(texto(kp('pendiente_conciliacion')))&&texto(q('.tb-kpi-valor',kp('pendiente_conciliacion')))==='$10,000.00','pendiente: importe y operaciones');
ok(/pagado conciliado ÷ neto conciliado/.test(texto(kp('cobertura'))),'fórmula visible en cobertura');
ok(/Cobertura parcial/.test(texto(kp('cobertura')))&&texto(q('.tb-kpi-valor',kp('cobertura')))==='94.4%','cobertura en %');

/* ---------- 5. Accesibilidad estructural ---------- */
eq(refsAria(host),[],'todas las referencias aria apuntan a ids existentes');
const tabs=qa('[role="tab"]');eq(tabs.length,4,'cuatro pestañas');
eq(tabs.filter(t=>t.getAttribute('aria-selected')==='true').map(t=>t.getAttribute('data-vista')),['GENERAL'],'una pestaña seleccionada');
eq(tabs.map(t=>t.getAttribute('tabindex')),['0','-1','-1','-1'],'tabindex itinerante');
ok(q('[role="tabpanel"]').getAttribute('aria-labelledby')===tabs[0].id,'panel etiquetado por su pestaña');
const vivo=q('[aria-live="polite"]');ok(vivo&&vivo.getAttribute('role')==='status'&&/Resultados actualizados/.test(vivo.textContent),'región aria-live con el resultado');
ok(q('section.tb').getAttribute('aria-labelledby')===q('h2.tb-titulo').id,'sección principal etiquetada');
for(const el of qa('[data-accion]'))ok(['BUTTON','INPUT','SELECT'].includes(el.tagName),'interacción nativa por teclado: '+el.tagName+' '+el.getAttribute('data-accion'));
ok(qa('[tabindex]').every(el=>Number(el.getAttribute('tabindex'))<=0),'sin tabindex positivo');
ok(qa('.tb-lienzo').every(l=>l.getAttribute('tabindex')==='0'&&l.getAttribute('aria-label')),'gráficas recorribles con teclado');
for(const s of qa('svg'))ok(s.getAttribute('aria-hidden')==='true'||(s.getAttribute('role')==='img'&&s.getAttribute('aria-labelledby')),'todo SVG es decorativo o tiene rol img');
const svg=q('[data-graf-id="tendencia"] svg.tb-svg');
const [tid,did]=svg.getAttribute('aria-labelledby').split(' ');
ok(texto(q('#'+tid)).length>10&&/12 periodos/.test(texto(q('#'+did))),'gráfica con título y descripción');
ok(q('circle',svg)&&q('rect[width="9"]',svg)&&q('path[d^="M"][stroke-width="2"]',svg),'marcadores con forma distinta por serie');
ok(qa('.tb-leyenda li',q('[data-graf-id="tendencia"]')).map(texto).join('|')==='Neto conciliado|Pagado conciliado (aplicado)|Saldo por cubrir','leyenda con texto para cada serie');
ok(/Provisional/.test(texto(svg)),'banda de periodo provisional en la gráfica');
const figs=qa('figure.tb-graf');eq(figs.map(f=>f.getAttribute('data-graf-id')),['tendencia','por_centro','por_medio','saldo_antiguedad'],'gráficas de General');
for(const f of figs){const b=q('[data-accion="alt"]',f),c=q('#'+b.getAttribute('aria-controls'),f);
 ok(c&&q('table caption',c)&&qa('thead th[scope="col"]',c).length>=2&&qa('tbody tr',c).length>0,'tabla alternativa legible: '+f.getAttribute('data-graf-id'));}

/* ---------- 6. Panorama general, fechas reales y tablas ---------- */
const pc=q('[data-graf-id="por_centro"]');
ok(/Panorama general/.test(texto(q('.tb-insignia--pan',pc)))&&/Fuera de la selección/.test(texto(q('.tb-graf-desc',pc))),'panorama general identificado y explicado');
const fuera=qa('.tb-barra--fuera',pc);eq(fuera.length,2,'centros fuera de la selección atenuados');
ok(fuera.every(b=>/Fuera de la selección/.test(texto(b))),'fuera de la selección dicho con texto');
ok(/S1–S45 · 05\/01\/2026 – 08\/11\/2026/.test(texto(pc))&&/07\/01\/2026 – 10\/11\/2026/.test(texto(pc)),'comparación entre centros con fechas reales de cada periodo');
const tend=q('[data-graf-id="tendencia"]');
ok(/02\/11\/2026 – 08\/11\/2026/.test(texto(tend))&&/04\/11\/2026 – 10\/11\/2026/.test(texto(tend))&&/Fechas reales de cada periodo por centro/.test(texto(tend)),'tendencia con fechas reales por centro');
ok(/Provisional \(periodo abierto\)/.test(texto(tend)),'tabla de tendencia indica periodo abierto');
const antig=qa('[data-graf-id="saldo_antiguedad"] .tb-barra-nom').map(texto);eq(antig,['0–7 días','8–14 días','15–30 días','31–60 días','Más de 60 días'],'tramos de antigüedad en orden');
ok(/Total/.test(texto(q('[data-graf-id="por_medio"] tfoot')))&&/\$1,190,000\.00/.test(texto(q('[data-graf-id="por_medio"] tfoot'))),'tabla de medios con total');
ok(/Adscripción histórica pendiente/.test(texto(q('.tb-pend')))&&/3 obligaciones con «Adscripción histórica pendiente»/.test(texto(q('.tb-avisos'))),'adscripción histórica pendiente en fila y aviso');
ok(q('tr.tb-fila-prov')&&/Provisional/.test(texto(q('tr.tb-fila-prov'))),'fila provisional marcada con texto');
ok(/Incluye periodos abiertos \(S45\)/.test(texto(q('.tb-avisos'))),'aviso de periodos abiertos');
const filasDet=qa('[aria-labelledby$="-det-t"] tbody tr');eq(filasDet.length,2,'filas de detalle paginadas');
ok(q('[data-accion="evidencia"][data-id="e1"]',filasDet[0])&&!q('[data-accion="evidencia"]',filasDet[1])&&/Evidencia restringida/.test(texto(filasDet[1])),'evidencia sólo autorizada');
ok(/Página 1 de 60 · filas 1–2 de 120/.test(texto(q('nav[aria-label="Paginación de detalle"]'))),'paginación del detalle');
ok(/Página 1 de 2/.test(texto(q('nav[aria-label="Paginación de excepciones"]'))),'paginación de excepciones');
ok(q('th.tb-num')&&qa('td.tb-num').length>5,'cifras alineadas a la derecha');
ok(/Alcance aplicado/.test(texto(q('.tb-alcance')))&&/Centros: CENTRO NORTE, CENTRO SUR/.test(texto(q('.tb-alcance-txt')))&&/Periodo de nómina: Ejercicio actual 01\/01\/2026 – 11\/11\/2026/.test(texto(q('.tb-alcance-txt')))&&/Contratista: MG/.test(texto(q('.tb-alcance-txt'))),'resumen visible del alcance aplicado');
ok(/Actualizado: 11\/11\/2026 10:30/.test(texto(q('.tb-actualizado'))),'fecha de actualización visible');
ok(/Toma las obligaciones cuyo periodo de nómina/.test(texto(q('.tb-persp')))&&qa('.tb-persp .tb-sr').length===2,'ambas perspectivas explicadas');
const defs=texto(q('.tb-defs-imp'));
ok(V.VISTAS[0].kpis.every(k=>defs.includes(V.MEDIDAS[k].definicion))&&/Fecha efectiva de pago/.test(defs)&&/Error de lectura/.test(defs),'definiciones para impresión');

/* ---------- 7. Escape de texto ---------- */
ok(!qa('img,script,u').length&&!qa('[onerror]').length,'ningún texto se interpreta como HTML');
ok(host.textContent.includes('<img src=x onerror="alert(1)">'),'el texto peligroso se muestra literal');

/* ---------- 8. Acciones con la clave correcta ---------- */
limpiar();click(q('.tb-kpi-valor',kp('neto_conciliado')));
eq([ultima().nombre,ultima().args[0],ultima().args[1].origen,ultima().args[1].vista],['abrirDetalle','neto_conciliado','indicador','GENERAL'],'indicador abre su detalle');
click(q('[data-accion="detalle"][data-valor="o1"]',pc));
eq([ultima().args[0],ultima().args[1].dimension,ultima().args[1].valor],['neto_conciliado','obra','o1'],'barra por centro abre detalle');
click(q('[data-graf-id="saldo_antiguedad"] [data-accion="detalle"]'));eq([ultima().args[0],ultima().args[1].dimension],['saldo_por_antiguedad','tramo'],'barra de antigüedad abre detalle');
click(q('[data-accion="detalle"][data-clave="tendencia"][data-valor="S34"]'));eq([ultima().args[0],ultima().args[1].valor],['tendencia','S34'],'periodo de la tabla de tendencia abre detalle');
click(q('[data-accion="detalle"]',filasDet[0]));eq([ultima().nombre,ultima().args[0],ultima().args[1].fila.obligacion_id],['abrirDetalle','det-1','ob1'],'fila de detalle abre su detalle');
click(q('[data-accion="detalle"][data-fuente="excepciones"]'));eq(ultima().args[0],'exc-1','fila de excepción abre su detalle');
click(q('[data-accion="trabajador"]',filasDet[0]));eq([ultima().nombre,ultima().args[0]],['abrirTrabajador','w1'],'abre trabajador');
click(q('[data-accion="cierre"]',filasDet[0]));eq([ultima().nombre,ultima().args[0]],['abrirCierre','c1'],'abre cierre');
click(q('[data-accion="pago"]',filasDet[0]));eq([ultima().nombre,ultima().args[0]],['abrirPago','p1'],'abre pago');
click(q('[data-accion="pago"]',filasDet[1]));eq(ultima().args[0],'ch2','abre pago por cheque');
click(q('[data-accion="evidencia"]',filasDet[0]));eq([ultima().nombre,ultima().args[0]],['abrirEvidencia','e1'],'abre evidencia autorizada');
click(q('[data-accion="obligacion"]',filasDet[0]));eq([ultima().nombre,ultima().args[0],ultima().args[1].tipo,ultima().args[1].id],['abrirDetalle','obligacion','OBLIGACION','ob1'],'abre obligación (respaldo por abrirDetalle)');
let abiertaOb=null;V.render(host,E0,{...A,abrirObligacion:id=>{abiertaOb=id;}});click(q('[aria-labelledby$="-det-t"] [data-accion="obligacion"]'));eq(abiertaOb,'ob1','usa abrirObligacion si existe');
V.render(host,E0,A);
limpiar();click(q('[data-accion="exportar"]'));eq([ultima().nombre,ultima().args[0],ultima().args[1].vista],['exportar','xlsx','GENERAL'],'exportar');
click(q('[data-accion="imprimir"]'));eq(ultima().nombre,'imprimir','imprimir');
click(q('[data-foco="restablecer"]'));eq(ultima().nombre,'restablecer','restablecer filtros');
click(q('[data-accion="quitar-filtro"][data-filtro="contratistas"][data-valor="MG"]'));eq([ultima().nombre,ultima().args[0]],['cambiarFiltros',{contratistas:[]}],'quitar un filtro activo');
click(q('[data-accion="reintentar"][data-fuente="todo"]'));eq([ultima().nombre,ultima().args[0]],['reintentar','todo'],'actualizar');
click(q('[data-accion="pagina"][data-fuente="detalle"][data-pagina="2"]'));eq([ultima().nombre,ultima().args],['paginar',['detalle',2]],'página siguiente');
limpiar();click(q('[data-foco="pag-detalle-ant"]'));eq(llamadas.length,0,'botón deshabilitado no emite');
V.render(host,E0,acciones(['paginar']));click(q('[data-accion="pagina"][data-fuente="detalle"][data-pagina="2"]'));eq([ultima().nombre,ultima().args[0]],['cambiarFiltros',{paginas:{detalle:2}}],'paginación por cambiarFiltros si no hay paginar');
V.render(host,E0,A);

/* filtros */
const sel=(el,v)=>{el.value=v;ev(el,'change');};
limpiar();sel(q('select[data-filtro="empresa"]'),'JIRE');eq(ultima().args[0],{empresa:'JIRE',obras:[]},'razón social');
sel(q('select[data-filtro="preset"]'),'MES');eq(ultima().args[0],{preset:'MES'},'preset');
sel(q('select[data-filtro="comparar"]'),'ANIO_ANTERIOR');eq(ultima().args[0],{comparar:'ANIO_ANTERIOR'},'comparación');
const radio=q('input[type="radio"][value="PAGO"]');radio.checked=true;ev(radio,'change');eq(ultima().args[0],{perspectiva:'PAGO'},'perspectiva');
const desde=q('input[data-filtro="desde"]');desde.value='2026-03-01';ev(desde,'change');eq(ultima().args[0],{preset:'PERSONALIZADO',desde:'2026-03-01'},'fecha personalizada');
limpiar();const desde2=q('input[data-filtro="desde"]');desde2.value='2026-12-31';ev(desde2,'change');eq(llamadas.length,0,'rango inválido no emite');
ok(/no puede ser posterior/.test(texto(q('.tb-error-campo')))&&q('input[data-filtro="desde"]').getAttribute('aria-invalid')==='true','error de rango visible y asociado');
eq(refsAria(host),[],'aria válido con error de fecha');

/* selección múltiple con búsqueda */
limpiar();click(q('[data-accion="ms-abrir"][data-filtro="obras"]'));
let panel=q('#'+q('[data-accion="ms-abrir"][data-filtro="obras"]').getAttribute('aria-controls'));
ok(!panel.hasAttribute('hidden')&&q('[data-accion="ms-abrir"][data-filtro="obras"]').getAttribute('aria-expanded')==='true','panel de selección abierto');
ok(q('input[type="search"][aria-label="Buscar en Centros de trabajo"]',panel),'búsqueda etiquetada');
eq(qa('input[type="checkbox"]',panel).filter(i=>i.hasAttribute('checked')).map(i=>i.value),['o1','o2'],'selección actual marcada');
const busca=q('input[type="search"]',panel);busca.value='poni';ev(busca,'input');
eq(qa('li[data-texto]',panel).filter(li=>!li.hasAttribute('hidden')).map(li=>texto(li)),['CENTRO PONIENTE'],'la búsqueda filtra opciones');
busca.value='zzz';ev(busca,'input');ok(!q('.tb-ms-vacio',panel).hasAttribute('hidden'),'sin coincidencias explicado');
busca.value='poni';ev(busca,'input');
click(q('[data-accion="ms-todos"]',panel));panel=q('.tb-ms--abierto');
eq(qa('input[type="checkbox"]',panel).filter(i=>i.hasAttribute('checked')).map(i=>i.value),['o1','o2','o3'],'marcar visibles agrega sólo lo filtrado');
const cb=q('input[value="o1"]',panel);cb.checked=false;ev(cb,'change');
eq(llamadas.length,0,'marcar no emite hasta aplicar');
click(q('[data-accion="ms-aplicar"]',panel));eq([ultima().nombre,ultima().args[0]],['cambiarFiltros',{obras:['o2','o3']}],'aplicar selección múltiple');
ok(!q('.tb-ms--abierto'),'panel cerrado tras aplicar');
click(q('[data-accion="ms-abrir"][data-filtro="obras"]'));tecla(q('.tb-ms--abierto input[type="search"]'),'Escape');ok(!q('.tb-ms--abierto'),'Escape cierra la selección');
click(q('[data-accion="ms-abrir"][data-filtro="obras"]'));click(q('.tb-ms--abierto [data-accion="ms-ninguno"]'));limpiar();click(q('.tb-ms--abierto [data-accion="ms-aplicar"]'));eq(ultima().args[0],{obras:[]},'sin marcas = todos');
click(q('[data-accion="mas-filtros"]'));ok(!q('.tb-filtros-mas').hasAttribute('hidden')||q('[data-accion="mas-filtros"]').getAttribute('aria-expanded')==='false','más filtros alterna');
ok(['contratistas','cuadrillas','periodicidades','periodos','conceptos','medios'].every(k=>q(`[data-accion="ms-abrir"][data-filtro="${k}"]`)),'filtros de contratista, cuadrilla, periodicidad, semana, concepto y medio');
click(q('[data-accion="ms-abrir"][data-filtro="periodos"]'));ok(qa('.tb-ms--abierto .tb-ms-grupo').map(texto).join('|')==='CENTRO NORTE|CENTRO SUR'&&/02\/11\/2026 – 08\/11\/2026/.test(texto(q('.tb-ms--abierto'))),'semanas agrupadas por centro con fechas reales');
click(q('.tb-ms--abierto [data-accion="ms-cancelar"]'));

/* definiciones, tablas alternativas y modo tabla */
let def=q('[data-accion="definicion"][data-clave="cobertura"]');click(def);
ok(def.getAttribute('aria-expanded')==='true'&&!q('#'+def.getAttribute('aria-controls')).hasAttribute('hidden'),'definición se despliega');
V.render(host,E0,A);def=q('[data-accion="definicion"][data-clave="cobertura"]');ok(def.getAttribute('aria-expanded')==='true','el despliegue se conserva al repintar');
let alt=q('[data-accion="alt"][data-graf="por_medio"]');click(alt);ok(alt.getAttribute('aria-expanded')==='true'&&!q('#'+alt.getAttribute('aria-controls')).hasAttribute('hidden')&&/Ocultar/.test(texto(alt)),'tabla alternativa se muestra');
click(q('[data-accion="modo-tabla"]'));ok(q('[data-accion="modo-tabla"]').getAttribute('aria-pressed')==='true'&&qa('.tb-alt-cuerpo').every(c=>!c.hasAttribute('hidden')),'ver todas las gráficas como tablas');
click(q('[data-accion="modo-tabla"]'));ok(qa('.tb-alt-cuerpo').every(c=>c.hasAttribute('hidden')),'modo tabla se desactiva');

/* teclado: pestañas y recorrido de la gráfica */
limpiar();tecla(q('[role="tab"][data-vista="GENERAL"]'),'ArrowRight');
eq([ultima().nombre,ultima().args[0]],['cambiarVista','NOMINA_PAGOS'],'flecha derecha cambia de vista');
eq(q('[role="tab"][aria-selected="true"]').getAttribute('data-vista'),'NOMINA_PAGOS','la vista cambia aunque el integrador no repinte');
tecla(q('[role="tab"][data-vista="NOMINA_PAGOS"]'),'End');eq(ultima().args[0],'PLANTILLA','End va a la última vista');
tecla(q('[role="tab"][data-vista="PLANTILLA"]'),'ArrowRight');eq(ultima().args[0],'GENERAL','la navegación es circular');
click(q('[role="tab"][data-vista="CONCILIACION"]'));eq(ultima().args[0],'CONCILIACION','clic en pestaña');
V.render(host,E0,A);
const lienzo=q('.tb-lienzo[data-graf="tendencia"]');tecla(lienzo,'ArrowRight');
ok(!q('.tb-tip',lienzo).hasAttribute('hidden')&&/S34 · 17\/08\/2026 – 23\/08\/2026/.test(texto(q('.tb-tip',lienzo)))&&/\$100,000\.00/.test(texto(q('.tb-tip',lienzo))),'flechas muestran el valor del periodo');
ok(q('.tb-cruz',lienzo).getAttribute('visibility')==='visible','línea guía visible');
tecla(lienzo,'End');ok(/S45 · .*Provisional/.test(texto(q('.tb-tip',lienzo))),'último periodo provisional');
limpiar();tecla(lienzo,'Enter');eq([ultima().args[0],ultima().args[1].dimension,ultima().args[1].valor],['tendencia','periodo','S45'],'Enter abre el detalle del periodo');
tecla(lienzo,'Escape');ok(q('.tb-tip',lienzo).hasAttribute('hidden'),'Escape oculta el valor');

/* ---------- 9. Todas las vistas ---------- */
for(const v of V.VISTAS){
 V.render(host,{...E0,vista:v.clave},A);
 const k=qa('.tb-kpi');ok(k.length>=6&&k.length<=8,'vista '+v.clave+' con '+k.length+' indicadores');
 for(const f of qa('figure.tb-graf'))ok(q('.tb-alt-cuerpo table caption',f),'tabla alternativa en '+v.clave+'/'+f.getAttribute('data-graf-id'));
 eq(refsAria(host),[],'aria válido en '+v.clave);
 ok(!qa('img,script,u').length,'escape en '+v.clave);
}
V.render(host,{...E0,vista:'NOMINA_PAGOS'},A);eq(qa('figure.tb-graf').map(f=>f.getAttribute('data-graf-id')),['tendencia','por_contratista','por_medio','cheques_estado'],'gráficas de Nómina y pagos');
eq(qa('[data-graf-id="cheques_estado"] .tb-barra-nom').map(texto),['Pendiente','Entregado','Cancelado'],'cheques por estado en orden de proceso');
V.render(host,{...E0,vista:'CONCILIACION'},A);ok(q('[data-graf-id="pendiente_motivo"]')&&/Pago sin asignar/.test(texto(q('[data-graf-id="pendiente_motivo"]'))),'pendiente por motivo');
V.render(host,{...E0,vista:'PLANTILLA'},A);
ok(/Padrón al 11\/11\/2026/.test(texto(kp('plantilla_actual')))&&/bajas ÷/.test(texto(kp('rotacion'))),'plantilla con etiqueta de alcance y rotación con fórmula visible');
ok(q('[data-graf-id="plantilla_tendencia"] svg[role="img"]')&&q('[aria-labelledby$="-cal-t"] table'),'movimientos y calidad por centro');

/* ---------- 10. Estados: carga, refresco, error, vacío, no disponible, calidad, desactualizado ---------- */
V.render(host,{filtros:E0.filtros,catalogos:E0.catalogos,cargando:true},A);
ok(qa('.tb-cargando[aria-busy="true"]').length>=4&&qa('.tb-skel').length>10,'esqueleto de carga inicial');
ok(/Cargando/.test(q('[aria-live]').textContent),'carga anunciada');
ok(q('[aria-live]')===vivo,'la región aria-live persiste entre pinturas');
V.render(host,{...E0,cargando:{detalle:true}},A);ok(q('.tb-refrescando[aria-busy="true"] table'),'refresco conserva el marco anterior atenuado');
const conError={...E0,errores:{tendencia:'Tiempo de espera agotado.',detalle:{mensaje:'Permiso denegado.'},catalogos:'Sin catálogos.'}};
V.render(host,conError,A);
eq(qa('.tb-error').map(e=>e.getAttribute('data-fuente-error')),['catalogos','tendencia','detalle'],'error visible por fuente');
ok(/Tiempo de espera agotado/.test(texto(q('[data-fuente-error="tendencia"]')))&&/3 fuentes no se pudieron leer/.test(texto(q('.tb-avisos'))),'mensaje de error y resumen');
ok(/Con error: Catálogos de filtros, Tendencia, Detalle/.test(q('[aria-live]').textContent),'errores anunciados');
limpiar();click(q('[data-fuente-error="tendencia"] [data-accion="reintentar"]'));eq([ultima().nombre,ultima().args[0]],['reintentar','tendencia'],'reintentar por fuente');
click(q('[data-fuente-error="detalle"] [data-accion="reintentar"]'));eq(ultima().args[0],'detalle','reintentar detalle');
click(q('[data-foco="reintentar-todo"]'));eq(ultima().args[0],'todo','reintentar todo');
const vacio=estadoCompleto();vacio.resumen.vacio=true;vacio.detalle={grano:'OBLIGACION',filas:[],total:0,pagina:1,por_pagina:50};vacio.excepciones={filas:[],total:0};vacio.tendencia={serie:[]};vacio.comparativos={};
V.render(host,vacio,A);
ok(/No hay registros para este alcance/.test(texto(q('.tb-avisos'))),'vacío general explicado');
ok(/No hay obligaciones cuyo periodo de nómina caiga en el rango.*Fecha efectiva de pago/.test(texto(q('[aria-labelledby$="-det-t"]'))),'detalle vacío explica la perspectiva');
ok(/Sin excepciones/.test(texto(q('[aria-labelledby$="-exc-t"]')))&&/Sin periodos para graficar/.test(texto(q('[data-graf-id="tendencia"]'))),'excepciones y gráficas vacías explicadas');
limpiar();click(q('[aria-labelledby$="-det-t"] [data-accion="restablecer"]'));eq(ultima().nombre,'restablecer','vacío ofrece restablecer');
vacio.filtros={...vacio.filtros,perspectiva:'PAGO'};V.render(host,vacio,A);ok(/No hay operaciones con fecha efectiva de pago/.test(texto(q('[aria-labelledby$="-det-t"]'))),'vacío según perspectiva de pago');
const nd=estadoCompleto();nd.resumen.medidas.neto_conciliado={valor:0};nd.resumen.medidas.cobertura={valor:null};delete nd.resumen.medidas.excedentes;
V.render(host,nd,A);
ok(texto(q('.tb-kpi-valor',kp('cobertura')))==='No disponible'&&/Denominador vacío/.test(texto(kp('cobertura'))),'«No disponible» con denominador vacío');
ok(/No disponible/.test(texto(q('.tb-kpi-estado',kp('cobertura')))),'estado textual «No disponible»');
ok(texto(q('.tb-kpi-valor',kp('excedentes')))==='No disponible'&&/no entrega esta medida/.test(texto(kp('excedentes'))),'medida ausente: no disponible');
ok(texto(q('.tb-kpi-valor',kp('neto_conciliado')))==='$0.00','cero se distingue de no disponible');
V.render(host,{...nd,indicadores:{GENERAL:['neto_conciliado','costo_patronal','cobertura','saldo_por_cubrir','excedentes','pagado_registrado']}},A);
ok(/Sin base de cálculo/.test(texto(kp('costo_patronal'))),'costo patronal sin fuente');eq(qa('.tb-kpi').length,6,'indicadores configurables por vista');
const cal=estadoCompleto();cal.vista='PLANTILLA';cal.resumen.calidad=[{obra_id:'o1',obra:'CENTRO NORTE',estado:'CERO_CONFIRMADO'},{obra_id:'o2',obra:'CENTRO SUR',estado:'SIN_REGISTROS'},{obra_id:'o3',obra:'CENTRO PONIENTE',estado:'INCOMPLETO'},{obra_id:'o4',obra:XSS,estado:'ERROR_LECTURA'}];
V.render(host,cal,A);
const tCal=texto(q('[aria-labelledby$="-cal-t"] table'));
ok(['Cero confirmado','Sin registros','Incompleto','Error de lectura'].every(t=>tCal.includes(t)),'tabla de calidad con los cuatro estados');
ok(/no equivale a un cero confirmado/.test(tCal)&&/«Sin registros» no equivale a cero confirmado/.test(texto(q('.tb-avisos'))),'sin registros ≠ cero confirmado');
ok(q('.tb-aviso--critico')&&/Error de lectura/.test(texto(q('.tb-aviso--critico'))),'aviso crítico de calidad');
ok(qa('.tb-kpi .tb-kpi-estado').every(e=>/Incompleto/.test(texto(e))),'indicadores marcados como incompletos');
ok(!qa('img,script,u').length,'escape en tabla de calidad');
V.render(host,{...E0,desactualizado:true},A);
ok(/puede estar desactualizado/.test(texto(q('.tb-actualizado')))&&/posiblemente desactualizados/.test(texto(q('.tb-avisos'))),'dato desactualizado con fecha');
limpiar();click(q('[data-foco="actualizar-aviso"]'));eq([ultima().nombre,ultima().args[0]],['reintentar','todo'],'actualizar desde el aviso');
V.render(host,{...E0,ahora:'2026-11-11T17:30:00Z',vigencia_minutos:30},A);ok(/posiblemente desactualizados/.test(texto(q('.tb-avisos'))),'vigencia calculada con hora inyectada');
V.render(host,{...E0,filtros:{...E0.filtros,comparar:'NINGUNO'}},A);ok(qa('.tb-kpi-var').every(v=>/Comparación desactivada/.test(texto(v))),'comparación desactivada explicada');

/* ---------- 11. Detalle reutilizable, impresión de respaldo y escape sin `esc` ---------- */
const det=document.getElementById('det');limpiar();
V.pintarDetalle(det,{titulo:'Obligación ficticia',fila:E0.detalle.filas[1],campos:[{clave:'nombre',etiqueta:'Trabajador'},{clave:'cuadrilla',etiqueta:'Cuadrilla'},{clave:'neto_conciliado',etiqueta:'Neto conciliado',tipo:'MXN'}]},A);
ok(/Adscripción histórica pendiente/.test(texto(det))&&/\$5,000\.00/.test(texto(det))&&!qa('img,script,u',det).length,'panel de detalle con escape y adscripción');
click(q('[data-accion="trabajador"]',det));eq([ultima().nombre,ultima().args[0]],['abrirTrabajador','w2'],'detalle abre trabajador');
click(q('[data-accion="cierre"]',det));eq(ultima().args[0],'c2','detalle abre cierre');
click(q('[data-accion="pago"]',det));eq(ultima().args[0],'ch2','detalle abre pago');
click(q('[data-accion="obligacion"]',det));eq([ultima().args[0],ultima().args[1].id],['obligacion','ob2'],'detalle abre obligación');
ok(!q('[data-accion="evidencia"]',det)&&/Evidencia restringida/.test(texto(det)),'evidencia no autorizada en el detalle');
V.render(host,E0,acciones(['imprimir']));click(q('[data-accion="imprimir"]'));eq(impresiones.length,1,'sin acción imprimir usa la impresión del navegador');
ok(!document.documentElement.classList.contains('tb-imprimir'),'la clase de impresión se retira');
const otro=contexto(false),h2=otro.document.getElementById('host');otro.V.render(h2,E0,{});
ok(!h2.querySelectorAll('img,script,u').length&&h2.textContent.includes('<img src=x onerror="alert(1)">'),'escape propio cuando no existe esc');

console.log(`PASS tablero vista: ${n} comprobaciones (estructura, orden, accesibilidad, tablas alternativas, estados, acciones y escape).`);
