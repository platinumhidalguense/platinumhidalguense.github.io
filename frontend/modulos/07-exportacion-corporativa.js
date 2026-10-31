/* ---------- helpers de Excel con estilo corporativo ---------- */
const BORD={top:{style:'thin',color:{rgb:'D0D5DD'}},bottom:{style:'thin',color:{rgb:'D0D5DD'}},left:{style:'thin',color:{rgb:'D0D5DD'}},right:{style:'thin',color:{rgb:'D0D5DD'}}};
const ST={
  title:{font:{bold:true,sz:14,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'14213D'}},alignment:{horizontal:'center',vertical:'center'}},
  sub:{font:{bold:true,sz:10.5,color:{rgb:'14213D'},name:'Calibri'},fill:{fgColor:{rgb:'E9EDF5'}},alignment:{horizontal:'center',vertical:'center'}},
  head:{font:{bold:true,sz:10,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'1F2F52'}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:BORD},
  sect:{font:{bold:true,sz:10.5,color:{rgb:'9A6700'},name:'Calibri'},fill:{fgColor:{rgb:'FFF3D6'}},alignment:{horizontal:'left',vertical:'center'},border:BORD},
  sect2:{font:{bold:true,sz:10.5,color:{rgb:'0B57D0'},name:'Calibri'},fill:{fgColor:{rgb:'E8EFFC'}},alignment:{horizontal:'left',vertical:'center'},border:BORD},
  cell:{font:{sz:10,name:'Calibri'},border:BORD,alignment:{vertical:'center'}},
  cellC:{font:{sz:10,name:'Calibri'},border:BORD,alignment:{horizontal:'center',vertical:'center'}},
  money:{font:{sz:10,name:'Calibri'},border:BORD,alignment:{horizontal:'right',vertical:'center'},numFmt:'$#,##0.00'},
  fin:{font:{sz:10,name:'Calibri',color:{rgb:'B3261E'},bold:true},fill:{fgColor:{rgb:'FCE4D6'}},border:BORD,alignment:{vertical:'center'}},
  finMoney:{font:{sz:10,name:'Calibri',color:{rgb:'B3261E'},bold:true},fill:{fgColor:{rgb:'FCE4D6'}},border:BORD,alignment:{horizontal:'right',vertical:'center'},numFmt:'$#,##0.00'},
  total:{font:{bold:true,sz:10.5,name:'Calibri',color:{rgb:'14213D'}},fill:{fgColor:{rgb:'D6E4F7'}},border:BORD,alignment:{vertical:'center'}},
  totalMoney:{font:{bold:true,sz:10.5,name:'Calibri',color:{rgb:'14213D'}},fill:{fgColor:{rgb:'D6E4F7'}},border:BORD,alignment:{horizontal:'right',vertical:'center'},numFmt:'$#,##0.00'}
};
function buildSheet(rows,styles,widths,merges,rowHeights){
  const ws=XLSX.utils.aoa_to_sheet(rows);
  if(widths)ws['!cols']=widths.map(w=>({wch:w}));
  if(merges)ws['!merges']=merges;
  if(rowHeights)ws['!rows']=rowHeights;
  if(!ws['!margins'])ws['!margins']={left:0.25,right:0.25,top:0.3,bottom:0.3,header:0.1,footer:0.1};
  styles.forEach((rowSt,r)=>{
    if(!rowSt)return;
    rows[r].forEach((_,c)=>{
      const addr=XLSX.utils.encode_cell({r,c});
      if(!ws[addr])ws[addr]={t:'s',v:''};
      ws[addr].s=Array.isArray(rowSt)?(rowSt[c]||ST.cell):rowSt;
    });
  });
  return ws;
}
function dlPlain(wb,name){XLSX.writeFile(wb,name);}
const MOTOR_NOMINA_VERSION='NOI-11.00.20/PLATINUM-MOTORES-2026-10-30.3';
const _xmlEsc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function _dataUriBytes(uri){
  const m=String(uri||'').match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if(!m)throw new Error('Logo corporativo inválido');
  const bin=atob(m[2]),out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return {ext:m[1].toLowerCase()==='png'?'png':'jpeg',bytes:out};
}
function empresaHoja(wb,nombre){
  const explicita=wb.__empresaPorHoja&&wb.__empresaPorHoja[nombre];
  if(EMPRESAS[explicita])return explicita;
  const obra=OBRAS.find(o=>nombre===o.nombre.slice(0,31).replace(/[\\\/\?\*\[\]:]/g,' ')||nombre.includes(o.nombre.slice(0,20)));
  return obra?empresaDeObra(obra):EMPRESA_ACTIVA;
}
function _agregaRelacion(xml,id,tipo,target){
  const rel=`<Relationship Id="${id}" Type="${tipo}" Target="${target}"/>`;
  return xml.replace('</Relationships>',rel+'</Relationships>');
}
function _siguienteRid(xml){
  let n=0;for(const m of xml.matchAll(/Id="rId(\d+)"/g))n=Math.max(n,Number(m[1])||0);
  return 'rId'+(n+1);
}
/* xlsx-js-style conserva el control de estilos. El logo se integra, a escala
   discreta y respetando su proporción, en el extremo derecho de la franja de
   título. Nunca se coloca sobre los encabezados de columnas ni sobre los datos. */
