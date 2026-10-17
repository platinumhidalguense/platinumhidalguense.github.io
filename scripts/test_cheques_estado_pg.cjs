// Reglas nuevas con datos ficticios; no abre navegador ni conecta a producción.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeDatabase,ids,owner,actor}=require('./soporte_pagos_sabado_pg.cjs');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;},no=async(f,re)=>{await assert.rejects(f,re);n++;};
(async()=>{const db=await makeDatabase();try{
 const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_cheques_cancelacion_fisica_y_papelera.sql'));assert(migration);
 const pending=crypto.randomUUID(),physical=crypto.randomUUID(),cancelled=crypto.randomUUID();
 // Simular historia previa sin alterar los triggers de la base real.
 await owner(db,'alter table cheques disable trigger trg_control_validar_neto_cheque_noi');
 for(const[id,status,num,cons]of[[pending,'PENDIENTE','',''],[physical,'EXPEDIDO','1001','1'],[cancelled,'CANCELADO','','']]){
  await owner(db,"insert into cheques(id,obra_id,trabajador_id,nombre,semana,importe,tipo_pago,estatus,num_cheque,consecutivo)values($1,$2,$3,'PERSONA PRUEBA','S1',2000,'FINIQUITO',$4,$5,$6)",[id,ids.obra,id===physical?ids.w2:ids.w,status,num,cons]);
 }
 await owner(db,'alter table cheques enable trigger trg_control_validar_neto_cheque_noi');
 await owner(db,'select 1');await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 await actor(db,'admin');await no(()=>db.query("update cheques set estatus='CANCELADO'where id=$1",[pending]),/CANCELADO requiere/);
 await no(()=>db.query("update cheques set estatus='CANCELADO',num_cheque='1'where id=$1",[pending]),/CANCELADO requiere/);
 await no(()=>db.query("update cheques set estatus='CANCELADO',consecutivo='1'where id=$1",[pending]),/CANCELADO requiere/);
 await db.query("update cheques set eliminado=true,motivo_eliminado='Captura sin cheque físico'where id=$1",[pending]);
 ok((await owner(db,'select eliminado,estatus from cheques where id=$1',[pending])).rows[0].estatus==='PENDIENTE','Eliminar no cambia a CANCELADO');
 await actor(db,'admin');await no(()=>db.query("update cheques set eliminado=true,motivo_eliminado='Borrar físico'where id=$1",[physical]),/número o consecutivo/);
 await db.query("update cheques set estatus='CANCELADO'where id=$1",[physical]);ok((await owner(db,'select estatus from cheques where id=$1',[physical])).rows[0].estatus==='CANCELADO','Físico numerado puede cancelarse');
 await actor(db,'admin');await db.query("update cheques set eliminado=true,motivo_eliminado='Limpieza de falsa cancelación'where id=$1",[cancelled]);ok((await owner(db,'select eliminado from cheques where id=$1',[cancelled])).rows[0].eliminado,'Falsa cancelación antigua se elimina');
 await actor(db,'admin');await no(()=>db.query('update cheques set eliminado=false where id=$1',[cancelled]),/CANCELADO requiere/);
 await no(()=>db.exec("insert into cheques(obra_id,nombre,semana,importe,tipo_pago,estatus)values('"+ids.obra+"','PRUEBA','S2',20,'FINIQUITO','CANCELADO')"),/CANCELADO requiere/);
 await db.query("insert into cheques(obra_id,nombre,semana,importe,tipo_pago,estatus,num_cheque,consecutivo)values($1,'PRUEBA','S2',20,'FINIQUITO','CANCELADO','2002','2')",[ids.obra]);ok((await owner(db,'select count(*)::int n from cheques where not eliminado')).rows[0].n===2,'Sólo físicos siguen en conteos de cancelados');
 await actor(db,'consulta');await no(()=>db.query("update cheques set eliminado=true where id=$1",[physical]),/número o consecutivo|permission|permiso/i);
 await actor(db,null);await no(()=>db.query('select platinum_internal.cheque_estado_fisico()'),/permission denied/i);
 console.log(`PASS estado físico de cheques: ${n} comprobaciones PostgreSQL.`);
 }finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
