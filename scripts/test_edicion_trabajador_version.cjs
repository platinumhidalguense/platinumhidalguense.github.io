// Pruebas de concurrencia sin navegador ni datos reales.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('frontend/modulos/05-alta-edicion.js','utf8');
assert.match(src,/data-worker-version="\$\{esc\(w\?\.updated_at\|\|''\)\}"/);
const a=src.indexOf('async function guardarRegistroTrabajador('),b=src.indexOf('/* ---------- ¿EL QUE ACABO',a);
assert(a>0&&b>a);
let form={dataset:{workerId:'w',workerVersion:'original',workerObra:'obra'}},actual='original',err=null;
const calls=[],row={fecha_reingreso:null,monto_finiquito:100};
const box={$:()=>form,WORKERS:[{id:'w',updated_at:'cache-nuevo'}],sb:{from:table=>({
  update(v){this.val=v;this.edit=true;this.filters=[];return this;},insert(v){this.val=v;this.filters=[];return this;},
  eq(k,v){this.filters.push([k,v]);return this;},async select(){calls.push(this);if(err)return{error:err};
    const version=this.filters.find(([k])=>k==='updated_at')?.[1];
    if(this.edit&&version!==actual)return{data:[],error:null};
    Object.assign(row,this.val);return{data:[{id:'w'}],error:null};}
})}};
vm.createContext(box);vm.runInContext(src.slice(a,b),box);
(async()=>{
  assert.equal((await box.guardarRegistroTrabajador({id_cuadrilla:'c'},'w')).error,null);
  assert.deepEqual(calls[0].filters,[['id','w'],['obra_id','obra'],['updated_at','original']]);
  // Otro usuario/reactivación cambia la fila mientras el formulario sigue abierto.
  actual='reactivado';row.fecha_reingreso='2026-10-26';row.monto_finiquito=null;
  const stale=await box.guardarRegistroTrabajador({fecha_reingreso:null,monto_finiquito:100},'w');
  assert.match(stale.error.message,/No se sobrescribió/);
  assert.equal(row.fecha_reingreso,'2026-10-26');assert.equal(row.monto_finiquito,null);
  assert.equal(form.dataset.workerVersion,'original'); // Realtime no renueva la versión del formulario.
  for(const dataset of [{},{workerId:'otro',workerVersion:actual,workerObra:'obra'},
    {workerId:'w',workerVersion:'',workerObra:'obra'},{workerId:'w',workerVersion:actual}]){
    const n=calls.length;form={dataset};assert((await box.guardarRegistroTrabajador({},'w')).error);assert.equal(calls.length,n);
  }
  form=null;assert.equal((await box.guardarRegistroTrabajador({nombres:'NUEVO'},null)).error,null);
  form={dataset:{workerId:'w',workerVersion:actual,workerObra:'obra'}};
  err={message:'permission denied'};assert.equal((await box.guardarRegistroTrabajador({},'w')).error,err);
  err={message:'column id_cuadrilla does not exist'};await box.guardarRegistroTrabajador({},'w');
  err=null;actual='otra-edicion';assert((await box.guardarRegistroTrabajador({},'w')).error); // Reintento por esquema sigue protegido.
  console.log('OK: versión original, ámbito, reingreso concurrente, caché renovado, ficha sin versión, alta nueva, permisos y reintento de esquema.');
})().catch(e=>{console.error(e);process.exitCode=1;});
