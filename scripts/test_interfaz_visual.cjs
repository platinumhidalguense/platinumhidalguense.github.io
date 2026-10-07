// Pruebas visuales de una copia local. Toda la red queda bloqueada; datos ficticios.
const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve('tmp/qa_interfaz_20261007');fs.mkdirSync(dir,{recursive:true});
async function fixture(page){
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve('index.html')).href,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    document.querySelectorAll('.gate').forEach(e=>e.classList.add('hide'));
    $('scr-app').classList.remove('hide');
    USER={id:'test-admin',email:'darieljtg@gmail.com'};
    OBRAS=[{id:'p',nombre:'INFONAVIT SAN CRISTOBAL',tipo:'OBRA',empresa_codigo:'PLATINUM',registro_patronal:'RP-PRUEBA',registro_siroc:'SIROC-PRUEBA',fecha_inicio:'2026-03-30'},{id:'j',nombre:'OBRA BANCOMER',tipo:'OBRA',empresa_codigo:'JIRE',fecha_inicio:'2026-03-30'}];
    WORKERS=Array.from({length:80},(_,i)=>({id:'test-'+i,no_trab:i+1,obra_id:'p',primer_apellido:'APELLIDO',segundo_apellido:'DE PRUEBA',nombres:'TRABAJADOR '+(i+1),estatus:i===2?'BAJA':'ACTIVO',fecha_alta:'2026-09-01',fecha_baja:i===2?'2026-09-28':null,fecha_reingreso:i===3?'2026-09-28':null,contratista:i%2?'MG':'ARACELI',puesto:'AYUDANTE GENERAL',periodo_pago:'SEMANAL',sd:362,sdi:380,sal_semanal:2400,cuenta:'CREAR',telefono:'5555555555',correo:'prueba@example.test',docs:{}}));
    DOCSX=[{id:'doc-prueba',trabajador_id:'test-0',categoria:'ACUSE_IMSS',subtipo:'ALTA',fecha_doc:'2026-09-01',nombre_archivo:'acuse-prueba.pdf'}];
    CUADS=[{id:'q',nombre:'CUADRILLA DE PRUEBA'}];WORKERS[0].id_cuadrilla='q';
    CHEQUES=[];DESC=[];ACTAS=[];NOM=[];VAC=[];PAGOS=[];ALTAS_CORTAS=[];OBRA=null;
    refreshCounts=async()=>{};refrescaDocsDe=async()=>0;refrescaPagosDe=async()=>0;
    loadObraData=async()=>{
      $('flt-contratista').innerHTML='<option value="">Contratista: todos</option><option>MG</option><option>ARACELI</option>';
      renderStats();renderTable();return true;
    };
    initSidebar();showNavStep('empresa');
  });
  await page.waitForTimeout(250);
}
async function metrics(page){return page.evaluate(()=>{
  const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,visible:r.width>0&&r.height>0};};
  return {viewport:innerWidth,shell:rect('.shell'),company:rect('#empresa-step'),bodyWidth:document.documentElement.scrollWidth,nav:NAV_STEP};
});}
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const reports=[];
  try{
    for(const [width,height] of [[1366,768],[1920,1080],[3840,2160],[768,1024],[390,844]])for(const theme of ['dark','light']){
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
      const m=await metrics(page);reports.push({...m,theme});
      await page.screenshot({path:path.join(dir,`${width}_${theme}_empresa.png`),fullPage:true});
      assert(m.shell.width>=width-2,`Contenido comprimido: ${JSON.stringify(m)}`);
      assert(m.bodyWidth<=width+2,`Desbordamiento de empresa: ${JSON.stringify(m)}`);
      const companyCards=await page.locator('#empresa-selector .empresa-btn').count();assert.equal(companyCards,2);
      await page.locator('#empresa-selector .empresa-btn').first().click();assert.equal(await page.evaluate(()=>NAV_STEP),'obra');
      assert(await page.locator('#obra-step').isVisible());assert(!(await page.locator('#empresa-step').isVisible()));
      await page.screenshot({path:path.join(dir,`${width}_${theme}_obra.png`),fullPage:true});
      await page.locator('#obra-bar .obra-tab[onclick*="selectObra"]').click();assert.equal(await page.evaluate(()=>NAV_STEP),'trabajadores');
      assert.equal(await page.locator('#tbody tr').count(),80);assert.equal(await page.locator('.trab-table thead th').count(),6);
      const table=await page.locator('.worker-list').boundingBox();assert(table.width>=width-40,`Tabla estrecha: ${JSON.stringify(table)}`);assert(table.height>=height*.55,`Tabla sin espacio: ${JSON.stringify(table)}`);
      assert((await page.locator('#tbody tr').first().innerText()).includes('Alta con acuse'));
      assert((await page.locator('#tbody tr').nth(2).innerText()).includes('Baja pendiente'));
      await page.screenshot({path:path.join(dir,`${width}_${theme}_trabajadores.png`)});
      await page.locator('#burger').click();assert(await page.locator('#sidebar').isVisible());
      await page.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().x>=-1);
      assert((await page.locator('.shell').boundingBox()).width>=width-2,'El menú no debe comprimir el contenido');
      const drawer=await page.locator('#sidebar').boundingBox();assert(drawer.x>=-1&&drawer.width>200);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>sidebarVisible()),false);
      await page.locator('.worker-filters>summary').click();await page.locator('#flt-contratista').selectOption('MG');assert.equal(await page.locator('#tbody tr').count(),40);await page.locator('.worker-filters button[onclick="resetWorkerFilters()"]').click();assert.equal(await page.locator('#tbody tr').count(),80);await page.locator('.worker-filters>summary').click();
      await page.locator('#q').fill('TRABAJADOR 80');assert.equal(await page.locator('#tbody tr').count(),1);await page.locator('#q').fill('');
      await page.locator('#tbody tr').first().locator('button').click();assert.equal(await page.locator('.worker-block').count(),4);
      await page.waitForFunction(()=>['.overlay','.worker-ficha'].every(s=>Number(getComputedStyle(document.querySelector(s)).opacity)>=.999));
      const cards=await page.locator('.worker-block').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,scroll:e.scrollWidth,client:e.clientWidth};}));
      assert(cards.every(r=>r.x>=-1&&r.right<=width+2&&r.scroll<=r.client+2),`Bloques recortados: ${JSON.stringify(cards)}`);
      await page.screenshot({path:path.join(dir,`${width}_${theme}_ficha_resumen.png`)});
      assert(!(await page.locator('#fd-docs').isVisible()));await page.locator('.worker-more>summary').click();
      const more=await page.locator('.worker-more>summary').boundingBox(),foot=await page.locator('.worker-ficha .m-foot').boundingBox();
      assert(more.y+more.height<=foot.y+2,'El pie no debe tapar Mostrar más');
      await page.locator('.worker-section>summary').filter({hasText:'Acuses IMSS, recibos y CFDI'}).click();assert(await page.locator('#fd-docs').isVisible());assert((await page.locator('#fd-docs').innerText()).includes('acuse-prueba.pdf'));
      await page.locator('.worker-actions>summary').click();assert(await page.locator('.worker-actions button[onclick*="openForm"]').isVisible());
      await page.screenshot({path:path.join(dir,`${width}_${theme}_ficha.png`),fullPage:true});
      const bounds=await page.locator('.worker-ficha').boundingBox();assert(bounds.x>=-1&&bounds.width<=width+2,`Ficha desbordada: ${JSON.stringify(bounds)}`);
      await page.locator('.worker-ficha .x').click();await page.locator('#burger').click();await page.locator('#sidebar button[onclick="showNavStep(\'empresa\')"]').click();assert.equal(await page.evaluate(()=>NAV_STEP),'empresa');
      assert.deepEqual(errors,[],`Errores JS: ${errors.join('; ')}`);await page.close();
    }
    fs.writeFileSync(path.join(dir,'resultados.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({passed:reports.length,viewports:5,themes:2,screenshots:dir}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
