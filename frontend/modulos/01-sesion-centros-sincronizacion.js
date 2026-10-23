/* ---------- arranque ---------- */
function getCfg(){
  if(CONFIG_URL&&CONFIG_KEY)return{url:CONFIG_URL,key:CONFIG_KEY};
  try{const c=JSON.parse(localStorage.getItem('platinum_cfg')||'null');if(c&&c.url&&c.key)return c;}catch(e){}
  return null;
}
function saveConfig(){
  const url=$('cfg-url').value.trim().replace(/\/$/,''), key=$('cfg-key').value.trim();
  if(!/^https:\/\/.+\.supabase\.co$/.test(url)){$('setup-err').textContent='La URL debe verse como https://xxxxx.supabase.co';$('setup-err').classList.remove('hide');return;}
  if(key.length<40){$('setup-err').textContent='La clave parece incompleta. Cópiala completa desde Supabase.';$('setup-err').classList.remove('hide');return;}
  localStorage.setItem('platinum_cfg',JSON.stringify({url,key}));
  location.reload();
}
async function init(){
  aplicarTema(temaGuardado());   // v36: tema antes de pintar nada
  pintarLogo();
  const cfg=getCfg();
  if(!cfg){$('scr-setup').classList.remove('hide');return;}
  sb=window.supabase.createClient(cfg.url,cfg.key);
  const {data:{session}}=await sb.auth.getSession();
  if(session){USER=session.user;await enterApp();}else{$('scr-login').classList.remove('hide');}
}
async function doLogin(){
  const email=$('lg-email').value.trim(), pass=$('lg-pass').value;
  if(!email||!pass)return;
  $('lg-btn').innerHTML='<span class="spin"></span> Entrando...';
  const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
  $('lg-btn').textContent='Iniciar sesión';
  if(error){$('login-err').textContent='Correo o contraseña incorrectos.';$('login-err').classList.remove('hide');return;}
  USER=data.user;$('scr-login').classList.add('hide');await enterApp();
}
async function doLogout(){await sb.auth.signOut();location.reload();}

async function enterApp(){
  $('scr-app').classList.remove('hide');
  $('user-chip').innerHTML=`<b>${esc(String(USER.email||'').split('@')[0])}</b>${esc(USER.email)}`;
  await cargaPermisos();          // define si es VIP (control interno salarial)
  pintarLogo();renderCrumbs();initSidebar();iaMostrarFab();
  const {data,error}=await sb.from('obras').select('*').order('orden');
  if(error){toast('Error al cargar obras: '+error.message,'err');return;}
  OBRAS=data;
  try{const guardada=localStorage.getItem('platinum_empresa_activa');if(EMPRESAS[guardada])EMPRESA_ACTIVA=guardada;}catch(e){}
  if(!obrasEmpresa().length&&OBRAS.length)EMPRESA_ACTIVA=empresaDeObra(OBRAS[0]);
  renderObraBar();
  await loadConfig();
  chequearVersion();
  setInterval(chequearVersionEnVivo,10*60*1000);
  await cargarContratistas();
  if($('btn-papelera'))$('btn-papelera').classList.toggle('hide',!esAdmin());
  if($('btn-edit-centro'))$('btn-edit-centro').classList.toggle('hide',!esAdmin());
  showNavStep('empresa');
  startRealtime();
}

