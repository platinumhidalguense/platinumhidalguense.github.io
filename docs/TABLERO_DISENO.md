# Tablero ejecutivo · diseño de información e interfaz

Capa de presentación del tablero: `frontend/modulos/77-tablero-vista.js`
(`window.PLATINUM_TABLERO_VISTA`) y `assets/platinum-tablero.css`. La vista
**sólo pinta un `estado` y emite `acciones`**: no lee red, Supabase ni
almacenamiento. Las medidas las define `76-tablero-modelo.js`
(`PLATINUM_TABLERO_MODELO`, ver `docs/MODELO_INDICADORES.md`) y los datos los
entrega `78-tablero-ejecutivo.js`. Prueba: `node scripts/test_tablero_vista.cjs`.

## 1. Jerarquía y orden de lectura

Criterio de informe tipo Power BI: lo más agregado arriba a la izquierda y el
detalle hacia abajo; una sola barra de filtros que gobierna todo lo de abajo.

1. **Encabezado**: título, razón social, vista, «Actualizado: dd/mm/aaaa hh:mm»
   (hora de Ciudad de México) y acciones (Actualizar, Ver gráficas como tablas,
   Imprimir / PDF, Exportar Excel).
2. **Filtros** (una tarjeta): razón social · centros · perspectiva de fecha ·
   rango con nombre · desde · hasta · comparar contra; «Más filtros»:
   contratista, cuadrilla, periodicidad, semana o quincena, concepto, medio de
   pago. «Restablecer filtros» siempre visible.
3. **Alcance aplicado**: frase completa con lo que realmente se consultó (usa
   `resumen.alcance` resuelto por el modelo) y chips removibles por filtro.
4. **Avisos**: fuentes con error, dato desactualizado, calidad por centro,
   periodos abiertos, comparación parcial (motivos del modelo), adscripción
   histórica pendiente, vista limitada por permisos, alcance sin registros.
5. **Vistas** (pestañas): General · Nómina y pagos · Conciliación · Plantilla y
   cumplimiento.
6. **6 a 8 indicadores prioritarios** de la vista.
7. **Tendencia y comparaciones** (tendencia a todo lo ancho, luego 2–3 por fila).
8. **Excepciones** paginadas y **detalle** paginado.
9. Sólo en impresión: **definiciones** de los indicadores, perspectivas y
   estados de calidad.

| Vista | Indicadores | Gráficas | Tablas |
|---|---|---|---|
| General | neto conciliado, pagado conciliado, saldo por cubrir, cobertura, pendiente de conciliación, excedentes, pagado registrado, trabajadores con pago | tendencia, por centro, medio de pago, saldo por antigüedad | excepciones, detalle |
| Nómina y pagos | neto, pagado registrado, trabajadores con pago, promedio, mediana, pago parcial, concentración por contratista, bruto | tendencia, por contratista, medio de pago, cheques por estado | excepciones, detalle |
| Conciliación | pagado registrado, conciliado, pendiente, sin asignar, saldo, excedentes, cobertura, pago parcial | tendencia, pendiente por motivo, antigüedad, cheques | excepciones, detalle |
| Plantilla y cumplimiento | plantilla actual, altas, bajas, reingresos, rotación, trabajadores con pago | movimientos por periodo, plantilla por centro | calidad por centro, eventos |

`estado.indicadores = {VISTA: [claves]}` permite reemplazar la lista (máx. 8).

## 2. Componentes

- **Indicador**: etiqueta · insignias «Provisional» / «Fuentes incompletas» ·
  valor (botón que abre el detalle, cifras tabulares) · motivo si «No
  disponible» · operaciones o etiqueta de alcance · fórmula visible (cobertura,
  rotación) y cálculo del modelo (`desglose.formula_visible`) · estado textual
  con icono · variación absoluta y % contra el periodo comparable (puntos
  porcentuales en medidas de %) con «sube/baja, favorable/desfavorable» para
  lector de pantalla · aviso «Periodo comparable incompleto» · botón
  «Definición» (`aria-expanded`/`aria-controls`) · unidad.
  Si la medida se calculó en otra perspectiva (`perspectiva_aplicada`), lo dice.
