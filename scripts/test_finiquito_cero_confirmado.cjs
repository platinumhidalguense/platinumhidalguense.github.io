// Datos ficticios: cero explícito con retención confirmada no significa ausente.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const src=fs.readFileSync('frontend/modulos/10-proyeccion-nomina.js','utf8');
const names=['proyFiniquitosSemana','proyCargarHistoricos','proyFiniquito','pyCandidatos'];
const code=acorn.parse(src,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>src.slice(n.start,n.end)).join('\n');
const w={id:'w',obra_id:'o',estatus:'BAJA',fecha_baja:'2026-10-19',no_trab:1,monto_finiquito:0};
const a={trabajador_id:w.id,obra_id:w.obra_id,periodo:w.fecha_baja,monto_aplicado:0,resultado:{finiquito_cero_retencion_confirmada:true,infonavit:221.32}};
const calls=[],b={DESC:[{trabajador_id:w.id,tipo:'INFONAVIT',activo:true,monto:240.05,excepciones:{S30:'DOBLE'}}],WORKERS:[w],_PY_FINIQUITOS_HISTORICOS:[a],
 redondearCentavos:n=>Math.round(Number(n)*100)/100,fullName:()=> 'PERSONA FICTICIA',asSinServicioSemana:()=>new Set(),asVigenteSemana:()=>false,
 proyLeerFiniquitos:async personal=>{calls.push(personal);return [a];}};
vm.createContext(b);vm.runInContext(code,b);
const get=(p=[w],h=[a])=>b.proyFiniquitosSemana(p,'2026-10-19','2026-10-25',h);
assert.equal(get().length,1);
assert.equal(get([w],[]).length,0);
assert.equal(get([{...w,monto_finiquito:null}]).length,0);
assert.equal(get([{...w,monto_finiquito:''}]).length,0);
assert.equal(get([w],[{...a,obra_id:'otra'}]).length,0);
assert.equal(get([w],[{...a,periodo:'2026-10-12'}]).length,0);
assert.equal(get([w],[{...a,monto_aplicado:null}]).length,0);
assert.equal(get([w],[{...a,resultado:{infonavit:221.32}}]).length,0);
assert.equal(get([{...w,estatus:'ACTIVO',fecha_reingreso:'2026-10-26'}]).length,1);
const x=b.proyFiniquito(w,[a]);assert.equal(x.neto,0);assert.equal(x.creditos,221.32);assert.equal(x.costo,221.32);assert.equal(x.items.length,1);assert.equal(x.items[0].monto,221.32);
assert.equal(b.pyCandidatos('2026-10-19','2026-10-25','SEMANAL').fins.length,1);
b.asSinServicioSemana=()=>new Set(['w']);assert.equal(b.pyCandidatos('2026-10-19','2026-10-25','SEMANAL').fins.length,0);
(async()=>{
 await b.proyCargarHistoricos([w,{...w,id:'sin-monto',monto_finiquito:null},{...w,id:'positivo',monto_finiquito:50}]);
 assert.deepEqual(Array.from(calls[0],x=>x.id),['w']);
 assert.equal(w.monto_finiquito,0);assert.equal(b.DESC[0].monto,240.05);
 console.log('PASS 19 controles de finiquito cero confirmado: desglose, costo, neto, alcance, fecha, reingreso, sin servicio y datos intactos. No se crean cheques.');
})().catch(e=>{console.error(e);process.exitCode=1;});
