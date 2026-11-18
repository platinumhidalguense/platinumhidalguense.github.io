// Núcleo legal de horas extra y descansos laborados (94), datos ficticios.
const assert=require('node:assert/strict'),J=require('../frontend/modulos/94-jornada-extra-core.js');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},ok=(c,m)=>{assert.ok(c,m);n++;},throws=(f,re,m)=>{assert.throws(f,re,m);n++;};
const cap=x=>({jornada:{tipo:'DIURNA'},salario_base:400,sd_registrado:400,...x});
const he=(id,fecha,min,x)=>({id,tipo:'HORAS_EXTRA',fecha,fecha_pago:'2026-11-20',orden:id,captura:cap({minutos:min,...x})});
const uno=(evs)=>J.calcularSemana(evs).eventos;
const por=(r,id)=>r.find(x=>x.id===id);

// 1. $400 / 8 h diurna = $50; 2 h dobles = $200; 93-II: 50 % exento.
let r=uno([he('a','2026-11-17',120)]);
eq([r[0].valor_hora,r[0].importe_dobles,r[0].importe_triples,r[0].bruto,r[0].exento,r[0].gravado,r[0].fraccion],[50,200,0,200,100,100,'93-II'],'caso base');
eq(r[0].sbc_variable,0,'dobles dentro de márgenes no integran SBC (LSS 27-IX)');

// 2. Cruce del umbral semanal (9 h en 2026): 6 h + 5 h → 3 h dobles y 2 h triples en la segunda.
r=uno([he('a','2026-11-16',360),he('b','2026-11-17',300)]);
eq([por(r,'b').minutos_dobles,por(r,'b').minutos_triples,por(r,'b').importe_triples],[180,120,300],'umbral 9 h');
ok(por(r,'b').avisos.some(a=>a.codigo==='TRIPLES'),'aviso de triples');
eq(por(r,'b').sbc_variable,300,'triples integran SBC');
// Orden cronológico, no de captura: capturar después un día anterior redistribuye.
r=uno([he('z','2026-11-17',300),he('y','2026-11-16',360)]);
eq([por(r,'y').minutos_dobles,por(r,'z').minutos_dobles,por(r,'z').minutos_triples],[360,180,120],'redistribución cronológica');

// 3. Transición entre años y reglas por fecha.
eq([J.regla('2026-04-30').id,J.regla('2026-04-30').max_diario,J.regla('2026-05-01').max_diario],['LFT_PREVIA',3,4],'reforma desde 01/05/2026');
eq([2026,2027,2028,2029,2030,2031].map(a=>J.regla(a+'-06-01').umbral),[9,9,10,11,12,12],'umbral 9/9/10/11/12');
eq([2026,2027,2028,2029,2030].map(a=>J.regla(a+'-06-01').ordinaria),[48,46,44,42,40],'jornada 48/46/44/42/40');
eq(J.regla('2029-12-31').umbral,11,'no se anticipa 2030');
const P={parametros:{sm:()=>({general:315.04}),uma:()=>({diaria:117.31})}};
const t=J.calcularSemana([he('a','2027-12-29',360),he('b','2028-01-01',360)],P).eventos;
eq([por(t,'a').minutos_dobles,por(t,'b').minutos_dobles,por(t,'b').minutos_triples],[360,240,120],'2027→2028: umbral de cada fecha (9 y luego 10 h)');
ok(por(t,'b').avisos.some(a=>a.codigo==='JORNADA_SEMANAL'),'2028: 8 h × 6 días rebasa 44 h → aviso');
throws(()=>J.calcularSemana([he('a','2027-03-03',60)]),/salario mínimo validado/,'2027 sin SM validado: bloquea, no inventa');
// Límite diario previo (3 h) vs reforma (4 h) para la exención; el pago no cambia.
r=uno([{...he('a','2026-04-28',240),fecha_pago:'2026-05-01'}]);eq([r[0].minutos_elegibles,r[0].importe_dobles],[180,400],'previo: 3 h elegibles, 4 h pagadas dobles');
r=uno([he('a','2026-11-17',240)]);eq(r[0].minutos_elegibles,240,'reforma: 4 h elegibles');
r=uno([he('a','2026-11-17',900)]);eq([r[0].minutos,r[0].minutos_dobles+r[0].minutos_triples,r[0].minutos_triples],[900,900,360],'infracción: 15 h extra se pagan completas');
ok(['LIMITE_DIARIO','LIMITE_TRIPLES','LIMITE_TOTAL_DIARIO'].every(c=>r[0].avisos.some(a=>a.codigo===c)),'infracciones documentadas');
r=uno(['16','17','18','19','20'].map(d=>he('d'+d,'2026-11-'+d,60)));eq(por(r,'d20').minutos_elegibles,0,'quinto día con extra: fuera de límite');ok(por(r,'d20').avisos.some(a=>a.codigo==='LIMITE_DIAS'),'aviso de días');

