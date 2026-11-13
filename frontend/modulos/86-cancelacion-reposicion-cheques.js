/* Sustitución del instrumento físico: una RPC atómica, misma obligación e historia. */
(function(root){
 'use strict';
 function crear(dep){
  const claves=new Map(),enCurso=new Map();
  async function llamar(a,p){const r=await dep.rpc('control_cancelar_reponer_cheque',{p_accion:a,p_datos:p});if(r.error)throw Error(r.error.message);if(!r.data?.estado)throw Error('La operación no devolvió confirmación. Reintenta el mismo cheque.');return r.data;}
  const preparar=q=>llamar('PREPARAR',{cheque_id:q.id,version:q.updated_at});
  function confirmar(preparado,motivo){
   const q=preparado.original;if(enCurso.has(q.id))return enCurso.get(q.id);
   if(!claves.has(q.id))claves.set(q.id,dep.uuid());
   const promesa=llamar('CONFIRMAR',{cheque_id:q.id,version:q.updated_at,operacion_id:claves.get(q.id),motivo,confirmacion:'CANCELAR Y CREAR REPOSICION'}).then(r=>{
    if(['COMPLETO','EXISTENTE'].includes(r.estado)){
     const s=r.reemplazo;if(r.original?.id!==q.id||r.original.estatus!=='CANCELADO'||!s?.id||s.reemplaza_cheque_id!==q.id||['obra_id','trabajador_id','nombre','no_trab','puesto','contratista','curp','semana','periodo','tipo_pago','cierre_id','lote_nomina_id'].some(k=>(s[k]??null)!==(q[k]??null))||Number(s.importe)!==Number(q.importe))throw Error('Respuesta de reposición inconsistente. Actualiza sin repetir otra captura.');
    }return r;
   }).finally(()=>enCurso.delete(q.id));enCurso.set(q.id,promesa);return promesa;
  }
  return Object.freeze({preparar,confirmar});
 }
 let servicio=null,vista=null;
 const puede=()=>typeof puedeEditarTrabajador==='function'&&puedeEditarTrabajador();
 const obtener=()=>servicio||(servicio=crear({rpc:(...a)=>sb.rpc(...a),uuid:()=>crypto.randomUUID()}));
 function incorporar(r){
  for(const [tabla,x]of [['UPDATE',r.original],['INSERT',r.reemplazo]])if(x){
   root.PLATINUM_DATOS?.aplicar({table:'cheques',eventType:tabla,new:x});
   const i=CHEQUES.findIndex(c=>c.id===x.id);if(i>=0)CHEQUES[i]=x;else CHEQUES.push(x);
  }
  if(typeof renderChqStats==='function')renderChqStats();root.PLATINUM_GESTION_CHEQUES?.refrescar();
 }
 async function cancelar(id){
  if(!puede()){toast('No tienes permiso para operar cheques.','err');return;}
  if(vista?.ocupado){toast('La cancelación está en curso.','err');return;}
  const q=CHEQUES.find(c=>c.id===id&&c.obra_id===OBRA?.id&&!c.eliminado);if(!q){toast('Actualiza el listado del centro.','err');return;}
  const v={obra:OBRA.id,usuario:USER.id,ocupado:false};vista=v;
  modal('<section id="cr-cheque" style="display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden"><div class="m-head"><h2>Cancelar cheque y crear reposición</h2></div><div class="m-body" style="overflow:auto"><div id="cr-detalle" role="status" aria-live="polite">Comprobando el instrumento y sus pagos…</div></div><div class="m-foot"><button class="btn" id="cr-volver">Volver</button><button class="btn danger" id="cr-confirmar" disabled>Cancelar y crear reposición</button></div></section>','md');
  const host=$('cr-cheque'),valido=()=>vista===v&&host.isConnected&&OBRA?.id===v.obra&&USER?.id===v.usuario;
  const texto=$('cr-detalle'),confirmar=$('cr-confirmar'),volver=$('cr-volver');
  volver.onclick=()=>{if(!v.ocupado){vista=null;closeModal();}};
  function resultado(r){
   if(!valido())return;
   if(r.estado==='BLOQUEADO_PAGO'){
    texto.innerHTML='<p><b>Existe una operación de pago que debe resolverse antes de crear otro cheque.</b></p>'+r.operaciones.map(p=>`<p>Operación ${esc(p.pago_id||p.evidencia_id||'')} · folio ${esc(p.folio||'sin folio')} · ${esc(p.fecha||'sin fecha')} · $${money(p.importe)} · ${esc(p.estado||'aplicada')}<br>${esc(p.resolucion)}</p>`).join('');confirmar.hidden=true;return;
   }
   if(r.estado==='SUSTITUIDO_TRANSFERENCIA'){texto.textContent=r.motivo;confirmar.hidden=true;return;}
   if(['COMPLETO','EXISTENTE'].includes(r.estado)){
    incorporar(r);texto.innerHTML=`<p><b>${r.estado==='EXISTENTE'?'Este cheque ya tiene reposición activa.':r.ya_aplicado?'Este cheque ya fue sustituido. Consulta su reposición.':'Cheque cancelado. Reposición pendiente creada.'}</b></p><p>Se conservó el original y su historial. Reposición: ${esc(r.reemplazo.nombre)} · ${esc(r.reemplazo.semana)} · $${money(r.reemplazo.importe)} · ${esc(r.reemplazo.estatus)}.</p>`;
    confirmar.hidden=true;if(r.reemplazo.eliminado){texto.appendChild(document.createTextNode('La captura sucesora está retirada. Revisa su historial; este reintento conserva la operación original.'));return;}
    const abrir=document.createElement('button');abrir.className='btn dark';abrir.textContent=r.reemplazo.estatus==='PENDIENTE'?'Capturar nuevo cheque':'Abrir cheque de reposición';
    abrir.onclick=()=>{if(!valido())return;vista=null;openChequeForm(r.reemplazo.id);};texto.appendChild(abrir);return;
   }
  }
  try{
   const preparado=await obtener().preparar(q);if(!valido())return;
   if(preparado.estado==='EXISTENTE'){incorporar(preparado);vista=null;openChequeForm(preparado.reemplazo.id);return;}
   if(preparado.estado!=='LISTO'){resultado(preparado);return;}
   const c=preparado.original,x=preparado.contexto;
   texto.innerHTML=`<p>Se cancelará el cheque <b>${esc(c.num_cheque)}</b>, consecutivo <b>${esc(c.consecutivo)}</b>, de <b>${esc(c.nombre)}</b>, correspondiente a <b>${esc(x.centro)}, ${esc(x.anio)}, ${esc(c.semana)} y ${esc(c.tipo_pago)}</b>, por <b>$${money(c.importe)}</b>. Se creará su reposición en estado <b>PENDIENTE</b> para capturar un nuevo número y consecutivo.</p><p>El original conservará sus folios e historial, incluida su entrega. Esta confirmación corresponde a un instrumento devuelto o rechazado, sin cobro efectivo.</p><label>Motivo<input id="cr-motivo" maxlength="600" placeholder="Ej. devolución por error físico"></label><p id="cr-error" role="alert"></p>`;
   confirmar.disabled=false;confirmar.onclick=async()=>{
    if(v.ocupado||!valido()||!puede())return;const motivo=$('cr-motivo').value.trim();if(motivo.length<3){$('cr-error').textContent='Captura el motivo de la cancelación.';return;}
    v.ocupado=true;confirmar.disabled=true;volver.disabled=true;$('cr-error').textContent='Cancelando el instrumento y preparando su reposición…';
    try{markWrite();const r=await obtener().confirmar(preparado,motivo);if(valido())resultado(r);}
    catch(e){if(valido())$('cr-error').textContent=e.message;}
    finally{v.ocupado=false;if(valido()){confirmar.disabled=false;volver.disabled=false;}}
   };
  }catch(e){if(valido()){texto.textContent=e.message;confirmar.hidden=true;}}
 }
 root.PLATINUM_CHEQUES_REPOSICION=Object.freeze({crear,cancelar});
})(window);