- **Selección múltiple con búsqueda**: botón con resumen («Todos (5)», nombre o
  «3 seleccionados») → panel con búsqueda sin acentos, casillas nativas,
  «Marcar visibles», «Quitar marcas (todos)», Cancelar / Aplicar. Escape cierra
  y devuelve el foco. Sin marcas = todos. Los centros se filtran por razón
  social; las claves `__PENDIENTE__`/`__SIN_CUADRILLA__` se muestran como
  «Adscripción histórica pendiente» / «Sin cuadrilla».
- **Perspectiva de fecha**: control segmentado de radios con ✓ y la
  explicación completa visible; cada opción describe su regla (`aria-describedby`).
- **Tendencia (SVG propio)**: `role="img"` con `<title>`/`<desc>` que resume
  inicio y fin de cada serie; marcadores de forma distinta por serie; banda y
  marcas huecas «Provisional»; etiquetas al final de cada línea; recorrido con
  flechas (Inicio/Fin, Enter abre el periodo, Escape oculta) y con puntero.
- **Barras horizontales (HTML)**: cada barra es un botón con nombre accesible
  completo; valores alineados a la derecha. Por centro/contratista: barra
  apilada conciliado + pendiente + saldo = neto, con cobertura y saldo en texto.
- **Pagado registrado por medio** según `comparativos.por_medio_criterio` del modelo:
  `METODO_PLANEADO` (perspectiva periodo) se titula «por método de pago planeado» y
  explica que puede diferir del medio real; `MEDIO_REAL` (perspectiva pago) se titula
  «por medio de pago real» sin saldo ni cobertura. La fila `SIN_OBLIGACION` se
  muestra como «Pagos sin obligación», sin acción de detalle (se revisa en «Pago sin
  asignar» y excepciones). La dimensión emitida es `metodo_planeado` o `medio`.
- **Tabla alternativa** en cada gráfica (`<caption>`, `th scope`), plegable o
  todas a la vez con «Ver gráficas como tablas»; se imprimen desplegadas.
- **Tablas de excepciones y detalle**: cifras en columnas MXN alineadas,
  insignia de severidad con texto, columna «Abrir» con Detalle · Trabajador ·
  Obligación · Cierre · Pago · Evidencia (sólo si `evidencia_autorizada !== false`;
  si no, «Evidencia restringida»). Paginación con `aria-disabled` (el foco no se pierde).
- **Panel de detalle** reutilizable: `pintarDetalle(contenedor, {titulo, fila, campos}, acciones)`.
- **Estados**: esqueleto en carga inicial (`aria-busy`), marco anterior atenuado
  al refrescar (sin saltos), error por fuente con «Reintentar …», vacío
  explicado según la perspectiva, «No disponible» con motivo.

## 3. Color e identidad

Usa las variables de `:root` del template (`--card`, `--txt`, `--mut`,
`--border`, `--navy`, `--accent`, `--green/amber/red/blue` y sus `-bg`) y define
sólo tokens de gráfica en `.tb`, con modo oscuro (`prefers-color-scheme` y
`data-theme`). Identidad fija por medida en todas las gráficas:

| Rol | Medida | Claro | Oscuro | Marca |
|---|---|---|---|---|
| Referencia total | neto conciliado / pagado registrado (perspectiva pago) | `--txt` | `--txt` | círculo |
| Conciliado | pagado conciliado | `#1baf7a` | `#199e70` | cuadro |
| Pendiente | pendiente de conciliación | `#2a78d6` | `#3987e5` | triángulo |
| Falta | saldo por cubrir | `#eb6834` | `#d95926` | rombo |
| Antigüedad (ordinal) | 0–7 … >60 días | `#f3a47c→#7c3112` | `#8c3a17→#f2ab8a` | «Por vencer» en gris |

Paletas validadas con el validador de daltonismo (separación CVD ≥ 9 ΔE,
visión normal ≥ 20 ΔE; rampas ordinales monótonas). El aqua claro queda bajo
3:1 contra blanco: se compensa con leyenda textual, etiquetas finales y tabla.
Los estados nunca dependen del color: icono (✓ ! ✕ i) + texto, flechas ▲▼ +
palabras, «Fuera de la selección» escrito, «Provisional» escrito.

