-- Guardas compartidas: también se ejecutan si una pantalla antigua intenta escribir por REST.
CREATE OR REPLACE FUNCTION public.control_transicion_cierre()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_actor uuid := (select auth.uid()); v_email text := coalesce(auth.jwt()->>'email',''); v_total int; v_pend int;
begin
  if new.obra_id is distinct from old.obra_id or new.semana is distinct from old.semana
     or new.periodo is distinct from old.periodo or new.creado_por is distinct from old.creado_por
     or new.created_at is distinct from old.created_at then
    raise exception 'La identidad y autoría del cierre son inmutables';
  end if;
  if new.estado is not distinct from old.estado and (
     new.revisado_por is distinct from old.revisado_por or new.autorizado_por is distinct from old.autorizado_por
     or new.timbrado_por is distinct from old.timbrado_por or new.pagado_por is distinct from old.pagado_por) then
    raise exception 'Los responsables de cada etapa solo se asignan mediante una transición válida';
  end if;
  if old.estado in ('AUTORIZADO','TIMBRADO','PAGADO','CANCELADO') then
    if new.snapshot is distinct from old.snapshot or new.snapshot_sha256 is distinct from old.snapshot_sha256
       or new.total_nomina is distinct from old.total_nomina or new.total_prevision is distinct from old.total_prevision
       or new.total_retenciones is distinct from old.total_retenciones or new.total_finiquitos is distinct from old.total_finiquitos
       or new.total_neto is distinct from old.total_neto or new.total_trabajadores is distinct from old.total_trabajadores then
      raise exception 'El cierre ya está bloqueado; sus importes y snapshot son inmutables';
    end if;
  end if;
  if new.estado is distinct from old.estado and new.estado in ('AUTORIZADO','CANCELADO')
     and not (select public.control_es_admin_cierre()) then
    raise exception 'Solo el administrador puede autorizar o cancelar un cierre' using errcode='42501';
  end if;
  if new.estado is distinct from old.estado then
    if not (
      (old.estado='BORRADOR' and new.estado in ('REVISADO','CANCELADO')) or
      (old.estado='REVISADO' and new.estado in ('BORRADOR','AUTORIZADO','CANCELADO')) or
      (old.estado='AUTORIZADO' and new.estado in ('TIMBRADO','CANCELADO')) or
      (old.estado='TIMBRADO' and new.estado='PAGADO') or
      (old.estado in ('AUTORIZADO','TIMBRADO','PAGADO') and new.estado='BORRADOR' and exists(
        select 1 from public.control_flujo_cierres f join public.control_solicitudes_flujo r on r.id=f.reapertura_id
        where f.cierre_id=old.id and r.cierre_origen=old.id and r.tipo='REAPERTURA'
          and r.estado='APROBADO' and r.aplicado_en is null and r.decidido_por=(select auth.uid())
          and (select public.control_es_admin_cierre())))
    ) then raise exception 'Transición de cierre no permitida: % a %',old.estado,new.estado; end if;
    if new.estado='REVISADO' then
      if new.snapshot='{}'::jsonb or length(new.snapshot_sha256)<32 then raise exception 'El cierre requiere snapshot y huella antes de revisión'; end if;
      new.revisado_por=v_actor; new.revisado_por_email=v_email; new.revisado_en=now();
    elsif new.estado='AUTORIZADO' then
      if old.revisado_por is null or old.revisado_por=v_actor then raise exception 'La autorización requiere una segunda persona distinta de quien revisó'; end if;
      select count(*), count(*) filter(where estatus<>'COINCIDE') into v_total,v_pend
        from public.control_conciliacion_noi where cierre_id=old.id;
      if v_total=0 then raise exception 'Importa y concilia el reporte final de NOI antes de autorizar'; end if;
      if v_pend>0 then raise exception 'Existen % diferencias o trabajadores sin conciliar contra NOI',v_pend; end if;
      new.autorizado_por=v_actor; new.autorizado_por_email=v_email; new.autorizado_en=now(); new.bloqueado_en=now();
    elsif new.estado='TIMBRADO' then
      new.timbrado_por=v_actor; new.timbrado_por_email=v_email; new.timbrado_en=now();
    elsif new.estado='PAGADO' then
      new.pagado_por=v_actor; new.pagado_por_email=v_email; new.pagado_en=now();
    end if;
  end if;
  new.updated_at=now();
  return new;
end;
$function$;

