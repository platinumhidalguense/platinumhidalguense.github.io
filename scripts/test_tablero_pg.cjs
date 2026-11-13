// Tablero ejecutivo en PostgreSQL local (pglite), datos ficticios: public.control_tablero
// cuadra al centavo con PLATINUM_TABLERO_MODELO (83-tablero-modelo.js) en todos los casos de
// scripts/fixtures/tablero/casos.json, respeta permisos en servidor y mide volumen.
// Requiere el paquete SQL privado (migración *_tablero_indicadores.sql y work/tablero_20261111).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations'),priv=path.join(root,'work/tablero_20261111');
const mig=fs.existsSync(dir)&&fs.readdirSync(dir).find(n=>n.endsWith('_tablero_indicadores.sql'));
const bases=[path.join(root,'work/aguinaldo_20261110/prod_base.sql'),path.join(priv,'prod_base.sql'),path.join(priv,'prod_base_a3.sql')];
if(!mig||!fs.existsSync(bases[0])||!fs.existsSync(bases[2])){console.log('ALCANCE PÚBLICO TABLERO: las pruebas PostgreSQL requieren el paquete privado; no se cuentan como ejecutadas.');process.exit(0);}
const {makeDatabase,ids,actor}=require('./soporte_flujo_pg.cjs');
const M=require('../frontend/modulos/83-tablero-modelo.js');
const datos=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/tablero/casos.json'),'utf8'));
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{assert.deepStrictEqual(a,b,m);n++;};
const plano=x=>JSON.parse(JSON.stringify(x===undefined?null:x));
const AUSENTE='__AUSENTE__';
function leer(obj,ruta){let cur=obj;for(const seg of ruta.match(/[^.{}\[\]]+|\{[^}]*\}|\[\d+\]/g)){if(cur===undefined||cur===null)return undefined;
 if(seg[0]==='{'){const [k,v]=seg.slice(1,-1).split('=');cur=cur.filter(x=>String(x[k])===v);}else if(seg[0]==='[')cur=cur[Number(seg.slice(1,-1))];
 else cur=Object.prototype.hasOwnProperty.call(cur,seg)||Array.isArray(cur)&&seg==='length'?cur[seg]:undefined;}return cur;}
const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v===undefined?null:v);
function diferencia(a,b,p='$'){ // primera ruta distinta, para diagnosticar
 if(canon(a)===canon(b))return null;
 if(a&&b&&typeof a==='object'&&typeof b==='object'){const ks=Array.isArray(a)&&Array.isArray(b)&&a.length!==b.length?['length',...a.keys()]:[...new Set([...Object.keys(a),...Object.keys(b)])];for(const k of ks){const d=diferencia(a[k],b[k],p+'.'+k);if(d)return d;}}
 return `${p}: SQL=${JSON.stringify(a)?.slice(0,300)} JS=${JSON.stringify(b)?.slice(0,300)}`;}
const TABLAS={obras:'obras',trabajadores:'trabajadores',cuadrillas:'cuadrillas',cierres:'control_cierres_nomina',versiones:'control_cierre_versiones',flujo:'control_flujo_cierres',
 obligaciones:'control_obligaciones_pago',evidencias:'control_evidencias_pago',aplicaciones:'control_pago_aplicaciones',pagos:'pagos',cheques:'cheques',historial:'historial',
 entregas:'reunion_cheques_entrega',finiquitos_transferencia:'control_finiquitos_transferencia',desglose_noi:'control_desglose_noi'};
