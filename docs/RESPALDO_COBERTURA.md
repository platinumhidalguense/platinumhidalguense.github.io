# Respaldo integral · cobertura (RESPALDO_INTEGRAL_V1)

Documento público: describe qué cubre el respaldo, cómo se verifica y qué queda fuera. No contiene datos personales ni consultas del servidor.

## Qué es
«Respaldo Excel» genera un libro por razón social con todas las fuentes operativas que el usuario está autorizado a ver, relacionadas por IDs estables. Es distinto de la exportación filtrada del tablero: no aplica filtros de fecha ni de vista. El módulo `frontend/modulos/79-respaldo-integral.js` expone `window.PLATINUM_RESPALDO` (`abrir`, `exportar`, `fuentes`).

## Garantías
- **Completo**: cada fuente se lee con paginación ordenada por llave, reintentos y detección de filas repetidas; el conteo leído se compara con el del servidor. Si una fuente falla, el respaldo se marca **INCOMPLETO** (también en el nombre del archivo) y se ofrece reintentar.
- **Consistente**: el servidor entrega marcas por tabla (conteo, máximos de fecha y huella) calculadas en una sola instantánea, antes y después de leer. Lo que cambió se vuelve a leer; si sigue cambiando, queda INCOMPLETO con el motivo.
- **Mismo alcance que la aplicación**: los permisos (centro, razón social, acceso total, salud, administrador) se resuelven en el servidor. Un usuario restringido obtiene archivo y conteos de su alcance; el rol de consulta de contratos no genera respaldos.
- **Fidelidad**: IDs, CURP, RFC, NSS, CLABE, cuentas, folios y códigos son texto (formato @, conservan ceros); importes numéricos con formato monetario y, donde hace falta para reconstruir un cálculo, la precisión de origen como columna `__origen`; `∅ NULL` = nulo, celda vacía = texto vacío, 0 = cero; ninguna cadena se evalúa como fórmula; fechas en ISO; JSON completo.
- **Límites de Excel**: textos de más de 32,767 caracteres van en `TEXTOS_LARGOS` por partes con huella; hojas de más de 1,048,575 filas o libros que exceden la capacidad del navegador se dividen en hojas y archivos numerados que el MANIFIESTO enlaza.
- **Privacidad**: los originales de documentos permanecen en Storage privado; el libro lleva sólo metadatos, ruta lógica privada y huella. No hay URLs firmadas ni credenciales; la configuración sólo se incluye si el usuario la elige y únicamente con campos explícitos.

## Hojas de control
- **MANIFIESTO**: formato y versiones, fecha y hora, usuario, razón social, centros (y centros excluidos), alcance, filtros, fuente temporal (marcas), partes y hojas con rangos de filas, estado por fuente con huella, exclusiones, campos omitidos por permiso, limitaciones, errores, compatibilidad y convenciones.
- **DICCIONARIO**: hoja, campo, tipo, clave (PK/FK), relación, permiso, origen y descripción.
- **CONTROL**: filas y totales al centavo por fuente y centro contra el servidor; cuadre con el modelo del tablero (`PLATINUM_TABLERO_MODELO`) en perspectiva de periodo y de pago.
- **MOVIMIENTOS_LABORALES**: un evento por movimiento documentado (alta, baja, reingreso con fecha efectiva, traslado, correcciones) con ciclo y fuente. La fecha de reingreso vigente del padrón no sustituye reingresos anteriores; si un ciclo antiguo no tiene evidencia, se conserva lo disponible y se declara.

## Cobertura por dominio
Permiso «operativo» = el alcance normal del usuario por centro y razón social.

### Centros, contratistas, cuadrillas y catálogos

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| CENTROS | tabla | centros | operativo | No exportado |
| CONTRATISTAS | tabla | obra_o_global | operativo | No exportado |
| CUADRILLAS | tabla | obra | operativo | No exportado |
| CAT_INCIDENCIAS | tabla | global | operativo | No exportado |
| CAT_PERCEPCIONES | tabla | global | operativo | No exportado |
| CAT_PUESTOS | tabla | global | operativo | No exportado |

