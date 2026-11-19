// Recibo de nómina de dos columnas con resumen fiscal al pie (diseño tipo CONTPAQ/JIRE).
// Datos completamente ficticios: posiciones y etiquetas reproducen el diseño, no a una persona.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const box=vm.createContext({window:{}});
for(const file of ['44-respaldo-recibos','68-lectura-contextual-recibos'])vm.runInContext(fs.readFileSync('frontend/modulos/'+file+'.js','utf8'),box);
const {PLATINUM_CAMPOS_RECIBO:campos,PLATINUM_RESPALDO_RECIBO:lector}=box.window;
let pruebas=0;const ok=(c,m)=>{assert(c,m);pruebas++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);pruebas++;};
const uuid='AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE',sello='A'.repeat(60);
// [y,[[x,texto],...]]: cada fragmento es una pieza de texto de PDF.js en su posición.
const base=({otros=[[283,[[293,'Total otros pagos:']]],[280,[[548,'0.00']]],[280,[[570,'+']]]],total='990.00',percepciones='1,000.00'}={})=>[
 [760,[[30,'EMPRESA FICTICIA DE PRUEBA']]],
 [745,[[30,'RFC: FIC221209AA1']]],
 [674,[[31,'Registro Patronal IM SS: Z0000000000']]],
 [650,[[32,'Nombre:'],[119,'PERSONA DE PRUEBA']]],
 [629,[[32,'CURP:'],[119,'PRUP900101HHGXXX01'],[369,'No. Nóm ina:'],[446,'43']]],
 [607,[[32,'R. IM SS:'],[119,'12345678901'],[369,'Días trabajados:'],[446,'0']]],
 [617,[[32,'RFC:'],[119,'PRUP900101AA1'],[369,'Periodo del:'],[446,'12/oct./2026 al 18/oct./2026']]],
 [576,[[92,'PERCEPCIONES'],[377,'DEDUCCIONES']]],
 [560,[[32,'P001 001 SUELDO'],[265,'1,000.00'],[311,'D001 002 ISR'],[551,'10.00']]],
 [432,[[32,'Total Percepciones'],[265,'1,000.00'],[311,'Total Deducciones'],[551,'10.00']]],
 [422,[[32,'Neto Pagado'],[265,'990.00']]],
 [354,[[35,'Folio Fiscal:'],[88,uuid]]],
 // Resumen fiscal en el orden del flujo de contenido del PDF real: primero las etiquetas y
 // después los importes, de modo que el texto corrido no deja el importe junto a su etiqueta.
 [300,[[293,'Total percepciones:']]],[298,[[539,percepciones]]],
 [235,[[293,'Total deducciones sin ISR:'],[548,'0.00']]],
 ...otros.filter(([,p])=>p.some(([,t])=>/[A-Za-z]/.test(t))),
 [269,[[310,'Otros pagos:']]],
 [218,[[292,'ISR retenido:'],[548,'10.00']]],
 [200,[[293,'Total:'],[539,total]]],
 ...otros.filter(([,p])=>!p.some(([,t])=>/[A-Za-z]/.test(t))),
 [267,[[553,'0.00']]],[235,[[571,'-']]],[218,[[571,'-']]],[200,[[570,'=']]],
 [180,[[32,'Sello Digital del SAT: '+sello]]]
];
const pagina=(filas,n=1)=>{
 const items=filas.flatMap(([y,partes])=>partes.map(([x,str])=>({str,width:str.length*4.5,transform:[9,0,0,9,x,y]})));
 return{pagina:n,texto:items.map(x=>x.str).join(' '),lineas:campos.lineas(items,n)};
};
const leer=o=>campos.leer([pagina(base(o))],lector);

// 1) Columnas: la CURP no absorbe «No. Nómina: 43»; NSS bajo «R. IM SS».
const d=leer();
eq(d.datos.curp,'PRUP900101HHGXXX01','CURP sin la columna vecina');
ok(!d.pruebas.curp?.[0]?.texto?.includes('43'),'la evidencia de la CURP no incluye el número de nómina');
eq(d.datos.nss,'12345678901','NSS bajo R. IMSS fragmentado');
// 2) «Total otros pagos» con su importe 3 pt abajo: se asocia por posición, con evidencia.
eq(d.datos.otros_pagos,0,'otros pagos literal 0.00 por posición');
const ev=d.pruebas.otros_pagos?.[0];
ok(ev&&ev.origen==='POSICION'&&ev.valor==='0.00'&&ev.y_valor===280,'evidencia posicional del importe de otros pagos');
eq(d.datos.neto,990,'neto');
ok(!d.errores.some(e=>/otros pagos/i.test(e)),'sin error de otros pagos: '+d.errores.join(' | '));
ok(!d.errores.some(e=>/contradice/.test(e)),'el resumen fiscal impreso cuadra');

// 3) Sin importe junto a la etiqueta: no se sustituye por cero.
const sinImporte=leer({otros:[[283,[[293,'Total otros pagos:']]]]});
eq(sinImporte.datos.otros_pagos,null,'sin importe literal no se asume cero');ok(sinImporte.errores.some(e=>/importe literal de otros pagos/.test(e)),'error visible');
ok(!sinImporte.pruebas.otros_pagos?.some(p=>p.origen==='POSICION'),'sin evidencia posicional inventada');

// 4) Dos importes posibles a la misma distancia: ambiguo, queda pendiente.
const ambiguo=leer({otros:[[283,[[293,'Total otros pagos:']]],[280,[[548,'0.00']]],[286,[[560,'25.00']]]]});
ok(!ambiguo.pruebas.otros_pagos?.some(p=>p.origen==='POSICION'),'ambigüedad: no se elige un importe');

// 5) Otros pagos distintos de cero: se leen y se comprueba la suma con el neto.
const descuadre=leer({otros:[[283,[[293,'Total otros pagos:']]],[280,[[548,'25.00']]]]});
eq(descuadre.datos.otros_pagos,25);ok(descuadre.errores.some(e=>/no cuadran con el neto/.test(e)),'1,000 + 25 − 10 ≠ 990: error visible');

// 6) Resumen fiscal impreso que contradice el recibo: error visible, no corrección.
const contradice=leer({total:'995.00'});
ok(contradice.errores.some(e=>/total del resumen fiscal impreso \(995\.00\) contradice/.test(e)),'Total: impreso contradice el neto');
const percep=leer({percepciones:'1,100.00'});
ok(percep.errores.some(e=>/percepciones del resumen fiscal impreso/.test(e)),'Total percepciones impreso contradice');

// 7) El número de nómina impreso no se interpreta como periodo.
eq([d.datos.periodo_inicio,d.datos.periodo_fin],['2026-10-12','2026-10-18'],'el periodo sale de las fechas impresas (12/oct./2026)');eq(d.datos.rfc,'PRUP900101AA1');
ok(!('semana' in d.datos)||d.datos.semana!==43,'«No. Nómina: 43» no se convierte en semana 43');
console.log('PASS recibo de columnas con resumen fiscal: '+pruebas+' comprobaciones (CURP/NSS por columna, otros pagos por posición, ambigüedad, contradicciones, nómina ≠ semana)');
