/* Adaptador de coordinación: conserva intacto proyModelo y sus fórmulas. */
async function proySnapshotIntegrado(sem,periodo){
  const obra=OBRA;if(!obra)throw Error('Selecciona un centro.');
  const source=await window.PLATINUM_FLOWS.call('FUENTE',{obra_id:obra.id,semana:sem});
  if(!await pyDatosFrescos()||OBRA?.id!==obra.id)throw Error('No se pudo preparar con datos actuales.');
  const [desde,hasta]=semRange(sem),{act,fins}=pyCandidatos(desde,hasta,periodo);
  const sources={DESC,DIFS,FINTRANS},audits=await proyLeerFiniquitos(fins);
  if(OBRA?.id!==obra.id||DESC!==sources.DESC||DIFS!==sources.DIFS||FINTRANS!==sources.FINTRANS)throw Error('Cambió el contexto durante el cálculo. Intenta nuevamente.');
  const live=proyModelo(act,fins,'S'+sem,audits);
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
  return {obra_id:obra.id,semana:sem,periodo,snapshot,fuente:source.fuente};
}
if(window.PLATINUM_FLOWS)window.PLATINUM_FLOWS.configure({
  context:()=>({sb,obra:OBRA,workers:WORKERS,empresaNombre:OBRA?razonSocialEmpresa(empresaDeObra(OBRA)):''}),
  $,esc,money,table:ctrlTabla,modal,toast,fullName,capture:proySnapshotIntegrado,
  reload:()=>loadObraData(OBRA.id),go:async id=>{await selectObra(id);if(OBRA?.id!==id)throw Error('No se pudo abrir el centro.');},
  openNoi:ctrlOpenConciliacion,openPayments:openControlPagos,openControl:openControlEmpresarial,
  exportRows:(title,headers,rows,name)=>ctrlExportar(title,headers,rows,name,'FLUJO_INTEGRADO'),
  readReceipt:async doc=>{const r=await sb.storage.from('expedientes').download(doc.archivo);if(r.error||!r.data)throw Error('No se pudo descargar el recibo privado.');
    const bytes=new Uint8Array(await r.data.arrayBuffer());if(doc.hash&&await sha256Hex(bytes)!==doc.hash)throw Error('El archivo no coincide con su huella.');
    const info=parseReciboText(await pdfBytesToText(bytes));if(!info||!Number.isFinite(info.neto)||!['FINIQUITO','SUELDO'].includes(info.tipo))throw Error('Recibo no reconocido; revisión manual requerida.');
    return {neto:info.neto,tipo:info.tipo==='FINIQUITO'?'FINIQUITO':'NOMINA'};}
});
init();
