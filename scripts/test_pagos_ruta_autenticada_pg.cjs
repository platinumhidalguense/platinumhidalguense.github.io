// Reproducción con roles reales PostgreSQL y personas completamente ficticias.
const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict'),base=require('./soporte_cierres_actuales_pg.cjs');
const suffix='_pagos_consulta_ruta_autenticada.sql';
const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix));
const sql=fs.readFileSync(migration?'supabase/migrations/'+migration:process.argv[2]||'work/pagos_xml_20261030/pagos_ruta_autenticada.sql','utf8');
assert(!/\bgrant\b|\brevoke\b|security\s+definer|create\s+trigger/i.test(sql),'No abrir permisos ni crear rutas privilegiadas');
(async()=>{const db=await base.makeDatabase(),{ids,owner,actor}=base;let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};try{
 const priority=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_cheques_cfdi_prioridad_desgloses.sql'));
 await db.exec(fs.readFileSync('supabase/migrations/'+priority,'utf8'));
 await owner(db,"update obras set fecha_inicio='2026-03-30' where id=$1",[ids.obra]);
 const tercero=crypto.randomUUID();await owner(db,"insert into trabajadores(id,obra_id,no_trab,nombres,primer_apellido,estatus,fecha_alta,sd,sdi,sal_semanal,contratista) values($1,$2,3,'PERSONA','FICTICIA','ACTIVO','2026-01-01',300,320,2000,'PRUEBA')",[tercero,ids.obra]);
 const ss=[ids.w,ids.w2,tercero].map(w=>base.snapshot(w,2000));
 const snap={...ss[0],semana:31,desde:'2026-10-26',hasta:'2026-11-01',total_nomina:6000,total_neto:6000,total_trabajadores:3,
  items:ss.flatMap((s,i)=>s.items.map(x=>({...x,numero:i+1}))),modelo:{...ss[0].modelo,filas:ss.flatMap(s=>s.modelo.filas),sem:'S31',neto:6000,costo:6000}};
 const cid=crypto.randomUUID();await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por,archivo_noi,total_neto,total_trabajadores) values($1,$2,31,'SEMANAL','FICTICIO','FICTICIO',$3,$4,'FICTICIO.xlsx',6000,3)",[cid,ids.obra,JSON.stringify(snap),ids.conta]);
 for(const [i,w]of[ids.w,ids.w2,tercero].entries())await owner(db,"insert into control_conciliacion_noi(obra_id,cierre_id,trabajador_id,trabajador_numero,trabajador_nombre,tipo_calculo,metodo_pago,monto_platinum,monto_noi,importado_por) values($1,$2,$3,$4,'PERSONA PRUEBA','NOMINA','TRANSFERENCIA',2000,2000,$5)",[ids.obra,cid,w,i+1,ids.conta]);
 for(const [i,w]of[ids.w,ids.w2].entries())await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote,nombre_archivo) values($1,$2,$3,'S31','TRANSFERENCIA',$4,2000,'EXITOSO','2026-10-30',$5,$6)",[crypto.randomUUID(),ids.obra,w,i?'OTRO BANCO':'BBVA','FICTICIO-'+i,i?'INDIVIDUAL FICTICIO.pdf':'GLOBAL FICTICIO.pdf']);
 const read=key=>base.pagos(db,key,'PROPUESTA',{obra_id:ids.obra,semana:31,estado:''});
 await assert.rejects(read('conta'),/permission denied for function neto_cheque_fiscal/);checks++;
 await db.exec('reset role');await db.exec(sql);
 // Consumidor de finiquitos: el generador y la consulta usan la misma ruta protegida.
 const fw=crypto.randomUUID(),fc=crypto.randomUUID(),f=base.snapshot(fw,1200);
 f.semana=30;f.desde='2026-10-19';f.hasta='2026-10-25';f.items[0].tipo='FINIQUITO';f.total_nomina=0;f.total_finiquitos=1200;f.modelo.filas[0].fin=true;
 await owner(db,"insert into trabajadores(id,obra_id,no_trab,nombres,primer_apellido,estatus,fecha_alta,fecha_baja,sd,sdi,sal_semanal,monto_finiquito) values($1,$2,4,'PERSONA','PRUEBA','BAJA','2026-01-01','2026-10-20',300,320,2000,1200)",[fw,ids.obra]);
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por,archivo_noi) values($1,$2,30,'SEMANAL','FICTICIO','FICTICIO',$3,$4,'FICTICIO.xlsx')",[fc,ids.obra,JSON.stringify(f),ids.conta]);
 await owner(db,"insert into control_conciliacion_noi(obra_id,cierre_id,trabajador_id,trabajador_numero,trabajador_nombre,tipo_calculo,metodo_pago,monto_platinum,monto_noi,importado_por) values($1,$2,$3,4,'PERSONA PRUEBA','FINIQUITO','CHEQUE',1200,1200,$4)",[ids.obra,fc,fw,ids.conta]);
 await actor(db,'conta');await db.query('select public.control_generar_cheques_pendientes($1,30)',[ids.obra]);
 const fin=(await owner(db,"select * from cheques where trabajador_id=$1 and tipo_pago='FINIQUITO' and not eliminado",[fw])).rows;ok(fin.length===1,'Generador de finiquitos funciona sin conceder acceso a helpers');
 await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote) values($1,$2,$3,'S30','TRANSFERENCIA','BBVA',1200,'EXITOSO','2026-10-23','FICTICIO-FINIQUITO')",[crypto.randomUUID(),ids.obra,fw]);
 const fins=await base.pagos(db,'conta','FINIQUITOS',{obra_id:ids.obra,semana:30});ok(fins.filas[0].estado==='LISTO_TRANSFERENCIA','Consulta de finiquito reconoce transferencia exacta');
 if(fs.existsSync('work/pagos_xml_20261030/auditoria_definiciones.json')){
  await db.exec('reset role');const a=JSON.parse(fs.readFileSync('work/pagos_xml_20261030/auditoria_definiciones.json')).find(x=>x.proname==='ia_cheques_faltantes');await db.exec(a.def);
  if(fs.existsSync('work/pagos_xml_20261030/auditoria_resumen.sql'))await db.exec(fs.readFileSync('work/pagos_xml_20261030/auditoria_resumen.sql','utf8'));
  await actor(db,'conta');const ares=(await db.query('select public.ia_cheques_faltantes(31,array[$1]) r',[ids.obra])).rows[0].r;
  ok(Array.isArray(ares.faltantes),'RPC de auditoría real devuelve una respuesta completa');
  ok(!ares.faltantes.some(x=>[ids.w,ids.w2].includes(x.trabajador_id)),'Auditoría no reclama cheques a transferencias pagadas');
  ok(ares.resumen_revision[0].transferencias===2,'Resumen muestra pagos registrados aunque todavía no sea sábado');
  ok(ares.resumen_revision[0].por_revisar===1,'Resumen no oculta un caso pendiente de respaldo');
 }
 const before=(await owner(db,"select jsonb_build_object('pagos',(select count(*) from pagos),'cheques',(select count(*) from cheques),'aplicaciones',(select count(*) from control_pago_aplicaciones),'cierre',(select snapshot_sha256 from control_cierres_nomina where id=$1)) x",[cid])).rows[0].x;
 for(const role of ['admin','conta','consulta']){
  const d=await read(role);ok(d.total===3,'La revisión conserva las tres personas');
  const paid=d.filas.filter(x=>x.estado==='TRANSFERENCIA_REGISTRADA');ok(paid.length===2,'Reconoce global e individual');
  ok(paid.every(x=>Number(x.total_bancario)===2000&&x.pagos_registrados===1),'Importes y comprobantes exactos');
  ok(d.filas.find(x=>x.trabajador_id===tercero).pagos_registrados===0,'No inventa pago al pendiente');
  ok(d.filas.find(x=>x.trabajador_id===tercero).estado==='PENDIENTE_AUTORIZACION','El pendiente conserva aprobación requerida');
 }
 await actor(db,'consulta');await assert.rejects(db.query('select platinum_internal.neto_cheque_fiscal($1,$2,31,$3,null)',[ids.obra,ids.w,'NOMINA']),/permission denied/);checks++;
 await assert.rejects(base.pagos(db,'jire','PROPUESTA',{obra_id:ids.obra,semana:31}),/permiso/i);checks++;
 await assert.rejects(base.pagos(db,null,'PROPUESTA',{obra_id:ids.obra,semana:31}),/permission denied|sesión|permiso/i);checks++;
 await actor(db,'conta');ok((await db.query('select public.control_generar_cheques_pendientes($1,31) n',[ids.obra])).rows[0].n===0,'Nómina normal no genera cheques');
 const after=(await owner(db,"select jsonb_build_object('pagos',(select count(*) from pagos),'cheques',(select count(*) from cheques),'aplicaciones',(select count(*) from control_pago_aplicaciones),'cierre',(select snapshot_sha256 from control_cierres_nomina where id=$1)) x",[cid])).rows[0].x;assert.deepEqual(after,before);checks++;
 console.log('PASS pagos por ruta autenticada: '+checks+' controles, global/individual, pendiente real, tres roles, aislamiento, helper privado y datos financieros intactos.');
 }finally{await db.close();}})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
