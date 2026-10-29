/* ---------- vista trabajadores ---------- */
function baseFiltered(){
  const q=$('q').value.trim().toUpperCase(), fc=$('flt-contratista').value, fp=$('f-periodo').value, fs=$('f-semana').value, fpu=$('flt-puesto')?$('flt-puesto').value:'';
  return WORKERS.filter(w=>{
    if(fc&&w.contratista!==fc)return false;
    if(fpu&&w.puesto!==fpu)return false;
    if(fp&&(w.periodo_pago||'SEMANAL')!==fp)return false;
    if(fs&&w.semana_ingreso!==fs)return false;
    if(q){const hay=[fullName(w),w.no_trab,w.curp,w.rfc,w.nss,w.puesto,w.contratista,w.telefono,w.correo,w.semana_ingreso].join(' ').toUpperCase();if(!hay.includes(q))return false;}
    return true;
  });
}
function renderStats(){
  const base=baseFiltered();
  const fc=$('flt-contratista').value, fp=$('f-periodo').value, fs=$('f-semana').value, q=$('q').value.trim(), fpu=$('flt-puesto')?$('flt-puesto').value:'';
  const filtro=[fc,fpu,fp,fs?'Ingreso '+fs:'',q?`"${q}"`:''].filter(Boolean).join(' · ');
  const a=base.filter(w=>w.estatus==='ACTIVO').length, b=base.filter(w=>w.estatus==='BAJA').length,
        p=base.filter(w=>w.estatus==='PENDIENTE').length, c=base.filter(w=>w.estatus==='ACTIVO'&&String(w.cuenta).toUpperCase()==='CREAR').length,
        qn=base.filter(w=>w.estatus==='ACTIVO'&&w.periodo_pago==='QUINCENAL').length;
  $('stats').innerHTML=`
    ${filtro?`<div class="stat" style="border-left:4px solid var(--gold)"><div class="n" style="font-size:13px;padding-top:5px">${esc(filtro)}</div><div class="l">Mostrando</div></div>`:''}
    <div class="stat g"><div class="n">${a}</div><div class="l">Activos</div></div>
    <div class="stat r"><div class="n">${b}</div><div class="l">Bajas</div></div>
    <div class="stat a"><div class="n">${p}</div><div class="l">Pendientes</div></div>
    <div class="stat a"><div class="n">${c}</div><div class="l">Tarjetas por crear</div></div>
    ${qn?`<div class="stat b"><div class="n">${qn}</div><div class="l">Quincenales activos</div></div>`:''}
    <div class="stat"><div class="n">${base.length}</div><div class="l">${filtro?'Total del filtro':'Total registro'}</div></div>`;
}
function setSort(k){if(SORT.k===k)SORT.asc=!SORT.asc;else{SORT.k=k;SORT.asc=true;}renderTable();}
/* El aviso de la TABLA significa una sola cosa: el alta todavía no se ha
   presentado. Al guardar "ALTA PRESENTADA" desaparece de la fila; la falta
   del PDF del acuse se controla por separado en las alertas generales. */
