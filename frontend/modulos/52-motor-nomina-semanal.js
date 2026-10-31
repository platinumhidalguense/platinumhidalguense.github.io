/* Motor semanal independiente. La salida monetaria conserva la versión
   validada 2026-10-30.2; no contiene calendario ni cálculo quincenal. */
function nominaSemanalParametros(dias){
  const d=Math.max(1,Math.round(Number(dias)||7));
  if(d>7)throw Error('El periodo semanal no puede superar siete días.');
  return {cve:'SEMANAL',dias:d,lab:6,etiqueta:'semanal',fFalta:7/6};
}
function calendarioNominaSemanal(desde,hasta){
  const a=retFecha(desde),b=retFecha(hasta);
  if(!Number.isFinite(+a)||!Number.isFinite(+b)||Math.round((b-a)/86400000)!==6)throw Error('Calendario semanal inválido.');
  return {motor:'SEMANAL_V1',desde,hasta,dias:7,fecha_pago:retSumarDias(desde,4)};
}
function nominaSemanal(w,opts){
  if(periodoPago(w)!=='SEMANAL')throw Error('El motor semanal sólo admite periodicidad SEMANAL.');
  const o=opts||{}; const f=FISC(); const P=nominaSemanalParametros(o.dias);
  const faltas=Math.max(0,Math.min(P.dias,Math.round(Number(o.faltas)||0)));
  const incapacidadIMSS=Math.max(0,Math.min(P.dias-faltas,Math.round(Number(o.incapacidadIMSS)||0)));
  const sd=Number(w.sd)||0;
  const sbc=Math.min(Number(w.sdi)||sd*1.0493, 25*f.uma);
  
  const premioCapturado=Number(o.premios)||0;
  const premiosPag=faltas>0?0:premioCapturado;
  
  
  
  
  
  const diasPag=Math.max(0,P.dias-faltas*P.fFalta-incapacidadIMSS);
  const bruto=Math.round((sd*diasPag+premiosPag)*100)/100;
  
  
  
  
  const diasCot=P.dias-faltas-incapacidadIMSS;
  const obrDia=Math.max(0,sbc-3*f.uma)*0.0040+sbc*(0.0025+0.00375+0.00625+0.01125);
  const imssObr=Math.round(obrDia*diasPag*100)/100;
  
  const isrBrutoRaw=isrPeriodo(bruto,P.dias,true);
  const isrBruto=redondearCentavos(isrBrutoRaw);
  const subPct=Number(f.subsidio_pct)||15.02, subTopeM=Number(f.subsidio_tope_mensual)||11492.66;
  const topeSem=Math.round(subTopeM/30.4*P.dias*100)/100;
  
  
  
  
  
  const subDia=Math.floor(subPct/100*f.uma*100)/100;
  const subSem=Math.round(subDia*P.dias*100)/100; 
  const subsidio=bruto<=topeSem?Math.min(subSem,isrBruto):0;
  
  
  
  
  
  const isrNetoRaw=isrBrutoRaw-subsidio;
  const isr=subsidio>0&&isrBrutoRaw>subsidio
    ?(isrNetoRaw<20?redondearCentavos(isrNetoRaw):Math.floor(isrNetoRaw*100+1e-9)/100)
    :redondearCentavos(isrBruto-subsidio);
  const neto=redondearCentavos(bruto-isr-imssObr);
  return {periodo:P.cve,dias:P.dias,etiqueta:P.etiqueta,
          faltas,incapacidadIMSS,diasPag:Math.round(diasPag*10000)/10000,diasCot,sd,sbc,bruto,
          premioCapturado,premiosPag,premioAnulado:faltas>0&&premioCapturado>0,
          obrDia:Math.round(obrDia*10000)/10000,imssObr,isrBruto,subsidio,isr,neto};
}

/* Incidencias semanales: contrato financiero conservado. */
function descuentoFaltasSemanal(w,faltas,premios,dias,incapacidadIMSS){
  const N=nominaSemanal(w,{faltas:0,premios:premios,dias});
  const F=nominaSemanal(w,{faltas:faltas,incapacidadIMSS,premios:premios,dias});
  
  
  
  
  
  
  
  const salReal=Number(w.sal_semanal)||N.neto;
  return {monto:Math.round((salReal-F.neto)*100)/100,normal:N,conFaltas:F,periodo:N.periodo,dias:N.dias,
    dBruto:Math.round((N.bruto-F.bruto)*100)/100,
    dIsr:Math.round((N.isr-F.isr)*100)/100,
    dImss:Math.round((N.imssObr-F.imssObr)*100)/100};
}
