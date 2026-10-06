-- Vigencia explícita para no recalcular proyecciones anteriores ya conciliadas.
alter table public.descuentos
  add column if not exists fonacot_prorrateo_desde date;

comment on column public.descuentos.fonacot_prorrateo_desde is
  'Primer día cuyo periodo usa el prorrateo mensual por días calendario; periodos anteriores conservan el importe capturado.';

-- Confirmación del responsable: desde octubre de 2026, distribuir la cuota
-- mensual de los créditos FONACOT vigentes por días reales del calendario.
update public.descuentos
set fonacot_prorrateo='DIAS_CALENDARIO',
    fonacot_prorrateo_desde=date '2026-10-01',
    actualizado_por='Cambio confirmado por administrador: FONACOT calendario desde octubre 2026'
where tipo='FONACOT'
  and activo
  and recurrente
  and cuota_mensual>0
  and periodicidad='QUINCENAL'
  and fonacot_prorrateo='IMPORTE_CAPTURADO';

notify pgrst, 'reload schema';
