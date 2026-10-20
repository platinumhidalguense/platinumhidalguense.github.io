// PostgreSQL real en WASM, esquema de integración y datos ficticios.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {makeDatabase:base,ids,actor,owner,rpc,pagos,snapshot,clock}=require('./soporte_pagos_sabado_pg.cjs');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;},no=async(p,re)=>{await assert.rejects(p,re);n++;};
async function make(){const db=await base();try{
 for(const suffix of ['_cheques_cancelacion_fisica_y_papelera.sql','_conciliacion_finiquitos_y_seleccion_pagos.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
 return db;
}catch(e){await db.close();throw e;}}
async function ready(db,fin=false){
 const d=(await owner(db,'select fecha_inicio::text d from obras where id=$1',[ids.obra])).rows[0].d;
 if(fin)await owner(db,"update trabajadores set estatus='BAJA',fecha_baja=$2,monto_finiquito=1200 where id=$1",[ids.w,d]);
 const s=snapshot(ids.w,fin?1200:2000,0);if(fin){s.items[0].tipo='FINIQUITO';s.items[0].metodo_pago='CHEQUE';s.modelo.filas[0].fin=true;s.modelo.filas[0].pago='CHEQUE';s.total_nomina=0;s.total_finiquitos=1200;}
 const f=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1}),c=(await rpc(db,'conta','CREAR',{snapshot:s,fuente:f.fuente})).cierre_id;
 const det=await rpc(db,'conta','DETALLE',{cierre_id:c});await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:c,filas:[{trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PERSONA PRUEBA',tipo_calculo:fin?'FINIQUITO':'NOMINA',metodo_pago:fin?'CHEQUE':'TRANSFERENCIA',monto_noi:fin?1200:2000}],archivo:'FICTICIO.xlsx',sha256:'b'.repeat(64),revision:det.cierre.snapshot_sha256});return c;
}
const finList=(db,key='conta')=>pagos(db,key,'FINIQUITOS',{obra_id:ids.obra,semana:1});
const transfer=(db,key,p)=>rpc(db,key,'TRANSFERIR_FINIQUITO',{trabajador_id:ids.w,semana:1,pago_id:p,motivo:'Comprobante ficticio revisado exactamente',confirmacion:'CONFIRMAR TRANSFERENCIA'});
(async()=>{
 let db=await make();try{
  const c=await ready(db);const since=(await owner(db,'select fecha_inicio::text d from obras where id=$1',[ids.obra])).rows[0].d,day=new Date(since+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+5);await clock(db,day.toISOString().slice(0,10)+'T12:00:00-06:00');
  let p=await pagos(db,'admin','PROPUESTA',{obra_id:ids.obra,semana:1,estado:'PENDIENTES'});ok(p.filas.length===1&&p.filas[0].estado==='PENDIENTE_AUTORIZACION','El filtro conserva pendientes bloqueados');
  await no(pagos(db,'admin','CREAR',{obra_id:ids.obra,semana:1,ids:[ids.w],huella:p.huella,clave_idempotencia:crypto.randomUUID(),motivo:'Prueba ficticia de bloqueo',confirmacion:'CREAR CHEQUES CONFIRMADOS'}),/elegible/i);
  await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,estado,importe,origen) values($1,$2,'S1','TRANSFERENCIA','EXITOSO',2000,'INDIVIDUAL')",[ids.obra,ids.w]);
  p=await pagos(db,'admin','PROPUESTA',{obra_id:ids.obra,semana:1,estado:'PENDIENTES'});ok(p.total===0&&p.filas.length===0,'No llena la primera pantalla con pagados');
  p=await pagos(db,'admin','PROPUESTA',{obra_id:ids.obra,semana:1,estado:''});ok(p.total===1&&p.filas[0].estado==='TRANSFERENCIA_REGISTRADA','Todos permite consultar pagados sin seleccionarlos');
  await no(finList(db,'jire'),/permiso/i);await no(finList(db,null),/permission denied|permiso/i);
 }finally{await db.close();}
 db=await make();try{
  await ready(db,true);const q=(await owner(db,'select * from cheques')).rows[0];let rows=await finList(db);ok(rows.filas[0].estado==='SIN_TRANSFERENCIA','No confunde CFDI con pago bancario');
  const bank=crypto.randomUUID();await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,medio,estado,importe,origen) values($1,$2,$3,'S1','TRANSFERENCIA','EXITOSO',500,'INDIVIDUAL')",[bank,ids.obra,ids.w]);
  ok((await finList(db)).filas[0].estado==='REVISAR_TRANSFERENCIAS','Parcial no retira cheque completo');
  await owner(db,"update pagos set importe=1200,estado='RECHAZADO' where id=$1",[bank]);ok((await finList(db)).filas[0].estado==='SIN_TRANSFERENCIA','Rechazo no cuenta como pago');
  await owner(db,"update pagos set estado='EXITOSO',semana='S2' where id=$1",[bank]);ok((await finList(db)).filas[0].estado==='SIN_TRANSFERENCIA','Otra semana no cubre finiquito');
  await owner(db,"update pagos set semana='S1',trabajador_id=$2 where id=$1",[bank,ids.w2]);ok((await finList(db)).filas[0].estado==='SIN_TRANSFERENCIA','Otro trabajador no cubre finiquito');
  await owner(db,"update pagos set trabajador_id=$2 where id=$1",[bank,ids.w]);rows=await finList(db);ok(rows.filas[0].estado==='LISTO_TRANSFERENCIA'&&rows.filas[0].pago_id===bank,'Exacto propone, nunca retira al leer');
  ok(!(await owner(db,'select eliminado from cheques where id=$1',[q.id])).rows[0].eliminado,'Leer no escribe');
  let permissions=await pagos(db,'conta','PERMISOS',{obra_id:ids.obra});ok(!permissions.transferencia,'No amplía el permiso especial de contabilidad');
  await no(transfer(db,'conta',bank),/permiso/i);await no(transfer(db,'consulta',bank),/permiso/i);
  await owner(db,"insert into control_permisos_cheques(user_id,puede_conciliar_transferencia,otorgado_por) values($1,true,'PRUEBA')",[ids.conta]);
  permissions=await pagos(db,'conta','PERMISOS',{obra_id:ids.obra});ok(permissions.transferencia,'Contadora autorizada puede conciliar exactos');
  // Un cheque físico no se borra ni se sustituye.
  await owner(db,"update cheques set num_cheque='FISICO-1',consecutivo='1' where id=$1",[q.id]);ok((await finList(db)).filas[0].estado==='CHEQUE_FISICO','Folios prevalecen sobre coincidencia bancaria');await no(transfer(db,'admin',bank),/numeración|expedido/i);
  await owner(db,"update cheques set num_cheque='',consecutivo='' where id=$1",[q.id]);
  const bankBefore=(await owner(db,'select to_jsonb(p) j from pagos p where id=$1',[bank])).rows[0].j,workerBefore=(await owner(db,'select to_jsonb(w) j from trabajadores w where id=$1',[ids.w])).rows[0].j;
  const r=await transfer(db,'conta',bank);ok(r.estado==='CONCILIADO_BANCO','La autoridad confirma evidencia exacta');
  const after=(await owner(db,'select * from cheques where id=$1',[q.id])).rows[0];ok(after.eliminado&&after.estatus==='PENDIENTE','Se elimina, NO se marca cancelado');
  ok((await finList(db)).filas.length===0,'Desaparece de pendientes en el mismo flujo');
  ok((await owner(db,'select count(*)::int n from control_finiquitos_transferencia where pago_id=$1',[bank])).rows[0].n===1,'Excepción bancaria vincula el pago y conserva rastro');
  assert.deepEqual((await owner(db,'select to_jsonb(p) j from pagos p where id=$1',[bank])).rows[0].j,bankBefore);n++;
  assert.deepEqual((await owner(db,'select to_jsonb(w) j from trabajadores w where id=$1',[ids.w])).rows[0].j,workerBefore);n++;
  await actor(db,'conta');ok((await db.query('select control_generar_cheques_pendientes($1,1) n',[ids.obra])).rows[0].n===0,'El generador no recrea el finiquito transferido');
  await no(transfer(db,'conta',bank),/ya tiene/i);ok((await owner(db,'select count(*)::int n from control_finiquitos_transferencia where pago_id=$1',[bank])).rows[0].n===1,'Reintento no duplica excepción');
 }finally{await db.close();}
 console.log('PASS '+n+' comprobaciones PostgreSQL: filtro de pendientes, autorización, evidencia exacta, parcial/rechazo/semana/identidad, permiso contable, cheque físico, eliminación auditada y no regeneración.');
})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
