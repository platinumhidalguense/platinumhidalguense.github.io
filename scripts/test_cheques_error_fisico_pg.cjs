// PostgreSQL aislado; personas y folios ficticios. No modifica producción.
const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('crypto'),base=require('./soporte_cierres_actuales_pg.cjs');
const suffix='_cheques_error_fisico_auditado.sql',file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith(suffix));
const sql=fs.readFileSync(file?'supabase/migrations/'+file:process.argv[2]||'work/cheques_fisicos_20261028/propuesta.sql','utf8');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},no=async(p,re)=>{await assert.rejects(p,re);n++;};
(async()=>{const db=await base.makeDatabase();const{ids,owner,actor}=base;try{
 const fisico=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_cheques_cancelacion_fisica_y_papelera.sql'));
 if(!(await db.query("select to_regprocedure('platinum_internal.cheque_estado_fisico()') is not null v")).rows[0].v)await db.exec(fs.readFileSync('supabase/migrations/'+fisico,'utf8'));
 for(const f of JSON.parse(fs.readFileSync('work/cheques_fisicos_20261028/permisos_antes.json','utf8')).filter(f=>f.nspname==='public'))await db.exec(f.def);
 const prev=JSON.parse(fs.readFileSync('work/cheques_fisicos_20261028/antes.json','utf8'))[0].jsonb_build_object.funciones.find(f=>f.name==='control_eliminar_cheque');await db.exec(prev.def);
 await db.exec('grant execute on function public.control_eliminar_cheque(uuid,text) to authenticated');
 await db.exec('create table if not exists public.reunion_cheques_entrega(id uuid primary key default gen_random_uuid(),cheque_id uuid,entregado boolean default false)');
 await db.exec(sql);
 await owner(db,"insert into public.control_permisos_cheques(user_id,puede_eliminar,otorgado_por) values($1,true,'FIXTURE') on conflict(user_id) do update set puede_eliminar=true",[ids.conta]);
 let semana=25;
 const seed=async({status='EXPEDIDO',numero='FISICO-ERRONEO',consecutivo='F-001',obra=ids.obra,worker=ids.w,sem='S'+(++semana)}={})=>{
  const q=crypto.randomUUID();await db.exec('reset role');await db.exec('alter table public.cheques disable trigger user');
  try{await db.query("insert into public.cheques(id,obra_id,trabajador_id,nombre,semana,importe,tipo_pago,estatus,num_cheque,consecutivo) values($1,$2,$3,'PERSONA FICTICIA',$4,100,'FINIQUITO',$5,$6,$7)",[q,obra,worker,sem,status,numero,consecutivo]);}finally{await db.exec('alter table public.cheques enable trigger user');}
  return {q,numero,consecutivo};
 };
 const remove=async(x,key='admin',confirm=true,motivo='Error de dedo en el cheque físico')=>{await actor(db,key);return(await db.query('select public.control_eliminar_cheque_fisico($1,$2,$3,$4,$5) d',[x.q,motivo,x.numero,x.consecutivo,confirm])).rows[0].d;};
 let x=await seed();await no(remove(x,'consulta'),/permiso/);await no(remove(x,'jire'),/permiso|centro/);
 await no(remove(x,'admin',false),/Confirma/);await no(remove(x,'admin',true,'error'),/Describe/);
 await no(remove({...x,numero:'CAMBIO'}),/Cambió el número/);
 await actor(db,'admin');await no(db.query('select public.control_eliminar_cheque($1,$2)',[x.q,'Ruta anterior física no autorizada']),/número o consecutivo/);
 await db.exec('begin');try{await db.query("select set_config('platinum.eliminar_cheque_fisico_id',$1,true)",[x.q]);await no(db.query("update public.cheques set eliminado=true,motivo_eliminado='No usar ruta directa' where id=$1",[x.q]),/número o consecutivo/);}finally{await db.exec('rollback');}
 const before=(await owner(db,'select * from public.cheques where id=$1',[x.q])).rows[0];const r=await remove(x,'conta');eq(r.eliminado,true);eq(r.estatus_archivo,'CANCELADO');
 const after=(await owner(db,'select * from public.cheques where id=$1',[x.q])).rows[0];eq(after.num_cheque,before.num_cheque);eq(after.consecutivo,before.consecutivo);eq(Number(after.importe),Number(before.importe));eq(after.trabajador_id,before.trabajador_id);eq(after.eliminado_por,'conta@prueba.test');
 await no(remove(x),/ya eliminado|no disponible/);
 eq(Number((await owner(db,"select count(*) n from public.control_bitacora where entidad_id=$1 and accion='ELIMINAR_CHEQUE_FISICO_ERRONEO'",[x.q])).rows[0].n),1);
 x=await seed({status:'ENTREGADO'});await no(remove(x),/entregado/);
 x=await seed();await owner(db,'insert into public.reunion_cheques_entrega(cheque_id,entregado) values($1,true)',[x.q]);await no(remove(x),/entregado/);
 x=await seed({status:'PENDIENTE',numero:'PARCIAL',consecutivo:''});eq((await remove(x)).eliminado,true);
 x=await seed({status:'CANCELADO'});eq((await remove(x)).eliminado,true);
 x=await seed({status:'PENDIENTE',numero:'',consecutivo:''});await no(remove(x),/Sin folios/);await actor(db,'conta');eq((await db.query('select public.control_eliminar_cheque($1,$2) d',[x.q,'Captura sin folios, ruta existente'])).rows[0].d.eliminado,true);
 x=await seed({obra:ids.otra,worker:ids.wOtra});eq((await remove(x,'conta')).eliminado,true,'Ambas empresas');
 const vinculada=async(estado='AUTORIZADO')=>{
  const v=await seed(),c=crypto.randomUUID(),version=crypto.randomUUID(),obligacion=crypto.randomUUID(),evidencia=crypto.randomUUID(),aplicacion=crypto.randomUUID();
  const sem=Number((await owner(db,'select semana from cheques where id=$1',[v.q])).rows[0].semana.slice(1));
  await owner(db,'alter table public.control_cierres_nomina disable trigger user');
  try{await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,estado,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,$3,'SEMANAL',$4,'FICTICIO','FICTICIO','{}',$5)",[c,ids.obra,sem,estado,ids.admin]);}finally{await owner(db,'alter table public.control_cierres_nomina enable trigger user');}
  await owner(db,"insert into control_cierre_versiones(id,cierre_origen,obra_id,version,estado_origen,snapshot,snapshot_sha256,fuente_sha256,actor_id) values($1,$2,$3,1,$4,'{}','FICTICIO','FICTICIO',$5)",[version,c,ids.obra,estado,ids.admin]);
  await owner(db,"insert into control_obligaciones_pago(id,cierre_origen,cierre_id,version_id,obra_id,trabajador_id,semana,tipo,nombre,importe,metodo) values($1,$2,$2,$3,$4,$5,$6,'FINIQUITO','PERSONA FICTICIA',100,'CHEQUE')",[obligacion,c,version,ids.obra,ids.w,sem]);
  await owner(db,"insert into control_evidencias_pago(id,obra_id,trabajador_id,semana,clave,importe,cheque_id) values($1,$2,$3,$4,$5,100,$6)",[evidencia,ids.obra,ids.w,sem,'FICTICIO-'+v.q,v.q]);
  await owner(db,'alter table public.control_pago_aplicaciones disable trigger user');
  try{await owner(db,"insert into control_pago_aplicaciones(id,obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo) values($1,$2,$3,$4,$5,100,$6,$1,'Aplicación sintética para regresión')",[aplicacion,ids.obra,obligacion,evidencia,version,ids.admin]);}finally{await owner(db,'alter table public.control_pago_aplicaciones enable trigger user');}
  return {...v,c,version,obligacion,evidencia,aplicacion,sem};
 };
 const linked=await vinculada();await no(remove(linked,'conta'),/administrador/);
 eq((await owner(db,'select retirado_en from control_pago_aplicaciones where id=$1',[linked.aplicacion])).rows[0].retirado_en,null);
 const respaldo=(await owner(db,'select to_jsonb(e) j from control_evidencias_pago e where id=$1',[linked.evidencia])).rows[0].j;
 eq((await remove(linked,'admin')).aplicaciones_retiradas,1);
 eq((await owner(db,'select retirado_por from control_pago_aplicaciones where id=$1',[linked.aplicacion])).rows[0].retirado_por,ids.admin);
 eq(Number((await owner(db,'select coalesce(sum(importe),0) aplicado from control_pago_aplicaciones where obligacion_id=$1 and retirado_en is null',[linked.obligacion])).rows[0].aplicado),0,'La obligación queda pendiente');
 eq((await owner(db,'select to_jsonb(e) j from control_evidencias_pago e where id=$1',[linked.evidencia])).rows[0].j,respaldo,'Evidencia original intacta');
 await owner(db,"insert into cheques(obra_id,trabajador_id,nombre,semana,importe,tipo_pago,estatus) values($1,$2,'PERSONA FICTICIA',$3,100,'FINIQUITO','PENDIENTE')",[ids.obra,ids.w,'S'+linked.sem]);
 eq(Number((await owner(db,'select count(*) n from cheques where obra_id=$1 and trabajador_id=$2 and semana=$3 and not eliminado',[ids.obra,ids.w,'S'+linked.sem])).rows[0].n),1,'Admite un reemplazo sin resucitar el cheque inválido');
 const pagado=await vinculada('PAGADO');await no(remove(pagado),/reapertura/);
 eq((await owner(db,'select eliminado from cheques where id=$1',[pagado.q])).rows[0].eliminado,false,'Rollback íntegro');
 eq((await owner(db,'select retirado_en from control_pago_aplicaciones where id=$1',[pagado.aplicacion])).rows[0].retirado_en,null);
 await actor(db,null);await no(db.query('select public.control_eliminar_cheque_fisico($1,$2,$3,$4,true)',[x.q,'Intento anónimo de eliminar',x.numero,x.consecutivo]),/permission denied/);
 console.log('PASS cheques con error físico: '+n+' controles PostgreSQL de permisos, folios, confirmación, entrega, rutas separadas y auditoría.');
 }finally{await db.close();}})().catch(e=>{console.error(e.message,e.where||'',e.internalQuery||'');process.exitCode=1;});
