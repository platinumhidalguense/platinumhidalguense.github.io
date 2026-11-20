/* Calendario documental. No usa fecha_inicio para construir periodos de JIRE. */
(function(root){
 'use strict';
 function crear(dep){
  const memorias=new Map(),pendientes=new Map();let generacion=0;
  const key=(o,an)=>[dep.usuario(),o,an||'todos'].join('|');
  async function cargar(o,an=null,forzar=false){
   const k=key(o,an),g=generacion;if(!forzar&&memorias.has(k))return memorias.get(k);
   if(pendientes.has(k))return pendientes.get(k);
   const p=(async()=>{const r=await dep.rpc('control_periodos_nomina',{p_accion:'LISTAR',p_datos:{obra_id:o,anio:an}});
    if(g!==generacion||k!==key(o,an))throw Error('Se descartó un calendario de otra sesión');
    if(r.error)throw Error(r.error.message);if(r.data?.obra_id!==o||!Array.isArray(r.data?.periodos))throw Error('Calendario incompleto');
    memorias.set(k,r.data);return r.data;
   })().finally(()=>pendientes.delete(k));pendientes.set(k,p);return p;
  }
  function lista(o){return memorias.get(key(o,null))?.periodos||[];}
  function resolver(o,{semana,fecha,periodicidad,anio,periodo_id}={}){
   const filas=lista(o).filter(p=>(!periodicidad||p.periodicidad===periodicidad)&&(!anio||p.anio===Number(anio))&&
    (periodo_id?p.periodo_id===periodo_id:fecha?p.desde<=fecha&&p.hasta>=fecha:p.semana===Number(semana)||(p.claves_compatibles||[]).includes(Number(semana)))&&p.clase==='ORDINARIO');
   if(filas.length>1)throw Error('Selecciona el periodo y ejercicio documentados; hay más de una correspondencia');
   const p=filas[0];return p&&semana!=null?{...p,clave_principal:p.semana,semana:Number(semana)}:p||null;
  }
  async function incorporar(o,datos){const r=await dep.rpc('control_periodos_nomina',{p_accion:'INCORPORAR',p_datos:{obra_id:o,...datos}});if(r.error)throw Error(r.error.message);memorias.delete(key(o,null));await cargar(o,null,true);return r.data;}
  return Object.freeze({cargar,lista,resolver,incorporar,invalidar:()=>{generacion++;memorias.clear();pendientes.clear();}});
 }
 const etiqueta=(o,p)=>`${o.empresa_codigo} · ${o.nombre} · Ejercicio ${p.anio} · ${p.numero_noi?'Periodo NOI '+p.numero_noi:'Clave histórica S'+p.semana+' · NOI sin documentar'} · ${p.desde} al ${p.hasta}`;
 const estricto=o=>o?.empresa_codigo==='JIRE';
 const fechaLocal=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)?d:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
 const servicio=crear({usuario:()=>typeof USER==='undefined'?null:USER?.id,rpc:(...a)=>sb.rpc(...a)});
 function de(o,solicitud){const p=servicio.resolver(o?.id,solicitud);if(!p&&estricto(o))throw Error('Periodo NOI no documentado. Incorpora las fechas respaldadas en Recibos PDF y XML → Calendario NOI.');return p;}
 async function cargar(o,an=null,forzar=false){const d=await servicio.cargar(o,an,forzar);if(typeof OBRAS!=='undefined'){const centro=OBRAS.find(x=>x.id===o);if(centro&&centro.empresa_codigo===d.empresa_codigo)centro.periodos_noi=d.periodos;}return d;}
 root.PLATINUM_PERIODOS=Object.freeze({...servicio,cargar,crear,etiqueta,estricto,de,fechaLocal});
})(window);
