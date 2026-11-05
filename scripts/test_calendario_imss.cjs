const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=require('./fuente_frontend.cjs').html();
function fn(marker){
  const start=html.indexOf(marker);assert(start>=0,marker);
  const open=html.indexOf('{',start);let depth=0;
  for(let i=open;i<html.length;i++){
    if(html[i]==='{')depth++;
    else if(html[i]==='}'&&--depth===0)return html.slice(start,i+1);
  }
  throw Error('Unbalanced '+marker);
}
const elem={}, calls=[];
const caseRow={id:'case-1',trabajador_id:'worker-1',certificado_desde:'2026-09-28',
  certificado_hasta:'2026-10-04',control_casos_imss_semanas:[]};
const box={Date,Number,Math,window:{_CTRLIMSS:[caseRow],_CTRLIMSS_DIAS:[]},
  WORKERS:[{id:'worker-1',sal_semanal:2400.26}],OBRA:{id:'obra-1'},
  $:id=>elem[id],semRange:n=>n===27?['2026-09-28','2026-10-04']:['2026-09-21','2026-09-27'],
  isoWeekDe:(_o,d)=>d.toISOString().slice(0,10)>='2026-09-28'?27:26,
  markWrite:()=>{},toast:(msg,type)=>calls.push({msg,type}),
  sb:{rpc:async(name,args)=>{calls.push({name,args});return {error:null};}},
  loadObraData:async()=>{},openCtrlCasosIMSS:async()=>{},openCtrlSemanaIMSS:()=>{},
  periodoPago:()=> 'SEMANAL',descuentoFaltasNOI:()=>({monto:100})};
vm.createContext(box);
vm.runInContext([
  fn('function ctrlFechasIMSS('),fn('function ctrlSemanasIMSS('),
  fn('function ctrlPreviewDiasIMSS('),fn('function ctrlMarcarDiasIMSS('),
  fn('function ctrlQuincenaIMSSAplicada('),
  fn('async function ctrlGuardarSemanaIMSS(')
].join('\n'),box);
assert.strictEqual(box.ctrlFechasIMSS('2026-09-28','2026-10-04').length,7);
assert.strictEqual(box.ctrlFechasIMSS('2026-10-04','2026-09-28').length,0);
assert.deepStrictEqual([...box.ctrlSemanasIMSS(caseRow)],[27]);
box.window._CTRLIMSS_DIAS=box.ctrlFechasIMSS('2026-09-28','2026-10-04');
elem['ims-sem']={value:'27'};elem['ims-nota']={value:'Certificado cotejado'};
for(const fecha of box.window._CTRLIMSS_DIAS)elem['ims-dia-'+fecha]={value:'PENDIENTE'};
(async()=>{
  await box.ctrlGuardarSemanaIMSS('case-1');
  assert(!calls.some(x=>x.name),'No debe guardar días sin clasificar');
  box.ctrlMarcarDiasIMSS('SIN_PAGO');
  for(const fecha of box.window._CTRLIMSS_DIAS.slice(3))elem['ims-dia-'+fecha].value='IMSS';
  elem['ims-dia-2026-09-28'].value='EMPRESA';
  await box.ctrlGuardarSemanaIMSS('case-1');
  const rpc=calls.find(x=>x.name==='control_guardar_semana_imss_detalle');
  assert(rpc,'RPC de calendario');
  assert.strictEqual(rpc.args.p_detalle.length,7);
  assert.strictEqual(rpc.args.p_detalle.filter(x=>x.pagador==='EMPRESA').length,1);
  assert.strictEqual(rpc.args.p_detalle.filter(x=>x.pagador==='IMSS').length,4);
  assert.strictEqual(rpc.args.p_detalle.filter(x=>x.pagador==='SIN_PAGO').length,2);
  assert.strictEqual(rpc.args.p_monto,null,'Pendiente no toca nómina');
  console.log('OK calendario IMSS: cobertura diaria, edición y clasificación explícita');
})().catch(e=>{console.error(e);process.exitCode=1;});
