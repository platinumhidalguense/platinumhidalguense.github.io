# Modelo de indicadores del tablero ejecutivo

Definición común de las medidas del **Dashboard ejecutivo** y del cuadre del
**Respaldo integral**. La implementación de referencia es
`frontend/modulos/76-tablero-modelo.js` (`window.PLATINUM_TABLERO_MODELO`): funciones
puras, sin DOM ni red, que reciben filas crudas y devuelven exactamente el JSON de
las acciones del servicio del tablero. El servidor debe reproducir los mismos
valores al centavo; los escenarios de aceptación están en
`scripts/fixtures/tablero/casos.json` y se verifican con
`node scripts/test_tablero_modelo.cjs`.

Versión del modelo: `TABLERO_2026_11_V1`.

## 1. Principios

1. **Cada peso se cuenta una sola vez.** El dinero real (operación) se descompone en
   *piezas* atómicas `operación × obligación`. Todas las medidas se suman sobre piezas
   u obligaciones, nunca sobre el resultado de unir documentos, pagos o conceptos.
2. **Asignar antes de filtrar.** Las piezas se calculan con toda la información
   (antes de permisos y filtros); después se ocultan las que el usuario no puede ver
   y se aplican los filtros. Así un filtro o un permiso no cambia cómo se reparte un
   pago, ni convierte en «excedente» lo que pertenece a otro concepto.
3. **Exactitud.** Importes en enteros de millonésimas; redondeo a centavos sólo en la
   salida, mitad lejos de cero (igual que `round(numeric, 2)`). Porcentajes con dos
   decimales calculados del cociente exacto.
4. **Vacío ≠ cero.** Un cociente con denominador cero es `null` («No disponible»),
   un centro sin cierres es `SIN_REGISTROS`, y sólo un cierre autorizado en cero es
   `CERO_CONFIRMADO`.
5. **Historia, no padrón.** Contratista, cuadrilla y periodicidad salen de la
   obligación, la fotografía del cierre o la bitácora a la fecha del periodo. El padrón
   actual nunca reescribe la historia.

## 2. Hechos, grano y relaciones

```
 obras ─┬─< control_cierres_nomina ─< control_cierre_versiones (fotografía sellada)
        │        │  └─ control_flujo_cierres (sucio, versión vigente)
        │        └─< control_obligaciones_pago  ◄── grano: versión × trabajador × concepto
        │                    ▲
        │                    │ importe aplicado (vigente si retirado_en es nulo)
        │        control_pago_aplicaciones  ◄── grano: evidencia × obligación
        │                    │
        │        control_evidencias_pago   ◄── grano: operación real (una por clave)
        │             │                 │
        │      pagos (transferencias)   cheques (reemplaza_cheque_id → cheque cancelado)
        │      GLOBAL / INDIVIDUAL       └─ historial CHEQUE-*  (emisión, entrega, cancelación)
        │                                └─ reunion_cheques_entrega (entrega física)
        ├─< documentos CFDI_NOMINA (XML) / RECIBO_NOMINA (PDF) ── lectura fiscal por UUID
        ├─< control_desglose_noi (percepciones y deducciones NOI por persona-semana)
        ├─< control_finiquitos_transferencia (DECLARADO_POR_ADMIN | CONCILIADO_BANCO)
        └─< trabajadores ─< historial (ALTA, BAJA, REACTIVACION, MODIFICACION, cuadrilla)
```

| Hecho | Grano | Fuente | Llave de unicidad |
|---|---|---|---|
| Obligación | versión × trabajador × concepto | `control_obligaciones_pago` | centro, semana, trabajador, concepto |
| Operación de transferencia | operación bancaria | `pagos` (`EXITOSO`, `TRANSFERENCIA`) | centro, trabajador, semana, banco, folio sin espacios, fecha, importe |
| Operación de cheque | cheque físico | `cheques` (`EXPEDIDO`/`ENTREGADO`, no eliminado) | id del cheque |
| Evidencia | operación vinculada | `control_evidencias_pago` | centro + clave |
| Aplicación | evidencia × obligación | `control_pago_aplicaciones` | clave de idempotencia |
| Pieza (derivada) | operación × obligación × clase | modelo | operación, obligación, aplicación, clase |
| Comprobante fiscal | UUID | XML y PDF del mismo UUID | UUID en mayúsculas |
| Evento de plantilla | persona × tipo × fecha efectiva | ficha y bitácora | trabajador, tipo, fecha |

