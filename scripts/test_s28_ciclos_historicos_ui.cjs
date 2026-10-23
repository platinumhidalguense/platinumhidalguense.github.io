// Datos sintéticos, sin navegador ni datos personales.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const extract=(file,names)=>{const s=fs.readFileSync(file,'utf8');return acorn.parse(s,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>s.slice(n.start,n.end)).join('\n');};
const w={id:'w',obra_id:'o',no_trab:1,estatus:'BAJA',fecha_alta:'2026-08-10',fecha_baja:'2026-10-19',fecha_reingreso:'2026-10-12',monto_finiquito:221.32};
const b={WORKERS:[w],_PY_BAJAS_HISTORICAS:[],asSinServicioSemana:()=>new Set(),sb:{from:()=>({select(){return this;},eq(){return this;},order(){return this;}})},fetchAllRows:async()=>({data:[{id:'h',obra_id:'o',trabajador_id:'w',estado:'BAJA',baja:'2026-10-05',monto:'1638.29'}]})};
vm.createContext(b);vm.runInContext(extract('frontend/modulos/22-asistencia-directorio.js',['asVigenteSemana']),b);vm.runInContext(extract('frontend/modulos/10-proyeccion-nomina.js',['proyFiniquitosSemana','proyLeerBajasHistoricas','pyCandidatos']),b);
(async()=>{
 const original=JSON.stringify(w);b._PY_BAJAS_HISTORICAS=await b.proyLeerBajasHistoricas([w],'o');
 assert.equal(b.pyCandidatos('2026-10-05','2026-10-11','SEMANAL').fins[0].monto_finiquito,1638.29);
 assert.equal(b.pyCandidatos('2026-10-19','2026-10-25','SEMANAL').fins[0].monto_finiquito,221.32);
 assert.equal(JSON.stringify(w),original);
 const r={...w,fecha_reingreso:'2026-10-05',fecha_baja:'2026-10-12'};
 assert.equal(b.asVigenteSemana(r,'2026-10-05','2026-10-11'),true);
 assert.equal(b.asVigenteSemana(r,'2026-10-12','2026-10-18'),false);
 assert.equal(b.asVigenteSemana({...r,fecha_reingreso:'2026-10-07'},'2026-10-05','2026-10-11'),true);
 assert.equal(b.asVigenteSemana({...r,fecha_reingreso:'2026-10-12'},'2026-10-05','2026-10-11'),false);
 b.fetchAllRows=async()=>({error:{message:'sin conexión'}});await assert.rejects(b.proyLeerBajasHistoricas([w],'o'),/verificar/);
 console.log('PASS 8 controles de ciclos históricos y fechas ISO; no se alteran fichas ni motores.');
})().catch(e=>{console.error(e);process.exitCode=1;});
