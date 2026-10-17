-- PLATINUM OS · núcleo de coordinación. No recalcula salarios ni impuestos.
-- Importes = resultados del motor existente, NOI y comprobantes archivados.
create schema if not exists platinum_internal;
revoke all on schema platinum_internal from public,anon;
grant usage on schema platinum_internal to authenticated;

create table public.control_cierre_versiones (
 id uuid primary key default gen_random_uuid(),cierre_origen uuid not null,
 obra_id uuid not null references public.obras(id),version integer not null check(version>0),
 estado_origen text not null,snapshot jsonb not null,snapshot_sha256 text not null,
 fuente_sha256 text not null,actor_id uuid not null,created_at timestamptz not null default now(),
 unique(cierre_origen,version)
);
create index control_cierre_versiones_obra_idx on public.control_cierre_versiones(obra_id,created_at desc);
create table public.control_flujo_cierres (
 cierre_id uuid primary key references public.control_cierres_nomina(id) on delete cascade,
 obra_id uuid not null references public.obras(id),revision integer not null default 1 check(revision>0),
 fuente_sha256 text,preparado_sha256 text,sucio boolean not null default true,
 version_id uuid references public.control_cierre_versiones(id),reapertura_id uuid,
 preparado_por uuid,preparado_en timestamptz,updated_at timestamptz not null default now()
);
create index control_flujo_cierres_obra_idx on public.control_flujo_cierres(obra_id);
create index control_flujo_cierres_version_idx on public.control_flujo_cierres(version_id);
create table public.control_obligaciones_pago (
 id uuid primary key default gen_random_uuid(),cierre_origen uuid not null,
 cierre_id uuid references public.control_cierres_nomina(id) on delete set null,
 version_id uuid not null references public.control_cierre_versiones(id),
 obra_id uuid not null references public.obras(id),trabajador_id uuid not null references public.trabajadores(id),
 semana integer not null check(semana between 1 and 53),tipo text not null check(tipo in('NOMINA','FINIQUITO','PREVISION_SOCIAL')),
 numero integer,nombre text not null,contratista text not null default '',
 importe numeric(14,2) not null check(importe>=0),metodo text not null check(metodo in('TRANSFERENCIA','CHEQUE','POR DEFINIR')),
 vigente boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(cierre_origen,trabajador_id,tipo),unique(obra_id,semana,trabajador_id,tipo)
);
create index control_obligaciones_obra_sem_idx on public.control_obligaciones_pago(obra_id,semana,trabajador_id);
create index control_obligaciones_cierre_idx on public.control_obligaciones_pago(cierre_id);
create index control_obligaciones_version_idx on public.control_obligaciones_pago(version_id);
create index control_obligaciones_trabajador_idx on public.control_obligaciones_pago(trabajador_id);
create table public.control_evidencias_pago (
 id uuid primary key default gen_random_uuid(),obra_id uuid not null references public.obras(id),
 trabajador_id uuid not null references public.trabajadores(id),semana integer not null,
 clave text not null,importe numeric(14,2) not null check(importe>0),
 pago_id uuid references public.pagos(id) on delete restrict,cheque_id uuid references public.cheques(id) on delete restrict,
 created_at timestamptz not null default now(),
 check(num_nonnulls(pago_id,cheque_id)=1),unique(obra_id,clave)
);
create index control_evidencias_trab_sem_idx on public.control_evidencias_pago(trabajador_id,semana);
create index control_evidencias_pago_idx on public.control_evidencias_pago(pago_id);
create index control_evidencias_cheque_idx on public.control_evidencias_pago(cheque_id);
create table public.control_pago_aplicaciones (
 id uuid primary key default gen_random_uuid(),obra_id uuid not null references public.obras(id),
 obligacion_id uuid not null references public.control_obligaciones_pago(id),
 evidencia_id uuid not null references public.control_evidencias_pago(id),version_id uuid not null references public.control_cierre_versiones(id),
 importe numeric(14,2) not null check(importe>0),actor_id uuid not null,
 clave_idempotencia uuid not null unique,motivo text not null check(length(btrim(motivo))>=10),
 created_at timestamptz not null default now(),retirado_en timestamptz,retirado_por uuid,motivo_retiro text,
 check((retirado_en is null and retirado_por is null and motivo_retiro is null)
    or(retirado_en is not null and retirado_por is not null and length(btrim(motivo_retiro))>=10))
);
create index control_aplicaciones_obligacion_idx on public.control_pago_aplicaciones(obligacion_id);
create index control_aplicaciones_evidencia_idx on public.control_pago_aplicaciones(evidencia_id);
create index control_aplicaciones_version_idx on public.control_pago_aplicaciones(version_id);
create index control_aplicaciones_obra_idx on public.control_pago_aplicaciones(obra_id,created_at desc);
create table public.control_solicitudes_flujo (
 id uuid primary key default gen_random_uuid(),obra_id uuid not null references public.obras(id),
 cierre_origen uuid not null,tipo text not null check(tipo in('REAPERTURA','REGULARIZACION','EVIDENCIA_DISTINTA')),
 motivo text not null check(length(btrim(motivo))>=10),propuesta jsonb not null default '{}',
 estado text not null default 'PENDIENTE' check(estado in('PENDIENTE','APROBADO','RECHAZADO')),
 creado_por uuid not null,created_at timestamptz not null default now(),
 decidido_por uuid,decidido_en timestamptz,nota_decision text,aplicado_en timestamptz
);
create index control_solicitudes_obra_estado_idx on public.control_solicitudes_flujo(obra_id,estado,created_at desc);
create index control_solicitudes_cierre_idx on public.control_solicitudes_flujo(cierre_origen);
create table public.control_eventos_integracion (
 id bigint generated always as identity primary key,obra_id uuid not null references public.obras(id),
 modulo text not null,tabla text not null,entidad_id text,accion text not null,
 privado boolean not null default false,actor_id uuid,created_at timestamptz not null default now()
);
create index control_eventos_obra_id_idx on public.control_eventos_integracion(obra_id,id desc);

alter table public.documentos add column if not exists nomina_neto numeric(14,2),
 add column if not exists nomina_tipo text,add column if not exists nomina_lector text;
alter table public.documentos add constraint documentos_nomina_lectura_ck
 check((nomina_neto is null or nomina_neto>=0) and(nomina_tipo is null or nomina_tipo in('NOMINA','FINIQUITO')));
alter table public.control_permisos_cheques add column if not exists puede_conciliar_transferencia boolean not null default false;

