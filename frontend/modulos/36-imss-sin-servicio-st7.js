/* El expediente IMSS es una sola lista; se conservan los registros originales. */
async function openCtrlCasosIMSS(){return openCtrlIncidentes();}
function openCtrlNuevoCasoIMSS(incidenteId=''){
  const inc=(window._CTRLINC||[]).find(x=>x.id===incidenteId);
  window._CTRLIMSS_CERT=null;
  modal(ctrlNav('＋ Caso IMSS','openCtrlCasosIMSS')+`<div class="m-body">
    <div style="padding:11px;border:1px solid var(--line);border-radius:9px;margin-bottom:12px"><label>Importar certificado IMSS (imagen o PDF, máximo 8 MB)</label><input id="im-archivo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onchange="ctrlLeerCertificadoIMSS(this)"><div class="fhint">La lectura envía el documento a Gemini únicamente después de tu confirmación. Verifica el original antes de guardar; el archivo quedará privado en el expediente de incapacidad.</div><div id="im-lectura"></div></div>
    <div class="grid" style="grid-template-columns:repeat(2,1fr)">
      <div style="grid-column:span 2"><label>Trabajador</label><select id="im-w"><option value="">— Selecciona —</option>${[...WORKERS].sort((a,b)=>(Number(a.no_trab)||999999)-(Number(b.no_trab)||999999)).map(w=>`<option value="${w.id}" ${w.id===inc?.trabajador_id?'selected':''}>#${w.no_trab??'—'} · ${esc(fullName(w))}</option>`).join('')}</select></div>
      <div><label>Tipo de caso</label><select id="im-t"><option>INCAPACIDAD</option><option>ACCIDENTE</option><option>ENFERMEDAD</option></select></div>
      <div><label>Fecha del evento (si se conoce)</label><input id="im-e" type="date"></div>
      <div><label>Ramo del certificado</label><select id="im-r"><option>ENFERMEDAD_GENERAL</option><option>RIESGO_TRABAJO</option><option>MATERNIDAD</option><option>SIN_CERTIFICADO</option></select></div>
      <div><label>Tipo de certificado</label><select id="im-tc"><option>INICIAL</option><option>SUBSECUENTE</option><option>ENLACE</option><option>RECAIDA</option><option>SIN_CERTIFICADO</option></select></div>
      <div><label>Desde (certificado)</label><input id="im-d" type="date" value="${inc?.incapacidad_desde||''}"></div><div><label>Hasta (certificado)</label><input id="im-h" type="date" value="${inc?.incapacidad_hasta||''}"></div>
      <div><label>Folio del certificado</label><input id="im-f" maxlength="80" value="${esc(inc?.folio_imss||'')}"></div><div><label>Folio ST-7 / ST-9</label><input id="im-st" maxlength="80" value="${esc(inc?.folio_st7||'')}"></div>
      <div style="grid-column:span 2"><label><input id="im-prt" type="checkbox" ${inc?.posible_riesgo_trabajo?'checked':''}> El documento indica probable riesgo de trabajo (pendiente de calificación)</label></div>
      <div style="grid-column:span 2"><label>Referencia interna del expediente (sin diagnóstico ni URL pública)</label><input id="im-ref" maxlength="200"></div>
      <div style="grid-column:span 2"><label>Notas operativas</label><textarea id="im-nota" rows="2" placeholder="Seguimiento administrativo, no diagnóstico"></textarea></div>
    </div><p class="fhint" style="margin-top:8px">El calendario no asigna pagador automáticamente. En enfermedad general, el subsidio IMSS procede ordinariamente desde el cuarto día sujeto a cotizaciones; la empresa sólo pagará los días que ustedes confirmen. El probable riesgo no equivale a dictamen.</p></div>
    <div id="im-pagadores" style="display:none;padding:0 16px 14px"><label>Confirma quién cubre los días de este certificado</label><div class="grid" style="grid-template-columns:repeat(2,1fr)"><div><label>Días pagados por la empresa</label><input id="im-empresa-dias" type="number" min="0" value="0" oninput="ctrlPreviewPagoCertificadoIMSS()"></div><div><label>Días de subsidio IMSS esperado</label><input id="im-imss-dias" type="number" min="0" value="0" oninput="ctrlPreviewPagoCertificadoIMSS()"></div></div><div id="im-pago-resumen" class="fhint"></div><label><input id="im-pago-confirmado" type="checkbox"> Revisé el certificado y confirmo esta distribución; los días restantes quedarán sin pago.</label></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlCasosIMSS()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarCasoIMSS()">Guardar caso</button></div>`,'lg');
  window._CTRLIMSS_INCIDENTE=incidenteId||null;
}
function ctrlPreviewPagoCertificadoIMSS(){
  const c=window._CTRLIMSS_CERT,d=c?.datos?.dias_autorizados||0;
  const emp=Number($('im-empresa-dias')?.value),imss=Number($('im-imss-dias')?.value);
  const valido=Number.isInteger(emp)&&Number.isInteger(imss)&&emp>=0&&imss>=0&&emp+imss<=d;
  if($('im-pago-resumen'))$('im-pago-resumen').textContent=valido?
    `${emp} empresa · ${imss} IMSS esperado · ${d-emp-imss} sin pago. Podrás ajustar fechas individuales en el calendario.`:
    `Los días deben ser enteros, no negativos y sumar como máximo ${d}.`;
}
async function ctrlLeerCertificadoIMSS(input){
  const file=input.files?.[0],box=$('im-lectura');window._CTRLIMSS_CERT=null;
  if($('im-pagadores'))$('im-pagadores').style.display='none';
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)||file.size>8388608){toast('Usa JPG, PNG, WebP o PDF de hasta 8 MB.','err');input.value='';return;}
  if(!confirm('Esta lectura enviará el certificado —incluidos NSS y CURP— a Gemini. ¿Continuar?')){input.value='';return;}
  if(box)box.innerHTML='<p class="fhint">Leyendo el certificado…</p>';
  try{
    const imagen=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file);});
    const j=await iaLlamar('gemini-citt',{obra_id:OBRA.id,mime:file.type,imagen},90000);
    if(!j.ok||!j.datos)throw new Error(j.error||'Gemini no pudo leer el certificado.');
    const d=j.datos,limpio=x=>String(x||'').replace(/\W/g,'').toUpperCase();
    const coincidencias=WORKERS.filter(w=>(d.curp&&limpio(w.curp)===limpio(d.curp))||(d.nss&&limpio(w.nss)===limpio(d.nss)));
    if(coincidencias.length===1)$('im-w').value=coincidencias[0].id;
    else $('im-w').value='';
    $('im-d').value=d.fecha_inicio||'';$('im-h').value=d.fecha_hasta||'';
    $('im-r').value=d.ramo_certificado||'SIN_CERTIFICADO';$('im-tc').value=d.tipo_certificado||'SIN_CERTIFICADO';
    $('im-f').value=d.folio_certificado||'';$('im-prt').checked=!!d.probable_riesgo_trabajo;
    window._CTRLIMSS_CERT={file,datos:d,modelo:j.modelo};
    const campos=[['Asegurado',d.nombre_asegurado],['NSS',d.nss],['CURP',d.curp],['Folio',d.folio_certificado],['Expedido',d.fecha_expedicion],['Inicio',d.fecha_inicio],['Días autorizados',d.dias_autorizados],['Patrón',d.patron],['Unidad',d.unidad_medica_expedidora],['UMF adscripción',d.umf_adscripcion],['Delegación',d.delegacion_expedidora],['Médico',d.medico],['Matrícula',d.matricula_medico]];
    const nssDiscrepante=coincidencias.length===1&&d.nss&&coincidencias[0].nss&&limpio(d.nss)!==limpio(coincidencias[0].nss);
    if(box)box.innerHTML=`<div style="margin-top:9px;padding:9px;background:var(--amber-bg);border-radius:8px"><b>Lectura para revisar con el original</b> · ${coincidencias.length===1?`Coincide con #${coincidencias[0].no_trab}`:'No hubo coincidencia única por CURP/NSS; selección manual obligatoria.'}<br>${campos.filter(x=>x[1]!==null&&x[1]!==undefined&&x[1]!=='').map(([k,v])=>`<small style="display:inline-block;margin:3px 9px 0 0"><b>${esc(k)}:</b> ${esc(String(v))}</small>`).join('')}${nssDiscrepante?'<p class="fhint">⚠ El NSS leído no coincide con la ficha. Revisa el original; si la CURP coincide, deberás confirmar expresamente la discrepancia antes de guardar.</p>':''}${d.advertencias?.length?`<p class="fhint">⚠ ${esc(d.advertencias.join(' · '))}</p>`:''}</div>`;
    $('im-pagadores').style.display='block';ctrlPreviewPagoCertificadoIMSS();
  }catch(e){
    const mensaje=e.message||String(e);
    if(box)box.innerHTML=`<div class="fhint" style="margin-top:8px">No se completó la lectura: ${esc(mensaje)}<br>Puedes capturar el caso manualmente o <button class="btn" style="padding:4px 8px;margin-top:6px" onclick="ctrlLeerCertificadoIMSS($('im-archivo'))">Reintentar con el mismo archivo</button>.</div>`;
    toast(mensaje,'err');
  }
}
async function ctrlSubirArchivoIMSS(casoId,trabajadorId,file){
  const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'})[file.type];
  if(!ext||file.size>8388608)throw new Error('Archivo no permitido o mayor de 8 MB.');
  const ruta=`${OBRA.id}/${trabajadorId}/${crypto.randomUUID()}.${ext}`;
  const {error}=await sb.storage.from('incapacidades-imss').upload(ruta,file,{contentType:file.type,upsert:false});
  if(error)throw error;
  const {error:upError}=await sb.from(CTRL_TABLAS.casosIMSS).update({certificado_archivo:ruta,certificado_mime:file.type,updated_at:new Date().toISOString()}).eq('id',casoId).eq('obra_id',OBRA.id);
  if(upError)throw upError;
  await ctrlAuditar('CASOS_IMSS','ARCHIVAR_CERTIFICADO',{caso_id:casoId,archivo:ruta},'CASO_IMSS',casoId);
}
async function ctrlAdjuntarCertificadoIMSS(id){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c||c.certificado_archivo)return;
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,application/pdf';
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;
    if(!confirm('Confirma que este archivo corresponde al certificado del caso seleccionado.'))return;
    try{markWrite();await ctrlSubirArchivoIMSS(id,c.trabajador_id,file);toast('Certificado archivado.','ok');await openCtrlCasosIMSS();}
    catch(e){toast('No se pudo archivar: '+(e.message||e),'err');}};
  input.click();
}
async function ctrlVerCertificadoIMSS(id){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c?.certificado_archivo)return;
  const {data,error}=await sb.storage.from('incapacidades-imss').createSignedUrl(c.certificado_archivo,60);
  if(error||!data?.signedUrl){toast('No se pudo abrir el certificado privado.','err');return;}
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
}
function ctrlDetalleDocumentoIMSS(id){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c?.datos_documento)return;
  const w=WORKERS.find(x=>x.id===c.trabajador_id);
  const labels={nombre_asegurado:'Asegurado',nss:'NSS',curp:'CURP',folio_certificado:'Serie y folio',tipo_certificado:'Tipo',ramo_certificado:'Ramo',probable_riesgo_trabajo:'Probable riesgo de trabajo',fecha_inicio:'Inicio',fecha_hasta:'Hasta',dias_autorizados:'Días autorizados',fecha_expedicion:'Expedición',dias_acumulados:'Días acumulados',patron:'Patrón',unidad_medica_expedidora:'Unidad expedidora',umf_adscripcion:'UMF adscripción',delegacion_expedidora:'Delegación expedidora',delegacion_adscripcion:'Delegación adscripción',nivel_atencion:'Nivel de atención',puesto_trabajo:'Puesto',control_maternidad:'Control maternidad',medico:'Médico',matricula_medico:'Matrícula',numero_identificacion:'Identificación',agregado_medico:'Agregado médico',cve_ptal:'Clave postal',consultorio:'Consultorio',turno:'Turno',sexo:'Sexo',fecha_nacimiento:'Fecha nacimiento'};
  const d=c.datos_documento;
  modal(ctrlNav(`📋 Certificado IMSS · #${w?.no_trab??'—'}`,'openCtrlCasosIMSS')+`<div class="m-body"><p class="fhint">Datos transcritos por IA y confirmados al guardar. Ante discrepancia, prevalece el certificado original. Subsidio IMSS = esperado, no comprobado.</p>${Object.entries(labels).map(([k,l])=>`<div class="kv"><b>${esc(l)}</b><span>${esc(d[k]===true?'Sí':d[k]===false?'No':d[k]??'—')}</span></div>`).join('')}${d.advertencias?.length?`<p class="fhint">⚠ ${esc(d.advertencias.join(' · '))}</p>`:''}</div><div class="m-foot"><button class="btn" onclick="openCtrlCasosIMSS()">Volver</button>${c.certificado_archivo?`<button class="btn dark" onclick="ctrlVerCertificadoIMSS('${id}')">Abrir original</button>`:''}</div>`,'lg');
}
async function ctrlGuardarCasoIMSS(){
  const w=WORKERS.find(x=>x.id===$('im-w').value),d=$('im-d').value,h=$('im-h').value,r=$('im-r').value,tc=$('im-tc').value;
  if(!w){toast('Selecciona un trabajador.','err');return;}
  if((!!d)!=(!!h)){toast('Captura ambas fechas del certificado.','err');return;}
  const dias=d&&h?Math.round((Date.parse(h+'T12:00:00Z')-Date.parse(d+'T12:00:00Z'))/86400000)+1:0;
  if(dias<0||dias>365||(!d&&(r!=='SIN_CERTIFICADO'||tc!=='SIN_CERTIFICADO'))){toast('Revisa ramo, tipo y fechas del certificado.','err');return;}
  const cert=window._CTRLIMSS_CERT;
  let clasificacion=null;
  if(cert){
    const norm=x=>String(x||'').replace(/\W/g,'').toUpperCase(),dato=cert.datos;
    const curpCoincide=!!dato.curp&&!!w.curp&&norm(dato.curp)===norm(w.curp);
    const nssDiscrepante=!!dato.nss&&!!w.nss&&norm(dato.nss)!==norm(w.nss);
    if((dato.curp&&!curpCoincide)||(!curpCoincide&&nssDiscrepante)){toast('La identidad del documento no coincide con la ficha. Revisa el original; no se puede archivar en otro trabajador.','err');return;}
    if(nssDiscrepante){
      if(!confirm(`La CURP coincide con #${w.no_trab}, pero el NSS leído del certificado (${dato.nss}) difiere del registrado (${w.nss}). ¿Revisaste el original y confirmas archivar esta discrepancia sin modificar la ficha del trabajador?`))return;
      dato.advertencias=[...new Set([...(dato.advertencias||[]),'NSS del certificado distinto al registrado; CURP coincidente y discrepancia confirmada por el operador.'])];
    }
    if(d!==dato.fecha_inicio||h!==dato.fecha_hasta||dias!==dato.dias_autorizados){toast('Las fechas/días difieren de la lectura. Corrige el documento o registra manualmente; no se archivará una copia discordante.','err');return;}
    const patron=norm(dato.patron),empresa=empresaDeObra(OBRA);
    if((/JIRE/.test(patron)&&empresa!=='JIRE')||(/PLATINUM/.test(patron)&&empresa!=='PLATINUM')){toast('La razón social del certificado no corresponde a este centro de trabajo.','err');return;}
    const em=Number($('im-empresa-dias').value),im=Number($('im-imss-dias').value);
    if(!Number.isInteger(em)||!Number.isInteger(im)||em<0||im<0||em+im>dias||!$('im-pago-confirmado').checked){toast('Confirma cuántos días cubre cada parte; el resto quedará sin pago.','err');return;}
    if(r==='ENFERMEDAD_GENERAL'&&im>0&&im>Math.max(0,dias-3)&&!confirm('En enfermedad general el subsidio IMSS ordinariamente inicia el cuarto día de la incapacidad, sujeto a requisitos. ¿Tienes un soporte específico para clasificar más días como IMSS esperado?'))return;
    clasificacion={empresa:em,imss:im};
  }
  const f={obra_id:OBRA.id,trabajador_id:w.id,incidente_id:window._CTRLIMSS_INCIDENTE||null,tipo_caso:$('im-t').value,fecha_evento:$('im-e').value||null,
    ramo_certificado:r,tipo_certificado:tc,probable_riesgo_trabajo:$('im-prt').checked,
    calificacion_rt:$('im-prt').checked?'PENDIENTE':'NO_APLICA',certificado_desde:d||null,certificado_hasta:h||null,
    dias_certificados:dias,folio_certificado:$('im-f').value.trim()||null,
    folio_st7:$('im-st').value.trim()||null,referencia_evidencia:$('im-ref').value.trim()||null,
    observaciones_operativas:$('im-nota').value.trim()||null,
    estado:d?$('im-prt').checked?'PENDIENTE_CALIFICACION':'EN_SEGUIMIENTO':'PENDIENTE_CERTIFICADO'};
  if(cert){f.datos_documento=cert.datos;f.extraccion_modelo=cert.modelo||null;f.extraccion_revisada_en=new Date().toISOString();}
  markWrite();const {data,error}=await sb.from(CTRL_TABLAS.casosIMSS).insert(f).select('id').single();
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  await ctrlAuditar('CASOS_IMSS','REGISTRAR',{trabajador_id:w.id,ramo:r,tipo_certificado:tc,probable_rt:f.probable_riesgo_trabajo},'CASO_IMSS',data.id);
  window._CTRLIMSS_INCIDENTE=null;
  if(cert){
    try{await ctrlSubirArchivoIMSS(data.id,w.id,cert.file);}catch(e){toast('Caso guardado, pero falta archivar la imagen: '+(e.message||e)+'. Reintenta desde la lista.','err');await openCtrlCasosIMSS();return;}
    try{
      const fechas=ctrlFechasIMSS(d,h),porSemana=new Map();
      fechas.forEach((fecha,i)=>{const sem=isoWeekDe(OBRA,new Date(fecha+'T12:00:00')),pagador=i<clasificacion.empresa?'EMPRESA':i<clasificacion.empresa+clasificacion.imss?'IMSS':'SIN_PAGO';
        if(!porSemana.has(sem))porSemana.set(sem,[]);porSemana.get(sem).push({fecha,pagador});});
      for(const [sem,detalle] of porSemana){const {error:e}=await sb.rpc('control_guardar_semana_imss_detalle',{
        p_caso_id:data.id,p_semana:sem,p_detalle:detalle,p_nota:'Distribución confirmada al importar certificado; pendiente de comprobar subsidio IMSS.',p_monto:null});if(e)throw e;}
    }catch(e){toast('Certificado archivado, pero no se guardó la distribución: '+(e.message||e)+'. Complétala en Calendario.','err');await openCtrlCasosIMSS();openCtrlSemanaIMSS(data.id);return;}
  }
  window._CTRLIMSS_CERT=null;
  toast('Caso IMSS registrado. Clasifica cada día antes de aplicarlo a nómina.','ok');await openCtrlCasosIMSS();if(d)openCtrlSemanaIMSS(data.id);
}
function openCtrlEditarCasoIMSS(id){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c)return;
  const w=WORKERS.find(x=>x.id===c.trabajador_id),tieneSemanas=!!c.control_casos_imss_semanas?.length;
  modal(ctrlNav('✎ Editar incapacidad IMSS','openCtrlCasosIMSS')+`<div class="m-body">
    <p><b>#${w?.no_trab??'—'} ${esc(w?fullName(w):'Trabajador')}</b></p>
    <p class="fhint">Edita los datos del certificado aquí. Los días que paga cada parte se cambian en <b>Calendario</b>. ${tieneSemanas?'Para preservar incidencias y cierres, las fechas del certificado están bloqueadas mientras existan semanas distribuidas.':''}</p>
    <div class="grid" style="grid-template-columns:repeat(2,1fr)">
      <div><label>Tipo de caso</label><select id="ime-t">${['INCAPACIDAD','ACCIDENTE','ENFERMEDAD'].map(x=>`<option ${c.tipo_caso===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div><label>Fecha del evento</label><input id="ime-e" type="date" value="${c.fecha_evento||''}"></div>
      <div><label>Ramo del certificado</label><select id="ime-r">${['ENFERMEDAD_GENERAL','RIESGO_TRABAJO','MATERNIDAD','SIN_CERTIFICADO'].map(x=>`<option ${c.ramo_certificado===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div><label>Tipo de certificado</label><select id="ime-tc">${['INICIAL','SUBSECUENTE','ENLACE','RECAIDA','SIN_CERTIFICADO'].map(x=>`<option ${c.tipo_certificado===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div><label>Desde</label><input id="ime-d" type="date" value="${c.certificado_desde||''}" ${tieneSemanas?'disabled':''}></div>
      <div><label>Hasta</label><input id="ime-h" type="date" value="${c.certificado_hasta||''}" ${tieneSemanas?'disabled':''}></div>
      <div><label>Folio del certificado</label><input id="ime-f" maxlength="80" value="${esc(c.folio_certificado||'')}"></div>
      <div><label>Folio ST-7</label><input id="ime-st" maxlength="80" value="${esc(c.folio_st7||'')}"></div>
      <div style="grid-column:span 2"><label><input id="ime-prt" type="checkbox" ${c.probable_riesgo_trabajo?'checked':''}> El certificado indica probable riesgo de trabajo</label></div>
      <div style="grid-column:span 2"><label>Referencia privada del expediente</label><input id="ime-ref" maxlength="200" value="${esc(c.referencia_evidencia||'')}"></div>
      <div style="grid-column:span 2"><label>Notas operativas, sin diagnóstico</label><textarea id="ime-nota" rows="2">${esc(c.observaciones_operativas||'')}</textarea></div>
    </div></div><div class="m-foot"><button class="btn" onclick="openCtrlCasosIMSS()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarEdicionCasoIMSS('${id}')">Guardar cambios</button></div>`,'lg');
}
async function ctrlGuardarEdicionCasoIMSS(id){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c)return;
  const d=$('ime-d').value,h=$('ime-h').value;
  if((!!d)!=(!!h)){toast('Captura ambas fechas del certificado.','err');return;}
  const dias=ctrlFechasIMSS(d,h).length;
  if((d&&(!dias||dias>365))||(!d&&($('ime-r').value!=='SIN_CERTIFICADO'||$('ime-tc').value!=='SIN_CERTIFICADO'))){toast('Revisa las fechas, ramo y tipo del certificado.','err');return;}
  if(c.calificacion_rt==='SI_TRABAJO'&&!$('ime-prt').checked){toast('Un dictamen de riesgo positivo no puede perder el indicador de probable riesgo.','err');return;}
  const up={tipo_caso:$('ime-t').value,fecha_evento:$('ime-e').value||null,ramo_certificado:$('ime-r').value,
    tipo_certificado:$('ime-tc').value,certificado_desde:d||null,certificado_hasta:h||null,dias_certificados:dias,
    folio_certificado:$('ime-f').value.trim()||null,folio_st7:$('ime-st').value.trim()||null,
    probable_riesgo_trabajo:$('ime-prt').checked,referencia_evidencia:$('ime-ref').value.trim()||null,
    observaciones_operativas:$('ime-nota').value.trim()||null,updated_at:new Date().toISOString()};
  markWrite();const {error}=await sb.from(CTRL_TABLAS.casosIMSS).update(up).eq('id',id).eq('obra_id',OBRA.id).is('eliminado_en',null);
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  await ctrlAuditar('CASOS_IMSS','EDITAR_CERTIFICADO',{caso_id:id,ramo:up.ramo_certificado,dias_certificados:dias},'CASO_IMSS',id);
  toast('Certificado actualizado.','ok');openCtrlCasosIMSS();
}
async function ctrlArchivarCasoIMSS(id){
  if(!esAdmin()){toast('Sólo el administrador puede eliminar un caso IMSS.','err');return;}
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c)return;
  const w=WORKERS.find(x=>x.id===c.trabajador_id);
  if(!confirm(`Primera confirmación: ¿retirar la incapacidad de ${w?fullName(w):'este trabajador'}?\n\nSe conservará una copia auditada y se desactivarán únicamente las incidencias vinculadas. Un cierre existente debe retirarse primero.`))return;
  const clave=prompt('Segunda confirmación: escribe exactamente ELIMINAR INCAPACIDAD','');
  if(clave!=='ELIMINAR INCAPACIDAD'){if(clave!==null)toast('La confirmación no coincide.','err');return;}
  const motivo=prompt('Motivo de eliminación para la bitácora (mínimo 10 caracteres):','');
  if(motivo===null)return;
  if(motivo.trim().length<10){toast('Escribe un motivo de al menos 10 caracteres.','err');return;}
  markWrite();const {error}=await sb.rpc('control_archivar_caso_imss_admin',{
    p_caso_id:id,p_confirmacion:clave,p_motivo:motivo.trim()
  });
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  toast('Caso retirado de la vista; registro conservado en la bitácora.','ok');
  await loadObraData(OBRA.id);openCtrlCasosIMSS();
}
function ctrlFechasIMSS(desde,hasta){
  const out=[];if(!desde||!hasta||hasta<desde)return out;
  const d=new Date(desde+'T12:00:00Z'),fin=new Date(hasta+'T12:00:00Z');
  while(d<=fin&&out.length<366){out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);}
  return out;
}
function ctrlSemanasIMSS(c){
  return [...new Set(ctrlFechasIMSS(c.certificado_desde,c.certificado_hasta)
    .map(fecha=>isoWeekDe(OBRA,new Date(fecha+'T12:00:00'))))].filter(n=>n>=1&&n<=53).sort((a,b)=>a-b);
}
function ctrlPreviewDiasIMSS(){
  const x=(window._CTRLIMSS_DIAS||[]).map(fecha=>({fecha,pagador:$('ims-dia-'+fecha)?.value||'PENDIENTE'}));
  const n=p=>x.filter(d=>d.pagador===p).length;
  const box=$('ims-resumen');if(box)box.innerHTML=`<b>${n('EMPRESA')}</b> empresa · <b>${n('IMSS')}</b> IMSS esperado · <b>${n('SIN_PAGO')}</b> sin pago · <b>${n('PENDIENTE')}</b> por clasificar`;
}
function ctrlMarcarDiasIMSS(pagador){
  (window._CTRLIMSS_DIAS||[]).forEach(fecha=>{const el=$('ims-dia-'+fecha);if(el)el.value=pagador;});
  ctrlPreviewDiasIMSS();
}
function openCtrlSemanaIMSS(id,semElegida){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c)return;
  const w=WORKERS.find(x=>x.id===c.trabajador_id),ss=[...(c.control_casos_imss_semanas||[])].sort((a,b)=>b.anio-a.anio||b.semana-a.semana);
  const semanas=ctrlSemanasIMSS(c),sem=semanas.includes(Number(semElegida))?Number(semElegida):(semanas.includes(semObra())?semObra():semanas[0]);
  const [inicio,fin]=sem?semRange(sem):['',''];
  const dias=ctrlFechasIMSS(inicio>c.certificado_desde?inicio:c.certificado_desde,fin<c.certificado_hasta?fin:c.certificado_hasta);
  const vigente=ss.find(s=>s.semana===sem&&s.anio===Number(inicio.slice(0,4)));
  const prev=new Map((vigente?.detalle_dias||[]).map(d=>[d.fecha,d.pagador]));
  window._CTRLIMSS_DIAS=dias;
  modal(ctrlNav('📅 Calendario de incapacidad','openCtrlCasosIMSS')+`<div class="m-body">
    <p><b>#${w?.no_trab??'—'} ${esc(w?fullName(w):'')}</b> · ${c.certificado_desde?`${fmtD(c.certificado_desde)}–${fmtD(c.certificado_hasta)} (${c.dias_certificados} días)`:'Certificado pendiente'}</p>
    <p class="fhint">Clasifica <b>cada día natural</b>. “IMSS esperado” no acredita un subsidio efectivamente pagado. La empresa sólo paga los días que selecciones. Ningún día se clasifica automáticamente.</p>
    ${ctrlTabla(['Semana','Empresa','IMSS esperado','Sin pago','Estado / nómina'],ss.map(s=>`<tr><td>${s.anio} · S${s.semana}</td><td>${s.dias_pagados_empresa}</td><td>${s.dias_imss_estimados||0}</td><td>${s.dias_sin_subsidio||0}</td><td>${ctrlEstado(s.estado)} ${s.estado==='APLICADO'?'· incidencia vinculada':`<button class="btn dark" onclick="ctrlAplicarSemanaIMSS('${c.id}','${s.id}')">Aplicar a nómina</button>`}</td></tr>`),'Sin semanas distribuidas.')}
    ${semanas.length?`<div style="margin-top:14px"><label>Semana del certificado</label><select id="ims-sem" onchange="openCtrlSemanaIMSS('${id}',this.value)">${semanas.map(n=>`<option value="${n}" ${n===sem?'selected':''}>S${n} · ${semRange(n).map(fmtD).join(' a ')}</option>`).join('')}</select></div>
      <div class="imss-calendar">${dias.map(fecha=>`<div class="imss-day"><b>${new Date(fecha+'T12:00:00Z').toLocaleDateString('es-MX',{timeZone:'UTC',weekday:'short',day:'2-digit',month:'short'})}</b><small>${fecha}</small><select id="ims-dia-${fecha}" onchange="ctrlPreviewDiasIMSS()"><option value="PENDIENTE">Por clasificar</option><option value="EMPRESA" ${prev.get(fecha)==='EMPRESA'?'selected':''}>Paga empresa</option><option value="IMSS" ${prev.get(fecha)==='IMSS'?'selected':''}>IMSS esperado</option><option value="SIN_PAGO" ${prev.get(fecha)==='SIN_PAGO'?'selected':''}>Sin pago</option></select></div>`).join('')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" onclick="ctrlMarcarDiasIMSS('EMPRESA')">Todos empresa</button><button class="btn" onclick="ctrlMarcarDiasIMSS('IMSS')">Todos IMSS</button><button class="btn" onclick="ctrlMarcarDiasIMSS('SIN_PAGO')">Todos sin pago</button><button class="btn" onclick="ctrlMarcarDiasIMSS('PENDIENTE')">Limpiar</button></div>
      <div id="ims-resumen" class="fhint" style="margin-top:8px"></div>
      <div style="margin-top:10px"><label>Nota de conciliación</label><input id="ims-nota" value="${esc(vigente?.nota||'')}" maxlength="500" placeholder="Razón del pago patronal o comprobante IMSS"></div>
      <p class="fhint" style="margin-top:8px">En enfermedad general, IMSS normalmente subsidia desde el cuarto día si se cumplen las semanas cotizadas; los primeros tres no se asignan a la empresa por ley. Riesgo de trabajo exige calificación del IMSS. Si ya existe cierre de esta semana, deberá retirarse y recrearse antes de cambiar importes.</p>`:'<p class="fhint">Completa primero las fechas del certificado.</p>'}
    </div><div class="m-foot"><button class="btn" onclick="openCtrlCasosIMSS()">Volver</button>${semanas.length?`<button class="btn dark" onclick="ctrlGuardarSemanaIMSS('${id}')">Guardar calendario S${sem}</button>`:''}</div>`,'lg');
  ctrlPreviewDiasIMSS();
}
async function ctrlGuardarSemanaIMSS(id){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c||!c.certificado_desde){toast('Primero registra las fechas del certificado.','err');return;}
  const sem=Number($('ims-sem').value),dias=window._CTRLIMSS_DIAS||[];
  const detalle=dias.map(fecha=>({fecha,pagador:$('ims-dia-'+fecha)?.value||'PENDIENTE'}));
  if(!Number.isInteger(sem)||!dias.length||detalle.some(x=>x.pagador==='PENDIENTE')){
    toast('Clasifica todos los días de la semana antes de guardar.','err');return;
  }
  const sin=detalle.filter(x=>x.pagador!=='EMPRESA').length;
  const s=(c.control_casos_imss_semanas||[]).find(x=>x.semana===sem);
  const w=WORKERS.find(x=>x.id===c.trabajador_id);
  const monto=s?.estado==='APLICADO'&&w?(sin?descuentoFaltasNOI(w,0,0,undefined,sin).monto:0):null;
  if(s?.estado==='APLICADO'&&(!Number.isFinite(monto)||monto<0)){
    toast('No se pudo recalcular la incidencia aplicada.','err');return;
  }
  markWrite();const {error}=await sb.rpc('control_guardar_semana_imss_detalle',{
    p_caso_id:id,p_semana:sem,p_detalle:detalle,p_nota:$('ims-nota').value.trim()||null,p_monto:monto
  });
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  toast('Calendario guardado'+(s?.estado==='APLICADO'?' y descuento recalculado.':'. Revisa y aplica la incidencia a nómina.'),'ok');
  await loadObraData(OBRA.id);await openCtrlCasosIMSS();openCtrlSemanaIMSS(id,sem);
}
async function ctrlAplicarSemanaIMSS(casoId,semanaId){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===casoId),s=(c?.control_casos_imss_semanas||[]).find(x=>x.id===semanaId);
  if(!c||!s||s.estado==='APLICADO')return;
  const w=WORKERS.find(x=>x.id===c.trabajador_id);
  if(!w||w.estatus!=='ACTIVO'){toast('Para aplicar automáticamente, el trabajador debe estar activo en el motor. Revisa este caso con nómina.','err');return;}
  if(!Array.isArray(s.detalle_dias)||s.detalle_dias.length!==s.dias_pagados_empresa+s.dias_sin_salario_patronal){
    toast('Primero clasifica todos los días del certificado en el calendario.','err');return;
  }
  const {data:cierres,error:eCierre}=await sb.from(CTRL_TABLAS.cierres).select('id,estado').eq('obra_id',OBRA.id).eq('semana',s.semana).in('estado',['AUTORIZADO','TIMBRADO','PAGADO']).limit(1);
  if(eCierre){toast(ctrlFaltaScript(eCierre),'err');return;}
  if(cierres?.length){toast('S'+s.semana+' tiene una versión autorizada. Solicita reapertura al administrador antes de aplicar esta incapacidad. No elimines comprobantes.','err');return;}
  const {error:eExist,data:ya}=await sb.from('descuentos').select('id,motivo').eq('trabajador_id',w.id)
    .eq('obra_id',OBRA.id).eq('semana','S'+s.semana).eq('activo',true).in('tipo',['INCIDENCIA','FALTA']);
  if(eExist){toast(eExist.message,'err');return;}
  if(ya?.length){toast('Ya hay una falta o incidencia activa para este trabajador en S'+s.semana+'. Concíliala antes de aplicar la incapacidad para evitar un doble descuento.','err');return;}
  const monto=s.dias_sin_salario_patronal?descuentoFaltasNOI(w,0,0,undefined,s.dias_sin_salario_patronal).monto:0;
  if(s.dias_sin_salario_patronal&&(!Number.isFinite(monto)||monto<=0)){toast('No fue posible calcular un importe válido.','err');return;}
  if(!confirm(`¿Aplicar S${s.semana} de ${fullName(w)}?\n${s.dias_sin_salario_patronal} día(s) IMSS sin salario patronal; incidencia estimada $${money(monto)}. No es falta injustificada. Verifica después contra NOI.`))return;
  markWrite();const {error}=await sb.rpc('control_aplicar_caso_imss_semana',{p_semana_id:s.id,p_monto:monto});
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  toast('Incidencia IMSS aplicada y vinculada al caso.','ok');await loadObraData(OBRA.id);await openCtrlCasosIMSS();openCtrlSemanaIMSS(casoId);
}
function openCtrlActualizarCasoIMSS(id){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c)return;
  modal(ctrlNav('Seguimiento del caso IMSS','openCtrlCasosIMSS')+`<div class="m-body"><p class="fhint">La calificación positiva o negativa sólo se registra al contar con dictamen del IMSS. No cambies el ramo original del certificado.</p>
    <div class="grid" style="grid-template-columns:1fr 1fr"><div><label>Calificación oficial</label><select id="imu-cal"><option>PENDIENTE</option><option>SI_TRABAJO</option><option>NO_TRABAJO</option><option>NO_APLICA</option></select></div>
    <div><label>Estado</label><select id="imu-est"><option>PENDIENTE_CALIFICACION</option><option>EN_SEGUIMIENTO</option><option>CERRADO</option><option>DESCARTADO</option></select></div>
    <div><label>Folio ST-7</label><input id="imu-st7" value="${esc(c.folio_st7||'')}"></div><div><label>Folio ST-9</label><input id="imu-st9" value="${esc(c.folio_st9||'')}"></div>
    <div><label>Folio ST-2 / alta médica</label><input id="imu-st2" value="${esc(c.folio_st2||'')}"></div><div><label>Folio certificado</label><input id="imu-f" value="${esc(c.folio_certificado||'')}"></div>
    <div style="grid-column:span 2"><label>Referencia del dictamen / evidencia privada</label><input id="imu-ref" value="${esc(c.referencia_evidencia||'')}"></div>
    <div style="grid-column:span 2"><label>Notas operativas (sin diagnóstico)</label><textarea id="imu-nota" rows="2">${esc(c.observaciones_operativas||'')}</textarea></div></div></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlCasosIMSS()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarSeguimientoIMSS('${id}')">Guardar seguimiento</button></div>`,'lg');
  $('imu-cal').value=c.calificacion_rt;$('imu-est').value=c.estado;
}
async function ctrlGuardarSeguimientoIMSS(id){
  const c=(window._CTRLIMSS||[]).find(x=>x.id===id);if(!c)return;
  const cal=$('imu-cal').value,st7=$('imu-st7').value.trim(),st9=$('imu-st9').value.trim(),ref=$('imu-ref').value.trim();
  if(['SI_TRABAJO','NO_TRABAJO'].includes(cal)&&(!c.probable_riesgo_trabajo||!(st7||st9)||!ref)){toast('Para registrar una calificación oficial, requiere probable RT, folio ST-7/ST-9 y referencia del dictamen.','err');return;}
  const up={calificacion_rt:cal,estado:$('imu-est').value,folio_st7:st7||null,folio_st9:st9||null,
    folio_st2:$('imu-st2').value.trim()||null,folio_certificado:$('imu-f').value.trim()||null,
    referencia_evidencia:ref||null,observaciones_operativas:$('imu-nota').value.trim()||null,updated_at:new Date().toISOString()};
  markWrite();const {error}=await sb.from(CTRL_TABLAS.casosIMSS).update(up).eq('id',id).eq('obra_id',OBRA.id);
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  await ctrlAuditar('CASOS_IMSS','SEGUIMIENTO',{calificacion:cal,estado:up.estado,con_dictamen:!!ref},'CASO_IMSS',id);
  toast('Seguimiento IMSS actualizado.','ok');openCtrlCasosIMSS();
}
/* ---------- ALTAS Y BAJAS SIN SERVICIO EFECTIVO ---------- */
async function openCtrlAltasCortas(semElegida){
  const {data,error}=await ctrlLeer(CTRL_TABLAS.altasCortas);if(error){toast(ctrlFaltaScript(error),'err');return;}
  const a=(data||[]).sort((x,y)=>bajaCortaOrden(y)-bajaCortaOrden(x));window._CTRLALT=a;
  const semanaActual=semObra(),anioActual=Number(semRange(semanaActual)[0].slice(0,4));
  const semanas=[...new Set(a.map(x=>`${x.anio}|${x.semana}`))].sort((x,y)=>{
    const [ax,as]=x.split('|').map(Number),[yx,ys]=y.split('|').map(Number);
    return yx-ax||ys-as;
  });
  const actual=`${anioActual}|${semanaActual}`;
  const elegida=semElegida||window._CTRLALTSEM;
  const clave=semanas.includes(elegida)?elegida:(semanas.includes(actual)?actual:semanas[0]||actual);
  window._CTRLALTSEM=clave;
  const [anio,semana]=clave.split('|').map(Number);
  const visibles=a.filter(x=>Number(x.anio)===anio&&Number(x.semana)===semana);
  const pendientes=visibles.filter(x=>x.estado_servicio==='PENDIENTE'||x.estado_servicio==='REVISAR').length;
  modal(ctrlNav('↔️ Altas y bajas sin servicio')+`<div class="m-body">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><div><label>Semana de la obra</label><select id="ab-filtro-semana" onchange="openCtrlAltasCortas(this.value)">${(semanas.length?semanas:[actual]).map(s=>{const [y,n]=s.split('|');return `<option value="${s}" ${s===clave?'selected':''}>S${n} · ${y} (${a.filter(x=>Number(x.anio)===Number(y)&&Number(x.semana)===Number(n)).length})</option>`;}).join('')}</select></div><button class="btn dark" onclick="openCtrlNuevaAltaCorta()">＋ Registrar caso</button><button class="btn" onclick="ctrlExportAltasCortas()">⬇ Excel de S${semana}</button></div>
    <p class="fhint" style="margin-top:9px"><b>S${semana}/${anio}:</b> ${visibles.length} caso(s), ${pendientes} por verificar. Las altas y bajas de la misma semana se registran automáticamente como <b>PENDIENTE</b>; no significan ausencia de trabajo por sí mismas. Contrasta horas, IDSE y NOI antes de confirmar.</p>
    ${ctrlTabla(['Trabajador / servicio','Base alta / baja','IDSE alta / baja','NOI: modelo y neto'],visibles.map(x=>{
      const w=WORKERS.find(t=>t.id===x.trabajador_id);
      return `<tr><td>#${w?.no_trab??'—'} ${esc(w?fullName(w):'Trabajador no visible')}<br>${ctrlEstado(x.estado_servicio)} <button class="btn" style="padding:3px 7px;margin-top:4px" onclick="openCtrlEditarAltaCorta('${x.id}')">Revisar caso</button></td>
      <td>${fmtD(x.fecha_alta_base)} / ${fmtD(x.fecha_baja_base)}</td><td>${x.fecha_alta_idse?fmtD(x.fecha_alta_idse):'Acuse pendiente'} / ${x.fecha_baja_idse?fmtD(x.fecha_baja_idse):'Acuse pendiente'}</td>
      <td>${x.fecha_alta_modelo_noi?fmtD(x.fecha_alta_modelo_noi)+' / '+fmtD(x.fecha_baja_modelo_noi):'Pendiente'}<br>${x.neto_noi==null?'NOI pendiente':'$'+money(x.neto_noi)+' · '+(x.dias_pagados_noi??'—')+' días'}</td>
      </tr>`;
    }),`Sin casos detectados en S${semana}/${anio}.`,'altas-cortas-tabla')}</div>`,'lg');
}
function bajaCortaOrden(x){return x.anio*100+x.semana;}
function openCtrlNuevaAltaCorta(){
  const yaRegistrados=new Set((window._CTRLALT||[]).map(x=>x.trabajador_id));
  const candidatos=WORKERS.filter(w=>w.fecha_alta&&w.fecha_baja&&w.fecha_baja>=w.fecha_alta&&!yaRegistrados.has(w.id));
  if(!candidatos.length){toast('Todas las altas y bajas detectadas ya tienen un caso. Usa «Revisar» en la semana correspondiente.','ok');return;}
  modal(ctrlNav('＋ Alta y baja corta','openCtrlAltasCortas')+`<div class="m-body">
    <div><label>Trabajador con alta y baja registradas</label><select id="ab-w">${candidatos.map(w=>`<option value="${w.id}">#${w.no_trab??'—'} · ${esc(fullName(w))} · ${fmtD(w.fecha_alta)} / ${fmtD(w.fecha_baja)}</option>`).join('')}</select></div>
    <div class="grid" style="grid-template-columns:repeat(2,1fr);margin-top:9px">
      <div><label>Semana de la obra</label><input id="ab-sem" type="number" min="1" max="53" value="${semObra()}"></div>
      <div><label>Situación real</label><select id="ab-est"><option>PENDIENTE</option><option>SIN_SERVICIO_CONFIRMADO</option><option>CON_SERVICIO</option><option>REVISAR</option></select></div>
      <div><label>Fecha efectiva de alta IDSE (según acuse)</label><input id="ab-ai" type="date"></div>
      <div><label>Fecha efectiva de baja IDSE (según acuse)</label><input id="ab-bi" type="date"></div>
      <div><label>Alta usada en NOI (modelo)</label><input id="ab-an" type="date"></div>
      <div><label>Baja usada en NOI (modelo)</label><input id="ab-bn" type="date"></div>
      <div><label>Faltas usadas en NOI</label><input id="ab-f" type="number" step="0.0001" min="0"></div>
      <div><label>Neto NOI ($)</label><input id="ab-n" type="number" step="0.01" min="0"></div>
      <div style="grid-column:span 2"><label>Observaciones / referencia de acuses</label><textarea id="ab-nota" rows="2"></textarea></div>
    </div><p class="fhint">No inventes fechas IDSE ni captures una falta ficticia como ausencia real. El modelo NOI se registra únicamente como conciliación.</p></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlAltasCortas()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarAltaCorta()">Guardar</button></div>`,'lg');
}
async function ctrlGuardarAltaCorta(){
  const w=WORKERS.find(x=>x.id===$('ab-w').value),sem=Number($('ab-sem').value);if(!w||!Number.isInteger(sem)||sem<1||sem>53){toast('Selecciona trabajador y semana válidos.','err');return;}
  const [ini,fin]=semRange(sem);
  if(w.fecha_alta>fin||w.fecha_baja<ini){toast('El alta y la baja registradas no coinciden con esa semana.','err');return;}
  const estado=$('ab-est').value,nota=$('ab-nota').value.trim();
  if(estado==='SIN_SERVICIO_CONFIRMADO'&&!confirm('Confirma con evidencia operativa que no hubo ninguna hora de trabajo efectivo. Esta marca no elimina obligaciones legales ni fechas IMSS.'))return;
  const f={obra_id:OBRA.id,trabajador_id:w.id,anio:Number(ini.slice(0,4)),semana:sem,estado_servicio:estado,
    fecha_alta_base:w.fecha_alta,fecha_baja_base:w.fecha_baja,
    fecha_alta_idse:$('ab-ai').value||null,fecha_baja_idse:$('ab-bi').value||null,
    fecha_alta_modelo_noi:$('ab-an').value||null,fecha_baja_modelo_noi:$('ab-bn').value||null,
    faltas_modelo_noi:$('ab-f').value?Number($('ab-f').value):null,
    dias_pagados_noi:null,neto_noi:$('ab-n').value?Number($('ab-n').value):null,
    observaciones:nota||null,fuente:'CAPTURA_MANUAL'};
  markWrite();const {data,error}=await sb.from(CTRL_TABLAS.altasCortas).insert(f).select('id').single();
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  await ctrlAuditar('ALTAS_BAJAS_CORTAS','REGISTRAR',{trabajador_id:w.id,semana:sem,estado_servicio:estado},'ALTA_BAJA_CORTA',data.id);
  toast('Caso clasificado sin modificar el alta o baja original.','ok');await loadObraData(OBRA.id);openCtrlAltasCortas();
}
function openCtrlEditarAltaCorta(id){
  const x=(window._CTRLALT||[]).find(a=>a.id===id);if(!x)return;
  const w=WORKERS.find(t=>t.id===x.trabajador_id);
  modal(ctrlNav(`Revisar S${x.semana} · #${w?.no_trab??'—'}`,'openCtrlAltasCortas')+`<div class="m-body">
    <p><b>${esc(w?fullName(w):'Trabajador')}</b> · Base: ${fmtD(x.fecha_alta_base)} / ${fmtD(x.fecha_baja_base)}</p>
    <div class="grid" style="grid-template-columns:1fr 1fr"><div><label>Situación real</label><select id="abe-est"><option>PENDIENTE</option><option>SIN_SERVICIO_CONFIRMADO</option><option>CON_SERVICIO</option><option>REVISAR</option></select></div>
    <div><label>Neto NOI ($)</label><input id="abe-net" type="number" step="0.01" min="0" value="${x.neto_noi??''}"></div>
    <div><label>Alta efectiva IDSE</label><input id="abe-ai" type="date" value="${x.fecha_alta_idse||''}"></div><div><label>Baja efectiva IDSE</label><input id="abe-bi" type="date" value="${x.fecha_baja_idse||''}"></div>
    <div style="grid-column:span 2"><label>Observaciones / acuses</label><textarea id="abe-nota" rows="3">${esc(x.observaciones||'')}</textarea></div></div></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlAltasCortas()">Cancelar</button><button class="btn dark" onclick="ctrlActualizarAltaCorta('${id}')">Guardar revisión</button></div>`,'lg');
  $('abe-est').value=x.estado_servicio;
}
async function ctrlActualizarAltaCorta(id){
  const x=(window._CTRLALT||[]).find(a=>a.id===id);if(!x)return;
  const estado=$('abe-est').value,ai=$('abe-ai').value||null,bi=$('abe-bi').value||null;
  if(ai&&bi&&bi<ai){toast('La baja IDSE no puede ser anterior al alta IDSE.','err');return;}
  if(estado==='SIN_SERVICIO_CONFIRMADO'&&x.estado_servicio!==estado&&!confirm('Confirma que no hubo trabajo efectivo; conserva evidencia y acuses IMSS.'))return;
  const up={estado_servicio:estado,fecha_alta_idse:ai,fecha_baja_idse:bi,
    neto_noi:$('abe-net').value!==''?Number($('abe-net').value):null,
    observaciones:$('abe-nota').value.trim()||null,updated_at:new Date().toISOString()};
  markWrite();const {error}=await sb.from(CTRL_TABLAS.altasCortas).update(up).eq('id',id).eq('obra_id',OBRA.id);
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  await ctrlAuditar('ALTAS_BAJAS_CORTAS','REVISAR',{estado_servicio:estado,alta_idse:ai,baja_idse:bi},'ALTA_BAJA_CORTA',id);
  toast('Caso actualizado.','ok');await loadObraData(OBRA.id);openCtrlAltasCortas();
}
async function ctrlExportAltasCortas(){
  const [anio,semana]=String(window._CTRLALTSEM||'').split('|').map(Number);
  const a=(window._CTRLALT||[]).filter(x=>Number(x.anio)===anio&&Number(x.semana)===semana);
  await ctrlExportar(`ALTAS Y BAJAS CORTAS · S${semana}/${anio}`,['NO.','TRABAJADOR','SEMANA','SITUACIÓN','ALTA BASE','BAJA BASE','ALTA IDSE','BAJA IDSE','ALTA MODELO NOI','BAJA MODELO NOI','FALTAS MODELO NOI','DÍAS NOI','NETO NOI','NOTAS'],
    a.map(x=>{const w=WORKERS.find(t=>t.id===x.trabajador_id);return [w?.no_trab??'',w?fullName(w):'',`S${x.semana}/${x.anio}`,x.estado_servicio,x.fecha_alta_base||'',x.fecha_baja_base||'',x.fecha_alta_idse||'',x.fecha_baja_idse||'',x.fecha_alta_modelo_noi||'',x.fecha_baja_modelo_noi||'',x.faltas_modelo_noi??'',x.dias_pagados_noi??'',x.neto_noi??'',x.observaciones||''];}),
    'ALTAS_BAJAS_CORTAS','ALTAS_BAJAS_CORTAS');
}
async function openCtrlIncidentes(){
  ctrlAuditar('INCIDENTES_IMSS','ABRIR');
  const [ir,cr,sr]=await Promise.all([
    fetchAllRows(()=>sb.from(CTRL_TABLAS.inc).select('*').eq('obra_id',OBRA.id),'fecha_hora'),
    fetchAllRows(()=>sb.from(CTRL_TABLAS.casosIMSS).select('*,control_casos_imss_semanas(*)').eq('obra_id',OBRA.id).is('eliminado_en',null),'created_at'),
    fetchAllRows(()=>sb.from(CTRL_TABLAS.st7).select('*').eq('obra_id',OBRA.id),'recibido_en')
  ]);
  const error=ir.error||cr.error||sr.error;if(error){toast(ctrlFaltaScript(error),'err');return;}
  const incidentes=(ir.data||[]).sort((a,b)=>String(b.fecha_hora).localeCompare(String(a.fecha_hora)));
  const casos=(cr.data||[]).sort((a,b)=>String(b.certificado_desde||b.created_at).localeCompare(String(a.certificado_desde||a.created_at)));
  const acuses=(sr.data||[]).sort((a,b)=>String(b.recibido_en).localeCompare(String(a.recibido_en)));
  window._CTRLINC=incidentes;window._CTRLIMSS=casos;window._CTRLST7=acuses;
  const mapa=new Map();
  function agregar(id,tipo,registro){
    const clave=id||`incidente:${registro.id}`;
    if(!mapa.has(clave))mapa.set(clave,{clave,trabajador_id:id,incidentes:[],casos:[],st7:[]});
    mapa.get(clave)[tipo].push(registro);
  }
  incidentes.forEach(x=>agregar(x.trabajador_id,'incidentes',x));
  casos.forEach(x=>agregar(x.trabajador_id,'casos',x));
  acuses.forEach(x=>agregar(x.trabajador_id,'st7',x));
  const grupos=[...mapa.values()].map(g=>{
    const w=WORKERS.find(x=>x.id===g.trabajador_id),i=g.incidentes[0];
    g.numero=w?.no_trab??i?.trabajador_numero??null;
    g.nombre=w?fullName(w):i?.trabajador_nombre||'Trabajador no visible';
    g.busqueda=`${g.numero??''} ${g.nombre} ${g.casos.map(x=>`${x.folio_certificado||''} ${x.folio_st7||''}`).join(' ')} ${g.st7.map(x=>x.folio_st7).join(' ')}`
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return g;
  }).sort((a,b)=>(Number(a.numero)||999999)-(Number(b.numero)||999999)||a.nombre.localeCompare(b.nombre,'es'));
  window._CTRLSALUD=grupos;
  modal(ctrlNav('🦺 Expediente único de incidentes e IMSS')+`<div class="m-body">
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn dark" onclick="openCtrlNuevoIncidente()">＋ Incidente</button><button class="btn dark" onclick="openCtrlNuevoCasoIMSS()">＋ Incapacidad / importar certificado</button><button class="btn" onclick="openCtrlNuevoST7()">＋ Recepción ST-7</button><button class="btn" onclick="ctrlExportIncidentes()">⬇ Excel de incidentes</button><button class="btn" onclick="openCtrlGuiaST7()">? Guía ST-7</button></div>
    <p class="fhint" style="margin-top:9px">Un expediente por trabajador reúne hechos, certificados, calendario de nómina y ST-7; cada documento conserva su fecha y folio. “Probable riesgo” no equivale a calificación del IMSS.</p>
    <div style="margin-top:10px"><label>Buscar por número, nombre o folio</label><input id="salud-buscar" type="search" placeholder="Ej. 366, Yovani, PK247642" oninput="ctrlFiltrarSalud(this.value)"><small id="salud-conteo" style="display:block;margin-top:4px;color:var(--mut)">${grupos.length} trabajador(es) · ${incidentes.length} incidente(s) · ${casos.length} caso(s) IMSS · ${acuses.length} ST-7</small></div>
    ${grupos.length?grupos.map((g,idx)=>`<div data-salud-idx="${idx}" style="border:1px solid var(--line);border-radius:10px;margin-top:12px;padding:12px">
      <div style="font-weight:800;color:var(--navy);font-size:14px">#${esc(g.numero??'—')} · ${esc(g.nombre)}</div>
      <small style="color:var(--mut)">${g.incidentes.length} incidente(s) · ${g.casos.length} certificado(s)/caso(s) · ${g.st7.length} ST-7</small>
      ${g.incidentes.map(i=>`<div style="margin-top:10px;padding:9px;border-left:3px solid var(--amber);background:var(--amber-bg);border-radius:5px"><b>🦺 Incidente · ${st7Fecha(i.fecha_hora)}</b> · ${esc(i.tipo)} · ${esc(i.severidad)} · ${ctrlEstado(i.estado)}<br><small>${i.posible_riesgo_trabajo?'Probable riesgo · ':''}${esc(i.lugar||'')} · ${esc(i.folio_st7||i.folio_imss||'Sin folio')}</small><br>${i.estado!=='CERRADO'?`<button class="btn" style="padding:4px 7px;margin-top:4px" onclick="openCtrlSeguimientoInc('${i.id}')">Seguimiento</button> `:''}<button class="btn" style="padding:4px 7px;margin-top:4px" onclick="ctrlAbrirCasoDesdeIncidente('${i.id}')">${g.casos.some(c=>c.incidente_id===i.id)?'Abrir calendario vinculado':'Nuevo certificado de este incidente'}</button></div>`).join('')}
      ${g.casos.map(c=>{const ss=c.control_casos_imss_semanas||[];return `<div style="margin-top:10px;padding:9px;border-left:3px solid var(--blue);background:var(--blue-bg);border-radius:5px"><b>🏥 ${esc(c.tipo_caso||'Caso IMSS')} · ${c.certificado_desde?fmtD(c.certificado_desde)+' a '+fmtD(c.certificado_hasta):'Certificado pendiente'}</b> · ${ctrlEstado(c.estado)}<br><small>${esc((c.ramo_certificado||'').replaceAll('_',' '))} · Folio ${esc(c.folio_certificado||'pendiente')}${c.incidente_id?' · Vinculado a incidente':''}</small><br><small>${ss.map(s=>`S${s.semana}: ${s.dias_pagados_empresa} empresa · ${s.dias_imss_estimados||0} IMSS esperado · ${s.dias_sin_subsidio||0} sin pago`).join(' | ')||'Sin distribución semanal'}</small><br><button class="btn" style="padding:4px 7px;margin-top:4px" onclick="openCtrlSemanaIMSS('${c.id}')">Calendario</button> <button class="btn" style="padding:4px 7px;margin-top:4px" onclick="openCtrlEditarCasoIMSS('${c.id}')">Editar</button> <button class="btn" style="padding:4px 7px;margin-top:4px" onclick="openCtrlActualizarCasoIMSS('${c.id}')">Seguimiento</button>${c.datos_documento?` <button class="btn" style="padding:4px 7px;margin-top:4px" onclick="ctrlDetalleDocumentoIMSS('${c.id}')">Datos</button>`:''}${c.certificado_archivo?` <button class="btn" style="padding:4px 7px;margin-top:4px" onclick="ctrlVerCertificadoIMSS('${c.id}')">📎 Certificado</button>`:` <button class="btn" style="padding:4px 7px;margin-top:4px" onclick="ctrlAdjuntarCertificadoIMSS('${c.id}')">Adjuntar certificado</button>`}${esAdmin()?` <button class="btn danger" style="padding:4px 7px;margin-top:4px" onclick="ctrlArchivarCasoIMSS('${c.id}')">Eliminar caso</button>`:''}</div>`;}).join('')}
      ${g.st7.map(s=>`<div style="margin-top:10px;padding:9px;border-left:3px solid var(--green);background:var(--green-bg);border-radius:5px"><b>📋 ST-7 ${esc(s.folio_st7)}</b> · Recibido ${st7Fecha(s.recibido_en)} · ${s.devuelto_en?'Devuelto '+st7Fecha(s.devuelto_en):'Pendiente de devolución'}${st7Pendientes(s)}<small>IMSS: ${st7Fecha(s.aviso_imss_en)} · STPS: ${st7Fecha(s.aviso_stps_en)} · ${s.acuse_firmado_archivo?'Acuse archivado':'Sin acuse firmado archivado'}</small><br><button class="btn" style="padding:4px 7px;margin-top:4px" onclick="ctrlImprimirAcuseST7('${s.id}')">Imprimir acuse</button>${!s.devuelto_en?` <button class="btn" style="padding:4px 7px;margin-top:4px" onclick="openCtrlEntregaST7('${s.id}')">Registrar entrega</button>`:''} <button class="btn" style="padding:4px 7px;margin-top:4px" onclick="openCtrlAvisosST7('${s.id}')">Avisos</button>${s.acuse_firmado_archivo?` <button class="btn" style="padding:4px 7px;margin-top:4px" onclick="ctrlVerAcuseST7('${s.id}')">Ver firmado</button>`:s.devuelto_en?` <label class="btn" style="padding:4px 7px;display:inline-block;cursor:pointer">Archivar firmado<input id="st7-scan-${s.id}" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display:none" onchange="ctrlSubirAcuseST7('${s.id}')"></label>`:''}</div>`).join('')}
    </div>`).join(''):'<div class="empty">No hay incidentes, incapacidades ni ST-7 en este centro.</div>'}
  </div>`,'lg');
}
function ctrlFiltrarSalud(texto){
  const q=String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();let n=0;
  document.querySelectorAll('[data-salud-idx]').forEach(el=>{const g=(window._CTRLSALUD||[])[Number(el.dataset.saludIdx)],visible=!!g?.busqueda.includes(q);el.style.display=visible?'':'none';if(visible)n++;});
  if($('salud-conteo'))$('salud-conteo').textContent=`${n} trabajador(es) visibles`;
}
async function ctrlAbrirCasoDesdeIncidente(id){
  const {data,error}=await sb.from(CTRL_TABLAS.casosIMSS).select('id').eq('obra_id',OBRA.id).eq('incidente_id',id).is('eliminado_en',null).limit(1);
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  if(data?.length){await openCtrlCasosIMSS();openCtrlSemanaIMSS(data[0].id);}else openCtrlNuevoCasoIMSS(id);
}
function openCtrlNuevoIncidente(){
  const now=new Date(),local=new Date(now-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
  modal(ctrlNav('＋ Incidente o incapacidad','openCtrlIncidentes')+`<div class="m-body"><div class="grid" style="grid-template-columns:2fr 1fr">
    <div><label>Trabajador</label><select id="ci-w">${WORKERS.map(w=>`<option value="${w.id}">#${w.no_trab??'—'} · ${esc(fullName(w))}</option>`).join('')}</select></div><div><label>Tipo</label><select id="ci-t"><option>ACCIDENTE</option><option>INCIDENTE</option><option>ENFERMEDAD</option><option>INCAPACIDAD</option></select></div>
    <div><label>Fecha y hora</label><input id="ci-fe" type="datetime-local" value="${local}"></div><div><label>Severidad</label><select id="ci-se"><option>LEVE</option><option>MODERADA</option><option>GRAVE</option><option>FATAL</option></select></div>
    <div class="c2" style="grid-column:span 2"><label>Lugar *</label><input id="ci-lu"></div><div class="c2" style="grid-column:span 2"><label>Descripción objetiva *</label><textarea id="ci-de" rows="3"></textarea></div>
    <div><label><input id="ci-rt" type="checkbox"> Posible riesgo de trabajo</label></div><div><label>Días de incapacidad</label><input id="ci-di" type="number" min="0" value="0"></div>
    <div><label>Desde</label><input id="ci-id" type="date"></div><div><label>Hasta</label><input id="ci-ih" type="date"></div><div><label>Folio ST-7</label><input id="ci-st"></div><div><label>Folio IMSS</label><input id="ci-im"></div>
    <div><label>Testigos</label><input id="ci-te"></div><div><label>Responsable</label><input id="ci-re"></div><div class="c2" style="grid-column:span 2"><label>Acciones inmediatas</label><textarea id="ci-ac" rows="2"></textarea></div>
    <div class="c2" style="grid-column:span 2"><label>Enlace de evidencia</label><input id="ci-url" placeholder="https://..."></div></div></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlIncidentes()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarIncidente()">Guardar</button></div>`,'lg');
}
async function ctrlGuardarIncidente(){
  const w=WORKERS.find(x=>x.id===$('ci-w').value),l=$('ci-lu').value.trim(),d=$('ci-de').value.trim();if(!w||!l||!d){toast('Completa trabajador, lugar y descripción.','err');return;}
  const f={obra_id:OBRA.id,trabajador_id:w.id,trabajador_numero:w.no_trab,trabajador_nombre:fullName(w),tipo:$('ci-t').value,fecha_hora:new Date($('ci-fe').value).toISOString(),lugar:l,descripcion:d,severidad:$('ci-se').value,
    posible_riesgo_trabajo:$('ci-rt').checked,incapacidad_desde:$('ci-id').value||null,incapacidad_hasta:$('ci-ih').value||null,dias_incapacidad:parseInt($('ci-di').value)||0,folio_st7:$('ci-st').value.trim(),folio_imss:$('ci-im').value.trim(),
    evidencia_url:$('ci-url').value.trim()||null,testigos:$('ci-te').value.trim(),acciones_inmediatas:$('ci-ac').value.trim(),responsable:$('ci-re').value.trim(),creado_por_email:USER.email||''};
  markWrite();const {data,error}=await sb.from(CTRL_TABLAS.inc).insert(f).select('id').single();if(error){toast(ctrlFaltaScript(error),'err');return;}await ctrlAuditar('INCIDENTES','REGISTRAR',{tipo:f.tipo,severidad:f.severidad,posible_rt:f.posible_riesgo_trabajo},'INCIDENTE',data.id);toast('Incidente registrado para seguimiento.','ok');openCtrlIncidentes();
}
function openCtrlSeguimientoInc(id){
  modal(ctrlNav('🦺 Seguimiento del incidente','openCtrlIncidentes')+`<div class="m-body"><div><label>Seguimiento / acciones correctivas *</label><textarea id="cis-seg" rows="4"></textarea></div><div style="margin-top:8px"><label>Estado</label><select id="cis-est"><option>EN_SEGUIMIENTO</option><option>CERRADO</option></select></div><div style="margin-top:8px"><label>Calificación</label><select id="cis-cal"><option>PENDIENTE_AUTORIDAD</option><option>SI_TRABAJO</option><option>NO_TRABAJO</option></select></div></div>
  <div class="m-foot"><button class="btn" onclick="openCtrlIncidentes()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarSeguimiento('${id}')">Guardar</button></div>`,'md');
}
async function ctrlGuardarSeguimiento(id){const s=$('cis-seg').value.trim();if(!s){toast('Escribe el seguimiento.','err');return;}const estado=$('cis-est').value,up={seguimiento:s,estado,calificacion:$('cis-cal').value,cerrado_en:estado==='CERRADO'?new Date().toISOString():null};markWrite();const {error}=await sb.from(CTRL_TABLAS.inc).update(up).eq('id',id).eq('obra_id',OBRA.id);if(error){toast(ctrlFaltaScript(error),'err');return;}await ctrlAuditar('INCIDENTES','SEGUIMIENTO',up,'INCIDENTE',id);toast('Seguimiento actualizado.','ok');openCtrlIncidentes();}
async function ctrlExportIncidentes(){const a=window._CTRLINC||[];await ctrlExportar('INCIDENTES E INCAPACIDADES',['FECHA','NO.','TRABAJADOR','TIPO','SEVERIDAD','POSIBLE RT','CALIFICACIÓN','DÍAS INCAPACIDAD','ST-7','IMSS','ESTADO','DESCRIPCIÓN','ACCIONES','SEGUIMIENTO'],a.map(x=>[x.fecha_hora,x.trabajador_numero??'',x.trabajador_nombre,x.tipo,x.severidad,x.posible_riesgo_trabajo?'SÍ':'NO',x.calificacion,x.dias_incapacidad,x.folio_st7||'',x.folio_imss||'',x.estado,x.descripcion,x.acciones_inmediatas||'',x.seguimiento||'']),'INCIDENTES_INCAPACIDADES','INCIDENTES');}
/* ---------- ST-7: recepción, devolución y evidencia privada ---------- */
const st7Fecha=v=>v?new Date(v).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'short'}):'Pendiente';
const st7InputAhora=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const st7ISO=id=>{const v=$(id)?.value;if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();};
function st7Pendientes(s){
  const avisos=[];
  if(!s.devuelto_en)avisos.push(Date.now()>new Date(s.recibido_en).getTime()+86400000?'⚠ Meta interna 24 h vencida':'Meta interna: devolver en 24 h');
  if(s.accidente_en_centro===true&&s.accidente_en){
    const t=new Date(s.accidente_en).getTime();
    if(!s.aviso_imss_en)avisos.push(Date.now()>t+86400000?'⚠ Revisar aviso IMSS 24 h':'Revisar aviso IMSS 24 h');
    if(!s.aviso_stps_en)avisos.push(Date.now()>t+259200000?'⚠ Revisar aviso STPS 72 h':'Revisar aviso STPS 72 h');
  }
  return avisos.map(x=>`<small style="display:block;color:${x.startsWith('⚠')?'var(--amber)':'var(--mut)'}">${esc(x)}</small>`).join('');
}
async function openCtrlST7(){
  return openCtrlIncidentes();
}
async function openCtrlNuevoST7(){
  const [ir,cr]=await Promise.all([
    fetchAllRows(()=>sb.from(CTRL_TABLAS.inc).select('id,trabajador_id,fecha_hora,tipo').eq('obra_id',OBRA.id),'fecha_hora'),
    fetchAllRows(()=>sb.from(CTRL_TABLAS.casosIMSS).select('id,trabajador_id,folio_st7,fecha_evento').eq('obra_id',OBRA.id).is('eliminado_en',null),'created_at')
  ]);
  if(ir.error||cr.error){toast(ctrlFaltaScript(ir.error||cr.error),'err');return;}
  window._ST7VINCULOS={inc:ir.data||[],casos:cr.data||[]};
  modal(ctrlNav('📋 Recepción de ST-7','openCtrlST7')+`<div class="m-body">
    <p class="fhint">Captura la hora <b>real</b> en que recibiste el ST-7. El servidor guarda además la hora de registro, que no podrás modificar. Confirma la identidad y el folio contra el documento original.</p>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div style="grid-column:span 2"><label>Trabajador *</label><select id="st7-w" onchange="ctrlST7Vinculos()"><option value="">Seleccionar</option>${[...WORKERS].sort((a,b)=>(a.no_trab??999999)-(b.no_trab??999999)).map(w=>`<option value="${w.id}">#${w.no_trab??'—'} · ${esc(fullName(w))}</option>`).join('')}</select></div>
      <div><label>Folio ST-7 *</label><input id="st7-folio" maxlength="80"></div>
      <div><label>Fecha y hora de recepción *</label><input id="st7-rec" type="datetime-local" value="${st7InputAhora()}"></div>
      <div><label>Entregado por *</label><input id="st7-de" maxlength="160" placeholder="Nombre de quien entrega"></div>
      <div><label>Recibido en la empresa por *</label><input id="st7-por" maxlength="160" placeholder="Nombre y cargo"></div>
      <div><label>Fecha y hora del accidente, si consta</label><input id="st7-acc" type="datetime-local"></div>
      <div><label>¿Ocurrió en el centro de trabajo?</label><select id="st7-centro"><option value="">No determinado</option><option value="si">Sí</option><option value="no">No</option></select></div>
      <div><label>Incidente relacionado</label><select id="st7-inc"><option value="">Ninguno</option></select></div>
      <div><label>Caso IMSS relacionado</label><select id="st7-caso"><option value="">Ninguno</option></select></div>
      <div style="grid-column:span 2"><label>Observaciones administrativas, sin diagnóstico</label><textarea id="st7-obs" rows="2"></textarea></div>
    </div><p class="fhint">Si fue accidente en el centro: aviso escrito al IMSS dentro de 24 h del evento; aviso a STPS dentro de 72 h. Son obligaciones <b>distintas</b> de llenar/devolver el ST-7. El objetivo de devolución en 24 h desde recepción es sólo control interno.</p></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlST7()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarRecepcionST7()">Guardar recepción</button></div>`,'lg');
}
function ctrlST7Vinculos(){
  const id=$('st7-w').value,v=window._ST7VINCULOS||{inc:[],casos:[]};
  $('st7-inc').innerHTML='<option value="">Ninguno</option>'+v.inc.filter(x=>x.trabajador_id===id).map(x=>`<option value="${x.id}">${esc(x.tipo)} · ${st7Fecha(x.fecha_hora)}</option>`).join('');
  $('st7-caso').innerHTML='<option value="">Ninguno</option>'+v.casos.filter(x=>x.trabajador_id===id).map(x=>`<option value="${x.id}">${esc(x.folio_st7||'Caso IMSS')} · ${esc(fmtD(x.fecha_evento))}</option>`).join('');
}
async function ctrlGuardarRecepcionST7(){
  const w=WORKERS.find(x=>x.id===$('st7-w').value),rec=st7ISO('st7-rec'),folio=$('st7-folio').value.trim(),de=$('st7-de').value.trim(),por=$('st7-por').value.trim();
  if(!w||!rec||!folio||!de||!por){toast('Completa trabajador, folio, fecha y hora, quien entrega y quien recibe.','err');return;}
  if(new Date(rec).getTime()>Date.now()+300000){toast('La recepción no puede ser futura.','err');return;}
  const up={obra_id:OBRA.id,trabajador_id:w.id,incidente_id:$('st7-inc').value||null,caso_imss_id:$('st7-caso').value||null,folio_st7:folio,
    accidente_en_centro:$('st7-centro').value===''?null:$('st7-centro').value==='si',accidente_en:st7ISO('st7-acc'),
    recibido_en:rec,recibido_de:de,recibido_por:por,observaciones:$('st7-obs').value.trim()||null};
  markWrite();const {data,error}=await sb.from(CTRL_TABLAS.st7).insert(up).select('id').single();
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  await ctrlAuditar('ST7','RECEPCION',{folio,recibido_en:rec},'ST7',data.id);
  toast('Recepción registrada. Imprime el acuse y recaba ambas firmas.','ok');await openCtrlST7();
}
function openCtrlEntregaST7(id){
  const s=(window._CTRLST7||[]).find(x=>x.id===id);if(!s||s.devuelto_en)return;
  modal(ctrlNav('📋 Entrega del ST-7 contestado','openCtrlST7')+`<div class="m-body"><p>Folio <b>${esc(s.folio_st7)}</b> · recibido ${st7Fecha(s.recibido_en)}.</p>
    <p class="fhint">Registra la fecha y hora <b>real</b> de devolución del ST-7 llenado y firmado al trabajador. La captura del servidor queda separada. Imprime de nuevo el acuse para firmar esta segunda entrega.</p>
    <div><label>Fecha y hora de devolución *</label><input id="st7-dev" type="datetime-local" value="${st7InputAhora()}"></div>
    <div><label>Entregado a *</label><input id="st7-dest" maxlength="160" placeholder="Nombre del trabajador o representante"></div>
    <div><label>Entregado por *</label><input id="st7-entrega" maxlength="160" placeholder="Nombre del responsable de la empresa"></div></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlST7()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarEntregaST7('${id}')">Confirmar entrega</button></div>`,'md');
}
async function ctrlGuardarEntregaST7(id){
  const s=(window._CTRLST7||[]).find(x=>x.id===id),fecha=st7ISO('st7-dev'),a=$('st7-dest').value.trim(),por=$('st7-entrega').value.trim();
  if(!s||!fecha||!a||!por||new Date(fecha)<new Date(s.recibido_en)||new Date(fecha).getTime()>Date.now()+300000){toast('Revisa fecha, hora y nombres de la devolución.','err');return;}
  markWrite();const {error}=await sb.from(CTRL_TABLAS.st7).update({devuelto_en:fecha,devuelto_a:a,devuelto_por:por}).eq('id',id).eq('obra_id',OBRA.id).is('devuelto_en',null);
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  await ctrlAuditar('ST7','ENTREGA',{devuelto_en:fecha,devuelto_a:a},'ST7',id);toast('Devolución registrada. Imprime y firma el acuse actualizado.','ok');openCtrlST7();
}
function openCtrlAvisosST7(id){
  const s=(window._CTRLST7||[]).find(x=>x.id===id);if(!s)return;
  modal(ctrlNav('📣 Avisos del accidente','openCtrlST7')+`<div class="m-body"><p>ST-7 ${esc(s.folio_st7)}. Capturar aquí no presenta avisos ante la autoridad: conserva los acuses oficiales por separado.</p>
    <div><label>Fecha y hora del aviso al IMSS</label><input id="st7-imss" type="datetime-local" ${s.aviso_imss_en?'disabled':''}></div>
    <div><label>Fecha y hora del aviso a STPS</label><input id="st7-stps" type="datetime-local" ${s.aviso_stps_en?'disabled':''}></div>
    <p class="fhint">IMSS: 24 h desde accidente en el centro de trabajo; fuera de él, al tener conocimiento. STPS: 72 h para aviso de accidente de trabajo. No hay plazo legal general encontrado para que el patrón devuelva el reverso del ST-7.</p></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlST7()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarAvisosST7('${id}')">Guardar avisos capturados</button></div>`,'md');
}
async function ctrlGuardarAvisosST7(id){
  const s=(window._CTRLST7||[]).find(x=>x.id===id);if(!s)return;
  const up={};if(!s.aviso_imss_en&&$('st7-imss').value)up.aviso_imss_en=st7ISO('st7-imss');
  if(!s.aviso_stps_en&&$('st7-stps').value)up.aviso_stps_en=st7ISO('st7-stps');
  if(!Object.keys(up).length){toast('Captura al menos un aviso nuevo.','err');return;}
  if(Object.values(up).some(x=>!x||new Date(x).getTime()>Date.now()+300000)){toast('La fecha del aviso no puede ser futura.','err');return;}
  markWrite();const {error}=await sb.from(CTRL_TABLAS.st7).update(up).eq('id',id).eq('obra_id',OBRA.id);
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  await ctrlAuditar('ST7','AVISOS',up,'ST7',id);toast('Fechas registradas; verifica que tengas los acuses oficiales.','ok');openCtrlST7();
}
async function ctrlSubirAcuseST7(id){
  const s=(window._CTRLST7||[]).find(x=>x.id===id),file=$('st7-scan-'+id)?.files?.[0];if(!s||!s.devuelto_en||!file)return;
  const tipos={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'},ext=tipos[file.type];
  if(!ext||file.size>8388608){toast('Sube JPG, PNG, WebP o PDF de máximo 8 MB.','err');return;}
  const ruta=`${OBRA.id}/${s.trabajador_id}/${id}/${crypto.randomUUID()}.${ext}`;
  markWrite();const {error:upErr}=await sb.storage.from('st7-expedientes').upload(ruta,file,{contentType:file.type,upsert:false});
  if(upErr){toast('No se pudo archivar: '+upErr.message,'err');return;}
  const {error}=await sb.from(CTRL_TABLAS.st7).update({acuse_firmado_archivo:ruta}).eq('id',id).eq('obra_id',OBRA.id).is('acuse_firmado_archivo',null);
  if(error){toast('Archivo privado subido, pero no quedó vinculado: '+ctrlFaltaScript(error)+'. Contacta al administrador.','err');return;}
  await ctrlAuditar('ST7','ACUSE_FIRMADO',{archivo:ruta},'ST7',id);toast('Acuse firmado archivado.','ok');openCtrlST7();
}
async function ctrlVerAcuseST7(id){
  const s=(window._CTRLST7||[]).find(x=>x.id===id);if(!s?.acuse_firmado_archivo)return;
  const {data,error}=await sb.storage.from('st7-expedientes').createSignedUrl(s.acuse_firmado_archivo,60);
  if(error){toast(error.message,'err');return;}window.open(data.signedUrl,'_blank','noopener');
}
function ctrlImprimirAcuseST7(id){
  const s=(window._CTRLST7||[]).find(x=>x.id===id),w=WORKERS.find(x=>x.id===s?.trabajador_id);if(!s||!w)return;
  const codigo=empresaDeObra(OBRA),empresa=CFGEMP['empresa_'+codigo]||{},razon=razonSocialEmpresa(codigo),generado=st7Fecha(new Date());
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acuse interno ST-7 ${esc(s.folio_st7)}</title><style>
    @page{size:letter portrait;margin:14mm}*{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#172033;margin:0}
    header{display:flex;align-items:center;border-bottom:2px solid #183b61;padding-bottom:5mm;gap:6mm}header img{width:28mm;height:18mm;object-fit:contain}header div{flex:1;text-align:right;font-size:8pt;line-height:1.4}header b{font-size:11pt;color:#183b61}
    h1{text-align:center;font-size:14pt;color:#183b61;margin:7mm 0 2mm}h2{font-size:10pt;color:#183b61;background:#e9eff7;padding:2mm;margin:7mm 0 3mm}
    p{margin:2mm 0;line-height:1.4}.grid{display:grid;grid-template-columns:1fr 1fr;gap:2mm 7mm}.dato{border-bottom:1px solid #d5dee8;padding:2mm 0}
    .firmas{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:15mm}.firma{text-align:center;border-top:1px solid #172033;padding-top:2mm;font-size:8pt}
    .nota{margin-top:6mm;padding:3mm;border:1px solid #bbc9d9;font-size:8pt}.pie{margin-top:5mm;font-size:7pt;color:#536277}
    button{position:fixed;right:10px;top:10px;background:#183b61;color:white;border:0;padding:8px;border-radius:5px}@media print{button{display:none}}
    </style></head><body><button onclick="window.print()">Imprimir / Guardar PDF</button>
    <header><img src="${logoEmpresa(codigo)}"><div><b>${esc(razon)}</b><br>RFC ${esc(empresa.rfc||'—')}<br>${esc(empresa.domicilio||'')}</div></header>
    <h1>ACUSE INTERNO DE RECEPCIÓN Y DEVOLUCIÓN · ST-7</h1><p style="text-align:center">Centro de trabajo: <b>${esc(OBRA.nombre)}</b> · Registro patronal: ${esc(OBRA.registro_patronal||'—')}</p>
    <div class="grid"><div class="dato"><b>Trabajador:</b> #${esc(w.no_trab??'—')} ${esc(fullName(w))}</div><div class="dato"><b>Folio ST-7:</b> ${esc(s.folio_st7)}</div><div class="dato"><b>Accidente referido:</b> ${st7Fecha(s.accidente_en)}</div><div class="dato"><b>Lugar:</b> ${s.accidente_en_centro===null?'No determinado':s.accidente_en_centro?'Centro de trabajo':'Fuera del centro'}</div></div>
    <h2>1. RECEPCIÓN DEL FORMATO EN LA EMPRESA</h2><p>Fecha y hora efectiva de recepción: <b>${st7Fecha(s.recibido_en)}</b></p><p>Entregado por: ${esc(s.recibido_de)} · Recibido por: ${esc(s.recibido_por)}</p><p>Capturado en la plataforma: ${st7Fecha(s.registrado_en)}. La firma acredita la entrega física indicada; la captura digital por sí sola no la sustituye.</p>
    <div class="firmas"><div class="firma">Firma de quien entrega el ST-7<br>${esc(s.recibido_de)}</div><div class="firma">Firma de quien recibe por la empresa<br>${esc(s.recibido_por)}</div></div>
    <h2>2. DEVOLUCIÓN DEL ST-7 CONTESTADO AL TRABAJADOR</h2>${s.devuelto_en?`<p>Fecha y hora efectiva de devolución: <b>${st7Fecha(s.devuelto_en)}</b></p><p>Entregado a: ${esc(s.devuelto_a)} · Entregado por: ${esc(s.devuelto_por)}</p><p>Capturado en la plataforma: ${st7Fecha(s.devolucion_registrada_en)}</p>`:'<p>Fecha y hora efectiva de devolución: __________________________ &nbsp; Entregado a: __________________________</p>'}
    <div class="firmas"><div class="firma">Firma y nombre de quien recibe el ST-7 contestado<br>${esc(s.devuelto_a||'')}</div><div class="firma">Firma de quien entrega por la empresa<br>${esc(s.devuelto_por||'')}</div></div>
    <div class="nota"><b>Alcance:</b> Acuse administrativo interno de recepción y devolución. No sustituye el formato ST-7 del IMSS, su calificación, ni el acuse oficial de avisos al IMSS o a la STPS. No implica aceptación ni rechazo de un riesgo de trabajo. Conservar dos tantos firmados y archivar la copia digital.</div>
    <div class="pie">Folio interno: ${esc(s.id)} · Generado: ${generado} · Fundamento operativo: LSS art. 51; Reglamento de Prestaciones Médicas del IMSS arts. 22–24; LFT art. 504, fr. V. Los avisos oficiales se acreditan por separado.</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),450)<\/script></body></html>`;
  const win=window.open('','_blank');if(!win){toast('Permite ventanas emergentes para imprimir el acuse.','err');return;}
  win.document.write(html);win.document.close();ctrlAuditar('ST7','IMPRIMIR_ACUSE',{folio:s.folio_st7},'ST7',id);
}
function openCtrlGuiaST7(){
  modal(ctrlNav('📋 ST-7 · plazos y evidencia','openCtrlST7')+`<div class="m-body" style="line-height:1.55">
    <p><b>1.</b> Registra el momento real en que la empresa recibió el ST-7 y quién lo entregó. Imprime el acuse interno en dos tantos y recaba las dos firmas de recepción.</p>
    <p><b>2.</b> Completa el reverso del ST-7 oficial con los hechos que constan, sin diagnosticar ni calificar el riesgo. Registra la hora real de devolución al trabajador; imprime de nuevo el acuse y firma la segunda sección. Archiva el escaneo firmado.</p>
    <p><b>3.</b> Registra por separado los avisos y conserva sus acuses oficiales: accidente en el centro de trabajo, aviso escrito al IMSS dentro de <b>24 horas del evento</b> (art. 22 del Reglamento de Prestaciones Médicas); accidente de trabajo, aviso a STPS dentro de <b>72 horas</b> (art. 504, fr. V, LFT). Fuera del centro, el aviso al IMSS procede al conocer el accidente.</p>
    <p><b>Plazo de devolución del ST-7:</b> no se identificó en estas fuentes un plazo legal general de 24 o 72 horas para que el patrón conteste el reverso. Se propone <b>24 horas desde recepción como meta interna</b>, sin presentarla como ley. El IMSS permite que el trámite continúe aun si el patrón no lo llena.</p>
    <p style="font-size:11px"><a target="_blank" rel="noopener" href="https://www.imss.gob.mx/tramites/imss03008">Trámite ST-7 IMSS</a> · <a target="_blank" rel="noopener" href="https://www.imss.gob.mx/sites/all/statics/pdf/reglamentos/4045_RPMIMSS.pdf">Reglamento IMSS</a> · <a target="_blank" rel="noopener" href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf">LFT</a></p>
    <p class="fhint">Este acuse no tiene sello de autoridad. Si falta una firma, su fuerza probatoria es limitada; documenta la negativa o imposibilidad por medios adicionales y consulta al área jurídica.</p></div>`,'lg');
}
async function ctrlExportar(titulo,headers,data,nombre,modulo){
  if(!data.length){toast('No hay información para exportar.','err');return;}
  const rows=[[titulo+' — '+OBRA.nombre],[razonSocialEmpresa(empresaDeObra(OBRA))+' · Generado '+new Date().toLocaleString('es-MX')],headers,...data],styles=[ST.title,ST.sub,ST.head,...data.map(()=>headers.map((_,i)=>/MONTO|NETO|REAL|PRESUP|NÓMINA|PREVISIÓN|RETENCIÓN|FINIQUITO|DIFERENCIA/i.test(headers[i])?ST.money:ST.cell))];
  const ws=buildSheet(rows,styles,headers.map(h=>Math.max(12,Math.min(34,h.length+5))),[{s:{r:0,c:0},e:{r:0,c:headers.length-1}},{s:{r:1,c:0},e:{r:1,c:headers.length-1}}],[{hpt:26},{hpt:20},{hpt:28}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:2,c:0},e:{r:2+data.length,c:headers.length-1}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,nombre.slice(0,31));wb.__empresaPorHoja={[nombre.slice(0,31)]:empresaDeObra(OBRA)};wb.__auditObraIds=[OBRA.id];
  await dl(wb,`${nombre}_${OBRA.nombre.replace(/[^A-ZÑ0-9]+/gi,'_')}_${today()}.xlsx`);await ctrlAuditar(modulo,'EXPORTAR_EXCEL',{filas:data.length,archivo:nombre});toast('Excel generado con razón social y logotipo.','ok');
}
function openManualControl(){
  ctrlAuditar('MANUAL','ABRIR');
  modal(ctrlNav('❔ Guía rápida del Centro de control')+`<div class="m-body" style="line-height:1.55">
    <div class="sect">1. Cierre, pagos y entrega de cheques</div><p>En “Cierre de nómina → Flujo integrado” prepara la fotografía, importa NOI y lee los recibos archivados. Contabilidad envía a revisión; el administrador autoriza una versión fija. Las diferencias bloquean pagos. Un cheque expedido cuenta como pago registrado aunque falte entregarlo; las reuniones controlan esa entrega aparte. Los pagos parciales muestran saldo y nunca duplican un mismo comprobante global e individual. El finiquito sale por cheque salvo excepción confirmada del administrador o sustitución exacta por la contadora autorizada. Reabrir requiere solicitud y aprobación, y conserva versiones y comprobantes. Las regularizaciones históricas se presentan antes de aplicar.</p><p><button class="btn" onclick="PLATINUM_FLOWS.manual()">? Guía del flujo integrado</button></p>
    <div class="sect">2. IMSS, IDSE y SUA</div><p>Usa “Detectar altas y bajas” cada semana y agrega manualmente cambios de salario e incapacidades. La fecha interna del lunes no cambia la fecha efectiva. Para marcar presentado debes guardar folio o evidencia.</p>
    <div class="sect">3. Expediente de cumplimiento</div><p>Captura SIROC, REPSE, contratos, opiniones positivas, pólizas y licencias. El semáforo depende de la vigencia y los días de alerta. “No aplica” debe usarse solo con justificación.</p>
    <div class="sect">4. Costos de obra</div><p>Captura presupuesto semanal y la carga patronal real tomada del SUA. Transferencias, cheques, previsión y finiquitos se leen de los módulos existentes. Compara siempre el real confirmado contra la proyección.</p>
    <div class="sect">5. Expediente único de incidentes e IMSS</div><p>Busca al trabajador en una sola lista: verás juntos sus incidentes, certificados, calendarios y ST-7, sin borrar ni mezclar documentos de fechas distintas. Registra hechos, testigos y acciones sin inferir diagnósticos. Captura el ramo y tipo exactos del certificado, fechas, folio y probable riesgo. Distribuye por semana los días pagados por la empresa y los certificados sin salario patronal; después pulsa “Aplicar a nómina”, nunca registres una incapacidad como falta injustificada. Valida el neto contra NOI. Sólo registra “Sí/No de trabajo” con dictamen del IMSS; conserva ST-2 si corresponde.</p>
    <div class="sect">6. Altas y bajas sin servicio</div><p>Registra por separado lo que muestra la base, las fechas efectivas en acuses IDSE y el escenario usado en NOI. Marca “sin servicio confirmado” sólo después de verificar que no hubo horas trabajadas. Los siete casos MG de S26 ya están clasificados. La marca no cambia fechas ni cancela prestaciones o cuotas automáticamente; conserva los acuses y revisa las obligaciones que correspondan.</p>
    <div class="sect">Fuentes oficiales de referencia</div><p style="font-size:11px"><a target="_blank" rel="noopener" href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf">Ley Federal del Trabajo</a> · <a target="_blank" rel="noopener" href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LSS.pdf">Ley del Seguro Social</a> · <a target="_blank" rel="noopener" href="https://www.imss.gob.mx/node/1407">Movimientos afiliatorios / IDSE</a> · <a target="_blank" rel="noopener" href="https://www.imss.gob.mx/siroc/informacion">SIROC</a> · <a target="_blank" rel="noopener" href="https://www.imss.gob.mx/node/73917">SUA</a> · <a target="_blank" rel="noopener" href="https://portalmx.infonavit.org.mx/">INFONAVIT</a> · <a target="_blank" rel="noopener" href="https://asinom.stps.gob.mx/upload/file/Nom030.html">NOM-030-STPS-2009</a>.</p>
    <div style="padding:10px;background:var(--amber-bg);border-radius:8px;font-size:11px">Antes de presentar, confirma días inhábiles, criterios de la autoridad y versión vigente de los sistemas oficiales. Esta guía organiza evidencia y autorizaciones; no sustituye asesoría legal ni el acuse oficial.</div></div>`,'lg');
}

/* Condiciones anteriores del mismo crédito: no sustituir historia por el aviso recién confirmado. */
function infonavitCreditoAFecha(d,fecha){
  if(!d||!Array.isArray(d.infonavit_avisos_historial)||!d.infonavit_avisos_historial.length)return d;
  const iso=fecha instanceof Date?`${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`:String(fecha||today()).slice(0,10);
  const cambios=d.infonavit_avisos_historial.slice().sort((a,b)=>a.desde.localeCompare(b.desde));
  const posterior=cambios.find(x=>iso<x.desde);
  return posterior?{...d,...posterior.antes,id:d.id}:d;
}

