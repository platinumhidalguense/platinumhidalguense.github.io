/* ---------- VACACIONES Y PERMISOS ---------- */
/* Cuenta días HÁBILES (lunes a sábado; excluye domingos) entre dos fechas ISO,
   inclusivo. Las vacaciones se cuentan en días laborales, no en días naturales. */
function diasHabilesVac(d1,d2){
  const a=new Date(d1+'T12:00'), b=new Date(d2+'T12:00'); if(isNaN(a)||isNaN(b)||b<a)return 0;
  let n=0; for(const d=new Date(a); d<=b; d.setDate(d.getDate()+1)){ if(d.getDay()!==0)n++; }
  return n;
}
/* Vacaciones NO acumulativas: se toma el derecho del AÑO EN CURSO según la
   antigüedad (calculada por ANIVERSARIO exacto desde la fecha de alta, no por
   365.25 — así no falla en casos de frontera, que era la diferencia con las 3
   de JIRE). `aniv` = último aniversario (inicio del periodo vigente);
   `vigencia` = próximo aniversario (fecha límite para gozar esos días). */
function saldoVac(w){
  if(!iniAntig(w))return {anios:0,derecho:0,gozados:0,saldo:0,aniv:null,vigencia:null};
  const ini=new Date(iniAntig(w)+'T12:00'), hoy=new Date();
  let anios=hoy.getFullYear()-ini.getFullYear();
  if(hoy.getMonth()<ini.getMonth()||(hoy.getMonth()===ini.getMonth()&&hoy.getDate()<ini.getDate()))anios--;
  if(anios<0)anios=0;
  const derecho=anios<1?0:diasVacaciones(anios);
  const aniv=new Date(ini);aniv.setFullYear(ini.getFullYear()+anios);
  const anivISO=aniv.toISOString().slice(0,10);
  const vig=new Date(ini);vig.setFullYear(ini.getFullYear()+anios+1);
  const vigISO=vig.toISOString().slice(0,10);
  const gozados=VAC.filter(v=>v.trabajador_id===w.id&&v.activo&&v.tipo==='VACACIONES'&&v.fecha_inicio>=anivISO)
    .reduce((s,v)=>s+(v.dias||0),0);
  return {anios,derecho,gozados,saldo:Math.max(0,derecho-gozados),aniv:anivISO,vigencia:vigISO};
}
function fueraHoy(w){
  const hoy=today();
  const v=VAC.find(v=>v.trabajador_id===w.id&&v.activo&&v.fecha_inicio<=hoy&&v.fecha_fin>=hoy);
  return v||null;
}
/* Días de VACACIONES gozados por un trabajador dentro de un AÑO calendario. */
function gozadosEnAnio(w,anio){
  return (VAC||[]).filter(v=>v.activo&&v.tipo==='VACACIONES'&&v.trabajador_id===w.id&&String(v.fecha_inicio).slice(0,4)===String(anio)).reduce((s,v)=>s+(v.dias||0),0);
}
/* PRIMA VACACIONAL (art. 80 LFT): 25% del salario de los días que le corresponden.
   total = 25% × derecho × salario diario. Fecha límite = vigencia (vencimiento de
   sus vacaciones = próximo aniversario). Los pagos viven en prima_pagos (Script 48),
   clasificados por el AÑO del vencimiento (periodo). */
