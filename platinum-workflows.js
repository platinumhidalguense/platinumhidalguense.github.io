/* PLATINUM · coordinación financiera y pendientes. No implementa fórmulas de nómina.
   Calcula el motor existente; este módulo versiona, concilia y vincula evidencia. */
(function(root){
 'use strict';
 let cfg=null,state=null,busy=false,permissions={admin:false,escritura:false,transferencia:false};
 const context=()=>{if(!cfg)throw Error('El flujo integrado no terminó de cargar. Recarga la plataforma.');return cfg.context();};
 const el=id=>cfg.$(id),esc=x=>cfg.esc(x),money=x=>cfg.money(x),round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
 const canon=x=>x&&typeof x==='object'?Array.isArray(x)?x.map(canon):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
 const same=(a,b)=>JSON.stringify(canon(a))===JSON.stringify(canon(b));
 function pagosUnicos(rows){
  const seen=new Set();return rows.filter(p=>{
   const folio=String(p.folio_lote||'').replace(/\s/g,'').toUpperCase(),fecha=String(p.fecha_pago||'').slice(0,10);
   // Sin folio/fecha no se supone que dos comprobantes sean la misma operación.
   const key=folio&&fecha?[p.obra_id,p.trabajador_id,String(p.semana).replace(/\D/g,''),String(p.banco||'').trim().toUpperCase(),folio,fecha,round(p.importe)].join('|'):'ID:'+p.id;
   if(seen.has(key))return false;seen.add(key);return true;
  });
 }
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 async function call(action,data={}){
  const {sb}=context();const r=await sb.rpc('control_flujo_operar',{p_accion:action,p_datos:data});
  if(r.error)throw Error(r.error.message||'No se pudo completar la operación');
  if(!r.data||typeof r.data!=='object')throw Error('La base no confirmó una respuesta completa');return r.data;
 }
 async function operation(fn){
  if(busy)return;busy=true;
  try{return await fn();}catch(e){cfg.toast(e.message||String(e),'err');}
  finally{busy=false;}
 }
 function head(title,back='openControlEmpresarial()'){
  return `<div class="m-head"><h2>${esc(title)}</h2><button class="btn" style="margin-left:auto" onclick="${back}">← Volver</button><button class="btn" style="padding:4px 8px" onclick="PLATINUM_FLOWS.manual()" aria-label="Guía del flujo integrado">?</button><button class="x" onclick="closeModal()">×</button></div>`;
 }
 const table=(headers,rows)=>cfg.table(headers,rows,'Sin registros para este alcance.');
 function ensureState(id){if(!state||state.id!==id||context().obra?.id!==state.obraId)throw Error('Cambió el contexto. Abre nuevamente el cierre.');return state;}
 async function loadPermissions(){permissions=await call('PERMISOS');return permissions;}
 function configure(options){cfg=options;}
 async function crearCierre(){return operation(async()=>{
  await loadPermissions();if(!permissions.escritura)throw Error('Tu cuenta es de consulta.');
  const sem=Number(el('cc-sem')?.value),periodo=el('cc-per')?.value,obs=el('cc-obs')?.value||'';
  if(!(sem>=1&&sem<=53))throw Error('Semana inválida.');
  const data=await cfg.capture(sem,periodo);const r=await call('CREAR',{...data,observaciones:obs});
  cfg.toast('Borrador preparado. Concilia NOI o recibos y autoriza con acceso VIP. Otra persona deberá marcar pagado.','ok');await cfg.reload();await abrirCierre(r.cierre_id);
 });}
 async function abrirCierre(id){
  try{
   const initial=context().obra?.id;const p=await call('PERMISOS');
   if(p.aprobar_cierre){const ajuste=await call('APLICAR_CENTAVOS_APROBADOS',{cierre_id:id});if(ajuste.aplicado)cfg.toast(`Corrección histórica autorizada aplicada: ${ajuste.casos} incidencia(s). Salarios y pagos preservados.`,'ok');}
   const d=await call('DETALLE',{cierre_id:id});
   if(context().obra?.id!==initial||d.cierre.obra_id!==initial)throw Error('El centro cambió durante la carga. Abre nuevamente el cierre.');
   permissions=p;state={id,obraId:initial,data:d,dirty:false};renderCierre();
  }catch(e){cfg.toast(e.message,'err');}
 }
 function renderCierre(){
  const st=state,d=st.data,c=d.cierre,f=d.flujo,diag=d.diagnostico,rows=d.saldos||[];
  const saldo=round(rows.reduce((n,x)=>n+Number(x.saldo),0)),pago=round(rows.reduce((n,x)=>n+Number(x.pago_registrado),0)),entrega=round(rows.reduce((n,x)=>n+Number(x.entrega_pendiente),0));
  const closed=['AUTORIZADO','TIMBRADO','PAGADO'].includes(c.estado),write=permissions.escritura;
  const actions=[`<button class="btn" onclick="PLATINUM_FLOWS.abrirCierre('${c.id}')">↻ Actualizar</button>`,
   `<button class="btn" onclick="PLATINUM_FLOWS.historicos(false)">Revisión de cierres</button>`,
   `<button class="btn" onclick="ctrlOpenConciliacion('${c.id}')">Importar / revisar NOI</button>`];
  if(root.PLATINUM_PAGOS_SABADO)actions.push(`<button class="btn" onclick="PLATINUM_PAGOS_SABADO.abrir(${c.semana})">Revisión de pagos · sábado 12:00</button>`);
  if(typeof window!=='undefined'&&window.PLATINUM_RRHH)actions.push(`<button class="btn" onclick="PLATINUM_RRHH.abrir('corte',null,${c.semana})">Corte semanal guiado</button><button class="btn" onclick="PLATINUM_RRHH.abrir('importe',null,${c.semana},'${c.id}')">Explicar importes</button>`);
  if(write&&!closed)actions.push(`<button class="btn dark" onclick="PLATINUM_FLOWS.preparar('${c.id}')">${esLegadoSinPreparar(d)?'Preparar histórico conciliado':'Preparar fotografía actual'}</button>`);
  if(write&&(d.recibos_sin_leer||[]).length)actions.push(`<button class="btn" onclick="PLATINUM_FLOWS.leerRecibos('${c.id}')">Leer ${d.recibos_sin_leer.length} recibo(s) archivado(s)</button>`);
  if(write&&root.PLATINUM_RECIBOS_IA)actions.push(`<button class="btn" onclick="PLATINUM_RECIBOS_IA.abrir(${c.semana})">Leer PDF con Gemini</button>`);
  if(permissions.aprobar_cierre&&['BORRADOR','REVISADO'].includes(c.estado))actions.push(`<button class="btn dark" onclick="PLATINUM_FLOWS.transicion('${c.id}','AUTORIZADO')">Autorizar versión</button>`);
  if(write&&closed)actions.push(`<button class="btn" onclick="PLATINUM_FLOWS.solicitar('${c.id}','REAPERTURA')">Solicitar reapertura</button>`);
  if(permissions.admin&&closed&&!f?.version_id)actions.push(`<button class="btn" onclick="PLATINUM_FLOWS.adoptar('${c.id}')">Revisar y adoptar legado</button>`);
  if(write&&c.estado==='AUTORIZADO')actions.push(`<button class="btn" onclick="PLATINUM_FLOWS.transicion('${c.id}','TIMBRADO')">Verificar y marcar timbrado</button>`);
  if(permissions.aprobar_cierre&&c.estado==='TIMBRADO')actions.push(`<button class="btn" onclick="PLATINUM_FLOWS.transicion('${c.id}','PAGADO')">Verificar y marcar pagado</button>`);
  if(rows.length)actions.push(`<button class="btn" onclick="PLATINUM_FLOWS.exportar('${c.id}')">⬇ Excel de saldos</button>`);
  const issues=(diag.filas||[]).filter(x=>x.estado!=='COINCIDE');
  const sourceFlags=(!f?'Sin preparar':f.sucio?'Fuentes modificadas · volver a preparar':closed?'Versión autorizada fija':'Fotografía preparada');
  cfg.modal(head(`Nómina integrada · S${c.semana}`,'openCtrlCierres()')+`<div class="m-body">
   <p class="fhint">${esc(context().empresaNombre)} · ${esc(context().obra.nombre)} · ${esc(c.periodo)} · <b>${esc(c.estado)}</b></p>
   <div id="flow-change" role="status" class="fhint" style="color:var(--amber)">${esc(sourceFlags)}</div>
   <div class="stats"><div class="stat b"><div class="n">$${money(c.total_neto)}</div><div class="l">Versión del cierre</div></div><div class="stat g"><div class="n">$${money(pago)}</div><div class="l">Pago registrado</div></div><div class="stat a"><div class="n">$${money(saldo)}</div><div class="l">Saldo por aplicar</div></div><div class="stat a"><div class="n">$${money(entrega)}</div><div class="l">Cheque: entrega pendiente</div></div></div>
   <div style="display:flex;gap:7px;flex-wrap:wrap;margin:12px 0">${actions.join('')}</div>
   <p id="flow-progress" class="fhint" role="status"></p>
   ${st.receiptErrors?.length?`<details open><summary><b>PDF por revisar: ${st.receiptErrors.length}</b></summary>${table(['Trabajador','Causa'],st.receiptErrors.map(x=>`<tr><td>${esc(x.nombre)}</td><td>${esc(x.causa)}</td></tr>`))}</details>`:''}
   ${d.timbrado?`<details><summary><b>Respaldo del timbrado: ${d.timbrado.pendientes} pendiente(s) · XML o PDF fiscal verificado</b></summary><p class="fhint">Se cotejan folio, emisor, trabajador, periodo e importe. XML y PDF del mismo folio no se suman dos veces. Comprobación documental interna; no es consulta de vigencia ante SAT.</p>${table(['Trabajador (UUID)','XML','PDF','Estado'],(d.timbrado.filas||[]).map(x=>`<tr><td>${esc((diag.filas||[]).find(z=>z.trabajador_id===x.tid)?.nombre||x.tid)}</td><td>${x.xml}</td><td>${x.pdf}</td><td>${esc(x.estado)}</td></tr>`))}</details>`:''}
   <details ${issues.length?'open':''}><summary><b>Conciliación motor / NOI / recibos: ${issues.length} pendiente(s)${diag.fuera_snapshot?' · '+diag.fuera_snapshot+' fila(s) NOI fuera de fotografía':''}</b></summary>
   ${table(['No.','Trabajador','Concepto','Motor fiscal','NOI','PDF / XML','Estado'],(diag.filas||[]).map(x=>`<tr><td>${esc(x.numero)}</td><td>${esc(x.nombre)}</td><td>${esc(x.tipo)}</td><td>$${money(x.motor)}</td><td>${x.noi==null?(x.neto_respaldo==null?'Sin respaldo':'PDF $'+money(x.neto_respaldo)):'$'+money(x.noi)}</td><td>${x.pdf} / ${x.xml}</td><td>${esc(x.estado)}</td></tr>`))}</details>
   <div class="sect">Obligaciones y comprobantes</div><p class="fhint">Una transferencia importada no se suma dos veces. Un cheque expedido es pago registrado aunque aún falte entregarlo. Los comprobantes históricos necesitan revisión administrativa; no se modifican solos.</p>
   <label>Buscar trabajador</label><input id="flow-search" placeholder="Número, nombre o contratista" oninput="PLATINUM_FLOWS.filtrar(this.value)">
   <div id="flow-saldos">${renderSaldos(rows)}</div>
   <details><summary><b>Versiones y solicitudes</b></summary>
   ${table(['Versión','Estado al sellar','Fecha','Huella'],(d.versiones||[]).map(v=>`<tr><td>${v.version}</td><td>${esc(v.estado_origen)}</td><td>${esc(new Date(v.created_at).toLocaleString('es-MX'))}</td><td><code>${esc(v.snapshot_sha256.slice(0,16))}…</code></td></tr>`))}
   ${renderSolicitudes(d.solicitudes||[])}</details>
   </div>`,'lg');
 }
 function renderSaldos(rows){return table(['No. / trabajador','Concepto / método','Autorizado','Registrado','Saldo','Entrega','Acciones'],rows.map(o=>`<tr><td><b>#${esc(o.numero)} ${esc(o.nombre)}</b><br><small>${esc(o.contratista)}</small></td><td>${esc(o.tipo)}<br><small>${esc(o.metodo)}${o.vigente?'':' · versión archivada'}</small></td><td>$${money(o.importe)}</td><td>$${money(o.pago_registrado)}</td><td>$${money(o.saldo)}<br><small>${esc(o.estado_pago)}</small></td><td>${Number(o.entrega_pendiente)>0?'Pendiente $'+money(o.entrega_pendiente):'—'}</td><td>${permissions.escritura&&o.vigente&&o.cierre_id===state.id&&Number(o.saldo)>0?`<button class="btn" onclick="PLATINUM_FLOWS.comprobantes('${o.id}')">Vincular comprobante</button>`:''}${o.tipo==='FINIQUITO'&&permissions.transferencia?` <button class="btn" onclick="PLATINUM_FLOWS.transferencia('${o.trabajador_id}',${o.semana})">Transferencia autorizada</button>`:''}${permissions.admin?` <button class="btn" onclick="PLATINUM_FLOWS.aplicaciones('${o.id}')">Aplicaciones</button>`:''}</td></tr>`));}
 function filtrar(q){if(!state)return;const n=String(q||'').toLocaleUpperCase('es-MX');el('flow-saldos').innerHTML=renderSaldos(state.data.saldos.filter(o=>`${o.numero} ${o.nombre} ${o.contratista}`.toLocaleUpperCase('es-MX').includes(n)));}
 function avisarCambio(){if(state&&el('flow-change')){state.dirty=true;el('flow-change').textContent='Hay cambios compartidos. Actualiza esta vista antes de aprobar; tu captura no se ha borrado.';}}
 async function preparar(id){return operation(async()=>{
  ensureState(id);if(!permissions.escritura)throw Error('Acceso de consulta.');
  const d=await call('DETALLE',{cierre_id:id});
  if(esLegadoSinPreparar(d)){
   if(await prepararLegado(d)){cfg.toast('Fotografía histórica conciliada preparada; importes preservados.','ok');await cfg.reload();await abrirCierre(id);}return;
  }
  const captured=await cfg.capture(d.cierre.semana,d.cierre.periodo);
  const historical=captured.snapshot.hasta<today();
  const reg=(d.solicitudes||[]).find(r=>r.tipo==='REGULARIZACION'&&r.estado==='APROBADO'&&!r.aplicado_en&&same(r.propuesta?.snapshot,captured.snapshot));
  if(historical&&!same(captured.snapshot,d.cierre.snapshot)&&!d.flujo?.reapertura_id&&!reg){
   state.proposal=captured;mostrarComparacion(d.cierre.snapshot,captured.snapshot,id);return;
  }
  await call('PREPARAR',{cierre_id:id,...captured,solicitud_id:reg?.id||null});cfg.toast('Fotografía actualizada. Revisa otra vez las diferencias NOI.','ok');await cfg.reload();await abrirCierre(id);
 });}
 function esLegadoSinPreparar(d){return !d.flujo&&!d.cierre.snapshot?.modelo&&['BORRADOR','REVISADO'].includes(d.cierre.estado);}
 async function prepararLegado(d){
  await loadPermissions();if(!permissions.aprobar_cierre)throw Error('La preparación histórica requiere acceso VIP.');
  if(!root.confirm(`S${d.cierre.semana}: ¿preparar esta fotografía histórica conservando sus importes?\n\nLa base comprobará que todo coincide con NOI y los comprobantes. No se recalculará con los trabajadores actuales ni se registrarán pagos.`))return false;
  await call('PREPARAR_LEGADO',{cierre_id:d.cierre.id,revision:d.cierre.snapshot_sha256,snapshot:d.cierre.snapshot,confirmacion:'PRESERVAR S'+d.cierre.semana});return true;
 }
 function mostrarComparacion(old,next,id){
  const prev=new Map((old.items||[]).map(x=>[x.trabajador_id+'|'+x.tipo,x]));
  const rows=(next.items||[]).map(x=>{const a=prev.get(x.trabajador_id+'|'+x.tipo);return `<tr><td>${esc(x.numero)}</td><td>${esc(x.nombre)}</td><td>${esc(x.tipo)}</td><td>${a?'$'+money(a.monto):'No figuraba'}</td><td>$${money(x.monto)}</td></tr>`;});
  cfg.modal(head('Vista previa · regularización histórica',`PLATINUM_FLOWS.abrirCierre('${id}')`)+`<div class="m-body"><p>No se ha cambiado el cierre. El administrador debe aprobar esta propuesta antes de aplicarla.</p>${table(['No.','Trabajador','Concepto','Anterior','Propuesto'],rows)}<label>Motivo de la regularización</label><textarea id="flow-reason" rows="3"></textarea></div><div class="m-foot"><button class="btn dark" onclick="PLATINUM_FLOWS.enviarPropuesta('${id}')">Solicitar aprobación de esta fotografía</button></div>`,'lg');
 }
 async function enviarPropuesta(id){return operation(async()=>{ensureState(id);if(!state.proposal)throw Error('Genera una vista previa nueva.');await call('SOLICITAR',{cierre_id:id,tipo:'REGULARIZACION',motivo:el('flow-reason').value,propuesta:state.proposal});cfg.toast('Propuesta enviada al administrador. No se aplicó ningún importe.','ok');await abrirCierre(id);});}
 async function importarNOI(st,c){return operation(async()=>{
  if(!st?.rows||!c?.id)throw Error('Vuelve a leer el archivo NOI.');
  const r=await call('IMPORTAR_NOI',{cierre_id:c.id,filas:st.rows,archivo:st.file.name,sha256:st.hash,revision:c.snapshot_sha256});
  cfg.toast(`NOI guardado completo: ${r.filas} filas. Revisa la conciliación antes de autorizar.`,'ok');await cfg.reload();await cfg.openNoi(c.id);
 });}
 async function transicion(id,estado){return operation(async()=>{
  await loadPermissions();if(!permissions.escritura)throw Error('Tu cuenta es de consulta.');
  if(['AUTORIZADO','PAGADO'].includes(estado)&&!permissions.aprobar_cierre)throw Error('Se requiere acceso VIP para autorizar o marcar pagado.');
  if(estado==='CANCELADO'&&!permissions.admin)throw Error('Sólo el administrador puede cancelar cierres.');
  let current=await call('DETALLE',{cierre_id:id});
  if(estado==='REVISADO')throw Error('La etapa de revisión fue retirada. Autoriza directamente con acceso VIP.');
  if(estado==='AUTORIZADO'&&esLegadoSinPreparar(current)&&!await prepararLegado(current))return;
  if(estado==='TIMBRADO'&&(current.recibos_sin_leer||[]).length){
   if(!root.confirm(`Se verificarán ${current.recibos_sin_leer.length} PDF archivados de S${current.cierre.semana}, con el lector tradicional.\n\nSe guardará su evidencia de identidad, fechas, neto y timbrado; no se modifican salarios, pagos ni la fotografía. ¿Continuar?`))return;
   const result=await procesarRecibos(current,true);current=await call('DETALLE',{cierre_id:id});
   if(result.failed.length){await abrirCierre(id);state.receiptErrors=result.failed;renderCierre();throw Error(`${result.ok} PDF verificados; ${result.failed.length} requieren revisión. Se muestran los trabajadores y la causa; no se marcó timbrado.`);}
  }
  if(!root.confirm(`¿Cambiar S${current.cierre.semana} a ${estado}?\n\n${estado==='AUTORIZADO'?'Se fijará esta fotografía y sus obligaciones. Las diferencias bloquean la autorización.':'La base verificará los requisitos de esta etapa.'}`))return;
  if(estado==='AUTORIZADO'&&root.prompt('Escribe AUTORIZAR S'+current.cierre.semana)!=='AUTORIZAR S'+current.cierre.semana)return;
  await call('TRANSICION',{cierre_id:id,estado});cfg.toast('Etapa confirmada: '+estado,'ok');await cfg.reload();await abrirCierre(id);
 });}
 async function procesarRecibos(d,fiscal=false){
  const docs=d.recibos_sin_leer||[],failed=[],cache=new Map();let next=0,ok=0,done=0;
  const check=()=>{if(context().obra?.id!==d.cierre.obra_id)throw Error('Cambió el centro; abre otra vez el cierre.');};
  const progress=()=>{if(el('flow-progress'))el('flow-progress').textContent=`Verificando PDF ${done}/${docs.length} · ${ok} correctos · ${failed.length} por revisar…`;};
  progress();
  await Promise.all(Array.from({length:Math.min(3,docs.length)},async()=>{
   while(next<docs.length){const doc=docs[next++],items=(d.cierre.snapshot.items||[]).filter(x=>x.trabajador_id===doc.trabajador_id);
    const nombre=items[0]?`#${items[0].numero} ${items[0].nombre}`:doc.trabajador_id;
    try{
     check();const key=doc.hash||doc.archivo;if(!cache.has(key))cache.set(key,Promise.resolve().then(()=>cfg.readReceipt(doc)));
     const info=await cache.get(key);check();
     if(!Number.isFinite(info.neto)||info.errores?.length)throw Error(info.errores?.join('; ')||'No se pudo extraer el neto.');
     const tipos=[...new Set(items.map(x=>x.tipo||'NOMINA'))],tipo=info.tipo||(tipos.length===1?tipos[0]:null);
     if(!tipo||!tipos.includes(tipo))throw Error('El concepto del PDF es ambiguo o no corresponde a la fotografía; revisa nómina/finiquito.');
     if(fiscal&&(!info.datos.cfdi_uuid||!info.datos.evidencia_timbrado))throw Error('No se pudo verificar el folio fiscal y el sello SAT en el PDF; revisar el archivo o su XML.');
     const trabajador=context().workers?.find(w=>w.id===doc.trabajador_id);
     if(fiscal&&trabajador?.rfc){
      const rfc=String(trabajador.rfc).trim().toUpperCase(),ids=info.datos.identificadores||[];
      if(String(info.datos.rfc||'').toUpperCase()!==rfc&&!ids.some(i=>String(i).toUpperCase()===rfc))
       throw Error('El PDF sí se leyó, pero el RFC del receptor no coincide con la ficha. Coteja su constancia y el CFDI; Gemini no corrige una identidad distinta.');
     }
     await call('RECIBO',{cierre_id:d.cierre.id,documento_id:doc.id,hash:doc.hash,neto:info.neto,tipo,datos:info.datos});ok++;
    }catch(e){failed.push({documento_id:doc.id,nombre,causa:e.message||String(e)});}
    finally{done++;progress();}
   }
  }));
  return {ok,failed};
 }
 async function leerRecibos(id){return operation(async()=>{
  ensureState(id);if(!permissions.escritura)throw Error('Acceso de consulta.');
  const d=await call('DETALLE',{cierre_id:id}),result=await procesarRecibos(d);
  cfg.toast(`${result.ok} recibo(s) verificados${result.failed.length?`; ${result.failed.length} requieren revisión`:''}.`,result.failed.length?'err':'ok');
  await abrirCierre(id);state.receiptErrors=result.failed;renderCierre();
 });}
 function solicitar(id,tipo){
  if(!permissions.escritura){cfg.toast('Acceso de consulta.','err');return;}
  cfg.modal(head(tipo==='REAPERTURA'?'Solicitar reapertura':'Solicitar regularización',`PLATINUM_FLOWS.abrirCierre('${id}')`)+`<div class="m-body"><p>El cierre, sus versiones y comprobantes se conservan. La solicitud no cambia importes ni abre una semana por sí sola.</p><label>Motivo y cambios que se deben revisar</label><textarea id="flow-reason" rows="4"></textarea></div><div class="m-foot"><button class="btn dark" onclick="PLATINUM_FLOWS.enviarSolicitud('${id}','${tipo}')">Enviar solicitud</button></div>`,'md');
 }
 async function enviarSolicitud(id,tipo){return operation(async()=>{await call('SOLICITAR',{cierre_id:id,tipo,motivo:el('flow-reason').value});cfg.toast('Solicitud registrada. Espera la aprobación administrativa.','ok');await abrirCierre(id);});}
 function renderSolicitudes(rs){return table(['Tipo','Motivo','Estado','Decisión','Acción'],rs.map(r=>`<tr><td>${esc(r.tipo)}</td><td>${esc(r.motivo)}</td><td>${esc(r.estado)}</td><td>${esc(r.nota_decision||'—')}</td><td>${permissions.admin&&r.estado==='PENDIENTE'?`<button class="btn" onclick="PLATINUM_FLOWS.revisarSolicitud('${r.id}')">Revisar propuesta</button>`:''}${permissions.escritura&&r.estado==='APROBADO'&&!r.aplicado_en&&r.tipo!=='REAPERTURA'?`<button class="btn" onclick="PLATINUM_FLOWS.aplicarSolicitud('${r.id}')">Aplicar propuesta aprobada</button>`:''}</td></tr>`));}
 function solicitudPorId(id){const r=state?.data?.solicitudes?.find(x=>x.id===id)||state?.requests?.find(x=>x.id===id);if(!r)throw Error('Actualiza las solicitudes.');return r;}
 function revisarSolicitud(id){try{
  const r=solicitudPorId(id);if(!permissions.admin)throw Error('Sólo el administrador revisa esta decisión.');
  const propuesta=r.propuesta?.snapshot;
  const detail=propuesta?table(['No.','Nombre','Concepto','Neto propuesto'],(propuesta.items||[]).map(x=>`<tr><td>${esc(x.numero)}</td><td>${esc(x.nombre)}</td><td>${esc(x.tipo)}</td><td>$${money(x.monto)}</td></tr>`)):`<p class="fhint">${esc(r.tipo==='REAPERTURA'?'Se conserva la versión anterior; la nueva tendrá que prepararse y autorizarse.':JSON.stringify(r.propuesta))}</p>`;
  cfg.modal(head('Decisión administrativa','PLATINUM_FLOWS.bandeja(false)')+`<div class="m-body"><b>${esc(r.tipo)}</b><p>${esc(r.motivo)}</p>${detail}<label>Fundamento de la decisión</label><textarea id="flow-decision" rows="3"></textarea></div><div class="m-foot"><button class="btn danger" onclick="PLATINUM_FLOWS.decidir('${id}',false)">Rechazar</button><button class="btn dark" onclick="PLATINUM_FLOWS.decidir('${id}',true)">Aprobar propuesta</button></div>`,'lg');
 }catch(e){cfg.toast(e.message,'err');}}
 async function decidir(id,aprobar){return operation(async()=>{
  const r=solicitudPorId(id);if(!root.confirm(aprobar?'¿Aprobar esta propuesta concreta?':'¿Rechazar esta solicitud?'))return;
  if(root.prompt('Segunda confirmación: escribe CONFIRMAR DECISION')!=='CONFIRMAR DECISION')return;
  await call('DECIDIR',{solicitud_id:id,aprobar,nota:el('flow-decision').value,confirmacion:'CONFIRMAR DECISION'});cfg.toast(aprobar?'Solicitud aprobada.':'Solicitud rechazada.','ok');
  await cfg.go(r.obra_id);await abrirCierre(r.cierre_origen);
 });}
 async function aplicarSolicitud(id){return operation(async()=>{
  const r=solicitudPorId(id),p=r.propuesta||{};
  if(!root.confirm('¿Aplicar exactamente la propuesta aprobada?'))return;
  if(p.snapshot)await call('PREPARAR',{cierre_id:r.cierre_origen,...p,solicitud_id:id});
  else if(p.obligacion_id)await call('APLICAR_PAGO',{...p,solicitud_id:id,clave_idempotencia:id,motivo:r.motivo});
  else throw Error('La propuesta no contiene un cambio aplicable.');
  await abrirCierre(r.cierre_origen);
 });}
 async function adoptar(id){return operation(async()=>{
  const d=await call('DETALLE',{cierre_id:id});if(!permissions.admin)throw Error('Sólo el administrador puede adoptar el legado.');
  if(!root.confirm('Se conservará la fotografía histórica sin recalcularla. Se crearán obligaciones para vincular sus comprobantes, sin declararlos pagados automáticamente. ¿Continuar?'))return;
  const phrase='ADOPTAR S'+d.cierre.semana;if(root.prompt('Escribe '+phrase)!==phrase)return;
  const motivo=root.prompt('Motivo de la revisión histórica (mínimo 10 caracteres):');if(motivo===null)return;
  await call('ADOPTAR_LEGADO',{cierre_id:id,confirmacion:phrase,motivo});await abrirCierre(id);
 });}
 function comprobantes(oid){try{
  const o=state?.data.saldos.find(x=>x.id===oid);if(!o)throw Error('Actualiza el cierre.');
  const pagos=state.data.pagos.filter(x=>x.trabajador_id===o.trabajador_id&&x.estado==='EXITOSO');
  const cheques=state.data.cheques.filter(x=>x.trabajador_id===o.trabajador_id&&['EXPEDIDO','ENTREGADO'].includes(x.estatus));
  cfg.modal(head(`Comprobantes · #${o.numero} ${o.nombre}`,`PLATINUM_FLOWS.abrirCierre('${state.id}')`)+`<div class="m-body"><b>${esc(o.tipo)} · saldo $${money(o.saldo)}</b><p class="fhint">Los comprobantes se conservan; aquí sólo vinculas su importe al saldo autorizado.</p>
   <label>Semana de origen del comprobante (si fue capturado en otra semana)</label><div style="display:flex;gap:8px"><input id="flow-proof-week" type="number" min="1" max="53" value="${o.semana}"><button class="btn" onclick="PLATINUM_FLOWS.buscarComprobantes('${oid}')">Buscar</button></div><p class="fhint">Cruzar semanas requiere propuesta y aprobación expresa, sin cambiar la fecha ni semana del comprobante.</p>
   <label>Comprobante</label><select id="flow-proof"><option value="">Selecciona</option>${pagos.map(x=>`<option value="P:${x.id}">Transferencia $${money(x.importe)} · ${esc(x.fecha)} · ${esc(x.folio)}</option>`).join('')}${cheques.map(x=>`<option value="C:${x.id}">Cheque ${esc(x.numero)} · $${money(x.importe)} · ${esc(x.estatus)}</option>`).join('')}</select>
   <label>Importe que se aplica a esta obligación</label><input id="flow-amount" type="number" min="0.01" step="0.01" value="${Number(o.saldo).toFixed(2)}"><label>Motivo / referencia de conciliación</label><textarea id="flow-reason" rows="2"></textarea></div>
   <div class="m-foot"><button class="btn dark" onclick="PLATINUM_FLOWS.aplicarComprobante('${oid}')">Confirmar aplicación</button></div>`,'md');
 }catch(e){cfg.toast(e.message,'err');}}
 async function buscarComprobantes(oid){return operation(async()=>{
  const id=state?.id,semana=Number(el('flow-proof-week')?.value),r=await call('COMPROBANTES',{obligacion_id:oid,semana});
  ensureState(id);if(!el('flow-proof'))throw Error('La captura cambió. Abre nuevamente los comprobantes.');
  el('flow-proof').innerHTML='<option value="">Selecciona</option>'+r.pagos.map(x=>`<option value="P:${x.id}">S${semana} · Transferencia $${money(x.importe)} · ${esc(x.fecha)} · ${esc(x.folio)}</option>`).join('')+r.cheques.map(x=>`<option value="C:${x.id}">S${semana} · Cheque ${esc(x.numero)} · $${money(x.importe)}</option>`).join('');
  cfg.toast(`${r.pagos.length+r.cheques.length} comprobante(s) del trabajador en S${semana}.`,'ok');
 });}
 async function aplicarComprobante(oid){return operation(async()=>{
  const o=state?.data.saldos.find(x=>x.id===oid);if(!o)throw Error('Actualiza el cierre.');
  const [kind,id]=String(el('flow-proof').value).split(':');if(!id)throw Error('Selecciona un comprobante.');
  const p={obligacion_id:oid,importe:Number(el('flow-amount').value),motivo:el('flow-reason').value,[kind==='P'?'pago_id':'cheque_id']:id};
  if(!same(state.paymentDraft?.payload,p))state.paymentDraft={payload:{...p},key:root.crypto.randomUUID()};
  p.clave_idempotencia=state.paymentDraft.key;
  if(!root.confirm(`¿Aplicar $${money(p.importe)} a ${o.nombre}, ${o.tipo}?`))return;
  try{await call('APLICAR_PAGO',p);}catch(e){
   if(/histórica|histórico|Posible comprobante duplicado|semana del comprobante difiere/i.test(e.message)
     &&root.confirm(e.message+'\n\n¿Enviar esta aplicación concreta a aprobación del administrador?')){
    await call('SOLICITAR',{cierre_id:state.id,tipo:/duplicado/i.test(e.message)?'EVIDENCIA_DISTINTA':'REGULARIZACION',motivo:p.motivo,propuesta:p});
    cfg.toast('Aplicación propuesta al administrador. No se sumó ningún pago.','ok');await abrirCierre(state.id);return;
   }throw e;
  }
  cfg.toast('Comprobante vinculado; saldo confirmado por la base.','ok');await abrirCierre(state.id);
 });}
 function aplicaciones(oid){try{
  const rows=state.data.aplicaciones.filter(x=>x.obligacion_id===oid);
  cfg.modal(head('Aplicaciones e historial',`PLATINUM_FLOWS.abrirCierre('${state.id}')`)+`<div class="m-body">${table(['Fecha','Importe','Fuente','Estado','Acción'],rows.map(a=>`<tr><td>${esc(new Date(a.created_at).toLocaleString('es-MX'))}</td><td>$${money(a.importe)}</td><td>${a.cheque_id?'Cheque':'Banco'}</td><td>${a.retirado_en?'Retirada · '+esc(a.motivo_retiro):'Vigente'}</td><td>${permissions.admin&&!a.retirado_en?`<button class="btn danger" onclick="PLATINUM_FLOWS.retirar('${a.id}')">Retirar aplicación</button>`:''}</td></tr>`))}</div>`,'lg');
 }catch(e){cfg.toast(e.message,'err');}}
 async function retirar(id){return operation(async()=>{if(!root.confirm('¿Retirar sólo la aplicación? El comprobante y la bitácora se conservan.'))return;if(root.prompt('Escribe RETIRAR APLICACION')!=='RETIRAR APLICACION')return;const motivo=root.prompt('Motivo (mínimo 10 caracteres):');if(motivo===null)return;await call('RETIRAR_APLICACION',{aplicacion_id:id,motivo,confirmacion:'RETIRAR APLICACION'});await abrirCierre(state.id);});}
 async function transferencia(wid,sem){
  try{
   await loadPermissions();if(!permissions.transferencia)throw Error('Sin permiso para esta excepción.');
   const {workers}=context(),w=workers.find(x=>x.id===wid);if(!w)throw Error('Abre la obra correspondiente al trabajador.');
   const result=await context().sb.from('pagos').select('id,trabajador_id,importe,estado,fecha_pago,folio_lote').eq('obra_id',w.obra_id).eq('trabajador_id',wid).eq('semana','S'+sem).eq('estado','EXITOSO').eq('medio','TRANSFERENCIA').eq('importe',Number(w.monto_finiquito)).limit(50);
   if(result.error)throw Error('No se pudieron consultar los comprobantes: '+result.error.message);
   const pagos=(result.data||[]).map(p=>({...p,fecha:p.fecha_pago,folio:p.folio_lote}));
   cfg.modal(head('Finiquito por transferencia autorizada',state?.id?`PLATINUM_FLOWS.abrirCierre('${state.id}')`:'openControlPagos()')+`<div class="m-body"><b>#${esc(w.no_trab)} ${esc(cfg.fullName(w))} · S${sem} · $${money(w.monto_finiquito)}</b><p class="fhint">Contabilidad sólo puede sustituir un cheque pendiente sin número ni consecutivo por una transferencia exitosa exactamente conciliada. No cambia el sueldo ni el método ordinario de la ficha.</p>
    <label>Transferencia importada</label><select id="flow-ft-pago">${permissions.admin?'<option value="">Sin comprobante · sólo declarado, NO pagado</option>':'<option value="">Selecciona la transferencia exacta</option>'}${pagos.map(p=>`<option value="${p.id}">$${money(p.importe)} · ${esc(p.fecha)} · ${esc(p.folio)}</option>`).join('')}</select><label>Motivo de la excepción</label><textarea id="flow-reason" rows="3"></textarea></div>
    <div class="m-foot"><button class="btn dark" onclick="PLATINUM_FLOWS.confirmarTransferencia('${wid}',${Number(sem)})">Confirmar excepción</button></div>`,'md');
  }catch(e){cfg.toast(e.message,'err');}
 }
 async function confirmarTransferencia(wid,sem){return operation(async()=>{
  const pago=el('flow-ft-pago').value||null;if(!permissions.admin&&!pago)throw Error('Selecciona el comprobante bancario importado.');
  if(!root.confirm('¿Sustituir únicamente el cheque pendiente sin numeración? Los expedidos no se cancelan por esta vía.'))return;
  if(root.prompt('Escribe CONFIRMAR TRANSFERENCIA')!=='CONFIRMAR TRANSFERENCIA')return;
  await call('TRANSFERIR_FINIQUITO',{trabajador_id:wid,semana:sem,pago_id:pago,motivo:el('flow-reason').value,confirmacion:'CONFIRMAR TRANSFERENCIA'});
  cfg.toast(pago?'Transferencia conciliada y cheque pendiente retirado.':'Excepción declarada; comprobante bancario pendiente.','ok');await cfg.reload();if(state?.id)await abrirCierre(state.id);else cfg.openPayments();
 });}
 async function bandeja(consolidado=false){try{
  await loadPermissions();const ctx=context();if(consolidado&&!permissions.admin)throw Error('El consolidado es exclusivo del administrador.');
  if(!consolidado&&!ctx.obra)throw Error('Selecciona un centro de trabajo.');
  const d=await call('BANDEJA',{obra_id:consolidado?null:ctx.obra.id});state={id:null,requests:d.solicitudes,obraId:ctx.obra?.id};
  cfg.modal(head(consolidado?'Pendientes · consolidado del administrador':'Pendientes de mi centro')+`<div class="m-body"><p class="fhint">Cada razón social conserva su alcance. Pago registrado y entrega de cheques son controles distintos.</p><div style="display:flex;gap:8px">${ctx.obra?'<button class="btn" onclick="PLATINUM_FLOWS.bandeja(false)">Mi centro</button>':''}${permissions.admin?'<button class="btn" onclick="PLATINUM_FLOWS.bandeja(true)">Consolidado</button>':''}<button class="btn" onclick="PLATINUM_FLOWS.historicos(${consolidado===true})">Revisión de cierres</button></div>
   ${table(['Empresa / centro','Nómina / NOI','Cheques','Saldo por aplicar','Personal / seguridad social','Acción'],d.centros.map(o=>`<tr><td><small>${esc(o.empresa)}</small><br><b>${esc(o.nombre)}</b></td><td>${o.cierres_pendientes} cierre(s)<br>${o.diferencias_noi} diferencia(s)</td><td>${o.cheques_pendientes} sin expedir<br>${o.entregas_pendientes} expedido(s) por entregar</td><td>$${money(o.saldos)}</td><td>${o.movimientos_ss} trámite(s)<br>${o.expedientes_pendientes} expediente(s)<br>${o.documentos_vencidos} vigencia(s) vencida(s)${o.casos_imss==null?'':'<br>'+o.casos_imss+' caso(s) IMSS'}</td><td><button class="btn" onclick="PLATINUM_FLOWS.abrirCentro('${o.id}')">Abrir centro</button></td></tr>`))}
   <div class="sect">Solicitudes y aprobaciones</div>${renderSolicitudes(d.solicitudes||[])}</div>`,'lg');
  }catch(e){cfg.toast(e.message,'err');}}
 async function abrirCentro(id){try{await cfg.go(id);cfg.openControl();}catch(e){cfg.toast(e.message,'err');}}
 async function historicos(consolidado=false){return operation(async()=>{
  await loadPermissions();const ctx=context(),obraId=ctx.obra?.id;
  if(consolidado&&!permissions.admin)throw Error('El consolidado es exclusivo del administrador.');
  if(!consolidado&&!obraId)throw Error('Selecciona un centro de trabajo.');
  const {data,error}=await ctx.sb.rpc('control_revision_historica',{p_obra:consolidado?null:obraId});
  if(error)throw Error(error.message);if(context().obra?.id!==obraId)throw Error('Cambió el centro durante la revisión. Vuelve a abrirla.');
  if(!data?.solo_lectura||!Array.isArray(data.cierres))throw Error('La revisión no devolvió una respuesta completa.');
  cfg.modal(head('Revisión de cierres · '+(consolidado?'consolidado':'mi centro'))+`<div class="m-body"><p>Esta consulta no modifica importes, personal ni comprobantes. Un PDF sólo respalda timbrado después de verificar folio fiscal, sello, identidad, fechas e importes. Los conteos pueden incluir nómina y finiquito del mismo trabajador.</p>
   ${table(['Empresa / centro','Semana / estado','Total guardado','NOI / PDF / XML','Conciliación','Acción'],data.cierres.map(c=>`<tr><td><small>${esc(c.empresa)}</small><br>${esc(c.centro)}</td><td>S${esc(c.semana)} · ${esc(c.periodo)}<br>${esc(c.estado)}<br><small>${c.integrado?'Versión integrada':'Legado sin adoptar'}${c.sucio?' · fuentes modificadas':''}</small></td><td>$${money(c.total)}<br><small>${esc(c.trabajadores)} trabajador(es)</small></td><td>${c.noi} / ${c.pdf} / ${c.xml}<br><small>${c.pdf_sin_leer} PDF por leer</small></td><td>${c.pendientes} pendiente(s)<br>${c.fuera_snapshot} NOI fuera de fotografía</td><td><button class="btn" onclick="PLATINUM_FLOWS.abrirHistorico('${c.obra_id}','${c.id}')">Revisar sin cambiar</button></td></tr>`))}
   <p class="fhint">Abre cada cierre para importar lo faltante, leer recibos y comparar. Adoptar, regularizar o reabrir exige la aprobación correspondiente; abrirlo no aplica cambios.</p></div>`,'lg');
 });}
 async function abrirHistorico(obraId,cierreId){return operation(async()=>{await cfg.go(obraId);if(context().obra?.id!==obraId)throw Error('No se pudo seleccionar el centro.');await abrirCierre(cierreId);});}
 async function exportar(id){return operation(async()=>{const d=await call('DETALLE',{cierre_id:id});await cfg.exportRows('SALDOS Y COMPROBANTES · S'+d.cierre.semana,
  ['NO.','TRABAJADOR','CONTRATISTA','CONCEPTO','MÉTODO','AUTORIZADO','PAGO REGISTRADO','SALDO','ENTREGA PENDIENTE','ESTADO'],d.saldos.map(x=>[x.numero,x.nombre,x.contratista,x.tipo,x.metodo,x.importe,x.pago_registrado,x.saldo,x.entrega_pendiente,x.estado_pago]),'SALDOS_S'+d.cierre.semana);});}
 const netosEnCurso=new Map();
 async function resolverNeto(c){
  const key=JSON.stringify([c.obra_id,c.trabajador_id,c.semana,c.tipo_pago,c.cierre_id||null]);
  if(netosEnCurso.has(key))return netosEnCurso.get(key);
  const task=(async()=>{try{
   const initial=context().obra?.id;if(initial!==c.obra_id)throw Error('Abre el cheque en su centro de trabajo.');
   let r=await call('NETO_CHEQUE',c);const notes=[],tp=c.tipo_pago==='FINIQUITO'?'FINIQUITO':'NOMINA';
   if(!r.error||r.estado==='SIN_RESPALDO')for(const doc of (r.recibos_sin_leer||[]).slice(0,20)){
    if(context().obra?.id!==initial)throw Error('Cambió el centro durante la verificación.');
    try{
     const info=doc.datos_confirmados?{neto:Number(doc.datos_confirmados.neto),tipo:doc.nomina_tipo||null,datos:doc.datos_confirmados}:await cfg.readReceipt(doc);
     if(!Number.isFinite(info.neto)||!info.datos)throw Error('El PDF necesita lectura asistida con Gemini.');
     if(info.tipo&&info.tipo!==tp)throw Error('El tipo de recibo no corresponde al cheque.');
     if(!info.tipo&&!root.confirm('El PDF no distingue expresamente nómina de finiquito. Revisa el recibo de '+info.datos.periodo_inicio+' al '+info.datos.periodo_fin+' por $'+money(info.neto)+'. ¿Confirmas que corresponde a '+tp+' de este trabajador?'))throw Error('Recibo pendiente de clasificar; no se usó su importe.');
     if(context().obra?.id!==initial)throw Error('Cambió el centro durante la lectura.');
     await call('RECIBO',{documento_id:doc.id,hash:doc.hash,neto:info.neto,tipo:info.tipo||tp,datos:info.datos});
    }catch(e){notes.push(e.message);}
   }
   if(context().obra?.id!==initial)throw Error('Cambió el centro durante la verificación.');
   r=await call('NETO_CHEQUE',c);
   if(r.error)return {...r,error:r.error+(notes.length?' '+[...new Set(notes)].join(' '):''),puede_leer_pdf:!!r.recibos_sin_leer?.length};
   if(!Number.isFinite(Number(r.neto))||Number(r.neto)<=0)return {error:'El respaldo de este concepto indica $0 o un neto no positivo; no corresponde expedir cheque.'};
   return {...r,neto:Number(r.neto),advertencias:[...new Set(notes)]};
  }catch(e){return {error:e.message};}})();
  netosEnCurso.set(key,task);try{return await task;}finally{netosEnCurso.delete(key);}
 }
 async function obtenerVersiones(obras,sem){return call('VERSIONES_EXPORTACION',{obras,semana:Number(String(sem).replace(/\D/g,''))});}
 function filtrarAbiertos(act,fins,versions){
  const locked=(versions?.cierres||[]).filter(c=>['AUTORIZADO','TIMBRADO','PAGADO'].includes(c.estado));
  const covered=(w,fin)=>locked.some(c=>c.obra_id===w.obra_id&&(c.periodo==='TODOS'||fin||(w.periodo_pago||'SEMANAL')===c.periodo));
  return {act:act.filter(w=>!covered(w,false)),fins:fins.filter(w=>!covered(w,true))};
 }
 async function versionarModelo(live,opt){
  const r=opt.versiones||await obtenerVersiones(opt.obras,opt.sem);
  let filas=live.filas.slice();const notas=[];
  for(const c of r.cierres||[]){
   if(!['AUTORIZADO','TIMBRADO','PAGADO'].includes(c.estado))continue;
   if(c.sucio)throw Error('La versión aprobada requiere revisión de sus fuentes. Solicita reapertura antes de exportar otra cifra.');
   if(!c.version_id||!c.snapshot?.modelo?.filas)throw Error(`S${opt.sem}, centro autorizado sin desglose sellado. Revisa el legado o solicita regularización; no se recalculará una semana aprobada.`);
   if(opt.desde&&c.snapshot.desde&&opt.desde!==c.snapshot.desde||opt.hasta&&c.snapshot.hasta&&opt.hasta!==c.snapshot.hasta)throw Error('Las fechas seleccionadas no corresponden al cierre autorizado.');
   const applies=f=>f.w.obra_id===c.obra_id&&(c.periodo==='TODOS'||f.fin||(f.w.periodo_pago||'SEMANAL')===c.periodo);
   filas=filas.filter(f=>!applies(f));
   const frozen=c.snapshot.modelo.filas.filter(f=>(!opt.contratista||f.w.contratista===opt.contratista)&&(opt.periodo==='TODOS'||f.fin||(f.w.periodo_pago||'SEMANAL')===opt.periodo));
   filas.push(...frozen.map(f=>({...f,pago:f.fin&&(c.transferencias||[]).includes(f.w.id)?'TRANSFERENCIA':f.pago,w:{...f.w},items:(f.items||[]).map(i=>({...i,w:{...f.w}}))})));notas.push(c.version_id);
  }
  return {...live,filas,items:filas.flatMap(x=>x.items||[]),act:filas.filter(x=>!x.fin).map(x=>x.w),fins:filas.filter(x=>x.fin).map(x=>x.w),
   neto:round(filas.reduce((n,x)=>n+Number(x.neto),0)),costo:round(filas.reduce((n,x)=>n+Number(x.costo),0)),versiones:notas};
 }
 function manual(){cfg.modal(head('Guía breve · flujo integrado')+`<div class="m-body" style="line-height:1.65"><p><b>1. Preparar.</b> Registra movimientos, incidencias, créditos e incapacidades. El motor existente genera la fotografía del borrador. Una incidencia automática desactualizada debe revisarse antes de exportar.</p><p><b>2. Conciliar.</b> Usa NOI o el recibo individual verificable; si existen ambos deben coincidir. Las diferencias bloquean autorización y expedición.</p><p><b>3. Autorizar.</b> Cualquier VIP con edición autoriza directamente, con confirmación. No hay etapa de revisión. Queda una versión fija; un cambio posterior exige reapertura.</p><p><b>4. Timbrado.</b> XML o PDF fiscal verificado de cada persona. Se validan folio, identidad, empresa, periodo e importe. Ambas representaciones del mismo folio no duplican el total. No se simula consulta de vigencia ante SAT.</p><p><b>5. Pagar y comprobar.</b> Otra persona VIP distinta de quien autorizó marca pagado, sólo al resolver los saldos. Los históricos requieren revisión administrativa. Una aplicación no dispersa dinero en el banco. Los cheques expedidos cuentan como pago registrado y su entrega se controla aparte.</p><p><b>6. Historia y excepciones.</b> Reabrir conserva versiones y comprobantes. Las regularizaciones se aprueban expresamente. Una excepción individual de efectivo no autoriza otras ni crea una transferencia ficticia.</p><p class="fhint">Todo se limita a tus empresas, centros y permisos. No se envían correos ni se realizan trámites ante autoridades desde este módulo.</p></div>`,'lg');}
 root.PLATINUM_FLOWS=Object.freeze({configure,crearCierre,abrirCierre,filtrar,preparar,enviarPropuesta,importarNOI,transicion,leerRecibos,solicitar,enviarSolicitud,revisarSolicitud,decidir,aplicarSolicitud,adoptar,comprobantes,buscarComprobantes,aplicarComprobante,aplicaciones,retirar,transferencia,confirmarTransferencia,bandeja,abrirCentro,historicos,abrirHistorico,exportar,resolverNeto,obtenerVersiones,filtrarAbiertos,versionarModelo,pagosUnicos,avisarCambio,manual,call,
  _test:Object.freeze({canon,same,round})});
})(typeof window==='undefined'?globalThis:window);
