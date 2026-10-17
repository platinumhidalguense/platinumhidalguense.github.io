# Revisión de pagos y cheques

La nómina ordinaria conserva un pago pendiente hasta registrar el comprobante. No tener cuenta no genera un cheque automáticamente. Sólo los finiquitos conservan el cheque por defecto y la excepción autorizada de transferencia.

1. Preparar el cierre, importar NOI, conciliar y autorizar su versión. Las diferencias o fuentes modificadas bloquean la creación y expedición.
2. Importar transferencias globales e individuales, incluidos otros bancos. Un rechazo no es pago; un parcial requiere conciliar el saldo, no un cheque completo.
3. Desde el sábado a las 12:00 de Ciudad de México, entrar a **Centro de control → Revisión de pagos del sábado**. También hay un acceso desde cada cierre.
4. Elegir la semana y revisar la lista. El sistema distingue transferencia registrada, cheque expedido, entrega pendiente, cheque sin expedir, falta de NOI y falta de autorización.
5. Seleccionar los candidatos elegibles, escribir el motivo y confirmar dos veces. Sólo se crean pendientes: número, consecutivo, expedición y entrega continúan en Cheques.
6. Si aparece una transferencia después de confirmar el lote, la expedición se bloquea para evitar pagar dos veces.

El aviso programado nunca crea cheques. La hora se valida en el servidor con zona `America/Mexico_City`; no depende del reloj del equipo. La revisión histórica requiere administración.

La opción **Retirar automáticos anteriores** sólo admite nóminas automáticas pendientes sin número, consecutivo ni aplicaciones. Requiere permiso y confirmación; conserva papelera y auditoría. No retira finiquitos, cheques manuales, foliados ni lotes ya confirmados. No elimina pagos, CFDI ni datos del personal.

**Eliminar y cancelar son distintos.** Si la captura nunca se llenó y no tiene número ni consecutivo, se elimina del listado operativo y queda su auditoría. `CANCELADO` se reserva para cheques físicos con ambos folios. Un cheque que ya tenga alguno de esos identificadores no se elimina: debe revisarse y, si procede, completar su numeración antes de cancelar. Tener un importe calculado no equivale a haber llenado un cheque físico. Los recibos ordinarios tampoco implican que deba existir un cheque.

## Verificación reproducible

Los contratos de interfaz se ejecutan en una máquina virtual de JavaScript, sin navegador. Las pruebas PostgreSQL usan una base aislada con personas ficticias; incluyen permisos, empresas, horario, idempotencia, estados de pago y retirada atómica. Sus migraciones se distribuyen por canal privado y no se publican en el repositorio. Las pruebas públicas indican expresamente si ese paquete no está presente.

Las fórmulas del motor, importes aprobados y constraints existentes no se modifican. El corte del sábado es una regla operativa interna, no un plazo legal.
