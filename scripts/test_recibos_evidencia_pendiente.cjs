// Recibos S34: (1) XML archivados cuya evidencia fiscal nunca se verificó (lector de servidor caído) dejaban a todos los PDF
// del mismo UUID en «UUID con datos distintos o evidencia aún incompleta»; al abrir el periodo se verifican, se revalidan los
// originales afectados y la confirmación global los registra. (2) NOI no timbra ni genera PDF con neto 0: ese XML se acepta
// sólo como constancia sin efecto fiscal; con neto distinto de 0 se sigue rechazando. Datos ficticios; sin navegador ni red.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{DOMParser}=require('linkedom');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);n++;},ok=(v,m)=>{assert(v,m);n++;};
const clone=x=>JSON.parse(JSON.stringify(x));

// ---------- 1. Lector XML compartido (módulo 44) ----------
const b44={window:{},Date};vm.createContext(b44);vm.runInContext(fs.readFileSync('frontend/modulos/44-respaldo-recibos.js','utf8'),b44);
const api=b44.window.PLATINUM_RESPALDO_RECIBO;
const xml=({total='0.00',per='0.00',ded='0.00',tipo='O',timbre=false,ps=[]}={})=>`<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:nomina12="http://www.sat.gob.mx/nomina12" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" TipoDeComprobante="N" Total="${total}"><cfdi:Emisor Rfc="EMP900101AA1"/><cfdi:Receptor Rfc="PRUP900101AA1"/><cfdi:Complemento><nomina12:Nomina TipoNomina="${tipo}" FechaInicialPago="2026-08-17" FechaFinalPago="2026-08-23" FechaPago="2026-08-23" TotalPercepciones="${per}" TotalDeducciones="${ded}"><nomina12:Receptor Curp="PRUP900101HHGXXX01" NumSeguridadSocial="12345678901"/><nomina12:Percepciones>${ps.map(x=>`<nomina12:Percepcion TipoPercepcion="${x[0]}" Concepto="${x[1]}" ImporteGravado="${x[2]}" ImporteExento="0"/>`).join('')}</nomina12:Percepciones></nomina12:Nomina>${timbre?`<tfd:TimbreFiscalDigital UUID="12345678-1234-1234-1234-123456789012" SelloSAT="${'AbC123+/'.repeat(10)}"/>`:''}</cfdi:Complemento></cfdi:Comprobante>`;
const sinTimbre={sinTimbreNetoCero:true};
const cero=api.extraerXML(xml({ps:[['001','SUELDO','0.00']]}),DOMParser,sinTimbre);
eq([cero.sin_timbre,cero.cfdi_uuid,cero.neto,cero.concepto.estado,cero.concepto.tipo],[true,null,0,'NOMINA','NOMINA'],'neto 0 sin timbre: constancia con concepto de nómina ordinaria');
ok(!cero.evidencia_timbrado&&/sin efecto|no acredita/.test(cero.evidencia_sin_timbre),'sin evidencia de timbrado; leyenda sin efecto fiscal');
eq([cero.rfc,cero.curp,cero.periodo_inicio,cero.periodo_fin],['PRUP900101AA1','PRUP900101HHGXXX01','2026-08-17','2026-08-23'],'identidad y periodo del XML sin timbre');
const ceroDed=api.extraerXML(xml({per:'250.00',ded:'250.00',ps:[['001','SUELDO','250.00']]}),DOMParser,sinTimbre);
eq([ceroDed.sin_timbre,ceroDed.neto,ceroDed.concepto.estado],[true,0,'NOMINA'],'neto 0 por deducciones iguales a percepciones');
eq(api.extraerXML(xml({tipo:'E'}),DOMParser,sinTimbre).concepto.estado,'POR_CLASIFICAR','nómina extraordinaria sin percepciones: concepto no se inventa');
assert.throws(()=>api.extraerXML(xml(),DOMParser),/sin timbre fiscal del SAT/,'sin la opción (cheques, cierre por fotografía) se sigue rechazando');n++;
assert.throws(()=>api.extraerXML(xml({total:'300.00',per:'300.00',ps:[['001','SUELDO','300.00']]}),DOMParser,sinTimbre),/sólo se acepta cuando el neto es 0 \(Total XML: 300\.00\)/,'sin timbre con neto ≠ 0 se rechaza');n++;
assert.throws(()=>api.extraerXML(xml({total:'0.01',per:'0.01',ps:[['001','SUELDO','0.01']]}),DOMParser,sinTimbre),/neto es 0/,'un centavo ya no es neto 0');n++;
const timbrado=api.extraerXML(xml({total:'300.00',per:'300.00',timbre:true,ps:[['001','SUELDO','300.00']]}),DOMParser,sinTimbre);
eq([timbrado.cfdi_uuid,timbrado.sin_timbre,!!timbrado.evidencia_timbrado],['12345678-1234-1234-1234-123456789012',undefined,true],'el timbrado no cambia con la opción');
const timbradoCero=api.extraerXML(xml({timbre:true}),DOMParser,sinTimbre);
eq([timbradoCero.cfdi_uuid,timbradoCero.sin_timbre],['12345678-1234-1234-1234-123456789012',undefined],'timbrado con neto 0 sigue siendo CFDI timbrado');

