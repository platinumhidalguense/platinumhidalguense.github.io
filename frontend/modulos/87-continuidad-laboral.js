/* Continuidad laboral entre razones sociales del mismo patrón (JIRE ↔ PLATINUM) para el aguinaldo.
   Excepción delimitada a la regla de «último ingreso»: un traspaso administrativo sin terminación real ni
   finiquito no reinicia el ciclo reconocido. La cadena, su validación y el periodo de devengo se resuelven en
   el servidor (control_continuidad_laboral y el contexto del ciclo); aquí se presentan, se confirman en lote y
   se explican en la ficha, la corrida y el papel de cálculo. Nunca se une por nombre. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_CONTINUIDAD=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const VERSION='CONTINUIDAD_V1';
 const ESTADOS=Object.freeze({INEQUIVOCO:'Inequívoco: listo para reconocer',INCOMPLETO:'Datos por completar',TERMINACION_REAL:'Terminación real (finiquito)',
  INTERRUPCION:'Interrupción real',SIN_TRASPASO:'Sin traspaso',NO_APLICA:'No aplica'});
 const iso=/^\d{4}-\d\d-\d\d/;
 const fmt=f=>iso.test(f||'')?String(f).slice(8,10)+'/'+String(f).slice(5,7)+'/'+String(f).slice(0,4):'—';
 const masUno=f=>{const d=new Date(String(f).slice(0,10)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

 /* Datos del ciclo que entrega el servidor (x.ciclo) para presentarlos. */
 function resumen(ciclo){
  const c=ciclo?.continuidad,inicio=ciclo?.inicio||null,incorporacion=ciclo?.incorporacion||inicio;
  if(!c)return {aplica:false,estado:null,inicio,incorporacion};
  if(c.estado!=='VIGENTE')return {aplica:false,estado:c.estado,inicio,incorporacion,texto:c.texto||''};
  return {aplica:true,estado:'VIGENTE',inicio:c.inicio_reconocido,incorporacion:c.incorporacion,origen_empresa:c.origen_empresa,origen_obra:c.origen_obra||'',
   fecha_traspaso:c.fecha_traspaso,referencia:c.referencia||'',motivo:c.motivo||'',cadena:c.cadena||[],id:c.id,revision:c.revision,version:c.version||VERSION};
 }
 function texto(ciclo){
  const r=resumen(ciclo);
  return r.aplica?`Antigüedad reconocida desde ${fmt(r.inicio)} · incorporación a esta razón social ${fmt(r.incorporacion)} · origen ${r.origen_empresa}${r.origen_obra?' ('+r.origen_obra+')':''} · traspaso ${fmt(r.fecha_traspaso)}`:'';
 }
 /* Eslabones legibles de la cadena, del más reciente al más antiguo. */
 function eslabones(cadena){return (cadena||[]).map(e=>`${e.empresa} ${fmt(e.desde)}–${e.hasta?fmt(e.hasta):'vigente'}${e.solape?` (solape administrativo ${e.solape} día(s), contados una vez)`:''}`);}
 /* Avisos de la corrida derivados del reconocimiento (el servidor también bloquea APLICAR). */
 function avisos(ciclo){
  const c=ciclo?.continuidad;if(!c)return [];
  if(c.estado==='INVALIDA')return [{codigo:'CONTINUIDAD_INVALIDA',bloquea:true,texto:c.texto||'La continuidad reconocida ya no coincide con sus fuentes: revísala antes de calcular.'}];
  if(c.estado==='NO_APLICA_CICLO')return [{codigo:'CONTINUIDAD_NO_APLICA',bloquea:false,texto:c.texto||'El reconocimiento corresponde a un ciclo anterior.'}];
  return [];
 }
 /* Cobertura de captura de faltas a lo largo de la cadena: cada tramo usa la cobertura de su propio centro.
    Devuelve la fecha desde la que todo lo reconocido tiene captura (el núcleo marca el hueco anterior). */
 function cobertura(ciclo,coberturaDeObra,obraActual){
  const r=resumen(ciclo);if(!r.aplica)return undefined;
  let desde=r.inicio;
  (r.cadena||[]).forEach((e,i)=>{
   const c=coberturaDeObra(i===0&&obraActual?obraActual:e.obra_id),ini=e.desde<r.inicio?r.inicio:e.desde;
   if(c?.desde&&c.desde>ini){const lim=e.hasta&&c.desde>e.hasta?masUno(e.hasta):c.desde;if(lim>desde)desde=lim;}
  });
  return {desde};
 }
 /* Personas para CONFIRMAR: sólo confirmables sin reconocimiento vigente; las incompletas confirmables exigen referencia documental. */
 function itemsLote(filas,seleccion,referencias){
  const items=[],errores=[];
  for(const f of filas||[]){
   if(!seleccion.has(f.trabajador_id))continue;
   if(!f.confirmable||f.vigente?.estado==='VIGENTE'){errores.push(`${f.nombre||f.trabajador_id}: no es confirmable.`);continue;}
   const it={trabajador_id:f.trabajador_id,huella:f.huella};
   if(f.estado==='INCOMPLETO'){
    const ref=String(referencias?.[f.trabajador_id]||'').trim();
    if(ref.length<10){errores.push(`${f.nombre||f.trabajador_id}: escribe la referencia documental que acredita el traspaso (mínimo 10 caracteres).`);continue;}
    it.confirmar_faltantes=true;it.referencia_faltantes=ref;
   }
   items.push(it);
  }
  return {items,errores};
 }
 function conflictos(error){try{return JSON.parse(error?.details||error?.detail||'[]');}catch{return [];}}
 const MOTIVOS_CONFLICTO={FUENTES_CAMBIARON:'Las fichas cambiaron desde la vista previa: vuelve a consultar.',NO_CONFIRMABLE:'Tiene datos que deben corregirse antes de reconocer.',
  REFERENCIA_FALTANTES:'Falta la referencia documental del traspaso.',YA_RECONOCIDO_CON_OTRAS_FUENTES:'Ya tiene un reconocimiento con otras fuentes: revócalo antes de reconocer de nuevo.'};

 /* ---------- Interfaz (sólo navegador) ---------- */
 const UI={};
 if(typeof window!=='undefined'){
  const rpc=async(a,p)=>{const {data,error}=await sb.rpc('control_continuidad_laboral',{p_accion:a,p_datos:p});if(error){const e=Error(error.message);e.details=error.details;throw e;}return data;};
  UI.abrirLote=async function(empresa){
   const st={empresa:String(empresa||'').toUpperCase(),datos:null,sel:new Set(),refs:{},ocupado:false};
   modal2(`<div class="m-head"><h2>Continuidad laboral entre razones sociales · ${escape(st.empresa)}</h2><button class="x" onclick="closeModal2()" aria-label="Cerrar">×</button></div>
    <div class="m-body" id="cl-cuerpo" aria-live="polite"><p class="fhint">Consultando fichas con identidad documental en la otra razón social…</p></div><div class="m-foot" id="cl-pie"></div>`,'lg');
   const cuerpo=$('cl-cuerpo'),pie=$('cl-pie');
   async function cargar(){st.datos=await rpc('VISTA_PREVIA',{empresa_codigo:st.empresa});st.sel=new Set(st.datos.filas.filter(f=>f.estado==='INEQUIVOCO'&&!f.vigente).map(f=>f.trabajador_id));pintar();}
   function pintar(){
    const d=st.datos,r=d.resumen;
    const filas=d.filas.map(f=>{
     const vig=f.vigente?.estado==='VIGENTE',puede=d.puede_reconocer&&f.confirmable&&!vig;
     const falt=(f.faltantes||[]).map(x=>`<div style="color:${x.confirmable?'var(--amber)':'var(--red)'};font-size:11px">${x.confirmable?'⚠':'⛔'} ${escape(x.texto)}</div>`).join('');
     return `<tr><td><input type="checkbox" style="width:auto" data-cl-sel="${escape(f.trabajador_id)}" ${st.sel.has(f.trabajador_id)?'checked':''} ${puede?'':'disabled'} aria-label="Reconocer continuidad de ${escape(f.nombre)}"></td>
      <td>#${escape(f.no_trab??'—')} <b>${escape(f.nombre)}</b><div class="fhint">${escape(f.obra)} · ${escape(f.periodo_pago)}</div></td>
      <td><b>${escape(vig?'Reconocido':ESTADOS[f.estado]||f.estado)}</b>${f.vigente&&!vig?`<div class="fhint">${escape(f.vigente.texto||f.vigente.estado)}</div>`:''}${falt}${f.limite?.texto?`<div class="fhint">${escape(f.limite.texto)}</div>`:''}</td>
      <td>${f.cadena?.length>1?fmt(f.inicio_reconocido):'—'}</td><td>${fmt(f.incorporacion)}</td>
      <td>${f.cadena?.length>1?escape(f.origen_empresa)+' · traspaso '+fmt(f.fecha_traspaso):'—'}<div class="fhint">${eslabones(f.cadena).map(escape).join('<br>')}</div></td>
      <td>${f.estado==='INCOMPLETO'&&f.confirmable&&!vig?`<input data-cl-ref="${escape(f.trabajador_id)}" maxlength="300" placeholder="Oficio, acta o constancia del traspaso" value="${escape(st.refs[f.trabajador_id]||'')}">`:''}</td></tr>`;});
    cuerpo.innerHTML=`<p class="fhint">Se reconoce la antigüedad sólo en traspasos administrativos entre JIRE y PLATINUM sin terminación real ni finiquito: misma identidad documental (CURP con NSS o RFC), baja de origen contigua al ingreso de destino y referencia del traspaso. Las altas, bajas y movimientos IMSS de cada ficha no cambian. El aguinaldo se aplica una sola vez en la razón social actual.</p>
     <div class="stats"><div class="stat b"><div class="n">${r.candidatos}</div><div class="l">Fichas con antecedente en la otra razón social</div></div><div class="stat g"><div class="n">${r.inequivocos}</div><div class="l">Inequívocas por reconocer</div></div>
      <div class="stat a"><div class="n">${r.confirmables_con_referencia}</div><div class="l">Confirmables con referencia</div></div><div class="stat"><div class="n">${r.incompletos}</div><div class="l">Con datos por corregir</div></div>
      <div class="stat"><div class="n">${r.terminaciones_reales}</div><div class="l">Terminaciones o interrupciones reales</div></div><div class="stat g"><div class="n">${r.reconocidos}</div><div class="l">Ya reconocidas</div></div></div>
     ${ctrlTabla(['','Trabajador','Estado y datos faltantes','Antigüedad reconocida desde','Incorporación actual','Origen y cadena','Referencia (si falta)'],filas,'No hay fichas activas con antecedente documental en la otra razón social.')}
     ${d.puede_reconocer?`<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px"><div><label for="cl-motivo">Motivo</label><input id="cl-motivo" maxlength="300" value="Traspaso administrativo entre razones sociales del mismo patrón, sin terminación ni finiquito"></div>
      <div><label for="cl-referencia">Referencia documental general</label><input id="cl-referencia" maxlength="300" placeholder="Oficio o acuerdo del traspaso"></div></div>`:'<p class="fhint">Sólo el administrador puede reconocer la continuidad.</p>'}
     <p class="fhint" id="cl-estado" role="status"></p>`;
    pie.innerHTML=`<button class="btn" onclick="closeModal2()">Cerrar</button>${d.puede_reconocer?`<button class="btn dark" id="cl-confirmar" ${st.sel.size?'':'disabled'}>Reconocer ${st.sel.size} seleccionado(s)</button>`:''}`;
    cuerpo.querySelectorAll('[data-cl-sel]').forEach(x=>x.onchange=()=>{x.checked?st.sel.add(x.dataset.clSel):st.sel.delete(x.dataset.clSel);const b=$('cl-confirmar');if(b){b.disabled=!st.sel.size;b.textContent=`Reconocer ${st.sel.size} seleccionado(s)`;}});
    cuerpo.querySelectorAll('[data-cl-ref]').forEach(x=>x.oninput=()=>{st.refs[x.dataset.clRef]=x.value;});
    const b=$('cl-confirmar');if(b)b.onclick=confirmar;
   }
   async function confirmar(){
    if(st.ocupado)return;const out=$('cl-estado');
    const {items,errores}=itemsLote(st.datos.filas,st.sel,st.refs),motivo=$('cl-motivo').value.trim(),referencia=$('cl-referencia').value.trim();
    if(errores.length){out.textContent=errores.join(' ');return;}
    if(!items.length||motivo.length<5||referencia.length<5){out.textContent='Selecciona personas y escribe el motivo y la referencia documental.';return;}
    if(!confirm(`¿Reconocer la continuidad laboral de ${items.length} persona(s)? Su aguinaldo se calculará desde el ingreso reconocido; las fichas y movimientos IMSS no cambian.`))return;
    st.ocupado=true;$('cl-confirmar').disabled=true;
    try{const r=await rpc('CONFIRMAR',{motivo,referencia,operacion_id:crypto.randomUUID(),items});toast(`Continuidad reconocida: ${r.reconocidos} nueva(s)${r.resultado.some(x=>x.repetido)?', '+r.resultado.filter(x=>x.repetido).length+' ya estaban reconocidas':''}. Recalcula los borradores de aguinaldo.`,'ok');await cargar();}
    catch(e){const c=conflictos(e);out.textContent=c.length?c.map(x=>`${st.datos.filas.find(f=>f.trabajador_id===x.trabajador_id)?.nombre||x.trabajador_id}: ${MOTIVOS_CONFLICTO[x.motivo]||x.motivo}`).join(' · '):e.message;}
    finally{st.ocupado=false;const b=$('cl-confirmar');if(b)b.disabled=!st.sel.size;}
   }
   try{await cargar();}catch(e){cuerpo.innerHTML=`<p role="alert" style="color:var(--red)">${escape(e.message)}</p>`;}
  };
  /* Bloque de la ficha: reconocimiento vigente, cadena detectada y revocación auditada. */
  UI.bloqueFicha=async function(host,w,vigente){
   if(!host)return;host.innerHTML='';
   let d;try{d=await rpc('LEER',{trabajador_id:w.id});}catch(e){if(vigente())host.innerHTML=`<p class="fhint">${escape(e.message)}</p>`;return;}
   if(!vigente())return;
   const v=d.vigente,c=d.cadena;
   if(!v&&(!c||['SIN_TRASPASO','NO_APLICA'].includes(c.estado))){host.innerHTML='';return;}
   const linea=v?.estado==='VIGENTE'?`<b>Antigüedad reconocida desde ${fmt(v.inicio_reconocido)}</b> · incorporación a esta razón social ${fmt(v.incorporacion)} · origen ${escape(v.origen_empresa)}${v.origen_obra?' ('+escape(v.origen_obra)+')':''} · traspaso ${fmt(v.fecha_traspaso)}<div class="fhint">${eslabones(v.cadena).map(escape).join(' · ')} · referencia ${escape(v.referencia)} · ${escape(v.actor_email||'')} · ${escape(v.version||VERSION)} rev. ${v.revision}</div>`
    :v?`<span style="color:${v.estado==='INVALIDA'?'var(--red)':'var(--amber)'}">${escape(v.texto||v.estado)}</span>`
    :`${escape(ESTADOS[c.estado]||c.estado)}${(c.faltantes||[]).map(x=>`<div style="font-size:11px;color:${x.confirmable?'var(--amber)':'var(--red)'}">${escape(x.texto)}</div>`).join('')}${c.limite?.texto?`<div class="fhint">${escape(c.limite.texto)}</div>`:''}`;
   host.innerHTML=`<div class="tbl-card" style="padding:10px;margin:8px 0"><div class="sect">Continuidad laboral entre razones sociales</div><p style="font-size:12.5px">${linea}</p>
    ${d.puede_reconocer?`<div style="display:flex;gap:8px;flex-wrap:wrap">${!v&&c?.confirmable?`<button type="button" class="btn" data-cl-ficha="lote">Revisar y reconocer</button>`:''}${v&&v.id?`<button type="button" class="btn" data-cl-ficha="revocar">Revocar reconocimiento</button>`:''}</div>`:''}</div>`;
   const lote=host.querySelector('[data-cl-ficha="lote"]');if(lote)lote.onclick=()=>UI.abrirLote(typeof empresaDeTrabajador==='function'?empresaDeTrabajador(w):'PLATINUM');
   const rev=host.querySelector('[data-cl-ficha="revocar"]');
   if(rev)rev.onclick=async()=>{
    const motivo=prompt('Motivo de la revocación (el aguinaldo volverá a calcularse desde la incorporación de esta ficha):');if(!motivo||motivo.trim().length<5)return;
    rev.disabled=true;try{await rpc('REVOCAR',{id:v.id,revision:v.revision,motivo:motivo.trim()});toast('Reconocimiento revocado. Recalcula los borradores de aguinaldo.','ok');await UI.bloqueFicha(host,w,vigente);}
    catch(e){toast(e.message,'err');rev.disabled=false;}
   };
  };
 }
 return Object.freeze({VERSION,ESTADOS,resumen,texto,eslabones,avisos,cobertura,itemsLote,conflictos,MOTIVOS_CONFLICTO,fmt,...UI});
});
