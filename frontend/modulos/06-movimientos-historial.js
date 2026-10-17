/* ---------- baja / reactivar (con cheque de finiquito) ---------- */
function doReactivar(id){
  if(!puedeEditarTrabajador()){toast('Tu usuario sólo puede consultar.','err');return;}
  const w=WORKERS.find(x=>x.id===id);
  if(!w||w.estatus!=='BAJA'){toast('Actualiza la ficha: el trabajador ya no está en baja.','err');return;}
  window._REINGRESO={id:w.id,obra_id:w.obra_id,updated_at:w.updated_at,baja:w.fecha_baja,alta:w.fecha_alta};
  modal(`<div class="m-head"><h2>Reingreso · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body"><label>Fecha efectiva de reingreso</label><input id="reingreso-fecha" type="date" required>
      <p class="fhint">Selecciona el día en que realmente reingresa, incluso si es una fecha futura. No se usará automáticamente la fecha de hoy. Se conservan el alta original, la baja anterior y sus comprobantes.</p></div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn dark" id="reingreso-guardar" onclick="saveReingreso()">Confirmar reingreso</button></div>`);
}
async function saveReingreso(){
  if(!puedeEditarTrabajador()){toast('Tu usuario sólo puede consultar.','err');return;}
  const r=window._REINGRESO,btn=$('reingreso-guardar'),fecha=$('reingreso-fecha')?.value||'';
  if(!r||!btn||btn.disabled)return;
  const d=new Date(fecha+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==fecha
    ||(r.baja&&fecha<=r.baja)||(r.alta&&fecha<r.alta)){
    toast('Selecciona una fecha válida, posterior a la última baja.','err');return;
  }
  if(!r.updated_at){toast('Actualiza la ficha antes de registrar el reingreso.','err');return;}
  if(!confirm('¿Confirmar el reingreso efectivo el '+fmtD(fecha)+'? Se conservarán el alta y la baja anteriores.'))return;
  btn.disabled=true;
  try{
    markWrite();
    const {data,error}=await sb.from('trabajadores').update({estatus:'ACTIVO',fecha_reingreso:fecha,monto_finiquito:null,actualizado_por:USER.email})
      .eq('id',r.id).eq('obra_id',r.obra_id).eq('estatus','BAJA').eq('updated_at',r.updated_at).select('id');
    if(error)throw error;
    if(!data||data.length!==1)throw Error('La ficha cambió o no tienes permiso. Actualiza antes de intentar nuevamente.');
    window._REINGRESO=null;closeModal();toast('Reingreso registrado para '+fmtD(fecha)+'.','ok');
    if(OBRA?.id===r.obra_id)await loadObraData(r.obra_id);
    refreshCounts();
  }catch(e){toast('No se pudo completar el reingreso: '+e.message,'err');}
  finally{if($('reingreso-guardar')===btn)btn.disabled=false;}
}

