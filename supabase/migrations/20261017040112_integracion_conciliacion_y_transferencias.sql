-- Actualiza conectores heredados, sin relajar unicidad ni alterar motores.
CREATE OR REPLACE FUNCTION public.control_proteger_papelera_cheques()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if (new.eliminado,new.eliminado_por,new.eliminado_en,new.motivo_eliminado)
    is not distinct from
    (old.eliminado,old.eliminado_por,old.eliminado_en,old.motivo_eliminado)
    then return new; end if;
  -- Las tareas internas mantienen su acceso; nunca se admite un usuario anónimo.
  if (select auth.uid()) is null and current_user in ('postgres','service_role') then
    return new;
  end if;
  if public.control_es_admin_cierre() then return new; end if;
  if current_user='postgres' and current_setting('platinum.finiquito_transferencia_id',true)=old.id::text
     and old.estatus='PENDIENTE' and new.estatus='CANCELADO' and new.eliminado
     and coalesce(btrim(old.num_cheque),'')='' and coalesce(btrim(old.consecutivo),'')=''
     and exists(select 1 from public.control_permisos_cheques pc where pc.user_id=(select auth.uid()) and pc.puede_conciliar_transferencia)
     and exists(select 1 from public.control_finiquitos_transferencia ft join public.pagos p on p.id=ft.pago_id
       where ft.cheque_id=old.id and ft.trabajador_id=old.trabajador_id and ft.obra_id=old.obra_id
         and ft.estado='CONCILIADO_BANCO' and p.estado='EXITOSO' and p.importe=old.importe) then return new;end if;
  if not public.control_puede_eliminar_cheques()
     or not public.app_ve_obra(old.obra_id) then
    raise exception 'No tienes permiso para eliminar cheques' using errcode='42501';
  end if;
  if coalesce(old.eliminado,false) or not coalesce(new.eliminado,false) then
    raise exception 'Solo el administrador puede restaurar o modificar un cheque eliminado' using errcode='42501';
  end if;
  if (to_jsonb(new)-array['eliminado','eliminado_por','eliminado_en','motivo_eliminado','updated_at','actualizado_por'])
    is distinct from
    (to_jsonb(old)-array['eliminado','eliminado_por','eliminado_en','motivo_eliminado','updated_at','actualizado_por']) then
    raise exception 'Este permiso solo permite mover el cheque a la papelera' using errcode='42501';
  end if;
  if nullif(btrim(new.motivo_eliminado),'') is null then
    raise exception 'Indica el motivo de eliminación';
  end if;
  new.eliminado_por:=auth.email();
  new.eliminado_en:=now();
  return new;
end;
$function$;

