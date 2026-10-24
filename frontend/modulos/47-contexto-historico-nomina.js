/* Entradas históricas de cierres: no escribe fichas, créditos, pagos ni fórmulas.
   El flujo conserva vista previa y aprobación de cada regularización. */
async function proyLeerContextoHistorico(personal,descuentos,obraId,hasta){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(hasta||'')||!obraId)throw Error('Periodo histórico inválido.');
  const corte=new Date(hasta+'T23:59:59.999-06:00').toISOString();
  const semanales=new Set(personal.filter(w=>w.obra_id===obraId&&(w.periodo_pago||'SEMANAL')==='SEMANAL').map(w=>w.id));
  const futuros=personal.filter(w=>semanales.has(w.id)&&w.fecha_alta<=hasta&&w.fecha_reingreso>hasta);
  const creditos=descuentos.filter(d=>semanales.has(d.trabajador_id)&&d.obra_id===obraId&&d.recurrente&&['INFONAVIT','FONACOT'].includes(d.tipo));
  const leer=async(ids,acciones,columns,antes)=>{
    const out=[];ids=[...new Set(ids)];
    for(let i=0;i<ids.length;i+=80){
      const lote=ids.slice(i,i+80),r=await fetchAllRows(()=>{
        let q=sb.from('historial').select(columns).eq('obra_id',obraId).in('trabajador_id',lote).in('accion',acciones);
        if(antes)q=q.lte('fecha',corte);
        return q.order('fecha',{ascending:false}).order('id',{ascending:false});
      });
      if(r.error||!Array.isArray(r.data))throw Error('No se pudo recuperar la fuente histórica completa. '+(r.error?.message||'Respuesta incompleta.'));
      out.push(...r.data);
    }
    return out;
  };
  const [laboral,credito]=await Promise.all([
    leer(futuros.map(w=>w.id),['ALTA','MODIFICACION','BAJA','REACTIVACION'],
      'id,obra_id,trabajador_id,fecha,alta:datos_despues->>fecha_alta,baja:datos_despues->>fecha_baja,reingreso:datos_despues->>fecha_reingreso,estado:datos_despues->>estatus,monto:datos_despues->>monto_finiquito',false),
    leer(creditos.map(d=>d.trabajador_id),['DESCUENTO-ALTA','DESCUENTO-MODIFICACION','DESCUENTO-ELIMINACION'],
      'id,obra_id,trabajador_id,fecha,accion,datos_antes,datos_despues',false)
  ]);
  return proyResolverContextoHistorico(personal,descuentos,{obra_id:obraId,hasta,corte,laboral,credito});
}
function proyResolverContextoHistorico(personal,descuentos,contexto){
  const {obra_id:obraId,hasta,corte,laboral,credito}=contexto;
  const fecha=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'');
  const ordenar=xs=>xs.slice().sort((a,b)=>Date.parse(b.fecha)-Date.parse(a.fecha)||Number(b.id)-Number(a.id));
  const referencias=[],cambios=[];
  const workers=personal.map(w=>{
    if(w.obra_id!==obraId||(w.periodo_pago||'SEMANAL')!=='SEMANAL'||!w.fecha_alta||w.fecha_alta>hasta||!w.fecha_reingreso||w.fecha_reingreso<=hasta)return w;
    // Una baja capturada el miércoles siguiente conserva su fecha efectiva:
    // no se confunde la fecha de captura con la vigencia del movimiento.
    const h=ordenar(laboral.filter(h=>h.obra_id===obraId&&h.trabajador_id===w.id&&fecha(h.alta)&&h.alta<=hasta
      &&(!h.baja||fecha(h.baja)&&h.baja<=hasta)&&(!h.reingreso||fecha(h.reingreso)&&h.reingreso<=hasta)
      &&['ACTIVO','BAJA','PENDIENTE'].includes(h.estado)))[0];
    if(!h)throw Error(`No hay historial laboral verificable para #${w.no_trab} al ${hasta}. No se supondrá que trabajó.`);
    referencias.push({clase:'CICLO_LABORAL',historial_id:h.id,trabajador_id:w.id});
    cambios.push({clase:'CICLO_LABORAL',trabajador_id:w.id,numero:w.no_trab});
    if(h.monto!=null&&h.monto!==''&&(!Number.isFinite(Number(h.monto))||Number(h.monto)<0))throw Error('Finiquito histórico inválido.');
    return {...w,estatus:h.estado,fecha_alta:h.alta,fecha_baja:fecha(h.baja)?h.baja:null,fecha_reingreso:fecha(h.reingreso)?h.reingreso:null,
      monto_finiquito:h.estado==='BAJA'&&h.monto!=null&&h.monto!==''?Number(h.monto):null};
  });
  const desc=descuentos.map(d=>{
    if(d.obra_id!==obraId||!d.recurrente||!['INFONAVIT','FONACOT'].includes(d.tipo)
      ||!personal.some(w=>w.id===d.trabajador_id&&(w.periodo_pago||'SEMANAL')==='SEMANAL'))return d;
    if(d.tipo==='INFONAVIT'&&d.infonavit_avisos_historial?.length){
      if(typeof infonavitCreditoAFecha!=='function')throw Error('No se pudo resolver la vigencia del aviso INFONAVIT.');
      return infonavitCreditoAFecha(d,hasta);
    }
    const historial=ordenar(credito.filter(h=>h.obra_id===obraId&&h.trabajador_id===d.trabajador_id
      &&(h.datos_despues?.id===d.id||h.datos_antes?.id===d.id)));
    const anterior=historial.find(h=>Date.parse(h.fecha)<=Date.parse(corte)&&h.datos_despues?.id===d.id);
    let h=anterior,v=h?.datos_despues;
    if(!v){
      if(d.created_at&&Date.parse(d.created_at)>Date.parse(corte))return {...d,activo:false};
      h=historial.filter(h=>Date.parse(h.fecha)>Date.parse(corte)&&h.datos_antes?.id===d.id).at(-1);v=h?.datos_antes;
    }
    if(!v){
      if(d.updated_at&&Date.parse(d.updated_at)>Date.parse(corte))throw Error(`El crédito ${d.tipo} cambió después del periodo y no tiene una versión histórica verificable.`);
      return d;
    }
    if(v.id!==d.id||v.trabajador_id!==d.trabajador_id||v.obra_id!==obraId||v.tipo!==d.tipo||typeof v.activo!=='boolean')throw Error('La versión histórica del crédito no corresponde al trabajador y centro.');
    referencias.push({clase:'CREDITO',historial_id:h.id,descuento_id:d.id});
    // Ajustes explícitos por semana/periodo son correcciones deliberadas.
    const out={...d,...v,ajustes_semana:{...(v.ajustes_semana||{}),...(d.ajustes_semana||{})},excepciones:{...(v.excepciones||{}),...(d.excepciones||{})}};
    if(['activo','monto','factor','cuota_mensual','modalidad','periodicidad'].some(k=>JSON.stringify(out[k]??null)!==JSON.stringify(d[k]??null)))cambios.push({clase:'CREDITO',trabajador_id:d.trabajador_id,descuento_id:d.id});
    return out;
  });
  return {personal:workers,descuentos:desc,trazabilidad:{version:1,obra_id:obraId,hasta,corte,referencias,cambios}};
}
