/* ---------- MOVIMIENTOS POR SEMANA (altas, bajas y pendientes de la semana) ---------- */
function semRange(n){
  const a=new Date(semBase()+'T12:00');a.setDate(a.getDate()+(n-1)*7);
  const b=new Date(a);b.setDate(a.getDate()+6);
  return [a.toISOString().slice(0,10),b.toISOString().slice(0,10)];
}
/* v19: al cambiar el No. de semana en cualquier selector, autollena Del/Al con el
   periodo real de esa semana (según la fecha de inicio de la obra actual) y
   opcionalmente refresca la vista previa asociada. */
function semSincroniza(semId,d1Id,d2Id,cb){
  const n=parseInt($(semId).value)||isoWeek();
  const [d1,d2]=semRange(n);
  if($(d1Id))$(d1Id).value=d1;
  if($(d2Id))$(d2Id).value=d2;
  if(cb)cb();
}
function compararNumeroTrabajador(a,b){
  const numero=w=>{const s=String(w?.no_trab??'').trim();return /^\d+$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s):Infinity;};
  const na=numero(a),nb=numero(b);
  if(na!==nb)return na<nb?-1:1;
  return fullName(a).localeCompare(fullName(b),'es',{numeric:true,sensitivity:'base'})||String(a?.id||'').localeCompare(String(b?.id||''));
}
/* Incidencias ya aplicadas, no créditos recurrentes. La semana es la del
   registro, no el estatus actual del trabajador ni la fecha de captura. */