create function platinum_internal.validar_cierre() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.control_flujo_cierres%rowtype;d jsonb;r public.control_solicitudes_flujo%rowtype;
begin
 perform platinum_internal.autorizar(old.obra_id,true);perform platinum_internal.bloquear(old.obra_id,old.semana);
 select * into f from public.control_flujo_cierres where cierre_id=old.id;
 if new.estado='BORRADOR' and old.estado in('AUTORIZADO','TIMBRADO','PAGADO') then
  select * into r from public.control_solicitudes_flujo where id=f.reapertura_id and cierre_origen=old.id
    and tipo='REAPERTURA' and estado='APROBADO' and aplicado_en is null and decidido_por=auth.uid();
  if r.id is null or not public.control_es_admin_cierre() then raise exception 'La reapertura requiere solicitud aprobada por el administrador'; end if;
  new.revisado_por:=null;new.revisado_por_email:=null;new.revisado_en:=null;
  new.autorizado_por:=null;new.autorizado_por_email:=null;new.autorizado_en:=null;new.bloqueado_en:=null;
  new.timbrado_por:=null;new.timbrado_por_email:=null;new.timbrado_en:=null;
  new.pagado_por:=null;new.pagado_por_email:=null;new.pagado_en:=null;
 end if;
 if old.estado in('AUTORIZADO','TIMBRADO','PAGADO','CANCELADO') and
   (new.archivo_noi,new.archivo_noi_sha256) is distinct from(old.archivo_noi,old.archivo_noi_sha256) then
  raise exception 'El NOI de la versión autorizada es inmutable. Solicita reapertura'; end if;
 if new.estado=old.estado and
   (new.revisado_por_email,new.revisado_en,new.autorizado_por_email,new.autorizado_en,new.timbrado_por_email,new.timbrado_en,new.pagado_por_email,new.pagado_en,new.bloqueado_en)
   is distinct from(old.revisado_por_email,old.revisado_en,old.autorizado_por_email,old.autorizado_en,old.timbrado_por_email,old.timbrado_en,old.pagado_por_email,old.pagado_en,old.bloqueado_en) then
  raise exception 'Las firmas y fechas de aprobación sólo cambian con una transición validada'; end if;
 if old.estado in('BORRADOR','REVISADO') and
   (new.snapshot,new.snapshot_sha256,new.total_neto,new.total_trabajadores,new.total_nomina,new.total_prevision,new.total_retenciones,new.total_finiquitos)
   is distinct from(old.snapshot,old.snapshot_sha256,old.total_neto,old.total_trabajadores,old.total_nomina,old.total_prevision,old.total_retenciones,old.total_finiquitos) then
  if f.cierre_id is null or f.preparado_sha256 is distinct from platinum_internal.huella(new.snapshot)
     or f.preparado_por is distinct from auth.uid() then raise exception 'Prepara la fotografía desde el flujo integrado'; end if;
 end if;
 if new.estado is distinct from old.estado and new.estado in('REVISADO','AUTORIZADO') then
  if f.cierre_id is null or f.sucio or f.preparado_sha256 is distinct from platinum_internal.huella(new.snapshot)
     or f.fuente_sha256 is distinct from platinum_internal.fuente(new.obra_id,new.semana) then
   raise exception 'La nómina cambió o no fue preparada. Actualiza la fotografía y vuelve a conciliar'; end if;
  if new.estado='AUTORIZADO' then
   if not public.control_es_admin_cierre() then raise exception 'Sólo el administrador autoriza' using errcode='42501'; end if;
   d:=platinum_internal.diagnostico(old.id);
   if nullif(d->>'archivo_noi','') is null or(d->>'pendientes')::integer<>0 or(d->>'fuera_snapshot')::integer<>0 then
    raise exception 'Autorización bloqueada: faltan datos o hay diferencias entre motor, NOI y recibos'; end if;
  end if;
 end if;
 if new.estado is distinct from old.estado and new.estado in('TIMBRADO','PAGADO') then
  if f.version_id is null or f.sucio then raise exception 'Adopta o autoriza la versión integrada antes de continuar'; end if;
  d:=platinum_internal.diagnostico(old.id);
  if(d->>'pendientes')::integer<>0 or(d->>'fuera_snapshot')::integer<>0 then raise exception 'Existen diferencias pendientes de conciliación'; end if;
  if new.estado='TIMBRADO' and exists(select 1 from jsonb_array_elements(d->'filas') x where(x->>'motor')::numeric>0 and(x->>'xml')::integer=0) then
   raise exception 'No se puede marcar timbrado: faltan CFDI XML de la semana'; end if;
  if new.estado='PAGADO' and(not exists(select 1 from public.control_obligaciones_pago o where o.cierre_id=old.id)
      or exists(select 1 from public.control_saldos_pago s where s.cierre_id=old.id and s.saldo<>0)) then
   raise exception 'No se puede marcar pagado: existen saldos o excedentes sin resolver'; end if;
 end if;
 return new;
end;$$;
create trigger a_control_flujo_guard before update on public.control_cierres_nomina for each row execute function platinum_internal.validar_cierre();
create function platinum_internal.sellar_cierre_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.estado='AUTORIZADO' and old.estado<>'AUTORIZADO' then perform platinum_internal.sellar(new.id); end if;
 return new;
