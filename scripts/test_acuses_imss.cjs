// Pruebas sin credenciales ni escrituras de producción.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const fn=n=>{const m=html.match(new RegExp('(?:async )?function '+n+'\\([^\\n]*\\)[^{]*\\{[\\s\\S]*?\\n\\}'));assert(m,n);return m[0];};
const c={Date,Number,String,Map,Set,DOCSX:[],sb:{},console};vm.createContext(c);
['fechaAcuseISO','indiceAcusesIMSS','estadoAcuseIMSS','altaImssPendiente','altaImssPresentada','tieneAcuseAltaImportado','acuseAltaPendiente','fetchAllRows','cargarAcusesTrabajadores','refrescaDocsDe'].forEach(n=>vm.runInContext(fn(n),c));
let tests=0;
function check(w,docs,expected){
  c.DOCSX=docs;
  const plain=c.estadoAcuseIMSS(w),indexed=c.estadoAcuseIMSS(w,'ALTA',c.indiceAcusesIMSS(docs));
  assert.equal(JSON.stringify(plain),JSON.stringify(indexed),'Índice y consulta directa deben coincidir');
  for(const [k,v] of Object.entries(expected))assert.equal(plain[k],v,`${k}: ${JSON.stringify(w)}, ${JSON.stringify(docs)}`);
  assert.equal(c.altaImssPendiente(w),w.estatus!=='BAJA'&&!plain.presentada&&!plain.porCotejar);
  assert.equal(c.acuseAltaPendiente(w),w.estatus!=='BAJA'&&plain.presentada&&!plain.ok&&!plain.porCotejar);
  tests++;
}
async function main(){
  const w={id:'w',fecha_alta:'2026-09-07',estatus:'ACTIVO'};
  const doc={id:'d',trabajador_id:'w',categoria:'ACUSE_IMSS',subtipo:'ALTA',fecha_doc:w.fecha_alta};
  check(w,[],{ok:false,presentada:false,porCotejar:false});
  check(w,[doc],{ok:true,presentada:true,porCotejar:false});
  check({...w,movimiento_imss:'SIN MOVIMIENTO'},[doc],{ok:true,presentada:true});
  check({...w,movimiento_imss:'ALTA PRESENTADA'},[],{ok:false,presentada:true});
  check({...w,movimiento_imss:'ALTA CON ACUSE'},[],{ok:false,presentada:true});
  check({...w,movimiento_imss:'MODIFICACION CON ACUSE',fecha_mov_imss:'2026-09-21'},[{...doc,subtipo:'MODIFICACION SALARIAL',fecha_doc:'2026-09-21'}],{ok:false,presentada:true});
  check({...w,fecha_reingreso:'2026-10-05',movimiento_imss:'MODIFICACION CON ACUSE',fecha_mov_imss:'2026-09-21'},[{...doc,subtipo:'MODIFICACION SALARIAL',fecha_doc:'2026-09-21'}],{ok:false,presentada:false});
  for(const subtype of ['BAJA','MODIFICACION SALARIAL','RECIBO'])check(w,[{...doc,subtipo:subtype}],{ok:false,presentada:false});
  check(w,[{...doc,trabajador_id:'other'}],{ok:false,presentada:false});
  check(w,[{...doc,categoria:'RECIBO_NOMINA'}],{ok:false,presentada:false});
  check(w,[{...doc,anulado:true}],{ok:false,presentada:false});
  check(w,[{...doc,subtipo:' reingreso ',categoria:' acuse_imss '}],{ok:true,presentada:true});
  for(const date of [null,'','2026-02-30','incorrecta'])check(w,[{...doc,fecha_doc:date,created_at:'2026-10-07'}],{ok:false,porCotejar:true,presentada:false});
  check(w,[{...doc,fecha_doc:'2026-08-31',created_at:'2026-10-07'}],{ok:false,porCotejar:false,presentada:false});
  check({...w,fecha_reingreso:'2026-10-05',movimiento_imss:'ALTA CON ACUSE',fecha_mov_imss:'2026-09-07'},[doc],{ok:false,presentada:false});
  check({...w,fecha_reingreso:'2026-10-05',movimiento_imss:'BAJA CON ACUSE',fecha_mov_imss:'2026-09-28'},[doc],{ok:false,presentada:false});
  check({...w,fecha_reingreso:'2026-10-05',movimiento_imss:'ALTA PRESENTADA'},[doc],{ok:false,presentada:false});
  check({...w,fecha_reingreso:'2026-10-05',movimiento_imss:'ALTA PRESENTADA',fecha_mov_imss:'2026-10-05'},[doc],{ok:false,presentada:true});
  check({...w,fecha_reingreso:'2026-10-05'},[{...doc,fecha_doc:'2026-10-05'}],{ok:true,presentada:true});
  // Caso real #632: no se cambian fechas laborales ni se tolera cualquier día.
  const felix={id:'w',estatus:'ACTIVO',fecha_alta:'2026-10-06',movimiento_imss:'ALTA CON ACUSE',fecha_mov_imss:'2026-10-05'};
  check(felix,[{...doc,fecha_doc:'2026-10-05'}],{ok:true,presentada:true});
  check({...felix,fecha_alta:'2026-10-07'},[{...doc,fecha_doc:'2026-10-05'}],{ok:true,presentada:true});
  check({...felix,fecha_alta:'2026-10-08'},[{...doc,fecha_doc:'2026-10-05'}],{ok:false,presentada:false});
  check({...felix,fecha_mov_imss:'2026-09-28'},[{...doc,fecha_doc:'2026-10-05'}],{ok:false,presentada:false});
  check({...felix,fecha_reingreso:'2026-10-06'},[{...doc,fecha_doc:'2026-10-05'}],{ok:false,presentada:false});
  check({...w,estatus:'BAJA',fecha_baja:'2026-09-28'},[{...doc,fecha_doc:'2026-10-05'}],{ok:false,presentada:false});
  const baja={...w,estatus:'BAJA',fecha_baja:'2026-09-28'};
  assert(!c.estadoAcuseIMSS(baja,'BAJA',c.indiceAcusesIMSS([doc])).ok);
  assert(c.estadoAcuseIMSS(baja,'BAJA',c.indiceAcusesIMSS([{...doc,subtipo:'BAJA',fecha_doc:'2026-09-28'}])).ok);
  assert(!c.estadoAcuseIMSS(baja,'BAJA',c.indiceAcusesIMSS([{...doc,subtipo:'BAJA',fecha_doc:'2026-09-21'}])).ok);
  // Consulta por trabajador incluye documentos de otro centro y pagina 1,000.
  const workers=Array.from({length:205},(_,i)=>({id:'worker-'+i}));
  const pages=[];
  c.sb={from:table=>{
    assert.equal(table,'documentos');const filters={};
    const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q;},in:(k,v)=>{filters[k]=v;return q;},order:()=>q,range:async(a,b)=>{
      assert.equal(filters.categoria,'ACUSE_IMSS');assert.equal(filters.anulado,false);
      assert(filters.trabajador_id.length<=100);pages.push({ids:filters.trabajador_id,a,b});
      const n=filters.trabajador_id[0]==='worker-0'?1500:filters.trabajador_id.length;
      return {data:Array.from({length:Math.max(0,Math.min(n,b+1)-a)},(_,i)=>({id:filters.trabajador_id[0]+'-'+(a+i),trabajador_id:filters.trabajador_id[0],obra_id:'other-obra'})),error:null};
    }};return q;
  }};
  const fetched=await c.cargarAcusesTrabajadores(workers);assert.equal(fetched.error,null);assert.equal(fetched.data.length,1605);assert.equal(pages.length,4);assert.equal(pages[1].a,1000);
  const originalFetch=c.fetchAllRows;
  c.fetchAllRows=async()=>({data:[doc],error:null});c.DOCSX=[{...doc,id:'anulado-antiguo'},{...doc,id:'other-doc',trabajador_id:'other'}];
  // Simula la consulta dirigida real sin necesitar una sesión.
  c.sb={from:()=>{const q={select:()=>q,eq:()=>q};return q;}};
  await c.refrescaDocsDe('w');assert.equal(c.DOCSX.length,2);assert(!c.DOCSX.some(d=>d.id==='anulado-antiguo'));assert(c.DOCSX.some(d=>d.id==='other-doc'));
  c.fetchAllRows=async()=>({data:[],error:{message:'fallo de red'}});const cached=JSON.stringify(c.DOCSX);assert.equal(await c.refrescaDocsDe('w'),null);assert.equal(JSON.stringify(c.DOCSX),cached);
  const failed=await c.cargarAcusesTrabajadores(workers);assert.equal(failed.data.length,0);assert.equal(failed.error.message,'fallo de red');c.fetchAllRows=originalFetch;
  // Importar historia no debe sobrescribir la ficha de un reingreso nuevo.
  vm.runInContext(fn('applyPdfImport'),c);
  const controls={'pdf-cat':{value:'ACUSE_IMSS'},'pdf-sub':{value:'ALTA'},'pdf-sem':{value:''},'pdf-fecha':{value:''},'pdf-btn':{}};
  Object.assign(c,{$:id=>controls[id],USER:{email:'prueba@example.test'},OBRA:{id:'obra'},Blob,confirm:()=>true,markWrite(){},closeModal(){},toast(){},loadObraData:async()=>{},fullName:()=> 'PRUEBA',SUBTIPO_ACUSE:t=>t==='BAJA'?'BAJA':t==='MODIFICACION SALARIAL'?'MODIFICACION SALARIAL':'ALTA',dmyISO:v=>v.split('/').reverse().join('-')});
  async function importCheck(worker,date,updatesExpected){
    const updates=[];c.WORKERS=[{...worker,obra_id:'obra'}];c.PDFIMP=[{sel:true,ownerId:worker.id,name:'acuse.pdf',bytes:new Uint8Array([1,2]),hash:'h'}];controls['pdf-fecha'].value=date;
    c.sb={storage:{from:()=>({upload:async()=>({error:null})})},from:table=>({insert:async()=>{assert.equal(table,'documentos');return {error:null};},update:change=>({eq:async()=>{updates.push(change);return {error:null};}})})};
    await c.applyPdfImport();assert.equal(updates.length,updatesExpected);return updates;
  }
  await importCheck({...w,fecha_reingreso:'2026-10-05',movimiento_imss:'BAJA CON ACUSE',fecha_mov_imss:'2026-09-28'},'2026-09-07',0);
  await importCheck(w,'',0);
  const current=await importCheck({...w,fecha_reingreso:'2026-10-05'},'2026-10-05',1);assert.equal(current[0].movimiento_imss,'ALTA CON ACUSE');assert.equal(current[0].fecha_mov_imss,'2026-10-05');
  await importCheck({...w,fecha_alta:'2026-10-06'},'2026-10-05',1);
  await importCheck({...w,movimiento_imss:'MODIFICACION CON ACUSE',fecha_mov_imss:'2026-10-01'},'2026-09-07',0);
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
  if(process.argv[2]){
    const snapshot=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),idx=c.indiceAcusesIMSS(snapshot.docs),result={trabajadores:snapshot.workers.length,acuses:snapshot.docs.length,porObra:{},felix:null};
    for(const worker of snapshot.workers){
      c.DOCSX=snapshot.docs;assert.equal(JSON.stringify(c.estadoAcuseIMSS(worker)),JSON.stringify(c.estadoAcuseIMSS(worker,'ALTA',idx)));
      const state=c.estadoAcuseIMSS(worker,'ALTA',idx),r=result.porObra[worker.obra_id]??={vigentes:0,confirmados:0,porCotejar:0,altaPendiente:0,acusePorImportar:0};
      if(worker.estatus!=='BAJA'){r.vigentes++;r.confirmados+=Number(state.ok);r.porCotejar+=Number(state.porCotejar);r.altaPendiente+=Number(c.altaImssPendiente(worker,idx));r.acusePorImportar+=Number(c.acuseAltaPendiente(worker,idx));}
      assert(!(state.ok&&c.altaImssPendiente(worker,idx)),'Acuse confirmado no puede dar aviso pendiente');
      if(worker.id==='7db382d6-6a24-46e4-9a1e-080f4237a7c8'){assert(state.ok);assert(!c.altaImssPendiente(worker,idx));result.felix=state;}
    }
    console.log(JSON.stringify(result,null,2));
  }
  console.log(`OK: ${tests} escenarios, estados alta/baja/reingreso, fechas y anulaciones, consulta dirigida/paginada, sincronización y cinco importaciones simuladas. Sin escrituras a producción.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
