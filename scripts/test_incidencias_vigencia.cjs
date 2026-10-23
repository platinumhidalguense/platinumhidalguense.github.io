// Reproduce residuos de cálculo guardados con una identidad enteramente ficticia.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const names=['PERIODOS','periodoPago','perDe','ISR_M','isrTarifa','F_SEM','factorISR','isrPeriodo','FISC','redondearCentavos','nominaPeriodo','descuentoFaltasNOI','incAuditarCalculoGuardado','retencionesDePeriodo'];
let src='';for(const file of ['08-retenciones-incidencias','27-fiscal-costos','29-bajas-creditos-motor']){
 const s=fs.readFileSync('frontend/modulos/'+file+'.js','utf8');for(const n of acorn.parse(s,{ecmaVersion:'latest'}).body)
 if(n.type==='FunctionDeclaration'&&names.includes(n.id.name)||n.type==='VariableDeclaration'&&n.declarations.some(d=>names.includes(d.id.name)))src+=s.slice(n.start,n.end)+'\n';
}
const b={CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66}},money:v=>Number(v).toFixed(2),adaptarRetencionPeriodo:d=>d,descuentosDe:()=>({total:0})};
vm.createContext(b);vm.runInContext(src,b);
const w={id:'ficticio',no_trab:1,sd:329,sdi:345.22,sal_semanal:2200.93},d={id:'descuento-ficticio',trabajador_id:w.id,activo:true,recurrente:false,semana:'S1',tipo:'FALTA',monto:332.50,recalculo_auto:true,motivo:'1 FALTA · NETO NOI −$332.50 (BRUTO −383.83, ISR −41.77, IMSS −9.56)'};
assert.equal(b.nominaPeriodo(w,{faltas:1}).neto,1868.42);
assert.equal(b.incAuditarCalculoGuardado(d,w).monto,332.51);assert.equal(b.incAuditarCalculoGuardado(d,w).desactualizado,true);
const backup=JSON.stringify(d);b.DESC=[d];const before=b.DESC;
assert.throws(()=>b.retencionesDePeriodo(w,'S1'),/incidencia automática guardada.*332.50.*332.51/);assert.equal(b.DESC,before);assert.equal(JSON.stringify(d),backup);
assert.doesNotThrow(()=>b.retencionesDePeriodo(w,'S2'));
assert.equal(b.incAuditarCalculoGuardado({...d,monto:332.51},w).desactualizado,false);
assert.equal(b.incAuditarCalculoGuardado({...d,recalculo_auto:false},w),null);
assert.equal(b.incAuditarCalculoGuardado({...d,motivo:'Descuento manual acordado'},w),null);
const auto={...d,recalculo_auto:false,ajustes_semana:{_calculo_incidencia:{modo:'AUTOMATICO',faltas:1,incapacidad_imss:0,premios:0}}};
assert.equal(b.incAuditarCalculoGuardado(auto,w).desactualizado,true);
assert.equal(b.incAuditarCalculoGuardado({...auto,ajustes_semana:{_calculo_incidencia:{modo:'MANUAL'}}},w),null);
assert.equal(b.incAuditarCalculoGuardado({...auto,recurrente:true},w),null);
assert.equal(b.incAuditarCalculoGuardado({...auto,ajustes_semana:{_calculo_incidencia:{modo:'AUTOMATICO',faltas:8,incapacidad_imss:0,premios:0}}},w),null);
console.log('PASS 14 controles: motor vigente al centavo, incidencia anterior detectada, importe manual respetado, sin mutaciones y sin contaminar otras semanas.');
