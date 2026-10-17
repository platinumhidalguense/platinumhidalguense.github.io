/* ============================================================
   CONTROL DE PAPELES — expedientes pendientes (Script 61, 2026-08-28)
   La gente de nuevo ingreso empieza a asistir antes de entregar sus
   documentos. Como todavía no está dada de alta no existe en
   `trabajadores`, así que no salía en ningún control y se acumulaba
   semana tras semana sin que nadie llevara la cuenta.

   El CONTADOR LO LLEVA LA BASE, no esta pantalla: registrar_pendiente()
   solo sube el número si la semana es POSTERIOR a la última registrada.
   Si se hace desde dos computadoras a la vez, o si alguien le da dos
   veces al botón el mismo día, el número no se infla.
   ============================================================ */
let PAPELES=[];
async function cpCargar(){
  if(!OBRA)return;
  const obraId=OBRA.id;
  const b=$('cp-body'); if(b)b.innerHTML='<tr class="loading-row"><td colspan="7">Cargando...</td></tr>';
  const {data,error}=await fetchAllRows(()=>sb.from('control_expedientes_pendientes').select('*').eq('obra_id',obraId));
  if(OBRA?.id!==obraId)return;
  if(error){
    if(b)b.innerHTML=`<tr><td colspan="7"><div class="empty"><div class="big">📂</div>No pude leer el control de papeles.<br><span style="font-size:12.5px">${/relation|does not exist/i.test(error.message||'')?'Falta correr el <b>Script 61</b> en Supabase.':esc(error.message)}</span></div></td></tr>`;
    return;
  }
  PAPELES=data||[];
  if($('cp-sem')&&!$('cp-sem').value)$('cp-sem').value=isoWeek();
  const sug=$('cp-sug');
  if(sug)sug.innerHTML=PAPELES.filter(r=>!r.entregado).map(r=>`<option value="${esc(r.nombre_completo)}">`).join('');
  const pu=$('cp-puestos');
  if(pu)pu.innerHTML=catalogoPuestos().map(p=>`<option value="${esc(p)}">`).join('');
  renderPapeles();
}
/* El estado manda; `entregado` se conserva por compatibilidad con lo que
   se guardó antes del Script 65 y con la app vieja de quien no haya
   recargado todavía. */
