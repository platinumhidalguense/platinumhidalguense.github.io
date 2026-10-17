const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('let OBRA_CARGA_SECUENCIA='),end=html.indexOf('let CFGEMP={}',start);
const select=html.slice(html.indexOf('async function selectObra('),html.indexOf('async function selectEmpresa('));
const tables=['trabajadores','cheques','descuentos','documentos','vacaciones','actas','nom035','pagos','prima_pagos','cuadrillas','diferenciales','bloques_cheques','sueldos_internos','control_cierres_nomina','control_conciliacion_noi','control_altas_bajas_cortas','control_finiquitos_transferencia'];
const arrays=['WORKERS','CHEQUES','DESC','DOCSX','VAC','ACTAS','NOM','PAGOS','PRIMAS','CUADS','DIFS','BLOQUES','SUELDOSINT','CIERRES','CTRLNOI','ALTAS_CORTAS','FINTRANS'];
function mk(){
 const elements={},out={};const $=id=>elements[id]||(elements[id]={value:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}}});
 const a={id:'a',empresa_codigo:'JIRE'},b={id:'b',empresa_codigo:'PLATINUM'};
 const ctx={console,Array,Set,Map,String,Number,Date,parseInt,OBRA:a,OBRAS:[a,b],EMPRESA_ACTIVA:'JIRE',NAV_BUSY:false,NAV_STEP:'trabajadores',USER:{},
  $,esc:s=>String(s),toast:m=>(out.messages||(out.messages=[])).push(m),skeletonTabla(){},localStorage:{setItem(){}},empresaDeObra:o=>o.empresa_codigo,
  cargarAcusesTrabajadores:async()=>({data:[]}),activarProgramados:async()=>{},sincronizarContratistas:async()=>{},cargarRecalcInfonavit:async()=>{},
  renderObraBar(){},resetWorkerFilters(){},setView(){},renderStats(){},renderTable(){},renderChqStats(){},renderCheques(){},updateAlertas(){},renderVacViews(){},renderActasView(){},renderNomView(){},renderAnualView(){},renderPagosView(){}};
 for(const key of arrays)ctx[key]=[{old:key}];
 ctx.sb={from:table=>({table,select(){return this;},eq(){return this;}})};
 ctx.fetchAllRows=async build=>({data:build().table==='trabajadores'?[{id:'worker',no_trab:1,contratista:'MG',estatus:'ACTIVO',puesto:'OFICIAL',semana_ingreso:29}]:[]});
 vm.createContext(ctx);vm.runInContext(html.slice(start,end)+'\n'+select,ctx);return {ctx,out,elements,a,b};
}
(async()=>{
 for(const table of tables){const {ctx}=mk(),old=arrays.map(k=>ctx[k]),ok=ctx.fetchAllRows;
  ctx.fetchAllRows=async build=>build().table===table?{data:null,error:{message:'fallo de prueba'}}:ok(build);
  assert.equal(await ctx.loadObraData('a'),false,table);arrays.forEach((k,i)=>assert.equal(ctx[k],old[i],table+' conserva '+k));
 }
 for(const fail of ['throw','null','acuseError','acuseThrow','acuseNull']){
  const {ctx}=mk(),old=ctx.PAGOS;
  if(fail==='throw')ctx.fetchAllRows=async()=>{throw Error('red');};
  if(fail==='null')ctx.fetchAllRows=async()=>({data:null,error:null});
  if(fail==='acuseError')ctx.cargarAcusesTrabajadores=async()=>({data:null,error:{message:'acuse inaccesible'}});
  if(fail==='acuseThrow')ctx.cargarAcusesTrabajadores=async()=>{throw Error('acuse');};
  if(fail==='acuseNull')ctx.cargarAcusesTrabajadores=async()=>({data:null});
  assert.equal(await ctx.loadObraData('a'),false);assert.equal(ctx.PAGOS,old);
 }
 {
  const {ctx}=mk();assert.equal(await ctx.loadObraData('a'),true);assert.equal(ctx.WORKERS[0].id,'worker');assert.equal(ctx.PAGOS.length,0);
  assert.equal(vm.runInContext('OBRA_DATOS_ID',ctx),'a');
  const old=ctx.PAGOS;ctx.fetchAllRows=async()=>({data:null,error:{message:'sin conexión'}});
  assert.equal(await ctx.loadObraData('a'),false);assert.equal(ctx.PAGOS,old,'no borrar instantánea verificada');
 }
 {
  const {ctx}=mk();let release;const gate=new Promise(r=>release=r);let n=0;
  ctx.fetchAllRows=async build=>{const table=build().table,batch=++n<=17?1:2;if(batch===1)await gate;return {data:table==='trabajadores'?[{id:'version-'+batch}]:[]};};
  const first=ctx.loadObraData('a');assert.equal(await ctx.loadObraData('a'),true);release();assert.equal(await first,false);
  assert.equal(ctx.WORKERS[0].id,'version-2','respuesta antigua no sobrescribe la nueva');
 }
 {
  const {ctx,b}=mk(),old=ctx.WORKERS;let release;const gate=new Promise(r=>release=r);
  const read=ctx.fetchAllRows;ctx.fetchAllRows=async f=>{await gate;return read(f);};
  const first=ctx.loadObraData('a');ctx.OBRA=b;release();assert.equal(await first,false);assert.equal(ctx.WORKERS,old,'sin mezcla de centros');
 }
 for(const thrown of [false,true]){
  const {ctx,a}=mk();ctx.loadObraData=async()=>{if(thrown)throw Error('fallo');return false;};
  await ctx.selectObra('b');assert.equal(ctx.OBRA,a);assert.equal(ctx.EMPRESA_ACTIVA,'JIRE');assert.equal(ctx.NAV_BUSY,false);
 }
 for(const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/src=|application\/json/.test(s[1]))new vm.Script(s[2]);
 console.log('OK: 17 errores de fuente y 5 fallos de red/acuses no vacían datos; lecturas concurrentes y cambio de centro no mezclan información; razón social restaurada; sólo lecturas simuladas, sin escrituras en Supabase.');
})().catch(e=>{console.error(e);process.exitCode=1;});
