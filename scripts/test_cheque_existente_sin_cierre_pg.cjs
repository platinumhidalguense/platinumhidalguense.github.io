// PostgreSQL aislado y personas ficticias; ninguna expedición real.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=require('./soporte_cierres_actuales_pg.cjs');let checks=0;
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_cheques_existentes_expedicion_independiente.sql'));
const sql=fs.readFileSync(migration?'supabase/migrations/'+migration:'work/cheques_sin_cierre_20261027/propuesta.sql','utf8');
(async()=>{const db=await base.makeDatabase();const{ids,owner,actor}=base;try{
 const installed=(await db.query("select to_regprocedure('platinum_internal.es_captura_cheque_existente(public.cheques,public.cheques)') is not null installed")).rows[0].installed;
 if(!installed){await db.exec('begin');await db.exec(sql);await db.exec('commit');}
 const equal=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
 const rejects=async(p,re)=>{await assert.rejects(p,re);checks++;};
 // Desactivar sólo la creación automática de nómina del fixture al SEMBRAR
 // un pendiente legado. Todas las guardas actúan al probar su expedición.
 const seed=async({obra=ids.obra,worker=ids.w,sem=26,type='FINIQUITO',amount=2000,pdf=true}={})=>{
  const q=crypto.randomUUID(),doc=crypto.randomUUID();const start='2026-03-30';
  await db.exec('reset role');await db.exec('alter table public.cheques disable trigger b_control_nomina_confirmada');
  try{await owner(db,"insert into cheques(id,obra_id,trabajador_id,no_trab,nombre,semana,tipo_pago,estatus,importe,creado_por) values($1,$2,$3,1,'PERSONA FICTICIA',$4,$5,'PENDIENTE',$6,'FICTICIO')",[q,obra,worker,'S'+sem,type,amount]);}finally{await db.exec('reset role');await db.exec('alter table public.cheques enable trigger b_control_nomina_confirmada');}
  await owner(db,"update obras set fecha_inicio=$2 where id=$1",[obra,start]);
  if(pdf)await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,hash,nomina_neto,nomina_tipo,nomina_lector,periodo_inicio,periodo_fin) select $1::uuid,$2::uuid,$3::uuid,'RECIBO_NOMINA',$4,($1::uuid)::text||'.pdf',($1::uuid)::text,$5,$6,'FICTICIO',fecha_inicio+($7::integer-1)*7,fecha_inicio+($7::integer-1)*7+6 from obras where id=$2::uuid",[doc,obra,worker,'S'+sem,amount,type==='FINIQUITO'?'FINIQUITO':'NOMINA',sem]);
  return{q,doc,sem,obra,worker,amount,type};
 };
 const issue=async(x,key='conta',patch='')=>{await actor(db,key);return db.query("update cheques set estatus='EXPEDIDO',num_cheque=$2,consecutivo=$3"+patch+' where id=$1 returning estatus',[x.q,'FICTICIO-'+x.sem,'CONS-'+x.sem]);};
 for(const sem of [1,25,26,27,30,31,53]){
  const x=await seed({sem});equal((await issue(x)).rows[0].estatus,'EXPEDIDO','Toda semana, no sólo S26-S27');
  equal(Number((await owner(db,"select count(*) n from control_eventos_integracion where entidad_id=$1 and accion='REVISAR_VINCULACION_CHEQUE'",[x.q])).rows[0].n),1,'Vinculación pendiente visible y auditada');
  equal(Number((await owner(db,'select count(*) n from control_pago_aplicaciones')).rows[0].n),0,'No inventar obligación o pago por capturar cheque');
 }
 let x=await seed({sem:2,type:'CHEQUE'});equal((await issue(x)).rows[0].estatus,'EXPEDIDO','Nómina ya persistida no exige nuevo lote/cierre');
 x=await seed({sem:3,pdf:false});await rejects(issue(x),/exactamente|NOI|recibo/i);
 x=await seed({sem:4});await rejects(issue(x,'conta',',importe=1999.99'),/autoriza|coincidir|versión|neto/i);
 x=await seed({sem:5});await owner(db,"update documentos set periodo_inicio='2000-01-01' where id=$1",[x.doc]);await rejects(issue(x),/exactamente|periodo|recibo/i);
 x=await seed({sem:6});await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,estado,importe,folio_lote,fecha_pago) values($1,$2,'S6','TRANSFERENCIA','EXITOSO',2000,'FICTICIO',current_date)",[ids.obra,ids.w]);await rejects(issue(x),/transferencia|duplicar|pago/i);
 x=await seed({sem:7});await rejects(issue(x,'consulta'),/permiso|policy|seguridad/i);await rejects(issue(x,null),/permission|permiso/i);
 await actor(db,'jire');equal((await db.query("update cheques set estatus='EXPEDIDO',num_cheque='OTRA',consecutivo='OTRA' where id=$1 returning id",[x.q])).rows.length,0,'Otro alcance no accede');
 x=await seed({sem:8,obra:ids.otra,worker:ids.wOtra});equal((await issue(x,'jire')).rows[0].estatus,'EXPEDIDO','JIRE también usa la excepción de captura, con su alcance');
 x=await seed({sem:9});await actor(db,'conta');await rejects(db.query("update cheques set estatus='EXPEDIDO',num_cheque='SIN-CONSEC' where id=$1",[x.q]),/autoriza|cierre|consecutivo/i);
 // El cierre puede existir en borrador: PDF o NOI respaldan al trabajador,
 // no se exige conciliación de todas las demás personas para llenar su cheque.
 const closure=async(x)=>{const s=base.snapshot(x.worker,x.amount);s.semana=x.sem;
  const desde=new Date(Date.parse('2026-03-30T12:00:00Z')+(x.sem-1)*7*86400000).toISOString().slice(0,10),hasta=new Date(Date.parse(desde+'T12:00:00Z')+6*86400000).toISOString().slice(0,10);
  s.desde=desde;s.hasta=hasta;s.items[0].tipo='FINIQUITO';s.items[0].metodo_pago='CHEQUE';s.modelo.filas[0].fin=true;s.modelo.filas[0].pago='CHEQUE';s.total_nomina=0;s.total_finiquitos=x.amount;
  const cid=crypto.randomUUID();await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por,archivo_noi) values($1,$2,$3,'SEMANAL','FICTICIO','INICIAL',$4,$5,'FICTICIO.xlsx')",[cid,x.obra,x.sem,JSON.stringify(s),ids.conta]);
  await owner(db,'update cheques set cierre_id=$2 where id=$1',[x.q,cid]);return{cid,s};};
 x=await seed({sem:10});const z=await closure(x);equal((await issue(x)).rows[0].estatus,'EXPEDIDO','Cierre borrador no bloquea captura');equal((await owner(db,'select estado from control_cierres_nomina where id=$1',[z.cid])).rows[0].estado,'BORRADOR','Capturar no autoriza');
 x=await seed({sem:11,pdf:false});const noi=await closure(x);
 await owner(db,"insert into control_conciliacion_noi(obra_id,cierre_id,trabajador_id,trabajador_numero,trabajador_nombre,tipo_calculo,metodo_pago,monto_platinum,monto_noi) values($1,$2,$3,1,'PERSONA FICTICIA','FINIQUITO','CHEQUE',2000,2000)",[x.obra,noi.cid,x.worker]);
 equal((await issue(x)).rows[0].estatus,'EXPEDIDO','NOI sin PDF también respalda captura de pendiente existente');
 x=await seed({sem:12});const mismatch=await closure(x);await owner(db,"insert into control_conciliacion_noi(obra_id,cierre_id,trabajador_id,trabajador_numero,trabajador_nombre,tipo_calculo,metodo_pago,monto_platinum,monto_noi) values($1,$2,$3,1,'PERSONA FICTICIA','FINIQUITO','CHEQUE',2000,1999.99)",[x.obra,mismatch.cid,x.worker]);await rejects(issue(x),/exactamente|NOI|recibo/i);
 await actor(db,'conta');await rejects(db.query("select platinum_internal.es_captura_cheque_existente(q,q) from cheques q limit 1"),/permission denied/i);
 equal(Number((await owner(db,"select count(*) n from control_cierres_nomina where estado<>'BORRADOR'")).rows[0].n),0,'No autorizar cierres por la expedición');
 console.log(`PASS ${checks} controles SQL de cheques existentes: semanas 1-53, ambas empresas, PDF, fuentes, permisos, números, importe, duplicados y vínculos pendientes sin pagos inventados.`);
}finally{await db.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
