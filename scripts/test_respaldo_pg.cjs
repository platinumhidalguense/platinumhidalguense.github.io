// Respaldo integral: RPC control_respaldo en PostgreSQL local (PGlite) con funciones de autorización y
// políticas SELECT de producción (work/respaldo_20261111/prod_base.sql). Datos ficticios.
// Verifica que MARCAS cuente exactamente lo que cada usuario obtiene por RLS + filtros del cliente.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),priv=path.join(root,'work/respaldo_20261111'),mig=path.join(root,'supabase/migrations/20261111100100_respaldo_marcas.sql');
if(!fs.existsSync(mig)||!fs.existsSync(path.join(priv,'generar_prod_base.cjs'))){console.log('ALCANCE PÚBLICO RESPALDO: la prueba PostgreSQL requiere la migración privada de marcas; no se cuenta como ejecutada.');process.exit(0);}
require(path.join(priv,'generar_prod_base.cjs'));
const {makeDatabase,ids,actor,owner}=require('./soporte_flujo_pg.cjs');
require(path.join(root,'frontend/modulos/79-respaldo-integral.js'));
const FU=globalThis.PLATINUM_RESPALDO.fuentes(),CLAVES=FU.map(f=>f.clave);
const TIEMPOS=[];let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};
const u=i=>'50000000-0000-4000-8000-'+String(i).padStart(12,'0');
async function rpc(db,who,acc,datos){await actor(db,who);try{return (await db.query('select public.control_respaldo($1,$2::jsonb) r',[acc,JSON.stringify(datos)])).rows[0].r;}finally{await db.exec('reset role');}}
async function falla(db,who,acc,datos,re,m){let e=null;try{await rpc(db,who,acc,datos);}catch(x){e=x;}await db.exec('reset role');ok(e&&re.test(e.message),m+' → '+(e&&e.message));}
(async()=>{
 const db=await makeDatabase();
 await db.exec(fs.readFileSync(path.join(priv,'prod_base.sql'),'utf8'));
 const sqlMig=fs.readFileSync(mig,'utf8');await db.exec(sqlMig);await db.exec(sqlMig);ok(true,'migración reaplicable');
 // Catálogo SQL = catálogo del módulo.
 const sqlClaves=[...sqlMig.matchAll(/^\s*\('([a-z_0-9]+)','(public|platinum_internal)\./gm)].map(m=>m[1]);
 eq(sqlClaves.slice().sort(),CLAVES.slice().sort(),'mismas fuentes en SQL y en el módulo');
 const def=(await owner(db,"select prosecdef,proconfig,provolatile from pg_proc where proname='control_respaldo'")).rows[0];
 eq([def.prosecdef,def.proconfig,def.provolatile],[true,['search_path=""'],'s'],'SECURITY DEFINER, search_path vacío y STABLE');
 // Usuarios: admin (VIP, salud, admin), consulta (sin VIP/salud), restringido (un centro), jire (otra razón social).
 const otraP=u(900);ids.restringido=u(901);
 await owner(db,"insert into public.obras(id,nombre,empresa_codigo,fecha_inicio,registro_patronal,activa) values($1,'OTRA PLATINUM','PLATINUM','2026-03-30','A12-34567-10-1',true)",[otraP]);
 await owner(db,"update public.obras set registro_patronal='A12-34567-10-1' where id=$1",[ids.obra]);
 await owner(db,"insert into auth.users(id) values($1)",[ids.restringido]);
 await owner(db,"insert into public.app_usuarios(user_id,email,rol,activo,full_access,puede_escribir,puede_eliminar,empresas_permitidas,obras_permitidas) values($1,'restringido@prueba.test','CONSULTA',true,false,false,false,'{PLATINUM}',$2)",[ids.restringido,[ids.obra]]);
 await owner(db,"set session_replication_role=replica");
 const W=[ids.w,ids.w2];let k=10;
 const ins=async(t,cols,vals)=>owner(db,`insert into ${t}(${cols}) values(${vals.map((_,i)=>'$'+(i+1)).join(',')})`,vals);
 await ins('public.trabajadores','id,obra_id,no_trab,nombres,estatus,eliminado,fecha_reingreso',[u(k++),otraP,1,'OTRA','ACTIVO',false,'2026-08-03']);
 await ins('public.trabajadores','id,obra_id,no_trab,nombres,estatus,eliminado',[u(k++),ids.obra,9,'PAPELERA','BAJA',true]);
 for(const o of [ids.obra,otraP,ids.otra]){
  await ins('public.historial','id,trabajador_id,obra_id,accion,datos_despues,fecha',[k++,ids.w,o,'ALTA','{"fecha_alta":"2026-04-06"}','2026-04-06T12:00:00Z']);
  const pg=u(k++);await ins('public.pagos','id,obra_id,trabajador_id,semana,medio,importe,created_at',[pg,o,ids.w,'S1','TRANSFERENCIA',100.5,'2026-04-10T12:00:00Z']);
  await ins('public.cheques','id,obra_id,trabajador_id,nombre,tipo_pago,estatus,eliminado,importe,created_at,updated_at',[u(k++),o,ids.w,'X','CHEQUE','PENDIENTE',false,10,'2026-04-10T12:00:00Z','2026-04-10T12:00:00Z']);
  await ins('public.cheques','id,obra_id,trabajador_id,nombre,tipo_pago,estatus,eliminado,importe,created_at,updated_at',[u(k++),o,ids.w,'X','CHEQUE','PENDIENTE',true,10,'2026-04-10T12:00:00Z','2026-04-10T12:00:00Z']);
  const ob1=u(k++),ob2=u(k++),ev=u(k++);
  await ins('public.control_obligaciones_pago','id,cierre_origen,obra_id,trabajador_id,semana,tipo,nombre,contratista,importe,metodo,vigente,version_id',[ob1,u(k++),o,ids.w,1,'NOMINA','X','C',100,'TRANSFERENCIA',true,u(k++)]);
  await ins('public.control_obligaciones_pago','id,cierre_origen,obra_id,trabajador_id,semana,tipo,nombre,contratista,importe,metodo,vigente,version_id',[ob2,u(k++),o,ids.w,1,'PREVISION_SOCIAL','X','C',50,'TRANSFERENCIA',true,u(k++)]);
  await ins('public.control_evidencias_pago','id,obra_id,trabajador_id,semana,clave,importe,pago_id',[ev,o,ids.w,1,'K'+k,150,pg]);
  for(const ob of [ob1,ob2])await ins('public.control_pago_aplicaciones','id,obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo',[u(k++),o,ob,ev,u(k++),75,ids.admin,u(k++),'APLICACION DE PRUEBA']);
  await ins('public.catalogo_incidencias','id,nombre,clase,afecta_septimo,afecta_ptu,afecta_infonavit,automatismo,fuente',[k%30000,'F'+k,'AUSENTISMO',true,true,true,'','x']).catch(()=>{});
  await ins('public.incidencias_empleados','id,obra_id,empleado_id,fecha_aplicacion,id_incidencia,clase',[u(k++),o,ids.w,'2026-05-05',null,'AUSENCIA']);
  await ins('public.incidencias_empleados','id,obra_id,empleado_id,fecha_aplicacion,id_incidencia,clase',[u(k++),o,ids.w,'2026-05-06',999,'INCAPACIDAD']);
  await ins('public.control_casos_imss','id,obra_id,trabajador_id,tipo_caso,estado',[u(k++),o,ids.w,'ENFERMEDAD','EN_SEGUIMIENTO']);
  await ins('public.sueldos_internos','trabajador_id,obra_id,sueldo_imss,sueldo_real',[u(k++),o,1,2]);
  await ins('public.control_cierres_eliminados','id,obra_id,semana,periodo,estado_anterior,motivo,snapshot_sha256,cierre,conciliacion,cheques_vinculados,actor_id,actor_email',[u(k++),o,1,'SEMANAL','BORRADOR','DUPLICADO DE PRUEBA','x','{}','[]','[]',ids.admin,'admin@prueba.test']);
  await ins('public.rrhh_procesos','id,obra_id,tipo,estado',[u(k++),o,'INCAPACIDAD','ABIERTO']);
  await ins('public.rrhh_procesos','id,obra_id,tipo,estado',[u(k++),o,'ALTA','ABIERTO']);
  await ins('platinum_internal.bajas_operaciones','id,obra_id,trabajador_id,fecha_baja',[u(k++),o,ids.w,'2026-06-30']);
  await ins('platinum_internal.bajas_operaciones','id,obra_id,trabajador_id,fecha_baja',[u(k++),o,ids.w2,'2026-07-30']);
  await ins('platinum_internal.imss_auditoria_integraciones','id,obra_id,trabajador_id',[u(k++),o,ids.w]);
 }
 await ins('public.catalogo_incidencias','id,nombre,clase,afecta_septimo,afecta_ptu,afecta_infonavit,automatismo,fuente',[999,'INCAP','INCAPACIDAD',false,false,true,'','x']);
 for(const t of ['rrhh_tareas','rrhh_eventos'])for(const p of (await owner(db,'select id,obra_id from public.rrhh_procesos')).rows)
  await owner(db,`insert into public.${t}(id,proceso_id,obra_id,${t==='rrhh_tareas'?'codigo,titulo':'accion'}) values(${t==='rrhh_tareas'?'gen_random_uuid()':String(k++)},$1,$2,${t==='rrhh_tareas'?"'C','T'":"'X'"})`,[p.id,p.obra_id]);
 const re=u(k++);await ins('public.reuniones_entrega_cheques','id,empresa_codigo,lugar,responsable,estado',[re,'PLATINUM','L','R','ABIERTA']);
 await ins('public.reuniones_entrega_cheques','id,empresa_codigo,lugar,responsable,estado',[u(k++),'JIRE','L','R','ABIERTA']);
 await ins('public.reunion_cheques_entrega','id,reunion_id,cheque_id,origen,entregado,activo',[u(k++),re,u(1),'M',false,true]);
 const imp=u(k++);await ins('public.infonavit_avisos_importaciones','id,empresa_codigo,registro_patronal,archivo_nombre,archivo_sha256,estado',[imp,'PLATINUM','A1234567101','a','s','OK']);
 await ins('public.infonavit_avisos_archivos','importacion_id,contenido',[imp,Buffer.from('PK')]);
 await ins('public.config','clave,valor',['correo_creados','{"pwd":"x"}']);await ins('public.config','clave,valor',['fiscal','{"uma":117.31}']);
 await owner(db,"set session_replication_role=origin");
 // Consulta del cliente: alcance + filtros explícitos del módulo; la RLS de producción hace el resto.
 const cliente=async(who,f,obras,emp,perm)=>{
  const t=f.alcance==='interna'?null:'public.'+f.tabla;if(!t)return null;
  const w=[],a=[obras];
  if(f.alcance==='centros')w.push('id=any($1)');else if(f.alcance==='obra')w.push('obra_id=any($1)');
  else if(f.alcance==='obra_o_global')w.push(perm.vip?'(obra_id=any($1) or obra_id is null)':'obra_id=any($1)');
  else if(f.alcance==='empresa')w.push("empresa_codigo='"+emp+"'");
  else if(f.alcance==='config')w.push("clave = any(array['app_version','carta_finiquito','catalogo_puestos','fiscal','motores_nomina','tabulador','empresa_"+emp+"','contrato_empresa_"+emp+"'])");
  else if(f.alcance==='padre'){const m={control_aguinaldo_lotes:"id in (select lote_id from public.control_aguinaldo_lineas where obra_id=any($1))",reunion_cheques_entrega:"reunion_id in (select id from public.reuniones_entrega_cheques where empresa_codigo='"+emp+"')",
   reunion_bloques_cheques:"reunion_id in (select id from public.reuniones_entrega_cheques where empresa_codigo='"+emp+"')",control_casos_imss_semanas:'caso_id in (select id from public.control_casos_imss where obra_id=any($1))',
   infonavit_avisos_archivos:"importacion_id in (select id from public.infonavit_avisos_importaciones where empresa_codigo='"+emp+"')"};w.push(m[f.clave]);}
  if(['trabajadores','cheques'].includes(f.clave)&&!perm.admin)w.push('not eliminado');
  if(f.clave==='control_obligaciones_pago'&&!perm.vip)w.push("tipo<>'PREVISION_SOCIAL'");
  if(f.clave==='control_pago_aplicaciones'&&!perm.vip)w.push("obligacion_id not in (select id from public.control_obligaciones_pago where obra_id=any($1) and tipo='PREVISION_SOCIAL')");
  await actor(db,who);try{return Number((await db.query(`select count(*) c from ${t} where ${w.join(' and ')||'true'}`,w.join(' ').includes('$1')?a:[])).rows[0].c);}finally{await db.exec('reset role');}
 };
 for(const [who,emp] of [['admin','PLATINUM'],['consulta','PLATINUM'],['restringido','PLATINUM'],['jire','JIRE'],['conta','PLATINUM']]){
  const M=await rpc(db,who,'MARCAS',{empresa:emp,fuentes:CLAVES,columnas:true});
  eq(M.desconocidas,[],who+': todas las fuentes reconocidas');
  let comparadas=0;
  for(const f of FU){
   const m=M.marcas[f.clave];
   if(m.omitida){ok(f.permiso,who+': '+f.clave+' sólo se omite por permiso');continue;}
   const c=await cliente(who,f,M.obras,emp,M.permisos);if(c===null)continue;
   eq(Number(m.filas),c,who+': '+f.clave+' marcas = lo que la RLS entrega al cliente');comparadas++;
   if(m.filas>0&&f.alcance==='obra')eq(Object.values(m.por_obra).reduce((s,x)=>s+Number(x),0),Number(m.filas),who+': conteo por centro');
  }
  ok(comparadas>=60,who+': comparadas '+comparadas);
  if(who==='admin'){ok(M.permisos.vip&&M.permisos.salud&&M.permisos.admin&&M.columnas.trabajadores.some(c=>c[0]==='fecha_reingreso'),'admin: permisos y columnas');}
  if(who==='consulta'){eq(['sueldos_internos','control_casos_imss','control_cierres_eliminados','bajas_operaciones','app_usuarios','nom035'].map(k=>M.marcas[k].omitida),['PERMISO_VIP','PERMISO_SALUD','PERMISO_ADMIN','PERMISO_VIP','PERMISO_ADMIN_VIP','PERMISO_SALUD'],'consulta: omisiones por permiso');}
  if(who==='restringido'){eq(M.obras,[ids.obra],'restringido: sólo su centro');}
 }
 // Centros pedidos fuera de alcance quedan rechazados y visibles.
 const R=await rpc(db,'restringido','MARCAS',{empresa:'PLATINUM',obras:[ids.obra,otraP],fuentes:['pagos']});
 eq([R.obras,R.obras_rechazadas,R.marcas.pagos.filas],[[ids.obra],[otraP],1],'centro no autorizado rechazado; conteos con el mismo alcance');
 // Marcas estables sin cambios; cambian con una actualización.
 const a=await rpc(db,'admin','MARCAS',{empresa:'PLATINUM',fuentes:['pagos','trabajadores']}),b=await rpc(db,'admin','MARCAS',{empresa:'PLATINUM',fuentes:['pagos','trabajadores']});
 eq(a.marcas,b.marcas,'marcas idénticas sin cambios');
 await owner(db,"set session_replication_role=replica");await owner(db,"update public.pagos set importe=importe+0.01 where obra_id=$1",[ids.obra]);await owner(db,"set session_replication_role=origin");
 const c=await rpc(db,'admin','MARCAS',{empresa:'PLATINUM',fuentes:['pagos','trabajadores']});
 ok(c.marcas.pagos.huella!==a.marcas.pagos.huella&&c.marcas.pagos.filas===a.marcas.pagos.filas&&c.marcas.trabajadores.huella===a.marcas.trabajadores.huella,'una edición sin cambio de conteo se detecta por la huella');
 // LEER: tablas internas sólo VIP, paginación por llave completa.
 let filas=[],despues=null;
 for(;;){const r=await rpc(db,'admin','LEER',{empresa:'PLATINUM',fuente:'bajas_operaciones',limite:1,despues});filas.push(...r.filas);if(!r.siguiente)break;despues=r.siguiente;}
 const esp=(await owner(db,"select b.id from platinum_internal.bajas_operaciones b join public.obras o on o.id=b.obra_id where o.empresa_codigo='PLATINUM' order by b.id")).rows.map(x=>x.id);
 eq(filas.map(x=>x.id),esp,'LEER pagina por llave sin saltos ni repetidos');
 await falla(db,'consulta','LEER',{empresa:'PLATINUM',fuente:'bajas_operaciones'},/requiere permiso VIP/,'LEER interno requiere VIP');
 await falla(db,'admin','LEER',{empresa:'PLATINUM',fuente:'trabajadores'},/no válida/,'LEER no expone tablas públicas');
 await falla(db,'jire','MARCAS',{empresa:'PLATINUM',fuentes:['pagos']},/razón social/,'otra razón social');
 await falla(db,null,'MARCAS',{empresa:'PLATINUM',fuentes:['pagos']},/Inicia sesión|permission/,'anónimo');
 await owner(db,"update public.app_usuarios set solo_contratos=true where user_id=$1",[ids.consulta]);
 await falla(db,'consulta','MARCAS',{empresa:'PLATINUM',fuentes:['pagos']},/Inicia sesión/,'rol de contratos excluido');
 const cfg=await rpc(db,'admin','MARCAS',{empresa:'PLATINUM',fuentes:['config']});eq(cfg.marcas.config.filas,1,'config sólo con claves autorizadas (sin credenciales)');
 // Volumen de producción: historial ≈40.4k filas (~2 KB de JSON c/u), auditoría 23k y documentos 13.5k.
 await owner(db,"set session_replication_role=replica");
 await owner(db,`insert into public.historial(id,trabajador_id,obra_id,usuario,accion,datos_antes,datos_despues,fecha)
  select 1000000+g,$1,$2,'captura',case when g%3=0 then 'MODIFICACION' else 'DOCUMENTO-MODIFICACION' end,
   jsonb_build_object('observaciones',repeat(md5(g::text),30),'n',g),jsonb_build_object('observaciones',repeat(md5((g+1)::text),30),'n',g),
   now()-g*interval '1 minute' from generate_series(1,40400) g`,[ids.w,ids.obra]);
 await owner(db,`insert into public.auditoria_calculos_nomina(id,lote_id,obra_id,empresa_codigo,trabajador_nombre,tipo_calculo,periodo,formula_version,entradas,resultado,actor_id,actor_email,huella_sha256,created_at)
  select gen_random_uuid(),gen_random_uuid(),$1,'PLATINUM','X','PROYECCION_NOMINA','S1','V',jsonb_build_object('a',repeat('e',90)),jsonb_build_object('r',g),$2,'a',md5(g::text),now() from generate_series(1,23000) g`,[ids.obra,ids.admin]);
 await owner(db,`insert into public.documentos(id,trabajador_id,obra_id,categoria,archivo,anulado,created_at,hash)
  select gen_random_uuid(),$1,$2,'RECIBO_NOMINA','r/'||g||'.pdf',false,now(),md5(g::text) from generate_series(1,13500) g`,[ids.w,ids.obra]);
 await owner(db,"set session_replication_role=origin");await owner(db,'analyze');
 const tiempo=async()=>{await actor(db,'admin');await db.exec("set statement_timeout='8s'");const t0=Date.now();
  try{return {r:(await db.query('select public.control_respaldo($1,$2::jsonb) r',['MARCAS',JSON.stringify({empresa:'PLATINUM',fuentes:CLAVES,columnas:true})])).rows[0].r,ms:Date.now()-t0};}
  finally{await db.exec("reset statement_timeout");await db.exec('reset role');}};
 await tiempo();const V1=await tiempo();
 ok(V1.ms<8000,'MARCAS completa con volumen real dentro de 8 s ('+V1.ms+' ms)');
 eq([V1.r.marcas.historial.tipo,V1.r.marcas.auditoria_calculos_nomina.tipo,V1.r.marcas.documentos.tipo,V1.r.marcas.pagos.tipo],['LIGERA','LIGERA','LIGERA','COMPLETA'],'marca ligera sólo en tablas > 5,000 filas');
 const hl=Number(V1.r.marcas.historial.filas);ok(hl>40400,'historial completo en la marca');
 // La marca ligera conserva la detección de cambios concurrentes: alta, baja y edición con fecha de modificación.
 const sig=x=>[x.filas,x.max_actualizado,x.max_creado,x.huella].join('|');
 const V2=await tiempo();eq(sig(V2.r.marcas.historial),sig(V1.r.marcas.historial),'marca ligera estable sin cambios');
 await owner(db,"set session_replication_role=replica");
 await owner(db,"insert into public.historial(id,trabajador_id,obra_id,accion,datos_despues,fecha) values(5000000,$1,$2,'ALTA','{}',now()-interval '30 days')",[ids.w,ids.obra]);
 const V3=await tiempo();ok(sig(V3.r.marcas.historial)!==sig(V2.r.marcas.historial),'detecta alta (aunque no sea la más reciente)');
 await owner(db,"delete from public.historial where id=1000005");await owner(db,"insert into public.historial(id,trabajador_id,obra_id,accion,datos_despues,fecha) values(4999999,$1,$2,'ALTA','{}',now()-interval '40 days')",[ids.w,ids.obra]);
 const V4=await tiempo();ok(V4.r.marcas.historial.filas===V3.r.marcas.historial.filas&&sig(V4.r.marcas.historial)!==sig(V3.r.marcas.historial),'detecta baja + alta con el mismo conteo');
 const d1=(await owner(db,"select id from public.documentos where obra_id=$1 order by id limit 1",[ids.obra])).rows[0].id;
 await owner(db,"update public.documentos set anulado=true,anulado_en=now()-interval '10 days' where id=$1",[d1]);
 const V5=await tiempo();ok(sig(V5.r.marcas.documentos)!==sig(V4.r.marcas.documentos),'detecta edición que actualiza la fecha de modificación (sin ser la máxima)');
 await owner(db,"set session_replication_role=origin");
 TIEMPOS.push(V1.ms,V2.ms,V5.ms);
 console.log(`MEDIDA MARCAS con volumen de producción (historial 40.4k, auditoría 23k, documentos 13.5k): ${TIEMPOS.join(' / ')} ms (límite 8 s).`);
 console.log(`PASS respaldo PostgreSQL: ${n} comprobaciones; marcas = RLS de producción para 5 perfiles, centros rechazados, huellas de cambio, LEER interno VIP por llave, sin anónimos, otra razón social ni rol de contratos.`);
 await db.close();
})().catch(e=>{console.error(e);process.exit(1);});
