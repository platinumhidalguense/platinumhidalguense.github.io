// PostgreSQL aislado con filas ficticias; nunca usa red ni credenciales.
const fs=require('node:fs'),base=require('./soporte_flujo_pg.cjs');
async function makeDatabase(){const db=await base.makeDatabase();try{
 for(const n of fs.readdirSync('supabase/migrations').filter(n=>/_pagos_(pendientes_revision_sabado|conectores_y_aviso_programado)\.sql$/.test(n)).sort())await db.exec(fs.readFileSync('supabase/migrations/'+n,'utf8'));
 return db;
}catch(e){await db.close();throw e;}}
async function pagos(db,key,a,j={}){await base.actor(db,key);return(await db.query('select public.control_pagos_sabado($1,$2::jsonb) d',[a,JSON.stringify(j)])).rows[0].d;}
async function clock(db,stamp){await db.exec('reset role');if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[-+]\d\d:\d\d$/.test(stamp))throw Error('Reloj ficticio inválido');await db.exec(`create or replace function platinum_internal.pagos_ahora() returns timestamptz language sql stable security invoker set search_path='' as $$select '${stamp}'::timestamptz$$`);}
module.exports={...base,makeDatabase,pagos,clock};
if(require.main===module)makeDatabase().then(async db=>{console.log('PASS PostgreSQL: política de revisión de pagos compilada.');await db.close();}).catch(e=>{console.error(e.message);process.exitCode=1;});
