# Rendimiento y sincronización del centro

- Padrón de apertura: una RPC de lectura con campos para filtros, acuses y clasificación; no solicita expedientes, pagos ni fotografías. Los datos operativos completos sólo se cargan al abrir una herramienta que los usa. Un error de lectura conserva la última pantalla verificada.
- El listado conserva el filtro sobre todo el padrón y sólo construye la página visible (80 trabajadores o 70 cheques). Los filtros y exportaciones no se recortan por el tamaño de página.
- Supabase Realtime entrega filas confirmadas. La réplica de la sesión aplica altas, bajas, cambios de cheque, incidencias y otros deltas dentro de su ámbito. Los traslados avisan al centro anterior con la clave del registro; no divulgan el destino. Las filas recibidas durante una consulta se reaplican al confirmar la lectura. No hay recarga periódica del padrón.
- Bajas, estatus de cheques e incidencias muestran una vista provisional con indicación de guardado. El motor usa sólo datos confirmados. El fallo retira la vista provisional y no revierte un evento confirmado por otra sesión. Un fallo de creación de cheque no deshace una baja ya confirmada.
- El cierre lee entradas y huella en una sola llamada coherente y conserva las operaciones masivas existentes de preparación, conciliación y cheques. El guardado no vuelve a descargar todo el centro; se abre la semana afectada. Las fórmulas y validaciones fiscales siguen en sus módulos.

La migración de funciones es transaccional. Los índices de lectura concurrentes están en el paquete local privado de mantenimiento y requieren una conexión PostgreSQL con autocommit, una instrucción por ejecución. Las pruebas del repositorio usan sesiones y datos ficticios; no miden tiempo de red de operadores.