/* ---------- tiempo real ---------- */
function startRealtime(){
  window.PLATINUM_ACTIVIDAD?.start();
  if(window._PLATINUM_RT)window._PLATINUM_RT.stop();
  if(!window.PLATINUM_SYNC){$('rt-status').textContent='Actualización manual';return;}
  window._PLATINUM_RT=window.PLATINUM_SYNC.connect({client:sb,userId:USER.id,window,document,
    getObraId:()=>OBRA?.id,
    canRefresh:()=>!NAV_BUSY&&!$('modals').innerHTML,
    refresh:()=>softRefresh(false),
    onDeferred:()=>{window._pendingRT=true;window.PLATINUM_FLOWS?.avisarCambio();window.PLATINUM_RRHH?.avisarCambio();window.PLATINUM_PAGOS_SABADO?.avisarCambio();},
    onStatus:({transport,dataState,online})=>{
      const el=$('rt-status');if(!el)return;
      el.textContent=dataState==='pending'?'Cambios pendientes':dataState==='error'?'Sin actualizar':dataState==='loading'?'Actualizando…':transport==='connected'?`${online||1} en línea`:transport==='offline'?'Sin conexión en vivo':'Conectando…';
      el.title=dataState==='pending'?'Hay cambios compartidos. Se actualizarán al cerrar la ventana; tu captura se conserva.':dataState==='error'?'No se pudo verificar la actualización. Se conserva la última lectura completa. Usa ↻ para reintentar.':'Los avisos en vivo no sustituyen la conciliación ni autorizan pagos.';
    }
  });
  window._RTCH=window._PLATINUM_RT.channel;
}
function rtQueue(){
  if(window._PLATINUM_RT){window._PLATINUM_RT.request();return;}
  clearTimeout(rtTimer);
  rtTimer=setTimeout(()=>{
    const own=Date.now()-lastLocalWrite<3000;
    if($('modals').innerHTML){window._pendingRT=true;return;}
    softRefresh(!own);
  },600);
}
async function softRefresh(notify=true){
  const actualId=OBRA?.id,step=NAV_STEP;
  try{
    const {data:ob,error}=await sb.from('obras').select('*').order('orden');
    if(error||!Array.isArray(ob))throw error||Error('Respuesta incompleta de centros');
    if(NAV_BUSY||OBRA?.id!==actualId||NAV_STEP!==step)return false;
    if(actualId&&!ob.some(o=>o.id===actualId))throw Error('El centro seleccionado ya no está disponible para esta sesión');
    OBRAS=ob;
    if(actualId)OBRA=OBRAS.find(o=>o.id===actualId);
    if(OBRA&&NAV_STEP==='trabajadores'){
      EMPRESA_ACTIVA=empresaDeObra(OBRA);
      const lectura={segundoPlano:true};
      if(!await loadObraData(actualId,lectura))return lectura.diferida?'pending':false;
    }
    renderObraBar();
    if(notify)toast('🔄 Información compartida actualizada.');
    return true;
  }catch(e){
    toast('No se pudo actualizar. Se conserva la última lectura completa: '+e.message,'err');
    return false;
  }
}
function actualizarDatosCompartidos(){
  if(NAV_BUSY){toast('Espera a que termine de abrir el centro.');return;}
  if($('modals').innerHTML){window._pendingRT=true;toast('Cierra la ventana actual para actualizar sin perder tu captura.');return;}
  if(window._PLATINUM_RT)window._PLATINUM_RT.request(true);
  else softRefresh(true);
}

/* ---------- obras ---------- */
let NAV_STEP='empresa',NAV_BUSY=false;
function showNavStep(step){
  if(NAV_BUSY)return;
  if(!['empresa','obra','trabajadores'].includes(step))return;
  if(step==='trabajadores'&&!OBRA)return;
  NAV_STEP=step;
  $('scr-app').setAttribute('data-nav',step);
  const fab=$('ia-fab');if(fab)fab.classList.toggle('nav-hidden',step!=='trabajadores');
  toggleSidebar(false);
  renderObraBar();
  const heading=document.querySelector(step==='empresa'?'#empresa-step h1':step==='obra'?'#obra-step h1':'#q');
  if(heading)heading.focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
}
function resetWorkerFilters(){
  ['q','f-estatus','flt-contratista','flt-puesto','f-periodo','f-semana'].forEach(id=>{if($(id))$(id).value='';});
  renderTable();
}
function renderEmpresaSelector(){
  const box=$('empresa-selector'),titulo=$('empresa-nombre');if(!box)return;
  const actual=EMPRESAS[EMPRESA_ACTIVA]||EMPRESAS.PLATINUM;
  if(titulo)titulo.textContent=actual.nombre;
  box.innerHTML=Object.values(EMPRESAS).filter(e=>obrasEmpresa(e.codigo).length||esVip()).map(e=>{
    const centros=obrasEmpresa(e.codigo).length;
    return `<button class="empresa-btn" onclick="selectEmpresa('${e.codigo}')">
      <span class="empresa-mark"><img src="${logoEmpresa(e.codigo)}" alt="Logo ${esc(e.corto)}"></span><span class="empresa-copy"><b>${esc(e.corto)}</b><small>${esc(e.nombre)}</small></span><span class="empresa-count">${centros} centro${centros===1?'':'s'}</span>
    </button>`;
  }).join('');
  pintarLogo(EMPRESA_ACTIVA);
}
function renderCentroMeta(){
  const el=$('centro-meta');if(!el)return;
  if(!OBRA||empresaDeObra(OBRA)!==EMPRESA_ACTIVA){el.innerHTML='';return;}
  const siroc=OBRA.tipo==='OFICINA'?'No aplica':(OBRA.registro_siroc||'Sin capturar');
  el.innerHTML=`<span class="centro-tipo">${esc(OBRA.tipo||'OBRA')}</span><span><b>${esc(OBRA.nombre)}</b></span>
    <span>Registro patronal: <b>${esc(OBRA.registro_patronal||'Sin capturar')}</b></span>
    <span>SIROC: <b>${esc(siroc)}</b></span>${OBRA.ubicacion?`<span class="meta-ubic">Ubicación: <b>${esc(OBRA.ubicacion)}</b></span>`:''}`;
}
function renderObraBar(){
  renderEmpresaSelector();
  const obras=obrasEmpresa();
  $('obra-bar').innerHTML=(esAdmin()?`<button class="obra-tab" style="color:var(--gold)" onclick="openNuevaObra()" title="Agregar centro a ${esc(EMPRESAS[EMPRESA_ACTIVA].corto)}">➕ Centro</button>`:'')+obras.map(o=>`
    <button class="obra-tab ${OBRA&&o.id===OBRA.id?'on':''}" ${NAV_BUSY?'disabled':''} onclick="selectObra('${o.id}')">
      ${o.tipo==='OFICINA'?'🏢':'🏗'} ${esc(o.nombre)} <span class="cnt" id="cnt-${o.id}"></span>
      <small>Registro patronal: ${esc(o.registro_patronal||'Sin capturar')}${o.tipo!=='OFICINA'?' · SIROC: '+esc(o.registro_siroc||'Sin capturar'):''}</small>
    </button>`).join('');
  renderCentroMeta();
  refreshCounts();
  renderCrumbs();
}
async function refreshCounts(){
  const obras=obrasEmpresa(),ids=obras.map(o=>o.id);if(!ids.length)return;
  const {data}=await fetchAllRows(()=>sb.from('trabajadores').select('obra_id,estatus').in('obra_id',ids).eq('eliminado',false));
  if(!data)return;
  obras.forEach(o=>{const el=$('cnt-'+o.id);if(el)el.textContent=data.filter(w=>w.obra_id===o.id&&w.estatus==='ACTIVO').length;});
}
/* v.3: editar / eliminar obra — SOLO administrador. Editar incluye el TIPO de
   centro de trabajo (OBRA u OFICINA); las OFICINAS no usan SIROC. Eliminar pasa
   por doble filtro: (1) solo admin, (2) confirma su CONTRASEÑA real, y solo si
   la obra está VACÍA (sin trabajadores ni cheques). En la base, además, el
   Script 43 restringe el DELETE de obras al correo del administrador (RLS). */