## 4. Accesibilidad (guías de Microsoft para informes de Power BI)

Orden de foco = orden visual; todo control es nativo (botón, casilla, radio,
select, fecha) salvo el lienzo de la gráfica (`tabindex="0"`, sin tabindex
positivo). Pestañas con `role="tablist"`, foco itinerante y flechas. Región
`role="status" aria-live="polite"` persistente: anuncia «Cargando…» o
«Resultados actualizados… N filas… Con error: …» sólo cuando cambia. El foco se
restaura tras cada repintado (`data-foco`). Texto alternativo en cada SVG,
tabla equivalente para cada gráfica («mostrar como tabla»), títulos y
etiquetas explícitos, contraste del texto con tokens del tema, `prefers-reduced-motion`
y `forced-colors`. Todo texto pasa por `esc` (o escape propio si no existe);
los textos del tooltip se insertan con `textContent`.

## 5. Impresión

`@media print` + clase `html.tb-imprimir` (botón Imprimir o Ctrl+P): imprime
sólo el tablero en horizontal, oculta controles y columna «Abrir», conserva el
alcance aplicado y los avisos, despliega todas las tablas alternativas y agrega
la sección **Definiciones**.

## 6. Glosario de etiquetas (mismos nombres y unidades que el Excel)

Formatos: MXN `$1,234.56` / `-$5.00`; porcentaje en escala 0–100 como el modelo
(`94.4%`, variación `-1.2 pp`); conteos con separador de miles; fechas
`dd/mm/aaaa`. `PLATINUM_TABLERO_VISTA.MEDIDAS[clave].etiqueta` y `.unidad` son la
fuente para encabezados del Excel.

| Clave | Etiqueta | Unidad |
|---|---|---|
| neto_conciliado | Neto conciliado | MXN |
| pagado_registrado | Pagado registrado | MXN |
| pagado_conciliado | Pagado conciliado (en gráficas: «Pagado conciliado (aplicado)») | MXN |
| saldo_por_cubrir | Saldo por cubrir | MXN |
| excedentes | Excedentes | MXN |
| sin_asignar | Pago sin asignar | MXN |
| cobertura | Cobertura de pago | % |
| pendiente_conciliacion | Pendiente de conciliación | MXN |
| variacion | Variación | MXN / % / pp |
| trabajadores_con_pago | Trabajadores con pago | personas |
| promedio_pagado_trabajador | Promedio pagado por trabajador | MXN |
| mediana_pagado_trabajador | Mediana pagada por trabajador | MXN |
| saldo_por_antiguedad | Saldo por antigüedad | MXN |
| cheques_por_estado | Cheques por estado | cheques |
| trabajadores_pago_parcial | Trabajadores con pago parcial | personas |
| concentracion_contratista | Concentración por contratista | % |
| percepciones_retenciones | Percepciones y retenciones | MXN |
| bruto | Bruto | MXN |
| costo_patronal | Costo patronal | MXN |
| respaldo_fiscal | Respaldo fiscal (neto timbrado) | MXN |
| plantilla_actual | Plantilla actual | personas |
| altas / bajas / reingresos | Altas / Bajas / Reingresos | eventos |
| rotacion | Rotación | % |

Estados de calidad: Completo · Cero confirmado · Sin registros (≠ cero) ·
Incompleto · Error de lectura. Otros: «Provisional», «No disponible»,
«Adscripción histórica pendiente», «Panorama general», «Fuera de la selección».
Perspectivas: «Periodo de nómina» y «Fecha efectiva de pago». Rangos:
Acumulado histórico, Ejercicio a la fecha, Ejercicio completo, Mes actual,
Semana actual, Quincena actual, Personalizado.

## 7. API y esquema de `estado`

