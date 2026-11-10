// Núcleo de aguinaldo: casos de referencia, filtros, faltas, conciliación y fiscal.
// Datos ficticios. El espejo de ISR semanal se compara contra el motor 52 real.
const fs=require('fs'),vm=require('vm'),acorn=require('acorn'),assert=require('node:assert/strict'),path=require('path');
process.chdir(path.resolve(__dirname,'..'));
const A=require('../frontend/modulos/72-aguinaldo-nucleo.js');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};
const tram=(alta,baja,rei,ev)=>A.tramosServicio({fecha_alta:alta,fecha_baja:baja,fecha_reingreso:rei,estatus:baja&&!rei?'BAJA':'ACTIVO'},ev).tramos;
const base={ejercicio:2026,salario_base:500,dias_pactados:15};

// ---- Cálculo laboral: casos de referencia del requerimiento ----
let d=A.calcularDerecho({...base,corte:'2026-10-27',tramos:tram('2026-03-30')});
eq(d.dias_vinculo,212,'30/03 a 27/10 inclusivo = 212 días');eq(d.bruto,4356.16,'$500 × 15 × 212/365');
d=A.calcularDerecho({...base,corte:'2026-10-27',tramos:tram('2026-03-30'),ausencias:{digitales:[{id:'a',fecha:'2026-05-04',naturaleza:'FALTA_INJUSTIFICADA'},{id:'b',fecha:'2026-06-08',naturaleza:'FALTA_INJUSTIFICADA'}]}});
eq(d.dias_computables,210);eq(d.bruto,4315.07,'dos faltas acreditadas');
eq(A.calcularDerecho({...base,tramos:tram('2020-01-01')}).bruto,7500,'año ordinario completo = 15 días exactos');
eq(A.calcularDerecho({...base,ejercicio:2028,tramos:tram('2020-01-01')}).bruto,7500,'año bisiesto completo = 15 días exactos (366/366)');
eq(A.calcularDerecho({...base,ejercicio:2028,tramos:tram('2020-01-01')}).denominador,366);
eq(A.calcularDerecho({...base,dias_pactados:30,tramos:tram('2020-01-01')}).bruto,15000,'prestación superior pactada');
assert.throws(()=>A.calcularDerecho({...base,dias_pactados:12,tramos:tram('2020-01-01')}),/15/);n++;
eq(A.calcularDerecho({...base,tramos:tram('2026-07-01')}).dias_vinculo,184,'alta parcial 1/jul');
// baja y reingreso: dos tramos, sin hueco inventado
d=A.calcularDerecho({...base,tramos:tram('2026-01-01','2026-06-15','2026-07-01')});
eq(d.tramos.map(t=>t.dias),[166,184]);eq(d.dias_vinculo,350);
// reingreso → baja: la ficha perdió la primera baja; el historial la recupera
let t=A.tramosServicio({fecha_alta:'2026-01-01',fecha_reingreso:'2026-04-01',fecha_baja:'2026-09-30',estatus:'BAJA'});
ok(t.avisos.some(a=>a.codigo==='BAJA_INTERMEDIA_FALTANTE'),'sin historial se avisa');eq(A.recortar(t.tramos,2026).reduce((s,x)=>s+x.dias,0),273);
t=A.tramosServicio({fecha_alta:'2026-01-01',fecha_reingreso:'2026-04-01',fecha_baja:'2026-09-30',estatus:'BAJA'},[{tipo:'BAJA',fecha:'2026-03-01'}]);
eq(A.recortar(t.tramos,2026).map(x=>x.dias),[60,183],'el historial recupera la baja intermedia');ok(!t.avisos.length);
// dos ciclos y baja con día no inclusivo
eq(A.recortar(tram('2026-01-01','2026-01-31'),2026,null,{bajaInclusiva:false})[0].dias,30,'día de baja sin servicio');
// traslado entre centros del mismo patrón: los tramos se unen sin duplicar
eq(A.recortar([...tram('2026-01-01','2026-05-31'),...tram('2026-05-31')],2026).reduce((s,x)=>s+x.dias,0),365,'traslado no duplica');
// cambio de salario: la base es la cuota vigente al pago
eq(A.calcularDerecho({...base,salario_base:550,tramos:tram('2020-01-01')}).bruto,8250);