end;$$;
create trigger z_control_flujo_sellar after update on public.control_cierres_nomina for each row execute function platinum_internal.sellar_cierre_trigger();

create function platinum_internal.archivar_obligaciones() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.control_obligaciones_pago set vigente=false,updated_at=now() where cierre_id=old.id;
 return old;
end;$$;
create trigger a_control_archivar_obligaciones before delete on public.control_cierres_nomina for each row execute function platinum_internal.archivar_obligaciones();

create function platinum_internal.guardar_fuente() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 antes jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 o uuid;old_o uuid;sem integer;old_sem integer;z record;es_recurrente boolean:=false;fin_cambio boolean:=false;
 claves text[];f date;old_f date;campos text[]:=array['estatus','fecha_alta','fecha_baja','fecha_reingreso','sd','sdi','sal_semanal','monto_finiquito','periodo_pago','eliminado','contratista','id_cuadrilla','forma_pago','cuenta','clabe','banco','obra_id'];
begin
 if tg_op='UPDATE' and(tg_table_name='trabajadores') and not exists(
   select 1 from unnest(campos) k where j->k is distinct from antes->k) then return new; end if;
 if tg_op='UPDATE' and(tg_table_name<>'trabajadores') and(j-array['updated_at','actualizado_por','ultimo_recalculo'])=(antes-array['updated_at','actualizado_por','ultimo_recalculo']) then return new; end if;
 o:=nullif(j->>'obra_id','')::uuid;old_o:=nullif(antes->>'obra_id','')::uuid;
 if tg_table_name='obras' then o:=(j->>'id')::uuid;old_o:=nullif(antes->>'id','')::uuid;end if;
 if tg_table_name='control_casos_imss_semanas' then
  select obra_id into o from public.control_casos_imss where id=(j->>'caso_id')::uuid;
  select obra_id into old_o from public.control_casos_imss where id=nullif(antes->>'caso_id','')::uuid;
 end if;
 sem:=public.norm_semana(j->>'semana');old_sem:=public.norm_semana(antes->>'semana');
 if tg_table_name='descuentos' then
  es_recurrente:=coalesce((j->>'recurrente')::boolean,false) or coalesce((antes->>'recurrente')::boolean,false);
  if es_recurrente then sem:=null;old_sem:=null;end if;
 end if;
 if tg_table_name='trabajadores' then
  fin_cambio:=j->'monto_finiquito' is distinct from antes->'monto_finiquito' or j->'fecha_baja' is distinct from antes->'fecha_baja';
  f:=nullif(j->>'fecha_baja','')::date;old_f:=nullif(antes->>'fecha_baja','')::date;
 end if;
 for z in select c.*,ob.fecha_inicio+(c.semana-1)*7 inicio,ob.fecha_inicio+(c.semana-1)*7+6 fin
  from public.control_cierres_nomina c join public.obras ob on ob.id=c.obra_id
  where c.estado<>'CANCELADO' and c.obra_id in(o,old_o)
   and(case when sem is not null or old_sem is not null then c.semana in(sem,old_sem)
    else ob.fecha_inicio+(c.semana-1)*7+6>=(now() at time zone 'America/Mexico_City')::date
      or(tg_table_name='trabajadores' and fin_cambio and(f between ob.fecha_inicio+(c.semana-1)*7 and ob.fecha_inicio+(c.semana-1)*7+6
          or old_f between ob.fecha_inicio+(c.semana-1)*7 and ob.fecha_inicio+(c.semana-1)*7+6))
      or(tg_table_name='descuentos' and exists(select 1 from jsonb_object_keys((case when jsonb_typeof(j->'ajustes_semana')='object' then j->'ajustes_semana' else '{}'::jsonb end)||(case when jsonb_typeof(antes->'ajustes_semana')='object' then antes->'ajustes_semana' else '{}'::jsonb end)) k
          where public.norm_semana(k)=c.semana and j->'ajustes_semana'->k is distinct from antes->'ajustes_semana'->k)) end)
   and(tg_table_name<>'trabajadores' or coalesce(nullif(j->>'fecha_alta','')::date,nullif(antes->>'fecha_alta','')::date,'1900-01-01')<=ob.fecha_inicio+(c.semana-1)*7+6)
  order by c.obra_id,c.semana
 loop
  perform platinum_internal.bloquear(z.obra_id,z.semana);
  -- Releer después del candado; una autorización concurrente nunca pasa desapercibida.
  if exists(select 1 from public.control_cierres_nomina c where c.id=z.id and c.estado in('AUTORIZADO','TIMBRADO','PAGADO')) then
   raise exception 'S% está autorizada: solicita y aprueba su reapertura antes de modificar sus fuentes',z.semana;
  end if;
  update public.control_flujo_cierres set sucio=true,updated_at=now() where cierre_id=z.id;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
