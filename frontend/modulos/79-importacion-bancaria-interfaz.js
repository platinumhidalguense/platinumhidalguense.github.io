/* Entrada única para incorporar evidencia bancaria actual e histórica. */
(function(){
 'use strict';let vista=null,contador=0;
 const etiquetas={LISTO:'Listo para conciliar',YA_CONCILIADO:'Ya conciliado · reutilizar pago',VINCULACION_PENDIENTE:'Vinculación pendiente',IDENTIDAD_POR_REVISAR:'Revisar identidad / cuenta',CICLO_POR_REVISAR:'Revisar ciclo laboral',PERIODO_POR_REVISAR:'Resolver periodo',PAGO_PARCIAL:'Pago parcial',EXCEDENTE:'Excedente por revisar',CONFIRMACION_PENDIENTE:'Confirmación de cheque pendiente',CHEQUE_PROTEGIDO:'Cheque entregado / protegido',VARIOS_CHEQUES:'Varios cheques por revisar',CHEQUE_CANCELADO:'Cheque cancelado y pago conciliado',CONCILIADO:'Conciliado',CONCILIADO_REUTILIZADO:'Conciliado con pago existente',ERROR_RECUPERABLE:'Error recuperable',RECHAZADO_REGISTRADO:'Rechazo archivado',BANCO_PENDIENTE:'Estado bancario pendiente',AUTORIZACION_PENDIENTE:'Pendiente de conciliador autorizado'};
 const ETAPAS={ARCHIVADO:'Archivado',LEIDO:'Leído',ASOCIADO:'Asociado',REGISTRADO:'Registrado',CONCILIADO:'Conciliado'};
 const CAMPOS_EVIDENCIA={beneficiario:'Beneficiario',cuenta_destino:'Cuenta destino',ordenante:'Ordenante',cuenta_origen:'Cuenta origen',importe:'Importe',fecha:'Fecha',referencia:'Referencia',estado:'Estado'};
 let secResolver=0;
 const EXCLUIDAS={CHEQUE:'Requieren decisión de cheque (confírmalas con «Confirmar importación y conciliación»)',IMPORTE:'Importe por revisar (parcial o excedente)',REVISION:'Por revisar (identidad, periodo, ciclo o vínculo)',DUPLICADO:'Duplicadas en el archivo'},
  LOTE={CONFIRMADO:'Confirmada',YA_EXISTENTE:'Ya existente',FALLIDO:'Fallida',PENDIENTE:'Pendiente',PROCESANDO:'Procesando'};
 const totalesTexto=t=>`Confirmadas ${t.CONFIRMADO} · ya existentes ${t.YA_EXISTENTE} · fallidas ${t.FALLIDO} · pendientes ${t.PENDIENTE}`;
 const monto=n=>n==null?'Por determinar':'$'+money(n),etiqueta=s=>etiquetas[s]||String(s||'Pendiente').replace(/_/g,' ');
 const obraEmpresa=o=>String(o?.empresa_codigo||empresaDeObra(o)||'');
 function actual(v){return vista===v&&v.host.isConnected&&USER?.id===v.usuario;}
 async function abrir(opciones={}){
  if(vista?.servicio.ocupado()){toast('Espera a que termine la importación actual.','err');return;}
  vista?.servicio.cerrar();const clave='banco-historico-'+(++contador),usuario=USER?.id;
  const obra=OBRAS.find(o=>o.id===opciones.obra_id)||OBRA||OBRAS[0];if(!obra)return;
  modal(`<div id="${clave}" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden">
   <div class="m-head"><h2>Importar pagos bancarios</h2><button type="button" class="x" data-bh="cerrar" aria-label="Cerrar">×</button></div>
   <div class="m-body" style="min-height:0;overflow:auto"><p>Globales e individuales, también de periodos anteriores. Se registra y concilia evidencia; esta operación no envía dinero al banco.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px" data-bh-contexto>
     <label>Razón social<select data-bh-empresa>${[...new Set(OBRAS.map(obraEmpresa))].map(e=>`<option value="${esc(e)}" ${e===obraEmpresa(obra)?'selected':''}>${esc(EMPRESAS[e]?.corto||e)}</option>`).join('')}</select></label>
     <label>Centro<select data-bh-obra></select></label><label>Año<input type="number" min="2020" max="2100" data-bh-anio value="${Number(opciones.anio)||new Date().getFullYear()}"></label>
     <label>Periodicidad<select data-bh-per><option value="SEMANAL">Semanal</option><option value="QUINCENAL" ${opciones.periodicidad==='QUINCENAL'?'selected':''}>Quincenal</option></select></label>
     <label data-bh-semana-label>Semana<select data-bh-semana><option value="">Varios periodos · resolver por operación</option>${Array.from({length:53},(_,i)=>`<option value="${i+1}" ${i+1===Number(opciones.semana||semObra())?'selected':''}>S${i+1}</option>`).join('')}</select></label>
     <label data-bh-mes-label hidden>Mes<select data-bh-mes>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===Number(opciones.mes||new Date().getMonth()+1)?'selected':''}>${i+1}</option>`).join('')}</select></label>
     <label data-bh-quincena-label hidden>Quincena<select data-bh-quincena><option value="1" ${Number(opciones.quincena)!==2?'selected':''}>Primera</option><option value="2" ${Number(opciones.quincena)===2?'selected':''}>Segunda</option><option value="">Varias · resolver por operación</option></select></label>
     <label>Concepto<select data-bh-concepto>${[['TODOS','Mixto · resolver por operación'],['NOMINA','Nómina'],['FINIQUITO','Finiquitos'],['PREVISION_SOCIAL','Previsión social']].map(([k,t])=>`<option value="${k}" ${opciones.concepto===k?'selected':''}>${t}</option>`).join('')}</select></label>
    </div><button type="button" class="btn" data-bh="contexto" style="margin:10px 0">Cargar contexto y archivos</button>
    <p class="fhint">La fecha de transferencia se conserva separada del periodo laboral. Puedes incorporar evidencia sin fotografía; las nóminas autorizadas conservan sus importes y controles.</p>
    <div role="status" aria-live="polite" data-bh-mensaje>Preparando contexto…</div><div data-bh-archivos></div><div data-bh-lectura></div>
   </div><div class="m-foot"><button type="button" class="btn" data-bh="cerrar">Cerrar</button><button type="button" class="btn" data-bh="previa" disabled>Revisar obligación y cheque</button><button type="button" class="btn dark" data-bh="confirmar" disabled>Confirmar importación y conciliación</button></div></div>`,'lg');
  const host=$(clave),v={host,usuario,servicio:null,pagina:0,opciones,ocupado:false};vista=v;
  const q=s=>host.querySelector(s),mensaje=t=>{if(actual(v))q('[data-bh-mensaje]').textContent=t;};
  function centros(preferido){q('[data-bh-obra]').innerHTML=OBRAS.filter(o=>obraEmpresa(o)===q('[data-bh-empresa]').value).map(o=>`<option value="${o.id}" ${o.id===preferido?'selected':''}>${esc(o.nombre)}</option>`).join('');}
  centros(obra.id);
  const core=window.PLATINUM_CONCILIADOR_CORE;
  v.servicio=window.PLATINUM_BANCO_HISTORICO.crear({
   context:()=>({obra_id:q('[data-bh-obra]').value,usuario_id:USER?.id,firma:JSON.stringify(contexto())}),rpc:(...a)=>sb.rpc(...a),get storage(){return sb.storage;},core,
   legacy:{global:parsePagoGlobal,individual:parsePagoIndividual},hash:sha256Hex,file:(bytes,name)=>new File([bytes],name,{type:'application/pdf'}),
   paginas:async bytes=>{if(!window.pdfjsLib)throw Error('No cargó el lector PDF');const doc=await pdfjsLib.getDocument({data:new Uint8Array(bytes)}).promise;try{const pp=[];for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),t=await p.getTextContent();pp.push({numero:i,texto:t.items.map(x=>x.str).join(' ')});}return pp;}finally{await doc.destroy();}},
   fragmento:async(bytes,pagina)=>{if(!window.PDFLib)throw Error('No cargó el separador de páginas PDF');const src=await PDFLib.PDFDocument.load(bytes),out=await PDFLib.PDFDocument.create();const [pg]=await out.copyPages(src,[pagina-1]);out.addPage(pg);return(await out.save()).buffer;},
   ia:id=>iaLlamar(IA_FN.extract,{tipo:'bbva_historico_fragmento',archivo_id:id},160000),
   onChange:(s,ocupado)=>{v.ocupado=ocupado;if(actual(v))pintar(s);},
   onConfirmed:async(r,s)=>{if(!actual(v))return;markWrite();if(OBRA?.id===s.obra_id){window._pendingRT=true;window._pendingRTManual=true;}toast('Resultado de importación guardado; revisa los casos pendientes.','ok');}
  });
  function contexto(){const per=q('[data-bh-per]').value,sem=q('[data-bh-semana]').value;return{empresa_codigo:q('[data-bh-empresa]').value,anio:Number(q('[data-bh-anio]').value),periodicidad:per,semana:per==='SEMANAL'&&sem?Number(sem):null,
   mes:per==='QUINCENAL'?Number(q('[data-bh-mes]').value):null,quincena:per==='QUINCENAL'&&q('[data-bh-quincena]').value?Number(q('[data-bh-quincena]').value):null,concepto:q('[data-bh-concepto]').value};}
  function periodos(){const quin=q('[data-bh-per]').value==='QUINCENAL';q('[data-bh-semana-label]').hidden=quin;q('[data-bh-mes-label]').hidden=!quin;q('[data-bh-quincena-label]').hidden=!quin;}
  periodos();
  let secCalendario=0;
  async function calendario(){
   const api=window.PLATINUM_PERIODOS;if(!api)return;const g=++secCalendario,o=OBRAS.find(o=>o.id===q('[data-bh-obra]').value),an=Number(q('[data-bh-anio]').value),per=q('[data-bh-per]').value;
   if(!api.estricto(o))return;
   q('[data-bh-semana]').innerHTML='<option value="">Varios periodos · resolver por fechas</option>';
   const d=await api.cargar(o.id);if(!actual(v)||g!==secCalendario)return;
   const ps=d.periodos.filter(p=>p.anio===an&&p.periodicidad===per),current=ps.find(p=>o.id===obra.id&&p.semana===Number(opciones.semana))||ps.find(p=>p.desde<=today()&&p.hasta>=today());
   q('[data-bh-semana]').innerHTML='<option value="">Varios periodos · resolver por fechas</option>'+ps.map(p=>`<option value="${p.semana}">${esc(api.etiqueta(o,p))}</option>`).join('');
   q('[data-bh-semana]').value=String(current?.semana||'');
   if(!ps.length)mensaje('No hay periodos NOI documentados para este centro, año y periodicidad. Incorpóralos en Recibos PDF y XML → Calendario NOI; puedes conservar aquí los originales bancarios con su fecha real.');
  }
  async function cargar(){v.contextoSucio=false;mensaje('Validando permisos y contexto…');await v.servicio.abrir(contexto());
   mensaje('Contexto autorizado. Puedes cargar comprobantes; archivos, personas y fuentes se consultan por sección y no bloquean el archivo del original.');}
  const SECCIONES={archivos:'Archivos del periodo',personas:'Personas del centro',fuentes:'Fuentes de conciliación',anteriores:'Originales anteriores'};
  function secciones(s){return '<ul class="fhint" data-bh-secciones style="margin:4px 0 8px;padding-left:18px">'+Object.entries(SECCIONES).filter(([k])=>k!=='anteriores'||s.puede_importar).map(([k,t])=>{const x=s.secciones?.[k]||{};
    const txt=x.estado==='CARGANDO'?'Cargando…':x.estado==='ERROR'?'<span style="color:var(--red)">'+esc(x.error||'Error')+'</span> <button type="button" class="btn" data-bh="reintentar" data-sec="'+k+'">Reintentar</button>':x.estado==='LISTO'?'Listo'+(x.total!=null?' · '+x.total:''):(k==='fuentes'?'Se consultan con el periodo o las fechas del comprobante':'Pendiente');
    return '<li data-bh-sec="'+k+'" data-estado="'+esc(x.estado||'PENDIENTE')+'">'+t+': '+txt+(x.aviso?' <span>'+esc(x.aviso)+'</span>':'')+(x.mas?' <button type="button" class="btn" data-bh="mas" data-sec="'+k+'">Cargar más</button>':'')+'</li>';}).join('')+'</ul>';}
  function pintar(s){
   for(const b of host.querySelectorAll('button,[data-bh-contexto] input,[data-bh-contexto] select'))b.disabled=v.ocupado;
   const archivo=s?.archivo,filas=archivo?.propuesta?.records||[],pre=s?.previa?.filas||[];
   q('[data-bh="previa"]').disabled=v.ocupado||v.contextoSucio||!filas.length;
   q('[data-bh="confirmar"]').disabled=v.ocupado||v.contextoSucio||!s?.previa||!s?.puede_importar;
   if(!s){q('[data-bh-lectura]').innerHTML='';return;}
   q('[data-bh-archivos]').innerHTML=secciones(s)+`<label>PDF globales o individuales<input data-bh-files type="file" accept=".pdf,application/pdf" multiple ${v.ocupado||!s.puede_importar?'disabled':''}></label>
    <label>Continuar archivo archivado<select data-bh-archivo><option value="">Selecciona un original</option>${s.archivos.map(a=>`<option value="${a.id}" ${archivo?.id===a.id?'selected':''}>${esc(a.nombre)} · ${esc(etiqueta(a.estado))}</option>`).join('')}</select></label>${s.puede_importar&&(s.anteriores||[]).length?'<label>Recuperar originales del flujo anterior<select data-bh-anterior><option value="">Selecciona original archivado</option>'+(s.anteriores||[]).map(x=>'<option value="'+x.id+'">'+esc(x.nombre)+'</option>').join('')+'</select></label>':''}`;
   if(!archivo){q('[data-bh-lectura]').innerHTML='<p class="fhint">Selecciona o carga un original para continuar.</p>';return;}
   const pages=archivo.propuesta?.paginas||[],totPag=Math.max(1,Math.ceil(filas.length/50));v.pagina=Math.min(v.pagina,totPag-1);
   const rl=v.servicio.resumenListas?.(),lote=s.lote?.archivo_id===archivo.id?s.lote:null,marcadas=filas.filter(r=>r.seleccionado).length,bloqueo=v.ocupado||!s.puede_importar;
   const global=filas.length?`<div data-bh-global class="card" style="margin:8px 0;padding:8px">
     <label><input type="checkbox" data-bh-todas ${marcadas===filas.length?'checked':''} ${bloqueo?'disabled':''}> Marcar o desmarcar todas (${marcadas} de ${filas.length})</label>
     <button type="button" class="btn dark" data-bh="lote" ${bloqueo||v.contextoSucio||(rl&&!rl.listas.length)?'disabled':''}>Confirmar todas las operaciones listas (${rl?rl.listas.length:'—'})</button>
     <span class="fhint">${rl?`${rl.listas.length} listas y marcadas · ${monto(rl.importe)} · ${rl.desmarcadas} desmarcadas · ${rl.conciliadas} ya conciliadas`:'Se actualizará la vista previa para contar las listas.'}</span>
     ${rl?Object.entries(EXCLUIDAS).map(([k,t])=>rl.excluidas[k].length?`<details data-bh-cat="${k}"><summary>${esc(t)}: ${rl.excluidas[k].length}</summary><ul>${rl.excluidas[k].map(x=>`<li>Operación ${x.fila} · ${esc(x.titular)} · ${esc(etiqueta(x.motivo))}</li>`).join('')}</ul></details>`:'').join(''):''}
     ${lote?`<div data-bh-lote-estado role="status" aria-live="polite"><progress max="${lote.totales.total||1}" value="${lote.totales.procesados}"></progress> ${lote.totales.procesados} de ${lote.totales.total} · ${esc(totalesTexto(lote.totales))}
      ${lote.detenido?`<p class="fhint" data-bh-detenido><b>Lote detenido:</b> ${esc(lote.detenido)}</p>`:''}
      ${lote.totales.FALLIDO&&!lote.en_curso?`<button type="button" class="btn" data-bh="reintentar-fallidas">Reintentar solo fallidas (${lote.totales.FALLIDO})</button>`:''}</div>`:''}
    </div>`:'';
   const filasHtml=filas.slice(v.pagina*50,v.pagina*50+50).map((r,j)=>{const i=v.pagina*50+j,p=pre.find(x=>x.fila===i+1),res=s.resultados.find(x=>x.fila===i+1),f=p?.fuente;
    const ch=p?.cheques.find(c=>c.estatus!=='CANCELADO'),accion=p?.accion_cheque==='CANCELAR_AUTOMATICO'?'Se cancelará automáticamente el pendiente sin folios':p?.accion_cheque==='CONFIRMAR_CANCELACION'?'Requiere confirmar el cheque físico':p?.accion_cheque==='REVISAR_PROCEDIMIENTO'?'Cheque protegido: se conserva':'Sin cambio automático del cheque';
    return `<tr><td><input type="checkbox" data-bh-sel="${i}" ${r.seleccionado?'checked':''} ${v.ocupado||!s.puede_importar?'disabled':''} aria-label="Incluir operación ${i+1}"></td>
     <td><b>${esc(r.titular||'Beneficiario pendiente')}</b><div class="fhint">Beneficiario · cuenta destino ${esc(r.mask?'…'+r.mask:(r.cuenta||'por leer'))} · página ${r.pagina||'—'}</div>${r.ordenante?`<div class="fhint" data-bh-ordenante>Ordenante: ${esc(r.ordenante)}${r.cuenta_origen?' · cuenta …'+esc(String(r.cuenta_origen).slice(-4)):''}</div>`:''}${r.asociacion?.aviso?`<div class="fhint" style="color:var(--amber)">${esc(r.asociacion.aviso)}</div>`:''}
      ${r.evidencia?`<details data-bh-evidencia><summary>Evidencia · página ${r.pagina||'—'}</summary><ul>${Object.entries(CAMPOS_EVIDENCIA).filter(([k])=>r.evidencia[k]).map(([k,t])=>`<li>${t}: <code>${esc(r.evidencia[k])}</code></li>`).join('')}</ul></details>`:''}
      <span class="badge" data-bh-etapa="${i}">${esc(ETAPAS[v.servicio.etapa?.(i)]||'Leído')}</span><button type="button" class="btn" data-bh="resolver" data-i="${i}" ${!s.puede_importar?'disabled':''}>Resolver operación</button></td>
     <td>${esc(r.fecha||'Pendiente')}<br>${esc(r.estado||'Pendiente')}<div class="fhint">${esc(r.folio||'Referencia pendiente')}</div></td><td>${monto(r.importe)}</td>
     <td>${esc(f?.nombre||'Sin obligación vinculada')}<br>${esc(f?.concepto||r.concepto||s.contexto.concepto)}<div class="fhint">${f?`S${f.semana} · ${esc(f.desde)} al ${esc(f.hasta)} · ${esc(f.periodicidad)}`:'Periodo laboral por verificar'}</div>${p?.complemento_prevision?'<div class="fhint">Se aplica también '+monto(Number(r.importe)-Number(p.saldo_fiscal))+' a previsión autorizada, separada del neto fiscal.</div>':''}${f?.fecha_baja?'<div class="fhint">Ciclo '+esc(f.ciclo_desde||'por verificar')+' · baja '+esc(f.fecha_baja)+'</div>':''}</td>
     <td><strong>${esc(etiqueta(res?.estado||p?.estado||'PENDIENTE_DE_VISTA_PREVIA'))}</strong>${res?.explicacion?'<p class="fhint">'+esc(res.explicacion)+'</p>':''}${lote?.filas?.[i+1]?'<p class="fhint" data-bh-lote-fila="'+(i+1)+'">Lote: '+esc(LOTE[lote.filas[i+1].estado]||lote.filas[i+1].estado)+(lote.filas[i+1].motivo?' · '+esc(lote.filas[i+1].motivo):'')+'</p>':''}${p?'<div class="fhint">Saldo anterior: '+monto(p.saldo_antes)+'</div>':''}</td>
     <td>${ch?`Cheque ${esc(ch.num_cheque||'sin número')} · consecutivo ${esc(ch.consecutivo||'sin consecutivo')}<br>${monto(ch.importe)} · ${esc(ch.estatus)}`:'Sin cheque activo'}${p?.pagos_similares?.some(pg=>String(pg.semana).replace(/\D/g,'')!==String(p.periodo.semana))?'<div class="fhint">El pago compatible se vinculará al periodo laboral mostrado si no tiene aplicaciones anteriores.</div>':''}<div class="fhint">${esc(accion)}</div>${p?.pagos_similares?.length?'<div class="fhint">Se reutilizará el pago compatible existente, salvo operación distinta documentada.</div>':''}</td></tr>`;});
   q('[data-bh-lectura]').innerHTML=`<h3>${esc(archivo.nombre)} · ${filas.length} operaciones</h3>
    ${archivo.aviso_lectura||v.servicio.desactualizada?.(archivo)?`<p data-bh-aviso-lector style="color:var(--amber)">${esc(archivo.aviso_lectura||'Lectura de una versión anterior del lector: reprocésala desde el original antes de confirmar.')}</p>`:''}
    <p class="fhint">Lector ${esc(archivo.propuesta?.lector_version||'anterior')}${(archivo.propuesta?.lecturas||[]).length?' · '+archivo.propuesta.lecturas.length+' lectura(s) anterior(es) conservada(s) con su revisión':''} · huella ${esc(String(archivo.sha256||'').slice(0,12))} ${s.puede_importar&&!archivo.padre_id?'<button type="button" class="btn" data-bh="reprocesar">Reprocesar lectura</button>':''}</p>
    ${s.previaCargando||s.previaProgreso?'<p role="status" data-bh-previa-estado="CARGANDO">Asociando beneficiarios y proponiendo obligaciones…'+(s.previaProgreso?.total?' <progress max="'+s.previaProgreso.total+'" value="'+s.previaProgreso.hechas+'"></progress> '+s.previaProgreso.hechas+' de '+s.previaProgreso.total+' operaciones':'')+'</p>':s.previaError?`<p role="alert" data-bh-previa-estado="ERROR" style="color:var(--red)">No se construyó la propuesta: ${esc(s.previaError)} <button type="button" class="btn" data-bh="previa">Reintentar</button></p>`:''}<p class="fhint">Contexto del original: ${esc(archivo.contexto.empresa_codigo)} · ${archivo.contexto.anio} · ${esc(archivo.contexto.periodicidad)} · ${archivo.contexto.semana?'S'+archivo.contexto.semana:'periodos por operación'}</p>${!pages.length&&s.puede_importar?'<button class="btn" data-bh="reanudar">Reintentar lectura del original</button>':''}
    ${(archivo.propuesta?.validacion?.errores||[]).map(e=>'<p style="color:var(--amber)">'+esc(e)+'</p>').join('')}
    ${pages.some(p=>p.pendiente)?'<p style="color:var(--amber)">Hay fragmentos pendientes. Las lecturas correctas se conservan; puedes importar las operaciones revisadas y continuar las demás después.</p>':''}
    <details><summary>Lectura por página y recuperación</summary>${pages.map(p=>`<p>Página ${p.numero} · ${p.records?.length||0} operaciones · ${esc(p.lector||'pendiente')} ${p.error?'<span style="color:var(--red)">'+esc(p.error)+'</span>':''} <button type="button" class="btn" data-bh="completar" data-pagina="${p.numero}">Completar sólo esta página</button></p>`).join('')}</details>
    ${global}<div style="overflow:auto;max-height:48vh">${ctrlTabla(['Incluir','Trabajador leído','Transferencia / referencia','Importe','Obligación propuesta','Resultado','Acción sobre cheque'],filasHtml,'No se reconocieron operaciones. El original permanece archivado.')}</div>
    ${totPag>1?`<div style="display:flex;gap:8px"><button type="button" class="btn" data-bh="pagina" data-page="${v.pagina-1}" ${v.pagina===0?'disabled':''}>Anterior</button><span>${v.pagina+1} de ${totPag}</span><button type="button" class="btn" data-bh="pagina" data-page="${v.pagina+1}" ${v.pagina+1===totPag?'disabled':''}>Siguiente</button></div>`:''}`;   const todas=q('[data-bh-todas]');if(todas)todas.indeterminate=marcadas>0&&marcadas<filas.length;
  }
  // Resolver operación: el diálogo abre de inmediato con progreso; se validan fila y opciones antes de usarlas; un fallo queda
  // visible en el mismo diálogo con reintento; guardar persiste la corrección, recalcula la vista previa y actualiza la fila.
  // Las respuestas que llegan para otro original o después de cerrar el diálogo se descartan.
  async function resolver(i){
   const s0=v.servicio.estado(),archivoId=s0?.archivo?.id,id='bh-resolver-'+contador+'-'+i+'-'+(++secResolver);
   modal2(`<div class="m-head"><h2>Resolver operación ${i+1}</h2><button class="x" onclick="closeModal2()">×</button></div><div class="m-body" id="${id}" data-br-estado="CARGANDO"><p role="status">Obteniendo la vista previa de obligaciones…</p></div><div class="m-foot" data-br-pie><button type="button" class="btn" onclick="closeModal2()">Cerrar</button></div>`,'md');
   const box=$(id);if(!box)throw Error('No se pudo abrir el diálogo de resolución.');
   const vigenteDialogo=()=>box.isConnected&&actual(v)&&v.servicio.estado()?.archivo?.id===archivoId;
   const fallo=msg=>{if(!box.isConnected)return;box.dataset.brEstado='ERROR';box.innerHTML=`<p role="alert" style="color:var(--red)">${esc(msg)}</p><button type="button" class="btn" data-br-reintentar>Reintentar</button>`;
    box.querySelector('[data-br-reintentar]').onclick=()=>{closeModal2();resolver(i).catch(e=>mensaje(e.message));};};
   try{const s=v.servicio.estado();if(!s?.archivo)throw Error('Selecciona un original antes de resolver.');if(!s.previa||s.previa.revision!==s.archivo.revision||!s.previa.filas.some(x=>x.fila===i+1))await v.servicio.previaFila(i);}
   catch(e){fallo('No se obtuvo la vista previa: '+e.message);return;}
   if(!vigenteDialogo())return;
   const s=v.servicio.estado(),r=s.archivo.propuesta?.records?.[i],p=s.previa?.filas?.find(x=>x.fila===i+1);
   if(!r){fallo('La operación ya no existe en la lectura vigente. Reprocesa la lectura o reintenta.');return;}
   if(!p){fallo('La vista previa no devolvió esta operación. Reintenta o reprocesa la lectura.');return;}
   const op=Array.isArray(p.opciones)?p.opciones:[],similares=Array.isArray(p.pagos_similares)?p.pagos_similares:[];
   const personas=[...(s.personas||[])].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre))),actualW=r.trabajador_id||p.trabajador_id||'';
   box.dataset.brEstado='LISTO';
   box.innerHTML=`<p>Original: ${esc(s.archivo.nombre)} · página ${r.pagina||'—'} · ${esc(etiqueta(p.estado))}${p.explicacion?' · '+esc(p.explicacion):''}. La obligación fija el centro, ciclo y periodo; la fecha bancaria se conserva.</p>
    <p class="fhint">Beneficiario leído: <b>${esc(r.titular||'pendiente')}</b>${r.ordenante?' · ordenante: '+esc(r.ordenante):''}${r.asociacion?.aviso?' · '+esc(r.asociacion.aviso):''}</p>
    <label>Trabajador (beneficiario)<select data-br-trabajador><option value="">Sin trabajador · conservar pendiente</option>${personas.map(w=>`<option value="${esc(w.id)}" ${w.id===actualW?'selected':''}>${esc(w.nombre)}${w.numero!=null?' · #'+esc(w.numero):''}${w.cuenta?' · cuenta …'+esc(String(w.cuenta).replace(/\D/g,'').slice(-4)):''}</option>`).join('')}</select></label>
    <label>Obligación histórica<select data-br-fuente><option value="">Sin obligación · conservar vínculo pendiente</option>${op.map(f=>`<option value="${esc(f.clave)}" ${(r.fuente_clave||p.fuente?.clave)===f.clave?'selected':''}>${esc(f.nombre)} · S${esc(f.semana)} · ${esc(f.concepto)} · ${monto(f.importe)} · ${esc(f.desde)} / ${esc(f.hasta)}</option>`).join('')}</select></label>
    ${op.length?'':'<p class="fhint" data-br-sin-obligacion>No hay obligación aprobada compatible para este periodo. Al confirmar, el pago se registra con vinculación pendiente.</p>'}
    <div class="grid" style="grid-template-columns:1fr 1fr"><label>Titular (beneficiario)<input data-br-titular value="${esc(r.titular||'')}"></label><label>Cuenta destino / máscara<input data-br-cuenta value="${esc(r.cuenta||r.mask||'')}"></label>
     <label>Fecha real de transferencia<input type="date" data-br-fecha value="${esc(r.fecha||'')}"></label><label>Referencia bancaria<input data-br-folio value="${esc(r.folio||'')}"></label>
     <label>Importe de la operación<input type="number" min=".01" step=".01" data-br-importe value="${r.importe??''}"></label><label>Estado bancario<select data-br-estado>${['EXITOSO','RECHAZADO','PENDIENTE'].map(e=>`<option ${e===r.estado?'selected':''}>${e}</option>`).join('')}</select></label></div>
    <label><input type="checkbox" data-br-identidad ${r.confirmar_identidad?'checked':''}> He cotejado la identidad y la cuenta contra el original</label><label>Referencia del cotejo de identidad<input data-br-ref value="${esc(r.referencia_identidad||'')}"></label>
    ${similares.length?'<label>Pago compatible existente<select data-br-pago><option value="">Reutilizar automáticamente el compatible único</option>'+similares.map(x=>`<option value="${esc(x.id)}" ${r.pago_existente_id===x.id?'selected':''}>${esc(x.folio_lote||'sin referencia')} · ${monto(x.importe)} · ${esc(x.fecha_pago)}</option>`).join('')+'</select></label><label><input type="checkbox" data-br-distinto '+(r.confirmar_pago_distinto?'checked':'')+'> Es otra transferencia distinta, respaldada por referencia diferente</label><label>Referencia del soporte de la operación distinta<input data-br-distinto-ref value="'+esc(r.referencia_distinta||'')+'"></label>':''}
    <p data-br-mensaje role="status" class="fhint">Las correcciones se guardan como revisión de lectura. El archivo original no cambia.</p>`;
   const pie=box.parentElement.querySelector('[data-br-pie]');pie.innerHTML='<button type="button" class="btn" onclick="closeModal2()">Cancelar</button><button type="button" class="btn dark" data-br-guardar>Guardar y revisar</button>';
   const b=x=>box.querySelector(x),guardarBtn=pie.querySelector('[data-br-guardar]');
   guardarBtn.onclick=async()=>{const msg=b('[data-br-mensaje]');
    try{const f=op.find(f=>f.clave===b('[data-br-fuente]').value),w=b('[data-br-trabajador]').value||null;
     if(f&&w&&f.trabajador_id&&f.trabajador_id!==w)throw Error('La obligación elegida pertenece a otra persona.');
     const c={fuente_clave:f?.clave||null,trabajador_id:f?.trabajador_id||w,concepto:f?.concepto||r.concepto,semana:f?.semana||r.semana,titular:b('[data-br-titular]').value.trim(),cuenta:b('[data-br-cuenta]').value.trim(),mask:b('[data-br-cuenta]').value.replace(/\D/g,'').slice(-4),
      fecha:b('[data-br-fecha]').value,folio:b('[data-br-folio]').value.trim(),importe:Number(b('[data-br-importe]').value),estado:b('[data-br-estado]').value,
      confirmar_identidad:b('[data-br-identidad]').checked,referencia_identidad:b('[data-br-ref]').value.trim(),pago_existente_id:b('[data-br-pago]')?.value||null,
      confirmar_pago_distinto:!!b('[data-br-distinto]')?.checked,referencia_distinta:b('[data-br-distinto-ref]')?.value||'',seleccionado:true,
      asociacion:w?{estado:'CONFIRMADA_MANUAL',trabajador_id:w,metodo:'RESOLVER_OPERACION'}:r.asociacion||null};
     if(p.estado==='DUPLICADO_EN_ARCHIVO'){if(!confirm('Hay otra fila idéntica en este archivo. ¿Confirmas que representa la misma operación y debe reutilizarse? Para dos operaciones distintas captura sus referencias diferentes.'))return;c.confirmar_duplicado=true;}
     core.centavos(c.importe);guardarBtn.disabled=true;msg.style.color='';msg.textContent='Guardando la corrección y recalculando la propuesta…';
     await v.servicio.editar(i,c);await v.servicio.revisar();if(!vigenteDialogo())return;
     const n=v.servicio.estado().previa?.filas?.find(x=>x.fila===i+1);closeModal2();mensaje('Operación '+(i+1)+' actualizada: '+etiqueta(n?.estado||'PENDIENTE_DE_VISTA_PREVIA')+'.');
    }catch(e){if(!box.isConnected)return;guardarBtn.disabled=false;msg.style.color='var(--red)';msg.textContent='No se guardó: '+e.message+' Corrige y vuelve a intentar.';}};
  }
  host.addEventListener('change',async e=>{if(!actual(v)||v.ocupado)return;try{
   if(e.target.closest('[data-bh-contexto]')){if(e.target.matches('[data-bh-empresa]'))centros();if(e.target.matches('[data-bh-per]'))periodos();v.contextoSucio=true;mensaje('Cambió el contexto. Pulsa Cargar contexto y archivos antes de continuar.');q('[data-bh="previa"]').disabled=true;q('[data-bh="confirmar"]').disabled=true;const fi=q('[data-bh-files]');if(fi)fi.disabled=true;
    if(e.target.matches('[data-bh-empresa],[data-bh-obra],[data-bh-anio],[data-bh-per]'))await calendario();}
   if(e.target.matches('[data-bh-files]')){mensaje('Archivando y leyendo los originales…');const r=await v.servicio.subir([...e.target.files]);mensaje(r.some(x=>x.error)?'Hay archivos pendientes; revisa su detalle.':'Originales y lecturas guardados. Revisa cada operación antes de confirmar.');}
   if(e.target.matches('[data-bh-anterior]')&&e.target.value)await v.servicio.recuperar(e.target.value);
   if(e.target.matches('[data-bh-archivo]')&&e.target.value)await v.servicio.seleccionar(e.target.value);
   if(e.target.matches('[data-bh-todas]')){mensaje(e.target.checked?'Marcando todas las operaciones…':'Desmarcando todas las operaciones…');await v.servicio.marcarTodas(e.target.checked);mensaje(e.target.checked?'Todas las operaciones quedaron marcadas.':'Todas las operaciones quedaron desmarcadas.');}
   if(e.target.matches('[data-bh-sel]'))await v.servicio.editar(Number(e.target.dataset.bhSel),{seleccionado:e.target.checked});
  }catch(err){mensaje(err.message);}});
  host.addEventListener('click',async e=>{const b=e.target.closest('[data-bh]');if(!b||!actual(v)||v.ocupado)return;try{
   const a=b.dataset.bh;
   if(a==='cerrar'){v.servicio.cerrar();vista=null;closeModal();return;}
   if(a==='reprocesar'){mensaje('Reprocesando la lectura desde el original archivado…');await v.servicio.reprocesar();mensaje('Lectura reprocesada con el lector vigente; asociación y propuesta actualizadas.');return;}
   if(a==='contexto')return await cargar();if(a==='reintentar')return await v.servicio.reintentar(b.dataset.sec);if(a==='mas')return await v.servicio.mas(b.dataset.sec);if(a==='previa')return await v.servicio.revisar();if(a==='resolver')return await resolver(Number(b.dataset.i));
   if(a==='reanudar')return await v.servicio.reanudar();if(a==='completar')return await v.servicio.completar(Number(b.dataset.pagina));if(a==='pagina'){v.pagina=Number(b.dataset.page);return pintar(v.servicio.estado());}
   if(a==='lote'){
    let r=v.servicio.resumenListas();if(!r){mensaje('Actualizando la vista previa…');await v.servicio.revisar();r=v.servicio.resumenListas();}
    if(!r?.listas.length)throw Error('No hay operaciones listas y marcadas para confirmar. Revisa las excluidas y su motivo.');
    const fuera=Object.entries(EXCLUIDAS).map(([k,t])=>r.excluidas[k].length?`\n${t}: ${r.excluidas[k].length}`:'').join('');
    if(!confirm(`Se confirmarán ${r.listas.length} operación(es) listas por ${monto(r.importe)}, con la misma conciliación que «Confirmar importación y conciliación».`+(r.vinculo_pendiente?`\nDe ellas, ${r.vinculo_pendiente} se registrarán con vinculación pendiente (persona identificada, sin obligación aprobada para su periodo); podrás vincularlas después.`:'')+(r.desmarcadas?`\nDesmarcadas por ti: ${r.desmarcadas}.`:'')+(fuera?`\nNo se incluyen:${fuera}`:'')+`\nCada operación conserva la revalidación de obligación, identidad, importe y cheque. Ningún cheque se cancela sin tu decisión individual.\n¿Continuar sin preguntar por cada operación?`))return;
    const l=await v.servicio.confirmarListas();mensaje((l.detenido?'Lote detenido: '+l.detenido+' · ':'Lote terminado · ')+totalesTexto(l.totales));return;
   }
   if(a==='reintentar-fallidas'){const l=await v.servicio.reintentarFallidas();mensaje((l.detenido?'Lote detenido: '+l.detenido+' · ':'Reintento terminado · ')+totalesTexto(l.totales));return;}
   if(a==='confirmar'){
    const s=v.servicio.estado(),cs=[];
    for(const p of s.previa.filas){if(!s.archivo.propuesta.records[p.fila-1].seleccionado)continue;const c={fila:p.fila,huella:p.huella};
     if(p.accion_cheque==='CONFIRMAR_CANCELACION'){const q=p.cheques.find(q=>q.estatus!=='CANCELADO');c.cheque_id=q.id;c.cheque_huella=p.cheque_huella;
      c.decision=confirm(`Este finiquito tiene el cheque ${q.num_cheque||'sin número'}, consecutivo ${q.consecutivo||'sin consecutivo'}, por ${monto(q.importe)}, en estado ${q.estatus}. La transferencia ${s.archivo.propuesta.records[p.fila-1].folio||'sin referencia'} corresponde al mismo trabajador y periodo.\n\nAceptar: confirmar cancelación y conciliar.\nCancelar: conservar cheque y dejar por revisar.\nEsta cancelación interna no realiza gestiones ante el banco.`)?'CANCELAR':'CONSERVAR';
     }cs.push(c);
    }
    if(!cs.length)throw Error('Selecciona las operaciones a importar');
    if(!confirm(`¿Confirmas incorporar ${cs.length} operación(es) con las acciones mostradas? Las no conciliables conservarán su vínculo pendiente.`))return;
    await v.servicio.confirmar(cs);mensaje('Resultado guardado. Los conflictos y parciales quedan visibles para retomarlos.');
   }
  }catch(err){mensaje(err.message);toast(err.message,'err');}});
  try{await calendario();await cargar();if(opciones.archivo_id)await v.servicio.seleccionar(opciones.archivo_id);if(opciones.original){await v.servicio.subir([opciones.original]);}}catch(e){mensaje(e.message);}
 }
 window.PLATINUM_IMPORTACION_BANCARIA=Object.freeze({abrir,estaCapturando:()=>!!vista?.servicio.ocupado(),desmontar:()=>{vista?.servicio.cerrar();vista=null;}});
})();