**Obligación exigible**: `vigente`, con cierre asignado, existente y no `CANCELADO`.
Es *provisional* si su cierre está reabierto (`BORRADOR`/`REVISADO`) o con fuentes
modificadas (`sucio`). Las obligaciones de cierres eliminados quedan archivadas
(`vigente = false`) y ya no son exigibles.

## 3. Estados reconocidos y nivel de evidencia

| Fuente | Estado | ¿Es pago? | Nivel de evidencia |
|---|---|---|---|
| Transferencia | `EXITOSO` | Sí | Registrado; **conciliado** al aplicarse a la obligación |
| Transferencia | `RECHAZADO` (rechazo, devolución, cancelación del banco) | No | Excepción; si coincide con una exitosa (mismo folio e importe) la revierte |
| Transferencia | otro / vacío | No | Pendiente de confirmación bancaria |
| Cheque | `PENDIENTE` | No | Captura sin expedir |
| Cheque | `EXPEDIDO` | Sí | Registrado; entrega pendiente |
| Cheque | `ENTREGADO` | Sí | Registrado y entregado; el cobro bancario no se registra en la plataforma |
| Cheque | `CANCELADO` | No | Físico anulado; puede tener reposición |
| Cheque | eliminado | No | Fuera de todo cálculo (captura sin cheque físico) |
| Aplicación | `retirado_en` nulo | — | Vigente |
| Aplicación | `retirado_en` con fecha | — | Retirada: no cuenta; el comprobante se conserva |
| Finiquito por transferencia | `DECLARADO_POR_ADMIN` | No | Declarado, no pagado |
| Finiquito | efectivo con excepción expresa | Sí | Registrado sin comprobante bancario (pendiente de conciliación) |
| CFDI | UUID con importes coincidentes | — | Respaldo fiscal; PDF y XML cuentan una vez |

Escalera de evidencia por obligación: **sin pago** → **declarado** → **registrado**
(operación válida de la misma persona-semana, aún sin aplicar) → **conciliado**
(aplicación vigente de una operación válida) → **timbrado coincidente** (CFDI del
mismo concepto y periodo con el mismo neto).

**Fechas de cheque.** Emisión: primera transición registrada en la bitácora hacia
`EXPEDIDO`/`ENTREGADO` (fecha de Ciudad de México); si no existe, la fecha de captura
(`fuente_fecha = REGISTRO_CAPTURA`). Entrega: primera entrega física registrada o la
transición a `ENTREGADO`. Cancelación: transición a `CANCELADO`. Cobro: no disponible.

## 4. Piezas: cómo se reparte cada operación

1. **Operaciones.** Transferencias exitosas agrupadas por su llave (la global y la
   individual del mismo folio forman una sola operación con varias representaciones);
   cheques expedidos o entregados; evidencias con aplicación vigente cuyo comprobante
   ya no es pago válido (anuladas); efectivo autorizado.
2. **Reverso.** Una transferencia exitosa con un rechazo posterior del mismo centro,
   persona, semana, banco, folio e importe queda *revertida*: no cuenta como pago. Si
   aún tiene aplicación vigente, esa aplicación pasa a pendiente de conciliación
   (`OPERACION_ANULADA`).
3. **Posible duplicado.** Transferencias válidas de la misma persona, semana, fecha e
   importe con otra llave: se conservan las aplicadas; las demás (o todas menos la
   primera, si ninguna está aplicada) no suman y aparecen como excepción.
4. **Capacidad de la operación.** Las aplicaciones vigentes de una operación se
   consumen en orden (`created_at`, `id`) hasta su importe; lo que lo exceda no cuenta
   como dinero y aparece como excepción `OPERACION_SOBREAPLICADA`.
5. **Aplicaciones.** Por obligación exigible, primero el efectivo autorizado y después
   las aplicaciones vigentes en orden (`created_at`, `id`). Cada una cubre hasta el
   importe pendiente (`APLICADA_CONCILIADA` o `APLICADA_ANULADA`); lo que excede es
   `EXCEDENTE_APLICADO` (recae en las aplicaciones más recientes). Una aplicación a una
   obligación archivada es `APLICADA_NO_EXIGIBLE`.
