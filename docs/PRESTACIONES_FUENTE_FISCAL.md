# Prestaciones: parte exenta de operaciones anteriores

Versión 2026-11-12.2. La fuente común de ficha, papel y baja recupera la parte exenta desconocida de una operación ya aplicada desde un CFDI verificado. Mantiene intactos la auditoría original, su importe y su ciclo.

Sólo enriquece cuando coinciden trabajador/centro, rango del finiquito, hash vigente, concepto SAT002, importe bruto exacto y UUID inequívoco con fecha fiscal. PDF/XML de la misma operación se deduplican. Un archivo anulado, lectura antigua, importe distinto o variantes contradictorias conservan la revisión pendiente. Un papel sin aplicación no acredita un pago por existir. Los datos confirmados previamente no se sustituyen automáticamente.

El derecho laboral conserva el ciclo vigente; el importe exento anterior sólo consume la exención del año de pago correspondiente. Si no hay desglose suficiente del mismo año, la interfaz indica importar o verificar XML/PDF timbrado y recalcular. La antigüedad de la base no convierte los datos faltantes en cero ni hace obligatorio revisar todas las bajas antiguas.

Pruebas:91 suites de regresión,24 comprobaciones de integración de prestaciones y18 adicionales PostgreSQL aisladas sobre lectura, duplicados, contradicciones, archivos anulados/sustituidos, importe, trazabilidad, año fiscal e integridad del histórico. Sin cambios a motores semanales/quincenales ni bajas reales de prueba. La migración SQL operativa se conserva privada.
