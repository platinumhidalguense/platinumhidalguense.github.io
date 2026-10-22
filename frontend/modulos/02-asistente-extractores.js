/* ============================================================
   v37 · ASISTENTE INTELIGENTE (RAG) + EXTRACTOR DE JSON
   Todo pasa por Edge Functions: la llave de Google NUNCA vive en este archivo
   (es público en GitHub Pages). El asistente hereda la sesión del usuario, así
   que la búsqueda respeta el RLS y nadie ve obras que no le tocan.
   ============================================================ */
const IA_FN={chat:'gemini-chat',extract:'gemini-extract',embed:'gemini-embed'};
function iaBaseUrl(){
  const c=getCfg();
  return c&&c.url?String(c.url).replace(/\/$/,'')+'/functions/v1/':'';
}
async function iaLlamar(fn,cuerpo,ms=45000){
  const base=iaBaseUrl();
  if(!base)throw new Error('Falta configurar Supabase en esta computadora.');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Tu sesión expiró. Vuelve a entrar.');
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),ms);
  try{
    const r=await fetch(base+fn,{method:'POST',signal:ctrl.signal,
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
      body:JSON.stringify(cuerpo||{})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok&&!j.respuesta&&!j.error)throw new Error('El servicio respondió '+r.status);
    return j;
  }catch(e){
    /* "Failed to fetch" no dice nada útil: el navegador lo suelta igual cuando la
       función no existe, cuando el permiso de origen (CORS) falla y cuando no hay
       internet. Aquí se traduce a algo accionable. */
    if(e&&e.name==='AbortError')throw new Error('Se tardó demasiado. Intenta otra vez.');
    if(e instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(String(e.message||''))){
      throw new Error(`No pude comunicarme con la función «${fn}».\n\n`+
        `Casi siempre es una de estas tres:\n`+
        `1. La función todavía no está desplegada en Supabase.\n`+
        `2. Está desplegada pero con "Verify JWT" encendido (bloquea la llamada antes de que entre).\n`+
        `3. No hay internet.\n\n`+
        `Usa ⚙ Administración → 🤖 Asistente e índice de IA → "Probar conexión" y te digo cuál es.`);
    }
    throw e;
  }finally{clearTimeout(t);}
}
/* ---------- DIAGNÓSTICO: dice exactamente qué falta ----------
   Prueba las 3 funciones y traduce cada resultado a una instrucción concreta. */
