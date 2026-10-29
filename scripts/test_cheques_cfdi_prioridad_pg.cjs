const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict'),base=require('./soporte_cierres_actuales_pg.cjs');
(async()=>{const db=await base.makeDatabase(),{ids,owner,actor}=base;try{
 const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_cheques_cfdi_prioridad_desgloses.sql'));
 await db.exec(fs.readFileSync(migration?'supabase/migrations/'+migration:'work/compatibilidad_noi_20261029/cheques_prioridad.sql','utf8'));
 const w=ids.w,obra=ids.obra,doc=crypto.randomUUID(),folio=crypto.randomUUID();let q=crypto.randomUUID();
 const snapshot=base.snapshot(w,2000);snapshot.semana=26;snapshot.desde='2026-09-21';snapshot.hasta='2026-09-27';
 await owner(db,"update trabajadores set rfc='PRUP900101AA1',nss='12345678901' where id=$1",[w]);
 await owner(db,"insert into config(clave,valor) values('empresa_PLATINUM','{\"rfc\":\"EMP900101AA1\"}') on conflict(clave) do update set valor=excluded.valor");
 snapshot.items[0].tipo='FINIQUITO';const cierre=crypto.randomUUID();
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por,archivo_noi) values($1,$2,26,'SEMANAL','FICTICIO','FICTICIO',$3,$4,'FICTICIO.xlsx')",[cierre,obra,JSON.stringify(snapshot),ids.conta]);
 await owner(db,"insert into control_conciliacion_noi(obra_id,cierre_id,trabajador_id,trabajador_numero,trabajador_nombre,tipo_calculo,metodo_pago,monto_platinum,monto_noi,importado_por) values($1,$2,$3,1,'PERSONA FICTICIA','FINIQUITO','CHEQUE',2000,1999.99,$4)",[obra,cierre,w,ids.conta]);
 await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,hash,nomina_neto,nomina_tipo,nomina_lector,periodo_inicio,periodo_fin,cfdi_total) values($1,$2,$3,'RECIBO_NOMINA','S26','ficticio.pdf','hash-ficticio',2000,'FINIQUITO','FICTICIO','2026-09-21','2026-09-27',2000)",[doc,obra,w]);
 const read=()=>base.rpc(db,'conta','NETO_CHEQUE',{obra_id:obra,trabajador_id:w,semana:'S26',tipo_pago:'FINIQUITO',cierre_id:cierre});
 // La discrepancia sólo deja de bloquear cuando existe evidencia fiscal.
 assert.equal((await read()).estado,'DIFERENCIA_FUENTES');
 const datos={recibos:1,identificadores:['PRUP900101AA1','EMP900101AA1'],periodo_inicio:'2026-09-21',periodo_fin:'2026-09-27',percepciones:2200,deducciones:200,neto:2000,evidencia_neto:'Neto pagado: 2,000.00',
   cfdi_uuid:folio.toUpperCase(),evidencia_timbrado:folio.toUpperCase()+' SELLO DIGITAL DEL SAT: '+('AbC123+/'.repeat(12))};
 await base.rpc(db,'conta','RECIBO',{documento_id:doc,hash:'hash-ficticio',neto:2000,tipo:'FINIQUITO',datos});
 let r=await read();assert.equal(r.neto,2000);assert(r.cfdi_prioritario);assert.equal(Number(r.diferencia_noi),.01);assert(r.advertencias.length);
 // El diagnóstico de cierre continúa usando el contexto original.
 assert.equal((await owner(db,'select platinum_internal.neto_respaldo_contexto($1,$2,26,$3,z) d from control_cierres_nomina z where id=$4',[obra,w,'FINIQUITO',cierre])).rows[0].d.estado,'DIFERENCIA_FUENTES');
 const pendiente=(await owner(db,"select id from cheques where trabajador_id=$1 and semana='S26' and tipo_pago='FINIQUITO' and not eliminado",[w])).rows[0];
 if(pendiente)q=pendiente.id;else{
 await owner(db,'alter table cheques disable trigger b_control_nomina_confirmada');
 try{await owner(db,"insert into cheques(id,obra_id,trabajador_id,nombre,semana,tipo_pago,estatus,importe,cierre_id) values($1,$2,$3,'PERSONA FICTICIA','S26','FINIQUITO','PENDIENTE',2000,$4)",[q,obra,w,cierre]);}finally{await owner(db,'alter table cheques enable trigger b_control_nomina_confirmada');}}
 await owner(db,'update cheques set importe=2000 where id=$1',[q]);
 await actor(db,'conta');await db.query("update cheques set num_cheque='FICTICIO',consecutivo='FICTICIO',estatus='EXPEDIDO' where id=$1",[q]);
 assert.equal((await owner(db,'select estatus from cheques where id=$1',[q])).rows[0].estatus,'EXPEDIDO');
 assert.equal(Number((await owner(db,"select count(*) n from control_bitacora where entidad_id=$1 and accion='EXPEDIR_CHEQUE_CFDI_PRIORITARIO'",[q])).rows[0].n),1);
 assert.equal((await owner(db,'select estado from control_cierres_nomina where id=$1',[cierre])).rows[0].estado,'BORRADOR');
 const xml=crypto.randomUUID();await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,mime_type,cfdi_uuid,cfdi_total,periodo_inicio,periodo_fin) values($1,$2,$3,'CFDI_NOMINA','S26','ficticio.xml','application/xml',$4,2000,'2026-09-21','2026-09-27')",[xml,obra,w,folio]);
 assert.equal((await read()).neto,2000); // PDF+XML mismo folio no se duplican.
 await owner(db,'update documentos set cfdi_total=1998 where id=$1',[xml]);assert.equal((await read()).estado,'CONFLICTO_CFDI');
 await owner(db,'update documentos set cfdi_total=2000,cfdi_uuid=$2 where id=$1',[xml,crypto.randomUUID()]);assert.equal((await read()).estado,'CONFLICTO_CFDI');
 await owner(db,'update documentos set anulado=true where id=$1',[doc]);r=await read();assert.equal(r.neto,2000);assert(r.origen.includes('XML'));
 await owner(db,"update documentos set periodo_inicio='2000-01-01' where id=$1",[xml]);assert(!(await read()).cfdi_prioritario);
 await actor(db,'consulta');await assert.rejects(db.query('select platinum_internal.neto_cheque_fiscal($1,$2,26,$3,null)',[obra,w,'FINIQUITO']),/permission denied/);
 await owner(db,'update documentos set anulado=(id=$2) where id in($1,$2)',[doc,xml]);
 await owner(db,"create or replace function platinum_internal.excepcion_noi(p_cierre uuid,p_trabajador uuid,p_sha text default null) returns jsonb language sql stable as $$select '{\"neto_original\":2000,\"finiquito_efectivo\":1500}'::jsonb$$");
 r=await read();
 assert.equal(r.neto,1500);assert.equal(r.cfdi_neto_original,2000);assert(r.excepcion_noi);
 console.log('PASS CFDI prioritario: timbrado obligatorio para discrepancia, PDF/XML, deduplicación, conflicto fiscal, fechas, alcance, cheque existente, auditoría y cierre intacto.');
 }finally{await db.close();}})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
