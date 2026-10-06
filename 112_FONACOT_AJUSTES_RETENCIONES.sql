-- Retenciones por periodo: conserva los importes capturados y permite optar
-- expresamente por el prorrateo calendario de la cédula mensual FONACOT.
-- Los ajustes se guardan por semana en el mismo crédito y el trigger existente
-- trg_desc_audit registra el estado anterior y posterior en historial.
alter table public.descuentos
  add column if not exists fonacot_prorrateo text not null default 'IMPORTE_CAPTURADO',
  add column if not exists ajustes_semana jsonb not null default '{}'::jsonb;

alter table public.descuentos
  add constraint descuentos_fonacot_prorrateo_chk
  check (fonacot_prorrateo in ('IMPORTE_CAPTURADO', 'DIAS_CALENDARIO'));

alter table public.descuentos
  add constraint descuentos_ajustes_semana_objeto_chk
  check (jsonb_typeof(ajustes_semana) = 'object');

comment on column public.descuentos.fonacot_prorrateo is
  'IMPORTE_CAPTURADO respeta el importe periódico existente; DIAS_CALENDARIO distribuye la cuota mensual FONACOT según las fechas reales de cada mes.';
comment on column public.descuentos.ajustes_semana is
  'Ajustes auditados por semana: importe base sustituido, fechas adicionales de periodos previos y motivo. El historial conserva cada versión.';

notify pgrst, 'reload schema';
