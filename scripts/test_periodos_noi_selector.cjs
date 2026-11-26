// Selector de periodo documentado y contrato común de periodo (98) con el código real de la proyección (10/13), calendario de
// retenciones (08), requisición (07) y asistencia (22). Calendarios con la forma real de control_periodos_nomina LISTAR
// (ADMINISTRATIVOS JIRE: NOI 23 → clave 34, 16–30/11/2026; BANCOMER: NOI 43 → clave 12, NOI 48 → clave 17, claves históricas
// sin NOI) y personal ficticio. Sin red ni base de datos.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{parseHTML}=require('linkedom');
const {document,window:win}=parseHTML('<html><body><div id="modals"></div><div id="modals2"></div></body></html>');
Object.defineProperty(win.HTMLSelectElement.prototype,'value',{configurable:true,
 get(){const o=[...this.querySelectorAll('option')];return this.valor??o.find(x=>x.hasAttribute('selected'))?.value??o[0]?.value??'';},set(v){this.valor=v;}});
let n=0;const ok=(c,m)=>{assert(c,m);n++;},eq=(a,b,m)=>{assert.deepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);n++;};
const M98=process.env.MODULO_98||'frontend/modulos/98-periodos-noi.js';
const ADM='b0000000-0000-4000-8000-0000000000ad',BAN='b0000000-0000-4000-8000-0000000000ba',PLA='b0000000-0000-4000-8000-0000000000p1';
const obras=[{id:ADM,nombre:'ADMINISTRATIVOS FICTICIO',empresa_codigo:'JIRE',fecha_inicio:null},{id:BAN,nombre:'OBRA FICTICIA SEMANAL',empresa_codigo:'JIRE',fecha_inicio:'2026-07-27'},
 {id:PLA,nombre:'OBRA PLATINUM',empresa_codigo:'PLATINUM',fecha_inicio:'2026-03-30'}];
const P=(id,noi,clave,desde,hasta,per='SEMANAL',claves=[clave])=>({periodo_id:id,empresa_codigo:'JIRE',anio:Number(desde.slice(0,4)),periodicidad:per,numero_noi:noi,clase:'ORDINARIO',semana:clave,
 mes:per==='QUINCENAL'?Number(desde.slice(5,7)):null,quincena:per==='QUINCENAL'?(Number(desde.slice(8))<=15?1:2):null,desde,hasta,fecha_pago:null,claves_compatibles:claves});
const calendarios={
 [ADM]:[P('a68aac56-d1c9-421f-abc9-80888ce0b90e',23,34,'2026-11-16','2026-11-30','QUINCENAL',[34])],
 [BAN]:[P('g2',null,2,'2026-08-03','2026-08-09'),P('87e54a9c-e576-4277-af2a-e6b2fab4180b',43,12,'2026-10-12','2026-10-18','SEMANAL',[12]),P('170ce662',null,13,'2026-10-19','2026-10-25'),
  P('f9075632-dd98-4de7-950d-051f7a0afd25',48,17,'2026-11-16','2026-11-22','SEMANAL',[17])],
 [PLA]:[]};
// Código real: declaraciones de todos los módulos (excepto los que se ejecutan completos) y 98 completo.
const code=[],mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules,completos=['frontend/modulos/98-periodos-noi.js'];
const constantes=['ISR_M','F_SEM','PERIODOS','ISR_TABLA','MOTOR_NOMINA_VERSION','SEMANA1','MOTIVOS_BAJA','PPF_TARIFA_2026','MES','MESES'];
for(const p of mods){if(completos.includes(p))continue;const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.id.type==='Identifier'&&x.init&&
  (constantes.includes(x.id.name)||['ArrowFunctionExpression','FunctionExpression'].includes(x.init.type)&&!['$','today'].includes(x.id.name))))code.push(s.slice(node.start,node.end));}
