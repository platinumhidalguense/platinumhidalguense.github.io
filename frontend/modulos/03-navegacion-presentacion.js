/* ============================================================
   v36.1 · PANEL LATERAL PLEGABLE
   En CELULAR/TABLET (≤1024px) es un cajón que entra por la izquierda con
   fondo oscurecido. En ESCRITORIO se pliega y despliega con el mismo botón
   ☰ de la barra superior, y el contenido se estira a todo el ancho.
   El estado de escritorio se recuerda en este navegador.
   ============================================================ */
const esPantallaChica=()=>window.matchMedia('(max-width:1024px)').matches;
function sidebarVisible(){
  const app=$('scr-app'),sb=$('sidebar');
  if(!app||!sb)return false;
  return sb.classList.contains('open');
}
function toggleSidebar(forzar){
  const app=$('scr-app'),sb=$('sidebar'),sc=$('sb-scrim'),b=$('burger');
  if(!sb||!app)return;
  const abrir=(forzar===undefined)?!sidebarVisible():!!forzar;
  sb.classList.toggle('open',abrir);
  if(sc)sc.classList.toggle('on',abrir);
  app.classList.toggle('sb-oculto',!abrir);
  if(b){b.title=abrir?'Ocultar el menú':'Mostrar el menú';b.setAttribute('aria-expanded',abrir?'true':'false');}
}
/* Al entrar se respeta cómo lo dejó el usuario la última vez */
function initSidebar(){
  const app=$('scr-app'); if(!app)return;
  toggleSidebar(false);
  const b=$('burger');
  if(b){const v=sidebarVisible();b.title=v?'Ocultar el menú':'Mostrar el menú';b.setAttribute('aria-expanded',v?'true':'false');}
}
/* Cierra SOLO el cajón de celular (en escritorio no debe plegarse al navegar) */
function cerrarCajonMovil(){if(esPantallaChica())toggleSidebar(false);}
/* Ejecuta una acción del panel y cierra el cajón (celular) */
function sbGo(fn){
  if(NAV_STEP!=='trabajadores'||!OBRA){showNavStep('obra');return;}
  toggleSidebar(false);
  try{fn();}catch(e){toast('No se pudo abrir: '+e.message,'err');}
}
/* Esc cierra primero el cajón; si no está abierto, cierra el modal de encima */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const sb=$('sidebar');
  if(sidebarVisible()){toggleSidebar(false);$('burger').focus();return;}
  if($('modals')&&$('modals').querySelector('.overlay'))closeModal2();
});

/* ============================================================
   v36 · TEMA CLARO / OSCURO
   Se guarda la preferencia por navegador; si nunca se ha elegido,
   se respeta la del sistema operativo.
   ============================================================ */
function temaGuardado(){try{return localStorage.getItem('platinum_tema')||'';}catch(e){return '';}}
function temaEfectivo(){
  const t=temaGuardado();
  if(t==='dark'||t==='light')return t;
  return (window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light';
}
function aplicarTema(t){
  if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);
  else document.documentElement.removeAttribute('data-theme');
  const b=$('theme-btn');
  if(b){const osc=temaEfectivo()==='dark';b.textContent=osc?'☀️':'🌙';
    b.title=osc?'Cambiar a tema claro':'Cambiar a tema oscuro';}
}
function toggleTema(){
  const nuevo=temaEfectivo()==='dark'?'light':'dark';
  try{localStorage.setItem('platinum_tema',nuevo);}catch(e){}
  aplicarTema(nuevo);
}
/* ---------- LOGO CORPORATIVO ----------
   Monograma PH + placa PLATINUM en SVG: fondo transparente, se funde con
   el panel en claro y en oscuro (sin recuadro gris pegado) y se ve nítido
   en cualquier pantalla. Si se prefiere el archivo original, pega su
   data-URI en LOGO_PLATINUM_IMG y se usará ese, mezclado con
   mix-blend-mode (multiply en claro / screen en oscuro) para integrarlo. */
