// Único punto de pruebas. No abre navegador ni modifica producción.
const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
const privateMigration=fs.readdirSync('supabase/migrations').some(n=>n.endsWith('_integracion_seguridad_heredada_y_revision_historica.sql'));
const rrhhPrivate=fs.readdirSync('supabase/migrations').filter(n=>/_rrhh_(orquestacion_corte_y_procesos|trazabilidad_y_expediente)\.sql$/.test(n)).length===2;
const pagosPrivate=fs.readdirSync('supabase/migrations').filter(n=>/_pagos_(pendientes_revision_sabado|conectores_y_aviso_programado)\.sql$/.test(n)).length===2;
const chequesPrivate=pagosPrivate&&fs.readdirSync('supabase/migrations').some(n=>n.endsWith('_cheques_cancelacion_fisica_y_papelera.sql'));
const suites=['test_modularizacion','test_auditoria_global','test_auditoria_lecturas','test_correo_sin_secretos','test_integracion_carga_segura','test_sincronizacion_global','test_mantenimiento_confirmado','test_autorizacion_cierres_global','test_interfaz_progresiva','test_acuses_imss','test_semana_historica','test_flujo_financiero_pg','test_flujo_financiero_casos','test_flujo_integrado_ui',...(privateMigration?['test_seguridad_historicos_pg']:[]),'test_historicos_ui','test_rrhh_ui',...(rrhhPrivate?['test_rrhh_procesos_pg','test_rrhh_consultas_pg','test_rrhh_salud_pg','test_rrhh_financiero_pg']:[])];
if(!privateMigration)console.log('ALCANCE PÚBLICO: la migración privada de seguridad no está en este repositorio. Sus 27 comprobaciones requieren el paquete privado; no se cuentan como ejecutadas.');
if(!rrhhPrivate)console.log('ALCANCE PÚBLICO RRHH: se prueban botones y contratos de interfaz. Las 66 comprobaciones PostgreSQL RRHH requieren las dos migraciones del paquete privado; no se cuentan como ejecutadas aquí.');
if(pagosPrivate)suites.push('test_pagos_sabado_pg','test_pagos_sabado_retiros_pg');
else console.log('ALCANCE PÚBLICO PAGOS: las 50 comprobaciones PostgreSQL de revisión de sábado requieren las migraciones privadas; no se cuentan como ejecutadas.');
suites.push('test_pagos_sabado_ui');
if(chequesPrivate)suites.push('test_cheques_estado_pg');
else console.log('ALCANCE PÚBLICO CHEQUES: las 12 comprobaciones PostgreSQL del estado físico requieren la migración privada; no se cuentan como ejecutadas.');
suites.push('test_cheques_estado_ui','test_rendimiento_centros','test_revision_pagos_seleccion_ui');
const rendimientoPrivate=fs.readdirSync('supabase/migrations').some(n=>n.endsWith('_rendimiento_lectura_centros.sql'));
if(rendimientoPrivate)suites.push('test_rendimiento_rls_pg');
else console.log('ALCANCE PÚBLICO RENDIMIENTO: se prueban las lecturas y vistas en VM; 30 comprobaciones RLS requieren la migración privada y no se cuentan aquí.');
const revisionPrivate=chequesPrivate&&fs.readdirSync('supabase/migrations').some(n=>n.endsWith('_conciliacion_finiquitos_y_seleccion_pagos.sql'));
if(revisionPrivate)suites.push('test_revision_pagos_finiquitos_pg');
else console.log('ALCANCE PÚBLICO CONCILIACIÓN: se prueban selección y botones en VM; 28 comprobaciones PostgreSQL adicionales requieren el paquete privado y no se cuentan aquí.');
for(const file of suites){
 const r=spawnSync(process.execPath,['scripts/'+file+'.cjs'],{encoding:'utf8',maxBuffer:4e6});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)process.exit(r.status||1);
}
console.log('PASS '+suites.length+' suites reproducibles; incluyen '+((privateMigration?95:68)+(rrhhPrivate?66:0)+(pagosPrivate?50:0)+(chequesPrivate?12:0)+(rendimientoPrivate?30:0)+(revisionPrivate?28:0))+' comprobaciones PostgreSQL, contratos de UI, paginación y conservación de motores. Sin aceptación visual de navegador.');
