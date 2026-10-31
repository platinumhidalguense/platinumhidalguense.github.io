// Esquema ficticio: selección de calendarios sin añadir permisos ni disparadores.
const fs=require('node:fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const f=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_motores_nomina_calendarios_separados.sql')),sql=fs.readFileSync(f?'supabase/migrations/'+f:process.argv[2],'utf8');
assert(!/create\s+trigger|\brevoke\b|\bgrant\b|security\s+definer|update\s+public/i.test(sql));
const obra='20000000-0000-4000-8000-000000000001',w='30000000-0000-4000-8000-000000000001';
(async()=>{const db=new PGlite();let n=0;try{
 await db.exec(`create schema platinum_internal;create table public.obras(id uuid primary key,fecha_inicio date);
 create table public.trabajadores(id uuid primary key,obra_id uuid,periodo_pago text);
 insert into public.obras values('${obra}','2026-03-30');insert into public.trabajadores values('${w}','${obra}','QUINCENAL');`);
 await db.exec(sql);
 const p=async(s)=>(await db.query('select platinum_internal.periodo_nomina($1,$2,$3) p',[obra,w,s])).rows[0].p;
 assert.deepEqual(await p(31),{desde:'2026-10-16',hasta:'2026-10-31'});n++;
 assert.deepEqual(await p(33),{desde:'2026-11-01',hasta:'2026-11-15'});n++;
 for(let s=1;s<=53;s++){const q=await p(s);assert(q.desde.endsWith('-01')||q.desde.endsWith('-16'));n++;}
 await db.query("update trabajadores set periodo_pago='SEMANAL' where id=$1",[w]);assert.deepEqual(await p(31),{desde:'2026-10-26',hasta:'2026-11-01'});n++;
 for(const inicio of ['2026-11-30','2026-12-28','2028-02-28']){
  const r=(await db.query('select platinum_internal.calendario_motor_quincenal($1) p',[inicio])).rows[0].p;
  assert(r.hasta.endsWith('-30')||r.hasta.endsWith('-31')||r.hasta.endsWith('-29'));n++;
 }
 await db.query("update trabajadores set periodo_pago='INVALIDO' where id=$1",[w]);await assert.rejects(p(31),/Periodicidad sin motor/);n++;
 assert.deepEqual((await db.query('select platinum_internal.periodo_nomina($1,$2,31) p',[obra,'30000000-0000-4000-8000-000000000099'])).rows[0].p,{desde:null,hasta:null});n++;
 console.log('PASS PostgreSQL calendarios separados: '+n+' casos, semanas completas, quincenas, bisiesto, año y periodicidad; sin disparadores, permisos ni cambios financieros.');
 }finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
