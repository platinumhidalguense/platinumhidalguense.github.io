// Pruebas con datos ficticios: no accede a Supabase ni modifica trabajadores reales.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8');
function fn(marker){const start=html.indexOf(marker);assert(start>=0,marker);const next=html.indexOf('\nfunction ',start+1);return html.slice(start,next<0?html.length:next);}
const box={Date,Number,Math,Error};vm.createContext(box);
const isr=html.match(/const ISR_M=\[.*?\];/)[0];
vm.runInContext(isr+'\n'+fn('function redondearCentavos(').split('\nfunction')[0]+'\n'+[
  'prFechaUTC','prSumarMeses','prAntiguedadLegal','prMontoLegal','prIsrMensual2026','prCalcularSeparacion'
].map(n=>fn('function '+n+'(')).join('\n'),box);
const base={escenario:'SI',desde:'2025-10-09',baja:'2026-10-08',pago:'2026-10-08',planta:'SI',sd:1000,sdi:1050,
  zona:'GENERAL',contrato:'INDETERMINADO',ultimo:30000,exento_usado:0,isr_manual:''};
const calc=p=>box.prCalcularSeparacion({...base,...p});
const a=calc({});assert.equal(a.antig.anios,1);assert.equal(a.tres_meses,94500);assert.equal(a.veinte_dias,0);
assert.equal(a.prima_antiguedad,7560.96);assert.equal(a.bruto,102060.96);assert.equal(a.exento,10557.90);assert.equal(a.gravado,91503.06);
const impuestoSueldo=1856.84+(30000-17533.65)*.2136;
assert.equal(a.isr,Math.round(91503.06*impuestoSueldo/30000*100)/100);assert(a.isr>0);
assert.equal(calc({veinte_convenio:true}).veinte_dias,21000);
const ind=calc({escenario:'ART50'});assert.equal(ind.veinte_dias,21000);assert.equal(ind.art50_determinado,0);
const det=calc({escenario:'ART50',contrato:'DETERMINADO'});assert.equal(det.art50_determinado,189000);assert.equal(det.veinte_dias,0);
const corto=calc({escenario:'ART50',contrato:'DETERMINADO',desde:'2026-09-29'});assert.equal(corto.antig.dias_servicio,10);assert.equal(corto.art50_determinado,5250);
assert.equal(calc({escenario:'ART50',contrato:'DETERMINADO',desde:'2024-10-09'}).art50_determinado,210000);
const just=calc({escenario:'JUSTIFICADO'});assert.equal(just.tres_meses,0);assert.equal(just.veinte_dias,0);assert.equal(just.prima_antiguedad,7560.96);
assert.equal(just.gravado,0);assert.equal(just.isr,0);
assert.equal(calc({escenario:'JUSTIFICADO',sd:100}).sd_prima,315.04);
assert.equal(calc({escenario:'JUSTIFICADO',zona:'ZLFN'}).sd_prima,881.74);
assert.equal(calc({escenario:'JUSTIFICADO',zona:'VALIDADO',sm:500}).sd_prima,1000);
assert.equal(calc({planta:'NO'}).prima_antiguedad,0);
assert.equal(calc({escenario:'RENUNCIA15',desde:'2011-10-09'}).antig.completos,15);
assert.throws(()=>calc({escenario:'RENUNCIA15'}),/15 años/);
assert.equal(box.prAntiguedadLegal('2026-01-01','2026-06-30').anios_fiscales,0);
assert.equal(box.prAntiguedadLegal('2026-01-01','2026-07-01').anios_fiscales,1);
assert.equal(box.prAntiguedadLegal('2024-02-29','2025-02-27').anios,1);
assert.equal(calc({pago:'2027-01-01',uma:120,isr_manual:'100'}).isr,100);
assert.equal(calc({pago:'2027-01-01',uma:120}).isr,null);
assert.equal(calc({exento_usado:1000}).exento,9557.90);
assert.equal(calc({isr_manual:'0'}).isr,0);
const pequeno=calc({escenario:'JUSTIFICADO',desde:'2026-09-01',sd:1000});
assert(pequeno.gravado>0&&pequeno.gravado<base.ultimo);
assert.equal(pequeno.isr,Math.round(box.prIsrMensual2026(pequeno.gravado)*100)/100);
assert.throws(()=>calc({planta:''}),/planta/);assert.throws(()=>calc({sdi:''}),/integrado/);
assert.throws(()=>calc({sdi:999}),/menor/);assert.throws(()=>calc({escenario:'ART50',contrato:'OBRA'}),/jurídicamente/);
assert.throws(()=>calc({baja:'2026-02-30'}),/válida/);assert.throws(()=>calc({pago:'2026-10-07'}),/anterior/);
assert.throws(()=>calc({isr_manual:'6.0224'}),/decimales/);assert.throws(()=>calc({isr_manual:-1}),/ISR/);
assert.throws(()=>calc({exento_usado:99999}),/supera/);assert.throws(()=>calc({ultimo:0}),/sueldo/);
assert.throws(()=>calc({baja:'2027-10-08',pago:'2027-10-08'}),/otro año/);
console.log('OK cálculos por escenarios, bases, prima, antigüedad calendario, exención compartida, ISR art. 96 y validaciones');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const dir=path.resolve('tmp/qa_separacion_20261008');fs.mkdirSync(dir,{recursive:true});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:900}});await page.route(/^https?:/,r=>r.abort());
    await page.goto(pathToFileURL(path.resolve('index.html')).href,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      OBRA={id:'qa',nombre:'PRUEBA',empresa_codigo:'PLATINUM'};OBRAS=[OBRA];CFGEMP={};DESC=[];PUEDE_EDITAR_TRABAJADORES=true;
      USER={id:'admin-qa',email:'darieljtg@gmail.com'};
      WORKERS=[{id:'qa',obra_id:'qa',no_trab:1,primer_apellido:'TRABAJADOR',nombres:'FICTICIO',fecha_alta:'2025-10-09',sd:1000,sdi:1050,estatus:'ACTIVO',periodo_pago:'SEMANAL'}];
      window._qaLogs=[];window._qaAplicado=null;window._qaGuardar=true;window._qaConfirm=true;
      window.confirm=()=>window._qaConfirm;toast=(msg)=>window._qaLogs.push(msg);
      registrarBitacoraNomina=async rows=>{window._qaAuditoria=rows;return window._qaGuardar;};
      window._qaOpenBajaOriginal=openBaja;openBaja=id=>{window._qaAplicado=id;};
      openPrestaciones('qa');$('pr-fecha').value='2026-10-08';calcPrestaciones('qa');
      document.querySelectorAll('.gate').forEach(e=>e.classList.add('hide'));
    });
    assert(await page.locator('#pr-legal').isHidden());
    const ordinary=await page.evaluate(()=>structuredClone(_PR_AUDIT));
    await page.selectOption('#pr-despido','SI');assert(await page.locator('#pr-legal').isVisible());
    assert(await page.locator('#pr-usar').isDisabled());assert(await page.locator('#pr-out').innerText().then(t=>t.includes('Separación pendiente')));
    await page.fill('#pr-pago-legal','2026-10-08');await page.selectOption('#pr-planta-legal','SI');
    await page.fill('#pr-sdi-legal','1050');await page.fill('#pr-ultimo-legal','30000');
    const result=await page.evaluate(()=>structuredClone(_PR_AUDIT));assert.equal(result.resultado.indemnizacion.veinte_dias,0);
    assert.equal(result.resultado.indemnizacion.tres_meses,94500);assert(result.resultado.isr_separacion>0);
    assert.equal(result.resultado.aguinaldo,ordinary.resultado.aguinaldo);assert.equal(result.resultado.vacaciones,ordinary.resultado.vacaciones);
    await page.fill('#pr-ref-legal','Papel de trabajo ficticio QA');await page.check('#pr-validado-legal');
    assert(await page.locator('#pr-usar').isDisabled()); // falta NOI
    await page.fill('#pr-noi',String(result.monto_modelo));assert(await page.locator('#pr-usar').isDisabled()); // falta ISR ordinario explícito
    await page.fill('#pr-isr-noi',String(result.resultado.isr));await page.check('#pr-validado-legal');assert(await page.locator('#pr-usar').isEnabled());
    await page.check('#pr-litigo-legal');assert(await page.locator('#pr-usar').isDisabled());await page.uncheck('#pr-litigo-legal');
    assert.equal(await page.locator('#pr-validado-legal').isChecked(),false);await page.check('#pr-validado-legal');
    await page.evaluate(async()=>{USER.email='lectura@ejemplo.invalid';await usarEnBaja('qa');});
    assert.equal(await page.evaluate(()=>window._qaAplicado),null);
    await page.evaluate(()=>{USER.email='darieljtg@gmail.com';calcPrestaciones('qa');});
    await page.evaluate(async()=>{window._qaConfirm=false;await usarEnBaja('qa');});assert.equal(await page.evaluate(()=>window._qaAplicado),null);
    await page.evaluate(async()=>{window._qaConfirm=true;window._qaGuardar=false;await usarEnBaja('qa');});assert.equal(await page.evaluate(()=>window._qaAplicado),null);
    assert(await page.locator('#pr-usar').isEnabled());
    await page.evaluate(()=>{window._qaGuardar=true;WORKERS[0].estatus='BAJA';calcPrestaciones('qa');});assert(await page.locator('#pr-usar').isDisabled());
    assert(await page.locator('#pr-out').innerText().then(t=>t.includes('no se reemplaza')));
    await page.evaluate(()=>{WORKERS[0].estatus='ACTIVO';calcPrestaciones('qa');});
    await page.selectOption('#pr-despido','ART50');assert.equal(await page.locator('#pr-noi').inputValue(),'');
    await page.selectOption('#pr-contrato-legal','DETERMINADO');
    assert.equal(await page.evaluate(()=>_PR_AUDIT.resultado.indemnizacion.art50_determinado),189000);
    await page.selectOption('#pr-despido','JUSTIFICADO');assert(await page.locator('#pr-sdi-legal').isDisabled());
    assert.equal(await page.evaluate(()=>_PR_AUDIT.resultado.indemnizacion.tres_meses),0);
    await page.selectOption('#pr-despido','SI');
    await page.fill('#pr-sdi-legal','1050');await page.fill('#pr-isr-noi',String(result.resultado.isr));
    await page.fill('#pr-noi',String(result.monto_modelo));await page.check('#pr-validado-legal');
    await page.locator('#pr-legal details summary').click();await page.click('button:has-text("Proponer base de salario fijo")');
    assert.equal(await page.evaluate(()=>Number($('pr-sdi-legal').value)),1049.315068);
    assert.equal(await page.locator('#pr-validado-legal').isChecked(),false);
    await page.fill('#pr-sdi-legal','1050');await page.locator('#pr-legal details summary').click();await page.check('#pr-validado-legal');
    for(const width of [390,1366])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
      await page.locator('#pr-legal').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,`separacion_${width}_${theme}.png`)});
      const overflow=await page.locator('#pr-legal').evaluate(e=>e.scrollWidth>e.clientWidth+2);assert.equal(overflow,false);
    }
    await page.evaluate(async()=>{openBaja=window._qaOpenBajaOriginal;await usarEnBaja('qa');});
    await page.waitForTimeout(180);
    assert.equal(await page.locator('#b-fecha').inputValue(),'2026-10-08');
    assert.equal(await page.locator('#b-motivo-cat').inputValue(),'OTRO');
    assert.match(await page.locator('#b-motivo').inputValue(),/^SEPARACION LFT \[SI\]/);
    assert.equal(await page.evaluate(()=>window._qaAuditoria[0].tipo_calculo),'SEPARACION_VALIDADA');
    await page.evaluate(async()=>{
      window._qaUpdate=null;window._qaWrites=0;markWrite=()=>window._qaWrites++;
      sb={from:table=>({update:payload=>({eq:async(field,id)=>{window._qaUpdate={table,payload,field,id};return {error:null};}})})};
      $('b-finiquito').value='1';await doBaja('qa');
    });
    assert.equal(await page.evaluate(()=>window._qaUpdate),null);assert.equal(await page.evaluate(()=>window._qaWrites),0);
    await page.evaluate(async()=>{
      $('b-finiquito').value=_PR_AUDIT.monto_aplicado;$('b-fecha').value='2026-10-09';await doBaja('qa');
    });assert.equal(await page.evaluate(()=>window._qaUpdate),null);
    await page.evaluate(async()=>{
      $('b-fecha').value='2026-10-08';$('b-motivo-cat').value='RENUNCIA VOLUNTARIA';await doBaja('qa');
    });assert.equal(await page.evaluate(()=>window._qaUpdate),null);
    await page.evaluate(async()=>{
      $('b-motivo-cat').value='OTRO';$('b-cheque').checked=false;
      loadObraData=async()=>{};refreshCounts=()=>{};generarBajaDoc=()=>{};await doBaja('qa');
    });
    const persistido=await page.evaluate(()=>window._qaUpdate);assert.equal(persistido.table,'trabajadores');
    assert.equal(persistido.field,'id');assert.equal(persistido.id,'qa');assert.equal(persistido.payload.motivo_baja,'OTRO');
    assert(persistido.payload.observaciones.includes('SEPARACION LFT [SI]'));assert.equal(persistido.payload.fecha_baja,'2026-10-08');
    assert.equal(await page.evaluate(()=>window._qaAuditoria[0].tipo_calculo),'FINIQUITO_APLICADO');
    console.log('OK interfaz, integración fija, separación de ISR, NOI obligatorio, permisos, confirmación, bitácora y conservación de bajas registradas; capturas: '+dir);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