// ---- Filtros ----
const F={modo:'VINCULO',desde:'2026-03-30',hasta:'2026-10-27',estatus:'ACTIVOS_AL_CORTE',fecha_estatus:'2026-10-27'};
eq(A.seleccionar(tram('2026-10-27'),F).incluido,true,'alta del 27 entra');
eq(A.seleccionar(tram('2026-10-28'),F).incluido,false,'alta del 28 queda fuera');
eq(A.seleccionar(tram('2026-10-29'),F).incluido,false,'alta del 29 queda fuera');
const F28={...F,hasta:'2026-10-28',fecha_estatus:'2026-10-28'};
eq([A.seleccionar(tram('2026-10-28'),F28).incluido,A.seleccionar(tram('2026-10-29'),F28).incluido],[true,false],'mover el límite un día');
eq(A.seleccionar(tram('2025-06-01'),F).incluido,true,'antigüedad anterior a marzo entra por vínculo');
eq(A.seleccionar(tram('2025-06-01'),{...F,modo:'FECHA_ALTA'}).incluido,false,'por fecha de alta sólo altas desde 30/03');
const bajaDespues=tram('2025-06-01','2026-11-05');
eq(A.seleccionar(bajaDespues,F).incluido,true,'activo al corte aunque cause baja después');
eq(A.seleccionar(bajaDespues,{...F,estatus:'ACTIVOS_AL_CORTE',fecha_estatus:'2026-11-10'}).incluido,false,'baja a la fecha elegida');
eq(A.seleccionar(bajaDespues,{...F,estatus:'BAJAS_CON_SALDO',fecha_estatus:'2026-11-10'}).motivo,'BAJA_CON_SALDO');
ok(A.seleccionar(tram('2025-06-01','2026-08-01','2026-12-01'),F).programado,'reingreso futuro programado');
// cambiar el filtro no cambia los días causados
const dA=A.calcularDerecho({...base,corte:'2026-10-27',tramos:tram('2025-06-01')});
A.seleccionar(tram('2025-06-01'),{...F,modo:'FECHA_ALTA'});
eq(A.calcularDerecho({...base,corte:'2026-10-27',tramos:tram('2025-06-01')}).bruto,dA.bruto);eq(dA.dias_vinculo,300);
// persona excluida conserva saldo
eq(A.calcularFila({...base,corte:'2026-10-27',tramos:tram('2025-06-01'),evidencias:[]}).saldo,dA.bruto);

