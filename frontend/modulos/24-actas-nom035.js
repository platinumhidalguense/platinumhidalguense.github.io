/* ---------- ACTAS ADMINISTRATIVAS ---------- */
function renderActasView(){
  if(!$('actas-tbody'))return;
  const q=($('actas-q').value||'').trim().toUpperCase();
  let rows=ACTAS.filter(a=>a.activo!==false).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  if(q)rows=rows.filter(a=>{const w=WORKERS.find(x=>x.id===a.trabajador_id);return (w?fullName(w):'').toUpperCase().includes(q)||a.tipo.includes(q)||String(a.motivo).toUpperCase().includes(q);});
  const mes=today().slice(0,7);
  $('actas-stats').innerHTML=`
    <div class="stat r"><div class="n">${ACTAS.filter(a=>a.activo!==false&&a.tipo==='ACTA ADMINISTRATIVA').length}</div><div class="l">Actas administrativas</div></div>
    <div class="stat a"><div class="n">${ACTAS.filter(a=>a.activo!==false&&a.tipo!=='ACTA ADMINISTRATIVA').length}</div><div class="l">Amonestaciones / llamadas</div></div>
    <div class="stat b"><div class="n">${ACTAS.filter(a=>a.activo!==false&&String(a.fecha).slice(0,7)===mes).length}</div><div class="l">Este mes</div></div>`;
  $('actas-tbody').innerHTML=rows.map(a=>{
    const w=WORKERS.find(x=>x.id===a.trabajador_id);
    return `<tr onclick="generarActaDoc('${a.id}')">
      <td>${fmtD(a.fecha)}</td><td><b>${esc(w?fullName(w):'—')}</b></td>
      <td><span class="badge ${a.tipo==='ACTA ADMINISTRATIVA'?'BAJA':(a.tipo==='SUSPENSION'?'PENDIENTE':'ENTREGADO')}">${esc(a.tipo)}</span></td>
      <td>${esc(a.motivo)}</td><td>${esc(a.sancion)||'—'}</td><td>${esc(a.creado_por)}</td>
      <td><button class="btn" style="padding:3px 10px;font-size:11.5px" onclick="event.stopPropagation();generarActaDoc('${a.id}')">🖨</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="7"><div class="empty"><div class="big">📋</div>Sin actas registradas. Usa ＋ Nueva acta.</div></td></tr>';
}
function openActaForm(trabId){
  const w=trabId?WORKERS.find(x=>x.id===trabId):null;
  modal(`
    <div class="m-head"><h2>📋 Nueva acta / amonestación</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="c2" style="grid-column:span 2"><label>Trabajador *</label><input id="ac-trab" list="dl-trab-actas" value="${esc(w?fullName(w):'')}">
          <datalist id="dl-trab-actas">${WORKERS.map(x=>`<option>${esc(fullName(x))}</option>`).join('')}</datalist></div>
        <div><label>Tipo *</label><select id="ac-tipo">${['LLAMADA DE ATENCION','AMONESTACION ESCRITA','ACTA ADMINISTRATIVA','SUSPENSION'].map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div><label>Fecha de los hechos</label><input id="ac-fecha" type="date" value="${today()}"></div>
        <div class="c2" style="grid-column:span 2"><label>Motivo (breve) *</label><input id="ac-motivo" placeholder="FALTAS INJUSTIFICADAS, ABANDONO DE ÁREA, INDISCIPLINA..."></div>
        <div class="c2" style="grid-column:span 2"><label>Descripción de los hechos</label><textarea id="ac-desc" rows="4" placeholder="Narración clara: qué pasó, dónde, cuándo, quién lo presenció..."></textarea></div>
        <div class="c2" style="grid-column:span 2"><label>Sanción aplicada (si la hay)</label><input id="ac-sancion" placeholder="AMONESTACIÓN, SUSPENSIÓN 1 DÍA SIN GOCE (ART. 423 LFT)..."></div>
        <div><label>Testigo 1</label><input id="ac-t1"></div>
        <div><label>Testigo 2</label><input id="ac-t2"></div>
      </div>
      <p style="margin-top:10px;font-size:12px;color:var(--mut)">Se guarda en el expediente y se genera el documento para firmas (trabajador, empresa y 2 testigos). Si el trabajador se niega a firmar, los testigos dan fe.</p>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="saveActa()">💾 Guardar y generar</button>
    </div>`,'md');
}
async function saveActa(){
  const nom=$('ac-trab').value.trim().toUpperCase();
  const w=WORKERS.find(x=>fullName(x).toUpperCase()===nom);
  if(!w){toast('Selecciona un trabajador válido de la lista.','err');return;}
  if(!$('ac-motivo').value.trim()){toast('Indica el motivo.','err');return;}
  markWrite();
  const rec={trabajador_id:w.id,obra_id:w.obra_id,tipo:$('ac-tipo').value,fecha:$('ac-fecha').value||today(),
    motivo:$('ac-motivo').value.trim().toUpperCase(),descripcion:$('ac-desc').value.trim(),
    sancion:$('ac-sancion').value.trim().toUpperCase(),testigo1:$('ac-t1').value.trim().toUpperCase(),testigo2:$('ac-t2').value.trim().toUpperCase(),creado_por:USER.email};
  const {data,error}=await sb.from('actas').insert(rec).select();
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast('Acta guardada. Generando documento...','ok');
  await loadObraData(OBRA.id);
  if(data&&data[0])setTimeout(()=>generarActaDoc(data[0].id),300);
}
function generarActaDoc(actaId){
  const a=ACTAS.find(x=>x.id===actaId); if(!a)return;
  const w=WORKERS.find(x=>x.id===a.trabajador_id);
  const cc=cartaCfg();
  const empKey=empresaDeTrabajador(w);
  const e=CFGEMP['empresa_'+empKey]||{razon:'COMERCIALIZADORA PLATINUM HIDALGUENSE'};
  const fmtL=d=>{const x=new Date(d+'T12:00');return `${x.getDate()} de ${MES[x.getMonth()].toLowerCase()} de ${x.getFullYear()}`;};
  const F=v=>v&&String(v).trim()?esc(String(v).trim()):'<span style="background:#fff3b0">____________</span>';
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(a.tipo)} ${esc(w?fullName(w):'')}</title>
  <style>body{font-family:'Times New Roman',serif;font-size:13px;line-height:1.65;color:#111;max-width:700px;margin:40px auto;padding:0 34px;text-align:justify}
  h1{font-size:15px;text-align:center;letter-spacing:1px}
  .fecha{text-align:right;margin:18px 0}
  .firmas{display:flex;justify-content:space-between;gap:26px;margin-top:70px;text-align:center}
  .firmas div{flex:1;border-top:1px solid #111;padding-top:6px;font-size:11px}
  .campo{min-height:56px;border:1px solid #999;border-radius:4px;padding:8px;margin:6px 0}
  @media print{body{margin:10mm auto}}</style></head><body>
  <h1>${esc(a.tipo)}</h1>
  <div class="fecha">${esc(cc.lugar)}, a ${fmtL(a.fecha)}</div>
  <p>En las instalaciones de la obra <b>${esc(OBRA.nombre)}</b>, de la empresa <b>${esc(e.razon)}</b>, se levanta la presente <b>${esc(a.tipo)}</b> al trabajador <b>${esc(w?fullName(w):'')}</b>${w&&w.puesto?`, quien desempeña el puesto de <b>${esc(w.puesto)}</b>`:''}${w&&w.nss?`, con NSS ${esc(w.nss)}`:''}, por el siguiente motivo:</p>
  <p><b>MOTIVO:</b> ${F(a.motivo)}</p>
  <p><b>DESCRIPCIÓN DE LOS HECHOS:</b> ${a.descripcion?esc(a.descripcion):'<span style="background:#fff3b0">(describir los hechos)</span>'}</p>
  <p><b>DECLARACIÓN DEL TRABAJADOR</b> (uso exclusivo del trabajador):</p>
  <div class="campo">&nbsp;</div>
  ${a.sancion?`<p><b>SANCIÓN APLICADA:</b> ${esc(a.sancion)}, con fundamento en el Reglamento Interior de Trabajo y los artículos 134 y 423 fracción X de la Ley Federal del Trabajo.</p>`:'<p>La presente se levanta como constancia de los hechos, exhortando al trabajador a cumplir con las obligaciones que le imponen el artículo 134 de la Ley Federal del Trabajo y el Reglamento Interior de Trabajo.</p>'}
  <p>Se hace constar que el trabajador fue escuchado en relación con los hechos y se le entrega copia de la presente. La reincidencia podrá dar lugar a sanciones mayores, incluida la rescisión de la relación laboral sin responsabilidad para el patrón (artículo 47 LFT), según la gravedad.</p>
  <div class="firmas">
    <div><b>EL TRABAJADOR</b><br><br><br>${esc(w?fullName(w):'')}</div>
    <div><b>POR LA EMPRESA</b><br><br><br>${F('')}</div>
  </div>
  <div class="firmas">
    <div><b>TESTIGO</b><br><br><br>${F(a.testigo1)}</div>
    <div><b>TESTIGO</b><br><br><br>${F(a.testigo2)}</div>
  </div>
  <p style="font-size:10px;color:#555;margin-top:26px">Documento generado por la Base de Trabajadores PLATINUM el ${new Date().toLocaleDateString('es-MX')}. Registro interno con folio ${esc(String(a.id).slice(0,8)).toUpperCase()}.</p>
  <script>window.onload=()=>window.print()<\/script></body></html>`;
  const win=window.open('','_blank');
  if(!win){toast('Permite ventanas emergentes.','err');return;}
  win.document.write(html);win.document.close();
}

/* ---------- NOM-035 ---------- */
function nomNivel(guia,p){
  if(p==null||p==='')return '';
  p=Number(p);
  if(guia.startsWith('GUIA II'))return p<20?'NULO':p<45?'BAJO':p<70?'MEDIO':p<90?'ALTO':'MUY ALTO';
  if(guia.startsWith('GUIA III'))return p<50?'NULO':p<75?'BAJO':p<100?'MEDIO':p<140?'ALTO':'MUY ALTO';
  return '';
}
function renderNomView(){
  if(!$('nom-tbody'))return;
  const act=WORKERS.filter(w=>w.estatus==='ACTIVO');
  const regs=NOM.filter(n=>n.activo!==false);
  const evaluados=new Set(regs.map(n=>n.trabajador_id));
  const altos=regs.filter(n=>['ALTO','MUY ALTO'].includes(n.resultado)||n.requiere_atencion);
  const pct=act.length?Math.round(act.filter(w=>evaluados.has(w.id)).length/act.length*100):0;
  $('nom-stats').innerHTML=`
    <div class="stat b"><div class="n">${pct}%</div><div class="l">Plantilla activa evaluada</div></div>
    <div class="stat g"><div class="n">${regs.length}</div><div class="l">Cuestionarios registrados</div></div>
    <div class="stat r"><div class="n">${altos.length}</div><div class="l">Riesgo alto / requieren atención</div></div>
    <div class="stat a"><div class="n">${act.filter(w=>!evaluados.has(w.id)).length}</div><div class="l">Activos sin evaluar</div></div>`;
  const q=($('nom-q').value||'').trim().toUpperCase();
  let rows=regs.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  if(q)rows=rows.filter(n=>{const w=WORKERS.find(x=>x.id===n.trabajador_id);return (w?fullName(w):'').toUpperCase().includes(q);});
  const BAD={'NULO':'ENTREGADO','BAJO':'ENTREGADO','MEDIO':'PENDIENTE','ALTO':'BAJA','MUY ALTO':'BAJA','REQUIERE VALORACION':'BAJA','NO REQUIERE':'ENTREGADO'};
  $('nom-tbody').innerHTML=rows.map(n=>{
    const w=WORKERS.find(x=>x.id===n.trabajador_id);
    return `<tr>
      <td>${fmtD(n.fecha)}</td><td><b>${esc(w?fullName(w):'—')}</b></td>
      <td>${esc(n.guia)}</td><td>${n.puntaje??'—'}</td>
      <td><span class="badge ${BAD[n.resultado]||'PENDIENTE'}">${esc(n.resultado)}</span></td>
      <td>${n.requiere_atencion?'⚠️ SÍ':'—'}</td><td>${esc(n.notas)}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="7"><div class="empty"><div class="big">🧠</div>Sin evaluaciones registradas. La NOM-035 es obligatoria con más de 50 trabajadores por centro.</div></td></tr>';
}
function openNomForm(){
  modal(`
    <div class="m-head"><h2>🧠 Registrar cuestionario NOM-035</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="c2" style="grid-column:span 2"><label>Trabajador *</label><input id="nm-trab" list="dl-trab-nom">
          <datalist id="dl-trab-nom">${WORKERS.filter(w=>w.estatus==='ACTIVO').map(x=>`<option>${esc(fullName(x))}</option>`).join('')}</datalist></div>
        <div class="c2" style="grid-column:span 2"><label>Guía aplicada</label><select id="nm-guia" onchange="nmCalc()">${['GUIA II (FACTORES DE RIESGO)','GUIA III (ENTORNO ORGANIZACIONAL)','GUIA I (ACONTECIMIENTOS TRAUMATICOS)'].map(g=>`<option>${g}</option>`).join('')}</select></div>
        <div><label>Fecha de aplicación</label><input id="nm-fecha" type="date" value="${today()}"></div>
        <div><label>Puntaje total</label><input id="nm-punt" type="number" min="0" oninput="nmCalc()"></div>
        <div><label>Resultado</label><select id="nm-res">${['NULO','BAJO','MEDIO','ALTO','MUY ALTO','REQUIERE VALORACION','NO REQUIERE'].map(r=>`<option>${r}</option>`).join('')}</select></div>
        <div><label>¿Requiere atención clínica?</label><select id="nm-at"><option value="NO">No</option><option value="SI">Sí</option></select></div>
        <div class="c2" style="grid-column:span 2"><label>Notas</label><input id="nm-notas" placeholder="Dominio con mayor puntaje, seguimiento acordado..."></div>
      </div>
      <p id="nm-hint" style="margin-top:10px;font-size:12px;color:var(--mut)">Guía II (a trabajadores, centros de 16-50; en centros >50 se aplica a una muestra o a todos): Nulo &lt;20 · Bajo 20-44 · Medio 45-69 · Alto 70-89 · Muy alto ≥90. Guía III (>50 trabajadores): Nulo &lt;50 · Bajo 50-74 · Medio 75-99 · Alto 100-139 · Muy alto ≥140. Guía I detecta acontecimientos traumáticos severos (requiere/no requiere valoración).</p>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="saveNom()">💾 Registrar</button>
    </div>`,'md');
}
function nmCalc(){
  const g=$('nm-guia').value, p=$('nm-punt').value;
  const r=nomNivel(g,p);
  if(r)$('nm-res').value=r;
}
async function saveNom(){
  const nom=$('nm-trab').value.trim().toUpperCase();
  const w=WORKERS.find(x=>fullName(x).toUpperCase()===nom);
  if(!w){toast('Selecciona un trabajador válido.','err');return;}
  markWrite();
  const {error}=await sb.from('nom035').insert({trabajador_id:w.id,obra_id:w.obra_id,guia:$('nm-guia').value,
    fecha:$('nm-fecha').value||today(),puntaje:$('nm-punt').value?parseFloat($('nm-punt').value):null,
    resultado:$('nm-res').value,requiere_atencion:$('nm-at').value==='SI',notas:$('nm-notas').value.trim().toUpperCase(),creado_por:USER.email});
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast('Evaluación NOM-035 registrada.','ok');
  await loadObraData(OBRA.id);
}
function exportNom(){
  const regs=NOM.filter(n=>n.activo!==false);
  if(!regs.length){toast('Sin evaluaciones que exportar.','err');return;}
  const rows=[],styles=[];
  rows.push([`REGISTRO NOM-035-STPS — ${OBRA.nombre} — ${new Date().toLocaleDateString('es-MX')}`]); styles.push(ST.title);
  rows.push(['FECHA','TRABAJADOR','NSS','GUIA','PUNTAJE','RESULTADO','REQUIERE ATENCION','NOTAS']); styles.push(ST.head);
  regs.forEach(n=>{const w=WORKERS.find(x=>x.id===n.trabajador_id);
    rows.push([fmtD(n.fecha),w?fullName(w):'',w?w.nss:'',n.guia,n.puntaje??'',n.resultado,n.requiere_atencion?'SI':'NO',n.notas]);
    styles.push([ST.cellC,ST.cell,ST.cellC,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.cell]);});
  const ws=buildSheet(rows,styles,[11,34,13,30,9,14,16,26],[{s:{r:0,c:0},e:{r:0,c:7}}],[{hpt:26},{hpt:24}]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'NOM-035');
  dl(wb,`NOM035_${OBRA.nombre.slice(0,16).replace(/\s+/g,'_')}_${today()}.xlsx`);
  toast('Registro NOM-035 exportado (evidencia para inspección STPS).','ok');
}

