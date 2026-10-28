const fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn'),assert=require('node:assert/strict');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
const main=fs.readFileSync('frontend/modulos/19-cheques.js','utf8')+'\n'+fs.readFileSync('frontend/modulos/15-banca-conciliacion.js','utf8');const tree=acorn.parse(main,{ecmaVersion:'latest'});
const fn=name=>{const f=tree.body.find(x=>x.type==='FunctionDeclaration'&&x.id.name===name);return main.slice(f.start,f.end);};
let nodes={},messages=[],writes=[],deleted=[],shown='',admin=false;
const el=id=>nodes[id]||(nodes[id]={value:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}}});
const q={id:'q',trabajador_id:'w',obra_id:'o',nombre:'PERSONA PRUEBA',importe:2000,tipo_pago:'CHEQUE',semana:'S1',estatus:'PENDIENTE',num_cheque:'',consecutivo:''};
const c={window:{},CHEQUES:[q],WORKERS:[],PAGOS:[],PAGOIMP:null,cpBuild(){},USER:{email:'prueba@example.test'},OBRA:{id:'o'},CSORT:{k:'semana',asc:true},normSem:x=>String(x).replace(/\D/g,''),$:el,toast:(m,t)=>messages.push(m),puedeEliminarCheque:()=>admin,esAdmin:()=>admin,money:x=>Number(x||0).toFixed(2),esc:x=>String(x??''),modal:s=>shown=s,confirm:()=>true,markWrite(){},today:()=> '2026-10-17',loadObraData:async()=>{},openFiniquitoTransferenciaAdmin:()=>{},sb:{from:()=>({update:d=>({eq:async()=>{writes.push(d);return{};}})})}};
vm.createContext(c);vm.runInContext(['pagoCancelarCheque','eliminarChequeErroneo','renderChqStats','chqFiltered','saveCheque','crCrearFaltantes'].map(fn).join('\n'),c);c.eliminarChequeErroneoOriginal=c.eliminarChequeErroneo;c.eliminarChequeErroneo=id=>deleted.push(id);
(async()=>{
 await c.pagoCancelarCheque('q');ok(deleted.length===1&&!writes.length,'Sin folios ruta eliminar, nunca cancelar');q.num_cheque='1001';await c.pagoCancelarCheque('q');ok(!writes.length&&messages.at(-1).includes('Completa'),'Folio parcial exige revisar');q.consecutivo='1';await c.pagoCancelarCheque('q');ok(writes.length===1&&writes[0].estatus==='CANCELADO','Físico completo puede cancelarse');
 admin=true;await c.eliminarChequeErroneoOriginal('q');ok(shown.includes('del-fisico-confirm'),'El físico requiere declaración explícita de error');q.num_cheque='';q.consecutivo='';await c.eliminarChequeErroneoOriginal('q');ok(shown.includes('no se marca CANCELADO'),'Importe positivo sin folios no se confunde con físico');admin=false;shown='';await c.eliminarChequeErroneoOriginal('q');ok(!shown,'Consulta no abre eliminación');
 c.CHEQUES=[q,{...q,id:'deleted',estatus:'CANCELADO',eliminado:true}];el('chq-q').value='';el('chq-f-estatus').value='';el('chq-f-tipo').value='';ok(c.chqFiltered().length===1,'Lista no incluye papelera');c.renderChqStats();ok(el('chq-stats').innerHTML.includes('<div class="n">1</div><div class="l">Total cheques'),'Totales no incluyen papelera');
 el('f-c-nombre').value='PRUEBA';el('c-estatus').value='CANCELADO';el('f-c-num').value='';el('f-c-consec').value='';await c.saveCheque(null);ok(writes.length===1&&messages.at(-1).includes('Sólo se cancela'),'Guardar valida antes de lecturas o escrituras');
 const s=fn('crCrearFaltantes');ok(s.includes("x.tp==='FINIQUITO'")&&s.includes('x.info.neto>0')&&s.includes('!finTransDe'),'Importar recibos no crea nómina ni finiquito transferido');
 ok(fn('crAnalizar').includes("tp==='FINIQUITO'?'FALTA':'REVISION_PAGO'"),'Recibo de sueldo sin cheque no se marca faltante');
 ok(main.includes('c.estatus!==\'CANCELADO\'&&c.trabajador_id'),'Recibos excluyen cheque cancelado');
 console.log(`PASS cheques físicos / eliminación: ${n} contratos UI sin navegador.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
