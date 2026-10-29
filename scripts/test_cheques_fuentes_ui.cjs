// Contratos VM sin navegador. Sólo texto ficticio y fuentes simuladas.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');let n=0;
const ok=(v,m)=>{assert.ok(v,m);n++;};
const box={Date,console};box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync('frontend/modulos/44-respaldo-recibos.js','utf8'),box);
const parse=box.PLATINUM_RESPALDO_RECIBO.parsear,txt='RFC PRUP900101AA1 NSS 12345678901 Período del 21/Sep/2026 al 27/Sep/2026 Total de percepciones: 2,200.00 Total de deducciones: 200.00 Neto pagado: 2,000.00';
let p=parse(txt);ok(p.neto===2000&&p.datos.percepciones===2200&&p.datos.deducciones===200,'Neto y desglose sin tomar salario');ok(p.datos.periodo_inicio==='2026-09-21'&&p.datos.periodo_fin==='2026-09-27','Fechas reales');ok(p.datos.identificadores.includes('PRUP900101AA1'),'Identificadores extraídos');ok(p.tipo===null,'No infiere nómina por ausencia de finiquito');
ok(parse(txt+' AGUINALDO').tipo===null,'Aguinaldo no determina finiquito');ok(parse(txt+' FINIQUITO').tipo==='FINIQUITO','Acepta tipo expreso');
const folio='10000000-0000-4000-8000-000000000099',fiscal=txt+' Folio fiscal: '+folio+' Sello digital del SAT: '+'AbC123+/'.repeat(12);
ok(parse(fiscal).datos.cfdi_uuid===folio.toUpperCase(),'Extrae folio fiscal sólo junto a sello SAT');
const fragmentado=txt+' Folio fiscal: Fecha de emisión: 2026-10-23 '+folio+' Sello Digital del SAT: '+('AbC123+/'.repeat(12).match(/.{1,8}/g).join(' '))+' Cadena Original del complemento de certificación digital del SAT';
ok(parse(fragmentado).datos.cfdi_uuid===folio.toUpperCase(),'Folio separado y sello fragmentado por pdf.js conservan la evidencia');
ok(parse(fragmentado.replace('AbC123+/','AbC&23+/')).datos.cfdi_uuid===null,'No limpia caracteres inválidos para fabricar un sello');
ok(parse(fiscal+' 20000000-0000-4000-8000-000000000099').datos.cfdi_uuid===null,'Varios folios distintos bloquean la lectura fiscal');
ok(parse(txt+' UUID: '+folio).datos.cfdi_uuid===null,'Un folio sin sello no acredita timbrado');
ok(parse(txt+' Sello digital del SAT: '+'AbC123+/'.repeat(12)).datos.cfdi_uuid===null,'Un sello sin folio no acredita timbrado');
ok(parse(txt.replace('21/Sep/2026 al 27/Sep/2026','21/09/26 al 27/09/26')).datos.periodo_fin==='2026-09-27','Fechas numéricas');
ok(parse(txt.replace('21/Sep/2026 al 27/Sep/2026','2026-09-21 al 2026-09-27')).datos.periodo_inicio==='2026-09-21','Fechas ISO');
ok(parse(txt.replace('21/Sep/2026','31/Sep/2026')).datos.periodo_inicio===null,'No normaliza fechas imposibles');
ok(parse(txt.replaceAll(' ','\n  ')).neto===2000,'Tolera espacios y saltos de línea');ok(parse(txt+' Neto pagado: 1.00').neto===null,'No toma el primero de varios recibos');ok(parse('SALARIO 2000').neto===null,'No inventa neto');
let context={obra:{id:'o'}},calls=[],read=0,readReturn={...p,tipo:'NOMINA'},stored=false,mode='pdf';
box.confirm=()=>true;box.PLATINUM_FLOWS=undefined;vm.runInContext(fs.readFileSync('platinum-workflows.js','utf8'),box);
context.sb={rpc:async(name,args)=>{calls.push(args);if(args.p_accion==='RECIBO'){stored=true;return {data:{ok:true}};}if(mode==='conflict')return {data:{error:'Diferencia fuentes',estado:'DIFERENCIA_FUENTES'}};if(mode==='zero')return{data:{neto:0,estado:'COINCIDE'}};if(mode==='noi')return{data:{neto:2100,estado:'COINCIDE',origen:'NOI',recibos_sin_leer:[]}};return{data:stored?{neto:2000,estado:'COINCIDE',origen:'PDF'}:{error:'Falta respaldo',estado:'SIN_RESPALDO',recibos_sin_leer:[{id:'d',archivo:'a.pdf'}]}};}};
const flow=box.PLATINUM_FLOWS;flow.configure({context:()=>context,money:x=>Number(x).toFixed(2),readReceipt:async()=>{read++;return readReturn;}});
const c={obra_id:'o',trabajador_id:'w',semana:'S26',tipo_pago:'CHEQUE'};
(async()=>{
 let r=await flow.resolverNeto(c);ok(r.neto===2000&&stored,'Lee PDF y guarda metadato mediante RPC validado');ok(calls.some(x=>x.p_accion==='RECIBO'&&x.p_datos.datos.identificadores.includes('PRUP900101AA1')),'Envía identidad y fechas, no sólo neto');
 calls=[];mode='noi';r=await flow.resolverNeto(c);ok(r.neto===2100&&!calls.some(x=>x.p_accion==='RECIBO'),'NOI funciona sin PDF');
 mode='conflict';const before=read;r=await flow.resolverNeto(c);ok(r.error&&read===before,'Conflicto sin documentos verificables no se sustituye');
 const originalRpc=context.sb.rpc;context.sb.rpc=async()=>({data:{neto:2000,estado:'COINCIDE',cfdi_prioritario:true,origen:'PDF TIMBRADO',advertencias:['Reporte NOI difiere'],recibos_sin_leer:[]}});
 r=await flow.resolverNeto(c);ok(r.neto===2000&&r.advertencias.includes('Reporte NOI difiere'),'Conserva la advertencia fiscal enviada por el servidor');context.sb.rpc=originalRpc;
 stored=false;readReturn={...p,tipo:'NOMINA'};context.sb.rpc=async(name,args)=>{
  if(args.p_accion==='RECIBO'){stored=true;return{data:{ok:true}};}
  return{data:stored?{neto:2000,estado:'COINCIDE',cfdi_prioritario:true,origen:'PDF TIMBRADO',advertencias:['NOI distinto']}
   :{error:'NOI difiere',estado:'DIFERENCIA_FUENTES',recibos_sin_leer:[{id:'d',archivo:'a.pdf'}]}};
 };
 r=await flow.resolverNeto(c);ok(stored&&r.neto===2000&&r.advertencias.includes('NOI distinto'),'Relee PDF timbrado aunque haya diferencia previa con NOI');context.sb.rpc=originalRpc;
 mode='zero';ok((await flow.resolverNeto(c)).error.includes('$0'),'Neto cero impide expedir');
 mode='pdf';stored=false;readReturn={...p,tipo:'FINIQUITO'};r=await flow.resolverNeto(c);ok(r.error&&!stored,'No guarda concepto distinto');
 readReturn={...p,tipo:null};box.confirm=()=>false;r=await flow.resolverNeto(c);ok(r.error&&!stored,'No inventa clasificación del PDF');
 context.obra.id='otra';ok((await flow.resolverNeto(c)).error.includes('centro'),'No cruza contexto de obra');
 context.obra.id='o';box.confirm=()=>true;let release;readReturn={...p,tipo:'NOMINA'};flow.configure({context:()=>context,money:x=>Number(x).toFixed(2),readReceipt:async()=>new Promise(r=>{release=()=>r(readReturn);})});
 calls=[];const a=flow.resolverNeto(c);while(!release)await new Promise(r=>setImmediate(r));const b=flow.resolverNeto(c);release();await Promise.all([a,b]);ok(calls.filter(x=>x.p_accion==='RECIBO').length===1,'Agrupa doble clic del mismo cheque');
 const src=fs.readFileSync('frontend/modulos/19-cheques.js','utf8');ok(src.includes('puede_leer_pdf')&&src.includes('PLATINUM_RECIBOS_IA.abrir'),'Gemini disponible sin importar NOI');
 console.log(`PASS ${n} contratos de fuentes alternas: parser, identidad, periodo, concepto, conflictos, doble clic y alcance.`);
})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
