const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const {document,window}=parseHTML('<html><body><div id="modals"><div class="overlay" id="ficha-base"></div></div></body></html>');
const $=id=>document.getElementById(id),fecha='2026-11-04';
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
 get(){return this.valor??this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},
 set(v){this.valor=v;}});
const w={id:'w',obra_id:'p',no_trab:12,estatus:'ACTIVO',sd:300,fecha_alta:'2026-04-01',fecha_reingreso:'2026-10-01',fecha_baja:'2026-08-25'};
const ppfBase={fecha_alta:'2026-10-01',fecha_baja:fecha,fecha_pago:fecha,sd:'300',dias_aguinaldo:'33',dias_vacaciones:'34',
 tabla_vacaciones:'12',dias_pendientes:'0',credito:'0',dias_infonavit:0,numero_credito:'',exento_ag_usado:'0',exento_pv_usado:'0',isr_precision:'',d001:''};
const papel={id:'papel',huella:'huella',revision:2,fecha_baja:fecha,entradas:ppfBase,resultado:{d001:6.02,neto_con_credito:440}};
const llamadas=[],afirmaciones=[],aplicadas=[];
let caja,edita=true,respuestaPerdida=false,guardada=null,lecturaBloqueada=null;
let evidencia={d:{ausencias:{discrepancias:[]}},conc:{acreditado:0,reservado:0,pendiente:[]}};
function fuente(f){const q=evidencia.ciclo?.conc||evidencia.conc;return {firma:'fuente-prestaciones',trabajador_id:w.id,obra_id:w.obra_id,inicio_ciclo:w.fecha_reingreso,desde:w.fecha_reingreso,corte:f,dias_base:33,faltas:0,dias_aguinaldo:33,etiqueta:'Cálculo con faltas registradas disponibles',aguinaldo_acreditado:q.acreditado||0,exento_ag_usado:q.acreditado||0,referencias:[],reservas:q.reservado?[{id:'reserva',importe:q.reservado}]:[],informativos:q.pendiente||[],detalle:[],limitaciones:[]};}
function modal(html,clase){$('modals').innerHTML='<div class="overlay"><div class="modal '+clase+'">'+html+'</div></div>';}
function modal2(html,clase){$('modals').insertAdjacentHTML('beforeend','<div class="overlay"><div class="modal '+clase+'">'+html+'</div></div>');}
function cerrar(){
 const a=$('modals').querySelectorAll('.overlay'),ultimo=a[a.length-1];
 if(window.PLATINUM_BAJA.antesCerrar(ultimo))ultimo.remove();
}
const rpc=async(_,{p_accion:a,p})=>{
 llamadas.push({a,p:JSON.parse(JSON.stringify(p))});
 if(a==='CONTEXTO'){
  if(lecturaBloqueada)await lecturaBloqueada;
  return {data:{obra_id:w.obra_id,fecha:p.fecha,inicio_ciclo:w.fecha_reingreso,trabajador:{...w},periodicidad:'SEMANAL',
    periodo:{desde:'2026-11-02',hasta:'2026-11-08'},semana_fecha:32,firma:'fuente',prestaciones_fuente:fuente(p.fecha),descuentos:[],noi:null,papel:p.fecha===fecha?papel:null}};
 }
 if(a==='ESTADO')return {data:guardada||{estado:'NO_REGISTRADA'}};
 if(a==='VER')return {data:{trabajador:{...w,estatus:'BAJA',fecha_baja:fecha},operacion:guardada}};
 if(a==='CONFIRMAR'){
  guardada={estado:'REGISTRADA',operacion_id:p.operacion_id,fecha:p.fecha,neto:p.calculo.monto_aplicado,papel_id:'papel',
    papel_revision:2,trabajador:{...w,estatus:'BAJA',fecha_baja:p.fecha},destino:p.destino,semana_fecha:32};
  if(respuestaPerdida)return {error:{message:'Respuesta perdida ficticia'}};
  return {data:guardada};
 }
 throw Error(a);
};
function calcular(){
 const d=$('pr-fecha').value,ajuste=$('pr-noi').value,isrRaw=$('pr-isr-noi').value,isr=isrRaw===''?6.02:Number(isrRaw);
 if(!Number.isFinite(isr)||isr<0){caja._PR_AUDIT={invalido:true};return;}
 const monto=Math.round((446.02-isr)*100)/100;
 caja._PR_AUDIT={trabajador_id:w.id,obra_id:w.obra_id,periodo:d,monto_modelo:monto,monto_aplicado:ajuste===''?monto:Number(ajuste),
  entradas:{escenario_separacion:'NO',noi_manual:ajuste===''?null:Number(ajuste),fecha_calculo:d,isr_noi_manual:isrRaw===''?null:isr},resultado:{infonavit:0,isr}};
}
function modelo(e){
 const d001=e.d001===''?6.02:Number(e.d001);
 return {d001,neto_con_credito:Math.round((446.02-d001)*100)/100,isr_calculado:6.0224,isr_precision:6.0224,
  d001_propuesto:6.03,neto_papel:439.99,neto_noi:Math.round((446.02-d001)*100)/100,bruto_noi:446.02};
}
Object.assign(window,{PLATINUM_PERSONAL:{aplicarFila:f=>aplicadas.push(f)},PLATINUM_FALTAS_HIST:{
 resumen:async(_w,_ej,_fecha,inicio)=>{assert.equal(inicio,w.fecha_reingreso);return evidencia;},
 panelFiniquito:()=>{}}});
