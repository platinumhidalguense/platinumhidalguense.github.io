/* Corrección de una captura pendiente. No corrige nómina ni autoriza pago. */
function openCorregirImporteCheque(id){
  const c=CHEQUES.find(c=>c.id===id&&!c.eliminado);
  if(!puedeEliminarCheque()||!c||c.obra_id!==OBRA?.id){toast('No tienes permiso para corregir este cheque.','err');return;}
  if(c.estatus!=='PENDIENTE'||String(c.num_cheque||'').trim()||String(c.consecutivo||'').trim()){toast('Sólo puedes corregir pendientes sin número ni consecutivo.','err');return;}
  window._CHQ_IMPORTE={id:c.id,obra:c.obra_id,importe:Number(c.importe),version:c.updated_at,ocupado:false};
  modal(`<div class="m-head"><h2>✎ Corregir importe · ${esc(c.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body"><div class="kv"><b>Cheque</b><span>${esc(c.semana)} · ${esc(c.tipo_pago)}</span></div>
    <div class="kv"><b>Importe actual</b><span>$${money(c.importe)}</span></div>
    <label>Importe correcto ($)</label><input id="chqi-nuevo" type="number" min="0.01" step="0.01" value="${Number(c.importe).toFixed(2)}">
    <label style="margin-top:12px">Motivo de la corrección</label><input id="chqi-motivo" maxlength="1000" placeholder="Ejemplo: importe capturado incorrectamente">
    <p class="fhint">Se guardarán el importe anterior, el nuevo, tu usuario y el motivo. Antes de expedir se verificará el neto con NOI o recibo; esta corrección no modifica el cierre ni los cálculos de nómina.</p></div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn dark" id="chqi-guardar" onclick="guardarImporteCheque()">Confirmar corrección</button></div>`,'sm');
}
async function guardarImporteCheque(){
  const e=window._CHQ_IMPORTE,btn=$('chqi-guardar');
  if(!e||e.ocupado||!btn||!puedeEliminarCheque())return;
  if(OBRA?.id!==e.obra){toast('Cambió el centro. Abre de nuevo el cheque.','err');return;}
  const valor=String($('chqi-nuevo')?.value||'').trim(),nuevo=Number(valor),motivo=String($('chqi-motivo')?.value||'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(valor)||!Number.isFinite(nuevo)||nuevo<=0){toast('Captura un importe positivo con máximo dos decimales.','err');return;}
  if(nuevo===e.importe){toast('El importe no cambió.','err');return;}
  if(motivo.length<8){toast('Describe la corrección con al menos 8 caracteres.','err');return;}
  if(!confirm('¿Confirmas corregir este cheque de $'+money(e.importe)+' a $'+money(nuevo)+'?\nQuedará registrado en el historial y pendiente de verificar antes de expedir.'))return;
  e.ocupado=true;btn.disabled=true;btn.textContent='Guardando...';markWrite();let guardado=false;
  try{
    const {data,error}=await sb.rpc('control_corregir_importe_cheque',{p_id:e.id,p_anterior:e.importe,p_nuevo:nuevo,p_version:e.version,p_motivo:motivo,p_confirmado:true});
    if(error)throw error;
    if(data?.id!==e.id||Number(data.importe)!==nuevo||data.estatus!=='PENDIENTE')throw Error('El servidor no confirmó la corrección.');
    guardado=true;
    if(window._CHQ_IMPORTE===e){delete window._CHQ_IMPORTE;if($('chqi-guardar')===btn)closeModal();}
    toast('Importe corregido a $'+money(nuevo)+' con historial. Verifica el neto antes de expedir.','ok');
    if(OBRA?.id===e.obra)await loadObraData(e.obra);
  }catch(err){toast((guardado?'El importe sí se guardó; actualiza el listado: ':'No se guardó la corrección: ')+err.message,'err');}
  finally{e.ocupado=false;if($('chqi-guardar')===btn){btn.disabled=false;btn.textContent='Confirmar corrección';}}
}
