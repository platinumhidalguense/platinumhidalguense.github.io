// Todas las personas, folios y operaciones son ficticios, en PostgreSQL aislado.
const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('crypto'),base=require('./soporte_cierres_actuales_pg.cjs');
const file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_conciliador_tabs_folios_fisicos.sql'));
(async()=>{const db=await base.makeDatabase(),{ids,owner,actor}=base;let n=0;try{
 const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');
 await db.exec('reset role;alter table cheques add column if not exists actualizado_por text;alter table cheques add column if not exists created_at timestamptz default now();');
 await db.exec(sql);
 let week=25;
 const seed=async(status='EXPEDIDO',num='100',cons='1',obra=ids.obra,trab=ids.w)=>{const id=crypto.randomUUID();await db.exec('reset role;alter table cheques disable trigger user');try{await db.query("insert into cheques(id,obra_id,trabajador_id,no_trab,nombre,semana,tipo_pago,estatus,importe,num_cheque,consecutivo,updated_at) values($1,$2,$3,1,'PERSONA FICTICIA',$7,'FINIQUITO',$4,100,$5,$6,now())",[id,obra,trab,status,num,cons,'S'+(++week)]);}finally{await db.exec('alter table cheques enable trigger user');}return(await owner(db,'select * from cheques where id=$1',[id])).rows[0];};
 const edit=async(q,num,cons,who='conta',version=q.updated_at)=>{await actor(db,who);return(await db.query('select public.control_corregir_folios_cheque($1,$2,$3,$4) r',[q.id,num,cons,version])).rows[0].r;};
 const no=async(p,re)=>{await assert.rejects(p,re);n++;};
 let q=await seed();const cierre=crypto.randomUUID(),version=crypto.randomUUID(),o=crypto.randomUUID(),e=crypto.randomUUID(),a=crypto.randomUUID();
 await owner(db,'alter table control_cierres_nomina disable trigger user');try{await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,estado,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,26,'SEMANAL','TIMBRADO','FICTICIO','FICTICIO','{}',$3)",[cierre,ids.obra,ids.admin]);}finally{await owner(db,'alter table control_cierres_nomina enable trigger user');}
 await owner(db,"insert into control_cierre_versiones(id,cierre_origen,obra_id,version,estado_origen,snapshot,snapshot_sha256,fuente_sha256,actor_id) values($1,$2,$3,1,'TIMBRADO','{}','FICTICIO','FICTICIO',$4)",[version,cierre,ids.obra,ids.admin]);
 await owner(db,"insert into control_obligaciones_pago(id,cierre_origen,cierre_id,version_id,obra_id,trabajador_id,semana,tipo,nombre,importe,metodo) values($1,$2,$2,$3,$4,$5,26,'FINIQUITO','PERSONA FICTICIA',100,'CHEQUE')",[o,cierre,version,ids.obra,ids.w]);
 await owner(db,"insert into control_evidencias_pago(id,obra_id,trabajador_id,semana,clave,importe,cheque_id) values($1,$2,$3,26,'FICTICIO',100,$4)",[e,ids.obra,ids.w,q.id]);
 await owner(db,'alter table control_pago_aplicaciones disable trigger user');try{await owner(db,"insert into control_pago_aplicaciones(id,obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo) values($1,$2,$3,$4,$5,100,$6,$1,'Aplicación ficticia')",[a,ids.obra,o,e,version,ids.admin]);}finally{await owner(db,'alter table control_pago_aplicaciones enable trigger user');}
 const frozen=async()=>(await owner(db,"select jsonb_build_object('cierres',(select jsonb_agg(to_jsonb(x)) from control_cierres_nomina x),'obligaciones',(select jsonb_agg(to_jsonb(x)) from control_obligaciones_pago x),'aplicaciones',(select jsonb_agg(to_jsonb(x)) from control_pago_aplicaciones x),'evidencias',(select jsonb_agg(to_jsonb(x)) from control_evidencias_pago x)) f")).rows[0].f;
 const before=await frozen();
 const fixture='work/conciliador_tabs_20261106/funciones_vivas.json';if(fs.existsSync(fixture)){
  const corrected=(await owner(db,"select pg_get_functiondef('platinum_internal.proteger_evidencia()'::regprocedure) def")).rows[0].def;
  await owner(db,JSON.parse(fs.readFileSync(fixture)).find(x=>x.nombre==='proteger_evidencia').def);
  await no(edit(q,'101','2'),/Comprobante aplicado/);await owner(db,corrected);
 }
 const out=await edit(q,'101','2');assert.equal(out.estatus,q.estatus);assert.equal(out.importe,100);assert.equal(out.num_cheque,'101');n++;
 const strip=x=>{x={...x};for(const k of ['num_cheque','consecutivo','updated_at','actualizado_por'])delete x[k];return x;};const saved=(await owner(db,'select * from cheques where id=$1',[q.id])).rows[0];assert.deepEqual(strip(saved),strip(q));n++;
 assert.deepEqual(await frozen(),before);n++;assert.equal(Number((await owner(db,"select count(*) n from control_bitacora where entidad_id=$1 and accion='CORREGIR_FOLIOS_CHEQUE'",[q.id])).rows[0].n),1);n++;
 await no(edit(q,'102','3'),/cambió/);await no(edit(saved,'101','2'),/no cambiaron/);await no(edit(saved,'103','4','consulta'),/permiso/);await no(edit(saved,'103','4','jire'),/permiso/);await no(edit(saved,'103','4',null),/permission denied/);
 for(const change of ["importe=101","semana='S27'","trabajador_id='"+ids.wOtra+"'","estatus='CANCELADO'","tipo_pago='CHEQUE'"]){await actor(db,'conta');await no(db.query("update cheques set num_cheque='105',"+change+' where id=$1',[q.id]),/Comprobante aplicado|permiso|pago|cerrad|NOI|neto/i);}
 let q2=await seed('ENTREGADO','200','20');const out2=await edit(q2,'201','21');assert.equal(out2.estatus,'ENTREGADO');n++;
 q2=await seed('CANCELADO','300','30');assert.equal((await edit(q2,'301','31')).estatus,'CANCELADO');n++;
 q2=await seed('PENDIENTE','','');const pending=await edit(q2,'400','40');assert.equal(pending.estatus,'PENDIENTE','Corregir folios nunca expide');n++;
 const occupied=await seed('EXPEDIDO','777','77'),free=await seed('EXPEDIDO','888','88');await no(edit(free,'000777','89'),/Folio ocupado/);await no(edit(free,'889','00077'),/Folio ocupado/);
 const duplicate=await seed('EXPEDIDO','777','77');assert.equal((await edit(duplicate,'900','90')).num_cheque,'900');n++;
 const other=await seed('EXPEDIDO','1000','100',ids.otra,ids.wOtra);assert.equal((await edit(other,'1001','101','jire')).num_cheque,'1001');n++;
 await actor(db,'conta');await db.query("update cheques set num_cheque='202',consecutivo='22' where id=$1",[out2.id]);assert.equal((await owner(db,'select num_cheque from cheques where id=$1',[out2.id])).rows[0].num_cheque,'202');n++;
 await no(edit((await owner(db,'select * from cheques where id=$1',[out2.id])).rows[0],'',''),/conservar número/);
 assert.deepEqual(await frozen(),before);n++;
 console.log('PASS folios físicos: '+n+' controles PostgreSQL; cierres timbrados/aplicaciones intactos, RRHH por alcance, CAS, colisiones y estatus sin expedición.');
 }finally{await db.close();}})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