function openEditObra(id){
  if(!esAdmin()){toast('Solo el administrador puede editar obras.','err');return;}
  const o=OBRAS.find(x=>x.id===id); if(!o)return;
  modal(`
    <div class="m-head"><h2>✎ Editar centro de trabajo</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="c2" style="grid-column:span 2"><label>Nombre *</label><input id="eo-nombre" value="${esc(o.nombre||'')}"></div>
        <div class="c2" style="grid-column:span 2"><label>Ubicación (aparece en la requisición)</label><input id="eo-ubic" value="${esc(o.ubicacion||'')}"></div>
        <div><label>Empresa propietaria</label><select id="eo-empresa">${Object.values(EMPRESAS).map(e=>`<option value="${e.codigo}" ${empresaDeObra(o)===e.codigo?'selected':''}>${esc(e.nombre)}</option>`).join('')}</select></div>
        <div><label>Tipo de centro de trabajo</label><select id="eo-tipo" onchange="eoTipoUI()">
          <option value="OBRA" ${((o.tipo||'OBRA')==='OBRA')?'selected':''}>OBRA</option>
          <option value="OFICINA" ${o.tipo==='OFICINA'?'selected':''}>OFICINA</option></select></div>
        <div><label>Fecha de inicio (AAAA-MM-DD)</label><input id="eo-fi" value="${esc((o.fecha_inicio||'').slice(0,10))}" placeholder="2026-03-30"></div>
        <div><label>Registro patronal IMSS</label><input id="eo-rp" value="${esc(o.registro_patronal||'')}"></div>
        <div><label>Prima de riesgo (%)</label><input id="eo-prima" type="number" step="0.00001" value="${o.prima_rt??''}" placeholder="7.58875"></div>
        <div class="c2" style="grid-column:span 2" id="eo-siroc-wrap"><label>Registro SIROC</label><input id="eo-siroc" value="${esc(o.registro_siroc||'')}"><div class="fhint" id="eo-siroc-hint"></div></div>
      </div>
    </div>
    <div class="m-foot">
      <button class="btn danger" style="background:#7a1414;border-color:#7a1414;margin-right:auto" onclick="askDeleteObra('${o.id}')">🗑 Eliminar obra</button>
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="saveEditObra('${o.id}')">💾 Guardar cambios</button>
    </div>`,'md');
  eoTipoUI();
}
function eoTipoUI(){
  const ofi=$('eo-tipo').value==='OFICINA';
  $('eo-siroc').disabled=ofi;
  if(ofi){$('eo-siroc').value='';}
  $('eo-siroc-wrap').style.opacity=ofi?'.5':'1';
  $('eo-siroc-hint').textContent=ofi?'Las oficinas no usan SIROC (se deja vacío).':'Registro de obra ante el IMSS (SIROC).';
}
async function saveEditObra(id){
  if(!esAdmin()){toast('Solo el administrador puede editar obras.','err');return;}
  const o=OBRAS.find(x=>x.id===id); if(!o)return;
  const n=$('eo-nombre').value.trim(); if(!n){toast('Ponle nombre a la obra.','err');return;}
  const fi=$('eo-fi').value.trim();
  if(fi&&!/^\d{4}-\d{2}-\d{2}$/.test(fi)){toast('Fecha de inicio inválida: usa AAAA-MM-DD.','err');return;}
  const tipo=$('eo-tipo').value;
  const upd={
    nombre:n.toUpperCase(), ubicacion:$('eo-ubic').value.trim().toUpperCase(),
    empresa_codigo:$('eo-empresa').value, tipo, fecha_inicio:fi||null,
    registro_patronal:$('eo-rp').value.trim().toUpperCase(),
    prima_rt:$('eo-prima').value!==''?parseFloat($('eo-prima').value):null,
    // las oficinas no usan SIROC: se guarda vacío
    registro_siroc:tipo==='OFICINA'?null:$('eo-siroc').value.trim().toUpperCase()
  };
  markWrite();
  const {error}=await sb.from('obras').update(upd).eq('id',id);
  if(error){toast('No se pudo actualizar la obra: '+error.message,'err');return;}
  Object.assign(o,upd); if(OBRA&&OBRA.id===id)Object.assign(OBRA,upd);
  if(OBRA&&OBRA.id===id){
    EMPRESA_ACTIVA=upd.empresa_codigo;
    try{localStorage.setItem('platinum_empresa_activa',EMPRESA_ACTIVA);localStorage.setItem('platinum_obra_'+EMPRESA_ACTIVA,id);}catch(e){}
  }
  closeModal(); renderObraBar(); toast('Centro de trabajo actualizado.','ok');
}
async function askDeleteObra(id){
  if(!esAdmin()){toast('Solo el administrador puede eliminar obras.','err');return;}
  const o=OBRAS.find(x=>x.id===id); if(!o)return;
  // filtro 1: la obra debe estar VACÍA (sin trabajadores ni cheques)
  const [{count:nt},{count:nc}]=await Promise.all([
    sb.from('trabajadores').select('id',{count:'exact',head:true}).eq('obra_id',id),
    sb.from('cheques').select('id',{count:'exact',head:true}).eq('obra_id',id)
  ]);
  if((nt||0)>0||(nc||0)>0){
    modal(`<div class="m-head"><h2>🗑 No se puede eliminar</h2><button class="x" onclick="closeModal()">×</button></div>
      <div class="m-body"><div style="background:var(--amber-bg);border-radius:8px;padding:12px 14px;line-height:1.6">
      La obra <b>${esc(o.nombre)}</b> tiene <b>${nt||0} trabajador(es)</b> y <b>${nc||0} cheque(s)</b> asociados.<br>
      Por seguridad, solo se puede eliminar una obra <b>vacía</b>. Primero <b>transfiere</b> a su gente a otra obra (⚙ Más → Transferir) y luego intenta de nuevo.</div></div>
      <div class="m-foot"><button class="btn" onclick="closeModal()">Entendido</button></div>`,'md');
    return;
  }
  // filtro 2: confirmar con la CONTRASEÑA real del administrador
  modal(`
    <div class="m-head"><h2>🗑 Eliminar obra · ${esc(o.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="background:var(--red-bg,#fdecec);border-radius:8px;padding:11px 13px;margin-bottom:12px;line-height:1.6">
        Vas a <b>eliminar definitivamente</b> el centro de trabajo <b>${esc(o.nombre)}</b>. Esta acción <b>no se puede deshacer</b>. La obra está vacía, así que no afecta a ningún trabajador.
      </div>
      <label>Confirma tu contraseña de administrador (${esc(USER.email)})</label>
      <input id="del-obra-pass" type="password" autocomplete="off" placeholder="contraseña" style="width:100%">
      <div id="del-obra-msg" style="font-size:12px;color:var(--red);margin-top:6px"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn danger" style="background:#7a1414;border-color:#7a1414" id="del-obra-btn" onclick="execDeleteObra('${id}')">🗑 Eliminar definitivamente</button>
    </div>`,'md');
}
async function execDeleteObra(id){
  const o=OBRAS.find(x=>x.id===id); if(!o)return;
  const pass=($('del-obra-pass')&&$('del-obra-pass').value)||'';
  if(!pass){$('del-obra-msg').textContent='Escribe tu contraseña.';return;}
  $('del-obra-btn').innerHTML='<span class="spin"></span> Verificando...';
  // verifica la contraseña REAL contra Supabase (mismo usuario)
  const {error:ae}=await sb.auth.signInWithPassword({email:USER.email,password:pass});
  if(ae){$('del-obra-btn').innerHTML='🗑 Eliminar definitivamente';$('del-obra-msg').textContent='Contraseña incorrecta. No se eliminó nada.';return;}
  markWrite();
  const {error}=await sb.from('obras').delete().eq('id',id);
  if(error){
    $('del-obra-btn').innerHTML='🗑 Eliminar definitivamente';
    $('del-obra-msg').textContent=/permission|policy|row-level|denied/i.test(error.message)
      ?'La base rechazó el borrado. ¿Corriste el Script 43 (permiso de eliminar obras solo para el admin)?'
      :'No se pudo eliminar: '+error.message;
    return;
  }
  closeModal();
  const {data}=await sb.from('obras').select('*').order('orden');
  OBRAS=data||OBRAS.filter(x=>x.id!==id);
  if(OBRA&&OBRA.id===id)OBRA=obrasEmpresa()[0]||OBRAS[0]||null;
  if(OBRA)EMPRESA_ACTIVA=empresaDeObra(OBRA);
  renderObraBar(); if(OBRA)selectObra(OBRA.id);
  toast(`Obra "${o.nombre}" eliminada.`,'ok');
}
async function selectObra(id){
  if(NAV_BUSY)return;
  const nueva=OBRAS.find(o=>o.id===id);if(!nueva)return;
  const anterior=OBRA,empresaAnterior=EMPRESA_ACTIVA;
  NAV_BUSY=true;
  OBRA=nueva;EMPRESA_ACTIVA=empresaDeObra(nueva);
  renderObraBar();
  $('nav-loading').classList.remove('hide');
  try{
    const loaded=await loadObraData(id,{vista:'trab'});
    if(loaded===false){OBRA=anterior;EMPRESA_ACTIVA=empresaAnterior;repintarInstantaneaObra();return;}
    if(!anterior||anterior.id!==id)resetWorkerFilters();
    try{localStorage.setItem('platinum_empresa_activa',EMPRESA_ACTIVA);localStorage.setItem('platinum_obra_'+EMPRESA_ACTIVA,id);}catch(e){}
    NAV_BUSY=false;
    setView('trab');
  }catch(e){OBRA=anterior;EMPRESA_ACTIVA=empresaAnterior;repintarInstantaneaObra();toast('No se pudo abrir el centro: '+e.message,'err');}
  finally{NAV_BUSY=false;$('nav-loading').classList.add('hide');renderObraBar();if(typeof window!=='undefined'&&window._PLATINUM_RT)window._PLATINUM_RT.resume();}
}
async function selectEmpresa(codigo){
  if(NAV_BUSY)return;
  if(!EMPRESAS[codigo])return;
  const disponibles=obrasEmpresa(codigo);
  if(!disponibles.length){toast('Esta empresa todavía no tiene centros de trabajo.','err');return;}
  EMPRESA_ACTIVA=codigo;
  try{localStorage.setItem('platinum_empresa_activa',codigo);}catch(e){}
  showNavStep('obra');
}
let OBRA_CARGA_SECUENCIA=0,OBRA_DATOS_ID=null;
/* Todos los datos siguen completos y sincronizados. Sólo se construye el DOM
   de la herramienta visible; las demás se pintan al abrirlas. */
