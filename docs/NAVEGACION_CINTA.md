# Cinta y contexto de PLATINUM OS

Candidata local **2026-11-09.1**, basada en **2026-11-08.2**. El [inventario antes y después](navegacion-cinta.json) conserva las 62 etiquetas, grupos, destinos con parámetros, condiciones de visibilidad, carga y coincidencias de accesos contextuales. Los selectores de empresa y centro están en la ruta superior.

## Referencia y adaptación

| Evidencia de Grupo Tress Internacional | Adaptación en PLATINUM |
| --- | --- |
| La captura de IDSE muestra módulos arriba, herramientas con icono y nombre bajo el módulo elegido, grupos separados y una franja con empleado y nómina antes del área operativa. [Captura de IDSE](https://tress.com.mx/wp-content/uploads/2022/07/ST1.png) · [Guía de IDSE](https://tress.com.mx/blog/validacion-de-movimientos-idse/) | Diez pestañas, cinta plegable y contexto de empresa, centro y ruta. Los selectores de periodo y trabajador siguen en las herramientas donde se aplican. |
| El alta simplificada usa una lista vertical de secciones y los campos a la derecha. [Alta y reingreso simplificados](https://tress.com.mx/blog/proceso-de-altas-y-reingreso-simplificado/) | Asignación, Datos personales y Documentos ocupan la columna izquierda en escritorio. En móvil pasan arriba de los campos. Son los mismos pasos y validaciones. |
| El tablero de Supervisores pone primero los totales y debajo las listas para revisar. [Panel de Supervisores](https://tress.com.mx/blog/panel-to-do-en-modulo-supervisores/) | Inicio concentra Centro de Control, Dashboard, Alertas, Pendientes y Operación RRHH. Los tableros conservan sus fuentes. |
| Resguardo documenta rutas de módulo, sección y acción. El catálogo identifica Sistema TRESS como producto distinto de Revolution y +ORDEN. [Rutas de Resguardo](https://tress.com.mx/blog/optimizaciones-en-modulo-resguardo/) · [Catálogo](https://tress.com.mx/sistema-tress/) | La cinta muestra dónde encontrar las acciones. Las migas describen la herramienta abierta aunque se explore otra pestaña. Paleta, iconos de línea y textos propios. |

## Mapa

| Pestaña | Grupos |
| --- | --- |
| Inicio | Supervisión · Seguimiento |
| Empleados | Padrón y alta · Cambios y adscripción |
| Expediente | Expedientes y documentos · Prevención y disciplina |
| Asistencia | Listas y movimientos · Ausencias e incidencias |
| Nómina | Cálculo y proyecciones · Retenciones y prestaciones · Cierres y auditoría |
| IMSS / INFONAVIT | IMSS, IDSE y SUA · Créditos y evidencias |
| Pagos y conciliación | Conciliación · Recibos de nómina · Pagos y cheques · Cuentas y tarjetas |
| Cuadrillas y contratistas | Equipos de obra · Contratistas y REPSE · Nómina y concentrados |
| Reportes | Personal e históricos · Costos y exportación |
| Sistema | Centros de trabajo · Historial y asistencia · Mantenimiento y respaldos |

En **Cuadrillas y contratistas** se encuentran Cuadrillas por contratista, Contratistas / REPSE, Editar contratistas, Proyección por contratista, Resumen por contratista y Concentrado por contratista. Se movieron desde Asistencia, Administración, Nómina y Reportes para que las seis operaciones sobre contratistas estén juntas.

## Rutas operativas

- **Empleados → Padrón → ficha**. Expediente 360, calendario y Preparación de nómina siguen en la ficha. El alta también está en **Empleados → Padrón y alta**.
- **Inicio → Seguimiento → Pendientes y aprobaciones**. Abre Preparación del periodo. Mantiene selección, comparativo, evidencias y regreso desde el Conciliador. **Inicio → Seguimiento → Operación RRHH** conserva Corte, procesos y Expediente 360.
- **Nómina → Cierres y auditoría → Cierres y versiones**. Reutiliza el Conciliador. **Pagos y conciliación** permite entrar directamente a **Conciliador General** o **Gestión de Cheques**. Ambas acciones abren pestañas de la misma herramienta financiera.
- Las acciones de alta, centros, papelera, cálculo, cierres y pagos pasan por sus controles vigentes. La cinta conserva el acceso por rol y ámbito. Las cuentas de contratos siguen entrando a su portal específico.

## Revisión

1. En escritorio, abre Empleados y luego Cuadrillas y contratistas. Comprueba que la tabla y su ruta se mantienen hasta elegir una acción. Pliega la cinta y verifica el espacio recuperado. Prueba inicio y fin, flechas, tabulación y Escape. Cierra una ventana y revisa el regreso del foco al botón o a la pestaña visible.
2. En móvil, desplaza las pestañas y la cinta. Verifica que las etiquetas largas y la razón social sigan legibles. Cambia a oscuro en Cuenta. Con movimiento reducido, verifica la navegación sin animación de la cinta o los diálogos.
3. Con datos ficticios, prueba el alta, Expediente 360, calendario, Operación RRHH, comparativo y las dos entradas financieras. Comprueba que un cambio de pestaña no altera una captura y que las acciones respetan el centro y periodo efectivos. Las verificaciones de comportamiento están en la batería local. La aceptación visual requiere revisión del propietario.

La demo local está en `work/cinta_20261109/vista-demostrativa.html`. Usa la cinta y los estilos de la candidata con datos ficticios y controles de presentación. Permite revisar claro, oscuro, scroll, teclado, pliegue y estructura del alta. La demo es independiente de autenticación, Supabase y operaciones. La batería local se reproduce con `node scripts/verificar_integracion.cjs` desde la raíz de la copia.

## Archivos y reversión

- `frontend/index.template.html` contiene la estructura, iconos y los 63 botones. `assets/platinum-cinta.css` aplica el tema, la cinta y la adaptación del formulario.
- Los módulos 01 y 03 conectan contexto, pestañas, foco y apertura. El módulo 05 incorpora el contenedor visual del alta. El manifiesto y el activo generado identifican la candidata. El inventario y la regresión de navegación documentan las rutas.
- Para revertir localmente, restaura plantilla, manifiesto, registro de revisión, módulos 01/03/05 y pruebas modificadas desde `work/cinta_20261109/base`. Reconstruye índice, activo e inventario con `node scripts/construir_frontend.cjs` y `node scripts/guardar_inventario.cjs`. El commit de referencia es `8ebf4d797b2fe0f52f0c5acd9bfd907388480bea`. El cambio se revierte en código y presentación.
