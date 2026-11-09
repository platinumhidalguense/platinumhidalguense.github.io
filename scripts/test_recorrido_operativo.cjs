const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const XLSX=require('xlsx-js-style');
const core=require('../frontend/modulos/65-recorrido-core.js');

const context={obra_id:'p',empresa_codigo:'PLATINUM',periodo:'QUINCENAL',desde:'2026-10-16',hasta:'2026-10-31',formula_version:'quincenal-test'};
const item=(id,monto,tipo='NOMINA')=>({trabajador_id:id,numero:12,nombre:id,tipo,monto,prevision_social:0,retenciones:'5.01',sueldo_nomina:120});
const a={id:'a',obra_id:'p',cierre_origen:'q',version:1,snapshot_sha256:'huella-a',snapshot:{...context,items:[item('Ana','100.10'),item('Sólo A',2),item('Base cero',0)]}};
const b={id:'b',obra_id:'p',cierre_origen:'q',version:2,snapshot_sha256:'huella-b',snapshot:{...context,items:[item('Ana','100.11'),item('Sólo B',2),item('Base cero',1)]}};
const comp=core.comparar(a,b);
assert.equal(comp.filas.find(x=>x.nombre==='Ana').diferencia.neto,1);
assert.equal(comp.filas.find(x=>x.nombre==='Base cero').porcentaje,null);
assert.equal(comp.filas.find(x=>x.nombre==='Sólo A').actual.neto,null);
assert.equal(comp.filas.find(x=>x.nombre==='Sólo B').cambio,'Sólo en B');
assert.equal(core.centavos('6.0224'),null);
assert.throws(()=>core.comparar(a,{...b,obra_id:'j'}),/centro/);
assert.throws(()=>core.comparar(a,{...b,snapshot:{...b.snapshot,periodo:'SEMANAL'}}),/periodicidad/);
assert.throws(()=>core.comparar(a,{...b,snapshot:{...b.snapshot,items:[...b.snapshot.items,item('Ana',1)]}}),/repetidos/);
assert.equal(core.comparar(a,{...b,snapshot:{...b.snapshot,desde:'2026-11-01',hasta:'2026-11-15'}}).intervaloDistinto,true);

const {document,window}=parseHTML('<html><body><div id="modals"></div></body></html>');
const $=id=>document.getElementById(id);
const log=[],rutas=[],errors=[];
let archivo=null;
let auth={usuario_id:'u',vip:true,escritura:true,salud:true};
let cambioTardio,demora=false;
const periodos=[{id:'w',semana:31,periodo:'SEMANAL',estado:'BORRADOR'},{id:'q',semana:31,periodo:'QUINCENAL',estado:'AUTORIZADO'}];
const baseSaldo={obra_id:'p',cierre_id:'q',version_id:'b',vigente:true,trabajador_id:'Ana',numero:12,nombre:'Ana',metodo:'CHEQUE',pago_registrado:45,saldo:10,entrega_pendiente:45,estado_pago:'PARCIAL'};
function nomina({p_obra,p_semana,p_cierre}){
 const d={obra_id:p_obra,semana:p_semana||31,desde:'2026-10-26',hasta:'2026-11-01',modo:p_semana===30?'HISTORICO':'ACTUAL',cierres:p_obra==='p'?periodos:[],alertas:[]};
 const c=d.cierres.find(x=>x.id===(p_cierre||'w')&&x.semana===d.semana);
 if(c)d.detalle={cierre:{...c,obra_id:p_obra,snapshot:c.periodo==='QUINCENAL'?context:{...context,periodo:'SEMANAL',desde:d.desde,hasta:d.hasta}},flujo:{version_id:'b'},diagnostico:{pendientes:1},
  timbrado:{filas:[{tid:'Ana',estado:'CONTRADICCION_FISCAL'},{tid:'Otro',estado:'DIFERENCIA_TIMBRADO'}]},
  saldos:[{...baseSaldo,id:'o',tipo:'NOMINA',importe:55},{...baseSaldo,id:'privado',tipo:'PREVISION_SOCIAL',importe:99},{...baseSaldo,id:'otro',obra_id:'j',tipo:'NOMINA',importe:99}],
  aplicaciones:[{obra_id:'p',obligacion_id:'o',version_id:'a',pago_id:'pago',importe:45},{obra_id:'j',obligacion_id:'o',pago_id:'ajeno',importe:70},{obra_id:'p',obligacion_id:'o',retirado_en:'2026-11-01',importe:2}]};
 return d;
}
assert.equal(core.obligaciones(nomina({p_obra:'p',p_cierre:'q'}),false).length,1);
assert.equal(core.obligaciones(nomina({p_obra:'p',p_cierre:'q'}),false)[0].aplicaciones.length,1);
const sb={
 rpc(name,p){
  log.push([name,p]);
  if(name==='control_conciliacion_semanal'){
   const result={data:nomina(p)};
   if(demora&&p.p_semana===30)return new Promise(resolve=>{cambioTardio=()=>resolve(result);});
   return Promise.resolve(result);
  }
  assert.equal(name,'control_rrhh_operar');
  const k=p.p_accion,obra=p.p_datos.obra_id;
  assert(['PERMISOS','SEMANA','PROCESO','RESPONSABLES'].includes(k),k+' no es una lectura autorizada en este caso');
  if(k==='PERMISOS')return Promise.resolve({data:auth});
  if(k==='RESPONSABLES'){
   assert.equal(auth.admin,true);
   return Promise.resolve({data:{usuarios:[{id:'u',nombre:'Responsable simulado'}]}});
  }
  if(k==='SEMANA')return Promise.resolve({data:{corte_id:'corte',total:1,por_pagina:50,procesos:[{
   id:'alta',obra_id:obra,semana:p.p_datos.semana,trabajador_id:'Ana',tipo:'ALTA',trabajador:{nombre:'Ana'},
   tareas:[{titulo:'Acuse',estado:'PENDIENTE',rol:'RRHH',responsable_id:'u'}]
  }]}});
  return Promise.resolve({data:{proceso:{obra_id:obra,semana:log.findLast(x=>x[1].p_accion==='SEMANA')[1].p_datos.semana},tareas:[
   {estado:'PENDIENTE',requiere_revision:true,titulo:'Verifica incidencias',evidencia:{detalle:'Fuente de calendario',documentos:[{id:'documento'}]}}
  ]}});
 },
 from(name){
  assert.equal(name,'control_cierre_versiones');
  let consulta;
  const q={select(s){consulta=s;return q;},eq(k,v){assert.equal(k,'obra_id');assert.equal(v,'p');return q;},order(){return q;},
   range(){log.push(['metadatos']);return Promise.resolve({data:[a,b].map(({snapshot,...v})=>v)});},
   in(k,v){assert.equal(k,'id');assert.deepEqual([...v],['a','b']);assert.match(consulta,/snapshot$/);log.push(['versiones']);return Promise.resolve({data:[b,a]});}};
  return q;
 }
};
const call=key=>(...args)=>rutas.push([key,...args]);
Object.assign(window,{PLATINUM_RECORRIDO_CORE:core,PLATINUM_CONCILIADOR_SEMANAL:{abrir:call('conciliador')},
 PLATINUM_RRHH:{abrir:call('rrhh')},PLATINUM_CALENDARIO:{elegir:call('elegir')}});
