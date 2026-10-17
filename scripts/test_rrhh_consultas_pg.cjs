const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeDatabase,ids,actor,owner,rpc,snapshot}=require('./soporte_rrhh_pg.cjs');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
async function query(db,key,a,j){await actor(db,key);return(await db.query('select control_rrhh_consultar($1,$2::jsonb) d',[a,JSON.stringify(j)])).rows[0].d;}
(async()=>{const db=await makeDatabase();try{
 const args={obra_id:ids.obra,trabajador_id:ids.w,semana:1};
 ok((await query(db,'consulta','BUSCAR',{obra_id:ids.obra,q:'1'})).trabajadores.length===1,'Busca por número en servidor');
 await assert.rejects(()=>query(db,'jire','BUSCAR',{obra_id:ids.obra}),/permiso/i);n++;
 ok((await query(db,'consulta','IMPORTE',args)).sin_cierre,'Sin cierre no inventa importe');
 const id=crypto.randomUUID(),s=snapshot(ids.w,2200,200);
 s.trazabilidad={trabajadores:{[ids.w]:{fuente:'REFERENCIA_FICTICIA',retenciones:[{id:'FUENTE-TEST',tipo:'FONACOT',monto_usado:20}],prevision:200}}};
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,1,'SEMANAL','PRUEBA','provisional',$3,$4)",[id,ids.obra,JSON.stringify(s),ids.conta]);
 const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});await rpc(db,'conta','PREPARAR',{cierre_id:id,snapshot:s,fuente:source.fuente});
 let q=await query(db,'consulta','IMPORTE',{...args,cierre_id:id});
 ok(q.origen==='BORRADOR_O_LEGADO'&&q.modelo.neto_fiscal===2000,'Borrador identificado y neto fiscal sin previsión');
 ok(q.modelo.prevision===null&&q.modelo.neto_total===null&&!('prevision' in q.referencias),'VIP oculto');
 ok(q.referencias.retenciones[0].id==='FUENTE-TEST','Referencia exacta, no correlación por nombre');
 q=await query(db,'admin','IMPORTE',{...args,cierre_id:id});ok(q.modelo.neto_total===2200&&q.modelo.prevision===200,'Admin conserva previsión separada');
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:id,filas:[{trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PERSONA PRUEBA',tipo_calculo:'NOMINA',metodo_pago:'TRANSFERENCIA',monto_noi:2000}],archivo:'NOI_FICTICIO.xlsx',sha256:'a'.repeat(64),revision:(await rpc(db,'conta','DETALLE',{cierre_id:id})).cierre.snapshot_sha256});
 await rpc(db,'conta','TRANSICION',{cierre_id:id,estado:'REVISADO'});await rpc(db,'admin','TRANSICION',{cierre_id:id,estado:'AUTORIZADO'});
 q=await query(db,'consulta','IMPORTE',{...args,cierre_id:id});ok(q.origen==='VERSION_AUTORIZADA'&&q.version===1,'Lee versión congelada');ok(q.saldos.length===1&&q.saldos[0].tipo==='NOMINA','No filtra obligación VIP a consulta');
 await owner(db,"insert into documentos(obra_id,trabajador_id,categoria,subtipo,semana,fecha_doc,archivo,nombre_archivo) values($1,$2,'RECIBO_NOMINA','SUELDO','S1',current_date,'PRIVADO_NO_DEVOLVER.pdf','RECIBO.pdf'),($1,$2,'OTRO','INCAPACIDAD MEDICA','S1',current_date,'SECRETO_SALUD.jpg','CERTIFICADO.jpg')",[ids.obra,ids.w]);
 await owner(db,"insert into historial(trabajador_id,obra_id,usuario,accion,datos_antes,datos_despues) values($1,$2,'usuario de prueba','EDITAR','{\"telefono\":\"SECRET_NUMBER\",\"salario_real\":99999,\"fecha_baja\":null}','{\"telefono\":\"CAMBIO\",\"salario_real\":99990,\"fecha_baja\":\"2026-10-01\"}')",[ids.w,ids.obra]);
 // Más de 1000 eventos: el endpoint pagina en PostgreSQL, nunca en el cliente.
 await owner(db,"insert into historial(trabajador_id,obra_id,usuario,accion) select $1,$2,'prueba','EDITAR' from generate_series(1,1003)",[ids.w,ids.obra]);
 let h=await query(db,'consulta','EXPEDIENTE',{...args,categoria:'DOCUMENTOS'});ok(h.total===1&&h.eventos.length===1,'Oculta documento médico a consulta');ok(!JSON.stringify(h).includes('PRIVADO_NO_DEVOLVER'),'No entrega ruta privada');
 h=await query(db,'conta','EXPEDIENTE',{...args,categoria:'DOCUMENTOS'});ok(h.total===2,'Contadora autorizada ve evidencia médica');
 h=await query(db,'consulta','EXPEDIENTE',{...args,categoria:'CAMBIOS',pagina:20});ok(h.total===1004&&h.eventos.length===4,'Paginación supera 1000 sin perder filas');
 h=await query(db,'consulta','EXPEDIENTE',{...args,categoria:'CAMBIOS'});ok(!JSON.stringify(h).includes('SECRET_NUMBER')&&!JSON.stringify(h).includes('99999'),'Historial no revela JSON sensible');
 const firstIds=new Set(h.eventos.map(x=>x.id));const next=await query(db,'consulta','EXPEDIENTE',{...args,categoria:'CAMBIOS',pagina:1});ok(next.eventos.every(x=>!firstIds.has(x.id)),'Orden estable entre páginas');
 await assert.rejects(()=>query(db,'jire','EXPEDIENTE',args),/permiso/i);n++;
 console.log(`PASS RRHH consultas: ${n} comprobaciones PostgreSQL.`);
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
