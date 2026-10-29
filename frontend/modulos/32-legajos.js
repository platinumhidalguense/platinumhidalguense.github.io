/* ---------- LEGAJOS PARA ENTREGA DE CHEQUES (2026-08-03) ----------
   Un solo documento para imprimir de golpe: por cada trabajador con cheque de la
   semana elegida, su RECIBO DE NÓMINA (PDF archivado en el expediente, renderizado
   a imagen con pdf.js) y, si es BAJA/finiquito, su CARTA DE RENUNCIA + RECIBO DE
   FINIQUITO (mismo texto oficial que el generador individual). */
/* Canoniza la semana EXACTAMENTE como norm_semana() en la base: quita todo lo
   que no sea dígito y luego el cero a la izquierda. "S08" → "8", "S8" → "8",
   8 → "8", "" → "".
   BUG QUE HABÍA: solo quitaba los no-dígitos, así que "S08" quedaba en "08" y
   nunca era igual a "8". La ficha del trabajador lista TODOS sus recibos sin
   comparar semana, por eso ahí sí se veía; los legajos comparan semana y por eso
   decían "sin recibo" con el PDF perfectamente archivado. La base ya casteaba a
   int (norm_semana), así que app y base también estaban en desacuerdo. */
const normSem=s=>{const n=String(s??'').replace(/\D/g,'');return n?String(parseInt(n,10)):'';};

/* RECIBO_NOMINA es la representación PDF imprimible; CFDI_NOMINA es el XML
   fiscal. Ambos prueban que existe un comprobante, pero no son intercambiables:
   un XML no se manda a pdf.js y un PDF no se anuncia como XML timbrado. */
const RECIBO_CATS=['RECIBO_NOMINA','CFDI_NOMINA'];
const esReciboPdf=d=>d&&!d.anulado&&String(d.categoria||'').toUpperCase()==='RECIBO_NOMINA';
const esCfdiXml=d=>d&&!d.anulado&&String(d.categoria||'').toUpperCase()==='CFDI_NOMINA';
const esComprobanteNomina=d=>esReciboPdf(d)||esCfdiXml(d);
const esRecibo=esReciboPdf;
/* sem === undefined → todos los recibos del trabajador (como la ficha).
   sem con valor      → solo los de esa semana, comparando en forma canónica. */
function recibosDe(tid,sem){
  if(!tid)return [];
  const ns=(sem===undefined||sem===null||sem==='')?null:normSem(sem);
  return (DOCSX||[]).filter(d=>esRecibo(d)&&d.trabajador_id===tid
    &&(ns===null||normSem(d.semana)===ns));
}
function cfdisDe(tid,sem){
  if(!tid)return [];
  const ns=(sem===undefined||sem===null||sem==='')?null:normSem(sem);
  return (DOCSX||[]).filter(d=>esCfdiXml(d)&&d.trabajador_id===tid
    &&(ns===null||normSem(d.semana)===ns));
}
/* Índice "trabajador|semana" de todos los recibos archivados. Lo usan las
   alertas de recibos faltantes; se arma una vez y se consulta muchas. */
function recSetGlobal(){
  return new Set((DOCSX||[]).filter(esReciboPdf).map(d=>d.trabajador_id+'|'+normSem(d.semana)));
}
async function pdfBytesToImgs(bytes,scale){
  const doc=await pdfjsLib.getDocument({data:bytes}).promise; const out=[];
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p), vp=page.getViewport({scale:scale||1.6});
    const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
    await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    out.push(cv.toDataURL('image/jpeg',0.82));
  }
  return out;
}
/* ---------- LEGAJOS · FILA MANUAL (2026-08-27) ------------------------
   ANTES: se escribía la semana, la app buscaba todos los cheques de esa semana
   y los ordenaba por número de trabajador. Ese orden NO es el de la chequera
   física, así que había que reacomodar el fajo a mano después de imprimir.
   AHORA: el usuario arma la fila trabajador por trabajador, cada uno con SU
   semana, y la fila conserva el orden de captura. No hay ningún sort. */

/* Fila de impresión: [{tid, sem}] en el orden EXACTO en que se capturó. */
function lgFila(){ return (window._LGQ=window._LGQ||[]); }

