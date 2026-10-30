/* ---------- CONTROL INTERNO SALARIAL (2026-08-27) ---------------------
   Sueldo registrado ante el IMSS vs sueldo real. Solo VIP, y la tabla
   sueldos_internos tiene su propia política RLS: quien no es VIP no
   recibe las filas aunque pida la tabla directo a la API. */
async function openSueldoInterno(id){
  if(!esVip()){toast('Solo los usuarios con acceso total pueden ver el control interno salarial.','err');return;}
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const si=sueldoInternoDe(id)||{};
  modal2(`
    <div class="m-head"><h2>🔒 Control interno salarial</h2><button class="x" onclick="closeModal2()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px"><b>${esc(fullName(w))}</b> · #${w.no_trab??'—'}<br>
      Referencia interna del sueldo pactado. Alimenta las sugerencias de diferencial y, cuando corresponda, la previsión base del ajuste quincenal confirmado. Guardarlo no sustituye el salario de la ficha ni sus tablas fiscales.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Sueldo registrado (IMSS)</label><input id="si-imss" type="number" step="0.01" min="0" value="${si.sueldo_imss!=null?si.sueldo_imss:''}" placeholder="0.00"></div>
        <div><label>Sueldo real</label><input id="si-real" type="number" step="0.01" min="0" value="${si.sueldo_real!=null?si.sueldo_real:''}" placeholder="0.00"></div>
      </div>
      <div class="fld" style="margin-top:10px"><label>Notas (opcional)</label><input id="si-notas" value="${esc(si.notas||'')}" placeholder="Motivo o referencia"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal2()">Cancelar</button>
      ${(si.sueldo_imss!=null||si.sueldo_real!=null)?`<button class="btn danger" onclick="siBorrar('${id}')">Quitar registro</button>`:''}
      <button class="btn dark" onclick="siGuardar('${id}')">Guardar</button>
    </div>`,'sm');
}
async function siGuardar(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const num=v=>{const s=String(v||'').trim(); if(!s)return null; const n=Number(s); return isNaN(n)?null:Math.round(n*100)/100;};
  const fila={trabajador_id:id,obra_id:w.obra_id,sueldo_imss:num($('si-imss').value),
    sueldo_real:num($('si-real').value),notas:$('si-notas').value.trim()||null,
    actualizado_por:USER.email,updated_at:new Date().toISOString()};
  const {error}=await sb.from('sueldos_internos').upsert(fila,{onConflict:'trabajador_id'});
  if(error){toast('No se pudo guardar: '+error.message,'err');return;}
  const {data}=await fetchAllRows(()=>sb.from('sueldos_internos').select('*').eq('obra_id',OBRA.id));
  SUELDOSINT=data||[];
  closeModal2(); openDetail(id);
  toast('Control interno salarial guardado.','ok');
}
async function siBorrar(id){
  if(!confirm('¿Quitar el control interno salarial de este trabajador?'))return;
  const {error}=await sb.from('sueldos_internos').delete().eq('trabajador_id',id);
  if(error){toast('No se pudo quitar: '+error.message,'err');return;}
  SUELDOSINT=(SUELDOSINT||[]).filter(x=>x.trabajador_id!==id);
  closeModal2(); openDetail(id);
  toast('Registro quitado.','ok');
}
/* ---------- DIFERENCIALES DE PROYECCIÓN (2026-08-27) ------------------
   Monto extra por trabajador para UNA semana. Opcional: si nadie captura
   nada, la proyección sale exactamente como antes. No toca el sueldo del
   tabulador ni el cálculo de impuestos — solo se suma al presentar. */
