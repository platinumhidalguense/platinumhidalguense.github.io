const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),html=fs.readFileSync('index.html','utf8');
const a=html.indexOf('async function ctrlCambiarCierre('),b=html.indexOf('async function openCtrlConciliacionSelector(',a);
function setup(){let admin=false,write=false,result={data:[{id:'c',estado:'AUTORIZADO'}]},calls=0,resolve;
 const ctx={window:{},OBRA:{id:'a'},CTRL_TABLAS:{cierres:'control_cierres_nomina'},puedeEditarTrabajador:()=>write,esAdmin:()=>admin,
  confirm:()=>true,markWrite(){},ctrlFaltaScript:e=>e.message,toast:m=>ctx.messages.push(m),messages:[],ctrlAuditar:async()=>{},openCtrlCierres:async()=>{},
  sb:{from:()=>({update(){calls++;return this;},eq(){return this;},select:async()=>{if(result==='throw')throw Error('offline');if(result==='wait')return new Promise(r=>resolve=r);return result;}})}};
 vm.createContext(ctx);vm.runInContext(html.slice(a,b),ctx);
 return {ctx,admin:v=>admin=v,write:v=>write=v,result:v=>result=v,calls:()=>calls,release:r=>resolve(r)};
}
(async()=>{
 const x=setup();await x.ctx.ctrlCambiarCierre('c','AUTORIZADO');assert.equal(x.calls(),0);
 x.write(true);await x.ctx.ctrlCambiarCierre('c','AUTORIZADO');assert.equal(x.calls(),0,'Contadora no autoriza');
 await x.ctx.ctrlCambiarCierre('c','CANCELADO');assert.equal(x.calls(),0,'Contadora no cancela');
 x.admin(true);await x.ctx.ctrlCambiarCierre('c','AUTORIZADO');assert.equal(x.calls(),1);assert.equal(x.ctx.messages.at(-1),'Estado actualizado: AUTORIZADO.');
 for(const result of [{data:[]},{data:null},{error:{message:'RLS'}},'throw']){
  x.result(result);x.ctx.messages=[];await x.ctx.ctrlCambiarCierre('c','AUTORIZADO');assert(!x.ctx.messages.some(s=>s.includes('Estado actualizado:')));assert.equal(x.ctx.window._CTRL_CIERRE_BUSY,false);
 }
 x.result('wait');const pending=x.ctx.ctrlCambiarCierre('c','AUTORIZADO');const n=x.calls();await x.ctx.ctrlCambiarCierre('c','AUTORIZADO');assert.equal(x.calls(),n,'Sin doble autorización');x.release({data:[{id:'c',estado:'AUTORIZADO'}]});await pending;
 const y=setup();y.write(true);y.result({data:[{id:'c',estado:'REVISADO'}]});await y.ctx.ctrlCambiarCierre('c','REVISADO');assert.equal(y.calls(),1,'Contadora conserva envío a revisión');
 console.log('OK: consulta sin cambios, captura/revisión separadas de autorización admin, errores/cero filas no simulan éxito, y doble envío bloqueado. Backend se verifica por separado.');
})().catch(e=>{console.error(e);process.exitCode=1;});
