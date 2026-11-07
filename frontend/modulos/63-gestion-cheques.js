/* Tabla operativa de cheques: todas las semanas del centro, sin duplicar
   el lector fiscal ni el motor. Los folios usan una ruta de metadatos físicos. */
(function(){
 'use strict';
 let ctx=null,root=null,filtros={q:'',estatus:'',contratista:'',semana:'',orden:'consecutivo:asc'},revision=new Map(),token=0,ocupado=false;
 const cents=v=>Number.isFinite(Number(v))?Math.round(Number(v)*100):null;
 const escape=val=>esc(String(val??'')),permiso=()=>puedeEditarTrabajador();
 const vigente=c=>ctx===c&&OBRA?.id===c.obra&&USER?.id===c.user&&VIEW==='conciliador';
 const fuente=()=>vigente(ctx)?CHEQUES.filter(c=>c.obra_id===ctx.obra&&!c.eliminado):[];
 const huellaFiscal=q=>JSON.stringify([typeof DOCSX==='undefined'?[]:DOCSX,typeof CTRLNOI==='undefined'?[]:CTRLNOI].map(rs=>rs.filter(d=>d.trabajador_id===q.trabajador_id&&normSem(d.semana)===normSem(q.semana)).map(d=>[d.id,d.hash,d.updated_at,d.nomina_neto,d.neto,d.monto_noi,d.cfdi_uuid,d.anulado])));
 const button=(label,a,id='',disabled=false)=>`<button type="button" class="btn" data-gq="${a}" ${id?`data-id="${escape(id)}"`:''} ${disabled?'disabled':''}>${label}</button>`;
 function filas(visual=false){const q=filtros.q.trim().toLocaleUpperCase('es-MX'),[k,dir]=filtros.orden.split(':');const qs=fuente();return (visual?(window.PLATINUM_DATOS?.vista('cheques',qs)??qs):qs).filter(c=>(!filtros.estatus||c.estatus===filtros.estatus)&&(!filtros.contratista||c.contratista===filtros.contratista)&&(!filtros.semana||String(normSem(c.semana))===filtros.semana)&&(!q||[c.no_trab,c.nombre,c.contratista,c.curp,c.num_cheque,c.consecutivo,c.semana].join(' ').toLocaleUpperCase('es-MX').includes(q))).sort((a,b)=>{
  let x=a[k],y=b[k];if(x==null||x==='')return y==null||y===''?0:1;if(y==null||y==='')return-1;
  const z=k==='importe'?Number(x)-Number(y):String(x).localeCompare(String(y),'es-MX',{numeric:true,sensitivity:'base'});return(dir==='desc'?-z:z)||String(a.nombre||'').localeCompare(String(b.nombre||''));
 });}
 function montar(host){const c={obra:OBRA?.id,user:USER?.id};if(!c.obra||!c.user)return;if(ctx?.obra!==c.obra||ctx?.user!==c.user){salir();ctx=c;filtros={q:'',estatus:'',contratista:'',semana:'',orden:'consecutivo:asc'};revision.clear();}root=$(host);if(!root)return;
  const qs=fuente(),op=(v,n,actual)=>`<option value="${escape(v)}" ${v===actual?'selected':''}>${escape(n)}</option>`;
  root.innerHTML=`<div class="cg-toolbar gq-acciones" aria-label="Acciones de cheques">${button('＋ Nuevo cheque','nuevo','',!permiso())}${button('🧾 Verificar recibos de la lista','verificar','',ocupado||!permiso())}${button('Detener verificación','detener','',!ocupado)}${button('Leer PDF archivados','tradicional','',!permiso())}${button('Leer PDF con Gemini','gemini','',!permiso())}${button('Exportar Excel','exportar')}${button('Control de folios','folios','',!permiso())}${button('Reuniones de entrega','reuniones','',!permiso())}${button('Chequeras de 50','chequeras')}</div>
   <p class="fhint">Todos los cheques del centro, incluidas semanas anteriores. Corregir folios conserva importe, estatus, trabajador y nómina. El recibo fiscal se verifica por persona, periodo y concepto; no acredita cobro bancario.</p>
   <div class="stats" id="chq-stats"></div><div class="cg-toolbar gq-filtros"><label>Buscar<input id="gq-q" aria-label="Buscar cheques" placeholder="Nombre, número, folio o consecutivo…" value="${escape(filtros.q)}"></label>
   <label>Estatus<select id="gq-estatus">${op('','Todos',filtros.estatus)}${['PENDIENTE','EXPEDIDO','ENTREGADO','CANCELADO'].map(v=>op(v,v,filtros.estatus)).join('')}</select></label>
   <label>Contratista<select id="gq-contratista">${op('','Todos',filtros.contratista)}${[...new Set(qs.map(c=>c.contratista).filter(Boolean))].sort().map(v=>op(v,v,filtros.contratista)).join('')}</select></label>
   <label>Semana<select id="gq-semana">${op('','Todas',filtros.semana)}${[...new Set(qs.map(c=>normSem(c.semana)).filter(Boolean))].sort((a,b)=>Number(b)-Number(a)).map(v=>op(String(v),'S'+v,filtros.semana)).join('')}</select></label>
   <label>Ordenar<select id="gq-orden">${[['consecutivo:asc','Consecutivo: menor a mayor'],['consecutivo:desc','Consecutivo: mayor a menor'],['num_cheque:asc','Número: menor a mayor'],['num_cheque:desc','Número: mayor a menor'],['importe:asc','Importe: menor a mayor'],['importe:desc','Importe: mayor a menor'],['no_trab:asc','Número de trabajador']].map(([v,n])=>op(v,n,filtros.orden)).join('')}</select></label></div>
   <p id="gq-progreso" role="status" aria-live="polite"></p><div class="cs-registros" style="max-height:65vh"><table><thead><tr>${['No.','Nombre completo','Contratista','Semana','Periodo','Importe','Tipo','Número cheque','Consecutivo','Estatus','Recibo timbrado','Acciones'].map(h=>'<th>'+h+'</th>').join('')}</tr></thead><tbody id="gq-tbody"></tbody></table></div><div id="gq-pagina" class="lista-pagina" aria-label="Páginas de cheques" hidden></div>`;
  root.onclick=e=>{const b=e.target.closest('[data-gq]');if(b&&!b.disabled)Promise.resolve(accion(b)).catch(e=>toast(e.message,'err'));};
  for(const key of ['q','estatus','contratista','semana','orden']){const e=$('gq-'+key);e[key==='q'?'oninput':'onchange']=()=>{filtros[key]=e.value;pintar();};}
  renderChqStats();pintar();
 }
 function pintar(){if(!root||!vigente(ctx)||!$('gq-tbody'))return;for(const b of root.querySelectorAll('[data-gq="verificar"],[data-gq="detener"]'))b.disabled=b.dataset.gq==='detener'?!ocupado:ocupado||!permiso();const all=filas(true),rs=window.PLATINUM_DATOS?.pagina('cheques',all,$('gq-pagina'),JSON.stringify(filtros),pintar,70)??all;$('gq-tbody').innerHTML=rs.length?rs.map(c=>{const r=revision.get(c.id),ok=r&&r.importe===cents(c.importe)&&r.version===c.updated_at&&r.fuente===huellaFiscal(c),info=ok?r:null;
  return`<tr><td>${escape(c.no_trab)}</td><td><b>${escape(c.nombre)}</b></td><td>${escape(c.contratista)}</td><td>${escape(c.semana)}</td><td>${escape(c.periodo)}</td><td>$${money(c.importe)}</td><td>${escape(c.tipo_pago)}</td><td>${escape(c.num_cheque||'SIN NÚMERO')}</td><td>${escape(c.consecutivo||'Sin consecutivo')}</td><td><span class="badge ${escape(c.estatus)}">${escape(c.estatus)}</span>${c._pendiente_visual?'<span class="badge PENDIENTE">Guardando…</span>':''}</td><td><span class="cs-badge ${info?.estado==='DIFERENCIA'?'cs-rojo':''}">${escape(info?.texto||'Sin verificar en esta consulta')}</span></td><td><div style="display:flex;gap:5px;flex-wrap:wrap">${button('Corregir folios','editar',c.id,!permiso()||c._pendiente_visual)}${button('Verificar neto','uno',c.id,ocupado||!permiso())}${permiso()?button('Abrir captura','captura',c.id,c._pendiente_visual):''}</div></td></tr>`;
 }).join(''):'<tr><td colspan="12">No hay cheques con estos filtros.</td></tr>';
 }
 async function verificar(qs){if(ocupado)return;if(!permiso())throw Error('Tu cuenta es de consulta');if(!qs.length)throw Error('No hay cheques en la selección');const c=ctx,t=++token;ocupado=true;pintar();let n=0;try{for(const q of qs){if(!vigente(c)||t!==token)return;const node=$('gq-progreso');if(node)node.textContent=`Verificando ${++n} de ${qs.length}: ${q.nombre}…`;
   const r=await chqResolverNeto(q);if(!vigente(c)||t!==token)return;
   const fiscal=!!r.cfdi_prioritario||/PDF.*TIMBRADO|XML|CFDI/i.test(r.origen||'');let estado='REVISAR',texto=r.error||'Sin recibo fiscal verificable';
   if(!r.error&&fiscal){estado=cents(q.importe)===cents(r.neto)?'COINCIDE':'DIFERENCIA';texto=estado==='COINCIDE'?'✓ Cuadra al centavo':'Diferencia: recibo $'+money(r.neto);}
   else if(!r.error)texto='Sólo NOI disponible: falta CFDI verificable';
   revision.set(q.id,{estado,texto,importe:cents(q.importe),version:q.updated_at,fuente:huellaFiscal(q)});pintar();
  }}finally{if(t===token)ocupado=false;if(t===token&&vigente(c)&&$('gq-progreso')){$('gq-progreso').textContent=`Verificación terminada: ${n} cheque(s). Los importes y folios no se modificaron.`;pintar();}}
 }
 function buscar(id){const q=fuente().find(x=>x.id===id);if(!q)throw Error('El cheque ya no está disponible en este centro');return q;}
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
 function semana(){const sem=Number(filtros.semana);if(!sem)throw Error('Selecciona una semana para abrir el lector de PDF');return sem;}
 async function accion(b){if(!vigente(ctx))return;const a=b.dataset.gq;if(a==='exportar')return exportCheques(filas());if(a==='chequeras')return openChequerasFisicas();if(!permiso())throw Error('Tu cuenta es de consulta');if(a==='detener'){token++;ocupado=false;if($('gq-progreso'))$('gq-progreso').textContent='Verificación detenida. Las respuestas pendientes no se aplicarán a esta vista.';pintar();return;}
  if(a==='editar')return editar(b.dataset.id);if(a==='uno')return verificar([buscar(b.dataset.id)]);if(a==='verificar')return verificar(filas());if(a==='captura')return openChequeForm(buscar(b.dataset.id).id);if(a==='nuevo')return openChequeForm(null);if(a==='folios')return openControlFolios();if(a==='reuniones')return openReunionesEntrega();if(a==='tradicional')return PLATINUM_RECIBOS_VERIFICACION.abrir(Number(filtros.semana)||0);if(a==='gemini')return PLATINUM_RECIBOS_IA.abrir(semana());
 }
 function refrescar(){if(!root||!vigente(ctx))return;if(!$('gq-tbody'))return montar(root.id);
  const qs=fuente(),scroll=root.querySelector('.cs-registros'),top=scroll?.scrollTop,left=scroll?.scrollLeft;
  for(const [k,values] of [['contratista',qs.map(c=>c.contratista)],['semana',qs.map(c=>normSem(c.semana))]]){
   const sel=$('gq-'+k);if(!sel)continue;const prev=new Set([...sel.querySelectorAll('option')].map(x=>x.value));
   for(const v of [...new Set(values.filter(Boolean).map(String))].sort())if(!prev.has(v)){const o=document.createElement('option');o.value=v;o.textContent=k==='semana'?'S'+v:v;sel.appendChild(o);}
  }
  renderChqStats();pintar();if(scroll){scroll.scrollTop=top;scroll.scrollLeft=left;}
 }
 function salir(){token++;ctx=null;root=null;ocupado=false;revision.clear();}
 window.PLATINUM_GESTION_CHEQUES=Object.freeze({montar,refrescar,salir,filas,editar,verificar,guardarFolios});
})();