function fechaAcuseISO(valor){
  const s=String(valor||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
  const d=new Date(s+'T12:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';
}
function indiceAcusesIMSS(documentos){
  const indice=new Map();
  (documentos||[]).forEach(d=>{
    if(d.anulado||String(d.categoria||'').trim().toUpperCase()!=='ACUSE_IMSS')return;
    if(!indice.has(d.trabajador_id))indice.set(d.trabajador_id,[]);
    indice.get(d.trabajador_id).push(d);
  });
  return indice;
}
function estadoAcuseIMSS(w,tipo='ALTA',indice){
  if(!w)return {ok:false,porCotejar:false,presentada:false};
  const baja=tipo==='BAJA',reingreso=fechaAcuseISO(w.fecha_reingreso);
  const inicio=baja?fechaAcuseISO(w.fecha_baja):[fechaAcuseISO(w.fecha_alta),reingreso].sort().pop();
  const movimiento=String(w.movimiento_imss||'').trim().toUpperCase();
  const fechaMov=fechaAcuseISO(w.fecha_mov_imss);
  const tipos=baja?['BAJA']:['ALTA','REINGRESO'];
  const docs=(indice instanceof Map?indice.get(w.id)||[]:DOCSX||[]).filter(d=>
    d.trabajador_id===w.id&&!d.anulado&&String(d.categoria||'').trim().toUpperCase()==='ACUSE_IMSS'&&tipos.includes(String(d.subtipo||'').trim().toUpperCase()));
  // Excepción corroborada: primera alta procesada el lunes y fecha laboral
  // martes/miércoles de ESA semana, con movimiento CON ACUSE y fecha exacta.
  // Nunca se aplica por tolerancia general ni reutiliza un alta para reingreso.
  const lunesCorroborado=fecha=>{
    if(baja||reingreso||!inicio||movimiento!=='ALTA CON ACUSE'||fecha!==fechaMov)return false;
    const d=new Date(inicio+'T12:00:00Z'),dia=d.getUTCDay();
    if(dia!==2&&dia!==3)return false;
    d.setUTCDate(d.getUTCDate()-(dia-1));
    return fecha===d.toISOString().slice(0,10);
  };
  const corresponde=fecha=>!!(inicio&&fecha&&((fecha>=inicio&&
    (!baja&&w.estatus==='BAJA'&&fechaAcuseISO(w.fecha_baja)?fecha<=fechaAcuseISO(w.fecha_baja):true))||lunesCorroborado(fecha)));
  const ok=docs.some(d=>corresponde(fechaAcuseISO(d.fecha_doc)));
  // La fecha de subida NUNCA prueba a qué movimiento corresponde un acuse.
  const porCotejar=!ok&&docs.some(d=>!fechaAcuseISO(d.fecha_doc)||!inicio);
  // Una modificación salarial presentada del episodio actual no equivale al
  // PDF de ALTA, pero tampoco debe rotularse como alta sin presentar.
  const declarada=(baja?['BAJA PRESENTADA','BAJA CON ACUSE']:['ALTA PRESENTADA','ALTA CON ACUSE','MODIFICACION PRESENTADA','MODIFICACION CON ACUSE']).includes(movimiento);
  const presentada=ok||(declarada&&(corresponde(fechaMov)||(!fechaMov&&!reingreso&&!baja)));
  return {ok,porCotejar,presentada};
}
function altaImssPendiente(w,indice){
  const estado=estadoAcuseIMSS(w,'ALTA',indice);
  return !!(w&&w.estatus!=='BAJA'&&(w.fecha_reingreso||w.fecha_alta)&&!estado.presentada&&!estado.porCotejar);
}
function altaImssPresentada(w,indice){
  return estadoAcuseIMSS(w,'ALTA',indice).presentada;
}
function tieneAcuseAltaImportado(w,indice){
  return estadoAcuseIMSS(w,'ALTA',indice).ok;
}
function acuseAltaPendiente(w,indice){
  const estado=estadoAcuseIMSS(w,'ALTA',indice);
  return !!(w&&w.estatus!=='BAJA'&&estado.presentada&&!estado.ok&&!estado.porCotejar);
}
async function cargarAcusesTrabajadores(trabajadores){
  const ids=[...new Set((trabajadores||[]).map(w=>w.id).filter(Boolean))],lotes=[];
  for(let i=0;i<ids.length;i+=100)lotes.push(ids.slice(i,i+100));
  const respuestas=new Array(lotes.length);let siguiente=0;
  await Promise.all(Array.from({length:Math.min(4,lotes.length)},async()=>{
    for(;;){const i=siguiente++;if(i>=lotes.length)return;
      respuestas[i]=await fetchAllRows(()=>sb.from('documentos').select('*')
        .eq('categoria','ACUSE_IMSS').eq('anulado',false).in('trabajador_id',lotes[i]));
    }
  }));
  const fallo=respuestas.find(r=>r?.error||!Array.isArray(r?.data));
  return fallo?{data:[],error:fallo.error||{message:'Respuesta incompleta de acuses'}}:{data:respuestas.flatMap(r=>r.data),error:null};
}
function openResumen(){
  const cs=[...new Set(WORKERS.map(w=>w.contratista||'(SIN CONTRATISTA)'))];
  const rows=cs.map(c=>{
    const g=WORKERS.filter(w=>(w.contratista||'(SIN CONTRATISTA)')===c);
    return {c,a:g.filter(w=>w.estatus==='ACTIVO').length,b:g.filter(w=>w.estatus==='BAJA').length,p:g.filter(w=>w.estatus==='PENDIENTE').length,t:g.length};
  }).sort((x,y)=>y.a-x.a);
  const T={a:rows.reduce((s,r)=>s+r.a,0),b:rows.reduce((s,r)=>s+r.b,0),p:rows.reduce((s,r)=>s+r.p,0),t:rows.reduce((s,r)=>s+r.t,0)};
  modal(`
    <div class="m-head"><h2>📊 Resumen por contratista · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px;font-size:12.5px">Da clic en un contratista para filtrar la tabla con su gente.</p>
      <div class="sect">Activos por puesto (catálogo unificado)</div>
      ${resumenPuestosHTML()}
      <div class="sect">Por contratista</div>
      <table style="min-width:0">
        <thead><tr><th>Contratista</th><th style="text-align:right">Activos</th><th style="text-align:right">Bajas</th><th style="text-align:right">Pendientes</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${(window._RES=rows)&&rows.map((r,i)=>`<tr onclick="filtrarContratista(window._RES[${i}].c)">
            <td><b>${esc(r.c)}</b></td>
            <td style="text-align:right;color:var(--green);font-weight:700">${r.a}</td>
            <td style="text-align:right;color:var(--red)">${r.b}</td>
            <td style="text-align:right;color:var(--amber)">${r.p}</td>
            <td style="text-align:right;font-weight:700">${r.t}</td></tr>`).join('')}
          <tr class="franja-total">
            <td>TOTAL</td><td style="text-align:right;color:var(--green)">${T.a}</td>
            <td style="text-align:right;color:var(--red)">${T.b}</td>
            <td style="text-align:right;color:var(--amber)">${T.p}</td>
            <td style="text-align:right">${T.t}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'md');
}
function resumenPuestosHTML(){
  const m={};WORKERS.filter(w=>w.estatus==='ACTIVO').forEach(w=>{const k=w.puesto||'(SIN PUESTO)';m[k]=(m[k]||0)+1;});
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="kv"><b>${esc(k)}</b><span>${v}</span></div>`).join('');
}
function filtrarContratista(c){
  closeModal();
  const sel=$('flt-contratista');
  sel.value=[...sel.options].some(o=>o.value===c)?c:'';
  renderTable();
}
function marcadorAcuseIMSS(w,tipo,indice){
  const baja=tipo==='BAJA',{ok,porCotejar}=estadoAcuseIMSS(w,tipo,indice);
  const nombre=baja?'Baja':w.fecha_reingreso?'Reingreso':'Alta';
  const pendiente=porCotejar?'por cotejar':'pendiente';
  return `<span class="acuse-mark ${ok?'ok':'missing'}" title="${esc(nombre)}: ${ok?'acuse archivado del movimiento actual':pendiente==='por cotejar'?'hay un archivo sin fecha de movimiento; verifica su correspondencia':'falta acuse del movimiento actual'}">${ok?'✓':'⚠'} ${nombre} ${ok?'con acuse':pendiente}</span>`;
}
function marcadoresIMSS(w,indice){
  return `<span class="acuse-marks">${marcadorAcuseIMSS(w,'ALTA',indice)}${w.estatus==='BAJA'?marcadorAcuseIMSS(w,'BAJA',indice):''}</span>`;
}
function renderTable(){
  const fe=$('f-estatus').value;
  let rows=baseFiltered().filter(w=>!fe||w.estatus===fe);
  renderStats();
  const k=SORT.k;
  document.querySelectorAll('.trab-table th[data-sort]').forEach(th=>th.setAttribute('aria-sort',th.dataset.sort===k?(SORT.asc?'ascending':'descending'):'none'));
  rows.sort((x,y)=>{
    let a=k==='nombre'?fullName(x):(k==='fecha_alta'?(x.fecha_reingreso||x.fecha_alta):x[k]),
        b=k==='nombre'?fullName(y):(k==='fecha_alta'?(y.fecha_reingreso||y.fecha_alta):y[k]);
    if(a==null||a==='')return 1; if(b==null||b==='')return -1;
    if(typeof a==='number'&&typeof b==='number')return SORT.asc?a-b:b-a;
    return SORT.asc?String(a).localeCompare(String(b)):String(b).localeCompare(String(a));
  });
  window._NAVIDS=rows.map(w=>w.id); // orden actual de la tabla, para las flechas ‹ › de la ficha
  if($('worker-count'))$('worker-count').textContent=rows.length+' visibles · '+WORKERS.length+' en el centro';
  if(!rows.length){$('tbody').innerHTML='<tr><td colspan="6"><div class="empty"><div class="big">🗂</div>Sin trabajadores que coincidan.<br>La opción <b>Nueva alta</b> está en el menú ☰ → Operación.</div></td></tr>';return;}
  const acuses=indiceAcusesIMSS(DOCSX);
  $('tbody').innerHTML=rows.map(w=>`
    <tr onclick="openDetail('${w.id}')">
      <td><button onclick="event.stopPropagation();openDetail('${w.id}')" aria-label="Abrir ficha de ${esc(fullName(w))}"><span class="worker-number">#${w.no_trab??'—'}</span>${esc(fullName(w))}</button></td>
      <td><span class="estado-trab"><span class="badge ${w.estatus}">${w.estatus}</span>${altaImssPendiente(w,acuses)?'<span class="badge PENDIENTE imss-alert" title="Alta o reingreso actual pendiente de presentar ante el IMSS">⚠ ALTA IMSS</span>':''}${ALTAS_CORTAS.some(a=>a.trabajador_id===w.id&&a.estado_servicio==='SIN_SERVICIO_CONFIRMADO')?'<span class="badge PENDIENTE" title="Alta y baja con registro IMSS; sin trabajo efectivo confirmado. Verifica acuses y fecha real.">SIN SERVICIO</span>':''}</span></td>
      <td>${esc(w.contratista)||'—'}</td>
      <td title="${w.fecha_reingreso?'Fecha de reingreso':'Fecha de ingreso'}">${w.fecha_reingreso?'<b style="color:var(--amber)">'+fmtD(w.fecha_reingreso)+'</b><small style="display:block;color:var(--amber)">REINGRESO</small>'+(w.fecha_alta&&w.fecha_alta!==w.fecha_reingreso?'<small style="display:block;color:var(--mut)">Alta inicial: '+fmtD(w.fecha_alta)+'</small>':''):'<b style="color:var(--green)">'+fmtD(w.fecha_alta)+'</b><small style="display:block;color:var(--green)">INGRESO</small>'}</td>
      <td>${w.fecha_baja?'<span style="color:var(--red)">'+fmtD(w.fecha_baja)+'</span>':'—'}</td>
      <td>${marcadoresIMSS(w,acuses)}</td>
    </tr>`).join('');
}

/* ---------- navegación entre trabajadores (flechas de la ficha) ---------- */
function navTrabajadores(){
  // usa el orden actual de la tabla; si no hay, cae a todos los de la obra por no_trab
  let ids=(window._NAVIDS||[]).filter(id=>WORKERS.some(w=>w.id===id));
  if(!ids.length)ids=[...WORKERS].sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9)).map(w=>w.id);
  return ids;
}
function abrirTrabajadorVecino(id,dir){
  const ids=navTrabajadores(); const i=ids.indexOf(id);
  if(i<0)return; const j=i+dir;
  if(j<0||j>=ids.length){toast(dir<0?'Ya es el primero del listado.':'Ya es el último del listado.');return;}
  openDetail(ids[j]);
}
/* ---------- detalle ---------- */
/* ---------- DOCUMENTOS DE LA FICHA (2026-09-02) ------------------------
   Se sacó a su propia función para poder volver a pintar SOLO este pedazo
   cuando llega la consulta dirigida del trabajador (ver refrescaDocsDe). */
