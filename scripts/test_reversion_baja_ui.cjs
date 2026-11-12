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
let caja,edita=true,respuestaPerdida=false,guardada=null,lecturaBloqueada=null,corta=true;
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
    periodo:{desde:'2026-11-02',hasta:'2026-11-08'},semana_fecha:32,firma:'fuente',corta,inicio_ciclo:fecha,semana_inicio:'2026-11-02',prestaciones_fuente:fuente(p.fecha),descuentos:[],noi:null,papel:p.fecha===fecha?papel:null}};
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
 for(const [accion,resp] of [['sin-servicio','SI'],['con-servicio','NO'],['servicio-pendiente','PENDIENTE']]){
  guardada=null;respuestaPerdida=false;const antes=llamadas.filter(x=>x.a==='CONFIRMAR').length;
  await api.abrir(w.id,{fecha});$('bf-causal').value='RENUNCIA VOLUNTARIA';await click('calcular');
  assert($('bf-panel').textContent.includes('no prestó servicios'));assert(!$('pr-fecha'));
  await click(accion);assert.equal(llamadas.filter(x=>x.a==='CONFIRMAR').length,antes,'no escribe al elegir');
  if(resp==='SI'){
   assert($('bf-panel').textContent.includes('$0.00'));assert(!$('pr-noi'));await click('revisar');assert(!$('bf-destino'),'exige confirmación explícita');
   $('bf-confirma-servicio').checked=true;await click('revisar');assert.equal($('bf-destino').value,'SIN_PAGO');
  }else{assert($('pr-fecha'));await click('revisar');assert($('bf-destino'));}
  await api.confirmar(w.id);const req=llamadas.filter(x=>x.a==='CONFIRMAR').at(-1).p;
  assert.equal(req.servicio_respuesta,resp);if(resp==='SI'){assert.equal(req.calculo.monto_aplicado,0);assert.equal(req.confirmar_sin_servicio,true);}
  await click('cerrar');
 }
 edita=false;await api.abrir(w.id,{fecha});assert(!$('bf-flujo'));edita=true;
 // El folio del movimiento no depende de una restauración genérica.
 const revSrc=fs.readFileSync('frontend/modulos/82-reversion-bajas.js','utf8');
 let permitir=true,fallar=true,peticiones=[],aplicadasRev=[];
 caja.CHEQUES=[];caja.openDetail=()=>{};caja.ctrlTabla=()=>'';
 caja.sb.rpc=async(_,q)=>{peticiones.push(q);if(q.p_accion==='PREVISUALIZAR')return {data:{fecha_baja:fecha,inicio_ciclo:fecha,restaurar:{estatus:'ACTIVO'},errores:[],cheques_retirar:[],obligaciones_retirar:[],firma:'f'}};
  if(fallar)return {error:{message:'La ficha o sus dependencias cambiaron'}};
  return {data:{estado:'BAJA_REVERTIDA',historial_id:9,operacion_id:'r',trabajador:{...w},retirados:[]}};};
 window.PLATINUM_PERSONAL.aplicarFila=x=>aplicadasRev.push(x);vm.runInContext(revSrc,caja);
 await caja.abrirReversionBaja(w.id,9);
 let host=document.querySelector('[data-rb-cuerpo]').parentElement,btn=host.querySelector('[data-rb="confirmar"]');
 assert(!btn.disabled);assert.equal(aplicadasRev.length,0);await host.onclick({target:btn});assert.equal(aplicadasRev.length,0);assert(!btn.disabled);assert(host.textContent.includes('cambiaron'));
 fallar=false;await host.onclick({target:btn});assert.equal(aplicadasRev.length,1);assert.equal(peticiones[1].p.operacion_id,peticiones[2].p.operacion_id,'reintento misma operación');
 console.log('PASS servicio/reversión UI: tres decisiones, cero explícito, sin escritura anticipada, permisos, error y reintento, integración por fila. DOM sintético, sin navegador.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