6. **Remanente.** Lo no aplicado de cada operación válida se asigna en forma
   provisional al saldo de la **misma persona, centro y semana**: obligaciones en orden
   de concepto (`FINIQUITO`, `NOMINA`, `PREVISION_SOCIAL`) e id; operaciones en orden de
   fecha efectiva e id. Lo asignado es `POR_VINCULAR`; el resto es
   `REMANENTE_EXCEDENTE` si la persona-semana tiene obligaciones, o
   `REMANENTE_SIN_ASIGNAR` si no las tiene (o si falta trabajador o semana).

Un remanente nunca cubre el saldo de otra persona ni de otra semana.

## 5. Perspectivas, periodos y calendario por centro

- **Calendario interno.** La semana `n` de un centro inicia en `fecha_inicio + 7(n−1)`
  (sin fecha de inicio: 2026-03-30) y abarca siete días. Semanal: se paga el viernes
  programado (`desde + 4`). Quincenal: la quincena del motor (referencia al día 15 o al
  fin de mes que cae en la semana desde el 26/10/2026; antes, el último día de la
  semana) y se paga al cierre de la quincena. Cada centro usa su propia numeración: la
  misma semana de calendario puede ser S32 en un centro y S44 en otro, y ninguna es la
  semana ISO.
- **`PERIODO`.** Obligaciones cuya fecha de pago programada cae en el rango; lo
  pagado es lo aplicado o pendiente de vincular a esas obligaciones, sin importar la
  fecha del pago. Identidades: `neto = registrado + saldo` y
  `registrado = conciliado + pendiente`.
- **`PAGO`.** Piezas de operaciones con fecha efectiva en el rango (transferencia:
  fecha bancaria; cheque: emisión), aunque correspondan a nóminas anteriores.
  Identidad: `registrado = conciliado + pendiente + sin asignar + excedentes`. Las
  medidas de obligación (neto, saldo, cobertura, antigüedad) siguen la base
  `PERIODO` del mismo rango y lo indican en `perspectiva_aplicada`.
- **Rangos.** `ACTUAL` (lunes a domingo de la fecha de Ciudad de México), `MES`,
  `EJERCICIO`, `ACUMULADO` (1 de enero a hoy) y `PERSONALIZADO`. Una nómina de
  diciembre pagada en enero pertenece al ejercicio de su fecha programada en `PERIODO`
  y al año del depósito en `PAGO`.
- **Periodo comparable.** `ANTERIOR`: meses completos se comparan con los meses
  inmediatos anteriores; cualquier otro rango, con el mismo número de días
  inmediatamente anterior. `ANIO_ANTERIOR`: mismas fechas del año previo (29/02 → 28/02).
  Si el rango sigue en curso se compara sólo el tramo transcurrido. La variación es
  `incompleta` si el rango está en curso, si el comparable es anterior al calendario
  del centro, o si algún centro de cualquiera de los dos periodos no está `COMPLETO`
  ni `CERO_CONFIRMADO`. Variación % = absoluta ÷ |comparable| (nula si el comparable es
  cero; para porcentajes sólo se da la diferencia en puntos).

## 6. Catálogo de medidas

Cada medida trae `clave, valor, unidad, grano, perspectiva_aplicada, definicion,
formula, provisional, disponible, motivo_no_disponible, desglose, comparable,
variacion`.

