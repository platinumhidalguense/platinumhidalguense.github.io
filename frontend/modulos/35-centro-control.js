/* ================== CONTROL EMPRESARIAL (v71) ==================
   Seis módulos enlazados por obra/razón social. El motor de nómina y
   finiquitos NO se modifica: el cierre guarda una fotografía de sus resultados
   y la conciliación los compara contra el archivo final de NOI. */
const CTRL_TABLAS={
  cierres:'control_cierres_nomina',noi:'control_conciliacion_noi',
  mov:'control_movimientos_seguridad_social',docs:'control_documentos_cumplimiento',
  costos:'control_presupuestos_obra',inc:'control_incidentes_laborales',audit:'control_bitacora',
  casosIMSS:'control_casos_imss',casosIMSSSem:'control_casos_imss_semanas',st7:'control_st7_acuses',
  altasCortas:'control_altas_bajas_cortas',cierresEliminados:'control_cierres_eliminados'
};
function ctrlFaltaScript(e){
  const m=(e&&e.message)||String(e||'');
  if(/permission denied|row.level security|sin permiso|sólo el administrador/i.test(m))return m;
  const falta=/schema cache|does not exist|could not find|PGRST205/i.test(m);
  if(falta&&/control_casos_imss|control_aplicar_caso_imss/i.test(m))return 'Falta aplicar 87_CASOS_IMSS_CERTIFICADOS_Y_NOMINA.sql en Supabase.';
  if(falta&&/control_st7_acuses/i.test(m))return 'Falta aplicar 108_CONTROL_ST7_RECEPCION_ENTREGA.sql en Supabase.';
  if(falta&&/control_altas_bajas_cortas/i.test(m))return 'Falta aplicar 88_ALTAS_BAJAS_CORTAS_SIN_SERVICIO.sql en Supabase.';
  if(falta&&/control_eliminar_cierre_admin|control_cierres_eliminados/i.test(m))return 'Falta aplicar 89_ELIMINACION_ADMIN_CIERRE_COMPLETO.sql en Supabase.';
  if(falta&&/control_cierres_nomina|control_conciliacion_noi|control_movimientos_seguridad_social|control_documentos_cumplimiento|control_presupuestos_obra|control_incidentes_laborales|control_bitacora/i.test(m))
    return 'Falta aplicar el archivo 71_CONTROL_EMPRESARIAL_CUMPLIMIENTO.sql en Supabase.';
  return m;
}
async function ctrlAuditar(modulo,accion,detalle={},entidadTipo=null,entidadId=null){
  if(!sb||!USER||!OBRA)return;
  try{await sb.from(CTRL_TABLAS.audit).insert({obra_id:OBRA.id,modulo,accion,entidad_tipo:entidadTipo,entidad_id:entidadId,detalle,actor_email:USER.email||''});}
  catch(e){console.warn('Bitácora control:',e);}
}
function ctrlEmpresaLinea(){
  const e=EMPRESAS[empresaDeObra(OBRA)]||EMPRESAS.PLATINUM;
  return `${esc(e.nombre)} · ${esc(OBRA.nombre)}`;
}
function ctrlEstado(v){
  const x=String(v||'').toUpperCase(),ok=/^(PAGADO|ACEPTADO|VIGENTE|COINCIDE|CERRADO)$/.test(x),
        bad=/^(RECHAZADO|VENCIDO|DIFERENCIA|SIN_NOI|SIN_PLATINUM|FATAL)$/.test(x),
        warn=/^(PENDIENTE|POR_VENCER|EN_TRAMITE|ABIERTO|REVISADO|PREPARADO)$/.test(x);
  return `<span style="display:inline-block;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:800;background:${bad?'var(--red-bg)':warn?'var(--amber-bg)':ok?'var(--green-bg)':'var(--blue-bg)'};color:${bad?'var(--red)':warn?'var(--amber)':ok?'var(--green)':'var(--navy)'}">${esc(x||'—')}</span>`;
}
function ctrlTabla(headers,rows,empty='Sin registros',className=''){
  return rows.length?`<div class="tbl-card ${className}" style="margin-top:12px;overflow:auto"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    :`<div class="empty"><div class="big">📭</div>${esc(empty)}</div>`;
}
async function ctrlLeer(tabla,orden='created_at'){
  return fetchAllRows(()=>sb.from(tabla).select('*').eq('obra_id',OBRA.id),orden);
}
function ctrlNav(titulo,volver='openControlEmpresarial'){
  return `<div class="m-head"><h2>${titulo}</h2><span style="font-size:11px;color:var(--mut)">${ctrlEmpresaLinea()}</span><button class="btn" style="margin-left:auto;padding:5px 9px" onclick="${volver}()">← Volver</button><button class="x" onclick="closeModal()">×</button></div>`;
}
async function openControlEmpresarial(){
  if(!OBRA){toast('Selecciona un centro de trabajo.','err');return;}
  ctrlAuditar('CENTRO_CONTROL','ABRIR',{empresa:empresaDeObra(OBRA)});
  modal(`
    <div class="m-head"><h2>🛡️ Centro de control empresarial</h2><span style="font-size:11px;color:var(--mut)">${ctrlEmpresaLinea()}</span>
      <button class="btn" style="margin-left:auto;padding:5px 9px" onclick="openManualControl()">? Guía</button><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body"><div id="ctrl-home"><div class="empty"><span class="spin"></span> Preparando controles...</div></div></div>`,'lg');
  try{
    const [c,m,d,i]=await Promise.all([ctrlLeer(CTRL_TABLAS.cierres),ctrlLeer(CTRL_TABLAS.mov),ctrlLeer(CTRL_TABLAS.docs),ctrlLeer(CTRL_TABLAS.inc)]);
    const err=c.error||m.error||d.error||i.error;if(err)throw err;
    const cierres=c.data||[],mov=m.data||[],docs=d.data||[],inc=i.data||[],hoy=today();
    const pendientes=mov.filter(x=>!['ACEPTADO','CANCELADO'].includes(x.estado)).length;
    const venc=docs.filter(x=>x.estado_manual==='VIGENTE'&&x.fecha_vencimiento&&x.fecha_vencimiento<hoy).length;
    const abiertos=inc.filter(x=>x.estado!=='CERRADO').length;
    const dif=await fetchAllRows(()=>sb.from(CTRL_TABLAS.noi).select('id,estatus').eq('obra_id',OBRA.id).neq('estatus','COINCIDE'));
    $('ctrl-home').innerHTML=`
      <div class="stats">
        <div class="stat b"><div class="n">${cierres.filter(x=>x.estado!=='PAGADO'&&x.estado!=='CANCELADO').length}</div><div class="l">Cierres en proceso</div></div>
        <div class="stat r"><div class="n">${(dif.data||[]).length}</div><div class="l">Diferencias NOI</div></div>
        <div class="stat a"><div class="n">${pendientes}</div><div class="l">Movimientos pendientes</div></div>
        <div class="stat r"><div class="n">${venc}</div><div class="l">Documentos vencidos</div></div>
        <div class="stat a"><div class="n">${abiertos}</div><div class="l">Incidentes abiertos</div></div>
      </div>
      <p style="font-size:12px;color:var(--mut);margin:12px 0">Cada módulo trabaja únicamente con la razón social y centro seleccionados. Los plazos legales se controlan aparte de la regla interna de procesamiento en lunes.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px">
        ${[
          ['⚙','Operación RRHH','Corte semanal, explicación de importes, expediente 360 y procesos conectados','PLATINUM_RRHH.abrir()'],
          ['🧭','Pendientes y aprobaciones','Control por empresa/obra y consolidado exclusivo del administrador','PLATINUM_FLOWS.bandeja(false)'],
          ['🔐','Cierre de nómina','Versión autorizada, conciliación, comprobantes, saldos y entrega','openCtrlCierres()'],
          ['💳','Revisión de pagos del sábado','Pagos pendientes, transferencias y cheques sólo con confirmación desde las 12:00 CDMX','PLATINUM_PAGOS_SABADO.abrir()'],
          ['⚖️','Conciliación NOI','Compara netos por trabajador y detecta diferencias al centavo','openCtrlConciliacionSelector()'],
          ['🧮','Papeles de prestaciones','Cálculos semanales, ISR preciso, propuesta D001 e histórico de consulta','openPapelesFiniquito()'],
          ['🧾','ISR mensual quincenal','Acumulados, ajuste de la segunda quincena y compensación del diferencial','openISRQuincenal()'],
          ['📒','Concentrado por contratista','Percepciones, ISR, IMSS, neto y evidencia de pago por semana','openCtrlConcentradoContratistas()'],
          ['📅','IMSS · IDSE · SUA','Altas, bajas, salarios e incapacidades con fechas y evidencias','openCtrlMovimientos()'],
          ['↔️','Altas y bajas sin servicio','Distingue registros IMSS sin trabajo efectivo de faltas y finiquitos','openCtrlAltasCortas()'],
          ['🗂️','Expediente de cumplimiento','SIROC, REPSE, contratos, opiniones, pólizas y vigencias','openCtrlDocumentos()'],
          ['📊','Costo real de obra','Nómina, previsión, finiquitos, cargas y presupuesto','openCtrlCostos()'],
          ['🦺','Incidentes, incapacidades y ST-7','Hechos, certificados, calendario, acuses y seguimiento en un solo lugar','openCtrlIncidentes()']
        ].map(x=>`<button class="btn" style="white-space:normal;text-align:left;padding:15px;min-height:94px" onclick="${x[3]}"><span style="font-size:24px">${x[0]}</span><br><b>${x[1]}</b><br><span style="font-size:11px;color:var(--mut)">${x[2]}</span></button>`).join('')}
      </div>
      <div style="margin-top:14px;padding:10px 12px;border-radius:8px;background:var(--blue-bg);font-size:11px;color:var(--mut)">
        Control operativo de apoyo. La presentación oficial en NOI, IDSE, SUA, INFONAVIT o SIROC y la calificación de riesgos corresponde al personal autorizado y a la autoridad competente.
      </div>`;
  }catch(e){$('ctrl-home').innerHTML=`<div class="empty">⚠️ ${esc(ctrlFaltaScript(e))}</div>`;}
}
function ctrlSnapshotNomina(sem,periodo){
  const [d1,d2]=semRange(sem),{act,fins}=pyCandidatos(d1,d2,periodo),items=[];
  let nomina=0,prev=0,ret=0,fini=0,neto=0;
  act.forEach(w=>{const sueldo=redondearCentavos(Number(w.sal_semanal)||0),p=redondearCentavos(difDe(w.id,'S'+sem)),r=retencionesDePeriodo(w,'S'+sem).total,n=redondearCentavos(Math.max(0,sueldo+p-r));
    nomina+=sueldo;prev+=p;ret+=r;neto+=n;items.push({trabajador_id:w.id,numero:w.no_trab,nombre:fullName(w),tipo:'NOMINA',metodo_pago:metodoPagoPredeterminado(w,'NOMINA'),sueldo_nomina:sueldo,prevision_social:p,retenciones:r,monto:n});});
  fins.forEach(w=>{const n=redondearCentavos(Number(w.monto_finiquito)||0);fini+=n;neto+=n;items.push({trabajador_id:w.id,numero:w.no_trab,nombre:fullName(w),tipo:'FINIQUITO',metodo_pago:finTransDe(w,sem)?'TRANSFERENCIA':'CHEQUE',monto:n});});
  return {obra_id:OBRA.id,empresa_codigo:empresaDeObra(OBRA),obra:OBRA.nombre,semana:sem,periodo,desde:d1,hasta:d2,formula_version:MOTOR_NOMINA_VERSION,
    total_nomina:redondearCentavos(nomina),total_prevision:redondearCentavos(prev),total_retenciones:redondearCentavos(ret),
    total_finiquitos:redondearCentavos(fini),total_neto:redondearCentavos(neto),total_trabajadores:items.length,items};
}
async function ctrlSha(valor){
  const b=valor instanceof ArrayBuffer?new Uint8Array(valor):new TextEncoder().encode(typeof valor==='string'?valor:JSON.stringify(valor));
  const h=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function openCtrlCierres(){
  ctrlAuditar('CIERRE_NOMINA','ABRIR');
  modal(ctrlNav('🔐 Cierre de nómina')+`<div class="m-body"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn dark" onclick="openCtrlNuevoCierre()">＋ Nuevo cierre</button><button class="btn" onclick="openCtrlConciliacionSelector()">⚖️ Conciliación NOI</button><button class="btn" onclick="ctrlExportCierres()">⬇ Excel</button>${esAdmin()?'<button class="btn" onclick="openCtrlCierresEliminados()">🗄 Historial eliminados</button>':''}</div><div id="ctrl-cierres"></div></div>`,'lg');
  const {data,error}=await ctrlLeer(CTRL_TABLAS.cierres);if(error){$('ctrl-cierres').innerHTML=esc(ctrlFaltaScript(error));return;}
  window._CTRLCIERRES=(data||[]).sort((a,b)=>b.semana-a.semana||String(b.created_at).localeCompare(String(a.created_at)));
  $('ctrl-cierres').innerHTML=ctrlTabla(['Semana','Periodo','Estado','Trabajadores','Neto','Autorización / pago','Acciones'],window._CTRLCIERRES.map(c=>{
    const next=['BORRADOR','REVISADO'].includes(c.estado)?['AUTORIZADO','Autorizar']:c.estado==='AUTORIZADO'?['TIMBRADO','Marcar timbrado']:c.estado==='TIMBRADO'?['PAGADO','Marcar pagado']:null;
    return `<tr><td><b>S${c.semana}</b></td><td>${esc(c.periodo)}</td><td>${ctrlEstado(c.estado)}</td><td>${c.total_trabajadores}</td><td><b>$${money(c.total_neto)}</b></td>
      <td style="font-size:10px">${esc(c.autorizado_por_email||'Sin autorizar')}<br>${esc(c.pagado_por_email||'Sin marcar pagado')}</td>
      <td style="white-space:nowrap"><button class="btn" style="padding:4px 7px" onclick="ctrlOpenConciliacion('${c.id}')">Conciliar</button>
      <button class="btn" style="padding:4px 7px" onclick="ctrlRevisarPagosSemana(${c.semana})">Pagos</button>
      <button class="btn" style="padding:4px 7px" onclick="PLATINUM_FLOWS.abrirCierre('${c.id}')">Flujo integrado</button>
      ${puedeEditarTrabajador()&&(esVip()||esAdmin())&&['AUTORIZADO','TIMBRADO','PAGADO'].includes(c.estado)?`<button class="btn" style="padding:4px 7px" onclick="PLATINUM_FLOWS.revisarComprobantes('${c.id}')">Vincular comprobantes masivamente</button>`:''}
      ${next&&puedeEditarTrabajador()&&(!['AUTORIZADO','PAGADO'].includes(next[0])||esVip()||esAdmin())?`<button class="btn dark" style="padding:4px 7px" onclick="ctrlCambiarCierre('${c.id}','${next[0]}')">${next[1]}</button>`:''}
      ${esAdmin()?`<button class="btn danger" style="padding:4px 7px" onclick="ctrlEliminarCierre('${c.id}')">Eliminar cierre</button>`:''}</td></tr>`; }),'Aún no hay cierres de nómina.');
}
async function ctrlRevisarPagosSemana(sem){
  const c=(CIERRES||[]).find(x=>Number(x.semana)===Number(sem)&&x.estado!=='CANCELADO');
  if(c&&window.PLATINUM_FLOWS)return window.PLATINUM_FLOWS.abrirCierre(c.id);
  return conciliarSemana('S'+sem);
}
function openCtrlNuevoCierre(){
  const sem=semObra();
  modal(ctrlNav('＋ Nuevo cierre de nómina','openCtrlCierres')+`<div class="m-body">
    <div class="grid" style="grid-template-columns:1fr 1fr"><div><label>Semana</label><input id="cc-sem" type="number" min="1" max="53" value="${sem}"></div>
    <div><label>Periodo</label><select id="cc-per"><option>SEMANAL</option><option>QUINCENAL</option><option>TODOS</option></select></div></div>
    <div style="margin-top:10px"><label>Observaciones</label><textarea id="cc-obs" rows="3" placeholder="Notas del cierre..."></textarea></div>
    <p class="fhint" style="margin-top:10px">Se guardará una fotografía inmutable de salarios, previsión social, retenciones y finiquitos calculados por el motor actual.</p></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlCierres()">Cancelar</button><button class="btn dark" id="cc-save" onclick="ctrlCrearCierre()">Crear fotografía</button></div>`,'md');
}
async function ctrlCrearCierre(){
  if(!window.PLATINUM_FLOWS){toast('No cargó el flujo integrado. Recarga antes de crear un cierre.','err');return;}
  return window.PLATINUM_FLOWS.crearCierre();
}
async function ctrlEliminarCierre(id){
  const c=(window._CTRLCIERRES||[]).find(x=>x.id===id);if(!c)return;
  if(!esAdmin()){toast('Sólo el administrador puede eliminar cierres.','err');return;}
  if(!confirm(`Primera confirmación: ¿retirar el cierre S${c.semana} (${c.estado})?\n\nEl cierre y su conciliación se archivarán. Pagos, CFDI y cheques expedidos se conservan; sólo los cheques automáticos pendientes sin número se cancelan.`))return;
  const frase=`ELIMINAR S${c.semana}`;
  const escrita=prompt(`Segunda confirmación: escribe exactamente ${frase}`,'');
  if(escrita!==frase){if(escrita!==null)toast('La confirmación no coincide; no se modificó nada.','err');return;}
  const motivo=prompt('Motivo de la eliminación para la bitácora (mínimo 10 caracteres):','');
  if(motivo===null)return;
  if(motivo.trim().length<10){toast('Escribe un motivo de al menos 10 caracteres.','err');return;}
  markWrite();const {data,error}=await sb.rpc('control_eliminar_cierre_admin',{p_cierre_id:id,p_confirmacion:escrita,p_motivo:motivo.trim()});
  if(error){toast('No se eliminó: '+ctrlFaltaScript(error),'err');return;}
  toast(`Cierre S${c.semana} archivado y retirado. ${data?.cheques_conservados??0} cheque(s) conservado(s).`,'ok');
  await loadObraData(OBRA.id);openCtrlCierres();
}
async function openCtrlCierresEliminados(){
  if(!esAdmin()){toast('Sólo el administrador puede consultar este historial.','err');return;}
  const {data,error}=await ctrlLeer(CTRL_TABLAS.cierresEliminados);
  if(error){toast(ctrlFaltaScript(error),'err');return;}
  const a=(data||[]).sort((x,y)=>String(y.eliminado_en).localeCompare(String(x.eliminado_en)));
  modal(ctrlNav('🗄 Historial de cierres eliminados','openCtrlCierres')+`<div class="m-body"><p class="fhint">Archivo inalterable para auditoría. Los pagos, CFDI y cheques expedidos no se eliminan al retirar un cierre.</p>
    ${ctrlTabla(['Semana','Estado anterior','Eliminado por','Fecha','NOI archivado','Cheques vinculados','Motivo'],a.map(x=>`<tr><td>S${x.semana} · ${esc(x.periodo)}</td><td>${ctrlEstado(x.estado_anterior)}</td><td>${esc(x.actor_email)}</td><td>${new Date(x.eliminado_en).toLocaleString('es-MX')}</td><td>${(x.conciliacion||[]).length}</td><td>${(x.cheques_vinculados||[]).length}</td><td>${esc(x.motivo)}</td></tr>`),'Sin cierres eliminados.')}</div>`,'lg');
}
async function ctrlCambiarCierre(id,estado){
  if(!window.PLATINUM_FLOWS){toast('No cargó el flujo integrado. Recarga antes de aprobar.','err');return;}
  return window.PLATINUM_FLOWS.transicion(id,estado);
}
async function openCtrlConciliacionSelector(){
  ctrlAuditar('CONCILIACION_NOI','ABRIR_SELECTOR');
  const {data,error}=await ctrlLeer(CTRL_TABLAS.cierres);if(error){toast(ctrlFaltaScript(error),'err');return;}
  const cs=(data||[]).filter(c=>c.estado!=='CANCELADO').sort((a,b)=>b.semana-a.semana);
  modal(ctrlNav('⚖️ Conciliación NOI')+`<div class="m-body"><p style="color:var(--mut)">Selecciona un cierre. La comparación usa su fotografía, no cifras que pudieran cambiar después.</p>
    ${ctrlTabla(['Semana','Periodo','Estado','Neto','Acción'],cs.map(c=>`<tr><td>S${c.semana}</td><td>${c.periodo}</td><td>${ctrlEstado(c.estado)}</td><td>$${money(c.total_neto)}</td><td><button class="btn dark" onclick="ctrlOpenConciliacion('${c.id}')">Abrir conciliación</button></td></tr>`),'Primero crea un cierre de nómina.')}</div>`,'lg');
}
function ctrlNormHdr(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function ctrlNumero(v){
  if(typeof v==='number')return v;let s=String(v??'').trim().replace(/\s/g,'').replace(/\$/g,'');
  if(/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else s=s.replace(/,/g,'');const n=Number(s);return isFinite(n)?n:null;
}
function ctrlPuntajeColNOI(tipo,h){
  if(!h)return 0;
  if(tipo==='no'){
    if(/^(CLAVE|NUMERO|NMERO|NOTRAB|NUMTRAB|NUMEROTRABAJADOR|NMEROTRABAJADOR|CLAVETRABAJADOR|CLAVEEMPLEADO|NUMEMPLEADO)$/.test(h))return 60;
    if(h==='IDTRABAJADOR'||h==='NOEMPLEADO')return 55;
    if((h.includes('TRABAJ')||h.includes('EMPLEAD'))&&(h.includes('NUM')||h.startsWith('NO')||h.includes('CLAVE')))return 45;
  }
  if(tipo==='neto'){
    if(/^(NETOPAGADO|TOTALNETO)$/.test(h))return h==='NETOPAGADO'?70:66;if(h==='NETOAPAGAR')return 68;
    if(h==='IMPORTENETO'||h==='NETO')return 64;if(h==='LIQUIDOAPAGAR'||h==='TOTALAPAGAR')return 58;
    if(h==='MONTO'||h==='IMPORTE')return 35;
  }
  if(tipo==='nombre'){
    if(/^(NOMBREDELTRABAJADOR|NOMBRETRABAJADOR|NOMBRECOMPLETO)$/.test(h))return 35;
    if(/^(NOMBRE|TRABAJADOR|EMPLEADO)$/.test(h))return 30;
  }
  if(tipo==='tipo'&&/^(TIPO|TIPOPAGO|TIPOCALCULO|CONCEPTO)$/.test(h))return 15;
  return 0;
}
function ctrlDetectarLayoutNOI(matriz){
  let mejor=null;
  for(let f=0;f<Math.min(matriz.length,120);f++){
    const hs=(matriz[f]||[]).map(ctrlNormHdr);let no=-1,neto=-1,nombre=-1,tipo=-1,pNo=0,pNeto=0,pNom=0,pTipo=0;
    hs.forEach((h,c)=>{const a=ctrlPuntajeColNOI('no',h),b=ctrlPuntajeColNOI('neto',h),d=ctrlPuntajeColNOI('nombre',h),e=ctrlPuntajeColNOI('tipo',h);
      if(a>pNo){pNo=a;no=c;}if(b>pNeto){pNeto=b;neto=c;}if(d>pNom){pNom=d;nombre=c;}if(e>pTipo){pTipo=e;tipo=c;}});
    if(no>=0&&neto>=0){const puntaje=pNo+pNeto+pNom+pTipo;if(!mejor||puntaje>mejor.puntaje)mejor={fila:f,no,neto,nombre,tipo,puntaje};}
  }
  return mejor;
}
function ctrlExtraerFilasNOI(matriz,layout,hoja){
  const filas=[],headers=(matriz[layout.fila]||[]).map(ctrlNormHdr);
  const cols={rfc:headers.findIndex(h=>/^(RFC|RFCTRABAJADOR|RFCEMPLEADO)$/.test(h)),curp:headers.findIndex(h=>/^(CURP|CURPTRABAJADOR)$/.test(h)),nss:headers.findIndex(h=>/^(NSS|NUMEROSEGURIDADSOCIAL|NUMERODESEGURIDADSOCIAL|REGISTROIMSS)$/.test(h))};
  for(let f=layout.fila+1;f<matriz.length;f++){
    const r=matriz[f]||[],s=String(r[layout.no]??'').trim().replace(/\s/g,'');
    if(!/^\d+(?:\.0+)?$/.test(s))continue;
    const no=Math.trunc(Number(s)),m=ctrlNumero(r[layout.neto]);if(!no||r[layout.neto]==null||String(r[layout.neto]).trim()===''||m==null||!Number.isFinite(m))continue;
    filas.push({no,m:redondearCentavos(m),nombre:layout.nombre>=0?String(r[layout.nombre]||'').trim():'',rfc:cols.rfc>=0?r[cols.rfc]:'',curp:cols.curp>=0?r[cols.curp]:'',nss:cols.nss>=0?r[cols.nss]:'',tipo:layout.tipo>=0&&/FINIQ/i.test(String(r[layout.tipo]))?'FINIQUITO':'NOMINA',hoja,fila:f+1});
  }
  return filas;
}
/* La clave NOI es una referencia del archivo, no una identidad. Se conserva
   junto con el UUID y la clave de la fotografía, incluso si se renumera la ficha. */
function ctrlIdentificadorNOI(tipo,valor){
  let s=String(valor??'').trim().toUpperCase().replace(/[\s.\-]/g,'');
  if(tipo==='nss'&&/^\d{10,11}$/.test(s))s=s.padStart(11,'0');
  return (tipo==='rfc'?/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/:tipo==='curp'?/^[A-ZÑ]{4}\d{6}[HM][A-ZÑ]{5}[A-Z0-9]\d$/:/^\d{11}$/).test(s)?s:'';
}
function ctrlNombreIdentidadNOI(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(Boolean).sort().join(' ');}
function ctrlCruzarIdentidadNOI(leidas,items,workers,obraId,resueltas=[]){
  const padron=workers.filter(w=>(!w.obra_id||w.obra_id===obraId)&&!w.eliminado).map(w=>({...w,nombre:w.nombre||[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' ')}));
  items.forEach(x=>{if(!padron.some(w=>w.id===x.trabajador_id))padron.push({id:x.trabajador_id,no_trab:x.numero,nombre:x.nombre});});
  const claves=['rfc','curp','nss'],idx=Object.fromEntries(claves.map(k=>[k,new Map()])),nombres=new Map();
  const add=(map,key,w)=>{if(key)map.set(key,[...(map.get(key)||[]),w]);};
  padron.forEach(w=>{claves.forEach(k=>add(idx[k],ctrlIdentificadorNOI(k,w[k]),w));add(nombres,ctrlNombreIdentidadNOI(w.nombre),w);});
  const seen=new Map(),out=[],errores=[];
  leidas.forEach(n=>{
   try{
    const ids=Object.fromEntries(claves.map(k=>[k,ctrlIdentificadorNOI(k,n[k])])),nombre=ctrlNombreIdentidadNOI(n.nombre),hits=new Map();
    claves.forEach(k=>{const a=ids[k]?idx[k].get(ids[k])||[]:[];if(a.length>1)throw Error(`Identidad ${k.toUpperCase()} duplicada en el padrón. Revisa la fila ${n.fila} de ${n.hoja}.`);a.forEach(w=>hits.set(w.id,w));});
    if(hits.size>1)throw Error(`Los identificadores de la fila ${n.fila} corresponden a personas distintas. No se importó NOI.`);
    let w=[...hits.values()][0],metodo=w?'IDENTIFICADORES':'NOMBRE_UNICO';
    if(!w&&nombre){const a=nombres.get(nombre)||[];if(a.length>1)throw Error(`Nombre ambiguo en la fila ${n.fila}. Se requiere RFC, CURP o NSS.`);w=a[0];}
    if(!nombre&&!claves.some(k=>ids[k]))throw Error(`Fila ${n.fila}: se requiere nombre, RFC, CURP o NSS. El número de trabajador por sí solo no verifica identidad.`);
    if(w){
      const distintos=claves.filter(k=>ids[k]&&ctrlIdentificadorNOI(k,w[k])&&ids[k]!==ctrlIdentificadorNOI(k,w[k]));
      const resuelta=distintos.length===1&&distintos[0]==='rfc'?resueltas.find(r=>r.trabajador_id===w.id&&r.rfc_origen===ids.rfc&&r.rfc_validado===ctrlIdentificadorNOI('rfc',w.rfc)
        &&r.curp===ids.curp&&r.nss===ids.nss&&ctrlNombreIdentidadNOI(r.nombre)===nombre):null;
      if(distintos.length&&!resuelta)throw Error(`Identificadores contradictorios en la fila ${n.fila} (#${n.no} ${n.nombre}): ${distintos.map(k=>`${k.toUpperCase()} NOI ${ids[k]} / ficha ${ctrlIdentificadorNOI(k,w[k])}`).join('; ')}. Coteja el documento y corrige la fuente equivocada; no se reemplazará la identidad automáticamente.`);
      if(nombre&&ctrlNombreIdentidadNOI(w.nombre)&&nombre!==ctrlNombreIdentidadNOI(w.nombre))throw Error(`El nombre y la identidad no concuerdan en la fila ${n.fila}. Revisa el reporte y la ficha.`);
    }
    const identidad={version:1,metodo:w?metodo:'SIN_IDENTIFICAR',...ids,nombre:n.nombre,numero_noi:n.no,numero_plataforma:w?.no_trab??null,hoja:n.hoja,fila:n.fila};
    const key=w?'UUID:'+w.id:'FUENTE:'+JSON.stringify([ids,nombre,n.no]),prev=seen.get(key);
    if(prev){if(prev.n.m!==n.m||prev.n.no!==n.no||prev.n.tipo!==n.tipo||JSON.stringify(prev.ids)!==JSON.stringify(ids)||prev.nombre!==nombre)throw Error(`El reporte repite una identidad con datos distintos en la fila ${n.fila}.`);return;}
    seen.set(key,{n,ids,nombre});out.push({n,w,identidad});
   }catch(e){errores.push({hoja:n.hoja,fila:n.fila,numero:n.no,nombre:n.nombre,mensaje:e.message});}
  });
  if(errores.length){const e=Error(errores.map(x=>x.mensaje).join('\n'));e.conflictosNOI=errores;throw e;}
  return out;
}
function ctrlTextoLayoutNOI(hojas){
  const lineas=[];
  hojas.forEach(h=>{lineas.push(`HOJA: ${h.nombre}`);h.matriz.slice(0,120).forEach((r,i)=>lineas.push(`FILA ${i+1}: `+(r||[]).slice(0,40).map((v,c)=>`C${c+1}=${String(v??'').replace(/[\t\r\n]+/g,' ').slice(0,100)}`).join('\t')));});
  return lineas.join('\n').slice(0,58000);
}
async function ctrlLayoutNOIConIA(hojas){
  const j=await iaLlamar(IA_FN.extract,{tipo:'reporte_nomina_noi',texto:ctrlTextoLayoutNOI(hojas),pista:'Ubica exclusivamente la fila de encabezados y las columnas de clave/número del trabajador, nombre y neto pagado. Los índices FILA y C son 1-based.'});
  if(!(j&&j.ok)||j.error)throw new Error(j&&j.error?j.error:'Gemini no pudo reconocer la estructura.');
  const h=hojas.find(x=>ctrlNormHdr(x.nombre)===ctrlNormHdr(j.hoja))||hojas[0];
  const layout={fila:Number(j.fila_encabezado)-1,no:Number(j.columna_clave)-1,neto:Number(j.columna_neto)-1,nombre:j.columna_nombre==null?-1:Number(j.columna_nombre)-1,tipo:j.columna_tipo==null?-1:Number(j.columna_tipo)-1,puntaje:0,porIA:true};
  if(!Number.isInteger(layout.fila)||layout.fila<0||layout.fila>=h.matriz.length||!Number.isInteger(layout.no)||layout.no<0||!Number.isInteger(layout.neto)||layout.neto<0)throw new Error('Gemini no devolvió coordenadas válidas.');
  return {hoja:h,layout};
}
async function ctrlOpenConciliacion(id){
  if(puedeEditarTrabajador()&&(esVip()||esAdmin())){
    const {data:ajuste,error:eAjuste}=await sb.rpc('control_flujo_operar',{p_accion:'APLICAR_CENTAVOS_APROBADOS',p_datos:{cierre_id:id}});
    if(eAjuste){toast('No se abrió la conciliación: '+eAjuste.message,'err');return;}
    if(ajuste?.aplicado)toast('Corrección histórica aprobada aplicada y auditada; salarios y pagos intactos.','ok');
  }
  const {data:c,error}=await sb.from(CTRL_TABLAS.cierres).select('*').eq('id',id).eq('obra_id',OBRA.id).single();
  if(error){toast(ctrlFaltaScript(error),'err');return;}window._CTRL_CIERRE=c;window._CTRLNOI=null;
  const {data:filas,error:eFilas}=await fetchAllRows(()=>sb.from(CTRL_TABLAS.noi).select('*').eq('obra_id',OBRA.id).eq('cierre_id',id));
  if(eFilas||!Array.isArray(filas)){toast('No se pudo verificar la conciliación; no se mostrará como vacía.','err');return;}
  modal(ctrlNav(`⚖️ NOI vs PLATINUM · S${c.semana}`,'openCtrlCierres')+`<div class="m-body">
    <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><div style="flex:1"><label>Reporte final exportado de NOI (.xlsx, .xls o .csv)</label><input id="noi-file" type="file" accept=".xlsx,.xls,.csv" onchange="ctrlLeerArchivoNOI(this)"></div>
    <button class="btn" onclick="ctrlExportConciliacion()">⬇ Excel</button><button class="btn" onclick="PLATINUM_FLOWS.abrirCierre('${id}')">Versión, recibos y saldos</button></div>
    <div class="fhint" style="margin-top:6px">Detecta encabezados como Número/Clave del trabajador y Neto/Total neto. NOI sigue siendo la referencia final de timbrado; el sistema exige diferencia $0.00 para autorizar.</div>
    ${['BORRADOR','REVISADO'].includes(c.estado)?'<div class="fhint" style="margin-top:6px">Si cambiaste incidencias o reglas de retención, abre «Versión, recibos y saldos» y usa «Preparar fotografía actual» antes de conciliar. Volver a importar NOI compara contra la fotografía guardada: no recalcula el borrador ni requiere eliminar el cierre.</div>':''}
    <div id="noi-preview" style="margin-top:12px">${ctrlRenderConciliacion(filas||[])}</div></div>`,'lg');
  ctrlAuditar('CONCILIACION_NOI','ABRIR',{semana:c.semana},'CIERRE',id);
}
function ctrlRenderConciliacion(rows,editable=false){
  if(!rows.length)return '<div class="empty"><div class="big">⚖️</div>Aún no se importa el reporte final de NOI.</div>';
  const dif=rows.filter(x=>x.estatus!=='COINCIDE');
  return `<div class="stats"><div class="stat g"><div class="n">${rows.length-dif.length}</div><div class="l">Coinciden</div></div><div class="stat r"><div class="n">${dif.length}</div><div class="l">Diferencias / faltantes</div></div></div>
    ${ctrlTabla(['No.','Trabajador','Tipo','Método de pago','PLATINUM','NOI','Diferencia','Estado'],rows.map((x,i)=>`<tr><td>${x.trabajador_numero??'—'}${x.detalle?.identidad_noi&&Number(x.detalle.identidad_noi.numero_noi)!==Number(x.trabajador_numero)?'<br><small>NOI #'+esc(x.detalle.identidad_noi.numero_noi)+'</small>':''}</td><td>${esc(x.trabajador_nombre)}</td><td>${x.tipo_calculo}</td>
      <td>${x.detalle?.excepcion_noi?'EFECTIVO · EXCEPCIÓN AUTORIZADA':x.detalle?.sin_servicio_confirmado&&x.monto_platinum===0&&x.monto_noi===0?'SIN SERVICIO CONFIRMADO · sin pago'+(x.detalle.sin_servicio_confirmado.idse_pendiente?'<br><small>IDSE pendiente de completar</small>':''):x.tipo_calculo==='FINIQUITO'&&x.monto_platinum===0&&x.monto_noi===0?'FINIQUITO NETO $0 · sin cheque':editable?(x.tipo_calculo==='FINIQUITO'?ctrlEstado(x.metodo_pago||'CHEQUE'):'PAGO PENDIENTE · sin cheque automático'):`${ctrlEstado(x.metodo_pago||'TRANSFERENCIA')}${x.cheque_id?' <span title="Cheque vinculado">🧾</span>':x.pago_id?' <span title="Transferencia vinculada">💸</span>':''}`}</td>
      <td>${x.monto_platinum==null?'—':'$'+money(x.monto_platinum)}</td><td>${x.monto_noi==null?'—':'$'+money(x.monto_noi)}${x.detalle?.excepcion_noi?`<br><small>NOI original $${money(x.detalle.excepcion_noi.neto_original)}<br>Nómina por transferencia $${money(x.detalle.excepcion_noi.nomina_transferencia)}<br>Finiquito en efectivo $${money(x.detalle.excepcion_noi.finiquito_efectivo)}</small>`:''}</td><td style="color:${Number(x.diferencia)?'var(--red)':'var(--green)'}"><b>$${money(x.diferencia)}</b></td><td>${ctrlEstado(x.estatus)}</td></tr>`))}`;
}
function ctrlMetodoNOI(i,metodo){
  const st=window._CTRLNOI,r=st&&st.rows&&st.rows[i];if(!r)return;
  if(r.tipo_calculo!=='FINIQUITO')r.metodo_pago='TRANSFERENCIA';
}
async function ctrlRespaldosCeroNOI(cruces,items,cierre){
  const fuera=cruces.filter(x=>x.w&&x.n.m===0&&!items.some(i=>i.trabajador_id===x.w.id));
  if(!fuera.length)return {sinServicio:new Map(),finiquitos:new Set()};
  const {data,error}=await sb.rpc('control_noi_sin_servicio',{p_cierre:cierre.id});
  if(error||!Array.isArray(data))throw Error('No se pudo verificar el respaldo de los ceros sin servicio. No se guardó NOI. '+(error?.message||'Respuesta inválida.'));
  const sinServicio=new Map(data.map(x=>[x.trabajador_id,x]));
  const personal=fuera.filter(x=>!sinServicio.has(x.w.id)).map(x=>x.w);
  const historicos=await proyCargarHistoricos(personal);
  const fins=proyFiniquitosSemana(personal,cierre.snapshot?.desde,cierre.snapshot?.hasta,historicos);
  return {sinServicio,finiquitos:new Set(fins.filter(w=>w.monto_finiquito!=null&&Number(w.monto_finiquito)===0).map(w=>w.id))};
}
async function ctrlActualizarFotoNOI(){
  const st=window._CTRLNOI,c=window._CTRL_CIERRE,obra=OBRA.id,flow=window.PLATINUM_FLOWS;
  if(!st?.file||!st.finiquitosFuera?.length||!c||!flow||st.actualizando)return;
  if(!['BORRADOR','REVISADO'].includes(c.estado)){toast('Solicita reapertura: la fotografía autorizada no se modifica.','err');return;}
  if(!confirm('¿Preparar la fotografía actual del borrador y volver a comparar este archivo NOI? No se autoriza el cierre ni se alteran pagos.'))return;
  st.actualizando=true;const btn=$('noi-foto');if(btn)btn.disabled=true;
  try{
    await flow.abrirCierre(c.id);
    if(OBRA.id!==obra||window._CTRL_CIERRE!==c||window._CTRLNOI!==st)throw Error('Cambió el contexto; no se preparó este archivo.');
    await flow.preparar(c.id);
    if(OBRA.id!==obra||window._CTRL_CIERRE!==c||window._CTRLNOI!==st)throw Error('Cambió el contexto; vuelve a abrir la conciliación.');
    const d=await flow.call('DETALLE',{cierre_id:c.id});
    if(!st.finiquitosFuera.every(id=>(d.cierre?.snapshot?.items||[]).some(i=>i.trabajador_id===id&&i.tipo==='FINIQUITO'&&Number(i.monto)===0))){
      toast('La fotografía no se ha aplicado. Revisa el flujo de preparación o la aprobación histórica; no se guardó NOI.','err');return;
    }
    await ctrlOpenConciliacion(c.id);
    if(OBRA.id!==obra||window._CTRL_CIERRE?.id!==c.id)throw Error('Cambió el centro o el cierre.');
    await ctrlLeerArchivoNOI({files:[st.file]});
  }catch(e){toast(e.message,'err');}finally{st.actualizando=false;if($('noi-foto')===btn&&btn)btn.disabled=false;}
}
async function ctrlLeerArchivoNOI(inp){
  const file=inp.files&&inp.files[0];if(!file)return;
  const contexto={obra:OBRA.id,cierre:window._CTRL_CIERRE,preview:$('noi-preview')};
  window._CTRLNOI=null;
  try{
    const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array'});
    const hojas=wb.SheetNames.map(nombre=>({nombre,matriz:XLSX.utils.sheet_to_json(wb.Sheets[nombre],{header:1,defval:'',raw:true,blankrows:true})}));
    if(!hojas.some(h=>h.matriz.length))throw new Error('El archivo no contiene filas.');
    let detectadas=hojas.map(hoja=>({hoja,layout:ctrlDetectarLayoutNOI(hoja.matriz)})).filter(x=>x.layout),porIA=false;
    let leidas=detectadas.flatMap(x=>ctrlExtraerFilasNOI(x.hoja.matriz,x.layout,x.hoja.nombre));
    if(!detectadas.length||!leidas.length){detectadas=[await ctrlLayoutNOIConIA(hojas)];porIA=true;leidas=detectadas.flatMap(x=>ctrlExtraerFilasNOI(x.hoja.matriz,x.layout,x.hoja.nombre));}
    if(!leidas.length)throw new Error('Se localizaron encabezados, pero no se encontraron trabajadores con un neto válido.');
    if(OBRA.id!==contexto.obra||window._CTRL_CIERRE!==contexto.cierre||$('noi-preview')!==contexto.preview||inp.files[0]!==file)throw Error('Cambió el centro, el cierre o el archivo durante la lectura. Vuelve a seleccionar el archivo.');
    const exp=(window._CTRL_CIERRE.snapshot&&window._CTRL_CIERRE.snapshot.items)||[],out=[],usados=new Set();
    const hash=await ctrlSha(buf);
    const {data:resueltas,error:errorResueltas}=await sb.rpc('control_identidades_noi_resueltas',{p_cierre:contexto.cierre.id,p_sha:hash});
    if(errorResueltas||!Array.isArray(resueltas))throw Error('No se pudieron verificar las resoluciones de identidad del archivo: '+(errorResueltas?.message||'respuesta incompleta'));
    const cruces=ctrlCruzarIdentidadNOI(leidas,exp,WORKERS,OBRA.id,resueltas),noi=new Map(cruces.filter(x=>x.w).map(x=>[x.w.id,x]));
    const ceros=cruces.some(x=>x.n.m===0)?await ctrlRespaldosCeroNOI(cruces,exp,contexto.cierre):{sinServicio:new Map(),finiquitos:new Set()};
    if(exp.some(x=>noi.has(x.trabajador_id)&&exp.filter(z=>z.trabajador_id===x.trabajador_id).length>1))throw Error('Una persona tiene varios conceptos en la fotografía. Se requiere un desglose NOI por concepto; no se reutilizará el mismo neto.');
    exp.forEach(x=>{const cruce=noi.get(x.trabajador_id),n=cruce?.n,w=WORKERS.find(z=>z.id===x.trabajador_id);if(n)usados.add(cruce);out.push({obra_id:OBRA.id,cierre_id:window._CTRL_CIERRE.id,trabajador_id:x.trabajador_id,
      trabajador_numero:x.numero,trabajador_nombre:x.nombre,tipo_calculo:x.tipo||'NOMINA',metodo_pago:x.tipo==='FINIQUITO'?(finTransDe(w,window._CTRL_CIERRE.semana)?'TRANSFERENCIA':'CHEQUE'):'TRANSFERENCIA',monto_platinum:redondearCentavos(Number(x.monto)-(x.tipo==='FINIQUITO'?0:Math.min(Number(x.prevision_social)||0,Number(x.monto)))),monto_noi:n?n.m:null,
      detalle:{sueldo_nomina:x.sueldo_nomina||0,prevision_social:x.prevision_social||0,retenciones:x.retenciones||0,identidad_noi:cruce?.identidad||null,archivo:file.name,hojas:detectadas.map(d=>d.hoja.nombre),lector:porIA?'IA_LAYOUT':'AUTOMATICO'},importado_por_email:USER.email||''});});
    cruces.forEach(cruce=>{if(usados.has(cruce))return;const {n,w}=cruce,sinServicio=n.m===0&&w?ceros.sinServicio.get(w.id):null;
      const finCero=n.m===0&&w&&ceros.finiquitos.has(w.id),tipo=finCero?'FINIQUITO':n.tipo;
      out.push({obra_id:OBRA.id,cierre_id:window._CTRL_CIERRE.id,trabajador_id:w?.id||null,trabajador_numero:w?.no_trab??n.no,trabajador_nombre:String(n.nombre||'NO EN SNAPSHOT'),
      tipo_calculo:tipo,metodo_pago:tipo==='FINIQUITO'?'CHEQUE':'TRANSFERENCIA',monto_platinum:sinServicio&&tipo==='NOMINA'?0:null,monto_noi:n.m,
      detalle:{identidad_noi:cruce.identidad,...(sinServicio&&tipo==='NOMINA'?{sin_servicio_confirmado:sinServicio}:{}),archivo:file.name,hoja:n.hoja,fila:n.fila,lector:porIA?'IA_LAYOUT':'AUTOMATICO'},importado_por_email:USER.email||''});});
    const {data:excepciones,error:errorExcepciones}=await sb.rpc('control_excepciones_noi',{p_cierre:contexto.cierre.id,p_sha:hash});
    if(errorExcepciones)throw errorExcepciones;
    if(!Array.isArray(excepciones))throw Error('No se pudo comprobar el alcance de las excepciones autorizadas.');
    const excepcionPorId=new Map(excepciones.map(e=>[e.trabajador_id,e]));
    if(OBRA.id!==contexto.obra||window._CTRL_CIERRE!==contexto.cierre||$('noi-preview')!==contexto.preview||inp.files[0]!==file)throw Error('Cambió el centro, el cierre o el archivo durante la lectura. Vuelve a seleccionar el archivo.');
    window._CTRLNOI={rows:out,file,hash,lector:porIA?'IA_LAYOUT':'AUTOMATICO',registrosNOI:cruces.length,finiquitosFuera:[...ceros.finiquitos]};
    const prev=out.map((x,i)=>{const e=excepcionPorId.get(x.trabajador_id),aplica=e&&x.tipo_calculo==='FINIQUITO'&&x.monto_noi===Number(e.neto_original);
      const m=aplica?Number(e.finiquito_efectivo):x.monto_noi;
      return {...x,_i:i,monto_noi:m,detalle:{...x.detalle,...(aplica?{excepcion_noi:e}:{})},diferencia:redondearCentavos((x.monto_platinum||0)-(m||0)),estatus:x.monto_platinum==null?'SIN_PLATINUM':m==null?'SIN_NOI':redondearCentavos(x.monto_platinum-m)===0?'COINCIDE':'DIFERENCIA'};});
    const resumen=`<div style="background:var(--blue-bg);border:1px solid var(--border);border-radius:9px;padding:9px 12px;margin-bottom:10px;font-size:12px"><b>Lectura por identidad:</b> ${cruces.length} trabajador(es) · ${detectadas.map(d=>`${esc(d.hoja.nombre)}, encabezados fila ${d.layout.fila+1}`).join(' · ')}. Se conservan las claves de NOI y de la fotografía.</div>`;
    const identidades=resueltas.length?`<div role="status" class="fhint">Identidad histórica documentada: ${resueltas.map(r=>`RFC del reporte ${esc(r.rfc_origen)} · RFC vigente ${esc(r.rfc_validado)}`).join('; ')}. Se conserva el RFC original del archivo; la resolución sólo aplica a este periodo, trabajador y huella.</div>`:'';
    const foto=identidades+(ceros.finiquitos.size?`<div role="alert" style="padding:10px;border:1px solid var(--amber);border-radius:9px;margin-bottom:8px">${ceros.finiquitos.size} finiquito(s) cero confirmado(s) aún no está(n) en la fotografía guardada. No se omitirá su desglose de retenciones. <button class="btn" id="noi-foto" onclick="ctrlActualizarFotoNOI()">Preparar fotografía y volver a comparar</button></div>`:'');
    $('noi-preview').innerHTML=(porIA?IA_BANNER:'')+resumen+foto+`<div style="margin-bottom:8px"><button class="btn dark" id="noi-save" onclick="ctrlGuardarNOI()">💾 Guardar conciliación</button> <b>${esc(file.name)}</b><div class="fhint">Nómina normal: pago pendiente, sin cheque automático. Desde el sábado 12:00 revisa y confirma candidatos. Finiquitos: cheque por defecto, salvo transferencia previamente autorizada. Casos sin servicio y finiquitos de neto cero: sin pago ni cheque.</div></div>`+ctrlRenderConciliacion(prev,true);
  }catch(e){
    if(e.conflictosNOI?.length&&OBRA.id===contexto.obra&&window._CTRL_CIERRE===contexto.cierre&&$('noi-preview')===contexto.preview){
      $('noi-preview').innerHTML=`<div role="alert" style="padding:12px;border:1px solid var(--red);border-radius:9px"><b>Archivo leído: ${e.conflictosNOI.length} conflicto(s) de identidad por revisar.</b><p>No se guardó ni se sustituyó la conciliación. Las fichas y los pagos están intactos. Compara estos campos con los documentos y vuelve a importar después de corregir la fuente equivocada.</p>${ctrlTabla(['Hoja / fila','No. NOI / nombre','Diferencia'],e.conflictosNOI.map(x=>`<tr><td>${esc(x.hoja)} / ${esc(x.fila)}</td><td>#${esc(x.numero)} ${esc(x.nombre)}</td><td>${esc(x.mensaje)}</td></tr>`))}</div>`;
      toast(`Archivo leído: revisa los ${e.conflictosNOI.length} conflictos de identidad que se muestran abajo.`,'err');
    }else toast('No se pudo leer NOI: '+e.message,'err');
  }
}
async function ctrlGuardarNOI(){
  if(!window.PLATINUM_FLOWS){toast('No cargó el flujo integrado. No se reemplazó NOI.','err');return;}
  return window.PLATINUM_FLOWS.importarNOI(window._CTRLNOI,window._CTRL_CIERRE);
}
async function ctrlExportConciliacion(){
  const c=window._CTRL_CIERRE;if(!c)return;const {data,error}=await fetchAllRows(()=>sb.from(CTRL_TABLAS.noi).select('*').eq('obra_id',OBRA.id).eq('cierre_id',c.id));
  if(error||!(data||[]).length){toast('No hay conciliación guardada.','err');return;}
  await ctrlExportar('CONCILIACIÓN NOI',['NO.','TRABAJADOR','TIPO','MÉTODO PAGO','PLATINUM','NOI','DIFERENCIA','ESTADO'],data.map(x=>[x.trabajador_numero??'',x.trabajador_nombre,x.tipo_calculo,x.metodo_pago||'TRANSFERENCIA',x.monto_platinum??'',x.monto_noi??'',x.diferencia,x.estatus]),`CONCILIACION_NOI_S${c.semana}`,'CONCILIACION_NOI');
}
async function ctrlExportCierres(){
  const a=window._CTRLCIERRES||[];await ctrlExportar('CIERRES DE NÓMINA',['SEMANA','PERIODO','ESTADO','TRABAJADORES','NÓMINA','PREVISIÓN','RETENCIONES','FINIQUITOS','NETO','REVISÓ','AUTORIZÓ'],a.map(c=>['S'+c.semana,c.periodo,c.estado,c.total_trabajadores,c.total_nomina,c.total_prevision,c.total_retenciones,c.total_finiquitos,c.total_neto,c.revisado_por_email||'',c.autorizado_por_email||'']),'CIERRES_NOMINA','CIERRE_NOMINA');
}
function ctrlLunes(f){
  const d=new Date(f+'T12:00'),dow=(d.getDay()+6)%7;d.setDate(d.getDate()-dow+(dow<=2?0:7));return d.toISOString().slice(0,10);
}
function ctrlHabiles(f,n=5){
  const d=new Date(f+'T12:00');let x=0;while(x<n){d.setDate(d.getDate()+1);if(d.getDay()!==0&&d.getDay()!==6)x++;}return d.toISOString().slice(0,10);
}
async function openCtrlMovimientos(){
  ctrlAuditar('SEGURIDAD_SOCIAL','ABRIR');const {data,error}=await ctrlLeer(CTRL_TABLAS.mov);if(error){toast(ctrlFaltaScript(error),'err');return;}
  const a=(data||[]).sort((x,y)=>String(y.fecha_efectiva).localeCompare(String(x.fecha_efectiva)));window._CTRLMOV=a;
  modal(ctrlNav('📅 IMSS · IDSE · SUA')+`<div class="m-body"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn dark" onclick="openCtrlNuevoMovimiento()">＋ Registrar</button><button class="btn" onclick="ctrlSincronizarMovimientos()">↻ Detectar altas y bajas</button><button class="btn" onclick="openCtrlCasosIMSS()">🏥 Expediente IMSS único</button><button class="btn" onclick="openCtrlAltasCortas()">↔️ Sin servicio</button><button class="btn" onclick="ctrlExportMovimientos()">⬇ Excel</button></div>
    <p class="fhint" style="margin-top:8px">“Proceso interno” aplica la regla lunes (solicitudes lunes-miércoles: lunes de esa semana; jueves-domingo: lunes siguiente). “Límite legal” es un control separado de 5 días hábiles y debe validarse con el calendario oficial.</p>
    ${ctrlTabla(['Trabajador','Movimiento','Efectiva','Proceso interno','Límite legal','Canales','Estado','Acción'],a.map(x=>`<tr><td>#${x.trabajador_numero??'—'} ${esc(x.trabajador_nombre)}</td><td>${x.tipo}</td><td>${fmtD(x.fecha_efectiva)}</td><td>${fmtD(x.fecha_proceso_interno)}</td><td style="color:${x.estado!=='ACEPTADO'&&x.fecha_limite_legal<today()?'var(--red)':''}">${fmtD(x.fecha_limite_legal)}</td><td>${esc((x.canales||[]).join(' · '))}</td><td>${ctrlEstado(x.estado)}</td><td>${x.estado==='PENDIENTE'? `<button class="btn" onclick="ctrlMovEstado('${x.id}','PREPARADO')">Preparado</button>`:x.estado==='PREPARADO'? `<button class="btn dark" onclick="openCtrlPresentarMov('${x.id}')">Presentar</button>`:x.estado==='PRESENTADO'? `<button class="btn dark" onclick="ctrlMovEstado('${x.id}','ACEPTADO')">Aceptar</button>`:''}</td></tr>`),'Sin movimientos registrados.')}</div>`,'lg');
}
function openCtrlNuevoMovimiento(){
  modal(ctrlNav('＋ Movimiento de seguridad social','openCtrlMovimientos')+`<div class="m-body"><div class="grid" style="grid-template-columns:2fr 1fr">
    <div><label>Trabajador</label><select id="cm-w">${WORKERS.slice().sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9)).map(w=>`<option value="${w.id}">#${w.no_trab??'—'} · ${esc(fullName(w))}</option>`).join('')}</select></div>
    <div><label>Movimiento</label><select id="cm-t"><option>ALTA</option><option>REINGRESO</option><option>BAJA</option><option>MODIFICACION_SALARIO</option><option>INCAPACIDAD</option></select></div>
    <div><label>Fecha en que se recibió</label><input id="cm-sol" type="date" value="${today()}"></div><div><label>Fecha efectiva</label><input id="cm-efe" type="date" value="${today()}"></div>
    <div class="c2" style="grid-column:span 2"><label>Canales</label><input id="cm-can" value="IMSS, IDSE, SUA, NOI" placeholder="IMSS, IDSE, SUA, NOI, INFONAVIT"></div>
    <div class="c2" style="grid-column:span 2"><label>Observaciones</label><textarea id="cm-obs" rows="2"></textarea></div></div></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlMovimientos()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarMovimiento()">Guardar</button></div>`,'md');
}
async function ctrlGuardarMovimiento(){
  const w=WORKERS.find(x=>x.id===$('cm-w').value),sol=$('cm-sol').value,efe=$('cm-efe').value;if(!w||!sol||!efe){toast('Completa trabajador y fechas.','err');return;}
  const fila={obra_id:OBRA.id,trabajador_id:w.id,trabajador_numero:w.no_trab,trabajador_nombre:fullName(w),tipo:$('cm-t').value,fecha_solicitud:sol,fecha_efectiva:efe,
    fecha_proceso_interno:ctrlLunes(sol),fecha_limite_legal:ctrlHabiles(efe),canales:$('cm-can').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean),observaciones:$('cm-obs').value.trim(),creado_por_email:USER.email||''};
  markWrite();const {data,error}=await sb.from(CTRL_TABLAS.mov).insert(fila).select('id').single();if(error){toast(ctrlFaltaScript(error),'err');return;}
  await ctrlAuditar('SEGURIDAD_SOCIAL','REGISTRAR',fila,'MOVIMIENTO',data.id);toast('Movimiento registrado.','ok');openCtrlMovimientos();
}
async function ctrlSincronizarMovimientos(){
  const sem=semObra(),[d1,d2]=semRange(sem),{data:ya,error}=await ctrlLeer(CTRL_TABLAS.mov);if(error){toast(ctrlFaltaScript(error),'err');return;}
  const existe=new Set((ya||[]).map(x=>[x.trabajador_id,x.tipo,x.fecha_efectiva].join('|'))),ins=[];
  WORKERS.forEach(w=>[['ALTA',w.fecha_alta],['REINGRESO',w.fecha_reingreso],['BAJA',w.fecha_baja]].forEach(([tipo,f])=>{if(f&&f>=d1&&f<=d2&&!existe.has([w.id,tipo,f].join('|')))ins.push({obra_id:OBRA.id,trabajador_id:w.id,trabajador_numero:w.no_trab,trabajador_nombre:fullName(w),tipo,fecha_solicitud:f,fecha_efectiva:f,fecha_proceso_interno:ctrlLunes(f),fecha_limite_legal:ctrlHabiles(f),canales:['IMSS','IDSE','SUA','NOI'].concat(DESC.some(d=>d.trabajador_id===w.id&&d.tipo==='INFONAVIT'&&d.activo)?['INFONAVIT']:[]),observaciones:'DETECTADO DESDE LA FICHA DEL TRABAJADOR',creado_por_email:USER.email||''});}));
  if(!ins.length){toast('No hay altas, reingresos o bajas nuevas en la semana.','ok');return;}markWrite();const {error:e}=await sb.from(CTRL_TABLAS.mov).insert(ins);
  if(e){toast(ctrlFaltaScript(e),'err');return;}await ctrlAuditar('SEGURIDAD_SOCIAL','SINCRONIZAR',{semana:sem,registros:ins.length});toast(ins.length+' movimientos agregados.','ok');openCtrlMovimientos();
}
async function ctrlMovEstado(id,estado,extra={}){
  const mov=(window._CTRLMOV||[]).find(x=>x.id===id);
  let avisoSync='';
  markWrite();const up={estado,...extra};const {error}=await sb.from(CTRL_TABLAS.mov).update(up).eq('id',id).eq('obra_id',OBRA.id);if(error){toast(ctrlFaltaScript(error),'err');return;}
  /* Presentar desde el Centro de control y elegir "ALTA PRESENTADA" en la
     ficha representan el mismo hecho. Sincronizamos ambos caminos para que el
     aviso amarillo desaparezca inmediatamente, pero NO simulamos un acuse: el
     expediente seguirá alertando hasta que se importe el PDF real. */
  if(estado==='PRESENTADO'&&mov&&['ALTA','REINGRESO'].includes(String(mov.tipo||'').toUpperCase())&&mov.trabajador_id){
    const fecha=String(mov.fecha_efectiva||today()).slice(0,10);
    const {error:eTrab}=await sb.from('trabajadores').update({movimiento_imss:'ALTA PRESENTADA',fecha_mov_imss:fecha,actualizado_por:USER.email}).eq('id',mov.trabajador_id).eq('obra_id',OBRA.id);
    if(eTrab){avisoSync='La presentación se guardó, pero no se pudo sincronizar la ficha: '+eTrab.message;}
    else{
      const w=WORKERS.find(x=>x.id===mov.trabajador_id);
      if(w){w.movimiento_imss='ALTA PRESENTADA';w.fecha_mov_imss=fecha;}
      renderTable();
    }
  }
  await ctrlAuditar('SEGURIDAD_SOCIAL','CAMBIAR_ESTADO',{estado,...extra},'MOVIMIENTO',id);toast(avisoSync||('Movimiento: '+estado+'.'),avisoSync?'err':'ok');openCtrlMovimientos();
}
function openCtrlPresentarMov(id){
  modal(ctrlNav('📨 Registrar presentación','openCtrlMovimientos')+`<div class="m-body"><div><label>Folio o acuse *</label><input id="cmp-folio" placeholder="Folio IDSE / IMSS / SUA"></div><div style="margin-top:10px"><label>Enlace de evidencia (opcional)</label><input id="cmp-url" placeholder="https://..."></div></div>
  <div class="m-foot"><button class="btn" onclick="openCtrlMovimientos()">Cancelar</button><button class="btn dark" onclick="ctrlPresentarMov('${id}')">Guardar presentación</button></div>`,'md');
}
function ctrlPresentarMov(id){const f=$('cmp-folio').value.trim(),u=$('cmp-url').value.trim();if(!f&&!u){toast('Captura folio o evidencia.','err');return;}ctrlMovEstado(id,'PRESENTADO',{folio:f||null,evidencia_url:u||null,presentado_en:new Date().toISOString()});}
async function ctrlExportMovimientos(){const a=window._CTRLMOV||[];await ctrlExportar('MOVIMIENTOS DE SEGURIDAD SOCIAL',['NO.','TRABAJADOR','TIPO','SOLICITUD','EFECTIVA','PROCESO INTERNO','LÍMITE LEGAL','CANALES','ESTADO','FOLIO'],a.map(x=>[x.trabajador_numero??'',x.trabajador_nombre,x.tipo,x.fecha_solicitud,x.fecha_efectiva,x.fecha_proceso_interno,x.fecha_limite_legal,(x.canales||[]).join(', '),x.estado,x.folio||'']),'MOVIMIENTOS_IMSS_IDSE_SUA','SEGURIDAD_SOCIAL');}
async function openCtrlDocumentos(){
  ctrlAuditar('CUMPLIMIENTO_OBRA','ABRIR');const {data,error}=await fetchAllRows(()=>sb.from('v_control_documentos_semaforo').select('*').eq('obra_id',OBRA.id));if(error){toast(ctrlFaltaScript(error),'err');return;}
  const a=(data||[]).sort((x,y)=>String(x.fecha_vencimiento||'9999').localeCompare(String(y.fecha_vencimiento||'9999')));window._CTRLDOCS=a;
  modal(ctrlNav('🗂️ Expediente de cumplimiento')+`<div class="m-body"><div style="display:flex;gap:8px"><button class="btn dark" onclick="openCtrlNuevoDocumento()">＋ Documento</button><button class="btn" onclick="ctrlExportDocumentos()">⬇ Excel</button></div>
  ${ctrlTabla(['Tipo','Documento / tercero','Folio','Vence','Semáforo','Responsable','Evidencia'],a.map(x=>`<tr><td>${x.tipo}</td><td><b>${esc(x.titulo)}</b><br><span style="font-size:10px">${esc(x.tercero||'')}</span></td><td>${esc(x.folio||'—')}</td><td>${fmtD(x.fecha_vencimiento)||'—'}</td><td>${ctrlEstado(x.semaforo)}</td><td>${esc(x.responsable||'—')}</td><td>${x.evidencia_url?`<a href="${esc(x.evidencia_url)}" target="_blank" rel="noopener">Abrir</a>`:'Pendiente'}</td></tr>`),'Sin documentos de cumplimiento.')}</div>`,'lg');
}
function openCtrlNuevoDocumento(){
  modal(ctrlNav('＋ Documento de cumplimiento','openCtrlDocumentos')+`<div class="m-body"><div class="grid" style="grid-template-columns:1fr 2fr">
    <div><label>Tipo</label><select id="cd-t"><option>SIROC</option><option>REPSE</option><option>CONTRATO</option><option>OPINION_32D</option><option>OPINION_IMSS</option><option>OPINION_INFONAVIT</option><option>POLIZA</option><option>LICENCIA</option><option>OTRO</option></select></div>
    <div><label>Título *</label><input id="cd-n"></div><div><label>Tercero / emisor</label><input id="cd-ter"></div><div><label>Folio</label><input id="cd-fol"></div>
    <div><label>Emisión</label><input id="cd-em" type="date"></div><div><label>Vencimiento</label><input id="cd-ve" type="date"></div>
    <div><label>Alertar con días</label><input id="cd-al" type="number" value="30"></div><div><label>Estado</label><select id="cd-es"><option>VIGENTE</option><option>EN_TRAMITE</option><option>NO_APLICA</option><option>SUSPENDIDO</option></select></div>
    <div><label>Responsable</label><input id="cd-res"></div><div><label>Enlace evidencia</label><input id="cd-url" placeholder="https://..."></div>
    <div class="c2" style="grid-column:span 2"><label>Observaciones</label><textarea id="cd-obs" rows="2"></textarea></div></div></div>
    <div class="m-foot"><button class="btn" onclick="openCtrlDocumentos()">Cancelar</button><button class="btn dark" onclick="ctrlGuardarDocumento()">Guardar</button></div>`,'md');
}
async function ctrlGuardarDocumento(){
  const titulo=$('cd-n').value.trim();if(!titulo){toast('Escribe el título.','err');return;}
  const f={obra_id:OBRA.id,tipo:$('cd-t').value,titulo,tercero:$('cd-ter').value.trim(),folio:$('cd-fol').value.trim(),fecha_emision:$('cd-em').value||null,fecha_vencimiento:$('cd-ve').value||null,
    alerta_dias:parseInt($('cd-al').value)||30,evidencia_url:$('cd-url').value.trim()||null,responsable:$('cd-res').value.trim(),estado_manual:$('cd-es').value,observaciones:$('cd-obs').value.trim(),creado_por_email:USER.email||''};
  markWrite();const {data,error}=await sb.from(CTRL_TABLAS.docs).insert(f).select('id').single();if(error){toast(ctrlFaltaScript(error),'err');return;}await ctrlAuditar('CUMPLIMIENTO_OBRA','REGISTRAR',f,'DOCUMENTO',data.id);toast('Documento guardado.','ok');openCtrlDocumentos();
}
async function ctrlExportDocumentos(){const a=window._CTRLDOCS||[];await ctrlExportar('EXPEDIENTE DE CUMPLIMIENTO',['TIPO','TÍTULO','TERCERO','FOLIO','EMISIÓN','VENCIMIENTO','SEMÁFORO','DÍAS RESTANTES','RESPONSABLE','EVIDENCIA'],a.map(x=>[x.tipo,x.titulo,x.tercero||'',x.folio||'',x.fecha_emision||'',x.fecha_vencimiento||'',x.semaforo,x.dias_restantes??'',x.responsable||'',x.evidencia_url||'']),'EXPEDIENTE_CUMPLIMIENTO','CUMPLIMIENTO_OBRA');}
function ctrlCostosReales(sem,contratista=''){
  const s=String(sem),fil=w=>!contratista||String(w.contratista||'')===contratista,ids=new Set(WORKERS.filter(fil).map(w=>w.id));
  const valido=x=>!/(CANCEL|RECHAZ|DUPLIC)/i.test(String(x.estado||x.estatus||''));
  const transfer=PAGOS.filter(p=>ids.has(p.trabajador_id)&&String(p.semana||'').replace(/\D/g,'')===s&&valido(p)).reduce((a,p)=>a+(Number(p.importe)||0),0);
  const ch=CHEQUES.filter(c=>ids.has(c.trabajador_id)&&String(c.semana||'').replace(/\D/g,'')===s&&valido(c));
  const sueldoCh=ch.filter(c=>c.tipo_pago!=='FINIQUITO').reduce((a,c)=>a+(Number(c.importe)||0),0),fini=ch.filter(c=>c.tipo_pago==='FINIQUITO').reduce((a,c)=>a+(Number(c.importe)||0),0);
  const prev=DIFS.filter(d=>ids.has(d.trabajador_id)&&String(d.semana)===s&&d.activo!==false).reduce((a,d)=>a+(Number(d.monto)||0),0);
  const [d1,d2]=semRange(sem),{act,fins}=pyCandidatos(d1,d2,'TODOS'),proy=act.filter(fil).reduce((a,w)=>a+Math.max(0,(Number(w.sal_semanal)||0)+difDe(w.id,'S'+sem)-retencionesDePeriodo(w,'S'+sem).total),0)+fins.filter(fil).reduce((a,w)=>a+(Number(w.monto_finiquito)||0),0);
  return {transfer:redondearCentavos(transfer),cheques:redondearCentavos(sueldoCh),prevision:redondearCentavos(prev),finiquitos:redondearCentavos(fini),proyeccion:redondearCentavos(proy)};
}
async function openCtrlCostos(semElegida){
  ctrlAuditar('COSTOS_OBRA','ABRIR');const {data,error}=await ctrlLeer(CTRL_TABLAS.costos);if(error){toast(ctrlFaltaScript(error),'err');return;}
  const sem=parseInt(semElegida)||semObra(),a=data||[],b=a.find(x=>x.semana===sem&&x.periodo==='TODOS'&&!x.contratista)||{},r=ctrlCostosReales(sem),pres=['presupuesto_nomina','presupuesto_prevision','presupuesto_finiquitos','presupuesto_carga_patronal','presupuesto_otros'].reduce((s,k)=>s+(Number(b[k])||0),0),
    real=r.transfer+r.cheques+r.prevision+r.finiquitos+(Number(b.real_carga_patronal)||0)+(Number(b.real_otros)||0);window._CTRLCOST={sem,b,r,pres,real};
  modal(ctrlNav('📊 Costo real de obra')+`<div class="m-body"><div class="grid" style="grid-template-columns:120px auto 1fr;align-items:end"><div><label>Semana</label><input id="co-sem" type="number" value="${sem}"></div><button class="btn" onclick="ctrlCambiarSemanaCostos()">Consultar</button><button class="btn" onclick="ctrlExportCostos()">⬇ Excel</button></div>
    <div class="stats" style="margin-top:12px"><div class="stat b"><div class="n">$${money(r.proyeccion)}</div><div class="l">Proyectado por motor</div></div><div class="stat g"><div class="n">$${money(real)}</div><div class="l">Real confirmado/capturado</div></div><div class="stat a"><div class="n">$${money(pres)}</div><div class="l">Presupuesto</div></div><div class="stat ${real>pres&&pres?'r':'g'}"><div class="n">$${money(pres-real)}</div><div class="l">Disponible / variación</div></div></div>
    <div class="grid" style="grid-template-columns:repeat(2,1fr);margin-top:12px">
      <div><label>Presupuesto nómina</label><input id="co-pn" type="number" step=".01" value="${b.presupuesto_nomina||0}"></div><div><label>Presupuesto previsión social</label><input id="co-pp" type="number" step=".01" value="${b.presupuesto_prevision||0}"></div>
      <div><label>Presupuesto finiquitos</label><input id="co-pf" type="number" step=".01" value="${b.presupuesto_finiquitos||0}"></div><div><label>Presupuesto carga patronal</label><input id="co-pc" type="number" step=".01" value="${b.presupuesto_carga_patronal||0}"></div>
      <div><label>Presupuesto otros</label><input id="co-po" type="number" step=".01" value="${b.presupuesto_otros||0}"></div><div><label>Carga patronal real (según SUA)</label><input id="co-rc" type="number" step=".01" value="${b.real_carga_patronal||0}"></div>
      <div><label>Otros reales</label><input id="co-ro" type="number" step=".01" value="${b.real_otros||0}"></div><div><label>Observaciones</label><input id="co-obs" value="${esc(b.observaciones||'')}"></div></div>
    <div class="fhint" style="margin-top:8px">Pagado detectado: transferencias $${money(r.transfer)} · cheques de sueldo $${money(r.cheques)} · previsión $${money(r.prevision)} · finiquitos $${money(r.finiquitos)}. La carga real se captura desde la determinación del SUA.</div></div>
    <div class="m-foot"><button class="btn dark" onclick="ctrlGuardarCosto()">💾 Guardar presupuesto y reales</button></div>`,'lg');
}
function ctrlCambiarSemanaCostos(){openCtrlCostos(parseInt($('co-sem').value)||semObra());}
async function ctrlGuardarCosto(){
  const sem=parseInt($('co-sem').value)||semObra(),f={obra_id:OBRA.id,semana:sem,periodo:'TODOS',contratista:'',presupuesto_nomina:Number($('co-pn').value)||0,presupuesto_prevision:Number($('co-pp').value)||0,presupuesto_finiquitos:Number($('co-pf').value)||0,presupuesto_carga_patronal:Number($('co-pc').value)||0,presupuesto_otros:Number($('co-po').value)||0,real_carga_patronal:Number($('co-rc').value)||0,real_otros:Number($('co-ro').value)||0,observaciones:$('co-obs').value.trim(),creado_por_email:USER.email||''};
  markWrite();const {data,error}=await sb.from(CTRL_TABLAS.costos).upsert(f,{onConflict:'obra_id,semana,periodo,contratista'}).select('id').single();if(error){toast(ctrlFaltaScript(error),'err');return;}await ctrlAuditar('COSTOS_OBRA','GUARDAR',f,'PRESUPUESTO',data.id);toast('Costo y presupuesto guardados.','ok');openCtrlCostos(sem);
}
async function ctrlExportCostos(){const x=window._CTRLCOST;if(!x)return;const b=x.b||{},r=x.r;await ctrlExportar('COSTO REAL DE OBRA',['CONCEPTO','PRESUPUESTO','REAL'],[['Nómina',b.presupuesto_nomina||0,r.transfer+r.cheques],['Previsión social',b.presupuesto_prevision||0,r.prevision],['Finiquitos',b.presupuesto_finiquitos||0,r.finiquitos],['Carga patronal',b.presupuesto_carga_patronal||0,b.real_carga_patronal||0],['Otros',b.presupuesto_otros||0,b.real_otros||0],['TOTAL',x.pres,x.real],['PROYECCIÓN DEL MOTOR','',r.proyeccion]],`COSTO_REAL_S${x.sem}`,'COSTOS_OBRA');}
