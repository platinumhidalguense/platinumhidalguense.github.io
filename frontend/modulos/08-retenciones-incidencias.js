/* ---------- PERIODICIDAD DE PAGO (2026-08-28) ------------------------
   Hasta aquí TODO el motor daba por hecho la semana: 7 días clavados en
   el cálculo, en el ISR, en el subsidio y en la cuota del INFONAVIT. En
   obra eso está bien —se paga semanal—, pero la OFICINA es quincenal y
   con la regla semanal se le retenía la mitad de lo que le toca.

   A partir de aquí el periodo es un dato, no una constante:

     dias   días naturales que cubre el pago (7 semanal, 15 quincenal).
     lab    días trabajados dentro de ese periodo. De ahí sale el factor
            de la falta: en la semana de obra son 6 días trabajados + el
            séptimo día de descanso pagado (LFT art. 69), así que faltar
            un día cuesta 7/6 de día de sueldo. En la quincena de sueldo
            fijo el descuento es día por día (factor 1), que es como lo
            hace NOI para el personal de oficina.

   La quincena de 16 días (la segunda de los meses de 31) se pide con
   {dias:16}; el factor no cambia porque es una razón, no un conteo.

   OJO: el camino semanal queda idéntico al centavo — dias=7 y 7/6 son
   exactamente los números que ya estaban. El motor sigue calibrado
   contra NOI para obra; lo de oficina es proporcional a esa misma
   fórmula, y hay que validarlo contra un recibo quincenal real de NOI
   antes de darlo por bueno al centavo. */
const PERIODOS={
  SEMANAL  :{cve:'SEMANAL'  ,dias:7 ,lab:6 ,etiqueta:'semanal'  ,unidad:'SEMANA'  ,porAnio:52},
  QUINCENAL:{cve:'QUINCENAL',dias:15,lab:15,etiqueta:'quincenal',unidad:'QUINCENA',porAnio:24}
};
function periodoPago(w){
  return String((w&&w.periodo_pago)||'SEMANAL').toUpperCase()==='QUINCENAL'?'QUINCENAL':'SEMANAL';
}
/* El periodo de un trabajador, opcionalmente con otro número de días
   (quincena de 16, semana partida por alta a media semana, etc.). */
function perDe(w,dias){
  const p=PERIODOS[periodoPago(w)]||PERIODOS.SEMANAL;
  const d=Math.max(1,Math.round(Number(dias)||p.dias));
  return {...p,dias:d,fFalta:p.dias/p.lab};
}
/* FONACOT no usa la fórmula bimestral ni el seguro de daños INFONAVIT.
   La cédula mensual manda; el prorrateo por calendario es una modalidad
   explícita, no una regla legal universal. */
function retFecha(iso){return new Date(String(iso).slice(0,10)+'T12:00:00Z');}
function retISO(fecha){return fecha.toISOString().slice(0,10);}
function retSumarDias(iso,dias){const f=retFecha(iso);f.setUTCDate(f.getUTCDate()+dias);return retISO(f);}
function rangoRetencion(w,semStr){
  const n=parseInt(String(semStr||'').replace(/\D/g,''))||isoWeek();
  const [ini,fin]=semRange(n);
  if(periodoPago(w)!=='QUINCENAL')return [ini,fin];
  const f=retFecha(fin),a=f.getUTCFullYear(),m=f.getUTCMonth(),dia=f.getUTCDate();
  return dia<=15?[`${a}-${String(m+1).padStart(2,'0')}-01`,`${a}-${String(m+1).padStart(2,'0')}-15`]
    :[`${a}-${String(m+1).padStart(2,'0')}-16`,retISO(new Date(Date.UTC(a,m+1,0,12)))];
}
function cuotaFonacotCalendario(mensual,desde,hasta){
  if(!(Number(mensual)>0)||!/^\d{4}-\d\d-\d\d$/.test(String(desde))||!/^\d{4}-\d\d-\d\d$/.test(String(hasta))||desde>hasta)return 0;
  let total=0,fecha=desde,tramos=0;
  while(fecha<=hasta&&tramos++<3){
    const f=retFecha(fecha),diasMes=new Date(Date.UTC(f.getUTCFullYear(),f.getUTCMonth()+1,0,12)).getUTCDate();
    const finMes=retISO(new Date(Date.UTC(f.getUTCFullYear(),f.getUTCMonth()+1,0,12)));
    const finTramo=hasta<finMes?hasta:finMes;
    const diasTramo=Math.round((retFecha(finTramo)-f)/86400000)+1;
    // Cuota mensual / días reales del mes * días del periodo, como NOI.
    // Conservar decimales internos y redondear una sola vez al terminar;
    // no trasladar residuos de otras semanas a una retención independiente.
    total+=Number(mensual)/diasMes*diasTramo;
    fecha=retSumarDias(finTramo,1);
  }
  return redondearCentavos(total);
}
/* Convierte un importe periódico capturado, salvo FONACOT calendario, que
   toma las fechas efectivas y el número real de días de cada mes. */
function montoDescuento(d,P,semStr,w){
  if(String(d?.tipo||'').toUpperCase()==='INFONAVIT'&&d.infonavit_avisos_historial?.length){
    const fecha=semStr&&w?rangoRetencion(w,semStr)[1]:today();
    d=infonavitCreditoAFecha(d,fecha);
  }
  if(semStr&&w&&String(d?.tipo||'').toUpperCase()==='FONACOT'&&d.fonacot_prorrateo==='DIAS_CALENDARIO'&&Number(d.cuota_mensual)>0){
    const [ini,fin]=rangoRetencion(w,semStr);
    if(!d.fonacot_prorrateo_desde||fin>=d.fonacot_prorrateo_desde)
      return cuotaFonacotCalendario(d.cuota_mensual,ini,fin);
  }
  const base=PERIODOS[String((d&&d.periodicidad)||'SEMANAL').toUpperCase()]||PERIODOS.SEMANAL;
  const m=Number(d&&d.monto)||0;
  if(base.dias===P.dias)return Math.round(m*100)/100;
  return Math.round(m*P.dias/base.dias*100)/100;
}

