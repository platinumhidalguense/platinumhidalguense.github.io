/* Entrada única para incorporar evidencia bancaria actual e histórica. */
(function(){
 'use strict';let vista=null,contador=0;
 const etiquetas={LISTO:'Listo para conciliar',YA_CONCILIADO:'Ya conciliado · reutilizar pago',VINCULACION_PENDIENTE:'Vinculación pendiente',IDENTIDAD_POR_REVISAR:'Revisar identidad / cuenta',CICLO_POR_REVISAR:'Revisar ciclo laboral',PERIODO_POR_REVISAR:'Resolver periodo',PAGO_PARCIAL:'Pago parcial',EXCEDENTE:'Excedente por revisar',CONFIRMACION_PENDIENTE:'Confirmación de cheque pendiente',CHEQUE_PROTEGIDO:'Cheque entregado / protegido',VARIOS_CHEQUES:'Varios cheques por revisar',CHEQUE_CANCELADO:'Cheque cancelado y pago conciliado',CONCILIADO:'Conciliado',CONCILIADO_REUTILIZADO:'Conciliado con pago existente',ERROR_RECUPERABLE:'Error recuperable',RECHAZADO_REGISTRADO:'Rechazo archivado',BANCO_PENDIENTE:'Estado bancario pendiente',AUTORIZACION_PENDIENTE:'Pendiente de conciliador autorizado'};
 const monto=n=>n==null?'Por determinar':'$'+money(n),etiqueta=s=>etiquetas[s]||String(s||'Pendiente').replace(/_/g,' ');
 const obraEmpresa=o=>String(o?.empresa_codigo||empresaDeObra(o)||'');
 function actual(v){return vista===v&&v.host.isConnected&&USER?.id===v.usuario;}
 async function abrir(opciones={}){
  if(vista?.servicio.ocupado()){toast('Espera a que termine la importación actual.','err');return;}
  vista?.servicio.cerrar();const clave='banco-historico-'+(++contador),usuario=USER?.id;
  const obra=OBRAS.find(o=>o.id===opciones.obra_id)||OBRA||OBRAS[0];if(!obra)return;
  modal(`<div id="${clave}" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden">
   <div class="m-head"><h2>Importar pagos bancarios</h2><button type="button" class="x" data-bh="cerrar" aria-label="Cerrar">×</button></div>
   <div class="m-body" style="min-height:0;overflow:auto"><p>Globales e individuales, también de periodos anteriores. Se registra y concilia evidencia; esta operación no envía dinero al banco.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px" data-bh-contexto>
     <label>Razón social<select data-bh-empresa>${[...new Set(OBRAS.map(obraEmpresa))].map(e=>`<option value="${esc(e)}" ${e===obraEmpresa(obra)?'selected':''}>${esc(EMPRESAS[e]?.corto||e)}</option>`).join('')}</select></label>
     <label>Centro<select data-bh-obra></select></label><label>Año<input type="number" min="2020" max="2100" data-bh-anio value="${new Date().getFullYear()}"></label>
     <label>Periodicidad<select data-bh-per><option value="SEMANAL">Semanal</option><option value="QUINCENAL" ${opciones.periodicidad==='QUINCENAL'?'selected':''}>Quincenal</option></select></label>
     <label data-bh-semana-label>Semana<select data-bh-semana><option value="">Varios periodos · resolver por operación</option>${Array.from({length:53},(_,i)=>`<option value="${i+1}" ${i+1===Number(opciones.semana||semObra())?'selected':''}>S${i+1}</option>`).join('')}</select></label>
     <label data-bh-mes-label hidden>Mes<select data-bh-mes>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i===new Date().getMonth()?'selected':''}>${i+1}</option>`).join('')}</select></label>
     <label data-bh-quincena-label hidden>Quincena<select data-bh-quincena><option value="1">Primera</option><option value="2">Segunda</option><option value="">Varias · resolver por operación</option></select></label>
     <label>Concepto<select data-bh-concepto>${[['TODOS','Mixto · resolver por operación'],['NOMINA','Nómina'],['FINIQUITO','Finiquitos'],['PREVISION_SOCIAL','Previsión social']].map(([k,t])=>`<option value="${k}" ${opciones.concepto===k?'selected':''}>${t}</option>`).join('')}</select></label>
    </div><button type="button" class="btn" data-bh="contexto" style="margin:10px 0">Cargar contexto y archivos</button>
    <p class="fhint">La fecha de transferencia se conserva separada del periodo laboral. Puedes incorporar evidencia sin fotografía; las nóminas autorizadas conservan sus importes y controles.</p>
    <div role="status" aria-live="polite" data-bh-mensaje>Preparando contexto…</div><div data-bh-archivos></div><div data-bh-lectura></div>
   </div><div class="m-foot"><button type="button" class="btn" data-bh="cerrar">Cerrar</button><button type="button" class="btn" data-bh="previa" disabled>Revisar obligación y cheque</button><button type="button" class="btn dark" data-bh="confirmar" disabled>Confirmar importación y conciliación</button></div></div>`,'lg');
  const host=$(clave),v={host,usuario,servicio:null,pagina:0,opciones,ocupado:false};vista=v;
  const q=s=>host.querySelector(s),mensaje=t=>{if(actual(v))q('[data-bh-mensaje]').textContent=t;};
  function centros(preferido){q('[data-bh-obra]').innerHTML=OBRAS.filter(o=>obraEmpresa(o)===q('[data-bh-empresa]').value).map(o=>`<option value="${o.id}" ${o.id===preferido?'selected':''}>${esc(o.nombre)}</option>`).join('');}
  centros(obra.id);
  const core=window.PLATINUM_CONCILIADOR_CORE;
  v.servicio=window.PLATINUM_BANCO_HISTORICO.crear({
   context:()=>({obra_id:q('[data-bh-obra]').value,usuario_id:USER?.id,firma:JSON.stringify(contexto())}),rpc:(...a)=>sb.rpc(...a),get storage(){return sb.storage;},core,
   legacy:{global:parsePagoGlobal,individual:parsePagoIndividual},hash:sha256Hex,file:(bytes,name)=>new File([bytes],name,{type:'application/pdf'}),
   paginas:async bytes=>{if(!window.pdfjsLib)throw Error('No cargó el lector PDF');const doc=await pdfjsLib.getDocument({data:new Uint8Array(bytes)}).promise;try{const pp=[];for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),t=await p.getTextContent();pp.push({numero:i,texto:t.items.map(x=>x.str).join(' ')});}return pp;}finally{await doc.destroy();}},
   fragmento:async(bytes,pagina)=>{if(!window.PDFLib)throw Error('No cargó el separador de páginas PDF');const src=await PDFLib.PDFDocument.load(bytes),out=await PDFLib.PDFDocument.create();const [pg]=await out.copyPages(src,[pagina-1]);out.addPage(pg);return(await out.save()).buffer;},
   ia:id=>iaLlamar(IA_FN.extract,{tipo:'bbva_historico_fragmento',archivo_id:id},160000),
   onChange:(s,ocupado)=>{v.ocupado=ocupado;if(actual(v))pintar(s);},
   onConfirmed:async(r,s)=>{if(!actual(v))return;markWrite();if(OBRA?.id===s.obra_id){window._pendingRT=true;window._pendingRTManual=true;}toast('Resultado de importación guardado; revisa los casos pendientes.','ok');}
  });
  function contexto(){const per=q('[data-bh-per]').value,sem=q('[data-bh-semana]').value;return{empresa_codigo:q('[data-bh-empresa]').value,anio:Number(q('[data-bh-anio]').value),periodicidad:per,semana:per==='SEMANAL'&&sem?Number(sem):null,
   mes:per==='QUINCENAL'?Number(q('[data-bh-mes]').value):null,quincena:per==='QUINCENAL'&&q('[data-bh-quincena]').value?Number(q('[data-bh-quincena]').value):null,concepto:q('[data-bh-concepto]').value};}
  function periodos(){const quin=q('[data-bh-per]').value==='QUINCENAL';q('[data-bh-semana-label]').hidden=quin;q('[data-bh-mes-label]').hidden=!quin;q('[data-bh-quincena-label]').hidden=!quin;}
  periodos();
  async function cargar(){v.contextoSucio=false;mensaje('Consultando archivos y obligaciones históricas…');await v.servicio.abrir(contexto());mensaje('Contexto cargado. Puedes archivar comprobantes aunque falte su fotografía o su obligación.');}
  function pintar(s){
   for(const b of host.querySelectorAll('button,[data-bh-contexto] input,[data-bh-contexto] select'))b.disabled=v.ocupado;
   const archivo=s?.archivo,filas=archivo?.propuesta?.records||[],pre=s?.previa?.filas||[];
   q('[data-bh="previa"]').disabled=v.ocupado||v.contextoSucio||!filas.length;
   q('[data-bh="confirmar"]').disabled=v.ocupado||v.contextoSucio||!s?.previa||!s?.puede_importar;
   if(!s){q('[data-bh-lectura]').innerHTML='';return;}
   q('[data-bh-archivos]').innerHTML=`<label>PDF globales o individuales<input data-bh-files type="file" accept=".pdf,application/pdf" multiple ${v.ocupado||!s.puede_importar?'disabled':''}></label>
    <label>Continuar archivo archivado<select data-bh-archivo><option value="">Selecciona un original</option>${s.archivos.map(a=>`<option value="${a.id}" ${archivo?.id===a.id?'selected':''}>${esc(a.nombre)} · ${esc(etiqueta(a.estado))}</option>`).join('')}</select></label>${s.puede_importar&&(s.anteriores||[]).length?'<label>Recuperar originales del flujo anterior<select data-bh-anterior><option value="">Selecciona original archivado</option>'+(s.anteriores||[]).map(x=>'<option value="'+x.id+'">'+esc(x.nombre)+'</option>').join('')+'</select></label>':''}`;
   if(!archivo){q('[data-bh-lectura]').innerHTML='<p class="fhint">Selecciona o carga un original para continuar.</p>';return;}
   const pages=archivo.propuesta?.paginas||[],totPag=Math.max(1,Math.ceil(filas.length/50));v.pagina=Math.min(v.pagina,totPag-1);
   const filasHtml=filas.slice(v.pagina*50,v.pagina*50+50).map((r,j)=>{const i=v.pagina*50+j,p=pre.find(x=>x.fila===i+1),res=s.resultados.find(x=>x.fila===i+1),f=p?.fuente;
    const ch=p?.cheques.find(c=>c.estatus!=='CANCELADO'),accion=p?.accion_cheque==='CANCELAR_AUTOMATICO'?'Se cancelará automáticamente el pendiente sin folios':p?.accion_cheque==='CONFIRMAR_CANCELACION'?'Requiere confirmar el cheque físico':p?.accion_cheque==='REVISAR_PROCEDIMIENTO'?'Cheque protegido: se conserva':'Sin cambio automático del cheque';
    return `<tr><td><input type="checkbox" data-bh-sel="${i}" ${r.seleccionado?'checked':''} ${v.ocupado||!s.puede_importar?'disabled':''} aria-label="Incluir operación ${i+1}"></td>
     <td><b>${esc(r.titular||'Titular pendiente')}</b><div class="fhint">Cuenta ${esc(r.mask||r.cuenta||'por leer')} · página ${r.pagina||'—'}</div><button type="button" class="btn" data-bh="resolver" data-i="${i}" ${!s.puede_importar?'disabled':''}>Resolver operación</button></td>
     <td>${esc(r.fecha||'Pendiente')}<br>${esc(r.estado||'Pendiente')}<div class="fhint">${esc(r.folio||'Referencia pendiente')}</div></td><td>${monto(r.importe)}</td>
     <td>${esc(f?.nombre||'Sin obligación vinculada')}<br>${esc(f?.concepto||r.concepto||s.contexto.concepto)}<div class="fhint">${f?`S${f.semana} · ${esc(f.desde)} al ${esc(f.hasta)} · ${esc(f.periodicidad)}`:'Periodo laboral por verificar'}</div>${p?.complemento_prevision?'<div class="fhint">Se aplica también '+monto(Number(r.importe)-Number(p.saldo_fiscal))+' a previsión autorizada, separada del neto fiscal.</div>':''}${f?.fecha_baja?'<div class="fhint">Ciclo '+esc(f.ciclo_desde||'por verificar')+' · baja '+esc(f.fecha_baja)+'</div>':''}</td>
     <td><strong>${esc(etiqueta(res?.estado||p?.estado||'PENDIENTE_DE_VISTA_PREVIA'))}</strong>${res?.explicacion?'<p class="fhint">'+esc(res.explicacion)+'</p>':''}${p?'<div class="fhint">Saldo anterior: '+monto(p.saldo_antes)+'</div>':''}</td>
     <td>${ch?`Cheque ${esc(ch.num_cheque||'sin número')} · consecutivo ${esc(ch.consecutivo||'sin consecutivo')}<br>${monto(ch.importe)} · ${esc(ch.estatus)}`:'Sin cheque activo'}${p?.pagos_similares?.some(pg=>String(pg.semana).replace(/\D/g,'')!==String(p.periodo.semana))?'<div class="fhint">El pago compatible se vinculará al periodo laboral mostrado si no tiene aplicaciones anteriores.</div>':''}<div class="fhint">${esc(accion)}</div>${p?.pagos_similares?.length?'<div class="fhint">Se reutilizará el pago compatible existente, salvo operación distinta documentada.</div>':''}</td></tr>`;});
   q('[data-bh-lectura]').innerHTML=`<h3>${esc(archivo.nombre)} · ${filas.length} operaciones</h3><p class="fhint">Contexto del original: ${esc(archivo.contexto.empresa_codigo)} · ${archivo.contexto.anio} · ${esc(archivo.contexto.periodicidad)} · ${archivo.contexto.semana?'S'+archivo.contexto.semana:'periodos por operación'}</p>${!pages.length&&s.puede_importar?'<button class="btn" data-bh="reanudar">Reintentar lectura del original</button>':''}
    ${(archivo.propuesta?.validacion?.errores||[]).map(e=>'<p style="color:var(--amber)">'+esc(e)+'</p>').join('')}
    ${pages.some(p=>p.pendiente)?'<p style="color:var(--amber)">Hay fragmentos pendientes. Las lecturas correctas se conservan; puedes importar las operaciones revisadas y continuar las demás después.</p>':''}
    <details><summary>Lectura por página y recuperación</summary>${pages.map(p=>`<p>Página ${p.numero} · ${p.records?.length||0} operaciones · ${esc(p.lector||'pendiente')} ${p.error?'<span style="color:var(--red)">'+esc(p.error)+'</span>':''} <button type="button" class="btn" data-bh="completar" data-pagina="${p.numero}">Completar sólo esta página</button></p>`).join('')}</details>
    <div style="overflow:auto;max-height:48vh">${ctrlTabla(['Incluir','Trabajador leído','Transferencia / referencia','Importe','Obligación propuesta','Resultado','Acción sobre cheque'],filasHtml,'No se reconocieron operaciones. El original permanece archivado.')}</div>
    ${totPag>1?`<div style="display:flex;gap:8px"><button type="button" class="btn" data-bh="pagina" data-page="${v.pagina-1}" ${v.pagina===0?'disabled':''}>Anterior</button><span>${v.pagina+1} de ${totPag}</span><button type="button" class="btn" data-bh="pagina" data-page="${v.pagina+1}" ${v.pagina+1===totPag?'disabled':''}>Siguiente</button></div>`:''}`;
  }
  async function resolver(i){
   let s=v.servicio.estado();if(!s.previa)await v.servicio.revisar();s=v.servicio.estado();const r=s.archivo.propuesta.records[i],p=s.previa.filas.find(x=>x.fila===i+1),op=p.opciones;
   const id='bh-resolver-'+contador+'-'+i;
   modal2(`<div class="m-head"><h2>Resolver operación ${i+1}</h2><button class="x" onclick="closeModal2()">×</button></div><div class="m-body" id="${id}">
    <p>Original: ${esc(s.archivo.nombre)} · página ${r.pagina||'—'}. La obligación fija el centro, ciclo y periodo; la fecha bancaria se conserva.</p>
    <label>Obligación histórica<select data-br-fuente><option value="">Sin obligación · conservar vínculo pendiente</option>${op.map(f=>`<option value="${esc(f.clave)}" ${(r.fuente_clave||p.fuente?.clave)===f.clave?'selected':''}>${esc(f.nombre)} · S${f.semana} · ${esc(f.concepto)} · ${monto(f.importe)} · ${esc(f.desde)} / ${esc(f.hasta)}</option>`).join('')}</select></label>
    <div class="grid" style="grid-template-columns:1fr 1fr"><label>Titular leído<input data-br-titular value="${esc(r.titular||'')}"></label><label>Cuenta destino / máscara<input data-br-cuenta value="${esc(r.cuenta||r.mask||'')}"></label>
     <label>Fecha real de transferencia<input type="date" data-br-fecha value="${esc(r.fecha||'')}"></label><label>Referencia bancaria<input data-br-folio value="${esc(r.folio||'')}"></label>
     <label>Importe de la operación<input type="number" min=".01" step=".01" data-br-importe value="${r.importe??''}"></label><label>Estado bancario<select data-br-estado>${['EXITOSO','RECHAZADO','PENDIENTE'].map(e=>`<option ${e===r.estado?'selected':''}>${e}</option>`).join('')}</select></label></div>
    <label><input type="checkbox" data-br-identidad ${r.confirmar_identidad?'checked':''}> He cotejado la identidad y la cuenta contra el original</label><label>Referencia del cotejo de identidad<input data-br-ref value="${esc(r.referencia_identidad||'')}"></label>
    ${p.pagos_similares.length?'<label>Pago compatible existente<select data-br-pago><option value="">Reutilizar automáticamente el compatible único</option>'+p.pagos_similares.map(x=>`<option value="${x.id}" ${r.pago_existente_id===x.id?'selected':''}>${esc(x.folio_lote||'sin referencia')} · ${monto(x.importe)} · ${esc(x.fecha_pago)}</option>`).join('')+'</select><label><input type="checkbox" data-br-distinto '+(r.confirmar_pago_distinto?'checked':'')+'> Es otra transferencia distinta, respaldada por referencia diferente</label><label>Referencia del soporte de la operación distinta<input data-br-distinto-ref value="'+esc(r.referencia_distinta||'')+'"></label>':''}
    <p class="fhint">Las correcciones se guardan como revisión de lectura. El archivo original no cambia.</p></div><div class="m-foot"><button class="btn" onclick="closeModal2()">Cancelar</button><button type="button" class="btn dark" data-br-guardar>Guardar y revisar</button></div>`,'md');
   const box=$(id),b=q=>box.querySelector(q);
   box.parentElement.querySelector('[data-br-guardar]').onclick=async()=>{try{const f=op.find(f=>f.clave===b('[data-br-fuente]').value),c={fuente_clave:f?.clave||null,trabajador_id:f?.trabajador_id||r.trabajador_id,
    concepto:f?.concepto||r.concepto,semana:f?.semana||r.semana,titular:b('[data-br-titular]').value.trim(),cuenta:b('[data-br-cuenta]').value.trim(),mask:b('[data-br-cuenta]').value.replace(/\D/g,'').slice(-4),
    fecha:b('[data-br-fecha]').value,folio:b('[data-br-folio]').value.trim(),importe:Number(b('[data-br-importe]').value),estado:b('[data-br-estado]').value,
    confirmar_identidad:b('[data-br-identidad]').checked,referencia_identidad:b('[data-br-ref]').value.trim(),pago_existente_id:b('[data-br-pago]')?.value||null,
    confirmar_pago_distinto:!!b('[data-br-distinto]')?.checked,referencia_distinta:b('[data-br-distinto-ref]')?.value||'',seleccionado:true};
    if(p.estado==='DUPLICADO_EN_ARCHIVO'){if(!confirm('Hay otra fila idéntica en este archivo. ¿Confirmas que representa la misma operación y debe reutilizarse? Para dos operaciones distintas captura sus referencias diferentes.'))return;c.confirmar_duplicado=true;}core.centavos(c.importe);await v.servicio.editar(i,c);closeModal2();await v.servicio.revisar();}catch(e){toast(e.message,'err');}};
  }
  host.addEventListener('change',async e=>{if(!actual(v)||v.ocupado)return;try{
   if(e.target.closest('[data-bh-contexto]')){v.contextoSucio=true;mensaje('Cambió el contexto. Pulsa Cargar contexto y archivos antes de continuar.');q('[data-bh="previa"]').disabled=true;q('[data-bh="confirmar"]').disabled=true;const fi=q('[data-bh-files]');if(fi)fi.disabled=true;}
   if(e.target.matches('[data-bh-empresa]'))centros();if(e.target.matches('[data-bh-per]'))periodos();
   if(e.target.matches('[data-bh-files]')){mensaje('Archivando y leyendo los originales…');const r=await v.servicio.subir([...e.target.files]);mensaje(r.some(x=>x.error)?'Hay archivos pendientes; revisa su detalle.':'Originales y lecturas guardados. Revisa cada operación antes de confirmar.');}
   if(e.target.matches('[data-bh-anterior]')&&e.target.value)await v.servicio.recuperar(e.target.value);
   if(e.target.matches('[data-bh-archivo]')&&e.target.value)await v.servicio.seleccionar(e.target.value);
   if(e.target.matches('[data-bh-sel]'))await v.servicio.editar(Number(e.target.dataset.bhSel),{seleccionado:e.target.checked});
  }catch(err){mensaje(err.message);}});
  host.addEventListener('click',async e=>{const b=e.target.closest('[data-bh]');if(!b||!actual(v)||v.ocupado)return;try{
   const a=b.dataset.bh;
   if(a==='cerrar'){v.servicio.cerrar();vista=null;closeModal();return;}
   if(a==='contexto')return await cargar();if(a==='previa')return await v.servicio.revisar();if(a==='resolver')return await resolver(Number(b.dataset.i));
   if(a==='reanudar')return await v.servicio.reanudar();if(a==='completar')return await v.servicio.completar(Number(b.dataset.pagina));if(a==='pagina'){v.pagina=Number(b.dataset.page);return pintar(v.servicio.estado());}
   if(a==='confirmar'){
    const s=v.servicio.estado(),cs=[];
    for(const p of s.previa.filas){if(!s.archivo.propuesta.records[p.fila-1].seleccionado)continue;const c={fila:p.fila,huella:p.huella};
     if(p.accion_cheque==='CONFIRMAR_CANCELACION'){const q=p.cheques.find(q=>q.estatus!=='CANCELADO');c.cheque_id=q.id;c.cheque_huella=p.cheque_huella;
      c.decision=confirm(`Este finiquito tiene el cheque ${q.num_cheque||'sin número'}, consecutivo ${q.consecutivo||'sin consecutivo'}, por ${monto(q.importe)}, en estado ${q.estatus}. La transferencia ${s.archivo.propuesta.records[p.fila-1].folio||'sin referencia'} corresponde al mismo trabajador y periodo.\n\nAceptar: confirmar cancelación y conciliar.\nCancelar: conservar cheque y dejar por revisar.\nEsta cancelación interna no realiza gestiones ante el banco.`)?'CANCELAR':'CONSERVAR';
     }cs.push(c);
    }
    if(!cs.length)throw Error('Selecciona las operaciones a importar');
    if(!confirm(`¿Confirmas incorporar ${cs.length} operación(es) con las acciones mostradas? Las no conciliables conservarán su vínculo pendiente.`))return;
    await v.servicio.confirmar(cs);mensaje('Resultado guardado. Los conflictos y parciales quedan visibles para retomarlos.');
   }
  }catch(err){mensaje(err.message);toast(err.message,'err');}});
  try{await cargar();if(opciones.archivo_id)await v.servicio.seleccionar(opciones.archivo_id);if(opciones.original){await v.servicio.subir([opciones.original]);}}catch(e){mensaje(e.message);}
 }
 window.PLATINUM_IMPORTACION_BANCARIA=Object.freeze({abrir,estaCapturando:()=>!!vista?.servicio.ocupado(),desmontar:()=>{vista?.servicio.cerrar();vista=null;}});
})();
