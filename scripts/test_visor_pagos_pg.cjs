// Datos sintéticos en PostgreSQL WASM. No consulta ni modifica producción.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {makeDatabase,ids,owner,actor,rpc,snapshot}=require('./soporte_pagos_sabado_pg.cjs');
let tests=0;const ok=(v,m)=>{assert.ok(v,m);tests++;};
(async()=>{const db=await makeDatabase();try{
 await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_visor_semanal_pagos.sql')),'utf8'));
 await actor(db,'admin');
 const ws=Array.from({length:12},()=>crypto.randomUUID());
 for(const [i,id]of ws.entries())await owner(db,"insert into trabajadores(id,obra_id,no_trab,nombres,primer_apellido,estatus,fecha_alta,contratista) values($1,$2,$3,'PERSONA','FICTICIA','ACTIVO','2026-01-01','MG')",[id,ids.obra,i+10]);
 const amounts=[2000,2000,2000,0,0,1200,1000,2000],items=amounts.map((m,i)=>({trabajador_id:ws[i],numero:i+10,nombre:'PERSONA FICTICIA '+i,tipo:i===5?'FINIQUITO':'NOMINA',metodo_pago:i===5?'CHEQUE':'TRANSFERENCIA',prevision_social:0,monto:m}));items.push({trabajador_id:ws[6],numero:16,nombre:'PERSONA FICTICIA 6',tipo:'FINIQUITO',metodo_pago:'CHEQUE',prevision_social:0,monto:500});
 await owner(db,"insert into control_altas_bajas_cortas(obra_id,trabajador_id,anio,semana,estado_servicio) values($1,$2,2026,1,'SIN_SERVICIO_CONFIRMADO')",[ids.obra,ws[4]]);
 // Se autoriza y expide por el coordinador real, sin desactivar ningún guard.
 const snap=snapshot(),template=snap.modelo.filas[0];snap.items=items;snap.total_trabajadores=items.length;snap.total_neto=items.reduce((a,x)=>a+x.monto,0);snap.total_nomina=items.filter(x=>x.tipo==='NOMINA').reduce((a,x)=>a+x.monto,0);snap.total_finiquitos=snap.total_neto-snap.total_nomina;
 snap.modelo.filas=items.map(x=>({...template,w:{...template.w,id:x.trabajador_id,no_trab:x.numero},fin:x.tipo==='FINIQUITO',neto:x.monto,sueldo:x.monto,costo:x.monto,pago:x.metodo_pago}));snap.modelo.neto=snap.total_neto;
 const src=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1}),c=(await rpc(db,'conta','CREAR',{snapshot:snap,fuente:src.fuente})).cierre_id,det=await rpc(db,'conta','DETALLE',{cierre_id:c});
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:c,filas:items.map(x=>({trabajador_id:x.trabajador_id,trabajador_numero:x.numero,trabajador_nombre:x.nombre,tipo_calculo:x.tipo,metodo_pago:x.metodo_pago,monto_noi:x.monto})),archivo:'FICTICIO.xlsx',sha256:'c'.repeat(64),revision:det.cierre.snapshot_sha256});
 await rpc(db,'conta','TRANSICION',{cierre_id:c,estado:'REVISADO'});await rpc(db,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});
 await actor(db,'conta');await db.exec("update cheques set estatus='EXPEDIDO',num_cheque='FIC-'||no_trab,consecutivo=no_trab::text where tipo_pago='FINIQUITO'");
 for(const [i,importe,origen]of[[1,2000,'GLOBAL'],[2,500,'INDIVIDUAL'],[6,1000,'INDIVIDUAL'],[7,2100,'INDIVIDUAL']])await owner(db,"insert into pagos(obra_id,trabajador_id,semana,importe,medio,estado,origen,folio_lote,fecha_pago,titular) values($1,$2,'S1',$3,'TRANSFERENCIA','EXITOSO',$4,$5,'2026-01-09','PERSONA FICTICIA')",[ids.obra,ws[i],importe,origen,'REF-'+i]);
 for(const [i,neto]of[[8,null],[9,1000]])await owner(db,"insert into documentos(obra_id,trabajador_id,categoria,semana,nomina_neto,anulado,archivo) values($1,$2,'RECIBO_NOMINA','S1',$3,false,'ficticio.pdf')",[ids.obra,ws[i],neto]);
 await owner(db,"insert into pagos(obra_id,semana,importe,medio,estado,origen,folio_lote,titular) values($1,'S1',300,'TRANSFERENCIA','EXITOSO','INDIVIDUAL','SIN-ASIGNAR','SIN PERSONA')",[ids.obra]);
 const call=async(action,data={},key='conta')=>{await actor(db,key);return(await db.query('select control_visor_pagos($1,$2::jsonb) d',[action,JSON.stringify({obra_id:ids.obra,semana:1,...data})])).rows[0].d;};
 const d=await call('PERSONAS'),row=i=>d.filas.find(r=>r.trabajador_id===ws[i]);
 for(const [i,state]of[[0,'FALTA_COMPROBANTE'],[1,'BANCO_REGISTRADO'],[2,'PAGO_PARCIAL'],[3,'SIN_IMPORTE'],[4,'SIN_SERVICIO'],[5,'CHEQUE_REGISTRADO'],[6,'PAGO_MIXTO_REGISTRADO'],[7,'DIFERENCIA_REGISTRADA'],[8,'IMPORTE_POR_VERIFICAR'],[9,'FALTA_COMPROBANTE']])ok(row(i)?.estado===state,`${i}: ${state}, recibido ${JSON.stringify(row(i))}`);
 ok(row(6).esperado===1500&&row(6).banco===1000&&row(6).cheque===500,'NOI por conceptos no se duplica');
 ok(d.filas.some(r=>r.estado==='SIN_ASIGNAR'),'No imputa un pago sin identidad a otro trabajador');
 ok(d.resumen.faltantes===2&&d.resumen.parciales===1,'Cheques físicos, cero y recibo desconocido no son faltantes confirmados');
 const missing=await call('PERSONAS',{filtro:'PENDIENTES'});ok(missing.total===3,'Filtro de pendientes incluye parcial, no todos los activos actuales');
 const searched=await call('PERSONAS',{q:'19'});ok(searched.total===1&&searched.filas[0].numero===19,'Búsqueda aplicada antes de paginar');
 const bank=await call('COMPROBANTES');ok(bank.total===5,'Todas las importaciones de esa semana');
 const global=await call('COMPROBANTES',{filtro:'GLOBAL'});ok(global.total===1,'Un global de una persona sigue siendo global por origen');
 const personal=await call('COMPROBANTES',{trabajador_id:ws[1]});ok(personal.total===1&&personal.filas[0].archivo===null,'No inventa PDF original ausente');
 const byLot=await call('COMPROBANTES',{lote:global.filas[0].lote});ok(byLot.total===1&&byLot.filas[0].id===global.filas[0].id,'Identidad exacta de lote');
 const before=(await owner(db,"select md5(string_agg(to_jsonb(t)::text,',' order by id)) h from pagos t")).rows[0].h;
 const index=await call('INDICE');ok(index.faltantes===2&&index.semanas.find(s=>s.semana===1).faltantes===2,'Aviso superior recorre todas las semanas');const empty=await call('INDICE',{obra_id:ids.otra});ok(empty.semanas_sin_base>0&&empty.faltantes===0,'Semanas sin base se distinguen de pagos faltantes');
 ok((await call('PERSONAS',{},'consulta')).filas.length===d.filas.length,'Consulta tiene lectura sin autoridad financiera');
 await assert.rejects(call('PERSONAS',{},'jire'),/permiso/i);tests++;await assert.rejects(call('PERSONAS',{},null),/permission denied|permiso/i);tests++;
 await assert.rejects(call('PERSONAS',{semana:0}),/semana/i);tests++;await assert.rejects(call('ELIMINAR'),/no reconocida/i);tests++;
 ok((await owner(db,"select md5(string_agg(to_jsonb(t)::text,',' order by id)) h from pagos t")).rows[0].h===before,'Visor no modifica pagos');
 // Más de 1,000 importaciones, paginadas por servidor y sin perder filas.
 await owner(db,"insert into pagos(obra_id,trabajador_id,semana,importe,medio,estado,origen,folio_lote,titular) select $1,$2,'S2',1,'TRANSFERENCIA','EXITOSO','INDIVIDUAL','FIC-'||i,'PERSONA FICTICIA' from generate_series(1,1007) i",[ids.obra,ws[10]]);
 let idsLeidos=new Set();for(let pagina=0;pagina<21;pagina++){const p=await call('COMPROBANTES',{semana:2,pagina});ok(p.total===1007,'Total completo mayor a 1000');for(const r of p.filas)idsLeidos.add(r.id);}
 ok(idsLeidos.size===1007,'Paginación no repite ni pierde IDs');
 console.log('PASS '+tests+' comprobaciones PostgreSQL del visor: fuentes históricas, pagos mixtos, faltantes reales, roles, aislamiento, lotes e individuales, cero/sin servicio, archivos ausentes y 1,007 comprobantes íntegros.');
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
