/* Calendario de la ficha → horas extra, descanso semanal laborado y descanso
   obligatorio laborado. Un solo recorrido: contexto del trabajador en la
   fecha → captura → vista previa calculada por el servidor → confirmación
   única que registra y deja la percepción en la prenómina del periodo.
   Un festivo en el calendario sólo informa: nunca crea pagos. */
(function(){
 'use strict';
 const J=()=>window.PLATINUM_JORNADA;
 const TIPOS={HORAS_EXTRA:'Horas extra',DESCANSO_SEMANAL:'Descanso semanal laborado',DESCANSO_OBLIGATORIO:'Descanso obligatorio laborado'};
 const DIAS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
 const rpc=async(a,j)=>{const r=await sb.rpc('control_jornada',{p_accion:a,p_datos:j});if(r.error)throw Error(r.error.message);return r.data;};
 const $j=id=>document.getElementById('jx-'+id);
 const hm=min=>`${Math.floor(min/60)}:${String(min%60).padStart(2,'0')} h`;
 let guardando=false;

 /* ---------- calendario ---------- */
 async function cargar(s,r){
  s.jornada=[];s.jornadaError='';
  try{s.jornada=(await rpc('LISTAR',{trabajador_id:s.id,desde:r.desde,hasta:r.hasta})).eventos||[];}
  catch(e){s.jornadaError=/control_jornada|function|schema cache/i.test(e.message)?'':e.message;}
 }
 function festivos(f){try{return J().descansosObligatorios(f.slice(0,4)).filter(d=>d.fecha===f);}catch{return [];}}
 function celda(s,f){
  if(!f)return '';
  const fx=festivos(f).map(()=>'<small title="Art. 74 LFT · sólo informa, no genera pago">Descanso obligatorio</small>').join('');
  const es=(s.jornada||[]).filter(e=>e.fecha_trabajada===f&&e.estado==='APLICADO').map(e=>`<small>${esc(e.tipo==='HORAS_EXTRA'?'Horas extra '+hm(Number(e.calculo?.minutos||0)):TIPOS[e.tipo])}</small>`).join('');
  return fx+es;
 }
 function lista(s){
  const xs=s.jornada||[];
  if(s.jornadaError)return `<p class="fhint" style="color:var(--red)">Horas extra y descansos no consultados: ${esc(s.jornadaError)}</p>`;
  if(!xs.length)return '';
  return `<div class="sect">Horas extra y descansos laborados</div>${xs.map(e=>{const c=e.calculo||{};return `<div class="kv" data-jornada-evento="${esc(e.id)}"><b>${esc(e.fecha_trabajada)} · ${esc(TIPOS[e.tipo]||e.tipo)}${e.estado==='ANULADO'?' · anulada':''}</b><span>$${money(e.bruto)} bruto · exento $${money(e.exento)} · gravado $${money(e.gravado)}${e.tipo==='HORAS_EXTRA'?` · ${hm(Number(c.minutos_dobles||0))} dobles, ${hm(Number(c.minutos_triples||0))} triples`:''} · aplicada S${e.semana_aplicacion}${e.retroactivo?' · ajuste de S'+e.semana_origen:''}${e.protegido?' · periodo autorizado':''}${e.estado==='APLICADO'&&!e.protegido&&puedeEditarTrabajador()?` <button class="btn" data-cal="jornada-editar" data-id="${esc(e.id)}">Editar</button> <button class="btn" data-cal="jornada-anular" data-id="${esc(e.id)}">Anular</button>`:''}</span></div>`;}).join('')}`;
 }
 async function accion(s,a,id,listo){
  const e=(s.jornada||[]).find(x=>x.id===id);if(!e||!puedeEditarTrabajador())return;
  if(a==='jornada-editar'){abrir({w:s.w,fecha:e.fecha_trabajada,tipo:e.tipo,editar:e,alGuardar:listo});return;}
  if(a!=='jornada-anular')return;
  const motivo=prompt(`Motivo para anular ${TIPOS[e.tipo]} del ${e.fecha_trabajada} ($${money(e.bruto)}). La captura queda en auditoría y la semana se recalcula.`);
  if(!motivo||!motivo.trim())return;
  const r=await rpc('ANULAR',{id,version:e.version,motivo:motivo.trim()});
  toast(r.redistribuidas?`Anulada · ${r.redistribuidas} captura(s) de la semana recalculadas`:'Captura anulada');
  await listo?.();
 }

 /* ---------- captura ---------- */
 function capturaDe(tipo,ctx){
  const v=id=>$j(id)?.value,c={};
  const jt=v('jornada');c.jornada=jt==='PACTADA'?{tipo:'PACTADA',horas:Number(v('pactada-horas')),base:v('pactada-base'),referencia:v('pactada-ref')}:{tipo:jt};
  if($j('base-doc')?.checked){c.salario_base=Number(v('base-monto'));c.base_referencia=v('base-ref');}
  const intervalos=[...document.querySelectorAll('[data-jx-intervalo]')].map(r=>({inicio:r.querySelector('[data-i=inicio]').value,fin:r.querySelector('[data-i=fin]').value,descanso_min:Number(r.querySelector('[data-i=descanso]').value||0)})).filter(x=>x.inicio||x.fin);
  const minutos=Number(v('horas')||0)*60+Number(v('minutos')||0);
  if(v('modo')==='INTERVALOS')c.intervalos=intervalos;else if(minutos)c.minutos=minutos;
  if(tipo!=='HORAS_EXTRA'){c.laboro=!!$j('laboro')?.checked;c.ordinario_incluido=!!$j('ordinario')?.checked;}
  if(tipo==='DESCANSO_SEMANAL')c.descanso_semanal=Number(v('descanso-dia'));
  if(tipo==='DESCANSO_OBLIGATORIO'&&$j('electoral-ref'))c.electoral_local={referencia:v('electoral-ref'),motivo:'Jornada electoral local'};
  if($j('prima')?.checked)c.prima_dominical={aplica:true,pct:Number(v('prima-pct'))};
  return c;
 }
 function formulario(tipo,ctx,f,e){
  const t=ctx.trabajador,cap=e?.captura||{},dom=J().dow(f)===0,jt=cap.jornada?.tipo||(String(t.turno||'').toUpperCase()==='NOCTURNO'?'NOCTURNA':String(t.turno||'').toUpperCase()==='MIXTO'?'MIXTA':'DIURNA');
  const motivos=J().motivosDescanso(f,{descanso_semanal:cap.descanso_semanal??0});
  const ints=cap.intervalos?.length?cap.intervalos:[{inicio:'',fin:'',descanso_min:0}];
  const fila=x=>`<div data-jx-intervalo style="display:flex;gap:6px;align-items:center;margin:4px 0"><input type="time" data-i="inicio" value="${esc(x.inicio||'')}" aria-label="Inicio"> a <input type="time" data-i="fin" value="${esc(x.fin||'')}" aria-label="Término"> <input type="number" data-i="descanso" min="0" step="5" value="${Number(x.descanso_min||0)}" style="width:80px" aria-label="Descanso no laborado (min)"> min sin pago</div>`;
  return `<div class="kv"><b>Contexto en ${esc(f)}</b><span>${esc(t.empresa)} · ${esc(t.centro)} · contratista ${esc(t.contratista||'—')} · ${esc(t.periodo_pago)} (motor ${esc(motorNominaDe({...t}))}) · SD registrado $${money(t.sd)} · alta ${esc(t.fecha_alta||'—')}${t.fecha_reingreso?' · reingreso '+esc(t.fecha_reingreso):''}${t.fecha_baja?' · baja '+esc(t.fecha_baja):''}</span></div>
   <div class="kv"><b>Regla laboral</b><span>${esc(ctx.regla.id)} · jornada máx. ${ctx.regla.ordinaria} h/semana · dobles hasta ${ctx.regla.umbral} h/semana<br><small>${esc(ctx.regla.fuente)}</small></span></div>
   <div class="kv"><b>Periodo de aplicación</b><span>S${ctx.destino.semana} (${esc(ctx.destino.desde)} – ${esc(ctx.destino.hasta)}) · pago ${esc(ctx.fecha_pago)}${ctx.retroactivo?` · <b>ajuste: la nómina de S${ctx.origen.semana} ya está autorizada</b>`:''}</span></div>
   ${motivos.length?`<div class="cal-aviso">Motivo detectado: ${motivos.map(m=>esc(m.motivo+' ('+m.fundamento+')')).join(' · ')}. Sólo informa: registra el pago únicamente si el trabajador laboró.</div>`:''}
   ${ctx.conflictos.length?`<div class="cal-aviso cal-rojo">${ctx.conflictos.map(c=>esc(c.texto)).join('<br>')}</div>`:''}
   ${ctx.trabajador.curp_documentada?'':'<div class="cal-aviso">Sin CURP: el acumulado semanal se lleva por este registro de trabajador; documenta la CURP para acumular entre centros del mismo patrón.</div>'}
   <label>Jornada documentada</label><select id="jx-jornada">${['DIURNA','NOCTURNA','MIXTA','PACTADA'].map(x=>`<option ${x===jt?'selected':''}>${x}</option>`).join('')}</select>
   <div id="jx-pactada" ${jt==='PACTADA'?'':'hidden'}><label>Horas pactadas por día</label><input id="jx-pactada-horas" type="number" step="0.25" min="0.25" value="${esc(cap.jornada?.horas??'')}"><label>Máximo legal de referencia</label><select id="jx-pactada-base">${['DIURNA','NOCTURNA','MIXTA'].map(x=>`<option ${x===(cap.jornada?.base||'DIURNA')?'selected':''}>${x}</option>`).join('')}</select><label>Contrato o convenio</label><input id="jx-pactada-ref" maxlength="200" value="${esc(cap.jornada?.referencia||'')}"></div>
   <label><input type="checkbox" id="jx-base-doc" ${cap.base_referencia?'checked':''}> El salario ordinario real es mayor al registrado (documentado)</label>
   <div id="jx-base" ${cap.base_referencia?'':'hidden'}><label>Salario diario ordinario documentado</label><input id="jx-base-monto" type="number" step="0.01" min="0" value="${esc(cap.base_referencia?cap.salario_base:'')}"><label>Documento que lo acredita</label><input id="jx-base-ref" maxlength="200" value="${esc(cap.base_referencia||'')}"><p class="fhint">Nunca se usa una base menor al salario registrado ni se convierte un neto en bruto.</p></div>
   ${tipo!=='HORAS_EXTRA'?`<label><input type="checkbox" id="jx-laboro" ${cap.laboro?'checked':''}> El trabajador efectivamente laboró este día de descanso</label>
     <label><input type="checkbox" id="jx-ordinario" ${cap.ordinario_incluido===false?'':'checked'}> El salario ordinario del día ya está incluido en su nómina</label>`:''}
   ${tipo==='DESCANSO_SEMANAL'?`<label>Día de descanso semanal documentado</label><select id="jx-descanso-dia">${DIAS.map((d,i)=>`<option value="${i}" ${i===(cap.descanso_semanal??J().dow(f))?'selected':''}>${d}</option>`).join('')}</select>`:''}
   ${tipo==='DESCANSO_OBLIGATORIO'&&!festivos(f).length?`<div class="cal-aviso">Esta fecha no es un descanso obligatorio federal del art. 74 LFT. Sólo procede para una jornada electoral local:</div><label>Referencia legal de la jornada electoral local</label><input id="jx-electoral-ref" maxlength="200" value="${esc(cap.electoral_local?.referencia||'')}">`:''}
   <label>${tipo==='HORAS_EXTRA'?'Tiempo extraordinario trabajado':'Tiempo trabajado en el descanso (opcional)'}</label>
   <select id="jx-modo"><option value="HORAS" ${cap.intervalos?.length?'':'selected'}>Horas y minutos</option><option value="INTERVALOS" ${cap.intervalos?.length?'selected':''}>Intervalos de inicio y término</option></select>
   <div id="jx-horas-box" ${cap.intervalos?.length?'hidden':''} style="display:flex;gap:6px"><input id="jx-horas" type="number" min="0" max="24" step="1" value="${cap.minutos?Math.floor(cap.minutos/60):''}" aria-label="Horas"> h <input id="jx-minutos" type="number" min="0" max="59" step="1" value="${cap.minutos?cap.minutos%60:''}" aria-label="Minutos"> min</div>
   <div id="jx-intervalos" ${cap.intervalos?.length?'':'hidden'}>${ints.map(fila).join('')}<button class="btn" type="button" id="jx-agregar">Agregar intervalo</button><p class="fhint">Captura los intervalos en el orden del turno; un turno que termina después de medianoche se registra en la fecha en que inicia y no se duplica tiempo.</p></div>
   ${dom?`<label><input type="checkbox" id="jx-prima" ${cap.prima_dominical?.aplica?'checked':''}> Prima dominical asociada (art. 71 LFT)</label><input id="jx-prima-pct" type="number" min="25" max="100" step="0.01" value="${esc(cap.prima_dominical?.pct??25)}" aria-label="Porcentaje de prima dominical">`:''}
   <p class="fhint">El sistema decide qué horas son dobles o triples con todas las capturas de la semana del mismo patrón. Los límites de programación generan avisos; nunca quitan horas trabajadas.</p>`;
 }
 function vista(q,isr){
  const e=q.evento,r=(a,b)=>`<div class="kv"><b>${a}</b><span>${b}</span></div>`,d=e.tipo!=='HORAS_EXTRA';
  return `<div class="sect">Vista previa · ${esc(TIPOS[e.tipo])}</div>
   ${r('Fecha trabajada',`${esc(e.fecha)} · semana de servicios desde ${esc(e.semana_servicio)}`)}
   ${r('Periodo de aplicación',`S${q.destino.semana} (${esc(q.destino.desde)} – ${esc(q.destino.hasta)}) · pago ${esc(q.fecha_pago)}${q.retroactivo?' · ajuste por periodo anterior S'+q.origen.semana:''}`)}
   ${r('Jornada y base',`${esc(e.jornada)} ${e.horas_jornada} h · base $${money(e.salario_base)}/día (SD registrado $${money(e.sd_registrado)}) · valor hora $${money(e.valor_hora)}`)}
   ${d?r('Descanso laborado',`Ordinario del día ${e.ordinario_incluido?'ya incluido':'no incluido'} $${money(e.salario_base)} · adicional doble $${money(e.descanso_adicional)}${Number(e.ordinario_adicional)?` · ordinario que se agrega $${money(e.ordinario_adicional)}`:''} · total del día $${money(Number(e.salario_base)+Number(e.descanso_adicional))}`)
    :r('Horas',`${hm(e.minutos)} · dobles ${hm(e.minutos_dobles)} $${money(e.importe_dobles)} · triples ${hm(e.minutos_triples)} $${money(e.importe_triples)} · elegibles para exención ${hm(e.minutos_elegibles)}`)}
   ${Number(e.prima_dominical)?r('Prima dominical',`${e.prima_pct}% $${money(e.prima_dominical)} · exenta $${money(e.exento_prima)} (hasta 1 UMA)`):''}
   ${r('Bruto adicional',`<b>$${money(e.bruto)}</b>`)}
   ${r('Exento / gravado',`$${money(e.exento)} / $${money(e.gravado)} · LISR ${esc(e.fraccion)}${e.tope_semanal!=null?' · tope semanal 5 UMA $'+money(e.tope_semanal):''} · UMA $${money(e.uma)} (fecha de pago)`)}
   ${r('Efecto en ISR',isr.ok?`$${money(isr.isr)} (motor ${esc(isr.metodo)}: con $${money(isr.isr_con)} − sin $${money(isr.isr_sin)}${isr.efecto_subsidio?' · subsidio reducido $'+money(isr.efecto_subsidio):''}) · estimado sobre su ordinario; la prenómina lo determina con todo el periodo`:esc(isr.motivo))}
   ${r('Neto adicional estimado',isr.ok?`<b>$${money(Number(e.bruto)-isr.isr)}</b>`:'Se determina en la prenómina')}
   ${r('SBC variable',`$${money(e.sbc_variable)} · se integra por el procedimiento bimestral vigente (LSS 30); el SDI no se modifica aquí`)}
   ${r('Semana acumulada',`bruto $${money(q.totales.bruto)} · exento $${money(q.totales.exento)} · ${hm(q.totales.minutos_dobles)} dobles · ${hm(q.totales.minutos_triples)} triples`)}
   ${q.redistribucion.length?`<div class="cal-aviso">Esta captura recalcula ${q.redistribucion.length} captura(s) abierta(s) de la misma semana: ${q.redistribucion.map(x=>`${esc(x.fecha)} $${money(x.antes.bruto)} → $${money(x.despues.bruto)}`).join(' · ')}</div>`:''}
   ${e.avisos.map(a=>`<div class="cal-aviso">${esc(a.texto)}</div>`).join('')}
   ${e.avisos.length?'<label><input type="checkbox" id="jx-ok-avisos"> Confirmo las advertencias (el trabajo realizado se paga completo)</label>':''}
   ${q.retroactivo?'<label><input type="checkbox" id="jx-ok-retro"> Aplicar como ajuste por periodo anterior en la nómina abierta, conservando el origen</label>':''}
   ${q.conflictos.length?`<div class="cal-aviso cal-rojo">${q.conflictos.map(c=>esc(c.texto)).join('<br>')}</div><label><input type="checkbox" id="jx-ok-conf"> Resolver la contradicción sin borrar la otra captura</label><textarea id="jx-motivo-conf" maxlength="300" placeholder="Explica por qué se paga el trabajo (mínimo 10 caracteres)"></textarea>`:''}`;
 }
 function isrEstimado(w,q){
  try{
   if(typeof jornadaIsrDe!=='function')throw Error('Motor no disponible');
   const ctx=jornadaIsrDe({w,aguinaldo:null},'S'+q.destino.semana),x=J().efectoIsr(Number(q.evento.gravado),ctx.isr);
   return {ok:true,metodo:ctx.metodo,...x};
  }catch(e){return {ok:false,motivo:'ISR: se calculará en la prenómina ('+e.message+')'};}
 }
 async function abrir(o){
  if(!puedeEditarTrabajador()){toast('Tu usuario sólo puede consultar.','err');return;}
  const {w,fecha,tipo}=o,e=o.editar||null;
  modal2(`<div class="m-head"><h2>${esc(fullName(w))} · ${esc(fecha)} · ${esc(TIPOS[tipo])}</h2><button class="x" onclick="closeModal2()">×</button></div><div class="m-body"><div id="jx-form">Consultando contexto…</div><div id="jx-error" role="alert" style="color:var(--red)"></div><div id="jx-previa" aria-live="polite"></div></div><div class="m-foot"><button class="btn" onclick="closeModal2()">Cerrar</button><button class="btn dark" id="jx-revisar" disabled>Calcular vista previa</button><button class="btn dark" id="jx-guardar" disabled>Confirmar y aplicar</button></div>`,'lg');
  const token=crypto.randomUUID();$j('form').dataset.captura=token;const vigente=()=>$j('form')?.dataset.captura===token;
  let ctx,propuesta=null,revision=0;
  try{ctx=await rpc('CONTEXTO',{trabajador_id:w.id,fecha});}catch(err){if(vigente()){$j('form').textContent='';$j('error').textContent=err.message;}return;}
  if(!vigente())return;
  $j('form').innerHTML=formulario(tipo,ctx,fecha,e);$j('revisar').disabled=false;
  const invalidar=()=>{revision++;propuesta=null;$j('guardar').disabled=true;$j('previa').innerHTML='';};
  $j('form').addEventListener('input',invalidar);$j('form').addEventListener('change',ev=>{
   invalidar();
   if(ev.target.id==='jx-jornada')$j('pactada').hidden=ev.target.value!=='PACTADA';
   if(ev.target.id==='jx-base-doc')$j('base').hidden=!ev.target.checked;
   if(ev.target.id==='jx-modo'){$j('intervalos').hidden=ev.target.value!=='INTERVALOS';$j('horas-box').hidden=ev.target.value==='INTERVALOS';}
  });
  $j('form').addEventListener('click',ev=>{if(ev.target.id==='jx-agregar'){invalidar();ev.target.insertAdjacentHTML('beforebegin',`<div data-jx-intervalo style="display:flex;gap:6px;align-items:center;margin:4px 0"><input type="time" data-i="inicio" aria-label="Inicio"> a <input type="time" data-i="fin" aria-label="Término"> <input type="number" data-i="descanso" min="0" step="5" value="0" style="width:80px" aria-label="Descanso no laborado (min)"> min sin pago</div>`);}});
  $j('previa').addEventListener('change',ev=>{if(ev.target.type==='checkbox')$j('guardar').disabled=!propuesta;});
  $j('revisar').onclick=async()=>{
   const rev=++revision;$j('error').textContent='';$j('revisar').disabled=true;$j('previa').textContent='Calculando…';
   try{
    const j={trabajador_id:w.id,fecha,tipo,clave_idempotencia:crypto.randomUUID(),captura:capturaDe(tipo,ctx)};
    if(e){j.editar_id=e.id;j.version=e.version;}
    const q=await rpc('PREVIA',j);if(!vigente()||rev!==revision)return;
    propuesta={j,q};$j('previa').innerHTML=vista(q,isrEstimado(w,q));$j('guardar').disabled=false;
   }catch(err){if(vigente()&&rev===revision){propuesta=null;$j('previa').textContent='';$j('error').textContent=err.message;}}
   finally{if(vigente())$j('revisar').disabled=false;}
  };
  $j('guardar').onclick=async()=>{
   if(guardando||!propuesta||!vigente())return;
   const {j,q}=propuesta,rev=revision;
   const datos={...j,firma:q.firma,confirmar_avisos:!!$j('ok-avisos')?.checked,confirmar_retroactivo:!!$j('ok-retro')?.checked,resolver_conflictos:!!$j('ok-conf')?.checked,motivo_conflicto:$j('motivo-conf')?.value||''};
   if(q.evento.avisos.length&&!datos.confirmar_avisos){$j('error').textContent='Confirma las advertencias antes de aplicar.';return;}
   if(q.retroactivo&&!datos.confirmar_retroactivo){$j('error').textContent='Confirma el ajuste por periodo anterior.';return;}
   if(q.conflictos.length&&(!datos.resolver_conflictos||datos.motivo_conflicto.trim().length<10)){$j('error').textContent='Resuelve la contradicción del día con un motivo.';return;}
   guardando=true;$j('guardar').disabled=true;$j('revisar').disabled=true;$j('guardar').textContent='Aplicando…';
   try{
    const r=await rpc('CONFIRMAR',datos);
    if(!vigente())return;
    closeModal2();toast(`${TIPOS[tipo]} aplicada en S${r.semana_aplicacion}${r.redistribuidas?' · '+r.redistribuidas+' captura(s) recalculadas':''}${r.repetido?' · ya estaba registrada':''}`);
    await o.alGuardar?.();
   }catch(err){if(vigente()){$j('error').textContent=err.message;if(rev===revision&&/vista previa cambió/i.test(err.message)){propuesta=null;$j('previa').innerHTML='';}}}
   finally{guardando=false;if(vigente()){$j('guardar').textContent='Confirmar y aplicar';$j('guardar').disabled=!propuesta;$j('revisar').disabled=false;}}
  };
 }
 window.PLATINUM_JORNADA_UI=Object.freeze({TIPOS,cargar,celda,lista,accion,abrir,_pruebas:{capturaDe,vista,formulario}});
})();
