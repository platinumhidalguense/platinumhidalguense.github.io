/* Superficie única del archivo fiscal: el cierre es un vínculo posterior opcional. */
(function(root){
 'use strict';let vista=null,secuencia=0;
 const etiquetas={VALIDO:'Identidad y periodo listos para confirmar',REVISAR:'Revisión pendiente',CONFLICTO:'Lectura o vínculo pendiente',ARCHIVADO:'Registrado · evidencia fiscal pendiente',VERIFICADO:'Timbrado verificado · cotejo y pago separados',RECIBIENDO:'Recibiendo original',PENDIENTE:'Lectura pendiente',FALLO:'No se completó',VINCULADO:'Vínculo documental registrado',VINCULO_PROPUESTO:'Compatible con la fotografía'};
 async function abrir(opciones={}){
  if(vista?.servicio.ocupado()){toast('Termina la carga en curso antes de cambiar de periodo.','err');return;}
  if(root.PLATINUM_CONCILIADOR?.estaCapturando()){toast('Termina la captura en curso del Conciliador.','err');return;}
  if(!USER||!OBRA)return;vista?.servicio.cerrar();
  const inicial=OBRAS.find(o=>o.id===opciones.obra_id)||OBRA,uid=USER.id,id='recibo-libre-'+(++secuencia);
  const empresa=o=>String(o.empresa_codigo||empresaDeObra(o)||'');
  modal(`<section id="${id}" style="display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden">
   <div class="m-head"><h2>Recibos PDF y XML · archivo por periodo</h2><button class="x" data-rl="cerrar" aria-label="Cerrar">×</button></div>
   <div class="m-body" style="min-height:0;overflow:auto"><p>Archiva y revisa recibos actuales o históricos, incluso sin fotografía. Este proceso no autoriza nómina ni registra pagos.</p>
    <div class="grid" data-rl-contexto style="grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px">
     <label>Empresa<select data-rl-empresa>${[...new Set(OBRAS.map(empresa))].map(e=>`<option value="${esc(e)}" ${e===empresa(inicial)?'selected':''}>${esc(EMPRESAS[e]?.corto||e)}</option>`).join('')}</select></label>
     <label>Centro<select data-rl-obra></select></label><label>Año<input type="number" min="2020" max="2100" data-rl-anio value="${Number(opciones.anio)||new Date().getFullYear()}"></label>
     <label>Periodicidad<select data-rl-per><option value="SEMANAL" ${opciones.periodicidad!=='QUINCENAL'?'selected':''}>Semanal</option><option value="QUINCENAL" ${opciones.periodicidad==='QUINCENAL'?'selected':''}>Quincenal</option></select></label>
     <label data-rl-semana-label>Semana<input data-rl-semana type="number" min="1" max="53" value="${Number(opciones.semana)||semObra()}"></label>
     <label data-rl-mes-label hidden>Mes<input data-rl-mes type="number" min="1" max="12" value="${Number(opciones.mes)||new Date().getMonth()+1}"></label>
     <label data-rl-quin-label hidden>Quincena<select data-rl-quin><option value="1" ${Number(opciones.quincena)!==2?'selected':''}>Primera</option><option value="2" ${Number(opciones.quincena)===2?'selected':''}>Segunda</option></select></label>
    </div><button class="btn" data-rl="contexto" style="margin:10px 0">Cargar periodo y archivos</button>
    <p data-rl-fechas class="fhint"></p><p data-rl-mensaje role="status" aria-live="polite">Preparando contexto…</p>
    <div data-rl-entrada></div><div data-rl-lista></div>
   </div><div class="m-foot"><button class="btn" data-rl="cerrar">${opciones.volver?'Volver':'Cerrar'}</button><button class="btn" data-rl="bancos">Importar pagos bancarios</button><button class="btn" data-rl="fotografia">Archivo por fotografía</button></div></section>`,'xl');
  const host=$(id),q=s=>host.querySelector(s),v={host,opciones,usuario:uid,sucio:false,pagina:0,ocupado:false};vista=v;
  const actual=()=>vista===v&&USER?.id===uid&&host.isConnected;
  const mensaje=t=>{if(actual())q('[data-rl-mensaje]').textContent=t;};
  const ctx=()=>({empresa_codigo:q('[data-rl-empresa]').value,anio:Number(q('[data-rl-anio]').value),periodicidad:q('[data-rl-per]').value,
   semana:q('[data-rl-per]').value==='SEMANAL'?Number(q('[data-rl-semana]').value):null,mes:q('[data-rl-per]').value==='QUINCENAL'?Number(q('[data-rl-mes]').value):null,quincena:q('[data-rl-per]').value==='QUINCENAL'?Number(q('[data-rl-quin]').value):null});
  function centros(preferido){q('[data-rl-obra]').innerHTML=OBRAS.filter(o=>empresa(o)===q('[data-rl-empresa]').value).map(o=>`<option value="${esc(o.id)}" ${o.id===preferido?'selected':''}>${esc(o.nombre)}</option>`).join('');}
  function periodos(){const quin=q('[data-rl-per]').value==='QUINCENAL';q('[data-rl-semana-label]').hidden=quin;q('[data-rl-mes-label]').hidden=!quin;q('[data-rl-quin-label]').hidden=!quin;}
  centros(inicial.id);periodos();
  v.servicio=root.PLATINUM_RECIBOS_CONTEXTO.crear({vigente:actual,rpc:(...a)=>sb.rpc(...a),get storage(){return sb.storage;},hash:sha256Hex,
   leer:root.PLATINUM_ARCHIVO_RECIBOS.leerArchivo,archivo:(b,n)=>new File([b],n,{type:b.type}),
   verificar:body=>sb.functions.invoke('lectura-documental',{body}),fragmento:body=>sb.functions.invoke('gemini-extract',{body}),
   incorporar:(f,x)=>{root.PLATINUM_CAMPOS_RECIBO.incorporar(f.lectura,x,root.PLATINUM_RESPALDO_RECIBO);root.PLATINUM_ARCHIVO_RECIBOS.actualizarDatos(f);},
   cambio:(s,busy)=>{v.ocupado=busy;if(actual())pintar(s);}});
  function pintar(s){
   for(const b of host.querySelectorAll('button,[data-rl-contexto] input,[data-rl-contexto] select'))b.disabled=v.ocupado;
   const c=s?.contexto;
   q('[data-rl-fechas]').textContent=c?.desde?`${c.periodicidad} · ${c.desde} al ${c.hasta} · ${s.cierres.length?'Fotografía disponible para proponer vínculo':'Sin cierre · archivo independiente'}`:'';
   q('[data-rl-entrada]').innerHTML=s?`<label>PDF o XML individuales<input data-rl-files type="file" accept=".pdf,.xml" multiple ${v.ocupado||v.sucio||!s.escritura?'disabled':''}></label>`:'';
   const files=s?.archivos||[],total=Math.max(1,Math.ceil(files.length/50));v.pagina=Math.min(v.pagina,total-1);
   q('[data-rl-lista]').innerHTML=`<div class="cg-table" style="overflow:auto;max-height:48vh"><table><thead><tr><th>Original</th><th>Trabajador / periodo leído</th><th>Neto / UUID</th><th>Resultado y acciones</th></tr></thead><tbody>${files.slice(v.pagina*50,v.pagina*50+50).map(f=>{
    const d=f.datos||{},r=d.resultado||f,trab=r.trabajador||'Identidad por revisar';
    return `<tr><td>${esc(d.nombre||f.file?.name||'Original')}<br><button class="btn" data-rl="original" data-id="${esc(f.id||'')}" ${!f.id?'disabled':''}>Ver original</button></td>
     <td>${esc(trab)}<br>${esc(d.desde||'—')} al ${esc(d.hasta||'—')} · ${esc(d.concepto||'concepto pendiente')}</td><td>${d.neto==null?'—':'$'+esc(d.neto)}<br><small>${esc(d.uuid||'')}</small></td>
     <td><b>${esc(etiquetas[f.estado]||f.estado)}</b><p class="fhint">${esc(f.motivo||d.resultado?.motivo||d.motivo||'')}</p>
      ${s.escritura?`<button class="btn" data-rl="releer" data-id="${esc(f.id||'')}" ${!f.id?'disabled':''}>Releer original</button>
       ${f.documento_id?`<button class="btn" data-rl="verificar" data-id="${esc(f.id)}">Verificar timbrado</button>`:r.estado==='VALIDO'||f.estado==='VALIDO'?`<button class="btn dark" data-rl="confirmar" data-id="${esc(f.id)}">Confirmar registro</button>`:''}
       ${f.documento_id&&s.cierres.length?`<button class="btn" data-rl="vincular" data-id="${esc(f.id)}">Revisar vínculo con fotografía</button>`:''}`:''}
      ${(f.lectura?.pendientes||[]).map((p,k)=>p.region?`<details><summary>${esc(p.campo)} · ${esc(p.causa)}</summary><code>${esc(p.region.texto)}</code><input data-rl-literal="${esc(f.id)}-${k}" aria-label="Transcripción literal"><button class="btn" data-rl="literal" data-id="${esc(f.id)}" data-k="${k}">Usar transcripción</button><button class="btn" data-rl="gemini" data-id="${esc(f.id)}" data-k="${k}">Completar sólo este campo con Gemini</button></details>`:'').join('')}
     </td></tr>`;}).join('')||'<tr><td colspan="4">No hay originales archivados en este periodo.</td></tr>'}</tbody></table></div>
    ${total>1?`<button class="btn" data-rl="pagina" data-page="${v.pagina-1}" ${v.pagina===0?'disabled':''}>Anterior</button> ${v.pagina+1} de ${total} <button class="btn" data-rl="pagina" data-page="${v.pagina+1}" ${v.pagina+1===total?'disabled':''}>Siguiente</button>`:''}`;
   if(v.ocupado)for(const b of host.querySelectorAll('button'))b.disabled=true;
  }
  async function cargar(){v.sucio=false;v.pagina=0;await v.servicio.abrir(q('[data-rl-obra]').value,ctx());mensaje('Originales disponibles. Confirma los datos leídos antes de incorporarlos a la ficha.');}
  host.onchange=async e=>{if(!actual()||v.ocupado)return;try{
   if(e.target.closest('[data-rl-contexto]')){v.sucio=true;if(e.target.matches('[data-rl-empresa]'))centros();periodos();pintar(v.servicio.estado());mensaje('Cambió el contexto. Carga el periodo antes de continuar.');}
   if(e.target.matches('[data-rl-files]')){mensaje('Conservando originales y leyendo…');await v.servicio.subir([...e.target.files]);mensaje('Revisa el resultado de cada original. Los pendientes quedan conservados.');}
  }catch(e){mensaje(e.message);}};
  host.onclick=async e=>{const b=e.target.closest('[data-rl]');if(!b||!actual()||v.ocupado)return;const a=b.dataset.rl,archivo=b.dataset.id;try{
   if(a==='cerrar'){v.servicio.cerrar();vista=null;closeModal();if(opciones.volver==='conciliador')return root.PLATINUM_CONCILIADOR_SEMANAL?.abrir(null,opciones.semana,opciones.cierre||null);return;}
   if(a==='contexto')return await cargar();
   if(a==='bancos'){v.servicio.cerrar();return root.PLATINUM_IMPORTACION_BANCARIA.abrir({obra_id:q('[data-rl-obra]').value,...ctx()});}
   if(a==='fotografia'){v.servicio.cerrar();return root.PLATINUM_ARCHIVO_RECIBOS.abrirPorCierre(opciones);}
   if(v.sucio)throw Error('Carga el nuevo contexto antes de continuar.');
   if(a==='pagina'){v.pagina=Number(b.dataset.page);return pintar(v.servicio.estado());}
   if(a==='releer')await v.servicio.reanudar(archivo);
   if(a==='confirmar'&&confirm('¿Confirmas la identidad, el concepto y las fechas leídas del original? No se registrará un pago ni se modificará el cierre.'))await v.servicio.confirmar(archivo);
   if(a==='verificar')await v.servicio.verificar(archivo);
   if(a==='literal'||a==='gemini')await v.servicio.completar(archivo,Number(b.dataset.k),q('[data-rl-literal="'+archivo+'-'+b.dataset.k+'"]')?.value,a==='gemini');
   if(a==='vincular'){
    const cierres=v.servicio.estado().cierres;if(cierres.length!==1)throw Error('Hay varias fotografías compatibles; revisa su contexto antes de vincular.');
    const r=await v.servicio.vincular(archivo,cierres[0].id);mensaje(r.motivo||etiquetas[r.estado]||r.estado);
    if(r.estado==='VINCULO_PROPUESTO'&&confirm('El original coincide con la fotografía. ¿Confirmas el vínculo documental? Los importes y estados financieros se conservarán.')){const fin=await v.servicio.vincular(archivo,cierres[0].id,true);mensaje(etiquetas[fin.estado]||fin.estado);}
   }
   if(a==='original'){
    const f=v.servicio.estado().archivos.find(f=>f.id===archivo);const r=await sb.storage.from('expedientes').createSignedUrl(f.ruta,60);if(r.error)throw Error(r.error.message);
    const link=document.createElement('a');link.href=r.data.signedUrl;link.target='_blank';link.rel='noopener';link.click();
   }
  }catch(e){mensaje(e.message);}};
  try{
   if(opciones.cierre){
    const r=await sb.rpc('control_archivo_recibos',{p_accion:'PERIODOS',p_datos:{obra_id:inicial.id}});if(r.error)throw Error(r.error.message);if(!actual())return;
    const c=r.data.periodos.find(c=>c.id===opciones.cierre);if(c){q('[data-rl-anio]').value=c.desde.slice(0,4);q('[data-rl-semana]').value=c.semana;q('[data-rl-per]').value=c.periodo;
     if(c.periodo==='QUINCENAL'){q('[data-rl-mes]').value=Number(c.desde.slice(5,7));q('[data-rl-quin]').value=Number(c.desde.slice(8,10))<16?1:2;}periodos();}
   }
   await cargar();
  }catch(e){mensaje(e.message);}
 }
 root.PLATINUM_ARCHIVO_LIBRE=Object.freeze({abrir});
})(window);
