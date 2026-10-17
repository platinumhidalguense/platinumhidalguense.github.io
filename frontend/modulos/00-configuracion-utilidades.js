
/* ================== CONFIGURACIÓN ================== */
const CONFIG_URL = "";
const CONFIG_KEY = "";
/* =================================================== */

const DOCS = ["SOLICITUD DE EMPLEO","INE","CONSTANCIA DE SITUACION (RFC)","NSS (documento)","ACTA DE NACIMIENTO","CURP (documento)","COMPROBANTE DE DOMICILIO"];
const BANCOS = {"012":"BBVA","127":"AZTECA","002":"BANAMEX","014":"SANTANDER","072":"BANORTE","021":"HSBC","137":"BANCOPPEL","030":"BAJIO","036":"INBURSA","058":"BANREGIO","044":"SCOTIABANK","646":"STP","722":"MERCADO PAGO","638":"NU MEXICO","661":"KLAR","166":"BANCO DEL BIENESTAR"};
const RX = {curp:/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/, rfc:/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}$/, nss:/^\d{11}$/, clabe:/^\d{18}$/, cp:/^\d{5}$/, tel:/^\d{10}$/, mail:/^[^\s@]+@[^\s@]+\.[^\s@]+$/};
const EMPRESAS=Object.freeze({
  PLATINUM:{codigo:'PLATINUM',corto:'PLATINUM',nombre:'Comercializadora PLATINUM Hidalguense',marca:'P'},
  JIRE:{codigo:'JIRE',corto:'Grupo JIRE',nombre:'Grupo Comercial JIRE S.A. de C.V.',marca:'J'}
});

let sb=null, USER=null, OBRAS=[], OBRA=null, EMPRESA_ACTIVA='PLATINUM', WORKERS=[], CHEQUES=[], DESC=[], DOCSX=[], VAC=[], ACTAS=[], NOM=[], PAGOS=[], PRIMAS=[], CUADS=[], CIERRES=[], CTRLNOI=[], ALTAS_CORTAS=[], FINTRANS=[], VIEW='trab';
let PUEDE_EDITAR_TRABAJADORES=false; // solo presentación; la autorización real sigue en RLS
let PUEDE_ELIMINAR_CHEQUES=false; // permiso puntual; no convierte al usuario en administrador
/* Script 59: diferenciales de proyección, bloques de cheques y control interno
   salarial. SUELDOSINT solo trae filas si el usuario es VIP — lo decide la RLS
   de la base, no la app. */
let DIFS=[], BLOQUES=[], SUELDOSINT=[], ES_VIP=false;
/* Supabase corta cada consulta a 1000 filas. Con cientos de trabajadores y miles
   de recibos/cheques eso deja fuera muchos registros (por eso "solo salían los
   últimos recibos"). fetchAllRows pagina con .range() hasta traerlos TODOS.

   BUG CORREGIDO (2026-09-02) — LAS PÁGINAS SE COMÍAN FILAS.
   Esto paginaba SIN "order by", y ahí está la trampa: PostgreSQL NO garantiza
   que dos consultas con LIMIT/OFFSET devuelvan las filas en el mismo orden si
   no se lo pides. Basta que entre la página 1 y la 2 alguien inserte, o que el
   planeador cambie de recorrido, para que una fila que ya salió en la 1 vuelva
   a salir en la 2 — y entonces OTRA nunca aparece.
   Por eso un acuse quedaba guardado en la base (al volver a subirlo avisaba
   "duplicado", porque esa consulta va dirigida por hash) pero la ficha del
   trabajador decía "sin acuses importados": la fila nunca llegaba a DOCSX.
   Con `order by id` el orden es estable y ninguna página se salta nada. */
