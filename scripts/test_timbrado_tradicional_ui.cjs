// Contratos sintéticos: no abre navegador ni conecta a la base real.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const box={Date,Intl,confirm:()=>true};box.window=box;vm.createContext(box);
vm.runInContext(fs.readFileSync('frontend/modulos/44-respaldo-recibos.js','utf8'),box);
const parse=box.PLATINUM_RESPALDO_RECIBO.parsear;
const texto='EMP900101AA1 PRUP900101AA1 Periodo del: 21/sep./2026 al 27/sep./2026 Neto pagado: 517.42 Total percepciones: 664.44 Total otros pagos: 0.00 Total deducciones sin ISR: 141.80 ISR retenido: 5.22 Folio fiscal: 10000000-0000-4000-8000-000000000099 Sello Digital del SAT: '+'AbCd1234+/'.repeat(10);
let n=0;let p=parse(texto);assert.equal(p.datos.deducciones,147.02);assert.equal(p.neto,517.42);assert.equal(p.errores.length,0);assert.equal(p.datos.periodo_fin,'2026-09-27');n+=4;
assert.equal(parse(texto.replace('otros pagos: 0.00','otros pagos: 10.00').replace('pagado: 517.42','pagado: 527.42')).errores.length,0);n++;
assert.equal(parse(texto+' Total deducciones: 140.00').errores.length,2);n++;
assert.equal(parse(texto.replace('pagado: 517.42','pagado: 518.42')).errores.length,1);n++;
assert.equal(parse(texto+' AGUINALDO').tipo,null);n++;
let calls=[],messages=[],view='',active=0,maxActive=0,mode='ok',seen=new Set();
const cierre={id:'c',obra_id:'o',semana:29,estado:'AUTORIZADO',snapshot:{items:Array.from({length:7},(_,i)=>({trabajador_id:'w'+i,numero:i+1,nombre:'PERSONA FICTICIA '+i,tipo:'NOMINA',monto:517.42}))}};
const ctx={obra:{id:'o',nombre:'FICTICIA'},sb:{rpc:async(_,q)=>{calls.push(q);
 if(q.p_accion==='PERMISOS')return{data:{escritura:true,aprobar_cierre:true}};
 if(q.p_accion==='DETALLE')return{data:{cierre,flujo:{version_id:'v'},diagnostico:{filas:[]},saldos:[],versiones:[],solicitudes:[],recibos_sin_leer:cierre.snapshot.items.filter(x=>!seen.has(x.trabajador_id)).map(x=>({id:'d'+x.trabajador_id,trabajador_id:x.trabajador_id,archivo:x.trabajador_id+'.pdf'}))}};
 if(q.p_accion==='RECIBO'){seen.add(q.p_datos.documento_id.slice(1));return{data:{ok:true}};}
 return{data:{ok:true}};
}}};
vm.runInContext(fs.readFileSync('platinum-workflows.js','utf8'),box);
box.PLATINUM_FLOWS.configure({context:()=>ctx,esc:String,money:String,$:()=>null,table:(_,r)=>r.join(''),modal:x=>view=x,toast:x=>messages.push(x),reload:async()=>{},readReceipt:async()=>{active++;maxActive=Math.max(active,maxActive);await new Promise(r=>setImmediate(r));active--;if(mode==='error')throw Error('Folio ilegible en PDF ficticio');return p;}});
(async()=>{
 await box.PLATINUM_FLOWS.transicion('c','TIMBRADO');assert.equal(calls.filter(x=>x.p_accion==='RECIBO').length,7);n++;
 assert(maxActive<=3&&maxActive>1);n++;
 assert.equal(calls.find(x=>x.p_accion==='RECIBO').p_datos.tipo,'NOMINA');n++;
 assert(calls.find(x=>x.p_accion==='RECIBO').p_datos.cierre_id==='c');n++;
 assert(calls.some(x=>x.p_accion==='TRANSICION'));n++;
 seen=new Set();calls=[];mode='error';await box.PLATINUM_FLOWS.transicion('c','TIMBRADO');
 assert(!calls.some(x=>x.p_accion==='TRANSICION'));assert(view.includes('Folio ilegible en PDF ficticio'));assert(view.includes('PERSONA FICTICIA'));n+=3;
 calls=[];mode='ok';cierre.snapshot.items.push({...cierre.snapshot.items[0],tipo:'FINIQUITO'});await box.PLATINUM_FLOWS.transicion('c','TIMBRADO');
 assert(!calls.some(x=>x.p_accion==='TRANSICION'));assert(view.includes('ambiguo'));n+=2;
 cierre.snapshot.items.pop();ctx.workers=[{id:'w0',rfc:'OTRO900101AA1'}];calls=[];seen=new Set();await box.PLATINUM_FLOWS.transicion('c','TIMBRADO');
 assert(!calls.some(x=>x.p_accion==='TRANSICION'));assert(view.includes('RFC del receptor'));n+=2;
 console.log('PASS '+n+' controles de lector NOI y timbrado: ISR separado, otros pagos, fechas, contradicciones, clasificación por cierre, concurrencia y errores por trabajador.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
