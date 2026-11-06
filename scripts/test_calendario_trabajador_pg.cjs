// PostgreSQL aislado: sin sesión, nóminas ni pagos reales.
const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('crypto'),base=require('./soporte_flujo_pg.cjs');
(async()=>{const db=await base.makeDatabase(),{ids,owner,actor}=base;try{
 await db.exec(fs.readFileSync('supabase/migrations/20261030231058_motores_nomina_calendarios_separados.sql','utf8'));
 await db.exec("create or replace function public.control_puede_ver_salud() returns boolean language sql stable as $$select public.app_es_vip()$$");
 if(fs.existsSync('work/calendario_trabajador_20261106/guardas_vivas.sql')){await db.exec(fs.readFileSync('work/calendario_trabajador_20261106/guardas_vivas.sql','utf8'));await db.exec('create trigger b_imss_periodo_fuente before insert or update or delete on descuentos for each row execute function platinum_internal.imss_guardar_periodo_fuente()');}
 await db.exec(fs.readFileSync('supabase/migrations/20261106155915_calendario_trabajador_captura_unificada.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261106174903_calendario_contrato_campos_y_montos_validos.sql','utf8'));
 await owner(db,"update obras set fecha_inicio='2026-03-30' where id=$1",[ids.obra]);
 await db.exec("create or replace function platinum_internal.calendario_hoy() returns date language sql stable as $$select date '2026-11-06'$$");
 const call=async(who,a,j)=>{await actor(db,who);return(await db.query('select public.control_calendario_trabajador($1,$2) r',[a,JSON.stringify({trabajador_id:ids.w,...j})])).rows[0].r;};
 assert.equal(Number((await owner(db,'select count(*) n from catalogo_incidencias')).rows[0].n),19);
 assert.equal(Number((await owner(db,"select count(*) n from catalogo_incidencias where clase='INCAPACIDAD'")).rows[0].n),11);
 await assert.rejects(call('consulta','PRESTAMO',{fecha:'2026-11-03',monto:100,autorizacion:'PRUEBA',confirmar:true}),/consultar/);
 await assert.rejects(call('jire','LISTAR',{desde:'2026-11-01',hasta:'2026-11-30'}),/permiso/);
 await assert.rejects(call('admin','PRESTAMO',{fecha:'2026-11-03',monto:'NaN',autorizacion:'PRUEBA',confirmar:true,clave_idempotencia:crypto.randomUUID()}),/Saldo inicial/);
 await assert.rejects(call('admin','PREVISUALIZAR',{fecha:'2026-11-03',clase:'PERCEPCION',naturaleza_importe:'NETO_DIRECTO',percepcion_id:'BONO',prestamo_id:crypto.randomUUID(),monto:100}),/campos no corresponden/);
 let j={fecha:'2026-11-04',clase:'PERCEPCION',naturaleza_importe:'BRUTO_GRAVABLE',monto:100,percepcion_id:'BONO',clave_idempotencia:crypto.randomUUID()};
 await assert.rejects(call('admin','PREVISUALIZAR',j),/gravamen dinámico/);
 j.naturaleza_importe='NETO_DIRECTO';let q=await call('admin','PREVISUALIZAR',j);assert.equal(q.destino.semana,32);
 await assert.rejects(call('admin','GUARDAR',{...j,firma:'vieja',confirmar_importe:true}),/Cambió/);
 const saved=await call('admin','GUARDAR',{...j,firma:q.firma,confirmar_importe:true});const d=(await owner(db,'select * from descuentos where id=$1',[saved.descuento_id])).rows[0];assert.equal(Number(d.monto),-100);assert(d.ajustes_semana.otros_pagos);assert.equal(d.tipo,'INCIDENCIA');
 assert((await call('admin','GUARDAR',{...j,firma:q.firma,confirmar_importe:true})).repetido,'Un reintento no duplica el importe');
 const loan=await call('admin','PRESTAMO',{fecha:'2026-11-04',monto:500,autorizacion:'AUTORIZACION FICTICIA',confirmar:true,clave_idempotencia:crypto.randomUUID()});
 j={fecha:'2026-11-05',clase:'ABONO',prestamo_id:loan.id,monto:600,clave_idempotencia:crypto.randomUUID()};q=await call('admin','PREVISUALIZAR',j);await assert.rejects(call('admin','GUARDAR',{...j,firma:q.firma,confirmar_importe:true}),/saldo/);
 j.monto=100;q=await call('admin','PREVISUALIZAR',j);const cuota=await call('admin','GUARDAR',{...j,firma:q.firma,confirmar_importe:true});
 const list=await call('admin','LISTAR',{desde:'2026-11-01',hasta:'2026-11-30'});assert.equal(Number(list.prestamos[0].saldo),500);assert.equal(Number(list.prestamos[0].reservado),100);

 // Pago parcial no acredita cobro; pago completo sí. Retirar evidencia devuelve cuota a reserva.
 const obligacion=crypto.randomUUID(),version=crypto.randomUUID(),pago=crypto.randomUUID(),evidencia=crypto.randomUUID(),aplicacion=crypto.randomUUID(),origen=crypto.randomUUID(),v=base.snapshot(ids.w,1900);v.modelo.filas[0].items=[{motivo:'CUOTA · CAL:'+cuota.id,monto:100}];
 await owner(db,"insert into control_cierre_versiones(id,cierre_origen,obra_id,version,estado_origen,snapshot,snapshot_sha256,fuente_sha256,actor_id) values($1,$2,$3,1,'AUTORIZADO',$4,'HUELLA_FICTICIA','FUENTE_FICTICIA',$5)",[version,origen,ids.obra,JSON.stringify(v),ids.admin]);
 await owner(db,"insert into control_obligaciones_pago(id,cierre_origen,version_id,obra_id,trabajador_id,semana,tipo,nombre,importe,metodo) values($1,$2,$3,$4,$5,32,'NOMINA','PERSONA FICTICIA',1900,'TRANSFERENCIA')",[obligacion,origen,version,ids.obra,ids.w]);
 await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,importe,estado) values($1,$2,$3,'S32',1900,'EXITOSO')",[pago,ids.obra,ids.w]);
 await owner(db,"insert into control_evidencias_pago(id,obra_id,trabajador_id,semana,clave,importe,pago_id) values($1,$2,$3,32,'EVIDENCIA FICTICIA',1900,$4)",[evidencia,ids.obra,ids.w,pago]);
 await owner(db,"insert into control_pago_aplicaciones(id,obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo) values($1,$2,$3,$4,$5,1000,$6,$7,'APLICACION SINTETICA DE NOMINA')",[aplicacion,ids.obra,obligacion,evidencia,version,ids.admin,crypto.randomUUID()]);
 let datos=await call('admin','LISTAR',{desde:'2026-11-01',hasta:'2026-11-30'});assert.equal(Number(datos.prestamos[0].saldo),500);
 await assert.rejects(call('admin','COBRO',{id:cuota.id,obligacion_id:obligacion}),/nómina pagada/);
 const otraAplicacion=crypto.randomUUID();await owner(db,"insert into control_pago_aplicaciones(id,obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo) values($1,$2,$3,$4,$5,900,$6,$7,'COMPLEMENTO SINTETICO DE NOMINA')",[otraAplicacion,ids.obra,obligacion,evidencia,version,ids.admin,crypto.randomUUID()]);
 datos=await call('admin','LISTAR',{desde:'2026-11-01',hasta:'2026-11-30'});assert.equal(Number(datos.prestamos[0].saldo),400);assert.equal(Number(datos.prestamos[0].reservado),0);
 await call('admin','COBRO',{id:cuota.id,obligacion_id:obligacion});await assert.rejects(call('admin','ANULAR',{id:cuota.id,version:2}),/abono cobrado/);
 await owner(db,"update control_pago_aplicaciones set retirado_en=now(),retirado_por=$2,motivo_retiro='RETIRO FICTICIO DE EVIDENCIA' where id=$1",[otraAplicacion,ids.admin]);
 datos=await call('admin','LISTAR',{desde:'2026-11-01',hasta:'2026-11-30'});assert.equal(Number(datos.prestamos[0].saldo),500);assert.equal(Number(datos.prestamos[0].reservado),100);
 console.log('PASS préstamo: sin cobro por parcial, saldo disminuye sólo con nómina completamente aplicada y retorna a reserva al retirar evidencia.');
 // Dos días de ausencia comparten un único descuento; quitar uno recalcula, no borra historia.
 const capturar=async fecha=>{let j={fecha,clase:'AUSENCIA',id_incidencia:2,monto:100,monto_grupo:fecha==='2026-11-02'?100:200,contrato:{_periodo_nomina:{desde:'2026-11-02',hasta:'2026-11-08'},_calculo_incidencia:{modo:'MANUAL_CONFIRMADO'}},clave_idempotencia:crypto.randomUUID()};let q=await call('admin','PREVISUALIZAR',j);return call('admin','GUARDAR',{...j,firma:q.firma,confirmar_importe:true});};
 const a1=await capturar('2026-11-02'),a2=await capturar('2026-11-03');assert.equal(a1.descuento_id,a2.descuento_id);assert.equal(Number((await owner(db,'select monto from descuentos where id=$1',[a1.descuento_id])).rows[0].monto),200);
 let quitar={id:a1.id,retirar_id:a1.id,fecha:'2026-11-02',clase:'AUSENCIA',id_incidencia:2,version:1,monto_grupo:100,contrato:{_periodo_nomina:{desde:'2026-11-02',hasta:'2026-11-08'},_calculo_incidencia:{modo:'MANUAL_CONFIRMADO'}}};q=await call('admin','PREVISUALIZAR',quitar);await call('admin','ANULAR',{...quitar,firma:q.firma,confirmar_importe:true});
 assert.equal(Number((await owner(db,'select monto from descuentos where id=$1',[a1.descuento_id])).rows[0].monto),100);assert.equal((await owner(db,'select estado from incidencias_empleados where id=$1',[a1.id])).rows[0].estado,'ANULADO');
 await actor(db,'admin');await assert.rejects(db.query('update descuentos set monto=1 where id=$1',[saved.descuento_id]),/calendario/);
 await assert.rejects(db.query("insert into incidencias_empleados(empleado_id) values($1)",[ids.w]),/permission denied/);
 const snap=base.snapshot(ids.w);snap.desde='2026-10-26';snap.hasta='2026-11-01';snap.semana=31;const cid=crypto.randomUUID();
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,estado,snapshot,snapshot_sha256,formula_version,total_trabajadores,total_neto) values($1,$2,31,'SEMANAL','TIMBRADO',$3,'HUELLA_FICTICIA','PRUEBA',1,2000)",[cid,ids.obra,JSON.stringify(snap)]);
 const before=(await owner(db,'select to_jsonb(c) r from control_cierres_nomina c where id=$1',[cid])).rows[0].r;
 j={fecha:'2026-10-28',clase:'RETENCION_EXTRA',credito_id:crypto.randomUUID(),monto:50,dias_extra:1,clave_idempotencia:crypto.randomUUID()};q=await call('admin','PREVISUALIZAR',j);assert(q.retroactivo);assert.equal(q.destino.semana,32);
 j={fecha:'2026-10-28',clase:'PERCEPCION',naturaleza_importe:'NETO_DIRECTO',percepcion_id:'BONO',monto:50,clave_idempotencia:crypto.randomUUID()};q=await call('admin','PREVISUALIZAR',j);
 await assert.rejects(call('admin','GUARDAR',{...j,firma:q.firma,confirmar_importe:true}),/Confirma el ajuste/);
 const retro=await call('admin','GUARDAR',{...j,firma:q.firma,confirmar_importe:true,confirmar_retroactivo:true});assert.equal(retro.semana_aplicacion,32);
 assert.deepEqual((await owner(db,'select to_jsonb(c) r from control_cierres_nomina c where id=$1',[cid])).rows[0].r,before);

 await owner(db,"update trabajadores set periodo_pago='QUINCENAL' where id=$1",[ids.w2]);
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,estado,snapshot,snapshot_sha256,formula_version,total_trabajadores,total_neto) values($1,$2,33,'QUINCENAL','TIMBRADO',$3,'HUELLA_Q','PRUEBA',1,2000)",[crypto.randomUUID(),ids.obra,JSON.stringify({...base.snapshot(ids.w2),desde:'2026-11-01',hasta:'2026-11-15'})]);
 const jq={trabajador_id:ids.w2,fecha:'2026-11-06',clase:'PERCEPCION',naturaleza_importe:'NETO_DIRECTO',percepcion_id:'BONO',monto:10,clave_idempotencia:crypto.randomUUID()},pq=await call('admin','PREVISUALIZAR',jq);assert.equal(pq.retroactivo,true);await assert.rejects(call('admin','GUARDAR',{...jq,firma:pq.firma,confirmar_importe:true,confirmar_retroactivo:true}),/nómina actual abierta/);
 console.log('PASS periodo quincenal: un cierre por otra semana alias bloquea la misma quincena; sin escritura retroactiva.');
 console.log('PASS calendario PostgreSQL:19tipos,11/8,RLS,bruto rechazado,neto otros_pagos,préstamo reservado sin cobro,retroactivo S31→S32 y snapshot histórico intacto.');
}finally{await db.close();}
 // Recorrido de cierre actual: el movimiento firmado también debe pasar el contrato financiero completo.
 const actual=require('./soporte_cierres_actuales_pg.cjs'),db2=await actual.makeDatabase();try{
  await db2.exec(fs.readFileSync('supabase/migrations/20261030231058_motores_nomina_calendarios_separados.sql','utf8'));
  await db2.exec("create or replace function public.control_puede_ver_salud() returns boolean language sql stable as $$select public.app_es_vip()$$");
  await db2.exec(fs.readFileSync('supabase/migrations/20261106155915_calendario_trabajador_captura_unificada.sql','utf8'));
  await db2.exec(fs.readFileSync('supabase/migrations/20261106174903_calendario_contrato_campos_y_montos_validos.sql','utf8'));
  await owner(db2,"update obras set fecha_inicio='2026-03-30' where id=$1",[ids.obra]);await owner(db2,"update trabajadores set rfc='PRUP900101AA1' where id=$1",[ids.w]);
  await actual.actor(db2,'conta');const j={trabajador_id:ids.w,fecha:'2026-11-04',clase:'PERCEPCION',naturaleza_importe:'NETO_DIRECTO',percepcion_id:'BONO',monto:100,clave_idempotencia:crypto.randomUUID()};
  const q=(await db2.query("select public.control_calendario_trabajador('PREVISUALIZAR',$1) r",[JSON.stringify(j)])).rows[0].r;
  const captura=(await db2.query("select public.control_calendario_trabajador('GUARDAR',$1) r",[JSON.stringify({...j,firma:q.firma,confirmar_importe:true})])).rows[0].r;
  const s=actual.snapshot(ids.w,2100);Object.assign(s,{semana:32,desde:'2026-11-02',hasta:'2026-11-08',total_nomina:2000,total_retenciones:-100});s.modelo.sem='S32';const fila=s.modelo.filas[0];Object.assign(fila,{sueldo:2000,incidencias:-100,costo:2100,neto:2100});fila.items=[{tipo:'INCIDENCIA',clase:'INCIDENCIA',monto:-100,motivo:'BONO · CAL:'+captura.id}];Object.assign(s.items[0],{sueldo_nomina:2000,retenciones:-100,monto:2100});
  const fuente=await actual.rpc(db2,'conta','FUENTE',{obra_id:ids.obra,semana:32});const c=(await actual.rpc(db2,'conta','CREAR',{obra_id:ids.obra,semana:32,periodo:'SEMANAL',snapshot:s,fuente:fuente.fuente})).cierre_id;
  const d=await actual.rpc(db2,'conta','DETALLE',{cierre_id:c});await actual.rpc(db2,'conta','IMPORTAR_NOI',{cierre_id:c,archivo:'NOI_FICTICIO.xlsx',sha256:'b'.repeat(64),revision:d.cierre.snapshot_sha256,filas:[{trabajador_id:ids.w,trabajador_numero:1,tipo_calculo:'NOMINA',monto_noi:2100,detalle:{identidad_noi:{version:1,rfc:'PRUP900101AA1'}}}]});
  await actual.rpc(db2,'admin','TRANSICION',{cierre_id:c,estado:'AUTORIZADO'});const final=await actual.rpc(db2,'conta','DETALLE',{cierre_id:c});assert.equal(final.cierre.total_neto,2100);assert.equal(final.versiones.length,1);assert.equal(final.saldos[0].importe,2100);assert.equal(final.cheques.length,0);
  console.log('PASS calendario → fotografía → conciliación → autorización → obligación de pago: neto extra íntegro, sin cambiar el contrato de cierre ni crear cheque normal.');
 }finally{await db2.close();}
})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
