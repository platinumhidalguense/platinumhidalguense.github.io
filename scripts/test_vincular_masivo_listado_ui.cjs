const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('frontend/modulos/35-centro-control.js','utf8');
const fragment=source.slice(source.indexOf('async function openCtrlCierres('),source.indexOf('async function ctrlRevisarPagosSemana('));
const element={innerHTML:''};let write=true,vip=true,admin=false;
const filas=['BORRADOR','REVISADO','AUTORIZADO','TIMBRADO','PAGADO','CANCELADO'].map((estado,i)=>({id:'c'+i,estado,semana:26-i,periodo:'SEMANAL',total_neto:100,total_trabajadores:1,created_at:'2026-10-01'}));
const box={window:{},Date,CTRL_TABLAS:{cierres:'cierres'},ctrlAuditar:()=>{},modal:()=>{},ctrlNav:()=>'',ctrlLeer:async()=>({data:filas,error:null}),$:()=>element,esc:String,ctrlEstado:String,money:String,ctrlTabla:(h,r)=>r.join(''),esAdmin:()=>admin,esVip:()=>vip,puedeEditarTrabajador:()=>write};
vm.createContext(box);vm.runInContext(fragment,box);
(async()=>{
 await box.openCtrlCierres();assert.equal((element.innerHTML.match(/Vincular comprobantes masivamente/g)||[]).length,3);
 for(const id of ['c2','c3','c4'])assert(element.innerHTML.includes(`PLATINUM_FLOWS.revisarComprobantes('${id}')`));
 for(const id of ['c0','c1','c5'])assert(!element.innerHTML.includes(`PLATINUM_FLOWS.revisarComprobantes('${id}')`));
 write=false;await box.openCtrlCierres();assert(!element.innerHTML.includes('Vincular comprobantes masivamente'));
 write=true;vip=false;await box.openCtrlCierres();assert(!element.innerHTML.includes('Vincular comprobantes masivamente'));
 admin=true;await box.openCtrlCierres();assert.equal((element.innerHTML.match(/Vincular comprobantes masivamente/g)||[]).length,3);
 console.log('PASS acceso directo a vinculación masiva: estados cerrados, VIP/administrador, consulta sin acción y mismo método integrado.');
})().catch(e=>{console.error(e);process.exitCode=1;});
