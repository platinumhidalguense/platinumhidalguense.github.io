// Carga dependencias reales para las pruebas aisladas de consumidores.
const fs=require('node:fs');
exports.source=()=>['52-motor-nomina-semanal','53-motor-nomina-quincenal','54-asignacion-motores-nomina'].map(n=>fs.readFileSync('frontend/modulos/'+n+'.js','utf8')).join('\n');
