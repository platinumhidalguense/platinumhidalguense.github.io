/* ---------- DASHBOARD Y REPORTE EJECUTIVO ---------- */
function _destroyDashCharts(){_DASHCHARTS.forEach(c=>{try{c.destroy();}catch(e){}});_DASHCHARTS=[];}
function _paletaObras(n){
  const base=['#14213d','#0b57d0','#0f7b4d','#c9a227','#b3261e','#7c3aed','#0aa3a3','#9a6700','#6b7482','#d4468c'];
  const out=[];for(let i=0;i<n;i++)out.push(base[i%base.length]);return out;
}
async function openDashboard(){
  toast('Calculando indicadores...');
  const [{data:tw,error:eTw},{data:ch},{data:ds}]=await Promise.all([
    fetchAllRows(()=>sb.from('trabajadores').select('*').eq('eliminado',false)),fetchAllRows(()=>sb.from('cheques').select('*')),fetchAllRows(()=>sb.from('descuentos').select('*').eq('activo',true))]);
  if(!tw||eTw){toast('No se pudieron comprobar los trabajadores.','err');return;}
  const acuses=await cargarAcusesTrabajadores(tw);
  if(acuses.error){toast('No se pudieron comprobar los acuses IMSS: '+acuses.error.message,'err');return;}
  window._DASH={tw,ch:(ch||[]).filter(c=>!c.eliminado),ds:ds||[],acuses:indiceAcusesIMSS(acuses.data)};
  modal(`
    <div class="m-head"><h2>📊 Dashboard ejecutivo</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        <label style="font-size:12px;font-weight:700;color:var(--mut)">OBRA:</label>
        <select id="dash-obra" onchange="renderDash(this.value)" style="max-width:280px">
          <option value="">Todas las obras</option>
          ${OBRAS.map(o=>`<option value="${o.id}">${esc(o.nombre)}</option>`).join('')}
        </select>
        <span style="font-size:11px;color:var(--mut)">Actualizado: ${new Date().toLocaleString('es-MX')}</span>
      </div>
      <div id="dash-body"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn" onclick="imprimirDashboard()">🖨 Imprimir / PDF para junta</button>
      <button class="btn dark" onclick="exportReporteEjecutivo()">⬇ Reporte ejecutivo para junta (Excel)</button>
    </div>`,'xl');
  await renderDash('');
}
async function renderDash(obraId){
  const {tw,ch,ds,acuses}=window._DASH||{}; if(!tw)return;
  _destroyDashCharts();
  const g=obraId?tw.filter(w=>w.obra_id===obraId):tw;
  const a=g.filter(w=>w.estatus==='ACTIVO');
  const p=g.filter(w=>w.estatus==='PENDIENTE');
  const b=g.filter(w=>w.estatus==='BAJA');
  const nomina=a.filter(w=>(w.periodo_pago||'SEMANAL')==='SEMANAL').reduce((s,w)=>s+(Number(w.sal_semanal)||0),0);
  const chqPend=(ch||[]).filter(c=>(!obraId||c.obra_id===obraId)&&c.estatus==='PENDIENTE');
  const descF=(ds||[]).filter(d=>(!obraId||d.obra_id===obraId)&&d.recurrente);
  const mesAct=new Date().getMonth(), anioAct=new Date().getFullYear();
  const altasMes=g.filter(w=>w.fecha_alta&&new Date(w.fecha_alta+'T12:00').getMonth()===mesAct&&new Date(w.fecha_alta+'T12:00').getFullYear()===anioAct).length;
  const bajasMes=g.filter(w=>w.fecha_baja&&new Date(w.fecha_baja+'T12:00').getMonth()===mesAct&&new Date(w.fecha_baja+'T12:00').getFullYear()===anioAct).length;
  const rotMes=a.length?(bajasMes/a.length*100):0;
  const edadArr=a.filter(w=>w.fecha_nacimiento);
  const edadProm=edadArr.length?Math.round(edadArr.reduce((s,w)=>s+((Date.now()-new Date(w.fecha_nacimiento))/31557600000),0)/edadArr.length):0;
  const antArr=a.filter(w=>w.fecha_alta);
  const antProm=antArr.length?(antArr.reduce((s,w)=>s+((Date.now()-new Date(iniAntig(w)))/31557600000),0)/antArr.length):0;
  const docsOkP=a.length?Math.round(a.filter(w=>docsOk(w)===DOCS.length).length/a.length*100):0;
  const sinAcuse=a.filter(w=>!tieneAcuseAltaImportado(w,acuses)).length;

  // altas/bajas últimas 12 semanas
  const semanas=[];
  for(let i=11;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i*7);semanas.push({w:isoWeek(d),label:'S'+isoWeek(d),altas:0,bajas:0});}
  g.forEach(w=>{semanas.forEach(sm=>{
    if(w.fecha_alta&&isoWeek(new Date(w.fecha_alta+'T12:00'))===sm.w)sm.altas++;
    if(w.fecha_baja&&isoWeek(new Date(w.fecha_baja+'T12:00'))===sm.w)sm.bajas++;
  });});
  window._SEMS=semanas;

  // altas/bajas últimos 6 meses
  const meses=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);meses.push({y:d.getFullYear(),m:d.getMonth(),label:MES[d.getMonth()].slice(0,3)+' '+String(d.getFullYear()).slice(2),altas:0,bajas:0});}
  g.forEach(w=>{
    meses.forEach(mm=>{
      if(w.fecha_alta){const d=new Date(w.fecha_alta+'T12:00');if(d.getFullYear()===mm.y&&d.getMonth()===mm.m)mm.altas++;}
      if(w.fecha_baja){const d=new Date(w.fecha_baja+'T12:00');if(d.getFullYear()===mm.y&&d.getMonth()===mm.m)mm.bajas++;}
    });
  });

  // distribución por puesto (top 7 + otros), sobre activos filtrados
  const puestoMap={}; a.forEach(w=>{const k=w.puesto||'(SIN PUESTO)';puestoMap[k]=(puestoMap[k]||0)+1;});
  const puestoArr=Object.entries(puestoMap).sort((x,y)=>y[1]-x[1]);
  const puestoTop=puestoArr.slice(0,7); const puestoResto=puestoArr.slice(7).reduce((s,x)=>s+x[1],0);
  if(puestoResto>0)puestoTop.push(['Otros',puestoResto]);

  // activos por obra — siempre panorama completo de la empresa, para contexto del jefe
  const porObra=OBRAS.map(o=>({nombre:o.nombre,n:tw.filter(w=>w.obra_id===o.id&&w.estatus==='ACTIVO').length}));

  // antigüedad de la plantilla activa filtrada, por rangos
  const rangos=[{l:'< 1 año',min:0,max:1,n:0},{l:'1-3 años',min:1,max:3,n:0},{l:'3-5 años',min:3,max:5,n:0},{l:'5+ años',min:5,max:999,n:0}];
  antArr.forEach(w=>{const yrs=(Date.now()-new Date(iniAntig(w)))/31557600000; const r=rangos.find(r=>yrs>=r.min&&yrs<r.max); if(r)r.n++;});

  // cumplimiento REPSE — bitácora de contratistas, siempre a nivel empresa (no depende del filtro de obra)
  const repseCount={VIGENTE:0,'POR VENCER':0,VENCIDO:0,'SIN CAPTURAR':0,'NO APLICA':0};
  (CONTRATISTAS||[]).forEach(c=>{const est=repseEstatus(c); repseCount[est]=(repseCount[est]||0)+1;});

  window._DASHF={obraId,a,p,b,altasMes,bajasMes,rotMes,nomina,chqPend,descF,edadProm,antProm,docsOkP,sinAcuse,semanas,meses,puestoTop,porObra,rangos,repseCount};

  $('dash-body').innerHTML=`
    <div class="stats" style="margin-bottom:16px">
      <div class="stat g"><div class="n">${a.length}</div><div class="l">Activos</div></div>
      <div class="stat a"><div class="n">${p.length}</div><div class="l">Pendientes</div></div>
      <div class="stat r"><div class="n">${b.length}</div><div class="l">Bajas acumuladas</div></div>
      <div class="stat g"><div class="n">+${altasMes}</div><div class="l">Altas del mes</div></div>
      <div class="stat r"><div class="n">−${bajasMes}</div><div class="l">Bajas del mes</div></div>
      <div class="stat ${rotMes>=5?'r':rotMes>=2?'a':'g'}"><div class="n">${rotMes.toFixed(1)}%</div><div class="l">Rotación del mes</div></div>
      <div class="stat b"><div class="n">$${money(nomina)}</div><div class="l">Nómina semanal activa</div></div>
      <div class="stat a"><div class="n">${chqPend.length}</div><div class="l">Cheques pend. · $${money(chqPend.reduce((s,c)=>s+(Number(c.importe)||0),0))}</div></div>
      <div class="stat r"><div class="n">${descF.length}</div><div class="l">Créditos activos</div></div>
      <div class="stat"><div class="n">${edadProm}</div><div class="l">Edad promedio</div></div>
      <div class="stat"><div class="n">${antProm.toFixed(1)} años</div><div class="l">Antigüedad promedio</div></div>
      <div class="stat ${docsOkP>=80?'g':'a'}"><div class="n">${docsOkP}%</div><div class="l">Expedientes completos</div></div>
      <div class="stat r"><div class="n">${sinAcuse}</div><div class="l">Sin acuse IMSS confirmado</div></div>
    </div>
    <div class="sect">Panorama visual</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:14px">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">ACTIVOS POR OBRA</div>
        <div style="height:220px"><canvas id="ch-obra"></canvas></div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">DISTRIBUCIÓN POR PUESTO${obraId?' · obra seleccionada':''}</div>
        <div style="height:220px"><canvas id="ch-puesto"></canvas></div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">ALTAS Y BAJAS · ÚLTIMAS 12 SEMANAS</div>
        <div style="height:220px"><canvas id="ch-sem"></canvas></div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">ALTAS Y BAJAS · ÚLTIMOS 6 MESES</div>
        <div style="height:220px"><canvas id="ch-mes"></canvas></div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">ANTIGÜEDAD DE LA PLANTILLA ACTIVA</div>
        <div style="height:220px"><canvas id="ch-ant"></canvas></div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">CUMPLIMIENTO REPSE · TODA LA EMPRESA</div>
        <div style="height:220px"><canvas id="ch-repse"></canvas></div>
      </div>
    </div>
    <div class="sect">Detalle · altas y bajas por semana</div>
    <div style="max-height:170px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:6px 10px">
    ${semanas.map(s=>`<div style="display:grid;grid-template-columns:60px 1fr 50px;gap:8px;padding:3px 0;font-size:11.5px">
      <b>${s.label}</b><span style="color:var(--mut)">+${s.altas} altas / −${s.bajas} bajas</span>
      <span style="color:${s.altas-s.bajas>=0?'var(--green)':'var(--red)'};font-weight:700">${s.altas-s.bajas>=0?'+':''}${s.altas-s.bajas}</span></div>`).join('')}
    </div>
  `;

  try{
    if(typeof Chart==='undefined')throw new Error('Chart.js no cargó (revisa tu conexión a internet — el dashboard necesita cargar una librería externa una sola vez).');
    const legendBottom={position:'bottom',labels:{font:{size:11},boxWidth:12}};
    const baseOpt={responsive:true,maintainAspectRatio:false};
    _DASHCHARTS.push(new Chart($('ch-obra'),{type:'doughnut',data:{labels:porObra.map(x=>x.nombre),datasets:[{data:porObra.map(x=>x.n),backgroundColor:_paletaObras(porObra.length)}]},options:{...baseOpt,plugins:{legend:legendBottom}}}));
    _DASHCHARTS.push(new Chart($('ch-puesto'),{type:'doughnut',data:{labels:puestoTop.map(x=>x[0]),datasets:[{data:puestoTop.map(x=>x[1]),backgroundColor:_paletaObras(puestoTop.length)}]},options:{...baseOpt,plugins:{legend:legendBottom}}}));
    _DASHCHARTS.push(new Chart($('ch-sem'),{type:'bar',data:{labels:semanas.map(s=>s.label),datasets:[{label:'Altas',data:semanas.map(s=>s.altas),backgroundColor:'#0f7b4d'},{label:'Bajas',data:semanas.map(s=>s.bajas),backgroundColor:'#b3261e'}]},options:{...baseOpt,plugins:{legend:legendBottom}}}));
    _DASHCHARTS.push(new Chart($('ch-mes'),{type:'bar',data:{labels:meses.map(m=>m.label),datasets:[{label:'Altas',data:meses.map(m=>m.altas),backgroundColor:'#0b57d0'},{label:'Bajas',data:meses.map(m=>m.bajas),backgroundColor:'#b3261e'}]},options:{...baseOpt,plugins:{legend:legendBottom}}}));
    _DASHCHARTS.push(new Chart($('ch-ant'),{type:'bar',data:{labels:rangos.map(r=>r.l),datasets:[{label:'Trabajadores',data:rangos.map(r=>r.n),backgroundColor:'#c9a227'}]},options:{...baseOpt,plugins:{legend:{display:false}}}}));
    _DASHCHARTS.push(new Chart($('ch-repse'),{type:'doughnut',data:{labels:Object.keys(repseCount),datasets:[{data:Object.values(repseCount),backgroundColor:['#0f7b4d','#9a6700','#b3261e','#6b7482','#0b57d0']}]},options:{...baseOpt,plugins:{legend:legendBottom}}}));
  }catch(e){
    toast('No se pudieron dibujar las gráficas: '+e.message,'err');
    ['ch-obra','ch-puesto','ch-sem','ch-mes','ch-ant','ch-repse'].forEach(id=>{const c=$(id);if(c&&c.parentElement)c.parentElement.innerHTML='<div style="color:var(--mut);font-size:11.5px;padding:20px;text-align:center">No se pudo cargar la gráfica (revisa tu conexión a internet).</div>';});
  }
}
function imprimirDashboard(){
  const F=window._DASHF;
  if(!F){toast('Espera a que cargue el dashboard.','err');return;}
  const obraNom=F.obraId?((OBRAS.find(o=>o.id===F.obraId)||{}).nombre||''):'TODAS LAS OBRAS';
  const bar=(v,max)=>`<span style="display:inline-block;background:#eef1f5;border-radius:4px;height:9px;overflow:hidden;width:130px;vertical-align:middle;margin-right:8px"><span style="display:block;width:${max?Math.round(v/max*100):0}%;background:#14213d;height:100%"></span></span>`;
  const maxObra=Math.max(...F.porObra.map(x=>x.n),1);
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Dashboard ejecutivo · ${esc(obraNom)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1c2430;max-width:920px;margin:26px auto;padding:0 24px}
    h1{font-size:18px;color:#14213d;margin-bottom:2px} .sub{color:#6b7482;font-size:11px;margin-bottom:16px}
    .sect{font-size:11px;font-weight:800;color:#14213d;text-transform:uppercase;letter-spacing:.6px;border-bottom:2px solid #c9a227;padding-bottom:4px;margin:18px 0 8px}
    table{width:100%;border-collapse:collapse;font-size:11.5px} td,th{padding:4px 6px;border-bottom:1px solid #e3e6ea;text-align:left}
    .stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
    .stat{border:1px solid #e3e6ea;border-radius:7px;padding:8px 14px;min-width:112px}
    .n{font-size:16px;font-weight:800;color:#14213d} .l{font-size:9px;color:#6b7482;text-transform:uppercase;letter-spacing:.3px}
    @media print{body{margin:8mm auto}}
  </style></head><body>
  <h1>📊 Dashboard ejecutivo de personal</h1>
  <div class="sub">Comercializadora Platinum Hidalguense · ${esc(obraNom)} · Generado el ${new Date().toLocaleString('es-MX')}</div>
  <div class="stats">
    <div class="stat"><div class="n">${F.a.length}</div><div class="l">Activos</div></div>
    <div class="stat"><div class="n">${F.p.length}</div><div class="l">Pendientes</div></div>
    <div class="stat"><div class="n">${F.b.length}</div><div class="l">Bajas acum.</div></div>
    <div class="stat"><div class="n">+${F.altasMes}</div><div class="l">Altas del mes</div></div>
    <div class="stat"><div class="n">−${F.bajasMes}</div><div class="l">Bajas del mes</div></div>
    <div class="stat"><div class="n">${F.rotMes.toFixed(1)}%</div><div class="l">Rotación del mes</div></div>
    <div class="stat"><div class="n">$${money(F.nomina)}</div><div class="l">Nómina semanal</div></div>
    <div class="stat"><div class="n">${F.chqPend.length}</div><div class="l">Cheques pend.</div></div>
    <div class="stat"><div class="n">${F.descF.length}</div><div class="l">Créditos activos</div></div>
    <div class="stat"><div class="n">${F.edadProm}</div><div class="l">Edad promedio</div></div>
    <div class="stat"><div class="n">${F.antProm.toFixed(1)}a</div><div class="l">Antigüedad prom.</div></div>
    <div class="stat"><div class="n">${F.docsOkP}%</div><div class="l">Expedientes OK</div></div>
    <div class="stat"><div class="n">${F.sinAcuse}</div><div class="l">Sin acuse IMSS confirmado</div></div>
  </div>
  <div class="sect">Activos por obra</div>
  <table>${F.porObra.map(x=>`<tr><td style="width:220px">${esc(x.nombre)}</td><td>${bar(x.n,maxObra)}</td><td><b>${x.n}</b></td></tr>`).join('')}</table>
  <div class="sect">Distribución por puesto${F.obraId?' · obra seleccionada':''}</div>
  <table>${F.puestoTop.map(x=>`<tr><td>${esc(x[0])}</td><td><b>${x[1]}</b></td></tr>`).join('')}</table>
  <div class="sect">Altas y bajas · últimas 12 semanas</div>
  <table><tr><th>Semana</th><th>Altas</th><th>Bajas</th><th>Dif.</th></tr>${F.semanas.map(s=>`<tr><td>${s.label}</td><td>+${s.altas}</td><td>−${s.bajas}</td><td>${s.altas-s.bajas}</td></tr>`).join('')}</table>
  <div class="sect">Altas y bajas · últimos 6 meses</div>
  <table><tr><th>Mes</th><th>Altas</th><th>Bajas</th><th>Dif.</th></tr>${F.meses.map(m=>`<tr><td>${m.label}</td><td>+${m.altas}</td><td>−${m.bajas}</td><td>${m.altas-m.bajas}</td></tr>`).join('')}</table>
  <div class="sect">Antigüedad de la plantilla activa</div>
  <table>${F.rangos.map(r=>`<tr><td>${r.l}</td><td><b>${r.n}</b></td></tr>`).join('')}</table>
  <div class="sect">Cumplimiento REPSE (bitácora interna de contratistas)</div>
  <table>${Object.entries(F.repseCount).map(([k,v])=>`<tr><td>${k}</td><td><b>${v}</b></td></tr>`).join('')}</table>
  <p style="font-size:9.5px;color:#6b7482;margin-top:18px">Documento generado por la Base de Trabajadores PLATINUM, uso interno para junta directiva.</p>
  <script>window.onload=()=>window.print()<\/script></body></html>`;
  const win=window.open('','_blank');
  if(!win){toast('Tu navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.','err');return;}
  win.document.write(html);win.document.close();
}
/* ================== REPORTE EJECUTIVO "PRO" (v25) ==================
   Nivel Excel/Power BI profesional: fórmulas REALES de Excel (COUNTIFS,
   SUMIFS, AVERAGEIFS, DATEDIF, TODAY) que recalculan solas al abrir el
   archivo — no números congelados — más tabla con filtros, encabezados
   congelados y barras de datos NATIVAS de Excel (conditional formatting,
   se ven como mini-gráficas dentro de la celda). Los objetos de gráfica
   flotante (los de "Insertar > Gráfica") requieren SheetJS Pro (de paga)
   y no están disponibles aquí porque la base se mantiene 100% gratuita;
   las barras de datos nativas son el sustituto profesional estándar
   cuando no se dispone de esa función de pago.
   Estas funciones son EXCLUSIVAS de este reporte: no tocan buildSheet(),
   ST(), BORD ni dl(), que usa el resto de la app, para no arriesgar
   ninguna otra exportación existente. ==================================== */
const STX={
  cellAlt:{font:{sz:10,name:'Calibri'},fill:{fgColor:{rgb:'F6F7F9'}},border:BORD,alignment:{vertical:'center'}},
  cellAltC:{font:{sz:10,name:'Calibri'},fill:{fgColor:{rgb:'F6F7F9'}},border:BORD,alignment:{horizontal:'center',vertical:'center'}},
  moneyAlt:{font:{sz:10,name:'Calibri'},fill:{fgColor:{rgb:'F6F7F9'}},border:BORD,alignment:{horizontal:'right',vertical:'center'},numFmt:'$#,##0.00'},
  pct:{font:{sz:10,name:'Calibri'},border:BORD,alignment:{horizontal:'right',vertical:'center'},numFmt:'0.0%'},
  kpiLabel:{font:{bold:true,sz:10,color:{rgb:'14213D'},name:'Calibri'},fill:{fgColor:{rgb:'E8EFFC'}},border:BORD,alignment:{vertical:'center',indent:1}},
  kpiVal:{font:{bold:true,sz:12,color:{rgb:'0B57D0'},name:'Calibri'},border:BORD,alignment:{horizontal:'right',vertical:'center'},numFmt:'#,##0'},
  kpiValMoney:{font:{bold:true,sz:12,color:{rgb:'0F7B4D'},name:'Calibri'},border:BORD,alignment:{horizontal:'right',vertical:'center'},numFmt:'$#,##0.00'},
  kpiValPct:{font:{bold:true,sz:12,color:{rgb:'9A6700'},name:'Calibri'},border:BORD,alignment:{horizontal:'right',vertical:'center'},numFmt:'0.0%'},
};
function buildSheetPro(rows,styles,widths,merges,rowHeights){
  const ws=XLSX.utils.aoa_to_sheet(rows,{cellDates:true});
  if(widths)ws['!cols']=widths.map(w=>({wch:w}));
  if(merges)ws['!merges']=merges;
  if(rowHeights)ws['!rows']=rowHeights;
  ws['!margins']={left:0.25,right:0.25,top:0.3,bottom:0.3,header:0.1,footer:0.1};
  styles.forEach((rowSt,r)=>{
    if(!rowSt)return;
    rows[r].forEach((_,c)=>{
      const addr=XLSX.utils.encode_cell({r,c});
      if(!ws[addr])ws[addr]={t:'s',v:''};
      ws[addr].s=Array.isArray(rowSt)?(rowSt[c]||ST.cell):rowSt;
    });
  });
  return ws;
}
function cfDataBar(ref,colorHex){
  return `<conditionalFormatting sqref="${ref}"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF${colorHex}"/></dataBar></cfRule></conditionalFormatting>`;
}
async function dlDashboardXlsx(wb,name,porHoja){
  try{
    if(!window.JSZip){dlPlain(wb,name);await registrarExportacion(wb,name);return;}
    const data=XLSX.write(wb,{type:'array',bookType:'xlsx'});
    const zip=await JSZip.loadAsync(data);
    for(let idx=0;idx<wb.SheetNames.length;idx++){
      const cfg=porHoja[wb.SheetNames[idx]]; if(!cfg)continue;
      const f=`xl/worksheets/sheet${idx+1}.xml`; const file=zip.file(f); if(!file)continue;
      let xml=await file.async('string');
      if(cfg.freezeRow){
        const pane=`<pane ySplit="${cfg.freezeRow}" topLeftCell="A${cfg.freezeRow+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${cfg.freezeRow+1}" sqref="A${cfg.freezeRow+1}"/>`;
        xml=xml.replace(/<sheetView([^>]*)\/>/,`<sheetView$1>${pane}</sheetView>`);
      }
      if(cfg.dataBars&&cfg.dataBars.length){
        const cf=cfg.dataBars.map(d=>cfDataBar(d.ref,d.color)).join('');
        if(/<\/mergeCells>/.test(xml))xml=xml.replace(/(<\/mergeCells>)/,'$1'+cf);
        else if(/<autoFilter[^>]*\/>/.test(xml))xml=xml.replace(/(<autoFilter[^>]*\/>)/,'$1'+cf);
        else xml=xml.replace(/(<\/sheetData>)/,'$1'+cf);
      }
      zip.file(f,xml);
    }
    // mismo ajuste de impresión que el resto de la app (horizontal + ajustar ancho)
    const files=Object.keys(zip.files).filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x));
    for(const f of files){
      let xml=await zip.file(f).async('string');
      // Escala EDITABLE: quitamos fitToPage (bloqueaba "Ajustar al %" en Excel) y
      // usamos modo "Ajustar a N% del tamaño normal" (scale). Así el usuario puede
      // cambiar la escala de impresión. Orientación horizontal por default.
      xml=xml.replace(/<pageSetUpPr[^>]*\/>/g,'');
      const ps='<pageSetup paperSize="1" orientation="landscape" scale="100"/>';
      if(/<pageSetup[ \/>]/.test(xml))xml=xml.replace(/<pageSetup[^>]*\/>/,ps);
      else if(/<pageMargins[^>]*\/>/.test(xml))xml=xml.replace(/(<pageMargins[^>]*\/>)/,'$1'+ps);
      else{
        const ins='<pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/>'+ps;
        const pos=xml.search(/<(headerFooter|rowBreaks|colBreaks|drawing|ignoredErrors|tableParts|extLst)[ \/>]/);
        if(pos>=0)xml=xml.slice(0,pos)+ins+xml.slice(pos);
        else xml=xml.replace('</worksheet>',ins+'</worksheet>');
      }
      zip.file(f,xml);
    }
    await aplicarMarcaCorporativaXlsx(zip,wb);
    const out=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const a=document.createElement('a');a.href=URL.createObjectURL(out);a.download=name;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    await registrarExportacion(wb,name);
  }catch(e){console.error(e);dlPlain(wb,name);await registrarExportacion(wb,name);toast('Reporte generado, pero no fue posible incrustar la marca corporativa.','err');}
}
function exportReporteEjecutivo(){
  const {tw,ch,ds,acuses}=window._DASH; if(!tw)return;
  const wb=XLSX.utils.book_new();
  const porHoja={};
  const lastRow=tw.length+1;
  const mesAct=new Date().getMonth(), anioAct=new Date().getFullYear();

  /* ---------- Hoja BASE: una fila por trabajador, fuente única de verdad ---------- */
  const rb=[['OBRA','ESTATUS','PUESTO','PERIODO','SALARIO PERIODO','FECHA ALTA','FECHA BAJA','FECHA NAC.','EDAD','ANTIGÜEDAD (AÑOS)','EXPEDIENTE','ACUSE IMSS']];
  const sbz=[ST.head];
  tw.forEach((w,i)=>{
    const o=OBRAS.find(x=>x.id===w.obra_id); const r=i+2; const alt=i%2===1;
    rb.push([o?o.nombre:'',w.estatus,w.puesto||'',w.periodo_pago||'SEMANAL',Number(w.sal_semanal)||0,
      w.fecha_alta?new Date(w.fecha_alta+'T12:00'):'', w.fecha_baja?new Date(w.fecha_baja+'T12:00'):'', w.fecha_nacimiento?new Date(w.fecha_nacimiento+'T12:00'):'',
      {t:'n',f:`IF(H${r}="","",DATEDIF(H${r},TODAY(),"y"))`,z:'0'},
      {t:'n',f:`IF(F${r}="","",ROUND((TODAY()-F${r})/365,2))`,z:'0.0'},
      docsOk(w)===DOCS.length?'COMPLETO':'INCOMPLETO', tieneAcuseAltaImportado(w,acuses)?'CON ACUSE':estadoAcuseIMSS(w,'ALTA',acuses).porCotejar?'POR COTEJAR':'SIN ACUSE']);
    sbz.push(alt?[STX.cellAlt,STX.cellAltC,STX.cellAlt,STX.cellAltC,STX.moneyAlt,STX.cellAltC,STX.cellAltC,STX.cellAltC,STX.cellAltC,STX.cellAltC,STX.cellAltC,STX.cellAltC]
                :[ST.cell,ST.cellC,ST.cell,ST.cellC,ST.money,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC]);
  });
  const wsBase=buildSheetPro(rb,sbz,[26,11,20,11,16,12,12,12,7,14,12,12]);
  wsBase['!autofilter']={ref:`A1:L${lastRow}`};
  XLSX.utils.book_append_sheet(wb,wsBase,'BASE');
  porHoja['BASE']={freezeRow:1};

  const A_=`BASE!$A$2:$A$${lastRow}`,B=`BASE!$B$2:$B$${lastRow}`,C_=`BASE!$C$2:$C$${lastRow}`,D=`BASE!$D$2:$D$${lastRow}`,
        E=`BASE!$E$2:$E$${lastRow}`,F=`BASE!$F$2:$F$${lastRow}`,G=`BASE!$G$2:$G$${lastRow}`,I=`BASE!$I$2:$I$${lastRow}`,
        J=`BASE!$J$2:$J$${lastRow}`,K=`BASE!$K$2:$K$${lastRow}`,L=`BASE!$L$2:$L$${lastRow}`;
  const mIni=`DATE(${anioAct},${mesAct+1},1)`, mFin=`DATE(${mesAct===11?anioAct+1:anioAct},${mesAct===11?1:mesAct+2},1)`;

  /* ---------- Hoja RESUMEN: KPIs con fórmulas + activos por obra con barra de datos nativa ---------- */
  const rr=[],sr=[];
  rr.push(['REPORTE EJECUTIVO DE PERSONAL — COMERCIALIZADORA PLATINUM HIDALGUENSE / GRUPO JIRE']); sr.push(ST.title);
  rr.push([`Generado el ${new Date().toLocaleDateString('es-MX')} · cifras con fórmulas en vivo sobre la hoja BASE (recalculan solas al abrir el archivo)`]); sr.push(ST.sub);
  rr.push([]); sr.push(null);
  rr.push(['INDICADORES GENERALES','']); sr.push([ST.sect,ST.sect]);
  rr.push(['Activos',{t:'n',f:`COUNTIF(${B},"ACTIVO")`}]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push(['Pendientes',{t:'n',f:`COUNTIF(${B},"PENDIENTE")`}]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push(['Bajas acumuladas',{t:'n',f:`COUNTIF(${B},"BAJA")`}]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push(['Altas del mes en curso',{t:'n',f:`COUNTIFS(${F},">="&${mIni},${F},"<"&${mFin})`}]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push(['Bajas del mes en curso',{t:'n',f:`COUNTIFS(${G},">="&${mIni},${G},"<"&${mFin})`}]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push(['Rotación del mes',{t:'n',f:`IFERROR(COUNTIFS(${G},">="&${mIni},${G},"<"&${mFin})/COUNTIF(${B},"ACTIVO"),0)`}]); sr.push([STX.kpiLabel,STX.kpiValPct]);
  rr.push(['Edad promedio (activos)',{t:'n',f:`ROUND(AVERAGEIFS(${I},${B},"ACTIVO"),0)`}]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push(['Antigüedad promedio años (activos)',{t:'n',f:`ROUND(AVERAGEIFS(${J},${B},"ACTIVO"),1)`}]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push(['Expedientes completos (activos)',{t:'n',f:`IFERROR(COUNTIFS(${K},"COMPLETO",${B},"ACTIVO")/COUNTIF(${B},"ACTIVO"),0)`}]); sr.push([STX.kpiLabel,STX.kpiValPct]);
  rr.push(['Sin acuse IMSS (activos)',{t:'n',f:`COUNTIFS(${L},"SIN ACUSE",${B},"ACTIVO")`}]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push([]); sr.push(null);
  rr.push(['NÓMINA Y COSTOS (ACTIVOS)','']); sr.push([ST.sect2,ST.sect2]);
  rr.push(['Nómina semanal',{t:'n',f:`SUMIFS(${E},${B},"ACTIVO",${D},"SEMANAL")`}]); sr.push([STX.kpiLabel,STX.kpiValMoney]);
  rr.push(['Nómina quincenal',{t:'n',f:`SUMIFS(${E},${B},"ACTIVO",${D},"QUINCENAL")`}]); sr.push([STX.kpiLabel,STX.kpiValMoney]);
  rr.push(['Créditos activos (Infonavit/otros)',ds.filter(d=>d.recurrente).length]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push(['Cheques de finiquito pendientes',ch.filter(c=>c.estatus==='PENDIENTE'&&c.tipo_pago==='FINIQUITO').length]); sr.push([STX.kpiLabel,STX.kpiVal]);
  rr.push(['Monto cheques de finiquito pendientes',ch.filter(c=>c.estatus==='PENDIENTE'&&c.tipo_pago==='FINIQUITO').reduce((s,c)=>s+(Number(c.importe)||0),0)]); sr.push([STX.kpiLabel,STX.kpiValMoney]);
  rr.push([]); sr.push(null);
  rr.push(['ACTIVOS POR OBRA','']); sr.push([ST.sect,ST.sect]);
  rr.push(['OBRA','ACTIVOS']); sr.push([ST.head,ST.head]);
  const obraStart=rr.length+1;
  OBRAS.forEach(o=>{ rr.push([o.nombre,{t:'n',f:`COUNTIFS(${A_},"${o.nombre.replace(/"/g,'""')}",${B},"ACTIVO")`}]); sr.push([ST.cell,STX.kpiVal]); });
  const obraEnd=rr.length;
  rr.push(['TOTAL',{t:'n',f:`SUM(B${obraStart}:B${obraEnd})`}]); sr.push([ST.total,ST.totalMoney]);
  const wsResumen=buildSheetPro(rr,sr,[44,18],[{s:{r:0,c:0},e:{r:0,c:1}},{s:{r:1,c:0},e:{r:1,c:1}}]);
  XLSX.utils.book_append_sheet(wb,wsResumen,'RESUMEN');
  porHoja['RESUMEN']={dataBars:[{ref:`B${obraStart}:B${obraEnd}`,color:'1F6FEB'}]};

  /* ---------- Hoja PUESTOS: distribución con fórmulas + barra de datos ---------- */
  const rp=[],sp=[];
  rp.push(['DISTRIBUCIÓN DE PUESTOS — TRABAJADORES ACTIVOS','','']); sp.push([ST.title,ST.title,ST.title]);
  rp.push(['PUESTO','ACTIVOS','SALARIO PROMEDIO (PERIODO)']); sp.push([ST.head,ST.head,ST.head]);
  const puestos=[...new Set(tw.map(w=>w.puesto||'(SIN PUESTO)'))].sort();
  const puestoStart=rp.length+1;
  puestos.forEach(p=>{
    const pq=p.replace(/"/g,'""');
    rp.push([p,{t:'n',f:`COUNTIFS(${C_},"${pq}",${B},"ACTIVO")`},{t:'n',f:`IFERROR(AVERAGEIFS(${E},${C_},"${pq}",${B},"ACTIVO"),0)`}]);
    sp.push([ST.cell,STX.kpiVal,ST.money]);
  });
  const puestoEnd=rp.length;
  const wsPuestos=buildSheetPro(rp,sp,[28,10,24],[{s:{r:0,c:0},e:{r:0,c:2}}]);
  wsPuestos['!autofilter']={ref:`A2:C${puestoEnd}`};
  XLSX.utils.book_append_sheet(wb,wsPuestos,'PUESTOS');
  porHoja['PUESTOS']={freezeRow:2,dataBars:[{ref:`B${puestoStart}:B${puestoEnd}`,color:'0F7B4D'}]};

  /* ---------- Hoja ROTACION: 6 meses, con fórmulas de fecha reales ---------- */
  const rrt=[],srt=[];
  rrt.push(['ROTACIÓN DE PERSONAL — ÚLTIMOS 6 MESES (TODAS LAS OBRAS)','','','','']); srt.push([ST.title,ST.title,ST.title,ST.title,ST.title]);
  rrt.push(['MES','ALTAS','BAJAS','DIFERENCIA','% ROTACIÓN (bajas/activos)']); srt.push([ST.head,ST.head,ST.head,ST.head,ST.head]);
  const rotStart=rrt.length+1;
  for(let i=5;i>=0;i--){
    const d=new Date();d.setMonth(d.getMonth()-i); const y=d.getFullYear(),m=d.getMonth();
    const s1=`DATE(${y},${m+1},1)`, s2=`DATE(${m===11?y+1:y},${m===11?1:m+2},1)`; const r=rrt.length+1;
    rrt.push([`${MES[m]} ${y}`,{t:'n',f:`COUNTIFS(${F},">="&${s1},${F},"<"&${s2})`},{t:'n',f:`COUNTIFS(${G},">="&${s1},${G},"<"&${s2})`},{t:'n',f:`B${r}-C${r}`},{t:'n',f:`IFERROR(C${r}/COUNTIF(${B},"ACTIVO"),0)`}]);
    srt.push([ST.cell,ST.cellC,ST.cellC,ST.cellC,STX.pct]);
  }
  const rotEnd=rrt.length;
  const wsRot=buildSheetPro(rrt,srt,[18,10,10,12,22],[{s:{r:0,c:0},e:{r:0,c:4}}]);
  XLSX.utils.book_append_sheet(wb,wsRot,'ROTACION');
  porHoja['ROTACION']={freezeRow:2,dataBars:[{ref:`D${rotStart}:D${rotEnd}`,color:'B3261E'}]};

  /* ---------- Hoja SEMANAS: últimas 12, con fórmulas de fecha reales (lunes a domingo) ---------- */
  const rw=[],sw=[];
  rw.push(['ALTAS Y BAJAS POR SEMANA — ÚLTIMAS 12 SEMANAS (TODAS LAS OBRAS)','','','','']); sw.push([ST.title,ST.title,ST.title,ST.title,ST.title]);
  rw.push(['SEMANA','DEL (LUNES)','ALTAS','BAJAS','DIFERENCIA']); sw.push([ST.head,ST.head,ST.head,ST.head,ST.head]);
  const semStart=rw.length+1;
  for(let i=11;i>=0;i--){
    const ref=new Date(); ref.setDate(ref.getDate()-i*7);
    const mon=new Date(ref); mon.setDate(ref.getDate()-((ref.getDay()+6)%7)); mon.setHours(12,0,0,0);
    const nextMon=new Date(mon); nextMon.setDate(mon.getDate()+7);
    const s1=`DATE(${mon.getFullYear()},${mon.getMonth()+1},${mon.getDate()})`;
    const s2=`DATE(${nextMon.getFullYear()},${nextMon.getMonth()+1},${nextMon.getDate()})`;
    const r=rw.length+1;
    rw.push([`S${isoWeek(ref)}`, mon, {t:'n',f:`COUNTIFS(${F},">="&${s1},${F},"<"&${s2})`}, {t:'n',f:`COUNTIFS(${G},">="&${s1},${G},"<"&${s2})`}, {t:'n',f:`C${r}-D${r}`}]);
    sw.push([ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC]);
  }
  const semEnd=rw.length;
  const wsSem=buildSheetPro(rw,sw,[10,14,9,9,11],[{s:{r:0,c:0},e:{r:0,c:4}}]);
  XLSX.utils.book_append_sheet(wb,wsSem,'SEMANAS');
  porHoja['SEMANAS']={freezeRow:2,dataBars:[{ref:`E${semStart}:E${semEnd}`,color:'0B57D0'}]};

  dlDashboardXlsx(wb,`REPORTE_EJECUTIVO_PERSONAL_${today()}.xlsx`,porHoja);
  toast('Reporte ejecutivo generado (con fórmulas en vivo), listo para la junta.','ok');
}

/* ---------- RESPALDO COMPLETO ---------- */
const BK_COLS=[['contratista','CONTRATISTA'],['estatus','ESTATUS'],['no_trab','NO. TRAB.'],['fecha_alta','FECHA ALTA'],['fecha_baja','FECHA BAJA'],['monto_finiquito','MONTO FINIQUITO'],['semana_ingreso','SEMANA DE INGRESO'],['periodo_pago','PERIODO DE PAGO'],['primer_apellido','PRIMER APELLIDO'],['segundo_apellido','SEGUNDO APELLIDO'],['nombres','NOMBRE(S)'],['estado_civil','ESTADO CIVIL'],['escolaridad','ESCOLARIDAD'],['funciones','FUNCIONES'],['puesto','PUESTO'],['beneficiario','BENEFICIARIO'],['sd','SD'],['sdi','SDI'],['sal_semanal','SAL. PERIODO'],['rfc','RFC'],['curp','CURP'],['nacionalidad','NACIONALIDAD'],['fecha_nacimiento','FECHA DE NACIMIENTO'],['nss','NSS'],['cuenta','CUENTA'],['clabe','CUENTA CLABE'],['banco','BANCO'],['edo_nacimiento','EDO. NACIMIENTO'],['direccion','DIRECCION'],['cp','C.P.'],['telefono','TELEFONO'],['correo','CORREO ELECTRONICO'],['genero','GENERO'],['turno','TURNO'],['forma_pago','FORMA DE PAGO'],['observaciones','OBSERVACIONES'],['drive_link','CARPETA DRIVE']];
async function exportRespaldo(porCorreo){
  toast('Generando respaldo completo...');
  const [{data,error},{data:chqAll}]=await Promise.all([
    fetchAllRows(()=>sb.from('trabajadores').select('*').eq('eliminado',false)),
    fetchAllRows(()=>sb.from('cheques').select('*'))
  ]);
  if(error){toast('Error: '+error.message,'err');return;}
  const wb=XLSX.utils.book_new();
  for(const o of OBRAS){
    const ws_rows=[BK_COLS.map(c=>c[1]).concat(['DOCS ENTREGADOS'])];
    data.filter(w=>w.obra_id===o.id).sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9))
      .forEach(w=>ws_rows.push(BK_COLS.map(c=>w[c[0]]??'').concat([`${docsOk(w)}/${DOCS.length}`])));
    const ws=XLSX.utils.aoa_to_sheet(ws_rows);
    ws_rows[0].forEach((_,c)=>{const a=XLSX.utils.encode_cell({r:0,c});if(ws[a])ws[a].s=ST.head;});
    XLSX.utils.book_append_sheet(wb,ws,o.nombre.slice(0,31).replace(/[\\\/\?\*\[\]:]/g,' '));
  }
  if(chqAll&&chqAll.length){
    const cr=[['OBRA','NO. TRAB.','CONTRATISTA','NOMBRE','PUESTO','CURP','SEMANA','PERIODO','IMPORTE','TIPO PAGO','NUM. CHEQUE','CONSECUTIVO','ESTATUS','OBSERVACIONES']];
    chqAll.forEach(c=>{const o=OBRAS.find(x=>x.id===c.obra_id);cr.push([o?o.nombre:'',c.no_trab??'',c.contratista,c.nombre,c.puesto,c.curp,c.semana,c.periodo,c.importe??'',c.tipo_pago,c.num_cheque,c.consecutivo,c.estatus,c.observaciones]);});
    const wsC=XLSX.utils.aoa_to_sheet(cr);
    cr[0].forEach((_,c)=>{const a=XLSX.utils.encode_cell({r:0,c});if(wsC[a])wsC[a].s=ST.head;});
    XLSX.utils.book_append_sheet(wb,wsC,'CHEQUES');
  }
  const {data:dsAll}=await fetchAllRows(()=>sb.from('descuentos').select('*').eq('activo',true));
  if(dsAll&&dsAll.length){
    const dr=[['TRABAJADOR','TIPO','MONTO','MOTIVO','FIJO/SEMANA','CAPTURADO POR']];
    dsAll.forEach(d=>{const w=data.find(x=>x.id===d.trabajador_id);dr.push([w?[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' '):'',d.tipo,d.monto??'',d.motivo,d.recurrente?'FIJO':d.semana,d.creado_por]);});
    const wsD=XLSX.utils.aoa_to_sheet(dr);
    dr[0].forEach((_,c)=>{const a=XLSX.utils.encode_cell({r:0,c});if(wsD[a])wsD[a].s=ST.head;});
    XLSX.utils.book_append_sheet(wb,wsD,'DESCUENTOS');
  }
  const {data:docAll}=await fetchAllRows(()=>sb.from('documentos').select('*').eq('anulado',false));
  if(docAll&&docAll.length){
    const dc=[['TRABAJADOR','CATEGORIA','TIPO','SEMANA','FECHA DOC','ARCHIVO','SUBIDO POR']];
    docAll.forEach(d=>{const w=data.find(x=>x.id===d.trabajador_id);dc.push([w?[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' '):'',d.categoria,d.subtipo,d.semana,d.fecha_doc||'',d.nombre_archivo,d.subido_por]);});
    const wsDoc=XLSX.utils.aoa_to_sheet(dc);
    dc[0].forEach((_,c)=>{const a=XLSX.utils.encode_cell({r:0,c});if(wsDoc[a])wsDoc[a].s=ST.head;});
    XLSX.utils.book_append_sheet(wb,wsDoc,'EXPEDIENTE DIGITAL');
  }
  const {data:hist}=await sb.from('historial').select('fecha,accion,trabajador_nombre,usuario').order('fecha',{ascending:false}).limit(500);
  if(hist)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['FECHA','ACCION','TRABAJADOR','USUARIO'],...hist.map(h=>[new Date(h.fecha).toLocaleString('es-MX'),h.accion,h.trabajador_nombre,h.usuario])]),'HISTORIAL RECIENTE');
  const f=new Date(),name=`RESPALDO_BASE_TRABAJADORES_${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(f.getDate()).padStart(2,'0')}.xlsx`;
  wb.__empresaPorHoja={};
  OBRAS.forEach(o=>{wb.__empresaPorHoja[o.nombre.slice(0,31).replace(/[\\\/\?\*\[\]:]/g,' ')]=empresaDeObra(o);});
  wb.__auditObraIds=OBRAS.map(o=>o.id);
  await dl(wb,name);
  toast(`Respaldo descargado: ${data.length} trabajadores y ${chqAll?chqAll.length:0} cheques.`,'ok');
  if(porCorreo){
    setTimeout(()=>{
      const body=encodeURIComponent(`Respaldo de la base de trabajadores PLATINUM del ${f.toLocaleDateString('es-MX')}.\n\nTrabajadores: ${data.length} · Cheques: ${chqAll?chqAll.length:0}.\n\nIMPORTANTE: adjunta a este correo el archivo que se acaba de descargar:\n${name}\n(normalmente en tu carpeta de Descargas)`);
      window.location.href=`mailto:?subject=${encodeURIComponent('Respaldo Base Trabajadores PLATINUM · '+f.toLocaleDateString('es-MX'))}&body=${body}`;
      toast('Se abrió tu correo: adjunta el archivo descargado y envíalo.','ok');
    },800);
  }
}

