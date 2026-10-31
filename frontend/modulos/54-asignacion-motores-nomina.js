/* Asignación común: selecciona motor, nunca comparte sus fórmulas de nómina.
   INFONAVIT/FONACOT siguen usando el servicio común de retenciones. */
function motorNominaDe(w){return periodoPago(w)==='QUINCENAL'?'QUINCENAL_V1':'SEMANAL_V1';}
function motorNominaConfiguracion(w){
  return periodoPago(w)==='QUINCENAL'?perfilNominaQuincenal(w):{codigo:'SEMANAL_V1',dias:7,factor_falta:7/6};
}
function contextoIncidenciaNomina(w,sem,periodo){
  if(periodoPago(w)!=='QUINCENAL')return {semana:sem,dias:7,motor:'SEMANAL_V1'};
  const p=periodo?.desde&&periodo?.hasta?periodo:calendarioNominaDe(w,sem);
  return {...p,semana:sem,dias:Math.round((retFecha(p.hasta)-retFecha(p.desde))/86400000)+1,motor:'QUINCENAL_V1'};
}
function calendarioNominaDe(w,sem){
  const n=parseInt(String(sem||'').replace(/\D/g,''))||isoWeek(),rango=semRange(n);
  return periodoPago(w)==='QUINCENAL'?calendarioNominaQuincenal(...rango):calendarioNominaSemanal(...rango);
}
function sueldoNetoPeriodo(sd,sdi,trabajador){
  const w={...trabajador,sd:Number(sd)||0,sdi:Number(sdi)||Number(sdiInicialSugerido(sd))};
  const n=nominaPeriodo(w,{faltas:0});
  return {neto:n.neto,isr:n.isr,imss:n.imssObr,sub:n.subsidio,bruto:n.bruto,periodo:n.periodo,motor:motorNominaDe(w)};
}
function trabajadorNominaFormulario(){
  const id=$('worker-form-body')?.dataset?.workerId,anterior=(typeof WORKERS!=='undefined'?WORKERS:[]).find(w=>w.id===id)||{};
  return {...anterior,obra_id:anterior.obra_id||(typeof OBRA!=='undefined'?OBRA?.id:null),periodo_pago:$('f-periodo_pago')?.value||anterior.periodo_pago||'SEMANAL'};
}
function nominaFormularioPeriodo(){
  const w=trabajadorNominaFormulario(),out=$('h-puesto');
  if(out)out.textContent=`Motor ${periodoPago(w).toLowerCase()} seleccionado. El salario capturado conserva su importe; revisa que corresponda al periodo elegido.`;
}
