// Sólo PostgreSQL WASM y filas ficticias. No usa red ni credenciales.
const fs=require('node:fs');
const base=require('./soporte_flujo_pg.cjs');
async function makeDatabase(){
 const db=await base.makeDatabase();
 await db.exec(`create table public.historial(id bigint generated always as identity primary key,trabajador_id uuid,obra_id uuid,usuario text,accion text,datos_antes jsonb,datos_despues jsonb,fecha timestamptz default now());
  grant select on public.historial to authenticated;
  alter table public.historial enable row level security;
  create policy alcance_historial on public.historial for select to authenticated using(public.app_ve_obra(obra_id));
  create table public.control_st7_acuses(id uuid primary key default gen_random_uuid(),obra_id uuid,trabajador_id uuid,caso_imss_id uuid,recibido_en timestamptz,devuelto_en timestamptz,recibido_por text,registrado_en timestamptz default now());
  grant select on public.control_st7_acuses to authenticated;
  alter table public.control_st7_acuses enable row level security;
  create policy salud_st7 on public.control_st7_acuses for select to authenticated using(public.app_ve_obra(obra_id) and public.control_puede_ver_salud());
  alter table public.control_casos_imss enable row level security;
  create policy salud_casos on public.control_casos_imss for select to authenticated using(public.app_ve_obra(obra_id) and public.control_puede_ver_salud());
  alter table public.control_casos_imss_semanas enable row level security;
  create policy salud_semanas on public.control_casos_imss_semanas for select to authenticated using(exists(select 1 from public.control_casos_imss c where c.id=caso_id));`);
 for(const n of fs.readdirSync('supabase/migrations').filter(n=>/_rrhh_(orquestacion_corte_y_procesos|trazabilidad_y_expediente)\.sql$/.test(n)).sort()){
  try{await db.exec(fs.readFileSync('supabase/migrations/'+n,'utf8'));}catch(e){e.message=n+': '+e.message;await db.close();throw e;}
 }
 return db;
}
async function rrhh(db,key,action,data={}){await base.actor(db,key);return(await db.query('select public.control_rrhh_operar($1,$2::jsonb) d',[action,JSON.stringify(data)])).rows[0].d;}
module.exports={...base,makeDatabase,rrhh};
if(require.main===module)makeDatabase().then(async db=>{console.log('PASS migraciones RRHH compiladas en PostgreSQL local.');await db.close();}).catch(e=>{console.error(e);process.exitCode=1;});
