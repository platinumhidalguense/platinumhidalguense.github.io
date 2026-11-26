/* Calendario documental. No usa fecha_inicio para construir periodos de JIRE.
   Contrato común de periodo (cliente y servidor, control_periodos_nomina LISTAR/RESOLVER):
   periodo_id (identidad estable) · empresa · centro · ejercicio · periodicidad · clase · numero_noi (lo que ve el usuario)
   · desde/hasta · fecha_pago · clave_operativa (= `semana`, compatibilidad con registros históricos) · alias (claves compatibles).
   El número NOI y la clave operativa nunca se intercambian: `numero_noi` busca por NOI; `semana`/`clave` por clave operativa. */
(function(root){
 'use strict';
 function contrato(p,o){
  if(!p)return null;
  const clave=Number(p.semana);
  return {...p,obra_id:o??p.obra_id??null,ejercicio:p.anio,numero_noi:p.numero_noi==null?null:Number(p.numero_noi),clave_operativa:clave,
   alias:[...new Set([clave,...(p.claves_compatibles||[]).map(Number)])].filter(Number.isInteger)};
 }
 function crear(dep){
  const memorias=new Map(),pendientes=new Map(),estados=new Map();let generacion=0;
  const key=(o,an)=>[dep.usuario(),o,an||'todos'].join('|');
  async function cargar(o,an=null,forzar=false){
   const k=key(o,an),g=generacion;if(!forzar&&memorias.has(k))return memorias.get(k);
   if(!forzar&&pendientes.has(k))return pendientes.get(k);
   estados.set(k,{estado:'CARGANDO'});
   const p=(async()=>{const r=await dep.rpc('control_periodos_nomina',{p_accion:'LISTAR',p_datos:{obra_id:o,anio:an}});
    if(g!==generacion||k!==key(o,an))throw Error('Se descartó un calendario de otra sesión');
    if(r.error)throw Error(r.error.message);if(r.data?.obra_id!==o||!Array.isArray(r.data?.periodos))throw Error('Calendario incompleto');
    // Una respuesta anterior (lectura reemplazada por una forzada) no sobrescribe la vigente.
    if(pendientes.get(k)!==p)return memorias.get(k)||r.data;
    memorias.set(k,r.data);estados.set(k,{estado:'LISTO'});return r.data;
   })();
   pendientes.set(k,p);
   p.catch(e=>{if(pendientes.get(k)===p&&g===generacion)estados.set(k,{estado:'ERROR',error:e.message});}).finally(()=>{if(pendientes.get(k)===p)pendientes.delete(k);});
   return p;
  }
  function lista(o){return memorias.get(key(o,null))?.periodos||[];}
  function estado(o){const k=key(o,null);return memorias.has(k)?{estado:'LISTO'}:estados.get(k)||{estado:'SIN_CARGAR'};}
  /* Resolución explícita: periodo_id, numero_noi (número NOI visible), semana/clave (clave operativa histórica o alias) o
     fecha. Filtra por ejercicio y periodicidad cuando se indican; dos coincidencias son ambigüedad, nunca se elige una. */
  function candidatos(o,{semana,clave,numero_noi,fecha,periodicidad,anio,periodo_id,clase='ORDINARIO'}={}){
   const k=clave??semana;
   return lista(o).filter(p=>(!periodicidad||periodicidad==='TODOS'||p.periodicidad===periodicidad)&&(!anio||p.anio===Number(anio))&&(!clase||p.clase===clase)&&
    (periodo_id?p.periodo_id===periodo_id:numero_noi!=null&&numero_noi!==''?p.numero_noi!=null&&Number(p.numero_noi)===Number(numero_noi):
     fecha?p.desde<=fecha&&p.hasta>=fecha:k!=null&&k!==''&&(Number(p.semana)===Number(k)||(p.claves_compatibles||[]).map(Number).includes(Number(k)))));
  }
  function resolver(o,solicitud={}){
   const filas=candidatos(o,solicitud);
   if(filas.length>1)throw Error('Selecciona el periodo y ejercicio documentados; hay más de una correspondencia');
   const p=contrato(filas[0],o),k=solicitud.clave??solicitud.semana;
   // Por clave: conserva la clave pedida (alias histórico) y la principal; por NOI, id o fecha: la clave principal.
   return p&&k!=null&&k!==''&&solicitud.numero_noi==null&&!solicitud.periodo_id&&!solicitud.fecha?{...p,clave_principal:p.semana,semana:Number(k)}:p;
  }
  /* Periodo cuyo rango coincide exactamente con las fechas capturadas (edición manual de Del/Al). */
  function porRango(o,desde,hasta,periodicidad){
   const f=lista(o).filter(p=>p.clase==='ORDINARIO'&&p.desde===desde&&p.hasta===hasta&&(!periodicidad||periodicidad==='TODOS'||p.periodicidad===periodicidad));
   return f.length===1?contrato(f[0],o):null;
  }
  async function incorporar(o,datos){const r=await dep.rpc('control_periodos_nomina',{p_accion:'INCORPORAR',p_datos:{obra_id:o,...datos}});if(r.error)throw Error(r.error.message);memorias.delete(key(o,null));await cargar(o,null,true);return r.data;}
  return Object.freeze({cargar,lista,estado,candidatos,resolver,porRango,incorporar,invalidar:()=>{generacion++;memorias.clear();pendientes.clear();estados.clear();}});
 }
 const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
 const rango=(d,h)=>{const [a,m,x]=String(d).split('-').map(Number),[b,n,y]=String(h).split('-').map(Number);
  return a===b&&m===n?`${x}–${y} ${MESES[m-1]} ${a}`:a===b?`${x} ${MESES[m-1]} – ${y} ${MESES[n-1]} ${a}`:`${x} ${MESES[m-1]} ${a} – ${y} ${MESES[n-1]} ${b}`;};
 const perTexto=p=>p==='QUINCENAL'?'Quincenal':p==='SEMANAL'?'Semanal':p==='MENSUAL'?'Mensual':String(p||'');
 /* Texto visible: número NOI, rango, periodicidad y ejercicio. La clave operativa sólo aparece si no hay número NOI documentado. */
 const visible=p=>`${p.numero_noi?'NOI '+p.numero_noi:'Clave histórica S'+p.semana+' · NOI sin documentar'} · ${rango(p.desde,p.hasta)} · ${perTexto(p.periodicidad)} · Ejercicio ${p.anio}`;
 const etiqueta=(o,p)=>`${o.empresa_codigo} · ${o.nombre} · Ejercicio ${p.anio} · ${p.numero_noi?'Periodo NOI '+p.numero_noi:'Clave histórica S'+p.semana+' · NOI sin documentar'} · ${p.desde} al ${p.hasta}`;
 const rotulo=p=>p?.numero_noi?`NOI ${p.numero_noi}`:`SEMANA ${p?.semana??''}`;
 const estricto=o=>o?.empresa_codigo==='JIRE';
 const fechaLocal=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)?d:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
 const hayDom=typeof document!=='undefined';
 const servicio=crear({usuario:()=>typeof USER==='undefined'?null:USER?.id,rpc:(...a)=>sb.rpc(...a)});
 /* Mensaje según el estado real del calendario: cargando, error de consulta o periodo inexistente. */
 function motivo(o,solicitud){
  const e=servicio.estado(o?.id);
  if(e.estado==='CARGANDO'||e.estado==='SIN_CARGAR')return 'Cargando el calendario NOI del centro. Intenta de nuevo en un momento.';
  if(e.estado==='ERROR')return 'No se pudo consultar el calendario NOI del centro: '+e.error;
  const que=solicitud?.numero_noi!=null?'NOI '+solicitud.numero_noi:solicitud?.fecha?'la fecha '+solicitud.fecha:solicitud?.periodo_id?'el periodo seleccionado':'la clave '+(solicitud?.clave??solicitud?.semana);
  return `Periodo NOI no documentado: no existe en el calendario de ${o?.nombre||'este centro'} para ${que}. Incorpora las fechas respaldadas en Recibos PDF y XML → Calendario NOI.`;
 }
 function de(o,solicitud){const p=servicio.resolver(o?.id,solicitud);if(!p&&estricto(o))throw Error(motivo(o,solicitud));return p;}
 async function cargar(o,an=null,forzar=false){const d=await servicio.cargar(o,an,forzar);if(typeof OBRAS!=='undefined'){const centro=OBRAS.find(x=>x.id===o);if(centro&&centro.empresa_codigo===d.empresa_codigo)centro.periodos_noi=d.periodos;}return d;}

 /* ---------- Selector de periodo documentado (proyección y demás capturas por periodo) ----------
    Centros con calendario estricto (JIRE): lista de periodos documentados (NOI, rango, periodicidad, ejercicio). La clave
    operativa viaja en el campo oculto `<prefijo>-sem`, que siguen leyendo los consumidores históricos. Otros centros
    conservan «No. de semana». Editar Del/Al vuelve a resolver el periodo por rango exacto; si no hay uno, se limpia la
    selección (no se conserva en silencio el identificador de otro intervalo). */
 const selecciones=new Map();
 const centroDe=x=>{const c=hayDom&&document.getElementById(x+'-obra');const id=c?.value||(typeof OBRA!=='undefined'?OBRA?.id:null);return (typeof OBRAS!=='undefined'?OBRAS.find(o=>o.id===id):null)||(typeof OBRA!=='undefined'&&OBRA?.id===id?OBRA:null);};
 function opciones(o,{anio,periodicidad}={}){
  return servicio.lista(o?.id).filter(p=>p.clase==='ORDINARIO'&&(!anio||p.anio===Number(anio))&&(!periodicidad||periodicidad==='TODOS'||p.periodicidad===periodicidad))
   .slice().sort((a,b)=>b.desde.localeCompare(a.desde));
 }
 function campo(x,{obra,clave,periodo_id,fecha,etiquetaNumero='No. de semana',cb='',valorNumero}={}){
  const o=obra||centroDe(x),esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!estricto(o))return `<div><label>${etiquetaNumero}</label><input id="${x}-sem" type="number" value="${esc2(valorNumero??clave??'')}" oninput="semSincroniza('${x}-sem','${x}-d1','${x}-d2'${cb?','+cb:''})"></div>`;
  const lst=opciones(o),hoy=typeof today==='function'?today():fechaLocal(new Date());
  const porClave=p=>Number(p.semana)===Number(clave)||(p.claves_compatibles||[]).map(Number).includes(Number(clave)),enFecha=p=>!fecha||p.desde<=fecha&&p.hasta>=fecha;
  let sel=periodo_id?lst.find(p=>p.periodo_id===periodo_id):clave!=null&&clave!==''?lst.find(p=>porClave(p)&&enFecha(p))||null:null;
  if(!sel)sel=lst.find(p=>p.desde<=(fecha||hoy)&&p.hasta>=(fecha||hoy))||lst.find(p=>p.desde<=(fecha||hoy))||null;
  const e=servicio.estado(o?.id);
  const aviso=e.estado==='ERROR'?motivo(o,{}):e.estado!=='LISTO'?'Cargando calendario NOI del centro…':!lst.length?'Sin periodos documentados en este centro. Incorpóralos en Recibos PDF y XML → Calendario NOI.':'';
  selecciones.set(x,sel?contrato(sel,o.id):null);
  return `<div><label for="${x}-per">Periodo NOI documentado</label><select id="${x}-per" data-periodo-sel="${x}" data-obra="${esc2(o.id)}" data-cb="${esc2(cb)}">
   ${lst.length?'':'<option value="">— Sin periodos documentados —</option>'}${lst.map(p=>`<option value="${esc2(p.periodo_id)}" ${sel?.periodo_id===p.periodo_id?'selected':''}>${esc2(visible(p))}</option>`).join('')}
   </select><input type="hidden" id="${x}-sem" value="${sel?esc2(sel.semana):''}"><p class="fhint" id="${x}-per-estado" role="status">${esc2(aviso)}</p></div>`;
 }
 function aplicar(x,p,{fechas=true}={}){
  if(!hayDom)return;
  const g=id=>document.getElementById(x+id);
  selecciones.set(x,p);
  if(g('-sem'))g('-sem').value=p?String(p.semana):'';
  if(g('-per')&&p&&g('-per').value!==p.periodo_id)g('-per').value=p.periodo_id;
  if(p&&fechas){if(g('-d1'))g('-d1').value=p.desde;if(g('-d2'))g('-d2').value=p.hasta;}
  const per=g('-periodo');if(p&&per&&[...per.options].some(op=>op.value===p.periodicidad)&&per.value!=='TODOS')per.value=p.periodicidad;
  if(g('-per-estado'))g('-per-estado').textContent=p?'':'Las fechas no coinciden con un periodo NOI documentado de este centro. Selecciona un periodo o incorpóralo en Recibos PDF y XML → Calendario NOI.';
 }
 /* Periodo vigente de un selector: null si no es un centro estricto; error claro si no hay periodo válido seleccionado. */
 function seleccionado(x){
  const o=centroDe(x);if(!estricto(o))return null;
  const p=selecciones.get(x),sem=hayDom&&document.getElementById(x+'-sem')?.value;
  if(!p||!sem||String(p.semana)!==String(sem))throw Error(servicio.estado(o?.id).estado==='LISTO'?'Selecciona un periodo NOI documentado; las fechas capturadas no corresponden a uno.':motivo(o,{}));
  const d1=document.getElementById(x+'-d1')?.value,d2=document.getElementById(x+'-d2')?.value;
  if(d1&&d2&&(d1!==p.desde||d2!==p.hasta))throw Error('Las fechas no corresponden al periodo NOI seleccionado ('+visible(p)+').');
  return p;
 }
 /* Carga el calendario del centro y vuelve a pintar el selector con la selección resuelta. Un turno posterior
    (otro centro u otra apertura) descarta la respuesta anterior; el error de consulta se muestra como tal. */
 const turnos=new Map();
 async function montar(x,opts={}){
  const o=opts.obra||centroDe(x);if(!hayDom||!estricto(o))return null;
  const t={};turnos.set(x,t);
  const pintar=()=>{const sel=document.getElementById(x+'-per');if(!sel)return false;const div=sel.closest('div');
   const tmp=document.createElement('div');tmp.innerHTML=campo(x,{...opts,obra:o,periodo_id:opts.periodo_id||selecciones.get(x)?.periodo_id});div.replaceWith(tmp.firstElementChild);return true;};
  try{await cargar(o.id);}catch(e){if(turnos.get(x)!==t)return null;pintar();throw Error(servicio.estado(o.id).estado==='ERROR'?motivo(o,{}):e.message);}
  if(turnos.get(x)!==t||centroDe(x)?.id!==o.id)return null;
  if(!pintar())return null;
  const p=selecciones.get(x);aplicar(x,p);
  const cb=opts.cb&&root[opts.cb];if(typeof cb==='function')cb();
  return p;
 }
 if(hayDom){
  document.addEventListener('change',e=>{
   const s=e.target?.closest?.('[data-periodo-sel]');if(!s)return;
   const x=s.dataset.periodoSel,p=servicio.resolver(s.dataset.obra,{periodo_id:s.value});aplicar(x,p);
   const cb=s.dataset.cb&&root[s.dataset.cb];if(typeof cb==='function')cb();
  });
  document.addEventListener('input',e=>{
   const m=/^(.+)-d[12]$/.exec(e.target?.id||'');if(!m||!document.getElementById(m[1]+'-per'))return;
   const x=m[1],o=centroDe(x),per=document.getElementById(x+'-periodo')?.value;
   aplicar(x,servicio.porRango(o?.id,document.getElementById(x+'-d1').value,document.getElementById(x+'-d2').value,per),{fechas:false});
  },true);
 }
 root.PLATINUM_PERIODOS=Object.freeze({...servicio,cargar,crear,contrato,etiqueta,visible,rotulo,estricto,de,motivo,fechaLocal,campo,montar,aplicar,seleccionado,opciones});
})(typeof window!=='undefined'?window:globalThis);
