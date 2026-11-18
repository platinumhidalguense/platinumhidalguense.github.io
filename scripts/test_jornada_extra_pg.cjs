// Horas extra y descansos laborados en PostgreSQL local (pglite), datos ficticios.
// Requiere el paquete SQL privado: la migración *_jornada_extra_descansos_laborados.sql
// y work/jornada_20261118/prod_calendario.sql (definiciones vigentes). Sin él se omite.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations'),priv=path.join(root,'work/jornada_20261118/prod_calendario.sql');
const mig=fs.existsSync(dir)&&fs.readdirSync(dir).find(n=>n.endsWith('_jornada_extra_descansos_laborados.sql'));
if(!mig||!fs.existsSync(priv)){console.log('ALCANCE PÚBLICO JORNADA: las pruebas PostgreSQL requieren el paquete privado; no se cuentan como ejecutadas.');process.exit(0);}
const J=require('../frontend/modulos/94-jornada-extra-core.js');
const {makeDatabase,ids,actor,owner}=require('./soporte_flujo_pg.cjs');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},num=(a,b,m)=>{assert.equal(Number(a),Number(b),m);n++;};
const uid=()=>crypto.randomUUID();
(async()=>{
 const db=await makeDatabase();
 await db.exec(`create schema if not exists platinum_internal;
  create table if not exists public.catalogo_incidencias(id smallint primary key,nombre text);
  create table if not exists public.incidencias_empleados(id uuid primary key default gen_random_uuid(),obra_id uuid,empleado_id uuid,fecha_aplicacion date,id_incidencia smallint,clase text,estado text default 'APLICADO');
  insert into public.catalogo_incidencias values(2,'FALTA INJUSTIFICADA');`);
 await db.exec(fs.readFileSync(priv,'utf8'));
 await db.exec("create or replace function platinum_internal.calendario_hoy() returns date language sql stable as $$select date '2026-11-18'$$");
 const obra3='20000000-0000-4000-8000-000000000003',wQ='30000000-0000-4000-8000-000000000011',wX='30000000-0000-4000-8000-000000000012',wJ='30000000-0000-4000-8000-000000000013';
 await owner(db,"insert into obras(id,nombre,empresa_codigo,fecha_inicio) values($1,'TERCERA FICTICIA','PLATINUM','2026-03-30')",[obra3]);
 await owner(db,"update obras set fecha_inicio='2026-03-30'");
 await owner(db,"update trabajadores set sd=400,sdi=420,curp='CURP'||no_trab||'FICTICIA',periodo_pago='SEMANAL',turno='DIURNO',fecha_alta='2026-01-05',fecha_baja=null,fecha_reingreso=null");
 for(const [id,obra,no,curp,pp] of [[wQ,ids.obra,11,'CURPQFICTICIA','QUINCENAL'],[wX,obra3,12,'CURP1FICTICIA','SEMANAL'],[wJ,ids.otra,13,'CURP1FICTICIA','SEMANAL']])
  await owner(db,"insert into trabajadores(id,obra_id,no_trab,nombres,primer_apellido,estatus,fecha_alta,sd,sdi,sal_semanal,curp,periodo_pago,turno) values($1,$2,$3,'PERSONA','FICTICIA','ACTIVO','2026-01-05',400,420,2500,$4,$5,'DIURNO')",[id,obra,no,curp,pp]);
 await db.exec(fs.readFileSync(path.join(dir,mig),'utf8'));
 const call=async(who,acc,datos)=>{await actor(db,who);try{return (await db.query('select public.control_jornada($1,$2::jsonb) r',[acc,JSON.stringify(datos)])).rows[0].r;}finally{await db.exec('reset role');}};
 const falla=async(who,acc,datos,re,m)=>{let e=null;try{await call(who,acc,datos);}catch(x){e=x;}await db.exec('reset role');ok(e&&re.test(e.message),m+' → '+(e?e.message:'sin error'));};
 const he=(t,fecha,min,extra)=>({trabajador_id:t,fecha,tipo:'HORAS_EXTRA',clave_idempotencia:uid(),captura:{minutos:min,...extra}});
 const confirmar=async(d,flags)=>{const q=await call('admin','PREVIA',d);return {q,r:await call('admin','CONFIRMAR',{...d,firma:q.firma,...flags})};};
 const fila=async id=>(await owner(db,'select * from control_jornada_eventos where id=$1',[id])).rows[0];

 // 1. $400 diarios, jornada diurna de 8 h: valor hora $50; 2 h dobles = $200.
 let d=he(ids.w,'2026-11-17',120),q=await call('admin','PREVIA',d);
 num(q.evento.valor_hora,50,'valor hora');num(q.evento.importe_dobles,200,'2 h dobles');num(q.evento.minutos_triples,0,'sin triples');
 num(q.evento.exento,100,'50 % exento (93-II)');num(q.evento.gravado,100,'gravado');eq(q.evento.fraccion,'93-II','fracción');
 eq([q.destino.semana,q.fecha_pago,q.retroactivo],[34,'2026-11-20',false],'periodo de aplicación y fecha de pago');
 await falla('consulta','CONFIRMAR',{...d,firma:q.firma},/consultar/,'usuario de consulta no guarda');
 await falla('jire','PREVIA',d,/permiso/,'otra empresa sin acceso');
 await falla('admin','CONFIRMAR',{...d,firma:'vieja'},/vista previa cambió/,'firma vieja');
 const a=await call('admin','CONFIRMAR',{...d,firma:q.firma});eq(a.semana_aplicacion,34,'guardado');
 ok((await call('admin','CONFIRMAR',{...d,firma:q.firma})).repetido,'reintento/doble clic no duplica');
 await falla('admin','CONFIRMAR',{...d,captura:{minutos:30},firma:q.firma},/reutilizada/,'misma clave con otros datos');
 num((await owner(db,'select count(*) c from control_jornada_eventos')).rows[0].c,1,'una sola fila');

 // 2. Cruce del umbral semanal: 2 h + 8 h → la segunda captura: 7 h dobles y 1 h triple.
 const d2=he(ids.w,'2026-11-18',480);q=await call('admin','PREVIA',d2);
 eq([q.evento.minutos_dobles,q.evento.minutos_triples],[420,60],'umbral 9 h');num(q.evento.importe_triples,150,'1 h triple = $150');
 ok(q.evento.avisos.some(x=>x.codigo==='LIMITE_DIARIO')&&q.evento.avisos.some(x=>x.codigo==='TRIPLES'),'avisos de límite diario y triples');
 num(q.evento.minutos_elegibles,240,'sólo 4 h del día son elegibles (límite diario)');num(q.evento.importe_dobles,700,'7 h dobles pagadas completas');
 await falla('admin','CONFIRMAR',{...d2,firma:q.firma},/advertencias/,'exige confirmar advertencias');
 // Concurrencia: otra sesión guarda antes en la misma semana → la vista previa vieja se rechaza.
 const d3=he(ids.w,'2026-11-16',60),q3=await call('admin','PREVIA',d3);
 const b=await call('admin','CONFIRMAR',{...d2,firma:q.firma,confirmar_avisos:true});
 await falla('admin','CONFIRMAR',{...d3,firma:q3.firma,confirmar_avisos:true},/vista previa cambió/,'sesión simultánea recalcula');

 // 3. Edición de la primera captura (2 h → 1 h): la segunda se redistribuye a 8 h dobles.
 let r1=await fila(a.id);const de={...he(ids.w,'2026-11-17',60),editar_id:a.id,version:r1.version};
 q=await call('admin','PREVIA',de);ok(q.redistribucion.some(x=>x.id===b.id&&x.despues.minutos_triples===0),'vista previa muestra la redistribución');
 const e1=await call('admin','CONFIRMAR',{...de,firma:q.firma,confirmar_avisos:true});
 let r2=await fila(b.id);eq([r2.calculo.minutos_dobles,r2.calculo.minutos_triples,r2.version],[480,0,2],'redistribuida al editar');
 eq((await fila(a.id)).estado,'ANULADO','la original queda anulada con auditoría');
 // 4. Anulación: la semana se recalcula; versión vieja rechazada.
 await falla('admin','ANULAR',{id:e1.id,version:0,motivo:'prueba'},/otra sesión/,'versión vieja');
 await call('admin','ANULAR',{id:e1.id,version:1,motivo:'Captura de prueba'});
 r2=await fila(b.id);eq([r2.calculo.minutos_dobles,r2.version],[480,2],'sin cambios innecesarios');

 // 5. Descanso obligatorio laborado (16/11/2026, tercer lunes): ordinario incluido → adicional $800; total del día $1,200.
 const fest={trabajador_id:ids.w,fecha:'2026-11-16',tipo:'DESCANSO_OBLIGATORIO',clave_idempotencia:uid(),captura:{laboro:true}};
 q=await call('admin','PREVIA',fest);num(q.evento.descanso_adicional,800,'adicional doble');num(q.evento.ordinario_adicional,0,'ordinario ya incluido');num(q.evento.bruto,800,'bruto adicional');
 num(Number(q.evento.salario_base)+Number(q.evento.bruto),1200,'total del día $1,200');
 await falla('admin','PREVIA',{...fest,captura:{laboro:false}},/no laborado/,'festivo no laborado no genera pago');
 await falla('admin','PREVIA',{...fest,fecha:'2026-11-17'},/no es un descanso obligatorio/,'fecha no festiva');
 const c5=await call('admin','CONFIRMAR',{...fest,firma:q.firma});
 // Coincidencia: el mismo día como descanso semanal (documentado en lunes) no se paga dos veces.
 await falla('admin','PREVIA',{trabajador_id:ids.w,fecha:'2026-11-16',tipo:'DESCANSO_SEMANAL',clave_idempotencia:uid(),captura:{laboro:true,descanso_semanal:1}},/dos veces/,'coincidencia sin duplicidad');
 // 6. Domingo laborado con prima dominical 25 %.
 const dom={trabajador_id:ids.w,fecha:'2026-11-15',tipo:'DESCANSO_SEMANAL',clave_idempotencia:uid(),captura:{laboro:true,descanso_semanal:0,prima_dominical:{aplica:true,pct:25}}};
 await falla('admin','PREVIA',{...dom,fecha:'2026-11-18'},/descanso semanal/,'el descanso debe coincidir con el día documentado');
 await falla('admin','PREVIA',{...dom,captura:{...dom.captura,prima_dominical:{aplica:true,pct:20}}},/25%/,'prima mínima 25 %');
 await falla('admin','PREVIA',{...dom,fecha:'2026-11-29'},/futura/,'no se registra trabajo futuro');
 const dom2={...dom,fecha:'2026-11-15',clave_idempotencia:uid()};
 q=await call('admin','PREVIA',dom2);num(q.evento.prima_dominical,100,'prima $100');num(q.evento.exento_prima,100,'prima exenta hasta 1 UMA');
 num(q.evento.exento_extra,400,'50 % del adicional');num(q.evento.sbc_variable,900,'SBC: adicional y prima integran');

 // 7. Tope compartido de 5 UMA ($586.55) en la semana 16–22/11: dobles elegibles + descanso.
 const sem=await owner(db,"select sum(exento) ex,sum(gravado) g,sum(bruto) b,jsonb_agg(calculo) c from control_jornada_eventos where estado='APLICADO' and semana_servicio='2026-11-16'");
 const xs=sem.rows[0].c;num(xs.reduce((s,x)=>s+Number(x.exento_extra),0),Math.min(586.55,(400+400)/2+800/2),'exención compartida con tope semanal');
 ok(Number(sem.rows[0].ex)+Number(sem.rows[0].g)===Number(sem.rows[0].b),'exento + gravado = bruto');

 // 8. Periodo protegido: S33 autorizada → retroactivo hacia S34 con su origen.
 await owner(db,"insert into control_cierres_nomina(obra_id,semana,periodo,estado,formula_version,snapshot_sha256,total_trabajadores) values($1,33,'SEMANAL','AUTORIZADO','F','x',0)",[ids.obra]);
 const rt=he(ids.w,'2026-11-12',60);q=await call('admin','PREVIA',rt);
 eq([q.retroactivo,q.origen.semana,q.destino.semana],[true,33,34],'ajuste por periodo anterior');
 await falla('admin','CONFIRMAR',{...rt,firma:q.firma},/periodos anteriores/,'exige confirmar retroactivo');
 const rr=await call('admin','CONFIRMAR',{...rt,firma:q.firma,confirmar_retroactivo:true});const rf=await fila(rr.id);
 eq([rf.semana_origen,rf.semana_aplicacion,rf.retroactivo],[33,34,true],'conserva origen');

 // 9. Contradicciones: falta del mismo día → resolución explícita sin borrar.
 await owner(db,"insert into incidencias_empleados(obra_id,empleado_id,fecha_aplicacion,id_incidencia,clase) values($1,$2,'2026-11-10',2,'AUSENCIA')",[ids.obra,ids.w2]);
 const cf=he(ids.w2,'2026-11-10',60);q=await call('admin','PREVIA',cf);ok(q.conflictos.some(x=>x.codigo==='AUSENCIA'),'detecta la falta');
 await falla('admin','CONFIRMAR',{...cf,firma:q.firma,confirmar_retroactivo:true},/contradicciones/,'exige resolver');
 await call('admin','CONFIRMAR',{...cf,firma:q.firma,confirmar_retroactivo:true,resolver_conflictos:true,motivo_conflicto:'Falta capturada por error; asistió en turno nocturno'});
 num((await owner(db,"select count(*) c from incidencias_empleados where empleado_id=$1",[ids.w2])).rows[0].c,1,'la falta se conserva');
 // Intervalos: turno nocturno con cruce de medianoche y traslape.
 const noc={trabajador_id:ids.w2,fecha:'2026-11-17',tipo:'HORAS_EXTRA',clave_idempotencia:uid(),captura:{intervalos:[{inicio:'22:00',fin:'01:30',descanso_min:30}]}};
 q=await call('admin','PREVIA',noc);num(q.evento.minutos,180,'22:00–01:30 menos 30 min = 3 h');
 await call('admin','CONFIRMAR',{...noc,firma:q.firma});
 await falla('admin','PREVIA',{...noc,clave_idempotencia:uid(),captura:{intervalos:[{inicio:'00:30',fin:'00:45'},{inicio:'23:00',fin:'23:30'}]}},/traslapa/,'traslape con otra captura');

 // 10. Mismo patrón en otro centro acumula; otro patrón no.
 q=await call('admin','PREVIA',he(wX,'2026-11-17',480));ok(q.redistribucion.some(x=>x.id===b.id&&x.despues.minutos_dobles===60),'fecha anterior en otro centro del mismo patrón redistribuye la semana');
 q=await call('admin','PREVIA',he(wX,'2026-11-18',480));eq(q.evento.minutos_dobles,60,'mismo CURP y patrón: sólo quedan 60 min del umbral de 9 h');
 q=await call('admin','PREVIA',he(wJ,'2026-11-17',480));eq(q.evento.minutos_dobles,480,'otro patrón no se mezcla');
 // 11. Quincenal: semana que cruza la quincena acumula; periodo y fecha de pago quincenales.
 const qa=await confirmar(he(wQ,'2026-10-30',360),{confirmar_avisos:true});eq([qa.q.destino.desde,qa.q.destino.hasta,qa.q.fecha_pago],['2026-10-16','2026-10-31','2026-10-31'],'segunda quincena de octubre');
 q=await call('admin','PREVIA',he(wQ,'2026-11-01',300));eq([q.destino.desde,q.evento.minutos_dobles,q.evento.minutos_triples],['2026-11-01',180,120],'acumula a través de la quincena');
 // 12. Alta, baja y reingreso.
 await owner(db,"update trabajadores set fecha_alta='2026-11-17' where id=$1",[wX]);
 await falla('admin','PREVIA',he(wX,'2026-11-16',60),/anterior al alta/,'antes del alta');
 await owner(db,"update trabajadores set fecha_alta='2026-01-05',fecha_baja='2026-11-10',fecha_reingreso='2026-11-17' where id=$1",[wX]);
 await falla('admin','PREVIA',he(wX,'2026-11-12',60),/entre la baja y el reingreso/,'sin relación laboral');
 await owner(db,"update trabajadores set fecha_reingreso=null where id=$1",[wX]);
 await falla('admin','PREVIA',he(wX,'2026-11-12',60),/posterior a la baja/,'después de la baja');

 // 13. Paridad JS ↔ PostgreSQL: semanas aleatorias con todos los casos.
 const campos=['minutos','minutos_dobles','minutos_triples','minutos_elegibles','importe_dobles','importe_triples','descanso_adicional','ordinario_adicional','prima_dominical','bruto','elegible_exencion','exento_extra','exento_prima','exento','gravado','sbc_variable','valor_hora'];
 let semilla=7,comparadas=0,rechazos=0;const rnd=k=>{semilla=(semilla*1103515245+12345)%2147483648;return semilla%k;};
 for(let i=0;i<250;i++){
  const lunes=['2026-04-27','2026-11-16','2026-09-14','2026-02-02','2026-12-28','2025-11-24'][rnd(6)];
  const fp=lunes<'2026-02-01'?'2025-12-01':lunes>'2027-01-31'?'2026-12-01':lunes;
  const sd=[315.04,400,278.8,1234.56,999.99][rnd(5)],evs=[];const usados=new Set();
  for(let k=0;k<1+rnd(5);k++){
   const fecha=J.sumar(lunes,rnd(7)),tipo=rnd(4)===0?(fecha===J.sumar(lunes,6)?'DESCANSO_SEMANAL':'HORAS_EXTRA'):'HORAS_EXTRA';
   if(tipo!=='HORAS_EXTRA'&&usados.has(fecha))continue;if(tipo!=='HORAS_EXTRA')usados.add(fecha);
   const jor=[{tipo:'DIURNA'},{tipo:'NOCTURNA'},{tipo:'MIXTA'},{tipo:'PACTADA',horas:6.75,base:'DIURNA',referencia:'CONTRATO'}][rnd(4)];
   const captura={jornada:jor,salario_base:sd+(rnd(3)===0?50:0),sd_registrado:sd,base_referencia:'RECIBO',laboro:true,ordinario_incluido:rnd(5)!==0,
    ...(rnd(2)?{minutos:15+rnd(300)}:{intervalos:[{inicio:String(rnd(24)).padStart(2,'0')+':'+['00','15','30','45'][rnd(4)],fin:String(rnd(24)).padStart(2,'0')+':10',descanso_min:0}]}),
    ...(J.dow(fecha)===0&&!evs.some(e=>e.fecha===fecha&&e.captura.prima_dominical)&&rnd(2)?{prima_dominical:{aplica:true,pct:[25,30,37.5][rnd(3)]}}:{})};
   evs.push({id:uid(),tipo,fecha,fecha_pago:fp,orden:String(k),captura});
  }
  if(lunes<'2026-02-01'){for(const e of evs)if(e.captura.sd_registrado>400)e.captura.sd_registrado=e.captura.salario_base=278.8;}
  let js,pg,ej=null,ep=null;
  try{js=J.calcularSemana(evs);}catch(x){ej=x.message;}
  try{pg=(await owner(db,'select platinum_internal.jornada_calcular($1::jsonb) r',[JSON.stringify(evs)])).rows[0].r;}catch(x){ep=x.message;}
  if(ej||ep){eq(!!ej,!!ep,'ambos rechazan: '+ej+' | '+ep);rechazos++;if(process.env.JDBG)console.log(ej);continue;}comparadas++;
  for(const x of js.eventos){const y=pg.eventos.find(z=>z.id===x.id);for(const k of campos)assert.equal(Number(y[k]),Number(x[k]),`paridad ${k} caso ${i}`);eq(y.avisos.map(a=>a.codigo),x.avisos.map(a=>a.codigo),'avisos '+i);eq(y.avisos.map(a=>a.texto),x.avisos.map(a=>a.texto),'textos '+i);}
  n++;
 }
 ok(comparadas>=120,'paridad con semanas calculadas: '+comparadas+' (rechazos compartidos '+rechazos+')');console.log('paridad',comparadas,'semanas calculadas,',rechazos,'rechazos compartidos');
 // Congelados: el cálculo guardado se respeta y consume primero.
 const frozen=[{id:'a',tipo:'HORAS_EXTRA',fecha:'2026-11-17',fecha_pago:'2026-11-20',orden:'1',congelado:{minutos:540,minutos_dobles:540,minutos_triples:0,exento_extra:500,fraccion:'93-II',prima_dominical:0,bruto:1000,exento:500,gravado:500}},
  {id:'b',tipo:'HORAS_EXTRA',fecha:'2026-11-16',fecha_pago:'2026-11-20',orden:'2',captura:{jornada:{tipo:'DIURNA'},salario_base:400,sd_registrado:400,minutos:60}}];
 const fj=J.calcularSemana(frozen),fpg=(await owner(db,'select platinum_internal.jornada_calcular($1::jsonb) r',[JSON.stringify(frozen)])).rows[0].r;
 const bj=fj.eventos.find(x=>x.id==='b'),bp=fpg.eventos.find(x=>x.id==='b');
 eq([bj.minutos_triples,bj.exento_extra],[60,0],'tras el congelado: triple y sin exención (tope 586.55 − 500 = 86.55 pero el triple no es elegible)');
 eq([Number(bp.minutos_triples),Number(bp.exento_extra)],[60,0],'servidor igual');
 // Un evento ya pagado no se anula ni se edita.
 await owner(db,"insert into control_cierres_nomina(obra_id,semana,periodo,estado,formula_version,snapshot_sha256,total_trabajadores) values($1,34,'SEMANAL','PAGADO','F','x',0)",[ids.obra]);
 r2=await fila(b.id);await falla('admin','ANULAR',{id:b.id,version:r2.version,motivo:'prueba'},/autorizado, timbrado o pagado/,'periodo pagado protegido');
 await falla('admin','PREVIA',he(ids.w,'2026-11-18',30),/No hay un periodo abierto/,'sin periodo abierto no se aplica');
 // Congelado en la semana: un nuevo cálculo lo respeta.
 const sj=(await owner(db,"select platinum_internal.jornada_semana($1,'2026-11-16',null) r",['CURP1FICTICIA|PLATINUM'])).rows[0].r;
 ok(sj.filter(x=>x.congelado).length>=2,'capturas de S34 congeladas tras el pago');
 // Reglas por fecha: paridad JS ↔ servidor.
 for(const f of ['2025-12-31','2026-04-30','2026-05-01','2026-12-31','2027-01-01','2027-12-31','2028-01-01','2029-06-01','2030-01-01','2034-01-01']){
  const x=J.regla(f),y=(await owner(db,'select platinum_internal.jornada_regla($1::date) r',[f])).rows[0].r;
  for(const k of ['id','vigencia','ordinaria','umbral','max_diario','max_dias','max_triples','max_total_diario','fuente'])eq(y[k],x[k],'regla '+k+' '+f);
 }
 for(const an of [2025,2026,2027,2030,2036]){const x=J.descansosObligatorios(an).map(d=>d.fecha+d.fraccion),y=(await owner(db,'select fecha::text f,fraccion from platinum_internal.jornada_festivos($1) order by 1',[an])).rows.map(r=>r.f+r.fraccion);eq(y,x,'festivos '+an);}
 // Sin capturas: nada cambia.
 eq((await owner(db,"select platinum_internal.jornada_calcular('[]') r")).rows[0].r.eventos,[],'semana vacía');
 // Bitácora y borrado bloqueado.
 ok(Number((await owner(db,"select count(*) c from control_bitacora where modulo='JORNADA'")).rows[0].c)>=6,'bitácora');
 let borro=null;try{await owner(db,'delete from control_jornada_eventos');}catch(x){borro=x;}ok(borro&&/no se borran/.test(borro.message),'no se borran');
 console.log(`OK test_jornada_extra_pg: ${n} comprobaciones`);
})().catch(e=>{console.error(e);process.exit(1);});