const p={id:'p',nombre:'Centro P',empresa_codigo:'PLATINUM'},otro={...p,id:'p2',nombre:'Otro centro P'},j={...p,id:'j',empresa_codigo:'JIRE',nombre:'Centro J'};
const ctx={window,document,$,sb,AbortController,USER:{id:'u'},EMPRESA_ACTIVA:'PLATINUM',OBRA:p,OBRAS:[p,otro,j],SOLO_CONTRATOS:false,WORKERS:[{id:'Ana'}],
 isoWeekDe:()=>31,
 XLSX:{utils:XLSX.utils,writeFile:wb=>{archivo=XLSX.read(XLSX.write(wb,{bookType:'xlsx',type:'buffer'}),{type:'buffer'});}},
 empresaDeObra:o=>o.empresa_codigo,razonSocialEmpresa:x=>x,money:x=>Number(x).toFixed(2),esc:x=>String(x??''),
 ctrlTabla:(h,rs,empty)=>'<table>'+rs.join('')+'</table>'+(rs.length?'':empty),
 modal:html=>{$('modals').innerHTML=html;},toast:m=>errors.push(m),
 openDetail:call('ficha'),openProyeccion:call('proyeccion'),openMovimientos:call('movimientos'),rrhhAbrirDocumento:call('evidencia'),conCentroCompleto:fn=>fn()};
