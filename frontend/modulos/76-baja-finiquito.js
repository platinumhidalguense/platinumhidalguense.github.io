/* Recorrido de baja. Sólo Confirmar envía la transacción de escritura. */
const BAJA_PAPELES_CAMPOS=['fecha_alta','fecha_baja','fecha_pago','sd','dias_aguinaldo','dias_vacaciones','tabla_vacaciones',
  'aguinaldo_acreditado','dias_pendientes','credito','dias_infonavit','numero_credito','exento_ag_usado','exento_pv_usado','isr_precision','d001'];
let BAJA_FLUJO=null;

function bajaCamposPrestaciones(){
  const raiz=$('pr-out')?.closest('.m-body');
  return [...(raiz?.querySelectorAll('input[id],select[id]')||[])]
    .filter(n=>n.id!=='pr-fecha'&&(n.id.startsWith('pr-')||n.id.startsWith('f-pr-')))
    .map(n=>[n.id,n.type==='checkbox'?n.checked:n.value]);
}
function bajaTrabajadorCalculo(id){
  const s=BAJA_FLUJO;
  return s?.w.id===id&&s.host?.contains($('pr-out'))?s.w:null;
}
function bajaDescuentos(w){
  const s=BAJA_FLUJO;
  return s?.w===w&&s.c?.descuentos?s.c.descuentos:(typeof DESC!=='undefined'?DESC:[]);
}
function bajaPapelCompatible(p,e){
  const texto=new Set(['fecha_alta','fecha_baja','fecha_pago','numero_credito']);
  return !!p?.id&&JSON.stringify(p.entradas?.fuente_prestaciones??null)===JSON.stringify(e.fuente_prestaciones??null)&&BAJA_PAPELES_CAMPOS.every(k=>{
    const a=p.entradas?.[k]??'',b=e[k]??'';
    if(texto.has(k)||a===''||b==='')return String(a)===String(b);
    return Number(a)===Number(b);
  });
}
function bajaDocumento(motivo,escenario){
  if(escenario==='SI'||escenario==='ART50')return 'Convenio de separación sujeto a revisión jurídica';
  return {
    'RENUNCIA VOLUNTARIA':'Carta de renuncia y recibo de finiquito',
    'DESPIDO JUSTIFICADO (ART. 47 LFT)':'Aviso de rescisión',
    'ABANDONO DE TRABAJO':'Acta de hechos',
    'DEFUNCION':'Documento para beneficiarios'
  }[motivo]||'Convenio de terminación y recibo';
}

