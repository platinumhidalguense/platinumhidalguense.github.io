// Interacciones del diálogo en VM; no utiliza navegador ni datos reales.
const fs=require('fs'),vm=require('vm'),acorn=require('acorn'),assert=require('node:assert/strict');
const s=fs.readFileSync('frontend/modulos/19-cheques.js','utf8'),a=acorn.parse(s,{ecmaVersion:'latest'});
const functions=a.body.filter(n=>n.type==='FunctionDeclaration'&&['eliminarChequeErroneo','doEliminarCheque'].includes(n.id.name)).map(n=>s.slice(n.start,n.end)).join('\n');
let permiso=true,shown='',calls=[],messages=[],closed=0,reload=0,fail=false;const els=new Map();
const el=id=>els.get(id)||null;
const q={id:'Q',obra_id:'O',nombre:'PERSONA FICTICIA',num_cheque:'FISICO-1',consecutivo:'001',importe:100,estatus:'EXPEDIDO'};
const b={window:{},CHEQUES:[q],OBRA:{id:'O'},PAGOIMP:null,$:el,puedeEliminarCheque:()=>permiso,toast:m=>messages.push(m),modal:m=>shown=m,esc:String,money:String,markWrite(){},closeModal:()=>closed++,loadObraData:async()=>reload++,sb:{rpc:async(name,args)=>{calls.push({name,args});return fail?{error:{message:'Fallo simulado'}}:{data:{id:args.p_cheque_id,eliminado:true}};}}};vm.createContext(b);vm.runInContext(functions,b);let n=0;const ok=(v,m)=>{assert(v,m);n++;};
const inputs=()=>{els.set('del-motivo',{value:'Error de dedo en el cheque físico'});els.set('del-fisico-confirm',{checked:false});els.set('del-chq-btn',{disabled:false,innerHTML:''});};
(async()=>{
 await b.eliminarChequeErroneo('Q');ok(shown.includes('del-fisico-confirm'),'Numerado abre diálogo');ok(shown.includes('CANCELADO en la papelera'),'Conserva anulación física');inputs();await b.doEliminarCheque('Q');ok(!calls.length,'Exige declaración explícita');
 el('del-fisico-confirm').checked=true;el('del-motivo').value='error';await b.doEliminarCheque('Q');ok(!calls.length,'Motivo suficientemente detallado');el('del-motivo').value='Error de dedo en el cheque físico';
 await b.doEliminarCheque('Q');ok(calls[0].name==='control_eliminar_cheque_fisico','Ruta dedicada');ok(calls[0].args.p_numero_esperado==='FISICO-1'&&calls[0].args.p_consecutivo_esperado==='001','Confirma folios vistos');ok(calls[0].args.p_confirmado===true,'Envía confirmación');ok(closed===1&&reload===1,'Éxito confirmado recarga listado');
 inputs();await b.eliminarChequeErroneo('Q');el('del-fisico-confirm').checked=true;fail=true;await b.doEliminarCheque('Q');ok(!el('del-chq-btn').disabled&&closed===1,'Fallo conserva formulario');fail=false;
 b.OBRA={id:'OTRA'};await b.doEliminarCheque('Q');ok(calls.length===2,'Cambio de centro no escribe');b.OBRA={id:'O'};
 permiso=false;shown='';await b.eliminarChequeErroneo('Q');ok(!shown,'Consulta no abre eliminación');permiso=true;
 q.estatus='ENTREGADO';await b.eliminarChequeErroneo('Q');ok(messages.at(-1).includes('entregado'),'Entregado requiere revisar pago');q.estatus='PENDIENTE';q.num_cheque='';q.consecutivo='';await b.eliminarChequeErroneo('Q');ok(!shown.includes('del-fisico-confirm')&&shown.includes('no se marca CANCELADO'),'Pendiente sin folios conserva semántica');inputs();await b.doEliminarCheque('Q');ok(calls.at(-1).name==='control_eliminar_cheque','Ruta anterior preservada');
 console.log('PASS cheques con error físico: '+n+' interacciones VM de confirmación, permisos, folios, errores y cambio de centro.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
