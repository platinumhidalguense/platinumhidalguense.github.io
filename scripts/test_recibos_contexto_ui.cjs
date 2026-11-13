const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{parseHTML}=require('linkedom');
const {document,window}=parseHTML('<div id="modals"></div>'),$=id=>document.getElementById(id);let acciones=[],estado,consulta=false,servicio;
const w={id:'o',empresa_codigo:'PLATINUM',nombre:'Centro ficticio'},obras=[w,{id:'j',empresa_codigo:'JIRE',nombre:'JIRE ficticio'}];
window.PLATINUM_RECIBOS_CONTEXTO={crear:dep=>(servicio={ocupado:()=>false,cerrar:()=>acciones.push('cerrar'),estado:()=>estado,
 abrir:async(o,c)=>{acciones.push(['contexto',o,c]);estado={obra_id:o,contexto:{...c,desde:'2026-05-25',hasta:'2026-05-31'},archivos:[],cierres:[],escritura:!consulta};dep.cambio(estado,false);},
 subir:async f=>{acciones.push('subir');estado.archivos=[{id:'f',ruta:'privado',estado:'VALIDO',datos:{nombre:f[0].name,neto:'2000.00'},trabajador:'Persona ficticia'}];dep.cambio(estado,false);},confirmar:async()=>acciones.push('confirmar')})};
window.PLATINUM_ARCHIVO_RECIBOS={leerArchivo:()=>{},abrirPorCierre:()=>acciones.push('fotografia')};window.PLATINUM_IMPORTACION_BANCARIA={abrir:c=>acciones.push(['bancos',c])};
const s={window,document,$,USER:{id:'u'},OBRA:w,OBRAS:obras,EMPRESAS:{},empresaDeObra:o=>o.empresa_codigo,modal:h=>{$('modals').innerHTML=h;},closeModal:()=>{$('modals').innerHTML='';},semObra:()=>9,sha256Hex:()=>{},sb:{rpc:async()=>({})},Date,File:class{},toast:assert.fail,confirm:()=>true,
 esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
vm.createContext(s);vm.runInContext(fs.readFileSync('frontend/modulos/84-recibos-contexto-interfaz.js','utf8'),s);
const host=()=>$('modals').firstElementChild,q=x=>host().querySelector(x),click=async a=>host().onclick({target:q('[data-rl="'+a+'"]')});
(async()=>{
 await window.PLATINUM_ARCHIVO_LIBRE.abrir({semana:9,anio:2026});assert.match(host().textContent,/Sin cierre · archivo independiente/);assert(q('[data-rl-files]'));assert.equal(acciones[0][2].semana,9);
 const f=q('[data-rl-files]');Object.defineProperty(f,'files',{value:[{name:'historico.xml'}]});await host().onchange({target:f});assert.match(host().textContent,/historico.xml/);assert(q('[data-rl="confirmar"]'));await click('confirmar');assert(acciones.includes('confirmar'));
 q('[data-rl-semana]').value=10;await host().onchange({target:q('[data-rl-semana]')});assert(q('[data-rl-files]').disabled);assert.match(q('[data-rl-mensaje]').textContent,/Cambió el contexto/);
 await click('contexto');assert.equal(estado.contexto.semana,10);assert.equal(q('[data-rl-lista]').textContent.includes('historico.xml'),false);
 for(const o of q('[data-rl-per]').querySelectorAll('option'))o.selected=o.value==='QUINCENAL';await host().onchange({target:q('[data-rl-per]')});assert(q('[data-rl-semana-label]').hidden);assert(!q('[data-rl-mes-label]').hidden);
 await click('contexto');assert.equal(estado.contexto.periodicidad,'QUINCENAL');assert.equal(estado.contexto.semana,null);
 await click('bancos');assert.equal(acciones.at(-1)[0],'bancos');assert.equal(acciones.at(-1)[1].periodicidad,'QUINCENAL');
 consulta=true;await window.PLATINUM_ARCHIVO_LIBRE.abrir();assert(q('[data-rl-files]').disabled);await click('cerrar');assert.equal($('modals').childElementCount,0);
 console.log('PASS archivo contexto DOM sintético: 16 comprobaciones, sin navegador');
})().catch(e=>{console.error(e);process.exitCode=1;});