(async()=>{
 const db=await makeDatabase();
 for(const f of bases)if(fs.existsSync(f))await db.exec(fs.readFileSync(f,'utf8'));
 const sqlMig=fs.readFileSync(path.join(dir,mig),'utf8');
 await db.exec(sqlMig);await db.exec(sqlMig);ok(true,'la migración es reaplicable');
 // Definiciones idénticas al modelo.
 ok((await db.query("select to_regclass('public.documentos_fiscales') r")).rows[0].r===null,'la vista fiscal existe sólo en platinum_internal (como en producción)');
 eq((await db.query('select platinum_internal.tablero_def() d')).rows[0].d,plano(M.DEFINICIONES),'definiciones y fórmulas idénticas al modelo');
 const cols={};
 for(const t of [...Object.values(TABLAS),'documentos'])cols[t]=(await db.query(`select column_name c,data_type t,is_nullable='NO' and column_default is null and is_generated='NEVER' and identity_generation is null req
  from information_schema.columns where table_schema='public' and table_name=$1`,[t])).rows;
 const relleno=(c,row,i)=>c.t==='uuid'?(row.id||`99999999-0000-4000-8000-${String(i).padStart(12,'0')}`):/int|numeric/.test(c.t)?0:c.t==='jsonb'?{}:c.t==='boolean'?false:/timestamp/.test(c.t)?'2026-01-01T00:00:00Z':c.t==='date'?'2026-01-01':c.t==='ARRAY'?[]:'Dato ficticio de prueba';
 async function insertar(t,filas){
  let i=0;for(const r0 of filas){i++;const r={};const cs=cols[t];
   for(const c of cs){if(Object.prototype.hasOwnProperty.call(r0,c.c)&&r0[c.c]!==undefined)r[c.c]=r0[c.c];else if(c.req)r[c.c]=c.c==='clave_idempotencia'?(r0.id||relleno(c,{},i)):relleno(c,r0,i);}
   const ks=Object.keys(r);
   await db.query(`insert into public.${t}(${ks.map(k=>'"'+k+'"').join(',')}) select ${ks.map(k=>'"'+k+'"').join(',')} from jsonb_populate_record(null::public.${t},$1::jsonb)`,[JSON.stringify(r)]);}
 }
 async function cargar(f){
  await db.exec('reset role');await db.exec('set session_replication_role=replica');
  await db.exec(`truncate ${[...Object.values(TABLAS),'documentos'].map(t=>'public.'+t).join(',')},platinum_internal.excepciones_noi_individuales,platinum_internal.lecturas_fiscales_documentos,public.control_reversiones_baja cascade`);
  for(const [k,t] of Object.entries(TABLAS))await insertar(t,f[k]||[]);
  const cf=f.cfdi||[],xml=d=>d.formato==='XML';
  await insertar('documentos',cf.map(d=>({id:d.documento_id,obra_id:d.obra_id,trabajador_id:d.trabajador_id,categoria:xml(d)?'CFDI_NOMINA':'RECIBO_NOMINA',archivo:'ficticio/'+d.documento_id,hash:'',
   cfdi_uuid:xml(d)?d.uuid:null,cfdi_total:xml(d)?d.neto:null,nomina_tipo:d.tipo,periodo_inicio:d.desde,periodo_fin:d.hasta,anulado:!!d.anulado})));
  // PDF: el UUID proviene de la lectura fiscal del servidor (vista documentos_fiscales), como en producción.
  for(const d of cf.filter(x=>!xml(x)))await db.query(`insert into platinum_internal.lecturas_fiscales_documentos(documento_id,obra_id,trabajador_id,archivo,hash,uuid,neto,desde,hasta,tipo,concepto_estado,datos,lote_id)
   values($1,$2,$3,$4,'',$5,$6,$7,$8,$9,'UNICO','{}',$1)`,[d.documento_id,d.obra_id,d.trabajador_id,'ficticio/'+d.documento_id,d.uuid,d.neto,d.desde,d.hasta,d.tipo]);
  await db.exec('set session_replication_role=origin');
 }
 async function fuentesDeBase(){ // el modelo lee exactamente las filas que quedaron en PostgreSQL
  const f={};for(const [k,t] of Object.entries(TABLAS))f[k]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(x) order by coalesce(to_jsonb(x)->>'id',to_jsonb(x)->>'cierre_id')),'[]') j from public.${t==='historial'?'historial_laboral_efectivo':t} x`)).rows[0].j;
  // Regla común (A1/A5): el modelo recibe el historial EFECTIVO (sin bajas revertidas), igual que el servidor.
  f.cfdi=(await db.query(`select coalesce(jsonb_agg(jsonb_build_object('documento_id',d.id,'obra_id',d.obra_id,'trabajador_id',d.trabajador_id,'uuid',d.cfdi_uuid,
   'neto',case when d.categoria='CFDI_NOMINA' then d.cfdi_total else coalesce(d.nomina_neto,d.cfdi_total) end,'desde',d.periodo_inicio,'hasta',d.periodo_fin,'tipo',d.nomina_tipo,
   'formato',case when d.categoria='CFDI_NOMINA' then 'XML' else 'PDF' end,'anulado',coalesce(d.anulado,false)) order by d.id),'[]') j
   from platinum_internal.documentos_fiscales d where d.categoria in('CFDI_NOMINA','RECIBO_NOMINA') and nullif(btrim(d.cfdi_uuid),'') is not null`)).rows[0].j;
  f.efectivo_autorizado=(await db.query(`select coalesce(jsonb_agg(jsonb_build_object('obligacion_id',o.id,'importe',(e->>'finiquito_efectivo')::numeric,
   'fecha',((e->>'registrado_en')::timestamptz at time zone 'America/Mexico_City')::date)),'[]') j from public.control_obligaciones_pago o
   cross join lateral(select platinum_internal.excepcion_noi(o.cierre_id,o.trabajador_id) e) x where o.tipo='FINIQUITO' and e is not null and o.importe=(e->>'finiquito_efectivo')::numeric`)).rows[0].j;
  f.errores=[];return f;
 }
 const usuarios=new Map();
 async function usuario(p){
  const k=JSON.stringify(p||{vip:true});if(usuarios.has(k))return usuarios.get(k);
  const id=`10000000-0000-4000-8000-${String(100+usuarios.size).padStart(12,'0')}`;usuarios.set(k,id);
  await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[id]);
  const q=p||{vip:true};
  await db.query(`insert into public.app_usuarios(user_id,email,rol,activo,full_access,puede_escribir,puede_eliminar,empresas_permitidas,obras_permitidas) values($1,$2,$3,true,$4,false,false,$5,$6)`,
   [id,'u'+usuarios.size+'@prueba.test',q.vip?'ADMIN':'CONSULTA',!!q.vip,q.empresas||['PLATINUM','JIRE'],q.obras||[]]);
  return id;
 }
 async function rpcInterna(uid,acc,datos,ahora){
  await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,role:'authenticated'})]);
  return (await db.query('select platinum_internal.tablero_rpc($1,$2::jsonb,$3::timestamptz) r',[acc,JSON.stringify(datos),ahora])).rows[0].r;
 }
 const FN={RESUMEN:'calcular',TENDENCIA:'tendencia',COMPARATIVOS:'comparativos',EXCEPCIONES:'excepciones',DETALLE:'detalle',PLANTILLA:'plantilla',CATALOGOS:'catalogos'};
 let consultas=0,esperadas=0;
 for(const caso of datos.casos){
  await cargar(caso.fuentes);const base=await fuentesDeBase();
  for(const [i,c] of caso.comprobaciones.entries()){
   const permisos=c.permisos||caso.fuentes.permisos||{vip:true},uid=await usuario(permisos),et=`${caso.id}#${i} ${c.accion}`;
   const sql=await rpcInterna(uid,c.accion,{filtros:c.filtros||{},opciones:c.opciones||{}},caso.fuentes.ahora);
   const js=plano(M[FN[c.accion]]({...base,ahora:sql.actualizado_en||caso.fuentes.ahora,permisos},c.filtros||{},c.opciones||{}));
   const d=diferencia(sql,js);assert.equal(d,null,`${et}: SQL ≠ modelo → ${d}`);n++;consultas++;
   for(const [ruta,esp] of Object.entries(c.esperado||{})){
    const v=leer(sql,ruta);if(ruta==='actualizado_en')continue;
    if(esp===AUSENTE)eq(v,undefined,`${et} ${ruta} no debe existir`);else eq(plano(v),esp,`${et} ${ruta} (esperado de A1)`);esperadas++;
   }
  }
 }
 // ---------- Baja revertida (control_reversiones_baja + historial_laboral_efectivo) ----------
 {const O='a3000000-0000-4000-8000-000000000001',W='b3000000-0000-4000-8000-000000000001',ahora='2026-11-11T18:00:00Z',u=await usuario({vip:true});
  const f={obras:[{id:O,nombre:'CENTRO REVERSION',empresa_codigo:'PLATINUM',fecha_inicio:'2026-03-30'}],
   trabajadores:[{id:W,obra_id:O,no_trab:1,nombres:'PERSONA',primer_apellido:'FICTICIA',estatus:'ACTIVO',eliminado:false,periodo_pago:'SEMANAL',contratista:'ALFA',fecha_alta:'2026-04-06'}],
   historial:[{id:9001,trabajador_id:W,obra_id:O,accion:'ALTA',fecha:'2026-04-06T15:00:00Z',datos_despues:{estatus:'ACTIVO',fecha_alta:'2026-04-06',contratista:'ALFA',id_cuadrilla:null}},
    {id:9002,trabajador_id:W,obra_id:O,accion:'BAJA',fecha:'2026-10-10T15:00:00Z',datos_antes:{estatus:'ACTIVO'},datos_despues:{estatus:'BAJA',fecha_baja:'2026-10-09',contratista:'BETA'}},
    {id:9003,trabajador_id:W,obra_id:O,accion:'MODIFICACION',fecha:'2026-10-12T15:00:00Z',datos_antes:{estatus:'BAJA',fecha_baja:'2026-10-09'},datos_despues:{estatus:'BAJA',fecha_baja:'2026-10-11',contratista:'BETA'}}]};
  await cargar(f);const filt={desde:'2026-10-01',hasta:'2026-10-31'};
  const cruce=async(acc,m)=>{const r=await rpcInterna(u,acc,filt,ahora);const b=await fuentesDeBase();eq(diferencia(r,plano(M[FN[acc]]({...b,ahora:r.actualizado_en||ahora,permisos:{vip:true}},filt))),null,m);return r;};
  eq((await cruce('PLANTILLA','baja vigente: SQL = modelo')).medidas.bajas.valor,1,'antes de revertir cuenta la baja (corregida al 2026-10-11)');
  await db.query(`insert into public.control_reversiones_baja(historial_id,obra_id,trabajador_id,estado,created_at,restaurar) values(9002,$1,$2,'APLICADA','2026-10-15T00:00:00Z','{"estatus":"ACTIVO","fecha_baja":null,"contratista":"ALFA"}')`,[O,W]);
  const r=await cruce('PLANTILLA','baja revertida: SQL = modelo con historial efectivo');
  eq([r.medidas.bajas.valor,r.eventos.filas.filter(e=>e.tipo==='BAJA').length],[0,0],'la baja revertida no cuenta en bajas ni en eventos');
  const rr=await cruce('RESUMEN','baja revertida: RESUMEN = modelo');eq([rr.medidas.bajas.valor,rr.medidas.rotacion.desglose.bajas],[0,0],'rotación sin la baja revertida');
  const crudo=(await db.query(`select jsonb_agg(to_jsonb(h) order by h.id) j from public.historial h`)).rows[0].j,b=await fuentesDeBase();
  eq(M.plantilla({...b,historial:crudo,ahora,permisos:{vip:true}},filt).medidas.bajas.valor,1,'con historial crudo el modelo contaría la baja: el cliente debe pasar el historial efectivo');
 }
 // ---------- Permisos en servidor (RPC público, rol authenticated) ----------
 const caso=datos.casos.find(x=>x.id==='usuario_restringido');await cargar(caso.fuentes);
 const vip=await usuario({vip:true}),restr=await usuario({vip:false,obras:['a0000000-0000-4000-8000-000000000001'],empresas:['PLATINUM','JIRE']}),jire=await usuario({vip:false,empresas:['JIRE']});
 const publico=async(uid,acc,d)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,role:uid?'authenticated':'anon'})]);
  await db.exec('set role '+(uid?'authenticated':'anon'));try{return (await db.query('select public.control_tablero($1,$2::jsonb) r',[acc,JSON.stringify(d)])).rows[0].r;}finally{await db.exec('reset role');}};
 const falla=async(uid,acc,d,re,m)=>{let e=null;try{await publico(uid,acc,d);}catch(x){e=x;}ok(e&&re.test(e.message),m+' → '+(e?e.message:'sin error'));};
 const filtros={desde:'2026-11-01',hasta:'2026-11-08',obras:['a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002']};
 const rv=await publico(vip,'RESUMEN',filtros),rr=await publico(restr,'RESUMEN',filtros);
 eq(rv.alcance.obras.length,2,'VIP ve ambos centros');eq([rr.alcance.obras,rr.alcance.restringido.obras_no_autorizadas,rr.alcance.restringido.prevision_social],[['a0000000-0000-4000-8000-000000000001'],1,true],'restringido: un centro, otro excluido y previsión oculta');
 ok(!JSON.stringify(rr.medidas).includes('PREVISION_SOCIAL'),'sin previsión social para usuario no VIP');
 const detR=await publico(restr,'DETALLE',{filtros:{...filtros,perspectiva:'PAGO'},opciones:{grano:'OPERACION'}});
 ok(detR.filas.every(f=>f.importe_operacion===null&&f.obra_id==='a0000000-0000-4000-8000-000000000001'),'detalle restringido sin importe interno ni centros ajenos');
 ok(detR.filas.every(f=>['operacion_id','trabajador_id','evidencia_id','pago_ids','cheque_id','obligaciones'].every(k=>k in f)),'detalle con llaves para abrir trabajador, obligación, pago, cheque y evidencia');
 const detO=await publico(vip,'DETALLE',{filtros,opciones:{grano:'OBLIGACION',por_pagina:9999}});
 ok(detO.por_pagina===500&&detO.filas.every(f=>f.obligacion_id&&f.cierre_id&&f.trabajador_id),'detalle por obligación con llaves y por_pagina ≤ 500');
 eq((await publico(jire,'RESUMEN',{desde:'2026-11-01',hasta:'2026-11-08'})).alcance.obras.every(id=>id!=='a0000000-0000-4000-8000-000000000001'),true,'otra razón social: sin centros PLATINUM');
 await falla(jire,'RESUMEN',{empresa:'PLATINUM',desde:'2026-11-01',hasta:'2026-11-08'},/alcance/,'razón social no permitida');
 await falla(null,'RESUMEN',filtros,/permission|denied|acceso/i,'anónimo sin acceso');
 await db.exec('reset role');await db.query('update public.app_usuarios set activo=false where user_id=$1',[jire]);
 await falla(jire,'RESUMEN',filtros,/acceso/,'usuario inactivo sin acceso');
 await falla(vip,'BORRAR',filtros,/no reconocida/,'acción desconocida');
 await falla(vip,'RESUMEN',{desde:'2026-11-09',hasta:'2026-11-01'},/Rango/,'rango invertido');
 ok(typeof rv.huella==='string'&&rv.huella.startsWith('v1|')&&/^\d{4}-\d\d-\d\dT/.test(rv.actualizado_en),'huella y actualizado_en');
 await actor(db,'consulta');let e=null;try{await db.query("select platinum_internal.tablero_rpc('RESUMEN','{}',now())");}catch(x){e=x;}await db.exec('reset role');
 ok(e&&/permission|denied/i.test(e.message),'la función interna no es invocable por el cliente');


 // ---------- Volumen real de producción (work/equipo_20261111/volumen_produccion.md) ----------
 // ≈40k filas de historial con la mezcla de acciones y tamaños JSON reales, 980 trabajadores, 2,343 obligaciones,
 // ≈4.3k pagos, ≈1k cheques; cada acción, centro-mes y todos-año, en ambas perspectivas, como authenticated con 8 s.
 await db.exec('reset role');await db.exec('set session_replication_role=replica');
 await db.exec(`truncate ${[...Object.values(TABLAS),'documentos'].map(t=>'public.'+t).join(',')} cascade`);
 await db.exec(`
 insert into public.obras(id,nombre,empresa_codigo,fecha_inicio) values('a2000000-0000-4000-8000-000000000001','REAL UNO','PLATINUM','2026-03-30'),
  ('a2000000-0000-4000-8000-000000000002','REAL DOS','PLATINUM','2026-06-15'),('a2000000-0000-4000-8000-000000000003','REAL TRES','JIRE','2026-07-27');
 insert into public.trabajadores(id,obra_id,no_trab,nombres,primer_apellido,estatus,periodo_pago,contratista,fecha_alta,fecha_baja)
  select ('b2000000-0000-4000-8000-'||lpad(t::text,12,'0'))::uuid,('a2000000-0000-4000-8000-00000000000'||case when t<=800 then 1 when t<=900 then 2 else 3 end)::uuid,t,'PERSONA '||t,'FICTICIA',
   case when t%9=0 then 'BAJA' else 'ACTIVO' end,case when t%25=0 then 'QUINCENAL' else 'SEMANAL' end,'C'||(t%9),'2026-04-06',case when t%9=0 then date '2026-09-01'+(t%40) end from generate_series(1,980) t;
 insert into public.control_cierres_nomina(id,obra_id,semana,periodo,estado,formula_version,snapshot,snapshot_sha256,creado_por)
  select ('c2000000-0000-4000-8000-'||lpad(s::text,12,'0'))::uuid,'a2000000-0000-4000-8000-000000000001'::uuid,s,'SEMANAL',case when s=30 then 'BORRADOR' else 'TIMBRADO' end,'V',
   jsonb_build_object('semana',s,'modelo',jsonb_build_object('filas',(select jsonb_agg(jsonb_build_object('w',jsonb_build_object('id',w.id,'contratista',w.contratista,'periodo_pago',w.periodo_pago,
    'obra_id',w.obra_id,'relleno',repeat('x',400)),'neto',1000,'items',jsonb_build_array(repeat('y',300))) order by w.no_trab) from public.trabajadores w where w.no_trab<=115))),'x','10000000-0000-4000-8000-000000000001'::uuid
  from generate_series(11,30) s
  union all select 'c2000000-0000-4000-8000-000000000999'::uuid,'a2000000-0000-4000-8000-000000000002'::uuid,20,'SEMANAL','AUTORIZADO','V','{}'::jsonb,'x','10000000-0000-4000-8000-000000000001';
 insert into public.control_cierre_versiones(id,cierre_origen,obra_id,version,estado_origen,snapshot,snapshot_sha256,fuente_sha256,actor_id) select id,id,obra_id,1,'AUTORIZADO',snapshot,'x','x','10000000-0000-4000-8000-000000000001' from public.control_cierres_nomina;
 insert into public.control_flujo_cierres(cierre_id,obra_id,sucio,version_id) select id,obra_id,semana=30,id from public.control_cierres_nomina;
 insert into public.control_obligaciones_pago(id,cierre_origen,cierre_id,version_id,obra_id,trabajador_id,semana,tipo,numero,nombre,contratista,importe,metodo)
  select gen_random_uuid(),c.id,c.id,c.id,w.obra_id,w.id,c.semana,'NOMINA',w.no_trab,w.nombres,w.contratista,1500+(w.no_trab%97)+c.semana/100.0,case when w.no_trab%10=0 then 'CHEQUE' else 'TRANSFERENCIA' end
  from public.control_cierres_nomina c join public.trabajadores w on(c.obra_id='a2000000-0000-4000-8000-000000000001' and w.no_trab<=115) or(c.semana=20 and c.obra_id='a2000000-0000-4000-8000-000000000002' and w.no_trab between 801 and 843);
 insert into public.pagos(id,obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote,origen)
  select gen_random_uuid(),o.obra_id,o.trabajador_id,'S'||o.semana,'TRANSFERENCIA','BBVA',o.importe-case when o.numero%13=0 then 50 else 0 end,'EXITOSO',b.fecha_inicio+(o.semana-1)*7+4,'L'||o.numero||'-'||o.semana,r.origen
  from public.control_obligaciones_pago o join public.obras b on b.id=o.obra_id cross join(values('GLOBAL'),('INDIVIDUAL')) r(origen) where o.metodo='TRANSFERENCIA' and(r.origen='GLOBAL' or o.numero%7=0);
 insert into public.pagos(id,obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote,origen)
  select gen_random_uuid(),w.obra_id,w.id,'S'||s,'TRANSFERENCIA','BBVA',1400,case when w.no_trab%50=0 then 'RECHAZADO' else 'EXITOSO' end,date '2026-03-30'+(s-1)*7+4,'X'||w.no_trab||'-'||s,'GLOBAL'
  from public.trabajadores w cross join generate_series(16,19) s where w.no_trab between 116 and 650;
 insert into public.control_evidencias_pago(id,obra_id,trabajador_id,semana,clave,importe,pago_id)
  select gen_random_uuid(),p.obra_id,p.trabajador_id,public.norm_semana(p.semana),'B'||p.folio_lote,p.importe,p.id from public.pagos p where p.origen='GLOBAL' and p.folio_lote like 'L%';
 insert into public.control_pago_aplicaciones(obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo)
  select e.obra_id,o.id,e.id,o.version_id,least(e.importe,o.importe),'10000000-0000-4000-8000-000000000001',gen_random_uuid(),'Aplicación ficticia de volumen'
  from public.control_evidencias_pago e join public.control_obligaciones_pago o on o.trabajador_id=e.trabajador_id and o.semana=e.semana where (o.numero+o.semana)%6<>0;
 insert into public.cheques(id,obra_id,trabajador_id,no_trab,nombre,semana,importe,tipo_pago,num_cheque,consecutivo,estatus,eliminado,created_at)
  select ('c3000000-0000-4000-8000-'||lpad(k::text,12,'0'))::uuid,w.obra_id,w.id,w.no_trab,w.nombres,'S'||(11+k%20),1500,case when k%3=0 then 'FINIQUITO' else 'CHEQUE' end,
   case when k%5=4 then '' else 'N'||k end,case when k%5=4 then '' else 'K'||k end,(array['ENTREGADO','EXPEDIDO','CANCELADO','ENTREGADO','PENDIENTE'])[1+k%5],k%5=4,'2026-06-01T15:00:00Z'::timestamptz+(k%120)*interval '1 day'
  from generate_series(1,980) k join public.trabajadores w on w.no_trab=k;
 insert into public.historial(trabajador_id,obra_id,accion,fecha,datos_antes,datos_despues)
  select w.id,w.obra_id,a.accion,'2026-07-08T15:00:00Z'::timestamptz+((g*37)%120000)*interval '1 minute',
   case when a.antes then jsonb_build_object('id',w.id,'estatus','ACTIVO','contratista',w.contratista,'fecha_baja',null,'relleno',repeat('a',a.tam/2)) end,
   jsonb_build_object('id',w.id,'estatus',case when a.accion='BAJA' then 'BAJA' else 'ACTIVO' end,'contratista',case when a.adscripcion then w.contratista end,
    'fecha_baja',case when a.accion='BAJA' then '2026-09-15' end,'fecha_reingreso',case when a.accion='REACTIVACION' then '2026-10-01' end,'relleno',repeat('d',a.tam/2))
    ||case when a.adscripcion then jsonb_build_object('id_cuadrilla',null) else '{}' end
  from(values('DOCUMENTO-MODIFICACION',16703,1756,true,false),('DOCUMENTO-ALTA',13568,600,false,false),('MODIFICACION',7014,2973,true,true),('DESCUENTO-MODIFICACION',796,1339,true,false),
   ('SDI_PRECISION_NOI',657,800,true,false),('BAJA',538,3045,true,true),('DESCUENTO-ALTA',390,700,false,false),('REACTIVACION',110,3121,true,true),('ALTA',987,1500,false,true)) a(accion,n,tam,antes,adscripcion)
  cross join lateral generate_series(1,a.n) g join public.trabajadores w on w.no_trab=1+(g*13)%980;
 insert into public.historial(trabajador_id,obra_id,accion,fecha,datos_antes,datos_despues)
  select q.trabajador_id,q.obra_id,a.accion,q.created_at+g*interval '1 hour',case when a.accion='CHEQUE-MODIFICACION' then jsonb_build_object('id',q.id,'estatus',case when g=1 then 'PENDIENTE' else 'EXPEDIDO' end,'relleno',repeat('c',700)) end,
   jsonb_build_object('id',q.id,'estatus',case when g=1 and a.accion='CHEQUE-MODIFICACION' then 'EXPEDIDO' when a.accion='CHEQUE-ALTA' then 'PENDIENTE' else q.estatus end,'relleno',repeat('c',800))
  from public.cheques q cross join(values('CHEQUE-ALTA',1),('CHEQUE-MODIFICACION',2)) a(accion,veces) cross join lateral generate_series(1,a.veces) g;`);
 await db.exec(`insert into public.control_reversiones_baja(historial_id,obra_id,trabajador_id,estado,created_at,restaurar)
  select h.id,h.obra_id,h.trabajador_id,'APLICADA',h.fecha+interval '3 day','{"estatus":"ACTIVO","fecha_baja":null}' from public.historial h where h.accion='BAJA' order by h.id limit 2`);
 await db.exec('set session_replication_role=origin');await db.exec('analyze');
 const rv0=(await db.query(`select (select count(*) from public.historial) h,(select count(*) from public.trabajadores) w,(select count(*) from public.control_obligaciones_pago) o,
  (select count(*) from public.pagos) p,(select count(*) from public.cheques) q,(select count(*) from public.control_pago_aplicaciones) a`)).rows[0];
 ok(Number(rv0.h)>=40000&&Number(rv0.o)>=2300&&Number(rv0.p)>=4000&&Number(rv0.q)>=900,`volumen real ${JSON.stringify(rv0)}`);
 const reales={},mes={obras:['a2000000-0000-4000-8000-000000000001'],desde:'2026-07-01',hasta:'2026-07-31',comparar:'ANTERIOR'},anio={desde:'2026-01-01',hasta:'2026-12-31',comparar:'ANTERIOR'};
 const conLimite=async(acc,d)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:vip,role:'authenticated'})]);
  await db.exec('set role authenticated');await db.exec("set statement_timeout='8s'");
  try{const t0=Date.now();const r=(await db.query('select public.control_tablero($1,$2::jsonb) r',[acc,JSON.stringify(d)])).rows[0].r;return [r,Date.now()-t0];}
  finally{await db.exec("reset statement_timeout");await db.exec('reset role');}};
 for(const [nombre,f] of [['centro_mes',mes],['todos_anio',anio]])for(const persp of ['PERIODO','PAGO'])for(const acc of ['CATALOGOS','RESUMEN','TENDENCIA','COMPARATIVOS','EXCEPCIONES','DETALLE']){
  const d={filtros:{...f,perspectiva:persp},opciones:acc==='DETALLE'?{grano:persp==='PAGO'?'OPERACION':'OBLIGACION',pagina:2,por_pagina:100}:{por_pagina:100}};
  const [r,ms]=await conLimite(acc,d);reales[`${nombre}.${persp}.${acc}`]=ms;
  ok(r&&r.accion===acc&&ms<8000,`volumen real ${nombre} ${persp} ${acc} en ${ms} ms (< 8 s)`);
 }
 {const base=await fuentesDeBase();
  for(const f of [mes,anio,{...anio,perspectiva:'PAGO'}]){const r=await rpcInterna(vip,'RESUMEN',f,'2026-11-11T18:00:00Z');
   eq(diferencia(r,plano(M.calcular({...base,ahora:r.actualizado_en,permisos:{vip:true}},f))),null,'volumen real: RESUMEN = modelo al centavo '+JSON.stringify(f).slice(0,60));}}
 console.log(`volumen real PGlite (ms, authenticated, statement_timeout 8 s) con ${JSON.stringify(rv0)}: ${JSON.stringify(reales)}`);
 // ---------- Volumen representativo ----------
 await db.exec('reset role');await db.exec('set session_replication_role=replica');
 await db.exec(`truncate ${[...Object.values(TABLAS),'documentos'].map(t=>'public.'+t).join(',')} cascade`);
 await db.exec(`
 insert into public.obras(id,nombre,empresa_codigo,fecha_inicio) select ('a1000000-0000-4000-8000-'||lpad(o::text,12,'0'))::uuid,'CENTRO VOLUMEN '||o,case when o<=3 then 'PLATINUM' else 'JIRE' end,date '2026-03-30'+(o-1)*7 from generate_series(1,4) o;
 insert into public.trabajadores(id,obra_id,no_trab,nombres,estatus,periodo_pago,contratista,fecha_alta)
  select ('b1000000-0000-4000-8000-'||lpad(t::text,12,'0'))::uuid,('a1000000-0000-4000-8000-'||lpad((1+t%4)::text,12,'0'))::uuid,t,'PERSONA '||t,'ACTIVO',case when t%10=0 then 'QUINCENAL' else 'SEMANAL' end,'C'||(t%9),'2026-04-01' from generate_series(1,1250) t;
 insert into public.historial(trabajador_id,obra_id,accion,fecha,datos_despues) select id,obra_id,'ALTA','2026-04-01T15:00:00Z',jsonb_build_object('contratista',contratista,'id_cuadrilla',null) from public.trabajadores;
 insert into public.control_cierres_nomina(id,obra_id,semana,periodo,estado,formula_version,snapshot,snapshot_sha256,creado_por)
  select ('c1000000-0000-4000-8000-'||lpad((o*100+s)::text,12,'0'))::uuid,('a1000000-0000-4000-8000-'||lpad(o::text,12,'0'))::uuid,s,'TODOS','AUTORIZADO','V','{}','x','10000000-0000-4000-8000-000000000001' from generate_series(1,4) o,generate_series(1,20) s;
 insert into public.control_cierre_versiones(id,cierre_origen,obra_id,version,estado_origen,snapshot,snapshot_sha256,fuente_sha256,actor_id) select id,id,obra_id,1,'AUTORIZADO','{}','x','x','10000000-0000-4000-8000-000000000001' from public.control_cierres_nomina;
 insert into public.control_flujo_cierres(cierre_id,obra_id,sucio,version_id) select id,obra_id,false,id from public.control_cierres_nomina;
 insert into public.control_obligaciones_pago(id,cierre_origen,cierre_id,version_id,obra_id,trabajador_id,semana,tipo,numero,nombre,contratista,importe,metodo)
  select ('d1000000-0000-4000-8000-'||lpad((t*100+s)::text,12,'0'))::uuid,c.id,c.id,c.id,w.obra_id,w.id,s,'NOMINA',w.no_trab,w.nombres,w.contratista,1000+(t%97)+s/100.0,'TRANSFERENCIA'
  from public.trabajadores w cross join generate_series(1,20) s join public.control_cierres_nomina c on c.obra_id=w.obra_id and c.semana=s cross join lateral(select w.no_trab t) x;
 insert into public.pagos(id,obra_id,trabajador_id,semana,medio,banco,importe,estado,fecha_pago,folio_lote,origen)
  select ('e1000000-0000-4000-8000-'||lpad((x.t*100+o.semana)::text,12,'0'))::uuid,o.obra_id,o.trabajador_id,'S'||o.semana,'TRANSFERENCIA','BBVA',case when x.t%11=0 then o.importe-100 else o.importe end,
   'EXITOSO',date '2026-03-30'+(o.semana-1)*7+4,'L'||(x.t*100+o.semana),'GLOBAL' from public.control_obligaciones_pago o cross join lateral(select o.numero t) x where (x.t*100+o.semana)%10<>0;
 insert into public.control_evidencias_pago(id,obra_id,trabajador_id,semana,clave,importe,pago_id)
  select gen_random_uuid(),p.obra_id,p.trabajador_id,public.norm_semana(p.semana),'B'||p.id,p.importe,p.id from public.pagos p;
 insert into public.control_pago_aplicaciones(obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo)
  select e.obra_id,o.id,e.id,o.version_id,least(e.importe,o.importe),'10000000-0000-4000-8000-000000000001',gen_random_uuid(),'Aplicación ficticia de volumen'
  from public.control_evidencias_pago e join public.control_obligaciones_pago o on o.trabajador_id=e.trabajador_id and o.semana=e.semana where (o.numero+o.semana)%5<>0;
 insert into public.control_pago_aplicaciones(obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo,retirado_en,retirado_por,motivo_retiro)
  select obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,gen_random_uuid(),motivo,now(),actor_id,'Retiro ficticio de volumen' from public.control_pago_aplicaciones limit 12000;`);
 await db.exec('set session_replication_role=origin');await db.exec('analyze'); // estadísticas como en producción
 const vol=(await db.query(`select (select count(*) from public.control_obligaciones_pago) o,(select count(*) from public.control_evidencias_pago) e,(select count(*) from public.control_pago_aplicaciones) a,(select count(*) from public.pagos) p`)).rows[0];
 ok(Number(vol.o)>=20000&&Number(vol.e)>=20000&&Number(vol.a)>=28000,`volumen ${JSON.stringify(vol)}`);
 const vf={desde:'2026-04-01',hasta:'2026-08-31',comparar:'ANTERIOR'},grande={};
 {const t0=Date.now();await rpcInterna(vip,'RESUMEN',vf,'2026-11-11T18:00:00Z');grande.RESUMEN=Date.now()-t0;}
 {const base=await fuentesDeBase();const sqr=await rpcInterna(vip,'RESUMEN',vf,'2026-11-11T18:00:00Z');
  eq(diferencia(sqr,plano(M.calcular({...base,ahora:sqr.actualizado_en,permisos:{vip:true}},vf))),null,'volumen grande: RESUMEN SQL = modelo al centavo');}
 // Umbral del escenario grande (≈10× producción, PGlite WASM de un hilo): 60 s.
 ok(grande.RESUMEN<60000,'RESUMEN grande en tiempo acotado');
 console.log(`escenario grande PGlite (ms) con ${vol.o} obligaciones, ${vol.e} evidencias, ${vol.a} aplicaciones: ${JSON.stringify(grande)}`);
 console.log(`PASS tablero PostgreSQL: ${n} comprobaciones; ${consultas} consultas de ${datos.casos.length} casos de A1 idénticas al modelo al centavo (${esperadas} valores esperados), permisos en servidor, paginación ≤ 500 y volumen real medido con límite de 8 s.`);
 await db.close();
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
