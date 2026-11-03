// Revisión bancaria en VM: base registrada y retenciones del periodo consultado.
// Datos sintéticos; no abre navegador ni escribe en la base.
const fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn'),assert=require('node:assert/strict');
const names=new Set(['_semRango','ctrlCierreDeSemana','finTransDe','ctrlEsperadosPagoSemana','conciliaSemanaDatos','nominaEsperada','ctrlSincronizarChequesCierre','conciliarSemana','concFila','exportConciliacionSemana','descuentosDe','descuentoVigenteSemana','adaptarRetencionPeriodo','descuentoCorrespondePeriodo','retencionesDePeriodo']);
let source='';
for(const file of ['15-banca-conciliacion','08-retenciones-incidencias']){
 const s=fs.readFileSync('frontend/modulos/'+file+'.js','utf8');
 for(const n of acorn.parse(s,{ecmaVersion:'latest'}).body)if(n.type==='FunctionDeclaration'&&names.has(n.id.name))source+=s.slice(n.start,n.end)+'\n';
}
function context(){
 const box={Date,Math,Number,Set,console,SEMANA1:'2026-03-30',OBRA:{id:'centro-sintetico',nombre:'CENTRO SINTÉTICO'},CIERRES:[],CTRLNOI:[],FINTRANS:[],WORKERS:[],PAGOS:[],CHEQUES:[],DESC:[],DIFS:[],
  normSem:x=>String(x??'').replace(/^S/i,''),redondearCentavos:x=>Math.round((x+Number.EPSILON)*100)/100,
  money:x=>Number(x).toFixed(2),esc:x=>String(x??''),fullName:w=>w.nombre||w.id,perDe:()=>({cve:'SEMANAL',dias:7}),
  metodoPagoPredeterminado:()=> 'TRANSFERENCIA',asSinServicioSemana:()=>new Set(),
  asVigenteSemana:(w,a,b)=>w.fecha_alta<=b&&(!w.fecha_baja||w.fecha_baja>=a),semRange:()=>['2026-10-26','2026-11-01'],
  nominaPeriodo:()=>{throw Error('La revisión bancaria no debe recalcular impuestos');},
  retencionEvaluada:(d,w,sem)=>({monto:d.ajustes_semana?.[sem]?.importe_base??d.monto,estado:'NORMAL',extra:0}),
  montoDescuento:d=>d.monto,incAuditarCalculoGuardado:()=>null,
  toast:(m,t)=>box.messages.push({m,t}),messages:[],modal:html=>box.rendered=html,window:null,globalThis:null,
  ST:{title:[],sub:{},head:[],cellC:{},cell:{},money:{}},today:()=> '2026-11-03',
  buildSheet:rows=>({rows}),XLSX:{utils:{encode_range:()=> 'A3:H3',book_new:()=>({}),book_append_sheet:(wb,ws)=>box.exported=ws}},dl:()=>{},
 };
 box.window=box;box.globalThis=box;vm.createContext(box);vm.runInContext(source,box);return box;
}
function worker(id,sal=2124.64){return {id,nombre:'PERSONA SINTÉTICA '+id,no_trab:1,obra_id:'centro-sintetico',sal_semanal:sal,estatus:'ACTIVO',fecha_alta:'2026-04-01',periodo_pago:'SEMANAL'};}
function pago(w,sem,monto,extra={}){return {id:'p-'+w.id+'-'+sem,trabajador_id:w.id,semana:sem,importe:monto,medio:'TRANSFERENCIA',estado:'EXITOSO',...extra};}
function falta(w,sem,monto,extra={}){return {id:'d-'+w.id+'-'+sem,trabajador_id:w.id,obra_id:w.obra_id,semana:sem,monto,tipo:'FALTA',activo:true,recurrente:false,...extra};}
(async()=>{
 const b=context(),w=worker('normal');b.WORKERS=[w];b.PAGOS=[pago(w,'S26',2124.64)];
 assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'OK');assert.equal(b.nominaEsperada(w,'S26'),2124.64);
 // Capturas desactivadas, otra semana y otro trabajador no se vuelven a aplicar.
 b.DESC=[falta(w,'S29',684.17),falta(w,'S31',1000,{tipo:'INCIDENCIA'}),falta(w,'S31',1000,{activo:false}),falta(worker('ajeno'),'S31',99)];
 const before=JSON.stringify([b.DESC,b.WORKERS,b.PAGOS]);
 assert.equal(b.nominaEsperada(w,'S29'),1440.47);assert.equal(b.nominaEsperada(w,'S31'),1124.64);assert.equal(b.nominaEsperada(w,'S26'),2124.64);
 assert.equal(JSON.stringify([b.DESC,b.WORKERS,b.PAGOS]),before);
 b.PAGOS=[pago(w,'S29',1440.47),pago(w,'S31',1124.64)];
 assert.equal(b.conciliaSemanaDatos('S29')[0].estado,'OK');assert.equal(b.conciliaSemanaDatos('S31')[0].estado,'OK');
 // El crédito recurrente comparte ajustes, incluida una excepción por semana.
 b.DESC=[falta(w,'S1',100,{recurrente:true,tipo:'FONACOT',ajustes_semana:{S31:{importe_base:125}}})];
 assert.equal(b.nominaEsperada(w,'S31'),1999.64);assert.equal(b.nominaEsperada(w,'S26'),2024.64);
 b.DESC=[];b.PAGOS=[pago(w,'S26',2124.63)];
 assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'DIFERENCIA DE IMPORTE','No ocultar ni tolerar centavos reales');
 await b.conciliarSemana('S26');assert(b.rendered.includes('1 caso(s) requieren revisión'));assert(b.rendered.includes('DIFERENCIA DE IMPORTE'));assert(b.rendered.includes('openControlPagos()'));
 b.exportConciliacionSemana();assert.equal(b.exported.rows[3][5],2124.64);assert.equal(b.exported.rows[3][6],2124.63);
 // Dos pagos parciales cubren el neto; el global/individual duplicado se deduplica.
 b.PAGOS=[pago(w,'S26',1000),pago(w,'S26',1124.64,{id:'p-parcial'})];assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'OK');
 b.PLATINUM_FLOWS={pagosUnicos:a=>a.filter((p,i)=>i===0)};b.PAGOS=[pago(w,'S26',2124.64),pago(w,'S26',2124.64,{id:'duplicado'})];assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'OK');delete b.PLATINUM_FLOWS;
 b.PAGOS=[pago(w,'S26',2124.64)];b.CHEQUES=[{trabajador_id:w.id,semana:'S26',tipo_pago:'CHEQUE',estatus:'PENDIENTE'}];assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'OK');
 b.CHEQUES[0].estatus='EXPEDIDO';assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'MÉTODO INCORRECTO');
 b.CHEQUES[0].estatus='CANCELADO';assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'OK');b.CHEQUES=[];
 b.PAGOS=[pago(w,'S26',2124.64,{estado:'RECHAZADO'})];assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'RECHAZADO');b.PAGOS=[];assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'SIN PAGO');
 // Se respeta la fotografía; la previsión no forma parte del global NOI.
 b.CIERRES=[{id:'c',semana:26,estado:'AUTORIZADO',snapshot:{items:[{trabajador_id:w.id,tipo:'NOMINA',monto:3000,prevision_social:500}]}}];w.sal_semanal=9999;
 b.PAGOS=[pago(w,'S26',2500)];assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'OK');
 b.CTRLNOI=[{cierre_id:'c',trabajador_id:w.id,tipo_calculo:'NOMINA',monto_noi:2499.99}];b.PAGOS=[pago(w,'S26',2499.99)];assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'OK');
 b.CTRLNOI=[];b.CIERRES[0].snapshot.items=[{trabajador_id:w.id,tipo:'FINIQUITO',monto:500,prevision_social:50,metodo_pago:'CHEQUE'}];b.PAGOS=[];b.CHEQUES=[{id:'fin',trabajador_id:w.id,semana:'S26',tipo_pago:'FINIQUITO',estatus:'PENDIENTE',importe:500}];
 assert.equal(b.conciliaSemanaDatos('S26')[0].esperado,500);assert.equal(b.conciliaSemanaDatos('S26')[0].estado,'CHEQUE PENDIENTE');
 // Validación fallida no muestra un certificado de pago ni conserva exportación vieja.
 b.CIERRES=[];b.CHEQUES=[];b.incAuditarCalculoGuardado=()=>({desactualizado:true,monto:10});b.DESC=[falta(w,'S26',9)];
 await b.conciliarSemana('S26');assert.equal(b._CONC,null);assert(b.messages.at(-1).m.includes('incidencia automática guardada'));assert(b.messages.at(-1).t==='err');
 b.DESC=[];for(const sal of [null,'',-1,NaN,Infinity])assert.throws(()=>b.nominaEsperada({...w,sal_semanal:sal},'S26'));
 for(const sem of ['',0,'S0','Sx'])assert.throws(()=>b.nominaEsperada(w,sem));
 assert.equal(b.nominaEsperada({...w,sal_semanal:0},'S26'),0);
 console.log('PASS revisión bancaria: neto registrado exacto, incidencias por semana, créditos compartidos, snapshot/NOI, previsión separada, duplicados, parcialidades, alertas reales, finiquitos, exportación y errores de fuente sin escrituras.');
})().catch(e=>{console.error(e);process.exitCode=1;});