create or replace function public.control_preparar_medio_pago() returns trigger language plpgsql set search_path='' as $$
declare z public.control_cierres_nomina%rowtype;q public.cheques%rowtype;t public.trabajadores%rowtype;tp text;pid uuid;
begin
 select * into z from public.control_cierres_nomina where id=new.cierre_id;
 if z.id is null then raise exception 'El cierre no existe'; end if;
 if new.tipo_calculo='FINIQUITO' then
  new.metodo_pago:=case when exists(select 1 from public.control_finiquitos_transferencia f where f.obra_id=new.obra_id
     and f.trabajador_id=new.trabajador_id and f.semana=z.semana) then 'TRANSFERENCIA' else 'CHEQUE' end;
 end if;
 if new.trabajador_id is null or coalesce(new.monto_noi,0)<=0 or exists(select 1 from public.control_altas_bajas_cortas a
    where a.obra_id=new.obra_id and a.trabajador_id=new.trabajador_id and a.semana=z.semana and a.estado_servicio<>'CON_SERVICIO') then
  new.cheque_id:=null;new.pago_id:=null;return new;
 end if;
 tp:=case when new.tipo_calculo='FINIQUITO' then 'FINIQUITO' else 'CHEQUE' end;
 if new.metodo_pago='CHEQUE' then
  select * into q from public.cheques where obra_id=new.obra_id and trabajador_id=new.trabajador_id
    and public.norm_semana(semana)=z.semana and tipo_pago=tp and estatus<>'CANCELADO' and not coalesce(eliminado,false) order by created_at limit 1;
  if q.id is null then
   select * into t from public.trabajadores where id=new.trabajador_id;
   insert into public.cheques(obra_id,trabajador_id,no_trab,contratista,nombre,puesto,curp,semana,periodo,importe,tipo_pago,estatus,observaciones,creado_por,cierre_id,origen_generacion)
   values(new.obra_id,new.trabajador_id,new.trabajador_numero,coalesce(t.contratista,''),new.trabajador_nombre,coalesce(t.puesto,''),coalesce(t.curp,''),
     'S'||z.semana,z.periodo,new.monto_noi,tp,'PENDIENTE','PENDIENTE CON NETO NOI; REQUIERE CONCILIACIÓN Y AUTORIZACIÓN',auth.jwt()->>'email',z.id,
     case when tp='FINIQUITO' then 'FINIQUITO' else 'CIERRE_NOI' end) returning id into q.id;
  elsif q.estatus='PENDIENTE' and nullif(btrim(q.num_cheque),'') is null and nullif(btrim(q.consecutivo),'') is null then
   update public.cheques set importe=new.monto_noi where id=q.id;
  end if;
  new.cheque_id:=q.id;new.pago_id:=null;
 else
  select p.id into pid from public.pagos p where p.obra_id=new.obra_id and p.trabajador_id=new.trabajador_id
   and public.norm_semana(p.semana)=z.semana and upper(p.estado)='EXITOSO' and upper(p.medio)='TRANSFERENCIA'
   and p.importe=new.monto_noi order by p.created_at desc limit 1;
  new.pago_id:=pid;new.cheque_id:=null;
 end if;
 return new;
end;$$;

create function platinum_internal.validar_neto_cheque_noi() returns trigger language plpgsql security definer set search_path='' as $$
declare z public.control_cierres_nomina%rowtype;n numeric;cuantos integer;tp text;d jsonb;
begin
 if new.estatus not in('EXPEDIDO','ENTREGADO') or coalesce(new.eliminado,false) then return new;end if;
 if tg_op='UPDATE' and old.estatus in('EXPEDIDO','ENTREGADO') and
    (new.importe,new.trabajador_id,new.obra_id,new.semana,new.tipo_pago) is not distinct from(old.importe,old.trabajador_id,old.obra_id,old.semana,old.tipo_pago) then return new;end if;
 if new.trabajador_id is null or public.norm_semana(new.semana) is null or coalesce(new.importe,0)<=0 then raise exception 'Cheque sin trabajador, semana o importe positivo';end if;
 select * into z from public.control_cierres_nomina where obra_id=new.obra_id and semana=public.norm_semana(new.semana) and estado<>'CANCELADO';
 if z.id is null or nullif(z.archivo_noi,'') is null or z.estado not in('AUTORIZADO','TIMBRADO','PAGADO') then
  raise exception 'No se puede expedir: importa NOI, concilia y autoriza el cierre de esta semana';end if;
 perform platinum_internal.autorizar(new.obra_id,true);perform platinum_internal.bloquear(new.obra_id,z.semana);
 if not exists(select 1 from public.control_flujo_cierres f where f.cierre_id=z.id and not f.sucio and f.version_id is not null) then
  raise exception 'Prepara, autoriza o adopta la versión integrada antes de expedir';end if;
 d:=platinum_internal.diagnostico(z.id,new.trabajador_id);
 if(d->>'pendientes')::integer>0 or(d->>'fuera_snapshot')::integer>0 then raise exception 'Cheque bloqueado: existen diferencias entre motor, NOI y recibos';end if;
 tp:=case when new.tipo_pago='FINIQUITO' then 'FINIQUITO' else 'NOMINA' end;
 select count(*),max(monto_noi) into cuantos,n from public.control_conciliacion_noi where cierre_id=z.id and trabajador_id=new.trabajador_id and tipo_calculo=tp;
 if cuantos<>1 or coalesce(n,0)<=0 or new.importe is distinct from n then raise exception 'El cheque debe coincidir exactamente con el neto NOI positivo de este concepto';end if;
 return new;
end;$$;

