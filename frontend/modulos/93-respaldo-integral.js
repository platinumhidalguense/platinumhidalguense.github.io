/* ---------- RESPALDO INTEGRAL (RESPALDO_INTEGRAL_V1) ----------
   Respaldo completo por razón social y centro. Es independiente de la
   exportación filtrada del tablero: no aplica filtros de fecha ni de vista.
   - Lee cada fuente autorizada con paginación completa, reintentos y
     verificación de duplicados; nunca corta en silencio.
   - Toma marcas de consistencia del servidor (control_respaldo MARCAS) antes
     y después de leer; si una tabla cambió, la vuelve a leer y, si persiste,
     el respaldo queda INCOMPLETO con el motivo visible.
   - Los permisos los resuelve el servidor (registrado, centro, razón social,
     VIP, salud, administrador). Un usuario restringido obtiene archivo y
     conteos con su mismo alcance.
   - Libro con hojas por dominio relacionadas por IDs estables, más
     MANIFIESTO, DICCIONARIO, CONTROL y, si hace falta, TEXTOS_LARGOS.
   - IDs, CURP, RFC, NSS, CLABE, cuentas, folios y códigos van como texto (@);
     ∅ NULL distingue nulo de vacío y de cero; ninguna cadena se evalúa como
     fórmula. Los originales de documentos permanecen en Storage privado. */
