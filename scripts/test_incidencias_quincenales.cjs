// Prueba real de cálculo, captura por quincena, deduplicación y composición ISR.
const fs=require('fs'),vm=require('vm'),acorn=require('acorn'),assert=require('assert/strict');const src=[];
for(const p of JSON.parse(fs.readFileSync('frontend/modulos.json')).modules){const s=fs.readFileSync(p,'utf8');for(const n of acorn.parse(s,{ecmaVersion:'latest'}).body)if(n.type==='FunctionDeclaration'||n.type==='VariableDeclaration'&&n.declarations.some(d=>['PERIODOS','ISR_M','F_SEM'].includes(d.id.name)))src.push(s.slice(n.start,n.end));}
const w={id:'FICTICIA',obra_id:'OBRA',no_trab:1,sd:316,sdi:333.76,sal_semanal:4610.22,periodo_pago:'QUINCENAL'};
const p={codigo:'SINTETICO',dias_fiscales:15.21,divisor_isr:365/12,factor_falta:7/6,criterio_limite_inferior:'NOI_SUPERIOR_ANTERIOR'};
const els={'inc-sem':{value:'31'},'inc-f-0':{value:'1'},'inc-i-0':{value:'0'},'inc-p-0':{value:'0'},'inc-m-0':{value:''},'inc-x-0':{value:''},'inc-save':{disabled:false}};
let inserts=[],avisos=[];const b={CFGEMP:{fiscal:{sm:315.04,uma:117.31,anio:2026},motores_nomina:{QUINCENAL:{por_obra:{OBRA:p}}}},window:{_INC:[w],_INCSEM:31},WORKERS:[w],DESC:[],OBRA:{id:'OBRA'},USER:{email:'persona@example.invalid'},$:id=>els[id],
 puedeEditarTrabajador:()=>true,isoWeek:()=>31,semRange:()=>['2026-10-26','2026-11-01'],money:String,fullName:()=> 'PERSONA FICTICIA',toast:(m,t)=>avisos.push([m,t]),confirm:()=>true,markWrite:()=>{},closeModal:()=>{},loadObraData:async()=>{},sb:{from:()=>({insert:async rows=>{inserts.push(...rows);return {error:null}}})}};
vm.createContext(b);vm.runInContext(src.join('\n'),b);
// Restaurar sólo las superficies externas, nunca las funciones de cálculo.
b.puedeEditarTrabajador=()=>true;b.isoWeek=()=>31;b.semRange=()=>['2026-10-26','2026-11-01'];b.money=String;b.fullName=()=> 'PERSONA FICTICIA';b.toast=(m,t)=>avisos.push([m,t]);b.closeModal=()=>{};b.markWrite=()=>{};b.loadObraData=async()=>{};b.$=id=>els[id];
(async()=>{b.incCalc(0);assert.equal(els['inc-m-0'].value,'359.42');assert(els['inc-x-0'].value.includes('ISR mensual separado'));
 await b.saveIncidencias();assert.equal(inserts.length,1);const d=inserts[0];assert.equal(d.monto,359.42);assert.equal(d.tipo,'FALTA');assert.equal(d.ajustes_semana._periodo_nomina.desde,'2026-10-16');assert.equal(d.ajustes_semana._periodo_nomina.hasta,'2026-10-31');assert.equal(d.ajustes_semana._calculo_incidencia.dias,16);assert.equal(d.ajustes_semana._calculo_incidencia.motor_nomina,'QUINCENAL_V1');
 b.DESC=[{...d,id:'D',activo:true}];assert.equal(b.incAuditarCalculoGuardado(b.DESC[0],w).desactualizado,false);
 await b.saveIncidencias();assert.equal(inserts.length,1);assert(avisos.some(x=>x[0].includes('ya tiene faltas')));
 const fuente={...p,id:'FUENTE',revision:1,desde:'2026-10-16',hasta:'2026-10-31',gravable_acumulado:4806.36,gravable_actual:4437.69,impuesto_local:0,isr_acumulado:75.57,isr_ordinario:75.57,dias_subsidio:30.4};
 const fila=b.isrQAplicarFila({w,fin:false,sueldo:4610.22,prevision:1111.90,incidencias:d.monto,creditos:418.20,otras:0,costo:4250.80,neto:4944.50,items:[]},fuente);
 assert.equal(fila.prevision,1071.88);assert.equal(fila.neto,4944.50);assert.equal(b.redondearCentavos(fila.sueldo-fila.incidencias-fila.creditos),3872.62);
 console.log('PASS incidencia quincenal: una captura por periodo, días naturales, descuento sin doble ISR, auditoría vigente y depósito final exacto.');
})().catch(e=>{console.error(e);process.exitCode=1});