### Padrón y datos personales

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| PADRON | tabla | obra | operativo | Parcial: 37 campos por centro, sin fecha_reingreso ni IDs |

### Salarios y perfiles

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| SUELDOS_INTERNOS | tabla | obra | vip | No exportado |
| DIFERENCIALES | tabla | obra | operativo | No exportado |

### Relación laboral y movimientos

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| MOVIMIENTOS_IMSS | tabla | obra | operativo | No exportado |
| ALTAS_BAJAS_CORTAS | tabla | obra | operativo | No exportado |
| EXPEDIENTES_PEND | tabla | obra | operativo | No exportado |
| RRHH_PLANTILLAS | tabla | global | operativo | No exportado |
| RRHH_PROCESOS | tabla | obra | operativo | No exportado |
| RRHH_TAREAS | tabla | obra | operativo | No exportado |
| RRHH_EVENTOS | tabla | obra | operativo | No exportado |

### Incidencias y prestaciones

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| DESCUENTOS | tabla | obra | operativo | Parcial: sólo activos, 6 campos |
| INCIDENCIAS | tabla | obra | operativo | No exportado |
| PRESTAMOS | tabla | obra | operativo | No exportado |
| VACACIONES | tabla | obra | operativo | No exportado |
| PRIMAS | tabla | obra | operativo | No exportado |
| ACTAS | tabla | obra | operativo | No exportado |
| NOM035 | tabla | obra | salud | No exportado |
| FALTAS_HISTORICAS | tabla | obra | operativo | No exportado |
| ISR_QUINCENAL | tabla | obra | operativo | No exportado |

### Aguinaldo

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| AGUINALDO_LINEAS | tabla | obra | operativo | No exportado |
| AGUINALDO_LOTES | tabla | padre | operativo | No exportado |

### Bajas y finiquitos

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| PAPELES_PRESTACIONES | tabla | obra | operativo | No exportado |
| PRESTACIONES_HIST | tabla | obra | operativo | No exportado |
| PRESTACIONES_FUENTES | tabla | obra | operativo | No exportado |
| FINIQUITOS_TRANSF | tabla | obra | operativo | No exportado |
| AUDITORIA_CALCULOS | tabla | obra | operativo | No exportado |
| CONSTANCIAS | tabla | obra | operativo | No exportado |
| BAJAS_OPERACIONES | tabla interna | interna | vip | No exportado |

### Nómina y cierres

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| CIERRES | tabla | obra | operativo | No exportado |
| CIERRE_VERSIONES | tabla | obra | operativo | No exportado |
| CIERRES_ELIMINADOS | tabla | obra | admin | No exportado |
| FLUJO_CIERRES | tabla | obra | operativo | No exportado |
| SOLICITUDES_FLUJO | tabla | obra | operativo | No exportado |
| CONCILIACION_NOI | tabla | obra | operativo | No exportado |
| DESGLOSE_NOI | tabla | obra | operativo | No exportado |
| ESTADO_CONCILIACION | tabla | obra | operativo | No exportado |
| ARCHIVOS_CONCILIACION | tabla | obra | operativo | No exportado |
| REVISION_PAGOS | tabla | obra | operativo | No exportado |
| PRESUPUESTOS | tabla | obra | operativo | No exportado |
| EXCEPCIONES_NOI | tabla interna | interna | vip | No exportado |
| CORRECCIONES_CENTAVOS | tabla interna | interna | vip | No exportado |
| IDENTIDADES_NOI | tabla interna | interna | vip | No exportado |

### Obligaciones y pagos

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| OBLIGACIONES | tabla | obra | operativo | No exportado |
| EVIDENCIAS | tabla | obra | operativo | No exportado |
| APLICACIONES | tabla | obra | operativo | No exportado |
| PAGOS | tabla | obra | operativo | No exportado |

