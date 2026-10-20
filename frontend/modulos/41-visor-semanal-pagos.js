/* Visor de lectura por semana. La base determina cobertura, no el padrón actual.
   Sólo navega a los coordinadores existentes para importar o conciliar. */
(function(root){
 'use strict';
 let cfg=null,state=null,sequence=0;
 const labels={FALTA_COMPROBANTE:'Falta comprobante bancario',PAGO_PARCIAL:'Pago parcial · revisar saldo',BANCO_REGISTRADO:'Transferencia registrada',CHEQUE_REGISTRADO:'Cheque registrado',PAGO_MIXTO_REGISTRADO:'Transferencia + cheque registrados',SIN_IMPORTE:'Importe cero · no exige pago',SIN_SERVICIO:'Sin servicio / en revisión',REVISAR_SIN_SERVICIO:'Revisar caso sin servicio',IMPORTE_POR_VERIFICAR:'Importe histórico por verificar',REGISTRADO_SIN_BASE:'Pago registrado · falta base de comparación',REVISAR_FUENTES:'Fuentes históricas en conflicto',SIN_ASIGNAR:'Pago sin trabajador vinculado',DIFERENCIA_REGISTRADA:'Importe registrado distinto de la base',TRANSFERENCIA_REPORTADA:'Transferencia reportada · falta comprobante'};
 const ctx=()=>cfg.context(),node=()=>cfg.root(),esc=x=>cfg.esc(x??''),money=x=>x==null?'Por verificar':'$'+cfg.money(x);
 const btn=(text,action,disabled=false)=>`<button type="button" class="btn" ${disabled?'disabled':''} onclick="PLATINUM_VISOR_PAGOS.${action}">${text}</button>`;
 const table=(heads,rows)=>rows.length?`<div class="tbl-card" style="overflow:auto;max-height:59vh"><table style="min-width:0;width:100%"><thead><tr>${heads.map(h=>'<th>'+h+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'<div class="empty">No hay registros para esta semana y filtro. Esto no certifica por sí solo que todos estén pagados.</div>';
 function configure(options){cfg=options;}
 function actual(){if(!state||ctx().obra?.id!==state.obraId||ctx().view!=='pagos')throw Error('Abre el visor en el centro correspondiente.');return state;}
 function valid(s,t){return state===s&&sequence===t&&ctx().obra?.id===s.obraId&&ctx().view==='pagos'&&!!node();}
 async function read(action,args){const o=ctx().obra?.id;if(!o)throw Error('Selecciona un centro.');const r=await ctx().sb.rpc('control_visor_pagos',{p_accion:action,p_datos:{obra_id:o,...args}});
  if(r.error)throw Error(r.error.message||'No se pudo verificar el visor');if(!r.data||r.data.obra_id!==o||r.data.solo_lectura!==true)throw Error('Respuesta incompleta o de otro centro');return r.data;
 }
 function capture(){if(state&&cfg.$('vp-q'))state.q=cfg.$('vp-q').value;}
 async function mostrar(){if(!cfg||!node()||ctx().view!=='pagos'||!ctx().obra)return;
  if(!state||state.obraId!==ctx().obra.id){state={obraId:ctx().obra.id,sem:null,tab:'PERSONAS',q:'',page:0,detail:null,index:null,data:null};node().innerHTML='<p>Cargando semanas y comprobantes…</p>';}
  else capture();return cargar(true);
 }
 async function cargar(indice=false){const s=actual(),t=++sequence;s.data=null;s.rows=[];
  node().setAttribute?.('aria-busy','true');node().innerHTML='<div style="min-height:32vh;padding:18px" role="status">Verificando semanas, fuentes y comprobantes…</div>';
  try{
   if(indice||!s.index){const index=await read('INDICE',{});if(!valid(s,t))return;if(!Array.isArray(index.semanas))throw Error('Falta el índice de semanas');s.index=index;
    if(s.sem==null||!index.semanas.some(x=>x.semana===s.sem))s.sem=(index.semanas.find(x=>x.registros>0)||index.semanas[0])?.semana||1;
   }
   const details=await read('PERSONAS',{semana:s.sem,pagina:s.tab==='PERSONAS'||s.tab==='PENDIENTES'?s.page:0,q:s.tab==='PERSONAS'||s.tab==='PENDIENTES'?s.q:'',filtro:s.tab==='PENDIENTES'?'PENDIENTES':''});
   if(!valid(s,t))return;if(details.semana!==s.sem||!Array.isArray(details.filas)||!Array.isArray(details.lotes))throw Error('Respuesta incompleta de la semana');
   let data=details;
   if(s.tab==='INDIVIDUALES'||s.tab==='DETALLE'){
    data=await read('COMPROBANTES',{semana:s.sem,pagina:s.page,q:s.q,filtro:s.tab==='INDIVIDUALES'?'INDIVIDUAL':s.detail?.kind==='LOTE'?'GLOBAL':'',lote:s.detail?.lote||null,trabajador_id:s.detail?.id||null,sin_asignar:s.detail?.kind==='PERSONA'&&!s.detail.id});
    if(!valid(s,t))return;if(data.semana!==s.sem||!Array.isArray(data.filas))throw Error('Respuesta incompleta de comprobantes');
    if(data.revision!==details.revision)throw Error('Las fuentes cambiaron durante la lectura. Actualiza para evitar mezclar resultados.');
   }
   s.week=details;s.data=data;render();
  }catch(e){if(valid(s,t)){
   node().innerHTML=`<p role="alert">No se pudo verificar la información: ${esc(e.message)}. Esto no significa que falten pagos.</p>${btn('Reintentar','recargar()')}`;
   cfg.toast(e.message,'err');
  }}finally{if(valid(s,t))node().setAttribute?.('aria-busy','false');}
 }
 function render(){const s=actual(),index=s.index,d=s.data,w=s.week,sem=index.semanas.find(x=>x.semana===s.sem);
  const pendientes=Number(index.faltantes||0)+Number(index.parciales||0);
  const alert=`<div role="status" style="padding:13px;margin-bottom:12px;border:1px solid var(--border,#607080);border-radius:9px;background:${pendientes?'var(--amber-bg)':'var(--card)'}"><b>${pendientes?`⚠ ${index.faltantes} caso(s) sin comprobante y ${index.parciales} parcial(es) en el histórico`:'Sin faltantes confirmados en las bases verificables'}</b><p class="fhint">${index.revisar||0} caso(s) requieren cotejar importe, asignación o diferencias; ${index.semanas_sin_base||0} semana(s) sin base registrada. No se usan los trabajadores activos de hoy para inventar pagos históricos.</p><div style="display:flex;flex-wrap:wrap;gap:5px">${index.semanas.filter(x=>x.faltantes+x.parciales>0).map(x=>btn(`S${x.semana} · ${x.faltantes+x.parciales} pendiente(s)`,`irPendientes(${x.semana})`)).join('')}</div></div>`;
  const tools=`<div class="toolbar"><label>Semana<select id="vp-sem" onchange="PLATINUM_VISOR_PAGOS.semana(this.value)">${index.semanas.map(x=>`<option value="${x.semana}" ${s.sem===x.semana?'selected':''}>S${x.semana} · ${x.registros} persona(s) / registros</option>`).join('')}</select></label>${btn('← Semana anterior','mover(-1)',!index.semanas.some(x=>x.semana===s.sem-1))}${btn('Semana siguiente →','mover(1)',!index.semanas.some(x=>x.semana===s.sem+1))}${btn('↻ Actualizar','recargar()')}${index.puede_importar?btn('Importar comprobantes','importar()')+btn('Leer recibos con Gemini','recibos()'):''}${btn('Revisar / conciliar pagos','revisar()')}</div>`;
  const tabs=`<div class="toolbar">${[['PERSONAS','Por trabajador'],['GLOBALES','Pagos globales'],['INDIVIDUALES','Pagos individuales'],['PENDIENTES','Comprobantes faltantes / parciales']].map(([key,label])=>btn((s.tab===key?'● ':'')+label,`tab('${key}')`)).join('')}</div>`;
  const stats=`<div class="stats"><div class="stat g"><div class="n">${money(w.resumen.banco)}</div><div class="l">Transferencias exitosas · sin repetir evidencia</div></div><div class="stat"><div class="n">${money(w.resumen.cheque)}</div><div class="l">Cheques expedidos / entregados</div></div><div class="stat a"><div class="n">${w.resumen.faltantes}</div><div class="l">Falta comprobante bancario</div></div><div class="stat"><div class="n">${w.resumen.parciales}</div><div class="l">Pagos parciales</div></div><div class="stat"><div class="n">${w.resumen.revisar}</div><div class="l">Por verificar / diferencias</div></div></div>`;
  const search=s.tab==='GLOBALES'?'':`<form class="toolbar" onsubmit="event.preventDefault();PLATINUM_VISOR_PAGOS.buscar()"><input id="vp-q" style="max-width:440px;flex:1" placeholder="Buscar por número, nombre, contratista o folio" value="${esc(s.q)}">${btn('Buscar','buscar()')}${btn('Limpiar','limpiar()')}</form>`;
  s.rows=d.filas;
  let body='';
  if(s.tab==='GLOBALES')body=table(['Fecha','Folio / archivo importado','Registros','Total exitoso','Acción'],w.lotes.map((l,i)=>`<tr><td>${esc(l.fecha||'Sin fecha')}</td><td><b>${esc(l.folio||'Sin folio')}</b><br><small>${esc(l.archivo||'Sin nombre de archivo')}</small></td><td>${l.registros}</td><td>${money(l.importe)}</td><td>${btn('Ver lote',`lote(${i})`)}</td></tr>`));
  else if(s.tab==='PERSONAS'||s.tab==='PENDIENTES')body=table(['No. / trabajador','Contratista','Base de comparación','Banco','Cheque físico','Saldo por comprobar','Situación','Detalle'],s.rows.map((r,i)=>`<tr><td><b>#${esc(r.numero??'—')} ${esc(r.nombre)}</b></td><td>${esc(r.contratista||'Sin dato histórico')}</td><td>${money(r.esperado)}<br><small>${esc(r.fuente)}</small></td><td>${money(r.banco)}</td><td>${money(r.cheque)}${r.por_entregar?'<br><small>Entrega pendiente</small>':''}</td><td>${money(r.saldo)}</td><td><b>${esc(labels[r.estado]||r.estado)}</b>${r.cheques_pendientes?'<br><small>Hay cheque pendiente sin expedir: no es pago registrado</small>':''}${r.rechazados?'<br><small>Hay transferencia rechazada</small>':''}</td><td>${btn('Ver pagos',`persona(${i})`)}</td></tr>`));
  else body=table(['No. / persona','Fecha / tipo','Importe','Banco / cuenta','Folio / documento','Estado'],s.rows.map((r,i)=>`<tr><td><b>#${esc(r.numero??'—')} ${esc(r.nombre)}</b><br><small>Banco: ${esc(r.titular||'—')}</small></td><td>${esc(r.fecha||'Sin fecha')}<br>${esc(r.clase)}</td><td>${money(r.importe)}</td><td>${esc(r.banco||'—')}<br>${esc(r.cuenta||'—')}</td><td>${esc(r.folio||'Sin folio')}<br><small>${esc(r.nombre_archivo||'Sin nombre de archivo')}</small><br>${r.archivo?btn('Abrir PDF',`pdf(${i})`):'<small>Original no archivado; sólo datos importados</small>'}</td><td>${esc(r.estado)}${r.repetido?'<br><small>Evidencia repetida: no suma dos veces</small>':''}${!r.trabajador_id?'<br><small>Falta vincular trabajador</small>':''}</td></tr>`));
  const pagination=s.tab==='GLOBALES'?'':`<div class="toolbar" style="margin-top:10px">${btn('Anterior','pagina(-1)',d.pagina===0)}<span>${d.total} registro(s) · página ${d.pagina+1}</span>${btn('Siguiente','pagina(1)',(d.pagina+1)*d.por_pagina>=d.total)}</div>`;
  node().innerHTML=`<div style="padding:14px 0"><h2>Visor semanal de pagos</h2><p class="fhint">${esc(ctx().empresa)} · ${esc(ctx().obra.nombre)} · S${s.sem} · ${esc(sem?.desde||'')} al ${esc(sem?.hasta||'')}</p>${alert}${tools}${stats}${tabs}${s.detail?`<p><b>${esc(s.detail.label)}</b> ${btn('← Volver al resumen','volver()')}</p>`:''}${search}<p id="vp-status" class="fhint">Lectura verificada. Registrado no sustituye la autorización ni la conciliación del cierre.</p>${body}${pagination}<details style="margin-top:14px"><summary style="cursor:pointer;font-size:12px">Ayuda del visor</summary><p class="fhint">Selecciona semana y cambia entre trabajadores, lotes globales e individuales. Los datos históricos provienen de cierres, NOI o recibos con neto verificable; nunca del sueldo actual. Un cheque expedido cubre pago, aunque siga pendiente su entrega. Un cheque sin expedir no lo cubre. Un recibo sin neto extraído requiere revisión y no genera por sí solo una alerta de falta de pago. Las semanas sin base no se certifican como pagadas. Importar y conciliar usa las funciones existentes, con sus permisos y confirmaciones.</p></details></div>`;
 }
 async function semana(v){const s=actual(),n=Number(v);if(!Number.isInteger(n)||!s.index.semanas.some(x=>x.semana===n))throw Error('Semana no disponible.');s.sem=n;s.page=0;s.q='';s.detail=null;s.tab='PERSONAS';return cargar();}
 async function mover(delta){return semana(actual().sem+delta);}
 async function tab(t){const s=actual();if(!['PERSONAS','GLOBALES','INDIVIDUALES','PENDIENTES'].includes(t))throw Error('Vista no válida');s.tab=t;s.detail=null;s.page=0;s.q='';return cargar();}
 async function buscar(){const s=actual();capture();s.page=0;return cargar();}
 async function limpiar(){const s=actual();s.q='';if(cfg.$('vp-q'))cfg.$('vp-q').value='';s.page=0;return cargar();}
 async function pagina(delta){const s=actual(),page=s.page+delta;if(page<0||page*s.data.por_pagina>=s.data.total)return;s.page=page;return cargar();}
 async function irPendientes(sem){await semana(sem);return tab('PENDIENTES');}
 async function lote(i){const s=actual(),l=s.week.lotes[i];if(!l)throw Error('Lote no disponible');s.detail={kind:'LOTE',lote:l.lote,label:'Lote '+(l.folio||'sin folio'),back:'GLOBALES'};s.tab='DETALLE';s.page=0;s.q='';return cargar();}
 async function persona(i){const s=actual(),r=s.rows[i];if(!r)throw Error('Persona no disponible');s.detail={kind:'PERSONA',id:r.trabajador_id,label:'#'+(r.numero??'—')+' '+r.nombre,back:s.tab};s.tab='DETALLE';s.page=0;s.q='';return cargar();}
 async function volver(){return tab(actual().detail?.back||'PERSONAS');}
 async function pdf(i){const s=actual(),r=s.rows[i];if(!['INDIVIDUALES','DETALLE'].includes(s.tab)||!r?.archivo)throw Error('El original no está archivado.');return cfg.pdf(r.archivo);}
 async function recibos(){const s=actual();if(!s.index.puede_importar)throw Error('Tu cuenta es de consulta.');return window.PLATINUM_RECIBOS_IA?.abrir(s.sem);}
 async function importar(){const s=actual();if(!s.index.puede_importar)throw Error('Tu cuenta es de consulta.');return cfg.importar(s.sem);}
 async function revisar(){return cfg.revisar(actual().sem);}
 async function recargar(){capture();return cargar(true);}
 const guard=f=>(...args)=>{try{const r=f(...args);return r?.catch?r.catch(e=>cfg.toast(e.message,'err')):r;}catch(e){cfg.toast(e.message,'err');}};
 root.PLATINUM_VISOR_PAGOS=Object.freeze({configure,...Object.fromEntries(Object.entries({mostrar,semana,mover,tab,buscar,limpiar,pagina,irPendientes,lote,persona,volver,pdf,importar,recibos,revisar,recargar}).map(([k,f])=>[k,guard(f)]))});
})(window);
window.PLATINUM_VISOR_PAGOS.configure({
 context:()=>({sb,obra:OBRA,view:VIEW,empresa:OBRA?razonSocialEmpresa(empresaDeObra(OBRA)):''}),
 $,root:()=>$('visor-pagos'),esc,money,toast,
 importar:sem=>{openImportPago();if($('pg-sem'))$('pg-sem').value='S'+sem;},
 revisar:sem=>window.PLATINUM_PAGOS_SABADO?.abrir(sem),
 pdf:async path=>{const r=await sb.storage.from('expedientes').createSignedUrl(path,60);if(r.error||!r.data?.signedUrl)throw Error('No se pudo abrir el archivo privado.');window.open(r.data.signedUrl,'_blank','noopener,noreferrer');}
});