function montoDobleDescuento(d,w,P,semStr){
  const normal=montoDescuento(d,P,semStr,w);
  if(String(d&&d.tipo||'').toUpperCase()==='INFONAVIT'){
    let fecha=fechaFinSemanaISO(semStr);
    if(d.infonavit_avisos_historial?.length){
      const fin=rangoRetencion(w,semStr)[1];
      const cambio=d.infonavit_avisos_historial.some(x=>x.desde<=fin&&['factor','modalidad','monto','periodicidad'].some(k=>String(x.antes?.[k]??'')!==String(x.despues?.[k]??'')));
      if(cambio)fecha=new Date(fin+'T12:00');
    }
    const exacto=retencionInfonavitDesdeAviso(d,w,P.dias*2,fecha);
    if(exacto!=null)return exacto;
  }
  return redondearCentavos(normal*2);
}
function retencionDiasExtra(d,w,desde,dias){
  if(!desde||!(dias>0))return 0;
  const hasta=retSumarDias(desde,dias-1),tipo=String(d.tipo||'').toUpperCase();
  if(tipo==='FONACOT'&&Number(d.cuota_mensual)>0)return cuotaFonacotCalendario(d.cuota_mensual,desde,hasta);
  if(tipo==='INFONAVIT'&&Number(d.factor)>0){
    let suma=0,fecha=desde,restantes=dias;
    while(restantes>0){
      const f=retFecha(fecha),ultimoMes=f.getUTCMonth()-(f.getUTCMonth()%2)+2;
      const fin=retISO(new Date(Date.UTC(f.getUTCFullYear(),ultimoMes,0,12)));
      const siguiente=(d.infonavit_avisos_historial||[]).filter(x=>['factor','modalidad'].some(k=>String(x.antes?.[k]??'')!==String(x.despues?.[k]??''))).map(x=>x.desde).filter(x=>x>fecha).sort()[0];
      let tramo=0;while(tramo<restantes&&retSumarDias(fecha,tramo)<=fin&&(!siguiente||retSumarDias(fecha,tramo)<siguiente))tramo++;
      const exacto=retencionInfonavitDesdeAviso(d,w,tramo,retFecha(fecha));
      if(exacto!=null)suma+=exacto;
      else if(d.infonavit_avisos_historial?.length){const v=infonavitCreditoAFecha(d,fecha),p=PERIODOS[v.periodicidad]||PERIODOS.SEMANAL;suma+=(Number(v.monto)||0)*tramo/p.dias;}
      fecha=retSumarDias(fecha,tramo);restantes-=tramo;
    }
    return redondearCentavos(suma);
  }
  const base=PERIODOS[String(d.periodicidad||'SEMANAL').toUpperCase()]||PERIODOS.SEMANAL;
  return redondearCentavos((Number(d.monto)||0)/base.dias*dias);
}
function retencionEvaluada(d,w,semStr,P){
  let base=montoDescuento(d,P,semStr,w),estado='NORMAL';
  const ex=(d.excepciones||{})[semStr];
  if(ex==='SUSPENDER'){base=0;estado='PAUSADO';}
  else if(ex==='DOBLE'){base=montoDobleDescuento(d,w,P,semStr);estado='DOBLE';}
  const aj=(d.ajustes_semana||{})[semStr]||{};
  if(estado==='PAUSADO')return {monto:0,base:0,extra:0,estado,aj};
  if(aj.importe_base!=null&&aj.importe_base!==''){
    base=redondearCentavos(Number(aj.importe_base)||0);estado='AJUSTADO';
  }
  const extra=aj.dias_extra_desde&&Number(aj.dias_extra)>0
    ?retencionDiasExtra(d,w,aj.dias_extra_desde,Number(aj.dias_extra)):0;
  return {monto:redondearCentavos(base+extra),base,extra,estado,aj};
}
function limiteFonacotPeriodo(w,semStr){
  const [inicio,fin]=rangoRetencion(w,semStr);
  const dias=Math.round((retFecha(fin)-retFecha(inicio))/86400000)+1;
  const sd=Number(w.sd)||0;
  if(!(sd>0))return null;
  const tope=sd<=(Number(FISC().sm)||0)+.005?.10:.20;
  return {monto:redondearCentavos(sd*dias*tope),porcentaje:tope*100,salario:sd*dias};
}
function otrosFonacotPeriodo(w,semStr,excluirId){
  return DESC.filter(x=>x.activo&&x.recurrente&&x.tipo==='FONACOT'&&x.trabajador_id===w.id&&x.id!==excluirId&&descuentoVigenteSemana(x,semStr))
    .reduce((s,x)=>s+retencionAplicadaPeriodo(x,w,semStr,perDe(w)).monto,0);
}
function descuentoVigenteSemana(d,semStr){
  if(!d.recurrente||!d.created_at)return true;
  const num=parseInt(String(semStr||'').replace(/\D/g,''))||0;
  return num>=isoWeek(new Date(d.created_at));
}

/* ---------- DESCUENTOS ---------- */
function descuentoCorrespondePeriodo(d,w,semStr){
  const p=d.ajustes_semana?._periodo_nomina;
  if(!p)return d.recurrente||d.semana===semStr;
  if(!/^\d{4}-\d\d-\d\d$/.test(p.desde||'')||!/^\d{4}-\d\d-\d\d$/.test(p.hasta||'')||p.hasta<p.desde)throw Error('Retención con fechas de periodo inválidas.');
  const rango=rangoRetencion(w,semStr);
  return p.desde===rango[0]&&p.hasta===rango[1];
}
/* Adaptación de entradas: nunca cambia DESC, las fichas o las fórmulas
   protegidas. La sustitución de DESC es síncrona y se restaura con finally. */
