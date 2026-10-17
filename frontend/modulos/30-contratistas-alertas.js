/* ---------- v21: CONTRATISTAS / REGISTRO REPSE ----------
   Bitácora 100% interna: NO envía, consulta ni registra nada en STPS,
   SAT o IMSS. Solo ayuda a no perder de vista el folio y la vigencia
   del registro REPSE de cada contratista. Verifica siempre el folio
   real en repse.stps.gob.mx — este módulo no lo valida por ti. */
async function cargarContratistas(){
  const {data,error}=await sb.from('contratistas').select('*');
  if(!error)CONTRATISTAS=data||[];
}
async function sincronizarContratistas(){
  if(!puedeEditarTrabajador())return;
  // agrega solos a la tabla los contratistas nuevos que aparezcan al capturar
  // trabajadores — no borra ni modifica los que ya existen.
  const nombres=[...new Set(WORKERS.map(w=>(w.contratista||'').trim()).filter(Boolean))];
  const nuevos=nombres.filter(n=>!CONTRATISTAS.some(c=>c.nombre===n));
  if(!nuevos.length)return;
  try{
    const {error}=await sb.from('contratistas').upsert(nuevos.map(n=>({nombre:n,creado_por:USER.email})),{onConflict:'nombre',ignoreDuplicates:true});
    if(error)return;
    await cargarContratistas();
  }catch(e){/* no es crítico: se reintenta en la próxima carga */}
}
function repseEstatus(c){
  if(c.repse_no_aplica)return 'NO APLICA';
  if(!c.repse_vigencia)return 'SIN CAPTURAR';
  const hoy=today(), en30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  if(c.repse_vigencia<hoy)return 'VENCIDO';
  if(c.repse_vigencia<=en30)return 'POR VENCER';
  return 'VIGENTE';
}
async function openContratistas(){
  await cargarContratistas();
  modal(`
    <div class="m-head"><h2>🪪 Contratistas — Registro REPSE</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="background:var(--blue-bg);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12.5px;line-height:1.7">
        Control interno del <b>Registro de Prestadoras de Servicios Especializados u Obras Especializadas (REPSE)</b>.
        <b>Esto NO envía ni consulta nada ante STPS, SAT o IMSS</b> — es tu bitácora para no dejar vencer un registro.
        Como Platinum es constructora, no puede subcontratar personal de construcción: los trabajadores de tus
        cuadrillas se <b>absorben como personal directo</b> tuyo, por eso la mayoría de estos nombres deben marcarse
        "Absorbido (no aplica REPSE)". Solo un <b>subcontratista real de servicio especializado ajeno a la
        construcción</b> (por ejemplo TRANSELECTRICA, vinculado al SIROC de la obra donde trabaja) requiere REPSE de
        verdad. Verifica siempre el folio en <a href="https://repse.stps.gob.mx" target="_blank">repse.stps.gob.mx</a>
        y confirma con tu contador o abogado laboral cualquier duda sobre un caso específico.
      </div>
      <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn dark" onclick="toggleNuevoContratista()">＋ Añadir contratista</button>
        <button class="btn" onclick="marcarAbsorbidosMasivo()">✔ Marcar como "Absorbido" a todos los que no tengan REPSE capturado</button>
      </div>
      <div id="ctr-nuevo" class="hide" style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px;background:var(--bg)">
        <div class="sect" style="margin-top:0">Nuevo contratista</div>
        <div class="grid" style="grid-template-columns:2fr 1fr 1fr">
          <div><label>Nombre del contratista *</label><input id="cn-nombre" placeholder="EJ. ELECTRIFICACIONES DEL CENTRO"></div>
          <div><label>RFC (opcional)</label><input id="cn-rfc"></div>
          <div><label>Situación</label><select id="cn-tipo" onchange="$('cn-repse-campos').classList.toggle('hide',this.value!=='REPSE')">
            <option value="ABSORBIDO">Absorbido (personal directo, no aplica REPSE)</option>
            <option value="REPSE">Subcontratista real con REPSE</option>
          </select></div>
        </div>
        <div id="cn-repse-campos" class="hide">
          <div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr;margin-top:8px">
            <div><label>Folio registro REPSE</label><input id="cn-reg"></div>
            <div><label>Actividad registrada</label><input id="cn-act"></div>
            <div><label>Vigencia hasta</label><input id="cn-vig" type="date"></div>
            <div><label>Vinculado al SIROC de la obra</label><select id="cn-obra"><option value="">— sin vincular —</option>${OBRAS.map(o=>`<option value="${o.id}">${esc(o.nombre)}</option>`).join('')}</select></div>
          </div>
        </div>
        <div style="margin-top:8px"><label>Notas (opcional)</label><input id="cn-notas"></div>
        <div style="margin-top:10px;text-align:right">
          <button class="btn" onclick="toggleNuevoContratista()">Cancelar</button>
          <button class="btn dark" onclick="crearContratista()">💾 Guardar contratista</button>
        </div>
        <div class="fhint" style="margin-top:8px">Al guardarlo, el nombre queda disponible de inmediato en el campo "Contratista" de las altas de trabajadores en cualquier obra. En cuanto le captures gente, saldrá automáticamente en la proyección general y en la proyección por contratista.</div>
      </div>
      <div id="ctr-lista"></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'lg');
  renderContratistasLista();
}
function toggleNuevoContratista(){
  const d=$('ctr-nuevo'); d.classList.toggle('hide');
  if(!d.classList.contains('hide'))$('cn-nombre').focus();
}
async function crearContratista(){
  const nombre=($('cn-nombre').value||'').trim().toUpperCase();
  if(!nombre){toast('Escribe el nombre del contratista.','err');return;}
  if(CONTRATISTAS.some(c=>c.nombre===nombre)){toast('Ese contratista ya existe en la lista.','err');return;}
  const esRepse=$('cn-tipo').value==='REPSE';
  markWrite();
  const {error}=await sb.from('contratistas').insert({
    nombre,
    rfc:($('cn-rfc').value||'').trim().toUpperCase(),
    repse_no_aplica:!esRepse,
    repse_registro:esRepse?($('cn-reg').value||'').trim().toUpperCase():'',
    repse_actividad:esRepse?($('cn-act').value||'').trim().toUpperCase():'',
    repse_vigencia:esRepse?($('cn-vig').value||null):null,
    obra_id:esRepse?($('cn-obra').value||null):null,
    notas:($('cn-notas').value||'').trim().toUpperCase(),
    creado_por:USER.email
  });
  if(error){toast('Error: '+error.message,'err');return;}
  toast(`Contratista "${nombre}" registrado${esRepse?' con REPSE':' como absorbido'} — ya puedes asignarle trabajadores en las altas.`,'ok');
  await cargarContratistas();
  ['cn-nombre','cn-rfc','cn-reg','cn-act','cn-vig','cn-notas'].forEach(id=>{if($(id))$(id).value='';});
  toggleNuevoContratista();
  renderContratistasLista();
  updateAlertas();
}
function renderContratistasLista(){
  if(!$('ctr-lista'))return;
  const rows=[...CONTRATISTAS].sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const colEst={VIGENTE:'#1e7b34','POR VENCER':'#b36b00',VENCIDO:'#b3261e','SIN CAPTURAR':'#6b7280','NO APLICA':'#6b7280'};
  const opcObras=`<option value="">— sin vincular —</option>`+OBRAS.map(o=>`<option value="${o.id}">${esc(o.nombre)}</option>`).join('');
  $('ctr-lista').innerHTML=rows.length?rows.map((c,i)=>{
    const est=repseEstatus(c);
    return `<div class="hist-item">
      <div class="hist-top"><span class="who">${esc(c.nombre)}</span><span class="badge" style="background:${colEst[est]};color:#fff">${est==='NO APLICA'?'ABSORBIDO':est}</span></div>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr;margin-top:8px">
        <div><label>RFC</label><input id="ctr-rfc-${i}" value="${esc(c.rfc||'')}"></div>
        <div><label>Folio registro REPSE</label><input id="ctr-reg-${i}" value="${esc(c.repse_registro||'')}"></div>
        <div><label>Actividad registrada</label><input id="ctr-act-${i}" value="${esc(c.repse_actividad||'')}"></div>
        <div><label>Vigencia hasta</label><input id="ctr-vig-${i}" type="date" value="${(c.repse_vigencia||'').slice(0,10)}"></div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:8px">
        <div><label style="display:flex;align-items:center;gap:6px;font-size:12px;text-transform:none;margin-top:8px">
          <input type="checkbox" id="ctr-na-${i}" style="width:auto" ${c.repse_no_aplica?'checked':''}> Absorbido como personal directo de Platinum (NO aplica REPSE)
        </label></div>
        <div><label>Vinculado al SIROC de la obra</label><select id="ctr-obra-${i}">${opcObras.replace(`value="${c.obra_id||''}"`,`value="${c.obra_id||''}" selected`)}</select></div>
      </div>
      <div style="margin-top:6px"><label>Notas</label><input id="ctr-not-${i}" value="${esc(c.notas||'')}"></div>
      <div style="margin-top:8px;text-align:right"><button class="btn dark" style="padding:4px 12px;font-size:12px" onclick="guardarContratista('${c.id}',${i})">💾 Guardar</button></div>
    </div>`;
  }).join(''):'<div class="empty">Sin contratistas registrados todavía — se llenan solos según captures trabajadores.</div>';
}
async function guardarContratista(id,i){
  markWrite();
  const upd={
    rfc:($('ctr-rfc-'+i).value||'').trim().toUpperCase(),
    repse_registro:($('ctr-reg-'+i).value||'').trim().toUpperCase(),
    repse_actividad:($('ctr-act-'+i).value||'').trim().toUpperCase(),
    repse_vigencia:$('ctr-vig-'+i).value||null,
    repse_no_aplica:$('ctr-na-'+i).checked,
    obra_id:$('ctr-obra-'+i).value||null,
    notas:($('ctr-not-'+i).value||'').trim().toUpperCase(),
    actualizado_por:USER.email
  };
  const {error}=await sb.from('contratistas').update(upd).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  toast('Contratista actualizado.','ok');
  await cargarContratistas();
  renderContratistasLista();
  updateAlertas();
}
async function marcarAbsorbidosMasivo(){
  const candidatos=CONTRATISTAS.filter(c=>!c.repse_no_aplica&&!c.repse_registro&&!c.repse_vigencia);
  if(!candidatos.length){toast('No hay contratistas pendientes por marcar.','err');return;}
  if(!confirm(`Se van a marcar ${candidatos.length} contratista(s) como "Absorbido (no aplica REPSE)":\n\n${candidatos.map(c=>c.nombre).join(', ')}\n\nNo se tocará ningún contratista que ya tenga folio o vigencia REPSE capturados. ¿Continuar?`))return;
  markWrite();
  const {error}=await sb.from('contratistas').update({repse_no_aplica:true,actualizado_por:USER.email}).in('id',candidatos.map(c=>c.id));
  if(error){toast('Error: '+error.message,'err');return;}
  toast(`${candidatos.length} contratista(s) marcados como absorbidos.`,'ok');
  await cargarContratistas();
  renderContratistasLista();
  updateAlertas();
}

/* ---------- ALERTAS ---------- */
function computeAlertas(){
  const hoy=today();
  const en14=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
  const en30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const act=WORKERS.filter(w=>w.estatus==='ACTIVO');
  // pendientes de IMPORTAR: recibos de nómina (PDF) y pago global por semana
  const recSet=recSetGlobal();
  /* Los que YA SON BAJA van en su propia línea: sus recibos históricos siguen
     haciendo falta para el expediente, pero no son trabajo de esta semana y no
     tienen por qué inflar la alerta de los activos. */
  const recFalt=[], recFaltBaja=[];
  WORKERS.forEach(w=>{const f=faltantesReciboDe(w,recSet);if(!f.length)return;
    const fila={nombre:fullName(w)+' → faltan S'+f.join(', S')};
    (w.estatus==='BAJA'?recFaltBaja:recFalt).push(fila);});
  const hoyW=isoWeekDe(OBRA,new Date());
  const pagWk=new Set((PAGOS||[]).map(p=>normSem(p.semana)));
  const actWk=new Set();
  (DOCSX||[]).filter(esRecibo).forEach(d=>actWk.add(normSem(d.semana)));
  (CHEQUES||[]).filter(c=>!c.eliminado).forEach(c=>actWk.add(normSem(c.semana)));
  const pagoFalt=[...actWk].map(s=>parseInt(s)).filter(n=>n>0&&n<hoyW&&n>=hoyW-8&&!pagWk.has(String(n))).sort((a,b)=>a-b).map(n=>({nombre:'Semana S'+n}));
  /* v36.2 · ALERTA URGENTE: semanas que YA tienen pago global pero donde algún
     trabajador activo se quedó SIN pago y SIN cheque (o su transferencia rebotó
     y nadie la repuso). Es la que más duele: alguien no cobró. */
  const sinPagar=[];
  try{
    [...pagWk].map(s=>parseInt(s)).filter(n=>n>0&&n<=hoyW).sort((a,b)=>b-a).slice(0,8).forEach(n=>{
      const S='S'+n;
      // solo si esa semana de verdad trae un pago GLOBAL (dispersión)
      const dela=(PAGOS||[]).filter(p=>normSem(p.semana)===String(n));
      const folios={};dela.forEach(p=>{const f=p.folio_lote||'';if(f)folios[f]=(folios[f]||0)+1;});
      const tieneGlobal=dela.some(p=>p.origen==='GLOBAL')||Object.values(folios).some(c=>c>1);
      if(!tieneGlobal)return;
      conciliaSemanaDatos(S).forEach(f=>{
        if(!['OK','CHEQUE EXPEDIDO','CHEQUE ENTREGADO'].includes(f.estado))
          sinPagar.push({nombre:`${S} · ${fullName(f.w)} — ${f.motivo}`,_sem:S,trabajador_id:f.w.id});
      });
    });
  }catch(e){/* nunca debe tumbar las alertas */}
  return [
    {k:'SINPAGO',icon:'🚨',txt:'URGENTE · Incidencias trabajador-semana pendientes de pago',items:sinPagar},
    {k:'PEND',icon:'⏳',txt:'Trabajadores PENDIENTES por activar',items:WORKERS.filter(w=>w.estatus==='PENDIENTE'&&(datosFaltantes(w).length>0||!w.fecha_alta||w.fecha_alta<=hoy))},
    {k:'PROG',icon:'📅',txt:'Altas programadas para una próxima semana (nada que hacer, se activan solas)',items:WORKERS.filter(w=>w.estatus==='PENDIENTE'&&datosFaltantes(w).length===0&&w.fecha_alta&&w.fecha_alta>hoy)},
    {k:'REPSEF',icon:'🏗️',txt:'Contratistas sin registro REPSE capturado',items:CONTRATISTAS.filter(c=>!c.repse_no_aplica&&!c.repse_vigencia)},
    {k:'REPSEV',icon:'📆',txt:'Registros REPSE por vencer en 30 días',items:CONTRATISTAS.filter(c=>!c.repse_no_aplica&&c.repse_vigencia&&c.repse_vigencia>=hoy&&c.repse_vigencia<=en30)},
    {k:'REPSEX',icon:'🚫',txt:'Registros REPSE VENCIDOS',items:CONTRATISTAS.filter(c=>!c.repse_no_aplica&&c.repse_vigencia&&c.repse_vigencia<hoy)},
    {k:'IMSSP',icon:'🏥',txt:'Altas/reingresos actuales pendientes de presentar ante el IMSS',items:WORKERS.filter(altaImssPendiente)},
    {k:'IMSS',icon:'📎',txt:'Acuses de alta IMSS por importar (alta ya presentada)',items:WORKERS.filter(acuseAltaPendiente)},
    {k:'IMSSC',icon:'🔎',txt:'Acuses IMSS archivados por cotejar: falta fecha del movimiento',items:WORKERS.filter(w=>estadoAcuseIMSS(w,'ALTA').porCotejar||(w.estatus==='BAJA'&&estadoAcuseIMSS(w,'BAJA').porCotejar))},
    {k:'RECIB',icon:'📥',txt:'Recibos de nómina por importar (PDF)',items:recFalt},
    {k:'RECIBB',icon:'📁',txt:'Recibos pendientes de trabajadores YA DADOS DE BAJA (expediente)',items:recFaltBaja},
    {k:'PAGOG',icon:'💸',txt:'Semanas sin pago global importado (revisa)',items:pagoFalt},
    {k:'DOCS',icon:'📋',txt:'Activos con documentación incompleta',items:act.filter(w=>docsOk(w)<DOCS.length)},
    {k:'CREAR',icon:'🪪',txt:'Tarjetas por solicitar (cuenta CREAR)',items:act.filter(w=>String(w.cuenta).toUpperCase()==='CREAR')},
    {k:'CAT',icon:'🧰',txt:'Puesto fuera del catálogo (corregir en su ficha)',items:WORKERS.filter(w=>w.estatus!=='BAJA'&&w.puesto&&!catalogoPuestos().includes(w.puesto))},
    {k:'FINIQ',icon:'🧾',txt:'Cheques de finiquito PENDIENTES de expedir',items:CHEQUES.filter(c=>c.estatus==='PENDIENTE'&&c.tipo_pago==='FINIQUITO')},
    {k:'REV',icon:'⚠️',txt:'Registros con marca REVISAR',items:WORKERS.filter(w=>(w.observaciones||'').includes('REVISAR'))},
    {k:'CONTR',icon:'📄',txt:'Contratos determinados que vencen en 14 días',items:act.filter(w=>w.fecha_fin_contrato&&w.fecha_fin_contrato>=hoy&&w.fecha_fin_contrato<=en14)},
    {k:'CONTRV',icon:'🚨',txt:'Contratos determinados VENCIDOS',items:act.filter(w=>w.fecha_fin_contrato&&w.fecha_fin_contrato<hoy)},
    {k:'SM',icon:'⚖️',txt:'Activos con SD por DEBAJO del mínimo CONASAMI ($'+FISC().sm+')',items:act.filter(w=>(Number(w.sd)||0)>0&&(Number(w.sd)||0)<FISC().sm)},
    {k:'NUMDUP',icon:'🔢',txt:'Números de trabajador DUPLICADOS en esta obra',items:(function(){const m={};WORKERS.forEach(w=>{if(w.no_trab!=null)(m[w.no_trab]=m[w.no_trab]||[]).push(w);});return Object.values(m).filter(g=>g.length>1).flat();})()},
    /* 2026-09-01: se quitó la alerta "cuotas INFONAVIT por recalcular". Solo
       avisaba; el recálculo lo aplica ahora el cron bimestral del Script 63.
       En su lugar queda una alerta que SÍ significa algo: que el bimestre en
       curso todavía NO se recalculó. Si el cron corrió, esto no aparece. */
    {k:'INFOAUTO',icon:'🏠',txt:'El recálculo bimestral del INFONAVIT no se ha aplicado en este bimestre',
     items:(function(){
      if(!(DESC||[]).some(d=>String(d.tipo||'').toUpperCase()==='INFONAVIT'&&d.activo&&d.recurrente))return [];
      // OJO: RECALCINF es un `let` de nivel superior, NO vive en window
      const r=RECALCINF;
      if(r===undefined)return [];                    // todavía no se consulta
      if(r&&r.es_bimestre_actual&&r.resultado==='OK')return [];
      return [{nombre:!r
        ? 'Falta correr el Script 63 en Supabase.'
        : r.nunca
          ? 'El Script 63 ya está instalado, pero el recálculo no se ha aplicado ni una vez. Córrelo en el editor SQL de Supabase con:  select recalcular_creditos_infonavit();'
          : r.resultado==='ERROR'
            ? `El último intento FALLÓ (${fmtD(r.created_at)}): ${String(r.mensaje||'').slice(0,90)}`
            : `El último fue del bimestre ${r.bimestre||'—'}; el de ${bimestreActual()} está pendiente`}];
    })()}
  ].filter(a=>a.items.length);
}
function updateAlertas(){
  // 'PROG' (altas programadas para una próxima semana) es informativo, no urgente:
  // no cuenta para el número rojo de la campanita, pero sí se ve dentro del modal.
  const n=computeAlertas().filter(a=>a.k!=='PROG').reduce((s,a)=>s+a.items.length,0);
  const b=$('alert-badge');
  if(b){b.style.display=n?'block':'none';b.textContent=n>99?'99+':n;}
  const sbb=$('sb-alert-badge');   // v36: el mismo contador en el panel lateral
  if(sbb){sbb.style.display=n?'inline-block':'none';sbb.textContent=n>99?'99+':n;}
}
const ALERT_ACC={RECIB:{fn:'openFaltanRecibos',txt:'Ver / importar recibos'},PAGOG:{fn:'openImportPago',txt:'Importar pago'},IMSS:{fn:'openPdfImport',txt:'Importar acuses'},CREAR:{fn:'openRequisicion',txt:'Requisición de tarjetas'},SINPAGO:{fn:'openRevisarSemana',txt:'Revisar y resolver'}};
function openAlertas(){
  const als=computeAlertas();
  modal(`
    <div class="m-head"><h2>🔔 Pendientes de la obra · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      ${als.length?als.map(a=>`
        <div class="hist-item">
          <div class="hist-top"><span style="font-size:16px">${a.icon}</span><span class="who">${a.txt}</span>
            <span class="badge PENDIENTE" style="margin-left:auto">${a.items.length}</span>${ALERT_ACC[a.k]?`<button class="btn dark" style="padding:2px 10px;font-size:11px;margin-left:8px" onclick="closeModal();${ALERT_ACC[a.k].fn}()">${ALERT_ACC[a.k].txt}</button>`:''}</div>
          <div style="font-size:12.5px;color:var(--mut)">${a.items.slice(0,12).map(x=>esc(x.nombre||fullName(x))).join(' · ')}${a.items.length>12?` · y ${a.items.length-12} más...`:''}</div>
        </div>`).join('')
      :'<div class="empty"><div class="big">✅</div>Sin pendientes en esta obra. Todo en orden.</div>'}
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`);
}

