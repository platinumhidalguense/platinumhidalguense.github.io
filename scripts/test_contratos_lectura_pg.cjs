// PostgreSQL aislado; permisos reales por rol, identidades y documentos ficticios.
const fs=require('fs'),assert=require('node:assert/strict'),base=require('./soporte_flujo_pg.cjs');
(async()=>{const db=await base.makeDatabase(),{ids}=base;try{
 await db.exec('reset role;create role authenticator;create role supabase_storage_admin;create schema storage;create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;alter table app_usuarios enable row level security;alter table documentos enable row level security;');
 // El esquema sintético no contiene aún todos los campos del contrato actual.
 const tipos={fecha_fin_contrato:'date',fecha_reingreso:'date',fecha_nacimiento:'date',genero:'text',escolaridad:'text',edo_nacimiento:'text',nacionalidad:'text',estado_civil:'text',direccion:'text',cp:'text',funciones:'text',correo:'text',beneficiario:'text',tipo_contrato:'text',eliminado:'boolean',ubicacion:'text'};
 for(const[k,t]of Object.entries(tipos))await db.exec(`alter table ${k==='ubicacion'?'obras':'trabajadores'} add column if not exists ${k} ${t}`);
 await db.exec(fs.readFileSync('supabase/migrations/20261105200042_portal_contratos_solo_lectura.sql','utf8'));
 await db.query('update app_usuarios set solo_contratos=true where user_id=$1',[ids.consulta]);
 const doc='40000000-0000-4000-8000-000000000001',rec='40000000-0000-4000-8000-000000000002';
 await db.query("insert into documentos(id,obra_id,trabajador_id,categoria,subtipo,archivo,nombre_archivo) values($1,$2,$3,'OTRO','CONTRATO_LABORAL','contrato.pdf','Contrato.pdf'),($4,$2,$3,'RECIBO_NOMINA',null,'recibo.pdf','Contrato enganoso.pdf')",[doc,ids.obra,ids.w,rec]);
 await db.exec("insert into storage.objects(bucket_id,name) values('expedientes','contrato.pdf'),('expedientes','recibo.pdf'),('incapacidades-imss','contrato.pdf');");
 await db.query("insert into config(clave,valor) values('empresa_PLATINUM',$1)",[JSON.stringify({razon:'EMPRESA FICTICIA',rfc:'FIC010101AAA',clave_privada:'NO DEBE SALIR'})]);
 const legal=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids.consulta,role:'contratos_lectura'})]);await db.exec('set role contratos_lectura');};
 const rpc=async(a,d={})=>(await db.query('select control_consulta_contratos($1,$2) r',[a,JSON.stringify(d)])).rows[0].r;
 await legal();assert.equal((await db.query('select count(*) n from app_usuarios')).rows[0].n,1);
 let r=await rpc('INICIO');assert.equal(r.obras.length,2);assert(!JSON.stringify(r).includes('NO DEBE SALIR'));
 r=await rpc('LISTAR');assert.equal(r.total,3);assert(r.filas.every(w=>!('cuenta'in w)&&!('sal_semanal'in w)&&!('sdi'in w)));assert.equal((await rpc('LISTAR',{limite:1,offset:1})).filas.length,1);
 assert.equal((await rpc('ARCHIVOS')).filas.length,1);assert.equal((await db.query('select count(*) n from documentos')).rows[0].n,1);assert.equal((await db.query('select count(*) n from storage.objects')).rows[0].n,1);
 for(const t of ['trabajadores','pagos','cheques','config','descuentos'])await assert.rejects(db.query('select * from '+t),/permission denied/);
 await assert.rejects(db.query('update app_usuarios set full_access=true'),/permission denied/);await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('expedientes','x')"),/permission denied/);await assert.rejects(rpc('GUARDAR'),/no disponible/);
 assert.equal((await db.query('select app_registrado() a,app_ve_obra($1) b',[ids.obra])).rows[0].a,false);
 await db.exec('reset role');await db.query("update app_usuarios set empresas_permitidas=array['JIRE'] where user_id=$1",[ids.consulta]);await legal();assert.equal((await rpc('LISTAR')).total,1);assert.equal((await rpc('ARCHIVOS')).filas.length,0);await assert.rejects(rpc('LISTAR',{empresa:'PLATINUM'}),/fuera del alcance/);assert.equal((await db.query('select count(*) n from storage.objects')).rows[0].n,0);
 await db.exec('reset role');await db.query('update app_usuarios set activo=false where user_id=$1',[ids.consulta]);await legal();await assert.rejects(rpc('INICIO'),/Sin permiso/);
 await base.actor(db,'admin');assert.equal((await db.query('select app_registrado() a,app_ve_obra($1) b',[ids.obra])).rows[0].a,true);
 console.log('PASS contratos PostgreSQL: ambas empresas, alcance restringido, perfil propio, campos mínimos, archivos clasificados, sin pagos/VIP/escrituras, revocación inmediata.');
}finally{await db.close();}})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