create or replace trigger trg_control_validar_neto_cheque_noi before insert or update on public.cheques for each row execute function platinum_internal.validar_neto_cheque_noi();

create function platinum_internal.registrar_cheque() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.control_obligaciones_pago%rowtype;
begin
 if new.estatus not in('EXPEDIDO','ENTREGADO') or coalesce(new.eliminado,false) then return new;end if;
 if exists(select 1 from public.control_evidencias_pago e join public.control_pago_aplicaciones a on a.evidencia_id=e.id and a.retirado_en is null where e.cheque_id=new.id) then return new;end if;
 select * into o from public.control_obligaciones_pago where obra_id=new.obra_id and semana=public.norm_semana(new.semana) and trabajador_id=new.trabajador_id
   and tipo=case when new.tipo_pago='FINIQUITO' then 'FINIQUITO' else 'NOMINA' end and cierre_id is not null;
 if o.id is not null then
  perform platinum_internal.aplicar_pago(jsonb_build_object('obligacion_id',o.id,'cheque_id',new.id,'importe',new.importe,
   'clave_idempotencia',new.id,'motivo','Cheque expedido y verificado contra versión autorizada'));
 end if;
 return new;
end;$$;
create trigger y_control_registrar_cheque after insert or update on public.cheques for each row execute function platinum_internal.registrar_cheque();

create function platinum_internal.vincular_banco(p_id uuid) returns integer language plpgsql set search_path='' as $$
declare p public.pagos%rowtype;o record;n integer:=0;total numeric;z public.control_cierres_nomina%rowtype;
begin
 select * into p from public.pagos where id=p_id;
 if p.id is null or p.estado<>'EXITOSO' or p.medio<>'TRANSFERENCIA' then return 0;end if;
 select * into z from public.control_cierres_nomina where obra_id=p.obra_id and semana=public.norm_semana(p.semana) and estado in('AUTORIZADO','TIMBRADO','PAGADO');
 if z.id is null or not exists(select 1 from public.obras ob where ob.id=p.obra_id and ob.fecha_inicio+(z.semana-1)*7+6>=(now() at time zone 'America/Mexico_City')::date) then return 0;end if;
 select sum(s.saldo) into total from public.control_saldos_pago s where s.cierre_id=z.id and s.trabajador_id=p.trabajador_id and s.saldo>0;
 if total is distinct from p.importe then return 0;end if;
 -- El total bancario completa exactamente las obligaciones positivas; no se adivina el concepto de un parcial.
 for o in select * from public.control_saldos_pago where cierre_id=z.id and trabajador_id=p.trabajador_id and saldo>0 order by tipo loop
  perform platinum_internal.aplicar_pago(jsonb_build_object('obligacion_id',o.id,'pago_id',p.id,'importe',o.saldo,
    'clave_idempotencia',md5(p.id::text||o.id::text)::uuid,'motivo','Comprobante bancario exacto de la semana abierta, vinculación automática'));
  n:=n+1;
 end loop;
 return n;
end;$$;
create function platinum_internal.banco_importado() returns trigger language plpgsql security definer set search_path='' as $$
begin
 begin
  perform platinum_internal.vincular_banco(new.id);
 exception when others then
  -- Un comprobante real no se pierde porque su conciliación necesite revisión.
  insert into public.control_eventos_integracion(obra_id,modulo,tabla,entidad_id,accion,actor_id)
   values(new.obra_id,'PAGOS','pagos',new.id::text,'REVISAR_VINCULACION',auth.uid());
 end;
 return new;
end;$$;
create trigger y_control_banco_importado after insert on public.pagos for each row execute function platinum_internal.banco_importado();