function fichaDocsHTML(w){
  const byW=x=>parseInt(String(x.semana||'').replace(/\D/g,''))||0;
  const ac=DOCSX.filter(x=>x.trabajador_id===w.id&&x.categoria==='ACUSE_IMSS');
  const re=DOCSX.filter(x=>x.trabajador_id===w.id&&esReciboPdf(x)).sort((a,b)=>byW(a)-byW(b));
  const cf=DOCSX.filter(x=>x.trabajador_id===w.id&&esCfdiXml(x)).sort((a,b)=>byW(a)-byW(b));
  const item=x=>`<div class="kv"><b>${esc(x.subtipo||'DOC')} ${esc(x.semana)}</b><span>${esc(x.nombre_archivo)} · ${fmtD(x.fecha_doc||x.created_at)} <button class="btn" style="padding:2px 10px;font-size:11px;margin-left:8px" onclick="verDoc('${x.id}')">📄 Ver</button> <button class="btn" style="padding:2px 8px;font-size:11px" onclick="openRenombrarDoc('${x.id}','${w.id}')" title="Cambiar el nombre y el tipo de movimiento (ALTA, BAJA...)">✎</button> <button class="btn danger" style="padding:2px 8px;font-size:11px" onclick="anularDoc('${x.id}','${w.id}')" title="Quitar del expediente (queda rastro de quién y por qué)">🗑</button></span></div>`;
  const falt=faltantesReciboDe(w);
  const faltHtml=falt.length
    ?`<div class="kv" style="background:var(--amber-bg)"><b style="color:var(--amber)">⚠ Faltan ${falt.length}</b><span>${falt.map(W=>'<span class="badge PENDIENTE" style="font-size:10px;margin:1px">S'+W+'</span>').join(' ')} <button class="btn" style="padding:2px 10px;font-size:11px;margin-left:6px" onclick="openPdfImport()">📎 Importar recibos</button></span></div>`
    :(re.length?`<div class="kv"><b style="color:var(--green)">✔ Completos</b><span>No falta ningún recibo de nómina (semanas cerradas).</span></div>`:'');
  const reList=re.length?re.map(item).join(''):'<div class="kv"><b>—</b><span>Sin representaciones PDF archivadas.</span></div>';
  const reWrap=re.length>8?`<div style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin-top:4px">${reList}</div>`:reList;
  const cfList=cf.length?cf.map(item).join(''):'<div class="kv"><b>—</b><span>Sin XML fiscales archivados.</span></div>';
  const cfWrap=cf.length>8?`<div style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin-top:4px">${cfList}</div>`:cfList;
  return `<div class="sect">Acuses IMSS (${ac.length})</div>${ac.length?ac.map(item).join(''):'<div class="kv"><b>—</b><span>Sin acuses archivados. Súbelos con 📎 Importar PDFs.</span></div>'}
        <div class="sect">Recibos de nómina PDF (${re.length})</div>${faltHtml}${reWrap}
        <div class="sect">CFDI de nómina XML (${cf.length})</div>${cfWrap}`;
}
/* Trae los documentos de UN trabajador directo de la base, filtrando en el
   servidor con .eq('trabajador_id', id). Es una red de seguridad: aunque la
   carga masiva de la obra fallara o se quedara corta, la ficha SIEMPRE
   muestra lo que de verdad hay archivado de esa persona. Además es barato
   —son unas cuantas filas, no miles— y no toca ningún límite de paginación.
   Lo que llegue se mezcla en DOCSX para que el resto de la app también lo vea. */
