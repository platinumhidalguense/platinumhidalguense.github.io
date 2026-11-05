// PostgreSQL aislado, identidades ficticias y sin red ni sesión de producción.
const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('crypto'),base=require('./soporte_cierres_actuales_pg.cjs');
(async()=>{const db=await base.makeDatabase(),{ids,owner,actor}=base;try{
 await db.exec("create schema extensions;create function extensions.digest(text,text) returns bytea language sql immutable as $$select pg_catalog.sha256(convert_to($1,'UTF8'))$$;");
 await db.exec(fs.readFileSync('supabase/migrations/20261030231058_motores_nomina_calendarios_separados.sql','utf8'));
 await db.exec(fs.readFileSync('work/imss_consecutivas_20261105/antes.sql','utf8'));
 await db.exec(fs.readFileSync('work/imss_consecutivas_20261105/triggers_antes.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_incapacidades_semanales_consecutivas_consolidadas.sql')),'utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_auditoria_integracion_imss_sin_suplantacion.sql')),'utf8'));
 await db.exec('alter table public.control_bitacora alter column actor_id set not null');
 await owner(db,"update obras set fecha_inicio='2026-03-30' where id=$1",[ids.obra]);
 await owner(db,'update trabajadores set sal_semanal=2400.26 where id=$1',[ids.w]);
 const c1=crypto.randomUUID(),c2=crypto.randomUUID(),s0=crypto.randomUUID(),s1=crypto.randomUUID(),s2=crypto.randomUUID(),s3=crypto.randomUUID(),old=crypto.randomUUID();
 const dias=(desde,n,pagador='IMSS')=>Array.from({length:n},(_,i)=>{const d=new Date(desde+'T12:00Z');d.setUTCDate(d.getUTCDate()+i);return{fecha:d.toISOString().slice(0,10),pagador};});
 for(const [id,a,b]of [[c1,'2026-10-28','2026-11-03'],[c2,'2026-11-04','2026-11-10']])await owner(db,"insert into control_casos_imss(id,obra_id,trabajador_id,tipo_caso,certificado_desde,certificado_hasta,dias_certificados) values($1,$2,$3,'INCAPACIDAD',$4,$5,7)",[id,ids.obra,ids.w,a,b]);
 await actor(db,'admin');await owner(db,"insert into descuentos(id,obra_id,trabajador_id,tipo,semana,monto,motivo,activo,recurrente) values($1,$2,$3,'INCIDENCIA','S32',635.93,'2 DIAS INCAPACIDAD IMSS',true,false)",[old,ids.obra,ids.w]);
 for(const[id,c,s,n,a,estado,did]of [[s0,c1,31,5,'2026-10-28','PENDIENTE',null],[s1,c1,32,2,'2026-11-02','APLICADO',old],[s2,c2,32,5,'2026-11-04','PENDIENTE',null],[s3,c2,33,2,'2026-11-09','PENDIENTE',null]])await owner(db,"insert into control_casos_imss_semanas(id,caso_id,anio,semana,dias_pagados_empresa,dias_sin_salario_patronal,dias_imss_estimados,dias_sin_subsidio,detalle_dias,estado,descuento_id) values($1,$2,2026,$3,0,$4,$4,0,$5,$6,$7)",[id,c,s,n,JSON.stringify(dias(a,n)),estado,did]);
 const call=async(key,name,args)=>{await actor(db,key);return(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args)).rows[0].r;};
 const preview=()=>call('admin','control_previsualizar_incapacidad_periodo',[s2]);
 let q=await preview();assert.equal(q.sin_salario,7);assert.equal(q.certificados.length,2);assert.deepEqual(q.descuentos_imss,[old]);assert.equal(q.incidencias_ajenas.length,0);
 await assert.rejects(call('consulta','control_previsualizar_incapacidad_periodo',[s2]),/permiso/i);await assert.rejects(call('jire','control_previsualizar_incapacidad_periodo',[s2]),/permiso|centro/i);
 await assert.rejects(call('admin','control_aplicar_incapacidad_periodo_confirmado',[s2,1800,q.firma]),/Importe incompatible/);
 const did=await call('admin','control_aplicar_incapacidad_periodo_confirmado',[s2,2400.26,q.firma]);assert.equal(did,old);
 let ds=(await owner(db,"select * from descuentos where trabajador_id=$1 and activo and semana='S32'",[ids.w])).rows;assert.equal(ds.length,1);assert.equal(Number(ds[0].monto),2400.26);
 assert((await owner(db,'select * from control_casos_imss_semanas where id in($1,$2)',[s1,s2])).rows.every(s=>s.estado==='APLICADO'&&s.descuento_id===old));
 assert.equal((await owner(db,'select estado from control_casos_imss_semanas where id=$1',[s3])).rows[0].estado,'PENDIENTE','No aplica S33 al resolver S32');
 q=await preview();await call('admin','control_aplicar_incapacidad_periodo_confirmado',[s2,2400.26,q.firma]);assert.equal(Number((await owner(db,"select count(*) n from descuentos where activo and semana='S32'")).rows[0].n),1,'Reaplicar no duplica descuentos');
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");await db.query('select platinum_internal.imss_guardar_importe_periodo($1,32,2400.26)',[c2]);assert.equal(Number((await owner(db,'select count(*) n from platinum_internal.imss_auditoria_integraciones')).rows[0].n),1,'La integración audita sin suplantar un usuario de la aplicación');
 await assert.rejects(call('admin','control_aplicar_incapacidad_periodo_confirmado',[s2,2400.26,'firma-antigua']),/Cambió el calendario/);
 // Editar un certificado aplicado actualiza el único descuento y ambos vínculos.
 await call('admin','control_guardar_semana_imss_detalle',[c2,32,JSON.stringify(dias('2026-11-04',5,'EMPRESA')),'Corrección ficticia',635.93]);
 assert.equal(Number((await owner(db,'select monto from descuentos where id=$1',[old])).rows[0].monto),635.93);assert.equal((await preview()).sin_salario,2);
 // Una falta real ajena se conserva y bloquea hasta conciliar; inactiva no bloquea.
 const falta=crypto.randomUUID();await actor(db,'admin');await owner(db,"insert into descuentos(id,obra_id,trabajador_id,tipo,semana,monto,motivo,activo,recurrente) values($1,$2,$3,'FALTA','S32',100,'FALTA REAL',true,false)",[falta,ids.obra,ids.w]);
 q=await preview();assert.equal(q.incidencias_ajenas.length,1);await assert.rejects(call('admin','control_aplicar_incapacidad_periodo_confirmado',[s2,635.93,q.firma]),/ajenas/);await owner(db,'update descuentos set activo=false where id=$1',[falta]);assert.equal((await preview()).incidencias_ajenas.length,0);
 // El calendario compartido sigue el motor quincenal: S31 pertenece a octubre.
 await owner(db,"update trabajadores set periodo_pago='QUINCENAL',sal_semanal=7000 where id=$1",[ids.w]);const qi=(await owner(db,'select platinum_internal.imss_periodo_info($1,31,null) q',[c1])).rows[0].q;assert.equal(qi.desde,'2026-10-16');assert.equal(qi.hasta,'2026-10-31');
 await owner(db,"update trabajadores set periodo_pago='SEMANAL',sal_semanal=2400.26 where id=$1",[ids.w]);
 // Una semana autorizada conserva su protección aunque sean certificados consecutivos.
 const cierre=crypto.randomUUID(),snap=base.snapshot(ids.w);snap.semana=33;
 await actor(db,'admin');await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,estado,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,33,'SEMANAL','AUTORIZADO','FICTICIO','FICTICIO',$3,$4)",[cierre,ids.obra,JSON.stringify(snap),ids.admin]);
 const q33=await call('admin','control_previsualizar_incapacidad_periodo',[s3]);await assert.rejects(call('admin','control_aplicar_incapacidad_periodo_confirmado',[s3,635.93,q33.firma]),/reapertura/);assert.equal((await owner(db,'select estado from control_casos_imss_semanas where id=$1',[s3])).rows[0].estado,'PENDIENTE');
 assert.equal(Number((await owner(db,'select count(*) n from pagos')).rows[0].n),0);assert.equal(Number((await owner(db,'select count(*) n from cheques')).rows[0].n),0);
 console.log('PASS incapacidades consecutivas: 2+5 días, una incidencia, edición compartida, reaplicación, S33 independiente, falta ajena/inactiva, firma, permisos y calendario quincenal. Sin pagos ni cheques inventados.');
}finally{await db.close();}})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
