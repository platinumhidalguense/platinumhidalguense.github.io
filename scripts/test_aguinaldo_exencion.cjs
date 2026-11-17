// Exención de aguinaldo (LISR art. 93 fr. XIV): tope 30 UMA por patrón y año de pago, sin prorrateo ni reinicio por reingreso.
// Consumo: CFDI timbrados (uno por UUID), sin papeles ni pendientes, sin otro año; reservas separadas del consumido;
// igualdad cliente = fórmula de validación del servidor; caso real tipo Salvador con el motor semanal (ISR art. 96 y art. 174).
const fs=require('fs'),vm=require('vm'),acorn=require('acorn'),assert=require('node:assert/strict');
const A=require('../frontend/modulos/72-aguinaldo-nucleo.js');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},ok=(v,m)=>{assert(v,m);n++;};
const r2=x=>Math.round(x*100)/100,PAGO='2026-12-18';
// Réplica exacta (en centavos) de la validación de control_aguinaldo APLICAR: tope=round(30*uma,2); ex=least(bruto,greatest(0,tope-usado)).
const servidor=(bruto,usado,uma)=>{const c=x=>Math.round(x*100),tope=Math.round(30*uma*100),ex=Math.min(c(bruto),Math.max(0,tope-c(usado)));return{exento:ex/100,gravado:(c(bruto)-ex)/100};};
// 1-3. Casos de referencia y frontera.
let x=A.exencion(3000,PAGO,0);eq([x.tope,x.disponible,x.exento,x.gravado],[3519.3,3519.3,3000,0],'$3,000 sin consumo previo: todo exento');
x=A.exencion(3000,PAGO,1000);eq([x.disponible,x.exento,x.gravado],[2519.3,2519.3,480.7],'$3,000 con $1,000 consumidos: disponible $2,519.30, gravado $480.70');
for(const [b,g] of [[2519.29,0],[2519.30,0],[2519.31,0.01]]){x=A.exencion(b,PAGO,1000);eq([x.exento,x.gravado],[Math.min(b,2519.3),g],'bruto '+b+' frente a disponible 2,519.30');}
x=A.exencion(500,PAGO,3600);eq([x.disponible,x.exento,x.gravado],[0,0,500],'consumo previo mayor al tope: disponible cero');
x=A.exencion(100,'2026-01-20',0);eq(x.tope,3394.2,'UMA por fecha efectiva de pago (enero usa la UMA 2025)');
// 4. Sin prorrateo por días, antigüedad, alta o reingreso.
const fila=(tramos,fiscal_anual,extra={})=>A.calcularFila({ejercicio:2026,salario_base:500,dias_pactados:15,corte:'2026-12-31',hoy:'2026-12-31',tramos,avisos:[],
 ausencias:{digitales:[],rangos:[],historicas:[]},fiscal_anual,evidencias:[],fecha_pago:PAGO,metodo_isr:'ART96',calcularIsr96:g=>({metodo:'ART96',isr:r2(g*0.1),isr_ordinario:50,efecto_subsidio:0}),...extra});