// ---------- 2. Servicio de archivo por periodo (módulo 83) ----------
const U1='22222222-AAAA-4AAA-8AAA-000000000001',U2='22222222-AAAA-4AAA-8AAA-000000000002',MOTIVO_VIEJO='UUID con datos distintos o evidencia aún incompleta; original conservado.';
const arch=(id,formato,uuid,neto,resultado,extra={})=>({id,documento_id:null,huella:id.padEnd(64,'0'),ruta:'privado/'+id,formato,estado:'CONFLICTO',trabajador_id:resultado.trabajador_id||null,
 datos:{nombre:id+'.'+formato.toLowerCase(),formato,uuid,neto,desde:'2026-08-17',hasta:'2026-08-23',concepto:neto==null?null:'NOMINA',resultado},...extra});
// Semántica de recibo_libre_validar: PDF con XML del mismo UUID sin evidencia verificada → CONFLICTO; XML sin UUID sólo con neto 0 marcado sin timbre.
function servidor(){
 const s={filas:new Map(),docs:[],verificados:new Set(),llamadas:[],lectorCaido:false,escritura:true};
 const validar=d=>{
  if(d.error)return{estado:'REVISAR',motivo:d.error};
  if(d.neto==null)return{estado:'REVISAR',motivo:'Neto pendiente de lectura'};
  if(d.formato==='XML'&&!d.uuid&&!(d.sin_timbre&&/^0+(\.0{1,2})?$/.test(d.neto)))return{estado:'REVISAR',motivo:'UUID pendiente o inválido'};
  const r={estado:'VALIDO',trabajador_id:'W-'+(d.uuid||d.nombre)};
  if(d.uuid&&s.docs.some(x=>x.cfdi_uuid===d.uuid)&&!s.verificados.has(d.uuid))return{...r,estado:'CONFLICTO',fiscal_pendiente:true,motivo:'El XML de este UUID está archivado pero su evidencia fiscal aún no se verifica; verifícala y vuelve a confirmar. Original conservado.'};
  return d.sin_timbre?{...r,sin_timbre:true,efecto_fiscal:'NINGUNO'}:r;
 };
 const pendiente=f=>f.formato==='XML'&&!!f.documento_id&&!!f.datos.uuid&&!s.verificados.has(f.datos.uuid);
 s.agregar=(f,doc)=>{s.filas.set(f.id,clone(f));if(doc){s.docs.push({id:f.documento_id,cfdi_uuid:f.formato==='XML'?f.datos.uuid:null,categoria:'CFDI_NOMINA'});}};
 s.rpc=async(name,{p_accion:a,p_datos:j})=>{
  s.llamadas.push(a+(j.archivo_id?':'+j.archivo_id:j.documento_id?':'+j.documento_id:''));
  if(name==='control_revision_recibo'){
   const d=s.docs.find(x=>x.id===j.documento_id);
   if(a==='PREPARAR')return{data:{estado:'LISTO',lote_id:'L-'+j.documento_id,token:'t'}};
   return{data:d&&d.cfdi_uuid&&s.verificados.has(d.cfdi_uuid)?{estado:'VERIFICADO'}:{estado:'REVISAR',motivo:'Lectura documental no completada'}};
  }
  if(a==='CONTEXTO')return{data:{contexto:{...j.contexto,desde:'2026-08-17',hasta:'2026-08-23'},archivos:[...s.filas.values()].map(f=>({...clone(f),fiscal_pendiente:pendiente(f)})),cierres:[],escritura:s.escritura}};
  const f=s.filas.get(j.archivo_id);
  if(a==='ABRIR')return{data:{...clone(f),ya_subido:true}};
  if(a==='LECTURA'){
   if(f.documento_id)return{data:{estado:'ARCHIVADO',documento_id:f.documento_id}};
   const d={...j.lectura,nombre:f.datos.nombre,formato:f.formato};const r=validar(d);
   f.datos={...d,resultado:r};f.trabajador_id=r.trabajador_id||null;f.estado='CONFLICTO';return{data:{...r,contexto:j.contexto}};
  }
  if(a==='REGISTRAR'){
   if(f.documento_id)return{data:{estado:'ARCHIVADO',documento_id:f.documento_id}};
   const r=validar(f.datos);if(r.estado!=='VALIDO')return{data:r};
   const sinT=f.formato==='XML'&&!f.datos.uuid,doc={id:'D'+(s.docs.length+1),cfdi_uuid:f.formato==='XML'?f.datos.uuid:null,categoria:f.formato==='XML'&&!sinT?'CFDI_NOMINA':'RECIBO_NOMINA',subtipo:sinT?'XML SIN TIMBRE · NETO 0':f.formato==='XML'?'CFDI TIMBRADO':'RECIBO'};
   s.docs.push(doc);f.documento_id=doc.id;f.estado='ARCHIVADO';return{data:{...r,estado:'ARCHIVADO',documento_id:doc.id,vinculacion:'PENDIENTE'}};
  }
  throw Error('acción '+a);
 };
 return s;
}
const window={},box=vm.createContext({window,Uint8Array,Date,AbortController,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync('frontend/modulos/83-recibos-contexto-servicio.js','utf8'),box);
async function abrir(srv){
 let estado,busy,enLectura=null;const verif=[],lecturas=[];
 const dep={vigente:()=>true,cambio:(e,o)=>{estado=e;busy=o;},usuario:()=>'U',rpc:(...a)=>srv.rpc(...a),
  // Edge lectura-documental simulado: verifica el XML salvo que el lector esté caído (falla de S34: 500 por columna ambigua).
  verificar:async({lote_id})=>{const id=lote_id.slice(2),d=srv.docs.find(x=>x.id===id);verif.push(id);if(srv.lectorCaido)return{error:{message:'Edge Function returned a non-2xx status code'}};if(d?.cfdi_uuid)srv.verificados.add(d.cfdi_uuid);return{};},
  hash:async()=>srv.filas.get(enLectura)?.huella,archivo:(blob,nombre)=>({name:nombre,arrayBuffer:async()=>new ArrayBuffer(1)}),
  storage:{from:()=>({download:async ruta=>{enLectura=ruta.replace('privado/','');return{data:{}};}})},
  // Relectura del XML de NOI sin timbre con neto 0 (lo que entrega el módulo 67 con la opción sinTimbreNetoCero).
  leer:async f=>{lecturas.push(f.id);f.lectura={datos:{recibos:1,neto:0,percepciones:0,deducciones:0,otros_pagos:0,cfdi_uuid:null,sin_timbre:true},errores:[],pendientes:[]};f.datos={...f.datos,neto:'0.00',uuid:null,sin_timbre:true,concepto:'NOMINA'};},
  incorporar:()=>{}};
 const svc=box.window.PLATINUM_RECIBOS_CONTEXTO.crear(dep);
 await svc.abrir('o',{empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:34});
 return{svc,get estado(){return estado;},get busy(){return busy;},verif,lecturas};
}
// Estado de producción de S34 (reducido): XML archivados sin verificar, un PDF leído VALIDO antes de registrar su XML,
// otro PDF que ya quedó en conflicto en su lectura y un XML de NOI sin timbre (neto 0) rechazado antes de esta corrección.
function s34(){
 const s=servidor();
 s.agregar(arch('X1','XML',U1,'2400.26',{estado:'VALIDO',trabajador_id:'W-'+U1},{documento_id:'DX1',estado:'ARCHIVADO'}),true);
 s.agregar(arch('X2','XML',U2,'1868.42',{estado:'VALIDO',trabajador_id:'W-'+U2},{documento_id:'DX2',estado:'ARCHIVADO'}),true);
 s.agregar(arch('P1','PDF',U1,'2400.26',{estado:'VALIDO',trabajador_id:'W-'+U1}));
 s.agregar(arch('P2','PDF',U2,'1868.42',{estado:'CONFLICTO',trabajador_id:'W-'+U2,motivo:MOTIVO_VIEJO}));
 s.agregar(arch('S0','XML',null,null,{estado:'REVISAR',motivo:'Neto pendiente de lectura'}));
 return s;
}
const docDe=(s,id)=>s.docs.find(d=>d.id===s.filas.get(id).documento_id);
(async()=>{
 // 2a. Lector del servidor caído (situación reportada): los PDF no pueden registrarse; el XML sin timbre sí, sin verificación.
 {const s=s34();s.lectorCaido=true;const t=await abrir(s);
  eq(t.svc.pendientesRecuperacion(),4,'pendientes al abrir: 2 XML sin evidencia, 1 XML sin timbre, 1 PDF en conflicto');
  const l=await t.svc.confirmarLote();const rec=t.estado.recuperacion;
  eq([rec.total,rec.procesados,rec.verificados,rec.releidos,rec.revalidados,rec.en_curso],[4,4,0,1,0,false],'recuperación completa sin verificar con el lector caído');
  eq(rec.pendientes.map(x=>x.id).sort(),['P2','X1','X2'],'pendientes sin resolver listados con su motivo');
  eq(l.filas.P1.estado,'PENDIENTE','el PDF no se registra sin evidencia fiscal del XML');
  ok(/evidencia fiscal aún no se verifica/.test(l.filas.P1.motivo),'motivo específico: evidencia fiscal pendiente, no «datos distintos»');
  eq(l.filas.S0.estado,'CONFIRMADO','XML sin timbre neto 0 registrado');
  eq([docDe(s,'S0').categoria,docDe(s,'S0').subtipo,docDe(s,'S0').cfdi_uuid],['RECIBO_NOMINA','XML SIN TIMBRE · NETO 0',null],'constancia sin UUID ni categoría CFDI');
  ok(!t.verif.includes(s.filas.get('S0').documento_id),'el XML sin timbre no se envía a verificación fiscal');
  eq(t.lecturas,['S0'],'sólo se relee el XML sin timbre');eq(t.busy,false,'operación liberada');
 }
 // 2b. Lector corregido: al abrir el periodo se recupera todo y la confirmación global registra los PDF.
 {const s=s34();const t=await abrir(s);
  const rec=await t.svc.recuperar();
  eq([rec.total,rec.verificados,rec.releidos,rec.revalidados,rec.pendientes.length],[4,2,1,1,0],'2 XML verificados, XML sin timbre releído, PDF revalidado');
  eq(t.svc.pendientesRecuperacion(),0,'nada pendiente tras recuperar');
  eq(t.verif.sort(),['DX1','DX2'],'una verificación por XML archivado');
  const llamadas=s.llamadas.length;await t.svc.recuperar();eq(s.llamadas.length,llamadas,'segunda recuperación sin llamadas (una vez por sesión)');
  const r=t.svc.resumen();eq(r.listos.sort(),['P1','P2','S0'],'PDF revalidados y XML sin timbre listos');
  const l=await t.svc.confirmarLote();
  eq(l.totales,{CONFIRMADO:3,YA_EXISTENTE:0,FALLIDO:0,PENDIENTE:0,total:3,procesados:3},'confirmación global completa');
  eq(['P1','P2'].map(id=>docDe(s,id).categoria),['RECIBO_NOMINA','RECIBO_NOMINA'],'PDF registrados como recibo del CFDI verificado');
  eq(s.docs.filter(d=>d.cfdi_uuid===U1).length,1,'un solo CFDI por UUID');
  ok(!t.verif.includes(s.filas.get('S0').documento_id),'sin verificación del XML sin timbre en el lote');
 }
 // 2c. «Confirmar todas» directamente (sin recuperar antes): la recuperación corre primero dentro del lote.
 {const s=s34();const t=await abrir(s);const l=await t.svc.confirmarLote();
  eq(l.totales.CONFIRMADO,3,'el lote recupera y registra P1, P2 y S0');eq(t.estado.recuperacion.verificados,2,'recuperación dentro del lote');
  ok(s.llamadas.indexOf('PREPARAR:DX1')<s.llamadas.indexOf('REGISTRAR:P1'),'XML verificado antes de registrar su PDF');
 }
 // 2d. Sin permiso de escritura no se intenta recuperar.
 {const s=s34();s.escritura=false;const t=await abrir(s);eq(await t.svc.recuperar(),null,'sin escritura no recupera');eq(s.llamadas.filter(x=>/PREPARAR|LECTURA/.test(x)).length,0,'sin llamadas de escritura');}
 console.log('PASS recibos evidencia pendiente y XML sin timbre neto 0: '+n+' comprobaciones (lector, recuperación, lote, permisos).');
})().catch(e=>{console.error(e);process.exit(1);});
