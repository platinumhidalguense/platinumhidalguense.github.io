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
  // Cuenta destino fuera de la ficha pero usada en pagos ya registrados de la misma persona: compatible, con aviso visible.
  if(porNombre.length===1&&!porCuenta.length&&mask.length>=4&&(porNombre[0].mascaras_pago||[]).map(cuenta).some(m=>m.length>=4&&m.slice(-4)===mask.slice(-4)))
   return{estado:'COINCIDE',trabajador_id:porNombre[0].id,metodo:'NOMBRE_Y_CUENTA_HISTORIAL',aviso:'La cuenta destino no está en la ficha; coincide con pagos anteriores registrados de la misma persona.'};
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
 /* Lector por roles (comprobante individual): cada etiqueta delimita su valor hasta la siguiente etiqueta o
    encabezado de sección, de modo que «Titular de la cuenta» nunca absorbe la etiqueta siguiente. En formatos de
    dos columnas (cuenta de retiro | cuenta de depósito) los titulares siguen el orden de sus cuentas: el primero
    es el ordenante y el segundo el beneficiario. La empresa ordenante nunca se usa como beneficiario. */
 const LECTOR_VERSION='BANCO_ROLES_V2';
 const ETIQUETAS=['Titular de la cuenta','Nombre del beneficiario','Beneficiario','Nombre del ordenante','Ordenante','Nombre banco destino','Banco destino',
  'Cuenta de retiro','Cuenta de cargo','Cuenta origen','Cuenta de origen','Cuenta de dep[oó]sito','Cuenta destino','Cuenta del beneficiario','CLABE(?: de dep[oó]sito)?','Divisa de la cuenta',
  'Fecha de creaci[oó]n','Fecha de aplicaci[oó]n','Fecha de operaci[oó]n','Concepto de pago','Referencia num[eé]rica','Instrumento de seguridad','Hora de captura en el canal',
  'Folio interbancario','Clave de rastreo','Folio de firma','Folio [uú]nico','Porcentaje Firmado','Estado','Estatus','Importe de la operaci[oó]n','Tipo de operaci[oó]n','Descripci[oó]n','Usuario','Poder','RFC',
  'Nombre del destinatario','Nombre destinatario','Banco','Importe(?: de la transferencia| del pago)?','Monto(?: a transferir| de la operaci[oó]n)?','Cantidad','Folio(?: de lote)?','Referencia','Concepto','Fecha'];
 const ENCABEZADOS=['Datos de confirmaci[oó]n de la transferencia','Estado operaci[oó]n','Detalle de firmas','Datos de la operaci[oó]n','Datos del firmante','BBVA Net Cash','BBVA M[eé]xico','Operaci[oó]n autorizada'];
 // Etiquetas que algunos formatos imprimen sin dos puntos (encabezado del contrato).
 const SIN_DOS_PUNTOS=['Nombre del Cliente','Contrato','Fecha y hora de consulta'];
 const RX_ETIQ=new RegExp('(?:^|\\s)(?:('+ETIQUETAS.join('|')+')\\s*:|('+SIN_DOS_PUNTOS.join('|')+')(?=\\s)\\s*:?|('+ENCABEZADOS.join('|')+')(?=\\s))','gi');
 const clave=s=>normal(s).replace(/[^A-Z ]/g,'').replace(/\s+/g,' ').trim();
 function campos(t){
  const marcas=[];let m;RX_ETIQ.lastIndex=0;
  while((m=RX_ETIQ.exec(t)))marcas.push({etiqueta:m[1]||m[2]?clave(m[1]||m[2]):null,inicio:m.index+(m[0].length-m[0].trimStart().length),fin:RX_ETIQ.lastIndex});
  return marcas.map((x,i)=>x.etiqueta&&{etiqueta:x.etiqueta,valor:t.slice(x.fin,i+1<marcas.length?marcas[i+1].inicio:t.length).trim(),fragmento:t.slice(x.inicio,i+1<marcas.length?marcas[i+1].inicio:t.length).trim(),indice:x.inicio}).filter(Boolean);
 }
 const ESTADO_OK=/OPERAD|LIQUIDAD|APLICAD|EXITOS|PAGAD|ABONAD|COMPLETAD|DEPOSITAD/,ESTADO_NO=/RECHAZ|DEVUEL|CANCEL|FALLID|NO APLICAD|NO PROCESAD/;
 const estadoCampo=v=>ESTADO_NO.test(normal(v))?'RECHAZADO':ESTADO_OK.test(normal(v))?'EXITOSO':'PENDIENTE';
 const mismoNombre=(a,b)=>!!a&&!!b&&nombre(a).replace(/ /g,'')===nombre(b).replace(/ /g,'');
 function rolesIndividual(t){
  const cs=campos(t),de=(...ks)=>cs.filter(c=>ks.includes(c.etiqueta)),uno=(...ks)=>{for(const k of ks){const c=cs.find(x=>x.etiqueta===k);if(c)return c;}return null;};
  const cliente=uno('NOMBRE DEL CLIENTE'),titulares=de('TITULAR DE LA CUENTA');
  const retiro=uno('CUENTA DE RETIRO','CUENTA DE CARGO','CUENTA ORIGEN','CUENTA DE ORIGEN'),deposito=uno('CUENTA DE DEPOSITO','CUENTA DESTINO','CUENTA DEL BENEFICIARIO','CLABE','CLABE DE DEPOSITO');
  let ben=uno('NOMBRE DEL BENEFICIARIO','BENEFICIARIO'),ord=uno('NOMBRE DEL ORDENANTE','ORDENANTE');
  if(titulares.length>=2&&retiro&&deposito){const [a,b]=retiro.indice<deposito.indice?[titulares[0],titulares[1]]:[titulares[1],titulares[0]];ord=ord||a;ben=ben||b;}
  else if(titulares.length===1){const x=titulares[0];if(mismoNombre(x.valor,cliente?.valor)||retiro&&!deposito)ord=ord||x;else if(!ben)ben=x;}
  if(!ord&&cliente)ord=cliente;
  if(ben&&ord&&mismoNombre(ben.valor,ord.valor))ben=null;
  if(ben&&cliente&&mismoNombre(ben.valor,cliente.valor))ben=null;
  const fecha=uno('FECHA DE APLICACION','FECHA DE OPERACION','FECHA DE CREACION'),estados=de('ESTADO','ESTATUS'),est=estados[estados.length-1]||null;
  const rastreo=uno('CLAVE DE RASTREO'),folioInter=uno('FOLIO INTERBANCARIO'),banco=uno('NOMBRE BANCO DESTINO','BANCO DESTINO');
  const num=v=>cuenta(v).slice(0,20);
  return{beneficiario:ben?.valor||'',ordenante:ord?.valor||'',cuenta_destino:deposito?num(deposito.valor):'',cuenta_origen:retiro?num(retiro.valor):'',
   fecha:fecha?fechaTexto(fecha.valor):null,estado:est?estadoCampo(est.valor):null,rastreo:rastreo?rastreo.valor.replace(/\s+/g,''):'',folio_interbancario:folioInter?folioInter.valor.replace(/\s+/g,''):'',
   banco:banco?.valor||'',evidencia:{beneficiario:ben?.fragmento||null,ordenante:ord?.fragmento||null,cuenta_destino:deposito?.fragmento||null,cuenta_origen:retiro?.fragmento||null,
    fecha:fecha?.fragmento||null,estado:est?.fragmento||null,referencia:(rastreo||folioInter)?.fragmento||null}};
 }
 function leerTradicional(texto,legacy={}){
  const raw=String(texto||''),t=raw.replace(/\s+/g,' ').trim(),n=normal(t),global=/RESUMEN GENERAL|NUMERO DE REGISTROS|GRUPO DE PAGO|TOTAL DE OPERACIONES/.test(n);
  const header=t.match(/(?:N[uú]mero de registros|Total de operaciones)\s*:?\s*(\d+)/i),importeTotal=t.match(new RegExp('Importe total\\s*:?\\s*\\$?\\s*('+moneyPattern+')','i'));
  const folio=(t.match(/Folio\s*(?:de lote|de firma|[uú]nico|interbancario)?\s*:\s*([A-Z0-9-]{6,})/i)||t.match(/\b([0-9A-F]{32})\b/i)||[])[1]||'';
  const est='EXITOS[OA]|RECHAZAD[OA]|DEVUELT[OA]|CANCELAD[OA]|PENDIENTE|EN\\s+PROCESO';
  const records=[];let m;
  const rx=new RegExp('(\\d{1,2}[/-]\\d{1,2}[/-]\\d{4}|\\d{1,2}\\s+[A-ZÁÉÍÓÚ]{3,10}\\.?\\s+\\d{4})\\s+[•*·∙●xX-]*\\s*(\\d{4,18})\\s+(.{3,160}?)\\s+(?:[-–—]\\s*)?('+est+')\\s+\\$?\\s*('+moneyPattern+')\\s*MX[NP]','gi');
  while((m=rx.exec(t))){const titular=m[3].replace(/\s*[-–—]\s*$/,'').trim();if(/\d{3,}|\bMX[NP]\b/.test(titular))continue;records.push({titular,cuenta:m[2].length>6?m[2]:'',mask:m[2].slice(-4),fecha:fechaTexto(m[1]),estado:estado(m[4]),importe:centavos(m[5])/100,banco:'BBVA',folio,descripcion:'PAGO GLOBAL',evidencia_importe:m[5],evidencia_identidad:m[2]+' '+titular,beneficiario:titular,evidencia:{beneficiario:m[0].trim(),importe:m[5]},lector_version:LECTOR_VERSION});}
  if(global){
   let chosen=records;const old=legacy.global?.(raw);if(old?.records?.length>chosen.length)chosen=old.records.map(r=>({...r,fecha:fecha(r.year,r.mes+1,r.day),cuenta:'',folio:old.folio||folio,banco:'BBVA',evidencia_importe:String(r.importe)}));
   const result={tipo:'GLOBAL',records:chosen,esperados:header?Number(header[1]):old?.esperados??null,totalEsperado:importeTotal?centavos(importeTotal[1])/100:old?.totalEsperado??null,folio:old?.folio||folio,descripcion:old?.descripcion||'PAGO GLOBAL'};return{...result,validacion:revisarBanco(result,raw)};
  }
  // Un importe de comisión/IVA/saldo nunca sustituye al importe de transferencia.
  const amounts=[...t.matchAll(new RegExp('(?:Importe(?:\\s+de\\s+(?:la\\s+)?(?:operaci[oó]n|transferencia|pago))?|Monto(?:\\s+(?:a transferir|de la operaci[oó]n))?|Cantidad)\\s*:?\\s*\\$?\\s*('+moneyPattern+')(?:\\s*MX[NP])?','gi'))];
  const values=[...new Set(amounts.map(x=>centavos(x[1])))];let individual=null;
  if(values.length===1){
   const r=rolesIndividual(t),f=(t.match(/Fecha de (?:aplica\s*ci\s*[oó]?\s*n|crea\s*ci\s*[oó]?\s*n|operaci[oó]n)\s*:\s*(.{8,30})/i)||[])[1]||t;
   const old=legacy.individual?.(raw),viejo=(old?.titular||'').trim();
   // El lector heredado sólo completa el beneficiario si no es el ordenante ni el cliente del contrato.
   const nom=(r.beneficiario||(viejo&&viejo!=='(sin nombre)'&&!mismoNombre(viejo,r.ordenante)?viejo:'')).trim();
   const c=r.cuenta_destino||(nom===r.beneficiario?'':cuenta(old?.cuenta||''));
   individual={titular:nom,beneficiario:nom,ordenante:r.ordenante,cuenta:c,cuenta_origen:r.cuenta_origen,mask:c.slice(-4)||(nom===r.beneficiario?'':old?.mask||''),
    fecha:r.fecha||fechaTexto(f)||old?.fecha||null,importe:values[0]/100,
    estado:r.estado||estado(t.replace(/\b(?:Exitosas?|Rechazadas?|Devueltas?|Canceladas?)\s*:?\s*\d+/gi,'')),banco:r.banco||old?.banco||'BBVA',folio,rastreo:r.rastreo,
    descripcion:'PAGO INDIVIDUAL',evidencia_importe:amounts[0][0],evidencia:{...r.evidencia,importe:amounts[0][0]},lector_version:LECTOR_VERSION};
  }
  const result={tipo:'INDIVIDUAL',records:individual?[individual]:[],esperados:1,totalEsperado:null,folio};const validacion=revisarBanco(result,raw);if(values.length>1)validacion.errores.push('Varios importes de operación contradictorios');validacion.ok=!validacion.errores.length;return{...result,validacion};
 }
 function validarIA(j,texto=''){
  const rows=Array.isArray(j?.registros)?j.registros:[],records=rows.map(r=>({titular:r.titular||'',cuenta:String(r.cuenta||''),mask:String(r.cuenta||'').replace(/\D/g,'').slice(-4),importe:r.importe,estado:estado(r.estado||''),fecha:r.fecha||null,banco:r.banco||'BBVA',folio:r.folio||j.folio||'',descripcion:r.descripcion||'',evidencia_importe:r.evidencia_importe||'',porIA:true}));
  const result={tipo:j?.tipo_documento==='GLOBAL'?'GLOBAL':'INDIVIDUAL',records,esperados:j?.esperados??null,totalEsperado:j?.total_esperado??null,folio:j?.folio||''},v=revisarBanco(result,texto);
  const cli=texto?campos(String(texto).replace(/\s+/g,' ')).find(c=>c.etiqueta==='NOMBRE DEL CLIENTE'):null;
  for(let i=0;i<records.length;i++){const r=records[i];if(!r.evidencia_importe||texto&&!normal(texto).includes(normal(r.evidencia_importe)))v.errores.push('Fila '+(i+1)+': importe sin evidencia literal comprobable');
   if(cli&&mismoNombre(r.titular,cli.valor))v.errores.push('Fila '+(i+1)+': el titular leído es el ordenante (cliente del contrato), no el beneficiario');}
  v.ok=!v.errores.length;return{...result,validacion:v};
 }
 async function leerDual(texto,legacy,ia,forzar=false){const p=leerTradicional(texto,legacy);if(!forzar&&p.validacion.ok)return{...p,lector:'TRADICIONAL'};const j=await ia();if(!j?.ok)throw Error(j?.error||'Gemini no completó la lectura. El original sigue pendiente.');return{...validarIA(j,texto),lector:'GEMINI_PROPUESTA'};}
 function conciliarPrevision({fiscal,prevision,pagado}){if(fiscal==null||prevision==null||pagado==null)return{estado:'FUENTE_INCOMPLETA',diferencia:null};const esperado=centavos(fiscal)+centavos(prevision),diferencia=centavos(pagado)-esperado;return{estado:diferencia===0?'COINCIDE':diferencia<0?'PAGO_PARCIAL':'EXCEDENTE',esperado:esperado/100,diferencia:diferencia/100};}
 return Object.freeze({LECTOR_VERSION,centavos,fechaTexto,asociar,rolesIndividual,leerTradicional,revisarBanco,validarIA,leerDual,conciliarPrevision});
});
