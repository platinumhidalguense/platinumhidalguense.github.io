/* ---------- SOLICITUD DE EMPLEO (FORMATO GENERAL, SIN GUARDAR DATOS) ---------- */
function solicitudEmpleoHTML(codigo,empresa){
  const logo=logoEmpresa(codigo),razon=empresa.razon||EMPRESAS[codigo]?.nombre||'';
  const campo=(id,etiqueta,tipo='text')=>`<label class="campo" for="se-${id}"><span>${etiqueta}</span><input id="se-${id}" type="${tipo}" autocomplete="off" aria-label="${etiqueta}"></label>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Solicitud de empleo · ${esc(razon)}</title><style>
    @page{size:letter;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#e9edf2;color:#172033;font-family:Arial,Helvetica,sans-serif}.hoja{width:215.9mm;height:279.4mm;margin:10mm auto;padding:13mm 15mm 12mm;background:#fff;display:flex;flex-direction:column;box-shadow:0 3px 20px #9da8b8}.head{display:flex;align-items:center;justify-content:space-between;gap:9mm;border-bottom:2px solid #193659;padding-bottom:4mm;min-height:26mm}.head img{width:42mm;height:19mm;object-fit:contain}.empresa{text-align:right;font-size:9pt;line-height:1.3;overflow-wrap:anywhere;max-width:118mm}.empresa b{font-size:10pt;color:#193659}.titulo{text-align:center;margin:7mm 0 7mm;font-size:17pt;letter-spacing:1px;color:#193659}.grupo{display:flex;flex-direction:column;flex:1;min-height:0}.grupo.beneficiario{flex:.55}.grupo h2{font-size:10pt;letter-spacing:.8px;text-transform:uppercase;color:#193659;background:#edf2f7;border-left:3px solid #193659;margin:0 0 4mm;padding:2.5mm 3mm}.fila{display:grid;grid-template-columns:1fr 1fr;gap:5mm;flex:1;min-height:0;margin-bottom:5mm}.fila.una{grid-template-columns:1fr}.campo{display:flex;flex-direction:column;justify-content:space-between;min-width:0;border:1px solid #cbd5df;border-radius:3px;padding:3.5mm 4mm 4mm;font-size:9.5pt;font-weight:700;color:#193659}.campo input{display:block;width:100%;height:12mm;border:0;border-bottom:1px solid #71839b;border-radius:0;background:transparent;outline:none;color:#172033;font:normal 12pt Arial,Helvetica,sans-serif;padding:1mm 0}.campo input:focus{border-bottom:2px solid #193659}.no-print{position:fixed;right:18px;top:18px;padding:11px 16px;border:0;border-radius:7px;background:#193659;color:#fff;font-weight:700;cursor:pointer}@media print{html,body{background:#fff}.hoja{margin:0;box-shadow:none}.no-print{display:none}}
    .aviso-solicitud{flex:0 0 auto;margin:0;padding:2.5mm 0 0;border-top:1px solid #a9b7c7;color:#46566a;font-size:7.5pt;line-height:1.3}
  </style></head><body><button class="no-print" onclick="window.print()">Imprimir / Guardar PDF</button><main class="hoja">
    <header class="head"><img src="${logo}" alt="${esc(codigo)}"><div class="empresa"><b>${esc(razon)}</b><br>RFC ${esc(empresa.rfc||'')}<br>${esc(empresa.domicilio||'')}</div></header>
    <h1 class="titulo">SOLICITUD DE EMPLEO</h1>
    <section class="grupo"><h2>Datos de la persona solicitante</h2>
      <div class="fila una">${campo('nombre','Nombre completo')}</div>
      <div class="fila">${campo('puesto','Puesto')}${campo('contratista','Contratista')}</div>
      <div class="fila">${campo('telefono','Número telefónico','tel')}${campo('correo','Correo electrónico','email')}</div>
      <div class="fila">${campo('estado-civil','Estado civil')}${campo('escolaridad','Escolaridad')}</div>
    </section>
    <section class="grupo beneficiario"><h2>Datos del beneficiario</h2>
      <div class="fila una">${campo('beneficiario-nombre','Nombre completo')}</div>
      <div class="fila">${campo('parentesco','Parentesco')}${campo('beneficiario-telefono','Número telefónico','tel')}</div>
    </section>
    <p class="aviso-solicitud"><b>Privacidad.</b> ${esc(razon)} tratará estos datos para evaluar la solicitud, contactar a la persona solicitante y, solo si procede la contratación, integrar su expediente. El estado civil y los datos del beneficiario no deben utilizarse para decidir la contratación; pueden proporcionarse al formalizar la relación. Antes de llenar o recibir este formato, entregue a la persona solicitante el aviso de privacidad integral impreso o permita consultarlo en la sección “Aviso de privacidad” de PLATINUM OS. Dudas y derechos ARCO: rh@platinumhidalguense.com.mx.</p>
  </main></body></html>`;
}
function openSolicitudEmpleo(){
  const codigo=OBRA?empresaDeObra(OBRA):EMPRESA_ACTIVA;
  const cfg=CFGEMP['empresa_'+codigo]||{};
  const empresa={razon:cfg.razon||EMPRESAS[codigo]?.nombre||'',rfc:cfg.rfc||'',domicilio:cfg.domicilio||''};
  const win=window.open('','_blank');
  if(!win){toast('Permite ventanas emergentes para abrir la solicitud de empleo.','err');return;}
  win.document.write(solicitudEmpleoHTML(codigo,empresa));win.document.close();
}