do $sources$
declare t text;
begin
 foreach t in array array['trabajadores','descuentos','diferenciales','control_altas_bajas_cortas','control_casos_imss_semanas','obras'] loop
  execute format('create trigger a_control_fuente_guard before insert or update or delete on public.%I for each row execute function platinum_internal.guardar_fuente()',t);
 end loop;
end;$sources$;

create function platinum_internal.evento() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;o uuid;modulo text;priv boolean:=false;
begin
 if tg_op='UPDATE' and(to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return new;end if;
 o:=nullif(j->>'obra_id','')::uuid;
 if o is null and tg_table_name='control_casos_imss_semanas' then select obra_id into o from public.control_casos_imss where id=(j->>'caso_id')::uuid;end if;
 if o is null then if tg_op='DELETE' then return old;else return new;end if;end if;
 modulo:=case when tg_table_name in('pagos','cheques','control_pago_aplicaciones','control_obligaciones_pago','control_evidencias_pago','control_finiquitos_transferencia') then 'PAGOS'
   when tg_table_name like 'control_casos_imss%' or tg_table_name in('control_incidentes_laborales','control_st7_acuses') then 'IMSS'
   when tg_table_name in('descuentos','diferenciales','control_cierres_nomina','control_conciliacion_noi','control_flujo_cierres','control_cierre_versiones') then 'NOMINA'
   when tg_table_name='sueldos_internos' then 'VIP'
   when tg_table_name in('trabajadores','cuadrillas','documentos','control_expedientes_pendientes') then 'PERSONAL' else 'CONTROL' end;
 priv:=modulo='IMSS';
 insert into public.control_eventos_integracion(obra_id,modulo,tabla,entidad_id,accion,privado,actor_id)
 values(o,modulo,tg_table_name,coalesce(j->>'id',j->>'cierre_id'),tg_op,priv,auth.uid());
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
do $events$
declare t record;
begin
 for t in select c.table_name from information_schema.columns c where c.table_schema='public' and c.column_name='obra_id'
    and c.table_name not like 'respaldo_%' and c.table_name not in('control_eventos_integracion','control_bitacora','auditoria_calculos_nomina','ia_embeddings')
    and exists(select 1 from pg_class r where r.relnamespace='public'::regnamespace and r.relname=c.table_name and r.relkind='r')
 loop
  execute format('create trigger z_integracion_evento after insert or update or delete on public.%I for each row execute function platinum_internal.evento()',t.table_name);
 end loop;
 create trigger z_integracion_evento after insert or update or delete on public.control_casos_imss_semanas for each row execute function platinum_internal.evento();
end;$events$;
alter policy control_eventos_integracion_scope on public.control_eventos_integracion to authenticated using(
 (select public.app_ve_obra(obra_id)) and(not privado or(select public.control_puede_ver_salud()))
 and(modulo<>'VIP' or(select public.app_es_vip())));

create function platinum_internal.proteger_evidencia() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
 if tg_op='UPDATE' and(tg_table_name='cheques') and
    (to_jsonb(new)-array['estatus','cierre_id','updated_at','actualizado_por','observaciones'])=(to_jsonb(old)-array['estatus','cierre_id','updated_at','actualizado_por','observaciones'])
    and to_jsonb(old)->>'estatus'='EXPEDIDO' and to_jsonb(new)->>'estatus'='ENTREGADO' then return new;end if;
 if tg_op='UPDATE' and(to_jsonb(new)-array['cierre_id','updated_at','actualizado_por','observaciones'])=(to_jsonb(old)-array['cierre_id','updated_at','actualizado_por','observaciones']) then return new;end if;
 if exists(select 1 from public.control_evidencias_pago e join public.control_pago_aplicaciones a on a.evidencia_id=e.id and a.retirado_en is null
    where(tg_table_name='pagos' and e.pago_id=(j->>'id')::uuid) or(tg_table_name='cheques' and e.cheque_id=(j->>'id')::uuid)) then
  raise exception 'Comprobante aplicado: primero revisa y retira su aplicación con autorización del administrador'; end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create trigger a_control_evidencia_guard before update or delete on public.pagos for each row execute function platinum_internal.proteger_evidencia();
create trigger a_control_evidencia_guard before update or delete on public.cheques for each row execute function platinum_internal.proteger_evidencia();

-- No hay escrituras a datos del personal ni regularizaciones automáticas.
revoke all on all functions in schema platinum_internal from public,anon,authenticated;
grant execute on function platinum_internal.rpc(text,jsonb) to authenticated;
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='control_eventos_integracion') then
  alter publication supabase_realtime add table public.control_eventos_integracion;
 end if;
end;$$;
notify pgrst,'reload schema';
