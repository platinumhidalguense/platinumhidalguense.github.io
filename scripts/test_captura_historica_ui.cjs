// Contratos del adaptador: datos ficticios, sin UI, red ni escrituras.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const src=fs.readFileSync('frontend/modulos/38-adaptadores-arranque.js','utf8'),node=acorn.parse(src,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='proySnapshotIntegrado');
const w={id:'W',obra_id:'O',no_trab:1,estatus:'BAJA',fecha_alta:'2026-06-01',fecha_baja:'2026-10-19',fecha_reingreso:'2026-10-12'},ws=[w],ds=[{id:'D',activo:false}],cs=[{...w,fecha_baja:'2026-09-21',monto_finiquito:100}];
let historical=true,failed=false,move=false,calls=0;
const b={Date,WORKERS:ws,DESC:ds,DIFS:[],FINTRANS:[],OBRA:{id:'O',nombre:'FICTICIA'},_PY_BAJAS_HISTORICAS:cs,window:{PLATINUM_FLOWS:{call:async()=>({fuente:'F'})}},
 pyDatosFrescos:async()=>true,semRange:()=>['2026-09-21','2026-09-27'],today:()=>historical?'2026-10-24':'2026-09-20',
 proyLeerContextoHistorico:async()=>{calls++;if(move)b.DESC=[];return{personal:[{...w,estatus:'BAJA',fecha_baja:'2026-09-21',monto_finiquito:99}],descuentos:[{id:'D',activo:true}],trazabilidad:{version:1}};},
 pyCandidatos:()=>{if(failed)throw Error('Ciclo duplicado ficticio');if(historical){assert.equal(b.WORKERS[0].monto_finiquito,100);assert.equal(b._PY_BAJAS_HISTORICAS.length,0);}return{act:[b.WORKERS[0]],fins:[]};},
 proyLeerFiniquitos:async()=>[],proyModelo:act=>{if(historical)assert.equal(b.DESC[0].activo,true);return{neto:100,filas:act.map(w=>({w,fin:false,sueldo:120,prevision:0,incidencias:0,creditos:20,otras:0,neto:100,pago:'TRANSFERENCIA',items:[]}))};},
 empresaDeObra:()=> 'PLATINUM',fullName:()=> 'PERSONA FICTICIA',MOTOR_NOMINA_VERSION:'PRUEBA',rrhhReferenciasModelo:()=>({}),redondearCentavos:x=>Math.round(x*100)/100};vm.createContext(b);vm.runInContext(src.slice(node.start,node.end),b);
(async()=>{let n=0,r=await b.proySnapshotIntegrado(26,'SEMANAL');assert.equal(r.snapshot.total_neto,100);assert.equal(r.snapshot.contexto_historico.version,1);assert.equal(r.snapshot.total_trabajadores,1);n+=3;
 assert.strictEqual(b.WORKERS,ws);assert.strictEqual(b.DESC,ds);assert.strictEqual(b._PY_BAJAS_HISTORICAS,cs);n+=3;
 failed=true;await assert.rejects(b.proySnapshotIntegrado(26,'SEMANAL'),/duplicado/);assert.strictEqual(b.WORKERS,ws);assert.strictEqual(b._PY_BAJAS_HISTORICAS,cs);n+=3;failed=false;
 historical=false;let count=calls;r=await b.proySnapshotIntegrado(26,'SEMANAL');assert.equal(calls,count);assert.equal(r.snapshot.contexto_historico,undefined);n+=2;
 historical=true;move=true;await assert.rejects(b.proySnapshotIntegrado(26,'SEMANAL'),/Cambiaron/);assert.strictEqual(b.WORKERS,ws);n+=2;
 console.log('PASS '+n+' controles de captura: ciclo único, modelo coherente, restauración de globals, no consulta histórica futura y cambio de fuentes bloqueado.');})().catch(e=>{console.error(e);process.exitCode=1;});
