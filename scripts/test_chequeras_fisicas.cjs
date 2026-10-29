// Datos ficticios. PDF/Excel reales, DOM de documentos sin navegador ni red.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),acorn=require('acorn');
const lib=require('pdf-lib'),XLSX=require('xlsx-js-style'),JSZip=require('jszip'),{DOMParser}=require('linkedom');
const output=path.resolve('tmp/pdfs/chequeras_fisicas');fs.mkdirSync(output,{recursive:true});
const modulePath='frontend/modulos/49-chequeras-fisicas.js',source=fs.readFileSync(modulePath,'utf8');
let count=0;const ok=(v,msg)=>{assert.ok(v,msg);count++;},equal=(a,b,msg)=>{assert.deepEqual(a,b,msg);count++;};
const els={},messages=[],downloads=[],queries=[],receipts=new Map(),textos=new Map();let published='',failTable='',failDownload=false,changeOnRead=false;
const obra={id:'obra-prueba',nombre:'CENTRO FICTICIO',empresa_codigo:'PLATINUM',fecha_inicio:'2026-03-30'};
const cheque=(id,n,extra={})=>({id,obra_id:obra.id,trabajador_id:'w'+id,no_trab:n,nombre:'PERSONA FICTICIA '+id,puesto:'AYUDANTE GENERAL',contratista:'CONTRATISTA PRUEBA',curp:'',consecutivo:String(n).padStart(7,'0'),num_cheque:'BANCO'+n,semana:'S14',importe:100.01,tipo_pago:'FINIQUITO',estatus:'EXPEDIDO',eliminado:false,...extra});
let rows=[cheque('b',552,{semana:'S31',importe:200.02}),cheque('a',452),cheque('c',553,{semana:'S31',tipo_pago:'NOMINA',importe:300.03}),
 cheque('x',453,{estatus:'CANCELADO'}),cheque('z',454,{estatus:'CANCELADO',eliminado:true}),cheque('d',455,{eliminado:true}),
 cheque('e',456,{estatus:'ENTREGADO'}),cheque('p',457,{estatus:'PENDIENTE'}),cheque('o',458,{obra_id:'otra'}),cheque('sin',459,{consecutivo:'',num_cheque:''})];
let workers=[],docs=[];
const money=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const box={window:{PDFLib:lib,JSZip},OBRA:obra,OBRAS:[obra],SEMANA1:'2026-03-30',Date,Number,Math,String,Map,Set,Error,Promise,Uint8Array,Blob,DOMParser,console,XLSX,JSZip,
 CFGEMP:{empresa_PLATINUM:{razon:'EMPRESA FICTICIA PLATINUM'},empresa_JIRE:{razon:'EMPRESA FICTICIA JIRE'}},
 MES:['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'],
 $:id=>els[id]||null,money,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 normSem:s=>String(parseInt(String(s).replace(/\D/g,''),10)),fullName:w=>[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' '),
 today:()=> '2026-10-28',fmtD:s=>s,empresaDeObra:o=>o.empresa_codigo,empresaDeTrabajador:w=>(box.OBRAS.find(o=>o.id===w.obra_id)||box.OBRA).empresa_codigo,
 toast:(m,t)=>messages.push({m,t}),modal:html=>{published=html;for(const id of html.matchAll(/\bid="([^"]+)"/g))els[id[1]]={innerHTML:'',textContent:'',checked:false,disabled:false};},
 setTimeout:()=>0,document:{querySelectorAll:()=>Object.values(els)},
 sha256Hex:async bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),pdfBytesToText:async bytes=>textos.get(await box.sha256Hex(bytes)),
 fetchAllRows:async make=>{const q=make();queries.push(q);if(failTable===q.table)return {error:Error('Lectura denegada'),data:[]};
  const src=q.table==='cheques'?rows:q.table==='trabajadores'?workers:docs;return {data:src.filter(x=>q.tests.every(t=>t(x))).map(x=>({...x}))};},
 sb:{from:table=>{const q={table,tests:[],select(){return this;},eq(k,v){this.tests.push(x=>x[k]===v);return this;},in(k,vs){this.tests.push(x=>vs.includes(x[k]));return this;},or(){return this;}};return q;},
 storage:{from:bucket=>({download:async archivo=>{equal(bucket,'expedientes','Bucket privado');return failDownload?{error:Error('503 simulado')}:{data:new Blob([receipts.get(archivo)])};}})}},
 registrarExportacion:async()=>{},pfCargarPDF:async()=>lib};
