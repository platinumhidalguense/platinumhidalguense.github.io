// Contratos de interfaz sin navegador ni red.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let modal='',messages=[],calls=[],admin=false,changed=false,selected=null;
const ctx={obra:{id:'o'},empresaNombre:'PLATINUM',sb:{rpc:async(name,p)=>{
 calls.push({name,p});if(name==='control_flujo_operar'){
  if(p.p_accion==='DETALLE')return{data:{cierre:{id:p.p_datos.cierre_id,obra_id:ctx.obra.id,semana:28,total_neto:10,estado:'REVISADO'},flujo:null,diagnostico:{filas:[]},saldos:[],versiones:[],solicitudes:[]}};
  return{data:{admin,escritura:false}};
 }
 if(changed)ctx.obra={id:'otro'};
 return{data:{solo_lectura:true,requiere_aprobacion:true,cierres:[{id:'c',obra_id:'o',empresa:'PLATINUM',centro:'OBRA FICTICIA',semana:28,estado:'REVISADO',total:10,trabajadores:1,noi:1,pdf:1,xml:0,pdf_sin_leer:1,pendientes:1,fuera_snapshot:0}]}};
}}};
const box={console,Date,Intl};vm.createContext(box);vm.runInContext(fs.readFileSync('platinum-workflows.js','utf8'),box);
const flow=box.PLATINUM_FLOWS;flow.configure({context:()=>ctx,$:()=>null,esc:s=>String(s??''),money:s=>String(s),table:(h,r)=>h.join('|')+r.join(''),modal:s=>modal=s,toast:s=>messages.push(s),go:async id=>{selected=id;ctx.obra={id,nombre:'OBRA FICTICIA'};}});
(async()=>{
 await flow.historicos(true);assert(!calls.some(c=>c.name==='control_revision_historica'));assert.match(messages.pop(),/administrador/);
 await flow.historicos(false);assert.match(modal,/OBRA FICTICIA/);assert.match(modal,/Revisar sin cambiar/);assert.equal(calls.at(-1).p.p_obra,'o');
 for(const match of modal.matchAll(/onclick="PLATINUM_FLOWS\.(\w+)\(/g))assert.equal(typeof flow[match[1]],'function');
 changed=true;modal='';await flow.historicos(false);assert.equal(modal,'');assert.match(messages.pop(),/Cambió el centro/);
 changed=false;admin=true;await flow.historicos(true);assert.equal(calls.at(-1).p.p_obra,null);
 await flow.abrirHistorico('o','c');assert.equal(selected,'o');assert.match(modal,/Nómina integrada/);
 assert(calls.every(c=>c.name==='control_revision_historica'||['PERMISOS','DETALLE'].includes(c.p.p_accion)),'La revisión no usa RPC de escritura');
 console.log('PASS 7 contratos de revisión histórica: permisos, alcance, botones, apertura de cierre, contexto y sólo lectura.');
})().catch(e=>{console.error(e);process.exitCode=1;});
