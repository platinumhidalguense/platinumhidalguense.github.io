// Importación bancaria: folio del lote del global, vista previa por tramos con progreso,
// división ante tiempo agotado, una sola operación y respuestas tardías. Datos ficticios;
// con los originales privados (work/banco_s33_20261119, no publicados) se verifica además
// el global real de 26 páginas y los comprobantes individuales.
const assert=require('assert/strict'),crypto=require('crypto'),fs=require('fs');
const core=require('../frontend/modulos/58-conciliador-core.js'),api=require('../frontend/modulos/78-banco-historico-servicio.js');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},ok=(v,m)=>{assert(v,m);n++;};
const ctx={empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:33,concepto:'TODOS'};
const alcance={obra_id:'O',usuario_id:'U',firma:'CONTEXTO'};
const hash=async b=>crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const FOLIO='ABCDEF0123456789ABCDEF0123456789';
const renglon=(i,cta,nombre,imp)=>`13/11/2026 •${cta} ${nombre} - Exitoso ${imp} MXN`;
// Global ficticio: el folio de confirmación sólo aparece en el encabezado de la página 1.
let paginasGlobal=()=>[
 {numero:1,texto:'Resumen general de grupo de Pago de nómina Importe total 6,000.00 MXN Número de registros 3 Exitosas 3 Folio de confirmación '+FOLIO+' Resumen general '+renglon(1,'1111','PERSONA PRUEBA UNO','2,000.00')},
 {numero:2,texto:'Resumen general '+renglon(2,'2222','PERSONA PRUEBA DOS','2,000.00')+' '+renglon(3,'3333','PERSONA PRUEBA TRES','2,000.00')}];
const archivos=new Map(),bytes=new Map(),llamadas=[];let falla=0,fija=false,demora=null;
const prev=(f,i)=>({fila:i,huella:'H'+f.revision+'-'+i,estado:'LISTO',trabajador_id:f.propuesta.records[i-1]?.trabajador_id||null});
const cfg={context:()=>alcance,core,hash,file:(b,name)=>({name,arrayBuffer:async()=>b}),legacy:{},
 rpc:async(fn,{p_accion:a,p_datos:j})=>{if(fn==='control_importacion_contexto')return{error:{code:'PGRST202',message:'Could not find the function'}};
  let f=archivos.get(j.archivo_id);llamadas.push([a,j.desde??null,j.hasta??null]);
  if(a==='CONTEXTO')return{data:{obra_id:'O',fuentes:[],personas:[],archivos:[...archivos.values()].map(clone),puede_importar:true}};
  if(a==='INICIAR'){f=[...archivos.values()].find(x=>x.sha256===j.sha256);if(!f){f={id:'F'+(archivos.size+1),obra_id:'O',nombre:j.nombre,sha256:j.sha256,contexto:j.contexto,ruta:'R'+archivos.size,revision:1,estado:'SUBIENDO',propuesta:{},padre_id:null};archivos.set(f.id,f);}return{data:clone(f)};}
  if(a==='ABRIR')return{data:clone(f)};
  if(a==='ARCHIVADO'){f.estado='ARCHIVADO';f.revision++;return{data:clone(f)};}
  if(a==='PROPUESTA'){f.propuesta=clone(j.propuesta);f.estado='LEIDO';f.revision++;return{data:clone(f)};}
  if(a==='PREVISUALIZAR'){if(demora)await demora;if(fija||falla>0){if(!fija)falla--;return{error:{code:'57014',message:'canceling statement due to statement timeout'}};}
   const tot=f.propuesta.records.length,d=Math.max(1,j.desde||1),h=Math.min(tot,j.hasta||tot);
   return{data:{archivo_id:f.id,revision:f.revision,total:tot,desde:d,hasta:h,filas:Array.from({length:Math.max(0,h-d+1)},(_,k)=>prev(f,d+k))}};}
  if(a==='ERROR'){f.estado='ERROR';f.error=j.error;return{data:clone(f)};}
  throw Error(a);},
 storage:{from:()=>({upload:async(r,file)=>{bytes.set(r,await file.arrayBuffer());return{};},download:async r=>({data:{arrayBuffer:async()=>bytes.get(r)}})})},
 paginas:async()=>paginasGlobal(),fragmento:async()=>new ArrayBuffer(1),ia:async()=>({ok:false,error:'sin complemento'})};
