/* El padrón conserva la identidad por ID. El historial aporta episodios con fecha efectiva. */
(function(){
 'use strict';
 const tipos={activos:'Activos',altas:'Altas',bajas:'Bajas',reingresos:'Reingresos'};
 const movimientos={altas:['ALTA','fecha_alta'],bajas:['BAJA','fecha_baja'],reingresos:['REINGRESO','fecha_reingreso']};
 const columna={altas:'Alta',bajas:'Baja',reingresos:'Reingreso'};
 let vista='activos',hist=null,cuad=null,alcance=null,generacion=0;
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
  if(c!==alcance){alcance=c;hist=null;cuad=null;vista='activos';}
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
 async function consultar(tipo,desde,hasta,identificador){
  const c=alcance,obra=OBRA.id,campo=movimientos[tipo][1],fechaE='datos_despues->>'+campo,fechaA='datos_antes->>'+campo;
  const acciones={altas:['ALTA','MODIFICACION'],bajas:['BAJA','MODIFICACION'],reingresos:['REACTIVACION','MODIFICACION','CORRECCION_REINGRESO']};
  const seleccionado='id,obra_id,trabajador_id,fecha,accion,trabajador_nombre,efectiva:'+fechaE+',anterior:'+fechaA+',estado:datos_despues->>estatus,estado_anterior:datos_antes->>estatus,contratista:datos_despues->>contratista,puesto:datos_despues->>puesto,no_trab:datos_despues->>no_trab';
  const rango=k=>'and('+k+'.gte.'+desde+','+k+'.lte.'+hasta+')';
  const incompleto='and('+fechaE+'.is.null,fecha.gte.'+desde+'T00:00:00-06:00,fecha.lte.'+hasta+'T23:59:59.999-06:00)';
  const s={identificador,estado:'leyendo'};hist=s;
  try{
   const r=await api().leer('historial',identificador+':'+generacion,q=>q.select(seleccionado).eq('obra_id',obra)
    .in('accion',acciones[tipo]).or([rango(fechaE),rango(fechaA),incompleto].join(',')));
   if(!api().vigente(c)||hist!==s)return;
   const ids=[...new Set(r.filas.map(h=>h.trabajador_id).filter(Boolean))].filter(id=>!WORKERS.some(w=>w.id===id));
   const personas=[];
   for(let i=0;i<ids.length;i+=80){
    const lote=ids.slice(i,i+80);
   const extra=await api().leer('trabajadores','hist:'+lote.join(','),q=>q.select('id,obra_id,no_trab,nombres,primer_apellido,segundo_apellido,estatus,contratista,puesto,curp,rfc,nss,telefono,correo,periodo_pago,semana_ingreso,fecha_alta,fecha_baja,fecha_reingreso,eliminado').in('id',lote));
    if(!api().vigente(c)||hist!==s)return;
   personas.push(...extra.filas);
   const conocidos=new Set(extra.filas.map(w=>w.id));
   for(const id of lote.filter(x=>!conocidos.has(x))){
    const evidencia=r.filas.find(h=>h.trabajador_id===id);
    personas.push({id,nombres:evidencia.trabajador_nombre,no_trab:evidencia.no_trab,contratista:evidencia.contratista,puesto:evidencia.puesto,estatus:'Por verificar',historico:true});
   }
   }
   s.personas=personas;s.filas=r.filas;s.estado='ok';
  }catch(e){if(hist===s){s.estado='error';s.error=e.message;}}
  if(api().vigente(c)&&hist===s&&VIEW==='trab')repintar();
 }
 function repintar(){
  const l=document.querySelector('.worker-list'),top=l?.scrollTop,left=l?.scrollLeft;
  const id=document.activeElement?.dataset?.padronId;
  renderTable();
  if(l){l.scrollTop=top;l.scrollLeft=left;if(id)[...$('tbody').querySelectorAll('[data-padron-id]')].find(b=>b.dataset.padronId===id)?.focus({preventScroll:true});}
 }
 function invalidar(tabla){
  if(!$('padron-vistas')||!alcance||!api().vigente(alcance))return;
  if(tabla==='cuadrillas')cuad=null;
  if(tabla==='trabajadores'&&hist){
   // La nueva fila no confirma que la lectura histórica en curso incluyera el movimiento.
   hist=null;generacion++;
  }
 }
 function reset(){
  vista='activos';hist=null;cuad=null;alcance=null;
  const hoy=hoyLocal(),desde=$('padron-desde'),hasta=$('padron-hasta');
  if(desde)desde.value=hoy.slice(0,7)+'-01';
  if(hasta)hasta.value=hoy;
  if($('padron-especial'))$('padron-especial').checked=false;
 }
 function seleccionar(clase){
  ajustarAlcance();vista=clase;
  $('padron-especial').checked=false;
  const l=document.querySelector('.worker-list');if(l)l.scrollTop=0;
  renderTable();
 }
 function render(base){
  if(!$('padron-vistas')||!OBRA)return false;
  ajustarAlcance();
  if(!$('padron-desde').value||!$('padron-hasta').value){
   const hoy=hoyLocal();$('padron-desde').value||=hoy.slice(0,7)+'-01';$('padron-hasta').value||=hoy;
  }
  const hoy=hoyLocal(),activos=vista==='activos',desde=fecha($('padron-desde').value),hasta=fecha($('padron-hasta').value),especial=$('padron-especial').checked;
  const botones=[...$('padron-vistas').querySelectorAll('[data-padron-vista]')];
  for(const b of botones){b.setAttribute('aria-pressed',String(vista===b.dataset.padronVista));b.onclick=()=>seleccionar(b.dataset.padronVista);}
  $('padron-rango').hidden=activos;
  $('padron-especial-texto').textContent=vista==='bajas'?'Bajas actuales, fuera del rango inclusive':vista==='reingresos'?'Reingresos programados':'Altas pendientes y programadas';
  $('padron-nueva').hidden=!puedeEditarTrabajador();
  $('padron-reintentar-cuadrillas').onclick=()=>{cuad=null;renderTable();};
  // El catálogo no bloquea el padrón inicial ni su primera pintura.
  if(!cuad&&!OBRA_CARGA_COMPLETA)setTimeout(()=>{if(alcance&&api().vigente(alcance)&&VIEW==='trab')catalogoCuadrillas();},0);
  dibujarCuadrillas();
  const aviso=$('padron-aviso');aviso.innerHTML='';
  const alcanceHist=!activos&&!especial&&desde&&hasta&&desde<=hasta;
  const identificador=[vista,desde,hasta].join('|');
  if(alcanceHist&&hist?.identificador!==identificador)consultar(vista,desde,hasta,identificador);
  const h=alcanceHist&&hist?.identificador===identificador?hist:null;
  if(h?.estado==='leyendo')aviso.textContent='Consultando el historial del rango. Se muestran los movimientos del padrón mientras llega.';
  if(h?.estado==='error'){
   aviso.textContent='Historial sin verificar: '+h.error+' ';
   const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Reintentar';b.onclick=()=>{hist=null;renderTable();};aviso.appendChild(b);
  }
  if(!activos&&!especial&&!alcanceHist)aviso.textContent='Selecciona un rango de fechas efectivo válido.';
  const estatus=$('f-estatus')?.value;
  const personas=base.concat(baseFiltered((h?.personas||[]).filter(w=>!w.eliminado)).filter(w=>!estatus||w.estatus===estatus)).filter(coincideCuadrilla);
  const rows=activos?personas.filter(w=>w.obra_id===OBRA.id&&!w.eliminado&&w.estatus==='ACTIVO'&&!programado(w,hoy)).map(w=>({w,fecha:w.fecha_reingreso||w.fecha_alta}))
   :especial||alcanceHist?filasMovimientos(vista,personas,h?.filas||[],desde,hasta,OBRA.id,hoy,especial):[];
  const sort=SORT.k==='fecha_alta'?'fecha':SORT.k,valor=r=>sort==='nombre'?fullName(r.w):sort==='fecha'?r.fecha:r.w[sort];
  rows.sort((a,b)=>{const x=valor(a),y=valor(b);return x==null||x===''?(y==null||y===''?0:1):y==null||y===''?-1:(SORT.asc?1:-1)*String(x).localeCompare(String(y),'es',{numeric:true})||String(a.w.id).localeCompare(String(b.w.id));});
  window._NAVIDS=[...new Set(rows.filter(r=>r.w.obra_id===OBRA.id).map(r=>r.w.id))];
  $('worker-count').textContent=rows.length+' '+(activos?'personas':'movimientos')+' con estos filtros · '+WORKERS.length+' en el padrón del centro';
  const cols=activos?[['Trabajador','nombre'],['Puesto','puesto'],['Contratista / cuadrilla','contratista'],['Estatus','estatus'],['Ingreso efectivo','fecha_alta'],['Acuses IMSS','']]
   :[[columna[vista]+' · fecha efectiva','fecha_alta'],['Trabajador','nombre'],['Situación actual','estatus'],['Centro del movimiento',''],['Contratista / cuadrilla','contratista'],['IMSS actual / acción','']];
  const head=$('padron-columnas'),firma=JSON.stringify(cols);
  if(head._firma!==firma){head.innerHTML=cols.map(([n,k])=>'<th scope="col" '+(k?'data-sort="'+k+'"><button type="button" onclick="setSort(\''+k+'\')">'+n+'</button>': '>'+n)+'</th>').join('');head._firma=firma;}
  head.querySelectorAll('[data-sort]').forEach(th=>th.setAttribute('aria-sort',SORT.k===th.dataset.sort?(SORT.asc?'ascending':'descending'):'none'));
  const filtros=['q','f-estatus','flt-contratista','f-periodo','f-semana','flt-puesto','flt-cuadrilla'].map(id=>$(id)?.value);
  const visibles=window.PLATINUM_DATOS?.pagina('trabajadores',rows,$('worker-pagina'),JSON.stringify([identificador,especial,filtros,SORT.k,SORT.asc]),renderTable,80)??rows;
  const acuses=indiceAcusesIMSS(DOCSX),sinServicio=new Set(ALTAS_CORTAS.filter(x=>x.estado_servicio==='SIN_SERVICIO_CONFIRMADO').map(x=>x.trabajador_id));
  $('tbody').innerHTML=visibles.length?visibles.map(({w,h,fecha:f,programado:prog})=>{
   const local=w.obra_id===OBRA.id,numero=h?.no_trab||(w.no_trab??'—'),nombre=esc(h?.trabajador_nombre||fullName(w));
   const ficha=local?'<button type="button" data-padron-id="'+esc(w.id)+'"><span class="worker-number">#'+esc(numero)+'</span>'+nombre+'</button>'
    :'<span>#'+esc(numero)+' · '+nombre+'</span><small>'+(w.historico?'La situación actual no está disponible':'Ficha en '+esc(OBRAS.find(o=>o.id===w.obra_id)?.nombre||'otro centro autorizado'))+'</small>';
   const status='<span class="badge '+esc(w.estatus)+'">'+esc(w.estatus)+'</span>'+(programado(w,hoy)?'<small>'+programado(w,hoy)+'</small>':'')+(w._pendiente_visual?'<small>Guardando…</small>':'');
   const imss=local?marcadoresIMSS(w,acuses)+(altaImssPendiente(w,acuses)?'<small class="imss-alert">⚠ Alta IMSS por presentar</small>':'')+(sinServicio.has(w.id)?'<small>Sin servicio confirmado</small>':''):'—';
   const fechaHtml=f?fmtD(f):'Fecha sin evidencia';
   const asignacion=esc(h?.contratista||w.contratista)||'—',cuadrilla=equipo(w);
   const tr='<tr'+(local?' data-padron-trabajador="'+esc(w.id)+'"':'')+'>';
   return activos?tr+'<td data-activity-field="NOMBRE">'+ficha+'</td><td data-activity-field="PUESTO">'+esc(w.puesto||'—')+'</td><td data-activity-field="CONTRATISTA">'+asignacion+(cuadrilla?'<small>'+esc(cuadrilla)+'</small>':'')+'</td><td data-activity-field="ESTATUS">'+status+'</td><td data-activity-field="INGRESO">'+fechaHtml+(w.fecha_reingreso?'<small>Reingreso</small>':'')+'</td><td data-activity-field="ACUSES">'+imss+'</td></tr>'
    :tr+'<td data-activity-field="'+(vista==='bajas'?'BAJA':'INGRESO')+'">'+fechaHtml+(prog?'<small>Programado</small>':'')+(h?.fecha?'<small>Captura '+fmtD(h.fecha)+'</small>':'<small>Fecha de ficha</small>')+'</td><td data-activity-field="NOMBRE">'+ficha+'</td><td data-activity-field="ESTATUS">'+status+'</td><td data-activity-field="NINGUNO">'+esc(OBRA.nombre)+(h?'':'<small>Centro actual de ficha</small>')+'</td><td data-activity-field="CONTRATISTA">'+asignacion+(h?'<small>Asignación de movimiento, si consta</small>':'')+'</td><td data-activity-field="ACUSES">'+imss+(vista==='bajas'&&local&&w.estatus==='BAJA'&&puedeEditarTrabajador()&&!w._pendiente_visual?'<button type="button" class="btn" data-padron-reingreso="'+esc(w.id)+'">Reingresar</button>':'')+'</td></tr>';
  }).join(''):'<tr><td colspan="6"><div class="empty">'+(h?.estado==='leyendo'?'Consultando movimientos…':'Sin coincidencias con los filtros de esta vista.')+'</div></td></tr>';
  $('tbody').onclick=e=>{
   const b=e.target.closest('[data-padron-id],[data-padron-reingreso]');
   if(b?.dataset.padronId)return openDetail(b.dataset.padronId,undefined,{ids:window._NAVIDS,origen:b});
   if(b?.dataset.padronReingreso)return doReactivar(b.dataset.padronReingreso);
  };
  return true;
 }
 window.PLATINUM_PADRON=Object.freeze({render,reset,invalidar,filasMovimientos,programado});
})();