async function fetchAllRows(makeQuery,orden){
  const col=orden||'id';
  const CH=1000; let from=0, all=[], sinOrden=false;
  for(;;){
    let q=makeQuery();
    if(!sinOrden)q=q.order(col,{ascending:true});
    const {data,error}=await q.range(from,from+CH-1);
    if(error){
      // si la tabla no tuviera esa columna, se reintenta sin ordenar en vez de
      // quedarse sin datos (pero entonces sí puede saltarse filas: se avisa)
      if(!sinOrden&&/column|does not exist|42703/i.test(error.message||'')){
        console.warn('fetchAllRows: no se pudo ordenar por "'+col+'"; la paginación puede saltarse filas.');
        sinOrden=true; from=0; all=[]; continue;
      }
      return {data:all,error};
    }
    all=all.concat(data||[]);
    if(!data||data.length<CH)break;
    from+=CH;
  }
  return {data:all,error:null};
}
let CONTRATISTAS=[]; // v21: control REPSE por contratista — bitácora 100% interna, sin conexión a STPS/SAT/IMSS
let _DASHCHARTS=[]; // v24: instancias de Chart.js del dashboard ejecutivo, para destruir al refiltrar/cerrar
/* v20: PAPELERA — solo el administrador puede eliminar/restaurar trabajadores.
   El correo se lee de config.admin_papelera (editable en Supabase); si no está
   configurado, cae a este correo por default. La protección REAL vive en la base
   (trigger fn_proteger_papelera, Script 27) — esto solo oculta el botón en la UI. */
function adminEmail(){return ((CFGEMP['admin_papelera']||{}).email||'darieljtg@gmail.com').toLowerCase();}
function esAdmin(){return !!(USER&&USER.email&&USER.email.toLowerCase()===adminEmail());}
/* VIP = acceso total (app_usuarios.full_access en la base). Se resuelve al abrir
   sesión; el administrador siempre lo es. Solo sirve para MOSTRAR u ocultar: lo
   que de verdad protege los datos es la RLS. */
function esVip(){return ES_VIP||esAdmin();}
async function cargaPermisos(){
  PUEDE_EDITAR_TRABAJADORES=false;
  PUEDE_ELIMINAR_CHEQUES=false;
  try{
    const {data}=await sb.from('app_usuarios').select('full_access,activo,rol,puede_escribir').eq('user_id',USER.id).limit(1);
    const u=(data||[])[0];
    ES_VIP=!!(u&&u.full_access&&u.activo!==false);
    PUEDE_EDITAR_TRABAJADORES=!!(u&&u.activo!==false&&u.puede_escribir);
  }catch(e){ ES_VIP=false;PUEDE_EDITAR_TRABAJADORES=false; }   // sin script 51 corrido: solo el administrador
  try{
    const {data,error}=await sb.rpc('control_puede_eliminar_cheques');
    PUEDE_ELIMINAR_CHEQUES=!error&&data===true;
  }catch(e){PUEDE_ELIMINAR_CHEQUES=false;}
}
function puedeEliminarCheque(){return !!USER&&(esAdmin()||PUEDE_ELIMINAR_CHEQUES);}
function puedeEditarTrabajador(){
  return !!USER&&(esAdmin()||PUEDE_EDITAR_TRABAJADORES);
}
/* Diferencial vigente de un trabajador en una semana (Bloque 1). */
function difDe(tid,sem){
  const ns=normSem(sem); if(!tid||!ns)return 0;
  const d=(DIFS||[]).find(x=>x.activo!==false&&x.trabajador_id===tid&&String(x.semana)===ns);
  return d?(Number(d.monto)||0):0;
}
/* Sueldos internos de un trabajador (Bloque 2). Vacío si no es VIP. */
function sueldoInternoDe(tid){return (SUELDOSINT||[]).find(x=>x.trabajador_id===tid)||null;}
if(window.pdfjsLib)pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let SORT={k:'no_trab',asc:true}, CSORT={k:'semana',asc:false};
let lastLocalWrite=0, rtTimer=null;

/* ---------- utilidades ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fullName=w=>[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' ').trim();
const money=v=>v==null||v===''?'':Number(v).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtD=v=>{if(!v)return'';const[y,m,d]=String(v).slice(0,10).split('-');return `${d}/${m}/${y}`;};
const today=()=>new Date().toISOString().slice(0,10);
/* Empresa legal del centro: usa la columna normalizada de Supabase. El respaldo
   por nombre permite abrir el frontend antes de ejecutar la migración 68. */
function empresaDeObra(o){
  const c=String(o&&o.empresa_codigo||'').toUpperCase();
  if(EMPRESAS[c])return c;
  const n=String(o&&o.nombre||'').trim().toUpperCase();
  return (n==='OBRA BANCOMER'||n.includes('JIRE'))?'JIRE':'PLATINUM';
}
function empresaDeTrabajador(w){return empresaDeObra(OBRAS.find(o=>o.id===(w&&w.obra_id))||OBRA);}
function obrasEmpresa(codigo=EMPRESA_ACTIVA){return OBRAS.filter(o=>o.activa!==false&&empresaDeObra(o)===codigo);}
/* Lectura completa por razón social. No reutiliza el padrón parcial del centro.
   Un error o cambio de empresa invalida toda la lectura, nunca autoriza con una lista incompleta. */
