# Integración modular · primera entrega

Versión: 2026-10-16.1. Stack y motores conservados.

## Contratos de sincronización

- `platinum-sync.js`: avisos de invalidación, agrupación de eventos, reconexión y foco. No calcula nómina ni escribe pagos.
- `loadObraData`: comprueba todas sus fuentes antes de sustituir los datos de la interfaz. Conserva filtros por obra, paginación y última lectura completa ante fallos.
- Un modal abierto conserva la captura. Los eventos dejan una actualización pendiente; se aplica al cerrar.
- ↻ permite actualizar sin recargar la página. El estado visible distingue conexión, cambios pendientes y errores.
- RLS es la autorización real. Un evento no autoriza operaciones ni sustituye la lectura dirigida de Supabase.
- La lista de fuentes no incluye sueldos internos ni añade tablas clínicas.

## Cierres

Contabilidad puede capturar/enviar a revisión. Autorizar y cancelar requieren administrador en backend y frontend. Se conserva la separación de revisor/autorizador y las comprobaciones de conciliación existentes.

La transición de pantalla exige una fila devuelta con el estado esperado; cero filas, errores y envíos duplicados no se presentan como éxito.

## Pruebas aisladas, sin navegador ni datos de producción

Desde la raíz del proyecto, con Node.js:

```
node scripts/test_integracion_carga_segura.cjs
node scripts/test_sincronizacion_global.cjs
node scripts/test_mantenimiento_confirmado.cjs
node scripts/test_autorizacion_cierres_global.cjs
```

Estas pruebas no certifican la recepción real de eventos en dos sesiones ni el aspecto visual del navegador. Esa validación corresponde a la revisión de uso.

## Próximos bloques acordados, todavía pendientes

Versionado final al autorizar, bloqueo unificado motor/NOI/recibo, reapertura y nueva aprobación, obligaciones con pagos parciales y saldos, sustitución puntual de cheque por transferencia conciliada para contabilidad, entrega/cobro separados de pago registrado, bandeja por alcance y regularizaciones históricas autorizadas.

No deben darse por activadas esas reglas por instalar este primer módulo. La migración de cada flujo exige sus contratos, permisos y regresiones propios.
