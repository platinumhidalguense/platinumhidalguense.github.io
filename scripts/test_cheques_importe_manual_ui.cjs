const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('frontend/modulos/50-cheques-importes.js','utf8');
let permiso=true,shown='',calls=[],messages=[],loaded=0,closed=0,confirmed=true,fail=false;const els={};
const q={id:'q',obra_id:'o',importe:100,updated_at:'2026-10-29T00:00:00Z',nombre:'PERSONA FICTICIA',semana:'S31',tipo_pago:'FINIQUITO',estatus:'PENDIENTE',num_cheque:'',consecutivo:''};
const b={window:{},CHEQUES:[q],OBRA:{id:'o'},$:id=>els[id],puedeEliminarCheque:()=>permiso,esc:String,money:x=>Number(x).toFixed(2),modal:m=>shown=m,toast:m=>messages.push(m),confirm:()=>confirmed,markWrite(){},closeModal:()=>closed++,loadObraData:async()=>loaded++,sb:{rpc:async(name,args)=>{calls.push({name,args});return fail?{error:Error('Fallo simulado')}:{data:{id:args.p_id,importe:args.p_nuevo,estatus:'PENDIENTE'}};}}};vm.createContext(b);vm.runInContext(src,b);
let n=0;const ok=(v,m)=>{assert(v,m);n++;};const inputs=()=>{els['chqi-nuevo']={value:'110.25'};els['chqi-motivo']={value:'Error de captura en importe'};els['chqi-guardar']={disabled:false,textContent:''};};
(async()=>{
 b.openCorregirImporteCheque('q');ok(shown.includes('Importe actual')&&shown.includes('guardarImporteCheque()'),'Abre corrección');inputs();
 permiso=false;shown='';b.openCorregirImporteCheque('q');await b.guardarImporteCheque();ok(!shown&&!calls.length,'Permiso exigido');permiso=true;
 b.openCorregirImporteCheque('q');for(const valor of ['0','-1','NaN','1.234','1e2','']){els['chqi-nuevo'].value=valor;await b.guardarImporteCheque();ok(!calls.length,'Importe inválido '+valor);}
 els['chqi-nuevo'].value='100';await b.guardarImporteCheque();ok(!calls.length,'Sin cambios no escribe');inputs();els['chqi-motivo'].value='';await b.guardarImporteCheque();ok(!calls.length,'Motivo requerido');inputs();
 confirmed=false;await b.guardarImporteCheque();ok(!calls.length,'Cancelar confirmación no escribe');confirmed=true;
 b.OBRA={id:'otra'};await b.guardarImporteCheque();ok(!calls.length,'Cambio de obra bloqueado');b.OBRA={id:'o'};
 await b.guardarImporteCheque();ok(calls.length===1&&calls[0].name==='control_corregir_importe_cheque','RPC dedicada');ok(calls[0].args.p_anterior===100&&calls[0].args.p_nuevo===110.25&&calls[0].args.p_version===q.updated_at,'Compara importe y versión');ok(closed===1&&loaded===1,'Recarga tras confirmación del servidor');
 b.openCorregirImporteCheque('q');inputs();fail=true;await b.guardarImporteCheque();ok(!els['chqi-guardar'].disabled&&closed===1,'Error conserva formulario');fail=false;
 let release;b.sb.rpc=async()=>new Promise(r=>release=()=>r({data:{id:'q',importe:110.25,estatus:'PENDIENTE'}}));b.openCorregirImporteCheque('q');inputs();const pending=b.guardarImporteCheque();await b.guardarImporteCheque();ok(b.window._CHQ_IMPORTE.ocupado,'Doble envío bloqueado');release();await pending;ok(closed===2,'Una única descarga/confirmación');
 for(const extra of [{estatus:'EXPEDIDO'},{estatus:'ENTREGADO'},{estatus:'CANCELADO'},{num_cheque:'123'},{consecutivo:'001'},{eliminado:true}]){const old={...q};Object.assign(q,extra);shown='';b.openCorregirImporteCheque('q');ok(!shown,'No admite '+JSON.stringify(extra));Object.keys(q).forEach(k=>delete q[k]);Object.assign(q,old);}
 const original=fs.readFileSync('frontend/modulos/19-cheques.js','utf8');ok(original.includes('No se cambiará automáticamente'),'No sustituye importe silenciosamente');ok(original.includes('Corregir importe manualmente'),'Botón conectado en ficha');
 console.log('PASS importe manual: '+n+' interacciones de permiso, botón, confirmación, errores, doble envío, contexto e importes; sin navegador.');
})().catch(e=>{console.error(e);process.exitCode=1;});
