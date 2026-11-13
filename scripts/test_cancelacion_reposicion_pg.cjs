// PostgreSQL aislado con funciones capturadas del servidor y datos ficticios.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=require('./soporte_flujo_pg.cjs'),privado=path.resolve(__dirname,'../../funciones_vivas.json');
const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_cancelacion_reposicion_atomica.sql'));
if(!migration||!fs.existsSync(privado)){console.log('ALCANCE: cancelación/reposición PostgreSQL requiere contratos SQL privados; no ejecutada en CI público.');process.exit(0);}
let pruebas=0;const ok=(v,m)=>{assert(v,m);pruebas++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);pruebas++;};
(async()=>{const db=await base.makeDatabase(),{ids,owner,actor}=base;try{
 const cols=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../columnas.json')));
 for(const c of cols){const existe=(await owner(db,'select 1 from information_schema.columns where table_schema=$1 and table_name=$2 and column_name=$3',[c.table_schema,c.table_name,c.column_name])).rows.length;if(existe)continue;
  const tabla=(await owner(db,'select to_regclass($1) t',[c.table_schema+'.'+c.table_name])).rows[0].t;
  if(!tabla)await db.exec('create table '+c.table_schema+'.'+c.table_name+'(id uuid primary key default gen_random_uuid())');
  if(c.column_name==='id')continue;await db.exec('alter table '+c.table_schema+'.'+c.table_name+' add column '+c.column_name+' '+c.data_type+(c.column_default?' default '+c.column_default:''));
 }
 await db.exec(`create table if not exists control_lotes_cheques_nomina(id uuid,obra_id uuid,semana integer,detalle jsonb);
 create table if not exists control_banco_resoluciones(id uuid,cheque_id uuid,actor_id uuid,estado text,propuesta jsonb);
 create table if not exists reunion_cheques_entrega(id uuid primary key default gen_random_uuid(),cheque_id uuid,entregado boolean,entregado_en timestamptz,entregado_por uuid);
 create table if not exists historial(id uuid primary key default gen_random_uuid(),trabajador_id uuid,trabajador_nombre text,obra_id uuid,usuario text,accion text,datos_antes jsonb,datos_despues jsonb);
 create function platinum_internal.banco_puede_conciliar(o uuid) returns boolean language sql as $$select public.app_puede_escribir() and public.app_ve_obra(o)$$;
 create function platinum_internal.banco_huella_cheque(q cheques) returns text language sql as $$select md5(to_jsonb(q)::text)$$;
 create function platinum_internal.neto_respaldo(o uuid,t uuid,s integer,tp text,c uuid) returns jsonb language sql as $$select jsonb_build_object('estado','COINCIDE','neto',100.01)$$;`);
 // Las matemáticas y lecturas fiscales no se cambian: aquí se aísla el instrumento.
 const defs=JSON.parse(fs.readFileSync(privado,'utf8'));
 for(const name of ['autorizar','bloquear','auditar','folio_canonico','es_correccion_folios','es_captura_cheque_existente','es_reposicion_cheque','cheque_eliminacion_fisica_permitida','banco_cancelacion_permitida','cheque_estado_fisico','reposicion_contexto_validar','validar_neto_cheque_noi','proteger_evidencia','guardar_folios_fisicos','control_proteger_cheque_finiquito','control_bloquear_cheque_sin_servicio','pagos_nomina_guardar','registrar_cheque','aplicar_pago','fn_cheque_unico_por_semana']){
  const d=defs.find(d=>d.proname===name);assert(d,name);await db.exec(d.definicion+';');
 }
 let orden=1;
 async function seed(estatus='EXPEDIDO',tipo='FINIQUITO',sem=orden++){
  const id=crypto.randomUUID();await owner(db,"insert into cheques(id,obra_id,trabajador_id,no_trab,nombre,puesto,contratista,curp,semana,periodo,importe,tipo_pago,num_cheque,consecutivo,estatus,observaciones,creado_por) values($1,$2,$3,7,'PERSONA HISTÓRICA','OFICIO ORIGINAL','CONTRATISTA ORIGINAL','PRUP900101HHGXXX01',$4,'PERIODO ORIGINAL',100.01,$5,$6,$7,$8,'NOTA ORIGINAL','usuario original')",[id,ids.obra,ids.w,'S'+sem,tipo,'FOLIO'+sem,String(sem),estatus]);return(await owner(db,'select * from cheques where id=$1',[id])).rows[0];
 }
 // Sembrar antes de instalar triggers vivos evita fabricar un pago durante el fixture.
 await db.exec('alter table cheques disable trigger user');
 const actuales=[await seed(),await seed('ENTREGADO'),await seed('EXPEDIDO','CHEQUE'),await seed('ENTREGADO','CHEQUE')];
 const fallo=await seed(),doble=await seed(),pago=await seed(),cambio=await seed(),transferido=await seed();
 const concurrente=await seed('EXPEDIDO','FINIQUITO',10),aplicado=await seed('ENTREGADO','FINIQUITO',12),actual=await seed('EXPEDIDO','CHEQUE',31),jire=await seed('EXPEDIDO','FINIQUITO',13);
 await owner(db,'update cheques set obra_id=$1,trabajador_id=$2 where id=$3',[ids.otra,ids.wOtra,jire.id]);jire.obra_id=ids.otra;jire.trabajador_id=ids.wOtra;
 await owner(db,"update obras set fecha_inicio=(now() at time zone 'America/Mexico_City')::date-extract(isodow from now() at time zone 'America/Mexico_City')::integer+1-210 where id=$1",[ids.obra]);
 const cierre=crypto.randomUUID(),version=crypto.randomUUID(),obligacion=crypto.randomUUID(),evidencia=crypto.randomUUID(),aplicacion=crypto.randomUUID();
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,estado,formula_version,snapshot,snapshot_sha256,creado_por) values($1,$2,12,'PAGADO','FICTICIO','{\"hasta\":\"2026-07-05\"}','FOTOGRAFIA-INMUTABLE',$3)",[cierre,ids.obra,ids.admin]);
 await owner(db,"insert into control_cierre_versiones(id,cierre_origen,obra_id,version,estado_origen,snapshot,snapshot_sha256,fuente_sha256,actor_id) values($1,$2,$3,1,'PAGADO','{}','SELLADO','FUENTE',$4)",[version,cierre,ids.obra,ids.admin]);
 await owner(db,'insert into control_flujo_cierres(cierre_id,obra_id,sucio,version_id) values($1,$2,false,$3)',[cierre,ids.obra,version]);
 await owner(db,"insert into control_obligaciones_pago(id,cierre_origen,cierre_id,version_id,obra_id,trabajador_id,semana,tipo,nombre,importe,metodo) values($1,$2,$2,$3,$4,$5,12,'FINIQUITO','PERSONA HISTÓRICA',100.01,'CHEQUE')",[obligacion,cierre,version,ids.obra,ids.w]);
 await owner(db,'update cheques set cierre_id=$1 where id=$2',[cierre,aplicado.id]);aplicado.cierre_id=cierre;
 await owner(db,"insert into control_evidencias_pago(id,obra_id,trabajador_id,semana,clave,importe,cheque_id) values($1,$2,$3,12,$4,100.01,$5)",[evidencia,ids.obra,ids.w,'CHEQUE:'+aplicado.id,aplicado.id]);
 await owner(db,"insert into control_pago_aplicaciones(id,obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo) values($1,$2,$3,$4,$5,100.01,$6,$7,'Aplicación original del cheque')",[aplicacion,ids.obra,obligacion,evidencia,version,ids.admin,crypto.randomUUID()]);
 await owner(db,"update trabajadores set estatus='BAJA',obra_id=$1,no_trab=99,contratista='CONTRATISTA ACTUAL DISTINTO' where id=$2",[ids.otra,ids.w]);
 const beforeCierre=(await owner(db,'select to_jsonb(t) j from control_cierres_nomina t where id=$1',[cierre])).rows[0].j;
 const beforeObligacion=(await owner(db,'select to_jsonb(t) j from control_obligaciones_pago t where id=$1',[obligacion])).rows[0].j;
 await owner(db,"insert into reunion_cheques_entrega(cheque_id,entregado,entregado_en,entregado_por) values($1,true,now(),$2)",[actuales[1].id,ids.admin]);
 const beforeEntrega=(await owner(db,'select to_jsonb(t) j from reunion_cheques_entrega t')).rows[0].j;
 const beforePersonal=(await owner(db,"select md5(string_agg(to_jsonb(t)::text,',' order by id)) h from trabajadores t")).rows[0].h;
 await db.exec('alter table cheques enable trigger user');
 await db.exec("create unique index if not exists cheques_reposicion_activa_unica on cheques(reemplaza_cheque_id) where reemplaza_cheque_id is not null and not coalesce(eliminado,false) and estatus<>'CANCELADO'");
 await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 for(const [name,fn,timing]of [['a0_reposicion_cancelar_guard','platinum_internal.reposicion_cancelar_guard','BEFORE UPDATE'],['a0_control_folios_fisicos','platinum_internal.guardar_folios_fisicos','BEFORE INSERT OR UPDATE'],['a_control_evidencia_guard','platinum_internal.proteger_evidencia','BEFORE UPDATE OR DELETE'],['aa_control_estado_fisico','platinum_internal.cheque_estado_fisico','BEFORE INSERT OR UPDATE'],['ab_reposicion_contexto','platinum_internal.reposicion_contexto_validar','BEFORE INSERT OR UPDATE'],['b_control_nomina_confirmada','platinum_internal.pagos_nomina_guardar','BEFORE INSERT OR UPDATE'],['trg_control_bloquear_cheque_sin_servicio','public.control_bloquear_cheque_sin_servicio','BEFORE INSERT OR UPDATE'],['trg_control_validar_neto_cheque_noi','platinum_internal.validar_neto_cheque_noi','BEFORE INSERT OR UPDATE'],['trg_proteger_cheque_finiquito','public.control_proteger_cheque_finiquito','BEFORE INSERT OR UPDATE'],['trg_cheque_unico','public.fn_cheque_unico_por_semana','BEFORE INSERT OR UPDATE'],['y_control_registrar_cheque','platinum_internal.registrar_cheque','AFTER INSERT OR UPDATE']]){
  await db.exec('drop trigger if exists '+name+' on cheques;create trigger '+name+' '+timing+' on cheques for each row execute function '+fn+'()');
 }
 const call=async(q,a='CONFIRMAR',extra={},user='conta')=>{await actor(db,user);return(await db.query('select control_cancelar_reponer_cheque($1,$2::jsonb) r',[a,JSON.stringify({cheque_id:q.id,version:q.updated_at,operacion_id:crypto.randomUUID(),motivo:'Banco devuelve físico',confirmacion:'CANCELAR Y CREAR REPOSICION',...extra})])).rows[0].r;};
 for(const q of actuales){
  const p=await call(q,'PREPARAR');eq(p.estado,'LISTO');const r=await call(q);eq(r.estado,'COMPLETO');eq(r.original.estatus,'CANCELADO');eq(r.reemplazo.estatus,'PENDIENTE');
  for(const k of ['obra_id','trabajador_id','no_trab','nombre','puesto','contratista','curp','semana','periodo','importe','tipo_pago','cierre_id','lote_nomina_id'])eq(r.reemplazo[k]??null,r.original[k]??null,'Contexto '+k);
  eq(r.original.num_cheque,q.num_cheque);eq(r.original.consecutivo,q.consecutivo);eq(r.reemplazo.num_cheque,'');eq(r.reemplazo.consecutivo,'');eq(r.reemplazo.reemplaza_cheque_id,q.id);
  const retry=await call(q);eq(retry.reemplazo.id,r.reemplazo.id,'Reintento de otra sesión reutiliza');eq((await owner(db,"select count(*)::integer n from cheques where reemplaza_cheque_id=$1 and estatus<>'CANCELADO'",[q.id])).rows[0].n,1);
 }
 eq((await owner(db,'select to_jsonb(t) j from reunion_cheques_entrega t')).rows[0].j,beforeEntrega,'Entrega original intacta');
 eq((await owner(db,"select md5(string_agg(to_jsonb(t)::text,',' order by id)) h from trabajadores t")).rows[0].h,beforePersonal);
 const presente=await call(actual);eq(presente.reemplazo.semana,'S31','Semana actual');
 const deJire=await call(jire,'CONFIRMAR',{},'jire');eq(deJire.reemplazo.obra_id,ids.otra,'Operador autorizado de la otra empresa, sin VIP');
 const simultaneos=await Promise.all([call(concurrente),call(concurrente)]);eq(simultaneos[0].reemplazo.id,simultaneos[1].reemplazo.id,'Dos peticiones sobre el mismo físico producen un sucesor');
 await owner(db,`create function public.fallo_cobertura() returns trigger language plpgsql as $$begin if new.reemplaza_cheque_id='${aplicado.id}'::uuid then raise exception 'Fallo posterior al retiro';end if;return new;end$$`);
 await db.exec('create trigger zz_fallo_cobertura before insert on cheques for each row execute function fallo_cobertura()');await assert.rejects(call(aplicado),/Fallo posterior al retiro/);pruebas++;
 eq((await owner(db,'select retirado_en from control_pago_aplicaciones where id=$1',[aplicacion])).rows[0].retirado_en,null,'Rollback restaura también la cobertura original');
 eq((await owner(db,'select estatus from cheques where id=$1',[aplicado.id])).rows[0].estatus,'ENTREGADO');await db.exec('drop trigger zz_fallo_cobertura on cheques');
 const cubierta=await call(aplicado);eq(cubierta.reemplazo.cierre_id,cierre,'Conserva cierre histórico pagado');
 const retirado=(await owner(db,'select * from control_pago_aplicaciones where id=$1',[aplicacion])).rows[0];ok(retirado.retirado_en&&retirado.retirado_por===ids.conta,'Retiro auditado del cheque entregado por contadora');
 const saldo=async()=>(await owner(db,'select o.importe-coalesce(sum(a.importe) filter(where a.retirado_en is null),0) saldo from control_obligaciones_pago o left join control_pago_aplicaciones a on a.obligacion_id=o.id where o.id=$1 group by o.id',[obligacion])).rows[0].saldo;
 eq(Number(await saldo()),100.01,'Una deuda, pendiente de nuevo instrumento');
 await owner(db,`create or replace function platinum_internal.diagnostico(p_cierre uuid,p_trabajador uuid default null) returns jsonb language sql as $$select '{"pendientes":0,"fuera_snapshot":0}'::jsonb$$`);
 await actor(db,'conta');await db.query("update cheques set num_cheque='REEMPLAZO-HISTORICO',consecutivo='8001',estatus='EXPEDIDO' where id=$1",[cubierta.reemplazo.id]);
 eq(Number(await saldo()),0,'La expedición histórica recupera una sola cobertura');
 eq((await owner(db,'select count(*)::integer n from control_pago_aplicaciones where obligacion_id=$1 and retirado_en is null',[obligacion])).rows[0].n,1,'No suma original y sustituto');
 const hijo=(await owner(db,'select * from cheques where id=$1',[cubierta.reemplazo.id])).rows[0],nieto=await call(hijo);eq(nieto.reemplazo.reemplaza_cheque_id,hijo.id,'Cadena de reposiciones');eq(Number(await saldo()),100.01);
 const retryCadena=await call(aplicado);eq(retryCadena.reemplazo.id,hijo.id,'Reintento del original conserva su eslabón y no crea otra deuda');
 eq((await owner(db,'select to_jsonb(t) j from control_cierres_nomina t where id=$1',[cierre])).rows[0].j,beforeCierre,'Fotografía/estado pagado intactos');
 eq((await owner(db,'select to_jsonb(t) j from control_obligaciones_pago t where id=$1',[obligacion])).rows[0].j,beforeObligacion,'Obligación e importe autorizados intactos');
 // Fallo del INSERT: la cancelación y su auditoría no pueden quedar aplicadas.
 await owner(db,`create function public.fallo_reposicion() returns trigger language plpgsql as $$begin if new.reemplaza_cheque_id='${fallo.id}'::uuid then raise exception 'Fallo de guardado simulado';end if;return new;end$$`);
 await db.exec('create trigger zz_fallo before insert on cheques for each row execute function fallo_reposicion()');await assert.rejects(call(fallo),/Fallo de guardado/);pruebas++;
 eq((await owner(db,'select estatus from cheques where id=$1',[fallo.id])).rows[0].estatus,'EXPEDIDO');eq((await owner(db,'select count(*)::integer n from platinum_internal.cheque_reposicion_operaciones where original_id=$1',[fallo.id])).rows[0].n,0);await db.exec('drop trigger zz_fallo on cheques');
 await assert.rejects(call(cambio,'CONFIRMAR',{version:'2000-01-01T00:00:00Z'}),/cambió/);pruebas++;
 await assert.rejects(call(cambio,'CONFIRMAR',{},'consulta'),/permiso/);pruebas++;
 await assert.rejects(call(cambio,'CONFIRMAR',{},'jire'),/permiso/);pruebas++;
 await assert.rejects(call(cambio,'CONFIRMAR',{},null),/permission denied|sesión/);pruebas++;
 const same=crypto.randomUUID(),r1=await call(doble,'CONFIRMAR',{operacion_id:same}),r2=await call(doble,'CONFIRMAR',{operacion_id:same});eq(r1.reemplazo.id,r2.reemplazo.id,'Doble clic idempotente');
 // Pago bancario realmente registrado: se identifica y queda sin cambios.
 await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,estado,importe,folio_lote,fecha_pago) values($1,$2,$3,'TRANSFERENCIA','EXITOSO',100.01,'OPERACION-REAL-FICTICIA',current_date)",[ids.obra,ids.w,pago.semana]);
 const block=await call(pago);eq(block.estado,'BLOQUEADO_PAGO');ok(block.operaciones.some(x=>x.folio==='OPERACION-REAL-FICTICIA'&&x.pago_id),'Identifica comprobante concreto');eq((await owner(db,'select estatus from cheques where id=$1',[pago.id])).rows[0].estatus,'EXPEDIDO');
 // Contrato de folios: aun cancelado, el documento conserva ocupados sus números.
 await actor(db,'conta');await assert.rejects(db.query('update cheques set num_cheque=$1 where id=$2',[actuales[0].num_cheque,r1.reemplazo.id]),/ocupado/);pruebas++;
 await assert.rejects(db.query("update cheques set estatus='CANCELADO' where id=$1",[cambio.id]),/Cancelar y crear reposición/);pruebas++;
 await assert.rejects(db.query('update cheques set contratista=$1 where id=$2',['CONTRATISTA ACTUAL',r1.reemplazo.id]),/conservar persona/);pruebas++;
 await assert.rejects(db.query("select * from platinum_internal.cheque_reposicion_operaciones"),/permission denied/);pruebas++;
 // El recorrido existente por transferencia mantiene su motivo y nunca crea reposición.
 const banco=crypto.randomUUID();await owner(db,"insert into control_banco_resoluciones(id,cheque_id,actor_id,estado,propuesta) select $1,id,$2,'PROCESANDO',jsonb_build_object('cheque_huella',platinum_internal.banco_huella_cheque(q),'accion_cheque','CANCELAR_CONFIRMADO') from cheques q where id=$3",[banco,ids.conta,transferido.id]);
 await owner(db,"select set_config('platinum.banco_cancelacion',$1,false)",[banco]);await owner(db,"update cheques set estatus='CANCELADO',observaciones='Sustituido por transferencia conciliada' where id=$1",[transferido.id]);
 const trans=await call(transferido);eq(trans.estado,'SUSTITUIDO_TRANSFERENCIA');eq((await owner(db,'select count(*)::integer n from cheques where reemplaza_cheque_id=$1',[transferido.id])).rows[0].n,0);
 const funciones=(await owner(db,"select n.nspname esquema,p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosrc,p.proacl::text acl,p.proconfig,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','platinum_internal') and (p.proname like 'reposicion_%' or p.proname in('cancelar_reponer_cheque','control_cancelar_reponer_cheque','control_proteger_cheque_finiquito','guardar_folios_fisicos','registrar_cheque','aplicar_pago','control_bloquear_cheque_sin_servicio')) order by 1,2")).rows;
 fs.writeFileSync(path.resolve(__dirname,'../../contratos_probados.json'),JSON.stringify(funciones,null,2));
 console.log('PASS '+pruebas+' comprobaciones PostgreSQL de cancelación/reposición atómica.');
 }finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