async function iaProbarConexion(){
  const out=$('ia-diag'); if(out)out.innerHTML=skeletonRows(3,'1fr 2fr','Probando las 3 funciones...');
  const base=iaBaseUrl();
  const {data:{session}}=await sb.auth.getSession();
  const filas=[];
  if(!base)filas.push({fn:'—',ok:false,msg:'No hay Supabase configurado en esta computadora.',fix:''});
  else if(!session)filas.push({fn:'—',ok:false,msg:'No hay sesión iniciada.',fix:'Cierra sesión y vuelve a entrar.'});
  else{
    for(const fn of [IA_FN.chat,IA_FN.extract,IA_FN.embed]){
      let r={fn,ok:false,msg:'',fix:''};
      try{
        const resp=await fetch(base+fn,{method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
          body:JSON.stringify({pregunta:'ping',limite:0,tipo:'generico',texto:''})});
        const txt=await resp.text();
        let j={}; try{j=JSON.parse(txt);}catch(e){}
        if(resp.status===404){r.msg='No existe (404)';r.fix=`Falta desplegarla. Debe llamarse exactamente «${fn}».`;}
        else if(resp.status===401&&!j.respuesta&&!j.error){r.msg='Rechazada antes de entrar (401)';r.fix='Apaga "Verify JWT" en los ajustes de la función: ella valida la sesión por su cuenta.';}
        else if(/GEMINI_API_KEY/i.test(txt)){r.msg='Desplegada, pero sin llave de Google';r.fix='Edge Functions → Secrets → agrega GEMINI_API_KEY.';}
        else if(/Origen no autorizado/i.test(txt)){r.msg='Bloqueada por origen';r.fix='Agrega '+location.origin+' al secret ORIGENES_PERMITIDOS.';}
        else if(resp.ok||j.ok!==undefined||j.respuesta){r.ok=true;r.msg='Responde bien ('+resp.status+')';}
        else{r.msg='Respondió '+resp.status;r.fix=txt.slice(0,120);}
      }catch(e){
        /* El navegador tira el mismo error cuando el servidor NO contestó y cuando
           contestó pero sin permiso de lectura (CORS). Se distingue con una sonda
           "no-cors": si algo respondió, la sonda pasa aunque no podamos leerla. */
        let respondio=false;
        try{ await fetch(base+fn,{method:'POST',mode:'no-cors',
              headers:{'Content-Type':'text/plain'},body:'{}'}); respondio=true; }catch(e2){}
        if(respondio){
          r.msg='El servidor SÍ contesta, pero la respuesta viene sin permiso de lectura';
          r.fix=`Casi siempre es una de dos: (a) el nombre no es exactamente «${fn}» `+
                `—revísalo en la lista de Edge Functions, sin mayúsculas ni .ts—, o `+
                `(b) la función truena al arrancar. Ábrela en Supabase → pestaña Logs: `+
                `si trae un error de arranque, ahí sale.`;
        }else{
          r.msg='No respondió nada';
          r.fix='No está desplegada, o el proyecto de Supabase no es el que tienes configurado aquí.';
        }
      }
      filas.push(r);
    }
  }
  const bien=filas.every(f=>f.ok);
  if(out)out.innerHTML=`
    <div style="background:${bien?'var(--green-bg)':'var(--red-bg)'};border-radius:9px;padding:10px 13px;margin-bottom:10px;font-size:13px">
      <b style="color:${bien?'var(--green)':'var(--red)'}">${bien?'✅ Las 3 funciones responden bien.':'⚠ Algo falta todavía.'}</b>
    </div>
    ${filas.map(f=>`<div class="kv"><b>${esc(f.fn)}</b><span>${f.ok?'✔':'✘'} ${esc(f.msg)}${f.fix?`<br><span style="color:var(--mut);font-size:11.5px">→ ${esc(f.fix)}</span>`:''}</span></div>`).join('')}
    <div class="fhint" style="margin-top:8px">Tu dirección de Supabase: <b>${esc(base||'(sin configurar)')}</b></div>`;
}

/* ---------- EXTRACTOR HÍBRIDO ----------
   Los lectores propios (regex calibrados contra los documentos reales) van
   PRIMERO. Solo si no reconocen nada entra el modelo. Nunca al revés: un regex
   probado contra el PDF real no se cambia por una respuesta generada. */
async function extraerConIA(tipo,texto,pista){
  try{
    const j=await iaLlamar(IA_FN.extract,{tipo,texto:String(texto||'').slice(0,60000),pista:pista||''});
    if(j&&j.ok&&Array.isArray(j.registros)&&j.registros.length)return j;
    return null;
  }catch(e){return null;}   // si la IA falla, la app sigue igual que antes
}
/* Aviso reutilizable: lo que salió del modelo SIEMPRE se revisa antes de guardar */
const IA_BANNER=`<div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:9px;padding:9px 12px;margin-bottom:10px;font-size:12px;line-height:1.6">
  🤖 <b>Leído con ayuda de la IA</b> porque el lector normal no reconoció el formato.
  <b>Revisa cada renglón antes de guardar</b> — sobre todo importes y fechas.</div>`;

/* ============================================================
   v37.1 · CONTEXTO CALCULADO — lo que la búsqueda por parecido NO puede dar
   Un índice vectorial encuentra TEXTOS parecidos; jamás va a saber "cuántos
   folios están salteados" ni "cuánto suma la proyección de la S20", porque eso
   no está escrito en ningún lado: SE CALCULA.
   Por eso el navegador —que ya tiene todo cargado y el motor de nómina real—
   hace las cuentas y se las entrega al asistente como dato duro. Así el
   modelo solo REDACTA; los números salen del mismo motor calibrado con NOI.
   ⚠ NO se reescribe ninguna fórmula aquí: se llaman las funciones que ya usan
   las pantallas (cfCargar, pyCandidatos, descuentosDe, retFilasDe, saldoVac...).
   ============================================================ */