// ---- Faltas ----
const H=(o)=>({id:'h',estado:'VIGENTE',modo:'TOTAL_AL_CORTE',naturaleza:'FALTA_INJUSTIFICADA',rango_desde:'2026-01-01',fecha_corte:'2026-07-31',...o});
const dig=fs=>fs.map((f,i)=>({id:'d'+i,fecha:f,naturaleza:'FALTA_INJUSTIFICADA'}));
const ej={...base,tramos:tram('2025-06-01')};
// 8 acreditadas al corte, 3 ya digitales → complemento 5; una posterior → 9
let r=A.calcularDerecho({...ej,ausencias:{digitales:dig(['2026-02-02','2026-03-03','2026-04-06']),historicas:[H({total_acreditado:8})]}});
eq([r.faltas_afectan,r.ausencias.detalle.find(x=>x.fuente==='HISTORICA').complemento],[8,5]);
r=A.calcularDerecho({...ej,ausencias:{digitales:dig(['2026-02-02','2026-03-03','2026-04-06','2026-09-01']),historicas:[H({total_acreditado:8})]}});
eq(r.faltas_afectan,9,'falta posterior suma');
// se importa al calendario una de las cinco antiguas: el total sigue en 9
r=A.calcularDerecho({...ej,ausencias:{digitales:dig(['2026-02-02','2026-03-03','2026-04-06','2026-05-05','2026-09-01']),historicas:[H({total_acreditado:8})]}});
eq(r.faltas_afectan,9,'importar falta antigua no duplica');
// respaldo 2 vs sistema 3: discrepancia visible y bloqueante
let f=A.calcularFila({...ej,ausencias:{digitales:dig(['2026-02-02','2026-03-03','2026-04-06']),historicas:[H({total_acreditado:2})]},evidencias:[]});
ok(f.observaciones.some(o=>o.codigo==='DISCREPANCIA_FALTAS'&&o.bloquea));eq(f.derecho.ausencias.detalle.filter(x=>x.consumido_por).length,3,'las tres capturas siguen visibles');
// cero verificado vs sin información
const cob={desde:'2026-07-01'};
f=A.calcularFila({...ej,cobertura:cob,evidencias:[]});ok(f.observaciones.some(o=>o.codigo==='SIN_COBERTURA_FALTAS'&&!o.bloquea),'sin información se distingue');
f=A.calcularFila({...ej,cobertura:cob,evidencias:[],ausencias:{historicas:[H({total_acreditado:0,fecha_corte:'2026-06-30'})]}});
ok(!f.observaciones.some(o=>o.codigo==='SIN_COBERTURA_FALTAS'),'cero verificado cubre el rango');eq(f.derecho.faltas_afectan,0);
f=A.calcularFila({...ej,cobertura:cob,evidencias:[],ausencias:{historicas:[H({total_acreditado:0,rango_desde:'2026-03-01',fecha_corte:'2026-06-30'})]}});
ok(f.observaciones.some(o=>o.codigo==='SIN_COBERTURA_FALTAS'),'rango sin cobertura completa');
// agregado que el corte parte: pendiente de desglose
f=A.calcularFila({...ej,corte:'2026-05-15',ausencias:{historicas:[H({total_acreditado:4})]},evidencias:[]});
ok(f.observaciones.some(o=>o.codigo==='AGREGADO_SIN_DESGLOSE'&&o.bloquea));
// semana antigua sin días exactos que cruza el corte
f=A.calcularFila({...ej,corte:'2026-10-27',ausencias:{rangos:[{id:'s',desde:'2026-10-26',hasta:'2026-11-01',cantidad:1,fuente:'DESCUENTO'}]},evidencias:[]});
ok(f.observaciones.some(o=>o.codigo==='RANGO_PARTIDO'));
f=A.calcularFila({...ej,corte:'2026-10-27',ausencias:{rangos:[{id:'s',desde:'2026-10-19',hasta:'2026-10-25',cantidad:2,fuente:'DESCUENTO'}]},evidencias:[]});
eq(f.derecho.faltas_afectan,2,'semana completa dentro del corte sí se consume');
// incapacidad antigua sin naturaleza: bloquea sola; un total verificado de su alcance la sustituye
f=A.calcularFila({...ej,ausencias:{rangos:[{id:'i',desde:'2026-04-06',hasta:'2026-04-12',cantidad:3,naturaleza:'SIN_CLASIFICAR',fuente:'DESCUENTO'}]},evidencias:[]});
ok(f.observaciones.some(o=>o.codigo==='AUSENCIA_SIN_CLASIFICAR'&&o.bloquea),'rango sin naturaleza bloquea');
f=A.calcularFila({...ej,ausencias:{rangos:[{id:'i',desde:'2026-04-06',hasta:'2026-04-12',cantidad:3,naturaleza:'SIN_CLASIFICAR',fuente:'DESCUENTO'},{id:'j',desde:'2026-04-13',hasta:'2026-04-19',cantidad:1,fuente:'DESCUENTO'}],
 historicas:[H({total_acreditado:1,rango_desde:'2026-04-01',fecha_corte:'2026-04-30'})]},evidencias:[]});
ok(!f.observaciones.some(o=>['AUSENCIA_SIN_CLASIFICAR','DISCREPANCIA_FALTAS'].includes(o.codigo)),'el total verificado sustituye la captura sin clasificar');eq(f.derecho.faltas_afectan,1);
// naturalezas
const una=(nat,pol)=>A.calcularDerecho({...ej,politica:pol,ausencias:{digitales:[{id:'x',fecha:'2026-03-03',naturaleza:nat}]}}).faltas_afectan;
eq([una('RIESGO_TRABAJO'),una('MATERNIDAD'),una('PATERNIDAD'),una('VACACIONES')],[0,0,0,0],'computan');
eq(una('ENFERMEDAD_GENERAL'),1,'EG no computa por defecto');eq(una('ENFERMEDAD_GENERAL',{computa:{ENFERMEDAD_GENERAL:true}}),0,'pacto más favorable');
eq(una('FALTA_INJUSTIFICADA',{computa:{FALTA_INJUSTIFICADA:true}}),1,'la falta injustificada no es configurable');
f=A.calcularFila({...ej,ausencias:{digitales:[{id:'x',fecha:'2026-03-03',naturaleza:'SIN_CLASIFICAR'}]},evidencias:[]});
ok(f.observaciones.some(o=>o.codigo==='AUSENCIA_SIN_CLASIFICAR'&&o.bloquea),'sin clasificar bloquea');
eq([A.naturalezaCatalogo(2),A.naturalezaCatalogo(17),A.naturalezaCatalogo(1,'Riesgo de trabajo'),A.naturalezaCatalogo(1,'Enfermedad general'),A.naturalezaCatalogo(1,'Maternidad'),A.naturalezaCatalogo(9),A.naturalezaCatalogo(4),A.naturalezaCatalogo(3)],
 ['FALTA_INJUSTIFICADA','RIESGO_TRABAJO','RIESGO_TRABAJO','ENFERMEDAD_GENERAL','MATERNIDAD','FALTA_INJUSTIFICADA','SIN_CLASIFICAR','SIN_CLASIFICAR']);
