# Motores de nómina

La periodicidad registrada en la ficha decide la asignación. No hay un segundo
campo de motor que pueda contradecirla.

| Componente | Responsabilidad |
| --- | --- |
| `52-motor-nomina-semanal.js` | Cálculo semanal, siete días, descanso proporcional, subsidio y redondeos semanales validados. Calendario de lunes a domingo y pago el viernes. |
| `53-motor-nomina-quincenal.js` | Calendario natural de quincena, días fiscales configurados, ISR ordinario e integración del ajuste mensual confirmado. |
| `54-asignacion-motores-nomina.js` | Selección por periodicidad y adaptación del formulario. |
| `08-retenciones-incidencias.js` | Servicio común de INFONAVIT y FONACOT, vigencias, ajustes por periodo y días adicionales. Consulta el calendario del motor seleccionado. |
| `48-isr-mensual-quincenal.js` | Acumulados mensuales, confirmación de fuentes, compensación de previsión y composición de segunda quincena. |

`nominaPeriodo` conserva el contrato de los consumidores y delega el cálculo.
`nominaSemanal` rechaza trabajadores quincenales; `nominaQuincenal` rechaza
trabajadores semanales. El quincenal requiere un perfil validado del centro o
registro patronal, disponible en la configuración existente de la aplicación.
Un perfil ausente produce un error visible; no deriva el resultado del motor
semanal ni inventa un SDI.

Los días fiscales de NOI y los días naturales de las retenciones son conceptos
separados. Las reglas de créditos permanecen compartidas y conservan las
excepciones explícitas por periodo. No se trasladan modificaciones quincenales
al subsidio o redondeo semanal.

Las proyecciones siguen componiendo salarios y retenciones registrados, más
las fuentes confirmadas de ISR. Sus fotografías nuevas incluyen el motor y el
perfil utilizados como metadatos. Las fotografías históricas permanecen intactas.
El cálculo ordinario sin acumulados no sustituye la autorización de segunda
quincena: ésta conserva la validación mensual existente.

Pruebas principales:

- `test_motores_nomina_separados.cjs`: huella de 8,064 escenarios semanales
  y 8,064 descuentos semanales capturados antes de la separación; quincena,
  incidencias, maternidad y créditos.
- `test_incidencias_quincenales.cjs`: captura y auditoría por quincena, sin
  duplicación de incidencias ni del ajuste mensual de ISR en el descuento.
- `test_motores_nomina_pg.cjs`: calendarios SQL independientes; no añade
  disparadores, permisos ni cambios a datos financieros.
- `test_isr_quincenal.cjs`: composición mensual y compensación de previsión.
- `test_modularizacion.cjs`: integridad de funciones y composición monetaria.

Los reportes y los cruces con datos reales se conservan en el espacio privado
de trabajo, fuera del repositorio público.
