/* Reversión específica: la ficha original nunca se restaura como un snapshot completo. */
async function abrirReversionBaja(id,historialId=null){
 if(!puedeEditarTrabajador())return toast('Tu usuario sólo puede consultar.','err');
 const obra=OBRA?.id,usuario=USER?.id,raiz='reversion-baja-'+_uuid(),op=_uuid();
 modal2(`<div id="${raiz}" style="display:flex;flex-direction:column;flex:1;min-height:0"><div class="m-head"><h2>Revertir baja por error</h2><button class="x" data-rb="cerrar" aria-label="Cerrar">×</button></div><div class="m-body" data-rb-cuerpo>Consultando movimiento, ciclo y dependencias…</div><div class="m-foot"><button class="btn" data-rb="cerrar">Cerrar</button><button class="btn" data-rb="actualizar">Actualizar alcance</button><button class="btn dark" data-rb="confirmar" disabled>Confirmar reversión</button></div></div>`,'lg prestaciones-form');
 const host=$(raiz),cuerpo=host.querySelector('[data-rb-cuerpo]'),boton=host.querySelector('[data-rb="confirmar"]');let plan=null,enviando=false;
 const vigente=()=>host.isConnected&&OBRA?.id===obra&&USER?.id===usuario;
 async function rpc(a,p){const r=await sb.rpc('control_revertir_baja',{p_accion:a,p});if(r.error)throw Error(r.error.message);return r.data;}
 function pintar(p){
  plan=p;
  if(p.estado==='BAJA_REVERTIDA'){cuerpo.innerHTML=`<h3>Baja revertida</h3><p>Movimiento ${esc(p.historial_id)} · operación ${esc(p.operacion_id)}</p><p>${esc(p.seguimiento_imss||'Los acuses y movimientos IMSS originales se conservan.')}</p>`;boton.disabled=true;return;}
  cuerpo.innerHTML=`<p>Se restaurará la relación laboral anterior a la baja del <b>${esc(p.fecha_baja)}</b>, conservando el ciclo desde ${esc(p.inicio_ciclo)}.</p>
   <p>La corrección conserva los cambios independientes posteriores de salario, teléfono, domicilio y banco. No crea un reingreso.</p>
   ${ctrlTabla(['Campo','Valor que se restaurará'],Object.entries(p.restaurar).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v??'Sin valor')}</td></tr>`))}
   <p>${p.cheques_retirar.length} cheque(s) pendiente(s) sin llenar y ${p.obligaciones_retirar.length} obligación(es) de borrador exclusivamente vinculados se retirarán con auditoría.</p>
   ${p.errores.map(e=>`<p role="alert" style="color:var(--red)"><b>${esc(e.tipo)}</b> ${esc(e.id||e.campo||'')}${e.semana?' · S'+esc(e.semana):''}: ${esc(e.detalle)}</p>`).join('')}
   <p class="fhint">Los papeles y documentos se conservan con referencia a la reversión. Los acuses IMSS requieren su seguimiento independiente con las fechas reales.</p>`;
  boton.disabled=p.errores.length>0;
 }
 async function cargar(){
  if(!historialId){const r=await sb.from('historial').select('id').eq('trabajador_id',id).eq('obra_id',obra).eq('accion','BAJA').order('fecha',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle();
   if(r.error)throw Error(r.error.message);if(!r.data)throw Error('No se encontró un movimiento de baja con respaldo histórico.');historialId=r.data.id;}
  const d=await rpc('PREVISUALIZAR',{historial_id:historialId});if(vigente())pintar(d);
 }
 host.onclick=async e=>{
  const a=e.target.closest('[data-rb]')?.dataset.rb;if(!a||enviando||!vigente())return;
  if(a==='cerrar')return closeModal2();
  if(a==='actualizar'){boton.disabled=true;try{await cargar();}catch(err){if(vigente())cuerpo.textContent=err.message;}return;}
  if(a!=='confirmar'||!plan||plan.errores?.length||boton.disabled)return;
  if(!confirm('¿Confirmas revertir esta baja accidental y retirar exclusivamente los pendientes mostrados?'))return;
  enviando=true;boton.disabled=true;
  try{markWrite();const d=await rpc('CONFIRMAR',{historial_id:historialId,operacion_id:op,firma:plan.firma,confirmado:true});if(!vigente())return;
   if(d.estado!=='BAJA_REVERTIDA')throw Error('La base no confirmó la reversión.');
   window.PLATINUM_PERSONAL?.aplicarFila(d.trabajador,undefined,true);
   if(d.caso?.id)window.PLATINUM_DATOS?.aplicar({table:'control_altas_bajas_cortas',eventType:'UPDATE',new:d.caso});
   for(const x of d.retirados||[])window.PLATINUM_DATOS?.aplicar({table:'cheques',eventType:'UPDATE',new:{...CHEQUES.find(c=>c.id===x.id),eliminado:true}});
   closeModal();toast('Baja revertida. Se conservó el ciclo anterior.','ok');openDetail(id);
  }catch(err){if(vigente()){cuerpo.insertAdjacentHTML('beforeend',`<p role="alert" style="color:var(--red)">${esc(err.message)}</p>`);boton.disabled=false;}}
  finally{enviando=false;}
 };
 try{await cargar();}catch(e){if(vigente())cuerpo.textContent=e.message;}
}
async function cargarMarcaReversion(w){
 const host=$('ficha-reversion-aviso');if(!host)return;
 const obra=OBRA?.id,usuario=USER?.id;
 const r=await sb.from('control_reversiones_baja').select('id,historial_id,created_at,actor_email').eq('trabajador_id',w.id).eq('obra_id',obra).eq('estado','APLICADA').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(!host.isConnected||OBRA?.id!==obra||USER?.id!==usuario||!window.PLATINUM_FICHA?.actual(w.id))return;
 if(r.error){host.textContent='No se pudo consultar la trazabilidad de reversiones.';return;}
 if(!r.data){host.textContent='';return;}
 const d=r.data;host.innerHTML=`<span class="badge">Baja revertida</span> · ${esc(d.created_at)} · ${esc(d.actor_email)} · referencia ${esc(d.historial_id)}
  ${puedeEditarTrabajador()?`<button class="btn" type="button" onclick="abrirReversionBaja('${esc(w.id)}','${esc(d.historial_id)}')">Consultar reversión</button>`:''}`;
}