// calendario y su descuento enlazado se cuentan una vez
eq(A.calcularDerecho({...ej,ausencias:{digitales:[{id:'c',fecha:'2026-03-03',naturaleza:'FALTA_INJUSTIFICADA'},{id:'d',fecha:'2026-03-03',naturaleza:'FALTA_INJUSTIFICADA',fuente:'DESCUENTO'}]}}).faltas_afectan,1);

// ---- Conciliación ----
let c=A.conciliar(5000,[{id:'x',operacion:'op1',origen:'CFDI_DESGLOSADO',estado:'TIMBRADO',importe_bruto:1000,exento:1000,fecha_pago:'2026-06-01'},
 {id:'y',operacion:'op1',origen:'APLICACION',estado:'PAGADO',importe_bruto:1000,exento:1000,fecha_pago:'2026-06-01'}],'2026');
eq([c.acreditado,c.saldo,c.exento_usado],[1000,4000,1000],'CFDI y pago de la misma operación cuentan una vez');
c=A.conciliar(5000,[{id:'x',origen:'APLICACION',estado:'BORRADOR',importe_bruto:2000,exento:2000,fecha_pago:'2026-12-04'},{id:'z',origen:'APLICACION',estado:'CANCELADO',importe_bruto:900}],'2026');
eq([c.reservado,c.acreditado,c.saldo,c.ignorado.length],[2000,0,3000,1],'reservado, cancelado fuera');
f=A.calcularFila({...ej,evidencias:[{id:'g',origen:'FINIQUITO_GLOBAL',estado:'PAGADO',importe_bruto:4000}]});
ok(f.observaciones.some(o=>o.codigo==='EVIDENCIA_PENDIENTE'&&o.bloquea),'total global sin desglose queda pendiente');

// ---- Fiscal ----
eq(A.exencion(4000,'2026-12-11',0),{uma:117.31,uma_fuente:'INEGI, UMA 2026',tope:3519.3,exento_usado:0,disponible:3519.3,exento:3519.3,gravado:480.7},'$4,000 en diciembre 2026');
eq(A.exencion(3519.30,'2026-12-11',0).gravado,0,'exactamente al tope');eq(A.exencion(2000,'2026-12-11',0).gravado,0,'completamente exento');
eq(A.exencion(4000,'2026-12-11',3519.30).gravado,4000,'exención consumida por pago previo');
eq(A.exencion(4000,'2026-12-11',1000).exento,2519.3,'consumida en parte');
eq(A.exencion(4000,'2026-01-15',0).tope,3394.2,'enero 2026 usa UMA 2025 (vigencia por fecha de pago)');
assert.throws(()=>A.exencion(1,'2027-02-15',0),/UMA/);n++;
const tarifa=[[0.01,844.59,0,1.92],[844.60,7168.51,16.22,6.40],[7168.52,12598.02,420.95,10.88],[12598.03,14644.64,1011.68,16.00],[14644.65,17533.64,1339.14,17.92],[17533.65,35362.83,1856.84,21.36],[35362.84,55736.68,5665.16,23.52],[55736.69,106410.50,10457.09,30.00],[106410.51,141880.66,25659.23,32.00],[141880.67,425641.99,37009.69,34.00],[425642.00,1e12,133488.54,35.00]];
let a174=A.isrArt174({gravado:480.70,ingreso_mensual_ordinario:500*30.4},tarifa);
const men=480.70/365*30.4,isrM=b=>{let t=null;for(const x of tarifa)if(b>=x[0])t=x;return t[2]+(b-t[0])*t[3]/100;};
eq(a174.isr,Math.round(480.70*((isrM(15200+men)-isrM(15200))/men)*100)/100,'art. 174 fracciones I a V');ok(Math.abs(a174.tasa-0.1792)<1e-9,'tasa marginal 17.92%');
eq(A.isrArt174({gravado:0,ingreso_mensual_ordinario:15200},tarifa).isr,0,'gravado cero');

