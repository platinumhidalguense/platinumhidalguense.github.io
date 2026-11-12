# Baja y finiquito

En la ficha confirmada, **Dar de baja** abre Datos de la baja, Calcular finiquito y vincular el papel, y Revisar y confirmar. La cabecera mantiene la acción al cambiar de sección. Para un trabajador dado de baja se muestra **Ver baja y finiquito**.

| Acción | Entrada | Resultado |
|---|---|---|
| Dar de baja | Cabecera de la ficha | Borrador para el ciclo vigente y el centro de la ficha |
| Simular prestaciones | Incidencias y prestaciones | Calculadora de consulta con la fórmula vigente |
| Retomar baja y finiquito | Papel de prestaciones guardado | Mismo recorrido con la fecha y el papel de referencia |
| Ver baja y finiquito | Cabecera o papel de un ciclo anterior | Operación registrada, papel vinculado, expediente, historial y seguimiento de pago |
| Generar documento de separación | Resultado de la baja o generador existente | Documento según la causal y fecha efectiva confirmadas |

El paso de cálculo consulta la ficha, los descuentos, el ajuste NOI, el papel y la evidencia de prestaciones pertinentes. Si el papel y la propuesta coinciden, se conserva su revisión. Una diferencia de D001, fecha, días, retenciones o neto queda visible en la revisión. La confirmación del ISR manual sigue el contrato de Papeles de prestaciones. El neto conciliado requiere confirmación y una referencia.

La RPC `control_baja_finiquito` ofrece `CONTEXTO`, `CONFIRMAR`, `ESTADO` y `VER`. La confirmación valida los permisos y la huella de fuentes del borrador, toma los candados del periodo y registra la baja, el papel o la separación validada, la bitácora `FINIQUITO_APLICADO` y, si corresponde, el cheque pendiente. La proyección lee el evento con la fecha efectiva que ya consume. El historial y las reglas de cierres se aplican mediante sus triggers vigentes.

La operación utiliza un identificador persistente y una restricción por trabajador y ciclo. Después de una respuesta perdida, el frontend consulta `ESTADO` antes de enviar la misma operación. La consulta de un papel aplicado se hace por el ID y la huella que quedaron vinculados.

Un alta o reingreso y baja en la misma semana mantiene la verificación de servicio efectivo. Para servicio pendiente se ofrece gestión posterior del pago. La opción de transferencia exige un destino vigente y un importe que cuadre. El documento puede generarse desde la baja registrada. IMSS y entrega o dispersión se consultan en sus controles.

Las pruebas de interfaz usan DOM sintético. Las pruebas de la transacción usan PostgreSQL aislado con personas ficticias. El archivo de migración y los contratos técnicos usados para la prueba se guardan fuera del conjunto público.
