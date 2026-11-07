/* Superficie única de pagos. Los formularios especializados se abren como
   herramientas; la selección semanal y la evidencia permanecen en este eje. */
(function(){
 'use strict';
 let tab='flujo';
 let siguiente=null,local={tipo:'PERSONAS',q:'',persona:null},ultimo=null,firma=null,derivados=0,leidos=0,turno=false;
 const $s=id=>$('cs-'+id),context=()=>({obra_id:OBRA?.id,usuario_id:USER?.id,visible:VIEW==='conciliador'});
 const service=window.PLATINUM_CONCILIACION_SEMANAL.useConciliacionSemanal({context,rpc:(...a)=>sb.rpc(...a),onChange:pintar});
 const boton=(text,accion,extra='',disabled=false)=>`<button class="btn" data-cs="${accion}" ${extra} ${disabled?'disabled':''}>${text}</button>`;
 const tabla=(h,r)=>ctrlTabla(h,r,'No hay registros para esta semana y filtro.');
 function actual(){const d=service.estado().data;if(!d||d.obra_id!==OBRA?.id||VIEW!=='conciliador')throw Error('Recupera la semana antes de continuar');return d;}
 function seguro(fn){return(...a)=>Promise.resolve().then(()=>fn(...a)).catch(e=>toast(e.message,'err'));}
 function firmaDatos(sem){const xs=[typeof CHEQUES==='undefined'?[]:CHEQUES,typeof PAGOS==='undefined'?[]:PAGOS,typeof CIERRES==='undefined'?[]:CIERRES,typeof CTRLNOI==='undefined'?[]:CTRLNOI,typeof DOCSX==='undefined'?[]:DOCSX];return JSON.stringify(xs.map(rows=>rows.filter(x=>Number(String(x.semana||'').replace(/\D/g,''))===sem).map(x=>[x.id,x.updated_at,x.estatus,x.estado,x.importe,x.monto_noi,x.nomina_neto,x.hash,x.snapshot_sha256])));}
 function montar(){if(VIEW!=='conciliador')return;if(tab==='cheques'&&service.estado().contexto?.obra_id===OBRA?.id&&service.estado().contexto?.usuario_id===USER?.id){window.PLATINUM_GESTION_CHEQUES?.refrescar();return;}const s=service.estado();if(s.contexto&&(s.contexto.obra_id!==OBRA?.id||s.contexto.usuario_id!==USER?.id))salir();if(service.estado().data?.obra_id!==OBRA?.id&&!service.estado().loading){const p=siguiente||{};siguiente=null;return cargar(p.semana??null,p.cierre??null,p.paso);}const d=service.estado().data;if(d&&firma!==null&&(firma!==firmaDatos(d.semana)||derivados!==leidos)&&!service.estado().loading){if(window.PLATINUM_CONCILIADOR.estaCapturando()){const e=$s('actualizando');if(e)e.textContent='Hay cambios disponibles. Termina la captura y actualiza.';}else return cargar(d.semana,d.detalle?.cierre.id||null,null,true);}pintar(service.estado());}
 async function abrir(paso=null,semana=null,cierre=null){
  if(!OBRA)return;tab='flujo';closeModal();siguiente={paso,semana,cierre};
  if(VIEW!=='conciliador'){setView('conciliador');return;}
  siguiente=null;return cargar(cierre?null:semana??service.estado().data?.semana??null,cierre,paso);
 }
 async function cargar(semana,cierre=null,paso=null,conservar=false){
  window.PLATINUM_CONCILIADOR.desmontar();ultimo=null;local={tipo:'PERSONAS',q:'',persona:null};
  const version=derivados,d=await service.cargar(semana,cierre,{conservar});if(!d)return;leidos=version;firma=firmaDatos(d.semana);if(derivados!==leidos)programarDerivados();
  window._CTRLCIERRES=d.cierres;
  if(d.detalle){PLATINUM_FLOWS.cargarContexto(d.detalle,d.permisos);await window.PLATINUM_CONCILIADOR.mostrarCierre(d.detalle,d.permisos,{expediente:d.expediente,host:'cs-stepper',paso,contexto:d});}
 }
 function pintar(s){
  const node=$('conciliador-root');if(!node||VIEW!=='conciliador')return;
  if(s.loading&&s.data){const e=$s('actualizando');if(e)e.textContent='Actualizando comprobantes…';return;}if(s.loading||!s.data){
   node.innerHTML=`<h2>⚖️ Conciliador General</h2><p role="status">${s.loading?'Consultando '+(s.seleccion?.semana?'S'+s.seleccion.semana:'la semana actual')+'…':esc(s.error||'Selecciona una semana.')}</p>${s.error?boton('Reintentar','recargar'):''}`;
   node.onclick=e=>{if(e.target.closest('[data-cs="recargar"]'))seguro(()=>cargar(s.seleccion?.semana??null,s.seleccion?.cierre))();};return;
  }
  const d=s.data;if(ultimo===d&&$s('stepper'))return;ultimo=d;
  const cs=d.cierres.filter(c=>c.semana===d.semana),noActual=d.modo!=='ACTUAL';
  node.innerHTML=`<style>.cs-cabecera{display:flex;gap:12px;align-items:end;flex-wrap:wrap;padding:15px 0;border-bottom:1px solid var(--border)}.cs-cabecera h2{margin:0;flex:1;min-width:230px}.cs-cabecera label{display:grid;gap:5px;min-width:180px;font-size:12px}.cs-menu{position:relative}.cs-menu[open] summary{background:var(--blue-bg)}.cs-menu-lista{position:absolute;right:0;z-index:30;min-width:250px;padding:9px;box-shadow:0 8px 26px #0003;background:var(--card);border:1px solid var(--border);border-radius:10px}.cs-menu-lista button{display:block;width:100%;text-align:left;margin:3px 0}.cs-badge{border-radius:14px;padding:4px 9px;font-size:12px;background:var(--amber-bg);color:var(--amber);border:1px solid currentColor}.cs-rojo{color:var(--red);background:var(--red-bg)}.cs-registros{max-height:52vh;overflow:auto}.cs-registros table{min-width:820px}.cs-historico{padding:10px;border:1px solid var(--amber);border-radius:9px;background:var(--amber-bg);margin:10px 0}</style>
   <style>#conciliador-root .cg-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}#cs-tabs{margin:14px 0;border-bottom:1px solid var(--border);padding-bottom:10px}#cs-tabs [aria-selected="true"]{background:var(--accent);color:#fff}#cs-gestion label{display:grid;gap:4px;font-size:12px}#cs-gestion .gq-filtros{margin:12px 0}#cs-gestion td:last-child{min-width:170px}</style>
   <header class="cs-cabecera"><h2>⚖️ Conciliador General</h2><label>Semana del flujo<select id="cs-semana">${d.semanas.map(w=>`<option value="${w.semana}" ${w.semana===d.semana?'selected':''}>Semana ${w.semana}${w.semana===d.semana_actual?' · Actual':''}</option>`).join('')}</select></label>${cs.length>1?`<label>Periodicidad / cierre<select id="cs-periodo">${cs.map(c=>`<option value="${c.id}" ${c.id===d.detalle?.cierre.id?'selected':''}>${esc(c.periodo)} · ${esc(c.estado)}</option>`).join('')}</select></label>`:''}${boton('↻ Actualizar','recargar')}${herramientas(d)}</header>
   <p class="fhint">${esc(OBRA.nombre)} · ${esc(d.desde)} al ${esc(d.hasta)} · ${noActual?'Consulta '+(d.modo==='HISTORICO'?'histórica':'futura'):'Semana actual'}</p>
   <div class="cg-toolbar" role="tablist" aria-label="Herramientas del Conciliador" id="cs-tabs"><button type="button" class="btn" role="tab" id="cs-tab-flujo" aria-controls="cs-flujo" aria-selected="${tab==='flujo'}" tabindex="${tab==='flujo'?0:-1}" data-cs="tab" data-tab="flujo">Flujo de Conciliación</button><button type="button" class="btn" role="tab" id="cs-tab-cheques" aria-controls="cs-gestion" aria-selected="${tab==='cheques'}" tabindex="${tab==='cheques'?0:-1}" data-cs="tab" data-tab="cheques">Gestión de Cheques</button></div><section id="cs-flujo" role="tabpanel" aria-labelledby="cs-tab-flujo" ${tab!=='flujo'?'hidden':''}>
   ${d.solo_lectura?'<div class="cs-historico" role="status"><b>Sólo lectura.</b> El flujo histórico conserva sus fuentes y cierres. En Gestión de Cheques, RRHH puede corregir sólo los folios físicos sin cambiar importe ni estatus.</div>':''}
   ${resumen(d)}<p id="cs-actualizando" class="fhint" role="status"></p><div id="cs-alertas"></div>
   <details id="cs-datos" ${noActual?'open':''}><summary>Trabajadores, comprobantes y cheques · S${d.semana}</summary><div class="cg-toolbar">${[['PERSONAS','Por trabajador'],['COMPROBANTES','Globales e individuales'],['CHEQUES','Cheques y entrega']].map(([t,n])=>boton(n,'tipo',`data-tipo="${t}"`)).join('')}<input id="cs-q" placeholder="Buscar número, nombre, contratista o folio…" aria-label="Buscar en la semana"></div><div id="cs-registros" class="cs-registros"></div></details>
   <section id="cs-stepper">${d.detalle?'':'<div class="cs-historico">Esta semana aún no tiene fotografía de cierre. Sus comprobantes y cheques se pueden consultar arriba.</div>'+(!d.solo_lectura?boton('Crear fotografía de esta semana','nueva'):'')}</section></section><section id="cs-gestion" role="tabpanel" aria-labelledby="cs-tab-cheques" ${tab!=='cheques'?'hidden':''}><div id="cs-cheques"></div></section>`;
  node.onclick=e=>{const b=e.target.closest('[data-cs]');if(b)seguro(()=>accion(b))();};
  $s('semana').onchange=e=>seguro(()=>cargar(Number(e.target.value)))();
  if($s('periodo'))$s('periodo').onchange=e=>seguro(()=>cargar(d.semana,e.target.value))();
  $s('q').oninput=e=>{local.q=e.target.value;registros(d);};alertas(d);registros(d);
  $s('tabs').onkeydown=e=>{const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const t=e.key==='Home'?'flujo':e.key==='End'?'cheques':tab==='flujo'?'cheques':'flujo';seleccionarTab(t);$s('tab-'+t).focus();};
  if(tab==='cheques')window.PLATINUM_GESTION_CHEQUES.montar('cs-cheques');
 }
 function herramientas(d){return`<details class="cs-menu"><summary class="btn">🧰 Herramientas de Pago</summary><div class="cs-menu-lista">${boton('Control de folios y saltos','folios','',d.solo_lectura)}${boton('Reuniones de entrega','reuniones','',d.solo_lectura)}${boton('Chequeras de 50 · liberación y legajos','chequeras')}${boton('Bloques por semana','bloques','',d.solo_lectura)}${boton('Legajos para entrega','legajos')}${boton('Exportar cheques de S'+d.semana,'exportar-cheques')}${boton('Exportar resumen de S'+d.semana,'exportar-resumen')}${!d.solo_lectura?boton('Nuevo cheque','nuevo-cheque')+boton('Finiquito por transferencia autorizada','transferencia'):''}<small>Las herramientas de modificación sólo están disponibles en el contexto actual; conservan sus permisos.</small></div></details>`;}
 function resumen(d){const pendientes=d.cheques.filter(q=>q.estatus==='PENDIENTE').length,rechazos=d.transferencias.filter(p=>p.estado==='RECHAZADO'&&!p.repetido).length;return`<div class="stats" style="margin:12px 0"><div class="stat"><div class="n">${d.personas.length}</div><div class="l">Trabajadores en fuentes de S${d.semana}</div></div><div class="stat ${rechazos?'r':'g'}"><div class="n">${rechazos}</div><div class="l">Transferencias rechazadas</div></div><div class="stat ${pendientes?'a':'g'}"><div class="n">${pendientes}</div><div class="l">Cheques pendientes de expedir</div></div><div class="stat"><div class="n">${d.cheques.filter(q=>q.estatus==='EXPEDIDO').length}</div><div class="l">Expedidos · entrega por confirmar</div></div></div>`;}
 function alertas(d){$s('alertas').innerHTML=d.alertas.length?`<details open><summary><span class="cs-badge ${d.alertas.some(a=>a.severidad==='ROJO')?'cs-rojo':''}">${d.alertas.length} aviso(s) de esta semana requieren revisión</span></summary><div class="cs-registros" style="max-height:28vh">${tabla(['No. / trabajador','Importe','Situación'],d.alertas.map(a=>`<tr><td>#${esc(a.numero??'—')} ${esc(a.nombre)}</td><td>$${money(a.importe)}</td><td><span class="cs-badge ${a.severidad==='ROJO'?'cs-rojo':''}">${esc(a.descripcion)}</span></td></tr>`))}</div></details>`:'<p class="fhint">No se detectaron rechazos, pendientes ni saldos faltantes en las fuentes consultadas. Una semana sin base no se certifica como pagada.</p>';}
 function registros(d){
  const q=local.q.trim().toLocaleUpperCase('es-MX'),filter=r=>!q||Object.values(r).filter(x=>typeof x!=='object').join(' ').toLocaleUpperCase('es-MX').includes(q);
  let h,rows;
  if(local.tipo==='CHEQUES'){h=['No. / trabajador','Concepto','Importe','Número / consecutivo','Estatus','Acción'];rows=d.cheques.filter(filter).map(c=>`<tr><td>#${esc(c.no_trab??'—')} ${esc(c.nombre)}</td><td>${esc(c.tipo_pago)}</td><td>$${money(c.importe)}</td><td>${esc(c.num_cheque||'Sin número')} / ${esc(c.consecutivo||'Sin consecutivo')}</td><td>${esc(c.estatus)}</td><td>${boton(d.solo_lectura?'Ver detalle':'Abrir captura','cheque',`data-id="${c.id}"`)}</td></tr>`);}
  else if(local.tipo==='COMPROBANTES'){h=['No. / trabajador','Fecha / origen','Importe','Banco / cuenta','Folio','Estado','Original'];rows=d.transferencias.filter(filter).map(p=>`<tr><td>#${esc(p.numero??'—')} ${esc(p.nombre||p.titular)}</td><td>${esc(p.fecha||'Sin fecha')}<br>${esc(p.clase)}</td><td>$${money(p.importe)}</td><td>${esc(p.banco)} · ${esc(p.cuenta||'—')}</td><td>${esc(p.folio||'Sin folio')}</td><td>${esc(p.estado)}${p.repetido?' · evidencia repetida':''}</td><td>${p.archivo?boton('Abrir PDF','pdf',`data-id="${p.id}"`):'Sin original archivado'}</td></tr>`);}
  else{h=['No. / trabajador','Contratista','Fuente / esperado','Transferencia','Cheque físico','Saldo','Situación'];rows=d.personas.filter(filter).map(p=>`<tr><td>#${esc(p.numero??'—')} ${esc(p.nombre)}</td><td>${esc(p.contratista)}</td><td>${esc(p.fuente)}<br>${p.esperado==null?'Por verificar':'$'+money(p.esperado)}</td><td>$${money(p.banco)}</td><td>$${money(p.cheque)}</td><td>${p.saldo==null?'Sin base':'$'+money(p.saldo)}</td><td>${esc(p.estado)}${p.cheques_pendientes?' · cheque sin expedir':''}${p.por_entregar?' · entrega pendiente':''}</td></tr>`);}
  $s('registros').innerHTML=tabla(h,rows);
 }
 async function accion(b){
  const d=actual(),a=b.dataset.cs;
  if(a==='tab')return seleccionarTab(b.dataset.tab);
  if(a==='recargar')return cargar(d.semana,d.detalle?.cierre.id||null);
  if(a==='tipo'){local.tipo=b.dataset.tipo;return registros(d);}
  if(a==='pdf'){const p=d.transferencias.find(p=>p.id===b.dataset.id);if(p?.archivo)return PLATINUM_CONCILIADOR.archivoBancario(p.archivo);return;}
  if(a==='exportar-cheques')return exportCheques(d.cheques);
  if(a==='exportar-resumen')return ctrlExportar('CONCILIACIÓN · S'+d.semana,['NO.','TRABAJADOR','CONTRATISTA','ESPERADO','BANCO','CHEQUE','SALDO','ESTADO'],d.personas.map(p=>[p.numero,p.nombre,p.contratista,p.esperado,p.banco,p.cheque,p.saldo,p.estado]),'CONCILIACION_S'+d.semana,'CONCILIACION');
  if(a==='chequeras')return openChequerasFisicas();if(a==='legajos')return openLegajos();
  if(a==='cheque'&&d.solo_lectura){const c=d.cheques.find(c=>c.id===b.dataset.id);if(!c)return;return modal(`<div class="m-head"><h2>Cheque · consulta S${d.semana}</h2><button class="x" onclick="closeModal()">×</button></div><div class="m-body">${tabla(['Campo','Dato'],[['Trabajador',c.nombre],['Importe','$'+money(c.importe)],['Número',c.num_cheque||'Sin número'],['Consecutivo',c.consecutivo||'Sin consecutivo'],['Estatus',c.estatus]].map(([k,v])=>'<tr><td>'+esc(k)+'</td><td>'+esc(v)+'</td></tr>'))}</div>`,'md');}
  if(d.solo_lectura)throw Error('Esta semana es de consulta; vuelve a la semana actual para abrir herramientas de modificación');
  if(a==='folios')return openControlFolios();if(a==='reuniones')return openReunionesEntrega();if(a==='bloques')return openBloques();
  if(a==='nuevo-cheque')return openChequeForm(null);if(a==='transferencia')return openFiniquitoTransferenciaAdmin();
  if(a==='nueva')return PLATINUM_CONCILIADOR.nueva(d.semana);
  if(a==='cheque'){const c=d.cheques.find(c=>c.id===b.dataset.id);if(!c)return;const idx=CHEQUES.findIndex(q=>q.id===c.id);if(idx<0)CHEQUES.push(c);else CHEQUES[idx]=c;return openChequeForm(c.id);}
 }
 function seleccionarTab(t){if(!['flujo','cheques'].includes(t))return;tab=t;for(const k of ['flujo','cheques']){const b=$s('tab-'+k);b.setAttribute('aria-selected',String(k===t));b.tabIndex=k===t?0:-1;}$s('flujo').hidden=t!=='flujo';$s('gestion').hidden=t!=='cheques';if(t==='cheques')window.PLATINUM_GESTION_CHEQUES.montar('cs-cheques');else return montar();}
 function programarDerivados(){if(turno||VIEW!=='conciliador'||tab!=='flujo')return;turno=true;const centro=OBRA?.id,user=USER?.id;(window.requestAnimationFrame||((f)=>Promise.resolve().then(f)))(()=>{turno=false;if(OBRA?.id===centro&&USER?.id===user&&VIEW==='conciliador'&&tab==='flujo')seguro(montar)();});}
 function invalidarDerivados(){if(VIEW!=='conciliador')return;derivados++;programarDerivados();}
 function salir(){derivados=0;leidos=0;tab='flujo';window.PLATINUM_GESTION_CHEQUES?.salir();service.invalidar();window.PLATINUM_CONCILIADOR.desmontar();ultimo=null;firma=null;}
 window.PLATINUM_CONCILIADOR_SEMANAL=Object.freeze({invalidarDerivados,montar:seguro(montar),abrir:seguro(abrir),cierre:seguro((id,paso)=>abrir(paso,null,id)),salir,refrescar:seguro(()=>{const d=actual();return cargar(d.semana,d.detalle?.cierre.id||null);}),estado:()=>service.estado()});
})();
