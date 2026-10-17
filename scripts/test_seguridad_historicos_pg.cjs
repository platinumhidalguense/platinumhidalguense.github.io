// PostgreSQL aislado: mismos helpers de permisos, esquema y migración; datos ficticios.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {makeDatabase,ids,actor,owner,snapshot,rpc}=require('./soporte_flujo_pg.cjs');
(async()=>{
 const db=await makeDatabase();let n=0;
 try{
  await db.exec(`create table public.ia_config(id uuid primary key,valor text);
   create table public.ia_embeddings(id uuid primary key,obra_id uuid,contenido text);
   alter table public.app_usuarios enable row level security;
   create policy p_appusr_sel on public.app_usuarios for select to authenticated using(user_id=auth.uid() or public.app_es_vip());
   create policy p_appusr_ins on public.app_usuarios for insert to authenticated with check(public.app_es_vip());
   create policy p_appusr_upd on public.app_usuarios for update to authenticated using(public.app_es_vip()) with check(public.app_es_vip());
   create policy p_appusr_del on public.app_usuarios for delete to authenticated using(public.app_es_vip());
   alter table public.control_permisos_cheques enable row level security;
   create policy permisos_cheques_admin on public.control_permisos_cheques for all to authenticated using(public.control_es_admin_cierre()) with check(public.control_es_admin_cierre());
   create policy permisos_cheques_select on public.control_permisos_cheques for select to authenticated using(user_id=auth.uid() or public.control_es_admin_cierre());
   alter table public.ia_config enable row level security;
   create policy p_iacfg_all on public.ia_config for all to authenticated using(public.app_es_vip()) with check(public.app_es_vip());
   create policy p_iacfg_sel on public.ia_config for select to authenticated using(public.app_es_vip());
   alter table public.ia_embeddings enable row level security;
   create policy p_iaemb_all on public.ia_embeddings for all to authenticated using(public.app_es_vip()) with check(public.app_es_vip());
   create policy p_iaemb_sel on public.ia_embeddings for select to authenticated using(public.app_es_vip() or(public.app_registrado() and public.app_ve_obra(obra_id)));
   grant select,insert,update,delete on public.ia_config,public.ia_embeddings to authenticated;
   revoke create on schema public from public,anon,authenticated;
   create table public.prueba_trigger(n integer);
   create function public.fn_audit_trabajadores() returns trigger language plpgsql security definer as $$begin new.n:=new.n+1;return new;end$$;
   create trigger prueba before insert on public.prueba_trigger for each row execute function public.fn_audit_trabajadores();
   grant insert,select on public.prueba_trigger to authenticated;`);
  const sql=fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_integracion_seguridad_heredada_y_revision_historica.sql')),'utf8');
  await db.exec(sql);n++;
  for(const name of ['app_es_vip','app_puede_escribir','app_puede_borrar','app_rol','app_registrado']){
   const r=await db.query("select has_function_privilege('anon',$1,'execute') a,has_function_privilege('authenticated',$1,'execute') u",['public.'+name+'()']);assert.equal(r.rows[0].a,false);assert.equal(r.rows[0].u,true);n++;
  }
  await actor(db,'conta');await db.exec('insert into public.prueba_trigger values(1)');assert.equal((await db.query('select n from public.prueba_trigger')).rows[0].n,2);n++;
  assert.equal((await db.query("select has_function_privilege('authenticated','public.fn_audit_trabajadores()','execute') a")).rows[0].a,false);n++;
  await actor(db,null);await assert.rejects(db.query('select public.control_revision_historica(null)'),/permission denied/);n++;
  await actor(db,'consulta');await assert.rejects(db.query('select public.control_revision_historica(null)'),/administrador/);n++;
  await actor(db,'jire');await assert.rejects(db.query('select public.control_revision_historica($1)',[ids.obra]),/Sin permiso/);n++;
  await actor(db,'consulta');assert.equal((await db.query('select count(*) n from public.app_usuarios')).rows[0].n,1);n++;
  await assert.rejects(db.query("insert into public.ia_config values($1,'no permitido')",[crypto.randomUUID()]),/row-level security/);n++;
  const ia=crypto.randomUUID();await actor(db,'conta');await db.query("insert into public.ia_config values($1,'ficticio')",[ia]);assert.equal((await db.query('select count(*) n from public.ia_config')).rows[0].n,1);n++;
  await actor(db,'consulta');assert.equal((await db.query('select count(*) n from public.ia_config')).rows[0].n,0);n++;
  // Ocho centros, dos empresas; ninguna lectura crea sellos ni obligaciones.
  const obras=[ids.obra,ids.otra];for(let i=2;i<8;i++){const id=crypto.randomUUID();obras.push(id);await owner(db,"insert into public.obras(id,nombre,empresa_codigo,fecha_inicio) values($1,$2,$3,'2026-03-30')",[id,'CENTRO FICTICIO '+i,i%2?'JIRE':'PLATINUM']);}
  for(const [i,id]of obras.entries())await owner(db,"insert into public.control_cierres_nomina(id,obra_id,semana,periodo,formula_version,snapshot_sha256,snapshot,creado_por) values($1,$2,1,'SEMANAL','PRUEBA','huella',$3,$4)",[crypto.randomUUID(),id,JSON.stringify({...snapshot(),obra_id:id,items:[]}),ids.conta]);
  const before=await owner(db,'select count(*) n from public.control_obligaciones_pago');
  await actor(db,'admin');let r=(await db.query('select public.control_revision_historica(null) d')).rows[0].d;assert(r.solo_lectura);assert(r.requiere_aprobacion);assert.equal(r.cierres.length,8);n++;
  for(const obra of obras){r=(await db.query('select public.control_revision_historica($1) d',[obra])).rows[0].d;assert.equal(r.cierres.length,1);assert.equal(r.cierres[0].obra_id,obra);n++;}
  await actor(db,'jire');r=(await db.query('select public.control_revision_historica($1) d',[ids.otra])).rows[0].d;assert.equal(r.cierres.length,1);n++;
  const after=await owner(db,'select count(*) n from public.control_obligaciones_pago');assert.deepEqual(after.rows,before.rows);assert.equal((await owner(db,'select count(*) n from public.control_cierre_versiones')).rows[0].n,0);n++;
  // Una escritura ordinaria mantiene los disparadores de conciliación tras revocar EXECUTE directo.
  const c=(await owner(db,'select id from public.control_cierres_nomina where obra_id=$1',[ids.obra])).rows[0].id;
  const det=await rpc(db,'conta','DETALLE',{cierre_id:c});assert.equal(det.cierre.id,c);n++;
  console.log('PASS '+n+' comprobaciones PostgreSQL: seguridad heredada, disparadores, RLS y revisión sin mutaciones en 8 centros / 2 empresas.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
