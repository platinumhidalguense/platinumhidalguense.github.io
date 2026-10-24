// Semana 31 futura: el pago no se presume al autorizar ni se genera cheque normal.
const base=require('./soporte_cierres_actuales_pg.cjs'),assert=require('node:assert/strict'),crypto=require('crypto');
const {ids,owner,rpc}=base;
(async()=>{const db=await base.makeDatabase();try{
 const s=base.snapshot(ids.w,2000),shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 s.desde=shift(s.desde,7);s.hasta=shift(s.hasta,7);s.semana=31;s.modelo.sem='S31';
 await owner(db,'update obras set fecha_inicio=$2 where id=$1',[ids.obra,shift(s.desde,-30*7)]);
 await owner(db,"update trabajadores set rfc='PRUP900101AA1' where id=$1",[ids.w]);
 const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:31});const id=(await rpc(db,'conta','CREAR',{obra_id:ids.obra,semana:31,periodo:'SEMANAL',snapshot:s,fuente:source.fuente})).cierre_id;
 const revision=(await rpc(db,'conta','DETALLE',{cierre_id:id})).cierre.snapshot_sha256;
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:id,archivo:'FICTICIO-S31.xlsx',sha256:'a'.repeat(64),revision,filas:[{trabajador_id:ids.w,trabajador_numero:1,tipo_calculo:'NOMINA',monto_noi:2000,detalle:{identidad_noi:{version:1,rfc:'PRUP900101AA1'}}}]});
 await rpc(db,'conta','TRANSICION',{cierre_id:id,estado:'AUTORIZADO'});
 let d=await rpc(db,'conta','DETALLE',{cierre_id:id});assert.equal(d.saldos[0].saldo,2000);assert.equal(d.cheques.length,0);assert.equal(d.aplicaciones.length,0);
 // Comprobante bancario sintético importado con misma obra, persona, semana y neto.
 await owner(db,"insert into pagos(obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote) values($1,$2,'S31','TRANSFERENCIA','BBVA',2000,'EXITOSO',$3,'S31-FICTICIO')",[ids.obra,ids.w,s.hasta]);
 d=await rpc(db,'conta','DETALLE',{cierre_id:id});assert.equal(d.saldos[0].saldo,0);assert.equal(d.aplicaciones.length,1);assert.equal(d.cheques.length,0);assert.equal(d.cierre.estado,'AUTORIZADO');
 await assert.rejects(rpc(db,'consulta','VINCULAR_COMPROBANTES_LOTE',{cierre_id:id}),/consulta|escritura|permiso/i);
 await assert.rejects(rpc(db,'admin','TRANSICION',{cierre_id:id,estado:'TIMBRADO'}),/PDF|XML/);
 console.log('PASS 9 controles S31: fotografía/NOI/autorización, pago pendiente sin cheque normal, importación enlazada automáticamente en periodo abierto, sin duplicar ni timbrar sin CFDI.');
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