-- También el orden inverso: comprobante importado antes de autorizar. Nunca regulariza historia solo.
create function platinum_internal.vincular_al_autorizar() returns trigger language plpgsql security definer set search_path='' as $$
declare p record;
begin
 if new.estado<>'AUTORIZADO' or old.estado='AUTORIZADO' then return new;end if;
 if not exists(select 1 from public.obras ob where ob.id=new.obra_id and ob.fecha_inicio+(new.semana-1)*7+6>=(now() at time zone 'America/Mexico_City')::date) then return new;end if;
 for p in select id from public.pagos where obra_id=new.obra_id and public.norm_semana(semana)=new.semana and estado='EXITOSO' and medio='TRANSFERENCIA' order by created_at,id loop
  begin perform platinum_internal.vincular_banco(p.id);
  exception when others then
   insert into public.control_eventos_integracion(obra_id,modulo,tabla,entidad_id,accion,actor_id)
    values(new.obra_id,'PAGOS','pagos',p.id::text,'REVISAR_VINCULACION',auth.uid());
  end;
 end loop;
 return new;
end;$$;
create trigger zz_control_vincular_autorizacion after update of estado on public.control_cierres_nomina for each row execute function platinum_internal.vincular_al_autorizar();

create function platinum_internal.crear_cierre(p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare s jsonb:=p->'snapshot';o uuid:=(s->>'obra_id')::uuid;sem integer:=(s->>'semana')::integer;v uuid;r jsonb;
begin
 perform platinum_internal.autorizar(o,true);perform platinum_internal.bloquear(o,sem);
 if sem not between 1 and 53 or s->>'periodo' not in('SEMANAL','QUINCENAL','TODOS') then raise exception 'Semana o periodo no válidos';end if;
 if exists(select 1 from public.control_cierres_nomina z where z.obra_id=o and z.semana=sem and z.estado<>'CANCELADO') then raise exception 'Ya existe un cierre de esta semana. Abre ese cierre';end if;
 insert into public.control_cierres_nomina(obra_id,semana,periodo,total_nomina,total_prevision,total_retenciones,total_finiquitos,total_neto,total_trabajadores,
    formula_version,snapshot,snapshot_sha256,observaciones,creado_por_email)
 values(o,sem,s->>'periodo',(s->>'total_nomina')::numeric,(s->>'total_prevision')::numeric,(s->>'total_retenciones')::numeric,
   (s->>'total_finiquitos')::numeric,(s->>'total_neto')::numeric,(s->>'total_trabajadores')::integer,s->>'formula_version',s,
   platinum_internal.huella(s),p->>'observaciones',auth.jwt()->>'email') returning id into v;
 r:=platinum_internal.preparar(v,s,p->>'fuente');
 return r;
end;$$;

create function platinum_internal.transferir_finiquito(p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare w public.trabajadores%rowtype;z public.control_cierres_nomina%rowtype;b public.pagos%rowtype;q public.cheques%rowtype;
 f public.control_finiquitos_transferencia%rowtype;ob public.obras%rowtype;o public.control_obligaciones_pago%rowtype;
 es_admin boolean:=public.control_es_admin_cierre();cuantos integer;n numeric;sem integer:=(p->>'semana')::integer;desde date;
begin
 if not es_admin and not exists(select 1 from public.control_permisos_cheques pc where pc.user_id=auth.uid()
    and pc.puede_conciliar_transferencia and public.app_puede_escribir()) then
  raise exception 'Sin permiso para conciliar un finiquito por transferencia' using errcode='42501';end if;
 if p->>'confirmacion' is distinct from 'CONFIRMAR TRANSFERENCIA' or length(btrim(coalesce(p->>'motivo','')))<10 then
  raise exception 'Confirma explícitamente la transferencia e indica el motivo';end if;
 select * into w from public.trabajadores where id=(p->>'trabajador_id')::uuid;
 if w.id is null or w.estatus<>'BAJA' or w.fecha_baja is null or coalesce(w.monto_finiquito,0)<=0 or w.eliminado then
  raise exception 'Trabajador sin finiquito de baja válido';end if;
 perform platinum_internal.autorizar(w.obra_id,true);perform platinum_internal.bloquear(w.obra_id,sem);
 select * into ob from public.obras where id=w.obra_id;desde:=ob.fecha_inicio+(sem-1)*7;
 if sem not between 1 and 53 or w.fecha_baja not between desde and desde+6 then raise exception 'Baja fuera de la semana seleccionada';end if;
 select * into z from public.control_cierres_nomina where obra_id=w.obra_id and semana=sem and estado<>'CANCELADO';
 if z.id is null or nullif(z.archivo_noi,'') is null then raise exception 'Importa y concilia el finiquito con NOI antes de cambiar el método';end if;
 select count(*),max(monto_noi) into cuantos,n from public.control_conciliacion_noi where cierre_id=z.id and trabajador_id=w.id and tipo_calculo='FINIQUITO' and estatus='COINCIDE';
 if cuantos<>1 or n is distinct from w.monto_finiquito or coalesce(n,0)<=0 then raise exception 'El finiquito no está conciliado exactamente con NOI';end if;
 if(platinum_internal.diagnostico(z.id,w.id)->>'pendientes')::integer>0 then raise exception 'Hay diferencias con los recibos del trabajador';end if;
 if nullif(p->>'pago_id','') is not null then
  select * into b from public.pagos where id=(p->>'pago_id')::uuid for update;
  if b.id is null or b.obra_id is distinct from w.obra_id or b.trabajador_id is distinct from w.id
      or public.norm_semana(b.semana) is distinct from sem or b.estado<>'EXITOSO' or b.medio<>'TRANSFERENCIA'
      or b.importe is distinct from n then raise exception 'La transferencia no coincide exactamente con trabajador, centro, semana e importe';end if;
 elsif not es_admin then raise exception 'Contabilidad sólo puede vincular una transferencia bancaria ya importada';end if;
 select * into f from public.control_finiquitos_transferencia where trabajador_id=w.id and anio=extract(year from desde)::integer and semana=sem for update;
 if f.id is not null and(f.estado='CONCILIADO_BANCO' or b.id is null) then raise exception 'El finiquito ya tiene una excepción registrada';end if;
 select * into q from public.cheques where obra_id=w.obra_id and trabajador_id=w.id and public.norm_semana(semana)=sem
   and tipo_pago='FINIQUITO' and estatus<>'CANCELADO' and not coalesce(eliminado,false) order by created_at limit 1 for update;
 if q.id is not null and(q.estatus<>'PENDIENTE' or nullif(btrim(q.num_cheque),'') is not null or nullif(btrim(q.consecutivo),'') is not null) then
  raise exception 'No se puede sustituir un cheque expedido o con numeración';end if;
 if not es_admin and(q.id is null or q.importe is distinct from n) then raise exception 'Contabilidad requiere un cheque pendiente sin número, con el importe exacto';end if;
 if f.id is null then
  insert into public.control_finiquitos_transferencia(obra_id,trabajador_id,anio,semana,importe,estado,pago_id,fecha_declarada,referencia_declarada,motivo,cheque_id,registrado_por)
  values(w.obra_id,w.id,extract(year from desde)::integer,sem,n,case when b.id is null then 'DECLARADO_POR_ADMIN' else 'CONCILIADO_BANCO' end,
    b.id,coalesce(b.fecha_pago,nullif(p->>'fecha','')::date),coalesce(b.folio_lote,p->>'referencia'),p->>'motivo',q.id,auth.uid()) returning * into f;
 else
  update public.control_finiquitos_transferencia set estado='CONCILIADO_BANCO',pago_id=b.id,fecha_declarada=b.fecha_pago,
     referencia_declarada=b.folio_lote,motivo=p->>'motivo',actualizado_en=now() where id=f.id returning * into f;
 end if;
 if q.id is not null then
  perform set_config('platinum.finiquito_transferencia_id',q.id::text,true);
  update public.cheques set estatus='CANCELADO',eliminado=true,eliminado_por=auth.email(),eliminado_en=now(),motivo_eliminado='SUSTITUIDO POR TRANSFERENCIA CONCILIADA',
    observaciones=concat_ws(' · ',nullif(observaciones,''),'Ver excepción de transferencia '||f.id::text) where id=q.id;
 end if;
 update public.control_obligaciones_pago set metodo='TRANSFERENCIA',updated_at=now() where cierre_id=z.id and trabajador_id=w.id and tipo='FINIQUITO';
 if b.id is not null and z.estado in('AUTORIZADO','TIMBRADO','PAGADO') then
  select * into o from public.control_obligaciones_pago where cierre_id=z.id and trabajador_id=w.id and tipo='FINIQUITO';
  if o.id is not null then perform platinum_internal.aplicar_pago(jsonb_build_object('obligacion_id',o.id,'pago_id',b.id,'importe',n,
    'clave_idempotencia',md5(f.id::text||b.id::text)::uuid,'motivo',p->>'motivo'));end if;
 end if;
 perform platinum_internal.auditar(w.obra_id,'FINIQUITO_TRANSFERENCIA_AUTORIZADA',f.id,jsonb_build_object('semana',sem,'importe',n,'pago_id',b.id,'cheque_retirado',q.id,'motivo',p->>'motivo','admin',es_admin));
 return jsonb_build_object('registro_id',f.id,'estado',f.estado,'cheque_anulado_id',q.id);
end;$$;

create or replace function public.control_marcar_finiquito_transferencia(p_trabajador uuid,p_semana integer,p_pago_id uuid default null,
 p_fecha date default null,p_referencia text default null,p_motivo text default null,p_confirmacion text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select platinum_internal.rpc('TRANSFERIR_FINIQUITO',jsonb_build_object('trabajador_id',p_trabajador,'semana',p_semana,'pago_id',p_pago_id,
  'fecha',p_fecha,'referencia',p_referencia,'motivo',p_motivo,'confirmacion',p_confirmacion))
$$;
revoke all on function public.control_marcar_finiquito_transferencia(uuid,integer,uuid,date,text,text,text) from public,anon;
grant execute on function public.control_marcar_finiquito_transferencia(uuid,integer,uuid,date,text,text,text) to authenticated;

-- Permiso específico, no rol de administrador ni privilegio de declarar pagos no comprobados.
insert into public.control_permisos_cheques(user_id,puede_eliminar,puede_conciliar_transferencia,otorgado_por)
select u.user_id,false,true,'ADMIN: aprobación expresa de conciliación exacta de transferencias'
 from public.app_usuarios u where lower(u.email)='l.cdlfs01@gmail.com' and u.activo and u.puede_escribir
on conflict(user_id) do update set puede_conciliar_transferencia=true;

-- Corrige una comprobación tautológica: un caso nuevo debe pertenecer al centro del trabajador.
alter policy control_altas_bajas_cortas_insert on public.control_altas_bajas_cortas with check(
 (select public.app_ve_obra(obra_id)) and(select public.app_puede_escribir()) and creado_por=(select auth.uid())
 and exists(select 1 from public.trabajadores t where t.id=trabajador_id and t.obra_id=control_altas_bajas_cortas.obra_id));
alter policy control_altas_bajas_cortas_update on public.control_altas_bajas_cortas with check(
 (select public.app_ve_obra(obra_id)) and(select public.app_puede_escribir())
 and exists(select 1 from public.trabajadores t where t.id=trabajador_id and t.obra_id=control_altas_bajas_cortas.obra_id));
revoke all on all functions in schema platinum_internal from public,anon,authenticated;
grant execute on function platinum_internal.rpc(text,jsonb) to authenticated;
-- El calendario puede recalcularse en borrador; las guardas marcan su fotografía como obsoleta.
CREATE OR REPLACE FUNCTION public.control_guardar_semana_imss_detalle(p_caso_id uuid, p_semana integer, p_detalle jsonb, p_nota text, p_monto numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caso public.control_casos_imss%rowtype;
  v_trab public.trabajadores%rowtype;
  v_sem public.control_casos_imss_semanas%rowtype;
  v_inicio date; v_desde date; v_hasta date;
  v_esperados integer; v_total integer; v_distintos integer;
  v_empresa integer; v_imss integer; v_sin_subsidio integer; v_fuera integer;
  v_descuento uuid; v_email text; v_nota text;
begin
  if (select auth.uid()) is null or not (select public.control_puede_ver_salud())
     or not (select public.app_puede_escribir()) then
    raise exception 'Sin permiso para editar incapacidades';
  end if;
  select * into v_caso from public.control_casos_imss where id=p_caso_id for update;
  if not found or v_caso.eliminado_en is not null or v_caso.certificado_desde is null then
    raise exception 'Caso IMSS activo con certificado no encontrado';
  end if;
  if not (select public.app_ve_obra(v_caso.obra_id)) then
    raise exception 'Sin permiso para este centro de trabajo';
  end if;
  select * into v_trab from public.trabajadores where id=v_caso.trabajador_id;
  if not found or v_trab.obra_id<>v_caso.obra_id then
    raise exception 'Trabajador no corresponde al caso';
  end if;
  if p_semana is null or p_semana not between 1 and 53
     or jsonb_typeof(p_detalle) is distinct from 'array' then
    raise exception 'Semana o calendario inválidos';
  end if;
  select o.fecha_inicio+(p_semana-1)*7 into v_inicio
  from public.obras o where o.id=v_caso.obra_id;
  v_desde:=greatest(v_inicio,v_caso.certificado_desde);
  v_hasta:=least(v_inicio+6,v_caso.certificado_hasta);
  v_esperados:=greatest(0,v_hasta-v_desde+1);
  if v_esperados=0 then raise exception 'La semana no está cubierta por el certificado'; end if;

  select count(*),count(distinct x.fecha),
    count(*) filter(where x.pagador='EMPRESA'),
    count(*) filter(where x.pagador='IMSS'),
    count(*) filter(where x.pagador='SIN_PAGO'),
    count(*) filter(where x.fecha<v_desde or x.fecha>v_hasta
       or x.fecha is null or x.pagador not in ('EMPRESA','IMSS','SIN_PAGO')
       or x.pagador is null)
  into v_total,v_distintos,v_empresa,v_imss,v_sin_subsidio,v_fuera
  from jsonb_to_recordset(p_detalle) as x(fecha date,pagador text);
  if v_total<>v_esperados or v_distintos<>v_esperados or v_fuera<>0 then
    raise exception 'Clasifica exactamente cada fecha del certificado en esa semana';
  end if;

  select * into v_sem from public.control_casos_imss_semanas
  where caso_id=p_caso_id and semana=p_semana
    and anio=extract(year from v_inicio)::integer for update;
  -- Se permite documentar el calendario aun con un borrador existente.
  -- Recalcular una incidencia ya aplicada sí alteraría el neto fotografiado.
  if v_sem.estado='APLICADO' and exists (
    select 1 from public.control_cierres_nomina z
    where z.obra_id=v_caso.obra_id and z.semana=p_semana and z.estado in('AUTORIZADO','TIMBRADO','PAGADO')) then
    raise exception 'Solicita reapertura del cierre autorizado antes de recalcular la incidencia aplicada';
  end if;
  v_nota:=nullif(left(btrim(coalesce(p_nota,'')),500),'');
  select u.email into v_email from public.app_usuarios u where u.user_id=(select auth.uid());
  perform set_config('platinum.imss_calendar_rpc','on',true);

  if v_sem.id is not null and v_sem.estado='APLICADO' then
    if p_monto is null or p_monto<0 or p_monto>coalesce(v_trab.sal_semanal,0)
       or round(p_monto,2)<>p_monto then
      raise exception 'El descuento recalculado no es válido';
    end if;
    if v_sem.descuento_id is not null then
      update public.descuentos d set activo=false,actualizado_por=v_email,updated_at=now()
      where d.id=v_sem.descuento_id and d.trabajador_id=v_trab.id;
    end if;
    if v_imss+v_sin_subsidio>0 and p_monto>0 then
      insert into public.descuentos
        (trabajador_id,obra_id,tipo,motivo,monto,recurrente,semana,activo,creado_por,periodicidad)
      values (v_trab.id,v_caso.obra_id,'INCIDENCIA',
        (v_imss+v_sin_subsidio)::text||' DÍA(S) SIN SALARIO PATRONAL POR INCAPACIDAD IMSS · CASO '||p_caso_id::text,
        p_monto,false,'S'||p_semana::text,true,v_email,v_trab.periodo_pago)
      returning id into v_descuento;
    end if;
  elsif v_sem.id is not null then
    v_descuento:=v_sem.descuento_id;
  end if;

  if v_sem.id is null then
    insert into public.control_casos_imss_semanas
      (caso_id,anio,semana,dias_pagados_empresa,dias_sin_salario_patronal,
       dias_imss_estimados,dias_sin_subsidio,detalle_dias,nota)
    values (p_caso_id,extract(year from v_inicio)::integer,p_semana,
      v_empresa,v_imss+v_sin_subsidio,v_imss,v_sin_subsidio,p_detalle,v_nota)
    returning id into v_sem.id;
  else
    update public.control_casos_imss_semanas set
      dias_pagados_empresa=v_empresa,dias_sin_salario_patronal=v_imss+v_sin_subsidio,
      dias_imss_estimados=v_imss,dias_sin_subsidio=v_sin_subsidio,
      detalle_dias=p_detalle,nota=v_nota,descuento_id=v_descuento,updated_at=now()
    where id=v_sem.id;
  end if;
  insert into public.control_bitacora
    (obra_id,modulo,accion,entidad_tipo,entidad_id,detalle,actor_id,actor_email)
  values (v_caso.obra_id,'CASOS_IMSS','EDITAR_CALENDARIO','CASO_IMSS',p_caso_id,
    jsonb_build_object('semana',p_semana,'anio',extract(year from v_inicio)::integer,
      'dias_empresa',v_empresa,'dias_imss_estimados',v_imss,
      'dias_sin_subsidio',v_sin_subsidio,'descuento_recalculado',v_descuento),
    (select auth.uid()),v_email);
  return v_sem.id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.control_proteger_semana_imss()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_obra uuid; v_trab uuid;
  v_distribucion_cambio boolean;
begin
  v_distribucion_cambio :=
    (new.dias_pagados_empresa,new.dias_sin_salario_patronal,
     new.dias_imss_estimados,new.dias_sin_subsidio,new.detalle_dias)
    is distinct from
    (old.dias_pagados_empresa,old.dias_sin_salario_patronal,
     old.dias_imss_estimados,old.dias_sin_subsidio,old.detalle_dias);
  if v_distribucion_cambio
     and current_setting('platinum.imss_calendar_rpc',true) is distinct from 'on' then
    raise exception 'Edita la distribución mediante el calendario IMSS para mantener nómina y auditoría sincronizadas';
  end if;
  if new.estado='APLICADO' and
     (old.estado is distinct from 'APLICADO' or v_distribucion_cambio
      or new.descuento_id is distinct from old.descuento_id) then
    if new.detalle_dias is null then
      raise exception 'Clasifica cada día del certificado antes de aplicar a nómina';
    end if;
    select c.obra_id,c.trabajador_id into v_obra,v_trab
    from public.control_casos_imss c where c.id=new.caso_id and c.eliminado_en is null;
    if v_obra is null then raise exception 'Caso IMSS activo no encontrado'; end if;
    if exists (select 1 from public.control_cierres_nomina z
      where z.obra_id=v_obra and z.semana=new.semana and z.estado in('AUTORIZADO','TIMBRADO','PAGADO')) then
      raise exception 'Solicita reapertura del cierre autorizado antes de recalcular esta incapacidad';
    end if;
    if exists (select 1 from public.descuentos d
      where d.trabajador_id=v_trab and d.obra_id=v_obra
        and d.semana='S'||new.semana::text and d.activo
        and d.tipo in ('FALTA','INCIDENCIA')
        and d.id is distinct from new.descuento_id) then
      raise exception 'Existe otra falta o incidencia activa; evita un doble descuento';
    end if;
  end if;
  return new;
end;
$function$
;
-- Única importación NOI: transacción íntegra. El enlazador conserva sólo sus columnas de referencia.
revoke insert,update,delete on public.control_conciliacion_noi from authenticated;
grant update(cheque_id,pago_id) on public.control_conciliacion_noi to authenticated;
notify pgrst,'reload schema';
-- Rutina programada, no endpoint de usuario. No cambia el cuerpo del motor ni ejecuta recálculos.
do $$begin
 if to_regprocedure('public.recalcular_creditos_infonavit(date,boolean)') is not null then
  revoke all on function public.recalcular_creditos_infonavit(date,boolean) from public,anon,authenticated;
  grant execute on function public.recalcular_creditos_infonavit(date,boolean) to service_role;
 end if;
end;$$;