function incidenciasMovimientosSemana(n,contratista=''){
  const mapa=new Map(WORKERS.filter(w=>w.obra_id===OBRA.id&&!w.eliminado).map(w=>[w.id,w]));
  return DESC.filter(d=>d.activo===true&&d.recurrente===false&&d.semana==='S'+n&&
    ['FALTA','INCIDENCIA'].includes(d.tipo)&&
    (d.obra_id===OBRA.id||(!d.obra_id&&mapa.has(d.trabajador_id))))
    .map(d=>({d,w:mapa.get(d.trabajador_id)}))
    .filter(({w})=>!contratista||w?.contratista===contratista)
    .sort((a,b)=>compararNumeroTrabajador(a.w||{},b.w||{})||
      String(a.d.created_at||'').localeCompare(String(b.d.created_at||''))||String(a.d.id).localeCompare(String(b.d.id)));
}
function movimientosSemana(n,contratista=''){
  n=Math.max(1,parseInt(n)||isoWeek());
  const [d1,d2]=semRange(n);
  const enR=f=>f&&f>=d1&&f<=d2;
  const trabajadores=WORKERS.filter(w=>w.obra_id===OBRA.id&&(!contratista||w.contratista===contratista));
  /* REINGRESOS: quien vuelve a entrar tras una baja. Su fecha_alta es la ORIGINAL
     (de hace meses), así que filtrando solo por fecha_alta no aparecía en ninguna
     parte. Va en su propio apartado y NUNCA como alta nueva. */
  const reingresos=trabajadores.filter(w=>enR(w.fecha_reingreso)).sort(compararNumeroTrabajador);
  const reIds=new Set(reingresos.map(w=>w.id));
  const ingresos=trabajadores.filter(w=>enR(w.fecha_alta)&&!reIds.has(w.id));
  const altas=ingresos.filter(w=>w.estatus!=='PENDIENTE').sort(compararNumeroTrabajador); // ACTIVOS y bajas de la misma semana cuentan como alta
  const pend=ingresos.filter(w=>w.estatus==='PENDIENTE').sort(compararNumeroTrabajador);
  const bajas=trabajadores.filter(w=>enR(w.fecha_baja)&&!reIds.has(w.id)).sort(compararNumeroTrabajador);
  return {n,d1,d2,altas,reingresos,pend,bajas,incidencias:incidenciasMovimientosSemana(n,contratista)};
}
function openMovimientos(n,contratista=''){
  const disponibles=[...new Set(WORKERS.filter(w=>w.obra_id===OBRA.id&&!w.eliminado).map(w=>w.contratista).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  if(contratista&&!disponibles.includes(contratista))contratista='';
  const {n:sem,d1,d2,altas,reingresos,pend,bajas,incidencias}=movimientosSemana(n,contratista);
  const personasInc=new Set(incidencias.map(({d})=>d.trabajador_id)).size;
  const entradas=altas.length+reingresos.length;
  const porDia={};bajas.forEach(w=>{const k=fmtD(w.fecha_baja);porDia[k]=(porDia[k]||0)+1;});
  const item=(w,extra)=>`<div class="kv"><b>#${w.no_trab??'—'}</b><span>${esc(fullName(w))} · ${esc(w.contratista)}${extra?` · <b>${extra}</b>`:''}</span></div>`;
  window._MOVSEM=sem;window._MOVCONTR=contratista;
  modal(`
    <div class="m-head"><h2>📅 Movimientos · ${esc(OBRA.nombre)}</h2>
      <div style="display:flex;align-items:center;gap:6px;margin-left:8px">
        <button class="btn" style="padding:4px 10px" onclick="openMovimientos(${sem-1},window._MOVCONTR)">◀</button>
        <b style="white-space:nowrap">SEMANA ${sem}</b>
        <button class="btn" style="padding:4px 10px" onclick="openMovimientos(${sem+1},window._MOVCONTR)">▶</button>
      </div>
      <span style="color:var(--mut);font-size:12px">${fmtD(d1)} – ${fmtD(d2)}</span>
      <button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div style="min-width:min(100%,280px);flex:1 1 280px"><label for="mov-contratista">Contratista de esta obra</label>
          <select id="mov-contratista" onchange="openMovimientos(window._MOVSEM,this.value)">
            <option value="">Todos los contratistas</option>
            ${disponibles.map(c=>`<option value="${esc(c)}" ${c===contratista?'selected':''}>${esc(c)}</option>`).join('')}
          </select></div>
        <span class="fhint" style="flex:1 1 260px">${contratista?`Mostrando movimientos e incidencias de <b>${esc(contratista)}</b>.`:'Vista global de la obra; selecciona un contratista para aislar sus movimientos e incidencias.'}</span>
      </div>
      <div class="stats" style="margin-bottom:16px">
        <div class="stat g"><div class="n">+${altas.length}</div><div class="l">Altas nuevas${(function(){const m=altas.filter(x=>x.estatus==='BAJA').length;return m?` (${altas.length-m} vigentes + ${m} con baja misma sem.)`:'';})()}</div></div>
        <div class="stat b"><div class="n">+${reingresos.length}</div><div class="l">Reingresos (ya habían trabajado)</div></div>
        <div class="stat r"><div class="n">−${bajas.length}</div><div class="l">Bajas de la semana</div></div>
        <div class="stat a"><div class="n">${pend.length}</div><div class="l">Pendientes (aparte)</div></div>
        <div class="stat b"><div class="n">${entradas-bajas.length>=0?'+':''}${entradas-bajas.length}</div><div class="l">Diferencia neta (altas + reingresos − bajas)</div></div>
        <div class="stat a"><div class="n">${incidencias.length}</div><div class="l">Incidencias aplicadas · ${personasInc} trabajador(es)</div></div>
      </div>
      ${bajas.length?`<div class="sect">Bajas (${bajas.length})${Object.keys(porDia).length>1?` — ${Object.entries(porDia).map(([k,v])=>`${v} el ${k}`).join(', ')}`:''}</div>
        ${bajas.map(w=>item(w,'baja '+fmtD(w.fecha_baja)+(w.monto_finiquito?' · finiquito $'+money(w.monto_finiquito):''))).join('')}`:''}
      ${altas.length?`<div class="sect">Altas nuevas (${altas.length})</div>
        ${altas.map(w=>item(w,fmtD(w.fecha_alta)+(w.estatus==='BAJA'?' · alta y baja en la misma semana':''))).join('')}`:''}
      ${reingresos.length?`<div class="sect">Reingresos (${reingresos.length}) — ya habían trabajado antes; la antigüedad cuenta desde el reingreso</div>
        ${reingresos.map(w=>item(w,'reingresó '+fmtD(w.fecha_reingreso)+' · alta original '+fmtD(w.fecha_alta)+(w.fecha_baja?' · baja previa '+fmtD(w.fecha_baja):''))).join('')}`:''}
      ${pend.length?`<div class="sect">Pendientes (${pend.length}) — no cuentan como alta hasta activarse</div>
        ${pend.map(w=>item(w,'capturado '+fmtD(w.fecha_alta))).join('')}`:''}
      <section id="mov-incidencias" aria-label="Incidencias aplicadas de la semana">
        <div class="sect">Incidencias aplicadas (${incidencias.length}) · ${personasInc} trabajador(es)</div>
        <p class="fhint" style="margin-bottom:10px">Faltas y otras incidencias registradas en S${sem}. El importe es el descuento guardado, sin recalcularlo. No incluye créditos recurrentes ni registros cancelados.</p>
        ${incidencias.map(({d,w})=>`<article class="mov-incidencia" style="padding:12px 0;border-bottom:1px solid var(--bd)">
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><b>#${esc(w?.no_trab??'—')} · ${esc(w?fullName(w):'Trabajador no disponible; revisar referencia')}</b>
            <span class="badge ${d.tipo==='FALTA'?'a':'b'}">${d.tipo==='FALTA'?'Falta':'Incidencia'}</span>
            <span style="margin-left:auto;white-space:nowrap">Descuento: <b>$${money(Number(d.monto)||0)}</b></span></div>
          <div class="fhint" style="margin:4px 0">${esc(w?.contratista||'Contratista no disponible')} · ${esc(w?.puesto||'Puesto no disponible')}</div>
          <div style="overflow-wrap:anywhere;white-space:pre-wrap">${esc(d.motivo||'Sin detalle registrado')}</div></article>`).join('')||'<div class="fhint">Sin incidencias aplicadas para esta semana y filtro.</div>'}
      </section>
      ${!altas.length&&!reingresos.length&&!bajas.length&&!pend.length&&!incidencias.length?'<div class="empty"><div class="big">📭</div>Sin movimientos ni incidencias en esta semana.</div>':''}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark" ${entradas+bajas.length+pend.length?'':'disabled'} onclick="exportMovimientos()">⬇ Exportar Excel</button>
      <button class="btn dark" ${entradas+bajas.length+pend.length+incidencias.length?'':'disabled'} onclick="exportMovimientosPDF()">📄 Exportar PDF</button>
    </div>`);
}
function exportMovimientos(){
  const contratista=window._MOVCONTR||'';
  const {n,d1,d2,altas,reingresos,pend,bajas}=movimientosSemana(window._MOVSEM||isoWeek(),contratista);
  const rows=[],styles=[];
  rows.push([`MOVIMIENTOS DE PERSONAL — SEMANA ${n} (${rangoTexto(d1,d2)}) — ${OBRA.nombre}${contratista?' — CONTRATISTA: '+contratista:''}`]); styles.push(ST.title);
  rows.push(['MOVIMIENTO','NO. TRAB.','NOMBRE COMPLETO','CONTRATISTA','PUESTO','FECHA','ESTATUS ACTUAL','FINIQUITO']); styles.push(ST.head);
  const rA=[ST.cellC,ST.cellC,ST.cell,ST.cellC,ST.cell,ST.cellC,ST.cellC,ST.money];
  const rB=[ST.fin,ST.fin,ST.fin,ST.fin,ST.fin,ST.fin,ST.fin,ST.finMoney];
  altas.forEach(w=>{rows.push(['ALTA',w.no_trab??'',fullName(w),w.contratista,w.puesto,fmtD(w.fecha_alta),w.estatus,'']);styles.push(rA);});
  reingresos.forEach(w=>{rows.push(['REINGRESO',w.no_trab??'',fullName(w),w.contratista,w.puesto,fmtD(w.fecha_reingreso),w.estatus,'']);styles.push(rA);});
  pend.forEach(w=>{rows.push(['PENDIENTE',w.no_trab??'',fullName(w),w.contratista,w.puesto,fmtD(w.fecha_alta),w.estatus,'']);styles.push(rA);});
  bajas.forEach(w=>{rows.push(['BAJA',w.no_trab??'',fullName(w),w.contratista,w.puesto,fmtD(w.fecha_baja),w.estatus,Number(w.monto_finiquito)||'']);styles.push(rB);});
  const neto=altas.length+reingresos.length-bajas.length;
  rows.push([`TOTALES: ${altas.length} ALTAS NUEVAS · ${reingresos.length} REINGRESOS · ${bajas.length} BAJAS · ${pend.length} PENDIENTES (APARTE) · NETO ${neto>=0?'+':''}${neto}`]); styles.push(ST.total);
  const ws=buildSheet(rows,styles,[13,10,36,15,24,12,15,12],[{s:{r:0,c:0},e:{r:0,c:7}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:7}}],[{hpt:26},{hpt:24}]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,`MOVIMIENTOS S${n}`);
  dl(wb,`MOVIMIENTOS_SEMANA${n}_${OBRA.nombre.slice(0,16).replace(/\s+/g,'_')}${contratista?'_'+contratista.slice(0,24).replace(/[^A-ZÑ0-9]+/gi,'_'):''}.xlsx`);
  toast('Excel de movimientos generado.','ok');
}
function movimientosPDFHTML(mov,contratista=''){
  const {n,d1,d2,altas,reingresos,pend,bajas,incidencias=[]}=mov;
  const codigo=empresaDeObra(OBRA),empresa=CFGEMP['empresa_'+codigo]||{};
  const razon=empresa.razon||razonSocialEmpresa(codigo);
  const secciones=[['ALTAS NUEVAS',altas,'fecha_alta'],['REINGRESOS',reingresos,'fecha_reingreso'],
    ['BAJAS',bajas,'fecha_baja'],['PENDIENTES DE ALTA',pend,'fecha_alta']];
  const filas=secciones.filter(([,gente])=>gente.length).map(([titulo,gente,fecha])=>
    `<tr class="grupo"><td colspan="6">${titulo} · ${gente.length}</td></tr>`+
    gente.map(w=>`<tr><td class="numero">${esc(w.no_trab??'—')}</td><td class="nombre">${esc(fullName(w))}</td>`+
      `<td>${esc(w.puesto||'—')}</td><td>${esc(w.contratista||'—')}</td><td>${esc(cuadNombre(w)||'—')}</td><td class="fecha">${esc(fmtD(w[fecha]))}</td></tr>`).join('')).join('');
  const neto=altas.length+reingresos.length-bajas.length;
  const membrete=`<tr><td class="membrete" colspan="6"><div class="membrete-box"><img src="${logoEmpresa(codigo)}" alt="${esc(codigo)}"><div class="empresa"><b>${esc(razon)}</b><br>RFC ${esc(empresa.rfc||'—')}<br>${esc(empresa.domicilio||'')}</div></div></td></tr>`;
  const contexto=`<tr><td class="contexto" colspan="6"><b>Centro:</b> ${esc(OBRA.nombre)} &nbsp; <b>Periodo:</b> ${esc(fmtD(d1))} al ${esc(fmtD(d2))}${contratista?` &nbsp; <b>Contratista:</b> ${esc(contratista)}`:''}</td></tr>`;
  const tablaIncidencias=incidencias.length?`<section class="incidencias-seccion"><table class="incidencias-tabla">
    <colgroup><col style="width:8%"><col style="width:28%"><col style="width:14%"><col style="width:12%"><col style="width:25%"><col style="width:13%"></colgroup>
    <thead>${membrete}<tr><td class="titulo" colspan="6">INCIDENCIAS APLICADAS · SEMANA ${esc(n)}</td></tr>${contexto}
      <tr><td class="resumen" colspan="6">${incidencias.length} registro(s) · ${new Set(incidencias.map(({d})=>d.trabajador_id)).size} trabajador(es) · Descuentos registrados, sin recalcular.</td></tr>
      <tr class="columnas"><th>NO.</th><th>NOMBRE / PUESTO</th><th>CONTRATISTA</th><th>TIPO</th><th>DETALLE</th><th>DESCUENTO</th></tr></thead>
    <tbody>${incidencias.map(({d,w})=>`<tr><td class="numero">${esc(w?.no_trab??'—')}</td>
      <td><div class="nombre">${esc(w?fullName(w):'Trabajador no disponible; revisar referencia')}</div><div class="puesto">${esc(w?.puesto||'—')}</div></td>
      <td>${esc(w?.contratista||'—')}</td><td>${d.tipo==='FALTA'?'Falta':'Incidencia'}</td>
      <td class="detalle">${esc(d.motivo||'Sin detalle registrado')}</td><td class="importe">$${money(Number(d.monto)||0)}</td></tr>`).join('')}</tbody></table></section>`:'';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Movimientos semana ${n} · ${esc(OBRA.nombre)}</title>
  <style>
  @page{size:letter portrait;margin:12mm 11mm 12mm}*{box-sizing:border-box}
  body{margin:0;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:9pt}
  .accion{position:fixed;top:12px;right:12px;background:#193659;color:#fff;border:0;border-radius:5px;padding:9px 14px;font-weight:bold;cursor:pointer}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  thead{display:table-header-group;break-inside:avoid;page-break-inside:avoid}tr{break-inside:avoid;page-break-inside:avoid}
  .membrete{border-bottom:2px solid #193659;padding-bottom:4mm}
  .membrete-box{display:flex;align-items:center;gap:6mm;min-height:20mm}
  .membrete img{width:29mm;height:17mm;object-fit:contain}
  .empresa{flex:1;min-width:0;text-align:right;font-size:7.5pt;line-height:1.3;overflow-wrap:anywhere}
  .empresa b{font-size:10pt;color:#193659}
  .titulo{font-size:13pt;font-weight:bold;color:#193659;text-align:center;padding:5mm 0 2mm}
  .contexto{font-size:8.5pt;line-height:1.5;padding-bottom:3mm}
  .contexto b{color:#193659}.resumen{font-size:8pt;color:#475569;padding-bottom:3mm}
  .columnas th{background:#193659;color:#fff;text-align:left;font-size:7.5pt;padding:2.3mm 1.5mm}
  .columnas th:first-child,.columnas th:last-child{text-align:center}
  tbody td{border-bottom:1px solid #dbe3ec;padding:2.2mm 1.5mm;vertical-align:top;overflow-wrap:anywhere;line-height:1.25}
  tbody .grupo td{background:#e9eff7;color:#193659;font-weight:bold;padding:2.4mm 1.5mm;break-after:avoid;page-break-after:avoid}
  .numero,.fecha{text-align:center;white-space:nowrap}.nombre{font-weight:bold}
  .puesto{font-size:7.5pt;color:#475569;margin-top:1mm}.detalle{white-space:pre-wrap}.importe{text-align:right;white-space:nowrap}
  .incidencias-seccion{break-before:page;page-break-before:always}
  .vacio{text-align:center;color:#64748b;padding:10mm}
  @media print{.accion{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><button class="accion" onclick="window.print()">Imprimir / Guardar PDF</button>${filas||!incidencias.length?`<table class="movimientos-tabla">
  <colgroup><col style="width:8%"><col style="width:29%"><col style="width:20%"><col style="width:15%"><col style="width:18%"><col style="width:10%"></colgroup>
  <thead>${membrete}
  <tr><td class="titulo" colspan="6">MOVIMIENTOS DE PERSONAL · SEMANA ${esc(n)}</td></tr>
  ${contexto}
  <tr><td class="resumen" colspan="6">${altas.length} altas · ${reingresos.length} reingresos · ${bajas.length} bajas · ${pend.length} pendientes · Variación neta ${neto>=0?'+':''}${neto} · ${incidencias.length} incidencias</td></tr>
  <tr class="columnas"><th>NO.</th><th>NOMBRE COMPLETO</th><th>PUESTO</th><th>CONTRATISTA</th><th>CUADRILLA</th><th>FECHA</th></tr></thead>
  <tbody>${filas||'<tr><td class="vacio" colspan="6">Sin movimientos en esta semana.</td></tr>'}</tbody></table>`:''}${tablaIncidencias}${!filas&&incidencias.length?'<style>.incidencias-seccion{break-before:auto;page-break-before:auto}</style>':''}
  <script>window.onload=()=>setTimeout(()=>window.print(),450)<\/script></body></html>`;
}
function exportMovimientosPDF(){
  const contratista=window._MOVCONTR||'';
  const mov=movimientosSemana(window._MOVSEM||isoWeek(),contratista);
  if(!mov.altas.length&&!mov.reingresos.length&&!mov.bajas.length&&!mov.pend.length&&!mov.incidencias?.length){
    toast('No hay movimientos ni incidencias para exportar en esta semana.','err');return;
  }
  const win=window.open('','_blank');
  if(!win){toast('Permite ventanas emergentes para generar el PDF.','err');return;}
  win.document.write(movimientosPDFHTML(mov,contratista));win.document.close();
  toast('Reporte listo en hoja carta vertical. Elige “Guardar como PDF” en la impresión.','ok');
}
/* ---------- v36: ALTAS POR SEMANA (general, todas las semanas, por obra) ----------
   Como el de movimientos pero completo: todas las altas agrupadas por semana de
   ingreso (calculada con la fecha de inicio de cada obra, nunca negativa), con
   una sección por obra. Trae a todos los no-eliminados de todas las obras. */
async function openAltasSemana(){
  window._ALTASX=[];
  toast('Cargando trabajadores...');
  const {data:tw,error}=await leerPorEmpresa('trabajadores','*',q=>q.eq('eliminado',false));
  if(error){toast('Error: '+error.message,'err');return;}
  window._ALTASX=tw||[];
  modal(`
    <div class="m-head"><h2>📆 Altas por semana (Excel)</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px;font-size:12.5px">Exporta <b>todas las altas</b> agrupadas por <b>semana de ingreso</b> (una sección por obra). La semana se calcula con la fecha de inicio de cada obra, así que nunca sale negativa.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div><label>Obra</label>
          <select id="ax-obra">
            <option value="">Todas las obras de esta empresa</option>
            ${OBRAS.filter(o=>empresaDeObra(o)===EMPRESA_ACTIVA).map(o=>`<option value="${o.id}">${esc(o.nombre)}</option>`).join('')}
          </select></div>
        <div><label>Incluir</label>
          <select id="ax-est">
            <option value="ACT">Solo activos</option>
            <option value="TODOS">Activos, pendientes y bajas</option>
          </select></div>
      </div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="exportAltasSemana()">⬇ Generar Excel</button>
    </div>`,'md');
}
function exportAltasSemana(){
  const tw=window._ALTASX||[], oid=$('ax-obra').value, est=$('ax-est').value;
  let base=tw.filter(w=>w.fecha_alta);
  if(oid)base=base.filter(w=>w.obra_id===oid);
  if(est==='ACT')base=base.filter(w=>w.estatus==='ACTIVO');
  if(!base.length){toast('No hay altas con ese filtro.','err');return;}
  const obras=oid?OBRAS.filter(o=>o.id===oid):OBRAS.filter(o=>base.some(w=>w.obra_id===o.id));
  const rows=[],styles=[];
  rows.push([`ALTAS POR SEMANA DE INGRESO — ${oid?(OBRAS.find(o=>o.id===oid)||{}).nombre:'TODAS LAS OBRAS'} — ${new Date().toLocaleDateString('es-MX')}`]); styles.push(ST.title);
  rows.push(['NO.','NOMBRE COMPLETO','CONTRATISTA','PUESTO','FECHA ALTA','ESTATUS']); styles.push(ST.head);
  const merges=[{s:{r:0,c:0},e:{r:0,c:5}}];
  const sec=(t,st)=>{merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:5}});rows.push([t]);styles.push(st);};
  let total=0;
  obras.forEach(o=>{
    const gente=base.filter(w=>w.obra_id===o.id);
    if(!gente.length)return;
    sec(`■  OBRA: ${o.nombre}  —  ${gente.length} alta(s)`, ST.title);
    const porSem={};gente.forEach(w=>{const s=rdSemDe(o,w)??0;(porSem[s]=porSem[s]||[]).push(w);});
    Object.keys(porSem).map(Number).sort((a,b)=>a-b).forEach(s=>{
      const g=porSem[s].sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
      sec(`◆  SEMANA ${s}  —  ${g.length} alta(s)`, ST.sect);
      g.forEach(w=>{
        total++;
        rows.push([w.no_trab??'',fullName(w),w.contratista||'',w.puesto||'',fmtD(w.fecha_alta),w.estatus]);
        styles.push([ST.cellC,ST.cell,ST.cell,ST.cell,ST.cellC,ST.cellC]);
      });
    });
  });
  merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:5}});
  rows.push([`TOTAL: ${total} alta(s)`]); styles.push(ST.total);
  const ws=buildSheet(rows,styles,[8,34,18,22,13,12],merges,[{hpt:26},{hpt:24}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1,c:5}})};
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'ALTAS POR SEMANA');
  dl(wb,`ALTAS_POR_SEMANA_${today()}.xlsx`);
  closeModal();
  toast(`Excel generado: ${total} altas por semana.`,'ok');
}

/* ---------- CORREOS CREADOS (AtomicMail) ---------- */
function normCorreo(s){return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ñ/g,'n').replace(/[^a-z0-9]/g,'');}
function correoCfg(){const c=CFGEMP['correo_auto']||{};return {dom:c.dominio||'atomicmail.io'};}
function crearCorreo(){
  const nom=$('f-nombres').value.trim(), pa=$('f-primer_apellido').value.trim();
  if(!nom||!pa){toast('Primero captura el nombre y el primer apellido.','err');return;}
  const {dom}=correoCfg();
  const base=normCorreo(nom.split(/\s+/)[0])+'.'+normCorreo(pa);
  const usados=new Set(WORKERS.map(x=>String(x.correo||'').toLowerCase()));
  let correo=base+'@'+dom, i=2;
  while(usados.has(correo)){correo=base+i+'@'+dom;i++;}
  $('f-correo').value=correo;
  if(navigator.clipboard)navigator.clipboard.writeText(correo).catch(()=>{});
  $('h-correo').innerHTML=`<b>${esc(correo)}</b> — dirección preparada. Configura una contraseña única directamente en AtomicMail; la plataforma no la almacena ni la exporta. Después guarda el alta.`;
  window.open('https://atomicmail.io/app/auth/sign-up','_blank','noopener,noreferrer');
  toast('Dirección generada. Completa el registro con una contraseña única en AtomicMail.','ok');
}
async function openCorreos(){
  window._MAILS=[];
  const {dom}=correoCfg();
  const {data,error}=await leerPorEmpresa('trabajadores','id,primer_apellido,segundo_apellido,nombres,correo,obra_id,estatus',q=>q.ilike('correo','%@'+dom).order('primer_apellido'));
  if(error){toast('Error: '+error.message,'err');return;}
  window._MAILS=(data||[]);
  const obraN=id=>{const o=OBRAS.find(x=>x.id===id);return o?o.nombre:'';};
  modal(`
    <div class="m-head"><h2>✉ Correos creados (${dom})</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="background:var(--blue-bg);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;display:flex;align-items:center;gap:10px">
        <span>Directorio de cuentas. Las contraseñas se administran directamente con el proveedor y no se muestran ni exportan.</span>
        <span style="margin-left:auto;color:var(--mut);font-size:11.5px">${window._MAILS.length} correos</span>
      </div>
      ${window._MAILS.length?`
      <div class="imp-row head" style="grid-template-columns:1.6fr 1.4fr 1fr .5fr"><span>Trabajador</span><span>Correo</span><span>Obra</span><span></span></div>
      ${window._MAILS.map((m,i)=>`<div class="imp-row" style="grid-template-columns:1.6fr 1.4fr 1fr .5fr">
        <span><b>${esc([m.primer_apellido,m.segundo_apellido,m.nombres].filter(Boolean).join(' '))}</b> <span class="badge ${m.estatus}" style="font-size:9.5px">${m.estatus}</span></span>
        <span>${esc(m.correo)}</span>
        <span style="color:var(--mut);font-size:11.5px">${esc(obraN(m.obra_id))}</span>
        <span><button class="btn" style="padding:3px 10px;font-size:11.5px" onclick="copyTxt(window._MAILS[${i}].correo)">Copiar</button></span>
      </div>`).join('')}`
      :'<div class="empty">Aún no hay correos del dominio registrados. Usa el botón ✉ CREAR CORREO al capturar un trabajador.</div>'}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark" ${window._MAILS.length?'':'disabled'} onclick="exportCorreos()">⬇ Exportar Excel</button>
    </div>`,'lg');
}
function copyTxt(t){if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>toast('Copiado: '+t,'ok')).catch(()=>toast('No se pudo copiar.','err'));}
function exportCorreos(){
  const obraN=id=>{const o=OBRAS.find(x=>x.id===id);return o?o.nombre:'';};
  const rows=[],styles=[];
  rows.push([`CORREOS CREADOS — ${new Date().toLocaleDateString('es-MX')}`]); styles.push(ST.title);
  rows.push(['NOMBRE COMPLETO','CORREO','OBRA','ESTATUS']); styles.push(ST.head);
  window._MAILS.forEach(m=>{rows.push([[m.primer_apellido,m.segundo_apellido,m.nombres].filter(Boolean).join(' '),m.correo,obraN(m.obra_id),m.estatus]);
    styles.push([ST.cell,ST.cell,ST.cell,ST.cellC]);});
  const ws=buildSheet(rows,styles,[36,34,30,12],[{s:{r:0,c:0},e:{r:0,c:3}}],[{hpt:26},{hpt:24}]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'CORREOS CREADOS');
  dl(wb,`CORREOS_CREADOS_${today()}.xlsx`);
  toast('Excel de correos generado.','ok');
}