/* Datos de una entrada de la fila, resueltos al vuelo contra el padrón. */
function lgDatos(r){
  const w=WORKERS.find(x=>x.id===r.tid)||null;
  const recs=recibosDe(r.tid,r.sem);
  const chq=(CHEQUES||[]).find(c=>!c.eliminado&&c.trabajador_id===r.tid
    &&normSem(c.semana)===r.sem&&String(c.estatus||'').toUpperCase()!=='CANCELADO')||null;
  const esBaja=!!(w&&(w.estatus==='BAJA'||String((chq&&chq.tipo_pago)||'').toUpperCase()==='FINIQUITO'));
  return {w,recs,chq,esBaja,nombre:w?fullName(w):'(trabajador fuera del padrón)'};
}

/* Identifica al trabajador desde lo que se escribió en el buscador: acepta el
   formato del desplegable ("#12 · JUAN PÉREZ"), solo el número, el nombre
   completo, o un fragmento si es inequívoco. */
function lgResuelve(txt){
  const t=String(txt||'').trim(); if(!t)return null;
  const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const m=t.match(/^#?\s*(\d+)\s*·/);
  if(m){const w=WORKERS.find(x=>String(x.no_trab)===m[1]); if(w)return w;}
  if(/^\d+$/.test(t)){const w=WORKERS.find(x=>String(x.no_trab)===t); if(w)return w;}
  const nt=norm(t);
  let w=WORKERS.find(x=>norm(fullName(x))===nt); if(w)return w;
  const hits=WORKERS.filter(x=>norm(fullName(x)).includes(nt));
  return hits.length===1?hits[0]:null;
}

function openLegajos(){
  window._LGQ=window._LGQ||[];
  const hoy=semObra();
  const sems=[]; for(let s=hoy;s>=1;s--)sems.push(s);
  const ops=WORKERS.slice().sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9))
    .map(w=>`<option value="#${w.no_trab??''} · ${esc(fullName(w))}"></option>`).join('');
  modal(`
    <div class="m-head"><h2>🗂 Legajos para entrega de cheques · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:10px">Arma la fila <b>en el mismo orden en que traes los cheques en la mano</b>: busca al trabajador, elige su semana y agrégalo. La lista <b>respeta el orden en que la capturas</b> —no se reordena sola— y el documento se imprime en ese mismo orden. Por cada uno se adjunta su <b>recibo de nómina</b> y, si es <b>baja</b> esa semana, su <b>carta de renuncia + recibo de finiquito</b>.</p>
      <div class="grid" style="grid-template-columns:2.2fr .9fr auto auto;align-items:end;gap:10px">
        <div><label>Trabajador — nombre o número</label>
          <input id="lg-q" list="dl-lg-trab" placeholder="Escribe y elige de la lista..." autocomplete="off"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();lgAgregar();}">
          <datalist id="dl-lg-trab">${ops}</datalist></div>
        <div><label>Semana</label><select id="lg-sem">${sems.map(s=>`<option value="${s}"${s===hoy?' selected':''}>Semana ${s}${s===hoy?' (en curso)':''}</option>`).join('')}</select></div>
        <div><button class="btn dark" onclick="lgAgregar()">➕ Agregar a lista</button></div>
        <div><button class="btn" onclick="lgAgregarSemana()" title="Agrega de golpe a todos los que tienen cheque de esa semana, en el orden del consecutivo de la chequera">⇩ Toda la semana</button></div>
      </div>
      <div style="margin-top:10px"><label>¿Qué imprimir?</label>
        <select id="lg-modo" style="max-width:340px" onchange="lgPinta()">
          <option value="ambos">Recibo + renuncia y finiquito (todo)</option>
          <option value="recibo">Solo recibo de nómina</option>
          <option value="renuncia">Solo renuncia + finiquito (bajas)</option>
        </select></div>
      <div id="lg-out" style="margin-top:12px;max-height:340px;overflow:auto"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn danger" onclick="lgVaciar()">Vaciar fila</button>
      <button class="btn dark" id="lgj-btn" onclick="generarLegajos()">🖨 Generar documento</button>
    </div>`,'lg');
  lgPinta();
  const cuerpo=$('lg-out')?.parentElement;
  if(cuerpo){const acceso=document.createElement('button');acceso.className='btn dark';acceso.textContent='📚 Armar por bloques físicos de 50 consecutivos';acceso.onclick=openChequerasFisicas;cuerpo.prepend(acceso);}
}

