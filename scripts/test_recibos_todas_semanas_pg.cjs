const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict'),base=require('./soporte_cierres_actuales_pg.cjs');
(async()=>{const db=await base.makeDatabase(),{ids,owner,rpc,actor}=base;try{
 const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_recibos_verificacion_todas_semanas.sql'));
 await db.exec(fs.readFileSync(migration?'supabase/migrations/'+migration:'work/recibos_todas_semanas_20261029/recibos_catalogo.sql','utf8'));
 await owner(db,"update trabajadores set rfc='PRUP900101AA1',nss='12345678901' where id=$1",[ids.w]);
 await owner(db,"update obras set fecha_inicio='2026-03-30' where id=$1",[ids.obra]);
 await owner(db,"insert into config(clave,valor) values('empresa_PLATINUM','{\"rfc\":\"EMP900101AA1\"}') on conflict(clave) do update set valor=excluded.valor");
 const docs=[];for(let i=0;i<70;i++){const id='30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),hash=crypto.createHash('sha256').update('FICTICIO'+i).digest('hex'),sem=i%2?29:30;
  await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,hash) values($1,$2,$3,'RECIBO_NOMINA',$4,$5,$6)",[id,ids.obra,ids.w,'S'+sem,id+'.pdf',hash]);docs.push({id,hash,sem});}
 let r=await rpc(db,'consulta','RECIBOS_RESUMEN',{obra_id:ids.obra});assert.equal(r.archivados,70);assert.equal(r.pendientes,70);assert(!r.escritura);
 await assert.rejects(rpc(db,'jire','RECIBOS_RESUMEN',{obra_id:ids.obra}),/permiso|alcance/i);
 await assert.rejects(rpc(db,null,'RECIBOS_RESUMEN',{obra_id:ids.obra}),/permiso|permission|sesi/i);
 for(const n of [0,54])await assert.rejects(rpc(db,'conta','RECIBOS_PENDIENTES',{obra_id:ids.obra,semana:n}),/Semana/);
 await assert.rejects(rpc(db,'conta','RECIBOS_PENDIENTES',{obra_id:ids.obra,ids:Array(51).fill(docs[0].id)}),/50/);
 await assert.rejects(rpc(db,'consulta','RECIBO_ERROR',{documento_id:docs[0].id,hash:docs[0].hash,etapa:'LECTURA',mensaje:'Error ficticio'}),/permiso|consulta|escritura/i);
 await assert.rejects(rpc(db,'conta','RECIBO_ERROR',{documento_id:docs[0].id,hash:'otra',mensaje:'Error ficticio'}),/Cambió/);
 await rpc(db,'conta','RECIBO_ERROR',{documento_id:docs[0].id,hash:docs[0].hash,etapa:'LECTURA',mensaje:'Texto ficticio <script>no ejecutar</script>'});
 r=await rpc(db,'conta','RECIBOS_PENDIENTES',{obra_id:ids.obra,ids:[docs[0].id]});assert.equal(r.filas.length,1);assert(r.filas[0].error_mensaje.includes('<script>'));
 // El cursor no es offset: guardar cada página cambia el conjunto pendiente.
 const seen=new Set();let cursor=null,pages=0;
 while(true){r=await rpc(db,'conta','RECIBOS_PENDIENTES',{obra_id:ids.obra,cursor,limite:25});if(!r.filas.length)break;assert(r.cursor!==cursor);cursor=r.cursor;pages++;
  for(const d of r.filas){assert(!seen.has(d.id));seen.add(d.id);const source=docs.find(x=>x.id===d.id),start=source.sem===30?'2026-10-19':'2026-10-12',end=source.sem===30?'2026-10-25':'2026-10-18',uuid=crypto.randomUUID().toUpperCase();
   const datos={recibos:1,identificadores:['PRUP900101AA1','EMP900101AA1'],periodo_inicio:start,periodo_fin:end,percepciones:2200,deducciones:200,neto:2000,evidencia_neto:'Neto pagado: 2,000.00',cfdi_uuid:uuid,evidencia_timbrado:uuid+' Sello digital del SAT '+('A'.repeat(80))};
   if(seen.size===1)await assert.rejects(rpc(db,'conta','RECIBO',{documento_id:d.id,hash:d.hash,neto:2000,tipo:null,datos}),/no válida/);
   await rpc(db,'conta','RECIBO',{documento_id:d.id,hash:d.hash,neto:2000,tipo:null,solo_archivo:true,datos});
  }
 }
 assert.equal(seen.size,70);assert.equal(pages,3);
 r=await rpc(db,'conta','RECIBOS_RESUMEN',{obra_id:ids.obra});assert.equal(r.verificados,70);assert.equal(r.pendientes,0);assert.equal(r.semanas.reduce((n,x)=>n+x.concepto_pendiente,0),70);
 const financial=(await owner(db,'select (select count(*) from control_obligaciones_pago) obligaciones,(select count(*) from pagos) pagos,(select count(*) from cheques) cheques')).rows[0];assert.equal(Number(financial.obligaciones),0);assert.equal(Number(financial.pagos),0);assert.equal(Number(financial.cheques),0);
 await actor(db,'conta');await assert.rejects(db.query('select platinum_internal.recibos_catalogo($1,false)',[JSON.stringify({obra_id:ids.obra})]),/permission denied/);
 // Cambiar hash invalida la prueba anterior y vuelve a la cola sin usar el error viejo.
 await owner(db,"update documentos set hash='NUEVA-HUELLA' where id=$1",[docs[0].id]);r=await rpc(db,'conta','RECIBOS_PENDIENTES',{obra_id:ids.obra});assert.equal(r.filas.length,1);assert.equal(r.filas[0].error_mensaje,null);
 // Leer un PDF de una versión autorizada conserva fotografía, fuentes y estado.
 const s=base.snapshot(),cid=crypto.randomUUID(),pdf=crypto.randomUUID();
 s.semana=1;s.desde='2026-03-30';s.hasta='2026-04-05';
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,1,'SEMANAL','PRUEBA','provisional',$3,$4)",[cid,ids.obra,JSON.stringify(s),ids.conta]);
 const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});await rpc(db,'conta','PREPARAR',{cierre_id:cid,snapshot:s,fuente:source.fuente});
 const c=(await rpc(db,'conta','DETALLE',{cierre_id:cid})).cierre;
 await rpc(db,'conta','IMPORTAR_NOI',{cierre_id:cid,archivo:'FICTICIO.xlsx',sha256:'b'.repeat(64),revision:c.snapshot_sha256,filas:[{trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PERSONA PRUEBA',tipo_calculo:'NOMINA',monto_noi:2000,detalle:{identidad_noi:{version:1,rfc:'PRUP900101AA1',nombre:'PERSONA PRUEBA',numero_noi:1}}}]});
 await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'AUTORIZADO'});
 const before=await rpc(db,'conta','DETALLE',{cierre_id:cid});
 await owner(db,"insert into documentos(id,obra_id,trabajador_id,categoria,semana,archivo,hash) values($1,$2,$3,'RECIBO_NOMINA','S1','CIERRE-FICTICIO.pdf',$4)",[pdf,ids.obra,ids.w,'c'.repeat(64)]);
 const uuid=crypto.randomUUID(),datos={recibos:1,identificadores:['PRUP900101AA1','EMP900101AA1'],periodo_inicio:s.desde,periodo_fin:s.hasta,percepciones:2200,deducciones:200,neto:2000,evidencia_neto:'Neto pagado: 2,000.00',cfdi_uuid:uuid,evidencia_timbrado:uuid+' Sello digital del SAT '+('A'.repeat(80))};
 await rpc(db,'conta','RECIBO',{documento_id:pdf,cierre_id:cid,hash:'c'.repeat(64),neto:2000,tipo:'NOMINA',datos});
 const after=await rpc(db,'conta','DETALLE',{cierre_id:cid});assert.equal(after.cierre.estado,'AUTORIZADO');assert.deepEqual(after.cierre.snapshot,before.cierre.snapshot);assert.equal(after.flujo.sucio,before.flujo.sucio);assert.equal(after.timbrado.pendientes,0);
 await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'TIMBRADO'});
 console.log('PASS recibos todas semanas: 70 PDF, 3 páginas sin saltos, prueba fiscal sin inventar concepto, errores persistentes, huella, permisos y cero movimientos de pago.');
 }finally{await db.close();}})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
