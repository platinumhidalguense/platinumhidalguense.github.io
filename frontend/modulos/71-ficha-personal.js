/* Superficie de trabajo del expediente. Las secciones comparten la identidad confirmada. */
(function(){
 'use strict';
 const secciones={
  resumen:'Resumen',identidad:'Identificación y contacto',contratacion:'Contratación y adscripción',
  nomina:'Salario y nómina',incidencias:'Incidencias y prestaciones',faltas:'Faltas históricas y acumulado',imss:'IMSS',expediente:'Expediente',historial:'Historial'
 };
 const fuentes={
  nomina:['pagos','cheques','sueldos_internos'],
  incidencias:['descuentos','vacaciones','actas','nom035'],
  expediente:['documentos']
 };
 let activa=null;
 const api=()=>window.PLATINUM_PERSONAL;
 const visible=s=>activa===s&&api().vigente(s.c)&&$('ficha-personal')===s.host;
 function actual(id){return !!activa&&activa.id===id&&visible(activa);}
 function antesCerrar(contenedor=null){
  if(!activa||!visible(activa))return null;
  if(contenedor&&!contenedor.contains(activa.host))return null;
  const {origen,id}=activa;activa=null;
  return ()=>{
   if(origen?.isConnected)origen.focus({preventScroll:true});
   else [...($('tbody')?.querySelectorAll('[data-padron-id]')||[])].find(b=>b.dataset.padronId===(origen?.dataset?.padronId||id))?.focus({preventScroll:true});
  };
 }
 function encabezado(w){
  const estado=esc(w.estatus||'Por verificar'),periodo=esc(w.periodo_pago||'SEMANAL');
  const programado=window.PLATINUM_PADRON?.programado(w);
  return `<span class="badge ${estado}">${estado}</span> <span class="badge ${periodo}">${periodo}</span> ${programado?'<span class="badge PENDIENTE">'+esc(programado)+'</span>':''}`;
 }
 function estadoBloque(host,texto,error,reintentar){
  host.innerHTML='';
  const p=document.createElement('p');p.setAttribute('role',error?'alert':'status');p.className='fhint';p.textContent=texto;host.appendChild(p);
  if(error){const b=document.createElement('button');b.className='btn';b.type='button';b.textContent='Reintentar';b.onclick=reintentar;host.appendChild(b);}
 }
 async function mostrar(s,seccion,enfocar=false){
  if(!visible(s)||!secciones[seccion])return;
  const turno=++s.turno;s.seccion=seccion;
  const vigente=()=>visible(s)&&turno===s.turno;
  const met=api().medir('ficha-'+seccion,s.confirmado?'sesion':'primera');
  const encabezado=$('ficha-panel-titulo'),cuerpo=$('ficha-panel-cuerpo');
  encabezado.textContent=secciones[seccion];
  const botones=[...s.host.querySelectorAll('[data-ficha-seccion]')];
  botones.forEach(b=>b.setAttribute('aria-current',String(b.dataset.fichaSeccion===seccion)));
  $('ficha-seccion-select').value=seccion;
  cuerpo.parentElement.scrollTop=0;
  if(enfocar)encabezado.focus({preventScroll:true});
  if(seccion==='resumen')cuerpo.innerHTML=fichaResumenHTML(s.w,!!s.confirmado);
  else estadoBloque(cuerpo,'Consultando '+secciones[seccion].toLowerCase()+'…',false);
  met.marca('navegable');
  try{
   s.pendiente??=api().trabajador(s.id,s.c,met);
   const w=await s.pendiente;
   if(!vigente()||!w){met.fin('descartada');return;}
   s.w=w;s.confirmado=true;
   $('ficha-personal-estado').innerHTML=estadoTrabajador(w);
   $('ficha-editar').disabled=!puedeEditarTrabajador();
   if(seccion==='incidencias'){
    cuerpo.innerHTML='<section id="cal-contenido" data-worker-id="'+esc(w.id)+'" aria-label="Calendario de incidencias"></section><section id="ficha-incidencias-datos"></section>';
    window.PLATINUM_CALENDARIO?.montar(w.id,s.mes);
   }
   if(seccion==='faltas'){
    // Fuente común de aguinaldo y finiquitos; su propio módulo verifica permisos en el servidor.
    if(!window.PLATINUM_FALTAS_HIST)throw Error('No cargó el módulo de faltas históricas. Recarga la plataforma.');
    await window.PLATINUM_FALTAS_HIST.montar(cuerpo,w,vigente);
    met.marca('utilizable');s.meta?.marca('utilizable');met.fin(vigente()?undefined:'descartada');return;
   }
   const destino=seccion==='incidencias'?$('ficha-incidencias-datos'):cuerpo;
   const depende=fuentes[seccion]||[];
   if(depende.length&&seccion==='incidencias')estadoBloque(destino,'Consultando descuentos y prestaciones…',false);
   if(seccion==='contratacion'||seccion==='resumen'){
    // La asignación se muestra tan pronto se confirme el catálogo de este centro.
    api().cuadrillas(s.c,met).then(()=>{if(vigente()&&seccion==='resumen')cuerpo.innerHTML=fichaResumenHTML(w,true);})
     .catch(()=>{if(vigente()&&seccion==='resumen')cuerpo.insertAdjacentHTML('beforeend','<p class="fhint">Cuadrilla pendiente de verificación. Consulta Contratación y adscripción.</p>');});
    if(seccion==='contratacion')await api().cuadrillas(s.c,met);
   }
   await Promise.all(depende.map(tabla=>api().seccion(tabla,w,s.c,met)));
   if(!vigente()){met.fin('descartada');return;}
   const t=performance.now(),html=agruparExpedienteFicha(w,seccion);
   met.preparacion(performance.now()-t);
   const r=performance.now();destino.innerHTML=html;met.render(performance.now()-r);
   met.marca('utilizable');
   s.meta?.marca('utilizable');
   // Las herramientas de escritura conservan además sus propias guardas.
   if(!puedeEditarTrabajador())destino.querySelectorAll('[onclick]').forEach(b=>{
    if(/openIMSSWorker|openPendiente|openTransferencia|openBaja|doReactivar|doActivar|openEliminar|openDescuento|openAjusteRetencion|openCreditoNumero|openExcepcion|toggleDescuento|openActaForm|openRenombrarDoc|anularDoc/.test(b.getAttribute('onclick')))b.remove();
   });
   if(seccion==='historial'&&$('ficha-historial'))await openHistorial(w.id,$('ficha-historial'));
   met.marca('secundarios');met.fin();
  }catch(error){
   if(vigente()){
    if(!s.confirmado)s.pendiente=null;
    estadoBloque($('ficha-incidencias-datos')||cuerpo,error.message,true,()=>mostrar(s,seccion,true));
   }
   met.fin(vigente()?'error':'descartada');
  }
 }
 const estadoTrabajador=encabezado;
 function abrir(id,mes,navegacion){
  if($('worker-form-body')){
   closeModal();
   if($('worker-form-body'))return;
  }
  const w=WORKERS.find(x=>x.id===id&&x.obra_id===OBRA?.id);
  if(!w)return;
  const c=api().contexto(),origen=navegacion?.origen??(visible(activa||{})?activa.origen:document.activeElement);
  const ids=[...new Set(navegacion?.ids||navTrabajadores())].filter(x=>WORKERS.some(z=>z.id===x&&z.obra_id===OBRA.id));
  if(!ids.includes(id))ids.splice(0,ids.length,id);
  const pos=ids.indexOf(id),seccion=mes?'incidencias':'resumen';
  const meta=api().medir('abrir-ficha',OBRA_CARGA_COMPLETA?'centro-completo':'padron-ligero');
  const misma=activa&&visible(activa)?activa:null;
  const anidada=misma?.anidada||(!navegacion?.origen&&!!$('modals')?.querySelector('.overlay'));
  const html=`<div id="ficha-personal" class="ficha-personal" data-activity-worker="${esc(id)}">
    <div class="m-head ficha-personal-barra"><button type="button" class="btn" onclick="${anidada?'closeModal2()':'closeModal()'}">← Volver</button>
      <div class="ficha-personal-identidad"><h2 tabindex="-1" id="ficha-personal-titulo">#${esc(w.no_trab??'—')} · ${esc(fullName(w))}</h2>
      <p>${esc(razonSocialEmpresa())} · ${esc(OBRA.nombre)}</p><div id="ficha-personal-estado">${encabezado(w)}</div></div>
      <div class="ficha-nav"><button type="button" class="btn" id="ficha-anterior" aria-label="Trabajador anterior" ${pos<=0?'disabled':''}>‹</button>
      <span class="pos">${pos+1} / ${ids.length}</span><button type="button" class="btn" id="ficha-siguiente" aria-label="Trabajador siguiente" ${pos===ids.length-1?'disabled':''}>›</button></div>
      <button class="btn dark" type="button" id="ficha-editar" ${puedeEditarTrabajador()?'disabled':'hidden'}>✎ Modificar</button>
    </div>
    <div class="ficha-personal-cuerpo">
      <nav aria-label="Secciones del trabajador" class="ficha-personal-nav">${Object.entries(secciones).map(([k,n])=>`<button type="button" class="btn" data-ficha-seccion="${k}" aria-controls="ficha-personal-panel">${n}</button>`).join('')}</nav>
      <label class="ficha-personal-selector">Sección <select id="ficha-seccion-select">${Object.entries(secciones).map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label>
      <div class="m-body" id="ficha-personal-panel"><h3 tabindex="-1" id="ficha-panel-titulo"></h3><div id="worker-overview" data-activity-worker="${esc(id)}"><div id="ficha-panel-cuerpo"></div></div></div>
    </div>
  </div>`;
  if(misma?.anidada)misma.host.closest('.modal').innerHTML=html;
  else if(anidada)modal2(html,'worker-ficha');
  else modal(html,'worker-ficha');
  const s={id,c,host:$('ficha-personal'),w,origen,turno:0,mes,meta,anidada};activa=s;
  meta.marca('navegable');
  s.host.querySelector('.ficha-personal-nav').onclick=e=>{const b=e.target.closest('[data-ficha-seccion]');if(b)mostrar(s,b.dataset.fichaSeccion,true);};
  $('ficha-seccion-select').onchange=e=>mostrar(s,e.target.value,false);
  $('ficha-editar').onclick=()=>openForm(id);
  const vecino=i=>{if(visible(s)&&ids[i])abrir(ids[i],undefined,{ids,origen});};
  $('ficha-anterior').onclick=()=>vecino(pos-1);
  $('ficha-siguiente').onclick=()=>vecino(pos+1);
  $('ficha-personal-titulo').focus({preventScroll:true});
  return mostrar(s,seccion).finally(()=>{meta.fin(visible(s)&&s.confirmado?'ok':'descartada');s.meta=null;});
 }
 window.PLATINUM_FICHA=Object.freeze({abrir,actual,antesCerrar});
})();
