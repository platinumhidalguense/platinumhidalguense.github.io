// Datos ficticios. Prueba la política NUEVA sobre el mismo núcleo financiero.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeDatabase,ids,owner,actor,rpc,pagos,snapshot,clock}=require('./soporte_pagos_sabado_pg.cjs');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};const no=async(f,re)=>{await assert.rejects(f,re);n++;};
async function ready(db,opts={}){
 const s=snapshot(ids.w,opts.neto||2000,0);s.items[0].metodo_pago='POR DEFINIR';s.modelo.filas[0].pago='POR DEFINIR';
 if(opts.fin){s.items[0].tipo='FINIQUITO';s.items[0].metodo_pago='CHEQUE';s.modelo.filas[0].fin=true;s.modelo.filas[0].pago='CHEQUE';s.total_finiquitos=s.total_neto;s.total_nomina=0;}
 const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});const created=await rpc(db,'conta','CREAR',{obra_id:ids.obra,semana:1,periodo:'SEMANAL',snapshot:s,fuente:source.fuente});
 const c=created.cierre_id,d=await rpc(db,'conta','DETALLE',{cierre_id:c});
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:c,filas:[{trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PERSONA PRUEBA',tipo_calculo:opts.fin?'FINIQUITO':'NOMINA',metodo_pago:'CHEQUE',monto_noi:s.total_neto}],archivo:'FICTICIO.xlsx',sha256:'a'.repeat(64),revision:d.cierre.snapshot_sha256});
 if(!opts.draft){await rpc(db,'conta','TRANSICION',{cierre_id:c,estado:'REVISADO'});await rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});}
 return c;
}
async function dates(db){const inicio=(await owner(db,'select fecha_inicio::text d from obras where id=$1',[ids.obra])).rows[0].d;const d=new Date(inicio+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+5);return{sat:d.toISOString().slice(0,10),inicio};}
async function proposal(db,key='conta'){return pagos(db,key,'PROPUESTA',{obra_id:ids.obra,semana:1});}
async function create(db,d,key='conta',args={}){return pagos(db,key,'CREAR',{obra_id:ids.obra,semana:1,ids:[ids.w],huella:d.huella,clave_idempotencia:crypto.randomUUID(),motivo:'No existe pago registrado; revisión ficticia',confirmacion:'CREAR CHEQUES CONFIRMADOS',...args});}
async function run(f){const db=await makeDatabase();try{await f(db);}finally{await db.close();}}
(async()=>{
 await run(async db=>{
  const {sat}=await dates(db);await clock(db,sat+'T11:59:59-06:00');const c=await ready(db);
  ok((await owner(db,'select count(*)::int n from cheques')).rows[0].n===0,'NOI no crea cheque de nómina, aun si la UI antigua pidió CHEQUE');
  ok((await owner(db,'select metodo_pago from control_conciliacion_noi where cierre_id=$1',[c])).rows[0].metodo_pago==='TRANSFERENCIA','La intención de transferencia no afirma pago');
  await actor(db,'conta');ok((await db.query('select public.control_generar_cheques_pendientes($1,1) n',[ids.obra])).rows[0].n===0,'Generador legado sólo finiquitos');
  let p=await proposal(db);ok(p.filas[0].estado==='ESPERAR_SABADO_12'&&!p.habilitado,'11:59:59 CDMX todavía no habilita');
  await no(()=>create(db,p,'conta',{ahora:sat+'T12:01:00-06:00'}),/sábado|confirma/i);
  await clock(db,sat+'T12:00:00-06:00');p=await proposal(db);ok(p.habilitado&&p.filas[0].estado==='ELEGIBLE_CONFIRMACION','12:00 exactas, sin pago y con NOI conciliado');
  await no(()=>create(db,p,'consulta'),/permiso/i);await no(()=>create(db,p,'jire'),/permiso/i);await no(()=>pagos(db,null,'PROPUESTA',{obra_id:ids.obra,semana:1}),/permission denied|sesión|permiso/i);
  await no(()=>create(db,p,'conta',{confirmacion:''}),/confirma/i);
  const key=crypto.randomUUID(),r=await create(db,p,'conta',{clave_idempotencia:key});ok(r.creados===1,'Confirmación crea sólo pendiente, no expedido');
  const q=(await owner(db,'select * from cheques')).rows[0];ok(q.estatus==='PENDIENTE'&&!q.num_cheque&&!q.consecutivo&&q.lote_nomina_id===r.lote_id,'Sin folios inventados');
  const again=await create(db,p,'conta',{clave_idempotencia:key});ok(again.repetida&&(await owner(db,'select count(*)::int n from cheques')).rows[0].n===1,'Doble confirmación idempotente');
  await no(()=>create(db,p),/cambió/i);
  await actor(db,'consulta');await no(()=>db.exec('update control_lotes_cheques_nomina set motivo=\'alterar\''),/permission denied/i);
  await actor(db,'jire');ok((await db.query('select count(*)::int n from control_lotes_cheques_nomina')).rows[0].n===0,'RLS entre razones sociales');
  await actor(db,'conta');await db.query("update cheques set estatus='EXPEDIDO',num_cheque='FICTICIO-1',consecutivo='1' where id=$1",[q.id]);
  let detail=await rpc(db,'conta','DETALLE',{cierre_id:c});ok(detail.saldos[0].saldo===0&&detail.saldos[0].entrega_pendiente===2000,'Expedido cubre obligación; entrega sigue pendiente');
  await actor(db,'conta');await db.query("update cheques set estatus='ENTREGADO' where id=$1",[q.id]);detail=await rpc(db,'conta','DETALLE',{cierre_id:c});ok(detail.saldos[0].entrega_pendiente===0,'Entregado no exige ni crea otro pago');
 });
 await run(async db=>{
  const {sat}=await dates(db);await clock(db,sat+'T12:00:00-06:00');const c=await ready(db);let p=await proposal(db);
  await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,estado,importe,banco,fecha_pago,folio_lote,origen) values($1,$2,'S1','TRANSFERENCIA','EXITOSO',2000,'BBVA',current_date,'GLOBAL-FICTICIO','GLOBAL')",[ids.obra,ids.w]);
  await no(()=>create(db,p),/cambió/i);p=await proposal(db);ok(p.filas[0].estado==='TRANSFERENCIA_REGISTRADA','Global exitoso excluye al trabajador');
  await no(()=>create(db,p),/elegible/i);
 });
 await run(async db=>{
  const {sat}=await dates(db);await clock(db,sat+'T12:00:00-06:00');await ready(db);let p=await proposal(db);await create(db,p);
  const q=(await owner(db,'select id from cheques')).rows[0];
  await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,estado,importe,banco,fecha_pago,folio_lote,origen) values($1,$2,'S1','TRANSFERENCIA','EXITOSO',2000,'OTRO',current_date,'INDIV-FICTICIO','INDIVIDUAL')",[ids.obra,ids.w]);
  await actor(db,'conta');await no(()=>db.query("update cheques set estatus='EXPEDIDO',num_cheque='NO-EMITIR',consecutivo='9' where id=$1",[q.id]),/transferencia|aplicación/i);
  ok((await proposal(db)).filas[0].estado==='TRANSFERENCIA_REGISTRADA','Individual posterior impide expedir y exige revisar el pendiente');
 });
 await run(async db=>{
  const {sat}=await dates(db);await clock(db,sat+'T12:00:00-06:00');await ready(db);
  await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,estado,importe,banco,fecha_pago,folio_lote,origen) values($1,$2,'S1','TRANSFERENCIA','RECHAZADO',2000,'BBVA',current_date,'RECHAZO-FICTICIO','GLOBAL')",[ids.obra,ids.w]);
  ok((await proposal(db)).filas[0].estado==='ELEGIBLE_CONFIRMACION','Rechazo no equivale a pago');
  await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,estado,importe,banco,fecha_pago,folio_lote,origen) values($1,$2,'S1','TRANSFERENCIA','EXITOSO',500,'BBVA',current_date,'PARCIAL-FICTICIO','INDIVIDUAL')",[ids.obra,ids.w]);
  const p=await proposal(db);ok(p.filas[0].estado==='REVISAR_IMPORTES_BANCARIOS','No genera cheque completo por un pago parcial');await no(()=>create(db,p),/elegible/i);
 });
 await run(async db=>{
  const {sat}=await dates(db);await clock(db,sat+'T12:00:00-06:00');await ready(db,{draft:true});let p=await proposal(db);ok(p.filas[0].estado==='PENDIENTE_AUTORIZACION','NOI solo no autoriza lote');
  await no(()=>create(db,p),/elegible/i);
 });
 await run(async db=>{
  const {sat}=await dates(db);await clock(db,sat+'T09:00:00-06:00');const c=await ready(db,{fin:true});const q=(await owner(db,'select * from cheques')).rows[0];ok(q.tipo_pago==='FINIQUITO'&&q.estatus==='PENDIENTE','Finiquito conserva cheque antes del sábado');
  ok((await proposal(db)).filas.length===0,'Finiquito no entra en lote de nómina');
  await actor(db,'conta');await db.query("update cheques set estatus='EXPEDIDO',num_cheque='FIN-1',consecutivo='1' where id=$1",[q.id]);ok((await rpc(db,'conta','DETALLE',{cierre_id:c})).saldos[0].saldo===0,'Finiquito conserva autorización y neto NOI');
 });
 console.log(`PASS política de pagos sábado: ${n} comprobaciones PostgreSQL actuales.`);
})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
