/* Adaptador de coordinación: conserva intacto proyModelo y sus fórmulas. */
async function proySnapshotIntegrado(sem,periodo){
  const obra=OBRA;if(!obra)throw Error('Selecciona un centro.');
  const source=await window.PLATINUM_FLOWS.call('FUENTE',{obra_id:obra.id,semana:sem});
  if(!await pyDatosFrescos()||OBRA?.id!==obra.id)throw Error('No se pudo preparar con datos actuales.');
  const [desde,hasta]=semRange(sem);
  const entradasHistoricas={workers:WORKERS,desc:DESC};
  const historico=periodo==='SEMANAL'&&hasta<today()?await proyLeerContextoHistorico(WORKERS,DESC,obra.id,hasta):null;
  if(OBRA?.id!==obra.id||WORKERS!==entradasHistoricas.workers||DESC!==entradasHistoricas.desc)throw Error('Cambiaron el centro o las fuentes al recuperar el histórico. Vuelve a preparar.');
  let act,fins;
  const padron=WORKERS,ciclos=globalThis._PY_BAJAS_HISTORICAS;
  try{
    if(historico){
      WORKERS=historico.personal.map(w=>{
        const previo=(ciclos||[]).find(h=>h.id===w.id&&h.obra_id===w.obra_id&&h.fecha_baja===w.fecha_baja);
        return previo?{...w,monto_finiquito:previo.monto_finiquito}:w;
      });
      globalThis._PY_BAJAS_HISTORICAS=(ciclos||[]).filter(h=>!WORKERS.some(w=>w.id===h.id&&w.fecha_baja===h.fecha_baja));
    }
    ({act,fins}=pyCandidatos(desde,hasta,periodo));
  }finally{WORKERS=padron;globalThis._PY_BAJAS_HISTORICAS=ciclos;}
  const sources={DESC,DIFS,FINTRANS},audits=await proyLeerFiniquitos(fins);
  if(OBRA?.id!==obra.id||DESC!==sources.DESC||DIFS!==sources.DIFS||FINTRANS!==sources.FINTRANS)throw Error('Cambió el contexto durante el cálculo. Intenta nuevamente.');
  let live,trazabilidad;
  // Modelo y referencias deben consumir la misma fuente, sin await entre ambos.
  // Restaurar DESC antes de documentar mezcla créditos actuales e históricos.
  try{
    if(historico)DESC=historico.descuentos;
    live=proyModelo(act,fins,'S'+sem,audits);
    trazabilidad=rrhhReferenciasModelo(live.filas,audits,'S'+sem,source.fuente);
  }
  finally{DESC=sources.DESC;}
  if(live.filas.some(f=>!f.fin&&f.w.periodo_pago==='QUINCENAL'))live=await isrQAplicarModelo(live);
  for(const f of live.filas)if(f.isr_mensual)trazabilidad.trabajadores[f.w.id].isr_mensual=f.isr_mensual;
  // Sólo los campos necesarios para reproducir las exportaciones, no el expediente personal.
  const fields=['id','obra_id','no_trab','nombres','primer_apellido','segundo_apellido','contratista','puesto','periodo_pago','cuenta','clabe','banco','forma_pago','fecha_baja'];
  const filas=live.filas.map(f=>{const w=Object.fromEntries(fields.map(k=>[k,f.w[k]??null]));return {...f,w,items:f.items.map(i=>({...i,w}))};});
  const modelo={...live,filas,items:filas.flatMap(f=>f.items),act:filas.filter(f=>!f.fin).map(f=>f.w),fins:filas.filter(f=>f.fin).map(f=>f.w)};
  const sum=fn=>redondearCentavos(filas.reduce((a,f)=>a+fn(f),0));
  const snapshot={obra_id:obra.id,empresa_codigo:empresaDeObra(obra),obra:obra.nombre,semana:sem,periodo,desde,hasta,formula_version:MOTOR_NOMINA_VERSION,
    total_nomina:sum(f=>f.fin?0:f.sueldo),total_prevision:sum(f=>f.prevision),total_retenciones:sum(f=>f.fin?0:f.incidencias+f.creditos+f.otras),
    total_finiquitos:sum(f=>f.fin?f.neto:0),total_neto:modelo.neto,total_trabajadores:filas.length,modelo,
    items:filas.map(f=>({trabajador_id:f.w.id,numero:f.w.no_trab,nombre:fullName(f.w),tipo:f.fin?'FINIQUITO':'NOMINA',metodo_pago:f.pago,
      sueldo_nomina:f.sueldo,prevision_social:f.prevision,retenciones:f.fin?0:redondearCentavos(f.incidencias+f.creditos+f.otras),monto:f.neto}))};
  snapshot.trazabilidad=trazabilidad;
  if(historico)snapshot.contexto_historico=historico.trazabilidad;
  return {obra_id:obra.id,semana:sem,periodo,snapshot,fuente:source.fuente};
}
async function leerReciboArchivado(doc,bytesCapturados=null){
  let bytes;
  if(bytesCapturados)bytes=new Uint8Array(bytesCapturados);
  else{const r=await sb.storage.from('expedientes').download(doc.archivo);if(r.error||!r.data)throw Error('No se pudo descargar el recibo privado. '+(r.error?.message||''));bytes=new Uint8Array(await r.data.arrayBuffer());}
  if(doc.hash&&await sha256Hex(bytes)!==doc.hash)throw Error('El PDF almacenado no coincide con la huella registrada. Debe cotejarse el archivo original; usar Gemini no resuelve una huella distinta.');
  const info=window.PLATINUM_RESPALDO_RECIBO?.parsear(await pdfBytesToText(bytes));
  if(!info)throw Error('No está disponible el lector tradicional de recibos. Actualiza la plataforma.');
  if(info.errores?.length)throw Error(info.errores.join('; '));
  const faltan=[!Number.isFinite(info.neto)&&'neto',info.datos.recibos!==1&&'un único recibo',(!info.datos.periodo_inicio||!info.datos.periodo_fin)&&'fechas del periodo',!info.datos.identificadores.length&&'identificadores',info.datos.percepciones==null&&'percepciones',info.datos.deducciones==null&&'deducciones'].filter(Boolean);
  if(faltan.length)throw Error('Lectura tradicional incompleta: '+faltan.join(', ')+'. Revisa el original o usa Gemini y confirma la propuesta.');
  return info;
}
if(window.PLATINUM_FLOWS)window.PLATINUM_FLOWS.configure({
  context:()=>({sb,obra:OBRA,workers:WORKERS,empresaNombre:OBRA?razonSocialEmpresa(empresaDeObra(OBRA)):''}),
  $,esc,money,table:ctrlTabla,modal,toast,fullName,capture:proySnapshotIntegrado,
  reload:()=>loadObraData(OBRA.id),go:async id=>{await selectObra(id);if(OBRA?.id!==id)throw Error('No se pudo abrir el centro.');},
  openNoi:ctrlOpenConciliacion,openPayments:openControlPagos,openControl:openControlEmpresarial,
  exportRows:(title,headers,rows,name)=>ctrlExportar(title,headers,rows,name,'FLUJO_INTEGRADO'),
  readReceipt:leerReciboArchivado
});
init();