function load(file,names){const text=fs.readFileSync(file,'utf8'),ast=acorn.parse(text,{ecmaVersion:'latest'});
 for(const f of ast.body.filter(n=>n.type==='FunctionDeclaration'&&(!names||names.includes(n.id.name))))box[f.id.name]=new Function('box','with(box){return ('+text.slice(f.start,f.end)+');}')(box);}
load(modulePath);load('frontend/modulos/31-documentos-laborales.js',['numLetras','cartaCfg','renunciaPagesHTML','renunciaOpts']);
load('frontend/modulos/28-personal-historico-plantilla.js',['pfPDFAncho','pfPDFLineas']);
const excelSource=fs.readFileSync('frontend/modulos/07-exportacion-corporativa.js','utf8');
box.ST=new Function('XLSX',excelSource.slice(0,excelSource.indexOf('function buildSheet'))+';return ST;')(XLSX);
load('frontend/modulos/07-exportacion-corporativa.js',['buildSheet','configurarPaginaXlsx']);
box.aplicarMarcaCorporativaXlsx=async()=>{}; // Componente corporativo probado por la suite existente.
new Function('window',fs.readFileSync('frontend/modulos/44-respaldo-recibos.js','utf8'))(box.window);
box.cqDescargar=(bytes,name,mime)=>downloads.push({bytes,name,mime});
const plan=()=>box.cqPlan(rows,[551,451],false,obra);
async function seed(){
 for(const c of rows.filter(c=>['a','b','c'].includes(c.id)).sort((a,b)=>Number(a.consecutivo)-Number(b.consecutivo))){
  const w={id:c.trabajador_id,obra_id:obra.id,nombres:'PRUEBA '+c.id,primer_apellido:'TRABAJADOR',segundo_apellido:'FICTICIO',rfc:'FICT900101AAA',curp:'',nss:'',puesto:c.puesto};workers.push(w);
  const cal=box.cqPeriodo(c,obra),text=`RECIBO FICTICIO ${c.id} RFC FICT900101AAA ${cal.desde} al ${cal.hasta} Total percepciones ${Number(c.importe).toFixed(2)} Total deducciones 0.00 Neto pagado ${Number(c.importe).toFixed(2)}`;
  const d=await lib.PDFDocument.create(),p=d.addPage([612,792]),font=await d.embedFont(lib.StandardFonts.Helvetica);p.drawText(text,{x:25,y:700,size:6,font});
  const bytes=await d.save(),hash=await box.sha256Hex(bytes),archivo=c.id+'.pdf';receipts.set(archivo,bytes);textos.set(hash,text);
  docs.push({id:'doc'+c.id,trabajador_id:w.id,categoria:'RECIBO_NOMINA',semana:c.semana,archivo,nombre_archivo:archivo,hash,anulado:false,periodo_inicio:cal.desde,periodo_fin:cal.hasta,nomina_neto:c.importe});
 }
}
(async()=>{
 for(const [n,b]of [[1,1],[50,1],[51,51],[100,51],[451,451],[500,451],[501,501],[550,501],[551,551],[600,551]])equal(box.cqBloque(n),b,'Límites de bloque');
 for(const v of [0,-1,'','abc','45A','1e2','2.5',null])equal(box.cqBloque(v),null,'Consecutivo inválido');
 equal(box.cqBloque('0000452'),451,'Ceros iniciales');
 equal(box.cqPeriodo({semana:'S14',consecutivo:1},obra).hasta,'2026-07-05','Domingo S14');
 equal(box.cqPeriodo({semana:'S31',consecutivo:1},obra).hasta,'2026-11-01','Domingo S31');
 equal(box.cqPeriodo({semana:'S1'}, {...obra,fecha_inicio:'2026-12-28'}).hasta,'2027-01-03','Cruce de año');
 assert.throws(()=>box.cqPeriodo({semana:'Q21'},obra),/Semana no válida/);assert.throws(()=>box.cqPeriodo({semana:'S1'},{...obra,fecha_inicio:'2026-03-31'}),/lunes/);count+=2;
 let p=plan();equal(p.activos.map(c=>c.id),['a','b','c'],'Orden compartido de liberación y legajos');equal(p.cancelados.map(c=>c.id),['x','z'],'Incluye cancelados físicos incluso en papelera');equal(p.omitidos.map(c=>c.id),['e','p'],'Entregado opcional y pendiente excluidos');
 equal(p.errores,[],'Selección válida');ok(!p.activos.some(c=>c.id==='d'||c.id==='o'),'No papelera ni otra obra');
 equal(box.cqPlan(rows,[451],true,obra).activos.map(c=>c.id),['a','e'],'Reimpresión entregados explícita');
 ok(box.cqPlan([...rows,cheque('dup',452)],[451],false,obra).errores.some(x=>/repetido/.test(x)),'Duplicado bloquea');
 const bad=cheque('bad',552,{num_cheque:'BANCO452'});ok(box.cqPlan([rows[1],bad],[451],false,obra).errores.length,'Folio repetido en otro bloque bloquea');
 equal(box.cqCatalogo(rows,obra).map(b=>b.inicio),[451,551],'Catálogo no incluye otras obras');
 const firma=box.cqFirma(p);rows.find(c=>c.id==='a').importe=102;ok(box.cqFirma(plan())!==firma,'Detecta cambio de importe');rows.find(c=>c.id==='a').importe=100.01;
 await seed();await box.openChequerasFisicas();ok(published.includes('cqGenerar(\'ambos\')')&&published.includes('cqGenerar(\'pdf\')')&&published.includes('cqGenerar(\'excel\')'),'Tres acciones conectadas');
 box.cqSeleccionarTodos(true);equal([...box.window._CQ.seleccion],[451,551],'Seleccionar todos');box.cqSeleccionarTodos(false);equal(box.window._CQ.seleccion.size,0,'Quitar selección');
 box.cqSeleccionar(451,true);box.cqSeleccionar(551,true);ok(await box.cqPreparar(),'Preparar carga fresca');p=box.window._CQ.plan;
 equal(p.filas.length,3,'Tres fichas y recibos');ok(p.filas.every(f=>f.reciboId),'Selección automática sólo recibo único');
 docs.push({...docs[0],id:'xml',categoria:'CFDI_NOMINA',archivo:'no.xml'});docs.push({...docs[0],id:'otro',semana:'S15'});docs.push({...docs[0],id:'duplicado'});await box.cqLeerExpedientes(p);equal(p.filas[0].recs.length,1,'Excluye XML, otra semana y duplicados por hash');
 const unique={...docs[0],id:'alterno',archivo:'alterno.pdf',hash:'diferente'};docs.push(unique);await box.cqLeerExpedientes(p);equal(p.filas[0].reciboId,'','Varios recibos exigen elección');box.window._CQ.plan=p;box.cqElegirRecibo('a','doca');equal(p.filas[0].reciboId,'doca','Elegir recibo');docs.splice(docs.indexOf(unique),1);await box.cqLeerExpedientes(p);
 const wb=box.cqLibro(p),xlsx=await box.cqExcelBytes(wb),read=XLSX.read(xlsx,{type:'array'});equal(read.SheetNames,['CHEQUES','CANCELADOS','BLOQUES'],'Hojas separadas');
 equal(read.Sheets.CHEQUES.K3.v,'0000452','Consecutivo textual sin perder ceros');equal(read.Sheets.CHEQUES.H6.v,600.06,'Total en centavos');equal(read.Sheets.CANCELADOS.H5.v,200.02,'Cancelados fuera del total');fs.writeFileSync(path.join(output,'liberacion_ficticia.xlsx'),xlsx);
 const info=box.window.PLATINUM_RESPALDO_RECIBO.parsear(textos.values().next().value),f=p.filas[0];box.cqValidarRecibo(info,f);count++;
 assert.throws(()=>box.cqValidarRecibo({...info,datos:{...info.datos,identificadores:['OTRA900101AAA']}},f),/identidad/);count++;
 assert.throws(()=>box.cqValidarRecibo({...info,datos:{...info.datos,periodo_fin:'2026-07-12'}},f),/periodo/);count++;
 box.CFGEMP.empresa_PLATINUM.rfc='AAA010101AAA';assert.throws(()=>box.cqValidarRecibo({...info,datos:{...info.datos,rfc_emisor:'BBB010101BBB'}},f),/razón social/);count++;
 const pdf=await box.cqConstruirLegajos(lib,p),loaded=await lib.PDFDocument.load(pdf.bytes);equal(loaded.getPageCount(),7,'3 recibos y 4 hojas de separación');equal(pdf.indice.map(i=>[i.consecutivo,i.desde,i.hasta]),[['0000452',1,3],['0000552',4,6],['0000553',7,7]],'Legajo completo por trabajador sin portadas intermedias');
 fs.writeFileSync(path.join(output,'legajos_ficticios.pdf'),pdf.bytes);
 const jire={...obra,id:'jire-ficticio',empresa_codigo:'JIRE'},oldObras=box.OBRAS;box.OBRAS=[...oldObras,jire];
 const largo={...p.filas[0],w:{...p.filas[0].w,nombres:'MARÍA ÁNGELA FICTICIA DE PRUEBA',primer_apellido:'HERNÁNDEZ DE LA CRUZ',segundo_apellido:'MUÑOZ DEL RÍO'},cheque:{...p.filas[0].cheque,puesto:'OFICIAL CARPINTERO Y PERSONAL DE APOYO'}};
 const longDoc=await lib.PDFDocument.create(),longFonts={normal:await longDoc.embedFont(lib.StandardFonts.TimesRoman),bold:await longDoc.embedFont(lib.StandardFonts.TimesRomanBold)};
 await box.cqSeparacionPDF(longDoc,lib,largo,jire,longFonts);equal(longDoc.getPageCount(),2,'JIRE y nombres largos conservan dos hojas');fs.writeFileSync(path.join(output,'separacion_jire_ficticia.pdf'),await longDoc.save());box.OBRAS=oldObras;
 const oldHash=p.filas[0].recs[0].hash;p.filas[0].recs[0].hash='0'.repeat(64);await assert.rejects(()=>box.cqConstruirLegajos(lib,p),/huella/);count++;p.filas[0].recs[0].hash=oldHash;
 failDownload=true;await assert.rejects(()=>box.cqConstruirLegajos(lib,p),/descargar/);count++;failDownload=false;
 const saved=p.filas[0].reciboId;p.filas[0].reciboId='';await assert.rejects(()=>box.cqConstruirLegajos(lib,p),/Completa/);count++;p.filas[0].reciboId=saved;
 await box.cqGenerar('ambos');equal(downloads.length,1,'Ambos descarga un ZIP');const zip=await JSZip.loadAsync(downloads[0].bytes);equal(Object.keys(zip.files).filter(k=>!zip.files[k].dir).length,2,'ZIP con Excel y PDF');ok(Object.keys(zip.files).some(k=>k.endsWith('.pdf')),'PDF dentro del ZIP');
 await box.cqGenerar('excel');await box.cqGenerar('pdf');equal(downloads.length,3,'Botones individuales descargan');
 rows.find(c=>c.id==='a').importe=101;await box.cqGenerar('pdf');equal(downloads.length,3,'Cambio concurrente no descarga');rows.find(c=>c.id==='a').importe=100.01;
 const oldName=workers[0].nombres;workers[0].nombres='NOMBRE MODIFICADO';await assert.rejects(()=>box.cqRevalidar(box.window._CQ,p,true),/ficha/);count++;workers[0].nombres=oldName;
 const oldFile=docs[0].archivo;docs[0].archivo='cambiado.pdf';await assert.rejects(()=>box.cqRevalidar(box.window._CQ,p,true),/recibo/);count++;docs[0].archivo=oldFile;
 const originalBuild=box.cqConstruirLegajos;let release;box.cqConstruirLegajos=async()=>new Promise(r=>release=()=>r(pdf));const pending=box.cqGenerar('pdf');while(!release)await new Promise(r=>setImmediate(r));await box.cqGenerar('pdf');release();await pending;equal(downloads.length,4,'Doble clic sólo descarga una vez');box.cqConstruirLegajos=originalBuild;
 const before=JSON.stringify(rows);box.OBRA={...obra,id:'otra'};await box.cqGenerar('excel');equal(downloads.length,4,'Cambio de centro no descarga');box.OBRA=obra;equal(JSON.stringify(rows),before,'No modifica cheques');
 failTable='documentos';box.window._CQ.plan=null;ok(!await box.cqPreparar(),'Error de lectura no equivale a lista vacía');ok(!box.window._CQ.ocupado,'Controles se liberan tras error');failTable='';
 ok(box.cqArchivoBase({...p,bloques:Array.from({length:100},(_,i)=>i*50+1)}).length<180,'Nombre seguro al seleccionar muchos bloques');
 equal(queries.filter(q=>q.table==='cheques').every(q=>q.tests.length===1),true,'Lecturas por centro');
 const l=fs.readFileSync('frontend/modulos/32-legajos.js','utf8'),b=fs.readFileSync('frontend/modulos/12-bloques-entregas.js','utf8'),html=fs.readFileSync('frontend/index.template.html','utf8');
 ok(l.includes('openChequerasFisicas')&&b.includes('openChequerasFisicas')&&html.includes('sbGo(openChequerasFisicas)'),'Accesos desde legajos, bloques, menú y cheques');
 ok(!/\.rpc\(|\.update\(|\.insert\(/.test(source)&&!source.replace(/e\.seleccion\.delete\(n\)/g,'').includes('.delete('),'No mutaciones de pagos, trabajadores o cheques');
 console.log('PASS chequeras físicas: '+count+' comprobaciones de bloques, botones, fechas, PDF/Excel/ZIP reales, identidad, permisos de lectura, errores y concurrencia; sin navegador.');
})().catch(e=>{console.error(e);process.exitCode=1;});
