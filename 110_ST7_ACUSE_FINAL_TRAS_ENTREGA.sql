-- El único escaneo archivado corresponde al acuse completo, con ambas firmas.
alter table public.control_st7_acuses
  add constraint control_st7_acuse_final_tras_entrega_ck
  check (acuse_firmado_archivo is null or devuelto_en is not null);

