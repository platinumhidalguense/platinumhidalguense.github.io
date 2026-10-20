# Integración modular · 2026-10-20.3

Documentación pública del código. No contiene cierres reales, importes operativos, expedientes ni credenciales. El informe operativo se entrega al propietario por separado y no debe publicarse en Pages.

## Estructura

- `frontend/modulos/`: 42 módulos de origen, conservando orden y ámbito clásico.
- `frontend/modulos.json`: orden de construcción.
- `frontend/build.json`: nombre por contenido, SHA-256 e integridad SHA-384 del archivo publicado.
- `platinum-sync.js`: invalidación y coordinación de lecturas.
- `platinum-workflows.js`: coordinación financiera, estados y revisión autenticada.
- `platinum-rrhh.js`: corte guiado, explicación de importes, expediente 360 y procesos, sin motor monetario propio.
- `concentrado-contratistas.js`: concentrados.
- `supabase/migrations/`: cambios versionados del backend.

Se conservan el stack y xlsx-js-style. La modularización no cambia las fórmulas de cálculo. Las huellas de 850 funciones originales permiten verificar que los cambios se limitan a 51 adaptadores declarados en `frontend/revision-auditada.json`; los motores no se admiten como excepciones.

## Construcción y comprobaciones

```
npm ci --prefix scripts
node scripts/construir_frontend.cjs
node scripts/guardar_inventario.cjs
npm test --prefix scripts
```

Editar los módulos, no el archivo generado. Publicar juntos el HTML y el archivo identificado en el manifiesto. La verificación de GitHub repite construcción y pruebas aisladas; no reemplaza aceptación visual ni bloquea por sí sola la publicación automática de Pages.

La comprobación estructural de fichas utiliza Python y lxml, no un navegador. En otro equipo se puede indicar el ejecutable con `PLATINUM_TEST_PYTHON`; GitHub prepara Python 3.12 y lxml 6.0.2 de forma aislada.

Las 21 suites del paquete público incluyen 68 comprobaciones PostgreSQL y contratos de paginación, alcance de empresa, respuestas tardías, permisos, aprobación, idempotencia, saldos, versiones y botones nuevos. Usan datos ficticios; no conectan a la base operativa ni abren navegador. El paquete privado añade 27 comprobaciones de seguridad, 66 de los cuatro bloques RRHH, 50 de pagos de sábado, 12 de estados físicos de cheques, 30 de rendimiento RLS, 28 de conciliación de transferencias y 49 del visor semanal: 32 suites y 330 comprobaciones PostgreSQL en conjunto. El visor añade 29 contratos VM de navegación, aislamiento, errores y permisos. No se cuentan como ejecutadas las que requieren archivos privados ausentes.

`scripts/auditar_funciones.cjs` reproduce trazas y callbacks; el informe detallado se conserva como artefacto privado. Análisis estático no significa ejecución universal ni garantía de ausencia de errores. La migración de endurecimiento ya aplicada también se entrega en privado, no dentro del sitio público.

## Seguridad y operación

La revisión histórica usa una API autenticada de sólo lectura. La consolidación exige administrador, y cada centro conserva su autorización. Abrir la revisión no adopta versiones ni regulariza cifras. Las propuestas históricas requieren aprobación específica.

Operación RRHH reutiliza el cierre y los comprobantes existentes. Crear tareas sólo crea metadatos operativos, no personas, retenciones ni pagos. Las referencias de importes se agregan a fotografías futuras; no se atribuyen retrospectivamente IDs a cálculos antiguos. La historia respeta alcance por centro y acceso a datos de salud y VIP. Los estados de tareas se revalidan al abrir cada proceso; la lista general no afirma que una evidencia guardada siga vigente.

Se fijaron rutas de resolución en funciones revisadas, se retiraron privilegios anónimos innecesarios y se mantuvieron funciones RLS legítimas. Los disparadores internos no necesitan exponerse como RPC. La migración no cambia datos operativos, cuerpos de fórmulas ni restricciones de negocio.

No se incluyen contraseñas de correo en código, pantalla, portapapeles ni exportaciones. Si una credencial figuró en versiones anteriores, corresponde al propietario rotarla: retirarla del código no la revoca ni elimina la historia.

