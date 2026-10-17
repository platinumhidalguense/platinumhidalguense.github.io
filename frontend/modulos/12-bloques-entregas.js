/* ---------- BLOQUES Y REUNIONES DE ENTREGA (v78) ----------------------
   Un bloque agrupa los cheques vigentes de una obra y semana. Supabase lo
   crea al expedir el primer cheque y conserva la hora real. Las reuniones
   toman una fotografía de los cheques incluidos para marcarlos uno a uno. */
function bloquesDatos(){
  const porSem=new Map();
  (CHEQUES||[]).forEach(c=>{
    if(c.eliminado)return;
    if(String(c.estatus||'').toUpperCase()==='CANCELADO')return;
    const sem=normSem(c.semana); if(!sem)return;
    if(!porSem.has(sem))porSem.set(sem,{sem,cuantos:0,monto:0,pendientes:0,expedidos:0,entregados:0,finiquitos:0,contr:new Map()});
    const b=porSem.get(sem), imp=Number(c.importe)||0, est=String(c.estatus||'').toUpperCase();
    b.cuantos++; b.monto+=imp;
    if(est==='PENDIENTE')b.pendientes++; else if(est==='EXPEDIDO')b.expedidos++; else if(est==='ENTREGADO')b.entregados++;
    if(String(c.tipo_pago||'').toUpperCase()==='FINIQUITO')b.finiquitos++;
    const k=String(c.contratista||'').trim()||'(sin contratista)';
    const x=b.contr.get(k)||{contratista:k,cuantos:0,monto:0};
    x.cuantos++; x.monto+=imp; b.contr.set(k,x);
  });
  // Semanas con registro pero sin cheques vigentes: también se muestran.
  (BLOQUES||[]).forEach(r=>{const sem=String(r.semana);
    if(!porSem.has(sem))porSem.set(sem,{sem,cuantos:0,monto:0,pendientes:0,expedidos:0,entregados:0,finiquitos:0,contr:new Map()});});
  return [...porSem.values()].map(b=>{
    const reg=(BLOQUES||[]).find(r=>String(r.semana)===b.sem)||null;
    return {...b, reg, desglose:[...b.contr.values()].sort((x,y)=>y.monto-x.monto)};
  }).sort((a,b)=>Number(b.sem)-Number(a.sem));
}
function openBloques(){
  modal(`
    <div class="m-head"><h2>📦 Bloques de cheques · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn dark" onclick="openReunionesEntrega()">🤝 Reuniones de entrega</button></div>
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">El sistema crea el bloque <b>automáticamente al expedir el primer cheque</b> de cada obra y semana, conservando fecha y hora. Los importes siempre se calculan desde los cheques vigentes. Usa “Reuniones de entrega” para elegir uno o varios bloques y confirmar cada entrega física.</p>
      <div id="bq-out"></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'lg');
  bqPinta();
}
function bqPinta(){
  const out=$('bq-out'); if(!out)return;
  const bs=bloquesDatos();
  if(!bs.length){out.innerHTML='<div class="empty"><div class="big">📦</div>Todavía no hay cheques capturados en esta obra.</div>';return;}
  out.innerHTML=bs.map(b=>{
    const r=b.reg;
    return `<div class="card-bq" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
        <b style="font-size:16px">Semana ${esc(b.sem)}</b>
        ${r?'':'<span class="badge PENDIENTE" style="font-size:9.5px">SIN FECHAS</span>'}
        <span style="margin-left:auto">
          <button class="btn" style="padding:3px 12px;font-size:12px" onclick="openBloqueFechas('${b.sem}')">${r?'✎ Editar fechas':'📅 Capturar fechas'}</button>
        </span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div class="stat"><div class="n">${b.cuantos}</div><div class="l">Cheques</div></div>
        <div class="stat g"><div class="n">$${money(b.monto)}</div><div class="l">Monto del bloque</div></div>
        <div class="stat r"><div class="n">${b.pendientes}</div><div class="l">Sin expedir</div></div>
        <div class="stat a"><div class="n">${b.expedidos}</div><div class="l">Expedidos por entregar</div></div>
        <div class="stat b"><div class="n">${b.entregados}</div><div class="l">Entregados</div></div>
        ${b.finiquitos?`<div class="stat r"><div class="n">${b.finiquitos}</div><div class="l">Finiquitos</div></div>`:''}
      </div>
      <div class="kv"><b>Creado</b><span>${r&&r.fecha_creacion?fmtD(r.fecha_creacion):'<span style="color:var(--mut)">sin capturar</span>'}</span></div>
      ${r&&r.generado_en?`<div class="kv"><b>Detectado por el sistema</b><span>${new Date(r.generado_en).toLocaleString('es-MX')} · ${esc(r.origen_generacion||'AUTOMATICO')}</span></div>`:''}
      <div class="kv"><b>Entrega programada</b><span>${r&&r.fecha_entrega?fmtD(r.fecha_entrega):'<span style="color:var(--mut)">sin programar</span>'}</span></div>
      ${r&&r.notas?`<div class="kv"><b>Notas</b><span>${esc(r.notas)}</span></div>`:''}
      <div class="sect" style="margin-top:10px">Desglose por contratista</div>
      ${b.desglose.length?`<table class="tb"><thead><tr><th>Contratista</th><th style="text-align:right">Cheques</th><th style="text-align:right">Monto</th></tr></thead><tbody>
        ${b.desglose.map(d=>`<tr><td><b>${esc(d.contratista)}</b></td><td style="text-align:right">${d.cuantos}</td><td style="text-align:right">$${money(d.monto)}</td></tr>`).join('')}
      </tbody></table>`:'<div class="kv"><b>—</b><span>Sin cheques vigentes en esta semana.</span></div>'}
    </div>`;
  }).join('');
}
function openBloqueFechas(sem){
  const r=(BLOQUES||[]).find(x=>String(x.semana)===String(sem))||{};
  modal2(`
    <div class="m-head"><h2>📅 Bloque · Semana ${esc(sem)}</h2><button class="x" onclick="closeModal2()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Solo las fechas y las notas: las cantidades y los montos salen de los cheques y no se capturan.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Fecha de creación</label><input id="bq-f1" type="date" value="${r.fecha_creacion?String(r.fecha_creacion).slice(0,10):today()}"></div>
        <div><label>Entrega programada</label><input id="bq-f2" type="date" value="${r.fecha_entrega?String(r.fecha_entrega).slice(0,10):''}"></div>
      </div>
      <div class="fld" style="margin-top:10px"><label>Notas (opcional)</label><input id="bq-notas" value="${esc(r.notas||'')}" placeholder="Referencia o comentario"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal2()">Cancelar</button>
      ${r.id?`<button class="btn danger" onclick="bqBorrar('${r.id}')">Limpiar datos manuales</button>`:''}
      <button class="btn dark" onclick="bqGuardar('${sem}')">Guardar</button>
    </div>`,'sm');
}
async function bqGuardar(sem){
  const fila={obra_id:OBRA.id, semana:Number(normSem(sem)),
    fecha_creacion:$('bq-f1').value||today(), fecha_entrega:$('bq-f2').value||null,
    notas:$('bq-notas').value.trim()||null, creado_por:USER.email, updated_at:new Date().toISOString()};
  const {error}=await sb.from('bloques_cheques').upsert(fila,{onConflict:'obra_id,semana'});
  if(error){toast('No se pudo guardar: '+error.message,'err');return;}
  const {data}=await fetchAllRows(()=>sb.from('bloques_cheques').select('*').eq('obra_id',OBRA.id));
  BLOQUES=data||[];
  closeModal2(); bqPinta();
  toast(`Bloque de la semana ${sem} guardado.`,'ok');
}
async function bqBorrar(id){
  if(!confirm('¿Limpiar la fecha programada y las notas? El bloque automático y sus cheques se conservan.'))return;
  const {error}=await sb.from('bloques_cheques').update({fecha_entrega:null,notas:null,updated_at:new Date().toISOString()}).eq('id',id).eq('obra_id',OBRA.id);
  if(error){toast('No se pudo quitar: '+error.message,'err');return;}
  BLOQUES=(BLOQUES||[]).map(x=>x.id===id?{...x,fecha_entrega:null,notas:null}:x);
  closeModal2(); bqPinta();
  toast('Datos manuales limpiados. El bloque automático se conserva.','ok');
}
/* ---------- REUNIONES DE ENTREGA DE CHEQUES (v78) --------------------
   EXPEDIDO significa que el pago ya está cubierto y deja de ser faltante.
   ENTREGADO confirma, por separado, la recepción física en una reunión. */
const reFechaHora=v=>v?new Date(v).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}):'—';
function reAhoraLocal(){const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000);return d.toISOString().slice(0,16);}
function reError(e){const m=(e&&e.message)||String(e||'');return /reunion_|bloques_cheques|schema cache|does not exist|could not find/i.test(m)?'Falta aplicar el archivo 78_REUNIONES_ENTREGA_CHEQUES.sql en Supabase.':m;}
async function reLeerIds(tabla,ids){
  const unicos=[...new Set((ids||[]).filter(Boolean))],out=[];
  for(let i=0;i<unicos.length;i+=200){
    const {data,error}=await sb.from(tabla).select('*').in('id',unicos.slice(i,i+200));
    if(error)return {data:out,error}; out.push(...(data||[]));
  }
  return {data:out,error:null};
}
function reObraNombre(id){return (OBRAS.find(o=>o.id===id)||{}).nombre||'Centro sin identificar';}
async function openReunionesEntrega(){
  if(!OBRA){toast('Selecciona un centro de trabajo.','err');return;}
  modal(`<div class="m-head"><h2>🤝 Reuniones de entrega de cheques</h2><span style="font-size:11px;color:var(--mut)">${esc((EMPRESAS[EMPRESA_ACTIVA]||{}).nombre||EMPRESA_ACTIVA)}</span><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn dark" onclick="openNuevaReunionEntrega()">＋ Programar reunión</button><button class="btn" onclick="openBloques()">📦 Ver bloques</button></div>
      <p style="font-size:12.5px;color:var(--mut);margin-bottom:12px"><b>Expedido</b> ya cuenta como pago cubierto. Esta pantalla documenta la entrega física: selecciona los bloques, registra la reunión y marca cada cheque al entregarlo.</p>
      <div id="re-list"><div class="empty"><span class="spin"></span> Cargando reuniones...</div></div></div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'lg');
  const {data,error}=await fetchAllRows(()=>sb.from('reuniones_entrega_cheques').select('*').eq('empresa_codigo',EMPRESA_ACTIVA),'id');
  if(error){$('re-list').innerHTML=`<div class="empty bad">${esc(reError(error))}</div>`;return;}
  const rows=(data||[]).sort((a,b)=>new Date(b.fecha_hora)-new Date(a.fecha_hora)); window._REUNIONES_ENTREGA=rows;
  $('re-list').innerHTML=rows.length?`<div class="tbl-card" style="overflow:auto"><table><thead><tr><th>Fecha y hora</th><th>Lugar</th><th>Responsable</th><th>Estado</th><th>Creada por</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${reFechaHora(r.fecha_hora)}</b></td><td>${esc(r.lugar||'—')}</td><td>${esc(r.responsable)}</td><td>${ctrlEstado(r.estado)}</td><td>${esc(r.creada_por_email||'—')}</td><td><button class="btn" style="padding:3px 9px" onclick="openReunionEntrega('${r.id}')">Abrir</button></td></tr>`).join('')}</tbody></table></div>`
    :'<div class="empty"><div class="big">🤝</div>No hay reuniones registradas para esta razón social.</div>';
}
async function openNuevaReunionEntrega(){
  const obraIds=obrasEmpresa().map(o=>o.id); if(!obraIds.length){toast('Esta razón social no tiene centros activos.','err');return;}
  const [br,qr,resr]=await Promise.all([
    fetchAllRows(()=>sb.from('bloques_cheques').select('*').in('obra_id',obraIds),'id'),
    fetchAllRows(()=>sb.from('cheques').select('*').in('obra_id',obraIds).in('estatus',['PENDIENTE','EXPEDIDO']).or('eliminado.eq.false,eliminado.is.null'),'id'),
    fetchAllRows(()=>sb.from('reunion_cheques_entrega').select('id,cheque_id').eq('entregado',false).eq('activo',true),'id')
  ]);
  const error=br.error||qr.error||resr.error;if(error){toast(reError(error),'err');return;}
  const reservados=new Set((resr.data||[]).map(x=>x.cheque_id));
  const bloques=(br.data||[]).map(b=>{
    const q=(qr.data||[]).filter(x=>x.obra_id===b.obra_id&&normSem(x.semana)===String(b.semana)&&!reservados.has(x.id));
    return {...b,cheques:q,total:q.reduce((s,x)=>s+(Number(x.importe)||0),0)};
  }).filter(b=>b.cheques.length).sort((a,b)=>Number(b.semana)-Number(a.semana)||reObraNombre(a.obra_id).localeCompare(reObraNombre(b.obra_id),'es'));
  window._RE_BLOQUES=bloques;
  if(!bloques.length){toast('No hay bloques con cheques disponibles para programar.','err');return;}
  modal2(`<div class="m-head"><h2>＋ Programar entrega de cheques</h2><button class="x" onclick="closeModal2()">×</button></div>
    <div class="m-body"><div class="grid" style="grid-template-columns:1fr 1fr"><div><label>Fecha y hora *</label><input id="re-fecha" type="datetime-local" value="${reAhoraLocal()}"></div><div><label>Responsable *</label><input id="re-resp" value="${esc((USER&&USER.email)||'')}"></div><div class="c2"><label>Lugar</label><input id="re-lugar" placeholder="Oficina, sala o punto de entrega"></div><div class="c2"><label>Notas</label><input id="re-notas" placeholder="Indicaciones opcionales"></div></div>
      <div class="sect" style="margin-top:14px">Bloques a entregar</div><p style="font-size:11.5px;color:var(--mut);margin:6px 0 10px">Solo aparecen cheques pendientes o expedidos que no están pendientes en otra reunión.</p>
      <div style="max-height:310px;overflow:auto">${bloques.map((b,i)=>`<label style="display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:9px;padding:10px;margin-bottom:7px;cursor:pointer"><input class="re-bloque" type="checkbox" value="${b.id}" ${i===0&&b.obra_id===OBRA.id?'checked':''}><span style="flex:1"><b>${esc(reObraNombre(b.obra_id))} · S${b.semana}</b><small style="display:block;color:var(--mut)">${b.cheques.length} cheque(s) disponibles · $${money(b.total)}${b.generado_en?' · bloque detectado '+reFechaHora(b.generado_en):''}</small></span></label>`).join('')}</div></div>
    <div class="m-foot"><button class="btn" onclick="closeModal2()">Cancelar</button><button class="btn dark" id="re-crear" onclick="crearReunionEntrega()">Crear reunión</button></div>`,'md');
}
async function crearReunionEntrega(){
  const bloques=[...document.querySelectorAll('.re-bloque:checked')].map(x=>x.value),fecha=$('re-fecha').value,resp=$('re-resp').value.trim();
  if(!bloques.length){toast('Selecciona al menos un bloque.','err');return;}if(!fecha){toast('Indica fecha y hora.','err');return;}if(!resp){toast('Indica a la persona responsable.','err');return;}
  $('re-crear').innerHTML='<span class="spin"></span> Creando...';markWrite();
  const {data,error}=await sb.rpc('reunion_crear_entrega',{p_empresa:EMPRESA_ACTIVA,p_fecha_hora:new Date(fecha).toISOString(),p_lugar:$('re-lugar').value.trim(),p_responsable:resp,p_notas:$('re-notas').value.trim()||null,p_bloques:bloques});
  if(error){$('re-crear').textContent='Crear reunión';toast(reError(error),'err');return;}
  closeModal2();await ctrlAuditar('REUNION_CHEQUES','CREAR',{empresa:EMPRESA_ACTIVA,bloques,fecha_hora:fecha},'reunion_entrega',data);toast('Reunión programada con sus bloques.','ok');await openReunionEntrega(data);
}
async function reCargar(id){
  const [rr,lr,br]=await Promise.all([
    sb.from('reuniones_entrega_cheques').select('*').eq('id',id).eq('empresa_codigo',EMPRESA_ACTIVA).limit(1),
    fetchAllRows(()=>sb.from('reunion_cheques_entrega').select('*').eq('reunion_id',id),'id'),
    fetchAllRows(()=>sb.from('reunion_bloques_cheques').select('*').eq('reunion_id',id),'bloque_id')
  ]);
  const error=rr.error||lr.error||br.error;if(error)return {error}; const reunion=(rr.data||[])[0];if(!reunion)return {error:{message:'No se encontró la reunión en esta razón social.'}};
  const [qr,bdr]=await Promise.all([reLeerIds('cheques',(lr.data||[]).map(x=>x.cheque_id)),reLeerIds('bloques_cheques',(br.data||[]).map(x=>x.bloque_id))]);
  return {reunion,lineas:lr.data||[],cheques:qr.data||[],bloques:bdr.data||[],error:qr.error||bdr.error};
}
async function openReunionEntrega(id){
  const st=await reCargar(id);if(st.error){toast(reError(st.error),'err');return;}window._REUNION_ENTREGA=st;rePintarDetalle();
}
function rePintarDetalle(){
  const st=window._REUNION_ENTREGA;if(!st)return;const r=st.reunion,qm=new Map(st.cheques.map(q=>[q.id,q]));
  const bm=new Map(st.bloques.map(b=>[`${b.obra_id}|${b.semana}`,b]));
  const filas=st.lineas.map(l=>{const q=qm.get(l.cheque_id)||{};return {l,q,b:bm.get(`${q.obra_id}|${normSem(q.semana)}`)};});
  const activos=filas.filter(x=>x.l.activo!==false),liberados=filas.length-activos.length,entregados=activos.filter(x=>x.l.entregado).length,expedidos=activos.filter(x=>!x.l.entregado&&x.q.estatus==='EXPEDIDO').length,pendientes=activos.length-entregados-expedidos,abierta=['PROGRAMADA','EN_CURSO'].includes(r.estado);
  modal(`<div class="m-head"><h2>🤝 Entrega · ${reFechaHora(r.fecha_hora)}</h2>${ctrlEstado(r.estado)}<button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body"><div class="kv"><b>Razón social</b><span>${esc((EMPRESAS[r.empresa_codigo]||{}).nombre||r.empresa_codigo)}</span></div><div class="kv"><b>Lugar / responsable</b><span>${esc(r.lugar||'Sin lugar')} · ${esc(r.responsable)}</span></div>${r.notas?`<div class="kv"><b>Notas</b><span>${esc(r.notas)}</span></div>`:''}
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin:12px 0"><div class="stat"><div class="n">${filas.length}</div><div class="l">Incluidos</div></div><div class="stat a"><div class="n">${pendientes}</div><div class="l">Sin expedir</div></div><div class="stat g"><div class="n">${expedidos}</div><div class="l">Expedidos por entregar</div></div><div class="stat b"><div class="n">${entregados}</div><div class="l">Entregados</div></div>${liberados?`<div class="stat"><div class="n">${liberados}</div><div class="l">Liberados al cancelar</div></div>`:''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${abierta?`<button class="btn dark" onclick="openAgregarChequeReunion('${r.id}')">＋ Añadir cheque manualmente</button>`:''}<button class="btn" onclick="exportReunionEntrega()">📊 Exportar Excel</button></div>
      <div class="tbl-card" style="overflow:auto;max-height:390px"><table><thead><tr><th>Centro / semana</th><th>Trabajador</th><th>Cheque</th><th>Importe</th><th>Estado</th><th>Entrega</th><th></th></tr></thead><tbody>${filas.map(x=>{const l=x.l,q=x.q,puede=abierta&&l.activo!==false&&!l.entregado&&q.estatus==='EXPEDIDO'&&q.num_cheque&&q.consecutivo;return `<tr><td>${esc(reObraNombre(q.obra_id))}<small style="display:block;color:var(--mut)">S${esc(normSem(q.semana))} · ${esc(l.origen)}</small></td><td><b>#${q.no_trab??'—'} ${esc(q.nombre||'Cheque no disponible')}</b><small style="display:block;color:var(--mut)">${esc(q.tipo_pago||'—')} · ${esc(q.contratista||'—')}</small></td><td>${q.num_cheque?`<b>${esc(q.num_cheque)}</b><small style="display:block;color:var(--mut)">Consecutivo ${esc(q.consecutivo||'—')}</small>`:'<b style="color:var(--amber)">Sin expedir</b>'}</td><td>$${money(q.importe)}</td><td>${l.activo===false?ctrlEstado('CANCELADA'):l.entregado?ctrlEstado('CERRADO'):ctrlEstado(q.estatus||'PENDIENTE')}</td><td>${l.entregado?`${reFechaHora(l.entregado_en)}<small style="display:block;color:var(--mut)">${esc(l.entregado_por_email||'—')}</small>`:l.activo===false?`Liberado ${reFechaHora(l.liberado_en)}`:'—'}</td><td style="white-space:nowrap">${abierta&&l.activo!==false&&!l.entregado&&q.estatus==='PENDIENTE'?`<button class="btn" style="padding:3px 8px" onclick="openExpedirChequeReunion('${r.id}','${q.id}')">✎ Expedir</button>`:''}${puede?`<button class="btn dark" style="padding:3px 8px" onclick="marcarChequeEntregado('${r.id}','${q.id}')">✔ Entregar</button>`:''}${abierta&&l.activo!==false&&!l.entregado&&l.origen==='MANUAL'?`<button class="btn danger" style="padding:3px 8px" onclick="quitarChequeReunion('${r.id}','${q.id}')">Quitar</button>`:''}</td></tr>`;}).join('')}</tbody></table></div>
      ${abierta&&pendientes?'<p style="font-size:11.5px;color:var(--amber);margin-top:9px">Los cheques sin expedir deben recibir número y consecutivo antes de marcarse entregados.</p>':''}</div>
    <div class="m-foot"><button class="btn" onclick="openReunionesEntrega()">← Reuniones</button>${abierta&&entregados===0?`<button class="btn danger" onclick="cancelarReunionEntrega('${r.id}')">Cancelar reunión</button>`:''}${abierta&&filas.length&&entregados===filas.length?`<button class="btn dark" onclick="cerrarReunionEntrega('${r.id}')">Cerrar reunión</button>`:''}<button class="btn" onclick="closeModal()">Cerrar ventana</button></div>`,'xl');
}
async function openAgregarChequeReunion(id){
  const obraIds=obrasEmpresa().map(o=>o.id),st=window._REUNION_ENTREGA;if(!st||st.reunion.id!==id)return;
  const [qr,resr]=await Promise.all([fetchAllRows(()=>sb.from('cheques').select('*').in('obra_id',obraIds).in('estatus',['PENDIENTE','EXPEDIDO']).or('eliminado.eq.false,eliminado.is.null'),'id'),fetchAllRows(()=>sb.from('reunion_cheques_entrega').select('id,cheque_id').eq('entregado',false).eq('activo',true),'id')]);
  const error=qr.error||resr.error;if(error){toast(reError(error),'err');return;}const usados=new Set((resr.data||[]).map(x=>x.cheque_id));
  const lista=(qr.data||[]).filter(q=>!usados.has(q.id)).sort((a,b)=>reObraNombre(a.obra_id).localeCompare(reObraNombre(b.obra_id),'es')||Number(normSem(b.semana))-Number(normSem(a.semana)));window._RE_AGREGAR=lista;
  modal2(`<div class="m-head"><h2>＋ Añadir cheques a la reunión</h2><button class="x" onclick="closeModal2()">×</button></div><div class="m-body"><input id="re-q" placeholder="Buscar trabajador, número, centro o semana" oninput="reFiltrarAgregar()"><div id="re-ag-list" style="max-height:350px;overflow:auto;margin-top:10px"></div></div><div class="m-foot"><button class="btn" onclick="closeModal2()">Cancelar</button><button class="btn dark" id="re-ag-btn" onclick="agregarChequesReunion('${id}')">Añadir seleccionados</button></div>`,'md');reFiltrarAgregar();
}
function reFiltrarAgregar(){
  const out=$('re-ag-list');if(!out)return;const s=String(($('re-q')||{}).value||'').trim().toUpperCase(),l=(window._RE_AGREGAR||[]).filter(q=>!s||[q.nombre,q.no_trab,q.num_cheque,q.semana,reObraNombre(q.obra_id)].join(' ').toUpperCase().includes(s));
  out.innerHTML=l.length?l.map(q=>`<label style="display:flex;gap:9px;align-items:center;border-bottom:1px solid var(--border);padding:8px"><input class="re-ag-check" type="checkbox" value="${q.id}"><span style="flex:1"><b>#${q.no_trab??'—'} ${esc(q.nombre)}</b><small style="display:block;color:var(--mut)">${esc(reObraNombre(q.obra_id))} · S${esc(normSem(q.semana))} · ${esc(q.estatus)} ${q.num_cheque?'#'+esc(q.num_cheque):''} · $${money(q.importe)}</small></span></label>`).join(''):'<div class="empty">No hay cheques disponibles.</div>';
}
async function agregarChequesReunion(id){
  const ids=[...document.querySelectorAll('.re-ag-check:checked')].map(x=>x.value);if(!ids.length){toast('Selecciona al menos un cheque.','err');return;}$('re-ag-btn').innerHTML='<span class="spin"></span> Añadiendo...';markWrite();let ok=0,errores=[];
  for(const cid of ids){const {error}=await sb.rpc('reunion_agregar_cheque',{p_reunion:id,p_cheque:cid});error?errores.push(reError(error)):ok++;}
  closeModal2();await ctrlAuditar('REUNION_CHEQUES','AGREGAR_MANUAL',{cheques:ids,agregados:ok},'reunion_entrega',id);toast(errores.length?`Añadidos ${ok}; ${errores.length} no pudieron agregarse.`:`${ok} cheque(s) añadidos.`,errores.length?'err':'ok');await openReunionEntrega(id);
}
async function quitarChequeReunion(id,cid){
  if(!confirm('¿Quitar este cheque añadido manualmente de la reunión? El cheque no se elimina.'))return;markWrite();const {error}=await sb.rpc('reunion_quitar_cheque',{p_reunion:id,p_cheque:cid});if(error){toast(reError(error),'err');return;}await ctrlAuditar('REUNION_CHEQUES','QUITAR_MANUAL',{cheque_id:cid},'reunion_entrega',id);toast('Cheque quitado de la reunión.','ok');await openReunionEntrega(id);
}
function openExpedirChequeReunion(id,cid){
  const st=window._REUNION_ENTREGA,q=st&&st.cheques.find(x=>x.id===cid);if(!q)return;
  modal2(`<div class="m-head"><h2>✎ Expedir cheque</h2><button class="x" onclick="closeModal2()">×</button></div><div class="m-body"><p style="font-size:12.5px;color:var(--mut)"><b>${esc(q.nombre)}</b> · S${esc(normSem(q.semana))} · $${money(q.importe)}</p><div class="grid" style="grid-template-columns:1fr 1fr;margin-top:12px"><div><label>Número de cheque *</label><input id="re-num" value="${esc(q.num_cheque||'')}"></div><div><label>Número consecutivo *</label><input id="re-con" value="${esc(q.consecutivo||'')}"></div></div></div><div class="m-foot"><button class="btn" onclick="closeModal2()">Cancelar</button><button class="btn dark" id="re-exp-btn" onclick="expedirChequeReunion('${id}','${cid}')">Guardar como expedido</button></div>`,'sm');
}
async function expedirChequeReunion(id,cid){
  const num=$('re-num').value.trim(),con=$('re-con').value.trim(),st=window._REUNION_ENTREGA,q=st&&st.cheques.find(x=>x.id===cid);if(!q)return;if(!num||!con){toast('Captura el número de cheque y el consecutivo.','err');return;}$('re-exp-btn').innerHTML='<span class="spin"></span> Guardando...';markWrite();
  const respaldo=await chqResolverNeto(q);
  if(respaldo.error||Number(q.importe)!==respaldo.neto){$('re-exp-btn').textContent='Guardar como expedido';toast(respaldo.error||`El cheque es $${money(q.importe)} y el respaldo ${respaldo.origen} es $${money(respaldo.neto)}. Corrige el cheque antes de expedirlo.`,'err');return;}
  const [dn,dc]=await Promise.all([
    sb.from('cheques').select('id,nombre').eq('obra_id',q.obra_id).eq('num_cheque',num).neq('id',cid).neq('estatus','CANCELADO').or('eliminado.eq.false,eliminado.is.null').limit(1),
    sb.from('cheques').select('id,nombre').eq('obra_id',q.obra_id).eq('consecutivo',con).neq('id',cid).neq('estatus','CANCELADO').or('eliminado.eq.false,eliminado.is.null').limit(1)
  ]);
  if(dn.error||dc.error){$('re-exp-btn').textContent='Guardar como expedido';toast('No se pudo validar el cheque: '+(dn.error||dc.error).message,'err');return;}
  if((dn.data||[]).length||(dc.data||[]).length){$('re-exp-btn').textContent='Guardar como expedido';const d=((dn.data||[])[0]||(dc.data||[])[0]);toast(`Ese número de cheque o consecutivo ya está asignado a ${d.nombre}.`,'err');return;}
  const {error}=await sb.from('cheques').update({num_cheque:num,consecutivo:con,estatus:'EXPEDIDO',actualizado_por:USER.email}).eq('id',cid).eq('obra_id',q.obra_id);if(error){$('re-exp-btn').textContent='Guardar como expedido';toast('No se pudo expedir: '+error.message,'err');return;}closeModal2();await ctrlAuditar('REUNION_CHEQUES','EXPEDIR',{cheque_id:cid,num_cheque:num,consecutivo:con},'reunion_entrega',id);toast('Cheque expedido; ya cuenta como pago cubierto.','ok');await openReunionEntrega(id);
}
async function marcarChequeEntregado(id,cid){
  const st=window._REUNION_ENTREGA,q=st&&st.cheques.find(x=>x.id===cid);if(!q)return;if(!confirm(`¿Confirmar que se entregó físicamente el cheque ${q.num_cheque} a ${q.nombre}?`))return;markWrite();const {error}=await sb.rpc('reunion_marcar_entregado',{p_reunion:id,p_cheque:cid});if(error){toast(reError(error),'err');return;}await ctrlAuditar('REUNION_CHEQUES','ENTREGAR',{cheque_id:cid,num_cheque:q.num_cheque},'reunion_entrega',id);toast('Entrega confirmada y registrada.','ok');await openReunionEntrega(id);
}
async function cerrarReunionEntrega(id){
  if(!confirm('¿Cerrar la reunión? Después no se podrán añadir ni modificar entregas.'))return;markWrite();const {error}=await sb.rpc('reunion_cerrar_entrega',{p_reunion:id});if(error){toast(reError(error),'err');return;}await ctrlAuditar('REUNION_CHEQUES','CERRAR',{},'reunion_entrega',id);toast('Reunión cerrada: todos los cheques fueron entregados.','ok');await openReunionEntrega(id);
}
async function cancelarReunionEntrega(id){
  if(!confirm('¿Cancelar esta reunión? Los cheques se conservan y podrán incluirse en otra reunión.'))return;markWrite();const {error}=await sb.rpc('reunion_cancelar_entrega',{p_reunion:id});if(error){toast(reError(error),'err');return;}await ctrlAuditar('REUNION_CHEQUES','CANCELAR',{},'reunion_entrega',id);toast('Reunión cancelada; los cheques quedaron disponibles.','ok');await openReunionEntrega(id);
}
async function exportReunionEntrega(){
  const st=window._REUNION_ENTREGA;if(!st)return;
  const r=st.reunion,qm=new Map(st.cheques.map(q=>[q.id,q])),empresa=EMPRESAS[r.empresa_codigo]||{};
  const rows=[],styles=[],hs=[];rows.push(['ACTA DE ENTREGA DE CHEQUES','','','','','','','','','','','']);styles.push(ST.title);hs.push({hpt:26});rows.push([`${empresa.nombre||r.empresa_codigo} · ${reFechaHora(r.fecha_hora)} · ${r.lugar||'Lugar no capturado'} · Responsable: ${r.responsable}`,'','','','','','','','','','','']);styles.push(ST.sub);hs.push({hpt:22});rows.push(['CENTRO','SEMANA','NO. TRAB.','TRABAJADOR','CONTRATISTA','TIPO','NÚMERO CHEQUE','CONSECUTIVO','IMPORTE','ORIGEN','ESTADO ENTREGA','ENTREGADO POR']);styles.push(ST.head);hs.push({hpt:25});
  st.lineas.forEach(l=>{const q=qm.get(l.cheque_id)||{};rows.push([reObraNombre(q.obra_id),'S'+normSem(q.semana),q.no_trab??'',q.nombre||'',q.contratista||'',q.tipo_pago||'',q.num_cheque||'',q.consecutivo||'',Number(q.importe)||0,l.origen,l.activo===false?'LIBERADO POR CANCELACIÓN':l.entregado?'ENTREGADO '+reFechaHora(l.entregado_en):q.estatus||'PENDIENTE',l.entregado_por_email||'']);styles.push([ST.cell,ST.cellC,ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.money,ST.cellC,ST.cellC,ST.cell]);hs.push(null);});
  const total=st.lineas.reduce((s,l)=>s+(Number((qm.get(l.cheque_id)||{}).importe)||0),0);rows.push(['','','','','','','','TOTAL',total,'','','']);styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total,ST.total,ST.total]);hs.push({hpt:21});
  const ws=buildSheet(rows,styles,[24,9,10,34,20,12,18,14,13,10,22,25],[{s:{r:0,c:0},e:{r:0,c:11}},{s:{r:1,c:0},e:{r:1,c:11}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:7}}],hs);ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:2,c:0},e:{r:Math.max(2,rows.length-2),c:11}})};const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'ENTREGA CHEQUES');wb.__empresaPorHoja={'ENTREGA CHEQUES':r.empresa_codigo};wb.__auditObraIds=[...new Set(st.cheques.map(q=>q.obra_id).filter(Boolean))];await dl(wb,`ENTREGA_CHEQUES_${r.empresa_codigo}_${String(r.fecha_hora).slice(0,10)}.xlsx`);toast('Acta de entrega exportada con razón social y logotipo.','ok');
}
