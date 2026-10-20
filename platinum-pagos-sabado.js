/* Coordinación de pagos pendientes. No calcula nómina ni expide cheques.
 * La elegibilidad, el horario y los importes se comprueban en PostgreSQL. */
(function(root){
 'use strict';
 let cfg=null,state=null,busy=false,sequence=0,poll=null;
 const labels={SIN_SERVICIO_O_EN_REVISION:'Sin servicio / por revisar',REVISAR_DOBLE_COMPROBANTE:'Revisar cheque expedido y transferencia',PAGO_CHEQUE_REGISTRADO:'Pago por cheque registrado',TRANSFERENCIA_REGISTRADA:'Transferencia registrada',REVISAR_IMPORTES_BANCARIOS:'Pago registrado: revisar neto o parcial',REVISAR_APLICACIONES:'Revisar aplicaciones existentes',CHEQUE_PENDIENTE_EXISTENTE:'Cheque pendiente: aún no es pago',REVISAR_VARIOS_CIERRES:'Revisar varios cierres',SIN_OBLIGACION:'Sin obligación positiva',PENDIENTE_NOI:'Pago pendiente · falta NOI',REVISAR_CONCILIACION:'Revisar diferencia NOI',PENDIENTE_AUTORIZACION:'Pago pendiente · falta autorizar',REVISAR_RECIBOS_NOI:'Revisar recibos / NOI',SIN_CALENDARIO:'Revisar calendario del centro',ESPERAR_SABADO_12:'Pago pendiente · esperar sábado 12:00',ELEGIBLE_CONFIRMACION:'Sin pago registrado · requiere confirmar cheque'};
 const context=()=>{if(!cfg)throw Error('La revisión de pagos no terminó de cargar. Recarga la página.');return cfg.context();};
 const el=id=>cfg.$(id),esc=x=>cfg.esc(x),money=x=>'$'+cfg.money(x),table=(h,r)=>cfg.table(h,r,'Sin registros para este alcance y filtro.');
 const button=(label,action,disabled=false)=>`<button class="btn" ${disabled?'disabled':''} onclick="PLATINUM_PAGOS_SABADO.${action}">${label}</button>`;
 const fecha=x=>x?new Date(x).toLocaleString('es-MX',{timeZone:'America/Mexico_City'}):'Sin calendario';
 const fin=s=>s.mode==='FINIQUITOS',retiro=s=>s.mode==='RETIROS';
 const permiso=s=>fin(s)?s.permissions.transferencia:retiro(s)?s.permissions.retirar:s.permissions.confirmar;
 const clave=(s,r)=>fin(s)||retiro(s)?r.id:r.trabajador_id;
 const listo=(s,r)=>retiro(s)||r.estado===(fin(s)?'LISTO_TRANSFERENCIA':'ELEGIBLE_CONFIRMACION');
 const revisable=(s,r)=>retiro(s)||(fin(s)?r.estado==='LISTO_TRANSFERENCIA':!['TRANSFERENCIA_REGISTRADA','PAGO_CHEQUE_REGISTRADO','SIN_OBLIGACION','SIN_SERVICIO_O_EN_REVISION'].includes(r.estado));
 function filas(s){return retiro(s)?s.data.retiros:s.data.filas;}
 function elegidos(s){return [...s.selected].map(id=>s.selection.get(id)).filter(Boolean);}
 function configure(options){cfg=options;if(poll)clearInterval(poll);poll=setInterval(()=>avisarDesdeContexto(),60000);}
 function current(){if(!state||context().obra?.id!==state.obraId)throw Error('Cambió el centro de trabajo. Vuelve a abrir la revisión.');return state;}
 function valid(s,t){return state===s&&sequence===t&&context().obra?.id===s.obraId&&!!el('pago-sabado-body');}
 async function call(a,j){const r=await context().sb.rpc('control_pagos_sabado',{p_accion:a,p_datos:j});if(r.error)throw Error(r.error.message||'No se pudo verificar la revisión');if(!r.data||typeof r.data!=='object')throw Error('La base no confirmó una respuesta completa');return r.data;}
 async function operation(fn){if(busy)return;busy=true;try{return await fn();}catch(e){cfg.toast(e.message,'err');}finally{busy=false;}}
 function frame(){const s=current();cfg.modal(`<div class="m-head"><h2>💳 Revisión de pagos · S${s.sem}</h2><small>${esc(context().empresaNombre)} · ${esc(context().obra.nombre)}</small><button class="btn" style="margin-left:auto" onclick="PLATINUM_PAGOS_SABADO.manual()" aria-label="Guía de revisión de pagos">?</button><button class="x" onclick="PLATINUM_PAGOS_SABADO.cerrar()">×</button></div><div class="m-body"><p class="fhint">La nómina queda como pago pendiente hasta registrar evidencia. Sólo los finiquitos conservan cheque por defecto. Sábado 12:00, horario de Ciudad de México: revisar y confirmar, nunca expedir automáticamente.</p><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end"><label>Semana<input id="pago-sabado-sem" type="number" min="1" max="53" value="${s.sem}" onchange="PLATINUM_PAGOS_SABADO.semana(this.value)" style="width:85px"></label>${button('Nómina pendiente',"modo('PROPUESTA')")}${button('Finiquitos por transferencia',"modo('FINIQUITOS')")}${s.permissions.retirar?button('Retirar automáticos anteriores',"modo('RETIROS')"):''}${button('↻ Actualizar','cargar()')}</div><div id="pago-sabado-stale" hidden style="background:var(--amber-bg);padding:10px;margin-top:8px;color:var(--amber)">Cambió una fuente. Actualiza antes de confirmar; no sobrescribimos tus notas.</div><div id="pago-sabado-body"></div></div>`,'xl');}
 async function abrir(sem=null,mode='PROPUESTA'){
  try{const obraId=context().obra?.id;if(!obraId)throw Error('Selecciona empresa y centro de trabajo.');const permissions=await call('PERMISOS',{obra_id:obraId});if(context().obra?.id!==obraId)return;
   mode=['RETIROS','FINIQUITOS'].includes(mode)?mode:'PROPUESTA';
   state={obraId,sem:Number(sem)||cfg.week(),permissions,mode,page:0,q:'',filter:mode==='PROPUESTA'?'PENDIENTES':'',selected:new Set(),selection:new Map(),stale:false,token:null,key:null,note:''};frame();await cargar();
  }catch(e){cfg.toast(e.message,'err');}
 }
 function guardarNota(){if(state&&el('pago-sabado-reason'))state.note=el('pago-sabado-reason').value;}
 async function cargar(){const s=current(),t=++sequence;guardarNota();el('pago-sabado-body').innerHTML='<p>Verificando pagos globales, individuales, NOI y cheques…</p>';
  try{const d=await call(s.mode,{obra_id:s.obraId,semana:s.sem,pagina:s.page,q:s.q,estado:s.filter});if(!valid(s,t))return;
   if(s.token&&s.token!==d.huella&&s.selected.size)cfg.toast('Cambió una fuente. Se limpió la selección para revisar la propuesta actual.','err');
   if(s.token!==d.huella){s.selected.clear();s.selection.clear();s.key=null;}s.token=d.huella;s.data=d;s.stale=false;el('pago-sabado-stale').hidden=true;render();
  }catch(e){if(valid(s,t))el('pago-sabado-body').innerHTML=`<p role="alert">${esc(e.message)}</p>${button('Reintentar','cargar()')}`;}
 }
 function render(){guardarNota();const s=current(),d=s.data;const isRetiro=s.mode==='RETIROS',rows=isRetiro?d.retiros:d.filas;
  const info=isRetiro?`<h3>Retirar pendientes automáticos anteriores</h3><p>Se muestran únicamente nóminas automáticas sin número ni consecutivo, no expedidas, no entregadas y sin aplicaciones. Se conservan en papelera con auditoría. No se retiran finiquitos, manuales ni lotes ya confirmados.</p>`:`<h3>Pago pendiente no significa cheque</h3><p>Revisión disponible desde <b>${esc(fecha(d.fecha_revision))}</b>. ${d.habilitado?'El horario ya se cumplió. Aun así necesitas seleccionar y confirmar.':'Antes de ese horario no se generan cheques ordinarios.'}</p><div style="display:flex;gap:7px;flex-wrap:wrap">${Object.entries(d.resumen||{}).map(([k,v])=>`<span class="badge ${k==='TRANSFERENCIA_REGISTRADA'||k==='PAGO_CHEQUE_REGISTRADO'?'ACTIVO':'PENDIENTE'}">${esc(labels[k]||k)}: ${v}</span>`).join('')}</div><p class="fhint">Un pago parcial, un conflicto de importe, falta de NOI o falta de autorización requieren revisión; no se generará un cheque completo por suposición.</p>`;
  const filters=isRetiro||fin(s)?'':`<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><input id="pago-sabado-q" placeholder="Número, nombre o contratista" value="${esc(s.q)}"><select id="pago-sabado-filter"><option value="PENDIENTES" ${s.filter==='PENDIENTES'?'selected':''}>Sólo pendientes por revisar</option><option value="" ${s.filter===''?'selected':''}>Todos, incluidos pagados</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${s.filter===k?'selected':''}>${esc(v)}</option>`).join('')}</select>${button('Buscar / filtrar','filtrar()')}</div>`;
  const canWrite=permiso(s),bloqueados=elegidos(s).filter(r=>!listo(s,r)).length;
  const intro=fin(s)?'<h3>Conciliar finiquitos pagados por transferencia</h3><p>Se cotejan trabajador, obra, semana, importe, NOI y recibos. Sólo tras tu confirmación se vincula el banco y se elimina la captura pendiente sin folios. No se tocan cheques físicos ni se asume que un CFDI es un pago bancario.</p>':info;
  const ayuda=!isRetiro&&!fin(s)?'<p class="fhint">Puedes marcar pendientes para revisarlos aunque falte autorización. Seleccionar no crea pagos. Para confirmar cheques, todos los seleccionados deben estar listos: cierre autorizado, NOI y recibos conciliados, sin transferencia y después del sábado 12:00.</p>':'';
  el('pago-sabado-body').innerHTML=intro+filters+ayuda+`<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">${button(isRetiro?'Seleccionar retirables':fin(s)?'Seleccionar transferencias listas':'Seleccionar pendientes visibles','seleccionarVisibles()',!canWrite)}${!isRetiro&&!fin(s)?button('Seleccionar sólo listos','seleccionarListos()',!canWrite):''}${button('Limpiar selección','limpiar()')}<span id="pago-sabado-selected">${s.selected.size} seleccionado(s) · ${s.selected.size-bloqueados} listo(s) · ${bloqueados} por resolver</span></div>`+
   table(['Elegir','No. / trabajador','Importe de referencia','Situación / qué falta'],rows.map(r=>{const id=clave(s,r),eligible=revisable(s,r);return `<tr><td><input style="width:auto" type="checkbox" aria-label="Revisar trabajador ${esc(r.numero)}" title="${!canWrite?'Tu cuenta es de consulta':!eligible?esc(r.motivo||labels[r.estado]||r.estado):'Seleccionar para revisión; no confirma pagos'}" ${s.selected.has(id)?'checked':''} ${!canWrite||!eligible?'disabled':''} onchange="PLATINUM_PAGOS_SABADO.seleccionar('${id}',this.checked)"></td><td><b>#${esc(r.numero)} ${esc(r.nombre)}</b>${r.contratista?'<br>'+esc(r.contratista):''}</td><td>${r.importe==null?'Sin NOI':money(r.importe)}</td><td>${isRetiro?(r.transferencia_exacta?'Transferencia exacta registrada':'Sin transferencia registrada; continuará como pago pendiente'):esc(r.motivo||labels[r.estado]||r.estado)}${!isRetiro&&r.pagos_registrados?`<br><small>${r.pagos_registrados} comprobante(s) exitoso(s) · ${money(r.total_bancario)}. Registrado no sustituye conciliación.</small>`:''}${!isRetiro&&!listo(s,r)&&r.cierre_id?'<br>'+button('Abrir cierre / conciliar',`abrirCierre('${r.cierre_id}')`):''}</td></tr>`;}))+
   (!isRetiro&&!fin(s)?`<div style="display:flex;align-items:center;gap:10px;margin-top:10px">${button('Anterior','pagina(-1)',d.pagina===0)}<span>${d.total} registro(s) · página ${d.pagina+1}</span>${button('Siguiente','pagina(1)',(d.pagina+1)*d.por_pagina>=d.total)}</div>`:`<p>${d.total} registro(s) de esta semana.</p>`)+
   (bloqueados?'<p role="status" style="color:var(--amber)">Hay seleccionados pendientes de resolver. Abre su cierre, concilia y autoriza; después actualiza. No se creará ningún cheque mientras estén bloqueados.</p>':'')+
   `<label style="display:block;margin-top:15px">Motivo de la revisión<textarea id="pago-sabado-reason" rows="2" maxlength="1500" placeholder="Describe la revisión realizada"></textarea></label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">${button(isRetiro?'Revisar y confirmar retirada':fin(s)?'Confirmar transferencias y retirar pendientes':'Revisar y confirmar cheques','confirmar()',!canWrite||!s.selected.size||bloqueados>0||(!isRetiro&&!fin(s)&&!d.habilitado))}${button('Cerrar','cerrar()')}</div>`;
  el('pago-sabado-reason').value=s.note;
 }
 function seleccionar(id,checked){const s=current();if(!permiso(s))return;const row=filas(s).find(r=>clave(s,r)===id);if(!row||!revisable(s,row))return;
  if(checked){s.selected.add(id);s.selection.set(id,row);}else{s.selected.delete(id);s.selection.delete(id);}s.key=null;render();
 }
 function seleccionarVisibles(soloListos=false){const s=current();if(!permiso(s))return;for(const r of filas(s))if(revisable(s,r)&&(!soloListos||listo(s,r))){const id=clave(s,r);s.selected.add(id);s.selection.set(id,r);}render();}
 function seleccionarListos(){limpiar();seleccionarVisibles(true);}
 function limpiar(){current().selected.clear();current().selection.clear();current().key=null;render();}
 async function modo(mode){const s=current();s.mode=['RETIROS','FINIQUITOS'].includes(mode)?mode:'PROPUESTA';s.selected.clear();s.selection.clear();s.token=null;s.page=0;s.q='';s.filter=s.mode==='PROPUESTA'?'PENDIENTES':'';await cargar();}
 async function semana(v){const s=current(),n=Number(v);if(!Number.isInteger(n)||n<1||n>53)throw Error('Semana inválida.');s.sem=n;s.page=0;s.selected.clear();s.selection.clear();s.token=null;await cargar();}
 async function pagina(delta){current().page=Math.max(0,current().page+delta);await cargar();}
 async function filtrar(){const s=current();s.q=el('pago-sabado-q').value;s.filter=el('pago-sabado-filter').value;s.page=0;await cargar();}
 async function confirmar(){return operation(async()=>{
  const s=current(),retirar=s.mode==='RETIROS';if(!permiso(s))throw Error('Tu cuenta no tiene permiso para confirmar esta operación.');
  if(s.stale)throw Error('Actualiza antes de confirmar. Tus notas se conservan en pantalla.');if(!s.selected.size)throw Error('Selecciona al menos un registro.');
  if(elegidos(s).length!==s.selected.size||elegidos(s).some(r=>!listo(s,r)))throw Error('Hay seleccionados por resolver: concilia NOI y recibos y autoriza el cierre. Seleccionar para revisión no autoriza crear cheques.');
  const motivo=el('pago-sabado-reason').value||'';if(motivo.trim().length<10)throw Error('Escribe un motivo de al menos 10 caracteres.');
  if(fin(s))return confirmarFiniquitos(s,motivo);
  if(!confirm(retirar?`¿Retirar ${s.selected.size} pendientes automáticos de S${s.sem}? Se conservarán con auditoría; no se eliminarán pagos ni finiquitos.`:`¿Confirmar ${s.selected.size} cheques pendientes de S${s.sem}? Se volverá a comprobar que no tengan transferencia. No se expedirán ni se asignarán números.`))return;
  const phrase=retirar?'RETIRAR AUTOMATICOS':'CREAR CHEQUES CONFIRMADOS';
  if((prompt('Escribe '+phrase+' para confirmar:')||'').trim()!==phrase)throw Error('Confirmación cancelada; no se modificó nada.');
  s.key=s.key||crypto.randomUUID();
  const r=await call(retirar?'RETIRAR':'CREAR',{obra_id:s.obraId,semana:s.sem,ids:[...s.selected],huella:s.token,clave_idempotencia:s.key,motivo,confirmacion:phrase});
  cfg.toast(retirar?`${r.retirados} pendientes retirados; pagos y finiquitos conservados.`:`${r.creados} cheques pendientes confirmados. Falta capturar número, consecutivo y expedición.`,'ok');
  s.selected.clear();s.selection.clear();s.token=null;s.key=null;await cfg.reload(s.obraId);cfg.onChange();if(context().obra?.id===s.obraId&&state===s&&el('pago-sabado-body'))await cargar();await avisarDesdeContexto();
 });}
 async function confirmarFiniquitos(s,motivo){
  if(!confirm(`¿Vincular ${s.selected.size} transferencias de finiquito y eliminar sólo sus capturas pendientes sin folios? No se tocarán cheques físicos ni importes.`))return;
  if((prompt('Escribe CONFIRMAR TRANSFERENCIA para confirmar:')||'').trim()!=='CONFIRMAR TRANSFERENCIA')throw Error('Confirmación cancelada; no se modificó nada.');
  let ok=0,error='';
  for(const r of elegidos(s)){
   if(context().obra?.id!==s.obraId) {error='Cambió el centro de trabajo';break;}
   try{const result=await context().sb.rpc('control_flujo_operar',{p_accion:'TRANSFERIR_FINIQUITO',p_datos:{trabajador_id:r.trabajador_id,semana:s.sem,pago_id:r.pago_id,motivo,confirmacion:'CONFIRMAR TRANSFERENCIA'}});
    if(result.error)throw Error(result.error.message);if(result.data?.estado!=='CONCILIADO_BANCO')throw Error('La base no confirmó la conciliación bancaria');ok++;
   }catch(e){error=`#${r.numero}: ${e.message}`;break;}
  }
  cfg.toast(`${ok} finiquito(s) conciliado(s); capturas pendientes eliminadas, no canceladas.${error?' Quedaron por revisar: '+error:''}`,error?'err':'ok');
  s.selected.clear();s.selection.clear();s.token=null;await cfg.reload(s.obraId);cfg.onChange();if(context().obra?.id===s.obraId&&state===s&&el('pago-sabado-body'))await cargar();
 }
 async function abrirCierre(id){const s=current();if(!filas(s).some(r=>r.cierre_id===id))throw Error('El cierre no pertenece a esta revisión.');if(!cfg.openCierre)throw Error('El módulo de cierres no está disponible.');cerrar();await cfg.openCierre(id);}
 function avisarCambio(){if(!state)return;state.stale=true;if(el('pago-sabado-stale'))el('pago-sabado-stale').hidden=false;}
 async function avisarDesdeContexto(){if(!cfg)return;const obraId=context().obra?.id;if(!obraId){cfg.banner(null);return;}try{const d=await call('AVISO',{obra_id:obraId});if(context().obra?.id===obraId)cfg.banner(d);}catch(e){if(context().obra?.id===obraId)cfg.banner({error:true});}}
 function cerrar(){sequence++;state=null;cfg.close();}
 function manual(){current();el('pago-sabado-body').innerHTML=`<h3>Guía de revisión</h3><ol><li>Importa y concilia NOI. La nómina normal permanece pendiente de pago y no genera cheque por carecer de cuenta.</li><li>Importa pagos globales e individuales, incluidos otros bancos. Rechazado no cuenta como pagado.</li><li>Desde el sábado 12:00 CDMX abre la revisión. Sólo son elegibles los importes positivos, conciliados y autorizados, sin pagos, parciales, aplicaciones ni cheque vigente.</li><li>Revisa nombres e importes, selecciona, escribe el motivo y confirma. Se crean pendientes, nunca cheques expedidos. Después captura número, consecutivo y entrega en Cheques.</li><li>Si llega una transferencia después, la expedición se detiene. Revisa el pendiente; no pagues dos veces.</li><li>Retirar automáticos anteriores requiere permiso y doble confirmación. Conserva comprobantes e historial; nunca toca finiquitos, manuales, foliados ni entregados.</li></ol><p class="fhint">El cheque de finiquito sigue por defecto; su excepción de transferencia conserva la autorización existente. No se modifican nóminas ni cálculos.</p>${button('Volver','cargar()')}`;}
 const guard=f=>(...a)=>{try{const r=f(...a);return r?.catch?r.catch(e=>cfg?.toast(e.message,'err')):r;}catch(e){cfg?.toast(e.message,'err');}};
 root.PLATINUM_PAGOS_SABADO=Object.freeze({configure,avisarCambio,avisarDesdeContexto,...Object.fromEntries(Object.entries({abrir,cargar,modo,semana,pagina,filtrar,seleccionar,seleccionarVisibles,seleccionarListos,limpiar,confirmar,abrirCierre,cerrar,manual}).map(([k,f])=>[k,guard(f)]))});
})(typeof window==='undefined'?globalThis:window);