let fallar=false,demoras={},llamadasCal=[];const versiones=[],descargas=[],toasts=[],modelos=[];
const sb={rpc:async(fn,a)=>{
  if(fn==='control_periodos_nomina'&&a.p_accion==='LISTAR'){const o=a.p_datos.obra_id;llamadasCal.push(o);if(demoras[o])await demoras[o];
   if(fallar)return {error:{message:'tiempo de espera agotado'}};return {data:{obra_id:o,empresa_codigo:obras.find(x=>x.id===o).empresa_codigo,periodos:JSON.parse(JSON.stringify(calendarios[o]))}};}
  throw Error('RPC no esperado '+fn);
 },from:()=>({select(){return this;},in(){return this;},eq(){return this;},order(){return this;}})};
const W=(i,obra,per,extra={})=>({id:'w'+i,obra_id:obra,no_trab:i,nombres:'PERSONA',primer_apellido:'FICTICIA',segundo_apellido:String(i),contratista:'MG',estatus:'ACTIVO',
 sal_semanal:per==='QUINCENAL'?3500:2000,sd:500,periodo_pago:per,fecha_alta:'2026-01-05',cuenta:'12345678'+i,...extra});
const box={window:null,document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,CustomEvent:win.CustomEvent,Event:win.Event,
 OBRA:obras[0],OBRAS:obras,WORKERS:[W(1,ADM,'QUINCENAL'),W(2,ADM,'QUINCENAL'),W(3,BAN,'SEMANAL'),W(4,PLA,'SEMANAL')],USER:{id:'u'},EMPRESA_ACTIVA:'JIRE',
 EMPRESAS:{PLATINUM:{nombre:'PLATINUM',corto:'PLATINUM'},JIRE:{nombre:'JIRE',corto:'JIRE'}},CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66},motores_nomina:{QUINCENAL:{por_obra:{[ADM]:{codigo:'FICTICIO',dias_fiscales:15.21,divisor_isr:365/12,factor_falta:7/6,criterio_limite_inferior:'NOI_SUPERIOR_ANTERIOR'}}}}},
 DESC:[],DIFS:[],FINTRANS:[],ALTAS_CORTAS:[],RECALCINF:null,CUADS:[],CONTRATISTAS:[],ST:{},sb,structuredClone,setTimeout,clearTimeout,queueMicrotask};
