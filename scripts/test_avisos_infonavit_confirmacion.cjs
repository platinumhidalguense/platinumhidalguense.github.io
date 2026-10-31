const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./fuente_frontend.cjs').html();
function fn(n){const i=html.indexOf('function '+n+'(');assert(i>=0,n);const re=/\n(?:async )?function /g;re.lastIndex=i+n.length+12;const m=re.exec(html);return html.slice(i,m?.index||html.length);}
const elementos={},$=id=>elementos[id]||(elementos[id]={value:'',innerHTML:'',textContent:'',disabled:false});
const anterior={numero_credito:'1111111111',modalidad:'CUOTA_FIJA',factor:753.37,cuota_mensual:753.37,monto:174.63,periodicidad:'SEMANAL'};
const despues={...anterior,numero_credito:'2222222222',factor:853.37,cuota_mensual:853.37,monto:197.58};
const d={id:'d',trabajador_id:'w',tipo:'INFONAVIT',activo:true,recurrente:true,...despues,infonavit_avisos_historial:[{desde:'2026-10-19',antes:anterior,despues}]};
const w={id:'w',sd:362,sdi:379.85,periodo_pago:'SEMANAL'};
const c={console,Date,Number,String,Math,Set,Array,parseInt,PERIODOS:{SEMANAL:{dias:7},QUINCENAL:{dias:15}},today:()=> '2026-10-15',FISC:()=>({umi:100.81,seg:15,anio:2026}),redondearCentavos:x=>Math.round((x+Number.EPSILON)*100)/100,periodoPago:w=>w.periodo_pago,
 DESC:[d],$: $,esc:x=>String(x??''),money:x=>Number(x).toFixed(2),puedeEditarTrabajador:()=>true,modal2:s=>c.modal=s,closeModal2:()=>c.cerrado++,cerrado:0,markWrite:()=>c.write++,write:0,OBRA:null,confirm:()=>true,
 document:{querySelectorAll:()=>[{dataset:{index:'0'}}]},sb:{},fetchAllRows:async()=>({data:[]}),infAvisoActualizar:async()=>c.refresh++,refresh:0};
