const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./fuente_frontend.cjs').html();
for(const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/src=|application\/json/.test(s[1]))new vm.Script(s[2]);
function fn(name){const i=html.indexOf(name);assert(i>=0,name);const re=/\n(?:async )?function |\n\/\* /g;re.lastIndex=i+name.length;const end=re.exec(html);assert(end);return html.slice(i,end.index);}
const cheq={id:'cheque',obra_id:'obra',semana:'S26',tipo_pago:'FINIQUITO',nombre:'PRUEBA',importe:100,estatus:'PENDIENTE',num_cheque:'',consecutivo:''};
const el={'del-motivo':{value:'Pago por transferencia, cheque nunca expedido'},'del-chq-btn':{disabled:false,innerHTML:''}};
const ctx={window:{PLATINUM_PAGOS_SABADO:{abrir:()=>ctx.flowOpened++}},flowOpened:0,console,Date,USER:{id:'contabilidad',email:'conta@prueba.test'},PUEDE_ELIMINAR_CHEQUES:false,PUEDE_EDITAR_TRABAJADORES:false,ES_VIP:false,CHEQUES:[cheq],OBRA:{id:'obra'},PAGOIMP:null,
 esAdmin:()=>false,normSem:x=>String(x||'').replace(/\D/g,''),esc:x=>String(x||''),money:x=>x,modal:s=>ctx.modalHTML=s,toast:s=>ctx.messages.push(s),messages:[],closeModal:()=>ctx.closed++,closed:0,
 $:id=>el[id],markWrite:()=>ctx.writes++,writes:0,loadObraData:async()=>ctx.loaded++,loaded:0,pgRender:()=>{},cpBuild:()=>{},
 openFiniquitoTransferenciaAdmin:()=>ctx.adminOpened++,adminOpened:0,
 sb:{from:()=>({select(){return this},eq(){return this},limit:async()=>({data:[{full_access:true,activo:true,puede_escribir:true}]})}),
 rpc:async(name,args)=>{ctx.calls.push({name,args});return name==='control_puede_eliminar_cheques'?{data:true,error:null}:{data:{id:args.p_cheque_id,eliminado:true},error:null}}},calls:[]};
vm.createContext(ctx);
vm.runInContext(['async function cargaPermisos(','function puedeEliminarCheque(','async function pagoCancelarCheque(','async function eliminarChequeErroneo(','async function doEliminarCheque('].map(fn).join('\n'),ctx);
(async()=>{
 assert.equal(ctx.puedeEliminarCheque(),false);
 await ctx.cargaPermisos();assert.equal(ctx.puedeEliminarCheque(),true);assert.equal(ctx.esAdmin(),false);assert.equal(ctx.PUEDE_EDITAR_TRABAJADORES,true);
 await ctx.eliminarChequeErroneo('cheque');assert(ctx.modalHTML.includes('Motivo obligatorio'));assert(ctx.modalHTML.includes('papelera'));
 await ctx.pagoCancelarCheque('cheque');assert.equal(ctx.adminOpened,0);assert(ctx.modalHTML.includes("doEliminarCheque('cheque')"));
 const calls=ctx.calls.length;el['del-motivo'].value='';await ctx.doEliminarCheque('cheque');assert.equal(ctx.calls.length,calls);assert.equal(ctx.writes,0);
 el['del-motivo'].value='No expedido: finiquito pagado por transferencia';await ctx.doEliminarCheque('cheque');assert.equal(ctx.closed,1);assert.equal(ctx.loaded,1);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.at(-1))),{name:'control_eliminar_cheque',args:{p_cheque_id:'cheque',p_motivo:el['del-motivo'].value}});
 await ctx.doEliminarCheque('cheque');assert.equal(ctx.closed,1,'Evitar doble envío');
 el['del-chq-btn'].disabled=false;ctx.sb.rpc=async()=>({data:null,error:{message:'Permiso revocado'}});await ctx.doEliminarCheque('cheque');assert.equal(ctx.closed,1);assert.equal(el['del-chq-btn'].disabled,false);
 ctx.sb.rpc=async()=>({data:null,error:null});await ctx.doEliminarCheque('cheque');assert.equal(ctx.closed,1,'Respuesta sin filas no simula éxito');
 await ctx.cargaPermisos();assert.equal(ctx.PUEDE_ELIMINAR_CHEQUES,false);assert.equal(ctx.PUEDE_EDITAR_TRABAJADORES,true,'Permiso de cheques no altera escritura');
 const before=ctx.calls.length;await ctx.doEliminarCheque('cheque');assert.equal(ctx.calls.length,before);
 await ctx.pagoCancelarCheque('cheque');assert.equal(ctx.adminOpened,0);
 ctx.esAdmin=()=>true;assert.equal(ctx.puedeEliminarCheque(),true);const opened=ctx.flowOpened;await ctx.pagoCancelarCheque('cheque');assert.equal(ctx.flowOpened,opened+1,'Admin conserva el flujo conciliado de transferencia');assert.equal(ctx.adminOpened,0,'No restaura el formulario anterior sin vínculo');
 ctx.USER=null;assert.equal(ctx.puedeEliminarCheque(),false);
 assert(html.includes('c&&puedeEliminarCheque()?'));
 console.log('OK permiso puntual, UI/modal/importación de pagos, motivo obligatorio, RPC confirmado, error/revocación, doble envío, sin dar rol administrador');
})().catch(e=>{console.error(e);process.exitCode=1});
