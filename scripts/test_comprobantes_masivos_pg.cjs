const assert=require('node:assert/strict'),crypto=require('crypto'),base=require('./soporte_cierres_actuales_pg.cjs');
const {owner,rpc,ids}=base;
(async()=>{const db=await base.makeDatabase();try{
 const s=base.snapshot(ids.w,100),shift=d=>new Date(Date.parse(d+'T12:00:00Z')-14*86400000).toISOString().slice(0,10);s.desde=shift(s.desde);s.hasta=shift(s.hasta);
 await owner(db,'update obras set fecha_inicio=$2 where id=$1',[ids.obra,s.desde]);
 const rows=[],noi=[];
 const cantidad=358;
 for(let i=0;i<cantidad;i++){
  const tid=i===0?ids.w:i===1?ids.w2:crypto.randomUUID(),rfc='PRUP900101'+i.toString(36).toUpperCase().padStart(3,'0');
  if(i<2)await owner(db,'update trabajadores set rfc=$2 where id=$1',[tid,rfc]);
  else await owner(db,"insert into trabajadores(id,obra_id,no_trab,nombres,primer_apellido,estatus,fecha_alta,sd,sdi,sal_semanal,contratista,cuenta,forma_pago,rfc) values($1,$2,$3,'PERSONA','FICTICIA','ACTIVO','2026-01-01',300,320,100,'MG','1234567890','TRANSFERENCIA',$4)",[tid,ids.obra,i+1,rfc]);
  const row=JSON.parse(JSON.stringify(s.modelo.filas[0]));row.w.id=tid;row.w.no_trab=i+1;rows.push(row);
  noi.push({trabajador_id:tid,trabajador_numero:i+1,tipo_calculo:'NOMINA',monto_noi:100,detalle:{identidad_noi:{version:1,rfc}}});
  await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote) values($1,$2,'S1','TRANSFERENCIA','BBVA',100,'EXITOSO',$3,$4)",[ids.obra,tid,s.hasta,'FICTICIO-'+i]);
 }
 s.modelo.filas=rows;s.modelo.neto=cantidad*100;s.total_neto=cantidad*100;s.total_nomina=cantidad*100;s.total_trabajadores=cantidad;
 s.items=rows.map((f,i)=>({...s.items[0],trabajador_id:f.w.id,numero:i+1,nombre:'PERSONA FICTICIA'}));
 const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});const c=(await rpc(db,'conta','CREAR',{obra_id:ids.obra,semana:1,periodo:'SEMANAL',snapshot:s,fuente:source.fuente})).cierre_id;
 const revision=(await rpc(db,'conta','DETALLE',{cierre_id:c})).cierre.snapshot_sha256;
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:c,filas:noi,archivo:'FICTICIO.xlsx',sha256:'d'.repeat(64),revision});
 await rpc(db,'conta','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});
 const plan=await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:c});assert.equal(plan.vinculables,cantidad);
 const args={cierre_id:c,plan_sha256:plan.plan_sha256,confirmacion:'VINCULAR S1'},start=performance.now();
 let restantes=cantidad,lotes=0;while(restantes>0){const r=await rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',args);assert.equal(r.vinculados,Math.min(20,restantes));restantes-=r.vinculados;assert.equal(Number(r.restantes),restantes);assert.equal(r.plan_sha256,plan.plan_sha256);lotes++;}
 assert.equal(lotes,18);
 const repeated=await rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',args);assert.equal(repeated.vinculados,0);
 assert.equal(Number((await owner(db,'select sum(importe) importe from control_pago_aplicaciones where retirado_en is null')).rows[0].importe),cantidad*100);
 assert.equal((await rpc(db,'admin','DETALLE',{cierre_id:c})).cierre.estado,'AUTORIZADO');
 console.log('PASS lote SQL grande: 358 obligaciones, 18 lotes de máximo 20, misma revisión, repetición idempotente, sumas y sin marcar pagado; '+Math.round(performance.now()-start)+' ms en VM.');
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
