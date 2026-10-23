/* ---------- CALCULADORA DE PRESTACIONES (LFT) ---------- */
function diasVacaciones(anios){if(anios<1)return 0;if(anios<=5)return 12+2*(anios-1);return 22+2*Math.floor((anios-6)/5);}
/* Días de falta injustificada que no devengaron aguinaldo en el año del
   finiquito. Solo cuenta incidencias FALTA activas, no recurrentes y ocurridas
   entre el inicio de antigüedad (o 1 de enero) y la fecha de cálculo. La semana
   de la obra es la fuente principal; created_at queda como respaldo para datos
   antiguos sin semana. */
function faltasAguinaldo(w,fechaCalculo){
  const fin=fechaCalculo instanceof Date?new Date(fechaCalculo):new Date(String(fechaCalculo).slice(0,10)+'T12:00');
  if(isNaN(fin)||!w||!iniAntig(w))return 0;
  const ini=new Date(iniAntig(w)+'T12:00'), enero=new Date(fin.getFullYear(),0,1,12);
  const corte=ini>enero?ini:enero;
  return (typeof DESC!=='undefined'?DESC:[]).reduce((total,d)=>{
    if(d.trabajador_id!==w.id||d.activo===false||d.recurrente||String(d.tipo||'').toUpperCase()!=='FALTA')return total;
    let desde=null,hasta=null;
    const sem=parseInt(String(d.semana||'').replace(/\D/g,''));
    if(sem>0&&typeof semRange==='function'){
      const r=semRange(sem);desde=new Date(r[0]+'T12:00');hasta=new Date(r[1]+'T12:00');
    }else if(d.created_at){
      desde=hasta=new Date(String(d.created_at).slice(0,10)+'T12:00');
    }
    if(!desde||isNaN(desde)||hasta<corte||desde>fin)return total;
    const m=String(d.motivo||'').match(/(\d+(?:[.,]\d+)?)\s*FALTA/i);
    const dias=m?Number(m[1].replace(',','.')):1;
    return total+Math.max(0,Math.round(dias||0));
  },0);
}
function creditoInfonavitActivo(w,fecha){
  const d=(typeof DESC!=='undefined'?DESC:[]).find(d=>d.trabajador_id===w.id&&d.activo===true&&d.recurrente===true&&String(d.tipo||'').toUpperCase()==='INFONAVIT')||null;
  return d?.infonavit_avisos_historial?.length?infonavitCreditoAFecha(d,fecha||today()):d;
}
function numeroCreditoInfonavit(d){
  if(!d)return '';
  const estructurado=String(d.numero_credito||'').trim();
  if(/^\d{10}$/.test(estructurado))return estructurado;
  return String(d.motivo||'').match(/(?:^|\D)(\d{10})(?!\d)/)?.[1]||'';
}
async function prCargarAjusteNoi(id,estado){
  try{
    const w=WORKERS.find(x=>x.id===id);if(!w)return;
    const {data,error}=await sb.from('historial').select('datos_despues')
      .eq('obra_id',w.obra_id).eq('trabajador_id',id).eq('accion','AJUSTE_FINIQUITO_NOI')
      .order('fecha',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle();
    if(globalThis._PR_NOI_AJUSTE!==estado||!$('pr-out'))return;
    if(error)throw Error(error.message);
    estado.estado='LISTO';estado.datos=data&&data.datos_despues||null;
    const a=estado.datos;
    if(a&&a.version==='AJUSTE_NOI_CONCEPTOS_V1'&&w.estatus==='BAJA'&&a.periodo===w.fecha_baja
      &&$('pr-fecha'))$('pr-fecha').value=a.periodo;
    calcPrestaciones(id);
  }catch(e){
    if(globalThis._PR_NOI_AJUSTE!==estado||!$('pr-out'))return;
    estado.estado='ERROR';estado.error=e.message;calcPrestaciones(id);
  }
}
function prAjusteNoiAplicable(w,fecha){
  const a=globalThis._PR_NOI_AJUSTE;
  if(!a||a.trabajador_id!==w.id||a.estado!=='LISTO')return null;
  const r=a.datos,v=r&&r.validacion_noi;
  if(!r||r.version!=='AJUSTE_NOI_CONCEPTOS_V1'||!v||r.periodo!==fecha
    ||v.fecha_antiguedad!==iniAntig(w)||Number(v.sd)!==Number(w.sd))return null;
  return v;
}
function openPrestaciones(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  globalThis._PR_REVISION_ENTRADAS=null;
  const estadoNoi={trabajador_id:id,estado:'CARGANDO'};
  globalThis._PR_NOI_AJUSTE=estadoNoi;
  const infoDesc=creditoInfonavitActivo(w);
  const numeroCredito=numeroCreditoInfonavit(infoDesc);
  modal(`
    <div class="m-head"><h2>🧮 Prestaciones de ley · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr">
        <div><label>Fecha de cálculo / baja</label><input id="pr-fecha" type="date" value="${today()}" oninput="calcPrestaciones('${id}')"></div>
        ${fld('pr-dias','Días trabajados sin pagar',0,{type:'number',extra:`oninput="calcPrestaciones('${id}')" min="0"`})}
        ${infoDesc?fld('pr-info-dias','Días INFONAVIT no retenidos','',{type:'number',ph:'Auto: 1 si baja lunes',extra:`oninput="calcPrestaciones('${id}')" min="0" max="31" step="1"`})
          :'<div><label>Crédito INFONAVIT</label><div class="fhint" style="margin-top:5px">No hay crédito activo. No se propone ni aplica retención.</div></div>'}
        <div><label>Escenario de separación</label><select id="pr-despido" onchange="prCambiarEscenario('${id}')"><option value="NO">Finiquito ordinario (renuncia/término)</option><option value="SI">Despido injustificado · art. 48</option><option value="ART50">Supuesto arts. 49 / 52 / 947 · art. 50</option><option value="JUSTIFICADO">Despido justificado · prima art. 162</option><option value="RENUNCIA15">Renuncia con 15 años o más · art. 162</option></select></div>
      </div>
      <style>.pr-legal[hidden]{display:none!important}.pr-legal{margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:10px}.pr-legal .pr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pr-legal label{display:block;margin-bottom:5px}.pr-legal .pr-wide{grid-column:1/-1}.pr-legal .pr-check{display:flex;gap:8px;align-items:flex-start;text-transform:none}.pr-check input{width:auto;flex:none;margin-top:3px}@media(max-width:650px){.pr-legal .pr-grid{grid-template-columns:1fr}.pr-legal{padding:10px}}</style>
      <section id="pr-legal" class="pr-legal" hidden aria-label="Bases y validación de la separación laboral">
        <div class="sect">Indemnización / prima de antigüedad · simulación separada</div>
        <p class="fhint">No cambia el salario de la ficha ni finiquitos guardados. Confirma contrato, continuidad y percepciones reales; el SDI del IMSS no sustituye la base laboral. Un puesto en construcción no define por sí solo el contrato ni el carácter de planta.</p>
        <div class="pr-grid" style="margin-top:10px">
          <div><label>Inicio de antigüedad reconocido *</label><input id="pr-ant-legal" type="date" value="${esc(iniAntig(w)||'')}" oninput="calcPrestaciones('${id}')"></div>
          <div><label>Fecha efectiva de pago *</label><input id="pr-pago-legal" type="date" value="${today()}" oninput="calcPrestaciones('${id}')"></div>
          <div><label>Contrato para art. 50 *</label><select id="pr-contrato-legal" onchange="calcPrestaciones('${id}')"><option value="">Confirmar el contrato real</option><option value="INDETERMINADO">Tiempo indeterminado</option><option value="DETERMINADO">Tiempo determinado válido</option><option value="OBRA">Obra / otro: requiere revisión jurídica</option></select></div>
          <div><label>Trabajador de planta · prima art. 162 *</label><select id="pr-planta-legal" onchange="calcPrestaciones('${id}')"><option value="">Confirmar procedencia</option><option value="SI">Sí, procede como trabajador de planta</option><option value="NO">No procede (supuesto documentado)</option></select></div>
          <div><label>Salario diario laboral / real ($) *</label><input id="pr-sd-legal" type="number" min="0.01" step="0.000001" value="${Number(w.sd)||''}" oninput="calcPrestaciones('${id}')"></div>
          <div><label>Salario diario integrado laboral ($) *</label><input id="pr-sdi-legal" type="number" min="0.01" step="0.000001" placeholder="Base arts. 84 y 89, no SBC automático" oninput="calcPrestaciones('${id}')"></div>
          <div class="pr-wide"><details><summary style="cursor:pointer">Ayuda para integrar salario fijo</summary><div class="pr-grid" style="margin-top:8px">
            <div><label>Días anuales de aguinaldo pactados</label><input id="pr-ag-pacto" type="number" min="15" step="0.01" value="15"></div>
            <div><label>Días anuales de vacaciones pactados</label><input id="pr-vac-pacto" type="number" min="12" step="0.01" value="${diasVacaciones(Math.max(1,Math.floor(Math.max(0,(new Date(today()+'T12:00')-new Date((iniAntig(w)||today())+'T12:00'))/86400000)/365.25)))}"></div>
            <div><label>Prima vacacional pactada (%)</label><input id="pr-pv-pacto" type="number" min="25" step="0.01" value="25"></div>
            <div><label>Otras percepciones integrables por día ($)</label><input id="pr-otros-pacto" type="number" min="0" step="0.000001" value="0"></div>
            <div class="pr-wide"><button class="btn" onclick="prProponerIntegracion('${id}')">Proponer base de salario fijo</button><p class="fhint">Propuesta: SD × [1 + aguinaldo/365 + vacaciones × prima/365] + otras percepciones. No resuelve salario variable: usa el promedio documentado del art. 89 y sus integrables. Revisa prestaciones pactadas antes de aceptar.</p></div>
          </div></details></div>
          <div><label>Mínimo de referencia para prima</label><select id="pr-zona-legal" onchange="prActualizarMinimo('${id}')"><option value="GENERAL">General · 2026 ($315.04)</option><option value="ZLFN">Frontera norte · 2026 ($440.87)</option><option value="VALIDADO">Profesional / zonas distintas / otro año: validado</option></select></div>
          <div><label>Salario mínimo aplicable ($) *</label><input id="pr-sm-legal" type="number" min="0.01" step="0.01" value="315.04" readonly oninput="calcPrestaciones('${id}')"></div>
          <div class="pr-wide"><label class="pr-check"><input id="pr-20-convenio" type="checkbox" onchange="calcPrestaciones('${id}')">Añadir 20 días/año por convenio expresamente validado (sólo escenario art. 48; no se presume obligación general).</label></div>
          <div><label>Último sueldo mensual ordinario ($) *</label><input id="pr-ultimo-legal" type="number" min="0.01" step="0.01" placeholder="Importe acreditado, no SDI × 30" oninput="calcPrestaciones('${id}')"></div>
          <div><label>ISR separación NOI / validado ($)</label><input id="pr-isr-sep" type="number" min="0" step="0.01" placeholder="Vacío: propuesta art. 96 para 2026" oninput="calcPrestaciones('${id}')"></div>
          <div><label>Exención de separación ya usada ($)</label><input id="pr-exento-usado" type="number" min="0" step="0.01" value="0" oninput="calcPrestaciones('${id}')"></div>
          <div><label>UMA diaria validada (otros ejercicios)</label><input id="pr-uma-legal" type="number" min="0.01" step="0.01" placeholder="2026 se determina por fecha de pago" oninput="calcPrestaciones('${id}')"></div>
          <div class="pr-wide"><label>Referencia del dictamen / convenio / papel de trabajo *</label><input id="pr-ref-legal" maxlength="500" placeholder="Identifica el soporte revisado; no implica renuncia de derechos" oninput="calcPrestaciones('${id}')"></div>
          <div class="pr-wide"><label class="pr-check"><input id="pr-litigo-legal" type="checkbox" onchange="calcPrestaciones('${id}')">Hay salarios vencidos, intereses, indemnización especial u otros conceptos pendientes de dictamen.</label><p class="fhint">Si se marca, se bloquea aplicar este modelo simplificado. No incluye liquidaciones colectivas, riesgos de trabajo ni impuestos anuales (art. 95 LISR).</p></div>
          <div class="pr-wide"><label class="pr-check"><input id="pr-validado-legal" type="checkbox" onchange="prConfirmarRevision('${id}')">He revisado la procedencia jurídica, bases, exenciones disponibles y el desglose fiscal en NOI. Para aplicar se requiere administrador, referencia y neto NOI.</label></div>
        </div>
        <p class="fhint" style="margin-top:10px">Fundamento: <a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf" target="_blank" rel="noopener">LFT</a> · <a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf" target="_blank" rel="noopener">LISR</a> · <a href="https://sjf2.scjn.gob.mx/detalle/ejecutoria/29478" target="_blank" rel="noopener">Procedencia de 20 días</a>. La simulación no acredita por sí sola el derecho ni sustituye dictamen o CFDI.</p>
      </section>
      ${infoDesc?`<div class="fhint" style="margin-top:8px"><b>Crédito INFONAVIT activo:</b> ${numeroCredito?`No. ${esc(numeroCredito)}`:'⚠ Falta el número de 10 dígitos: coteja el aviso'} · ${esc(infoDesc.modalidad||'CUOTA_FIJA')} · factor ${Number(infoDesc.factor||0).toFixed(4)} · $${money(infoDesc.monto)} por ${esc(infoDesc.periodicidad||periodoPago(w))}. El importe diario se desglosa abajo cuando corresponda.</div>`:''}
      <div class="grid" style="grid-template-columns:1fr 1fr 2fr;margin-top:8px;align-items:end">
        <div><label id="pr-isr-label">ISR D001 NOI ($) — si se ajustó</label><input id="pr-isr-noi" type="number" min="0" step="0.01" placeholder="usar cálculo automático" oninput="calcPrestaciones('${id}')"></div>
        <div><label>Finiquito según NOI ($) — opcional</label><input id="pr-noi" type="number" step="0.01" placeholder="para cuadrar al centavo" oninput="calcPrestaciones('${id}')"></div>
        <div id="pr-isr-hint" style="font-size:11.5px;color:var(--mut);padding-bottom:8px">Si contabilidad cambió D001 en NOI, captura aquí ese ISR para recalcular el neto y dejar el ajuste visible. El finiquito según NOI, si se captura, sigue mandando sobre el modelo para el cheque.</div>
      </div>
      <div id="pr-out" style="margin-top:16px"></div>
      ${typeof ppfTablasHTML==='function'?ppfTablasHTML():''}
      <p style="font-size:11.5px;color:var(--mut);margin-top:10px">Cálculo conforme a LFT vigente: aguinaldo 15 días (art. 87), vacaciones desde 12 días (art. 76), prima vacacional 25% (art. 80), indemnización según causal y prima de antigüedad (art. 162). Sólo si la ficha tiene <b>retención INFONAVIT activa</b> se propone un día adicional cuando la baja es lunes, independientemente de salarios pendientes; escribe 0 si ya quedó retenido en otro corte. Confirma el aviso, la cédula SUA y el detalle de NOI antes de pagar: el modelo no sustituye esa conciliación.</p>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn" onclick="ppfDesdeFicha('${id}')">Papel semanal · ISR preciso</button>
      <button class="btn dark" id="pr-usar" onclick="usarEnBaja('${id}')">Usar total como finiquito en BAJA</button>
    </div>`,'lg prestaciones-form');
  calcPrestaciones(id);
  estadoNoi.promesa=prCargarAjusteNoi(id,estadoNoi);
}
let PR_TOTAL=0;
function prMotivoSeparacion(escenario){
  // El catálogo SQL se conserva: art. 48/50 se guarda como OTRO y se detalla,
  // sin alterar chk_motivo_baja ni simular una renuncia/término de obra.
  return escenario==='SI'||escenario==='ART50'?'OTRO':escenario==='JUSTIFICADO'?'DESPIDO JUSTIFICADO (ART. 47 LFT)':'RENUNCIA VOLUNTARIA';
}
function prCambiarEscenario(id){
  if($('pr-validado-legal'))$('pr-validado-legal').checked=false;
  if($('pr-isr-sep'))$('pr-isr-sep').value='';
  if($('pr-isr-noi'))$('pr-isr-noi').value='';
  if($('pr-noi'))$('pr-noi').value='';
  calcPrestaciones(id);
}
function prActualizarMinimo(id){
  const zona=$('pr-zona-legal').value,inp=$('pr-sm-legal');inp.readOnly=zona!=='VALIDADO';
  inp.value=zona==='GENERAL'?'315.04':zona==='ZLFN'?'440.87':'';
  calcPrestaciones(id);
}
function prFechaUTC(texto){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(texto||'')))throw Error('Completa las fechas de antigüedad, baja y pago.');
  const fecha=new Date(texto+'T00:00:00Z');
  if(!Number.isFinite(+fecha)||fecha.toISOString().slice(0,10)!==texto)throw Error('La fecha capturada no es válida.');
  return fecha;
}
function prSumarMeses(fecha,meses){
  const primer=new Date(Date.UTC(fecha.getUTCFullYear(),fecha.getUTCMonth()+meses,1));
  const ultimo=new Date(Date.UTC(primer.getUTCFullYear(),primer.getUTCMonth()+1,0)).getUTCDate();
  return new Date(Date.UTC(primer.getUTCFullYear(),primer.getUTCMonth(),Math.min(fecha.getUTCDate(),ultimo)));
}
function prAntiguedadLegal(desde,hasta){
  const ini=prFechaUTC(desde),baja=prFechaUTC(hasta);
  if(baja<ini)throw Error('La baja no puede ser anterior al inicio reconocido.');
  const fin=new Date(+baja+86400000); // intervalo de servicio inclusivo; sin dividir todos los años por 365.25
  let completos=fin.getUTCFullYear()-ini.getUTCFullYear();
  if(prSumarMeses(ini,completos*12)>fin)completos--;
  const aniversario=prSumarMeses(ini,completos*12),siguiente=prSumarMeses(ini,(completos+1)*12);
  const resto=(fin-aniversario)/86400000,base=(siguiente-aniversario)/86400000;
  return {completos,dias_resto:resto,dias_ano:base,anios:completos+resto/base,dias_servicio:(fin-ini)/86400000,
    anios_fiscales:completos+(fin>prSumarMeses(aniversario,6)?1:0)};
}
function prMontoLegal(valor,nombre,{positivo=false,centavos=false}={}){
  if(valor==null||String(valor).trim()==='')throw Error('Completa '+nombre+'.');
  const n=Number(valor);
  if(!Number.isFinite(n)||n<0||(positivo&&n===0)||n>1e10||(centavos&&Math.abs(n*100-Math.round(n*100))>1e-5))throw Error('Revisa '+nombre+(centavos?' (máximo dos decimales).':'.'));
  return n;
}
function prIsrMensual2026(base){
  const n=redondearCentavos(base);if(n<=0)return 0;
  // Comparar por límite inferior evita huecos por fracciones de centavo entre bandas.
  const banda=[...ISR_M].reverse().find(b=>n>=b[0]);
  if(!banda)throw Error('Base fuera de la tarifa mensual.');
  return banda[2]+(n-banda[0])*banda[3]/100;
}
function prCalcularSeparacion(p){
  const escenario=p.escenario;
  if(!['SI','ART50','JUSTIFICADO','RENUNCIA15'].includes(escenario))throw Error('Selecciona un escenario legal soportado.');
  const antig=prAntiguedadLegal(p.desde,p.baja),pago=prFechaUTC(p.pago),baja=prFechaUTC(p.baja);
  if(pago<baja)throw Error('El pago no puede ser anterior a la separación en este modelo.');
  if(!['SI','NO'].includes(p.planta))throw Error('Confirma si procede la prima para trabajador de planta.');
  if(escenario==='RENUNCIA15'&&antig.completos<15)throw Error('La renuncia seleccionada requiere al menos 15 años reconocidos; usa finiquito ordinario o revisa un beneficio pactado.');
  const sd=prMontoLegal(p.sd,'salario diario laboral',{positivo:true});
  const requiereBase=escenario==='SI'||escenario==='ART50';
  const sdi=requiereBase?prMontoLegal(p.sdi,'salario integrado laboral',{positivo:true}):null;
  if(requiereBase&&sdi<sd)throw Error('El integrado laboral no puede ser menor que la cuota diaria capturada.');
  const anioBase=baja.getUTCFullYear(),zona=p.zona;
  if(!['GENERAL','ZLFN','VALIDADO'].includes(zona))throw Error('Confirma el mínimo aplicable.');
  if(anioBase!==2026&&zona!=='VALIDADO')throw Error('Para otro año, captura el mínimo validado y su soporte; no se reutiliza el de 2026.');
  const sm=zona==='GENERAL'?315.04:zona==='ZLFN'?440.87:prMontoLegal(p.sm,'mínimo validado',{positivo:true,centavos:true});
  let tres_meses=requiereBase?redondearCentavos(sdi*90):0,veinte_dias=0,art50_determinado=0;
  let regla='Sin 20 días automáticos · art. 48';
  if(escenario==='ART50'){
    if(p.contrato==='INDETERMINADO'){veinte_dias=redondearCentavos(20*sdi*antig.anios);regla='20 días/año · art. 50 II';}
    else if(p.contrato==='DETERMINADO'){
      art50_determinado=redondearCentavos(sdi*(antig.anios<1?antig.dias_servicio/2:180+20*(antig.anios-1)));
      regla=antig.anios<1?'Mitad del tiempo servido · art. 50 I':'6 meses primer año + 20 días/año siguientes · art. 50 I';
    }else throw Error('Art. 50 requiere confirmar contrato indeterminado o determinado válido. Obra/otros deben revisarse jurídicamente.');
  }else if(escenario==='SI'&&p.veinte_convenio){veinte_dias=redondearCentavos(20*sdi*antig.anios);regla='20 días/año pactados por convenio; no obligación automática';}
  const sd_prima=Math.max(sm,Math.min(sd,2*sm));
  const prima_antiguedad=p.planta==='SI'?redondearCentavos(12*sd_prima*antig.anios):0;
  const bruto=redondearCentavos(tres_meses+veinte_dias+art50_determinado+prima_antiguedad);
  const anioFiscal=pago.getUTCFullYear();
  const uma=anioFiscal===2026?(pago.getUTCMonth()===0?113.14:117.31):prMontoLegal(p.uma,'UMA del ejercicio de pago',{positivo:true,centavos:true});
  const utilizado=prMontoLegal(p.exento_usado,'exención de separación ya utilizada',{centavos:true});
  const limite_exento=redondearCentavos(90*uma*antig.anios_fiscales);
  if(utilizado>limite_exento)throw Error('La exención usada supera el límite para los años reconocidos; revisa pagos previos.');
  const exento=redondearCentavos(Math.min(bruto,Math.max(0,limite_exento-utilizado))),gravado=redondearCentavos(bruto-exento);
  const ultimo=prMontoLegal(p.ultimo,'último sueldo mensual ordinario',{positivo:true,centavos:true});
  let isr_propuesto=null,tasa=null,metodo='Sin gravado de separación',isr_fuente='ART96_PROPUESTA';
  if(gravado===0)isr_propuesto=0;
  else if(anioFiscal===2026){
    if(gravado<ultimo){isr_propuesto=redondearCentavos(prIsrMensual2026(gravado));metodo='Tarifa mensual: gravado menor al último sueldo';}
    else{tasa=prIsrMensual2026(ultimo)/ultimo;isr_propuesto=redondearCentavos(gravado*tasa);metodo='Tasa del último sueldo mensual ordinario × gravado';}
  }else metodo='Sin tarifa del ejercicio: requiere ISR validado en NOI';
  const manual=p.isr_manual!=null&&String(p.isr_manual).trim()!=='';
  const isr=manual?prMontoLegal(p.isr_manual,'ISR de separación NOI',{centavos:true}):isr_propuesto;
  if(manual)isr_fuente='NOI_VALIDADO';
  if(isr!=null&&isr>gravado)throw Error('El ISR de separación no puede exceder su gravado en este modelo.');
  return {escenario,antig,sd,sdi,sm,sd_prima,contrato:p.contrato||null,planta:p.planta,regla,tres_meses,veinte_dias,art50_determinado,prima_antiguedad,
    bruto,anioFiscal,uma,limite_exento,exento_usado:utilizado,exento,gravado,ultimo,isr_propuesto,isr,isr_fuente,tasa,metodo,
    neto:isr==null?null:redondearCentavos(bruto-isr)};
}
function prEntradasSeparacion(){
  const v=id=>$(id)?$(id).value:'',c=id=>!!($(id)&&$(id).checked);
  return {escenario:v('pr-despido'),desde:v('pr-ant-legal'),baja:v('pr-fecha'),pago:v('pr-pago-legal'),contrato:v('pr-contrato-legal'),planta:v('pr-planta-legal'),
    sd:v('pr-sd-legal'),sdi:v('pr-sdi-legal'),zona:v('pr-zona-legal'),sm:v('pr-sm-legal'),veinte_convenio:c('pr-20-convenio'),ultimo:v('pr-ultimo-legal'),
    isr_manual:v('pr-isr-sep'),exento_usado:v('pr-exento-usado'),uma:v('pr-uma-legal'),referencia:v('pr-ref-legal').trim(),validado:c('pr-validado-legal'),litigio:c('pr-litigo-legal')};
}
function prHuellaRevision(){
  const datos=prEntradasSeparacion();delete datos.validado;
  return JSON.stringify({datos,neto:$('pr-noi').value,isr_ordinario:$('pr-isr-noi').value,dias_pendientes:$('f-pr-dias').value,dias_info:$('f-pr-info-dias')?$('f-pr-info-dias').value:null});
}
function prConfirmarRevision(id){
  globalThis._PR_REVISION_ENTRADAS=$('pr-validado-legal').checked?prHuellaRevision():null;
  calcPrestaciones(id);
}
function prProponerIntegracion(id){
  try{
    const sd=prMontoLegal($('pr-sd-legal').value,'salario diario laboral',{positivo:true});
    const ag=prMontoLegal($('pr-ag-pacto').value,'aguinaldo pactado'),vac=prMontoLegal($('pr-vac-pacto').value,'vacaciones pactadas'),pv=prMontoLegal($('pr-pv-pacto').value,'prima pactada');
    const antig=prAntiguedadLegal($('pr-ant-legal').value,$('pr-fecha').value),minVac=diasVacaciones(Math.max(1,antig.completos));
    if(ag<15||vac<minVac||pv<25)throw Error('La propuesta no puede usar prestaciones inferiores al mínimo aplicable: '+minVac+' días de vacaciones.');
    const otros=prMontoLegal($('pr-otros-pacto').value,'otros integrables diarios');
    $('pr-sdi-legal').value=(sd*(1+ag/365+vac*pv/100/365)+otros).toFixed(6);
    $('pr-validado-legal').checked=false;calcPrestaciones(id);
    toast('Base fija propuesta. Revisa todas las percepciones integrables; no se modificó la ficha.','ok');
  }catch(e){toast(e.message,'err');}
}
function calcPrestaciones(id){
  const w=WORKERS.find(x=>x.id===id);
  if(!w)return;
  const cargaNoi=globalThis._PR_NOI_AJUSTE;
  if(cargaNoi&&cargaNoi.trabajador_id===id&&cargaNoi.estado!=='LISTO'){
    globalThis._PR_AUDIT={invalido:true};PR_TOTAL=NaN;
    if($('pr-usar'))$('pr-usar').disabled=true;
    $('pr-out').innerHTML=cargaNoi.estado==='ERROR'
      ?'<div class="fhint" style="color:var(--red)">No se pudieron verificar los ajustes NOI. Cierra y vuelve a abrir antes de aplicar el cálculo.</div>'
      :'<div class="fhint">Verificando ajustes NOI del trabajador…</div>';
    return;
  }
  const escenario=$('pr-despido').value;
  const conSeparacion=escenario!=='NO';
  if(conSeparacion&&$('pr-validado-legal').checked&&globalThis._PR_REVISION_ENTRADAS!==prHuellaRevision()){
    $('pr-validado-legal').checked=false;globalThis._PR_REVISION_ENTRADAS=null;
  }
  if($('pr-legal'))$('pr-legal').hidden=!conSeparacion;
  if($('pr-isr-label'))$('pr-isr-label').textContent=conSeparacion?'ISR ordinario NOI ($) · sin separación':'ISR D001 NOI ($) — si se ajustó';
  if($('pr-isr-hint'))$('pr-isr-hint').textContent=conSeparacion?'Captura aquí sólo el ISR de salarios/prestaciones ordinarias. El ISR de separación tiene su campo propio arriba: no dupliques el ISR total de NOI. Neto NOI debe incluir ambos bloques.':'Si contabilidad cambió D001 en NOI, captura aquí ese ISR para recalcular el neto y dejar el ajuste visible. El finiquito según NOI, si se captura, sigue mandando sobre el modelo para el cheque.';
  if($('pr-20-convenio'))$('pr-20-convenio').disabled=escenario!=='SI';
  if($('pr-contrato-legal'))$('pr-contrato-legal').disabled=escenario!=='ART50';
  if($('pr-sdi-legal'))$('pr-sdi-legal').disabled=!['SI','ART50'].includes(escenario);
  const sd=Number(w.sd)||0, sdi=Number(w.sdi)||sd;
  const infoDesc=creditoInfonavitActivo(w,$('pr-fecha').value);
  const f=$('pr-fecha').value; if(!f||!iniAntig(w)){
    globalThis._PR_AUDIT={invalido:true};PR_TOTAL=NaN;
    if($('pr-usar'))$('pr-usar').disabled=true;
    $('pr-out').innerHTML='<div class="empty">Falta la fecha de alta del trabajador.</div>';return;
  }
  const ini=new Date(iniAntig(w)+'T12:00'), fin=new Date(f+'T12:00');
  const dias=Math.max(0,Math.round((fin-ini)/86400000)+1); // días INCLUSIVOS (método contadoras: Castro 50 días ✔)
  const anios=Math.floor(dias/365.25);
  const diasAnio=Math.round(dias-anios*365.25);
  const inicioAnio=new Date(fin.getFullYear(),0,1);
  const diasEsteAnio=Math.max(0,Math.round((fin-Math.max(ini,inicioAnio))/86400000))+1;
  const diasPend=parseInt($('f-pr-dias')?$('f-pr-dias').value:0)||0;
  const salarioPend=diasPend*sd;
  // NOI: el aguinaldo proporcional excluye el día de baja y los días de falta
  // injustificada registrados durante el tiempo efectivamente laborado del año.
  // Vacaciones y prima conservan los días inclusivos ya conciliados.
  const faltasAg=Math.min(Math.max(0,diasEsteAnio-1),faltasAguinaldo(w,fin));
  const diasAgAutomaticos=Math.max(0,diasEsteAnio-1-faltasAg);
  const validacionNoi=conSeparacion?null:prAjusteNoiAplicable(w,f);
  const diasAgValidos=validacionNoi&&validacionNoi.dias_aguinaldo;
  const usaDiasNoi=diasAgValidos!=null&&Number.isInteger(Number(diasAgValidos))
    &&Number(diasAgValidos)>=0&&Number(diasAgValidos)<=Math.max(0,diasEsteAnio-1);
  const diasAgAnio=usaDiasNoi?Number(diasAgValidos):diasAgAutomaticos;
  // NOI presenta y suma cada percepción del finiquito a centavos. Conservar
  // precisión interna hasta el TOTAL cambia selectivamente el neto ±$0.01.
  const aguinaldoRaw=sd*15*(diasAgAnio/365);
  const aguinaldo=redondearCentavos(aguinaldoRaw);
  const diasVacAct=diasVacaciones(anios+1);
  const vacPropRaw=sd*diasVacAct*(diasAnio/365);
  const vacProp=redondearCentavos(vacPropRaw);
  const primaVac=redondearCentavos(vacPropRaw*0.25);
  let rows=[
    ['Antigüedad',`${anios} año(s) y ${diasAnio} día(s)`],
    ['Salarios pendientes',`$${money(salarioPend)} (${diasPend} días × $${money(sd)})`],
    ...(faltasAg?[['Faltas que reducen aguinaldo',`−${faltasAg} día(s) (incidencias activas del periodo laborado)`]]:[]),
    ...(usaDiasNoi?[['Días de aguinaldo confirmados',`${diasAgAnio} días · ${esc(validacionNoi.motivo||'Validación NOI')} · cálculo automático ${diasAgAutomaticos} días; no crea ni altera incidencias`]]:[]),
    ['Aguinaldo proporcional',`$${money(aguinaldo)} (15 días × ${diasAgAnio}/365 · ${usaDiasNoi?'días validados con NOI':`sin día de baja${faltasAg?` ni ${faltasAg} falta(s)`:''}`})`],
    ['Vacaciones proporcionales',`$${money(vacProp)} (${diasVacAct} días del año en curso, proporcional)`],
    ['Prima vacacional 25%',`$${money(primaVac)}`]
  ];
  let total=salarioPend+aguinaldo+vacProp+primaVac;
  let indemnizacion={tres_meses:0,veinte_dias:0,prima_antiguedad:0};
  let separacion=null,entradasSeparacion=null;
  if(conSeparacion){
    entradasSeparacion=prEntradasSeparacion();
    try{separacion=prCalcularSeparacion(entradasSeparacion);}
    catch(e){
      globalThis._PR_AUDIT={invalido:true};PR_TOTAL=NaN;
      if($('pr-usar'))$('pr-usar').disabled=true;
      $('pr-out').innerHTML=rows.map(r=>`<div class="kv"><b>${r[0]}</b><span>${r[1]}</span></div>`).join('')+
        `<div class="fhint" style="color:var(--amber);margin-top:10px"><b>Separación pendiente de calcular:</b> ${esc(e.message)} No hay neto autorizado para aplicar.</div>`;
      return;
    }
    indemnizacion={tres_meses:separacion.tres_meses,veinte_dias:separacion.veinte_dias,
      art50_determinado:separacion.art50_determinado,prima_antiguedad:separacion.prima_antiguedad};
    rows.push(['Antigüedad laboral reconocida',`${separacion.antig.completos} año(s) + ${separacion.antig.dias_resto} día(s) · fecha ${esc(entradasSeparacion.desde)} · no modifica ficha`]);
    if(separacion.sdi!=null)rows.push(['Base integrada laboral arts. 84/89',`$${money(separacion.sdi)} diarios (capturada; SBC IMSS $${money(sdi)} sólo referencia)`]);
    rows.push(['Indemnización 3 meses',`$${money(separacion.tres_meses)}${separacion.sdi!=null?' (90 días × base laboral)':' (no aplica al escenario)'}`]);
    rows.push(['Indemnización adicional',`$${money(separacion.veinte_dias+separacion.art50_determinado)} · ${esc(separacion.regla)}`]);
    rows.push(['Prima de antigüedad art. 162',`$${money(separacion.prima_antiguedad)}${separacion.planta==='SI'?` (12 días/año × base $${money(separacion.sd_prima)}; piso $${money(separacion.sm)}, tope $${money(2*separacion.sm)})`:' (no procede, sujeto a soporte)'}`]);
    rows.push(['BRUTO SEPARACIÓN / PRIMA',`$${money(separacion.bruto)} · conceptos distintos al finiquito ordinario`]);
    rows.push(['Exento separación art. 93 XIII',`$${money(separacion.exento)} · ${separacion.antig.anios_fiscales} año(s) fiscales × 90 UMA de $${money(separacion.uma)}${separacion.exento_usado?'; usado $'+money(separacion.exento_usado):''}`]);
    rows.push(['Gravado separación',`$${money(separacion.gravado)} · límite exento único compartido por los conceptos`]);
    rows.push(['ISR separación art. 96',separacion.isr==null?'PENDIENTE: captura el ISR validado del ejercicio':`−$${money(separacion.isr)} · ${esc(separacion.metodo)}${separacion.isr_fuente==='NOI_VALIDADO'?' · NOI capturado':' · propuesta por conciliar'}${separacion.tasa!=null?'; tasa '+(separacion.tasa*100).toFixed(6)+'%':''}`]);
    if(separacion.isr_fuente==='NOI_VALIDADO'&&separacion.isr_propuesto!=null)rows.push(['ISR separación: diferencia NOI',`$${money(separacion.isr-separacion.isr_propuesto)} vs propuesta $${money(separacion.isr_propuesto)}`]);
    total+=separacion.bruto;
  }
  // ISR del finiquito (método contadoras: aguinaldo exento hasta 30 UMA, prima vac. exenta hasta 15 UMA, vacaciones gravadas, tarifa MENSUAL Anexo 8)
  const f26=FISC();
  const exAg=Math.min(aguinaldo,30*f26.uma), exPV=Math.min(primaVac,15*f26.uma);
  const gravado=Math.max(0,(aguinaldo-exAg)+(primaVac-exPV)+vacProp);
  const isrCalculado=isrMensual(gravado);
  const isrRaw=$('pr-isr-noi')?$('pr-isr-noi').value:'';
  const isrManual=isrRaw!=='';
  const isrValidado=validacionNoi&&validacionNoi.isr;
  const usaIsrNoi=!isrManual&&isrValidado!=null;
  const isrFin=isrManual?Number(isrRaw):usaIsrNoi?Number(isrValidado):isrCalculado;
  if(!Number.isFinite(isrFin)||isrFin<0||isrFin>total||Math.abs(Math.round(isrFin*100)-isrFin*100)>1e-7){
    globalThis._PR_AUDIT={invalido:true};PR_TOTAL=NaN;
    $('pr-out').innerHTML='<div class="fhint" style="color:var(--red)">El ISR D001 debe ser un importe no negativo, con máximo dos decimales y no mayor que las percepciones.</div>';
    if($('pr-usar'))$('pr-usar').disabled=true;
    return;
  }
  if(usaIsrNoi)rows.push(['ISR validado con NOI',`$${money(isrFin)} · modelo $${money(isrCalculado)} · sólo este finiquito`]);
  rows.push(['Retención de ISR (Anexo 8, gravado $'+money(gravado)+(isrManual?' · D001 NOI capturado manualmente':usaIsrNoi?' · NOI validado':'')+')',`−$${money(isrFin)}`]);
  total-=isrFin+(separacion&&separacion.isr!=null?separacion.isr:0);
  // La retención del lunes de baja es INDEPENDIENTE de salarios pendientes.
  // Se propone un día si hay crédito activo y fecha de baja lunes; escribir 0
  // permite confirmar que el último corte ya lo cubrió, sin inventar salario.
  const infoInput=$('f-pr-info-dias');
  const infoManual=infoInput&&infoInput.value!=='';
  const diasCapturados=infoManual?Number(infoInput.value):null;
  if(infoManual&&(!Number.isInteger(diasCapturados)||diasCapturados<0||diasCapturados>31)){
    globalThis._PR_AUDIT={invalido:true};PR_TOTAL=NaN;
    $('pr-out').innerHTML='<div class="fhint" style="color:var(--red)">Los días INFONAVIT deben ser enteros entre 0 y 31.</div>';
    if($('pr-usar'))$('pr-usar').disabled=true;
    return;
  }
  const diasInfo=infoDesc?(infoManual?diasCapturados:(fin.getDay()===1?1:0)):0;
  let infoAplicado=0,infoOrigen=infoDesc?(infoManual?'CAPTURA_MANUAL':'AUTO_LUNES_BAJA'):'SIN_CREDITO';
  if(infoDesc){
    const numero=numeroCreditoInfonavit(infoDesc);
    const mod=String(infoDesc.modalidad||'CUOTA_FIJA').toUpperCase();
    const cuota=Number(infoDesc.cuota_mensual)||Number(infoDesc.factor)||0;
    rows.push(['Crédito INFONAVIT',`${numero?'No. '+esc(numero):'⚠ Número pendiente de validar'} · ${esc(mod)} · ${mod==='PORCENTAJE'?Number(infoDesc.factor||0)+'% sobre SDI':'cuota mensual $'+money(cuota)} · ${diasBimestreActual(fin)} días en bimestre`]);
  }
  if(infoDesc&&diasInfo>0){
    const infoExacta=retencionInfonavitDesdeAviso(infoDesc,w,diasInfo,fin);
    const Pinfo=perDe(w), cuotaPeriodo=montoDescuento(infoDesc,Pinfo);
    const infoModelo=infoExacta==null?redondearCentavos(cuotaPeriodo/Pinfo.dias*diasInfo):infoExacta;
    const infoValidado=validacionNoi&&validacionNoi.infonavit;
    const usaInfoNoi=infoValidado!=null&&Number.isFinite(Number(infoValidado))&&Number(infoValidado)>=0
      &&validacionNoi.credito_infonavit_id===infoDesc.id&&Number(validacionNoi.dias_infonavit)===diasInfo
      &&Number(validacionNoi.factor_infonavit)===Number(infoDesc.factor);
    const infoProp=usaInfoNoi?redondearCentavos(Number(infoValidado)):infoModelo;
    if(usaInfoNoi)rows.push(['INFONAVIT validado con NOI',`$${money(infoProp)} · modelo $${money(infoModelo)} · sólo este finiquito; aviso pendiente de cotejar`]);
    if(infoProp>0){
      rows.push([`Retención INFONAVIT (${diasInfo} día(s) × $${money(infoProp/diasInfo)} aprox.; redondeo único)`,`−$${money(infoProp)}`]);
      total-=infoProp;
      infoAplicado=infoProp;infoOrigen=(infoManual?'MANUAL_':'AUTO_LUNES_')+(infoExacta==null?'PRORRATEO_PERIODO':'AVISO_CREDITO');
      if(usaInfoNoi)infoOrigen='NOI_CONFIRMADO_POR_ADMIN';
    }
  }
  if(infoDesc&&diasInfo===0)rows.push(['Retención INFONAVIT adicional','$0.00 (sin días pendientes de retener)']);
  if(!infoDesc)rows.push(['Retención INFONAVIT','No aplica: sin crédito activo registrado']);
  // Las percepciones se suman DESPUÉS de redondear cada concepto a centavos;
  // el total mostrado coincide con los renglones, como en el reporte NOI.
  const modeloTotal=redondearCentavos(total);
  // "Finiquito según NOI" (opcional): si se captura, MANDA sobre el modelo, y el
  // cheque saldrá con ese monto exacto (lo que factura NOI). El modelo se sigue
  // mostrando para comparar el centavo.
  const noiRaw=$('pr-noi')?$('pr-noi').value:'';
  if(conSeparacion&&noiRaw!==''&&(!Number.isFinite(Number(noiRaw))||Number(noiRaw)<0||Math.abs(Number(noiRaw)*100-Math.round(Number(noiRaw)*100))>1e-5)){
    globalThis._PR_AUDIT={invalido:true};PR_TOTAL=NaN;
    if($('pr-usar'))$('pr-usar').disabled=true;
    $('pr-out').innerHTML='<div class="fhint" style="color:var(--red)">El neto NOI debe ser no negativo, con máximo dos decimales.</div>';return;
  }
  const noiV=(noiRaw!==''&&!isNaN(parseFloat(noiRaw)))?Math.round(parseFloat(noiRaw)*100)/100:null;
  const altaYBajaMismoDia=iniAntig(w)===f&&diasPend===0;
  const requiereNoiManual=altaYBajaMismoDia&&noiV==null;
  const requiereRevisionLegal=conSeparacion&&(!esAdmin()||w.estatus==='BAJA'||!entradasSeparacion.validado||!entradasSeparacion.referencia||noiV==null||entradasSeparacion.litigio||separacion.isr==null||!isrManual);
  if($('pr-usar'))$('pr-usar').disabled=requiereNoiManual||requiereRevisionLegal;
  PR_TOTAL=separacion&&separacion.isr==null?NaN:(noiV!=null?noiV:modeloTotal);
  const dif=(noiV!=null)?Math.round((noiV-modeloTotal)*100)/100:0;
  globalThis._PR_AUDIT={
    obra_id:w.obra_id,empresa_codigo:(typeof empresaDeTrabajador==='function'?empresaDeTrabajador(w):'PLATINUM'),trabajador_id:w.id,trabajador_numero:w.no_trab,
    trabajador_nombre:(typeof fullName==='function'?fullName(w):[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' ')),
    tipo_calculo:'FINIQUITO_CALCULADO',periodo:f,
    ...(conSeparacion?{formula_version:'SEPARACION_LFT_2026_V1'}:{}),
    entradas:{fecha_antiguedad:iniAntig(w),fecha_calculo:f,sd,sdi,dias_inclusivos:dias,anios,dias_anio:diasAnio,dias_aguinaldo_base:Math.max(0,diasEsteAnio-1),faltas_aguinaldo:faltasAg,dias_aguinaldo:diasAgAnio,
      dias_vacaciones_tabla:diasVacAct,dias_salario_pendiente:diasPend,dias_infonavit_no_retenidos:diasInfo,dias_infonavit_captura_manual:!!infoManual,
      credito_infonavit_id:infoDesc?infoDesc.id:null,numero_credito_infonavit:numeroCreditoInfonavit(infoDesc)||null,
      factor_infonavit:infoDesc?Number(infoDesc.factor)||null:null,origen_infonavit:infoOrigen,
      despido_injustificado:escenario==='SI',escenario_separacion:escenario,separacion_legal:entradasSeparacion,noi_manual:noiV,isr_noi_manual:isrManual?isrFin:null,
      ...(validacionNoi?{validacion_noi:validacionNoi,dias_aguinaldo_automaticos:diasAgAutomaticos}: {})},
    resultado:{salarios_pendientes:salarioPend,aguinaldo, vacaciones:vacProp,prima_vacacional:primaVac,isr:isrFin,
      isr_calculado:isrCalculado,isr_separacion:separacion?separacion.isr:0,separacion_legal:separacion,infonavit:infoAplicado,indemnizacion,modelo_total:modeloTotal,aplicado:PR_TOTAL},
    monto_modelo:modeloTotal,monto_aplicado:PR_TOTAL,ajuste_noi:dif,requiere_noi_manual:requiereNoiManual,requiere_revision_legal:requiereRevisionLegal
  };
  $('pr-out').innerHTML=(altaYBajaMismoDia?`<div class="fhint" style="color:var(--amber);margin-bottom:8px">⚠ Alta y baja administrativa el mismo día, sin salario pendiente. Confirma si laboró: NOI puede registrar $0. Captura el importe validado por NOI para habilitar el uso del finiquito; no se generará un cheque por prestaciones estimadas sin esa confirmación.</div>`:'')+
    rows.map(r=>`<div class="kv"><b>${r[0]}</b><span>${r[1]}</span></div>`).join('')+
    `<div class="kv franja-total"><b>${separacion&&separacion.isr==null?'MODELO INCOMPLETO · ISR PENDIENTE':conSeparacion?'NETO MODELO · POR CONCILIAR':'TOTAL'} ${noiV!=null?'(modelo)':''}</b><span>$${money(modeloTotal)}</span></div>`+
    (noiV!=null?`<div class="kv" style="background:var(--green-bg);color:var(--txt);font-weight:800;padding:10px 8px"><b>✔ FINIQUITO NOI (este va al cheque)</b><span>$${money(noiV)}${dif?` · dif ${dif>0?'+':''}$${money(Math.abs(dif))} vs modelo`:' · idéntico al modelo'}</span></div>`:'')+
    (conSeparacion?`<div class="fhint" style="margin-top:10px;color:var(--amber)">${w.estatus==='BAJA'?'Trabajador ya dado de baja: sólo simulación, no se reemplaza el finiquito registrado.':requiereRevisionLegal?'Aplicación bloqueada: requiere administrador, referencia del soporte, revisión marcada, ISR ordinario y neto NOI; sin conceptos especiales pendientes.':'Bases revisadas; el administrador deberá confirmar antes de llevar el neto NOI a la baja.'} Las prestaciones ordinarias conservan el método ya conciliado; coteja antigüedad y salario real si son distintos. La retención mostrada no es el impuesto anual definitivo; salarios vencidos/intereses no están incluidos.</div>`:'')+
    `<div style="font-size:11px;color:var(--mut);margin-top:4px">${isrManual?`ISR ordinario automático $${money(isrCalculado)}; ISR ordinario NOI capturado $${money(isrFin)}. No incluye el ISR de separación, que tiene su campo propio. `:''}${noiV!=null?'Al aplicar se utilizará el <b>neto de NOI</b> capturado arriba; no se expide ningún cheque desde esta simulación.':'Cada percepción ordinaria se redondea a centavos antes de sumarla, como en NOI. Si el detalle emitido por NOI arroja otro ISR o importe, revísalo por concepto antes de aplicar.'}</div>`;
}
async function usarEnBaja(id){
  if(!puedeEditarTrabajador()){toast('No tienes permiso para aplicar cálculos.','err');return;}
  if(!globalThis._PR_AUDIT||globalThis._PR_AUDIT.invalido||!Number.isFinite(PR_TOTAL)){toast('Revisa los datos del finiquito antes de usarlo.','err');return;}
  if(globalThis._PR_AUDIT.trabajador_id!==id){toast('El cálculo no corresponde a este trabajador.','err');return;}
  if(globalThis._PR_AUDIT.requiere_noi_manual){toast('Confirma el importe en NOI antes de usar este finiquito de alta y baja el mismo día.','err');return;}
  const audit=globalThis._PR_AUDIT,legal=audit.entradas&&audit.entradas.separacion_legal;
  if(!legal&&typeof ppfGuardarDesdeFicha==='function'){
    const firma=JSON.stringify(audit),papel=await ppfGuardarDesdeFicha(id,audit);
    if(!papel)return;
    if(!$('pr-fecha')||JSON.stringify(globalThis._PR_AUDIT)!==firma){toast('El cálculo cambió; revisa antes de aplicar.','err');return;}
    audit.papel_prestaciones_id=papel.id;audit.papel_prestaciones_huella=papel.huella;
  }
  if(legal){
    calcPrestaciones(id);
    if(!esAdmin()||globalThis._PR_AUDIT.invalido||globalThis._PR_AUDIT.requiere_revision_legal||!Number.isFinite(PR_TOTAL)){
      toast('Sólo el administrador puede aplicar una separación revisada y conciliada con NOI.','err');return;
    }
    if(!confirm('¿Aplicar el neto NOI de $'+money(PR_TOTAL)+' a la baja?\n\nSe conservará la referencia y desglose en bitácora. No cambia ningún finiquito ya registrado ni genera pago ahora.'))return;
    const actual=structuredClone(globalThis._PR_AUDIT);
    $('pr-usar').disabled=true;
    let guardado=false;
    try{guardado=await registrarBitacoraNomina([{...actual,tipo_calculo:'SEPARACION_VALIDADA',monto_aplicado:PR_TOTAL}],{silencioso:false});}
    catch(e){toast('No se aplicó: no fue posible guardar la validación en bitácora.','err');}
    if(!guardado){if($('pr-usar'))$('pr-usar').disabled=false;toast('No se aplicó: no fue posible guardar la validación en bitácora.','err');return;}
    // Si se editó o cerró mientras se guardaba, no aplicar una simulación obsoleta.
    if(!$('pr-fecha'))return;
    calcPrestaciones(id);
    if(JSON.stringify(globalThis._PR_AUDIT)!==JSON.stringify(actual)){toast('Los datos cambiaron; revisa y confirma de nuevo.','err');return;}
  }
  const t=PR_TOTAL;
  const fecha=audit.periodo;
  closeModal();openBaja(id);
  setTimeout(()=>{if($('b-finiquito')){$('b-finiquito').value=t;$('b-chq-wrap').style.opacity=1;if(legal){$('b-fecha').value=fecha;$('b-motivo-cat').value=prMotivoSeparacion(legal.escenario);$('b-motivo').value='SEPARACION LFT ['+legal.escenario+'] · '+legal.referencia;bajaCortaPreview(id);}}},100);
}