Se aplicaron las guías Supabase y buenas prácticas PostgreSQL. Referencias: [funciones seguras](https://www.postgresql.org/docs/17/sql-createfunction.html), [linter Supabase](https://supabase.com/docs/guides/database/database-linter), [seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security). Las advertencias residuales evaluadas y la aceptación operativa se documentan en el informe privado, no se ocultan.

## Rendimiento de apertura

Se conserva la instantánea completa, paginada y atómica de las 17 fuentes. No se recortan trabajadores ni se usan listas vacías como respuesta a un fallo. Sólo se dibuja la herramienta visible; al abrir otra se pinta con la lectura completa vigente. Tiempo real mantiene invalidación y evita sobrescribir capturas abiertas.

Las alertas reutilizan un índice IMSS de la misma lectura, sin caché global que pueda quedar obsoleta. Los acuses se consultan por trabajador en hasta cuatro lotes simultáneos, con paginación completa y orden estable. La vista de pagos utiliza un índice por trabajador y no lo construye dos veces por dibujo. Los motores, importes y criterios de conciliación permanecen intactos.

`test_rendimiento_centros.cjs` compara todas las alertas con la regla anterior usando 700 trabajadores y 6,300 documentos ficticios, comprueba frescura tras importar/anular acuses, 12,000 acuses sin truncamiento, máximo cuatro lotes y 3,507 pagos íntegros. El tiempo VM es orientativo, no una medición de latencia de pantalla. La migración privada añade cuatro índices y evalúa el mismo alcance RLS una vez por consulta/centro, sin modificar políticas de escritura, constraints ni funciones. Las pruebas PostgreSQL contrastan filas visibles antes/después, incluidos usuarios sin alcance o limitados a un centro.

Referencias: [RLS y planes de consulta](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations), [índices](https://supabase.com/docs/guides/database/postgres/indexes).

## Selección de pendientes y finiquitos por transferencia

La revisión abre con el filtro de pendientes aplicado en el servidor, antes de paginar. Se pueden marcar casos bloqueados para revisarlos; no por ello se autoriza generar cheques. Se distinguen seleccionados, listos y pendientes de resolver. La confirmación sigue exigiendo autorización del cierre, conciliación, horario y ausencia de pagos; los comprobantes pagados o importes cero no son seleccionables. Un acceso al cierre permite resolver el bloqueo sin buscarlo en otro menú.

El mismo apartado ofrece finiquitos por transferencia. Sólo propone la sustitución cuando coinciden trabajador, centro, semana, importe, NOI y recibos; los parciales, rechazos, coincidencias ambiguas y cheques físicos requieren revisión. La contadora conserva su permiso específico, no privilegios de administrador. La importación y el botón de revisar cheque abren este flujo, en lugar de eliminar sin registrar la excepción. Dos confirmaciones llaman al coordinador financiero existente, que vuelve a validar la evidencia. La captura sin folios queda eliminada y auditada, no CANCELADA. La excepción enlazada impide recrear ese cheque y conserva banco, ficha, recibos y versiones.

Los casos sin comprobante no se declaran pagados ni se eliminan por suposición. Las nuevas regresiones comprueban los atributos HTML de las casillas y sus acciones en VM, y el recorrido PostgreSQL completo desde evidencia hasta excepción y no regeneración. No se atribuye una prueba visual de navegador.

## Visor semanal de pagos

El módulo 41 presenta semanas, personas, lotes globales, individuales y faltantes dentro del alcance de empresa/centro. Su API `control_visor_pagos` es SECURITY INVOKER, de sólo lectura y no accesible a anónimos. Los registros se filtran en el servidor antes de paginar a 50. El índice superior recorre todas las semanas, aunque la tabla sólo muestre una. No se consulta este visor al abrir la lista de trabajadores.

Se reutilizan obligaciones vigentes, NOI y fotografías históricas; a falta de ellos se emplean recibos cuyo neto sea verificable. No se recalcula una semana histórica con el sueldo o estatus actual. La falta de importe se muestra como pendiente de cotejo, no como ausencia confirmada de pago. Un importe cero o caso sin servicio no produce automáticamente una exigencia de transferencia; un cheque expedido/entregado cubre su parte aunque no se haya entregado todavía. Los pagos mixtos se suman contra la base, los pendientes sin expedir no cuentan como evidencia y los pagos sin identidad no se asignan por suposición.

El origen explícito de la importación prevalece sobre el número de registros del lote. Un global de una persona sigue siendo global; un mismo folio de semanas diferentes nunca se abre como un único lote. La evidencia repetida con identidad, banco, fecha, importe y referencia iguales se identifica sin duplicar su suma. Si el PDF bancario original no está archivado, el visor muestra los datos importados y lo informa expresamente. No fabrica enlaces ni interpreta un CFDI como comprobante bancario.

Los accesos a importar y revisar llevan la semana seleccionada a los coordinadores existentes. Las respuestas atrasadas de otra semana o centro se descartan; un fallo de lectura nunca se representa como falta de pagos. Tiempo real vuelve a consultar el visor visible; el listado anterior y sus exportaciones se conservan dentro de un desplegable y sólo se dibujan al abrirlo. No se crean ni modifican datos, importes, cheques, permisos o motores por consultar el visor.
