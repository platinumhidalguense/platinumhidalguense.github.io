// Pruebas sintéticas: calendario compartido y unidad de previsión del periodo.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),acorn=require('acorn');
const fn=(p,names)=>{const s=fs.readFileSync(p,'utf8');return acorn.parse(s,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>s.slice(n.start,n.end)).join('\n');};
const box={esVip:()=>true,sueldoInternoDe:()=>({sueldo_imss:10000,sueldo_real:12000}),isoWeek:()=>1};vm.createContext(box);vm.runInContext(require('./soporte_motores_nomina.cjs').source(),box);
vm.runInContext(fn('frontend/modulos/08-retenciones-incidencias.js',['periodoPago','retFecha','retISO','retSumarDias','rangoRetencion'])+fn('frontend/modulos/13-control-salarial-diferenciales.js',['difSugerido']),box);
const q={id:'FICTICIO',periodo_pago:'QUINCENAL'},s={...q,periodo_pago:'SEMANAL'};
for(const [ini,fin,desde,hasta]of[
 ['2026-10-26','2026-11-01','2026-10-16','2026-10-31'],
 ['2026-11-09','2026-11-15','2026-11-01','2026-11-15'],
 ['2026-11-30','2026-12-06','2026-11-16','2026-11-30'],
 ['2026-12-28','2027-01-03','2026-12-16','2026-12-31'],
 ['2026-10-12','2026-10-18','2026-10-16','2026-10-31']]){
 box.semRange=()=>[ini,fin];assert.deepEqual([...box.rangoRetencion(q,'S31')],[desde,hasta]);assert.deepEqual([...box.rangoRetencion(s,'S31')],[ini,fin]);
}
assert.equal(box.difSugerido(q),2000);assert.equal(box.difSugerido(s),2000);
box.esVip=()=>false;assert.equal(box.difSugerido(q),null);box.esVip=()=>true;
box.sueldoInternoDe=()=>({sueldo_imss:10000,sueldo_real:9999});assert.equal(box.difSugerido(q),null);
console.log('PASS calendario quincenal por fecha de pago, historial conservado, semana completa y diferencial en la unidad del trabajador.');
