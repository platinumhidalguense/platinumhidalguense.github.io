// DOM sintético. Lee el contenido fiscal ficticio con los lectores de la app.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),crypto=require('node:crypto');
const {parseHTML,DOMParser}=require('linkedom');
const src=f=>fs.readFileSync('frontend/modulos/'+f,'utf8');
const extraer=(fuente,...nombres)=>acorn.parse(fuente,{ecmaVersion:'latest'}).body
 .filter(x=>x.type==='FunctionDeclaration'&&nombres.includes(x.id.name)).map(x=>fuente.slice(x.start,x.end)).join('\n');
const {document,window}=parseHTML('<div id="modals"></div>');
const $=id=>document.getElementById(id);
const periodo={id:'c32',semana:32,desde:'2026-11-02',hasta:'2026-11-08',periodo:'SEMANAL',estado:'BORRADOR'};
const periodos=[{...periodo,id:'c33',semana:33,desde:'2026-11-09',hasta:'2026-11-15'},periodo];
const uuid='AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
const sello='S'.repeat(80);
const pdf=`%PDF-1.7
Percepciones SUELDO 2,500.00 P001 001 Deducciones Total percepciones 2,500.00 Total deducciones 500.00
FIC221209AA1 PRUP900101AA1 12345678901 Del 2/11/2026 al 8/11/2026
Neto pagado: $2,000.00 Folio fiscal: ${uuid} Sello Digital del SAT: ${sello}`;
const xml=`<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" TipoDeComprobante="N" Total="2000.00">
<cfdi:Emisor Rfc="FIC221209AA1"/><cfdi:Receptor Rfc="PRUP900101AA1"/><cfdi:Complemento>
<nomina12:Nomina xmlns:nomina12="http://www.sat.gob.mx/nomina12" FechaInicialPago="2026-11-02" FechaFinalPago="2026-11-08" FechaPago="2026-11-06" TotalPercepciones="2500" TotalDeducciones="500">
<nomina12:Receptor NumSeguridadSocial="12345678901"/><nomina12:Percepciones><nomina12:Percepcion TipoPercepcion="001" Concepto="Sueldo" ImporteGravado="2500" ImporteExento="0"/></nomina12:Percepciones>
</nomina12:Nomina><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${uuid}" SelloSAT="${sello}"/>
</cfdi:Complemento></cfdi:Comprobante>`;
const calls=[],uploaded=[],reserved=new Map(),returnWeeks=[];
let consulta=false,fail=true,periodosActivos=periodos;
const s={window,document,$,DOMParser,Uint8Array,TextDecoder,OBRA:{id:'p',nombre:'INFONAVIT FICTICIO'},USER:{id:'u'},
 esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 razonSocialEmpresa:()=>'PLATINUM FICTICIO',toast:assert.fail,
 modal:html=>{$('modals').innerHTML=html;},closeModal:()=>{$('modals').innerHTML='';},
 pdfBytesToText:async b=>new TextDecoder().decode(b),sha256Hex:async b=>crypto.createHash('sha256').update(b).digest('hex'),
 concSemanaDefault:()=>33,normSem:x=>parseInt(String(x).replace(/^S/i,'')),skeletonRows:()=>'',frecCargar:()=>returnWeeks.push($('fr-sem').value),
 sb:{rpc:async(name,{p_accion:a,p_datos:j})=>{
  assert.equal(name,'control_archivo_recibos');calls.push([a,j]);
  if(a==='PERIODOS')return{data:{escritura:!consulta,periodos:periodosActivos}};
  const p=periodosActivos.find(c=>c.id===j.cierre_id);assert(p);
  if(a==='CONTEXTO')return{data:{...p,motivo:consulta?'Cuenta de consulta':null}};
  assert.equal(j.cierre_id,'c32');
  if(a==='PREVIA')return{data:j.archivos.map(d=>{
   assert.equal(d.emisor,'FIC221209AA1');assert.equal(d.rfc,'PRUP900101AA1');assert.equal(d.uuid,uuid);
   assert.equal(d.concepto,'NOMINA');assert.equal(d.neto,'2000.00');assert.equal(d.desde,periodo.desde);assert.equal(d.hasta,periodo.hasta);
   return{estado:'VALIDO',trabajador:'FICTICIO',numero:1,trabajador_id:'w'};
  })};
  if(a==='RESERVAR'){
   const id=j.archivo.formato;reserved.set(id,j.archivo);
   return{data:{estado:'RECIBIENDO',id,ruta:id,ya_subido:uploaded.includes(id)}};
  }
  if(a==='CONFIRMAR'){
   assert(uploaded.includes(j.archivo_id));
   if(j.archivo_id==='XML'&&fail){fail=false;return{error:{message:'Fallo simulado al registrar'}};}
   return{data:{estado:'ARCHIVADO'}};
  }
  assert.fail(a);
 },storage:{from:bucket=>{assert.equal(bucket,'expedientes');return{upload:async(id,file,op)=>{
  assert.equal(op.upsert,false);assert.equal(reserved.get(id).nombre,file.name);uploaded.push(id);return{};
 }};}}}
};
window.PLATINUM_CONCILIADOR_SEMANAL={abrir:(...a)=>returnWeeks.push(a)};
vm.createContext(s);
vm.runInContext([
 src('44-respaldo-recibos.js'),extraer(src('25-validaciones-cfdi.js'),'openCfdiImport','cfdiTotalImportado'),
 extraer(src('32-legajos.js'),'openFaltanRecibos'),src('67-archivo-recibos.js')
].join('\n'),s);
const archivo=(name,text)=>{const b=new TextEncoder().encode(text);return{name,size:b.length,arrayBuffer:async()=>b.buffer};};
const click=async accion=>{const n=$('ar-recibos');return n.onclick({target:n.querySelector('[data-ar="'+accion+'"]')});};
(async()=>{
 const nav=fs.readFileSync('frontend/index.template.html','utf8');
 assert.match(nav,/data-nav-label="Importar recibos PDF y XML" onclick="sbGo\(openCfdiImport,this,false\)"/);
 assert.match(nav,/data-nav-label="Importar acuses IMSS" onclick="sbGo\(openPdfImport,this\)"/);
 assert.match(src('62-conciliador-semanal-interfaz.js'),/openCfdiImport\(\{semana:d\.semana,cierre:d\.detalle\?\.cierre\?\.id/);
 await s.openCfdiImport();assert.equal(calls.length,1);assert(!$('ar-files'),'El menú no elige S33 automáticamente');
 await s.openCfdiImport({semana:32,cierre:'c32',volver:'conciliador'});
 assert.match($('ar-recibos').textContent,/PLATINUM FICTICIO.*INFONAVIT FICTICIO/s);assert.match($('ar-recibos').textContent,/Fechas 2026-11-02 a 2026-11-08/);
 const input=$('ar-files');assert(input);Object.defineProperty(input,'files',{value:[archivo('Sin semana.pdf',pdf),archivo('Nombre S33.xml',xml)]});
 await $('ar-recibos').onchange({target:input});
 assert.equal($('ar-recibos').querySelectorAll('input[type="checkbox"]').length,2);
 await click('guardar');assert.match($('ar-recibos').textContent,/Archivado.*Fallo simulado/s);assert.deepEqual(uploaded,['PDF','XML']);
 await click('reintentar');assert.equal(calls.filter(([a,j])=>a==='CONFIRMAR'&&j.archivo_id==='PDF').length,1);
 assert.equal(calls.filter(([a,j])=>a==='CONFIRMAR'&&j.archivo_id==='XML').length,2);assert.deepEqual(uploaded,['PDF','XML']);
 await click('cerrar');assert.deepEqual(returnWeeks.pop(),[null,32,'c32']);
 s.openFaltanRecibos(32);
 const accion=[...$('modals').querySelectorAll('button')].find(b=>b.textContent.includes('Importar recibos'));
 await vm.runInContext(accion.getAttribute('onclick'),s);assert.equal(calls.at(-1)[1].cierre_id,'c32');
 await click('cerrar');assert.equal($('fr-sem').value,'S32');
 consulta=true;await s.openCfdiImport({semana:32});assert.match($('ar-recibos').textContent,/Cuenta de consulta/);assert(!$('ar-files'));
 consulta=false;periodosActivos=[...periodos,{...periodo,id:'otro32',periodo:'QUINCENAL'}];await s.openCfdiImport({semana:32});
 assert(!$('ar-files'));assert.match($('ar-recibos').textContent,/Selecciona el cierre correspondiente a S32/);
 console.log('Archivo de recibos: menú, cabecera, faltantes, PDF/XML mixtos, contexto S32, reintento parcial y consulta');
})().catch(e=>{console.error(e);process.exitCode=1;});