function cpEstado(r){
  const e=String(r&&r.estado||'').toUpperCase();
  if(e==='ENTREGADO'||e==='NO_SE_PRESENTO'||e==='PENDIENTE')return e;
  return r&&r.entregado?'ENTREGADO':'PENDIENTE';
}
const CP_BADGE={
  PENDIENTE     :['PENDIENTE','DEBE'],
  ENTREGADO     :['ACTIVO','ENTREGÓ'],
  NO_SE_PRESENTO:['BAJA','NO SE PRESENTÓ']
};
function renderPapeles(){
  const q=(($('cp-q')||{}).value||'').trim().toUpperCase();
  const f=(($('cp-filtro')||{}).value)||'PEND';
  const pend =PAPELES.filter(r=>cpEstado(r)==='PENDIENTE');
  const idos =PAPELES.filter(r=>cpEstado(r)==='NO_SE_PRESENTO');
  const entr =PAPELES.filter(r=>cpEstado(r)==='ENTREGADO');
  const s=$('cp-stats');
  if(s){
    const graves=pend.filter(r=>(r.semanas_adeudadas||0)>=3).length;
    const sem=pend.reduce((a,r)=>a+(Number(r.semanas_adeudadas)||0),0);
    s.innerHTML=`
      <div class="stat a"><div class="n">${pend.length}</div><div class="l">Deben papeles</div></div>
      <div class="stat r"><div class="n">${graves}</div><div class="l">Con 3+ semanas</div></div>
      <div class="stat"><div class="n">${sem}</div><div class="l">Semanas acumuladas</div></div>
      <div class="stat"><div class="n">${idos.length}</div><div class="l">Ya no se presentaron</div></div>
      <div class="stat g"><div class="n">${entr.length}</div><div class="l">Ya entregaron</div></div>`;
  }
  let lista=f==='PEND'?pend
          :f==='ENTREGADOS'?entr
          :f==='IDOS'?idos
          :PAPELES.slice();
  if(q)lista=lista.filter(r=>[r.nombre_completo,r.puesto].join(' ').toUpperCase().includes(q));
  lista.sort((a,b)=>(b.semanas_adeudadas||0)-(a.semanas_adeudadas||0)
    ||String(a.nombre_completo).localeCompare(String(b.nombre_completo),'es'));
  const b=$('cp-body'); if(!b)return;
  if(!lista.length){
    b.innerHTML=`<tr><td colspan="7"><div class="empty"><div class="big">📂</div>${
      f==='ENTREGADOS'?'Todavía nadie de esta lista ha entregado sus papeles.'
      :f==='IDOS'?'Nadie está marcado como que dejó de presentarse.'
      :'Nadie debe papeles ahorita.'}<br><span style="font-size:12.5px">Registra arriba a quien esté asistiendo sin entregar su documentación.</span></div></td></tr>`;
    return;
  }
  const semAct=isoWeek();
  b.innerHTML=lista.map(r=>{
    const n=Number(r.semanas_adeudadas)||0;
    const est=cpEstado(r);
    const col=est!=='PENDIENTE'?'var(--mut)':(n>=3?'var(--red)':(n===2?'var(--amber)':'var(--txt)'));
    const [cls,txt]=CP_BADGE[est];
    /* Si ya se le registró esta semana, el botón se deshabilita: darle no
       haría nada (la base no sube el contador dos veces en la misma
       semana) y dejarlo activo hace creer que sí sirvió. */
    const yaEsta=norm_sem(r.ultima_semana_registrada)===semAct;
    const bot=est==='ENTREGADO'
      ? `<button class="btn" style="padding:2px 9px;font-size:11px" onclick="cpMarcar('${r.id}','PENDIENTE')" title="Regresarlo a la lista de pendientes">↩ Reabrir</button>`
      : `<button class="btn gold" style="padding:2px 8px;font-size:11px"
           onclick="cpSumarSemana('${r.id}')" ${yaEsta?'disabled':''}
           title="${yaEsta?'Ya se le registró la semana '+semAct:'Otra semana sin entregar papeles (semana '+semAct+'), sin volver a escribir el nombre'}">＋1 semana</button>
         <button class="btn dark" style="padding:2px 8px;font-size:11px" onclick="cpMarcar('${r.id}','ENTREGADO')" title="Ya entregó su documentación: sale de la lista">✔ Ya entregó</button>
         ${est==='NO_SE_PRESENTO'
            ? ''
            : `<button class="btn" style="padding:2px 8px;font-size:11px" onclick="cpMarcar('${r.id}','NO_SE_PRESENTO')" title="Dejó de venir sin entregar: congela el contador sin borrar el renglón">🚫 No se presentó</button>`}`;
    const nota=est==='NO_SE_PRESENTO'&&r.semana_no_presentado
      ? `<div style="font-size:11px;color:var(--mut)">dejó de venir en ${esc(r.semana_no_presentado)}</div>`:'';
    return `<tr data-cp="${r.id}" data-estado="${est}">
      <td><b>${esc(r.nombre_completo)}</b>${nota}</td>
      <td>${esc(r.puesto||'—')}</td>
      <td>${esc(r.semana_ingreso||'—')}</td>
      <td>${esc(r.ultima_semana_registrada||'—')}</td>
      <td style="text-align:right;font-weight:800;color:${col}">${n}</td>
      <td><span class="badge ${cls}">${txt}</span></td>
      <td style="white-space:nowrap">${bot}
        <button class="btn danger" style="padding:2px 8px;font-size:11px" onclick="cpQuitar('${r.id}')" title="Quitar de la lista">🗑</button></td>
    </tr>`;
  }).join('');
}
function norm_sem(s){const m=String(s==null?'':s).match(/\d+/);return m?parseInt(m[0],10):null;}

/* ---------- los botones de cada renglón (2026-09-04) -------------------
   Todo esto existe por una sola razón: antes, para subirle el contador a
   alguien había que volver a teclear su nombre completo arriba. Con 30
   pendientes eso es media hora de captura y errores de dedo que abren
   renglones duplicados. Ahora la semana se registra por `id`.

   El contador lo sigue llevando la BASE (sumar_semana_pendiente), no esta
   pantalla: si dos personas le dan al botón el mismo día, o si alguien lo
   presiona dos veces, el número no se infla. */
