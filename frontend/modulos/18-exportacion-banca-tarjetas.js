/* ---------- EXPORTS CONTABLES (SUA / NOI / SIROC) ---------- */
function openExports(){
  modal(`
    <div class="m-head"><h2>🧮 Exports contables · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="kv"><b>Registro patronal</b><span>${esc(OBRA.registro_patronal)||'— (agrégalo con el lápiz ✎ de la obra)'}</span></div>
      <div class="kv"><b>Registro SIROC</b><span>${esc(OBRA.registro_siroc)||'—'}</span></div>
      <p style="color:var(--mut);font-size:12.5px;margin:14px 0">Excel con la hoja <b>Trabajadores NUEVOS</b> y sus claves de puesto para NOI, más el <b>TXT de altas SUA</b>. Conserva las columnas del formato de contabilidad. Verificar en el sistema antes de aplicar.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn dark" onclick="openAltasNOI()">⬇ Concatenar TXT y Excel (NOI + SUA)</button>
      </div>
      <div class="sect" style="margin-top:18px">Portales IMSS (donde se presentan los movimientos)</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" onclick="window.open('https://idse.imss.gob.mx/imss/','_blank')">🏥 IDSE — altas, bajas y modificaciones</button>
        <button class="btn" onclick="window.open('https://serviciosdigitales.imss.gob.mx','_blank')">🖥 Escritorio Virtual IMSS</button>
        <button class="btn" onclick="window.open('https://sipare.imss.gob.mx/','_blank')">💳 SIPARE — línea de captura de cuotas</button>
      </div>
      <p style="color:var(--mut);font-size:12px;margin-top:10px">Flujo: el sistema genera el layout → la contadora lo presenta en IDSE con la e.firma → descarga el acuse PDF → se archiva aquí con 📥 Importar → el estatus IMSS del trabajador se actualiza solo.</p>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'md');
}

/* ---------- IMPORTAR RESPUESTA DEL BANCO (.exp de ancho fijo, 2026-07-31) ----
   El banco contesta la requisición con un archivo .exp de ancho fijo. Cada
   renglón 02 = un trabajador. Se lee, se clasifica (tarjeta creada / ya tiene
   plástico / rebotó y por qué) y se genera el Excel; con un clic también llena
   las cuentas en la base y genera el acuse de recepción (reusa exportAcuseTarjetas).
   Columnas fijas (0-index): CURP[2:20] EMAIL[20:70] TEL[70:80]
   NOMBRES[129:149] AP_PAT[149:169] AP_MAT[169:189] CUENTA[189:199]
   CLABE[215:233] CODE[233:248] DESC[248:300]. */
let IMPEXP=[];
function openImportExp(){
  modal(`
    <div class="m-head"><h2>🏦 Respuesta del banco (.exp) → Excel + acuse</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px">Sube el archivo <b>.exp</b> que devuelve el banco a la requisición. Lo leo, clasifico a cada trabajador (<b>tarjeta creada</b>, <b>ya tiene plástico</b>, o <b>rebotó</b> y por qué) y genero el <b>Excel</b>. Con un clic puedo además <b>llenar las cuentas en la base</b> y generar el <b>acuse de recepción</b> para firmas.</p>
      <div class="grid" style="grid-template-columns:180px 1fr;margin-bottom:12px;align-items:end">
        <div><label>No. de semana (para el acuse)</label><input id="impx-sem" type="number" value="${isoWeek()}"></div>
        <div><input type="file" id="impx-file" accept=".exp,.txt" onchange="parseImportExp(this)"></div>
      </div>
      <div id="impx-prev" style="margin-top:12px;max-height:420px;overflow:auto"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn hide" id="impx-xls" onclick="exportExcelExp()">⬇ Exportar Excel clasificado</button>
      <button class="btn dark hide" id="impx-apply" onclick="applyImportExp()">💾 Llenar cuentas + generar acuse</button>
    </div>`,'lg');
}
function expClasifica(code,desc,ctaOk){
  const d=(desc||'').toUpperCase(); code=(code||'').toUpperCase().trim();
  if(d.includes('PLASTICO')&&d.includes('EXISTENTE')) return {res:'YA TIENE PLÁSTICO',motivo:'Cliente con cuenta y plástico existente'};
  if(d.includes('TARJETA YA')&&d.includes('ASIGNAD')) return {res:'YA TIENE PLÁSTICO',motivo:'La tarjeta ya estaba asignada'};
  if(code==='OK'&&ctaOk&&!d) return {res:'TARJETA CREADA',motivo:''};
  if(code==='OK'&&ctaOk) return {res:'TARJETA CREADA',motivo:desc};
  // rebote — deducir el motivo por palabras clave
  let mot=desc||('Rechazado por el banco'+(code?' ('+code+')':''));
  if(d.includes('CORREO')||d.includes('MAIL')) mot='Rebotó por CORREO — '+desc;
  else if(d.includes('TELEFON')||d.includes('CELULAR')) mot='Rebotó por TELÉFONO — '+desc;
  else if(d.includes('CURP')) mot='Rebotó por CURP — '+desc;
  else if(d.includes('SUCURSAL')||d.includes('CTA BBVA')||d.includes('CUENTA')) mot=desc;
  return {res:'REBOTÓ',motivo:mot};
}
async function parseImportExp(inp){
  IMPEXP=[];
  const file=inp.files[0]; if(!file)return;
  $('impx-prev').innerHTML=skeletonRows(7,'1.4fr 1fr 1fr 1.2fr','Leyendo la respuesta del banco...');
  let txt; try{txt=await file.text();}catch(e){$('impx-prev').innerHTML='<div class="empty">No pude leer el archivo.</div>';return;}
  const lineas=txt.split(/\r?\n/).filter(l=>l.startsWith('02'));
  if(!lineas.length){$('impx-prev').innerHTML='<div class="empty">No encontré registros de detalle (02). ¿Es el archivo .exp que responde el banco?</div>';return;}
  const {data:allW,error}=await leerPorEmpresa('trabajadores','*',q=>q.eq('eliminado',false));
  if(error){toast('Error al consultar trabajadores: '+error.message,'err');return;}
  const base=allW||[];
  IMPEXP=lineas.map(l=>{
    const g=(a,b)=>l.slice(a,b).trim();
    const curp=g(2,20).toUpperCase(), email=g(20,70), tel=g(70,80).replace(/\D/g,'');
    const nombre=[g(129,149),g(149,169),g(169,189)].filter(Boolean).join(' ');
    const ctaRaw=g(189,199).replace(/\D/g,''), clabe=g(215,233).replace(/\D/g,''), code=g(233,248), desc=g(248,300);
    const ctaOk=ctaRaw&&ctaRaw!=='0000000000';
    const clabeOk=RX.clabe.test(clabe);
    const {res,motivo}=expClasifica(code,desc,ctaOk);
    const w=base.find(x=>x.curp===curp);
    return {curp,email,tel,nombre,cta:ctaOk?ctaRaw:'',clabe:clabeOk?clabe:'',clabeOk,code,desc,res,motivo,w};
  });
  renderImportExp();
  $('impx-xls').classList.remove('hide');
  $('impx-apply').classList.toggle('hide',!IMPEXP.some(x=>x.w&&x.clabeOk&&(x.res==='TARJETA CREADA'||x.res==='YA TIENE PLÁSTICO')));
}
function renderImportExp(){
  const cnt=r=>IMPEXP.filter(x=>x.res===r).length;
  const badge=r=>r==='TARJETA CREADA'?'imp-ASIGNAR':(r==='YA TIENE PLÁSTICO'?'imp-COINCIDE':'imp-CONFLICTO');
  $('impx-prev').innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <span class="imp-tag imp-ASIGNAR">CREADAS: ${cnt('TARJETA CREADA')}</span>
      <span class="imp-tag imp-COINCIDE">YA TIENEN PLÁSTICO: ${cnt('YA TIENE PLÁSTICO')}</span>
      <span class="imp-tag imp-CONFLICTO">REBOTARON: ${cnt('REBOTÓ')}</span>
      <span class="imp-tag imp-SINREGISTRO">NO EN LA BASE: ${IMPEXP.filter(x=>!x.w).length}</span>
    </div>
    <div class="imp-row head" style="grid-template-columns:1.6fr .9fr 1.2fr 1.7fr"><span>Trabajador</span><span>Resultado</span><span>Cuenta / CLABE</span><span>Motivo del banco</span></div>
    ${IMPEXP.map(x=>`<div class="imp-row" style="grid-template-columns:1.6fr .9fr 1.2fr 1.7fr">
      <span><b>${esc(x.w?fullName(x.w):(x.nombre||'(no está en la base)'))}</b><br><span style="color:var(--mut);font-size:11px">${esc(x.curp)}</span></span>
      <span class="imp-tag ${badge(x.res)}">${x.res}</span>
      <span>${esc(x.cta)||'—'}<br><span style="color:var(--mut);font-size:11px">${esc(x.clabe)||'—'}</span></span>
      <span style="font-size:11.5px;color:var(--mut)">${esc(x.motivo||'—')}${x.w?'':'<br><span style="color:var(--amber)">CURP no encontrada en la base</span>'}</span>
    </div>`).join('')}`;
}
function exportExcelExp(){
  if(!IMPEXP.length){toast('Primero sube el archivo .exp.','err');return;}
  const rows=[],styles=[];
  rows.push(['RESPUESTA DEL BANCO — TARJETAS DE NÓMINA · '+new Date().toLocaleDateString('es-MX')]); styles.push(ST.title);
  rows.push(['NO.','CURP','NOMBRE (BANCO)','NOMBRE (BASE)','RESULTADO','CUENTA','CLABE','BANCO','TELÉFONO','CORREO','RESOLUCIÓN DEL BANCO','No. TRAB.']); styles.push(ST.head);
  const rs=[ST.cellC,ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cell,ST.cell,ST.cellC];
  IMPEXP.forEach((x,i)=>{
    rows.push([i+1,x.curp,x.nombre,x.w?fullName(x.w):'',x.res,x.cta,x.clabe,x.clabe?(bankFromClabe(x.clabe)||'BBVA'):'',x.tel,x.email,x.desc||x.motivo,x.w?(x.w.no_trab??''):'']);
    styles.push(rs);
  });
  const ws=buildSheet(rows,styles,[5,20,26,26,18,13,20,10,12,30,36,9],[{s:{r:0,c:0},e:{r:0,c:11}}],[{hpt:24},{hpt:26}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1+IMPEXP.length,c:11}})};
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'RESPUESTA BANCO');
  dl(wb,`RESPUESTA_BANCO_TARJETAS_${today()}.xlsx`);
  toast('Excel clasificado generado. También sirve para el importador de cuentas (trae CURP, CUENTA, CLABE).','ok');
}
async function applyImportExp(){
  const conCta=IMPEXP.filter(x=>x.w&&x.clabeOk&&(x.res==='TARJETA CREADA'||x.res==='YA TIENE PLÁSTICO'));
  if(!conCta.length){toast('No hay tarjetas con cuenta/CLABE válida para aplicar.','err');return;}
  if(!confirm(`Se llenará cuenta y CLABE en los trabajadores que estén vacíos o en CREAR (${conCta.length} con cuenta del banco), y se generará el acuse de recepción para firmas.\nA quien ya tenga una cuenta DISTINTA no se le sobrescribe. ¿Continuar?`))return;
  markWrite();
  let ok=0,skip=0,fail=0; const acuse=[];
  for(const x of conCta){
    const base=x.w, baseCta=String(base.cuenta||'').toUpperCase().trim();
    // SOLO se llena si la CUENTA está vacía o en CREAR. NUNCA se reemplaza una
    // cuenta que ya existe (aunque le falte la CLABE): reemplazarla haría rebotar
    // el pago. Si ya tiene cuenta distinta, se cuenta como "skip".
    const vacia=(!base.cuenta||baseCta==='CREAR'||baseCta==='');
    if(vacia){
      const {error}=await sb.from('trabajadores').update({cuenta:x.cta,clabe:x.clabe,banco:bankFromClabe(x.clabe)||'BBVA'}).eq('id',base.id);
      if(error)fail++;else ok++;
    } else if(String(base.cuenta)!==x.cta||String(base.clabe)!==x.clabe){ skip++; }
    acuse.push({nombre:fullName(base),cuenta:x.cta,res:x.motivo||x.res,contratista:base.contratista||''});
  }
  closeModal();
  toast(`Aplicado: ${ok} cuenta(s) llenada(s)${skip?`, ${skip} con cuenta distinta se dejaron intactas`:''}${fail?`, ${fail} con error`:''}.`,fail?'err':'ok');
  if(acuse.length)exportAcuseTarjetas(acuse,$('impx-sem')?$('impx-sem').value:isoWeek());
  await loadObraData(OBRA.id);
}

