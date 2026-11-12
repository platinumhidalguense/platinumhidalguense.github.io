/* Tablero ejecutivo: modelo común de indicadores (referencia pura).
   Sin DOM, sin red, sin Supabase. Recibe filas crudas de las tablas y produce
   exactamente el JSON de las acciones RESUMEN, TENDENCIA, COMPARATIVOS,
   EXCEPCIONES, DETALLE, PLANTILLA y CATALOGOS de `control_tablero`.
   Dinero en enteros de millonésimas (BigInt); redondeo a centavos sólo al
   final, mitad lejos de cero (igual que round(numeric,2) de PostgreSQL).
   Cada peso se descompone una sola vez en «piezas» atómicas
   (operación × obligación); ningún total se calcula uniendo filas. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_TABLERO_MODELO=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const VERSION='TABLERO_2026_11_V1';
 const INICIO_CALENDARIO='2026-03-30';
 const ADSCRIPCION_PENDIENTE='Adscripción histórica pendiente';
 const PENDIENTE='__PENDIENTE__',SIN_CUADRILLA='__SIN_CUADRILLA__',SIN_CONCEPTO='SIN_CONCEPTO';
 const AUTORIZADOS=['AUTORIZADO','TIMBRADO','PAGADO'],REABIERTOS=['BORRADOR','REVISADO'];
 const ACCIONES_ADSCRIPCION=['ALTA','MODIFICACION','BAJA','REACTIVACION','CAMBIO_CUADRILLA_AUTORIZADO','DESASIGNACION_CUADRILLA_AUTORIZADA'];
 const TIPOS_ORDEN=['FINIQUITO','NOMINA','PREVISION_SOCIAL'];
 const SEVERIDAD={ROJO:0,AMBAR:1,INFO:2};

 /* ---------------- Dinero exacto ---------------- */
 const E6=1000000n;
 function mic(v){
  if(v===null||v===undefined||v==='')return 0n;
  let s=typeof v==='number'?(Number.isFinite(v)?(Math.abs(v)<1e15?v.toFixed(7):BigInt(Math.round(v)).toString()):'0'):String(v).trim();
  if(typeof v==='bigint')return v*E6;
  const m=/^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);if(!m)return 0n;
  const neg=m[1]==='-',ent=m[2]||'0',fr=(m[3]||'');
  let base=BigInt(ent)*E6+BigInt((fr+'000000').slice(0,6)||'0');
  if(fr.length>6&&Number(fr[6])>=5)base+=1n;
  return neg?-base:base;
 }
 function divRedondeo(num,den){ // cociente entero, mitad lejos de cero
  if(den===0n)return null;if(den<0n){num=-num;den=-den;}
  const q=num/den,r=num%den;if(r===0n)return q;
  const ab=r<0n?-r:r;return ab*2n>=den?q+(num<0n?-1n:1n):q;
 }
 const centavos=m=>Number(divRedondeo(m,10000n))/100;        // final: pesos con 2 decimales
 const pct=(a,b)=>b===0n?null:Number(divRedondeo(a*10000n,b))/100; // a/b·100 con 2 decimales
 const minB=(a,b)=>a<b?a:b,maxB=(a,b)=>a>b?a:b;
 const sum=(arr,f)=>arr.reduce((s,x)=>s+f(x),0n);

 /* ---------------- Fechas y calendario interno ---------------- */
 const fechaOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
 const dUTC=s=>new Date(String(s).slice(0,10)+'T12:00:00Z');
 const iso=d=>d.toISOString().slice(0,10);
 const sumar=(s,n)=>{const d=dUTC(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
 const difDias=(a,b)=>Math.round((dUTC(b)-dUTC(a))/86400000); // b−a
 const ultimoDia=(y,m)=>new Date(Date.UTC(y,m,0,12)).getUTCDate(); // m 1..12
 const mx=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'});
 function fechaLocal(ts){if(ts===null||ts===undefined||ts==='')return null;if(fechaOK(ts)&&String(ts).length===10)return String(ts);const d=new Date(ts);return Number.isFinite(+d)?mx.format(d):null;}
 const inicioObra=o=>fechaOK(o&&o.fecha_inicio)?String(o.fecha_inicio).slice(0,10):INICIO_CALENDARIO;
 const normSemana=s=>{if(s===null||s===undefined)return null;const t=String(s).replace(/\D/g,'');return t?parseInt(t,10):null;};
 /* platinum_internal.calendario_motor_quincenal(inicio) */
 function quincenaMotor(inicio){
  let ref=sumar(inicio,6);
  if(inicio>='2026-10-26')for(let k=0;k<7;k++){const d=sumar(inicio,k),x=dUTC(d);if(x.getUTCDate()===15||x.getUTCDate()===ultimoDia(x.getUTCFullYear(),x.getUTCMonth()+1)){ref=d;break;}}
  const x=dUTC(ref),y=x.getUTCFullYear(),m=x.getUTCMonth()+1,seg=x.getUTCDate()>15,mm=String(m).padStart(2,'0');
  return {desde:`${y}-${mm}-${seg?'16':'01'}`,hasta:seg?`${y}-${mm}-${String(ultimoDia(y,m)).padStart(2,'0')}`:`${y}-${mm}-15`};
 }
 /* Periodo interno: semana n inicia fecha_inicio + 7(n−1); semanal paga el viernes (desde+4); quincenal paga al cierre de quincena. */
 function periodo(obra,n,periodicidad){
  const inicio=sumar(inicioObra(obra),(n-1)*7);
  if(periodicidad==='QUINCENAL'){const q=quincenaMotor(inicio);return {semana:n,periodicidad:'QUINCENAL',desde:q.desde,hasta:q.hasta,fecha_pago:q.hasta};}
  return {semana:n,periodicidad:'SEMANAL',desde:inicio,hasta:sumar(inicio,6),fecha_pago:sumar(inicio,4)};
 }
 const semanaInterna=(obra,fecha)=>Math.floor(difDias(inicioObra(obra),fecha)/7)+1;
 /* Rangos con nombre. `ahora` ISO; hoy = fecha de Ciudad de México. */
 function rango(tipo,ahora,p={}){
  const hoy=fechaLocal(ahora),x=dUTC(hoy),y=x.getUTCFullYear(),m=x.getUTCMonth()+1,mm=String(m).padStart(2,'0');
  if(tipo==='MES'){const yy=p.anio||y,mo=p.mes||m,ms=String(mo).padStart(2,'0');return {tipo,desde:`${yy}-${ms}-01`,hasta:`${yy}-${ms}-${String(ultimoDia(yy,mo)).padStart(2,'0')}`};}
  if(tipo==='EJERCICIO'){const yy=p.anio||y;return {tipo,desde:`${yy}-01-01`,hasta:`${yy}-12-31`};}
  if(tipo==='ACUMULADO')return {tipo,desde:`${y}-01-01`,hasta:hoy};
  if(tipo==='ACTUAL'){const l=sumar(hoy,-((x.getUTCDay()+6)%7));return {tipo,desde:l,hasta:sumar(l,6)};}
  if(tipo==='PERSONALIZADO'){if(!fechaOK(p.desde)||!fechaOK(p.hasta)||p.desde>p.hasta)throw Error('Rango personalizado inválido.');return {tipo,desde:p.desde,hasta:p.hasta};}
  throw Error('Tipo de rango no reconocido: '+tipo);
 }
 const restarAnio=s=>{const [y,m,d]=s.split('-').map(Number);const dd=Math.min(d,ultimoDia(y-1,m));return `${y-1}-${String(m).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;};
 const mesesCompletos=(a,b)=>{if(a.slice(8)!=='01')return 0;const [y2,m2,d2]=b.split('-').map(Number);if(d2!==ultimoDia(y2,m2))return 0;const [y1,m1]=a.split('-').map(Number);return (y2-y1)*12+(m2-m1)+1;};
 const restarMeses=(s,k)=>{const [y,m]=s.split('-').map(Number);let t=y*12+(m-1)-k;return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}-01`;};
 /* Periodo comparable equivalente. Si el rango sigue en curso se compara sólo
    el tramo transcurrido (mismo número de días) y se marca incompleto. */
 function comparable(desde,hasta,modo,hoy){
  if(!modo)return null;
  if(desde>hoy)return {desde:null,hasta:null,modo,truncado:false,futuro:true};
  const hEf=hasta<hoy?hasta:hoy,trunc=hEf<hasta,trans=difDias(desde,hEf);
  let d;
  if(modo==='ANIO_ANTERIOR')d=restarAnio(desde);
  else if(modo==='ANTERIOR'){const k=mesesCompletos(desde,hasta);d=k?restarMeses(desde,k):sumar(desde,-(difDias(desde,hasta)+1));}
  else throw Error('Comparación no reconocida: '+modo);
  let h;
  if(!trunc){
   if(modo==='ANIO_ANTERIOR')h=restarAnio(hasta);
   else{const k=mesesCompletos(desde,hasta);if(k){const f=restarMeses(hasta.slice(0,8)+'01',k),[y,m]=f.split('-').map(Number);h=`${y}-${String(m).padStart(2,'0')}-${String(ultimoDia(y,m)).padStart(2,'0')}`;}else h=sumar(desde,-1);}
  }else h=sumar(d,trans);
  return {desde:d,hasta:h,modo,truncado:trunc,futuro:false};
 }

 /* ---------------- Utilidades ---------------- */
 const up=s=>String(s===null||s===undefined?'':s).trim().toUpperCase();
 const porId=rows=>new Map((rows||[]).map(r=>[r.id,r]));
 const cmp=(a,b)=>a<b?-1:a>b?1:0;
 const cmpTs=(a,b)=>cmp(String(a&&a.created_at||''),String(b&&b.created_at||''))||cmp(String(a.id),String(b.id));
 const grupoBy=(rows,f)=>{const m=new Map();for(const r of rows){const k=f(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return m;};
 const filasSnapshot=s=>Array.isArray(s&&s.modelo&&s.modelo.filas)?s.modelo.filas:[];
 const conceptoCheque=t=>up(t)==='FINIQUITO'?'FINIQUITO':'NOMINA';
 const normPeriodicidad=p=>up(p)==='QUINCENAL'?'QUINCENAL':'SEMANAL';
 function canonico(v){
  if(typeof v==='bigint')return v.toString();
  if(Array.isArray(v))return '['+v.map(canonico).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonico(v[k])).join(',')+'}';
  return JSON.stringify(v===undefined?null:v);
 }

 /* =================================================================
    1. Construcción: hechos atómicos sobre TODA la información, antes de
       permisos y filtros, para que la asignación no dependa de quién mira.
    ================================================================= */
 const cache=new WeakMap();
 function construir(f){
  if(f&&typeof f==='object'&&cache.has(f))return cache.get(f);
  if(!f||!f.ahora)throw Error('Faltan fuentes o la marca de tiempo `ahora`.');
  const hoy=fechaLocal(f.ahora);
  const obras=porId(f.obras),cierres=porId(f.cierres),versiones=porId(f.versiones),trab=porId(f.trabajadores);
  const flujo=new Map((f.flujo||[]).map(x=>[x.cierre_id,x]));
  const cuadrillas=porId(f.cuadrillas);
  const permisos=f.permisos||{vip:false};
  const obraVisible=id=>{const o=obras.get(id);if(!o)return false;if(Array.isArray(permisos.obras)&&!permisos.obras.includes(id))return false;if(Array.isArray(permisos.empresas)&&!permisos.empresas.includes(up(o.empresa_codigo||'PLATINUM')))return false;return true;};
  const empresaDe=id=>up((obras.get(id)||{}).empresa_codigo||'PLATINUM');

  /* Historial de adscripción (registros automáticos de la ficha). */
  const hAds=new Map();
  for(const h of f.historial||[]){
   if(!h.trabajador_id||!ACCIONES_ADSCRIPCION.includes(h.accion))continue;
   const d=h.datos_despues||{};
   if(!Object.prototype.hasOwnProperty.call(d,'contratista')&&!Object.prototype.hasOwnProperty.call(d,'id_cuadrilla'))continue;
   if(!hAds.has(h.trabajador_id))hAds.set(h.trabajador_id,[]);
   hAds.get(h.trabajador_id).push({ts:String(h.fecha||''),dia:fechaLocal(h.fecha),id:Number(h.id)||0,d});
  }
  for(const l of hAds.values())l.sort((a,b)=>cmp(a.ts,b.ts)||a.id-b.id);
  function historico(tid,fecha,clave){
   const l=hAds.get(tid)||[];let v;
   for(const e of l){if(!e.dia||e.dia>fecha)break;if(Object.prototype.hasOwnProperty.call(e.d,clave))v={valor:e.d[clave]};}
   return v; // undefined = sin evidencia
  }
  function cuadrillaEn(tid,fecha){
   const v=historico(tid,fecha,'id_cuadrilla');
   if(!v)return {cuadrilla:PENDIENTE,cuadrilla_nombre:ADSCRIPCION_PENDIENTE};
   if(!v.valor)return {cuadrilla:SIN_CUADRILLA,cuadrilla_nombre:'Sin cuadrilla'};
   const c=cuadrillas.get(v.valor);return {cuadrilla:v.valor,cuadrilla_nombre:c?c.nombre:'Cuadrilla '+String(v.valor).slice(0,8)};
  }
  function contratistaHist(tid,fecha){const v=historico(tid,fecha,'contratista');const s=v&&String(v.valor||'').trim();return s?{contratista:s,fuente_adscripcion:'HISTORIAL'}:null;}
  const pendienteAds={contratista:PENDIENTE,fuente_adscripcion:'PENDIENTE'};

  /* ---- Obligaciones ---- */
  const obligs=[];
  for(const o of f.obligaciones||[]){
   const c=cierres.get(o.cierre_id),fl=c?flujo.get(c.id):null,v=versiones.get(o.version_id);
   const exigible=!!(o.vigente&&o.cierre_id&&c&&up(c.estado)!=='CANCELADO');
   const filaW=(filasSnapshot(v&&v.snapshot).find(x=>x&&x.w&&x.w.id===o.trabajador_id)||filasSnapshot(c&&c.snapshot).find(x=>x&&x.w&&x.w.id===o.trabajador_id)||{}).w||null;
   const w=trab.get(o.trabajador_id),obra=obras.get(o.obra_id);
   const per=filaW&&filaW.periodo_pago?normPeriodicidad(filaW.periodo_pago):c&&['SEMANAL','QUINCENAL'].includes(up(c.periodo))?up(c.periodo):normPeriodicidad(w&&w.periodo_pago);
   const p=periodo(obra,Number(o.semana),per);
   let ads;
   if(String(o.contratista||'').trim())ads={contratista:String(o.contratista).trim(),fuente_adscripcion:'OBLIGACION'};
   else if(filaW&&String(filaW.contratista||'').trim())ads={contratista:String(filaW.contratista).trim(),fuente_adscripcion:'FOTOGRAFIA'};
   else ads=contratistaHist(o.trabajador_id,p.hasta)||pendienteAds;
   const estado=c?up(c.estado):'SIN_CIERRE';
   obligs.push({id:o.id,obra_id:o.obra_id,empresa:empresaDe(o.obra_id),trabajador_id:o.trabajador_id,numero:o.numero??null,nombre:o.nombre||'',
    semana:Number(o.semana),concepto:up(o.tipo),metodo:up(o.metodo),importe:mic(o.importe),cierre_id:o.cierre_id||null,cierre_origen:o.cierre_origen||null,version_id:o.version_id||null,
    exigible,estado_cierre:estado,provisional:exigible&&(REABIERTOS.includes(estado)||!!(fl&&fl.sucio)),
    periodicidad:p.periodicidad,periodo_desde:p.desde,periodo_hasta:p.hasta,fecha_pago:p.fecha_pago,...ads,...cuadrillaEn(o.trabajador_id,p.hasta),
    visible:obraVisible(o.obra_id)&&(up(o.tipo)!=='PREVISION_SOCIAL'||!!permisos.vip),
    efectivo:0n,cubierto:0n,conciliado:0n,anulado:0n,excedente:0n,por_vincular:0n,saldo:0n,ops:new Set()});
  }
  const obligPorId=new Map(obligs.map(o=>[o.id,o]));
  const exigibles=obligs.filter(o=>o.exigible);

  /* ---- Operaciones (dinero real, una vez por operación) ---- */
  const evid=porId(f.evidencias);
  const evPorPago=new Map(),evPorCheque=new Map();
  for(const e of f.evidencias||[]){if(e.pago_id)evPorPago.set(e.pago_id,e);if(e.cheque_id)evPorCheque.set(e.cheque_id,e);}
  const apsVig=(f.aplicaciones||[]).filter(a=>!a.retirado_en);
  const apsPorEvid=grupoBy(apsVig,a=>a.evidencia_id);
  const ops=[],opPorEvid=new Map();
  const claveBanco=p=>{const folio=up(p.folio_lote).replace(/\s/g,''),fe=p.fecha_pago?String(p.fecha_pago).slice(0,10):'';
   return folio&&fe?['B',p.obra_id,p.trabajador_id||'',normSemana(p.semana)??'',up(p.banco),folio,fe,mic(p.importe).toString()].join('|'):'ID:'+p.id;};
  const estadoPago=p=>{const s=up(p.estado);return s==='EXITOSO'?'EXITOSO':s==='RECHAZADO'?'RECHAZADO':'PENDIENTE';};
  const transf=(f.pagos||[]).filter(p=>up(p.medio||'TRANSFERENCIA')==='TRANSFERENCIA');
  const rechazos=transf.filter(p=>estadoPago(p)==='RECHAZADO'),pendBanco=transf.filter(p=>estadoPago(p)==='PENDIENTE');
  const llaveSinFecha=p=>[p.obra_id,p.trabajador_id||'',normSemana(p.semana)??'',up(p.banco),up(p.folio_lote).replace(/\s/g,''),mic(p.importe).toString()].join('|');
  const rechazoLlaves=new Set(rechazos.filter(p=>up(p.folio_lote).replace(/\s/g,'')).map(llaveSinFecha));
  const nuevoOp=x=>{const op={aplicaciones:[],aplicado:0n,remanente:0n,valida:true,anulada:false,reversada:false,duplicado:false,motivo_anulacion:null,pago_ids:[],representaciones:1,origenes:[],...x};ops.push(op);return op;};
  for(const [k,g] of grupoBy(transf.filter(p=>estadoPago(p)==='EXITOSO'),claveBanco)){
   g.sort(cmpTs);const p=g[0],ev=g.map(x=>evPorPago.get(x.id)).find(Boolean)||null;
   const op=nuevoOp({id:'TRF:'+p.id,medio:'TRANSFERENCIA',obra_id:p.obra_id,trabajador_id:p.trabajador_id||null,semana:normSemana(p.semana),importe:mic(p.importe),
    fecha:p.fecha_pago?String(p.fecha_pago).slice(0,10):null,fuente_fecha:'FECHA_BANCARIA',evidencia_id:ev?ev.id:null,pago_ids:g.map(x=>x.id),cheque_id:null,
    representaciones:g.length,origenes:[...new Set(g.map(x=>up(x.origen)||'SIN_ORIGEN'))].sort(),created_at:p.created_at,clave:k,folio:p.folio_lote||null,banco:p.banco||null});
   if(!k.startsWith('ID:')&&rechazoLlaves.has(llaveSinFecha(p))){op.reversada=true;op.valida=false;op.motivo_anulacion='DEVOLUCION_O_REVERSO';}
   if(ev)opPorEvid.set(ev.id,op);
  }
  /* Fechas de eventos de cheque: bitácora automática (CHEQUE-ALTA / CHEQUE-MODIFICACION). */
  const evCheque=new Map();
  for(const h of f.historial||[]){
   if(!['CHEQUE-ALTA','CHEQUE-MODIFICACION'].includes(h.accion))continue;
   const d=h.datos_despues||{},a=h.datos_antes||{},id=d.id||a.id;if(!id)continue;
   if(!evCheque.has(id))evCheque.set(id,[]);evCheque.get(id).push({ts:String(h.fecha||''),hid:Number(h.id)||0,antes:up(a.estatus),despues:up(d.estatus),dia:fechaLocal(h.fecha)});
  }
  const entregas=grupoBy((f.entregas||[]).filter(x=>x.entregado&&x.entregado_en),x=>x.cheque_id);
  function eventosCheque(q){
   const l=(evCheque.get(q.id)||[]).slice().sort((a,b)=>cmp(a.ts,b.ts)||a.hid-b.hid);
   const primero=est=>{const e=l.find(x=>x.despues===est&&x.antes!==est);return e?e.dia:null;};
   const emision=l.find(x=>['EXPEDIDO','ENTREGADO'].includes(x.despues)&&!['EXPEDIDO','ENTREGADO'].includes(x.antes));
   const ent=(entregas.get(q.id)||[]).map(x=>fechaLocal(x.entregado_en)).sort()[0]||primero('ENTREGADO');
   return {emision:emision?emision.dia:null,entrega:ent||null,cancelacion:primero('CANCELADO'),cobro:null,registro:fechaLocal(q.created_at)};
  }
  const chequesInfo=[];
  for(const q of f.cheques||[]){
   const est=up(q.estatus),ev=eventosCheque(q),elim=!!q.eliminado;
   chequesInfo.push({q,estatus:est,eliminado:elim,eventos:ev});
   if(elim||!['EXPEDIDO','ENTREGADO'].includes(est)||!(mic(q.importe)>0n))continue;
   const e=evPorCheque.get(q.id)||null;
   const op=nuevoOp({id:'CHQ:'+q.id,medio:'CHEQUE',obra_id:q.obra_id,trabajador_id:q.trabajador_id||null,semana:normSemana(q.semana),importe:mic(q.importe),
    fecha:ev.emision||ev.registro,fuente_fecha:ev.emision?'EXPEDICION':'REGISTRO_CAPTURA',evidencia_id:e?e.id:null,pago_ids:[],cheque_id:q.id,
    concepto_cheque:conceptoCheque(q.tipo_pago),situacion:est==='ENTREGADO'?'ENTREGADO':'EXPEDIDO',created_at:q.created_at,num_cheque:q.num_cheque||null,reemplaza_cheque_id:q.reemplaza_cheque_id||null});
   if(e)opPorEvid.set(e.id,op);
  }
  /* Evidencia con aplicación vigente cuyo comprobante ya no es pago válido. */
  for(const [eid,aps] of apsPorEvid){
   if(opPorEvid.has(eid))continue;const e=evid.get(eid);if(!e)continue;
   const op=nuevoOp({id:'EVD:'+eid,medio:e.cheque_id?'CHEQUE':'TRANSFERENCIA',obra_id:e.obra_id,trabajador_id:e.trabajador_id,semana:Number(e.semana),importe:mic(e.importe),
    fecha:null,fuente_fecha:'SIN_FECHA',evidencia_id:eid,pago_ids:e.pago_id?[e.pago_id]:[],cheque_id:e.cheque_id||null,created_at:e.created_at,valida:false,anulada:true,
    motivo_anulacion:e.cheque_id?'CHEQUE_NO_VIGENTE':'COMPROBANTE_NO_EXITOSO'});
   if(e.pago_id){const p=(f.pagos||[]).find(x=>x.id===e.pago_id);if(p&&p.fecha_pago){op.fecha=String(p.fecha_pago).slice(0,10);op.fuente_fecha='FECHA_BANCARIA';}}
   if(e.cheque_id){const q=(f.cheques||[]).find(x=>x.id===e.cheque_id);if(q){const ev=eventosCheque(q);op.fecha=ev.emision||ev.registro;op.fuente_fecha=ev.emision?'EXPEDICION':'REGISTRO_CAPTURA';op.concepto_cheque=conceptoCheque(q.tipo_pago);}}
   opPorEvid.set(eid,op);
  }
  const efectivaAp=new Map(); // aplicación → importe efectivo (≤ capacidad de su operación)
  const impAp=a=>efectivaAp.has(a.id)?efectivaAp.get(a.id):mic(a.importe);
  for(const op of ops){
   if(op.reversada&&op.evidencia_id&&(apsPorEvid.get(op.evidencia_id)||[]).length)op.anulada=true;
   op.aplicaciones=(op.evidencia_id&&apsPorEvid.get(op.evidencia_id)||[]).slice().sort(cmpTs);
   /* H6: una operación no aporta más que su importe. Las aplicaciones vigentes se consumen en orden
      (created_at, id); lo que excede la capacidad queda fuera del dinero y como excepción. */
   let usado=0n;op.sobreaplicada=0n;
   for(const a of op.aplicaciones){const imp=mic(a.importe),ef=minB(imp,maxB(op.importe-usado,0n));efectivaAp.set(a.id,ef);op.sobreaplicada+=imp-ef;usado+=imp;}
   op.aplicado=sum(op.aplicaciones,a=>efectivaAp.get(a.id));
  }
  /* Posible duplicado: misma persona, semana, fecha e importe con otra clave. */
  for(const g of grupoBy(ops.filter(o=>o.medio==='TRANSFERENCIA'&&o.valida&&o.trabajador_id),o=>[o.obra_id,o.trabajador_id,o.semana,o.fecha,o.importe.toString()].join('|')).values()){
   if(g.length<2)continue;g.sort((a,b)=>cmpTs(a,b));
   const conAp=g.filter(o=>o.aplicado>0n),sinAp=g.filter(o=>o.aplicado===0n);
   (conAp.length?sinAp:sinAp.slice(1)).forEach(o=>{o.duplicado=true;o.duplicado_de=(conAp[0]||sinAp[0]).id;});
  }
  /* Efectivo autorizado (finiquito con excepción expresa; sin comprobante bancario). */
  const efectivoPorOblig=new Map();
  for(const x of f.efectivo_autorizado||[]){
   const o=obligPorId.get(x.obligacion_id);if(!o||efectivoPorOblig.has(o.id))continue;
   const efe=nuevoOp({id:'EFE:'+o.id,medio:'EFECTIVO',obra_id:o.obra_id,trabajador_id:o.trabajador_id,semana:o.semana,importe:mic(x.importe),fecha:x.fecha?String(x.fecha).slice(0,10):null,
    fuente_fecha:x.fecha?'DECLARADA':'SIN_FECHA',evidencia_id:null,cheque_id:null,efectivo_obligacion:o.id,created_at:x.fecha||''});
   efectivoPorOblig.set(o.id,efe);
  }
  const opPorId=new Map(ops.map(o=>[o.id,o]));

  /* ---- Piezas ---- */
  const piezas=[];
  const pieza=(clase,op,o,importe,extra={})=>{if(importe<=0n)return;piezas.push({clase,op_id:op?op.id:null,obligacion_id:o?o.id:null,importe,...extra});if(o&&op)o.ops.add(op.id);};
  const apsPorOblig=grupoBy(apsVig,a=>a.obligacion_id);
  for(const o of obligs){
   const aps=(apsPorOblig.get(o.id)||[]).slice().sort(cmpTs);
   if(!o.exigible){for(const a of aps){const op=opPorEvid.get(a.evidencia_id);pieza('APLICADA_NO_EXIGIBLE',op,o,impAp(a),{aplicacion_id:a.id});}continue;}
   let acum=0n;
   const efe=efectivoPorOblig.get(o.id);
   if(efe){const c=minB(efe.importe,o.importe);pieza('EFECTIVO',efe,o,c);if(efe.importe>c)pieza('EXCEDENTE_APLICADO',efe,o,efe.importe-c);o.efectivo=c;acum+=c;}
   for(const a of aps){
    const op=opPorEvid.get(a.evidencia_id),imp=impAp(a),c=minB(imp,maxB(o.importe-acum,0n));
    const anul=!op||op.anulada||!op.valida;
    pieza(anul?'APLICADA_ANULADA':'APLICADA_CONCILIADA',op,o,c,{aplicacion_id:a.id});
    if(imp>c)pieza('EXCEDENTE_APLICADO',op,o,imp-c,{aplicacion_id:a.id});
    if(anul)o.anulado+=c;else o.conciliado+=c;acum+=imp;
   }
   o.excedente=maxB(acum-o.importe,0n);o.cubierto=minB(acum,o.importe);
  }
  /* Remanente de cada operación válida: se asigna provisionalmente al saldo de la misma persona-semana. */
  const exigPorGrupo=grupoBy(exigibles,o=>[o.obra_id,o.trabajador_id,o.semana].join('|'));
  const opsLibres=ops.filter(op=>op.valida&&!op.duplicado&&op.medio!=='EFECTIVO');
  for(const op of opsLibres)op.remanente=maxB(op.importe-op.aplicado,0n);
  const gruposOps=grupoBy(opsLibres.filter(op=>op.remanente>0n),op=>op.trabajador_id&&op.semana?[op.obra_id,op.trabajador_id,op.semana].join('|'):'SIN:'+op.id);
  for(const [k,lista] of gruposOps){
   const os=(exigPorGrupo.get(k)||[]).slice().sort((a,b)=>cmp(TIPOS_ORDEN.indexOf(a.concepto),TIPOS_ORDEN.indexOf(b.concepto))||cmp(a.id,b.id));
   lista.sort((a,b)=>cmp(a.fecha||'9999-99-99',b.fecha||'9999-99-99')||cmp(a.id,b.id));
   const huecos=[];let ini=0n;for(const o of os){const s=o.importe-o.cubierto;if(s>0n){huecos.push({o,ini,fin:ini+s});ini+=s;}}
   let a0=0n;
   for(const op of lista){
    const a1=a0+op.remanente;let usado=0n;
    for(const h of huecos){const x=minB(a1,h.fin)-maxB(a0,h.ini);if(x>0n){pieza('POR_VINCULAR',op,h.o,x);h.o.por_vincular+=x;usado+=x;}}
    const resto=op.remanente-usado;
    if(resto>0n)pieza(os.length?'REMANENTE_EXCEDENTE':'REMANENTE_SIN_ASIGNAR',op,null,resto,{grupo:k});
    a0=a1;
   }
  }
  for(const o of obligs)o.saldo=o.exigible?o.importe-o.cubierto-o.por_vincular:0n;

  /* Dimensiones de cada pieza. Piezas con obligación heredan la adscripción de la obligación. */
  const dimGrupo=new Map();
  function dimsSinOblig(op){
   const k=[op.obra_id,op.trabajador_id,op.semana].join('|');if(dimGrupo.has(k))return dimGrupo.get(k);
   const obra=obras.get(op.obra_id),w=op.trabajador_id?trab.get(op.trabajador_id):null;
   const per=normPeriodicidad(w&&w.periodo_pago),p=op.semana?periodo(obra,op.semana,per):{semana:null,periodicidad:per,desde:null,hasta:null,fecha_pago:null};
   const fecha=p.hasta||op.fecha||hoy;
   const ads=op.trabajador_id?(contratistaHist(op.trabajador_id,fecha)||pendienteAds):pendienteAds;
   const cu=op.trabajador_id?cuadrillaEn(op.trabajador_id,fecha):{cuadrilla:PENDIENTE,cuadrilla_nombre:ADSCRIPCION_PENDIENTE};
   const d={semana:p.semana,periodicidad:p.periodicidad,periodo_desde:p.desde,periodo_hasta:p.hasta,fecha_pago:p.fecha_pago,...ads,...cu};
   dimGrupo.set(k,d);return d;
  }
  for(const x of piezas){
   const op=x.op_id?opPorId.get(x.op_id):null,o=x.obligacion_id?obligPorId.get(x.obligacion_id):null;
   const base=o?{semana:o.semana,periodicidad:o.periodicidad,periodo_desde:o.periodo_desde,periodo_hasta:o.periodo_hasta,fecha_pago:o.fecha_pago,contratista:o.contratista,fuente_adscripcion:o.fuente_adscripcion,cuadrilla:o.cuadrilla,cuadrilla_nombre:o.cuadrilla_nombre}:dimsSinOblig(op);
   Object.assign(x,base,{obra_id:o?o.obra_id:op.obra_id,empresa:empresaDe(o?o.obra_id:op.obra_id),trabajador_id:o?o.trabajador_id:op.trabajador_id,
    concepto:o?o.concepto:(op.medio==='CHEQUE'?op.concepto_cheque:SIN_CONCEPTO),metodo:o?o.metodo:null,medio:op?op.medio:null,fecha_operacion:op?op.fecha:null,
    provisional:o?o.provisional:false});
   x.visible=obraVisible(x.obra_id)&&(x.concepto!=='PREVISION_SOCIAL'||!!permisos.vip);
  }
  /* H5: importe visible = importe − piezas que el usuario no puede ver (previsión social sin VIP). */
  const ocultoPorOp=new Map();for(const x of piezas)if(!x.visible&&x.op_id)ocultoPorOp.set(x.op_id,(ocultoPorOp.get(x.op_id)||0n)+x.importe);
  for(const op of ops){op.importe_visible=permisos.vip?op.importe:op.importe-(ocultoPorOp.get(op.id)||0n);op.sobreaplicada_visible=permisos.vip?op.sobreaplicada:(ocultoPorOp.has(op.id)?null:op.sobreaplicada);}
  for(const op of ops){const d=op.obligacion_dims||(op.trabajador_id||op.semana?dimsSinOblig(op):null);op.dims=d;op.visible=obraVisible(op.obra_id);op.empresa=empresaDe(op.obra_id);}

  /* ---- CFDI: un comprobante fiscal por UUID; PDF y XML del mismo UUID cuentan una vez. ---- */
  const uuids=new Map();
  for(const d of f.cfdi||[]){if(d.anulado||!d.uuid)continue;const k=up(d.uuid);if(!uuids.has(k))uuids.set(k,[]);uuids.get(k).push(d);}
  const fiscales=[];
  for(const [k,reps] of uuids){
   const netos=[...new Set(reps.map(r=>mic(r.neto).toString()))],tipos=[...new Set(reps.map(r=>r.tipo?up(r.tipo):null))];
   const r=reps[0];
   fiscales.push({uuid:k,obra_id:r.obra_id,trabajador_id:r.trabajador_id,desde:r.desde,hasta:r.hasta,neto:mic(r.neto),tipo:tipos.length===1?tipos[0]:null,
    contradictorio:netos.length>1||tipos.length>1||new Set(reps.map(x=>x.trabajador_id)).size>1,representaciones:reps.length,formatos:[...new Set(reps.map(x=>up(x.formato)))].sort(),documentos:reps.map(x=>x.documento_id).sort()});
  }
  const fiscPorPersona=grupoBy(fiscales,x=>x.obra_id+'|'+x.trabajador_id);
  for(const o of obligs){
   if(!o.exigible||o.concepto==='PREVISION_SOCIAL'){o.fiscal=null;continue;}
   const fs=(fiscPorPersona.get(o.obra_id+'|'+o.trabajador_id)||[]).filter(x=>x.tipo===o.concepto&&x.desde&&x.hasta&&x.desde<=o.periodo_hasta&&x.hasta>=o.periodo_desde);
   const contra=fs.some(x=>x.contradictorio),neto=sum(fs.filter(x=>!x.contradictorio),x=>x.neto);
   o.fiscal={uuids:fs.map(x=>x.uuid).sort(),neto,estado:!fs.length?'SIN_CFDI':contra?'CONTRADICTORIO':neto===o.importe?'COINCIDE':'DIFERENCIA'};
  }

  const obligPorClave=new Map(exigibles.map(o=>[[o.obra_id,o.trabajador_id,o.semana,o.concepto].join('|'),o]));
  const base={f,hoy,obligPorClave,obras,cierres,flujo,trab,permisos,obraVisible,empresaDe,obligs,obligPorId,ops,opPorId,piezas,chequesInfo,rechazos,pendBanco,fiscales,cuadrillas,historico,cuadrillaEn,contratistaHist};
  if(f&&typeof f==='object')cache.set(f,base);
  return base;
 }

 /* =================================================================
    2. Alcance y selección
    ================================================================= */
 function resolverAlcance(b,filtros){
  const fl=filtros||{};
  const perspectiva=up(fl.perspectiva||'PERIODO')==='PAGO'?'PAGO':'PERIODO';
  let desde=fl.desde,hasta=fl.hasta;
  if((!desde||!hasta)&&fl.tipo_periodo){const r=rango(up(fl.tipo_periodo),b.f.ahora,fl);desde=r.desde;hasta=r.hasta;}
  if(!fechaOK(desde)||!fechaOK(hasta)||desde>hasta)throw Error('Rango de fechas inválido.');
  const arr=x=>Array.isArray(x)?x.filter(v=>v!==null&&v!==undefined&&v!==''):[];
  const pedidas=arr(fl.obras);
  const empresa=fl.empresa?up(fl.empresa):null;
  const todas=[...b.obras.values()].filter(o=>b.obraVisible(o.id)&&(!empresa||up(o.empresa_codigo||'PLATINUM')===empresa)&&(!pedidas.length||pedidas.includes(o.id)));
  const obrasIds=todas.map(o=>o.id).sort();
  const restringidas=pedidas.filter(id=>!b.obraVisible(id)).length;
  return {perspectiva,desde,hasta,hasta_efectivo:hasta<b.hoy?hasta:b.hoy,empresa,obras:obrasIds,
   contratistas:arr(fl.contratistas),cuadrillas:arr(fl.cuadrillas),periodicidades:arr(fl.periodicidades).map(up),periodos:arr(fl.periodos).map(Number),
   conceptos:arr(fl.conceptos).map(up),medios:arr(fl.medios).map(up),comparar:fl.comparar?up(fl.comparar):null,tipo_periodo:fl.tipo_periodo?up(fl.tipo_periodo):null,
   restringido:{prevision_social:!b.permisos.vip,obras_no_autorizadas:restringidas,datos_internos:!b.permisos.vip}};
 }
 const enRango=(d,a)=>!!d&&d>=a.desde&&d<=a.hasta;
 function pasaDims(x,a,medioCampo){
  if(!a.obras.includes(x.obra_id))return false;
  if(a.contratistas.length&&!a.contratistas.includes(x.contratista))return false;
  if(a.cuadrillas.length&&!a.cuadrillas.includes(x.cuadrilla))return false;
  if(a.periodicidades.length&&!a.periodicidades.includes(x.periodicidad))return false;
  if(a.periodos.length&&!a.periodos.includes(x.semana))return false;
  if(a.conceptos.length&&!a.conceptos.includes(x.concepto||SIN_CONCEPTO))return false;
  if(a.medios.length&&medioCampo&&!a.medios.includes(x[medioCampo]||'SIN_MEDIO'))return false;
  return true;
 }
 function seleccionar(b,a){
  const obligs=b.obligs.filter(o=>o.exigible&&o.visible&&enRango(o.fecha_pago,a)&&pasaDims(o,a,'metodo'));
  const ids=new Set(obligs.map(o=>o.id));
  let piezas;
  if(a.perspectiva==='PERIODO'){
   piezas=b.piezas.filter(x=>x.visible&&(x.obligacion_id?(ids.has(x.obligacion_id)||(x.clase==='APLICADA_NO_EXIGIBLE'&&enRango(x.fecha_pago,a)&&pasaDims(x,a,'metodo'))):(enRango(x.fecha_pago,a)&&pasaDims(x,a,'medio'))));
  }else piezas=b.piezas.filter(x=>x.visible&&enRango(x.fecha_operacion,a)&&pasaDims(x,a,'medio'));
  return {obligs,piezas};
 }

 /* =================================================================
    3. Medidas
    ================================================================= */
 const DEF={
  neto_conciliado:['Importe exigible autorizado: obligaciones vigentes de la versión autorizada del cierre (NOI conciliado), por trabajador y concepto, cuyo periodo interno se paga en el rango.','Σ obligaciones.importe (vigente, cierre no cancelado, versión sellada, fecha de pago programada en rango)','obligación'],
  pagado_registrado:['PERIODO: pago registrado aplicable al exigible del rango (conciliado + pendiente de conciliación, sin exceder cada obligación). PAGO: total de operaciones reales con fecha efectiva en el rango, una vez por operación.','PERIODO: pagado_conciliado + pendiente_conciliacion · PAGO: pagado_conciliado + pendiente_conciliacion + sin_asignar + excedentes','operación × obligación'],
  pagado_conciliado:['Importe con comprobante válido (transferencia exitosa o cheque expedido/entregado) aplicado a la obligación, hasta el importe exigible.','Σ min(aplicaciones vigentes de comprobantes válidos, importe) por obligación; el excedente se asigna a las aplicaciones más recientes','aplicación'],
  saldo_por_cubrir:['Exigible sin pago registrado.','Σ max(importe − aplicado − efectivo autorizado − pendiente por vincular de la misma persona-semana, 0)','obligación'],
  excedentes:['Pagos por encima del exigible de la misma obligación o de la misma persona-semana. Nunca compensan saldos de otra persona.','Σ (aplicado − importe)⁺ por obligación + Σ remanente de operaciones sin saldo de su persona-semana','operación × obligación'],
  sin_asignar:['Operaciones registradas sin obligación exigible (sin cierre autorizado, sin trabajador u obligación archivada).','Σ remanente de operaciones sin obligación + Σ aplicaciones vigentes a obligaciones archivadas','operación'],
  cobertura:['Porcentaje del exigible cubierto con pago conciliado. No disponible si el exigible es cero.','pagado_conciliado ÷ neto_conciliado × 100 (base PERIODO)','obligación'],
  pendiente_conciliacion:['Pago registrado del alcance que todavía no está conciliado, por motivo.','Σ POR_VINCULAR + Σ aplicaciones sobre operaciones anuladas o revertidas + Σ efectivo autorizado sin comprobante','operación × obligación'],
  trabajadores_con_pago:['Personas únicas con pago registrado en el alcance.','count(distinct trabajador_id) con pagado_registrado > 0','persona'],
  promedio_pagado_trabajador:['Pago registrado atribuible a personas entre personas con pago.','Σ pagado_registrado con trabajador ÷ trabajadores_con_pago','persona'],
  mediana_pagado_trabajador:['Mediana del pago registrado por persona.','mediana(Σ pagado_registrado por persona)','persona'],
  saldo_por_antiguedad:['Saldo por cubrir por días transcurridos desde la fecha de pago programada.','hoy − fecha_pago: por vencer (<0), 0–7, 8–14, 15–30, 31–60, >60','obligación'],
  cheques_por_estado:['Cheques del alcance por estatus real (no eliminados). Cobro bancario no se registra en la plataforma.','count, Σ importe por estatus (PENDIENTE no es pago; CANCELADO no cuenta)','cheque'],
  trabajadores_pago_parcial:['Personas con alguna obligación con pago registrado mayor a cero y menor al importe.','count(distinct trabajador) con 0 < pagado_registrado(obligación) < importe','persona'],
  concentracion_contratista:['Participación del contratista con mayor exigible (adscripción histórica).','max(neto por contratista) ÷ neto_conciliado × 100','obligación'],
  percepciones_retenciones:['Percepciones y deducciones del reporte NOI importado del periodo.','Σ control_desglose_noi.percepciones; deducciones = ISR + IMSS + otras','persona × semana × concepto NOI'],
  bruto:['Percepciones brutas según el reporte NOI importado.','Σ control_desglose_noi.percepciones','persona × semana × concepto NOI'],
  costo_patronal:['Costo patronal (cuotas IMSS, INFONAVIT, ISN). La plataforma no registra una base de cálculo explícita.','No disponible','—'],
  respaldo_fiscal:['Neto timbrado (CFDI) por UUID único asociado a las obligaciones; PDF y XML del mismo UUID cuentan una vez.','Σ neto CFDI por UUID no contradictorio; estado por obligación: COINCIDE | DIFERENCIA | SIN_CFDI | CONTRADICTORIO','UUID'],
  plantilla_actual:['Padrón actual: personas activas no eliminadas. No depende del rango.','count(trabajadores estatus = ACTIVO, eliminado = false)','persona'],
  altas:['Altas efectivas con fecha en el rango.','count(distinct trabajador, fecha_alta)','evento'],
  bajas:['Bajas efectivas con fecha en el rango (cada episodio).','count(distinct trabajador, fecha_baja) de bitácora BAJA y ficha','evento'],
  reingresos:['Reingresos efectivos con fecha en el rango (cada episodio).','count(distinct trabajador, fecha_reingreso) de bitácora REACTIVACION y ficha','evento'],
  rotacion:['Bajas del rango entre plantilla promedio por episodios.','bajas ÷ ((activos al inicio + activos al cierre) ÷ 2) × 100','evento']
 };
 function medida(clave,valor,extra={}){const d=DEF[clave]||['','',''];return {clave,valor,unidad:extra.unidad||'MXN',grano:d[2],perspectiva_aplicada:extra.perspectiva_aplicada||null,definicion:d[0],formula:d[1],provisional:!!extra.provisional,disponible:extra.disponible!==false,motivo_no_disponible:extra.motivo||null,desglose:extra.desglose||{},comparable:null,variacion:null};}
 const sumaClase=(ps,clases)=>sum(ps.filter(x=>clases.includes(x.clase)),x=>x.importe);
 const MOTIVOS_PENDIENTE={POR_VINCULAR:'Operación registrada sin aplicar a su obligación',APLICADA_ANULADA:'Aplicación vigente sobre operación revertida, cancelada o no exitosa',EFECTIVO:'Efectivo autorizado sin comprobante bancario'};
 const REG_PERIODO=['APLICADA_CONCILIADA','APLICADA_ANULADA','POR_VINCULAR','EFECTIVO'];
 const REG_PAGO=['APLICADA_CONCILIADA','APLICADA_ANULADA','POR_VINCULAR','EFECTIVO','EXCEDENTE_APLICADO','REMANENTE_EXCEDENTE','REMANENTE_SIN_ASIGNAR','APLICADA_NO_EXIGIBLE'];

 function calidadCentros(b,a,sel){
  const out=[];
  for(const oid of a.obras){
   const obra=b.obras.get(oid),errores=(b.f.errores||[]).filter(e=>!e.obra_id||e.obra_id===oid);
   const pers=new Set([...b.trab.values()].filter(w=>w.obra_id===oid&&!w.eliminado).map(w=>normPeriodicidad(w.periodo_pago)));
   for(const o of b.obligs)if(o.obra_id===oid&&o.exigible)pers.add(o.periodicidad);
   const persSel=[...pers].filter(p=>!a.periodicidades.length||a.periodicidades.includes(p)).sort();
   const cs=[...b.cierres.values()].filter(c=>c.obra_id===oid&&up(c.estado)!=='CANCELADO');
   const esperados=[];
   const hEf=a.hasta<b.hoy?a.hasta:b.hoy;
   for(const per of persSel){
    const vistos=new Map();
    for(let n=1;n<=53;n++){
     if(a.periodos.length&&!a.periodos.includes(n))continue;
     const p=periodo(obra,n,per);if(p.fecha_pago<a.desde||p.fecha_pago>hEf)continue;
     const k=per+'|'+p.desde;if(!vistos.has(k))vistos.set(k,{periodicidad:per,desde:p.desde,hasta:p.hasta,fecha_pago:p.fecha_pago,semanas:[]});vistos.get(k).semanas.push(n);
    }
    for(const e of vistos.values()){
     const cubre=cs.filter(c=>e.semanas.includes(Number(c.semana))&&(up(c.periodo)==='TODOS'||up(c.periodo)===per));
     const aut=cubre.some(c=>AUTORIZADOS.includes(up(c.estado))&&!((b.flujo.get(c.id)||{}).sucio));
     e.estado=aut?'AUTORIZADO':cubre.length?'PROVISIONAL':'FALTANTE';e.semana=e.semanas[0];esperados.push(e);
    }
   }
   const os=sel.obligs.filter(o=>o.obra_id===oid),ps=sel.piezas.filter(x=>x.obra_id===oid);
   const neto=sum(os,o=>o.importe),reg=sumaClase(ps,REG_PAGO);
   const falt=esperados.filter(e=>e.estado==='FALTANTE'),prov=esperados.filter(e=>e.estado==='PROVISIONAL');
   let estado;
   if(errores.length)estado='ERROR_LECTURA';
   else if(!os.length&&!ps.length&&!esperados.some(e=>e.estado!=='FALTANTE'))estado='SIN_REGISTROS';
   else if(falt.length||prov.length||os.some(o=>o.provisional))estado='INCOMPLETO';
   else if(neto===0n&&reg===0n)estado='CERO_CONFIRMADO';
   else estado='COMPLETO';
   out.push({obra_id:oid,obra:obra.nombre||'',empresa:up(obra.empresa_codigo||'PLATINUM'),estado,periodos_esperados:esperados.length,periodos_autorizados:esperados.filter(e=>e.estado==='AUTORIZADO').length,
    periodos_provisionales:prov.length,periodos_faltantes:falt.map(e=>({periodicidad:e.periodicidad,semana:e.semana,desde:e.desde,hasta:e.hasta,fecha_pago:e.fecha_pago})),
    errores:errores.map(e=>String(e.mensaje||e.fuente||'Error de lectura'))});
  }
  return out;
 }

 function eventosPlantilla(b){
  if(b._eventos)return b._eventos;
  const ev=new Map();const add=(tid,tipo,fecha,obra,origen)=>{if(!fechaOK(fecha))return;const k=tid+'|'+tipo+'|'+fecha;if(!ev.has(k))ev.set(k,{trabajador_id:tid,tipo,fecha:String(fecha).slice(0,10),obra_id:obra,origen});};
  const porT=grupoBy((b.f.historial||[]).filter(h=>h.trabajador_id&&['BAJA','REACTIVACION','MODIFICACION','CORRECCION_REINGRESO'].includes(h.accion)),h=>h.trabajador_id);
  for(const [tid,hs] of porT){
   hs.sort((x,y)=>cmp(String(x.fecha),String(y.fecha))||(Number(x.id)||0)-(Number(y.id)||0));
   const bajas=new Map(),reing=new Map();
   for(const h of hs){
    const a=h.datos_antes||{},d=h.datos_despues||{};
    if(h.accion==='BAJA'&&d.fecha_baja)bajas.set(String(d.fecha_baja).slice(0,10),h.obra_id);
    else if(h.accion==='REACTIVACION'&&d.fecha_reingreso)reing.set(String(d.fecha_reingreso).slice(0,10),h.obra_id);
    else{
     if(up(a.estatus)==='BAJA'&&up(d.estatus)==='BAJA'&&a.fecha_baja&&d.fecha_baja&&a.fecha_baja!==d.fecha_baja&&bajas.has(String(a.fecha_baja).slice(0,10))){bajas.delete(String(a.fecha_baja).slice(0,10));bajas.set(String(d.fecha_baja).slice(0,10),h.obra_id);}
     if(up(d.estatus)!=='BAJA'&&a.fecha_reingreso&&d.fecha_reingreso&&a.fecha_reingreso!==d.fecha_reingreso&&reing.has(String(a.fecha_reingreso).slice(0,10))){reing.delete(String(a.fecha_reingreso).slice(0,10));reing.set(String(d.fecha_reingreso).slice(0,10),h.obra_id);}
    }
   }
   for(const [fe,o] of bajas)add(tid,'BAJA',fe,o,'HISTORIAL');
   for(const [fe,o] of reing)add(tid,'REINGRESO',fe,o,'HISTORIAL');
  }
  for(const w of b.trab.values()){
   if(w.eliminado)continue;
   add(w.id,'ALTA',w.fecha_alta,w.obra_id,'FICHA');
   if(up(w.estatus)==='BAJA')add(w.id,'BAJA',w.fecha_baja,w.obra_id,'FICHA');
   if(w.fecha_reingreso)add(w.id,'REINGRESO',w.fecha_reingreso,w.obra_id,'FICHA');
  }
  const lista=[...ev.values()].filter(e=>{const w=b.trab.get(e.trabajador_id);return w&&!w.eliminado;}).sort((x,y)=>cmp(x.trabajador_id,y.trabajador_id)||cmp(x.fecha,y.fecha)||cmp(['ALTA','REINGRESO','BAJA'].indexOf(x.tipo),['ALTA','REINGRESO','BAJA'].indexOf(y.tipo)));
  b._eventos=lista;return lista;
 }
 function activosEn(b,a,fecha){
  let n=0;
  for(const [tid,evs] of grupoBy(eventosPlantilla(b),e=>e.trabajador_id)){
   let ult=null;for(const e of evs){if(e.fecha>fecha)break;ult=e;}
   if(!ult||ult.tipo==='BAJA')continue;
   const w=b.trab.get(tid);
   if(!a.obras.includes(ult.obra_id))continue;
   if(a.periodicidades.length&&!a.periodicidades.includes(normPeriodicidad(w.periodo_pago)))continue;
   if(!pasaAdsEvento(b,a,tid,fecha))continue;n++;
  }
  return n;
 }
 function pasaAdsEvento(b,a,tid,fecha){
  if(a.contratistas.length){const c=b.contratistaHist(tid,fecha);if(!a.contratistas.includes(c?c.contratista:PENDIENTE))return false;}
  if(a.cuadrillas.length&&!a.cuadrillas.includes(b.cuadrillaEn(tid,fecha).cuadrilla))return false;
  return true;
 }
 function plantillaMedidas(b,a){
  const evs=eventosPlantilla(b).filter(e=>a.obras.includes(e.obra_id)&&enRango(e.fecha,a)&&(!a.periodicidades.length||a.periodicidades.includes(normPeriodicidad(b.trab.get(e.trabajador_id).periodo_pago)))&&pasaAdsEvento(b,a,e.trabajador_id,e.fecha));
  const n=t=>evs.filter(e=>e.tipo===t).length;
  const padron=[...b.trab.values()].filter(w=>!w.eliminado&&up(w.estatus)==='ACTIVO'&&a.obras.includes(w.obra_id)&&(!a.periodicidades.length||a.periodicidades.includes(normPeriodicidad(w.periodo_pago)))
   &&(!a.contratistas.length||a.contratistas.includes(String(w.contratista||'').trim()||PENDIENTE))&&(!a.cuadrillas.length||a.cuadrillas.includes(w.id_cuadrilla||SIN_CUADRILLA)));
  const ini=activosEn(b,a,sumar(a.desde,-1)),fin=activosEn(b,a,a.hasta_efectivo),bajas=n('BAJA');
  const prom2=BigInt(ini+fin);
  return {
   plantilla_actual:medida('plantilla_actual',padron.length,{unidad:'PERSONAS',desglose:{etiqueta:'Padrón actual al '+b.hoy+'; no depende del rango',fecha_corte:b.hoy}}),
   altas:medida('altas',n('ALTA'),{unidad:'EVENTOS'}),bajas:medida('bajas',bajas,{unidad:'EVENTOS'}),reingresos:medida('reingresos',n('REINGRESO'),{unidad:'EVENTOS'}),
   rotacion:medida('rotacion',prom2===0n?null:pct(BigInt(bajas)*2n,prom2),{unidad:'PORCENTAJE',disponible:prom2!==0n,motivo:prom2===0n?'Sin plantilla en el rango':null,
    desglose:{bajas,activos_inicio:ini,activos_cierre:fin,fecha_inicio:sumar(a.desde,-1),fecha_cierre:a.hasta_efectivo,formula_visible:`${bajas} ÷ ((${ini} + ${fin}) ÷ 2) × 100`}}),
   _eventos:evs
  };
 }

 function chequesSeleccion(b,a){
  const res=[];
  for(const c of b.chequesInfo){
   if(c.eliminado)continue;const q=c.q;if(!a.obras.includes(q.obra_id)||!b.obraVisible(q.obra_id))continue;
   const sem=normSemana(q.semana),w=q.trabajador_id?b.trab.get(q.trabajador_id):null,obra=b.obras.get(q.obra_id);
   const o=b.obligPorClave.get([q.obra_id,q.trabajador_id,sem,conceptoCheque(q.tipo_pago)].join('|'));
   const per=o?o.periodicidad:normPeriodicidad(w&&w.periodo_pago),p=sem?periodo(obra,sem,per):null;
   const fecha=a.perspectiva==='PERIODO'?(p&&p.fecha_pago):(c.estatus==='CANCELADO'?c.eventos.cancelacion:['EXPEDIDO','ENTREGADO'].includes(c.estatus)?(c.eventos.emision||c.eventos.registro):c.eventos.registro);
   if(!enRango(fecha,a))continue;
   const dims={obra_id:q.obra_id,semana:sem,periodicidad:per,concepto:conceptoCheque(q.tipo_pago),...(o?{contratista:o.contratista,cuadrilla:o.cuadrilla}:(q.trabajador_id&&p?{...(b.contratistaHist(q.trabajador_id,p.hasta)||{contratista:PENDIENTE}),cuadrilla:b.cuadrillaEn(q.trabajador_id,p.hasta).cuadrilla}:{contratista:PENDIENTE,cuadrilla:PENDIENTE}))};
   if(!pasaDims(dims,a,null))continue;
   if(a.medios.length&&!a.medios.includes('CHEQUE'))continue;
   res.push({c,dims,obligacion:o||null,fecha});
  }
  return res;
 }

 function calcularNucleo(b,a){
  const sel=seleccionar(b,a),{obligs,piezas}=sel;
  const persp=a.perspectiva;
  const neto=sum(obligs,o=>o.importe);
  // Base PERIODO de las piezas para cobertura/saldo (independiente de la perspectiva).
  const selP=persp==='PERIODO'?sel:seleccionar(b,{...a,perspectiva:'PERIODO'});
  const conc=sumaClase(piezas,['APLICADA_CONCILIADA']);
  const concP=sumaClase(selP.piezas,['APLICADA_CONCILIADA']);
  const pv=sumaClase(piezas,['POR_VINCULAR']),anul=sumaClase(piezas,['APLICADA_ANULADA']),efe=sumaClase(piezas,['EFECTIVO']);
  const pend=pv+anul+efe;
  const excAp=sumaClase(piezas,['EXCEDENTE_APLICADO']),excRem=sumaClase(piezas,['REMANENTE_EXCEDENTE']);
  const sinRem=sumaClase(piezas,['REMANENTE_SIN_ASIGNAR']),sinArch=sumaClase(piezas,['APLICADA_NO_EXIGIBLE']);
  const reg=persp==='PERIODO'?conc+pend:conc+pend+excAp+excRem+sinRem+sinArch;
  const saldo=sum(obligs,o=>o.saldo);
  const opsDe=(clases)=>new Set(piezas.filter(x=>clases.includes(x.clase)).map(x=>x.op_id)).size;
  const regPiezas=piezas.filter(x=>(persp==='PERIODO'?REG_PERIODO:REG_PAGO).includes(x.clase));
  const porPersona=new Map();for(const x of regPiezas)if(x.trabajador_id)porPersona.set(x.trabajador_id,(porPersona.get(x.trabajador_id)||0n)+x.importe);
  const totales=[...porPersona.values()].filter(v=>v>0n).sort((x,y)=>x<y?-1:x>y?1:0);
  const nPers=totales.length,sumPers=sum(totales,v=>v);
  const mediana=!nPers?null:nPers%2?centavos(totales[(nPers-1)/2]):Number(divRedondeo(totales[nPers/2-1]+totales[nPers/2],20000n))/100;
  const provisional=a.hasta>=b.hoy||obligs.some(o=>o.provisional)||pv>0n;
  const opProv={provisional};
  // Antigüedad del saldo
  const cubetas={por_vencer:0n,'0_7':0n,'8_14':0n,'15_30':0n,'31_60':0n,mas_60:0n};
  for(const o of obligs){if(o.saldo<=0n)continue;const d=difDias(o.fecha_pago,b.hoy);const k=d<0?'por_vencer':d<=7?'0_7':d<=14?'8_14':d<=30?'15_30':d<=60?'31_60':'mas_60';cubetas[k]+=o.saldo;}
  // Parciales
  const parciales=new Set(obligs.filter(o=>{const r=o.cubierto+o.por_vincular;return r>0n&&r<o.importe;}).map(o=>o.trabajador_id));
  // Concentración
  const porContr=new Map();for(const o of obligs)porContr.set(o.contratista,(porContr.get(o.contratista)||0n)+o.importe);
  const contrs=[...porContr.entries()].sort((x,y)=>(y[1]>x[1]?1:y[1]<x[1]?-1:0)||cmp(x[0],y[0]));
  // Cheques
  const cheques=chequesSeleccion(b,a),porEst={};
  for(const est of ['PENDIENTE','EXPEDIDO','ENTREGADO','CANCELADO'])porEst[est]={cantidad:0,importe:0n};
  let reposiciones=0;
  for(const {c} of cheques){const e=porEst[c.estatus]||(porEst[c.estatus]={cantidad:0,importe:0n});e.cantidad++;e.importe+=mic(c.q.importe);if(c.q.reemplaza_cheque_id)reposiciones++;}
  // NOI
  const desg=(b.f.desglose_noi||[]).filter(r=>{
   if(!a.obras.includes(r.obra_id))return false;const w=r.trabajador_id?b.trab.get(r.trabajador_id):null;const per=normPeriodicidad(w&&w.periodo_pago);
   const p=periodo(b.obras.get(r.obra_id),Number(r.semana),per);
   if(Number(p.fecha_pago.slice(0,4))!==Number(r.anio)&&Number(p.desde.slice(0,4))!==Number(r.anio))return false;
   if(a.periodos.length&&!a.periodos.includes(Number(r.semana)))return false;
   if(a.conceptos.length&&!a.conceptos.includes(up(r.tipo_calculo)))return false;
   return enRango(p.fecha_pago,a);
  });
  const perc=sum(desg,r=>mic(r.percepciones)),isr=sum(desg,r=>mic(r.isr)),imss=sum(desg,r=>mic(r.imss)),ded=sum(desg,r=>mic(r.total_deducciones)),sub=sum(desg,r=>mic(r.subsidio)),netoNoi=sum(desg,r=>mic(r.neto));
  // Respaldo fiscal
  const fisc={COINCIDE:0,DIFERENCIA:0,SIN_CFDI:0,CONTRADICTORIO:0};let netoTim=0n,difFisc=0n;const uu=new Set();
  for(const o of obligs){if(!o.fiscal)continue;fisc[o.fiscal.estado]++;if(o.fiscal.estado!=='CONTRADICTORIO'){for(const u of o.fiscal.uuids)if(!uu.has(u)){uu.add(u);}}if(o.fiscal.estado==='DIFERENCIA'){const d=o.fiscal.neto-o.importe;difFisc+=d<0n?-d:d;}}
  for(const u of uu){const x=b.fiscales.find(y=>y.uuid===u);if(x&&!x.contradictorio)netoTim+=x.neto;}
  const plantilla=plantillaMedidas(b,a);
  const motivos=[['POR_VINCULAR',pv],['APLICADA_ANULADA',anul],['EFECTIVO',efe]].map(([k,v])=>({motivo:k==='APLICADA_ANULADA'?'OPERACION_ANULADA':k==='EFECTIVO'?'EFECTIVO_SIN_COMPROBANTE':k,descripcion:MOTIVOS_PENDIENTE[k],importe:centavos(v),operaciones:opsDe([k])})).filter(x=>x.importe!==0||x.operaciones);
  const M={
   neto_conciliado:medida('neto_conciliado',centavos(neto),{...opProv,perspectiva_aplicada:'PERIODO',desglose:{
    por_concepto:Object.fromEntries(['NOMINA','FINIQUITO','PREVISION_SOCIAL'].filter(k=>k!=='PREVISION_SOCIAL'||b.permisos.vip).map(k=>[k,centavos(sum(obligs.filter(o=>o.concepto===k),o=>o.importe))])),
    obligaciones:obligs.length,de_cierres_reabiertos:centavos(sum(obligs.filter(o=>o.provisional),o=>o.importe))}}),
   pagado_registrado:medida('pagado_registrado',centavos(reg),{...opProv,perspectiva_aplicada:persp,desglose:{conciliado:centavos(conc),pendiente_conciliacion:centavos(pend),
    excedentes:persp==='PAGO'?centavos(excAp+excRem):0,sin_asignar:persp==='PAGO'?centavos(sinRem+sinArch):0,operaciones:new Set(regPiezas.map(x=>x.op_id)).size,
    por_medio:Object.fromEntries(['TRANSFERENCIA','CHEQUE','EFECTIVO'].map(m=>[m,centavos(sum(regPiezas.filter(x=>x.medio===m),x=>x.importe))])),
    entrega_pendiente:centavos(sum(regPiezas.filter(x=>x.medio==='CHEQUE'&&(b.opPorId.get(x.op_id)||{}).situacion==='EXPEDIDO'),x=>x.importe)),
    excluidos:{posibles_duplicados:excluidos(b,a,'duplicado'),revertidos_sin_aplicacion:excluidos(b,a,'reversada')}}}),
   pagado_conciliado:medida('pagado_conciliado',centavos(conc),{...opProv,perspectiva_aplicada:persp,desglose:{operaciones:opsDe(['APLICADA_CONCILIADA']),
    por_medio:Object.fromEntries(['TRANSFERENCIA','CHEQUE'].map(m=>[m,centavos(sum(piezas.filter(x=>x.clase==='APLICADA_CONCILIADA'&&x.medio===m),x=>x.importe))])),
    cheques_por_entregar:centavos(sum(piezas.filter(x=>x.clase==='APLICADA_CONCILIADA'&&x.medio==='CHEQUE'&&(b.opPorId.get(x.op_id)||{}).situacion==='EXPEDIDO'),x=>x.importe))}}),
   saldo_por_cubrir:medida('saldo_por_cubrir',centavos(saldo),{...opProv,perspectiva_aplicada:'PERIODO',desglose:{obligaciones_con_saldo:obligs.filter(o=>o.saldo>0n).length,personas_con_saldo:new Set(obligs.filter(o=>o.saldo>0n).map(o=>o.trabajador_id)).size}}),
   excedentes:medida('excedentes',centavos(excAp+excRem),{...opProv,perspectiva_aplicada:persp,desglose:{aplicado_sobre_obligacion:centavos(excAp),remanente_sin_saldo:centavos(excRem),operaciones:opsDe(['EXCEDENTE_APLICADO','REMANENTE_EXCEDENTE'])}}),
   sin_asignar:medida('sin_asignar',centavos(sinRem+sinArch),{...opProv,perspectiva_aplicada:persp,desglose:{sin_obligacion:centavos(sinRem),obligacion_archivada:centavos(sinArch),operaciones:opsDe(['REMANENTE_SIN_ASIGNAR','APLICADA_NO_EXIGIBLE'])}}),
   cobertura:medida('cobertura',neto===0n?null:pct(concP,neto),{...opProv,unidad:'PORCENTAJE',perspectiva_aplicada:'PERIODO',disponible:neto!==0n,motivo:neto===0n?'No disponible: sin importe exigible en el alcance':null,
    desglose:{numerador:centavos(concP),denominador:centavos(neto),cobertura_registrada:neto===0n?null:pct(sumaClase(selP.piezas,REG_PERIODO),neto)}}),
   pendiente_conciliacion:medida('pendiente_conciliacion',centavos(pend),{...opProv,perspectiva_aplicada:persp,desglose:{operaciones:opsDe(['POR_VINCULAR','APLICADA_ANULADA','EFECTIVO']),por_motivo:motivos}}),
   trabajadores_con_pago:medida('trabajadores_con_pago',nPers,{...opProv,unidad:'PERSONAS',perspectiva_aplicada:persp}),
   promedio_pagado_trabajador:medida('promedio_pagado_trabajador',nPers?Number(divRedondeo(sumPers,BigInt(nPers)*10000n))/100:null,{...opProv,perspectiva_aplicada:persp,disponible:nPers>0,motivo:nPers?null:'No disponible: sin personas con pago'}),
   mediana_pagado_trabajador:medida('mediana_pagado_trabajador',mediana,{...opProv,perspectiva_aplicada:persp,disponible:nPers>0,motivo:nPers?null:'No disponible: sin personas con pago'}),
   saldo_por_antiguedad:medida('saldo_por_antiguedad',centavos(saldo),{...opProv,perspectiva_aplicada:'PERIODO',desglose:Object.fromEntries(Object.entries(cubetas).map(([k,v])=>[k,centavos(v)]))}),
   cheques_por_estado:medida('cheques_por_estado',cheques.length,{unidad:'CHEQUES',perspectiva_aplicada:persp,desglose:{...Object.fromEntries(Object.entries(porEst).map(([k,v])=>[k,{cantidad:v.cantidad,importe:centavos(v.importe)}])),reposiciones,cobro:'No registrado en la plataforma'}}),
   trabajadores_pago_parcial:medida('trabajadores_pago_parcial',parciales.size,{...opProv,unidad:'PERSONAS',perspectiva_aplicada:'PERIODO'}),
   concentracion_contratista:medida('concentracion_contratista',neto===0n||!contrs.length?null:pct(contrs[0][1],neto),{unidad:'PORCENTAJE',perspectiva_aplicada:'PERIODO',disponible:neto!==0n,motivo:neto===0n?'No disponible: sin importe exigible':null,
    desglose:{contratistas:contrs.map(([k,v])=>({contratista:k===PENDIENTE?ADSCRIPCION_PENDIENTE:k,clave:k,neto:centavos(v),porcentaje:pct(v,neto)}))}}),
   percepciones_retenciones:medida('percepciones_retenciones',desg.length?centavos(perc):null,{disponible:desg.length>0,motivo:desg.length?null:'No disponible: sin reporte NOI importado en el alcance',perspectiva_aplicada:'PERIODO',
    desglose:{percepciones:centavos(perc),isr:centavos(isr),imss:centavos(imss),subsidio:centavos(sub),total_deducciones:centavos(ded),neto_noi:centavos(netoNoi),filas:desg.length}}),
   bruto:medida('bruto',desg.length?centavos(perc):null,{disponible:desg.length>0,motivo:desg.length?null:'No disponible: sin reporte NOI importado en el alcance',perspectiva_aplicada:'PERIODO'}),
   costo_patronal:medida('costo_patronal',null,{disponible:false,motivo:'No disponible: no hay base de cálculo explícita de cuotas patronales en la plataforma'}),
   respaldo_fiscal:medida('respaldo_fiscal',centavos(netoTim),{perspectiva_aplicada:'PERIODO',desglose:{obligaciones:fisc,uuids:uu.size,diferencia_absoluta:centavos(difFisc)}}),
   plantilla_actual:plantilla.plantilla_actual,altas:plantilla.altas,bajas:plantilla.bajas,reingresos:plantilla.reingresos,rotacion:plantilla.rotacion
  };
  return {M,sel,provisional,calidad:calidadCentros(b,a,selP)};
 }
 function excluidos(b,a,bandera){
  const os=b.ops.filter(op=>op[bandera]&&op.visible&&a.obras.includes(op.obra_id)&&!(bandera==='reversada'&&op.aplicado>0n)&&(a.perspectiva==='PAGO'?enRango(op.fecha,a):op.dims&&enRango(op.dims.fecha_pago,a)));
  return {importe:centavos(sum(os,o=>o.importe_visible)),operaciones:os.length};
 }

 const VARIABLES=['neto_conciliado','pagado_registrado','pagado_conciliado','saldo_por_cubrir','excedentes','sin_asignar','cobertura','pendiente_conciliacion','trabajadores_con_pago','promedio_pagado_trabajador','mediana_pagado_trabajador','trabajadores_pago_parcial','bruto','altas','bajas','reingresos','rotacion'];
 const MONETARIAS=['neto_conciliado','pagado_registrado','pagado_conciliado','saldo_por_cubrir','excedentes','sin_asignar','pendiente_conciliacion'];
 function variacionDe(act,comp,unidad){
  if(act===null||comp===null||act===undefined||comp===undefined)return {absoluta:null,porcentaje:null};
  const A=mic(act),C=mic(comp),abs=centavos(A-C);
  return {absoluta:abs,porcentaje:unidad==='PORCENTAJE'||C===0n?null:pct(A-C,C<0n?-C:C)};
 }
 function huella(M){
  return 'v1|'+MONETARIAS.map(k=>k+'='+Math.round(M[k].valor*100)).join('|')+'|personas='+M.trabajadores_con_pago.valor;
 }

 /* =================================================================
    4. API pública (formas de las acciones del RPC)
    ================================================================= */
 function calcular(fuentes,filtros,opciones){
  const b=construir(fuentes),a=resolverAlcance(b,filtros);
  const {M,provisional,calidad}=calcularNucleo(b,a);
  let comp=null;
  const c=comparable(a.desde,a.hasta,a.comparar,b.hoy);
  if(c){
   const motivos=[];
   if(c.futuro)motivos.push('RANGO_FUTURO');
   if(c.truncado)motivos.push('PERIODO_EN_CURSO');
   let calC=[];
   if(!c.futuro){
    const ac={...a,desde:c.desde,hasta:c.hasta,hasta_efectivo:c.hasta<b.hoy?c.hasta:b.hoy};
    const r=calcularNucleo(b,ac);calC=r.calidad;
    for(const k of VARIABLES){M[k].comparable={valor:r.M[k].valor,desde:c.desde,hasta:c.hasta};M[k].variacion={...variacionDe(M[k].valor,r.M[k].valor,M[k].unidad),incompleto:false};}
    const minInicio=a.obras.map(id=>inicioObra(b.obras.get(id))).sort()[0];
    if(minInicio&&c.desde<minInicio)motivos.push('COMPARABLE_ANTES_DEL_CALENDARIO');
   }
   if(calidad.some(x=>x.estado!=='COMPLETO'&&x.estado!=='CERO_CONFIRMADO'))motivos.push('CALIDAD_ACTUAL_INCOMPLETA');
   if(calC.some(x=>x.estado!=='COMPLETO'&&x.estado!=='CERO_CONFIRMADO'))motivos.push('CALIDAD_COMPARABLE_INCOMPLETA');
   const inc=motivos.length>0;
   for(const k of VARIABLES)if(M[k].variacion)M[k].variacion.incompleto=inc;
   comp={desde:c.desde,hasta:c.hasta,modo:c.modo,incompleto:inc,motivos,calidad:calC};
  }
  M.variacion={clave:'variacion',valor:comp?Object.fromEntries(VARIABLES.map(k=>[k,M[k].variacion])):null,unidad:'MIXTA',grano:'medida',perspectiva_aplicada:a.perspectiva,
   definicion:'Diferencia de cada medida contra el periodo comparable equivalente (anterior o mismo periodo del año anterior), absoluta y porcentual; incompleto si alguno de los dos periodos no está completo o sigue en curso.',
   formula:'absoluta = actual − comparable; % = absoluta ÷ |comparable| × 100 (null si comparable = 0)',provisional,disponible:!!comp&&!!comp.desde,motivo_no_disponible:comp?(comp.desde?null:'Rango futuro'):'Sin comparación solicitada',
   desglose:comp?{desde:comp.desde,hasta:comp.hasta,modo:comp.modo,incompleto:comp.incompleto,motivos:comp.motivos}:{},comparable:null,variacion:null};
  return {version:VERSION,accion:'RESUMEN',alcance:a,actualizado_en:String(fuentes.ahora),hoy:b.hoy,provisional,medidas:M,calidad,comparable:comp,huella:huella(M)};
 }
 function paginar(filas,op){const por=Math.max(1,Math.min(500,Number(op&&op.por_pagina)||100)),pag=Math.max(1,Number(op&&op.pagina)||1);return {filas:filas.slice((pag-1)*por,pag*por),total:filas.length,pagina:pag,por_pagina:por};}

 function tendencia(fuentes,filtros){
  const b=construir(fuentes),a=resolverAlcance(b,filtros),sel=seleccionar(b,a);
  const filas=new Map();
  const fila=(k,base)=>{if(!filas.has(k))filas.set(k,{...base,neto_conciliado:0n,pagado_registrado:0n,pagado_conciliado:0n,pendiente_conciliacion:0n,saldo_por_cubrir:0n,excedentes:0n,sin_asignar:0n,semanas:new Set()});return filas.get(k);};
  const obraN=id=>(b.obras.get(id)||{}).nombre||'';
  if(a.perspectiva==='PERIODO'){
   for(const o of sel.obligs){const r=fila([o.obra_id,o.periodicidad,o.periodo_desde].join('|'),{obra_id:o.obra_id,obra:obraN(o.obra_id),periodicidad:o.periodicidad,periodo_desde:o.periodo_desde,periodo_hasta:o.periodo_hasta,fecha_pago:o.fecha_pago});r.neto_conciliado+=o.importe;r.saldo_por_cubrir+=o.saldo;r.semanas.add(o.semana);}
   for(const x of sel.piezas){if(!x.periodo_desde)continue;const r=fila([x.obra_id,x.periodicidad,x.periodo_desde].join('|'),{obra_id:x.obra_id,obra:obraN(x.obra_id),periodicidad:x.periodicidad,periodo_desde:x.periodo_desde,periodo_hasta:x.periodo_hasta,fecha_pago:x.fecha_pago});acumularPieza(r,x,'PERIODO');if(x.semana)r.semanas.add(x.semana);}
  }else{
   for(const x of sel.piezas){const obra=b.obras.get(x.obra_id),n=semanaInterna(obra,x.fecha_operacion),p=periodo(obra,n,'SEMANAL');
    const r=fila([x.obra_id,'PAGO',p.desde].join('|'),{obra_id:x.obra_id,obra:obraN(x.obra_id),periodicidad:'SEMANA_DE_PAGO',periodo_desde:p.desde,periodo_hasta:p.hasta,fecha_pago:null});acumularPieza(r,x,'PAGO');r.semanas.add(n);}
  }
  const out=[...filas.values()].map(r=>({obra_id:r.obra_id,obra:r.obra,periodicidad:r.periodicidad,semanas:[...r.semanas].sort((x,y)=>x-y),periodo_desde:r.periodo_desde,periodo_hasta:r.periodo_hasta,fecha_pago:r.fecha_pago,
   neto_conciliado:a.perspectiva==='PERIODO'?centavos(r.neto_conciliado):null,pagado_registrado:centavos(r.pagado_registrado),pagado_conciliado:centavos(r.pagado_conciliado),pendiente_conciliacion:centavos(r.pendiente_conciliacion),
   saldo_por_cubrir:a.perspectiva==='PERIODO'?centavos(r.saldo_por_cubrir):null,excedentes:centavos(r.excedentes),sin_asignar:centavos(r.sin_asignar),
   cobertura:a.perspectiva==='PERIODO'&&r.neto_conciliado!==0n?pct(r.pagado_conciliado,r.neto_conciliado):null}))
   .sort((x,y)=>cmp(x.periodo_desde,y.periodo_desde)||cmp(x.obra,y.obra)||cmp(x.obra_id,y.obra_id)||cmp(x.periodicidad,y.periodicidad));
  return {version:VERSION,accion:'TENDENCIA',alcance:a,filas:out};
 }
 function acumularPieza(r,x,persp){
  if(x.clase==='APLICADA_CONCILIADA'){r.pagado_conciliado+=x.importe;r.pagado_registrado+=x.importe;}
  else if(['POR_VINCULAR','APLICADA_ANULADA','EFECTIVO'].includes(x.clase)){r.pendiente_conciliacion+=x.importe;r.pagado_registrado+=x.importe;}
  else if(['EXCEDENTE_APLICADO','REMANENTE_EXCEDENTE'].includes(x.clase)){r.excedentes+=x.importe;if(persp==='PAGO')r.pagado_registrado+=x.importe;}
  else if(['REMANENTE_SIN_ASIGNAR','APLICADA_NO_EXIGIBLE'].includes(x.clase)){r.sin_asignar+=x.importe;if(persp==='PAGO')r.pagado_registrado+=x.importe;}
 }
 function comparativos(fuentes,filtros){
  const b=construir(fuentes),a=resolverAlcance(b,filtros),sel=seleccionar(b,a);
  const selP=a.perspectiva==='PERIODO'?sel:seleccionar(b,{...a,perspectiva:'PERIODO'});
  function agrupar(fo,fp,etq,soloPagos){
   const m=new Map();const g=k=>{if(!m.has(k))m.set(k,{clave:k,etiqueta:etq(k),neto_conciliado:0n,pagado_registrado:0n,pagado_conciliado:0n,pendiente_conciliacion:0n,saldo_por_cubrir:0n,excedentes:0n,sin_asignar:0n,concP:0n,personas:new Set()});return m.get(k);};
   if(!soloPagos)for(const o of sel.obligs){const r=g(fo(o));r.neto_conciliado+=o.importe;r.saldo_por_cubrir+=o.saldo;}
   for(const x of sel.piezas){const r=g(fp(x));acumularPieza(r,x,a.perspectiva);if(x.trabajador_id&&(a.perspectiva==='PERIODO'?REG_PERIODO:REG_PAGO).includes(x.clase))r.personas.add(x.trabajador_id);}
   if(!soloPagos)for(const x of selP.piezas)if(x.clase==='APLICADA_CONCILIADA'&&m.has(fo(x)))m.get(fo(x)).concP+=x.importe;
   return [...m.values()].map(r=>({clave:r.clave,etiqueta:r.etiqueta,neto_conciliado:soloPagos?null:centavos(r.neto_conciliado),pagado_registrado:centavos(r.pagado_registrado),pagado_conciliado:centavos(r.pagado_conciliado),
    pendiente_conciliacion:centavos(r.pendiente_conciliacion),saldo_por_cubrir:soloPagos?null:centavos(r.saldo_por_cubrir),excedentes:centavos(r.excedentes),sin_asignar:centavos(r.sin_asignar),
    cobertura:soloPagos||r.neto_conciliado===0n?null:pct(r.concP,r.neto_conciliado),trabajadores_con_pago:r.personas.size}))
    .sort((x,y)=>((y.neto_conciliado||0)-(x.neto_conciliado||0))||(y.pagado_registrado-x.pagado_registrado)||cmp(x.etiqueta,y.etiqueta)||cmp(String(x.clave),String(y.clave)));
  }
  const obraN=id=>(b.obras.get(id)||{}).nombre||'';
  return {version:VERSION,accion:'COMPARATIVOS',alcance:a,
   por_centro:agrupar(o=>o.obra_id,x=>x.obra_id,obraN),
   por_contratista:agrupar(o=>o.contratista,x=>x.contratista,k=>k===PENDIENTE?ADSCRIPCION_PENDIENTE:k),
   /* H7: un solo eje por perspectiva. PERIODO: método planeado de la obligación (piezas sin obligación → SIN_OBLIGACION).
      PAGO: medio real de la operación; sin neto, saldo ni cobertura (no aplican por medio real). */
   por_medio_criterio:a.perspectiva==='PERIODO'?'METODO_PLANEADO':'MEDIO_REAL',
   por_medio:a.perspectiva==='PERIODO'?agrupar(o=>o.metodo||'POR DEFINIR',x=>x.metodo||'SIN_OBLIGACION',k=>k):agrupar(null,x=>x.medio||'SIN_MEDIO',k=>k,true)};
 }

 function excepcionesTodas(b,a){
  const sel=seleccionar(b,a),hoy=b.hoy,out=[];
  const obraN=id=>(b.obras.get(id)||{}).nombre||'';
  const nombreDe=tid=>{const w=tid&&b.trab.get(tid);return w?[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' ')||w.nombre||'':'';};
  const numeroDe=tid=>{const w=tid&&b.trab.get(tid);return w&&w.no_trab!==undefined?w.no_trab:null;};
  const ex=(tipo,sev,x,imp,desc,llaves)=>out.push({tipo,severidad:sev,obra_id:x.obra_id,obra:obraN(x.obra_id),trabajador_id:x.trabajador_id||null,numero:x.numero??numeroDe(x.trabajador_id),nombre:x.nombre||nombreDe(x.trabajador_id),
   semana:x.semana??null,fecha:x.fecha||null,importe:imp===null?null:centavos(imp),descripcion:desc,llaves:{obligacion_id:null,cierre_id:null,pago_id:null,cheque_id:null,evidencia_id:null,aplicacion_id:null,operacion_id:null,...llaves}});
  for(const o of sel.obligs){
   const ll={obligacion_id:o.id,cierre_id:o.cierre_id},base={...o,fecha:o.fecha_pago};
   const reg=o.cubierto+o.por_vincular;
   if(o.saldo>0n&&o.fecha_pago<=hoy)ex(reg>0n?'PAGO_PARCIAL':'SIN_PAGO',difDias(o.fecha_pago,hoy)>14?'ROJO':'AMBAR',base,o.saldo,reg>0n?'Pago parcial: saldo por cubrir':'Obligación exigible sin pago registrado',ll);
   if(o.excedente>0n)ex('EXCEDENTE_APLICADO','ROJO',base,o.excedente,'Aplicado por encima del importe exigible',ll);
   if(o.provisional)ex('CIERRE_PROVISIONAL','AMBAR',base,o.importe,'Cierre reabierto o con fuentes modificadas: importe provisional',ll);
   if(o.fuente_adscripcion==='PENDIENTE')ex('ADSCRIPCION_PENDIENTE','INFO',base,null,ADSCRIPCION_PENDIENTE,ll);
   if(o.fiscal&&o.fiscal.estado==='DIFERENCIA')ex('DIFERENCIA_FISCAL','AMBAR',base,o.fiscal.neto-o.importe,'El neto timbrado (CFDI) difiere del importe autorizado',ll);
   if(o.fiscal&&o.fiscal.estado==='CONTRADICTORIO')ex('CFDI_CONTRADICTORIO','ROJO',base,null,'Representaciones del mismo UUID con importes o datos distintos',ll);
  }
  const opsSel=new Set();
  for(const x of sel.piezas){
   const op=b.opPorId.get(x.op_id),ll={operacion_id:op?op.id:null,obligacion_id:x.obligacion_id,pago_id:op&&op.pago_ids[0]||null,cheque_id:op?op.cheque_id:null,evidencia_id:op?op.evidencia_id:null,aplicacion_id:x.aplicacion_id||null};
   const base={obra_id:x.obra_id,trabajador_id:x.trabajador_id,semana:x.semana,fecha:op&&op.fecha};
   if(x.clase==='POR_VINCULAR')ex('POR_VINCULAR','AMBAR',base,x.importe,'Operación registrada pendiente de vincular a la obligación',ll);
   if(x.clase==='REMANENTE_EXCEDENTE')ex('EXCEDENTE_NO_APLICADO','ROJO',base,x.importe,'Pago mayor al exigible de la persona-semana (posible doble pago o diferencia de importe)',ll);
   if(x.clase==='REMANENTE_SIN_ASIGNAR')ex('SIN_ASIGNAR','AMBAR',base,x.importe,x.trabajador_id?'Pago sin obligación exigible (sin cierre autorizado)':'Pago sin trabajador asignado',ll);
   if(x.clase==='APLICADA_NO_EXIGIBLE')ex('SIN_ASIGNAR','AMBAR',base,x.importe,'Aplicación vigente a una obligación archivada',ll);
   if(x.clase==='APLICADA_ANULADA')ex('OPERACION_ANULADA','ROJO',base,x.importe,'Aplicación vigente sobre operación revertida, cancelada o no exitosa',ll);
   if(x.clase==='EFECTIVO')ex('EFECTIVO_SIN_COMPROBANTE','INFO',base,x.importe,'Efectivo autorizado sin comprobante bancario',ll);
   if(op)opsSel.add(op.id);
  }
  const fechaRef=op=>a.perspectiva==='PAGO'?op.fecha:op.dims&&op.dims.fecha_pago;
  for(const op of b.ops){
   if(!op.visible||!a.obras.includes(op.obra_id)||!enRango(fechaRef(op),a))continue;
   const base={obra_id:op.obra_id,trabajador_id:op.trabajador_id,semana:op.semana,fecha:op.fecha},ll={operacion_id:op.id,pago_id:op.pago_ids[0]||null,cheque_id:op.cheque_id,evidencia_id:op.evidencia_id};
   if(op.duplicado)ex('POSIBLE_DUPLICADO','AMBAR',base,op.importe_visible,'Comprobante con misma persona, semana, fecha e importe que otra operación; no se suma',ll);
   if(op.reversada&&op.aplicado===0n)ex('DEVOLUCION_O_REVERSO','INFO',base,op.importe_visible,'Transferencia exitosa con devolución o rechazo posterior; no cuenta como pago',ll);
   if(op.representaciones>1)ex('REPRESENTACIONES_UNIFICADAS','INFO',base,null,`${op.representaciones} representaciones (${op.origenes.join(', ')}) de la misma operación; cuenta una vez`,ll);
   if(op.medio==='CHEQUE'&&op.situacion==='EXPEDIDO'&&op.valida)ex('CHEQUE_POR_ENTREGAR','INFO',base,op.importe_visible,'Cheque expedido: entrega pendiente; cobro no registrado',ll);
   if(op.sobreaplicada>0n)ex('OPERACION_SOBREAPLICADA','ROJO',base,op.sobreaplicada_visible,'Las aplicaciones vigentes superan el importe de la operación; el exceso no se cuenta como pago',ll);
  }
  for(const p of [...b.rechazos,...b.pendBanco]){
   if(!b.obraVisible(p.obra_id)||!a.obras.includes(p.obra_id))continue;
   const sem=normSemana(p.semana),w=p.trabajador_id&&b.trab.get(p.trabajador_id),per=normPeriodicidad(w&&w.periodo_pago),pr=sem?periodo(b.obras.get(p.obra_id),sem,per):null;
   const f=a.perspectiva==='PAGO'?(p.fecha_pago&&String(p.fecha_pago).slice(0,10)):pr&&pr.fecha_pago;if(!enRango(f,a))continue;
   const rech=up(p.estado)==='RECHAZADO';
   const reversa=rech&&b.ops.some(op=>op.reversada&&op.pago_ids.length&&op.clave&&op.obra_id===p.obra_id&&op.trabajador_id===(p.trabajador_id||null)&&op.semana===sem&&op.importe===mic(p.importe));
   if(reversa)continue;
   ex(rech?'TRANSFERENCIA_RECHAZADA':'TRANSFERENCIA_PENDIENTE_BANCO',rech?'ROJO':'AMBAR',{obra_id:p.obra_id,trabajador_id:p.trabajador_id,semana:sem,fecha:p.fecha_pago?String(p.fecha_pago).slice(0,10):null},mic(p.importe),
    rech?'Transferencia rechazada o devuelta: no es pago':'Transferencia pendiente de confirmación bancaria',{pago_id:p.id});
  }
  for(const {c,dims,obligacion} of chequesSeleccion(b,a)){
   const q=c.q,base={obra_id:q.obra_id,trabajador_id:q.trabajador_id,semana:dims.semana,fecha:c.eventos.registro},ll={cheque_id:q.id,obligacion_id:obligacion?obligacion.id:null};
   if(c.estatus==='PENDIENTE')ex('CHEQUE_SIN_EXPEDIR','AMBAR',base,mic(q.importe),'Cheque pendiente: no acredita expedición ni pago',ll);
   if(c.estatus==='CANCELADO'){
    const repo=b.chequesInfo.find(z=>z.q.reemplaza_cheque_id===q.id&&!z.eliminado&&z.estatus!=='CANCELADO');
    if(!repo)ex('CHEQUE_CANCELADO_SIN_REPONER',obligacion&&obligacion.saldo>0n?'ROJO':'INFO',{...base,fecha:c.eventos.cancelacion||base.fecha},mic(q.importe),'Cheque físico cancelado sin reposición vigente',ll);
   }
  }
  for(const x of b.f.finiquitos_transferencia||[]){
   if(up(x.estado)!=='DECLARADO_POR_ADMIN'||!b.obraVisible(x.obra_id)||!a.obras.includes(x.obra_id))continue;
   const w=b.trab.get(x.trabajador_id),p=periodo(b.obras.get(x.obra_id),Number(x.semana),normPeriodicidad(w&&w.periodo_pago));
   const f=a.perspectiva==='PAGO'?(x.fecha_declarada&&String(x.fecha_declarada).slice(0,10)):p.fecha_pago;if(!enRango(f,a))continue;
   ex('DECLARADO_SIN_COMPROBANTE','AMBAR',{obra_id:x.obra_id,trabajador_id:x.trabajador_id,semana:Number(x.semana),fecha:x.fecha_declarada||null},mic(x.importe),'Finiquito por transferencia declarado, no pagado, hasta conciliar comprobante',{});
  }
  const aplicRet=(b.f.aplicaciones||[]).filter(ap=>ap.retirado_en);
  for(const ap of aplicRet){
   const o=b.obligPorId.get(ap.obligacion_id);if(!o||!o.visible||!a.obras.includes(o.obra_id)||!enRango(a.perspectiva==='PAGO'?fechaLocal(ap.retirado_en):o.fecha_pago,a)||!pasaDims(o,a,'metodo'))continue;
   ex('APLICACION_RETIRADA','INFO',{...o,fecha:fechaLocal(ap.retirado_en)},mic(ap.importe),'Aplicación retirada: no cuenta; el comprobante se conserva',{obligacion_id:o.id,cierre_id:o.cierre_id,aplicacion_id:ap.id,evidencia_id:ap.evidencia_id});
  }
  for(const cal of calidadCentros(b,a,seleccionar(b,{...a,perspectiva:'PERIODO'})))
   for(const p of cal.periodos_faltantes)out.push({tipo:'PERIODO_SIN_CIERRE',severidad:'AMBAR',obra_id:cal.obra_id,obra:cal.obra,trabajador_id:null,numero:null,nombre:'',semana:p.semana,fecha:p.fecha_pago,importe:null,
    descripcion:`Periodo ${p.periodicidad.toLowerCase()} sin cierre: no se certifica como pagado`,llaves:{obligacion_id:null,cierre_id:null,pago_id:null,cheque_id:null,evidencia_id:null,aplicacion_id:null,operacion_id:null}});
  out.sort((x,y)=>SEVERIDAD[x.severidad]-SEVERIDAD[y.severidad]||cmp(x.obra,y.obra)||cmp(String(x.obra_id),String(y.obra_id))||(x.semana??0)-(y.semana??0)||(x.numero??1e9)-(y.numero??1e9)||cmp(x.tipo,y.tipo)||cmp(referencia(x),referencia(y))||(y.importe??0)-(x.importe??0));
  return out;
 }
 /* Desempate estable: primera llave no nula en este orden (texto, orden binario). */
 const referencia=x=>{const l=x.llaves;return String(l.obligacion_id||l.operacion_id||l.pago_id||l.cheque_id||l.aplicacion_id||l.evidencia_id||'');};
 function excepciones(fuentes,filtros,opciones){
  const b=construir(fuentes),a=resolverAlcance(b,filtros);let filas=excepcionesTodas(b,a);
  const tipos=opciones&&Array.isArray(opciones.tipos)?opciones.tipos:null;if(tipos)filas=filas.filter(x=>tipos.includes(x.tipo));
  return {version:VERSION,accion:'EXCEPCIONES',alcance:a,...paginar(filas,opciones)};
 }

 function detalle(fuentes,filtros,opciones){
  const b=construir(fuentes),a=resolverAlcance(b,filtros),sel=seleccionar(b,a),grano=up(opciones&&opciones.grano||'OBLIGACION');
  const obraN=id=>(b.obras.get(id)||{}).nombre||'';
  let filas;
  if(grano==='OBLIGACION'){
   const ids=new Set(sel.obligs.map(o=>o.id));
   if(a.perspectiva==='PAGO')for(const x of sel.piezas)if(x.obligacion_id)ids.add(x.obligacion_id);
   filas=[...ids].map(id=>b.obligPorId.get(id)).filter(o=>o&&o.visible).map(o=>{
    const reg=o.cubierto+o.por_vincular;
    return {obligacion_id:o.id,cierre_id:o.cierre_id,version_id:o.version_id,obra_id:o.obra_id,obra:obraN(o.obra_id),empresa:o.empresa,trabajador_id:o.trabajador_id,numero:o.numero,nombre:o.nombre,
     contratista:o.contratista===PENDIENTE?ADSCRIPCION_PENDIENTE:o.contratista,fuente_adscripcion:o.fuente_adscripcion,cuadrilla:o.cuadrilla_nombre,periodicidad:o.periodicidad,semana:o.semana,
     periodo_desde:o.periodo_desde,periodo_hasta:o.periodo_hasta,fecha_pago:o.fecha_pago,concepto:o.concepto,metodo:o.metodo,estado_cierre:o.estado_cierre,exigible:o.exigible,provisional:o.provisional,
     importe:centavos(o.importe),pagado_conciliado:centavos(o.conciliado),pendiente_conciliacion:centavos(o.anulado+o.efectivo+o.por_vincular),pagado_registrado:centavos(o.exigible?reg:0n),
     saldo:centavos(o.saldo),excedente:centavos(o.excedente),
     estado_pago:!o.exigible?'NO_EXIGIBLE':o.importe===0n?'SIN_OBLIGACION':o.excedente>0n?'EXCEDENTE':o.saldo===0n&&reg>=o.importe?(o.por_vincular>0n||o.anulado>0n||o.efectivo>0n?'REGISTRADO_POR_CONCILIAR':'CONCILIADO'):reg>0n?'PARCIAL':'SIN_PAGO',
     respaldo_fiscal:o.fiscal?o.fiscal.estado:null,operaciones:[...o.ops].sort()};
   }).sort((x,y)=>cmp(x.fecha_pago,y.fecha_pago)||cmp(x.obra,y.obra)||(x.numero??1e9)-(y.numero??1e9)||cmp(x.concepto,y.concepto)||cmp(x.obligacion_id,y.obligacion_id));
  }else if(grano==='OPERACION'){
   const porOp=grupoBy(sel.piezas,x=>x.op_id);
   filas=[...porOp.entries()].filter(([k])=>k).map(([k,ps])=>{
    const op=b.opPorId.get(k),s=c=>centavos(sumaClase(ps,c));
    return {operacion_id:op.id,medio:op.medio,obra_id:op.obra_id,obra:obraN(op.obra_id),empresa:op.empresa,trabajador_id:op.trabajador_id,semana:op.semana,fecha_efectiva:op.fecha,fuente_fecha:op.fuente_fecha,
     importe:centavos(sum(ps,x=>x.importe)),importe_operacion:b.permisos.vip?centavos(op.importe):null,conciliado:s(['APLICADA_CONCILIADA']),pendiente_conciliacion:s(['POR_VINCULAR','APLICADA_ANULADA','EFECTIVO']),
     excedente:s(['EXCEDENTE_APLICADO','REMANENTE_EXCEDENTE']),sin_asignar:s(['REMANENTE_SIN_ASIGNAR','APLICADA_NO_EXIGIBLE']),situacion:op.medio==='CHEQUE'?(op.anulada?'ANULADO':op.situacion):op.medio==='EFECTIVO'?'DECLARADO':op.anulada||op.reversada?'REVERTIDA':'EXITOSA',
     representaciones:op.representaciones,origenes:op.origenes,pago_ids:op.pago_ids.slice().sort(),cheque_id:op.cheque_id,evidencia_id:op.evidencia_id,obligaciones:[...new Set(ps.map(x=>x.obligacion_id).filter(Boolean))].sort()};
   }).sort((x,y)=>cmp(x.fecha_efectiva||'9999',y.fecha_efectiva||'9999')||cmp(x.obra,y.obra)||cmp(x.operacion_id,y.operacion_id));
  }else throw Error('Grano no reconocido: '+grano);
  return {version:VERSION,accion:'DETALLE',grano,alcance:a,...paginar(filas,opciones)};
 }
 function plantilla(fuentes,filtros,opciones){
  const b=construir(fuentes),a=resolverAlcance(b,filtros),m=plantillaMedidas(b,a);
  const filas=m._eventos.map(e=>({tipo:e.tipo,fecha:e.fecha,obra_id:e.obra_id,trabajador_id:e.trabajador_id,origen:e.origen})).sort((x,y)=>cmp(x.fecha,y.fecha)||cmp(x.tipo,y.tipo)||cmp(x.trabajador_id,y.trabajador_id));
  return {version:VERSION,accion:'PLANTILLA',alcance:a,medidas:{plantilla_actual:m.plantilla_actual,altas:m.altas,bajas:m.bajas,reingresos:m.reingresos,rotacion:m.rotacion},eventos:paginar(filas,opciones)};
 }
 function catalogos(fuentes,filtros){
  const b=construir(fuentes),fl=filtros||{};
  const a=resolverAlcance(b,{...fl,desde:fl.desde||'1900-01-01',hasta:fl.hasta||'2999-12-31'});
  const obligs=b.obligs.filter(o=>o.visible&&a.obras.includes(o.obra_id));
  const ord=xs=>[...new Set(xs)].sort((x,y)=>cmp(String(x),String(y)));
  const cuad=ord(obligs.map(o=>o.cuadrilla)).map(k=>({clave:k,etiqueta:k===PENDIENTE?ADSCRIPCION_PENDIENTE:k===SIN_CUADRILLA?'Sin cuadrilla':((b.cuadrillas.get(k)||{}).nombre||k)}));
  return {version:VERSION,accion:'CATALOGOS',
   empresas:ord(a.obras.map(id=>up(b.obras.get(id).empresa_codigo||'PLATINUM'))),
   obras:a.obras.map(id=>({id,nombre:b.obras.get(id).nombre||'',empresa:up(b.obras.get(id).empresa_codigo||'PLATINUM'),fecha_inicio:inicioObra(b.obras.get(id))})).sort((x,y)=>cmp(x.empresa,y.empresa)||cmp(x.nombre,y.nombre)),
   contratistas:ord(obligs.map(o=>o.contratista)).map(k=>({clave:k,etiqueta:k===PENDIENTE?ADSCRIPCION_PENDIENTE:k})),cuadrillas:cuad,
   periodicidades:ord(obligs.map(o=>o.periodicidad)),periodos:ord(obligs.map(o=>o.semana)).map(Number).sort((x,y)=>x-y),
   conceptos:ord(obligs.map(o=>o.concepto)),medios:['TRANSFERENCIA','CHEQUE','EFECTIVO'],perspectivas:['PERIODO','PAGO'],
   comparaciones:['ANTERIOR','ANIO_ANTERIOR'],tipos_periodo:['ACTUAL','MES','EJERCICIO','ACUMULADO','PERSONALIZADO'],restringido:a.restringido};
 }

 return Object.freeze({VERSION,ADSCRIPCION_PENDIENTE,PENDIENTE,SIN_CUADRILLA,SIN_CONCEPTO,DEFINICIONES:DEF,
  calcular,tendencia,comparativos,excepciones,detalle,plantilla,catalogos,
  calendario:Object.freeze({periodo,quincenaMotor,semanaInterna,inicioObra,rango,comparable,fechaLocal,sumar,difDias}),
  util:Object.freeze({mic,centavos,pct,divRedondeo,canonico,normSemana})});
});
