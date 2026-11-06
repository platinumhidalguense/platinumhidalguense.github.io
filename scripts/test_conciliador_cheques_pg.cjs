// Flujo aislado PostgreSQL: estado, Storage simulado, NOI y persistencia bancaria.
const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('crypto'),base=require('./soporte_cierres_actuales_pg.cjs');
const {ids,owner,actor,rpc}=base;
(async()=>{const db=await base.makeDatabase();try{
 await db.exec(fs.readFileSync('supabase/migrations/20261029213240_cheques_cfdi_prioridad_desgloses.sql','utf8'));
 await db.exec('create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;');
 await db.exec(fs.readFileSync('supabase/migrations/20261106195853_conciliador_general_persistente.sql','utf8'));
 const call=async(who,a,j)=>{await actor(db,who);return(await db.query('select public.control_conciliador_general($1,$2) r',[a,JSON.stringify(j)])).rows[0].r;};
 const s=base.snapshot(ids.w,2500,500);s.semana=32;s.desde='2026-11-02';s.hasta='2026-11-08';s.modelo.sem='S32';await owner(db,"update obras set fecha_inicio='2026-03-30' where id=$1",[ids.obra]);await owner(db,"update trabajadores set rfc='PRUP900101AA1' where id=$1",[ids.w]);
 await owner(db,"update trabajadores set cuenta='',clabe='',forma_pago='CHEQUE',nss='12345678901' where id=$1",[ids.w]);
 const fuente=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:32}),cid=(await rpc(db,'conta','CREAR',{obra_id:ids.obra,semana:32,periodo:'SEMANAL',snapshot:s,fuente:fuente.fuente})).cierre_id;
 await call('conta','ABRIR',{cierre_id:cid});
 const detalle=await rpc(db,'conta','DETALLE',{cierre_id:cid});await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:cid,archivo:'NOI FICTICIO.xlsx',sha256:'b'.repeat(64),revision:detalle.cierre.snapshot_sha256,filas:[{trabajador_id:ids.w,trabajador_numero:1,tipo_calculo:'NOMINA',monto_noi:2000,detalle:{identidad_noi:{version:1,rfc:'PRUP900101AA1'}}}]});
 await call('conta','ABRIR',{cierre_id:cid});
 await base.clock(db,'2026-11-07T12:01:00-06:00');
 // Candidatos y cobertura fiscal/previsión usan los servicios fiscales reales del proyecto.
 await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'AUTORIZADO'});
 const snapBefore=(await owner(db,'select snapshot::text s,snapshot_sha256 from control_cierres_nomina where id=$1',[cid])).rows[0];
 let candidates=await call('conta','CANDIDATOS',{cierre_id:cid});assert.equal(candidates.filas.length,1);assert.equal(candidates.filas[0].elegible,false);
 await owner(db,"insert into config(clave,valor) values('empresa_PLATINUM','{\"rfc\":\"EMP900101AA1\"}') on conflict(clave) do update set valor=excluded.valor");
 const doc=crypto.randomUUID(),folio=crypto.randomUUID();await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,hash,nomina_neto,nomina_tipo,nomina_lector,periodo_inicio,periodo_fin,cfdi_total) values($1,$2,$3,'RECIBO_NOMINA','S32','ficticio.pdf','hash-ficticio',2000,'NOMINA','FICTICIO','2026-11-02','2026-11-08',2000)",[doc,ids.obra,ids.w]);
 const datos={recibos:1,identificadores:['PRUP900101AA1','EMP900101AA1'],periodo_inicio:s.desde,periodo_fin:s.hasta,percepciones:2200,deducciones:200,neto:2000,evidencia_neto:'Neto pagado: 2,000.00',cfdi_uuid:folio.toUpperCase(),evidencia_timbrado:folio.toUpperCase()+' SELLO DIGITAL DEL SAT: '+('AbC123+/'.repeat(12))};
 await rpc(db,'conta','RECIBO',{documento_id:doc,hash:'hash-ficticio',neto:2000,tipo:'NOMINA',datos});
 candidates=await call('conta','CANDIDATOS',{cierre_id:cid});assert.equal(candidates.filas[0].elegible,true,JSON.stringify(candidates));assert.equal(candidates.filas[0].neto_pdf,2000);
 assert.equal(Number((await owner(db,"select count(*) n from cheques where semana='S32'")).rows[0].n),0,'El conciliador nuevo no crea cheques antes de confirmar');
 await assert.rejects(call('conta','CONFIRMAR_CHEQUES',{cierre_id:cid,ids:[candidates.filas[0].obligacion_id],huella:candidates.huella}),/Confirma/);
 const qr=await call('conta','CONFIRMAR_CHEQUES',{cierre_id:cid,ids:[candidates.filas[0].obligacion_id],huella:candidates.huella,confirmacion:'CONFIRMAR CHEQUES REVISADOS'});assert.equal(qr.creados,1);assert.equal(qr.cheques[0].importe,2000,'El cheque no incluye los 500 de previsión');
 await assert.rejects(call('conta','CONFIRMAR_CHEQUES',{cierre_id:cid,ids:[candidates.filas[0].obligacion_id],huella:candidates.huella,confirmacion:'CONFIRMAR CHEQUES REVISADOS'}),/Cambió/);
 assert.equal((await call('conta','CANDIDATOS',{cierre_id:cid})).filas[0].motivo,'CHEQUE_EXISTENTE');
 assert.deepEqual((await owner(db,'select snapshot::text s,snapshot_sha256 from control_cierres_nomina where id=$1',[cid])).rows[0],snapBefore,'La fotografía histórica no se modifica');
 const xml=crypto.randomUUID();await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,mime_type,cfdi_uuid,cfdi_total,periodo_inicio,periodo_fin) values($1,$2,$3,'CFDI_NOMINA','S32','ficticio.xml','application/xml',$4,2000,'2026-11-02','2026-11-08')",[xml,ids.obra,ids.w,folio]);
 // Registrar aplicaciones a la obligación mediante su API, no contar transferencia archivada como aplicada.
 await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote) values($1,$2,'S32','TRANSFERENCIA','BBVA',2500,'EXITOSO','2026-11-06','LOTE-FICTICIO')",[ids.obra,ids.w]);
 const plan=await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:cid});await rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',{cierre_id:cid,plan_sha256:plan.plan_sha256,confirmacion:'VINCULAR S32'});
 let resumen=(await call('conta','ABRIR',{cierre_id:cid})).resumen;assert.equal(resumen.personas[0].neto_timbrado,2000);assert.equal(resumen.personas[0].prevision,500);assert.equal(resumen.personas[0].estado_pago,'COINCIDE',JSON.stringify(resumen));assert.equal(resumen.personas[0].diferencia,0);
 await owner(db,'update documentos set cfdi_total=1999.99 where id=$1',[xml]);resumen=(await call('conta','ABRIR',{cierre_id:cid})).resumen;assert.equal(resumen.personas[0].estado_pago,'FALTA_RESPALDO_FISCAL','PDF/XML contradictorios no se suman ni toleran');
 console.log('PASS Conciliador cheques: PDF fiscal, candidatos, confirmación, sin duplicar, previsión separada, PDF/XML UUID, aplicación bancaria y snapshot intacto.');
}finally{await db.close();}})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