async function refrescaDocsDe(id){
  if(!id||!sb)return null;
  const {data,error}=await fetchAllRows(()=>sb.from('documentos').select('*')
    .eq('trabajador_id',id).eq('anulado',false));
  if(error||!data)return null;
  const conocidos=new Set((DOCSX||[]).map(d=>d.id));
  const nuevos=data.filter(d=>!conocidos.has(d.id));
  // Sustituye su caché completa: un acuse anulado/retirado no puede seguir
  // confirmando el alta por haber quedado en memoria. No toca otros expedientes.
  DOCSX=(DOCSX||[]).filter(d=>d.trabajador_id!==id).concat(data);
  return nuevos.length;
}
function fichaPagosHTML(w){
  const ps=(PAGOS||[]).filter(p=>p.trabajador_id===w.id).sort((a,b)=>(parseInt(normSem(b.semana))||0)-(parseInt(normSem(a.semana))||0)||String(b.created_at).localeCompare(String(a.created_at)));
  const lista=ps.map(p=>`<div class="kv"><b>${esc(p.semana||'—')} · ${esc(p.origen||'TRANSFERENCIA')}</b><span><b>$${money(p.importe)}</b> · ${esc(p.banco||'BBVA')} · <span class="badge ${String(p.estado).toUpperCase()==='RECHAZADO'?'BAJA':'ACTIVO'}">${esc(p.estado||'EXITOSO')}</span>${p.folio_lote?`<br><span style="font-size:11px;color:var(--mut)">Lote/folio ${esc(p.folio_lote)}</span>`:''}</span></div>`).join('');
  return `<div class="sect">Pagos bancarios importados (${ps.length})</div>${ps.length?`<div style="max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:8px">${lista}</div>`:'<div class="kv"><b>—</b><span>Sin pagos globales o individuales vinculados.</span></div>'}`;
}
async function refrescaPagosDe(id){
  if(!id||!sb)return 0;
  const {data,error}=await fetchAllRows(()=>sb.from('pagos').select('*').eq('trabajador_id',id));
  if(error||!data)return 0;
  PAGOS=(PAGOS||[]).filter(p=>p.trabajador_id!==id).concat(data);
  return data.length;
}
async function openFichaIncidentes(id){
  const w=WORKERS.find(x=>x.id===id);if(!w)return;
  await openCtrlIncidentes();
  const input=$('salud-buscar');if(input){input.value=fullName(w);ctrlFiltrarSalud(input.value);}
}
function fichaResumenHTML(w){
  const dato=(l,v)=>`<div><dt>${esc(l)}</dt><dd>${v||'—'}</dd></div>`;
  const bloque=(titulo,contenido)=>`<section class="worker-block"><h3>${esc(titulo)}</h3><dl>${contenido}</dl></section>`;
  const cuad=CUADS.find(c=>c.id===w.id_cuadrilla);
  return `<div class="worker-overview">
    ${bloque('Identificación y asignación',dato('Número',esc(String(w.no_trab??'')))+dato('Puesto',esc(w.puesto))+dato('Contratista',esc(w.contratista))+dato('Cuadrilla',esc(cuad?.nombre))+dato('NSS',esc(w.nss))+dato('CURP',esc(w.curp))+dato('RFC',esc(w.rfc))+dato('Centro de trabajo',esc(OBRA.nombre)))}
    ${bloque('Relación laboral',dato('Estatus',`<span class="badge ${esc(w.estatus)}">${esc(w.estatus)}</span>`)+dato('Fecha de alta',fmtD(w.fecha_alta))+dato('Reingreso',w.fecha_reingreso?`<span style="color:var(--amber)">${fmtD(w.fecha_reingreso)}</span>`:'—')+dato('Fecha de baja',w.fecha_baja?`<span style="color:var(--red)">${fmtD(w.fecha_baja)}</span>`:'—')+dato('Tipo de contrato',esc(w.tipo_contrato||'OBRA DETERMINADA'))+dato('Acuses IMSS',marcadoresIMSS(w)))}
    ${bloque('Contacto',dato('Teléfono',esc(w.telefono))+dato('Correo electrónico',esc(w.correo))+dato('Beneficiario',esc(w.beneficiario))+dato('Parentesco',esc(w.benef_parentesco))+dato('Teléfono del beneficiario',esc(w.benef_telefono))+dato('Domicilio',esc(w.direccion)))}
${bloque('Salario y forma de pago',dato('Salario diario','$'+money(w.sd))+dato('Salario integrado','$'+esc(w.sdi??'—'))+dato('Periodo',esc(w.periodo_pago||'SEMANAL'))+dato('Salario del periodo','$'+money(w.sal_semanal))+dato('Forma de pago',esc(w.forma_pago))+dato('Banco',esc(w.banco)))}
  </div>`;
}
function agruparExpedienteFicha(){
  const raiz=$('worker-more-content');if(!raiz)return;
  let cuerpo=null;
  const seccion=titulo=>{
    const detalle=document.createElement('details');detalle.className='worker-section';
    const resumen=document.createElement('summary');resumen.textContent=titulo;detalle.appendChild(resumen);
    const box=document.createElement('div');box.className='worker-section-body';detalle.appendChild(box);raiz.appendChild(detalle);return box;
  };
  // Mover nodos conserva IDs, eventos y actualizaciones dirigidas de documentos/pagos.
  const nodos=Array.from(raiz.childNodes);
  nodos.forEach(n=>{
    if(n.nodeType===1&&n.classList.contains('sect')){
      const label=n.cloneNode(true);label.querySelectorAll('button').forEach(b=>b.remove());
      cuerpo=seccion(label.textContent.trim());
      Array.from(n.childNodes).filter(x=>x.nodeType===3).forEach(x=>x.remove());
      n.className='ficha-section-actions';
      if(n.children.length)cuerpo.appendChild(n);
    }else if(n.nodeType===1&&(n.id==='fd-pagos'||n.id==='fd-docs')){
      cuerpo=seccion(n.id==='fd-pagos'?'Pagos bancarios':'Acuses IMSS, recibos y CFDI');cuerpo.appendChild(n);
    }else if(cuerpo)cuerpo.appendChild(n);
  });
}
function openDetail(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const d=w.docs||{};
  const kv=(l,v)=>`<div class="kv"><b>${l}</b><span>${(v??'')||'—'}</span></div>`;
  const chq=CHEQUES.filter(c=>c.trabajador_id===id||(w.curp&&c.curp===w.curp))
    .sort((a,b)=>(parseInt(String(a.semana||'').replace(/\D/g,''))||0)-(parseInt(String(b.semana||'').replace(/\D/g,''))||0));
  const _ids=navTrabajadores(), _pos=_ids.indexOf(id);
  const _nav=_ids.length>1?`<div class="ficha-nav">
      <button class="btn" ${_pos<=0?'disabled':''} onclick="abrirTrabajadorVecino('${id}',-1)" title="Trabajador anterior">‹</button>
      <span class="pos">${_pos>=0?(_pos+1)+' / '+_ids.length:''}</span>
      <button class="btn" ${_pos<0||_pos>=_ids.length-1?'disabled':''} onclick="abrirTrabajadorVecino('${id}',1)" title="Trabajador siguiente">›</button>
    </div>`:'';
  modal(`
    <div class="m-head"><h2>${esc(fullName(w))}</h2><span class="badge ${w.estatus}">${w.estatus}</span>
      <span class="badge ${w.periodo_pago||'SEMANAL'}">${w.periodo_pago||'SEMANAL'}</span>
      ${_nav}
      <button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      ${w.estatus==='PENDIENTE'?`<div style="background:var(--amber-bg);border:1px solid #ecd9a0;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px"><b style="color:var(--amber)">⏳ PENDIENTE</b> — ${(function(){if(w.pendiente_manual)return 'Pausado manualmente — <b>'+esc(w.motivo_pendiente||'SIN MOTIVO')+'</b>. No sale en proyección ni requisición y NO se reactiva solo: usa "Marcar ACTIVO" cuando se resuelva.';const f=datosFaltantes(w);return f.length?'Falta capturar: <b>'+f.join(', ')+'</b>. Al completarlo pasará a ACTIVO solo, o usa el botón "Marcar ACTIVO".':'Ya tiene todos los datos: usa el botón "Marcar ACTIVO".';})()}</div>`:''}
      <div id="worker-overview" data-activity-worker="${w.id}">${fichaResumenHTML(w)}</div>
      <details class="worker-more"><summary>Mostrar más · Expediente completo<small>Datos personales y bancarios · IMSS · créditos y descuentos · incidencias · documentos · recibos · historial</small></summary><div id="worker-more-content" class="worker-more-content">
      <div class="sect">Obra y puesto</div>
      ${kv('Obra',esc(OBRA.nombre))}${kv('Contratista',esc(w.contratista))}${kv('No. trabajador',w.no_trab)}${kv('Puesto',esc(w.puesto))}${kv('Funciones',esc(w.funciones))}${kv('Turno',esc(w.turno))}${kv('Semana de ingreso',esc(w.semana_ingreso))}${kv('Fecha alta',fmtD(w.fecha_alta))}${w.fecha_reingreso?kv('Fecha de reingreso',fmtD(w.fecha_reingreso)+' (la antigüedad cuenta desde aquí)'):''}${kv('Tipo de contrato',esc(w.tipo_contrato||'OBRA DETERMINADA')+(w.fecha_fin_contrato?' · vence '+fmtD(w.fecha_fin_contrato):''))}${(w.estatus==='BAJA'||w.fecha_baja)?kv('Fecha baja'+(w.estatus!=='BAJA'?' anterior':''),fmtD(w.fecha_baja))+(w.estatus==='BAJA'?kv('Monto finiquito',w.monto_finiquito!=null?'$'+money(w.monto_finiquito):''):''):''}
      <div class="sect">Salario <button class="btn" style="padding:2px 10px;font-size:11.5px;float:right" onclick="openHistSalario('${w.id}')">📈 Historial de salario</button></div>
      ${kv('Periodo de pago',w.periodo_pago||'SEMANAL')}${kv('SD','$'+money(w.sd))}${kv('SDI','$'+esc(w.sdi??'—'))}${kv('Salario '+(w.periodo_pago==='QUINCENAL'?'quincenal':'semanal'),'$'+money(w.sal_semanal))}
      <div class="sect">Datos personales</div>
      ${kv('CURP',esc(w.curp))}${kv('RFC',esc(w.rfc))}${kv('NSS',esc(w.nss))}${kv('Fecha de nacimiento',fmtD(w.fecha_nacimiento)+(w.fecha_nacimiento?' ('+edad(w.fecha_nacimiento)+' años)':''))}${kv('Género',esc(w.genero))}${kv('Estado civil',esc(w.estado_civil))}${kv('Escolaridad',esc(w.escolaridad))}${kv('Nacionalidad',esc(w.nacionalidad))}${kv('Edo. nacimiento',esc(w.edo_nacimiento))}${kv('Dirección',esc(w.direccion))}${kv('C.P.',esc(w.cp))}${kv('Teléfono',esc(w.telefono))}${kv('Correo',esc(w.correo))}${kv('Beneficiario',esc(w.beneficiario)+((w.benef_parentesco||w.benef_telefono||(w.benef_porcentaje!=null&&w.benef_porcentaje!==''))?` <span style="color:var(--mut);font-size:11.5px">(${[w.benef_parentesco?esc(w.benef_parentesco):'',w.benef_telefono?'tel. '+esc(w.benef_telefono):'',(w.benef_porcentaje!=null&&w.benef_porcentaje!=='')?esc(w.benef_porcentaje)+'%':''].filter(Boolean).join(' · ')})</span>`:''))}
      <div class="sect">Datos bancarios</div>
      ${kv('Cuenta',esc(w.cuenta))}${kv('CLABE',esc(w.clabe))}${kv('Banco',esc(w.banco))}${kv('Forma de pago',esc(w.forma_pago))}${kv('Observaciones',esc(w.observaciones))}
      <div class="sect">IMSS ${puedeEditarTrabajador()?`<button class="btn" onclick="openIMSSWorker('${w.id}')">⚙ Gestionar IMSS</button>`:''}</div>
      ${kv('Movimiento IMSS',esc(w.movimiento_imss||'SIN MOVIMIENTO'))}${kv('Fecha del movimiento',fmtD(w.fecha_mov_imss))}${kv('SBC (SDI)','$'+esc(w.sdi??'—'))}${kv('Registro patronal',esc(rpDe(w))+(tieneRPpropio(w)?' <b style="color:var(--accent)">(propio)</b>':' <span style="color:var(--mut)">(de la obra)</span>'))}${tieneRPpropio(w)?kv('Prima RT','<b style="color:var(--accent)">'+primaDe(w)+'% (propia)</b>'):''}
      <div class="sect">Incidentes e incapacidades IMSS</div>
      ${kv('Expediente de salud',`<button class="btn" onclick="openFichaIncidentes('${w.id}')">Ver incidentes, certificados, calendario y ST-7</button>`)}
      ${kv('Avisos INFONAVIT',`<button class="btn" onclick="openAvisosInfonavit('${String(w.nss||'').replace(/\D/g,'')}','${String(rpDe(w)||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}')">Comparar avisos de su registro patronal</button> <small>Consulta sin modificar su crédito.</small>`)}
      ${(function(){
        const fijos=DESC.filter(d=>d.trabajador_id===w.id&&d.recurrente&&d.activo);
        const inc=DESC.filter(d=>d.trabajador_id===w.id&&!d.recurrente&&d.activo).sort((a,b)=>String(b.semana).localeCompare(String(a.semana))).slice(0,8);
        return `<div class="sect">Descuentos <button class="btn" style="float:right;padding:3px 10px;font-size:11.5px;margin-top:-4px" onclick="openDescuento('${w.id}')">＋ Agregar descuento fijo</button></div>
        ${fijos.length?fijos.map(d=>`<div class="kv"><b>${esc(d.tipo)} (fijo)</b><span>S${isoWeek()}: $${money(retencionAplicadaPeriodo(d,w,'S'+isoWeek(),perDe(w)).monto)} · ${String(d.tipo).toUpperCase()==='INFONAVIT'?`crédito ${numeroCreditoInfonavit(d)?esc(numeroCreditoInfonavit(d)):'<b style="color:var(--amber)">⚠ número sin cotejar</b>'} · `:''}${esc(d.motivo)||'sin nota'}${exResumen(d)} <button class="btn" style="padding:2px 8px;font-size:11px;margin-left:6px" onclick="openDescuento('${w.id}','${d.id}')">✏️ Editar</button> <button class="btn" style="padding:2px 8px;font-size:11px;margin-left:6px" onclick="openAjusteRetencion('${d.id}')">＋ Días/importe</button> ${String(d.tipo).toUpperCase()==='INFONAVIT'?`<button class="btn" style="padding:2px 8px;font-size:11px;margin-left:6px" onclick="openCreditoNumero('${d.id}')">No. crédito</button>`:''} <button class="btn" style="padding:2px 8px;font-size:11px;margin-left:6px" onclick="openExcepcion('${d.id}')">⏸/×2 Semana</button> <button class="btn danger" style="padding:2px 8px;font-size:11px;margin-left:8px" onclick="toggleDescuento('${d.id}',false)">Desactivar</button></span></div>`).join(''):'<div class="kv"><b>Fijos</b><span>Sin descuentos fijos activos</span></div>'}
        ${inc.length?inc.map(d=>`<div class="kv"><b>${esc(d.semana)} · ${esc(d.tipo)}</b><span>$${money(d.monto)} · ${esc(d.motivo)||''} <button class="btn danger" style="padding:2px 8px;font-size:11px;margin-left:8px" onclick="toggleDescuento('${d.id}',false)">Quitar</button></span></div>`).join(''):''}`;
      })()}
      ${(function(){
        const s=saldoVac(w);
        const f=fueraHoy(w);
        const nActas=ACTAS.filter(a=>a.trabajador_id===w.id&&a.activo!==false).length;
        const nomU=NOM.filter(n=>n.trabajador_id===w.id&&n.activo!==false).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)))[0];
        return `<div class="sect">Vacaciones, actas y NOM-035</div>
        <div class="kv"><b>Vacaciones</b><span>Saldo <b style="color:var(--green)">${s.saldo}</b> de ${s.derecho} día(s) · ${s.anios} año(s) de antigüedad ${f?` · <span class="badge PENDIENTE">${esc(f.tipo)} hasta ${fmtD(f.fecha_fin)}</span>`:''} <button class="btn" style="padding:2px 10px;font-size:11px;margin-left:6px" onclick="openVacForm('${w.id}')">🌴 Ver / registrar</button></span></div>
        <div class="kv"><b>Actas</b><span>${nActas?nActas+' registro(s) en su expediente':'Sin actas'} <button class="btn" style="padding:2px 10px;font-size:11px;margin-left:6px" onclick="openActaForm('${w.id}')">📋 Nueva acta</button></span></div>
        <div class="kv"><b>NOM-035</b><span>${nomU?`${esc(nomU.guia)} · ${fmtD(nomU.fecha)} · <b>${esc(nomU.resultado)}</b>${nomU.requiere_atencion?' ⚠️':''}`:'Sin evaluación registrada'}</span></div>`;
      })()}
      ${(function(){
        /* CONTROL INTERNO SALARIAL (Bloque 2) — solo VIP.
           Esconder el recuadro no protegería nada: lo que de verdad tapa las
           cifras es la política RLS de sueldos_internos, que a quien no es VIP
           le devuelve CERO filas. Este `if` solo evita mostrar un recuadro
           vacío a quien no tiene por qué verlo. */
        if(!esVip())return '';
        const si=sueldoInternoDe(w.id)||{};
        const dif=(Number(si.sueldo_real)||0)-(Number(si.sueldo_imss)||0);
        return `<div class="sect">Control interno salarial <span class="badge PENDIENTE" style="font-size:9.5px;margin-left:6px">SOLO VIP</span></div>
        <div class="kv" style="background:var(--blue-bg)"><b>Métrica interna</b><span style="font-size:12px">Estas cifras <b>no intervienen</b> en el cálculo de nómina, ISR ni IMSS: son solo para medir la diferencia entre lo registrado y lo que se paga.</span></div>
        <div class="kv"><b>Sueldo registrado (IMSS)</b><span>${si.sueldo_imss!=null?'$'+money(si.sueldo_imss):'<span style="color:var(--mut)">sin capturar</span>'}</span></div>
        <div class="kv"><b>Sueldo real</b><span>${si.sueldo_real!=null?'$'+money(si.sueldo_real):'<span style="color:var(--mut)">sin capturar</span>'}</span></div>
        ${(si.sueldo_imss!=null&&si.sueldo_real!=null)?`<div class="kv"><b>Diferencia</b><span><b style="color:${dif>0?'var(--amber)':'var(--txt)'}">${dif>=0?'+':''}$${money(dif)}</b>${si.sueldo_imss>0?` · el real es ${Math.round((Number(si.sueldo_real)/Number(si.sueldo_imss))*100)}% del registrado`:''}</span></div>`:''}
        <div class="kv"><b></b><span><button class="btn" style="padding:3px 12px;font-size:12px" onclick="openSueldoInterno('${w.id}')">✎ Editar control interno</button>${si.actualizado_por?` <span style="color:var(--mut);font-size:11px;margin-left:8px">Última edición: ${esc(si.actualizado_por)}</span>`:''}</span></div>`;
      })()}
      <div id="fd-pagos">${fichaPagosHTML(w)}</div>
      <div id="fd-docs">${fichaDocsHTML(w)}</div>
      <div class="sect">Documentación (${docsOk(w)}/${DOCS.length} entregados)</div>
      ${DOCS.map(k=>`<div class="kv"><b>${k}</b><span>${d[k]==='ENTREGADO'?'✅ ENTREGADO':(d[k]==='NO APLICA'?'➖ NO APLICA':'⬜ PENDIENTE')}</span></div>`).join('')}
      ${kv('Carpeta en Drive',w.drive_link?`<a href="${esc(w.drive_link)}" target="_blank">${esc(w.drive_link)}</a>`:'')}
      ${chq.length?`<div class="sect">Cheques de este trabajador (${chq.length})</div>
        ${chq.map(c=>`<div class="kv"><b>${esc(c.semana)} · ${esc(c.tipo_pago)}</b><span>$${money(c.importe)} · ${c.num_cheque?'Cheque '+esc(c.num_cheque):'sin número'} · <span class="badge ${c.estatus}">${c.estatus}</span></span></div>`).join('')}`:''}
      <div class="sect">Registro</div>
      ${kv('Capturado por',esc(w.creado_por))}${kv('Última modificación',esc(w.actualizado_por)+' · '+fmtD(w.updated_at))}
      </div></details>
    </div>
    <div class="m-foot">
      <details class="worker-actions"><summary>Herramientas de este trabajador · editar, documentos y movimientos</summary><div>
      <button class="btn" onclick="exportExpediente('${w.id}')">📊 Exportar expediente (Excel)</button>
      <button class="btn" onclick="openHistorial('${w.id}')">🕘 Historial</button>
      ${window.PLATINUM_RRHH?`<button class="btn" onclick="PLATINUM_RRHH.abrir('expediente','${w.id}')">🗂 Expediente 360</button><button class="btn" onclick="PLATINUM_RRHH.abrir('importe','${w.id}')">🔎 Explicar nómina</button>`:''}
      ${puedeEditarTrabajador()?`<button class="btn" onclick="openIMSSWorker('${w.id}')">🏥 Control IMSS</button>`:''}
      <button class="btn" onclick="openValidar('${w.id}')">🔍 Validar</button>
      <button class="btn" onclick="openContrato('${w.id}')">📄 Contrato</button>
      <button class="btn" onclick="openConstanciaLaboral('${w.id}')">📜 Constancia laboral</button>
      <button class="btn" onclick="openPrestaciones('${w.id}')">🧮 Prestaciones</button>
      ${w.estatus==='PENDIENTE'?`<button class="btn" style="color:var(--green);border-color:#b7dcc8" onclick="doActivar('${w.id}')">✔ Marcar ACTIVO</button>`:''}
      ${w.estatus==='ACTIVO'?`<button class="btn" style="color:#8a6d1a;border-color:#ecd9a0" onclick="openPendiente('${w.id}')">⏸ Pasar a PENDIENTE</button>
      <button class="btn" onclick="openTransferencia('${w.id}')">🔁 Transferir de obra</button>`:''}
      ${w.estatus!=='BAJA'
        ?`<button class="btn" onclick="openSeparacionDoc('${w.id}')">📄 Documento de separación</button>
           <button class="btn danger" onclick="openBaja('${w.id}')">Dar de BAJA</button>`
        :`<button class="btn" onclick="openRenuncia('${w.id}')">📄 Renuncia y finiquito</button>
           <button class="btn" onclick="doReactivar('${w.id}')">Reactivar (nueva alta)</button>`}
      <button class="btn dark" onclick="openForm('${w.id}')">✎ Modificar</button>
      ${esAdmin()?`<button class="btn danger" style="background:#7a1414;border-color:#7a1414" onclick="openEliminarTrabajador('${w.id}')">🗑 Eliminar (papelera)</button>`:''}
      </div></details>
    </div>`,'worker-ficha');
  agruparExpedienteFicha();
  /* Consulta dirigida de SUS documentos, filtrando en el servidor. Si trae
     algo que la carga masiva no tenía, se vuelve a pintar solo esa sección.
     Se comprueba que la ficha siga abierta y sea la misma persona: si el
     usuario ya se movió a otra, no se le repinta encima. */
  refrescaDocsDe(id).then(n=>{
    if(n===null)return;
    renderTable();
    const principal=$('worker-overview');
    if(principal&&document.querySelector(`#modals [onclick*="openForm('${id}')"]`))principal.innerHTML=fichaResumenHTML(w);
    const cont=$('fd-docs');
    if(cont&&document.querySelector(`#modals [onclick*="openForm('${id}')"]`))
      cont.innerHTML=fichaDocsHTML(w);
  }).catch(()=>{});
  refrescaPagosDe(id).then(()=>{const cont=$('fd-pagos');if(cont&&document.querySelector(`#modals [onclick*="openForm('${id}')"]`))cont.innerHTML=fichaPagosHTML(w);}).catch(()=>{});
}
/* v20: eliminar = mover a la papelera (eliminado=true). Solo visible/permitido
   para el administrador (esAdmin()). Pide escribir el nombre EXACTO para evitar
   un clic accidental — no hay atajo ni doble-clic que la salte. */
