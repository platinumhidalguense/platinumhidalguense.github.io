// Prueba aislada: archivado + lectura comparten bytes y no repiten descargas.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),acorn=require('./node_modules/acorn');
const src=fs.readFileSync('frontend/modulos/14-importacion-documental.js','utf8'),ast=acorn.parse(src,{ecmaVersion:'latest'}),n=ast.body.find(x=>x.type==='FunctionDeclaration'&&x.id.name==='applyPdfImport');
async function run(cat,hashFallback=false){let uploads=0,inserts=0,verified=[],updated=0,reloaded=0;const nodes={'pdf-cat':{value:cat},'pdf-sub':{value:'ALTA'},'pdf-sem':{value:'S30'},'pdf-fecha':{value:'2026-10-19'},'pdf-btn':{innerHTML:''}};
 const doc={id:'d',archivo:'x.pdf',hash:'h',trabajador_id:'w',obra_id:'o',semana:'S30'},bytes=new Uint8Array([1,2]);
 const b={OBRA:{id:'o'},USER:{id:'u',email:'prueba@example.invalid'},PDFIMP:[{sel:true,ownerId:'w',bytes,name:'ficticio.pdf',hash:'h'}],WORKERS:[{id:'w',obra_id:'o'}],$:id=>nodes[id],confirm:()=>true,toast(){},markWrite(){},closeModal(){},Blob,Date,
  loadObraData:async()=>reloaded++,SUBTIPO_ACUSE:x=>x,estadoAcuseIMSS:()=>({ok:false}),indiceAcusesIMSS:()=>({}),fechaAcuseISO:x=>x||'',
  window:{PLATINUM_RECIBOS_VERIFICACION:{trasImportar:async docs=>verified.push(...docs)}},sb:{storage:{from:()=>({upload:async()=>{uploads++;return{};}})},from:table=>({
   insert:row=>{inserts++;const response=hashFallback&&inserts===1?{error:{message:'hash column'}}:{data:doc};return{then:resolve=>resolve(response),select:cols=>{assert.equal(cols,'id,archivo,hash,trabajador_id,obra_id,semana');return{single:async()=>response};}};},
   update:()=>({eq:async()=>{updated++;return{};}})
  })}};
 vm.createContext(b);vm.runInContext(src.slice(n.start,n.end),b);await b.applyPdfImport();assert.equal(uploads,1);assert.equal(inserts,hashFallback?2:1);assert.equal(reloaded,1);assert.equal(updated,0);
 if(cat==='RECIBO_NOMINA'){assert.equal(verified.length,1);assert.strictEqual(verified[0].bytes,bytes);assert.equal(verified[0].id,'d');}else assert.equal(verified.length,0);
}
(async()=>{await run('RECIBO_NOMINA');await run('RECIBO_NOMINA',true);await run('ACUSE_IMSS');console.log('PASS importación: recibo insertado con ID, bytes reutilizados, compatibilidad de hash y acuses intactos.');})().catch(e=>{console.error(e.stack);process.exitCode=1;});
