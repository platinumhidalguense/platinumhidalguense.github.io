const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),html=require('./fuente_frontend.cjs').html();
function fn(name){const start=html.indexOf(name);const next=/\n(?:async )?function |\n\/\* /g;next.lastIndex=start+name.length;return html.slice(start,next.exec(html).index);}
(async()=>{
 for(const result of ['ok','error','empty','null','throw']){
  const w={id:'w',obra_id:'a',estatus:'PENDIENTE',fecha_alta:'2026-10-12',pendiente_manual:false};let calls=0,allowed=false;
  const ctx={WORKERS:[w],USER:{email:'captura'},CONTRATISTAS:[],today:()=> '2026-10-16',datosFaltantes:()=>[],puedeEditarTrabajador:()=>allowed,toast(){},cargarContratistas:async()=>{},sb:{from:table=>({
   update(patch){calls++;assert.equal(table,'trabajadores');assert.equal(patch.estatus,'ACTIVO');return this;},eq(){return this;},or(){return this;},
   select:async()=>{if(result==='throw')throw Error('offline');return result==='ok'?{data:[{id:'w',estatus:'ACTIVO'}]}:result==='empty'?{data:[]}:result==='error'?{error:{message:'RLS'}}:{data:null};},
   upsert:async()=>{calls++;return {error:{message:'RLS'}};}
  })}};
  vm.createContext(ctx);vm.runInContext(fn('async function activarProgramados(')+'\n'+fn('async function sincronizarContratistas('),ctx);
  await ctx.activarProgramados();await ctx.sincronizarContratistas();assert.equal(calls,0,'Consulta no debe intentar escrituras');
  allowed=true;await ctx.activarProgramados();assert.equal(w.estatus,result==='ok'?'ACTIVO':'PENDIENTE',result);
 }
 console.log('OK: usuarios de consulta no intentan mantenimiento; activación programada exige respuesta confirmada, sin falsos éxitos por RLS, red o cero filas. Pruebas simuladas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
