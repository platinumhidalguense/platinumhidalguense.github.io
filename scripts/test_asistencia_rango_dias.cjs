// Listas de asistencia: las columnas de firma siguen el rango elegido (datos ficticios).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),XLSX=require('xlsx-js-style');
const src=fs.readFileSync('frontend/modulos/22-asistencia-directorio.js','utf8'),excel=fs.readFileSync('frontend/modulos/07-exportacion-corporativa.js','utf8');
const box={XLSX,Date,Math,String,Number,Array,Object,fullName:w=>w.nombres};vm.createContext(box);
vm.runInContext(excel.slice(0,excel.indexOf('function dlPlain')),box);
const piezas=acorn.parse(src,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&['asAncho','asDiasRango','asDias','asSheet'].includes(n.id.name)||n.type==='VariableDeclaration'&&n.declarations[0].id.name==='AS');
vm.runInContext(piezas.map(n=>src.slice(n.start,n.end)).join('\n'),box);
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};
const encabezado=(d1,d2)=>{const ws=box.asSheet([{no_trab:1,nombres:'PERSONA FICTICIA',nss:'00000000000'}],{obra:'O',periodo:'P',d1,d2,h1:'8:00',h2:'17:00',h3:'9:00',h4:'13:00'},false);
 const r=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});return {dias:r[4].slice(3).filter(Boolean),horas:r[6].slice(3),cols:ws['!cols'].length,merges:ws['!merges'].filter(m=>m.s.r===4&&m.s.c>=3).length};};
// Martes 17 a sábado 21 de noviembre de 2026: cinco días, empieza en MARTES.
let h=encabezado('2026-11-17','2026-11-21');
eq(h.dias,['MARTES\n17/NOV','MIÉ.\n18/NOV','JUEVES\n19/NOV','VIERNES\n20/NOV','SÁBADO\n21/NOV'],'columnas sólo de martes a sábado');
eq([h.cols,h.merges],[3+10,5],'diez columnas de firma, sin lunes');
eq(h.horas,['8:00','17:00','8:00','17:00','8:00','17:00','8:00','17:00','9:00','13:00'],'horario de sábado en su columna');
// Semana completa: igual que antes (lunes a sábado, 12 columnas; el domingo nunca tuvo columna).
h=encabezado('2026-11-16','2026-11-22');
eq(h.dias,['LUNES\n16/NOV','MARTES\n17/NOV','MIÉ.\n18/NOV','JUEVES\n19/NOV','VIERNES\n20/NOV','SÁBADO\n21/NOV'],'semana completa sin cambios');
eq([h.cols,h.horas.slice(-2)],[15,['9:00','13:00']],'formato de semana completa intacto');
// Lunes a miércoles: tres días.
h=encabezado('2026-11-16','2026-11-18');eq([h.dias.length,h.cols],[3,9],'rango corto');
// Sólo domingo: ningún día de firma.
eq(box.asDiasRango('2026-11-22','2026-11-22').length,0,'domingo no genera columna');
// Hoja de nuevo ingreso con el mismo rango.
const nb=XLSX.utils.sheet_to_json(box.asSheet([],{obra:'O',periodo:'P',d1:'2026-11-17',d2:'2026-11-21',h1:'8:00',h2:'17:00',h3:'9:00',h4:'13:00'},true),{header:1,defval:''});
eq(nb[4].slice(2).filter(Boolean)[0],'MARTES\n17/NOV','nuevo ingreso con el mismo rango');
console.log(`OK test_asistencia_rango_dias: ${n} comprobaciones`);
