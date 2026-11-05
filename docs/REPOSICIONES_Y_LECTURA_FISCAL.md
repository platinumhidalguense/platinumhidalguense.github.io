# Reposición y lectura fiscal

## Cheque físico devuelto

Conserva el cheque anterior como CANCELADO y abre una nueva captura para la misma persona, semana y concepto. Verificar neto consulta el CFDI timbrado y después NOI. Cuando existe un cheque físico cancelado, Guardar pide confirmar que fue devuelto y no fue cobrado; la nueva captura queda vinculada al anterior.

La reposición exige nuevos número y consecutivo. No requiere reabrir el cierre histórico para llenar el nuevo cheque. Siguen vigentes los controles de identidad, periodo, importe fiscal, pagos existentes y reposiciones duplicadas. Cancelar no elimina un comprobante ni autoriza un segundo pago cuando todavía existe una aplicación de pago que necesita revisión.

## Clasificación documental

El lector XML distingue las percepciones del complemento de nómina. El tipo extraordinario por sí solo no prueba que sea finiquito; aguinaldo o prima vacacional aislados tampoco. Los recibos que reúnen conceptos de nómina y separación sin un reparto respaldado quedan por revisar. Un PDF y un XML del mismo UUID representan un solo timbre.

La lectura del servidor conserva el archivo original y su huella. Sus resultados fiscales se guardan por documento y se consultan desde las validaciones de cheques, conciliación y timbrado. Los metadatos de una importación antigua se conservan para poder auditar diferencias con el contenido real del archivo. Leer o clasificar documentos no acredita pago bancario, no autoriza cierres y no modifica salarios ni fórmulas de nómina.

## Verificación técnica

Pruebas de clasificación: `node scripts/test_clasificacion_documental.cjs`.

Pruebas de captura: `node scripts/test_reposicion_cheque_ui.cjs`.

El paquete privado también contiene pruebas PostgreSQL de las rutas del servicio y de los vínculos de reposición. La batería pública las omite cuando no dispone de esas migraciones; no declara que se ejecutaron.
