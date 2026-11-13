/* Tabla operativa de cheques: todas las semanas del centro, sin duplicar
   el lector fiscal ni el motor. Los folios usan una ruta de metadatos físicos. */
(function(){
 'use strict';
 let ctx=null,root=null,filtros={q:'',estatus:'',contratista:'',semana:'',orden:'consecutivo:asc'},revision=new Map(),token=0,ocupado=false;
 let menu=null, accesos={};
 const cents=v=>Number.isFinite(Number(v))?Math.round(Number(v)*100):null;
 const escape=val=>esc(String(val??'')),permiso=()=>puedeEditarTrabajador();
 const vigente=c=>ctx===c&&OBRA?.id===c.obra&&USER?.id===c.user&&VIEW==='conciliador';
 const fuente=()=>vigente(ctx)?CHEQUES.filter(c=>c.obra_id===ctx.obra&&!c.eliminado):[];
 const huellaFiscal=q=>JSON.stringify([typeof DOCSX==='undefined'?[]:DOCSX,typeof CTRLNOI==='undefined'?[]:CTRLNOI].map(rs=>rs.filter(d=>d.trabajador_id===q.trabajador_id&&normSem(d.semana)===normSem(q.semana)).map(d=>[d.id,d.hash,d.updated_at,d.nomina_neto,d.neto,d.monto_noi,d.cfdi_uuid,d.anulado])));
 const button=(label,a,id='',disabled=false)=>`<button type="button" class="btn" data-gq="${a}" ${id?`data-id="${escape(id)}"`:''} ${disabled?'disabled':''}>${label}</button>`;
 const etiquetasFiscal={COINCIDE:'Cuadra',DIFERENCIA:'Diferencia',REVISAR:'Revisar',SIN_VERIFICAR:'Sin verificar'};
 const sinVerificar={estado:'SIN_VERIFICAR',texto:'Aún no se ha verificado en esta consulta.'};
 function evidencia(q){
  const r=revision.get(q.id);
  return r&&r.importe===cents(q.importe)&&r.version===q.updated_at&&r.fuente===huellaFiscal(q)?r:sinVerificar;
 }
 function fiscal(q,movil=false){
  const {estado,texto}=evidencia(q);
  return `<span class="gq-fiscal-tag${movil?' gq-fiscal-movil':''}" data-fiscal="${estado}" title="${escape(texto)}">${etiquetasFiscal[estado]}</span>`;
 }
 const folio=(v,faltante)=>v?escape(v):`<span aria-hidden="true">—</span><span class="gq-sr">${faltante}</span>`;
 const cabeceras=[['Trabajador','gq-nombre'],['Contratista','gq-sec gq-contratista'],['Semana / periodo','gq-sec gq-periodo'],['Importe','gq-importe'],['Tipo','gq-sec gq-tipo'],['Núm. cheque','gq-sec gq-numero'],['Consecutivo','gq-sec gq-numero'],['Estatus','gq-estatus'],['Recibo','gq-sec gq-recibo'],['Acciones','gq-accion-fija']];
 function filas(visual=false){const q=filtros.q.trim().toLocaleUpperCase('es-MX'),[k,dir]=filtros.orden.split(':');const qs=fuente();return (visual?(window.PLATINUM_DATOS?.vista('cheques',qs)??qs):qs).filter(c=>(!filtros.estatus||c.estatus===filtros.estatus)&&(!filtros.contratista||c.contratista===filtros.contratista)&&(!filtros.semana||String(normSem(c.semana))===filtros.semana)&&(!q||[c.no_trab,c.nombre,c.contratista,c.curp,c.num_cheque,c.consecutivo,c.semana].join(' ').toLocaleUpperCase('es-MX').includes(q))).sort((a,b)=>{
  let x=a[k],y=b[k];if(x==null||x==='')return y==null||y===''?0:1;if(y==null||y==='')return-1;
  const z=k==='importe'?Number(x)-Number(y):String(x).localeCompare(String(y),'es-MX',{numeric:true,sensitivity:'base'});return(dir==='desc'?-z:z)||String(a.nombre||'').localeCompare(String(b.nombre||''));
 });}
 function montar(host,herramientas={}){const c={obra:OBRA?.id,user:USER?.id};if(!c.obra||!c.user)return;if(ctx?.obra!==c.obra||ctx?.user!==c.user){salir();ctx=c;filtros={q:'',estatus:'',contratista:'',semana:'',orden:'consecutivo:asc'};revision.clear();}cerrarMenu(false);root=$(host);if(!root)return;
  accesos=herramientas;
  const qs=fuente(),op=(v,n,actual)=>`<option value="${escape(v)}" ${v===actual?'selected':''}>${escape(n)}</option>`;
  root.innerHTML=`<div class="gq-superior"><div class="gq-acciones" aria-label="Acciones de cheques">${button('＋ Nuevo cheque','nuevo')}${button('Verificar recibos de la lista','verificar')}${button('Revisar fuentes','fuentes-lista')}${button('Detener','detener')}
   <button type="button" class="btn" data-gq="herramientas" aria-haspopup="menu" aria-expanded="false" aria-controls="gq-menu">Herramientas <span aria-hidden="true">▾</span></button>
   ${typeof iaDisponible==='function'&&iaDisponible()?button('Asistente','asistente'):''}</div>
   <div class="stats" id="chq-stats" aria-label="Resumen de cheques del centro"></div></div>
   <div class="gq-filtros"><label class="gq-buscar">Buscar<input type="search" id="gq-q" aria-label="Buscar cheques" placeholder="Nombre, número o folio" value="${escape(filtros.q)}"></label>
   <label>Semana<select id="gq-semana">${op('','Todas',filtros.semana)}${[...new Set(qs.map(c=>normSem(c.semana)).filter(Boolean))].sort((a,b)=>Number(b)-Number(a)).map(v=>op(String(v),'S'+v,filtros.semana)).join('')}</select></label>
   <label>Estatus<select id="gq-estatus">${op('','Todos',filtros.estatus)}${['PENDIENTE','EXPEDIDO','ENTREGADO','CANCELADO'].map(v=>op(v,v,filtros.estatus)).join('')}</select></label>
   <label>Contratista<select id="gq-contratista">${op('','Todos',filtros.contratista)}${[...new Set(qs.map(c=>c.contratista).filter(Boolean))].sort().map(v=>op(v,v,filtros.contratista)).join('')}</select></label>
   <label>Ordenar<select id="gq-orden">${[['consecutivo:asc','Consecutivo ↑'],['consecutivo:desc','Consecutivo ↓'],['num_cheque:asc','Núm. cheque ↑'],['num_cheque:desc','Núm. cheque ↓'],['importe:asc','Importe ↑'],['importe:desc','Importe ↓'],['no_trab:asc','Núm. trabajador ↑']].map(([v,n])=>op(v,n,filtros.orden)).join('')}</select></label></div>
   <div id="gq-lista" class="gq-lista" tabindex="0" role="region" aria-label="Lista desplazable de cheques"><table class="gq-tabla"><thead><tr>${cabeceras.map(([h,k])=>`<th class="${k}" scope="col">${h}</th>`).join('')}</tr></thead><tbody id="gq-tbody"></tbody></table></div>
   <footer class="gq-pie"><span id="gq-resultados"></span><span id="gq-progreso" role="status" aria-live="polite"></span><div id="gq-pagina" class="lista-pagina" aria-label="Páginas de cheques" hidden></div></footer>`;
  root.onclick=e=>{const b=e.target.closest('[data-gq]');if(b)despachar(b);};
  root.onkeydown=e=>{
   const b=e.target.closest('[aria-haspopup="menu"]');
   if(b&&['ArrowDown','ArrowUp'].includes(e.key)&&!b.disabled){e.preventDefault();abrirMenu(b,e.key==='ArrowUp');}
  };
  for(const key of ['q','estatus','contratista','semana','orden']){const e=$('gq-'+key);e[key==='q'?'oninput':'onchange']=()=>{filtros[key]=e.value;$('gq-lista').scrollTop=0;pintar();};}
  renderChqStats();pintar();
 }
 function fila(c){
  return `<tr data-cheque="${escape(c.id)}">
   <td class="gq-nombre"><button type="button" class="gq-trabajador" data-gq="detalle" data-id="${escape(c.id)}" title="Ver detalle"><small>#${escape(c.no_trab??'—')}</small> <b>${escape(c.nombre)}</b></button>${c.reemplaza_cheque_id?`<small style="display:block">Reposición del cheque ${escape(CHEQUES.find(q=>q.id===c.reemplaza_cheque_id)?.num_cheque||c.reemplaza_cheque_id.slice(0,8))}</small>`:''}</td>
   <td class="gq-sec">${escape(c.contratista)}</td><td class="gq-sec"><b>${escape(c.semana)}</b> <span class="gq-fechas">${escape(c.periodo)}</span></td>
   <td class="gq-importe">$${money(c.importe)}</td><td class="gq-sec">${escape(c.tipo_pago)}</td>
   <td class="gq-sec">${folio(c.num_cheque,'Sin número de cheque')}</td><td class="gq-sec">${folio(c.consecutivo,'Sin consecutivo')}</td>
   <td class="gq-estatus"><span class="badge ${escape(c.estatus)}">${escape(c.estatus)}</span>${c._pendiente_visual?'<span class="gq-guardando">Guardando…</span>':''}<span data-recibo-movil>${fiscal(c,true)}</span></td>
   <td class="gq-sec" data-recibo>${fiscal(c)}</td>
   <td class="gq-accion-fija"><div class="gq-acciones-fila">${permiso()?`<button type="button" class="btn gq-captura" data-gq="captura" data-id="${escape(c.id)}" aria-label="Abrir captura de ${escape(c.nombre)}" title="Abrir captura" ${c._pendiente_visual?'disabled':''}><span class="gq-captura-icono" aria-hidden="true">✎</span><span class="gq-captura-texto">Abrir captura</span></button><button type="button" class="btn gq-mas" data-gq="fila-menu" data-id="${escape(c.id)}" aria-label="Acciones de ${escape(c.nombre)}" aria-haspopup="menu" aria-controls="gq-menu" aria-expanded="false">⋯</button>`:'<span aria-label="Sólo consulta">—</span>'}</div></td></tr>`;
 }
 const focus=n=>n?.focus({preventScroll:true});
 function actualizarControles(){
  const puede=permiso();
  for(const b of root.querySelectorAll('[data-gq="verificar"],[data-gq="fuentes-lista"]'))b.setAttribute('aria-disabled',String(ocupado||!puede));
  for(const b of root.querySelectorAll('[data-gq="nuevo"],[data-gq="verificar"]'))b.hidden=!puede;
  root.querySelector('[data-gq="fuentes-lista"]').hidden=!puede||!window.PLATINUM_ARCHIVO_RECIBOS;
  const stop=root.querySelector('[data-gq="detener"]');
  if(stop){if(!ocupado&&document.activeElement===stop&&puede)focus(root.querySelector('[data-gq="verificar"]'));stop.hidden=!ocupado||!puede;}
 }
 function pintar(){
  const body=$('gq-tbody'),sc=$('gq-lista'),p=$('gq-pagina');
  if(!root||!vigente(ctx)||!body)return;
  const activo=document.activeElement,origen=menu?.origen,boton=activo&&body.contains(activo)?activo:origen&&body.contains(origen)?origen:null;
  const indice=activo&&p.contains(activo)?Array.from(p.querySelectorAll('button')).indexOf(activo):-1;
  const top=sc.scrollTop,left=sc.scrollLeft;
  if(menu&&origen!==root.querySelector('[data-gq="herramientas"]'))cerrarMenu(false);
  const all=filas(true),rs=window.PLATINUM_DATOS?.pagina('cheques',all,p,JSON.stringify(filtros),()=>{pintar();sc.scrollTop=0;},70)??all;
  body.innerHTML=rs.length?rs.map(fila).join(''):`<tr class="gq-vacio"><td colspan="${cabeceras.length}">No hay cheques con estos filtros.</td></tr>`;
  $('gq-resultados').textContent=`${all.length} resultado${all.length===1?'':'s'}`;
  actualizarControles();
  if(boton){const restaurar=[...body.querySelectorAll('[data-gq]')].find(b=>b.dataset.id===boton.dataset.id&&b.dataset.gq===boton.dataset.gq);focus(restaurar||sc);}
  else if(indice>=0){const botones=[...p.querySelectorAll('button')];focus(botones[indice]?.disabled?botones.find(b=>!b.disabled):botones[indice]||sc);}
  sc.scrollTop=top;sc.scrollLeft=left;
 }
 function opcionesMenu(b){
  if(b.dataset.gq==='herramientas'){
   const semana=accesos.semanaFlujo?' · S'+Number(accesos.semanaFlujo):'';
   return [['Exportar Excel','exportar'],['Chequeras de 50','chequeras'],['Datos del centro','centro'],
    ...(accesos.importar?[['Importar recibos PDF y XML'+semana,'importar']]:[]),...(accesos.actualizar?[['Actualizar vista','actualizar']]:[]),
    ...(accesos.preparacion?[['Volver a preparación','preparacion']]:[]),
    ['Leer PDF archivados','tradicional',!permiso()],['Control de folios','folios',!permiso()],['Reuniones de entrega','reuniones',!permiso()]];
  }
  const q=buscar(b.dataset.id);
  const filaVisible=window.PLATINUM_DATOS?.vista('cheques',[q])?.[0]||q;
  return [['Corregir folios','editar',!permiso()||filaVisible._pendiente_visual],
   ...(['EXPEDIDO','ENTREGADO'].includes(q.estatus)?[['Cancelar cheque','cancelar-reponer',!permiso()||filaVisible._pendiente_visual]]:[]),
   ...(window.PLATINUM_ARCHIVO_RECIBOS?[['Revisar fuentes','fuentes',!permiso()||ocupado]]:[]),
   ['Verificar neto','uno',!permiso()||ocupado]];
 }
 function colocarMenu(){
  if(!menu)return;
  const {origen,panel}=menu;
  if(!origen.isConnected){cerrarMenu(false);return;}
  const a=origen.getBoundingClientRect(),vp=window.visualViewport;
  const izq=vp?.offsetLeft||0, arriba=vp?.offsetTop||0;
  const derecha=izq+(vp?.width||window.innerWidth||document.documentElement.clientWidth||1320);
  const abajo=arriba+(vp?.height||window.innerHeight||document.documentElement.clientHeight||625);
  const borde=8,distancia=4;
  const sc=origen.closest('.gq-lista')?.getBoundingClientRect();
  const centro=(a.top+a.bottom)/2;
  if(centro<Math.max(arriba,sc?.top??arriba)||centro>Math.min(abajo,sc?.bottom??abajo)){cerrarMenu();return;}
  panel.style.maxWidth=Math.max(0,derecha-izq-2*borde)+'px';
  panel.style.maxHeight=Math.max(0,abajo-arriba-2*borde)+'px';
  const p=panel.getBoundingClientRect();
  const x=Math.max(izq+borde,Math.min(a.right-p.width,derecha-p.width-borde));
  const y=a.bottom+distancia+p.height<=abajo-borde?a.bottom+distancia:a.top-p.height-distancia;
  panel.style.left=x+'px';
  panel.style.top=Math.max(arriba+borde,Math.min(y,abajo-p.height-borde))+'px';
 }
 function cerrarMenu(devolver=true){
  if(!menu)return;
  const {origen,panel}=menu;
  menu=null;
  document.removeEventListener('pointerdown',fueraMenu,true);
  document.removeEventListener('focusin',fueraMenu,true);
  window.removeEventListener('scroll',colocarMenu,true);
  window.removeEventListener('resize',colocarMenu);
  window.visualViewport?.removeEventListener('resize',colocarMenu);
  window.visualViewport?.removeEventListener('scroll',colocarMenu);
  origen.setAttribute('aria-expanded','false');panel.remove();
  if(devolver&&origen.isConnected)focus(origen);
 }
 function fueraMenu(e){if(menu&&!menu.panel.contains(e.target)&&!menu.origen.contains(e.target))cerrarMenu(false);}
 function abrirMenu(origen,ultimo=false){
  if(menu?.origen===origen){cerrarMenu();return;}
  cerrarMenu(false);
  const panel=document.createElement('div');
  panel.id='gq-menu';panel.className='gq-menu';panel.setAttribute('role','menu');
  panel.setAttribute('aria-label',origen.getAttribute('aria-label')||'Herramientas de cheques');
  panel.innerHTML=opcionesMenu(origen).map(([texto,accion,disabled])=>`<button type="button" role="menuitem" tabindex="-1" data-gq="${accion}" ${origen.dataset.id?`data-id="${escape(origen.dataset.id)}"`:''} ${disabled?'disabled':''}>${texto}</button>`).join('');
  const opciones=[...panel.querySelectorAll('button:not(:disabled)')];
  if(!opciones.length)return;
  menu={origen,panel};origen.setAttribute('aria-expanded','true');document.body.appendChild(panel);
  panel.onclick=e=>{const b=e.target.closest('[data-gq]');if(b&&!b.disabled){cerrarMenu();despachar(b);}};
  panel.onkeydown=e=>{
   if(e.key==='Escape'||e.key==='Tab'){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();}cerrarMenu();return;}
   if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
   e.preventDefault();
   const i=opciones.indexOf(document.activeElement);
   const k=e.key==='Home'?0:e.key==='End'?opciones.length-1:(i+(e.key==='ArrowDown'?1:-1)+opciones.length)%opciones.length;
   focus(opciones[k]);
  };
  document.addEventListener('pointerdown',fueraMenu,true);
  document.addEventListener('focusin',fueraMenu,true);
  window.addEventListener('scroll',colocarMenu,true);
  window.addEventListener('resize',colocarMenu);
  window.visualViewport?.addEventListener('resize',colocarMenu);
  window.visualViewport?.addEventListener('scroll',colocarMenu);
  colocarMenu();
  if(menu)focus(ultimo?opciones.at(-1):opciones[0]);
 }
 function despachar(b){
  if(b.disabled||b.getAttribute('aria-disabled')==='true')return;
  Promise.resolve(accion(b)).catch(e=>toast(e.message,'err'));
 }
 function detalle(titulo,pares){
  return modal(`<div class="m-head"><h2>${escape(titulo)}</h2><button type="button" class="x" onclick="closeModal()" aria-label="Cerrar detalle">×</button></div>
   <div class="m-body"><dl>${pares.map(([k,v])=>`<div class="kv"><dt>${escape(k)}</dt><dd>${escape(v===''?'—':v??'—')}</dd></div>`).join('')}</dl></div>`,'md');
 }
 function detalleCheque(q){
  const r=evidencia(q);
  return detalle(q.nombre,[['Número de trabajador',q.no_trab],['Contratista',q.contratista],['Semana',q.semana],['Periodo',q.periodo],['Importe','$'+money(q.importe)],
   ['Tipo de pago',q.tipo_pago],['Número de cheque',q.num_cheque],['Consecutivo',q.consecutivo],['Estatus del cheque',q.estatus],['Recibo',etiquetasFiscal[r.estado]],
   ['Resultado de verificación',r.texto],['Fuente',r.origen]]);
 }
 function detener(){
  token++;ocupado=false;
  if($('gq-progreso'))$('gq-progreso').textContent='Verificación detenida.';
  actualizarControles();
 }
 async function verificar(qs,progreso){if(ocupado)return;if(!permiso())throw Error('Tu cuenta es de consulta');if(!qs.length)throw Error('No hay cheques en la selección');const c=ctx,t=++token;ocupado=true;actualizarControles();let n=0;try{for(const q of qs){if(!vigente(c)||t!==token||!permiso())return;const textoProgreso=`Verificando ${++n} de ${qs.length}…`,node=$('gq-progreso');if(node){node.textContent=textoProgreso;node.title=q.nombre;}progreso?.(textoProgreso);
   const origenFila={importe:cents(q.importe),version:q.updated_at,fuente:huellaFiscal(q)};
   const r=await chqResolverNeto(q,{diagnostico:false});if(!vigente(c)||t!==token)return;
   const tieneFiscal=!!r.cfdi_prioritario||/PDF.*TIMBRADO|XML|CFDI/i.test(r.origen||'');let estado='REVISAR',texto=r.error||'Sin recibo fiscal verificable';
   if(!r.error&&tieneFiscal){estado=origenFila.importe===cents(r.neto)?'COINCIDE':'DIFERENCIA';texto=estado==='COINCIDE'?'✓ Cuadra al centavo':'Diferencia: recibo $'+money(r.neto);}
   else if(!r.error)texto='Sólo NOI disponible: falta CFDI verificable';
   revision.set(q.id,{estado,texto,origen:r.origen,...origenFila});
   const fila=[...$('gq-tbody').querySelectorAll('[data-cheque]')].find(x=>x.dataset.cheque===q.id);
   const actual=fila&&CHEQUES.find(x=>x.id===q.id&&x.obra_id===c.obra&&!x.eliminado);
   if(fila&&actual){fila.querySelector('[data-recibo]').innerHTML=fiscal(actual);fila.querySelector('[data-recibo-movil]').innerHTML=fiscal(actual,true);}
  }}finally{if(t===token)ocupado=false;if(t===token&&vigente(c)&&$('gq-progreso')){const p=$('gq-progreso');p.textContent=`Verificados: ${n}`;p.title='Los importes y folios se conservan.';actualizarControles();}}
 }
 function buscar(id){const q=fuente().find(x=>x.id===id);if(!q)throw Error('El cheque ya no está disponible en este centro');return q;}
 async function revisarFuentes(id,visible=()=>true,volver=null){
  if(ocupado||!permiso())return;
  const c=ctx,q=buscar(id),lector=window.PLATINUM_ARCHIVO_RECIBOS;
  const datos=await lector.cotejar(q);
  if(vigente(c)&&permiso()&&visible())return lector.abrirCheque(q,datos,async()=>{
   if(!vigente(c)||!visible()||!permiso())return;
   await verificar([buscar(id)]);
   volver?.();
  },!!volver);
 }
 function revisarLista(){
  const c=ctx,ids=new Set(filas().map(q=>q.id));
  if(!ids.size)throw Error('No hay cheques en la selección');
  modal(`<div class="m-head"><h2>Revisar fuentes de cheques</h2><button type="button" class="x" onclick="closeModal()" aria-label="Cerrar revisión">×</button></div>
   <div class="m-body" id="gq-fuentes-lista"><p class="fhint">${ids.size} cheque(s) según los filtros al abrir. Consulta el cotejo PDF, XML y NOI de cada cheque.</p>
   <div class="gq-revision-acciones"><button type="button" class="btn" data-revision="verificar">Verificar selección</button><button type="button" class="btn" data-revision="detener" hidden>Detener</button>
   <span data-revision-progreso role="status" aria-live="polite"></span></div>
   <p data-revision-totales></p><div class="gq-revision-tabla"><table aria-label="Fuentes de los cheques seleccionados"><thead><tr><th>Trabajador</th><th>Semana</th><th>Recibo</th><th>Fuente y resultado</th><th>Detalle</th></tr></thead><tbody></tbody></table></div>
   <div class="lista-pagina" data-revision-paginas aria-label="Páginas de la revisión" hidden></div></div>`,'xl');
  const panel=$('gq-fuentes-lista'),visible=()=>vigente(c)&&$('gq-fuentes-lista')===panel;
  const seleccion=()=>fuente().filter(q=>ids.has(q.id));
  const avance=panel.querySelector('[data-revision-progreso]'),ver=panel.querySelector('[data-revision="verificar"]'),stop=panel.querySelector('[data-revision="detener"]');
  const orden=['DIFERENCIA','REVISAR','SIN_VERIFICAR','COINCIDE'];
  let abriendo=false;
  function pintarRevision(){
   if(!visible())return;
   const grupos=Object.fromEntries(orden.map(estado=>[estado,[]]));
   for(const q of seleccion()){const r=evidencia(q);grupos[r.estado].push({q,r});}
   panel.querySelector('[data-revision-totales]').textContent=orden.map(estado=>etiquetasFiscal[estado]+' '+grupos[estado].length).join(' · ');
   const filas=orden.flatMap(estado=>grupos[estado]),paginas=panel.querySelector('[data-revision-paginas]');
   const vista=window.PLATINUM_DATOS?.pagina('cheques-fuentes',filas,paginas,JSON.stringify([...ids]),pintarRevision,70)??filas;
   panel.querySelector('tbody').innerHTML=vista.map(({q,r})=>{
    return `<tr><td>#${escape(q.no_trab)} ${escape(q.nombre)}</td><td>${escape(q.semana)}</td><td>${fiscal(q)}</td><td>${escape([r.origen,r.texto].filter(Boolean).join(' · '))}</td><td><button type="button" class="btn" data-revision-id="${escape(q.id)}">Abrir fuentes</button></td></tr>`;
   }).join('');
  }
  panel.onclick=async e=>{
   const b=e.target.closest('button');
   if(!b||!visible()||!permiso())return;
   try{
    if(b===stop){detener();avance.textContent='Verificación detenida.';return;}
    if(ocupado||abriendo)return;
    if(b.dataset.revisionId){
     abriendo=true;b.disabled=true;
     try{await revisarFuentes(b.dataset.revisionId,visible,pintarRevision);}finally{abriendo=false;b.disabled=false;}
    }
    if(b===ver){
     ver.disabled=true;stop.hidden=false;
     try{await verificar(seleccion(),texto=>{if(visible())avance.textContent=texto;});}
     finally{ver.disabled=false;stop.hidden=true;if(visible())avance.textContent=$('gq-progreso').textContent;pintarRevision();}
    }
   }catch(error){if(visible())avance.textContent=error.message;}
  };
  pintarRevision();
 }
 async function guardarFolios(id,numero,consecutivo){
  if(!permiso())throw Error('Tu cuenta es de consulta');const c={obra:OBRA?.id,user:USER?.id},q=CHEQUES.find(x=>x.id===id&&x.obra_id===c.obra&&!x.eliminado);if(!q)throw Error('Actualiza el cheque antes de corregir folios');
  markWrite();const r=await sb.rpc('control_corregir_folios_cheque',{p_cheque:q.id,p_numero:numero,p_consecutivo:consecutivo,p_version:q.updated_at});if(r.error)throw Error(r.error.message);const out=r.data;
  if(out?.id!==q.id||out.obra_id!==q.obra_id||cents(out.importe)!==cents(q.importe)||out.estatus!==q.estatus||out.trabajador_id!==q.trabajador_id||out.semana!==q.semana)throw Error('Respuesta incompleta al corregir folios; actualiza la lista');
  if(OBRA?.id===c.obra&&USER?.id===c.user){const idx=CHEQUES.findIndex(x=>x.id===q.id);if(idx>=0)CHEQUES[idx]=out;revision.delete(q.id);}return out;
 }
 function editar(id){if(!permiso())throw Error('Tu cuenta es de consulta');if(ctx?.obra!==OBRA?.id||ctx?.user!==USER?.id){salir();ctx={obra:OBRA?.id,user:USER?.id};}const q=buscar(id);const c=ctx;
  modal(`<div class="m-head"><h2>Corregir folios · ${escape(q.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div><div class="m-body"><p>${escape(q.semana)} · $${money(q.importe)} · ${escape(q.estatus)}. Sólo se actualizarán los identificadores físicos.</p><label>Número de cheque<input id="gf-numero" value="${escape(q.num_cheque)}" maxlength="80"></label><label>Consecutivo<input id="gf-consecutivo" value="${escape(q.consecutivo)}" maxlength="80"></label><p id="gf-error" role="alert"></p></div><div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button><button class="btn dark" id="gf-guardar">Guardar folios</button></div>`,'md');
  const form=$('gf-guardar');form.onclick=async()=>{if(!vigente(c)||!permiso())return;const numero=$('gf-numero').value.trim(),consecutivo=$('gf-consecutivo').value.trim();form.disabled=true;try{
   await guardarFolios(q.id,numero,consecutivo);
   if(!vigente(c))return;if($('gf-guardar')===form)closeModal();pintar();renderChqStats();toast('Folios corregidos. Importe y nómina intactos.','ok');
  }catch(e){if(vigente(c)&&$('gf-guardar')===form)$('gf-error').textContent=e.message;}finally{if($('gf-guardar')===form)form.disabled=false;}};
 }
 async function accion(b){if(!vigente(ctx))return;const a=b.dataset.gq;
  if(a==='herramientas'||a==='fila-menu')return abrirMenu(b);
  if(a==='detalle')return detalleCheque(buscar(b.dataset.id));
  if(a==='centro')return detalle(OBRA.nombre,[['Empresa',typeof razonSocialEmpresa==='function'?razonSocialEmpresa():null],['Centro',OBRA.nombre],['Tipo',OBRA.tipo],['Registro patronal',OBRA.registro_patronal],['SIROC',OBRA.tipo==='OFICINA'?'No aplica':OBRA.registro_siroc],['Ubicación',OBRA.ubicacion]]);
  if(a==='asistente')return typeof sbGo==='function'?sbGo(iaAbrir):iaAbrir();
  if(a==='importar'||a==='actualizar'||a==='preparacion')return accesos[a]?.();
  if(a==='exportar')return exportCheques(filas());if(a==='chequeras')return openChequerasFisicas();if(!permiso())throw Error('Tu cuenta es de consulta');if(a==='detener')return detener();
  if(a==='cancelar-reponer')return window.PLATINUM_CHEQUES_REPOSICION.cancelar(b.dataset.id);if(a==='editar')return editar(b.dataset.id);if(a==='uno')return verificar([buscar(b.dataset.id)]);if(a==='verificar')return verificar(filas());if(a==='captura')return openChequeForm(buscar(b.dataset.id).id);if(a==='nuevo')return openChequeForm(null);if(a==='folios')return openControlFolios();if(a==='reuniones')return openReunionesEntrega();if(a==='tradicional')return PLATINUM_RECIBOS_VERIFICACION.abrir(Number(filtros.semana)||0);if(a==='fuentes')return revisarFuentes(b.dataset.id);if(a==='fuentes-lista')return revisarLista();
 }
 function refrescar(){if(!root||!vigente(ctx))return;if(!$('gq-tbody'))return montar(root.id);
  const qs=fuente();
  for(const [k,values] of [['contratista',qs.map(c=>c.contratista)],['semana',qs.map(c=>normSem(c.semana))]]){
   const sel=$('gq-'+k);if(!sel)continue;const prev=new Set([...sel.querySelectorAll('option')].map(x=>x.value));
   for(const v of [...new Set(values.filter(Boolean).map(String))].sort())if(!prev.has(v)){const o=document.createElement('option');o.value=v;o.textContent=k==='semana'?'S'+v:v;sel.appendChild(o);}
  }
  renderChqStats();pintar();
 }
 function salir(){cerrarMenu(false);token++;ctx=null;root=null;ocupado=false;revision.clear();accesos={};}
 window.PLATINUM_GESTION_CHEQUES=Object.freeze({montar,refrescar,salir,ocultar:()=>cerrarMenu(false),filas,editar,verificar,guardarFolios});
})();
