// Datos sintéticos; PostgreSQL aislado. No consulta documentos reales ni red.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=require('./soporte_pagos_sabado_pg.cjs');let checks=0;
const ok=(x,m)=>{assert.ok(x,m);checks++;};
async function make(){const db=await base.makeDatabase();
 for(const end of ['_conciliacion_finiquitos_y_seleccion_pagos.sql','_visor_semanal_pagos.sql','_recibos_lectura_gemini.sql','_cheques_neto_fuentes_alternas.sql']){const name=fs.readdirSync('supabase/migrations').find(n=>n.endsWith(end));if(!name)throw Error('Falta migración privada '+end);await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));}
 return db;}
(async()=>{let db=await make();const{ids,owner,rpc,actor}=base;try{
 const s=base.snapshot(ids.w,2000),cid=crypto.randomUUID(),d=crypto.randomUUID();
 await owner(db,"update trabajadores set rfc='PRUP900101AA1',nss='12345678901' where id=$1",[ids.w]);
 const original=(await owner(db,"select md5(string_agg(to_jsonb(t)::text,',' order by id)) h from trabajadores t")).rows[0].h;
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,1,'SEMANAL','PRUEBA','provisional',$3,$4)",[cid,ids.obra,JSON.stringify(s),ids.conta]);
 const arg={obra_id:ids.obra,trabajador_id:ids.w,semana:'S1',tipo_pago:'CHEQUE'};
 let r=await rpc(db,'conta','NETO_CHEQUE',arg);ok(r.estado==='SIN_RESPALDO'&&r.error,'No inventa neto sin ninguna fuente');
 const initialSource=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});await rpc(db,'conta','PREPARAR',{cierre_id:cid,snapshot:s,fuente:initialSource.fuente});
 let initialDet=await rpc(db,'conta','DETALLE',{cierre_id:cid});
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:cid,filas:[{trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PERSONA PRUEBA',tipo_calculo:'NOMINA',metodo_pago:'TRANSFERENCIA',monto_noi:2000}],archivo:'FICTICIO.xlsx',sha256:'b'.repeat(64),revision:initialDet.cierre.snapshot_sha256});
 ok((await rpc(db,'conta','NETO_CHEQUE',arg)).neto===2000,'NOI funciona sin PDF');
 await assert.rejects(rpc(db,'jire','NETO_CHEQUE',arg),/permiso/i);checks++;
 await assert.rejects(rpc(db,null,'NETO_CHEQUE',arg),/permission denied|sesión|permiso/i);checks++;
 await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,hash) values($1,$2,$3,'RECIBO_NOMINA','S1','recibo.pdf',$4)",[d,ids.obra,ids.w,'a'.repeat(64)]);
 r=await rpc(db,'consulta','NETO_CHEQUE',arg);ok(r.recibos_sin_leer.length===1&&r.neto===2000,'PDF sin leer no es obligatorio si existe NOI');
 const j={recibos:1,identificadores:['PRUP900101AA1'],nombre:null,numero:null,rfc:null,nss:null,curp:null,periodo_inicio:s.desde,periodo_fin:s.hasta,percepciones:2200,deducciones:200,neto:2000,evidencia_neto:'Neto pagado: 2,000.00'};
 const lectura={documento_id:d,hash:'a'.repeat(64),neto:2000,tipo:'NOMINA',datos:j};
 await assert.rejects(rpc(db,'conta','RECIBO',{...lectura,datos:{...j,identificadores:['OTRO900101AA1']}}),/verificable/i);checks++;
 await assert.rejects(rpc(db,'conta','RECIBO',{...lectura,datos:{...j,periodo_inicio:'2000-01-01'}}),/verificable/i);checks++;
 await assert.rejects(rpc(db,'conta','RECIBO',{...lectura,datos:{...j,neto:1999.99}}),/verificable/i);checks++;
 await assert.rejects(rpc(db,'consulta','RECIBO',lectura),/permiso/i);checks++;
 await rpc(db,'conta','RECIBO',lectura);
 r=await rpc(db,'conta','NETO_CHEQUE',arg);ok(r.neto===2000&&r.noi_n===1&&r.pdf_n===1,'Ambas fuentes coinciden sin sumar doble');
 await owner(db,'update documentos set nomina_neto=1999.99 where id=$1',[d]);
 ok((await rpc(db,'conta','NETO_CHEQUE',arg)).estado==='DIFERENCIA_FUENTES','Un centavo de diferencia entre fuentes bloquea');
 await owner(db,'update documentos set nomina_neto=2000 where id=$1',[d]);
 await owner(db,'delete from control_conciliacion_noi where cierre_id=$1',[cid]);await owner(db,'update control_cierres_nomina set archivo_noi=null,archivo_noi_sha256=null where id=$1',[cid]);
 r=await rpc(db,'conta','NETO_CHEQUE',arg);ok(r.neto===2000&&r.estado==='COINCIDE'&&r.origen.includes('PDF'),'Acepta sólo PDF validado, sin reporte NOI');
 const ia=crypto.randomUUID();await owner(db,"insert into platinum_internal.recibos_ia(id,documento_id,obra_id,revision,sha256,modelo,datos,motivos,estado,creado_por,confirmado_por,confirmado_en) values($1,$2,$3,'REV-FICTICIA',$4,'FICTICIO',$5,'[]','CONFIRMADO',$6,$6,now())",[ia,d,ids.obra,'a'.repeat(64),JSON.stringify(j),ids.conta]);
 await owner(db,"update documentos set nomina_tipo=null,nomina_lector='GEMINI_CONFIRMADO:'||$2 where id=$1",[d,ia]);
 r=await rpc(db,'conta','NETO_CHEQUE',arg);ok(r.recibos_sin_leer[0].datos_confirmados.neto===2000,'Recupera lectura Gemini ya confirmada sin volver a leer la imagen');
 await rpc(db,'conta','RECIBO',lectura);ok((await owner(db,'select nomina_lector from documentos where id=$1',[d])).rows[0].nomina_lector==='GEMINI_CONFIRMADO:'+ia,'Clasifica el concepto conservando procedencia Gemini');
 ok((await rpc(db,'conta','NETO_CHEQUE',{...arg,tipo_pago:'FINIQUITO'})).estado==='SIN_RESPALDO','No sustituye finiquito por sueldo');
 ok((await rpc(db,'conta','NETO_CHEQUE',{...arg,semana:'S2'})).estado==='SIN_RESPALDO','No usa PDF de otra semana');
 const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});await rpc(db,'conta','PREPARAR',{cierre_id:cid,snapshot:s,fuente:source.fuente});
 let det=await rpc(db,'conta','DETALLE',{cierre_id:cid});ok(det.diagnostico.pendientes===0,'Conciliación completa usa el mismo respaldo PDF');
 await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'REVISADO'});await rpc(db,'admin','TRANSICION',{cierre_id:cid,estado:'AUTORIZADO'});
 det=await rpc(db,'conta','DETALLE',{cierre_id:cid});ok(det.versiones.length===1&&det.saldos[0].importe===2000,'Autoriza versión con PDF, sin inventar NOI ni cambiar motor');
 await assert.rejects(rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'TIMBRADO'}),/faltan CFDI/i);checks++;
 await actor(db,'conta');let rev=(await db.query('select public.control_pagos_sabado($1,$2::jsonb) r',['PROPUESTA',JSON.stringify({obra_id:ids.obra,semana:1})])).rows[0].r;
 ok(rev.filas[0].importe===2000&&rev.filas[0].estado!=='PENDIENTE_NOI','Revisión del sábado reconoce respaldo PDF');
 const saturday=new Date(s.desde+'T12:00:00Z');saturday.setUTCDate(saturday.getUTCDate()+5);await base.clock(db,saturday.toISOString().slice(0,10)+'T12:00:00-06:00');
 await actor(db,'conta');rev=(await db.query("select control_pagos_sabado('PROPUESTA',$1::jsonb) r",[JSON.stringify({obra_id:ids.obra,semana:1})])).rows[0].r;ok(rev.filas[0].estado==='ELEGIBLE_CONFIRMACION','Lote ordinario sin NOI exige sábado y autorización');
 await db.exec('begin');await actor(db,'conta');const lote=(await db.query("select control_pagos_sabado('CREAR',$1::jsonb) r",[JSON.stringify({obra_id:ids.obra,semana:1,ids:[ids.w],huella:rev.huella,clave_idempotencia:crypto.randomUUID(),motivo:'Prueba de lote con recibo PDF validado',confirmacion:'CREAR CHEQUES CONFIRMADOS'})])).rows[0].r;ok(lote.creados===1,'Lote confirmado puede crearse con recibo, sin NOI');
 await db.query("update cheques set estatus='EXPEDIDO',num_cheque='LOTE-FICTICIO',consecutivo='999' where lote_nomina_id=$1",[lote.lote_id]);ok((await db.query("select count(*)::int n from cheques where estatus='EXPEDIDO'")).rows[0].n===1,'Guarda lote y expide con el mismo respaldo PDF');await db.exec('rollback');
 // Variaciones y ambigüedad: no elegir la fuente más conveniente.
 await owner(db,"update documentos set nomina_neto=1999.99 where id=$1",[d]);
 r=await rpc(db,'conta','NETO_CHEQUE',arg);ok(r.neto===1999.99,'Resolver no reescribe documentos ni motores');
 det=await rpc(db,'conta','DETALLE',{cierre_id:cid});ok(det.diagnostico.pendientes>0,'Diferencia motor-PDF bloquea conciliación');
 await owner(db,"update documentos set nomina_neto=2000,periodo_inicio='2000-01-01' where id=$1",[d]);
 ok((await rpc(db,'conta','NETO_CHEQUE',arg)).estado==='PERIODO_RECIBO_INCORRECTO','Año y fechas erróneas bloqueados aunque etiqueta S1 coincida');
 await owner(db,'update documentos set periodo_inicio=$2 where id=$1',[d,s.desde]);
 const duplicate=crypto.randomUUID();await owner(db,'insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,hash,nomina_neto,nomina_tipo,nomina_lector,periodo_inicio,periodo_fin) select $1,obra_id,trabajador_id,categoria,semana,archivo,hash,nomina_neto,nomina_tipo,nomina_lector,periodo_inicio,periodo_fin from documentos where id=$2',[duplicate,d]);
 ok((await rpc(db,'conta','NETO_CHEQUE',arg)).pdf_n===1,'Duplicado del mismo archivo no duplica neto');
 await owner(db,'update documentos set nomina_neto=1999.99 where id=$1',[duplicate]);ok((await rpc(db,'conta','NETO_CHEQUE',arg)).estado==='METADATOS_RECIBO_DISTINTOS','Mismo archivo con lecturas contradictorias no se deduplica en silencio');
 await owner(db,'update documentos set nomina_neto=2000 where id=$1',[duplicate]);
 await owner(db,"update documentos set archivo='otro.pdf',hash=$2 where id=$1",[duplicate,'b'.repeat(64)]);
 ok((await rpc(db,'conta','NETO_CHEQUE',arg)).estado==='VARIOS_RECIBOS','Dos documentos distintos ambiguos se revisan');
 await owner(db,'update documentos set anulado=true where id=$1',[duplicate]);
 ok((await rpc(db,'conta','NETO_CHEQUE',arg)).estado==='COINCIDE','Recibo anulado no compite');
 ok((await owner(db,"select md5(string_agg(to_jsonb(t)::text,',' order by id)) h from trabajadores t")).rows[0].h===original,'Datos personales y sueldo intactos');
 }finally{await db.close();}
 db=await make();try{
 const s=base.snapshot(ids.w,1200),d=crypto.randomUUID();s.items[0].tipo='FINIQUITO';s.items[0].metodo_pago='CHEQUE';s.total_nomina=0;s.total_finiquitos=1200;s.modelo.filas[0].fin=true;s.modelo.filas[0].pago='CHEQUE';
 await owner(db,"update trabajadores set estatus='BAJA',fecha_baja=$2,monto_finiquito=1200,rfc='PRUP900101AA1' where id=$1",[ids.w,s.desde]);
 let source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});const cid=(await rpc(db,'conta','CREAR',{snapshot:s,fuente:source.fuente})).cierre_id;
 await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo) values($1,$2,$3,'RECIBO_NOMINA','S1','fin.pdf')",[d,ids.obra,ids.w]);
 await rpc(db,'conta','RECIBO',{documento_id:d,neto:1200,tipo:'FINIQUITO',datos:{recibos:1,rfc:'PRUP900101AA1',neto:1200,percepciones:1206,deducciones:6,periodo_inicio:s.desde,periodo_fin:s.hasta,evidencia_neto:'Neto pagado 1,200.00'}});
 await actor(db,'conta');await db.query('select control_generar_cheques_pendientes($1,1)',[ids.obra]);
 const q=(await owner(db,'select * from cheques')).rows[0];ok(q.importe==='1200.00'||Number(q.importe)===1200,'Prepara finiquito desde PDF sin reporte NOI');
 source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});await rpc(db,'conta','PREPARAR',{cierre_id:cid,snapshot:s,fuente:source.fuente});await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'REVISADO'});await rpc(db,'admin','TRANSICION',{cierre_id:cid,estado:'AUTORIZADO'});
 await assert.rejects(owner(db,"update cheques set estatus='EXPEDIDO',num_cheque='9991',consecutivo='901',importe=1199.99 where id=$1",[q.id]),/neto positivo|coincidir/i);checks++;
 await db.exec('begin');await owner(db,"update cheques set estatus='EXPEDIDO',num_cheque='9991',consecutivo='901' where id=$1",[q.id]);ok((await owner(db,'select estatus from cheques where id=$1',[q.id])).rows[0].estatus==='EXPEDIDO','Guarda y expide sólo con PDF validado y versión autorizada');await db.exec('rollback');
 const bank=crypto.randomUUID();await owner(db,"insert into pagos(id,obra_id,trabajador_id,semana,medio,estado,importe,origen,fecha_pago,folio_lote) values($1,$2,$3,'S1','TRANSFERENCIA','EXITOSO',1200,'INDIVIDUAL',$4,'FOLIO-FICTICIO')",[bank,ids.obra,ids.w,s.hasta]);
 await actor(db,'admin');const ready=(await db.query("select control_pagos_sabado('FINIQUITOS',$1::jsonb) r",[JSON.stringify({obra_id:ids.obra,semana:1})])).rows[0].r;ok(ready.filas[0].estado==='LISTO_TRANSFERENCIA','Conciliación de finiquito-banco acepta recibo como fuente');
 const trans=await rpc(db,'admin','TRANSFERIR_FINIQUITO',{trabajador_id:ids.w,semana:1,pago_id:bank,motivo:'Prueba de recibo sin reporte de NOI',confirmacion:'CONFIRMAR TRANSFERENCIA'});ok(trans.estado==='CONCILIADO_BANCO','Excepción por transferencia usa idéntico respaldo sin requerir reporte');
 ok((await owner(db,'select eliminado from cheques where id=$1',[q.id])).rows[0].eliminado===true,'Retira sólo pendiente sin folios, conserva banco');
 }finally{await db.close();}
 console.log(`PASS ${checks} comprobaciones PostgreSQL de fuentes alternas, fechas, identidad, tipos, permisos, expedición y cierre sin NOI.`);
})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
