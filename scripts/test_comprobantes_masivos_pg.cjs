const assert=require('node:assert/strict'),crypto=require('crypto'),base=require('./soporte_cierres_actuales_pg.cjs');
const {owner,rpc,ids}=base;
(async()=>{const db=await base.makeDatabase();try{
 const s=base.snapshot(ids.w,100),shift=d=>new Date(Date.parse(d+'T12:00:00Z')-14*86400000).toISOString().slice(0,10);s.desde=shift(s.desde);s.hasta=shift(s.hasta);
 await owner(db,'update obras set fecha_inicio=$2 where id=$1',[ids.obra,s.desde]);
 const rows=[],noi=[];
 for(let i=0;i<25;i++){
  const tid=i===0?ids.w:i===1?ids.w2:crypto.randomUUID(),rfc='PRUP900101A'+String(i).padStart(2,'0');
  if(i<2)await owner(db,'update trabajadores set rfc=$2 where id=$1',[tid,rfc]);
  else await owner(db,"insert into trabajadores(id,obra_id,no_trab,nombres,primer_apellido,estatus,fecha_alta,sd,sdi,sal_semanal,contratista,cuenta,forma_pago,rfc) values($1,$2,$3,'PERSONA','FICTICIA','ACTIVO','2026-01-01',300,320,100,'MG','1234567890','TRANSFERENCIA',$4)",[tid,ids.obra,i+1,rfc]);
  const row=JSON.parse(JSON.stringify(s.modelo.filas[0]));row.w.id=tid;row.w.no_trab=i+1;rows.push(row);
  noi.push({trabajador_id:tid,trabajador_numero:i+1,tipo_calculo:'NOMINA',monto_noi:100,detalle:{identidad_noi:{version:1,rfc}}});
  await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote) values($1,$2,'S1','TRANSFERENCIA','BBVA',100,'EXITOSO',$3,$4)",[ids.obra,tid,s.hasta,'FICTICIO-'+i]);
 }
 s.modelo.filas=rows;s.modelo.neto=2500;s.total_neto=2500;s.total_nomina=2500;s.total_trabajadores=25;
 s.items=rows.map((f,i)=>({...s.items[0],trabajador_id:f.w.id,numero:i+1,nombre:'PERSONA FICTICIA'}));
 const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});const c=(await rpc(db,'conta','CREAR',{obra_id:ids.obra,semana:1,periodo:'SEMANAL',snapshot:s,fuente:source.fuente})).cierre_id;
 const revision=(await rpc(db,'conta','DETALLE',{cierre_id:c})).cierre.snapshot_sha256;
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:c,filas:noi,archivo:'FICTICIO.xlsx',sha256:'d'.repeat(64),revision});
 await rpc(db,'conta','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});
 const plan=await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:c});assert.equal(plan.vinculables,25);
 const args={cierre_id:c,plan_sha256:plan.plan_sha256,confirmacion:'VINCULAR S1'},start=performance.now();
 const first=await rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',args);assert.equal(first.vinculados,20);assert.equal(Number(first.restantes),5);assert.equal(first.plan_sha256,plan.plan_sha256);
 const second=await rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',args);assert.equal(second.vinculados,5);assert.equal(Number(second.restantes),0);assert.equal(second.plan_sha256,plan.plan_sha256);
 const repeated=await rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',args);assert.equal(repeated.vinculados,0);
 assert.equal(Number((await owner(db,'select sum(importe) importe from control_pago_aplicaciones where retirado_en is null')).rows[0].importe),2500);
 assert.equal((await rpc(db,'admin','DETALLE',{cierre_id:c})).cierre.estado,'AUTORIZADO');
 console.log('PASS 10 controles de lote SQL: 25 obligaciones, máximo 20 por transacción, continuación con misma revisión, repetición idempotente, sumas y sin marcar pagado; '+Math.round(performance.now()-start)+' ms en VM.');
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
