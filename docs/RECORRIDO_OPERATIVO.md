# Recorrido operativo de PLATINUM OS

Candidato local 2026-11-08.2 sobre 2026-11-08.1, commit de referencia `fafaf67f80c9529352d97d6d6fe6474153def24b`. La preparación es una vista de consulta. Las acciones de cada área conservan su autorización, confirmación y auditoría.

## Sistema TRESS y PLATINUM

La referencia es el comportamiento público de Sistema TRESS y Ruta de Pago 2026. El diseño de PLATINUM parte de sus servicios existentes. [Sistema TRESS](https://tress.com.mx/sistema-tress/) · [Ruta de Pago 2026](https://tress.com.mx/wp-content/uploads/2026/06/ResumenEjecutivo_Cercania26.pdf) · [Comparativo y dispersión](https://tress.com.mx/blog/las-mejoras-de-sistema-tress-que-haran-mas-eficiente-la-operacion-de-nomina-en-2026/)

| Capacidad observable | Acción canónica y cambio en PLATINUM | Límite de esta entrega |
| --- | --- | --- |
| Vincular datos de personal con nómina | Ficha y Expediente 360 → Preparación. UUID de persona, empresa, centro y preferencia de periodicidad. Corte y procesos desde sus tareas y evidencias. | La adscripción histórica y los ciclos se consultan en Expediente 360. |
| Revisar asistencia y movimientos antes de procesar | Preparación → Movimientos del periodo, calendario de la ficha y expediente IMSS según permiso. Corte → origen de cada tarea. | Los avisos se basan en procesos y fuentes confirmadas. La preparación no audita por sí sola cada crédito, calendario o perfil de motor. |
| Comparar cálculos antes de autorizar | Preparación → Comparar versiones. Dos fotografías persistidas, diferencias por UUID, concepto y ciclo cuando está disponible, e identificación de fuente y huella en Excel. | Requiere VIP o administración, un mismo centro y periodicidad. Sólo muestra versiones de cierres disponibles en el selector. Las altas y bajas reales se confirman en el historial; una fila ausente sólo prueba ausencia en esa fotografía. |
| Procesar, verificar y autorizar | Preparación → Proyección del periodo o Conciliador del periodo. NOI, autorización, reapertura y timbrado se realizan con los controles vigentes. | Diagnóstico NOI, archivos por revisar y respaldo fiscal son avisos distintos. La validación documental es interna. |
| Seguir dispersión, cheques y saldos | Preparación → Obligaciones y pagos. Versión, método, pago registrado, saldo, entrega pendiente y aplicaciones. Conciliador → banco, gestión de cheques, chequeras y entrega. | Preparación consulta el detalle financiero sólo para VIP o administración, pues el servicio entrega la fotografía completa. Las alertas bancarias pueden corresponder a la semana completa y el saldo al cierre seleccionado. |
| Consultar reportes según el proceso | Movimientos y Excel comparativo desde preparación. NOI, recibos, pagos y cheques desde el Conciliador. Evidencia de la tarea desde el Corte. | Formatos, permisos documentales y trámites vigentes se conservan. Los acuses y las presentaciones se verifican en el módulo de origen. |

## Recorrido y comprobación

1. En **Inicio → Pendientes y aprobaciones**, selecciona el centro y la semana. Si tu perfil tiene acceso al detalle financiero y hay más de una periodicidad, selecciona el cierre. Las fechas de un cierre proceden de su fotografía. En una consulta de otro centro autorizado, selecciona ese centro en el menú antes de abrir sus herramientas operativas.
2. Filtra por tipo, estado, rol o asignación. **Ir al origen** abre el corte, el proceso, el expediente o el Conciliador. La evidencia accesible se abre con el visor documental existente. Los filtros de procesos aplican a la página consultada. Los nombres de asignados se muestran cuando el servicio los entrega al perfil.
3. Desde una ficha, abre **Preparación de nómina**. Verifica que el expediente conserve al mismo trabajador y el calendario abra el mes del periodo. Con el selector general del calendario, elige trabajador y mes allí. Si hay un aviso de cambio de fuente, usa **Revalidar fuentes**. El guardado sigue a cargo del formulario de origen.
4. Compara dos versiones del mismo centro y periodicidad con **Comparar fotografías**. Revisa un cambio de un centavo, una fila de un solo lado y una base cero. El Excel incluye las dos huellas. Compara periodos distintos con atención a sus fechas y confirma cualquier causa en las fuentes.
5. Abre el Conciliador, verifica el identificador de cierre y vuelve a preparación. Para un caso de prueba, recorre NOI, autorización directa, respaldo XML o PDF fiscal, obligaciones y marcado pagado por otra persona autorizada. Distingue evidencia importada, aplicación, saldo y entrega. Usa datos ficticios para ejecutar las transiciones.

## Cambios y reversión

- Preparación, comparación y estado de consulta en `frontend/modulos/65-recorrido-core.js` y `66-recorrido-operativo.js`. Enlaces en módulos 01, 04, 10, 39 y 62, `platinum-rrhh.js`, `platinum-workflows.js` y la plantilla. Los motores, calendario de captura, lectores y operaciones financieras conservan sus contratos.
- Regresión dirigida en `scripts/test_recorrido_operativo.cjs`, incluida en `scripts/verificar_integracion.cjs`. DOM sintético y base aislada validan contratos. La aceptación visual, móvil, impresión y operación con usuarios reales se realiza aparte.
- Para revertir antes de publicar, restaura los archivos editables desde la revisión base y vuelve a construir el índice, activo e inventario. Para revertir una publicación autorizada, usa el procedimiento de versión y Pages del proyecto. La reversión de esta interfaz se hace en el código, sin reversión de datos o migraciones.

Desde la raíz de la copia local, ejecuta en este orden:

```powershell
node scripts/construir_frontend.cjs
node scripts/guardar_inventario.cjs
node scripts/verificar_integracion.cjs
```
