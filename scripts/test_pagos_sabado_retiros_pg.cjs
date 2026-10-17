const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeDatabase,ids,owner,actor,pagos,clock,rpc,snapshot}=require('./soporte_pagos_sabado_pg.cjs');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};const no=async(f,re)=>{await assert.rejects(f,re);n++;};
(async()=>{const db=await makeDatabase();try{
 const o=ids.obra,w4=crypto.randomUUID();await owner(db,"insert into trabajadores(id,obra_id,no_trab,nombres,primer_apellido,estatus,fecha_alta,contratista) values($1,$2,3,'PERSONA','FICTICIA','ACTIVO',current_date,'MG')",[w4,o]);
 const targets=[crypto.randomUUID(),crypto.randomUUID()],fin=crypto.randomUUID(),manual=crypto.randomUUID();
 // Únicamente para reproducir filas anteriores a la migración en la base ficticia.
 await owner(db,'alter table cheques disable trigger b_control_nomina_confirmada');
 for(const[id,w,orig,tipo]of[[targets[0],ids.w,'SIN_CUENTA','CHEQUE'],[targets[1],ids.w2,'CIERRE_NOI','CHEQUE'],[fin,ids.w,'FINIQUITO','FINIQUITO'],[manual,w4,'MANUAL','CHEQUE']]){
  await owner(db,"insert into cheques(id,obra_id,trabajador_id,no_trab,nombre,semana,importe,tipo_pago,estatus,origen_generacion) values($1,$2,$3,1,'PERSONA FICTICIA','S1',2000,$4,'PENDIENTE',$5)",[id,o,w,tipo,orig]);
 }
 await owner(db,'alter table cheques enable trigger b_control_nomina_confirmada');
 await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,estado,importe,banco,fecha_pago,folio_lote,origen) values($1,$2,'S1','TRANSFERENCIA','EXITOSO',2000,'BBVA',current_date,'PAGO-LEGADO-FICTICIO','GLOBAL')",[o,ids.w]);
 let p=await pagos(db,'admin','RETIROS',{obra_id:o,semana:1});ok(p.retiros.length===2,'Sólo automáticos sin folio, no manuales ni finiquitos');
 ok(p.retiros.find(x=>x.id===targets[0]).transferencia_exacta&&!p.retiros.find(x=>x.id===targets[1]).transferencia_exacta,'Retiro distingue pago y pendiente, sin inventar comprobantes');
 const request={obra_id:o,semana:1,ids:targets,huella:p.huella,motivo:'Retiro autorizado de pendientes automáticos ficticios',confirmacion:'RETIRAR AUTOMATICOS'};
 await no(()=>pagos(db,'consulta','RETIRAR',request),/permiso/i);
 await no(()=>pagos(db,'admin','RETIRAR',{...request,confirmacion:''}),/confirmación/i);
 await no(()=>pagos(db,'admin','RETIRAR',{...request,ids:[...targets,fin]}),/automático|pendiente/i);
 ok((await owner(db,'select count(*)::int n from cheques where eliminado')).rows[0].n===0,'Lote inválido revierte íntegro');
 const r=await pagos(db,'admin','RETIRAR',request);ok(r.retirados===2,'Retirada única en lote');
 ok((await owner(db,'select count(*)::int n from control_retiros_cheques_auto')).rows[0].n===2,'Cada cheque conserva auditoría');
 ok((await owner(db,'select count(*)::int n from cheques where id=any($1::uuid[]) and not eliminado',[[fin,manual]])).rows[0].n===2,'Manuales y finiquitos intactos');
 ok((await owner(db,'select count(*)::int n from pagos')).rows[0].n===1,'Ningún comprobante eliminado');
 await no(()=>pagos(db,'admin','RETIRAR',request),/cambió/i);
 await actor(db,'admin');await no(()=>db.exec('delete from control_retiros_cheques_auto'),/permission denied/i);
 await actor(db,'conta');await no(()=>db.query("insert into cheques(obra_id,trabajador_id,nombre,semana,importe,tipo_pago,estatus) values($1,$2,'NO CREAR','S1',2000,'CHEQUE','PENDIENTE')",[o,ids.w]),/pago pendiente|sábado/i);
 // Aviso programado: sólo metadatos; incluso al ejecutarse no crea un cheque.
 const start=(await owner(db,'select fecha_inicio::text d from obras where id=$1',[o])).rows[0].d,day=new Date(start+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+5);const sat=day.toISOString().slice(0,10);
 const s=snapshot(ids.w,2000,0),src=await rpc(db,'conta','FUENTE',{obra_id:o,semana:1});await rpc(db,'conta','CREAR',{obra_id:o,semana:1,periodo:'SEMANAL',snapshot:s,fuente:src.fuente});
 await clock(db,sat+'T11:59:59-06:00');ok((await owner(db,'select platinum_internal.pagos_avisar_sabado() n')).rows[0].n===0,'Cron no avisa antes de mediodía');
 await clock(db,sat+'T12:00:00-06:00');ok((await owner(db,'select platinum_internal.pagos_avisar_sabado() n')).rows[0].n===1,'Aviso a las 12 CDMX');
 ok((await owner(db,'select platinum_internal.pagos_avisar_sabado() n')).rows[0].n===0,'Aviso idempotente, sin duplicados');
 ok((await owner(db,'select count(*)::int n from cheques')).rows[0].n===4,'Cron no genera pagos ni cheques');
 await actor(db,'consulta');await no(()=>db.exec('select platinum_internal.pagos_avisar_sabado()'),/permission denied/i);
 await actor(db,'conta');const ia=(await db.query('select public.ia_cheques_faltantes(1,null,null,null,null,500) d')).rows[0].d;ok(!ia.faltantes.some(x=>x.trabajador_id===ids.w),'Auditoría no pide cheque de un trabajador ya pagado');
 console.log(`PASS revisión/retirada/avisos: ${n} comprobaciones PostgreSQL actuales.`);
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
