// PostgreSQL real aislado, importes y personas sintéticos. Nunca llama a Google.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const{makeDatabase,ids,owner,actor}=require('./soporte_pagos_sabado_pg.cjs');let tests=0;const ok=(v,m)=>{assert.ok(v,m);tests++;};
(async()=>{const db=await makeDatabase();try{
 await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_recibos_lectura_gemini.sql')),'utf8'));
 await owner(db,"update trabajadores set rfc='PRUP900101AA1',curp='PRUP900101HDFXXX01',nss='12345678901' where id=$1",[ids.w]);
 const start=(await owner(db,'select fecha_inicio::text f from obras where id=$1',[ids.obra])).rows[0].f,end=new Date(start+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);const hasta=end.toISOString().slice(0,10);
 const d=crypto.randomUUID();await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,anulado) values($1,$2,$3,'RECIBO_NOMINA','S1','ficticio.pdf',false)",[d,ids.obra,ids.w]);
 const call=async(a,data={},key='conta')=>{await actor(db,key);return(await db.query('select control_recibos_ia($1,$2::jsonb) d',[a,JSON.stringify({obra_id:ids.obra,semana:1,documento_id:d,...data})])).rows[0].d;};
 const j={recibos:1,nombre:'PERSONA PRUEBA',numero:1,rfc:'PRUP900101AA1',curp:null,nss:null,periodo_inicio:start,periodo_fin:hasta,neto:1800,percepciones:2000,deducciones:200,evidencia_neto:'NETO PAGADO 1,800.00'};
 const before=(await owner(db,"select md5(string_agg(to_jsonb(t)::text,',' order by id)) h from trabajadores t")).rows[0].h;
 const pre=await call('PREPARAR');ok(pre.archivo==='ficticio.pdf'&&pre.revision.length===32,'Archivo autorizado y revisión estable');
 const propose=datos=>call('PROPONER',{revision:pre.revision,sha256:'a'.repeat(64),modelo:'FICTICIO',datos});
 const p=await propose(j);ok(p.estado==='PROPUESTA','Identidad, periodo y sumas verificadas');
 ok((await owner(db,'select nomina_neto from documentos where id=$1',[d])).rows[0].nomina_neto===null,'Leer no guarda neto sin confirmar');
 for(const bad of [{...j,rfc:'OTRO900101AA1',numero:999},{...j,neto:1801},{...j,recibos:2},{...j,periodo_inicio:'2000-01-01'},{...j,percepciones:null},{...j,neto:1800.001},{...j,evidencia_neto:'NETO PAGADO 1,900.00'}]){const x=await propose(bad);ok(x.estado==='REVISAR'&&x.motivos.length>0,'Lectura ambigua bloqueada');await assert.rejects(call('CONFIRMAR',{lectura_id:x.id,confirmacion:'CONFIRMAR IMPORTE DEL RECIBO'}),/requiere revisión/i);tests++;}
 await assert.rejects(call('CONFIRMAR',{lectura_id:p.id,confirmacion:'SI'}),/confirmar/i);tests++;
 await assert.rejects(call('PREPARAR',{},'consulta'),/permiso/i);tests++;
 await assert.rejects(call('LISTAR',{},'jire'),/permiso/i);tests++;
 await assert.rejects(call('LISTAR',{},null),/permission denied|permiso/i);tests++;
 ok((await call('LISTAR',{},'consulta')).puede_leer===false,'Consulta puede ver sin ejecutar IA');
 await owner(db,"update documentos set notas='Cambió el recibo' where id=$1",[d]);await assert.rejects(call('CONFIRMAR',{lectura_id:p.id,confirmacion:'CONFIRMAR IMPORTE DEL RECIBO'}),/cambió/i);tests++;
 const now=await call('PREPARAR'),fresh=await call('PROPONER',{revision:now.revision,sha256:'b'.repeat(64),modelo:'FICTICIO',datos:j});
 const result=await call('CONFIRMAR',{lectura_id:fresh.id,confirmacion:'CONFIRMAR IMPORTE DEL RECIBO'});ok(result.neto===1800,'Confirmación explícita completa neto faltante');
 ok((await call('CONFIRMAR',{lectura_id:fresh.id,confirmacion:'CONFIRMAR IMPORTE DEL RECIBO'})).ya_confirmado,'Idempotencia sin duplicar');
 await assert.rejects(call('PROPONER',{revision:now.revision,sha256:'b'.repeat(64),modelo:'FICTICIO',datos:{...j,neto:100}}),/ya tiene importe/i);tests++;
 const saved=(await owner(db,'select nomina_neto,nomina_lector,archivo from documentos where id=$1',[d])).rows[0];ok(Number(saved.nomina_neto)===1800&&saved.nomina_lector.includes(fresh.id)&&saved.archivo==='ficticio.pdf','Procedencia y PDF intacto');
 const audit=(await owner(db,'select estado,confirmado_por from platinum_internal.recibos_ia where id=$1',[fresh.id])).rows[0];ok(audit.estado==='CONFIRMADO'&&audit.confirmado_por===ids.conta,'Auditoría enlazada');
 ok((await owner(db,"select md5(string_agg(to_jsonb(t)::text,',' order by id)) h from trabajadores t")).rows[0].h===before,'No modifica personal ni nómina');
 ok((await call('LISTAR')).total===0,'Recibo confirmado sale de pendientes');
 await assert.rejects(db.query("update platinum_internal.recibos_ia set confirmado_en=now() where id=$1",[fresh.id]),/inmutable/i);tests++;
 await assert.rejects(db.query("update platinum_internal.recibos_ia set datos='{}' where id=$1",[fresh.id]),/permission denied/i);tests++;
 console.log(`PASS ${tests} comprobaciones PostgreSQL de lectura IA: identidad, periodo, sumas, roles, revisión, idempotencia y conservación.`);
 }finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
