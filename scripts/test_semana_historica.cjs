const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function block(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a,`Bloque faltante: ${start}`);return source.slice(a,b);}
const box={
  WORKERS:[],ALTAS_CORTAS:[],FINTRANS:[],OBRA:{id:'obra',fecha_inicio:'2026-03-30'},
  isoWeekDe:(_,d)=>Math.round((new Date(d)-new Date('2026-03-30T12:00'))/604800000)+1,
  _semRango:n=>n===26?['2026-09-21','2026-09-27']:['2026-09-28','2026-10-04'],
  semRange:n=>n===26?['2026-09-21','2026-09-27']:['2026-09-28','2026-10-04'],
  CIERRES:[],CTRLNOI:[],metodoPagoPredeterminado:()=> 'TRANSFERENCIA',nominaEsperada:()=>100,
  normSem:n=>String(n).replace(/\D/g,''),perDe:()=>({cve:'SEMANAL'}),montoDescuento:()=>50,
};
vm.createContext(box);
vm.runInContext(block('function asVigenteSemana(w,d1,d2){','/* Los mismos de arriba'),box);
vm.runInContext(block('function pyCandidatos(d1,d2,periodo){','/* La proyección usa importes'),box);
vm.runInContext(block('function reqCandidatos(d1,d2,sem,incluirRezago){','function openRequisicion(){'),box);
vm.runInContext(block('function retFilasDe(semStr){','function buildRetDetalleWS('),box);
vm.runInContext(block('function ctrlCierreDeSemana(sem){','function conciliaSemanaDatos(sem){'),box);
const w=(id,alta,baja='',reingreso='',estatus='ACTIVO')=>({id:String(id),no_trab:id,fecha_alta:alta,fecha_baja:baja,fecha_reingreso:reingreso,estatus,periodo_pago:'SEMANAL',monto_finiquito:100});
box.WORKERS=[
  w(1,'2026-03-30'),w(2,'2026-09-28'),
  w(3,'2026-04-01','2026-09-21','2026-09-28'),
  w(4,'2026-04-01','2026-09-29','','BAJA'),
  w(5,'2026-09-21','2026-09-22','','BAJA'),
  w(6,'2026-09-25','','','PENDIENTE'),
  w(7,'2026-09-21','2026-09-21','','BAJA'),
  w(8,'2026-04-01','2026-09-01','2026-09-24'),
  w(9,'2026-04-01','2026-09-25','2026-09-28'),
  w(10,'2026-09-30')
];
box.ALTAS_CORTAS=[{obra_id:'obra',trabajador_id:'5',anio:2026,semana:26,estado_servicio:'SIN_SERVICIO_CONFIRMADO'}];
const ids=a=>Array.from(a,x=>Number(x.id??x.w.id)).sort((a,b)=>a-b);
assert.deepStrictEqual(ids(box.asActivosSemana('2026-09-21','2026-09-27')),[1,4,6,8,9]);
assert.deepStrictEqual(ids(box.asActivosSemana('2026-09-28','2026-10-04')),[1,2,3,4,6,8,9,10]);
assert.deepStrictEqual(ids(box.pyCandidatos('2026-09-21','2026-09-27','SEMANAL').act),[1,4,8,9]);
assert.deepStrictEqual(ids(box.pyCandidatos('2026-09-21','2026-09-27','SEMANAL').fins),[7]);
assert.deepStrictEqual(ids(box.ctrlEsperadosPagoSemana(26).filter(x=>x.tipo==='NOMINA')),[1,4,8,9]);
box.WORKERS.forEach(x=>x.cuenta='CREAR');
assert.deepStrictEqual(ids(box.reqCandidatos('2026-09-21','2026-09-27',26,true).crear),[1,4,8,9]);
assert.deepStrictEqual(ids(box.reqCandidatos('2026-09-21','2026-09-27',26,false).crear),[8]);
box.DESC=[1,2,5].map(id=>({activo:true,recurrente:false,semana:'S26',trabajador_id:String(id),monto:50}));
assert.deepStrictEqual(ids(box.retFilasDe('S26').map(x=>x.w)),[1]);
assert(!box.asVigenteSemana(box.WORKERS[1],'2026-09-21','2026-09-27'));
assert(!box.asVigenteSemana(box.WORKERS[2],'2026-09-21','2026-09-27'));
assert(source.includes('window._RF.paginas[i]?window._RF.paginas[i].gente:[]'));
assert(source.includes('function incRenderRows(){'));
assert(source.includes('const base=asActivosSemana(rango[0],rango[1]);'));
console.log('Semana histórica S26/S27: altas, bajas, reingresos, sin servicio, proyección y conciliación OK');