const corta=fila([{desde:'2026-12-02',hasta:null}],{exento_usado:0,pendientes:[],fuentes:[]}),larga=fila([{desde:'2026-01-01',hasta:null}],{exento_usado:0,pendientes:[],fuentes:[]});
eq([corta.fiscal.tope,larga.fiscal.tope],[3519.3,3519.3],'el tope no se prorratea por días trabajados');
eq([corta.fiscal.exento,corta.fiscal.gravado],[corta.bruto_a_pagar,0],'bruto pequeño: todo exento aunque sea inferior a 30 UMA');
eq([larga.fiscal.exento,r2(larga.fiscal.exento+larga.fiscal.gravado)],[3519.3,larga.bruto_a_pagar],'bruto mayor al tope: exento = tope');
// 5. Reingresos múltiples: el acumulado anual suma los CFDI de cada finiquito; el derecho sólo usa el ciclo vigente.
const dos={anio:2026,exento_usado:1200,pendientes:[],fuentes:[{id:'D1',uuid:'U1',bruto:500,exento:500},{id:'D2',uuid:'U2',bruto:700,exento:700},{id:'D3',uuid:'U3',bruto:0,exento:0}]};
const rm=fila([{desde:'2026-09-01',hasta:null}],dos),dm=A.desgloseExencion(rm,dos,[]);
eq([rm.fiscal.disponible,dm.referencias.map(r=>r.uuid),dm.consumido],[2319.3,['U1','U2'],1200],'reingresos: dos finiquitos consumen; sin reinicio; CFDI en cero no se lista');
eq(rm.derecho.dias_vinculo,122,'el cálculo laboral parte del ciclo vigente');
// 6. Papel de cálculo / finiquito global pendiente: no consume exención (se reporta como pendiente).
let c=A.conciliar(1900.6,[{id:'P1',operacion:'BAJA:2026-08-03',origen:'FINIQUITO_GLOBAL',estado:'PENDIENTE',importe_bruto:1772.37,exento:null,fecha_pago:'2026-08-09'}],'2026');
eq([c.exento_usado,c.exento_desconocido,c.pendiente.length],[0,false,1],'papel pendiente: no se toma como consumo ni como pago acreditado');
// 7. PDF y XML del mismo UUID: una sola operación.
c=A.conciliar(5000,[{id:'PDF',operacion:'CFDI:U9',origen:'CFDI_DESGLOSADO',estado:'APLICADO',desglosado:true,importe_bruto:900,exento:900,fecha_pago:'2026-05-10'},
 {id:'XML',operacion:'CFDI:U9',origen:'CFDI_DESGLOSADO',estado:'APLICADO',desglosado:true,importe_bruto:900,exento:900,fecha_pago:'2026-05-10'}],'2026');
eq([c.exento_usado,c.acreditado,c.detalle[0].duplicados],[900,900,['XML']],'PDF/XML del mismo UUID cuentan una vez');
// 8. Pago de otro año: no consume la exención del año de pago.
c=A.conciliar(5000,[{id:'A25',operacion:'CFDI:U25',origen:'CFDI_DESGLOSADO',estado:'APLICADO',desglosado:true,importe_bruto:800,exento:800,fecha_pago:'2025-12-15'}],'2026');
eq(c.exento_usado,0,'pago de 2025 no consume la exención de 2026');
// 9. Reservas separadas del consumido, sin comprometer el saldo dos veces.
const res={anio:2026,exento_usado:800,pendientes:[],fuentes:[{id:'D1',uuid:'U1',bruto:500,exento:500}]};
const rr=fila([{desde:'2026-09-01',hasta:null}],res),dr=A.desgloseExencion(rr,res,[{id:'L1',estado:'APLICADO',estado_destino:'ABIERTA',exento:300,fecha_pago:'2026-11-27'},{id:'L0',estado:'RETIRADO',estado_destino:'ABIERTA',exento:999}]);
eq([dr.consumido,dr.reservado,rr.fiscal.disponible],[500,300,2719.3],'reservado aparte; disponible descuenta consumido y reservado una sola vez');
// 10. Igualdad cliente = validación del servidor en una malla de importes.
let casos=0;
for(let b=0.01;b<=6000;b+=137.77)for(const u of [0,1,1000,1772.37,2519.3,3519.29,3519.3,4000]){const cl=A.exencion(b,PAGO,u),sv=servidor(r2(b),u,117.31);
 assert.deepEqual([cl.exento,cl.gravado],[sv.exento,sv.gravado],'b='+b+' u='+u);casos++;}
