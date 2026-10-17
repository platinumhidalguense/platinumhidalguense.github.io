/* AVISOS INFONAVIT POR REGISTRO PATRONAL — comparación y confirmación explícita. */
let INFAVI=null;
function infAvisoNorm(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();}
function infAvisoFecha(s){
  const m=String(s||'').match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);if(!m)throw Error('Fecha de aviso no reconocida: '+s);
  const iso=`${m[3]}-${m[2]}-${m[1]}`,d=new Date(iso+'T12:00:00Z');
  if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==iso)throw Error('Fecha inválida: '+s);return iso;
}
function infAvisoPagina(items,width){
  const it=items.filter(x=>String(x.str||'').trim()).flatMap(x=>{
    const z={s:x.str.trim(),x:x.transform[4]/width,y:x.transform[5]};
    const m=z.x>=.235&&z.x<.334&&z.s.match(/^([RS]\d{11})([^\d\s].*)$/);
    return m?[{...z,s:m[1]},{...z,s:m[2],x:.35}]:[z];
  });
  const texto=it.slice().sort((a,b)=>Math.abs(a.y-b.y)<2?a.x-b.x:b.y-a.y).map(x=>x.s).join(' ');
  const anchors=it.filter(x=>x.x<0.145&&/^\d{11}$/.test(x.s)).sort((a,b)=>b.y-a.y),out=[];
  const footer=it.filter(x=>infAvisoNorm(x.s).startsWith('AVISO SOBRE EL USO')).map(x=>x.y);
  for(let i=0;i<anchors.length;i++){
    const a=anchors[i],fin=i+1<anchors.length?anchors[i+1].y+1:Math.max(a.y-95,...footer.filter(y=>y<a.y).map(y=>y+3));
    const row=it.filter(x=>x.y<=a.y+1&&x.y>fin).sort((a,b)=>Math.abs(a.y-b.y)<2?a.x-b.x:b.y-a.y);
    const col=(l,r)=>row.filter(x=>x.x>=l&&x.x<r).map(x=>x.s).join(' ').trim();
    const credito=col(.145,.235).replace(/\s/g,''),zona=row.filter(x=>x.x>=.235&&x.x<.425),esFolio=x=>/^(?:[RS]\d{10,30}|\d{2})$/.test(x.s);
    const folio=zona.filter(esFolio).map(x=>x.s).join(''),nombre=zona.filter(x=>!esFolio(x)).map(x=>x.s).join(' ');
    const tipoTexto=infAvisoNorm(col(.425,.515)),tipo=tipoTexto==='RETENCION'?'RETENCION':tipoTexto==='MODIFICACION'?'MODIFICACION':tipoTexto==='SUSPENSION'?'SUSPENSION':null;
    const mt=infAvisoNorm(col(.835,1)),modalidad=/CUOTA FIJA MENSUAL.*PESOS/.test(mt)?'CUOTA_FIJA':/VECES|VSM|UMI/.test(mt)?'VSM_UMI':/PORCENTAJE|POR CIENTO/.test(mt)?'PORCENTAJE':null;
    const valor=col(.744,.835).replace(/[$,%\s]/g,''),factor=valor?Number(valor):null;
    if(!/^\d{10}$/.test(credito)||!(/^[RS]\d{10,30}$/.test(folio))||!nombre||!tipo||!modalidad||
      (tipo!=='SUSPENSION'&&!(Number.isFinite(factor)&&factor>0)))throw Error('Lectura incompleta en NSS '+a.s+'. No se importó: revisa el formato del PDF.');
    out.push({nss:a.s,credito,folio,nombre,tipo,motivo:col(.515,.645),fecha_aviso:infAvisoFecha(col(.645,.744)),modalidad,factor});
  }
  return {texto,avisos:out};
}
async function infAvisoLeerPDF(bytes){
  if(!window.pdfjsLib)throw Error('No cargó el lector PDF. Recarga la página.');
  const doc=await pdfjsLib.getDocument({data:new Uint8Array(bytes).slice()}).promise;
  let texto='',avisos=[];
  try{
    if(doc.numPages>60)throw Error('El reporte supera 60 páginas. Divide el archivo por registro patronal.');
    for(let p=1;p<=doc.numPages;p++){
      const page=await doc.getPage(p),tc=await page.getTextContent(),r=infAvisoPagina(tc.items,page.getViewport({scale:1}).width);
      texto+=' '+r.texto;avisos.push(...r.avisos);
    }
  }finally{await doc.destroy();}
  const norm=infAvisoNorm(texto),rp=[...norm.matchAll(/REGISTRO PATRONAL\s*:\s*([A-Z0-9]{11})/g)].map(x=>x[1]);
  const tot=[...norm.matchAll(/TOTAL DE AVISOS\s*:\s*(\d+)\s+AVISOS/g)].map(x=>Number(x[1]));
  const corte=[...norm.matchAll(/CORTE DE LA INFORMACION\s*:\s*(\d{2}[/.]\d{2}[/.]\d{4})\s+(\d{2}:\d{2}:\d{2})/g)];
  if(!rp.length||new Set(rp).size!==1||!tot.length||new Set(tot).size!==1||!corte.length||
    new Set(corte.map(x=>x[1]+' '+x[2])).size!==1||avisos.length!==tot[0]||!avisos.length||
    new Set(avisos.map(x=>x.folio)).size!==avisos.length)throw Error('No se pudo validar el registro patronal, corte o total de avisos. No se guardó nada; utiliza el PDF original descargado del portal, no una imagen.');
  return {rp:rp[0],fecha_corte:infAvisoFecha(corte[0][1])+'T'+corte[0][2],avisos};
}
function infAvisoDiagnostico(r){
  const a=r.aviso,c=r.creditos||[],w=r.trabajador;
  if(!w)return (r.candidatos||[]).length?'IDENTIDAD AMBIGUA':'SIN COINCIDENCIA';
  if(w.estatus!=='ACTIVO')return 'REVISAR TRABAJADOR NO ACTIVO';
  if(c.length>1)return 'VARIOS CRÉDITOS ACTIVOS';
  if(a.tipo==='SUSPENSION')return c.length?'SUSPENSIÓN POR REVISAR':'YA SIN RETENCIÓN ACTIVA';
  if(!c.length)return 'CRÉDITO NUEVO POR REVISAR';
  const d=c[0],n=String(d.numero_credito||'').replace(/\D/g,'');
  if(!n)return 'FALTA NÚMERO EN FICHA';
  if(n!==a.credito)return 'NÚMERO DE CRÉDITO DISTINTO';
  if((d.modalidad||'CUOTA_FIJA')!==a.modalidad||Math.abs(Number(d.factor??d.cuota_mensual)-a.factor)>.00001)return 'CAMBIO DE CUOTA / MODALIDAD';
  const estimado=d.periodicidad==='QUINCENAL'?r.estimado_15:r.estimado_7;
  if(estimado!=null&&Math.abs(Number(d.monto)-Number(estimado))>.005)return 'REVISAR MONTO GUARDADO / BIMESTRE';
  return 'COINCIDE';
}
async function openAvisosInfonavit(nss='',rpHint=''){
  toggleSidebar(false);
  const st={empresa:EMPRESA_ACTIVA,registros:[],historial:[],actual:null,archivo:null,busy:false,filtroNss:nss};INFAVI=st;
  modal(`<div class="m-head"><h2>Avisos INFONAVIT · por registro patronal</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body"><p>${esc(EMPRESAS[st.empresa]?.nombre||st.empresa)}</p>
    <div style="padding:12px;background:var(--amber-bg);border-radius:8px;margin-bottom:14px"><b>Importar → revisar → confirmar cambios.</b> Al confirmar se actualizan números de crédito y cuotas con su vigencia y bitácora. No se cancela un crédito por no aparecer en el reporte. Créditos nuevos, suspensiones e identidades ambiguas requieren revisión individual.</div>
    <details style="margin-bottom:12px"><summary>Ayuda y fundamento</summary><p style="font-size:12px">Puedes consultar cualquier día; no existe un corte obligatorio de miércoles. La fecha de corte y la fecha del aviso no sustituyen la recepción ni la vigencia. Una suspensión por obligado solidario no equivale a crédito liquidado. El estimado usa el motor actual, sin recalibrarlo, y no determina subsidios, ausencias ni límites individuales. Antes de aplicar retenciones revisa el aviso/cédula y su vigencia conforme al art. 29 de la Ley del INFONAVIT y arts. 44 y 46 del Reglamento. <a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LIFNVT.pdf" target="_blank" rel="noopener">Ley vigente</a> · <a href="https://portalmx.infonavit.org.mx/" target="_blank" rel="noopener">Portal INFONAVIT</a>. Los originales y la fotografía de cada importación son privados e inmutables. El acceso completo a la empresa es necesario para abrir un reporte de varios centros.</p></details>
    <label>Registro patronal (incluye todos sus centros autorizados)</label><select id="ia-rp" onchange="infAvisoCambiarRP()"><option>Cargando permisos…</option></select>
    ${puedeEditarTrabajador()?`<div style="margin:12px 0"><label>Reporte de avisos original del portal · PDF con texto, máximo 2 MB</label><input id="ia-file" type="file" accept="application/pdf,.pdf" onchange="infAvisoImportar(this)"></div>`:''}
    <div id="ia-msg" role="status" style="margin:12px 0"></div><div id="ia-hist"></div>
    <div id="ia-tools" class="hide" style="margin:14px 0;display:flex;gap:8px;flex-wrap:wrap"><input id="ia-search" aria-label="Buscar aviso" placeholder="Buscar nombre, número, NSS o crédito" oninput="infAvisoRender()" style="flex:1;min-width:220px" value="${esc(nss)}"><select id="ia-filter" aria-label="Filtrar diferencias" onchange="infAvisoRender()"><option value="">Todos los avisos</option><option value="diferencias">Sólo por revisar</option><option value="SUSPENSION">Suspensiones</option></select><button class="btn" id="ia-actualizar" onclick="infAvisoActualizar()">Actualizar comparación</button><button class="btn" id="ia-original" onclick="infAvisoOriginal()">Descargar original</button></div>
    <div id="ia-confirm-bar" class="hide" style="margin:12px 0"><button class="btn dark" onclick="infAvisoPreparar()">Confirmar cambios detectados</button> <small>Primero revisa números, cuotas, recepción y fecha de aplicación.</small></div>
    <div id="ia-out"></div></div><div class="m-foot"><span style="font-size:12px;color:var(--mut)">Importar no aplica cambios: se requiere confirmación explícita.</span><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'lg');
  try{
    const rps=[...new Set(OBRAS.filter(o=>o.empresa_codigo===st.empresa&&o.registro_patronal).map(o=>infAvisoNorm(o.registro_patronal).replace(/[^A-Z0-9]/g,'')))];
    for(const rp of rps){const {data,error}=await sb.rpc('infonavit_puede_ver_registro',{p_empresa:st.empresa,p_rp:rp});if(error)throw error;if(data===true)st.registros.push(rp);}
    if(INFAVI!==st||!$('ia-rp'))return;
    if(!st.registros.length)throw Error('Tu usuario no tiene acceso completo a ningún registro patronal de esta empresa.');
    $('ia-rp').innerHTML=st.registros.map(rp=>`<option value="${rp}">${rp} · ${esc(OBRAS.filter(o=>o.empresa_codigo===st.empresa&&infAvisoNorm(o.registro_patronal).replace(/[^A-Z0-9]/g,'')===rp).map(o=>o.nombre).join(' / '))}</option>`).join('');
    if(st.registros.includes(rpHint))$('ia-rp').value=rpHint;
    await infAvisoCambiarRP();
  }catch(e){if(INFAVI===st&&$('ia-msg'))$('ia-msg').textContent='No se pudo abrir: '+e.message;}
}
async function infAvisoCambiarRP(){
  const st=INFAVI;if(!st)return;if(st.busy){$('ia-rp').value=st.rp;return;}const rp=$('ia-rp')?.value;if(!st.registros.includes(rp))return;
  st.rp=rp;st.request=(st.request||0)+1;st.actual=null;st.archivo=null;st.historial=[];$('ia-hist').innerHTML='';$('ia-out').innerHTML='';$('ia-tools').classList.add('hide');$('ia-msg').textContent='';if($('ia-file'))$('ia-file').value='';
  await infAvisoHistorial(st,rp);
}
async function infAvisoHistorial(st,rp){
  const {data,error}=await fetchAllRows(()=>sb.from('infonavit_avisos_importaciones').select('id,archivo_nombre,fecha_corte,creado_en,estado').eq('empresa_codigo',st.empresa).eq('registro_patronal',rp));
  if(INFAVI!==st||st.rp!==rp||!$('ia-hist'))return;if(error){$('ia-msg').textContent='No se pudo consultar el historial: '+error.message;return;}
  st.historial=(data||[]).sort((a,b)=>b.creado_en.localeCompare(a.creado_en));
  $('ia-hist').innerHTML=`<label>Importaciones guardadas</label><select id="ia-history" onchange="infAvisoAbrir(this.value)"><option value="">Seleccionar reporte (${st.historial.length})</option>${st.historial.map(i=>`<option value="${i.id}">${esc(i.fecha_corte.replace('T',' '))} · ${esc(i.archivo_nombre)}</option>`).join('')}</select>`;
  if(st.historial.length)await infAvisoAbrir(st.historial[0].id);
}
async function infAvisoAbrir(id){
  const st=INFAVI;if(!st||!id)return;if(st.busy){if($('ia-history'))$('ia-history').value=st.actual?.id||'';return;}if(!st.historial.some(i=>i.id===id))return;const rp=st.rp,request=st.request=(st.request||0)+1;
  try{
    const {data,error}=await sb.from('infonavit_avisos_importaciones').select('id,empresa_codigo,registro_patronal,archivo_nombre,archivo_sha256,fecha_corte,avisos,comparacion,creado_en').eq('id',id).eq('empresa_codigo',st.empresa).eq('registro_patronal',rp).single();if(error)throw error;
    if(INFAVI!==st||st.rp!==rp||st.request!==request||!$('ia-out'))return;
    st.actual=data;st.archivo=null;st.resultado=data.comparacion;st.fresca=false;$('ia-history').value=id;infAvisoRender();
    await infAvisoActualizar();
  }catch(e){if(INFAVI===st&&$('ia-msg'))$('ia-msg').textContent='No se pudo abrir la comparación: '+e.message;}
}
function infAvisoRender(){
  const st=INFAVI;if(!st?.actual||!$('ia-out'))return;const q=infAvisoNorm($('ia-search')?.value),f=$('ia-filter')?.value;
  if($('ia-confirm-bar'))$('ia-confirm-bar').classList.toggle('hide',!st.actual.id||!puedeEditarTrabajador());
  $('ia-tools').classList.remove('hide');$('ia-original').disabled=!st.actual.id;
  const all=st.resultado||[],rs=all.filter(r=>{const d=infAvisoDiagnostico(r),a=r.aviso,w=r.trabajador;
    return (!q||infAvisoNorm([a.nombre,a.nss,a.credito,w?.nombre,w?.no_trab,w?.centro].join(' ')).includes(q))&&(!f||(f==='diferencias'?!['COINCIDE','YA SIN RETENCIÓN ACTIVA'].includes(d):a.tipo===f));});
  $('ia-out').innerHTML=`<p><b>${all.length} avisos</b> · Corte ${esc(st.actual.fecha_corte.replace('T',' '))} · ${st.fresca?'Comparación contra la base actual (no sustituye la fotografía guardada)':'Fotografía de la base al importar'}.</p>
    <p style="font-size:12px;color:var(--mut)">Estimados al ${esc(st.actual.fecha_corte.slice(0,10))}, con seguro de daños y días del bimestre según el motor vigente. No son autorización de retención. ${rs.length} visibles.</p>
    <div style="overflow:auto"><table style="width:100%;font-size:12px"><thead><tr><th>No. / trabajador / centro</th><th>Aviso</th><th>Crédito del aviso / ficha</th><th>Cuota o factor: aviso / ficha</th><th>Estimado del periodo</th><th>Resultado / evidencia</th></tr></thead><tbody>${rs.map(r=>{
      const a=r.aviso,w=r.trabajador,d=(r.creditos||[])[0],status=infAvisoDiagnostico(r),ok=['COINCIDE','YA SIN RETENCIÓN ACTIVA'].includes(status),quin=w?.periodo==='QUINCENAL';
      return `<tr><td style="white-space:normal;min-width:175px"><b>${w?'#'+esc(w.no_trab??'—')+' · '+esc(w.nombre):esc(a.nombre)}</b><br>${esc(w?.centro||'Sin trabajador único en este RP')}<br><small>NSS ${esc(a.nss)}${w?' · '+esc(w.estatus):''}</small></td><td style="white-space:normal">${esc(a.tipo)}<br>${esc(a.fecha_aviso)}<br><small>${esc(a.motivo)}</small></td><td>${esc(a.credito)}<br><small>Ficha: ${esc(d?.numero_credito||'Sin número / sin crédito activo')}</small></td><td>${a.factor==null?'No aplica':esc(a.modalidad)+' · '+money(a.factor)}<br><small>Ficha: ${d?esc(d.modalidad)+' · '+money(d.factor??d.cuota_mensual):'Sin crédito activo'}</small></td><td>${a.tipo==='SUSPENSION'?'No aplica':(w?'$'+money(quin?r.estimado_15:r.estimado_7)+' / '+(quin?'15':'7')+' días':'Sin periodo confirmado')}<br><small>Guardado actualmente: ${d?'$'+money(d.monto)+' · '+esc(d.periodicidad):'—'}</small></td><td style="white-space:normal;min-width:175px"><b style="color:var(--${ok?'green':'amber'})">${esc(status)}</b><details><summary>Ver evidencia</summary><small>Folio ${esc(a.folio)}<br>Nombre en aviso: ${esc(a.nombre)}<br>Cuota mensual en pesos sólo cuando la modalidad sea CUOTA_FIJA.<br>${(r.candidatos||[]).length} coincidencia(s) en este RP; ${(r.creditos||[]).length} crédito(s) activo(s).<br>Recepción y vigencia: pendientes de aprobación. No aplicado.</small></details></td></tr>`;
    }).join('')||'<tr><td colspan="6">No hay avisos con ese filtro.</td></tr>'}</tbody></table></div>`;
}
async function infAvisoActualizar(){
  const st=INFAVI;if(!st?.actual||st.busy)return;const actual=st.actual;st.busy=true;$('ia-actualizar').disabled=true;
  try{const {data,error}=await sb.rpc('infonavit_comparar_avisos',{p_empresa:st.empresa,p_rp:st.rp,p_avisos:actual.avisos,p_fecha:actual.fecha_corte.slice(0,10)});if(error)throw error;
    if(INFAVI!==st||st.actual!==actual||!$('ia-out'))return;st.resultado=data;st.fresca=true;infAvisoRender();
  }catch(e){if(INFAVI===st&&$('ia-msg'))$('ia-msg').textContent='No se pudo comparar: '+e.message;}finally{st.busy=false;if(INFAVI===st&&$('ia-actualizar'))$('ia-actualizar').disabled=false;}
}
async function infAvisoImportar(input){
  const st=INFAVI,file=input.files?.[0];if(!st||st.busy||!file)return;
  if(!puedeEditarTrabajador()){toast('Tu usuario es de sólo lectura.','err');return;}
  const rp=st.rp;if(!rp)return;st.busy=true;input.disabled=true;$('ia-rp').disabled=true;$('ia-msg').textContent='Leyendo y validando el reporte; no se aplicarán retenciones…';
  try{
    if(file.size>2097152||file.size<5||!file.name.toLowerCase().endsWith('.pdf'))throw Error('Selecciona un PDF original de hasta 2 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer()),p=await infAvisoLeerPDF(bytes);
    if(p.rp!==rp)throw Error('El PDF pertenece al registro '+p.rp+'. Selecciona ese registro antes de importar.');
    if(INFAVI!==st||!$('ia-out'))return;
    const {data,error}=await sb.rpc('infonavit_comparar_avisos',{p_empresa:st.empresa,p_rp:rp,p_avisos:p.avisos,p_fecha:p.fecha_corte.slice(0,10)});if(error)throw error;
    st.actual={...p,registro_patronal:rp,archivo_nombre:file.name};st.resultado=data;st.archivo=bytes;st.fresca=true;infAvisoRender();
    if(!confirm(`Se leyeron ${p.avisos.length} avisos del registro ${rp}. ¿Guardar PDF privado y comparación? NO cambia fichas ni nóminas.`)){$('ia-msg').textContent='Vista previa sin guardar; no se modificó ninguna retención.';return;}
    let b64='';for(let i=0;i<bytes.length;i+=8192)b64+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const saved=await sb.rpc('infonavit_guardar_comparacion',{p_empresa:st.empresa,p_rp:rp,p_fecha_corte:p.fecha_corte,p_archivo_nombre:file.name.slice(0,180),p_archivo_base64:btoa(b64),p_avisos:p.avisos});if(saved.error)throw saved.error;
    st.busy=false;await infAvisoHistorial(st,rp);await infAvisoAbrir(saved.data);
    if(INFAVI===st&&$('ia-msg')){
      $('ia-msg').textContent='Comparación archivada. Revisa y confirma los cambios detectados para actualizar las fichas. Importar por sí solo no cambia retenciones.';
      await infAvisoActualizar();
      if(st.resultado.some(r=>/FALTA NÚMERO|NÚMERO DE CRÉDITO DISTINTO|CAMBIO DE CUOTA|REVISAR MONTO/.test(infAvisoDiagnostico(r))))infAvisoPreparar();
    }
  }catch(e){if(INFAVI===st&&$('ia-msg'))$('ia-msg').textContent='No se completó la importación: '+e.message;}
  finally{st.busy=false;if(INFAVI===st){if($('ia-file')){$('ia-file').disabled=false;$('ia-file').value='';}if($('ia-rp'))$('ia-rp').disabled=false;}}
}
async function infAvisoOriginal(){
  const st=INFAVI;if(!st?.actual?.id||st.busy)return;st.busy=true;const actual=st.actual;
  try{const {data,error}=await sb.from('infonavit_avisos_archivos').select('contenido').eq('importacion_id',actual.id).single();if(error)throw error;
    const hex=String(data?.contenido||'').replace(/^\\x/,'');if(!/^[a-f0-9]+$/i.test(hex)||hex.length%2)throw Error('Original no disponible.');
    const bytes=Uint8Array.from(hex.match(/../g),s=>parseInt(s,16));if(await sha256Hex(bytes)!==actual.archivo_sha256)throw Error('La huella del original no coincide. Descarga detenida.');
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=actual.archivo_nombre;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){if(INFAVI===st&&$('ia-msg'))$('ia-msg').textContent='No se pudo descargar el PDF: '+e.message;}finally{st.busy=false;}
}
/* Confirmación de avisos: nunca ejecutar la actualización durante la lectura del archivo. */
function infAvisoPreparar(){
  const st=INFAVI;if(!st?.actual?.id||st.busy||!puedeEditarTrabajador())return;
  st.aprobacion={importacion:st.actual.id,plan:[],busy:false};
  modal2(`<div class="m-head"><h2>Confirmar cambios INFONAVIT</h2><button class="x" onclick="closeModal2()">×</button></div><div class="m-body">
    <p>Se actualizarán los números faltantes o distintos y las cuotas detectadas, sólo de trabajadores activos con un crédito único. Se conservarán el documento, los valores anteriores y la bitácora.</p>
    <div class="grid" style="grid-template-columns:1fr 1fr"><div><label>Fecha real de recepción del aviso / cédula *</label><input id="ia-rec" type="date" max="${today()}" oninput="infAvisoInvalidarPlan()"></div><div><label>Aplicar en nómina desde *</label><input id="ia-desde" type="date" oninput="infAvisoInvalidarPlan()"></div></div>
    <p class="fhint">Para cambios de cuota selecciona el inicio de un periodo abierto: lunes para semanal, día 1 o 16 para quincenal. Si hay días intermedios pendientes, usa “Días/importe” en la ficha para su proporcional, sin inventar salarios. No se cambiarán cierres revisados, CFDI, pagos ni finiquitos guardados. La fecha de corte del reporte no sustituye la recepción del aviso.</p>
    <label>Motivo / referencia del respaldo *</label><input id="ia-motivo" placeholder="Ej. Actualización confirmada contra aviso del portal" maxlength="500">
    <button class="btn" id="ia-plan-btn" style="margin:12px 0" onclick="infAvisoPlan()">Revisar cambios antes de confirmar</button><div id="ia-plan-msg" role="status"></div><div id="ia-plan-out"></div>
    </div><div class="m-foot"><button class="btn" onclick="closeModal2()">Cancelar</button><button class="btn dark" id="ia-aplicar" disabled onclick="infAvisoAplicar()">Confirmar y actualizar fichas</button></div>`,'lg');
}
function infAvisoInvalidarPlan(){
  if(INFAVI?.aprobacion){INFAVI.aprobacion.plan=[];INFAVI.aprobacion.request=(INFAVI.aprobacion.request||0)+1;}
  if($('ia-aplicar'))$('ia-aplicar').disabled=true;if($('ia-plan-out'))$('ia-plan-out').innerHTML='';
}
async function infAvisoPlan(){
  const st=INFAVI,a=st?.aprobacion;if(!a||a.busy)return;
  const recepcion=$('ia-rec').value,desde=$('ia-desde').value;
  if(!recepcion||!desde||recepcion>today()||desde<recepcion){$('ia-plan-msg').textContent='Captura recepción real y aplicación igual o posterior; la recepción no puede ser futura.';return;}
  a.busy=true;const req=a.request=(a.request||0)+1;$('ia-plan-btn').disabled=true;$('ia-aplicar').disabled=true;
  try{const {data,error}=await sb.rpc('infonavit_plan_cambios',{p_importacion:a.importacion,p_desde:desde});if(error)throw error;
    if(INFAVI!==st||st.aprobacion!==a||a.request!==req||!$('ia-plan-out'))return;
    a.plan=data||[];a.desde=desde;a.recepcion=recepcion;
    $('ia-plan-msg').textContent=a.plan.length?`${a.plan.length} cambio(s) por confirmar. Desmarca los que no quieras aplicar.`:'No hay cambios aplicables: ya coinciden, ya se aplicaron o requieren revisión individual (crédito nuevo, suspensión o identidad ambigua).';
    $('ia-plan-out').innerHTML=`<div style="overflow:auto"><table style="width:100%;font-size:12px"><thead><tr><th>Aplicar</th><th>Trabajador / centro</th><th>Antes</th><th>Después</th></tr></thead><tbody>${a.plan.map((x,i)=>`<tr><td><input type="checkbox" class="ia-seleccion" data-index="${i}" checked aria-label="Aplicar cambio a ${esc(x.trabajador.nombre)}" style="width:auto"></td><td style="white-space:normal">#${esc(x.trabajador.no_trab)} · ${esc(x.trabajador.nombre)}<br>${esc(x.trabajador.centro)}</td><td style="white-space:normal">Crédito: ${esc(x.antes.numero_credito||'Sin número')}<br>${esc(x.antes.modalidad)} · factor ${money(x.antes.factor)}<br>Retención: $${money(x.antes.monto)} / ${esc(x.antes.periodicidad)}</td><td style="white-space:normal">Crédito: ${esc(x.despues.numero_credito)}<br>${esc(x.despues.modalidad)} · factor ${money(x.despues.factor)}<br>Retención: $${money(x.despues.monto)} / ${esc(x.despues.periodicidad)}<br>Desde ${esc(desde)}</td></tr>`).join('')}</tbody></table></div>`;
    $('ia-aplicar').disabled=!a.plan.length;
  }catch(e){if(INFAVI===st&&$('ia-plan-msg'))$('ia-plan-msg').textContent='No se pudo preparar: '+e.message;}finally{a.busy=false;if(INFAVI===st&&$('ia-plan-btn'))$('ia-plan-btn').disabled=false;}
}
async function infAvisoAplicar(){
  const st=INFAVI,a=st?.aprobacion;if(!a||a.busy||!puedeEditarTrabajador())return;
  const motivo=$('ia-motivo').value.trim();
  if(motivo.length<8){$('ia-plan-msg').textContent='Indica el motivo o referencia (mínimo 8 caracteres).';return;}
  if(a.desde!==$('ia-desde').value||a.recepcion!==$('ia-rec').value||!a.plan.length){$('ia-plan-msg').textContent='Las fechas cambiaron. Vuelve a revisar el plan.';return;}
  const seleccion=[...document.querySelectorAll('.ia-seleccion:checked')].map(el=>a.plan[Number(el.dataset.index)]).filter(Boolean).map(x=>({folio:x.folio,descuento_id:x.descuento_id,huella:x.huella}));
  if(!seleccion.length){$('ia-plan-msg').textContent='Selecciona al menos un cambio.';return;}
  if(!confirm(`¿CONFIRMAR ${seleccion.length} cambio(s) desde ${a.desde}? Se actualizarán las fichas y la retención de periodos abiertos. Esta acción quedará en la bitácora.`))return;
  a.busy=true;st.busy=true;$('ia-aplicar').disabled=true;$('ia-plan-btn').disabled=true;
  try{const {data,error}=await sb.rpc('infonavit_confirmar_cambios',{p_importacion:a.importacion,p_recepcion:a.recepcion,p_desde:a.desde,p_motivo:motivo,p_seleccion:seleccion});if(error)throw error;
    if(!data||Number(data.aplicados)!==seleccion.length)throw Error('Respuesta de confirmación incompleta; consulta la bitácora antes de reintentar.');
    markWrite();
    // Refresca los créditos de todas las obras autorizadas, no sólo los de la obra abierta.
    if(OBRA){const r=await fetchAllRows(()=>sb.from('descuentos').select('*').eq('obra_id',OBRA.id));if(r.error)throw Error('Los cambios se guardaron, pero no se pudo refrescar la ficha: '+r.error.message);DESC=r.data||[];}
    if(INFAVI!==st||!$('ia-out'))return;if($('ia-plan-msg'))closeModal2();st.busy=false;await infAvisoActualizar();
    if($('ia-msg'))$('ia-msg').textContent=`${data.aplicados} cambio(s) confirmado(s) desde ${a.desde}. Fichas actualizadas; periodos anteriores conservan sus condiciones. Reabre o regenera los borradores abiertos para revisarlos.`;
  }catch(e){if(INFAVI===st&&$('ia-plan-msg'))$('ia-plan-msg').textContent='No se completó la confirmación: '+e.message;}finally{a.busy=false;st.busy=false;if(INFAVI===st){if($('ia-aplicar'))$('ia-aplicar').disabled=false;if($('ia-plan-btn'))$('ia-plan-btn').disabled=false;}}
}
/* FIN CONFIRMACION AVISOS */
/* FIN AVISOS INFONAVIT */

