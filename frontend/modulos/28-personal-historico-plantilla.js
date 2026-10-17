/* --- PERSONAL HISTÓRICO A FECHA (todas las obras o una obra/contratista) --- */
let PERSONAL_HIST=null;
const phHoy=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Mexico_City'});
function phObra(id){return OBRAS.find(o=>o.id===id)||null;}
function phFilas(){
  if(!PERSONAL_HIST)return [];
  const h=PERSONAL_HIST, c=String(h.contratista||'').trim().toLocaleUpperCase('es-MX');
  const q=String(h.busqueda||'').trim().toLocaleUpperCase('es-MX');
  return h.filas.filter(w=>(!c||String(w.contratista||'').trim().toLocaleUpperCase('es-MX')===c)
    &&(!h.estatus||w.estatus===h.estatus)
    &&(!q||String(w.nombre||'').toLocaleUpperCase('es-MX').includes(q)));
}
function phScopeNombre(){
  const s=PERSONAL_HIST?.alcance;
  return s==='GLOBAL'?'Todas las obras':phObra(s)?.nombre||'Centro no disponible';
}
function openPersonalHistorico(){
  const fecha=phHoy();
  PERSONAL_HIST={fecha,alcance:OBRA?.id||'GLOBAL',contratista:'',busqueda:'',estatus:'',filas:[],cargando:false,token:0};
  modal(`<div class="m-head"><h2>📜 Personal histórico</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">
        <div><label for="ph-fecha">Consultar al día</label><input id="ph-fecha" type="date" value="${fecha}" max="${fecha}" onchange="phCargar()"></div>
        <div><label for="ph-alcance">Obra / alcance</label><select id="ph-alcance" onchange="phCargar()">
          <option value="GLOBAL">Todas las obras · ambas empresas</option>
          ${OBRAS.map(o=>`<option value="${esc(o.id)}" ${o.id===PERSONAL_HIST.alcance?'selected':''}>${esc(razonSocialEmpresa(empresaDeObra(o)))} · ${esc(o.nombre)}</option>`).join('')}
        </select></div>
        <div><label for="ph-contratista">Contratista</label><select id="ph-contratista" onchange="phFiltrar()"><option value="">Todos los contratistas</option></select></div>
      </div>
      <div class="grid" style="grid-template-columns:2fr 1fr;gap:10px;margin-top:10px">
        <div><label for="ph-busqueda">Buscar trabajador</label><input id="ph-busqueda" placeholder="Nombre completo" oninput="phFiltrar()"></div>
        <div><label for="ph-estatus">Estatus en esa fecha</label><select id="ph-estatus" onchange="phFiltrar()"><option value="">Todos</option><option value="ACTIVO">Activo</option><option value="BAJA">Baja</option><option value="PENDIENTE">Pendiente</option></select></div>
      </div>
      <div id="ph-resultado" style="margin-top:16px"></div>
    </div><div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button><button class="btn dark" id="ph-pdf" onclick="phExportarPDF()" disabled>📄 Exportar PDF</button></div>`,'xl');
  phCargar();
}
async function phCargar(){
  if(!PERSONAL_HIST||!$('ph-fecha'))return;
  const h=PERSONAL_HIST,fecha=$('ph-fecha').value,alcance=$('ph-alcance').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||fecha>phHoy()){
    $('ph-fecha').value=h.fecha;
    toast('Selecciona una fecha válida que no sea futura.','err');return;
  }
  const token=++h.token;
  h.fecha=fecha;h.alcance=alcance;h.contratista='';h.filas=[];h.cargando=true;
  $('ph-contratista').innerHTML='<option value="">Todos los contratistas</option>';
  $('ph-resultado').innerHTML='<div class="empty">Consultando altas, bajas y reingresos históricos…</div>';
  $('ph-pdf').disabled=true;
  const lote=500,filas=[];
  try{
    for(let desde=0;;desde+=lote){
      const {data,error}=await sb.rpc('fn_personal_historico',{
        p_fecha:fecha,p_obra_id:alcance==='GLOBAL'?null:alcance,
        p_contratista:null,p_desde:desde,p_lote:lote
      });
      if(error)throw error;
      if(!PERSONAL_HIST||h.token!==token||!$('ph-resultado'))return;
      filas.push(...(data||[]));
      if(!data||data.length<lote)break;
    }
    h.filas=filas;h.cargando=false;
    const cs=[...new Set(filas.map(w=>String(w.contratista||'').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'es'));
    $('ph-contratista').innerHTML='<option value="">Todos los contratistas</option>'+
      cs.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    phFiltrar();
  }catch(e){
    if(!PERSONAL_HIST||h.token!==token||!$('ph-resultado'))return;
    h.cargando=false;
    $('ph-resultado').innerHTML=`<div class="empty">No se pudo consultar el personal histórico. ${esc(e.message||'Revisa la conexión o la migración 111.')}</div>`;
    toast('No se pudo consultar el personal histórico.','err');
  }
}
function phFiltrar(){
  if(!PERSONAL_HIST||!$('ph-resultado'))return;
  const h=PERSONAL_HIST;
  h.contratista=$('ph-contratista')?.value||'';
  h.busqueda=$('ph-busqueda')?.value||'';
  h.estatus=$('ph-estatus')?.value||'';
  const filas=phFilas(),act=filas.filter(w=>w.estatus==='ACTIVO').length,
    bajas=filas.filter(w=>w.estatus==='BAJA').length,
    pend=filas.filter(w=>w.estatus==='PENDIENTE').length;
  $('ph-pdf').disabled=!filas.length||h.cargando;
  const grupos=new Map();
  filas.forEach(w=>{
    const obra=phObra(w.obra_id),empresa=empresaDeObra(obra),contratista=w.contratista||'SIN CONTRATISTA';
    const clave=[empresa,w.obra_id,contratista].join('|');
    if(!grupos.has(clave))grupos.set(clave,{empresa,obra,contratista,gente:[]});
    grupos.get(clave).gente.push(w);
  });
  const ordenados=[...grupos.values()].sort((a,b)=>a.empresa.localeCompare(b.empresa,'es')
    ||(a.obra?.nombre||'').localeCompare(b.obra?.nombre||'','es')
    ||a.contratista.localeCompare(b.contratista,'es'));
  $('ph-resultado').innerHTML=`<div class="stats" style="margin-bottom:12px">
      <div class="stat b"><div class="n">${filas.length}</div><div class="l">Personal registrado</div></div>
      <div class="stat g"><div class="n">${act}</div><div class="l">Activos</div></div>
      <div class="stat r"><div class="n">${bajas}</div><div class="l">Bajas</div></div>
      <div class="stat a"><div class="n">${pend}</div><div class="l">Pendientes</div></div></div>
    <div class="fhint" style="margin-bottom:10px">Corte al ${esc(fmtD(h.fecha))} · ${esc(phScopeNombre())}. Las altas, bajas y reingresos se evalúan por fecha efectiva; la obra, el contratista y el puesto se reconstruyen de la bitácora disponible.</div>
    ${filas.length?`<div style="overflow:auto;max-height:55vh;border:1px solid var(--line);border-radius:8px"><table class="tbl" style="width:100%;min-width:720px"><thead><tr><th>Nombre completo</th><th>Puesto</th><th>Estatus</th><th>Fecha de alta</th><th>Fecha de baja</th></tr></thead><tbody>
      ${ordenados.map(g=>`<tr><td colspan="5" style="background:var(--hover);font-weight:800;color:var(--txt)">${esc(razonSocialEmpresa(g.empresa))} · ${esc(g.obra?.nombre||'Centro')} · ${esc(g.contratista)} (${g.gente.length})</td></tr>`+
        g.gente.sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9)||a.nombre.localeCompare(b.nombre,'es'))
          .map(w=>`<tr><td><b>${esc(w.nombre||'—')}</b></td><td>${esc(w.puesto||'—')}</td><td>${esc(w.estatus)}</td><td>${esc(fmtD(w.fecha_alta))}${w.es_reingreso?' <small title="Fecha de reingreso">↻</small>':''}</td><td>${w.estatus==='BAJA'&&!w.fecha_baja?'⚠ POR ACLARAR':esc(fmtD(w.fecha_baja)||'—')}</td></tr>`).join('')).join('')}
      </tbody></table></div>`:'<div class="empty">No hay personal con esos filtros en la fecha seleccionada.</div>'}`;
}
function phPDFHTML(filas){
  const h=PERSONAL_HIST,grupos=new Map();
  filas.forEach(w=>{
    const obra=phObra(w.obra_id),empresa=empresaDeObra(obra),contratista=w.contratista||'SIN CONTRATISTA';
    const clave=[empresa,w.obra_id,contratista].join('|');
    if(!grupos.has(clave))grupos.set(clave,{empresa,obra,contratista,gente:[]});
    grupos.get(clave).gente.push(w);
  });
  const gs=[...grupos.values()].sort((a,b)=>a.empresa.localeCompare(b.empresa,'es')
    ||(a.obra?.nombre||'').localeCompare(b.obra?.nombre||'','es')
    ||a.contratista.localeCompare(b.contratista,'es'));
  const codigos=[...new Set(gs.map(g=>g.empresa))];
  const logos=codigos.map(c=>`<img src="${logoEmpresa(c)}" alt="${esc(c)}">`).join('');
  const entidad=codigos.length===1?(()=>{const c=codigos[0],e=CFGEMP['empresa_'+c]||{};
    return `<b>${esc(razonSocialEmpresa(c))}</b><br>RFC ${esc(e.rfc||'—')}<br>${esc(e.domicilio||'')}`;})()
    :codigos.map(c=>`<b>${esc(razonSocialEmpresa(c))}</b>`).join('<br>');
  const cuerpo=gs.map(g=>`<tr class="grupo"><td colspan="5">${esc(razonSocialEmpresa(g.empresa))} · ${esc(g.obra?.nombre||'Centro')} · CONTRATISTA: ${esc(g.contratista)} · ${g.gente.length}</td></tr>`+
    g.gente.sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9)||a.nombre.localeCompare(b.nombre,'es'))
      .map(w=>`<tr><td class="nombre">${esc(w.nombre||'—')}</td><td>${esc(w.puesto||'—')}</td><td class="estado">${esc(w.estatus)}</td><td class="fecha">${esc(fmtD(w.fecha_alta))}${w.es_reingreso?' ↻':''}</td><td class="fecha">${w.estatus==='BAJA'&&!w.fecha_baja?'POR ACLARAR':esc(fmtD(w.fecha_baja)||'—')}</td></tr>`).join('')).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Personal histórico · ${esc(fmtD(h.fecha))}</title><style>
    @page{size:letter portrait;margin:12mm 11mm 12mm}*{box-sizing:border-box}
    body{margin:0;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:9pt}
    .accion{position:fixed;top:12px;right:12px;background:#193659;color:#fff;border:0;border-radius:5px;padding:9px 14px;font-weight:bold;cursor:pointer}
    table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}
    tr{break-inside:avoid;page-break-inside:avoid}.membrete{border-bottom:2px solid #193659;padding-bottom:4mm}
    .membrete-box{display:flex;align-items:center;justify-content:space-between;gap:5mm;min-height:20mm}
    .logos{display:flex;align-items:center;gap:3mm}.logos img{width:29mm;height:17mm;object-fit:contain}
    .empresa{flex:1;min-width:0;text-align:right;font-size:7.5pt;line-height:1.3;overflow-wrap:anywhere}
    .empresa b{font-size:10pt;color:#193659}.titulo{font-size:13pt;font-weight:bold;color:#193659;text-align:center;padding:5mm 0 2mm}
    .contexto{font-size:8.5pt;line-height:1.5;padding-bottom:3mm}.contexto b{color:#193659}
    .resumen{font-size:8pt;color:#475569;padding-bottom:3mm}
    .columnas th{background:#193659;color:#fff;text-align:left;font-size:7.5pt;padding:2.3mm 1.5mm}
    .columnas th:nth-child(n+3){text-align:center}tbody td{border-bottom:1px solid #dbe3ec;padding:2.2mm 1.5mm;vertical-align:top;overflow-wrap:anywhere;line-height:1.25}
    tbody .grupo td{background:#e9eff7;color:#193659;font-weight:bold;padding:2.4mm 1.5mm;break-after:avoid;page-break-after:avoid}
    .nombre{font-weight:bold}.fecha,.estado{text-align:center;white-space:nowrap}
    @media print{.accion{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><button class="accion" onclick="window.print()">Imprimir / Guardar PDF</button><table>
    <colgroup><col style="width:31%"><col style="width:28%"><col style="width:13%"><col style="width:14%"><col style="width:14%"></colgroup>
    <thead><tr><td class="membrete" colspan="5"><div class="membrete-box"><div class="logos">${logos}</div><div class="empresa">${entidad}</div></div></td></tr>
    <tr><td class="titulo" colspan="5">PERSONAL HISTÓRICO · CORTE AL ${esc(fmtD(h.fecha))}</td></tr>
    <tr><td class="contexto" colspan="5"><b>Alcance:</b> ${esc(phScopeNombre())}${h.contratista?` &nbsp; <b>Contratista:</b> ${esc(h.contratista)}`:''}</td></tr>
    <tr><td class="resumen" colspan="5">${filas.length} trabajador(es) · ${filas.filter(w=>w.estatus==='ACTIVO').length} activos · ${filas.filter(w=>w.estatus==='BAJA').length} bajas · ↻ fecha de reingreso</td></tr>
    <tr class="columnas"><th>NOMBRE COMPLETO</th><th>PUESTO</th><th>ESTATUS</th><th>FECHA ALTA</th><th>FECHA BAJA</th></tr></thead><tbody>${cuerpo}</tbody></table>
    <script>window.onload=()=>Promise.all(Array.from(document.images).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))).then(()=>setTimeout(()=>window.print(),250))<\/script></body></html>`;
}
function phExportarPDF(){
  const filas=phFilas();if(!filas.length){toast('No hay personal para exportar.','err');return;}
  const win=window.open('','_blank');
  if(!win){toast('Permite ventanas emergentes para generar el PDF.','err');return;}
  win.document.write(phPDFHTML(filas));win.document.close();
  toast('Reporte listo en hoja carta vertical. Elige “Guardar como PDF” en la impresión.','ok');
}
/* --- PLANTILLA A UNA FECHA --- */
function openPlantillaFecha(){
  modal(`
    <div class="m-head"><h2>📸 Plantilla a una fecha · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))"><div><label>¿Cuántos ACTIVOS había el día...?</label><input id="pf-fecha" type="date" value="${today()}" onchange="pfCalcular()"></div>
      <div><label>Contratista</label><select id="pf-contratista" onchange="pfCalcular()"><option value="">Todos los contratistas</option>${[...new Set(WORKERS.filter(w=>!w.eliminado&&w.obra_id===OBRA.id).map(w=>String(w.contratista||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
      <div style="display:flex;align-items:end"><button class="btn dark" style="width:100%" onclick="pfCalcular()">Calcular</button></div></div>
      <p class="fhint" style="margin-top:10px">El PDF contiene sólo los datos necesarios para revisar el personal con el contratista. Descarga directa en carta vertical, con el logo y razón social del centro seleccionado.</p>
      <div id="pf-out" style="margin-top:14px"></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'md');
  pfCalcular();
}
/* Activo EN una fecha f (ISO). Maneja reingreso: si reingresó en/antes de f,
   está activo salvo que exista una baja posterior a esa fecha; si no hay
   reingreso, activo = alta<=f y (sin baja o baja>f). */
function activoEn(w,f){
  if(!w.fecha_alta||w.fecha_alta>f)return false;              // aún no ingresaba
  if(w.fecha_reingreso&&w.fecha_reingreso<=f)                 // ya había reingresado
    return w.estatus!=='BAJA'||!w.fecha_baja||w.fecha_baja>f;
  return !w.fecha_baja||w.fecha_baja>f;                       // periodo original
}
function pfActivos(f,contratista=''){
  const ct=String(contratista||'').trim().toUpperCase();
  return WORKERS.filter(w=>!w.eliminado&&(!OBRA?.id||w.obra_id===OBRA.id)&&activoEn(w,f)
    &&(!ct||String(w.contratista||'').trim().toUpperCase()===ct))
    .sort((a,b)=>(a.no_trab??9e9)-(b.no_trab??9e9)||fullName(a).localeCompare(fullName(b),'es'));
}
function pfCalcular(){
  const f=$('pf-fecha').value;
  if(!f){$('pf-out').innerHTML='<div class="empty">Selecciona la fecha de consulta.</div>';return;}
  const act=pfActivos(f,$('pf-contratista')?.value||'');
  const por=(k)=>{const m={};act.forEach(w=>{const key=w[k]||'—';m[key]=(m[key]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1]);};
  $('pf-out').innerHTML=`
    <div class="stats"><div class="stat g"><div class="n">${act.length}</div><div class="l">Trabajadores activos el ${fmtD(f)}</div></div></div>
    <div style="margin:10px 0;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="exportPlantillaFecha()" ${act.length?'':'disabled'}>⬇ Exportar Excel</button><button class="btn dark" id="pf-pdf" onclick="exportPlantillaFechaPDF()" ${act.length&&!window._PF_EXPORTANDO?'':'disabled'}>📄 Descargar PDF</button></div>
    <div class="sect">Por contratista</div>${por('contratista').map(([k,v])=>`<div class="kv"><b>${esc(k)}</b><span>${v}</span></div>`).join('')}
    <div class="sect">Por puesto</div>${por('puesto').map(([k,v])=>`<div class="kv"><b>${esc(k)}</b><span>${v}</span></div>`).join('')}`;
}
function exportPlantillaFecha(){
  const f=$('pf-fecha').value; if(!f){toast('Elige una fecha.','err');return;}
  const act=pfActivos(f,$('pf-contratista')?.value||'');
  if(!act.length){toast('No había trabajadores activos en esa fecha.','err');return;}
  const rows=[],styles=[];
  rows.push([`PLANTILLA ACTIVA AL ${fmtD(f)} — ${OBRA.nombre}`]); styles.push(ST.title);
  rows.push([`Trabajadores activos en la fecha: ${act.length} · Generado el ${new Date().toLocaleDateString('es-MX')}`]); styles.push([ST.sub]);
  rows.push(['NO. TRAB.','NOMBRE COMPLETO','CONTRATISTA','PUESTO','TELÉFONO','CORREO ELECTRÓNICO','FECHA ALTA','FECHA BAJA','REINGRESO','ESTATUS HOY']); styles.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cell,ST.cell,ST.cellC,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.cellC];
  act.forEach(w=>{
    rows.push([w.no_trab??'',fullName(w),w.contratista||'',w.puesto||'',String(w.telefono||''),w.correo||'',
      w.fecha_alta?fmtD(w.fecha_alta):'—',
      w.fecha_baja?fmtD(w.fecha_baja):'—',
      w.fecha_reingreso?fmtD(w.fecha_reingreso):'—',
      w.estatus||'']);
    styles.push(rs);
  });
  const merges=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}}];
  const ws=buildSheet(rows,styles,[10,34,20,26,16,34,13,13,13,12],merges,[{hpt:26},{hpt:16}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:2,c:0},e:{r:2+act.length,c:9}})};
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,('PLANTILLA '+f).slice(0,31));
  dl(wb,`PLANTILLA_ACTIVA_${f}_${OBRA.nombre.slice(0,16).replace(/\s+/g,'_')}.xlsx`);
  toast(`Exportados ${act.length} trabajadores activos al ${fmtD(f)}.`,'ok');
}
async function pfCargarPDF(){
  if(window.PDFLib?.PDFDocument)return window.PDFLib;
  if(window._PF_PDF_LIB)return window._PF_PDF_LIB;
  window._PF_PDF_LIB=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    let terminado=false;
    const fallar=()=>{if(terminado)return;terminado=true;clearTimeout(timer);script.remove();window._PF_PDF_LIB=null;reject(Error('No se pudo cargar el generador PDF. Revisa la conexión y vuelve a intentar.'));};
    const timer=setTimeout(fallar,20000);
    script.src='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    script.integrity='sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI';
    script.crossOrigin='anonymous';
    script.onload=()=>{if(terminado)return;if(!window.PDFLib?.PDFDocument){fallar();return;}terminado=true;clearTimeout(timer);resolve(window.PDFLib);};
    script.onerror=fallar;document.head.appendChild(script);
  });
  return window._PF_PDF_LIB;
}
function pfPDFAncho(texto,font,size){
  // Las fuentes estándar se dibujan por glifo; no descontar kerning al medir
  // evita que una cadena larga invada la columna o el margen siguiente.
  return [...String(texto)].reduce((n,ch)=>n+font.widthOfTextAtSize(ch,size),0);
}
function pfPDFLineas(valor,font,size,ancho){
  const texto=String(valor??'').normalize('NFC').replace(/[\u2010-\u2015]/g,'-').replace(/\s+/g,' ').trim()||'-';
  const out=[];let linea='';
  for(const palabra of texto.split(' ')){
    if(pfPDFAncho(palabra,font,size)>ancho){
      if(linea){out.push(linea);linea='';}
      for(const ch of palabra){if(linea&&pfPDFAncho(linea+ch,font,size)>ancho){out.push(linea);linea='';}linea+=ch;}
    }else if(linea&&pfPDFAncho(linea+' '+palabra,font,size)>ancho){out.push(linea);linea=palabra;}
    else linea+=(linea?' ':'')+palabra;
  }
  if(linea)out.push(linea);return out;
}
async function pfConstruirPDF(lib,{fecha,obra,empresa,logo,filas}){
  if(!filas.length)throw Error('No hay personal para exportar.');
  const {PDFDocument,StandardFonts,rgb}=lib,doc=await PDFDocument.create();
  const normal=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const imagen=await (/^data:image\/jpe?g/i.test(logo)?doc.embedJpg(logo):doc.embedPng(logo)),navy=rgb(.10,.20,.35),gris=rgb(.29,.34,.41),linea=rgb(.84,.88,.92),claro=rgb(.94,.96,.98);
  const anchos=[35,186,124,105,94],xs=[34];anchos.forEach((w,i)=>xs.push(xs[i]+w));
  const grupos=new Map();
  filas.forEach(w=>{const ct=String(w.contratista||'').trim()||'SIN CONTRATISTA',key=ct.toUpperCase();if(!grupos.has(key))grupos.set(key,{ct,gente:[]});grupos.get(key).gente.push(w);});
  const gs=[...grupos.values()].sort((a,b)=>a.ct.localeCompare(b.ct,'es'));
  const texto=(page,t,x,y,font=normal,size=8.5,color=gris)=>page.drawText(t,{x,y,font,size,color});
  const bloquear=(page,ls,x,y,font=normal,size=8.5,color=gris)=>ls.forEach((t,i)=>texto(page,t,x,y-i*(size+2.5),font,size,color));
  let page,y;
  const nuevaPagina=g=>{
    page=doc.addPage([612,792]);
    const dim=imagen.scale(Math.min(86/imagen.width,48/imagen.height));
    page.drawImage(imagen,{x:34,y:758-dim.height,width:dim.width,height:dim.height});
    const razon=pfPDFLineas(empresa.razon,bold,10,428),datos=[...razon,
      ...pfPDFLineas('RFC: '+(empresa.rfc||'-'),normal,8,428),
      ...(empresa.domicilio?pfPDFLineas(empresa.domicilio,normal,8,428):[])];
    let hy=758;datos.forEach((t,i)=>{const font=i<razon.length?bold:normal,size=i<razon.length?10:8;texto(page,t,578-pfPDFAncho(t,font,size),hy,font,size,navy);hy-=12;});
    y=Math.min(699,hy-10);page.drawLine({start:{x:34,y},end:{x:578,y},thickness:1.4,color:navy});
    const titulo='PLANTILLA ACTIVA A UNA FECHA';y-=23;texto(page,titulo,306-pfPDFAncho(titulo,bold,13)/2,y,bold,13,navy);
    y-=20;const contexto=pfPDFLineas('Centro: '+obra.nombre+' | Corte al '+fmtD(fecha),normal,9,544);bloquear(page,contexto,34,y,normal,9);y-=contexto.length*11.5+10;
    const ct=pfPDFLineas('CONTRATISTA: '+g.ct,bold,10,544);bloquear(page,ct,34,y,bold,10,navy);y-=ct.length*12.5+7;
    texto(page,g.gente.length+' trabajador(es) activos en el corte | Total del reporte: '+filas.length,34,y,normal,8);y-=19;
    if(y<200)throw Error('El encabezado es demasiado extenso. Revisa los datos corporativos.');
    page.drawRectangle({x:34,y:y-26,width:544,height:26,color:navy});
    [['NO.'],['NOMBRE COMPLETO'],['PUESTO'],['CUADRILLA'],['INGRESO /','REINGRESO']].forEach((ls,i)=>bloquear(page,ls,xs[i]+4,y-10,bold,7.2,rgb(1,1,1)));
    y-=26;
  };
  for(const g of gs){
    nuevaPagina(g);
    g.gente.sort((a,b)=>(a.no_trab??9e9)-(b.no_trab??9e9)||fullName(a).localeCompare(fullName(b),'es'));
    for(let n=0;n<g.gente.length;n++){
      const w=g.gente[n],reingreso=w.fecha_reingreso&&w.fecha_reingreso<=fecha;
      const valores=[w.no_trab??'-',fullName(w),w.puesto||'-',w.cuadrilla_pdf||'-',fmtD(reingreso?w.fecha_reingreso:w.fecha_alta)+(reingreso?' (R)':'')];
      const ls=valores.map((v,i)=>pfPDFLineas(v,i===1?bold:normal,8.5,anchos[i]-8));
      const alto=Math.max(23,Math.max(...ls.map(x=>x.length))*11+10);
      if(alto>y-65){nuevaPagina(g);if(alto>y-65)throw Error('Los datos de un trabajador son demasiado extensos para una hoja.');}
      if(n%2===0)page.drawRectangle({x:34,y:y-alto,width:544,height:alto,color:claro});
      ls.forEach((l,i)=>bloquear(page,l,xs[i]+4,y-14,i===1?bold:normal,8.5));
      page.drawLine({start:{x:34,y:y-alto},end:{x:578,y:y-alto},thickness:.4,color:linea});y-=alto;
    }
  }
  const pages=doc.getPages();pages.forEach((p,i)=>{
    p.drawLine({start:{x:34,y:49},end:{x:578,y:49},thickness:.5,color:linea});
    texto(p,'Control de personal: informa cambios a Administración. (R) = reingreso.',34,37,normal,7);
    const pie='Página '+(i+1)+' de '+pages.length;texto(p,pie,578-pfPDFAncho(pie,normal,7),24,normal,7);
  });
  doc.setTitle('Plantilla activa al '+fmtD(fecha)+' - '+obra.nombre);doc.setAuthor(empresa.razon);
  return doc.save();
}
async function exportPlantillaFechaPDF(){
  if(window._PF_EXPORTANDO)return;
  const f=$('pf-fecha')?.value,ct=$('pf-contratista')?.value||'',obra=OBRA&&{...OBRA};
  const date=new Date(f+'T12:00:00Z');
  if(!f||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==f){toast('Elige una fecha válida.','err');return;}
  if(!obra){toast('Selecciona el centro de trabajo.','err');return;}
  const act=pfActivos(f,ct).map(w=>({...w,cuadrilla_pdf:cuadNombre(w)||''}));
  if(!act.length){toast('No había trabajadores activos con esos filtros.','err');return;}
  const codigo=empresaDeObra(obra),empresa={...(CFGEMP['empresa_'+codigo]||{})};
  empresa.razon=empresa.razon||razonSocialEmpresa(codigo);
  const logo=logoEmpresa(codigo);
  window._PF_EXPORTANDO=true;if($('pf-pdf'))$('pf-pdf').disabled=true;
  try{
    const lib=await pfCargarPDF(),bytes=await pfConstruirPDF(lib,{fecha:f,obra,empresa,logo,filas:act});
    if(OBRA?.id!==obra.id)throw Error('Cambió el centro de trabajo. Vuelve a generar el PDF.');
    const nombre='PLANTILLA_ACTIVA_'+f+'_'+obra.nombre+'_'+(ct||'GENERAL');
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');
    a.href=url;a.download=nombre.replace(/[^\p{L}\p{N}_-]/gu,'_')+'.pdf';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    toast('PDF descargado: '+act.length+' trabajadores al '+fmtD(f)+'.','ok');
  }catch(e){toast('No se pudo generar el PDF: '+e.message,'err');}
  finally{window._PF_EXPORTANDO=false;if($('pf-out')&&$('pf-fecha'))pfCalcular();}
}
