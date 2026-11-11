# Revisión del aguinaldo y reingresos

La corrección ordinaria de una fecha sustituye el evento documentado de ese
ciclo. No representa otro reingreso. La corrida conserva el detalle de las
fechas antes/después y separa selección para revisión de aplicación a nómina.

Los papeles históricos se leen con sus importes originales. Su existencia no
acredita un pago. El panel de evidencia permite consultar el original, vincular
un concepto y su respaldo, confirmar el importe y recalcular sólo esa persona.
Los casos sin soporte conservan saldo y neto por confirmar; el Excel de análisis
los incluye, mientras firmas y aplicación aceptan únicamente filas listas.

El servidor valida alcance, identidad, versión de fuentes, días computables,
acreditaciones previas y exención conocida. Los vínculos quedan versionados y
auditados. Cambiar o eliminar el respaldo exige una nueva revisión. Los lotes
son atómicos e idempotentes y conservan la protección de periodos autorizados.

Archivos principales: módulos 72, 74 y 77. Los motores 52 y 53 se conservan.
La migración operativa y las fuentes de personal permanecen en el paquete
privado, fuera de este repositorio público.

Pruebas reproducibles con datos ficticios:

- `test_aguinaldo_revision_core.cjs`: correcciones, tramos, huecos y selección.
- `test_aguinaldo_ui.cjs`: filtros, selección persistente, exportación y recálculo.
- `test_aguinaldo_evidencias_ui.cjs`: panel real, original, huella y confirmación.
- `test_aguinaldo_revision_pg.cjs`: contratos privados del servidor, permisos,
  aplicaciones PLATINUM/JIRE, atomicidad y reintentos. Se omite sin ese paquete.

La validación sintética no constituye aceptación visual ni autoriza aplicaciones
o pagos reales de aguinaldo.
