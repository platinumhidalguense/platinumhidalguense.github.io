const fs=require('fs'),vm=require('vm'),acorn=require('acorn'),assert=require('assert/strict');
const code=[];for(const file of JSON.parse(fs.readFileSync('frontend/modulos.json')).modules){const src=fs.readFileSync(file,'utf8');for(const n of acorn.parse(src,{ecmaVersion:'latest'}).body)if(n.type==='FunctionDeclaration'||n.type==='VariableDeclaration'&&n.declarations.some(d=>['PERIODOS','ISR_M','F_SEM','SEMANA1','normSem'].includes(d.id.name)))code.push(src.slice(n.start,n.end));}
const obras=[{id:'b',nombre:'Centro ficticio semanal',empresa_codigo:'JIRE',fecha_inicio:'2026-07-27'},{id:'q',nombre:'Centro ficticio quincenal',empresa_codigo:'JIRE',fecha_inicio:null},{id:'p',nombre:'Legado PLATINUM',empresa_codigo:'PLATINUM',fecha_inicio:'2026-03-30'}];
const periodos={b:[{periodo_id:'b43',anio:2026,numero_noi:43,semana:12,desde:'2026-10-12',hasta:'2026-10-18',clase:'ORDINARIO',periodicidad:'SEMANAL'},{periodo_id:'b48',anio:2026,numero_noi:48,semana:17,desde:'2026-11-16',hasta:'2026-11-22',clase:'ORDINARIO',periodicidad:'SEMANAL'},{periodo_id:'b49',anio:2026,numero_noi:49,semana:18,desde:'2026-11-23',hasta:'2026-11-29',clase:'ORDINARIO',periodicidad:'SEMANAL'}],q:[{periodo_id:'q23',anio:2026,numero_noi:23,semana:34,desde:'2026-11-16',hasta:'2026-11-30',clase:'ORDINARIO',periodicidad:'QUINCENAL'}],p:[]};
const box={window:{},Date,Intl,OBRAS:obras,OBRA:obras[0],USER:{id:'u'},CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66}},DESC:[],DIFS:[],FINTRANS:[],sb:{rpc:async(n,{p_datos:j})=>({data:{obra_id:j.obra_id,empresa_codigo:obras.find(o=>o.id===j.obra_id).empresa_codigo,periodos:periodos[j.obra_id]}})}};
vm.createContext(box);vm.runInContext(code.join('\n'),box);vm.runInContext(fs.readFileSync('frontend/modulos/98-periodos-noi.js','utf8'),box);
(async()=>{let n=0;const ok=(v,m)=>{assert(v,m);n++;};await box.window.PLATINUM_PERIODOS.cargar('b');await box.window.PLATINUM_PERIODOS.cargar('q');
ok(box.isoWeekDe(obras[0],new Date('2026-11-20T12:00:00-06:00'))===17,'clave antigua se conserva');ok(box.window.PLATINUM_PERIODOS.resolver('b',{semana:17}).numero_noi===48,'numeración NOI separada');
ok(JSON.stringify(box.semRange(12))===JSON.stringify(['2026-10-12','2026-10-18']),'NOI43 enlaza clave12 sin renumerar cheques');
ok(box.isoWeek(new Date('2026-11-23T01:30:00Z'))===17,'domingo México no se adelanta por UTC');ok(box.isoWeek(new Date('2026-11-23T07:00:00Z'))===18,'cambio efectivo a lunes México');
ok(box.calendarioNominaDe({obra_id:'b',periodo_pago:'SEMANAL'},17).hasta==='2026-11-22','adaptador semanal recibe rango exacto');
ok(box.calendarioNominaDe({obra_id:'q',periodo_pago:'QUINCENAL'},34).hasta==='2026-11-30','adaptador quincenal recibe rango propio aunque otro centro esté abierto');
assert.throws(()=>box.calendarioNominaDe({obra_id:'q',periodo_pago:'SEMANAL'},34),/no documentado/);n++;
assert.throws(()=>box.semRange(43),/no documentado/);n++;
box.OBRA=obras[2];ok(JSON.stringify(box.semRange(34))===JSON.stringify(['2026-11-16','2026-11-22']),'PLATINUM conserva calendario vigente');
console.log('PASS calendario NOI → adaptadores de motores:',n,'comprobaciones, motores reales sin reescribir.');
})().catch(e=>{console.error(e);process.exitCode=1;});