const pdf=t=>{const b=new TextEncoder().encode('%PDF-'+t).buffer;return{name:t+'.pdf',size:b.byteLength,arrayBuffer:async()=>b};};
(async()=>{
 // 1) Folio del lote: todas las operaciones del global llevan la referencia del lote impresa en su encabezado.
 let s=api.crear(cfg);await s.abrir(ctx);await s.subir([pdf('GLOBAL')]);
 let a=s.estado().archivo,rs=a.propuesta.records;
 eq(rs.length,3,'tres operaciones del global');eq(a.propuesta.folio_lote,FOLIO,'folio del lote en la propuesta');
 ok(rs.every(r=>r.folio===FOLIO),'cada operación conserva la referencia del lote');
 eq(rs.map(r=>r.folio_origen||'IMPRESO'),['IMPRESO','LOTE','LOTE'],'origen del folio: impreso en la página 1, del lote en las demás');
 eq(rs.map(r=>r.mask),['1111','2222','3333'],'cada operación conserva su propia cuenta destino');
 eq(core.LECTOR_VERSION,'BANCO_ROLES_V3','versión del lector: las lecturas anteriores sin pagos se reprocesan al abrir');
 // 2) Vista previa automática por tramos con resultado completo y progreso que se limpia.
 ok(s.estado().previa&&s.estado().previa.filas.length===3&&s.estado().previa.total===3,'propuesta completa tras leer');
 eq(s.estado().previaProgreso,null,'el progreso se limpia al terminar');
 // 3) Muchas operaciones: tramos de 60 y progreso real.
 const muchas=Array.from({length:130},(_,i)=>renglon(i,String(1000+i),'PERSONA '+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26)+' PRUEBA','100.00')).join(' ');
 paginasGlobal=()=>[{numero:1,texto:'Resumen general Número de registros 130 Importe total 13,000.00 MXN Folio de confirmación '+FOLIO+' Resumen general '+muchas}];
 const progresos=[];const s2=api.crear({...cfg,onChange:()=>{}});
 await s2.abrir(ctx);llamadas.length=0;
 const espia=setInterval(()=>{const p=s2.estado()?.previaProgreso;if(p)progresos.push(p.hechas);},0);
 await s2.subir([pdf('GLOBAL-130')]);clearInterval(espia);
 const tramos=llamadas.filter(x=>x[0]==='PREVISUALIZAR').map(x=>[x[1],x[2]]);
 eq(tramos,[[1,60],[61,120],[121,180]],'tres tramos de 60 operaciones');
 eq(s2.estado().previa.filas.map(x=>x.fila),Array.from({length:130},(_,i)=>i+1),'130 filas en orden, sin huecos ni duplicados');
 // 4) Tiempo agotado: el tramo se divide y lo calculado se conserva; persistente: error visible y lectura intacta.
 llamadas.length=0;falla=1;await s2.revisar();
 const t4=llamadas.filter(x=>x[0]==='PREVISUALIZAR').map(x=>[x[1],x[2]]);
 eq(t4[0],[1,60],'primer intento con 60');eq(t4[1],[1,30],'tras el tiempo agotado, mitad del tramo');
 eq(s2.estado().previa.filas.length,130,'propuesta completa tras dividir');eq(s2.estado().previaError,null,'sin error residual');
 fija=true;await assert.rejects(s2.revisar(),/statement timeout/);n++;fija=false;
 eq(s2.estado().archivo.propuesta.records.length,130,'un tiempo agotado persistente no pierde la lectura');
 // 5) Una sola operación: una llamada desde=hasta y sustitución sólo de esa fila.
 await s2.revisar();llamadas.length=0;const f77=await s2.previaFila(76);
 eq(llamadas.filter(x=>x[0]==='PREVISUALIZAR'),[['PREVISUALIZAR',77,77]],'una sola operación, sin recalcular las 130');
 eq(f77.fila,77,'fila consultada');eq(s2.estado().previa.filas.length,130,'la vista previa completa se conserva');
 // Sin vista previa completa, la de una fila es parcial y no habilita la confirmación global.
 const s3=api.crear(cfg);await s3.abrir(ctx);await s3.seleccionar(s2.estado().archivo.id);
 s3.estado().previa=null;await s3.previaFila(4);ok(s3.estado().previa.parcial,'vista previa parcial');eq(s3.resumenListas(),null,'la confirmación global exige la propuesta completa');
 // 6) Respuesta tardía de otro contexto: se descarta.
 let soltar;demora=new Promise(r=>soltar=r);const pend=s3.revisar().catch(e=>e);
 alcance.firma='OTRO';s3.cerrar?.();soltar();demora=null;const res=await pend;
 ok(res instanceof Error&&/Cambió el centro o la sesión/.test(res.message),'respuesta tardía descartada al cambiar el contexto');alcance.firma='CONTEXTO';
 // 7) Originales privados: global de 26 páginas y comprobantes individuales.
 const priv='work/banco_s33_20261119/textos.json';
 if(fs.existsSync(priv)){
  const t=JSON.parse(fs.readFileSync(priv,'utf8')),g=Object.keys(t).find(k=>/GLOBAL/.test(k));
  paginasGlobal=()=>t[g];const s4=api.crear(cfg);await s4.abrir(ctx);await s4.subir([pdf('GLOBAL-REAL')]);
  const p=s4.estado().archivo.propuesta,sum=p.records.reduce((x,r)=>x+Math.round(r.importe*100),0)/100;
  eq([p.records.length,sum,p.esperados,p.totalEsperado],[327,774802.4,327,774802.4],'ORIGINAL PRIVADO: 327 operaciones y $774,802.40');
  ok(p.records.every(r=>r.folio===p.folio_lote&&/^[0-9A-F]{32}$/.test(r.folio)),'ORIGINAL PRIVADO: referencia del lote en las 327');
  ok(p.records.every(r=>/^\d{4}$/.test(r.mask)&&!r.cuenta),'ORIGINAL PRIVADO: máscara de 4 dígitos y cuenta completa vacía (no se inventa)');
  eq(new Set(p.records.map(r=>r.pagina)).size,26,'ORIGINAL PRIVADO: operaciones en las 26 páginas');
  for(const k of Object.keys(t).filter(k=>!/GLOBAL/.test(k))){const r=core.leerTradicional(t[k][0].texto,{});
   ok(r.tipo==='INDIVIDUAL'&&r.records.length===1&&r.records[0].estado==='EXITOSO'&&/^\d{24}$/.test(r.records[0].rastreo)&&!/PLATINUM/.test(r.records[0].titular),'ORIGINAL PRIVADO: '+k.replace(/_13_NOV.*$/,'')+' con beneficiario, rastreo y estado');}
  console.log('ORIGINALES PRIVADOS verificados.');
 }
 console.log('PASS banco por lote y tramos: '+n+' comprobaciones (folio del lote, tramos de 60 con progreso, división por tiempo agotado, una operación, parcial, respuesta tardía)');
})().catch(e=>{console.error(e);process.exitCode=1;});