async function cpSumarSemana(id){
  const r=PAPELES.find(x=>x.id===id); if(!r)return;
  const sem=isoWeek();
  markWrite();
  const {data,error}=await sb.rpc('sumar_semana_pendiente',
    {p_id:id,p_semana:'S'+sem,p_usuario:USER.email});
  if(error){
    toast(/function .*sumar_semana_pendiente/i.test(error.message||'')
      ?'Falta correr el Script 65 en Supabase.':'Error: '+error.message,'err');
    return;
  }
  await cpCargar();
  const fila=data&&data.fila?data.fila:null;
  const n=fila?Number(fila.semanas_adeudadas)||0:0;
  if(!data.subio){
    toast(`${r.nombre_completo}: ya se le había registrado la semana ${fila&&fila.ultima_semana_registrada||'S'+sem}. El contador no se movió.`,'');
    return;
  }
  if(data.reabrio)toast(`${r.nombre_completo} volvió a la lista de pendientes.`,'');
  if(n>=2)cpAlerta(fila,n);
  else toast(`${r.nombre_completo}: ${n} semana sin papeles.`,'ok');
}
function cpAlerta(r,n){
  modal(`
    <div class="m-head" style="background:var(--amber-bg)"><h2>⚠️ ¡CUIDADO!</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="font-size:15px;line-height:1.7">Este trabajador ya lleva <b style="color:var(--red);font-size:20px">${n}</b> semana(s) asistiendo <b>sin entregar documentación</b>.</p>
      <div class="kv"><b>Nombre</b><span><b>${esc(r.nombre_completo)}</b></span></div>
      <div class="kv"><b>Puesto</b><span>${esc(r.puesto||'sin capturar')}</span></div>
      <div class="kv"><b>Ingresó en la semana</b><span><b>${esc(r.semana_ingreso||'—')}</b></span></div>
      <div class="kv"><b>Última vez registrado</b><span>${esc(r.ultima_semana_registrada||'—')}</span></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Entendido</button>
      <button class="btn" onclick="closeModal();cpMarcar('${r.id}','NO_SE_PRESENTO')">🚫 Ya no se presentó</button>
      <button class="btn dark" onclick="closeModal();cpMarcar('${r.id}','ENTREGADO')">✔ Ya entregó sus papeles</button>
    </div>`,'sm');
}
async function cpMarcar(id,estado){
  const r=PAPELES.find(x=>x.id===id); if(!r)return;
  if(estado==='ENTREGADO'&&!confirm(`¿${r.nombre_completo} ya entregó toda su documentación?\n\nSale de la lista y deja de contar semanas.`))return;
  if(estado==='NO_SE_PRESENTO'&&!confirm(`¿${r.nombre_completo} dejó de presentarse?\n\nEl contador se queda en ${Number(r.semanas_adeudadas)||0} y deja de subir. NO se borra: si regresa, se reabre solo al registrarle otra semana.`))return;
  markWrite();
  const {error}=await sb.rpc('marcar_estado_pendiente',
    {p_id:id,p_estado:estado,p_semana:'S'+isoWeek(),p_usuario:USER.email});
  if(error){
    /* Sin el Script 65 todavía se puede marcar lo de siempre, para no
       dejar la pantalla inservible mientras lo corren. */
    if(/function .*marcar_estado_pendiente/i.test(error.message||'')){
      if(estado==='NO_SE_PRESENTO'){toast('Falta correr el Script 65 en Supabase para poder marcar que ya no se presentó.','err');return;}
      return cpEntregado(id,estado==='ENTREGADO');
    }
    toast('Error: '+error.message,'err');return;
  }
  toast(estado==='ENTREGADO'?'Marcado como entregado.'
       :estado==='NO_SE_PRESENTO'?'Marcado: dejó de presentarse. El contador quedó congelado.'
       :'Regresó a la lista de pendientes.','ok');
  await cpCargar();
}
/* ---------- ¿ESTE YA ESTÁ DADO DE ALTA? (2026-08-28) ------------------
   El control de papeles es la ANTESALA: gente que ya viene a trabajar
   pero todavía no está en el padrón. Si alguien ya está en
   `trabajadores`, no tiene nada que hacer aquí — pero el capturista no se
   sabe de memoria a los 200 y lo vuelve a anotar.

   La búsqueda se hace en la base (buscar_trabajador_parecido, Script 62)
   con el mismo criterio de parecido del control de papeles: exacto, otro
   orden de apellidos, un apellido de menos, y errores de dedo si hay
   pg_trgm. Si la función no está todavía, se busca en la gente ya
   cargada de la obra, para no dejar la validación sin red.

   Una BAJA no bloquea: esa persona sí puede volver a entrar y hay que
   llevarle el control otra vez. */
