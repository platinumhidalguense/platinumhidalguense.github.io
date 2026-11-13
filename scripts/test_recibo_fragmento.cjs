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
 // Formato de columnas de Aspel, completamente ficticio: la CURP no incluye la columna vecina.
 const columnas=campos.leer([pagina(['EMPRESA FICTICIA','FIC221209AA1',...renglones.slice(1).map(x=>x.startsWith('CURP:')?x+' Días trabajados: 0':x),'RFC del proveedor PAC: OTR010101AA1'])],lector);
 assert.equal(columnas.datos.rfc_emisor,'FIC221209AA1');assert.equal(columnas.datos.curp,'PRUP900101HHGXXX01');assert.equal(columnas.pendientes.length,0);
 const imss=campos.leer([pagina(renglones.map(x=>x.startsWith('NSS:')?'Registro IM SS: 12345678901 Salario diario: 362':x))],lector);
 assert.equal(imss.datos.nss,'12345678901');assert.equal(imss.pendientes.length,0);
 const fisica=campos.leer([pagina(renglones.map(x=>x.replace('FIC221209AA1','MOPA800101AA1')))],lector);
 assert.equal(fisica.datos.rfc_emisor,'MOPA800101AA1');assert.equal(fisica.datos.rfc,'PRUP900101AA1');
 const opcionales=campos.leer([pagina(renglones.filter(x=>!x.startsWith('NSS:')&&!x.startsWith('CURP:')))],lector);
 assert.equal(opcionales.datos.curp,null);assert.equal(opcionales.datos.nss,null);assert.equal(opcionales.pendientes.length,0);
 const invisible=campos.leer([pagina(renglones.map(x=>x.replace('PRUP900101AA1','PRUP\u200b900101AA1')))],lector);
 assert.equal(invisible.datos.rfc,'PRUP900101AA1');assert.equal(invisible.pruebas.rfc[0].texto_original.includes('\u200b'),true);
 const malo=campos.leer([pagina(renglones.map(x=>x.replace('PRUP900101HHGXXX01','PRUP???')))],lector);
 assert(malo.pendientes.some(x=>x.campo==='curp'),'Un valor realmente ilegible conserva revisión');
 const juntos=campos.leer([original,pagina(renglones.map(x=>x.replace('PRUP900101AA1','OTRO900101AA1').replace(uuid,uuid.replace('AAAA','BBAA'))),2)],lector);
 assert.equal(juntos.bloques.length,2);assert.equal(juntos.bloques[1].pagina,2);
 const compacto=campos.leer([pagina(renglones.map(x=>x.replace('PRUP900101AA1','PRUP 900101 AA1')))],lector);
 assert.equal(compacto.datos.rfc,'PRUP900101AA1');assert.equal(compacto.pendientes.length,0);
 const previa=compacto.pruebas.rfc[0];campos.incorporar(compacto,{region:previa,literal:previa.valor},lector);
 assert.equal(compacto.datos.rfc,'PRUP900101AA1','Una transcripción ya resuelta se revalida sin romper la reanudación');
 assert.throws(()=>campos.incorporar(compacto,{region:{...previa,pagina:4},literal:previa.valor},lector),/región cambió/);
 const parcial=campos.leer([pagina(renglones.flatMap(x=>x.startsWith('RFC del receptor')?['RFC del receptor:','PRUP 900101 AA1']:x))],lector);
 assert.equal(parcial.pendientes.find(p=>p.campo==='rfc').region,null);
 const recuperada=campos.regiones(parcial,'rfc').find(r=>r.valor==='PRUP 900101 AA1');assert(recuperada);
 assert.throws(()=>campos.recuperar(parcial,'rfc',{...recuperada,pagina:3}),/no pertenece/);
 campos.recuperar(parcial,'rfc',recuperada);
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
 assert.equal(entradas[1].fragmento,'RFC PRUP 900101 AA1');
 campos.incorporar(parcial,{region:p.region,literal:ret.literal},lector);
 assert.equal(parcial.datos.rfc,'PRUP900101AA1');assert.equal(parcial.datos.neto,2000);assert.equal(parcial.datos.nss,'12345678901');
 assert.equal(parcial.pendientes.length,0);
 console.log('Recibo contextual: posiciones, RFC por rol, NSS y referencias, duplicados, conflicto, páginas, Gemini limitado, 503 y caché');
})().catch(e=>{console.error(e);process.exitCode=1;});
