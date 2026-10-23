// Pruebas aisladas: sólo identidades e importes ficticios, sin conexión a producción.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),base=require('./soporte_pagos_sabado_pg.cjs');
(async()=>{const db=await base.makeDatabase(),{owner,rpc,actor,ids}=base;let checks=0;try{
 await db.exec('create table public.historial(id uuid primary key default gen_random_uuid(),obra_id uuid,trabajador_id uuid,accion text,datos_despues jsonb,fecha timestamptz default now())');
 for(const end of ['_conciliacion_finiquitos_y_seleccion_pagos.sql','_visor_semanal_pagos.sql','_recibos_lectura_gemini.sql','_cheques_neto_fuentes_alternas.sql','_noi_identidad_y_estado_expedicion.sql','_noi_ceros_sin_servicio_confirmado.sql','_noi_validacion_identidad_indexada.sql','_cierres_legado_preparacion_y_vip.sql']){
  const f=fs.readdirSync('supabase/migrations').find(f=>f.endsWith(end));assert.ok(f,end);await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 }
 const s=base.snapshot(),cid=crypto.randomUUID();delete s.modelo;
 await owner(db,"update trabajadores set nombres='OTRA' where id=$1",[ids.w2]);
 const sub=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')-n*86400000).toISOString().slice(0,10);
 s.desde=sub(s.desde,14);s.hasta=sub(s.hasta,14);
 await owner(db,'update obras set fecha_inicio=$2 where id=$1',[ids.obra,s.desde]);
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot,snapshot_sha256,total_trabajadores,total_neto,total_nomina,creado_por) values($1,$2,1,'SEMANAL','PRUEBA',$3,$4,1,2000,2000,$5)",[cid,ids.obra,JSON.stringify(s),'a'.repeat(64),ids.conta]);
 let c=(await rpc(db,'conta','DETALLE',{cierre_id:cid})).cierre;
 const args={cierre_id:cid,revision:c.snapshot_sha256,snapshot:s,confirmacion:'PRESERVAR S1'};
 await assert.rejects(rpc(db,'conta','PREPARAR_LEGADO',args),/conciliación NOI/);checks++;
 await assert.rejects(rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'REVISADO'}),/no fue preparada/);checks++;
 const n={trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PRUEBA PERSONA',tipo_calculo:'NOMINA',monto_noi:2000,detalle:{identidad_noi:{version:1,nombre:'PERSONA PRUEBA',numero_noi:1}}};
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:cid,filas:[n],archivo:'FICTICIO.xlsx',sha256:'d'.repeat(64),revision:c.snapshot_sha256});
 await assert.rejects(rpc(db,'consulta','PREPARAR_LEGADO',args),/consulta|escritura|permiso/i);checks++;
 await assert.rejects(rpc(db,'conta','PREPARAR_LEGADO',{...args,confirmacion:'NO'}),/Confirma/);checks++;
 await assert.rejects(rpc(db,'conta','PREPARAR_LEGADO',{...args,snapshot:{...s,total_neto:5000}}),/fotografía cambió/);checks++;
 const before=(await owner(db,'select snapshot,total_neto from control_cierres_nomina where id=$1',[cid])).rows[0];
 await rpc(db,'conta','PREPARAR_LEGADO',args);
 const after=(await owner(db,'select snapshot,total_neto from control_cierres_nomina where id=$1',[cid])).rows[0];assert.deepEqual(after,before);checks++;
 assert.equal((await rpc(db,'conta','PERMISOS')).aprobar_cierre,true);checks++;
 assert.equal((await rpc(db,'consulta','PERMISOS')).aprobar_cierre,false);checks++;
 await rpc(db,'admin','TRANSICION',{cierre_id:cid,estado:'REVISADO'});
 await assert.rejects(rpc(db,'admin','TRANSICION',{cierre_id:cid,estado:'AUTORIZADO'}),/segunda persona/);checks++;
 await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'AUTORIZADO'});checks++;
 assert.equal((await rpc(db,'conta','DETALLE',{cierre_id:cid})).cierre.autorizado_por,ids.conta);checks++;
 await assert.rejects(rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'CANCELADO'}),/administrador/);checks++;
 await assert.rejects(rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'TIMBRADO'}),/CFDI XML/);checks++;
 // La capacidad VIP no elude respaldo fiscal ni saldos y no permite borrado/reapertura.
 await owner(db,"insert into documentos(obra_id,trabajador_id,categoria,semana,archivo,cfdi_total) values($1,$2,'CFDI_NOMINA','S1','ficticio.xml',2000)",[ids.obra,ids.w]);
 await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'TIMBRADO'});
 await assert.rejects(rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'PAGADO'}),/saldos|excedentes/);checks++;
 // Pago real ficticio y vínculo del flujo, no una edición del saldo.
 const p=crypto.randomUUID();
 await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,importe,estado,medio,fecha_pago,folio_lote) values($1,$2,$3,'S1',2000,'EXITOSO','TRANSFERENCIA',$4,'PRUEBA-001')",[p,ids.obra,ids.w,s.hasta]);
 const obligation=(await rpc(db,'conta','DETALLE',{cierre_id:cid})).saldos.find(x=>x.vigente);
 const application={obligacion_id:obligation.id,pago_id:p,importe:2000,motivo:'Comprobante ficticio conciliado',clave_idempotencia:crypto.randomUUID()};
 const request=await rpc(db,'conta','SOLICITAR',{cierre_id:cid,tipo:'REGULARIZACION',motivo:application.motivo,propuesta:application});
 await rpc(db,'admin','DECIDIR',{solicitud_id:request.solicitud_id,aprobar:true,confirmacion:'CONFIRMAR DECISION',nota:'Aprobación histórica de prueba'});
 await rpc(db,'conta','APLICAR_PAGO',{...application,solicitud_id:request.solicitud_id});
 await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'PAGADO'});checks++;
 assert.equal((await rpc(db,'conta','DETALLE',{cierre_id:cid})).cierre.pagado_por,ids.conta);checks++;
 await assert.rejects(rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'BORRADOR'}),/reapertura|no permitida/i);checks++;
 console.log('PASS '+checks+' controles PostgreSQL: legado conciliado, preservación, concurrencia, VIP, separación de personas, CFDI y saldos.');
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.detail||'');process.exitCode=1;});