/* ---------- historial ---------- */
const IGNORE_H=['updated_at','created_at','actualizado_por','creado_por','id'];
async function openHistorial(trabId){
  let q=sb.from('historial').select('*').order('fecha',{ascending:false}).limit(trabId?400:1200);
  if(trabId)q=q.eq('trabajador_id',trabId);
  const {data,error}=await q;
  if(error){toast('Error al cargar historial: '+error.message,'err');return;}
  window._HIST=data;window._HISTTRAB=trabId||null;
  const usuarios=[...new Set((data||[]).map(h=>h.usuario).filter(Boolean))].sort();
  modal(`
    <div class="m-head"><h2>🕘 Historial ${trabId?'· trabajador':'· todos'}</h2>
      <select id="hist-user" onchange="renderHist()" style="width:auto;max-width:240px;margin-left:10px">
        <option value="">Usuario: todos</option>${usuarios.map(u=>`<option>${esc(u)}</option>`).join('')}
      </select>
      <label style="font-size:12px;margin-left:10px;white-space:nowrap"><input type="checkbox" id="hist-solo-cta" onchange="renderHist()" style="width:auto"> 💳 Solo cambios de cuenta/CLABE</label>
      <button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body" id="hist-body"></div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`);
  renderHist();
}
async function openBitacoraNomina(){
  if(!OBRA)return;
  const {data,error}=await sb.from('auditoria_calculos_nomina').select('*')
    .eq('obra_id',OBRA.id).order('created_at',{ascending:false}).limit(500);
  if(error){toast('No se pudo abrir la bitácora: '+error.message,'err');return;}
  window._AUDNOM=data||[];
  const tipos=[...new Set(window._AUDNOM.map(x=>x.tipo_calculo))].sort();
  modal(`
    <div class="m-head"><h2>🛡️ Bitácora inmutable · ${esc(OBRA.nombre)}</h2>
      <select id="audnom-tipo" onchange="renderBitacoraNomina()" style="width:auto;max-width:250px;margin-left:10px">
        <option value="">Todos los eventos</option>${tipos.map(t=>`<option>${esc(t)}</option>`).join('')}
      </select>
      <button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px">Registro sellado de cálculos, finiquitos y archivos Excel. No puede editarse ni borrarse desde la plataforma.</p>
      <div id="audnom-body"></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button><button class="btn dark" onclick="exportBitacoraNomina()">⬇ Exportar bitácora</button></div>`,'xl');
  renderBitacoraNomina();
}
function renderBitacoraNomina(){
  const tipo=$('audnom-tipo')?$('audnom-tipo').value:'';
  const data=(window._AUDNOM||[]).filter(x=>!tipo||x.tipo_calculo===tipo);
  $('audnom-body').innerHTML=data.length?`<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Trabajador</th><th>Modelo</th><th>Aplicado</th><th>Ajuste NOI</th><th>Usuario</th><th>Huella</th></tr></thead><tbody>${data.map(x=>`<tr>
    <td>${new Date(x.created_at).toLocaleString('es-MX')}</td><td><span class="badge">${esc(x.tipo_calculo)}</span><br><small>${esc(x.periodo||'')}</small></td>
    <td>${x.trabajador_numero??''} ${esc(x.trabajador_nombre||'')}</td><td>${x.monto_modelo==null?'—':'$'+money(x.monto_modelo)}</td>
    <td>${x.monto_aplicado==null?'—':'$'+money(x.monto_aplicado)}</td><td>${x.ajuste_noi==null?'—':'$'+money(x.ajuste_noi)}</td>
    <td>${esc(x.actor_email||'')}</td><td><code title="${esc(x.huella_sha256)}">${esc(String(x.huella_sha256||'').slice(0,12))}…</code></td>
  </tr>`).join('')}</tbody></table></div>`:'<div class="empty">Todavía no hay eventos con este filtro.</div>';
}
async function exportBitacoraNomina(){
  const data=window._AUDNOM||[];if(!data.length){toast('No hay eventos para exportar.','err');return;}
  const rows=[['FECHA','EVENTO','PERIODO','NO. TRAB.','TRABAJADOR','MODELO','APLICADO','AJUSTE NOI','USUARIO','VERSIÓN','HUELLA SHA-256']];
  data.forEach(x=>rows.push([new Date(x.created_at).toLocaleString('es-MX'),x.tipo_calculo,x.periodo,x.trabajador_numero??'',x.trabajador_nombre,
    x.monto_modelo??'',x.monto_aplicado??'',x.ajuste_noi??'',x.actor_email,x.formula_version,x.huella_sha256]));
  const styles=[ST.head,...data.map(()=>[ST.cell,ST.cell,ST.cell,ST.cellC,ST.cell,ST.money,ST.money,ST.money,ST.cell,ST.cell,ST.cell])];
  const ws=buildSheet(rows,styles,[20,22,22,11,32,14,14,14,28,28,66]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'BITACORA');
  wb.__auditObraIds=[OBRA.id];await dl(wb,`BITACORA_NOMINA_${OBRA.nombre.replace(/[^A-ZÑ0-9]+/gi,'_')}_${today()}.xlsx`);
}
const CAMPOS_BANCO=['cuenta','clabe','banco','num_tarjeta'];
function histCambiaBanco(h){
  if(!h.datos_antes||!h.datos_despues)return false;
  return CAMPOS_BANCO.some(k=>JSON.stringify(h.datos_antes[k]??'')!==JSON.stringify(h.datos_despues[k]??''));
}
function renderHist(){
  const fu=$('hist-user')?$('hist-user').value:'';
  const soloCta=$('hist-solo-cta')&&$('hist-solo-cta').checked;
  const data=(window._HIST||[]).filter(h=>(!fu||h.usuario===fu)&&(!soloCta||histCambiaBanco(h)));
  const items=data.map(h=>{
    let diff='';
    if(!h.accion.includes('ALTA')&&h.datos_antes&&h.datos_despues){
      const chs=[];
      for(const k of Object.keys(h.datos_despues)){
        if(IGNORE_H.includes(k))continue;
        const a=JSON.stringify(h.datos_antes[k]??''),b=JSON.stringify(h.datos_despues[k]??'');
        if(a!==b){
          const esBanco=CAMPOS_BANCO.includes(k);
          chs.push(`<div class="fld-ch"${esBanco?' style="background:#fff6d5;border-radius:5px;padding:2px 6px"':''}><b>${esBanco?'💳 ':''}${k}:</b> <span class="old">${esc(String(h.datos_antes[k]??'—')).slice(0,80)}</span><span class="new">${esc(String(h.datos_despues[k]??'—')).slice(0,80)}</span></div>`);
        }
      }
      diff=chs.length?`<div class="hist-diff">${chs.join('')}</div>`:'';
    }
    const esCheque=h.accion.startsWith('CHEQUE');
    const canRestore=h.datos_antes&&!h.accion.includes('ALTA')&&!h.accion.startsWith('DESCUENTO')&&!h.accion.startsWith('DOCUMENTO')&&!h.accion.startsWith('VACACION')&&!h.accion.startsWith('ACTA');
    return `<div class="hist-item">
      <div class="hist-top">
        <span class="badge acc-${h.accion}">${h.accion}</span>
        <span class="who">${esc(h.trabajador_nombre)}</span>
        <span class="when">${new Date(h.fecha).toLocaleString('es-MX')} · por ${esc(h.usuario||'sistema')}</span>
        ${canRestore?`<button class="btn" style="margin-left:auto;padding:4px 10px;font-size:12px" onclick="restoreVersion(${h.id},${esCheque})">↩ Restaurar</button>`:''}
      </div>${diff}</div>`;
  }).join('');
  $('hist-body').innerHTML=items||'<div class="empty">Sin movimientos con ese filtro.</div>';
}
async function restoreVersion(histId,esCheque){
  const h=window._HIST.find(x=>x.id===histId); if(!h||!h.datos_antes)return;
  if(!confirm(`¿Restaurar "${h.trabajador_nombre}" a como estaba antes de este cambio (${new Date(h.fecha).toLocaleString('es-MX')})?`))return;
  const prev={...h.datos_antes};
  IGNORE_H.forEach(k=>delete prev[k]);
  markWrite();
  const tabla=esCheque?'cheques':'trabajadores';
  const targetId=esCheque?h.datos_antes.id:h.trabajador_id;
  const {error}=await sb.from(tabla).update(prev).eq('id',targetId);
  if(error){toast('Error al restaurar: '+error.message,'err');return;}
  closeModal();toast('Información restaurada. La restauración también quedó en el historial.','ok');
  await loadObraData(OBRA.id);refreshCounts();
}

