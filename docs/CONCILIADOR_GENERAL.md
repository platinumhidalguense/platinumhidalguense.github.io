# Conciliador General

Un expediente por centro, periodo y cierre reúne fotografía/NOI, comprobantes bancarios, timbrados y candidatos de cheque. La implementación usa los módulos JavaScript existentes; no introduce una migración de framework.

## Componentes

| Archivo | Responsabilidad |
| --- | --- |
| `frontend/modulos/58-conciliador-core.js` | Contratos puros: dinero en centavos, fechas, extracción bancaria complementaria, validación de propuestas, asociación no ambigua y comparación fiscal/previsión. |
| `frontend/modulos/59-conciliador-persistencia.js` | `useEstadoConciliacion`: estado por cierre, cola de escrituras, revisión concurrente, archivos privados y comprobación de huella. Es una fábrica de servicios para el stack actual. |
| `frontend/modulos/60-conciliador-general-stepper.js` | `ConciliadorGeneralStepper`: interfaz de cuatro etapas y adaptación de los lectores y acciones existentes. API pública `PLATINUM_CONCILIADOR`. |
| `platinum-workflows.js` | Servicios financieros existentes y delegación de la presentación del cierre al Stepper. |

El paquete privado del servidor incluye `estado_conciliacion_nomina`, `archivos_conciliacion_nomina`, el contenedor privado `conciliacion-nomina` y la RPC `control_conciliador_general`. SQL operativo y funciones Edge se conservan localmente y no forman parte del repositorio público.

## Flujo y garantías

1. **Fotografía/NOI.** Se reutilizan los lectores de Excel y cruce por identidad. Las diferencias, fuentes y originales se conservan; avanzar requiere conciliación NOI guardada con cero diferencias. Una lectura pendiente puede retomarse desde el original sin depender de la pestaña.
2. **BBVA.** Primero se ejecuta el lector tradicional. Un global incompleto no se convierte en un pago individual; comisiones, IVA y saldos no sustituyen importes de operación. Ante anomalías se solicita una propuesta a la conexión Gemini existente. El usuario revisa la asociación antes de registrar.
3. **Timbrados/pagos.** Se reutilizan lectores y validación fiscal originales. PDF y XML del mismo UUID cuentan una vez. Se compara el neto fiscal respaldado más la previsión registrada en la fotografía contra aplicaciones efectivas de pago. Archivar un comprobante no prueba su aplicación; las diferencias de un centavo permanecen visibles.
4. **Cheques.** Candidatos por obligaciones sin cubrir y PDF fiscal individual verificable. Se confirma un lote, se revalidan fuentes y se crea sólo el neto fiscal; previsión permanece separada. Nómina normal conserva el corte del sábado; finiquitos conservan sus permisos y alternativas autorizadas. Un pendiente no acredita expedición ni entrega.

Los motores semanal y quincenal permanecen idénticos. No se modifica la clasificación fiscal de conceptos, salarios, fotografías históricas ni reglas de timbrado mediante este módulo.

## Persistencia y fallos

- Los originales son privados e inmutables por ruta/huella; nuevos archivos son nuevas versiones. Se conservan aun si se archiva un cierre, con consulta administrativa.
- Las escrituras se serializan y comprueban revisión. Una respuesta de otra sesión/centro no se aplica al contexto nuevo.
- Un lote bancario parcial conserva renglones contabilizados inmutables y permite retomar los restantes. La misma carga es idempotente.
- Si otro original presenta una operación similar, debe vincularse el pago existente o confirmarse expresamente que es una operación distinta. No se duplica ni se fusiona dinero por semejanza silenciosa.
- Un error 503 de Gemini queda como fallo temporal; no se transforma en neto cero ni en lectura completada. El modelo transcribe; no autoriza ni decide obligaciones.
- No se transmite dinero al banco ni se consultan sellos ante SAT desde el Stepper.

## Vistas retiradas

Se retiran los cuerpos de presentación, conservando los nombres como rutas de compatibilidad:

| Vista anterior | Entrada compatible | Destino |
| --- | --- | --- |
| Listado de cierres / nueva fotografía | `openCtrlCierres`, `openCtrlNuevoCierre` | Selector del Conciliador / fotografía existente |
| Importador y comparador NOI independiente | `openCtrlConciliacionSelector`, `ctrlOpenConciliacion` | Etapa 1 |
| Importador BBVA independiente | `openImportPago` | Etapa 2 |
| Importador directo PDF/XML | `openCfdiImport` | Archivo documental por cierre |
| Detalle integrado de cierre independiente | `renderCierre` en coordinador | Mismo Stepper |