async function aplicarMarcaCorporativaXlsx(zip,wb){
  // xlsx-js-style 1.2.0 conserva el patrón pero omite bgColor al serializar.
  // Reponer sólo el fondo del patrón dual de este formato; no tocar importes,
  // otras exportaciones ni los colores de transferencias a otros bancos.
  if(wb.__retencionesContratista&&zip.file('xl/styles.xml')){
    const path='xl/styles.xml',xml=await zip.file(path).async('string');
    zip.file(path,xml.replace(/<patternFill patternType="darkDown">([\s\S]*?)<\/patternFill>/g,(all,body)=>
      /<fgColor rgb="(?:FF)?FFFF00"\s*\/>/.test(body)?
        '<patternFill patternType="darkDown">'+body.replace(/<bgColor\b[^>]*\/>/,'')+'<bgColor rgb="FF92D050"/></patternFill>':all));
  }
  let ct=await zip.file('[Content_Types].xml').async('string');
  if(!/Extension="png"/i.test(ct))ct=ct.replace('</Types>','<Default Extension="png" ContentType="image/png"/></Types>');
  if(!/Extension="jpeg"/i.test(ct))ct=ct.replace('</Types>','<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
  for(let idx=0;idx<wb.SheetNames.length;idx++){
    const nombre=wb.SheetNames[idx],codigo=empresaHoja(wb,nombre);
    const razon=razonSocialEmpresa(codigo),logo=_dataUriBytes(logoEmpresa(codigo));
    const num=idx+1,sheetPath=`xl/worksheets/sheet${num}.xml`,sheetFile=zip.file(sheetPath);
    if(!sheetFile)continue;
    const dibujo=`drawingMarca${num}.xml`,media=`marcaEmpresa${num}.${logo.ext}`;
    const ctPart=`/xl/drawings/${dibujo}`;
    if(!ct.includes(`PartName="${ctPart}"`))ct=ct.replace('</Types>',`<Override PartName="${ctPart}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    zip.file(`xl/media/${media}`,logo.bytes);

    const ws=wb.Sheets[nombre]||{},ref=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):{e:{c:3}};
    const titulo=(ws['!merges']||[]).some(m=>m.s.r===0&&m.s.c===0&&m.e.c>=3);
    /* Con título combinado ocupa el extremo derecho de esa misma franja. Si la
       hoja empieza directamente con encabezados, queda en una celda adicional
       fuera de la tabla: en ambos casos es imposible que tape texto. */
    const col=titulo?Math.max(0,ref.e.c):Math.max(0,ref.e.c+1);
    const alto=260000,ancho=codigo==='JIRE'?595000:475000;
    const drawingXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>30000</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>25000</xdr:rowOff></xdr:from><xdr:ext cx="${ancho}" cy="${alto}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Logo ${_xmlEsc(razon)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${ancho}" cy="${alto}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
    zip.file(`xl/drawings/${dibujo}`,drawingXml);
    zip.file(`xl/drawings/_rels/${dibujo}.rels`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media}"/></Relationships>`);

    const relPath=`xl/worksheets/_rels/sheet${num}.xml.rels`;
    let rels=zip.file(relPath)?await zip.file(relPath).async('string'):'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const rid=_siguienteRid(rels);
    rels=_agregaRelacion(rels,rid,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',`../drawings/${dibujo}`);
    zip.file(relPath,rels);

    let xml=await sheetFile.async('string');
    if(!/xmlns:r=/.test(xml))xml=xml.replace('<worksheet ','<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    /* El número de asistencia vive en una celda al pie de cada pestaña. Excel
       reinicia algunos campos del pie al cambiar de hoja y repetía HOJA 1. */
    const encabezado=`<headerFooter><oddHeader>&amp;C&amp;&quot;Calibri,Bold&quot;&amp;12${_xmlEsc(razon)}</oddHeader><oddFooter>&amp;R&amp;D</oddFooter></headerFooter>`;
    if(/<headerFooter[\s>]/.test(xml))xml=xml.replace(/<headerFooter[\s\S]*?<\/headerFooter>/,encabezado);
    else{
      const pos=xml.search(/<(rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|picture|oleObjects|controls|webPublishItems|tableParts|extLst)[ \/>]/);
      xml=pos>=0?xml.slice(0,pos)+encabezado+xml.slice(pos):xml.replace('</worksheet>',encabezado+'</worksheet>');
    }
    const dibujoTag=`<drawing r:id="${rid}"/>`;
    const pos=xml.search(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)[ \/>]/);
    xml=pos>=0?xml.slice(0,pos)+dibujoTag+xml.slice(pos):xml.replace('</worksheet>',dibujoTag+'</worksheet>');
    zip.file(sheetPath,xml);
  }
  zip.file('[Content_Types].xml',ct);
}
function _uuid(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16);});
}
async function registrarBitacoraNomina(registros,{silencioso=true,loteId=null}={}){
  if(!sb||!USER||!registros||!registros.length)return false;
  const lote=loteId||_uuid(),filas=registros.map(r=>({
    lote_id:lote,obra_id:r.obra_id||OBRA.id,empresa_codigo:r.empresa_codigo||empresaDeObra(OBRAS.find(o=>o.id===(r.obra_id||OBRA.id))||OBRA),
    trabajador_id:r.trabajador_id||null,trabajador_numero:r.trabajador_numero??null,trabajador_nombre:r.trabajador_nombre||'',
    tipo_calculo:r.tipo_calculo,periodo:r.periodo||'',formula_version:r.formula_version||MOTOR_NOMINA_VERSION,
    entradas:r.entradas||{},resultado:r.resultado||{},monto_modelo:r.monto_modelo??null,monto_aplicado:r.monto_aplicado??null,
    ajuste_noi:r.ajuste_noi??null,actor_id:USER.id,actor_email:USER.email||''
  }));
  for(let i=0;i<filas.length;i+=200){
    const {error}=await sb.from('auditoria_calculos_nomina').insert(filas.slice(i,i+200));
    if(error){console.warn('Bitácora de nómina:',error.message);if(!silencioso)toast('El cálculo se realizó, pero no pudo registrarse en bitácora: '+error.message,'err');return false;}
  }
  return true;
}
async function registrarExportacion(wb,name){
  const ids=[...new Set((wb.__auditObraIds&&wb.__auditObraIds.length?wb.__auditObraIds:[OBRA&&OBRA.id]).filter(Boolean))];
  return registrarBitacoraNomina(ids.map(id=>({obra_id:id,tipo_calculo:'EXPORTACION_EXCEL',periodo:name,
    entradas:{archivo:name,hojas:wb.SheetNames},resultado:{empresa:empresaDeObra(OBRAS.find(o=>o.id===id)||OBRA),hojas:wb.SheetNames.length}})));
}
/* Para asistencia, cada pestaña debe ser exactamente una página física: de lo
   contrario su número fijo se repetiría si Excel la divide en dos. Los demás
   exportes conservan su escala editable del 100 %. */