const _n2=v=>Math.round((Number(v)||0)*100)/100;

/* ============================================================
   v37.3 · CÁLCULOS DE LA APP PARA EL ASISTENTE
   REPARTO DE TRABAJO:
     · Contar, sumar, agrupar y listar  → lo hace POSTGRES desde la Edge Function
       (Script 55). Ve TODAS las obras que el usuario puede ver, con COUNT(*) real
       y con el RLS aplicado. Antes esto se hacía en el navegador con lo que
       tuviera cargado de la obra abierta, y por eso contestaba de una sola obra.
     · Proyecciones, folios saltados, la nómina exacta de una persona, saldos de
       vacaciones, recibos faltantes y alertas → SOLO puede hacerlo la app, porque
       usan el motor de nómina calibrado contra NOI. Eso es lo que queda aquí.
   Aquí NO se reescribe ninguna fórmula: se llaman las funciones de la app.
   ============================================================ */


/* Cálculos con nombre: los que necesitan el MOTOR de nómina o lógica propia.
   Aquí NO se reescribe ninguna fórmula: se llaman las funciones de la app. */
const IA_CALCULOS={
  proyeccion_semana:{
    desc:'Proyección de nómina de una semana: a cuántos se paga, sueldos, descuentos por tipo (INFONAVIT, FONACOT...), finiquitos y total a dispersar. Parámetro: semana (número).',
    fn:(a)=>{
      const W=parseInt(a&&a.semana)||semObra(), sem='S'+W;
      const base=new Date((OBRA&&OBRA.fecha_inicio?String(OBRA.fecha_inicio).slice(0,10):SEMANA1)+'T12:00');
      const d1=new Date(base);d1.setDate(base.getDate()+(W-1)*7);
      const d2=new Date(d1);d2.setDate(d1.getDate()+6);
      const D1=d1.toISOString().slice(0,10),D2=d2.toISOString().slice(0,10);
      const {act,fins}=pyCandidatos(D1,D2,'TODOS');
      const sueldos=act.reduce((s,w)=>s+(Number(w.sal_semanal)||0),0);
      const finiq=fins.reduce((s,w)=>s+(Number(w.monto_finiquito)||0),0);
      let desc=0;const porTipo={};
      act.forEach(w=>{desc+=retencionesDePeriodo(w,sem).total;});
      (retFilasDe(sem)||[]).forEach(f=>{if(!act.some(w=>w.id===f.w.id))return;
        const t=(f.d.tipo||'OTRO').toUpperCase();porTipo[t]=porTipo[t]||{cuantos:0,total:0};
        porTipo[t].cuantos++;porTipo[t].total=_n2(porTipo[t].total+(Number(f.monto)||0));});
      return {semana:sem,del:D1,al:D2,obra:OBRA.nombre,trabajadores_a_pagar:act.length,
        suma_sueldos:_n2(sueldos),total_descuentos:_n2(desc),descuentos_por_tipo:porTipo,
        finiquitos:{cuantos:fins.length,importe:_n2(finiq)},total_a_dispersar:_n2(sueldos-desc+finiq)};}},
  folios_saltados:{
    desc:'Folios de cheque que se saltaron en el consecutivo GLOBAL, cuáles están justificados y cuáles no. Sin parámetros.',
    fn:async()=>{const r=await cfCargar();
      const sin=r.huecos.filter(n=>!r.just.has(String(n))),con=r.huecos.filter(n=>r.just.has(String(n)));
      return {del:_cfPad(r.min),al:_cfPad(r.max),cheques_capturados:r.total,
        total_saltados:r.huecos.length,sin_justificar:sin.length,justificados:con.length,
        cuales_sin_justificar:sin.slice(0,50).map(n=>_cfPad(n)),
        cuales_justificados:con.slice(0,50).map(n=>_cfPad(n))};}},
  revision_pagos_semana:{
    desc:'Cruce de una semana: quién tiene pago, quién cheque, a quién le rebotó y a quién NO se le pagó. Parámetro: semana (número).',
    fn:(a)=>{const S='S'+(parseInt(a&&a.semana)||semObra());
      const f=conciliaSemanaDatos(S);
      return {semana:S,con_pago:f.filter(x=>x.estado==='OK').length,
        cheques_expedidos:f.filter(x=>x.estado==='CHEQUE EXPEDIDO').length,
        cheques_entregados:f.filter(x=>x.estado==='CHEQUE ENTREGADO').length,
        cheques_sin_expedir:f.filter(x=>x.estado==='CHEQUE PENDIENTE').length,
        rechazados_sin_reponer:f.filter(x=>x.estado==='RECHAZADO').map(x=>fullName(x.w)),
        sin_ningun_pago:f.filter(x=>x.estado==='SIN PAGO').map(x=>fullName(x.w))};}},
  nomina_de_trabajador:{
    desc:'Cálculo semanal exacto de UN trabajador (bruto, IMSS, ISR, subsidio, neto), con el motor calibrado contra NOI. Parámetros: nombre (texto), faltas (número, opcional).',
    fn:(a)=>{const q=String(a&&a.nombre||'').toUpperCase();
      const w=(WORKERS||[]).find(x=>fullName(x).toUpperCase().includes(q));
      if(!w)return {error:'No encontré a "'+q+'" en la obra abierta.'};
      const n=nominaSemanal(w,{faltas:Number(a&&a.faltas)||0});
      return {trabajador:fullName(w),no_trab:w.no_trab,puesto:w.puesto,sd:w.sd,sdi:w.sdi,
        faltas:n.faltas,bruto:_n2(n.bruto),imss_obrero:_n2(n.imssObr),isr:_n2(n.isr),
        subsidio:_n2(n.subsidio),neto:_n2(n.neto)};}},
  vacaciones_de_todos:{
    desc:'Saldo de vacaciones de los activos: derecho, gozados, saldo y vigencia. Sin parámetros.',
    fn:()=>{const v=(WORKERS||[]).filter(w=>w.estatus==='ACTIVO').map(w=>{
        const s=saldoVac(w);return {trabajador:fullName(w),antiguedad:s.anios,derecho:s.derecho,
          gozados:s.gozados,saldo:s.saldo,vigencia:s.vigencia};});
      return {total_activos:v.length,con_saldo:v.filter(x=>x.saldo>0).length,
        dias_pendientes_en_total:v.reduce((s,x)=>s+(x.saldo||0),0),
        detalle:v.filter(x=>x.saldo>0).sort((a,b)=>b.saldo-a.saldo).slice(0,30)};}},
  recibos_faltantes:{
    desc:'Trabajadores a los que les falta archivar el recibo de nómina de alguna semana. Sin parámetros.',
    fn:()=>{const set=recSetGlobal();
      const r=[];(WORKERS||[]).forEach(w=>{const f=faltantesReciboDe(w,set);
        if(f.length)r.push({trabajador:fullName(w),faltan_semanas:f.map(x=>'S'+x)});});
      return {cuantos_con_faltantes:r.length,detalle:r.slice(0,30)};}},
  pendientes_del_sistema:{
    desc:'Todas las alertas abiertas: documentación, acuses IMSS, REPSE, contratos, tarjetas, pagos, etc. Sin parámetros.',
    fn:()=>computeAlertas().filter(a=>a.items.length)
      .map(a=>({tema:a.txt,cuantos:a.items.length,
        ejemplos:a.items.slice(0,8).map(x=>x.nombre||(x.primer_apellido?fullName(x):String(x)))}))},
  resumen_general:{
    desc:'Panorama rápido de la obra abierta: activos, bajas, cheques por estatus, semana actual. Sin parámetros.',
    fn:()=>{const act=(WORKERS||[]).filter(w=>w.estatus==='ACTIVO');
      const chq={};(CHEQUES||[]).forEach(c=>{const k=c.estatus||'?';
        chq[k]=chq[k]||{cuantos:0,importe:0};chq[k].cuantos++;
        chq[k].importe=_n2(chq[k].importe+(Number(c.importe)||0));});
      return {obra:OBRA?OBRA.nombre:'—',semana_actual:semObra(),hoy:today(),
        activos:act.length,bajas:(WORKERS||[]).filter(w=>w.estatus==='BAJA').length,
        pendientes:(WORKERS||[]).filter(w=>w.estatus==='PENDIENTE').length,cheques:chq};}}
};

