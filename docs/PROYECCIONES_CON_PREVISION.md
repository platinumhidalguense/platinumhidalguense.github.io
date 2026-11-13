# Proyecciones con previsión social

Cuando el modelo vigente contiene previsión, las dos presentaciones comparten tres columnas: sueldo registrado menos retenciones, previsión social y neto total a pagar. La previsión se toma separada del modelo, calculada antes de las retenciones del periodo. El primer importe se obtiene del neto vigente menos esa previsión; el adaptador no vuelve a calcular ISR, cuotas, incidencias ni créditos.

Ejemplo: registrado 5,000, real 8,000, retenciones 500: 4,500 + 3,000 = 7,500. Las filas y los totales de Excel usan G/H/I; I suma G+H. La vista previa consume el mismo adaptador. Se conserva la hoja RETENCIONES y las hojas fiscales adicionales. El bruto del aguinaldo permanece en su desglose AGUINALDO cuando corresponde.

No cambia el formato de los modelos sin previsión. Se conservan personas, cuentas como texto, medios de pago, grupos, orden, estilos y reglas de pago. Esta capa no modifica motores ni fotografías.

Validación: 307 comprobaciones adicionales con archivos XLSX serializados y releídos, ambos destinos y razones sociales, importes sin retención, con incidencia y crédito, y compensación de ISR ya incluida en el modelo. Pruebas sintéticas sin navegador.
