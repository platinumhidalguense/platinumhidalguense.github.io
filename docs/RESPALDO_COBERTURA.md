# Respaldo completo de trabajadores

El respaldo V2 sustituye la exportación técnica integral V1. La acción **Exportar respaldo completo de trabajadores** produce un solo Excel de todos los expedientes accesibles de todas las razones sociales y centros, incluidos activos, bajas y reingresos. No usa el centro abierto, los filtros, la selección ni la página visible. La papelera se incluye sólo cuando el permiso existente la permite.

## Hojas por contenido

Sólo se crean hojas con datos:

- **Padrón completo**: una fila por ID, número, nombre, empresa, centro, contratista, cuadrilla, puesto, estatus y fechas.
- **Datos personales y contacto**, **Domicilios**, **Datos laborales y contratos**, **Datos bancarios**: campos de ficha separados por tema; no se inventan componentes de domicilio ni antigüedad no registrados. La edad se identifica como cálculo a la fecha del respaldo, mediante el mismo helper vigente de la ficha.
- **Salarios e historial**: SD, SDI/SBC con su precisión original, salario del periodo, sueldos internos autorizados, diferenciales, ajustes y cambios salariales conservados.
- **Altas bajas y reingresos**: todos los eventos y correcciones conservados, fechas, motivos, actor y referencia de reversión; ciclo sólo si está registrado. Las fechas de ficha sin evento equivalente se identifican con esa procedencia.
- **Movimientos IMSS**, **Incidencias e incapacidades**, **Créditos y préstamos**: presentación afiliatoria, casos sin servicio, faltas, vacaciones, certificados, calendarios por pagador, ST-7, jornadas extraordinarias, créditos y avisos aplicados.
- **Prestaciones y finiquitos**: aguinaldos, primas, papeles, revisiones, históricos y transferencias de finiquito.
- **Nóminas individuales**: conceptos individuales de fotografías, sus versiones, NOI y excepciones documentadas. El desglose del modelo se vincula como detalle y no genera otra línea de pago.
- **Obligaciones individuales**, **Pagos y cheques**, **Vínculos de pagos**: registros, estados, folios, cancelaciones, reposiciones, aplicaciones y retiros, relacionados por referencia.
- **Documentos del expediente**, **Procesos del expediente**: recepción, metadatos, referencias privadas, periodo e importes fiscales, tareas, actas, NOM-035 autorizada, constancias y otros antecedentes.
- **Cambios del expediente**: antes/después por campo efectivamente cambiado, fecha y usuario, sin repetir fotografías completas sin cambios.
- **Detalle de expedientes**: información anidada en columnas Dato y Valor con sección y referencia; sin celdas de objetos JSON.
- **Resumen del respaldo**: generación, alcance, cantidades por fuente y centro, exclusiones por permiso y antecedentes sin vínculo verificable.
- **Textos extensos**, únicamente si hace falta: partes consecutivas con referencia, sin truncar el valor.

## Fidelidad y relaciones

No se fusionan personas por nombre, número o razón social. Se conservan los identificadores y relaciones existentes. Los antecedentes distinguen centro actual y centro del registro. Los registros sin vínculo verificable se mantienen con su contexto y una advertencia, sin asignarlos por parecido de nombre.

CURP, RFC, NSS, cuentas, CLABE, teléfonos, códigos postales, folios e IDs son texto. Las notas no se ejecutan como fórmulas. Los importes conservan sus decimales; si exceden la precisión de Excel se conserva el original como texto. No se recalculan salarios ni motores. Sin dato indica un valor nulo; una cadena vacía permanece vacía y un campo ajeno a ese tipo de registro queda en blanco. Cero sigue siendo cero. Fechas y horas mantienen formato ISO.

Obligaciones, pagos, cheques y aplicaciones son entidades relacionadas: **no deben sumarse entre sí como otra deuda o pago**. El resumen cuenta registros, sin sumar importes entre capas. Las versiones históricas se identifican por separado.

## Exclusiones y permisos

Se reutilizan el alcance de control_respaldo y las políticas de lectura existentes. El perfil exclusivo de contratos no genera respaldos; los contenidos VIP y de salud conservan sus restricciones y las exclusiones aparecen en el resumen.

No se consultan configuración, usuarios, permisos internos, presupuestos, infraestructura ni bitácoras generales. Los catálogos necesarios sirven sólo para traducir referencias, sin exportar su estructura. No se incluyen SQL, código, credenciales, binarios, OCR duplicado, URLs temporales firmadas ni fotografías generales de nómina. Los originales de documentos y contratos firmados permanecen intactos en su archivo privado.

## Integridad y rendimiento

53 fuentes pertinentes, columnas proyectadas y paginación completa que avanza según las filas efectivamente recibidas, incluso si el servidor impone páginas menores. Sin consultas por trabajador.

El padrón se contrasta con el conteo accesible del servidor. Marcas y permisos se comprueban antes/después y entre razones sociales; la fuente nueva de jornada usa doble lectura proyectada. Si faltan páginas, se repite un registro, falla una consulta o persisten cambios concurrentes, no se descarga un archivo parcial ni se anuncia respaldo completo.

No es una transacción única de base de datos: se declara esa limitación. Las marcas ligeras del historial inmutable comprueban identidad y cantidad de eventos. El archivo usa compresión y textos compartidos; los límites reales de Excel dividen hojas dentro del mismo libro, nunca archivos por razón social o por un presupuesto arbitrario de caracteres.

## Verificación

El test_respaldo_integral.cjs ejecuta el módulo real, datos ficticios de ambas empresas, varios estados, centros inactivos, paginación limitada, relaciones, permisos, errores, concurrencia, UI sintética y lectura XLSX/ZIP. verificar_respaldo_trabajadores.py abre el libro ficticio con openpyxl independiente. No son pruebas visuales ni operan datos reales.

Se genera una matriz interna dato → fuente → hoja/columna con campos y rutas anidadas, sin agregar hojas técnicas al respaldo.
