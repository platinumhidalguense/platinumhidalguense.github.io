// PostgreSQL WASM local. Sólo esquema y datos ficticios; nunca conecta a Supabase.
const fs=require('node:fs'),path=require('node:path');
let PGlite;try{({PGlite}=require('@electric-sql/pglite'));}catch{({PGlite}=require('../work/integracion_global_20261016/runtime/node_modules/@electric-sql/pglite'));}
const root=path.resolve(__dirname,'..'),fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/flujo/schema.json'),'utf8'));
const defs=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/flujo/functions.json'),'utf8'));
const authDefs=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/flujo/auth.json'),'utf8'));
const migrations=()=>fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>/integracion_(flujo_nomina_pagos|guardas_y_eventos|conciliacion_y_transferencias)\.sql$/.test(x)).sort().map(x=>({name:x,sql:fs.readFileSync(path.join(root,'supabase/migrations',x),'utf8')}));
const ids={admin:'10000000-0000-4000-8000-000000000001',conta:'10000000-0000-4000-8000-000000000002',consulta:'10000000-0000-4000-8000-000000000003',jire:'10000000-0000-4000-8000-000000000004',
 obra:'20000000-0000-4000-8000-000000000001',otra:'20000000-0000-4000-8000-000000000002',w:'30000000-0000-4000-8000-000000000001',w2:'30000000-0000-4000-8000-000000000002',wOtra:'30000000-0000-4000-8000-000000000003'};