do $security$
declare t text;
begin
 foreach t in array array['control_cierre_versiones','control_flujo_cierres','control_obligaciones_pago','control_evidencias_pago','control_pago_aplicaciones','control_solicitudes_flujo','control_eventos_integracion'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using((select public.app_ve_obra(obra_id)))',t||'_scope',t);
 end loop;
end;
$security$;
drop policy control_eventos_integracion_scope on public.control_eventos_integracion;
create policy control_eventos_integracion_scope on public.control_eventos_integracion for select to authenticated
 using((select public.app_ve_obra(obra_id)) and(not privado or(select public.control_puede_ver_salud())));

create function platinum_internal.huella(p_json jsonb) returns text language sql immutable set search_path=''
as $$select encode(sha256(convert_to(coalesce(p_json,'null'::jsonb)::text,'UTF8')),'hex')$$;
create function platinum_internal.bloquear(p_obra uuid,p_semana integer) returns void language sql volatile set search_path=''
as $$select pg_advisory_xact_lock(hashtextextended(p_obra::text||':S'||p_semana::text,78104))$$;
create function platinum_internal.autorizar(p_obra uuid,p_escritura boolean default false) returns void
language plpgsql stable set search_path='' as $$
begin
 if(select auth.uid()) is null or not coalesce(public.app_ve_obra(p_obra),false)
    or(p_escritura and not coalesce(public.app_puede_escribir(),false)) then
  raise exception 'Sin permiso para esta operación y centro de trabajo' using errcode='42501';
 end if;
end;$$;

create function platinum_internal.aplicar_pago(p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare o public.control_obligaciones_pago%rowtype;c public.control_cierres_nomina%rowtype;
 b public.pagos%rowtype;q public.cheques%rowtype;e public.control_evidencias_pago%rowtype;
 a public.control_pago_aplicaciones%rowtype;r public.control_solicitudes_flujo%rowtype;
 v_id uuid;v_pago uuid:=nullif(p->>'pago_id','')::uuid;v_cheque uuid:=nullif(p->>'cheque_id','')::uuid;
 v_clave text;v_importe numeric;v_fecha date;v_sem integer;v_tid uuid;v_obra uuid;
 v_monto numeric:=(p->>'importe')::numeric;v_saldo numeric;v_usado numeric;v_autorizado boolean:=false;
begin
 select * into o from public.control_obligaciones_pago where id=(p->>'obligacion_id')::uuid;
 if not found then raise exception 'Obligación no encontrada'; end if;
 perform platinum_internal.autorizar(o.obra_id,true);
 if num_nonnulls(v_pago,v_cheque)<>1 or v_monto is null or v_monto<=0 or v_monto<>round(v_monto,2)
    or v_monto::text in('NaN','Infinity','-Infinity') or length(btrim(coalesce(p->>'motivo','')))<10 then
  raise exception 'Selecciona un comprobante, un importe positivo exacto y un motivo'; end if;
 if v_pago is not null then
  select * into b from public.pagos where id=v_pago for update;
  if not found or upper(coalesce(b.estado,''))<>'EXITOSO' or upper(b.medio)<>'TRANSFERENCIA' or b.importe<=0
      or nullif(btrim(b.folio_lote),'') is null or b.fecha_pago is null then
   raise exception 'El comprobante bancario debe ser exitoso y tener fecha, folio e importe positivo'; end if;
  v_obra:=b.obra_id;v_tid:=b.trabajador_id;v_sem:=public.norm_semana(b.semana);v_importe:=b.importe;v_fecha:=b.fecha_pago;
  v_clave:='BANCO:'||platinum_internal.huella(jsonb_build_array(b.obra_id,b.trabajador_id,v_sem,
    upper(btrim(coalesce(b.banco,''))),upper(regexp_replace(b.folio_lote,'\s','','g')),b.fecha_pago,b.importe));
 else
  select * into q from public.cheques where id=v_cheque for update;
  if not found or q.estatus not in('EXPEDIDO','ENTREGADO') or coalesce(q.eliminado,false) or q.importe<=0
     or nullif(btrim(q.num_cheque),'') is null then raise exception 'El cheque no está expedido o entregado con numeración válida'; end if;
  v_obra:=q.obra_id;v_tid:=q.trabajador_id;v_sem:=public.norm_semana(q.semana);v_importe:=q.importe;
  v_clave:='CHEQUE:'||q.id::text;
  if(o.tipo='FINIQUITO') is distinct from(q.tipo_pago='FINIQUITO') or o.tipo='PREVISION_SOCIAL' then
   raise exception 'El cheque corresponde a otro concepto'; end if;
 end if;
 if v_obra is distinct from o.obra_id or v_tid is distinct from o.trabajador_id then
  raise exception 'El comprobante pertenece a otro trabajador o centro'; end if;
 if o.tipo='FINIQUITO' and v_pago is not null and not exists(select 1 from public.control_finiquitos_transferencia ft
     where ft.obra_id=o.obra_id and ft.trabajador_id=o.trabajador_id and ft.semana=o.semana
       and ft.estado='CONCILIADO_BANCO' and ft.pago_id=v_pago and ft.importe=o.importe) then
  raise exception 'El finiquito por transferencia requiere la excepción autorizada y su comprobante exacto';end if;
 perform platinum_internal.bloquear(o.obra_id,o.semana);
 select * into c from public.control_cierres_nomina where id=o.cierre_id;
 if c.id is null or c.estado not in('AUTORIZADO','TIMBRADO','PAGADO') then raise exception 'Primero autoriza la versión conciliada del cierre'; end if;
 if not exists(select 1 from public.control_flujo_cierres fc where fc.cierre_id=c.id and not fc.sucio and fc.version_id=o.version_id) then
  raise exception 'La obligación no pertenece a la versión aprobada vigente'; end if;
 if(platinum_internal.diagnostico(c.id,o.trabajador_id)->>'pendientes')::integer>0 or(platinum_internal.diagnostico(c.id,o.trabajador_id)->>'fuera_snapshot')::integer>0 then
  raise exception 'Pago bloqueado: existen diferencias entre motor, NOI o recibos'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_clave,71140));
 select * into o from public.control_obligaciones_pago where id=o.id for update;
 select * into a from public.control_pago_aplicaciones where clave_idempotencia=(p->>'clave_idempotencia')::uuid;
 if found then
  if a.obligacion_id<>o.id or a.importe<>v_monto or not exists(select 1 from public.control_evidencias_pago e2 where e2.id=a.evidencia_id and e2.clave=v_clave) then
   raise exception 'La clave de operación ya corresponde a otros datos'; end if;
  return jsonb_build_object('aplicacion_id',a.id,'repetida',true);
 end if;
 if nullif(p->>'solicitud_id','') is not null then
  select * into r from public.control_solicitudes_flujo where id=(p->>'solicitud_id')::uuid and obra_id=o.obra_id
    and cierre_origen=o.cierre_origen and estado='APROBADO' and aplicado_en is null for update;
  v_autorizado:=found and r.tipo in('EVIDENCIA_DISTINTA','REGULARIZACION')
    and r.propuesta->>'obligacion_id'=o.id::text and coalesce(r.propuesta->>'pago_id','')=coalesce(v_pago::text,'')
    and coalesce(r.propuesta->>'cheque_id','')=coalesce(v_cheque::text,'') and(r.propuesta->>'importe')::numeric=v_monto;
 end if;
 if v_sem is distinct from o.semana and not v_autorizado then raise exception 'La semana del comprobante difiere; solicita regularización específica'; end if;
 if not public.control_es_admin_cierre() and not v_autorizado and exists(select 1 from public.obras ob where ob.id=o.obra_id
    and ob.fecha_inicio+(o.semana-1)*7+6<(now() at time zone 'America/Mexico_City')::date) then
  raise exception 'La aplicación histórica requiere aprobación administrativa de este comprobante e importe';end if;
 if v_pago is not null and exists(
   select 1 from public.control_evidencias_pago e2 join public.pagos p2 on p2.id=e2.pago_id
   join public.control_pago_aplicaciones a2 on a2.evidencia_id=e2.id and a2.retirado_en is null
   where e2.obra_id=o.obra_id and e2.trabajador_id=o.trabajador_id and e2.semana=v_sem
    and e2.importe=v_importe and p2.fecha_pago=v_fecha and e2.clave<>v_clave
 ) and not v_autorizado then raise exception 'Posible comprobante duplicado. Solicita revisión del administrador antes de sumarlo'; end if;
 insert into public.control_evidencias_pago(obra_id,trabajador_id,semana,clave,importe,pago_id,cheque_id)
 values(o.obra_id,o.trabajador_id,v_sem,v_clave,v_importe,v_pago,v_cheque)
 on conflict(obra_id,clave) do nothing;
 select * into e from public.control_evidencias_pago where obra_id=o.obra_id and clave=v_clave for update;
 select coalesce(sum(importe),0) into v_usado from public.control_pago_aplicaciones where evidencia_id=e.id and retirado_en is null;
 select o.importe-coalesce(sum(importe),0) into v_saldo from public.control_pago_aplicaciones where obligacion_id=o.id and retirado_en is null;
 if v_monto>e.importe-v_usado then raise exception 'El comprobante ya está aplicado o no tiene saldo suficiente'; end if;
 if v_monto>v_saldo then raise exception 'El importe supera el saldo pendiente de la obligación'; end if;
 insert into public.control_pago_aplicaciones(obra_id,obligacion_id,evidencia_id,version_id,importe,actor_id,clave_idempotencia,motivo)
 values(o.obra_id,o.id,e.id,o.version_id,v_monto,auth.uid(),(p->>'clave_idempotencia')::uuid,btrim(p->>'motivo')) returning id into v_id;
 if v_autorizado then update public.control_solicitudes_flujo set aplicado_en=now() where id=r.id; end if;
 perform platinum_internal.auditar(o.obra_id,'APLICAR_COMPROBANTE',v_id,jsonb_build_object('obligacion',o.id,'evidencia',e.id,'importe',v_monto,'saldo',v_saldo-v_monto));
 return jsonb_build_object('aplicacion_id',v_id,'saldo',v_saldo-v_monto,'pago_registrado',o.importe-v_saldo+v_monto);