```js
PLATINUM_TABLERO_VISTA.render(host, estado, acciones) // → {anuncio, vista}
estado = {
  vista: 'GENERAL'|'NOMINA_PAGOS'|'CONCILIACION'|'PLANTILLA',
  filtros: {empresa, obras[], perspectiva:'PERIODO'|'PAGO', tipo_periodo, desde, hasta,
            contratistas[], cuadrillas[], periodicidades[], periodos[], conceptos[], medios[],
            comparar:'ANTERIOR'|'ANIO_ANTERIOR'|null},
  catalogos: <CATALOGOS del modelo>,          // strings o {id|clave|valor, nombre|etiqueta, empresa, fecha_inicio, grupo}
  resumen:   <RESUMEN del modelo>,            // medidas, alcance, comparable, calidad, provisional, hoy, actualizado_en
  tendencia: <TENDENCIA del modelo>,          // {filas:[por centro × periodo]} o {serie:[consolidada]}
  comparativos: <COMPARATIVOS del modelo> + {panorama_general?, por_centro[].seleccionado?},
  excepciones: <EXCEPCIONES paginado>,        // filas con tipo, severidad ROJO|AMBAR|INFO, llaves{…}
  detalle:   <DETALLE paginado>,              // grano OBLIGACION | OPERACION; columnas[] opcional
  plantilla: <PLANTILLA del modelo> + {tendencia?[], por_centro?[]},  // eventos paginados = detalle de la vista Plantilla
  cargando: true | {resumen?, tendencia?, comparativos?, excepciones?, detalle?, plantilla?, catalogos?},
  errores: {fuente: 'mensaje' | {mensaje}},
  actualizado_en, desactualizado?, ahora?, vigencia_minutos?,
  indicadores?: {VISTA:[claves]}
}
acciones = {cambiarFiltros(parcial), restablecer(), abrirDetalle(clave, contexto),
  abrirTrabajador(id, fila), abrirCierre(id, fila), abrirPago(id, fila), abrirEvidencia(id, fila),
  exportar(formato, {vista, filtros, alcance}), cambiarVista(vista), reintentar(fuente|'todo'),
  // opcionales:
  paginar(fuente, pagina), abrirObligacion(id, fila), imprimir()}
```

- `cambiarFiltros` emite parciales: `{empresa, obras:[]}`, `{perspectiva}`,
  `{tipo_periodo}` (el integrador resuelve `desde/hasta`; `HISTORICO` y
  `QUINCENA` no existen en el modelo), `{tipo_periodo:'PERSONALIZADO', desde|hasta}`
  (valida desde ≤ hasta), `{comparar: …|null}`, `{<filtro>:[valores]}`.
- `abrirDetalle(clave, ctx)`: clave = medida (`neto_conciliado`…), `'tendencia'`
  (ctx `{dimension:'periodo', valor:lunes ISO, desde, hasta}`), llave de fila
  (`obligacion_id`, `operacion_id` o `TIPO:llaves…` en excepciones) u
  `'obligacion'` si no hay `abrirObligacion`. `ctx` lleva `origen`, `vista`,
  `filtros` y, según el caso, `dimension/valor/etiqueta` o `fila`.
- Sin `paginar`, la página se pide con `cambiarFiltros({paginas:{fuente:n}})`.
- Si `cambiarVista` no repinta, la vista cambia localmente con el mismo estado.
- Tendencia: si llegan filas por centro, la vista las suma por semana calendario
  (lunes–domingo) de `fecha_pago` (o `periodo_desde` en perspectiva de pago); una
  semana con `hasta ≥ hoy` se marca provisional. Las fechas reales por centro se
  usan también en la comparación por centro.
- Otras funciones: `pintarDetalle`, `imprimir`, `formatos`, `MEDIDAS`, `VISTAS`,
  `CALIDAD`, `PERSPECTIVAS`, `PRESETS`, `COMPARAR`, `TIPOS_EXCEPCION`, `SERIES`,
  `etiqueta(clave)`, `definicion(clave)` (prioriza `PLATINUM_TABLERO_MODELO.DEFINICIONES`),
  `medida(estado, clave)`, `alcanceTexto(estado)`, `claveFila(fila)`, `pintar.*`.

## 8. Integración

- Hoja de estilos (template, después de `platinum-cinta.css`):
  `<link rel="stylesheet" href="assets/platinum-tablero.css?v=<versión>">`
- Módulo en `frontend/modulos.json` después de `76-tablero-modelo.js`.
- Ancho de trabajo: `modal(html, 'tb-pantalla')` (pantalla completa con fondo
  `--bg`) o una vista principal; la tendencia se redibuja a la escala real del
  contenedor (ResizeObserver).