// ---- Paridad del espejo semanal contra el motor 52 real ----
const code=[];
for(const p of JSON.parse(fs.readFileSync('frontend/modulos.json')).modules){
 const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.init&&!/^(await|import)/.test(s.slice(x.init.start,x.init.end))&&['ISR_M','F_SEM','PERIODOS','ISR_TABLA'].includes(x.id.name)))code.push(s.slice(node.start,node.end));
}
const fiscal={anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66};
const box={window:{},CFGEMP:{fiscal},DESC:[],DIFS:[],FINTRANS:[],OBRA:{id:'o',fecha_inicio:'2026-03-30'}};vm.createContext(box);vm.runInContext(code.join('\n'),box);
let casos=0;
for(let sd=278.80;sd<=1400;sd+=23.37)for(const faltas of [0,1,2,3])for(const premios of [0,150]){
 const w={id:'w',obra_id:'o',periodo_pago:'SEMANAL',sd:Math.round(sd*100)/100,sdi:Math.round(sd*1.0493*100)/100};
 const N=box.nominaSemanal(w,{faltas,premios});
 const esp=A.isrArt96Semanal({bruto_ordinario:N.bruto,dias:7,gravado:0},box.FISC(),box.isrPeriodo);
 assert.equal(esp.isr_ordinario,N.isr,`espejo ≠ motor sd=${w.sd} faltas=${faltas}`);assert.equal(esp.subsidio_ordinario,N.subsidio);assert.equal(esp.isr,0);casos++;
}
n+=casos;
const N=box.nominaSemanal({id:'w',obra_id:'o',periodo_pago:'SEMANAL',sd:362,sdi:379.85},{});
const i96=A.isrArt96Semanal({bruto_ordinario:N.bruto,dias:7,gravado:480.70},box.FISC(),box.isrPeriodo);
ok(i96.isr>0&&i96.isr_con_aguinaldo===Math.round((i96.isr_ordinario+i96.isr)*100)/100,'ISR incremental = con − ordinario');
ok(i96.efecto_subsidio>=0,'el subsidio sólo puede disminuir');
// Fila completa con ambos métodos y separación semanal
f=A.calcularFila({...base,corte:'2026-10-27',tramos:tram('2026-03-30'),evidencias:[],fecha_pago:'2026-12-11',metodo_isr:'ART96',
 calcularIsr96:g=>A.isrArt96Semanal({bruto_ordinario:N.bruto,dias:7,gravado:g},box.FISC(),box.isrPeriodo)});
eq([f.estado,f.fiscal.exento,f.fiscal.gravado],['LISTA',3519.3,836.86]);eq(f.fiscal.neto,Math.round((4356.16-f.fiscal.isr)*100)/100);
f=A.calcularFila({...base,corte:'2026-10-27',tramos:tram('2026-03-30'),evidencias:[],fecha_pago:'2026-12-11',metodo_isr:'ART174',ingreso_mensual_ordinario:15200,tarifa_mensual:tarifa});
eq(f.fiscal.isr_detalle.metodo,'ART174');
f=A.calcularFila({...base,corte:'2026-10-27',tramos:tram('2026-03-30'),evidencias:[],fecha_pago:'2026-12-11',metodo_isr:'ART96'});
ok(f.observaciones.some(o=>o.codigo==='FISCAL_INCOMPLETO')&&f.estado==='BLOQUEADA'&&f.bruto_a_pagar===4356.16,'sin contexto fiscal: bruto confirmado, neto pendiente');
f=A.calcularFila({...base,tramos:tram('2026-03-30'),evidencias:[],fecha_pago:'2026-12-31',metodo_isr:'ART174',ingreso_mensual_ordinario:15200,tarifa_mensual:tarifa});
ok(f.observaciones.some(o=>o.codigo==='FUERA_DE_PLAZO'&&!o.bloquea),'después del 20 de diciembre se advierte');
console.log(`PASS aguinaldo núcleo: ${n} comprobaciones (${casos} escenarios del espejo idénticos al motor 52); referencias $4,356.16, $4,315.07, $3,519.30/$480.70; 365/366; filtros, faltas, conciliación, art. 96 y 174.`);
