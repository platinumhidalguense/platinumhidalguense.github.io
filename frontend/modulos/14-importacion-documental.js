/* ---------- IMPORTAR PDFs (acuses IMSS y recibos de nómina) ---------- */
/* Detecta la SEMANA de un recibo NOI desde su periodo ("Del DD/Mmm/AA al ...").
   Así, aunque subas un lote de varias semanas, cada recibo se archiva en su
   semana correcta (antes se usaba una sola semana escrita a mano para todo). */
const _MABREV={ENE:0,FEB:1,MAR:2,ABR:3,MAY:4,JUN:5,JUL:6,AGO:7,SEP:8,OCT:9,NOV:10,DIC:11};
function detectaSemanaRecibo(txt){
  const t=String(txt||'');
  // recibo individual NOI: "Número de Nómina: 17" (pdf.js mete espacios en las palabras)
  const mn=t.match(/N[uú]m\s*ero\s+de\s+N[oó]m\s*ina[:\s]+(\d{1,3})/i);
  if(mn)return 'S'+mn[1];
  // reporte/otros: periodo "DD/mmm./YYYY al ..." o "Del DD/Mmm/AA"
  const m=t.match(/(\d{1,2})\/([A-Za-zÁÉÍÓÚ]{3})[a-z]*\.?\/(\d{2,4})\s+al\b/i);
  if(!m)return null;
  const mo=_MABREV[m[2].toUpperCase().slice(0,3)]; if(mo==null)return null;
  const yy=+m[3], y=yy<100?2000+yy:yy;
  const d=new Date(y,mo,+m[1],12,0,0); if(isNaN(d.getTime()))return null;
  const wk=isoWeekDe(OBRA,d); return wk>0?('S'+wk):null;
}
/* Lee un recibo de nómina NOI (texto pdf.js): neto pagado, tipo (SUELDO normal
   vs FINIQUITO si trae AGUINALDO/PRIMA VACACIONAL) y la semana. */
function parseReciboText(txt){
  const t=String(txt||'');
  let neto=null; const m=t.match(/Neto pagado:\s*([\d,]+\.\d{2})/i); if(m)neto=parseFloat(m[1].replace(/,/g,''));
  const tipo=(/AGUINALDO/i.test(t)||/PRIMA\s+VACACIONAL/i.test(t))?'FINIQUITO':'SUELDO';
  return {neto,tipo,sem:detectaSemanaRecibo(t)};
}
async function pdfBytesToText(bytes){
  const doc=await pdfjsLib.getDocument({data:bytes}).promise; let t='';
  for(let p=1;p<=doc.numPages;p++){const tc=await(await doc.getPage(p)).getTextContent();t+=tc.items.map(i=>i.str).join(' ')+' ';}
  return t;
}
let PDFIMP=[];
function openPdfImport(){
  modal(`
    <div class="m-head"><h2>📎 Importar PDFs · acuses IMSS y recibos</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:14px">Sube uno o varios PDFs (individuales o combinados). La app <b>lee cada página</b>, encuentra el NSS o CURP y lo liga al trabajador. Los PDFs combinados se separan solos por trabajador. Nada se guarda hasta que confirmes.</p>
      <p style="background:var(--blue-bg);border-radius:8px;padding:9px 12px;font-size:12px;color:var(--txt);margin-bottom:14px">🆕 <b>Constancias IMSS con varios movimientos:</b> si el acuse del IDSE trae hasta <b>10 altas / reingresos / bajas / modificaciones</b> (aunque la tabla siga en la 2ª página), se leen <b>todos</b> los renglones y cada uno se liga a su trabajador por NSS. El tipo de movimiento y la fecha se toman del propio acuse, renglón por renglón.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr">
        <div><label>Categoría</label><select id="pdf-cat" onchange="pdfCatChange()"><option value="ACUSE_IMSS">ACUSE IMSS</option><option value="RECIBO_NOMINA">RECIBO DE NÓMINA</option></select></div>
        <div><label>Tipo de movimiento</label><select id="pdf-sub"><option>ALTA</option><option>BAJA</option><option>MODIFICACION SALARIAL</option></select><div class="fhint">"MODIFICACION SALARIAL" = acuse IMSS de modificación de salario (mov. 08). Al archivarlo, deja el movimiento IMSS en "MODIFICACIÓN CON ACUSE".</div></div>
        <div><label>Semana (opcional)</label><input id="pdf-sem" placeholder="S15"></div>
        <div><label>Fecha del documento</label><input id="pdf-fecha" type="date" value="${today()}"></div>
      </div>
      <div style="margin-top:12px"><input type="file" id="pdf-files" accept=".pdf" multiple onchange="parsePdfs(this)"></div>
      <div id="pdf-prev" style="margin-top:14px;max-height:400px;overflow:auto"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark hide" id="pdf-btn" onclick="applyPdfImport()">💾 Archivar seleccionados</button>
    </div>`,'lg');
}
function pdfCatChange(){
  const cat=$('pdf-cat').value;
  $('pdf-sub').innerHTML=cat==='ACUSE_IMSS'
    ?'<option>ALTA</option><option>BAJA</option><option>MODIFICACION SALARIAL</option>'
    :'<option>RECIBO</option>';
}
function matchWorkerInText(txt){
  const compact=txt.replace(/[\s\-\.]+/g,'');
  for(const w of WORKERS){if(w.nss&&w.nss.length===11&&compact.includes(w.nss))return w;}
  for(const w of WORKERS){if(w.curp&&w.curp.length===18&&compact.includes(w.curp))return w;}
  return null;
}

