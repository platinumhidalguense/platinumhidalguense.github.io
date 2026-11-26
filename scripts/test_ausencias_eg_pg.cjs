// prestaciones_ausencias v2 (finiquito): total_acreditado numérico ("5.00"), incapacidades por enfermedad general
// históricas que no computan para el aguinaldo, total de faltas que sustituye descuentos semanales traslapados y total
// con corte posterior a la fecha de cálculo. PostgreSQL local (PGlite), datos ficticios. La migración es privada:
// sin ella la prueba se omite (alcance público).
const fs=require('node:fs'),assert=require('node:assert/strict');
const archivo=fs.existsSync('supabase/migrations')&&fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_finiquito_incapacidad_eg_historica.sql'));
if(!archivo){console.log('ALCANCE PÚBLICO AUSENCIAS EG: el contrato SQL privado se prueba localmente.');process.exit(0);}
let PGlite;try{({PGlite}=require('@electric-sql/pglite'));}catch{({PGlite}=require('../work/integracion_global_20261016/runtime/node_modules/@electric-sql/pglite'));}
let n=0;const eq=(a,b,m)=>{assert.deepStrictEqual(a,b,m);n++;};
const H=(id,naturaleza,desde,corte,total,extra={})=>({id,estado:'VIGENTE',modo:'TOTAL_AL_CORTE',naturaleza,rango_desde:desde,fecha_corte:corte,total_acreditado:total,...extra});
const D=(id,semana,desde,hasta,motivo,calculo=null,tipo='FALTA')=>({id,tipo,motivo,semana,calculo,periodo:{desde,hasta}});
// Caso #280 con identidad ficticia: ciclo 27/07–23/11 (119 días base).
const base={calendario:[],faltas_semana:[
 D('inc-s27',27,'2026-09-28','2026-10-04','7 DÍA(S) SIN SALARIO PATRONAL POR INCAPACIDAD IMSS · CASO x',null,'INCIDENCIA'),
 D('s29',29,'2026-10-12','2026-10-18','7 FALTAS · NETO NOI −$2400.26'),
 D('s31',31,'2026-10-26','2026-11-01','2 FALTAS · 26 OCT Y 01 NOV',{faltas:2,fechas_faltas:['2026-10-26','2026-11-01']})],
 historicas:[H('h-falta','FALTA_INJUSTIFICADA','2026-10-14','2026-10-18','5.00'),H('h-eg','ENFERMEDAD_GENERAL','2026-07-27','2026-11-26',27.00)]};
