
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A=require('../frontend/modulos/72-aguinaldo-nucleo.js');let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};
const fuente=(monto=500,divisor=7)=>({estado:'DETERMINADO',fuente:'SUELDO_INTERNO',monto,divisor,periodicidad:divisor===7?'SEMANAL':'QUINCENAL'});
const tarifa=[[0.01,1e12,0,10]],base={ejercicio:2026,salario_base:500,dias_pactados:15,corte:'2026-12-31',hoy:'2026-11-26',tramos:[{desde:'2026-01-01',hasta:null}],ausencias:{digitales:[],rangos:[],historicas:[]},fiscal_anual:{exento_usado:0,pendientes:[]},fecha_pago:'2026-12-11',metodo_isr:'ART174',ingreso_mensual_ordinario:15200,tarifa_mensual:tarifa};
const call=(o={},s=fuente(),mode='AMBOS',apps=[])=>A.calcularComponentes({...base,...o},s,mode,apps),r=A.util.r2;
let f=call();eq(f.componentes.REGISTRADO.bruto_causado,7500,'registrado conserva 3500/7');eq(f.componentes.DIFERENCIAL.bruto_causado,1071.43,'500/7*15');eq(f.bruto_causado,8571.43,'no duplica sobre real 4000');eq(f.fiscal.exento,3519.3,'exención compartida');eq(f.fiscal.isr,505.21,'ISR conjunto, redondeado a centavos');
eq(call({},fuente(0)).fiscal.neto,A.calcularFila(base).fiscal.neto,'cero confirmado idéntico al anterior');eq(call({},null).estado,'BLOQUEADA','fuente ausente pendiente');eq(call({},null).componentes.DIFERENCIAL.bruto_a_pagar,null,'ausente no se convierte en cero');
for(const divisor of [7,15,15.21,16]){const q=call({},fuente(500,divisor));eq(q.componentes.DIFERENCIAL.bruto_causado,r(500/divisor*15),'unidad real '+divisor);}
for(const nat of ['FALTA_INJUSTIFICADA','ENFERMEDAD_GENERAL','MATERNIDAD','RIESGO_TRABAJO']){
 const q=call({ausencias:{digitales:[{id:'i1',fecha:'2026-07-03',naturaleza:nat}],rangos:[],historicas:[]}});const d=q.componentes.DIFERENCIAL.derecho;
 eq(d.salario_base,500/7,'no reduce base por '+nat);eq(d.dias_computables,nat==='MATERNIDAD'||nat==='RIESGO_TRABAJO'?365:364,'proporción una vez '+nat);
}
for(const inicio of ['2026-02-10','2024-02-10','2026-11-23']){const q=call({tramos:[{desde:inicio,hasta:null}]});eq(q.componentes.DIFERENCIAL.derecho.dias_computables,q.componentes.REGISTRADO.derecho.dias_computables,'continuidad/reingreso comparten días '+inicio);}
const apps=[{id:'a1',estado:'APLICADO',estado_destino:'PAGADO',componente:'REGISTRADO',bruto:7500,exento:3519.3,gravado:3980.7,isr:398.07,neto:7101.93,fecha_pago:base.fecha_pago,metodo_isr:'ART174'}];
const previo={fiscal_anual:{exento_usado:3519.3,pendientes:[]},evidencias:[{id:'a1',origen:'APLICACION',operacion:'APL:a1',estado:'PAGADO',importe_bruto:7500,exento:3519.3,fecha_pago:base.fecha_pago,aplicado:true}]};
f=call(previo,fuente(),'AMBOS',apps);eq(f.componentes.REGISTRADO.estado,'SIN_SALDO','registrado pagado no se reaplica');eq(f.bruto_a_pagar,1071.43,'sólo complemento');eq(f.fiscal.isr,107.14,'ISR incremental sin duplicar');
const ambos=[...apps,{id:'a2',estado:'APLICADO',componente:'DIFERENCIAL',bruto:1071.43,exento:0,gravado:1071.43,isr:107.14,neto:964.29,fecha_pago:base.fecha_pago,metodo_isr:'ART174'}];
eq(call(previo,fuente(),'AMBOS',ambos).bruto_a_pagar,0,'recarga/conjunto posterior sin duplicar');
const cambia=call(previo,fuente(600),'AMBOS',ambos);eq(cambia.bruto_a_pagar,214.28,'base modificada sólo saldo, no suma versiones');
eq(call({...previo,metodo_isr:'ART96',calcularIsr96:g=>({metodo:'ART96',isr:r(g*.1)})},fuente(),'AMBOS',apps).estado,'BLOQUEADA','método anterior contradictorio requiere revisión');
const difSolo=call({},fuente(),'DIFERENCIAL');eq(difSolo.bruto_a_pagar,1071.43,'diferencial primero');eq(difSolo.fiscal.exento,1071.43,'no excede límite anual');
const onlyD=[{id:'d',componente:'DIFERENCIAL',estado:'APLICADO',bruto:1071.43,exento:1071.43,gravado:0,isr:0,neto:1071.43,fecha_pago:base.fecha_pago,metodo_isr:'ART174'}];
const regDespues=call({fiscal_anual:{exento_usado:1071.43,pendientes:[]}},null,'REGISTRADO',onlyD);eq(regDespues.bruto_a_pagar,7500,'registrado después de diferencial');eq(regDespues.fiscal.exento,2447.87,'exención restante al registrado');
// Real projection adapter: two components → a single payroll obligation/evidence amount.
const box={money:v=>r(v).toFixed(2),esc:v=>String(v??''),fullName:()=> 'Persona ficticia',redondearCentavos:r,calendarioNominaDe:()=>({desde:'2026-12-07',hasta:'2026-12-13'}),periodoPago:()=> 'SEMANAL'};vm.createContext(box);vm.runInContext(fs.readFileSync('frontend/modulos/73-aguinaldo-integracion.js','utf8'),box);
const ls=ambos.map((a,i)=>({...a,obra_id:'o',trabajador_id:'w',periodicidad:'SEMANAL',periodo_desde:'2026-12-07',periodo_hasta:'2026-12-13'})),m={sem:'S37',filas:[{w:{id:'w',obra_id:'o'},neto:3000,items:[]}],neto:3000};
const model=box.aguinaldoAplicarModelo(m,[...ls,ls[0]]);eq(model.neto,11066.22,'nómina + netos sin duplicar ID');eq(model.filas[0].aguinaldo.componentes.DIFERENCIAL.neto,964.29,'identificación del complemento');eq(box.aguinaldoAplicarModelo(model,ls).neto,11066.22,'adaptador idempotente');eq(box.aguinaldoCamposItem(model.filas[0]).aguinaldo_componentes.REGISTRADO.neto,7101.93,'snapshot mantiene componentes');
eq(box.aguinaldoVistaComponentes(model).includes('Aguinaldo diferencial'),true,'vista previa identifica complemento');
eq(box.aguinaldoVistaComponentes(model).includes('964.29'),true,'vista previa usa mismo neto de proyección');

