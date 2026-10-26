// Regresión PostgreSQL aislada, datos ficticios. Nunca conecta a producción.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const base=require('./soporte_cierres_actuales_pg.cjs'),{ids,owner,actor}=base;
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_reingresos_ciclos_sin_reabrir_cierres.sql'));
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
let checks=0;
(async()=>{const db=await base.makeDatabase({sinReingresos:true});try{
 const today=(await owner(db,"select (now() at time zone 'America/Mexico_City')::date::text d")).rows[0].d;
 const monday=(await owner(db,"select date_trunc('week',now() at time zone 'America/Mexico_City')::date::text d")).rows[0].d;
 const origin=shift(monday,-30*7),start=s=>shift(origin,(s-1)*7);
 await owner(db,'update obras set fecha_inicio=$1',[origin]);
 await owner(db,"update trabajadores set estatus='BAJA',fecha_baja=$2,monto_finiquito=221.32 where id=$1",[ids.w,start(26)]);
 await owner(db,"update trabajadores set estatus='BAJA',fecha_baja=$2,monto_finiquito=427.99 where id=$1",[ids.w2,start(29)]);
 await owner(db,"update trabajadores set estatus='BAJA',fecha_baja=$2,monto_finiquito=100 where id=$1",[ids.wOtra,start(29)]);
 // Audit trigger de producción, mismos datos_antes/despues y clasificación del ciclo.
 await db.exec(`alter table historial add column usuario text;alter table historial add column trabajador_nombre text;
 create function public.fn_audit_trabajadores() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.historial(trabajador_id,obra_id,usuario,accion,datos_antes,datos_despues)
 values(new.id,new.obra_id,auth.email(),case when old.estatus<>'BAJA' and new.estatus='BAJA' then 'BAJA'
 when old.estatus='BAJA' and new.estatus<>'BAJA' then 'REACTIVACION' else 'MODIFICACION' end,to_jsonb(old),to_jsonb(new));return new;end$$;
 create trigger audit_reingreso after update on trabajadores for each row execute function public.fn_audit_trabajadores();`);
 const cierre=async(obra,semana,estado,desde=start(semana),hasta=shift(desde,6),periodo='SEMANAL')=>{
  const id=crypto.randomUUID(),s={...base.snapshot(),obra_id:obra,semana,periodo,desde,hasta};
  await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot,snapshot_sha256,total_neto,creado_por) values($1,$2,$3,$4,'FICTICIO',$5,'SELLADO-FICTICIO',2000,$6)",[id,obra,semana,periodo,JSON.stringify(s),ids.admin]);
  // Semilla de estado histórico sólo local. Las transiciones reales se verifican en sus suites.
  await db.exec('alter table control_cierres_nomina disable trigger user');
  await owner(db,'update control_cierres_nomina set estado=$2 where id=$1',[id,estado]);
  await db.exec('alter table control_cierres_nomina enable trigger user');
  await owner(db,"insert into control_flujo_cierres(cierre_id,obra_id,sucio,fuente_sha256,preparado_sha256) values($1,$2,false,'FUENTE-SELLADA','PREPARADO-SELLADO')",[id,obra]);return id;
 };
 const c26=await cierre(ids.obra,26,'TIMBRADO'),c29=await cierre(ids.obra,29,'PAGADO');
 const c30=await cierre(ids.obra,30,'BORRADOR'),c31=await cierre(ids.obra,31,'BORRADOR');
 const frozen=async()=> (await owner(db,"select to_jsonb(c) cierre,to_jsonb(f) flujo from control_cierres_nomina c join control_flujo_cierres f on f.cierre_id=c.id where c.id=any($1::uuid[]) order by c.id",[[c26,c29,c30]])).rows;
 const before=await frozen();
 const react=async(w,fecha,extra={},role='conta')=>{await actor(db,role);return db.query("update trabajadores set estatus='ACTIVO',fecha_reingreso=$2,monto_finiquito=null where id=$1",[w,fecha]);};
 await assert.rejects(react(ids.w,today),/S26.*reapertura/);checks++;
 await assert.rejects(react(ids.w2,today),/S29.*reapertura/);checks++;
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 await assert.rejects(react(ids.w,shift(start(29),1)),/S29.*reapertura/);checks++;
 for(const d of [null,start(26),shift(start(26),-1)]){await assert.rejects(react(ids.w,d),/posterior a la última baja/);checks++;}
 await react(ids.w,today);await react(ids.w2,today);checks+=2;
 assert.deepEqual(await frozen(),before);checks++;
 const workers=(await owner(db,'select id,estatus,fecha_baja::text,fecha_reingreso::text,monto_finiquito from trabajadores where obra_id=$1 order by no_trab',[ids.obra])).rows;
 assert(workers.every(w=>w.estatus==='ACTIVO'&&w.fecha_reingreso===today&&w.monto_finiquito===null));checks++;
 assert.equal(workers[0].fecha_baja,start(26));assert.equal(workers[1].fecha_baja,start(29));checks+=2;
 assert.equal((await owner(db,'select sucio from control_flujo_cierres where cierre_id=$1',[c31])).rows[0].sucio,true);checks++;
 const history=(await owner(db,"select * from historial where accion='REACTIVACION' order by datos_antes->>'monto_finiquito'")).rows;
 assert.equal(history.length,2);assert(history.every(h=>h.usuario==='conta@prueba.test'&&h.datos_antes.estatus==='BAJA'&&h.datos_despues.estatus==='ACTIVO'));
 assert.equal(Number(history[0].datos_antes.monto_finiquito),221.32);assert.equal(Number(history[1].datos_antes.monto_finiquito),427.99);checks+=4;
 // Editar de verdad un finiquito histórico sigue protegido.
 await assert.rejects(owner(db,'update trabajadores set monto_finiquito=222 where id=$1',[ids.w]),/S26.*reapertura/);checks++;
 // La baja siguiente del nuevo ciclo no invade el finiquito de S26.
 await actor(db,'conta');await db.query("update trabajadores set estatus='BAJA',fecha_baja=$2,monto_finiquito=100 where id=$1",[ids.w,today]);checks++;
 assert.deepEqual(await frozen(),before);checks++;
 // La fecha efectiva futura no debe ensuciar el borrador de esta semana.
 await owner(db,'update control_flujo_cierres set sucio=false where cierre_id=$1',[c31]);
 await react(ids.w,shift(monday,7));assert.equal((await owner(db,'select sucio from control_flujo_cierres where cierre_id=$1',[c31])).rows[0].sucio,false);checks++;
 // Corregir posteriormente el reingreso hacia una semana cerrada sí se bloquea.
 await assert.rejects(owner(db,'update trabajadores set fecha_reingreso=$2 where id=$1',[ids.w,shift(start(29),1)]),/S29.*reapertura/);checks++;
 // RLS: consulta no escribe; capturista JIRE no puede tocar PLATINUM.
 await actor(db,'consulta');assert.equal((await db.query("update trabajadores set estatus='BAJA' where id=$1 returning id",[ids.w2])).rows.length,0);checks++;
 await actor(db,'jire');assert.equal((await db.query("update trabajadores set estatus='BAJA' where id=$1 returning id",[ids.w2])).rows.length,0);checks++;
 await react(ids.wOtra,today,{},'jire');checks++;
 // Altas: posteriores al cierre permitidas; insertarlas dentro de un cierre, no.
 const hire=async(d)=>{await actor(db,'conta');return db.query("insert into trabajadores(id,obra_id,no_trab,nombres,estatus,fecha_alta) values($1,$2,$3,'FICTICIO','ACTIVO',$4)",[crypto.randomUUID(),ids.obra,900+checks,d]);};
 await hire(today);checks++;await assert.rejects(hire(start(26)),/S26.*reapertura/);checks++;
 // Quincenal y centro sin fecha inicial: se respeta el periodo real sellado.
 const past=shift(monday,-7),end=shift(monday,3);
 const q=await cierre(ids.otra,30,'AUTORIZADO',past,end,'QUINCENAL');
 await db.exec('alter table obras disable trigger user');await owner(db,'update obras set fecha_inicio=null where id=$1',[ids.otra]);await db.exec('alter table obras enable trigger user');
 await actor(db,'jire');await assert.rejects(db.query("update trabajadores set estatus='BAJA',fecha_baja=$2,monto_finiquito=50 where id=$1",[ids.wOtra,today]),/S30.*reapertura/);checks++;
 assert.equal((await owner(db,'select sucio from control_flujo_cierres where cierre_id=$1',[q])).rows[0].sucio,false);checks++;
 assert.deepEqual(await frozen(),before);checks++;
 for(const role of ['anon','authenticated']){assert.equal((await owner(db,"select has_function_privilege($1,'platinum_internal.guardar_fuente()','EXECUTE') p",[role])).rows[0].p,false);checks++;}
 console.log('PASS '+checks+' controles de reingreso: reproducción S26/S29, ciclos nuevos, fechas, historial, altas/bajas, quincenas, fuentes y RLS; cierres históricos intactos.');
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