function lgAgregar(){
  const w=lgResuelve($('lg-q').value);
  if(!w){toast('No identifiqué al trabajador. Elige uno del desplegable.','err');return;}
  const sem=normSem($('lg-sem').value);
  if(!sem){toast('Elige la semana.','err');return;}
  const q=lgFila();
  if(q.some(r=>r.tid===w.id&&r.sem===sem)){toast(fullName(w)+' ya está en la fila con la semana S'+sem+'.','err');return;}
  q.push({tid:w.id,sem});                       // al final: la fila es el orden
  $('lg-q').value=''; $('lg-q').focus();
  lgPinta();
}

/* Alta masiva: agrega a todos los que tienen cheque de la semana elegida.
   Los agrega EN EL ORDEN DEL CONSECUTIVO DE LA CHEQUERA (no por nombre ni por
   número de trabajador), que es justo el orden físico del fajo. Después se
   pueden reacomodar a mano. */
function lgAgregarSemana(){
  const sem=normSem($('lg-sem').value); if(!sem){toast('Elige la semana.','err');return;}
  const q=lgFila(), ya=new Set(q.map(r=>r.tid+'|'+r.sem));
  const num=c=>{const n=parseInt(String(c.consecutivo??c.num_cheque??'').replace(/\D/g,''));return isNaN(n)?9e9:n;};
  const chs=(CHEQUES||[]).filter(c=>!c.eliminado&&c.trabajador_id&&normSem(c.semana)===sem
      &&String(c.estatus||'').toUpperCase()!=='CANCELADO')
    .sort((a,b)=>num(a)-num(b));
  let add=0;
  for(const c of chs){
    const k=c.trabajador_id+'|'+sem; if(ya.has(k))continue;
    ya.add(k); q.push({tid:c.trabajador_id,sem}); add++;
  }
  lgPinta();
  toast(add?`Agregados ${add} de la semana S${sem}, en el orden del consecutivo de cheque.`
           :`No hay cheques nuevos que agregar de la semana S${sem}.`, add?'ok':'err');
}

function lgMover(i,d){
  const q=lgFila(), j=i+d;
  if(j<0||j>=q.length)return;
  const t=q[i]; q[i]=q[j]; q[j]=t;
  lgPinta();
}
function lgQuitar(i){ lgFila().splice(i,1); lgPinta(); }
function lgVaciar(){
  if(!lgFila().length)return;
  if(!confirm('¿Vaciar la fila completa? Se pierde el orden que ya armaste.'))return;
  window._LGQ=[]; lgPinta();
}

