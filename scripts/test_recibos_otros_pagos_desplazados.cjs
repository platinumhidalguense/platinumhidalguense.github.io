// Casos sintéticos del orden de extracción de PDF.js. Sin datos personales.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');const b={Date};b.window=b;vm.createContext(b);vm.runInContext(fs.readFileSync('frontend/modulos/44-respaldo-recibos.js','utf8'),b);const parse=b.PLATINUM_RESPALDO_RECIBO.parsear;
const base='EMP900101AA1 PRUP900101AA1 Periodo del: 25/may./2026 al 31/may./2026 Neto pagado: 475.73 Total percepciones: 258.70 Total deducciones sin ISR: 0.00 ';
const tail='Total otros pagos: ISR retenido: 0.00 Total: 475.73 217.03 + - =';
let p=parse(base+tail);assert.equal(p.datos.otros_pagos,217.03);assert.equal(p.neto,475.73);assert.equal(p.datos.deducciones,0);assert.equal(p.errores.length,0);
p=parse((base+tail).replaceAll('475.73','411.05').replace('258.70','194.02'));assert.equal(p.datos.otros_pagos,217.03);assert.equal(p.neto,411.05);assert.equal(p.errores.length,0);
p=parse(base+'Total otros pagos: 217.03 ISR retenido: 0.00');assert.equal(p.errores.length,0);assert.equal(p.datos.otros_pagos,217.03);
p=parse(base+tail.replace('217.03','0.00'));assert(p.errores.some(e=>e.includes('no cuadran')));assert.equal(p.datos.otros_pagos,0); // No inventar otros pagos por diferencia.
p=parse(base+tail.replace('217.03 + - =','217.03 - + ='));assert(p.errores.some(e=>e.includes('importe literal')));
p=parse(base+tail+tail);assert(p.errores.some(e=>e.includes('más de un resumen')));
p=parse(base+tail.replace('Total: 475.73','Total: 475.74'));assert(p.errores.some(e=>e.includes('total fiscal'))); // La suma superior no oculta otro total fiscal.
p=parse('Neto pagado: 3,347.13 Total percepciones: 3,709.26 Total deducciones sin ISR: 71.88 Total otros pagos: ISR retenido: 290.24 Total: 3,347.14 0.00 + - =');assert(p.errores.some(e=>e.includes('no cuadran')));assert.equal(p.neto,3347.13);
p=parse('Neto pagado: 4,014.10 Total percepciones: 5,692.40 Total deducciones sin ISR: 1,060.78 Total otros pagos: ISR retenido: 659.73 Total: 3,971.89 0.00 + - =');assert(p.errores.some(e=>e.includes('no cuadran')));assert.equal(p.neto,4014.1);
p=parse('Neto pagado: 2,000.00 Total percepciones: 2,200.00 Total deducciones sin ISR: 100.00 Total otros pagos: ISR retenido: 100.00 Total: 2,000.00 0.00 + - =');assert.equal(p.errores.length,0);
console.log('PASS recibos: otros pagos positivos y cero, orden PDF.js, patrón ambiguo/incompleto, recuperación literal sin inventar importes, contradicciones de un centavo y de cuantía mayor conservadas.');
