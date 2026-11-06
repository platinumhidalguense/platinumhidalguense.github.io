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
| Importador XML independiente | `openCfdiImport` | Etapa 3 |
| Detalle integrado de cierre independiente | `renderCierre` en coordinador | Mismo Stepper |

Los recibos PDF también se canalizan a la etapa 3. El importador documental anterior conserva acuses IMSS. Los lectores, reportes, solicitudes, saldos, aplicaciones, autorizaciones y archivo administrativo no se eliminan. No deben borrarse completos los módulos 14, 15, 25 o 35: contienen servicios reutilizados.

## Verificación

Pruebas públicas: `test_conciliador_core`, `test_conciliador_persistencia`, `test_conciliador_general_ui`, `test_conciliador_compatibilidad`. Verifican contratos, DOM sintético, cola/contexto y huellas de siete lectores y ambos motores.

Pruebas del paquete privado: `test_conciliador_general_pg`, `test_conciliador_cheques_pg`, `test_conciliador_banco_edge`. Cubren RLS, archivos, concurrencia, idempotencia, lotes parciales, duplicados, PDF/XML, previsión separada y conservación histórica. El CI público informa la omisión cuando no dispone de esas fuentes privadas.

La aceptación visual corresponde al usuario. Una tasa medida en archivos de prueba no garantiza lectura o asociación universal; identidades ambiguas y documentos incompletos se detienen para revisión.
