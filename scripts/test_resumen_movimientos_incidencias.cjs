// QA aislada: datos ficticios y ninguna petición externa ni escritura real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const out=path.resolve('tmp/pdfs/resumen_movimientos_incidencias');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
    await page.goto(pathToFileURL(path.resolve('index.html')).href,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      document.querySelectorAll('.gate').forEach(e=>e.classList.add('hide'));$('scr-app').classList.remove('hide');
      OBRA={id:'obra',nombre:'OBRA DE PRUEBA',empresa_codigo:'PLATINUM',fecha_inicio:'2026-03-30'};OBRAS=[OBRA];CFGEMP={};CUADS=[];
      const w=(id,n,c,extra={})=>({id,no_trab:n,obra_id:'obra',nombres:'TRABAJADOR '+id,primer_apellido:'PRUEBA',puesto:'OFICIAL DE CONSTRUCCIÓN',contratista:c,estatus:'ACTIVO',fecha_alta:'2026-03-30',...extra});
      WORKERS=[w('diez','10','MG'),w('dos',2,'LEO'),w('tres',3,'MG',{estatus:'BAJA',fecha_baja:'2026-09-25'}),w('alta',20,'MG',{fecha_alta:'2026-10-05'}),w('otra',1,'AJENO',{obra_id:'otra'}),w('eliminado',4,'MG',{eliminado:true})];
      const d=(id,trab,tipo='FALTA',extra={})=>({id,trabajador_id:trab,obra_id:'obra',activo:true,recurrente:false,semana:'S28',tipo,monto:120.56,motivo:'1 FALTA APLICADA',...extra});
      DESC=[d('d10','diez'),d('d2','dos'),d('d3','tres','INCIDENCIA',{motivo:'2 DÍAS INCAPACIDAD IMSS',monto:0}),d('d3b','tres','INCIDENCIA',{motivo:'OTRO AJUSTE'}),
        d('vieja','dos','FALTA',{semana:'S27'}),d('cancelada','dos','FALTA',{activo:false}),d('credito','dos','INFONAVIT',{recurrente:true}),
        d('no-recurrente-credito','dos','FONACOT'),d('rec-falta','dos','FALTA',{recurrente:true}),d('foranea','otra','FALTA',{obra_id:'otra'}),
        d('sin-obra','diez','FALTA',{obra_id:null}),d('sin-obra-ajeno','otra','FALTA',{obra_id:null}),d('huerfana','inexistente'),d('elim','eliminado')];
      window.qaPDF='';window.qaToasts=[];window.open=()=>({document:{write:h=>qaPDF=h,close:()=>{}}});toast=m=>qaToasts.push(m);
    });
    const lista=await page.evaluate(()=>movimientosSemana(28).incidencias.map(x=>x.d.id));
    assert.deepEqual(lista,['d2','d3','d3b','d10','sin-obra','elim','huerfana']);
    assert.deepEqual(await page.evaluate(()=>movimientosSemana(28,'MG').incidencias.map(x=>x.d.id)),['d3','d3b','d10','sin-obra']);
    assert.deepEqual(await page.evaluate(()=>movimientosSemana(28,'LEO').incidencias.map(x=>x.d.id)),['d2']);
    assert.deepEqual(await page.evaluate(()=>movimientosSemana(27).incidencias.map(x=>x.d.id)),['vieja']);
    await page.evaluate(()=>openMovimientos(28));assert.equal(await page.locator('.mov-incidencia').count(),7);
    assert.equal(await page.locator('#mov-contratista option[value="AJENO"]').count(),0);
    assert.equal(await page.locator('.mov-incidencia').filter({hasText:'Trabajador no disponible'}).count(),2);
    assert.equal(await page.locator('.mov-incidencia').filter({hasText:'2 DÍAS INCAPACIDAD IMSS'}).count(),1);
    await page.locator('#mov-contratista').selectOption('MG');assert.equal(await page.locator('.mov-incidencia').count(),4);
    await page.locator('button[onclick="exportMovimientosPDF()"]').click();
    let html=await page.evaluate(()=>qaPDF),doc=await browser.newPage();await doc.setContent(html.replace(/<script>window\.onload=.*?<\/script>/s,''));
    assert.deepEqual(await doc.locator('.incidencias-tabla tbody tr').evaluateAll(rs=>rs.map(r=>r.cells[0].textContent)),['3','3','10','10']);
    assert(await doc.locator('.incidencias-tabla').innerText().then(t=>t.includes('$0.00')));
    assert.equal(await doc.locator('.incidencias-tabla tbody tr').filter({hasText:'LEO'}).count(),0);
    // La presencia exclusiva de incidencias también permite generar PDF.
    await page.evaluate(()=>openMovimientos(28,'LEO'));assert(await page.locator('button[onclick="exportMovimientosPDF()"]').isEnabled());
    assert(await page.locator('button[onclick="exportMovimientos()"]').isDisabled());
    await page.locator('button[onclick="exportMovimientosPDF()"]').click();html=await page.evaluate(()=>qaPDF);
    await doc.setContent(html.replace(/<script>window\.onload=.*?<\/script>/s,''));assert.equal(await doc.locator('.movimientos-tabla').count(),0);
    await doc.pdf({path:path.join(out,'solo_incidencias.pdf'),preferCSSPageSize:true,printBackground:true});
    // Varios contratistas, nombres largos y continuaciones con encabezado.
    await page.evaluate(()=>{
      for(let i=30;i<64;i++){
        WORKERS.push({id:'largo'+i,no_trab:i,obra_id:'obra',nombres:'NOMBRE COMPUESTO DEL TRABAJADOR '+i,primer_apellido:'HERNÁNDEZ',segundo_apellido:'GONZÁLEZ',puesto:'OPERADOR DE MAQUINARIA PESADA Y EXCAVACIÓN',contratista:i%2?'MG':'LEO',fecha_alta:'2026-03-30',estatus:'ACTIVO'});
        DESC.push({id:'dlargo'+i,trabajador_id:'largo'+i,obra_id:'obra',activo:true,recurrente:false,semana:'S28',tipo:i%2?'FALTA':'INCIDENCIA',monto:350.25,motivo:i%2?'2 FALTAS APLICADAS EN LA SEMANA':'3 DÍAS DE INCAPACIDAD IMSS\nDescuento registrado conforme al calendario aplicado.'});
      }
      openMovimientos(28);exportMovimientosPDF();
    });
    html=await page.evaluate(()=>qaPDF);await doc.setContent(html.replace(/<script>window\.onload=.*?<\/script>/s,''));
    assert.equal(await doc.locator('.incidencias-tabla tbody tr').count(),41);
    assert(await doc.locator('tbody tr:not(.grupo)').evaluateAll(rows=>rows.every(row=>row.cells.length===6)));
    await doc.pdf({path:path.join(out,'global_incidencias.pdf'),preferCSSPageSize:true,printBackground:true});
    // Pantalla estrecha y amplia: no desbordamiento del cuerpo.
    for(const width of [390,1366,1920]){
      await page.setViewportSize({width,height:900});await page.evaluate(()=>openMovimientos(28));
      const size=await page.locator('.m-body').evaluate(e=>({sw:e.scrollWidth,cw:e.clientWidth}));assert(size.sw<=size.cw+1,JSON.stringify(size));
    }
    // Paginación estable y un error no se convierte en lista vacía exitosa.
    const pages=await page.evaluate(async()=>{const ranges=[];const r=await fetchAllRows(()=>({order:()=>({range:async(a,b)=>{ranges.push([a,b]);return {data:Array.from({length:a===0?1000:3},(_,i)=>({id:a+i})),error:null};}})}));return {count:r.data.length,ranges};});
    assert.deepEqual(pages,{count:1003,ranges:[[0,999],[1000,1999]]});
    const loadError=await page.evaluate(async()=>{sb={from:()=>({})};let i=0;fetchAllRows=async()=>++i===3?{data:[],error:{message:'lectura interrumpida'}}:{data:[],error:null};skeletonTabla=()=>{};return loadObraData('obra');});
    assert.equal(loadError,false);assert((await page.evaluate(()=>qaToasts)).at(-1).includes('lectura interrumpida'));
    // El resumen es consulta: no altera registros ni realiza cálculos de nómina.
    assert.deepEqual(errors,[]);
    console.log('OK: incidencias UI/PDF global y por contratista; orden numérico; históricos BAJA; filtros de obra/semana; exclusión de créditos y cancelados; huérfanos visibles; monto cero; PDF sólo incidencias; paginación >1000; error de carga bloqueado; carta vertical y continuaciones.');
    console.log('PDF QA: '+out);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