vm.createContext(ctx);
for(const f of ['frontend/modulos/66-recorrido-operativo.js','platinum-workflows.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
const api=window.PLATINUM_RECORRIDO;
const turn=()=>new Promise(r=>setImmediate(r));
const click=async(sel)=>{
 const e=document.querySelector(sel);assert(e,sel);$('ro-panel').onclick({target:e});await turn();await turn();
};
const change=async(id,value)=>{$('ro-panel').onchange({target:{id,value}});await turn();await turn();};
(async()=>{
 await window.PLATINUM_FLOWS.bandeja(false);
 assert.match($('ro-cuerpo').textContent,/Verifica incidencias.*Fuente de calendario/s);
 assert.match($('ro-cuerpo').textContent,/Acuse.*A tu cargo/s);
 await click('[data-ro=documento]');assert.deepEqual(rutas.at(-1),['evidencia','documento']);
 await click('[data-ro=cierre]');assert.match(errors.at(-1),/periodicidad/);
 await change('ro-cierre','q');assert.match($('ro-controles').textContent,/2026-10-16 a 2026-10-31/);
 assert.match($('ro-cuerpo').textContent,/contradicción fiscal.*Vigencia SAT sin consultar/s);
 await click('[data-ro=proyeccion]');assert.equal(rutas.at(-1)[1].desde,context.desde);assert.equal(rutas.at(-1)[1].periodo,'QUINCENAL');
 await click('[data-ro=cierre]');assert.deepEqual(rutas.at(-1),['conciliador',null,31,'q']);
 await click('[data-ro=movimientos]');assert.deepEqual(rutas.at(-1),['movimientos',31]);
 await click('[data-vista=pagos]');assert.match($('ro-cuerpo').textContent,/45.00.*10.00.*PARCIAL/s);
 await click('[data-vista=comparar]');await click('[data-ro=versiones]');
 await change('ro-a','a');await change('ro-b','b');await click('[data-ro=comparar]');
 assert.match($('ro-cuerpo').textContent,/huella-a.*huella-b/s);
 assert.match($('ro-cuerpo').textContent,/100.10 → \$100.11 \(\$0.01\)/);
 await click('[data-ro=exportar]');
 const sheet=name=>XLSX.utils.sheet_to_json(archivo.Sheets[name]);
 assert.equal(sheet('Comparativo').find(x=>x.TRABAJADOR==='Ana')['Δ neto'],0.01);
 assert.deepEqual(sheet('Fuentes').map(x=>[x.CIERRE,x.HUELLA]),[['q','huella-a'],['q','huella-b']]);
 api.avisarCambio({table:'trabajadores',new:{obra_id:'p2'}});assert.equal($('ro-aviso').textContent,'');
 api.avisarCambio({table:'trabajadores',new:{obra_id:'p'}});assert.match($('ro-aviso').textContent,/Revalida/);
 await click('[data-ro=exportar]');assert.match(errors.at(-1),/Revalida/);
 const consultas=log.length;await change('ro-centro','j');assert.equal(log.length,consultas);assert.match(errors.at(-1),/Centro no autorizado/);
 window.PLATINUM_RRHH.estaCapturando=()=>true;await api.abrir();assert.equal(log.length,consultas);assert.match(errors.at(-1),/captura/);
 delete window.PLATINUM_RRHH.estaCapturando;
 await api.abrir(31,'Ana','w');
 await click('[data-ro=calendario]');assert.deepEqual(rutas.at(-1),['ficha','Ana','2026-10']);
 await click('[data-ro=proyeccion]');assert.equal(rutas.at(-1)[1].periodo,'SEMANAL');
 assert.doesNotMatch($('ro-cuerpo').textContent,/importe fiscal difiere/);
 demora=true;
 const anterior=api.abrir(30);
 await turn();
 await change('ro-centro','p2');assert.match($('ro-controles').textContent,/Otro centro P/);
 cambioTardio();await anterior;assert.match($('ro-controles').textContent,/Otro centro P/);
 ctx.USER={id:'v'};auth={usuario_id:'v',vip:false,salud:false};
 const lecturasFinanzas=log.filter(x=>x[0]==='control_conciliacion_semanal').length;
 await api.abrir(31,null,'q');
 assert.equal(log.filter(x=>x[0]==='control_conciliacion_semanal').length,lecturasFinanzas);
 assert(!document.querySelector('[data-vista=comparar]'));assert(!document.querySelector('[data-vista=pagos]'));assert(!document.querySelector('[data-ro=imss]'));
 const antes=log.length;
 $('ro-panel').onclick({target:{closest:()=>({dataset:{ro:'versiones'}})}});await turn();
 assert.equal(log.length,antes);assert.match(errors.at(-1),/fuera de tu permiso/);
 ctx.SOLO_CONTRATOS=true;await api.abrir();assert.equal(log.length,antes);
 ctx.SOLO_CONTRATOS=false;auth={usuario_id:'v',admin:true,salud:true};
 await api.abrir();
 assert.match($('ro-cuerpo').textContent,/Responsable simulado/);
 assert(document.querySelector('[data-ro=consolidado]'));
 auth={...auth,usuario_id:'otra sesión'};
 const antesError=log.length;
 await api.abrir();
 assert.equal(log.length,antesError+1,'Una sesión incoherente sólo consulta permisos');
 assert.match($('ro-aviso').textContent,/otra sesión/);
 console.log('PASS recorrido: entrada real, ámbito y respuestas tardías, semanas/quincenas, diferencias exactas, obligaciones, permisos y consultas sin mutaciones.');
})().catch(e=>{console.error(e);process.exitCode=1;});