end;$$;

create function platinum_internal.solicitar(p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare c public.control_cierres_nomina%rowtype;r uuid;t text:=p->>'tipo';
begin
 select * into c from public.control_cierres_nomina where id=(p->>'cierre_id')::uuid;
 if not found then raise exception 'Cierre no encontrado'; end if;
 perform platinum_internal.autorizar(c.obra_id,true);
 if t not in('REAPERTURA','REGULARIZACION','EVIDENCIA_DISTINTA') or length(btrim(coalesce(p->>'motivo','')))<10 then
  raise exception 'Selecciona tipo de solicitud e indica un motivo de al menos 10 caracteres'; end if;
 if t='REAPERTURA' and c.estado not in('AUTORIZADO','TIMBRADO','PAGADO') then raise exception 'Este cierre no necesita reapertura'; end if;
 insert into public.control_solicitudes_flujo(obra_id,cierre_origen,tipo,motivo,propuesta,creado_por)
 values(c.obra_id,c.id,t,btrim(p->>'motivo'),coalesce(p->'propuesta','{}'),auth.uid()) returning id into r;
 perform platinum_internal.auditar(c.obra_id,'SOLICITAR_'||t,r,jsonb_build_object('cierre_id',c.id,'motivo',p->>'motivo'));
 return jsonb_build_object('solicitud_id',r);
end;$$;

create function platinum_internal.decidir(p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r public.control_solicitudes_flujo%rowtype;c public.control_cierres_nomina%rowtype;v uuid;rev integer;ok boolean:=(p->>'aprobar')::boolean;
begin
 if not coalesce(public.control_es_admin_cierre(),false) then raise exception 'Sólo el administrador decide las solicitudes' using errcode='42501'; end if;
 select * into r from public.control_solicitudes_flujo where id=(p->>'solicitud_id')::uuid for update;
 if not found or r.estado<>'PENDIENTE' then raise exception 'Solicitud ya resuelta o no encontrada'; end if;
 perform platinum_internal.autorizar(r.obra_id,true);
 if p->>'confirmacion' is distinct from 'CONFIRMAR DECISION' then raise exception 'Falta segunda confirmación del administrador'; end if;
 if length(btrim(coalesce(p->>'nota','')))<10 then raise exception 'Documenta la decisión en al menos 10 caracteres'; end if;
 select * into c from public.control_cierres_nomina where id=r.cierre_origen;
 if c.id is null then raise exception 'El cierre fue retirado; conserva la solicitud como historial'; end if;
 perform platinum_internal.bloquear(c.obra_id,c.semana);
 update public.control_solicitudes_flujo set estado=case when ok then 'APROBADO' else 'RECHAZADO' end,
   decidido_por=auth.uid(),decidido_en=now(),nota_decision=btrim(p->>'nota') where id=r.id;
 if ok and r.tipo='REAPERTURA' then
  select * into c from public.control_cierres_nomina where id=c.id for update;
  if c.estado not in('AUTORIZADO','TIMBRADO','PAGADO') then raise exception 'El cierre cambió; solicita de nuevo'; end if;
  insert into public.control_flujo_cierres(cierre_id,obra_id) values(c.id,c.obra_id) on conflict do nothing;
  if not exists(select 1 from public.control_cierre_versiones where cierre_origen=c.id) then
   insert into public.control_cierre_versiones(cierre_origen,obra_id,version,estado_origen,snapshot,snapshot_sha256,fuente_sha256,actor_id)
   values(c.id,c.obra_id,1,'LEGADO_'||c.estado,c.snapshot,platinum_internal.huella(c.snapshot),'LEGADO_NO_RECALCULADO',auth.uid());
  end if;
  select max(version)+1 into rev from public.control_cierre_versiones where cierre_origen=c.id;
  update public.control_flujo_cierres set revision=rev,reapertura_id=r.id,sucio=true,version_id=null,
    preparado_sha256=null,fuente_sha256=null,updated_at=now() where cierre_id=c.id;
  update public.control_cierres_nomina set estado='BORRADOR' where id=c.id;
  update public.control_solicitudes_flujo set aplicado_en=now() where id=r.id;
 end if;
 perform platinum_internal.auditar(r.obra_id,case when ok then 'APROBAR_SOLICITUD' else 'RECHAZAR_SOLICITUD' end,r.id,
    jsonb_build_object('cierre',c.id,'tipo',r.tipo,'nota',p->>'nota'));
 return jsonb_build_object('solicitud_id',r.id,'estado',case when ok then 'APROBADO' else 'RECHAZADO' end);
end;$$;
create function platinum_internal.auditar(p_obra uuid,p_accion text,p_id uuid,p_detalle jsonb default '{}') returns void
language sql volatile set search_path='' as $$
 insert into public.control_bitacora(obra_id,modulo,accion,entidad_tipo,entidad_id,detalle,actor_id,actor_email)
 values(p_obra,'FLUJO_INTEGRADO',p_accion,'FLUJO',p_id,p_detalle,auth.uid(),auth.jwt()->>'email')
$$;
create function platinum_internal.fuente(p_obra uuid,p_semana integer) returns text
language sql stable set search_path='' as $$
 select platinum_internal.huella(jsonb_build_object(
  'obra',(select to_jsonb(o)-array['orden','nombre','ubicacion','activa'] from public.obras o where id=p_obra),
  'personal',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'numero',t.no_trab,'estado',t.estatus,
    'alta',t.fecha_alta,'baja',t.fecha_baja,'reingreso',t.fecha_reingreso,'periodo',t.periodo_pago,
    'sd',t.sd,'sdi',t.sdi,'sueldo',t.sal_semanal,'finiquito',t.monto_finiquito,'eliminado',t.eliminado,
    'contratista',t.contratista,'cuadrilla',t.id_cuadrilla,'metodo',t.forma_pago,'cuenta',t.cuenta,'clabe',t.clabe,'banco',t.banco)
    order by t.id) from public.trabajadores t join public.obras o on o.id=p_obra
    where t.obra_id=p_obra and(t.fecha_alta<=o.fecha_inicio+(p_semana-1)*7+6 or t.fecha_alta is null)),'[]'::jsonb),
  'descuentos',coalesce((select jsonb_agg(to_jsonb(d)-array['creado_por','actualizado_por','created_at','updated_at','ultimo_recalculo'] order by d.id)
    from public.descuentos d where d.obra_id=p_obra and(d.recurrente or public.norm_semana(d.semana)=p_semana)),'[]'::jsonb),
  'diferenciales',coalesce((select jsonb_agg(to_jsonb(d)-array['creado_por','created_at','updated_at'] order by d.id)
    from public.diferenciales d where d.obra_id=p_obra and d.semana=p_semana),'[]'::jsonb),
  'altas_cortas',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'trabajador',a.trabajador_id,'estado',a.estado_servicio) order by a.id)
    from public.control_altas_bajas_cortas a where a.obra_id=p_obra and a.semana=p_semana),'[]'::jsonb),
  'imss',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'dias',s.detalle_dias,'estado',s.estado,'descuento',s.descuento_id) order by s.id)
    from public.control_casos_imss_semanas s join public.control_casos_imss c on c.id=s.caso_id
    where c.obra_id=p_obra and s.semana=p_semana),'[]'::jsonb),
  'transferencias',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'trabajador',f.trabajador_id,'estado',f.estado,'importe',f.importe) order by f.id)
    from public.control_finiquitos_transferencia f where f.obra_id=p_obra and f.semana=p_semana),'[]'::jsonb)
 ))