/* ---------- CONSTANCIAS LABORALES (LFT ART. 132, VII Y VIII) ---------- */
function clFechaLarga(v){
  if(!v)return '—';
  const d=new Date(String(v).slice(0,10)+'T12:00:00');
  return `${d.getDate()} de ${MES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
}
function clError(e){
  const m=(e&&e.message)||String(e||'');
  if(/constancias_laborales|schema cache|does not exist|could not find/i.test(m))
    return 'Falta aplicar la migración 81_CONSTANCIAS_LABORALES.sql en Supabase.';
  return m;
}
function clSalarioSugerido(w,periodicidad){
  if(periodicidad==='DIARIO')return Number(w.sd)||0;
  if(periodicidad==='SEMANAL')return Number(w.sal_semanal)||0;
  if(periodicidad==='QUINCENAL'&&w.periodo_pago==='QUINCENAL')return Number(w.sal_semanal)||0;
  return 0;
}
function openConstanciaLaboral(id){
  const w=WORKERS.find(x=>x.id===id);if(!w)return;
  const obra=OBRAS.find(o=>o.id===w.obra_id)||OBRA;
  const codigo=empresaDeTrabajador(w),e=CFGEMP['empresa_'+codigo]||{};
  const desde=iniAntig(w)||w.fecha_alta||today();
  const hasta=w.estatus==='BAJA'?(w.fecha_baja||today()):'';
  const cargo=e.repCargo||e.cargoRepresentante||'';
  modal(`
    <div class="m-head"><h2>📜 Constancia laboral · ${esc(fullName(w))}</h2><span class="badge ${esc(codigo)}">${esc(codigo)}</span><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="display:flex;align-items:center;gap:14px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:14px;background:var(--blue-bg)">
        <img src="${logoEmpresa(codigo)}" alt="${esc(codigo)}" style="width:92px;height:46px;object-fit:contain;background:#fff;border-radius:7px;padding:4px">
        <div><b>${esc(e.razon||razonSocialEmpresa(codigo))}</b><div style="font-size:11.5px;color:var(--mut)">RFC ${esc(e.rfc||'SIN CAPTURAR')} · ${esc(obra.nombre)}</div><div style="font-size:11px;color:var(--mut)">La razón social se fija por el centro de trabajo y no puede cambiarse aquí.</div></div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="c2" style="grid-column:span 2"><label>Tipo de constancia</label><select id="cl-tipo" onchange="clTipoChange('${id}')"><option value="SERVICIOS">Constancia de servicios · LFT 132, fracción VIII</option><option value="DIAS_SALARIO">Constancia de días trabajados y salario · LFT 132, fracción VII</option></select></div>
        <div class="c2" style="grid-column:span 2"><label>Destinatario</label><input id="cl-dest" maxlength="180" value="A QUIEN CORRESPONDA"></div>
        <div><label>Lugar de expedición</label><input id="cl-lugar" maxlength="180" value="${esc(e.domicilio||obra.ubicacion||'PACHUCA DE SOTO, HIDALGO')}"></div>
        <div><label>Fecha de expedición</label><input id="cl-fecha" type="date" max="${today()}" value="${today()}"></div>
        <div><label>Periodo desde</label><input id="cl-desde" type="date" value="${desde}"></div>
        <div><label>Periodo hasta <span style="font-weight:400;color:var(--mut)">(vacío = relación vigente)</span></label><input id="cl-hasta" type="date" value="${hasta}"></div>
        <div id="cl-dias-box" style="display:none"><label>Días efectivamente trabajados en el periodo</label><input id="cl-dias" type="number" min="0" step="1" placeholder="Captura y confirma contra asistencia/nómina"></div>
        <div><label>Periodicidad del salario</label><select id="cl-periodicidad" onchange="clCambiarPeriodicidad('${id}')"><option>DIARIO</option><option>SEMANAL</option><option>QUINCENAL</option><option>MENSUAL</option></select></div>
        <div><label>Salario que aparecerá</label><input id="cl-salario" type="number" min="0" step="0.01" value="${Number(w.sd||0).toFixed(2)}"></div>
        <div class="c2" style="grid-column:span 2"><label>Finalidad informada por la persona trabajadora (opcional)</label><input id="cl-proposito" maxlength="300" placeholder="Ej. trámite de arrendamiento, crédito o expediente personal"></div>
        <div><label>Nombre de quien firma</label><input id="cl-firmante" maxlength="180" value="${esc(e.representante||'')}" placeholder="Nombre de la persona facultada"></div>
        <div><label>Cargo de quien firma</label><input id="cl-cargo" maxlength="180" value="${esc(cargo)}" placeholder="Ej. REPRESENTANTE LEGAL"></div>
      </div>
      <div style="margin-top:13px;border:1px solid var(--border);border-radius:9px;padding:10px 12px">
        <b style="font-size:12px">Datos que se incluirán</b>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:12px">
          <label style="display:flex;gap:6px;align-items:center"><input id="cl-inc-func" type="checkbox" ${w.funciones?'checked':''}> Funciones</label>
          <label style="display:flex;gap:6px;align-items:center"><input id="cl-inc-sal" type="checkbox"> Salario</label>
          <label style="display:flex;gap:6px;align-items:center"><input id="cl-inc-curp" type="checkbox" ${w.curp?'':'disabled'}> CURP</label>
          <label style="display:flex;gap:6px;align-items:center"><input id="cl-inc-rfc" type="checkbox" ${w.rfc?'':'disabled'}> RFC personal</label>
          <label style="display:flex;gap:6px;align-items:center"><input id="cl-inc-nss" type="checkbox" ${w.nss?'':'disabled'}> NSS</label>
        </div>
        <div style="font-size:11px;color:var(--mut);margin-top:7px">Por privacidad, CURP, RFC, NSS y salario se omiten salvo que la finalidad de la solicitud los requiera. En la modalidad de días y salario, el salario es obligatorio.</div>
      </div>
      <label style="display:flex;align-items:flex-start;gap:8px;margin-top:12px;padding:10px;background:var(--amber-bg);border:1px solid #ecd9a0;border-radius:8px;font-size:12px"><input id="cl-confirma" type="checkbox" style="margin-top:2px"> <span>Confirmo que la persona trabajadora solicitó la constancia, que los datos seleccionados son necesarios para la finalidad indicada y que días/salario fueron verificados contra los registros de nómina y asistencia.</span></label>
      <details style="margin-top:12px;font-size:11.5px;color:var(--mut)"><summary style="cursor:pointer;font-weight:700;color:var(--navy)">? Cómo usar esta función</summary><div style="padding:8px 2px">Elige la modalidad, verifica el periodo y la persona facultada para firmar. La emisión genera folio y código de verificación, guarda una copia inalterable y abre la impresión; selecciona “Guardar como PDF” o imprime para firma autógrafa. Si hubo un error, corrígelo emitiendo otra constancia: el historial no se borra.</div></details>
      <div class="sect">Historial de constancias emitidas</div>
      <div id="cl-hist"><span class="spin"></span> Consultando historial…</div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cancelar</button><button id="cl-emitir" class="btn dark" onclick="emitirConstanciaLaboral('${id}')">📜 Emitir, guardar e imprimir</button></div>`,'lg');
  cargarHistConstancias(id,obra.id);
}
function clTipoChange(){
  const dias=$('cl-tipo').value==='DIAS_SALARIO';
  $('cl-dias-box').style.display=dias?'block':'none';
  $('cl-inc-sal').checked=dias;
  $('cl-inc-sal').disabled=dias;
  if(dias&&!$('cl-hasta').value)$('cl-hasta').value=today();
}
function clCambiarPeriodicidad(id){
  const w=WORKERS.find(x=>x.id===id);if(!w)return;
  const v=clSalarioSugerido(w,$('cl-periodicidad').value);
  $('cl-salario').value=v?v.toFixed(2):'';
}
async function cargarHistConstancias(tid,obraId){
  const box=$('cl-hist');if(!box)return;
  const {data,error}=await sb.from('constancias_laborales').select('id,folio,tipo_constancia,fecha_expedicion,destinatario,firmante_nombre,emitida_por_email,emitida_en,codigo_verificacion').eq('trabajador_id',tid).eq('obra_id',obraId).order('emitida_en',{ascending:false}).limit(50);
  if(!box)return;
  if(error){box.innerHTML=`<div style="color:var(--red);font-size:12px">${esc(clError(error))}</div>`;return;}
  box.innerHTML=(data||[]).length?`<div style="border:1px solid var(--border);border-radius:8px;max-height:210px;overflow:auto">${data.map(x=>`<div class="kv"><b>${esc(x.folio)}<br><span style="font-size:10px;color:var(--mut)">${fmtD(x.fecha_expedicion)} · ${x.tipo_constancia==='DIAS_SALARIO'?'DÍAS Y SALARIO':'SERVICIOS'}</span></b><span>${esc(x.destinatario)}<br><button class="btn" style="padding:2px 9px;font-size:10.5px;margin-top:4px" onclick="reimprimirConstanciaLaboral('${x.id}')">🖨 Reimprimir copia exacta</button></span></div>`).join('')}</div>`:'<div style="font-size:12px;color:var(--mut)">Aún no se han emitido constancias para esta persona.</div>';
}
async function emitirConstanciaLaboral(id){
  const w=WORKERS.find(x=>x.id===id);if(!w)return;
  const obra=OBRAS.find(o=>o.id===w.obra_id)||OBRA;
  const codigo=empresaDeTrabajador(w),e=CFGEMP['empresa_'+codigo]||{};
  const tipo=$('cl-tipo').value,dest=$('cl-dest').value.trim().toUpperCase(),lugar=$('cl-lugar').value.trim().toUpperCase(),fecha=$('cl-fecha').value;
  const desde=$('cl-desde').value,hasta=$('cl-hasta').value||null,proposito=$('cl-proposito').value.trim();
  const firmante=$('cl-firmante').value.trim().toUpperCase(),cargo=$('cl-cargo').value.trim().toUpperCase();
  const incSal=$('cl-inc-sal').checked,incCurp=$('cl-inc-curp').checked,incRfc=$('cl-inc-rfc').checked,incNss=$('cl-inc-nss').checked,incFunc=$('cl-inc-func').checked;
  const salario=incSal?Number($('cl-salario').value):null,periodicidad=incSal?$('cl-periodicidad').value:null;
  const dias=tipo==='DIAS_SALARIO'?Number($('cl-dias').value):null;
  if(!e.razon||!e.rfc){toast('Completa razón social y RFC en la configuración de '+codigo+'.','err');return;}
  if(!dest||!lugar||!fecha||!desde){toast('Completa destinatario, lugar, fecha y periodo inicial.','err');return;}
  if(fecha>today()){toast('La fecha de expedición no puede ser futura.','err');return;}
  if(hasta&&hasta<desde){toast('El fin del periodo no puede ser anterior al inicio.','err');return;}
  if(tipo==='DIAS_SALARIO'&&(!hasta||!Number.isInteger(dias)||dias<0)){toast('Captura el fin del periodo y los días efectivamente trabajados.','err');return;}
  if(incSal&&(!(salario>=0)||!periodicidad)){toast('Verifica el salario y su periodicidad.','err');return;}
  if(!firmante||!cargo){toast('Captura el nombre y cargo de la persona facultada para firmar.','err');return;}
  if((incCurp&&!w.curp)||(incRfc&&!w.rfc)||(incNss&&!w.nss)){toast('No puede incluirse un dato personal que no está capturado.','err');return;}
  if(!$('cl-confirma').checked){toast('Confirma la solicitud y la verificación de datos antes de emitir.','err');return;}

  const snapshot={
    version:'CONSTANCIA-LFT-2026.1',
    empresa:{codigo,razon:e.razon,rfc:e.rfc,domicilio:e.domicilio||'',representante:firmante,cargo,logo:codigo},
    centro:{id:obra.id,nombre:obra.nombre,ubicacion:obra.ubicacion||'',registro_patronal:rpDe(w),siroc:obra.registro_siroc||''},
    trabajador:{id:w.id,no_trab:w.no_trab,nombre:fullName(w),puesto:w.puesto||'',funciones:incFunc?(w.funciones||''):'',estatus:w.estatus,fecha_alta:w.fecha_alta||null,fecha_reingreso:w.fecha_reingreso||null,fecha_baja:w.fecha_baja||null,tipo_contrato:w.tipo_contrato||'',curp:incCurp?(w.curp||''):null,rfc:incRfc?(w.rfc||''):null,nss:incNss?(w.nss||''):null},
    documento:{tipo,destinatario:dest,proposito:proposito||null,fecha_expedicion:fecha,lugar_expedicion:lugar,periodo_desde:desde,periodo_hasta:hasta,dias_trabajados:dias,salario,periodicidad_salario:periodicidad,incluir_salario:incSal,incluir_curp:incCurp,incluir_rfc:incRfc,incluir_nss:incNss,incluir_funciones:incFunc,solicitud_confirmada:true},
    fundamento:tipo==='DIAS_SALARIO'?'Ley Federal del Trabajo, artículo 132, fracción VII':'Ley Federal del Trabajo, artículo 132, fracción VIII'
  };
  const win=window.open('','_blank');
  if(!win){toast('El navegador bloqueó la ventana. Permite ventanas emergentes e inténtalo de nuevo.','err');return;}
  win.document.write('<!doctype html><html><body style="font-family:Arial;padding:40px">Preparando constancia y folio seguro…</body></html>');win.document.close();
  const btn=$('cl-emitir');if(btn){btn.disabled=true;btn.textContent='Guardando…';}
  markWrite();
  const fila={obra_id:obra.id,trabajador_id:w.id,empresa_codigo:codigo,tipo_constancia:tipo,destinatario:dest,proposito:proposito||null,fecha_expedicion:fecha,lugar_expedicion:lugar,periodo_desde:desde,periodo_hasta:hasta,dias_trabajados:dias,salario,periodicidad_salario:periodicidad,incluir_salario:incSal,incluir_curp:incCurp,incluir_rfc:incRfc,incluir_nss:incNss,incluir_funciones:incFunc,firmante_nombre:firmante,firmante_cargo:cargo,snapshot,emitida_por:USER.id,emitida_por_email:USER.email||''};
  const {data,error}=await sb.from('constancias_laborales').insert(fila).select('*').single();
  if(error){win.close();if(btn){btn.disabled=false;btn.textContent='📜 Emitir, guardar e imprimir';}toast(clError(error),'err');return;}
  win.document.open();win.document.write(constanciaLaboralHTML(data));win.document.close();
  await ctrlAuditar('CONSTANCIAS_LABORALES','EMITIR',{folio:data.folio,tipo:data.tipo_constancia,trabajador_id:w.id,empresa:codigo},'CONSTANCIA',data.id);
  closeModal();toast('Constancia '+data.folio+' emitida y guardada sin posibilidad de alteración.','ok');
}
async function reimprimirConstanciaLaboral(id){
  const win=window.open('','_blank');
  if(!win){toast('Permite ventanas emergentes para reimprimir.','err');return;}
  win.document.write('<!doctype html><html><body style="font-family:Arial;padding:40px">Recuperando copia exacta…</body></html>');win.document.close();
  const {data,error}=await sb.from('constancias_laborales').select('*').eq('id',id).eq('obra_id',OBRA.id).maybeSingle();
  if(error||!data){win.close();toast(error?clError(error):'No se encontró la constancia.','err');return;}
  win.document.open();win.document.write(constanciaLaboralHTML(data));win.document.close();
  ctrlAuditar('CONSTANCIAS_LABORALES','REIMPRIMIR',{folio:data.folio},'CONSTANCIA',data.id);
}
function constanciaLaboralHTML(reg){
  const s=reg.snapshot||{},e=s.empresa||{},c=s.centro||{},w=s.trabajador||{},d=s.documento||{};
  const codigo=e.codigo||reg.empresa_codigo||'PLATINUM',logo=logoEmpresa(codigo);
  const tipo=reg.tipo_constancia||d.tipo||'SERVICIOS',dias=reg.dias_trabajados??d.dias_trabajados;
  const salario=reg.salario??d.salario,periodicidad=reg.periodicidad_salario||d.periodicidad_salario;
  const vigente=!d.periodo_hasta&&String(w.estatus||'').toUpperCase()!=='BAJA';
  const ids=[d.incluir_curp&&w.curp?`CURP <b>${esc(w.curp)}</b>`:'',d.incluir_rfc&&w.rfc?`RFC <b>${esc(w.rfc)}</b>`:'',d.incluir_nss&&w.nss?`NSS <b>${esc(w.nss)}</b>`:''].filter(Boolean).join(' · ');
  const periodo=vigente?`desde el <b>${clFechaLarga(d.periodo_desde)}</b> y mantiene una relación laboral vigente a la fecha de expedición`:`del <b>${clFechaLarga(d.periodo_desde)}</b> al <b>${clFechaLarga(d.periodo_hasta)}</b>`;
  const detalle=tipo==='DIAS_SALARIO'
    ?`Durante el periodo comprendido del <b>${clFechaLarga(d.periodo_desde)}</b> al <b>${clFechaLarga(d.periodo_hasta)}</b>, constan <b>${esc(dias)} día(s) efectivamente trabajado(s)</b> y un salario <b>${esc(String(periodicidad||'').toLowerCase())} de $${money(salario)} M.N.</b>, según los registros de nómina y asistencia de la empresa.`
    :`La persona trabajadora presta${vigente?'':'ó'} sus servicios ${periodo}, desempeñando el puesto de <b>${esc(w.puesto||'NO ESPECIFICADO')}</b> en el centro de trabajo <b>${esc(c.nombre||'')}</b>${c.ubicacion?', ubicado en '+esc(c.ubicacion):''}.`;
  const salarioExtra=tipo==='SERVICIOS'&&d.incluir_salario?`<p>Percibe un salario <b>${esc(String(periodicidad||'').toLowerCase())} de $${money(salario)} M.N.</b>.</p>`:'';
  const funciones=d.incluir_funciones&&w.funciones?`<p>Las funciones registradas para el puesto son: ${esc(w.funciones)}.</p>`:'';
  const finalidad=d.proposito?` para <b>${esc(d.proposito)}</b>`:' para los fines legales y administrativos que a su interés convengan';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(reg.folio)} · ${esc(w.nombre||'Constancia laboral')}</title><style>
  @page{size:A4;margin:12mm 16mm 13mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:9.5pt;line-height:1.34;margin:0;background:#fff}.page{max-width:178mm;margin:0 auto;position:relative}.head{display:flex;align-items:center;justify-content:space-between;gap:8mm;border-bottom:2px solid #193659;padding-bottom:3mm;margin-bottom:4mm}.head img{width:34mm;height:15mm;object-fit:contain}.empresa{text-align:right;font-size:8pt;line-height:1.25}.empresa b{font-size:9pt;color:#193659}.meta{display:flex;justify-content:space-between;gap:8mm;font-size:7.9pt;color:#5f6d80;margin-bottom:4mm}.folio{font-weight:700;color:#193659}h1{text-align:center;font-size:13pt;letter-spacing:.7px;margin:0 0 5mm;color:#193659}.dest{font-weight:700;margin-bottom:4mm}p{text-align:justify;margin:0 0 3mm}.firma{text-align:center;width:85mm;margin:13mm auto 0;border-top:1px solid #172033;padding-top:2mm;font-size:8.9pt;break-inside:avoid;page-break-inside:avoid}.firma b{font-size:9.4pt}.pie{border-top:1px solid #ccd5e1;margin-top:7mm;padding-top:2mm;font-size:7.1pt;line-height:1.25;color:#657387;display:grid;grid-template-columns:1fr auto;gap:4mm;break-inside:avoid;page-break-inside:avoid}.codigo{font-family:Consolas,monospace;font-weight:700;letter-spacing:.5px;color:#193659}.no-print{position:fixed;right:12px;top:12px}@media print{.no-print{display:none}}@media screen{body{padding:12mm}.page{box-shadow:0 2px 18px #bbc3ce;padding:15mm;max-width:210mm;min-height:270mm}}
  </style></head><body><button class="no-print" onclick="window.print()">Imprimir / Guardar PDF</button><main class="page">
  <header class="head"><img src="${logo}" alt="${esc(codigo)}"><div class="empresa"><b>${esc(e.razon||'')}</b><br>RFC ${esc(e.rfc||'')}<br>${esc(e.domicilio||'')}</div></header>
  <div class="meta"><span><span class="folio">Folio: ${esc(reg.folio||'')}</span><br>Fecha de emisión: ${clFechaLarga(reg.fecha_expedicion||d.fecha_expedicion)}</span><span style="text-align:right">${esc(reg.lugar_expedicion||d.lugar_expedicion||'')}<br>Código: <span class="codigo">${esc(reg.codigo_verificacion||'')}</span></span></div>
  <h1>${tipo==='DIAS_SALARIO'?'CONSTANCIA DE DÍAS TRABAJADOS Y SALARIO':'CONSTANCIA LABORAL'}</h1>
  <p class="dest">${esc(reg.destinatario||d.destinatario||'A QUIEN CORRESPONDA')}:</p>
  <p>Por medio de la presente, <b>${esc(e.razon||'')}</b>, con Registro Federal de Contribuyentes <b>${esc(e.rfc||'')}</b>, hace constar que <b>${esc(w.nombre||'')}</b>${w.no_trab!=null?', número de trabajador <b>'+esc(w.no_trab)+'</b>':''}${ids?', identificado(a) con '+ids:''}, se encuentra registrado(a) en sus archivos laborales.</p>
  <p>${detalle}</p>${salarioExtra}${funciones}
  <p>La presente se expide a solicitud de la persona trabajadora${finalidad}, con fundamento en la <b>${esc(s.fundamento||'Ley Federal del Trabajo, artículo 132')}</b>.</p>
  <p>Se extiende la presente en ${esc(reg.lugar_expedicion||d.lugar_expedicion||'')}, a ${clFechaLarga(reg.fecha_expedicion||d.fecha_expedicion)}.</p>
  <div class="firma"><b>${esc(reg.firmante_nombre||e.representante||'')}</b><br>${esc(reg.firmante_cargo||e.cargo||'')}<br>${esc(e.razon||'')}<br><span style="font-size:8pt;color:#657387">Firma de la persona facultada y, en su caso, sello</span></div>
  <footer class="pie"><span>Constancia patronal. El folio y código permiten verificar su integridad en el registro interno de la empresa; no sustituye documentos expedidos por una autoridad laboral.</span><span class="codigo">${esc(reg.folio||'')} · ${esc(reg.codigo_verificacion||'')}</span></footer>
  </main><script>window.onload=()=>setTimeout(()=>window.print(),450)<\/script></body></html>`;
}

