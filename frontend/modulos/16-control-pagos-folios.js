/* ---------- Control de pagos: cheque + transferencia unificados ---------- */
function cpBuild(){
  const map=new Map();
  const key=(tid,nom,ns)=>(tid||('N:'+_pgNorm(nom)))+'|'+ns;
  (CHEQUES||[]).filter(c=>!c.eliminado).forEach(c=>{const ns=normSem(c.semana);const k=key(c.trabajador_id,c.nombre,ns);const o=map.get(k)||{tid:c.trabajador_id,nombre:c.nombre,sem:ns,chq:[],pag:[]};o.chq.push(c);if(!o.nombre)o.nombre=c.nombre;map.set(k,o);});
  (PAGOS||[]).forEach(p=>{const ns=normSem(p.semana);const w=WORKERS.find(x=>x.id===p.trabajador_id);const k=key(p.trabajador_id,w?fullName(w):p.titular,ns);const o=map.get(k)||{tid:p.trabajador_id,nombre:(w?fullName(w):p.titular),sem:ns,chq:[],pag:[]};o.pag.push(p);map.set(k,o);});
  (FINTRANS||[]).forEach(f=>{const w=WORKERS.find(x=>x.id===f.trabajador_id);const ns=String(f.semana),k=key(f.trabajador_id,w?fullName(w):'',ns);const o=map.get(k)||{tid:f.trabajador_id,nombre:w?fullName(w):'',sem:ns,chq:[],pag:[]};o.finTrans=f;map.set(k,o);});
  const rows=[...map.values()];
  rows.forEach(o=>{
    const w=o.tid?WORKERS.find(x=>x.id===o.tid):null; if(w)o.nombre=fullName(w); o.no=w?w.no_trab:null;
    const chqAct=o.chq.filter(c=>String(c.estatus||'').toUpperCase()!=='CANCELADO'&&c.importe!=null&&c.importe!=='');
    const pagOk=window.PLATINUM_FLOWS.pagosUnicos(o.pag.filter(p=>String(p.estado||'').toUpperCase()==='EXITOSO'));
    o.dup=chqAct.length>0&&pagOk.length>0;
    o.rech=o.pag.some(p=>String(p.estado||'').toUpperCase()==='RECHAZADO')&&!pagOk.length;
    o.chqAct=chqAct; o.pagOk=pagOk;
  });
  rows.sort((a,b)=>(b.dup-a.dup)||((parseInt(b.sem)||0)-(parseInt(a.sem)||0))||((a.no||9e9)-(b.no||9e9)));
  window._CP=rows;
  cpRender();
}
function cpRender(){
  const rows=window._CP||[];
  const fs=normSem($('cp-sem')?$('cp-sem').value:'');
  const soloDup=$('cp-dup')&&$('cp-dup').checked;
  const filt=rows.filter(o=>(!fs||o.sem===fs)&&(!soloDup||o.dup));
  const nDup=rows.filter(o=>o.dup).length, nRech=rows.filter(o=>o.rech).length;
  const money2=v=>v==null||v===''?'—':'$'+money(v);
  const body=filt.map(o=>`<div class="imp-row" style="grid-template-columns:1.6fr .5fr 1.3fr 1.3fr 1fr${o.dup?';background:var(--amber-bg)':''}">
    <span><b>${esc(o.nombre||'—')}</b>${o.no!=null?`<br><span style="color:var(--mut);font-size:11px">#${o.no}</span>`:''}</span>
    <span style="font-size:12px">S${esc(o.sem)}</span>
    <span style="font-size:11.5px">${o.chq.length?o.chq.map(c=>`${c.tipo_pago==='FINIQUITO'?'🏁':'🧾'} ${money2(c.importe)} <span style="color:var(--mut)">${esc(c.estatus||'')}</span>`).join('<br>'):'<span style="color:var(--mut)">—</span>'}</span>
    <span style="font-size:11.5px">${o.pag.length?o.pag.map(p=>`💸 ${money2(p.importe)} <span style="color:${String(p.estado).toUpperCase()==='RECHAZADO'?'var(--red)':'var(--mut)'}">${esc(p.estado||'')}</span>`).join('<br>'):'<span style="color:var(--mut)">—</span>'}</span>
    <span style="font-size:11px">${o.dup?`<b style="color:var(--red)">⚠ POSIBLE DOBLE</b>${o.chqAct[0]?` <button class="btn danger" style="padding:1px 7px;font-size:10px" onclick="pagoCancelarCheque('${o.chqAct[0].id}')">Revisar cheque</button>`:''}`:o.finTrans?(o.finTrans.estado==='CONCILIADO_BANCO'?'<b style="color:var(--green)">Finiquito conciliado</b>':`<b style="color:var(--amber)">Finiquito reportado · falta BBVA</b>${esAdmin()?` <button class="btn" style="padding:1px 7px;font-size:10px" onclick="openFiniquitoTransferenciaAdmin('${o.tid}')">Vincular pago</button>`:''}`):(o.rech?'<b style="color:var(--red)">✗ rechazado</b>':'<span style="color:var(--green)">✔</span>')}</span>
  </div>`).join('');
  $('cp-out').innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
      ${nDup?`<span class="imp-tag imp-CONFLICTO" style="background:var(--red);color:#fff">⚠ ${nDup} posible(s) pago(s) doble(s)</span>`:'<span class="imp-tag imp-COINCIDE">Sin pagos dobles</span>'}
      ${nRech?`<span class="imp-tag imp-CONFLICTO">${nRech} rechazado(s)</span>`:''}
      ${puedeEditarTrabajador()?'<button class="btn dark" onclick="openFiniquitoTransferenciaAdmin()">🏁 Finiquito por transferencia autorizada</button>':''}
      <span style="margin-left:auto;font-size:12px">Semana <input id="cp-sem" style="width:70px;padding:4px 6px" placeholder="todas" value="${$('cp-sem')?esc($('cp-sem').value):''}" oninput="cpRender()"> · <label style="font-size:12px"><input type="checkbox" id="cp-dup" style="width:auto" ${soloDup?'checked':''} onchange="cpRender()"> solo dobles</label></span>
    </div>
    <div class="imp-row head" style="grid-template-columns:1.6fr .5fr 1.3fr 1.3fr 1fr"><span>Trabajador</span><span>Sem</span><span>Cheque</span><span>Transferencia</span><span>Estado</span></div>
    ${body||'<div class="empty">Sin registros para ese filtro.</div>'}`;
}
function openControlPagos(){
  modal(`
    <div class="m-head"><h2>🔁 Control de pagos · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:10px">Une cheques y transferencias por trabajador y semana. Un finiquito por transferencia requiere autorización del administrador; si el pago todavía no está importado de BBVA se mostrará como <b>reportado, pendiente de conciliar</b>.</p>
      <div id="cp-out"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark" onclick="exportControlPagos()">⬇ Exportar Excel</button>
    </div>`,'lg');
  cpBuild();
}
async function openFiniquitoTransferenciaAdmin(trabajadorId=''){
  try{
    if(!window.PLATINUM_FLOWS)throw Error('Recarga la plataforma para usar el flujo integrado.');
    const p=await window.PLATINUM_FLOWS.call('PERMISOS');if(!p.transferencia)throw Error('No tienes autorización para esta excepción.');
    if(trabajadorId){const w=WORKERS.find(x=>x.id===trabajadorId);if(!w)throw Error('Trabajador no encontrado.');return window.PLATINUM_FLOWS.transferencia(w.id,isoWeekDe(OBRA,new Date(w.fecha_baja+'T12:00')));}
    const bajas=WORKERS.filter(w=>w.estatus==='BAJA'&&w.fecha_baja&&Number(w.monto_finiquito)>0).sort((a,b)=>Number(a.no_trab)-Number(b.no_trab));
    modal(ctrlNav('Finiquito por transferencia autorizada')+`<div class="m-body"><p>Selecciona el finiquito. El servidor comprobará el permiso específico, NOI y la transferencia importada.</p><select id="ft-elegir">${bajas.map(w=>`<option value="${w.id}">#${esc(w.no_trab)} · ${esc(fullName(w))}</option>`).join('')}</select></div><div class="m-foot"><button class="btn dark" onclick="openFiniquitoTransferenciaAdmin($('ft-elegir').value)">Continuar</button></div>`,'md');
  }catch(e){toast(e.message,'err');}
}
function finTransActualizarFormulario(){
  const w=WORKERS.find(x=>x.id===$('ft-trab')?.value);if(!w)return;
  const sem=isoWeekDe(OBRA,new Date(w.fecha_baja+'T12:00'));
  const reg=finTransDe(w,sem);
  $('ft-resumen').innerHTML=`<div style="padding:9px;border:1px solid var(--border);border-radius:8px;font-size:12px"><b>S${sem} · Finiquito $${money(w.monto_finiquito)}</b><br>${reg?`Estado: ${reg.estado==='CONCILIADO_BANCO'?'conciliado con BBVA':'declarado; falta vincular BBVA'}`:'Método actual: cheque por defecto'}</div>`;
  const pagos=PAGOS.filter(p=>p.trabajador_id===w.id&&normSem(p.semana)===String(sem)
    &&String(p.estado).toUpperCase()==='EXITOSO'&&String(p.medio).toUpperCase()==='TRANSFERENCIA'
    &&Math.abs(Number(p.importe)-Number(w.monto_finiquito))<=0.01);
  $('ft-pago').innerHTML='<option value="">Aún no importada — quedará por conciliar</option>'+pagos.map(p=>`<option value="${p.id}">$${money(p.importe)} · ${esc(p.fecha_pago||'sin fecha')} · ${esc(p.folio_lote||p.nombre_archivo||'sin folio')}</option>`).join('');
  $('ft-guardar').disabled=!!reg&&reg.estado==='CONCILIADO_BANCO';
}
async function finTransGuardar(){
  if(!esAdmin()){toast('Permiso de administrador requerido.','err');return;}
  const w=WORKERS.find(x=>x.id===$('ft-trab')?.value),pago=$('ft-pago')?.value||null;
  if(!w)return;
  const sem=isoWeekDe(OBRA,new Date(w.fecha_baja+'T12:00')),reg=finTransDe(w,sem);
  const motivo=$('ft-motivo').value.trim();
  if(motivo.length<10){toast('Describe el motivo en al menos 10 caracteres.','err');return;}
  if(reg&&!pago){toast('El caso ya está declarado. Selecciona el pago BBVA importado para conciliarlo.','err');return;}
  if(!confirm(`¿Autorizar el finiquito de ${fullName(w)} por TRANSFERENCIA, S${sem}, $${money(w.monto_finiquito)}?\n\nEl cheque pendiente sin número se anulará. ${pago?'El pago BBVA quedará vinculado.':'NO existe pago BBVA vinculado: quedará por conciliar.'}`))return;
  if(prompt('Segunda confirmación del administrador: escribe CONFIRMAR TRANSFERENCIA')!=='CONFIRMAR TRANSFERENCIA'){
    toast('Confirmación cancelada.','err');return;
  }
  $('ft-guardar').disabled=true;markWrite();
  const {data,error}=await sb.rpc('control_marcar_finiquito_transferencia',{
    p_trabajador:w.id,p_semana:sem,p_pago_id:pago,p_fecha:$('ft-fecha').value||null,
    p_referencia:$('ft-ref').value.trim()||null,p_motivo:motivo,p_confirmacion:'CONFIRMAR TRANSFERENCIA'
  });
  if(error){$('ft-guardar').disabled=false;toast('No se aplicó el cambio: '+error.message,'err');return;}
  await loadObraData(OBRA.id);
  toast(data?.estado==='CONCILIADO_BANCO'?'Finiquito conciliado con pago BBVA.':'Finiquito por transferencia registrado; comprobante BBVA pendiente.','ok');
  openControlPagos();
}
function exportControlPagos(){
  const rows=window._CP||[]; if(!rows.length){toast('No hay datos para exportar.','err');return;}
  const aoa=[],styles=[];
  aoa.push([`CONTROL DE PAGOS — ${OBRA.nombre} — ${new Date().toLocaleDateString('es-MX')}`]);styles.push(ST.title);
  aoa.push(['NO.','TRABAJADOR','SEMANA','CHEQUE(S)','TRANSFERENCIA(S)','ALERTA']);styles.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cellC,ST.cell,ST.cell,ST.cell];
  rows.forEach(o=>{
    const chq=o.chq.map(c=>`${c.tipo_pago==='FINIQUITO'?'FINIQUITO':'CHEQUE'} ${c.importe!=null?'$'+money(c.importe):''} (${c.estatus||''})`).join(' | ');
    const pag=o.pag.map(p=>`TRANSF ${p.importe!=null?'$'+money(p.importe):''} (${p.estado||''})`).join(' | ');
    aoa.push([o.no??'',o.nombre||'','S'+o.sem,chq,pag,o.dup?'POSIBLE PAGO DOBLE':(o.rech?'RECHAZADO':'')]);styles.push(rs);
  });
  const ws=buildSheet(aoa,styles,[7,30,9,34,34,20],[{s:{r:0,c:0},e:{r:0,c:5}}],[{hpt:24},{hpt:26}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1+rows.length,c:5}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'CONTROL PAGOS');
  dl(wb,`CONTROL_PAGOS_${OBRA.nombre.slice(0,16).replace(/\s+/g,'_')}_${today()}.xlsx`);
  toast('Excel de control de pagos generado.','ok');
}

/* ============================================================
   CONTROL DE FOLIOS DE CHEQUE (Script 46, tabla folios_cheque)
   Numeración GLOBAL: detecta huecos en el consecutivo de los cheques capturados
   (ej. del 0000365 al 0000367 falta el 0000366) y permite capturar el MOTIVO del
   salto (a veces el jefe/contadoras toman cheques sueltos). Los folios con motivo
   dejan de contar como pendientes.
   ============================================================ */
const _cfNum=c=>{const d=String(c==null?'':c).replace(/\D/g,'');return d===''?null:parseInt(d,10);};
async function cfCargar(){
  const [{data:ch},{data:fj}]=await Promise.all([
    fetchAllRows(()=>sb.from('cheques').select('consecutivo,num_cheque,nombre,semana,estatus,eliminado')),
    fetchAllRows(()=>sb.from('folios_cheque').select('*'))
  ]);
  const chAll=(ch||[]).filter(c=>!c.eliminado);
  // folios presentes (consecutivo numérico) → mapa numero→cheque
  const presentes=new Map(); let ancho=7;
  chAll.forEach(c=>{const n=_cfNum(c.consecutivo);if(n!=null){presentes.set(n,c);ancho=Math.max(ancho,String(c.consecutivo).replace(/\D/g,'').length);}});
  const just=new Map(); (fj||[]).forEach(f=>{const k=String(f.numero).replace(/\D/g,'');if(k)just.set(String(parseInt(k,10)),f);});
  const nums=[...presentes.keys()].sort((a,b)=>a-b);
  const huecos=[]; let overflow=false;
  if(nums.length>=2){
    for(let k=0;k<nums.length-1;k++){
      const a=nums[k], b=nums[k+1];
      for(let x=a+1;x<b;x++){
        huecos.push(x);
        if(huecos.length>400){overflow=true;break;}
      }
      if(overflow)break;
    }
  }
  return {presentes,just,huecos,ancho,overflow,total:presentes.size,min:nums[0],max:nums[nums.length-1]};
}
async function openControlFolios(){
  modal(`<div class="m-head"><h2>📋 Control de folios de cheque</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body"><div id="cf-out">${skeletonRows(6,'1fr 2fr .7fr','Analizando el consecutivo de los cheques...')}</div></div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button><button class="btn dark" id="cf-xls" onclick="exportFolios()" style="display:none">⬇ Exportar Excel</button></div>`,'lg');
  const r=await cfCargar(); window._CF=r; cfRender();
}
function _cfPad(n){const a=(window._CF&&window._CF.ancho)||7;return String(n).padStart(a,'0');}
function cfRender(){
  const r=window._CF; if(!r){return;}
  const norm=n=>String(n);
  const sinJust=r.huecos.filter(n=>!r.just.has(norm(n)));
  const conJust=r.huecos.filter(n=>r.just.has(norm(n)));
  const row=n=>{
    const j=r.just.get(norm(n));
    return j
      ? `<div class="imp-row" style="grid-template-columns:1fr 2fr .7fr">
          <span><b>${_cfPad(n)}</b></span>
          <span style="font-size:12px">${esc(j.motivo||'—')}<br><span style="color:var(--mut);font-size:10.5px">${esc(j.capturado_por||'')} · ${fmtD(j.created_at)}</span></span>
          <span><button class="btn danger" style="padding:2px 8px;font-size:11px" onclick="quitarFolioJust('${norm(n)}')">Quitar</button></span>
        </div>`
      : `<div class="imp-row" style="grid-template-columns:1fr 2fr .7fr;background:var(--amber-bg)">
          <span><b>${_cfPad(n)}</b></span>
          <span><input id="cf-mot-${norm(n)}" placeholder="Motivo del salto (ej. lo tomó el jefe)" style="width:100%;padding:5px 7px"></span>
          <span><button class="btn dark" style="padding:2px 8px;font-size:11px" onclick="justificarFolio('${norm(n)}')">Guardar</button></span>
        </div>`;
  };
  $('cf-out').innerHTML=`
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:8px">Numeración global. Del folio <b>${_cfPad(r.min)}</b> al <b>${_cfPad(r.max)}</b> hay <b>${r.total}</b> cheques capturados. Un hueco = un folio físico que no se registró; captura el motivo y deja de aparecer como pendiente.</p>
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      ${sinJust.length?`<span class="imp-tag imp-CONFLICTO" style="background:var(--red);color:#fff">⚠ ${sinJust.length} salto(s) sin justificar</span>`:'<span class="imp-tag imp-COINCIDE">✔ Sin saltos pendientes</span>'}
      ${conJust.length?`<span class="imp-tag imp-COINCIDE">${conJust.length} justificado(s)</span>`:''}
      ${r.overflow?'<span class="imp-tag imp-SINREGISTRO">Hay muchísimos huecos: revisa si algún consecutivo se capturó mal</span>':''}
    </div>
    ${(sinJust.length||conJust.length)?`<div class="imp-row head" style="grid-template-columns:1fr 2fr .7fr"><span>Folio saltado</span><span>Motivo</span><span></span></div>`:''}
    ${sinJust.map(row).join('')}${conJust.map(row).join('')}
    ${(!sinJust.length&&!conJust.length)?'<div class="empty">No se detectaron folios saltados en el consecutivo.</div>':''}`;
  if($('cf-xls'))$('cf-xls').style.display=(sinJust.length||conJust.length)?'':'none';
}
async function justificarFolio(numero){
  const inp=$('cf-mot-'+numero); const motivo=inp?inp.value.trim():'';
  if(!motivo){toast('Escribe el motivo del salto.','err');return;}
  markWrite();
  const {error}=await sb.from('folios_cheque').insert({numero:String(numero),motivo:motivo.toUpperCase(),capturado_por:USER.email});
  if(error){if(/folios_cheque.*does not exist|relation .*folios_cheque/i.test(error.message||'')){toast('Falta correr el Script 46 (tabla folios_cheque) en Supabase.','err');return;}toast('Error: '+error.message,'err');return;}
  toast('Folio '+_cfPad(numero)+' justificado.','ok');
  const r=await cfCargar(); window._CF=r; cfRender();
}
async function quitarFolioJust(numero){
  if(!confirm('¿Quitar la justificación del folio '+_cfPad(numero)+'? Volverá a aparecer como salto pendiente.'))return;
  markWrite();
  const {error}=await sb.from('folios_cheque').delete().eq('numero',String(numero));
  if(error){toast('Error: '+error.message,'err');return;}
  const r=await cfCargar(); window._CF=r; cfRender();
}
function exportFolios(){
  const r=window._CF; if(!r)return;
  const rows=[],styles=[];
  rows.push([`CONTROL DE FOLIOS DE CHEQUE — ${new Date().toLocaleDateString('es-MX')}`]);styles.push(ST.title);
  rows.push(['FOLIO SALTADO','ESTADO','MOTIVO','CAPTURADO POR']);styles.push(ST.head);
  const rs=[ST.cellC,ST.cellC,ST.cell,ST.cell];
  r.huecos.forEach(n=>{const j=r.just.get(String(n));rows.push([_cfPad(n),j?'JUSTIFICADO':'SIN JUSTIFICAR',j?j.motivo:'',j?j.capturado_por:'']);styles.push(rs);});
  const ws=buildSheet(rows,styles,[16,16,44,26],[{s:{r:0,c:0},e:{r:0,c:3}}],[{hpt:24},{hpt:26}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1+r.huecos.length,c:3}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'FOLIOS');
  dl(wb,`CONTROL_FOLIOS_CHEQUE_${today()}.xlsx`);
  toast('Excel de folios generado.','ok');
}
/* Aviso automático al entrar a Cheques: si hay saltos sin justificar, avisa una vez. */
async function chequeFolioAviso(){
  try{
    const r=await cfCargar();
    const sinJust=r.huecos.filter(n=>!r.just.has(String(n))).length;
    if(sinJust>0)toast(`⚠ Hay ${sinJust} folio(s) de cheque saltado(s) sin justificar. Revisa "Control de folios".`,'err');
  }catch(e){/* si falta el Script 46 u otra cosa, no molesta */}
}
/* CONCILIACIÓN TOTAL por una semana cerrada. El esperado sale del snapshot
   inmutable del cierre/NOI; no se recalcula hoy con datos que pudieron cambiar. */
function concSemanaDefault(){
  const cs=(CIERRES||[]).filter(c=>c.estado!=='CANCELADO'&&Number(c.semana)>0);
  return String(cs.length?Math.max(...cs.map(c=>Number(c.semana))):parseInt(normSem(semObra()))||isoWeekDe(OBRA,new Date()));
}
async function concFuentesSemana(ns){
  const n=parseInt(normSem(ns))||0;if(!n)throw new Error('Semana inválida');
  const [{data:ch,error:ech},{data:pg,error:epg},{data:cc,error:ecc},{data:cn,error:ecn},docRpc]=await Promise.all([
    fetchAllRows(()=>sb.from('cheques').select('*').eq('obra_id',OBRA.id)),
    fetchAllRows(()=>sb.from('pagos').select('*').eq('obra_id',OBRA.id)),
    fetchAllRows(()=>sb.from('control_cierres_nomina').select('*').eq('obra_id',OBRA.id).eq('semana',n).neq('estado','CANCELADO')),
    fetchAllRows(()=>sb.from('control_conciliacion_noi').select('*').eq('obra_id',OBRA.id)),
    sb.rpc('conciliacion_documental_semana',{p_obra:OBRA.id,p_semana:n})
  ]);
  if(ech||epg||ecc||ecn)throw new Error((ech||epg||ecc||ecn).message);
  CHEQUES=(ch||[]).filter(c=>!c.eliminado);PAGOS=pg||[];
  CIERRES=(CIERRES||[]).filter(c=>!(c.obra_id===OBRA.id&&Number(c.semana)===n)).concat(cc||[]);
  CTRLNOI=cn||[];
  if(!docRpc.error)return docRpc.data||[];
  /* Compatibilidad durante el despliegue: si aún falta la migración 80,
     consulta los documentos paginados y filtrados por la obra. */
  const {data:docs,error:ed}=await fetchAllRows(()=>sb.from('documentos')
    .select('trabajador_id,categoria,semana,nombre_archivo,created_at')
    .eq('obra_id',OBRA.id).eq('anulado',false).in('categoria',RECIBO_CATS));
  if(ed)throw new Error(ed.message);
  const m=new Map();
  (docs||[]).filter(d=>normSem(d.semana)===String(n)).forEach(d=>{
    let x=m.get(d.trabajador_id);if(!x){x={trabajador_id:d.trabajador_id,recibos_pdf:0,cfdi_xml:0,cfdi_total:0,ultimo_documento:d.created_at};m.set(d.trabajador_id,x);}
    if(String(d.categoria).toUpperCase()==='RECIBO_NOMINA')x.recibos_pdf++;
    if(String(d.categoria).toUpperCase()==='CFDI_NOMINA'){
      x.cfdi_xml++;const z=String(d.nombre_archivo||'').match(/\$\s*([\d,]+(?:\.\d+)?)/);x.cfdi_total+=z?Number(z[1].replace(/,/g,'')):0;
    }
  });
  return [...m.values()];
}
async function concBuild(){
  const ns=normSem($('conc-sem')?$('conc-sem').value:concSemanaDefault());
  if(!ns){toast('Indica una semana válida.','err');return;}
  const out=$('conc-out');if(out)out.innerHTML=skeletonRows(8,'1.4fr .8fr .8fr .8fr .8fr .8fr 1.5fr','Conciliando cierre, pagos y comprobantes...');
  const btn=$('conc-refresh');if(btn)btn.disabled=true;
  try{
    const docs=await concFuentesSemana(ns), dm=new Map((docs||[]).map(x=>[x.trabajador_id,x]));
    const cIntegrado=(CIERRES||[]).find(c=>Number(c.semana)===Number(ns)&&c.estado!=='CANCELADO');
    const integrado=cIntegrado&&window.PLATINUM_FLOWS?await window.PLATINUM_FLOWS.call('DETALLE',{cierre_id:cIntegrado.id}):null;
    window._CONC_CIERRE_INTEGRADO=cIntegrado?.id||null;
    const map=new Map(), getRow=w=>{let o=map.get(w.id);if(!o){o={w,sem:ns,chq:[],pag:[],esp:0,tipos:new Set()};map.set(w.id,o);}return o;};
    ctrlEsperadosPagoSemana(ns).forEach(e=>{const o=getRow(e.w);o.esp+=Number(e.monto)||0;o.tipos.add(e.tipo||'NOMINA');});
    (CHEQUES||[]).filter(c=>!c.eliminado&&c.trabajador_id&&normSem(c.semana)===ns&&String(c.estatus||'').toUpperCase()!=='CANCELADO')
      .forEach(c=>{const w=WORKERS.find(x=>x.id===c.trabajador_id);if(w)getRow(w).chq.push(c);});
    (PAGOS||[]).filter(p=>p.trabajador_id&&normSem(p.semana)===ns)
      .forEach(p=>{const w=WORKERS.find(x=>x.id===p.trabajador_id);if(w)getRow(w).pag.push(p);});
    dm.forEach((d,tid)=>{const w=WORKERS.find(x=>x.id===tid);if(w)getRow(w);});
    const rows=[...map.values()];
    rows.forEach(o=>{
      const d=dm.get(o.w.id)||{};
      const chqPag=o.chq.filter(c=>['EXPEDIDO','ENTREGADO'].includes(String(c.estatus||'').toUpperCase()));
      const chqPend=o.chq.filter(c=>String(c.estatus||'').toUpperCase()==='PENDIENTE');
      const transfOk=window.PLATINUM_FLOWS.pagosUnicos(o.pag.filter(p=>String(p.estado||'').toUpperCase()==='EXITOSO'));
      o.pagCheque=chqPag.reduce((s,c)=>s+(Number(c.importe)||0),0);
      o.chequePendiente=chqPend.reduce((s,c)=>s+(Number(c.importe)||0),0);
      o.pagTransf=transfOk.reduce((s,p)=>s+(Number(p.importe)||0),0);o.pagado=o.pagCheque+o.pagTransf;
      o.pdfN=Number(d.recibos_pdf)||0;o.xmlN=Number(d.cfdi_xml)||0;o.cfdiAmt=Number(d.cfdi_total)||0;
      o.info=[];o.flags=[];
      if(chqPag.length&&transfOk.length)o.flags.push('DOBLE PAGO');
      if(o.esp>0.005&&o.pagado<0.005)o.flags.push(chqPend.length?'CHEQUE SIN EXPEDIR':'SIN PAGO');
      if(o.pagado>0.005&&!o.pdfN&&!o.xmlN)o.flags.push('SIN COMPROBANTE');
      if((o.pdfN||o.xmlN)&&o.pagado<0.005&&!chqPend.length)o.flags.push('COMPROBANTE SIN PAGO');
      if(o.xmlN&&o.cfdiAmt>0&&o.pagado>0.005&&Math.abs(o.pagado-o.cfdiAmt)>0.01)o.flags.push('PAGO≠CFDI XML');
      if(o.esp>0&&o.pagado>o.esp+0.01)o.flags.push('PAGO>ESPERADO');
      if(o.pagado<0.005&&o.pag.some(p=>String(p.estado||'').toUpperCase()==='RECHAZADO'))o.flags.push('TRANSF. RECHAZADA');
      if(o.pdfN&&!o.xmlN)o.info.push('PDF CARGADO · XML PENDIENTE');
      if(o.xmlN&&!o.pdfN)o.info.push('XML CARGADO · PDF PENDIENTE');
      if(integrado){
        const diag=(integrado.diagnostico.filas||[]).filter(x=>x.trabajador_id===o.w.id&&x.estado!=='COINCIDE');
        diag.forEach(x=>{if(!o.flags.includes(x.estado))o.flags.push(x.estado);});
        const os=(integrado.saldos||[]).filter(x=>x.trabajador_id===o.w.id&&x.vigente);
        if(os.length){const saldo=redondearCentavos(os.reduce((a,x)=>a+Number(x.saldo),0));
          o.info.push('SALDO POR APLICAR $'+money(saldo)+' · revisar flujo integrado');}
      }
      o.no=o.w.no_trab;
    });
    rows.sort((a,b)=>((b.flags.length>0)-(a.flags.length>0))||((a.no||9e9)-(b.no||9e9)));
    window._CONC=rows;window._CONCSEM=ns;concRender();
  }catch(e){if(out)out.innerHTML=`<div class="empty" style="color:var(--red)">No se pudo conciliar: ${esc(e.message||e)}</div>`;}
  finally{if(btn)btn.disabled=false;}
}
function concRender(){
  const rows=window._CONC||[];
  const soloDif=$('conc-dif')&&$('conc-dif').checked;
  const filt=rows.filter(o=>!soloDif||o.flags.length),nFlag=rows.filter(o=>o.flags.length).length;
  const m2=v=>v?'$'+money(v):'—';
  window._CONCVIEW=filt;
  const body=filt.map(o=>`<div class="imp-row" style="grid-template-columns:1.5fr .8fr .8fr .8fr .72fr .72fr 1.55fr${o.flags.length?';background:var(--amber-bg)':''}">
    <span><b>${esc(fullName(o.w))}</b><br><span style="color:var(--mut);font-size:10.5px">#${o.no??'—'}</span></span>
    <span style="font-size:11.5px">${m2(o.esp)}</span>
    <span style="font-size:11.5px">${o.pagCheque?'🧾 '+m2(o.pagCheque):o.chequePendiente?'<span style="color:var(--amber)">pend. '+m2(o.chequePendiente)+'</span>':'—'}</span>
    <span style="font-size:11.5px">${o.pagTransf?'💸 '+m2(o.pagTransf):'—'}</span>
    <span style="font-size:11.5px">${o.pdfN?'<b style="color:var(--green)">✔ '+o.pdfN+'</b>':'—'}</span>
    <span style="font-size:11.5px">${o.xmlN?'<b style="color:var(--green)">✔ '+o.xmlN+'</b><br><small>'+m2(o.cfdiAmt)+'</small>':'—'}</span>
    <span style="font-size:10px">${o.flags.length?o.flags.map(f=>`<span class="imp-tag imp-CONFLICTO" style="font-size:9px">${f}</span>`).join(' '):'<span style="color:var(--green)">✔ CUADRADO</span>'}${o.info.length?'<br><span style="color:var(--mut)">'+o.info.join(' · ')+'</span>':''}</span>
  </div>`).join('');
  $('conc-out').innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
      ${nFlag?`<span class="imp-tag imp-CONFLICTO" style="background:var(--red);color:#fff">⚠ ${nFlag} con diferencia</span>`:'<span class="imp-tag imp-COINCIDE">Todo cuadra</span>'}
      <span style="font-size:11px;color:var(--mut)">${filt.length} renglón(es)</span>
      ${window._CONC_CIERRE_INTEGRADO?`<button class="btn" onclick="PLATINUM_FLOWS.abrirCierre('${window._CONC_CIERRE_INTEGRADO}')">Aprobaciones, aplicaciones y saldos</button>`:''}
    </div>
    <div class="imp-row head" style="grid-template-columns:1.5fr .8fr .8fr .8fr .72fr .72fr 1.55fr"><span>Trabajador</span><span>Esperado cierre/NOI</span><span>Cheque pagado</span><span>Transferencia</span><span>Recibo PDF</span><span>CFDI XML</span><span>Resultado</span></div>
    ${body||'<div class="empty">Sin movimientos de dinero para ese filtro.</div>'}
    <p style="font-size:11px;color:var(--mut);margin-top:8px">El <b>recibo PDF</b> y el <b>CFDI XML</b> se controlan por separado. Un PDF existente ya no aparece como “sin comprobante”; si falta el XML se muestra como seguimiento informativo. Los cheques PENDIENTES no cuentan como pagados hasta quedar EXPEDIDOS o ENTREGADOS.</p>`;
}
function openConciliacion(){
  const sem=concSemanaDefault();
  modal(`<div class="m-head"><h2>🔎 Conciliación total · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:8px">Cruza la foto inmutable del <b>cierre/NOI</b> contra transferencias, cheques realmente expedidos, recibos PDF y CFDI XML de la misma semana.</p>
      <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-bottom:10px"><div><label>Semana</label><input id="conc-sem" style="width:90px" value="S${sem}"></div><button class="btn dark" id="conc-refresh" onclick="concBuild()">↻ Conciliar</button><label style="font-size:12px;margin-left:auto"><input type="checkbox" id="conc-dif" style="width:auto" onchange="concRender()"> solo diferencias</label></div>
      <div id="conc-out"></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button><button class="btn dark" onclick="exportConciliacion()">⬇ Exportar Excel</button></div>`,'xl');
  concBuild();
}
function exportConciliacion(){
  const rows=window._CONCVIEW||window._CONC||[]; if(!rows.length){toast('No hay movimientos para exportar.','err');return;}
  const aoa=[],styles=[];
  aoa.push([`CONCILIACIÓN TOTAL S${window._CONCSEM||''} — ${OBRA.nombre} — ${new Date().toLocaleDateString('es-MX')}`]);styles.push(ST.title);
  aoa.push(['NO.','TRABAJADOR','SEMANA','ESPERADO CIERRE/NOI','CHEQUE PAGADO','CHEQUE PENDIENTE','TRANSFERENCIA','RECIBO PDF','CFDI XML','TOTAL CFDI','RESULTADO']);styles.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cell];
  rows.forEach(o=>{aoa.push([o.no??'',fullName(o.w),'S'+o.sem,o.esp||'',o.pagCheque||'',o.chequePendiente||'',o.pagTransf||'',o.pdfN,o.xmlN,o.cfdiAmt||'',o.flags.concat(o.info).join(' | ')||'CUADRADO']);styles.push(rs);});
  const ws=buildSheet(aoa,styles,[7,30,8,18,15,16,15,12,11,14,38],[{s:{r:0,c:0},e:{r:0,c:10}}],[{hpt:24},{hpt:26}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1+rows.length,c:10}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'CONCILIACION');
  dl(wb,`CONCILIACION_TOTAL_S${window._CONCSEM||''}_${OBRA.nombre.slice(0,16).replace(/\s+/g,'_')}_${today()}.xlsx`);
  toast('Excel de conciliación generado.','ok');
}
async function verDoc(docId){
  const d=DOCSX.find(x=>x.id===docId); if(!d)return;
  const {data,error}=await sb.storage.from('expedientes').createSignedUrl(d.archivo,3600);
  if(error||!data){toast('No se pudo abrir el documento: '+(error?error.message:''),'err');return;}
  window.open(data.signedUrl,'_blank');
}
