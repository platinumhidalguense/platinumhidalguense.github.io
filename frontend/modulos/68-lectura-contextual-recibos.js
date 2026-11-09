/* Adaptador del lector tradicional. Conserva evidencia por página y campo. */
(function(root){
 'use strict';
 const rfc='[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}', curp='[A-ZÑ]{4}\\d{6}[HM][A-Z]{5}[A-Z0-9]\\d';
 const folio='[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}';
 const campos={
  rfc_emisor:{etiqueta:/\bRFC\s+(?:DEL\s+)?EMISOR\b/i,valor:new RegExp('^'+rfc+'$','i')},
  rfc:{etiqueta:/\bRFC\s+(?:DEL\s+)?(?:RECEPTOR|TRABAJADOR|EMPLEADO)\b/i,valor:new RegExp('^'+rfc+'$','i')},
  curp:{etiqueta:/\bCURP\b/i,valor:new RegExp('^'+curp+'$','i')},
  nss:{etiqueta:/\b(?:NSS|N[ÚU]MERO\s+DE\s+SEGURIDAD\s+SOCIAL|SEGURIDAD\s+SOCIAL)\b/i,valor:/^\d{11}$/},
  cfdi_uuid:{etiqueta:/\b(?:FOLIO\s+FISCAL|UUID)\b/i,valor:new RegExp('^'+folio+'$','i')},
  neto:{etiqueta:/\bNETO\s+PAGADO\b/i,valor:/^\d+(?:,\d{3})*\.\d{2}$/},
  periodo:{etiqueta:/\b(?:PER[IÍ]ODO|DEL)\s+(?=\d)/i,valor:/^.{1,85}$/}
 };
 const sinAcento=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const limpio=s=>String(s||'').trim().replace(/^[:$\s]+/,'').trim();
 const etiquetaGeneral=/\b(?:RFC|R\.F\.C\.)\s*:?/i;
 const finValor=/\s+(?:(?:R\.F\.C\.|RFC|CURP|NSS|N[ÚU]MERO DE SEGURIDAD SOCIAL|REFERENCIA|FOLIO|CUENTA|CLABE|NETO|PERCEPCIONES|DEDUCCIONES|SELLO)\b|FECHA DE)/i;
 function lineas(items,pagina){
  const filas=[];
  for(const item of items){
   if(!item.str?.trim())continue;
   const [, , ,alto=0,x=0,y=0]=item.transform||[];
   let fila=filas.find(f=>Math.abs(f.y-y)<2);
   if(!fila){fila={pagina,y,alto:Math.abs(alto)||10,partes:[]};filas.push(fila);}
   fila.partes.push({x,ancho:item.width||0,texto:item.str.trim()});
  }
  return filas.sort((a,b)=>b.y-a.y).map(f=>{
   const partes=f.partes.sort((a,b)=>a.x-b.x),x=partes[0].x;
   return {pagina,x,y:f.y,alto:f.alto,ancho:Math.max(...partes.map(p=>p.x+p.ancho))-x,texto:partes.map(p=>p.texto).join(' '),partes};
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
  const inicio=marca.index,despues=inicio+marca[0].length,valor=limpio(fila.texto.slice(despues).split(finValor)[0]).slice(0,110);
  const texto=(marca[0]+' '+valor).trim();
  const part=(fila.partes||[]).find(p=>p.texto.toUpperCase().includes(marca[0].toUpperCase()));
  return {campo,pagina:fila.pagina,x:part?.x??fila.x,y:fila.y,ancho:part?.ancho??fila.ancho,alto:fila.alto,etiqueta:marca[0],texto,valor};
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
  const v=campo==='neto'?valor.replace(/\s/g,''):valor.replace(/[\s.]/g,'').toUpperCase();
  if(!campos[campo]?.valor.test(v))throw Error('El valor transcrito no tiene el formato de '+campo+'.');
  return {[campo]:campo==='neto'?Number(v.replace(/,/g,'')):v};
 }
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
  const base=lector.parsear(paginas.map(p=>p.texto).join(' ')),datos={...base.datos},pruebas={},pendientes=[],errores=[...base.errores];
  const filas=paginas.flatMap(p=>p.lineas), candidatos={};
  let rol=null,paginaAnterior=null;
  for(const f of filas){
   if(paginaAnterior!==f.pagina){rol=null;paginaAnterior=f.pagina;}
   const encabezado=sinAcento(f.texto).match(/^(?:DATOS\s+(?:DEL|DE LA)\s+)?(EMISOR|PATRON|RECEPTOR|TRABAJADOR|EMPLEADO)\b/i);
   if(encabezado)rol=/EMISOR|PATRON/i.test(encabezado[1])?'rfc_emisor':'rfc';
   const etiquetas=Object.entries(campos).flatMap(([campo,{etiqueta}])=>
    [...f.texto.matchAll(new RegExp(etiqueta.source,etiqueta.flags+'g'))].map(m=>[campo,m]));
   const generica=f.texto.match(etiquetaGeneral);
   if(rol&&generica&&!etiquetas.some(([k])=>k==='rfc'||k==='rfc_emisor'))etiquetas.push([rol,generica]);
   for(const [campo,m] of etiquetas)(candidatos[campo]??=[]).push(fragmento(f,m,campo));
  }
  for(const campo of ['rfc_emisor','rfc','curp','nss','cfdi_uuid','neto','periodo']){
   const regiones=candidatos[campo]||[],coincidencias=[];
   for(const r of regiones){
    try{
     // El paso tradicional conserva sólo valores de formato directo.
     if(campo!=='periodo'&&!campos[campo].valor.test(r.valor))continue;
     coincidencias.push({r,valor:resolverLiteral(r,r.valor,lector)});
    }catch{}
   }
   const distintos=new Set(coincidencias.map(x=>JSON.stringify(x.valor)));
   if(distintos.size>1){errores.push('Valores incompatibles en '+campo+' del mismo recibo');continue;}
   if(coincidencias.length){
    Object.assign(datos,coincidencias[0].valor);pruebas[campo]=coincidencias.map(x=>x.r);continue;
   }
   if(campo==='curp'||campo==='nss'){datos[campo]=null;if(!regiones.length)continue;}
   if((campo==='periodo'&&datos.periodo_inicio&&datos.periodo_fin)||(campo==='neto'&&datos.neto!=null)||(campo==='cfdi_uuid'&&datos.cfdi_uuid))continue;
   if(campo==='rfc'||campo==='rfc_emisor'){
    const filtrados=(datos.identificadores||[]).filter(x=>new RegExp('^[A-ZÑ&]{'+(campo==='rfc'?4:3)+'}\\d{6}[A-Z0-9]{3}$').test(x));
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
  return {datos,errores,pendientes,pruebas,bloques};
 }
 function incorporar(lectura,transcripcion,lector){
  const {region,literal}=transcripcion;
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
 root.PLATINUM_CAMPOS_RECIBO=Object.freeze({lineas,paginasPDF,leer,incorporar});
})(typeof window==='undefined'?globalThis:window);