$$;

-- Recibos por concepto; XML fiscal se compara por el total fiscal de la persona.
-- Ausencia de PDF no bloquea si existe NOI; un PDF presente pero ilegible sí requiere revisión.
create function platinum_internal.diagnostico(p_cierre uuid,p_trabajador uuid default null) returns jsonb language sql stable set search_path='' as $$
 with z as(select * from public.control_cierres_nomina where id=p_cierre),
 items as(select z.id,z.obra_id,z.semana,x.value it,(x.value->>'trabajador_id')::uuid tid,
    coalesce(x.value->>'tipo','NOMINA') tipo,
    round((x.value->>'monto')::numeric-case when coalesce(x.value->>'tipo','NOMINA')='NOMINA'
      then least(coalesce((x.value->>'prevision_social')::numeric,0),(x.value->>'monto')::numeric) else 0 end,2) fiscal
  from z cross join lateral jsonb_array_elements(coalesce(z.snapshot->'items','[]')) x
  where p_trabajador is null or(x.value->>'trabajador_id')::uuid=p_trabajador),
 fisc as(select tid,sum(fiscal) importe from items group by tid),
 filas as(select i.*,n.monto_noi,n.estatus,
   (select count(*) from public.control_conciliacion_noi n2 where n2.cierre_id=i.id and n2.trabajador_id=i.tid and n2.tipo_calculo=i.tipo) noi_n,
   (select count(*) from public.documentos d where d.obra_id=i.obra_id and d.trabajador_id=i.tid and public.norm_semana(d.semana)=i.semana
      and not coalesce(d.anulado,false) and d.categoria='RECIBO_NOMINA' and(d.nomina_tipo=i.tipo or d.nomina_tipo is null)) pdf_n,
   (select count(*) from public.documentos d where d.obra_id=i.obra_id and d.trabajador_id=i.tid and public.norm_semana(d.semana)=i.semana
      and not coalesce(d.anulado,false) and d.categoria='RECIBO_NOMINA' and(d.nomina_tipo=i.tipo or d.nomina_tipo is null)
      and(d.nomina_tipo is null or d.nomina_neto is null or d.nomina_neto<>i.fiscal)) pdf_pend,
   (select count(*) from public.documentos d where d.obra_id=i.obra_id and d.trabajador_id=i.tid and public.norm_semana(d.semana)=i.semana
      and not coalesce(d.anulado,false) and d.categoria='CFDI_NOMINA') xml_n,
   (select count(*) from public.documentos d where d.obra_id=i.obra_id and d.trabajador_id=i.tid and public.norm_semana(d.semana)=i.semana
      and not coalesce(d.anulado,false) and d.categoria='CFDI_NOMINA' and d.cfdi_total is null) xml_pend,
   (select sum(d.cfdi_total) from public.documentos d where d.obra_id=i.obra_id and d.trabajador_id=i.tid and public.norm_semana(d.semana)=i.semana
      and not coalesce(d.anulado,false) and d.categoria='CFDI_NOMINA') xml_total
  from items i left join public.control_conciliacion_noi n on n.cierre_id=i.id and n.trabajador_id=i.tid and n.tipo_calculo=i.tipo),
 salida as(select jsonb_build_object('trabajador_id',f.tid,'numero',f.it->'numero','nombre',f.it->>'nombre','tipo',f.tipo,
    'motor',f.fiscal,'noi',f.monto_noi,'pdf',f.pdf_n,'xml',f.xml_n,
    'estado',case when f.noi_n<>1 or f.monto_noi is null then 'FALTA_NOI'
      when f.monto_noi<>f.fiscal or f.estatus<>'COINCIDE' then 'DIFERENCIA_NOI'
      when f.pdf_pend>0 then 'REVISAR_RECIBO'
      when f.xml_n>0 and(f.xml_pend>0 or f.xml_total is null or f.xml_total<>(select importe from fisc where tid=f.tid)) then 'DIFERENCIA_XML'
      else 'COINCIDE' end) dato from filas f)
 select jsonb_build_object('filas',coalesce((select jsonb_agg(dato) from salida),'[]'::jsonb),
   'pendientes',(select count(*) from salida where dato->>'estado'<>'COINCIDE'),
   'fuera_snapshot',(select count(*) from public.control_conciliacion_noi n where n.cierre_id=p_cierre and(p_trabajador is null or n.trabajador_id=p_trabajador)
       and not exists(select 1 from items i where i.tid=n.trabajador_id and i.tipo=n.tipo_calculo)),
   'archivo_noi',(select archivo_noi from z))
$$;

create view public.control_saldos_pago with(security_invoker=true) as
select o.*,coalesce(a.aplicado,0)::numeric(14,2) pago_registrado,
 (o.importe-coalesce(a.aplicado,0))::numeric(14,2) saldo,
 coalesce(a.pendiente_entrega,0)::numeric(14,2) entrega_pendiente,
 case when coalesce(a.aplicado,0)>o.importe then 'REVISAR_EXCEDENTE'
      when o.importe=0 then 'SIN_OBLIGACION'
      when coalesce(a.aplicado,0)=0 then 'SIN_APLICAR'
      when coalesce(a.aplicado,0)<o.importe then 'PARCIAL' else 'PAGO_REGISTRADO' end estado_pago
from public.control_obligaciones_pago o left join lateral(
 select sum(p.importe) aplicado,sum(p.importe) filter(where c.estatus='EXPEDIDO') pendiente_entrega
 from public.control_pago_aplicaciones p join public.control_evidencias_pago e on e.id=p.evidencia_id
 left join public.cheques c on c.id=e.cheque_id where p.obligacion_id=o.id and p.retirado_en is null
) a on true;
revoke all on public.control_saldos_pago from public,anon,authenticated;
grant select on public.control_saldos_pago to authenticated;

