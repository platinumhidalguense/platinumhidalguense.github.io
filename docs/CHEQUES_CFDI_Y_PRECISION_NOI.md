# CFDI, reporte NOI y precisión de captura

La verificación del neto para cheques utiliza primero un recibo PDF timbrado verificable o su XML. Si el reporte NOI tiene otro importe, se muestra la diferencia y se permite capturar un cheque pendiente existente por el neto del CFDI. La discrepancia del cierre sigue pendiente de conciliación; capturar el cheque no autoriza ni modifica el cierre.

Se conservan los controles de trabajador, centro, periodo, concepto, duplicación de pagos, número y consecutivo. Un PDF sin evidencia de timbrado no desplaza un reporte contradictorio. Dos CFDI distintos o un PDF y XML con importes contradictorios requieren revisión; no se suman ni se selecciona uno arbitrariamente. El mismo UUID en PDF y XML se considera un solo comprobante.

En el formulario de cheques, **Verificar neto** lee el PDF pendiente incluso si ya existe una diferencia con NOI. Si el lector tradicional no puede comprobarlo, permanece la opción de lectura asistida y confirmación. No se consulta vigencia SAT por este cambio.

El SDI admite todos los decimales documentados y se muestra completo en la ficha y su expediente exportado. El tabulador conserva el SDI existente al editar con el mismo salario; para nuevas altas ofrece una estimación de primer año a cuatro decimales, claramente identificada para cotejar con NOI. No se cambian las fórmulas fiscales del motor.

FONACOT por días calendario mantiene el periodo completo, aunque se pague el viernes: una semana que cruce de mes utiliza los divisores reales de cada tramo. Los días extra conservan sus fechas de origen. Los ajustes particulares por periodo prevalecen sobre la regla general. INFONAVIT conserva sus modalidades y bimestres configurados; no se sustituye su calendario por el de FONACOT.

La referencia operativa confirmada es NOI 11.00.20. La versión no identifica por sí sola fórmulas personalizadas, tablas y calendarios del cliente. Las pruebas de regresión cubren precisión, meses de 28/29/30/31 días, quincenas, cambios de año, fuentes fiscales, expedición y conservación de cierres. La equivalencia completa exige cotejar la configuración de NOI cuando esté disponible.
