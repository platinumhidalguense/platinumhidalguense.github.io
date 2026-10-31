/* Motor quincenal independiente. Distingue calendario natural de días
   fiscales NOI, tarifa ordinaria y ajuste mensual de segunda quincena. */
function nominaQuincenalParametros(dias){
  const d=dias==null?15:Number(dias);
  if(!Number.isInteger(d)||d<1||d>16)throw Error('Días naturales quincenales inválidos; captura los días fiscales por separado.');
  return {cve:'QUINCENAL',dias:d,lab:d,etiqueta:'quincenal',fFalta:1};
}
function calendarioNominaQuincenal(inicio,fin){
  let referencia=fin;
  if(inicio>='2026-10-26')for(let d=inicio;d<=fin;d=retSumarDias(d,1)){
    const x=retFecha(d),ultimo=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate();
    if(x.getUTCDate()===15||x.getUTCDate()===ultimo){referencia=d;break;}
  }
  const f=retFecha(referencia);if(!Number.isFinite(+f))throw Error('Calendario quincenal inválido.');
  const anio=f.getUTCFullYear(),mes=f.getUTCMonth(),segunda=f.getUTCDate()>15;
  const desde=`${anio}-${String(mes+1).padStart(2,'0')}-${segunda?'16':'01'}`;
  const hasta=segunda?retISO(new Date(Date.UTC(anio,mes+1,0,12))):`${anio}-${String(mes+1).padStart(2,'0')}-15`;
  return {motor:'QUINCENAL_V1',desde,hasta,dias:Math.round((retFecha(hasta)-retFecha(desde))/86400000)+1,fecha_pago:hasta};
}
function perfilNominaQuincenal(w,opciones){
  const config=typeof CFGEMP==='object'?CFGEMP.motores_nomina:null;
  const rp=String(w?.registro_patronal||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  const perfil=opciones?.perfil||config?.QUINCENAL?.por_registro?.[rp]||config?.QUINCENAL?.por_obra?.[w?.obra_id];
  if(!perfil)throw Error('Falta configurar y validar el perfil del motor quincenal de este centro.');
  const dias=Number(perfil.dias_fiscales),divisor=Number(perfil.divisor_isr),falta=Number(perfil.factor_falta);
  if(!(dias>0&&dias<=16)||!(divisor>=28&&divisor<=31)||!(falta>0&&falta<=7/6)||!['TARIFA_SAT','NOI_SUPERIOR_ANTERIOR'].includes(perfil.criterio_limite_inferior))throw Error('Perfil quincenal inválido.');
  return {...perfil,dias_fiscales:dias,divisor_isr:divisor,factor_falta:falta};
}
function isrOrdinarioQuincenal(bruto,diasFiscales,perfil,fiscal){
  const r=redondearCentavos,factor=diasFiscales/perfil.divisor_isr,base=bruto/factor;
  // La conversión fiscal puede producir fracciones entre dos límites a
  // centavos. Elegir por límite inferior evita huecos artificiales de tarifa.
  let tramo=null;for(let i=ISR_M.length-1;i>=0;i--)if(base>=ISR_M[i][0]){tramo=ISR_M[i];break;}
  if(bruto>0&&!tramo)throw Error('Base fuera de la tarifa quincenal.');
  const limite=tramo?(perfil.criterio_limite_inferior==='NOI_SUPERIOR_ANTERIOR'&&tramo[0]>.01?r(tramo[0]-.01):tramo[0]):0;
  const impuesto=tramo?(tramo[2]+(base-limite)*tramo[3]/100)*factor:0;
  const mes=String(fiscal.mes||'');
  const cuota=mes.endsWith('-01')?r(3439.46*.1559):r(3566.22*(Number(fiscal.subsidio_pct)||15.02)/100);
  const subsidio=bruto>0&&base<=(Number(fiscal.subsidio_tope_mensual)||11492.66)?Math.min(impuesto,cuota*factor):0;
  return {isrBruto:r(impuesto),subsidio:r(subsidio),isr:r(Math.max(0,impuesto-subsidio)),factor,limite_inferior:limite};
}
function nominaQuincenal(w,opciones){
  if(periodoPago(w)!=='QUINCENAL')throw Error('El motor quincenal sólo admite periodicidad QUINCENAL.');
  const o=opciones||{},perfil=perfilNominaQuincenal(w,o),P=nominaQuincenalParametros(o.dias),r=redondearCentavos;
  const f=FISC(),fiscal={...f,mes:o.desde?.slice(0,7)};
  const faltas=Number(o.faltas??0),incapacidadIMSS=Number(o.incapacidadIMSS??0);
  if(!Number.isInteger(faltas)||!Number.isInteger(incapacidadIMSS)||faltas<0||incapacidadIMSS<0||faltas+incapacidadIMSS>P.dias)throw Error('Días de incidencias quincenales inválidos.');
  const sd=Number(w.sd),sdi=Number(w.sdi);
  if(!Number.isFinite(sd)||!Number.isFinite(sdi)||!(sd>0)||!(sdi>0))throw Error('El motor quincenal requiere SD y SDI documentados.');
  const diasFiscales=o.diasFiscales==null?perfil.dias_fiscales:Number(o.diasFiscales);
  if(!(diasFiscales>0&&diasFiscales<=16))throw Error('Días fiscales quincenales inválidos.');
  const sbc=Math.min(sdi,25*f.uma),premioCapturado=Number(o.premios??0),premiosPag=faltas>0?0:premioCapturado;
  if(!Number.isFinite(premioCapturado)||premioCapturado<0)throw Error('Premios quincenales inválidos.');
  const diasPag=faltas+incapacidadIMSS>=P.dias?0:Math.max(0,diasFiscales-faltas*perfil.factor_falta-incapacidadIMSS);
  const bruto=r(sd*diasPag+premiosPag),diasCot=Math.max(0,P.dias-faltas-incapacidadIMSS);
  const obrDia=Math.max(0,sbc-3*f.uma)*.004+sbc*(.0025+.00375+.00625+.01125),imssObr=r(obrDia*diasPag);
  const ordinario=isrOrdinarioQuincenal(bruto,diasFiscales,perfil,fiscal);
  let isr=ordinario.isr,ajuste_mensual=null;
  if(o.fuenteISR){
    const fuente=o.fuenteISR;
    if(fuente.trabajador_id&&fuente.trabajador_id!==w.id||fuente.sd!=null&&Number(fuente.sd)!==sd||r(fuente.gravable_actual)!==bruto)throw Error('La fuente ISR no corresponde al trabajador o a su base quincenal vigente.');
    if(o.desde&&o.desde!==fuente.desde||o.hasta&&o.hasta!==fuente.hasta)throw Error('La fuente ISR pertenece a otra quincena.');
    ajuste_mensual=isrQCalcular(fuente);if(ajuste_mensual.saldo_favor>0)throw Error('El saldo a favor ISR requiere revisión.');
    isr=ajuste_mensual.isr_quincenal;
  }
  return {periodo:'QUINCENAL',dias:P.dias,etiqueta:'quincenal',faltas,incapacidadIMSS,diasPag:Math.round(diasPag*10000)/10000,diasCot,sd,sbc,bruto,
    premioCapturado,premiosPag,premioAnulado:faltas>0&&premioCapturado>0,obrDia:Math.round(obrDia*10000)/10000,imssObr,isrBruto:ordinario.isrBruto,subsidio:ordinario.subsidio,isr,neto:r(bruto-imssObr-isr),
    motor:'QUINCENAL_V1',perfil:perfil.codigo,diasFiscales,ajuste_mensual,requiere_ajuste_mensual:!!(o.desde?.slice(-2)==='16'&&!o.fuenteISR)};
}
function descuentoFaltasQuincenal(w,faltas,premios,dias,incapacidadIMSS,contexto){
  const c=contexto||{};
  if(!/^\d{4}-\d\d-(01|16)$/.test(c.desde||'')||!/^\d{4}-\d\d-\d\d$/.test(c.hasta||''))throw Error('Selecciona la quincena de la incidencia antes de calcular.');
  const d=c.dias||Math.round((retFecha(c.hasta)-retFecha(c.desde))/86400000)+1;
  const opts={dias:d,desde:c.desde,hasta:c.hasta,premios:Number(premios)||0};
  const N=nominaQuincenal(w,opts),ordinario=nominaQuincenal(w,{...opts,faltas:Number(faltas)||0,incapacidadIMSS:Number(incapacidadIMSS)||0});
  const mensual=c.desde.endsWith('-16');
  // En Q2 el ajuste mensual ya incorpora el ISR causado por las incidencias.
  // La incidencia retiene la referencia ordinaria para no reducir ISR dos veces.
  const F=mensual&&ordinario.bruto>0?{...ordinario,isr:N.isr,neto:redondearCentavos(ordinario.bruto-ordinario.imssObr-N.isr)}:ordinario;
  const sal=Number(w.sal_semanal)||N.neto;
  return {monto:redondearCentavos(sal-F.neto),normal:N,conFaltas:F,periodo:'QUINCENAL',dias:d,isr_mensual_separado:mensual,
    dBruto:redondearCentavos(N.bruto-F.bruto),dIsr:redondearCentavos(N.isr-F.isr),dImss:redondearCentavos(N.imssObr-F.imssObr)};
}
