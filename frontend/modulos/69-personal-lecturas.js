/* Lecturas acotadas de personal. Una lectura parcial nunca certifica el centro completo. */
(function(){
 'use strict';
 let alcance=null,solicitudes=new Map();
 const completos=new WeakMap();
 const metricas=[];
 const reloj=()=>performance.now();
 const clave=()=>[OBRA?.id,USER?.id,EMPRESA_ACTIVA,esVip(),esAdmin(),puedeEditarTrabajador()].join('|');
 function contexto(){
  const firma=clave();
  if(alcance?.firma!==firma||alcance?.cliente!==sb){alcance={firma,cliente:sb};solicitudes=new Map();}
  return alcance;
 }
 const vigente=c=>c===contexto()&&NAV_STEP==='trabajadores';
 function medir(ruta,modo){
  const inicio=reloj(),e={ruta,modo,solicitudes:0,paginas:0,bytes:0,red_ms:0,preparacion_ms:0,render_ms:0};
  return {
   consulta(n,ms){e.solicitudes++;e.paginas++;e.red_ms+=ms;if(n)e.bytes+=new TextEncoder().encode(JSON.stringify(n)).length;},
   preparacion(ms){e.preparacion_ms+=ms;}, render(ms){e.render_ms+=ms;},
   marca(nombre){e[nombre+'_ms']=reloj()-inicio;},
   fin(estado='ok'){e.estado=estado;e.total_ms=reloj()-inicio;metricas.push({...e});if(metricas.length>240)metricas.shift();}
  };
 }
 function leer(tabla,claveLectura,construir,medicion){
  const c=contexto(),k=tabla+':'+claveLectura;
  if(solicitudes.has(k))return solicitudes.get(k);
  const replica=window.PLATINUM_DATOS,t=replica?.iniciar();
  const p=(async()=>{
   const filas=await fetchAllRows(()=>{
    if(!vigente(c))throw Error('El contexto de lectura cambió.');
    return construir(c.cliente.from(tabla));
   },tabla==='sueldos_internos'?'trabajador_id':null,medicion?.consulta);
   if(!vigente(c))throw Error('El contexto de lectura cambió.');
   if(filas.error||!Array.isArray(filas.data))throw Error(filas.error?.message||'Lectura incompleta.');
   return {filas:filas.data,t,c,replica};
  })().finally(()=>{replica?.cerrar(t);if(solicitudes.get(k)===p)solicitudes.delete(k);});
  solicitudes.set(k,p);return p;
 }
 function aplicarFila(w,c=contexto(),confirmado=true){
  if(!vigente(c)||!w?.id||w.obra_id!==OBRA.id||w.eliminado)return null;
  const replica=window.PLATINUM_DATOS;
  const actual=WORKERS.find(x=>x.id===w.id);
  if(actual&&replica?.masReciente(actual,w))return null;
  if(replica&&(confirmado||actual?.updated_at!==w.updated_at))replica.aplicar({table:'trabajadores',eventType:actual?'UPDATE':'INSERT',new:w});
  else if(replica&&!actual)return null;
  else if(!replica)WORKERS=WORKERS.filter(x=>x.id!==w.id).concat(w);
  // La fila completa sólo queda disponible para la ficha/guardado actual.
  if(!OBRA_CARGA_COMPLETA){
   const guardada=WORKERS.find(x=>x.id===w.id);
   if(guardada?.updated_at===w.updated_at)WORKERS=WORKERS.map(x=>x.id===w.id?w:x);
  }
  if(confirmado)window.PLATINUM_PADRON?.invalidar('trabajadores');
  completos.set(w,c);
  if(!replica&&typeof renderTable==='function')renderTable();
  return w;
 }
 async function trabajador(id,c,medicion){
  const local=WORKERS.find(w=>w.id===id&&w.obra_id===OBRA?.id);
  const lecturaCentro=typeof OBRA_LECTURA_VERIFICADA!=='undefined'?OBRA_LECTURA_VERIFICADA:null;
  if(local&&(completos.get(local)===c||OBRA_CARGA_COMPLETA&&lecturaCentro?.obra===OBRA.id&&lecturaCentro?.sesion===USER.id+':'+esVip()))return local;
  const obra=OBRA.id;
  const {filas,t,replica}=await leer('trabajadores',obra+':'+id,q=>q.select('*').eq('obra_id',obra).eq('id',id).eq('eliminado',false),medicion);
  if(!vigente(c))return null;
  const w=(replica?.publicar(t,filas,'trabajadores')??filas).find(x=>x.id===id);
  if(!w||!aplicarFila(w,c,false))throw Error('La ficha cambió o ya no está disponible en este centro. Reintenta.');
  return w;
 }
 const destino={
  documentos:()=>DOCSX, pagos:()=>PAGOS, descuentos:()=>DESC, cheques:()=>CHEQUES,
  vacaciones:()=>VAC,actas:()=>ACTAS,nom035:()=>NOM,sueldos_internos:()=>SUELDOSINT
 };
 function instalar(tabla,w,filas){
  const relacion=f=>f.trabajador_id===w.id||(tabla==='cheques'&&!f.trabajador_id&&w.curp&&f.curp===w.curp&&f.obra_id===w.obra_id);
  const base=destino[tabla]().filter(f=>!relacion(f)).concat(filas);
  switch(tabla){
   case 'documentos':DOCSX=base;break;
   case 'pagos':PAGOS=base;break;
   case 'cheques':CHEQUES=base;break;
   case 'descuentos':DESC=base;break;
   case 'vacaciones':VAC=base;break;
   case 'actas':ACTAS=base;break;
   case 'nom035':NOM=base;break;
   case 'sueldos_internos':SUELDOSINT=base;break;
  }
 }
 async function seccion(tabla,w,c,medicion){
  if(!destino[tabla]||tabla==='sueldos_internos'&&!esVip())return;
  const r=await leer(tabla,w.id,q=>{
   q=q.select('*');
   if(tabla==='cheques'&&/^[A-Z0-9]{18}$/.test(w.curp||''))
    return q.eq('obra_id',w.obra_id).eq('eliminado',false).or('trabajador_id.eq.'+w.id+',and(trabajador_id.is.null,curp.eq.'+w.curp+')');
   q=q.eq('trabajador_id',w.id);
   if(tabla==='documentos')return q.eq('anulado',false);
   if(tabla==='pagos')return q; // vínculos históricos por ID, bajo RLS
   q=q.eq('obra_id',w.obra_id);
   return tabla==='cheques'?q.eq('eliminado',false):q;
  },medicion);
  if(!vigente(c))return;
  const filas=r.replica?.publicar(r.t,r.filas,tabla)??r.filas;
  instalar(tabla,w,filas.filter(f=>f.trabajador_id===w.id||(tabla==='cheques'&&!f.trabajador_id&&w.curp&&f.curp===w.curp&&f.obra_id===w.obra_id)));
 }
 async function cuadrillas(c=contexto(),medicion,obra=OBRA.id){
  if(OBRA_CARGA_COMPLETA&&obra===OBRA.id)return CUADS;
  const r=await leer('cuadrillas',obra,q=>q.select('*').eq('obra_id',obra),medicion);
  if(!vigente(c))return [];
  if(obra!==OBRA.id)return r.filas;
  CUADS=(r.replica?.publicar(r.t,r.filas,'cuadrillas')??r.filas).filter(q=>q.obra_id===obra);
  return CUADS;
 }
 window.PLATINUM_PERSONAL=Object.freeze({contexto,vigente,medir,leer,trabajador,seccion,cuadrillas,aplicarFila,
  metricas:()=>metricas.map(e=>({...e}))});
})();
