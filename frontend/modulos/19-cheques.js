/* ---------- MÓDULO DE CHEQUES ---------- */
function renderChqStats(){
  const activos=CHEQUES.filter(c=>!c.eliminado);
  const p=activos.filter(c=>c.estatus==='PENDIENTE'), e=activos.filter(c=>c.estatus==='EXPEDIDO'),
        g=activos.filter(c=>c.estatus==='ENTREGADO'), x=activos.filter(c=>c.estatus==='CANCELADO');
  const sum=a=>a.reduce((s,c)=>s+(Number(c.importe)||0),0);
  $('chq-stats').innerHTML=`
    <div class="stat a"><div class="n">${p.length}</div><div class="l">Pendientes · $${money(sum(p))}</div></div>
    <div class="stat g"><div class="n">${e.length}</div><div class="l">Expedidos · $${money(sum(e))}</div></div>
    <div class="stat b"><div class="n">${g.length}</div><div class="l">Entregados</div></div>
    <div class="stat r"><div class="n">${x.length}</div><div class="l">Cancelados</div></div>
    <div class="stat"><div class="n">${activos.length}</div><div class="l">Total cheques</div></div>`;
}
function setChqSort(k){if(CSORT.k===k)CSORT.asc=!CSORT.asc;else{CSORT.k=k;CSORT.asc=true;}
  // sincroniza el selector de consecutivo con el ordenamiento actual
  if($('chq-f-consec'))$('chq-f-consec').value=(k==='consecutivo')?(CSORT.asc?'asc':'desc'):'';
  renderCheques();}
/* v35: ordenar cheques por número consecutivo (numérico), asc o desc */
function chqOrdenConsec(v){
  if(!v){CSORT={k:'semana',asc:false};} // "sin orden" vuelve al orden por defecto (semana)
  else{CSORT={k:'consecutivo',asc:v==='asc'};}
  renderCheques();
}
function chqFiltered(){
  const q=$('chq-q').value.trim().toUpperCase(), fe=$('chq-f-estatus').value, ft=$('chq-f-tipo').value;
  let rows=CHEQUES.filter(c=>{
    if(c.eliminado)return false;
    if(fe&&c.estatus!==fe)return false;
    if(ft&&c.tipo_pago!==ft)return false;
    if(q){const hay=[c.nombre,c.curp,c.num_cheque,c.consecutivo,c.contratista,c.semana].join(' ').toUpperCase();if(!hay.includes(q))return false;}
    return true;
  });
  const k=CSORT.k;
  rows.sort((a,b)=>{
    let x=a[k],y=b[k];
    if(k==='semana'){x=parseInt(String(x).replace(/\D/g,''))||0;y=parseInt(String(y).replace(/\D/g,''))||0;}
    // consecutivo: orden NUMÉRICO (que 10 vaya después de 2, no antes) usando el
    // número que traiga; los vacíos siempre al final sin importar asc/desc
    if(k==='consecutivo'){
      const nx=String(x??'').replace(/\D/g,''),ny=String(y??'').replace(/\D/g,'');
      if(nx===''&&ny==='')return 0; if(nx==='')return 1; if(ny==='')return -1;
      return CSORT.asc?(+nx)-(+ny):(+ny)-(+nx);
    }
    if(x==null||x==='')return 1;if(y==null||y==='')return -1;
    if(typeof x==='number'&&typeof y==='number')return CSORT.asc?x-y:y-x;
    return CSORT.asc?String(x).localeCompare(String(y)):String(y).localeCompare(String(x));
  });
  return rows;
}
/* ---------- CHEQUES vs RECIBOS DE NÓMINA (2026-08-06) ----------
   Lee los recibos de nómina archivados de una semana (neto + tipo sueldo/finiquito),
   los cruza con los cheques y: crea los cheques PENDIENTES que falten (con el neto
   del recibo), avisa los que NO coinciden en monto y los que faltan de sueldo o de
   finiquito. El monto se lee del PDF ("Neto pagado"). */