function openEliminarTrabajador(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const nombre=fullName(w);
  modal(`
    <div class="m-head"><h2 style="color:var(--red)">🗑 Eliminar trabajador</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="franja-aviso">
        Vas a mover a <b>${esc(nombre)}</b> (${esc(w.estatus)}) a la <b>papelera</b>. No sale en ninguna
        vista, conteo, proyección ni exportación — solo tú puedes verlo y restaurarlo desde
        🗑 Papelera. Esta acción queda protegida en la base de datos: nadie más puede hacerla
        ni deshacerla, ni siquiera editando el código.
      </div>
      <div><label>Motivo (obligatorio, queda en el registro)</label><input id="el-motivo" placeholder="Ej. nunca se presentó, registro duplicado, etc."></div>
      <div style="margin-top:10px"><label>Escribe el nombre completo para confirmar: <b>${esc(nombre)}</b></label>
        <input id="el-confirma" placeholder="Escribe aquí el nombre exacto" autocomplete="off"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn danger" style="background:#7a1414;border-color:#7a1414" onclick="eliminarTrabajador('${id}')">🗑 Eliminar definitivamente de las vistas</button>
    </div>`,'md');
}
async function eliminarTrabajador(id){
  if(!esAdmin()){toast('Solo el administrador puede eliminar trabajadores.','err');return;}
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const motivo=($('el-motivo').value||'').trim();
  const confirma=($('el-confirma').value||'').trim().toUpperCase();
  if(!motivo){toast('Escribe el motivo de la eliminación.','err');return;}
  if(confirma!==fullName(w).toUpperCase()){toast('El nombre no coincide exactamente. Revísalo.','err');return;}
  markWrite();
  const {error}=await sb.from('trabajadores').update({
    eliminado:true, eliminado_en:new Date().toISOString(), eliminado_por:USER.email,
    motivo_eliminacion:motivo.toUpperCase()
  }).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast(`${fullName(w)} se movió a la papelera.`,'ok');
  await loadObraData(OBRA.id);refreshCounts();
}
/* v20: papelera — lista TODAS las obras (vista global del administrador).
   Protegida dos veces: el botón que abre esto ya está oculto para los otros
   3 usuarios, y aunque alguien forzara la llamada, la política de SELECT en
   Supabase (Script 27) hace que la consulta les regrese 0 filas siempre. */
