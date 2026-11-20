/* Recuperación complementaria. Cada propuesta conserva su fuente; no declara
   que un campo provenga del texto PDF cuando lo respalda un XML o una imagen. */
(function(root){
 'use strict';const VERSION='HIBRIDO_1';
 const mapa={rfc:'rfc',rfc_emisor:'emisor',curp:'curp',nss:'nss',cfdi_uuid:'uuid',neto:'neto',periodo_inicio:'desde',periodo_fin:'hasta'};
 const formatos={rfc:/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/,rfc_emisor:/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/,curp:/^[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/,nss:/^\d{11}$/,cfdi_uuid:/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/,periodo_inicio:/^\d{4}-\d{2}-\d{2}$/,periodo_fin:/^\d{4}-\d{2}-\d{2}$/};
 const vacio=x=>x==null||x==='';
 function normalizar(campo,valor){
  if(campo==='neto'){const n=Number(String(valor).replace(/[$,\s]/g,''));return Number.isFinite(n)&&n>=0&&Math.abs(Math.round(n*100)-n*100)<1e-7?n:null;}
  const v=String(valor??'').trim().toUpperCase();if(campo.startsWith('periodo_')&&(!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))return null;return formatos[campo]?.test(v)?v:null;
 }
 function cotejar(a,b){return ['rfc','rfc_emisor','curp','nss','cfdi_uuid','periodo_inicio','periodo_fin','neto'].every(k=>vacio(a[k])||vacio(b[k])||String(a[k])===String(b[k]));}
 function agregar(lectura,datos,fuente){
  if(!cotejar(lectura.datos,datos))return {aplicados:[],conflicto:'La fuente complementaria contradice identidad, fechas, UUID o neto del original; requiere cotejo'};
  const aplicados=[];lectura.evidencia_hibrida??=[];
  for(const k of Object.keys(mapa)){
   const valor=normalizar(k,datos[k]);if(valor==null||!vacio(lectura.datos[k]))continue;
   lectura.evidencia_hibrida.push({...fuente,campo:k,valor_original:lectura.datos[k]??null,valor_normalizado:valor,version:VERSION});
   lectura.datos[k]=valor;aplicados.push(k);
  }
  lectura.pendientes=lectura.pendientes.filter(p=>p.campo==='periodo'?!(lectura.datos.periodo_inicio&&lectura.datos.periodo_fin):!aplicados.includes(p.campo));
  lectura.datos.identificadores=[lectura.datos.rfc,lectura.datos.rfc_emisor,lectura.datos.curp,lectura.datos.nss].filter(Boolean);
  if(lectura.datos.neto!=null&&lectura.datos.recibos===0)lectura.datos.recibos=1;
  return {aplicados};
 }
 function aplicarVisual(lectura,propuesta,fuente,lector){
  const datos=propuesta.datos||{},anteriores={};
  for(const k of Object.keys(mapa))if(!vacio(datos[k])&&!vacio(lectura.datos[k])&&String(datos[k])!==String(lectura.datos[k])){
   const previo=(lectura.evidencia_hibrida||[]).filter(e=>e.campo===k).at(-1);
   if(previo?.metodo==='OCR_PROPUESTA'||fuente.confirmado){anteriores[k]=lectura.datos[k];lectura.datos[k]=null;}
  }
  const r=agregar(lectura,datos,{...fuente,metodo:fuente.metodo==='TRANSCRIPCION_CONFIRMADA'?'TRANSCRIPCION_CONFIRMADA':'VISION',valores_anteriores:anteriores});
  if(r.conflicto){Object.assign(lectura.datos,anteriores);return r;}
  if(propuesta.texto_region){
   const apoyo=lector.parsear(propuesta.texto_region);
   if(apoyo.datos.recibos>1)return {...r,conflicto:'La imagen puede contener varios recibos'};
   for(const k of ['percepciones','deducciones','otros_pagos','evidencia_neto','evidencia_timbrado'])if(vacio(lectura.datos[k])&&!vacio(apoyo.datos[k]))lectura.datos[k]=apoyo.datos[k];
   if(!lectura.datos.concepto?.tipo&&['NOMINA','FINIQUITO','MIXTO'].includes(apoyo.datos.concepto?.estado))lectura.datos.concepto=apoyo.datos.concepto;
   if(!apoyo.errores.length&&apoyo.datos.otros_pagos!=null)lectura.errores=lectura.errores.filter(e=>e!=='No se pudo asociar el importe literal de otros pagos');
  }
  return r;
 }
 function respaldarXML(f,archivos){
  const uuid=f.lectura?.datos?.cfdi_uuid;if(!uuid)return {aplicados:[]};
  const candidatos=archivos.filter(x=>x!==f&&x.formato==='XML'&&String(x.datos?.uuid||'').toUpperCase()===uuid&&(x.datos?.resultado?.estado==='VALIDO'||x.estado==='VALIDO'));
  const firmas=new Set(candidatos.map(x=>JSON.stringify(Object.fromEntries(Object.values(mapa).map(k=>[k,x.datos[k]])))));
  if(!candidatos.length)return{aplicados:[]};if(firmas.size!==1)return{aplicados:[],conflicto:'Hay XML del mismo UUID con datos diferentes; no se eligió el primero'};
  const x=candidatos[0],d=Object.fromEntries(Object.entries(mapa).map(([k,v])=>[k,k==='neto'?Number(x.datos[v]):x.datos[v]]));
  return agregar(f.lectura,d,{metodo:'XML_RESPALDO',archivo_id:x.id,huella:x.huella,original_huella:f.huella,uuid,resultado:'PROPUESTA_COTEJADA'});
 }
 function paginasOCR(data,{pagina=1,region={x:0,y:0},escala=2,alto_pagina}={}){
  const words=data.words||[],items=words.filter(w=>w.text?.trim()&&w.bbox).map(w=>{
   const l=(data.lines||[]).find(l=>l.bbox&&w.bbox.x0>=l.bbox.x0&&w.bbox.x1<=l.bbox.x1&&w.bbox.y0>=l.bbox.y0&&w.bbox.y1<=l.bbox.y1),bb=l?.bbox||w.bbox;
   return{str:w.text,width:(w.bbox.x1-w.bbox.x0)/escala,
   transform:[1,0,0,(bb.y1-bb.y0)/escala,(region.x+w.bbox.x0)/escala,alto_pagina-(region.y+bb.y1)/escala]};});
  const lineas=root.PLATINUM_CAMPOS_RECIBO.lineas(items,pagina);
  return [{pagina,texto:lineas.map(l=>l.texto).join(' '),lineas}];
 }
 let libreria=null,cola=Promise.resolve();
 async function cargarOCR(){
  if(root.Tesseract)return root.Tesseract;
  libreria??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.onload=()=>resolve(root.Tesseract);s.onerror=()=>{s.remove();libreria=null;reject(Error('No se pudo cargar el OCR local. Conserva el original y reintenta.'));};document.head.appendChild(s);});
  return libreria;
 }
 function ocr(imagen){const tarea=cola.catch(()=>{}).then(async()=>{
  const t=await cargarOCR(),worker=await t.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1'});
  try{const r=await worker.recognize(imagen,{}, {text:true,blocks:true,tsv:true});return {text:r.data.text,confidence:r.data.confidence,words:(r.data.words||[]).map(w=>({text:w.text,bbox:w.bbox,confidence:w.confidence})),lines:(r.data.lines||[]).map(w=>({text:w.text,bbox:w.bbox,confidence:w.confidence})),tsv:r.data.tsv};}
  catch(e){throw Error('El OCR no completó la región: '+e.message);}finally{await worker.terminate();}
 });cola=tarea;return tarea;}
 async function renderizar(file,pagina=1,region=null,escala=3){
  const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  try{if(pagina<1||pagina>doc.numPages)throw Error('Página fuera del original');const p=await doc.getPage(pagina),vp=p.getViewport({scale:escala});
   const r=region?.coordenadas_pdf?{x:Math.max(0,(region.x-12)*escala),y:Math.max(0,vp.height-(region.y+region.alto+12)*escala),ancho:Math.min(vp.width-Math.max(0,(region.x-12)*escala),(region.ancho+24)*escala),alto:Math.min(vp.height-Math.max(0,vp.height-(region.y+region.alto+12)*escala),(region.alto+24)*escala)}:region||{x:0,y:0,ancho:vp.width,alto:vp.height};
   if(![r.x,r.y,r.ancho,r.alto].every(Number.isFinite)||r.x<0||r.y<0||r.ancho<=0||r.alto<=0||r.x+r.ancho>vp.width+1||r.y+r.alto>vp.height+1||r.ancho*r.alto>5000000)throw Error('Región de lectura inválida');
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(r.ancho);canvas.height=Math.ceil(r.alto);
   await p.render({canvasContext:canvas.getContext('2d'),viewport:vp,transform:[1,0,0,1,-r.x,-r.y]}).promise;
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>2097152)throw Error('La región supera 2 MB; selecciona un recorte menor');
   const bytes=new Uint8Array(await blob.arrayBuffer()),huella=await sha256Hex(bytes);
   return {blob,bytes,huella,pagina,region:r,escala,alto_pagina:vp.height/escala,ancho_pagina:vp.width/escala};
  }finally{await doc.destroy();}
 }
 const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
 let pausaVision=0;
 async function recuperar(f,dep){
  if(f.formato!=='PDF'||!f.id||!f.lectura)return;
  const seguro=()=>{if(dep.vigente&&!dep.vigente())throw Error('Cambió el contexto de lectura; no se incorporaron resultados tardíos');};
  const avisar=texto=>dep.progreso?.(texto),lector=root.PLATINUM_RESPALDO_RECIBO;seguro();
  const xml=respaldarXML(f,dep.archivos||[]);if(xml.conflicto){f.lectura.avisos_hibridos=[xml.conflicto];return;}
  if(!f.lectura.pendientes.length&&f.lectura.datos.recibos===1&&f.lectura.datos.neto!=null)return;
  if(f.lectura.errores.some(e=>/COMBINADO|contradic|no cuadran|incompatibles/i.test(e)))return;
  const fallos=new Set(f.lectura.pendientes.flatMap(p=>p.campo==='periodo'?['periodo_inicio','periodo_fin']:[p.campo]));
  if(f.lectura.datos.neto==null)fallos.add('neto');
  if(f.lectura.datos.recibos===0){fallos.add('curp');fallos.add('nss');}
  for(const k of ['rfc','rfc_emisor','cfdi_uuid','periodo_inicio','periodo_fin'])if(vacio(f.lectura.datos[k]))fallos.add(k);
  if(!fallos.size)return;
  const pagina=f.lectura.pendientes.find(p=>p.region)?.region?.pagina||1;
  try{
   avisar('Preparando imagen real de la página '+pagina+' para los campos pendientes…');
   const regiones=f.lectura.pendientes.map(p=>p.region).filter(Boolean),recorte=regiones.length===f.lectura.pendientes.length&&regiones.length&&regiones.every(r=>r.pagina===pagina)?{coordenadas_pdf:true,x:Math.min(...regiones.map(r=>r.x)),y:Math.min(...regiones.map(r=>r.y)),ancho:Math.max(...regiones.map(r=>r.x+r.ancho))-Math.min(...regiones.map(r=>r.x)),alto:Math.max(...regiones.map(r=>r.y+r.alto))-Math.min(...regiones.map(r=>r.y))}:null;
   const imagen=await (dep.renderizar||renderizar)(f.file,pagina,recorte);seguro();f.imagen_recuperacion=imagen;
   try{
    avisar('Leyendo la imagen con OCR local…');const o=await(dep.ocr||ocr)(imagen.blob);seguro();const pp=paginasOCR(o,imagen),leido=root.PLATINUM_CAMPOS_RECIBO.leer(pp,lector);
    const r=agregar(f.lectura,leido.datos,{metodo:'OCR_PROPUESTA',original_huella:f.huella,imagen_huella:imagen.huella,pagina,region:imagen.region,resultado:'PENDIENTE_COTEJO'});
    for(const k of r.aplicados||[])fallos.add(k);
   }catch(e){(f.lectura.avisos_hibridos??=[]).push(e.message);}
   if(!dep.vision)throw Error('La lectura visual no está disponible en esta sesión');
   if(Date.now()<pausaVision)throw Error('Gemini está temporalmente en pausa; conserva los originales y reintenta después');
   avisar('Cotejando con Gemini la imagen real de los campos recuperados…');
   const campos=[...fallos].filter(k=>Object.hasOwn(mapa,k)).sort();f.campos_recuperacion=campos;
   seguro();const r=await dep.vision({tipo:'recibo_imagen',archivo_id:f.id,original_sha:f.huella,imagen_sha:imagen.huella,imagen:base64(imagen.bytes),pagina,
    region:{...imagen.region,ancho_pagina:imagen.ancho_pagina,alto_pagina:imagen.alto_pagina,escala:imagen.escala},campos});
   seguro();let j=r.data||{};if(r.error?.context?.json)try{j=await(r.error.context.clone?.()||r.error.context).json();}catch{}
   f.region_recuperacion_id=j.id||null;
   if(r.error||!j.ok){if(j.temporal||[429,503].includes(r.error?.context?.status))pausaVision=Date.now()+45000;throw Error(j.error||r.error?.message||'No se completó la lectura visual');}
   (f.propuestas_visuales??=[]).push({id:j.id,propuesta:j.propuesta,imagen_huella:imagen.huella,pagina,region:imagen.region});
   const aplicado=aplicarVisual(f.lectura,j.propuesta,{metodo:'VISION',region_id:j.id,original_huella:f.huella,imagen_huella:imagen.huella,pagina,region:imagen.region,resultado:'PENDIENTE_COTEJO'},lector);
   if(aplicado.conflicto)(f.lectura.avisos_hibridos??=[]).push(aplicado.conflicto);
   avisar(aplicado.conflicto||'Lectura complementaria disponible; se cotejarán identidad, periodo e importes.');
  }catch(e){(f.lectura.avisos_hibridos??=[]).push(e.message);avisar(e.message);}
 }
 root.PLATINUM_LECTURA_HIBRIDA=Object.freeze({VERSION,normalizar,cotejar,agregar,aplicarVisual,respaldarXML,paginasOCR,ocr,renderizar,recuperar});
})(typeof window==='undefined'?globalThis:window);