function configurarPaginaXlsx(xml,unaPagina){
  xml=xml.replace(/<pageSetUpPr[^>]*\/>/g,'');
  if(unaPagina){
    const ajuste='<pageSetUpPr fitToPage="1"/>';
    if(/<sheetPr[^>]*\/>/.test(xml))xml=xml.replace(/<sheetPr([^>]*)\/>/,`<sheetPr$1>${ajuste}</sheetPr>`);
    else if(/<sheetPr[^>]*>/.test(xml))xml=xml.replace('</sheetPr>',ajuste+'</sheetPr>');
    else xml=xml.replace(/(<worksheet[^>]*>)/,`$1<sheetPr>${ajuste}</sheetPr>`);
  }
  const ps=unaPagina
    ? '<pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="1"/>'
    : '<pageSetup paperSize="1" orientation="landscape" scale="100"/>';
  if(/<pageSetup[ \/>]/.test(xml))return xml.replace(/<pageSetup[^>]*\/>/,ps);
  if(/<pageMargins[^>]*\/>/.test(xml))return xml.replace(/(<pageMargins[^>]*\/>)/,'$1'+ps);
  const ins='<pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/>'+ps;
  const pos=xml.search(/<(headerFooter|rowBreaks|colBreaks|drawing|ignoredErrors|tableParts|extLst)[ \/>]/);
  return pos>=0?xml.slice(0,pos)+ins+xml.slice(pos):xml.replace('</worksheet>',ins+'</worksheet>');
}
/* Descarga con orientación horizontal. */
async function dl(wb,name){
  try{
    if(!window.JSZip){dlPlain(wb,name);await registrarExportacion(wb,name);toast('Excel generado sin incrustar logo: falta el componente JSZip.','err');return;}
    const esAsistencia=!!wb.__asistencia;
    const data=XLSX.write(wb,{type:'array',bookType:'xlsx'});
    const zip=await JSZip.loadAsync(data);
    const files=Object.keys(zip.files).filter(f=>/^xl\/worksheets\/sheet\d+\.xml$/.test(f));
    for(const f of files){
      let xml=await zip.file(f).async('string');
      xml=configurarPaginaXlsx(xml,esAsistencia);
      zip.file(f,xml);
    }
    await aplicarMarcaCorporativaXlsx(zip,wb);
    const out=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const a=document.createElement('a');a.href=URL.createObjectURL(out);a.download=name;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    await registrarExportacion(wb,name);
  }catch(e){console.error(e);dlPlain(wb,name);await registrarExportacion(wb,name);toast('Excel generado, pero no fue posible incrustar la marca corporativa.','err');}
}

