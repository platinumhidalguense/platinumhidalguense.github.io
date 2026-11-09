# Flujo integrado · PLATINUM

Guía operativa actualizada para el recorrido conectado. Supabase, GitHub Pages y xlsx-js-style. [Preparación, comparación y verificación](RECORRIDO_OPERATIVO.md).

## Dónde está

Selecciona empresa y centro. Abre **Inicio → Pendientes y aprobaciones** o la misma opción del Centro de control. Selecciona semana y cierre. **Conciliador del periodo** abre las acciones de fotografía, NOI, recibos, autorización, saldos e historial del cierre elegido. Consolidado requiere permiso de administración.

## Secuencia semanal

1. Captura movimientos, incidencias, créditos y calendario IMSS en sus módulos habituales. Los avisos compartidos actualizan las lecturas; no sustituyen una captura abierta.
2. Crea el cierre o prepara de nuevo su fotografía. Se usa el mismo motor de proyección existente. Previsión social queda identificada aparte del neto fiscal NOI; no se inventan percepciones ni impuestos.
3. Importa el archivo final NOI. Se reemplaza completo en una sola transacción: un error no deja media conciliación. Las filas ausentes o diferentes quedan pendientes. Si hay PDF archivados sin lectura, utiliza **Leer recibos**. El archivo se descarga privadamente, se comprueba su huella cuando existe y se extrae el neto con el lector actual. Si no es legible, requiere revisión; nunca se supone un importe.
4. Desde BORRADOR, una cuenta con escritura, alcance y autorización efectiva confirma el cierre directo. El servidor revalida fotografía, fuentes y conciliación. Los cierres con estado histórico REVISADO conservan su ruta admitida. La autorización fija la versión y sus obligaciones por trabajador y concepto. La exportación autorizada usa esa versión.
5. Importa los comprobantes bancarios por los métodos habituales. Una transferencia exacta de la semana actual puede completar automáticamente el saldo si no hay ambigüedad. También se contempla que se haya importado antes de autorizar. Los parciales se aplican eligiendo comprobante e importe; muestran saldo restante. Registrar/aplicar comprobantes **no envía dinero al banco**.
6. Usa las guardas del Conciliador para candidatos nuevos. Para un cheque existente, verifica el importe fiscal con el comprobante timbrado admisible o la fuente de respaldo prevista por la operación. La corrección auditada de folios físicos tiene su propio permiso. Expedición registra el pago y entrega es un estado independiente.
7. **Timbrado** requiere respaldo fiscal admitido por el servidor. XML o PDF fiscal verificable deben coincidir con empresa, persona, periodo, concepto, folio e importe. Un UUID respaldado en ambos formatos cuenta una vez. Las contradicciones quedan pendientes. **Pagado** exige una segunda cuenta autorizada y saldos sin pendientes ni excedentes. Los cambios de un periodo protegido siguen la solicitud y reapertura autorizadas.

## Excepciones y regularizaciones

- Finiquito por transferencia: por defecto sigue en cheque. La contadora con permiso específico sólo puede retirar un cheque **pendiente sin número ni consecutivo**, con NOI/motor/recibos conciliados y transferencia importada exitosa exactamente coincidente. No obtiene administración general ni cambia el método ordinario de la ficha. Los cheques expedidos no se cancelan por esta vía.
- Administrador: puede declarar una excepción sin banco, pero queda **declarada, no pagada**, hasta conciliar comprobante. Declarar no crea un pago bancario.
- Historia: la bandeja permite solicitar y decidir regularizaciones concretas. La vista previa del cambio monetario no lo aplica. Una aprobación de un importe no autoriza otro distinto. Se puede buscar un comprobante en otra semana; cruzarlo requiere aprobación específica y conserva su semana original.
- Reapertura: conserva la versión anterior, sus aplicaciones y comprobantes. Una nueva aprobación reutiliza las obligaciones lógicas de la misma obra/semana/trabajador/concepto; no duplica pagos. Si el nuevo importe es inferior al ya registrado, el excedente se muestra para revisión.
- Eliminación administrativa de cierre: se conserva su archivo auditado y las versiones/comprobantes. Las obligaciones se archivan y se recupera la continuidad si se recrea el mismo periodo. Las pruebas de este despliegue no eliminan cierres reales.
- Retirar una aplicación es sólo administrativo, con confirmación y motivo; el comprobante original no se borra. Un cierre pagado debe reabrirse antes.
- Cierres antiguos: no se recalculan ni se convierten automáticamente. **Adoptar legado** exige revisión administrativa y coincidencias; conserva su fotografía sin declarar comprobantes aplicados. Si el archivo histórico no contiene el desglose necesario para reproducir la exportación, se requiere reapertura/regularización explícita; no se reconstruye con salarios actuales.

## Módulos conectados

Personal, cuadrillas, documentos/acuses, incidencias/créditos, calendarios IMSS, diferenciales, movimientos de seguridad social, cumplimiento, cierres/NOI, banco, cheques/bloques/entregas y excepciones comparten obra y razón social. Los eventos de integración sólo invalidan lecturas: no contienen expedientes ni diagnósticos. Los avisos clínicos se limitan a permisos de salud y los exclusivos a permisos VIP. La bandeja no sustituye los módulos originales ni elimina sus opciones.

## Implementación y seguridad

- `platinum-sync.js`: agrupación de avisos, recuperación de conexión/foco y actualización sin perder captura.
- `platinum-workflows.js`: interfaz/orquestación, no fórmulas de nómina.
- `index.html`: adaptadores a funciones existentes y exportaciones corporativas, sin reescribir los motores.
- `control_flujo_operar`: API transaccional. Helpers privados en `platinum_internal`, permisos verificados por usuario/obra/acción, sin claves privilegiadas en cliente.
- Nuevas tablas con RLS obligatoria y lectura dirigida; las escrituras financieras se hacen mediante la API validada. La vista de saldos utiliza `security_invoker`.
- Mutex de interfaz, revisión de huellas, candados de periodo, límites de saldo y claves idempotentes. Un comprobante bancario global/individual idéntico consume una sola capacidad, no dos.
- Paginación de las lecturas existentes; las nuevas respuestas agregadas de la API no dependen del límite de 1,000 filas de una consulta REST tabular.
- No se relaja ninguna restricción anterior. Las nuevas obligaciones agregan unicidad, no quitan la de cheques ni diferenciales.

## Verificación y límites de la entrega

Se ejecutan regresiones JavaScript aisladas, contratos de botones y pruebas con PostgreSQL local, esquema real y datos ficticios. Cubren permisos/empresas, preparación, importación NOI atómica, PDFs/XML, aprobación separada, congelación, parciales, duplicidad, emisión/entrega, excepción contable, reapertura, conservación y propuestas históricas exactas. Se comprueban publicación y huellas por HTTP sin navegador.

El inventario de todas las funciones y la conexión compartida no equivalen a haber ejecutado individualmente cada función histórica. La aceptación visual, impresión y uso simultáneo con usuarios reales quedan a cargo del administrador, como solicitó. No se afirma certificación legal de toda la plataforma ni se modifican fórmulas para hacer coincidir datos por fuerza.
