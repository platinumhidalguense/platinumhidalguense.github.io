// UI y llamadas simuladas: no navegador y no escrituras reales.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./fuente_frontend.cjs').html();
const start=html.indexOf('function doReactivar('),end=html.indexOf('/* ---------- historial ---------- */',start);
assert(start>0&&end>start);
const worker={id:'w',obra_id:'obra',estatus:'BAJA',fecha_alta:'2026-09-28',fecha_baja:'2026-10-05',updated_at:'revision-1'};
const els={'reingreso-fecha':{value:''},'reingreso-guardar':{disabled:false}};
let permission=true,response={data:[{id:'w'}],error:null},delay=null;
const writes=[],box={window:{},WORKERS:[worker],OBRA:{id:'obra'},USER:{email:'test@example.invalid'},
 Date,Number,puedeEditarTrabajador:()=>permission,esc:String,fullName:()=> 'Trabajador',fmtD:String,
 modal:s=>{box.modalHTML=s;},toast:s=>box.messages.push(s),messages:[],confirm:()=>true,markWrite:()=>{},
 closeModal:()=>{box.closed++;},closed:0,loadObraData:async()=>{},refreshCounts:()=>{},$:id=>els[id],
 sb:{from:table=>({update(upd){this.upd=upd;this.filters=[];return this;},eq(k,v){this.filters.push([k,v]);return this;},
 async select(){writes.push({table,upd:this.upd,filters:this.filters});if(delay)await delay;return response;}})}};
vm.createContext(box);vm.runInContext(html.slice(start,end),box);
(async()=>{
 box.doReactivar('w');assert(box.modalHTML.includes('type="date" required'));assert(!box.modalHTML.includes('value="2026'));
 for(const date of ['', '2026-02-30','2026-10-05','2026-09-30']){els['reingreso-fecha'].value=date;await box.saveReingreso();}
 assert.equal(writes.length,0);
 els['reingreso-fecha'].value='2026-10-12';await box.saveReingreso();assert.equal(writes.length,1);
 const write=writes[0];assert.equal(write.table,'trabajadores');assert.equal(write.upd.fecha_reingreso,'2026-10-12');
 assert.equal(write.upd.estatus,'ACTIVO');assert(!('fecha_alta' in write.upd));assert(!('fecha_baja' in write.upd));
 assert.deepEqual(write.filters,[['id','w'],['obra_id','obra'],['estatus','BAJA'],['updated_at','revision-1']]);
 assert.equal(worker.fecha_baja,'2026-10-05');assert.equal(worker.fecha_alta,'2026-09-28');assert.equal(box.closed,1);
 box.doReactivar('w');response={data:[],error:null};await box.saveReingreso();assert.equal(box.closed,1);
 assert(box.messages.at(-1).includes('ficha cambió'));assert(!els['reingreso-guardar'].disabled);
 response={data:null,error:{message:'fecha_reingreso: acceso denegado'}};const count=writes.length;await box.saveReingreso();
 assert.equal(writes.length,count+1);assert.equal(box.closed,1);assert(!('fecha_alta' in writes.at(-1).upd));
 permission=false;await box.saveReingreso();assert.equal(writes.length,count+1);permission=true;
 response={data:[{id:'w'}],error:null};let release;delay=new Promise(r=>release=r);
 const pending=box.saveReingreso();await box.saveReingreso();assert.equal(writes.length,count+2);release();await pending;
 assert.equal(box.closed,2);
 console.log('OK fecha explícita/futura, cancelación implícita, fechas inválidas, permisos, concurrencia, sin doble guardado ni fallback destructivo');
})().catch(e=>{console.error(e);process.exitCode=1;});