function adaptarRetencionPeriodo(d,w,semStr){
  const p=d.ajustes_semana?._periodo_nomina;
  if(p)return {...d,activo:d.activo&&descuentoCorrespondePeriodo(d,w,semStr),semana:semStr};
  const periodos=d.ajustes_semana?._periodos;
  if(!Array.isArray(periodos)||!periodos.length)return d;
  const [desde,hasta]=rangoRetencion(w,semStr),aj=periodos.filter(x=>x.desde===desde&&x.hasta===hasta);
  if(aj.length>1)throw Error('Hay ajustes duplicados para el mismo periodo.');
  if(!aj.length)return d;
  const importe=Number(aj[0].importe_base);
  if(!Number.isFinite(importe)||importe<0)throw Error('Importe NOI por periodo inválido.');
  const prev=d.ajustes_semana[semStr]||{};
  return {...d,ajustes_semana:{...d.ajustes_semana,[semStr]:{importe_base:importe,...prev}}};
}
function retencionAplicadaPeriodo(d,w,semStr,P){
  return retencionEvaluada(adaptarRetencionPeriodo(d,w,semStr),w,semStr,P);
}
function retencionesDePeriodo(w,semStr,opts){
  const original=DESC;
  try{DESC=original.map(d=>d.trabajador_id===w.id?adaptarRetencionPeriodo(d,w,semStr):d);return descuentosDe(w,semStr,opts);}
  finally{DESC=original;}
}
function descuentosDe(w,semStr,opts){
  const P=perDe(w,(opts||{}).dias);
  const ds=DESC.filter(d=>d.trabajador_id===w.id&&d.activo&&(d.recurrente||d.semana===semStr)&&descuentoVigenteSemana(d,semStr));
  let total=0; const parts=[];
  ds.forEach(d=>{
    // Solo el descuento FIJO se lleva al periodo: es una cuota por tiempo.
    // La incidencia ya se capturó como un monto de ESA semana/quincena, con
    // el motor del periodo correcto — volver a prorratearla la duplicaría.
    let m=d.recurrente?montoDescuento(d,P,semStr,w):(Number(d.monto)||0), tag='';
    if(d.recurrente){
      const ev=retencionEvaluada(d,w,semStr,P);m=ev.monto;
      if(ev.estado!=='NORMAL'||ev.extra)tag=` (${ev.estado} ${semStr}${ev.extra?`, ${ev.aj.dias_extra} día(s) adicionales $${money(ev.extra)}`:''})`;
    }
    total+=m;
    parts.push(d.tipo+(d.motivo&&d.motivo!==d.tipo?': '+d.motivo:'')+tag);
  });
  return {total:Math.round(total*100)/100,motivo:parts.join(' | '),ds,periodo:P.cve,dias:P.dias};
}
function openDescuento(trabId,id){
  const w=WORKERS.find(x=>x.id===trabId); if(!w)return;
  const anterior=id?DESC.find(x=>x.id===id&&x.trabajador_id===trabId&&x.obra_id===w.obra_id&&x.recurrente):null;
  if(id&&!anterior){toast('No se encontró esa retención.','err');return;}
  window._DSEDITID=anterior?.id||null;
  const P=perDe(w); window._DSPER=P; window._DSW=w;
  modal(`
    <div class="m-head"><h2>${anterior?'✏️ Editar':'＋ Nueva'} retención · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:14px">Se descuenta <b>en cada nómina</b> hasta que lo desactives (créditos Infonavit, Fonacot, préstamos). Con el botón <b>⏸/×2 Semana</b> de la ficha puedes suspender la retención una semana o retener doble para compensar. Las faltas se capturan con el botón 📉 Incidencias.</p>
      <div class="fhint" style="margin-bottom:10px">Este trabajador cobra <b>${P.etiqueta}</b> (${P.dias} días), así que el monto se captura <b>por ${P.unidad.toLowerCase()}</b>. Si más adelante cambia de periodo, la retención se ajusta sola.</div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Tipo</label><select id="ds-tipo" onchange="dsModalidad()" ${anterior?'disabled':''}><option>INFONAVIT</option><option>FONACOT</option><option>PRESTAMO</option><option>OTRO</option></select></div>
        <div id="ds-mod-wrap"><label>Modalidad del aviso</label>
          <select id="ds-mod" onchange="dsModalidad()">
            <option value="CUOTA_FIJA">CUOTA FIJA (pesos al mes)</option>
            <option value="VSM_UMI">VECES UMA / VSM</option>
            <option value="PORCENTAJE">PORCENTAJE del salario</option>
          </select></div>
      </div>
      <div id="ds-fonacot-wrap" style="margin-top:10px;display:none"><label>Cómo distribuir la cuota FONACOT</label><select id="ds-fonacot-metodo" onchange="dsCalc()"><option value="DIAS_CALENDARIO">Días calendario reales de cada mes (30/31/28/29)</option><option value="IMPORTE_CAPTURADO">Importe fijo capturado por periodo, como NOI</option></select><label style="margin-top:8px">Vigente desde (no recalcula periodos anteriores)</label><input id="ds-fonacot-desde" type="date" value="${today()}"></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">
        <div><label id="ds-lbl-factor">Cuota MENSUAL del aviso ($)</label><input id="ds-mensual" type="number" step="0.0001" min="0" oninput="dsCalc()"></div>
        <div><label>Monto por ${P.unidad} ($) *</label><input id="ds-monto" type="number" step="0.01" min="0"></div>
      </div>
      <div class="fhint" id="ds-hint" style="margin-top:6px">La cuota se calcula de acuerdo con el tipo de crédito y el periodo.</div>
      <div class="fhint" id="ds-inf-hint" style="margin-top:6px;color:var(--navy)">🏠 <b>Modalidad y factor INFONAVIT:</b> cópialos del aviso para permitir el recálculo bimestral.</div>
      <div id="ds-credito-wrap" style="margin-top:12px"><label>No. de crédito INFONAVIT (10 dígitos) *</label><input id="ds-credito" inputmode="numeric" maxlength="10" placeholder="Según aviso de retención"></div>
      <div style="margin-top:10px"><label>Nota del aviso / observaciones</label><input id="ds-motivo" placeholder="Referencia del aviso o comentarios"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="saveDescuento('${trabId}')">💾 ${anterior?'Actualizar':'Guardar'} retención</button>
    </div>`,'md');
  if(anterior){
    $('ds-tipo').value=anterior.tipo;
    $('ds-mod').value=anterior.modalidad||'CUOTA_FIJA';
    $('ds-mensual').value=anterior.factor??anterior.cuota_mensual??'';
    $('ds-fonacot-metodo').value=anterior.fonacot_prorrateo||'IMPORTE_CAPTURADO';
    $('ds-fonacot-desde').value=anterior.fonacot_prorrateo_desde||today();
    $('ds-credito').value=anterior.numero_credito||'';
    $('ds-motivo').value=anterior.motivo||'';
  }
  dsModalidad();
  if(anterior)$('ds-monto').value=anterior.monto;
}
async function saveDescuento(trabId){
  const w=WORKERS.find(x=>x.id===trabId);
  const monto=parseFloat($('ds-monto').value);
  const factor=parseFloat($('ds-mensual').value);
  const tipo=$('ds-tipo').value;
  const editarId=window._DSEDITID;
  const mod=tipo==='INFONAVIT'?(($('ds-mod')||{}).value||'CUOTA_FIJA'):'CUOTA_FIJA';
  const numeroCredito=tipo==='INFONAVIT'?$('ds-credito').value.trim():'';
  if(tipo==='INFONAVIT'&&!/^\d{10}$/.test(numeroCredito)){
    toast('Captura los 10 dígitos del crédito tal como aparecen en el aviso INFONAVIT.','err');return;
  }
  const mensual=factor>0?dsMensualEquivalente(mod,factor,w):0;
  if(mensual>0){const o=$('ds-motivo');if(!/MENSUAL/.test(o.value.toUpperCase()))o.value=(o.value?o.value+' | ':'')+'CUOTA MENSUAL $'+mensual.toFixed(2);}
  if(!monto||monto<=0){toast('Indica el monto del descuento.','err');return;}
  markWrite();
  /* Se guarda:
     · la PERIODICIDAD con la que se capturó el monto (Script 60): sin ese
       dato no se sabe si $346.63 son de una semana o de una quincena.
     · la MODALIDAD y el FACTOR (Script 63): son lo que le permite al cron
       bimestral recalcular esta retención sola. Sin ellos, el crédito se
       queda congelado en la cifra del bimestre en que se capturó. */
   const fila={trabajador_id:trabId,obra_id:w.obra_id,tipo,numero_credito:numeroCredito||null,
     motivo:$('ds-motivo').value.trim().toUpperCase(),monto,recurrente:true,actualizado_por:USER.email,
    periodicidad:periodoPago(w),cuota_mensual:(mensual>0?Math.round(mensual*100)/100:null),
    modalidad:mod,factor:(factor>0?factor:null),
     recalculo_auto:(tipo==='INFONAVIT'&&factor>0),
     fonacot_prorrateo:tipo==='FONACOT' ? $('ds-fonacot-metodo').value : 'IMPORTE_CAPTURADO',
     fonacot_prorrateo_desde:tipo==='FONACOT'&&$('ds-fonacot-metodo').value==='DIAS_CALENDARIO' ? $('ds-fonacot-desde').value : null};
  if(tipo==='FONACOT'&&fila.fonacot_prorrateo==='DIAS_CALENDARIO'&&!(mensual>0)){
    toast('Para prorratear FONACOT captura la cuota mensual de la cédula.','err');return;
  }
  if(tipo==='FONACOT'&&fila.fonacot_prorrateo==='DIAS_CALENDARIO'&&!/^\d{4}-\d\d-\d\d$/.test(fila.fonacot_prorrateo_desde||'')){
    toast('Indica la fecha de inicio del prorrateo FONACOT.','err');return;
  }
  if(tipo==='FONACOT'){
    const sem='S'+isoWeek(),tope=limiteFonacotPeriodo(w,sem);
    const previsto=montoDescuento(fila,perDe(w),sem,w);
    if(tope&&previsto+otrosFonacotPeriodo(w,sem,editarId)>tope.monto+.005){
      toast(`FONACOT excedería el límite conjunto del ${tope.porcentaje}% del salario de este periodo ($${money(tope.monto)}). Revisa cédula/NOI.`, 'err');return;
    }
  }
  if(!editarId)fila.creado_por=USER.email;
  let {error}=editarId
    ?await sb.from('descuentos').update(fila).eq('id',editarId).eq('trabajador_id',trabId).eq('obra_id',w.obra_id)
    :await sb.from('descuentos').insert(fila);
  if(error&&/modalidad|factor|recalculo_auto/i.test(error.message||'')&&/column|does not exist|schema cache|could not find/i.test(error.message||'')){
    // sin el Script 63 se guarda igual, pero este crédito no se recalculará solo
    const f2={...fila}; delete f2.modalidad; delete f2.factor; delete f2.recalculo_auto;
    if(!editarId)({error}=await sb.from('descuentos').insert(f2));
    if(!error)toast('Guardado, pero SIN recálculo automático: falta correr el Script 63 en Supabase.','err');
  }
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast(editarId?'Retención actualizada y auditada.':'Retención registrada: se aplicará en cada proyección.','ok');
  await loadObraData(OBRA.id);
}
function openCreditoNumero(id){
  const d=DESC.find(x=>x.id===id&&x.obra_id===OBRA.id&&String(x.tipo).toUpperCase()==='INFONAVIT');
  if(!d){toast('No se encontró el crédito INFONAVIT de este centro.','err');return;}
  const w=WORKERS.find(x=>x.id===d.trabajador_id);
  modal(`<div class="m-head"><h2>🏠 Cotejar número de crédito</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body"><p><b>${esc(w?fullName(w):'Trabajador')}</b> · descuento ${esc(d.modalidad||'CUOTA_FIJA')} · $${money(d.monto)} por ${esc(d.periodicidad||'periodo')}.</p>
    <p class="fhint" style="margin:8px 0">Consulta el <b>Aviso de Retención de Descuentos</b> vigente y captura sus 10 dígitos. Cambiar este dato no modifica el factor ni el importe de la retención.</p>
    <label>No. de crédito INFONAVIT</label><input id="cn-numero" inputmode="numeric" maxlength="10" value="${esc(numeroCreditoInfonavit(d))}" placeholder="10 dígitos del aviso"></div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn dark" onclick="guardarCreditoNumero('${id}')">Guardar número</button></div>`,'md');
}
async function guardarCreditoNumero(id){
  const numero=$('cn-numero').value.trim();
  if(!/^\d{10}$/.test(numero)){toast('El número de crédito INFONAVIT debe tener exactamente 10 dígitos.','err');return;}
  markWrite();
  const {error}=await sb.from('descuentos').update({numero_credito:numero,actualizado_por:USER.email}).eq('id',id).eq('obra_id',OBRA.id).eq('tipo','INFONAVIT');
  if(error){toast('No se pudo guardar: '+error.message,'err');return;}
  await loadObraData(OBRA.id);
  const d=DESC.find(x=>x.id===id);if(d)openDetail(d.trabajador_id);
  toast('Número de crédito guardado; coteja el factor y monto con el aviso.','ok');
}
async function toggleDescuento(id,estado){
  if(!confirm(estado?'¿Reactivar este descuento?':'¿Desactivar este descuento? Dejará de aplicarse en las proyecciones (queda en el historial).'))return;
  markWrite();
  const {error}=await sb.from('descuentos').update({activo:estado}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast(estado?'Descuento reactivado.':'Descuento desactivado.','ok');
  await loadObraData(OBRA.id);
}

/* ---------- INCIDENCIAS DE LA SEMANA ---------- */
function openIncidencias(){
  if(!OBRA){toast('Selecciona un centro de trabajo.','err');return;}
  window._INCSEM=semObra();window._INCTAB='aplicadas';
  modal(`
    <div class="m-head"><h2>📉 Incidencias de la semana · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <style>.inc-modulo [hidden]{display:none!important}.inc-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px}.inc-tabs [aria-selected="true"]{background:var(--navy);border-color:var(--navy);color:#fff}.inc-aplicada{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:8px 14px;padding:14px;border:1px solid var(--border);border-radius:9px;margin:8px 0;background:var(--card)}.inc-aplicada .inc-detalle{grid-column:2/-1;color:var(--mut);font-size:12px;line-height:1.6;overflow-wrap:anywhere}.inc-aplicada b{overflow-wrap:anywhere}.inc-lista{max-height:420px;overflow:auto}.inc-captura-scroll{overflow-x:auto}.inc-captura-scroll .imp-row{min-width:850px}@media(max-width:600px){.inc-aplicada{grid-template-columns:42px minmax(0,1fr)}.inc-aplicada .inc-importe{grid-column:2}.inc-tabs .btn{flex:1}}</style>
      <div class="inc-modulo">
      <div class="grid" style="grid-template-columns:160px 1fr;align-items:end;margin-bottom:12px">
        <div><label for="inc-sem">No. de semana</label><input id="inc-sem" type="number" min="1" step="1" value="${semObra()}" onchange="incCambioSemana()"></div>
        <div class="fhint">${esc(OBRA.nombre)} · Las dos secciones corresponden a la semana seleccionada.</div>
      </div>
      <div class="inc-tabs" role="tablist" aria-label="Incidencias de la semana">
        <button class="btn" role="tab" id="inc-tab-aplicadas" aria-controls="inc-panel-aplicadas" onclick="incMostrar('aplicadas')">Aplicadas <span id="inc-total"></span></button>
        <button class="btn" role="tab" id="inc-tab-captura" aria-controls="inc-panel-captura" onclick="incMostrar('captura')">Capturar incidencias</button>
      </div>
      <section id="inc-panel-aplicadas" role="tabpanel" aria-labelledby="inc-tab-aplicadas">
        <h3 style="margin-bottom:8px">Faltas e incidencias ya aplicadas</h3>
        <p class="fhint" style="margin-bottom:12px">Ordenadas por número de trabajador. Aquí sólo aparecen descuentos activos de esta semana; los créditos recurrentes se consultan en retenciones.</p>
        <label for="inc-ya-q">Buscar en aplicadas</label><input id="inc-ya-q" placeholder="Número, nombre, contratista o motivo…" oninput="incExistentes()">
        <div id="inc-exist" class="inc-lista" aria-live="polite"></div>
      </section>
      <section id="inc-panel-captura" role="tabpanel" aria-labelledby="inc-tab-captura" hidden>
      <h3 style="margin-bottom:8px">Aplicar nuevas incidencias</h3>
      <label for="inc-q">Buscar para capturar</label><input id="inc-q" placeholder="Escribe nombre, no. o contratista…" oninput="incFiltra()" style="margin-bottom:12px">
      <p style="color:var(--mut);font-size:12px;margin-bottom:8px">Distingue <b>faltas injustificadas</b> de <b>días de incapacidad que no paga la empresa</b>. Una falta semanal afecta el descanso proporcional; esos días de incapacidad no. Si un certificado cubre 7 días y la empresa paga 3, captura <b>4</b> en la columna IMSS; registra aparte los 7 días, fechas y folio del certificado en Incidentes e incapacidades. Si hay premios u otros conceptos especiales, contrasta el resultado con NOI.</p>
      <div class="inc-captura-scroll">
      <div class="imp-row head" style="grid-template-columns:2fr .5fr .55fr .65fr .6fr .8fr 1.5fr"><span>Trabajador</span><span>SD</span><span>Faltas</span><span>Días IMSS sin sueldo</span><span>Premio $</span><span>Descuento $</span><span>Motivo</span></div>
      <div id="inc-nores" style="display:none;color:var(--mut);padding:14px;text-align:center;font-size:12.5px">Ningún trabajador coincide con la búsqueda.</div>
      <div id="inc-rows" style="max-height:380px;overflow:auto"></div>
      </div></section></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" id="inc-save" onclick="saveIncidencias()" ${puedeEditarTrabajador()?'':'disabled'}>💾 Guardar incidencias</button>
    </div>`,'lg');
  incExistentes();incRenderRows();incMostrar('aplicadas');
}
function incMostrar(tab){
  tab=tab==='captura'?'captura':'aplicadas';window._INCTAB=tab;
  ['aplicadas','captura'].forEach(t=>{$('inc-panel-'+t).hidden=t!==tab;$('inc-tab-'+t).setAttribute('aria-selected',String(t===tab));});
  $('inc-save').style.display=tab==='captura'?'':'none';
}
function incCambioSemana(){
  const n=Number($('inc-sem').value);
  if(!Number.isInteger(n)||n<1){$('inc-sem').value=window._INCSEM;toast('Indica una semana entera mayor que cero.','err');return;}
  if(n===window._INCSEM)return;
  const capturado=[...$('inc-rows').querySelectorAll('input')].some(el=>el.value.trim()!=='');
  if(capturado&&!confirm('Hay incidencias capturadas sin guardar. ¿Descartarlas y cambiar de semana?')){$('inc-sem').value=window._INCSEM;return;}
  window._INCSEM=n;incExistentes();incRenderRows();
}
function incRenderRows(){
  const n=Number($('inc-sem')?.value)||semObra(),[d1,d2]=semRange(n);
  const act=asActivosSemana(d1,d2).slice().sort(compararNumeroTrabajador);
  window._INC=act;
  $('inc-rows').innerHTML=act.map((w,i)=>`<div class="imp-row inc-row" data-buscar="${esc((fullName(w)+' '+(w.contratista||'')+' '+(w.no_trab||'')).toUpperCase())}" style="grid-template-columns:2fr .5fr .55fr .65fr .6fr .8fr 1.5fr">
        <span><b>#${esc(w.no_trab??'—')} · ${esc(fullName(w))}</b><br><span style="color:var(--mut);font-size:11px">${esc(w.contratista)}</span></span>
        <span>$${money(w.sd)}</span>
        <input id="inc-f-${i}" type="number" min="0" step="1" placeholder="0" oninput="incCalc(${i})">
        <input id="inc-i-${i}" type="number" min="0" step="1" placeholder="0" title="Días del periodo cubiertos por incapacidad IMSS que NO paga la empresa; no son necesariamente todos los días del certificado" oninput="incCalc(${i})">
        <input id="inc-p-${i}" type="number" min="0" step="0.01" placeholder="0.00" title="Premio de puntualidad/asistencia de la semana (se ANULA si hay faltas)" oninput="incCalc(${i})">
        <input id="inc-m-${i}" type="number" min="0" step="0.01" placeholder="0.00">
        <input id="inc-x-${i}" placeholder="FALTA, RETARDO, DAÑO...">
      </div>`).join('');
  if($('inc-nores'))$('inc-nores').style.display=act.length?'none':'block';
  incFiltra();
  if(!puedeEditarTrabajador())$('inc-rows').querySelectorAll('input').forEach(el=>el.disabled=true);
}
function incFiltra(){
  const q=incTextoBusqueda($('inc-q').value);
  let visibles=0;
  $('inc-rows').querySelectorAll('.inc-row').forEach(r=>{
    const ok=!q||incTextoBusqueda(r.getAttribute('data-buscar')).includes(q);
    r.style.display=ok?'':'none'; if(ok)visibles++;
  });
  if($('inc-nores'))$('inc-nores').style.display=visibles?'none':'block';
}
function incCalc(i){
  const w=window._INC[i];
  const f=Number($('inc-f-'+i).value)||0;
  const incap=Number($('inc-i-'+i).value)||0;
  const premio=parseFloat(($('inc-p-'+i)||{}).value)||0;
  const P=perDe(w);
  if(!Number.isInteger(f)||!Number.isInteger(incap)||f<0||incap<0||f+incap>P.dias){
    $('inc-m-'+i).value='';$('inc-x-'+i).value='';
    toast(`Las ausencias de ${fullName(w)} deben sumar entre 0 y ${P.dias} días.`,'err');return;
  }
  if(f>0||incap>0){
    const r=descuentoFaltasNOI(w,f,premio,undefined,incap);
    $('inc-m-'+i).value=r.monto.toFixed(2);
    $('inc-x-'+i).value=[f?(f===1?'1 FALTA':f+' FALTAS'):'',incap?`${incap} DÍA(S) SIN SALARIO PATRONAL POR INCAPACIDAD IMSS`:'' ].filter(Boolean).join(' + ')
      +` · NETO NOI −$${r.monto.toFixed(2)} (BRUTO −${r.dBruto.toFixed(2)}, ISR ${r.dIsr>=0?'−':'+'}${Math.abs(r.dIsr).toFixed(2)}, IMSS −${r.dImss.toFixed(2)}${r.conFaltas.premioAnulado?`, PREMIO ANULADO −${premio.toFixed(2)}`:''})`;
  }else if(premio>0){
    $('inc-m-'+i).value='';$('inc-x-'+i).value='';
  }else{
    // Al retirar una ausencia, no conservar un descuento calculado antes.
    $('inc-m-'+i).value='';$('inc-x-'+i).value='';
  }
}
function incTextoBusqueda(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();}
function incExistentes(){
  const sem='S'+(Number($('inc-sem').value)||window._INCSEM),q=incTextoBusqueda($('inc-ya-q')?.value);
  const mapa=new Map(WORKERS.filter(w=>w.obra_id===OBRA.id).map(w=>[w.id,w]));
  const ya=DESC.filter(d=>!d.recurrente&&d.activo&&d.semana===sem&&(d.obra_id===OBRA.id||(!d.obra_id&&mapa.has(d.trabajador_id))))
    .map(d=>({d,w:mapa.get(d.trabajador_id)})).sort((a,b)=>compararNumeroTrabajador(a.w||{},b.w||{})||String(a.d.created_at||'').localeCompare(String(b.d.created_at||''))||String(a.d.id).localeCompare(String(b.d.id)));
  $('inc-total').textContent=`(${ya.length})`;
  const visibles=ya.filter(({d,w})=>!q||incTextoBusqueda(`${w?.no_trab??''} ${w?fullName(w):d.trabajador_id} ${w?.contratista||''} ${d.motivo||''} ${d.tipo||''}`).includes(q));
  $('inc-exist').innerHTML=visibles.map(({d,w})=>`<article class="inc-aplicada" data-inc-id="${esc(d.id)}">
    <b>#${esc(w?.no_trab??'—')}</b><div><b>${w?esc(fullName(w)):'Trabajador no disponible en la lista'}</b><div class="fhint">${esc(w?.contratista||'Sin contratista disponible')} · ${esc(d.tipo)} · ${esc(sem)}</div></div>
    <div class="inc-importe"><b>$${money(d.monto)}</b> ${puedeEditarTrabajador()?`<button class="btn danger" onclick="incQuitar('${esc(d.id)}')">Quitar</button>`:''}</div>
    <div class="inc-detalle">${esc(d.motivo||d.tipo)}${!w?` · ID: ${esc(d.trabajador_id)}`:''}</div></article>`).join('')||`<div class="empty">${ya.length?'Ninguna incidencia aplicada coincide con la búsqueda.':'No hay faltas ni incidencias activas aplicadas en '+esc(sem)+'.'}</div>`;
}
async function incQuitar(id){
  if(!puedeEditarTrabajador()){toast('Tu usuario sólo puede consultar.','err');return;}
  const sem='S'+(Number($('inc-sem')?.value)||window._INCSEM),obraId=OBRA.id;
  const d=DESC.find(x=>x.id===id&&x.activo&&!x.recurrente&&x.semana===sem&&x.obra_id===obraId);if(!d)return;
  if(window._INCQUITANDO)return;
  if(!confirm('¿Desactivar esta incidencia de '+sem+'? Dejará de aplicarse; se conserva en el historial.'))return;
  window._INCQUITANDO=true;markWrite();
  try{
    const {data,error}=await sb.from('descuentos').update({activo:false}).eq('id',id).eq('obra_id',obraId).eq('semana',sem).eq('recurrente',false).eq('activo',true).select('id');
    if(error)throw error;if(data?.length!==1)throw new Error('No se confirmó la desactivación. Actualiza y verifica tus permisos.');
    d.activo=false;
    if(OBRA?.id===obraId){renderTable();if($('inc-exist'))incExistentes();}
    toast('Incidencia desactivada; se conserva en el historial.','ok');
  }catch(e){toast('No se quitó: '+e.message,'err');}finally{window._INCQUITANDO=false;}
}
async function saveIncidencias(){
  if(!puedeEditarTrabajador()){toast('Tu usuario sólo puede consultar.','err');return;}
  if($('inc-save')?.disabled)return;
  const sem='S'+($('inc-sem').value||isoWeek());
  const inserts=[];let invalid='';
  window._INC.forEach((w,i)=>{
    const m=parseFloat($('inc-m-'+i).value);
    const f=Number($('inc-f-'+i).value)||0,incap=Number($('inc-i-'+i).value)||0;
    if(!Number.isInteger(f)||!Number.isInteger(incap)||f<0||incap<0||f+incap>perDe(w).dias){invalid=`Revisa los días de ${fullName(w)}.`;return;}
    if(m>0){
      const raw=($('inc-x-'+i).value.trim()||'INCIDENCIA').toUpperCase();
      const mot=f>0&&!/(\d+(?:[.,]\d+)?)\s*FALTA/i.test(raw)?`${f} FALTAS · ${raw}`:raw;
      // El catálogo SQL de descuentos conserva FALTA/INCIDENCIA. La clase IMSS
      // queda explícita en el motivo y no se cuenta como falta para aguinaldo.
      inserts.push({trabajador_id:w.id,obra_id:w.obra_id,tipo:f>0?'FALTA':incap>0?'INCIDENCIA':raw.includes('FALTA')?'FALTA':'INCIDENCIA',
        motivo:mot,monto:m,recurrente:false,semana:sem,creado_por:USER.email,
        periodicidad:periodoPago(w)});   // deja constancia de con qué periodo se calculó
    }
  });
  if(invalid){toast(invalid,'err');return;}
  if(!inserts.length){toast('No capturaste ningún descuento (todas las filas en 0).','err');return;}
  if(!confirm(`¿Guardar ${inserts.length} descuento(s) de la semana ${sem}? Se aplicarán en la proyección de esa semana.`))return;
  markWrite();
  const {error}=await sb.from('descuentos').insert(inserts);
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast(`${inserts.length} incidencia(s) guardadas para ${sem}.`,'ok');
  await loadObraData(OBRA.id);
}

/* ---------- v29: CALENDARIO DE RETENCIONES (petición de contabilidad) ----------
   Registro semanal de TODO lo que se le retiene a cada trabajador y por qué:
   descuentos fijos (Infonavit/Fonacot/préstamos) con su estado de esa semana
   (NORMAL / ⏸ PAUSADO / ×2 DOBLE, que salen de las excepciones semanales ya
   existentes) + incidencias de la semana (faltas, daños, etc.). Se alimenta de
   las MISMAS tablas que usa la proyección — no hay doble captura ni datos
   duplicados: lo que ves aquí es exactamente lo que va a descontar la
   proyección de esa semana. */
function retFilasDe(semStr){
  const semN=parseInt(String(semStr).replace(/\D/g,''))||0;
  const [d1,d2]=semRange(semN),sinServicio=asSinServicioSemana(d1);
  const filas=[];
  DESC.filter(d=>d.activo).forEach(d=>{
    const w=WORKERS.find(x=>x.id===d.trabajador_id);
    if(!w||!asVigenteSemana(w,d1,d2)||sinServicio.has(w.id))return;
    // el monto se lleva al periodo del trabajador: el mismo crédito retiene
    // el doble en una quincena de oficina que en una semana de obra.
    const P=perDe(w);
    if(d.recurrente){
      // el fijo cuenta desde la semana en que se capturó (si el registro trae fecha)
      if(!descuentoVigenteSemana(d,semStr))return;
      const ev=retencionAplicadaPeriodo(d,w,semStr,P);
      filas.push({w,d,origen:'FIJO',estado:ev.estado,monto:ev.monto,extra:ev.extra,periodo:P.cve});
    }else if(descuentoCorrespondePeriodo(d,w,semStr)){
      // una incidencia (faltas de ESA semana/quincena) ya viene calculada
      // con el motor del periodo correcto: no se vuelve a prorratear.
      filas.push({w,d,origen:'INCIDENCIA',estado:'—',monto:Number(d.monto)||0,periodo:P.cve});
    }
  });
  filas.sort((a,b)=>((a.w.no_trab||9e9)-(b.w.no_trab||9e9))||(a.origen>b.origen?1:-1));
  return filas;
}
function openCalendarioRet(){
  const [d1,d2]=weekBounds();
  modal(`
    <div class="m-head"><h2>📅 Calendario de retenciones · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px">Registro semanal de <b>cuánto se le retiene a cada trabajador y por qué</b>. Sale de los mismos descuentos fijos e incidencias que usa la proyección: lo que ves aquí es lo que la proyección de esa semana va a descontar. Los fijos muestran su estado de la semana: <b>NORMAL</b>, <b>⏸ PAUSADO</b> (no se retiene) o <b>×2 DOBLE</b> (se compensa una semana pausada).</p>
      <div class="grid" style="grid-template-columns:120px 1fr 1fr auto auto;align-items:end;gap:10px">
        <div><label>Semana</label><input id="cr-sem" type="number" value="${isoWeek()}" oninput="semSincroniza('cr-sem','cr-d1','cr-d2',renderCalRet)"></div>
        <div><label>Del día</label><input id="cr-d1" type="date" value="${d1}" disabled></div>
        <div><label>Al día</label><input id="cr-d2" type="date" value="${d2}" disabled></div>
        <button class="btn" onclick="crNav(-1)" title="Semana anterior">‹</button>
        <button class="btn" onclick="crNav(1)" title="Semana siguiente">›</button>
      </div>
      <div id="cr-recalc" style="margin-top:2px;margin-bottom:10px">${recalcBadge()}</div>
      <div id="cr-strip" style="margin-top:12px"></div>
      <div id="cr-body" style="margin-top:12px"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark" onclick="exportCalendarioRet()">⬇ Exportar registro de la semana (Excel)</button>
    </div>`,'lg');
  renderCalRet();
  // si todavía no se había consultado, se pinta cuando llegue
  if(RECALCINF===undefined)cargarRecalcInfonavit().then(()=>{const e=$('cr-recalc');if(e)e.innerHTML=recalcBadge();});
}
function crNav(delta){
  $('cr-sem').value=(parseInt($('cr-sem').value)||isoWeek())+delta;
  semSincroniza('cr-sem','cr-d1','cr-d2',renderCalRet);
}
function renderCalRet(){
  const semN=parseInt($('cr-sem').value)||isoWeek(), sem='S'+semN;
  // tira de 12 semanas: total retenido por semana, clic para saltar
  const semanas=[];for(let i=11;i>=0;i--)semanas.push(semN-i);
  const tot=semanas.map(n=>retFilasDe('S'+n).filter(f=>f.w.estatus==='ACTIVO').reduce((s,f)=>s+f.monto,0));
  const maxT=Math.max(...tot,1);
  $('cr-strip').innerHTML=`<div style="display:flex;gap:4px;align-items:flex-end;height:64px">
    ${semanas.map((n,i)=>`<div onclick="$('cr-sem').value=${n};semSincroniza('cr-sem','cr-d1','cr-d2',renderCalRet)" title="S${n}: $${money(tot[i])}" style="flex:1;cursor:pointer;text-align:center">
      <div style="background:${n===semN?'var(--gold)':'var(--navy)'};opacity:${n===semN?1:.55};border-radius:4px 4px 0 0;height:${Math.max(4,Math.round(tot[i]/maxT*44))}px"></div>
      <div style="font-size:10px;color:${n===semN?'var(--navy)':'var(--mut)'};font-weight:${n===semN?800:400}">S${n}</div>
    </div>`).join('')}
  </div>`;
  const filas=retFilasDe(sem);
  if(!filas.length){$('cr-body').innerHTML=`<div style="color:var(--mut);padding:30px;text-align:center">Sin retenciones registradas para la semana ${semN}.</div>`;return;}
  const act=filas.filter(f=>f.w.estatus==='ACTIVO');
  const tTot=act.reduce((s,f)=>s+f.monto,0);
  const nFij=act.filter(f=>f.origen==='FIJO').length, nPau=act.filter(f=>f.estado==='PAUSADO').length,
        nDob=act.filter(f=>f.estado==='DOBLE').length, nInc=act.filter(f=>f.origen==='INCIDENCIA').length;
  const tag=e=>e==='AJUSTADO'?'<span style="background:var(--amber-bg);color:var(--amber);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">✏️ AJUSTADO</span>'
            :e==='PAUSADO'?'<span style="background:var(--amber-bg);color:var(--amber);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">⏸ PAUSADO</span>'
           :e==='DOBLE'?'<span style="background:var(--red-bg);color:var(--red);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">×2 DOBLE</span>'
           :e==='NORMAL'?'<span style="background:var(--green-bg);color:var(--green);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">NORMAL</span>':'—';
  $('cr-body').innerHTML=`
    <div class="stats" style="margin-bottom:10px">
      <div class="stat b"><div class="n">$${money(tTot)}</div><div class="l">Total a retener S${semN}</div></div>
      <div class="stat"><div class="n">${[...new Set(act.map(f=>f.w.id))].length}</div><div class="l">Trabajadores con retención</div></div>
      <div class="stat g"><div class="n">${nFij-nPau-nDob}</div><div class="l">Fijos normales</div></div>
      <div class="stat a"><div class="n">${nPau}</div><div class="l">Fijos pausados ⏸</div></div>
      <div class="stat r"><div class="n">${nDob}</div><div class="l">Fijos dobles ×2</div></div>
      <div class="stat"><div class="n">${nInc}</div><div class="l">Incidencias</div></div>
    </div>
    <div class="imp-row head" style="grid-template-columns:.5fr 2fr .9fr .8fr .8fr .7fr 2fr .6fr"><span>No.</span><span>Trabajador</span><span>Tipo</span><span>Origen</span><span>Estado</span><span>Monto</span><span>Motivo</span><span></span></div>
    <div style="max-height:330px;overflow:auto">
    ${filas.map(f=>`<div class="imp-row" style="grid-template-columns:.5fr 2fr .9fr .8fr .8fr .7fr 2fr .6fr;${f.w.estatus!=='ACTIVO'?'opacity:.55':''}">
      <span>${f.w.no_trab??''}</span>
      <span><b>${esc(fullName(f.w))}</b>${f.w.estatus!=='ACTIVO'?` <span style="color:var(--red);font-size:10.5px">(${esc(f.w.estatus)} — no entra en proyección)</span>`:''}<br><span style="color:var(--mut);font-size:11px">${esc(f.w.contratista||'')}</span></span>
      <span>${esc(f.d.tipo)}</span>
      <span>${f.origen==='FIJO'?'🔁 Fijo':'📉 Incidencia'}</span>
      <span>${tag(f.estado)}</span>
      <span style="font-weight:700;${f.monto===0?'color:var(--mut)':''}">$${money(f.monto)}</span>
      <span style="font-size:11.5px">${esc(f.d.motivo||f.d.tipo)}${f.extra?` · <b>+${money(f.extra)} por días previos</b>`:''}</span>
      <span>${f.origen==='FIJO'?`<button class="btn" style="padding:2px 8px;font-size:10.5px" onclick="openAjusteRetencion('${f.d.id}',${semN})">✏️ Ajustar</button>`:''}</span>
    </div>`).join('')}
    </div>`;
}
function exportCalendarioRet(){
  const semN=parseInt($('cr-sem').value)||isoWeek(), sem='S'+semN;
  const filas=retFilasDe(sem);
  if(!filas.length){toast('No hay retenciones en esa semana.','err');return;}
  const rows=[],styles=[];
  rows.push([`REGISTRO DE RETENCIONES — SEMANA ${semN} (${fmtD($('cr-d1').value)} – ${fmtD($('cr-d2').value)}) — ${OBRA.nombre}`]); styles.push(ST.title);
  rows.push(['NO.','TRABAJADOR','CONTRATISTA','ESTATUS','TIPO','ORIGEN','ESTADO DE LA SEMANA','MONTO RETENIDO','MOTIVO / NO. DE CRÉDITO']); styles.push(ST.head);
  let t=0;
  filas.forEach(f=>{
    if(f.w.estatus==='ACTIVO')t+=f.monto;
    rows.push([f.w.no_trab??'',fullName(f.w),f.w.contratista||'',f.w.estatus,f.d.tipo,f.origen,
       f.estado==='PAUSADO'?'PAUSADO (no se retiene)':f.estado==='DOBLE'?'DOBLE (compensación)':f.estado==='AJUSTADO'?'AJUSTADO':f.estado==='NORMAL'?'NORMAL':'—',
       f.monto,(f.d.motivo||f.d.tipo)+(f.extra?` · DÍAS ADICIONALES $${money(f.extra)}`:'')]);
    styles.push([ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.money,ST.cell]);
  });
  rows.push(['TOTAL A RETENER (SOLO ACTIVOS)','','','','','','',t,'']);
  styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,buildSheet(rows,styles,[7,34,16,11,12,12,20,14,42],[{s:{r:0,c:0},e:{r:0,c:8}}],[{hpt:26},{hpt:24}]),`RETENCIONES S${semN}`);
  dl(wb,`REGISTRO_RETENCIONES_SEMANA${semN}.xlsx`);
  toast(`Registro de retenciones S${semN} exportado.`,'ok');
}
/* hoja de desglose de retenciones para anexar a las proyecciones */
function buildRetDetalleWS(act,sem,colB){
  const ids=new Set(act.map(w=>w.id));
  const filas=retFilasDe(sem).filter(f=>ids.has(f.w.id));
  if(!filas.length)return null;
  const bVal=w=>{if(colB!=='OBRA')return w.contratista||'';const o=OBRAS.find(x=>x.id===w.obra_id);return o?o.nombre.replace(/^OBRA /,''):'';};
  const rows=[],styles=[];
  rows.push([`DESGLOSE DE RETENCIONES — SEMANA ${String(sem).replace('S','')} — A QUIÉN Y POR QUÉ`]); styles.push(ST.title);
  rows.push(['NO.','TRABAJADOR',colB==='OBRA'?'OBRA':'CONTRATISTA','TIPO','ORIGEN','ESTADO DE LA SEMANA','MONTO RETENIDO','MOTIVO / NO. DE CRÉDITO']); styles.push(ST.head);
  let t=0;
  filas.forEach(f=>{t+=f.monto;
    rows.push([f.w.no_trab??'',fullName(f.w),bVal(f.w),f.d.tipo,f.origen,
       f.estado==='PAUSADO'?'PAUSADO (no se retiene)':f.estado==='DOBLE'?'DOBLE (compensación)':f.estado==='AJUSTADO'?'AJUSTADO':f.estado==='NORMAL'?'NORMAL':'—',
       f.monto,(f.d.motivo||f.d.tipo)+(f.extra?` · DÍAS ADICIONALES $${money(f.extra)}`:'')]);
    styles.push([ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.money,ST.cell]);
  });
  rows.push(['TOTAL RETENCIONES','','','','','',t,'']);
  styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total]);
  return buildSheet(rows,styles,[7,34,16,12,12,20,14,42],[{s:{r:0,c:0},e:{r:0,c:7}}],[{hpt:26},{hpt:24}]);
}

