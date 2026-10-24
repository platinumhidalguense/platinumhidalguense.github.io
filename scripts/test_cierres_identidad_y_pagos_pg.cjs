// Recorrido PostgreSQL completo con personas, comprobantes y RFC ficticios.
const assert=require('node:assert/strict'),crypto=require('crypto'),base=require('./soporte_cierres_actuales_pg.cjs');
const {rpc,owner,actor,ids}=base;let checks=0;
(async()=>{const db=await base.makeDatabase();try{
 const s=base.snapshot(ids.w,2000),sha='a'.repeat(64),oldRFC='PRUP900101IY6',rfc='PRUP9001011Y6',curp='PRUP900101HHGRRA01',nss='01234567890';
 const shift=d=>new Date(Date.parse(d+'T12:00:00Z')-14*86400000).toISOString().slice(0,10);s.desde=shift(s.desde);s.hasta=shift(s.hasta);
 await owner(db,'update obras set fecha_inicio=$2 where id=$1',[ids.obra,s.desde]);
 await owner(db,'update trabajadores set rfc=$2,curp=$3,nss=$4 where id=$1',[ids.w,rfc,curp,nss]);
 let source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});
 const c=(await rpc(db,'conta','CREAR',{obra_id:ids.obra,semana:1,periodo:'SEMANAL',snapshot:s,fuente:source.fuente})).cierre_id;
 const det=await rpc(db,'conta','DETALLE',{cierre_id:c});
 const original={version:1,rfc:oldRFC,curp,nss,nombre:'PRUEBA PERSONA',numero_noi:1};
 const payload={cierre_id:c,archivo:'FICTICIO.xlsx',sha256:sha,revision:det.cierre.snapshot_sha256,filas:[{trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PRUEBA PERSONA',tipo_calculo:'NOMINA',monto_noi:2000,detalle:{identidad_noi:original}}]};
 await assert.rejects(rpc(db,'conta','IMPORTAR_NOI',payload),/contradicen/);checks++;
 await owner(db,"insert into platinum_internal.noi_identidades_resueltas(obra_id,trabajador_id,desde,hasta,archivo_sha256,rfc_origen,rfc_validado,curp,nss,nombre,evidencia) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'PRUEBA PERSONA','{\"fuente\":\"FICTICIA\"}')",[ids.obra,ids.w,s.desde,s.hasta,sha,oldRFC,rfc,curp,nss]);
 await rpc(db,'conta','IMPORTAR_NOI',payload);checks++;
 const stored=(await owner(db,'select detalle from control_conciliacion_noi where cierre_id=$1',[c])).rows[0].detalle;
 assert.equal(stored.identidad_noi.rfc,oldRFC);assert.equal(stored.identidad_resuelta.rfc_validado,rfc);checks+=2;
 await assert.rejects(rpc(db,'conta','IMPORTAR_NOI',{...payload,sha256:'b'.repeat(64)}),/contradicen/);checks++;
 await assert.rejects(rpc(db,'conta','IMPORTAR_NOI',{...payload,filas:[{...payload.filas[0],detalle:{identidad_noi:{...original,nss:'99999999999'}}}]}),/resolución histórica/);checks++;
 await actor(db,'consulta');await assert.rejects(db.query('select * from platinum_internal.noi_identidades_resueltas'),/permission denied/);checks++;
 await actor(db,'conta');assert.equal((await db.query('select public.control_identidades_noi_resueltas($1,$2) d',[c,sha])).rows[0].d.length,1);checks++;
 await actor(db,'jire');await assert.rejects(db.query('select public.control_identidades_noi_resueltas($1,$2)',[c,sha]),/alcance|acceso|permiso/i);checks++;
 await rpc(db,'conta','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});checks++;
 assert.equal((await rpc(db,'conta','IMPORTAR_NOI',payload)).sin_cambios,true);checks++;
 await assert.rejects(rpc(db,'conta','IMPORTAR_NOI',{...payload,filas:[{...payload.filas[0],monto_noi:1999}]}),/reapertura/);checks++;
 await assert.rejects(rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'PAGADO'}),/TIMBRADO|Transición|saldos/i);checks++;
 let plan=await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:c});assert.equal(plan.vinculables,0);assert.equal(plan.pendientes,1);checks+=2;
 // Importar una transferencia no significa marcar pagado ni hace falta inventar otro pago.
 const pid=crypto.randomUUID();await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote) values($1,$2,$3,'S1','TRANSFERENCIA','BBVA',2000,'EXITOSO',$4,'FICTICIO-1')",[pid,ids.obra,ids.w,s.hasta]);
 // La semana del fixture puede estar abierta; retirar sólo aplicaciones autogeneradas del fixture para probar preview sin escritura.
 await owner(db,'delete from control_pago_aplicaciones');await owner(db,'delete from control_evidencias_pago');
 plan=await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:c});assert.equal(plan.vinculables,1);checks++;
 assert.equal(Number((await owner(db,'select count(*) n from control_pago_aplicaciones')).rows[0].n),0);checks++;
 await assert.rejects(rpc(db,'consulta','VINCULAR_COMPROBANTES_LOTE',{cierre_id:c,plan_sha256:plan.plan_sha256,confirmacion:'VINCULAR S1'}),/consulta|escritura|permiso/i);checks++;
 await assert.rejects(rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',{cierre_id:c,plan_sha256:'x',confirmacion:'VINCULAR S1'}),/cambiaron/);checks++;
 // Ambos documentos del mismo banco/folio/fecha son UNA sola evidencia.
 await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote,origen) values($1,$2,'S1','TRANSFERENCIA','BBVA',2000,'EXITOSO',$3,'FICTICIO-1','INDIVIDUAL')",[ids.obra,ids.w,s.hasta]);
 plan=await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:c});assert.equal(plan.vinculables,1);checks++;
 const done=await rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',{cierre_id:c,plan_sha256:plan.plan_sha256,confirmacion:'VINCULAR S1'});assert.equal(done.vinculados,1);assert.equal(Number(done.pendientes),0);checks+=2;
 const repeat=await rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',{cierre_id:c,plan_sha256:plan.plan_sha256,confirmacion:'VINCULAR S1'});assert.equal(repeat.vinculados,0);checks++;
 assert.equal(Number((await owner(db,'select count(*) n from pagos')).rows[0].n),2);assert.equal(Number((await owner(db,'select count(*) n from control_pago_aplicaciones where retirado_en is null')).rows[0].n),1);checks+=2;
 // CFDI PDF fiscal: timbrar no depende del método de pago.
 const doc=crypto.randomUUID(),uuid=crypto.randomUUID();await owner(db,"insert into config(clave,valor) values('empresa_PLATINUM','{\"rfc\":\"EMP900101AA1\"}')");
 await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,hash) values($1,$2,$3,'RECIBO_NOMINA','S1','ficticio.pdf',$4)",[doc,ids.obra,ids.w,'c'.repeat(64)]);
 await rpc(db,'conta','RECIBO',{cierre_id:c,documento_id:doc,hash:'c'.repeat(64),neto:2000,tipo:'NOMINA',datos:{recibos:1,rfc,rfc_emisor:'EMP900101AA1',identificadores:[rfc,'EMP900101AA1'],periodo_inicio:s.desde,periodo_fin:s.hasta,percepciones:2100,deducciones:100,otros_pagos:0,neto:2000,evidencia_neto:'Neto pagado: 2,000.00',cfdi_uuid:uuid,evidencia_timbrado:'Folio fiscal '+uuid+' Sello Digital del SAT: '+'ABC123+/'.repeat(12)}});checks++;
 await rpc(db,'conta','TRANSICION',{cierre_id:c,estado:'TIMBRADO'});checks++;
 await assert.rejects(rpc(db,'conta','TRANSICION',{cierre_id:c,estado:'PAGADO'}),/otra persona/);checks++;
 await rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'PAGADO'});assert.equal((await rpc(db,'admin','DETALLE',{cierre_id:c})).cierre.estado,'PAGADO');checks+=2;
 assert.equal((await owner(db,'select rfc from trabajadores where id=$1',[ids.w])).rows[0].rfc,rfc);checks++;
 console.log('PASS '+checks+' controles de recorrido real SQL: RFC histórico acotado, fuente intacta, permisos, pagos duplicados, vista previa, confirmación, repetición, PDF, timbrado y pago por segunda persona.');
 }finally{await db.close();}})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
