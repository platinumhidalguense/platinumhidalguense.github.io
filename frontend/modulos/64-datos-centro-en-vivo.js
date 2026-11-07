/* Réplica de la sesión activa. Los cambios visuales pendientes nunca entran al motor. */
(function(){
 'use strict';
 const tablas={
  trabajadores:[()=>WORKERS,v=>{WORKERS=v;}],cheques:[()=>CHEQUES,v=>{CHEQUES=v;}],
  descuentos:[()=>DESC,v=>{DESC=v;}],documentos:[()=>DOCSX,v=>{DOCSX=v;}],
  vacaciones:[()=>VAC,v=>{VAC=v;}],actas:[()=>ACTAS,v=>{ACTAS=v;}],nom035:[()=>NOM,v=>{NOM=v;}],
  pagos:[()=>PAGOS,v=>{PAGOS=v;}],prima_pagos:[()=>PRIMAS,v=>{PRIMAS=v;}],
  cuadrillas:[()=>CUADS,v=>{CUADS=v;}],diferenciales:[()=>DIFS,v=>{DIFS=v;}],
  bloques_cheques:[()=>BLOQUES,v=>{BLOQUES=v;}],sueldos_internos:[()=>SUELDOSINT,v=>{SUELDOSINT=v;}],
  control_cierres_nomina:[()=>CIERRES,v=>{CIERRES=v;}],
  control_conciliacion_noi:[()=>CTRLNOI,v=>{CTRLNOI=v;}],
  control_altas_bajas_cortas:[()=>ALTAS_CORTAS,v=>{ALTAS_CORTAS=v;}],
  control_finiquitos_transferencia:[()=>FINTRANS,v=>{FINTRANS=v;}]
 };
 const campos='id obra_id no_trab nombres primer_apellido segundo_apellido estatus contratista puesto periodo_pago semana_ingreso fecha_alta fecha_baja fecha_reingreso movimiento_imss fecha_mov_imss curp rfc nss telefono correo updated_at'.split(' ');
 const acuse=d=>String(d?.categoria||'').trim().toUpperCase()==='ACUSE_IMSS';
 const llaves=()=>[OBRA?.id,USER?.id].join(':');
 let scope='',orden=new Map(),op=new Map(),pendientes=new Set(),paginas=new Map(),frame=false;
 const lecturas=new Set();
 function reiniciar(){scope=llaves();orden=new Map();op=new Map();pendientes=new Set();paginas=new Map();for(const t of lecturas)t.cancelado=true;lecturas.clear();}
 function comprobar(){if(scope!==llaves())reiniciar();}
 function iniciar(){comprobar();const t={scope,eventos:[],cancelado:false};lecturas.add(t);return t;}
 function cerrar(t){if(t)lecturas.delete(t);}
 const fecha=v=>(Date.parse(v||'')||0)+(Number((String(v||'').match(/\.\d{3}(\d{1,3})/)?.[1]||'').padEnd(3,'0'))||0)/1000;
 function publicar(t,rows,n,padron=false){
  if(!t||t.cancelado||t.scope!==llaves())return rows;
  for(const e of t.eventos)if(e.tabla===n)rows=combinar(rows,e,padron);
  return rows;
 }
 function cache(n){return tablas[n]?.[0]();}
 function combinar(rows,e,padron){
  const i=rows.findIndex(r=>r.id===e.id),prev=rows[i],n=e.tabla;
  if(prev&&e.fila&&fecha(prev.updated_at)>fecha(e.fila.updated_at)&&fecha(e.fila.updated_at))return rows;
  if(prev&&e.borrar&&e.stamp&&fecha(prev.updated_at)>e.stamp)return rows;
  const q=e.fila,obra=OBRA?.id;
  const docAcuse=n==='documentos'&&acuse(q||prev),docVisible=docAcuse&&WORKERS.some(w=>w.id===(q||prev).trabajador_id);
  const sale=e.borrar||!q||(q.obra_id&&q.obra_id!==obra&&!docVisible)
   ||(['trabajadores','cheques'].includes(n)&&q.eliminado)
   ||(n==='documentos'&&(q.anulado||(padron&&!docAcuse)))
   ||(['diferenciales','prima_pagos'].includes(n)&&q.activo===false);
  if(sale)return i<0?rows:rows.filter((_,j)=>j!==i);
  let fila={...prev,...q};
  if(n==='trabajadores'&&padron){fila=Object.fromEntries(campos.map(k=>[k,fila[k]??null]));fila.cuenta=String(q.cuenta||'').toUpperCase()==='CREAR'?'CREAR':null;}
  if(docAcuse&&padron)fila=Object.fromEntries('id obra_id trabajador_id categoria subtipo fecha_doc anulado'.split(' ').map(k=>[k,fila[k]??null]));
  if(n==='control_altas_bajas_cortas')fila=Object.fromEntries('id obra_id trabajador_id anio semana estado_servicio'.split(' ').map(k=>[k,fila[k]??null]));
  if(prev&&Object.keys(fila).length===Object.keys(prev).length&&Object.keys(fila).every(k=>Object.is(fila[k],prev[k])))return rows;
  if(i<0)return rows.concat(fila);
  const next=rows.slice();next[i]=fila;return next;
 }
 function mostrar(n){
  pendientes.add(n);
  if(frame)return;frame=true;const vigente=llaves();
  (window.requestAnimationFrame||((fn)=>Promise.resolve().then(fn)))(()=>{
   frame=false;if(vigente!==llaves()){if(pendientes.size)mostrar(pendientes.values().next().value);return;}
   const cambios=pendientes;pendientes=new Set();
   if(OBRA_DATOS_ID!==OBRA?.id||NAV_STEP!=='trabajadores')return;
   if(VIEW==='trab'&&[...cambios].some(t=>['trabajadores','documentos','control_altas_bajas_cortas'].includes(t))){
    const scroll=document.querySelector('.worker-list'),top=scroll?.scrollTop,left=scroll?.scrollLeft;
    actualizarFiltrosPadron();renderTable();if(scroll){scroll.scrollTop=top;scroll.scrollLeft=left;}
   }
   if(VIEW==='conciliador')window.PLATINUM_CONCILIADOR_SEMANAL?.montar();
   else if(VIEW==='vac'&&cambios.has('vacaciones')||VIEW==='actas'&&cambios.has('actas')||VIEW==='nom'&&cambios.has('nom035'))pintarVistaObra();
  });
 }
 function aplicar(p){
  comprobar();
  if(!OBRA||!USER)return true;
  let tabla=p.table,q=p.new?.id?p.new:null,id=q?.id||p.old?.id,borrar=p.eventType==='DELETE';
  if(tabla==='incidencias_empleados'){
   if(!q||q.obra_id===OBRA.id)window.PLATINUM_CALENDARIO?.eventoEnVivo(p);
   return true;
  }
  if(tabla==='control_eventos_integracion'){
   if(!q||q.obra_id!==OBRA.id)return true;
   if(q.accion==='SALIDA_CENTRO'){
    tabla=q.tabla;id=q.entidad_id;q=null;borrar=true;
   }else{
    if(['control_pago_aplicaciones','control_obligaciones_pago','control_evidencias_pago','control_flujo_cierres'].includes(q.tabla))window.PLATINUM_CONCILIADOR_SEMANAL?.invalidarDerivados?.();
    return true;
   }
  }
  if(tabla==='obras')return false;
  if(!tablas[tabla]||!id)return true;
  // Un cierre puede exceder el tamaño de fila de Realtime: no sustituir la
  // fotografía con un payload parcial. El flujo vuelve a leer sólo ese alcance.
  if(tabla==='control_cierres_nomina')return !OBRA_CARGA_COMPLETA||!!(q?.obra_id&&q.obra_id!==OBRA.id);
  const current=cache(tabla),known=OBRA_DATOS_ID===OBRA.id&&current.some(r=>r.id===id);
  const docRelacionado=tabla==='documentos'&&acuse(q)&&WORKERS.some(w=>w.id===q.trabajador_id&&w.obra_id===OBRA.id);
  if(q?.obra_id!==OBRA.id&&!known&&!docRelacionado&&!borrar&&!(lecturas.size&&tabla==='documentos'&&acuse(q)))return true;
  if(borrar&&!known&&!lecturas.size)return true;
  const stamp=fecha(p.commit_timestamp),e={tabla,id,fila:q,borrar,stamp},key=tabla+':'+id;
  if(stamp&&stamp<(orden.get(key)||0))return true;
  if(stamp)orden.set(key,stamp);
  for(const t of lecturas)if(t.scope===scope)t.eventos.push(e);
  if(OBRA_DATOS_ID!==OBRA.id||!OBRA_CARGA_COMPLETA&&!['trabajadores','documentos','control_altas_bajas_cortas'].includes(tabla))return true;
  const next=combinar(current,e,!OBRA_CARGA_COMPLETA);
  if(next!==current){tablas[tabla][1](next);mostrar(tabla);}
  return true;
 }
 function vista(tabla,rows){
  comprobar();if(!op.size)return rows;
  return rows.map(r=>{const e=op.get(tabla+':'+r.id);return e?{...r,...e.cambios,_pendiente_visual:true}:r;});
 }
 function pagina(tabla,rows,host,filtro,dibujar,tamano){
  if(!host)return rows;comprobar();
  const previa=paginas.get(tabla),total=Math.max(1,Math.ceil(rows.length/tamano));
  const estado={filtro,n:previa?.filtro===filtro?Math.min(previa.n,total-1):0};
  paginas.set(tabla,estado);host.hidden=total===1;
  if(total>1){
   const desde=estado.n*tamano+1,hasta=Math.min(rows.length,(estado.n+1)*tamano);
   host.innerHTML='<button type="button" class="btn" '+(!estado.n?'disabled':'')+'>Anterior</button><span aria-live="polite">'+desde+'–'+hasta+' de '+rows.length+'</span><button type="button" class="btn" '+(estado.n===total-1?'disabled':'')+'>Siguiente</button>';
   const buttons=host.querySelectorAll('button');buttons.forEach((b,i)=>{b.onclick=()=>{estado.n+=i===0?-1:1;dibujar();const sc=host.parentElement?.querySelector('.worker-list,.cs-registros');if(sc)sc.scrollTop=0;};});
  }else host.innerHTML='';
  return rows.slice(estado.n*tamano,(estado.n+1)*tamano);
 }
 async function optimista(tabla,base,cambios,guardar){
  comprobar();const ctx=scope,key=tabla+':'+base.id,token={cambios};
  if(op.has(key))throw Error('Este registro ya se está guardando');
  op.set(key,token);mostrar(tabla);
  try{
   const result=await guardar(),r=Array.isArray(result?.data)?result.data[0]:result?.data;
   if(result?.error)throw Object.assign(Error(result.error.message),{code:result.error.code});
   if(!r||r.id!==base.id||r.obra_id!==base.obra_id)throw Error('La base no confirmó el registro; actualiza antes de repetir');
   if(ctx===llaves())aplicar({table:tabla,eventType:'UPDATE',new:r});
   return r;
  }finally{if(ctx===llaves()&&op.get(key)===token){op.delete(key);mostrar(tabla);}}
 }
 async function revalidarDescuentos(id){
  if(!OBRA_CARGA_COMPLETA||OBRA_DATOS_ID!==OBRA?.id)return;
  const obra=OBRA.id,t=iniciar();
  try{
   const r=await fetchAllRows(()=>sb.from('descuentos').select('*').eq('obra_id',obra).eq('trabajador_id',id));
   if(t.cancelado||t.scope!==llaves())return;
   if(r.error||!Array.isArray(r.data)){toast('No se pudieron confirmar las retenciones en pantalla. Usa ↻ para actualizar.','err');return;}
   const parciales={...t,eventos:t.eventos.filter(e=>e.fila?.trabajador_id===id||r.data.some(x=>x.id===e.id))};
   DESC=DESC.filter(x=>x.trabajador_id!==id).concat(publicar(parciales,r.data,'descuentos'));mostrar('descuentos');
  }finally{cerrar(t);}
 }
 window.PLATINUM_DATOS=Object.freeze({iniciar,cerrar,publicar,cache,aplicar,vista,pagina,optimista,reiniciar,mostrar,revalidarDescuentos});
})();
