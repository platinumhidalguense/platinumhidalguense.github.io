# Edición de fichas y cambios concurrentes

El formulario conserva la obra y `updated_at` que tenía la ficha al abrirse. Guardar una modificación exige que esa misma versión continúe vigente. Un cambio realizado por otro usuario, un reingreso o una actualización en otra ventana impide sobrescribir los datos recientes con campos antiguos.

El aviso conserva los campos capturados para que el usuario pueda revisarlos al volver a abrir la ficha. No se renueva la versión desde el caché ni se reintenta automáticamente sobre una versión diferente. Los reintentos por columnas faltantes usan la misma versión original.

Las altas nuevas conservan su ruta de inserción. Se mantienen permisos, sesión, validaciones, historial y protección de periodos autorizados.

Verificación sin navegador: `test_edicion_trabajador_version.cjs`, regresiones de sesión, registro por fases y reingresos; integración general. Casos sintéticos sin personas, pagos ni credenciales reales.