function pintarVistaObra(vista){
  switch(vista||(typeof VIEW==='undefined'?'trab':VIEW)){
    case 'trab':renderTable();break;
    case 'chq':renderChqStats();renderCheques();break;
    case 'pagos':if(typeof window!=='undefined'&&window.PLATINUM_VISOR_PAGOS&&$('visor-pagos')){window.PLATINUM_VISOR_PAGOS.mostrar();if($('pagos-legado')?.open)renderPagosView();}else renderPagosView();break;
    case 'vac':renderVacViews();break;
    case 'actas':renderActasView();break;
    case 'nom':renderNomView();break;
    case 'anual':renderAnualView();break;
  }
}
/* Una instantánea completa por centro. Un fallo de consulta nunca significa
   que no existan pagos, cheques o documentos. No mezclar respuestas atrasadas. */
function repintarInstantaneaObra(){
  if(!OBRA||OBRA_DATOS_ID!==OBRA.id)return;
  pintarVistaObra();
}
function falloLecturaObra(id,mensaje){
  if(!OBRA||OBRA.id!==id)return false;
  toast(mensaje,'err');
  // En una actualización del mismo centro el DOM anterior nunca se retiró.
  if(OBRA_DATOS_ID!==id)for(const [el,cols] of [['tbody',6],['chq-tbody',10],['pg-v-tbody',9]]){
    const nodo=$(el);if(nodo)nodo.innerHTML=`<tr><td colspan="${cols}"><div class="empty">No se pudo verificar la información de este centro. Reintenta la carga; esto no indica ausencia de trabajadores ni de pagos.</div></td></tr>`;
  }
  return false;
}
async function loadObraData(id,opciones={}){
  const secuencia=++OBRA_CARGA_SECUENCIA;
  const vigente=()=>secuencia===OBRA_CARGA_SECUENCIA&&OBRA&&OBRA.id===id;
  if(!vigente())return false;
  const conservarVista=OBRA_DATOS_ID===id;
  // Sólo al entrar por primera vez o cambiar de centro: nunca borrar la lista
  // verificada del mismo centro por una señal en vivo, foco o actualización.
  if(!conservarVista){
    skeletonTabla('tbody',6,6,'Cargando trabajadores...');
    skeletonTabla('chq-tbody',6,10,'Cargando cheques...');
    skeletonTabla('pg-v-tbody',5,9,'Cargando pagos...');
  }
  let lecturas;
  try{lecturas=await Promise.all([
    fetchAllRows(()=>sb.from('trabajadores').select('*').eq('obra_id',id).eq('eliminado',false)),
    fetchAllRows(()=>sb.from('cheques').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('descuentos').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('documentos').select('*').eq('obra_id',id).eq('anulado',false)),
    fetchAllRows(()=>sb.from('vacaciones').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('actas').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('nom035').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('pagos').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('prima_pagos').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('cuadrillas').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('diferenciales').select('*').eq('obra_id',id).eq('activo',true)),
    fetchAllRows(()=>sb.from('bloques_cheques').select('*').eq('obra_id',id)),
    /* Si el usuario NO es VIP, la política de la base devuelve cero filas: la
       cifra no llega al navegador, no es que se esconda con CSS. */
    fetchAllRows(()=>sb.from('sueldos_internos').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('control_cierres_nomina').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('control_conciliacion_noi').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('control_altas_bajas_cortas').select('id,trabajador_id,anio,semana,estado_servicio').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('control_finiquitos_transferencia').select('*').eq('obra_id',id))
  ]);}catch(e){return vigente()?falloLecturaObra(id,'No se pudo actualizar el centro: '+e.message):false;}
  if(!vigente())return false;
  const fuentes=['trabajadores','cheques','incidencias y retenciones','documentos','vacaciones','actas','NOM-035','pagos','primas','cuadrillas','diferenciales','bloques de cheques','control interno autorizado','cierres de nómina','conciliación NOI','altas y bajas sin servicio','finiquitos por transferencia'];
  const fallo=lecturas.findIndex(r=>r?.error||!Array.isArray(r?.data));
  if(fallo>=0)return falloLecturaObra(id,`No se pudieron verificar ${fuentes[fallo]}: ${lecturas[fallo]?.error?.message||'respuesta incompleta'}. No se sustituyeron los datos por listas vacías.`);
  const [{data:tw},{data:ch},{data:ds},{data:dx},{data:vc},{data:ac},{data:nm},{data:pg},{data:pr},{data:cd},{data:df},{data:bq},{data:si},{data:cc},{data:cn},{data:ab},{data:ft}]=lecturas;
  // El expediente pertenece al trabajador, incluso si el acuse se archivó
  // antes de un cambio de centro. Consulta dirigida y paginada; respeta RLS.
  let acuses;
  try{acuses=await cargarAcusesTrabajadores(tw);}catch(e){return vigente()?falloLecturaObra(id,'No se pudieron verificar los acuses IMSS: '+e.message):false;}
  if(!vigente())return false;
  if(acuses?.error||!Array.isArray(acuses?.data))return falloLecturaObra(id,'No se pudieron verificar los acuses IMSS: '+(acuses?.error?.message||'respuesta incompleta'));
  if(opciones.segundoPlano&&typeof window!=='undefined'&&$('modals')?.innerHTML){window._pendingRT=true;opciones.diferida=true;return false;}
  const padronAnterior=conservarVista?JSON.stringify([WORKERS,DOCSX.filter(d=>String(d.categoria||'').trim().toUpperCase()==='ACUSE_IMSS'),ALTAS_CORTAS]):null;
  WORKERS=tw;CHEQUES=ch.filter(c=>!c.eliminado);DESC=ds;DOCSX=dx.filter(d=>String(d.categoria||'').trim().toUpperCase()!=='ACUSE_IMSS').concat(acuses.data);VAC=vc;ACTAS=ac;NOM=nm;PAGOS=pg;PRIMAS=pr.filter(p=>p.activo!==false);CUADS=cd;DIFS=df;BLOQUES=bq;SUELDOSINT=si;CIERRES=cc;CTRLNOI=cn;ALTAS_CORTAS=ab;FINTRANS=ft;
  OBRA_DATOS_ID=id;
  await activarProgramados();
  if(!vigente())return false;
  const padronCambio=!conservarVista||!opciones.segundoPlano||padronAnterior!==JSON.stringify([WORKERS,acuses.data,ALTAS_CORTAS]);
  const cs=[...new Set(WORKERS.map(w=>w.contratista).filter(Boolean))].sort();
  const cur=$('flt-contratista').value;
  $('flt-contratista').innerHTML='<option value="">Contratista: todos</option>'+cs.map(c=>`<option ${c===cur?'selected':''}>${esc(c)}</option>`).join('');
  const sems=[...new Set(WORKERS.map(w=>w.semana_ingreso).filter(Boolean))]
    .sort((a,b)=>(parseInt(String(a).replace(/\D/g,''))||0)-(parseInt(String(b).replace(/\D/g,''))||0));
  const curS=$('f-semana').value;
  $('f-semana').innerHTML='<option value="">Ingreso: todas</option>'+sems.map(s=>`<option ${s===curS?'selected':''}>${esc(s)}</option>`).join('');
  const pus=[...new Set(WORKERS.map(w=>w.puesto).filter(Boolean))].sort();
  const curP=$('flt-puesto')?$('flt-puesto').value:'';
  if($('flt-puesto'))$('flt-puesto').innerHTML='<option value="">Puesto: todos</option>'+pus.map(s=>`<option ${s===curP?'selected':''}>${esc(s)}</option>`).join('');
  const vistaActual=opciones.vista||(typeof VIEW==='undefined'?'trab':VIEW);
  if(padronCambio||vistaActual!=='trab'){
    const scrollLista=typeof document!=='undefined'?document.querySelector('.worker-list'):null;
    const scrollAnterior=scrollLista?{top:scrollLista.scrollTop,left:scrollLista.scrollLeft}:null;
    if(vistaActual!=='trab')renderStats();pintarVistaObra(vistaActual);
    if(conservarVista&&scrollLista&&scrollAnterior){scrollLista.scrollTop=scrollAnterior.top;scrollLista.scrollLeft=scrollAnterior.left;}
  }
  await sincronizarContratistas();
  if(!vigente())return false;
  // el estado del recálculo automático del INFONAVIT (Script 63): la
  // campanita solo avisa si el bimestre en curso NO se ha aplicado
  await cargarRecalcInfonavit();
  if(!vigente())return false;
  updateAlertas();
  globalThis.PLATINUM_PAGOS_SABADO?.avisarDesdeContexto();
  return true;
}
let CFGEMP={};
async function loadConfig(){
  try{const {data}=await sb.from('config').select('*');(data||[]).forEach(c=>CFGEMP[c.clave]=c.valor);}catch(e){}
}

