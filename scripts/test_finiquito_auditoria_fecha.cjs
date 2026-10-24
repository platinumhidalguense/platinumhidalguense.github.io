// Adaptador de lectura aislado: fechas efectivas, sin modificar el motor ni las filas.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const src=fs.readFileSync('frontend/modulos/10-proyeccion-nomina.js','utf8');
const f=acorn.parse(src,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='proyLeerFiniquitos');
let table,failed=false;const audits=[{id:'a',obra_id:'o',trabajador_id:'w',periodo:'2026-09-24',entradas:{fecha_calculo:'2026-09-21'},resultado:{infonavit:0},monto_aplicado:517.42,created_at:'2026-09-24'}];
const history=[{id:1,obra_id:'o',trabajador_id:'w',fecha:'2026-10-23',datos_despues:{version:'AJUSTE_NOI_CONCEPTOS_V1',periodo:'2026-09-21',resultado:{infonavit:141.8,fonacot:0},monto_aplicado:517.42}}];
const chain={select(){return this},in(){return this},eq(){return this},order(){return this}};
const box={sb:{from:n=>{table=n;return chain;}},fetchAllRows:async q=>{q();return failed?{error:{message:'Fallo ficticio'}}:{data:table==='historial'?history:audits};}};
vm.createContext(box);vm.runInContext(src.slice(f.start,f.end),box);
(async()=>{const before=JSON.stringify({audits,history});const out=await box.proyLeerFiniquitos([{id:'w'}]);
 assert.equal(out[0].resultado.infonavit,141.8);assert.equal(out[0].monto_aplicado,517.42);assert.equal(out[1].periodo,'2026-09-21');assert.equal(out[1].periodo_captura,'2026-09-24');assert.equal(JSON.stringify({audits,history}),before);
 failed=true;await assert.rejects(box.proyLeerFiniquitos([{id:'w'}]),/Fallo ficticio/);
 console.log('PASS 6 controles de finiquito: fecha efectiva, periodo original conservado, prioridad del desglose documental, neto intacto y fallo seguro.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