| Clave | Definición | Fórmula | Grano |
|---|---|---|---|
| `neto_conciliado` | Exigible autorizado (NOI conciliado) del rango | Σ importe de obligaciones exigibles | obligación |
| `pagado_conciliado` | Pago con comprobante válido aplicado, hasta el exigible | Σ `APLICADA_CONCILIADA` | aplicación |
| `pendiente_conciliacion` | Registrado aún no conciliado, por motivo | Σ `POR_VINCULAR` + `APLICADA_ANULADA` + efectivo autorizado | pieza |
| `pagado_registrado` | `PERIODO`: conciliado + pendiente. `PAGO`: total de operaciones del rango | ver §5 | pieza |
| `saldo_por_cubrir` | Exigible sin pago registrado | Σ max(importe − cubierto − por vincular, 0) | obligación |
| `excedentes` | Pago sobre el exigible de la misma obligación o persona-semana | Σ `EXCEDENTE_APLICADO` + `REMANENTE_EXCEDENTE` | pieza |
| `sin_asignar` | Pagos sin obligación exigible | Σ `REMANENTE_SIN_ASIGNAR` + `APLICADA_NO_EXIGIBLE` | pieza |
| `cobertura` | % del exigible conciliado (`null` si exigible = 0) | conciliado ÷ neto × 100 | obligación |
| `variacion` | Diferencias contra el comparable | actual − comparable; % sobre \|comparable\| | medida |
| `trabajadores_con_pago` | Personas únicas con pago registrado | count distinct trabajador | persona |
| `promedio_pagado_trabajador` | Registrado con persona ÷ personas | — | persona |
| `mediana_pagado_trabajador` | Mediana del registrado por persona | — | persona |
| `saldo_por_antiguedad` | Saldo por días desde la fecha programada | por vencer, 0–7, 8–14, 15–30, 31–60, >60 | obligación |
| `cheques_por_estado` | Cheques no eliminados por estatus real, reposiciones | count, Σ importe | cheque |
| `trabajadores_pago_parcial` | Personas con 0 < registrado < importe en alguna obligación | count distinct | persona |
| `concentracion_contratista` | % del contratista con mayor exigible | max(neto por contratista) ÷ neto | obligación |
| `percepciones_retenciones` | Percepciones y deducciones del reporte NOI importado | Σ percepciones; ISR, IMSS, subsidio, deducciones | persona × semana |
| `bruto` | Percepciones del reporte NOI | Σ percepciones | persona × semana |
| `costo_patronal` | Sin base de cálculo explícita en la plataforma | No disponible | — |
| `respaldo_fiscal` | Neto timbrado por UUID único | Σ neto CFDI no contradictorio | UUID |
| `plantilla_actual` | Padrón actual (no depende del rango) | activos no eliminados | persona |
| `altas`, `bajas`, `reingresos` | Eventos efectivos con fecha en el rango | count distinct (persona, fecha) | evento |
| `rotacion` | Bajas entre plantilla promedio | bajas ÷ ((activos al inicio + al cierre) ÷ 2) × 100 | evento |

Previsión social sólo es visible con acceso VIP: para otros usuarios se excluyen sus
obligaciones y piezas, y las operaciones muestran sólo la parte visible, también en
excepciones y en los importes excluidos (un posible duplicado se recorta igual que la
operación que duplica). Datos de salud no forman parte del modelo.

## 7. Resolución de casos

