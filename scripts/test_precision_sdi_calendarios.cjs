const fs=require('fs'),vm=require('vm'),acorn=require('acorn'),assert=require('node:assert/strict');
const names=['PERIODOS','periodoPago','perDe','retFecha','retISO','retSumarDias','rangoRetencion','cuotaFonacotCalendario','montoDescuento','montoDobleDescuento','retencionDiasExtra','retencionEvaluada','sdiInicialSugerido','tabAssist','diasBimestreActual','cuotaPeriodoInfonavit','retencionInfonavitDesdeAviso'];
let src='';for(const f of ['05-alta-edicion','08-retenciones-incidencias','27-fiscal-costos']){const s=fs.readFileSync('frontend/modulos/'+f+'.js','utf8');for(const n of acorn.parse(s,{ecmaVersion:'latest'}).body)
 if(n.type==='FunctionDeclaration'&&names.includes(n.id.name)||n.type==='VariableDeclaration'&&n.declarations.some(d=>names.includes(d.id.name)))src+=s.slice(n.start,n.end)+'\n';}
const el={'f-puesto':{value:'OFICIAL'},'f-sd':{value:''},'f-sdi':{value:''},'f-sal_semanal':{value:''},'h-puesto':{},'worker-form-body':{dataset:{}}};
let start='2026-10-26',end='2026-11-01';const b={Date,$:k=>el[k],CFGEMP:{tabulador:{OFICIAL:362}},WORKERS:[],trabajadorNominaFormulario:()=>({periodo_pago:'SEMANAL'}),sueldoNetoPeriodo:()=>({periodo:'SEMANAL',neto:2400.26,bruto:2534,isr:69.81,imss:63.93}),money:String,esc:String,
 redondearCentavos:n=>Math.round((n+Number.EPSILON)*100)/100,semRange:()=>[start,end],FISC:()=>({seg:15,umi:100.81}),today:()=>start};
vm.createContext(b);vm.runInContext(require('./soporte_motores_nomina.cjs').source(),b);vm.runInContext(src,b);assert.equal(b.sdiInicialSugerido(362),'379.8521');assert.equal(b.sdiInicialSugerido(329),'345.2247');
b.tabAssist();assert.equal(el['f-sdi'].value,'379.8521');
el['worker-form-body'].dataset.workerId='w';el['f-sdi'].value='400.408123';b.WORKERS=[{id:'w',sd:362}];b.tabAssist();assert.equal(el['f-sdi'].value,'400.408123');
const w={periodo_pago:'SEMANAL'},credit={tipo:'FONACOT',fonacot_prorrateo:'DIAS_CALENDARIO',cuota_mensual:1501.92};
assert.equal(b.montoDescuento(credit,b.perDe(w),'S31',w),340.76);
assert.equal(b.retencionEvaluada({...credit,ajustes_semana:{S31:{importe_base:339.14}}},w,'S31',b.perDe(w)).monto,339.14);
assert.equal(b.cuotaFonacotCalendario(3100,'2026-10-01','2026-10-15'),1500);
assert.equal(b.cuotaFonacotCalendario(3100,'2026-10-16','2026-10-31'),1600);
assert.equal(b.cuotaFonacotCalendario(2900,'2028-02-01','2028-02-29'),2900);
assert.equal(b.cuotaFonacotCalendario(3100,'2026-12-28','2027-01-03'),700);
assert.equal(b.retencionDiasExtra({...credit,cuota_mensual:3100},w,'2026-10-30',4),406.67);
assert.equal(b.diasBimestreActual(new Date('2026-10-31T12:00:00')),61);
assert.equal(b.diasBimestreActual(new Date('2026-11-01T12:00:00')),61);
assert.equal(b.diasBimestreActual(new Date('2028-02-29T12:00:00')),60);
const info={tipo:'INFONAVIT',modalidad:'CUOTA_FIJA',factor:1000,monto:231.23};
b.fechaFinSemanaISO=()=>{throw Error('No se debe confundir semana de obra con semana ISO');};
assert.equal(b.montoDobleDescuento(info,w,b.perDe(w),'S31'),462.46);
console.log('PASS precisión SDI, conservación de ficha, semana completa, mes cruzado, excepción aislada, quincena 15/16, bisiesto, año y días extra; sin usar viernes como corte.');
