const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto'),{parseHTML}=require('linkedom');
const core=require('../frontend/modulos/58-conciliador-core.js'),api=require('../frontend/modulos/78-banco-historico-servicio.js');
const {window,document}=parseHTML('<html><body><div id="modals"></div><div id="modal2"></div></body></html>');
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._valor??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._valor=String(v);}});
let n=0,puede=true,preguntas=[],llamadas=[],archivo=null,decisiones=[],status='PENDIENTE';
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},ok=(a,m)=>{assert(a,m);n++;},tick=async()=>{for(let i=0;i<22;i++)await new Promise(r=>setImmediate(r));};
const ws=[{id:'A',nombre:'PERSONA PRUEBA',cuenta:'1234567890'}],fu={clave:'OBLIGACION:O1',trabajador_id:'A',nombre:'PERSONA PRUEBA',importe:500,concepto:'FINIQUITO',semana:26,desde:'2026-09-21',hasta:'2026-09-27',fecha_baja:'2026-09-21',ciclo_desde:'2026-04-01',periodicidad:'SEMANAL'};
const rpc=async(fn,{p_accion:a,p_datos:j})=>{llamadas.push({a,j});if(a==='CONTEXTO')return{data:{obra_id:j.obra_id,personas:ws,fuentes:[fu],archivos:archivo?[archivo]:[],puede_importar:puede}};
 if(a==='INICIAR'){archivo={id:'F',obra_id:j.obra_id,ruta:'ARCHIVO',nombre:j.nombre,sha256:j.sha256,contexto:j.contexto,revision:1,estado:'SUBIENDO',propuesta:{}};return{data:structuredClone(archivo)};}
 if(a==='ARCHIVADO'){archivo.estado='ARCHIVADO';archivo.revision++;return{data:structuredClone(archivo)};}
 if(a==='PROPUESTA'){archivo.propuesta=structuredClone(j.propuesta);archivo.revision++;return{data:structuredClone(archivo)};}
 if(a==='ABRIR')return{data:structuredClone(archivo)};
 if(a==='PREVISUALIZAR')return{data:{archivo_id:'F',revision:archivo.revision,filas:archivo.propuesta.records.map((r,i)=>({fila:i+1,fuente:fu,opciones:[fu],estado:status==='EXPEDIDO'?'CONFIRMACION_PENDIENTE':'LISTO',saldo_antes:500,accion_cheque:status==='EXPEDIDO'?'CONFIRMAR_CANCELACION':'CANCELAR_AUTOMATICO',huella:'HUELLA',cheque_huella:'CHEQUE_HUELLA',pagos_similares:[],cheques:[{id:'Q',estatus:status,num_cheque:status==='EXPEDIDO'?'123456':'',consecutivo:status==='EXPEDIDO'?'00200':'',importe:500}]}))}};
 if(a==='CONFIRMAR'){decisiones=j.confirmaciones;archivo.revision++;return{data:{resultados:[{fila:1,estado:'CHEQUE_CANCELADO',conciliado:true}]}};}throw Error(a);};
const box={window:null,document,console,Date,Number,String,Array,Object,Map,Set,Promise,Error,Math,JSON,File,Uint8Array,
 USER:{id:'U'},OBRA:{id:'O',empresa_codigo:'PLATINUM'},OBRAS:[{id:'O',nombre:'OBRA FICTICIA',empresa_codigo:'PLATINUM'},{id:'J',nombre:'CENTRO JIRE',empresa_codigo:'JIRE'}],EMPRESAS:{PLATINUM:{corto:'PLATINUM'},JIRE:{corto:'JIRE'}},
 empresaDeObra:o=>o.empresa_codigo,semObra:()=>33,$:id=>document.getElementById(id),esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money:n=>Number(n).toFixed(2),
 modal:html=>{document.getElementById('modals').innerHTML=html;},modal2:html=>{document.getElementById('modal2').innerHTML=html;},closeModal:()=>{document.getElementById('modals').innerHTML='';},closeModal2:()=>{document.getElementById('modal2').innerHTML='';},
 ctrlTabla:(heads,rows)=>'<table><tbody>'+rows.join('')+'</tbody></table>',toast:()=>{},markWrite:()=>{},confirm:t=>{preguntas.push(t);return true;},
 PLATINUM_CONCILIADOR_CORE:core,PLATINUM_BANCO_HISTORICO:api,parsePagoGlobal:()=>[],parsePagoIndividual:()=>[],IA_FN:{extract:'IA'},iaLlamar:async()=>{throw Error('No debe usar IA si la lectura tradicional es correcta');},
 sha256Hex:async b=>crypto.createHash('sha256').update(Buffer.from(b)).digest('hex'),
 sb:{rpc,storage:{from:()=>({upload:async()=>({})})}},
 pdfjsLib:{getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'Beneficiario: PERSONA PRUEBA Banco: BBVA Cuenta destino: 1234567890 Fecha de operación: 01/11/2026 Importe: 500.00 MXN Operación exitosa Folio: REFERENCIA123456'}]})}),destroy:async()=>{}})})}};
box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync('frontend/modulos/79-importacion-bancaria-interfaz.js','utf8'),box);
const q=s=>document.querySelector(s),click=async s=>{q(s).click();await tick();};
(async()=>{
 await box.PLATINUM_IMPORTACION_BANCARIA.abrir({semana:26,concepto:'FINIQUITO'});
 ok(q('[data-bh-empresa]')&&q('[data-bh-obra]'),'empresa y centro visibles');eq(q('[data-bh-semana]').value,'26','contexto histórico conservado');
 const input=q('[data-bh-files]'),file=new File(['%PDF-FICTICIO'],'ORIGINAL.pdf',{type:'application/pdf'});Object.defineProperty(input,'files',{value:[file]});input.dispatchEvent(new window.Event('change',{bubbles:true}));await tick();
 ok(q('[data-bh-lectura]').textContent.includes('PERSONA PRUEBA'),'lectura aparece por operación');
 await click('[data-bh="previa"]');ok(q('[data-bh-lectura]').textContent.includes('Se cancelará automáticamente'),'preaviso de cancelación automática');
 status='EXPEDIDO';await click('[data-bh="previa"]');await click('[data-bh="confirmar"]');
 ok(preguntas.some(t=>t.includes('123456')&&t.includes('00200')&&t.includes('500.00')&&t.includes('EXPEDIDO')),'aviso identifica el físico concreto');
 eq(decisiones[0].cheque_huella,'CHEQUE_HUELLA','confirmación fija la huella del cheque');eq(decisiones[0].decision,'CANCELAR','decisión explícita enviada');
 q('[data-bh-anio]').value='2025';q('[data-bh-anio]').dispatchEvent(new window.Event('change',{bubbles:true}));await tick();ok(q('[data-bh="confirmar"]').disabled,'cambiar contexto invalida confirmación anterior');
 await click('[data-bh="contexto"]');eq(llamadas.filter(x=>x.a==='CONTEXTO').at(-1).j.anio,2025,'año se pasa al servidor');
 await click('[data-bh="cerrar"]');eq(document.getElementById('modals').innerHTML,'','cierre desmonta la interfaz');
 puede=false;await box.PLATINUM_IMPORTACION_BANCARIA.abrir({semana:26});ok(q('[data-bh-files]').disabled,'consulta no carga archivos');ok(q('[data-bh="confirmar"]').disabled,'consulta no confirma pagos');
 console.log('PASS interfaz bancaria histórica: '+n+' comprobaciones de contexto, lectura, preaviso, confirmación y consulta. Sin navegador.');
})().catch(e=>{console.error(e);process.exitCode=1;});