| Caso | Resolución |
|---|---|
| Comprobante global e individual de la misma operación | Misma llave (folio sin espacios, mayúsculas) → una operación con `representaciones = 2`. Un comprobante de otro banco con misma persona, semana, fecha e importe y sin aplicación es `POSIBLE_DUPLICADO`: no suma. |
| Un pago que cubre varios conceptos u obligaciones | Una operación, varias aplicaciones → una pieza por obligación; la operación se cuenta una vez. |
| Pagos parciales o distintos medios | Las aplicaciones de transferencia y cheque se suman por obligación hasta el importe; el saldo restante sigue visible y la persona cuenta en `trabajadores_pago_parcial`. |
| CFDI y PDF con el mismo UUID | Se agrupan por UUID: cuentan una vez. Importes distintos en el mismo UUID: `CONTRADICTORIO`, no se suman. |
| Cheque cancelado y reposición | El cancelado no es pago y su aplicación debe estar retirada; la reposición (`reemplaza_cheque_id`) cuenta con su propia emisión. Un cancelado sin reposición vigente es excepción. |
| Transferencia y cheque para la misma obligación | Lo que excede el exigible es `EXCEDENTE_APLICADO` o, si no se aplicó, `REMANENTE_EXCEDENTE`: visible como posible doble pago, fuera del pagado `PERIODO`. |
| Rechazos, devoluciones y reversos | Rechazo aislado: excepción, no es pago. Devolución de una exitosa sin aplicar: la operación no cuenta. Reverso con aplicación vigente: pendiente `OPERACION_ANULADA`. |
| Aplicación retirada | No cuenta; el comprobante vuelve a tener remanente y queda `POR_VINCULAR` si su persona-semana tiene saldo. |
| Diferencias de importe | Menor: saldo y pago parcial. Mayor: excedente. Contra el CFDI: excepción `DIFERENCIA_FISCAL` con la diferencia. |
| Pagos sin asignar | Sin cierre autorizado, sin trabajador o aplicados a obligación archivada → `sin_asignar`, separado del pagado del periodo. |
| Evidencia pendiente | Operación registrada sin aplicar → `pendiente_conciliacion` (`POR_VINCULAR`); cheque pendiente → excepción, no pago. |
| Excedentes vs. saldos de otra persona | El remanente sólo se asigna dentro de la misma persona-semana; nunca compensa otro saldo. |
| Cambio histórico de contratista | Prioridad: contratista de la obligación → fotografía del cierre → bitácora a la fecha de fin del periodo → «Adscripción histórica pendiente». |
| Cuadrilla | Bitácora (cambios autorizados y fila de la ficha) a la fecha de fin del periodo; sin evidencia: «Adscripción histórica pendiente». |
| Reingresos múltiples | Cada baja y reingreso de la bitácora es un episodio; correcciones de fecha del mismo episodio lo sustituyen. |
| Semanal y quincenal | Cada obligación usa su periodicidad histórica y la fecha de pago de su calendario; la calidad exige un cierre para cada semana y quincena vencida. |

## 8. Calidad por centro

| Estado | Regla |
|---|---|
| `ERROR_LECTURA` | Alguna fuente del centro (o global) no se pudo leer |
| `SIN_REGISTROS` | Sin obligaciones, piezas ni cierres en los periodos vencidos del rango |
| `INCOMPLETO` | Algún periodo vencido sin cierre, con cierre no autorizado o con obligaciones provisionales |
| `CERO_CONFIRMADO` | Todos los periodos vencidos autorizados; exigible y pagado en cero |
| `COMPLETO` | Todos los periodos vencidos autorizados |

Periodos esperados: semanas (o quincenas) de cada periodicidad presente en el centro
con fecha de pago programada dentro del rango y no posterior a hoy.

## 9. Forma de las respuestas

- `RESUMEN` (`calcular`): `{version, accion, alcance, actualizado_en, hoy, provisional,
  medidas, calidad[], comparable, huella}`. `alcance` incluye filtros resueltos,
  centros visibles y `restringido {prevision_social, obras_no_autorizadas,
  datos_internos}`. `huella` = `v1|clave=centavos|…|personas=n` de las medidas
  monetarias.
- `TENDENCIA`: `filas[]` por centro y periodo (`PERIODO`) o semana de pago (`PAGO`),
  con fechas reales, semanas internas y medidas.
- `COMPARATIVOS`: `por_centro[]`, `por_contratista[]`, `por_medio[]` y
  `por_medio_criterio`. En `PERIODO` el medio es el **método planeado** de la obligación
  (pagos sin obligación: `SIN_OBLIGACION`); en `PAGO` es el **medio real** de la
  operación y la fila no trae neto, saldo ni cobertura.
- `EXCEPCIONES` y `DETALLE`: `{filas, total, pagina, por_pagina ≤ 500}`. El detalle
  tiene grano `OBLIGACION` u `OPERACION` con las llaves para abrir trabajador,
  obligación, cierre, pago, cheque y evidencia.
- `PLANTILLA`: medidas de plantilla y eventos paginados. `CATALOGOS`: valores de filtro
  del alcance.

Orden de textos: binario (equivalente a `COLLATE "C"`). Fechas civiles `AAAA-MM-DD`;
las marcas de tiempo se convierten a fecha de Ciudad de México.

## 10. Límites conocidos

- La plataforma no registra el cobro de cheques ni cuotas patronales: se informan
  como no disponibles.
- La periodicidad esperada de un centro se toma del personal registrado en él; un
  expediente antiguo de otra periodicidad puede exigir periodos que ya no aplican.
- La cuadrilla depende de la bitácora: los cambios anteriores a su registro quedan
  como «Adscripción histórica pendiente».