async function makeDatabase(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 create function auth.email() returns text language sql stable as $$select auth.jwt()->>'email'$$;
 grant usage on schema public,auth to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;`);
 for(const t of fixture.tables){
  const cols=t.columns.map(c=>`"${c.name}" ${c.type}`+(c.generated?` generated always as (${c.default}) stored`:c.identity?` generated ${c.identity==='a'?'always':'by default'} as identity`:c.default?` default ${c.default}`:'')+(c.notnull?' not null':''));
  const constraints=(t.constraints||[]).map(c=>`constraint "${c.name}" ${c.def}`);
  await db.exec(`create table public."${t.name}"(${[...cols,...constraints].join(',')})`);
 }
 await db.exec(fixture.norm_semana+';');
 for(const def of fixture.indexes||[])await db.exec(def);
 for(const a of authDefs)await db.exec(a.definition+';');
 for(const name of ['app_puede_escribir','control_es_admin_cierre','control_puede_eliminar_cheques','control_validar_conciliacion','control_transicion_cierre','control_preparar_medio_pago','control_validar_neto_cheque_noi','control_proteger_papelera_cheques','control_generar_cheques_pendientes','control_eliminar_cierre_admin']){
  const f=defs.find(f=>f.name===name);if(!f)throw Error('Missing '+name);await db.exec(f.definition+';');
 }
 const deletion=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/flujo/deletion.json'),'utf8'));
 await db.exec(deletion.guard+';');
 for(const fk of deletion.fks||[])await db.exec(`alter table public.${fk.tabla.replace('public.','')} add constraint "${fk.name}" ${fk.def}`);
 await db.exec(`create trigger control_bloquear_borrado_cierre_trg before delete on public.control_cierres_nomina for each row execute function public.control_bloquear_borrado_cierre();
 create trigger trg_control_cierres_transicion before update on public.control_cierres_nomina for each row execute function public.control_transicion_cierre();
 create trigger trg_control_conciliacion_bloqueo before insert or update or delete on public.control_conciliacion_noi for each row execute function public.control_validar_conciliacion();
 create trigger control_preparar_medio_pago_trg before insert or update of metodo_pago,monto_noi,tipo_calculo,trabajador_id on public.control_conciliacion_noi for each row execute function public.control_preparar_medio_pago();
 create trigger trg_control_validar_neto_cheque_noi before insert or update on public.cheques for each row execute function public.control_validar_neto_cheque_noi();
 create trigger trg_proteger_papelera_cheques before update on public.cheques for each row execute function public.control_proteger_papelera_cheques();
 create publication supabase_realtime;`);
 for(const id of Object.values(ids).slice(0,4))await db.query('insert into auth.users(id) values($1)',[id]);
 for(const [key,rol,email,full,write,del,companies]of [['admin','ADMIN','admin@prueba.test',true,true,true,['PLATINUM','JIRE']],['conta','CONTADOR','conta@prueba.test',true,true,false,['PLATINUM','JIRE']],['consulta','CONSULTA','consulta@prueba.test',false,false,false,['PLATINUM','JIRE']],['jire','CAPTURISTA','jire@prueba.test',false,true,false,['JIRE']]]){
  await db.query('insert into public.app_usuarios(user_id,email,rol,activo,full_access,puede_escribir,puede_eliminar,empresas_permitidas) values($1,$2,$3,true,$4,$5,$6,$7)',[ids[key],email,rol,full,write,del,companies]);
 }
 await db.query("insert into public.config(clave,valor) values('admin_papelera',$1)",[JSON.stringify({email:'admin@prueba.test'})]);
 for(const[id,nombre,emp]of[[ids.obra,'OBRA FICTICIA','PLATINUM'],[ids.otra,'OTRA FICTICIA','JIRE']])await db.query("insert into public.obras(id,nombre,empresa_codigo,fecha_inicio) values($1,$2,$3,(now() at time zone 'America/Mexico_City')::date-extract(isodow from now() at time zone 'America/Mexico_City')::integer+1)",[id,nombre,emp]);
 for(const[id,no,obra]of[[ids.w,1,ids.obra],[ids.w2,2,ids.obra],[ids.wOtra,1,ids.otra]])await db.query("insert into public.trabajadores(id,obra_id,no_trab,nombres,primer_apellido,estatus,fecha_alta,sd,sdi,sal_semanal,contratista,cuenta,forma_pago) values($1,$2,$3,'PERSONA','PRUEBA','ACTIVO','2026-01-01',300,320,2000,'MG','1234567890','TRANSFERENCIA')",[id,obra,no]);
 await db.exec(`grant select,insert,update,delete on all tables in schema public to authenticated;
 grant execute on all functions in schema public to authenticated;
 grant usage,select on all sequences in schema public to authenticated;
 alter table public.trabajadores enable row level security;
 create policy trabajadores_read on public.trabajadores for select to authenticated using(public.app_ve_obra(obra_id));
 create policy trabajadores_write on public.trabajadores for all to authenticated using(public.app_ve_obra(obra_id) and public.app_puede_escribir()) with check(public.app_ve_obra(obra_id) and public.app_puede_escribir());`);
 for(const t of ['control_cierres_nomina','control_conciliacion_noi','pagos','cheques','documentos','descuentos','diferenciales'])await db.exec(`alter table public.${t} enable row level security;create policy ${t}_scope on public.${t} for all to authenticated using(public.app_ve_obra(obra_id)) with check(public.app_ve_obra(obra_id) and public.app_puede_escribir());`);
 await db.exec(`create policy control_altas_bajas_cortas_insert on public.control_altas_bajas_cortas for insert to authenticated with check(true);
 create policy control_altas_bajas_cortas_update on public.control_altas_bajas_cortas for update to authenticated using(true) with check(true);`);
 for(const m of migrations()){
  try{await db.exec(m.sql);}catch(e){e.message=m.name+': '+e.message;throw e;}
 }
 return db;
}
async function actor(db,key){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:key?ids[key]:null,role:key?'authenticated':'anon',email:key?key+'@prueba.test':null})]);await db.exec('set role '+(key?'authenticated':'anon'));}
async function rpc(db,key,action,data={}){await actor(db,key);return(await db.query('select public.control_flujo_operar($1,$2::jsonb) result',[action,JSON.stringify(data)])).rows[0].result;}
async function owner(db,sql,args=[]){await db.exec('reset role');return db.query(sql,args);}
function snapshot(w=ids.w,neto=2000,prevision=0){const day=new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);const desde=day.toISOString().slice(0,10);day.setUTCDate(day.getUTCDate()+6);const hasta=day.toISOString().slice(0,10);const row={w:{id:w,obra_id:ids.obra,no_trab:1,nombres:'PERSONA',primer_apellido:'PRUEBA',contratista:'MG',periodo_pago:'SEMANAL',cuenta:'1234567890'},fin:false,sueldo:neto-prevision,incidencias:0,creditos:0,otras:0,prevision,costo:neto-prevision,neto,items:[],pago:'TRANSFERENCIA',sinCuenta:false};return{obra_id:ids.obra,empresa_codigo:'PLATINUM',semana:1,periodo:'SEMANAL',desde,hasta,formula_version:'MOTOR_EXISTENTE_PRUEBA',total_nomina:neto-prevision,total_prevision:prevision,total_retenciones:0,total_finiquitos:0,total_neto:neto,total_trabajadores:1,
 items:[{trabajador_id:w,numero:1,nombre:'PRUEBA PERSONA',tipo:'NOMINA',metodo_pago:'TRANSFERENCIA',sueldo_nomina:neto-prevision,prevision_social:prevision,retenciones:0,monto:neto}],modelo:{filas:[row],items:[],sem:'S1',neto,costo:neto-prevision}};}
module.exports={makeDatabase,ids,actor,rpc,owner,snapshot,migrations};
if(require.main===module)makeDatabase().then(async db=>{console.log('OK esquema de producción sin filas, migraciones completas compiladas en PostgreSQL local.');await db.close();}).catch(e=>{console.error(e.message);process.exit(1)});
