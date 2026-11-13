const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const {window,document}=parseHTML('<div id="modal"></div>'),$=id=>document.getElementById(id);
const original={id:'q',obra_id:'o',trabajador_id:'w-historico',no_trab:7,nombre:'PERSONA HISTÓRICA',contratista:'CONTRATISTA HISTÓRICO',puesto:'PUESTO ORIGINAL',curp:'PRUP900101HHGXXX01',semana:'S3',periodo:'PERIODO ORIGINAL',tipo_pago:'FINIQUITO',importe:100.01,estatus:'ENTREGADO',num_cheque:'123456',consecutivo:'00451',updated_at:'2026-01-01T00:00:00Z',created_at:'2026-01-01T00:00:00Z'};
let requests=[],server=structuredClone(original),replacement=null,lost=false,paid=false,denied=false,opened=[],saved=null,read=[];
const rpc=async(name,{p_accion:a,p_datos:p})=>{
 assert.equal(name,'control_cancelar_reponer_cheque');requests.push({a,p});if(denied)return{error:{message:'Sin permiso'}};
 if(replacement)return{data:{estado:'EXISTENTE',original:server,reemplazo:replacement}};
 if(paid)return{data:{estado:'BLOQUEADO_PAGO',original:server,operaciones:[{pago_id:'pago-exacto',folio:'BBVA123',fecha:'2026-01-09',importe:100.01,estado:'EXITOSO',resolucion:'Conciliar esta transferencia, sin reposición.'}]}};
 if(a==='PREPARAR')return{data:{estado:'LISTO',original:structuredClone(server),contexto:{centro:'CENTRO ORIGINAL',anio:2026}}};
 server={...server,estatus:'CANCELADO'};replacement={...original,id:'nuevo',estatus:'PENDIENTE',num_cheque:'',consecutivo:'',reemplaza_cheque_id:original.id};
 if(lost){lost=false;return{error:{message:'Se perdió la respuesta; reintenta el mismo cheque'}};}return{data:{estado:'COMPLETO',original:server,reemplazo:replacement}};
};
const b={window,document,$,sb:{rpc},crypto:{randomUUID:()=> 'operacion-unica'},OBRA:{id:'o'},USER:{id:'u',email:'conta@prueba.test'},CHEQUES:[structuredClone(original)],WORKERS:[],VIEW:'conciliador',
 puedeEditarTrabajador:()=>!denied,esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),money:x=>Number(x).toFixed(2),
 modal:h=>$('modal').innerHTML=h,closeModal:()=>$('modal').innerHTML='',toast:()=>{},markWrite:()=>{},renderChqStats:()=>{},openChequeForm:id=>opened.push(id)};
vm.createContext(b);vm.runInContext(fs.readFileSync('frontend/modulos/86-cancelacion-reposicion-cheques.js','utf8'),b);
(async()=>{
 const api=window.PLATINUM_CHEQUES_REPOSICION;
 await api.cancelar('q');assert($('cr-detalle').textContent.includes('123456'));assert($('cr-detalle').textContent.includes('00451'));assert($('cr-detalle').textContent.includes('CENTRO ORIGINAL, 2026, S3 y FINIQUITO'));assert($('cr-detalle').textContent.includes('$100.01'));
 $('cr-motivo').value='Error físico';lost=true;await $('cr-confirmar').onclick();assert($('cr-error').textContent.includes('Se perdió'));assert.equal(b.CHEQUES.length,1,'No simula éxito al perder respuesta');assert.equal($('cr-confirmar').disabled,false);
 await $('cr-confirmar').onclick();assert($('cr-detalle').textContent.includes('reposición activa'));assert.equal(b.CHEQUES.length,2);assert.equal(b.CHEQUES[0].estatus,'CANCELADO');assert.equal(b.CHEQUES[1].num_cheque,'');
 const confirms=requests.filter(r=>r.a==='CONFIRMAR');assert.equal(confirms[0].p.operacion_id,confirms[1].p.operacion_id,'Reintento conserva identidad de operación');
 [...$('cr-detalle').querySelectorAll('button')].find(x=>x.textContent==='Capturar nuevo cheque').onclick();assert.deepEqual(opened,['nuevo']);
 // Captura existente con trabajador ausente del padrón actual: sólo cambian los folios.
 b.fld=(id,label,value,opts={})=>`<label>${label}<input id="f-${id}" value="${b.esc(value??'')}" ${opts.extra||''}></label>`;
 b.fullName=w=>w.nombre||'OTRA PERSONA';b.isoWeek=()=>33;b.periodoCorto=()=> 'OTRO PERIODO';b.puedeEliminarCheque=()=>false;b.normSem=s=>String(s).replace(/\D/g,'');b.loadObraData=async()=>{};b.chequeDuplicado=()=>null;
 window.PLATINUM_FLOWS={resolverNeto:async p=>{read.push(p);return{neto:100.01,origen:'PDF TIMBRADO',desde:'2026-01-01',hasta:'2026-01-07'};}};
 b.sb={rpc,from:()=>({update:rec=>({eq:async()=>{saved=rec;return{};}})})};
 vm.runInContext(fs.readFileSync('frontend/modulos/19-cheques.js','utf8'),b);b.openChequeForm('nuevo');
 Object.defineProperty($('c-tipo'),'value',{value:'FINIQUITO'});
 assert.equal($('c-nombre').readOnly,true);assert.equal($('f-c-periodo').readOnly,true);assert.equal($('c-tipo').disabled,true);
 await b.chqTraerRecibo();assert.equal(read[0].trabajador_id,'w-historico');assert.equal(read[0].semana,'S3');
 $('f-c-num').value='NUEVO-100';$('f-c-consec').value='900';Object.defineProperty($('c-estatus'),'value',{value:'EXPEDIDO'});await b.saveCheque('nuevo');
 assert.equal(saved.trabajador_id,original.trabajador_id);assert.equal(saved.contratista,original.contratista);assert.equal(saved.periodo,original.periodo);assert.equal(saved.importe,100.01);assert.equal(saved.estatus,'EXPEDIDO');
 // Un banco exitoso se muestra como operación concreta y no permite confirmar otra reposición.
 server=structuredClone(original);replacement=null;paid=true;b.CHEQUES=[structuredClone(original)];await api.cancelar('q');assert($('cr-detalle').textContent.includes('pago-exacto'));assert($('cr-detalle').textContent.includes('BBVA123'));assert.equal($('cr-confirmar').hidden,true);
 const ctx=api.crear({rpc:async()=>({data:{estado:'LISTO'}}),uuid:()=> 'id'});let release,calls=0;
 const dual=api.crear({uuid:()=> 'op',rpc:async()=>{calls++;return await new Promise(r=>release=r);}}),pre={original};const p1=dual.confirmar(pre,'Motivo válido'),p2=dual.confirmar(pre,'Motivo válido');assert.equal(p1,p2);assert.equal(calls,1);release({data:{estado:'BLOQUEADO_PAGO'}});await p1;
 console.log('PASS cancelación/reposición UI: confirmación concreta, reintento, doble clic, pendiente, captura histórica sin padrón y bloqueo bancario. DOM sintético, sin navegador.');
})().catch(e=>{console.error(e);process.exitCode=1;});
