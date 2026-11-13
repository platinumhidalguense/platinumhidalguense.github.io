// Carga el contrato de presentación real en entornos sintéticos parciales.
const fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn');
exports.instalar=c=>{c.CFGEMP||={};const s=fs.readFileSync('frontend/modulos/31-documentos-laborales.js','utf8');const names=new Set(['datosEmpresaContrato','camposContratoTrabajador']);vm.runInContext(acorn.parse(s,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.has(n.id.name)).map(n=>s.slice(n.start,n.end)).join('\n'),c);};
