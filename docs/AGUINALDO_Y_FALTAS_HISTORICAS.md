# Aguinaldo aplicado a nómina y faltas históricas — PLATINUM OS 2026-11-10.2

Convierte **Nómina → PTU / Aguinaldo** en una corrida de cuatro pasos
(Parámetros → Personal y cálculo → Conciliación → Aplicación e historial),
agrega a la ficha del trabajador **Faltas históricas y acumulado** (PLATINUM y
JIRE) y lleva el aguinaldo aplicado a la proyección con su efecto en ISR y neto.

No modifica motores (52/53 idénticos byte por byte), cierres, pagos,
finiquitos ni sus fórmulas (`calcPrestaciones` intacta), documentos ni permisos.
La separación semanal/quincenal se conserva: cada centro y periodicidad es un
lote independiente.

## 1. Mapa de funciones

| Pieza | Archivo | Qué hace |
|---|---|---|
| Núcleo puro | `frontend/modulos/72-aguinaldo-nucleo.js` (`PLATINUM_AGUINALDO`, `AGUINALDO_2026_V1`) | Tramos de servicio, selección, ausencias, derecho, conciliación, exención, ISR art. 96 (espejo del motor 52) y art. 174, fila con observaciones. Sin DOM ni Supabase. |
| Integración | `73-aguinaldo-integracion.js` | `aguinaldoLeerLineas`, `aguinaldoAplicarModelo` (post-proceso), `aguinaldoSinFila`/`aguinaldoExigirCompleto`, columna `AGUINALDO BRUTO`, hoja `AGUINALDO`, campos de fotografía. |
| Corrida | `74-aguinaldo-corrida.js` (`PLATINUM_AGUINALDO_UI`) | Interfaz de cuatro pasos, desglose individual, Excel para firmas, aplicación por lotes, retiro e historial. |
| Ficha | `75-faltas-historicas.js` (`PLATINUM_FALTAS_HIST`) | Sección de la ficha, captura por fechas, total al corte, corrección versionada, reversión, soporte privado; panel informativo en el finiquito. |
| Entrada | `26-prestaciones-anuales.js` | `openAguinaldo` abre la corrida; el cálculo simple anterior queda en `agAbrirSimple` sólo como consulta. PTU y `tramosEnAnio` sin cambios. |
| Proyección | `10`, `13`, `38`, `39` | Post-proceso en los cinco puntos de cálculo (vista previa, exportación por centro y por contratista, fotografía de cierre, vista RRHH). |
| Ficha / finiquito | `71-ficha-personal.js`, `33-finiquitos.js` | Nueva sección; panel de fuente común junto al finiquito (fuera de `calcPrestaciones`). |
| Servidor | Migración privada `*_aguinaldo_faltas_historicas.sql` (no se publica) | Tablas versionadas e inmutables, RPC `control_faltas_historicas` y `control_aguinaldo`, huella de fuentes del cierre y entradas rápidas con `aguinaldos` sólo cuando hay líneas. |

## 2. Matriz de reglas

| Regla | Implementación | Fuente | Vigencia |
|---|---|---|---|
| Mínimo 15 días, pago antes del 20 de diciembre; proporcional al tiempo trabajado | Días pactados ≥ 15; más de 15 exige respaldo; aviso `FUERA_DE_PLAZO` | LFT art. 87 | Vigente |
| Bruto = salario base × días pactados × días computables ÷ días del ejercicio | Denominador 365 o 366; año completo sin faltas = días pactados exactos; redondeo sólo al final | LFT art. 87 (proporción) | Vigente |
| Salario base | Salario diario fijo de la ficha a la fecha de pago; el servidor exige que no haya cambiado | LFT arts. 82, 84, 87 | Vigente |
| Salario variable | Bloquea: requiere promedio de 30 días (art. 89) o regla del art. 289 | LFT arts. 89, 289 | Vigente (no hay campo de tipo de salario en la ficha: pendiente) |
| Tramos alta/baja/reingreso | Desde movimientos de fecha efectiva y la ficha; reingreso sin baja → corrido y por verificar | LFT arts. 18, 87 | Vigente |
| Mismo patrón, otro expediente | Identidad por CURP; dos expedientes con la misma CURP bloquean | LFT art. 41 | Vigente |
| Falta injustificada | No computa (con evidencia) | LFT art. 87 | Vigente |
| Permiso sin goce, suspensión | No computan; configurables por pacto | LFT arts. 42, 423-X | Vigente |
| Enfermedad general | No computa por defecto (configurable) | LFT art. 42-II; criterio doctrinal, verificar tesis del SJF | Decisión pendiente |
| Riesgo de trabajo, maternidad, paternidad, vacaciones, descansos, permiso con goce | Computan | LFT arts. 42-II, 473–491, 170 II y V, 132 XXVII Bis, 69–81 | Vigente |
| Catálogo NOI | 2 y 9 = falta; 17–19 = riesgo de trabajo; 1 según ramo; 3–16 sin clasificar (bloquea) | Catálogo de incidencias del sistema | Vigente |
| Exención | 30 UMA por patrón y año de pago, menos lo consumido | LISR art. 93 fr. XIV | UMA 2026 $117.31 desde 01/02/2026 → $3,519.30 |
| ISR | Art. 96 incremental del periodo (espejo del motor) u opcional art. 174 (fracciones I–V, gravado/365×30.4) | LISR art. 96; RLISR art. 174 | Tarifa Anexo 8 RMF 2026 |
| Subsidio | Su efecto se muestra una vez dentro del ISR incremental; el art. 174 se calcula sin subsidio | LISR art. 96; criterio de práctica | Decisión pendiente |
| Ajuste anual | Proceso aparte | LISR art. 97 | Vigente |
| CFDI | Percepción 002 (gratificación anual), no descuento negativo | Catálogo de percepciones del CFDI de nómina | Vigente |