/* El catálogo de cálculos ya no se manda: el modelo los pide por herramienta
   (calculo_del_motor) dentro de la misma llamada. Así se ahorra una petición a
   Google por pregunta, que era la mitad del gasto de cuota. */
/* Ejecuta el cálculo que pidió la Edge Function */
async function iaEjecutaPlan(plan){
  const res={};
  for(const c of (plan||[]).slice(0,2)){
    if(!c||!c.calculo)continue;
    try{
      const k=IA_CALCULOS[c.calculo];
      res[c.calculo+(c.parametros&&c.parametros.semana?'_S'+c.parametros.semana:'')]=
        k?await k.fn(c.parametros||{}):{error:'No existe el cálculo "'+c.calculo+'"'};
    }catch(e){res['error_'+c.calculo]={error:String(e.message||e)};}
  }
  return res;
}

/* iaContextoLocal() se eliminó: armaba conteos de la obra abierta a partir de
   palabras clave y competía con las herramientas de la Edge Function, que
   consultan TODAS las obras contra la base. Dos fuentes para el mismo número
   es exactamente el error que hacía que contestara "solo la obra abierta". */

/* ---------- PANEL DE ADMINISTRACIÓN DE LA IA ---------- */
async function openIA(){
  modal(`
    <div class="m-head"><h2>🤖 Asistente e índice de IA</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">El asistente busca en un <b>índice</b> que se arma con los trabajadores, cheques y finiquitos. Cada vez que capturas o editas algo, ese registro se vuelve a poner en cola solo. Aquí puedes ver cómo va y forzar la indexación.</p>
      <div id="ia-stats"><div class="empty">Consultando el estado del índice...</div></div>
      <div class="sect">Conexión con las funciones de IA</div>
      <div id="ia-diag"><div class="fhint">Si el asistente marca error, aquí te digo exactamente qué falta.</div></div>
      <div class="sect">Privacidad</div>
      <p style="font-size:12.5px;line-height:1.7">Al índice <b>NO</b> se mandan CURP, RFC, NSS, cuentas ni CLABE — solo nombre, puesto, contratista, estatus, fechas, sueldo y notas, que es lo que el asistente necesita para responder. Cada quien recibe únicamente información de las obras que tiene permitidas.</p>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn" onclick="iaProbarConexion()">🔌 Probar conexión</button>
      <button class="btn dark" id="ia-reindex" onclick="iaReindexar()">⚙ Indexar pendientes</button>
    </div>`,'md');
  iaEstadoIndice();
}
async function iaEstadoIndice(){
  const el=$('ia-stats'); if(!el)return;
  try{
    const [{data:emb,error:e1},{data:cola}]=await Promise.all([
      sb.from('ia_embeddings').select('tabla'),
      sb.from('ia_cola_embeddings').select('id').is('procesado_en',null)
    ]);
    if(e1&&/does not exist/i.test(e1.message||'')){
      el.innerHTML='<div class="empty">Todavía no corres el <b>Script 54</b> en Supabase. El asistente funcionará con los datos en vivo, pero sin búsqueda por parecido.</div>';return;
    }
    const por={};(emb||[]).forEach(r=>{por[r.tabla]=(por[r.tabla]||0)+1;});
    el.innerHTML=`<div class="stats">
      <div class="stat g"><div class="n">${(emb||[]).length}</div><div class="l">Registros indexados</div></div>
      <div class="stat ${(cola||[]).length?'a':''}"><div class="n">${(cola||[]).length}</div><div class="l">Pendientes de indexar</div></div>
    </div>
    ${Object.entries(por).map(([k,v])=>`<div class="kv"><b>${esc(k)}</b><span>${v}</span></div>`).join('')||'<div class="kv"><b>—</b><span>Aún no hay nada indexado.</span></div>'}`;
  }catch(e){el.innerHTML='<div class="empty">No pude leer el estado: '+esc(e.message)+'</div>';}
}
async function iaReindexar(){
  const b=$('ia-reindex'); if(b){b.disabled=true;b.innerHTML='<span class="spin"></span> Indexando...';}
  let total=0;
  try{
    for(let v=0;v<10;v++){
      const j=await iaLlamar(IA_FN.embed,{limite:50},60000);
      if(!j||!j.ok)throw new Error(j&&j.error?j.error:'El servicio no respondió bien');
      total+=j.procesados||0;
      if(!j.procesados)break;
    }
    toast(total?`Indexados ${total} registro(s).`:'No había nada pendiente.','ok');
  }catch(e){toast('No se pudo indexar: '+e.message,'err');}
  if(b){b.disabled=false;b.textContent='⚙ Indexar pendientes';}
  iaEstadoIndice();
}

