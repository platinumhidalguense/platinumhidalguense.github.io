const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const b={window:{},Date};vm.createContext(b);for(const f of ['44-respaldo-recibos','68-lectura-contextual-recibos','99-recibos-lectura-hibrida'])vm.runInContext(fs.readFileSync('frontend/modulos/'+f+'.js','utf8'),b);
const h=b.window.PLATINUM_LECTURA_HIBRIDA,r=b.window.PLATINUM_RESPALDO_RECIBO;
let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};
const uuid='AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
function lectura(){return{datos:{recibos:1,cfdi_uuid:uuid,neto:2000,rfc_emisor:'FIC900101AA1',periodo_inicio:'2026-11-16',periodo_fin:'2026-11-22'},pendientes:[{campo:'rfc'}],errores:[],pruebas:{}};}
let l=lectura(),f={id:'p',huella:'a'.repeat(64),formato:'PDF',lectura:l},xml={id:'x',formato:'XML',estado:'VALIDO',huella:'b'.repeat(64),datos:{uuid,neto:'2000.00',emisor:'FIC900101AA1',rfc:'PRUP900101AA1',desde:'2026-11-16',hasta:'2026-11-22'}};
ok(h.respaldarXML(f,[f,xml]).aplicados.includes('rfc'),'XML pareado completa identidad');ok(l.datos.rfc==='PRUP900101AA1'&&l.evidencia_hibrida[0].metodo==='XML_RESPALDO','proveniencia explícita, no texto PDF fingido');
l=lectura();f.lectura=l;ok(h.respaldarXML(f,[xml,{...xml,id:'x2',datos:{...xml.datos,neto:'1999.99'}}]).conflicto,'no elige primer XML contradictorio');ok(l.datos.rfc==null,'conflicto no altera lectura');
l=lectura();l.datos.rfc='PRUX900101ZZ9';ok(h.agregar(l,{rfc:'PRUP900101AA1'},{metodo:'OCR_PROPUESTA'}).conflicto,'no sustituye identificador contradictorio de texto');
l=lectura();h.agregar(l,{rfc:'PRUX900101ZZ9'},{metodo:'OCR_PROPUESTA'});let a=h.aplicarVisual(l,{datos:{rfc:'PRUP900101AA1'}},{region_id:'rg',confirmado:false},r);
ok(!a.conflicto&&l.datos.rfc==='PRUP900101AA1','visión puede corregir propuesta OCR, sin cambiar ficha');ok(l.evidencia_hibrida.at(-1).valores_anteriores.rfc==='PRUX900101ZZ9','conserva propuesta anterior');
l=lectura();l.datos.rfc='PRUX900101ZZ9';a=h.aplicarVisual(l,{datos:{rfc:'PRUP900101AA1'}},{confirmado:false},r);ok(a.conflicto&&l.datos.rfc==='PRUX900101ZZ9','valor textual distinto necesita cotejo');
a=h.aplicarVisual(l,{datos:{rfc:'PRUP900101AA1'}},{confirmado:true,metodo:'TRANSCRIPCION_CONFIRMADA'},r);ok(!a.conflicto&&l.evidencia_hibrida.at(-1).metodo==='TRANSCRIPCION_CONFIRMADA','excepción humana confirmada conserva método');
ok(h.normalizar('nss','00012345678')==='00012345678','conserva ceros');ok(h.normalizar('curp','DATO ILEGIBLE')===null,'no inventa caracteres');ok(h.normalizar('neto','0.00')===0&&h.normalizar('neto','6.0224')===null,'cero explícito, precisión fiscal sin redondeo silencioso');
const source=fs.readFileSync('frontend/modulos/99-recibos-lectura-hibrida.js','utf8');ok(!/\.(?:update|insert|upsert|delete)\s*\(/.test(source),'sin mutaciones financieras desde el lector');
console.log('PASS lectura híbrida:',checks,'comprobaciones. OCR real y Gemini servidor se prueban en paquete privado.');