Revisiones fuera de alcance automático: integración del SBC al IMSS (LSS) e
impuesto sobre nóminas de Hidalgo (art. 21 de su Ley de Hacienda): se informan
en la documentación de cierre, no se calculan aquí.

## 3. Faltas históricas y acumulado (estructura)

* **Por fechas** (`FECHAS`): días exactos dentro de un rango. Una fecha que ya
  está en el calendario no se duplica.
* **Total al corte** (`TOTAL_AL_CORTE`): faltas acreditadas por un respaldo de
  `rango_desde` a `fecha_corte`. Sustituye a las capturas digitales de su
  alcance: 8 acreditadas − 3 digitales = complemento 5; una falta posterior al
  corte suma (9); importar después una falta antigua del rango no duplica (9).
  Si el respaldo dice 2 y el sistema tiene 3, se abre **discrepancia** que
  bloquea y conserva visibles las 3 capturas.
* Un agregado sólo se consume si el cálculo cubre su rango completo; si el
  corte o una baja lo parten, queda pendiente de desglose.
* Versionado: cada corrección crea una versión nueva (cadena, versión, anterior,
  antes/después en la bitácora, actor, motivo, fuente, referencia, soporte). Las
  filas son inmutables; sólo el RPC cierra una versión (sustituida o revertida).
* Permisos en servidor: consulta (usuario registrado con alcance), captura
  (escritura), corrección y reversión (permiso de corrección).
* Rechazos: rango invertido, fuera del ejercicio, corte futuro, cantidad mayor a
  los días del rango, complementos solapados de la misma naturaleza.
* Soporte en Storage privado (`expedientes/<trabajador>/FALTAS_HISTORICAS/…`).
* Registrar aquí **no** crea descuentos, movimientos IMSS ni ajustes de vacaciones.

## 4. Conciliación de pagos anteriores

* Acreditado: finiquito con desglose de aguinaldo, papeles validados,
  aplicaciones en nómina autorizada/timbrada/pagada.
* Reservado: aplicaciones en un borrador (cuentan para no pagar dos veces).
* Pendiente (bloquea): finiquito global sin desglose, baja del ejercicio sin
  finiquito ni papeles, documento sin desglose.
* Una operación cuenta una vez (finiquito y sus papeles; CFDI y su pago).
* Saldo por patrón + persona + ejercicio. Exención consumida por año de pago.

## 5. Aplicación a la nómina abierta (servidor)

`control_aguinaldo('APLICAR')` por lote, todo o nada, idempotente por
`operacion_id` y huella del lote. Por línea revalida: alcance de empresa y
centro, permiso de escritura, huella de fuentes (si cambió algo → recalcular),
periodo y fecha de pago del calendario del centro, periodicidad de la ficha,
persona activa (las bajas van al finiquito), ingreso programado, periodo no
protegido (autorizado/timbrado/pagado, incluidos alias quincenales), salario,
bruto reproducible, saldo, exención y cota del ISR. Conflictos:
`FUENTES_CAMBIARON`, `PERIODO_PROTEGIDO`, `SALARIO_CAMBIO`,
`SALDO_INSUFICIENTE`, `EXENCION_CONSUMIDA`. Retiro sólo mientras el periodo sea
editable; un periodo protegido se corrige por el flujo autorizado de ajuste.

## 6. Proyecciones y exportaciones

* El neto de la fila incluye el neto del aguinaldo; sueldo y previsión no
  cambian (requisito de la validación de la fotografía quincenal).
