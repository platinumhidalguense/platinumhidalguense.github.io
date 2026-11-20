/* Adaptador del lector tradicional. Conserva evidencia por página y campo. */
(function(root){
 'use strict';
 const rfc='[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}', curp='[A-ZÑ]{4}\\d{6}[HM][A-Z]{5}[A-Z0-9]\\d';
 const folio='[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}';
 const campos={
  rfc_emisor:{etiqueta:/\bRFC\s+(?:DEL\s+)?EMISOR\b/i,valor:new RegExp('^'+rfc+'$','i')},
  rfc:{etiqueta:/\bRFC\s+(?:DEL\s+)?(?:RECEPTOR|TRABAJADOR|EMPLEADO)\b/i,valor:/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/i},
  curp:{etiqueta:/\bCURP\b/i,valor:new RegExp('^'+curp+'$','i')},
  nss:{etiqueta:/\b(?:NSS|REGISTRO\s+IM\s*SS|R\s*\.?\s*IM\s*SS|N[ÚU]MERO\s+DE\s+SEGURIDAD\s+SOCIAL|SEGURIDAD\s+SOCIAL)\b/i,valor:/^\d{11}$/},
  cfdi_uuid:{etiqueta:/\b(?:FOLIO\s+FISCAL|UUID)\b/i,valor:new RegExp('^'+folio+'$','i')},
  neto:{etiqueta:/\bNETO\s+PAGADO\b/i,valor:/^\d+(?:,\d{3})*\.\d{2}$/},
  periodo:{etiqueta:/\b(?:PER[IÍ]ODO|DEL)\s+(?=\d)/i,valor:/^.{1,85}$/}
 };
 const sinAcento=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const visible=s=>String(s||'').replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff\u00ad]/g,'').replace(/[\u00a0\u202f]/g,' ');
 const etiquetar=s=>visible(s).replace(/\bR\s*\.?\s*F\s*\.?\s*C\s*\.?(?=\s|:|$)/gi,'RFC').replace(/\bC\s*\.?\s*U\s*\.?\s*R\s*\.?\s*P\s*\.?(?=\s|:|$)/gi,'CURP');
 const limpio=s=>String(s||'').trim().replace(/^[:$\s]+/,'').trim();
 const etiquetaGeneral=/\b(?:RFC|R\.F\.C\.)\s*:?/i;
 const finValor=/\s+(?:(?:R\.F\.C\.|RFC|CURP|NSS|N[ÚU]MERO DE SEGURIDAD SOCIAL|REFERENCIA|FOLIO|CUENTA|CLABE|NETO|PERCEPCIONES|DEDUCCIONES|SELLO)\b|FECHA DE|D[IÍ]AS\s+(?:TRABAJADOS|PAGADOS)|N[ÚU]M\s*ERO\s+DE\s+N[ÓO]M\s*INA|NO\.?\s*N[ÓO]M\s*INA|(?:SUELDO|SALARIO)\s+DIARIO|REGISTRO\s+PATRONAL)/i;
 function lineas(items,pagina){
  const filas=[];
  for(const item of items){
   if(!item.str?.trim())continue;
   const [, , ,alto=0,x=0,y=0]=item.transform||[];
   let fila=filas.find(f=>Math.abs(f.y-y)<2);
   if(!fila){fila={pagina,y,alto:Math.abs(alto)||10,partes:[]};filas.push(fila);}
   fila.partes.push({x,ancho:item.width||0,texto:visible(item.str).trim(),texto_original:item.str});
  }
  return filas.sort((a,b)=>b.y-a.y).map(f=>{
   const partes=f.partes.sort((a,b)=>a.x-b.x),x=partes[0].x;
   return {pagina,x,y:f.y,alto:f.alto,ancho:Math.max(...partes.map(p=>p.x+p.ancho))-x,texto:etiquetar(partes.map(p=>p.texto).join(' ')),texto_original:partes.map(p=>p.texto_original).join(' '),partes};
  });
 }
 async function paginasPDF(pdf){
  const paginas=[];
  for(let pagina=1;pagina<=pdf.numPages;pagina++){
   const datos=await(await pdf.getPage(pagina)).getTextContent();
   paginas.push({pagina,texto:datos.items.map(x=>x.str||'').join(' '),lineas:lineas(datos.items,pagina)});
  }
  return paginas;
 }
 function fragmento(fila,marca,campo){
  const inicio=marca.index,despues=inicio+marca[0].length;let valor=limpio(fila.texto.slice(despues).split(finValor)[0]);
  const partes=fila.partes||[],iEtiqueta=partes.findIndex(p=>etiquetar(p.texto).toUpperCase().includes(marca[0].toUpperCase().trim()));
  // Formatos de dos columnas (JIRE): «CURP: valor ‖ No. Nómina: 43». El valor termina
  // donde empieza, a su derecha, la siguiente parte que es una etiqueta («Texto:»).
  if(iEtiqueta>=0)for(const p of partes.slice(iEtiqueta+1)){
   const t=etiquetar(p.texto).trim();
   if(/[A-ZÁÉÍÓÚÑ]{2}/i.test(t)&&/:\s*$/.test(t)){const k=valor.indexOf(t);if(k>=0)valor=limpio(valor.slice(0,k));break;}
  }
  valor=valor.slice(0,110);
  const texto=(marca[0]+' '+valor).trim();
  const part=partes[iEtiqueta]||partes.find(p=>p.texto.toUpperCase().includes(marca[0].toUpperCase()));
  return {campo,pagina:fila.pagina,x:part?.x??fila.x,y:fila.y,ancho:fila.ancho,alto:fila.alto,etiqueta:marca[0],texto,valor,texto_original:fila.texto_original||fila.texto};
 }
 function resolverLiteral(region,literal,lector){
  const valor=limpio(literal);
  if(!valor||region.valor!==valor)throw Error('La transcripción debe aparecer literalmente en la región del original.');
  const campo=region.campo;
  if(campo==='periodo'){
   const d=lector.parsear('Período '+valor).datos;
   if(!d.periodo_inicio||!d.periodo_fin)throw Error('Transcribe ambas fechas del periodo.');
   return {periodo_inicio:d.periodo_inicio,periodo_fin:d.periodo_fin};
  }
  const v=campo==='neto'?valor.replace(/\s/g,''):visible(valor).replace(/[\s.]/g,'').toUpperCase();
  if(!campos[campo]?.valor.test(v))throw Error('El valor transcrito no tiene el formato de '+campo+'.');
  return {[campo]:campo==='neto'?Number(v.replace(/,/g,'')):v};
 }
 /* Importe de un resumen por posición: la etiqueta y su importe pueden quedar en
    renglones de PDF.js separados por pocos puntos (JIRE: «Total otros pagos:» y
    «0.00» a 3 pt). Sólo se acepta un importe único a la derecha, dentro de media
    línea de altura; si hay dos posibles, no se asocia. */
 const IMPORTE=/^\$?\s*\d+(?:,\d{3})*\.\d{2}$/;
 function importesEspaciales(filas,etiqueta){
  const hallazgos=[];
  for(const f of filas)for(const p of f.partes||[]){
   if(!etiqueta.test(sinAcento(etiquetar(p.texto)).trim()))continue;
   const tope=Math.max(f.alto||10,8)*0.6,fin=p.x+(p.ancho||0);
   const cand=filas.filter(g=>g.pagina===f.pagina&&Math.abs(g.y-f.y)<=tope).flatMap(g=>(g.partes||[]).filter(q=>q.x>=fin-1&&IMPORTE.test(q.texto)).map(q=>({g,q,d:Math.abs(g.y-f.y)})));
   if(!cand.length)continue;
   const menor=Math.min(...cand.map(c=>c.d)),cerca=cand.filter(c=>c.d===menor).sort((a,b)=>a.q.x-b.q.x);
   if(cand.filter(c=>c.d<=menor+1).length>1&&new Set(cand.filter(c=>c.d<=menor+1).map(c=>c.q.texto)).size>1){hallazgos.push({ambiguo:true});continue;}
   const {g,q}=cerca[0],valor=Number(q.texto.replace(/[$,\s]/g,''));
   hallazgos.push({valor,evidencia:{campo:'resumen',pagina:f.pagina,x:p.x,y:f.y,ancho:(q.x+(q.ancho||0))-p.x,alto:f.alto,etiqueta:p.texto,valor:q.texto,texto:p.texto+' '+q.texto,y_valor:g.y,origen:'POSICION'}});
  }
  return hallazgos;
 }
 function importeEspacial(filas,etiqueta){
  const hallazgos=importesEspaciales(filas,etiqueta);
  return hallazgos.length===1&&!hallazgos[0].ambiguo?hallazgos[0]:null;
 }
 const cent=n=>Math.round(Number(n)*100);
 function leer(paginas,lector){
  const bloques=[],paginasConNeto=paginas.filter(p=>lector.parsear(p.texto).datos.recibos===1);
  // Una página con un resumen completo es un límite verificable sólo si
  // tiene fechas y otra página tiene un UUID o receptor distinto.
  if(paginas.length>1&&paginasConNeto.length===paginas.length){
   const partes=paginas.map(p=>leer([p],lector));
   const firmas=partes.map(x=>x.datos.cfdi_uuid||[x.datos.rfc,x.datos.periodo_inicio,x.datos.periodo_fin,x.datos.neto].join('|'));
   if(partes.every(x=>x.datos.rfc&&x.datos.periodo_inicio&&x.datos.periodo_fin&&x.datos.neto!=null)&&new Set(firmas).size===partes.length)
    return {datos:{recibos:partes.length},errores:['PDF_COMBINADO'],pendientes:[],bloques:partes.map((x,i)=>({pagina:paginas[i].pagina,datos:x.datos}))};
  }
  const base=lector.parsear(paginas.map(p=>visible(p.texto)).join(' ')),datos={...base.datos},pruebas={},pendientes=[],errores=[...base.errores];
  const filas=paginas.flatMap(p=>p.lineas), candidatos={};
  // «Total otros pagos» impreso sin importe contiguo en el texto: se busca por posición.
  const SIN_OTROS='No se pudo asociar el importe literal de otros pagos';
  if(errores.includes(SIN_OTROS)){
   const r=importeEspacial(filas,/^TOTAL\s+(?:DE\s+)?OTROS\s+PAGOS\s*:?$/i);
   if(r){
    datos.otros_pagos=r.valor;pruebas.otros_pagos=[{...r.evidencia,campo:'otros_pagos'}];errores.splice(errores.indexOf(SIN_OTROS),1);
    if(datos.neto!=null&&datos.percepciones!=null&&datos.deducciones!=null&&cent(datos.percepciones)+cent(r.valor)-cent(datos.deducciones)!==cent(datos.neto))
     errores.push('Percepciones, otros pagos y deducciones no cuadran con el neto');
   }
  }
  // Comprobación adicional: cada importe impreso junto a la etiqueta (cuerpo y resumen fiscal)
  // debe coincidir con el leído; uno que contradice queda visible, nunca se corrige.
  for(const [rx,campo,nombre] of [[/^TOTAL\s+PERCEPCIONES\s*:?$/i,'percepciones','percepciones'],[/^TOTAL\s*:$/i,'neto','total']]){
   if(datos[campo]==null)continue;
   const r=importesEspaciales(filas,rx).find(h=>!h.ambiguo&&cent(h.valor)!==cent(datos[campo]));
   if(r)errores.push('El '+nombre+' del resumen fiscal impreso ('+r.evidencia.valor+') contradice el del recibo');
  }
  let rol=null,paginaAnterior=null;
  for(const f of filas){
   if(paginaAnterior!==f.pagina){rol=null;paginaAnterior=f.pagina;}
   const encabezado=sinAcento(f.texto).match(/^(?:DATOS\s+(?:DEL|DE LA)\s+)?(EMISOR|PATRON|RECEPTOR|TRABAJADOR|EMPLEADO)\b/i);
   if(encabezado)rol=/EMISOR|PATRON/i.test(encabezado[1])?'rfc_emisor':'rfc';
   const etiquetas=Object.entries(campos).flatMap(([campo,{etiqueta}])=>
    [...f.texto.matchAll(new RegExp(etiqueta.source,etiqueta.flags+'g'))].map(m=>[campo,m]));
   const generica=f.texto.match(etiquetaGeneral);
   const vecinos=filas.filter(x=>x.pagina===f.pagina&&x.y<=f.y&&f.y-x.y<32).map(x=>x.texto).join(' ');
   const rolFila=rol||(/\b(?:CURP|NSS|SEGURIDAD SOCIAL)\b/i.test(vecinos)?'rfc':null);
   if(rolFila&&generica&&!etiquetas.some(([k])=>k==='rfc'||k==='rfc_emisor'))etiquetas.push([rolFila,generica]);
   for(const [campo,m] of etiquetas)(candidatos[campo]??=[]).push(fragmento(f,m,campo));
  }
  for(const campo of ['rfc_emisor','rfc','curp','nss','cfdi_uuid','neto','periodo']){
   const regiones=candidatos[campo]||[],coincidencias=[];
   for(const r of regiones){
    try{
     // Reunir separadores observados no sustituye letras ni inventa caracteres.
     const compacto=campo==='neto'?r.valor.replace(/\s/g,''):visible(r.valor).replace(/[\s.]/g,'').toUpperCase();
     if(campo!=='periodo'&&!campos[campo].valor.test(compacto))continue;
     coincidencias.push({r,valor:resolverLiteral(r,r.valor,lector)});
    }catch{}
   }
   const distintos=new Set(coincidencias.map(x=>JSON.stringify(x.valor)));
   if(distintos.size>1){errores.push('Valores incompatibles en '+campo+' del mismo recibo');continue;}
   if(coincidencias.length&&regiones.some(r=>r.valor&&!/^(?:—|-|N\/A|NO APLICA)$/i.test(r.valor)&&!coincidencias.some(c=>c.r===r))){errores.push('Otra región del campo '+campo+' requiere cotejo del original');continue;}
   if(coincidencias.length){
    Object.assign(datos,coincidencias[0].valor);pruebas[campo]=coincidencias.map(x=>x.r);continue;
   }
   if(campo==='curp'||campo==='nss'){datos[campo]=null;if(!regiones.length||regiones.every(r=>!r.valor||/^(?:—|-|N\/A|NO APLICA)$/i.test(r.valor)))continue;}
   if((campo==='periodo'&&datos.periodo_inicio&&datos.periodo_fin)||(campo==='neto'&&datos.neto!=null)||(campo==='cfdi_uuid'&&datos.cfdi_uuid))continue;
   if(campo==='rfc'||campo==='rfc_emisor'){
    const anclas=[...(candidatos.rfc||[]),...(candidatos.curp||[]),...(candidatos.nss||[])];
    const encabezado=campo==='rfc_emisor'&&anclas.length?filas.filter(f=>anclas.some(a=>a.pagina===f.pagina)&&f.y>Math.max(...anclas.filter(a=>a.pagina===f.pagina).map(a=>a.y))+2).flatMap(f=>(lector.parsear(f.texto).datos.identificadores||[]).filter(x=>campos.rfc_emisor.valor.test(x)).map(x=>({f,x}))):[];
    const unicosHeader=new Set(encabezado.map(x=>x.x));
    if(!regiones.length&&unicosHeader.size===1){const {f,x}=encabezado[0];datos[campo]=x;pruebas[campo]=[{campo,pagina:f.pagina,x:f.x,y:f.y,ancho:f.ancho,alto:f.alto,etiqueta:'RFC del encabezado emisor',texto:x,texto_original:f.texto_original||f.texto}];continue;}
    const ocupados=new Set([campo==='rfc'?datos.rfc_emisor:datos.rfc].filter(Boolean));
    const filtrados=(datos.identificadores||[]).filter(x=>!ocupados.has(x)&&new RegExp('^[A-ZÑ&]{'+(campo==='rfc'?4:3)+'}\\d{6}[A-Z0-9]{3}$').test(x));
    datos[campo]=null;
    if(!regiones.length&&filtrados.length===1){
     const f=filas.find(f=>f.texto.toUpperCase().includes(filtrados[0]));
     if(f){datos[campo]=filtrados[0];pruebas[campo]=[{campo,pagina:f.pagina,x:f.x,y:f.y,ancho:f.ancho,alto:f.alto,etiqueta:'RFC por formato',texto:filtrados[0]}];continue;}
    }
   }
   if(campo!=='cfdi_uuid'||regiones.length)pendientes.push({campo,causa:regiones.length?'Valor ilegible o fuera del formato':'Campo no localizado',region:regiones.length===1&&regiones[0].valor?regiones[0]:null});
  }
  // Repetir el mismo renglón en un recibo no crea otro importe.
  if(base.datos.recibos>1&&datos.neto!=null&&pruebas.neto?.length===base.datos.recibos&&!errores.length)datos.recibos=1;
  if(datos.recibos===0&&datos.neto!=null)datos.recibos=1;
  if(datos.recibos>1)errores.push('No fue posible separar los recibos con certeza');
  datos.identificadores=[datos.rfc,datos.rfc_emisor,datos.curp,datos.nss].filter(Boolean);
  const nums=filas.flatMap(f=>[...f.texto.matchAll(/\bNO\.?\s*N[ÓO]MINA\s*:\s*(\d{1,6})\b/gi)].map(m=>({valor:m[1],pagina:f.pagina,texto_original:f.texto_original||f.texto})));
  if(new Set(nums.map(x=>x.valor)).size===1){datos.numero_nomina_impreso=nums[0].valor;pruebas.numero_nomina_impreso=nums;}
  return {datos,errores,pendientes,pruebas,bloques,paginas};
 }
 function regiones(lectura,campo){
  if(!campos[campo])return [];
  const patron=campo==='rfc'?/[A-ZÑ&]{4}[\s.]*\d(?:[\s.]*\d){5}(?:[\s.]*[A-Z0-9]){3}/gi:campo==='rfc_emisor'?/[A-ZÑ&]{3,4}[\s.]*\d(?:[\s.]*\d){5}(?:[\s.]*[A-Z0-9]){3}/gi:campo==='curp'?/[A-ZÑ]{4}\s*\d{6}\s*[HM]\s*[A-Z]{5}[A-Z0-9]\d/gi:campo==='nss'?/\b\d{11}\b/g:campo==='cfdi_uuid'?new RegExp(folio,'gi'):campo==='neto'?/\b\d+(?:,\d{3})*\.\d{2}\b/g:null;
  const etiquetas={rfc:'RFC',rfc_emisor:'RFC',curp:'CURP',nss:'NSS',cfdi_uuid:'UUID',neto:'NETO PAGADO'},salida=[];
  for(const fila of (lectura.paginas||[]).flatMap(p=>p.lineas)){
   for(const m of patron?[...fila.texto.matchAll(patron)]:[]){
    const valor=m[0],r={campo,pagina:fila.pagina,x:fila.x,y:fila.y,ancho:fila.ancho,alto:fila.alto,etiqueta:etiquetas[campo],valor,texto:etiquetas[campo]+' '+valor,texto_original:fila.texto_original||fila.texto,recuperacion:true};
    if(r.texto.length<=145)salida.push(r);
   }
  }
  return salida;
 }
 function recuperar(lectura,campo,region){
  const p=lectura.pendientes.find(x=>x.campo===campo);if(!p||p.region||lectura.errores.length)throw Error('El campo no admite recuperación.');
  const real=regiones(lectura,campo).find(r=>JSON.stringify(r)===JSON.stringify(region));if(!real)throw Error('La región no pertenece a esta página del original.');p.region=real;return lectura;
 }
 function incorporar(lectura,transcripcion,lector){
  const {region,literal}=transcripcion;
  // Una mejora del lector puede resolver automáticamente una transcripción anterior.
  // Sólo se reutiliza si valor y región siguen acreditados en estas mismas páginas.
  if(region&&!lectura.errores.length&&!lectura.pendientes.some(p=>p.campo===region.campo)){
   const evidencias=lectura.pruebas[region.campo]||[];
   if(evidencias.some(r=>r.pagina===region.pagina&&r.x===region.x&&r.y===region.y&&r.valor===region.valor)){
    const valor=resolverLiteral(region,literal,lector);
    if(Object.entries(valor).every(([k,v])=>lectura.datos[k]===v))return lectura;
   }
  }
  if(region?.recuperacion&&!lectura.pendientes.find(p=>p.campo===region.campo)?.region)recuperar(lectura,region.campo,region);
  const r=lectura.pendientes.find(p=>p.campo===region?.campo)?.region;
  if(!r||['pagina','campo','texto','x','y','ancho','alto'].some(k=>r[k]!==region[k])||lectura.errores.length)
   throw Error('El campo no es elegible o la región cambió.');
  Object.assign(lectura.datos,resolverLiteral(r,literal,lector));
  if(r.campo==='neto'&&lectura.datos.recibos===0)lectura.datos.recibos=1;
  lectura.datos.identificadores=[lectura.datos.rfc,lectura.datos.rfc_emisor,lectura.datos.curp,lectura.datos.nss].filter(Boolean);
  lectura.pruebas[r.campo]=[{...r,transcripcion:literal}];
  lectura.pendientes=lectura.pendientes.filter(p=>p.campo!==r.campo);
  return lectura;
 }
 root.PLATINUM_CAMPOS_RECIBO=Object.freeze({lineas,paginasPDF,leer,incorporar,regiones,recuperar});
})(typeof window==='undefined'?globalThis:window);