async function openPapelera(){
  if(!esAdmin()){toast('Solo el administrador tiene acceso a la papelera.','err');return;}
  const {data,error}=await sb.from('trabajadores').select('*').eq('eliminado',true).order('eliminado_en',{ascending:false});
  if(error){toast('Error al leer la papelera: '+error.message,'err');return;}
  const rows=data||[];
  modal(`
    <div class="m-head"><h2>🗑 Papelera de trabajadores</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:14px">Solo tú puedes ver esta lista — no aparecen en conteos, proyecciones ni exportaciones de nadie. Restaurar los regresa exactamente con el estatus que tenían.</p>
      ${rows.length?rows.map(w=>{const o=OBRAS.find(x=>x.id===w.obra_id);return `
        <div class="hist-item">
          <div class="hist-top"><span class="who">${esc(fullName(w))}</span><span class="badge ${w.estatus}">${w.estatus}</span>
            <button class="btn" style="margin-left:auto" onclick="restaurarTrabajador('${w.id}')">♻ Restaurar</button></div>
          <div style="font-size:12px;color:var(--mut)">${esc(o?o.nombre:'—')} · eliminado ${fmtD(w.eliminado_en)} por ${esc(w.eliminado_por||'—')} · motivo: ${esc(w.motivo_eliminacion||'sin motivo')}</div>
        </div>`;}).join(''):'<div class="empty">🗑 Papelera vacía. Nada eliminado.</div>'}
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'lg');
}
async function restaurarTrabajador(id){
  if(!esAdmin()){toast('Solo el administrador puede restaurar.','err');return;}
  if(!confirm('¿Restaurar a este trabajador? Vuelve a aparecer en todas las vistas con su estatus original.'))return;
  markWrite();
  const {error}=await sb.from('trabajadores').update({eliminado:false}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  toast('Trabajador restaurado.','ok');
  closeModal();
  await loadObraData(OBRA.id);refreshCounts();
  openPapelera();
}

