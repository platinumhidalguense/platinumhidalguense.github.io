const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('frontend/modulos/51-recibos-verificacion.js','utf8');let docs=[],saved=new Set(),calls=[],failIds=new Set(),reads=0,concurrent=0,maxConcurrent=0,gate=null,html='',messages=[];const els={};
const b={window:{},OBRA:{id:'o'},USER:{id:'u'},$:id=>els[id],markWrite(){},setTimeout:r=>{r();},toast:m=>messages.push(m),
 modal:s=>{html=s;for(const id of ['rv-progreso','rv-errores','rv-iniciar'])els[id]={textContent:'',innerHTML:'',disabled:false};},
 ctrlTabla:(h,rs)=>h.join(' ')+rs.join(''),leerReciboArchivado:async(doc,bytes)=>{reads++;concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);if(gate)await gate;
  try{if(failIds.has(doc.id))throw Error('PDF ficticio sin texto');return{neto:100,tipo:null,datos:{cfdi_uuid:'UUID_FICTICIO',evidencia_timbrado:'SELLO_FICTICIO'}};}finally{concurrent--;}},
 sb:{rpc:async(name,{p_accion:a,p_datos:p})=>{calls.push({a,p});if(a==='RECIBOS_RESUMEN')return{data:{obra_id:'o',escritura:true,semanas:[{semana:30,archivados:docs.length,verificados:saved.size,pendientes:docs.length-saved.size,leidos:saved.size,errores:0}]}};
  if(a==='RECIBOS_PENDIENTES'){const ds=docs.filter(d=>!saved.has(d.id)&&(!p.cursor||d.id>p.cursor)&&(!p.ids||p.ids.includes(d.id))).slice(0,p.limite||25);return{data:{obra_id:'o',filas:ds,cursor:ds.at(-1)?.id||null}};}
  if(a==='RECIBO'){saved.add(p.documento_id);return{data:{documento_id:p.documento_id,neto:p.neto}};}
  if(a==='RECIBO_ERROR')return{data:{registrado:true}};throw Error('Acción inesperada '+a);}}};vm.createContext(b);vm.runInContext(src,b);const api=b.window.PLATINUM_RECIBOS_VERIFICACION;
const seed=n=>{docs=Array.from({length:n},(_,i)=>({id:String(i+1).padStart(4,'0'),hash:'h'+i,archivo:'a'+i+'.pdf',obra_id:'o',trabajador_id:'w'+i,no_trab:i+1,nombre:'PERSONA FICTICIA',tipos_fuente:['NOMINA']}));saved=new Set();calls=[];reads=0;maxConcurrent=0;failIds=new Set();};
(async()=>{
 seed(70);await api.abrir(30);assert(html.includes('Archivados')&&html.includes('Concepto por clasificar'));await api.iniciar();
 assert.equal(saved.size,70);assert.equal(reads,70);assert(maxConcurrent<=3);assert.equal(calls.filter(x=>x.a==='RECIBOS_PENDIENTES').length,4);
 await api.iniciar();assert.equal(reads,70);assert(!calls.some(x=>/TRANSICION|APLICAR|VINCULAR/.test(x.a)));
 seed(12);failIds.add('0003');await api.abrir(30);await api.iniciar();assert.equal(saved.size,11);assert(calls.some(x=>x.a==='RECIBO_ERROR'&&x.p.documento_id==='0003'));failIds.clear();await api.iniciar();assert.equal(saved.size,12);assert.equal(reads,13);
 seed(10);let release;gate=new Promise(r=>release=r);await api.abrir(30);const pending=api.iniciar();while(reads<3)await new Promise(r=>setImmediate(r));api.pausar();release();await pending;gate=null;
 assert.equal(saved.size,3);await api.iniciar();assert.equal(saved.size,10);assert.equal(reads,10);
 seed(5);await api.abrir(30);const before=calls.length;b.OBRA={id:'otra'};await api.iniciar();assert.equal(saved.size,0);assert(!calls.slice(before).some(x=>x.a==='RECIBO'));b.OBRA={id:'o'};
 seed(2);docs[0].tipos_fuente=[];const result=await api.trasImportar(docs.map(d=>({...d,bytes:new Uint8Array([1])})));assert.equal(result.ok,2);assert(calls.some(x=>x.a==='RECIBO'&&x.p.solo_archivo===true&&x.p.tipo===null));
 seed(1);const d={cierre:{id:'c',obra_id:'o',snapshot:{items:[{trabajador_id:'w0',numero:1,nombre:'PERSONA',tipo:'FINIQUITO'}]}},recibos_sin_leer:docs};const r=await api.procesarCierre(d,true);assert.equal(r.ok,1);assert(calls.some(x=>x.a==='RECIBO'&&x.p.cierre_id==='c'&&x.p.tipo==='FINIQUITO'));
 const imp=fs.readFileSync('frontend/modulos/14-importacion-documental.js','utf8');assert(imp.includes('trasImportar(recibosArchivados)'));assert(imp.includes("q.select('id,archivo,hash,trabajador_id,obra_id,semana').single()"));
 const wf=fs.readFileSync('platinum-workflows.js','utf8'),helper=wf.match(/function saldosVigentes\(d\)\{[^\n]+/)[0];vm.runInContext(helper,b);
 const rows=b.saldosVigentes({cierre:{id:'c'},flujo:{version_id:'v'},saldos:[{id:1,vigente:true,cierre_id:'c',version_id:'v'},{id:2,vigente:false,cierre_id:'c',version_id:'old'},{id:3,vigente:true,cierre_id:'otro',version_id:'v'}]});assert.equal(rows.length,1);assert.equal(rows[0].id,1);
 console.log('PASS recibos UI: lote de 70 sin saltos, máximo 3 lectores, pendientes reintentables, pausa/reanudación, sesión/centro, importación conectada y concepto sin inventar pagos.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
