const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeDatabase,ids,rrhh,rpc,owner,snapshot}=require('./soporte_rrhh_pg.cjs');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
(async()=>{const db=await makeDatabase();try{
 const o=ids.obra;const start=await rrhh(db,'conta','INICIAR_CORTE',{obra_id:o,semana:1});
 const cut=()=>rrhh(db,'conta','PROCESO',{obra_id:o,id:start.id});
 const done=async(code,key='conta')=>{const d=await cut(),t=d.tareas.find(x=>x.codigo===code);await rrhh(db,key,'TAREA',{proceso_id:start.id,tarea_id:t.id,revision:t.revision,estado:'HECHO',nota:'Fuente ficticia revisada y comprobada'});};
 await done('MOV');await done('INC');
 const s=snapshot(ids.w,2000,0),src=await rpc(db,'conta','FUENTE',{obra_id:o,semana:1});const c=await rpc(db,'conta','CREAR',{obra_id:o,semana:1,periodo:'SEMANAL',snapshot:s,fuente:src.fuente});
 let d=await cut();ok(d.tareas.find(x=>x.codigo==='PRE').evidencia.valida,'Corte detecta fotografía preparada');
 await done('PRE');ok(!(await cut()).tareas.find(x=>x.codigo==='NOI').evidencia.valida,'No confunde fotografía con NOI importado');
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:c.cierre_id,filas:[{trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PERSONA PRUEBA',tipo_calculo:'NOMINA',metodo_pago:'TRANSFERENCIA',monto_noi:1999.99}],archivo:'FICTICIO.xlsx',sha256:'a'.repeat(64),revision:(await rpc(db,'conta','DETALLE',{cierre_id:c.cierre_id})).cierre.snapshot_sha256});
 ok(!(await cut()).tareas.find(x=>x.codigo==='NOI').evidencia.valida,'Un centavo de discrepancia bloquea revisión NOI');
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:c.cierre_id,filas:[{trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PERSONA PRUEBA',tipo_calculo:'NOMINA',metodo_pago:'TRANSFERENCIA',monto_noi:2000}],archivo:'FICTICIO.xlsx',sha256:'b'.repeat(64),revision:(await rpc(db,'conta','DETALLE',{cierre_id:c.cierre_id})).cierre.snapshot_sha256});
 await done('NOI');ok((await cut()).tareas.find(x=>x.codigo==='NOI').estado==='HECHO','Tarea deriva de conciliación existente');
 await rpc(db,'conta','TRANSICION',{cierre_id:c.cierre_id,estado:'REVISADO'});await rpc(db,'admin','TRANSICION',{cierre_id:c.cierre_id,estado:'AUTORIZADO'});
 await done('AUT','admin');ok(!(await cut()).tareas.find(x=>x.codigo==='PAG').evidencia.valida,'Autorizar no supone un pago');
 const p=crypto.randomUUID();await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,importe,estado,medio,banco,fecha_pago,folio_lote,origen) values($1,$2,$3,'S1',500,'EXITOSO','TRANSFERENCIA','BBVA',current_date,'PARCIAL_FICTICIO','INDIVIDUAL')",[p,o,ids.w]);
 let det=await rpc(db,'conta','DETALLE',{cierre_id:c.cierre_id});const obligation=det.saldos.find(x=>x.tipo==='NOMINA');await rpc(db,'conta','APLICAR_PAGO',{obligacion_id:obligation.id,pago_id:p,importe:500,clave_idempotencia:crypto.randomUUID(),motivo:'Pago parcial de prueba'});
 ok(!(await cut()).tareas.find(x=>x.codigo==='PAG').evidencia.valida,'Pago parcial mantiene pendiente');
 const p2=crypto.randomUUID();await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,importe,estado,medio,banco,fecha_pago,folio_lote,origen) values($1,$2,$3,'S1',1500,'EXITOSO','TRANSFERENCIA','BBVA',current_date,'RESTO_FICTICIO','GLOBAL')",[p2,o,ids.w]);
 // El flujo ya existente enlaza automáticamente un comprobante exacto al saldo.
 ok((await cut()).tareas.find(x=>x.codigo==='PAG').evidencia.valida,'Pago aplicado completo satisface tarea');await done('PAG');
 await owner(db,"insert into documentos(obra_id,trabajador_id,categoria,semana,archivo,nombre_archivo,cfdi_total) values($1,$2,'CFDI_NOMINA','S1','ficticio.xml','ficticio.xml',2000)",[o,ids.w]);
 await rpc(db,'conta','TRANSICION',{cierre_id:c.cierre_id,estado:'TIMBRADO'});await rpc(db,'conta','TRANSICION',{cierre_id:c.cierre_id,estado:'PAGADO'});
 ok((await cut()).tareas.find(x=>x.codigo==='COM').evidencia.valida,'Estado final deriva del cierre original');
 // Las tareas no reescribieron los importes originales ni emitieron pagos.
 det=await rpc(db,'conta','DETALLE',{cierre_id:c.cierre_id});ok(det.cierre.total_neto===2000&&det.saldos[0].saldo===0,'Dinero del flujo original conservado');
 console.log(`PASS RRHH financiero: ${n} comprobaciones PostgreSQL.`);
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