/* ---------- v28: aviso de nueva versión disponible ----------
   Cada vez que se publique una actualización del archivo, se sube el HTML
   nuevo a Storage Y se sube la versión en `config.app_version` (Script 30).
   Cualquier copia abierta (aunque esté cacheada por el navegador o sea un
   archivo local viejo que alguien no borró) compara su propio APP_VERSION
   contra el de la base de datos — que siempre está al día — y si no
   coinciden, muestra un aviso para recargar. No requiere que nadie refresque
   "porque sí": el aviso solo aparece cuando de verdad hay algo más nuevo. */
const APP_VERSION='2026-10-23.3';
window.__PLATINUM_REQUIERE_FLUJO=true;
let _verIgnorada=null; // "Después" silencia esa versión durante la sesión
function chequearVersion(){
  const remota=(CFGEMP['app_version']||{}).v;
  // solo avisa si la versión anunciada es MÁS NUEVA que la de este archivo
  // (el formato AAAA-MM-DD.N permite compararlas como texto). Antes se
  // comparaba "diferente", y si config y archivo quedaban desfasados el
  // aviso salía en bucle aunque ya tuvieras la última versión.
  if(remota && remota>APP_VERSION && remota!==_verIgnorada) mostrarBannerActualizacion(remota);
}
function mostrarBannerActualizacion(remota){
  if($('banner-update'))return;
  const b=document.createElement('div');
  b.id='banner-update';
  b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#14213D;color:#fff;padding:10px 16px;text-align:center;font:600 13px Calibri,Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3);display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap';
  b.innerHTML=`<span>🔄 Hay una nueva versión de la base disponible.</span>
    <button style="background:#c9a227;color:#14213D;border:none;border-radius:6px;padding:6px 16px;font-weight:800;cursor:pointer;font-size:13px">Actualizar ahora</button>
    <button style="background:transparent;color:#cbd5e1;border:1px solid #3a4a6b;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px">Después</button>`;
  const btns=b.querySelectorAll('button');
  btns[0].onclick=()=>{location.href=location.pathname+'?v='+Date.now();};
  btns[1].onclick=()=>{_verIgnorada=remota;b.remove();};
  document.body.prepend(b);
}
async function chequearVersionEnVivo(){
  try{
    const {data}=await sb.from('config').select('valor').eq('clave','app_version').maybeSingle();
    if(data)CFGEMP['app_version']=data.valor;
    chequearVersion();
  }catch(e){/* silencioso: si falla la verificación, nunca interrumpe el trabajo normal */}
}
/* ============================================================
   v36 · NAVEGACIÓN: vistas + migas de pan (breadcrumbs)
   ============================================================ */