function primaVac(w){
  const s=saldoVac(w);
  const sd=Number(w.sd)||0;
  const total=Math.round(0.25*s.derecho*sd*100)/100;
  const periodo=s.vigencia?parseInt(String(s.vigencia).slice(0,4)):null;
  const pagos=(PRIMAS||[]).filter(p=>p.activo!==false&&p.trabajador_id===w.id&&(periodo==null||Number(p.periodo)===periodo));
  const pagado=Math.round(pagos.reduce((a,p)=>a+(Number(p.monto)||0),0)*100)/100;
  const falta=Math.max(0,Math.round((total-pagado)*100)/100);
  return {total,pagado,falta,limite:s.vigencia,periodo,derecho:s.derecho,sd,pagos};
}
function vacAnioSel(){const e=$('vac-anio');return e&&e.value?parseInt(e.value):new Date().getFullYear();}
function renderVacViews(){
  if(!$('vac-tbody'))return;
  // poblar el selector de año una vez (del más nuevo al más viejo)
  if($('vac-anio')&&!$('vac-anio').options.length){
    const y=new Date().getFullYear(); let o='';
    for(let a=y+1;a>=2024;a--)o+=`<option value="${a}" ${a===y?'selected':''}>${a}</option>`;
    $('vac-anio').innerHTML=o;
  }
  const anio=vacAnioSel();
  if($('vac-anio-h'))$('vac-anio-h').textContent=anio;
  const hoy=today(), mes=hoy.slice(0,7);
  const act=WORKERS.filter(w=>w.estatus==='ACTIVO');
  const fuera=act.map(w=>({w,v:fueraHoy(w)})).filter(x=>x.v);
  const permMes=VAC.filter(v=>v.activo&&v.tipo.startsWith('PERMISO')&&String(v.fecha_inicio).slice(0,7)===mes).length;
  const incMes=VAC.filter(v=>v.activo&&v.tipo==='INCAPACIDAD'&&String(v.fecha_inicio).slice(0,7)===mes).length;
  const conSaldo=act.filter(w=>saldoVac(w).saldo>0).length;
  $('vac-stats').innerHTML=`
    <div class="stat b"><div class="n">${fuera.length}</div><div class="l">Fuera hoy</div></div>
    <div class="stat g"><div class="n">${conSaldo}</div><div class="l">Con saldo de vacaciones</div></div>
    <div class="stat a"><div class="n">${permMes}</div><div class="l">Permisos del mes</div></div>
    <div class="stat r"><div class="n">${incMes}</div><div class="l">Incapacidades del mes</div></div>`;
  const q=($('vac-q').value||'').trim().toUpperCase();
  let rows=act.filter(w=>!q||fullName(w).toUpperCase().includes(q));
  rows.sort((a,b)=>saldoVac(b).saldo-saldoVac(a).saldo);
  $('vac-tbody').innerHTML=rows.map(w=>{
    const s=saldoVac(w), f=fueraHoy(w), gz=gozadosEnAnio(w,anio), pr=primaVac(w);
    const primaCell=pr.total>0
      ? `$${money(pr.falta)}<span style="color:var(--mut)"> / $${money(pr.total)}</span>${pr.falta<=0.005?' <span style="color:var(--green)">✔</span>':''}${pr.limite?`<br><span style="color:var(--mut);font-size:10px">límite ${fmtD(pr.limite)}</span>`:''}`
      : '—';
    return `<tr onclick="openVacForm('${w.id}')">
      <td>${w.no_trab??''}</td><td><b>${esc(fullName(w))}</b><br><span style="color:var(--mut);font-size:10.5px">${esc(w.contratista||'')}</span></td>
      <td>${s.anios} año(s)</td><td>${s.derecho}</td>
      <td><b>${gz}</b></td>
      <td><b style="color:${s.saldo>0?'var(--green)':'var(--mut)'}">${s.saldo}</b>${s.vigencia?`<br><span style="color:var(--mut);font-size:10px">vig. ${fmtD(s.vigencia)}</span>`:''}</td>
      <td style="font-size:11.5px">${primaCell}</td>
      <td>${f?`<span class="badge ${f.tipo==='VACACIONES'?'ENTREGADO':'PENDIENTE'}">${esc(f.tipo)} hasta ${fmtD(f.fecha_fin)}</span>`:'—'}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="8"><div class="empty">Sin trabajadores activos.</div></td></tr>';
}
function openVacForm(trabId){
  const w=WORKERS.find(x=>x.id===trabId); if(!w)return;
  const s=saldoVac(w);
  const pr=primaVac(w);
  const regs=VAC.filter(v=>v.trabajador_id===trabId&&v.activo).sort((a,b)=>String(b.fecha_inicio).localeCompare(String(a.fecha_inicio)));
  modal(`
    <div class="m-head"><h2>🌴 Vacaciones y permisos · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="stats" style="margin-bottom:8px">
        <div class="stat"><div class="n">${s.anios}</div><div class="l">Años de antigüedad</div></div>
        <div class="stat b"><div class="n">${s.derecho}</div><div class="l">Días por ley (art. 76)</div></div>
        <div class="stat a"><div class="n">${s.gozados}</div><div class="l">Gozados este periodo</div></div>
        <div class="stat g"><div class="n">${s.saldo}</div><div class="l">Saldo disponible</div></div>
      </div>
      <div style="background:var(--blue-bg,#eef3fb);border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:14px;line-height:1.6">
        Alta: <b>${fmtD(iniAntig(w))}</b> · Periodo vigente desde <b>${fmtD(s.aniv)}</b> · <b style="color:var(--accent,#c0392b)">vigencia para gozarlos: antes del ${fmtD(s.vigencia)}</b> (al cumplir el siguiente año se renuevan; estos días no se acumulan).
      </div>
      <div class="sect">Prima vacacional (art. 80 LFT · 25%)</div>
      <div style="background:var(--green-bg,#e8f5ee);border-radius:8px;padding:10px 12px;font-size:12.5px;margin-bottom:8px;line-height:1.8">
        Corresponde: <b>$${money(pr.total)}</b> <span style="color:var(--mut)">(25% × ${pr.derecho} días × $${money(pr.sd)} SD)</span> · Pagado: <b>$${money(pr.pagado)}</b> · <b style="color:${pr.falta>0.005?'var(--accent,#c0392b)':'var(--green)'}">Falta: $${money(pr.falta)}</b>${pr.limite?` · fecha límite: <b>${fmtD(pr.limite)}</b>`:''}
        <button class="btn dark" style="padding:3px 10px;font-size:11px;margin-left:8px" onclick="openPrimaPago('${trabId}')">💵 Registrar pago</button>
      </div>
      ${pr.pagos.length?`<div style="margin-bottom:14px">${pr.pagos.slice().sort((a,b)=>String(b.fecha_pago||'').localeCompare(String(a.fecha_pago||''))).map(p=>`<div class="kv"><b>$${money(p.monto)}</b><span>${fmtD(p.fecha_pago)}${p.notas?' · '+esc(p.notas):''} <button class="btn danger" style="padding:2px 8px;font-size:11px;margin-left:6px" onclick="quitarPrimaPago('${p.id}','${trabId}')">Quitar</button></span></div>`).join('')}</div>`:'<div style="height:6px"></div>'}
      <div class="sect">Registrar periodo</div>
      <div class="grid" style="grid-template-columns:1.4fr 1fr 1fr .6fr">
        <div><label>Tipo</label><select id="vc-tipo" onchange="vcDias()">${['VACACIONES','PERMISO CON GOCE','PERMISO SIN GOCE','INCAPACIDAD'].map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div><label>Del</label><input id="vc-d1" type="date" value="${today()}" onchange="vcDias()"></div>
        <div><label>Al</label><input id="vc-d2" type="date" value="${today()}" onchange="vcDias()"></div>
        <div><label>Días</label><input id="vc-dias" type="number" min="1" value="1"></div>
      </div>
      <div style="margin-top:10px"><label>Notas</label><input id="vc-notas" placeholder="Motivo, folio de incapacidad IMSS..."></div>
      <div class="sect" style="margin-top:18px">Historial (${regs.length})</div>
      ${regs.slice(0,10).map(v=>`<div class="kv"><b>${esc(v.tipo)}</b><span>${fmtD(v.fecha_inicio)} – ${fmtD(v.fecha_fin)} · ${v.dias} día(s) ${v.notas?'· '+esc(v.notas):''} <button class="btn danger" style="padding:2px 8px;font-size:11px;margin-left:6px" onclick="quitarVac('${v.id}','${trabId}')">Quitar</button></span></div>`).join('')||'<div class="kv"><b>—</b><span>Sin registros.</span></div>'}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark" onclick="saveVac('${trabId}')">💾 Registrar</button>
    </div>`,'md');
}
function vcDias(){
  const d1=$('vc-d1').value,d2=$('vc-d2').value,tipo=$('vc-tipo')?$('vc-tipo').value:'';
  if(d1&&d2&&d2>=d1){
    // vacaciones y permisos: días hábiles (lun-sáb). Incapacidad: naturales (IMSS).
    $('vc-dias').value=(tipo==='INCAPACIDAD')
      ?Math.round((new Date(d2+'T12:00')-new Date(d1+'T12:00'))/86400000)+1
      :diasHabilesVac(d1,d2);
  }
}
async function saveVac(trabId){
  const w=WORKERS.find(x=>x.id===trabId);
  const tipo=$('vc-tipo').value, d1=$('vc-d1').value, d2=$('vc-d2').value, dias=parseInt($('vc-dias').value);
  if(!d1||!d2||d2<d1){toast('Revisa las fechas.','err');return;}
  if(!dias||dias<1){toast('Indica los días.','err');return;}
  if(tipo==='VACACIONES'){
    const s=saldoVac(w);
    if(dias>s.saldo&&!confirm(`Está pidiendo ${dias} días y su saldo es ${s.saldo}. ¿Registrar de todos modos?`))return;
  }
  markWrite();
  const {error}=await sb.from('vacaciones').insert({trabajador_id:trabId,obra_id:w.obra_id,tipo,fecha_inicio:d1,fecha_fin:d2,dias,notas:$('vc-notas').value.trim().toUpperCase(),creado_por:USER.email});
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast(`${tipo} registrado: ${dias} día(s).`,'ok');
  await loadObraData(OBRA.id);
}
async function quitarVac(id,trabId){
  if(!confirm('¿Quitar este registro? (queda en el historial)'))return;
  markWrite();
  const {error}=await sb.from('vacaciones').update({activo:false}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast('Registro desactivado.','ok');
  await loadObraData(OBRA.id);
}
/* ---------- PRIMA VACACIONAL: registrar pagos (Script 48) ---------- */
function openPrimaPago(trabId){
  const w=WORKERS.find(x=>x.id===trabId); if(!w)return;
  const pr=primaVac(w);
  modal2(`
    <div class="m-head"><h2>💵 Pago de prima vacacional · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal2()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:10px">Corresponde <b>$${money(pr.total)}</b> (25% × ${pr.derecho} días × $${money(pr.sd)} SD) · pagado <b>$${money(pr.pagado)}</b> · falta <b style="color:var(--accent,#c0392b)">$${money(pr.falta)}</b>. Fecha límite <b>${fmtD(pr.limite)}</b>${pr.periodo?` (periodo ${pr.periodo})`:''}.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Monto del pago</label><input id="pp-monto" type="number" step="0.01" value="${pr.falta>0?pr.falta.toFixed(2):''}"></div>
        <div><label>Fecha del pago</label><input id="pp-fecha" type="date" value="${today()}"></div>
        <div class="c2" style="grid-column:span 2"><label>Notas</label><input id="pp-notas" placeholder="Ej. pagado con nómina S18, transferencia, efectivo..."></div>
      </div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal2()">Cancelar</button><button class="btn dark" onclick="savePrimaPago('${trabId}')">💾 Registrar pago</button></div>`,'md');
}
async function savePrimaPago(trabId){
  const w=WORKERS.find(x=>x.id===trabId); if(!w)return;
  const monto=parseFloat($('pp-monto').value), fecha=$('pp-fecha').value;
  if(!(monto>0)){toast('Indica un monto válido.','err');return;}
  if(!fecha){toast('Indica la fecha del pago.','err');return;}
  const pr=primaVac(w);
  markWrite();
  const {error}=await sb.from('prima_pagos').insert({trabajador_id:trabId,obra_id:w.obra_id,periodo:pr.periodo,monto,fecha_pago:fecha,notas:($('pp-notas').value||'').trim().toUpperCase(),creado_por:USER.email});
  if(error){if(/prima_pagos.*does not exist|relation .*prima_pagos/i.test(error.message||'')){toast('Falta correr el Script 48 (tabla prima_pagos) en Supabase.','err');return;}toast('Error: '+error.message,'err');return;}
  toast('Pago de prima registrado.','ok');
  closeModal2();
  await loadObraData(OBRA.id);
  openVacForm(trabId);
}
async function quitarPrimaPago(id,trabId){
  if(!confirm('¿Quitar este pago de prima? (se puede recuperar en Supabase)'))return;
  markWrite();
  const {error}=await sb.from('prima_pagos').update({activo:false}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  toast('Pago quitado.','ok');
  await loadObraData(OBRA.id);
  openVacForm(trabId);
}
/* ---------- Visualizador de vacaciones + prima POR AÑO (Excel) ---------- */
function exportVacAnio(){
  const anio=vacAnioSel();
  const act=WORKERS.filter(w=>w.estatus==='ACTIVO').slice().sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
  if(!act.length){toast('No hay trabajadores activos.','err');return;}
  const rows=[],styles=[];
  rows.push([`CONTROL DE VACACIONES Y PRIMA ${anio} — ${OBRA.nombre} — ${new Date().toLocaleDateString('es-MX')}`]);styles.push(ST.title);
  rows.push(['NO.','TRABAJADOR','ANTIGÜEDAD','DERECHO','GOZADOS '+anio,'SALDO','VIGENCIA','PRIMA CORRESP.','PAGADO','FALTA','LÍMITE PAGO']);styles.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC];
  act.forEach(w=>{
    const s=saldoVac(w),gz=gozadosEnAnio(w,anio),pr=primaVac(w);
    rows.push([w.no_trab??'',fullName(w),s.anios+' años',s.derecho,gz,s.saldo,fmtD(s.vigencia),pr.total,pr.pagado,pr.falta,fmtD(pr.limite)]);styles.push(rs);
  });
  const ws=buildSheet(rows,styles,[6,28,11,8,12,7,12,13,11,11,12],[{s:{r:0,c:0},e:{r:0,c:10}}],[{hpt:24},{hpt:26}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1+act.length,c:10}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'VACACIONES '+anio);
  dl(wb,`VACACIONES_PRIMA_${anio}_${OBRA.nombre.slice(0,14).replace(/\s+/g,'_')}_${today()}.xlsx`);
  toast('Excel de vacaciones y prima del año generado.','ok');
}
/* ---------- v36: IMPORTAR VACACIONES DESDE EXCEL (control de vacaciones) ----------
   Lee el "CONTROL DE VACACIONES", empareja por RFC y registra los DÍAS GOZADOS
   de cada periodo (todos los bloques del archivo) como registros de vacaciones,
   para que el saldo de la base refleje lo ya gozado. Muestra vista previa y NO
   guarda nada sin confirmar. Evita duplicados: si ya existe un registro del
   mismo trabajador con la misma fecha de inicio importada, lo omite. */
let VACIMP=[];
function openImportVac(){
  modal(`
    <div class="m-head"><h2>⬆ Importar vacaciones (Excel)</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px;font-size:12.5px">Sube el <b>Control de Vacaciones</b>. Empareja a cada quien por <b>RFC</b> y registra sus <b>días gozados</b> de cada periodo (todos los bloques). Verás exactamente qué se va a registrar <b>antes de guardar</b>; a quien no encuentre por RFC te lo listo aparte. Los registros que ya existían no se duplican.</p>
      <div><input type="file" id="vi-file" accept=".xlsx,.xls" onchange="parseImportVac(this)"></div>
      <div id="vi-prev" style="margin-top:14px;max-height:400px;overflow:auto"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark hide" id="vi-btn" onclick="applyImportVac()">💾 Registrar vacaciones seleccionadas</button>
    </div>`,'lg');
}
/* convierte una celda a ISO (Date de xlsx con cellDates, o texto dd/mm/aaaa) */
function celdaAiso(v){
  if(v instanceof Date && !isNaN(v)) return new Date(Date.UTC(v.getFullYear(),v.getMonth(),v.getDate())).toISOString().slice(0,10);
  const s=String(v||'').trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){let y=+m[3]; if(y<100)y+=2000; return `${y}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;}
  return null;
}
const numDe=v=>{const m=String(v??'').match(/-?\d+(\.\d+)?/);return m?Math.round(parseFloat(m[0])):0;};
async function parseImportVac(inp){
  const file=inp.files[0]; if(!file)return;
  $('vi-prev').innerHTML=skeletonRows(6,'1.5fr 1fr 1fr 1fr','Leyendo el control de vacaciones...');
  let wb; try{wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});}catch(e){$('vi-prev').innerHTML='<div class="empty">No pude leer el archivo. ¿Es un Excel válido?</div>';return;}
  // la fila de encabezados REAL es la que contiene "DÍAS GOZADOS" (así no
  // confundimos con el "RFC: XXX" del membrete de la empresa)
  let aoa=null, hIdx=-1;
  for(const sn of wb.SheetNames){
    const a=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:''});
    const hi=a.findIndex(r=>r.some(c=>/D[IÍ]AS\s*GOZADOS/i.test(String(c))));
    if(hi>=0){aoa=a;hIdx=hi;break;}
  }
  if(!aoa){$('vi-prev').innerHTML='<div class="empty">No encontré la fila de encabezados (con "DÍAS GOZADOS").</div>';return;}
  const H=aoa[hIdx].map(c=>String(c).toUpperCase().replace(/\s+/g,' ').trim());
  const iRfc=H.findIndex(h=>/^R\.?\s*F\.?\s*C\.?$/.test(h)||h==='RFC');
  const iNom=H.findIndex(h=>h.includes('NOMBRE DEL TRABAJADOR'));
  // cada bloque de vacaciones: columna DÍAS GOZADOS; su periodo (fecha) está 2 columnas antes
  const golCols=H.map((h,i)=>/D[IÍ]AS GOZADOS/.test(h)?i:-1).filter(i=>i>=0);
  if(iRfc<0||!golCols.length){$('vi-prev').innerHTML='<div class="empty">El archivo no trae columnas R.F.C y DIAS GOZADOS reconocibles.</div>';return;}
  VACIMP=[];
  $('vi-btn').classList.add('hide');
  const {data:allW,error}=await leerPorEmpresa('trabajadores','*',q=>q.eq('eliminado',false));
  if(error){toast('Error al consultar trabajadores: '+error.message,'err');return;}
  const {data:vacAll,error:vacError}=await leerPorEmpresa('vacaciones','id,trabajador_id,fecha_inicio,tipo',q=>q.eq('activo',true));
  if(vacError){toast('No se pudo comprobar si las vacaciones ya existen: '+vacError.message,'err');return;}
  const norm=r=>String(r||'').toUpperCase().replace(/[^A-ZÑ&0-9]/g,'');
  VACIMP=[];
  for(let i=hIdx+1;i<aoa.length;i++){
    const r=aoa[i]; const rfc=norm(r[iRfc]); if(rfc.length<10)continue;
    const nom=String(iNom>=0?r[iNom]||'':'').trim().toUpperCase();
    const w=allW.find(x=>norm(x.rfc)===rfc);
    const periodos=[];
    golCols.forEach(gc=>{
      const goz=numDe(r[gc]); const iso=celdaAiso(r[gc-2]);
      if(goz>0&&iso)periodos.push({iso,goz});
    });
    if(!periodos.length&&w)continue; // trabajador sin gozados que registrar
    if(!periodos.length&&!w)continue;
    // marcar cuáles ya existen (mismo trabajador + misma fecha_inicio)
    periodos.forEach(p=>{p.existe=w&&(vacAll||[]).some(v=>v.trabajador_id===w.id&&String(v.fecha_inicio).slice(0,10)===p.iso&&v.tipo==='VACACIONES');});
    VACIMP.push({rfc,nom,w,periodos,sel:!!w&&periodos.some(p=>!p.existe)});
  }
  if(!VACIMP.length){$('vi-prev').innerHTML='<div class="empty">No encontré filas con RFC y días gozados.</div>';return;}
  renderImportVac();
  $('vi-btn').classList.remove('hide');
}
function renderImportVac(){
  const found=VACIMP.filter(x=>x.w), miss=VACIMP.filter(x=>!x.w);
  const nNuevos=VACIMP.reduce((s,x)=>s+(x.w?x.periodos.filter(p=>!p.existe).length:0),0);
  $('vi-prev').innerHTML=`
    <div style="margin-bottom:8px;font-size:12.5px"><b>${found.length}</b> emparejados por RFC · <b>${nNuevos}</b> registros nuevos por crear · <b>${miss.length}</b> sin encontrar.</div>
    <div class="imp-row head" style="grid-template-columns:26px 2fr 2.4fr"><span></span><span>Trabajador (RFC)</span><span>Periodos a registrar (fecha · días gozados)</span></div>
    ${VACIMP.map((x,i)=>`<div class="imp-row" style="grid-template-columns:26px 2fr 2.4fr;${x.w?'':'background:var(--amber-bg)'}">
      <span>${x.w?`<input type="checkbox" style="width:auto" ${x.sel?'checked':''} onchange="VACIMP[${i}].sel=this.checked">`:''}</span>
      <span><b>${esc(x.w?fullName(x.w):x.nom||'(sin nombre)')}</b><br><span style="color:var(--mut);font-size:11px">${esc(x.rfc)}${x.w?'':' · <b style="color:var(--amber)">RFC no encontrado en la base</b>'}</span></span>
      <span style="font-size:11.5px">${x.periodos.map(p=>`${fmtD(p.iso)} · <b>${p.goz}</b> día(s)${p.existe?' <span style="color:var(--mut)">(ya existe)</span>':''}`).join('<br>')||'—'}</span>
    </div>`).join('')}`;
}
async function applyImportVac(){
  const inserts=[];
  VACIMP.filter(x=>x.sel&&x.w).forEach(x=>{
    x.periodos.filter(p=>!p.existe).forEach(p=>{
      const fin=new Date(p.iso+'T12:00'); fin.setDate(fin.getDate()+Math.max(0,p.goz-1));
      inserts.push({trabajador_id:x.w.id,obra_id:x.w.obra_id,tipo:'VACACIONES',
        fecha_inicio:p.iso,fecha_fin:fin.toISOString().slice(0,10),dias:p.goz,
        notas:`IMPORTADO CONTROL VACACIONES · ${p.goz} días gozados del periodo ${p.iso.slice(0,4)}`,creado_por:USER.email});
    });
  });
  if(!inserts.length){toast('No hay registros nuevos seleccionados (o ya existían todos).','err');return;}
  if(!confirm(`¿Registrar ${inserts.length} periodo(s) de vacaciones gozadas en los expedientes? No se duplican los que ya existían.`))return;
  $('vi-btn').innerHTML='<span class="spin"></span> Registrando...';
  markWrite();
  let ok=0,fail=0;
  for(let k=0;k<inserts.length;k+=100){
    const {error}=await sb.from('vacaciones').insert(inserts.slice(k,k+100));
    if(error)fail+=inserts.slice(k,k+100).length; else ok+=inserts.slice(k,k+100).length;
  }
  closeModal();
  toast(`Vacaciones importadas: ${ok} registro(s)${fail?`, ${fail} con error`:''}.`,fail?'err':'ok');
  await loadObraData(OBRA.id);
}

