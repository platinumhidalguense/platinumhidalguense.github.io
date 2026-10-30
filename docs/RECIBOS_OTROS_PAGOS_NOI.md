# Otros pagos en recibos NOI

PDF.js puede extraer las etiquetas del resumen fiscal antes de la columna de importes. En el diseño identificado, entrega «Total otros pagos: ISR retenido: [ISR] Total: [neto fiscal] [otros pagos] + - =». El lector ahora rescata el importe literal de otros pagos exclusivamente cuando hay un único bloque con esa estructura completa. También conserva el formato normal de etiqueta y valor contiguos.

No calcula otros pagos restando netos ni los interpreta como ISR negativo del motor. Se sigue cotejando percepciones más otros pagos menos deducciones contra el neto pagado. Un bloque ambiguo o incompleto requiere revisión; las contradicciones del documento permanecen bloqueadas, incluso por un centavo.

La corrección es de lectura documental. No modifica fórmulas de nómina, importes pagados, cierres ni originales archivados. Los PDF ya subidos se reintentan con «Verificar pendientes». Los XML del mismo trabajador y periodo siguen siendo otra fuente fiscal disponible.

La regresión sintética cubre otros pagos positivos/cero, formato normal y desplazado, evidencia incompleta/duplicada y contradicciones entre el neto de nómina y el resumen fiscal. La reproducción local usa la misma versión PDF.js de la plataforma. Los archivos reales y sus textos no se publican en el repositorio.