create function platinum_internal.bandeja(p_obra uuid,p_semana integer default null) returns jsonb
language plpgsql stable set search_path='' as $$
begin
 if(select auth.uid()) is null then raise exception 'Inicia sesión' using errcode='42501'; end if;
 if p_obra is null and not public.control_es_admin_cierre() then raise exception 'El consolidado está reservado al administrador' using errcode='42501'; end if;
 if p_obra is not null then perform platinum_internal.autorizar(p_obra); end if;
 return jsonb_build_object('centros',coalesce((select jsonb_agg(jsonb_build_object(
  'id',o.id,'nombre',o.nombre,'empresa',o.empresa_codigo,
  'cierres_pendientes',(select count(*) from public.control_cierres_nomina c where c.obra_id=o.id and c.estado not in('PAGADO','CANCELADO') and(p_semana is null or c.semana=p_semana)),
  'diferencias_noi',(select count(*) from public.control_conciliacion_noi n join public.control_cierres_nomina c on c.id=n.cierre_id where n.obra_id=o.id and c.estado<>'CANCELADO' and n.estatus<>'COINCIDE' and(p_semana is null or c.semana=p_semana)),
  'cheques_pendientes',(select count(*) from public.cheques q where q.obra_id=o.id and not coalesce(q.eliminado,false) and q.estatus='PENDIENTE' and(p_semana is null or public.norm_semana(q.semana)=p_semana)),
  'entregas_pendientes',(select count(*) from public.cheques q where q.obra_id=o.id and not coalesce(q.eliminado,false) and q.estatus='EXPEDIDO' and(p_semana is null or public.norm_semana(q.semana)=p_semana)),
  'saldos',(select coalesce(sum(greatest(s.saldo,0)),0) from public.control_saldos_pago s where s.obra_id=o.id and s.vigente and(p_semana is null or s.semana=p_semana)),
  'solicitudes',(select count(*) from public.control_solicitudes_flujo r where r.obra_id=o.id and r.estado='PENDIENTE'),
  'movimientos_ss',(select count(*) from public.control_movimientos_seguridad_social m where m.obra_id=o.id and m.estado not in('ACEPTADO','CANCELADO')),
  'documentos_vencidos',(select count(*) from public.control_documentos_cumplimiento d where d.obra_id=o.id and d.estado_manual='VIGENTE' and d.fecha_vencimiento<(now() at time zone 'America/Mexico_City')::date),
  'expedientes_pendientes',(select count(*) from public.control_expedientes_pendientes e where e.obra_id=o.id and not e.entregado),
  'casos_imss',case when public.control_puede_ver_salud() then(select count(*) from public.control_casos_imss s where s.obra_id=o.id and s.eliminado_en is null and s.estado<>'CERRADO') else null end
 ) order by o.empresa_codigo,o.orden,o.nombre) from public.obras o where o.activa and public.app_ve_obra(o.id) and(p_obra is null or o.id=p_obra)),'[]'::jsonb),
 'solicitudes',coalesce((select jsonb_agg(to_jsonb(x)) from(select r.* from public.control_solicitudes_flujo r where public.app_ve_obra(r.obra_id) and(p_obra is null or r.obra_id=p_obra) order by r.created_at desc limit 200) x),'[]'::jsonb));
end;$$;

create function platinum_internal.detalle(p_cierre uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare c public.control_cierres_nomina%rowtype;
begin
 select * into c from public.control_cierres_nomina where id=p_cierre;
 if not found then raise exception 'Cierre no encontrado'; end if;perform platinum_internal.autorizar(c.obra_id);
 return jsonb_build_object('cierre',to_jsonb(c),'diagnostico',platinum_internal.diagnostico(c.id),
  'flujo',(select to_jsonb(f) from public.control_flujo_cierres f where f.cierre_id=c.id),
  'versiones',coalesce((select jsonb_agg(to_jsonb(v)-'snapshot' order by v.version desc) from public.control_cierre_versiones v where v.cierre_origen=c.id),'[]'::jsonb),
  'saldos',coalesce((select jsonb_agg(to_jsonb(s) order by s.numero,s.tipo) from public.control_saldos_pago s where s.obra_id=c.obra_id and s.semana=c.semana),'[]'::jsonb),
  'aplicaciones',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('pago_id',e.pago_id,'cheque_id',e.cheque_id))
    from public.control_pago_aplicaciones a join public.control_obligaciones_pago o on o.id=a.obligacion_id
    join public.control_evidencias_pago e on e.id=a.evidencia_id where o.obra_id=c.obra_id and o.semana=c.semana),'[]'::jsonb),
  'pagos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'trabajador_id',p.trabajador_id,'importe',p.importe,'estado',p.estado,'semana',p.semana,
    'fecha',p.fecha_pago,'folio',p.folio_lote,'origen',p.origen,'medio',p.medio)) from public.pagos p where p.obra_id=c.obra_id and public.norm_semana(p.semana)=c.semana),'[]'::jsonb),
  'cheques',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'trabajador_id',q.trabajador_id,'importe',q.importe,'estatus',q.estatus,'numero',q.num_cheque,
    'consecutivo',q.consecutivo,'tipo',q.tipo_pago)) from public.cheques q where q.obra_id=c.obra_id and public.norm_semana(q.semana)=c.semana and not coalesce(q.eliminado,false) and q.estatus<>'CANCELADO'),'[]'::jsonb),
  'recibos_sin_leer',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'archivo',d.archivo,'trabajador_id',d.trabajador_id,'hash',d.hash))
    from public.documentos d where d.obra_id=c.obra_id and public.norm_semana(d.semana)=c.semana and d.categoria='RECIBO_NOMINA'
      and not coalesce(d.anulado,false) and(d.nomina_neto is null or d.nomina_tipo is null)),'[]'::jsonb),
  'solicitudes',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.control_solicitudes_flujo r where r.cierre_origen=c.id),'[]'::jsonb));
end;$$;