/* DIFERENCIAL SUGERIDO (2026-09-02) ------------------------------------
   Sale del control interno salarial: sueldo real − sueldo registrado ante
   el IMSS. Es lo que de hecho se le completa por fuera, así que sirve
   como valor de arranque para no capturarlo a mano uno por uno.

   DOS CUIDADOS:
   · LA UNIDAD. La proyección usa el sueldo completo del periodo DEL
     TRABAJADOR. El diferencial debe conservar la misma unidad: semanal
     para un semanal y quincenal para un quincenal. La semana es una clave
     de selección; no convierte la quincena en siete días.
   · LA PRIVACIDAD. sueldos_internos solo le llega a un VIP (lo decide la
     RLS de la base, no la app). A quien no lo es, SUELDOSINT viene vacío
     y esto devuelve null: el modal se comporta igual que antes y la cifra
     no se asoma por ningún lado.
   La misma fórmula está en diferencial_sugerido() del Script 64, para que
   la app y la base no den números distintos. */
function difSugerido(w){
  if(!w||!esVip())return null;
  const si=sueldoInternoDe(w.id);
  if(!si||si.sueldo_real==null||si.sueldo_imss==null)return null;
  const dif=Number(si.sueldo_real)-Number(si.sueldo_imss);
  if(!(dif>0))return null;                       // sin diferencia, nada que sugerir
  return Math.round(dif*100)/100;
}
function openDiferenciales(){
  const sem=normSem($('py-sem')?$('py-sem').value:semObra())||String(semObra());
  const d1=$('py-d1')?$('py-d1').value:'', d2=$('py-d2')?$('py-d2').value:'';
  const per=$('py-periodo')?$('py-periodo').value:'TODOS';
  const {act,fins}=pyCandidatos(d1,d2,per);
  const gente=[...act,...fins].sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
  if(!gente.length){toast('No hay trabajadores en esa semana.','err');return;}
  /* `tocado` guarda a quién le movió el usuario el campo. Lo capturado a
     mano SIEMPRE gana sobre lo sugerido — incluso si lo dejó vacío. */
  window._DF={sem,gente,tocado:{}};
  const nSug=gente.filter(w=>!difDe(w.id,sem)&&difSugerido(w)).length;
  modal2(`
    <div class="m-head"><h2>➕ Diferenciales · Semana ${esc(sem)}</h2><button class="x" onclick="closeModal2()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:10px">Monto <b>extra</b> que se le suma a un trabajador <b>solo en esta semana</b>. Déjalo vacío o en cero para quitarlo. No modifica su sueldo del tabulador ni el cálculo de impuestos: únicamente se suma al monto de la proyección.</p>
      ${nSug?`<div class="fhint" style="background:var(--blue-bg);border-radius:8px;padding:8px 12px;margin-bottom:10px;color:var(--txt)">
        🔒 <b>${nSug} se llenaron solos</b> con la diferencia del control interno (sueldo real − sueldo IMSS). Están marcados con <b style="color:var(--accent)">auto</b>. Puedes corregir o borrar cualquiera: lo que escribas manda.
        <button class="btn" style="padding:2px 10px;font-size:11px;margin-left:8px" onclick="dfRecalcular()">↻ Volver a calcular todos</button>
      </div>`:''}
      <input id="df-q" placeholder="Buscar por nombre o número..." oninput="dfPinta()" autocomplete="off" style="margin-bottom:10px">
      <div id="df-out" style="max-height:46vh;overflow:auto"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal2()">Cancelar</button>
      <span id="df-res" style="margin-right:auto;font-size:12px;color:var(--mut);align-self:center"></span>
      <button class="btn dark" id="df-btn" onclick="dfGuardar()">Guardar diferenciales</button>
    </div>`,'md');
  dfPinta();
}
/* Qué valor le toca al campo de un trabajador, por orden de prioridad:
     1) lo que el usuario haya tecleado (aunque lo haya dejado vacío)
     2) lo que ya estaba guardado en la base para esa semana
     3) el sugerido por el control interno
     4) vacío */
function dfValor(w){
  const st=window._DF;
  const e=$('df-m-'+w.id);
  if(e)return e.value;                                  // se está repintando: se conserva
  if(st.tocado[w.id]!==undefined)return st.tocado[w.id];
  const ya=difDe(w.id,st.sem);
  if(ya)return String(ya);
  const sug=difSugerido(w);
  return sug?String(sug):'';
}
function dfMarcaTocado(id){
  const st=window._DF; if(!st)return;
  const e=$('df-m-'+id);
  st.tocado[id]=e?e.value:'';
  const tag=$('df-a-'+id); if(tag)tag.style.display='none';   // ya no es automático
  dfResumen();
}
/* Vuelve a poner el sugerido en TODOS, incluso donde el usuario ya había
   escrito. Es explícito: solo pasa si le dan al botón. */