/* ---------- WIDGET DEL ASISTENTE ---------- */
let IA_HIST=[], IA_OCUPADO=false;
function iaDisponible(){return !!(sb&&USER&&iaBaseUrl());}
function iaMostrarFab(){const f=$('ia-fab');if(f)f.classList.toggle('hide',!iaDisponible());}
function iaAbrir(){
  const p=$('ia-panel'),f=$('ia-fab');
  if(!p)return;
  p.classList.add('abierto');
  if(f)f.classList.add('oculto');
  if(!IA_HIST.length)iaBienvenida();
  setTimeout(()=>{const i=$('ia-input');if(i)i.focus();},180);
}
function iaCerrar(){
  const p=$('ia-panel'),f=$('ia-fab');
  if(p)p.classList.remove('abierto');
  if(f)f.classList.remove('oculto');
}
function iaBienvenida(){
  iaPinta('bot',`Hola ${esc(String(USER&&USER.email||'').split('@')[0])} 👋 Soy el asistente de PLATINUM.
Pregúntame de <b>trabajadores, cheques, pagos, IMSS, vacaciones</b> o de cómo usar el sistema.`);
  iaSugerencias(['¿Cuántos cheques tenemos pendientes por expedir?',
                 '¿Quién no tiene acuse del IMSS?',
                 '¿Cómo registro un pago en otro banco?']);
}
function iaAutoAlto(el){el.style.height='auto';el.style.height=Math.min(96,el.scrollHeight)+'px';}
function iaTecla(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();iaEnviar();}
  if(e.key==='Escape')iaCerrar();
}
/* Texto plano → HTML seguro. Solo se permiten **negritas** y saltos de línea:
   nada de inyectar marcado desde la respuesta del modelo. */
