/* Aguinaldo (art. 87 LFT) y ausencias para prestaciones: núcleo puro.
   No toca DOM, Supabase ni los motores 52/53. Las funciones fiscales del
   motor se reciben como argumentos; aquí sólo se ordena y explica el cálculo.
   Fechas civiles AAAA-MM-DD, límites inclusivos, sin husos horarios. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_AGUINALDO=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const VERSION='AGUINALDO_2026_V2';
 const r2=x=>Math.round((Number(x)||0)*100+Number.EPSILON)/100;
 const fecha=s=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))throw Error('Fecha inválida: '+s);
  const d=new Date(s+'T12:00:00Z');if(d.toISOString().slice(0,10)!==s)throw Error('Fecha inválida: '+s);return d;
 };
 const iso=d=>d.toISOString().slice(0,10);
 const sumar=(s,n)=>{const d=fecha(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
 const dias=(a,b)=>Math.round((fecha(b)-fecha(a))/86400000)+1;     // inclusivo
 const diasAnio=y=>((y%4===0&&y%100!==0)||y%400===0)?366:365;
 const min=(a,b)=>a<b?a:b,max=(a,b)=>a>b?a:b;

 /* ---------- Reglas laborales (matriz con fuente) ----------
    `computa` indica si el día del vínculo cuenta como tiempo computable para
    el aguinaldo. El criterio contractual más favorable puede cambiar los
    marcados como configurables; el cambio queda en los parámetros del lote. */
 const NATURALEZAS=Object.freeze({
  FALTA_INJUSTIFICADA:{etiqueta:'Falta injustificada acreditada',computa:false,configurable:false,
   fundamento:'LFT art. 87, 2º párrafo: proporcional "conforme al tiempo que hubieren trabajado". Sólo con evidencia de la ausencia.'},
  PERMISO_SIN_GOCE:{etiqueta:'Permiso sin goce de sueldo',computa:false,configurable:true,
   fundamento:'Sin prestación de servicio ni salario. Un pacto más favorable puede computarlo.'},
  SUSPENSION:{etiqueta:'Suspensión (disciplinaria o legal)',computa:false,configurable:true,
   fundamento:'LFT arts. 42 y 423-X: suspende prestar el servicio y pagar el salario.'},
  ENFERMEDAD_GENERAL:{etiqueta:'Incapacidad por enfermedad general',computa:false,configurable:true,
   fundamento:'LFT art. 42-II: la incapacidad por enfermedad que no constituya riesgo de trabajo suspende la relación. Criterio doctrinal; verificar tesis aplicable en el SJF y el contrato.'},
  RIESGO_TRABAJO:{etiqueta:'Incapacidad por riesgo de trabajo',computa:true,configurable:false,
   fundamento:'LFT art. 42-II la excluye de la suspensión; arts. 473 a 491. Computa como tiempo de servicio.'},
  MATERNIDAD:{etiqueta:'Licencia de maternidad',computa:true,configurable:false,
   fundamento:'LFT art. 170 fr. II y V: descanso con salario íntegro.'},
  PATERNIDAD:{etiqueta:'Permiso de paternidad',computa:true,configurable:false,
   fundamento:'LFT art. 132 fr. XXVII Bis: permiso con goce de sueldo.'},
  VACACIONES:{etiqueta:'Vacaciones',computa:true,configurable:false,fundamento:'LFT arts. 76 a 81.'},
  PERMISO_CON_GOCE:{etiqueta:'Permiso con goce de sueldo',computa:true,configurable:false,fundamento:'Con salario: no interrumpe el tiempo computable.'},
  DESCANSO:{etiqueta:'Descanso semanal u obligatorio',computa:true,configurable:false,fundamento:'LFT arts. 69 a 75.'},
  SIN_CLASIFICAR:{etiqueta:'Ausencia sin clasificar',computa:null,configurable:false,
   fundamento:'Sin respaldo suficiente: queda pendiente de clasificación antes de aplicar.'}
 });
 /* Combinaciones Aspel NOI del catálogo_incidencias. Sólo la 2 (falta
    injustificada), la 9 (ausentismo sin séptimo día: sigue siendo un día no
    laborado ni pagado) y las de R.T. tienen naturaleza inequívoca; las
    genéricas 3 a 16 son configurables en NOI y se clasifican con evidencia,
    no por suposición. */
 function naturalezaCatalogo(id,ramo){
  const n=Number(id);
  if(n===2||n===9)return 'FALTA_INJUSTIFICADA';
  if([17,18,19].includes(n))return 'RIESGO_TRABAJO';
  if(n===1){
   const r=String(ramo||'').toUpperCase();
   if(/MATERN/.test(r))return 'MATERNIDAD';
   if(/RIESGO|\bR\.?T\.?\b|TRABAJO/.test(r))return 'RIESGO_TRABAJO';
   if(/ENFERM|\bE\.?G\.?\b|GENERAL/.test(r))return 'ENFERMEDAD_GENERAL';
  }
  return 'SIN_CLASIFICAR';
 }
 function computaNaturaleza(nat,politica){
  const n=NATURALEZAS[nat]||NATURALEZAS.SIN_CLASIFICAR,p=(politica&&politica.computa)||{};
  if(n.configurable&&typeof p[nat]==='boolean')return p[nat];
  return n.computa;
 }

 /* ---------- Tramos de servicio ----------
    Se reconstruyen con los movimientos de fecha efectiva (historial) y, a
    falta de ellos, con las columnas de la ficha. La ficha conserva sólo la
    ÚLTIMA baja; por eso un reingreso con la relación aún abierta indica una
    baja intermedia que no consta: el tramo se cuenta corrido y se marca para
    verificar (art. 18 LFT), sin inventar un hueco. */
 function eventosCorregidos(w,movimientos){
  const eventos=[],avisos=[],correcciones=[];
  const campos={ALTA:'fecha_alta',BAJA:'fecha_baja',REINGRESO:'fecha_reingreso'};
  const civil=v=>v?String(v).slice(0,10):null;
  const compararId=(a,b)=>{
   if(/^\d+$/.test(String(a))&&/^\d+$/.test(String(b))){const x=BigInt(a),y=BigInt(b);return x<y?-1:x>y?1:0;}
   return String(a||'').localeCompare(String(b||''));
  };
  const filas=(movimientos||[]).map((m,i)=>({...m,_orden:i})).sort((a,b)=>
   String(a.fecha||'').localeCompare(String(b.fecha||''))||compararId(a.id,b.id)||a._orden-b._orden);
  function agregar(tipo,f,m){
   if(!f)return null;
   try{fecha(f);}catch{avisos.push({codigo:'FECHA_MOVIMIENTO_INVALIDA',bloquea:true,texto:'Fecha inválida en el movimiento '+(m.id||m._orden)+'.'});return null;}
   const e={tipo,fecha:f,id:m.id||'mov-'+m._orden,origen:'HISTORIAL',capturado_en:m.fecha||null,correcciones:[]};
   eventos.push(e);return e;
  }
  for(const m of filas){
   const accion=String(m.accion||'').toUpperCase(),antes=m.datos_antes||m.antes||{},despues=m.datos_despues||m.despues||m;
   if(accion==='ALTA'){if(!w.fecha_alta)agregar('ALTA',civil(despues.fecha_alta),m);continue;}
   if(accion==='BAJA'){agregar('BAJA',civil(despues.fecha_baja),m);continue;}
   if(accion==='REACTIVACION'||accion==='REINGRESO'){agregar('REINGRESO',civil(despues.fecha_reingreso),m);continue;}
   if(!['MODIFICACION','CORRECCION_REINGRESO'].includes(accion))continue;
   for(const [tipo,campo] of Object.entries(campos)){
    const f=civil(despues[campo]),prev=civil(antes[campo]),explicita=accion==='CORRECCION_REINGRESO'&&tipo==='REINGRESO';
    if(!explicita&&(!Object.prototype.hasOwnProperty.call(antes,campo)||prev===f))continue;
    if(f){try{fecha(f);}catch{avisos.push({codigo:'FECHA_CORRECCION_INVALIDA',bloquea:true,texto:'Fecha inválida en la corrección '+(m.id||m._orden)+'.'});continue;}}
    const delTipo=eventos.filter(e=>e.tipo===tipo),ultimo=delTipo[delTipo.length-1];
    const candidatos=prev?delTipo.filter(e=>e.fecha===prev):explicita&&ultimo?[ultimo]:[];
    if(prev&&!candidatos.length&&delTipo.length){
     avisos.push({codigo:'CORRECCION_SIN_ANTECEDENTE',bloquea:true,texto:'La corrección '+(m.id||m._orden)+' parte del '+prev+', que no coincide con los movimientos de ese ciclo.'});continue;
    }
    if(candidatos.length>1||candidatos.length===1&&candidatos[0]!==ultimo){
     avisos.push({codigo:'CORRECCION_CICLO_AMBIGUA',bloquea:true,texto:'La corrección '+(m.id||m._orden)+' de '+(prev||'fecha pendiente')+' a '+(f||'vacío')+' coincide con otro ciclo. Revisa sus fechas y origen.'});continue;
    }
    let e=candidatos[0];
    const correccion={id:m.id||'mov-'+m._orden,fecha_anterior:prev||e?.fecha||null,fecha_corregida:f,capturado_en:m.fecha||null};
    if(!e&&f)e=agregar(tipo,f,m);
    if(!e)continue;
    correcciones.push({...correccion,tipo});
    if(!f){eventos.splice(eventos.indexOf(e),1);continue;}
    e.fecha=f;e.correcciones.push(correccion);
   }
  }
  const reingresos=eventos.filter(e=>e.tipo==='REINGRESO'),ultimo=reingresos[reingresos.length-1];
  if(ultimo&&w.fecha_reingreso&&ultimo.fecha!==civil(w.fecha_reingreso)){
   avisos.push({codigo:'REINGRESO_FICHA_DIFIERE',bloquea:true,texto:'El último reingreso del historial '+ultimo.fecha+' ('+ultimo.id+') difiere de la ficha '+civil(w.fecha_reingreso)+'. Revisa la corrección documentada.'});
  }
  eventos.avisos=avisos;eventos.correcciones=correcciones;
  return eventos;
 }
 function tramosServicio(w,eventos){
  const avisos=[...(eventos?.avisos||[])],ev=[];
  const push=(tipo,f,origen)=>{if(!f)return;const d=String(f).slice(0,10);fecha(d);ev.push({tipo,fecha:d,origen});};
  for(const e of eventos||[])push(String(e.tipo).toUpperCase()==='REACTIVACION'?'REINGRESO':String(e.tipo).toUpperCase(),e.fecha,e.origen||'HISTORIAL');
  push('ALTA',w&&w.fecha_alta,'FICHA');push('REINGRESO',w&&w.fecha_reingreso,'FICHA');push('BAJA',w&&w.fecha_baja,'FICHA');
  if(w&&String(w.estatus||'').toUpperCase()==='BAJA'&&!w.fecha_baja)avisos.push({codigo:'BAJA_SIN_FECHA',bloquea:true,texto:'Está de baja sin fecha de baja: no se puede delimitar el tramo.'});
  const orden={ALTA:0,REINGRESO:1,BAJA:2},vistos=new Set(),lista=[];
  ev.sort((a,b)=>a.fecha<b.fecha?-1:a.fecha>b.fecha?1:orden[a.tipo]-orden[b.tipo]);
  for(const e of ev){const k=e.tipo+'|'+e.fecha;if(vistos.has(k))continue;vistos.add(k);lista.push(e);}
  const tramos=[];let abierto=null,verificar=false;
  for(const e of lista){
   if(e.tipo==='ALTA'||e.tipo==='REINGRESO'){
    if(abierto){
     if(e.tipo==='REINGRESO'){verificar=true;avisos.push({codigo:'BAJA_INTERMEDIA_FALTANTE',bloquea:false,texto:`Reingreso del ${e.fecha} sin baja previa registrada: el tramo desde ${abierto} se cuenta corrido y queda por verificar.`});}
     continue;
    }
    abierto=e.fecha;verificar=false;
   }else{
    if(!abierto){avisos.push({codigo:'BAJA_SIN_ALTA',bloquea:true,texto:`Baja del ${e.fecha} sin alta o reingreso previo registrado.`});continue;}
    if(e.fecha<abierto){avisos.push({codigo:'BAJA_ANTERIOR_A_ALTA',bloquea:true,texto:`La baja del ${e.fecha} es anterior al inicio ${abierto}.`});abierto=null;continue;}
    tramos.push({desde:abierto,hasta:e.fecha,verificar});abierto=null;verificar=false;
   }
  }
  if(abierto)tramos.push({desde:abierto,hasta:null,verificar});
  return {tramos,avisos};
 }
 /* Recorta al ejercicio y al corte (inclusive) y elimina solapamientos.
    `bajaInclusiva=false` excluye el día de baja cuando la evidencia indica
    que ya no hubo servicio ese día. */
 function recortar(tramos,ejercicio,corte,opciones){
  const o=opciones||{},ini=`${ejercicio}-01-01`,tope=min(`${ejercicio}-12-31`,corte||`${ejercicio}-12-31`);
  const xs=[];
  for(const t of tramos||[]){
   let h=t.hasta||tope;
   if(t.hasta&&o.bajaInclusiva===false)h=sumar(t.hasta,-1);
   const d=max(t.desde,ini),f=min(h,tope);
   if(f>=d)xs.push({desde:d,hasta:f,verificar:!!t.verificar});
  }
  xs.sort((a,b)=>a.desde<b.desde?-1:1);
  const out=[];
  for(const t of xs){
   const u=out[out.length-1];
   if(u&&t.desde<=u.hasta){u.hasta=max(u.hasta,t.hasta);u.verificar=u.verificar||t.verificar;}
   else out.push({...t});
  }
  return out.map(t=>({...t,dias:dias(t.desde,t.hasta)}));
 }
 const dentro=(f,ts)=>ts.some(t=>f>=t.desde&&f<=t.hasta);
 const cubre=(a,b,ts)=>ts.some(t=>a>=t.desde&&b<=t.hasta);
 function activoEnFecha(tramos,f){return (tramos||[]).some(t=>t.desde<=f&&(!t.hasta||t.hasta>=f));}

 /* ---------- Selección del lote ----------
    Decide a quién incluye la corrida; NO cambia los días causados. */
 function seleccionar(tramos,filtro){
  const f=filtro||{},ts=tramos||[];
  if(!f.desde||!f.hasta||f.hasta<f.desde)throw Error('Rango de selección inválido.');
  const inicios=ts.map(t=>t.desde);
  const vinculo=ts.some(t=>t.desde<=f.hasta&&(!t.hasta||t.hasta>=f.desde));
  const altaEnRango=inicios.some(d=>d>=f.desde&&d<=f.hasta);
  const porRango=f.modo==='FECHA_ALTA'?altaEnRango:vinculo;
  const fe=f.fecha_estatus||f.hasta,activo=activoEnFecha(ts,fe);
  const programado=inicios.some(d=>d>fe)&&!activo;
  if(!porRango)return {incluido:false,motivo:'EXCLUIDO_POR_FILTRO',detalle:f.modo==='FECHA_ALTA'?`Sin alta o reingreso entre ${f.desde} y ${f.hasta}.`:`Sin vínculo entre ${f.desde} y ${f.hasta}.`,activo,programado};
  if(f.estatus==='BAJAS_CON_SALDO'){
   return activo?{incluido:false,motivo:'EXCLUIDO_POR_FILTRO',detalle:`Sigue activo al ${fe}.`,activo,programado}:{incluido:true,motivo:'BAJA_CON_SALDO',activo,programado};
  }
  if(!activo)return {incluido:false,motivo:'EXCLUIDO_POR_FILTRO',detalle:programado?`Programado: su ingreso es posterior al ${fe}.`:`No está activo al ${fe}.`,activo,programado};
  return {incluido:true,motivo:'INCLUIDO',activo,programado};
 }

 /* ---------- Ausencias que afectan ----------
    Fuentes: días del calendario (fecha exacta), faltas de descuentos por
    semana (rango sin días exactos) y complementos históricos auditados.
    - Un día exacto cuenta si cae en el tramo computado del ejercicio.
    - Un rango sin días exactos sólo se consume si el cálculo cubre el rango
      completo; si el corte, la baja o el año lo parten, queda pendiente de
      desglose (no se reparte por suposición).
    - Un total acreditado al corte manda sobre las capturas digitales de su
      mismo alcance: se cuentan una vez y una captura posterior de una falta
      antigua no duplica. Si el sistema tiene más que el respaldo, se abre
      discrepancia y se conservan visibles. */
 function ausenciasAplicables(entrada,tramosRec,politica){
  const dig=entrada.digitales||[],rangos=entrada.rangos||[],hist=entrada.historicas||[];
  const res={digitales:0,historicas:0,que_afectan:0,computan:0,pendientes:[],detalle:[],discrepancias:[],sin_clasificar:0};
  const totales=hist.filter(h=>h.modo==='TOTAL_AL_CORTE'&&h.estado==='VIGENTE');
  const enTotal=f=>totales.find(h=>f>=h.rango_desde&&f<=h.fecha_corte);
  const fechasVistas=new Set(),porTotal=new Map(totales.map(h=>[h.id,0]));
  const contar=(nat,n,item)=>{
   const c=computaNaturaleza(nat,politica);
   if(c===null){res.sin_clasificar+=n;res.pendientes.push({...item,motivo:'SIN_CLASIFICAR'});return;}
   if(c===false)res.que_afectan+=n;else res.computan+=n;
  };
  for(const a of dig){
   if(!a.fecha||!dentro(a.fecha,tramosRec))continue;
   if(fechasVistas.has(a.fecha))continue;fechasVistas.add(a.fecha);   // calendario y descuento enlazados: una vez
   const t=enTotal(a.fecha);
   res.detalle.push({fuente:a.fuente||'CALENDARIO',id:a.id,fecha:a.fecha,naturaleza:a.naturaleza,dias:1,consumido_por:t?t.id:null});
   if(t){porTotal.set(t.id,porTotal.get(t.id)+(computaNaturaleza(a.naturaleza,politica)===false?1:0));continue;}
   res.digitales+=1;contar(a.naturaleza,1,{fuente:a.fuente||'CALENDARIO',id:a.id,fecha:a.fecha});
  }
  for(const g of rangos){
   const n=Number(g.cantidad)||0;if(n<=0)continue;
   const toca=tramosRec.some(t=>g.desde<=t.hasta&&g.hasta>=t.desde);if(!toca)continue;
   const t=totales.find(h=>g.desde>=h.rango_desde&&g.hasta<=h.fecha_corte);
   // Igual que los días del calendario: el total verificado sustituye la captura de su alcance
   // y sólo se comparan contra él los días que no computan (una incapacidad sin clasificar no suma).
   if(t){porTotal.set(t.id,porTotal.get(t.id)+(computaNaturaleza(g.naturaleza||'FALTA_INJUSTIFICADA',politica)===false?n:0));res.detalle.push({fuente:g.fuente||'DESCUENTO',id:g.id,desde:g.desde,hasta:g.hasta,dias:n,naturaleza:g.naturaleza,consumido_por:t.id});continue;}
   if(!cubre(g.desde,g.hasta,tramosRec)){res.pendientes.push({fuente:g.fuente||'DESCUENTO',id:g.id,desde:g.desde,hasta:g.hasta,dias:n,motivo:'RANGO_PARTIDO'});continue;}
   res.detalle.push({fuente:g.fuente||'DESCUENTO',id:g.id,desde:g.desde,hasta:g.hasta,dias:n,naturaleza:g.naturaleza});
   res.digitales+=n;contar(g.naturaleza||'FALTA_INJUSTIFICADA',n,{fuente:g.fuente,id:g.id});
  }
  for(const h of hist){
   if(h.estado!=='VIGENTE')continue;
   if(h.modo==='FECHAS'){
    for(const f of h.fechas||[]){
     if(!dentro(f,tramosRec)||fechasVistas.has(f))continue;fechasVistas.add(f);
     res.historicas+=1;res.detalle.push({fuente:'HISTORICA',id:h.id,fecha:f,naturaleza:h.naturaleza,dias:1});
     contar(h.naturaleza,1,{fuente:'HISTORICA',id:h.id,fecha:f});
    }
    continue;
   }
   const toca=tramosRec.some(t=>h.rango_desde<=t.hasta&&h.fecha_corte>=t.desde);if(!toca)continue;
   if(!cubre(h.rango_desde,h.fecha_corte,tramosRec)){res.pendientes.push({fuente:'HISTORICA',id:h.id,desde:h.rango_desde,hasta:h.fecha_corte,dias:Number(h.total_acreditado)||0,motivo:'AGREGADO_SIN_DESGLOSE'});continue;}
   const total=Number(h.total_acreditado)||0,digitales=porTotal.get(h.id)||0;
   if(digitales>total){res.discrepancias.push({id:h.id,total_acreditado:total,digitales,texto:`El respaldo reporta ${total} y el sistema tiene ${digitales} en el mismo alcance: corresponde revisar cuál capturar.`});}
   const complemento=Math.max(0,total-digitales);
   res.historicas+=complemento;res.digitales+=digitales;
   res.detalle.push({fuente:'HISTORICA',id:h.id,desde:h.rango_desde,hasta:h.fecha_corte,total_acreditado:total,digitales,complemento,naturaleza:h.naturaleza});
   contar(h.naturaleza,Math.max(total,digitales),{fuente:'HISTORICA',id:h.id});
  }
  return res;
 }

 /* ---------- Derecho laboral ----------
    bruto = salario base diario × días pactados × días computables / días del
    ejercicio (365 o 366). Un ejercicio completo sin ausencias da exactamente
    los días pactados. El divisor 365 del art. 174 RLISR es fiscal y no se
    usa aquí. Se redondea a centavos sólo al final. */
 function calcularDerecho(p){
  const ej=Number(p.ejercicio);if(!(ej>=2020&&ej<=2100))throw Error('Ejercicio inválido.');
  const sb=Number(p.salario_base),pact=Number(p.dias_pactados);
  if(!(sb>0))throw Error('Falta el salario base diario.');
  if(!(pact>=15))throw Error('Los días pactados no pueden ser menores a 15 (art. 87 LFT).');
  const corte=p.corte||`${ej}-12-31`;fecha(corte);
  if(corte.slice(0,4)!==String(ej))throw Error('El corte de devengo debe pertenecer al ejercicio.');
  const hoy=p.hoy||corte,rec=recortar(p.tramos,ej,corte,p.opciones);
  const vinculo=rec.reduce((s,t)=>s+t.dias,0);
  const confirmados=recortar(p.tramos,ej,min(corte,hoy),p.opciones).reduce((s,t)=>s+t.dias,0);
  const aus=ausenciasAplicables(p.ausencias||{},rec,p.politica);
  const computables=Math.max(0,vinculo-aus.que_afectan),denominador=diasAnio(ej);
  const raw=sb*pact*computables/denominador;
  const cierre=recortar(p.tramos,ej,`${ej}-12-31`,p.opciones).reduce((s,t)=>s+t.dias,0);
  const cierreComputables=Math.max(0,cierre-aus.que_afectan);
  const detalle_tramos=rec.map(t=>{
   const a=ausenciasAplicables(p.ausencias||{},[t],p.politica),pendiente=a.pendientes.length>0||a.discrepancias.length>0;
   const computablesTramo=Math.max(0,t.dias-a.que_afectan),brutoTramo=sb*pact*computablesTramo/denominador;
   return {desde:t.desde,hasta:t.hasta,dias_base:t.dias,dias_computables:pendiente?null:computablesTramo,bruto:pendiente?null:r2(brutoTramo),bruto_raw:pendiente?null:brutoTramo,pendiente};
  });
  return {version:VERSION,ejercicio:ej,corte,salario_base:sb,dias_pactados:pact,tramos:rec,detalle_tramos,
   dias_vinculo:vinculo,dias_confirmados:confirmados,dias_proyectados:Math.max(0,vinculo-confirmados),
   faltas_digitales:aus.digitales,faltas_historicas:aus.historicas,faltas_afectan:aus.que_afectan,
   dias_computables:computables,denominador,proporcion:computables/denominador,bruto_raw:raw,bruto:r2(raw),
   dias_computables_cierre:cierreComputables,bruto_cierre_proyectado:r2(sb*pact*cierreComputables/denominador),
   ausencias:aus};
 }

 /* ---------- Conciliación de pagos anteriores ----------
    Cada evidencia se cuenta una vez por operación (un CFDI y su pago son la
    misma operación). Acreditado: aplicado en periodo autorizado/timbrado/
    pagado, finiquito desglosado aplicado o ajuste NOI con desglose.
    Reservado: aplicación en un borrador. Pendiente: total global de
    finiquito, documento sin desglose o borrador ajeno. */
 const ESTADOS_ACREDITADOS=['AUTORIZADO','TIMBRADO','PAGADO'];
 function conciliar(causado,evidencias,anioPago){
  const vistos=new Map(),res={causado:r2(causado),acreditado:0,reservado:0,pendiente:[],ignorado:[],detalle:[],exento_usado:0,exento_desconocido:false};
  for(const e of evidencias||[]){
   if(['CANCELADO','RETIRADO','ANULADO'].includes(e.estado)){res.ignorado.push(e);continue;}
   const k=e.operacion||e.id;
   if(vistos.has(k)){
    const previo=vistos.get(k),confirmado=x=>['APLICACION','FINIQUITO_DESGLOSADO','AJUSTE_NOI','CFDI_DESGLOSADO'].includes(x.origen)||
     x.origen==='CONCILIACION_VERIFICADA'&&x.acreditacion_confirmada===true&&['APLICADO','PAGADO','CERO_VERIFICADO'].includes(x.estado);
    if(confirmado(e)&&!confirmado(previo))vistos.set(k,{...e,duplicados:[previo.id,...previo.duplicados]});
    else previo.duplicados.push(e.id);
    continue;
   }
   const reg={...e,duplicados:[]};vistos.set(k,reg);
  }
  for(const e of vistos.values()){
   const imp=r2(e.importe_bruto),mismoAnio=!anioPago||String(e.fecha_pago||'').slice(0,4)===String(anioPago);
   let clase;
   if(e.origen==='APLICACION')clase=ESTADOS_ACREDITADOS.includes(e.estado)?'ACREDITADO':'RESERVADO';
   else if(e.origen==='CONCILIACION_VERIFICADA'&&e.acreditacion_confirmada===true&&['APLICADO','PAGADO','CERO_VERIFICADO'].includes(e.estado))clase='ACREDITADO';
   else if(['FINIQUITO_DESGLOSADO','AJUSTE_NOI','CFDI_DESGLOSADO'].includes(e.origen)&&e.desglosado!==false)clase='ACREDITADO';
   else clase='PENDIENTE';
   res.detalle.push({...e,clase,importe_bruto:imp});
   if(clase==='PENDIENTE'){res.pendiente.push(e);continue;}
   if(clase==='ACREDITADO')res.acreditado=r2(res.acreditado+imp);else res.reservado=r2(res.reservado+imp);
   if(mismoAnio){if(e.exento==null)res.exento_desconocido=true;else res.exento_usado=r2(res.exento_usado+Number(e.exento));}
  }
  res.saldo=r2(Math.max(0,res.causado-res.acreditado-res.reservado));
  res.excedente=r2(Math.max(0,res.acreditado+res.reservado-res.causado));
  return res;
 }

 /* ---------- Exención (LISR art. 93 fr. XIV) ----------
    30 UMA por patrón y trabajador en el año calendario de pago, vigencia de
    la UMA por la fecha efectiva de pago (decreto de desindexación). */
 const UMA=Object.freeze([
  {desde:'2025-02-01',hasta:'2026-01-31',diaria:113.14,fuente:'INEGI, UMA 2025'},
  {desde:'2026-02-01',hasta:'2027-01-31',diaria:117.31,fuente:'INEGI, UMA 2026'}
 ]);
 function umaVigente(fp){fecha(fp);const u=UMA.find(x=>fp>=x.desde&&fp<=x.hasta);if(!u)throw Error('No hay UMA validada para la fecha de pago '+fp+'.');return u;}
 function exencion(bruto,fechaPago,exentoUsado){
  const u=umaVigente(fechaPago),tope=r2(30*u.diaria),usado=r2(exentoUsado||0),disponible=r2(Math.max(0,tope-usado));
  const b=r2(bruto),exento=r2(Math.min(b,disponible));
  return {uma:u.diaria,uma_fuente:u.fuente,tope,exento_usado:usado,disponible,exento,gravado:r2(b-exento)};
 }

 /* ---------- ISR ----------
    Art. 96 LISR (semanal): espejo de los pasos de ISR y subsidio del motor
    52, sin modificarlo. Con gravado 0 reproduce el ISR del motor; la prueba
    lo compara contra el motor real escenario por escenario. */
 function isrSemanalMotor(bruto,dias,fiscal,isrPeriodo){
  const f=fiscal,isrBrutoRaw=isrPeriodo(bruto,dias,true),isrBruto=r2(isrBrutoRaw);
  const subPct=Number(f.subsidio_pct)||15.02,subTopeM=Number(f.subsidio_tope_mensual)||11492.66;
  const topeSem=Math.round(subTopeM/30.4*dias*100)/100,subDia=Math.floor(subPct/100*f.uma*100)/100,subSem=Math.round(subDia*dias*100)/100;
  const subsidio=bruto<=topeSem?Math.min(subSem,isrBruto):0,isrNetoRaw=isrBrutoRaw-subsidio;
  const isr=subsidio>0&&isrBrutoRaw>subsidio?(isrNetoRaw<20?r2(isrNetoRaw):Math.floor(isrNetoRaw*100+1e-9)/100):r2(isrBruto-subsidio);
  return {isrBrutoRaw,isrBruto,subsidio,isr};
 }
 function isrArt96Semanal(o,fiscal,isrPeriodo){
  const b=isrSemanalMotor(o.bruto_ordinario,o.dias,fiscal,isrPeriodo),c=isrSemanalMotor(r2(o.bruto_ordinario+o.gravado),o.dias,fiscal,isrPeriodo);
  return {metodo:'ART96',periodicidad:'SEMANAL',bruto_ordinario:o.bruto_ordinario,dias:o.dias,isr_ordinario:b.isr,subsidio_ordinario:b.subsidio,
   isr_con_aguinaldo:c.isr,subsidio_con_aguinaldo:c.subsidio,isr:r2(Math.max(0,c.isr-b.isr)),
   efecto_subsidio:r2(b.subsidio-c.subsidio)};
 }
 function isrArt96Quincenal(o,isrQuincenal){
  const b=isrQuincenal(o.bruto_ordinario),c=isrQuincenal(r2(o.bruto_ordinario+o.gravado));
  return {metodo:'ART96',periodicidad:'QUINCENAL',bruto_ordinario:o.bruto_ordinario,isr_ordinario:b.isr,subsidio_ordinario:b.subsidio,
   isr_con_aguinaldo:c.isr,subsidio_con_aguinaldo:c.subsidio,isr:r2(Math.max(0,c.isr-b.isr)),efecto_subsidio:r2(b.subsidio-c.subsidio)};
 }
 /* Tarifa mensual por límite inferior: no deja huecos entre tramos. */
 function isrMensualTarifa(base,tarifa){
  if(!(base>0))return {impuesto:0,tramo:null};
  let t=null;for(const x of tarifa)if(base>=x[0])t=x;
  return {impuesto:t[2]+(base-t[0])*t[3]/100,tramo:t};
 }
 /* RLISR art. 174: I. gravado/365×30.4; II. más el ingreso ordinario mensual,
    tarifa del art. 96; III. menos el impuesto del ordinario solo; V. tasa =
    diferencia / fr. I; IV. tasa × gravado, sin deducción alguna. */
 function isrArt174(o,tarifa){
  const g=Number(o.gravado)||0,ord=Number(o.ingreso_mensual_ordinario)||0;
  if(!(ord>=0))throw Error('Falta el ingreso ordinario mensual para el art. 174.');
  if(g<=0)return {metodo:'ART174',gravado:0,mensualizado:0,ingreso_mensual_ordinario:ord,isr_con:0,isr_sin:0,diferencia:0,tasa:0,isr:0};
  const mensualizado=g/365*30.4,con=isrMensualTarifa(ord+mensualizado,tarifa),sin=isrMensualTarifa(ord,tarifa);
  const diferencia=con.impuesto-sin.impuesto,tasa=diferencia/mensualizado;
  return {metodo:'ART174',gravado:g,mensualizado,ingreso_mensual_ordinario:ord,isr_con:con.impuesto,isr_sin:sin.impuesto,diferencia,tasa,isr:r2(Math.max(0,g*tasa))};
 }

 /* ---------- Fila completa ----------
    Une derecho, conciliación, fiscal y observaciones. Una observación con
    bloquea=true impide aplicar la fila; las demás filas siguen. */
 function calcularFila(e){
  const obs=[];
  const add=(codigo,texto,bloquea)=>obs.push({codigo,texto,bloquea:!!bloquea});
  (e.avisos||[]).forEach(a=>add(a.codigo,a.texto,a.bloquea));
  if(e.tipo_salario&&!/^FIJ/i.test(e.tipo_salario))add('SALARIO_VARIABLE','Salario variable: requiere el promedio de los últimos 30 días efectivamente trabajados (art. 89 LFT) o la regla del art. 289.',true);
  if(e.dias_pactados>15&&!String(e.respaldo_pactado||'').trim())add('PACTO_SIN_RESPALDO','Días pactados superiores a 15 sin contrato, convenio o política registrada.',true);
  let d;try{d=calcularDerecho(e);}catch(x){add('CALCULO',x.message,true);return {estado:'BLOQUEADA',observaciones:obs};}
  const a=d.ausencias;
  if(a.sin_clasificar>0)add('AUSENCIA_SIN_CLASIFICAR',`${a.sin_clasificar} día(s) de ausencia sin clasificar.`,true);
  a.pendientes.filter(p=>p.motivo!=='SIN_CLASIFICAR').forEach(p=>add(p.motivo,`${p.fuente}: ${p.dias} día(s) entre ${p.desde} y ${p.hasta} sin ubicar dentro del corte; requiere evidencia de los días.`,true));
  a.discrepancias.forEach(x=>add('DISCREPANCIA_FALTAS',x.texto,true));
  if(d.tramos.some(t=>t.verificar))add('TRAMO_POR_VERIFICAR','Tramo con baja intermedia no registrada: los días van corridos (art. 18 LFT).',false);
  if(e.cobertura&&e.cobertura.desde){
   /* Un hueco anterior al inicio de captura sólo queda verificado si un
      registro histórico vigente cubre ese rango completo (un total al corte,
      incluso cero verificado, o fechas con su rango revisado). */
   const huecos=d.tramos.filter(t=>t.desde<e.cobertura.desde).map(t=>({desde:t.desde,hasta:min(t.hasta,sumar(e.cobertura.desde,-1))}));
   const vig=(e.ausencias?.historicas||[]).filter(h=>h.estado==='VIGENTE');
   const sin=huecos.filter(g=>!vig.some(h=>h.rango_desde<=g.desde&&(h.fecha_corte||h.rango_hasta)>=g.hasta));
   if(sin.length)add('SIN_COBERTURA_FALTAS',`Sin captura de faltas antes del ${e.cobertura.desde} (${sin.map(g=>g.desde+' a '+g.hasta).join(', ')}): se calcula con cero faltas NO verificadas.`,!!e.exigir_cobertura);
  }
  const anioPago=e.fecha_pago?e.fecha_pago.slice(0,4):null;
  const c=conciliar(d.bruto,e.evidencias,anioPago);
  if(c.pendiente.length)add('EVIDENCIA_PENDIENTE',`${c.pendiente.length} pago(s) anterior(es) sin desglose del aguinaldo: no se puede saber el saldo.`,true);
  if(c.excedente>0)add('PAGADO_DE_MAS',`Lo acreditado excede lo causado por $${c.excedente.toFixed(2)}.`,false);
  if(c.exento_desconocido)add('EXENCION_DESCONOCIDA','Un pago del mismo año no informa su parte exenta: no se puede determinar la exención disponible.',true);
  const fila={version:VERSION,derecho:d,conciliacion:c,observaciones:obs,saldo:c.saldo,bruto_causado:d.bruto};
  const aPagar=e.importe_a_pagar==null?c.saldo:r2(Math.min(e.importe_a_pagar,c.saldo));
  fila.bruto_a_pagar=aPagar;
  if(e.fecha_pago){
   if(e.fecha_pago>`${d.ejercicio}-12-20`)add('FUERA_DE_PLAZO',`El pago del ${e.fecha_pago} es posterior al 20 de diciembre (art. 87 LFT).`,false);
   try{
    const x=exencion(aPagar,e.fecha_pago,c.exento_usado);fila.fiscal={...x};
    const g=x.gravado;
    if(e.metodo_isr==='ART174'){
     if(!(e.ingreso_mensual_ordinario>0))throw Error('Falta el ingreso ordinario mensual para el art. 174.');
     fila.fiscal.isr_detalle=isrArt174({gravado:g,ingreso_mensual_ordinario:e.ingreso_mensual_ordinario},e.tarifa_mensual);
    }else if(e.calcularIsr96){
     fila.fiscal.isr_detalle=e.calcularIsr96(g);
    }else throw Error('Falta el contexto fiscal del periodo de pago.');
    fila.fiscal.isr=r2(fila.fiscal.isr_detalle.isr);
    fila.fiscal.neto=r2(aPagar-fila.fiscal.isr);
   }catch(x){add('FISCAL_INCOMPLETO',x.message+' Se muestra el bruto confirmado; el neto queda sin determinar.',true);}
  }
  if(!(aPagar>0)&&!obs.some(o=>o.bloquea))fila.estado='SIN_SALDO';
  else fila.estado=obs.some(o=>o.bloquea)?'BLOQUEADA':'LISTA';
  return fila;
 }

 /* Texto canónico (orden de llaves estable) para huellas reproducibles. */
 function canonico(v){
  if(Array.isArray(v))return '['+v.map(canonico).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonico(v[k])).join(',')+'}';
  return JSON.stringify(v===undefined?null:v);
 }

 return Object.freeze({VERSION,NATURALEZAS,UMA,naturalezaCatalogo,computaNaturaleza,eventosCorregidos,tramosServicio,recortar,activoEnFecha,seleccionar,
  ausenciasAplicables,calcularDerecho,conciliar,umaVigente,exencion,isrSemanalMotor,isrArt96Semanal,isrArt96Quincenal,
  isrMensualTarifa,isrArt174,calcularFila,canonico,util:Object.freeze({fecha,iso,sumar,dias,diasAnio,r2})});
});
