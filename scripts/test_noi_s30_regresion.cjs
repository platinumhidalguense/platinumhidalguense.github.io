// Ficticio y reproducible: no usa datos de trabajadores ni accede a producción.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const names=['redondearCentavos','retFecha','retISO','retSumarDias','cuotaFonacotCalendario'];
const src=['27-fiscal-costos','08-retenciones-incidencias'].map(x=>fs.readFileSync('frontend/modulos/'+x+'.js','utf8')).join('\n');
const code=acorn.parse(src,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>src.slice(n.start,n.end)).join('\n');
const b={Date,Math,Number};vm.createContext(b);vm.runInContext(code,b);
const c=(m,a,z)=>b.cuotaFonacotCalendario(m,a,z),r=v=>Math.round((v+Number.EPSILON)*100)/100;
assert.equal(c(518.61,'2026-10-19','2026-10-25'),117.11);
assert.equal(c(1501.92,'2026-10-19','2026-10-25'),339.14);
assert.equal(c(518.61,'2026-10-05','2026-10-11'),117.11);
assert.equal(c(1501.92,'2026-10-01','2026-10-15'),r(1501.92/31*15));
assert.equal(c(1501.92,'2026-10-16','2026-10-31'),r(1501.92/31*16));
assert.equal(c(518.61,'2026-10-01','2026-10-31'),518.61);
assert.equal(c(518.61,'2026-10-26','2026-11-01'),r(518.61/31*6+518.61/30));
assert.equal(c(518.61,'2028-02-28','2028-03-01'),r(518.61/29*2+518.61/31));
assert.equal(c(518.61,'2026-10-18','2026-10-12'),0);
assert.equal(c(0,'2026-10-01','2026-10-31'),0);
// Todas las fechas de 2026, periodos 1..16: no depende del día de arranque
// para distribuir residuos ajenos. Se compara con suma diaria sin redondeos.
for(let month=0;month<12;month++)for(let day=1;day<=28;day++)for(let days=1;days<=16;days++){
 const a=new Date(Date.UTC(2026,month,day,12)),z=new Date(+a+(days-1)*86400000),fmt=d=>d.toISOString().slice(0,10);
 let expected=0;for(let i=0;i<days;i++){const d=new Date(+a+i*86400000);expected+=518.61/new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();}
 assert.equal(c(518.61,fmt(a),fmt(z)),r(expected));
}
console.log('PASS S30 FONACOT: 5,386 prorrateos independientes, octubre 31 días, cruces de mes y año bisiesto; redondeo al final.');
