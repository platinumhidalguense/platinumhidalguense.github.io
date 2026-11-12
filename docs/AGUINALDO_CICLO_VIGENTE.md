# Aguinaldo normal: ciclo vigente y lectura acotada

Versión 2026-11-12.1.

La corrida normal filtra trabajadores activos con ingreso efectivo ya ocurrido. Usa sólo el último ingreso o reingreso vigente, acotado al ejercicio y corte, y distingue los días proyectados. Las faltas y las aplicaciones laborales se consultan dentro de ese alcance. Los finiquitos anteriores permanecen como historial independiente.

El saldo laboral resta aplicaciones/reservas y CFDI verificados del mismo ciclo. Las aplicaciones antiguas con alcance ambiguo necesitan identificar su ciclo antes de descontarse. La exención fiscal conserva su acumulación anual por razón social e identidad, según el año de pago, separada del derecho laboral. Un dato fiscal incompleto conserva bruto y selección para revisión, pero no permite aplicar un neto definitivo.

El contrato explícito CICLO_VIGENTE_V1 devuelve AG_CICLO_V1 con ciclo, fuentes acotadas, aplicaciones y fiscal_anual. CONTEXTO conserva su contrato anterior para ficha, prestaciones y consulta histórica; APLICAR normal exige el contrato nuevo. El servidor repite las comprobaciones de identidad/ciclo, días, fuentes, saldo, exención, permisos, idempotencia y periodo protegido. Los motores semanales/quincenales no cambian.

La interfaz lee lotes de hasta48 personas con concurrencia máxima2. Un timeout divide únicamente el lote afectado. Una lectura fallida queda identificada, conserva respuestas confirmadas para el reintento y no permite firmar ni aplicar una corrida incompleta. Cambiar parámetros invalida el alcance anterior y salir cancela las lecturas; respuestas tardías se descartan. El Excel de análisis incluye ciclo, ejercicio, corte, faltas, días proyectados y huella de fuentes.

## Validación realizada

- 91 suites de regresión, incluyendo133 comprobaciones de interfaz de aguinaldo y pruebas de ambos motores.
- 40 comprobaciones adicionales PostgreSQL aisladas: ciclo actual, fiscal anual, CFDI/XML duplicados, importes contradictorios, aplicaciones, permisos y volumen.
- Perfiles de sólo lectura sobre los datos reales, con límite local de5segundos por consulta:275 activosMG en seis lotes,46 de otro contratista y6 quincenales, sin timeout ni omisiones en esos conjuntos. Son perfiles del contexto agrupado, no tiempos de pantalla ni una prueba visual.
- Motores52/53 byte-idénticos al punto de partida. Sin aplicaciones de aguinaldo, pagos ni cambios a trabajadores de prueba en producción.

## Activación

La migración SQL operativa permanece privada y requiere la autorización del propietario. El código público sólo utiliza el contrato del servidor comprobado; rechaza respuestas anteriores para evitar volver a sumar todos los ciclos. La publicación se verifica con pruebas, compilación, despliegue y huellas de archivos antes de anunciar la versión. La corrida de consulta no aplica aguinaldos reales.

La aceptación visual queda a cargo del propietario; no se usó navegador.
