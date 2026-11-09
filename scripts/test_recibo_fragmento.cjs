const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const box=vm.createContext({window:{}});
for(const file of ['44-respaldo-recibos','68-lectura-contextual-recibos'])vm.runInContext(fs.readFileSync('frontend/modulos/'+file+'.js','utf8'),box);
const {PLATINUM_CAMPOS_RECIBO:campos,PLATINUM_RESPALDO_RECIBO:lector}=box.window;
const uuid='AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE',sello='A'.repeat(60);
const renglones=[
 'RFC del emisor: FIC221209AA1','RFC del receptor: PRUP900101AA1','CURP: PRUP900101HHGXXX01',
 'NSS: 12345678901 Referencia bancaria: 10987654321 Cuenta: 123456789012',
 'Del 02/11/2026 al 08/11/2026','Percepciones SUELDO 2,500.00 P001 001 Deducciones',
 'Total percepciones: 2,500.00 Total deducciones: 500.00','Neto pagado: 2,000.00',
 'Folio fiscal: '+uuid,'Sello Digital del SAT: '+sello
];
const pagina=(rs,pagina=1)=>({pagina,texto:rs.join(' '),lineas:campos.lineas(rs.map((str,i)=>({str,width:300,transform:[11,0,0,11,30,750-i*18]})),pagina)});
(async()=>{
 const original=pagina(renglones),d=campos.leer([original],lector);
 assert.equal(d.datos.rfc_emisor,'FIC221209AA1');assert.equal(d.datos.rfc,'PRUP900101AA1');
 assert.equal(d.datos.nss,'12345678901');assert.equal(d.datos.neto,2000);
 assert.equal(d.pruebas.nss[0].pagina,1);assert.equal(d.pruebas.nss[0].y,696);
 assert(!d.pruebas.nss[0].texto.includes('10987654321'));assert.equal(d.errores.length,0);
 const repetido=campos.leer([pagina([...renglones,'RFC del receptor: PRUP900101AA1'])],lector);
 assert.equal(repetido.datos.rfc,'PRUP900101AA1');assert.equal(repetido.errores.length,0);
 const conflicto=campos.leer([pagina([...renglones,'RFC del receptor: OTRO900101AA1'])],lector);
 assert(conflicto.errores.some(e=>e.includes('incompatibles en rfc')));
 const juntos=campos.leer([original,pagina(renglones.map(x=>x.replace('PRUP900101AA1','OTRO900101AA1').replace(uuid,uuid.replace('AAAA','BBAA'))),2)],lector);
 assert.equal(juntos.bloques.length,2);assert.equal(juntos.bloques[1].pagina,2);
 const parcial=campos.leer([pagina(renglones.map(x=>x.replace('PRUP900101AA1','PRUP 900101 AA1')))],lector);
 const p=parcial.pendientes.find(p=>p.campo==='rfc');assert(p?.region);assert.equal(parcial.datos.rfc,null);
 assert.throws(()=>campos.incorporar(parcial,{region:p.region,literal:'OTRO900101AA1'},lector),/literalmente/);
 assert.throws(()=>campos.incorporar(parcial,{region:{...p.region,pagina:2},literal:p.region.valor},lector),/región cambió/);
 if(!fs.existsSync('supabase/functions/gemini-extract/recibo-fragmento.mjs')){
  campos.incorporar(parcial,{region:p.region,literal:p.region.valor},lector);
  assert.equal(parcial.datos.rfc,'PRUP900101AA1');assert.equal(parcial.datos.neto,2000);
  console.log('Recibo contextual: posiciones, campos, conflictos y transcripción literal. La prueba Edge requiere el paquete privado.');
  return;
 }
 const {manejarFragmento}=await import('../supabase/functions/gemini-extract/recibo-fragmento.mjs');
 let llamadas=0,pausado=false,cached=null;
 const entradas=[];
 const api={headers:{'Content-Type':'application/json'},reservar:async()=>cached?{estado:'PROPUESTA',literal:cached}:pausado?{estado:'PAUSADO'}:{estado:'LISTO',lease:'L',clave:'C'},
  guardar:async({literal,temporal})=>{cached=literal;pausado=temporal;},parseJSON:JSON.parse,
  generar:async({user})=>{entradas.push(JSON.parse(user));if(++llamadas===1)throw Error('Gemini 503');return JSON.stringify({literal:p.region.valor});}};
 const payload={obra_id:'obra-ficticia',huella:'a'.repeat(64),region:p.region,original:'NO DEBE SALIR',trabajador:'NO DEBE SALIR'};
 assert.equal((await manejarFragmento(payload,api)).status,503);
 assert.equal((await manejarFragmento(payload,api)).status,503);assert.equal(llamadas,1);
 pausado=false;const ret=await(await manejarFragmento(payload,api)).json();assert(ret.ok);
 assert.equal((await(await manejarFragmento(payload,api)).json()).reutilizada,true);assert.equal(llamadas,2);
 assert.deepEqual(Object.keys(entradas[1]).sort(),['campo','etiqueta','fragmento']);
 assert.equal(entradas[1].fragmento,'RFC del receptor PRUP 900101 AA1');
 campos.incorporar(parcial,{region:p.region,literal:ret.literal},lector);
 assert.equal(parcial.datos.rfc,'PRUP900101AA1');assert.equal(parcial.datos.neto,2000);assert.equal(parcial.datos.nss,'12345678901');
 assert.equal(parcial.pendientes.length,0);
 console.log('Recibo contextual: posiciones, RFC por rol, NSS y referencias, duplicados, conflicto, páginas, Gemini limitado, 503 y caché');
})().catch(e=>{console.error(e);process.exitCode=1;});
