const fs=require('fs'),assert=require('assert/strict'),base=require('./soporte_cierres_actuales_pg.cjs');
(async()=>{const db=await base.makeDatabase(),{ids,owner,actor}=base;try{
 await db.exec(fs.readFileSync('supabase/migrations/20261029213240_cheques_cfdi_prioridad_desgloses.sql','utf8'));
 await db.exec('create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;');
 await db.exec(fs.readFileSync('supabase/migrations/20261106195853_conciliador_general_persistente.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261106215742_conciliador_contexto_semanal.sql','utf8'));
 await owner(db,"create or replace function platinum_internal.conciliacion_hoy() returns date language sql stable as $$select date '2026-11-06'$$");
 await owner(db,"update obras set fecha_inicio='2026-03-30' where id=$1",[ids.obra]);
 const snap=base.snapshot(ids.w,2000);snap.semana=31;snap.desde='2026-10-26';snap.hasta='2026-11-01';const cid=require('crypto').randomUUID();
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,31,'SEMANAL','FICTICIO','SHA-FICTICIO',$3,$4)",[cid,ids.obra,JSON.stringify(snap),ids.conta]);
 await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago) values($1,$2,'S31','TRANSFERENCIA','BBVA',100,'RECHAZADO','2026-10-30'),($1,$2,'S32','TRANSFERENCIA','BBVA',200,'PENDIENTE','2026-11-06')",[ids.obra,ids.w]);
 // Semilla física aislada; no desactiva validaciones en producción.
 await db.exec('reset role;alter table cheques disable trigger user;');
 await owner(db,"insert into cheques(obra_id,trabajador_id,no_trab,nombre,semana,tipo_pago,importe,estatus) values($1,$2,1,'PERSONA PRUEBA','S31','FINIQUITO',100,'PENDIENTE'),($1,$2,1,'PERSONA PRUEBA','S31','FINIQUITO',100,'CANCELADO')",[ids.obra,ids.w]);
 await db.exec('alter table cheques enable trigger user;');
 const call=async(who,sem=null,c=null)=>{await actor(db,who);return(await db.query('select public.control_conciliacion_semanal($1,$2,$3) r',[ids.obra,sem,c])).rows[0].r;};
 const before=(await owner(db,'select snapshot::text s from control_cierres_nomina where id=$1',[cid])).rows[0].s;
 let d=await call('conta',31);assert.equal(d.modo,'HISTORICO');assert(d.solo_lectura);assert.equal(d.permisos.escritura,false);assert.equal(d.permisos.aprobar_cierre,false);assert.equal(d.transferencias.length,1);assert.equal(d.transferencias[0].importe,100);assert.equal(d.cheques.length,2);assert(d.alertas.some(x=>x.tipo==='TRANSFERENCIA_RECHAZADO'));assert.equal(d.alertas.filter(x=>x.tipo==='CHEQUE_PENDIENTE').length,1,'Cancelados no alertan ni se modifican');assert(d.detalle.cierre.id===cid);assert.equal(d.expediente.estado.revision,0);
 assert.equal(Number((await owner(db,'select count(*) n from estado_conciliacion_nomina')).rows[0].n),0,'Histórico no crea estado del stepper');
 d=await call('conta');assert.equal(d.semana,32);assert.equal(d.modo,'ACTUAL');assert.equal(d.solo_lectura,false);assert.equal(d.detalle,null);assert.equal(d.transferencias.length,1);assert.equal(d.transferencias[0].importe,200);assert(d.alertas.some(x=>x.tipo==='TRANSFERENCIA_PENDIENTE'));assert.equal(d.cheques.length,0);
 d=await call('consulta',32);assert(d.solo_lectura);assert(!d.permisos.escritura);await assert.rejects(call('jire',31),/permiso|acceso/i);await assert.rejects(call(null,31),/permission denied/i);await assert.rejects(call('conta',0),/rango/);await assert.rejects(call('conta',32,cid),/otra semana/);
 assert.equal((await owner(db,'select snapshot::text s from control_cierres_nomina where id=$1',[cid])).rows[0].s,before);assert.equal(Number((await owner(db,'select count(*) n from pagos')).rows[0].n),2);assert.equal((await call('admin',31)).permisos.admin,false);
 await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago) values($1,$2,'S31','TRANSFERENCIA','BBVA',2000,'EXITOSO','2026-10-30')",[ids.obra,ids.w]);assert(!(await call('admin',31)).alertas.some(a=>a.tipo==='TRANSFERENCIA_RECHAZADO'),'Rechazo cubierto no aparece como pendiente, su comprobante se conserva');
 console.log('PASS consulta semanal SQL: llamada única, fuentes por semana, actual sin cierre, histórico inmutable, alertas reales, cancelados intactos, alcance y roles.');
 }finally{await db.close();}})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
