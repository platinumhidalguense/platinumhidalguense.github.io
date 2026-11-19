/* Horas extra y descansos laborados aplicados a la nómina ordinaria.
   Post-proceso del modelo, igual que el aguinaldo (73): proyModelo, los
   motores 52/53 y el ajuste ISR mensual (48) quedan intactos. Sólo las filas
   con capturas vigentes en su periodo reciben el campo `jornada`; su neto
   aumenta en bruto − ISR incremental. El sueldo y la previsión social no
   cambian, así que el diferencial no absorbe la percepción. Sin capturas el
   modelo se devuelve idéntico (misma referencia). */
function jornadaSinEsquema(error){
  const c=String(error?.code||''),m=String(error?.message||'');
  return c==='PGRST205'||c==='42P01'||(/control_jornada_eventos/.test(m)&&/does not exist|could not find|schema cache/i.test(m));
}
async function jornadaLeerEventos(obraIds){
  const ids=[...new Set((obraIds||[]).filter(Boolean))];
  if(!ids.length)return [];
  const {data,error}=await fetchAllRows(()=>sb.from('control_jornada_eventos')
    .select('id,obra_id,trabajador_id,tipo,fecha_trabajada,periodicidad,semana_origen,semana_aplicacion,desde_aplicacion,hasta_aplicacion,fecha_pago,bruto,exento,gravado,calculo,retroactivo,estado,version')
    .in('obra_id',ids).eq('estado','APLICADO'));
  if(error){if(jornadaSinEsquema(error))return [];throw Error('No se pudieron consultar las horas extra y descansos laborados: '+error.message);}
  return data||[];
}
function jornadaEventoValido(e){
  const r=redondearCentavos,n=k=>Number(e[k]),c=e.calculo||{};
  const ok=['bruto','exento','gravado'].every(k=>Number.isFinite(n(k))&&n(k)>=0)&&n('bruto')>0&&r(n('exento')+n('gravado'))===r(n('bruto'))
    &&r(Number(c.bruto))===r(n('bruto'))&&r(Number(c.exento))===r(n('exento'))&&r(Number(c.gravado))===r(n('gravado'))
    &&/^\d{4}-\d\d-\d\d$/.test(e.desde_aplicacion||'')&&/^\d{4}-\d\d-\d\d$/.test(e.hasta_aplicacion||'');
  if(!ok)throw Error('Captura de horas extra o descanso laborado con importes inconsistentes ('+String(e.id||'').slice(0,8)+'). Revísala en el calendario de la ficha antes de exportar.');
  return e;
}
function jornadaEnPeriodo(e,w,sem){
  if(e.trabajador_id!==w.id||e.obra_id!==w.obra_id)return false;
  const p=calendarioNominaDe(w,sem);
  return p.desde===e.desde_aplicacion&&p.hasta===e.hasta_aplicacion&&periodoPago(w)===String(e.periodicidad||'').toUpperCase();
}
/* ISR incremental con el motor real de la fila, en el mismo contexto:
   ISR(ordinario + aguinaldo gravado + este gravado) − ISR(ordinario + aguinaldo gravado).
   Semanal: pasos de ISR y subsidio del motor 52 (espejo verificado del aguinaldo).
   Quincenal: tarifa y perfil del motor 53 con sus días fiscales. */
/* Incidencias del mismo periodo (faltas, incapacidad IMSS y premios) tal como
   las guardó el calendario en su descuento grupal. El ISR adicional se calcula
   sobre ese mismo bruto ordinario: con faltas, la base es menor y el subsidio
   puede absorber el impuesto, igual que en NOI (2026-11-19). */