(async()=>{
 const db=new PGlite();
 await db.exec('create schema platinum_internal;');
 await db.exec(fs.readFileSync('supabase/migrations/'+archivo,'utf8'));
 const calc=async(x,desde='2026-07-27',corte='2026-11-23')=>(await db.query('select platinum_internal.prestaciones_ausencias($1::jsonb,$2::date,$3::date) r',[JSON.stringify(x),desde,corte])).rows[0].r;
 const falla=async(x,re,m)=>{await assert.rejects(()=>calc(x),re,m);n++;};
 const resumen=r=>[r.faltas,r.faltas_tipo2,r.incapacidades_eg,r.dias_aguinaldo];
 // 1) Caso real: "5.00" ya no truena; 27 EG + (5 del total que sustituye S29 + 2 de S31) = 34 → 85 días.
 let r=await calc(base);
 eq([r.criterio,r.dias_base,...resumen(r)],['AUSENCIAS_NO_COMPUTABLES_V2',119,34,7,27,85],'caso real con identidad ficticia');
 eq(r.detalle.find(x=>x.id==='s29'),{...r.detalle.find(x=>x.id==='s29'),dias:0,dias_documentados:7,sustituido_por:'h-falta'},'S29 (7) sustituido por el total histórico de 5');
 eq(r.limitaciones.map(x=>[x.motivo,x.informativo]),[['TOTAL_RECORTADO_AL_CORTE',true],['RANGO_SUSTITUIDO_POR_TOTAL',true]],'ajustes informativos visibles');
 eq(r.limitaciones[0].hasta,'2026-11-22','total EG recortado al último día antes de la fecha de cálculo');
 eq(r.detalle.some(x=>x.id==='inc-s27'),false,'las incidencias IMSS sin clasificar no se cuentan aparte (ya las cubre el total EG)');
 // 2) Si el total de faltas abarca también S31 (corrección completa: 5 faltas en total), queda 27 + 5 = 32 → 87.
 r=await calc({...base,historicas:[H('h-falta','FALTA_INJUSTIFICADA','2026-10-12','2026-11-01','5.00'),base.historicas[1]]});
 eq(resumen(r),[32,5,27,87],'un total de faltas que cubre S29 y S31 sustituye ambos descuentos');
 // 3) Sin históricas: comportamiento previo (7 + 2 = 9 → 110).
 r=await calc({...base,historicas:[]});
 eq(resumen(r),[9,9,0,110],'sin históricas los descuentos se cuentan como antes');
 // 4) Total de faltas contenido con fechas exactas: las fechas tienen prioridad si superan el total.
 r=await calc({calendario:[{id:'c1',fecha:'2026-10-14',id_incidencia:2},{id:'c2',fecha:'2026-10-15',id_incidencia:2},{id:'c3',fecha:'2026-10-16',id_incidencia:2}],faltas_semana:[],
  historicas:[H('t','FALTA_INJUSTIFICADA','2026-10-12','2026-10-18','2.00')]});
 eq([resumen(r),r.limitaciones.map(x=>x.motivo)],[[3,3,0,116],['FECHAS_PRIORIZADAS_SOBRE_TOTAL']],'fechas exactas priorizadas sobre un total menor');
 // 5) EG por fechas: deduplica contra una falta del mismo día y complementa su total.
 r=await calc({calendario:[{id:'c1',fecha:'2026-09-01',id_incidencia:2}],faltas_semana:[],
  historicas:[{id:'f',estado:'VIGENTE',modo:'FECHAS',naturaleza:'ENFERMEDAD_GENERAL',fechas:['2026-09-01','2026-09-02','2026-09-03']},H('t','ENFERMEDAD_GENERAL','2026-09-01','2026-09-10',4)]});
 eq(resumen(r),[5,1,4,114],'EG por fechas sin duplicar la falta del mismo día; total EG complementa 2 días');
 // 6) Total que inicia antes del ciclo: no se reparte por suposición.
 r=await calc({calendario:[],faltas_semana:[],historicas:[H('t','ENFERMEDAD_GENERAL','2026-07-01','2026-08-10',10)]});
 eq([resumen(r),r.limitaciones.map(x=>x.motivo)],[[0,0,0,119],['TOTAL_PARCIAL_SIN_FECHAS']],'total con inicio anterior al ciclo queda como limitación');
 // 7) Riesgo de trabajo y maternidad computan: no reducen el aguinaldo.
 r=await calc({calendario:[],faltas_semana:[],historicas:[H('a','RIESGO_TRABAJO','2026-08-01','2026-08-20',10),H('b','INCAPACIDAD_MATERNIDAD','2026-09-01','2026-09-20',10)]});
 eq(resumen(r),[0,0,0,119],'riesgo de trabajo y maternidad no se descuentan');
 // 8) Totales solapados de la misma clase se rechazan; de clases distintas conviven.
 await falla({calendario:[],faltas_semana:[],historicas:[H('a','ENFERMEDAD_GENERAL','2026-08-01','2026-08-20',3),H('b','ENFERMEDAD_GENERAL','2026-08-10','2026-08-30',3)]},/solapados/,'EG solapados');
 r=await calc({calendario:[],faltas_semana:[],historicas:[H('a','ENFERMEDAD_GENERAL','2026-08-01','2026-08-20',3),H('b','FALTA_INJUSTIFICADA','2026-08-10','2026-08-30','1.00')]});
 eq(resumen(r),[4,1,3,115],'falta y EG traslapados conviven');
 // 9) Más días que el ciclo: error explícito.
 await falla({calendario:[],faltas_semana:[],historicas:[H('a','ENFERMEDAD_GENERAL','2026-07-27','2026-11-22',200)]},/exceden los días del ciclo/,'exceso de días');
 // 10) Valores decimales y vacíos de total_acreditado.
 r=await calc({calendario:[],faltas_semana:[],historicas:[H('a','FALTA_INJUSTIFICADA','2026-08-01','2026-08-05','2.40'),H('b','ENFERMEDAD_GENERAL','2026-09-01','2026-09-05','')]});
 eq(resumen(r),[2,2,0,117],'total "2.40" se redondea y vacío cuenta 0');
 console.log('PASS ausencias v2 (EG histórica, totales numéricos, sustitución y recorte): '+n+' comprobaciones.');
})().catch(e=>{console.error(e);process.exit(1);});