caja=vm.createContext({window,document,$,WORKERS:[w],OBRA:{id:'p',nombre:'CENTRO FICTICIO'},USER:{id:'u'},sb:{rpc},
 SOLO_CONTRATOS:false,MOTIVOS_BAJA:['RENUNCIA VOLUNTARIA','OTRO'],today:()=> '2026-11-10',_uuid:()=> 'op-fixture',
 esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 fullName:()=> 'PERSONA FICTICIA',razonSocialEmpresa:()=> 'EMPRESA FICTICIA',empresaDeTrabajador:()=> 'PLATINUM',
 iniAntig:x=>x.fecha_reingreso||x.fecha_alta,puedeEditarTrabajador:()=>edita,toast:()=>{},markWrite:()=>{},
 prAntiguedadLegal:()=>({completos:0}),prFechaUTC:x=>new Date(x),prHuellaRevision:()=>'',prMontoLegal:x=>Number(x),
 prMotivoSeparacion:()=> 'OTRO',modal,modal2,closeModal:cerrar,closeModal2:cerrar,
 calcPrestaciones:calcular,faltasAguinaldo:()=>0,confirm:m=>{afirmaciones.push(m);return true;},structuredClone,
 redondearCentavos:v=>Math.round(v*100)/100,money:v=>Number(v).toFixed(2),
 ppfEntradas:(_w,d,a)=>({...ppfBase,fecha_baja:d,fecha_pago:d,d001:a.entradas.isr_noi_manual==null?'':String(a.entradas.isr_noi_manual)}),ppfModelo:modelo,
 prFormulario:(_w,d)=>'<input readonly id="pr-fecha" type="date" value="'+d+'"><input id="f-pr-dias" value="0">'+
  '<input id="pr-isr-noi" value=""><input id="pr-noi" value=""><div id="pr-out"></div><div id="pr-faltas-hist"></div>'});
