// Formularios reales en VM, sin navegador ni datos de producción.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('frontend/modulos/36-imss-sin-servicio-st7.js','utf8');
const parte=src.slice(src.indexOf('function ctrlDatosCasoNOI('),src.indexOf('async function ctrlExportAltasCortas('));
const els={},mensajes=[],writes=[];let confirmar=true,error=null;
for(const k of ['ab-w','ab-sem','ab-est','ab-nota','ab-n','ab-dias','ab-ai','ab-bi','ab-an','ab-bn','ab-f','abe-est','abe-net','abe-dias','abe-ai','abe-bi','abe-nota'])els[k]={value:''};
const w={id:'ficticio',no_trab:1,fecha_alta:'2026-10-19',fecha_baja:'2026-10-19'};
const caso={id:'caso',trabajador_id:w.id,estado_servicio:'PENDIENTE',neto_noi:0,dias_pagados_noi:null};
const box={window:{_CTRLALT:[caso]},WORKERS:[w],OBRA:{id:'obra'},CTRL_TABLAS:{altasCortas:'control_altas_bajas_cortas'},Date,Number,String,
 $:k=>els[k],semRange:()=>['2026-10-19','2026-10-25'],toast:m=>mensajes.push(m),confirm:()=>confirmar,markWrite:()=>{},ctrlFaltaScript:e=>e.message,
 ctrlAuditar:async()=>{},loadObraData:async()=>{},openCtrlAltasCortas:()=>{},modal:()=>{},ctrlNav:()=>'',esc:String,fullName:()=>'',fmtD:String,
 sb:{from:tabla=>({insert:obj=>({select:()=>({single:async()=>{writes.push({tabla,obj});return{data:{id:'caso'},error};}})}),update(obj){writes.push({tabla,obj});return {eq(){return this;},then(resolve){return Promise.resolve(resolve({error}));}};}})}};
vm.createContext(box);vm.runInContext(parte,box);
(async()=>{
 assert.equal(box.ctrlDatosCasoNOI('','', 'PENDIENTE').dias,null);
 assert.equal(box.ctrlDatosCasoNOI('0','0','SIN_SERVICIO_CONFIRMADO').dias,0);
 for(const [n,d]of[['0',''],['0','1'],['-1','0'],['abc','0'],['0','8'],['0','-1'],['0','NaN']])assert.throws(()=>box.ctrlDatosCasoNOI(n,d,'SIN_SERVICIO_CONFIRMADO'));
 Object.assign(els['ab-w'],{value:w.id});els['ab-sem'].value='30';els['ab-est'].value='SIN_SERVICIO_CONFIRMADO';els['ab-n'].value='0';
 await box.ctrlGuardarAltaCorta();assert.equal(writes.length,0);assert(mensajes.at(-1).includes('días pagados'));
 els['ab-dias'].value='0';confirmar=false;await box.ctrlGuardarAltaCorta();assert.equal(writes.length,0);
 confirmar=true;await box.ctrlGuardarAltaCorta();assert.equal(writes.length,1);assert.equal(writes[0].obj.dias_pagados_noi,0);assert.equal(writes[0].obj.neto_noi,0);
 els['abe-est'].value='SIN_SERVICIO_CONFIRMADO';els['abe-net'].value='0';await box.ctrlActualizarAltaCorta('caso');assert.equal(writes.length,1);
 els['abe-dias'].value='0';await box.ctrlActualizarAltaCorta('caso');assert.equal(writes.length,2);assert.equal(writes[1].obj.dias_pagados_noi,0);
 assert.equal(writes[1].obj.fecha_alta_idse,null);assert(!('fecha_alta_base' in writes[1].obj));assert(!('fecha_baja_base' in writes[1].obj));
 error={message:'Servidor rechazó la captura'};await box.ctrlActualizarAltaCorta('caso');assert.equal(mensajes.at(-1),error.message);
 assert(src.includes('id="ab-dias"'));assert(src.includes('id="abe-dias"'));
 console.log('PASS formularios sin servicio: vacío distinto de cero, días y neto válidos, alta/edición, confirmación y errores reales; sin fechas ni pagos inventados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