function cpLimpiaAviso(){
  const a=$('cp-aviso'); if(a){a.innerHTML='';a.removeAttribute('style');}
  const i=$('cp-nom'); if(i)i.classList.remove('err');
  window._CPYA=null;
}
function _cpLocal(nom){
  const w=(WORKERS||[]).find(x=>_pgNameEq(fullName(x),nom))
       ||(WORKERS||[]).find(x=>_pgOverlap(fullName(x),nom)>=0.8);
  if(!w)return {encontrado:false};
  return {encontrado:true,nombre:fullName(w),no_trab:w.no_trab,
    puesto:w.puesto||'sin puesto',estatus:w.estatus||'',
    bloquea:String(w.estatus||'').toUpperCase()!=='BAJA',
    exacto:_pgNameEq(fullName(w),nom)};
}
async function cpBuscaAlta(nom){
  if(!OBRA||!nom||nom.length<3)return {encontrado:false};
  try{
    const {data,error}=await sb.rpc('buscar_trabajador_parecido',{p_obra:OBRA.id,p_nombre:nom});
    if(error)throw error;
    return data||{encontrado:false};
  }catch(e){
    return _cpLocal(nom);   // sin el Script 62, al menos se revisa lo cargado
  }
}
async function cpChecaAlta(){
  const nom=($('cp-nom').value||'').replace(/\s+/g,' ').trim().toUpperCase();
  cpLimpiaAviso();
  if(nom.length<3)return null;
  const r=await cpBuscaAlta(nom);
  window._CPYA=r&&r.encontrado?r:null;
  const a=$('cp-aviso');
  if(!r||!r.encontrado){
    if(a){a.style.color='var(--green)';a.textContent='✔ No está dado de alta — se puede registrar.';}
    return null;
  }
  const msg=`Trabajador ya registrado. Número: ${r.no_trab??'sin número'} - Puesto: ${r.puesto||'sin puesto'}`;
  if($('cp-nom'))$('cp-nom').classList.toggle('err',!!r.bloquea);
  if(a){
    a.style.color=r.bloquea?'var(--red)':'var(--amber)';
    a.innerHTML=r.bloquea
      ?`<b>⛔ ${esc(msg)}</b>${r.exacto?'':` · lo encontré como <b>${esc(r.nombre)}</b>`}`
      :`<b>⚠ ${esc(r.nombre)} está de BAJA</b> (número ${r.no_trab??'—'}). Si volvió a entrar, sí se registra aquí.`;
  }
  return r;
}
async function cpRegistrar(){
  if(!OBRA){toast('Abre una obra primero.','err');return;}
  const nom=($('cp-nom').value||'').replace(/\s+/g,' ').trim().toUpperCase();
  const puesto=($('cp-puesto').value||'').trim().toUpperCase();
  const semN=parseInt($('cp-sem').value)||isoWeek();
  if(nom.length<3){toast('Escribe el nombre completo.','err');return;}
  /* Se vuelve a revisar aquí, no solo en el onblur: con Enter el campo nunca
     pierde el foco y la validación se saltaría. */
  const ya=await cpChecaAlta();
  if(ya&&ya.bloquea){
    modal(`
      <div class="m-head" style="background:var(--amber-bg)"><h2>⛔ Trabajador ya registrado</h2><button class="x" onclick="closeModal()">×</button></div>
      <div class="m-body">
        <p style="font-size:15px;line-height:1.7"><b>Trabajador ya registrado. Número: ${esc(String(ya.no_trab??'sin número'))} - Puesto: ${esc(ya.puesto||'sin puesto')}</b></p>
        <p style="color:var(--mut);font-size:12.5px">Esta pantalla es solo para quien <b>todavía no está dado de alta</b>. ${esc(ya.nombre)} ya está en el padrón de ${esc(OBRA.nombre)} como <b>${esc(ya.estatus||'—')}</b>, así que no se anota aquí.</p>
        ${ya.exacto?'':`<div class="kv" style="background:var(--amber-bg)"><b>Ojo</b><span>Lo capturaste como <b>${esc(nom)}</b> y en el padrón está como <b>${esc(ya.nombre)}</b>. Si de verdad son dos personas distintas, corrige el nombre para que no se confundan.</span></div>`}
      </div>
      <div class="m-foot">
        <button class="btn" onclick="closeModal()">Entendido</button>
        ${ya.id?`<button class="btn dark" onclick="closeModal();openDetail('${ya.id}')">👤 Ver su ficha</button>`:''}
      </div>`,'sm');
    toast(`Trabajador ya registrado. Número: ${ya.no_trab??'sin número'} - Puesto: ${ya.puesto||'sin puesto'}`,'err');
    return;
  }
  markWrite();
  const {data,error}=await sb.rpc('registrar_pendiente',
    {p_obra:OBRA.id,p_nombre:nom,p_puesto:puesto||null,p_semana:'S'+semN,p_usuario:USER.email});
  if(error){
    toast(/function .*registrar_pendiente/i.test(error.message||'')
      ?'Falta correr el Script 61 en Supabase.':'Error: '+error.message,'err');
    return;
  }
  const r=data&&data.fila?data.fila:null;
  const n=r?Number(r.semanas_adeudadas)||1:1;
  $('cp-nom').value=''; $('cp-puesto').value=''; cpLimpiaAviso();
  await cpCargar();
  $('cp-nom').focus();
  if(!r){toast('Registrado.','ok');return;}
  if(data.nuevo){ toast(`Registrado: ${r.nombre_completo} · 1ª semana sin papeles.`,'ok'); return; }
  if(n>=2){
    // La alerta es un modal a propósito: un toast se va solo y esto es
    // justo lo que nadie estaba viendo.
    modal(`
      <div class="m-head" style="background:var(--amber-bg)"><h2>⚠️ ¡CUIDADO!</h2><button class="x" onclick="closeModal()">×</button></div>
      <div class="m-body">
        <p style="font-size:15px;line-height:1.7">Este trabajador ya lleva <b style="color:var(--red);font-size:20px">${n}</b> semana(s) asistiendo <b>sin entregar documentación</b>.</p>
        <div class="kv"><b>Nombre</b><span><b>${esc(r.nombre_completo)}</b></span></div>
        <div class="kv"><b>Puesto</b><span>${esc(r.puesto||'sin capturar')}</span></div>
        <div class="kv"><b>Ingresó en la semana</b><span><b>${esc(r.semana_ingreso||'—')}</b></span></div>
        <div class="kv"><b>Última vez registrado</b><span>${esc(r.ultima_semana_registrada||'—')}</span></div>
        ${data.coincidencia_exacta?'':`<div class="kv" style="background:var(--amber-bg)"><b>Ojo</b><span>Lo capturaste como <b>${esc(nom)}</b> y lo ligué al que ya estaba: <b>${esc(r.nombre_completo)}</b>. Si no es la misma persona, quita el renglón y vuelve a capturarlo con el nombre completo.</span></div>`}
      </div>
      <div class="m-foot">
        <button class="btn" onclick="closeModal()">Entendido</button>
        <button class="btn dark" onclick="closeModal();cpEntregado('${r.id}',true)">✔ Ya entregó sus papeles</button>
      </div>`,'sm');
  }else{
    toast(`${r.nombre_completo}: ya estaba registrado en ${r.ultima_semana_registrada||'la misma semana'}. No se subió el contador.`,'');
  }
}
async function cpEntregado(id,val){
  const r=PAPELES.find(x=>x.id===id);
  if(val&&r&&!confirm(`¿${r.nombre_completo} ya entregó toda su documentación?\n\nSale de la lista y deja de contar semanas.`))return;
  markWrite();
  const {error}=await sb.from('control_expedientes_pendientes')
    .update({entregado:val,fecha_entrega:val?today():null,actualizado_por:USER.email}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  toast(val?'Marcado como entregado.':'Regresó a la lista de pendientes.','ok');
  await cpCargar();
}
/* ---------- CONCILIACIÓN CON EL PADRÓN (2026-09-04) --------------------
   La antesala y el padrón no se hablaban: cuando por fin se daba de alta
   a alguien, su renglón del control de papeles se quedaba contando
   semanas para siempre y había que acordarse de ir a cerrarlo a mano.

   Se hace en la BASE (conciliar_papeles, Script 65) y no aquí, por dos
   razones: usa el mismo criterio de parecido que todo lo demás — una
   sola definición de "es la misma persona" — y respeta la RLS, así que
   cada quien concilia contra las obras que puede ver.

   NO cierra nada solo: propone y el capturista confirma. Un nombre
   parecido no es una prueba, y cerrar el renglón equivocado borra el
   historial de semanas de alguien que sí debe papeles. */
async function cpConciliar(){
  if(!OBRA){toast('Abre una obra primero.','err');return;}
  const {data,error}=await sb.rpc('conciliar_papeles',{p_obra:OBRA.id});
  if(error){
    toast(/function .*conciliar_papeles/i.test(error.message||'')
      ?'Falta correr el Script 65 en Supabase.':'Error: '+error.message,'err');
    return;
  }
  const l=data||[];
  if(!l.length){
    modal(`
      <div class="m-head"><h2>🔗 Conciliación con el padrón</h2><button class="x" onclick="closeModal()">×</button></div>
      <div class="m-body"><div class="empty"><div class="big">✔</div>Todo cuadra.<br><span style="font-size:12.5px">Nadie de la lista de papeles está dado de alta todavía en ${esc(OBRA.nombre)}.</span></div></div>
      <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'sm');
    return;
  }
  window._CPCONC=l;
  modal(`
    <div class="m-head" style="background:var(--amber-bg)"><h2>🔗 ${l.length} ya está${l.length>1?'n':''} dado${l.length>1?'s':''} de alta</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:10px">Est${l.length>1?'as personas siguen':'a persona sigue'} contando semanas en el control de papeles, pero ya aparece${l.length>1?'n':''} en el padrón de <b>${esc(OBRA.nombre)}</b>. Revisa que sí sean la misma persona y ciérral${l.length>1?'as':'a'}.</p>
      <table style="width:100%;font-size:12.5px">
        <thead><tr><th style="text-align:left">En papeles</th><th style="text-align:left">En el padrón</th><th style="text-align:right">Sem.</th><th></th></tr></thead>
        <tbody id="cp-conc-body">${l.map(x=>`
          <tr data-conc="${x.id}">
            <td><b>${esc(x.nombre_completo)}</b><div style="font-size:11px;color:var(--mut)">${esc(x.puesto||'sin puesto')}</div></td>
            <td>${esc(x.trab_nombre)}<div style="font-size:11px;color:var(--mut)">Nº ${x.trab_numero??'—'} · ${esc(x.trab_estatus||'—')}${x.exacto?'':' · <b style="color:var(--amber)">nombre escrito distinto</b>'}</div></td>
            <td style="text-align:right;font-weight:800">${x.semanas_adeudadas}</td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn dark" style="padding:2px 8px;font-size:11px" onclick="cpCerrarConc('${x.id}')">✔ Cerrar</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Después</button>
      <button class="btn gold" onclick="cpCerrarTodasConc()">✔ Cerrar ${l.length>1?'las '+l.length:'el renglón'} (ya entregaron)</button>
    </div>`,'md');
}
async function cpCerrarConc(id,calla){
  markWrite();
  const {error}=await sb.rpc('marcar_estado_pendiente',
    {p_id:id,p_estado:'ENTREGADO',p_semana:null,p_usuario:USER.email});
  if(error){if(!calla)toast('Error: '+error.message,'err');return false;}
  const tr=document.querySelector(`tr[data-conc="${id}"]`);
  if(tr)tr.remove();
  if(!calla){toast('Cerrado: ya está dado de alta.','ok');await cpCargar();}
  return true;
}
async function cpCerrarTodasConc(){
  const l=window._CPCONC||[];
  if(!l.length)return;
  const dudosas=l.filter(x=>!x.exacto).length;
  if(!confirm(`¿Cerrar ${l.length} renglón(es) del control de papeles?\n\n`
    +`Se marcan como ENTREGADO porque ya están dados de alta.`
    +(dudosas?`\n\n⚠ OJO: ${dudosas} de ellos tienen el nombre escrito distinto en el padrón. Si alguno no es la misma persona, ciérralos uno por uno.`:'')))return;
  let n=0;
  for(const x of l){ if(await cpCerrarConc(x.id,true))n++; }
  closeModal();
  toast(`${n} renglón(es) cerrado(s): ya estaban dados de alta.`,'ok');
  await cpCargar();
}
async function cpQuitar(id){
  const r=PAPELES.find(x=>x.id===id); if(!r)return;
  if(!confirm(`¿Quitar a ${r.nombre_completo} de la lista?\n\nEsto SÍ borra el renglón (no es un trabajador dado de alta, es una nota de control).`))return;
  markWrite();
  const {error}=await sb.from('control_expedientes_pendientes').delete().eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  toast('Quitado de la lista.','ok');
  await cpCargar();
}
function exportListaNegra(){
  const lista=PAPELES.filter(r=>!r.entregado)
    .sort((a,b)=>(b.semanas_adeudadas||0)-(a.semanas_adeudadas||0)
      ||String(a.nombre_completo).localeCompare(String(b.nombre_completo),'es'));
  if(!lista.length){toast('No hay nadie pendiente de entregar papeles.','err');return;}
  const rows=[],styles=[],hs=[];
  rows.push(['CONTROL DE EXPEDIENTES PENDIENTES','','','']); styles.push(ST.title); hs.push({hpt:26});
  rows.push([`${OBRA.nombre} · ${lista.length} trabajador(es) sin entregar documentación · ${new Date().toLocaleDateString('es-MX')}`,'','','']);
  styles.push(ST.sub); hs.push({hpt:18});
  rows.push(['NOMBRE COMPLETO','PUESTO','SEMANA DE INGRESO','SEMANAS ADEUDADAS']);
  styles.push(ST.head); hs.push({hpt:24});
  lista.forEach(r=>{
    const n=Number(r.semanas_adeudadas)||0;
    rows.push([r.nombre_completo,r.puesto||'Sin información',r.semana_ingreso||'Sin información',n]);
    // 3 semanas o más se marcan en rojo: es lo que hay que resolver primero
    const rojo=n>=3?{font:{bold:true,color:{rgb:'C00000'}}}:{};
    styles.push([{...ST.cell,...rojo},ST.cell,ST.cellC,{...ST.cellC,...rojo,font:{...(rojo.font||{}),bold:true}}]);
    hs.push(null);
  });
  rows.push(['TOTAL','','',lista.reduce((s,r)=>s+(Number(r.semanas_adeudadas)||0),0)]);
  styles.push([ST.total,ST.total,ST.total,ST.total]); hs.push({hpt:20});
  const merges=[{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:1,c:0},e:{r:1,c:3}},
    {s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:2}}];
  const ws=buildSheet(rows,styles,[38,24,18,20],merges,hs);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'PENDIENTES');
  dl(wb,`EXPEDIENTES_PENDIENTES_${String(OBRA.nombre||'').replace(/[^A-Za-z0-9]+/g,'_').slice(0,40)}_${today()}.xlsx`);
  toast(`Lista exportada: ${lista.length} pendiente(s).`,'ok');
}

/* ---------- RENOMBRAR UN DOCUMENTO DEL EXPEDIENTE (2026-08-28) ---------
   Los acuses del IMSS entran con el nombre que trae el archivo del IDSE, y
   cuando un mismo trabajador tiene alta y baja las dos filas se ven casi
   iguales: hay que abrir cada PDF para saber cuál es cuál. Aquí se puede
   corregir el nombre y, en los acuses, el TIPO DE MOVIMIENTO, que es la
   etiqueta en negritas que se ve en la ficha.
   El archivo en Storage NO se toca: solo cambia cómo se llama en la base.
   Así ningún enlace ni respaldo se rompe. */
const SUBTIPOS_IMSS=['ALTA','REINGRESO','BAJA','MODIFICACION SALARIAL','OTRO'];
function openRenombrarDoc(docId,wId){
  const d=DOCSX.find(x=>x.id===docId); if(!d){toast('No encontré ese documento.','err');return;}
  const esImss=String(d.categoria||'')==='ACUSE_IMSS';
  const actual=String(d.subtipo||'').toUpperCase();
  modal(`
    <div class="m-head"><h2>✎ Renombrar documento</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Cambia cómo se llama este documento <b>en la base</b>. El archivo guardado no se mueve ni se vuelve a subir, así que no se rompe ningún enlace.</p>
      <div class="kv"><b>Categoría</b><span>${esc(d.categoria||'—')}${d.semana?' · '+esc(d.semana):''} · ${fmtD(d.fecha_doc||d.created_at)}</span></div>
      <div class="kv"><b>Subido por</b><span>${esc(d.subido_por||'—')}</span></div>
      <div style="margin-top:12px"><label>Nombre del documento *</label>
        <input id="rd-nom" maxlength="120" value="${esc(d.nombre_archivo||'')}">
        <div class="fhint">Máximo 120 caracteres. Ponle el sufijo que te sirva para distinguirlo: ALTA, BAJA, REINGRESO...</div></div>
      ${esImss?`<div style="margin-top:12px"><label>Tipo de movimiento</label>
        <select id="rd-sub">${SUBTIPOS_IMSS.map(s=>`<option ${actual===s?'selected':''}>${s}</option>`).join('')}
          ${SUBTIPOS_IMSS.includes(actual)||!actual?'':`<option selected>${esc(actual)}</option>`}</select>
        <div class="fhint">Es la etiqueta en negritas de la ficha. <b>Solo cambia el nombre del acuse</b>: no modifica el movimiento IMSS del trabajador ni su fecha de alta o baja.</div></div>`:''}
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        ${['ALTA','BAJA','REINGRESO','MODIFICACIÓN'].map(s=>`<button class="btn" style="padding:3px 10px;font-size:11.5px" onclick="rdSufijo('${s}')">+ ${s}</button>`).join('')}
      </div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="guardarRenombreDoc('${docId}','${wId}')">💾 Guardar nombre</button>
    </div>`,'sm');
}
/* Agrega el sufijo al final, sin repetirlo si ya está. */
function rdSufijo(s){
  const i=$('rd-nom'); if(!i)return;
  const base=i.value.replace(/\.pdf$/i,'').trim();
  if(new RegExp('(^|[^A-ZÁÉÍÓÚ])'+s+'([^A-ZÁÉÍÓÚ]|$)','i').test(base)){i.focus();return;}
  const ext=/\.pdf$/i.test(i.value)?'.pdf':'';
  i.value=(base+' — '+s+ext).slice(0,120);
  i.focus();
}
async function guardarRenombreDoc(docId,wId){
  const d=DOCSX.find(x=>x.id===docId); if(!d)return;
  const nom=($('rd-nom').value||'').trim().slice(0,120);
  if(!nom){toast('El documento necesita un nombre.','err');return;}
  const upd={nombre_archivo:nom};
  const sel=$('rd-sub'); if(sel&&sel.value&&sel.value!==d.subtipo)upd.subtipo=sel.value;
  if(nom===d.nombre_archivo&&!upd.subtipo){closeModal();return;}
  markWrite();
  const {error}=await sb.from('documentos').update(upd).eq('id',docId);
  if(error){toast('Error: '+error.message,'err');return;}
  // se refleja de inmediato, sin esperar a la recarga
  d.nombre_archivo=nom; if(upd.subtipo)d.subtipo=upd.subtipo;
  closeModal();
  toast('Documento renombrado.','ok');
  await loadObraData(OBRA.id);
  if(wId)openDetail(wId);
}
/* ---------- v31: anular documento del expediente (con rastro) ---------- */
async function anularDoc(docId,wId){
  const d=DOCSX.find(x=>x.id===docId); if(!d)return;
  const motivo=prompt(`¿Quitar este documento del expediente?\n\n${d.nombre_archivo}\n\nNo se borra físicamente: se ANULA, deja de aparecer en fichas y respaldos, y queda registrado quién lo quitó y por qué.\n\nEscribe el motivo (ej. DUPLICADO):`);
  if(motivo===null)return; // canceló
  markWrite();
  const upd={anulado:true,anulado_por:USER.email,anulado_en:new Date().toISOString(),motivo_anulacion:(motivo||'').trim().toUpperCase()||'SIN MOTIVO'};
  let {error}=await sb.from('documentos').update(upd).eq('id',docId);
  if(error&&/anulado_por|anulado_en|motivo_anulacion/i.test(error.message||'')){
    ({error}=await sb.from('documentos').update({anulado:true}).eq('id',docId)); // si falta el Script 33, anula sin rastro extendido
  }
  if(error){toast('Error: '+error.message,'err');return;}
  toast('Documento anulado: ya no aparecerá en la ficha ni en los respaldos.','ok');
  await loadObraData(OBRA.id);
  openDetail(wId);
}