Para archivar recibos, usa **Pagos y conciliación → Recibos de nómina → Importar recibos PDF y XML**. El mismo importador se abre desde la cabecera del Conciliador, el paso 3 y Faltan recibos. Confirma el centro, el cierre y sus fechas antes de elegir archivos. El archivo de un borrador histórico conserva el paso financiero y su fotografía. La vista indica cuáles originales siguen pendientes de verificación fiscal. La función **Importar acuses IMSS** está en **IMSS / INFONAVIT**. El paso 3 conserva la verificación, los controles financieros y la recuperación de originales que ya estaban cargados.

### Lectura de originales y revisión por cheque

La vista previa lee PDF y XML al seleccionarlos. En **Revisar campos**, compara el original y la región detectada. La transcripción manual o asistida sólo se incorpora si coincide literalmente con esa región. Un conflicto de identidad, un bloque sin límites fiables o una región sin texto comprobable queda en revisión. Cuando cada página tiene un resumen y una identidad comprobables, la vista previa distingue los bloques. Para el archivo canónico se requieren originales individuales.

Confirmar intenta el archivo privado y la comprobación fiscal del mismo original. La lectura fiscal del servidor comprueba la huella y usa la fuente fiscal que consulta Gestión de Cheques. Los pendientes archivados aparecen al volver al cierre y se pueden retomar desde la misma vista. Si Gemini devuelve 429 o 503, se conservan las filas anteriores. La ayuda sólo envía la etiqueta y el fragmento solicitado. No consulta el estado del CFDI ante el SAT.

En **Gestión de Cheques → Revisar fuentes**, compara el cheque con NOI, PDF y XML de su mismo contexto. Se muestran los recibos pendientes, la procedencia disponible de NOI y las fuentes descartadas por periodo o concepto. Un desglose sin vínculo se muestra como candidato y requiere cotejo del reporte original antes de adoptarlo. PDF y XML compatibles del mismo UUID cuentan como un timbre.

## Verificación

Pruebas públicas: `test_conciliador_core`, `test_conciliador_persistencia`, `test_conciliador_general_ui`, `test_conciliador_compatibilidad`. Verifican contratos, DOM sintético, cola/contexto y huellas de siete lectores y ambos motores.

Pruebas del paquete privado: `test_conciliador_general_pg`, `test_conciliador_cheques_pg`, `test_conciliador_banco_edge`. Cubren RLS, archivos, concurrencia, idempotencia, lotes parciales, duplicados, PDF/XML, previsión separada y conservación histórica. El CI público informa la omisión cuando no dispone de esas fuentes privadas.

La aceptación visual corresponde al usuario. Una tasa medida en archivos de prueba no garantiza lectura o asociación universal; identidades ambiguas y documentos incompletos se detienen para revisión.

## Contexto semanal y navegación única

El menú lateral contiene un único **Conciliador General**. Las rutas anteriores de Cheques, Pagos y Auditoría se redirigen a esa superficie; se retiraron sus secciones HTML paralelas. Control de pagos y Conciliación total también delegan al maestro. Los formularios y exportadores especializados se conservan como herramientas.

- `61-conciliacion-semanal.js`: `useConciliacionSemanal`, una RPC por selección de semana/cierre, cancelación de solicitudes anteriores y comprobación de obra, usuario, semana e ID de cierre. La transición a otra semana borra datos, búsqueda y selecciones anteriores.
- `62-conciliador-semanal-interfaz.js`: selector de semana y periodicidad, resumen, alertas, registros por trabajador/comprobante/cheque, Stepper y menú **Herramientas de Pago**.
- `control_conciliacion_semanal`: consulta estable del paquete SQL privado. Reutiliza las fuentes históricas existentes para unir fotografía, obligaciones, finiquitos, transferencias, cheques y archivos. No crea estado ni aplica correcciones al abrir un histórico.

La semana actual permite las acciones autorizadas. El contexto histórico o futuro es de consulta: no ofrece importaciones, autorizaciones, creación de cheques ni formularios de modificación. Permite consultar evidencia y exportar. Los permisos generales de la cuenta y las protecciones financieras existentes siguen vigentes; este cambio no reescribe motores ni pagos.

