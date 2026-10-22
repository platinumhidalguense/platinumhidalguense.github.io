const fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn'),assert=require('node:assert/strict');
const src=fs.readFileSync('frontend/modulos/19-cheques.js','utf8'),names=['chqMostrarRespaldo','saveCheque'];
const code=acorn.parse(src,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>src.slice(n.start,n.end)).join('\n');
const aviso={textContent:'',children:[],appendChild(x){this.children.push(x);}},elements={'c-neto-fuente':aviso,'c-save':{textContent:'Guardar'}};
for(const [k,value] of Object.entries({'c-nombre':'PERSONA PRUEBA','c-estatus':'PENDIENTE','c-tipo':'FINIQUITO','f-c-num':'1234','f-c-consec':'007','f-c-importe':'2000','f-c-semana':'S1'}))elements[k]={value};
let messages=[],opened=null,confirmed=false,writes=0;
const r={neto:2000,origen:'NOI S1',desde:'2026-01-05',hasta:'2026-01-11',semana:1,advertencias:['PDF pendiente de lectura.'],expedicion:{cierre_id:'c',estado_cierre:'REVISADO',requisitos_cierre_cumplidos:false,pendiente:'Cierre S1 en REVISADO. Solicita autorización.'}};
const box={window:{PLATINUM_FLOWS:{abrirCierre:id=>{opened=id;}}},OBRA:{id:'o'},WORKERS:[{id:'w'}],CHEQUES:[{id:'q',estatus:'PENDIENTE'}],
 $:id=>elements[id]||null,money:x=>Number(x).toFixed(2),fullName:()=> 'PERSONA PRUEBA',document:{createElement:()=>({})},confirm:()=>confirmed,toast:m=>messages.push(m),chqResolverNeto:async()=>r,markWrite:()=>{writes++;},console};
vm.createContext(box);vm.runInContext(code,box);
(async()=>{box.chqMostrarRespaldo(r);assert(aviso.textContent.includes('Importe verificado'));assert(aviso.children.some(x=>x.textContent.includes('Expedición pendiente')));
 const button=aviso.children.find(x=>x.textContent==='Revisar cierre S1');assert(button);button.onclick();assert.equal(opened,null);confirmed=true;button.onclick();assert.equal(opened,'c');
 await box.saveCheque('q');assert.equal(writes,0);assert(messages.at(-1).includes('REVISADO'));assert.equal(elements['f-c-num'].value,'1234');assert.equal(elements['f-c-consec'].value,'007');
 console.log('PASS 9 contratos de captura: importe y autorización separados, botón al cierre, confirmación y campos preservados sin expedir.');
})().catch(e=>{console.error(e);process.exitCode=1;});
