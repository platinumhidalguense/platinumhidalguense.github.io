// Único punto de pruebas. No abre navegador ni modifica producción.
const path=require('node:path'),{spawnSync}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
const suites=['test_integracion_carga_segura','test_sincronizacion_global','test_mantenimiento_confirmado','test_autorizacion_cierres_global','test_interfaz_progresiva','test_acuses_imss','test_semana_historica','test_flujo_financiero_pg','test_flujo_financiero_casos','test_flujo_integrado_ui'];
for(const file of suites){
 const r=spawnSync(process.execPath,['scripts/'+file+'.cjs'],{encoding:'utf8',maxBuffer:4e6});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)process.exit(r.status||1);
}
console.log('PASS '+suites.length+' suites públicas reproducibles; incluyen 68 comprobaciones PostgreSQL y 14 contratos UI. Sin aceptación visual de navegador.');