// Hoja AGUINALDO real y serialización XLSX: cada componente una fila, total una sola vez.
box.XLSX=require('xlsx-js-style');box.fmtD=v=>String(v||'');box.OBRAS=[];
const excelSrc=fs.readFileSync('frontend/modulos/07-exportacion-corporativa.js','utf8');vm.runInContext(excelSrc.slice(0,excelSrc.indexOf('function dlPlain')),box);
const ws=box.aguinaldoHojaProyeccion(model,'CONTRATISTA');eq(ws.L3.v,7101.93,'XLSX registrado');eq(ws.L4.v,964.29,'XLSX diferencial');eq(ws.L5.v,8066.22,'total aguinaldo una vez');eq(ws.L5.f,'SUM(L3:L4)','total fórmula');
const wb=box.XLSX.utils.book_new();box.XLSX.utils.book_append_sheet(wb,ws,'AGUINALDO');const re=box.XLSX.read(box.XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});eq(re.Sheets.AGUINALDO.L5.v,8066.22,'valor en archivo serializado');eq(re.Sheets.AGUINALDO.B4.v.includes('Aguinaldo diferencial'),true,'componente identificado en archivo');

console.log('PASS aguinaldo diferencial:',n,'comprobaciones; semanal/quincenal, proporcional, cero/ausente, faltas/incapacidades, continuidad, separado/conjunto, fiscal incremental, proyección y snapshot.');
