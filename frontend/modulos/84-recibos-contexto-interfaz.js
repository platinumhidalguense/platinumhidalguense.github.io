/* Superficie única del archivo fiscal: el cierre es un vínculo posterior opcional. */
(function(root){
 'use strict';let vista=null,secuencia=0;
 const recuperacionTexto=r=>`Evidencia fiscal del periodo: ${r.procesados} de ${r.total}${r.en_curso?' en curso':''} · ${r.verificados} XML verificados · ${r.revalidados} originales revalidados · ${r.releidos} XML sin timbre (neto 0) releídos${r.pendientes.length?' · '+r.pendientes.length+' sin resolver':''}`;
 const CATEGORIAS={LECTURA:'Pendientes de lectura',DISCREPANCIA:'Con discrepancias',ERROR:'Con error',DUPLICADO:'Duplicados'},
  RESULTADO={CONFIRMADO:'Confirmado',YA_EXISTENTE:'Ya existente',FALLIDO:'Fallido',PENDIENTE:'Pendiente',PROCESANDO:'Procesando'};
 const totalesTexto=t=>`Confirmados ${t.CONFIRMADO} · ya existentes ${t.YA_EXISTENTE} · fallidos ${t.FALLIDO} · pendientes ${t.PENDIENTE}`;
 function resumenTexto(r){
  return `Se confirmará el registro documental de ${r.listos.length} original(es) listos (${r.cfdi} CFDI; PDF y XML del mismo UUID quedan como un solo comprobante).`+
   (r.omitidos?`\nExcluidos por ti: ${r.omitidos}.`:'')+Object.entries(CATEGORIAS).map(([k,t])=>r.excluidos[k].length?`\n${t} (no se incluyen): ${r.excluidos[k].length}`:'').join('')+
   '\nCada registro conserva sus validaciones de identidad, emisor, periodo, importe, documento y permisos. No autoriza nómina, no timbra y no registra pagos.\n¿Continuar sin preguntar por cada fila?';
 }
 const etiquetas={VALIDO:'Identidad y periodo listos para confirmar',REVISAR:'Revisión pendiente',CONFLICTO:'Lectura o vínculo pendiente',ARCHIVADO:'Registrado · evidencia fiscal pendiente',VERIFICADO:'Timbrado verificado · cotejo y pago separados',RECIBIENDO:'Recibiendo original',PENDIENTE:'Lectura pendiente',FALLO:'No se completó',VINCULADO:'Vínculo documental registrado',VINCULO_PROPUESTO:'Compatible con la fotografía'};
 function panelVisual(f){
  if(!f.imagen_recuperacion?.blob)return '';
  f.imagen_url??=URL.createObjectURL(f.imagen_recuperacion.blob);
  return `<details><summary>Región del original y excepción de lectura</summary><img src="${esc(f.imagen_url)}" alt="Región real del recibo para cotejo" style="max-width:100%;max-height:420px;object-fit:contain"><p>La propuesta se conserva por campo y huella. No cambia la ficha del trabajador.</p>
   ${f.region_recuperacion_id?`${f.propuestas_visuales?.length?`<button class="btn" data-rl="confirmar-visual" data-id="${esc(f.id)}">Confirmar lectura de esta imagen</button>`:''}
    <details><summary>Transcribir campos ilegibles una sola vez</summary><p>Transcribe únicamente lo que puedas ver. Fechas AAAA-MM-DD; neto con dos decimales. Deja vacíos los campos que no puedas comprobar.</p>
     ${(f.campos_recuperacion||[]).map(k=>`<label>${esc(k)}<input data-rl-visual="${esc(f.id)}" data-campo="${esc(k)}" maxlength="110"></label>`).join('')}
     <button class="btn" data-rl="transcribir-visual" data-id="${esc(f.id)}">Confirmar transcripción del recorte</button></details>`:'<p>La imagen no pudo archivarse o autorizarse. Reintenta la lectura antes de confirmar una corrección.</p>'}</details>`;
 }
 async function abrir(opciones={}){
  if(vista?.servicio.ocupado()){toast('Termina la carga en curso antes de cambiar de periodo.','err');return;}
  if(root.PLATINUM_CONCILIADOR?.estaCapturando()){toast('Termina la captura en curso del Conciliador.','err');return;}
  if(!USER||!OBRA)return;vista?.servicio.cerrar();
  const inicial=OBRAS.find(o=>o.id===opciones.obra_id)||OBRA,uid=USER.id,id='recibo-libre-'+(++secuencia);
  const empresa=o=>String(o.empresa_codigo||empresaDeObra(o)||'');
  // Desde la baja: abre el centro de la ficha (su razón social) en el periodo que contiene la fecha del pago anterior.
  const fechaInicial=/^\d{4}-\d{2}-\d{2}$/.test(opciones.fecha||'')?opciones.fecha:null;
  const semanaFecha=()=>{try{const n=isoWeekDe(inicial,new Date(fechaInicial+'T12:00'));return n>0?n:null;}catch(e){return null;}};
  modal(`<section id="${id}" style="display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden">
   <div class="m-head"><h2>Recibos PDF y XML · archivo por periodo</h2><button class="x" data-rl="cerrar" aria-label="Cerrar">×</button></div>
   <div class="m-body" style="min-height:0;overflow:auto">${opciones.volver==='baja'?`<p class="fhint" data-rl-desde-baja role="note"><b>Desde la baja:</b> ${esc(opciones.aviso||'Archiva y verifica el XML timbrado del pago anterior; después pulsa «Volver» para recalcular la baja.')}</p>`:''}<p>Archiva y revisa recibos actuales o históricos, incluso sin fotografía. Este proceso no autoriza nómina ni registra pagos.</p>
    <div class="grid" data-rl-contexto style="grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px">
     <label>Empresa<select data-rl-empresa>${[...new Set(OBRAS.map(empresa))].map(e=>`<option value="${esc(e)}" ${e===empresa(inicial)?'selected':''}>${esc(EMPRESAS[e]?.corto||e)}</option>`).join('')}</select></label>
     <label>Centro<select data-rl-obra></select></label><label>Año<input type="number" min="2020" max="2100" data-rl-anio value="${Number(opciones.anio)||(fechaInicial?Number(fechaInicial.slice(0,4)):new Date().getFullYear())}"></label>
     <label>Periodicidad<select data-rl-per><option value="SEMANAL" ${opciones.periodicidad!=='QUINCENAL'?'selected':''}>Semanal</option><option value="QUINCENAL" ${opciones.periodicidad==='QUINCENAL'?'selected':''}>Quincenal</option></select></label>
     <label data-rl-semana-label>Semana<input data-rl-semana type="number" min="1" max="53" value="${Number(opciones.semana)||(fechaInicial&&semanaFecha())||semObra()}"></label>
     <label data-rl-mes-label hidden>Mes<input data-rl-mes type="number" min="1" max="12" value="${Number(opciones.mes)||new Date().getMonth()+1}"></label>
     <label data-rl-quin-label hidden>Quincena<select data-rl-quin><option value="1" ${Number(opciones.quincena)!==2?'selected':''}>Primera</option><option value="2" ${Number(opciones.quincena)===2?'selected':''}>Segunda</option></select></label>
     <label data-rl-cal-label hidden>Calendario NOI<select data-rl-cal></select></label>
    </div><button class="btn" data-rl="contexto" style="margin:10px 0">Cargar periodo y archivos</button>
    <details data-rl-cal-nuevo ${opciones.calendario?'open':''}><summary>Calendario NOI · incorporar un periodo documentado</summary>
     <p>Conserva el número y las fechas del reporte NOI. No uses el folio fiscal ni la fecha de timbrado como número de periodo.</p>
     <div class="grid"><label>Número NOI<input data-rl-noi type="number" min="1" max="999"></label><label>Desde<input data-rl-desde type="date"></label><label>Hasta<input data-rl-hasta type="date"></label>
     <label>Clave operativa compatible (1–53)<input data-rl-clave type="number" min="1" max="53"></label><label>Reporte o confirmación que acredita las fechas<input data-rl-fuente maxlength="240"></label></div>
     <p class="fhint">Si ya existe una fotografía, conserva su clave operativa. La incorporación no renumera pagos ni cambia fotografías. Los periodos extraordinarios se documentan aparte.</p>
     <button class="btn" data-rl="incorporar-periodo">Revisar e incorporar periodo</button>
    </details>
    <p data-rl-fechas class="fhint"></p><p data-rl-mensaje role="status" aria-live="polite">Preparando contexto…</p>
    <div data-rl-entrada></div><div data-rl-lista></div>
   </div><div class="m-foot"><button class="btn" data-rl="cerrar">${opciones.volver?'Volver':'Cerrar'}</button><button class="btn" data-rl="bancos">Importar pagos bancarios</button><button class="btn" data-rl="fotografia">Archivo por fotografía</button></div></section>`,'xl');
  const host=$(id),q=s=>host.querySelector(s),v={host,opciones,usuario:uid,sucio:false,pagina:0,ocupado:false,excluir:new Set()};vista=v;
  const actual=()=>vista===v&&USER?.id===uid&&host.isConnected;
  const mensaje=t=>{if(actual())q('[data-rl-mensaje]').textContent=t;};
  const ctx=()=>({empresa_codigo:q('[data-rl-empresa]').value,anio:Number(q('[data-rl-anio]').value),periodicidad:q('[data-rl-per]').value,
   semana:q('[data-rl-per]').value==='SEMANAL'?Number(q('[data-rl-semana]').value):null,mes:q('[data-rl-per]').value==='QUINCENAL'?Number(q('[data-rl-mes]').value):null,quincena:q('[data-rl-per]').value==='QUINCENAL'?Number(q('[data-rl-quin]').value):null,
   ...(q('[data-rl-cal]').value?{periodo_id:q('[data-rl-cal]').value}:{})});
  let secCalendario=0;
  function seleccionarPeriodo(p){if(!p)return;q('[data-rl-semana]').value=p.semana;if(p.mes)q('[data-rl-mes]').value=p.mes;if(p.quincena)q('[data-rl-quin]').value=p.quincena;}
  async function catalogo(preferido=null){
   const api=root.PLATINUM_PERIODOS;if(!api)return;const g=++secCalendario,o=OBRAS.find(o=>o.id===q('[data-rl-obra]').value),anio=Number(q('[data-rl-anio]').value);let per=q('[data-rl-per]').value;
   q('[data-rl-cal]').innerHTML='';q('[data-rl-cal-label]').hidden=!api.estricto(o);
   const d=await api.cargar(o.id);if(!actual()||g!==secCalendario)return;
   const disponibles=[...new Set(d.periodos.filter(p=>p.anio===anio).map(p=>p.periodicidad))];if(api.estricto(o)&&!disponibles.includes(per)&&disponibles.length===1){per=disponibles[0];q('[data-rl-per]').value=per;periodos();}
   const ps=d.periodos.filter(p=>p.anio===anio&&p.periodicidad===per),p=ps.find(p=>p.periodo_id===preferido)||ps.find(p=>o.id===inicial.id&&fechaInicial&&p.desde<=fechaInicial&&p.hasta>=fechaInicial)||ps.find(p=>o.id===inicial.id&&p.semana===Number(opciones.semana))||ps.find(p=>o.id===inicial.id&&p.numero_noi===Number(opciones.semana))||ps.find(p=>p.desde<=today()&&p.hasta>=today());
   q('[data-rl-cal]').innerHTML='<option value="">Selecciona un periodo documentado</option>'+ps.map(p=>`<option value="${esc(p.periodo_id)}">${esc(api.etiqueta(o,p))}</option>`).join('');
   q('[data-rl-cal]').value=p?.periodo_id||'';if(api.estricto(o)){seleccionarPeriodo(p);if(!p)q('[data-rl-semana]').value='';}
   q('[data-rl-semana]').disabled=api.estricto(o);q('[data-rl-mes]').disabled=api.estricto(o);q('[data-rl-quin]').disabled=api.estricto(o);
  }
  function centros(preferido){q('[data-rl-obra]').innerHTML=OBRAS.filter(o=>empresa(o)===q('[data-rl-empresa]').value).map(o=>`<option value="${esc(o.id)}" ${o.id===preferido?'selected':''}>${esc(o.nombre)}</option>`).join('');}
  function periodos(){const quin=q('[data-rl-per]').value==='QUINCENAL';q('[data-rl-semana-label]').hidden=quin;q('[data-rl-mes-label]').hidden=!quin;q('[data-rl-quin-label]').hidden=!quin;}
  centros(inicial.id);periodos();
  v.servicio=root.PLATINUM_RECIBOS_CONTEXTO.crear({vigente:actual,rpc:(...a)=>sb.rpc(...a),get storage(){return sb.storage;},hash:sha256Hex,
   leer:f=>root.PLATINUM_ARCHIVO_RECIBOS.leerArchivo(f,{sinTimbreNetoCero:true}),actualizar:root.PLATINUM_ARCHIVO_RECIBOS.actualizarDatos,archivo:(b,n)=>new File([b],n,{type:b.type}),
   vision:body=>sb.functions.invoke('gemini-extract',{body}),
   verificar:body=>sb.functions.invoke('lectura-documental',{body}),fragmento:(body,signal)=>sb.functions.invoke('gemini-extract',{body,signal}),usuario:()=>uid,
   incorporar:(f,x)=>{root.PLATINUM_CAMPOS_RECIBO.incorporar(f.lectura,x,root.PLATINUM_RESPALDO_RECIBO);root.PLATINUM_ARCHIVO_RECIBOS.actualizarDatos(f);},
   cambio:(s,busy)=>{v.ocupado=busy;if(actual())pintar(s);}});
  function pintar(s){
   for(const b of host.querySelectorAll('button,[data-rl-contexto] input,[data-rl-contexto] select'))b.disabled=v.ocupado;
   if(root.PLATINUM_PERIODOS?.estricto(OBRAS.find(o=>o.id===q('[data-rl-obra]').value)))for(const sel of ['[data-rl-semana]','[data-rl-mes]','[data-rl-quin]'])q(sel).disabled=true;
   const c=s?.contexto;
   q('[data-rl-fechas]').textContent=c?.desde?`${c.periodicidad} · ${c.numero_noi?'Periodo NOI '+c.numero_noi+' · ':''}${c.desde} al ${c.hasta} · ${s.cierres.length?'Fotografía disponible para proponer vínculo':'Sin cierre · archivo independiente'}`:'';
   q('[data-rl-entrada]').innerHTML=s?`<label>PDF o XML individuales<input data-rl-files type="file" accept=".pdf,.xml" multiple ${v.ocupado||v.sucio||!s.escritura?'disabled':''}></label>`:'';
   const files=s?.archivos||[],total=Math.max(1,Math.ceil(files.length/50));v.pagina=Math.min(v.pagina,total-1);
   const res=s?.escritura&&v.servicio?.resumen?v.servicio.resumen([...v.excluir]):null,elegibles=new Set(res?v.servicio.resumen([]).listos:[]),lote=s?.lote;
   const panel=res&&(elegibles.size||lote)?`<div data-rl-lote class="card" style="margin:8px 0;padding:8px">
     <label><input type="checkbox" data-rl-todas ${elegibles.size&&![...v.excluir].some(x=>elegibles.has(x))?'checked':''} ${v.ocupado?'disabled':''}> Marcar o desmarcar todas las elegibles (${elegibles.size-[...v.excluir].filter(x=>elegibles.has(x)).length} de ${elegibles.size})</label>
     <button class="btn dark" data-rl="lote" ${res.listos.length&&!v.sucio?'':'disabled'}>Confirmar todos los registros listos (${res.listos.length})</button>
     <span class="fhint">${res.cfdi} CFDI · ${res.omitidos} excluidos por ti · ${res.registrados} ya registrados</span>
     ${Object.entries(CATEGORIAS).map(([k,t])=>res.excluidos[k].length?`<details data-rl-cat="${k}"><summary>${esc(t)}: ${res.excluidos[k].length}</summary><ul>${res.excluidos[k].map(x=>`<li>${esc(x.nombre)} · ${esc(x.motivo)}</li>`).join('')}</ul></details>`:'').join('')}
     ${lote?`<div data-rl-lote-estado role="status" aria-live="polite"><progress max="${lote.totales.total||1}" value="${lote.totales.procesados}"></progress> ${lote.totales.procesados} de ${lote.totales.total} · ${esc(totalesTexto(lote.totales))}
      ${lote.detenido?`<p class="fhint" data-rl-detenido><b>Lote detenido:</b> ${esc(lote.detenido)}</p>`:''}
      ${lote.totales.FALLIDO&&!lote.en_curso?`<button class="btn" data-rl="reintentar-fallidos">Reintentar solo fallidos (${lote.totales.FALLIDO})</button>`:''}</div>`:''}
    </div>`:'';
   const rec=s?.recuperacion,porRecuperar=s?.escritura&&v.servicio?.pendientesRecuperacion?v.servicio.pendientesRecuperacion():0;
   const recuperacion=rec||porRecuperar?`<div data-rl-recuperacion class="card" role="status" aria-live="polite" style="margin:8px 0;padding:8px">
     ${rec?`<progress max="${rec.total||1}" value="${rec.procesados}"></progress> ${esc(recuperacionTexto(rec))}
      ${rec.pendientes.length?`<details><summary>Sin resolver: ${rec.pendientes.length}</summary><ul>${rec.pendientes.map(x=>`<li>${esc(x.nombre)} · ${esc(x.motivo)}</li>`).join('')}</ul></details>`:''}`:''}
     ${porRecuperar&&!rec?.en_curso?`<button class="btn" data-rl="recuperar">Verificar evidencia fiscal pendiente (${porRecuperar})</button>`:''}</div>`:'';
   q('[data-rl-lista]').innerHTML=recuperacion+panel+`<div class="cg-table" style="overflow:auto;max-height:48vh"><table><thead><tr><th>Original</th><th>Trabajador / periodo leído</th><th>Neto / UUID</th><th>Resultado y acciones</th></tr></thead><tbody>${files.slice(v.pagina*50,v.pagina*50+50).map(f=>{
    const d=f.datos||{},r=d.resultado||f,trab=r.trabajador||'Identidad por revisar';
    const fuera=!f.documento_id&&f.id&&/^\d{4}-\d{2}-\d{2}$/.test(d.desde||'')&&/^\d{4}-\d{2}-\d{2}$/.test(d.hasta||'')&&s.contexto?.desde&&(d.desde<s.contexto.desde||d.hasta>s.contexto.hasta);
    const sug=(f.contexto_sugerido||r.contexto_sugerido);
    return `<tr><td>${esc(d.nombre||f.file?.name||'Original')}<br><button class="btn" data-rl="original" data-id="${esc(f.id||'')}" ${!f.id?'disabled':''}>Ver original</button></td>
     <td>${esc(trab)}<br>${esc(d.desde||'—')} al ${esc(d.hasta||'—')} · ${esc(d.concepto||'concepto pendiente')}</td><td>${d.neto==null?'—':'$'+esc(d.neto)}<br><small>${esc(d.uuid||'')}</small>${d.sin_timbre?'<br><small data-rl-sin-timbre>XML sin timbre · neto 0: constancia de periodo sin pago, sin efecto fiscal</small>':''}</td>
     <td><p role="status" aria-live="polite">${esc(f.asistencia?.texto||'')}</p><b>${esc(etiquetas[f.estado]||f.estado)}</b>
      ${elegibles.has(f.id)?`<label class="fhint"><input type="checkbox" data-rl-incluir="${esc(f.id)}" ${v.excluir.has(f.id)?'':'checked'} ${v.ocupado?'disabled':''}> Incluir en confirmación global</label>`:''}
      ${(f.lectura?.avisos_hibridos||d.avisos_hibridos||[]).map(x=>`<p class="fhint">${esc(x)}</p>`).join('')}
      ${panelVisual(f)}
      ${(f.lectura?.evidencia_hibrida||d.evidencia_hibrida||[]).length?`<details><summary>Fuentes complementarias por campo</summary>${(f.lectura?.evidencia_hibrida||d.evidencia_hibrida).map(x=>`<p>${esc(x.campo)} · ${esc(x.metodo)} · ${esc(x.valor_normalizado)} · página ${esc(x.pagina||'XML')} · ${esc(x.resultado||'Cotejo pendiente')}</p>`).join('')}</details>`:''}
      ${lote?.filas?.[f.id]?`<p class="fhint" data-rl-resultado="${esc(f.id)}">Lote: ${esc(RESULTADO[lote.filas[f.id].estado]||lote.filas[f.id].estado)}${lote.filas[f.id].motivo?' · '+esc(lote.filas[f.id].motivo):''}${lote.filas[f.id].aviso?' · '+esc(lote.filas[f.id].aviso):''}</p>`:''}<p class="fhint">${esc(f.motivo||d.resultado?.motivo||d.motivo||'')}</p>
      ${s.escritura?`<button class="btn" data-rl="releer" data-id="${esc(f.id||'')}" ${!f.id?'disabled':''}>Releer original</button>
       ${f.documento_id&&!d.sin_timbre?`<button class="btn" data-rl="verificar" data-id="${esc(f.id)}">Verificar timbrado</button>`:r.estado==='VALIDO'||f.estado==='VALIDO'?`<button class="btn dark" data-rl="confirmar" data-id="${esc(f.id)}">Confirmar registro</button>`:''}
       ${fuera?`<p class="fhint" data-rl-fuera="${esc(f.id)}">Las fechas del comprobante (${esc(d.desde)} al ${esc(d.hasta)}) no están en este periodo${sug?.desde?'; corresponden a '+(sug.periodicidad==='SEMANAL'?'S'+esc(sug.semana):esc(sug.mes)+'/Q'+esc(sug.quincena))+' ('+esc(sug.desde)+' al '+esc(sug.hasta)+')':''}. El número de nómina impreso no define la semana.</p><button class="btn dark" data-rl="reubicar" data-id="${esc(f.id)}">Mover al periodo de sus fechas</button>`:''}
       ${f.documento_id&&s.cierres.length?`<button class="btn" data-rl="vincular" data-id="${esc(f.id)}">Revisar vínculo con fotografía</button>`:''}`:''}
      ${(f.lectura?.pendientes||[]).map((p,k)=>p.region?`<details><summary>${esc(p.campo)} · ${esc(p.causa)}</summary><code>${esc(p.region.texto)}</code><input data-rl-literal="${esc(f.id)}-${k}" aria-label="Transcripción literal"><button class="btn" data-rl="literal" data-id="${esc(f.id)}" data-k="${k}">Usar transcripción</button><button class="btn" data-rl="gemini" data-id="${esc(f.id)}" data-k="${k}">Completar sólo este campo con Gemini</button></details>`:`<details><summary>${esc(p.campo)} · seleccionar región del original</summary><p>Abre el original, verifica la página y confirma el valor. No se inventarán caracteres.</p><select data-rl-region="${esc(f.id)}-${k}">${root.PLATINUM_CAMPOS_RECIBO.regiones(f.lectura,p.campo).map((r,j)=>`<option value="${j}">Página ${r.pagina} · ${esc(r.texto_original)}</option>`).join('')}</select><button class="btn" data-rl="region" data-id="${esc(f.id)}" data-k="${k}">Usar región seleccionada</button><p>Si no aparece una región legible, conserva el pendiente y revisa el PDF original o su XML.</p></details>`).join('')}
     </td></tr>`;}).join('')||'<tr><td colspan="4">No hay originales archivados en este periodo.</td></tr>'}</tbody></table></div>
    ${total>1?`<button class="btn" data-rl="pagina" data-page="${v.pagina-1}" ${v.pagina===0?'disabled':''}>Anterior</button> ${v.pagina+1} de ${total} <button class="btn" data-rl="pagina" data-page="${v.pagina+1}" ${v.pagina+1===total?'disabled':''}>Siguiente</button>`:''}`;
   if(v.ocupado)for(const b of host.querySelectorAll('button'))b.disabled=true;
  }
  async function cargar(recuperar=true){v.sucio=false;v.pagina=0;v.excluir.clear();await v.servicio.abrir(q('[data-rl-obra]').value,ctx());mensaje('Originales disponibles. Confirma los datos leídos antes de incorporarlos a la ficha.');
   // Evidencia fiscal pendiente de XML ya archivados (o XML sin timbre leídos antes): se recupera al abrir el periodo.
   if(recuperar&&v.servicio.pendientesRecuperacion()){mensaje('Recuperando evidencia fiscal pendiente del periodo…');const r=await v.servicio.recuperar();if(r)mensaje(recuperacionTexto(r));}}
  host.onchange=async e=>{if(!actual()||v.ocupado)return;try{
   if(e.target.closest('[data-rl-contexto]')){v.sucio=true;if(e.target.matches('[data-rl-empresa]'))centros();periodos();pintar(v.servicio.estado());mensaje('Cambió el contexto. Carga el periodo antes de continuar.');
    if(e.target.matches('[data-rl-cal]'))seleccionarPeriodo(root.PLATINUM_PERIODOS.lista(q('[data-rl-obra]').value).find(p=>p.periodo_id===e.target.value));
    else if(e.target.matches('[data-rl-empresa],[data-rl-obra],[data-rl-anio],[data-rl-per]'))await catalogo();}
   if(e.target.matches('[data-rl-todas]')){v.excluir.clear();if(!e.target.checked)for(const id of v.servicio.resumen([]).listos)v.excluir.add(id);return pintar(v.servicio.estado());}
   if(e.target.matches('[data-rl-incluir]')){const id=e.target.dataset.rlIncluir??e.target.getAttribute('data-rl-incluir');if(e.target.checked)v.excluir.delete(id);else v.excluir.add(id);return pintar(v.servicio.estado());}
   if(e.target.matches('[data-rl-files]')){mensaje('Conservando originales y leyendo…');await v.servicio.subir([...e.target.files]);mensaje('Revisa el resultado de cada original. Los pendientes quedan conservados.');}
  }catch(e){mensaje(e.message);}};
  host.onclick=async e=>{const b=e.target.closest('[data-rl]');if(!b||!actual()||v.ocupado)return;const a=b.dataset.rl,archivo=b.dataset.id;try{
   if(a==='cerrar'){v.servicio.cerrar();vista=null;closeModal();if(opciones.volver==='conciliador')return root.PLATINUM_CONCILIADOR_SEMANAL?.abrir(null,opciones.semana,opciones.cierre||null);
    if(opciones.volver==='baja'&&opciones.trabajador_id)return root.PLATINUM_BAJA?.abrir(opciones.trabajador_id,{fecha:opciones.fecha_baja});return;}
   if(a==='contexto')return await cargar();
   if(a==='incorporar-periodo'){
    const j={...ctx(),numero_noi:Number(q('[data-rl-noi]').value),...(q('[data-rl-clave]').value?{clave_operativa:Number(q('[data-rl-clave]').value)}:{}),desde:q('[data-rl-desde]').value,hasta:q('[data-rl-hasta]').value,procedencia:{tipo:'CAPTURA_DOCUMENTADA',referencia:q('[data-rl-fuente]').value.trim()}};
    if(!confirm(`¿Incorporar periodo NOI ${j.numero_noi}, ${j.desde} al ${j.hasta}, ${j.clave_operativa?'con clave histórica '+j.clave_operativa:'con correspondencia histórica automática'}? Se conservará la fuente y tu usuario. No se modifican nóminas, pagos ni cierres.`))return;
    const p=await root.PLATINUM_PERIODOS.incorporar(q('[data-rl-obra]').value,{...j,confirmado:true});await catalogo(p.periodo_id);await cargar();return;
   }
   if(a==='bancos'){v.servicio.cerrar();return root.PLATINUM_IMPORTACION_BANCARIA.abrir({obra_id:q('[data-rl-obra]').value,...ctx()});}
   if(a==='fotografia'){v.servicio.cerrar();return root.PLATINUM_ARCHIVO_RECIBOS.abrirPorCierre(opciones);}
   if(v.sucio)throw Error('Carga el nuevo contexto antes de continuar.');
   if(a==='pagina'){v.pagina=Number(b.dataset.page);return pintar(v.servicio.estado());}
   if(a==='releer')await v.servicio.reanudar(archivo);
   if(a==='confirmar-visual'||a==='transcribir-visual'){
    let datos=null;
    if(a==='transcribir-visual'){
     datos={};for(const el of host.querySelectorAll('[data-rl-visual="'+archivo+'"]')){if(!el.value.trim())continue;const k=el.dataset.campo,valor=root.PLATINUM_LECTURA_HIBRIDA.normalizar(k,el.value);if(valor==null)throw Error('Formato inválido en '+k);datos[k]=k==='neto'?valor.toFixed(2):valor;}
     if(!Object.keys(datos).length)throw Error('Transcribe al menos un campo visible');
    }
    if(!confirm('¿Confirmas que estos valores aparecen en la región del original? Se guardarán tu usuario, la fecha, la imagen y los valores anteriores. Después se volverán a cotejar identidad, periodo e importes.'))return;
    await v.servicio.resolverVisual(archivo,datos);mensaje('Resolución de lectura conservada; revisa el resultado del cotejo.');
   }
   if(a==='reubicar'){
    if(!confirm('¿Mover este original al periodo del calendario del centro que contiene sus fechas? No se registra, no se paga y no cambia el cierre; después se relee en ese periodo.'))return;
    const r=await v.servicio.reubicar(archivo),c=r.contexto;
    q('[data-rl-anio]').value=c.anio;if(q('[data-rl-per]').value!==c.periodicidad)q('[data-rl-per]').value=c.periodicidad;
    if(c.periodicidad==='SEMANAL')q('[data-rl-semana]').value=c.semana;else{q('[data-rl-mes]').value=c.mes;q('[data-rl-quin]').value=c.quincena;}
    periodos();await cargar(false);
    const f=v.servicio.estado().archivos.find(x=>x.id===archivo);if(f)await v.servicio.reanudar(archivo);
    mensaje('Original movido a '+c.desde+' al '+c.hasta+' y releído en ese periodo.');
   }
   if(a==='confirmar'&&confirm('¿Confirmas la identidad, el concepto y las fechas leídas del original? No se registrará un pago ni se modificará el cierre.'))await v.servicio.confirmar(archivo);
   if(a==='verificar')await v.servicio.verificar(archivo);
   if(a==='recuperar'){const r=await v.servicio.recuperar();mensaje(r?recuperacionTexto(r):'No hay evidencia fiscal pendiente.');}
   if(a==='lote'){
    const r=v.servicio.resumen([...v.excluir]);if(!r.listos.length)throw Error('No hay registros listos para confirmar.');
    if(!confirm(resumenTexto(r)))return;
    const l=await v.servicio.confirmarLote([...v.excluir]);mensaje((l.detenido?'Lote detenido: '+l.detenido+' · ':'Lote terminado · ')+totalesTexto(l.totales));
   }
   if(a==='reintentar-fallidos'){const l=await v.servicio.reintentarFallidos();mensaje((l.detenido?'Lote detenido: '+l.detenido+' · ':'Reintento terminado · ')+totalesTexto(l.totales));}
   if(a==='region'){
    const f=v.servicio.estado().archivos.find(f=>f.id===archivo),p=f.lectura.pendientes[Number(b.dataset.k)],j=Number(q('[data-rl-region="'+archivo+'-'+b.dataset.k+'"]').value),r=root.PLATINUM_CAMPOS_RECIBO.regiones(f.lectura,p.campo)[j];
    if(!r)throw Error('No hay región legible. Conserva el pendiente y coteja el original o XML.');
    if(confirm('¿Confirmas que '+p.campo+' corresponde al valor seleccionado de la página '+r.pagina+' del original?')){root.PLATINUM_CAMPOS_RECIBO.recuperar(f.lectura,p.campo,r);pintar(v.servicio.estado());}
   }
   if(a==='literal'||a==='gemini')await v.servicio.completar(archivo,Number(b.dataset.k),q('[data-rl-literal="'+archivo+'-'+b.dataset.k+'"]')?.value,a==='gemini');
   if(a==='vincular'){
    const cierres=v.servicio.estado().cierres;if(cierres.length!==1)throw Error('Hay varias fotografías compatibles; revisa su contexto antes de vincular.');
    const r=await v.servicio.vincular(archivo,cierres[0].id);mensaje(r.motivo||etiquetas[r.estado]||r.estado);
    if(r.estado==='VINCULO_PROPUESTO'&&confirm('El original coincide con la fotografía. ¿Confirmas el vínculo documental? Los importes y estados financieros se conservarán.')){const fin=await v.servicio.vincular(archivo,cierres[0].id,true);mensaje(etiquetas[fin.estado]||fin.estado);}
   }
   if(a==='original'){
    const f=v.servicio.estado().archivos.find(f=>f.id===archivo);const r=await sb.storage.from('expedientes').createSignedUrl(f.ruta,60);if(r.error)throw Error(r.error.message);
    const link=document.createElement('a');link.href=r.data.signedUrl;link.target='_blank';link.rel='noopener';link.click();
   }
  }catch(e){mensaje(e.message);}};
  try{
   if(opciones.cierre){
    const r=await sb.rpc('control_archivo_recibos',{p_accion:'PERIODOS',p_datos:{obra_id:inicial.id}});if(r.error)throw Error(r.error.message);if(!actual())return;
    const c=r.data.periodos.find(c=>c.id===opciones.cierre);if(c){q('[data-rl-anio]').value=c.desde.slice(0,4);q('[data-rl-semana]').value=c.semana;q('[data-rl-per]').value=c.periodo;
     if(c.periodo==='QUINCENAL'){q('[data-rl-mes]').value=Number(c.desde.slice(5,7));q('[data-rl-quin]').value=Number(c.desde.slice(8,10))<16?1:2;}periodos();}
   }
   await catalogo(opciones.periodo_id);await cargar();
  }catch(e){mensaje(e.message);}
 }
 root.PLATINUM_ARCHIVO_LIBRE=Object.freeze({abrir});
})(window);
