# Integración modular · 2026-10-17.1

Documentación pública del código. No contiene cierres reales, importes operativos, expedientes ni credenciales. El informe operativo se entrega al propietario por separado y no debe publicarse en Pages.

## Estructura

- `frontend/modulos/`: 40 módulos de origen, conservando orden y ámbito clásico.
- `frontend/modulos.json`: orden de construcción.
- `frontend/build.json`: nombre por contenido, SHA-256 e integridad SHA-384 del archivo publicado.
- `platinum-sync.js`: invalidación y coordinación de lecturas.
- `platinum-workflows.js`: coordinación financiera, estados y revisión autenticada.
- `platinum-rrhh.js`: corte guiado, explicación de importes, expediente 360 y procesos, sin motor monetario propio.
- `concentrado-contratistas.js`: concentrados.
- `supabase/migrations/`: cambios versionados del backend.

Se conservan el stack y xlsx-js-style. La modularización no cambia las fórmulas de cálculo. Las huellas de 850 funciones originales permiten verificar que los cambios se limitan a 24 adaptadores declarados en `frontend/revision-auditada.json`; los motores no se admiten como excepciones.

## Construcción y comprobaciones

```
npm ci --prefix scripts
node scripts/construir_frontend.cjs
node scripts/guardar_inventario.cjs
npm test --prefix scripts
```

Editar los módulos, no el archivo generado. Publicar juntos el HTML y el archivo identificado en el manifiesto. La verificación de GitHub repite construcción y pruebas aisladas; no reemplaza aceptación visual ni bloquea por sí sola la publicación automática de Pages.

La comprobación estructural de fichas utiliza Python y lxml, no un navegador. En otro equipo se puede indicar el ejecutable con `PLATINUM_TEST_PYTHON`; GitHub prepara Python 3.12 y lxml 6.0.2 de forma aislada.

Las 18 suites del paquete público incluyen 68 comprobaciones PostgreSQL y contratos de paginación, alcance de empresa, respuestas tardías, permisos, aprobación, idempotencia, saldos, versiones y botones nuevos. Usan datos ficticios; no conectan a la base operativa ni abren navegador. El paquete privado añade 27 comprobaciones de seguridad, 66 de los cuatro bloques RRHH, 50 de pagos de sábado y 12 de estados físicos de cheques: 26 suites y 223 comprobaciones PostgreSQL en conjunto. La interfaz de pagos añade 24 contratos VM y la distinción eliminar/cancelar otros 12. No se cuentan como ejecutadas las que requieren archivos privados ausentes.

`scripts/auditar_funciones.cjs` reproduce trazas y callbacks; el informe detallado se conserva como artefacto privado. Análisis estático no significa ejecución universal ni garantía de ausencia de errores. La migración de endurecimiento ya aplicada también se entrega en privado, no dentro del sitio público.

## Seguridad y operación

La revisión histórica usa una API autenticada de sólo lectura. La consolidación exige administrador, y cada centro conserva su autorización. Abrir la revisión no adopta versiones ni regulariza cifras. Las propuestas históricas requieren aprobación específica.

Operación RRHH reutiliza el cierre y los comprobantes existentes. Crear tareas sólo crea metadatos operativos, no personas, retenciones ni pagos. Las referencias de importes se agregan a fotografías futuras; no se atribuyen retrospectivamente IDs a cálculos antiguos. La historia respeta alcance por centro y acceso a datos de salud y VIP. Los estados de tareas se revalidan al abrir cada proceso; la lista general no afirma que una evidencia guardada siga vigente.

Se fijaron rutas de resolución en funciones revisadas, se retiraron privilegios anónimos innecesarios y se mantuvieron funciones RLS legítimas. Los disparadores internos no necesitan exponerse como RPC. La migración no cambia datos operativos, cuerpos de fórmulas ni restricciones de negocio.

No se incluyen contraseñas de correo en código, pantalla, portapapeles ni exportaciones. Si una credencial figuró en versiones anteriores, corresponde al propietario rotarla: retirarla del código no la revoca ni elimina la historia.

Se aplicaron las guías Supabase y buenas prácticas PostgreSQL. Referencias: [funciones seguras](https://www.postgresql.org/docs/17/sql-createfunction.html), [linter Supabase](https://supabase.com/docs/guides/database/database-linter), [seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security). Las advertencias residuales evaluadas y la aceptación operativa se documentan en el informe privado, no se ocultan.
