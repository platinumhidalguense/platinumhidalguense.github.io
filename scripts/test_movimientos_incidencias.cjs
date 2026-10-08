// QA local: trabajadores ficticios, Supabase simulado y peticiones externas bloqueadas.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const out=path.resolve('tmp/qa_movimientos_incidencias_20261008');fs.mkdirSync(out,{recursive:true});
async function preparar(page){
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve('index.html')).href,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    document.querySelectorAll('.gate').forEach(e=>e.classList.add('hide'));$('scr-app').classList.remove('hide');
    USER={id:'qa',email:'darieljtg@gmail.com'};PUEDE_EDITAR_TRABAJADORES=true;
    OBRAS=[{id:'obra',nombre:'INFONAVIT SAN CRISTOBAL',empresa_codigo:'PLATINUM',tipo:'OBRA',fecha_inicio:'2026-03-30'}];OBRA=OBRAS[0];EMPRESA_ACTIVA='PLATINUM';CFGEMP={};CUADS=[];ALTAS_CORTAS=[];
    const w=(id,n,extra={})=>({id,no_trab:n,obra_id:'obra',primer_apellido:'PRUEBA',segundo_apellido:'PERSONA',nombres:'NOMBRE '+id,contratista:'MG',puesto:'AYUDANTE GENERAL',estatus:'ACTIVO',sd:362,sdi:380,sal_semanal:2400,periodo_pago:'SEMANAL',fecha_alta:'2026-03-30',...extra});
    WORKERS=[w('b10','10',{fecha_baja:'2026-10-05',estatus:'BAJA'}),w('b2',2,{fecha_baja:'2026-10-10',estatus:'BAJA'}),w('a12',12,{fecha_alta:'2026-10-05'}),w('a3','3',{fecha_alta:'2026-10-06'}),w('r21',21,{fecha_reingreso:'2026-10-05'}),w('r4',4,{fecha_reingreso:'2026-10-07'}),w('p31',31,{fecha_alta:'2026-10-06',estatus:'PENDIENTE'}),w('p5',5,{fecha_alta:'2026-10-06',estatus:'PENDIENTE'}),w('old',7,{fecha_alta:'2026-09-21',fecha_baja:'2026-09-25',estatus:'BAJA'}),w('foreign',1,{obra_id:'otra',fecha_alta:'2026-10-05'}),w('blank',null,{fecha_alta:'2026-10-05'})];
    DESC=[{id:'d10',trabajador_id:'b10',obra_id:'obra',tipo:'FALTA',monto:250,motivo:'1 FALTA',recurrente:false,activo:true,semana:'S28'}, {id:'d2',trabajador_id:'b2',obra_id:'obra',tipo:'FALTA',monto:350,motivo:'2 FALTAS',recurrente:false,activo:true,semana:'S28'}, {id:'d3',trabajador_id:'a3',obra_id:'obra',tipo:'INCIDENCIA',monto:25,motivo:'AJUSTE DE PRUEBA',recurrente:false,activo:true,semana:'S28'}, {id:'historico',trabajador_id:'old',obra_id:'obra',tipo:'FALTA',monto:100,motivo:'FALTA HISTORICA',recurrente:false,activo:true,semana:'S26'}, {id:'credito',trabajador_id:'b2',obra_id:'obra',tipo:'INFONAVIT',monto:500,recurrente:true,activo:true,semana:'S28'}, {id:'inactivo',trabajador_id:'b2',obra_id:'obra',tipo:'FALTA',monto:500,recurrente:false,activo:false,semana:'S28'}, {id:'otraobra',trabajador_id:'foreign',obra_id:'otra',tipo:'FALTA',monto:500,recurrente:false,activo:true,semana:'S28'}];
    window.qaWrites=[];window.qaToasts=[];window.qaError=null;window.qaZero=false;toast=(m,t)=>qaToasts.push({m,t});loadObraData=async()=>true;refreshCounts=async()=>{};renderTable=()=>{};
    sb={from:table=>{let payload,filters={},op;const q={update:p=>{payload=p;op='update';return q;},insert:p=>{payload=p;op='insert';return q;},eq:(k,v)=>{filters[k]=v;return q;},select:async()=>{qaWrites.push({table,payload,filters,op});return {error:qaError,data:qaZero?[]:[{id:filters.id}]};},then:(resolve,reject)=>{qaWrites.push({table,payload,filters,op});return Promise.resolve({error:qaError}).then(resolve,reject);}};return q;}};
    window.qaRows=null;buildSheet=(rows,styles,widths,merges,heights)=>{qaRows={rows,styles,widths,merges,heights};return {};};
    XLSX={utils:{book_new:()=>({}),book_append_sheet:()=>{}}};dl=()=>{};
    window.qaPDF='';window.open=()=>({document:{write:h=>qaPDF=h,close:()=>{}}});
  });
}
async function run(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await preparar(page);
    const sorted=await page.evaluate(()=>{const m=movimientosSemana(28);return Object.fromEntries(['altas','reingresos','bajas','pend'].map(k=>[k,m[k].map(w=>w.no_trab)]));});
    assert.deepEqual(sorted,{altas:['3',12,null],reingresos:[4,21],bajas:[2,'10'],pend:[5,31]});
    await page.evaluate(()=>openMovimientos(28));
    assert.deepEqual(await page.locator('.modal .kv>b').allTextContents(),['#2','#10','#3','#12','#—','#4','#21','#5','#31']);
    await page.evaluate(()=>exportMovimientos());
    const rows=await page.evaluate(()=>qaRows.rows);for(const [tipo,nums] of [['ALTA',['3',12,'']],['REINGRESO',[4,21]],['BAJA',[2,'10']],['PENDIENTE',[5,31]]])assert.deepEqual(rows.filter(r=>r[0]===tipo).map(r=>r[1]),nums);
    const widths=await page.evaluate(()=>qaRows.widths);assert.deepEqual(widths,[13,10,36,15,24,12,15,12]);
    await page.evaluate(()=>exportMovimientosPDF());
    const pdfNums=await page.evaluate(()=>{const d=new DOMParser().parseFromString(qaPDF,'text/html');return [...d.querySelectorAll('tbody tr:not(.grupo)')].map(r=>r.cells[0].textContent);});
    assert.deepEqual(pdfNums,['3','12','—','4','21','2','10','5','31']);
    const filtered=await page.evaluate(()=>{const m=movimientosSemana(28,'OTRO');return m.altas.length+m.bajas.length+m.reingresos.length+m.pend.length;});assert.equal(filtered,0);
    await page.evaluate(()=>openIncidencias());assert(await page.locator('#inc-panel-aplicadas').isVisible());assert.equal(await page.locator('#inc-panel-captura').isVisible(),false);assert.equal(await page.locator('#inc-save').isVisible(),false);
    assert.deepEqual(await page.locator('.inc-aplicada>b').allTextContents(),['#2','#3','#10']);
    await page.locator('#inc-ya-q').fill('10');assert.deepEqual(await page.locator('.inc-aplicada>b').allTextContents(),['#10']);
    await page.locator('#inc-tab-captura').click();assert(await page.locator('#inc-save').isVisible());await page.locator('#inc-q').fill('NOMBRE a3');assert.equal(await page.locator('.inc-row:visible').count(),1);
    const idx=await page.evaluate(()=>_INC.findIndex(w=>w.id==='a3'));await page.locator('#inc-f-'+idx).fill('1');assert.notEqual(await page.locator('#inc-m-'+idx).inputValue(),'');
    await page.locator('#inc-tab-aplicadas').click();await page.locator('#inc-ya-q').fill('');assert.equal(await page.locator('.inc-aplicada').count(),3);await page.screenshot({path:path.join(out,'aplicadas_1366.png')});
    page.once('dialog',d=>d.accept());await page.locator('[data-inc-id="d10"] button').click();await page.waitForFunction(()=>!_INCQUITANDO);assert.equal(await page.locator('[data-inc-id="d10"]').count(),0);
    const write=await page.evaluate(()=>qaWrites[0]);assert.deepEqual(write.filters,{id:'d10',obra_id:'obra',semana:'S28',recurrente:false,activo:true});assert.deepEqual(write.payload,{activo:false});
    await page.locator('#inc-tab-captura').click();assert.equal(await page.locator('#inc-f-'+idx).inputValue(),'1','Quitar no destruye captura');assert.equal(await page.locator('#inc-q').inputValue(),'NOMBRE a3');
    await page.screenshot({path:path.join(out,'captura_1366.png')});
    // Cambiar semana con borrador requiere confirmación y conserva búsquedas independientes.
    page.once('dialog',d=>d.dismiss());await page.locator('#inc-sem').fill('26');await page.locator('#inc-sem').dispatchEvent('change');assert.equal(await page.locator('#inc-sem').inputValue(),'28');assert.equal(await page.locator('#inc-f-'+idx).inputValue(),'1');
    page.once('dialog',d=>d.accept());await page.locator('#inc-sem').fill('26');await page.locator('#inc-sem').dispatchEvent('change');await page.locator('#inc-tab-aplicadas').click();assert.deepEqual(await page.locator('.inc-aplicada>b').allTextContents(),['#7']);
    await page.locator('#inc-ya-q').fill('no existe');assert.equal(await page.locator('.inc-aplicada').count(),0);await page.locator('#inc-ya-q').fill('historica');assert.equal(await page.locator('.inc-aplicada').count(),1);
    await page.locator('#inc-sem').fill('0');await page.locator('#inc-sem').dispatchEvent('change');assert.equal(await page.locator('#inc-sem').inputValue(),'26');
    // Rechazo, cero filas, consulta y guardado de captura con los IDs correctos.
    await page.evaluate(()=>{qaError={message:'fallo de prueba'};});page.once('dialog',d=>d.accept());await page.locator('[data-inc-id="historico"] button').click();await page.waitForFunction(()=>!_INCQUITANDO);assert.equal(await page.locator('[data-inc-id="historico"]').count(),1);
    await page.evaluate(()=>{qaError=null;qaZero=true;});page.once('dialog',d=>d.accept());await page.locator('[data-inc-id="historico"] button').click();await page.waitForFunction(()=>!_INCQUITANDO);assert.equal(await page.locator('[data-inc-id="historico"]').count(),1);
    await page.evaluate(()=>{qaZero=false;USER.email='consulta@example.test';PUEDE_EDITAR_TRABAJADORES=false;openIncidencias();});assert.equal(await page.locator('.inc-aplicada button').count(),0);await page.locator('#inc-tab-captura').click();assert(await page.locator('#inc-save').isDisabled());const before=await page.evaluate(()=>qaWrites.length);await page.evaluate(()=>saveIncidencias());assert.equal(await page.evaluate(()=>qaWrites.length),before);
    await page.evaluate(()=>{USER.email='darieljtg@gmail.com';PUEDE_EDITAR_TRABAJADORES=true;openIncidencias();incMostrar('captura');});const i2=await page.evaluate(()=>_INC.findIndex(w=>w.id==='a3'));await page.locator('#inc-f-'+i2).fill('1');page.once('dialog',d=>d.accept());await page.locator('#inc-save').click();const saved=await page.evaluate(()=>qaWrites.at(-1));assert.equal(saved.op,'insert');assert.equal(saved.payload[0].trabajador_id,'a3');assert.equal(saved.payload[0].semana,'S28');assert.equal(saved.payload[0].tipo,'FALTA');
    assert.deepEqual(errors,[]);
    for(const [width,height] of [[390,844],[1920,1080]])for(const theme of ['light','dark']){await page.setViewportSize({width,height});await page.evaluate(t=>{document.documentElement.dataset.theme=t;openIncidencias();},theme);await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.modal')).opacity)>=.999);await page.screenshot({path:path.join(out,`aplicadas_${width}_${theme}.png`)});const size=await page.locator('.m-body').evaluate(e=>({sw:e.scrollWidth,cw:e.clientWidth}));assert(size.sw<=size.cw+1,JSON.stringify(size));}
    await page.close();console.log('OK: movimientos numéricos UI/Excel/PDF, filtro de obra/contratista, incidencias en dos secciones, búsquedas independientes, semana histórica, captura preservada, quitar y permisos. Sin escrituras reales.');
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
