// PostgreSQL local aislado. Sólo identidades y documentos ficticios.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),base=require('./soporte_pagos_sabado_pg.cjs');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
(async()=>{const db=await base.makeDatabase();const {rpc,owner,ids}=base;try{
 for(const end of ['_conciliacion_finiquitos_y_seleccion_pagos.sql','_visor_semanal_pagos.sql','_recibos_lectura_gemini.sql','_cheques_neto_fuentes_alternas.sql','_noi_identidad_y_estado_expedicion.sql']){const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith(end));await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));}
 await owner(db,"update trabajadores set rfc='PRUP900101AA1',nss='12345678901' where id=$1",[ids.w]);
 await owner(db,"update trabajadores set nombres='OTRA' where id=$1",[ids.w2]);
 const s=base.snapshot(ids.w,2000),cid=crypto.randomUUID();s.items[0].tipo='FINIQUITO';s.items[0].metodo_pago='CHEQUE';s.modelo.filas[0].fin=true;s.total_nomina=0;s.total_finiquitos=2000;
 await owner(db,"insert into control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,1,'SEMANAL','PRUEBA','provisional',$3,$4)",[cid,ids.obra,JSON.stringify(s),ids.conta]);
 const source=await rpc(db,'conta','FUENTE',{obra_id:ids.obra,semana:1});await rpc(db,'conta','PREPARAR',{cierre_id:cid,snapshot:s,fuente:source.fuente});
 const c=(await rpc(db,'conta','DETALLE',{cierre_id:cid})).cierre;
 const identity={version:1,rfc:'PRUP900101AA1',nss:'12345678901',nombre:'PERSONA PRUEBA',numero_noi:88};
 const row={trabajador_id:ids.w,trabajador_numero:1,trabajador_nombre:'PRUEBA PERSONA',tipo_calculo:'FINIQUITO',monto_noi:2000,detalle:{identidad_noi:identity}};
 const args={cierre_id:cid,filas:[row],archivo:'FICTICIO.xlsx',sha256:'a'.repeat(64),revision:c.snapshot_sha256};
 const reject=async(j,re)=>{await assert.rejects(rpc(db,'conta','IMPORTAR_NOI',{...args,filas:[j]}),re);n++;};
 await reject({...row,detalle:{}},/falta verificar la identidad/);
 await reject({...row,detalle:{identidad_noi:{...identity,rfc:'PRUX900101AA2'}}},/contradicen/);
 await reject({...row,detalle:{identidad_noi:{...identity,nombre:'DISTINTA PERSONA'}}},/no concuerdan/);
 await reject({...row,detalle:{identidad_noi:{version:1,numero_noi:1}}},/por sí solo/);
 await reject({...row,trabajador_id:ids.wOtra},/fuera del centro/);
 await reject({...row,detalle:{identidad_noi:{...identity,rfc:'INVALIDO'}}},/inválido/);
 await rpc(db,'conta','IMPORTAR_NOI',args);
 let d=await rpc(db,'consulta','DETALLE',{cierre_id:cid});ok(d.diagnostico.pendientes===0,'NOI cruzado por identidad aunque su clave no coincida');
 const cheque={obra_id:ids.obra,trabajador_id:ids.w,semana:'S1',tipo_pago:'FINIQUITO'};
 let r=await rpc(db,'conta','NETO_CHEQUE',cheque);ok(r.neto===2000&&r.estado==='COINCIDE','NOI por sí solo basta para neto');
 ok(!r.expedicion.requisitos_cierre_cumplidos&&r.expedicion.estado_cierre==='BORRADOR','Neto verificado no implica autorización');
 await rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'REVISADO'});
 r=await rpc(db,'conta','NETO_CHEQUE',cheque);ok(r.expedicion.pendiente.includes('REVISADO'),'Identifica etapa real, no exige otro recibo');
 await assert.rejects(owner(db,"insert into cheques(id,obra_id,trabajador_id,nombre,semana,tipo_pago,importe,estatus,num_cheque,consecutivo) values($1,$2,$3,'PERSONA PRUEBA','S1','FINIQUITO',2000,'EXPEDIDO','123','7')",[crypto.randomUUID(),ids.obra,ids.w]),/autoriza/);n++;
 await assert.rejects(rpc(db,'conta','TRANSICION',{cierre_id:cid,estado:'AUTORIZADO'}),/administrador/);n++;
 await rpc(db,'admin','TRANSICION',{cierre_id:cid,estado:'AUTORIZADO'});
 r=await rpc(db,'conta','NETO_CHEQUE',cheque);ok(r.expedicion.requisitos_cierre_cumplidos,'Autorización legítima habilita requisitos del cierre');
 const issued=await owner(db,"update cheques set estatus='EXPEDIDO',num_cheque='123',consecutivo='7' where obra_id=$1 and trabajador_id=$2 and semana='S1' and tipo_pago='FINIQUITO' returning id",[ids.obra,ids.w]);ok(issued.rows.length===1,'Expide el pendiente automático ya existente');
 await assert.rejects(rpc(db,'conta','IMPORTAR_NOI',args),/reapertura/);n++;
 ok((await owner(db,'select count(*) n from cheques')).rows[0].n===1,'Expedición única y ningún pago inventado');
 console.log('PASS '+n+' comprobaciones PostgreSQL: identidad, contradicciones, atomicidad, cierre revisado, autorización y expedición.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