const LOGO_PLATINUM_IMG='data:image/jpeg;base64,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6dGPpCP8aAJR8BvFZz/o0Y+riuN8ReH7zwxqklhfoqXEYBIU54NdaPjt4vUHN/GeO8I6/nXI+IfEV74p1N7/AFCRZbpgAzKu3gdKAM2iiigAooooAKKKKACiiigAooooARqKGooAWiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigArtvgx/yUrRvrJ/6LauJrtvgx/yUrRvrJ/6LagDjrr/AI+pv99v51FUt1/x9Tf77fzqKgAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooARqKGooAWiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigArtvgx/yUrRvrJ/6LauJrtvgx/yUrRvrJ/6LagDjrr/j6m/32/nUVS3X/H1N/vt/OoqACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigBGooaigBaKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACu2+DH/JStH+sn/otq4mui+H2vweF/F9hqlyGaCAuWC9eUI/rQBhXJ/wBJmz/fb+dRU+VxJNI4BAdiwB7ZNMoAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAEaihqKAFooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKCM0UUAKST169aSiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooARqKKKAP//Z';
const LOGO_PLATINUM_SVG=`
<svg class="logo-mark" viewBox="0 0 454 280" role="img" aria-label="PLATINUM">
  <g class="ink">
    <!-- filete vertical que parte el monograma -->
    <rect x="224" y="10" width="5" height="260"/>
    <!-- P (serif tipo Didone: asta recta, ojal arriba, patines marcados) -->
    <rect x="100" y="26"  width="70" height="14"/>
    <rect x="94"  y="240" width="82" height="14"/>
    <rect x="120" y="26"  width="30" height="228"/>
    <path d="M150 40h26a45 45 0 0 1 0 90h-26z"/>
    <!-- H (el travesaño queda detrás de la placa, igual que en el logo original) -->
    <rect x="240" y="26"  width="68" height="14"/>
    <rect x="332" y="26"  width="68" height="14"/>
    <rect x="240" y="240" width="68" height="14"/>
    <rect x="332" y="240" width="68" height="14"/>
    <rect x="260" y="26"  width="28" height="228"/>
    <rect x="352" y="26"  width="28" height="228"/>
    <rect x="288" y="128" width="64" height="24"/>
  </g>
  <!-- placa PLATINUM cruzando el monograma, como en el logo original -->
  <rect class="bar" x="52" y="126" width="350" height="50"/>
  <text class="bar-txt" x="227" y="161" text-anchor="middle"
        font-family="Montserrat,Segoe UI,Arial,sans-serif" font-size="31" font-weight="600" letter-spacing="8">PLATINUM</text>
</svg>`;
function logoEmpresa(codigo=EMPRESA_ACTIVA){
  return codigo==='JIRE'?LOGO_JIRE:LOGO_PLATINUM_IMG;
}
function razonSocialEmpresa(codigo=EMPRESA_ACTIVA){
  const base=EMPRESAS[codigo]||EMPRESAS.PLATINUM;
  return (CFGEMP['empresa_'+codigo]||{}).razon||base.nombre;
}
function pintarLogo(codigo=EMPRESA_ACTIVA){
  const el=$('sb-logo'); if(!el)return;
  const jire=codigo==='JIRE';
  el.innerHTML=jire
    ? `<img class="logo-img" src="${LOGO_JIRE}" alt="Grupo Comercial JIRE">`
    : (LOGO_PLATINUM_IMG?`<img class="logo-img" src="${LOGO_PLATINUM_IMG}" alt="PLATINUM">`:LOGO_PLATINUM_SVG);
  const nombre=$('sb-company');if(nombre)nombre.textContent=razonSocialEmpresa(codigo);
}

/* ============================================================
   v36 · ESQUELETOS DE CARGA (en lugar de spinners genéricos)
   ============================================================ */
function skeletonRows(n=6,cols='26px 1.6fr 1.6fr .8fr',nota=''){
  const anchos=['70%','92%','55%','80%','64%','88%'];
  let h=nota?`<div class="skel-note"><span class="spin" style="border-color:rgba(127,127,127,.35);border-top-color:var(--navy)"></span>${esc(nota)}</div>`:'';
  for(let i=0;i<n;i++){
    h+=`<div class="skel-row" style="grid-template-columns:${cols}">`+
      cols.split(' ').map((_,c)=>`<div class="skel" style="width:${anchos[(i+c)%anchos.length]};height:${c===0?'13px':'12px'}"></div>`).join('')+
      `</div>`;
  }
  return h;
}
function skeletonTabla(el,filas=8,cols=9,nota='Cargando...'){
  const t=$(el); if(!t)return;
  t.innerHTML=`<tr><td colspan="${cols}" style="padding:0">${skeletonRows(filas,new Array(cols).fill('1fr').join(' '),nota)}</td></tr>`;
}

