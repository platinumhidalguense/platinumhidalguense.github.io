// Dependencia de presentación aislada. El resolutor real se prueba en test_puestos_prestaciones.
exports.instalar=c=>{
 c.puestoNombre=w=>w?.puesto||'';
 c.puestoResolver=w=>({resuelto:!w?.puesto||!!c.catalogoPuestos?.().includes(w.puesto)});
};
