const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict'),base=require('./soporte_cierres_actuales_pg.cjs');
const file=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_cheques_importe_manual_pendiente.sql'));
const sql=fs.readFileSync(file?'supabase/migrations/'+file:'work/cheques_importe_manual_20261029/propuesta.sql','utf8');
let n=0;const ok=(v,m)=>{assert(v,m);n++;},no=async(p,re)=>{await assert.rejects(p,re);n++;};
(async()=>{const db=await base.makeDatabase(),{ids,owner,actor}=base;try{
 for(const f of JSON.parse(fs.readFileSync('work/cheques_fisicos_20261028/permisos_antes.json','utf8')).filter(f=>f.nspname==='public'))await db.exec(f.def);
 await db.exec('create table if not exists public.reunion_cheques_entrega(id uuid primary key default gen_random_uuid(),cheque_id uuid,entregado boolean default false)');
 await db.exec(sql);await owner(db,"insert into control_permisos_cheques(user_id,puede_eliminar,otorgado_por) values($1,true,'FIXTURE') on conflict(user_id) do update set puede_eliminar=true",[ids.conta]);
 let sem=40;const seed=async(extra={})=>{const id=crypto.randomUUID();await db.exec('reset role;alter table public.cheques disable trigger user');try{await db.query("insert into cheques(id,obra_id,trabajador_id,nombre,semana,tipo_pago,estatus,importe,num_cheque,consecutivo) values($1,$2,$3,'PERSONA FICTICIA',$4,'FINIQUITO',$5,100,$6,$7)",[id,extra.obra||ids.obra,extra.worker||ids.w,'S'+(++sem),extra.estatus||'PENDIENTE',extra.numero||'',extra.consecutivo||'']);}finally{await db.exec('alter table public.cheques enable trigger user');}return(await owner(db,'select * from cheques where id=$1',[id])).rows[0];};
 const edit=async(c,key='admin',nuevo=110.25,confirm=true,motivo='Error de captura del importe')=>{await actor(db,key);return(await db.query('select public.control_corregir_importe_cheque($1,$2,$3,$4,$5,$6) d',[c.id,c.importe,nuevo,c.updated_at,motivo,confirm])).rows[0].d;};
 let c=await seed();await no(edit(c,'consulta'),/permiso/);await no(edit(c,'jire'),/permiso/);await no(edit(c,'admin',110,false),/Confirma/);await no(edit(c,'admin',110,true,'error'),/Describe/);
 for(const amount of [0,-1,1.234,'NaN','Infinity'])await no(edit(c,'admin',amount),/positivo/);
 await no(edit({...c,importe:99}),/cambió/);await no(edit({...c,updated_at:'2020-01-01'}),/cambió/);await no(edit(c,'admin',100),/no cambió/);
 const out=await edit(c,'conta');ok(Number(out.importe)===110.25&&out.estatus==='PENDIENTE','Contadora autorizada');
 const after=(await owner(db,'select * from cheques where id=$1',[c.id])).rows[0];ok(after.trabajador_id===c.trabajador_id&&after.semana===c.semana&&after.num_cheque===''&&after.consecutivo==='','Identidad, semana y folios conservados');
 ok(Number((await owner(db,"select count(*) n from control_bitacora where entidad_id=$1 and accion='CORREGIR_IMPORTE_CHEQUE_PENDIENTE'",[c.id])).rows[0].n)===1,'Auditoría única');await no(edit(c),/cambió/);
 c=await seed();await owner(db,'update control_permisos_cheques set puede_eliminar=false where user_id=$1',[ids.conta]);await no(edit(c,'conta'),/permiso/);await owner(db,'update control_permisos_cheques set puede_eliminar=true where user_id=$1',[ids.conta]);
 for(const extra of [{estatus:'EXPEDIDO'},{estatus:'ENTREGADO'},{estatus:'CANCELADO'},{numero:'123'},{consecutivo:'001'}]){const c=await seed(extra);await no(edit(c),/pendientes sin/);}
 c=await seed();await owner(db,'insert into reunion_cheques_entrega(cheque_id,entregado) values($1,true)',[c.id]);await no(edit(c),/entrega/);
 c=await seed();const cierre=crypto.randomUUID(),version=crypto.randomUUID(),obligacion=crypto.randomUUID(),evidencia=crypto.randomUUID(),aplicacion=crypto.randomUUID(),week=Number(c.semana.slice(1));
 await owner(db,'alter table control_cierres_nomina disable trigger user');
 try{await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,estado,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,$3,'SEMANAL','AUTORIZADO','FICTICIO','FICTICIO','{}',$4)",[cierre,ids.obra,week,ids.admin]);}finally{await owner(db,'alter table control_cierres_nomina enable trigger user');}
 await owner(db,"insert into control_cierre_versiones(id,cierre_origen,obra_id,version,estado_origen,snapshot,snapshot_sha256,fuente_sha256,actor_id) values($1,$2,$3,1,'AUTORIZADO','{}','FICTICIO','FICTICIO',$4)",[version,cierre,ids.obra,ids.admin]);
 await owner(db,"insert into control_obligaciones_pago(id,cierre_origen,cierre_id,version_id,obra_id,trabajador_id,semana,tipo,nombre,importe,metodo) values($1,$2,$2,$3,$4,$5,$6,'FINIQUITO','PERSONA FICTICIA',100,'CHEQUE')",[obligacion,cierre,version,ids.obra,ids.w,week]);
 await owner(db,"insert into control_evidencias_pago(id,obra_id,trabajador_id,semana,clave,importe,cheque_id) values($1,$2,$3,$4,$5,100,$6)",[evidencia,ids.obra,ids.w,week,'FICTICIO-'+c.id,c.id]);
 await owner(db,'alter table control_pago_aplicaciones disable trigger user');
 try{await owner(db,"insert into control_pago_aplicaciones(id,obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo) values($1,$2,$3,$4,$5,100,$6,$1,'Aplicación ficticia de prueba')",[aplicacion,ids.obra,obligacion,evidencia,version,ids.admin]);}finally{await owner(db,'alter table control_pago_aplicaciones enable trigger user');}
 await no(edit(c),/pagos vinculados/);ok(Number((await owner(db,'select importe from cheques where id=$1',[c.id])).rows[0].importe)===100,'Cheque vinculado permanece intacto');
 c=await seed();await actor(db,'jire');await db.query('update cheques set importe=120 where id=$1',[c.id]);ok(Number((await owner(db,'select importe from cheques where id=$1',[c.id])).rows[0].importe)===100,'RLS no modifica otra obra');
 c=await seed({obra:ids.otra,worker:ids.wOtra});await actor(db,'jire');await no(db.query('update cheques set importe=120 where id=$1',[c.id]),/administrador|contadora|policy|permiso/);
 c=await seed({obra:ids.otra,worker:ids.wOtra});ok(Number((await edit(c,'conta')).importe)===110.25,'Ambas empresas por alcance');
 await owner(db,"insert into control_permisos_cheques(user_id,puede_eliminar,otorgado_por) values($1,true,'FIXTURE') on conflict(user_id) do update set puede_eliminar=true",[ids.jire]);
 c=await seed();await no(edit(c,'jire'),/centro|alcance|autorizado/);
 await actor(db,null);await no(db.query('select public.control_corregir_importe_cheque($1,100,110,now(),$2,true)',[c.id,'Intento anónimo']),/permission denied/);
 console.log('PASS importe manual: '+n+' controles PostgreSQL de autorización, alcance, captura física, evidencia, versión, precisión y auditoría.');
 }finally{await db.close();}})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