// 4. Descansos.
const des=(id,tipo,fecha,x)=>({id,tipo,fecha,fecha_pago:'2026-11-20',orden:id,captura:cap({laboro:true,...x})});
r=uno([des('o','DESCANSO_OBLIGATORIO','2026-11-16')]);
eq([r[0].descanso_adicional,r[0].ordinario_adicional,r[0].bruto,r[0].salario_base+r[0].descanso_adicional],[800,0,800,1200],'festivo laborado: +$800, total del día $1,200');
r=uno([des('o','DESCANSO_OBLIGATORIO','2026-11-16',{ordinario_incluido:false})]);eq(r[0].bruto,1200,'ordinario no incluido: triple completo');
throws(()=>uno([des('o','DESCANSO_OBLIGATORIO','2026-11-16',{laboro:false})]),/no laborado/,'festivo no laborado no genera pago');
throws(()=>uno([des('a','DESCANSO_OBLIGATORIO','2026-11-16'),des('b','DESCANSO_SEMANAL','2026-11-16')]),/dos veces/,'coincidencia sin duplicidad');
eq(J.motivosDescanso('2026-11-16',{descanso_semanal:1}).map(x=>x.tipo),['DESCANSO_SEMANAL','DESCANSO_OBLIGATORIO'],'motivos detectados (sólo informan)');
r=uno([des('d','DESCANSO_SEMANAL','2026-11-22',{prima_dominical:{aplica:true,pct:25}})]);
eq([r[0].prima_dominical,r[0].exento_prima,r[0].descanso_adicional,r[0].bruto],[100,100,800,900],'domingo laborado con prima 25 %');
r=uno([des('d','DESCANSO_SEMANAL','2026-11-22',{salario_base:500,base_referencia:'CONTRATO',prima_dominical:{aplica:true,pct:30}})]);
eq([r[0].prima_dominical,r[0].exento_prima,r[0].descanso_adicional],[150,117.31,1000],'prima superior: exenta hasta 1 UMA, excedente gravado');
throws(()=>uno([des('d','DESCANSO_SEMANAL','2026-11-21',{prima_dominical:{aplica:true,pct:25}})]),/domingo/,'prima sólo en domingo');
throws(()=>uno([des('d','DESCANSO_SEMANAL','2026-11-22',{prima_dominical:{aplica:true}})]),/25%/,'prima sin porcentaje no se ignora');
r=uno([des('d','DESCANSO_SEMANAL','2026-11-22',{minutos:240})]);ok(r[0].avisos.some(a=>a.codigo==='JORNADA_PARCIAL'),'jornada parcial: doble completo');

// 5. Exenciones compartidas (tope 5 UMA = $586.55) y salario mínimo.
r=uno([des('o','DESCANSO_OBLIGATORIO','2026-11-16'),he('a','2026-11-17',240),des('d','DESCANSO_SEMANAL','2026-11-22')]);
eq(r.map(x=>x.exento_extra),[400,186.55,0],'50 % hasta agotar el tope semanal compartido');
ok(por(r,'d').avisos.some(a=>a.codigo==='TOPE_5_UMA'),'aviso de tope');
eq(r.reduce((s,x)=>Math.round((s+x.exento+x.gravado)*100)/100,0),r.reduce((s,x)=>Math.round((s+x.bruto)*100)/100,0),'exento + gravado = bruto');
eq([por(r,'o').exento,por(r,'o').sbc_variable],[400,800],'ISR ≠ SBC: el descanso exento al 50 % integra completo');
r=uno([he('a','2026-11-16',600,{sd_registrado:315.04,salario_base:315.04})]);
eq([r[0].fraccion,r[0].exento_extra,r[0].elegible_exencion,r[0].gravado],['93-I',r[0].elegible_exencion,r[0].elegible_exencion,r[0].importe_triples+r[0].importe_dobles-r[0].elegible_exencion],'salario mínimo: 100 % de lo elegible; triples gravados');
// Congelado (periodo pagado) consume primero y no se redistribuye.
r=J.calcularSemana([{id:'p',tipo:'HORAS_EXTRA',fecha:'2026-11-20',fecha_pago:'2026-11-20',congelado:{minutos:540,minutos_dobles:540,exento_extra:586.55,fraccion:'93-II',bruto:1000,exento:586.55,gravado:413.45}},he('n','2026-11-16',60)]).eventos;
eq([por(r,'n').minutos_triples,por(r,'n').exento_extra,por(r,'p').bruto],[60,0,1000],'lo pagado no se redistribuye ni se vuelve a exentar');