/* ---------- REQUISICIÓN DE TARJETAS (con VERIFICAR) ---------- */
function reqCandidatos(d1,d2,sem,incluirRezago){
  const enSemana=w=>{
    const reingreso=String(w.fecha_reingreso||'').slice(0,10);
    const ingreso=(reingreso&&reingreso<=d2?reingreso:String(w.fecha_alta||'')).slice(0,10);
    if(ingreso)return !!d1&&!!d2&&ingreso>=d1&&ingreso<=d2;
    return w.semana_ingreso&&String(w.semana_ingreso).replace(/\D/g,'')===String(sem);
  };
  const sinServicio=asSinServicioSemana(d1);
  const act=WORKERS.filter(w=>asVigenteSemana(w,d1,d2)&&!sinServicio.has(w.id)
    &&(w.estatus==='ACTIVO'||(w.estatus==='BAJA'&&w.fecha_baja>d2)));
  const crear=act.filter(w=>String(w.cuenta).toUpperCase()==='CREAR'&&(incluirRezago||enSemana(w)));
  const verificar=act.filter(w=>enSemana(w)&&String(w.cuenta).toUpperCase()!=='CREAR'&&w.cuenta);
  return {crear,verificar};
}
function openRequisicion(){
  const [d1,d2]=weekBounds();
  modal(`
    <div class="m-head"><h2>🪪 Requisición de tarjetas BBVA</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:14px">Obra: <b>${esc(OBRA.nombre)}</b>. Incluye dos apartados: <b>NUEVAS TARJETAS</b> (activos con cuenta CREAR) y <b>VERIFICAR</b> (ingresos de la semana que ya traen cuenta propia).</p>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
        <div><label>No. de semana</label><input id="rq-sem" type="number" value="${semObra()}" oninput="semSincroniza('rq-sem','rq-d1','rq-d2',reqPreview)"></div>
        <div><label>Semana del</label><input id="rq-d1" type="date" value="${d1}" oninput="reqPreview()"></div>
        <div><label>Al</label><input id="rq-d2" type="date" value="${d2}" oninput="reqPreview()"></div>
      </div>
      <div style="margin-top:10px"><label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:13px;color:var(--txt)">
        <input type="checkbox" id="rq-rezago" checked style="width:auto" onchange="reqPreview()">
        Incluir también CREAR rezagados de semanas anteriores
      </label></div>
      <div id="rq-prev" style="margin-top:14px"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" id="rq-btn" onclick="exportRequisicion()">⬇ Generar Excel</button>
    </div>`,'md');
  reqPreview();
}
function reqPreview(){
  const {crear,verificar}=reqCandidatos($('rq-d1').value,$('rq-d2').value,$('rq-sem').value,$('rq-rezago').checked);
  $('rq-prev').innerHTML=`
    <div style="display:flex;gap:10px;margin-bottom:8px">
      <div class="stat a" style="flex:1"><div class="n">${crear.length}</div><div class="l">Nuevas tarjetas (CREAR)</div></div>
      <div class="stat b" style="flex:1"><div class="n">${verificar.length}</div><div class="l">Verificar (ya con cuenta)</div></div>
    </div>
    ${crear.length+verificar.length?'':'<div class="empty">Nada que solicitar con estos criterios.</div>'}`;
  $('rq-btn').disabled=!(crear.length+verificar.length);
}
function exportRequisicion(){
  const sem=$('rq-sem').value||isoWeek(), d1=$('rq-d1').value, d2=$('rq-d2').value;
  const {crear,verificar}=reqCandidatos(d1,d2,sem,$('rq-rezago').checked);
  const rows=[], styles=[];
  rows.push([`REQUISICIÓN DE TARJETAS BBVA — SEMANA ${sem}  ·  ${rangoTexto(d1,d2)}`]); styles.push(ST.title);
  rows.push([`${OBRA.nombre}  ·  ${OBRA.ubicacion||''}`]); styles.push(ST.sub);
  rows.push(['NO.','CONTRATISTA','NOMBRE COMPLETO','CURP','TELÉFONO','CORREO ELECTRÓNICO','OBSERVACIONES']); styles.push(ST.head);
  rows.push([`▼  NUEVAS TARJETAS — CUENTA: CREAR  (${crear.length})`]); styles.push(ST.sect);
  crear.forEach((w,i)=>{rows.push([i+1,w.contratista,fullName(w),w.curp,w.telefono,w.correo,'CUENTA: CREAR']);
    styles.push([ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cell,ST.cell]);});
  if(verificar.length){
    rows.push([`▼  VERIFICAR — INGRESOS DE LA SEMANA CON CUENTA EXISTENTE  (${verificar.length})`]); styles.push(ST.sect2);
    verificar.forEach((w,i)=>{rows.push([i+1,w.contratista,fullName(w),w.curp,w.telefono,w.correo,`VERIFICAR · CUENTA: ${w.cuenta}${w.banco&&w.banco!=='BBVA'?' · '+w.banco:''}`]);
      styles.push([ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cell,ST.cell]);});
  }
  const merges=[{s:{r:0,c:0},e:{r:0,c:6}},{s:{r:1,c:0},e:{r:1,c:6}},{s:{r:3,c:0},e:{r:3,c:6}}];
  if(verificar.length)merges.push({s:{r:4+crear.length,c:0},e:{r:4+crear.length,c:6}});
  const heights=[{hpt:26},{hpt:18},{hpt:24},{hpt:18}];
  const ws=buildSheet(rows,styles,[6,16,38,22,14,34,34],merges,heights);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,`SEMANA ${sem}`);
  dl(wb,`REQUISICION_TARJETAS_BBVA_SEMANA${sem}.xlsx`);
  closeModal();toast(`Requisición generada: ${crear.length} nuevas + ${verificar.length} por verificar.`,'ok');
}