* Dispersión: columna `AGUINALDO BRUTO` antes de `NETO A PAGAR`, con SUM.
* Contratista: columna informativa; **no** suma al costo del contratista.
* Hoja `AGUINALDO`: bruto, exento, gravado, ISR, método, neto.
* Fotografía de cierre: `aguinaldo_*` por persona y `total_aguinaldo_*` sólo si
  existen; la huella de fuentes incluye las líneas sólo cuando existen, así que
  periodos sin aguinaldo y fotografías históricas no cambian.
* Si una aplicación del periodo no tiene fila (baja, cambio de periodicidad),
  la exportación se detiene.

## 7. Evidencia de pruebas

| Suite | Comprobaciones | Cubre |
|---|---|---|
| `test_aguinaldo_nucleo` | 458 (384 escenarios espejo = motor 52 real) | $4,356.16 (212 días, $500, 15); $4,315.07 (dos faltas); $4,000 dic 2026 → $3,519.30 exento / $480.70 gravado; 365/366; filtros; faltas; conciliación; art. 96 y 174 |
| `test_aguinaldo_ui` | 82 | Corrida completa en DOM, desglose, Excel, aplicación, conflicto, retiro, permisos; ficha (8−3=5, 9, 9, discrepancia, validaciones, versión, reversión, consulta); finiquito; proyección |
| `test_aguinaldo_pg` (privada) | 60 | Huellas y entradas idénticas sin aguinaldo, faltas versionadas, idempotencia, todo o nada, saldo, exención en parcialidades, periodos protegidos, periodicidades |
| Regresión | 83 suites | Incluye motores, NOI, cierres, finiquitos y proyección sin cambios de aserciones |

## 8. Comparación con los motores existentes

* Cálculo simple anterior: divisor fijo 365, sin faltas, sin conciliación ni ISR,
  sólo días por tramo. Se conserva como consulta.
* Finiquito: sigue usando sus faltas de incidencias semanales y su ajuste NOI;
  el panel muestra la fuente común y advierte si difiere.
* Motores 52/53, `proyModelo`, `isrQAplicarModelo`: sin cambios; el aguinaldo
  es un post-proceso.

## 9. Decisiones pendientes y supuestos

1. Enfermedad general no computa por defecto (configurable por pacto).
2. Art. 174 sin subsidio; art. 96 bloqueado en segunda quincena con ajuste mensual.
3. El aguinaldo bruto no se carga al costo del contratista.
4. El aguinaldo se paga dentro de la corrida ordinaria de NOI (la conciliación
   compara monto − previsión con el neto NOI).
5. ISR art. 96 sobre el bruto ordinario del periodo sin incidencias; la
   conciliación NOI confirma el definitivo.
6. Faltas de días de incapacidad registradas sólo en descuentos antiguos quedan
   sin clasificar hasta acreditar un total al corte.
7. El servidor reproduce la fórmula y el saldo, pero no recalcula los días
   computables: el desglose queda guardado para auditoría.
8. Sin campo de tipo de salario en la ficha: el salario variable no se detecta solo.
9. Usar la fuente común dentro de la fórmula del finiquito requiere autorización
   y regresión NOI.

## 10. Habilitar en producción

Requiere autorización expresa. Aplicar la migración privada
`*_aguinaldo_faltas_historicas.sql` y verificar con `test_aguinaldo_pg`. Sin la
migración la proyección funciona igual que antes y la corrida informa que el
servidor no tiene las fuentes; el cálculo simple de consulta sigue disponible.

## Fuentes

* [Ley Federal del Trabajo](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf) · [Ley del ISR](https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf) · [Reglamento LISR art. 174](https://mley.mx/Reg_LISR/articulo/174/)
* Práctica de cálculo: [elconta.mx — cómputo de días](https://elconta.mx/aguinaldo-consideraciones-en-el-computo-de-los-dias-a-pagar/), [elconta.mx — interpretaciones legales](https://elconta.mx/aguinaldo-interpretaciones-legales-para-su-correcto-pago/), [Runa — ISR del aguinaldo](https://runahr.com/mx/recursos/nomina/isr-sobre-el-aguinaldo/), [Runa — ausencias y aguinaldo](https://runahr.com/mx/recursos/nomina/las-ausencias-pueden-afectar-el-aguinaldo), [SoyConta — cálculo opcional art. 174](https://www.soyconta.com/calculo-opcional-para-determinar-el-isr-por-aguinaldo-recibido/), [El Contribuyente — ISR en gratificaciones](https://www.elcontribuyente.mx/2025/01/simplifica-el-calculo-del-isr-en-gratificaciones/), [El Imparcial — incapacidad y aguinaldo](https://www.elimparcial.com/dinero/2024/10/19/la-incapacidad-afecta-el-pago-del-aguinaldo-esto-dice-la-ley-federal-del-trabajo/)