create function platinum_internal.rpc(p_accion text,p_datos jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.control_cierres_nomina%rowtype;d public.documentos%rowtype;a public.control_pago_aplicaciones%rowtype;
 v_obra uuid;v_sem integer;v_id uuid;v_neto numeric;v_meta public.control_flujo_cierres%rowtype;v_diag jsonb;
begin
 if(select auth.uid()) is null then raise exception 'Inicia sesión para continuar' using errcode='42501'; end if;
 if p_accion='PERMISOS' then
  return jsonb_build_object('admin',public.control_es_admin_cierre(),'escritura',public.app_puede_escribir(),
   'transferencia',public.control_es_admin_cierre() or exists(select 1 from public.control_permisos_cheques pc
    where pc.user_id=auth.uid() and pc.puede_conciliar_transferencia and public.app_puede_escribir()));
 elsif p_accion='FUENTE' then
  v_obra:=(p_datos->>'obra_id')::uuid;v_sem:=(p_datos->>'semana')::integer;perform platinum_internal.autorizar(v_obra);
  if v_sem not between 1 and 53 then raise exception 'Semana inválida'; end if;
  return jsonb_build_object('fuente',platinum_internal.fuente(v_obra,v_sem));
 elsif p_accion='BANDEJA' then return platinum_internal.bandeja(nullif(p_datos->>'obra_id','')::uuid,nullif(p_datos->>'semana','')::integer);
 elsif p_accion='DETALLE' then return platinum_internal.detalle((p_datos->>'cierre_id')::uuid);
 elsif p_accion='COMPROBANTES' then
  select obra_id,trabajador_id into v_obra,v_id from public.control_obligaciones_pago where id=(p_datos->>'obligacion_id')::uuid;
  if not found then raise exception 'Obligación no encontrada';end if;
  perform platinum_internal.autorizar(v_obra);v_sem:=(p_datos->>'semana')::integer;
  if v_sem not between 1 and 53 then raise exception 'Semana inválida';end if;
  return jsonb_build_object('pagos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'trabajador_id',p.trabajador_id,'importe',p.importe,'estado',p.estado,'fecha',p.fecha_pago,'folio',p.folio_lote))
   from public.pagos p where p.obra_id=v_obra and p.trabajador_id=v_id and public.norm_semana(p.semana)=v_sem and p.estado='EXITOSO' and p.medio='TRANSFERENCIA'),'[]'::jsonb),
   'cheques',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'trabajador_id',q.trabajador_id,'importe',q.importe,'estatus',q.estatus,'numero',q.num_cheque,'tipo',q.tipo_pago))
   from public.cheques q where q.obra_id=v_obra and q.trabajador_id=v_id and public.norm_semana(q.semana)=v_sem and not coalesce(q.eliminado,false) and q.estatus in('EXPEDIDO','ENTREGADO')),'[]'::jsonb));
 elsif p_accion='PREPARAR' then return platinum_internal.preparar((p_datos->>'cierre_id')::uuid,p_datos->'snapshot',p_datos->>'fuente',nullif(p_datos->>'solicitud_id','')::uuid);
 elsif p_accion='IMPORTAR_NOI' then return platinum_internal.importar_noi((p_datos->>'cierre_id')::uuid,p_datos->'filas',p_datos->>'archivo',p_datos->>'sha256',p_datos->>'revision');
 elsif p_accion='SOLICITAR' then return platinum_internal.solicitar(p_datos);
 elsif p_accion='DECIDIR' then return platinum_internal.decidir(p_datos);
 elsif p_accion='APLICAR_PAGO' then return platinum_internal.aplicar_pago(p_datos);
 elsif p_accion='TRANSFERIR_FINIQUITO' then return platinum_internal.transferir_finiquito(p_datos);
 elsif p_accion='CREAR' then return platinum_internal.crear_cierre(p_datos);
 elsif p_accion='NETO_CHEQUE' then
  v_obra:=(p_datos->>'obra_id')::uuid;v_sem:=public.norm_semana(p_datos->>'semana');perform platinum_internal.autorizar(v_obra);
  select * into c from public.control_cierres_nomina where obra_id=v_obra and semana=v_sem and estado<>'CANCELADO' and archivo_noi is not null;
  if c.id is null then raise exception 'Importa el reporte NOI de esta semana antes de verificar el cheque';end if;
  select n.monto_noi into v_neto from public.control_conciliacion_noi n where n.cierre_id=c.id
   and n.trabajador_id=(p_datos->>'trabajador_id')::uuid and n.tipo_calculo=case when p_datos->>'tipo_pago'='FINIQUITO' then 'FINIQUITO' else 'NOMINA' end;
  if not found or coalesce(v_neto,0)<=0 then raise exception 'NOI no contiene un neto positivo de este concepto; no corresponde expedir';end if;
  return jsonb_build_object('neto',v_neto,'origen','NOI S'||v_sem||case when c.estado in('AUTORIZADO','TIMBRADO','PAGADO') then ' · versión autorizada' else ' · pendiente de autorizar' end,
   'diagnostico',platinum_internal.diagnostico(c.id,(p_datos->>'trabajador_id')::uuid));
 elsif p_accion='TRANSICION' then
  select * into c from public.control_cierres_nomina where id=(p_datos->>'cierre_id')::uuid;
  if not found then raise exception 'Cierre no encontrado'; end if;
  perform platinum_internal.autorizar(c.obra_id,true);perform platinum_internal.bloquear(c.obra_id,c.semana);
  update public.control_cierres_nomina set estado=p_datos->>'estado' where id=c.id;
  perform platinum_internal.auditar(c.obra_id,'TRANSICION',c.id,jsonb_build_object('de',c.estado,'a',p_datos->>'estado'));
  return platinum_internal.detalle(c.id);
 elsif p_accion='RECIBO' then
  select * into d from public.documentos where id=(p_datos->>'documento_id')::uuid for update;
  if not found or d.categoria<>'RECIBO_NOMINA' or coalesce(d.anulado,false) then raise exception 'Recibo activo no encontrado'; end if;
  perform platinum_internal.autorizar(d.obra_id,true);v_neto:=(p_datos->>'neto')::numeric;
  if v_neto is null or v_neto<0 or v_neto<>round(v_neto,2) or v_neto::text in('NaN','Infinity','-Infinity')
    or p_datos->>'tipo' not in('NOMINA','FINIQUITO') then raise exception 'Lectura del recibo no válida'; end if;
  if nullif(d.hash,'') is not null and p_datos->>'hash' is distinct from d.hash then raise exception 'La huella del archivo no coincide'; end if;
  if d.nomina_neto is not null and(d.nomina_neto<>v_neto or d.nomina_tipo is distinct from p_datos->>'tipo')
    and not public.control_es_admin_cierre() then raise exception 'Sólo el administrador puede corregir una lectura previa'; end if;
  update public.documentos set nomina_neto=v_neto,nomina_tipo=p_datos->>'tipo',nomina_lector='NOI_PDF_v1' where id=d.id;
  perform platinum_internal.auditar(d.obra_id,'LEER_RECIBO',d.id,jsonb_build_object('hash',d.hash,'neto',v_neto,'tipo',p_datos->>'tipo'));
  return jsonb_build_object('documento_id',d.id,'neto',v_neto);
 elsif p_accion='RETIRAR_APLICACION' then
  if not public.control_es_admin_cierre() or p_datos->>'confirmacion' is distinct from 'RETIRAR APLICACION' then raise exception 'Requiere doble confirmación del administrador' using errcode='42501'; end if;
  select * into a from public.control_pago_aplicaciones where id=(p_datos->>'aplicacion_id')::uuid for update;
  if not found or a.retirado_en is not null then raise exception 'La aplicación ya fue retirada o no existe'; end if;
  perform platinum_internal.autorizar(a.obra_id,true);
  if exists(select 1 from public.control_obligaciones_pago o join public.control_cierres_nomina c on c.id=o.cierre_id
    where o.id=a.obligacion_id and c.estado='PAGADO') then raise exception 'Solicita reapertura del cierre pagado antes de retirar aplicaciones';end if;
  if length(btrim(coalesce(p_datos->>'motivo','')))<10 then raise exception 'Describe el motivo'; end if;
  update public.control_pago_aplicaciones set retirado_en=now(),retirado_por=auth.uid(),motivo_retiro=p_datos->>'motivo' where id=a.id;
  perform platinum_internal.auditar(a.obra_id,'RETIRAR_APLICACION',a.id,jsonb_build_object('motivo',p_datos->>'motivo','importe',a.importe));
  return jsonb_build_object('aplicacion_id',a.id,'retirada',true);
 elsif p_accion='ADOPTAR_LEGADO' then
  select * into c from public.control_cierres_nomina where id=(p_datos->>'cierre_id')::uuid;
  if not found then raise exception 'Cierre no encontrado'; end if;
  perform platinum_internal.autorizar(c.obra_id,true);perform platinum_internal.bloquear(c.obra_id,c.semana);
  if not public.control_es_admin_cierre() or p_datos->>'confirmacion' is distinct from 'ADOPTAR S'||c.semana::text then
   raise exception 'La adopción histórica requiere doble confirmación administrativa' using errcode='42501'; end if;
  if c.estado not in('AUTORIZADO','TIMBRADO','PAGADO') or exists(select 1 from public.control_flujo_cierres f where f.cierre_id=c.id and f.version_id is not null) then
   raise exception 'El cierre no es un legado autorizado pendiente de adoptar'; end if;
  v_diag:=platinum_internal.diagnostico(c.id);
  if(v_diag->>'pendientes')::integer>0 or(v_diag->>'fuera_snapshot')::integer>0 or nullif(v_diag->>'archivo_noi','') is null then
   raise exception 'Conciliar NOI y recibos antes de adoptar el cierre histórico'; end if;
  if length(btrim(coalesce(p_datos->>'motivo','')))<10 then raise exception 'Documenta la revisión histórica'; end if;
  insert into public.control_flujo_cierres(cierre_id,obra_id,sucio,fuente_sha256,preparado_sha256)
   values(c.id,c.obra_id,false,'LEGADO_VERIFICADO',platinum_internal.huella(c.snapshot)) on conflict do nothing;
  v_id:=platinum_internal.sellar(c.id,'LEGADO_VERIFICADO_'||c.estado);
  perform platinum_internal.auditar(c.obra_id,'ADOPTAR_LEGADO',c.id,jsonb_build_object('motivo',p_datos->>'motivo','version',v_id));
  return jsonb_build_object('version_id',v_id);
 elsif p_accion='VERSIONES_EXPORTACION' then
  v_sem:=(p_datos->>'semana')::integer;
  if v_sem not between 1 and 53 or jsonb_typeof(p_datos->'obras') is distinct from 'array' then raise exception 'Alcance de exportación inválido'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_datos->'obras') o where not public.app_ve_obra(o::uuid)) then raise exception 'Centro no autorizado' using errcode='42501'; end if;
  return jsonb_build_object('cierres',coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'obra_id',z.obra_id,'periodo',z.periodo,'estado',z.estado,
    'revision',f.revision,'sucio',f.sucio,'version_id',f.version_id,'snapshot',v.snapshot,
    'transferencias',coalesce((select jsonb_agg(ft.trabajador_id) from public.control_finiquitos_transferencia ft where ft.obra_id=z.obra_id and ft.semana=z.semana),'[]'::jsonb)))
   from public.control_cierres_nomina z left join public.control_flujo_cierres f on f.cierre_id=z.id
   left join public.control_cierre_versiones v on v.id=f.version_id where z.semana=v_sem and z.estado<>'CANCELADO'
    and z.obra_id in(select value::uuid from jsonb_array_elements_text(p_datos->'obras'))),'[]'::jsonb));
 else raise exception 'Operación de flujo no reconocida';
 end if;