let _RECCACHE={};
function openChequesDesdeRecibos(){
  modal(`
    <div class="m-head"><h2>🧾 Cheques vs recibos de nómina · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:10px">Compara recibos con los cheques existentes. Un recibo de sueldo no obliga a crear cheque: la nómina normal se revisa con las transferencias históricas y el flujo confirmado del sábado. Aquí sólo se preparan finiquitos positivos que no tengan cheque ni excepción de transferencia.</p>
      <div class="grid" style="grid-template-columns:1fr auto;align-items:end;gap:10px">
        <div><label>Semana</label><input id="cr-sem" value="S${isoWeek()}" placeholder="S17"></div>
        <div><button class="btn dark" onclick="crAnalizar()">Analizar recibos</button></div>
      </div>
      <div id="cr-out" style="margin-top:12px;max-height:360px;overflow:auto"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark hide" id="cr-btn" onclick="crCrearFaltantes()">＋ Crear cheques faltantes (PENDIENTE)</button>
    </div>`,'lg');
}
async function crAnalizar(){
  const sem=($('cr-sem').value||'').trim(); const ns=normSem(sem);
  if(!ns){toast('Escribe la semana (ej. S17).','err');return;}
  const recs=(DOCSX||[]).filter(d=>esRecibo(d)&&normSem(d.semana)===ns);
  if(!recs.length){$('cr-out').innerHTML='<div class="empty">No hay recibos de nómina archivados en la semana S'+ns+' en esta obra. Impórtalos en 📥 Importar → Acuses IMSS y recibos (categoría RECIBO DE NÓMINA).</div>';$('cr-btn').classList.add('hide');return;}
  $('cr-out').innerHTML=skeletonRows(Math.min(9,Math.max(3,recs.length)),'1.5fr .8fr 1fr 1fr 1fr','Descargando y leyendo '+recs.length+' recibo(s) de nómina...');
  const rows=[];
  for(const d of recs){
    let info=_RECCACHE[d.archivo];
    if(!info){
      try{const {data:blob,error}=await sb.storage.from('expedientes').download(d.archivo);
        if(error||!blob)throw 0;
        info=window.PLATINUM_RESPALDO_RECIBO.parsear(await pdfBytesToText(new Uint8Array(await blob.arrayBuffer())));
      }catch(e){info={neto:null,tipo:'?',err:true};}
      _RECCACHE[d.archivo]=info;
    }
    const w=WORKERS.find(x=>x.id===d.trabajador_id)||null;
    if(d.nomina_tipo){if(info.tipo&&info.tipo!==d.nomina_tipo)info={...info,err:true};else info={...info,tipo:d.nomina_tipo};}
    const tp=info.tipo==='FINIQUITO'?'FINIQUITO':'CHEQUE';
    const chk=(CHEQUES||[]).find(c=>!c.eliminado&&c.estatus!=='CANCELADO'&&c.trabajador_id===d.trabajador_id&&normSem(c.semana)===ns&&String(c.tipo_pago||'').toUpperCase()===tp);
    let estado='OK';
    if(info.err||info.neto==null)estado='ILEGIBLE';
    else if(tp==='FINIQUITO'&&w&&finTransDe(w,sem))estado='TRANSFERENCIA_FIN';
    else if(!chk)estado=tp==='FINIQUITO'?'FALTA':'REVISION_PAGO';
    else if(Math.round((Number(chk.importe)||0)*100)!==Math.round(info.neto*100))estado='NOCOINCIDE';
    if(info.tipo==='FINIQUITO'&&w&&['FALTA','OK','NOCOINCIDE'].includes(estado)){
      const respaldo=await chqResolverNeto({obra_id:OBRA.id,trabajador_id:w.id,semana:'S'+ns,tipo_pago:'FINIQUITO'});
      if(respaldo.error){estado='ILEGIBLE';info={...info,err:true};}
      else{info={...info,neto:respaldo.neto};if(chk)estado=Math.round(Number(chk.importe)*100)===Math.round(info.neto*100)?'OK':'NOCOINCIDE';}
    }
    rows.push({d,w,info,tp,chk,estado});
  }
  window._CR={rows,ns,sem:'S'+ns};
  const c=e=>rows.filter(x=>x.estado===e).length;
  const badge={OK:'imp-COINCIDE',FALTA:'imp-CONFLICTO',NOCOINCIDE:'imp-SINREGISTRO',ILEGIBLE:'imp-SINREGISTRO',REVISION_PAGO:'imp-ASIGNAR',TRANSFERENCIA_FIN:'imp-ASIGNAR'};
  const lbl={OK:'✔ coincide',FALTA:'＋ falta cheque de finiquito',NOCOINCIDE:'⚠ no coincide',ILEGIBLE:'⚠ ilegible',REVISION_PAGO:'Revisar pago, no exige cheque',TRANSFERENCIA_FIN:'Excepción de transferencia'};
  $('cr-out').innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <span class="imp-tag imp-COINCIDE">${c('OK')} coinciden</span>
      <span class="imp-tag imp-SINREGISTRO">${c('NOCOINCIDE')} no coinciden</span>
      <span class="imp-tag imp-CONFLICTO">${c('FALTA')} finiquitos sin cheque</span>
      <button class="btn" onclick="PLATINUM_PAGOS_SABADO.abrir(${Number(ns)})">Revisar nómina, transferencias y pendientes</button>
      ${c('ILEGIBLE')?`<span class="imp-tag imp-SINREGISTRO">${c('ILEGIBLE')} ilegibles</span>`:''}
    </div>
    <div class="imp-row head" style="grid-template-columns:1.5fr .8fr 1fr 1fr 1fr"><span>Trabajador</span><span>Tipo</span><span>Neto recibo</span><span>Cheque</span><span>Estado</span></div>
    ${rows.map(x=>`<div class="imp-row" style="grid-template-columns:1.5fr .8fr 1fr 1fr 1fr">
      <span><b>${esc(x.w?fullName(x.w):(x.d.nombre_archivo||'—'))}</b><br><span style="color:var(--mut);font-size:11px">#${(x.w&&x.w.no_trab)??'—'}</span></span>
      <span style="font-size:11.5px">${x.info.tipo==='FINIQUITO'?'<b style="color:var(--accent)">FINIQUITO</b>':'sueldo'}</span>
      <span>${x.info.neto!=null?'$'+money(x.info.neto):'<span style="color:var(--amber)">?</span>'}</span>
      <span>${x.chk?'$'+money(x.chk.importe):'—'}</span>
      <span class="imp-tag ${badge[x.estado]}">${lbl[x.estado]}</span>
    </div>`).join('')}
    <p style="font-size:11px;color:var(--mut);margin-top:8px">Un recibo no acredita pago bancario ni obliga a crear cheque de sueldo. La revisión de pagos distingue transferencias, parciales y cheques expedidos; los pendientes eliminados o cancelados no cuentan como cheque vigente.</p>`;
  $('cr-btn').classList.toggle('hide',!rows.some(x=>x.estado==='FALTA'&&x.tp==='FINIQUITO'&&x.w&&x.info.neto>0));
}
async function crCrearFaltantes(){
  const st=window._CR||{}; const falt=(st.rows||[]).filter(x=>x.estado==='FALTA'&&x.tp==='FINIQUITO'&&x.w&&x.info.neto>0&&!finTransDe(x.w,st.sem));
  if(!falt.length){toast('No hay cheques faltantes con monto legible.','err');return;}
  const nf=falt.filter(x=>x.tp==='FINIQUITO').length, ns=falt.length-nf;
  if(!confirm(`¿Crear ${falt.length} cheque(s) PENDIENTE(S) de la semana ${st.sem}?\n\n${ns} de sueldo + ${nf} de finiquito, con el neto de cada recibo.\nTodo queda en el historial y se puede editar o eliminar después.`))return;
  markWrite();let ok=0,err=0;
  const W=parseInt(st.ns)||0;
  for(const x of falt){
    const respaldo=await chqResolverNeto({obra_id:x.w.obra_id,trabajador_id:x.w.id,semana:st.sem,tipo_pago:'FINIQUITO'});
    if(respaldo.error||respaldo.neto!==x.info.neto){err++;continue;}
    const {error}=await sb.from('cheques').insert({obra_id:x.w.obra_id,trabajador_id:x.w.id,no_trab:x.w.no_trab,contratista:x.w.contratista,
      nombre:fullName(x.w),puesto:x.w.puesto,curp:x.w.curp,semana:st.sem,periodo:periodoCorto(W),importe:x.info.neto,
      tipo_pago:x.tp,estatus:'PENDIENTE',observaciones:'GENERADO DESDE RECIBO DE NÓMINA ('+x.info.tipo+')',creado_por:USER.email});
    error?err++:ok++;
  }
  closeModal();
  toast(err?`Creados ${ok}, ${err} con error.`:`✔ ${ok} cheque(s) PENDIENTE(S) creados desde los recibos.`,err?'err':'ok');
  await loadObraData(OBRA.id);
}
/* El importe se toma del NOI importado; sin NOI, del PDF individual de la
   misma obra, semana, persona Y tipo. Nunca sustituir finiquito por sueldo. */
async function chqResolverNeto(c){
  if(!window.PLATINUM_FLOWS)return {error:'El flujo integrado no cargó. Recarga antes de expedir.'};
  return window.PLATINUM_FLOWS.resolverNeto(c);
}
function chqCapturaExistente(c,w,semana,tipo,neto){
  return !!(c?.id&&c.estatus==='PENDIENTE'&&!c.eliminado&&c.obra_id===OBRA?.id
    &&c.trabajador_id&&c.trabajador_id===w?.id&&normSem(c.semana)===normSem(semana)
    &&c.tipo_pago===tipo&&Number(c.importe)===Number(neto)&&Number(neto)>0);
}
function chqMostrarRespaldo(r,existente=false){
  const aviso=$('c-neto-fuente');if(!aviso)return;
  aviso.textContent=`Importe verificado: $${money(r.neto)} · ${r.origen} · ${r.desde} al ${r.hasta}.`;
  if(r.advertencias?.length){const nota=document.createElement('div');nota.textContent='Lectura adicional del PDF pendiente. El importe ya tiene respaldo en '+r.origen+'. '+r.advertencias.join(' ');aviso.appendChild(nota);}
  if(existente){const texto=document.createElement('div');texto.textContent='Cheque existente: puedes capturar su número y consecutivo sin autorizar o reabrir el cierre. La vinculación al cierre se revisa por separado.';aviso.appendChild(texto);}
  if(!existente&&r.expedicion&&!r.expedicion.requisitos_cierre_cumplidos){
    const texto=document.createElement('div');texto.textContent='Expedición pendiente: '+r.expedicion.pendiente;aviso.appendChild(texto);
    if(r.expedicion.cierre_id){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Revisar cierre S'+r.semana;
      b.onclick=()=>{if(confirm('Se abrirá el cierre sin guardar esta captura. Los números que acabas de escribir no se han registrado. ¿Continuar?'))window.PLATINUM_FLOWS.abrirCierre(r.expedicion.cierre_id);};aviso.appendChild(b);}
  }
}
async function chqTraerRecibo(){
  const nom=($('c-nombre')?.value||'').trim().toUpperCase(),w=WORKERS.find(x=>fullName(x).toUpperCase()===nom);
  if(!w){toast('Elige primero un trabajador registrado.','err');return;}
  const rec={obra_id:OBRA.id,trabajador_id:w.id,semana:$('f-c-semana')?.value,tipo_pago:$('c-tipo')?.value};
  const r=await chqResolverNeto(rec),input=$('f-c-importe'),aviso=$('c-neto-fuente');
  if(!aviso||aviso!==$('c-neto-fuente')||rec.obra_id!==OBRA?.id||rec.trabajador_id!==(WORKERS.find(x=>fullName(x).toUpperCase()===($('c-nombre')?.value||'').trim().toUpperCase())?.id)||rec.semana!==$('f-c-semana')?.value||rec.tipo_pago!==$('c-tipo')?.value)return;
  if(r.error){aviso.textContent=r.error;if(r.puede_leer_pdf&&window.PLATINUM_RECIBOS_IA){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Leer recibos con Gemini';b.onclick=()=>window.PLATINUM_RECIBOS_IA.abrir(normSem(rec.semana));aviso.appendChild(b);}toast(r.error,'err');return;}
  if(input)input.value=r.neto.toFixed(2);
  const previo=CHEQUES.find(c=>c.id===$('c-save')?.dataset?.chequeId);
  chqMostrarRespaldo(r,chqCapturaExistente(previo,w,rec.semana,rec.tipo_pago,r.neto));
  toast(`Importe $${money(r.neto)} verificado contra ${r.origen}.`,'ok');
}
function renderCheques(){
  if(!window._FOLIOCHK){window._FOLIOCHK=1;chequeFolioAviso();}
  const rows=chqFiltered();
  if(!rows.length){$('chq-tbody').innerHTML='<tr><td colspan="10"><div class="empty"><div class="big">🧾</div>Sin cheques que coincidan.<br>Usa <b>＋ Nuevo cheque</b> o registra una baja con finiquito.</div></td></tr>';return;}
  $('chq-tbody').innerHTML=rows.map(c=>`
    <tr onclick="openChequeForm('${c.id}')">
      <td>${c.no_trab??''}</td>
      <td><b>${esc(c.nombre)}</b></td>
      <td>${esc(c.contratista)}</td>
      <td>${esc(c.semana)}</td>
      <td>${esc(c.periodo)}</td>
      <td>$${money(c.importe)}</td>
      <td>${c.tipo_pago==='FINIQUITO'?'<b style="color:var(--red)">FINIQUITO</b>':esc(c.tipo_pago)}</td>
      <td>${esc(c.num_cheque)||'<span style="color:var(--amber);font-weight:700">SIN NÚMERO</span>'}</td>
      <td>${esc(c.consecutivo)}</td>
      <td><span class="badge ${c.estatus}">${c.estatus}</span></td>
    </tr>`).join('');
}
function openChequeForm(id){
  const c=id?CHEQUES.find(x=>x.id===id):null;
  modal(`
    <div class="m-head"><h2>${c?'Cheque · '+esc(c.nombre):'Nuevo cheque · '+esc(OBRA.nombre)}</h2>
      ${c?`<span class="badge ${c.estatus}">${c.estatus}</span>`:''}
      <button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
        <div class="c2"><label>Trabajador (escribe para buscar)</label>
          <input id="c-nombre" list="dl-trab" value="${esc(c?c.nombre:'')}" onchange="chqAutofill()"></div>
        ${fld('c-no_trab','No. trab.',c?(c.no_trab??''):'',{type:'number'})}
        ${fld('c-contratista','Contratista',c?c.contratista:'')}
        ${fld('c-puesto','Puesto',c?c.puesto:'')}
        ${fld('c-curp','CURP',c?c.curp:'',{extra:'maxlength="18"'})}
        ${fld('c-semana','Semana (ej. S15)',c?c.semana:'S'+isoWeek())}
        ${fld('c-periodo','Periodo (se llena solo al cambiar la semana)',c?c.periodo:periodoCorto(isoWeek()))}
        ${fld('c-importe','Importe verificado ($)',c?(c.importe??''):'',{type:'number',extra:'step="0.01" readonly'})}
        <div style="display:flex;align-items:end"><button type="button" class="btn" style="width:100%;padding:8px;font-size:12px" onclick="chqTraerRecibo()" title="Verifica NOI o recibo de la misma semana y tipo">🧾 Verificar neto</button></div>
        <div class="c3" id="c-neto-fuente" style="font-size:12px;color:var(--amber)">El importe se verificará automáticamente antes de guardar.</div>
        ${c&&puedeEliminarCheque()&&c.estatus==='PENDIENTE'&&!c.num_cheque&&!c.consecutivo?`<div class="c3"><button type="button" class="btn" onclick="openCorregirImporteCheque('${c.id}')">✎ Corregir importe manualmente</button></div>`:''}
        <div><label>Tipo de pago</label><select id="c-tipo" onchange="chqTraerRecibo()">${['CHEQUE','FINIQUITO'].map(t=>`<option ${(c&&c.tipo_pago)===t?'selected':''}>${t}</option>`).join('')}</select></div>
        ${fld('c-num','Número de cheque',c?c.num_cheque:'',{hint:'Al capturarlo, el estatus pasa a EXPEDIDO automáticamente.'})}
        ${fld('c-consec','No. consecutivo',c?c.consecutivo:'')}
        <div><label>Estatus</label><select id="c-estatus">${['PENDIENTE','EXPEDIDO','ENTREGADO','CANCELADO'].map(s2=>`<option ${((c&&c.estatus)||'PENDIENTE')===s2?'selected':''}>${s2}</option>`).join('')}</select></div>
        ${fld('c-obs','Observaciones',c?c.observaciones:'',{cls:'c3'})}
      </div>
      <datalist id="dl-trab">${WORKERS.map(w=>`<option data-id="${w.id}">${esc(fullName(w))}</option>`).join('')}</datalist>
      <p style="margin-top:12px;font-size:12px;color:var(--mut)">Un cheque expedido puede marcarse <b>CANCELADO</b>. Si hubo un error de captura o en el cheque físico, <b>Eliminar</b> lo retira del listado con auditoría. Los folios capturados requieren confirmar que no fue entregado ni cobrado; se conservan en la papelera.</p>
    </div>
    <div class="m-foot">
      ${c&&puedeEliminarCheque()?`<button class="btn danger" style="background:#7a1414;border-color:#7a1414;margin-right:auto" onclick="eliminarChequeErroneo('${c.id}')">🗑 Eliminar (captura errónea)</button>`:''}
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" id="c-save" data-cheque-id="${esc(c?.id||'')}" onclick="saveCheque(${c?`'${c.id}'`:'null'})">💾 Guardar</button>
    </div>`,'md');
  /* v36.1 · BUG CORREGIDO: `fld()` crea los inputs con el prefijo `f-`
     (id="f-c-semana"), así que `$('c-semana')` siempre devolvía null y esta
     línea reventaba al abrir el formulario — por eso el PERIODO nunca se
     llenaba solo al escribir la semana. */
  const elSem=$('f-c-semana'), elPer=$('f-c-periodo');
  if(elSem&&elPer){elSem.oninput=()=>{const n=parseInt(String(elSem.value).replace(/\D/g,''));if(n>0)elPer.value=periodoCorto(n);};elSem.onchange=()=>chqTraerRecibo();}
  if(c&&c.estatus==='PENDIENTE'&&$('c-neto-fuente'))$('c-neto-fuente').textContent='Importe guardado: $'+money(c.importe)+'. Verifica el neto antes de expedir. La corrección manual requiere el permiso de cheques.';
}
function chqAutofill(){
  const nom=$('c-nombre').value.trim().toUpperCase();
  const w=WORKERS.find(x=>fullName(x).toUpperCase()===nom);
  if(!w)return;
  $('f-c-no_trab').value=w.no_trab??'';$('f-c-contratista').value=w.contratista||'';
  $('f-c-puesto').value=w.puesto||'';$('f-c-curp').value=w.curp||'';
  chqTraerRecibo();
}
/* ============================================================
   v36 · REGLA ANTI-DUPLICADOS DE CHEQUES (espejo del Script 52)
   Máximo 1 cheque de SUELDO y 1 de FINIQUITO por trabajador y semana.
   NO cuentan: los CANCELADOS, los de la papelera, ni el propio cheque que
   se está editando. Devuelve el cheque que estorba, o null si está limpio.
   ============================================================ */
function chequeDuplicado(rec,idActual){
  const sem=normSem(rec.semana);
  if(!sem)return null;                                  // sin semana legible no aplica
  if(String(rec.estatus||'').toUpperCase()==='CANCELADO')return null;
  const mismoTrab=c=>rec.trabajador_id
    ? c.trabajador_id===rec.trabajador_id
    : (!c.trabajador_id&&String(c.nombre||'').toUpperCase()===String(rec.nombre||'').toUpperCase());
  return (CHEQUES||[]).find(c=>
    c.id!==idActual && !c.eliminado &&
    String(c.estatus||'').toUpperCase()!=='CANCELADO' &&
    String(c.tipo_pago||'')===String(rec.tipo_pago||'') &&
    normSem(c.semana)===sem &&
    mismoTrab(c)
  )||null;
}
async function saveCheque(id){
  const contextoInicial={obra:OBRA?.id,form:$('c-save')};
  const g=i=>{const el=$('f-'+i)||$(i);return el?el.value.trim():'';};
  if(!g('c-nombre')){toast('Indica el nombre del trabajador o beneficiario.','err');return;}
  let estatus=$('c-estatus').value;
  if(estatus==='CANCELADO'&&(!g('c-num')||!g('c-consec'))){toast('Sólo se cancela un cheque físico con número y consecutivo. Si nunca se llenó, elimina la captura.','err');return;}
  if(g('c-num')&&estatus==='PENDIENTE')estatus='EXPEDIDO';
  const w=WORKERS.find(x=>fullName(x).toUpperCase()===g('c-nombre').toUpperCase());
  const previo=id?CHEQUES.find(x=>x.id===id):null;
  let neto=Number(g('c-importe'));
  if(!previo||previo.estatus==='PENDIENTE'){
    const captura={obra_id:OBRA.id,trabajador_id:w?.id,semana:g('c-semana'),tipo_pago:$('c-tipo').value,nombre:g('c-nombre')};
    const respaldo=await chqResolverNeto(captura);
    if(OBRA?.id!==contextoInicial.obra||$('c-save')!==contextoInicial.form||g('c-semana')!==captura.semana||$('c-tipo')?.value!==captura.tipo_pago||g('c-nombre')!==captura.nombre){toast('La captura cambió durante la verificación. Vuelve a verificar el cheque.','err');return;}
    if(respaldo.error){toast(respaldo.error,'err');return;}
    if(previo&&Number(neto)!==Number(respaldo.neto)){
      toast('El importe guardado o capturado difiere del neto de NOI/recibo ($'+money(respaldo.neto)+'). Usa Verificar neto para adoptar ese importe, o revisa la conciliación. No se cambiará automáticamente.','err');return;
    }
    const existente=chqCapturaExistente(previo,w,captura.semana,captura.tipo_pago,respaldo.neto);
    chqMostrarRespaldo(respaldo,existente);
    if(existente&&['EXPEDIDO','ENTREGADO'].includes(estatus)&&(!g('c-num')||!g('c-consec'))){toast('Captura el número de cheque y su consecutivo antes de expedir.','err');return;}
    if(!existente&&['EXPEDIDO','ENTREGADO'].includes(estatus)&&respaldo.expedicion&&!respaldo.expedicion.requisitos_cierre_cumplidos){toast('Importe verificado. '+respaldo.expedicion.pendiente,'err');return;}
    neto=respaldo.neto;
    if($('f-c-importe'))$('f-c-importe').value=neto.toFixed(2);
  }
  if(!Number.isFinite(neto)||neto<=0){toast('Se requiere un neto positivo comprobado.','err');return;}
  const rec={
    obra_id:OBRA.id, trabajador_id:(w?w.id:null),
    nombre:g('c-nombre').toUpperCase(), no_trab:g('c-no_trab')?parseInt(g('c-no_trab')):null,
    contratista:g('c-contratista').toUpperCase(), puesto:g('c-puesto').toUpperCase(),
    curp:g('c-curp').toUpperCase(), semana:g('c-semana').toUpperCase(), periodo:g('c-periodo').toUpperCase(),
    importe:neto, tipo_pago:$('c-tipo').value,
    num_cheque:g('c-num'), consecutivo:g('c-consec'), estatus, observaciones:g('c-obs').toUpperCase()
  };
  const dupNum=rec.num_cheque&&CHEQUES.find(x=>x.num_cheque===rec.num_cheque&&x.id!==id&&x.estatus!=='CANCELADO');
  if(dupNum){toast(`El número de cheque ${rec.num_cheque} ya está registrado para ${dupNum.nombre}.`,'err');return;}
  /* v36 · REGLA ABSOLUTA (Script 52): por trabajador y semana solo puede haber
     1 cheque de SUELDO y 1 de FINIQUITO. La base lo impide con un índice único
     + trigger; aquí se avisa ANTES de guardar, con nombre y folio del previo. */
  const choque=chequeDuplicado(rec,id);
  if(choque){
    toast(`Ya existe un cheque de ${rec.tipo_pago==='FINIQUITO'?'FINIQUITO':'SUELDO'} de ${rec.nombre} en la semana ${rec.semana} `+
          `(${choque.num_cheque?'folio '+choque.num_cheque:'sin folio'} · $${money(choque.importe)} · ${choque.estatus}). `+
          `Solo se permite 1 de sueldo y 1 de finiquito por semana: elimina la captura si no se llenó; cancela únicamente un cheque físico con número y consecutivo.`,'err');
    return;
  }
  $('c-save').innerHTML='<span class="spin"></span> Guardando...';
  markWrite();
  let error;
  if(id){({error}=await sb.from('cheques').update(rec).eq('id',id));}
  else{rec.creado_por=USER.email;({error}=await sb.from('cheques').insert(rec));}
  if(error){
    $('c-save').textContent='💾 Guardar';
    // el candado de la base habla en español: se muestra tal cual
    if(/CHEQUE DUPLICADO/i.test(error.message||'')||error.code==='23505'&&/ux_cheque_sueldo_finiquito/i.test(error.message||''))
      toast(String(error.message).replace(/^.*CHEQUE DUPLICADO/i,'CHEQUE DUPLICADO'),'err');
    else toast('Error: '+error.message,'err');
    return;
  }
  closeModal();toast('Cheque guardado.','ok');
  await loadObraData(OBRA.id);
}
/* Eliminar cheque = mover a la papelera (eliminado=true). Admin o permiso puntual.
   No borra físicamente (la base lo prohíbe con un trigger): deja de aparecer
   y de contar en todo, pero es recuperable desde Supabase. Para un cheque
   numerado erróneo se exige confirmación y se conserva la anulación física. */
async function eliminarChequeErroneo(id){
  if(!puedeEliminarCheque()){toast('No tienes permiso para eliminar cheques.','err');return;}
  const c=CHEQUES.find(x=>x.id===id); if(!c)return;
  if(c.estatus==='ENTREGADO'){
    toast('Este cheque figura entregado. Revisa su entrega y pago antes de eliminarlo.','err');return;
  }
  const fisico=!!(String(c.num_cheque||'').trim()||String(c.consecutivo||'').trim());
  window._CHQ_ELIMINACION={id,obra:c.obra_id,fisico,numero:String(c.num_cheque||''),consecutivo:String(c.consecutivo||'')};
  const aviso=fisico?'<p class="fhint">Cheque físico con error: se retirará del listado y quedará CANCELADO en la papelera, conservando número, consecutivo e historial. Si tiene una aplicación de pago, sólo el administrador puede retirarla; un cierre PAGADO requiere reapertura. El saldo vuelve a pendiente sin borrar comprobantes.</p>':'<p class="fhint">Registro sin número ni consecutivo: se elimina del listado, no se marca CANCELADO. Se conserva auditoría.</p>';
  modal(`
    <div class="m-head"><h2>🗑 Eliminar cheque (captura errónea)</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      ${aviso}
      <p style="font-size:13px">Vas a mandar este cheque a la <b>papelera</b>. Dejará de aparecer en la lista, los conteos y las exportaciones. El registro original seguirá disponible para auditoría.</p>
      <div class="kv"><b>Trabajador</b><span>${esc(c.nombre)||'—'}</span></div>
      <div class="kv"><b>Consecutivo</b><span>${esc(c.consecutivo)||'—'}</span></div>
      <div class="kv"><b>Número de cheque</b><span>${esc(c.num_cheque)||'(vacío)'}</span></div>
      <div class="kv"><b>Importe</b><span>$${money(c.importe)}</span></div>
      <div class="kv"><b>Estatus</b><span>${esc(c.estatus)}</span></div>
      <label style="margin-top:12px">Motivo obligatorio (queda registrado)</label>
      <input id="del-motivo" maxlength="1000" placeholder="Ej. finiquito pagado por transferencia; cheque no expedido">
      ${fisico?'<label style="display:flex;gap:8px;margin-top:14px"><input type="checkbox" id="del-fisico-confirm">Confirmo que este cheque no fue entregado ni cobrado y que el folio erróneo quedó anulado o resguardado.</label>':''}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn danger" style="background:#7a1414;border-color:#7a1414" id="del-chq-btn" onclick="doEliminarCheque('${id}')">🗑 Sí, eliminar</button>
    </div>`,'md');
}
async function doEliminarCheque(id){
  if(!puedeEliminarCheque()){toast('No tienes permiso para eliminar cheques.','err');return;}
  const motivo=($('del-motivo')&&$('del-motivo').value.trim())||'';
  if(!motivo){toast('Indica el motivo de eliminación.','err');return;}
  const captura=window._CHQ_ELIMINACION;
  const actual=CHEQUES.find(x=>x.id===id);
  const fisico=!!(String(actual?.num_cheque||'').trim()||String(actual?.consecutivo||'').trim());
  if(fisico&&(!captura||captura.id!==id||captura.obra!==OBRA?.id||captura.fisico!==true)){
    toast('Vuelve a abrir la confirmación del cheque físico.','err');return;
  }
  if(fisico&&(!$('del-fisico-confirm')?.checked||motivo.length<10)){
    toast('Describe el error (mínimo 10 caracteres) y confirma que el cheque físico no fue entregado ni cobrado.','err');return;
  }
  const btn=$('del-chq-btn');if(!btn||btn.disabled)return;
  btn.disabled=true;btn.innerHTML='<span class="spin"></span> Eliminando...';
  markWrite();
  try{
    const {data,error}=await sb.rpc(fisico?'control_eliminar_cheque_fisico':'control_eliminar_cheque',fisico?
      {p_cheque_id:id,p_motivo:motivo,p_numero_esperado:captura.numero,p_consecutivo_esperado:captura.consecutivo,p_confirmado:true}:
      {p_cheque_id:id,p_motivo:motivo});
    if(error)throw error;
    if(data?.id!==id||data?.eliminado!==true)throw new Error('No se confirmó la eliminación del cheque.');
  }catch(error){
    btn.disabled=false;btn.innerHTML='🗑 Sí, eliminar';
    toast('No se confirmó la operación: '+error.message,'err');
    return;
  }
  delete window._CHQ_ELIMINACION;
  closeModal();toast('Cheque movido a la papelera; comprobantes y pagos conservados.','ok');
  try{
    await loadObraData(OBRA.id);
    if($('pg-out')&&PAGOIMP)pgRender();
    else if($('cp-out'))cpBuild();
  }catch(error){toast('El cheque sí se eliminó, pero no se pudo actualizar el listado. Recarga la página.','err');}
}
function exportCheques(){
  const rows_=chqFiltered();
  if(!rows_.length){toast('No hay cheques con los filtros actuales.','err');return;}
  const rows=[],styles=[];
  rows.push([`CONTROL DE CHEQUES — ${OBRA.nombre} — ${new Date().toLocaleDateString('es-MX')}`]); styles.push(ST.title);
  rows.push(['NO. TRAB.','CONTRATISTA','NOMBRE COMPLETO','PUESTO','CURP','SEMANA','PERIODO','IMPORTE','TIPO PAGO','NÚMERO DE CHEQUE','CONSECUTIVO','ESTATUS']); styles.push(ST.head);
  const rs=[ST.cellC,ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.money,ST.cellC,ST.cellC,ST.cellC,ST.cellC];
  const rsP=[ST.fin,ST.fin,ST.fin,ST.fin,ST.fin,ST.fin,ST.fin,ST.finMoney,ST.fin,ST.fin,ST.fin,ST.fin];
  rows_.forEach(c=>{rows.push([c.no_trab??'',c.contratista,c.nombre,c.puesto,c.curp,c.semana,c.periodo,Number(c.importe)||0,c.tipo_pago,c.num_cheque,c.consecutivo,c.estatus]);
    styles.push(c.estatus==='PENDIENTE'?rsP:rs);});
  const tot=rows_.reduce((s,c)=>s+(Number(c.importe)||0),0);
  rows.push(['','','','','','','TOTAL',tot,'','','','']); styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total,ST.total,ST.total,ST.total]);
  const ws=buildSheet(rows,styles,[9,14,36,24,20,8,16,12,12,16,13,12],[{s:{r:0,c:0},e:{r:0,c:11}}],[{hpt:26},{hpt:24}]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'CHEQUES');
  dl(wb,`CHEQUES_${OBRA.nombre.slice(0,20).replace(/\s+/g,'_')}_${today()}.xlsx`);
  toast(`Excel de cheques generado: ${rows_.length} registros.`,'ok');
}