function jornadaContextoIncidencias(w,sem){
  const p=calendarioNominaDe(w,sem),n=Number(String(sem||'').replace(/\D/g,''));
  const xs=(typeof DESC!=='undefined'&&Array.isArray(DESC)?DESC:[]).filter(d=>d&&d.trabajador_id===w.id&&d.activo&&!d.recurrente
    &&['FALTA','INCIDENCIA'].includes(String(d.tipo||'').toUpperCase())
    &&(d.ajustes_semana?._periodo_nomina?d.ajustes_semana._periodo_nomina.desde===p.desde&&d.ajustes_semana._periodo_nomina.hasta===p.hasta
      :Number(String(d.semana||'').replace(/\D/g,''))===n));
  let faltas=0,incapacidadIMSS=0,premios=0,sinDesglose=false;
  for(const d of xs){
    const m=d.ajustes_semana?._calculo_incidencia;
    if(m&&(m.modo==='AUTOMATICO'||m.modo==='INCREMENTAL_IMSS')){
      faltas=Math.max(faltas,Number(m.faltas)||0);incapacidadIMSS=Math.max(incapacidadIMSS,Number(m.incapacidad_imss)||0);premios=Math.max(premios,Number(m.premios)||0);
    }else sinDesglose=true;
  }
  return {faltas,incapacidadIMSS,premios,sin_desglose:sinDesglose,descuentos:xs.map(d=>d.id)};
}
function jornadaIsrDe(f,sem){
  const w=f.w,fis=FISC(),ag=Number(f.aguinaldo?.gravado||0),r=redondearCentavos,inc=jornadaContextoIncidencias(w,sem);
  const ctx={faltas:inc.faltas,incapacidadIMSS:inc.incapacidadIMSS,premios:inc.premios};
  const comun={aguinaldo_gravado:ag,faltas:inc.faltas,incapacidad_imss:inc.incapacidadIMSS,incidencias_sin_desglose:inc.sin_desglose};
  if(periodoPago(w)==='QUINCENAL'){
    const p=calendarioNominaDe(w,sem),perfil=perfilNominaQuincenal(w),N=nominaQuincenal(w,{dias:p.dias,desde:p.desde,hasta:p.hasta,...ctx});
    const base=r(N.bruto+ag),isr=g=>isrOrdinarioQuincenal(r(base+g),perfil.dias_fiscales,perfil,{...fis,mes:p.desde.slice(0,7)});
    return {metodo:'ART96_QUINCENAL',bruto_ordinario:N.bruto,...comun,dias_fiscales:perfil.dias_fiscales,ajuste_mensual:!!f.isr_mensual,isr};
  }
  const N=nominaSemanal(w,ctx),base=r(N.bruto+ag),A=window.PLATINUM_AGUINALDO;
  return {metodo:'ART96_SEMANAL',bruto_ordinario:N.bruto,...comun,dias:7,isr:g=>A.isrSemanalMotor(r(base+g),7,fis,isrPeriodo)};
}
function jornadaAplicarModelo(m,eventos){
  const xs=(eventos||[]).filter(e=>e&&e.estado==='APLICADO').map(jornadaEventoValido);
  if(!xs.length||!m?.filas?.length)return m;
  for(const f of m.filas.filter(f=>f.fin))
    if(xs.some(e=>jornadaEnPeriodo(e,f.w,m.sem)))throw Error(`#${f.w.no_trab} (${fullName(f.w)}) tiene horas extra o descansos laborados en este periodo y ahora es finiquito: anúlalos en su calendario e inclúyelos en el finiquito.`);
  const J=window.PLATINUM_JORNADA,r=redondearCentavos;let toca=false;
  const filas=m.filas.map(f=>{
    if(f.fin||f.jornada)return f;
    const es=xs.filter(e=>jornadaEnPeriodo(e,f.w,m.sem));
    if(!es.length)return f;
    toca=true;
    const agg=J.agregarPeriodo(es.map(e=>({...e.calculo,id:e.id}))),ctx=jornadaIsrDe(f,m.sem),efecto=J.efectoIsr(agg.gravado,ctx.isr);
    const jor={...agg,isr:efecto.isr,neto:r(agg.bruto-efecto.isr),fecha_pago:es[0].fecha_pago,periodo_desde:es[0].desde_aplicacion,periodo_hasta:es[0].hasta_aplicacion,
      retroactivos:es.filter(e=>e.retroactivo).map(e=>({id:e.id,semana_origen:e.semana_origen,fecha:e.fecha_trabajada})),
      isr_detalle:{metodo:ctx.metodo,bruto_ordinario:ctx.bruto_ordinario,aguinaldo_gravado:ctx.aguinaldo_gravado,faltas:ctx.faltas,incapacidad_imss:ctx.incapacidad_imss,incidencias_sin_desglose:ctx.incidencias_sin_desglose,isr_sin:efecto.isr_sin,isr_con:efecto.isr_con,subsidio_sin:efecto.subsidio_sin,subsidio_con:efecto.subsidio_con,efecto_subsidio:efecto.efecto_subsidio,ajuste_mensual:!!ctx.ajuste_mensual}};
    return {...f,jornada:jor,neto:r(f.neto+jor.neto)};
  });
  if(!toca)return m;
  const total=k=>r(filas.reduce((a,f)=>a+(f.jornada?Number(f.jornada[k]):0),0));
  return {...m,filas,items:filas.flatMap(x=>x.items),neto:r(filas.reduce((a,f)=>a+f.neto,0)),
    jornada:{bruto:total('bruto'),exento:total('exento'),gravado:total('gravado'),isr:total('isr'),neto:total('neto'),trabajadores:filas.filter(f=>f.jornada).length}};
}
function jornadaSinFila(m,eventos,alcance){
  const a=alcance||{},enModelo=new Set((m?.filas||[]).flatMap(f=>f.jornada?.eventos||[]));
  return (eventos||[]).filter(e=>e&&e.estado==='APLICADO'&&!enModelo.has(e.id)
    &&(!a.trabajadores||a.trabajadores.has(e.trabajador_id))
    &&(!a.periodo||a.periodo==='TODOS'||String(e.periodicidad).toUpperCase()===a.periodo)
    &&(()=>{const p=calendarioNominaDe({periodo_pago:e.periodicidad},m.sem);return p.desde===e.desde_aplicacion&&p.hasta===e.hasta_aplicacion;})());
}
function jornadaExigirCompleto(m,eventos,alcance){
  const faltan=jornadaSinFila(m,eventos,alcance);
  if(faltan.length)throw Error(`${faltan.length} captura(s) de horas extra o descanso laborado de este periodo no tienen fila de nómina (baja, cambio de periodicidad o de centro). Anúlalas o corrígelas en el calendario de la ficha; no se exporta una nómina incompleta.`);
  return m;
}
/* Hoja de desglose: naturaleza de cada percepción, exención, ISR y SBC. */
function jornadaHojaProyeccion(modelo,colB){
  const filas=modelo.filas.filter(f=>f.jornada).sort((a,b)=>(Number(a.w.no_trab)||0)-(Number(b.w.no_trab)||0));
  const h=n=>Math.round(Number(n||0)/60*100)/100;
  const rows=[[`HORAS EXTRA Y DESCANSOS LABORADOS · ${modelo.sem} · LFT 66-68, 73-75 · LISR 93-I/II/XIV y 96 · LSS 27`],
    ['NO.','NOMBRE COMPLETO',colB==='OBRA'?'OBRA':'CONTRATISTA','PERIODO','FECHA DE PAGO','HORAS DOBLES','HORAS TRIPLES','IMPORTE DOBLES','IMPORTE TRIPLES','DESCANSO LABORADO','PRIMA DOMINICAL','BRUTO','EXENTO','GRAVADO','ISR','NETO','SBC VARIABLE','AJUSTE ANTERIOR']];
  const styles=[ST.title,ST.head],money=[7,8,9,10,11,12,13,14,15,16];
  for(const f of filas){
    const j=f.jornada;
    rows.push([f.w.no_trab??'',fullName(f.w),colB==='OBRA'?(OBRAS.find(o=>o.id===f.w.obra_id)?.nombre||''):f.w.contratista||'',`${fmtD(j.periodo_desde)} – ${fmtD(j.periodo_hasta)}`,fmtD(j.fecha_pago),
      h(j.minutos_dobles),h(j.minutos_triples),j.importe_dobles,j.importe_triples,redondearCentavos(j.descanso_adicional+j.ordinario_adicional),j.prima_dominical,j.bruto,j.exento,j.gravado,j.isr,j.neto,j.sbc_variable,
      j.retroactivos.length?j.retroactivos.map(x=>'S'+x.semana_origen+' '+fmtD(x.fecha)).join(', '):'']);
    styles.push(rows[1].map((_,i)=>money.includes(i)?ST.money:i===1||i===2?ST.cell:ST.cellC));
  }
  const t=rows.length+1,ultima=rows.length,suma=k=>redondearCentavos(filas.reduce((s,f)=>s+Number(f.jornada[k]),0));
  rows.push(['TOTAL','','','','',redondearCentavos(filas.reduce((s,f)=>s+h(f.jornada.minutos_dobles),0)),redondearCentavos(filas.reduce((s,f)=>s+h(f.jornada.minutos_triples),0)),
    suma('importe_dobles'),suma('importe_triples'),redondearCentavos(suma('descanso_adicional')+suma('ordinario_adicional')),suma('prima_dominical'),suma('bruto'),suma('exento'),suma('gravado'),suma('isr'),suma('neto'),suma('sbc_variable'),'']);
  styles.push(rows[1].map((_,i)=>money.includes(i)?ST.totalMoney:ST.total));
  rows.push(['Dobles hasta el umbral semanal vigente en la fecha trabajada y triples el excedente (LFT 66-68, reforma DOF 01/05/2026). Descanso semanal u obligatorio laborado: salario doble adicional al ordinario ya incluido (LFT 73 y 75). Exento: salario mínimo 100 % de lo elegible (LISR 93-I); demás 50 % con tope compartido de 5 UMA por semana (93-II); prima dominical hasta 1 UMA por domingo (93-XIV). ISR incremental del periodo con el motor del trabajador (art. 96). SBC variable: triples, dobles fuera de los márgenes, descansos y prima dominical (LSS 27-IX y 30); el SDI no se modifica aquí. Claves SAT de referencia: 019 horas extra (dobles/triples) y 020 prima dominical; el descanso laborado se clasifica en el timbrado según su catálogo vigente.']);
  styles.push(ST.sub);
  const ws=buildSheet(rows,styles,[8,36,22,24,13,10,10,14,14,14,14,14,14,14,12,14,14,20],[{s:{r:0,c:0},e:{r:0,c:17}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:17}}],[{hpt:30},{hpt:32},...filas.map(()=>({hpt:24})),{hpt:24},{hpt:60}]);
  for(const c of ['F','G','H','I','J','K','L','M','N','O','P','Q'])if(ws[c+t]){ws[c+t].t='n';ws[c+t].f=filas.length?`SUM(${c}3:${c}${ultima})`:'0';}
  return ws;
}
/* Campos de la fotografía: sólo existen cuando hay capturas, para que las
   fotografías sin ellas conserven exactamente su huella. */
function jornadaCamposItem(f){
  const j=f&&f.jornada;if(!j)return {};
  return {jornada_bruto:j.bruto,jornada_exento:j.exento,jornada_gravado:j.gravado,jornada_isr:j.isr,jornada_neto:j.neto,jornada_eventos:j.eventos};
}
function jornadaCamposSnapshot(filas){
  const xs=(filas||[]).filter(f=>f.jornada);if(!xs.length)return {};
  const s=k=>redondearCentavos(xs.reduce((a,f)=>a+Number(f.jornada[k]),0));
  return {total_jornada_bruto:s('bruto'),total_jornada_isr:s('isr'),total_jornada_neto:s('neto')};
}