end;$$;

create function public.control_flujo_operar(p_accion text,p_datos jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select platinum_internal.rpc(p_accion,p_datos)$$;
revoke all on all functions in schema platinum_internal from public,anon,authenticated;
grant execute on function platinum_internal.rpc(text,jsonb) to authenticated;
revoke all on function public.control_flujo_operar(text,jsonb) from public,anon;
grant execute on function public.control_flujo_operar(text,jsonb) to authenticated;

create function platinum_internal.preparar(p_cierre uuid,p_snapshot jsonb,p_fuente text,p_solicitud uuid default null)
returns jsonb language plpgsql set search_path='' as $$
declare c public.control_cierres_nomina%rowtype; x jsonb; m numeric; p numeric; n integer; fuente_actual text; s public.control_solicitudes_flujo%rowtype;
begin
 select * into c from public.control_cierres_nomina where id=p_cierre;
 if not found then raise exception 'Cierre no encontrado'; end if;
 perform platinum_internal.autorizar(c.obra_id,true);perform platinum_internal.bloquear(c.obra_id,c.semana);
 select * into c from public.control_cierres_nomina where id=p_cierre for update;
 if c.estado not in('BORRADOR','REVISADO') then raise exception 'Solicita reapertura antes de modificar una semana autorizada'; end if;
 if p_snapshot->>'obra_id' is distinct from c.obra_id::text or(p_snapshot->>'semana')::integer<>c.semana
    or p_snapshot->>'periodo' is distinct from c.periodo or jsonb_typeof(p_snapshot->'items') is distinct from 'array' then
  raise exception 'La fotografía no corresponde al centro, semana o periodo';
 end if;
 n:=jsonb_array_length(p_snapshot->'items');
 if p_snapshot->>'desde' is distinct from(select (fecha_inicio+(c.semana-1)*7)::text from public.obras where id=c.obra_id)
   or p_snapshot->>'hasta' is distinct from(select (fecha_inicio+(c.semana-1)*7+6)::text from public.obras where id=c.obra_id) then
  raise exception 'Las fechas de la fotografía no corresponden a la semana del centro';end if;
 if n=0 or n<>(select count(distinct((i->>'trabajador_id'),coalesce(i->>'tipo','NOMINA'))) from jsonb_array_elements(p_snapshot->'items') i) then
  raise exception 'La fotografía está vacía o repite obligaciones del mismo concepto';
 end if;
 for x in select value from jsonb_array_elements(p_snapshot->'items') loop
  m:=(x->>'monto')::numeric;p:=coalesce((x->>'prevision_social')::numeric,0);
  if m is null or m<0 or m<>round(m,2) or m::text in('NaN','Infinity','-Infinity') or p<0
     or coalesce(x->>'tipo','NOMINA') not in('NOMINA','FINIQUITO') then raise exception 'Importe o concepto inválido en fotografía'; end if;
  if not exists(select 1 from public.trabajadores t where t.id=(x->>'trabajador_id')::uuid
    and(t.obra_id=c.obra_id or exists(select 1 from jsonb_array_elements(c.snapshot->'items') oldi where oldi->>'trabajador_id'=t.id::text))) then
   raise exception 'Trabajador fuera del alcance de la fotografía';
  end if;
 end loop;
 if(p_snapshot->>'total_neto')::numeric is distinct from(select sum((i->>'monto')::numeric) from jsonb_array_elements(p_snapshot->'items') i)
    or(p_snapshot->>'total_trabajadores')::integer<>n then raise exception 'Totales de fotografía inconsistentes'; end if;
 if jsonb_typeof(p_snapshot->'modelo'->'filas') is distinct from 'array'
    or jsonb_array_length(p_snapshot->'modelo'->'filas')<>n
    or exists(select 1 from jsonb_array_elements(p_snapshot->'items') i where not exists(
     select 1 from jsonb_array_elements(p_snapshot->'modelo'->'filas') f
     where f->'w'->>'id'=i->>'trabajador_id' and coalesce((f->>'fin')::boolean,false)=(i->>'tipo'='FINIQUITO')
       and(f->>'neto')::numeric=(i->>'monto')::numeric and f->'w'->>'obra_id'=c.obra_id::text)) then
  raise exception 'El modelo de exportación no coincide con la fotografía monetaria'; end if;
 fuente_actual:=platinum_internal.fuente(c.obra_id,c.semana);
 if p_snapshot->>'empresa_codigo' is distinct from(select empresa_codigo from public.obras where id=c.obra_id) then raise exception 'La razón social no coincide con el centro';end if;
 if p_fuente is distinct from fuente_actual then raise exception 'Las fuentes cambiaron durante el cálculo. Actualiza y vuelve a preparar'; end if;
 if exists(select 1 from public.obras o where o.id=c.obra_id and o.fecha_inicio+(c.semana-1)*7+6<(now() at time zone 'America/Mexico_City')::date)
   and p_snapshot is distinct from c.snapshot
   and not exists(select 1 from public.control_flujo_cierres fc join public.control_solicitudes_flujo r on r.id=fc.reapertura_id
      where fc.cierre_id=c.id and r.estado='APROBADO' and r.tipo='REAPERTURA') then
  select * into s from public.control_solicitudes_flujo where id=p_solicitud and cierre_origen=c.id and tipo='REGULARIZACION'
    and estado='APROBADO' and aplicado_en is null for update;
  if not found or platinum_internal.huella(s.propuesta->'snapshot')<>platinum_internal.huella(p_snapshot) then
   raise exception 'La regularización histórica requiere vista previa y aprobación de esta fotografía exacta';
  end if;
  update public.control_solicitudes_flujo set aplicado_en=now() where id=s.id;
 end if;
 insert into public.control_flujo_cierres(cierre_id,obra_id,fuente_sha256,preparado_sha256,sucio,preparado_por,preparado_en)
 values(c.id,c.obra_id,fuente_actual,platinum_internal.huella(p_snapshot),false,auth.uid(),now())
 on conflict(cierre_id) do update set fuente_sha256=excluded.fuente_sha256,preparado_sha256=excluded.preparado_sha256,
   sucio=false,preparado_por=excluded.preparado_por,preparado_en=now(),updated_at=now();
 update public.control_cierres_nomina set estado='BORRADOR',snapshot=p_snapshot,snapshot_sha256=platinum_internal.huella(p_snapshot),
    total_nomina=(p_snapshot->>'total_nomina')::numeric,total_prevision=(p_snapshot->>'total_prevision')::numeric,
    total_retenciones=(p_snapshot->>'total_retenciones')::numeric,total_finiquitos=(p_snapshot->>'total_finiquitos')::numeric,
    total_neto=(p_snapshot->>'total_neto')::numeric,total_trabajadores=n,formula_version=p_snapshot->>'formula_version'
 where id=c.id;
 -- El NOI importado se conserva; se vuelve a contrastar contra la nueva fotografía.
 update public.control_conciliacion_noi q set monto_platinum=(
    select round((i->>'monto')::numeric-case when coalesce(i->>'tipo','NOMINA')='NOMINA'
      then least(coalesce((i->>'prevision_social')::numeric,0),(i->>'monto')::numeric) else 0 end,2)
    from jsonb_array_elements(p_snapshot->'items') i where i->>'trabajador_id'=q.trabajador_id::text and coalesce(i->>'tipo','NOMINA')=q.tipo_calculo)
 where q.cierre_id=c.id;
 perform platinum_internal.auditar(c.obra_id,'PREPARAR_VERSION',c.id,jsonb_build_object('fuente',fuente_actual,'snapshot',platinum_internal.huella(p_snapshot)));
 return jsonb_build_object('cierre_id',c.id,'fuente',fuente_actual,'snapshot',platinum_internal.huella(p_snapshot));
end;$$;

create function platinum_internal.importar_noi(p_cierre uuid,p_filas jsonb,p_archivo text,p_sha text,p_revision text)
returns jsonb language plpgsql set search_path='' as $$
declare c public.control_cierres_nomina%rowtype;x jsonb; motor numeric; n integer:=0;
begin
 select * into c from public.control_cierres_nomina where id=p_cierre;
 if not found then raise exception 'Cierre no encontrado'; end if;
 perform platinum_internal.autorizar(c.obra_id,true);perform platinum_internal.bloquear(c.obra_id,c.semana);
 select * into c from public.control_cierres_nomina where id=p_cierre for update;
 if c.estado not in('BORRADOR','REVISADO') then raise exception 'Solicita reapertura antes de reemplazar el NOI'; end if;
 if p_revision is distinct from c.snapshot_sha256 then raise exception 'La fotografía cambió desde que se leyó NOI. Vuelve a importar'; end if;
 if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas)=0 or length(coalesce(p_sha,''))<>64 or nullif(btrim(p_archivo),'') is null then
  raise exception 'Archivo, huella o filas NOI inválidos'; end if;
 if exists(select 1 from jsonb_array_elements(p_filas) f group by f->>'trabajador_numero',f->>'tipo_calculo' having count(*)>1) then
  raise exception 'NOI repite trabajador y concepto'; end if;
 delete from public.control_conciliacion_noi where cierre_id=c.id;
 for x in select value from jsonb_array_elements(p_filas) loop
  if(x->>'monto_noi')::numeric<0 or(x->>'monto_noi')::numeric<>round((x->>'monto_noi')::numeric,2)
    or(x->>'monto_noi')::numeric::text in('NaN','Infinity','-Infinity') then raise exception 'Neto NOI inválido'; end if;
  motor:=null;
  select round((i->>'monto')::numeric-case when coalesce(i->>'tipo','NOMINA')='NOMINA'
    then least(coalesce((i->>'prevision_social')::numeric,0),(i->>'monto')::numeric) else 0 end,2) into motor
   from jsonb_array_elements(c.snapshot->'items') i where i->>'trabajador_id'=x->>'trabajador_id'
    and coalesce(i->>'tipo','NOMINA')=coalesce(x->>'tipo_calculo','NOMINA') and(i->>'numero')::integer=(x->>'trabajador_numero')::integer;
  insert into public.control_conciliacion_noi(obra_id,cierre_id,trabajador_id,trabajador_numero,trabajador_nombre,tipo_calculo,metodo_pago,monto_platinum,monto_noi,detalle,importado_por_email)
  values(c.obra_id,c.id,case when motor is not null then nullif(x->>'trabajador_id','')::uuid else null end,(x->>'trabajador_numero')::integer,
    coalesce(x->>'trabajador_nombre','SIN NOMBRE'),coalesce(x->>'tipo_calculo','NOMINA'),case when x->>'metodo_pago'='POR DEFINIR' then 'CHEQUE' else coalesce(x->>'metodo_pago','TRANSFERENCIA') end,
    motor,(x->>'monto_noi')::numeric,coalesce(x->'detalle','{}'),auth.jwt()->>'email');n:=n+1;
 end loop;
 update public.control_cierres_nomina set archivo_noi=p_archivo,archivo_noi_sha256=p_sha where id=c.id;
 perform platinum_internal.auditar(c.obra_id,'IMPORTAR_NOI_ATOMICO',c.id,jsonb_build_object('archivo',p_archivo,'sha256',p_sha,'filas',n));
 return jsonb_build_object('filas',n,'diagnostico',platinum_internal.diagnostico(c.id));