function dfRecalcular(){
  const st=window._DF; if(!st)return;
  let n=0;
  st.gente.forEach(w=>{
    const sug=difSugerido(w); if(!sug)return;
    st.tocado[w.id]=undefined; delete st.tocado[w.id];
    const e=$('df-m-'+w.id); if(e)e.value=String(sug);
    n++;
  });
  dfPinta();
  toast(n?`${n} diferencial(es) recalculados desde el control interno.`:'No hay control interno capturado para calcular.',n?'ok':'err');
}
function dfPinta(){
  const st=window._DF; if(!st)return;
  const q=String(($('df-q')&&$('df-q').value)||'').toUpperCase().trim();
  const vis=st.gente.filter(w=>!q||fullName(w).toUpperCase().includes(q)||String(w.no_trab||'').includes(q));
  const cur={}; st.gente.forEach(w=>{const e=$('df-m-'+w.id); if(e)cur[w.id]=e.value;});
  const valor=w=>cur[w.id]!==undefined?cur[w.id]:dfValor(w);
  $('df-out').innerHTML = vis.length
    ? `<div class="imp-row head" style="grid-template-columns:52px 1.7fr 1fr 1fr"><span>No.</span><span>Trabajador</span><span>Sueldo del periodo</span><span>Diferencial</span></div>`+
      vis.map(w=>{
        const v=valor(w), sug=difSugerido(w);
        // "auto" solo si el valor que se muestra ES el sugerido y nadie lo tocó
        const esAuto=!!sug&&!difDe(w.id,st.sem)&&st.tocado[w.id]===undefined&&String(v)===String(sug);
        return `<div class="imp-row" style="grid-template-columns:52px 1.7fr 1fr 1fr">
        <span>${w.no_trab??'—'}</span>
        <span><b>${esc(fullName(w))}</b>${w.estatus==='BAJA'?' <span class="badge BAJA" style="font-size:9.5px">BAJA</span>':''}</span>
        <span>$${money(w.estatus==='BAJA'?(w.monto_finiquito||0):(w.sal_semanal||0))}</span>
        <span style="display:flex;align-items:center;gap:6px">
          <input type="number" step="0.01" min="0" id="df-m-${w.id}" value="${esc(String(v))}"
              placeholder="0.00" oninput="dfMarcaTocado('${w.id}')" style="padding:4px 8px;font-size:12.5px">
          <span id="df-a-${w.id}" title="Calculado del control interno: sueldo real − sueldo IMSS del mismo periodo de pago"
            style="display:${esAuto?'inline':'none'};font-size:10px;font-weight:700;color:var(--accent)">auto</span>
        </span>
      </div>`;}).join('')
    : '<div class="empty">Nadie coincide con esa búsqueda.</div>';
  dfResumen();
}
function dfResumen(){
  const st=window._DF; if(!st||!$('df-res'))return;
  let n=0,t=0,auto=0;
  st.gente.forEach(w=>{
    const e=$('df-m-'+w.id);
    const m=e?Number(e.value)||0:Number(dfValor(w))||0;
    if(m>0){n++;t+=m;}
    const tag=$('df-a-'+w.id);
    if(tag&&tag.style.display!=='none')auto++;
  });
  $('df-res').textContent=n?`${n} con diferencial · suman $${money(t)}${auto?` · ${auto} automático(s)`:''}`
                           :'Sin diferenciales capturados';
}
async function dfGuardar(){
  const st=window._DF; if(!st)return;
  const btn=$('df-btn'); btn.innerHTML='<span class="spin"></span> Guardando...';
  const alta=[], baja=[];
  /* Se recorre a TODA la gente, no solo a la visible: si alguien busca por
     nombre antes de guardar, lo que ya estaba capturado —o sugerido— de los
     demás no se puede perder. Es lo mismo que muestra el resumen de abajo,
     así que lo que ves es lo que se guarda. */
  st.gente.forEach(w=>{
    const m=Math.round((Number(dfValor(w))||0)*100)/100;
    const ya=difDe(w.id,st.sem);
    if(m>0)      alta.push({obra_id:OBRA.id,trabajador_id:w.id,semana:Number(st.sem),monto:m,activo:true,creado_por:USER.email});
    else if(ya>0)baja.push(w.id);                          // se capturó vacío o cero: se quita
  });
  let err=0;
  if(alta.length){
    /* onConflict tiene que empatar EXACTAMENTE con la restricción única de
       la tabla (Script 64). Ojo: un índice único PARCIAL no sirve para esto
       —Postgres no lo puede inferir—, y eso era justo lo que fallaba. */
    let {error}=await sb.from('diferenciales')
      .upsert(alta,{onConflict:'trabajador_id,semana'});
    if(error&&/on conflict|unique or exclusion/i.test(error.message||'')){
      /* Sin el Script 64 corrido, el upsert no tiene de dónde agarrarse.
         Se guarda igual borrando y volviendo a insertar, para no dejar a
         nadie trabado, pero se avisa qué falta. */
      const ids=alta.map(a=>a.trabajador_id);
      const {error:e1}=await sb.from('diferenciales').delete()
        .eq('semana',Number(st.sem)).in('trabajador_id',ids);
      const {error:e2}=e1?{error:e1}:await sb.from('diferenciales').insert(alta);
      error=e2||null;
      if(!error)toast('Guardado. Corre el Script 64 en Supabase para que el guardado sea directo.','err');
    }
    if(error){err++;toast('No se pudieron guardar: '+error.message,'err');}
  }
  if(baja.length){
    const {error}=await sb.from('diferenciales').delete()
      .eq('semana',Number(st.sem)).in('trabajador_id',baja);
    if(error)err++;
  }
  const {data}=await fetchAllRows(()=>sb.from('diferenciales').select('*').eq('obra_id',OBRA.id).eq('activo',true));
  DIFS=data||[];
  btn.innerHTML='Guardar diferenciales';
  if(err)return;
  closeModal2();
  // si la proyección ya no está abierta, refrescarla no debe tumbar el aviso
  try{ if(typeof pyPreview==='function'&&$('py-prev'))pyPreview(); }catch(e){}
  toast(`Diferenciales de la semana ${st.sem}: ${alta.length} guardado(s)${baja.length?`, ${baja.length} quitado(s)`:''}.`,'ok');
}
async function exportProyeccion(eleccion){
  if(window._PROY_EXPORTANDO)return;
  window._PROY_EXPORTANDO=true;
  const semN=$('py-sem').value||semObra(),sem='S'+semN,d1=$('py-d1').value,d2=$('py-d2').value,periodo=$('py-periodo').value;
  const destino=eleccion==='AMBAS'?'AMBAS':$('py-destino')?.value||'DISPERSION',obra=OBRA;
  for(const id of ['py-btn','py-ambas'])if($(id))$(id).disabled=true;
  try{
    if(!d1||!d2||d1>d2)throw Error('Revisa las fechas de la proyección.');
    if(!await pyDatosFrescos())return;
    if(OBRA.id!==obra.id)throw Error('Cambió la obra. Abre nuevamente la proyección.');
    let {act,fins}=pyCandidatos(d1,d2,periodo);
    const versiones=window.PLATINUM_FLOWS?await window.PLATINUM_FLOWS.obtenerVersiones([obra.id],sem):null;
    if(versiones)({act,fins}=window.PLATINUM_FLOWS.filtrarAbiertos(act,fins,versiones));
    const fuentes={DESC,DIFS,FINTRANS};
    const audits=await proyLeerFiniquitos(fins);
    if(OBRA.id!==obra.id)throw Error('Cambió la obra. Abre nuevamente la proyección.');
    const actual={DESC,DIFS,FINTRANS};let m;
    try{DESC=fuentes.DESC;DIFS=fuentes.DIFS;FINTRANS=fuentes.FINTRANS;m=proyModelo(act,fins,sem,audits);}
    finally{DESC=actual.DESC;DIFS=actual.DIFS;FINTRANS=actual.FINTRANS;}
    if(m.filas.some(f=>!f.fin&&f.w.periodo_pago==='QUINCENAL'))m=await isrQAplicarModelo(m);
    if(window.__PLATINUM_REQUIERE_FLUJO&&!window.PLATINUM_FLOWS)throw Error('El módulo de coordinación no cargó. Recarga la plataforma.');
    if(window.PLATINUM_FLOWS)m=await window.PLATINUM_FLOWS.versionarModelo(m,{obras:[obra.id],sem,periodo,desde:d1,hasta:d2,versiones});
    if(!m.filas.length)throw Error('No hay trabajadores en el periodo seleccionado.');
    const codigo=empresaDeObra(obra);
    const emp=CFGEMP['empresa_'+codigo]||{razon:EMPRESAS[codigo].nombre,rfc:''};
    const destinos=destino==='AMBAS'?['CONTRATISTA','DISPERSION']:[destino];
    const meta={codigo,colB:'CONTRATISTA',
      titulo:`PROYECCIÓN DE NÓMINA · SEMANA ${semN} · ${rangoTexto(d1,d2)}${periodo==='QUINCENAL'?' (QUINCENAL)':''}`,
      sub:`${emp.razon||''}${emp.rfc?' · RFC: '+emp.rfc:''} · ${obra.nombre}`,
      pie:`Semana ${semN} · ${fmtD(d1)} – ${fmtD(d2)} · ${new Date().toLocaleDateString('es-MX')}`};
    const libros=destinos.map(d=>({destino:d,wb:proyLibro(m,d,meta)}));
    await registrarBitacoraNomina(proyAuditoria(m,destinos),{silencioso:false});
    for(const x of libros)await dl(x.wb,`PROYECCION_${x.destino}_${codigo}_SEMANA${semN}${periodo==='QUINCENAL'?'_QUINCENAL':''}.xlsx`);
    closeModal();toast(`${libros.length} archivo(s) de S${semN} generado(s), con detalle de retenciones.`,'ok');
  }catch(e){toast('No se generó la proyección: '+e.message,'err');}
  finally{window._PROY_EXPORTANDO=false;if($('py-prev')&&globalThis._PY_FRESCOS!==false)pyPreview();}
}
/* Contratistas de una sola razón social, con filtro de obra opcional. */
async function pcDatosFrescos(codigo){
  const ids=obrasEmpresa(codigo).map(o=>o.id);
  if(!ids.length)throw Error('Esta empresa no tiene centros de trabajo disponibles.');
  const rs=await Promise.all([
    fetchAllRows(()=>sb.from('trabajadores').select('*').in('obra_id',ids).eq('eliminado',false)),
    fetchAllRows(()=>sb.from('descuentos').select('*').in('obra_id',ids)),
    fetchAllRows(()=>sb.from('diferenciales').select('*').in('obra_id',ids).eq('activo',true)),
    fetchAllRows(()=>sb.from('control_altas_bajas_cortas').select('obra_id,trabajador_id,anio,semana,estado_servicio').in('obra_id',ids)),
    fetchAllRows(()=>sb.from('control_finiquitos_transferencia').select('*').in('obra_id',ids))
  ]);
  const error=rs.find(r=>r.error||!Array.isArray(r.data));if(error)throw Error('No se pudieron actualizar los datos: '+(error.error?.message||'respuesta incompleta'));
  if(codigo!==EMPRESA_ACTIVA)throw Error('Cambió la empresa. Abre nuevamente la proyección.');
  const historicos=await proyCargarHistoricos(rs[0].data||[]);
  if(codigo!==EMPRESA_ACTIVA)throw Error('Cambió la empresa. Abre nuevamente la proyección.');
  return {all:rs[0].data||[],desc:rs[1].data||[],difs:rs[2].data||[],altas:rs[3].data||[],fintrans:rs[4].data||[],historicos};
}
async function openProyContratista(){
  const [d1,d2]=weekBounds(),codigo=EMPRESA_ACTIVA;
  try{
    const datos=await pcDatosFrescos(codigo);
    window._PCEMP=codigo;window._PC=datos.all;
    const cts=[...new Set(datos.all.filter(w=>String(w.contratista||'').trim()).map(w=>String(w.contratista).trim()).concat(CONTRATISTAS.map(x=>x.nombre).filter(Boolean)))].sort();
    window._PCCT=cts;
    modal(`
      <div class="m-head"><h2>Proyección por contratista · ${esc(EMPRESAS[codigo].corto)}</h2><button class="x" onclick="closeModal()">×</button></div>
      <div class="m-body">
        <p class="fhint">Un libro por contratista y por destino seleccionado. Nunca mezcla razones sociales.</p>
        <div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr">
          <div><label>No. de semana</label><input id="pc-sem" type="number" value="${isoWeek()}" oninput="semSincroniza('pc-sem','pc-d1','pc-d2')"></div>
          <div><label>Del día</label><input id="pc-d1" type="date" value="${d1}"></div>
          <div><label>Al día</label><input id="pc-d2" type="date" value="${d2}"></div>
          <div><label>Periodo</label><select id="pc-periodo"><option value="SEMANAL">Solo semanales</option><option value="QUINCENAL">Solo quincenales</option><option value="TODOS">Todos</option></select></div>
        </div>
        <div style="margin-top:12px"><label>Centro de trabajo</label><select id="pc-obra">
          <option value="">Todos los centros de esta empresa</option>
          ${obrasEmpresa(codigo).map(o=>`<option value="${o.id}" ${OBRA?.id===o.id?'selected':''}>${esc(o.nombre)}</option>`).join('')}
        </select></div>
        ${proySelector('pc-destino')}
        <div class="sect" style="margin-top:14px">Contratistas — selecciona los que necesites</div>
        ${cts.map((c,i)=>`<label style="display:inline-block;min-width:220px;padding:5px 6px"><input type="checkbox" id="pc-ct-${i}" checked> ${esc(c)}</label>`).join('')}
      </div>
      <div class="m-foot">
        <button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn dark" id="pc-btn" onclick="exportProyContratista()">Generar seleccionada</button>
        <button class="btn" id="pc-ambas" onclick="exportProyContratista('AMBAS')">Generar ambas</button>
      </div>`,'lg');
  }catch(e){toast(e.message,'err');}
}
async function exportProyContratista(eleccion){
  if(window._PROY_EXPORTANDO)return;
  const cts=(window._PCCT||[]).filter((c,i)=>$('pc-ct-'+i)?.checked);
  if(!cts.length){toast('Selecciona al menos un contratista.','err');return;}
  const codigo=window._PCEMP;
  if(!codigo||codigo!==EMPRESA_ACTIVA){toast('Abre nuevamente la proyección de esta empresa.','err');return;}
  const semN=$('pc-sem').value||isoWeek(),sem='S'+semN,d1=$('pc-d1').value,d2=$('pc-d2').value,periodo=$('pc-periodo').value,oid=$('pc-obra').value;
  const destino=eleccion==='AMBAS'?'AMBAS':$('pc-destino').value;
  const destinos=destino==='AMBAS'?['CONTRATISTA','DISPERSION']:[destino];let previo=null;
  window._PROY_EXPORTANDO=true;for(const id of ['pc-btn','pc-ambas'])if($(id))$(id).disabled=true;
  try{
    if(!d1||!d2||d1>d2)throw Error('Revisa las fechas de la proyección.');
    const datos=await pcDatosFrescos(codigo),all=datos.all.filter(w=>!oid||w.obra_id===oid);
    const candidatos=cts.map(ct=>{
      const personal=all.filter(w=>String(w.contratista||'').trim()===ct&&!asSinServicioSemana(d1,OBRAS.find(o=>o.id===w.obra_id),datos.altas).has(w.id));
      let act=personal.filter(w=>asVigenteSemana(w,d1,d2)&&(w.estatus==='ACTIVO'||(w.estatus==='BAJA'&&w.fecha_baja>d2)));
      if(periodo!=='TODOS')act=act.filter(w=>(w.periodo_pago||'SEMANAL')===periodo);
      const fins=proyFiniquitosSemana(personal,d1,d2,datos.historicos);
      return {ct,act,fins};
    });
    if(!candidatos.length)throw Error('No hay personal para esos contratistas y fechas.');
    const versiones=window.PLATINUM_FLOWS?await window.PLATINUM_FLOWS.obtenerVersiones(oid?[oid]:obrasEmpresa(codigo).map(o=>o.id),sem):null;
    if(versiones)candidatos.forEach(c=>Object.assign(c,window.PLATINUM_FLOWS.filtrarAbiertos(c.act,c.fins,versiones)));
    const audits=await proyLeerFiniquitos(candidatos.flatMap(c=>c.fins));
    if(codigo!==EMPRESA_ACTIVA)throw Error('Cambió la empresa. Abre nuevamente la proyección.');
    previo={DESC,DIFS,FINTRANS};DESC=datos.desc;DIFS=datos.difs;FINTRANS=datos.fintrans;
    const emp=CFGEMP['empresa_'+codigo]||{razon:EMPRESAS[codigo].nombre,rfc:''},libros=[],registros=[];
    const modelos=candidatos.map(c=>({...c,modelo:proyModelo(c.act,c.fins,sem,audits)}));
    DESC=previo.DESC;DIFS=previo.DIFS;FINTRANS=previo.FINTRANS;previo=null;
    // Primero validar y construir TODOS; un desglose incompleto no deja un lote parcial.
    for(const c of modelos){
      let m=c.modelo;
      if(m.filas.some(f=>!f.fin&&f.w.periodo_pago==='QUINCENAL'))m=await isrQAplicarModelo(m);
      if(window.__PLATINUM_REQUIERE_FLUJO&&!window.PLATINUM_FLOWS)throw Error('El módulo de coordinación no cargó. Recarga la plataforma.');
      if(window.PLATINUM_FLOWS)m=await window.PLATINUM_FLOWS.versionarModelo(m,{obras:oid?[oid]:obrasEmpresa(codigo).map(o=>o.id),sem,periodo,contratista:c.ct,desde:d1,hasta:d2,versiones});
      if(!m.filas.length)continue;
      const meta={codigo,colB:'OBRA',titulo:`PROYECCIÓN DE NÓMINA · ${c.ct} · SEMANA ${semN} · ${rangoTexto(d1,d2)}`,
        sub:`${emp.razon||''}${emp.rfc?' · RFC: '+emp.rfc:''} · ${oid?(OBRAS.find(o=>o.id===oid)?.nombre||''):'TODOS LOS CENTROS'} · ${c.ct}`,
        pie:`Semana ${semN} · ${fmtD(d1)} – ${fmtD(d2)} · ${c.ct} · ${new Date().toLocaleDateString('es-MX')}`};
      for(const d of destinos)libros.push({wb:proyLibro(m,d,meta),nombre:`PROYECCION_${d}_${codigo}_${c.ct.replace(/[^A-ZÑ0-9]+/gi,'_')}_SEMANA${semN}${periodo==='QUINCENAL'?'_QUINCENAL':''}.xlsx`});
      registros.push(...proyAuditoria(m,destinos));
    }
    if(!libros.length)throw Error('No hay personal para esos contratistas y fechas.');
    // Restaurar ANTES de las operaciones asíncronas de auditoría/descarga.
    await registrarBitacoraNomina(registros,{silencioso:false});
    for(const x of libros)await dl(x.wb,x.nombre);
    closeModal();toast(`${libros.length} archivo(s) generado(s) con detalle de retenciones.`,'ok');
  }catch(e){toast('No se generó la proyección: '+e.message,'err');}
  finally{if(previo){DESC=previo.DESC;DIFS=previo.DIFS;FINTRANS=previo.FINTRANS;}window._PROY_EXPORTANDO=false;for(const id of ['pc-btn','pc-ambas'])if($(id))$(id).disabled=false;}
}
