/* Lecturas derivadas del recorrido. Los importes proceden de versiones guardadas. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PLATINUM_RECORRIDO_CORE=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  function centavos(value){
    if(value==null||value==='')return null;
    const m=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
    if(!m)return null;
    const n=Number(m[2])*100+Number((m[3]||'').padEnd(2,'0'));
    return Number.isSafeInteger(n)?(m[1]?-n:n):null;
  }
  const restar=(a,b)=>a==null||b==null?null:a-b;
  const fechas=s=>[s.desde,s.hasta].every(v=>/^\d{4}-\d\d-\d\d$/.test(v))&&s.desde<=s.hasta;
  function indexar(items){
    const m=new Map();
    for(const item of items){
      if(!item.trabajador_id||!['NOMINA','FINIQUITO','PREVISION_SOCIAL'].includes(item.tipo))throw Error('La versión contiene una fila sin identidad o concepto comprobable.');
      const key=JSON.stringify([item.trabajador_id,item.tipo,item.ciclo_id||item.fecha_inicio_ciclo||null]);
      if(m.has(key))throw Error('Hay identidades y conceptos repetidos sin ciclo inequívoco. Revisa la fotografía de origen.');
      m.set(key,item);
    }
    return m;
  }
  function importes(item){
    const neto=centavos(item?.monto),prevision=centavos(item?.prevision_social);
    return {
      neto,prevision,
      fiscal:item?.tipo==='PREVISION_SOCIAL'?null:(centavos(item?.neto_fiscal)??restar(neto,prevision)),
      retenciones:centavos(item?.retenciones),
      sueldo:centavos(item?.sueldo_nomina)
    };
  }
  function comparar(a,b){
    if(!a?.id||!b?.id||a.id===b.id)throw Error('Selecciona dos versiones distintas.');
    const x=a.snapshot,y=b.snapshot;
    if(!x||!y||a.obra_id!==b.obra_id||x.obra_id!==a.obra_id||y.obra_id!==b.obra_id||
      !x.empresa_codigo||x.empresa_codigo!==y.empresa_codigo||!x.periodo||x.periodo!==y.periodo||
      !fechas(x)||!fechas(y)||!Array.isArray(x.items)||!Array.isArray(y.items))throw Error('Las versiones deben documentar el mismo centro, empresa y periodicidad, con intervalos y filas verificables.');
    const prev=indexar(x.items),next=indexar(y.items);
    const filas=[...new Set([...prev.keys(),...next.keys()])].map(k=>{
      const p=prev.get(k),q=next.get(k),item=q||p;
      const anterior=importes(p),actual=importes(q),diferencia={};
      for(const c of Object.keys(anterior))diferencia[c]=restar(actual[c],anterior[c]);
      const cambio=!p?'Sólo en B':!q?'Sólo en A':
        Object.values(diferencia).some(v=>v!=null&&v!==0)?'Cambió':
        Object.values(diferencia).some(v=>v==null)?'Desglose incompleto':'Igual';
      return {numero:item.numero,nombre:item.nombre,tipo:item.tipo,anterior,actual,diferencia,cambio,
        porcentaje:anterior.neto>0&&diferencia.neto!=null?diferencia.neto/anterior.neto*100:null};
    }).sort((p,q)=>(Number(p.numero)||0)-(Number(q.numero)||0)||String(p.tipo).localeCompare(q.tipo));
    return {filas,intervaloDistinto:x.desde!==y.desde||x.hasta!==y.hasta};
  }
  function obligaciones(d,vip){
    const detalle=d?.detalle,version=detalle?.flujo?.version_id;
    if(!version||detalle.cierre?.obra_id!==d.obra_id||detalle.cierre.semana!==d.semana)return [];
    const aplicaciones=new Map();
    for(const x of detalle.aplicaciones||[]){
      // El saldo canónico incluye aplicaciones vigentes de la obligación lógica tras una reapertura.
      if(x.obra_id!==d.obra_id||x.retirado_en||!x.obligacion_id)continue;
      const xs=aplicaciones.get(x.obligacion_id)||[];
      xs.push(x);
      aplicaciones.set(x.obligacion_id,xs);
    }
    return (detalle.saldos||[]).filter(x=>x.vigente===true&&x.cierre_id===detalle.cierre.id&&
      x.version_id===version&&x.obra_id===d.obra_id&&(vip||x.tipo!=='PREVISION_SOCIAL'))
      .map(o=>({o,aplicaciones:aplicaciones.get(o.id)||[]}));
  }
  return Object.freeze({centavos,comparar,obligaciones});
});
