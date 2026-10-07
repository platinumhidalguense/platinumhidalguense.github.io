// Copia local, datos ficticios y Supabase simulado. Ninguna petición de red permitida.
const {chromium}=require('playwright'),{pathToFileURL}=require('node:url');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve('tmp/qa_formulario_20261007');fs.mkdirSync(dir,{recursive:true});
async function preparar(page){
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve('index.html')).href,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    document.querySelectorAll('.gate').forEach(e=>e.classList.add('hide'));$('scr-app').classList.remove('hide');
    USER={id:'qa-admin',email:'darieljtg@gmail.com'};PUEDE_EDITAR_TRABAJADORES=true;
    OBRAS=[{id:'obra',nombre:'INFONAVIT SAN CRISTOBAL',empresa_codigo:'PLATINUM',tipo:'OBRA',registro_patronal:'B6918617105',prima_rt:7.5,fecha_inicio:'2026-03-30'},{id:'jire',nombre:'OBRA BANCOMER',empresa_codigo:'JIRE',tipo:'OBRA'}];OBRA=OBRAS[0];EMPRESA_ACTIVA='PLATINUM';CFGEMP={tabulador:{'AYUDANTE GENERAL':362}};
    CONTRATISTAS=[{nombre:'MG'},{nombre:'ARACELI'}];CUADS=[{id:'cuad',contratista:'MG',nombre:'MG GENERAL',activa:true}];
    WORKERS=[{id:'worker',obra_id:'obra',no_trab:12,primer_apellido:'VAZQUEZ',segundo_apellido:'RODRIGUEZ',nombres:'EMILIO',estatus:'ACTIVO',contratista:'MG',id_cuadrilla:'cuad',puesto:'AYUDANTE GENERAL',turno:'DIURNO',funciones:'APOYO',fecha_alta:'2026-09-01',fecha_reingreso:null,fecha_baja:null,semana_ingreso:'NOMINA 23',periodo_pago:'SEMANAL',tipo_contrato:'OBRA DETERMINADA',fecha_fin_contrato:null,sd:362,sdi:380,sal_semanal:2400,curp:'VAZR900101HHGZDX09',rfc:'VAZR900101AB1',nss:'12345678901',fecha_nacimiento:'1990-01-01',genero:'MASCULINO',estado_civil:'SOLTERO',escolaridad:'PREPA',nacionalidad:'MEXICANA',edo_nacimiento:'HIDALGO',direccion:'DOMICILIO DE PRUEBA',cp:'42086',telefono:'5555555555',correo:'qa@example.test',beneficiario:'PERSONA DE PRUEBA',benef_parentesco:'MADRE',benef_telefono:'5555555555',benef_porcentaje:100,cuenta:'1234567890',clabe:'',banco:'BBVA',forma_pago:'TRANSFERENCIA',observaciones:'OBSERVACION DE PRUEBA',movimiento_imss:'ALTA CON ACUSE',fecha_mov_imss:'2026-09-01',registro_patronal:'B6918617105',prima_rt:4.12345,updated_at:'2026-10-07T00:00:00Z',docs:{'INE':'ENTREGADO','SOLICITUD DE EMPLEO':'NO APLICA','DATO_LEGADO':'CONSERVAR'},drive_link:'https://drive.google.com/qa'}];
    CHEQUES=[];DESC=[];VAC=[];ACTAS=[];NOM=[];PAGOS=[];ALTAS_CORTAS=[];
    DOCSX=[{id:'acuse',trabajador_id:'worker',categoria:'ACUSE_IMSS',subtipo:'ALTA',fecha_doc:'2026-09-01',nombre_archivo:'acuse-prueba.pdf'}];
    window.qaWrites=[];window.qaToasts=[];window.qaError=null;window.qaZero=false;
    toast=(m,t)=>window.qaToasts.push({m,t});loadObraData=async()=>true;refreshCounts=async()=>{};cpAvisaAlta=async()=>{};refrescaDocsDe=async()=>0;refrescaPagosDe=async()=>0;
    sb={from:table=>{let payload,op,filters={};const q={update:v=>{payload=v;op='update';return q;},insert:v=>{payload=v;op='insert';return q;},eq:(k,v)=>{filters[k]=v;return q;},select:async()=>{
      window.qaWrites.push({table,payload:structuredClone(payload),op,filters});
      if(window.qaGate)await new Promise(r=>window.qaRelease=r);
      return {data:window.qaZero?[]:[{id:op==='insert'?'created':'worker',updated_at:'2026-10-07T01:00:00Z'}],error:window.qaError};
    }};return q;}};
    initSidebar();NAV_STEP='trabajadores';$('scr-app').setAttribute('data-nav','trabajadores');renderTable();
  });
}
async function dimensiones(page){return page.evaluate(()=>{
  const modal=document.querySelector('.worker-form'),body=$('worker-form-body'),r=modal.getBoundingClientRect();
  const footer=modal.querySelector('.m-foot').getBoundingClientRect();
  return {x:r.x,right:r.right,bottom:r.bottom,width:r.width,viewport:innerWidth,height:innerHeight,footer:footer.bottom,bodyScroll:body.scrollWidth,bodyClient:body.clientWidth};
});}
async function run(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  let runs=0;
  try{
    for(const [width,height] of [[1366,768],[1920,1080],[3840,2160],[768,1024],[390,844]])for(const theme of ['dark','light']){
      const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await preparar(page);await page.evaluate(t=>{document.documentElement.setAttribute('data-theme',t);openForm('worker');},theme);
      await page.waitForFunction(()=>['.overlay','.worker-form'].every(s=>Number(getComputedStyle(document.querySelector(s)).opacity)>=.999));
      assert.equal(await page.locator('#wf-step-1').isVisible(),true);assert.equal(await page.locator('#wf-step-2').isVisible(),false);
      assert.equal(await page.locator('#save-btn').isVisible(),false);assert.equal(await page.locator('#wf-back').isVisible(),false);assert(await page.locator('#wf-next').isVisible());
      const ids=await page.locator('.worker-form [id]').evaluateAll(es=>es.map(e=>e.id));assert.equal(new Set(ids).size,ids.length,'IDs duplicados');
      assert.equal(await page.locator('#f-movimiento_imss,#f-fecha_mov_imss,#f-rp_trab,#f-prima_trab').count(),0,'IMSS no se amontona en el registro');
      assert.equal(await page.locator('#f-obra_id option[value="jire"]').count(),0,'La selección conserva separación de razón social');
      assert.equal(await page.locator('#f-id_cuadrilla').inputValue(),'cuad');
      const payload=await page.evaluate(()=>collectForm());
      assert.equal(payload.docs.INE,'ENTREGADO');assert.equal(payload.docs['SOLICITUD DE EMPLEO'],'NO APLICA');assert.equal(payload.docs.DATO_LEGADO,'CONSERVAR');
      for(const k of ['movimiento_imss','fecha_mov_imss','registro_patronal','prima_rt'])assert(!Object.hasOwn(payload,k),'Edición general debe omitir '+k);
      for(const k of ['contratista','id_cuadrilla','puesto','funciones','turno','fecha_alta','semana_ingreso','periodo_pago','sd','sdi','sal_semanal','curp','rfc','nss','direccion','cp','telefono','correo','beneficiario','benef_parentesco','benef_telefono','benef_porcentaje','cuenta','clabe','banco','forma_pago','observaciones','drive_link']){
        const original=await page.evaluate(k=>WORKERS[0][k],k);assert.equal(payload[k],original,`Dato alterado al reorganizar: ${k}`);
      }
      const m=await dimensiones(page);assert(m.x>=-1&&m.right<=width+1&&m.bottom<=height+1&&m.footer<=height+1&&m.bodyScroll<=m.bodyClient+1,JSON.stringify(m));
      await page.screenshot({path:path.join(dir,`${width}_${theme}_asignacion.png`)});
      await page.locator('#wf-next').click();assert(await page.locator('#wf-step-2').isVisible());
      await page.locator('#f-nombres').fill('EMILIO EDITADO');await page.locator('#wf-back').click();assert.equal(await page.locator('#f-nombres').inputValue(),'EMILIO EDITADO','Retroceder no pierde datos');
      await page.locator('#wf-tab-2').click();await page.screenshot({path:path.join(dir,`${width}_${theme}_datos.png`)});
      await page.locator('#wf-tab-3').click();assert.equal(await page.locator('#wf-documentos select').count(),0);assert.equal(await page.locator('#wf-documentos input[type="checkbox"]').count(),14);
      assert(await page.locator('#save-btn').isVisible());assert.equal(await page.locator('#wf-next').isVisible(),false);
      await page.locator('#doc-ent-SOLICITUDDEEMPLEO').check();assert.equal(await page.locator('#doc-na-SOLICITUDDEEMPLEO').isChecked(),false);assert.equal(await page.locator('#doc-SOLICITUDDEEMPLEO').inputValue(),'ENTREGADO');
      await page.locator('#doc-ent-SOLICITUDDEEMPLEO').uncheck();assert.equal(await page.locator('#doc-SOLICITUDDEEMPLEO').inputValue(),'PENDIENTE');
      await page.locator('#doc-na-SOLICITUDDEEMPLEO').check();assert.equal(await page.locator('#doc-SOLICITUDDEEMPLEO').inputValue(),'NO APLICA');
      assert((await page.locator('#wf-review').innerText()).includes('EMILIO EDITADO'));
      await page.screenshot({path:path.join(dir,`${width}_${theme}_documentos.png`)});
      await page.locator('#save-btn').click();assert.equal(await page.locator('.worker-form').count(),0);
      const writes=await page.evaluate(()=>qaWrites);assert.equal(writes.length,1);assert.equal(writes[0].op,'update');assert.equal(writes[0].filters.id,'worker');assert.equal(writes[0].payload.nombres,'EMILIO EDITADO');
      assert(!Object.hasOwn(writes[0].payload,'movimiento_imss'));assert(!Object.hasOwn(writes[0].payload,'registro_patronal'));
      assert.deepEqual(errors,[]);runs++;await page.close();
    }
    // Validación oculta, error de guardado, doble clic, alta incompleta y rol consulta.
    const page=await browser.newPage({viewport:{width:1366,height:768}});await preparar(page);await page.evaluate(()=>openForm('worker'));
    await page.locator('#wf-tab-2').click();await page.locator('#f-nombres').fill('');await page.locator('#wf-tab-3').click();await page.locator('#save-btn').click();assert(await page.locator('#wf-step-2').isVisible());assert.equal(await page.evaluate(()=>document.activeElement.id),'f-nombres');assert.equal(await page.evaluate(()=>qaWrites.length),0);
    await page.locator('#f-nombres').fill('EMILIO');await page.locator('#wf-tab-3').click();await page.evaluate(()=>qaError={message:'error simulado'});await page.locator('#save-btn').click();assert(await page.locator('.worker-form').isVisible());assert.equal(await page.locator('#save-btn').isEnabled(),true);assert.equal(await page.locator('#f-nombres').inputValue(),'EMILIO');
    await page.evaluate(()=>{qaError=null;qaGate=true;qaWrites=[];saveWorker('worker');});await page.waitForFunction(()=>typeof qaRelease==='function');await page.evaluate(()=>saveWorker('worker'));assert.equal(await page.evaluate(()=>qaWrites.length),1);await page.evaluate(()=>{qaGate=false;qaRelease();});await page.waitForFunction(()=>!$('worker-form-body'));
    await page.evaluate(()=>{qaWrites=[];openForm(null);});await page.locator('#wf-tab-2').click();await page.locator('#f-nombres').fill('ALTA PENDIENTE');await page.locator('#wf-tab-3').click();await page.locator('#save-btn').click();const newWrite=await page.evaluate(()=>qaWrites[0]);assert.equal(newWrite.op,'insert');assert.equal(newWrite.payload.estatus,'PENDIENTE');assert.equal(newWrite.payload.movimiento_imss,'SIN MOVIMIENTO');assert.equal(newWrite.payload.cuenta,'CREAR');
    await page.evaluate(()=>{qaWrites=[];openDetail('worker');openIMSSWorker('worker');});assert.equal(await page.locator('#imss-rp').inputValue(),'B6918617105');await page.waitForFunction(()=>[...document.querySelectorAll('.overlay,.modal')].every(e=>Number(getComputedStyle(e).opacity)>=.999));await page.screenshot({path:path.join(dir,'control_imss.png')});
    await page.locator('#imss-mov').selectOption('ALTA PRESENTADA');await page.locator('#imss-save').click();const imss=await page.evaluate(()=>qaWrites[0]);assert.equal(imss.filters.id,'worker');assert.equal(imss.filters.obra_id,'obra');assert.equal(imss.filters.updated_at,'2026-10-07T00:00:00Z');assert.equal(imss.payload.movimiento_imss,'ALTA PRESENTADA');assert(!Object.hasOwn(imss.payload,'nombres'));
    await page.evaluate(()=>{qaWrites=[];openIMSSWorker('worker');qaZero=true;});await page.locator('#imss-save').click();assert(await page.locator('#imss-save').isEnabled());assert((await page.evaluate(()=>qaToasts.at(-1).m)).includes('no tienes permiso'));await page.evaluate(()=>{closeModal2();closeModal();USER.email='consulta@example.test';PUEDE_EDITAR_TRABAJADORES=false;qaWrites=[];openForm(null);});assert.equal(await page.locator('.worker-form').count(),0);await page.evaluate(()=>saveWorker(null));assert.equal(await page.evaluate(()=>qaWrites.length),0);
    await page.close();
    // Baja/reingreso y cancelación: no se pierde información ni se confirma una escritura vacía.
    const extra=await browser.newPage({viewport:{width:390,height:844}});await preparar(extra);
    await extra.evaluate(()=>{Object.assign(WORKERS[0],{estatus:'BAJA',fecha_baja:'2026-09-28',monto_finiquito:1234.56,motivo_baja:MOTIVOS_BAJA[0]});openForm('worker');});
    let p=await extra.evaluate(()=>collectForm());assert.equal(p.fecha_baja,'2026-09-28');assert.equal(p.monto_finiquito,1234.56);
    assert(await extra.locator('#f-fecha_baja').isVisible());assert(await extra.locator('#f-monto_finiquito').isVisible());
    let m=await dimensiones(extra);assert(m.bodyScroll<=m.bodyClient+1,JSON.stringify(m));
    await extra.evaluate(()=>{closeModal(true);Object.assign(WORKERS[0],{estatus:'ACTIVO',fecha_reingreso:'2026-10-05'});openForm('worker');});
    p=await extra.evaluate(()=>collectForm());assert.equal(p.fecha_reingreso,'2026-10-05');assert.equal(p.fecha_baja,'2026-09-28');assert(!Object.hasOwn(p,'monto_finiquito'));
    await extra.locator('#f-contratista').fill('MG EDITADO');extra.once('dialog',d=>d.dismiss());await extra.locator('.worker-form .x').click();assert(await extra.locator('.worker-form').isVisible());assert.equal(await extra.locator('#f-contratista').inputValue(),'MG EDITADO');
    extra.once('dialog',d=>d.accept());await extra.locator('.worker-form .x').click();assert.equal(await extra.locator('.worker-form').count(),0);assert.equal(await extra.evaluate(()=>qaWrites.length),0);
    await extra.evaluate(()=>{openForm('worker');qaZero=true;});await extra.locator('#wf-tab-3').click();await extra.locator('#save-btn').click();assert(await extra.locator('.worker-form').isVisible());assert(await extra.locator('#save-btn').isEnabled());assert((await extra.evaluate(()=>qaToasts.at(-1).m)).includes('No se confirmó el registro'));
    await extra.close();console.log(JSON.stringify({visual:runs,phases:3,preserved:'datos, documentos, IMSS y registro patronal',flow:'alta/edición/baja/reingreso/cancelación/validación/error/doble clic/consulta/control IMSS',screenshots:dir}));
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
