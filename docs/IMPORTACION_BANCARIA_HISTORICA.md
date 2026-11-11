# Importación bancaria actual e histórica

La entrada **Pagos y conciliación → Importar pagos bancarios** recibe PDF globales,
individuales y varios originales. Empresa, centro, año, periodicidad, periodo y
concepto se eligen antes de archivar. La fecha bancaria se conserva por separado.

El archivo se guarda antes de leerlo. El lector tradicional existente trabaja por
página; el complementario recibe sólo la página pendiente. Las lecturas correctas
y las revisiones ya guardadas sobreviven a fallos y reintentos. Los originales del
flujo anterior también pueden recuperarse, conservando sus pagos existentes.

## Confirmación y trazabilidad

La vista previa muestra identidad, cuenta, referencia, importe, periodo y ciclo,
obligación, saldo y acción del cheque. Sin obligación verificable se registra la
evidencia con vínculo pendiente. Un reingreso posterior no sustituye el ciclo del
finiquito anterior. Sin fotografía, la fuente fiscal verificada y el cálculo
histórico aplicado deben acreditar el finiquito; no se fabrica una nómina.

La confirmación del servidor utiliza los registros canónicos de pagos,
obligaciones, evidencias y aplicaciones. La operación y sus relaciones se
consultan desde el conciliador, visor, saldos, historial y respaldo. Los permisos
de archivo y de conciliación se comprueban por separado.

- Pendiente sin folios, completamente cubierto: cancelación interna conservada y
  auditada, con motivo «Sustituido por transferencia conciliada».
- Expedidos o pendientes con número/consecutivo: confirmación del cheque concreto
  antes de sustituirlo. Conservar deja evidencia y conflicto por resolver.
- Entregados o protegidos: permanecen intactos; requieren el procedimiento autorizado.
- Parcial: aplicación verificable y saldo restante. Nunca se suma una cobertura
  de cheque y otra bancaria para contar dos veces el mismo finiquito.
- Global más individual compatible: reutilización de la misma operación. Otra
  transferencia exige referencia distinta y soporte explícito.
- Previsión autorizada y neto fiscal: obligaciones separadas, aunque un depósito
  cubra exactamente ambas. La previsión no se convierte en importe timbrado.

La cancelación interna no realiza gestiones bancarias. Confirmar evidencia no
dispersa dinero ni marca el cierre como pagado. Las fotografías y los importes
autorizados conservan sus controles.

## Organización y verificación

Los módulos 78 y 79 contienen el servicio recuperable y su interfaz; las entradas
anteriores delegan al mismo flujo. Los lectores fiscales, bancarios y motores
originales se mantienen. El servidor revalida permisos, fuentes y versiones, y
resuelve aplicación/cancelación en la misma transacción por operación.

Pruebas nuevas: servicio, interfaz DOM, adaptador complementario y PostgreSQL
aislado. El paquete SQL y Edge es privado; las suites indican expresamente cuando
no está disponible en CI público. Las pruebas sintéticas no acreditan exactitud
universal de documentos ni aceptación visual. No usan pagos reales ni navegador.
