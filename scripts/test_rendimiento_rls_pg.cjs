// Migración privada de rendimiento: PostgreSQL local, sin conexión ni datos reales.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {makeDatabase,ids,actor,owner}=require('./soporte_flujo_pg.cjs');
const classic=['trabajadores','cheques','descuentos','documentos','vacaciones','actas','nom035','pagos','prima_pagos','cuadrillas'];
const simple=['diferenciales','bloques_cheques','control_finiquitos_transferencia'];
const correlated=['control_cierres_nomina','control_conciliacion_noi','control_altas_bajas_cortas'];
const tables=[...classic,...simple,...correlated];
(async()=>{
 const db=await makeDatabase();let checks=0;
 try{
  // Completar sólo las tablas auxiliares que este fixture financiero no contiene.
  for(const table of tables)await owner(db,`create table if not exists public.${table}(id uuid primary key,obra_id uuid)`);
  for(const table of tables){
   const policies=(await owner(db,'select policyname from pg_policies where schemaname=$1 and tablename=$2',['public',table])).rows;
   for(const p of policies)await owner(db,`drop policy "${p.policyname}" on public.${table}`);
   const expr=classic.includes(table)?'(public.app_es_vip() OR (public.app_registrado() AND public.app_ve_obra(obra_id)))':simple.includes(table)?'public.app_ve_obra(obra_id)':`(select public.app_ve_obra(${table}.obra_id))`;
   await db.exec(`alter table public.${table} enable row level security;grant select,insert,update,delete on public.${table} to authenticated;
    create policy read_perf on public.${table} for select to authenticated using(${expr});
    create policy write_perf on public.${table} for update to authenticated using(public.app_ve_obra(obra_id) and public.app_puede_escribir()) with check(public.app_ve_obra(obra_id) and public.app_puede_escribir());`);
  }
  await db.exec(`alter table public.obras enable row level security;create policy obras_perf on public.obras for select to authenticated using(public.app_ve_obra(id));`);
  const constraints=async()=>JSON.stringify((await owner(db,"select conrelid::regclass::text t,conname,pg_get_constraintdef(oid) d from pg_constraint where connamespace='public'::regnamespace order by 1,2")).rows);
  const protectedDefs=async()=>JSON.stringify((await owner(db,"select proname,pg_get_functiondef(oid) d from pg_proc where pronamespace='public'::regnamespace and proname in('app_ve_obra','app_es_vip','app_registrado','control_validar_neto_cheque_noi') order by 1")).rows);
  const writes=async()=>JSON.stringify((await owner(db,"select tablename,policyname,cmd,qual,with_check from pg_policies where schemaname='public' and cmd<>'SELECT' order by 1,2")).rows);
  const beforeConstraints=await constraints(),beforeDefs=await protectedDefs(),beforeWrites=await writes();
  // Incluye dos empresas, usuario sin alcance y restricción a un solo centro.
  await owner(db,"update public.app_usuarios set obras_permitidas=$1 where user_id=$2",[[ids.obra],ids.consulta]);
  const capture=async()=>{const results={};for(const key of ['admin','conta','consulta','jire','none']){
   if(key==='none')await owner(db,"update public.app_usuarios set empresas_permitidas='{}',obras_permitidas='{}' where user_id=$1",[ids.consulta]);
   await actor(db,key==='none'?'consulta':key);results[key]={};
   for(const table of tables)results[key][table]=(await db.query(`select to_jsonb(t) row from public.${table} t order by to_jsonb(t)::text`)).rows;
   if(key==='none')await owner(db,"update public.app_usuarios set empresas_permitidas=array['PLATINUM','JIRE'],obras_permitidas=$1 where user_id=$2",[[ids.obra],ids.consulta]);
  }return results;};
  const before=await capture();await owner(db,'select 1');
  const path='supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_rendimiento_lectura_centros.sql'));
  await db.exec(fs.readFileSync(path,'utf8'));checks++;
  const after=await capture();for(const key of Object.keys(before)){assert.deepEqual(after[key],before[key],key+' conserva cada fila visible');checks++;}
  assert.equal(after.consulta.trabajadores.length,2);assert.equal(after.jire.trabajadores.length,1);assert.equal(after.none.trabajadores.length,0);checks+=3;
  assert.equal(await constraints(),beforeConstraints);assert.equal(await protectedDefs(),beforeDefs);assert.equal(await writes(),beforeWrites);checks+=3;
  assert.equal((await owner(db,"select count(*) n from pg_indexes where indexname in('idx_documentos_obra_id_vigentes','idx_documentos_acuse_trabajador_id','idx_trabajadores_obra_id_vigentes','idx_pagos_obra_id_lectura')")).rows[0].n,4);checks++;
  for(const table of tables){const p=(await owner(db,"select qual from pg_policies where schemaname='public' and tablename=$1 and policyname='read_perf'",[table])).rows[0];assert(p.qual.includes('ARRAY('));checks++;}
  await actor(db,'consulta');const plan=(await db.query('explain (format json) select id from public.trabajadores order by id')).rows;assert(JSON.stringify(plan).includes('InitPlan'));checks++;
  console.log('PASS '+checks+' comprobaciones PostgreSQL de rendimiento: mismas filas por cinco alcances, RLS por centro, 4 índices y constraints/escrituras/funciones protegidas intactas.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