Folios, reuniones de entrega, bloques y otras herramientas de modificación se abren desde el menú en el contexto actual, con sus permisos originales. Chequeras de 50, legajos y exportaciones permanecen accesibles para consulta y documentación. Un cheque EXPEDIDO conserva su distinción de entrega física; un CANCELADO no se transforma ni cuenta como pendiente.

Los rechazos y pendientes de transferencia se resaltan cuando no existe cobertura inequívoca de su obligación. Los cheques PENDIENTES se muestran sin atribuirles expedición, cobro ni entrega. Las semanas sin base no se certifican como pagadas.

No se agregan suscripciones ni temporizadores. Las señales financieras existentes pueden refrescar la misma semana conservando su contenido mientras llega la respuesta. Si hay una captura en curso, se avisa del cambio para evitar sustituirla. Al salir del centro o cambiar de empresa se aborta e invalida la consulta pendiente.

Pruebas adicionales: `test_conciliacion_semanal_servicio`, `test_conciliador_semanal_ui`, `test_conciliacion_semanal_pg`. Cubren una sola lectura agregada, cambios rápidos, respuestas obsoletas, desmontaje, alcance, semanas sin cierre, histórico sin escrituras, alertas y herramientas conservadas.
# Pestañas y corrección de folios físicos

El Conciliador contiene dos pestañas accesibles con teclado: **Flujo de Conciliación** conserva el expediente semanal y sus reglas; **Gestión de Cheques** presenta la tabla completa del centro, con filtros independientes por estatus, contratista, semana y búsqueda, y orden numérico o de importe. La selección de semana del flujo no oculta los cheques de las demás semanas. El sidebar sigue teniendo una sola entrada.

`63-gestion-cheques.js` reutiliza la colección verificada del centro, el exportador clásico y `chqResolverNeto`; no implementa fórmulas ni lectores alternativos. El lector tradicional y la revisión Gemini existentes permanecen accesibles con botones. La comprobación distingue CFDI XML/PDF válido, diferencia al centavo y una referencia disponible sólo en NOI. Verificar no cambia automáticamente el importe ni acredita entrega/cobro. Los marcadores se invalidan si cambian el cheque o el contexto.

La excepción histórica solicitada permite a RRHH con escritura y alcance corregir **sólo** `num_cheque` y `consecutivo`. `control_corregir_folios_cheque` recibe identificador, ambos folios y versión esperada; no acepta importe, persona, periodo, concepto o estatus. El servidor verifica acceso, concurrencia y colisiones; registra antes/después. El predicado compara la fila completa exceptuando los folios y metadatos de actualización. Las guardas de aplicaciones y nómina conservan su comportamiento para los demás cambios. Corregir un folio no expide, entrega, cancela ni aplica otro pago.

Pruebas: `test_gestion_cheques_tabs_ui.cjs` y `test_cheques_folios_cerrados_pg.cjs`. La prueba SQL usa el paquete privado local. No se publican SQL operativo, expedientes ni comprobantes reales. Las pruebas DOM son sintéticas, sin navegador ni aceptación visual.

# Archivo documental sin fotografía

La entrada «Importar recibos PDF y XML» utiliza el archivo por empresa, centro, año y semana/quincena. Conserva primero el original privado; después lee con el lector fiscal compartido, presenta identidad/periodo/concepto y exige confirmar su registro. Una lectura incompleta conserva el original y el motivo para reanudar. Gemini se limita al campo aislado que no pudo leerse.

Los módulos 83/84 orquestan este recorrido mediante `control_archivo_recibos`; el módulo 67 conserva el lector y el archivo por fotografía para compatibilidad. El cierre es opcional. Un documento registrado no equivale a timbrado verificado, conciliación, obligación o pago. PDF/XML compatibles del mismo UUID comparten la evidencia canónica y conservan sus originales. No se duplican importes.

Al existir después una fotografía compatible, el periodo ofrece revisar y confirmar el vínculo documental. No cambia la fotografía ni sus importes. Los pagos bancarios mantienen el importador independiente 78/79 y sus confirmaciones financieras. El archivo documental no sustituye esas confirmaciones.

Pruebas locales: servicio asíncrono, descarte de respuestas tardías, archivo previo a lectura, reanudación y DOM sintético. Las comprobaciones de PostgreSQL del paquete privado prueban aislamiento, deduplicación y vínculo posterior; no son pruebas visuales ni una importación operativa en producción.

