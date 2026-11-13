# Configuración contractual por empresa

La plantilla compartida conserva constitución, poder, domicilio patronal y firmante en un bloque contractual separado de los datos generales de la empresa. Ficha y portal utilizan el mismo generador, tanto individual como por lote. Generar un documento de PLATINUM no escribe en trabajadores, ni reemplaza documentos archivados o firmados.

En PLATINUM, modalidad y término se resuelven desde su configuración. El inicio corresponde al ciclo laboral actual, con validación previa a la generación. Un vencimiento contractual no registra una baja y la cláusula conserva el tratamiento legal de continuación de la materia del trabajo. La temporalidad exige el supuesto real aplicable; el generador no atribuye causas no acreditadas.

La precarga de altas y edición, la presentación de ficha y su exportación utilizan el mismo adaptador. El servidor determina la razón social mediante el centro real y aplica los valores también a importaciones y clientes antiguos. El default global se conserva para otras empresas.

Los cambios masivos de fichas son transaccionales y reintentables; auditan los dos campos anteriores y comprueban la conservación de todos los demás, salvo la fecha técnica de actualización. Las migraciones y los datos de configuración permanecen privados. Pruebas: contratos individuales/lote/portal, existente/alta/reingreso, fechas incompatibles, JIRE sin cambios, PostgreSQL aislado y conservación de motores. La aceptación visual corresponde al propietario.
