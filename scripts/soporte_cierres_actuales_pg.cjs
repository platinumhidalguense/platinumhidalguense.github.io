const fs=require('fs'),base=require('./soporte_pagos_sabado_pg.cjs');
async function makeDatabase({sinReingresos=false}={}){const db=await base.makeDatabase();try{
 await db.exec('create table public.historial(id uuid primary key default gen_random_uuid(),obra_id uuid,trabajador_id uuid,accion text,datos_antes jsonb,datos_despues jsonb,fecha timestamptz default now())');
 for(const end of ['_conciliacion_finiquitos_y_seleccion_pagos.sql','_visor_semanal_pagos.sql','_recibos_lectura_gemini.sql','_cheques_neto_fuentes_alternas.sql','_noi_identidad_y_estado_expedicion.sql','_noi_ceros_sin_servicio_confirmado.sql','_noi_validacion_identidad_indexada.sql','_cierres_legado_preparacion_y_vip.sql','_cierres_autorizacion_directa_y_excepcion_acotada.sql','_excepcion_noi_individual_auditada.sql','_correcciones_historicas_centavos_aprobadas.sql','_timbrado_xml_o_pdf_verificado.sql','_optimizar_autorizacion_cierre_masivo.sql','_cierres_historicos_y_lectura_cfdi.sql','_noi_identidad_historica_documentada.sql','_cierres_vinculacion_comprobantes_en_lote.sql']){
  const f=fs.readdirSync('supabase/migrations').find(f=>f.endsWith(end));if(!f)throw Error('Falta migración privada '+end);await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 }
 if(!sinReingresos){const f=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_reingresos_ciclos_sin_reabrir_cierres.sql'));if(f)await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));}
 const cheque=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_cheques_existentes_expedicion_independiente.sql'));if(cheque)await db.exec(fs.readFileSync('supabase/migrations/'+cheque,'utf8'));
 return db;
 }catch(e){await db.close();throw e;}}
module.exports={...base,makeDatabase};
