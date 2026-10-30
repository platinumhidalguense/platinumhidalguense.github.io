/* Lectura determinista de evidencia: sin fórmulas de nómina ni escrituras. */
(function(root){
 'use strict';
 const meses={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
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
  const tipo=/\b(?:FINIQUITO|LIQUIDACI[ÓO]N)\b/i.test(t)?'FINIQUITO':null;
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
    cfdi_uuid:uuid&&sello?uuid:null,evidencia_timbrado:uuid&&sello?(folio?.[0]||'Folio fiscal: '+uuid)+' | '+sello:null}};
 }
 root.PLATINUM_RESPALDO_RECIBO=Object.freeze({parsear});
})(window);