/* ---------- CONTROL DE CAMBIOS DE SALARIO (2026-08-01) ----------
   Usa el historial (datos_antes/datos_despues) para ver los cambios de SD, SDI
   y salario semanal: por trabajador (desde su ficha) y global (panel + Excel),
   para controlar las modificaciones que se van haciendo gradualmente. */
const CAMPOS_SAL=['sd','sdi','sal_semanal'];
function histCambiaSalario(h){
  if(h.accion!=='MODIFICACION'||!h.datos_antes||!h.datos_despues)return false;
  return CAMPOS_SAL.some(k=>JSON.stringify(h.datos_antes[k]??'')!==JSON.stringify(h.datos_despues[k]??''));
}
async function fetchCambiosSalario(trabId){
  const make=()=>{
    let q=sb.from('historial').select('*').eq('accion','MODIFICACION').order('fecha',{ascending:false});
    return trabId?q.eq('trabajador_id',trabId):q.in('obra_id',OBRAS.filter(o=>empresaDeObra(o)===EMPRESA_ACTIVA).map(o=>o.id));
  };
  const empresa=EMPRESA_ACTIVA;
  const {data,error}=await fetchAllRows(make);
  if(empresa!==EMPRESA_ACTIVA){toast('Cambió la empresa; vuelve a abrir el historial.','err');return null;}
  if(error){toast('Error al leer historial: '+error.message,'err');return null;}
  return (data||[]).filter(histCambiaSalario);
}
const _n=v=>{const x=Number(v);return isNaN(x)?null:x;};
const _sal=(a,b,k)=>{const x=_n(a&&a[k]),y=_n(b&&b[k]);return {x,y,chg:JSON.stringify(a?.[k]??'')!==JSON.stringify(b?.[k]??'')};};
function celdaCambio(c){
  if(c.x===null&&c.y===null)return '—';
  if(!c.chg)return '$'+money(c.y??c.x);
  return `<span class="old">$${money(c.x??0)}</span><span class="new">$${money(c.y??0)}</span>`;
}
async function openHistSalario(id){
  const w=WORKERS.find(x=>x.id===id);
  modal(`<div class="m-head"><h2>📈 Historial de salario · ${esc(w?fullName(w):'')}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body" id="hs-body"><div class="empty">Cargando...</div></div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'md');
  const rows=await fetchCambiosSalario(id); if(rows===null)return;
  const actual=w?`<div class="kv"><b>AHORA</b><span>SD $${money(w.sd)} · SDI $${money(w.sdi)} · semanal $${money(w.sal_semanal)}</span></div>`:'';
  if(!rows.length){$('hs-body').innerHTML=actual+'<div class="empty">Sin cambios de salario registrados: su sueldo no se ha modificado desde que se capturó.</div>';return;}
  const body=rows.map(h=>{
    const a=h.datos_antes,b=h.datos_despues;
    const sd=_sal(a,b,'sd'),sdi=_sal(a,b,'sdi'),sem=_sal(a,b,'sal_semanal');
    return `<tr>
      <td style="white-space:nowrap">${new Date(h.fecha).toLocaleDateString('es-MX')}</td>
      <td style="text-align:right">${celdaCambio(sd)}</td>
      <td style="text-align:right">${celdaCambio(sdi)}</td>
      <td style="text-align:right">${celdaCambio(sem)}</td>
      <td style="font-size:11px">${esc(b.movimiento_imss||'')}</td>
      <td style="font-size:11px;color:var(--mut)">${esc(h.usuario||'sistema')}</td></tr>`;
  }).join('');
  $('hs-body').innerHTML=actual+`
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px">
      <thead><tr style="text-align:left"><th>Fecha</th><th style="text-align:right">SD</th><th style="text-align:right">SDI</th><th style="text-align:right">Semanal</th><th>Mov. IMSS</th><th>Quién</th></tr></thead>
      <tbody>${body}</tbody></table>
    <p style="font-size:11px;color:var(--mut);margin-top:8px">Cada renglón es un cambio: <span class="old">valor anterior</span> → <span class="new">valor nuevo</span>. Fuente: historial automático de la base.</p>`;
}
async function openControlSalarios(){
  toast('Leyendo cambios de salario...');
  const rows=await fetchCambiosSalario(null); if(rows===null)return;
  const {data:allW,error}=await leerPorEmpresa('trabajadores','*',q=>q.eq('eliminado',false));
  if(error){toast('Error al leer el padrón: '+error.message,'err');return;}
  const wById={}; (allW||[]).forEach(w=>wById[w.id]=w);
  const obraN=id=>{const o=OBRAS.find(x=>x.id===id);return o?o.nombre:'';};
  // el más reciente por trabajador para el resumen
  const ultimo={}; rows.forEach(h=>{if(!ultimo[h.trabajador_id])ultimo[h.trabajador_id]=h;});
  window._CTRLSAL={rows,wById,obraN};
  const filas=Object.values(ultimo).map(h=>{
    const w=wById[h.trabajador_id]||{}, b=h.datos_despues,a=h.datos_antes;
    const sd=_sal(a,b,'sd'),sdi=_sal(a,b,'sdi'),sem=_sal(a,b,'sal_semanal');
    const conAcuse=String(w.movimiento_imss||'').includes('MODIFICACION')&&String(w.movimiento_imss||'').includes('ACUSE');
    return `<div class="imp-row" style="grid-template-columns:1.6fr 1fr 1fr 1fr 1.1fr">
      <span><b>${esc(h.trabajador_nombre)}</b><br><span style="color:var(--mut);font-size:11px">${esc(obraN(w.obra_id))} · ${new Date(h.fecha).toLocaleDateString('es-MX')}</span></span>
      <span style="text-align:right">${celdaCambio(sd)}</span>
      <span style="text-align:right">${celdaCambio(sdi)}</span>
      <span style="text-align:right">${celdaCambio(sem)}</span>
      <span style="font-size:11px">${conAcuse?'<b style="color:var(--green)">✔ acuse IMSS</b>':'<b style="color:var(--amber)">⚠ falta acuse mod.</b>'}<br><span style="color:var(--mut)">${esc(w.movimiento_imss||'')}</span></span>
    </div>`;
  });
  const faltan=Object.values(ultimo).filter(h=>{const w=wById[h.trabajador_id]||{};return !(String(w.movimiento_imss||'').includes('MODIFICACION')&&String(w.movimiento_imss||'').includes('ACUSE'));}).length;
  modal(`<div class="m-head"><h2>📈 Control de cambios de salario</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <span class="imp-tag imp-COINCIDE">${Object.keys(ultimo).length} trabajador(es) con cambio</span>
        <span class="imp-tag imp-CONFLICTO">${faltan} sin acuse de modificación IMSS</span>
      </div>
      <div class="imp-row head" style="grid-template-columns:1.6fr 1fr 1fr 1fr 1.1fr"><span>Trabajador · obra · último cambio</span><span style="text-align:right">SD</span><span style="text-align:right">SDI</span><span style="text-align:right">Semanal</span><span>IMSS</span></div>
      ${filas.join('')||'<div class="empty">Aún no hay cambios de salario registrados.</div>'}
      <p style="font-size:11px;color:var(--mut);margin-top:8px">Muestra el <b>último</b> cambio de cada trabajador. El Excel trae <b>todos</b> los cambios con fecha y quién. "⚠ falta acuse" = su movimiento IMSS aún no está como MODIFICACIÓN CON ACUSE (archívalo en 📥 Importar → Acuses IMSS → MODIFICACIÓN DE SALARIO).</p>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark" onclick="exportControlSalarios()">⬇ Exportar Excel (todos los cambios)</button>
    </div>`,'lg');
}
function exportControlSalarios(){
  const {rows,wById,obraN}=window._CTRLSAL||{}; if(!rows||!rows.length){toast('No hay cambios que exportar.','err');return;}
  const R=[],S=[];
  R.push(['CONTROL DE CAMBIOS DE SALARIO — '+new Date().toLocaleDateString('es-MX')]);S.push(ST.title);
  R.push(['FECHA','TRABAJADOR','OBRA','SD ANTES','SD DESPUÉS','SDI ANTES','SDI DESPUÉS','SEMANAL ANTES','SEMANAL DESPUÉS','MOV. IMSS ACTUAL','¿ACUSE MOD.?','QUIÉN']);S.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cell,ST.money,ST.money,ST.money,ST.money,ST.money,ST.money,ST.cellC,ST.cellC,ST.cell];
  rows.forEach(h=>{const w=wById[h.trabajador_id]||{},a=h.datos_antes,b=h.datos_despues;
    const conAcuse=String(w.movimiento_imss||'').includes('MODIFICACION')&&String(w.movimiento_imss||'').includes('ACUSE');
    R.push([new Date(h.fecha).toLocaleDateString('es-MX'),h.trabajador_nombre,obraN(w.obra_id),
      _n(a?.sd)??'',_n(b?.sd)??'',_n(a?.sdi)??'',_n(b?.sdi)??'',_n(a?.sal_semanal)??'',_n(b?.sal_semanal)??'',
      w.movimiento_imss||'',conAcuse?'SÍ':'NO',h.usuario||'sistema']);
    S.push(rs);});
  const ws=buildSheet(R,S,[12,30,22,11,11,11,11,12,12,22,11,24],[{s:{r:0,c:0},e:{r:0,c:11}}],[{hpt:24},{hpt:26}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1+rows.length,c:11}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'CAMBIOS DE SALARIO');
  dl(wb,`CONTROL_CAMBIOS_SALARIO_${today()}.xlsx`);
  toast('Excel de control de salarios generado.','ok');
}

