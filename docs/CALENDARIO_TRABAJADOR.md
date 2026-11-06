# Calendario de captura por trabajador

La ficha concentra fechas, ausencias, percepciones netas, días adicionales de crédito y cuotas de préstamos. Conserva el stack JavaScript del proyecto. No introduce otro motor fiscal.

## Contratos y responsabilidades

- `56-calendario-core.js`: funciones puras de calendario, adaptador neto, valoración por el motor asignado y advertencias.
- `57-calendario-trabajador.js`: consulta mensual, vista previa y confirmación. Usa una RPC; descarta respuestas de otra ficha, usuario o revisión del formulario.
- `control_calendario_trabajador`: alcance de obra, permiso operativo, idempotencia, versión, firma de fuentes, candados por periodo y bitácora. Las tablas nuevas no admiten escritura directa del cliente.
- Motores 52/53: conservados byte por byte. Los descuentos siguen el contrato existente; el calendario no contiene fórmulas de ISR o IMSS.

El préstamo conserva saldo inicial y autorización del trabajador. Sus cuotas se reservan, sin intereses. El saldo disminuye sólo cuando una obligación vigente de nómina está completamente cubierta por aplicaciones de pago y su versión incluye la cuota. Un pago parcial no acredita cobro; retirar evidencia vuelve a mostrar la cuota como reservada.

## Percepciones

`NETO_DIRECTO` significa importe autorizado cuyo tratamiento fiscal fue resuelto externamente. El adaptador conserva un nodo `otros_pagos` con naturaleza y trazabilidad; la composición actual lo recibe como movimiento firmado de incidencia, sumándolo al líquido sin modificar la previsión ni recalcular ISR. El motor actual no tiene un nodo fiscal genérico para estos conceptos. El módulo no declara el importe exento ni cambia automáticamente el SBC.

`BRUTO_GRAVABLE` se rechaza de forma controlada: «El motor actual no soporta gravamen dinámico para este concepto. Capture el importe Neto Autorizado». No se convierte silenciosamente bruto a neto.

## Ausencias e IMSS

El catálogo conserva las 19 combinaciones documentadas por Aspel: 11 de incapacidad y 8 de ausentismo. Son combinaciones de afectación, no 19 diagnósticos. La clave 2 usa el cálculo vigente de falta injustificada. Otras combinaciones de ausentismo requieren el total neto validado por nóminas; sus efectos no se inventan a partir de una etiqueta. Las incapacidades se gestionan desde el expediente IMSS existente, enlazado en la ficha y reflejado en el calendario, conservando certificados, pagadores y ST7.

Las faltas nuevas se agrupan en un solo descuento por periodo. Si existe una base IMSS válida, sólo se guarda la diferencia incremental mediante el contrato `INCREMENTAL_IMSS` existente. No se permite duplicar una falta en un día certificado. Retirar una fecha exige recalcular y confirmar el total restante. Las incidencias anteriores se muestran con su fuente; no se les asignan fechas inventadas. Su retiro sólo es posible en periodo abierto, con confirmación y auditoría.

## Retroactividad

Una fecha de periodo autorizado, timbrado o pagado dirige el movimiento al periodo actual abierto del trabajador, según su periodicidad. La confirmación muestra ambos periodos. Una quincena comparte protección y candado entre sus semanas alias. Si el periodo actual también está protegido, se rechaza el guardado.

Para valorar una falta histórica se exige SD, SDI y sueldo conservados en la fotografía. Si ya había incidencias históricas o falta ese respaldo, se solicita el ajuste neto validado externamente. No se usa el salario actual para reconstruir la historia ni se altera el snapshot anterior.

## Advertencias legales

Se advierte sobre capacidad disponible, crédito INFONAVIT ante ausencias, límites específicos de salario mínimo, FONACOT, acuerdo de préstamos y posible integración SBC. Se permite confirmar una advertencia con huella del usuario; esta confirmación no convierte una deducción indebida en legal ni elude permisos, duplicidades o periodos protegidos. Los límites especiales se revisan por concepto; no se presenta un porcentaje general inventado para toda retención.

Fuentes oficiales consultadas el 6 de noviembre de 2026:

- [LFT, reforma 14/05/2026](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf): artículos 97, 110 y 132-XXVI. Préstamos patronales y FONACOT tienen requisitos y límites distintos.
- [INFONAVIT, implementación de la reforma al artículo 29](https://portalmx.infonavit.org.mx/wps/wcm/connect/d5213ac2-524f-4e2a-8701-aff8b023681c/Ampliacion%2BPlazoLegal%2BArt29.pdf?MOD=AJPERES): la ausencia o incapacidad no suspende por sí sola la obligación; implementación desde el sexto bimestre de 2025. Deben revisarse aviso y capacidad efectiva.
- [FONACOT, requisitos del crédito](https://www.fonacot.gob.mx/creditofonacot/cliente/Paginas/ComoPuedoObtenerCreditoFONACOT.aspx): capacidad y elección del descuento.
- [Aspel, catálogo de faltas](https://noiportaldeclientes.aspel.com.mx/consultar-tipos-de-faltas/): 19 combinaciones de afectación y descripciones configurables en NOI.

## Verificación reproducible

`test_calendario_motor.cjs`, `test_calendario_trabajador_ui.cjs` y `test_calendario_trabajador_pg.cjs` prueban cálculo por motores reales, composición de neto, idempotencia, permisos, préstamo/pago/reversión, ausencias agrupadas, retiro, retroactividad y protección quincenal. Los datos son sintéticos. Las pruebas PostgreSQL requieren el paquete SQL privado; no se publican migraciones operativas ni expedientes. La verificación DOM/VM no acredita aceptación visual en navegador.
