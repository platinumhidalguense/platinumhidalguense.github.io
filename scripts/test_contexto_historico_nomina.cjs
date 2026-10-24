// Identidades y créditos sintéticos; no red, navegador ni producción.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const b={Date};vm.createContext(b);vm.runInContext(fs.readFileSync('frontend/modulos/47-contexto-historico-nomina.js','utf8'),b);
const obra='OBRA',w={id:'W',obra_id:obra,no_trab:1,estatus:'BAJA',fecha_alta:'2026-06-01',fecha_baja:'2026-10-19',fecha_reingreso:'2026-10-12',monto_finiquito:200};
const d={id:'D',obra_id:obra,trabajador_id:w.id,tipo:'INFONAVIT',recurrente:true,activo:false,monto:60,factor:250,created_at:'2026-07-01',updated_at:'2026-10-01',ajustes_semana:{S26:{importe_base:61}}};
const h={id:1,obra_id:obra,trabajador_id:w.id,fecha:'2026-09-24',alta:w.fecha_alta,baja:'2026-09-07',reingreso:'2026-09-14',estado:'ACTIVO',monto:null};
const c={id:2,obra_id:obra,trabajador_id:w.id,fecha:'2026-09-25',datos_despues:{...d,activo:true,monto:65,factor:260}};
const ctx={obra_id:obra,hasta:'2026-09-27',corte:'2026-09-28T05:59:59.999Z',laboral:[h],credito:[c]},resolve=(ws=[w],ds=[d],x=ctx)=>b.proyResolverContextoHistorico(ws,ds,x);
let n=0;const original=JSON.stringify({w,d,h,c});let r=resolve();assert.equal(r.personal[0].fecha_reingreso,'2026-09-14');assert.equal(r.personal[0].estatus,'ACTIVO');assert.equal(r.descuentos[0].activo,true);assert.equal(r.descuentos[0].monto,65);assert.equal(r.descuentos[0].ajustes_semana.S26.importe_base,61);n+=5;
assert.equal(JSON.stringify({w,d,h,c}),original);assert.equal(r.trazabilidad.referencias.length,2);n+=2;
// La baja anterior a S26 no se convierte en una semana trabajada.
r=resolve([w],[d],{...ctx,laboral:[{...h,baja:'2026-08-31',reingreso:null,estado:'BAJA',monto:'221.32'}]});assert.equal(r.personal[0].estatus,'BAJA');assert.equal(r.personal[0].monto_finiquito,221.32);n+=2;
// Baja efectiva en la semana, aunque capturada después del domingo.
r=resolve([w],[d],{...ctx,laboral:[h,{...h,id:3,fecha:'2026-09-30',baja:'2026-09-21',estado:'BAJA',monto:'0'}]});assert.equal(r.personal[0].fecha_baja,'2026-09-21');assert.equal(r.personal[0].monto_finiquito,0);n+=2;
assert.throws(()=>resolve([w],[d],{...ctx,laboral:[]}),/historial laboral/);n++;
assert.throws(()=>resolve([w],[d],{...ctx,credito:[]}),/versión histórica/);n++;
assert.throws(()=>resolve([w],[d],{...ctx,credito:[{...c,datos_despues:{...c.datos_despues,trabajador_id:'OTRO'}}]}),/no corresponde/);n++;
r=resolve([w],[{...d,created_at:'2026-10-01'}],{...ctx,credito:[]});assert.equal(r.descuentos[0].activo,false);n++;
const after={...c,fecha:'2026-10-01',datos_antes:{...d,activo:true,monto:65},datos_despues:{...d}};assert.equal(resolve([w],[d],{...ctx,credito:[after]}).descuentos[0].monto,65);n++;
assert.equal(resolve([{...w,fecha_reingreso:'2026-09-14'}],[d],{...ctx,laboral:[]}).personal[0].fecha_reingreso,'2026-09-14');n++;
assert.strictEqual(resolve([{...w,obra_id:'OTRA'}],[d],{...ctx,laboral:[]}).personal[0].obra_id,'OTRA');n++;
const req=[];b.sb={from:t=>({select:columns=>{const q={eq:(k,v)=>(req.push([t,k,v]),q),in:()=>q,lte:()=>q,order:()=>q};return q;}})};b.fetchAllRows=async()=>({data:[],error:{message:'Fallo sintético'}});
(async()=>{await assert.rejects(b.proyLeerContextoHistorico([w],[d],obra,ctx.hasta),/fuente histórica completa/);n++;assert(req.every(q=>q[1]==='obra_id'&&q[2]===obra));n++;console.log('PASS '+n+' controles históricos: ciclos, fechas efectivas, créditos, confirmaciones por periodo, alcance, paginación y no mutación.');})().catch(e=>{console.error(e);process.exitCode=1;});
