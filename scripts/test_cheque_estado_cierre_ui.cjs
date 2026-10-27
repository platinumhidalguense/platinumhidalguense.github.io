const fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn'),assert=require('node:assert/strict');
const src=fs.readFileSync('frontend/modulos/19-cheques.js','utf8'),names=['chqCapturaExistente','chqMostrarRespaldo','saveCheque'];
const code=acorn.parse(src,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>src.slice(n.start,n.end)).join('\n');
const aviso={textContent:'',children:[],appendChild(x){this.children.push(x);}},elements={'c-neto-fuente':aviso,'c-save':{textContent:'Guardar'}};
for(const [k,value] of Object.entries({'c-nombre':'PERSONA PRUEBA','c-estatus':'PENDIENTE','c-tipo':'FINIQUITO','f-c-num':'1234','f-c-consec':'007','f-c-importe':'2000','f-c-semana':'S1'}))elements[k]={value};
let messages=[],opened=null,confirmed=false,writes=0,saved=null;
const r={neto:2000,origen:'NOI S1',desde:'2026-01-05',hasta:'2026-01-11',semana:1,advertencias:['PDF pendiente de lectura.'],expedicion:{cierre_id:'c',estado_cierre:'REVISADO',requisitos_cierre_cumplidos:false,pendiente:'Cierre S1 en REVISADO. Solicita autorización.'}};
const existing={id:'q',estatus:'PENDIENTE',obra_id:'o',trabajador_id:'w',semana:'S1',tipo_pago:'FINIQUITO',importe:2000};
const box={window:{PLATINUM_FLOWS:{abrirCierre:id=>{opened=id;}}},OBRA:{id:'o'},WORKERS:[{id:'w'}],CHEQUES:[existing],normSem:x=>String(x).replace(/\D/g,''),Number,
 $:id=>elements[id]||null,money:x=>Number(x).toFixed(2),fullName:()=> 'PERSONA PRUEBA',document:{createElement:()=>({})},confirm:()=>confirmed,toast:m=>messages.push(m),chqResolverNeto:async()=>r,markWrite:()=>{writes++;},chequeDuplicado:()=>null,closeModal(){},loadObraData:async()=>{},console,
 sb:{from:()=>({update:rec=>({eq:async()=>{saved=rec;return{error:null};}})})}};
vm.createContext(box);vm.runInContext(code,box);
(async()=>{box.chqMostrarRespaldo(r);assert(aviso.textContent.includes('Importe verificado'));assert(aviso.children.some(x=>x.textContent.includes('Expedición pendiente')));
 const button=aviso.children.find(x=>x.textContent==='Revisar cierre S1');assert(button);button.onclick();assert.equal(opened,null);confirmed=true;button.onclick();assert.equal(opened,'c');
 aviso.children=[];box.chqMostrarRespaldo(r,true);assert(aviso.children.some(x=>x.textContent.includes('Cheque existente')));assert(!aviso.children.some(x=>x.textContent==='Revisar cierre S1'));
 for(const sem of [1,25,26,27,30,31,53]){existing.semana='S'+sem;elements['f-c-semana'].value='S'+sem;await box.saveCheque('q');assert.equal(saved.estatus,'EXPEDIDO');assert.equal(saved.importe,2000);assert.equal(saved.num_cheque,'1234');assert.equal(saved.consecutivo,'007');}
 assert.equal(writes,7,'Expedición de todas las semanas no depende de la autorización del cierre');
 saved=null;await box.saveCheque(null);assert.equal(saved,null);assert(messages.at(-1).includes('REVISADO'),'No extender excepción a nuevos cheques');
 r.error='Fuentes contradictorias';await box.saveCheque('q');assert.equal(saved,null);delete r.error;
 elements['f-c-consec'].value='';await box.saveCheque('q');assert.equal(saved,null);assert(messages.at(-1).includes('consecutivo'));elements['f-c-consec'].value='007';
 r.neto=1999.99;await box.saveCheque('q');assert.equal(saved,null,'Cambiar importe no aprovecha excepción de captura');r.neto=2000;
 assert(!box.chqCapturaExistente({...existing,eliminado:true},{id:'w'},existing.semana,'FINIQUITO',2000));
 assert(!box.chqCapturaExistente(existing,{id:'otro'},existing.semana,'FINIQUITO',2000));
 assert(!box.chqCapturaExistente(existing,{id:'w'},existing.semana,'CHEQUE',2000));
 console.log('PASS captura de cheques existentes: todas las semanas, cierre separado, importe/identidad/concepto intactos, fuentes y numeración; creación nueva conserva requisitos.');
})().catch(e=>{console.error(e);process.exitCode=1;});
