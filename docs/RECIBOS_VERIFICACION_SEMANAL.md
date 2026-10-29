# Verificación de recibos archivados

La importación conserva el archivo original y su asociación con trabajador/semana. Después extrae y valida el recibo usando los mismos bytes, sin descargarlo otra vez. Un fallo de lectura queda separado del resultado del archivado.

Desde Cierre de nómina, «Verificar recibos · todas las semanas» muestra por centro los PDF archivados, leídos, verificados fiscalmente, pendientes y errores. Cada cierre tiene también acceso directo a su semana. La revisión procesa únicamente pendientes en páginas de 25 y con tres lectores simultáneos. Puede pausarse y reintentarse; conserva en servidor la causa del último fallo por archivo y su huella.

La lectura requiere sesión del usuario con permiso de edición. El servidor valida trabajador, centro, periodo, importe, sumas, folio y evidencia del sello SAT. La comprobación documental no sustituye una consulta de vigencia al SAT. Las identidades históricas documentadas se validan en servidor. Cambiar la huella invalida la prueba anterior.

Un PDF fiscal histórico puede verificarse sin inventar si corresponde a nómina o finiquito. Si falta esa clasificación, se muestra como «Concepto por clasificar» y se coteja contra las fuentes del cierre. No se crean obligaciones para suplir datos ausentes.

## Estados independientes

- Archivado: existe el documento privado asociado.
- Leído: se extrajeron datos verificables.
- Verificado fiscalmente: el servidor conserva evidencia cotejada contra la huella del archivo.
- Pago aplicado: existe comprobante bancario, cheque u otra evidencia autorizada vinculada a la obligación.

Verificar un CFDI no paga ni autoriza una nómina. Los comprobantes históricos continúan requiriendo su revisión y confirmaciones. El resumen monetario del cierre usa sólo sus obligaciones vigentes y su versión; la tabla conserva visibles las versiones archivadas.

## Validación reproducible

Pruebas PostgreSQL con 70 PDF ficticios: paginación sin omisiones al disminuir pendientes, permisos, centro, huella, errores persistentes, clasificación pendiente y lectura de un cierre autorizado sin cambiar su fotografía ni marcarlo pagado.

Pruebas VM: concurrencia máxima de tres, pausa/reanudación, reintento de fallidos, cambio de sesión/centro, importación con reutilización de bytes, acuses sin alteraciones y exclusión de versiones archivadas de los totales. No se ejecutaron pruebas de navegador ni se incorporan datos reales en estos casos.