c.semRange=n=>{const a=new Date('2026-03-30T12:00Z');a.setUTCDate(a.getUTCDate()+(Number(n)-1)*7);const b=new Date(a);b.setUTCDate(b.getUTCDate()+6);return[a.toISOString().slice(0,10),b.toISOString().slice(0,10)];};
vm.createContext(c);
vm.runInContext(require('./soporte_motores_nomina.cjs').source(),c);
vm.runInContext(['infonavitCreditoAFecha','rangoRetencion','retFecha','retISO','retSumarDias','montoDescuento','montoDobleDescuento','fechaFinSemanaISO','diasBimestreActual','retencionInfonavitDesdeAviso','retencionDiasExtra','creditoInfonavitActivo'].map(fn).join('\n'),c);
assert.equal(c.infonavitCreditoAFecha(d,'2026-10-18').factor,753.37);assert.equal(c.infonavitCreditoAFecha(d,'2026-10-19').factor,853.37);
assert.equal(c.creditoInfonavitActivo(w,'2026-10-18').numero_credito,'1111111111');assert.equal(c.creditoInfonavitActivo(w,'2026-10-19').numero_credito,'2222222222');
assert.equal(c.montoDescuento(d,{dias:7},'S29',w),174.63);assert.equal(c.montoDescuento(d,{dias:7},'S30',w),197.58);
assert.equal(c.retencionInfonavitDesdeAviso(d,w,1,new Date('2026-10-18T12:00Z')),24.95);assert.equal(c.retencionInfonavitDesdeAviso(d,w,1,new Date('2026-10-19T12:00Z')),28.23);
assert.equal(c.retencionDiasExtra(d,w,'2026-10-18',2),53.18);
const numeroSolo={...d,...anterior,infonavit_avisos_historial:[{desde:'2026-10-19',antes:anterior,despues:{...anterior,numero_credito:'3333333333'}}]};
const sinHistoria={...numeroSolo,infonavit_avisos_historial:[]};
for(const sem of ['S28','S29','S30'])assert.equal(c.montoDobleDescuento(numeroSolo,w,{dias:7},sem),c.montoDobleDescuento(sinHistoria,w,{dias:7},sem),'Número solo conserva DOBLE '+sem);
for(const dias of [2,3,7,14])assert.equal(c.retencionDiasExtra(numeroSolo,w,'2026-10-18',dias),c.retencionDiasExtra(sinHistoria,w,'2026-10-18',dias),'Número solo no divide redondeos '+dias);
const q={...d,periodicidad:'QUINCENAL',monto:423.79,infonavit_avisos_historial:[{desde:'2026-10-16',antes:{...anterior,periodicidad:'QUINCENAL',monto:374.20},despues:{...despues,periodicidad:'QUINCENAL',monto:423.79}}]};
assert.equal(c.montoDescuento(q,{dias:15},'S28',{...w,periodo_pago:'QUINCENAL'}),374.20);assert.equal(c.montoDescuento(q,{dias:15},'S30',{...w,periodo_pago:'QUINCENAL'}),423.79);
// Confirmación: no hay escritura al abrir/revisar/cancelar, sólo tras confirmar y con huella.
const ui=html.split('/* Confirmación de avisos: nunca ejecutar')[1].split('/* FIN CONFIRMACION AVISOS */')[0];
vm.runInContext('INFAVI={actual:{id:"importacion"},busy:false};/* Confirmación de avisos: nunca ejecutar'+ui,c);
const plan={folio:'folio',descuento_id:'d',huella:'hash',trabajador:{nombre:'PRUEBA',no_trab:1,centro:'CENTRO'},antes:anterior,despues};
let calls=[];c.sb.rpc=async(n,args)=>{calls.push({n,args});return {data:n==='infonavit_plan_cambios'?[plan]:{aplicados:1}}};
(async()=>{
 c.infAvisoPreparar();assert(c.modal.includes('Confirmar y actualizar'));assert.equal(calls.length,0);
 await c.infAvisoPlan();assert.equal(calls.length,0,'Fechas obligatorias');
 $('ia-rec').value='2026-10-13';$('ia-desde').value='2026-10-19';await c.infAvisoPlan();assert.equal(calls.at(-1).n,'infonavit_plan_cambios');assert($('ia-plan-out').innerHTML.includes('Antes'));assert.equal($('ia-aplicar').disabled,false);
 await c.infAvisoAplicar();assert.equal(calls.length,1,'Motivo obligatorio');$('ia-motivo').value='Actualización contra aviso oficial';
 c.confirm=()=>false;await c.infAvisoAplicar();assert.equal(calls.length,1,'Cancelar no aplica');c.confirm=()=>true;
 await c.infAvisoAplicar();assert.equal(calls.at(-1).n,'infonavit_confirmar_cambios');assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args.p_seleccion)),[{folio:'folio',descuento_id:'d',huella:'hash'}]);assert.equal(c.write,1);assert.equal(c.refresh,1);assert($('ia-msg').textContent.includes('1 cambio(s) confirmado(s)'));
 c.infAvisoInvalidarPlan();assert.equal($('ia-aplicar').disabled,true);const n=calls.length;await c.infAvisoAplicar();assert.equal(calls.length,n,'Cambio de fechas invalida plan');
 c.puedeEditarTrabajador=()=>false;await c.infAvisoAplicar();assert.equal(calls.length,n);
 console.log('OK: historia semanal/quincenal, crédito antes/después, finiquito, extras cruzando vigencia; revisar, cancelar, motivo, fechas, confirmar y refrescar sin navegador.');
})().catch(e=>{console.error(e);process.exit(1)});
