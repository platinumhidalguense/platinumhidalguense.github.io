// Único punto de pruebas. No abre navegador ni modifica producción.
const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
const privateMigration=fs.readdirSync('supabase/migrations').some(n=>n.endsWith('_integracion_seguridad_heredada_y_revision_historica.sql'));
const suites=['test_modularizacion','test_auditoria_global','test_auditoria_lecturas','test_correo_sin_secretos','test_integracion_carga_segura','test_sincronizacion_global','test_mantenimiento_confirmado','test_autorizacion_cierres_global','test_interfaz_progresiva','test_acuses_imss','test_semana_historica','test_flujo_financiero_pg','test_flujo_financiero_casos','test_flujo_integrado_ui',...(privateMigration?['test_seguridad_historicos_pg']:[]),'test_historicos_ui'];
if(!privateMigration)console.log('ALCANCE PÚBLICO: la migración privada de seguridad no está en este repositorio. Sus 27 comprobaciones requieren el paquete privado; no se cuentan como ejecutadas.');
for(const file of suites){
 const r=spawnSync(process.execPath,['scripts/'+file+'.cjs'],{encoding:'utf8',maxBuffer:4e6});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)process.exit(r.status||1);
}
console.log('PASS '+suites.length+' suites reproducibles; incluyen '+(privateMigration?95:68)+' comprobaciones PostgreSQL, contratos de UI, paginación y conservación de motores. Sin aceptación visual de navegador.');
