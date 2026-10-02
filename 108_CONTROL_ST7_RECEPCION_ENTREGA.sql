-- Control interno del ST-7. No sustituye el formato ni los acuses oficiales.
create table if not exists public.control_st7_acuses (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id),
  trabajador_id uuid not null references public.trabajadores(id),
  incidente_id uuid references public.control_incidentes_laborales(id),
  caso_imss_id uuid references public.control_casos_imss(id),
  folio_st7 text not null check (length(btrim(folio_st7)) between 1 and 80),
  accidente_en_centro boolean,
  accidente_en timestamptz,
  recibido_en timestamptz not null,
  recibido_de text not null check (length(btrim(recibido_de)) between 2 and 160),
  recibido_por text not null check (length(btrim(recibido_por)) between 2 and 160),
  registrado_en timestamptz not null default now(),
  registrado_por uuid not null default auth.uid(),
  devuelto_en timestamptz,
  devuelto_a text,
  devuelto_por text,
  devolucion_registrada_en timestamptz,
  aviso_imss_en timestamptz,
  aviso_stps_en timestamptz,
  acuse_firmado_archivo text,
  observaciones text,
  constraint control_st7_devolucion_completa_ck check (
    (devuelto_en is null and devuelto_a is null and devuelto_por is null and devolucion_registrada_en is null)
    or (devuelto_en is not null and nullif(btrim(devuelto_a),'') is not null
        and nullif(btrim(devuelto_por),'') is not null and devolucion_registrada_en is not null
        and devuelto_en >= recibido_en)
  ),
  constraint control_st7_archivo_ruta_ck check (
    acuse_firmado_archivo is null or (
      split_part(acuse_firmado_archivo,'/',1)=obra_id::text
      and split_part(acuse_firmado_archivo,'/',2)=trabajador_id::text
      and split_part(acuse_firmado_archivo,'/',3)=id::text
      and acuse_firmado_archivo ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|pdf)$'
    )
  )
);
create unique index if not exists control_st7_obra_folio_uk
  on public.control_st7_acuses(obra_id,lower(btrim(folio_st7)));
create index if not exists control_st7_obra_recibido_idx
  on public.control_st7_acuses(obra_id,recibido_en desc);
create index if not exists control_st7_trabajador_idx
  on public.control_st7_acuses(trabajador_id);

create or replace function public.control_st7_integridad()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.trabajadores t where t.id=new.trabajador_id and t.obra_id=new.obra_id) then
    raise exception 'El trabajador no pertenece al centro del ST-7';
  end if;
  if new.incidente_id is not null and not exists (
    select 1 from public.control_incidentes_laborales i where i.id=new.incidente_id
      and i.obra_id=new.obra_id and i.trabajador_id=new.trabajador_id) then
    raise exception 'El incidente no corresponde al trabajador y centro';
  end if;
  if new.caso_imss_id is not null and not exists (
    select 1 from public.control_casos_imss c where c.id=new.caso_imss_id
      and c.obra_id=new.obra_id and c.trabajador_id=new.trabajador_id and c.eliminado_en is null) then
    raise exception 'El caso IMSS no corresponde al trabajador y centro';
  end if;
  if new.recibido_en > now() + interval '5 minutes' or new.devuelto_en > now() + interval '5 minutes' then
    raise exception 'La fecha del ST-7 no puede ser futura';
  end if;
  if tg_op='INSERT' then
    if new.devuelto_en is not null or new.aviso_imss_en is not null or new.aviso_stps_en is not null or new.acuse_firmado_archivo is not null then
      raise exception 'Registre primero la recepción; los actos siguientes se capturan por separado';
    end if;
    new.registrado_en=now(); new.registrado_por=auth.uid();
  else
    if (to_jsonb(new) - array['devuelto_en','devuelto_a','devuelto_por','devolucion_registrada_en','aviso_imss_en','aviso_stps_en','acuse_firmado_archivo'])
       is distinct from
       (to_jsonb(old) - array['devuelto_en','devuelto_a','devuelto_por','devolucion_registrada_en','aviso_imss_en','aviso_stps_en','acuse_firmado_archivo']) then
      raise exception 'Los datos de recepción son inmutables; registre un nuevo expediente si hubo un error';
    end if;
    if old.devuelto_en is not null and (new.devuelto_en,new.devuelto_a,new.devuelto_por,new.devolucion_registrada_en)
       is distinct from (old.devuelto_en,old.devuelto_a,old.devuelto_por,old.devolucion_registrada_en) then
      raise exception 'La devolución ya registrada no se puede alterar';
    end if;
    if old.aviso_imss_en is not null and new.aviso_imss_en is distinct from old.aviso_imss_en then
      raise exception 'El aviso IMSS ya registrado no se puede alterar';
    end if;
    if old.aviso_stps_en is not null and new.aviso_stps_en is distinct from old.aviso_stps_en then
      raise exception 'El aviso STPS ya registrado no se puede alterar';
    end if;
    if old.acuse_firmado_archivo is not null and new.acuse_firmado_archivo is distinct from old.acuse_firmado_archivo then
      raise exception 'El acuse firmado archivado no se puede reemplazar';
    end if;
    if old.devuelto_en is null and new.devuelto_en is not null then new.devolucion_registrada_en=now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists control_st7_integridad_trg on public.control_st7_acuses;
create trigger control_st7_integridad_trg before insert or update on public.control_st7_acuses
  for each row execute function public.control_st7_integridad();

alter table public.control_st7_acuses enable row level security;
create policy control_st7_select on public.control_st7_acuses for select to authenticated
  using ((select public.control_puede_ver_salud()) and (select public.app_ve_obra(obra_id)));
create policy control_st7_insert on public.control_st7_acuses for insert to authenticated
  with check ((select public.control_puede_ver_salud()) and (select public.app_puede_escribir())
    and (select public.app_ve_obra(obra_id)) and registrado_por=(select auth.uid()));
create policy control_st7_update on public.control_st7_acuses for update to authenticated
  using ((select public.control_puede_ver_salud()) and (select public.app_puede_escribir())
    and (select public.app_ve_obra(obra_id)))
  with check ((select public.control_puede_ver_salud()) and (select public.app_puede_escribir())
    and (select public.app_ve_obra(obra_id)));
-- Sin política DELETE: los registros de recepción y entrega no se borran.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('st7-expedientes','st7-expedientes',false,8388608,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=8388608,
  allowed_mime_types=excluded.allowed_mime_types;
create policy st7_archivos_select on storage.objects for select to authenticated using (
  case when bucket_id='st7-expedientes' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|pdf)$'
  then (select public.control_puede_ver_salud())
    and (select public.app_ve_obra((split_part(name,'/',1))::uuid))
    and exists (select 1 from public.control_st7_acuses s
      where s.id=(split_part(name,'/',3))::uuid and s.obra_id=(split_part(name,'/',1))::uuid
      and s.trabajador_id=(split_part(name,'/',2))::uuid)
  else false end);
create policy st7_archivos_insert on storage.objects for insert to authenticated with check (
  case when bucket_id='st7-expedientes' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|pdf)$'
  then (select public.control_puede_ver_salud()) and (select public.app_puede_escribir())
    and (select public.app_ve_obra((split_part(name,'/',1))::uuid))
    and exists (select 1 from public.control_st7_acuses s
      where s.id=(split_part(name,'/',3))::uuid and s.obra_id=(split_part(name,'/',1))::uuid
      and s.trabajador_id=(split_part(name,'/',2))::uuid and s.acuse_firmado_archivo is null)
  else false end);
notify pgrst,'reload schema';