end;$$;

create function platinum_internal.sellar(p_cierre uuid,p_estado text default 'AUTORIZADO') returns uuid
language plpgsql set search_path='' as $$
declare c public.control_cierres_nomina%rowtype;fc public.control_flujo_cierres%rowtype;v uuid;x jsonb;k text;a numeric;prev numeric;met text;w jsonb;
begin
 select * into c from public.control_cierres_nomina where id=p_cierre;
 select * into fc from public.control_flujo_cierres where cierre_id=p_cierre for update;
 if not found then raise exception 'Primero prepara la versión integrada'; end if;
 insert into public.control_cierre_versiones(cierre_origen,obra_id,version,estado_origen,snapshot,snapshot_sha256,fuente_sha256,actor_id)
 values(c.id,c.obra_id,fc.revision,p_estado,c.snapshot,platinum_internal.huella(c.snapshot),coalesce(fc.fuente_sha256,'LEGADO'),auth.uid())
 returning id into v;
 -- Una nueva aprobación no borra aplicaciones previas; un excedente permanece visible como tal.
 update public.control_obligaciones_pago set importe=0,version_id=v,vigente=true,cierre_origen=c.id,cierre_id=c.id,updated_at=now() where obra_id=c.obra_id and semana=c.semana;
 for x in select value from jsonb_array_elements(c.snapshot->'items') loop
  k:=coalesce(x->>'tipo','NOMINA');prev:=case when k='NOMINA' then least(coalesce((x->>'prevision_social')::numeric,0),(x->>'monto')::numeric) else 0 end;
  a:=(x->>'monto')::numeric-prev;met:=coalesce(x->>'metodo_pago',case when k='FINIQUITO' then 'CHEQUE' else 'TRANSFERENCIA' end);
  w:=null;select f->'w' into w from jsonb_array_elements(coalesce(c.snapshot->'modelo'->'filas','[]')) f where f->'w'->>'id'=x->>'trabajador_id' limit 1;
  insert into public.control_obligaciones_pago(cierre_origen,cierre_id,version_id,obra_id,trabajador_id,semana,tipo,numero,nombre,contratista,importe,metodo)
  values(c.id,c.id,v,c.obra_id,(x->>'trabajador_id')::uuid,c.semana,k,(x->>'numero')::integer,x->>'nombre',coalesce(w->>'contratista',''),a,met)
  on conflict(obra_id,semana,trabajador_id,tipo) do update set cierre_origen=excluded.cierre_origen,cierre_id=excluded.cierre_id,version_id=v,vigente=true,
    importe=excluded.importe,metodo=excluded.metodo,numero=excluded.numero,nombre=excluded.nombre,contratista=excluded.contratista,updated_at=now();
  if prev>0 then
   insert into public.control_obligaciones_pago(cierre_origen,cierre_id,version_id,obra_id,trabajador_id,semana,tipo,numero,nombre,contratista,importe,metodo)
   values(c.id,c.id,v,c.obra_id,(x->>'trabajador_id')::uuid,c.semana,'PREVISION_SOCIAL',(x->>'numero')::integer,x->>'nombre',coalesce(w->>'contratista',''),prev,met)
   on conflict(obra_id,semana,trabajador_id,tipo) do update set cierre_origen=excluded.cierre_origen,cierre_id=excluded.cierre_id,version_id=v,vigente=true,importe=excluded.importe,metodo=excluded.metodo,updated_at=now();
  end if;
 end loop;
 update public.control_flujo_cierres set version_id=v,sucio=false,updated_at=now() where cierre_id=c.id;
 perform platinum_internal.auditar(c.obra_id,'SELLAR_VERSION',c.id,jsonb_build_object('version_id',v,'revision',fc.revision,'sha256',platinum_internal.huella(c.snapshot)));
 return v;
end;$$;

-- Las funciones auxiliares privadas no son una API alternativa a la RPC validada.
revoke all on all functions in schema platinum_internal from public,anon,authenticated;
grant execute on function platinum_internal.rpc(text,jsonb) to authenticated;