function lgPinta(){
  const q=lgFila(), out=$('lg-out'), btn=$('lgj-btn');
  if(!out)return;
  if(btn)btn.innerHTML=`🖨 Generar documento${q.length?' ('+q.length+')':''}`;
  if(!q.length){
    out.innerHTML='<div class="empty">La fila está vacía. Busca un trabajador, elige su semana y presiona <b>Agregar a lista</b>.</div>';
    return;
  }
  const modo=($('lg-modo')&&$('lg-modo').value)||'ambos';
  const filas=q.map(lgDatos);
  const sinRec=filas.filter(x=>!x.recs.length).length, bajas=filas.filter(x=>x.esBaja).length;
  out.innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
      <span class="imp-tag imp-COINCIDE"><b>${q.length}</b> legajo(s) en la fila</span>
      <span class="imp-tag imp-ASIGNAR">${q.length-sinRec} con recibo</span>
      ${sinRec?`<span class="imp-tag imp-CONFLICTO">${sinRec} SIN recibo archivado</span>`:''}
      ${bajas?`<span class="imp-tag imp-SINREGISTRO">${bajas} baja(s) → carta + finiquito</span>`:''}
      <span style="margin-left:auto;font-size:11px;color:var(--mut)">Se imprime de arriba hacia abajo, en este orden.</span>
    </div>
    <div class="imp-row head" style="grid-template-columns:34px 1.7fr .7fr 1fr 1fr 92px"><span>#</span><span>Trabajador</span><span>Semana</span><span>Documentos</span><span>Se imprime</span><span>Orden</span></div>
    ${filas.map((x,i)=>{
      const qué=modo==='recibo'?'solo recibo'
        :modo==='renuncia'?(x.esBaja?'carta + finiquito':'— (no es baja)')
        :(x.esBaja?'recibo + carta + finiquito':'solo recibo');
      return `<div class="imp-row" style="grid-template-columns:34px 1.7fr .7fr 1fr 1fr 92px">
        <span style="font-weight:700;color:var(--mut)">${i+1}</span>
        <span><b>${esc(x.nombre)}</b> ${x.esBaja?'<span class="badge BAJA" style="font-size:9.5px">BAJA</span>':''}
          <br><span style="color:var(--mut);font-size:11px">#${(x.w&&x.w.no_trab)??'—'}${x.chq?' · cheque '+esc(x.chq.num_cheque||x.chq.consecutivo||'—')+' · $'+money(x.chq.importe):' · sin cheque capturado'}</span></span>
        <span>S${esc(q[i].sem)}</span>
        <span style="font-size:11.5px">${x.recs.length
          ?`<b style="color:var(--green)">✔ ${x.recs.length} recibo${x.recs.length>1?'s':''}</b>`
          :`<b style="color:var(--amber)">⚠ sin recibo</b>`}</span>
        <span style="font-size:11.5px;color:var(--mut)">${qué}</span>
        <span style="white-space:nowrap">
          <button class="btn" style="padding:2px 7px;font-size:12px" onclick="lgMover(${i},-1)" ${i===0?'disabled':''} title="Subir">↑</button>
          <button class="btn" style="padding:2px 7px;font-size:12px" onclick="lgMover(${i},1)" ${i===q.length-1?'disabled':''} title="Bajar">↓</button>
          <button class="btn danger" style="padding:2px 7px;font-size:12px" onclick="lgQuitar(${i})" title="Quitar de la fila">✕</button>
        </span>
      </div>`;}).join('')}`;
}

async function generarLegajos(){
  const q=lgFila().slice();          // copia: el orden de la fila ES el de impresión
  if(!q.length){toast('La fila está vacía.','err');return;}
  const modo=($('lg-modo')&&$('lg-modo').value)||'ambos';
  const incRecibo=(modo==='ambos'||modo==='recibo'), incRenuncia=(modo==='ambos'||modo==='renuncia');
  const btn=$('lgj-btn');
  let body='', faltan=[];
  for(let i=0;i<q.length;i++){                  // índice explícito: no se reordena
    if(btn)btn.innerHTML=`<span class="spin"></span> Armando... (${i+1}/${q.length})`;
    const r=q[i], x=lgDatos(r), nombre=x.nombre;
    if(incRecibo){
      if(!x.recs.length)faltan.push(`${nombre} — S${r.sem} (sin recibo archivado)`);
      for(const d of x.recs){
        try{
          const {data:blob,error}=await sb.storage.from('expedientes').download(d.archivo);
          if(error||!blob){faltan.push(`${nombre} — S${r.sem} (no se pudo descargar el recibo)`);continue;}
          const imgs=await pdfBytesToImgs(new Uint8Array(await blob.arrayBuffer()),1.6);
          body+=imgs.map(src=>`<div class="pg-img"><img src="${src}"></div>`).join('');
        }catch(e){faltan.push(`${nombre} — S${r.sem} (recibo ilegible)`);}
      }
    }
    if(incRenuncia&&x.esBaja&&x.w){
      const monto=Number(x.chq&&x.chq.importe)||Number(x.w.monto_finiquito)||0;
      body+=renunciaPagesHTML(x.w,renunciaOpts(x.w,monto,domingoDeSemana(r.sem)));
    }
  }
  if(btn)btn.innerHTML=`🖨 Generar documento (${q.length})`;
  if(!body){toast('No se armó nada (¿ningún recibo archivado y ninguna baja?).','err');return;}
  const css=`.pg-img{page-break-after:always;text-align:center;margin:0}
.pg-img img{width:100%;max-width:800px;display:block;margin:0 auto}
${RENUNCIA_CSS}`;
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Legajos ${esc(OBRA.nombre)}</title><style>${css}</style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  const win=window.open(url,'_blank');
  if(!win){toast('Permite ventanas emergentes para abrir el documento.','err');return;}
  toast(`Documento armado: ${q.length} legajo(s) en el orden de la fila${faltan.length?` · ${faltan.length} sin recibo (revísalos)`:''}. Imprime o guarda como PDF.`,faltan.length?'err':'ok');
  if(faltan.length)setTimeout(()=>alert('Estos NO traen recibo de nómina archivado (revísalos e impórtalos si aplica):\n\n• '+faltan.join('\n• ')),600);
}
/* Faltantes documentales: cuando hay cierres, el padrón exigible sale de sus
   snapshots (incluye nómina y finiquitos). Así una baja no se exige en semanas
   en las que ya no formó parte del cierre. */
function lunesDe(f){const d=new Date(String(f).slice(0,10)+'T12:00');
  d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10);}
function faltantesReciboDe(w,recSet){
  if(!w||!w.fecha_alta)return [];
  const cs=(CIERRES||[]).filter(c=>c.estado!=='CANCELADO'&&c.snapshot&&Array.isArray(c.snapshot.items)
    &&c.snapshot.items.some(x=>x.trabajador_id===w.id||Number(x.numero)===Number(w.no_trab)));
  if(cs.length){
    return [...new Set(cs.map(c=>Number(c.semana)).filter(Boolean))].sort((a,b)=>a-b)
      .filter(W=>!(recSet?recSet.has(w.id+'|'+String(W)):recibosDe(w.id,W).length));
  }
  /* Compatibilidad con obras que todavía no tienen cierres guardados. */
  if(String(w.periodo_pago||'SEMANAL')==='QUINCENAL')return [];
  const hoyW=isoWeekDe(OBRA,new Date());
  const base=new Date((OBRA.fecha_inicio?String(OBRA.fecha_inicio).slice(0,10):SEMANA1)+'T12:00');
  const monISO=W=>{const d=new Date(base);d.setDate(base.getDate()+(W-1)*7);return d.toISOString().slice(0,10);};
  const sW=Math.max(1,isoWeekDe(OBRA,new Date(w.fecha_alta+'T12:00')));
  /* BAJAS: se procesan en LUNES. Si la baja cae en el lunes de la semana X, esa
     semana YA NO se le exige —no trabajó ni un día— ni ninguna posterior. Si la
     baja cayó entre martes y domingo, sí trabajó parte de X y ese recibo sí falta.
     La comparación se hace contra el lunes REAL de la fecha de baja, no contra el
     calendario de la obra: así aguanta que una obra tenga mal la fecha de inicio. */
  let eW=hoyW-1;
  if(w.estatus==='BAJA'&&w.fecha_baja){
    const wB=isoWeekDe(OBRA,new Date(w.fecha_baja+'T12:00'));
    eW=Math.min(eW,(w.fecha_baja===lunesDe(w.fecha_baja))?wB-1:wB);
  }
  const falt=[];
  for(let W=sW;W<=eW;W++){
    if(!activoEn(w,monISO(W)))continue;
    const tiene=recSet?recSet.has(w.id+'|'+String(W)):recibosDe(w.id,W).length>0;
    if(!tiene)falt.push(W);
  }
  return falt;
}
function openFaltanRecibos(){
  const sem=concSemanaDefault();
  modal(`
    <div class="m-head"><h2>📋 Faltan recibos de nómina · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:10px">Revisa una semana cerrada: toma exactamente a quienes aparecen en el cierre/NOI y confirma si tienen su <b>recibo PDF</b> archivado. El XML fiscal se muestra aparte.</p>
      <div style="display:flex;gap:8px;align-items:end;margin-bottom:10px"><div><label>Semana</label><input id="fr-sem" style="width:90px" value="S${sem}"></div><button class="btn dark" id="fr-btn" onclick="frecCargar()">↻ Revisar</button></div>
      <div id="fr-out">${skeletonRows(6,'1.6fr .7fr .7fr','Verificando recibos...')}</div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark hide" id="fr-export" onclick="exportFaltanRecibos()">⬇ Exportar Excel</button>
    </div>`,'lg');
  frecCargar();
}
async function frecCargar(){
  const ns=normSem($('fr-sem')&&$('fr-sem').value);if(!ns){toast('Indica una semana válida.','err');return;}
  const out=$('fr-out'),btn=$('fr-btn');if(btn)btn.disabled=true;if(out)out.innerHTML=skeletonRows(6,'1.6fr .7fr .7fr','Verificando cierre y documentos...');
  try{
    const docs=await concFuentesSemana(ns),dm=new Map((docs||[]).map(x=>[x.trabajador_id,x]));
    const esperados=new Map();ctrlEsperadosPagoSemana(ns).forEach(e=>esperados.set(e.w.id,e.w));
    const todos=[...esperados.values()].sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
    const filas=todos.filter(w=>!(Number((dm.get(w.id)||{}).recibos_pdf)||0)).map(w=>({w,falt:[Number(ns)],xml:Number((dm.get(w.id)||{}).cfdi_xml)||0}));
    const conPdf=todos.length-filas.length,conXml=todos.filter(w=>Number((dm.get(w.id)||{}).cfdi_xml)>0).length;
    window._FALTREC=filas;window._FALTRECSEM=ns;
    $('fr-export').classList.toggle('hide',!filas.length);
    out.innerHTML=`<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span class="imp-tag imp-ASIGNAR">${todos.length} en cierre/NOI</span><span class="imp-tag imp-COINCIDE">${conPdf} con recibo PDF</span><span class="imp-tag ${filas.length?'imp-CONFLICTO':'imp-COINCIDE'}">${filas.length} faltante(s)</span><span class="imp-tag imp-ASIGNAR">${conXml} con XML fiscal</span></div>
      ${filas.length?`<div class="imp-row head" style="grid-template-columns:1.6fr .7fr .7fr"><span>Trabajador</span><span>Recibo PDF S${ns}</span><span>CFDI XML</span></div>${filas.map(x=>`<div class="imp-row" style="grid-template-columns:1.6fr .7fr .7fr"><span><b>${esc(fullName(x.w))}</b><br><small>#${x.w.no_trab??'—'} · ${esc(x.w.estatus)}</small></span><span style="color:var(--red)">FALTA</span><span>${x.xml?'✔ '+x.xml:'—'}</span></div>`).join('')}`:`<div class="empty">✔ Los ${todos.length} trabajadores del cierre S${ns} tienen su recibo PDF archivado.</div>`}`;
  }catch(e){out.innerHTML=`<div class="empty" style="color:var(--red)">No se pudo revisar: ${esc(e.message||e)}</div>`;}
  finally{if(btn)btn.disabled=false;}
}
function exportFaltanRecibos(){
  const filas=window._FALTREC||[]; if(!filas.length)return;
  const rows=[],styles=[];
  rows.push([`RECIBOS DE NÓMINA FALTANTES S${window._FALTRECSEM||''} — ${OBRA.nombre} — ${new Date().toLocaleDateString('es-MX')}`]);styles.push(ST.title);
  rows.push(['NO.','TRABAJADOR','ESTATUS','SEMANA','RECIBO PDF','CFDI XML']);styles.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.cellC];
  filas.forEach(x=>{rows.push([x.w.no_trab??'',fullName(x.w),x.w.estatus,'S'+window._FALTRECSEM,'FALTA',x.xml?'CARGADO':'NO CARGADO']);styles.push(rs);});
  const ws=buildSheet(rows,styles,[8,30,12,10,15,15],[{s:{r:0,c:0},e:{r:0,c:5}}],[{hpt:24},{hpt:26}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1+filas.length,c:5}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'FALTAN RECIBOS');
  dl(wb,`RECIBOS_FALTANTES_S${window._FALTRECSEM||''}_${OBRA.nombre.slice(0,16).replace(/\s+/g,'_')}_${today()}.xlsx`);
  toast('Excel de recibos faltantes generado.','ok');
}
function openRenuncia(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const cc=cartaCfg();
  const empDefault=empresaDeTrabajador(w);
  const e=CFGEMP['empresa_'+empDefault]||{razon:'COMERCIALIZADORA PLATINUM HIDALGUENSE'};
  modal(`
    <div class="m-head"><h2>📄 Renuncia y finiquito · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Empresa</label><select id="rn-emp" onchange="rnEmpChange()"><option value="PLATINUM" ${empDefault==='PLATINUM'?'selected':''}>PLATINUM</option><option value="JIRE" ${empDefault==='JIRE'?'selected':''}>JIRE</option></select></div>
        <div><label>Monto del finiquito ($)</label><input id="rn-monto" type="number" step="0.01" value="${w.monto_finiquito??''}"></div>
        <div class="c2" style="grid-column:span 2"><label>Razón social</label><input id="rn-razon" value="${esc(e.razon||'')}"></div>
        <div class="c2" style="grid-column:span 2"><label>Tipo de sociedad (como aparece en la carta)</label><input id="rn-sufijo" value="${esc(cc.sufijo)}"></div>
        <div class="c2" style="grid-column:span 2"><label>Dirigida a</label><input id="rn-dest" value="${esc(cc.dest)}"></div>
        <div class="c2" style="grid-column:span 2"><label>Fecha (misma para renuncia y recibo)</label><input id="rn-f1" type="date" value="${w.fecha_baja||today()}"></div>
      </div>
      <p style="margin-top:12px;font-size:12px;color:var(--mut)"><b>Primero captura el monto del finiquito</b> (si necesitas calcularlo usa 🧮 Prestaciones) — sin monto no se genera. Las 2 hojas salen con la misma fecha y el monto en letra, listas para imprimir o PDF.</p>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="generarRenunciaDoc('${id}')">🖨 Generar e imprimir</button>
    </div>`,'md');
}
function rnEmpChange(){
  const e=CFGEMP['empresa_'+$('rn-emp').value]||{razon:''};
  $('rn-razon').value=e.razon||'';
}
async function generarRenunciaDoc(id){
  const w=WORKERS.find(x=>x.id===id);
  if(!w){toast('No se encontró al trabajador (recarga la página).','err');return;}
  const razon=$('rn-razon').value.trim().toUpperCase();
  const sufijo=$('rn-sufijo').value.trim();
  const dest=$('rn-dest').value.trim();
  const monto=parseFloat($('rn-monto').value);
  const f1=$('rn-f1').value, f2=$('rn-f1').value; // misma fecha para renuncia y recibo
  const cc=cartaCfg();
  if(!razon){toast('Falta la razón social.','err');return;}
  if(!monto||monto<=0){toast('Indica el monto del finiquito (usa 🧮 Prestaciones si necesitas calcularlo).','err');return;}
  CFGEMP['carta_finiquito']={dest,sufijo,lugar:cc.lugar};
  try{await sb.from('config').upsert({clave:'carta_finiquito',valor:CFGEMP['carta_finiquito'],actualizado_por:USER.email});}catch(e){}
  const fmtL=d=>{const x=new Date(d+'T12:00');return `${x.getDate()} de ${MES[x.getMonth()].toLowerCase()} del ${x.getFullYear()}`;};
  const EMP=`&ldquo;<b>${esc(razon)}</b>&rdquo; ${esc(sufijo)}`;
  const nom=esc(fullName(w)), puesto=esc(w.puesto||'TRABAJADOR');
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Renuncia y finiquito ${nom}</title>
  <style>body{font-family:'Times New Roman',serif;font-size:13.5px;line-height:1.7;color:#111;margin:0}
  .pg{max-width:700px;margin:0 auto;padding:60px 40px 40px;min-height:88vh;text-align:justify}
  h1{font-size:15px;text-align:center;letter-spacing:1px;margin-bottom:26px}
  .fecha{text-align:right;margin-bottom:26px}
  .firma{margin-top:80px;text-align:center}
  .firma .linea{border-top:1px solid #111;width:330px;margin:0 auto;padding-top:6px}
  .testigos{display:flex;justify-content:space-between;gap:40px;margin-top:70px;text-align:center}
  .testigos div{flex:1}
  .testigos .linea{border-top:1px solid #111;padding-top:6px;font-size:12px}
  @media print{.pg{page-break-after:always;min-height:auto}}
  </style></head><body>
  ${renunciaPagesHTML(w,{razon,sufijo,dest,f1,f2,monto,lugar:cc.lugar})}
  <script>window.onload=()=>window.print()<\/script></body></html>`;
  const win=window.open('','_blank');
  if(!win){toast('Permite ventanas emergentes para generar el documento.','err');return;}
  win.document.write(html);win.document.close();
  closeModal();toast('Renuncia y finiquito generados: guarda como PDF o imprime.','ok');
  if(monto!==w.monto_finiquito){markWrite();await sb.from('trabajadores').update({monto_finiquito:monto}).eq('id',id);await loadObraData(OBRA.id);}
}