n+=casos;
// 11. Caso tipo Salvador con el motor semanal real: 31/08–31/12, $376 diarios, CFDI de finiquito con $1,772.37 exentos.
const code=[];
for(const p of JSON.parse(fs.readFileSync('frontend/modulos.json')).modules){const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.init&&!/^(await|import)/.test(s.slice(x.init.start,x.init.end))&&['ISR_M','F_SEM','PERIODOS','ISR_TABLA'].includes(x.id.name)))code.push(s.slice(node.start,node.end));}
const box={window:{},CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66}},DESC:[],DIFS:[],FINTRANS:[],OBRA:{id:'o',fecha_inicio:'2026-03-30'}};
vm.createContext(box);vm.runInContext(code.join('\n'),box);
const N=box.nominaSemanal({id:'w',obra_id:'o',periodo_pago:'SEMANAL',sd:376,sdi:394.5425},{faltas:0});
const fa={anio:2026,exento_usado:1772.37,pendientes:[],fuentes:[{id:'8f2e',uuid:'DD8C9210-B5DD-461E-A937-FCE97E1553CB',bruto:1772.37,exento:1772.37}]};
const sv=A.calcularFila({ejercicio:2026,salario_base:376,dias_pactados:15,corte:'2026-12-31',hoy:'2026-11-17',tramos:[{desde:'2026-08-31',hasta:null}],avisos:[],
 ausencias:{digitales:[],rangos:[],historicas:[]},fiscal_anual:fa,evidencias:[],fecha_pago:PAGO,metodo_isr:'ART96',
 calcularIsr96:g=>A.isrArt96Semanal({bruto_ordinario:N.bruto,dias:7,gravado:g},box.FISC(),box.isrPeriodo)});
const sd=A.desgloseExencion(sv,fa,[]);
eq([sv.derecho.dias_computables,sv.bruto_a_pagar,sd.tope,sd.consumido,sd.disponible,sd.exento,sd.gravado],[123,1900.6,3519.3,1772.37,1746.93,1746.93,153.67],'Salvador: bruto, tope, consumido, disponible, exento y gravado');
eq([sd.isr,sd.isr_tarifa,sd.efecto_subsidio,sd.isr_ordinario,sv.fiscal.neto],[140,16.73,123.27,80.47,1760.6],'Salvador: ISR atribuible = tarifa $16.73 + subsidio que deja de aplicar $123.27; ordinario aparte');
eq(servidor(1900.6,1772.37,117.31),{exento:1746.93,gravado:153.67},'Salvador: validación del servidor idéntica');
const a174=A.isrArt174({gravado:sd.gravado,ingreso_mensual_ordinario:376*30.4},vm.runInContext('ISR_M',box));
eq(a174.isr,16.72,'alternativa art. 174 RLISR: $16.72 (sin afectar el subsidio ordinario)');
const sinConsumo=A.desgloseExencion(A.calcularFila({ejercicio:2026,salario_base:376,dias_pactados:15,corte:'2026-12-31',hoy:'2026-11-17',tramos:[{desde:'2026-08-31',hasta:null}],avisos:[],
 ausencias:{digitales:[],rangos:[],historicas:[]},fiscal_anual:{anio:2026,exento_usado:0,pendientes:[],fuentes:[]},evidencias:[],fecha_pago:PAGO,metodo_isr:'ART96',
 calcularIsr96:g=>A.isrArt96Semanal({bruto_ordinario:N.bruto,dias:7,gravado:g},box.FISC(),box.isrPeriodo)}),{fuentes:[]},[]);
eq([sinConsumo.exento,sinConsumo.gravado,sinConsumo.isr,sinConsumo.cabe_completo],[1900.6,0,0,true],'sin el CFDI: todo exento y ISR atribuible cero');
console.log('PASS exención de aguinaldo: '+n+' comprobaciones ($3,000 con y sin consumo, fronteras, UMA por fecha de pago, sin prorrateo, reingresos, papel pendiente, PDF/XML, otro año, reservas, '+casos+' casos cliente = servidor, caso tipo Salvador con art. 96 y art. 174).');
