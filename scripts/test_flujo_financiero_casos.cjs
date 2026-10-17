// Pruebas PostgreSQL locales con personas/obras ficticias. Sin navegador ni producción.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeDatabase,ids,rpc,owner,actor,snapshot}=require('./soporte_flujo_pg.cjs');
const uuid=()=>crypto.randomUUID();let checks=0;
async function run(test){const db=await makeDatabase();try{await test(db);}finally{await db.close();}}
const no=async(p,re)=>{await assert.rejects(p,re);checks++;};
async function ready(db,s=snapshot(),beforeReview){
 const src=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});
 const created=await rpc(db,'conta','CREAR',{obra_id:ids.obra,semana:1,periodo:'SEMANAL',snapshot:s,fuente:src.fuente});
 const id=created.cierre_id,d=await rpc(db,'conta','DETALLE',{cierre_id:id});
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:id,filas:s.items.map(i=>({trabajador_id:i.trabajador_id,trabajador_numero:i.numero,trabajador_nombre:i.nombre,tipo_calculo:i.tipo,metodo_pago:i.metodo_pago,monto_noi:i.monto-(i.prevision_social||0)})),archivo:'FICTICIO.xlsx',sha256:'a'.repeat(64),revision:d.cierre.snapshot_sha256});
 if(beforeReview)await beforeReview(id);
 await rpc(db,'conta','TRANSICION',{cierre_id:id,estado:'REVISADO'});return id;
}
(async()=>{
 await run(async db=>{
  const c=await ready(db);await no(rpc(db,'conta','CREAR',{obra_id:ids.obra,semana:1,periodo:'SEMANAL',snapshot:snapshot(),fuente:'x'}),/existe|cierre/i);
  await owner(db,"update public.trabajadores set sal_semanal=1999 where id=$1",[ids.w]);
  await no(rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'}),/cambió|preparada/);
  await no(rpc(db,'conta','PREPARAR',{cierre_id:c,snapshot:snapshot(),fuente:'OBSOLETA'}),/fuentes cambiaron/);
  const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});
  await no(rpc(db,'conta','PREPARAR',{cierre_id:c,snapshot:{...snapshot(),empresa_codigo:'JIRE'},fuente:source.fuente}),/razón social/);
  await actor(db,'conta');await no(db.query('delete from public.control_conciliacion_noi where cierre_id=$1',[c]),/permission denied/);
 });
 await run(async db=>{
  const c=await ready(db),doc=uuid();
  await owner(db,"insert into public.documentos(id,obra_id,trabajador_id,categoria,semana,archivo,nombre_archivo) values($1,$2,$3,'RECIBO_NOMINA','S1','ficticio.pdf','ficticio.pdf')",[doc,ids.obra,ids.w]);
  await no(rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'}),/recibos|diferencias/);
  await rpc(db,'conta','RECIBO',{documento_id:doc,neto:1999.99,tipo:'NOMINA'});
  await no(rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'}),/recibos|diferencias/);
  await no(rpc(db,'conta','RECIBO',{documento_id:doc,neto:2000,tipo:'NOMINA'}),/administrador/);
  await rpc(db,'admin','RECIBO',{documento_id:doc,neto:2000,tipo:'NOMINA'});
  await rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});checks++;
  const x=uuid();await owner(db,"insert into public.documentos(id,obra_id,trabajador_id,categoria,semana,archivo,nombre_archivo,cfdi_total) values($1,$2,$3,'CFDI_NOMINA','S1','f.xml','f.xml',1999.99)",[x,ids.obra,ids.w]);
  await no(rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'TIMBRADO'}),/diferencias/);
  await owner(db,'update public.documentos set cfdi_total=2000 where id=$1',[x]);
  await rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'TIMBRADO'});checks++;
  await no(rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'PAGADO'}),/saldos/);
 });
 await run(async db=>{
  const s=snapshot(ids.w,1200,0);s.items[0].metodo_pago='CHEQUE';s.modelo.filas[0].pago='CHEQUE';
  const c=await ready(db,s),det=await rpc(db,'conta','DETALLE',{cierre_id:c});
  const q=det.cheques[0];assert(q,'NOI crea pendiente positivo');checks++;
  await no(owner(db,"update public.cheques set estatus='EXPEDIDO',num_cheque='999',consecutivo='1' where id=$1",[q.id]),/Autoriza|autoriza/);
  await rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});
  await no(owner(db,"update public.cheques set importe=1199.99,estatus='EXPEDIDO',num_cheque='999',consecutivo='1' where id=$1",[q.id]),/coincide|neto|NOI/i);
  await actor(db,'conta');await db.query("update public.cheques set estatus='EXPEDIDO',num_cheque='999',consecutivo='1' where id=$1",[q.id]);
  let d=await rpc(db,'conta','DETALLE',{cierre_id:c});assert.equal(d.saldos[0].saldo,0);assert.equal(d.saldos[0].entrega_pendiente,1200);checks++;
  await actor(db,'conta');await db.query("update public.cheques set estatus='ENTREGADO' where id=$1",[q.id]);
  d=await rpc(db,'conta','DETALLE',{cierre_id:c});assert.equal(d.saldos[0].pago_registrado,1200);assert.equal(d.saldos[0].entrega_pendiente,0);checks++;
  await no(owner(db,"update public.cheques set importe=1 where id=$1",[q.id]),/Comprobante aplicado/);
 });
 await run(async db=>{
  await owner(db,"update public.trabajadores set estatus='BAJA',fecha_baja=(select fecha_inicio from public.obras where id=$2),monto_finiquito=1200 where id=$1",[ids.w,ids.obra]);
  const s=snapshot(ids.w,1200,0);s.items[0].tipo='FINIQUITO';s.items[0].metodo_pago='CHEQUE';s.modelo.filas[0].fin=true;s.modelo.filas[0].pago='CHEQUE';s.total_nomina=0;s.total_finiquitos=1200;
  const c=await ready(db,s),p=uuid();
  await rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});
  await owner(db,"insert into public.pagos(id,obra_id,trabajador_id,semana,importe,estado,medio,banco,fecha_pago,folio_lote,origen) values($1,$2,$3,'S1',1200,'EXITOSO','TRANSFERENCIA','BBVA',current_date,'FIN-FICTICIO','GLOBAL')",[p,ids.obra,ids.w]);
  const args={trabajador_id:ids.w,semana:1,pago_id:p,motivo:'Transferencia ficticia confirmada',confirmacion:'CONFIRMAR TRANSFERENCIA'};
  await no(rpc(db,'conta','TRANSFERIR_FINIQUITO',args),/permiso|autoriz/i);
  await owner(db,"insert into public.control_permisos_cheques(user_id,puede_conciliar_transferencia,otorgado_por) values($1,true,'PRUEBA FICTICIA')",[ids.conta]);
  await no(rpc(db,'conta','TRANSFERIR_FINIQUITO',{...args,pago_id:null}),/transferencia|comprobante/i);
  const before=(await owner(db,'select to_jsonb(t) j from public.trabajadores t where id=$1',[ids.w])).rows[0].j;
  const r=await rpc(db,'conta','TRANSFERIR_FINIQUITO',args);assert.equal(r.estado,'CONCILIADO_BANCO');checks++;
  const d=await rpc(db,'conta','DETALLE',{cierre_id:c});assert.equal(d.saldos[0].saldo,0);assert.equal(d.saldos[0].metodo,'TRANSFERENCIA');assert(d.cheques.every(q=>q.estatus==='CANCELADO'||q.eliminado));checks++;
  const after=(await owner(db,'select to_jsonb(t) j from public.trabajadores t where id=$1',[ids.w])).rows[0].j;assert.deepEqual(after,before);checks++;
  assert.equal((await rpc(db,'conta','PERMISOS')).admin,false);checks++;
 });
 await run(async db=>{
  const c=await ready(db);await rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});
  const p=uuid();await owner(db,"insert into public.pagos(id,obra_id,trabajador_id,semana,importe,estado,medio,banco,fecha_pago,folio_lote,origen) values($1,$2,$3,'S1',2000,'EXITOSO','TRANSFERENCIA','BBVA',current_date,'PRUEBA-CONSERVAR','GLOBAL')",[p,ids.obra,ids.w]);
  const before=await rpc(db,'conta','DETALLE',{cierre_id:c});assert.equal(before.saldos[0].saldo,0);
  // Retiro de un cierre y recreación del mismo periodo: ni duplicar ni perder la obligación lógica.
  await actor(db,'admin');await db.query("select public.control_eliminar_cierre_admin($1,'ELIMINAR S1','Prueba de conservación de versiones')",[c]);
  assert.equal((await owner(db,'select vigente from public.control_obligaciones_pago')).rows[0].vigente,false);checks++;
  const nuevo=await ready(db);await rpc(db,'admin','TRANSICION',{cierre_id:nuevo,estado:'AUTORIZADO'});
  const d=await rpc(db,'conta','DETALLE',{cierre_id:nuevo});assert.equal(d.saldos.length,1);assert.equal(d.saldos[0].id,before.saldos[0].id);assert.equal(d.saldos[0].pago_registrado,2000);assert.equal(d.saldos[0].saldo,0);checks++;
  assert.equal(d.aplicaciones.length,1);assert.notEqual(d.aplicaciones[0].version_id,d.saldos[0].version_id);checks++;
 });
 await run(async db=>{
  const c=await ready(db),b=await rpc(db,'admin','BANDEJA');assert.equal(b.centros.length,2);checks++;
  await no(rpc(db,'conta','BANDEJA'),/administrador/);
  const scope=await rpc(db,'jire','BANDEJA',{obra_id:ids.otra});assert.equal(scope.centros.length,1);assert.equal(scope.centros[0].empresa,'JIRE');checks++;
  await no(rpc(db,'jire','BANDEJA',{obra_id:ids.obra}),/permiso/);
  const det=await rpc(db,'conta','DETALLE',{cierre_id:c});
  await owner(db,"insert into public.pagos(id,obra_id,trabajador_id,semana,importe,estado,medio,banco,fecha_pago,folio_lote,origen) values($1,$2,$3,'S1',2000,'EXITOSO','TRANSFERENCIA','BBVA',current_date,'PREVIO-AUTORIZACION','GLOBAL')",[uuid(),ids.obra,ids.w]);
  await rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});
  const d=await rpc(db,'conta','DETALLE',{cierre_id:c});assert.equal(d.saldos[0].saldo,0,'Comprobante importado primero se vincula al autorizar');checks++;
  await no(rpc(db,'jire','COMPROBANTES',{obligacion_id:d.saldos[0].id,semana:1}),/permiso/);
  const proof=await rpc(db,'conta','COMPROBANTES',{obligacion_id:d.saldos[0].id,semana:1});assert.equal(proof.pagos.length,1);checks++;
 });
 await run(async db=>{
  const c=await ready(db);await owner(db,'update public.obras set fecha_inicio=fecha_inicio-7 where id=$1',[ids.obra]);
  const s=snapshot();s.desde=new Date(new Date(s.desde+'T12:00Z').getTime()-7*864e5).toISOString().slice(0,10);s.hasta=new Date(new Date(s.hasta+'T12:00Z').getTime()-7*864e5).toISOString().slice(0,10);
  const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1}),proposal={snapshot:s,fuente:source.fuente};
  await no(rpc(db,'conta','PREPARAR',{cierre_id:c,...proposal}),/histórica.*aprobación/);
  const req=await rpc(db,'conta','SOLICITAR',{cierre_id:c,tipo:'REGULARIZACION',motivo:'Rectificar periodo histórico ficticio',propuesta:proposal});
  const current=await rpc(db,'conta','DETALLE',{cierre_id:c});assert.equal(current.cierre.snapshot.desde,snapshot().desde,'Solicitar no aplica la propuesta');checks++;
  await rpc(db,'admin','DECIDIR',{solicitud_id:req.solicitud_id,aprobar:true,confirmacion:'CONFIRMAR DECISION',nota:'Prueba de aprobación exacta del histórico'});
  const modified=JSON.parse(JSON.stringify(s));modified.modelo.filas[0].neto=1999;modified.items[0].monto=1999;modified.total_neto=1999;
  await no(rpc(db,'conta','PREPARAR',{cierre_id:c,snapshot:modified,fuente:source.fuente,solicitud_id:req.solicitud_id}),/histórica.*aprobación/);
  await rpc(db,'conta','PREPARAR',{cierre_id:c,...proposal,solicitud_id:req.solicitud_id});checks++;
 });
 console.log('PASS '+checks+' casos adicionales: permisos, PDF/XML, emisión/entrega, excepción contable, reconstrucción, bandejas e historia aprobada exacta.');
})().catch(e=>{console.error(e.message,e.stack);process.exit(1);});