async function leerPorEmpresa(tabla,columnas='*',filtro=q=>q){
  const empresa=EMPRESA_ACTIVA,ids=OBRAS.filter(o=>empresaDeObra(o)===empresa).map(o=>o.id);
  if(!ids.length)return {data:[],error:null};
  const r=await fetchAllRows(()=>filtro(sb.from(tabla).select(columnas).in('obra_id',ids)));
  if(empresa!==EMPRESA_ACTIVA)return {data:null,error:{message:'Cambió la empresa durante la consulta. Abre nuevamente esta herramienta.'}};
  return r.error?{data:null,error:r.error}:r;
}
/* v34: fechas en formato DD/MM/AAAA (día primero) para captura y ficha */
const isoADMY=v=>{if(!v)return'';const[y,m,d]=String(v).slice(0,10).split('-');return (y&&m&&d)?`${d}/${m}/${y}`:'';};
const dmyAiso=v=>{const s=String(v||'').trim();const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)return null;
  const d=+m[1],mo=+m[2],y=+m[3];if(mo<1||mo>12||d<1||d>31)return null;
  const iso=`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const chk=new Date(iso+'T12:00');if(chk.getUTCFullYear()!==y||chk.getUTCMonth()+1!==mo||chk.getUTCDate()!==d)return null;
  return iso;};
/* autoformato mientras se teclea: inserta las diagonales solo */
function fechaDMYinput(el){let v=el.value.replace(/[^\d]/g,'').slice(0,8);
  if(v.length>4)v=v.slice(0,2)+'/'+v.slice(2,4)+'/'+v.slice(4);
  else if(v.length>2)v=v.slice(0,2)+'/'+v.slice(2);
  el.value=v;
  const iso=dmyAiso(v);const h=$('h-'+el.id.replace(/^f-/,''));
  if(h)h.innerHTML=v.length>=10?(iso?`<span style="color:var(--green)">✔ ${isoADMY(iso)}</span>`:'<span class="bad">Fecha inválida (usa DD/MM/AAAA)</span>'):'Formato: día / mes / año';}
const bankFromClabe=c=>{c=String(c||'').trim();return RX.clabe.test(c)?(BANCOS[c.slice(0,3)]||''):'';};
const edad=f=>{if(!f)return'';const b=new Date(f),n=new Date();let e=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))e--;return e;};
const docsOk=w=>{const d=w.docs||{};return DOCS.filter(k=>d[k]==='ENTREGADO').length;};
/* v35: fecha base para ANTIGÜEDAD = reingreso si existe, si no el alta. Al
   reingresar tras una baja, la antigüedad reinicia (misma regla de siempre),
   pero conservamos el alta original y la baja anterior para verlas en la lista. */
const iniAntig=w=>(w&&w.fecha_reingreso)?w.fecha_reingreso:(w?w.fecha_alta:null);
// Registro patronal y prima RT EFECTIVOS: usa los del PROPIO trabajador si los
// trae (override), si no los de la obra. Para casos como los 2 de oficina JIRE
// con registro patronal y prima distintos. NO cambia el neto del trabajador
// (la prima RT es cuota 100% patronal); solo corrige exports IMSS/IDSE y costo.
const rpDe=w=>String((w&&w.registro_patronal&&String(w.registro_patronal).trim())||(OBRA&&OBRA.registro_patronal)||'');
const primaDe=(w,obraPrima)=>{const p=w&&w.prima_rt;return (p!==null&&p!==undefined&&p!=='')?Number(p):(obraPrima!=null&&obraPrima!==''?Number(obraPrima):(OBRA&&OBRA.prima_rt!=null?Number(OBRA.prima_rt):0));};
const tieneRPpropio=w=>!!(w&&((w.registro_patronal&&String(w.registro_patronal).trim())||(w.prima_rt!==null&&w.prima_rt!==undefined&&w.prima_rt!=='')));
const MES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
function toast(msg,cls=''){const t=document.createElement('div');t.className='toast '+cls;t.textContent=msg;$('toasts').appendChild(t);setTimeout(()=>t.remove(),4200);}
/* SEMANA 1 de la empresa = lunes 30 de marzo de 2026 (inicio de obra).
   Si algún día cambia el conteo, solo edita esta fecha. */
const SEMANA1='2026-03-30';
const LOGO_JIRE="data:image/png;base64,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";
/* v15: cada obra cuenta sus semanas desde SU fecha de inicio (lunes de su SEMANA 1).
   Se llena sola con el primer trabajador registrado; editable con el lápiz ✎ de la obra. */
function semBase(){return (typeof OBRA!=='undefined'&&OBRA&&OBRA.fecha_inicio)?String(OBRA.fecha_inicio).slice(0,10):SEMANA1;}
function isoWeek(d=new Date()){
  const a=new Date(semBase()+'T12:00');
  const x=new Date(d);x.setHours(12,0,0,0);
  x.setDate(x.getDate()-((x.getDay()+6)%7)); // lunes de esa semana
  return Math.round((x-a)/604800000)+1;
}
/* Semana de la OBRA abierta (cada obra tiene su propia fecha de inicio). Para
   Bienestar coincide con isoWeek(); para Jardines u otras da su semana real.
   Se usa como default en listas de asistencia y proyección de nómina. */
function semObra(){try{const w=isoWeekDe(OBRA,new Date());return w>0?w:isoWeek();}catch(e){return isoWeek();}}
function weekBounds(){const n=new Date(),dow=(n.getDay()+6)%7,mon=new Date(n);mon.setDate(n.getDate()-dow);const sun=new Date(mon);sun.setDate(mon.getDate()+6);return[mon.toISOString().slice(0,10),sun.toISOString().slice(0,10)];}
function periodoCorto(n){
  const [d1,d2]=semRange(n);
  const a=new Date(d1+'T12:00'),b=new Date(d2+'T12:00');
  const p=x=>String(x).padStart(2,'0'), M=x=>MES[x.getMonth()].slice(0,3);
  return a.getMonth()===b.getMonth()?`${p(a.getDate())} – ${p(b.getDate())} ${M(b)}`:`${p(a.getDate())} ${M(a)} – ${p(b.getDate())} ${M(b)}`;
}
function rangoTexto(d1,d2){if(!d1||!d2)return'';const a=new Date(d1+'T12:00'),b=new Date(d2+'T12:00');return `DEL ${a.getDate()} DE ${MES[a.getMonth()]} AL ${b.getDate()} DE ${MES[b.getMonth()]} DEL ${b.getFullYear()}`;}
/* v34: al cerrar, restaura el scroll del fondo exactamente donde estaba
   (en celular, position:fixed mueve el scroll a 0; lo devolvemos para que
   NO se vea "movido" todo al salir de una ficha). */
function closeModal(force=false){
  const formulario=$('worker-form-body');
  if(formulario&&!force){
    if(formulario.dataset.busy==='1')return;
    if(formulario.dataset.dirty==='1'&&!confirm('Hay cambios sin guardar. ¿Cerrar y descartarlos?'))return;
  }
  $('modals').innerHTML='';
  document.body.classList.remove('modal-abierto');
  if(window._scrollY!=null){const y=window._scrollY;window._scrollY=null;document.body.style.top='';window.scrollTo(0,y);}
  if(window._pendingRT){window._pendingRT=false;if(window._PLATINUM_RT)window._PLATINUM_RT.request();else softRefresh(false);}
}
function modal(html,w=''){
  // captura el scroll SOLO al abrir el primer modal (no en modales encadenados,
  // donde el fondo ya está fijo y scrollY valdría 0)
  if(!document.body.classList.contains('modal-abierto')){
    window._scrollY=window.scrollY||window.pageYOffset||0;
    document.body.style.top=`-${window._scrollY}px`;
    document.body.classList.add('modal-abierto');
  }
  $('modals').innerHTML=`<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal ${w}">${html}</div></div>`;
}
/* modal ANIDADO: se apila SOBRE el modal actual sin destruirlo (para asistentes
   que necesitan leer/escribir campos del formulario de atrás, p. ej. la dirección). */
function modal2(html,w=''){
  const d=document.createElement('div');
  d.className='overlay';
  d.style.zIndex='120';
  d.innerHTML=`<div class="modal ${w}">${html}</div>`;
  d.addEventListener('click',e=>{if(e.target===d)closeModal2();});
  $('modals').appendChild(d);
}
function closeModal2(){
  const ov=$('modals').querySelectorAll('.overlay');
  if(ov.length>1)ov[ov.length-1].remove();   // quita solo el modal de encima, deja el formulario
  else closeModal();
}
function markWrite(){lastLocalWrite=Date.now();}

