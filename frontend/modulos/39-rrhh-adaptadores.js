
/* Referencias documentales: describe resultados del motor existente, no los calcula. */
function rrhhReferenciasModelo(filas,audits,sem,fuente){
  const trabajadores={};
  for(const f of filas){
    const w=f.w,refs={fuente,salario_base_usado:f.sueldo,prevision:f.prevision,retenciones:[]};
    if(f.fin){
      const a=audits.find(x=>x.trabajador_id===w.id&&x.obra_id===w.obra_id&&x.periodo===w.fecha_baja&&x.monto_aplicado!=null&&redondearCentavos(Number(x.monto_aplicado))===f.neto);
      refs.finiquito_origen=a?{tabla:String(a.id).startsWith('hist-')?'historial':'auditoria_calculos_nomina',id:a.id,fecha_baja:w.fecha_baja,monto_aplicado:a.monto_aplicado}:null;
      const keys=['aguinaldo','vacaciones','primaVacacional','prima_vacacional','isr','infonavit','fonacot','salariosPendientes','salarios_pendientes','neto','total'];
      refs.finiquito_detalle=a?Object.fromEntries(keys.filter(k=>typeof a.resultado?.[k]==='number').map(k=>[k,a.resultado[k]])):null;
      refs.retenciones=f.items.map(i=>({tipo:i.tipo,clase:i.clase,monto_usado:i.monto,origen:'FINIQUITO APLICADO'}));
    }else{
      const ds=retencionesDePeriodo(w,sem).ds;
      if(ds.length!==f.items.length)throw Error('Cambió la fuente de retenciones durante la captura. Actualiza e intenta de nuevo.');
      refs.retenciones=f.items.map((i,n)=>{const d=ds[n];if(String(d.tipo||'').toUpperCase()!==i.tipo)throw Error('Las referencias de retenciones no coinciden con el motor.');
        return {tabla:'descuentos',id:d.id,tipo:i.tipo,clase:i.clase,monto_usado:i.monto,estado:i.estado,
          entradas:{monto_capturado:d.monto,recurrente:d.recurrente,periodicidad:d.periodicidad,cuota_mensual:d.cuota_mensual,modalidad:d.modalidad,factor:d.factor,numero_credito:d.numero_credito,prorrateo_fonacot:d.fonacot_prorrateo,
            ajuste_semana:d.ajustes_semana?.[sem]?Object.fromEntries(['importe_base','dias_extra','dias_extra_desde'].filter(k=>d.ajustes_semana[sem][k]!=null).map(k=>[k,d.ajustes_semana[sem][k]])):null,excepcion_semana:d.excepciones?.[sem]||null}};
      });
    }
    trabajadores[w.id]=refs;
  }
  return {version:'REFERENCIAS_ORIGEN_V1',trabajadores};
}
async function rrhhVistaActual(id,sem,permisos){
  const obra=OBRA;if(!obra)throw Error('Selecciona un centro.');
  const before=await window.PLATINUM_FLOWS.call('FUENTE',{obra_id:obra.id,semana:sem});
  if(!await pyDatosFrescos()||OBRA?.id!==obra.id)throw Error('No se pudieron leer las fuentes actuales.');
  const [desde,hasta]=semRange(sem),c=pyCandidatos(desde,hasta,'TODOS'),act=c.act.filter(w=>w.id===id),fins=c.fins.filter(w=>w.id===id),audits=await proyLeerFiniquitos(fins);
  if(OBRA?.id!==obra.id)throw Error('Cambió el centro durante la carga.');
  let modelo=proyModelo(act,fins,'S'+sem,audits);
  if(modelo.filas.some(f=>!f.fin&&f.w.periodo_pago==='QUINCENAL'))modelo=await isrQAplicarModelo(modelo);
  const f=modelo.filas[0];
  if(!f)throw Error('Este trabajador no es candidato a nómina o finiquito de esa semana según las fuentes actuales. No se inventará un importe.');
  const referencias=rrhhReferenciasModelo(modelo.filas,audits,'S'+sem,before.fuente).trabajadores[id];
  if(f.isr_mensual)referencias.isr_mensual=f.isr_mensual;
  const after=await window.PLATINUM_FLOWS.call('FUENTE',{obra_id:obra.id,semana:sem});
  if(OBRA?.id!==obra.id||before.fuente!==after.fuente)throw Error('Una fuente cambió durante la lectura. Actualiza antes de revisar.');
  if(!permisos.vip)delete referencias.prevision;if(!permisos.salud)delete referencias.finiquito_detalle;
  return {trabajador:{id,numero:f.w.no_trab,nombre:fullName(f.w)},origen:'PROYECCIÓN ACTUAL · NO AUTORIZADA',formula_version:MOTOR_NOMINA_VERSION,fuente_cambio:false,referencias,
    modelo:{fin:f.fin,sueldo:f.sueldo,incidencias:f.incidencias,creditos:f.creditos,otras:f.otras,costo:f.costo,neto_fiscal:redondearCentavos(f.neto-f.prevision),prevision:permisos.vip?f.prevision:null,neto_total:permisos.vip?f.neto:null},
    conceptos:f.items.map(i=>({tipo:i.tipo,clase:i.clase,monto:i.monto,estado:i.estado,origen:i.origen})),saldos:[],recibos:[],advertencia:'Proyección actual de las fuentes existentes; no reescribe el pasado ni autoriza el pago. Guarda y concilia un cierre para conservar una fotografía.'};
}
async function rrhhAbrirDocumento(id){
  const initial=OBRA?.id;if(!initial)throw Error('Selecciona un centro.');
  const r=await sb.from('documentos').select('id,obra_id,trabajador_id,archivo,categoria,subtipo,anulado').eq('id',id).single();
  if(r.error||!r.data)throw Error('Documento no encontrado o sin permiso.');
  if(OBRA?.id!==initial)throw Error('Cambió el centro durante la lectura.');
  if(!OBRAS.some(o=>o.id===r.data.obra_id))throw Error('El documento pertenece a un centro fuera de tu alcance.');
  if(r.data.anulado&&!confirm('Este documento está anulado. ¿Abrirlo sólo para consulta histórica?'))return;
  DOCSX=(DOCSX||[]).filter(d=>d.id!==id).concat(r.data);await verDoc(id);
}
async function rrhhAbrirCierre(id){
  const r=await sb.from('control_cierres_nomina').select('id,obra_id').eq('id',id).single();
  if(r.error||!r.data||!OBRAS.some(o=>o.id===r.data.obra_id))throw Error('Cierre no encontrado o fuera de tu alcance.');
  if(OBRA?.id!==r.data.obra_id){await selectObra(r.data.obra_id);if(OBRA?.id!==r.data.obra_id)throw Error('No se pudo abrir el centro del cierre.');}
  return window.PLATINUM_FLOWS.abrirCierre(id);
}
async function rrhhAbrirOrigen(tipo,id,entidad){
  if(tipo==='CIERRES')return openCtrlCierres();
  if(tipo==='IMSS')return id?openFichaIncidentes(id):openCtrlIncidentes();
  if(tipo==='PAGOS')return openControlPagos();
  if(tipo==='CHEQUES'){closeModal();return setView('chq');}
  if(tipo==='HISTORIAL')return openHistorial(id);
  if(tipo==='RETENCIONES')return openDetail(id);
  if(tipo==='IMSS_TRABAJADOR')return openIMSSWorker(id);
  if(tipo==='TRABAJADOR')return openDetail(id);
  throw Error('Este origen no tiene navegación habilitada. Consulta el módulo correspondiente.');
}
if(window.PLATINUM_RRHH)window.PLATINUM_RRHH.configure({
  context:()=>({sb,obra:OBRA,empresaNombre:OBRA?razonSocialEmpresa(empresaDeObra(OBRA)):''}),
  $,esc,money,table:ctrlTabla,modal,toast,week:isoWeek,range:semRange,preview:rrhhVistaActual,
  document:rrhhAbrirDocumento,openClosure:rrhhAbrirCierre,route:rrhhAbrirOrigen
});
