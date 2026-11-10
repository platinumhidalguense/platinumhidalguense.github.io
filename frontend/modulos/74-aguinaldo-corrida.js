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
 let S=null;

 function parametrosIniciales(){
  const hoy=today(),ej=Number(hoy.slice(0,4));
  return {ejercicio:ej,centro:OBRA?.id||'',periodicidad:'TODOS',contratista:'',cuadrilla:'',rp:'',texto:'',
   modo:'VINCULO',desde:`${ej}-01-01`,hasta:hoy,estatus:'ACTIVOS_HOY',fecha_estatus:hoy,corte:`${ej}-12-31`,
   dias_pactados:15,respaldo_pactado:'',eg_computa:false,baja_inclusiva:true,exigir_cobertura:false,fecha_destino:hoy,metodo_isr:'ART96'};
 }
 function abrir(){
  if(!A()){toast('No cargó el núcleo de aguinaldo. Recarga la plataforma.','err');return;}
  S={turno:0,paso:0,p:parametrosIniciales(),empresa:EMPRESA_ACTIVA,calculado:false,filas:[],fuera:[],sel:new Set(),coberturas:[],historial:null,aplicando:false,lotes:new Map()};
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
  $('agc').querySelectorAll('[data-agc-paso]').forEach(b=>{const i=Number(b.dataset.agcPaso);b.setAttribute('aria-current',String(i===S.paso));b.disabled=i>0&&!S.calculado;b.classList.toggle('dark',i===S.paso);});
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
    ${campo('estatus','Estatus',sel('estatus',[['ACTIVOS_HOY','Activos hoy'],['ACTIVOS_AL_CORTE','Activos a una fecha'],['BAJAS_CON_SALDO','Bajas con saldo']],p.estatus))}
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
   modo:v('modo'),desde:v('desde'),hasta:v('hasta'),estatus:v('estatus'),fecha_estatus:v('estatus')==='ACTIVOS_HOY'?today():v('fecha_estatus'),corte:v('corte'),
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
 async function universo(p){
  const r=p.centro?await fetchAllRows(()=>sb.from('trabajadores').select('*').eq('obra_id',p.centro).eq('eliminado',false)):await leerPorEmpresa('trabajadores','*',q=>q.eq('eliminado',false));
  if(r.error||!Array.isArray(r.data))throw Error('No se pudo leer el personal: '+(r.error?.message||'respuesta incompleta'));
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toUpperCase(),t=norm(p.texto),rp=norm(p.rp).replace(/[^A-Z0-9]/g,'');
  const rpDeW=w=>norm(w.registro_patronal||OBRAS.find(o=>o.id===w.obra_id)?.registro_patronal).replace(/[^A-Z0-9]/g,'');
  return r.data.filter(w=>w.estatus!=='PENDIENTE'&&(p.periodicidad==='TODOS'||periodoPago(w)===p.periodicidad)
   &&(!p.contratista||norm(w.contratista)===norm(p.contratista))&&(!p.cuadrilla||w.id_cuadrilla===p.cuadrilla)&&(!rp||rpDeW(w)===rp)
   &&(!t||String(w.no_trab)===t||norm(fullName(w)).includes(t)||norm(w.curp)===t));
 }
 async function contexto(ids,ej,t){
  const out={personas:[],coberturas:[],salud:false};
  for(let i=0;i<ids.length;i+=500){
   const {data,error}=await sb.rpc('control_aguinaldo',{p_accion:'CONTEXTO',p_datos:{ejercicio:ej,trabajadores:ids.slice(i,i+500)}});
   if(!activo(t))return null;
   if(error){
    if(/control_aguinaldo|could not find the function|PGRST202/i.test(error.message+' '+(error.code||'')))throw Error('El servidor todavía no tiene la migración de aguinaldo y faltas históricas. Sin sus fuentes no se calcula; puedes usar el cálculo simple de consulta.');
    throw Error(error.message);
   }
   out.personas.push(...(data.personas||[]));out.coberturas.push(...(data.coberturas||[]));out.salud=!!data.salud;
  }
  return out;
 }
 function eventosDe(w,movs){
  const ev=[];
  for(const m of movs||[]){
   const a=String(m.accion||'').toUpperCase();
   // La ficha manda para el alta: un alta del historial sólo se usa si la ficha no la tiene.
   if(a==='ALTA'&&m.fecha_alta&&!w.fecha_alta)ev.push({tipo:'ALTA',fecha:m.fecha_alta});
   else if(a==='BAJA'&&m.fecha_baja)ev.push({tipo:'BAJA',fecha:m.fecha_baja});
   else if(a==='REACTIVACION'&&m.fecha_reingreso)ev.push({tipo:'REINGRESO',fecha:m.fecha_reingreso});
   else if(a==='CORRECCION_REINGRESO'&&m.fecha_reingreso){const u=[...ev].reverse().find(e=>e.tipo==='REINGRESO');if(u)u.fecha=m.fecha_reingreso;else ev.push({tipo:'REINGRESO',fecha:m.fecha_reingreso});}
  }
  return ev.map(e=>({...e,fecha:String(e.fecha).slice(0,10),origen:'HISTORIAL'}));
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
  const ev=[],num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v),baja=f=>'BAJA:'+String(f||'').slice(0,10),delAnio=f=>String(f||'').slice(0,4)===String(ej);
  for(const a of x.aplicaciones||[])ev.push({id:a.id,operacion:'APL:'+a.id,origen:'APLICACION',estado:a.estado==='APLICADO'?a.estado_destino:a.estado,
   importe_bruto:Number(a.bruto),exento:num(a.exento),fecha_pago:a.fecha_pago,semana:a.semana,obra_id:a.obra_id,aplicado:a.estado==='APLICADO'});
  const fins=(x.finiquitos||[]).filter(f=>delAnio(f.periodo));
  const pap=(x.papeles||[]).filter(p=>p.ejercicio!=null?Number(p.ejercicio)===ej:delAnio(p.fecha_baja)).sort((a,b)=>Number(b.revision||0)-Number(a.revision||0));
  for(const f of fins)if(num(f.aguinaldo)!=null)ev.push({id:f.id,operacion:baja(f.periodo),origen:'FINIQUITO_DESGLOSADO',estado:'APLICADO',importe_bruto:num(f.aguinaldo),exento:num(f.exento_ag),fecha_pago:f.periodo});
  for(const p of pap)if(num(p.aguinaldo)!=null)ev.push({id:p.id,operacion:baja(p.fecha_baja),origen:'FINIQUITO_DESGLOSADO',estado:'VALIDADO',importe_bruto:num(p.aguinaldo),exento:num(p.exento_ag),fecha_pago:p.fecha_pago||p.fecha_baja});
  for(const f of fins)if(num(f.aguinaldo)==null)ev.push({id:f.id,operacion:baja(f.periodo),origen:'FINIQUITO_GLOBAL',estado:'APLICADO',importe_bruto:num(f.monto_aplicado)||0,exento:null,fecha_pago:f.periodo});
  // Una baja real del ejercicio (tramos sin recortar: hasta = fecha de baja) sin
  // finiquito ni papeles no permite saber qué se pagó.
  for(const t of tramos||[])if(t.hasta&&delAnio(t.hasta)&&!ev.some(e=>e.operacion===baja(t.hasta)))
   ev.push({id:'baja-'+t.hasta,operacion:baja(t.hasta),origen:'BAJA_SIN_EVIDENCIA',estado:'PENDIENTE',importe_bruto:0,exento:null,fecha_pago:t.hasta});
  return ev;
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
  const o=extra||{},{tramos,avisos}=A().tramosServicio(w,eventosDe(w,x.movimientos));
  const sel=A().seleccionar(tramos,{modo:p.modo,desde:p.desde,hasta:p.hasta,estatus:p.estatus,fecha_estatus:p.fecha_estatus});
  const aus=ausenciasDe(x),dest=destinoDe(w,p.fecha_destino),av=[...avisos,...aus.avisos,...(o.avisos||[])];
  if(!(dest.semana>=1&&dest.semana<=53))av.push({codigo:'DESTINO_INVALIDO',bloquea:true,texto:'La fecha de la nómina destino no cae en una semana válida de su centro.'});
  const baja=!A().activoEnFecha(tramos,dest.hasta)||String(w.estatus||'').toUpperCase()!=='ACTIVO';
  if(baja)av.push({codigo:'BAJA_FINIQUITO',bloquea:true,texto:'No está activo en la nómina destino: su saldo se paga y concilia en el finiquito (flujo de bajas), no en la nómina ordinaria.'});
  else if((w.fecha_reingreso||w.fecha_alta||'')>dest.hasta)av.push({codigo:'INGRESO_PROGRAMADO',bloquea:true,texto:'Ingreso programado posterior a la nómina destino.'});
  const fila=A().calcularFila({ejercicio:p.ejercicio,salario_base:Number(w.sd),dias_pactados:p.dias_pactados,respaldo_pactado:p.respaldo_pactado,
   corte:p.corte,hoy:o.hoy||today(),tramos,avisos:av,opciones:{bajaInclusiva:p.baja_inclusiva},politica:{computa:{ENFERMEDAD_GENERAL:p.eg_computa}},
   ausencias:{digitales:aus.digitales,rangos:aus.rangos,historicas:aus.historicas},cobertura:o.cobertura||null,exigir_cobertura:p.exigir_cobertura,
   evidencias:evidenciasDe(x,tramos,p.ejercicio),fecha_pago:dest.fecha_pago,
   metodo_isr:p.metodo_isr,ingreso_mensual_ordinario:r2(Number(w.sd)*30.4),tarifa_mensual:ISR_M,calcularIsr96:isr96De(w,dest)});
  const aplicadas=(x.aplicaciones||[]).filter(a=>a.estado==='APLICADO');
  let motivo=null;
  const bloqueos=fila.observaciones.filter(o=>o.bloquea),soloBaja=bloqueos.length>0&&bloqueos.every(o=>o.codigo==='BAJA_FINIQUITO');
  if(!sel.incluido)motivo='EXCLUIDO_POR_FILTRO';
  else if(fila.estado==='SIN_SALDO'||soloBaja&&!(fila.saldo>0))motivo=fila.conciliacion&&(fila.conciliacion.acreditado+fila.conciliacion.reservado)>0?'YA_APLICADO':'SIN_SALDO';
  else if(bloqueos.some(x=>x.codigo==='BAJA_FINIQUITO'))motivo='BAJA_FINIQUITO';
  return {w,x,sel,dest,fila,motivo,aplicadas,identidad:x.identidad,huella:x.huella_fuentes};
 }
 async function calcular(){
  // En el paso 1 se leen los campos; desde los demás pasos se recalcula con los parámetros vigentes.
  const p=leerParametros($('agc-ejercicio')?leerCrudo():S.p),t=++S.turno;
  S.p=p;S.calculado=false;S.paso=1;S.lotes=new Map();pintar();aviso('Consultando personal y fuentes del ejercicio…');
  try{
   const lista=await universo(p);if(!activo(t))return;
   if(!lista.length)throw Error('Ningún trabajador coincide con la razón social, centro y filtros elegidos.');
   const ctx=await contexto(lista.map(w=>w.id),p.ejercicio,t);if(!ctx||!activo(t))return;
   const porId=new Map(ctx.personas.map(x=>[x.trabajador_id,x])),identidades=new Map();
   for(const x of ctx.personas)identidades.set(x.identidad,(identidades.get(x.identidad)||0)+1);
   const filas=[];
   for(const w of lista){
    const x=porId.get(w.id);if(!x)continue;
    const av=identidades.get(x.identidad)>1?[{codigo:'IDENTIDAD_DUPLICADA',bloquea:true,texto:'La misma CURP tiene otro expediente en esta razón social: verifica sus tramos y aplica sobre un solo expediente (art. 41 LFT, sin duplicar el derecho).'}]:[];
    filas.push(calcularPersona(w,x,p,{avisos:av,cobertura:coberturaDe(ctx.coberturas.find(c=>c.obra_id===w.obra_id))}));
   }
   filas.sort((a,b)=>(Number(a.w.no_trab)||9e9)-(Number(b.w.no_trab)||9e9));
   S.filas=filas.filter(f=>f.motivo===null||f.motivo==='BAJA_FINIQUITO'&&f.sel.incluido);
   S.fuera=filas.filter(f=>!S.filas.includes(f));
   S.sel=new Set(S.filas.map((f,i)=>f.fila.estado==='LISTA'?i:-1).filter(i=>i>=0));
   S.salud=ctx.salud;S.calculado=true;pintar();
  }catch(e){if(activo(t)){S.paso=0;pintar();toast(e.message,'err');}}
 }

 /* ---------- Paso 2: personal y cálculo ---------- */
 const sumar=(fs,fn)=>r2(fs.reduce((s,f)=>s+(Number(fn(f))||0),0));
 function totales(fs){
  return {n:fs.length,causado:sumar(fs,f=>f.fila.bruto_causado),acreditado:sumar(fs,f=>f.fila.conciliacion?f.fila.conciliacion.acreditado+f.fila.conciliacion.reservado:0),
   pagar:sumar(fs,f=>f.fila.bruto_a_pagar),exento:sumar(fs,f=>f.fila.fiscal?.exento),gravado:sumar(fs,f=>f.fila.fiscal?.gravado),isr:sumar(fs,f=>f.fila.fiscal?.isr),neto:sumar(fs,f=>f.fila.fiscal?.neto)};
 }
 function antiguedad(w){
  const ini=String(w.fecha_reingreso&&(!w.fecha_baja||w.fecha_reingreso>w.fecha_baja)?w.fecha_reingreso:w.fecha_alta||'').slice(0,10);
  if(!ini)return '—';const d=A().util.dias(ini,today())-1;return d<0?'programado':d>=365?(d/365).toFixed(1)+' años':d+' días';
 }
 function seleccionadas(){return [...S.sel].map(i=>S.filas[i]).filter(f=>f&&f.fila.estado==='LISTA');}
 function vistaPersonal(){
  const fs=S.filas,t=totales(seleccionadas()),obra=id=>OBRAS.find(o=>o.id===id)?.nombre||'—';
  const filas=fs.map((f,i)=>{
   const d=f.fila.derecho||{},c=f.fila.conciliacion||{},x=f.fila.fiscal||{},bloq=f.fila.observaciones.filter(o=>o.bloquea),av=f.fila.observaciones.filter(o=>!o.bloquea);
   const inicio=d.tramos?.length?d.tramos[d.tramos.length-1].desde:f.w.fecha_reingreso||f.w.fecha_alta;
   return `<tr class="${bloq.length?'agc-bloqueada':''}">
    <td><input type="checkbox" style="width:auto" data-agc-sel="${i}" ${S.sel.has(i)?'checked':''} ${f.fila.estado==='LISTA'?'':'disabled'} aria-label="Seleccionar #${esc(f.w.no_trab)}"></td>
    <td>#${esc(f.w.no_trab??'—')} <b>${esc(fullName(f.w))}</b><div class="fhint">${esc(periodoPago(f.w))}${f.sel.programado?' · programado':''}</div></td>
    <td>${esc(obra(f.w.obra_id))}</td><td>${fmtD(inicio)}${d.tramos?.length>1?`<div class="fhint">${d.tramos.length} tramos</div>`:''}</td><td>${antiguedad(f.w)}</td>
    <td>${d.dias_vinculo??'—'}${d.dias_proyectados?`<div class="fhint">${d.dias_proyectados} proyectados</div>`:''}</td><td>${d.faltas_afectan??'—'}</td><td>${d.dias_computables??'—'}</td>
    <td>$${money(f.w.sd)}</td><td>${S.p.dias_pactados}</td><td>$${money(d.bruto)}</td><td>$${money(r2((c.acreditado||0)+(c.reservado||0)))}</td><td><b>$${money(f.fila.bruto_a_pagar)}</b></td>
    <td>${x.exento!=null?'$'+money(x.exento):'—'}</td><td>${x.gravado!=null?'$'+money(x.gravado):'—'}</td><td>${x.isr!=null?'$'+money(x.isr):'—'}</td><td>${x.neto!=null?'<b>$'+money(x.neto)+'</b>':'—'}</td>
    <td>${bloq.map(o=>`<div style="color:var(--red);font-size:11px">⛔ ${esc(o.texto)}</div>`).join('')}${av.map(o=>`<div style="color:var(--amber);font-size:11px">⚠ ${esc(o.texto)}</div>`).join('')||(bloq.length?'':'<span class="badge ACTIVO">Lista</span>')}</td>
    <td><button type="button" class="btn" data-agc-acc="desglose" data-i="${i}">Desglose</button></td></tr>`;
  });
  const grupos=Object.keys(MOTIVOS).map(k=>[k,S.fuera.filter(f=>f.motivo===k).concat(k==='DATOS_PENDIENTES'?S.filas.filter(f=>f.fila.estado==='BLOQUEADA'&&f.motivo!=='BAJA_FINIQUITO'):k==='BAJA_FINIQUITO'?S.filas.filter(f=>f.motivo==='BAJA_FINIQUITO'):[])]).filter(([,xs])=>xs.length);
  return [`<div class="stats">
    <div class="stat g"><div class="n">${t.n}</div><div class="l">Seleccionados de ${fs.filter(f=>f.fila.estado==='LISTA').length} listos · ${fs.length} en la corrida</div></div>
    <div class="stat b"><div class="n">$${money(t.pagar)}</div><div class="l">Bruto a pagar · causado $${money(t.causado)} · acreditado $${money(t.acreditado)}</div></div>
    <div class="stat a"><div class="n">$${money(t.isr)}</div><div class="l">ISR · exento $${money(t.exento)} · gravado $${money(t.gravado)}</div></div>
    <div class="stat g"><div class="n">$${money(t.neto)}</div><div class="l">Neto de los seleccionados</div></div></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button type="button" class="btn" data-agc-acc="sel-todo">Seleccionar listos</button><button type="button" class="btn" data-agc-acc="sel-ninguno">Quitar selección</button><button type="button" class="btn" data-agc-acc="calcular">↻ Recalcular</button></div>
   ${ctrlTabla(['','Trabajador','Centro','Ingreso / reingreso','Antigüedad','Días vínculo','Faltas que afectan','Días computables','Salario base','Días pactados','Bruto causado','Pagado acreditado','Saldo a pagar','Exento','Gravado','ISR','Neto','Observaciones',''],filas,'Nadie queda en esta corrida con los filtros elegidos.')}
   <div class="sect" style="margin-top:14px">Fuera de esta corrida / saldo pendiente</div>
   ${grupos.length?grupos.map(([k,xs])=>`<details style="margin:6px 0"><summary><b>${esc(MOTIVOS[k])}</b> · ${xs.length}${k!=='EXCLUIDO_POR_FILTRO'?' · saldo $'+money(sumar(xs,f=>f.fila.saldo)):''}</summary>
     <ul style="margin:6px 0 0 18px;font-size:12px">${xs.slice(0,300).map(f=>`<li>#${esc(f.w.no_trab??'—')} ${esc(fullName(f.w))} — ${esc(f.motivo==='EXCLUIDO_POR_FILTRO'?f.sel.detalle:(f.fila.observaciones.filter(o=>o.bloquea).map(o=>o.texto).join(' ')||'Saldo $'+money(f.fila.saldo)))}</li>`).join('')}</ul></details>`).join(''):'<p class="fhint">Todos los trabajadores del universo filtrado están en la corrida.</p>'}`,
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
   <p>Días de vínculo ${d.dias_vinculo} − faltas que afectan ${d.faltas_afectan} (digitales ${d.faltas_digitales}, históricas ${d.faltas_historicas}) = ${d.dias_computables} computables.</p>
   ${lst(d.ausencias.detalle,a=>`<li>${esc(a.fuente)} · ${a.fecha?fmtD(a.fecha):fmtD(a.desde)+' a '+fmtD(a.hasta)} · ${esc(A().NATURALEZAS[a.naturaleza]?.etiqueta||a.naturaleza||'Falta')}${a.complemento!=null?` · total acreditado ${a.total_acreditado}, digitales ${a.digitales}, complemento ${a.complemento}`:` · ${a.dias} día(s)`}${a.consumido_por?' · incluida en el total al corte':''}</li>`)}
   ${d.ausencias.pendientes.length?`<p style="color:var(--red)">Pendientes:</p>${lst(d.ausencias.pendientes,a=>`<li>${esc(a.fuente)} · ${esc(a.motivo)} · ${a.dias||1} día(s)</li>`)}`:''}`:'<p>No se pudo calcular el derecho.</p>'}
   <div class="sect">Pagos anteriores</div>
   ${c?`<p>Causado $${money(c.causado)} − acreditado $${money(c.acreditado)} − reservado en borradores $${money(c.reservado)} = saldo <b>$${money(c.saldo)}</b>${c.excedente?` · pagado de más $${money(c.excedente)}`:''}</p>
   ${lst(c.detalle,e=>`<li>${esc(e.origen)} · ${esc(e.estado||'')} · $${money(e.importe_bruto)} · ${esc(e.clase)}${e.exento!=null?' · exento $'+money(e.exento):''}${e.duplicados?.length?' · '+e.duplicados.length+' evidencia(s) de la misma operación no se suman':''}</li>`)}`:''}
   <div class="sect">Fiscal · pago ${fmtD(f.dest.fecha_pago)} (${esc(f.dest.periodicidad.toLowerCase())} ${fmtD(f.dest.desde)}–${fmtD(f.dest.hasta)})</div>
   ${x?`<p>UMA $${money(x.uma)} (${esc(x.uma_fuente)}) · tope 30 UMA $${money(x.tope)} · ya usado en el año $${money(x.exento_usado)} · disponible $${money(x.disponible)}<br>
   Exento $${money(x.exento)} · gravado $${money(x.gravado)} (LISR art. 93 fr. XIV)</p>
   ${isr?isr.metodo==='ART174'?`<p>Art. 174 RLISR: I. $${money(isr.gravado)} ÷ 365 × 30.4 = $${money(isr.mensualizado)}; II. ISR de $${money(isr.ingreso_mensual_ordinario+isr.mensualizado)} = $${money(isr.isr_con)}; III. ISR del ordinario $${money(isr.isr_sin)}; diferencia $${money(isr.diferencia)}; V. tasa ${(isr.tasa*100).toFixed(4)}%; IV. ISR = $${money(isr.isr)}.</p>`
     :`<p>Art. 96 LISR (incremental): ISR con aguinaldo $${money(isr.isr_con_aguinaldo)} − ISR ordinario $${money(isr.isr_ordinario)} = <b>$${money(isr.isr)}</b>. Efecto en subsidio: $${money(isr.efecto_subsidio)} (se muestra una sola vez; ya está dentro del ISR incremental).</p>`:''}
   <p>Neto del aguinaldo: <b>$${money(x.neto)}</b>. El ajuste anual (art. 97 LISR) es un proceso aparte.</p>`:'<p class="fhint">Sin fiscal: revisa las observaciones.</p>'}
   <div class="sect">Observaciones</div>${lst(f.fila.observaciones,o=>`<li style="color:${o.bloquea?'var(--red)':'var(--amber)'}">${o.bloquea?'⛔':'⚠'} ${esc(o.texto)}</li>`)}
   <p class="fhint">Reglas ${esc(A().VERSION)} · motor ${esc(MOTOR_NOMINA_VERSION)} · huella de fuentes ${esc(String(f.huella||'').slice(0,12))}</p></div>
   <div class="m-foot"><button class="btn" onclick="closeModal2()">Cerrar</button></div>`,'lg');
 }

 /* ---------- Paso 3: conciliación ---------- */
 function vistaConciliacion(){
  const fs=S.filas.filter(f=>f.fila.conciliacion);
  const filas=fs.map(f=>{const c=f.fila.conciliacion;return `<tr><td>#${esc(f.w.no_trab??'—')} ${esc(fullName(f.w))}</td><td>$${money(c.causado)}</td><td>$${money(c.acreditado)}</td><td>$${money(c.reservado)}</td>
   <td>${c.pendiente.length?`<span style="color:var(--red)">${c.pendiente.length} sin desglose</span>`:'—'}</td><td><b>$${money(c.saldo)}</b>${c.excedente?`<div style="color:var(--amber);font-size:11px">Pagado de más $${money(c.excedente)}</div>`:''}</td>
   <td>${c.exento_desconocido?'<span style="color:var(--red)">Desconocido</span>':'$'+money(c.exento_usado)}</td>
   <td style="font-size:11px">${c.detalle.map(e=>`${esc(e.origen.replace(/_/g,' ').toLowerCase())} · ${esc(String(e.estado||'').toLowerCase())} · $${money(e.importe_bruto)} → ${esc(e.clase.toLowerCase())}`).join('<br>')||'Sin pagos anteriores'}</td></tr>`;});
  return [`<p class="fhint">Acreditado: finiquito desglosado o papeles validados, y aplicaciones en nómina autorizada, timbrada o pagada. Reservado: aplicaciones en un borrador (cuentan para no pagar dos veces). Un CFDI y su pago son la misma operación. Un finiquito global, una baja sin papeles o un documento sin desglose dejan el saldo como evidencia pendiente.</p>
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
  const lotes=lotesDe(seleccionadas()),puede=puedeEditarTrabajador(),pendientes=lotes.filter(l=>!/^(Aplicado|Ya estaba)/.test(S.lotes.get(l.clave)||''));
  const filas=lotes.map(l=>{const t=totales(l.filas),st=S.lotes.get(l.clave);return `<tr><td>${esc(OBRAS.find(o=>o.id===l.obra_id)?.nombre||'—')}</td><td>${esc(l.periodicidad)}</td><td>S${l.semana} · ${fmtD(l.desde)}–${fmtD(l.hasta)}</td><td>${fmtD(l.fecha_pago)}</td>
   <td>${t.n}</td><td>$${money(t.pagar)}</td><td>$${money(t.isr)}</td><td>$${money(t.neto)}</td><td>${st?esc(st):'Por aplicar'}</td></tr>`;});
  const h=S.historial;
  const hist=(h||[]).map(l=>{const w=S.filas.concat(S.fuera).find(f=>f.w.id===l.trabajador_id)?.w||WORKERS.find(x=>x.id===l.trabajador_id);
   const retirable=puede&&l.estado==='APLICADO'&&!PROTEGIDOS.includes(l.estado_destino);
   return `<tr><td>${fmtD(String(l.created_at||'').slice(0,10))}</td><td>${w?'#'+esc(w.no_trab??'—')+' '+esc(fullName(w)):esc(String(l.trabajador_id).slice(0,8))}</td><td>${esc(l.periodicidad)} · ${fmtD(l.periodo_desde)}–${fmtD(l.periodo_hasta)}</td>
    <td>$${money(l.bruto)}</td><td>$${money(l.isr)}</td><td>$${money(l.neto)}</td><td>${esc(l.estado==='APLICADO'?'Aplicado a '+String(l.estado_destino||'').toLowerCase().replace('sin_cierre','borrador sin cierre'):'Retirado')}</td>
    <td>${retirable?`<button type="button" class="btn" data-agc-acc="retirar" data-id="${esc(l.id)}" data-version="${esc(l.version)}">Retirar</button>`:l.estado==='APLICADO'&&PROTEGIDOS.includes(l.estado_destino)?'<span class="fhint">Corrección por ajuste autorizado</span>':''}</td></tr>`;});
  return [`<p class="fhint">Cada centro y periodicidad es un lote independiente; dentro de un lote se aplica todo o nada. Las bajas no entran: su saldo va al finiquito. Una nómina autorizada, timbrada o pagada no recibe aplicaciones; su corrección va por el flujo autorizado de ajuste.</p>
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
  const d=f.fila.derecho,c=f.fila.conciliacion,x=f.fila.fiscal,aplicado=r2(f.aplicadas.reduce((s,a)=>s+Number(a.bruto),0));
  return {trabajador_id:f.w.id,huella_fuentes:f.huella,semana:f.dest.semana,periodicidad:f.dest.periodicidad,periodo_desde:f.dest.desde,periodo_hasta:f.dest.hasta,fecha_pago:f.dest.fecha_pago,
   salario_base:d.salario_base,dias_pactados:d.dias_pactados,dias_computables:d.dias_computables,denominador:d.denominador,bruto_causado:d.bruto,
   acreditado_externo:r2(Math.max(0,c.acreditado+c.reservado-aplicado)),bruto:f.fila.bruto_a_pagar,exento_usado:x.exento_usado,exento:x.exento,gravado:x.gravado,
   metodo_isr:x.isr_detalle.metodo,isr:x.isr,
   desglose:{reglas:A().VERSION,derecho:{tramos:d.tramos,dias_vinculo:d.dias_vinculo,dias_confirmados:d.dias_confirmados,dias_proyectados:d.dias_proyectados,faltas_digitales:d.faltas_digitales,
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
  if(!puedeEditarTrabajador())throw Error('Tu usuario sólo puede consultar.');
  // Un lote ya aplicado en esta simulación no se reenvía: hay que recalcular para ver el saldo nuevo.
  const lotes=lotesDe(seleccionadas()).filter(l=>!/^(Aplicado|Ya estaba)/.test(S.lotes.get(l.clave)||'')),t=S.turno;
  if(!lotes.length)throw Error('No hay lotes pendientes en esta simulación. Recalcula para ver los saldos actualizados.');
  const cerrados=await protegidos(lotes);if(!activo(t))return;
  if(cerrados.length)throw Error(`La nómina destino ya está autorizada, timbrada o pagada en ${cerrados.map(l=>(OBRAS.find(o=>o.id===l.obra_id)?.nombre||'')+' '+l.periodicidad.toLowerCase()).join(', ')}. Elige otra fecha de nómina destino.`);
  const resumen=lotes.map(l=>{const x=totales(l.filas);return `• ${OBRAS.find(o=>o.id===l.obra_id)?.nombre||''} · ${l.periodicidad.toLowerCase()} ${fmtD(l.desde)}–${fmtD(l.hasta)} (pago ${fmtD(l.fecha_pago)}): ${x.n} persona(s), bruto $${money(x.pagar)}, ISR $${money(x.isr)}, neto $${money(x.neto)}`;}).join('\n');
  if(!confirm(`Aplicar aguinaldo ${S.p.ejercicio} a la nómina abierta:\n\n${resumen}\n\nSe agrega como percepción (bruto, exento, gravado e ISR), no como descuento negativo. Mientras la nómina sea editable podrás retirarlo. ¿Continuar?`))return;
  S.aplicando=true;pintar();
  const conflictos=new Map();let ok=0;
  try{
   for(const l of lotes){
    if(!activo(t))return;
    const lineas=l.filas.map(lineaDe),firma=A().canonico(lineas);
    // Reintento con el mismo identificador sólo si las líneas no cambiaron.
    const previa=S.lotes.get(l.clave+':op');const operacion_id=previa&&previa.firma===firma?previa.id:crypto.randomUUID();
    S.lotes.set(l.clave+':op',{id:operacion_id,firma});
    const {data,error}=await sb.rpc('control_aguinaldo',{p_accion:'APLICAR',p_datos:{operacion_id,empresa_codigo:S.empresa,ejercicio:S.p.ejercicio,reglas_version:A().VERSION,motor_version:MOTOR_NOMINA_VERSION,
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
  const fs=seleccionadas();if(!fs.length)throw Error('Selecciona personas listas para exportar.');
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

 /* ---------- Eventos ---------- */
 async function clic(e){
  const paso=e.target.closest('[data-agc-paso]');
  if(paso&&!paso.disabled){S.paso=Number(paso.dataset.agcPaso);pintar();return;}
  const b=e.target.closest('[data-agc-acc]');if(!b||b.disabled)return;
  const acc=b.dataset.agcAcc;
  if(acc==='calcular')return calcular();
  if(acc==='ir'){S.paso=Number(b.dataset.paso);pintar();if(S.paso===3&&!S.historial)historial().catch(x=>toast(x.message,'err'));return;}
  if(acc==='sel-todo'){S.sel=new Set(S.filas.map((f,i)=>f.fila.estado==='LISTA'?i:-1).filter(i=>i>=0));return pintar();}
  if(acc==='sel-ninguno'){S.sel=new Set();return pintar();}
  if(acc==='desglose')return desglose(Number(b.dataset.i));
  if(acc==='excel')return excel();
  if(acc==='aplicar')return aplicar();
  if(acc==='historial')return historial();
  if(acc==='retirar')return retirar(b.dataset.id,b.dataset.version);
 }
 function cambio(e){
  const s=e.target.closest('[data-agc-sel]');
  if(s){const i=Number(s.dataset.agcSel);if(s.checked)S.sel.add(i);else S.sel.delete(i);pintar();return;}
  if(e.target.id==='agc-estatus'&&$('agc-fecha_estatus')){$('agc-fecha_estatus').disabled=e.target.value==='ACTIVOS_HOY';if(e.target.value==='ACTIVOS_HOY')$('agc-fecha_estatus').value=today();}
  // El centro cambia las cuadrillas y la fecha destino su periodo: se repinta conservando lo capturado.
  if(e.target.id==='agc-centro'||e.target.id==='agc-fecha_destino'){S.p={...leerCrudo(),...(e.target.id==='agc-centro'?{cuadrilla:''}:{})};pintar();}
 }
 // Lectura común de fuentes: la ficha (faltas históricas) y el finiquito usan las mismas reglas.
 window.PLATINUM_AGUINALDO_UI=Object.freeze({abrir,fuentes:Object.freeze({eventosDe,ausenciasDe,evidenciasDe,coberturaDe,cantidadFaltas}),_pruebas:{calcularPersona,evidenciasDe,ausenciasDe,cantidadFaltas,destinoDe,coberturaDe,lotesDe,lineaDe,estado:()=>S}});
})();