caja.ctrlTabla=()=>'';vm.runInContext(fs.readFileSync('frontend/modulos/81-prestaciones-fuentes.js','utf8'),caja);
vm.runInContext(fs.readFileSync('frontend/modulos/76-baja-finiquito.js','utf8'),caja);
const api=window.PLATINUM_BAJA;
async function click(accion){
 const host=$('bf-flujo'),b=host.querySelector('[data-bf="'+accion+'"]');
 assert(b,'Acción '+accion);
 return host.onclick({target:b});
}
(async()=>{
 const ficha=fs.readFileSync('frontend/modulos/71-ficha-personal.js','utf8'),secciones=fs.readFileSync('frontend/modulos/04-padron-expedientes.js','utf8');
 assert(ficha.includes('id="ficha-baja"')&&ficha.includes('Ver baja y finiquito'));
 assert(!secciones.includes("onclick=\"openBaja("));
 edita=false;await api.abrir(w.id);assert(!$('bf-flujo'));edita=true;
 await api.abrir(w.id,{papel});
 assert($('bf-flujo').parentElement.classList.contains('baja-finiquito-form'));
 assert.equal($('bf-flujo').querySelector('.m-body').parentElement,$('bf-flujo'));
 assert.equal($('bf-acciones').parentElement,$('bf-flujo'));
 const css=fs.readFileSync('assets/platinum-cinta.css','utf8');
 assert(css.includes('.baja-finiquito-form>#bf-flujo{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;'));
 assert(css.includes('.baja-finiquito-form #bf-flujo>.m-body{min-height:0;overflow-y:auto;'));
 assert(css.includes('.baja-finiquito-form #bf-flujo>.m-head,.baja-finiquito-form #bf-flujo>.m-foot{flex:0 0 auto;position:static}'));
 assert.equal($('bf-fecha').value,fecha);assert($('ficha-base'));
 $('bf-causal').value='RENUNCIA VOLUNTARIA';
 await click('calcular');
 assert($('bf-d001-vista').textContent.includes('6.03'));
 assert($('bf-d001-vista').textContent.includes('+'));
 assert.equal($('bf-d001-aplicar').disabled,false);
 assert.equal($('pr-fecha').value,fecha);assert.equal($('pr-isr-noi').value,'6.02');
 await click('volver');
 assert.equal($('bf-fecha').value,fecha);
 await click('calcular');
 await click('revisar');
 assert($('bf-panel').textContent.includes('Revisión 2'));
 assert($('bf-panel').textContent.includes(fecha));
 assert.equal(llamadas.filter(x=>x.a==='CONFIRMAR').length,0);
 respuestaPerdida=true;
 await Promise.all([api.confirmar(w.id),api.confirmar(w.id)]);
 const writes=llamadas.filter(x=>x.a==='CONFIRMAR');
 assert.equal(writes.length,1);
 assert.equal(writes[0].p.fecha,fecha);
 assert.equal(writes[0].p.entradas_papel.fecha_baja,fecha);
 assert.equal(writes[0].p.calculo.periodo,fecha);
 assert.equal(llamadas.at(-1).a,'ESTADO');
 assert.equal(aplicadas.length,1);
 assert($('bf-panel').textContent.includes('Baja registrada'));
 await click('cerrar');assert($('ficha-base'));assert(!$('bf-flujo'));
 for(const caso of [
  {conc:{acreditado:0,reservado:0,pendiente:[]},discrepancias:[],permite:true},
  {conc:{acreditado:80,reservado:0,pendiente:[]},discrepancias:[],permite:true},
  {conc:{acreditado:0,reservado:80,pendiente:[]},discrepancias:[],permite:false},
  {conc:{acreditado:0,reservado:0,pendiente:[{id:'sin-desglose'}]},discrepancias:[],permite:true},
  {conc:{acreditado:0,reservado:0,pendiente:[]},discrepancias:[{id:'diferencia'}],permite:true}
 ]){
  evidencia={d:{ausencias:{discrepancias:[]}},conc:{acreditado:90,reservado:0,pendiente:[{id:'baja-anterior'}]},
   ciclo:{d:{ausencias:{discrepancias:caso.discrepancias}},conc:caso.conc}};
  await api.abrir(w.id,{fecha});$('bf-causal').value='RENUNCIA VOLUNTARIA';await click('calcular');await click('revisar');
  assert.equal(!!$('bf-destino'),caso.permite,'El bloqueo debe usar las evidencias del ciclo actual');
  if(!caso.permite)assert($('bf-aviso').textContent.includes('reservado'));
  await click('cerrar');
 }
 evidencia={d:{ausencias:{discrepancias:[]}},conc:{acreditado:0,reservado:0,pendiente:[]}};
 await api.abrir(w.id,{fecha});
 $('bf-causal').value='RENUNCIA VOLUNTARIA';
 await click('calcular');
 const antesD001=llamadas.filter(x=>x.a==='CONFIRMAR').length;
 const confirmacionesAntes=afirmaciones.length;
 await click('d001');
 assert.equal($('pr-isr-noi').value,'6.03');
 assert.equal(afirmaciones.length,confirmacionesAntes,'La propuesta se confirma al continuar');
 assert($('bf-d001-vista').textContent.includes('ISR del papel'));
 await click('revisar');
 assert(afirmaciones.at(-1).includes('6.03'));
 assert.equal(llamadas.filter(x=>x.a==='CONFIRMAR').length,antesD001);
 await click('volver');
 assert.equal($('pr-isr-noi').value,'6.03');
 assert.equal($('pr-fecha').value,fecha);
 $('pr-isr-noi').value='-1';$('bf-flujo').oninput();
 assert.equal($('bf-d001-aplicar').disabled,true,'No ofrecer una recomendación obsoleta tras una entrada inválida');
 assert(!$('bf-d001-vista').textContent.includes('D001 recomendado para NOI'));
 await click('cerrar');
 const calculoReal=vm.createContext({});
 vm.runInContext(fs.readFileSync('frontend/modulos/46-papeles-prestaciones.js','utf8'),calculoReal);
 calculoReal.e={...ppfBase,fecha_alta:'2026-08-24',fecha_baja:'2026-09-21',fecha_pago:'2026-09-21',sd:'329',dias_aguinaldo:'28',dias_vacaciones:'29'};
 const real=vm.runInContext('ppfModelo(e)',calculoReal);
 assert.equal(real.d001,6.02);assert.equal(real.d001_propuesto,6.03);assert.equal(real.neto_papel,764.65);
 caja.ppfEntradas=()=>({...calculoReal.e});
 caja.ppfModelo=e=>{calculoReal.e=e;return vm.runInContext('ppfModelo(e)',calculoReal);};
 await api.abrir(w.id,{fecha});
 $('bf-causal').value='RENUNCIA VOLUNTARIA';await click('calcular');
 assert($('bf-d001-vista').textContent.includes(real.isr_calculado.toFixed(8)));
 assert($('bf-d001-vista').textContent.includes('764.65'));
 assert($('bf-d001-vista').textContent.includes('+'));
 assert.equal($('pr-isr-noi').value,'','La recomendación no debe aplicarse por abrir el cálculo');
 await click('d001');assert.equal($('pr-isr-noi').value,'6.03');
 await click('cerrar');
 await api.abrir(w.id);
 $('bf-flujo').oninput();
 await click('cerrar');assert(afirmaciones.at(-1).includes('cambios sin guardar'));
 await api.abrir(w.id);
 $('bf-causal').value='RENUNCIA VOLUNTARIA';
 let liberar;lecturaBloqueada=new Promise(r=>{liberar=r;});
 const anterior=click('calcular');
 caja.OBRA={id:'otro',nombre:'OTRO CENTRO'};
 liberar();await anterior;
 assert(!$('pr-fecha'));
 assert.equal(llamadas.filter(x=>x.a==='CONFIRMAR').length,1);
 console.log('PASS baja y finiquito UI: contenedor flexible y pie accesible, D001 real 6.02 → 6.03 sin autoaplicar, confirmación y borrador, revisión, doble clic, recuperación y respuesta descartada al cambiar de centro.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