box.window=box;box.globalThis=box;box.HTMLElement=win.HTMLElement;vm.createContext(box);
vm.runInContext(`const $=id=>document.getElementById(id);const today=()=>'2026-11-26';`+code.join('\n'),box);
vm.runInContext(fs.readFileSync(M98,'utf8'),box);
// Fronteras (lecturas remotas, ISR quincenal, libros) sustituidas por dobles que registran el contexto recibido.
vm.runInContext(`
 function toast(m,t){__toasts.push([m,t]);}
 async function pyDatosFrescos(){globalThis._PY_FRESCOS=true;return true;}
 async function proyLeerFiniquitos(){return [];}
 async function isrQAplicarModelo(m){return m;}
 function proyLibro(m,d,meta){__modelos.push({sem:m.sem,rotulo:m.rotulo,destino:d,titulo:meta.titulo,pie:meta.pie});return {SheetNames:[]};}
 async function registrarBitacoraNomina(){return true;}
 async function dl(wb,nombre){__descargas.push(nombre);}
 function closeModal(){document.querySelectorAll('.overlay').forEach(x=>x.remove());const m=document.getElementById('modals');if(m)m.innerHTML='';}
 globalThis._PY_AGUINALDOS=[];globalThis._PY_JORNADAS=[];
 window.PLATINUM_FLOWS={obtenerVersiones:async(o,sem)=>{__versiones.push([o.join(),sem]);return null;},filtrarAbiertos:(a,f)=>({act:a,fins:f}),versionarModelo:async m=>m};
`,Object.assign(box,{__toasts:toasts,__descargas:descargas,__modelos:modelos,__versiones:versiones}));
const $=id=>document.getElementById(id),tick=async(k=40)=>{for(let i=0;i<k;i++)await new Promise(r=>setImmediate(r));};
const cambiar=async(el,v,tipo='change')=>{el.value=v;el.dispatchEvent(new win.Event(tipo,{bubbles:true}));await tick();};
const T=()=>$('py-prev')?.textContent||'';
const PER=box.window.PLATINUM_PERIODOS;
(async()=>{
 // 1) Contrato común: NOI visible e identidad separados de la clave operativa.
 await PER.cargar(ADM);await PER.cargar(BAN);
 const c23=PER.resolver(ADM,{numero_noi:23,anio:2026,periodicidad:'QUINCENAL'});
 eq([c23.periodo_id,c23.numero_noi,c23.clave_operativa,c23.semana,c23.desde,c23.hasta,c23.periodicidad,c23.ejercicio,c23.obra_id,c23.alias],
  ['a68aac56-d1c9-421f-abc9-80888ce0b90e',23,34,34,'2026-11-16','2026-11-30','QUINCENAL',2026,ADM,[34]],'NOI 23 → identificador existente y clave 34');
 eq(PER.resolver(ADM,{semana:23}),null,'la clave 23 no existe: el número NOI no se usa como clave');
 eq(PER.resolver(ADM,{semana:34}).numero_noi,23,'clave 34 (consumidores históricos) → mismo periodo');
 eq(PER.resolver(ADM,{periodo_id:'a68aac56-d1c9-421f-abc9-80888ce0b90e'}).clave_operativa,34,'por identificador');
 eq(PER.resolver(ADM,{fecha:'2026-11-30'}).numero_noi,23,'último día de una quincena de 15 días');
 eq([PER.resolver(BAN,{numero_noi:43}).semana,PER.resolver(BAN,{numero_noi:48}).semana,PER.resolver(BAN,{semana:12}).numero_noi,PER.resolver(BAN,{semana:17}).numero_noi],[12,17,43,48],'Bancomer NOI 43 ↔ clave 12, NOI 48 ↔ clave 17');
 eq([PER.resolver(BAN,{numero_noi:23}),PER.resolver(ADM,{numero_noi:48})],[null,null],'el número de un centro no resuelve en otro');
 eq([PER.resolver(ADM,{numero_noi:23,periodicidad:'SEMANAL'}),PER.resolver(ADM,{numero_noi:23,anio:2027})],[null,null],'periodicidad y ejercicio separan');
 eq(PER.resolver(BAN,{semana:13}).numero_noi,null,'clave histórica sin NOI documentado no inventa número');
 ok(PER.visible(PER.resolver(BAN,{semana:13})).startsWith('Clave histórica S13 · NOI sin documentar'),'etiqueta de clave histórica');
 ok(PER.visible(c23)==='NOI 23 · 16–30 nov 2026 · Quincenal · Ejercicio 2026','etiqueta visible: '+PER.visible(c23));

 // 2) Proyección, ADMINISTRATIVOS (caso reportado): selector documentado, no «No. de semana».
 box.OBRA=obras[0];
 vm.runInContext('openProyeccion()',box);await tick(80);
 const sel=$('py-per');
 ok(sel&&!document.querySelector('input#py-sem[type="number"]'),'selector de periodo documentado en lugar de «No. de semana»');
 ok(sel.textContent.includes('NOI 23 · 16–30 nov 2026 · Quincenal · Ejercicio 2026')&&!/S34|clave/i.test(sel.textContent),'opción visible sin clave interna');
 eq([sel.value,$('py-sem').value,$('py-sem').type,$('py-d1').value,$('py-d2').value,$('py-periodo').value],
  ['a68aac56-d1c9-421f-abc9-80888ce0b90e','34','hidden','2026-11-16','2026-11-30','QUINCENAL'],'periodo vigente resuelto: id, clave oculta 34, fechas y periodicidad');
 ok(versiones.some(v=>v[1]==='S34'),'versiones/candidatos consultados con la clave 34: '+JSON.stringify(versiones));
 ok(!/no documentado|Selecciona/i.test(T()),'la vista previa no reporta «NOI no documentado»: '+T());
 // Edición manual de fechas: se vuelve a resolver; un rango que no es periodo no conserva el id anterior.
 await cambiar($('py-d2'),'2026-11-29','input');
 eq([$('py-sem').value,$('py-per-estado').textContent.includes('no coinciden')],['',true],'fechas editadas sin periodo: selección limpia y aviso');
 versiones.length=0;vm.runInContext('pyPreview()',box);await tick();
 ok(/Selecciona un periodo NOI documentado/.test(T())&&!versiones.length,'sin periodo resuelto no se calcula ni se usa otra clave: '+T());
 await cambiar($('py-d2'),'2026-11-30','input');
 eq([$('py-sem').value,$('py-per').value],['34','a68aac56-d1c9-421f-abc9-80888ce0b90e'],'regresar al rango exacto vuelve a resolver NOI 23');
 // Generar: Excel con NOI 23 y clave 34 interna, mismo contexto en versiones y modelo.
 versiones.length=0;modelos.length=0;
 await vm.runInContext("exportProyeccion('AMBAS')",box);await tick(60);
 eq(modelos.map(m=>[m.sem,m.rotulo,m.destino]),[['S34','NOI 23','CONTRATISTA'],['S34','NOI 23','DISPERSION']],'ambas presentaciones con clave 34 y rótulo NOI 23: '+JSON.stringify(toasts.slice(-2)));
 ok(modelos[0].titulo.startsWith('PROYECCIÓN DE NÓMINA · NOI 23 · ')&&modelos[0].titulo.endsWith('(QUINCENAL)'),'título: '+modelos[0].titulo);
 eq(descargas.slice(-2),['PROYECCION_CONTRATISTA_JIRE_NOI23_QUINCENAL.xlsx','PROYECCION_DISPERSION_JIRE_NOI23_QUINCENAL.xlsx'],'archivos con NOI 23');
 ok(versiones.length&&versiones.every(v=>v[1]==='S34'),'versiones del export con S34');

 // 3) Apertura desde el recorrido con contexto de clave 34 → NOI 23; con periodo_id → ese periodo.
 vm.runInContext("closeModal();openProyeccion({semana:34,desde:'2026-11-16',hasta:'2026-11-30',periodo:'QUINCENAL'})",box);await tick(80);
 eq([$('py-per').value,$('py-sem').value],['a68aac56-d1c9-421f-abc9-80888ce0b90e','34'],'contexto por clave operativa');

 // 4) Bancomer: semanas documentadas y claves históricas; cambiar periodo actualiza todo el contexto.
 box.OBRA=obras[1];vm.runInContext("closeModal();openProyeccion()",box);await tick(80);
 eq([$('py-per').value,$('py-sem').value,$('py-d1').value,$('py-d2').value],['f9075632-dd98-4de7-950d-051f7a0afd25','17','2026-11-16','2026-11-22'],'periodo más reciente documentado ≤ hoy (NOI 48)');
 ok([...$('py-per').options].some(o=>o.textContent.startsWith('Clave histórica S13 · NOI sin documentar · 19–25 oct 2026')),'clave histórica visible sin inventar NOI');
 versiones.length=0;await cambiar($('py-per'),'87e54a9c-e576-4277-af2a-e6b2fab4180b');
 eq([$('py-sem').value,$('py-d1').value,$('py-d2').value,$('py-periodo').value,versiones.map(v=>v[1])],['12','2026-10-12','2026-10-18','SEMANAL',['S12']],'NOI 43 → clave 12 en fechas, periodicidad y versiones');

 // 5) Estados del calendario: cargando, error de consulta y periodo inexistente (no «no documentado» por cualquier fallo).
 PER.invalidar();fallar=true;box.OBRA=obras[0];
 vm.runInContext("closeModal();openProyeccion()",box);await tick(80);
 ok(/No se pudo consultar el calendario NOI del centro: tiempo de espera agotado/.test(T()+$('py-per-estado')?.textContent),'error de consulta mostrado como tal: '+T());
 fallar=false;PER.invalidar();let soltar;demoras[ADM]=new Promise(r=>soltar=r);
 vm.runInContext("closeModal();openProyeccion()",box);await tick(10);
 ok(/Cargando calendario NOI/.test($('py-per-estado')?.textContent||''),'cargando calendario');
 versiones.length=0;vm.runInContext('pyPreview()',box);await tick();
 ok(/Cargando el calendario NOI/.test(T())&&!versiones.length,'mientras carga no se calcula con otra clave: '+T());
 soltar();delete demoras[ADM];await tick(80);
 eq($('py-sem').value,'34','al terminar la carga se resuelve NOI 23');
 assert.throws(()=>PER.de(obras[0],{numero_noi:99}),/Periodo NOI no documentado: no existe en el calendario de ADMINISTRATIVOS FICTICIO para NOI 99/);n++;

 // 6) Respuestas fuera de orden: el calendario lento de un centro anterior no sobrescribe el actual (proyección por contratista).
 PER.invalidar();let lento;demoras[ADM]=new Promise(r=>lento=r);box.OBRA=obras[1];box.EMPRESA_ACTIVA='JIRE';
 vm.runInContext(`closeModal();modal('<div class="m-body">'+window.PLATINUM_PERIODOS.campo('pc',{obra:OBRA})+'<input id="pc-d1" type="date"><input id="pc-d2" type="date"><select id="pc-obra"><option value="${ADM}">a</option><option value="${BAN}" selected>b</option></select><select id="pc-periodo"><option value="SEMANAL">S</option><option value="QUINCENAL">Q</option><option value="TODOS">T</option></select></div>','md')`,box);
 const pA=PER.montar('pc',{obra:obras[0]});const pB=PER.montar('pc',{obra:obras[1]});await pB;lento();await pA;delete demoras[ADM];await tick();
 eq([$('pc-per').dataset.obra,$('pc-sem').value],[BAN,'17'],'la respuesta tardía de otro centro se descarta');
 eq(vm.runInContext("window.PLATINUM_PERIODOS.seleccionado('pc').numero_noi",box),48,'selección vigente del contratista');

 // 7) Calendario de retenciones: navegación por periodos documentados (no aritmética de claves).
 box.OBRA=obras[1];box.DESC=[{id:'r',trabajador_id:'w3',obra_id:BAN,tipo:'FALTA',monto:100,recurrente:false,activo:true,semana:'S12',motivo:'1 FALTA'}];
 vm.runInContext("closeModal();openCalendarioRet()",box);await tick(80);
 eq($('cr-sem').value,'17','retenciones abre NOI 48 (clave 17)');
 vm.runInContext('crNav(-1)',box);await tick();
 eq([$('cr-sem').value,$('cr-d1').value],['13','2026-10-19'],'periodo anterior documentado: clave histórica 13 (no la clave 16)');
 vm.runInContext('crNav(-1)',box);await tick();
 eq([$('cr-sem').value,$('cr-d1').value,$('cr-body').textContent.includes('100')],['12','2026-10-12',true],'NOI 43 (clave 12) con su retención');
 ok(/NOI 43/.test($('cr-strip').textContent)&&/SEMANA 2/.test($('cr-strip').textContent)&&!/NOI 48/.test($('cr-strip').textContent),'tira con rótulos NOI hasta el periodo elegido: '+$('cr-strip').textContent);

 // 8) PLATINUM conserva «No. de semana» y su calendario vigente.
 box.OBRA=obras[2];box.EMPRESA_ACTIVA='PLATINUM';vm.runInContext("closeModal();openProyeccion()",box);await tick(40);
 ok(document.querySelector('input#py-sem[type="number"]')&&!$('py-per'),'PLATINUM: captura numérica sin cambios');
 eq(vm.runInContext("pySemanaSel('py')",box),$('py-sem').value,'PLATINUM: clave = número capturado');
 console.log('PASS selector de periodos NOI: '+n+' comprobaciones (NOI 23/clave 34 quincenal, NOI 43/12 y 48/17 semanal, claves sin NOI, edición de fechas, estados, orden de respuestas, exportación, retenciones y PLATINUM).');
})().catch(e=>{console.error(e);process.exit(1);});