// 6. Capturas fraccionadas = captura única; turno nocturno y medianoche.
const a1=uno([he('a','2026-11-17',60),he('b','2026-11-17',60)]),a2=uno([he('c','2026-11-17',120)]);
eq([a1.reduce((s,x)=>s+x.bruto,0),a1.reduce((s,x)=>s+x.exento,0)],[a2[0].bruto,a2[0].exento],'fraccionar no cambia el resultado');
eq(J.tiempo({intervalos:[{inicio:'22:00',fin:'06:00',descanso_min:30}]}).minutos,450,'cruce de medianoche sin duplicar');
throws(()=>J.tiempo({intervalos:[{inicio:'22:00',fin:'02:00'},{inicio:'01:00',fin:'03:00'}]}),/traslapan/,'intervalos traslapados');
throws(()=>J.tiempo({intervalos:[{inicio:'08:00',fin:'09:00',descanso_min:60}]}),/descanso/,'descanso mayor al intervalo');
r=uno([he('a','2026-11-17',60,{jornada:{tipo:'NOCTURNA'}})]);eq(r[0].valor_hora,57.14,'nocturna 7 h: $57.14/h');
r=uno([he('a','2026-11-17',60,{jornada:{tipo:'MIXTA'}})]);eq([r[0].valor_hora,r[0].importe_dobles],[53.33,106.67],'mixta 7.5 h');
throws(()=>uno([he('a','2026-11-17',60,{jornada:{tipo:'PACTADA',horas:6}})]),/referencia/,'pactada requiere documento');
r=uno([he('a','2026-11-17',60,{jornada:{tipo:'PACTADA',horas:6,base:'DIURNA',referencia:'CONTRATO'}})]);eq(r[0].valor_hora,66.67,'pactada 6 h');
throws(()=>uno([he('a','2026-11-17',60,{salario_base:350})]),/menor/,'nunca la base menor');
throws(()=>uno([he('a','2026-11-17',60,{salario_base:450})]),/documentar/,'base mayor requiere documento');
throws(()=>uno([he('a','2026-11-17',60,{salario_base:400.005})]),/decimales/,'centavos exactos');

// 7. Descansos obligatorios por año (fechas efectivas).
eq(J.descansosObligatorios(2026).map(d=>d.fecha),['2026-01-01','2026-02-02','2026-03-16','2026-05-01','2026-09-16','2026-11-16','2026-12-25'],'2026');
eq(J.descansosObligatorios(2027).map(d=>d.fecha),['2027-01-01','2027-02-01','2027-03-15','2027-05-01','2027-06-06','2027-09-16','2027-11-15','2027-12-25'],'2027 con jornada electoral federal');
ok(J.descansosObligatorios(2030).some(d=>d.fecha==='2030-10-01'),'1 de octubre de 2030');
ok(!J.descansosObligatorios(2029).some(d=>d.fecha==='2029-10-01'),'no cada año');
ok(J.descansosObligatorios(2026,[{fecha:'2026-06-07',motivo:'Elección local'}]).some(d=>d.fecha==='2026-06-07'&&d.fraccion==='IX'),'electoral local configurada');

// 8. Efecto ISR: con y sin, mismo contexto (motor simulado).
const motor=g=>({isr:Math.round((300+g*0.2)*100)/100,subsidio:g>100?0:50});
eq(J.efectoIsr(200,motor),{isr_sin:300,isr_con:340,isr:40,subsidio_sin:50,subsidio_con:0,efecto_subsidio:50},'ISR incremental');
eq(J.agregarPeriodo([]).bruto,0,'sin capturas: cero');
eq(J.calcularSemana([]).eventos,[],'semana vacía');
console.log(`OK test_jornada_extra_core: ${n} comprobaciones`);
