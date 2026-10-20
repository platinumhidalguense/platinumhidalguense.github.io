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
  const deducciones=capturar(new RegExp('Total\\s+(?:de\\s+)?deducciones\\s*:?\\s*\\$?\\s*'+importe,'i'));
  const dt='(\\d{1,2})[ /-]+([A-Za-zÁÉÍÓÚáéíóú]{3,10}\\.?|\\d{1,2})[ /-]+(\\d{2,4})';
  const per=t.match(new RegExp('(?:Del\\s+|Per[ií]odo\\s*(?:del)?\\s*:?\\s*)?'+dt+'\\s+(?:al|a|hasta)\\s+'+dt,'i'));
  const iso=t.match(/(\d{4}-\d{2}-\d{2})\s+(?:al|a|hasta)\s+(\d{4}-\d{2}-\d{2})/i);
  const desde=per?fecha(per[1],per[2].replace('.',''),per[3]):iso?.[1]||null,hasta=per?fecha(per[4],per[5].replace('.',''),per[6]):iso?.[2]||null;
  const ids=[...new Set((t.toUpperCase().match(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b|\b[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b|\b\d{11}\b/g)||[]))];
  const tipo=/\b(?:FINIQUITO|LIQUIDACI[ÓO]N)\b/i.test(t)?'FINIQUITO':null;
  return {neto,tipo,datos:{recibos:netos.length,nombre:null,numero:null,rfc:null,curp:null,nss:null,identificadores:ids,periodo_inicio:desde,periodo_fin:hasta,percepciones,deducciones,neto,evidencia_neto:netos[0]?.[0]||''}};
 }
 root.PLATINUM_RESPALDO_RECIBO=Object.freeze({parsear});
})(window);