const VISTAS={
  trab :{ic:'👷',txt:'Trabajadores'},
  chq  :{ic:'🧾',txt:'Cheques'},
  pagos:{ic:'💸',txt:'Visor semanal de pagos'},
  vac  :{ic:'🌴',txt:'Vacaciones y permisos'},
  actas:{ic:'📋',txt:'Actas'},
  nom  :{ic:'🧠',txt:'NOM-035'},
  anual:{ic:'🪙',txt:'PTU / Aguinaldo'},
  audit:{ic:'🔎',txt:'Auditoría de pagos'},
  papeles:{ic:'📂',txt:'Control de papeles'}
};
function setView(v){
  if(!OBRA||NAV_STEP!=='trabajadores'&&empresaDeObra(OBRA)!==EMPRESA_ACTIVA){showNavStep('obra');return;}
  NAV_STEP='trabajadores';$('scr-app').setAttribute('data-nav',NAV_STEP);
  if($('ia-fab'))$('ia-fab').classList.remove('nav-hidden');
  if(!VISTAS[v])v='trab';
  VIEW=v;
  Object.keys(VISTAS).forEach(k=>{
    const b=$('vb-'+k),d=$('view-'+k);
    if(b)b.classList.toggle('on',v===k);
    if(d)d.classList.toggle('hide',v!==k);
  });
  pintarVistaObra(v);
  if(v==='audit')auCargar();
  if(v==='papeles')cpCargar();
  renderCrumbs();
  toggleSidebar(false);
  window.scrollTo({top:0,behavior:'smooth'});
}
/* Migas de pan: siempre se ve dónde está uno parado */
function renderCrumbs(){
  const c=$('crumbs'); if(!c)return;
  const v=VISTAS[VIEW]||VISTAS.trab;
  const obra=(OBRA&&OBRA.nombre)||'—';
  const empresa=(EMPRESAS[EMPRESA_ACTIVA]||EMPRESAS.PLATINUM).corto;
  if(NAV_STEP!=='trabajadores'){
    c.innerHTML=`<span class="c-i"><a href="#" onclick="showNavStep('empresa');return false">🏢 Empresas</a></span>${NAV_STEP==='obra'?`<span class="sep">›</span><span class="c-i cur">${esc(empresa)} · Centros de trabajo</span>`:''}`;
    return;
  }
  c.innerHTML=`
    <span class="c-i hide-sm"><a href="#" onclick="showNavStep('empresa');return false" title="Inicio">🏠 Inicio</a></span>
    <span class="sep hide-sm">›</span>
    <span class="c-i hide-sm"><a href="#" onclick="showNavStep('empresa');return false" title="Cambiar de empresa">🏢 ${esc(empresa)}</a></span>
    <span class="sep hide-sm">›</span>
    <span class="c-i"><a href="#" onclick="showNavStep('obra');return false" title="Cambiar de obra">🏗 ${esc(obra)}</a></span>
    <span class="sep">›</span>
    <span class="c-i cur">${v.ic} ${esc(v.txt)}</span>`;
}
