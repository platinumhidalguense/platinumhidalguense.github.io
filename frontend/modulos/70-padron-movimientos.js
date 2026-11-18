/* Una fila por trabajador; consulta histórica bajo demanda, sin operaciones laborales. */
(function(){
 'use strict';
 const movimientos={altas:['ALTA','fecha_alta'],bajas:['BAJA','fecha_baja'],reingresos:['REINGRESO','fecha_reingreso']};
 let cuad=null,alcance=null,generacion=0;
 const historiales=new Map();
 const api=()=>window.PLATINUM_PERSONAL;
 const fecha=v=>fechaAcuseISO(v);
 function hoyLocal(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 }
 function enRango(f,desde,hasta){return !!f&&(!desde||f>=desde)&&(!hasta||f<=hasta);}
 function programado(w,hoy=hoyLocal()){
  if(w.fecha_reingreso&&w.fecha_reingreso>hoy&&w.estatus==='ACTIVO')return 'Reingreso programado';
  if(!w.fecha_reingreso&&w.fecha_alta&&w.fecha_alta>hoy&&['ACTIVO','PENDIENTE'].includes(w.estatus))return 'Alta programada';
  return '';
 }
 function filasMovimientos(clase,personal,historial,desde,hasta,obra,hoy,especial=false){
  const [tipo,campo]=movimientos[clase],personas=new Map(personal.map(w=>[w.id,w])),salida=new Map();
  const registrar=(w,f,h)=>{
   const identificador=h?.trabajador_id??w.id;
   const registro={w,h,tipo,fecha:f,programado:!!f&&tipo!=='BAJA'&&f>hoy};
   const llave=identificador+'|'+tipo+'|'+(f||'sin-fecha-'+(h?.id||'actual'));
   if(!salida.has(llave)||h)salida.set(llave,registro);
  };
  for(const w of personal){
   if(w.obra_id!==obra||w.eliminado)continue;
   const f=fecha(w[campo]);
   if(especial){
    if(clase==='bajas'&&w.estatus==='BAJA'||clase==='altas'&&(w.estatus==='PENDIENTE'||programado(w,hoy)==='Alta programada')||clase==='reingresos'&&programado(w,hoy)==='Reingreso programado')registrar(w,f);
   }else if(enRango(f,desde,hasta)||!f&&clase==='bajas'&&w.estatus==='BAJA'||!f&&clase==='altas'&&w.estatus==='PENDIENTE')registrar(w,f);
  }
  if(especial)return [...salida.values()];
  for(const h of historial){
   if(h.obra_id!==obra||!h.trabajador_id)continue;
   const w=personas.get(h.trabajador_id);
   if(!w)continue; // expediente retirado o fuera del alcance vigente
   const f=fecha(h.efectiva),antes=fecha(h.anterior);
   const canon=clase==='reingresos'?h.accion==='REACTIVACION':h.accion===tipo;
   if(!canon&&h.accion!=='MODIFICACION'&&!(clase==='reingresos'&&h.accion==='CORRECCION_REINGRESO'))continue;
   const cambio=!!f&&f!==antes;
   if(!canon&&!cambio)continue;
   if(clase==='bajas'&&!canon&&h.estado!=='BAJA')continue;
   if(cambio&&antes&&(clase==='altas'||h.estado===h.estado_anterior)){
    salida.delete(w.id+'|'+tipo+'|'+antes); // corrección de fecha del mismo movimiento
   }
   if(enRango(f,desde,hasta)||!f&&canon&&enRango(fecha(h.fecha),desde,hasta))registrar(w,f,h);
  }
  return [...salida.values()];
 }
 function ajustarAlcance(){
  const c=api().contexto();
  if(c!==alcance){alcance=c;historiales.clear();cuad=null;}
  return c;
 }
 function idCuadrilla(w){return Object.hasOwn(w,'id_cuadrilla')?w.id_cuadrilla:cuad?.asignacion?.get(w.id);}
 function equipo(w){return CUADS.find(c=>c.id===idCuadrilla(w))?.nombre||'';}
 function catalogoCuadrillas(){
  const c=ajustarAlcance(),obra=OBRA.id;
  if(cuad||OBRA_CARGA_COMPLETA)return;
  const s={estado:'leyendo'};cuad=s;
  Promise.all([
   api().cuadrillas(c),
   api().leer('trabajadores','cuadrillas:'+obra,q=>q.select('id,id_cuadrilla,updated_at').eq('obra_id',obra).eq('eliminado',false))
  ]).then(([,r])=>{
   if(!api().vigente(c)||cuad!==s)return;
   s.asignacion=new Map(r.filas.map(w=>[w.id,w.id_cuadrilla]));s.estado='ok';
  }).catch(e=>{if(cuad===s){s.estado='error';s.error=e.message;}})
  .finally(()=>{if(api().vigente(c)&&cuad===s&&VIEW==='trab')window.PLATINUM_DATOS?.mostrar('trabajadores');});
 }
 function dibujarCuadrillas(){
  const sel=$('flt-cuadrilla'),info=$('padron-cuadrillas-estado');
  const opciones=CUADS.filter(c=>c.obra_id===OBRA.id).map(c=>[c.id,c.nombre+(c.activa===false?' (histórica)':'')]);
  const previo=sel.value,html='<option value="">Cuadrilla: todas</option>'+opciones.map(([id,n])=>'<option value="'+esc(id)+'">'+esc(n)+'</option>').join('');
  if(sel._html!==html){sel.innerHTML=html;sel._html=html;if(opciones.some(x=>x[0]===previo))sel.value=previo;}
  sel.disabled=!OBRA_CARGA_COMPLETA&&cuad?.estado!=='ok';
  info.textContent=cuad?.estado==='error'?'Cuadrillas no verificadas.':cuad?.estado==='leyendo'?'Consultando cuadrillas…':'';
  $('padron-reintentar-cuadrillas').hidden=cuad?.estado!=='error';
 }
 function coincideCuadrilla(w){
  const id=$('flt-cuadrilla')?.value;
  return !id||idCuadrilla(w)===id;
 }
 function historialDe(w){const h=historiales.get(w.id);return h?.version===w.updated_at?h:null;}
 function movimientosDe(w,filas){
  const obra=OBRA.id,hoy=hoyLocal(),revertidas=new Set(filas.filter(h=>h.accion==='BAJA_REVERTIDA').map(h=>String(h.reversion_historial_id)));
  const resultado=[];
  for(const clase of Object.keys(movimientos)){
   const campo=movimientos[clase][1];
   const historial=filas.map(h=>({...h,efectiva:h[campo],anterior:h['antes_'+campo]}));
   for(const r of filasMovimientos(clase,[w],historial,'0001-01-01','9999-12-31',obra,hoy)){
    const revertida=clase==='bajas'&&r.h&&revertidas.has(String(r.h.id));
    resultado.push({...r,revertida});
   }
  }
  return resultado.sort((a,b)=>(a.fecha||'9999-12-31').localeCompare(b.fecha||'9999-12-31')||String(a.h?.id||'').localeCompare(String(b.h?.id||''),undefined,{numeric:true}));
 }
 function fechaTexto(f){return fecha(f)?fmtD(fecha(f)):'—';}
 function contenidoHistorial(w,h){
  if(!h||h.estado==='leyendo')return '<p role="status">Consultando movimientos de este trabajador…</p>';
  if(h.estado==='error')return '<p role="alert">No se pudo verificar el historial: '+esc(h.error)+'</p><button type="button" class="btn" data-padron-refrescar="'+esc(w.id)+'">Reintentar</button>';
  const filas=movimientosDe(w,h.filas);
  const registros=filas.map(r=>{
   const tipo=r.revertida?'Baja revertida':r.tipo==='BAJA'?(w.estatus==='BAJA'&&r.fecha===fecha(w.fecha_baja)?'Baja vigente':'Baja histórica'):r.tipo==='REINGRESO'?'Reingreso':'Alta registrada';
   return '<li><span>'+esc(tipo)+(r.programado?' · programado':'')+'</span><time>'+fechaTexto(r.fecha)+'</time>'+(r.h?.fecha?'<small>Captura: '+fechaTexto(r.h.fecha)+'</small>':'')+'</li>';
  }).join('');
  return '<p class="padron-hist-fechas">Movimientos de este centro · fechas efectivas<br>Alta registrada: '+fechaTexto(w.fecha_alta)+(w.fecha_reingreso?' · Reingreso del ciclo registrado: '+fechaTexto(w.fecha_reingreso):'')+'</p><ol class="padron-hist-movimientos">'+(registros||'<li>Sin movimientos laborales registrados.</li>')+'</ol><button type="button" class="btn" data-padron-refrescar="'+esc(w.id)+'">Actualizar historial</button><button type="button" class="btn" data-padron-seccion="historial" data-worker-id="'+esc(w.id)+'">Historial detallado</button>';
 }
 function estadoLaboral(w,reingresos=0){
  const programacion=programado(w),antecedente=w.estatus==='ACTIVO'&&(w.fecha_reingreso||reingresos);
  return '<span class="badge '+esc(w.estatus)+'">'+esc(w.estatus||'—')+'</span>'+(antecedente&&!programacion?'<small>Con reingreso</small>':'')+(programacion?'<small>'+esc(programacion)+'</small>':'')+(w._pendiente_visual?'<small>Guardando…</small>':'');
 }
 function actualizarDetalle(w,detalle,h){
  const n=h?.estado==='ok'?movimientosDe(w,h.filas).filter(r=>r.tipo==='REINGRESO').length:null;
  detalle.querySelector('summary').textContent=n===null?'Ver historial':'Ver historial · '+n+' reingreso'+(n===1?'':'s');
  detalle.querySelector('[data-padron-hist-cuerpo]').innerHTML=contenidoHistorial(w,h);
  if(h?.estado==='ok'){const movs=movimientosDe(w,h.filas),ultima=movs.filter(r=>r.tipo==='REINGRESO').map(r=>r.fecha).filter(Boolean).sort().at(-1)||w.fecha_reingreso;const row=detalle.closest('tr');row.querySelector('[data-padron-ultima]').textContent=fechaTexto(ultima);row.querySelector('[data-activity-field=ESTATUS]').innerHTML=estadoLaboral(w,n);}
 }
 async function consultarHistorial(id,detalle,forzar=false){
  const c=ajustarAlcance(),w=WORKERS.find(w=>w.id===id&&w.obra_id===OBRA.id&&!w.eliminado);
  if(!w||!detalle.isConnected)return;
  const previo=historialDe(w);
  if(!forzar&&previo){actualizarDetalle(w,detalle,previo);return;}
  const s={estado:'leyendo',version:w.updated_at,generacion};historiales.set(id,s);actualizarDetalle(w,detalle,s);
  const vigente=()=>api().vigente(c)&&detalle.isConnected&&historiales.get(id)===s&&s.generacion===generacion;
  try{
   const campos='id,obra_id,trabajador_id,accion,fecha,fecha_alta:datos_despues->>fecha_alta,fecha_baja:datos_despues->>fecha_baja,fecha_reingreso:datos_despues->>fecha_reingreso,antes_fecha_alta:datos_antes->>fecha_alta,antes_fecha_baja:datos_antes->>fecha_baja,antes_fecha_reingreso:datos_antes->>fecha_reingreso,estado:datos_despues->>estatus,estado_anterior:datos_antes->>estatus,reversion_historial_id:datos_despues->>reversion_historial_id';
   const r=await api().leer('historial','padron:'+OBRA.id+':'+id+':'+generacion,q=>consultaHistorialTrabajador(id,campos,q).eq('obra_id',OBRA.id).in('accion',['ALTA','BAJA','REACTIVACION','MODIFICACION','CORRECCION_REINGRESO','BAJA_REVERTIDA']).order('fecha',{ascending:true}));
   if(!vigente())return;
   s.filas=r.filas.filter(h=>h.trabajador_id===id&&h.obra_id===OBRA.id);s.estado='ok';
  }catch(e){if(!vigente())return;s.estado='error';s.error=e.message;}
  if(vigente())actualizarDetalle(w,detalle,s);
 }
 function invalidar(tabla){
  if(!alcance||!api().vigente(alcance))return;
  if(tabla==='cuadrillas')cuad=null;
  if(tabla==='trabajadores'){historiales.clear();generacion++;}
 }
 function reset(){cuad=null;alcance=null;historiales.clear();generacion++;}
 function personasDelCentro(base){
  const ids=new Set();return base.filter(w=>w.id&&w.obra_id===OBRA.id&&!w.eliminado&&!ids.has(w.id)&&!!ids.add(w.id));
 }
 function render(base){
  if(!$('padron-lista')||!OBRA)return false;
  ajustarAlcance();
  $('padron-nueva').hidden=!puedeEditarTrabajador();
  $('padron-reintentar-cuadrillas').onclick=()=>{cuad=null;renderTable();};
  if(!cuad&&!OBRA_CARGA_COMPLETA)setTimeout(()=>{if(alcance&&api().vigente(alcance)&&VIEW==='trab')catalogoCuadrillas();},0);
  dibujarCuadrillas();
  const rows=personasDelCentro(base).filter(coincideCuadrilla),valor=w=>SORT.k==='nombre'?fullName(w):SORT.k==='fecha_baja'?(w.estatus==='BAJA'?w.fecha_baja:null):w[SORT.k];
  rows.sort((a,b)=>{const x=valor(a),y=valor(b);return x==null||x===''?(y==null||y===''?String(a.id).localeCompare(String(b.id)):1):y==null||y===''?-1:(SORT.asc?1:-1)*String(x).localeCompare(String(y),'es',{numeric:true})||String(a.id).localeCompare(String(b.id));});
  window._NAVIDS=rows.map(w=>w.id);
  $('worker-count').textContent=rows.length+' visibles · '+personasDelCentro(WORKERS).length+' en el padrón del centro';
  const cols=[['Número','no_trab'],['Nombre completo','nombre'],['Contratista','contratista'],['Estatus laboral','estatus'],['Fecha de alta','fecha_alta'],['Fecha de baja','fecha_baja'],['Reingresos','fecha_reingreso'],['Estatus IMSS',''],['Acciones','']];
  const head=$('padron-columnas');if(head._firma!=='lista-unica'){
   head.innerHTML=cols.map(([n,k])=>'<th scope="col" '+(k?'data-sort="'+k+'"><button type="button" onclick="setSort(\''+k+'\')">'+n+'</button>': '>'+n)+'</th>').join('');head._firma='lista-unica';
  }
  head.querySelectorAll('[data-sort]').forEach(th=>th.setAttribute('aria-sort',SORT.k===th.dataset.sort?(SORT.asc?'ascending':'descending'):'none'));
  const filtros=['q','f-estatus','flt-contratista','f-periodo','f-semana','flt-puesto','flt-cuadrilla'].map(id=>$(id)?.value);
  const visibles=window.PLATINUM_DATOS?.pagina('trabajadores',rows,$('worker-pagina'),JSON.stringify([filtros,SORT.k,SORT.asc]),renderTable,80)??rows;
  const acuses=indiceAcusesIMSS(DOCSX),sinServicio=new Set(ALTAS_CORTAS.filter(x=>x.estado_servicio==='SIN_SERVICIO_CONFIRMADO').map(x=>x.trabajador_id));
  $('tbody').innerHTML=visibles.length?visibles.map(w=>{
   const h=historialDe(w),reingresos=h?.estado==='ok'?movimientosDe(w,h.filas).filter(r=>r.tipo==='REINGRESO'):null;
   const fechaReingreso=reingresos?.map(r=>r.fecha).filter(Boolean).sort().at(-1)||w.fecha_reingreso;
   const status=estadoLaboral(w,reingresos?.length||0);
   const tipo=w.estatus==='BAJA'?'BAJA':'ALTA',nombre=tipo==='BAJA'?'Baja':w.fecha_reingreso?'Reingreso':'Alta',estado=estadoAcuseIMSS(w,tipo,acuses);
   const presentacion=!(w.fecha_alta||w.fecha_reingreso||w.fecha_baja)?'Sin fecha de movimiento para cotejar':nombre+(estado.porCotejar?' por cotejar':estado.presentada?' presentada':' por presentar');
   const imss='<span class="padron-imss-presentacion">'+esc(presentacion)+'</span>'+(w.movimiento_imss?'<small>'+esc(w.movimiento_imss)+'</small>':'')+marcadoresIMSS(w,acuses)+(sinServicio.has(w.id)?'<small>Sin servicio confirmado</small>':'');
   return '<tr data-padron-trabajador="'+esc(w.id)+'"><td data-activity-field="NUMERO">'+esc(w.no_trab??'—')+'</td><td data-activity-field="NOMBRE"><button type="button" class="padron-nombre" data-padron-id="'+esc(w.id)+'">'+esc(fullName(w))+'</button></td><td data-activity-field="CONTRATISTA">'+(esc(w.contratista)||'—')+(equipo(w)?'<small>'+esc(equipo(w))+'</small>':'')+'</td><td data-activity-field="ESTATUS">'+status+'</td><td data-activity-field="ALTA">'+fechaTexto(w.fecha_alta)+'</td><td data-activity-field="BAJA">'+(w.estatus==='BAJA'?fechaTexto(w.fecha_baja):'—')+'</td><td data-activity-field="REINGRESO"><span data-padron-ultima>'+fechaTexto(fechaReingreso)+'</span><details class="padron-historial" data-padron-historial="'+esc(w.id)+'"><summary>Ver historial'+(reingresos?' · '+reingresos.length+' reingreso'+(reingresos.length===1?'':'s'):'')+'</summary><div data-padron-hist-cuerpo>'+contenidoHistorial(w,h)+'</div></details></td><td data-activity-field="ACUSES">'+imss+'</td><td class="padron-acciones"><button type="button" class="btn" data-padron-id="'+esc(w.id)+'">Ficha</button><button type="button" class="btn" data-padron-seccion="imss" data-worker-id="'+esc(w.id)+'">IMSS</button>'+(w.estatus==='BAJA'&&puedeEditarTrabajador()&&!w._pendiente_visual?'<button type="button" class="btn" data-padron-reingreso="'+esc(w.id)+'">Reingresar</button>':'')+'</td></tr>';
  }).join(''):'<tr><td colspan="9"><div class="empty">Sin coincidencias con los filtros del padrón.</div></td></tr>';
  $('tbody').querySelectorAll('[data-padron-historial]').forEach(d=>{d.ontoggle=()=>{if(d.open)consultarHistorial(d.dataset.padronHistorial,d);};});
  $('tbody').onclick=e=>{
   const b=e.target.closest('[data-padron-id],[data-padron-reingreso],[data-padron-seccion],[data-padron-refrescar]');if(!b)return;
   const id=b.dataset.padronId||b.dataset.padronReingreso||b.dataset.workerId||b.dataset.padronRefrescar,w=WORKERS.find(w=>w.id===id&&w.obra_id===OBRA.id&&!w.eliminado);
   if(!w||!api().vigente(alcance))return;
   if(b.dataset.padronRefrescar)return consultarHistorial(id,b.closest('details'),true);
   if(b.dataset.padronReingreso){if(w.estatus==='BAJA'&&puedeEditarTrabajador()&&!w._pendiente_visual)return doReactivar(id);return;}
   return openDetail(id,undefined,{ids:window._NAVIDS,origen:b,seccion:b.dataset.padronSeccion});
  };
  return true;
 }
 window.PLATINUM_PADRON=Object.freeze({render,reset,invalidar,filasMovimientos,programado,personasDelCentro});
})();
