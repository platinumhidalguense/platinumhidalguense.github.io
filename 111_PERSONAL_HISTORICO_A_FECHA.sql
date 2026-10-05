-- Personal histórico a fecha. Respeta RLS de trabajadores, historial y obras.
-- La fecha de vigencia de altas/bajas/reingresos es la efectiva, no el día de captura.
create index if not exists idx_hist_trab_fecha_id_personal
  on public.historial (trabajador_id, fecha desc, id desc)
  where accion in ('ALTA','BAJA','REACTIVACION','MODIFICACION','ELIMINACION');

create or replace function public.fn_personal_historico(
  p_fecha date,
  p_obra_id uuid default null,
  p_contratista text default null,
  p_desde integer default 0,
  p_lote integer default 500
)
returns table (
  trabajador_id uuid,
  obra_id uuid,
  no_trab integer,
  nombre text,
  puesto text,
  contratista text,
  estatus text,
  fecha_alta date,
  fecha_baja date,
  es_reingreso boolean
)
language sql stable security invoker
set search_path = public, pg_temp
as $function$
  with perfiles as (
    select t.id, t.no_trab, t.fecha_alta as alta_original,
      t.fecha_baja as baja_actual, t.fecha_reingreso as reingreso_actual,
      coalesce(nullif(s.datos->>'obra_id','')::uuid,t.obra_id) as obra_historica,
      coalesce(s.datos->>'primer_apellido',t.primer_apellido,'') as apellido_1,
      coalesce(s.datos->>'segundo_apellido',t.segundo_apellido,'') as apellido_2,
      coalesce(s.datos->>'nombres',t.nombres,'') as nombres_historicos,
      coalesce(s.datos->>'puesto',t.puesto,'') as puesto_historico,
      coalesce(s.datos->>'contratista',t.contratista,'') as contratista_historico,
      case when p_fecha = (now() at time zone 'America/Mexico_City')::date
        then t.estatus else coalesce(s.datos->>'estatus',t.estatus) end as estado_capturado
    from public.trabajadores t
    left join lateral (
      select h.datos_despues as datos
      from public.historial h
      where h.trabajador_id=t.id
        and h.accion in ('ALTA','BAJA','REACTIVACION','MODIFICACION','ELIMINACION')
        and h.fecha < ((p_fecha + 1)::timestamp at time zone 'America/Mexico_City')
        and h.datos_despues ? 'obra_id'
      order by h.fecha desc,h.id desc limit 1
    ) anterior on true
    left join lateral (
      select coalesce(h.datos_antes,h.datos_despues) as datos
      from public.historial h
      where h.trabajador_id=t.id
        and h.accion in ('ALTA','BAJA','REACTIVACION','MODIFICACION','ELIMINACION')
        and h.fecha >= ((p_fecha + 1)::timestamp at time zone 'America/Mexico_City')
        and (h.datos_antes ? 'obra_id' or h.datos_despues ? 'obra_id')
      order by h.fecha,h.id limit 1
    ) posterior on anterior.datos is null
    cross join lateral (
      select case when p_fecha = (now() at time zone 'America/Mexico_City')::date
        then to_jsonb(t) else coalesce(anterior.datos,posterior.datos,to_jsonb(t)) end as datos
    ) s
    where p_fecha is not null
      and p_fecha <= (now() at time zone 'America/Mexico_City')::date
      and t.fecha_alta <= p_fecha
      and t.eliminado is not true
  ), visibles as (
    select p.* from perfiles p
    where (p_obra_id is null or p.obra_historica=p_obra_id)
      and (nullif(btrim(p_contratista),'') is null
        or upper(btrim(p.contratista_historico))=upper(btrim(p_contratista)))
      and exists (select 1 from public.obras o where o.id=p.obra_historica)
  )
  select v.id, v.obra_historica, v.no_trab,
    btrim(concat_ws(' ',nullif(v.apellido_1,''),nullif(v.apellido_2,''),nullif(v.nombres_historicos,''))),
    v.puesto_historico, v.contratista_historico,
    case when p_fecha = (now() at time zone 'America/Mexico_City')::date
      then v.estado_capturado
      when ultimo.tipo='BAJA' then 'BAJA'
      when v.estado_capturado='PENDIENTE' then 'PENDIENTE'
      else 'ACTIVO' end,
    case when p_fecha = (now() at time zone 'America/Mexico_City')::date
      then coalesce(v.reingreso_actual,v.alta_original)
      else coalesce(ingreso.fecha,v.alta_original) end,
    case when p_fecha = (now() at time zone 'America/Mexico_City')::date
      then case when v.estado_capturado='BAJA' then v.baja_actual else null::date end
      when ultimo.tipo='BAJA' then ultimo.fecha else null::date end,
    case when p_fecha = (now() at time zone 'America/Mexico_City')::date
      then v.reingreso_actual is not null else ingreso.fecha is not null end
  from visibles v
  left join lateral (
    select x.tipo,x.fecha from (
      select 'ALTA'::text as tipo,v.alta_original as fecha,0::bigint as orden
      union all select 'BAJA',v.baja_actual,9223372036854775807::bigint
        where v.baja_actual is not null
      union all select 'REINGRESO',v.reingreso_actual,9223372036854775807::bigint
        where v.reingreso_actual is not null
      union all
      select 'BAJA',nullif(h.datos_despues->>'fecha_baja','')::date,h.id
      from public.historial h
      where h.trabajador_id=v.id and h.accion='BAJA'
        and h.datos_despues->>'fecha_baja' is not null
        and not exists (
          select 1 from public.historial r
          where r.trabajador_id=h.trabajador_id and r.accion='REACTIVACION' and r.id>h.id
            and r.datos_antes->>'fecha_baja'=h.datos_despues->>'fecha_baja'
            and r.datos_despues->>'fecha_baja' is null
            and r.datos_despues->>'fecha_reingreso' is null
        )
      union all
      select 'REINGRESO',nullif(h.datos_despues->>'fecha_reingreso','')::date,h.id
      from public.historial h
      where h.trabajador_id=v.id and h.accion='REACTIVACION'
        and h.datos_despues->>'fecha_reingreso' is not null
    ) x
    where x.fecha is not null and x.fecha<=p_fecha
    order by x.fecha desc,
      case x.tipo when 'BAJA' then 2 when 'REINGRESO' then 1 else 0 end desc,
      x.orden desc limit 1
  ) ultimo on true
  left join lateral (
    select max(x.fecha) as fecha from (
      select v.reingreso_actual as fecha
      union all
      select nullif(h.datos_despues->>'fecha_reingreso','')::date
      from public.historial h
      where h.trabajador_id=v.id and h.accion='REACTIVACION'
    ) x
    where x.fecha is not null and x.fecha<=p_fecha and x.fecha>=v.alta_original
  ) ingreso on true
  order by v.obra_historica,upper(v.contratista_historico),v.no_trab,v.id
  offset greatest(coalesce(p_desde,0),0)
  limit least(greatest(coalesce(p_lote,500),1),500);
$function$;

revoke all on function public.fn_personal_historico(date,uuid,text,integer,integer) from public, anon;
grant execute on function public.fn_personal_historico(date,uuid,text,integer,integer) to authenticated;

