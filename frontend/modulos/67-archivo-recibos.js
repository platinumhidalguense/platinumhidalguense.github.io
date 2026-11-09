/* Archivo documental independiente del estado financiero del Conciliador. */
(function(root){
 'use strict';
 const maximo=25*1024*1024, mime={PDF:'application/pdf',XML:'application/xml'};
 const estados={
  VALIDO:'Listo para archivar',DUPLICADO:'Ya archivado',CONFLICTO:'Conflicto de UUID',
  CONFLICTO_GUARDADO:'Original conservado para revisión',REVISAR:'Pendiente de revisión',
  ARCHIVADO:'Archivado · pendiente de verificación fiscal',FALLO:'No se completó · reintentar',
  RECIBIENDO:'Original recibido; registrando en el expediente',
  VERIFICADO:'Evidencia fiscal verificada',PENDIENTE:'Archivado · lectura pendiente',
  FUERA_CONTEXTO:'Fuera del cotejo'
 };
 let activo=null,pausaIA=0,lecturaIA=false;
 const visible=s=>activo===s&&OBRA?.id===s.obra&&USER?.id===s.usuario&&!!$('ar-recibos');
 const aviso=e=>e?.message||'No se completó la operación.';
 async function api(s,accion,datos={}){
  const {data,error}=await sb.rpc('control_archivo_recibos',{p_accion:accion,p_datos:{obra_id:s.obra,cierre_id:s.cierre?.id||null,...datos}});
  if(error)throw Error(aviso(error));
  return data;
 }
 async function revision(obra,accion,datos){
  const {data,error}=await sb.rpc('control_revision_recibo',{p_accion:accion,p_datos:{obra_id:obra,...datos}});
  if(error)throw Error(aviso(error));
  return data;
 }
 async function leer(f){
  const file=f.file;
  const formato=file.name.split('.').pop()?.toUpperCase();
  if(!mime[formato]||file.size<1||file.size>maximo)throw Error('Se requiere un PDF o XML individual de hasta 25 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer()), lector=root.PLATINUM_RESPALDO_RECIBO;
  f.huella=await sha256Hex(bytes);
  if(f.original?.hash&&f.original.hash!==f.huella)throw Error('La huella del original archivado cambió.');
  if(formato==='XML'){
   f.lectura={datos:lector.extraerXML(new TextDecoder().decode(bytes),DOMParser),errores:[],pendientes:[],pruebas:{}};
  }else{
   if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('El contenido no tiene una cabecera PDF válida.');
   const pdf=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
   try{f.lectura=root.PLATINUM_CAMPOS_RECIBO.leer(await root.PLATINUM_CAMPOS_RECIBO.paginasPDF(pdf),lector);}
   finally{await pdf.destroy();}
  }
  datosArchivo(f);
 }
 function datosArchivo(f){
  const d=f.lectura.datos,neto=d.neto==null?null:cfdiTotalImportado(d.neto);
  f.datos={nombre:f.file.name,tamano:f.file.size,formato:f.file.name.split('.').pop().toUpperCase(),huella:f.huella,uuid:d.cfdi_uuid,
   emisor:d.rfc_emisor,rfc:d.rfc,curp:d.curp,nss:d.nss,desde:d.periodo_inicio,hasta:d.periodo_fin,pago:d.fecha_pago||null,
   neto:neto?.toFixed(2)??null,concepto:d.concepto?.estado||null};
 }
 function candidata(f){
  if(!f.lectura)return false;
  const {datos,errores,pendientes}=f.lectura;
  const bloqueados=pendientes.filter(p=>!['cfdi_uuid'].includes(p.campo));
  if(errores.length||bloqueados.length||datos.recibos!==1||datos.neto==null){
   f.estado='REVISAR';f.incluir=false;
   f.motivo=[...errores,...bloqueados.map(p=>p.campo+' · '+p.causa)].join(' · ')||'Neto o recibo individual pendiente.';
   return false;
  }
  if(datos.percepciones!=null&&datos.deducciones!=null&&Math.round((datos.percepciones+(datos.otros_pagos||0)-datos.deducciones)*100)!==Math.round(datos.neto*100)){
   f.estado='REVISAR';f.incluir=false;f.motivo='Percepciones, otros pagos y deducciones no cuadran con el neto.';
   return false;
  }
  return true;
 }
 async function verificar(s,f,id){
  const p={documento_id:id,cierre_id:s.cheque?s.cheque.cierre_id:s.cierre?.id,cheque_id:s.cheque?.id};
  const r=await revision(s.obra,'PREPARAR',p);
  if(r.estado==='VERIFICADO')return {...r,motivo:''};
  if(r.estado==='FUERA_CONTEXTO')return r;
  if(r.estado!=='LISTO')return {estado:'PENDIENTE',motivo:r.motivo};
  const result=await sb.functions.invoke('lectura-documental',{body:{lote_id:r.lote_id,token:r.token,individual:true,huella:f.huella,transcripciones:f.transcripciones||[]}});
  // Consulta la confirmación incluso si se perdió la respuesta del servicio.
  const estado=await revision(s.obra,'ESTADO',p);
  if(result.error&&estado.estado!=='VERIFICADO')estado.motivo=estado.motivo||aviso(result.error);
  return estado.estado==='VERIFICADO'?{...estado,motivo:''}:estado;
 }
 function inspeccion(f,i,s){
  if(s.revisando!==i||!f.lectura)return '';
  return `<div class="fhint"><p>Revisa los valores en el original. Sólo se incorpora una transcripción que aparezca en la región.</p>
   ${(f.lectura.bloques||[]).map(x=>`<p>Página ${esc(x.pagina)} · ${esc(x.datos.rfc)} · ${esc(x.datos.periodo_inicio)} a ${esc(x.datos.periodo_fin)} · $${esc(x.datos.neto)}</p>`).join('')}
   ${f.lectura.pendientes.map((p,k)=>`<p><b>${esc(p.campo)}</b> · ${esc(p.causa)}${p.region?` · página ${esc(p.region.pagina)}<br><code>${esc(p.region.texto)}</code><br>
    <label>Transcripción literal <input data-ar-literal="${i}-${k}" maxlength="110"></label>
    <button type="button" class="btn" data-ar="literal" data-i="${i}" data-k="${k}" ${s.ocupado?'disabled':''}>Usar transcripción</button>
    <button type="button" class="btn" data-ar="gemini" data-i="${i}" data-k="${k}" ${s.ocupado?'disabled':''}>Transcribir con Gemini</button>`:' · región no identificada'}</p>`).join('')}
   </div>`;
 }
 function resumenCheque(s){
  if(!s.cheque)return '';
  const d=s.diagnostico,r=d.respaldo||{};
  const dinero=x=>x==null?'—':'$'+money(x);
  return `<p><b>Cheque ${esc(s.cheque.tipo_pago)} · S${esc(d.semana)}</b> · NOI ${esc(dinero(r.noi))} · PDF ${esc(dinero(r.pdf_neto))}
   ${(r.documentos_fiscales||[]).flat().filter(x=>!x.pdf).map(x=>' · XML '+esc(dinero(x.neto))).join('')}
   ${r.diferencia_noi!=null?' · Diferencia CFDI/NOI '+esc(dinero(r.diferencia_noi)):''}</p>
   <p class="fhint">${d.cierre_id?'NOI del cierre: '+esc(d.noi_archivo||'pendiente'):'El cheque no tiene un cierre inequívoco para localizar su reporte NOI.'}</p>
   ${(d.desglose_noi||[]).map(n=>`<p class="fhint">NOI · ${esc(n.archivo)} · fila ${esc(n.fila??'sin referencia')} · ${esc(dinero(n.neto))} · ${esc(n.estado)}</p>`).join('')}
   ${(d.descartados||[]).length?`<details><summary>Evidencia fuera del cotejo</summary>${d.descartados.map(x=>`<p>${esc(x.fuente)} · S${esc(x.semana)} · ${esc(x.concepto||'concepto no comprobado')} · ${esc(x.desde||'—')} a ${esc(x.hasta||'—')}</p>`).join('')}</details>`:''}`;
 }
 const periodo=c=>c?c.periodo+' · S'+c.semana+' · '+(c.desde||'?')+' a '+(c.hasta||'?')+' · '+c.estado:'';
 function pintar(s){
  if(!visible(s))return;
  const n=$('ar-recibos'),c=s.cierre, des=s.ocupado?'disabled':'';
  n.dataset.busy=s.ocupado?'1':'0';
  const guardar=s.filas.some(f=>['VALIDO','CONFLICTO'].includes(f.estado)&&f.incluir);
  const fallos=s.filas.some(f=>f.estado==='FALLO'||f.estado==='PENDIENTE');
  n.innerHTML=`<div class="m-head"><h2>Importar recibos PDF y XML</h2><button class="x" aria-label="Cerrar" data-ar="cerrar" ${des}>×</button></div>
  <div class="m-body">
   <p><b>${esc(s.razon)}</b> · ${esc(s.centro)}</p>
   ${s.cheque?'':`<label for="ar-periodo">Cierre de destino</label><select id="ar-periodo" ${des}><option value="">Selecciona el cierre</option>${s.periodos.map(p=>`<option value="${esc(p.id)}" ${p.id===c?.id?'selected':''}>${esc(periodo(p))}</option>`).join('')}</select>`}
   ${c?`<p><b>Periodicidad</b> ${esc(c.periodo)} · <b>Año</b> ${esc(c.desde?.slice(0,4)||'—')}${c.hasta?.slice(0,4)&&c.hasta.slice(0,4)!==c.desde?.slice(0,4)?'–'+esc(c.hasta.slice(0,4)):''} · <b>Semana</b> S${esc(c.semana)} · <b>Fechas</b> ${esc(c.desde||'—')} a ${esc(c.hasta||'—')}</p>`:''}
   <p role="status" class="fhint">${esc(s.error||c?.motivo||s.mensaje||'Elige el cierre antes de seleccionar archivos.')}</p>
   ${resumenCheque(s)}
   ${s.habilitado&&!c?.motivo?`<label for="ar-files">Recibos individuales (PDF y XML)</label><input type="file" id="ar-files" accept=".pdf,.xml" multiple ${des}>`:''}
   <p class="fhint">La confirmación guarda el original y comprueba su evidencia fiscal. Timbrar, aplicar un pago o expedir el cheque son acciones separadas.</p>
   ${s.filas.length?`<div class="cg-table" style="overflow:auto;max-height:43vh"><table><thead><tr><th>Incluir</th><th>Archivo / formato</th><th>Trabajador</th><th>Fechas / concepto</th><th>Neto</th><th>Resultado</th></tr></thead><tbody>
    ${s.filas.map((f,i)=>`<tr><td>${['VALIDO','CONFLICTO'].includes(f.estado)?`<input type="checkbox" aria-label="${f.estado==='CONFLICTO'?'Conservar original en revisión':'Archivar'} ${esc(f.file.name)}" data-ar-i="${i}" ${f.incluir?'checked':''} ${des}>`:''}</td>
    <td>${esc(f.file?.name||f.original?.nombre)}<br><small>${esc(f.datos?.formato||f.original?.formato||'')}</small>
     <button type="button" class="btn" data-ar="original" data-i="${i}" ${des}>Ver original</button></td>
    <td>${f.trabajador_id?`#${esc(f.numero||'')} ${esc(f.trabajador||'')}`:'—'}</td>
    <td>${esc(f.datos?.desde||f.original?.desde||'—')} a ${esc(f.datos?.hasta||f.original?.hasta||'—')}<br>${esc(f.datos?.concepto||f.original?.concepto||'')}</td>
    <td>${(f.datos?.neto??f.original?.neto)!=null?'$'+esc(f.datos?.neto??f.original?.neto):'—'}${(f.datos?.uuid||f.original?.uuid)?`<br><small>${esc(f.datos?.uuid||f.original?.uuid)}</small>`:''}</td><td><b>${esc(estados[f.estado]||f.estado)}</b>${f.motivo?`<br><small>${esc(f.motivo)}</small>`:''}${f.estado==='CONFLICTO'?'<br><small>Si lo seleccionas, sólo se guarda el original para revisión.</small>':''}
    ${f.lectura||f.original?`<button type="button" class="btn" data-ar="revisar" data-i="${i}" ${des}>Revisar campos</button>`:''}${inspeccion(f,i,s)}</td></tr>`).join('')}
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
  if(s.habilitado){
   const originales=await revision(s.obra,'PENDIENTES',{cierre_id:s.cierre.id});
   s.filas=originales.map(filaArchivada);
  }
  s.mensaje='Selecciona los archivos que correspondan a este periodo.';
 }
 async function previa(s,files){
  s.filas=s.filas.filter(f=>f.documento_id&&f.estado==='PENDIENTE');
  const leidos=[];
  for(const file of files){
   if(!visible(s))return;
   const f={file,estado:'REVISAR'};
   s.filas.push(f);
   try{await leer(f);if(candidata(f))leidos.push(f);}catch(e){f.motivo=aviso(e);}
  }
  await prevalidar(s,leidos);
  s.mensaje='Revisa los resultados antes de confirmar.';
 }
 async function prevalidar(s,leidos){
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
 }
 async function guardar(s,reintentar){
  const seleccion=s.filas.filter(f=>reintentar?['FALLO','PENDIENTE'].includes(f.estado):['VALIDO','CONFLICTO'].includes(f.estado)&&f.incluir);
  for(const f of seleccion){
   if(!visible(s))return;
   try{
    if(f.documento_id){
     Object.assign(f,await verificar(s,f,f.documento_id));pintar(s);continue;
    }
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
    Object.assign(f,await api(s,'CONFIRMAR',{archivo_id:f.reserva.id}));
    if(f.estado==='ARCHIVADO'){
     f.motivo='';
     if(!f.documento_id){
      const doc=await revision(s.obra,'ORIGINAL_ARCHIVADO',{cierre_id:s.cierre.id,huella:f.huella});
      f.documento_id=doc.documento_id;
     }
     if(f.documento_id){
      pintar(s);
      Object.assign(f,await verificar(s,f,f.documento_id));
     }
    }
   }catch(e){f.estado=f.documento_id?'PENDIENTE':'FALLO';f.motivo=aviso(e);}
   pintar(s);
  }
  if(s.cheque&&visible(s))s.diagnostico=await cotejar(s.cheque);
  s.mensaje='Carga terminada. Consulta el resultado de cada archivo.';
 }
 async function revisarFila(s,f,i){
  s.revisando=i;
  if(!f.file&&f.original){
   const {data,error}=await sb.storage.from('expedientes').download(f.original.ruta);
   if(error)throw Error(aviso(error));
   f.file=new File([data],f.original.nombre||('recibo.'+(f.original.formato==='CFDI_NOMINA'?'xml':'pdf')),{type:data.type});
   await leer(f);
   const alertas=[...f.lectura.errores,...f.lectura.pendientes.map(p=>p.campo+' · '+p.causa)];
   f.motivo=alertas.join(' · ')||'Confirma la lectura del original privado.';
  }
  if(f.estado==='DUPLICADO'&&f.huella&&s.cierre?.id){
   const doc=await revision(s.obra,'ORIGINAL_ARCHIVADO',{cierre_id:s.cierre.id,huella:f.huella});
   if(doc.documento_id){
    f.documento_id=doc.documento_id;
    Object.assign(f,await revision(s.obra,'ESTADO',{cierre_id:s.cierre.id,documento_id:doc.documento_id}));
   }
  }
 }
 async function transcribir(s,f,p,literal,usarIA){
  if(!p?.region)throw Error('No se aisló el campo en el original.');
  if(usarIA){
   if(lecturaIA||Date.now()<pausaIA)throw Error('Lectura asistida en pausa. Espera y reintenta el campo.');
   lecturaIA=true;
   try{
    const {data,error}=await sb.functions.invoke('gemini-extract',{body:{tipo:'recibo_fragmento',obra_id:s.obra,huella:f.huella,region:p.region}});
    if([429,503].includes(error?.context?.status)||data?.temporal){
     pausaIA=Date.now()+45000;
     throw Error('Gemini está temporalmente ocupado. Los resultados del lote se conservaron.');
    }
    if(error||!data?.ok)throw Error(data?.error||'No se obtuvo una transcripción comprobable.');
    literal=data.literal;
   }finally{lecturaIA=false;}
  }
  if(!visible(s))return;
  const evidencia={region:p.region,literal};
  root.PLATINUM_CAMPOS_RECIBO.incorporar(f.lectura,evidencia,root.PLATINUM_RESPALDO_RECIBO);
  (f.transcripciones??=[]).push(evidencia);
  datosArchivo(f);
  if(f.documento_id){f.motivo='Transcripción incorporada. Confirma la lectura del original archivado.';return;}
  if(candidata(f))await prevalidar(s,[f]);
 }
 async function verOriginal(s,f,i){
  if(!f.file)await revisarFila(s,f,i);
  if(!visible(s)||!f.file)return;
  const url=URL.createObjectURL(f.file);
  const a=document.createElement('a');
  a.href=url;a.target='_blank';a.rel='noopener';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function ejecutar(s,fn){
  if(s.ocupado)return;
  s.ocupado=true;s.error=null;pintar(s);
  try{await fn();}catch(e){s.error=aviso(e);}finally{s.ocupado=false;pintar(s);}
 }
 function cerrar(s){
  if(s.ocupado)return;
  const semana=s.cierre?.semana||s.semana;
  activo=null;
  if(s.anidado)closeModal2();else closeModal();
  if(s.alVolver)return s.alVolver();
  if(s.volver==='faltantes')return openFaltanRecibos(semana);
  if(s.volver==='conciliador')return root.PLATINUM_CONCILIADOR_SEMANAL?.abrir(null,semana,s.cierre?.id||null);
 }
 function montar(s){
  activo=s;
  const contenido='<section id="ar-recibos" aria-label="Archivo de recibos de nómina"></section>';
  if(s.anidado)modal2(contenido,'xl');else modal(contenido,'xl');
  const n=$('ar-recibos');
  n.onclick=e=>{
   const b=e.target.closest('[data-ar]'),a=b?.dataset.ar;
   if(a==='cerrar')return cerrar(s);
   if(a==='guardar'||a==='reintentar')return ejecutar(s,()=>guardar(s,a==='reintentar'));
   const i=Number(b?.dataset.i),f=s.filas[i];
   if(!f)return;
   if(a==='revisar')return ejecutar(s,()=>revisarFila(s,f,i));
   if(a==='original')return ejecutar(s,()=>verOriginal(s,f,i));
   if(a==='literal'||a==='gemini'){
    const k=Number(b.dataset.k),literal=n.querySelector('[data-ar-literal="'+i+'-'+k+'"]')?.value;
    return ejecutar(s,()=>transcribir(s,f,f.lectura.pendientes[k],literal,a==='gemini'));
   }
  };
  n.onchange=e=>{
   const t=e.target;
   if(t.id==='ar-periodo')return ejecutar(s,()=>contexto(s,t.value));
   if(t.id==='ar-files'){const files=Array.from(t.files);if(files.length)return ejecutar(s,()=>previa(s,files));}
   if(t.dataset.arI!=null){s.filas[Number(t.dataset.arI)].incluir=t.checked;n.querySelector('[data-ar="guardar"]').disabled=!s.filas.some(f=>['VALIDO','CONFLICTO'].includes(f.estado)&&f.incluir);}
  };
  pintar(s);
 }
 const base=()=>({obra:OBRA.id,usuario:USER.id,razon:razonSocialEmpresa(),centro:OBRA.nombre,periodos:[],filas:[]});
 const filaArchivada=original=>({original,documento_id:original.id,estado:'PENDIENTE',huella:original.hash,motivo:original.motivo});
 function cotejar(cheque){
  return revision(cheque.obra_id,'CHEQUE',{cheque_id:cheque.id,cierre_id:cheque.cierre_id||null});
 }
 function abrirCheque(cheque,diagnostico,alVolver,anidado=false){
  if(!OBRA||!USER||cheque.obra_id!==OBRA.id||!diagnostico)return;
  const s={...base(),cheque,diagnostico,alVolver,anidado,semana:diagnostico.semana,
   cierre:{semana:diagnostico.semana,desde:diagnostico.desde,hasta:diagnostico.hasta,periodo:diagnostico.periodo||'Por confirmar'},
   mensaje:diagnostico.respaldo?.error||'Evidencia asociada al cheque y sus fechas.'};
  s.filas=(diagnostico.pendientes||[]).map(filaArchivada);
  montar(s);
 }
 async function abrir(ctx={}){
  if(!OBRA||!USER)return;
  if(root.PLATINUM_CONCILIADOR?.estaCapturando()){
   toast('Termina la captura en curso del Conciliador antes de abrir el importador.','err');return;
  }
  const semana=Number(ctx.semana)||null,s={...base(),semana,volver:ctx.volver,mensaje:'Consultando cierres…'};
  montar(s);
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
 root.PLATINUM_ARCHIVO_RECIBOS=Object.freeze({abrir,cotejar,abrirCheque});
})(window);
