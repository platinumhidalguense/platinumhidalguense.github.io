const assert=require('node:assert/strict'),crypto=require('crypto'),base=require('./soporte_cierres_actuales_pg.cjs');
const {rpc,owner,ids}=base;let n=0;
(async()=>{const db=await base.makeDatabase();try{
 const s=base.snapshot(ids.w,550,50),c2=crypto.randomUUID(),w2=ids.w2;
 const shift=d=>new Date(Date.parse(d+'T12:00:00Z')-14*86400000).toISOString().slice(0,10);s.desde=shift(s.desde);s.hasta=shift(s.hasta);
 await owner(db,'update obras set fecha_inicio=$2 where id=$1',[ids.obra,s.desde]);
 await owner(db,"update trabajadores set rfc=case when id=$1 then 'PRUA900101AB1' else 'PRUB900101AB2' end where obra_id=$2",[ids.w,ids.obra]);
 const m=JSON.parse(JSON.stringify(s.modelo.filas[0]));m.w.id=w2;m.w.no_trab=2;m.fin=true;m.sueldo=100;m.neto=100;m.prevision=0;m.pago='CHEQUE';
 s.modelo.filas.push(m);s.items.push({trabajador_id:w2,numero:2,nombre:'PRUEBA PERSONA',tipo:'FINIQUITO',metodo_pago:'CHEQUE',monto:100});s.total_neto=650;s.total_finiquitos=100;s.total_trabajadores=2;s.modelo.neto=650;
 const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});const cid=(await rpc(db,'conta','CREAR',{obra_id:ids.obra,semana:1,periodo:'SEMANAL',snapshot:s,fuente:source.fuente})).cierre_id;
 const rev=(await rpc(db,'conta','DETALLE',{cierre_id:cid})).cierre.snapshot_sha256;
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:cid,archivo:'FICTICIO',sha256:'a'.repeat(64),revision:rev,filas:[{trabajador_id:ids.w,trabajador_numero:1,tipo_calculo:'NOMINA',monto_noi:500,detalle:{identidad_noi:{version:1,rfc:'PRUA900101AB1'}}},{trabajador_id:w2,trabajador_numero:2,tipo_calculo:'FINIQUITO',monto_noi:100,detalle:{identidad_noi:{version:1,rfc:'PRUB900101AB2'}}}]});
 await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'AUTORIZADO'});
 const pay=async(tid,amount,folio)=>{const id=crypto.randomUUID();await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote) values($1,$2,$3,'S1','TRANSFERENCIA','BBVA',$4,'EXITOSO',$5,$6)",[id,ids.obra,tid,amount,s.hasta,folio]);return id;};
 const p=await pay(ids.w,550,'TOTAL-NOMINA');await pay(w2,100,'FIN-SIN-AUTORIZAR');
 let plan=await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:cid});assert.equal(plan.vinculables,2);assert.equal(plan.filas.find(x=>x.tipo==='FINIQUITO').estado,'SIN_COMPROBANTE_EXACTO');n+=2;
 await assert.rejects(rpc(db,'conta','VINCULAR_COMPROBANTES_LOTE',{cierre_id:cid,plan_sha256:plan.plan_sha256,confirmacion:'VINCULAR S1'}),/administrador/);n++;
 const old=plan.plan_sha256;await pay(ids.w,550,'OTRA-TRANSFERENCIA');
 await assert.rejects(rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',{cierre_id:cid,plan_sha256:old,confirmacion:'VINCULAR S1'}),/cambiaron/);n++;
 plan=await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:cid});assert.equal(plan.vinculables,0);assert(plan.filas.filter(x=>x.tipo!=='FINIQUITO').every(x=>x.estado==='COMPROBANTES_AMBIGUOS'));n+=2;
 await owner(db,"delete from pagos where folio_lote='OTRA-TRANSFERENCIA'");
 // Cheque físico expedido acreditado; uno sin llenar jamás sirve de respaldo.
 const q=(await owner(db,"select id from cheques where trabajador_id=$1 and semana='S1' and tipo_pago='FINIQUITO'",[w2])).rows[0].id;
 assert.equal((await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:cid})).vinculables,2);n++;
 // Semilla local de talonario físico: la validación de expedición se prueba en su suite específica.
 await db.exec('reset role');await db.exec('alter table public.cheques disable trigger trg_control_validar_neto_cheque_noi');
 await owner(db,"update cheques set num_cheque='100100',consecutivo='00100',estatus='EXPEDIDO' where id=$1",[q]);
 await db.exec('alter table public.cheques enable trigger trg_control_validar_neto_cheque_noi');
 // Simular evidencia física heredada, capturada antes de crear el cierre integrado.
 await owner(db,'delete from control_pago_aplicaciones');await owner(db,'delete from control_evidencias_pago');
 plan=await rpc(db,'admin','PLAN_COMPROBANTES',{cierre_id:cid});assert.equal(plan.vinculables,3,JSON.stringify(plan.filas));n++;
 const applied=await rpc(db,'admin','VINCULAR_COMPROBANTES_LOTE',{cierre_id:cid,plan_sha256:plan.plan_sha256,confirmacion:'VINCULAR S1'});assert.equal(applied.vinculados,3);assert.equal(Number(applied.pendientes),0);n+=2;
 const totals=(await owner(db,'select sum(pago_registrado) pago,sum(saldo) saldo,sum(entrega_pendiente) entrega from control_saldos_pago where cierre_id=$1',[cid])).rows[0];assert.equal(Number(totals.pago),650);assert.equal(Number(totals.saldo),0);assert.equal(Number(totals.entrega),100);n+=3;
 assert.equal(Number((await owner(db,'select count(*) n from control_evidencias_pago')).rows[0].n),2);n++;
 assert.equal((await owner(db,'select estatus from cheques where id=$1',[q])).rows[0].estatus,'EXPEDIDO');n++;
 assert.equal((await owner(db,'select estado from control_cierres_nomina where id=$1',[cid])).rows[0].estado,'AUTORIZADO');n++;
 console.log('PASS '+n+' controles de lote: nómina/previsión sin doble suma, finiquito sin permiso, ambiguos, fuente cambiada, cheque pendiente/físico, entrega separada y sin transición implícita.');
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
