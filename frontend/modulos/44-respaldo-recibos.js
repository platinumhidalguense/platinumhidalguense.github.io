/* Lectura determinista de evidencia: sin fórmulas de nómina ni escrituras. */
(function(root){
 'use strict';
 const meses={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
 const normalizar=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 function clasificarPercepciones(percepciones){
  const ps=(percepciones||[]).filter(p=>Number(p.gravado||0)+Number(p.exento||0)>0),conceptos=ps.map(p=>normalizar(p.concepto));
  const aguinaldo=ps.some(p=>p.sat==='002'||/\bAGUINALDO\b/.test(normalizar(p.concepto)));
  const vacaciones=conceptos.some(t=>/\bVACACIONES\b/.test(t));
  const prima=ps.some(p=>p.sat==='021'||/PRIMA\s+VACACIONAL/.test(normalizar(p.concepto)));
  const separacion=ps.some(p=>['022','023','025'].includes(p.sat)||/\b(?:FINIQUITO|INDEMNIZACION|LIQUIDACION|PRIMA DE ANTIGUEDAD)\b/.test(normalizar(p.concepto)));
  const sueldo=ps.some(p=>p.sat==='001'&&!/\bVACACIONES\b/.test(normalizar(p.concepto)));
  const fin=separacion||(aguinaldo&&vacaciones&&prima);
  return {tipo:fin&&!sueldo?'FINIQUITO':!fin&&sueldo?'NOMINA':null,estado:fin&&sueldo?'MIXTO':fin?'FINIQUITO':sueldo?'NOMINA':'POR_CLASIFICAR',version:'CONCEPTOS_v1',percepciones:ps};
 }
 function clasificarTexto(text){
  const t=normalizar(text),fin=/\b(?:FINIQUITO|LIQUIDACION)\b/.test(t)||(/\bAGUINALDO\b/.test(t)&&/\bVACACIONES\b/.test(t)&&/PRIMA\s+VACACIONAL/.test(t));
  // «Sueldo diario» es un dato de la ficha, no una percepción de sueldo.
  const detalle=t.match(/\bPERCEPCIONES\b([\s\S]*?)\bDEDUCCIONES\b/)?.[1]||'';
  // En otro diseño NOI la fila sale concepto, importe, clave NOI y clave SAT.
  const columnas=/\b(?:SUELDO|SUELDOS|SALARIO)\s+\d+(?:,\d{3})*\.\d{2}\s+P0*1\s+0*1\b/.test(detalle);
  const sueldo=columnas||/\b(?:SUELDO|SALARIO)\s+(?:ORDINARIO|NORMAL)\b/.test(t)||/\bP?0*1\s+(?:SUELDO|SUELDOS|SALARIO)\b/.test(t);
  return {tipo:fin&&!sueldo?'FINIQUITO':sueldo&&!fin?'NOMINA':null,estado:fin&&sueldo?'MIXTO':fin?'FINIQUITO':sueldo?'NOMINA':'POR_CLASIFICAR',version:'CONCEPTOS_v1'};
 }
 function extraerXML(text,Parser){
  if(/<!DOCTYPE|<!ENTITY/i.test(text)||!text.includes('http://www.sat.gob.mx/nomina12'))throw Error('XML de nómina no válido o con entidades no permitidas');
  const doc=new Parser().parseFromString(text,'application/xml'),all=[];
  function walk(e){if(e.nodeType===1)all.push(e);for(const c of Array.from(e.childNodes||[]))walk(c);}walk(doc);
  const local=e=>String(e.localName||e.nodeName).split(':').pop(),one=name=>all.find(e=>local(e)===name),att=(e,k)=>e?.getAttribute(k)||null;
  if(one('parsererror'))throw Error('XML mal formado');
  const comp=doc.documentElement,nom=one('Nomina'),stamp=one('TimbreFiscalDigital');
  if(local(comp)!=='Comprobante'||att(comp,'TipoDeComprobante')!=='N'||!nom||!stamp)throw Error('No es un CFDI de nómina timbrado');
  const rec=Array.from(comp.childNodes||[]).find(e=>e.nodeType===1&&local(e)==='Receptor'),emp=Array.from(comp.childNodes||[]).find(e=>e.nodeType===1&&local(e)==='Emisor'),nr=Array.from(nom.childNodes||[]).find(e=>e.nodeType===1&&local(e)==='Receptor');
  const amount=(e,k)=>{const raw=att(e,k)||'0';if(!/^\d+(?:\.\d{1,6})?$/.test(raw))throw Error('Importe XML inválido');return Number(raw);};
  const neto=amount(comp,'Total'),percepciones=amount(nom,'TotalPercepciones'),deducciones=amount(nom,'TotalDeducciones'),otros=amount(nom,'TotalOtrosPagos');
  if(!att(comp,'Total')||Math.round((percepciones+otros-deducciones)*100)!==Math.round(neto*100)||neto!==Math.round(neto*100)/100)throw Error('El desglose XML no cuadra con el neto');
  const uuid=String(att(stamp,'UUID')||'').toUpperCase(),sello=att(stamp,'SelloSAT');
  if(!/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/.test(uuid)||!sello||sello.length<40)throw Error('Faltan UUID o sello SAT del XML');
  const ps=all.filter(e=>local(e)==='Percepcion').map(e=>({sat:att(e,'TipoPercepcion'),concepto:att(e,'Concepto'),gravado:att(e,'ImporteGravado'),exento:att(e,'ImporteExento')}));
  const rfc=String(att(rec,'Rfc')||'').toUpperCase(),curp=String(att(nr,'Curp')||'').toUpperCase(),nss=att(nr,'NumSeguridadSocial'),rfc_emisor=String(att(emp,'Rfc')||'').toUpperCase();
  return {recibos:1,rfc,curp,nss,rfc_emisor,identificadores:[rfc,curp,nss,rfc_emisor].filter(Boolean),cfdi_uuid:uuid,neto,percepciones,deducciones,otros_pagos:otros,
   periodo_inicio:att(nom,'FechaInicialPago'),periodo_fin:att(nom,'FechaFinalPago'),fecha_pago:att(nom,'FechaPago'),concepto:clasificarPercepciones(ps),evidencia_neto:'Total XML: '+neto.toFixed(2),evidencia_timbrado:'Folio fiscal: '+uuid+' | Sello Digital del SAT: '+sello};
 }
 function fecha(d,m,y){const mo=/^\d+$/.test(m)?Number(m):meses[m.slice(0,3).toUpperCase()];let yy=Number(y);if(yy<100)yy+=2000;const dt=new Date(Date.UTC(yy,mo-1,Number(d)));return dt.getUTCFullYear()===yy&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===Number(d)?dt.toISOString().slice(0,10):null;}
 function parsear(text){
  const t=String(text||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim(),importe='([0-9]+(?:,[0-9]{3})*\\.[0-9]{2})(?![0-9])';
  const capturar=rx=>{const m=t.match(rx);return m?Number(m[1].replace(/,/g,'')):null;};
  const netos=[...t.matchAll(new RegExp('Neto\\s+pagado\\s*:?\\s*\\$?\\s*'+importe,'gi'))];
  const neto=netos.length===1?Number(netos[0][1].replace(/,/g,'')):null;
  const percepciones=capturar(new RegExp('Total\\s+(?:de\\s+)?percepciones\\s*:?\\s*\\$?\\s*'+importe,'i'));
  let otros=capturar(new RegExp('Total\\s+(?:de\\s+)?otros\\s+pagos\\s*:?\\s*\\$?\\s*'+importe,'i'));
  // En algunos NOI, PDF.js entrega la columna «Otros pagos» después del total.
  // Rescatar sólo ese diseño literal completo; nunca obtenerlo por diferencia.
  const desplazados=[...t.matchAll(new RegExp('Total\\s+(?:de\\s+)?otros\\s+pagos\\s*:\\s*ISR\\s+retenido\\s*:\\s*\\$?\\s*'+importe+'\\s+Total\\s*:\\s*\\$?\\s*'+importe+'\\s+\\$?\\s*'+importe+'\\s*\\+\\s*-\\s*=','gi'))];
  const desplazado=desplazados.length===1?desplazados[0]:null;
  if(otros==null&&desplazado)otros=Number(desplazado[3].replace(/,/g,''));
  let deducciones=capturar(new RegExp('Total\\s+(?:de\\s+)?deducciones\\s*:?\\s*\\$?\\s*'+importe,'i'));
  const sinISR=capturar(new RegExp('Total\\s+(?:de\\s+)?deducciones\\s+sin\\s+ISR\\s*:?\\s*\\$?\\s*'+importe,'i'));
  const isr=capturar(new RegExp('ISR\\s+retenido\\s*:?\\s*\\$?\\s*'+importe,'i'));
  // NOI imprime deducciones sin ISR en el resumen fiscal. Nunca tratarlas como total.
  if(deducciones==null&&sinISR!=null&&isr!=null)deducciones=(Math.round(sinISR*100)+Math.round(isr*100))/100;
  const errores=[];
  if(desplazados.length>1)errores.push('Hay más de un resumen de otros pagos; revisa el recibo individual');
  if(/Total\s+(?:de\s+)?otros\s+pagos/i.test(t)&&otros==null)errores.push('No se pudo asociar el importe literal de otros pagos');
  if(desplazado&&isr!=null&&Number(desplazado[1].replace(/,/g,''))!==isr)errores.push('El ISR del resumen desplazado se contradice');
  if(desplazado&&neto!=null&&Number(desplazado[2].replace(/,/g,''))!==neto)errores.push('El neto pagado no coincide con el total fiscal impreso');
  if(deducciones!=null&&sinISR!=null&&isr!=null&&Math.round(deducciones*100)!==Math.round(sinISR*100)+Math.round(isr*100))errores.push('Los dos desgloses de deducciones se contradicen');
  if(neto!=null&&percepciones!=null&&deducciones!=null&&Math.round(percepciones*100)+Math.round((otros||0)*100)-Math.round(deducciones*100)!==Math.round(neto*100))errores.push('Percepciones, otros pagos y deducciones no cuadran con el neto');
  const dt='(\\d{1,2})[ /-]+([A-Za-zÁÉÍÓÚáéíóú]{3,10}\\.?|\\d{1,2})[ /-]+(\\d{2,4})';
  const per=t.match(new RegExp('(?:Del\\s+|Per[ií]odo\\s*(?:del)?\\s*:?\\s*)?'+dt+'\\s+(?:al|a|hasta)\\s+'+dt,'i'));
  const iso=t.match(/(\d{4}-\d{2}-\d{2})\s+(?:al|a|hasta)\s+(\d{4}-\d{2}-\d{2})/i);
  const desde=per?fecha(per[1],per[2].replace('.',''),per[3]):iso?.[1]||null,hasta=per?fecha(per[4],per[5].replace('.',''),per[6]):iso?.[2]||null;
  const ids=[...new Set((t.toUpperCase().match(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b|\b[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b|\b\d{11}\b/g)||[]))];
  const concepto=clasificarTexto(t),tipo=concepto.tipo;
  const folio=t.match(/(?:Folio\s+fiscal(?:\s*\(?UUID\)?)?|UUID)\s*:?\s*([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\b/i);
  // pdf.js puede separar la etiqueta de su valor en el orden de extracción.
  // Sólo rescatar el folio si existe la etiqueta y hay UN único UUID distinto.
  const uuids=[...new Set((t.match(/\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/gi)||[]).map(x=>x.toUpperCase()))];
  const uuid=uuids.length===1&&/(?:Folio\s+fiscal|UUID)/i.test(t)?uuids[0]:null;
  const bloque=t.match(/Sello\s+digital\s+(?:del\s+)?SAT\s*:?\s*([\s\S]*?)(?=Cadena\s+Original|Este\s+documento|$)/i);
  const compacto=bloque?bloque[1].replace(/\s/g,''):'';
  const sello=/^[a-zA-Z0-9+/=]{40,4096}$/.test(compacto)?'Sello Digital del SAT: '+compacto:null;
  const emisor=ids.find(x=>/^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/.test(x))||null;
  return {neto,tipo,errores,datos:{recibos:netos.length,nombre:null,numero:null,rfc:null,curp:null,nss:null,rfc_emisor:emisor,identificadores:ids,periodo_inicio:desde,periodo_fin:hasta,percepciones,deducciones,otros_pagos:otros||0,neto,evidencia_neto:netos[0]?.[0]||'',
    concepto,cfdi_uuid:uuid&&sello?uuid:null,evidencia_timbrado:uuid&&sello?(folio?.[0]||'Folio fiscal: '+uuid)+' | '+sello:null}};
 }
 root.PLATINUM_RESPALDO_RECIBO=Object.freeze({parsear,clasificarPercepciones,clasificarTexto,extraerXML});
})(window);
