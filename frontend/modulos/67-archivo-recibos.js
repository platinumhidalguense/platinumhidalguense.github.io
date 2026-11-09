/* Archivo documental independiente del estado financiero del Conciliador. */
(function(root){
 'use strict';
 const maximo=25*1024*1024, mime={PDF:'application/pdf',XML:'application/xml'};
 const estados={
  VALIDO:'Listo para archivar',DUPLICADO:'Ya archivado',CONFLICTO:'Conflicto de UUID',
  CONFLICTO_GUARDADO:'Original conservado para revisión',REVISAR:'Pendiente de revisión',
  ARCHIVADO:'Archivado · pendiente de verificación fiscal',FALLO:'No se completó · reintentar',
  RECIBIENDO:'Original recibido; registrando en el expediente'
 };
 let activo=null;
 const visible=s=>activo===s&&OBRA?.id===s.obra&&USER?.id===s.usuario&&!!$('ar-recibos');
 const aviso=e=>e?.message||'No se completó la operación.';
 async function api(s,accion,datos={}){
  const {data,error}=await sb.rpc('control_archivo_recibos',{p_accion:accion,p_datos:{obra_id:s.obra,cierre_id:s.cierre?.id||null,...datos}});
  if(error)throw Error(aviso(error));
  return data;
 }
 function unico(ids,regex){
  const candidatos=[...new Set(ids.filter(x=>regex.test(x)))];
  if(candidatos.length>1)throw Error('El PDF presenta identificadores contradictorios.');
  return candidatos[0]||null;
 }
 async function leer(file){
  const formato=file.name.split('.').pop()?.toUpperCase();
  if(!mime[formato]||file.size<1||file.size>maximo)throw Error('Se requiere un PDF o XML individual de hasta 25 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer()), lector=root.PLATINUM_RESPALDO_RECIBO;
  let d;
  if(formato==='XML'){
   d=lector.extraerXML(new TextDecoder().decode(bytes),DOMParser);
  }else{
   if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('El contenido no tiene una cabecera PDF válida.');
   const texto=await pdfBytesToText(bytes.slice()), lectura=lector.parsear(texto);
   d=lectura.datos;
   if(lectura.errores.length)throw Error(lectura.errores.join(' · '));
   const ids=d.identificadores||[], uuid=[...new Set((texto.match(/\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/gi)||[]).map(x=>x.toUpperCase()))];
   if(uuid.length>1)throw Error('El PDF incluye más de un folio fiscal.');
   d={...d,rfc:unico(ids,/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/),rfc_emisor:unico(ids,/^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/),
    curp:unico(ids,/^[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/),nss:unico(ids,/^\d{11}$/),
    cfdi_uuid:/(?:Folio\s+fiscal|UUID)/i.test(texto)?uuid[0]||null:null};
  }
  if(d.recibos!==1||d.neto==null)throw Error('No se pudo leer un solo recibo con neto explícito.');
  const neto=cfdiTotalImportado(d.neto);
  return {nombre:file.name,tamano:file.size,formato,huella:await sha256Hex(bytes),uuid:d.cfdi_uuid,
   emisor:d.rfc_emisor,rfc:d.rfc,curp:d.curp,nss:d.nss,desde:d.periodo_inicio,hasta:d.periodo_fin,pago:d.fecha_pago||null,
   neto:neto.toFixed(2),concepto:d.concepto?.estado||null};
 }
 const periodo=c=>c?c.periodo+' · S'+c.semana+' · '+(c.desde||'?')+' a '+(c.hasta||'?')+' · '+c.estado:'';
 function pintar(s){
  if(!visible(s))return;
  const n=$('ar-recibos'),c=s.cierre, des=s.ocupado?'disabled':'';
  n.dataset.busy=s.ocupado?'1':'0';
  const guardar=s.filas.some(f=>['VALIDO','CONFLICTO'].includes(f.estado)&&f.incluir);
  const fallos=s.filas.some(f=>f.estado==='FALLO');
  n.innerHTML=`<div class="m-head"><h2>Importar recibos PDF y XML</h2><button class="x" aria-label="Cerrar" data-ar="cerrar" ${des}>×</button></div>
  <div class="m-body">
   <p><b>${esc(s.razon)}</b> · ${esc(s.centro)}</p>
   <label for="ar-periodo">Cierre de destino</label>
   <select id="ar-periodo" ${des}><option value="">Selecciona el cierre</option>${s.periodos.map(p=>`<option value="${esc(p.id)}" ${p.id===c?.id?'selected':''}>${esc(periodo(p))}</option>`).join('')}</select>
   ${c?`<p><b>Periodicidad</b> ${esc(c.periodo)} · <b>Año</b> ${esc(c.desde?.slice(0,4)||'—')}${c.hasta?.slice(0,4)&&c.hasta.slice(0,4)!==c.desde?.slice(0,4)?'–'+esc(c.hasta.slice(0,4)):''} · <b>Semana</b> S${esc(c.semana)} · <b>Fechas</b> ${esc(c.desde||'—')} a ${esc(c.hasta||'—')}</p>`:''}
   <p role="status" class="fhint">${esc(s.error||c?.motivo||s.mensaje||'Elige el cierre antes de seleccionar archivos.')}</p>
   ${s.habilitado&&!c?.motivo?`<label for="ar-files">Recibos individuales (PDF y XML)</label><input type="file" id="ar-files" accept=".pdf,.xml" multiple ${des}>`:''}
   <p class="fhint">El archivo guarda el original. La verificación fiscal, el timbrado y los pagos se realizan por separado.</p>
   ${s.filas.length?`<div class="cg-table" style="overflow:auto;max-height:43vh"><table><thead><tr><th>Incluir</th><th>Archivo / formato</th><th>Trabajador</th><th>Fechas / concepto</th><th>Neto</th><th>Resultado</th></tr></thead><tbody>
    ${s.filas.map((f,i)=>`<tr><td>${['VALIDO','CONFLICTO'].includes(f.estado)?`<input type="checkbox" aria-label="${f.estado==='CONFLICTO'?'Conservar original en revisión':'Archivar'} ${esc(f.file.name)}" data-ar-i="${i}" ${f.incluir?'checked':''} ${des}>`:''}</td>
    <td>${esc(f.file.name)}<br><small>${esc(f.datos?.formato||'')}</small></td>
    <td>${f.trabajador_id?`#${esc(f.numero||'')} ${esc(f.trabajador||'')}`:'—'}</td>
    <td>${esc(f.datos?.desde||'—')} a ${esc(f.datos?.hasta||'—')}<br>${esc(f.datos?.concepto||'')}</td>
    <td>${f.datos?'$'+esc(f.datos.neto):'—'}</td><td><b>${esc(estados[f.estado]||f.estado)}</b>${f.motivo?`<br><small>${esc(f.motivo)}</small>`:''}${f.estado==='CONFLICTO'?'<br><small>Si lo seleccionas, sólo se guarda el original para revisión.</small>':''}</td></tr>`).join('')}
   </tbody></table></div>`:''}
  </div><div class="m-foot">
   <button class="btn" data-ar="cerrar" ${des}>${s.volver?'Volver':'Cerrar'}</button>
   ${fallos?`<button class="btn" data-ar="reintentar" ${des}>Reintentar sólo fallidos</button>`:''}
   <button class="btn dark" data-ar="guardar" ${!guardar||s.ocupado?'disabled':''}>Confirmar seleccionados</button>
  </div>`;
 }
 async function contexto(s,id){
  s.cierre=s.periodos.find(p=>p.id===id)||null;
  s.filas=[];s.habilitado=false;s.error=null;s.mensaje=s.cierre?'Comprobando permiso y periodo…':'Elige el cierre de destino.';
  pintar(s);
  if(!s.cierre)return;
  s.cierre=await api(s,'CONTEXTO');s.habilitado=!s.cierre.motivo;
  s.mensaje='Selecciona los archivos que correspondan a este periodo.';
 }
 async function previa(s,files){
  s.filas=[];
  const leidos=[];
  for(const file of files){
   if(!visible(s))return;
   const f={file,estado:'REVISAR'};
   s.filas.push(f);
   try{f.datos=await leer(file);leidos.push(f);}catch(e){f.motivo=aviso(e);}
  }
  const huellas=new Set(),folios=new Map();
  for(let i=0;i<leidos.length;i+=25){
   const lote=leidos.slice(i,i+25);
   try{
    const resultados=await api(s,'PREVIA',{archivos:lote.map(f=>f.datos)});
    lote.forEach((f,k)=>{
     Object.assign(f,resultados[k]);
     const d=f.datos;
     if(f.estado==='VALIDO'&&huellas.has(d.huella))Object.assign(f,{estado:'DUPLICADO',motivo:'El mismo original aparece en este lote.'});
     if(['VALIDO','CONFLICTO'].includes(f.estado)&&d.uuid){
      if(!folios.has(d.uuid))folios.set(d.uuid,[]);
      folios.get(d.uuid).push(f);
     }
     huellas.add(d.huella);
     f.incluir=f.estado==='VALIDO';
    });
   }catch(e){lote.forEach(f=>Object.assign(f,{estado:'REVISAR',motivo:aviso(e)}));}
  }
  for(const grupo of folios.values()){
   const claves=new Set(grupo.map(f=>[f.trabajador_id,f.datos.desde,f.datos.hasta,f.datos.neto,f.datos.concepto].join('|')));
   if(claves.size>1){
    grupo.forEach(f=>Object.assign(f,{estado:'CONFLICTO',incluir:false,motivo:'El UUID tiene datos distintos dentro del lote.'}));
   }else{
    const formatos=new Set();
    for(const f of grupo){
     if(f.estado==='VALIDO'&&formatos.has(f.datos.formato))Object.assign(f,{estado:'DUPLICADO',incluir:false,motivo:'Ya existe el mismo comprobante y formato dentro del lote.'});
     formatos.add(f.datos.formato);
    }
   }
  }
  s.mensaje='Revisa los resultados antes de confirmar.';
 }
 async function guardar(s,reintentar){
  const seleccion=s.filas.filter(f=>reintentar?f.estado==='FALLO':['VALIDO','CONFLICTO'].includes(f.estado)&&f.incluir);
  for(const f of seleccion){
   if(!visible(s))return;
   try{
    // El servidor conserva la reserva para retomar después de un fallo parcial.
    if(!f.reserva){
     const r=await api(s,'RESERVAR',{archivo:f.datos,conservar_conflicto:f.estado==='CONFLICTO'||f.conservar});
     if(r.estado!=='RECIBIENDO'){Object.assign(f,r);pintar(s);continue;}
     f.reserva=r;f.conservar=f.estado==='CONFLICTO';
    }
    if(!f.reserva.ya_subido){
     const {error}=await sb.storage.from('expedientes').upload(f.reserva.ruta,f.file,{upsert:false,contentType:mime[f.datos.formato]});
     if(error){
      // Si Storage recibió los bytes pero se perdió la respuesta, confirmar decide.
      const r=await api(s,'RESERVAR',{archivo:f.datos,conservar_conflicto:f.conservar});
      if(!r.ya_subido)throw Error(aviso(error));
     }
     f.reserva.ya_subido=true;
    }
    f.estado='RECIBIENDO';pintar(s);
    Object.assign(f,await api(s,'CONFIRMAR',{archivo_id:f.reserva.id}));f.motivo=f.estado==='ARCHIVADO'?'':f.motivo;
   }catch(e){f.estado='FALLO';f.motivo=aviso(e);}
   pintar(s);
  }
  s.mensaje='Carga terminada. Consulta el resultado de cada archivo.';
 }
 async function ejecutar(s,fn){
  if(s.ocupado)return;
  s.ocupado=true;s.error=null;pintar(s);
  try{await fn();}catch(e){s.error=aviso(e);}finally{s.ocupado=false;pintar(s);}
 }
 function cerrar(s){
  if(s.ocupado)return;
  const semana=s.cierre?.semana||s.semana;
  activo=null;closeModal();
  if(s.volver==='faltantes')return openFaltanRecibos(semana);
  if(s.volver==='conciliador')return root.PLATINUM_CONCILIADOR_SEMANAL?.abrir(null,semana,s.cierre?.id||null);
 }
 async function abrir(ctx={}){
  if(!OBRA||!USER)return;
  if(root.PLATINUM_CONCILIADOR?.estaCapturando()){
   toast('Termina la captura en curso del Conciliador antes de abrir el importador.','err');return;
  }
  const semana=Number(ctx.semana)||null;
  const s=activo={obra:OBRA.id,usuario:USER.id,razon:razonSocialEmpresa(),centro:OBRA.nombre,semana,volver:ctx.volver,periodos:[],filas:[],mensaje:'Consultando cierres…'};
  modal('<section id="ar-recibos" aria-label="Archivo de recibos de nómina"></section>','xl');
  const n=$('ar-recibos');
  n.onclick=e=>{
   const a=e.target.closest('[data-ar]')?.dataset.ar;
   if(a==='cerrar')return cerrar(s);
   if(a==='guardar'||a==='reintentar')return ejecutar(s,()=>guardar(s,a==='reintentar'));
  };
  n.onchange=e=>{
   const t=e.target;
   if(t.id==='ar-periodo')return ejecutar(s,()=>contexto(s,t.value));
   if(t.id==='ar-files'){const files=Array.from(t.files);if(files.length)return ejecutar(s,()=>previa(s,files));}
   if(t.dataset.arI!=null){s.filas[Number(t.dataset.arI)].incluir=t.checked;n.querySelector('[data-ar="guardar"]').disabled=!s.filas.some(f=>['VALIDO','CONFLICTO'].includes(f.estado)&&f.incluir);}
  };
  return ejecutar(s,async()=>{
   const datos=await api(s,'PERIODOS');
   if(!visible(s))return;
   s.periodos=datos.periodos;
   const candidatos=semana?s.periodos.filter(p=>p.semana===semana):[];
   const elegido=ctx.cierre?s.periodos.find(p=>p.id===ctx.cierre&&(!semana||p.semana===semana)):candidatos.length===1?candidatos[0]:null;
   if(elegido)return contexto(s,elegido.id);
   s.mensaje=!datos.escritura?'Tu cuenta es de consulta. Elige un periodo para ver su alcance.':
    !s.periodos.length?'No hay cierres para este centro.':semana?'Selecciona el cierre correspondiente a S'+semana+'.':'Elige el cierre de destino.';
  });
 }
 root.PLATINUM_ARCHIVO_RECIBOS=Object.freeze({abrir});
})(window);