/* ---------- CONTRATO INDIVIDUAL DE TRABAJO (LFT) ---------- */
function openContrato(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const empDefault=empresaDeTrabajador(w);
  const e=CFGEMP['empresa_'+empDefault]||{razon:'',rfc:'',representante:'',domicilio:''};
  modal(`
    <div class="m-head"><h2>📄 Contrato individual · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Empresa (patrón)</label><select id="ct-emp" onchange="ctEmpChange()"><option value="PLATINUM" ${empDefault==='PLATINUM'?'selected':''}>PLATINUM</option><option value="JIRE" ${empDefault==='JIRE'?'selected':''}>JIRE</option></select></div>
        <div><label>Tipo de contrato</label><select id="ct-tipo">${['TIEMPO INDETERMINADO','TIEMPO DETERMINADO','OBRA DETERMINADA','PERIODO A PRUEBA'].map(t=>`<option ${(w.tipo_contrato||'TIEMPO INDETERMINADO')===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="c2" style="grid-column:span 2"><label>Razón social</label><input id="ct-razon" value="${esc(e.razon)}"></div>
        <div><label>RFC empresa</label><input id="ct-rfc" value="${esc(e.rfc)}"></div>
        <div><label>Representante legal</label><input id="ct-rep" value="${esc(e.representante)}" placeholder="NOMBRE DEL REPRESENTANTE"></div>
        <div class="c2" style="grid-column:span 2"><label>Domicilio fiscal de la empresa</label><input id="ct-dom" value="${esc(e.domicilio)}"></div>
        <div><label>Fecha del contrato</label><input id="ct-fecha" type="date" value="${w.fecha_alta||today()}"></div>
        <div><label>Fin (solo tiempo determinado)</label><input id="ct-fin" type="date" value="${w.fecha_fin_contrato||''}"></div>
      </div>
      <p style="margin-top:12px;font-size:12px;color:var(--mut)">Sale con el formato oficial (machote JIRE_DA_RH-08). El logo y los datos de la empresa se toman según la empresa elegida: <b>JIRE</b> lleva su logo; <b>PLATINUM</b> su membrete. Los datos legales de la empresa (instrumento notarial, notario, RFC, domicilio fiscal, carácter del representante) van <b>en blanco</b> por ahora — se llenan a mano o me los pasas para cargarlos. <b>Revísalo con abogado laboral antes del primer uso.</b></p>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="generarContrato('${id}')">🖨 Generar e imprimir</button>
    </div>`,'md');
}
function ctEmpChange(){
  const e=CFGEMP['empresa_'+$('ct-emp').value]||{razon:'',rfc:'',representante:'',domicilio:''};
  $('ct-razon').value=e.razon||'';$('ct-rfc').value=e.rfc||'';$('ct-rep').value=e.representante||'';$('ct-dom').value=e.domicilio||'';
}
async function generarContrato(id){
  const w=WORKERS.find(x=>x.id===id);
  if(!w){toast('No se encontró al trabajador (recarga la página).','err');return;}
  // FUSIONA con la config guardada (empresa_JIRE / empresa_PLATINUM) para NO perder
  // los datos legales (instrumento notarial, notario, folio mercantil, carácter del
  // representante, etc.) que solo viven en la config y no están en el formulario.
  const clave='empresa_'+$('ct-emp').value;
  const cfgEmp=CFGEMP[clave]||{};
  const emp=Object.assign({},cfgEmp,{
    razon:$('ct-razon').value.trim().toUpperCase(),rfc:$('ct-rfc').value.trim().toUpperCase(),
    representante:$('ct-rep').value.trim().toUpperCase(),domicilio:$('ct-dom').value.trim().toUpperCase()});
  const tipo=$('ct-tipo').value, fecha=$('ct-fecha').value||today(), fin=$('ct-fin').value;
  CFGEMP[clave]=emp;
  try{await sb.from('config').upsert({clave,valor:emp,actualizado_por:USER.email});}catch(e){}
  // actualizar tipo de contrato del trabajador
  markWrite();
  await sb.from('trabajadores').update({tipo_contrato:tipo,fecha_fin_contrato:fin||null}).eq('id',id);
  const F=v=>v&&String(v).trim()?esc(String(v).trim()):'<span style="background:#fff3b0">____________</span>';
  const fmtL=d=>{if(!d)return '____';const x=new Date(d+'T12:00');return `${x.getDate()} de ${MES[x.getMonth()].toLowerCase()} de ${x.getFullYear()}`;};
  const tipoTit = tipo==='PERIODO A PRUEBA' ? 'TIEMPO INDETERMINADO (PERIODO A PRUEBA)' : tipo;
  const empKey=$('ct-emp')?$('ct-emp').value:'PLATINUM';
  const edad=(function(){if(!w.fecha_nacimiento)return null;const b=new Date(w.fecha_nacimiento+'T12:00'),n=new Date();let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return a>=0?a:null;})();
  const pago=w.periodo_pago==='QUINCENAL'?'quincenal':(w.periodo_pago==='MENSUAL'?'mensual':'semanal');
  const BL=v=>(v!=null&&String(v).trim())?esc(String(v).trim()):'<span class="bl">________________</span>';
  const sdNum=Number(w.sd)||0;
  const sdLetra=(typeof numLetras==='function'&&sdNum)?numLetras(sdNum):'';
  const L={rep:emp.representante,cargo:emp.repCargo,rfc:emp.rfc,dom:emp.domicilio,
    instrumento:emp.instrumento,volumen:emp.volumen,esc_fecha:emp.escritura_fecha,notario:emp.notario,
    notaria:emp.notaria_num,ciudad:emp.notaria_ciudad,rppc:emp.rppc,folio:emp.folio_mercantil,inscr:emp.inscripcion_fecha};
  let tercera;
  if(tipo==='TIEMPO DETERMINADO') tercera=`Este contrato se celebra por <b>tiempo determinado</b>, con vigencia del <b>${fmtL(fecha)}</b> al <b>${fmtL(fin)}</b>, conforme al art&iacute;culo 37 de la Ley Federal del Trabajo, por as&iacute; exigirlo la naturaleza del trabajo a desarrollar.`;
  else if(tipo==='OBRA DETERMINADA') tercera=`Este contrato se celebra por <b>obra determinada</b>, conforme al art&iacute;culo 36 de la Ley Federal del Trabajo; su duraci&oacute;n ser&aacute; la que exija la ejecuci&oacute;n de los trabajos de la obra denominada <b>${esc(OBRA.nombre)}</b>${OBRA.ubicacion?', ubicada en '+esc(OBRA.ubicacion):''}, extingui&eacute;ndose la relaci&oacute;n de trabajo al concluir la obra o la etapa de la misma para la que fue contratado "EL TRABAJADOR".`;
  else if(tipo==='PERIODO A PRUEBA') tercera='La relaci&oacute;n de trabajo se pacta por <b>tiempo indeterminado</b> y se sujeta a un <b>periodo a prueba de treinta d&iacute;as</b>, conforme al art&iacute;culo 39-A de la Ley Federal del Trabajo, con el fin de verificar que "EL TRABAJADOR" cumple con los requisitos y conocimientos necesarios para desarrollar el trabajo. De no acreditarlos, a juicio de "EL PATR&Oacute;N" y tomando en cuenta la opini&oacute;n de la Comisi&oacute;n Mixta de Productividad, Capacitaci&oacute;n y Adiestramiento, se dar&aacute; por terminada la relaci&oacute;n de trabajo sin responsabilidad para "EL PATR&Oacute;N".';
  else tercera='Este contrato se celebra por <b>tiempo indeterminado</b>, conforme a lo se&ntilde;alado en el art&iacute;culo 35 de la Ley Federal del Trabajo.';
  const headerHTML = empKey==='JIRE'
    ? `<div class="hdr"><img class="logo" src="${LOGO_JIRE}" alt="JIRE"></div>`
    : `<div class="hdr plat"><div class="pl1">COMERCIALIZADORA PLATINUM HIDALGUENSE</div><div class="pl2">Grupo Platinum</div></div>`;
  const fd=new Date((fecha||today())+'T12:00');
  const fdia=fd.getDate(), fmes=MES[fd.getMonth()].toLowerCase(), fanio=fd.getFullYear();
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Contrato ${esc(fullName(w))}</title>
  <style>
  body{font-family:'Times New Roman',serif;font-size:11.5pt;line-height:1.4;color:#000;max-width:720px;margin:0 auto;padding:0 26px;text-align:justify}
  .hdr{text-align:center;margin:8px 0 14px;padding-bottom:8px;border-bottom:2px solid #1b3a5b}
  .hdr .logo{height:64px}
  .hdr.plat .pl1{font-weight:bold;font-size:15pt;color:#1B2A4A;letter-spacing:.5px}
  .hdr.plat .pl2{font-size:10pt;color:#2E7D5B}
  h1{font-size:12.5pt;text-align:center;text-transform:uppercase;margin:6px 0 12px}
  h2{font-size:11.5pt;text-align:center;margin:14px 0 6px}
  p{margin:6px 0}.bl{letter-spacing:1px}
  .fecha{margin-top:18px}
  .firmas{display:flex;justify-content:space-between;gap:40px;margin-top:52px;text-align:center}
  .firmas div{flex:1;font-size:10.5pt}
  .peq{font-size:8.5pt;color:#555;margin-top:26px;text-align:left}
  @media print{body{margin:0 auto}}
  </style></head><body>
  ${headerHTML}
  <h1>Contrato Individual de Trabajo por ${esc(tipoTit)}</h1>
  <p>CONTRATO INDIVIDUAL DE TRABAJO POR ${esc(tipoTit.toUpperCase())} QUE CELEBRAN POR UNA PARTE LA EMPRESA <b>${BL(emp.razon)}</b>, REPRESENTADA EN ESTE ACTO POR EL (LA) C. <b>${BL(L.rep)}</b> A QUIEN EN LO SUCESIVO SE LE DENOMINAR&Aacute; <b>"EL PATR&Oacute;N"</b>, Y POR LA OTRA PARTE, EL (LA) C. <b>${esc(fullName(w))}</b> A QUIEN EN LO SUCESIVO SE LE DENOMINAR&Aacute; COMO <b>"EL TRABAJADOR"</b>, Y A QUIENES EN SU CONJUNTO SE LES DENOMINAR&Aacute; <b>"LAS PARTES"</b>; QUE CONTIENE LAS CONDICIONES GENERALES DE TRABAJO BAJO LAS SIGUIENTES:</p>
  <h2>D E C L A R A C I O N E S:</h2>
  <p><b>I. DECLARA "EL PATR&Oacute;N"</b></p>
  <p><b>a)</b> Para los efectos de los art&iacute;culos 10, 11, 12, 13, 14, 16, 24 y 25 de la Ley Federal del Trabajo, que su representada denominada <b>${BL(emp.razon)}</b> est&aacute; legalmente constituida de conformidad con las leyes de la Rep&uacute;blica Mexicana, situaci&oacute;n que se corrobora en el Instrumento N&uacute;mero ${BL(L.instrumento)}, Volumen N&uacute;mero ${BL(L.volumen)}, de fecha ${BL(L.esc_fecha)}, pasado ante la fe del Licenciado ${BL(L.notario)}, Notario P&uacute;blico N&uacute;mero ${BL(L.notaria)} en la Ciudad ${BL(L.ciudad)}; el cual qued&oacute; inscrito en el Registro P&uacute;blico de la Propiedad y de Comercio de ${BL(L.rppc)}, bajo el folio mercantil ${BL(L.folio)} con fecha ${BL(L.inscr)}.</p>
  <p><b>b)</b> Que comparece a la celebraci&oacute;n del presente contrato en su car&aacute;cter de <b>${BL(L.cargo)}</b>, personalidad que acredita en t&eacute;rminos del Instrumento notarial de referencia en el inciso a) que precede, la cual no le ha sido modificada, ni revocada en forma alguna a la fecha de firma del presente contrato.</p>
  <p><b>c)</b> Que la empresa tiene su domicilio ubicado en ${BL(L.dom)}, y contar con Registro Federal de Contribuyentes ${BL(L.rfc)}.</p>
  <p><b>II. DECLARA "EL TRABAJADOR"</b></p>
  <p><b>a)</b> Para los efectos de los art&iacute;culos 8, 24 y 25 de la Ley Federal del Trabajo, "EL TRABAJADOR" declara llamarse <b>${esc(fullName(w))}</b>, sexo ${BL(w.genero)}, escolaridad ${BL(w.escolaridad)}, nacido en ${BL(w.edo_nacimiento)} que cuenta con ${edad!=null?edad:'<span class="bl">____</span>'} a&ntilde;os de edad, de nacionalidad ${BL(w.nacionalidad||'MEXICANA')} estado civil ${BL(w.estado_civil)}, con n&uacute;mero de seguridad social ${BL(w.nss)}.</p>
  <p><b>b)</b> Que cuenta con Clave &Uacute;nica de Registro de Poblaci&oacute;n <b>${BL(w.curp)}</b>.</p>
  <p><b>c)</b> Que se encuentra debidamente inscrito ante el Registro Federal de Contribuyentes con clave ${BL(w.rfc)}.</p>
  <p><b>d)</b> Que su domicilio se encuentra en ${BL(w.direccion)}${w.cp?', C.P. '+esc(w.cp):''}.</p>
  <p><b>III. Declaran "LAS PARTES"</b></p>
  <p><b>a)</b> Que es su voluntad celebrar el presente contrato individual de trabajo y estar de acuerdo con lo aqu&iacute; expresamente pactado quedando insubsistente cualquier acuerdo verbal que se haya dado entre ellos. Asimismo, est&aacute;n de acuerdo en sujetar el presente contrato al tenor de las siguientes:</p>
  <h2>C L &Aacute; U S U L A S:</h2>
  <p><b>PRIMERA. -</b> "EL TRABAJADOR" se obliga a prestar sus servicios personales a "EL PATR&Oacute;N", subordin&aacute;ndose jur&iacute;dicamente para ocupar el puesto de <b>${BL(w.puesto)}</b>, conviniendo que este trabajo deber&aacute; ejecutarlo con cuidado, esmero, eficiencia y en la forma, tiempo y lugar convenido, por lo que queda expresamente pactado que acatar&aacute; en el desempe&ntilde;o de su trabajo todas las disposiciones del Reglamento Interior de Trabajo, todas las &oacute;rdenes, circulares y disposiciones que dicte "EL PATR&Oacute;N" y todos los ordenamientos legales que le sean aplicables, sobremanera lo se&ntilde;alado por el art&iacute;culo 27 de la Ley Federal del Trabajo, adem&aacute;s las actividades que ejecutar&aacute; son las de ${BL(w.funciones)}, se&ntilde;al&aacute;ndose de manera enunciativa y no limitativa.</p>
  <p>"EL TRABAJADOR" realizar&aacute; sus servicios personales bajo la direcci&oacute;n, dependencia y subordinaci&oacute;n de "EL PATR&Oacute;N" as&iacute; como de las personas que se encuentren bajo la direcci&oacute;n y subordinaci&oacute;n de &eacute;ste y que tengan facultades de mando en el centro de trabajo ejecutando todas las labores inherentes al puesto mencionado, todas aquellas que se le relacionen directa e indirectamente de acuerdo con el uso y la costumbre y/o aquellas actividades que se relacionen con otros puestos similares al suyo y las relativas a la ley, respetando los sistemas de trabajo y pol&iacute;ticas de "EL PATR&Oacute;N".</p>
  <p><b>SEGUNDA. -</b> "EL TRABAJADOR" deber&aacute; ejecutar su trabajo en el lugar donde "EL PATR&Oacute;N" ordene desempe&ntilde;ar las actividades. "EL TRABAJADOR" se obliga a desempe&ntilde;ar dentro de su jornada de trabajo, s&oacute;lo las actividades que correspondan con su puesto y dem&aacute;s relacionadas con el mismo, las cuales &uacute;nicamente ser&aacute;n asignadas por "EL PATR&Oacute;N".</p>
  <p><b>TERCERA. -</b> ${tercera}</p>
  <p><b>CUARTA. -</b> Por los servicios contratados, "EL PATR&Oacute;N" pagar&aacute; a "EL TRABAJADOR" un salario diario de <b>$${money(sdNum)}${sdLetra?' ('+esc(sdLetra)+' 00/100 M.N.)':' M.N.'}</b>; el cual, en ninguna circunstancia ser&aacute; inferior al salario m&iacute;nimo establecido para el &aacute;rea geogr&aacute;fica en donde "EL TRABAJADOR" preste sus servicios. Al salario convenido se aplicar&aacute; la parte proporcional correspondiente al descanso semanal conforme a lo dispuesto en el art&iacute;culo 69 de la Ley Federal del Trabajo. El salario se fijar&aacute; de manera <b>${pago}</b>, en moneda de curso legal y podr&aacute; efectuarse en efectivo, dep&oacute;sito en cuenta bancaria, tarjeta de d&eacute;bito, transferencias o cualquier otro medio electr&oacute;nico. Al efecto, "EL TRABAJADOR" a la firma del presente contrato, autoriza a "EL PATR&Oacute;N" para que este le efect&uacute;e el pago en las modalidades antes se&ntilde;aladas.</p>
  <p>"EL TRABAJADOR" expresa su conformidad y autoriza a "EL PATR&Oacute;N" para que deduzca de su salario, los impuestos que resulten a su cargo, las cuotas obreras al Instituto Mexicano del Seguro Social, as&iacute; como cualquier otra cantidad a cuyo pago pudiera estar obligado "EL TRABAJADOR" y en especial aqu&eacute;llas a que se refiere el art&iacute;culo 110 de la Ley Federal del Trabajo.</p>
  <p><b>QUINTA. -</b> "LAS PARTES" acuerdan que en atenci&oacute;n a la tendencia digital y el fomento del cuidado al medio ambiente; de conformidad con lo establecido en el art&iacute;culo 101 de la Ley Federal del Trabajo, "EL PATR&Oacute;N" se obliga a la entrega de los recibos de n&oacute;mina de "EL TRABAJADOR" al correo electr&oacute;nico <b>${BL(w.correo)}</b>, en los cuales se podr&aacute; apreciar la informaci&oacute;n detallada de los conceptos y deducciones de pago, convini&eacute;ndose en que la recepci&oacute;n del recibo v&iacute;a correo electr&oacute;nico implicar&aacute; el finiquito total de las obligaciones de "EL PATR&Oacute;N" por el periodo correspondiente.</p>
  <p>No obstante, previa solicitud por escrito, "EL TRABAJADOR" podr&aacute; requerir de forma impresa el recibo de n&oacute;mina a "EL PATR&Oacute;N", quedando obligado a firmar estas constancias de pago.</p>
  <p><b>SEXTA. -</b> La duraci&oacute;n de la jornada ser&aacute; de 48 horas a la semana, repartidas conforme a las necesidades de "EL PATR&Oacute;N" en t&eacute;rminos del art&iacute;culo 59 de la Ley Federal del Trabajo. Dicha jornada de trabajo podr&aacute; ajustarla "EL PATR&Oacute;N" de acuerdo con la carga de trabajo dentro de los m&aacute;ximos permitidos por la ley, notific&aacute;ndole a "EL TRABAJADOR" con debida anticipaci&oacute;n, quien manifiesta su entera conformidad para ello. "EL PATR&Oacute;N" queda en libertad de adecuar los sistemas de trabajo, horarios y la organizaci&oacute;n de las labores; "EL TRABAJADOR" est&aacute; obligado a obedecer cualquier orden relacionada con los nuevos sistemas de trabajo u organizaci&oacute;n y acudir a los eventos extraordinarios requeridos por "EL PATR&Oacute;N".</p>
  <p><b>S&Eacute;PTIMA. -</b> Cuando por circunstancias extraordinarias se aumente la jornada de trabajo, los servicios prestados durante el tiempo excedente se considerar&aacute;n como extraordinarios y se pagar&aacute;n a raz&oacute;n de ciento por ciento m&aacute;s del salario establecido para las horas de trabajo normal. Queda prohibido a "EL TRABAJADOR" que labore tiempo extra, a menos que reciba solicitud para ello de forma expresa y por escrito de "EL PATR&Oacute;N" o de sus representantes. Tales servicios nunca podr&aacute;n exceder de tres horas diarias ni de tres veces en una semana.</p>
  <p>En caso de que "EL TRABAJADOR" manifieste su aceptaci&oacute;n por escrito a "EL PATR&Oacute;N" de la solicitud de tiempo extraordinario, es precisamente "EL TRABAJADOR" quien se obliga a conservar dichas constancias, sin cuyo requisito no deber&aacute; prestar sus servicios en jornada extraordinaria, por lo que se obliga a exhibirlas para el cobro del tiempo extraordinario correspondiente.</p>
  <p><b>OCTAVA. -</b> "EL TRABAJADOR" est&aacute; obligado a registrar su asistencia en la forma y t&eacute;rminos que establezca "EL PATR&Oacute;N", a la entrada y salida de sus labores, por lo que el incumplimiento de esta condici&oacute;n conducir&aacute; a considerarse como falta injustificada a sus labores, para todos los efectos legales.</p>
  <p><b>NOVENA. -</b> Por cada seis d&iacute;as de trabajo, tendr&aacute; "EL TRABAJADOR" derecho a un d&iacute;a de descanso semanal con goce del pago de salario &iacute;ntegro, convini&eacute;ndose en que dicho descanso lo disfrutar&aacute; seg&uacute;n las condiciones de trabajo y el centro de servicios o lugar de trabajo, por lo que dicho d&iacute;a de descanso podr&aacute; ser rotativo. Tambi&eacute;n disfrutar&aacute; de descanso con pago de salario &iacute;ntegro, los d&iacute;as se&ntilde;alados en el art&iacute;culo 74 de la Ley Federal del Trabajo. Se proh&iacute;be expresamente a "EL TRABAJADOR" que labore los d&iacute;as festivos o de descanso obligatorio, salvo solicitud expresa y por escrito de "EL PATR&Oacute;N" y aceptaci&oacute;n por escrito de "EL TRABAJADOR".</p>
  <p><b>D&Eacute;CIMA. -</b> "EL TRABAJADOR" despu&eacute;s de un a&ntilde;o de servicios continuos disfrutar&aacute; de un periodo anual de vacaciones pagadas, en t&eacute;rminos de la Ley Federal del Trabajo, mismas que aumentar&aacute;n peri&oacute;dicamente seg&uacute;n lo marque la misma Ley. Asimismo, se le cubrir&aacute; la prima vacacional conforme a lo dispuesto en la Ley Federal del Trabajo. Las vacaciones no podr&aacute;n compensarse con una remuneraci&oacute;n. Si la relaci&oacute;n de trabajo termina antes de que se cumpla el a&ntilde;o de servicios, "EL TRABAJADOR" tendr&aacute; derecho a una remuneraci&oacute;n proporcional por concepto de vacaciones al tiempo de servicios prestados.</p>
  <p><b>D&Eacute;CIMA PRIMERA. -</b> "EL TRABAJADOR" percibir&aacute; un aguinaldo anual, que deber&aacute; pag&aacute;rsele antes del d&iacute;a 20 de diciembre, equivalente a 15 d&iacute;as de salario, de acuerdo con lo establecido por el art&iacute;culo 87 de la Ley Federal del Trabajo. Cuando "EL TRABAJADOR" no haya cumplido el a&ntilde;o de servicios, tendr&aacute; derecho a que se le pague en proporci&oacute;n al tiempo trabajado, conforme al art&iacute;culo citado.</p>
  <p><b>D&Eacute;CIMA SEGUNDA. -</b> "EL TRABAJADOR" conviene en someterse a los reconocimientos m&eacute;dicos que peri&oacute;dicamente ordene "EL PATR&Oacute;N" en los t&eacute;rminos del art&iacute;culo 134 fracci&oacute;n X de la Ley Federal del Trabajo; en la inteligencia de que el m&eacute;dico que los practique ser&aacute; designado y retribuido por "EL PATR&Oacute;N".</p>
  <p><b>D&Eacute;CIMA TERCERA. -</b> "EL TRABAJADOR" ser&aacute; capacitado y adiestrado en los t&eacute;rminos de los planes y programas que establezca "EL PATR&Oacute;N" conforme a lo dispuesto a la Ley, por lo que "EL TRABAJADOR" se compromete a participar en todos y cada uno de los programas de capacitaci&oacute;n y adiestramiento a que se refiere la fracci&oacute;n XV del art&iacute;culo 132 de la Ley Federal del Trabajo.</p>
  <p><b>D&Eacute;CIMA CUARTA. -</b> "EL PATR&Oacute;N" podr&aacute; implementar el otorgamiento de beneficios adicionales en favor de "EL TRABAJADOR", con la finalidad de coadyuvar para la satisfacci&oacute;n de las necesidades presentes o futuras, tendientes a su superaci&oacute;n f&iacute;sica, social, econ&oacute;mica o cultural, que les permitan el mejoramiento en su calidad de vida y la de sus beneficiarios.</p>
  <p><b>D&Eacute;CIMA QUINTA. -</b> "EL TRABAJADOR", en t&eacute;rminos del art&iacute;culo 25 fracci&oacute;n X y del diverso 501 de la Ley Federal del Trabajo, designa como beneficiario(s) a <b>${BL(w.beneficiario)}</b> quien(es) se favorecer&aacute;(n) del pago de los salarios, prestaciones devengadas y no cobradas o las que se generen en el caso de fallecimiento o desaparici&oacute;n derivada de un acto delincuencial de "EL TRABAJADOR". Cualquier modificaci&oacute;n respecto a la designaci&oacute;n de beneficiarios s&oacute;lo podr&aacute; efectuarla "EL TRABAJADOR", haci&eacute;ndolo del conocimiento de "EL PATR&Oacute;N".</p>
  <p><b>D&Eacute;CIMA SEXTA. -</b> "EL TRABAJADOR" se obliga a guardar discreci&oacute;n y estricta confidencialidad de la informaci&oacute;n, datos o documentos confidenciales y reservados de "EL PATR&Oacute;N". En caso de que "EL TRABAJADOR" revele o divulgue la informaci&oacute;n, datos y documentaci&oacute;n, ser&aacute; una causa de rescisi&oacute;n de la relaci&oacute;n laboral sin consecuencia para "EL PATR&Oacute;N" conforme al art&iacute;culo 47, fracciones II y IX, de la Ley Federal del Trabajo. "EL TRABAJADOR" conviene expresamente en que no podr&aacute; aprovechar o utilizar, en ning&uacute;n caso, la informaci&oacute;n, datos o documentos confidenciales y reservados de "EL PATR&Oacute;N" para fines propios o de terceros; durante la vigencia del presente contrato y hasta por cinco a&ntilde;os contados a partir de la terminaci&oacute;n de este.</p>
  <p><b>D&Eacute;CIMA S&Eacute;PTIMA. -</b> El presente contrato anula y deja sin efectos cualquier otro contrato anterior o convenio que hubiere existido o se hubiera celebrado entre "LAS PARTES". Para todo lo relativo a la interpretaci&oacute;n, cumplimiento y ejecuci&oacute;n del presente contrato, "LAS PARTES" se someten expresamente a la jurisdicci&oacute;n y competencia de los Tribunales del estado de HIDALGO, renunciando a cualquier otra jurisdicci&oacute;n o tribunal que por raz&oacute;n de domicilio, presente o futuro, pudiese ser competente.</p>
  <p>Le&iacute;do que fue el presente contrato por "LAS PARTES", e impuestas de su contenido y fuerza legal, lo firmaron, quedando un tanto en poder de cada una de las mismas.</p>
  <p class="fecha">Pachuca de Soto, Hgo.; a ${fdia} de ${fmes} de ${fanio}.</p>
  <div class="firmas">
    <div><b>"EL PATR&Oacute;N"</b><br><br><br>________________________________<br>C. ${BL(L.rep)}<br>En representaci&oacute;n legal de ${BL(emp.razon)}.</div>
    <div><b>"EL TRABAJADOR"</b><br><br><br>________________________________<br>C. ${esc(fullName(w))}</div>
  </div>
  <p class="peq">Documento generado por la Base de Trabajadores PLATINUM el ${new Date().toLocaleDateString('es-MX')}. Machote JIRE_DA_RH-08; sujeto a revisi&oacute;n por abogado laboral.</p>
  <script>window.onload=()=>window.print()<\/script></body></html>`;
  const win=window.open('','_blank');
  if(!win){toast('Tu navegador bloqueó la ventana. Permite ventanas emergentes para este archivo.','err');return;}
  win.document.write(html);win.document.close();
  closeModal();toast('Contrato generado: usa "Guardar como PDF" en el diálogo de impresión.','ok');
  await loadObraData(OBRA.id);
}

/* ---------- CARTA DE RENUNCIA Y RECIBO DE FINIQUITO ---------- */
function numLetras(n){
  n=Math.round(Number(n)*100)/100;
  const ent=Math.floor(n), cent=Math.round((n-ent)*100);
  const U=['','un','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte'];
  const D=['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const C=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
  function tri(x){
    if(x===0)return'';
    if(x===100)return'cien';
    let s='';
    const c=Math.floor(x/100),r=x%100;
    if(c)s+=C[c]+' ';
    if(r===0){}
    else if(r<=20)s+=U[r];
    else if(r<30)s+='veinti'+U[r%10];
    else{s+=D[Math.floor(r/10)];if(r%10)s+=' y '+U[r%10];}
    return s.trim();
  }
  let L='';
  const mill=Math.floor(ent/1e6), miles=Math.floor((ent%1e6)/1000), resto=ent%1000;
  if(mill)L+=(mill===1?'un millón':tri(mill)+' millones')+' ';
  if(miles)L+=(miles===1?'un mil':tri(miles)+' mil')+' ';
  if(resto)L+=tri(resto);
  if(!L.trim())L='cero';
  L=L.trim()+(ent===1?' peso ':' pesos ')+String(cent).padStart(2,'0')+'/100 M.N.';
  return L.charAt(0).toUpperCase()+L.slice(1);
}
function cartaCfg(){
  const c=CFGEMP['carta_finiquito']||{};
  return {dest:c.dest||'Licenciado Miguel Ángel Jiménez Alvarado', sufijo:c.sufijo||'Sociedad Anónima de Capital Variable', lugar:c.lugar||'Pachuca de Soto, Hidalgo'};
}
/* ---------- Texto oficial de renuncia + recibo de finiquito (fuente ÚNICA) ---- */
const RENUNCIA_CSS=`body{font-family:'Times New Roman',serif;font-size:13.5px;line-height:1.7;color:#111;margin:0}
.pg{max-width:700px;margin:0 auto;padding:60px 40px 40px;min-height:88vh;text-align:justify}
h1{font-size:15px;text-align:center;letter-spacing:1px;margin-bottom:26px}
.fecha{text-align:right;margin-bottom:26px}
.firma{margin-top:80px;text-align:center}
.firma .linea{border-top:1px solid #111;width:330px;margin:0 auto;padding-top:6px}
.testigos{display:flex;justify-content:space-between;gap:40px;margin-top:70px;text-align:center}
.testigos div{flex:1}
.testigos .linea{border-top:1px solid #111;padding-top:6px;font-size:12px}
@media print{.pg{page-break-after:always;min-height:auto}}`;
function renunciaPagesHTML(w,o){
  const fmtL=d=>{const x=new Date((d||today())+'T12:00');return `${x.getDate()} de ${MES[x.getMonth()].toLowerCase()} del ${x.getFullYear()}`;};
  const EMP=`&ldquo;<b>${esc(o.razon)}</b>&rdquo; ${esc(o.sufijo||'')}`;
  const nom=esc(fullName(w)), puesto=esc(w.puesto||'TRABAJADOR'), monto=Number(o.monto)||0;
  return `<div class="pg">
    <h1>CARTA DE RENUNCIA</h1>
    <div class="fecha">${esc(o.lugar)} a ${fmtL(o.f1)}</div>
    <p><b>${esc(o.dest)}</b><br>P R E S E N T E</p>
    <p>Por medio de este conducto presento mi renuncia con carácter de irrevocable a partir del día ${fmtL(o.f1)}, fecha en que dejo de prestar mis servicios como <b>${puesto}</b>, que venía desempeñando en la empresa ${EMP}, dando así por terminada de manera voluntaria la relación de trabajo que tenía celebrada con la presente empresa por convenir así a mis intereses.</p>
    <p>Asimismo, dejo asentado que no se me adeuda cantidad alguna, ya que mi sueldo y demás prestaciones me han sido totalmente liquidados, lo que hago plasmando mi firma, así como mi huella dactilar en el presente, ante 2 testigos.</p>
    <p>Agradezco a usted sus atenciones, sin más por el momento, quedo de usted.</p>
    <div class="firma"><b>ATENTAMENTE</b><br><br><br><br><div class="linea"><b>${nom}</b><br>FIRMA Y HUELLA</div></div>
    <div class="testigos"><div><br><br><div class="linea">TESTIGO</div></div><div><br><br><div class="linea">TESTIGO</div></div></div>
  </div>
  <div class="pg">
    <h1>RECIBO FINIQUITO</h1>
    <div class="fecha">${esc(o.lugar)} a ${fmtL(o.f2)}</div>
    <p>Recibí de la empresa ${EMP}, la cantidad de: <b>$${money(monto)} (${numLetras(monto)})</b> por motivo de renuncia voluntaria con la misma.</p>
    <p>Este recibo causa finiquito y hago constar que ${EMP}, me ha concedido todas y cada una de las prestaciones a las cuales tengo derecho; de igual manera confirmo que no se me adeuda cantidad alguna en dinero, especie o de ningún otro tipo por concepto derivado de la relación laboral conforme a la Ley Federal del Trabajo. Hago constar que en el tiempo que estuve prestando mis servicios en la empresa mencionada anteriormente no sufrí accidentes de trabajo ni enfermedad alguna.</p>
    <p>Deslindo a la empresa ${EMP} de cualquier responsabilidad o adeudo hacia mi persona, quedando totalmente de acuerdo con lo que se menciona en este recibo de finiquito.</p>
    <p><b>${nom}</b>, declaro que recibí esta cantidad como pago que cubre el más amplio finiquito al término de mi contrato como <b>${puesto}</b> de ${EMP}, y manifiesto expresamente que no se me adeuda cantidad alguna por ningún concepto en virtud de haber sido pagadas todas y cada una de las prestaciones contractuales a las que tengo derecho, como salarios devengados, vacaciones y prima vacacional, aguinaldo, días de descanso obligatorios, etc., así como gratificaciones especiales por algún concepto que involuntariamente se hubiese omitido pagarme. En el desempeño de mis labores, no fui objeto de maltrato por parte de mi jefe inmediato, compañeros y/o representante legal. Expreso que no me reservo acción ni derecho alguno en contra de quien sus intereses representa por ningún concepto, por lo que se me otorga la más amplia liquidación.</p>
    <div class="firma"><br><br><div class="linea"><b>${nom}</b><br>FIRMA Y HUELLA</div></div>
  </div>`;
}
function renunciaOpts(w,monto,fecha){
  const cc=cartaCfg();
  const e=CFGEMP['empresa_'+empresaDeTrabajador(w)]||{razon:'COMERCIALIZADORA PLATINUM HIDALGUENSE'};
  const f=fecha||w.fecha_baja||today();   // MISMA fecha en carta y recibo (sin fechas distintas)
  return {razon:(e.razon||'').toUpperCase(),sufijo:cc.sufijo,dest:cc.dest,f1:f,f2:f,monto,lugar:cc.lugar};
}
/* Último día (domingo) de la semana de un cheque, según la fecha de inicio de la
   obra. Es la fecha con la que se llena el cheque y que DEBE salir igual en la
   carta de renuncia y el recibo de finiquito del legajo. */
function domingoDeSemana(sem){
  const W=parseInt(normSem(sem))||0; if(!W)return null;
  const base=new Date((OBRA.fecha_inicio?String(OBRA.fecha_inicio).slice(0,10):SEMANA1)+'T12:00');
  const d=new Date(base); d.setDate(base.getDate()+(W-1)*7+6);
  return d.toISOString().slice(0,10);
}