/* ---------- IMPORTAR CUENTAS (contestación del banco) ---------- */
function openImport(){
  modal(`
    <div class="m-head"><h2>⬆ Importar cuentas — contestación del banco</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:14px">Sube el Excel que contesta Bancomer a la requisición (con columnas CURP, CUENTA y CLABE). Se comparará contra <b>todos los trabajadores</b> y te mostraré exactamente qué se va a llenar <b>antes de guardar nada</b>. Al aplicar, se genera automáticamente el <b>acuse de recepción de tarjetas para firma</b>.</p>
      <div class="grid" style="grid-template-columns:180px 1fr;margin-bottom:12px;align-items:end">
        <div><label>No. de semana (para el acuse)</label><input id="imp-sem" type="number" value="${isoWeek()}"></div>
        <div><input type="file" id="imp-file" accept=".xlsx,.xls" onchange="parseImport(this)"></div>
      </div>
      <div id="imp-prev" style="margin-top:16px;max-height:420px;overflow:auto"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark hide" id="imp-btn" onclick="applyImport()">💾 Aplicar cambios seleccionados</button>
    </div>`,'lg');
}
let IMP=[];
async function parseImport(inp){
  IMP=[];
  const file=inp.files[0]; if(!file)return;
  $('imp-prev').innerHTML=skeletonRows(7,'26px 1.6fr 1.2fr 1.2fr 1fr','Leyendo el archivo de cuentas...');
  const buf=await file.arrayBuffer();
  let wb;
  try{wb=XLSX.read(buf,{type:'array'});}catch(e){$('imp-prev').innerHTML='<div class="empty">No pude leer el archivo. ¿Es un Excel válido?</div>';return;}
  const ws=wb.Sheets[wb.SheetNames[0]];
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
  const hIdx=aoa.findIndex(r=>r.some(c=>String(c).toUpperCase().includes('CURP')));
  if(hIdx<0){$('imp-prev').innerHTML='<div class="empty">No encontré una fila de encabezados con la columna CURP.</div>';return;}
  const H=aoa[hIdx].map(c=>String(c).toUpperCase());
  const col=key=>H.findIndex(h=>h.includes(key));
  const iCurp=col('CURP'), iCta=col('CUENTA'), iClabe=col('CLABE'), iRes=col('RESOLUC'), iNom=col('NOMBRE');
  if(iCta<0&&iClabe<0){$('imp-prev').innerHTML='<div class="empty">El archivo no trae columnas CUENTA ni CLABE.</div>';return;}
  const {data:allW,error}=await leerPorEmpresa('trabajadores','*',q=>q.eq('eliminado',false));
  if(error){toast('Error al consultar trabajadores: '+error.message,'err');return;}
  IMP=[];
  for(let i=hIdx+1;i<aoa.length;i++){
    const r=aoa[i];
    const curp=String(r[iCurp]||'').toUpperCase().replace(/\s/g,'');
    if(!RX.curp.test(curp))continue;
    const cta=String(iCta>=0?r[iCta]||'':'').replace(/\D/g,'');
    const clabe=String(iClabe>=0?r[iClabe]||'':'').replace(/\D/g,'');
    const res=String(iRes>=0?r[iRes]||'':'').trim().toUpperCase();
    const nom=String(iNom>=0?r[iNom]||'':'').trim().toUpperCase();
    if(!cta&&!clabe)continue;
    const w=allW.find(x=>x.curp===curp);
    let estado, sel=false;
    if(!w)estado='SINREGISTRO';
    else if(!w.cuenta||String(w.cuenta).toUpperCase()==='CREAR'){estado='ASIGNAR';sel=true;}
    else if(String(w.cuenta)===cta&&String(w.clabe)===clabe)estado='COINCIDE';
    else estado='CONFLICTO';
    IMP.push({curp,cta,clabe,res,nom,w,estado,sel});
  }
  if(!IMP.length){$('imp-prev').innerHTML='<div class="empty">No encontré filas con CURP válida y cuenta/CLABE.</div>';return;}
  renderImport();
  $('imp-btn').classList.remove('hide');
}
function renderImport(){
  const tag={ASIGNAR:'ASIGNAR',CONFLICTO:'CONFLICTO',COINCIDE:'YA COINCIDE',SINREGISTRO:'SIN REGISTRO'};
  const cnt=e=>IMP.filter(x=>x.estado===e).length;
  $('imp-prev').innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <span class="imp-tag imp-ASIGNAR">ASIGNAR: ${cnt('ASIGNAR')}</span>
      <span class="imp-tag imp-CONFLICTO">CONFLICTO: ${cnt('CONFLICTO')}</span>
      <span class="imp-tag imp-COINCIDE">YA COINCIDEN: ${cnt('COINCIDE')}</span>
      <span class="imp-tag imp-SINREGISTRO">SIN REGISTRO: ${cnt('SINREGISTRO')}</span>
    </div>
    <div class="imp-row head"><span></span><span>Trabajador</span><span>Cuenta / CLABE del banco</span><span>Dato actual en la base</span><span>Acción</span></div>
    ${IMP.map((x,i)=>`
      <div class="imp-row">
        <span>${x.estado==='ASIGNAR'||x.estado==='CONFLICTO'?`<input type="checkbox" style="width:auto" ${x.sel?'checked':''} onchange="IMP[${i}].sel=this.checked">`:''}</span>
        <span><b>${esc(x.w?fullName(x.w):x.nom||'(no está en la base)')}</b><br><span style="color:var(--mut);font-size:11px">${x.curp}</span></span>
        <span>${esc(x.cta)||'—'}<br><span style="color:var(--mut);font-size:11px">${esc(x.clabe)||'—'}</span>${x.res?`<br><span style="color:var(--amber);font-size:11px">${esc(x.res)}</span>`:''}</span>
        <span>${x.w?(esc(x.w.cuenta)||'—')+'<br><span style="color:var(--mut);font-size:11px">'+(esc(x.w.clabe)||'—')+'</span>':'—'}</span>
        <span class="imp-tag imp-${x.estado}">${tag[x.estado]}</span>
      </div>`).join('')}
    <p style="margin-top:10px;font-size:12px;color:var(--mut)">Los <b>ASIGNAR</b> llenan cuenta y CLABE vacías o marcadas CREAR. Los <b>CONFLICTO</b> (dato distinto al actual) solo se sobrescriben si tú los palomeas. Nada más se toca.</p>`;
}
async function applyImport(){
  const sel=IMP.filter(x=>x.sel&&x.w);
  if(!sel.length){toast('No hay filas seleccionadas para aplicar.','err');return;}
  if(!confirm(`¿Aplicar cuenta y CLABE a ${sel.length} trabajador(es)? Cada cambio quedará en el historial y se generará el acuse de recepción para firma.`))return;
  const semAcuse=$('imp-sem')?$('imp-sem').value:isoWeek();
  $('imp-btn').innerHTML='<span class="spin"></span> Aplicando...';
  markWrite();
  let ok=0,fail=0;const aplicados=[];
  for(const x of sel){
    const upd={cuenta:x.cta||x.w.cuenta,clabe:x.clabe||x.w.clabe};
    upd.banco=bankFromClabe(upd.clabe)||'BBVA';
    if(x.res&&x.res.includes('EXISTENTE')&&!(x.w.observaciones||'').includes('EXISTENTE'))
      upd.observaciones=((x.w.observaciones||'')?x.w.observaciones+' | ':'')+'BANCO: '+x.res;
    const {error}=await sb.from('trabajadores').update(upd).eq('id',x.w.id);
    if(error)fail++;else{ok++;aplicados.push({nombre:fullName(x.w),cuenta:upd.cuenta,res:x.res||'',contratista:x.w.contratista||''});}
  }
  closeModal();
  toast(`Importación aplicada: ${ok} actualizados${fail?`, ${fail} con error`:''}.`,fail?'err':'ok');
  if(aplicados.length)exportAcuseTarjetas(aplicados,semAcuse);
  await loadObraData(OBRA.id);
}

/* ---------- ACUSE DE RECEPCIÓN DE TARJETAS (para firma) ---------- */
function exportAcuseTarjetas(lista,sem){
  const AZ={t:{font:{bold:true,sz:16,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'004A87'}},alignment:{horizontal:'center',vertical:'center'}},
    s:{font:{bold:true,sz:12,color:{rgb:'0B2E4F'},name:'Calibri'},fill:{fgColor:{rgb:'EAF3FC'}},alignment:{horizontal:'center',vertical:'center'}},
    l:{font:{sz:10,color:{rgb:'333333'},name:'Calibri'},fill:{fgColor:{rgb:'EAF3FC'}},alignment:{horizontal:'center',vertical:'center',wrapText:true}},
    h:{font:{bold:true,sz:10,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'004A87'}},alignment:{horizontal:'center',vertical:'center'},border:BORD},
    c:{font:{sz:11,name:'Calibri'},border:BORD,alignment:{vertical:'center'}},
    cb:{font:{bold:true,sz:11,name:'Calibri'},border:BORD,alignment:{vertical:'center'}},
    cc:{font:{sz:11,name:'Calibri'},border:BORD,alignment:{horizontal:'center',vertical:'center'}},
    r:{font:{sz:9,color:{rgb:'555555'},name:'Calibri'},border:BORD,alignment:{vertical:'center',wrapText:true}},
    f:{font:{bold:true,sz:11,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'004A87'}},alignment:{horizontal:'center',vertical:'center'}},
    p:{font:{sz:9,color:{rgb:'555555'},name:'Calibri'},fill:{fgColor:{rgb:'EAF3FC'}},alignment:{horizontal:'center',vertical:'center'}}};
  const emp=CFGEMP['empresa_PLATINUM']||{razon:'PLATINUM',rfc:''};

  /* Una hoja de firmas (hoja carta horizontal completa) para un grupo */
  const hojaFirmas=(grupo,titulo)=>{
    const rows=[],styles=[],hs=[];
    rows.push(['ACUSE DE RECIBO — TARJETA DE NÓMINA']); styles.push(AZ.t); hs.push({hpt:36});
    rows.push([`SEMANA ${sem}   |   ${titulo}   |   Fecha de entrega: ______ / ______ / ${new Date().getFullYear()}`]); styles.push(AZ.s); hs.push({hpt:24});
    rows.push(['Por este medio, el trabajador declara haber recibido de conformidad la tarjeta bancaria de nómina correspondiente a la semana indicada.']); styles.push(AZ.l); hs.push({hpt:30});
    rows.push(['#','NOMBRE COMPLETO','NO. DE CUENTA','FIRMA DE CONFORMIDAD','RESOLUCIÓN DEL BANCO']); styles.push(AZ.h); hs.push({hpt:26});
    const hFila=Math.max(30,Math.min(100,Math.floor(412/Math.max(1,grupo.length)))); // llena el alto de la hoja carta
    grupo.forEach((x,i)=>{
      rows.push([i+1,x.nombre,x.cuenta,'',x.res]);
      styles.push([AZ.cc,AZ.cb,AZ.cc,AZ.c,AZ.r]); hs.push({hpt:hFila});
    });
    rows.push([`TOTAL DE TRABAJADORES: ${grupo.length}`]); styles.push(AZ.f); hs.push({hpt:22});
    rows.push([`Documento elaborado por Recursos Humanos  —  ${emp.razon||'PLATINUM'}  |  RFC: ${emp.rfc||''}`]); styles.push(AZ.p); hs.push({hpt:18});
    const merges=[{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}},{s:{r:2,c:0},e:{r:2,c:4}},
      {s:{r:rows.length-2,c:0},e:{r:rows.length-2,c:4}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:4}}];
    const ws=buildSheet(rows,styles,[4.5,38,18,46,32],merges,hs); // (7×138.5+25)/96 = 10.36" — hoja carta horizontal completa
    ws['!pageSetup']={orientation:'landscape',paperSize:1};
    return ws;
  };

  /* v36: UNA HOJA POR CONTRATISTA. Cada contratista firma su propio acuse,
     así se entrega por cuadrilla sin recortar ni volver a capturar nada.
     Si ninguna fila trae contratista, sale una sola hoja como antes. */
  const grupos={};
  lista.forEach(x=>{const c=(x.contratista||'SIN CONTRATISTA').toString().trim().toUpperCase()||'SIN CONTRATISTA';(grupos[c]=grupos[c]||[]).push(x);});
  const nombres=Object.keys(grupos).sort((a,b)=>a.localeCompare(b));
  const wb=XLSX.utils.book_new();

  if(nombres.length>1){
    // Hoja RESUMEN: cuántas tarjetas lleva cada contratista
    const rr=[],ss=[];
    rr.push([`ACUSE DE TARJETAS — SEMANA ${sem} — ${OBRA.nombre}`]); ss.push(ST.title);
    rr.push([`Generado el ${new Date().toLocaleDateString('es-MX')} · una hoja de firmas por contratista`]); ss.push([ST.sub]);
    rr.push(['CONTRATISTA','TARJETAS','TARJETAS NUEVAS','YA TENÍAN CUENTA']); ss.push(ST.head);
    nombres.forEach(c=>{
      const g=grupos[c];
      rr.push([c,g.length,
        g.filter(x=>!/EXISTENTE|YA TEN/i.test(x.res||'')).length,
        g.filter(x=>/EXISTENTE|YA TEN/i.test(x.res||'')).length]);
      ss.push([ST.cell,ST.cellC,ST.cellC,ST.cellC]);
    });
    rr.push(['TOTAL',lista.length,'','']); ss.push([ST.total,ST.total,ST.total,ST.total]);
    const wsR=buildSheet(rr,ss,[38,12,17,18],[{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:1,c:0},e:{r:1,c:3}}],[{hpt:26},{hpt:16},{hpt:24}]);
    XLSX.utils.book_append_sheet(wb,wsR,'RESUMEN');
  }

  const usados=new Set(['RESUMEN']);
  nombres.forEach(c=>{
    // Excel: máx. 31 caracteres y sin : \ / ? * [ ]
    let nom=c.replace(/[\\\/\?\*\[\]:]/g,' ').replace(/\s+/g,' ').trim().slice(0,31)||'CONTRATISTA';
    let n=2; while(usados.has(nom)){const suf=' ('+n+')'; nom=nom.slice(0,31-suf.length)+suf; n++;}
    usados.add(nom);
    XLSX.utils.book_append_sheet(wb,hojaFirmas(grupos[c],c),nom);
  });

  dl(wb,`ACUSE_TARJETAS_SEMANA${sem}_${today()}.xlsx`);
  toast(`Acuse generado: ${lista.length} tarjeta(s) en ${nombres.length} hoja(s) — una por contratista. Imprimir en hoja carta HORIZONTAL.`,'ok');
}