(function(){
 'use strict';
 const destinos={CHEQUE:'Cheque pendiente',TRANSFERENCIA:'Transferencia autorizada',GESTION_POSTERIOR:'Gestión de pago posterior',SIN_PAGO:'Sin importe por pagar'};
 const identidad=s=>({obra_id:s.obra,trabajador_id:s.w.id,fecha:s.fecha,operacion_id:s.op});
 const vigente=s=>BAJA_FLUJO===s&&s.host?.isConnected&&OBRA?.id===s.obra&&USER?.id===s.usuario;
 const el=(s,id)=>s.host.querySelector('#'+id);
 async function rpc(accion,datos){
  const {data,error}=await sb.rpc('control_baja_finiquito',{p_accion:accion,p:datos});
  if(error)throw Error(error.message);
  if(!data)throw Error('La base devolvió una respuesta incompleta.');
  return data;
 }
 function antesCerrar(contenedor=null){
  const s=BAJA_FLUJO;
  if(!s||!s.host?.isConnected||contenedor&&!contenedor.contains(s.host))return true;
  if(s.enviando)return false;
  if(s.cambios&&!s.resultado&&!confirm('Hay cambios sin guardar. ¿Cerrar y descartarlos?'))return false;
  if(globalThis._PR_NOI_AJUSTE===s.noi)globalThis._PR_NOI_AJUSTE=null;
  BAJA_FLUJO=null;
  return true;
 }
 function encabezado(w,ver){
  return `<div class="m-head"><h2>${ver?'Baja y finiquito registrados':'Baja y finiquito'}</h2>
    <button type="button" class="x" data-bf="cerrar" aria-label="Cerrar">×</button></div>
    <div class="m-body baja-finiquito"><p class="fhint"><strong>#${esc(w.no_trab??'—')} ${esc(fullName(w))}</strong> ·
      ${esc(razonSocialEmpresa(empresaDeTrabajador(w)))} · ${esc(OBRA.nombre)} · <span id="bf-estatus">${esc(w.estatus)}</span></p>
      ${ver?'':'<ol class="bf-etapas" aria-label="Pasos"><li>Datos de la baja</li><li>Calcular finiquito y vincular el papel</li><li>Revisar y confirmar</li></ol>'}
      <div id="bf-aviso" role="status" aria-live="polite"></div><section id="bf-panel"></section></div>
    <div class="m-foot" id="bf-acciones"></div>`;
 }
 function acciones(s,html){el(s,'bf-acciones').innerHTML=html;}
 function mensaje(s,txt){el(s,'bf-aviso').textContent=txt;}
 function etapa(s,n){
  s.paso=n;
  s.host.querySelector('.m-body').scrollTop=0;
  [...s.host.querySelectorAll('.bf-etapas li')].forEach((l,i)=>l.setAttribute('aria-current',i===n-1?'step':'false'));
  mensaje(s,'');
 }
 function dibujarDatos(s){
  etapa(s,1);
  const inicio=iniAntig(s.w)||'';
  el(s,'bf-panel').innerHTML=`<h3>Datos de la baja</h3><div class="grid bf-grid">
    <div><label for="bf-fecha">Fecha efectiva de baja</label><input id="bf-fecha" type="date" min="${esc(inicio)}" max="${today()}" value="${esc(s.fecha)}"></div>
    <div><label for="bf-causal">Motivo</label><select id="bf-causal"><option value="">Elige el motivo</option>
      ${MOTIVOS_BAJA.map(m=>`<option value="${esc(m)}" ${s.motivo===m?'selected':''}>${esc(m)}</option>`).join('')}</select></div>
    <div><label for="bf-detalle">Detalle u observación</label><input id="bf-detalle" maxlength="600" value="${esc(s.detalle)}"></div></div>
    <p>Ciclo vigente desde <b>${esc(inicio||'Por verificar')}</b> · ${s.w.fecha_reingreso?'Reingreso':'Alta inicial'}
      ${s.w.fecha_baja?' · Baja anterior '+esc(s.w.fecha_baja):''}</p><div id="bf-periodo" aria-live="polite"></div>`;
  acciones(s,'<button type="button" class="btn" data-bf="cerrar">Cancelar</button><button class="btn dark" type="button" data-bf="calcular">Continuar a cálculo</button>');
  if(s.c)periodo(s,s.c);
 }
 function periodo(s,c){
  const r=el(s,'bf-periodo');
  if(!r)return;
  r.innerHTML=`<p>${esc(c.periodicidad)} · S${esc(c.semana_fecha)} · ${esc(c.periodo.desde)} al ${esc(c.periodo.hasta)}
    · ${esc(prAntiguedadLegal(c.inicio_ciclo,c.fecha).completos)} año(s) de antigüedad reconocida.</p>
    ${c.corta?`<p class="fhint">Alta o reingreso y baja en la misma semana · servicio ${esc(c.servicio||'pendiente de verificar')}.
      La coincidencia de fechas no confirma falta de servicio. <button type="button" class="btn" data-bf="servicio">Seguimiento de altas y bajas</button></p>`:''}
    ${c.protegido?'<p role="alert">Periodo protegido. Usa el flujo vigente de reapertura.</p>':''}`;
 }
 function guardarDatos(s){
  const f=el(s,'bf-fecha').value, motivo=el(s,'bf-causal').value, detalle=el(s,'bf-detalle').value.trim();
  prFechaUTC(f);
  if(!iniAntig(s.w)||f<iniAntig(s.w)||f>today())throw Error('Usa una fecha efectiva dentro del ciclo vigente, hasta hoy.');
  if(!MOTIVOS_BAJA.includes(motivo))throw Error('Elige el motivo del catálogo.');
  if(['OTRO','ABANDONO DE TRABAJO','DESPIDO JUSTIFICADO (ART. 47 LFT)'].includes(motivo)&&!detalle)throw Error('Captura la observación de esta causal.');
  if(s.fecha!==f||s.motivo!==motivo&&s.motivo){
    s.campos=[];s.papelEntrada=null;s.referencia='';s.fonacot='';s.precision='';s.c=null;s.servicio=null;s.confirmacionServicio=false;
  }
  Object.assign(s,{fecha:f,motivo,detalle});
 }
 async function cargarCalculo(s){
  guardarDatos(s);
  const boton=s.host.querySelector('[data-bf="calcular"]');
  boton.disabled=true;
  mensaje(s,'Consultando ficha, periodo, créditos, NOI y papel…');
  try{
    const c=await rpc('CONTEXTO',identidad(s));
    if(!vigente(s))return;
    if(c.trabajador.id!==s.w.id||c.obra_id!==s.obra||c.fecha!==s.fecha)throw Error('La respuesta no corresponde a esta baja.');
    if(s.c?.firma&&s.c.firma!==c.firma){s.campos=[];s.papelEntrada=null;s.precision='';s.fonacot='';s.referencia='';}
    s.c=c;s.w=c.trabajador;
    window.PLATINUM_PRESTACIONES_FUENTES.registrar(s.w,s.fecha,c.prestaciones_fuente);
    periodo(s,c);
    if(c.protegido||c.conflicto_caso)throw Error(c.protegido?'Periodo protegido. Usa el flujo vigente de reapertura.':
      c.conflicto_caso?'Hay otro caso de servicio en esta semana. Revísalo antes de continuar.':'Hay aguinaldo aplicado a este periodo. Concilia la aplicación antes de continuar.');
    if(c.cheque)throw Error('Hay un cheque de finiquito vigente en esa semana. Coteja el ciclo y el importe antes de seguir.');
    if(c.corta&&s.servicio==null){dibujarServicio(s);return;}
    if(c.aguinaldo_periodo&&s.servicio!=='SI')throw Error('Hay una aplicación de aguinaldo en este periodo; revisa su cobertura antes de continuar.');
    dibujarCalculo(s);
  }finally{boton.disabled=false;}
 }
 function dibujarServicio(s){
  etapa(s,1);
  el(s,'bf-panel').innerHTML=`<h3>Servicio efectivo del ciclo</h3><p>El alta o reingreso y la baja corresponden a la misma semana. ¿Confirmas que el trabajador no prestó servicios en este ciclo?</p><dl class="bf-resumen"><dt>Alta / reingreso</dt><dd>${esc(s.c.inicio_ciclo)}</dd><dt>Baja efectiva real</dt><dd>${esc(s.fecha)}</dd><dt>Semana del centro</dt><dd>S${esc(s.c.semana_fecha)} · ${esc(s.c.semana_inicio)}</dd></dl><p class="fhint">La coincidencia de fechas sólo activa esta pregunta. Los derechos y pagos de ciclos anteriores se conservan.</p>`;
  acciones(s,'<button type="button" class="btn" data-bf="volver">Cambiar fecha</button><button type="button" class="btn dark" data-bf="sin-servicio">Sí, sin servicio</button><button type="button" class="btn" data-bf="con-servicio">No, sí prestó servicios</button><button type="button" class="btn" data-bf="servicio-pendiente">Pendiente de verificar</button>');
 }
 function dibujarSinServicio(s){
  etapa(s,2);
  el(s,'bf-panel').innerHTML=`<h3>Resultado del ciclo confirmado sin servicio</h3><dl class="bf-resumen"><dt>Inicio del ciclo</dt><dd>${esc(s.c.inicio_ciclo)}</dd><dt>Fecha efectiva real de baja</dt><dd><strong>${esc(s.fecha)}</strong></dd><dt>Total a pagar de este ciclo</dt><dd>$0.00</dd><dt>Destino</dt><dd>Sin pago</dd></dl><p>Se guardarán la clasificación, el papel justificativo en cero y la baja en una sola operación. No se genera cheque ni pago. Los ciclos anteriores conservan sus derechos y comprobantes.</p><label><input id="bf-confirma-servicio" type="checkbox" ${s.confirmacionServicio?'checked':''}> Confirmo que no hubo trabajo efectivo en este ciclo y que la fecha de baja mostrada es la real.</label>`;
  acciones(s,'<button type="button" class="btn" data-bf="volver">Regresar</button><button type="button" class="btn dark" id="pr-usar" data-bf="revisar">Continuar a revisión</button>');
 }
 function dibujarCalculo(s){
  if(s.servicio==='SI')return dibujarSinServicio(s);
  etapa(s,2);
  s.noi={trabajador_id:s.w.id,estado:'LISTO',datos:s.c.noi};
  globalThis._PR_NOI_AJUSTE=s.noi;
  globalThis._PR_REVISION_ENTRADAS=null;
  const requiereFonacot=s.c.descuentos.some(d=>d.tipo==='FONACOT'&&d.activo);
  const p=s.c.papel;
  el(s,'bf-panel').innerHTML=`<h3>Calcular finiquito y vincular el papel</h3>${prFormulario(s.w,s.fecha,true)}
    <section class="bf-papel"><h4>Papel de prestaciones</h4>
      <p>${p?`Revisión ${esc(p.revision)} localizada para esta fecha · huella ${esc(p.huella)}`:'Se preparará un papel versionado.'}</p>
      ${p?'<button type="button" class="btn" data-bf="papel">Cargar datos del papel</button>':''}
      <div class="grid bf-grid">
        <div><label for="bf-precision">ISR del papel con precisión completa (opcional)</label><input id="bf-precision" type="number" step="any" min="0" value="${esc(s.precision)}"></div>
        ${requiereFonacot?`<div><label for="bf-fonacot">FONACOT respaldado ($, incluido cero)</label><input id="bf-fonacot" type="number" min="0" step=".01" value="${esc(s.fonacot)}"></div>`:''}
        <div><label for="bf-referencia">Referencia NOI o del soporte cuando hay ajuste</label><input id="bf-referencia" maxlength="300" value="${esc(s.referencia)}"></div>
      </div><div id="bf-comparacion" class="fhint" aria-live="polite"></div>
      <button type="button" class="btn" data-bf="comparar">Comparar con el papel</button>
    </section>`;
  el(s,'pr-out').insertAdjacentHTML('beforebegin',`<section class="bf-papel bf-d001" aria-labelledby="bf-d001-titulo">
    <h4 id="bf-d001-titulo">Ajuste de redondeo D001 recomendado para NOI</h4>
    <div id="bf-d001-vista" aria-live="polite"></div>
    <p class="fhint">La propuesta conserva el neto redondeado del papel al sumar los conceptos de NOI a centavos. Requiere confirmación al continuar.</p>
    <button type="button" class="btn" id="bf-d001-aplicar" data-bf="d001" disabled>Usar D001 recomendado</button>
  </section>`);
  acciones(s,'<button type="button" class="btn" data-bf="volver">Regresar</button><button type="button" class="btn dark" id="pr-usar" data-bf="revisar">Continuar a revisión</button>');
  for(const [k,v] of s.campos){const n=el(s,k);if(n){if(n.type==='checkbox')n.checked=v;else n.value=v;}}
  if(el(s,'pr-validado-legal')?.checked)globalThis._PR_REVISION_ENTRADAS=prHuellaRevision();
  if(s.papelEntrada&&s.papelEntrada.id===p?.id&&s.papelEntrada.huella===p.huella)cargarPapel(s);
  else calcPrestaciones(s.w.id);
  actualizarD001(s);
  const panel=el(s,'pr-faltas-hist');
  s.evidencia=s.c.prestaciones_fuente;
  s.lectura=Promise.resolve(s.evidencia);
  panel.innerHTML=window.PLATINUM_PRESTACIONES_FUENTES.panel(s.evidencia);

 }
 function cargarPapel(s){
  const p=s.c.papel,e=p?.entradas;
  if(!e||e.fecha_alta!==s.c.inicio_ciclo||Number(e.sd)!==Number(s.w.sd))throw Error('El papel tiene otra base salarial o ciclo.');
  el(s,'f-pr-dias').value=e.dias_pendientes;
  el(s,'pr-isr-noi').value=p.resultado.d001;
  if(el(s,'f-pr-info-dias'))el(s,'f-pr-info-dias').value=e.dias_infonavit??'';
  el(s,'bf-precision').value=e.isr_precision??'';
  s.papelEntrada=p;
  calcPrestaciones(s.w.id);
  if(el(s,'bf-comparacion'))el(s,'bf-comparacion').textContent='Campos compatibles precargados. Revisa diferencias en días, créditos e ISR.';
 }
 function guardarCampos(s){
  s.campos=bajaCamposPrestaciones();
  s.referencia=el(s,'bf-referencia').value.trim();
  s.fonacot=el(s,'bf-fonacot')?.value??'';
  s.precision=el(s,'bf-precision').value;
 }
 function propuesta(s){
  guardarCampos(s);
  calcPrestaciones(s.w.id);
  const a=structuredClone(globalThis._PR_AUDIT);
  if(!a||a.invalido||a.trabajador_id!==s.w.id||a.periodo!==s.fecha||!Number.isFinite(a.monto_modelo)||!Number.isFinite(a.monto_aplicado))throw Error('El cálculo del finiquito está incompleto.');
  if(a.requiere_noi_manual||a.requiere_revision_legal)throw Error('Confirma el neto NOI y las validaciones que corresponden a este caso.');
  const legal=a.entradas.escenario_separacion!=='NO';
  if(legal&&s.motivo!==prMotivoSeparacion(a.entradas.escenario_separacion))throw Error('La causal de la baja y el escenario jurídico no coinciden.');
  const fon=el(s,'bf-fonacot')?prMontoLegal(s.fonacot,'FONACOT respaldado',{centavos:true}):0;
  if(el(s,'bf-fonacot')&&s.referencia.length<3)throw Error('Indica el soporte para el monto FONACOT.');
  a.resultado.fonacot=fon;
  a.monto_modelo=redondearCentavos(a.monto_modelo-fon);
  if(a.entradas.noi_manual==null)a.monto_aplicado=a.monto_modelo;
  else if(s.referencia.length<3)throw Error('Indica la referencia del neto conciliado con NOI.');
  if(a.monto_aplicado<0||a.monto_aplicado===0&&a.entradas.noi_manual==null)throw Error('Captura el neto cero sólo cuando esté confirmado.');
  a.resultado.modelo_total=a.monto_modelo;
  a.resultado.aplicado=a.monto_aplicado;
  a.ajuste_noi=redondearCentavos(a.monto_aplicado-a.monto_modelo);
  if(legal)return {a,e:null,reutiliza:false,legal};
  let e=ppfEntradas(s.w,s.fecha,a);
  e.credito=String(redondearCentavos(Number(a.resultado.infonavit||0)+fon));
  e.isr_precision=s.precision;
  if(s.papelEntrada?.id===s.c.papel?.id&&s.papelEntrada?.entradas){
    for(const k of ['fecha_pago','exento_ag_usado','exento_pv_usado'])e[k]=s.papelEntrada.entradas[k];
    // Si el D001 del papel fue automático, conserva esa modalidad al coincidir.
    if(!s.papelEntrada.entradas.d001&&Number(e.d001)===Number(s.papelEntrada.resultado.d001))e.d001='';
  }
  const r=ppfModelo(e),p=s.c.papel, reutiliza=bajaPapelCompatible(p,e);
  return {a,e:reutiliza?p.entradas:e,r,reutiliza,legal};
 }
 function actualizarD001(s){
  const vista=el(s,'bf-d001-vista'),boton=el(s,'bf-d001-aplicar');
  if(!vista||s.paso!==2)return;
  boton.disabled=true;
  try{
    const q=propuesta(s);
    if(q.legal){vista.textContent='Confirma el ISR ordinario con el respaldo de separación.';return;}
    const r=q.r,ajuste=redondearCentavos(r.d001_propuesto-r.d001);
    vista.innerHTML=`<dl class="bf-resumen">
      <dt>ISR matemático</dt><dd>$${esc(r.isr_calculado.toFixed(8))}</dd>
      <dt>ISR del papel con precisión completa</dt><dd>$${esc(r.isr_precision)}</dd>
      <dt>D001 actual</dt><dd>$${money(r.d001)}</dd>
      <dt>D001 recomendado para NOI</dt><dd><strong>$${money(r.d001_propuesto)}</strong></dd>
      <dt>Ajuste de redondeo</dt><dd>${ajuste>0?'+':ajuste<0?'−':''}$${money(Math.abs(ajuste))}</dd>
      <dt>Neto del papel antes de créditos</dt><dd>$${money(r.neto_papel)}</dd>
      <dt>Neto NOI actual antes de créditos</dt><dd>$${money(r.neto_noi)}</dd></dl>`;
    boton.disabled=!Number.isFinite(r.d001_propuesto)||r.d001_propuesto<0||r.d001_propuesto>r.bruto_noi;
  }catch(error){vista.textContent=error.message;}
 }
 function comparar(s,q){
  const p=s.c.papel;
  if(q.legal){el(s,'bf-comparacion').textContent='Se vinculará el respaldo de separación validado por el administrador.';return;}
  const diff=p&&!q.reutiliza?` Revisar cambios: D001 $ ${money(p.resultado.d001)} → $ ${money(q.r.d001)}, neto del papel $ ${money(p.resultado.neto_con_credito)} → $ ${money(q.r.neto_con_credito)}.`:'';
  el(s,'bf-comparacion').textContent=(q.reutiliza?'Se reutilizará la revisión '+p.revision+'.':p?'Se preparará una nueva revisión.':'Se preparará el primer papel.')+
    ' ISR matemático '+q.r.isr_calculado.toFixed(6)+' · D001 $'+money(q.r.d001)+' · neto del papel $'+money(q.r.neto_con_credito)+'.'+diff;
 }
 async function revisar(s){
  if(s.servicio==='SI'){
   if(!el(s,'bf-confirma-servicio')?.checked)throw Error('Confirma el ciclo sin servicio y su fecha efectiva.');
   s.confirmacionServicio=true;s.propuesta={legal:false,reutiliza:false,e:null,confirmar_isr:false,a:{monto_modelo:0,monto_aplicado:0,entradas:{noi_manual:null,escenario_separacion:'NO'}}};
   dibujarRevision(s);return;
  }
  const boton=el(s,'pr-usar');boton.disabled=true;
  const revision=s.edicion;
  try{
    const q=propuesta(s);
    comparar(s,q);
    const ev=await s.lectura;
    if(!vigente(s)||s.paso!==2)return;
    if(s.edicion!==revision)throw Error('Cambió la captura. Revisa el cálculo actualizado.');
    if(!ev)throw Error('No se verificaron faltas y aguinaldo del ciclo.');
    window.PLATINUM_PRESTACIONES_FUENTES.decision(ev);
    if(!q.legal&&(q.r.d001!==q.a.resultado.isr||q.r.neto_con_credito!==q.a.monto_modelo)){
      throw Error('El papel y el cálculo individual difieren. Revisa el D001, los créditos y el neto antes de continuar.');
    }
    q.confirmar_isr=!!(q.e&&(q.e.d001!==''||q.e.isr_precision!=='')&&!q.reutiliza);
    if(q.confirmar_isr&&!confirm('¿Confirmas el ISR de este papel? ISR matemático '+q.r.isr_calculado.toFixed(6)+' · D001 $'+money(q.r.d001)+'.'))return;
    s.propuesta=q;
    dibujarRevision(s);
  }finally{if(boton.isConnected)boton.disabled=false;}
 }
 function dibujarRevision(s){
  const q=s.propuesta,c=s.c,n=q.a.monto_aplicado;
  const metodos=n===0?['SIN_PAGO']:c.transferencia?['TRANSFERENCIA']:
    c.corta&&c.servicio!=='CON_SERVICIO'?['GESTION_POSTERIOR']:['CHEQUE','GESTION_POSTERIOR'];
  if(c.transferencia&&Number(c.transferencia.importe)!==n)throw Error('El destino por transferencia tiene otro importe. Concilia antes de confirmar.');
  etapa(s,3);
  el(s,'bf-panel').innerHTML=`<h3>Revisar y confirmar</h3><dl class="bf-resumen">
    <dt>Ciclo</dt><dd>${esc(c.inicio_ciclo)}</dd><dt>Fecha efectiva</dt><dd>${esc(s.fecha)}</dd><dt>Motivo</dt><dd>${esc(s.motivo)} ${esc(s.detalle)}</dd>
    <dt>Periodo</dt><dd>${esc(c.periodicidad)} · S${esc(c.semana_fecha)} · ${esc(c.periodo.desde)} a ${esc(c.periodo.hasta)}</dd>
    <dt>Papel</dt><dd>${q.legal?'Respaldo jurídico revisado':q.reutiliza?'Revisión '+esc(c.papel.revision)+' · '+esc(c.papel.huella):'Se guardará revisión '+((c.papel?.revision||0)+1)}</dd>
    <dt>Neto del cálculo</dt><dd>$${money(q.a.monto_modelo)}</dd><dt>Importe que se aplicará</dt><dd><strong>$${money(n)}</strong>
      ${q.a.entradas.noi_manual!=null?' · conciliado con NOI':''}</dd><dt>Documento</dt><dd>${esc(bajaDocumento(s.motivo,q.a.entradas.escenario_separacion))}</dd>
    </dl><label for="bf-destino">Destino de pago</label><select id="bf-destino">${metodos.map(m=>`<option value="${m}">${destinos[m]}</option>`).join('')}</select>
    ${q.a.entradas.noi_manual!=null?`<p>Referencia: ${esc(s.referencia)}</p><label class="bf-check"><input type="checkbox" id="bf-neto-confirmado"> Confirmo el neto conciliado de $ ${money(n)}</label>`:''}
    <p class="fhint">${c.corta&&c.servicio!=='CON_SERVICIO'?'Se registrará o conservará el seguimiento de servicio efectivo. ':''}
      El movimiento IMSS y la entrega o dispersión se gestionan en sus controles correspondientes.</p>`;
  acciones(s,`<button class="btn" type="button" data-bf="volver">Regresar</button><button class="btn danger" id="baja-btn" type="button" onclick="doBaja('${esc(s.w.id)}')">Confirmar baja</button>`);
 }
 function registrado(s,d){
  s.resultado=d;s.cambios=false;
  if(d.trabajador?.id===s.w.id){
    s.w=d.trabajador;
    window.PLATINUM_PERSONAL?.aplicarFila(s.w,undefined,true);
    window.PLATINUM_FICHA?.actualizar?.(s.w);
  }
  if(d.caso?.id)window.PLATINUM_DATOS?.aplicar({table:'control_altas_bajas_cortas',eventType:'UPDATE',new:d.caso});
  if(d.cheque?.id)window.PLATINUM_DATOS?.aplicar({table:'cheques',eventType:'INSERT',new:d.cheque});
  el(s,'bf-estatus').textContent=s.w.estatus;
  mensaje(s,d.recuperada?'Baja recuperada con el mismo identificador.':'Baja registrada.');
  dibujarRegistrada(s,d);
 }
 function dibujarRegistrada(s,d){
  const b=d?.operacion_id?d:null,w=s.w;
  const fecha=b?.fecha||w.fecha_baja;
  const misma=w.estatus==='BAJA'&&w.fecha_baja===fecha;
  el(s,'bf-panel').innerHTML=`<h3>${b||misma?'Baja registrada':'Papel de prestaciones del ciclo anterior'}</h3>
    <p>${esc(fecha||'Fecha no disponible')} · ${esc(b?.motivo||w.motivo_baja||'Motivo por consultar')} ·
    ${b?.neto!=null?'$'+money(b.neto):misma&&w.monto_finiquito!=null?'$'+money(w.monto_finiquito):'Importe aplicado por consultar'}</p>
    ${b?`<p>${esc(destinos[b.destino]||b.destino)} ${b.cheque_id?'· cheque pendiente registrado':''}
      ${b.servicio?'· servicio '+esc(b.servicio):''}</p><p class="fhint">Operación ${esc(b.operacion_id)} · ${b.papel_revision?'papel revisión '+esc(b.papel_revision):'consultar el respaldo registrado'}.</p>`:''}
    ${misma&&puedeEditarTrabajador()?'<button type="button" class="btn" data-bf="revertir">Revertir baja por error</button>':''}
    ${misma?'<button type="button" class="btn" data-bf="documento">Generar documento de separación</button>':''}
    ${b?.papel_id||fecha?'<button type="button" class="btn" data-bf="ver-papel">Ver papel de prestaciones</button>':''}
    <button type="button" class="btn" data-bf="expediente">Expediente</button>
    <button type="button" class="btn" data-bf="historial">Historial</button>
    <button type="button" class="btn" data-bf="pagos">Seguimiento de pago</button>
    ${b?.servicio?'<button type="button" class="btn" data-bf="servicio">Seguimiento de altas y bajas</button>':''}`;
  acciones(s,'<button class="btn" type="button" data-bf="cerrar">Cerrar</button>');
 }
 async function verPapel(s){
  const b=s.resultado,f=b?.fecha||s.fecha;
  if(!b?.papel_id){(s.anidado?closeModal2:closeModal)();return ppfAbrirEditor(s.w.id,f);}
  const {data:p,error}=await sb.from('prestaciones_papeles').select('id,fecha_baja,revision,huella,entradas,resultado')
    .eq('id',b.papel_id).eq('obra_id',s.obra).eq('trabajador_id',s.w.id).single();
  if(!vigente(s))return;
  if(error||!p||p.fecha_baja!==f||p.huella!==b.papel_huella)throw Error(error?.message||'El papel no coincide con la baja confirmada.');
  const r=p.resultado;
  modal2(`<div class="m-head"><h2>Papel aplicado · revisión ${esc(p.revision)}</h2><button class="x" onclick="closeModal2()" aria-label="Cerrar">×</button></div>
    <div class="m-body"><p>#${esc(s.w.no_trab)} ${esc(fullName(s.w))} · baja efectiva ${esc(p.fecha_baja)}</p>
    <dl class="bf-resumen"><dt>ISR matemático</dt><dd>${esc(r.isr_calculado)}</dd>
    <dt>ISR del papel</dt><dd>${esc(r.isr_precision)}</dd><dt>D001</dt><dd>$${money(r.d001)}</dd>
    <dt>Neto del papel</dt><dd>$${money(r.neto_con_credito)}</dd><dt>Neto aplicado</dt><dd>$${money(b.neto)}</dd></dl>
    <p class="fhint">Huella ${esc(p.huella)}</p></div><div class="m-foot"><button class="btn" onclick="closeModal2()">Volver a la baja</button></div>`,'md');
 }
 async function confirmar(id){
  const s=BAJA_FLUJO;
  if(!s||id!==s.w.id||s.paso!==3||s.enviando||s.resultado||!vigente(s)||!puedeEditarTrabajador())return;
  const q=s.propuesta, destino=el(s,'bf-destino').value, confirmar_neto=!!el(s,'bf-neto-confirmado')?.checked;
  if(q.a.entradas.noi_manual!=null&&!confirmar_neto){mensaje(s,'Confirma el neto conciliado.');return;}
  const payload={...identidad(s),motivo:s.motivo,detalle:s.detalle,referencia:s.referencia,destino,
    firma:s.c.firma,servicio_respuesta:s.c.corta?s.servicio:null,confirmar_sin_servicio:s.servicio==='SI'&&s.confirmacionServicio,calculo:q.a,entradas_papel:q.e,confirmar_isr:q.confirmar_isr,confirmar_neto};
  const boton=el(s,'baja-btn');s.enviando=true;boton.disabled=true;
  try{
    if(s.intento){
      const d=await rpc('ESTADO',identidad(s));
      if(!vigente(s))return;
      if(d.estado==='REGISTRADA'){registrado(s,d);return;}
    }
    s.intento=true;
    mensaje(s,'Registrando baja, papel, finiquito y destino…');markWrite();
    const d=await rpc('CONFIRMAR',payload);
    if(!vigente(s))return;
    if(d.operacion_id!==s.op||d.estado!=='REGISTRADA')throw Error('No se pudo confirmar el registro. Consulta el estado.');
    registrado(s,d);
  }catch(error){
    if(!vigente(s))return;
    try{
      const d=await rpc('ESTADO',identidad(s));
      if(!vigente(s))return;
      if(d.estado==='REGISTRADA'){registrado(s,d);return;}
    }catch{if(vigente(s))mensaje(s,'No se confirmó la respuesta. Al reintentar se consultará primero la misma operación.');return;}
    mensaje(s,error.message);
  }finally{s.enviando=false;if(boton.isConnected)boton.disabled=false;}
 }
 async function abrir(id,o={}){
  const w=WORKERS.find(x=>x.id===id&&x.obra_id===OBRA?.id&&!x.eliminado)||
    (o.trabajador?.id===id&&o.trabajador.obra_id===OBRA?.id&&!o.trabajador.eliminado?o.trabajador:null);
  if(!w||!USER||typeof SOLO_CONTRATOS!=='undefined'&&SOLO_CONTRATOS)return;
  const ver=o.ver||w.estatus==='BAJA';
  if(!ver&&(!puedeEditarTrabajador()||!['ACTIVO','PENDIENTE'].includes(w.estatus)))return toast('No puedes registrar una baja para esta ficha.','err');
  if(BAJA_FLUJO?.host?.isConnected)return;
  const s={w,obra:w.obra_id,usuario:USER.id,fecha:o.papel?.fecha_baja||o.fecha||(ver?w.fecha_baja:today()),
    motivo:'',detalle:'',referencia:'',fonacot:'',precision:'',campos:o.campos||[],papelEntrada:o.papel,op:_uuid(),edicion:0};
  const html='<div id="bf-flujo">'+encabezado(w,ver)+'</div>';
  s.anidado=!o.reemplazar&&!!$('modals').querySelector('.overlay');
  if(s.anidado)modal2(html,'lg prestaciones-form baja-finiquito-form');else modal(html,'lg prestaciones-form baja-finiquito-form');
  s.host=$('bf-flujo');BAJA_FLUJO=s;
  const cerrar=()=>s.anidado?closeModal2():closeModal();
  s.host.oninput=()=>{if(!s.resultado&&!ver){s.cambios=true;s.edicion++;if(s.paso===2)actualizarD001(s);}};
  s.host.onclick=async e=>{
    const accion=e.target.closest('[data-bf]')?.dataset.bf;
    if(!accion||s.enviando||!vigente(s))return;
    try{
      if(accion==='cerrar')return cerrar();
      if(accion==='calcular')return await cargarCalculo(s);
      if(['sin-servicio','con-servicio','servicio-pendiente'].includes(accion)){
       s.servicio=accion==='sin-servicio'?'SI':accion==='con-servicio'?'NO':'PENDIENTE';
       if(s.servicio!=='SI'&&s.c.aguinaldo_periodo)throw Error('Hay una aplicación de aguinaldo en este periodo; revisa su cobertura.');
       dibujarCalculo(s);return;
      }
      if(accion==='revertir')return abrirReversionBaja(s.w.id);
      if(accion==='papel'){cargarPapel(s);actualizarD001(s);return;}
      if(accion==='comparar')return comparar(s,propuesta(s));
      if(accion==='d001'){
        const q=propuesta(s);
        if(q.legal)throw Error('Confirma el ISR ordinario con el respaldo de separación.');
        el(s,'pr-isr-noi').value=q.r.d001_propuesto.toFixed(2);
        s.cambios=true;s.edicion++;actualizarD001(s);
        return mensaje(s,'D001 propuesto capturado. Se pedirá confirmación al continuar.');
      }
      if(accion==='revisar')return await revisar(s);
      if(accion==='volver'){if(s.paso===1){dibujarDatos(s);}else if(s.paso===2){if(s.servicio!=='SI')guardarCampos(s);s.servicio=null;dibujarDatos(s);}else dibujarCalculo(s);return;}
      if(accion==='documento')return generarBajaDoc(s.w.id);
      if(accion==='ver-papel')return await verPapel(s);
      if(accion==='expediente'||accion==='historial'){cerrar();return openDetail(s.w.id,undefined,{seccion:accion});}
      if(accion==='pagos'){
        const sem=s.resultado?.semana_fecha||(s.fecha?isoWeekDe(OBRA,new Date(s.fecha+'T12:00')):null);
        cerrar();return window.PLATINUM_CONCILIADOR_SEMANAL?.abrir(null,sem);
      }
      if(accion==='servicio'){
        if(!s.resultado&&!confirm('¿Salir del borrador para consultar servicio efectivo?'))return;
        s.cambios=false;cerrar();return openCtrlAltasCortas(s.c?.semana_fecha);
      }
    }catch(error){if(vigente(s))mensaje(s,error.message);}
  };
  if(!ver){dibujarDatos(s);return;}
  mensaje(s,'Consultando el registro de la baja…');
  try{
    const d=await rpc('VER',identidad(s));
    if(!vigente(s))return;
    s.w=d.trabajador;s.resultado=d.operacion||{fecha:s.fecha};mensaje(s,'');
    dibujarRegistrada(s,d.operacion);
  }catch(error){if(vigente(s)){mensaje(s,error.message);acciones(s,'<button class="btn" type="button" data-bf="cerrar">Cerrar</button>');}}
 }
 window.PLATINUM_BAJA=Object.freeze({abrir,confirmar,antesCerrar});
})();