(function(root){
 'use strict';
 const FORMATO='RESPALDO_INTEGRAL_V1',VERSION_EXPORTADOR='2026-11-11.1';
 const NULO='∅ NULL',MARCA='∅',LIM_CELDA=32767,TROZO=30000,LIM_FILAS_EXCEL=1048576,PAGINA=1000;
 const PRESUPUESTO_CARACTERES=90e6; // por archivo; arriba de esto se divide en partes verificables
 const RPC='control_respaldo';
 const DOMINIOS={ESTRUCTURA:'Centros, contratistas, cuadrillas y catálogos',PADRON:'Padrón y datos personales',MOVIMIENTOS:'Relación laboral y movimientos',
  SALARIOS:'Salarios y perfiles',INCIDENCIAS:'Incidencias y prestaciones',AGUINALDO:'Aguinaldo',BAJAS:'Bajas y finiquitos',NOMINA:'Nómina y cierres',
  PAGOS:'Obligaciones y pagos',CHEQUES:'Cheques',EXPEDIENTE:'Expediente y cumplimiento',IMSS:'IMSS y créditos',AUDITORIA:'Auditoría',
  CONFIGURACION:'Configuración (selección explícita)',CONTROL:'Control del respaldo'};
 /* Catálogo de fuentes. clave = nombre usado por el servidor en MARCAS/LEER.
    alcance: centros | obra | obra_o_global | empresa | global | padre | interna.
    permiso: vip | salud | admin | admin_vip | vip_salud (lo confirma el servidor). */
 const P=(clave,tabla,hoja,dominio,alcance,x={})=>Object.freeze({clave,tabla,hoja,dominio,alcance,pk:x.pk||['id'],orden:x.orden||x.pk||['id'],...x});
 const FUENTES=Object.freeze([
  P('obras','obras','CENTROS','ESTRUCTURA','centros',{precision:['prima_rt'],desc:'Centros de trabajo de la razón social, activos e inactivos.'}),
  P('contratistas','contratistas','CONTRATISTAS','ESTRUCTURA','obra_o_global',{desc:'Contratistas y registro REPSE. Los globales (sin centro) sólo con acceso VIP.'}),
  P('cuadrillas','cuadrillas','CUADRILLAS','ESTRUCTURA','obra',{rel:{lider_id:'PADRON',lider_expediente_id:'EXPEDIENTES_PEND'},desc:'Cuadrillas por centro y contratista, activas e inactivas.'}),
  P('catalogo_incidencias','catalogo_incidencias','CAT_INCIDENCIAS','ESTRUCTURA','global',{desc:'Catálogo de incidencias del calendario.'}),
  P('catalogo_percepciones_extra','catalogo_percepciones_extra','CAT_PERCEPCIONES','ESTRUCTURA','global',{desc:'Catálogo de percepciones extraordinarias.'}),
  P('puesto_sinonimos','puesto_sinonimos','CAT_PUESTOS','ESTRUCTURA','global',{pk:['variante'],desc:'Normalización de puestos.'}),
  P('control_puestos_catalogo','control_puestos_catalogo','CAT_PUESTOS_CLAVE','ESTRUCTURA','global',{pk:['clave'],desc:'Catálogo de puestos por clave.'}),
  P('control_puestos_equivalencias','control_puestos_equivalencias','CAT_PUESTOS_EQUIV','ESTRUCTURA','global',{pk:['empresa','variante','especialidad'],desc:'Equivalencias de puesto por razón social.'}),
  P('trabajadores','trabajadores','PADRON','PADRON','obra',{precision:['sd','sdi','sal_semanal','prima_rt','monto_finiquito','benef_porcentaje'],totales:['sal_semanal'],
   filtro:(q,c)=>c.permisos.admin?q:q.eq('eliminado',false),rel:{id_cuadrilla:'CUADRILLAS'},
   desc:'Padrón: identidad, contacto, domicilio, beneficiarios, puesto, periodicidad, forma de pago y fecha_reingreso vigente. Papelera sólo administrador.'}),
  P('sueldos_internos','sueldos_internos','SUELDOS_INTERNOS','SALARIOS','obra',{permiso:'vip',pk:['trabajador_id'],precision:['sueldo_imss','sueldo_real'],totales:['sueldo_imss','sueldo_real'],desc:'Control interno salarial (sólo VIP).'}),
  P('diferenciales','diferenciales','DIFERENCIALES','SALARIOS','obra',{precision:['monto'],totales:['monto'],desc:'Diferenciales salariales por semana.'}),
  P('control_movimientos_seguridad_social','control_movimientos_seguridad_social','MOVIMIENTOS_IMSS','MOVIMIENTOS','obra',{desc:'Movimientos afiliatorios IMSS con fecha efectiva, estado y evidencia.'}),
  P('control_altas_bajas_cortas','control_altas_bajas_cortas','ALTAS_BAJAS_CORTAS','MOVIMIENTOS','obra',{precision:['neto_noi','faltas_modelo_noi','dias_pagados_noi'],desc:'Altas y bajas en la misma semana con sus fuentes.'}),
  P('control_expedientes_pendientes','control_expedientes_pendientes','EXPEDIENTES_PEND','MOVIMIENTOS','obra',{desc:'Expedientes pendientes de entregar.'}),
  P('control_reversiones_baja','control_reversiones_baja','REVERSIONES_BAJA','MOVIMIENTOS','obra',{rel:{historial_id:'HISTORIAL'},desc:'Bajas revertidas: evento de historial revertido, antes, restauración, efectos y resultado. El historial crudo no se altera.'}),
  P('rrhh_plantillas','rrhh_plantillas','RRHH_PLANTILLAS','MOVIMIENTOS','global',{desc:'Plantillas versionadas de procesos de RRHH.'}),
  P('rrhh_procesos','rrhh_procesos','RRHH_PROCESOS','MOVIMIENTOS','obra',{rel:{plantilla_id:'RRHH_PLANTILLAS'},desc:'Procesos de RRHH (alta, baja, etc.). Incapacidades sólo con permiso de salud.'}),
  P('rrhh_tareas','rrhh_tareas','RRHH_TAREAS','MOVIMIENTOS','obra',{rel:{proceso_id:'RRHH_PROCESOS'},desc:'Tareas de cada proceso con su comprobación.'}),
  P('rrhh_eventos','rrhh_eventos','RRHH_EVENTOS','MOVIMIENTOS','obra',{rel:{proceso_id:'RRHH_PROCESOS',tarea_id:'RRHH_TAREAS'},desc:'Bitácora de procesos de RRHH.'}),
  P('descuentos','descuentos','DESCUENTOS','INCIDENCIAS','obra',{precision:['monto','cuota_mensual','factor'],totales:['monto'],rel:{calendario_evento_id:'INCIDENCIAS'},
   desc:'Descuentos y créditos (INFONAVIT, FONACOT, faltas, incidencias) con origen, aplicación, vigencia y ajustes; activos e inactivos.'}),
  P('incidencias_empleados','incidencias_empleados','INCIDENCIAS','INCIDENCIAS','obra',{precision:['monto_valor'],totales:['monto_valor'],
   rel:{empleado_id:'PADRON',id_incidencia:'CAT_INCIDENCIAS',percepcion_id:'CAT_PERCEPCIONES',prestamo_id:'PRESTAMOS',credito_id:'DESCUENTOS',descuento_id:'DESCUENTOS'},
   desc:'Calendario de incidencias: faltas, permisos, incapacidades, percepciones extraordinarias y préstamos. Lo que no es ausentismo requiere permiso de salud.'}),
  P('prestamos_empleados','prestamos_empleados','PRESTAMOS','INCIDENCIAS','obra',{totales:['monto_inicial'],rel:{empleado_id:'PADRON'},desc:'Préstamos sin intereses.'}),
  P('vacaciones','vacaciones','VACACIONES','INCIDENCIAS','obra',{desc:'Vacaciones y permisos, activos e inactivos.'}),
  P('prima_pagos','prima_pagos','PRIMAS','INCIDENCIAS','obra',{totales:['monto'],desc:'Pagos de prima vacacional.'}),
  P('actas','actas','ACTAS','INCIDENCIAS','obra',{desc:'Actas administrativas.'}),
  P('nom035','nom035','NOM035','INCIDENCIAS','obra',{permiso:'salud',desc:'Evaluaciones NOM-035 (dato sensible: sólo con permiso de salud).'}),
  P('control_faltas_historicas','control_faltas_historicas','FALTAS_HISTORICAS','INCIDENCIAS','obra',{precision:['total_acreditado','digitales_al_registrar'],rel:{anterior_id:'FALTAS_HISTORICAS'},desc:'Faltas históricas: todas las versiones (vigentes, sustituidas y revertidas).'}),
  P('control_isr_ajustes_quincenales','control_isr_ajustes_quincenales','ISR_QUINCENAL','INCIDENCIAS','obra',{desc:'Ajustes ISR mensual/quincenal con entradas y resultado.'}),
  P('control_aguinaldo_lineas','control_aguinaldo_lineas','AGUINALDO_LINEAS','AGUINALDO','obra',{precision:['salario_base','dias_pactados','dias_computables','bruto_causado','acreditado_previo','bruto','exento','gravado','isr','neto','uma','exento_usado'],
   totales:['bruto','isr','neto'],rel:{lote_id:'AGUINALDO_LOTES'},desc:'Líneas de aguinaldo con desglose; aplicadas y retiradas.'}),
  P('control_aguinaldo_lotes','control_aguinaldo_lotes','AGUINALDO_LOTES','AGUINALDO','padre',{padre:{fuente:'control_aguinaldo_lineas',campo:'lote_id',destino:'id'},totales:['total_bruto','total_isr','total_neto'],desc:'Lotes de aplicación de aguinaldo.'}),
  P('control_aguinaldo_conciliaciones','control_aguinaldo_conciliaciones','AGUINALDO_CONCILIACION','AGUINALDO','obra',{totales:['importe_bruto'],rel:{anterior_id:'AGUINALDO_CONCILIACION'},desc:'Conciliación de aguinaldo de bajas: versiones, fuente y respaldo.'}),
  P('prestaciones_papeles','prestaciones_papeles','PAPELES_PRESTACIONES','BAJAS','obra',{rel:{anterior_id:'PAPELES_PRESTACIONES'},desc:'Papeles de prestaciones/finiquito: revisiones, entradas, resultado, D001 y huellas.'}),
  P('prestaciones_archivos_historicos','prestaciones_archivos_historicos','PRESTACIONES_HIST','BAJAS','obra',{desc:'Contenido histórico leído de archivos de prestaciones.'}),
  P('prestaciones_fuentes_historicas','prestaciones_fuentes_historicas','PRESTACIONES_FUENTES','BAJAS','obra',{pk:['obra_id','sha256'],select:'obra_id,sha256,archivo,created_at',omitidos:{contenido_base64:'Archivo original: permanece en la base privada; no se incrusta.'},desc:'Metadatos de archivos fuente de prestaciones.'}),
  P('control_finiquitos_transferencia','control_finiquitos_transferencia','FINIQUITOS_TRANSF','BAJAS','obra',{totales:['importe'],rel:{pago_id:'PAGOS',cheque_id:'CHEQUES'},desc:'Finiquitos pagados por transferencia.'}),
  P('auditoria_calculos_nomina','auditoria_calculos_nomina','AUDITORIA_CALCULOS','BAJAS','obra',{precision:['monto_modelo','monto_aplicado','ajuste_noi'],totales:['monto_aplicado'],desc:'Auditoría de cálculos (finiquitos, proyección, exportaciones) con entradas, resultado, ajuste NOI y huella.'}),
  P('constancias_laborales','constancias_laborales','CONSTANCIAS','BAJAS','obra',{desc:'Constancias laborales emitidas con su fotografía.'}),
  P('bajas_operaciones','(interna)','BAJAS_OPERACIONES','BAJAS','interna',{permiso:'vip',desc:'Operaciones de baja firmadas (interna; sólo VIP).'}),
  P('control_cierres_nomina','control_cierres_nomina','CIERRES','NOMINA','obra',{totales:['total_neto','total_nomina','total_retenciones','total_finiquitos'],omitirSinVip:['snapshot','total_prevision'],desc:'Cierres de nómina con estados, totales y fotografía.'}),
  P('control_cierre_versiones','control_cierre_versiones','CIERRE_VERSIONES','NOMINA','obra',{omitirSinVip:['snapshot'],rel:{cierre_origen:'CIERRES'},desc:'Versiones de cierre con fotografía y huellas.'}),
  P('control_cierres_eliminados','control_cierres_eliminados','CIERRES_ELIMINADOS','NOMINA','obra',{permiso:'admin',desc:'Cierres eliminados (papelera; sólo administrador).'}),
  P('control_flujo_cierres','control_flujo_cierres','FLUJO_CIERRES','NOMINA','obra',{pk:['cierre_id'],rel:{cierre_id:'CIERRES',version_id:'CIERRE_VERSIONES'},desc:'Flujo de cada cierre: revisión, huellas y marca de cambios.'}),
  P('control_solicitudes_flujo','control_solicitudes_flujo','SOLICITUDES_FLUJO','NOMINA','obra',{rel:{cierre_origen:'CIERRES'},desc:'Solicitudes de reapertura o ajuste y su decisión.'}),
  P('control_conciliacion_noi','control_conciliacion_noi','CONCILIACION_NOI','NOMINA','obra',{precision:['monto_platinum','monto_noi','diferencia'],totales:['monto_noi','monto_platinum'],rel:{cierre_id:'CIERRES',pago_id:'PAGOS',cheque_id:'CHEQUES'},desc:'Conciliación contra NOI por cierre y trabajador.'}),
  P('control_desglose_noi','control_desglose_noi','DESGLOSE_NOI','NOMINA','obra',{precision:['percepciones','isr','imss','subsidio','total_deducciones','neto','ajuste_origen'],totales:['neto'],rel:{cheque_referencia_id:'CHEQUES'},desc:'Desglose NOI importado con ajustes de origen.'}),
  P('estado_conciliacion_nomina','estado_conciliacion_nomina','ESTADO_CONCILIACION','NOMINA','obra',{rel:{cierre_id:'CIERRES',cierre_origen:'CIERRES'},desc:'Estado del conciliador por cierre.'}),
  P('archivos_conciliacion_nomina','archivos_conciliacion_nomina','ARCHIVOS_CONCILIACION','NOMINA','obra',{rel:{estado_id:'ESTADO_CONCILIACION'},desc:'Archivos del conciliador (ruta lógica privada y propuesta).'}),
  P('control_revision_pagos','control_revision_pagos','REVISION_PAGOS','NOMINA','obra',{desc:'Revisión semanal de pagos.'}),
  P('control_presupuestos_obra','control_presupuestos_obra','PRESUPUESTOS','NOMINA','obra',{omitirSinVip:['presupuesto_prevision'],desc:'Presupuestos por centro, semana y contratista.'}),
  P('excepciones_noi_individuales','(interna)','EXCEPCIONES_NOI','NOMINA','interna',{permiso:'vip',rel:{cierre_id:'CIERRES',pago_nomina_id:'PAGOS'},desc:'Excepciones NOI individuales autorizadas (interna; sólo VIP).'}),
  P('correcciones_centavos_aprobadas','(interna)','CORRECCIONES_CENTAVOS','NOMINA','interna',{permiso:'vip',rel:{cierre_id:'CIERRES'},desc:'Correcciones de centavos aprobadas con antes y después (interna; sólo VIP).'}),
  P('noi_identidades_resueltas','(interna)','IDENTIDADES_NOI','NOMINA','interna',{permiso:'vip',desc:'Identidades NOI resueltas con evidencia (interna; sólo VIP).'}),
  P('control_obligaciones_pago','control_obligaciones_pago','OBLIGACIONES','PAGOS','obra',{totales:['importe'],filtro:(q,c)=>c.permisos.vip?q:q.neq('tipo','PREVISION_SOCIAL'),
   rel:{cierre_id:'CIERRES',cierre_origen:'CIERRES',version_id:'CIERRE_VERSIONES'},desc:'Obligaciones de pago por versión de cierre; vigentes y no vigentes. Previsión social sólo VIP.'}),
  P('control_evidencias_pago','control_evidencias_pago','EVIDENCIAS','PAGOS','obra',{totales:['importe'],rel:{pago_id:'PAGOS',cheque_id:'CHEQUES'},desc:'Evidencias de pago (operación real, deduplicada por clave).'}),
  P('control_pago_aplicaciones','control_pago_aplicaciones','APLICACIONES','PAGOS','obra',{totales:['importe'],rel:{obligacion_id:'OBLIGACIONES',evidencia_id:'EVIDENCIAS',version_id:'CIERRE_VERSIONES'},
   desc:'Aplicaciones de evidencia a obligación, incluidas las retiradas (retirado_en).'}),
  P('pagos','pagos','PAGOS','PAGOS','obra',{totales:['importe'],rel:{conciliacion_archivo_id:'ARCHIVOS_CONCILIACION'},desc:'Pagos registrados con medio, estado, fecha, referencias y huella.'}),
  P('control_importaciones_bancarias','control_importaciones_bancarias','IMPORTACIONES_BANCO','PAGOS','obra',{rel:{padre_id:'IMPORTACIONES_BANCO'},desc:'Archivos bancarios importados: ruta lógica privada en Storage (nunca contenido), huella, estado y propuesta.'}),
  P('control_banco_resoluciones','control_banco_resoluciones','BANCO_RESOLUCIONES','PAGOS','obra',{rel:{archivo_id:'IMPORTACIONES_BANCO',pago_id:'PAGOS',obligacion_id:'OBLIGACIONES',cheque_id:'CHEQUES',aplicacion_id:'APLICACIONES'},desc:'Resolución por fila de archivo bancario con su vínculo a pago, obligación, cheque o aplicación.'}),
  P('cheques','cheques','CHEQUES','CHEQUES','obra',{totales:['importe'],filtro:(q,c)=>c.permisos.admin?q:q.eq('eliminado',false),
   rel:{cierre_id:'CIERRES',lote_nomina_id:'LOTES_CHEQUES',reemplaza_cheque_id:'CHEQUES'},desc:'Cheques: folios, consecutivos, estados, cancelaciones y reposiciones. Papelera sólo administrador.'}),
  P('bloques_cheques','bloques_cheques','BLOQUES_CHEQUES','CHEQUES','obra',{desc:'Bloques de entrega de cheques.'}),
  P('control_lotes_cheques_nomina','control_lotes_cheques_nomina','LOTES_CHEQUES','CHEQUES','obra',{desc:'Lotes de cheques de nómina.'}),
  P('control_retiros_cheques_auto','control_retiros_cheques_auto','RETIROS_CHEQUES','CHEQUES','obra',{rel:{cheque_id:'CHEQUES'},desc:'Retiros automáticos de cheques con su estado anterior.'}),
  P('folios_cheque','folios_cheque','FOLIOS_JUSTIFICADOS','CHEQUES','global',{desc:'Folios de chequera justificados.'}),
  P('reuniones_entrega_cheques','reuniones_entrega_cheques','REUNIONES_ENTREGA','CHEQUES','empresa',{desc:'Reuniones de entrega de cheques.'}),
  P('reunion_cheques_entrega','reunion_cheques_entrega','REUNION_CHEQUES','CHEQUES','padre',{padre:{fuente:'reuniones_entrega_cheques',campo:'id',destino:'reunion_id'},rel:{reunion_id:'REUNIONES_ENTREGA',cheque_id:'CHEQUES'},desc:'Cheques entregados en cada reunión.'}),
  P('reunion_bloques_cheques','reunion_bloques_cheques','REUNION_BLOQUES','CHEQUES','padre',{pk:['reunion_id','bloque_id'],padre:{fuente:'reuniones_entrega_cheques',campo:'id',destino:'reunion_id'},rel:{reunion_id:'REUNIONES_ENTREGA',bloque_id:'BLOQUES_CHEQUES'},desc:'Bloques asignados a reuniones.'}),
  P('control_permisos_cheques','control_permisos_cheques','PERMISOS_CHEQUES','CHEQUES','global',{permiso:'admin',pk:['user_id'],desc:'Permisos puntuales sobre cheques (sólo administrador).'}),
  P('documentos','documentos','DOCUMENTOS','EXPEDIENTE','obra',{rel:{conciliacion_archivo_id:'ARCHIVOS_CONCILIACION'},
   desc:'Inventario del expediente: propietario, nombre original, tipo, fecha, estado, ruta lógica privada y huella. Los originales permanecen en Storage privado.'}),
  P('control_documentos_cumplimiento','control_documentos_cumplimiento','CUMPLIMIENTO','EXPEDIENTE','obra',{desc:'Documentos de cumplimiento del centro con vigencia.'}),
  P('archivo_recibo_periodo','(interna)','ARCHIVO_RECIBOS','EXPEDIENTE','interna',{permiso:'vip',rel:{cierre_id:'CIERRES',documento_id:'DOCUMENTOS'},desc:'Archivo de recibos por periodo (interna; sólo VIP).'}),
  P('lecturas_fiscales_documentos','(interna)','LECTURAS_FISCALES','EXPEDIENTE','interna',{permiso:'vip',pk:['documento_id'],rel:{documento_id:'DOCUMENTOS'},desc:'Lecturas fiscales de documentos (interna; sólo VIP).'}),
  P('cfdi_pdf_verificados','(interna)','CFDI_PDF_VERIFICADOS','EXPEDIENTE','interna',{permiso:'vip',pk:['documento_id'],rel:{documento_id:'DOCUMENTOS'},desc:'Recibos PDF verificados contra CFDI (interna; sólo VIP).'}),
  P('recibos_ia','(interna)','RECIBOS_IA','EXPEDIENTE','interna',{permiso:'vip',rel:{documento_id:'DOCUMENTOS'},desc:'Lecturas asistidas de recibos y su confirmación (interna; sólo VIP).'}),
  P('control_casos_imss','control_casos_imss','CASOS_IMSS','IMSS','obra',{permiso:'salud',rel:{incidente_id:'INCIDENTES'},desc:'Casos IMSS e incapacidades (permiso de salud).'}),
  P('control_casos_imss_semanas','control_casos_imss_semanas','CASOS_IMSS_SEMANAS','IMSS','padre',{permiso:'salud',padre:{fuente:'control_casos_imss',campo:'id',destino:'caso_id'},rel:{caso_id:'CASOS_IMSS',descuento_id:'DESCUENTOS'},desc:'Semanas de cada caso IMSS.'}),
  P('control_st7_acuses','control_st7_acuses','ST7_ACUSES','IMSS','obra',{permiso:'salud',rel:{incidente_id:'INCIDENTES',caso_imss_id:'CASOS_IMSS'},desc:'Acuses ST-7 (permiso de salud).'}),
  P('control_incidentes_laborales','control_incidentes_laborales','INCIDENTES','IMSS','obra',{permiso:'salud',desc:'Incidentes laborales (permiso de salud).'}),
  P('imss_auditoria_integraciones','(interna)','IMSS_AUDITORIA','IMSS','interna',{permiso:'vip_salud',rel:{caso_id:'CASOS_IMSS'},desc:'Auditoría de integraciones IMSS (interna; VIP y salud).'}),
  P('infonavit_avisos_importaciones','infonavit_avisos_importaciones','INFONAVIT_AVISOS','IMSS','empresa',{desc:'Importaciones de avisos INFONAVIT con su comparación.'}),
  P('infonavit_avisos_aplicaciones','infonavit_avisos_aplicaciones','INFONAVIT_APLICACIONES','IMSS','obra',{rel:{importacion_id:'INFONAVIT_AVISOS',descuento_id:'DESCUENTOS'},desc:'Aplicaciones de avisos INFONAVIT con antes y después.'}),
  P('infonavit_avisos_archivos','infonavit_avisos_archivos','INFONAVIT_ARCHIVOS','IMSS','padre',{pk:['importacion_id'],select:'importacion_id',padre:{fuente:'infonavit_avisos_importaciones',campo:'id',destino:'importacion_id'},
   omitidos:{contenido:'Archivo original del aviso: permanece en la base privada; no se incrusta.'},rel:{importacion_id:'INFONAVIT_AVISOS'},desc:'Constancia de archivo original por importación (sin contenido).'}),
  P('historial','historial','HISTORIAL','AUDITORIA','obra',{desc:'Historial completo de cambios con antes, después, usuario y fecha.'}),
  P('control_bitacora','control_bitacora','BITACORA','AUDITORIA','obra',{desc:'Bitácora de control por módulo y acción.'}),
  P('historial_automatizaciones','historial_automatizaciones','AUTOMATIZACIONES','AUDITORIA','global',{permiso:'vip',desc:'Historial de procesos automáticos (global; sólo VIP).'}),
  P('config','config','CONFIGURACION','CONFIGURACION','config',{opcional:true,pk:['clave'],desc:'Configuración autorizada: sólo claves y campos explícitos; nunca credenciales.'}),
  P('app_usuarios','app_usuarios','ACCESOS','CONFIGURACION','global',{opcional:true,permiso:'admin_vip',pk:['user_id'],
   select:'user_id,email,nombre,rol,activo,full_access,puede_escribir,puede_eliminar,solo_contratos,empresas_permitidas,obras_permitidas,areas_permitidas,created_at,updated_at',
   omitidos:{notas:'Notas internas de cuentas: no forman parte del respaldo.'},desc:'Usuarios y alcances (sólo administrador con acceso VIP).'})
 ]);
 const POR_CLAVE=new Map(FUENTES.map(f=>[f.clave,f]));
 /* Configuración: lista cerrada de claves y campos. Nunca credenciales ni tokens. */
 const CAMPOS_EMPRESA=['razon','rfc','domicilio','representante','repCargo','escritura_fecha','folio_mercantil','inscripcion_fecha','instrumento','notaria_ciudad','notaria_num','notario','rppc','volumen','poder_en_constitutiva'];
 const CONFIG_PERMITIDA=e=>({app_version:['v','nota'],carta_finiquito:['dest','lugar','sufijo'],catalogo_puestos:'*ARREGLO*',
  fiscal:['anio','ceav','fuentes','isn','seguro_danos_bim','sm','sm_frontera','subsidio_calibracion_fuente','subsidio_fuente','subsidio_pct','subsidio_semanal_metodo','subsidio_semanal_valor_anterior','subsidio_semanal_valor_calibrado','subsidio_tope_mensual','uma','umi'],
  motores_nomina:['fuente','version','SEMANAL','QUINCENAL'],tabulador:'*NUMEROS*',['empresa_'+e]:CAMPOS_EMPRESA,['contrato_empresa_'+e]:CAMPOS_EMPRESA});
 const EXCLUSIONES=Object.freeze([
  ['config: claves de credenciales o de seguridad y cualquier clave no listada','Excluidas por seguridad: nunca se respaldan en Excel.'],
  ['ia_config','Configuración con llaves de servicios: nunca se respalda.'],
  ['ia_embeddings, ia_cola_embeddings','Índice y cola técnicos regenerables a partir de las fuentes respaldadas.'],
  ['control_eventos_integracion','Aviso técnico de sincronización entre sesiones; el antes/después está en HISTORIAL y BITACORA.'],
  ['control_actividad_actual','Presencia efímera de sesiones.'],
  ['respaldo_* (tablas de migraciones puntuales)','Copias técnicas sin política de lectura de cliente; permanecen en la base.'],
  ['Vistas v_* y control_saldos_pago','Derivadas: se recalculan con las hojas de origen.'],
  ['Tablas internas técnicas de lectura documental (colas, bloqueos, errores)','Colas, bloqueos y errores técnicos transitorios.'],
  ['Vistas internas fiscales','Derivadas de DOCUMENTOS y de las lecturas fiscales.'],
  ['Archivos originales (Storage privado, contenido de avisos y fuentes de prestaciones)','Permanecen en Storage o en la base privada; el libro sólo lleva metadatos, ruta lógica y huella. Sin URLs firmadas.']
 ]);
 const LEGADO_COLS=[['contratista','CONTRATISTA'],['estatus','ESTATUS'],['no_trab','NO. TRAB.'],['fecha_alta','FECHA ALTA'],['fecha_baja','FECHA BAJA'],['monto_finiquito','MONTO FINIQUITO'],['semana_ingreso','SEMANA DE INGRESO'],['periodo_pago','PERIODO DE PAGO'],['primer_apellido','PRIMER APELLIDO'],['segundo_apellido','SEGUNDO APELLIDO'],['nombres','NOMBRE(S)'],['estado_civil','ESTADO CIVIL'],['escolaridad','ESCOLARIDAD'],['funciones','FUNCIONES'],['puesto','PUESTO'],['beneficiario','BENEFICIARIO'],['sd','SD'],['sdi','SDI'],['sal_semanal','SAL. PERIODO'],['rfc','RFC'],['curp','CURP'],['nacionalidad','NACIONALIDAD'],['fecha_nacimiento','FECHA DE NACIMIENTO'],['nss','NSS'],['cuenta','CUENTA'],['clabe','CUENTA CLABE'],['banco','BANCO'],['edo_nacimiento','EDO. NACIMIENTO'],['direccion','DIRECCION'],['cp','C.P.'],['telefono','TELEFONO'],['correo','CORREO ELECTRONICO'],['genero','GENERO'],['turno','TURNO'],['forma_pago','FORMA DE PAGO'],['observaciones','OBSERVACIONES'],['drive_link','CARPETA DRIVE']];
 const COMPATIBILIDAD=Object.freeze([
  ['Hoja por centro (padrón V0)','Se conserva con el mismo nombre y columnas; al final se agregan DOCS ENTREGADOS, FECHA REINGRESO e ID TRABAJADOR. Fuente fiel: PADRON.'],
  ['CHEQUES (V0)','CHEQUES con todas las columnas e IDs; el estado de papelera se ve en eliminado.'],
  ['DESCUENTOS (V0: sólo activos)','DESCUENTOS con activos e inactivos; filtra activo = VERDADERO para reproducir V0.'],
  ['EXPEDIENTE DIGITAL (V0: sin anulados)','DOCUMENTOS con estado_documento; filtra VIGENTE para reproducir V0.'],
  ['HISTORIAL RECIENTE (V0: 500 eventos)','HISTORIAL completo con antes y después.'],
  ['Nombre RESPALDO_BASE_TRABAJADORES_<fecha>.xlsx','RESPALDO_INTEGRAL_V1_<razón social>_<fecha y hora>.xlsx (partes numeradas si se divide).']
 ]);
 const DESC={id:'Identificador estable del registro; clave para relacionar hojas.',obra_id:'Centro de trabajo (CENTROS.id).',centro:'Nombre del centro (derivado de CENTROS).',
  trabajador_id:'Persona del padrón (PADRON.id).',empleado_id:'Persona del padrón (PADRON.id).',empresa_codigo:'Razón social.',created_at:'Creación (ISO 8601).',updated_at:'Última modificación (ISO 8601).',
  creado_por:'Usuario que creó el registro.',actualizado_por:'Usuario que modificó por última vez.',estado:'Estado del registro en su flujo.',estatus:'Estatus del registro.',
  activo:'Vigencia del registro (FALSO = inactivo, se conserva).',anulado:'Documento anulado (se conserva trazable).',eliminado:'En papelera (sólo administrador).',version:'Número de versión.',
  vigente:'Indica la versión vigente.',importe:'Importe en pesos.',monto:'Importe en pesos.',semana:'Semana interna del centro.',curp:'CURP (texto).',rfc:'RFC (texto).',nss:'NSS (texto).',
  clabe:'CLABE interbancaria (texto; conserva ceros iniciales).',cuenta:'Cuenta bancaria (texto; conserva ceros iniciales).',num_tarjeta:'Tarjeta de nómina (texto).',no_trab:'Número de trabajador en el centro.',
  fecha_alta:'Fecha de alta original.',fecha_baja:'Fecha de baja vigente.',fecha_reingreso:'Fecha del reingreso vigente; los anteriores están en MOVIMIENTOS_LABORALES.',
  hash:'Huella del archivo.',huella:'Huella de integridad.',sha256:'Huella SHA-256.',archivo:'Ruta lógica privada en Storage (no es enlace público).',ruta:'Ruta lógica privada en Storage.',
  nombre_archivo:'Nombre original del archivo.',motivo:'Motivo capturado.',observaciones:'Observaciones capturadas.',notas:'Notas capturadas.',retirado_en:'Fecha de retiro (aplicación retirada, se conserva).',
  datos_antes:'Fotografía anterior al cambio (JSON).',datos_despues:'Fotografía posterior al cambio (JSON).',snapshot:'Fotografía completa (JSON).',detalle:'Detalle (JSON).',
  entradas:'Entradas del cálculo (JSON).',resultado:'Resultado del cálculo (JSON).',folio:'Folio (texto).',consecutivo:'Consecutivo (texto).',num_cheque:'Número de cheque (texto).',
  campos_cambiados:'Campos que difieren entre antes y después (derivado).',estado_documento:'VIGENTE o ANULADO (derivado de anulado).',almacenamiento:'Dónde está el original (derivado).',
  docs_entregados:'Documentos base entregados (derivado del campo docs).'};
 const MONEDA=/(^|_)(importe|monto|total|neto|bruto|isr|exento|gravado|sueldo|salario|sal_semanal|sd|sdi|presupuesto|percepciones|deducciones|subsidio|imss|ajuste|diferencia|cuota|uma|real|transferencia|efectivo|original|acreditado|causado|platinum|noi)(_|$)/;
 const TEXTO_SENSIBLE=/^(clabe|cuenta|cuenta_mask|nss|rfc|rfc_origen|rfc_validado|curp|cp|telefono|benef_telefono|num_tarjeta|numero_credito|num_cheque|consecutivo|registro_patronal|registro_siroc|codigo_verificacion|cfdi_uuid|uuid|uuid_fiscal|hash|huella|sha256)$|^(folio|codigo|clave)(_|$)|_sha256$/;
 const URL_FIRMA=/[?&](token|signature|x-amz-signature|x-amz-credential|sig|se)=/i;

 /* ---------- utilidades puras ---------- */
 const dormir=ms=>ms>0?new Promise(r=>setTimeout(r,ms)):Promise.resolve();
 const texto=v=>v==null?'':String(v);
 function nombreHoja(base,usados){
  let s=texto(base).replace(/[\\\/\?\*\[\]:]/g,' ').replace(/\s+/g,' ').trim().replace(/^'+|'+$/g,'').trim()||'HOJA';
  if(s.toLowerCase()==='history')s='History_';
  s=s.slice(0,31).trim();let n=s,k=1;
  while(usados.has(n.toLowerCase())){k++;const suf=' ('+k+')';n=s.slice(0,31-suf.length).trim()+suf;}
  usados.add(n.toLowerCase());return n;
 }
 function partirTexto(s,tam=TROZO){
  const out=[];let i=0;
  while(i<s.length){let j=Math.min(s.length,i+tam);const c=s.charCodeAt(j-1);if(j<s.length&&c>=0xD800&&c<=0xDBFF)j--;out.push(s.slice(i,j));i=j;}
  return out.length?out:[''];
 }
 const centavos=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n*100):0;};
 async function sha256(s){
  const c=root.crypto||(typeof crypto!=='undefined'?crypto:null);
  if(!c||!c.subtle||typeof TextEncoder==='undefined')return '';
  const b=await c.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 function uuid(){
  const c=root.crypto||(typeof crypto!=='undefined'?crypto:null);
  if(c&&c.randomUUID)return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,ch=>{const r=Math.random()*16|0;return (ch==='x'?r:(r&3|8)).toString(16);});
 }
 async function enParalelo(items,n,fn){
  const res=new Array(items.length);let i=0;
  await Promise.all(Array.from({length:Math.max(1,Math.min(n,items.length))},async()=>{while(i<items.length){const k=i++;res[k]=await fn(items[k],k);}}));
  return res;
 }
 function tipoDe(campo,tipoBD,muestra){
  const t=texto(tipoBD).toLowerCase();
  if(campo==='id'||/_id$/.test(campo)||t==='uuid')return 'ID';
  if(TEXTO_SENSIBLE.test(campo))return 'TEXTO'; // conserva ceros aunque falten metadatos del servidor
  if(t.endsWith('[]'))return 'LISTA';
  if(t==='jsonb'||t==='json')return 'JSON';
  if(t==='boolean')return 'BOOLEANO';
  if(t==='date')return 'FECHA';
  if(t.startsWith('timestamp'))return 'FECHA_HORA';
  if(/^(integer|smallint|bigint)$/.test(t))return 'ENTERO';
  if(t.startsWith('numeric')||t==='double precision'||t==='real')return MONEDA.test(campo)?'IMPORTE':'NUMERO';
  if(t)return 'TEXTO';
  if(muestra===undefined||muestra===null)return 'TEXTO';
  if(typeof muestra==='boolean')return 'BOOLEANO';
  if(typeof muestra==='number')return MONEDA.test(campo)?'IMPORTE':'NUMERO';
  if(typeof muestra==='object')return Array.isArray(muestra)?'LISTA':'JSON';
  if(/^\d{4}-\d{2}-\d{2}$/.test(muestra))return 'FECHA';
  if(/^\d{4}-\d{2}-\d{2}T/.test(muestra))return 'FECHA_HORA';
  return 'TEXTO';
 }
 /* Valor lógico de una celda: null, '', número, booleano, texto o {largo}. */
 function valorLogico(v,tipo){
  if(v===undefined||v===null)return null;
  if(tipo==='JSON'||tipo==='LISTA'||(typeof v==='object'))return JSON.stringify(v);
  if(typeof v==='number'&&(tipo==='ID'||tipo==='TEXTO'||tipo==='FECHA'||tipo==='FECHA_HORA'))return String(v);
  if(typeof v==='number'&&!Number.isFinite(v))return String(v);
  return v;
 }
 const ESTILO={
  enc:{font:{bold:true,color:{rgb:'FFFFFF'},name:'Calibri',sz:10},fill:{fgColor:{rgb:'1F2F52'}},alignment:{vertical:'center',wrapText:true}},
  txt:{numFmt:'@'},nulo:{numFmt:'@',font:{color:{rgb:'8A8F98'},italic:true}},dinero:{numFmt:'#,##0.00'},entero:{numFmt:'0'}
 };
 /* Celda XLSX desde el valor lógico. Nunca produce fórmulas: toda cadena es t:'s' con formato @. */
 function celda(v,tipo){
  if(v===null)return {t:'s',v:NULO,s:ESTILO.nulo};
  if(v===''||v===undefined)return null;
  if(typeof v==='object'&&v.largo)return {t:'s',v:MARCA+' TEXTO_LARGO ref='+v.largo+' partes='+v.partes+' longitud='+v.longitud,s:ESTILO.nulo};
  if(typeof v==='boolean')return {t:'b',v};
  if(typeof v==='number')return tipo==='IMPORTE'?{t:'n',v,s:ESTILO.dinero}:tipo==='ENTERO'?{t:'n',v,s:ESTILO.entero}:{t:'n',v};
  let s=String(v);if(s.charCodeAt(0)===0x2205)s=MARCA+s; // escapa valores reales que empiezan con ∅
  return {t:'s',v:s,s:ESTILO.txt};
 }
 function sanearUrl(s,cont){
  if(typeof s!=='string'||!/^https?:\/\//i.test(s)||!URL_FIRMA.test(s))return s;
  cont.urls++;return s.split('?')[0]+' [firma temporal omitida]';
 }

 /* ---------- movimientos laborales: un evento por movimiento documentado ---------- */
 function movimientosLaborales(trabajadores,historial,nombreCentro,reversiones=[]){
  const revertidas=new Map((reversiones||[]).filter(r=>texto(r.estado).toUpperCase()==='APLICADA'&&r.historial_id!=null).map(r=>[String(r.historial_id),r]));
  const f10=v=>v?String(v).slice(0,10):null,eventos=[],porId=new Map(trabajadores.map(w=>[w.id,w]));
  for(const h of historial){
   if(!h||!h.trabajador_id)continue;
   const a=h.datos_antes&&typeof h.datos_antes==='object'?h.datos_antes:{},d=h.datos_despues&&typeof h.datos_despues==='object'?h.datos_despues:{};
   let n=0;
   const add=(tipo,fecha,anterior)=>eventos.push({evento_id:'H'+h.id+'-'+(++n),trabajador_id:h.trabajador_id,obra_id:h.obra_id??d.obra_id??null,tipo_evento:tipo,
    fecha_efectiva:f10(fecha),fecha_anterior:f10(anterior),estatus_antes:a.estatus??null,estatus_despues:d.estatus??null,obra_antes:a.obra_id??null,obra_despues:d.obra_id??null,
    fecha_registro:h.fecha??null,usuario:h.usuario??null,fuente:'HISTORIAL',historial_id:String(h.id),accion_origen:h.accion,nombre_historial:h.trabajador_nombre??null});
   const cambio=k=>f10(a[k])!==f10(d[k]);
   switch(h.accion){
    case 'ALTA':add('ALTA',d.fecha_alta,null);break;
    case 'BAJA':add('BAJA',d.fecha_baja,a.fecha_baja);break;
    case 'REACTIVACION':add('REINGRESO',d.fecha_reingreso||d.fecha_alta,a.fecha_reingreso);break;
    case 'CORRECCION_REINGRESO':add('CORRECCION_REINGRESO',d.fecha_reingreso,a.fecha_reingreso);break;
    case 'ELIMINACION':add('ELIMINACION',null,null);break;
    case 'MODIFICACION':
     if((a.estatus??null)!==(d.estatus??null)&&'estatus' in d){
      if(d.estatus==='BAJA')add('BAJA',d.fecha_baja,a.fecha_baja);
      else if(a.estatus==='BAJA'&&d.estatus==='ACTIVO')add('REINGRESO',d.fecha_reingreso||d.fecha_alta,a.fecha_reingreso);
      else add('CAMBIO_ESTATUS',null,null);
     }else{
      if('fecha_alta' in d&&cambio('fecha_alta'))add('CORRECCION_FECHA_ALTA',d.fecha_alta,a.fecha_alta);
      if('fecha_baja' in d&&cambio('fecha_baja'))add('CORRECCION_FECHA_BAJA',d.fecha_baja,a.fecha_baja);
      if('fecha_reingreso' in d&&cambio('fecha_reingreso'))add('CORRECCION_REINGRESO',d.fecha_reingreso,a.fecha_reingreso);
     }
     if(a.obra_id&&d.obra_id&&a.obra_id!==d.obra_id)add('TRASLADO',f10(h.fecha),null);
     break;
   }
  }
  // Estado vigente del padrón: sólo agrega fechas que el historial no documenta.
  const documentadas=new Set(eventos.map(e=>e.trabajador_id+'|'+e.tipo_evento.replace(/^CORRECCION_FECHA_|^CORRECCION_/,'')+'|'+e.fecha_efectiva));
  const sinEvidencia={reingresos:0,altas:0,bajas:0};
  for(const w of trabajadores){
   for(const [tipo,campo,k] of [['ALTA','fecha_alta','altas'],['BAJA','fecha_baja','bajas'],['REINGRESO','fecha_reingreso','reingresos']]){
    const f=f10(w[campo]);if(!f||(tipo==='BAJA'&&w.estatus!=='BAJA'&&!w.fecha_baja))continue;
    const clave=tipo==='REINGRESO'?['REINGRESO','REINGRESO'].map(t=>w.id+'|'+t+'|'+f):[w.id+'|'+tipo+'|'+f,w.id+'|'+(tipo==='ALTA'?'ALTA':'BAJA')+'|'+f];
    if(clave.some(x=>documentadas.has(x)))continue;
    sinEvidencia[k]++;
    eventos.push({evento_id:'P-'+w.id+'-'+tipo,trabajador_id:w.id,obra_id:w.obra_id,tipo_evento:tipo,fecha_efectiva:f,fecha_anterior:null,estatus_antes:null,estatus_despues:w.estatus??null,
     obra_antes:null,obra_despues:null,fecha_registro:null,usuario:null,fuente:'PADRON_VIGENTE',historial_id:null,accion_origen:null,nombre_historial:null});
   }
  }
  const grupos=new Map();
  for(const e of eventos){if(!grupos.has(e.trabajador_id))grupos.set(e.trabajador_id,[]);grupos.get(e.trabajador_id).push(e);}
  const salida=[];let ciclosSinAlta=0;
  const orden=t=>({ALTA:0,REINGRESO:1,CORRECCION_FECHA_ALTA:2,CORRECCION_REINGRESO:2,TRASLADO:3,CAMBIO_ESTATUS:4,BAJA:5,CORRECCION_FECHA_BAJA:6,ELIMINACION:7}[t]??8);
  for(const [id,lista] of grupos){
   lista.sort((x,y)=>texto(x.fecha_efectiva||texto(x.fecha_registro).slice(0,10)).localeCompare(texto(y.fecha_efectiva||texto(y.fecha_registro).slice(0,10)))
    ||orden(x.tipo_evento)-orden(y.tipo_evento)||texto(x.fecha_registro).localeCompare(texto(y.fecha_registro))||Number(x.historial_id||0)-Number(y.historial_id||0));
   let ciclo=0,conAlta=false;const w=porId.get(id);
   for(const e of lista){
    if(e.tipo_evento==='ALTA'){if(!ciclo)ciclo=1;conAlta=true;}
    else if(e.tipo_evento==='REINGRESO')ciclo=(ciclo||1)+1;
    else if(!ciclo)ciclo=1;
    const parcial=ciclo===1&&!conAlta;
    salida.push({...e,ciclo,no_trab:w?w.no_trab??null:null,nombre:w?[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' '):e.nombre_historial,
     centro:nombreCentro(e.obra_id),evidencia:e.fuente==='HISTORIAL'?(parcial?'HISTORIAL_SIN_ALTA_PREVIA':'HISTORIAL'):'SOLO_PADRON_VIGENTE',
     revertida:e.historial_id&&revertidas.has(e.historial_id)?'SI':null,reversion_id:e.historial_id&&revertidas.has(e.historial_id)?revertidas.get(e.historial_id).id:null,
     observacion:e.historial_id&&revertidas.has(e.historial_id)?'Baja revertida (REVERSIONES_BAJA); el evento se conserva tal como quedó en el historial.':e.fuente==='PADRON_VIGENTE'?'Fecha vigente del padrón sin evento en historial; no sustituye ciclos anteriores.':(parcial?'Ciclo antiguo sin alta documentada: se conserva lo disponible.':null)});
   }
   if(lista.length&&!conAlta)ciclosSinAlta++;
  }
  salida.sort((x,y)=>(Number(x.no_trab)||9e9)-(Number(y.no_trab)||9e9)||texto(x.trabajador_id).localeCompare(texto(y.trabajador_id))||x.ciclo-y.ciclo);
  return {eventos:salida,limitaciones:{sin_evidencia:sinEvidencia,ciclos_sin_alta:ciclosSinAlta}};
 }
 const COLS_MOV=['evento_id','trabajador_id','obra_id','centro','no_trab','nombre','ciclo','tipo_evento','fecha_efectiva','fecha_anterior','estatus_antes','estatus_despues','obra_antes','obra_despues','fecha_registro','usuario','fuente','historial_id','accion_origen','evidencia','revertida','reversion_id','observacion'];
 const TIPOS_MOV={evento_id:'TEXTO',trabajador_id:'ID',obra_id:'ID',obra_antes:'ID',obra_despues:'ID',historial_id:'ID',reversion_id:'ID',no_trab:'ENTERO',ciclo:'ENTERO',fecha_efectiva:'FECHA',fecha_anterior:'FECHA',fecha_registro:'FECHA_HORA'};

 /* ---------- ambiente (inyectable para pruebas) ---------- */
 function ambiente(op){
  const v=(x,n)=>x!==undefined?x:root[n];
  return {
   sb:op.sb||v(typeof sb!=='undefined'?sb:undefined,'sb'),
   XLSX:op.XLSX||v(typeof XLSX!=='undefined'?XLSX:undefined,'XLSX'),
   JSZip:op.JSZip!==undefined?op.JSZip:v(typeof JSZip!=='undefined'?JSZip:undefined,'JSZip'),
   obras:op.obrasCatalogo||v(typeof OBRAS!=='undefined'?OBRAS:undefined,'OBRAS')||[],
   empresaActiva:op.empresa||v(typeof EMPRESA_ACTIVA!=='undefined'?EMPRESA_ACTIVA:undefined,'EMPRESA_ACTIVA')||'PLATINUM',
   empresas:v(typeof EMPRESAS!=='undefined'?EMPRESAS:undefined,'EMPRESAS')||{},
   usuario:v(typeof USER!=='undefined'?USER:undefined,'USER')||null,
   version:op.versionApp||v(typeof APP_VERSION!=='undefined'?APP_VERSION:undefined,'APP_VERSION')||'',
   docs:v(typeof DOCS!=='undefined'?DOCS:undefined,'DOCS')||[],
   esVip:typeof esVip==='function'?esVip:()=>false,esAdmin:typeof esAdmin==='function'?esAdmin:()=>false,
   empresaDeObra:typeof empresaDeObra==='function'?empresaDeObra:(o=>texto(o&&o.empresa_codigo).toUpperCase()||'PLATINUM'),
   marca:op.marca===false?null:(op.marca||(typeof aplicarMarcaCorporativaXlsx==='function'?aplicarMarcaCorporativaXlsx:null)),
   registrar:op.registrar===false?null:(op.registrar||(typeof registrarExportacion==='function'?registrarExportacion:null)),
   descargar:op.descargar||descargarNavegador,
   espera:op.espera??300,intentos:op.intentos??3,paralelo:op.paralelo??4,paginasParalelas:op.paginasParalelas??3,
   ciclos:op.ciclosConsistencia??3,limiteFilas:op.limiteFilas||LIM_FILAS_EXCEL,presupuesto:op.presupuesto||PRESUPUESTO_CARACTERES,
   reloj:op.reloj||(()=>new Date()),progreso:op.progreso||(()=>{})
  };
 }
 function descargarNavegador(bytes,nombre){
  const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nombre;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),8000);
 }
 const errTexto=e=>texto(e&&(e.message||e.details||e.hint||e.code)||e)||'Error desconocido';
 const esFaltaRpc=e=>/PGRST202|42883/.test(texto(e&&e.code))||/control_respaldo/.test(errTexto(e))&&/not find|does not exist|no existe|could not find/i.test(errTexto(e));
 async function conReintento(fn,am,nota){
  let ultimo=null;
  for(let k=1;k<=am.intentos;k++){
   try{return await fn(k);}catch(e){ultimo=e;nota&&nota(k,e);if(e&&e.noReintentar)break;if(k<am.intentos)await dormir(am.espera*k);}
  }
  throw ultimo;
 }

 /* ---------- marcas del servidor ---------- */
 async function marcas(am,ctx,claves,columnas){
  const pedir=async lista=>{
   const {data,error}=await am.sb.rpc(RPC,{p_accion:'MARCAS',p_datos:{empresa:ctx.empresa,obras:ctx.obrasPedidas,fuentes:lista,columnas:!!columnas}});
   if(error)throw error;if(!data||typeof data!=='object'||!data.marcas)throw Error('Respuesta de marcas inválida');return data;
  };
  const esTiempo=e=>/57014|timeout|tiempo|canceling statement/i.test(texto(e&&e.code)+' '+errTexto(e));
  // Producción (2026-11-13): 15 fuentes ≈ 4.7 s frente al límite de 8 s; con más de 8 fuentes se piden por grupos desde el inicio.
  try{if(claves.length>8)throw Object.assign(Error('canceling statement: marcas por grupos'),{code:'57014'});return await conReintento(()=>pedir(claves),{...am,intentos:2});}
  catch(e){
   if(esFaltaRpc(e)||!esTiempo(e))throw e;
   // Tiempo agotado (statement_timeout): por grupos y, si un grupo sigue excediendo, tabla por tabla.
   // Una tabla que aun sola excede queda SIN marca (el respaldo se declara INCOMPLETO), no aborta.
   const grupos=[];for(let i=0;i<claves.length;i+=8)grupos.push(claves.slice(i,i+8));
   const partes=[],sinMarca=[];
   await enParalelo(grupos,2,async g=>{
    try{partes.push(await conReintento(()=>pedir(g),{...am,intentos:2}));}
    catch(e2){
     if(!esTiempo(e2))throw e2;
     for(const k of g){try{partes.push(await conReintento(()=>pedir([k]),{...am,intentos:2}));}catch(e3){if(!esTiempo(e3))throw e3;sinMarca.push(k);}}
    }
   });
   if(!partes.length)throw e;
   const r={...partes[0],marcas:{},columnas:{},por_grupos:true,sin_marca:sinMarca};
   for(const p of partes){Object.assign(r.marcas,p.marcas);Object.assign(r.columnas,p.columnas||{});}
   for(const k of sinMarca)r.marcas[k]={error:'TIEMPO_AGOTADO'};
   return r;
  }
 }
 const ALCANCE_MARCA={COMPLETA:'Huella de cada fila completa: detecta cualquier alta, baja o edición durante la exportación.',
  LIGERA:'Bitácora de sólo inserción: conteo, llave y fechas máximas y huella de llaves; detecta altas y bajas.'};
 const firma=m=>m?[m.filas,m.max_actualizado,m.max_creado,m.huella].join('|'):'';

 /* ---------- lectura ---------- */
 function selectDe(f){
  const base=f.select||'*',extra=(f.precision||[]).map(c=>c+'__origen:'+c+'::text');
  return f.select?base:[base,...extra].join(',');
 }
 function construir(am,ctx,f,ids){
  let q=am.sb.from(f.tabla).select(selectDe(f));
  if(f.alcance==='centros')q=q.in('id',ctx.obras);
  else if(f.alcance==='obra')q=q.in('obra_id',ctx.obras);
  else if(f.alcance==='obra_o_global')q=ctx.permisos.vip?q.or('obra_id.in.('+ctx.obras.join(',')+'),obra_id.is.null'):q.in('obra_id',ctx.obras);
  else if(f.alcance==='empresa')q=q.eq('empresa_codigo',ctx.empresa);
  else if(f.alcance==='padre')q=q.in(f.padre.destino,ids);
  else if(f.alcance==='config')q=q.in('clave',Object.keys(CONFIG_PERMITIDA(ctx.empresa)));
  if(f.filtro)q=f.filtro(q,ctx);
  return q;
 }
 async function paginar(am,hacer,orden,est){
  const filas=[];let desde=0,fin=false;
  while(!fin){
   const offs=Array.from({length:am.paginasParalelas},(_,k)=>desde+k*PAGINA);
   const lotes=await Promise.all(offs.map(o=>conReintento(async()=>{
    let q=hacer();for(const c of orden)q=q.order(c,{ascending:true});
    const {data,error}=await q.range(o,o+PAGINA-1);
    if(error){if(error.code==='PGRST103')return [];throw error;}
    if(!Array.isArray(data))throw Error('Respuesta sin filas');
    est.paginas++;return data;
   },am,(k,e)=>{est.reintentos++;est.ultimoError=errTexto(e);})));
   for(const l of lotes){if(fin)break;for(const x of l)filas.push(x);if(l.length<PAGINA)fin=true;}
   desde+=am.paginasParalelas*PAGINA;
  }
  return filas;
 }
 async function leerInterna(am,ctx,f,est){
  const filas=[];let despues=null;
  for(;;){
   const r=await conReintento(async()=>{
    const {data,error}=await am.sb.rpc(RPC,{p_accion:'LEER',p_datos:{empresa:ctx.empresa,obras:ctx.obrasPedidas,fuente:f.clave,despues,limite:PAGINA}});
    if(error)throw error;if(!data||!Array.isArray(data.filas))throw Error('Respuesta sin filas');est.paginas++;return data;
   },am,(k,e)=>{est.reintentos++;est.ultimoError=errTexto(e);});
   for(const x of r.filas)filas.push(x);
   if(!r.siguiente)break;despues=r.siguiente;
  }
  return filas;
 }
 const llave=(f,x)=>f.pk.map(c=>texto(x[c])).join('|');
 async function leerFuente(am,ctx,f,datos){
  const est={clave:f.clave,paginas:0,reintentos:0,ultimoError:null,inicio:Date.now()};
  let filas;
  if(f.alcance==='interna')filas=await leerInterna(am,ctx,f,est);
  else if(f.alcance==='padre'){
   const padre=datos.get(f.padre.fuente);
   if(!padre||padre.error)throw Object.assign(Error('La fuente '+f.padre.fuente+' no se leyó completa.'),{noReintentar:true});
   const ids=[...new Set(padre.filas.map(x=>x[f.padre.campo]).filter(v=>v!=null))];filas=[];
   for(let i=0;i<ids.length;i+=150){const lote=ids.slice(i,i+150);for(const x of await paginar(am,()=>construir(am,ctx,f,lote),f.orden,est))filas.push(x);}
  }else filas=await paginar(am,()=>construir(am,ctx,f),f.orden,est);
  if(f.clave==='control_pago_aplicaciones'&&!ctx.permisos.vip){
   // Previsión social sólo VIP: se descartan aplicaciones de esas obligaciones.
   const prev=await paginar(am,()=>am.sb.from('control_obligaciones_pago').select('id').in('obra_id',ctx.obras).eq('tipo','PREVISION_SOCIAL'),['id'],est);
   const s=new Set(prev.map(x=>x.id));filas=filas.filter(x=>!s.has(x.obligacion_id));
  }
  const vistas=new Set();for(const x of filas){const k=llave(f,x);if(vistas.has(k))throw Error('Fila repetida durante la paginación ('+k+'); se vuelve a leer.');vistas.add(k);}
  est.ms=Date.now()-est.inicio;
  return {filas,est,leidaEn:ctx.marcaActual};
 }

 /* ---------- exportación ---------- */
 async function exportar(op={}){
  const am=ambiente(op),t0=Date.now();
  if(!am.sb)throw Error('Sin conexión con la base.');
  if(!am.XLSX)throw Error('No está disponible el generador de Excel.');
  const empresa=texto(op.empresa||am.empresaActiva).toUpperCase();
  const catalogo=am.obras.filter(o=>am.empresaDeObra(o)===empresa);
  const pedidas=(op.obras&&op.obras.length?op.obras:catalogo.map(o=>o.id)).slice();
  const ctx={empresa,obrasPedidas:pedidas,obras:pedidas.slice(),permisos:{registrado:true,vip:!!am.esVip(),salud:false,admin:!!am.esAdmin()},marcaActual:0,
   incluirConfiguracion:!!op.incluirConfiguracion,idRespaldo:uuid(),inicio:am.reloj()};
  const R={estado:'COMPLETO',motivos:[],errores:[],fuentes:{},limitaciones:[],omitidos:[],excluidas:[],marcas:[],modoMarcas:'SERVIDOR',archivos:[]};
  const motivo=m=>{if(!R.motivos.includes(m))R.motivos.push(m);R.estado='INCOMPLETO';};
  const candidatas=FUENTES.filter(f=>!f.opcional||ctx.incluirConfiguracion);
  am.progreso({fase:'marcas',texto:'Tomando marcas de consistencia…'});
  let M=null,columnas={};
  try{M=await marcas(am,ctx,candidatas.map(f=>f.clave),true);}
  catch(e){
   // Sin permiso operativo o de razón social: no hay nada que respaldar.
   if(texto(e&&e.code)==='42501')throw Object.assign(Error(errTexto(e)),{causa:e});
   // Cualquier otra falla (función ausente, tiempo agotado): se respalda por RLS y queda INCOMPLETO.
   R.modoMarcas='NO_DISPONIBLE';motivo('SIN_MARCAS_SERVIDOR');R.errores.push(['(marcas)',errTexto(e)]);
   R.limitaciones.push(esFaltaRpc(e)?'El servidor no tiene la función de marcas: no se pudo verificar consistencia ni leer tablas internas.':'Las marcas del servidor no respondieron ('+errTexto(e)+'): no se verificó consistencia ni se leyeron tablas internas; reintente más tarde.');
   try{const {data,error}=await am.sb.rpc('control_puede_ver_salud');ctx.permisos.salud=!error&&data===true;}catch(x){ctx.permisos.salud=false;}
  }
  if(M){
   ctx.permisos={registrado:!!M.permisos?.registrado,vip:!!M.permisos?.vip,salud:!!M.permisos?.salud,admin:!!M.permisos?.admin};
   ctx.obras=(M.obras||[]).slice();columnas=M.columnas||{};R.marcas.push(M);
   for(const k of M.sin_marca||[])R.limitaciones.push('La marca de '+k+' excedió el tiempo del servidor: se leyó sin verificación de consistencia.');
   if(M.por_grupos)R.limitaciones.push('Las marcas se tomaron por grupos de tablas por tiempo de respuesta; cada tabla se verificó antes y después.');
   for(const id of M.obras_rechazadas||[])R.excluidas.push(['Centro '+id,'Fuera del alcance del usuario o de la razón social.']);
  }
  const permitida=f=>{
   const p=f.permiso,c=ctx.permisos;
   if(M){const m=M.marcas[f.clave];return !!m&&!m.omitida;}
   if(f.alcance==='interna')return false;
   return !p||(p==='vip'&&c.vip)||(p==='salud'&&c.salud)||(p==='admin'&&c.admin)||(p==='admin_vip'&&c.admin&&c.vip)||(p==='vip_salud'&&c.vip&&c.salud);
  };
  const activas=[];
  for(const f of candidatas){
   if(permitida(f))activas.push(f);
   else{const m=M&&M.marcas[f.clave];R.fuentes[f.clave]={estado:'OMITIDA_PERMISO',motivo:m&&m.omitida||('Requiere permiso '+(f.alcance==='interna'&&!M?'de servidor':f.permiso))};}
  }
  if(!ctx.obras.length)throw Error('No tienes centros visibles para respaldar en esta razón social.');
  const datos=new Map();
  const leer=async lista=>{
   const fases=[lista.filter(f=>f.alcance!=='padre'),lista.filter(f=>f.alcance==='padre')];
   for(const fase of fases)await enParalelo(fase,am.paralelo,async f=>{
    am.progreso({fase:'lectura',fuente:f.clave,hoja:f.hoja});
    try{datos.set(f.clave,await conReintento(()=>leerFuente(am,ctx,f,datos),{...am,intentos:2}));}
    catch(e){datos.set(f.clave,{filas:[],error:errTexto(e),est:{paginas:0,reintentos:0}});}
   });
  };
  await leer(activas);
  // Consistencia: cada tabla debe coincidir con la última marca; se relee lo que cambió.
  let ultima=M;
  if(M){
   for(let ciclo=1;;ciclo++){
    ctx.marcaActual=ciclo;
    let N;
    try{N=await marcas(am,ctx,activas.map(f=>f.clave),false);}
    catch(e){motivo('SIN_MARCA_FINAL');R.errores.push(['(marcas)','No se pudo tomar la marca final: '+errTexto(e)]);ultima=null;break;}
    R.marcas.push(N);
    const relee=[],cambiadas=new Set();
    for(const f of activas){
     const d=datos.get(f.clave),a=ultima.marcas[f.clave],b=N.marcas[f.clave];
     if(d.error){relee.push(f);continue;}
     if(d.sinMarca||(a&&a.error)||(b&&b.error)){d.sinMarca=true;continue;}
     // Válida sólo si no cambió entre la marca anterior y ésta y el conteo coincide con el servidor.
     if(firma(a)!==firma(b))cambiadas.add(f.clave);
     if(cambiadas.has(f.clave)||!b||Number(b.filas)!==d.filas.length)relee.push(f);
    }
    ultima=N;
    if(!relee.length)break;
    if(ciclo>=am.ciclos){
     for(const f of relee){
      const d=datos.get(f.clave);
      if(d.error)continue;
      const b=N.marcas[f.clave];
      d.inconsistente=cambiadas.has(f.clave)?'CAMBIO_CONCURRENTE':'CONTEO_DIFERENTE';
     }
     break;
    }
    am.progreso({fase:'relectura',texto:'Releyendo '+relee.length+' fuentes que cambiaron…'});
    for(const f of relee)datos.delete(f.clave);
    await leer(relee);
   }
  }
  // Estado por fuente.
  for(const f of activas){
   const d=datos.get(f.clave),m=ultima&&ultima.marcas[f.clave];
   const reg={estado:d.error?'ERROR':d.inconsistente||(d.sinMarca?'LEIDA_SIN_MARCA':'LEIDA'),filas:d.filas.length,filas_servidor:m&&m.filas!=null?Number(m.filas):null,huella:m&&m.huella||null,
    max_actualizado:m?m.max_actualizado:null,tipo_marca:m&&m.tipo||null,paginas:d.est.paginas,reintentos:d.est.reintentos,error:d.error||null,por_obra:m&&m.por_obra||null};
   R.fuentes[f.clave]=reg;
   if(d.error){motivo('ERROR_LECTURA');R.errores.push([f.clave,d.error]);}
   else if(d.sinMarca){motivo('SIN_MARCA_TABLA');}
   else if(d.inconsistente){motivo(d.inconsistente);R.errores.push([f.clave,d.inconsistente==='CONTEO_DIFERENTE'?'El conteo leído no coincide con el servidor.':'La tabla siguió cambiando durante la exportación.']);}
  }
  am.progreso({fase:'armado',texto:'Armando el libro…'});
  const libro=await armar(am,ctx,R,activas,datos,columnas);
  am.progreso({fase:'escritura',texto:'Escribiendo Excel…'});
  const partes=planificar(libro.hojas,am);
  const fecha=am.reloj(),sello=fecha.getFullYear()+'-'+String(fecha.getMonth()+1).padStart(2,'0')+'-'+String(fecha.getDate()).padStart(2,'0')+'_'+String(fecha.getHours()).padStart(2,'0')+String(fecha.getMinutes()).padStart(2,'0');
  const base=FORMATO+'_'+empresa+'_'+sello+(R.estado==='INCOMPLETO'?'_INCOMPLETO':'');
  partes.forEach((p,i)=>{p.nombre=base+(partes.length>1?'_parte'+(i+1)+'de'+partes.length:'')+'.xlsx';});
  R.duracion_preparacion_ms=Date.now()-t0;
  for(let i=0;i<partes.length;i++){
   const man=manifiesto(am,ctx,R,libro,partes,i);
   const bytes=await escribir(am,ctx,[man,...partes[i].hojas]);
   partes[i].bytes=bytes;
  }
  R.duracion_ms=Date.now()-t0;
  for(const p of partes){
   await am.descargar(p.bytes,p.nombre);
   R.archivos.push({nombre:p.nombre,bytes:p.bytes.length,hojas:p.hojas.map(h=>h.nombre)});
   if(am.registrar){try{await am.registrar({SheetNames:p.hojas.map(h=>h.nombre),__auditObraIds:ctx.obras},p.nombre);}catch(e){R.limitaciones.push('No se registró la exportación en bitácora: '+errTexto(e));}}
   if(partes.length>1)await dormir(am.espera);
  }
  return {estado:R.estado,motivos:R.motivos,errores:R.errores,archivos:R.archivos,fuentes:R.fuentes,control:libro.control,manifiestoBase:{id:ctx.idRespaldo,formato:FORMATO,empresa,obras:ctx.obras,permisos:ctx.permisos},
   partes:partes.map(p=>({nombre:p.nombre,bytes:p.bytes})),duracion_ms:R.duracion_ms,cuadre:libro.cuadre,movimientos:libro.movimientos,
   reintentar:()=>exportar(op)};
 }

 /* ---------- armado de hojas lógicas ---------- */
 async function armarHojas(am,ctx,R,activas,datos,columnas){
  const obrasMap=new Map(am.obras.map(o=>[o.id,o]));
  const cent=datos.get('obras');if(cent&&!cent.error)for(const o of cent.filas)obrasMap.set(o.id,{...obrasMap.get(o.id),...o});
  const nombreCentro=id=>id&&obrasMap.get(id)?obrasMap.get(id).nombre:null;
  const largos=[],cont={urls:0},hojas=[],control=[];
  const registraLargo=(hoja,registro,campo,s)=>{const ref='TL'+String(largos.length+1).padStart(6,'0'),p=partirTexto(s);largos.push({ref,hoja,registro,campo,partes:p,longitud:s.length});return {largo:ref,partes:p.length,longitud:s.length};};
  const logica=(nombre,dominio,fuente,cols,filas,extra={})=>{const h={nombre,dominio,fuente,cols,filas,...extra};hojas.push(h);return h;};
  const pkIdx=(cols,pk)=>pk.map(c=>cols.findIndex(x=>x.campo===c));
  for(const f of activas){
   const d=datos.get(f.clave),filas=d.filas;
   const meta=columnas[f.clave]||null;
   let campos=meta?meta.map(c=>c[0]):[];
   const tipoBD=new Map(meta?meta.map(c=>[c[0],c[1]]):[]);
   if(f.select)campos=f.select.split(',');
   for(const x of filas)for(const k of Object.keys(x))if(!campos.includes(k)&&!/__origen$/.test(k))campos.push(k);
   const omit=[];
   if(!ctx.permisos.vip&&f.omitirSinVip)for(const c of f.omitirSinVip){omit.push(c);R.omitidos.push([f.hoja,c,'Requiere acceso VIP (previsión social / datos internos).']);}
   for(const [c,m] of Object.entries(f.omitidos||{})){R.omitidos.push([f.hoja,c,m]);campos=campos.filter(x=>x!==c);}
   if(f.clave==='infonavit_avisos_archivos'||f.clave==='prestaciones_fuentes_historicas'||f.clave==='app_usuarios')campos=campos.filter(c=>f.select.split(',').includes(c));
   campos=campos.filter(c=>!omit.includes(c)&&tipoBD.get(c)!=='bytea');
   if(f.clave==='config'){
    const hc=hojaConfig(ctx,f,filas),reg=R.fuentes[f.clave];hojas.push(hc);
    control.push([f.dominio,f.hoja,f.clave,'(TOTAL)',null,filas.length,reg.filas_servidor,hc.filas.length,reg.filas_servidor==null?'SIN_MARCA':(reg.filas_servidor===filas.length?'SI':'NO'),null,null,null,'Una fila por clave leída; la hoja tiene una fila por campo autorizado.']);
    continue;
   }
   const cols=[];
   for(const c of campos){
    const muestra=filas.find(x=>x[c]!=null);
    cols.push({campo:c,tipo:tipoDe(c,tipoBD.get(c),muestra&&muestra[c]),origen:(f.alcance==='interna'?'interna:'+f.clave:f.tabla)+'.'+c,tipoBD:tipoBD.get(c)||''});
    if(c==='obra_id')cols.push({campo:'centro',tipo:'TEXTO',origen:'DERIVADO: CENTROS.nombre',derivado:true});
    if((f.precision||[]).includes(c))cols.push({campo:c+'__origen',tipo:'TEXTO',origen:'TEXTO_ORIGEN: '+f.tabla+'.'+c+'::text',precisionDe:c});
   }
   if(f.clave==='trabajadores'){cols.push({campo:'docs_entregados',tipo:'ENTERO',origen:'DERIVADO: docs',derivado:true});cols.push({campo:'bajas_revertidas',tipo:'ENTERO',origen:'DERIVADO: REVERSIONES_BAJA (estado APLICADA)',derivado:true});}
   if(f.clave==='documentos'){cols.push({campo:'estado_documento',tipo:'TEXTO',origen:'DERIVADO: anulado',derivado:true});cols.push({campo:'almacenamiento',tipo:'TEXTO',origen:'DERIVADO: archivo',derivado:true});}
   if(f.clave==='historial')cols.push({campo:'campos_cambiados',tipo:'TEXTO',origen:'DERIVADO: datos_antes vs datos_despues',derivado:true});
   for(const c of cols){
    c.clave=f.pk.includes(c.campo)?'PK':null;
    const rel=c.campo==='obra_id'?'CENTROS':(f.rel&&f.rel[c.campo])||(['trabajador_id','empleado_id'].includes(c.campo)&&f.clave!=='trabajadores'?'PADRON':null);
    if(rel&&!c.clave){c.clave='FK';c.relacion=rel+'.id';}
    c.permiso=f.permiso||null;c.desc=DESC[c.campo]||null;
   }
   const RVt=datos.get('control_reversiones_baja'),revPorTrab=new Map();
   for(const r of RVt&&!RVt.error?RVt.filas:[])if(texto(r.estado).toUpperCase()==='APLICADA')revPorTrab.set(r.trabajador_id,(revPorTrab.get(r.trabajador_id)||0)+1);
   const urlCampo=new Set(cols.filter(c=>/url|link|evidencia|archivo|ruta/.test(c.campo)).map(c=>c.campo));
   const docsBase=am.docs;
   const salida=new Array(filas.length);
   for(let i=0;i<filas.length;i++){
    const x=filas[i],fila=new Array(cols.length);
    for(let k=0;k<cols.length;k++){
     const c=cols[k];let v;
     if(c.campo==='centro')v=nombreCentro(x.obra_id);
     else if(c.precisionDe)v=x[c.campo]===undefined?null:x[c.campo];
     else if(c.campo==='bajas_revertidas')v=revPorTrab.get(x.id)||0;
     else if(c.campo==='docs_entregados'){const dd=x.docs&&typeof x.docs==='object'?x.docs:{};v=docsBase.length?docsBase.filter(k2=>dd[k2]==='ENTREGADO').length:Object.values(dd).filter(y=>y==='ENTREGADO').length;}
     else if(c.campo==='estado_documento')v=x.anulado?'ANULADO':'VIGENTE';
     else if(c.campo==='almacenamiento')v=x.archivo?'STORAGE_PRIVADO':null;
     else if(c.campo==='campos_cambiados')v=camposCambiados(x.datos_antes,x.datos_despues);
     else v=valorLogico(x[c.campo],c.tipo);
     if(typeof v==='string'){
      if(urlCampo.has(c.campo))v=sanearUrl(v,cont);
      if(v.length>LIM_CELDA)v=registraLargo(f.hoja,llave(f,x),c.campo,v);
     }
     fila[k]=v;
    }
    salida[i]=fila;
   }
   const h=logica(f.hoja,f.dominio,f.clave,cols,salida,{desc:f.desc,permiso:f.permiso||null,pkIdx:pkIdx(cols,f.pk),pk:f.pk,estado:R.fuentes[f.clave].estado});
   control.push(...controlDe(f,h,filas,R.fuentes[f.clave],nombreCentro));
  }
  // Movimientos laborales derivados (reingresos por evento).
  const T=datos.get('trabajadores'),H=datos.get('historial');let mov=null;
  if(T&&H){
   const RV=datos.get('control_reversiones_baja');
   mov=movimientosLaborales(T.filas,H.filas,nombreCentro,RV&&!RV.error?RV.filas:[]);
   const cols=COLS_MOV.map(c=>({campo:c,tipo:TIPOS_MOV[c]||'TEXTO',origen:'DERIVADO: HISTORIAL y PADRON',derivado:true,clave:c==='evento_id'?'PK':(['trabajador_id','obra_id','historial_id'].includes(c)?'FK':null),
    relacion:{trabajador_id:'PADRON.id',obra_id:'CENTROS.id',historial_id:'HISTORIAL.id'}[c]||null,desc:{ciclo:'Ciclo laboral (1 = alta original; cada reingreso abre uno nuevo).',fecha_efectiva:'Fecha efectiva del movimiento.',
     fuente:'HISTORIAL (evento documentado) o PADRON_VIGENTE (fecha vigente sin evento).',evidencia:'Calidad de la evidencia del evento.'}[c]||DESC[c]||null}));
   const filas=mov.eventos.map(e=>COLS_MOV.map(c=>e[c]===undefined?null:e[c]));
   logica('MOVIMIENTOS_LABORALES','MOVIMIENTOS','(derivado)',cols,filas,{desc:'Un evento por movimiento documentado: alta, baja, reingreso con fecha efectiva, traslado y correcciones, con ciclo y fuente.',pkIdx:[0],pk:['evento_id'],estado:(T.error||H.error)?'INCOMPLETA':'DERIVADA'});
   const porTipo=new Map();
   for(const e of mov.eventos){const k=e.tipo_evento+'|'+(e.obra_id||'');porTipo.set(k,(porTipo.get(k)||0)+1);}
   for(const [k,n] of [...porTipo].sort()){const [t,o]=k.split('|');control.push(['MOVIMIENTOS','MOVIMIENTOS_LABORALES','(derivado) '+t,o||null,nombreCentro(o),n,n,null,'SI',null,null,null,'Eventos '+t]);}
   const L=mov.limitaciones;
   if(L.sin_evidencia.reingresos)R.limitaciones.push(L.sin_evidencia.reingresos+' reingresos vigentes del padrón no tienen evento en historial; se registran como SOLO_PADRON_VIGENTE.');
   if(L.ciclos_sin_alta)R.limitaciones.push(L.ciclos_sin_alta+' personas tienen movimientos sin alta documentada en historial (ciclo antiguo): se conserva lo disponible.');
   if(T.error||H.error)R.limitaciones.push('MOVIMIENTOS_LABORALES incompleto: no se leyó completo el padrón o el historial.');
  }
  // Hojas de compatibilidad V0 (una por centro, mismo nombre y columnas).
  if(T&&!T.error){
   const lc=LEGADO_COLS.map(([c,l])=>({campo:c,etiqueta:l,tipo:tipoDe(c,(columnas.trabajadores||[]).find(x=>x[0]===c)?.[1]),origen:'PADRON.'+c,legado:true}))
    .concat([{campo:'docs_entregados',etiqueta:'DOCS ENTREGADOS',tipo:'TEXTO',origen:'DERIVADO: docs',legado:true,derivado:true},{campo:'fecha_reingreso',etiqueta:'FECHA REINGRESO',tipo:'FECHA',origen:'PADRON.fecha_reingreso',legado:true},{campo:'id',etiqueta:'ID TRABAJADOR',tipo:'ID',origen:'PADRON.id',legado:true}]);
   const totalDocs=am.docs.length||7;
   for(const id of ctx.obras){
    const o=obrasMap.get(id);if(!o)continue;
    const ws=T.filas.filter(w=>w.obra_id===id&&!w.eliminado).sort((a,b)=>(a.no_trab??9e9)-(b.no_trab??9e9));
    const filas=ws.map(w=>lc.map(c=>{
     if(c.campo==='docs_entregados'){const dd=w.docs||{};return (am.docs.length?am.docs.filter(k=>dd[k]==='ENTREGADO').length:0)+'/'+totalDocs;}
     const v=valorLogico(w[c.campo],c.tipo);if(typeof v==='string'&&v.length>LIM_CELDA)return registraLargo(o.nombre,w.id,c.campo,v);return v===null?'':v;
    }));
    logica(o.nombre,'PADRON','(compatibilidad V0)',lc,filas,{legado:true,obra_id:id,desc:'Vista de compatibilidad V0 del padrón del centro (sin papelera).'});
   }
  }
  const cuadre=cuadreTablero(ctx,datos);
  for(const c of cuadre.filas)control.push(c);
  return {hojas,control,largos,cont,cuadre,movimientos:mov,obrasMap,R};
 }
 function camposCambiados(a,d){
  if(!a||!d||typeof a!=='object'||typeof d!=='object')return null;
  const out=[];
  for(const k of new Set([...Object.keys(a),...Object.keys(d)])){
   const x=a[k],y=d[k];
   if(x===y)continue;
   if(x&&y&&typeof x==='object'&&typeof y==='object'&&JSON.stringify(x)===JSON.stringify(y))continue;
   out.push(k);
  }
  return out.join(',');
 }
 function hojaConfig(ctx,f,filas){
  const permit=CONFIG_PERMITIDA(ctx.empresa),out=[];
  for(const r of filas.slice().sort((a,b)=>texto(a.clave).localeCompare(texto(b.clave)))){
   const regla=permit[r.clave];if(!regla)continue;const v=r.valor;
   if(regla==='*ARREGLO*'){if(Array.isArray(v))out.push([r.clave,'(arreglo)',JSON.stringify(v),r.actualizado_por??null,r.updated_at??null]);continue;}
   if(!v||typeof v!=='object')continue;
   const campos=regla==='*NUMEROS*'?Object.keys(v).filter(k=>typeof v[k]==='number'):regla.filter(k=>k in v);
   for(const k of campos.sort())out.push([r.clave,k,JSON.stringify(v[k]),r.actualizado_por??null,r.updated_at??null]);
  }
  const cols=[['clave','TEXTO','PK'],['campo','TEXTO','PK'],['valor_json','JSON',null],['actualizado_por','TEXTO',null],['updated_at','FECHA_HORA',null]].map(([c,t,k])=>({campo:c,tipo:t,clave:k,origen:'config.'+(c==='valor_json'?'valor->campo':c),desc:{valor_json:'Valor del campo autorizado (JSON).'}[c]||DESC[c]||null}));
  return {nombre:f.hoja,dominio:f.dominio,fuente:f.clave,cols,filas:out,desc:f.desc,pk:['clave','campo'],pkIdx:[0,1],estado:'LEIDA'};
 }
 function controlDe(f,h,filas,reg,nombreCentro){
  const out=[],grupos=new Map();
  const conObra=filas.some(x=>'obra_id' in x);
  for(const x of filas){const k=conObra?(x.obra_id||''):'';if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(x);}
  const porObra=reg.por_obra||{};
  const filasHoja=h.filas.length;
  const fila=(o,lista,campo)=>{
   const serv=o==='(TOTAL)'?reg.filas_servidor:(o&&porObra[o]!==undefined?Number(porObra[o]):(conObra&&reg.por_obra?0:null));
   const tot=campo?lista.reduce((s,x)=>s+centavos(x[campo]),0):null;
   return [f.dominio,f.hoja,f.clave,o==='(TOTAL)'?'(TOTAL)':(o||null),o==='(TOTAL)'?null:nombreCentro(o),lista.length,serv,o==='(TOTAL)'?filasHoja:null,
    serv==null?'SIN_MARCA':(serv===lista.length?'SI':'NO'),campo,tot==null?null:tot/100,tot==null?null:String(tot),reg.estado];
  };
  const campos=(f.totales||[]).filter(c=>h.cols.some(x=>x.campo===c));
  for(const [o,lista] of conObra?[...grupos].sort():[]){
   if(!campos.length)out.push(fila(o,lista,null));
   for(const c of campos)out.push(fila(o,lista,c));
  }
  if(!campos.length)out.push(fila('(TOTAL)',filas,null));
  for(const c of campos)out.push(fila('(TOTAL)',filas,c));
  if(f.clave==='control_pago_aplicaciones'){
   const vig=filas.filter(x=>!x.retirado_en),ret=filas.filter(x=>x.retirado_en);
   out.push([f.dominio,f.hoja,f.clave+' (vigentes)','(TOTAL)',null,vig.length,null,null,'SIN_MARCA','importe',vig.reduce((s,x)=>s+centavos(x.importe),0)/100,String(vig.reduce((s,x)=>s+centavos(x.importe),0)),'Aplicaciones sin retiro']);
   out.push([f.dominio,f.hoja,f.clave+' (retiradas)','(TOTAL)',null,ret.length,null,null,'SIN_MARCA','importe',ret.reduce((s,x)=>s+centavos(x.importe),0)/100,String(ret.reduce((s,x)=>s+centavos(x.importe),0)),'Aplicaciones retiradas (se conservan)']);
  }
  if(f.clave==='control_obligaciones_pago'){
   const vig=filas.filter(x=>x.vigente===true);
   out.push([f.dominio,f.hoja,f.clave+' (vigentes)','(TOTAL)',null,vig.length,null,null,'SIN_MARCA','importe',vig.reduce((s,x)=>s+centavos(x.importe),0)/100,String(vig.reduce((s,x)=>s+centavos(x.importe),0)),'Obligaciones vigentes']);
  }
  return out;
 }
 /* Cuadre con el tablero: si el modelo del tablero está cargado, calcula sus
    medidas sobre las mismas fuentes exportadas para compararlas al centavo. */
 const CUADRE_DESDE='2000-01-01',CUADRE_HASTA='2099-12-31';
 const diaMX=ts=>{if(!ts)return null;const d=new Date(ts);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):null;};
 /* Efectivo autorizado como lo deriva el tablero: finiquito de un cierre con excepción NOI individual
    cuyo finiquito_efectivo coincide con el importe de la obligación; fecha = día local de registro. */
 function efectivoDe(ob,exc){
  if(!ob||!exc)return [];
  const idx=new Map(exc.map(x=>[x.cierre_id+'|'+x.trabajador_id,x])),out=[];
  for(const o of ob){
   if(texto(o.tipo).toUpperCase()!=='FINIQUITO'||!o.cierre_id)continue;
   const x=idx.get(o.cierre_id+'|'+o.trabajador_id);
   if(x&&x.finiquito_efectivo!=null&&centavos(x.finiquito_efectivo)===centavos(o.importe))out.push({obligacion_id:o.id,importe:x.finiquito_efectivo,fecha:diaMX(x.registrado_en)});
  }
  return out;
 }
 /* Comprobantes fiscales: XML/recibos con UUID del expediente y lecturas PDF con UUID. */
 function cfdiDe(docs,lect){
  const out=[],conUuid=new Set();
  for(const d of docs){
   if(!['CFDI_NOMINA','RECIBO_NOMINA'].includes(d.categoria)||!texto(d.cfdi_uuid).trim())continue;conUuid.add(d.id);
   out.push({documento_id:d.id,obra_id:d.obra_id,trabajador_id:d.trabajador_id,uuid:d.cfdi_uuid,neto:d.categoria==='CFDI_NOMINA'?d.cfdi_total:(d.nomina_neto??d.cfdi_total),
    desde:d.periodo_inicio,hasta:d.periodo_fin,tipo:d.nomina_tipo,formato:d.categoria==='CFDI_NOMINA'?'XML':'PDF',anulado:!!d.anulado});
  }
  for(const l of lect)if(texto(l.uuid).trim()&&!conUuid.has(l.documento_id))
   out.push({documento_id:l.documento_id,obra_id:l.obra_id,trabajador_id:l.trabajador_id,uuid:l.uuid,neto:l.neto,desde:l.desde,hasta:l.hasta,tipo:l.tipo,formato:'PDF',anulado:false});
  return out;
 }
 function cuadreTablero(ctx,datos){
  const g=k=>{const d=datos.get(k);return d&&!d.error?d.filas:null;};
  const ob=g('control_obligaciones_pago'),ev=g('control_evidencias_pago'),ap=g('control_pago_aplicaciones');
  const filas=[],sum=(l,f)=>l?l.reduce((s,x)=>s+(f(x)?centavos(x.importe):0),0):null;
  const add=(medida,origen,c,nota)=>filas.push(['CUADRE_TABLERO',medida,origen,'(TOTAL)',null,null,null,null,null,'importe',c==null?null:c/100,c==null?null:String(c),nota]);
  add('obligaciones_vigentes','RESPALDO',sum(ob,x=>x.vigente===true),'Suma de importe de obligaciones vigentes exportadas.');
  add('evidencias','RESPALDO',sum(ev,()=>true),'Suma de importe de evidencias exportadas.');
  add('aplicaciones_vigentes','RESPALDO',sum(ap,x=>!x.retirado_en),'Suma de aplicaciones no retiradas.');
  const M=root.PLATINUM_TABLERO_MODELO;
  if(!M||typeof M.calcular!=='function'){add('modelo_tablero','NO_DISPONIBLE',null,'PLATINUM_TABLERO_MODELO no estaba cargado al exportar; compare con el tablero usando las sumas anteriores.');return {disponible:false,filas};}
  if(!ob||!ev||!ap){add('modelo_tablero','INCOMPLETO',null,'Faltan obligaciones, evidencias o aplicaciones completas para cuadrar.');return {disponible:true,filas};}
  try{
   // Mismas filas exportadas, con la forma de fuentes de PLATINUM_TABLERO_MODELO.calcular (A1).
   const fuentes={ahora:ctx.inicio.toISOString(),obras:g('obras')||[],cierres:g('control_cierres_nomina')||[],versiones:g('control_cierre_versiones')||[],flujo:g('control_flujo_cierres')||[],
    trabajadores:g('trabajadores')||[],cuadrillas:g('cuadrillas')||[],obligaciones:ob,evidencias:ev,aplicaciones:ap,pagos:g('pagos')||[],cheques:g('cheques')||[],historial:g('historial')||[],
    finiquitos_transferencia:g('control_finiquitos_transferencia')||[],desglose_noi:g('control_desglose_noi')||[],entregas:g('reunion_cheques_entrega')||[],
    cfdi:cfdiDe(g('documentos')||[],g('lecturas_fiscales_documentos')||[]),efectivo_autorizado:efectivoDe(ob,g('excepciones_noi_individuales')),errores:[],
    permisos:{vip:!!ctx.permisos.vip,obras:ctx.obras.slice(),empresas:[ctx.empresa]}};
   const res={};
   for(const persp of ['PERIODO','PAGO']){
    const r=M.calcular(fuentes,{empresa:ctx.empresa,obras:ctx.obras.slice(),perspectiva:persp,desde:CUADRE_DESDE,hasta:CUADRE_HASTA});
    res[persp]=r;const medidas=r&&r.medidas||{};
    for(const k of ['neto_conciliado','pagado_registrado','pagado_conciliado','saldo_por_cubrir','excedentes','sin_asignar','pendiente_conciliacion']){
     const m=medidas[k];if(!m)continue;const v=typeof m==='number'?m:m.valor;
     add(k,'PLATINUM_TABLERO_MODELO · '+persp,v==null?null:Math.round(Number(v)*100),'Rango '+CUADRE_DESDE+' a '+CUADRE_HASTA+'. '+(m.formula?String(m.formula).slice(0,400):''));
    }
    filas.push(['CUADRE_TABLERO','huella_tablero','PLATINUM_TABLERO_MODELO · '+persp,'(TOTAL)',null,null,null,null,null,null,null,null,(r&&r.version||'')+' '+(r&&r.huella||'')]);
   }
   if(!datos.get('excepciones_noi_individuales')||datos.get('excepciones_noi_individuales').error)
    filas.push(['CUADRE_TABLERO','efectivo_autorizado','SIN_FUENTE','(TOTAL)',null,null,null,null,null,null,null,null,'Sin acceso VIP no se exportan las excepciones NOI: el cuadre excluye finiquitos en efectivo autorizados y puede diferir del tablero del servidor.']);
   filas.push(['CUADRE_TABLERO','respaldo_fiscal','NO_CUADRADO','(TOTAL)',null,null,null,null,null,null,null,null,'La medida respaldo_fiscal no se cuadra en el respaldo (depende de lecturas fiscales internas).']);
   return {disponible:true,filas,resultado:res};
  }catch(e){add('modelo_tablero','ERROR',null,'El modelo del tablero no pudo calcular: '+errTexto(e));return {disponible:true,filas,error:errTexto(e)};}
 }

 /* ---------- partes y hojas físicas ---------- */
 function tamFila(f){let s=0;for(const v of f)s+=typeof v==='string'?v.length+4:12;return s;}
 function planificar(logicas,am){
  const maxFilas=am.limiteFilas-1,pres=am.presupuesto,usados=new Set(['manifiesto']);
  const partes=[];let actual={hojas:[],tam:0};partes.push(actual);
  const nueva=()=>{actual={hojas:[],tam:0};partes.push(actual);};
  const fisica=(L,k,desde)=>({L,nombre:null,k,desde,filas:[],tam:0});
  for(const L of logicas){
   let k=0,ch=fisica(L,k,0);
   for(let i=0;i<L.filas.length;i++){
    const t=tamFila(L.filas[i]);
    if(ch.filas.length&&(ch.filas.length>=maxFilas||actual.tam+ch.tam+t>pres)){
     actual.hojas.push(ch);actual.tam+=ch.tam;
     if(actual.tam+t>pres&&actual.hojas.length)nueva();
     ch=fisica(L,++k,i);
    }
    ch.filas.push(L.filas[i]);ch.tam+=t;
   }
   if(actual.tam+ch.tam>pres&&actual.hojas.length)nueva();
   actual.hojas.push(ch);actual.tam+=ch.tam;
  }
  if(!partes[partes.length-1].hojas.length)partes.pop();
  for(const p of partes)for(const h of p.hojas){
   const base=h.k===0?h.L.nombre:(h.L.nombre.slice(0,26)+'_P'+(h.k+1));
   h.nombre=nombreHoja(base,usados);h.hasta=h.desde+h.filas.length;
  }
  return partes.map(p=>({hojas:p.hojas,tam:p.tam}));
 }
 /* Las hojas de control (CONTROL, DICCIONARIO, TEXTOS_LARGOS) se agregan como lógicas. */
 function hojasControl(ctx,R,libro){
  const L=[];
  const C=['DOMINIO','HOJA','FUENTE','OBRA_ID','CENTRO','FILAS_EXPORTADAS','FILAS_SERVIDOR','FILAS_HOJA','COINCIDE','CAMPO_IMPORTE','TOTAL_IMPORTE','TOTAL_CENTAVOS','NOTA'];
  const tiposC={OBRA_ID:'ID',FILAS_EXPORTADAS:'ENTERO',FILAS_SERVIDOR:'ENTERO',FILAS_HOJA:'ENTERO',TOTAL_IMPORTE:'IMPORTE',TOTAL_CENTAVOS:'TEXTO'};
  L.push({nombre:'CONTROL',dominio:'CONTROL',fuente:'(control)',cols:C.map(c=>({campo:c,tipo:tiposC[c]||'TEXTO',origen:'CONTROL'})),filas:libro.control,desc:'Conteos y totales verificables por dominio y centro; cuadre con el tablero.',control:true});
  const D=['HOJA','CAMPO','TIPO','CLAVE','RELACION','PERMISO','ORIGEN','DESCRIPCION','ETIQUETA_LEGADO'],dic=[];
  for(const h of libro.hojas){
   if(h.legado){continue;}
   for(const c of h.cols)dic.push([h.nombre,c.campo,c.tipo,c.clave||null,c.relacion||null,c.permiso||h.permiso||null,c.origen||null,c.desc||(c.precisionDe?'Precisión de origen como texto de '+c.precisionDe+'.':'Campo '+c.campo+' de '+(h.fuente||h.nombre)+'.'),null]);
  }
  for(const [hoja,campo,m] of R.omitidos)dic.push([hoja,campo,'OMITIDO',null,null,null,'NO_EXPORTADO',m,null]);
  const lc=libro.hojas.find(h=>h.legado);
  if(lc)for(const c of lc.cols)dic.push(['(hoja por centro V0)',c.campo,c.tipo,null,c.campo==='id'?'PADRON.id':null,null,c.origen,'Vista de compatibilidad V0.',c.etiqueta]);
  L.push({nombre:'DICCIONARIO',dominio:'CONTROL',fuente:'(control)',cols:D.map(c=>({campo:c,tipo:'TEXTO',origen:'DICCIONARIO'})),filas:dic,desc:'Campo, tipo, clave, relación, permiso, origen y descripción.',control:true});
  if(libro.largos.length){
   const T=['ref','hoja','registro','campo','parte','partes','longitud_total','sha256','fragmento'],fl=[];
   for(const x of libro.largos)x.partes.forEach((p,i)=>fl.push([x.ref,x.hoja,x.registro,x.campo,i+1,x.partes.length,x.longitud,x.sha256||null,p]));
   L.push({nombre:'TEXTOS_LARGOS',dominio:'CONTROL',fuente:'(control)',cols:T.map(c=>({campo:c,tipo:['parte','partes','longitud_total'].includes(c)?'ENTERO':'TEXTO',origen:'TEXTOS_LARGOS'})),filas:fl,
    desc:'Textos de más de 32,767 caracteres en partes ordenadas; concatena por ref y parte.',control:true});
  }
  return L;
 }
 function manifiesto(am,ctx,R,libro,partes,i){
  const C=['SECCION','CLAVE','VALOR','DETALLE','HOJA_LOGICA','FUENTE','PARTE','DESDE_FILA','HASTA_FILA','DOMINIO'],f=[];
  const add=(s,k,v,d,hl,fu,pa,de,ha,dom)=>f.push([s,k,v===undefined?null:v,d??null,hl??null,fu??null,pa??null,de??null,ha??null,dom??null]);
  const sn=b=>b?'SI':'NO',u=am.usuario||{};
  add('GENERAL','formato',FORMATO);add('GENERAL','version_exportador',VERSION_EXPORTADOR);add('GENERAL','version_app',am.version||null);
  add('GENERAL','id_respaldo',ctx.idRespaldo);add('GENERAL','generado_en',ctx.inicio.toISOString(),'Hora local: '+ctx.inicio.toString());
  add('GENERAL','usuario',u.email||null);add('GENERAL','razon_social',ctx.empresa,(am.empresas[ctx.empresa]||{}).nombre||null);
  add('GENERAL','estado',R.estado,R.motivos.join(', ')||null);add('GENERAL','parte',i+1,'de '+partes.length);
  add('GENERAL','alcance','INTEGRAL','Todas las fuentes autorizadas de los centros seleccionados; sin filtros de fecha ni de vista.');
  add('GENERAL','filtros','ninguno');
  const m0=R.marcas[0],mf=R.marcas[R.marcas.length-1];
  add('GENERAL','fuente_temporal',mf&&mf.generado_en||null,R.modoMarcas==='SERVIDOR'?'Instantánea equivalente: cada tabla coincide con la marca final del servidor (conteo, máximos de fecha y huella); MARCAS se calcula en una sola consulta.':'Sin marcas del servidor: no se verificó consistencia.');
  add('GENERAL','marca_inicial',m0&&m0.generado_en||null);add('GENERAL','tomas_de_marcas',R.marcas.length);
  add('GENERAL','permisos','VIP='+sn(ctx.permisos.vip)+' · SALUD='+sn(ctx.permisos.salud)+' · ADMIN='+sn(ctx.permisos.admin));
  add('GENERAL','configuracion',sn(ctx.incluirConfiguracion),'Sólo claves y campos explícitos; nunca credenciales.');
  add('GENERAL','originales','Storage privado','Los archivos originales no se incrustan ni se enlazan con URLs firmadas; DOCUMENTOS lleva ruta lógica privada y huella.');
  add('GENERAL','duracion_preparacion_ms',R.duracion_preparacion_ms??null,'Lectura, verificación y armado (sin escritura).');
  add('GENERAL','urls_firmadas_saneadas',libro.cont.urls);
  for(const id of ctx.obras){const o=libro.obrasMap.get(id)||{};add('CENTRO',id,o.nombre||null,o.activa===false?'INACTIVO':'ACTIVO');}
  for(const [obj,m] of R.excluidas)add('CENTRO_EXCLUIDO',obj,null,m);
  partes.forEach((p,k)=>add('ARCHIVO',p.nombre,p.hojas.length+1,k===i?'este archivo':null,null,null,k+1));
  partes.forEach((p,k)=>{for(const h of p.hojas)add('HOJA',h.nombre,h.filas.length,h.L.desc||null,h.L.nombre,h.L.fuente,k+1,h.desde+1,h.hasta,h.L.dominio);});
  for(const fu of FUENTES){
   const r=R.fuentes[fu.clave];if(!r)continue;
   add('FUENTE',fu.clave,r.estado,r.error||r.motivo||null,fu.hoja,fu.tabla,null,r.filas??null,r.filas_servidor??null,fu.dominio);
   if(r.huella)add('FUENTE_HUELLA',fu.clave,r.huella,'max_actualizado='+(r.max_actualizado||'∅')+' · páginas='+r.paginas+' · reintentos='+r.reintentos);
   if(r.estado!=='OMITIDA_PERMISO')add('FUENTE_MARCA',fu.clave,r.tipo_marca||'SIN_MARCA',ALCANCE_MARCA[r.tipo_marca]||'Sin marca del servidor: no se verificó consistencia de esta fuente.');
  }
  for(const [obj,m] of EXCLUSIONES)add('EXCLUSION',obj,null,m);
  for(const [h,c,m] of R.omitidos)add('CAMPO_OMITIDO',h+'.'+c,null,m);
  for(const l of R.limitaciones)add('LIMITACION',null,null,l);
  for(const [fu,e] of R.errores)add('ERROR',fu,null,e);
  for(const [a,b] of COMPATIBILIDAD)add('COMPATIBILIDAD',a,null,b);
  add('CONVENCION',NULO,null,'Valor nulo en la base (distinto de vacío y de cero).');
  add('CONVENCION','(celda vacía)',null,'Texto vacío.');
  add('CONVENCION','0',null,'Cero numérico.');
  add('CONVENCION',MARCA+MARCA,null,'Un valor real que empieza con '+MARCA+' se guarda con un '+MARCA+' adicional al inicio.');
  add('CONVENCION',MARCA+' TEXTO_LARGO',null,'El texto completo está en TEXTOS_LARGOS (ref, parte).');
  add('CONVENCION','__origen',null,'Columna con la precisión de origen como texto.');
  add('CONVENCION','Fechas',null,'FECHA = AAAA-MM-DD; FECHA_HORA = ISO 8601 tal como la base.');
  add('CONVENCION','Textos',null,'IDs, CURP, RFC, NSS, CLABE, cuentas, folios y códigos son texto (@); ninguna cadena se evalúa como fórmula.');
  const tipos={VALOR:'TEXTO',PARTE:'ENTERO',DESDE_FILA:'ENTERO',HASTA_FILA:'ENTERO'};
  return {nombre:'MANIFIESTO',L:{nombre:'MANIFIESTO',cols:C.map(c=>({campo:c,tipo:tipos[c]||'TEXTO'})),desc:'Manifiesto'},filas:f,manifiesto:true};
 }

 /* ---------- escritura ---------- */
 function hojaXlsx(X,h){
  const cols=h.L.cols,ws={},n=h.filas.length,anchos=cols.map(c=>Math.min(14,Math.max(8,texto(c.etiqueta||c.campo).length+2)));
  for(let c=0;c<cols.length;c++)ws[X.utils.encode_cell({r:0,c})]={t:'s',v:texto(cols[c].etiqueta||cols[c].campo),s:ESTILO.enc};
  const legado=!!h.L.legado;
  for(let r=0;r<n;r++){
   const fila=h.filas[r];
   for(let c=0;c<cols.length;c++){
    const v=fila[c];
    const cel=legado&&(v===''||v===null)?null:celda(v,cols[c].tipo);
    if(!cel)continue;
    ws[X.utils.encode_cell({r:r+1,c})]=cel;
    if(r<200&&cel.t==='s')anchos[c]=Math.min(50,Math.max(anchos[c],String(cel.v).length+1));
   }
  }
  const ref=X.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(n,1),c:Math.max(cols.length-1,0)}});
  ws['!ref']=ref;ws['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:n,c:Math.max(cols.length-1,0)}})};
  ws['!cols']=anchos.map(w=>({wch:w}));
  return ws;
 }
 const PANEL='<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>';
 async function escribir(am,ctx,hojas){
  const X=am.XLSX,wb=X.utils.book_new();
  wb.__empresaPorHoja={};wb.__auditObraIds=ctx.obras.slice();
  for(const h of hojas){X.utils.book_append_sheet(wb,hojaXlsx(X,h),h.nombre);wb.__empresaPorHoja[h.nombre]=ctx.empresa;}
  let bytes=X.write(wb,{type:'array',bookType:'xlsx',compression:true});
  if(am.JSZip){
   const zip=await am.JSZip.loadAsync(bytes);
   for(let i=0;i<wb.SheetNames.length;i++){
    const ruta='xl/worksheets/sheet'+(i+1)+'.xml',f=zip.file(ruta);if(!f)continue;
    let xml=await f.async('string');
    xml=xml.replace(/<sheetView workbookViewId="0"\s*\/>/,PANEL);
    zip.file(ruta,xml);
   }
   if(am.marca){try{await am.marca(zip,wb);}catch(e){/* la marca es estética; el respaldo no depende de ella */}}
   bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
  }
  return bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 }

 /* Integra hojas de control y hashes de textos largos antes de planificar. */
 async function armar(am,ctx,R,activas,datos,columnas){
  const libro=await armarHojas(am,ctx,R,activas,datos,columnas);
  for(const x of libro.largos)x.sha256=await sha256(x.partes.join(''));
  const ctl=hojasControl(ctx,R,libro);
  // Orden: CONTROL y DICCIONARIO al inicio; TEXTOS_LARGOS al final.
  const largos=ctl.filter(h=>h.nombre==='TEXTOS_LARGOS');
  libro.hojas=[...ctl.filter(h=>h.nombre!=='TEXTOS_LARGOS'),...libro.hojas,...largos];
  return libro;
 }

 /* ---------- interfaz ---------- */
 function abrir(op={}){
  const am=ambiente(op),e=typeof esc==='function'?esc:texto;
  const empresas=Object.keys(am.empresas).filter(c=>am.obras.some(o=>am.empresaDeObra(o)===c));
  const emp=empresas.includes(am.empresaActiva)?am.empresaActiva:(empresas[0]||am.empresaActiva);
  const centros=c=>am.obras.filter(o=>am.empresaDeObra(o)===c);
  const lista=c=>centros(c).map(o=>'<label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" class="rsi-obra" value="'+e(o.id)+'" checked> '+e(o.nombre)+(o.activa===false?' <span style="color:var(--mut)">(inactivo)</span>':'')+'</label>').join('');
  modal('<div class="m-head"><h2>Respaldo integral</h2><button class="x" type="button" id="rsi-cerrar">×</button></div><div class="m-body">'+
   '<p style="font-size:12.5px;color:var(--mut);margin-top:0">Genera un libro con todas las fuentes autorizadas para tu usuario, relacionadas por ID, con MANIFIESTO, DICCIONARIO y CONTROL. Es distinto de la exportación filtrada del tablero. Los originales de documentos permanecen en Storage privado.</p>'+
   '<label>Razón social</label><select id="rsi-empresa">'+empresas.map(c=>'<option value="'+e(c)+'"'+(c===emp?' selected':'')+'>'+e((am.empresas[c]||{}).corto||c)+'</option>').join('')+'</select>'+
   '<div style="margin:10px 0 4px;font-weight:700;font-size:12px">Centros</div><div id="rsi-obras" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px">'+lista(emp)+'</div>'+
   '<label style="display:flex;gap:6px;align-items:center;margin-top:10px;font-size:12.5px"><input type="checkbox" id="rsi-config"> Incluir configuración autorizada (campos explícitos; sin credenciales)</label>'+
   '<div id="rsi-estado" style="margin-top:12px;font-size:12.5px" aria-live="polite"></div></div>'+
   '<div class="m-foot"><button class="btn" type="button" id="rsi-cancelar">Cerrar</button><button class="btn dark" type="button" id="rsi-generar">Generar respaldo integral</button></div>','lg');
  const $$=id=>document.getElementById(id);
  const cerrar=()=>{if(typeof closeModal==='function')closeModal();};
  $$('rsi-cerrar').addEventListener('click',cerrar);$$('rsi-cancelar').addEventListener('click',cerrar);
  $$('rsi-empresa').addEventListener('change',ev=>{$$('rsi-obras').innerHTML=lista(ev.target.value);});
  const generar=async()=>{
   const boton=$$('rsi-generar'),estado=$$('rsi-estado');
   const obras=[...document.querySelectorAll('.rsi-obra')].filter(x=>x.checked).map(x=>x.value);
   if(!obras.length){estado.textContent='Selecciona al menos un centro.';return;}
   boton.disabled=true;estado.textContent='Preparando…';
   const opciones={...op,empresa:$$('rsi-empresa').value,obras,incluirConfiguracion:$$('rsi-config').checked,progreso:p=>{if(estado)estado.textContent=p.texto||('Leyendo '+(p.hoja||p.fuente)+'…');}};
   try{
    const r=await exportar(opciones);
    const err=r.errores.map(x=>'<li>'+e(x[0])+': '+e(x[1])+'</li>').join('');
    estado.innerHTML='<div style="font-weight:700;color:'+(r.estado==='COMPLETO'?'var(--green)':'var(--red)')+'">Respaldo '+e(r.estado)+(r.motivos.length?' · '+e(r.motivos.join(', ')):'')+'</div>'+
     '<div>'+r.archivos.map(a=>e(a.nombre)).join('<br>')+'</div><div style="color:var(--mut)">'+Math.round(r.duracion_ms/100)/10+' s</div>'+(err?'<ul>'+err+'</ul>':'')+
     (r.estado!=='COMPLETO'?'<button class="btn" type="button" id="rsi-reintentar">Reintentar respaldo</button>':'');
    const re=$$('rsi-reintentar');if(re)re.addEventListener('click',()=>{re.remove();generar();});
    if(typeof toast==='function')toast('Respaldo '+r.estado.toLowerCase()+': '+r.archivos.length+' archivo(s).',r.estado==='COMPLETO'?'ok':'err');
    if(op.porCorreo)setTimeout(()=>correo(r),800);
   }catch(x){estado.innerHTML='<div style="color:var(--red)">No se generó el respaldo: '+e(errTexto(x))+'</div><button class="btn" type="button" id="rsi-reintentar">Reintentar</button>';
    const re=$$('rsi-reintentar');if(re)re.addEventListener('click',()=>{re.remove();generar();});}
   finally{boton.disabled=false;}
  };
  $$('rsi-generar').addEventListener('click',generar);
 }
 function correo(r){
  const f=new Date(),nombres=r.archivos.map(a=>a.nombre).join('\n');
  const filas=Object.values(r.fuentes).reduce((s,x)=>s+(x.filas||0),0);
  const body=encodeURIComponent('Respaldo integral PLATINUM ('+FORMATO+') del '+f.toLocaleDateString('es-MX')+'.\n\nEstado: '+r.estado+(r.motivos.length?' ('+r.motivos.join(', ')+')':'')+'\nFilas exportadas: '+filas+
   '\n\nIMPORTANTE: adjunta a este correo los archivos que se acaban de descargar:\n'+nombres+'\n(normalmente en tu carpeta de Descargas)');
  root.location.href='mailto:?subject='+encodeURIComponent('Respaldo integral PLATINUM · '+f.toLocaleDateString('es-MX'))+'&body='+body;
 }

 root.PLATINUM_RESPALDO=Object.freeze({FORMATO,VERSION:VERSION_EXPORTADOR,NULO,
  fuentes:()=>FUENTES.map(f=>({clave:f.clave,tabla:f.tabla,hoja:f.hoja,dominio:f.dominio,alcance:f.alcance,permiso:f.permiso||null,pk:f.pk.slice(),opcional:!!f.opcional,desc:f.desc})),
  dominios:()=>({...DOMINIOS}),exclusiones:()=>EXCLUSIONES.map(x=>x.slice()),compatibilidad:()=>COMPATIBILIDAD.map(x=>x.slice()),
  abrir,exportar,
  _pruebas:Object.freeze({nombreHoja,partirTexto,celda,tipoDe,valorLogico,movimientosLaborales,planificar,camposCambiados,CONFIG_PERMITIDA,LEGADO_COLS})});
})(typeof window!=='undefined'?window:globalThis);
