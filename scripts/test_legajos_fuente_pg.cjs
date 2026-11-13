// Consulta aislada con identidades ficticias; nunca carga ni modifica nómina real.
const fs=require('node:fs'),assert=require('node:assert/strict');const{PGlite}=require('@electric-sql/pglite');
const file='supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_recibos_regiones_legajos_verificados.sql'));
if(!fs.existsSync(file)){console.log('ALCANCE: prueba de consulta canónica requiere migración privada.');process.exit(0);}
(async()=>{const db=new PGlite();let n=0;const ok=(v,m)=>{assert(v,m);n++;};try{
 await db.exec(`create role authenticated;create role service_role;create schema auth;create schema platinum_internal;create schema extensions;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',current_setting('test.role',true))$$;
 create function public.app_registrado() returns boolean language sql as $$select auth.uid() is not null$$;
 create function platinum_internal.autorizar(o uuid,w boolean default false) returns void language plpgsql as $$begin if o::text<>'00000000-0000-4000-8000-000000000001' or current_setting('test.allow',true) is distinct from 'yes' then raise exception 'Sin permiso' using errcode='42501';end if;end$$;
 create function extensions.digest(t text,a text) returns bytea language sql as $$select decode(md5(t)||md5(t),'hex')$$;
 create table public.cheques(id uuid);create table public.control_cierres_nomina(id uuid);
 create table public.documentos(id uuid primary key,obra_id uuid,trabajador_id uuid,categoria text,archivo text,hash text,anulado boolean,periodo_inicio date,periodo_fin date);
 create table platinum_internal.lectura_documental_lotes(id uuid);create table platinum_internal.lectura_documental_resultados(id uuid);
 create table platinum_internal.lecturas_fiscales_documentos(documento_id uuid primary key,obra_id uuid,trabajador_id uuid,archivo text,hash text,uuid text,neto numeric,desde date,hasta date,tipo text,concepto_estado text,datos jsonb,verificado_en timestamptz);
 create table platinum_internal.fragmentos_recibo(clave text primary key,obra_id uuid,lease uuid,vence timestamptz,pausa_hasta timestamptz,literal text,resuelto boolean,creado_en timestamptz default now());
 create function public.control_revision_recibo(text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function public.control_fragmento_recibo(text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
 revoke all on function public.control_revision_recibo(text,jsonb),public.control_fragmento_recibo(text,jsonb) from public;grant execute on function public.control_revision_recibo(text,jsonb),public.control_fragmento_recibo(text,jsonb) to authenticated,service_role;
 alter table platinum_internal.lecturas_fiscales_documentos enable row level security;
 select set_config('test.actor','00000000-0000-4000-8000-000000000002',false),set_config('test.allow','yes',false);`);
 const before=(await db.query("select proacl::text a from pg_proc where proname='control_revision_recibo'")).rows[0].a;
 await db.exec(fs.readFileSync(file,'utf8'));
 ok((await db.query("select proacl::text a from pg_proc where proname='control_revision_recibo'")).rows[0].a===before,'Permisos nativos conservados');
 const obra='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000003',w='00000000-0000-4000-8000-000000000004';
 await db.query("insert into documentos values($1,$2,$3,'RECIBO_NOMINA','privado.pdf',$4,false,'2026-11-02','2026-11-08')",[id,obra,w,'a'.repeat(64)]);
 const call=async(datos={})=>(await db.query("select control_revision_recibo('LEGAJOS',$1::jsonb) j",[JSON.stringify({obra_id:obra,documentos:[id],...datos})])).rows[0].j;
 ok((await call())[0].estado==='PENDIENTE','Sin lectura no inventa validación');
 await db.query("insert into platinum_internal.lecturas_fiscales_documentos values($1,$2,$3,'privado.pdf',$4,'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE',100.01,'2026-11-02','2026-11-08','FINIQUITO','VERIFICADO',$5,now())",[id,obra,w,'a'.repeat(64),JSON.stringify({identificadores:['PRUP900101AA1'],rfc:'PRUP900101AA1',evidencia_campos:{curp:[{transcripcion:'PRUP900101HHGXXX01'}]}})]);
 const f=(await call())[0];ok(f.estado==='VERIFICADO'&&f.lectura.neto===100.01,'Neto canónico');ok(f.lectura.datos.evidencia_campos.curp[0].transcripcion==='PRUP900101HHGXXX01','Conserva transcripción validada');ok(f.lectura.datos.recibos===1&&f.hash==='a'.repeat(64),'Huella y original exactos');
 await db.query("update platinum_internal.lecturas_fiscales_documentos set verificado_en=now()+interval '1 second' where documento_id=$1",[id]);ok((await call())[0].revision!==f.revision,'Cambio fiscal invalida preparación');
 for(const [col,value]of [['hash','b'.repeat(64)],['archivo','otro.pdf'],['trabajador_id','00000000-0000-4000-8000-000000000005'],['periodo_fin','2026-11-09']]){await db.exec('begin');await db.query('update documentos set '+col+'=$1 where id=$2',[value,id]);ok((await call())[0].estado==='PENDIENTE','Cambio '+col+' impide reuso');await db.exec('rollback');}
 await db.query('update documentos set anulado=true where id=$1',[id]);ok((await call()).length===0,'Anulado excluido');await db.query('update documentos set anulado=false where id=$1',[id]);
 await assert.rejects(call({documentos:Array(101).fill(id)}),/100 originales/);n++;
 await db.exec("select set_config('test.allow','no',false)");await assert.rejects(call(),/Sin permiso/);n++;
 await db.exec("select set_config('test.allow','yes',false),set_config('test.actor','',false)");await assert.rejects(call(),/acceso operativo/);n++;
 await db.exec("select set_config('test.actor','00000000-0000-4000-8000-000000000002',false)");
 const datos={obra_id:obra,huella:'a'.repeat(64),region:{campo:'rfc',pagina:1,x:10,y:20,texto:'RFC PRUP900101AA1'}};
 const frag=async()=>(await db.query("select control_fragmento_recibo('RESERVAR',$1::jsonb) j",[JSON.stringify(datos)])).rows[0].j;
 const lease=await frag();ok(lease.estado==='LISTO','Reserva original');const enCurso=await frag();ok(enCurso.estado==='EN_CURSO'&&Date.parse(enCurso.reintentar_en)>Date.now(),'Hora explícita de reintento');
 await db.exec("update platinum_internal.fragmentos_recibo set lease=null,vence=null,pausa_hasta=now()+interval '45 seconds'");const pausa=await frag();ok(pausa.estado==='PAUSADO'&&Date.parse(pausa.reintentar_en)>Date.now(),'Hora explícita en 503');
 console.log('PASS '+n+' comprobaciones PostgreSQL: lectura/hash/ruta/persona/periodo/version, RLS, permisos y reintentos.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
