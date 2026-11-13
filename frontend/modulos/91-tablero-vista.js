/* =====================================================================
   77 · TABLERO EJECUTIVO — CAPA DE PRESENTACIÓN (vista)
   Sólo PINTA un `estado` y EMITE `acciones`: no lee red, Supabase ni
   almacenamiento. Los datos los entrega 92-tablero-ejecutivo.js con las
   formas de 90-tablero-modelo.js / RPC control_tablero (RESUMEN,
   TENDENCIA, COMPARATIVOS, EXCEPCIONES, DETALLE, PLANTILLA, CATALOGOS).
   Ver docs/TABLERO_DISENO.md y docs/MODELO_INDICADORES.md.
   Orden de lectura: filtros → alcance aplicado → vistas → 6 a 8
   indicadores → tendencia y comparaciones → excepciones → detalle.
   Accesibilidad: todo por teclado, orden de foco lógico, cada gráfica con
   tabla alternativa, ningún estado depende sólo del color, anuncios en
   una región aria-live persistente y estilos de impresión limpios.
   ===================================================================== */
(function(G){
 'use strict';
 if(!G)return;
 const VERSION='2026-11-11.2';
 const escLocal=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const E=s=>(typeof esc==='function'?esc:escLocal)(s);
 const num=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
 const arr=v=>Array.isArray(v)?v:[];
 const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};

 /* ---------------- Formatos (mismos nombres y unidades que el Excel) ----------------
    Porcentajes en escala 0–100, igual que el modelo y el RPC: 94.4 → «94.4%». */
 const nf=(n,d)=>Number(n).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});
 const CONTEOS=['PERSONAS','CONTEO','EVENTOS','OPERACIONES','CHEQUES'];
 const F={
  mxn(v){const n=num(v);if(n===null)return '—';const r=Math.round(n*100)/100;return (r<0?'-$':'$')+nf(Math.abs(r),2);},
  mxnFirmado(v){const n=num(v);if(n===null)return '—';const r=Math.round(n*100)/100;return (r>0?'+$':r<0?'-$':'$')+nf(Math.abs(r),2);},
  mxnCompacto(v){const n=num(v);if(n===null)return '—';const a=Math.abs(n),s=n<0?'-$':'$';
   if(a>=1e6)return s+nf(a/1e6,a>=1e7?1:2)+' M';if(a>=1e4)return s+nf(a/1e3,0)+' mil';if(a>=1e3)return s+nf(a/1e3,1)+' mil';return s+nf(a,0);},
  pct(v,d=1){const n=num(v);return n===null?'—':nf(n,d)+'%';},
  pctFirmado(v,d=1){const n=num(v);if(n===null)return '—';return (n>0?'+':n<0?'-':'')+nf(Math.abs(n),d)+'%';},
  pp(v,d=1){const n=num(v);if(n===null)return '—';return (n>0?'+':n<0?'-':'')+nf(Math.abs(n),d)+' pp';},
  razon(v,d=1){const n=num(v);return n===null?'—':F.pct(n*100,d);},
  entero(v){const n=num(v);return n===null?'—':nf(Math.round(n),0);},
  enteroFirmado(v){const n=num(v);if(n===null)return '—';return (n>0?'+':n<0?'-':'')+nf(Math.abs(Math.round(n)),0);},
  fecha(v){if(!v)return '—';const m=String(v).match(/^(\d{4})-(\d\d)-(\d\d)/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v);},
  fechaCorta(v){const m=String(v||'').match(/^\d{4}-(\d\d)-(\d\d)/);return m?`${m[2]}/${m[1]}`:'—';},
  rango(d,h){if(!d&&!h)return '—';return `${F.fecha(d)} – ${F.fecha(h)}`;},
  fechaHora(v){if(!v)return '—';const d=new Date(v);if(isNaN(d))return String(v);
   try{return new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(',','');}
   catch(e){return d.toISOString().slice(0,16).replace('T',' ');}},
  valor(v,unidad){if(unidad==='PORCENTAJE')return F.pct(v);if(CONTEOS.includes(unidad))return F.entero(v);if(unidad==='DIAS')return num(v)===null?'—':F.entero(v)+' días';return F.mxn(v);},
  variacion(v,unidad){if(unidad==='PORCENTAJE')return F.pp(v);if(CONTEOS.includes(unidad)||unidad==='DIAS')return F.enteroFirmado(v);return F.mxnFirmado(v);},
  compacto(v,unidad){return unidad==='PORCENTAJE'?F.pct(v,0):CONTEOS.includes(unidad)?F.entero(v):F.mxnCompacto(v);}
 };
 const UNIDADES={MXN:'MXN',PORCENTAJE:'%',PERSONAS:'personas',CONTEO:'conteo',EVENTOS:'eventos',OPERACIONES:'operaciones',CHEQUES:'cheques',DIAS:'días',MIXTA:'varias'};
 /* Fechas ISO sin zona (calendario interno por centro). */
 const fechaOK=s=>/^\d{4}-\d\d-\d\d/.test(String(s||''));
 const dUTC=s=>new Date(String(s).slice(0,10)+'T12:00:00Z');
 const sumarDias=(s,n)=>{const d=dUTC(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const lunesDe=s=>sumarDias(s,-((dUTC(s).getUTCDay()+6)%7));

 /* ---------------- Catálogo de medidas (claves del contrato §5 y del modelo 76) ----------------
    Las definiciones y fórmulas del RESUMEN (o de PLATINUM_TABLERO_MODELO.DEFINICIONES)
    tienen prioridad sobre estos textos de respaldo. `sentido`: dirección
    favorable (MAYOR, MENOR, NEUTRO). `estado`: estado textual de negocio. */
 const MEDIDAS={
  neto_conciliado:{etiqueta:'Neto conciliado',unidad:'MXN',sentido:'NEUTRO',definicion:'Importe exigible autorizado: obligaciones vigentes de la versión autorizada de cada cierre (NOI conciliado), por trabajador y concepto, cuyo periodo interno se paga en el rango.',formula:'Σ importe de obligaciones vigentes (cierre no cancelado, versión sellada, fecha de pago programada en el rango)'},
  pagado_registrado:{etiqueta:'Pagado registrado',unidad:'MXN',sentido:'NEUTRO',definicion:'Periodo de nómina: pago registrado aplicable al exigible del rango (conciliado más pendiente de conciliación, sin exceder cada obligación). Fecha efectiva de pago: total de operaciones reales con fecha en el rango, una vez por operación.',formula:'PERIODO: pagado conciliado + pendiente de conciliación · PAGO: además excedentes y pagos sin asignar'},
  pagado_conciliado:{etiqueta:'Pagado conciliado',unidad:'MXN',sentido:'MAYOR',definicion:'Importe con comprobante válido (transferencia exitosa o cheque expedido o entregado) aplicado a la obligación, hasta el importe exigible. También se le llama «pago aplicado».',formula:'Σ por obligación de min(aplicaciones vigentes de comprobantes válidos, importe)'},
  saldo_por_cubrir:{etiqueta:'Saldo por cubrir',unidad:'MXN',sentido:'MENOR',definicion:'Exigible que todavía no tiene pago registrado.',formula:'Σ max(importe − aplicado − efectivo autorizado − pendiente por vincular, 0)',estado:v=>v>0?['atencion','Con saldo por cubrir']:['ok','Sin saldo por cubrir']},
  excedentes:{etiqueta:'Excedentes',unidad:'MXN',sentido:'MENOR',definicion:'Pagos por encima del exigible de la misma obligación o de la misma persona y semana. Nunca compensan saldos de otra persona.',formula:'Σ (aplicado − importe)⁺ por obligación + remanentes sin saldo de su persona-semana',estado:v=>v>0?['atencion','Excedentes por revisar']:['ok','Sin excedentes']},
  sin_asignar:{etiqueta:'Pago sin asignar',unidad:'MXN',sentido:'MENOR',definicion:'Operaciones registradas sin obligación exigible (sin cierre autorizado, sin trabajador u obligación archivada).',formula:'Σ remanente de operaciones sin obligación + aplicaciones a obligaciones archivadas',estado:v=>v>0?['atencion','Pagos por asignar']:['ok','Sin pagos por asignar']},
  cobertura:{etiqueta:'Cobertura de pago',unidad:'PORCENTAJE',sentido:'MAYOR',formulaVisible:true,definicion:'Porcentaje del exigible cubierto con pago conciliado. Si el exigible es cero el denominador está vacío y se muestra «No disponible».',formula:'pagado conciliado ÷ neto conciliado × 100',estado:v=>v>=100?['ok','Cubierto al 100%']:['atencion','Cobertura parcial']},
  pendiente_conciliacion:{etiqueta:'Pendiente de conciliación',unidad:'MXN',sentido:'MENOR',definicion:'Pago registrado del alcance que todavía no está conciliado, con importe y número de operaciones por motivo.',formula:'Σ por vincular + aplicaciones sobre operaciones anuladas o revertidas + efectivo autorizado sin comprobante',estado:v=>v>0?['atencion','Operaciones por conciliar']:['ok','Todo conciliado']},
  variacion:{etiqueta:'Variación',unidad:'MIXTA',sentido:'NEUTRO',definicion:'Diferencia de la misma medida contra el periodo comparable equivalente (anterior o mismo periodo del año anterior), absoluta y porcentual; incompleta si alguno de los dos periodos no está completo o sigue en curso.',formula:'absoluta = actual − comparable; % = absoluta ÷ |comparable| × 100'},
  trabajadores_con_pago:{etiqueta:'Trabajadores con pago',unidad:'PERSONAS',sentido:'NEUTRO',definicion:'Personas únicas con pago registrado en el alcance (una persona cuenta una vez aunque tenga varios pagos o centros).',formula:'conteo distinto de trabajadores con pagado registrado > 0'},
  promedio_pagado_trabajador:{etiqueta:'Promedio pagado por trabajador',unidad:'MXN',sentido:'NEUTRO',definicion:'Pago registrado atribuible a personas entre las personas con pago.',formula:'Σ pagado registrado con trabajador ÷ trabajadores con pago'},
  mediana_pagado_trabajador:{etiqueta:'Mediana pagada por trabajador',unidad:'MXN',sentido:'NEUTRO',definicion:'Valor central del pago registrado por persona; no lo distorsionan pagos extraordinarios.',formula:'mediana(Σ pagado registrado por persona)'},
  saldo_por_antiguedad:{etiqueta:'Saldo por antigüedad',unidad:'MXN',sentido:'MENOR',definicion:'Saldo por cubrir por días transcurridos desde la fecha de pago programada: por vencer, 0–7, 8–14, 15–30, 31–60 y más de 60 días.',formula:'hoy − fecha de pago programada, por tramo'},
  cheques_por_estado:{etiqueta:'Cheques por estado',unidad:'CHEQUES',sentido:'NEUTRO',definicion:'Cheques del alcance por estatus real (no eliminados). PENDIENTE no es pago y CANCELADO no cuenta; el cobro bancario no se registra en la plataforma.',formula:'conteo e importe por estatus'},
  trabajadores_pago_parcial:{etiqueta:'Trabajadores con pago parcial',unidad:'PERSONAS',sentido:'MENOR',definicion:'Personas con alguna obligación con pago registrado mayor que cero y menor que el importe.',formula:'conteo distinto de trabajadores con 0 < pagado registrado < importe',estado:v=>v>0?['atencion','Con pagos parciales']:['ok','Sin pagos parciales']},
  concentracion_contratista:{etiqueta:'Concentración por contratista',unidad:'PORCENTAJE',sentido:'NEUTRO',definicion:'Participación del contratista con mayor exigible, según la adscripción histórica.',formula:'máx(neto por contratista) ÷ neto conciliado × 100'},
  percepciones_retenciones:{etiqueta:'Percepciones y retenciones',unidad:'MXN',sentido:'NEUTRO',definicion:'Percepciones y deducciones del reporte NOI importado del periodo.',formula:'Σ percepciones; deducciones = ISR + IMSS + otras'},
  bruto:{etiqueta:'Bruto',unidad:'MXN',sentido:'NEUTRO',definicion:'Percepciones brutas según el reporte NOI importado.',formula:'Σ percepciones del reporte NOI'},
  costo_patronal:{etiqueta:'Costo patronal',unidad:'MXN',sentido:'NEUTRO',definicion:'Cuotas IMSS, INFONAVIT e ISN. Sólo se muestra con una base de cálculo explícita; si no hay fuente aparece «No disponible».',formula:'No disponible sin base de cálculo'},
  respaldo_fiscal:{etiqueta:'Respaldo fiscal (neto timbrado)',unidad:'MXN',sentido:'NEUTRO',definicion:'Neto timbrado (CFDI) por UUID único asociado a las obligaciones; el PDF y el XML del mismo UUID cuentan una vez.',formula:'Σ neto CFDI por UUID no contradictorio'},
  plantilla_actual:{etiqueta:'Plantilla actual',unidad:'PERSONAS',sentido:'NEUTRO',definicion:'Padrón actual: personas activas no eliminadas a la fecha de corte; no depende del rango.',formula:'conteo de trabajadores ACTIVO no eliminados'},
  altas:{etiqueta:'Altas',unidad:'EVENTOS',sentido:'NEUTRO',definicion:'Altas efectivas con fecha en el rango.',formula:'conteo distinto de (trabajador, fecha de alta)'},
  bajas:{etiqueta:'Bajas',unidad:'EVENTOS',sentido:'NEUTRO',definicion:'Bajas efectivas con fecha en el rango; cuenta cada episodio.',formula:'conteo distinto de (trabajador, fecha de baja)'},
  reingresos:{etiqueta:'Reingresos',unidad:'EVENTOS',sentido:'NEUTRO',definicion:'Reingresos efectivos con fecha en el rango; una persona puede tener varios.',formula:'conteo distinto de (trabajador, fecha de reingreso)'},
  rotacion:{etiqueta:'Rotación',unidad:'PORCENTAJE',sentido:'MENOR',formulaVisible:true,definicion:'Bajas del rango entre la plantilla promedio (activos al inicio y al cierre). Si la plantilla promedio es cero se muestra «No disponible».',formula:'bajas ÷ ((activos al inicio + activos al cierre) ÷ 2) × 100'}
 };
 const CALIDAD={
  COMPLETO:{etiqueta:'Completo',nivel:'ok',texto:'Fuentes leídas y periodos autorizados.'},
  CERO_CONFIRMADO:{etiqueta:'Cero confirmado',nivel:'ok',texto:'Hay cierres autorizados y el resultado es cero.'},
  SIN_REGISTROS:{etiqueta:'Sin registros',nivel:'info',texto:'La fuente no tiene registros para este centro y rango; no equivale a un cero confirmado.'},
  INCOMPLETO:{etiqueta:'Incompleto',nivel:'atencion',texto:'Hay periodos sin cierre, cierres reabiertos o pagos por vincular; las cifras pueden cambiar.'},
  ERROR_LECTURA:{etiqueta:'Error de lectura',nivel:'critico',texto:'No se pudo leer la fuente; las cifras de este centro no se incluyen.'}
 };
 const ICONO={ok:'✓',info:'i',atencion:'!',critico:'✕',neutro:'•'};
 const NIVEL_TEXTO={ok:'correcto',info:'informativo',atencion:'requiere atención',critico:'crítico',neutro:'neutral'};
 const PERSPECTIVAS={
  PERIODO:{etiqueta:'Periodo de nómina',corta:'por periodo de nómina',texto:'Toma las obligaciones cuyo periodo de nómina se paga dentro del rango; lo pagado es lo aplicado a esas obligaciones, sin importar la fecha en que se pagó.'},
  PAGO:{etiqueta:'Fecha efectiva de pago',corta:'por fecha efectiva de pago',texto:'Toma las operaciones (transferencias, cheques y efectivo autorizado) con fecha efectiva dentro del rango, aunque correspondan a nóminas anteriores.'}
 };
 /* `tipo_periodo` del modelo (ACTUAL, MES, EJERCICIO, ACUMULADO, PERSONALIZADO)
    más HISTORICO y QUINCENA, que resuelve el integrador (A5) a desde/hasta. */
 const PRESETS=[['HISTORICO','Acumulado histórico'],['ACUMULADO','Ejercicio a la fecha'],['EJERCICIO','Ejercicio completo'],['MES','Mes actual'],['ACTUAL','Semana actual'],['QUINCENA','Quincena actual'],['PERSONALIZADO','Personalizado']];
 const COMPARAR=[['ANTERIOR','Periodo anterior equivalente'],['ANIO_ANTERIOR','Mismo periodo del año anterior'],['NINGUNO','Sin comparación']];
 const MOTIVOS_COMPARABLE={RANGO_FUTURO:'el rango está en el futuro',PERIODO_EN_CURSO:'el periodo sigue en curso y se compara sólo el tramo transcurrido',COMPARABLE_ANTES_DEL_CALENDARIO:'el periodo comparable empieza antes del calendario de algún centro',CALIDAD_ACTUAL_INCOMPLETA:'el periodo actual tiene fuentes incompletas',CALIDAD_COMPARABLE_INCOMPLETA:'el periodo comparable tiene fuentes incompletas'};
 const FILTROS_MULTI=[['obras','Centros de trabajo'],['contratistas','Contratista'],['cuadrillas','Cuadrilla'],['periodicidades','Periodicidad'],['periodos','Semana o quincena'],['conceptos','Concepto'],['medios','Medio de pago']];
 const FILTROS_MAS=['contratistas','cuadrillas','periodicidades','periodos','conceptos','medios'];
 const ETQ_FILTRO=Object.fromEntries(FILTROS_MULTI);
 const FUENTES={catalogos:'Catálogos de filtros',resumen:'Indicadores',tendencia:'Tendencia',comparativos:'Comparativos',excepciones:'Excepciones',detalle:'Detalle',plantilla:'Plantilla'};
 const ADSCRIPCION_PENDIENTE='Adscripción histórica pendiente',PENDIENTE_CLAVE='__PENDIENTE__',SIN_CUADRILLA_CLAVE='__SIN_CUADRILLA__';
 const PERIODICIDADES={SEMANAL:'Semanal',QUINCENAL:'Quincenal',SEMANA_DE_PAGO:'Semana de pago'};
 const MEDIOS={TRANSFERENCIA:'Transferencia',CHEQUE:'Cheque','POR DEFINIR':'Por definir',POR_DEFINIR:'Por definir',EFECTIVO:'Efectivo',SIN_MEDIO:'Sin medio',SIN_OBLIGACION:'Pagos sin obligación'};
 const CONCEPTOS={NOMINA:'Nómina',FINIQUITO:'Finiquito',PREVISION_SOCIAL:'Previsión social',SIN_CONCEPTO:'Sin concepto'};
 const CHEQUES=[['PENDIENTE','Pendiente'],['EXPEDIDO','Expedido'],['ENTREGADO','Entregado'],['CANCELADO','Cancelado']];
 const TRAMOS=[['por_vencer','Por vencer'],['0_7','0–7 días'],['8_14','8–14 días'],['15_30','15–30 días'],['31_60','31–60 días'],['mas_60','Más de 60 días']];
 const MOTIVOS_PENDIENTE={POR_VINCULAR:'Por vincular a su obligación',OPERACION_ANULADA:'Aplicada sobre una operación revertida o cancelada',EFECTIVO_SIN_COMPROBANTE:'Efectivo autorizado sin comprobante'};
 const ESTADO_PAGO={CONCILIADO:'Conciliado',REGISTRADO_POR_CONCILIAR:'Registrado, por conciliar',PARCIAL:'Pago parcial',SIN_PAGO:'Sin pago',EXCEDENTE:'Excedente',SIN_OBLIGACION:'Sin obligación',NO_EXIGIBLE:'No exigible'};
 const SITUACION={EXITOSA:'Exitosa',REVERTIDA:'Revertida',ANULADO:'Anulado',EXPEDIDO:'Expedido',ENTREGADO:'Entregado',PENDIENTE:'Pendiente',CANCELADO:'Cancelado',DECLARADO:'Declarado'};
 const MOVIMIENTOS={ALTA:'Alta',BAJA:'Baja',REINGRESO:'Reingreso'};
 const ORIGENES={FICHA:'Ficha del trabajador',HISTORIAL:'Bitácora de movimientos'};
 const TIPOS_EXCEPCION={SIN_PAGO:'Sin pago',PAGO_PARCIAL:'Pago parcial',EXCEDENTE_APLICADO:'Excedente aplicado',CIERRE_PROVISIONAL:'Cierre provisional',ADSCRIPCION_PENDIENTE,
  DIFERENCIA_FISCAL:'Diferencia fiscal',CFDI_CONTRADICTORIO:'CFDI contradictorio',POR_VINCULAR:'Por vincular',EXCEDENTE_NO_APLICADO:'Excedente no aplicado',SIN_ASIGNAR:'Pago sin asignar',
  OPERACION_ANULADA:'Operación anulada',EFECTIVO_SIN_COMPROBANTE:'Efectivo sin comprobante',POSIBLE_DUPLICADO:'Posible duplicado',DEVOLUCION_O_REVERSO:'Devolución o reverso',
  REPRESENTACIONES_UNIFICADAS:'Representaciones unificadas',CHEQUE_POR_ENTREGAR:'Cheque por entregar',OPERACION_SOBREAPLICADA:'Operación sobreaplicada',TRANSFERENCIA_RECHAZADA:'Transferencia rechazada',
  TRANSFERENCIA_PENDIENTE_BANCO:'Transferencia pendiente de banco',CHEQUE_SIN_EXPEDIR:'Cheque sin expedir',CHEQUE_CANCELADO_SIN_REPONER:'Cheque cancelado sin reponer',
  DECLARADO_SIN_COMPROBANTE:'Declarado sin comprobante',APLICACION_RETIRADA:'Aplicación retirada',PERIODO_SIN_CIERRE:'Periodo sin cierre'};
 const SEVERIDAD={ROJO:'critico',AMBAR:'atencion',INFO:'info',CRITICO:'critico',ATENCION:'atencion'};
 const SEVERIDAD_TXT={critico:'Crítica',atencion:'Atención',info:'Informativa'};
 /* Identidad fija de cada medida en todas las gráficas: la referencia total
    (neto o pagado registrado) va en tinta, conciliado en aqua, pendiente en
    azul y saldo en naranja. Paleta validada para daltonismo en claro y oscuro. */
 const SERIES={
  neto_conciliado:{etiqueta:'Neto conciliado',corta:'Neto',color:'--tb-ref',marca:'circulo'},
  pagado_registrado:{etiqueta:'Pagado registrado',corta:'Registrado',color:'--tb-ref',marca:'circulo'},
  pagado_conciliado:{etiqueta:'Pagado conciliado (aplicado)',corta:'Conciliado',color:'--tb-s3',marca:'cuadro'},
  pendiente_conciliacion:{etiqueta:'Pendiente de conciliación',corta:'Pendiente',color:'--tb-s1',marca:'triangulo'},
  saldo_por_cubrir:{etiqueta:'Saldo por cubrir',corta:'Saldo',color:'--tb-s2',marca:'rombo'},
  altas:{etiqueta:'Altas',corta:'Altas',color:'--tb-s3',marca:'cuadro'},
  bajas:{etiqueta:'Bajas',corta:'Bajas',color:'--tb-s2',marca:'rombo'},
  reingresos:{etiqueta:'Reingresos',corta:'Reingresos',color:'--tb-s1',marca:'triangulo'}
 };
 const VISTAS=[
  {clave:'GENERAL',etiqueta:'General',descripcion:'Lo exigible, lo pagado y lo pendiente del alcance.',
   kpis:['neto_conciliado','pagado_conciliado','saldo_por_cubrir','cobertura','pendiente_conciliacion','excedentes','pagado_registrado','trabajadores_con_pago'],
   graficas:['tendencia','por_centro','por_medio','saldo_antiguedad'],tablas:['excepciones','detalle']},
  {clave:'NOMINA_PAGOS',etiqueta:'Nómina y pagos',descripcion:'Importes de nómina, personas pagadas y medios de pago.',
   kpis:['neto_conciliado','pagado_registrado','trabajadores_con_pago','promedio_pagado_trabajador','mediana_pagado_trabajador','trabajadores_pago_parcial','concentracion_contratista','bruto'],
   graficas:['tendencia','por_contratista','por_medio','cheques_estado'],tablas:['excepciones','detalle']},
  {clave:'CONCILIACION',etiqueta:'Conciliación',descripcion:'Operaciones por aplicar, saldos vencidos y excepciones.',
   kpis:['pagado_registrado','pagado_conciliado','pendiente_conciliacion','sin_asignar','saldo_por_cubrir','excedentes','cobertura','trabajadores_pago_parcial'],
   graficas:['tendencia','pendiente_motivo','saldo_antiguedad','cheques_estado'],tablas:['excepciones','detalle']},
  {clave:'PLANTILLA',etiqueta:'Plantilla y cumplimiento',descripcion:'Padrón, movimientos y calidad de las fuentes por centro.',
   kpis:['plantilla_actual','altas','bajas','reingresos','rotacion','trabajadores_con_pago'],
   graficas:['plantilla_tendencia','plantilla_centro'],tablas:['calidad','detalle']}
 ];
 const vistaDe=v=>VISTAS.find(x=>x.clave===v)||VISTAS[0];

 /* ---------------- Normalización tolerante del estado ---------------- */
 const modeloDef=clave=>{try{const M=G.PLATINUM_TABLERO_MODELO;const d=M&&(M.DEFINICIONES||M.MEDIDAS);const x=d&&d[clave];
  if(Array.isArray(x))return {definicion:x[0]||'',formula:x[1]||'',grano:x[2]||''};return obj(x);}catch(e){return {};}};
 const filtros=estado=>estado.filtros||{};
 const comparable=estado=>(estado.resumen&&estado.resumen.comparable)||null;
 const hoyDe=estado=>estado.hoy||(estado.resumen&&estado.resumen.hoy)||null;
 function medidaCruda(estado,clave){
  const busca=m=>{if(!m)return undefined;if(Array.isArray(m)){const x=m.find(y=>y&&y.clave===clave);return x===undefined?undefined:x;}return Object.prototype.hasOwnProperty.call(m,clave)?m[clave]:undefined;};
  const a=busca(estado.resumen&&estado.resumen.medidas);if(a!==undefined)return a;
  return busca(estado.plantilla&&estado.plantilla.medidas);
 }
 /* Acepta la medida del modelo {clave,valor,unidad,definicion,formula,provisional,
    disponible,motivo_no_disponible,perspectiva_aplicada,desglose,comparable,variacion}
    o un número suelto. */
 function medida(estado,clave){
  const cat=MEDIDAS[clave]||{etiqueta:clave,unidad:'MXN',sentido:'NEUTRO',definicion:'',formula:''},mod=modeloDef(clave),res=estado.resumen||{};
  let raw=medidaCruda(estado,clave);const existe=raw!==undefined;
  if(raw===null||typeof raw!=='object')raw={valor:raw};
  const des=obj(raw.desglose);
  const valor=raw.disponible===false?null:num(raw.valor!==undefined?raw.valor:raw.importe!==undefined?raw.importe:raw.total);
  const vr=raw.variacion||(res.variacion&&res.variacion[clave])||null,cmp=obj(raw.comparable),cg=comparable(estado)||{};
  return {clave,existe,etiqueta:raw.etiqueta||cat.etiqueta,unidad:raw.unidad||cat.unidad,sentido:raw.sentido||cat.sentido,valor,
   definicion:raw.definicion||mod.definicion||cat.definicion,formula:raw.formula||mod.formula||cat.formula,formulaVisible:!!cat.formulaVisible,
   calculo:des.formula_visible||null,provisional:!!raw.provisional,provDefinido:raw.provisional!==undefined,calidad:raw.calidad||null,estado:raw.estado||null,
   motivo:raw.motivo_no_disponible||raw.motivo||null,perspectiva:raw.perspectiva_aplicada||null,
   operaciones:num(raw.operaciones!==undefined?raw.operaciones:des.operaciones),alcance:raw.etiqueta_alcance||(typeof des.etiqueta==='string'?des.etiqueta:null),
   desglose:raw.desglose!==undefined?raw.desglose:(raw.por_motivo||null),
   variacion:vr&&typeof vr==='object'?{absoluta:num(vr.absoluta),porcentaje:num(vr.porcentaje),incompleto:!!(vr.incompleto||cmp.incompleto),desde:vr.desde||cmp.desde||cg.desde,hasta:vr.hasta||cmp.hasta||cg.hasta}:null,
   catEstado:cat.estado||null};
 }
 const opcion=o=>{if(o===null||o===undefined)return null;if(typeof o!=='object')return {valor:String(o),etiqueta:String(o)};
  const valor=o.valor??o.id??o.clave??o.codigo??o.nombre;
  return {valor:String(valor??''),etiqueta:String(o.etiqueta??o.nombre??o.descripcion??valor??''),grupo:o.grupo??null,empresa:o.empresa??null,
   sub:o.sub??(o.desde||o.hasta?F.rango(o.desde,o.hasta):o.fecha_inicio?'Calendario desde '+F.fecha(o.fecha_inicio):null)};};
 const ETQ_VALOR={conceptos:CONCEPTOS,medios:MEDIOS,periodicidades:PERIODICIDADES};
 const etiquetaValor=(clave,v)=>{const s=String(v);if(ETQ_VALOR[clave]&&ETQ_VALOR[clave][s])return ETQ_VALOR[clave][s];if(clave==='periodos'&&/^\d+$/.test(s))return 'Semana '+s;
  if(s===PENDIENTE_CLAVE)return ADSCRIPCION_PENDIENTE;if(s===SIN_CUADRILLA_CLAVE)return 'Sin cuadrilla';return s;};
 const opcionesCrudas=(estado,clave)=>arr(estado.catalogos&&estado.catalogos[clave]).map(opcion).filter(Boolean).map(o=>o.etiqueta===o.valor?{...o,etiqueta:etiquetaValor(clave,o.valor)}:o);
 function opciones(estado,clave){
  const ops=opcionesCrudas(estado,clave),emp=filtros(estado).empresa;
  return clave==='obras'&&emp?ops.filter(o=>!o.empresa||String(o.empresa).toUpperCase()===String(emp).toUpperCase()):ops;
 }
 const etiquetaDe=(estado,clave,valor)=>{const o=opcionesCrudas(estado,clave).find(x=>x.valor===String(valor));return o?o.etiqueta:etiquetaValor(clave,valor);};
 const comparar=f=>{const c=f.comparar;if(c===true||c==='PERIODO_ANTERIOR')return 'ANTERIOR';if(!c||c==='NINGUNO')return 'NINGUNO';return String(c).toUpperCase();};
 const tipoPeriodo=f=>String(f.tipo_periodo||f.preset||'PERSONALIZADO').toUpperCase();
 const errorDe=(estado,fuente)=>{const e=estado.errores&&estado.errores[fuente];if(!e)return null;return typeof e==='string'?e:(e.mensaje||e.message||'Error al leer la fuente.');};
 const cargando=(estado,fuente)=>estado.cargando===true||!!(estado.cargando&&typeof estado.cargando==='object'&&estado.cargando[fuente]);
 const algoCargando=estado=>estado.cargando===true||!!(estado.cargando&&typeof estado.cargando==='object'&&Object.values(estado.cargando).some(Boolean));
 const listaCalidad=estado=>{const c=(estado.resumen&&estado.resumen.calidad)||(estado.plantilla&&estado.plantilla.calidad);
  if(!c)return [];if(Array.isArray(c))return c;if(Array.isArray(c.por_centro))return c.por_centro;return Object.entries(c).map(([k,v])=>typeof v==='string'?{obra_id:k,obra:k,estado:v}:{obra_id:k,...v});};
 const actualizado=estado=>estado.actualizado_en||(estado.resumen&&estado.resumen.actualizado_en)||null;
 const desactualizado=estado=>{if(estado.desactualizado===true)return true;const a=actualizado(estado),ahora=estado.ahora,min=num(estado.vigencia_minutos);
  if(!a||!ahora||min===null)return false;const d=(new Date(ahora)-new Date(a))/60000;return Number.isFinite(d)&&d>min;};
 const obraNombre=(estado,id)=>{const o=opcionesCrudas(estado,'obras').find(x=>x.valor===String(id));return o?o.etiqueta:null;};
 /* Llave de una fila: ids propios o los de `llaves` (excepciones del modelo). */
 const campo=(f,k)=>f[k]??(f.llaves&&f.llaves[k])??null;
 const claveFila=f=>String(f.clave??f.obligacion_id??f.operacion_id??(f.tipo?[f.tipo,...Object.values(obj(f.llaves)).filter(v=>v!=null),f.obra_id,f.semana,f.trabajador_id,f.fecha].filter(v=>v!=null&&v!=='').join(':'):'')??'');

 /* ---------------- Piezas reutilizables ---------------- */
 function insignia(nivel,texto){return `<span class="tb-estado tb-estado--${E(nivel)}"><span class="tb-ico" aria-hidden="true">${ICONO[nivel]||'•'}</span><span>${E(texto)}</span></span>`;}
 function insigniaCalidad(est){const c=CALIDAD[est]||{etiqueta:est||'Sin dato',nivel:'info'};return insignia(c.nivel,c.etiqueta);}
 function esqueleto(tipo,n){
  const fila='<div class="tb-skel"></div>';
  if(tipo==='kpis')return `<div class="tb-kpis" aria-hidden="true">${Array.from({length:n||8},()=>`<div class="tb-kpi tb-kpi--carga"><div class="tb-skel tb-skel--c"></div><div class="tb-skel tb-skel--g"></div><div class="tb-skel"></div></div>`).join('')}</div>`;
  if(tipo==='tabla')return `<div class="tb-esq-tabla" aria-hidden="true">${Array.from({length:n||6},()=>fila).join('')}</div>`;
  return `<div class="tb-esq-graf" aria-hidden="true"><div class="tb-skel tb-skel--g"></div>${fila}${fila}${fila}</div>`;
 }
 function bloqueError(fuente,msg){
  const nom=FUENTES[fuente]||fuente;
  return `<div class="tb-error" data-fuente-error="${E(fuente)}"><p><span class="tb-ico" aria-hidden="true">✕</span><span><strong>No se pudo leer: ${E(nom)}.</strong> ${E(msg)}</span></p><button type="button" class="btn" data-accion="reintentar" data-fuente="${E(fuente)}" data-foco="reintentar-${E(fuente)}">Reintentar ${E(nom.toLowerCase())}</button></div>`;
 }
 function bloqueVacio(titulo,texto,conRestablecer){
  return `<div class="tb-vacio"><p class="tb-vacio-t">${E(titulo)}</p><p>${E(texto)}</p>${conRestablecer?'<button type="button" class="btn" data-accion="restablecer" data-foco="vacio-restablecer">Restablecer filtros</button>':''}</div>`;
 }
 /* Envuelve el contenido de una fuente: error visible con «Reintentar»,
    esqueleto en la carga inicial o el marco anterior atenuado al refrescar. */
 function conFuente(estado,fuente,tieneDatos,contenido,tipoEsq,n){
  const err=errorDe(estado,fuente);
  if(err)return bloqueError(fuente,err)+(tieneDatos?`<div class="tb-viejo"><p class="tb-mut">Se muestran los últimos datos leídos.</p>${contenido()}</div>`:'');
  if(cargando(estado,fuente)&&!tieneDatos)return `<div class="tb-cargando" aria-busy="true"><p class="tb-sr">Cargando ${E((FUENTES[fuente]||fuente).toLowerCase())}…</p>${esqueleto(tipoEsq,n)}</div>`;
  if(cargando(estado,fuente))return `<div class="tb-refrescando" aria-busy="true">${contenido()}</div>`;
  return contenido();
 }

 /* ---------------- Tablas ---------------- */
 const celdaTipo={MXN:F.mxn,PCT:F.pct,PORCENTAJE:F.pct,ENTERO:F.entero,PERSONAS:F.entero,CONTEO:F.entero,EVENTOS:F.entero,OPERACIONES:F.entero,CHEQUES:F.entero,FECHA:F.fecha};
 const esNum=t=>['MXN','PCT','PORCENTAJE','ENTERO','PERSONAS','CONTEO','EVENTOS','OPERACIONES','CHEQUES'].includes(t);
 function tablaHtml(o){
  const cols=o.columnas,filas=arr(o.filas);
  const cls=c=>{const k=[esNum(c.tipo)?'tb-num':'',c.clase||''].filter(Boolean).join(' ');return k?` class="${k}"`:'';};
  const cab=cols.map(c=>`<th scope="col"${cls(c)}>${E(c.etiqueta)}</th>`).join('');
  const cuerpo=filas.map((f,i)=>`<tr${o.claseFila&&o.claseFila(f)?` class="${E(o.claseFila(f))}"`:''}>${cols.map((c,j)=>{
   const v=c.valor?c.valor(f):f[c.clave];
   const html=c.html?c.html(f,i):E(c.tipo&&celdaTipo[c.tipo]?celdaTipo[c.tipo](v):(v===null||v===undefined||v===''?'—':v));
   const tag=j===0&&o.encabezadoFila!==false?'th':'td';
   return `<${tag}${tag==='th'?' scope="row"':''}${cls(c)}>${html}</${tag}>`;}).join('')}</tr>`).join('');
  const pie=Array.isArray(o.pie)?`<tfoot><tr>${cols.map((c,j)=>{const v=o.pie[j];return `<${j===0?'th scope="row"':'td'}${cls(c)}>${v===undefined||v===null?'':E(j>0&&c.tipo&&celdaTipo[c.tipo]?celdaTipo[c.tipo](v):v)}</${j===0?'th':'td'}>`;}).join('')}</tr></tfoot>`:'';
  return `<div class="tb-tabla-env${o.ancha?' tb-tabla-env--ancha':''}"><table class="tb-tabla"><caption>${E(o.caption)}${o.captionExtra?` <span class="tb-mut">${E(o.captionExtra)}</span>`:''}</caption><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody>${pie}</table></div>`;
 }
 function paginacion(fuente,datos,nombre){
  const n=arr(datos.filas).length,total=num(datos.total)??n,pag=Math.max(1,num(datos.pagina)||1),por=Math.max(1,num(datos.por_pagina)||n||50);
  const paginas=Math.max(1,Math.ceil(total/por)),ini=total?(pag-1)*por+1:0,fin=Math.min(total,(pag-1)*por+n);
  const b=(p,t,dis,k)=>`<button type="button" class="btn tb-pag-btn" data-accion="pagina" data-fuente="${E(fuente)}" data-pagina="${p}" data-foco="pag-${E(fuente)}-${k}"${dis?' aria-disabled="true"':''}>${t}</button>`;
  return `<nav class="tb-pag tb-no-imprimir" aria-label="Paginación de ${E(nombre)}">${b(1,'« Primera',pag<=1,'ini')}${b(pag-1,'‹ Anterior',pag<=1,'ant')}<span class="tb-pag-txt">Página ${F.entero(pag)} de ${F.entero(paginas)} · filas ${F.entero(ini)}–${F.entero(fin)} de ${F.entero(total)}</span>${b(pag+1,'Siguiente ›',pag>=paginas,'sig')}${b(paginas,'Última »',pag>=paginas,'fin')}</nav>`;
 }
 /* Botones para abrir trabajador, obligación, cierre, pago y evidencia autorizada. */
 function enlacesFila(fuente,f,i,sinDetalle){
  const quien=f.nombre||f.trabajador||'';
  const b=(acc,id,t)=>id!=null&&id!==''?`<button type="button" class="tb-enlace" data-accion="${acc}" data-id="${E(id)}" data-fuente="${E(fuente)}" data-i="${i}" aria-label="${E(t+(quien?': '+quien:' de la fila '+(i+1)))}">${E(t)}</button>`:'';
  const obls=arr(f.obligaciones),ob=campo(f,'obligacion_id')??(obls.length===1?obls[0]:null);
  const pago=campo(f,'pago_id')??arr(f.pago_ids)[0]??campo(f,'cheque_id'),ev=campo(f,'evidencia_id');
  const evid=ev?(f.evidencia_autorizada===false?'<span class="tb-mut">Evidencia restringida</span>':b('evidencia',ev,'Evidencia')):'';
  return `<div class="tb-enlaces">${sinDetalle?'':`<button type="button" class="tb-enlace tb-enlace--pri" data-accion="detalle" data-clave="${E(claveFila(f))}" data-origen="${E(fuente)}" data-fuente="${E(fuente)}" data-i="${i}" data-foco="${E(fuente)}-fila-${i}" aria-label="${E('Abrir detalle de la fila '+(i+1)+(quien?' · '+quien:''))}">Detalle</button>`}${b('trabajador',campo(f,'trabajador_id'),'Trabajador')}${b('obligacion',ob,'Obligación')}${b('cierre',campo(f,'cierre_id'),'Cierre')}${b('pago',pago,'Pago')}${evid}</div>`;
 }
 const esPendiente=v=>v===ADSCRIPCION_PENDIENTE||v===PENDIENTE_CLAVE;
 const cuadrillaPendiente=f=>f.cuadrilla_pendiente===true||f.adscripcion==='PENDIENTE'||esPendiente(f.cuadrilla);
 const contratistaPendiente=f=>f.fuente_adscripcion==='PENDIENTE'||esPendiente(f.contratista);
 const marcaPendiente=()=>`<span class="tb-pend">${E(ADSCRIPCION_PENDIENTE)}</span>`;
 const cuadrillaTexto=f=>cuadrillaPendiente(f)?marcaPendiente():E(f.cuadrilla??'—');
 const contratistaTexto=f=>contratistaPendiente(f)?marcaPendiente():E(f.contratista??'—');
 const trabajadorTexto=f=>{const n=f.numero??f.no_trab;const nom=f.nombre??f.trabajador;return nom||n!=null?`${n!=null?`<span class="tb-mut">${E(n)}</span> `:''}${E(nom??'')}`:'—';};
 const periodoTexto=f=>{
  const p=f.periodo_etiqueta??f.periodo??(f.semana!=null?'Semana '+f.semana:null),d=f.periodo_desde||f.desde,h=f.periodo_hasta||f.hasta,per=PERIODICIDADES[f.periodicidad]||'';
  return `${E(p??'—')}${per?` <span class="tb-mut">· ${E(per)}</span>`:''}${d?`<span class="tb-sub">${E(F.rango(d,h))}</span>`:''}${f.fecha_pago&&d?`<span class="tb-sub">Pago ${E(F.fecha(f.fecha_pago))}</span>`:''}${f.provisional?' <span class="tb-insignia tb-insignia--prov">Provisional</span>':''}`;
 };
 const COLS_DETALLE={
  OBLIGACION:[{etiqueta:'Centro',valor:f=>f.obra??f.obra_nombre},{etiqueta:'Periodo',html:periodoTexto},{etiqueta:'Trabajador',html:trabajadorTexto},
   {etiqueta:'Contratista',html:contratistaTexto},{etiqueta:'Cuadrilla',html:cuadrillaTexto},{etiqueta:'Concepto',valor:f=>CONCEPTOS[f.concepto]||f.concepto},
   {etiqueta:'Medio',valor:f=>MEDIOS[f.metodo??f.medio]||f.metodo||f.medio},{etiqueta:'Neto conciliado',tipo:'MXN',valor:f=>f.neto_conciliado??f.importe},
   {etiqueta:'Pagado conciliado',tipo:'MXN',valor:f=>f.pagado_conciliado},{etiqueta:'Saldo por cubrir',tipo:'MXN',valor:f=>f.saldo_por_cubrir??f.saldo},
   {etiqueta:'Estado',valor:f=>ESTADO_PAGO[f.estado_pago]||f.estado_texto||f.estado_pago||f.estado}],
  OPERACION:[{etiqueta:'Fecha efectiva',tipo:'FECHA',valor:f=>f.fecha_efectiva??f.fecha_pago??f.fecha},{etiqueta:'Centro',valor:f=>f.obra??f.obra_nombre},{etiqueta:'Medio',valor:f=>MEDIOS[f.medio]||f.medio},
   {etiqueta:'Situación',valor:f=>SITUACION[f.situacion]||f.situacion},{etiqueta:'Trabajador',html:trabajadorTexto},{etiqueta:'Importe',tipo:'MXN',valor:f=>f.importe},
   {etiqueta:'Conciliado',tipo:'MXN',valor:f=>f.conciliado??f.pagado_conciliado},{etiqueta:'Pendiente de conciliación',tipo:'MXN',valor:f=>f.pendiente_conciliacion},
   {etiqueta:'Excedente',tipo:'MXN',valor:f=>f.excedente},{etiqueta:'Sin asignar',tipo:'MXN',valor:f=>f.sin_asignar},{etiqueta:'Representaciones',tipo:'ENTERO',valor:f=>f.representaciones}],
  MOVIMIENTO:[{etiqueta:'Fecha efectiva',tipo:'FECHA',valor:f=>f.fecha_efectiva??f.fecha},{etiqueta:'Centro',valor:f=>f.obra??f.obra_nombre??f.obra_id},{etiqueta:'Trabajador',html:trabajadorTexto},
   {etiqueta:'Movimiento',valor:f=>MOVIMIENTOS[f.tipo]||f.movimiento||f.tipo},{etiqueta:'Origen',valor:f=>ORIGENES[f.origen]||f.origen}]
 };

 /* ---------------- Gráfica de líneas (SVG propio, accesible) ---------------- */
 function escala(min,max,n){
  if(min===max){max=min+(min===0?1:Math.abs(min));}
  const p0=(max-min)/(n||4),mag=Math.pow(10,Math.floor(Math.log10(p0))),f=p0/mag;
  const paso=(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*mag,a=Math.floor(min/paso)*paso,b=Math.ceil(max/paso)*paso,ticks=[];
  for(let v=a;v<=b+paso/2;v+=paso)ticks.push(Math.round(v*1e6)/1e6);
  return {min:a,max:b,ticks};
 }
 function marca(tipo,x,y,hueca,color){
  const st=hueca?`fill="var(--tb-sup)" stroke="var(${color})" stroke-width="2"`:`fill="var(${color})" stroke="var(--tb-sup)" stroke-width="2"`,X=v=>v.toFixed(1);
  if(tipo==='cuadro')return `<rect x="${X(x-4.5)}" y="${X(y-4.5)}" width="9" height="9" rx="1.5" ${st}/>`;
  if(tipo==='rombo')return `<path d="M${X(x)} ${X(y-6)}L${X(x+6)} ${X(y)}L${X(x)} ${X(y+6)}L${X(x-6)} ${X(y)}Z" ${st}/>`;
  if(tipo==='triangulo')return `<path d="M${X(x)} ${X(y-6)}L${X(x+6)} ${X(y+5)}L${X(x-6)} ${X(y+5)}Z" ${st}/>`;
  return `<circle cx="${X(x)}" cy="${X(y)}" r="4.5" ${st}/>`;
 }
 function leyenda(series,tipo){
  return `<ul class="tb-leyenda" aria-label="Leyenda">${series.map(s=>`<li>${tipo==='barra'?`<span class="tb-ley-caja" style="background:var(${s.color})" aria-hidden="true"></span>`:`<svg class="tb-ley-linea" viewBox="0 0 26 12" width="26" height="12" aria-hidden="true" focusable="false"><line x1="1" y1="6" x2="25" y2="6" stroke="var(${s.color})" stroke-width="2" stroke-linecap="round"/>${marca(s.marca,13,6,false,s.color)}</svg>`}<span>${E(s.etiqueta)}</span></li>`).join('')}</ul>`;
 }
 function svgLinea(r,gid,o){
  const {puntos,series,unidad}=o,W=Math.max(600,Math.min(1680,Math.round((r.ancho||800)-38))),H=290,ml=66,mr=118,mt=22,mb=48,iw=W-ml-mr,ih=H-mt-mb,n=puntos.length;
  const vals=[];puntos.forEach(p=>series.forEach(s=>{const v=num(p.valores[s.clave]);if(v!==null)vals.push(v);}));
  const es=escala(Math.min(0,...vals),Math.max(0,...vals),4);
  const x=i=>ml+(n===1?iw/2:i*iw/(n-1)),y=v=>mt+ih-(v-es.min)/((es.max-es.min)||1)*ih;
  let s='';
  const prov=puntos.map((p,i)=>p.provisional?i:-1).filter(i=>i>=0);
  if(prov.length){const a=prov[0],b=prov[prov.length-1],paso=n>1?iw/(n-1):iw,x0=Math.max(ml,x(a)-paso/2),x1=Math.min(ml+iw,x(b)+paso/2);
   s+=`<rect class="tb-banda-prov" x="${x0.toFixed(1)}" y="${mt}" width="${Math.max(2,x1-x0).toFixed(1)}" height="${ih}"/><text class="tb-eje-txt" x="${((x0+x1)/2).toFixed(1)}" y="${mt-7}" text-anchor="middle">Provisional</text>`;}
  es.ticks.forEach(t=>{const yy=y(t).toFixed(1);s+=`<line class="${t===0?'tb-base':'tb-rejilla'}" x1="${ml}" x2="${ml+iw}" y1="${yy}" y2="${yy}"/><text class="tb-eje-txt" x="${ml-8}" y="${(+yy+4).toFixed(1)}" text-anchor="end">${E(F.compacto(t,unidad))}</text>`;});
  const salto=Math.max(1,Math.ceil(n/Math.max(4,Math.floor(iw/90))));
  puntos.forEach((p,i)=>{if(i%salto&&i!==n-1)return;s+=`<text class="tb-eje-txt" x="${x(i).toFixed(1)}" y="${mt+ih+18}" text-anchor="middle">${E(p.etiqueta)}</text>`;if(p.sub)s+=`<text class="tb-eje-sub" x="${x(i).toFixed(1)}" y="${mt+ih+32}" text-anchor="middle">${E(p.sub)}</text>`;});
  const finales=[];
  series.forEach(se=>{
   let d='',abierto=false;
   puntos.forEach((p,i)=>{const v=num(p.valores[se.clave]);if(v===null){abierto=false;return;}d+=`${abierto?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;abierto=true;});
   if(d)s+=`<path class="tb-linea" d="${d}" stroke="var(${se.color})"/>`;
   puntos.forEach((p,i)=>{const v=num(p.valores[se.clave]);if(v!==null)s+=marca(se.marca,x(i),y(v),!!p.provisional,se.color);});
   for(let i=n-1;i>=0;i--){const v=num(puntos[i].valores[se.clave]);if(v!==null){finales.push({y:y(v),t:`${se.corta} ${F.compacto(v,unidad)}`});break;}}
  });
  finales.sort((a,b)=>a.y-b.y);for(let i=1;i<finales.length;i++)if(finales[i].y-finales[i-1].y<14)finales[i].y=finales[i-1].y+14;
  finales.forEach(f=>{s+=`<text class="tb-fin-txt" x="${ml+iw+10}" y="${(f.y+4).toFixed(1)}">${E(f.t)}</text>`;});
  s+=`<line class="tb-cruz" x1="0" x2="0" y1="${mt}" y2="${mt+ih}" visibility="hidden"/>`;
  r.graf[gid]={tipo:'linea',puntos,series,unidad,W,ml,iw,n,clave:o.clave};
  const id=E(r.pfx+'-'+gid);
  return `<div class="tb-lienzo" tabindex="0" role="group" data-graf="${E(gid)}" data-foco="lienzo-${E(gid)}" aria-label="${E(o.titulo+': recorra los periodos con las flechas izquierda y derecha; Enter abre el detalle del periodo. La tabla de datos tiene todos los valores.')}">
   <svg class="tb-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-st ${id}-sd" focusable="false" preserveAspectRatio="xMidYMid meet"><title id="${id}-st">${E(o.titulo)}</title><desc id="${id}-sd">${E(o.desc)}</desc>${s}</svg>
   <div class="tb-tip" aria-hidden="true" hidden></div></div>`;
 }
 function describirLinea(puntos,series,unidad){
  if(!puntos.length)return 'Sin periodos.';
  const a=puntos[0],b=puntos[puntos.length-1],txt=p=>p.titulo||p.etiqueta;
  const partes=series.map(s=>`${s.etiqueta}: ${F.valor(a.valores[s.clave],unidad)} a ${F.valor(b.valores[s.clave],unidad)}`);
  return `${puntos.length} periodos, de ${txt(a)}${a.desde?' ('+F.rango(a.desde,a.hasta)+')':''} a ${txt(b)}${b.desde?' ('+F.rango(b.desde,b.hasta)+')':''}. ${partes.join('; ')}.`+(puntos.some(p=>p.provisional)?' Los periodos marcados como provisionales siguen abiertos.':'');
 }

 /* ---------------- Barras horizontales en HTML (cada barra es un botón) ---------------- */
 function barrasHtml(r,gid,o){
  const filas=o.filas,segs=o.segmentos;
  const tot=f=>segs.reduce((s,g)=>s+Math.max(0,num(f.valores[g.clave])||0),0);
  const max=Math.max(0,...filas.map(o.escalaPor||tot))||1;
  return `<ol class="tb-barras">${filas.map((f,i)=>{
   const fuera=o.panorama&&f.seleccionado===false;
   const pista=segs.map(g=>{const v=Math.max(0,num(f.valores[g.clave])||0);if(!v)return '';const color=fuera?'--tb-gris':(o.colorFila?o.colorFila(f,i):g.color);return `<span class="tb-seg" style="width:${(v/max*100).toFixed(2)}%;background:var(${color})"></span>`;}).join('');
   const aria=`${f.etiqueta}${f.sub?' ('+f.sub+')':''}: ${o.textoAria(f)}${fuera?'. Fuera de la selección actual':''}. Abrir detalle.`;
   if(o.noNavegable&&o.noNavegable(f))return `<li><div class="tb-barra tb-barra--fija" role="group" aria-label="${E(f.etiqueta+': '+o.textoAria(f)+'. '+o.textoFija)}">
    <span class="tb-barra-et"><span class="tb-barra-nom">${E(f.etiqueta)}</span><span class="tb-sub">${E(o.textoFija)}</span></span>
    <span class="tb-barra-pista" aria-hidden="true">${pista||'<span class="tb-seg tb-seg--cero"></span>'}</span><span class="tb-barra-val">${o.textoValor(f)}</span></div></li>`;
   return `<li><button type="button" class="tb-barra${fuera?' tb-barra--fuera':''}" data-accion="detalle" data-clave="${E(o.medida)}" data-origen="grafica" data-dim="${E(o.dimension)}" data-valor="${E(f.clave)}" data-etq="${E(f.etiqueta)}" data-foco="${E(gid)}-b-${i}" aria-label="${E(aria)}">
    <span class="tb-barra-et"><span class="tb-barra-nom">${f.pendiente?marcaPendiente():E(f.etiqueta)}</span>${f.sub?`<span class="tb-sub">${E(f.sub)}</span>`:''}</span>
    <span class="tb-barra-pista" aria-hidden="true">${pista||'<span class="tb-seg tb-seg--cero"></span>'}</span>
    <span class="tb-barra-val">${o.textoValor(f)}${fuera?'<span class="tb-sub">Fuera de la selección</span>':''}</span></button></li>`;}).join('')}</ol>`;
 }

 /* ---------------- Figuras (gráfica + tabla alternativa) ---------------- */
 function figura(r,gid,o){
  const id=`${r.pfx}-${gid}`,abierta=r.ui.alts[gid]!==undefined?!!r.ui.alts[gid]:!!r.ui.modoTabla;
  return `<figure class="tb-graf${o.ancha?' tb-graf--ancha':''}" data-graf-id="${E(gid)}" aria-labelledby="${id}-t" aria-describedby="${id}-d">
   <figcaption class="tb-graf-cab"><h4 id="${id}-t" class="tb-graf-t">${E(o.titulo)}</h4>${o.panorama?'<span class="tb-insignia tb-insignia--pan">Panorama general</span>':''}
    <p id="${id}-d" class="tb-graf-desc">${E(o.descripcion)}</p></figcaption>
   ${o.cuerpo}
   ${o.tabla?`<div class="tb-alt"><button type="button" class="tb-link tb-no-imprimir" data-accion="alt" data-graf="${E(gid)}" aria-expanded="${abierta}" aria-controls="${id}-alt" data-foco="alt-${E(gid)}">${abierta?'Ocultar tabla de datos':'Ver tabla de datos'}</button><div id="${id}-alt" class="tb-alt-cuerpo"${abierta?'':' hidden'}>${o.tabla}</div></div>`:''}
  </figure>`;
 }
 const MEDIDAS_TEND=['neto_conciliado','pagado_registrado','pagado_conciliado','pendiente_conciliacion','saldo_por_cubrir'];
 /* TENDENCIA del modelo: filas por centro × periodicidad × periodo con fechas
    reales. La vista las consolida por semana calendario (lunes a domingo) de
    la fecha de pago programada —o del inicio del periodo en la perspectiva de
    pago—; sólo suma centavos ya calculados. Cada centro conserva sus fechas
    reales en la tabla alternativa. También acepta `serie` ya consolidada. */
 function puntosTendencia(estado){
  const t=estado.tendencia;if(!t)return {puntos:[],porCentro:[],consolidado:false};
  const serie=Array.isArray(t)?t:arr(t.serie),porCentro=Array.isArray(t)?[]:arr(t.filas||t.por_centro),hoy=hoyDe(estado);
  const val=(f,k)=>num(k==='pagado_conciliado'?(f.pagado_conciliado??f.pagado_aplicado):f[k]);
  if(serie.length)return {consolidado:false,porCentro,puntos:serie.map(p=>({clave:String(p.periodo??p.clave??p.etiqueta??''),etiqueta:String(p.etiqueta??p.periodo??''),titulo:p.titulo||null,
   desde:p.desde,hasta:p.hasta,sub:p.desde?F.fechaCorta(p.desde):null,provisional:!!p.provisional,valores:Object.fromEntries(MEDIDAS_TEND.map(k=>[k,val(p,k)]))}))};
  const m=new Map(),r2=v=>Math.round(v*100)/100;
  for(const f of porCentro){
   const ref=f.fecha_pago||f.periodo_desde||f.desde;if(!fechaOK(ref))continue;const l=lunesDe(ref);
   let p=m.get(l);if(!p){p={clave:l,etiqueta:F.fechaCorta(l),titulo:'Semana del '+F.fecha(l),desde:l,hasta:sumarDias(l,6),sub:null,provisional:false,valores:Object.fromEntries(MEDIDAS_TEND.map(k=>[k,null])),filas:0};m.set(l,p);}
   for(const k of MEDIDAS_TEND){const v=val(f,k);if(v!==null)p.valores[k]=r2((p.valores[k]||0)+v);}
   p.provisional=p.provisional||!!f.provisional;p.filas++;
  }
  const puntos=[...m.values()].sort((a,b)=>a.clave<b.clave?-1:1);
  if(hoy)puntos.forEach(p=>{if(p.hasta>=hoy)p.provisional=true;});
  return {puntos,porCentro,consolidado:true};
 }
 function seriesPerspectiva(estado){
  const pago=filtros(estado).perspectiva==='PAGO';
  return (pago?['pagado_registrado','pagado_conciliado','pendiente_conciliacion']:['neto_conciliado','pagado_conciliado','saldo_por_cubrir']).map(k=>({clave:k,...SERIES[k]}));
 }
 function grafTendencia(r){
  const e=r.estado,{puntos,porCentro,consolidado}=puntosTendencia(e),series=seriesPerspectiva(e),pago=filtros(e).perspectiva==='PAGO';
  const titulo=pago?'Tendencia semanal: pagado registrado, conciliado y pendiente':'Tendencia semanal: neto conciliado, pagado conciliado y saldo';
  const tiene=puntos.length>0;
  const cuerpo=conFuente(e,'tendencia',tiene,()=>tiene?leyenda(series,'linea')+svgLinea(r,'tendencia',{puntos,series,unidad:'MXN',titulo,desc:describirLinea(puntos,series,'MXN'),clave:'tendencia'})
   :bloqueVacio('Sin periodos para graficar',pago?'No hay operaciones con fecha efectiva de pago en el rango.':'No hay obligaciones cuyo periodo se pague en el rango.',false),'graf');
  const colsMed=series.map(s=>({etiqueta:MEDIDAS[s.clave].etiqueta,tipo:'MXN',valor:p=>(p.valores?p.valores[s.clave]:s.clave==='pagado_conciliado'?(p.pagado_conciliado??p.pagado_aplicado):p[s.clave])}));
  const tabla=tiene?tablaHtml({caption:consolidado?'Tendencia por semana calendario (MXN)':'Tendencia por periodo (MXN)',captionExtra:consolidado?'Suma de todos los centros del alcance.':'',
   columnas:[{etiqueta:consolidado?'Semana':'Periodo',html:(p,i)=>`<button type="button" class="tb-enlace" data-accion="detalle" data-clave="tendencia" data-origen="tendencia" data-dim="periodo" data-valor="${E(p.clave)}" data-etq="${E(p.titulo||p.etiqueta)}" data-foco="tend-${i}">${E(p.titulo||p.etiqueta)}</button>`},
    {etiqueta:'Fechas',valor:p=>F.rango(p.desde,p.hasta)},...colsMed,{etiqueta:'Situación',valor:p=>p.provisional?'Provisional (periodo abierto)':'Cerrado'}],filas:puntos})
   +(porCentro.length?tablaHtml({caption:'Fechas reales de cada periodo por centro',columnas:[{etiqueta:'Centro',valor:f=>f.obra??f.obra_nombre??obraNombre(e,f.obra_id)},
    {etiqueta:'Periodicidad',valor:f=>PERIODICIDADES[f.periodicidad]||f.periodicidad},{etiqueta:'Semana interna',valor:f=>arr(f.semanas).length?arr(f.semanas).join(', '):(f.etiqueta??f.periodo)},
    {etiqueta:'Periodo real',valor:f=>F.rango(f.periodo_desde||f.desde,f.periodo_hasta||f.hasta)},{etiqueta:'Fecha de pago',tipo:'FECHA',valor:f=>f.fecha_pago},...colsMed],filas:porCentro}):''):'';
  return figura(r,'tendencia',{ancha:true,titulo,cuerpo,tabla,descripcion:consolidado
   ?`Suma por semana calendario (lunes a domingo) de la ${pago?'fecha efectiva de pago':'fecha de pago programada'}. Cada centro conserva sus semanas internas y fechas reales en la tabla de datos. Las marcas huecas y la banda «Provisional» indican semanas abiertas.`
   :`Por periodo, ${PERSPECTIVAS[pago?'PAGO':'PERIODO'].corta}. Las marcas huecas y la banda «Provisional» indican periodos abiertos.`});
 }
 /* Fechas reales por centro (desde las filas de TENDENCIA) para comparar centros. */
 function fechasPorCentro(estado){
  const m=new Map();
  for(const f of puntosTendencia(estado).porCentro){
   const k=String(f.obra_id??f.obra??'');if(!k)continue;const d=f.periodo_desde||f.desde,h=f.periodo_hasta||f.hasta,s=arr(f.semanas).map(Number);
   const a=m.get(k)||{desde:null,hasta:null,smin:null,smax:null};
   if(d&&(!a.desde||d<a.desde))a.desde=d;if(h&&(!a.hasta||h>a.hasta))a.hasta=h;
   for(const n of s){if(a.smin===null||n<a.smin)a.smin=n;if(a.smax===null||n>a.smax)a.smax=n;}
   m.set(k,a);
  }
  return m;
 }
 const filasComparativo=(estado,lista,dimension)=>{
  const fechas=dimension==='obra'?fechasPorCentro(estado):new Map();
  return arr(lista).map(f=>{
   const clave=String(f.clave??f.obra_id??f.contratista??f.id??f.etiqueta??''),fc=fechas.get(clave)||{};
   const desde=f.desde||fc.desde,hasta=f.hasta||fc.hasta,periodos=f.periodos||(fc.smin!=null?(fc.smin===fc.smax?'Semana '+fc.smin:`Semanas ${fc.smin}–${fc.smax}`):null);
   const etiqueta=String(f.etiqueta??f.obra??f.nombre??f.contratista??clave??'—');
   return {clave,etiqueta,pendiente:esPendiente(clave)||esPendiente(etiqueta),sub:periodos||desde?[periodos,desde?F.rango(desde,hasta):''].filter(Boolean).join(' · '):null,
    seleccionado:f.seleccionado,cobertura:num(f.cobertura),trabajadores:num(f.trabajadores_con_pago),
    valores:{neto_conciliado:num(f.neto_conciliado),pagado_conciliado:num(f.pagado_conciliado??f.pagado_aplicado),pendiente_conciliacion:num(f.pendiente_conciliacion),saldo_por_cubrir:num(f.saldo_por_cubrir),pagado_registrado:num(f.pagado_registrado)}};
  });
 };
 function grafCobertura(r,gid,lista,dimension,titulo,nombreDim,panorama){
  const e=r.estado,filas=filasComparativo(e,lista,dimension).sort((a,b)=>(b.valores.neto_conciliado||0)-(a.valores.neto_conciliado||0));
  const segs=['pagado_conciliado','pendiente_conciliacion','saldo_por_cubrir'].map(k=>({clave:k,...SERIES[k]}));
  const cob=f=>f.cobertura!==null?f.cobertura:(f.valores.neto_conciliado?(f.valores.pagado_conciliado||0)/f.valores.neto_conciliado*100:null);
  const cuerpo=conFuente(e,'comparativos',filas.length>0,()=>filas.length?leyenda(segs,'barra')+barrasHtml(r,gid,{filas,segmentos:segs,medida:'neto_conciliado',dimension,panorama,
   escalaPor:f=>Math.max(num(f.valores.neto_conciliado)||0,segs.reduce((s,g)=>s+Math.max(0,num(f.valores[g.clave])||0),0)),
   textoAria:f=>`neto conciliado ${F.mxn(f.valores.neto_conciliado)}, pagado conciliado ${F.mxn(f.valores.pagado_conciliado)}, pendiente de conciliación ${F.mxn(f.valores.pendiente_conciliacion)}, saldo por cubrir ${F.mxn(f.valores.saldo_por_cubrir)}, cobertura ${F.pct(cob(f))}`,
   textoValor:f=>`<span class="tb-cifra">${E(F.mxn(f.valores.neto_conciliado))}</span><span class="tb-sub">Cobertura ${E(F.pct(cob(f)))} · saldo ${E(F.mxn(f.valores.saldo_por_cubrir))}</span>`})
   :bloqueVacio('Sin datos para comparar','No hay obligaciones en este alcance por '+nombreDim.toLowerCase()+'.',false),'graf');
  const tabla=filas.length?tablaHtml({caption:titulo+' (MXN)',columnas:[{etiqueta:nombreDim,html:f=>f.pendiente?marcaPendiente():E(f.etiqueta)},{etiqueta:'Periodos y fechas reales',valor:f=>f.sub||'—'},
   {etiqueta:'Neto conciliado',tipo:'MXN',valor:f=>f.valores.neto_conciliado},{etiqueta:'Pagado conciliado',tipo:'MXN',valor:f=>f.valores.pagado_conciliado},{etiqueta:'Pendiente de conciliación',tipo:'MXN',valor:f=>f.valores.pendiente_conciliacion},
   {etiqueta:'Saldo por cubrir',tipo:'MXN',valor:f=>f.valores.saldo_por_cubrir},{etiqueta:'Cobertura de pago',tipo:'PCT',valor:cob},{etiqueta:'Trabajadores con pago',tipo:'PERSONAS',valor:f=>f.trabajadores},
   ...(panorama?[{etiqueta:'En la selección',valor:f=>f.seleccionado===false?'No':'Sí'}]:[])],filas}):'';
  const base='La barra completa es el neto conciliado: pagado conciliado, pendiente de conciliación y saldo por cubrir.';
  const desc=panorama?`Panorama general: muestra todos los centros de la razón social con los demás filtros aplicados, para dar contexto; los que están fuera de tu selección aparecen en gris y con la leyenda «Fuera de la selección». ${base}`
   :`${base} ${dimension==='obra'?'Cada centro muestra sus semanas internas y las fechas reales de sus periodos.':'El contratista es el registrado en la obligación (adscripción histórica).'}`;
  return figura(r,gid,{titulo,descripcion:desc,panorama,cuerpo,tabla});
 }
 function grafSimple(r,gid,o){
  const e=r.estado,filas=o.filas;
  const cuerpo=conFuente(e,o.fuente||'comparativos',filas.length>0,()=>filas.length?barrasHtml(r,gid,{filas,segmentos:[{clave:'v',color:o.color||'--tb-uno'}],medida:o.medida,dimension:o.dimension,colorFila:o.colorFila,textoAria:o.textoAria,textoValor:o.textoValor,noNavegable:o.noNavegable,textoFija:o.textoFija})
   :bloqueVacio(o.vacioTitulo||'Sin datos',o.vacioTexto||'No hay registros en este alcance.',false),'graf');
  const tabla=filas.length?tablaHtml({caption:o.titulo,columnas:o.columnasTabla,filas,pie:o.pie}):'';
  return figura(r,gid,{titulo:o.titulo,descripcion:o.descripcion,cuerpo,tabla});
 }
 const comp=(estado,k)=>arr(estado.comparativos&&estado.comparativos[k]);
 /* H7 del modelo: `por_medio_criterio` = METODO_PLANEADO (perspectiva periodo:
    método planeado de la obligación; pagos sin obligación → SIN_OBLIGACION) o
    MEDIO_REAL (perspectiva pago: medio real de la operación, sin saldo ni cobertura). */
 function criterioMedio(estado){
  const c=(estado.comparativos&&estado.comparativos.por_medio_criterio)||(estado.resumen&&estado.resumen.por_medio_criterio);
  if(c==='METODO_PLANEADO'||c==='MEDIO_REAL')return c;return filtros(estado).perspectiva==='PAGO'?'MEDIO_REAL':'METODO_PLANEADO';
 }
 function grafMedio(r){
  const crit=criterioMedio(r.estado),plan=crit==='METODO_PLANEADO';
  let src=comp(r.estado,'por_medio'),fuente='comparativos';
  if(!src.length){const pm=obj(obj(medida(r.estado,'pagado_registrado').desglose).por_medio);src=Object.entries(pm).map(([k,v])=>({clave:k,pagado_registrado:v}));fuente='resumen';}
  const lista=src.map(f=>{const k=String(f.clave??f.medio??'');const imp=num(f.pagado_registrado??f.importe);return {clave:k,etiqueta:MEDIOS[k]||f.etiqueta||k||'—',valores:{v:imp},importe:imp,operaciones:num(f.operaciones),neto:num(f.neto_conciliado)};})
   .sort((a,b)=>(b.importe||0)-(a.importe||0)||(b.neto||0)-(a.neto||0));
  const total=lista.reduce((s,f)=>s+(f.importe||0),0),part=f=>total?(f.importe||0)/total*100:null,ops=lista.some(f=>f.operaciones!==null);
  const eje=plan?'Método de pago planeado':'Medio de pago real';
  return grafSimple(r,'por_medio',{fuente,titulo:plan?'Pagado registrado por método de pago planeado':'Pagado registrado por medio de pago real',
   descripcion:plan?'Perspectiva por periodo de nómina: agrupa por el método planeado de cada obligación (transferencia, cheque o por definir), no por el medio con que se pagó; por eso puede diferir del desglose por medio real. Los pagos sin obligación van aparte.'
    :'Perspectiva por fecha efectiva de pago: agrupa por el medio real de cada operación; cada operación cuenta una vez. No aplica saldo ni cobertura.',
   filas:lista,medida:'pagado_registrado',dimension:plan?'metodo_planeado':'medio',
   noNavegable:f=>f.clave==='SIN_OBLIGACION',textoFija:'Sin obligación asociada: se revisa en «Pago sin asignar» y en excepciones.',
   textoAria:f=>`${F.mxn(f.importe)}${f.operaciones!==null?', '+F.entero(f.operaciones)+' operaciones':''}, ${F.pct(part(f))} del total`,
   textoValor:f=>`<span class="tb-cifra">${E(F.mxn(f.importe))}</span><span class="tb-sub">${f.operaciones!==null?E(F.entero(f.operaciones))+' operaciones · ':''}${E(F.pct(part(f)))}</span>`,
   columnasTabla:[{etiqueta:eje,valor:f=>f.etiqueta},{etiqueta:'Pagado registrado',tipo:'MXN',valor:f=>f.importe},...(ops?[{etiqueta:'Operaciones',tipo:'OPERACIONES',valor:f=>f.operaciones}]:[]),{etiqueta:'Participación',tipo:'PCT',valor:part}],
   pie:ops?['Total',total,lista.reduce((s,f)=>s+(f.operaciones||0),0),total?100:null]:['Total',total,total?100:null]});
 }
 function grafCheques(r){
  const m=medida(r.estado,'cheques_por_estado'),des=obj(m.desglose);
  let src=comp(r.estado,'cheques_por_estado'),fuente='comparativos';
  if(!src.length){src=Array.isArray(m.desglose)?m.desglose:Object.entries(des).filter(([,v])=>v&&typeof v==='object'&&'cantidad' in v).map(([k,v])=>({estado:k,...v}));fuente='resumen';}
  const orden=CHEQUES.map(c=>c[0]),pos=k=>orden.indexOf(k)<0?99:orden.indexOf(k);
  const lista=src.map(f=>{const k=String(f.estado??f.estatus??f.clave??'');return {clave:k,etiqueta:(CHEQUES.find(c=>c[0]===k)||[k,f.etiqueta||k])[1],valores:{v:num(f.cantidad)},cantidad:num(f.cantidad),importe:num(f.importe)};}).sort((a,b)=>pos(a.clave)-pos(b.clave));
  const nota=[des.reposiciones!=null?`Reposiciones: ${F.entero(des.reposiciones)}.`:'',des.cobro?`Cobro bancario: ${String(des.cobro).toLowerCase()}.`:''].filter(Boolean).join(' ');
  return grafSimple(r,'cheques_estado',{fuente,titulo:'Cheques por estado',descripcion:`Número de cheques por estatus con su importe. Pendiente no es pago y cancelado no cuenta; una reposición no duplica el importe del cheque que reemplaza.${nota?' '+nota:''}`,filas:lista,medida:'cheques_por_estado',dimension:'estado_cheque',
   textoAria:f=>`${F.entero(f.cantidad)} cheques por ${F.mxn(f.importe)}`,textoValor:f=>`<span class="tb-cifra">${E(F.entero(f.cantidad))} cheques</span><span class="tb-sub">${E(F.mxn(f.importe))}</span>`,
   columnasTabla:[{etiqueta:'Estado',valor:f=>f.etiqueta},{etiqueta:'Cheques',tipo:'CHEQUES',valor:f=>f.cantidad},{etiqueta:'Importe',tipo:'MXN',valor:f=>f.importe}]});
 }
 function tramoIndice(t){const s=norm(t);if(/vencer/.test(s))return 0;const n=(s.match(/\d+/)||['0'])[0]*1;if(/>|mas|\+/.test(s)&&n>=60)return 5;if(n>=61)return 5;if(n>=31)return 4;if(n>=15)return 3;if(n>=8)return 2;return 1;}
 function grafAntiguedad(r){
  const m=medida(r.estado,'saldo_por_antiguedad');
  let src=comp(r.estado,'saldo_por_antiguedad'),fuente='comparativos';
  if(!src.length){src=Array.isArray(m.desglose)?m.desglose:Object.entries(obj(m.desglose)).filter(([k])=>TRAMOS.some(t=>t[0]===k)).map(([k,v])=>({tramo:k,importe:v}));fuente='resumen';}
  const lista=src.map(f=>{const i=tramoIndice(f.tramo??f.clave??f.etiqueta);return {clave:String(f.tramo??f.clave??TRAMOS[i][0]),etiqueta:TRAMOS[i][1],idx:i,valores:{v:num(f.importe??f.saldo)},importe:num(f.importe??f.saldo),obligaciones:num(f.obligaciones??f.cantidad)};}).sort((a,b)=>a.idx-b.idx);
  const obl=lista.some(f=>f.obligaciones!==null);
  return grafSimple(r,'saldo_antiguedad',{fuente,titulo:'Saldo por antigüedad',descripcion:'Saldo por cubrir por días transcurridos desde la fecha de pago programada. El tono naranja se oscurece con la antigüedad y cada barra nombra su tramo; «Por vencer» va en gris.',filas:lista,medida:'saldo_por_antiguedad',dimension:'tramo',
   colorFila:f=>f.idx===0?'--tb-gris':'--tb-o'+f.idx,textoAria:f=>`${F.mxn(f.importe)}${f.obligaciones!==null?' en '+F.entero(f.obligaciones)+' obligaciones':''}`,
   textoValor:f=>`<span class="tb-cifra">${E(F.mxn(f.importe))}</span>${f.obligaciones!==null?`<span class="tb-sub">${E(F.entero(f.obligaciones))} obligaciones</span>`:''}`,
   columnasTabla:[{etiqueta:'Antigüedad',valor:f=>f.etiqueta},{etiqueta:'Saldo por cubrir',tipo:'MXN',valor:f=>f.importe},...(obl?[{etiqueta:'Obligaciones',tipo:'CONTEO',valor:f=>f.obligaciones}]:[])],
   pie:['Total',lista.reduce((s,f)=>s+(f.importe||0),0),...(obl?[lista.reduce((s,f)=>s+(f.obligaciones||0),0)]:[])]});
 }
 function grafPendienteMotivo(r){
  const m=medida(r.estado,'pendiente_conciliacion');
  let src=comp(r.estado,'pendiente_por_motivo'),fuente='comparativos';
  if(!src.length){src=Array.isArray(m.desglose)?m.desglose:arr(obj(m.desglose).por_motivo);fuente='resumen';}
  const lista=src.map(f=>({clave:String(f.motivo??f.clave??''),etiqueta:String(f.etiqueta??f.descripcion??MOTIVOS_PENDIENTE[f.motivo]??f.motivo??'—'),valores:{v:num(f.importe)},importe:num(f.importe),operaciones:num(f.operaciones)})).sort((a,b)=>(b.importe||0)-(a.importe||0));
  return grafSimple(r,'pendiente_motivo',{fuente,color:'--tb-s1',titulo:'Pendiente de conciliación por motivo',descripcion:'Pago registrado que todavía no se concilia, por motivo, con el número de operaciones.',filas:lista,medida:'pendiente_conciliacion',dimension:'motivo',
   textoAria:f=>`${F.mxn(f.importe)} en ${F.entero(f.operaciones)} operaciones`,textoValor:f=>`<span class="tb-cifra">${E(F.mxn(f.importe))}</span><span class="tb-sub">${E(F.entero(f.operaciones))} operaciones</span>`,
   vacioTitulo:'Sin pendientes de conciliación',vacioTexto:'Todo el pago registrado del alcance está conciliado con su obligación.',
   columnasTabla:[{etiqueta:'Motivo',valor:f=>f.etiqueta},{etiqueta:'Importe pendiente',tipo:'MXN',valor:f=>f.importe},{etiqueta:'Operaciones',tipo:'OPERACIONES',valor:f=>f.operaciones}]});
 }
 function grafPlantillaTendencia(r){
  const e=r.estado,p=e.plantilla||{},src=arr(p.tendencia);
  const series=['altas','bajas','reingresos'].map(k=>({clave:k,...SERIES[k]}));
  const puntos=src.map(x=>({clave:String(x.periodo??x.clave??x.etiqueta),etiqueta:String(x.etiqueta??x.periodo??''),desde:x.desde,hasta:x.hasta,sub:x.desde?F.fechaCorta(x.desde):null,provisional:!!x.provisional,valores:{altas:num(x.altas),bajas:num(x.bajas),reingresos:num(x.reingresos)},plantilla:num(x.plantilla)}));
  const titulo='Movimientos de personal por periodo';
  const cuerpo=conFuente(e,'plantilla',puntos.length>0,()=>puntos.length?leyenda(series,'linea')+svgLinea(r,'plantilla_tendencia',{puntos,series,unidad:'EVENTOS',titulo,desc:describirLinea(puntos,series,'EVENTOS'),clave:'plantilla'})
   :bloqueVacio('Sin serie de movimientos','La fuente no entregó movimientos por periodo para este alcance; el total del rango está en los indicadores y el detalle de eventos abajo.',false),'graf');
  const tabla=puntos.length?tablaHtml({caption:'Movimientos por periodo',columnas:[{etiqueta:'Periodo',valor:x=>x.etiqueta},{etiqueta:'Fechas reales',valor:x=>F.rango(x.desde,x.hasta)},{etiqueta:'Altas',tipo:'EVENTOS',valor:x=>x.valores.altas},
   {etiqueta:'Bajas',tipo:'EVENTOS',valor:x=>x.valores.bajas},{etiqueta:'Reingresos',tipo:'EVENTOS',valor:x=>x.valores.reingresos},{etiqueta:'Plantilla al cierre',tipo:'PERSONAS',valor:x=>x.plantilla}],filas:puntos}):'';
  return figura(r,'plantilla_tendencia',{ancha:true,titulo,descripcion:'Eventos efectivos de alta, baja y reingreso por periodo, con sus fechas reales.',cuerpo,tabla});
 }
 function grafPlantillaCentro(r){
  const p=r.estado.plantilla||{},lista=arr(p.por_centro).map(f=>({clave:String(f.clave??f.obra_id??''),etiqueta:String(f.etiqueta??f.obra??obraNombre(r.estado,f.obra_id)??'—'),valores:{v:num(f.plantilla)},plantilla:num(f.plantilla),altas:num(f.altas),bajas:num(f.bajas),reingresos:num(f.reingresos)})).sort((a,b)=>(b.plantilla||0)-(a.plantilla||0));
  const alcance=p.etiqueta_alcance||medida(r.estado,'plantilla_actual').alcance;
  return grafSimple(r,'plantilla_centro',{fuente:'plantilla',titulo:'Plantilla por centro',descripcion:`Trabajadores activos en el padrón por centro${alcance?' ('+alcance+')':''}, con los movimientos del rango.`,filas:lista,medida:'plantilla_actual',dimension:'obra',
   vacioTitulo:'Sin plantilla por centro',vacioTexto:'La fuente no entregó la plantilla por centro para este alcance.',
   textoAria:f=>`${F.entero(f.plantilla)} personas, ${F.entero(f.altas)} altas, ${F.entero(f.bajas)} bajas`,textoValor:f=>`<span class="tb-cifra">${E(F.entero(f.plantilla))} personas</span><span class="tb-sub">+${E(F.entero(f.altas))} altas · −${E(F.entero(f.bajas))} bajas</span>`,
   columnasTabla:[{etiqueta:'Centro',valor:f=>f.etiqueta},{etiqueta:'Plantilla actual',tipo:'PERSONAS',valor:f=>f.plantilla},{etiqueta:'Altas',tipo:'EVENTOS',valor:f=>f.altas},{etiqueta:'Bajas',tipo:'EVENTOS',valor:f=>f.bajas},{etiqueta:'Reingresos',tipo:'EVENTOS',valor:f=>f.reingresos}]});
 }
 function graficaDe(r,clave){
  const comps=r.estado.comparativos||{};
  switch(clave){
   case 'tendencia':return grafTendencia(r);
   case 'por_centro':{const pan=comps.panorama_general!==undefined?!!comps.panorama_general:arr(comps.por_centro).some(x=>x.seleccionado===false);
    return grafCobertura(r,'por_centro',comps.por_centro,'obra',pan?'Neto conciliado por centro · todos los centros':'Neto conciliado por centro','Centro',pan);}
   case 'por_contratista':return grafCobertura(r,'por_contratista',comps.por_contratista,'contratista','Neto conciliado por contratista','Contratista',false);
   case 'por_medio':return grafMedio(r);
   case 'cheques_estado':return grafCheques(r);
   case 'saldo_antiguedad':return grafAntiguedad(r);
   case 'pendiente_motivo':return grafPendienteMotivo(r);
   case 'plantilla_tendencia':return grafPlantillaTendencia(r);
   case 'plantilla_centro':return grafPlantillaCentro(r);
  }
  return '';
 }

 /* ---------------- Indicadores ---------------- */
 function estadoKpi(estado,m){
  if(m.estado){if(typeof m.estado==='string')return {nivel:'info',texto:m.estado};return {nivel:m.estado.nivel||'info',texto:m.estado.texto||m.estado.etiqueta||''};}
  if(m.valor===null)return {nivel:'info',texto:'No disponible'};
  if(m.calidad&&CALIDAD[m.calidad]&&CALIDAD[m.calidad].nivel!=='ok')return {nivel:CALIDAD[m.calidad].nivel,texto:CALIDAD[m.calidad].etiqueta};
  if(listaCalidad(estado).some(c=>c.estado==='ERROR_LECTURA'))return {nivel:'critico',texto:'Incompleto: hay centros con error de lectura'};
  if(m.catEstado){const [nivel,texto]=m.catEstado(m.valor);return {nivel,texto};}
  if(m.provisional)return {nivel:'atencion',texto:'Provisional: periodo abierto'};
  return {nivel:'ok',texto:'Dato completo'};
 }
 function motivoNoDisponible(m){
  if(m.motivo)return m.motivo;
  if(!m.existe)return 'La fuente no entrega esta medida para el alcance.';
  if(m.clave==='cobertura')return 'Denominador vacío: no hay neto conciliado en el alcance.';
  if(m.clave==='rotacion')return 'Denominador vacío: la plantilla promedio es cero.';
  if(m.clave==='costo_patronal')return 'Sin base de cálculo explícita registrada.';
  if(m.clave==='promedio_pagado_trabajador'||m.clave==='mediana_pagado_trabajador')return 'Denominador vacío: nadie recibió pago en el alcance.';
  return 'Sin dato para el alcance.';
 }
 function variacionHtml(estado,m){
  if(comparar(filtros(estado))==='NINGUNO')return '<span class="tb-mut">Comparación desactivada</span>';
  const v=m.variacion,cmp=comparable(estado)||{};
  if(!v||v.absoluta===null)return '<span class="tb-mut">Sin periodo comparable</span>';
  const a=v.absoluta,dir=a>0?'sube':a<0?'baja':'sin cambio',flecha=a>0?'▲':a<0?'▼':'＝';
  const juicio=m.sentido==='NEUTRO'||a===0?'neutro':(m.sentido==='MAYOR')===(a>0)?'favorable':'desfavorable';
  const rango=v.desde?F.rango(v.desde,v.hasta):(cmp.etiqueta||'periodo comparable');
  const pct=m.unidad==='PORCENTAJE'?'':` (${v.porcentaje===null?'% no disponible: comparable en cero':F.pctFirmado(v.porcentaje)})`;
  return `<span class="tb-var tb-var--${juicio}"><span aria-hidden="true">${flecha}</span> ${E(F.variacion(a,m.unidad))}${E(pct)}</span> <span class="tb-sr">${dir}${juicio==='neutro'?'':', '+juicio}</span><span class="tb-var-ref">vs. ${E(rango)}</span>`
   +(v.incompleto||cmp.incompleto?`<span class="tb-aviso-linea"><span class="tb-ico" aria-hidden="true">!</span> Periodo comparable incompleto: la variación puede cambiar.</span>`:'');
 }
 function kpiHtml(r,m){
  const e=r.estado,id=`${r.pfx}-k-${m.clave}`,nd=m.valor===null,st=estadoKpi(e,m),abierta=!!r.ui.defs[m.clave];
  const prov=m.provDefinido?m.provisional:!!(e.resumen&&e.resumen.provisional)&&m.clave!=='plantilla_actual';
  const incompleta=st.nivel!=='critico'&&listaCalidad(e).some(c=>c.estado==='INCOMPLETO');
  const valorTxt=nd?'No disponible':F.valor(m.valor,m.unidad),persp=filtros(e).perspectiva;
  const extras=[m.clave==='pendiente_conciliacion'&&m.operaciones!==null?`${F.entero(m.operaciones)} operaciones`:'',m.alcance||'',
   m.perspectiva&&persp&&m.perspectiva!==persp&&PERSPECTIVAS[m.perspectiva]?'Calculado '+PERSPECTIVAS[m.perspectiva].corta:''].filter(Boolean);
  return `<article class="tb-kpi tb-kpi--${E(st.nivel)}" aria-labelledby="${id}-t" data-medida="${E(m.clave)}">
   <div class="tb-kpi-cab"><h4 id="${id}-t" class="tb-kpi-t">${E(m.etiqueta)}</h4><span class="tb-kpi-insignias">${prov?'<span class="tb-insignia tb-insignia--prov">Provisional</span>':''}${incompleta?'<span class="tb-insignia tb-insignia--inc">Fuentes incompletas</span>':''}</span></div>
   <button type="button" class="tb-kpi-valor${nd?' tb-kpi-valor--nd':''}" data-accion="detalle" data-clave="${E(m.clave)}" data-origen="indicador" data-foco="kpi-${E(m.clave)}" aria-label="${E(m.etiqueta+': '+valorTxt+(prov?' (provisional)':'')+'. Abrir detalle')}" aria-describedby="${id}-e ${id}-v">${E(valorTxt)}</button>
   ${nd?`<p class="tb-kpi-motivo">${E(motivoNoDisponible(m))}</p>`:''}${extras.map(x=>`<p class="tb-kpi-extra">${E(x)}</p>`).join('')}
   ${m.formulaVisible&&m.formula?`<p class="tb-kpi-formula"><span class="tb-sr">Fórmula: </span>${E(m.formula)}</p>`:''}${m.calculo?`<p class="tb-kpi-formula">Cálculo: ${E(m.calculo)}</p>`:''}
   <p class="tb-kpi-estado" id="${id}-e">${insignia(st.nivel,st.texto)}<span class="tb-sr"> (${NIVEL_TEXTO[st.nivel]||''})</span></p>
   <p class="tb-kpi-var" id="${id}-v">${variacionHtml(e,m)}</p>
   <div class="tb-kpi-pie tb-no-imprimir"><button type="button" class="tb-link" data-accion="definicion" data-clave="${E(m.clave)}" aria-expanded="${abierta}" aria-controls="${id}-d" data-foco="def-${E(m.clave)}">Definición<span class="tb-sr"> de ${E(m.etiqueta)}</span></button><span class="tb-unidad">${E(UNIDADES[m.unidad]||m.unidad)}</span></div>
   <div class="tb-def" id="${id}-d"${abierta?'':' hidden'}><p>${E(m.definicion)}</p>${m.formula?`<p class="tb-formula"><b>Fórmula:</b> ${E(m.formula)}</p>`:''}</div>
  </article>`;
 }
 function clavesKpi(e,vista){const x=arr(e.indicadores&&e.indicadores[vista.clave]);return x.length?x.slice(0,8):vista.kpis;}
 function indicadores(r,vista){
  const e=r.estado,claves=clavesKpi(e,vista),tiene=!!(e.resumen||(e.plantilla&&e.plantilla.medidas));
  return `<section class="tb-sec" aria-labelledby="${r.pfx}-kpi-t"><h3 id="${r.pfx}-kpi-t" class="tb-sec-t">Indicadores prioritarios</h3>
   ${conFuente(e,'resumen',tiene,()=>`<div class="tb-kpis">${claves.map(k=>kpiHtml(r,medida(e,k))).join('')}</div>`,'kpis',claves.length)}</section>`;
 }

 /* ---------------- Tablas de excepciones, detalle y calidad ---------------- */
 function tablaExcepciones(r){
  const e=r.estado,d=e.excepciones||null,filas=d?arr(d.filas):[];
  const cont=()=>!d?bloqueVacio('Sin información de excepciones','La fuente no entregó excepciones para este alcance.',false):!filas.length?bloqueVacio('Sin excepciones','Ninguna obligación ni operación del alcance requiere revisión.',false)
   :tablaHtml({caption:'Excepciones por revisar',captionExtra:d.total!=null?`${F.entero(d.total)} en total`:'',ancha:true,columnas:[
    {etiqueta:'Severidad',html:f=>{const n=SEVERIDAD[String(f.severidad||'').toUpperCase()]||'atencion';return insignia(n,f.severidad_texto||SEVERIDAD_TXT[n]);}},
    {etiqueta:'Tipo',valor:f=>f.tipo_texto??TIPOS_EXCEPCION[f.tipo]??f.tipo},{etiqueta:'Descripción',valor:f=>f.descripcion??f.motivo},{etiqueta:'Centro',valor:f=>f.obra??f.obra_nombre??obraNombre(e,f.obra_id)},
    {etiqueta:'Trabajador',html:trabajadorTexto},{etiqueta:'Semana o fecha',html:f=>[f.semana!=null||f.periodo?periodoTexto(f):'',f.fecha?`<span class="tb-sub">${E(F.fecha(f.fecha))}</span>`:''].filter(Boolean).join('')||'—'},
    {etiqueta:'Importe',tipo:'MXN',valor:f=>f.importe},{etiqueta:'Abrir',clase:'tb-col-acc',html:(f,i)=>enlacesFila('excepciones',f,i)}],filas})+paginacion('excepciones',d,'excepciones');
  return `<section class="tb-sec" aria-labelledby="${r.pfx}-exc-t"><h3 id="${r.pfx}-exc-t" class="tb-sec-t">Excepciones</h3>${conFuente(e,'excepciones',!!d,cont,'tabla',4)}</section>`;
 }
 /* En «Plantilla y cumplimiento» el detalle son los eventos de PLANTILLA. */
 function fuenteDetalle(r){
  const e=r.estado;
  if(r.vista.clave==='PLANTILLA'&&e.plantilla&&e.plantilla.eventos)return {fuente:'plantilla',d:e.plantilla.eventos,grano:'MOVIMIENTO'};
  return {fuente:'detalle',d:e.detalle||null,grano:(e.detalle&&e.detalle.grano)||(r.vista.clave==='PLANTILLA'?'MOVIMIENTO':'OBLIGACION')};
 }
 function tablaDetalle(r){
  const e=r.estado,{fuente,d,grano}=fuenteDetalle(r),filas=d?arr(d.filas):[];
  let cols=COLS_DETALLE[grano]||COLS_DETALLE.OBLIGACION;
  if(d&&arr(d.columnas).length)cols=d.columnas.map(c=>({etiqueta:c.etiqueta||c.clave,tipo:c.tipo,valor:f=>f[c.clave]}));
  cols=cols.map(c=>c.etiqueta==='Centro'?{...c,valor:f=>f.obra??f.obra_nombre??obraNombre(e,f.obra_id)??f.obra_id}:c).concat([{etiqueta:'Abrir',clase:'tb-col-acc',html:(f,i)=>enlacesFila(fuente,f,i)}]);
  const pago=filtros(e).perspectiva==='PAGO';
  const vacio=grano==='MOVIMIENTO'?'No hay altas, bajas ni reingresos efectivos en el rango.'
   :pago?'No hay operaciones con fecha efectiva de pago dentro del rango. Si buscas nóminas de este periodo, cambia la perspectiva a «Periodo de nómina».'
   :'No hay obligaciones cuyo periodo de nómina se pague en el rango. Si buscas pagos hechos en estas fechas, cambia la perspectiva a «Fecha efectiva de pago» o amplía el rango.';
  const nombre=grano==='OPERACION'?'Detalle por operación de pago':grano==='MOVIMIENTO'?'Detalle de movimientos de personal':'Detalle por obligación';
  const cont=()=>!d?bloqueVacio('Sin información de detalle','La fuente no entregó filas de detalle para este alcance.',false):!filas.length?bloqueVacio('Sin filas de detalle',vacio,true)
   :tablaHtml({caption:nombre,captionExtra:d.total!=null?`${F.entero(d.total)} filas`:'',ancha:true,columnas:cols,filas,claseFila:f=>f.provisional?'tb-fila-prov':''})+paginacion(fuente,d,'detalle');
  return `<section class="tb-sec" aria-labelledby="${r.pfx}-det-t"><h3 id="${r.pfx}-det-t" class="tb-sec-t">${E(nombre)}</h3>${conFuente(e,fuente,!!d,cont,'tabla',8)}</section>`;
 }
 function tablaCalidad(r){
  const cal=listaCalidad(r.estado);
  const falt=c=>arr(c.periodos_faltantes).map(p=>`Semana ${p.semana} (${F.rango(p.desde,p.hasta)})`).join('; ');
  const cont=()=>cal.length?tablaHtml({caption:'Calidad de las fuentes por centro',columnas:[{etiqueta:'Centro',valor:c=>c.obra??c.obra_nombre??c.obra_id},{etiqueta:'Estado',html:c=>insigniaCalidad(c.estado)},
   {etiqueta:'Periodos autorizados',valor:c=>c.periodos_esperados!=null?`${F.entero(c.periodos_autorizados)} de ${F.entero(c.periodos_esperados)}`:'—'},{etiqueta:'Provisionales',tipo:'CONTEO',valor:c=>c.periodos_provisionales},
   {etiqueta:'Periodos sin cierre',valor:c=>falt(c)||'—'},{etiqueta:'Qué significa',valor:c=>[c.detalle||(CALIDAD[c.estado]||{}).texto||'',...arr(c.errores)].filter(Boolean).join(' ')}],filas:cal})
   :bloqueVacio('Sin información de calidad','La fuente no informó la calidad por centro.',false);
  return `<section class="tb-sec" aria-labelledby="${r.pfx}-cal-t"><h3 id="${r.pfx}-cal-t" class="tb-sec-t">Calidad y cumplimiento por centro</h3>${conFuente(r.estado,'resumen',!!r.estado.resumen,cont,'tabla',3)}</section>`;
 }

 /* ---------------- Filtros ---------------- */
 function seleccion(estado,clave){return arr(filtros(estado)[clave]).map(String);}
 function msHtml(r,clave){
  const e=r.estado,id=`${r.pfx}-f-${clave}`,ops=opciones(e,clave),abierto=r.ui.ms===clave;
  const sel=abierto?arr(r.ui.msSel[clave]):seleccion(e,clave),busca=abierto?String(r.ui.msBusca[clave]||''):'';
  const resumen=!sel.length?`Todos${ops.length?' ('+F.entero(ops.length)+')':''}`:sel.length===1?etiquetaDe(e,clave,sel[0]):`${F.entero(sel.length)} seleccionados`;
  let lista='',grupo=null,visibles=0;
  ops.forEach((o,i)=>{const txt=norm(o.etiqueta+' '+(o.sub||'')+' '+(o.grupo||''));const ve=!busca||txt.includes(norm(busca));if(ve)visibles++;
   if(o.grupo&&o.grupo!==grupo){grupo=o.grupo;lista+=`<li class="tb-ms-grupo" aria-hidden="true">${E(o.grupo)}</li>`;}
   lista+=`<li data-texto="${E(txt)}"${ve?'':' hidden'}><label class="tb-ms-op"><input type="checkbox" value="${E(o.valor)}" data-accion="ms-marcar" data-filtro="${E(clave)}" data-foco="ms-op-${E(clave)}-${i}"${sel.includes(o.valor)?' checked':''}><span>${E(o.etiqueta)}${o.sub?`<span class="tb-sub">${E(o.sub)}</span>`:''}</span></label></li>`;});
  return `<div class="tb-campo tb-ms${abierto?' tb-ms--abierto':''}" data-ms="${E(clave)}">
   <span class="tb-lbl" id="${id}-l">${E(ETQ_FILTRO[clave])}</span>
   <button type="button" class="tb-ms-btn" data-accion="ms-abrir" data-filtro="${E(clave)}" data-foco="ms-${E(clave)}" aria-expanded="${abierto}" aria-controls="${id}-p" aria-labelledby="${id}-l ${id}-v"${!ops.length&&!sel.length?' aria-disabled="true"':''}><span id="${id}-v" class="tb-ms-val">${E(resumen)}</span><span class="tb-ms-flecha" aria-hidden="true">▾</span></button>
   <div class="tb-ms-panel" id="${id}-p" role="group" aria-labelledby="${id}-l"${abierto?'':' hidden'}>
    ${abierto?`<input type="search" class="tb-ms-buscar" aria-label="Buscar en ${E(ETQ_FILTRO[clave])}" placeholder="Buscar…" value="${E(busca)}" data-accion="ms-buscar" data-filtro="${E(clave)}" data-foco="ms-buscar-${E(clave)}" autocomplete="off">
    <div class="tb-ms-util"><button type="button" class="tb-link" data-accion="ms-todos" data-filtro="${E(clave)}" data-foco="ms-todos-${E(clave)}">Marcar visibles</button><button type="button" class="tb-link" data-accion="ms-ninguno" data-filtro="${E(clave)}" data-foco="ms-ninguno-${E(clave)}">Quitar marcas (todos)</button></div>
    <ul class="tb-ms-lista">${lista}</ul><p class="tb-ms-vacio"${visibles?' hidden':''}>Sin coincidencias.</p>
    <div class="tb-ms-pie"><span class="tb-mut" data-ms-cuenta="${E(clave)}">${sel.length?F.entero(sel.length)+' marcados':'Sin marcas = todos'}</span><button type="button" class="btn" data-accion="ms-cancelar" data-filtro="${E(clave)}" data-foco="ms-cancelar-${E(clave)}">Cancelar</button><button type="button" class="btn dark" data-accion="ms-aplicar" data-filtro="${E(clave)}" data-foco="ms-aplicar-${E(clave)}">Aplicar</button></div>`:''}
   </div></div>`;
 }
 function selectHtml(r,clave,etiqueta,ops,valor){
  const id=`${r.pfx}-f-${clave}`;
  return `<div class="tb-campo"><label class="tb-lbl" for="${id}">${E(etiqueta)}</label><select id="${id}" data-accion="filtro" data-filtro="${E(clave)}" data-foco="f-${E(clave)}">${ops.map(([v,t])=>`<option value="${E(v)}"${String(v)===String(valor??'')?' selected':''}>${E(t)}</option>`).join('')}</select></div>`;
 }
 function filtrosHtml(r){
  const e=r.estado,f=filtros(e),p=r.pfx,persp=PERSPECTIVAS[f.perspectiva]?f.perspectiva:'PERIODO',emp=opciones(e,'empresas');
  const activosMas=FILTROS_MAS.filter(k=>seleccion(e,k).length).length,mas=r.ui.mas===null?activosMas>0:r.ui.mas;
  const alc=(e.resumen&&e.resumen.alcance)||{},errF=r.ui.errorFecha,inv=errF?` aria-invalid="true" aria-describedby="${p}-f-errfecha"`:'';
  return `<form class="tb-filtros tb-no-imprimir" aria-labelledby="${p}-fil-t" novalidate>
   <h3 id="${p}-fil-t" class="tb-sec-t tb-filtros-t">Filtros</h3>
   ${errorDe(e,'catalogos')?bloqueError('catalogos',errorDe(e,'catalogos')):''}
   <div class="tb-filtros-fila">
    ${selectHtml(r,'empresa','Razón social',emp.length?emp.map(o=>[o.valor,o.etiqueta]):[[f.empresa||'',f.empresa||'—']],f.empresa)}
    ${msHtml(r,'obras')}
    <fieldset class="tb-campo tb-persp"><legend class="tb-lbl">Perspectiva de fecha</legend><div class="tb-seg-ctl">
     ${Object.entries(PERSPECTIVAS).map(([k,v])=>`<label class="tb-seg-op"><input type="radio" name="${p}-persp" value="${k}" data-accion="filtro" data-filtro="perspectiva" data-foco="persp-${k}" aria-describedby="${p}-persp-${k}"${k===persp?' checked':''}><span>${E(v.etiqueta)}</span></label>`).join('')}</div>
     ${Object.entries(PERSPECTIVAS).map(([k,v])=>`<span id="${p}-persp-${k}" class="tb-sr">${E(v.texto)}</span>`).join('')}
     <p class="tb-ayuda">${E(PERSPECTIVAS[persp].texto)}</p></fieldset>
    ${selectHtml(r,'tipo_periodo','Rango de fechas',PRESETS,tipoPeriodo(f))}
    <div class="tb-campo"><label class="tb-lbl" for="${p}-f-desde">Desde</label><input type="date" id="${p}-f-desde" value="${E(f.desde||alc.desde||'')}" data-accion="filtro" data-filtro="desde" data-foco="f-desde"${inv}></div>
    <div class="tb-campo"><label class="tb-lbl" for="${p}-f-hasta">Hasta</label><input type="date" id="${p}-f-hasta" value="${E(f.hasta||alc.hasta||'')}" data-accion="filtro" data-filtro="hasta" data-foco="f-hasta"${inv}></div>
    ${selectHtml(r,'comparar','Comparar contra',COMPARAR,comparar(f))}
   </div>
   ${errF?`<p class="tb-error-campo" id="${p}-f-errfecha"><span class="tb-ico" aria-hidden="true">!</span> ${E(errF)}</p>`:''}
   <div class="tb-filtros-acc"><button type="button" class="tb-link" data-accion="mas-filtros" aria-expanded="${mas}" aria-controls="${p}-mas" data-foco="mas-filtros">${mas?'Ocultar filtros adicionales':'Más filtros'}${activosMas?` (${activosMas} activos)`:''}</button>
    <button type="button" class="btn" data-accion="restablecer" data-foco="restablecer">Restablecer filtros</button></div>
   <div class="tb-filtros-fila tb-filtros-mas" id="${p}-mas"${mas?'':' hidden'}>${FILTROS_MAS.map(k=>msHtml(r,k)).join('')}</div>
  </form>`;
 }
 function alcanceTexto(estado){
  const f=filtros(estado),alc=(estado.resumen&&estado.resumen.alcance)||{},partes=[];
  if(typeof alc.texto==='string')return alc.texto;
  const emp=opcionesCrudas(estado,'empresas').find(o=>o.valor===String(f.empresa||alc.empresa||''));
  partes.push('Razón social: '+((emp&&emp.etiqueta)||f.empresa||alc.empresa||'todas'));
  const ids=arr(alc.obras).length?arr(alc.obras):seleccion(estado,'obras'),total=opciones(estado,'obras').length;
  const nombres=ids.map(o=>typeof o==='object'?(o.nombre||o.etiqueta||o.id):etiquetaDe(estado,'obras',o));
  partes.push('Centros: '+(nombres.length&&(!total||nombres.length<total)?nombres.join(', '):`todos${total?' ('+total+')':''}`));
  const tp=tipoPeriodo(f),pr=PRESETS.find(x=>x[0]===tp);
  partes.push((PERSPECTIVAS[alc.perspectiva||f.perspectiva]||PERSPECTIVAS.PERIODO).etiqueta+': '+(pr&&tp!=='PERSONALIZADO'?pr[1]+' ':'')+F.rango(alc.desde||f.desde,alc.hasta||f.hasta));
  const c=comparar(f),cmp=comparable(estado);
  partes.push(c==='NINGUNO'?'Sin comparación':'Comparado con '+((COMPARAR.find(x=>x[0]===c)||['',c])[1]).toLowerCase()+(cmp&&cmp.desde?' ('+F.rango(cmp.desde,cmp.hasta)+')':''));
  FILTROS_MAS.forEach(k=>{const s=seleccion(estado,k);if(s.length)partes.push(ETQ_FILTRO[k]+': '+s.map(v=>etiquetaDe(estado,k,v)).join(', '));});
  return partes.join(' · ');
 }
 function alcanceHtml(r){
  const e=r.estado,chips=[];
  ['obras',...FILTROS_MAS].forEach(k=>seleccion(e,k).forEach(v=>{const t=etiquetaDe(e,k,v);chips.push(`<li><span>${E(ETQ_FILTRO[k])}: ${E(t)}</span><button type="button" class="tb-chip-x" data-accion="quitar-filtro" data-filtro="${E(k)}" data-valor="${E(v)}" data-foco="chip-${E(k)}-${E(v)}" aria-label="${E('Quitar filtro '+ETQ_FILTRO[k]+': '+t)}">✕</button></li>`);}));
  return `<div class="tb-alcance" role="region" aria-labelledby="${r.pfx}-alc-t"><h3 id="${r.pfx}-alc-t" class="tb-alcance-t">Alcance aplicado</h3><p class="tb-alcance-txt" id="${r.pfx}-alcance">${E(alcanceTexto(e))}</p>
   ${chips.length?`<ul class="tb-chips tb-no-imprimir" aria-label="Filtros activos">${chips.join('')}</ul>`:''}</div>`;
 }
 function aviso(nivel,html,boton){return `<li class="tb-aviso tb-aviso--${nivel}"><span class="tb-ico" aria-hidden="true">${ICONO[nivel]}</span><span>${html}</span>${boton||''}</li>`;}
 function avisosHtml(r){
  const e=r.estado,av=[],res=e.resumen||{},alc=obj(res.alcance),cal=listaCalidad(e);
  const errs=Object.keys(FUENTES).filter(k=>errorDe(e,k));
  if(errs.length)av.push(aviso('critico',`<strong>${errs.length===1?'Una fuente no se pudo leer':errs.length+' fuentes no se pudieron leer'}:</strong> ${E(errs.map(k=>FUENTES[k]).join(', '))}. Las secciones afectadas lo indican y puedes reintentar cada una.`,'<button type="button" class="btn tb-no-imprimir" data-accion="reintentar" data-fuente="todo" data-foco="reintentar-todo">Reintentar todo</button>'));
  if(desactualizado(e))av.push(aviso('atencion',`<strong>Datos posiblemente desactualizados.</strong> Última actualización: ${E(F.fechaHora(actualizado(e)))}.`,'<button type="button" class="btn tb-no-imprimir" data-accion="reintentar" data-fuente="todo" data-foco="actualizar-aviso">Actualizar ahora</button>'));
  const malos=cal.filter(c=>c.estado&&c.estado!=='COMPLETO'&&c.estado!=='CERO_CONFIRMADO');
  if(malos.length){const n=malos.some(c=>c.estado==='ERROR_LECTURA')?'critico':malos.some(c=>c.estado==='INCOMPLETO')?'atencion':'info';
   av.push(aviso(n,`<strong>Calidad de datos:</strong> ${malos.map(c=>`${E(c.obra??c.obra_nombre??c.obra_id)} — ${E((CALIDAD[c.estado]||{etiqueta:c.estado}).etiqueta)}`).join('; ')}. ${malos.some(c=>c.estado==='SIN_REGISTROS')?'«Sin registros» no equivale a cero confirmado. ':''}${malos.some(c=>c.estado!=='SIN_REGISTROS')?'Las cifras de esos centros pueden cambiar.':''}`));}
  const abiertos=arr(res.periodos_abiertos);
  if(res.provisional||abiertos.length)av.push(aviso('atencion',`<strong>Incluye periodos abiertos${abiertos.length?' ('+E(abiertos.map(x=>typeof x==='object'?(x.etiqueta||x.periodo):x).join(', '))+')':''}.</strong> Las cifras marcadas «Provisional» pueden cambiar al cerrar el periodo o al vincular pagos.`));
  const cmp=comparable(e);
  if(cmp&&cmp.incompleto&&comparar(filtros(e))!=='NINGUNO'){const m=arr(cmp.motivos).map(k=>MOTIVOS_COMPARABLE[k]||k);av.push(aviso('info',`<strong>Comparación parcial${cmp.desde?' contra '+E(F.rango(cmp.desde,cmp.hasta)):''}:</strong> ${E(m.length?m.join('; '):'el periodo comparable no está completo')}.`));}
  const ads=num(res.adscripcion_pendiente),adsCat=['contratistas','cuadrillas'].some(k=>opcionesCrudas(e,k).some(o=>o.valor===PENDIENTE_CLAVE));
  if(ads||adsCat)av.push(aviso('info',`<strong>${ads?E(F.entero(ads))+' '+(ads===1?'obligación':'obligaciones')+' con':'Hay obligaciones con'} «${E(ADSCRIPCION_PENDIENTE)}».</strong> No hay evidencia del contratista o la cuadrilla a la que pertenecían en su periodo: se agrupan aparte y no se asignan a ninguno.`));
  const rs=obj(alc.restringido);
  if(rs.obras_no_autorizadas||rs.prevision_social||rs.datos_internos)av.push(aviso('info',`<strong>Vista limitada por permisos.</strong> ${[rs.prevision_social?'No incluye previsión social.':'',rs.datos_internos?'No incluye datos internos.':'',rs.obras_no_autorizadas?E(F.entero(rs.obras_no_autorizadas))+' centros solicitados no están autorizados y se excluyeron.':''].filter(Boolean).join(' ')}`));
  if(res.vacio===true||(cal.length&&cal.every(c=>c.estado==='SIN_REGISTROS')))av.push(aviso('info','<strong>No hay registros para este alcance.</strong> Revisa la razón social, los centros, el rango o la perspectiva de fecha.','<button type="button" class="btn tb-no-imprimir" data-accion="restablecer" data-foco="restablecer-aviso">Restablecer filtros</button>'));
  return av.length?`<ul class="tb-avisos" aria-label="Avisos del tablero">${av.join('')}</ul>`:'';
 }

 /* ---------------- Encabezado, pestañas y definiciones para impresión ---------------- */
 function cabecera(r,vista){
  const e=r.estado,act=actualizado(e),viejo=desactualizado(e),f=filtros(e);
  const emp=opcionesCrudas(e,'empresas').find(o=>o.valor===String(f.empresa));
  return `<header class="tb-cab"><div class="tb-cab-tit"><h2 id="${r.pfx}-titulo" class="tb-titulo">Tablero ejecutivo</h2>
   <p class="tb-cab-sub">${E((emp&&emp.etiqueta)||f.empresa||'PLATINUM OS')} · ${E(vista.etiqueta)} — ${E(vista.descripcion)}</p></div>
   <div class="tb-cab-acc"><p class="tb-actualizado${viejo?' tb-actualizado--viejo':''}">${viejo?'<span class="tb-ico" aria-hidden="true">!</span> ':''}Actualizado: ${act?`<time datetime="${E(act)}">${E(F.fechaHora(act))}</time>`:'sin dato'}${viejo?' · puede estar desactualizado':''}</p>
    <div class="tb-cab-btns tb-no-imprimir"><button type="button" class="btn" data-accion="reintentar" data-fuente="todo" data-foco="actualizar">Actualizar</button>
    <button type="button" class="btn" data-accion="modo-tabla" aria-pressed="${!!r.ui.modoTabla}" data-foco="modo-tabla">Ver gráficas como tablas</button>
    <button type="button" class="btn" data-accion="imprimir" data-foco="imprimir">Imprimir / PDF</button>
    <button type="button" class="btn dark" data-accion="exportar" data-formato="xlsx" data-foco="exportar">Exportar Excel</button></div></div></header>`;
 }
 function pestanas(r,vista){
  return `<div class="tb-pestanas tb-no-imprimir" role="tablist" aria-label="Vistas del tablero">${VISTAS.map(v=>`<button type="button" role="tab" id="${r.pfx}-tab-${v.clave}" aria-selected="${v.clave===vista.clave}" aria-controls="${r.pfx}-panel" tabindex="${v.clave===vista.clave?0:-1}" data-accion="vista" data-vista="${v.clave}" data-foco="tab-${v.clave}">${E(v.etiqueta)}</button>`).join('')}</div>`;
 }
 function definicionesImpresion(r,vista){
  const e=r.estado;
  return `<section class="tb-solo-impresion tb-defs-imp" aria-label="Definiciones para impresión"><h3 class="tb-sec-t">Definiciones</h3><dl>
   ${clavesKpi(e,vista).map(k=>{const m=medida(e,k);return `<dt>${E(m.etiqueta)} (${E(UNIDADES[m.unidad]||m.unidad)})</dt><dd>${E(m.definicion)}${m.formula?' Fórmula: '+E(m.formula)+'.':''}</dd>`;}).join('')}
   ${Object.values(PERSPECTIVAS).map(p=>`<dt>${E(p.etiqueta)}</dt><dd>${E(p.texto)}</dd>`).join('')}
   ${Object.values(CALIDAD).map(c=>`<dt>${E(c.etiqueta)}</dt><dd>${E(c.texto)}</dd>`).join('')}
   <dt>${E(ADSCRIPCION_PENDIENTE)}</dt><dd>No hay evidencia del contratista o la cuadrilla histórica de la obligación; se agrupa aparte y no se asigna a ninguno.</dd>
   <dt>Provisional</dt><dd>El periodo sigue abierto o tiene pagos por vincular; la cifra puede cambiar.</dd><dt>No disponible</dt><dd>La medida no puede calcularse (por ejemplo, denominador vacío o fuente sin base de cálculo).</dd></dl>
   <p class="tb-mut">Impreso desde PLATINUM OS · Actualizado: ${E(F.fechaHora(actualizado(e)))}</p></section>`;
 }
 function pintarTodo(r){
  const e=r.estado,vista=vistaDe(e.vista);r.vista=vista;r.graf={};
  return cabecera(r,vista)+filtrosHtml(r)+alcanceHtml(r)+avisosHtml(r)+pestanas(r,vista)
   +`<div class="tb-panel" role="tabpanel" id="${r.pfx}-panel" aria-labelledby="${r.pfx}-tab-${vista.clave}">`
   +`<p class="tb-solo-impresion tb-imp-vista">Vista: ${E(vista.etiqueta)}</p>`
   +indicadores(r,vista)
   +`<section class="tb-sec" aria-labelledby="${r.pfx}-graf-t"><h3 id="${r.pfx}-graf-t" class="tb-sec-t">Tendencia y comparaciones</h3><div class="tb-graficas">${vista.graficas.map(g=>graficaDe(r,g)).join('')}</div></section>`
   +vista.tablas.map(t=>t==='excepciones'?tablaExcepciones(r):t==='detalle'?tablaDetalle(r):t==='calidad'?tablaCalidad(r):'').join('')
   +`</div>`+definicionesImpresion(r,vista);
 }
 function textoAnuncio(r){
  const e=r.estado;
  if(algoCargando(e))return 'Cargando resultados del tablero…';
  const p=[`Vista ${r.vista.etiqueta}`],{d}=fuenteDetalle(r);
  if(d&&num(d.total)!==null)p.push(`${F.entero(d.total)} filas de detalle`);
  if(e.excepciones&&num(e.excepciones.total)!==null&&r.vista.tablas.includes('excepciones'))p.push(`${F.entero(e.excepciones.total)} excepciones`);
  const errs=Object.keys(FUENTES).filter(k=>errorDe(e,k));
  return `Resultados actualizados. ${p.join(', ')}.`+(errs.length?` Con error: ${errs.map(k=>FUENTES[k]).join(', ')}.`:'');
 }

 /* ---------------- Ciclo de pintura y eventos ---------------- */
 const REG=new WeakMap();let SEQ=0;
 function registro(host){
  let r=REG.get(host);
  if(!r){r={pfx:'tb'+(++SEQ),ui:{defs:{},alts:{},ms:null,msSel:{},msBusca:{},mas:null,modoTabla:false,errorFecha:null},graf:{},estado:{},acciones:{},anuncio:'',raiz:null,vivo:null,cuerpo:null,tip:null,vista:VISTAS[0]};REG.set(host,r);enlazar(host,r);}
  return r;
 }
 const cssEsc=s=>String(s).replace(/["\\]/g,'\\$&');
 function claveFoco(host){const d=host.ownerDocument;const a=d&&d.activeElement;return a&&a!==d.body&&host.contains(a)&&a.getAttribute?a.getAttribute('data-foco'):null;}
 function enfocar(host,k){if(!k)return false;const el=host.querySelector(`[data-foco="${cssEsc(k)}"]`);if(el&&typeof el.focus==='function'){try{el.focus({preventScroll:true});}catch(e){el.focus();}return true;}return false;}
 function render(host,estado,acciones){
  if(!host||!host.ownerDocument)throw Error('PLATINUM_TABLERO_VISTA.render necesita un contenedor del documento.');
  const r=registro(host);r.estado=estado||{};r.acciones=acciones||{};
  const foco=claveFoco(host);
  r.ancho=host.clientWidth||0;r.cubeta=Math.round(r.ancho/80);
  if(!r.raiz||r.raiz.parentNode!==host){
   host.innerHTML=`<section class="tb" data-tablero-vista="${VERSION}"><div class="tb-sr" role="status" aria-live="polite" aria-atomic="true"></div><div class="tb-cuerpo"></div></section>`;
   r.raiz=host.querySelector('.tb');r.vivo=r.raiz.querySelector('[role="status"]');r.cuerpo=r.raiz.querySelector('.tb-cuerpo');
  }
  r.raiz.setAttribute('aria-labelledby',`${r.pfx}-titulo`);
  r.raiz.setAttribute('data-vista',vistaDe(r.estado.vista).clave);
  r.cuerpo.innerHTML=pintarTodo(r);
  r.tip=null;
  if(foco)enfocar(host,foco);
  const t=textoAnuncio(r);if(t!==r.anuncio){r.anuncio=t;r.vivo.textContent=t;}
  return {anuncio:r.anuncio,vista:r.vista.clave};
 }
 const repintar=(host,r)=>render(host,r.estado,r.acciones);
 function emitir(r,nombre,...args){const f=r.acciones&&r.acciones[nombre];if(typeof f==='function'){try{return f(...args);}catch(err){if(typeof console!=='undefined')console.error('Tablero: la acción '+nombre+' falló',err);}}return undefined;}
 function filaDe(r,fuente,i){const d=fuente==='plantilla'?(r.estado.plantilla||{}).eventos:r.estado[fuente];const n=Number(i);return d&&Number.isInteger(n)?arr(d.filas)[n]||null:null;}
 /* Emite cambiarVista; si el integrador no repinta de inmediato, la vista
    cambia localmente con el mismo estado (todas las vistas leen el mismo estado). */
 function irVista(host,r,v){if(!VISTAS.some(x=>x.clave===v))return;emitir(r,'cambiarVista',v);if(vistaDe(r.estado.vista).clave!==v)render(host,{...r.estado,vista:v},r.acciones);enfocar(host,'tab-'+v);}
 function cerrarMs(host,r,enfocarBoton){const k=r.ui.ms;if(!k)return;r.ui.ms=null;delete r.ui.msSel[k];delete r.ui.msBusca[k];repintar(host,r);if(enfocarBoton)enfocar(host,'ms-'+k);}
 function filtrarLista(panel,texto){
  let n=0;const q=norm(texto);
  panel.querySelectorAll('li[data-texto]').forEach(li=>{const ve=!q||li.getAttribute('data-texto').includes(q);if(ve){li.removeAttribute('hidden');n++;}else li.setAttribute('hidden','');});
  const v=panel.querySelector('.tb-ms-vacio');if(v){if(n)v.setAttribute('hidden','');else v.removeAttribute('hidden');}
 }
 function alternar(host,boton,id,abierto){const c=host.querySelector('#'+id.replace(/[^\w-]/g,''));boton.setAttribute('aria-expanded',String(abierto));if(c){if(abierto)c.removeAttribute('hidden');else c.setAttribute('hidden','');}}
 function enlazar(host,r){
  host.addEventListener('submit',ev=>ev.preventDefault());
  host.addEventListener('click',ev=>{
   const t=ev.target,b=t&&t.closest?t.closest('[data-accion]'):null;
   if(r.ui.ms&&!(t&&t.closest&&t.closest('.tb-ms'))){cerrarMs(host,r,false);if(!b)return;}
   if(!b||!host.contains(b))return;
   const a=b.getAttribute('data-accion'),d=k=>b.getAttribute('data-'+k);
   if(b.getAttribute('aria-disabled')==='true'){ev.preventDefault();return;}
   const fila=()=>filaDe(r,d('fuente'),d('i')),vista=()=>vistaDe(r.estado.vista).clave;
   switch(a){
    case 'vista':irVista(host,r,d('vista'));break;
    case 'detalle':{const ctx={origen:d('origen')||'tabla',vista:vista(),filtros:filtros(r.estado)};
     if(d('dim')){ctx.dimension=d('dim');ctx.valor=d('valor');ctx.etiqueta=d('etq');}
     const f=fila();if(f)ctx.fila=f;emitir(r,'abrirDetalle',d('clave')||(f?claveFila(f):''),ctx);break;}
    case 'trabajador':emitir(r,'abrirTrabajador',d('id'),fila());break;
    case 'cierre':emitir(r,'abrirCierre',d('id'),fila());break;
    case 'pago':emitir(r,'abrirPago',d('id'),fila());break;
    case 'evidencia':emitir(r,'abrirEvidencia',d('id'),fila());break;
    case 'obligacion':if(typeof r.acciones.abrirObligacion==='function')emitir(r,'abrirObligacion',d('id'),fila());else emitir(r,'abrirDetalle','obligacion',{origen:d('fuente'),tipo:'OBLIGACION',id:d('id'),fila:fila(),vista:vista()});break;
    case 'reintentar':emitir(r,'reintentar',d('fuente')||'todo');break;
    case 'exportar':emitir(r,'exportar',d('formato')||'xlsx',{vista:vista(),filtros:filtros(r.estado),alcance:alcanceTexto(r.estado)});break;
    case 'imprimir':if(typeof r.acciones.imprimir==='function')emitir(r,'imprimir');else imprimir();break;
    case 'restablecer':r.ui.errorFecha=null;emitir(r,'restablecer');break;
    case 'quitar-filtro':{const k=d('filtro'),v=d('valor');emitir(r,'cambiarFiltros',{[k]:seleccion(r.estado,k).filter(x=>x!==v)});break;}
    case 'definicion':{const k=d('clave');r.ui.defs[k]=!r.ui.defs[k];alternar(host,b,b.getAttribute('aria-controls'),r.ui.defs[k]);break;}
    case 'alt':{const k=d('graf');r.ui.alts[k]=b.getAttribute('aria-expanded')!=='true';alternar(host,b,b.getAttribute('aria-controls'),r.ui.alts[k]);b.textContent=r.ui.alts[k]?'Ocultar tabla de datos':'Ver tabla de datos';break;}
    case 'modo-tabla':r.ui.modoTabla=!r.ui.modoTabla;r.ui.alts={};repintar(host,r);enfocar(host,'modo-tabla');break;
    case 'mas-filtros':r.ui.mas=b.getAttribute('aria-expanded')!=='true';repintar(host,r);enfocar(host,'mas-filtros');break;
    case 'ms-abrir':{const k=d('filtro');if(r.ui.ms===k){cerrarMs(host,r,true);break;}r.ui.ms=k;r.ui.msSel[k]=seleccion(r.estado,k);r.ui.msBusca[k]='';repintar(host,r);enfocar(host,'ms-buscar-'+k);break;}
    case 'ms-todos':{const k=d('filtro'),panel=b.closest('.tb-ms'),set=new Set(arr(r.ui.msSel[k]));panel.querySelectorAll('li[data-texto]:not([hidden]) input[type="checkbox"]').forEach(i=>set.add(i.value));r.ui.msSel[k]=[...set];repintar(host,r);enfocar(host,'ms-todos-'+k);break;}
    case 'ms-ninguno':{const k=d('filtro');r.ui.msSel[k]=[];repintar(host,r);enfocar(host,'ms-ninguno-'+k);break;}
    case 'ms-cancelar':cerrarMs(host,r,true);break;
    case 'ms-aplicar':{const k=d('filtro'),v=arr(r.ui.msSel[k]).slice();cerrarMs(host,r,true);emitir(r,'cambiarFiltros',{[k]:v});break;}
    case 'pagina':{const fuente=d('fuente'),n=Number(d('pagina'));if(typeof r.acciones.paginar==='function')emitir(r,'paginar',fuente,n);else emitir(r,'cambiarFiltros',{paginas:{[fuente]:n}});break;}
   }
  });
  host.addEventListener('change',ev=>{
   const t=ev.target;if(!t||!t.getAttribute)return;const a=t.getAttribute('data-accion'),k=t.getAttribute('data-filtro');
   if(a==='ms-marcar'){const set=new Set(arr(r.ui.msSel[k]));if(t.checked)set.add(t.value);else set.delete(t.value);r.ui.msSel[k]=[...set];
    const c=host.querySelector(`[data-ms-cuenta="${cssEsc(k)}"]`);if(c)c.textContent=set.size?F.entero(set.size)+' marcados':'Sin marcas = todos';return;}
   if(a!=='filtro')return;
   const v=t.value;
   if(k==='empresa')emitir(r,'cambiarFiltros',{empresa:v,obras:[]});
   else if(k==='perspectiva'){if(t.checked!==false)emitir(r,'cambiarFiltros',{perspectiva:v});}
   else if(k==='tipo_periodo'){r.ui.errorFecha=null;emitir(r,'cambiarFiltros',{tipo_periodo:v});}
   else if(k==='comparar')emitir(r,'cambiarFiltros',{comparar:v==='NINGUNO'?null:v});
   else if(k==='desde'||k==='hasta'){
    const f=filtros(r.estado),alc=(r.estado.resumen&&r.estado.resumen.alcance)||{};
    const desde=k==='desde'?v:(f.desde||alc.desde),hasta=k==='hasta'?v:(f.hasta||alc.hasta);
    if(v&&!/^\d{4}-\d\d-\d\d$/.test(v)){r.ui.errorFecha='Escribe una fecha válida (día, mes y año).';repintar(host,r);enfocar(host,'f-'+k);return;}
    if(desde&&hasta&&desde>hasta){r.ui.errorFecha='La fecha «Desde» no puede ser posterior a «Hasta».';repintar(host,r);enfocar(host,'f-'+k);return;}
    r.ui.errorFecha=null;emitir(r,'cambiarFiltros',{tipo_periodo:'PERSONALIZADO',[k]:v||null});
   }
  });
  host.addEventListener('input',ev=>{const t=ev.target;if(t&&t.getAttribute&&t.getAttribute('data-accion')==='ms-buscar'){const k=t.getAttribute('data-filtro');r.ui.msBusca[k]=t.value;const p=t.closest('.tb-ms-panel');if(p)filtrarLista(p,t.value);}});
  host.addEventListener('keydown',ev=>{
   const t=ev.target;if(!t||!t.closest)return;const key=ev.key;
   if(key==='Escape'&&r.ui.ms&&t.closest('.tb-ms')){ev.preventDefault();cerrarMs(host,r,true);return;}
   if(key==='Enter'&&t.getAttribute&&t.getAttribute('data-accion')==='ms-buscar'){ev.preventDefault();return;}
   if(t.getAttribute&&t.getAttribute('role')==='tab'&&['ArrowRight','ArrowLeft','Home','End'].includes(key)){
    ev.preventDefault();const i=VISTAS.findIndex(v=>v.clave===t.getAttribute('data-vista'));
    const j=key==='Home'?0:key==='End'?VISTAS.length-1:(i+(key==='ArrowRight'?1:-1)+VISTAS.length)%VISTAS.length;
    irVista(host,r,VISTAS[j].clave);return;}
   const l=t.closest('.tb-lienzo');
   if(l&&t===l){const g=r.graf[l.getAttribute('data-graf')];if(!g)return;let i=r.tip&&r.tip.gid===l.getAttribute('data-graf')?r.tip.i:-1;
    if(key==='ArrowRight')i=Math.min(g.n-1,i+1);else if(key==='ArrowLeft')i=i<0?g.n-1:Math.max(0,i-1);else if(key==='Home')i=0;else if(key==='End')i=g.n-1;
    else if(key==='Enter'&&i>=0){const p=g.puntos[i];emitir(r,'abrirDetalle',g.clave,{origen:'tendencia',vista:vistaDe(r.estado.vista).clave,dimension:'periodo',valor:p.clave,etiqueta:p.titulo||p.etiqueta,desde:p.desde,hasta:p.hasta,filtros:filtros(r.estado)});return;}
    else if(key==='Escape'){ocultarTip(r);return;}else return;
    ev.preventDefault();mostrarTip(r,l,i);}
  });
  host.addEventListener('pointermove',ev=>{const t=ev.target,l=t&&t.closest?t.closest('.tb-lienzo'):null;if(!l){if(r.tip)ocultarTip(r);return;}
   const g=r.graf[l.getAttribute('data-graf')],svg=l.querySelector('svg');if(!g||!svg||!svg.getBoundingClientRect)return;const rc=svg.getBoundingClientRect();if(!rc.width)return;
   const sx=(ev.clientX-rc.left)/rc.width*g.W,i=g.n===1?0:Math.round((sx-g.ml)/(g.iw/(g.n-1)));mostrarTip(r,l,Math.max(0,Math.min(g.n-1,i)));});
  host.addEventListener('pointerleave',()=>ocultarTip(r));
  host.addEventListener('focusout',ev=>{const t=ev.target;if(t&&t.classList&&t.classList.contains('tb-lienzo'))ocultarTip(r);});
  /* Las gráficas de línea se dibujan a la escala real del contenedor (texto
     legible en monitores grandes y en celular); se repintan al cambiar el ancho. */
  if(typeof G.ResizeObserver==='function'){let pend=false;
   new G.ResizeObserver(()=>{if(pend||!r.raiz||Math.round((host.clientWidth||0)/80)===r.cubeta)return;pend=true;
    (G.requestAnimationFrame||setTimeout)(()=>{pend=false;if(r.raiz&&r.raiz.parentNode===host&&Math.round((host.clientWidth||0)/80)!==r.cubeta)repintar(host,r);});}).observe(host);}
 }
 function mostrarTip(r,l,i){
  const gid=l.getAttribute('data-graf'),g=r.graf[gid];if(!g||i<0)return;
  const p=g.puntos[i],tip=l.querySelector('.tb-tip'),cruz=l.querySelector('.tb-cruz'),doc=l.ownerDocument;if(!tip||!p)return;
  const x=g.ml+(g.n===1?g.iw/2:i*g.iw/(g.n-1));
  if(cruz){cruz.setAttribute('x1',x.toFixed(1));cruz.setAttribute('x2',x.toFixed(1));cruz.setAttribute('visibility','visible');}
  tip.textContent='';
  const h=doc.createElement('div');h.className='tb-tip-t';h.textContent=(p.titulo||p.etiqueta)+(p.desde?' · '+F.rango(p.desde,p.hasta):'')+(p.provisional?' · Provisional':'');tip.appendChild(h);
  g.series.forEach(s=>{const fila=doc.createElement('div');fila.className='tb-tip-f';const k=doc.createElement('span');k.className='tb-tip-k';k.setAttribute('style',`background:var(${s.color})`);
   const v=doc.createElement('strong');v.textContent=F.valor(p.valores[s.clave],g.unidad);const n=doc.createElement('span');n.textContent=s.etiqueta;fila.appendChild(k);fila.appendChild(v);fila.appendChild(n);tip.appendChild(fila);});
  tip.removeAttribute('hidden');
  const svg=l.querySelector('svg');
  if(svg&&svg.getBoundingClientRect&&l.getBoundingClientRect){const rc=svg.getBoundingClientRect(),lr=l.getBoundingClientRect();
   if(rc.width){const px=x/g.W*rc.width+rc.left-lr.left+(l.scrollLeft||0),tw=tip.offsetWidth||220,lw=Math.max(l.scrollWidth||0,l.clientWidth||0);
    tip.style.left=Math.max(4,px+tw+16>lw?px-tw-12:px+12)+'px';}}
  r.tip={gid,i};
 }
 function ocultarTip(r){if(!r.tip||!r.raiz)return;const l=r.raiz.querySelector(`.tb-lienzo[data-graf="${cssEsc(r.tip.gid)}"]`);if(l){const tip=l.querySelector('.tb-tip'),c=l.querySelector('.tb-cruz');if(tip)tip.setAttribute('hidden','');if(c)c.setAttribute('visibility','hidden');}r.tip=null;}

 /* Impresión limpia: sólo el tablero, con alcance aplicado y definiciones. */
 function imprimir(){
  const d=G.document;if(!d||typeof G.print!=='function')return;
  d.documentElement.classList.add('tb-imprimir');
  const fin=()=>{d.documentElement.classList.remove('tb-imprimir');if(G.removeEventListener)G.removeEventListener('afterprint',fin);};
  if(G.addEventListener)G.addEventListener('afterprint',fin);
  try{G.print();}finally{if(!G.addEventListener)fin();}
 }
 if(G.addEventListener&&G.document){
  G.addEventListener('beforeprint',()=>{if(G.document.querySelector('.tb'))G.document.documentElement.classList.add('tb-imprimir');});
  G.addEventListener('afterprint',()=>G.document.documentElement.classList.remove('tb-imprimir'));
 }

 /* Panel de detalle reutilizable (drill-through): A5 lo pinta dentro de su
    modal; abre trabajador, obligación, cierre, pago y evidencia autorizada. */
 function pintarDetalle(contenedor,o,acciones){
  const f=o.fila||{},campos=arr(o.campos).length?o.campos:Object.keys(f).filter(k=>!/_id$|^clave$|^llaves$/.test(k)&&(f[k]===null||typeof f[k]!=='object')).map(k=>({clave:k,etiqueta:k.replace(/_/g,' ')}));
  const dl=campos.map(c=>{const v=f[c.clave];const t=c.tipo&&celdaTipo[c.tipo]?celdaTipo[c.tipo](v):(c.clave==='cuadrilla'&&cuadrillaPendiente(f))||(c.clave==='contratista'&&contratistaPendiente(f))?ADSCRIPCION_PENDIENTE:v??'—';
   return `<div class="tb-dl-f"><dt>${E(c.etiqueta)}</dt><dd${c.tipo&&esNum(c.tipo)?' class="tb-num"':''}>${E(t)}</dd></div>`;}).join('');
  contenedor.innerHTML=`<section class="tb tb-detalle" aria-label="${E(o.titulo||'Detalle')}">${o.titulo?`<h3 class="tb-sec-t">${E(o.titulo)}</h3>`:''}<dl class="tb-dl">${dl}</dl>${enlacesFila('detalle-panel',f,0,true)}</section>`;
  const reg={acciones:acciones||{}};
  contenedor.onclick=ev=>{const b=ev.target&&ev.target.closest?ev.target.closest('[data-accion]'):null;if(!b)return;const id=b.getAttribute('data-id'),a=b.getAttribute('data-accion');
   const m={trabajador:'abrirTrabajador',cierre:'abrirCierre',pago:'abrirPago',evidencia:'abrirEvidencia'}[a];
   if(m)emitir(reg,m,id,f);else if(a==='obligacion'){if(typeof reg.acciones.abrirObligacion==='function')emitir(reg,'abrirObligacion',id,f);else emitir(reg,'abrirDetalle','obligacion',{tipo:'OBLIGACION',id,fila:f,origen:'detalle'});}};
  return contenedor;
 }

 G.PLATINUM_TABLERO_VISTA=Object.freeze({
  version:VERSION,css:'assets/platinum-tablero.css',
  render,pintarDetalle,imprimir,
  VISTAS:VISTAS.map(v=>({...v})),MEDIDAS,CALIDAD,PERSPECTIVAS,PRESETS,COMPARAR,FILTROS:ETQ_FILTRO,FUENTES,ADSCRIPCION_PENDIENTE,TIPOS_EXCEPCION,SERIES,
  formatos:F,
  etiqueta:clave=>(MEDIDAS[clave]||{}).etiqueta||clave,
  definicion:clave=>{const m=MEDIDAS[clave]||{};const mod=modeloDef(clave);return {etiqueta:m.etiqueta||clave,definicion:mod.definicion||m.definicion||'',formula:mod.formula||m.formula||'',unidad:m.unidad||'MXN'};},
  medida:(estado,clave)=>medida(estado||{},clave),
  alcanceTexto:estado=>alcanceTexto(estado||{}),
  claveFila,
  pintar:{
   indicador:(estado,clave)=>kpiHtml({pfx:'tbx',ui:{defs:{}},estado:estado||{}},medida(estado||{},clave)),
   tabla:tablaHtml,insignia,insigniaCalidad,error:bloqueError,vacio:bloqueVacio,esqueleto,leyenda
  }
 });
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null));
