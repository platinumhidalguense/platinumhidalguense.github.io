// Simulación de calendario/RPC, sin navegador, red ni trabajadores reales.
const fs=require('fs'),vm=require('vm'),acorn=require('acorn'),assert=require('node:assert/strict');
const source=fs.readFileSync('frontend/modulos/36-imss-sin-servicio-st7.js','utf8'),ast=acorn.parse(source,{ecmaVersion:'latest'});
const code=ast.body.filter(n=>n.type==='FunctionDeclaration'&&['ctrlFechasIMSS','ctrlImporteIMSSPeriodo','ctrlAplicarSemanaIMSS'].includes(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
const days=(n,a)=>Array.from({length:n},(_,i)=>({fecha:'2026-11-'+String(a+i).padStart(2,'0'),pagador:'IMSS'}));
const w={id:'w',obra_id:'o',estatus:'ACTIVO',periodo_pago:'SEMANAL',sal_semanal:2400.26},s1={id:'s1',semana:32,estado:'APLICADO',dias_pagados_empresa:0,dias_sin_salario_patronal:2,detalle_dias:days(2,2)},s2={id:'s2',semana:32,estado:'PENDIENTE',dias_pagados_empresa:0,dias_sin_salario_patronal:5,detalle_dias:days(5,4)};
const c1={id:'c1',obra_id:'o',trabajador_id:'w',certificado_desde:'2026-10-28',certificado_hasta:'2026-11-03',control_casos_imss_semanas:[s1]},c2={id:'c2',obra_id:'o',trabajador_id:'w',certificado_desde:'2026-11-04',certificado_hasta:'2026-11-10',control_casos_imss_semanas:[s2]};
const q={obra_id:'o',trabajador_id:'w',sin_salario:7,desde:'2026-11-02',hasta:'2026-11-08',firma:'FIRMA',trabajador:w,certificados:[{caso_id:'c1'},{caso_id:'c2'}],incidencias_ajenas:[]};let calls=[],confirmed=true,scopeChange=false,discountDays=null,toast='';
const b={window:{_CTRLIMSS:[c1,c2]},WORKERS:[w],OBRA:{id:'o'},CTRL_TABLAS:{cierres:'cierres'},periodoPago:w=>w.periodo_pago,semRange:()=>['2026-11-02','2026-11-08'],descuentoFaltasNOI:(w,a,c,d,n)=>{discountDays=n;return{monto:n===7?2400.26:635.93};},contextoIncidenciaNomina:()=>({}),toast:x=>toast=x,ctrlFaltaScript:e=>e.message,confirm:()=>confirmed,fmtD:x=>x,money:x=>String(x),fullName:()=> 'PERSONA FICTICIA',markWrite(){},loadObraData:async()=>{},openCtrlCasosIMSS:async()=>{},openCtrlSemanaIMSS(){},sb:{from:()=>{const c={select:()=>c,eq:()=>c,in:()=>c,limit:async()=>({data:[]})};return c;},rpc:async(name,args)=>{calls.push({name,args});if(name==='control_previsualizar_incapacidad_periodo'){if(scopeChange)b.OBRA={id:'otra'};return{data:q};}return{};}}};
vm.createContext(b);vm.runInContext(code,b);
(async()=>{
 assert.equal(b.ctrlImporteIMSSPeriodo(c2,32),2400.26);assert.equal(discountDays,7,'Cuenta los dos certificados, no sólo los cinco días del nuevo');
 s2.detalle_dias[0].pagador='PENDIENTE';assert.throws(()=>b.ctrlImporteIMSSPeriodo(c2,32),/pendientes/);s2.detalle_dias[0].pagador='IMSS';
 await b.ctrlAplicarSemanaIMSS('c2','s2');assert.equal(discountDays,7);const saved=calls.find(x=>x.name==='control_aplicar_incapacidad_periodo_confirmado');assert(saved);assert.equal(saved.args.p_monto,2400.26);assert.equal(saved.args.p_firma,'FIRMA');
 calls=[];q.incidencias_ajenas=[{id:'falta'}];await b.ctrlAplicarSemanaIMSS('c2','s2');assert(!calls.some(x=>x.name==='control_aplicar_incapacidad_periodo_confirmado'));assert.match(toast,/ajenas/);q.incidencias_ajenas=[];
 calls=[];confirmed=false;await b.ctrlAplicarSemanaIMSS('c2','s2');assert.equal(calls.length,1,'No aplica sin confirmar');
 calls=[];confirmed=true;scopeChange=true;await b.ctrlAplicarSemanaIMSS('c2','s2');assert.equal(calls.length,1,'No escribe después de cambiar de obra');
 console.log('PASS IMSS consecutivas UI: calendario agregado, días pendientes, vista previa, firma, confirmación, falta ajena y cambio de obra.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
