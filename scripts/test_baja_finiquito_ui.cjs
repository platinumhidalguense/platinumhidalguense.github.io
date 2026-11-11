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
function modal(html){$('modals').innerHTML='<div class="overlay">'+html+'</div>';}
function modal2(html){$('modals').insertAdjacentHTML('beforeend','<div class="overlay">'+html+'</div>');}
function cerrar(){
 const a=$('modals').querySelectorAll('.overlay'),ultimo=a[a.length-1];
 if(window.PLATINUM_BAJA.antesCerrar(ultimo))ultimo.remove();
}
const rpc=async(_,{p_accion:a,p})=>{
 llamadas.push({a,p:JSON.parse(JSON.stringify(p))});
 if(a==='CONTEXTO'){
  if(lecturaBloqueada)await lecturaBloqueada;
  return {data:{obra_id:w.obra_id,fecha:p.fecha,inicio_ciclo:w.fecha_reingreso,trabajador:{...w},periodicidad:'SEMANAL',
    periodo:{desde:'2026-11-02',hasta:'2026-11-08'},semana_fecha:32,firma:'fuente',descuentos:[],noi:null,papel:p.fecha===fecha?papel:null}};
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
 const d=$('pr-fecha').value,ajuste=$('pr-noi').value;
 caja._PR_AUDIT={trabajador_id:w.id,obra_id:w.obra_id,periodo:d,monto_modelo:440,monto_aplicado:ajuste===''?440:Number(ajuste),
  entradas:{escenario_separacion:'NO',noi_manual:ajuste===''?null:Number(ajuste),fecha_calculo:d},resultado:{infonavit:0,isr:6.02}};
}
Object.assign(window,{PLATINUM_PERSONAL:{aplicarFila:f=>aplicadas.push(f)},PLATINUM_FALTAS_HIST:{
 resumen:async()=>({d:{ausencias:{discrepancias:[]}},conc:{acreditado:0,reservado:0,pendiente:[]}}),
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
 ppfEntradas:(_w,d)=>({...ppfBase,fecha_baja:d,fecha_pago:d}),ppfModelo:()=>({d001:6.02,neto_con_credito:440,isr_calculado:6.0224,d001_propuesto:6.03}),
 prFormulario:(_w,d)=>'<input readonly id="pr-fecha" type="date" value="'+d+'"><input id="f-pr-dias" value="0">'+
  '<input id="pr-isr-noi" value=""><input id="pr-noi" value=""><div id="pr-out"></div><div id="pr-faltas-hist"></div>'});
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
 assert.equal($('bf-fecha').value,fecha);assert($('ficha-base'));
 $('bf-causal').value='RENUNCIA VOLUNTARIA';
 await click('calcular');
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
 console.log('PASS baja y finiquito UI: cabecera, fecha y papel, borrador, revisión, doble clic, recuperación y respuesta descartada al cambiar de centro.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
