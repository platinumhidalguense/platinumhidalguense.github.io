// Entrega de cheques físicos con personas y folios ficticios. Sin red.
const fs=require('fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const f=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_cheques_entrega_fisica_sin_reexpedicion.sql'));
const sql=fs.readFileSync(f?'supabase/migrations/'+f:process.argv[2]||'work/entregas_cheques_20261102/guarda_entrega.sql','utf8');
assert(!/\bgrant\b|\brevoke\b|disable\s+trigger|session_replication_role/i.test(sql));
(async()=>{const db=new PGlite();let n=0;try{
 await db.exec(`create table public.trabajadores(id integer primary key,fecha_baja date);create table public.control_altas_bajas_cortas(trabajador_id integer,obra_id integer,semana integer,anio integer,estado_servicio text);
 create table public.cheques(id integer primary key,trabajador_id integer,obra_id integer,semana text,created_at timestamptz default '2026-06-01',estatus text,eliminado boolean default false,importe numeric,num_cheque text,consecutivo text,tipo_pago text default 'FINIQUITO',nombre text default 'PERSONA FICTICIA',updated_at timestamptz,actualizado_por text);
 create function public.norm_semana(v text) returns integer language sql immutable as $$select regexp_replace(v,'[^0-9]','','g')::integer$$;
 insert into trabajadores values(1,'2026-06-01');insert into cheques(id,trabajador_id,obra_id,semana,estatus,importe,num_cheque,consecutivo) values(1,1,1,'S1','EXPEDIDO',100,'FICTICIO','1'),(2,1,1,'S1','PENDIENTE',100,'',''),(3,1,1,'S1','EXPEDIDO',100,'','');
 insert into control_altas_bajas_cortas values(1,1,1,2026,'PENDIENTE');`);
 // La versión anterior bloqueaba incluso registrar la entrega.
 if(fs.existsSync('work/entregas_cheques_20261102/guarda_antes.sql')){
  await db.exec(fs.readFileSync('work/entregas_cheques_20261102/guarda_antes.sql','utf8'));
  await db.exec('create trigger comprobacion before insert or update on cheques for each row execute function public.control_bloquear_cheque_sin_servicio()');
  await assert.rejects(db.exec("update cheques set estatus='ENTREGADO' where id=1"),/clasifica servicio/);n++;
 }else await db.exec(sql+'create trigger comprobacion before insert or update on cheques for each row execute function public.control_bloquear_cheque_sin_servicio()');
 await db.exec(sql);
 const before=(await db.query('select to_jsonb(c) x from cheques c where id=1')).rows[0].x;
 await db.exec("update cheques set estatus='ENTREGADO',updated_at=now(),actualizado_por='PRUEBA FICTICIA' where id=1");n++;
 const after=(await db.query('select to_jsonb(c) x from cheques c where id=1')).rows[0].x;for(const k of ['estatus','updated_at','actualizado_por']){delete before[k];delete after[k];}assert.deepEqual(after,before);n++;
 // Cada intento parte otra vez del mismo cheque expedido; estas actualizaciones
 // son sólo datos ficticios en memoria, no desactivan reglas de producción.
 const reset=async()=>{await db.exec("update control_altas_bajas_cortas set estado_servicio='CON_SERVICIO';update cheques set estatus='EXPEDIDO' where id=1;update control_altas_bajas_cortas set estado_servicio='PENDIENTE'");};
 for(const change of ["importe=101","num_cheque='OTRO'","consecutivo='2'","tipo_pago='CHEQUE'","nombre='OTRA PERSONA'","semana='S2'","trabajador_id=2","obra_id=2"]){
  await reset();
  // Mantener también caso pendiente en el destino para comprobar que no hay bypass.
  await db.exec("insert into trabajadores values(2,'2026-06-01') on conflict do nothing;delete from control_altas_bajas_cortas where trabajador_id=2 or obra_id=2 or semana=2;insert into control_altas_bajas_cortas values(2,1,1,2026,'PENDIENTE'),(1,2,1,2026,'PENDIENTE'),(1,1,2,2026,'PENDIENTE')");
  await assert.rejects(db.exec("update cheques set estatus='ENTREGADO',"+change+' where id=1'),/clasifica servicio/);n++;
 }
 for(const status of ['EXPEDIDO','ENTREGADO']){await assert.rejects(db.exec("update cheques set estatus='"+status+"' where id=2"),/clasifica servicio/);n++;}
 await assert.rejects(db.exec("update cheques set estatus='ENTREGADO' where id=3"),/clasifica servicio/);n++;
 await assert.rejects(db.exec("insert into cheques(id,trabajador_id,obra_id,semana,estatus,importe,num_cheque,consecutivo) values(4,1,1,'S1','EXPEDIDO',100,'NUEVO','4')"),/clasifica servicio/);n++;
 await db.exec("update control_altas_bajas_cortas set estado_servicio='CON_SERVICIO';update cheques set estatus='ENTREGADO',importe=101 where id=1");n++;
 console.log('PASS entrega sin reexpedir: '+n+' controles PostgreSQL; sólo entrega de físico expedido sin cambiar datos, alta/expedición/importes/folios siguen protegidos.');
 }finally{await db.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
