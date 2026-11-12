/* Nómina → PTU / Aguinaldo: corrida de aguinaldo en cuatro pasos.
   1. Parámetros  2. Personal y cálculo  3. Conciliación  4. Aplicación e historial.
   La simulación sólo lee. Aplicar crea percepciones (concepto SAT 002) en la
   nómina abierta mediante control_aguinaldo, que repite en el servidor las
   validaciones de alcance, permisos, fuentes, periodo, saldo y exención. */
(function(){
 'use strict';
 const A=()=>window.PLATINUM_AGUINALDO;
 const r2=v=>redondearCentavos(v);
 const PASOS=['Parámetros','Personal y cálculo','Conciliación','Aplicación e historial'];
 const PROTEGIDOS=['AUTORIZADO','TIMBRADO','PAGADO'];
 const MOTIVOS={EXCLUIDO_POR_FILTRO:'Excluido por filtro',SIN_SALDO:'Sin saldo por pagar',YA_APLICADO:'Ya aplicado o pagado',DATOS_PENDIENTES:'Datos pendientes',BAJA_FINIQUITO:'Baja: saldo por finiquito'};
 const REVISION={FISCAL_PENDIENTE:'Bruto calculado · fiscal pendiente',LISTA:'Lista para aplicar',CONCILIACION_ANTERIOR:'Pendiente de conciliación anterior',DATOS_PENDIENTES:'Pendiente de datos',EXCLUIDO_POR_FILTRO:'Excluido por filtro',SIN_SALDO:'Sin saldo',YA_APLICADO:'Ya aplicado'};
 let S=null,SECUENCIA=0;

 function parametrosIniciales(){
  const hoy=today(),ej=Number(hoy.slice(0,4));
  return {ejercicio:ej,centro:OBRA?.id||'',periodicidad:'TODOS',contratista:'',cuadrilla:'',rp:'',texto:'',
   modo:'VINCULO',desde:`${ej}-01-01`,hasta:hoy,estatus:'ACTIVOS_HOY',fecha_estatus:hoy,corte:`${ej}-12-31`,
   dias_pactados:15,respaldo_pactado:'',eg_computa:false,baja_inclusiva:true,exigir_cobertura:false,fecha_destino:hoy,metodo_isr:'ART96'};
 }
 function abrir(){
  if(S?.aplicando){toast('Espera a que termine la aplicación del lote.','err');return;}
  S?.abortLectura?.abort();
  if(!A()){toast('No cargó el núcleo de aguinaldo. Recarga la plataforma.','err');return;}
  S={turno:0,paso:0,p:parametrosIniciales(),empresa:EMPRESA_ACTIVA,calculado:false,huboCalculo:false,parametrosCambiaron:false,filas:[],fuera:[],sel:new Set(),pagina:0,coberturas:[],historial:null,aplicando:false,lotes:new Map()};
  modal(`<div id="agc">
   <div class="m-head"><h2>🎄 Aguinaldo · art. 87 LFT</h2><span class="fhint" style="margin-left:8px">${esc(razonSocialEmpresa())}</span><button class="x" onclick="closeModal()">×</button></div>
   <nav aria-label="Pasos de la corrida de aguinaldo" style="display:flex;gap:6px;flex-wrap:wrap;padding:10px 18px 0">${PASOS.map((n,i)=>`<button type="button" class="btn" data-agc-paso="${i}">${i+1}. ${n}</button>`).join('')}</nav>
   <div class="m-body" id="agc-cuerpo"></div><div class="m-foot" id="agc-pie"></div></div>`,'lg');
  $('agc').addEventListener('click',e=>{clic(e).catch(x=>toast(x.message,'err'));});
  $('agc').addEventListener('change',cambio);
  pintar();
 }
 const activo=t=>!!S&&!!$('agc')&&(t==null||t===S.turno)&&S.empresa===EMPRESA_ACTIVA;
 function pintar(){
  if(!activo())return;
  $('agc').querySelectorAll('[data-agc-paso]').forEach(b=>{const i=Number(b.dataset.agcPaso);b.setAttribute('aria-current',String(i===S.paso));b.disabled=i>0&&(!S.calculado||S.parametrosCambiaron);b.classList.toggle('dark',i===S.paso);});
  const [html,pie]=[vistaParametros,vistaPersonal,vistaConciliacion,vistaAplicacion][S.paso]();
  $('agc-cuerpo').innerHTML=html;$('agc-pie').innerHTML=pie;
 }
 function aviso(texto,error){if(activo())$('agc-cuerpo').innerHTML=`<p class="fhint" role="${error?'alert':'status'}" style="${error?'color:var(--red)':''}">${esc(texto)}</p>`;}

 /* ---------- Paso 1: parámetros ---------- */
 function campo(id,etiqueta,control,ayuda=''){return `<div><label for="agc-${id}">${etiqueta}</label>${control}${ayuda?`<div class="fhint">${ayuda}</div>`:''}</div>`;}
 function vistaParametros(){
  const p=S.p,sel=(id,ops,v)=>`<select id="agc-${id}">${ops.map(([k,n])=>`<option value="${esc(k)}" ${String(v)===String(k)?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
  const centros=[['','Todos los centros de esta razón social'],...obrasEmpresa(S.empresa).map(o=>[o.id,o.nombre])];
  const cuads=p.centro&&p.centro===OBRA?.id?[['','Todas'],...(CUADS||[]).map(c=>[c.id,c.nombre])]:[['','Todas (elige el centro abierto para filtrar)']];
  const destino=OBRA?[calendarioNominaSemanal(...semRangeCentro(OBRA,p.fecha_destino)),calendarioNominaQuincenal(...semRangeCentro(OBRA,p.fecha_destino))]:null;
  return [`<div class="fhint" style="margin-bottom:10px">La simulación no modifica nada. El rango de selección decide a quién se incluye; nunca cambia los días causados ni la fecha de pago.</div>
   <div class="sect">Razón social, centro y periodicidad</div>
   <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
    ${campo('centro','Centro de trabajo',sel('centro',centros,p.centro))}
    ${campo('periodicidad','Periodicidad',sel('periodicidad',[['TODOS','Semanal y quincenal (lotes separados)'],['SEMANAL','Solo semanal'],['QUINCENAL','Solo quincenal']],p.periodicidad))}
    ${campo('contratista','Contratista',`<input id="agc-contratista" list="agc-contratistas" value="${esc(p.contratista)}" placeholder="Todos"><datalist id="agc-contratistas">${[...new Set((CONTRATISTAS||[]).map(c=>c.nombre).concat(WORKERS.map(w=>w.contratista)).filter(Boolean))].sort().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>`)}
    ${campo('cuadrilla','Cuadrilla',sel('cuadrilla',cuads,p.cuadrilla))}
    ${campo('rp','Registro patronal',`<input id="agc-rp" value="${esc(p.rp)}" placeholder="Todos">`)}
    ${campo('texto','Trabajador',`<input id="agc-texto" value="${esc(p.texto)}" placeholder="Número, nombre o CURP">`)}
   </div>
   <div class="sect" style="margin-top:12px">Ejercicio y selección</div>
   <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
    ${campo('ejercicio','Ejercicio',`<input id="agc-ejercicio" type="number" min="2020" max="2100" value="${p.ejercicio}">`)}
    ${campo('modo','Seleccionar por',sel('modo',[['VINCULO','Vínculo dentro del rango'],['FECHA_ALTA','Fecha de alta o reingreso dentro del rango']],p.modo))}
    ${campo('desde','Rango: del',`<input id="agc-desde" type="date" value="${p.desde}">`)}
    ${campo('hasta','al',`<input id="agc-hasta" type="date" value="${p.hasta}">`,'Límites inclusivos.')}
    ${campo('estatus','Estatus',sel('estatus',[['ACTIVOS_HOY','Activos hoy · ciclo vigente']], 'ACTIVOS_HOY'))}
    ${campo('fecha_estatus','Fecha del estatus',`<input id="agc-fecha_estatus" type="date" value="${p.fecha_estatus}" ${p.estatus==='ACTIVOS_HOY'?'disabled':''}>`,'Un ingreso posterior a esta fecha queda como programado.')}
   </div>
   <div class="sect" style="margin-top:12px">Derecho (art. 87 LFT)</div>
   <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
    ${campo('corte','Corte de devengo',`<input id="agc-corte" type="date" value="${p.corte}">`,'Los días posteriores a hoy se muestran como proyectados.')}
    ${campo('dias_pactados','Días pactados',`<input id="agc-dias_pactados" type="number" min="15" step="1" value="${p.dias_pactados}">`,'Mínimo legal 15.')}
    ${campo('respaldo_pactado','Respaldo de días superiores a 15',`<input id="agc-respaldo_pactado" value="${esc(p.respaldo_pactado)}" placeholder="Contrato, convenio o política">`)}
    <div><label>Criterios</label>
     <label style="display:block;font-weight:400"><input type="checkbox" id="agc-eg_computa" style="width:auto" ${p.eg_computa?'checked':''}> La enfermedad general computa (pacto más favorable)</label>
     <label style="display:block;font-weight:400"><input type="checkbox" id="agc-baja_inclusiva" style="width:auto" ${p.baja_inclusiva?'checked':''}> El día de la baja cuenta como laborado</label>
     <label style="display:block;font-weight:400"><input type="checkbox" id="agc-exigir_cobertura" style="width:auto" ${p.exigir_cobertura?'checked':''}> Bloquear periodos sin captura de faltas</label></div>
   </div>
   <div class="sect" style="margin-top:12px">Pago</div>
   <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
    ${campo('fecha_destino','Nómina destino: fecha dentro del periodo',`<input id="agc-fecha_destino" type="date" value="${p.fecha_destino}">`,destino?`En ${esc(OBRA.nombre)}: semanal ${fmtD(destino[0].desde)}–${fmtD(destino[0].hasta)} (pago ${fmtD(destino[0].fecha_pago)}); quincenal ${fmtD(destino[1].desde)}–${fmtD(destino[1].hasta)}. Cada centro usa su propio calendario.`:'')}
    ${campo('metodo_isr','Retención de ISR',sel('metodo_isr',[['ART96','Art. 96 LISR: ISR incremental del periodo'],['ART174','Art. 174 RLISR: procedimiento opcional']],p.metodo_isr),'La segunda quincena con ajuste mensual exige el art. 174 o la primera quincena.')}
   </div>`,
   `<button class="btn" onclick="closeModal()">Cerrar</button><button class="btn" onclick="agAbrirSimple()" title="Consulta rápida sin faltas, conciliación ni ISR">Cálculo simple</button><button class="btn dark" data-agc-acc="calcular">🧮 Calcular simulación</button>`];
 }
 function semRangeCentro(o,fecha){
  const base=String(o&&o.fecha_inicio||SEMANA1).slice(0,10),n=isoWeekDe(o,new Date(fecha+'T12:00:00'));
  const d=retSumarDias(base,(n-1)*7);return [d,retSumarDias(d,6),n];
 }
 function leerCrudo(){
  const v=id=>$('agc-'+id)?.value??'',c=id=>!!$('agc-'+id)?.checked;
  return {ejercicio:Number(v('ejercicio')),centro:v('centro'),periodicidad:v('periodicidad'),contratista:v('contratista').trim(),cuadrilla:v('cuadrilla'),rp:v('rp').trim(),texto:v('texto').trim(),
   modo:v('modo'),desde:v('desde'),hasta:v('hasta'),estatus:'ACTIVOS_HOY',fecha_estatus:today(),corte:v('corte'),
   dias_pactados:Number(v('dias_pactados')),respaldo_pactado:v('respaldo_pactado').trim(),eg_computa:c('eg_computa'),baja_inclusiva:c('baja_inclusiva'),exigir_cobertura:c('exigir_cobertura'),
   fecha_destino:v('fecha_destino'),metodo_isr:v('metodo_isr')};
 }
 function leerParametros(origen){
  const p={...(origen||leerCrudo())},iso=/^\d{4}-\d\d-\d\d$/;
  if(!(Number.isInteger(p.ejercicio)&&p.ejercicio>=2020&&p.ejercicio<=2100))throw Error('Ejercicio inválido.');
  for(const k of ['desde','hasta','fecha_estatus','corte','fecha_destino'])if(!iso.test(p[k]))throw Error('Revisa las fechas de los parámetros.');
  if(p.hasta<p.desde)throw Error('El rango de selección está invertido.');
  if(p.corte.slice(0,4)!==String(p.ejercicio))throw Error('El corte de devengo debe pertenecer al ejercicio.');
  if(!(Number.isInteger(p.dias_pactados)&&p.dias_pactados>=15))throw Error('Los días pactados no pueden ser menores a 15 (art. 87 LFT).');
  if(p.dias_pactados>15&&p.respaldo_pactado.length<5)throw Error('Registra el contrato, convenio o política que respalda más de 15 días.');
  if(p.centro&&!obrasEmpresa(S.empresa).some(o=>o.id===p.centro))throw Error('El centro no pertenece a esta razón social.');
  return p;
 }

 /* ---------- Cálculo ---------- */
 async function universo(p,id=null){
  const limitar=q=>{q=q.eq('estatus','ACTIVO');if(id)q=q.eq('id',id);if(p.periodicidad!=='TODOS')q=q.eq('periodo_pago',p.periodicidad);if(p.contratista&&typeof q.ilike==='function')q=q.ilike('contratista',p.contratista.replace(/[%_]/g,'\\$&'));if(p.cuadrilla)q=q.eq('id_cuadrilla',p.cuadrilla);return q;};
  const r=p.centro?await fetchAllRows(()=>limitar(sb.from('trabajadores').select('*').eq('obra_id',p.centro).eq('eliminado',false))):await leerPorEmpresa('trabajadores','*',q=>limitar(q.eq('eliminado',false)));
  if(r.error||!Array.isArray(r.data))throw Error('No se pudo leer el personal: '+(r.error?.message||'respuesta incompleta'));
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toUpperCase(),t=norm(p.texto),rp=norm(p.rp).replace(/[^A-Z0-9]/g,'');
  const rpDeW=w=>norm(w.registro_patronal||OBRAS.find(o=>o.id===w.obra_id)?.registro_patronal).replace(/[^A-Z0-9]/g,'');
  return r.data.filter(w=>w.estatus==='ACTIVO'&&(w.fecha_reingreso||w.fecha_alta||'9999')<=today()&&(p.periodicidad==='TODOS'||periodoPago(w)===p.periodicidad)
   &&(!p.contratista||norm(w.contratista)===norm(p.contratista))&&(!p.cuadrilla||w.id_cuadrilla===p.cuadrilla)&&(!rp||rpDeW(w)===rp)
   &&(!t||String(w.no_trab)===t||norm(fullName(w)).includes(t)||norm(w.curp)===t));
 }
 async function contexto(ids,ej,t){
  const p=S.p,key=A().canonico({ids,ej,p,empresa:S.empresa});
  if(!S.reanudacion||S.reanudacion.key!==key||S.reanudacion.completa)S.reanudacion={key,personas:new Map(),coberturas:new Map(),metricas:[],completa:false};
  const sesion=S,r=S.reanudacion,pendientes=[],cola=[];let indice=0;
  S.abortLectura?.abort();const controlador=new AbortController();S.abortLectura=controlador;
  const vivo=()=>S===sesion&&activo(t)&&!controlador.signal.aborted;
  for(let i=0;i<ids.length;i+=48){const lote=ids.slice(i,i+48).filter(id=>!r.personas.has(id));if(lote.length)cola.push(lote);}
  async function leer(lote){
   if(!vivo()||!lote.length)return;const inicio=Date.now();
   try{
    let req=sb.rpc('control_aguinaldo',{p_accion:'CONTEXTO',p_datos:{ejercicio:ej,trabajadores:lote,alcance:'CICLO_VIGENTE_V1',corte:p.corte,fecha_destino:p.fecha_destino}});
    if(typeof req.abortSignal==='function')req=req.abortSignal(controlador.signal);
    const {data,error}=await req;if(!vivo())return;
    r.metricas.push({trabajadores:lote.length,ms:Date.now()-inicio,error:error?.code||null});
    if(error)throw error;
    if(data?.contrato_version!=='AG_CICLO_V1'||!Array.isArray(data.personas)||data.personas.some(x=>x.contrato_version!=='AG_CICLO_V1'))throw Error('El servidor no confirmó el cálculo por ciclo vigente. Actualiza la plataforma o solicita completar su actualización.');
    for(const x of data.personas)if(lote.includes(x.trabajador_id))r.personas.set(x.trabajador_id,x);
    for(const c of data.coberturas||[])r.coberturas.set(c.obra_id,c);r.salud=!!data.salud;
    for(const id of lote)if(!r.personas.has(id))pendientes.push({id,motivo:'El servidor no devolvió esta persona.'});
    aviso(`Leyendo ciclo vigente: ${r.personas.size} de ${ids.length} personas confirmadas…`);
   }catch(error){
    if(!vivo())return;
    if((error.code==='57014'||/timeout/i.test(error.message||''))&&lote.length>1){const m=Math.ceil(lote.length/2);await leer(lote.slice(0,m));await leer(lote.slice(m));}
    else for(const id of lote)pendientes.push({id,motivo:error.message||'Lectura no confirmada'});
   }
  }
  async function trabajador(){while(vivo()&&indice<cola.length){const lote=cola[indice++];await leer(lote);}}
  await Promise.all([trabajador(),trabajador()]);if(!vivo())return null;
  r.completa=pendientes.length===0&&ids.every(id=>r.personas.has(id));
  return {personas:ids.map(id=>r.personas.get(id)).filter(Boolean),coberturas:[...r.coberturas.values()],salud:r.salud,pendientes,metricas:r.metricas,completa:r.completa};
 }
 function eventosDe(w,movs){
  return A().eventosCorregidos(w,movs);
 }
 /* Cantidad de faltas de una incidencia semanal: sólo del desglose del motor
    o de la firma exacta del generador antiguo; nunca de notas libres. */
 function cantidadFaltas(d){
  const k=d.calculo;
  if(k&&['AUTOMATICO','INCREMENTAL_IMSS'].includes(k.modo)&&Number.isInteger(k.faltas))return {faltas:k.faltas,incapacidad:Number.isInteger(k.incapacidad_imss)?k.incapacidad_imss:0};
  const m=String(d.motivo||'').match(/^(\d+) FALTAS? · NETO NOI /);
  if(!k&&d.tipo==='FALTA'&&m)return {faltas:Number(m[1]),incapacidad:0};
  return d.tipo==='FALTA'?null:{faltas:0,incapacidad:0};
 }
 function ausenciasDe(x){
  const avisos=[],digitales=(x.calendario||[]).map(e=>({id:e.id,fecha:String(e.fecha).slice(0,10),fuente:'CALENDARIO',
   naturaleza:e.reservado?'SIN_CLASIFICAR':A().naturalezaCatalogo(e.id_incidencia,e.ramo)}));
  if((x.calendario||[]).some(e=>e.reservado))avisos.push({codigo:'SALUD_RESERVADA',bloquea:false,texto:'Hay incapacidades reservadas: sólo un usuario con permiso de salud puede clasificarlas y completar el cálculo.'});
  const rangos=[];
  for(const d of x.faltas_semana||[]){
   const q=cantidadFaltas(d),p=d.periodo||{};
   if(!/^\d{4}-\d\d-\d\d$/.test(p.desde||'')||!/^\d{4}-\d\d-\d\d$/.test(p.hasta||''))continue;
   if(!q){avisos.push({codigo:'FALTA_SIN_CANTIDAD',bloquea:true,texto:`Falta de S${d.semana} sin desglose de días: no se infiere de la nota. Corrige la incidencia o registra el total acreditado al corte.`});continue;}
   if(q.faltas>0)rangos.push({id:d.id,desde:p.desde,hasta:p.hasta,cantidad:q.faltas,naturaleza:'FALTA_INJUSTIFICADA',fuente:'DESCUENTO'});
   if(q.incapacidad>0)rangos.push({id:d.id+':imss',desde:p.desde,hasta:p.hasta,cantidad:q.incapacidad,naturaleza:'SIN_CLASIFICAR',fuente:'DESCUENTO_IMSS'});
  }
  return {digitales,rangos,historicas:x.historicas||[],avisos};
 }
 function coberturaDe(cob){
  if(!cob)return null;
  const fs=[cob.inicio_centro,cob.primera_captura_calendario].filter(f=>/^\d{4}-\d\d-\d\d/.test(f||'')).map(f=>String(f).slice(0,10));
  if(Number.isInteger(cob.primera_semana_descuentos)&&cob.inicio_centro)fs.push(retSumarDias(String(cob.inicio_centro).slice(0,10),(cob.primera_semana_descuentos-1)*7));
  return fs.length?{desde:fs.sort()[0]}:null;
 }
 /* Pagos anteriores. Las evidencias desglosadas van primero: por operación
    (una baja, una aplicación) cuenta la primera, así un finiquito y sus
    papeles validados no se suman dos veces. */
 function evidenciasDe(x,tramos,ej){
  if(!window.PLATINUM_AGUINALDO_EVIDENCIAS?.evidenciasDe)throw Error('No cargó la lectura de evidencias de aguinaldo.');
  return window.PLATINUM_AGUINALDO_EVIDENCIAS.evidenciasDe(x,tramos,ej);
 }
 function destinoDe(w,fecha){
  const o=OBRAS.find(o=>o.id===w.obra_id)||{fecha_inicio:SEMANA1},[d,h,semana]=semRangeCentro(o,fecha);
  const c=periodoPago(w)==='QUINCENAL'?calendarioNominaQuincenal(d,h):calendarioNominaSemanal(d,h);
  return {semana,periodicidad:periodoPago(w),obra_id:w.obra_id,desde:c.desde,hasta:c.hasta,fecha_pago:c.fecha_pago,dias:c.dias};
 }
 /* ISR incremental del periodo destino (art. 96): espejo del motor sobre el
    bruto ordinario del periodo sin incidencias. Los motores no se modifican. */
 function isr96De(w,dest){
  try{
   const f=FISC();
   if(dest.periodicidad==='SEMANAL'){const N=nominaSemanal(w,{faltas:0});return g=>A().isrArt96Semanal({bruto_ordinario:N.bruto,dias:7,gravado:g},f,isrPeriodo);}
   if(dest.desde.endsWith('-16')&&dest.desde>='2026-10-16')throw Error('Segunda quincena con ajuste mensual de ISR: usa el art. 174 RLISR o aplica en la primera quincena.');
   const perfil=perfilNominaQuincenal(w),N=nominaQuincenal(w,{dias:dest.dias,desde:dest.desde,hasta:dest.hasta});
   const q=b=>isrOrdinarioQuincenal(b,perfil.dias_fiscales,perfil,{...f,mes:dest.desde.slice(0,7)});
   return g=>A().isrArt96Quincenal({bruto_ordinario:N.bruto,gravado:g},q);
  }catch(e){return ()=>{throw e;};}
 }
 function calcularPersona(w,x,p,extra){
  const o=extra||{};let eventos,tramos,avisos;
  try{if(x.contrato_version==='AG_CICLO_V1'){eventos=[];tramos=[{desde:x.ciclo.inicio,hasta:null}];avisos=x.ciclo.activo?[]:[{codigo:x.ciclo.motivo||'CICLO_NO_ACTIVO',texto:'El ingreso efectivo no corresponde a un ciclo activo hoy.',bloquea:true}];}else{eventos=eventosDe(w,x.movimientos);({tramos,avisos}=A().tramosServicio(w,eventos));}}
  catch(error){
   return clasificar({w,x,sel:{incluido:true,detalle:'Fechas del vínculo por verificar'},dest:destinoDe(w,p.fecha_destino),
    fila:{estado:'BLOQUEADA',observaciones:[{codigo:'FECHAS_POR_VERIFICAR',bloquea:true,texto:'Revisa las fechas de alta, baja y reingreso. '+error.message}]},
    motivo:null,aplicadas:[],eventos:[],identidad:x.identidad,huella:x.huella_fuentes});
  }
  const sel=A().seleccionar(tramos,{modo:p.modo,desde:p.desde,hasta:p.hasta,estatus:p.estatus,fecha_estatus:p.fecha_estatus});
  const aus=ausenciasDe(x),dest=destinoDe(w,p.fecha_destino),av=[...avisos,...aus.avisos,...(o.avisos||[])];
  if(x.aplicaciones_pendientes?.length)av.push({codigo:'ALCANCE_APLICACION_PENDIENTE',bloquea:true,texto:'Aplicaciones anteriores sin ciclo identificado: '+x.aplicaciones_pendientes.map(a=>a.id).join(', ')});
  if(!(dest.semana>=1&&dest.semana<=53))av.push({codigo:'DESTINO_INVALIDO',bloquea:true,texto:'La fecha de la nómina destino no cae en una semana válida de su centro.'});
  const baja=!A().activoEnFecha(tramos,dest.hasta)||String(w.estatus||'').toUpperCase()!=='ACTIVO';
  if(baja)av.push({codigo:'BAJA_FINIQUITO',bloquea:true,texto:'No está activo en la nómina destino: su saldo se paga y concilia en el finiquito (flujo de bajas), no en la nómina ordinaria.'});
  else if((w.fecha_reingreso||w.fecha_alta||'')>dest.hasta)av.push({codigo:'INGRESO_PROGRAMADO',bloquea:true,texto:'Ingreso programado posterior a la nómina destino.'});
  const fila=A().calcularFila({ejercicio:p.ejercicio,salario_base:Number(w.sd),dias_pactados:p.dias_pactados,respaldo_pactado:p.respaldo_pactado,
   corte:p.corte,hoy:o.hoy||today(),tramos,avisos:av,opciones:{bajaInclusiva:p.baja_inclusiva},politica:{computa:{ENFERMEDAD_GENERAL:p.eg_computa}},
   ausencias:{digitales:aus.digitales,rangos:aus.rangos,historicas:aus.historicas},cobertura:o.cobertura||null,exigir_cobertura:p.exigir_cobertura,
   fiscal_anual:x.contrato_version==='AG_CICLO_V1'?x.fiscal_anual:null,evidencias:evidenciasDe(x,tramos,p.ejercicio),fecha_pago:dest.fecha_pago,
   metodo_isr:p.metodo_isr,ingreso_mensual_ordinario:r2(Number(w.sd)*30.4),tarifa_mensual:ISR_M,calcularIsr96:isr96De(w,dest)});
  const aplicadas=(x.aplicaciones||[]).filter(a=>a.estado==='APLICADO');
  let motivo=null;
  const bloqueos=fila.observaciones.filter(o=>o.bloquea),soloBaja=bloqueos.length>0&&bloqueos.every(o=>o.codigo==='BAJA_FINIQUITO');
  if(!sel.incluido)motivo='EXCLUIDO_POR_FILTRO';
  else if(fila.estado==='SIN_SALDO'||soloBaja&&!(fila.saldo>0))motivo=fila.conciliacion&&(fila.conciliacion.acreditado+fila.conciliacion.reservado)>0?'YA_APLICADO':'SIN_SALDO';
  else if(bloqueos.some(x=>x.codigo==='BAJA_FINIQUITO'))motivo='BAJA_FINIQUITO';
  return clasificar({w,x,sel,dest,fila,motivo,aplicadas,eventos,identidad:x.identidad,huella:x.huella_fuentes});
 }
 function clasificar(f){
  const bloqueos=(f.fila.observaciones||[]).filter(o=>o.bloquea);
  let estado='DATOS_PENDIENTES';
  if(!f.sel.incluido)estado='EXCLUIDO_POR_FILTRO';
  else if(f.motivo==='YA_APLICADO'||f.motivo==='SIN_SALDO')estado=f.motivo;
  else if(f.fila.estado==='LISTA')estado='LISTA';
  else if(bloqueos.some(o=>o.codigo==='FISCAL_ANUAL_PENDIENTE'))estado='FISCAL_PENDIENTE';
  else if(bloqueos.some(o=>['EVIDENCIA_PENDIENTE','EXENCION_DESCONOCIDA'].includes(o.codigo)))estado='CONCILIACION_ANTERIOR';
  return {...f,estado_revision:estado,puede_revisar:!!f.sel.incluido,puede_aplicar:!!f.sel.incluido&&f.fila.estado==='LISTA'};
 }
 async function calcular(){
  // En el paso 1 se leen los campos; desde los demás pasos se recalcula con los parámetros vigentes.
  const seleccionPrevia=S.huboCalculo?new Set(S.sel):null;
  const p=leerParametros($('agc-ejercicio')?leerCrudo():S.p),t=++SECUENCIA;S.turno=t;
  S.p=p;S.calculado=false;S.paso=1;S.lotes=new Map();pintar();aviso('Consultando personal y fuentes del ejercicio…');
  try{
   const lista=await universo(p);if(!activo(t))return;
   if(!lista.length)throw Error('Ningún trabajador coincide con la razón social, centro y filtros elegidos.');
   const ctx=await contexto(lista.map(w=>w.id),p.ejercicio,t);if(!ctx||!activo(t))return;
   const porId=new Map(ctx.personas.map(x=>[x.trabajador_id,x])),identidades=new Map();
   for(const x of ctx.personas)identidades.set(x.identidad,(identidades.get(x.identidad)||0)+1);
   const filas=[];
   for(const w of lista){
    const x=porId.get(w.id);
    if(!x){filas.push(clasificar({w,x:{},sel:{incluido:true},dest:destinoDe(w,p.fecha_destino),fila:{estado:'BLOQUEADA',observaciones:[{codigo:'FUENTE_AUSENTE',bloquea:true,texto:'Lectura pendiente: '+(ctx.pendientes?.find(e=>e.id===w.id)?.motivo||'fuente ausente')}]},aplicadas:[]}));continue;}
    const av=x.identidad_duplicada||identidades.get(x.identidad)>1?[{codigo:'IDENTIDAD_DUPLICADA',bloquea:true,texto:'La misma CURP tiene otro expediente en esta razón social: verifica sus tramos y aplica sobre un solo expediente (art. 41 LFT, sin duplicar el derecho).'}]:[];
    filas.push(calcularPersona(w,x,p,{avisos:av,cobertura:coberturaDe(ctx.coberturas.find(c=>c.obra_id===w.obra_id))}));
   }
   filas.sort((a,b)=>(Number(a.w.no_trab)||9e9)-(Number(b.w.no_trab)||9e9));
   S.filas=filas.filter(f=>f.sel.incluido);
   S.fuera=filas.filter(f=>!S.filas.includes(f));
   S.sel=new Set(S.filas.filter(f=>f.puede_revisar&&(seleccionPrevia?seleccionPrevia.has(f.w.id):f.puede_aplicar)).map(f=>f.w.id));
   S.pagina=0;
   S.salud=ctx.salud;S.pendientesLectura=ctx.pendientes||[];S.metricas=ctx.metricas;S.calculado=ctx.completa!==false;S.huboCalculo=true;S.parametrosCambiaron=false;pintar();
  }catch(e){if(activo(t)){S.paso=0;pintar();toast(e.message,'err');}}
 }
 async function recalcularTrabajador(id){
  if(!activo()||S.aplicando)return;
  if(S.parametrosCambiaron)throw Error('Los parámetros cambiaron. Recalcula la corrida antes de revisar otra vez esta persona.');
  const i=S.filas.findIndex(f=>f.w.id===id);if(i<0)return;
  const previa=S.filas[i],t=S.turno;
  S.lecturas=S.lecturas||new Map();const turno=(S.lecturas.get(id)||0)+1;S.lecturas.set(id,turno);
  const vigente=()=>activo(t)&&S.lecturas.get(id)===turno;
  S.filas[i]=clasificar({...previa,fila:{...previa.fila,estado:'BLOQUEADA',
   observaciones:[...previa.fila.observaciones,{codigo:'LECTURA_PENDIENTE',bloquea:true,texto:'Actualizando fuentes de esta persona…'}]}});
  pintar();
  try{
   const ws=await universo(S.p,id);if(!vigente())return;
   if(!ws.length){
    S.filas=S.filas.filter(f=>f.w.id!==id);S.sel.delete(id);
    S.fuera=S.fuera.filter(f=>f.w.id!==id).concat({...previa,motivo:'EXCLUIDO_POR_FILTRO',sel:{incluido:false,detalle:'La ficha actual dejó de coincidir con el centro, estatus o filtros de esta corrida.'}});
    pintar();return;
   }
   const ctx=await contexto([id],S.p.ejercicio,t);if(!vigente()||!ctx)return;
   const x=ctx.personas.find(p=>p.trabajador_id===id);
   if(!x)throw Error(ctx.pendientes?.find(e=>e.id===id)?.motivo||'Información ausente: el servidor no devolvió el contexto de esta persona.');
   const duplicada=S.filas.concat(S.fuera).some(f=>f.w.id!==id&&f.identidad&&f.identidad===x.identidad);
   const avisos=x.identidad_duplicada||duplicada?[{codigo:'IDENTIDAD_DUPLICADA',bloquea:true,texto:'La identidad coincide con otra ficha de la corrida. Revisa sus ciclos antes de aplicar.'}]:[];
   const nueva=calcularPersona(ws[0],x,S.p,{avisos,cobertura:coberturaDe(ctx.coberturas.find(c=>c.obra_id===ws[0].obra_id))});
   for(const f of [previa,nueva]){const k=[f.dest.obra_id,f.dest.periodicidad,f.dest.desde,f.dest.hasta].join('|');S.lotes.delete(k);S.lotes.delete(k+':op');}
   S.filas=S.filas.filter(f=>f.w.id!==id);S.fuera=S.fuera.filter(f=>f.w.id!==id);
   if(nueva.sel.incluido){S.filas.splice(Math.min(i,S.filas.length),0,nueva);S.filas.sort((a,b)=>(Number(a.w.no_trab)||9e9)-(Number(b.w.no_trab)||9e9));}
   else{S.fuera.push(nueva);S.sel.delete(id);}
   S.historial=null;pintar();return nueva;
  }catch(error){
   if(!vigente())return;
   const pos=S.filas.findIndex(f=>f.w.id===id);
   if(pos>=0)S.filas[pos]=clasificar({...previa,fila:{...previa.fila,estado:'BLOQUEADA',
    observaciones:[...previa.fila.observaciones.filter(o=>!['LECTURA_PENDIENTE','LECTURA_FALLIDA'].includes(o.codigo)),{codigo:'LECTURA_FALLIDA',bloquea:true,texto:'Lectura fallida: '+error.message}]}});
   pintar();throw error;
  }
 }
 async function revisarEvidencia(i){
  const f=S.filas[i];if(!f)return;
  const api=window.PLATINUM_AGUINALDO_EVIDENCIAS;
  if(!api?.abrir)throw Error('No cargó el visor de evidencia anterior. Actualiza la plataforma.');
  return api.abrir({trabajador:f.w,ejercicio:S.p.ejercicio,pendientes:f.fila.conciliacion?.pendiente||[],
   contexto:f.x,tramos:f.fila.derecho?.tramos||[],alResolver:()=>recalcularTrabajador(f.w.id)});
 }

 /* ---------- Paso 2: personal y cálculo ---------- */
 const sumar=(fs,fn)=>r2(fs.reduce((s,f)=>s+(Number(fn(f))||0),0));
 function totales(fs){
  return {n:fs.length,causado:sumar(fs,f=>f.fila.bruto_causado),acreditado:sumar(fs,f=>f.fila.conciliacion?f.fila.conciliacion.acreditado+f.fila.conciliacion.reservado:0),
   pagar:sumar(fs,f=>f.fila.bruto_a_pagar),exento:sumar(fs,f=>f.fila.fiscal?.exento),gravado:sumar(fs,f=>f.fila.fiscal?.gravado),isr:sumar(fs,f=>f.fila.fiscal?.isr),neto:sumar(fs,f=>f.fila.fiscal?.neto)};
 }
 function antiguedad(w){
  const ini=String(w.fecha_reingreso&&(!w.fecha_baja||w.fecha_reingreso>w.fecha_baja)?w.fecha_reingreso:w.fecha_alta||'').slice(0,10);
  if(!ini)return '—';
  try{const d=A().util.dias(ini,today())-1;return d<0?'programado':d>=365?(d/365).toFixed(1)+' años':d+' días';}
  catch{return 'Por verificar';}
 }
 function seleccionadas(){return S.filas.filter(f=>S.sel.has(f.w.id)&&f.puede_revisar);}
 function listasSeleccionadas(){return seleccionadas().filter(f=>f.puede_aplicar);}
 function pendientesSeleccionadas(){return seleccionadas().filter(f=>['CONCILIACION_ANTERIOR','DATOS_PENDIENTES','FISCAL_PENDIENTE'].includes(f.estado_revision));}
 function motivosDe(f){
  const pendientes=f.fila.conciliacion?.pendiente||[],bloqueos=(f.fila.observaciones||[]).filter(o=>o.bloquea);
  const detalles=pendientes.map(e=>{
   const fecha=e.fecha_baja||e.fecha_pago;
   const baja=fecha?'Baja del '+fmtD(fecha):'Evidencia anterior';
   let motivo=e.motivo||baja+' sin aguinaldo desglosado en las fuentes disponibles.';
   if(e.origen==='PAPEL_CALCULO'&&e.importe_bruto!=null)motivo=baja+' con aguinaldo de $'+money(e.importe_bruto)+' en un papel de cálculo. Revisa y vincula la operación correspondiente.';
   if(e.origen==='CONCILIACION_VERIFICADA')motivo=baja+' con conciliación pendiente de acreditar su operación.';
   return motivo+(e.lectura_estado?' Estado de la fuente '+String(e.lectura_estado).replace(/_/g,' ').toLowerCase()+'.':'');
  });
  return [...detalles,...bloqueos.filter(o=>o.codigo!=='EVIDENCIA_PENDIENTE').map(o=>o.texto)];
 }
 function importeFila(f,importe){return ['LISTA','SIN_SALDO'].includes(f.fila.estado)&&importe!=null?'$'+money(importe):'Por confirmar';}
 function accionEvidencia(f,i){
  return f.fila.conciliacion?.pendiente?.length?`<button type="button" class="btn" data-agc-acc="evidencia" data-i="${i}">Revisar aguinaldo de la baja anterior</button>`:'';
 }
 function vistaPersonal(){
  const fs=S.filas,revisadas=seleccionadas(),listas=listasSeleccionadas(),pendientes=pendientesSeleccionadas(),t=totales(listas),obra=id=>OBRAS.find(o=>o.id===id)?.nombre||'—';
  const paginas=Math.max(1,Math.ceil(fs.length/50));S.pagina=Math.min(S.pagina,paginas-1);
  const filas=fs.slice(S.pagina*50,(S.pagina+1)*50).map((f,j)=>{
   const i=S.pagina*50+j;
   const d=f.fila.derecho||{},c=f.fila.conciliacion||{},x=f.fila.fiscal||{},bloq=f.fila.observaciones.filter(o=>o.bloquea),av=f.fila.observaciones.filter(o=>!o.bloquea);
   const inicio=d.tramos?.length?d.tramos[d.tramos.length-1].desde:f.w.fecha_reingreso||f.w.fecha_alta;
   return `<tr class="${bloq.length?'agc-bloqueada':''}">
    <td><input type="checkbox" style="width:auto" data-agc-sel="${esc(f.w.id)}" ${S.sel.has(f.w.id)?'checked':''} ${f.puede_revisar?'':'disabled'} aria-label="Seleccionar para revisión #${esc(f.w.no_trab)}"></td>
    <td>#${esc(f.w.no_trab??'—')} <b>${esc(fullName(f.w))}</b><div class="fhint">${esc(periodoPago(f.w))}${f.sel.programado?' · programado':''}</div></td>
    <td>${esc(obra(f.w.obra_id))}</td><td>${fmtD(inicio)}${d.tramos?.length>1?`<div class="fhint">${d.tramos.length} tramos</div>`:''}</td><td>${antiguedad(f.w)}</td>
    <td>${d.dias_vinculo??'—'}${d.dias_proyectados?`<div class="fhint">${d.dias_proyectados} proyectados</div>`:''}</td><td>${d.faltas_afectan??'—'}</td><td>${d.dias_computables??'—'}</td>
    <td>$${money(f.w.sd)}</td><td>${S.p.dias_pactados}</td><td>${d.bruto!=null?'$'+money(d.bruto):'Por calcular'}</td><td>${c.pendiente?.length?'Por confirmar':'$'+money(r2((c.acreditado||0)+(c.reservado||0)))}</td><td><b>${f.fila.bruto_a_pagar!=null?'$'+money(f.fila.bruto_a_pagar):'Por calcular'}</b></td>
    <td>${importeFila(f,x.exento)}</td><td>${importeFila(f,x.gravado)}</td><td>${importeFila(f,x.isr)}</td><td><b>${importeFila(f,x.neto)}</b></td>
    <td><strong>${esc(REVISION[f.estado_revision])}</strong>${motivosDe(f).map(txt=>`<div style="color:var(--red);font-size:11px">${esc(txt)}</div>`).join('')}${av.map(o=>`<div style="color:var(--amber);font-size:11px">⚠ ${esc(o.texto)}</div>`).join('')}</td>
    <td><button type="button" class="btn" data-agc-acc="desglose" data-i="${i}">Desglose</button>${accionEvidencia(f,i)}
      ${f.estado_revision==='DATOS_PENDIENTES'&&f.w.obra_id===OBRA?.id?'<button type="button" class="btn" data-agc-acc="ficha" data-i="'+i+'">Revisar ficha</button>':''}
      <button type="button" class="btn" data-agc-acc="recalcular-fila" data-i="${i}">Recalcular persona</button></td></tr>`;
  });
  const grupos=Object.keys(MOTIVOS).map(k=>[k,S.fuera.filter(f=>f.motivo===k)]).filter(([,xs])=>xs.length);
  return [`<div class="stats">
    <div class="stat b"><div class="n">${revisadas.length}</div><div class="l">Seleccionados para revisión · ${fs.length} en la corrida</div></div>
    <div class="stat g"><div class="n">${listas.length}</div><div class="l">Seleccionados listos para aplicar</div></div>
    <div class="stat a"><div class="n">${pendientes.length}</div><div class="l">Seleccionados pendientes de resolver</div></div>
    ${revisadas.length>listas.length+pendientes.length?`<div class="stat"><div class="n">${revisadas.length-listas.length-pendientes.length}</div><div class="l">Seleccionados sin saldo por aplicar</div></div>`:''}
    <div class="stat b"><div class="n">$${money(t.pagar)}</div><div class="l">Bruto a pagar · causado $${money(t.causado)} · acreditado $${money(t.acreditado)}</div></div>
    <div class="stat a"><div class="n">$${money(t.isr)}</div><div class="l">ISR · exento $${money(t.exento)} · gravado $${money(t.gravado)}</div></div>
    <div class="stat g"><div class="n">$${money(t.neto)}</div><div class="l">Neto confirmado de las filas listas</div></div></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button type="button" class="btn" data-agc-acc="sel-todo">Seleccionar todos para revisión</button><button type="button" class="btn" data-agc-acc="sel-ninguno">Quitar selección</button><button type="button" class="btn" data-agc-acc="calcular">↻ Recalcular</button><button type="button" class="btn" data-agc-acc="analisis">⬇ Excel de análisis</button></div>
   ${S.pendientesLectura?.length?`<p role="alert" style="color:var(--red)">Corrida incompleta: ${S.pendientesLectura.length} persona(s) sin lectura. Recalcular reintenta sólo las pendientes; conserva las respuestas confirmadas. No se puede aplicar ni exportar para firmas.</p>`:''}
   ${ctrlTabla(['','Trabajador','Centro','Ingreso / reingreso','Antigüedad','Días vínculo','Faltas que afectan','Días computables','Salario base','Días pactados','Bruto causado','Importe acreditado','Saldo a pagar','Exento','Gravado','ISR','Neto','Observaciones',''],filas,'Nadie queda en esta corrida con los filtros elegidos.')}
   ${paginas>1?`<div style="display:flex;align-items:center;gap:10px;margin:8px 0"><button type="button" class="btn" data-agc-acc="pagina" data-pagina="${S.pagina-1}" ${S.pagina===0?'disabled':''}>Anterior</button><span>Página ${S.pagina+1} de ${paginas}</span><button type="button" class="btn" data-agc-acc="pagina" data-pagina="${S.pagina+1}" ${S.pagina+1===paginas?'disabled':''}>Siguiente</button></div>`:''}
   <div class="sect" style="margin-top:14px">Fuera de esta corrida por filtros</div>
   ${grupos.length?grupos.map(([k,xs])=>`<details style="margin:6px 0"><summary><b>${esc(MOTIVOS[k])}</b> · ${xs.length}</summary>
     <ul style="margin:6px 0 0 18px;font-size:12px">${xs.slice(0,300).map(f=>`<li>#${esc(f.w.no_trab??'—')} ${esc(fullName(f.w))} — ${esc(f.motivo==='EXCLUIDO_POR_FILTRO'?f.sel.detalle:(motivosDe(f).join(' ')||'Saldo $'+money(f.fila.saldo)))}</li>`).join('')}</ul>
     ${k==='EXCLUIDO_POR_FILTRO'?'<button type="button" class="btn" data-agc-acc="ir" data-paso="0">Revisar parámetros del filtro</button>':''}</details>`).join(''):'<p class="fhint">Todos los trabajadores del universo filtrado están en la corrida.</p>'}`,
   `<button class="btn" data-agc-acc="ir" data-paso="0">← Parámetros</button><button class="btn" data-agc-acc="excel">⬇ Excel para firmas</button><button class="btn dark" data-agc-acc="ir" data-paso="2">Conciliación →</button>`];
 }
 function desglose(i){
  const f=S.filas[i];if(!f)return;
  const d=f.fila.derecho,c=f.fila.conciliacion,x=f.fila.fiscal,lst=(xs,fn)=>xs&&xs.length?`<ul style="margin:4px 0 8px 18px">${xs.map(fn).join('')}</ul>`:'<p class="fhint">Ninguno.</p>';
  const isr=x?.isr_detalle;
  modal2(`<div class="m-head"><h2>Desglose · #${esc(f.w.no_trab??'—')} ${esc(fullName(f.w))}</h2><button class="x" onclick="closeModal2()">×</button></div><div class="m-body" style="font-size:12.5px;line-height:1.6">
   ${d?`<div class="sect">Derecho (art. 87 LFT)</div>
   <p><b>Bruto = salario base × días pactados × días computables ÷ días del ejercicio</b><br>$${money(d.salario_base)} × ${d.dias_pactados} × ${d.dias_computables} ÷ ${d.denominador} = <b>$${money(d.bruto)}</b>
   ${d.dias_proyectados?`<br>Confirmados al día de hoy: ${d.dias_confirmados} · proyectados hasta el corte: ${d.dias_proyectados}`:''}<br>Al cierre del ejercicio (si no hay más faltas): $${money(d.bruto_cierre_proyectado)}</p>
   <p>Tramos del ejercicio:</p>${lst(d.tramos,t=>`<li>${fmtD(t.desde)} a ${fmtD(t.hasta)} · ${t.dias} días${t.verificar?' · por verificar (baja intermedia no registrada)':''}</li>`)}
   ${lst((f.eventos||[]).flatMap(e=>e.correcciones||[]),e=>`<li>Reingreso corregido de ${fmtD(e.fecha_anterior)} a ${fmtD(e.fecha_corregida)} · movimiento ${esc(e.id||'—')}${e.capturado_en?' · capturado '+esc(e.capturado_en):''}</li>`)}
   <p>Días de vínculo ${d.dias_vinculo} − faltas que afectan ${d.faltas_afectan} (digitales ${d.faltas_digitales}, históricas ${d.faltas_historicas}) = ${d.dias_computables} computables.</p>
   ${lst(d.ausencias.detalle,a=>`<li>${esc(a.fuente)} · ${a.fecha?fmtD(a.fecha):fmtD(a.desde)+' a '+fmtD(a.hasta)} · ${esc(A().NATURALEZAS[a.naturaleza]?.etiqueta||a.naturaleza||'Falta')}${a.complemento!=null?` · total acreditado ${a.total_acreditado}, digitales ${a.digitales}, complemento ${a.complemento}`:` · ${a.dias} día(s)`}${a.consumido_por?' · incluida en el total al corte':''}</li>`)}
   ${d.ausencias.pendientes.length?`<p style="color:var(--red)">Pendientes:</p>${lst(d.ausencias.pendientes,a=>`<li>${esc(a.fuente)} · ${esc(a.motivo)} · ${a.dias||1} día(s)</li>`)}`:''}`:'<p>No se pudo calcular el derecho.</p>'}
   <div class="sect">Pagos anteriores</div>
   ${c?`<p>Causado $${money(c.causado)} − acreditado $${money(c.acreditado)} − reservado en borradores $${money(c.reservado)} = saldo <b>${c.pendiente.length?'pendiente de confirmar':'$'+money(c.saldo)}</b>${!c.pendiente.length&&c.excedente?` · pagado de más $${money(c.excedente)}`:''}</p>
   ${lst(c.detalle,e=>`<li>${esc(e.origen)} · ${esc(e.estado||'')} · $${money(e.importe_bruto)} · ${esc(e.clase)}${e.exento!=null?' · exento $'+money(e.exento):''}${e.duplicados?.length?' · '+e.duplicados.length+' evidencia(s) de la misma operación no se suman':''}</li>`)}`:''}
   <div class="sect">Fiscal · pago ${fmtD(f.dest.fecha_pago)} (${esc(f.dest.periodicidad.toLowerCase())} ${fmtD(f.dest.desde)}–${fmtD(f.dest.hasta)})</div>
   ${x&&f.puede_aplicar?`<p>UMA $${money(x.uma)} (${esc(x.uma_fuente)}) · tope 30 UMA $${money(x.tope)} · ya usado en el año $${money(x.exento_usado)} · disponible $${money(x.disponible)}<br>
   Exento $${money(x.exento)} · gravado $${money(x.gravado)} (LISR art. 93 fr. XIV)</p>
   ${isr?isr.metodo==='ART174'?`<p>Art. 174 RLISR: I. $${money(isr.gravado)} ÷ 365 × 30.4 = $${money(isr.mensualizado)}; II. ISR de $${money(isr.ingreso_mensual_ordinario+isr.mensualizado)} = $${money(isr.isr_con)}; III. ISR del ordinario $${money(isr.isr_sin)}; diferencia $${money(isr.diferencia)}; V. tasa ${(isr.tasa*100).toFixed(4)}%; IV. ISR = $${money(isr.isr)}.</p>`
     :`<p>Art. 96 LISR (incremental): ISR con aguinaldo $${money(isr.isr_con_aguinaldo)} − ISR ordinario $${money(isr.isr_ordinario)} = <b>$${money(isr.isr)}</b>. Efecto en subsidio: $${money(isr.efecto_subsidio)} (se muestra una sola vez; ya está dentro del ISR incremental).</p>`:''}
   <p>Neto del aguinaldo: <b>$${money(x.neto)}</b>. El ajuste anual (art. 97 LISR) es un proceso aparte.</p>`:'<p class="fhint">Sin fiscal: revisa las observaciones.</p>'}
   <div class="sect">Observaciones</div>${lst(motivosDe(f),o=>`<li style="color:var(--red)">${esc(o)}</li>`)}${lst(f.fila.observaciones.filter(o=>!o.bloquea),o=>`<li style="color:var(--amber)">${esc(o.texto)}</li>`)}
   <p class="fhint">Reglas ${esc(A().VERSION)} · motor ${esc(MOTOR_NOMINA_VERSION)} · huella de fuentes ${esc(String(f.huella||'').slice(0,12))}</p></div>
   <div class="m-foot">${accionEvidencia(f,i)}<button class="btn" onclick="closeModal2()">Cerrar</button></div>`,'lg');
  const overlays=$('modals').querySelectorAll('.overlay');
  overlays[overlays.length-1].addEventListener('click',e=>{if(e.target.closest('[data-agc-acc]'))clic(e).catch(x=>toast(x.message,'err'));});
 }

 /* ---------- Paso 3: conciliación ---------- */
 function vistaConciliacion(){
  const fs=seleccionadas().filter(f=>f.fila.conciliacion);
  const filas=fs.map(f=>{const c=f.fila.conciliacion;return `<tr><td>#${esc(f.w.no_trab??'—')} ${esc(fullName(f.w))}</td><td>$${money(c.causado)}</td><td>$${money(c.acreditado)}</td><td>$${money(c.reservado)}</td>
   <td>${c.pendiente.length?`<span style="color:var(--red)">${c.pendiente.length} sin desglose</span>`:'—'}</td><td><b>${c.pendiente.length?'Por confirmar':'$'+money(c.saldo)}</b>${!c.pendiente.length&&c.excedente?`<div style="color:var(--amber);font-size:11px">Pagado de más $${money(c.excedente)}</div>`:''}</td>
   <td>${c.exento_desconocido?'<span style="color:var(--red)">Desconocido</span>':'$'+money(c.exento_usado)}</td>
   <td style="font-size:11px">${c.detalle.map(e=>`${esc(e.origen.replace(/_/g,' ').toLowerCase())} · ${esc(String(e.estado||'').toLowerCase())} · $${money(e.importe_bruto)} → ${esc(e.clase.toLowerCase())}`).join('<br>')||'Sin pagos anteriores'}${accionEvidencia(f,S.filas.indexOf(f))}</td></tr>`;});
  return [`<p class="fhint">Las evidencias vinculadas a una operación aplicada o a un pago respaldan lo acreditado. Las aplicaciones en borrador se muestran como reservado. El papel de consulta aporta datos que deben vincularse a su operación. Revisa el desglose, la fecha y las referencias de cada baja anterior.</p>
   ${ctrlTabla(['Trabajador','Causado','Acreditado','Reservado','Evidencia pendiente','Saldo','Exento usado en el año','Evidencias'],filas,'Sin personas en la corrida.')}`,
   `<button class="btn" data-agc-acc="ir" data-paso="1">← Personal y cálculo</button><button class="btn dark" data-agc-acc="ir" data-paso="3">Aplicación →</button>`];
 }

 /* ---------- Paso 4: aplicación e historial ---------- */
 function lotesDe(fs){
  const m=new Map();
  for(const f of fs){const k=[f.dest.obra_id,f.dest.periodicidad,f.dest.desde,f.dest.hasta].join('|');if(!m.has(k))m.set(k,{clave:k,...f.dest,filas:[]});m.get(k).filas.push(f);}
  return [...m.values()].sort((a,b)=>String(OBRAS.find(o=>o.id===a.obra_id)?.nombre).localeCompare(String(OBRAS.find(o=>o.id===b.obra_id)?.nombre),'es')||a.periodicidad.localeCompare(b.periodicidad));
 }
 function vistaAplicacion(){
  const revisadas=seleccionadas(),listas=listasSeleccionadas(),sinAplicar=revisadas.filter(f=>!f.puede_aplicar),porResolver=pendientesSeleccionadas();
  const lotes=lotesDe(listas),puede=puedeEditarTrabajador(),pendientes=lotes.filter(l=>!/^(Aplicado|Ya estaba)/.test(S.lotes.get(l.clave)||''));
  const filas=lotes.map(l=>{const t=totales(l.filas),st=S.lotes.get(l.clave);return `<tr><td>${esc(OBRAS.find(o=>o.id===l.obra_id)?.nombre||'—')}</td><td>${esc(l.periodicidad)}</td><td>S${l.semana} · ${fmtD(l.desde)}–${fmtD(l.hasta)}</td><td>${fmtD(l.fecha_pago)}</td>
   <td>${t.n}</td><td>$${money(t.pagar)}</td><td>$${money(t.isr)}</td><td>$${money(t.neto)}</td><td>${st?esc(st):'Por aplicar'}</td></tr>`;});
  const h=S.historial;
  const hist=(h||[]).map(l=>{const w=S.filas.concat(S.fuera).find(f=>f.w.id===l.trabajador_id)?.w||WORKERS.find(x=>x.id===l.trabajador_id);
   const retirable=puede&&l.estado==='APLICADO'&&!PROTEGIDOS.includes(l.estado_destino);
   return `<tr><td>${fmtD(String(l.created_at||'').slice(0,10))}</td><td>${w?'#'+esc(w.no_trab??'—')+' '+esc(fullName(w)):esc(String(l.trabajador_id).slice(0,8))}</td><td>${esc(l.periodicidad)} · ${fmtD(l.periodo_desde)}–${fmtD(l.periodo_hasta)}</td>
    <td>$${money(l.bruto)}</td><td>$${money(l.isr)}</td><td>$${money(l.neto)}</td><td>${esc(l.estado==='APLICADO'?'Aplicado a '+String(l.estado_destino||'').toLowerCase().replace('sin_cierre','borrador sin cierre'):'Retirado')}</td>
    <td>${retirable?`<button type="button" class="btn" data-agc-acc="retirar" data-id="${esc(l.id)}" data-version="${esc(l.version)}">Retirar</button>`:l.estado==='APLICADO'&&PROTEGIDOS.includes(l.estado_destino)?'<span class="fhint">Corrección por ajuste autorizado</span>':''}</td></tr>`;});
  return [`<p><b>${listas.length} persona(s) listas para aplicar</b> de ${revisadas.length} seleccionadas para revisión · ${porResolver.length} pendiente(s) · ${sinAplicar.length-porResolver.length} sin saldo por aplicar.</p>
   ${sinAplicar.length?`<details open><summary>Personas fuera de la aplicación actual</summary><ul>${sinAplicar.map(f=>`<li>#${esc(f.w.no_trab)} ${esc(fullName(f.w))} · ${esc(REVISION[f.estado_revision])} · ${esc(motivosDe(f).join(' '))}</li>`).join('')}</ul></details>`:''}
   <p class="fhint">Cada centro y periodicidad es un lote independiente; dentro de un lote se aplica todo o nada. Las bajas no entran: su saldo va al finiquito. Una nómina autorizada, timbrada o pagada no recibe aplicaciones; su corrección va por el flujo autorizado de ajuste.</p>
   ${ctrlTabla(['Centro','Periodicidad','Periodo destino','Fecha de pago','Personas','Bruto','ISR','Neto','Estado'],filas,'Selecciona personas listas en el paso 2.')}
   <div class="sect" style="margin-top:14px">Historial del ejercicio ${S.p.ejercicio}</div>
   ${h?ctrlTabla(['Fecha','Trabajador','Periodo','Bruto','ISR','Neto','Estado',''],hist,'Sin aplicaciones registradas.'):'<button type="button" class="btn" data-agc-acc="historial">Consultar historial</button>'}`,
   `<button class="btn" data-agc-acc="ir" data-paso="2">← Conciliación</button><button class="btn" data-agc-acc="excel">⬇ Excel para firmas</button>
    <button class="btn dark" data-agc-acc="aplicar" ${!pendientes.length||!puede||S.aplicando?'disabled':''} title="${puede?'':'Tu usuario sólo puede consultar'}">Aplicar a nómina abierta</button>`];
 }
 async function historial(){
  const t=S.turno,{data,error}=await sb.rpc('control_aguinaldo',{p_accion:'HISTORIAL',p_datos:{ejercicio:S.p.ejercicio,...(S.p.centro?{obra_id:S.p.centro}:{})}});
  if(!activo(t))return;if(error)throw Error(error.message);
  S.historial=data.lineas||[];pintar();
 }
 function lineaDe(f){
  if(!f.puede_aplicar||f.fila.estado!=='LISTA')throw Error('Esta persona tiene información pendiente y requiere revisión antes de aplicar.');
  const d=f.fila.derecho,c=f.fila.conciliacion,x=f.fila.fiscal,aplicado=r2(f.aplicadas.reduce((s,a)=>s+Number(a.bruto),0));
  return {trabajador_id:f.w.id,ciclo:f.x.ciclo,huella_fuentes:f.huella,semana:f.dest.semana,periodicidad:f.dest.periodicidad,periodo_desde:f.dest.desde,periodo_hasta:f.dest.hasta,fecha_pago:f.dest.fecha_pago,
   salario_base:d.salario_base,dias_pactados:d.dias_pactados,dias_computables:d.dias_computables,denominador:d.denominador,bruto_causado:d.bruto,
   acreditado_externo:r2(Math.max(0,c.acreditado+c.reservado-aplicado)),bruto:f.fila.bruto_a_pagar,exento_usado:x.exento_usado,exento:x.exento,gravado:x.gravado,
   metodo_isr:x.isr_detalle.metodo,isr:x.isr,
   desglose:{reglas:A().VERSION,ciclo:f.x.ciclo,fiscal_anual:f.x.fiscal_anual,derecho:{tramos:d.tramos,dias_vinculo:d.dias_vinculo,dias_confirmados:d.dias_confirmados,dias_proyectados:d.dias_proyectados,faltas_digitales:d.faltas_digitales,
     faltas_historicas:d.faltas_historicas,faltas_afectan:d.faltas_afectan,corte:d.corte,ausencias:d.ausencias.detalle},conciliacion:{acreditado:c.acreditado,reservado:c.reservado,detalle:c.detalle.map(e=>({id:e.id,origen:e.origen,estado:e.estado,clase:e.clase,importe_bruto:e.importe_bruto,exento:e.exento}))},
     fiscal:{uma:x.uma,tope:x.tope,exento_usado:x.exento_usado,exento:x.exento,gravado:x.gravado,isr_detalle:x.isr_detalle,neto:x.neto},observaciones:f.fila.observaciones}};
 }
 async function protegidos(lotes){
  if(!window.PLATINUM_FLOWS?.obtenerVersiones)return [];
  const out=[];
  for(const l of lotes){
   const v=await window.PLATINUM_FLOWS.obtenerVersiones([l.obra_id],'S'+l.semana);
   if((v?.cierres||[]).some(c=>c.obra_id===l.obra_id&&PROTEGIDOS.includes(c.estado)&&(c.periodo==='TODOS'||c.periodo===l.periodicidad)))out.push(l);
  }
  return out;
 }
 async function aplicar(){
  if(S.aplicando)return;
  if(S.parametrosCambiaron||!S.calculado)throw Error('Recalcula la corrida con los parámetros actuales antes de aplicar.');
  if(!puedeEditarTrabajador())throw Error('Tu usuario sólo puede consultar.');
  // Un lote ya aplicado en esta simulación no se reenvía: hay que recalcular para ver el saldo nuevo.
  const lotes=lotesDe(listasSeleccionadas()).filter(l=>!/^(Aplicado|Ya estaba)/.test(S.lotes.get(l.clave)||'')),t=S.turno;
  if(!lotes.length)throw Error('No hay lotes pendientes en esta simulación. Recalcula para ver los saldos actualizados.');
  const cerrados=await protegidos(lotes);if(!activo(t))return;
  if(cerrados.length)throw Error(`La nómina destino ya está autorizada, timbrada o pagada en ${cerrados.map(l=>(OBRAS.find(o=>o.id===l.obra_id)?.nombre||'')+' '+l.periodicidad.toLowerCase()).join(', ')}. Elige otra fecha de nómina destino.`);
  const resumen=lotes.map(l=>{const x=totales(l.filas);return `• ${OBRAS.find(o=>o.id===l.obra_id)?.nombre||''} · ${l.periodicidad.toLowerCase()} ${fmtD(l.desde)}–${fmtD(l.hasta)} (pago ${fmtD(l.fecha_pago)}): ${x.n} persona(s), bruto $${money(x.pagar)}, ISR $${money(x.isr)}, neto $${money(x.neto)}`;}).join('\n');
  const pendientesRevision=pendientesSeleccionadas();
  if(!confirm(`Aplicar aguinaldo ${S.p.ejercicio} a la nómina abierta:\n\n${resumen}\n\n${pendientesRevision.length} persona(s) seleccionadas permanecen pendientes de revisión.\nSe agrega como percepción (bruto, exento, gravado e ISR). Mientras la nómina sea editable podrás retirarlo. ¿Continuar?`))return;
  S.aplicando=true;pintar();
  const conflictos=new Map();let ok=0;
  try{
   for(const l of lotes){
    if(!activo(t))return;
    const lineas=l.filas.map(lineaDe),firma=A().canonico(lineas);
    // Reintento con el mismo identificador sólo si las líneas no cambiaron.
    const previa=S.lotes.get(l.clave+':op');const operacion_id=previa&&previa.firma===firma?previa.id:crypto.randomUUID();
    S.lotes.set(l.clave+':op',{id:operacion_id,firma});
    const {data,error}=await sb.rpc('control_aguinaldo',{p_accion:'APLICAR',p_datos:{operacion_id,alcance:'CICLO_VIGENTE_V1',empresa_codigo:S.empresa,ejercicio:S.p.ejercicio,reglas_version:A().VERSION,motor_version:MOTOR_NOMINA_VERSION,
     parametros:{...S.p,dias_pactados:S.p.dias_pactados,respaldo_pactado:S.p.respaldo_pactado},lineas}});
    if(error){
     if(error.message==='CONFLICTO_AGUINALDO'){let xs=[];try{xs=JSON.parse(error.details||'[]');}catch(e){}for(const c of xs)conflictos.set(c.trabajador_id,c.motivo);S.lotes.set(l.clave,'Sin aplicar: '+xs.length+' persona(s) requieren recalcular');continue;}
     S.lotes.set(l.clave,'Error: '+error.message);continue;
    }
    ok++;S.lotes.set(l.clave,data.repetido?'Ya estaba aplicado':`Aplicado · ${data.lineas} línea(s)`);S.lotes.delete(l.clave+':op');
   }
  }finally{S.aplicando=false;}
  if(!activo(t))return;
  if(conflictos.size){const txt={FUENTES_CAMBIARON:'cambiaron sus fuentes',PERIODO_PROTEGIDO:'nómina protegida',SALARIO_CAMBIO:'cambió el salario',SALDO_INSUFICIENTE:'saldo insuficiente',EXENCION_CONSUMIDA:'la exención ya se usó'};
   S.filas=S.filas.map(f=>conflictos.has(f.w.id)?clasificar({...f,fila:{...f.fila,estado:'BLOQUEADA',
    observaciones:[...f.fila.observaciones,{codigo:conflictos.get(f.w.id),bloquea:true,texto:(txt[conflictos.get(f.w.id)]||conflictos.get(f.w.id))+'. Recalcula esta persona antes de aplicar.'}]}}):f);
   toast(`${conflictos.size} persona(s) sin aplicar: ${[...new Set(conflictos.values())].map(m=>txt[m]||m).join(', ')}. Recalcula antes de reintentar.`,'err');}
  if(ok)toast(`${ok} lote(s) aplicados. Revisa la proyección de la nómina destino.`,'ok');
  S.historial=null;pintar();if(ok)historial().catch(e=>toast(e.message,'err'));
 }
 async function retirar(id,version){
  const motivo=prompt('Motivo del retiro (queda en la bitácora):');if(motivo==null)return;
  if(motivo.trim().length<5)throw Error('Escribe el motivo del retiro.');
  const {error}=await sb.rpc('control_aguinaldo',{p_accion:'RETIRAR',p_datos:{id,version:Number(version),motivo:motivo.trim()}});
  if(error)throw Error(error.message);
  toast('Aplicación retirada. Recalcula para ver el saldo.','ok');S.historial=null;await historial();
 }

 /* ---------- Excel para firmas ---------- */
 function excel(){
  if(!S.calculado)throw Error('Completa las lecturas pendientes antes de exportar para firmas.');
  if(S.parametrosCambiaron)throw Error('Recalcula con los parámetros actuales antes de exportar para firmas.');
  const fs=listasSeleccionadas();if(!fs.length)throw Error('Selecciona personas listas para exportar.');
  const p=S.p,rows=[[`AGUINALDO ${p.ejercicio} — ART. 87 LFT — ${p.dias_pactados} DÍAS — CORTE ${fmtD(p.corte)} — PAGO ANTES DEL 20 DE DICIEMBRE`],[`${razonSocialEmpresa()} · ${p.centro?OBRAS.find(o=>o.id===p.centro)?.nombre:'Todos los centros'} · simulación ${fmtD(today())}`],
   ['NO.','TRABAJADOR','NSS','CENTRO','SALARIO BASE','DÍAS VÍNCULO','FALTAS QUE AFECTAN','DÍAS COMPUTABLES','BRUTO CAUSADO','ACREDITADO','BRUTO A PAGAR','EXENTO','GRAVADO','ISR','NETO','FIRMA DE RECIBIDO']];
  const styles=[ST.title,ST.sub,ST.head],m=[4,8,9,10,11,12,13,14];
  for(const f of fs){const d=f.fila.derecho,c=f.fila.conciliacion,x=f.fila.fiscal;
   rows.push([f.w.no_trab??'',fullName(f.w),f.w.nss||'',OBRAS.find(o=>o.id===f.w.obra_id)?.nombre||'',Number(f.w.sd)||0,d.dias_vinculo,d.faltas_afectan,d.dias_computables,d.bruto,r2(c.acreditado+c.reservado),f.fila.bruto_a_pagar,x.exento,x.gravado,x.isr,x.neto,'']);
   styles.push(rows[2].map((_,i)=>m.includes(i)?ST.money:i===1||i===3||i===15?ST.cell:ST.cellC));}
  const t=rows.length+1,u=rows.length;
  rows.push(['','TOTAL','','','','','','',...[8,9,10,11,12,13,14].map(i=>r2(fs.reduce((s,_,j)=>s+Number(rows[3+j][i]),0))),'']);
  styles.push(rows[2].map((_,i)=>m.includes(i)?ST.totalMoney:ST.total));
  rows.push(['Bruto = salario base × días pactados × días computables ÷ días del ejercicio. Exento: 30 UMA por patrón y año de pago (LISR 93-XIV). ISR: '+(p.metodo_isr==='ART174'?'art. 174 RLISR.':'art. 96 LISR, incremental del periodo.')]);styles.push(ST.sub);
  const ws=buildSheet(rows,styles,[6,32,13,20,11,9,9,10,13,13,13,12,12,11,13,24],[{s:{r:0,c:0},e:{r:0,c:15}},{s:{r:1,c:0},e:{r:1,c:15}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:15}}],[{hpt:28},{hpt:20},{hpt:34},...fs.map(()=>({hpt:28})),{hpt:22},{hpt:30}]);
  for(const c of ['I','J','K','L','M','N','O'])if(ws[c+t]){ws[c+t].t='n';ws[c+t].f=`SUM(${c}4:${c}${u})`;}
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,`AGUINALDO ${p.ejercicio}`);
  wb.__empresaPorHoja={[`AGUINALDO ${p.ejercicio}`]:S.empresa};
  return dl(wb,`AGUINALDO_${p.ejercicio}_${S.empresa}_${today()}.xlsx`);
 }
 function excelAnalisis(){
  const fs=seleccionadas();if(!fs.length)throw Error('Selecciona personas para revisar y exportar el análisis.');
  const p=S.p,rows=[[`ANÁLISIS DE AGUINALDO ${p.ejercicio} · CORTE ${fmtD(p.corte)}`],
   [razonSocialEmpresa()+' · '+fmtD(today())],
   ['NO.','TRABAJADOR','CENTRO','ESTADO','MOTIVO / DATO PENDIENTE','INGRESO / REINGRESO','TRAMOS DEL EJERCICIO','DÍAS COMPUTABLES','SALARIO BASE','BRUTO CALCULABLE','ACREDITADO','RESERVADO','SALDO CONFIRMADO','EXENTO','GRAVADO','ISR','NETO CONFIRMADO','REFERENCIAS','EJERCICIO','CORTE','DÍAS VÍNCULO','FALTAS QUE AFECTAN','DÍAS PROYECTADOS','HUELLA DE FUENTES']];
  const styles=[ST.title,ST.sub,ST.head],dinero=[8,9,10,11,12,13,14,15,16];
  for(const f of fs){
   const d=f.fila.derecho,c=f.fila.conciliacion,x=f.fila.fiscal,confirmado=['LISTA','SIN_SALDO'].includes(f.fila.estado);
   rows.push([f.w.no_trab??'',fullName(f.w),OBRAS.find(o=>o.id===f.w.obra_id)?.nombre||'',REVISION[f.estado_revision],
    motivosDe(f).join(' '),f.x.ciclo?.inicio||f.w.fecha_reingreso||f.w.fecha_alta||'',(d?.tramos||[]).map(t=>t.desde+' a '+t.hasta).join(' | '),
    d?.dias_computables??'',Number(f.w.sd)||'',d?.bruto??'',c?.acreditado??'',c?.reservado??'',
    confirmado?c?.saldo??'':'',confirmado?x?.exento??'':'',confirmado?x?.gravado??'':'',confirmado?x?.isr??'':'',confirmado?x?.neto??'':'',
    (c?.detalle||[]).map(e=>[e.id,e.origen,e.fecha_pago,e.clase].filter(Boolean).join(' · ')).join(' | '),p.ejercicio,p.corte,d?.dias_vinculo??'',d?.faltas_afectan??'',d?.dias_proyectados??'',f.huella||'']);
   styles.push(rows[2].map((_,i)=>dinero.includes(i)?ST.money:i===1||i===4||i===6||i===17?ST.cell:ST.cellC));
  }
  rows.push(['Los campos de saldo, ISR o neto pendientes de confirmación se muestran vacíos. Consulta el motivo y resuelve sus fuentes antes de aplicar.']);styles.push(ST.sub);
  const ws=buildSheet(rows,styles,[7,32,22,25,60,16,48,12,14,16,15,15,18,15,15,13,18,60,10,16,12,12,12,36],
   [{s:{r:0,c:0},e:{r:0,c:23}},{s:{r:1,c:0},e:{r:1,c:23}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:23}}],
   [{hpt:28},{hpt:20},{hpt:38},...fs.map(()=>({hpt:46})),{hpt:32}]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'ANÁLISIS');
  wb.__empresaPorHoja={'ANÁLISIS':S.empresa};
  return dl(wb,`AGUINALDO_ANALISIS_${p.ejercicio}_${S.empresa}_${today()}.xlsx`);
 }

 /* ---------- Eventos ---------- */
 async function clic(e){
  const paso=e.target.closest('[data-agc-paso]');
  if(paso&&!paso.disabled){S.paso=Number(paso.dataset.agcPaso);pintar();return;}
  const b=e.target.closest('[data-agc-acc]');if(!b||b.disabled)return;
  const acc=b.dataset.agcAcc;
  if(acc==='calcular')return calcular();
  if(acc==='ir'){S.paso=Number(b.dataset.paso);pintar();if(S.paso===3&&!S.historial)historial().catch(x=>toast(x.message,'err'));return;}
  if(acc==='sel-todo'){S.sel=new Set(S.filas.filter(f=>f.puede_revisar).map(f=>f.w.id));return pintar();}
  if(acc==='sel-ninguno'){S.sel=new Set();return pintar();}
  if(acc==='pagina'){S.pagina=Math.max(0,Number(b.dataset.pagina)||0);return pintar();}
  if(acc==='desglose')return desglose(Number(b.dataset.i));
  if(acc==='evidencia')return revisarEvidencia(Number(b.dataset.i));
  if(acc==='recalcular-fila')return recalcularTrabajador(S.filas[Number(b.dataset.i)]?.w.id);
  if(acc==='ficha'){
   const f=S.filas[Number(b.dataset.i)];if(!f)return;
   if(typeof openDetail!=='function')throw Error('No cargó la ficha del trabajador.');
   return openDetail(f.w.id,undefined,{seccion:'faltas'});
  }
  if(acc==='excel')return excel();
  if(acc==='analisis')return excelAnalisis();
  if(acc==='aplicar')return aplicar();
  if(acc==='historial')return historial();
  if(acc==='retirar')return retirar(b.dataset.id,b.dataset.version);
 }
 function cambio(e){
  const s=e.target.closest('[data-agc-sel]');
  if(s){const id=s.dataset.agcSel;if(!S.filas.some(f=>f.w.id===id&&f.puede_revisar))return;if(s.checked)S.sel.add(id);else S.sel.delete(id);pintar();return;}
  if(S.paso===0&&e.target.id?.startsWith('agc-')){
   S.abortLectura?.abort();S.turno=++SECUENCIA;S.parametrosCambiaron=true;
   $('agc').querySelectorAll('[data-agc-paso]').forEach(b=>{if(Number(b.dataset.agcPaso)>0)b.disabled=true;});
  }
  if(e.target.id==='agc-estatus'&&$('agc-fecha_estatus')){$('agc-fecha_estatus').disabled=e.target.value==='ACTIVOS_HOY';if(e.target.value==='ACTIVOS_HOY')$('agc-fecha_estatus').value=today();}
  // El centro cambia las cuadrillas y la fecha destino su periodo: se repinta conservando lo capturado.
  if(e.target.id==='agc-centro'||e.target.id==='agc-fecha_destino'){S.p={...leerCrudo(),...(e.target.id==='agc-centro'?{cuadrilla:''}:{})};pintar();}
 }
 // Lectura común de fuentes: la ficha (faltas históricas) y el finiquito usan las mismas reglas.
 function antesCerrar(overlay){if(!S||overlay&&!overlay.querySelector('#agc'))return true;if(S.aplicando)return false;S.abortLectura?.abort();S.turno=++SECUENCIA;return true;}
 window.PLATINUM_AGUINALDO_UI=Object.freeze({abrir,antesCerrar,recalcularTrabajador,fuentes:Object.freeze({eventosDe,ausenciasDe,evidenciasDe,coberturaDe,cantidadFaltas}),_pruebas:{calcularPersona,evidenciasDe,ausenciasDe,cantidadFaltas,destinoDe,coberturaDe,lotesDe,lineaDe,seleccionadas,listasSeleccionadas,clasificar,estado:()=>S}});
})();
