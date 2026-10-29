/* Una selección de consecutivos alimenta ambos archivos. Sólo consulta datos;
   no expide, libera en el banco, entrega ni modifica un cheque. */
function cqNumero(v){const s=String(v??'').trim(),n=Number(s);return /^\d+$/.test(s)&&Number.isSafeInteger(n)&&n>0?n:null;}
function cqBloque(v){const n=cqNumero(v);return n===null?null:Math.floor((n-1)/50)*50+1;}
function cqEtiqueta(n){return n+'–'+(n+49);}
function cqFisico(c){return cqNumero(c.consecutivo)!==null&&!!String(c.num_cheque||'').trim();}
function cqPeriodo(c,obra){
  const m=String(c.semana??'').trim().match(/^(?:S(?:EMANA)?\s*)?(\d+)$/i),n=m&&cqNumero(m[1]);
  if(!n)throw Error('Semana no válida en el consecutivo '+c.consecutivo+'.');
  const base=String(obra.fecha_inicio||SEMANA1).slice(0,10),d=new Date(base+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(base)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==base||d.getUTCDay()!==1)throw Error('Configura el lunes inicial del calendario de '+obra.nombre+'.');
  d.setUTCDate(d.getUTCDate()+(n-1)*7);const desde=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);
  return {semana:String(n),desde,hasta:d.toISOString().slice(0,10)};
}
function cqCatalogo(cheques,obra){
  const gs=new Map();
  for(const c of cheques){
    if(c.obra_id!==obra.id||!cqFisico(c)||(c.eliminado&&c.estatus!=='CANCELADO'))continue;
    const inicio=cqBloque(c.consecutivo);if(!gs.has(inicio))gs.set(inicio,{inicio,expedidos:0,entregados:0,cancelados:0,pendientes:0,folios:new Set()});
    const b=gs.get(inicio);b.folios.add(cqNumero(c.consecutivo));
    b[c.estatus==='EXPEDIDO'?'expedidos':c.estatus==='ENTREGADO'?'entregados':c.estatus==='CANCELADO'?'cancelados':'pendientes']++;
  }
  return [...gs.values()].sort((a,b)=>a.inicio-b.inicio).map(b=>({...b,sinRegistro:50-b.folios.size}));
}
function cqPlan(cheques,bloques,incluirEntregados,obra){
  const elegidos=new Set(bloques.map(Number)),activos=[],cancelados=[],omitidos=[],errores=[],consec=new Map(),folios=new Map();
  for(const c of cheques.filter(c=>c.obra_id===obra.id&&!c.eliminado&&c.estatus!=='CANCELADO'&&cqFisico(c))){
    const n=cqNumero(c.consecutivo),f=String(c.num_cheque).trim();consec.set(n,(consec.get(n)||0)+1);folios.set(f,(folios.get(f)||0)+1);
  }
  for(const c of cheques.filter(c=>c.obra_id===obra.id&&elegidos.has(cqBloque(c.consecutivo)))){
    if(c.estatus==='CANCELADO'&&cqFisico(c)){cancelados.push({...c});continue;}
    if(c.eliminado)continue;
    if(!cqFisico(c)||!(c.estatus==='EXPEDIDO'||(incluirEntregados&&c.estatus==='ENTREGADO'))){omitidos.push({...c});continue;}
    if(consec.get(cqNumero(c.consecutivo))!==1||folios.get(String(c.num_cheque).trim())!==1)errores.push('Folio o consecutivo repetido: '+c.consecutivo+'. Revisa sus capturas.');
    if(!Number.isFinite(Number(c.importe))||Number(c.importe)<=0)errores.push('Importe no válido en '+c.consecutivo+'.');
    if(!c.trabajador_id)errores.push('Falta vincular al trabajador del consecutivo '+c.consecutivo+'.');
    try{activos.push({...c,calendario:cqPeriodo(c,obra)});}catch(e){errores.push(e.message);}
  }
  const ordenar=(a,b)=>cqNumero(a.consecutivo)-cqNumero(b.consecutivo)||String(a.id).localeCompare(String(b.id));
  activos.sort(ordenar);cancelados.sort(ordenar);omitidos.sort(ordenar);
  return {obra:{...obra},bloques:[...elegidos].sort((a,b)=>a-b),incluirEntregados,activos,cancelados,omitidos,errores:[...new Set(errores)],catalogo:cqCatalogo(cheques,obra).filter(b=>elegidos.has(b.inicio))};
}
function cqFirma(p){
  const keys=['id','obra_id','trabajador_id','no_trab','contratista','nombre','puesto','curp','semana','periodo','importe','tipo_pago','num_cheque','consecutivo','estatus','eliminado'];
  return JSON.stringify([p.obra.id,p.obra.fecha_inicio,p.bloques,p.incluirEntregados,...[p.activos,p.cancelados,p.omitidos].map(rows=>rows.map(c=>keys.map(k=>c[k]??null))),p.errores]);
}
async function cqLeerCheques(obra){const r=await fetchAllRows(()=>sb.from('cheques').select('*').eq('obra_id',obra.id));if(r.error)throw r.error;return r.data||[];}
function cqContexto(e){if(window._CQ!==e||OBRA?.id!==e.obra.id||empresaDeObra(OBRA)!==e.empresa||String(OBRA.fecha_inicio||SEMANA1).slice(0,10)!==String(e.obra.fecha_inicio||SEMANA1).slice(0,10))throw Error('Cambió el centro o su calendario. Abre de nuevo Chequeras físicas.');}
async function openChequerasFisicas(){
  if(!OBRA){toast('Selecciona un centro de trabajo.','err');return;}
  if(window._CQ?.ocupado){toast('Espera a que termine el archivo en preparación.','err');return;}
  const e={obra:{...OBRA},empresa:empresaDeObra(OBRA),seleccion:new Set(),cheques:[],plan:null,ocupado:false};window._CQ=e;
  modal(`<div class="m-head"><h2>📚 Chequeras físicas · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div><div class="m-body">
    <p>Selecciona bloques de <b>50 consecutivos</b>. La liberación y los legajos conservan la misma selección y orden.</p>
    <p style="font-size:12px;color:var(--mut)">Se incluyen expedidos. Los cancelados van aparte, sin legajo. Las cartas y recibos de finiquito llevan el domingo de su semana, aunque la baja o la generación tenga otra fecha.</p>
    <label style="display:flex;gap:9px;align-items:center;margin:12px 0"><input id="cq-entregados" type="checkbox" onchange="cqInvalidar()">Incluir entregados para reimpresión</label>
    <div style="display:flex;gap:8px;margin:10px 0"><button class="btn" onclick="cqSeleccionarTodos(true)">Seleccionar todos los bloques</button><button class="btn" onclick="cqSeleccionarTodos(false)">Quitar selección</button></div>
    <div id="cq-bloques" style="max-height:260px;overflow:auto"><span class="spin"></span> Consultando chequeras...</div><div id="cq-resumen" role="status" style="margin:12px 0"></div>
    <button class="btn" id="cq-preparar" onclick="cqPreparar()">Revisar selección y recibos</button><div id="cq-previa" style="margin-top:12px;max-height:360px;overflow:auto"></div></div>
    <div class="m-foot" style="flex-wrap:wrap"><button class="btn" onclick="closeModal()">Cerrar</button><button class="btn" id="cq-excel" onclick="cqGenerar('excel')">⬇ Liberación Excel</button><button class="btn" id="cq-pdf" onclick="cqGenerar('pdf')">⬇ Legajos PDF</button><button class="btn dark" id="cq-ambos" onclick="cqGenerar('ambos')">⬇ Ambos archivos (ZIP)</button></div>`,'lg');
  try{e.cheques=await cqLeerCheques(e.obra);cqContexto(e);cqPintarBloques();}catch(err){if(window._CQ===e&&$('cq-bloques'))$('cq-bloques').textContent='No se pudieron consultar los cheques: '+err.message;}
}
function cqPintarBloques(){
  const e=window._CQ;if(!e||!$('cq-bloques'))return;const bs=cqCatalogo(e.cheques,e.obra);
  $('cq-bloques').innerHTML=bs.length?bs.map(b=>`<label style="display:flex;gap:10px;align-items:center;border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:7px;cursor:pointer"><input type="checkbox" class="cq-bloque" value="${b.inicio}" ${e.seleccion.has(b.inicio)?'checked':''} onchange="cqSeleccionar(${b.inicio},this.checked)"><span><b>Consecutivos ${cqEtiqueta(b.inicio)}</b><small style="display:block;color:var(--mut)">${b.expedidos} expedidos · ${b.entregados} entregados · ${b.cancelados} cancelados · ${b.pendientes} sin expedir · ${b.sinRegistro} sin registro físico</small></span></label>`).join(''):'<div class="empty">No hay cheques con número y consecutivo capturados en este centro.</div>';
  cqResumen();
}
function cqInvalidar(){const e=window._CQ;if(!e||e.ocupado)return;e.plan=null;if($('cq-previa'))$('cq-previa').innerHTML='';cqResumen();}
function cqSeleccionar(n,checked){const e=window._CQ;if(!e||e.ocupado)return;if(checked)e.seleccion.add(n);else e.seleccion.delete(n);cqInvalidar();}
function cqSeleccionarTodos(checked){const e=window._CQ;if(!e||e.ocupado)return;e.seleccion=new Set(checked?cqCatalogo(e.cheques,e.obra).map(b=>b.inicio):[]);cqInvalidar();cqPintarBloques();}
function cqResumen(){
  const e=window._CQ;if(!e||!$('cq-resumen'))return;const p=cqPlan(e.cheques,[...e.seleccion],!!$('cq-entregados')?.checked,e.obra);
  $('cq-resumen').textContent=p.bloques.length+' bloque(s) · '+p.activos.length+' cheques · $'+money(p.activos.reduce((n,c)=>n+Math.round(Number(c.importe||0)*100),0)/100)+' · '+p.cancelados.length+' cancelados excluidos.';
}
function cqOcupado(e,valor){e.ocupado=valor;if(window._CQ===e)document.querySelectorAll('#cq-bloques input,#cq-entregados,#cq-preparar,#cq-excel,#cq-pdf,#cq-ambos,.cq-recibo').forEach(el=>el.disabled=valor);}
async function cqLeerExpedientes(p){
  const ids=[...new Set(p.activos.map(c=>c.trabajador_id).filter(Boolean))],workers=[],docs=[];
  for(let i=0;i<ids.length;i+=100){
    const lote=ids.slice(i,i+100),[wr,dr]=await Promise.all([
      fetchAllRows(()=>sb.from('trabajadores').select('id,obra_id,no_trab,nombres,primer_apellido,segundo_apellido,rfc,curp,nss,puesto').in('id',lote)),
      fetchAllRows(()=>sb.from('documentos').select('id,trabajador_id,categoria,semana,archivo,nombre_archivo,hash,anulado,periodo_inicio,periodo_fin,nomina_neto').in('trabajador_id',lote).eq('categoria','RECIBO_NOMINA').or('anulado.eq.false,anulado.is.null'))
    ]);if(wr.error||dr.error)throw wr.error||dr.error;workers.push(...(wr.data||[]));docs.push(...(dr.data||[]));
  }
  const byId=new Map(workers.map(w=>[w.id,w]));
  p.filas=p.activos.map(c=>{const vistos=new Set(),recs=docs.filter(d=>d.trabajador_id===c.trabajador_id&&normSem(d.semana)===c.calendario.semana&&!d.anulado&&d.archivo)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id))).filter(d=>{const k=d.hash||d.archivo;if(vistos.has(k))return false;vistos.add(k);return true;});
    return {cheque:c,w:byId.get(c.trabajador_id)||null,recs,reciboId:recs.length===1?recs[0].id:''};});return p;
}
async function cqPreparar(){
  const e=window._CQ;if(!e||e.ocupado)return false;if(!e.seleccion.size){toast('Selecciona al menos un bloque físico.','err');return false;}
  cqOcupado(e,true);e.plan=null;
  try{
    cqContexto(e);const cheques=await cqLeerCheques(e.obra);cqContexto(e);e.cheques=cheques;
    const p=cqPlan(cheques,[...e.seleccion],!!$('cq-entregados')?.checked,e.obra);if(p.errores.length)throw Error(p.errores.join(' '));
    if(!p.activos.length&&!p.cancelados.length)throw Error('No hay cheques expedidos en estos bloques. Revisa la opción de reimpresión.');
    await cqLeerExpedientes(p);cqContexto(e);e.plan=p;cqPintarBloques();cqPintarPrevia();return true;
  }catch(err){if(window._CQ===e&&$('cq-previa'))$('cq-previa').textContent='No se pudo preparar: '+err.message;toast(err.message,'err');return false;}
  finally{cqOcupado(e,false);}
}
function cqElegirRecibo(id,reciboId){const e=window._CQ;if(!e||e.ocupado)return;const f=e.plan?.filas.find(r=>r.cheque.id===id);if(f)f.reciboId=f.recs.some(d=>d.id===reciboId)?reciboId:'';}
function cqPintarPrevia(){
  const p=window._CQ?.plan;if(!p||!$('cq-previa'))return;const faltan=p.filas.filter(f=>!f.w||!f.reciboId).length;
  $('cq-previa').innerHTML=`<p><b>${p.activos.length} legajos en orden de consecutivo</b> · ${p.activos.filter(c=>c.tipo_pago==='FINIQUITO').length} finiquitos${faltan?' · '+faltan+' pendientes de recibo o ficha':''}.</p>
    ${p.omitidos.length?`<p>${p.omitidos.length} capturas pendientes o entregadas no seleccionadas quedan fuera.</p>`:''}
    <table class="tb"><thead><tr><th>Consecutivo</th><th>Trabajador / semana</th><th>Separación</th><th>Recibo PDF</th></tr></thead><tbody>${p.filas.map(f=>{const c=f.cheque;return `<tr><td>${esc(c.consecutivo)}</td><td><b>${esc(c.nombre)}</b><br>S${c.calendario.semana} · $${money(c.importe)}</td><td>${c.tipo_pago==='FINIQUITO'?'Carta + finiquito<br>'+fmtD(c.calendario.hasta):'Sólo recibo'}</td><td>${!f.w?'No se pudo consultar la ficha':!f.recs.length?'Falta importar recibo de esta semana':f.recs.length===1?esc(f.recs[0].nombre_archivo||'Recibo archivado'):`<select class="cq-recibo" aria-label="Recibo del consecutivo ${esc(c.consecutivo)}" onchange="cqElegirRecibo('${c.id}',this.value)"><option value="">Elige el recibo correspondiente</option>${f.recs.map(d=>`<option value="${d.id}"${f.reciboId===d.id?' selected':''}>${esc(d.nombre_archivo||d.archivo)}</option>`).join('')}</select>`}</td></tr>`;}).join('')}</tbody></table>
    <p style="font-size:12px;color:var(--mut)">Se conservan las páginas originales del recibo y se validan identidad, periodo y huella. Si falta alguno, la liberación puede descargarse; el legajo completo espera su documentación.</p>`;
}
function cqLibro(p){
  const wb=XLSX.utils.book_new(),head=['NO. TRAB.','CONTRATISTA','NOMBRE COMPLETO','PUESTO','CURP','SEMANA','PERIODO','IMPORTE','TIPO PAGO','NÚMERO DE CHEQUE','CONSECUTIVO','ESTATUS'];
  const rs=[ST.cellC,ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.money,ST.cellC,ST.cellC,ST.cellC,ST.cellC];
  for(const [name,list]of [['CHEQUES',p.activos],['CANCELADOS',p.cancelados]]){
    const rows=[[(name==='CHEQUES'?'CONTROL DE CHEQUES':'CHEQUES CANCELADOS — NO LIBERAR')+' — '+p.obra.nombre+' — '+fmtD(today())],head],styles=[ST.title,ST.head];
    for(const c of list){rows.push([c.no_trab??'',c.contratista||'',c.nombre||'',c.puesto||'',c.curp||'',c.semana||'',c.periodo||'',Number(c.importe)||0,c.tipo_pago||'',String(c.num_cheque||''),String(c.consecutivo||''),c.estatus]);styles.push(name==='CANCELADOS'?rs.map((_,i)=>i===7?ST.finMoney:ST.fin):rs);}
    rows.push(['','','','','','',name==='CHEQUES'?'TOTAL':'TOTAL CANCELADO',list.reduce((n,c)=>n+Math.round(Number(c.importe||0)*100),0)/100,'','','','']);styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total,ST.total,ST.total,ST.total]);
    const ws=buildSheet(rows,styles,[9,14,36,24,20,8,18,12,12,16,13,12],[{s:{r:0,c:0},e:{r:0,c:11}}],[{hpt:28},{hpt:26}]);
    for(let r=2;r<2+list.length;r++)for(const col of [4,9,10]){const cell=ws[XLSX.utils.encode_cell({r,c:col})];if(cell){cell.t='s';cell.v=String(cell.v??'');cell.z='@';}}
    ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:list.length+1,c:11}})};XLSX.utils.book_append_sheet(wb,ws,name);
  }
  const rows=[['CONTROL DE BLOQUES FÍSICOS — '+p.obra.nombre],['BLOQUE','EXPEDIDOS','ENTREGADOS','CANCELADOS','SIN EXPEDIR','SIN REGISTRO FÍSICO'],...p.catalogo.map(b=>[cqEtiqueta(b.inicio),b.expedidos,b.entregados,b.cancelados,b.pendientes,b.sinRegistro])];
  XLSX.utils.book_append_sheet(wb,buildSheet(rows,[ST.title,ST.head,...p.catalogo.map(()=>Array(6).fill(ST.cellC))],[22,14,14,14,16,26],[{s:{r:0,c:0},e:{r:0,c:5}}],[{hpt:28},{hpt:28}]),'BLOQUES');wb.__auditObraIds=[p.obra.id];return wb;
}
async function cqExcelBytes(wb){
  if(!window.JSZip)throw Error('No está disponible el componente ZIP. Actualiza la plataforma.');
  const zip=await JSZip.loadAsync(XLSX.write(wb,{type:'array',bookType:'xlsx'}));
  for(const f of Object.keys(zip.files).filter(f=>/^xl\/worksheets\/sheet\d+\.xml$/.test(f)))zip.file(f,configurarPaginaXlsx(await zip.file(f).async('string'),false));
  await aplicarMarcaCorporativaXlsx(zip,wb);return zip.generateAsync({type:'uint8array'});
}
function cqValidarRecibo(info,f,obra=OBRA){
  const d=info?.datos,c=f.cheque,w=f.w,n=s=>String(s||'').toUpperCase().replace(/\s/g,'');
  if(info?.errores?.length)throw Error(info.errores.join('; '));
  if(!d||d.recibos!==1||!Number.isFinite(info.neto))throw Error('No se pudo identificar un único recibo con neto. Revisa la lectura de este PDF.');
  const ids=new Set((d.identificadores||[]).map(n));if(![w.rfc,w.curp,w.nss,c.curp].map(n).filter(Boolean).some(id=>ids.has(id)))throw Error('El recibo no acredita la identidad del trabajador.');
  const emisor=n((CFGEMP['empresa_'+empresaDeObra(obra)]||{}).rfc);if(emisor&&d.rfc_emisor&&n(d.rfc_emisor)!==emisor)throw Error('El recibo pertenece a otra razón social.');
  if(!d.periodo_inicio||!d.periodo_fin||d.periodo_inicio>d.periodo_fin||d.periodo_inicio<c.calendario.desde||d.periodo_fin>c.calendario.hasta)throw Error('El periodo del recibo no corresponde a S'+c.calendario.semana+' ('+c.calendario.desde+' al '+c.calendario.hasta+').');
}
/* La plantilla individual es la única fuente del texto y las negritas. */
function cqTramos(n,bold=false){
  if(n.nodeType===3)return [{texto:n.textContent,bold}];if(n.nodeName==='BR')return [{texto:'\n',bold}];
  return [...n.childNodes].flatMap(c=>cqTramos(c,bold||n.nodeName==='B'||n.nodeName==='STRONG'));
}
function cqLineas(tramos,fonts,size,width){
  const lines=[];let line=[],ancho=0,space=false;const nueva=()=>{if(line.length)lines.push(line);line=[];ancho=0;space=false;};
  for(const run of tramos)for(const token of run.texto.replace(/[^\S\n]+/g,' ').match(/\S+|\n| +/g)||[]){
    if(token==='\n'){nueva();continue;}if(token===' '){space=true;continue;}
    const font=run.bold?fonts.bold:fonts.normal,piezas=font.widthOfTextAtSize(token,size)>width?[...token]:[token];
    for(const word of piezas){let text=(space&&line.length?' ':'')+word,w=font.widthOfTextAtSize(text,size);if(line.length&&ancho+w>width){nueva();text=word;w=font.widthOfTextAtSize(text,size);}line.push({texto:text,bold:run.bold,ancho:w});ancho+=w;space=false;}
  }nueva();return lines;
}
async function cqSeparacionPDF(doc,lib,f,obra,fonts){
  const c=f.cheque,w={...f.w,obra_id:obra.id,puesto:c.puesto||f.w.puesto},html=renunciaPagesHTML(w,renunciaOpts(w,Number(c.importe),c.calendario.hasta));
  const pages=[...new DOMParser().parseFromString(html,'text/html').querySelectorAll('.pg')];if(pages.length!==2)throw Error('No se pudieron preparar los dos documentos de separación.');
  const texto=(p,t,x,y,size=10.125,bold=false)=>p.drawText(t,{x,y,size,font:bold?fonts.bold:fonts.normal,color:lib.rgb(.067,.067,.067)});
  for(const [i,pg]of pages.entries()){
    const paras=[...pg.children].filter(n=>n.tagName==='P'),titulo=pg.querySelector('h1').textContent,fecha=pg.querySelector('.fecha').textContent;
    let size=10.125,lh,layout,altura;
    do{lh=size*1.62;layout=paras.map(p=>cqLineas(cqTramos(p),fonts,size,516));altura=layout.reduce((n,ls)=>n+ls.length*lh+11,0);if(altura<=475)break;size-=.25;}while(size>=9);
    if(altura>475)throw Error('El texto de separación es demasiado extenso para una hoja. Revisa la ficha.');
    const p=doc.addPage([612,792]);texto(p,titulo,(612-fonts.bold.widthOfTextAtSize(titulo,11.25))/2,739,11.25,true);
    let y=711;for(const l of pfPDFLineas(fecha,fonts.normal,10.125,516)){texto(p,l,564-fonts.normal.widthOfTextAtSize(l,10.125),y);y-=16;}y-=17;
    for(const ls of layout){for(const line of ls){let x=48;for(const r of line){texto(p,r.texto,x,y,size,r.bold);x+=r.ancho;}y-=lh;}y-=11;}
    const nombres=pfPDFLineas(fullName(w),fonts.bold,10.125,330),fy=i===0?Math.min(y-95,265):Math.min(y-60,159);
    if(fy<70||fy-nombres.length*14<55)throw Error('Falta espacio para la firma. Revisa el texto.');
    if(i===0)texto(p,'ATENTAMENTE',(612-fonts.bold.widthOfTextAtSize('ATENTAMENTE',10.125))/2,fy+50,10.125,true);
    p.drawLine({start:{x:141,y:fy+13},end:{x:471,y:fy+13},thickness:.65});let ny=fy;
    for(const n of nombres){texto(p,n,(612-fonts.bold.widthOfTextAtSize(n,10.125))/2,ny,10.125,true);ny-=14;}
    texto(p,'FIRMA Y HUELLA',(612-fonts.normal.widthOfTextAtSize('FIRMA Y HUELLA',9))/2,ny-1,9);
    if(i===0)for(const x of [48,342]){p.drawLine({start:{x,y:89},end:{x:x+222,y:89},thickness:.65});texto(p,'TESTIGO',x+90,75,9);}
  }
}
async function cqConstruirLegajos(lib,p,progreso=()=>{}){
  if(!p.activos.length)throw Error('No hay cheques vigentes para preparar legajos.');
  const faltan=p.filas.filter(f=>!f.w||!f.reciboId);if(faltan.length)throw Error('Completa ficha y recibo de '+faltan.length+' trabajador(es) en la vista previa.');
  const doc=await lib.PDFDocument.create(),fonts={normal:await doc.embedFont(lib.StandardFonts.TimesRoman),bold:await doc.embedFont(lib.StandardFonts.TimesRomanBold)},indice=[];
  for(const [i,f]of p.filas.entries()){
    const c=f.cheque,d=f.recs.find(d=>d.id===f.reciboId),label='Consecutivo '+c.consecutivo+' · '+c.nombre+' · S'+c.calendario.semana;progreso(i+1,p.filas.length,label);
    try{
      const r=await sb.storage.from('expedientes').download(d.archivo);if(r.error||!r.data)throw Error('No se pudo descargar el recibo privado.');
      const bytes=new Uint8Array(await r.data.arrayBuffer());if(d.hash&&(await sha256Hex(bytes)).toLowerCase()!==String(d.hash).toLowerCase())throw Error('La huella del archivo difiere de su registro.');
      const parsear=window.PLATINUM_RESPALDO_RECIBO?.parsear;if(!parsear)throw Error('No está disponible el lector de recibos.');
      cqValidarRecibo(parsear(await pdfBytesToText(bytes.slice())),f,p.obra);
      const origen=await lib.PDFDocument.load(bytes),desde=doc.getPageCount()+1;if(!origen.getPageCount())throw Error('El recibo no tiene páginas.');
      for(const page of await doc.copyPages(origen,origen.getPageIndices()))doc.addPage(page);
      if(c.tipo_pago==='FINIQUITO')await cqSeparacionPDF(doc,lib,f,p.obra,fonts);
      indice.push({consecutivo:c.consecutivo,semana:c.calendario.semana,desde,hasta:doc.getPageCount(),documento_id:d.id});
    }catch(err){throw Error(label+': '+err.message);}
  }
  doc.setTitle('Legajos para entrega de cheques - '+p.obra.nombre);doc.setSubject('Bloques '+p.bloques.map(cqEtiqueta).join(', '));return {bytes:await doc.save(),indice,paginas:doc.getPageCount()};
}
async function cqRevalidar(e,p,conRecibos){
  cqContexto(e);const fresh=cqPlan(await cqLeerCheques(p.obra),p.bloques,p.incluirEntregados,p.obra);cqContexto(e);
  if(cqFirma(fresh)!==cqFirma(p))throw Error('Cambiaron los cheques durante la preparación. Revisa de nuevo la selección.');
  if(conRecibos){await cqLeerExpedientes(fresh);cqContexto(e);for(const f of p.filas){const d=f.recs.find(d=>d.id===f.reciboId),fila=fresh.filas.find(x=>x.cheque.id===f.cheque.id),actual=fila?.recs.find(x=>x.id===d.id);if(!actual||JSON.stringify(actual)!==JSON.stringify(d))throw Error('Cambió un recibo durante la preparación. Revisa de nuevo la selección.');
    if(['id','nombres','primer_apellido','segundo_apellido','rfc','curp','nss','puesto'].some(k=>(fila.w?.[k]??null)!==(f.w?.[k]??null)))throw Error('Cambió la ficha de un trabajador durante la preparación. Revisa de nuevo la selección.');}}
}
function cqDescargar(bytes,name,mime){const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function cqArchivoBase(p){
  const rangos=p.bloques.length<=4?p.bloques.map(n=>n+'-'+(n+49)).join('_'):p.bloques[0]+'-'+(p.bloques.at(-1)+49)+'_'+p.bloques.length+'BLOQUES';
  return p.obra.nombre.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,65)+'_'+rangos+'_'+today();
}
async function cqGenerar(destino){
  if(!['excel','pdf','ambos'].includes(destino))return;const e=window._CQ;if(!e||e.ocupado)return;if(!e.plan&&!await cqPreparar())return;
  const p=e.plan;if(!p)return;cqOcupado(e,true);
  try{
    cqContexto(e);await cqRevalidar(e,p,false);
    const excel=destino!=='pdf',pdf=destino!=='excel',base=cqArchivoBase(p),wb=excel?cqLibro(p):null;
    const xbytes=excel?await cqExcelBytes(wb):null,legajos=pdf?await cqConstruirLegajos(await pfCargarPDF(),p,(i,n,t)=>{cqContexto(e);if($('cq-resumen'))$('cq-resumen').textContent='Preparando '+i+' de '+n+' · '+t;}):null;
    await cqRevalidar(e,p,pdf);
    if(destino==='ambos'){const zip=new JSZip();zip.file('LIBERACION_CHEQUES_'+base+'.xlsx',xbytes);zip.file('LEGAJOS_CHEQUES_'+base+'.pdf',legajos.bytes);const bytes=await zip.generateAsync({type:'uint8array'});cqContexto(e);cqDescargar(bytes,'CHEQUERAS_'+base+'.zip','application/zip');}
    else if(excel)cqDescargar(xbytes,'LIBERACION_CHEQUES_'+base+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');else cqDescargar(legajos.bytes,'LEGAJOS_CHEQUES_'+base+'.pdf','application/pdf');
    if(excel)await registrarExportacion(wb,'LIBERACION_CHEQUES_'+base+'.xlsx');
    toast('Archivo generado: '+p.activos.length+' cheques'+(legajos?' · '+legajos.paginas+' páginas de legajos':'')+'.','ok');
  }catch(err){toast('No se generó el archivo: '+err.message,'err');if(window._CQ===e&&$('cq-resumen'))$('cq-resumen').textContent=err.message;}
  finally{cqOcupado(e,false);}
}