### Cheques

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| CHEQUES | tabla | obra | operativo | Parcial: 14 campos sin IDs |
| BLOQUES_CHEQUES | tabla | obra | operativo | No exportado |
| LOTES_CHEQUES | tabla | obra | operativo | No exportado |
| RETIROS_CHEQUES | tabla | obra | operativo | No exportado |
| FOLIOS_JUSTIFICADOS | tabla | global | operativo | No exportado |
| REUNIONES_ENTREGA | tabla | empresa | operativo | No exportado |
| REUNION_CHEQUES | tabla | padre | operativo | No exportado |
| REUNION_BLOQUES | tabla | padre | operativo | No exportado |
| PERMISOS_CHEQUES | tabla | global | admin | No exportado |

### Expediente y cumplimiento

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| DOCUMENTOS | tabla | obra | operativo | Parcial: sin anulados, 7 campos |
| CUMPLIMIENTO | tabla | obra | operativo | No exportado |
| ARCHIVO_RECIBOS | tabla interna | interna | vip | No exportado |
| LECTURAS_FISCALES | tabla interna | interna | vip | No exportado |
| CFDI_PDF_VERIFICADOS | tabla interna | interna | vip | No exportado |
| RECIBOS_IA | tabla interna | interna | vip | No exportado |

### IMSS y créditos

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| CASOS_IMSS | tabla | obra | salud | No exportado |
| CASOS_IMSS_SEMANAS | tabla | padre | salud | No exportado |
| ST7_ACUSES | tabla | obra | salud | No exportado |
| INCIDENTES | tabla | obra | salud | No exportado |
| IMSS_AUDITORIA | tabla interna | interna | vip_salud | No exportado |
| INFONAVIT_AVISOS | tabla | empresa | operativo | No exportado |
| INFONAVIT_APLICACIONES | tabla | obra | operativo | No exportado |
| INFONAVIT_ARCHIVOS | tabla | padre | operativo | No exportado |

### Auditoría

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| HISTORIAL | tabla | obra | operativo | Parcial: 500 eventos, 4 campos |
| BITACORA | tabla | obra | operativo | No exportado |
| AUTOMATIZACIONES | tabla | global | vip | No exportado |

### Configuración (selección explícita)

| Hoja | Origen | Alcance | Permiso | Antes (V0) |
|---|---|---|---|---|
| CONFIGURACION | tabla | config | operativo · opcional | No exportado |
| ACCESOS | tabla | global | admin_vip · opcional | No exportado |

## Fuera del respaldo (visible en el MANIFIESTO)
| Objeto | Motivo |
|---|---|
| Credenciales y configuración de seguridad o de servicios | Nunca se respaldan en Excel. |
| Índices y colas técnicas de búsqueda asistida | Regenerables desde las fuentes respaldadas. |
| Avisos técnicos de sincronización y presencia de sesiones | Efímeros; el antes/después está en HISTORIAL y BITACORA. |
| Copias técnicas de migraciones puntuales | Sin lectura de cliente; permanecen en la base. |
| Vistas derivadas | Se recalculan desde las hojas de origen. |
| Colas, bloqueos y errores técnicos de lectura documental | Transitorios. |
| Archivos originales | Permanecen en Storage o en la base privada; sólo metadatos, ruta lógica y huella. |

## Compatibilidad con el respaldo anterior (V0)
- Se conserva una hoja por centro con el mismo nombre y las mismas columnas; al final se agregan DOCS ENTREGADOS, FECHA REINGRESO e ID TRABAJADOR.
- CHEQUES, DESCUENTOS, EXPEDIENTE DIGITAL e HISTORIAL RECIENTE se sustituyen por CHEQUES, DESCUENTOS (filtrar activo), DOCUMENTOS (filtrar VIGENTE) e HISTORIAL completo.
- El archivo se llama `RESPALDO_INTEGRAL_V1_<razón social>_<fecha y hora>.xlsx`; «Respaldo por correo» sigue abriendo el correo con el resumen para adjuntar los archivos.
- No había lectores automáticos del archivo V0 (sólo los botones de la barra lateral).

## Verificación
- `scripts/test_respaldo_integral.cjs`: código real en VM con Supabase simulado; relee el libro con `scripts/verificar_respaldo_xlsx.py` (openpyxl, independiente del escritor).
- `scripts/test_respaldo_pg.cjs`: función de marcas en PostgreSQL local con las políticas vigentes; compara marcas contra lo que la RLS entrega a cada perfil (requiere el paquete privado).
