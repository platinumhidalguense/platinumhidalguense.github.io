/* Contratos puros del Conciliador. No contiene fórmulas de nómina ni transporte Gemini. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_CONCILIADOR_CORE=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const normal=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
 const nombre=s=>normal(s).replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 const moneyPattern='(?:\\d{1,3}(?:[, \\u00a0\\u202f]\\d{3})+|\\d+)\\.\\d{2}';
 function centavos(v){if(typeof v==='number'){if(!Number.isFinite(v)||v<0||Math.abs(v*100-Math.round(v*100))>1e-7)throw Error('Importe inválido o con más de dos decimales');return Math.round(v*100);}const s=String(v??'').trim().replace(/^\$\s*/,'').replace(/\s*(?:MXN|MXP)$/i,'');if(!new RegExp('^'+moneyPattern+'$').test(s))throw Error('Formato monetario ambiguo');const n=Number(s.replace(/[, \u00a0\u202f]/g,''))*100;if(!Number.isSafeInteger(Math.round(n)))throw Error('Importe fuera de rango');return Math.round(n);}
 const fecha=(y,m,d)=>{const f=new Date(Date.UTC(+y,+m-1,+d));return f.getUTCFullYear()===+y&&f.getUTCMonth()===+m-1&&f.getUTCDate()===+d?f.toISOString().slice(0,10):null;};
 const meses={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
 function fechaTexto(s){const n=normal(s),m=n.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);if(m)return fecha(m[3],m[2],m[1]);const p=n.match(/\b(\d{1,2})\s+(?:DE\s+)?([A-Z]{3,10})\.?\s+(?:DE\s+)?(\d{4})\b/);return p&&meses[p[2].slice(0,3)]?fecha(p[3],meses[p[2].slice(0,3)],p[1]):null;}
 const estado=s=>/RECHAZ|DEVUEL|CANCEL|FALLID|NO APLICAD|NO PROCESAD/.test(normal(s))?'RECHAZADO':/EXITOS|APLICAD|REALIZAD[AO].*EXITO|OPERACION.*EXITOSA/.test(normal(s))?'EXITOSO':'PENDIENTE';
 const cuenta=s=>String(s??'').replace(/\D/g,''),nomWorker=w=>[w.nombres,w.primer_apellido,w.segundo_apellido].filter(Boolean).join(' ')||w.nombre||'';
 function asociar(r,personas){
  const mask=cuenta(r.cuenta||r.mask),n=nombre(r.titular),pool=[...new Map((personas||[]).map(w=>[w.id,w])).values()];
  const porNombre=pool.filter(w=>{const a=nombre(nomWorker(w));return a&&n&&(a.split(' ').sort().join(' ')===n.split(' ').sort().join(' ')||a.replace(/ /g,'')===n.replace(/ /g,''));});
  const porCuenta=mask.length>=4?pool.filter(w=>[w.cuenta,w.clabe].some(c=>{const d=cuenta(c);return d.length>=mask.length&&d.endsWith(mask);})):[];
  const inter=porNombre.filter(w=>porCuenta.some(x=>x.id===w.id));
  if(inter.length===1)return{estado:'COINCIDE',trabajador_id:inter[0].id,metodo:'NOMBRE_Y_CUENTA'};
  if(porNombre.length===1&&!mask)return{estado:'REVISAR_CUENTA',trabajador_id:porNombre[0].id,metodo:'NOMBRE_UNICO'};
  if(porNombre.length===1&&!porCuenta.length)return{estado:mask?'CUENTA_NO_DOCUMENTADA':'REVISAR_CUENTA',trabajador_id:porNombre[0].id,metodo:'NOMBRE_UNICO'};
  if(porNombre.length&&porCuenta.length&&!inter.length)return{estado:'IDENTIDAD_CONTRADICTORIA',trabajador_id:null,metodo:null};
  if(porCuenta.length===1&&!porNombre.length)return{estado:'REVISAR_NOMBRE',trabajador_id:porCuenta[0].id,metodo:'CUENTA_UNICA'};
  return{estado:porNombre.length>1||porCuenta.length>1?'AMBIGUO':'SIN_ASOCIAR',trabajador_id:null,metodo:null};
 }
 function revisarBanco(data,texto=''){
  const errores=[],rows=Array.isArray(data?.records)?data.records:[];let total=0;
  rows.forEach((r,i)=>{try{const n=centavos(r.importe);if(n<=0)throw Error('Importe no positivo');total+=n;if(!r.fecha||!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)||!fecha(...r.fecha.split('-')))throw Error('Fecha no válida');if(!r.titular||nombre(r.titular).length<3)throw Error('Titular incompleto');if(r.estado!=='EXITOSO'&&r.estado!=='RECHAZADO'&&r.estado!=='PENDIENTE')throw Error('Estado no reconocido');}catch(e){errores.push('Fila '+(i+1)+': '+e.message);}});
  if(!rows.length)errores.push('No se reconocieron operaciones individuales');
  if(data?.esperados!=null&&Number(data.esperados)!==rows.length)errores.push('El número de operaciones no coincide con el encabezado');
  if(data?.totalEsperado!=null){try{if(centavos(data.totalEsperado)!==total)errores.push('La suma de operaciones no coincide al centavo con el encabezado');}catch(e){errores.push(e.message);}}
  if(/\b(?:USD|EUR)\b/.test(normal(texto)))errores.push('Hay otra moneda: requiere revisión');
  return{ok:!errores.length,errores,totalCentavos:total,operaciones:rows.length};
 }
 function leerTradicional(texto,legacy={}){
  const raw=String(texto||''),t=raw.replace(/\s+/g,' ').trim(),n=normal(t),global=/RESUMEN GENERAL|NUMERO DE REGISTROS|GRUPO DE PAGO|TOTAL DE OPERACIONES/.test(n);
  const header=t.match(/(?:N[uú]mero de registros|Total de operaciones)\s*:?\s*(\d+)/i),importeTotal=t.match(new RegExp('Importe total\\s*:?\\s*\\$?\\s*('+moneyPattern+')','i'));
  const folio=(t.match(/Folio\s*(?:de lote|de firma|[uú]nico|interbancario)?\s*:\s*([A-Z0-9-]{6,})/i)||t.match(/\b([0-9A-F]{32})\b/i)||[])[1]||'';
  const est='EXITOS[OA]|RECHAZAD[OA]|DEVUELT[OA]|CANCELAD[OA]|PENDIENTE|EN\\s+PROCESO';
  const records=[];let m;
  const rx=new RegExp('(\\d{1,2}[/-]\\d{1,2}[/-]\\d{4}|\\d{1,2}\\s+[A-ZÁÉÍÓÚ]{3,10}\\.?\\s+\\d{4})\\s+[•*·∙●xX-]*\\s*(\\d{4,18})\\s+(.{3,160}?)\\s+(?:[-–—]\\s*)?('+est+')\\s+\\$?\\s*('+moneyPattern+')\\s*MX[NP]','gi');
  while((m=rx.exec(t))){const titular=m[3].replace(/\s*[-–—]\s*$/,'').trim();if(/\d{3,}|\bMX[NP]\b/.test(titular))continue;records.push({titular,cuenta:m[2].length>6?m[2]:'',mask:m[2].slice(-4),fecha:fechaTexto(m[1]),estado:estado(m[4]),importe:centavos(m[5])/100,banco:'BBVA',folio,descripcion:'PAGO GLOBAL',evidencia_importe:m[5],evidencia_identidad:m[2]+' '+titular});}
  if(global){
   let chosen=records;const old=legacy.global?.(raw);if(old?.records?.length>chosen.length)chosen=old.records.map(r=>({...r,fecha:fecha(r.year,r.mes+1,r.day),cuenta:'',folio:old.folio||folio,banco:'BBVA',evidencia_importe:String(r.importe)}));
   const result={tipo:'GLOBAL',records:chosen,esperados:header?Number(header[1]):old?.esperados??null,totalEsperado:importeTotal?centavos(importeTotal[1])/100:old?.totalEsperado??null,folio:old?.folio||folio,descripcion:old?.descripcion||'PAGO GLOBAL'};return{...result,validacion:revisarBanco(result,raw)};
  }
  // Un importe de comisión/IVA/saldo nunca sustituye al importe de transferencia.
  const amounts=[...t.matchAll(new RegExp('(?:Importe(?:\\s+de\\s+(?:la\\s+)?(?:operaci[oó]n|transferencia|pago))?|Monto(?:\\s+(?:a transferir|de la operaci[oó]n))?|Cantidad)\\s*:?\\s*\\$?\\s*('+moneyPattern+')(?:\\s*MX[NP])?','gi'))];
  const values=[...new Set(amounts.map(x=>centavos(x[1])))];let individual=null;
  if(values.length===1){
   const titular=(t.match(/(?:Titular de la cuenta|Nombre del beneficiario|Beneficiario|Nombre destinatario)\s*:\s*(.{3,140}?)\s+(?:Nombre banco destino|Banco|Cuenta|CLABE|Fecha|Concepto|Referencia|Importe|Monto|RFC)\s*:?/i)||[])[1];
   const c=(t.match(/(?:Cuenta de dep\s*[oó]?\s*sito|Cuenta destino|CLABE(?: de dep[oó]sito)?|Cuenta del beneficiario)\s*:\s*([\dxX*• ·-]{4,40})/i)||[])[1]||'';
   const f=(t.match(/Fecha de (?:aplica\s*ci\s*[oó]?\s*n|crea\s*ci\s*[oó]?\s*n|operaci[oó]n)\s*:\s*(.{8,30})/i)||[])[1]||t;
   const old=legacy.individual?.(raw),nom=(titular||old?.titular||'').trim(),bank=(t.match(/Nombre banco destino\s*:\s*(.{2,40}?)\s+(?:Fecha|Concepto|Referencia)/i)||[])[1]||old?.banco||'BBVA';
   individual={titular:nom==='(sin nombre)'?'':nom,cuenta:cuenta(c)||old?.cuenta||'',mask:cuenta(c).slice(-4)||old?.mask||'',fecha:fechaTexto(f)||old?.fecha||null,importe:values[0]/100,estado:estado(t.replace(/\b(?:Exitosas?|Rechazadas?|Devueltas?|Canceladas?)\s*:?\s*\d+/gi,'')),banco:bank,folio,descripcion:'PAGO INDIVIDUAL',evidencia_importe:amounts[0][0]};
  }
  const result={tipo:'INDIVIDUAL',records:individual?[individual]:[],esperados:1,totalEsperado:null,folio};const validacion=revisarBanco(result,raw);if(values.length>1)validacion.errores.push('Varios importes de operación contradictorios');validacion.ok=!validacion.errores.length;return{...result,validacion};
 }
 function validarIA(j,texto=''){
  const rows=Array.isArray(j?.registros)?j.registros:[],records=rows.map(r=>({titular:r.titular||'',cuenta:String(r.cuenta||''),mask:String(r.cuenta||'').replace(/\D/g,'').slice(-4),importe:r.importe,estado:estado(r.estado||''),fecha:r.fecha||null,banco:r.banco||'BBVA',folio:r.folio||j.folio||'',descripcion:r.descripcion||'',evidencia_importe:r.evidencia_importe||'',porIA:true}));
  const result={tipo:j?.tipo_documento==='GLOBAL'?'GLOBAL':'INDIVIDUAL',records,esperados:j?.esperados??null,totalEsperado:j?.total_esperado??null,folio:j?.folio||''},v=revisarBanco(result,texto);
  for(let i=0;i<records.length;i++){const r=records[i];if(!r.evidencia_importe||texto&&!normal(texto).includes(normal(r.evidencia_importe)))v.errores.push('Fila '+(i+1)+': importe sin evidencia literal comprobable');}
  v.ok=!v.errores.length;return{...result,validacion:v};
 }
 async function leerDual(texto,legacy,ia,forzar=false){const p=leerTradicional(texto,legacy);if(!forzar&&p.validacion.ok)return{...p,lector:'TRADICIONAL'};const j=await ia();if(!j?.ok)throw Error(j?.error||'Gemini no completó la lectura. El original sigue pendiente.');return{...validarIA(j,texto),lector:'GEMINI_PROPUESTA'};}
 function conciliarPrevision({fiscal,prevision,pagado}){if(fiscal==null||prevision==null||pagado==null)return{estado:'FUENTE_INCOMPLETA',diferencia:null};const esperado=centavos(fiscal)+centavos(prevision),diferencia=centavos(pagado)-esperado;return{estado:diferencia===0?'COINCIDE':diferencia<0?'PAGO_PARCIAL':'EXCEDENTE',esperado:esperado/100,diferencia:diferencia/100};}
 return Object.freeze({centavos,fechaTexto,asociar,leerTradicional,revisarBanco,validarIA,leerDual,conciliarPrevision});
});