/* ============================================================
   ACUSE IMSS MULTIPÁGINA — "Constancia de presentación de movimientos
   afiliatorios" (IDSE). Un solo acuse trae HASTA 10 movimientos (altas,
   reingresos, bajas o modificaciones) y puede repartirlos en varias
   páginas: la tabla sigue en la página 2 sin repetir el encabezado.
   Antes la app leía 1 trabajador por acuse (se quedaba con el primer NSS
   que encontraba en la página); ahora extrae TODOS los renglones, liga
   cada uno a su trabajador por NSS y archiva la constancia completa en
   el expediente de cada uno (es un documento único que ampara a todos).
   Verificado con el acuse real Lote 440862790 (10 reingresos, 2 páginas).
   ============================================================ */
const MOV_IMSS={'1':'ALTA','2':'BAJA','7':'MODIFICACION SALARIAL','8':'REINGRESO'};
const CAUSA_BAJA={'0':'','1':'TÉRMINO DEL CONTRATO','2':'SEPARACIÓN VOLUNTARIA','3':'ABANDONO DE EMPLEO','4':'DEFUNCIÓN','5':'CLAUSURA','6':'OTRA','7':'AUSENTISMO','8':'RESCISIÓN DE CONTRATO','9':'JUBILACIÓN','A':'PENSIÓN'};
/* Subtipo con el que se archiva y movimiento IMSS que queda en la ficha */
const SUBTIPO_ACUSE=t=>t==='BAJA'?'BAJA':(t==='MODIFICACION SALARIAL'?'MODIFICACION SALARIAL':'ALTA');
function parseAcuseIMSS(txt){
  const t=String(txt||'').replace(/\s+/g,' ');
  if(!/movimientos afiliatorios|Relaci[oó]n de movimientos/i.test(t))return null;
  const cap=(rx,i=1)=>{const m=t.match(rx);return m?String(m[i]).trim():'';};
  const enc={
    registro_patronal:cap(/\b([A-Z]\d{10})\b/),
    rfc_patron:cap(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/),
    folio:cap(/\b(\d{20})\b/),
    huella:cap(/\b([0-9a-f]{40})\b/),
    fecha_lote:cap(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/),
    hora_lote:cap(/\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2})/),
    razon_social:cap(/Informaci[oó]n\s*General\s+(.+?)\s+En t[eé]rminos/i),
    lote:''
  };
  enc.lote=cap(/\b\d{15,25}\s+(\d{6,12})\b/)||cap(/lote[^\d]{0,60}?(\d{6,12})/i);
  let cuerpo=t;
  const ini=t.search(/Relaci[oó]n de movimientos operados/i);
  if(ini>=0)cuerpo=t.slice(ini);
  cuerpo=cuerpo.replace(/Para efectos de lo anterior[\s\S]*$/i,'');
  const movs=[],vistos=new Set();
  const push=o=>{const k=(o.nss||'')+'|'+(o.tipo_mov||'')+'|'+(o.fecha_mov||'');
    if(!o.nss||vistos.has(k))return;vistos.add(k);movs.push(o);};
  /* Orden REAL en que pdf.js entrega cada renglón (probado con el PDF real):
     $ <tipoMov> <NOMBRE> <sal.base> <tipoSal> <UMF> <ext> <dd/mm/aaaa> <NSS> <tipoTrab> <causaBaja> */
  const rx=/\$\s*(\d{1,2})\s+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ'.\- ]{3,70}?)\s+([\d,]*\d\.\d{2})\s+(\d{1,2})\s+(\d{2,4})\s+(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{10,11})\s+(\d{1,2})\s+([0-9A-Z])(?=\s|$)/g;
  let m;
  while((m=rx.exec(cuerpo))!==null){
    push({tipo_mov:m[1],tipo:MOV_IMSS[m[1]]||('MOV '+m[1]),nombre:m[2].replace(/\s+/g,' ').trim(),
      sal_base:parseFloat(m[3].replace(/,/g,'')),tipo_salario:m[4],umf:m[5],ext:m[6],
      fecha_mov:m[7],nss:m[8],tipo_trab:m[9],causa_baja:m[10],causa_baja_txt:CAUSA_BAJA[m[10]]||''});
  }
  /* Respaldo: si algún acuse trae las columnas en otro orden, se rescatan los
     datos por su FORMA (NSS de 11 dígitos, fecha, importe) dentro de cada
     renglón — cada renglón siempre empieza con "$". */
  if(!movs.length){
    cuerpo.split('$').slice(1).forEach(ch=>{
      const trozo=ch.slice(0,220);
      const nss=(trozo.match(/\b(\d{11})\b/)||[])[1]||(trozo.match(/\b(\d{10})\b/)||[])[1]||'';
      if(!nss)return;
      const fec=(trozo.match(/(\d{2}\/\d{2}\/\d{4})/)||[])[1]||'';
      const sal=(trozo.match(/([\d,]*\d\.\d{2})/)||[])[1]||'';
      const tm=(trozo.match(/^\s*(\d{1,2})\b/)||[])[1]||'';
      const nom=(trozo.match(/^\s*\d{1,2}\s+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ'.\- ]{3,70}?)\s+(?:[\d,]*\d\.\d{2}|\d{2}\/\d{2}\/\d{4}|\d{10,11})/)||[])[1]||'';
      push({tipo_mov:tm,tipo:MOV_IMSS[tm]||('MOV '+tm),nombre:nom.replace(/\s+/g,' ').trim(),
        sal_base:sal?parseFloat(sal.replace(/,/g,'')):null,fecha_mov:fec,nss,causa_baja:'',causa_baja_txt:''});
    });
  }
  return movs.length?{...enc,movimientos:movs,total:movs.length}:null;
}
/* dd/mm/aaaa → aaaa-mm-dd (para guardar fecha_doc) */
function dmyISO(v){const m=String(v||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:null;}
/* Empareja un renglón del acuse con un trabajador: 1º NSS, 2º nombre completo */
function matchWorkerAcuse(mov){
  const nss=String(mov.nss||'').replace(/\D/g,'');
  if(nss){const w=WORKERS.find(x=>String(x.nss||'').replace(/\D/g,'')===nss);if(w)return w;}
  const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z ]/g,'').split(/\s+/).filter(Boolean).sort().join(' ');
  const objetivo=norm(mov.nombre);
  if(!objetivo)return null;
  return WORKERS.find(x=>norm(fullName(x))===objetivo)||null;
}
async function parsePdfs(inp){
  if(!window.pdfjsLib||!window.PDFLib){toast('Las librerías de PDF no cargaron. Revisa tu internet y reabre la app.','err');return;}
  PDFIMP=[];
  $('pdf-prev').innerHTML=skeletonRows(Math.min(8,Math.max(3,inp.files.length)),'26px 1.6fr 1.6fr .8fr','Leyendo los PDFs y buscando a cada trabajador...');
  for(const file of inp.files){
    try{
      const buf=await file.arrayBuffer();
      const doc=await pdfjsLib.getDocument({data:buf.slice(0)}).promise;
      const owners=[],texts=[];
      for(let p=1;p<=doc.numPages;p++){
        const tc=await (await doc.getPage(p)).getTextContent();
        const t=tc.items.map(it=>it.str).join(' ');
        texts.push(t);
        owners.push(matchWorkerInText(t.toUpperCase()));
      }
      /* ¿Es una constancia IDSE con VARIOS movimientos (hasta 10)? Se lee el
         documento COMPLETO (todas las páginas juntas, porque la tabla continúa
         en la 2ª sin repetir encabezado) y se genera una fila por movimiento:
         el mismo PDF se archiva en el expediente de cada trabajador. */
      let ac=parseAcuseIMSS(texts.join(' '));
      /* Híbrido: si el lector propio no reconoció el acuse pero el PDF SÍ trae
         texto, se intenta con la IA. El lector de siempre manda; la IA es red
         de seguridad para formatos nuevos del IDSE. */
      if(!ac&&$('pdf-cat')&&$('pdf-cat').value==='ACUSE_IMSS'&&texts.join(' ').trim().length>200&&!owners.some(Boolean)){
        const ia=await extraerConIA('acuse_imss',texts.join(' '),'Constancia de movimientos afiliatorios del IDSE');
        if(ia&&ia.registros.length){
          ac={lote:ia.lote||'',registro_patronal:ia.registro_patronal||'',rfc_patron:ia.rfc_patron||'',
              folio:ia.folio||'',fecha_lote:ia.fecha_lote||'',hora_lote:'',razon_social:ia.razon_social||'',
              porIA:true,total:ia.registros.length,
              movimientos:ia.registros.map(r=>({
                tipo_mov:String(r.tipo_mov||''),
                tipo:(r.tipo||MOV_IMSS[String(r.tipo_mov||'')]||'ALTA').toUpperCase(),
                nombre:r.nombre||'',nss:String(r.nss||'').replace(/\D/g,''),
                sal_base:r.sal_base,fecha_mov:r.fecha_mov?isoADMY(r.fecha_mov):'',
                causa_baja:'',causa_baja_txt:''}))};
        }
      }
      if(ac&&ac.total>=2){
        ac.movimientos.forEach((mv,k)=>{
          const w=matchWorkerAcuse(mv);
          PDFIMP.push({name:file.name,bytes:buf,ownerId:w?w.id:null,pages:doc.numPages,sel:!!w,sem:'',
            acuse:ac,mov:mv,multi:true,idx:k+1});
        });
        continue;
      }
      const groups=[];let cur=null;
      owners.forEach((w,idx)=>{
        if(w&&(!cur||cur.w!==w)){cur={w,from:idx,to:idx};groups.push(cur);}
        else if(cur){cur.to=idx;}
        else{cur={w:null,from:idx,to:idx};groups.push(cur);}
      });
      if(groups.length<=1){
        const w=groups.length?groups[0].w:null;
        PDFIMP.push({name:file.name,bytes:buf,ownerId:w?w.id:null,pages:doc.numPages,sel:!!w,sem:detectaSemanaRecibo(texts[0]||'')});
      }else{
        const src=await PDFLib.PDFDocument.load(buf,{ignoreEncryption:true});
        for(const g of groups){
          const nd=await PDFLib.PDFDocument.create();
          const idxs=[];for(let k=g.from;k<=g.to;k++)idxs.push(k);
          const cp=await nd.copyPages(src,idxs);cp.forEach(pg=>nd.addPage(pg));
          const bytes=await nd.save();
          PDFIMP.push({name:file.name.replace(/\.pdf$/i,'')+`_p${g.from+1}-${g.to+1}.pdf`,bytes,ownerId:g.w?g.w.id:null,pages:idxs.length,sel:!!g.w,sem:detectaSemanaRecibo(texts[g.from]||'')});
        }
      }
    }catch(e){PDFIMP.push({name:file.name,error:String(e).slice(0,80),sel:false});}
  }
  await marcarDuplicadosPdf();
  renderPdfImp();
}
/* ---------- v31: detección de archivos duplicados (huella SHA-256) ---------- */
async function sha256Hex(buf){
  const h=await crypto.subtle.digest('SHA-256',buf);
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function marcarDuplicadosPdf(){
  try{
    const conBytes=PDFIMP.filter(x=>!x.error&&x.bytes);
    for(const x of conBytes)x.hash=await sha256Hex(x.bytes);
    // duplicados dentro del mismo lote (el mismo archivo seleccionado dos veces).
    // En un acuse MULTIPÁGINA el mismo PDF va a varios trabajadores a propósito,
    // así que la huella se compara junto con el trabajador destino.
    const clave=x=>x.hash+'|'+(x.multi?(x.ownerId||'sin'):'');
    const vistos={};
    conBytes.forEach(x=>{
      const k=clave(x);
      if(vistos[k]){x.dup='MISMO LOTE: '+vistos[k];x.sel=false;}
      else vistos[k]=x.name;
    });
    // duplicados contra lo YA archivado en cualquier obra
    const hashes=[...new Set(conBytes.filter(x=>!x.dup).map(x=>x.hash))];
    if(!hashes.length)return;
    const {data,error}=await sb.from('documentos').select('hash,nombre_archivo,trabajador_id,created_at').eq('anulado',false).in('hash',hashes);
    if(error||!data)return; // si la columna hash aún no existe (Script 33 sin correr), no bloquea la importación
    conBytes.forEach(x=>{
      // el acuse multipágina solo es duplicado si YA está en el expediente de ESE trabajador
      const ya=x.multi?data.find(d=>d.hash===x.hash&&d.trabajador_id===x.ownerId)
                      :data.find(d=>d.hash===x.hash);
      if(ya&&!x.dup){
        const w=WORKERS.find(z=>z.id===ya.trabajador_id);
        x.dup=`YA ARCHIVADO${w?' — '+fullName(w):''} (${fmtD(ya.created_at)})`;
        x.sel=false;
      }
    });
  }catch(e){/* la detección nunca debe impedir importar */}
}
function renderPdfImp(){
  if(!PDFIMP.length){$('pdf-prev').innerHTML='<div class="empty">No se pudo leer ningún PDF.</div>';return;}
  const okN=PDFIMP.filter(x=>x.ownerId).length;
  /* Resumen del acuse multipágina (lote, registro patronal, folio, movimientos) */
  const ac=(PDFIMP.find(x=>x.acuse)||{}).acuse;
  const cab=ac?(ac.porIA?IA_BANNER:'')+`
    <div style="background:var(--blue-bg);border:1px solid var(--border);border-radius:9px;padding:11px 14px;margin-bottom:10px;font-size:12.5px;line-height:1.7">
      <b>📄 Constancia IMSS con ${ac.total} movimiento(s)</b> — se detectaron TODOS los renglones del acuse.<br>
      <span style="color:var(--mut)">Lote</span> <b>${esc(ac.lote||'—')}</b> ·
      <span style="color:var(--mut)">Registro patronal</span> <b>${esc(ac.registro_patronal||'—')}</b> ·
      <span style="color:var(--mut)">Folio</span> <b>${esc(ac.folio||'—')}</b> ·
      <span style="color:var(--mut)">Recibido</span> <b>${esc(ac.fecha_lote||'—')} ${esc(ac.hora_lote||'')}</b>
      <div style="color:var(--mut);font-size:11.5px;margin-top:4px">La constancia ampara a todos: se archiva completa en el expediente de cada trabajador y cada quien recibe el movimiento IMSS que le corresponde.</div>
    </div>`:'';
  $('pdf-prev').innerHTML=cab+`
    <div style="margin-bottom:8px;font-size:12.5px"><b>${okN}</b> de <b>${PDFIMP.length}</b> documentos identificados automáticamente. Asigna manualmente los que falten.</div>
    <div class="imp-row head" style="grid-template-columns:26px 1.6fr 1.6fr .8fr"><span></span><span>Documento</span><span>Trabajador</span><span>Estado</span></div>
    ${PDFIMP.map((x,i)=>x.error
      ?`<div class="imp-row" style="grid-template-columns:26px 1.6fr 1.6fr .8fr"><span></span><span>${esc(x.name)}</span><span style="color:var(--red)">${esc(x.error)}</span><span class="imp-tag imp-SINREGISTRO">ERROR</span></div>`
      :`<div class="imp-row" style="grid-template-columns:26px 1.6fr 1.6fr .8fr${x.dup?';background:var(--amber-bg)':''}">
        <span><input type="checkbox" style="width:auto" ${x.sel?'checked':''} onchange="PDFIMP[${i}].sel=this.checked"></span>
        <span>${esc(x.name)}<br><span style="color:var(--mut);font-size:11px">${x.pages} pág.${x.sem?' · semana <b style="color:var(--green)">'+esc(x.sem)+'</b> (auto)':''}${x.mov?` · <b>${esc(x.idx)}/${esc(x.acuse.total)}</b> · <b style="color:var(--blue)">${esc(x.mov.tipo)}</b> · NSS ${esc(x.mov.nss)} · ${esc(x.mov.fecha_mov)}${x.mov.sal_base?' · SBC $'+money(x.mov.sal_base):''}${x.mov.causa_baja_txt?' · '+esc(x.mov.causa_baja_txt):''}<br><span style="color:var(--mut)">en el acuse: ${esc(x.mov.nombre||'—')}</span>`:''}</span>${x.dup?`<br><span style="color:var(--amber);font-size:11px;font-weight:700">⚠ DUPLICADO: ${esc(x.dup)}</span>`:''}</span>
        <span><select onchange="PDFIMP[${i}].ownerId=this.value||null;PDFIMP[${i}].sel=!!this.value">
          <option value="">— asignar trabajador —</option>
          ${WORKERS.map(w=>`<option value="${w.id}" ${x.ownerId===w.id?'selected':''}>${esc(fullName(w))}</option>`).join('')}
        </select></span>
        <span class="imp-tag ${x.dup?'imp-SINREGISTRO':x.ownerId?'imp-ASIGNAR':'imp-SINREGISTRO'}">${x.dup?'DUPLICADO':x.ownerId?'IDENTIFICADO':'SIN IDENTIFICAR'}</span>
      </div>`).join('')}
    ${PDFIMP.some(x=>x.dup)?'<div class="fhint" style="margin-top:8px">Los marcados como DUPLICADO ya existen en un expediente (misma huella digital del contenido, aunque el nombre sea distinto) y vienen desmarcados. Solo márcalos si de verdad quieres archivarlos otra vez.</div>':''}`;
  $('pdf-btn').classList.remove('hide');
}
async function applyPdfImport(){
  const cat=$('pdf-cat').value, sub=$('pdf-sub').value, sem=$('pdf-sem').value.trim().toUpperCase(), fd=$('pdf-fecha').value||null;
  const sel=PDFIMP.filter(x=>x.sel&&x.ownerId&&!x.error);
  if(!sel.length){toast('No hay documentos identificados y seleccionados.','err');return;}
  const nDup=sel.filter(x=>x.dup).length;
  const multi=sel.filter(x=>x.mov);
  const detalle=multi.length
    ? `${multi.length} movimiento(s) de la constancia IMSS (lote ${multi[0].acuse.lote||'—'}):\n`+
      Object.entries(multi.reduce((a,x)=>{a[x.mov.tipo]=(a[x.mov.tipo]||0)+1;return a;},{})).map(([k,v])=>`   · ${v} ${k}`).join('\n')+
      `\n\nLa constancia completa se archiva en el expediente de cada uno y a cada quien se le pone SU movimiento IMSS.`
    : `${sel.length} documento(s) como ${cat==='ACUSE_IMSS'?'ACUSE IMSS '+sub:'RECIBO DE NÓMINA'}`;
  if(!confirm(`¿Archivar ${detalle}${nDup?`\n\n⚠ ATENCIÓN: ${nDup} de ellos están marcados como DUPLICADOS (ya existen en un expediente) y se archivarían POR SEGUNDA VEZ.`:''}`))return;
  $('pdf-btn').innerHTML='<span class="spin"></span> Archivando...';
  markWrite();
  let ok=0,fail=0;
  for(const x of sel){
    const w=WORKERS.find(z=>z.id===x.ownerId);
    /* En un acuse multipágina cada trabajador manda su propio subtipo y su
       propia fecha de movimiento (las que trae SU renglón del acuse), no las
       del formulario: un mismo lote puede traer altas, bajas y modificaciones. */
    const subX=x.mov?SUBTIPO_ACUSE(x.mov.tipo):sub;
    const fdX=x.mov?(dmyISO(x.mov.fecha_mov)||fd):fd;
    const nombreX=x.mov
      ?`ACUSE_IMSS_${x.mov.tipo.replace(/\s+/g,'_')}_LOTE${x.acuse.lote||''}_${(w?fullName(w):x.mov.nombre||'').replace(/\s+/g,'_')}.pdf`
      :x.name;
    const safe=nombreX.replace(/[^A-Za-z0-9._-]+/g,'_').slice(-70);
    const path=`${x.ownerId}/${cat}/${Date.now()}_${safe}${safe.toLowerCase().endsWith('.pdf')?'':'.pdf'}`;
    const {error:e1}=await sb.storage.from('expedientes').upload(path,new Blob([x.bytes],{type:'application/pdf'}));
    if(e1){fail++;continue;}
    const fila={trabajador_id:x.ownerId,obra_id:w?w.obra_id:OBRA.id,categoria:cat,
      subtipo:cat==='ACUSE_IMSS'?subX:'RECIBO',semana:(cat==='RECIBO_NOMINA'?(sem||x.sem||''):sem),fecha_doc:fdX,archivo:path,nombre_archivo:nombreX.slice(0,120),subido_por:USER.email,hash:x.hash||'',mime_type:'application/pdf'};
    let {error:e2}=await sb.from('documentos').insert(fila);
    if(e2&&/hash/i.test(e2.message||'')){delete fila.hash;({error:e2}=await sb.from('documentos').insert(fila));} // si falta el Script 33, archiva sin huella
    if(e2){fail++;continue;}
    ok++;
    if(cat==='ACUSE_IMSS'&&w){
      const mv=subX==='ALTA'?'ALTA CON ACUSE':(subX==='BAJA'?'BAJA CON ACUSE':'MODIFICACION CON ACUSE');
      const candidato={...w,movimiento_imss:mv,fecha_mov_imss:fdX};
      const actual=estadoAcuseIMSS(candidato,subX==='BAJA'?'BAJA':'ALTA',indiceAcusesIMSS([fila]));
      const vigente=subX==='MODIFICACION SALARIAL'
        ?fechaAcuseISO(fdX)>=([fechaAcuseISO(w.fecha_alta),fechaAcuseISO(w.fecha_reingreso)].sort().pop()||'9999')
        :actual.ok;
      // Archivar un documento histórico/sin fecha no sustituye el último
      // movimiento por el de otro episodio ni inventa su fecha con "hoy".
      if(fdX&&vigente&&(!fechaAcuseISO(w.fecha_mov_imss)||fdX>=w.fecha_mov_imss)){
        const cambio={movimiento_imss:mv,fecha_mov_imss:fdX};
        const {error:eMov}=await sb.from('trabajadores').update(cambio).eq('id',w.id);
        if(!eMov)Object.assign(w,cambio);
        else toast('Acuse archivado; no se actualizó el movimiento IMSS: '+eMov.message,'err');
      }
    }
  }
  closeModal();
  toast(`Expedientes actualizados: ${ok} documento(s) archivados${fail?`, ${fail} con error`:''}.`,fail?'err':'ok');
  await loadObraData(OBRA.id);
}