function iaFormato(t){
  return esc(String(t||''))
    .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
    .replace(/^[-•]\s+/gm,'• ')
    .replace(/\n/g,'<br>');
}
function iaPinta(quien,html,fuentes){
  const c=$('ia-msgs'); if(!c)return null;
  const d=document.createElement('div');
  d.className='ia-msg '+(quien==='yo'?'yo':quien==='err'?'err':'bot');
  d.innerHTML=html+(fuentes&&fuentes.length
    ?`<div class="fuentes">📎 ${fuentes.length} registro(s) consultado(s) de tu base</div>`:'');
  c.appendChild(d); iaAbajo(); return d;
}
function iaSugerencias(lista){
  const c=$('ia-msgs'); if(!c||!lista||!lista.length)return;
  const d=document.createElement('div');
  d.className='ia-sug';
  d.innerHTML=lista.slice(0,3).map(s=>`<button onclick="iaPreguntar(this.textContent)">${esc(s)}</button>`).join('');
  c.appendChild(d); iaAbajo();
}
function iaAbajo(){const c=$('ia-msgs');if(c)c.scrollTop=c.scrollHeight;}
function iaEscribiendo(on){
  const c=$('ia-msgs'); if(!c)return;
  const v=c.querySelector('.ia-typing'); if(v)v.remove();
  if(on){
    const d=document.createElement('div');
    d.className='ia-typing'; d.innerHTML='<i></i><i></i><i></i>';
    c.appendChild(d); iaAbajo();
  }
}
function iaPreguntar(txt){const i=$('ia-input');if(i){i.value=txt;iaEnviar();}}
async function iaEnviar(){
  const i=$('ia-input'); if(!i||IA_OCUPADO)return;
  const q=i.value.trim(); if(!q)return;
  i.value=''; iaAutoAlto(i);
  const sug=$('ia-msgs').querySelectorAll('.ia-sug'); sug.forEach(s=>s.remove());
  iaPinta('yo',iaFormato(q));
  IA_HIST.push({rol:'user',texto:q});
  IA_OCUPADO=true;
  const btn=$('ia-enviar'); if(btn)btn.disabled=true;
  const est=$('ia-estado'); if(est)est.textContent='Consultando tu base...';
  iaEscribiendo(true);
  try{
    /* UNA sola llamada. Antes eran dos (una para planear y otra para responder) y
       cada una gastaba cuota de Google; el 429 salía por eso. Ahora la función
       consulta la base con sus herramientas y solo vuelve a pedir algo si de
       verdad necesita el MOTOR de nómina, que únicamente puede correr aquí. */
    const est=$('ia-estado');
    let datos={}, j=null;
    for(let ronda=0;ronda<2;ronda++){
      if(est)est.textContent=ronda?'Sacando los números...':'Consultando tu base...';
      j=await iaLlamar(IA_FN.chat,{pregunta:q,obra_id:(OBRA&&OBRA.id)||null,
        obra_nombre:(OBRA&&OBRA.nombre)||null,
        historial:IA_HIST.slice(-6),contexto_calculado:datos},60000);
      if(!(j&&j.necesita_calculo))break;
      /* La función pidió un cálculo del motor: se corre aquí y se vuelve a preguntar
         UNA vez. Nunca más: si insistiera, se rompería el ciclo con lo que haya. */
      const nc=j.necesita_calculo;
      const res=await iaEjecutaPlan([{calculo:nc.calculo,parametros:nc.parametros||{}}]);
      /* La clave tiene que ser EXACTAMENTE el nombre que pidió la función: si no
         coincide, creería que sigue faltando y volvería a pedirlo. */
      const valor=Object.values(res)[0];
      datos[nc.calculo]=(valor===undefined)?{error:'La aplicación no pudo hacer ese cálculo.'}:valor;
    }
    iaEscribiendo(false);
    let txt=j&&j.respuesta?j.respuesta:'No pude responder en este momento.';
    /* Nunca se le enseña al usuario el JSON de una consulta: la función siempre
       manda texto ya redactado. Aquí solo se agrega el motivo técnico si falló. */
    if(j&&j.ok===false&&j.detalle)txt+='\n\n**Motivo técnico:** '+String(j.detalle).slice(0,300);
    iaPinta(j&&j.ok===false?'err':'bot',iaFormato(txt),j&&j.fuentes);
    IA_HIST.push({rol:'bot',texto:txt});
    if(j&&j.sugerencias&&j.sugerencias.length)iaSugerencias(j.sugerencias);
  }catch(e){
    iaEscribiendo(false);
    iaPinta('err',iaFormato(e.message||'No pude consultar.'));
  }finally{
    IA_OCUPADO=false;
    if(btn)btn.disabled=false;
    if(est)est.textContent='Solo temas de la empresa';
    const inp=$('ia-input'); if(inp)inp.focus();
  }
}

