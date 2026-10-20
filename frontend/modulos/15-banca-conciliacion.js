/* ============================================================
   PAGOS POR TRANSFERENCIA — importar el "pago global" de BBVA (Script 44)
   Lee el "Resumen general de Nómina en Tiempo Real" (PDF de la dispersión),
   empareja cada renglón con un trabajador (por nombre + últimos 4 de cuenta),
   CRUZA contra los cheques de la misma semana para evitar pagos DUPLICADOS
   (transferencia + cheque), y guarda cada pago en la tabla `pagos`.
   ============================================================ */
/* Lee el PDF (texto de pdf.js): registros + encabezado (descripción/folio/fecha). */
/* 2026-08-28 · BBVA cambió el formato del "Resumen general de grupo de Pago
   de nómina" y el lector viejo dejó de reconocer un solo renglón. El PDF se
   importaba como si fuera UN pago individual de $552,611.39 "(sin nombre)"
   y encima salía RECHAZADO, porque el encabezado dice "Rechazadas 0" y el
   lector de individuales solo buscaba la palabra "Rechaz". 228 pagos en uno.

   ANTES:  28 Ago. 2026  *0152  NOMBRE            Exitoso  2,466.71 MXN
   AHORA:  28/08/2026    •0152  NOMBRE        -   Exitoso  2,466.71 MXN
   Cambiaron tres cosas: la fecha (dd/mm/aaaa), la viñeta de la cuenta
   (• en vez de *) y una columna de concepto vacía que mete un "-" entre el
   nombre y el estado.

   NOMBRES EN DOS RENGLONES: los nombres largos se parten en la tabla
   ("LUIS FERNANDO HERNANDEZ" / "ALTAMIRANO"). Como el texto de pdf.js se
   arma uniendo los fragmentos en orden de lectura, las dos partes llegan
   pegadas con un espacio; por eso el nombre se captura completo con un
   cuantificador perezoso hasta el estado, en vez de renglón por renglón.

   Se leen LOS DOS formatos: el archivo viejo tiene que seguir importándose. */
const PG_ESTADOS='Exitoso|Exitosa|Rechazado|Rechazada|Devuelto|Devuelta|Cancelado|Cancelada|Pendiente|En\\s+proceso';
function _pgEstado(s){
  const x=String(s||'').trim();
  if(/^(rechaz|devuel|cancel)/i.test(x))return 'RECHAZADO';
  if(/^(pendiente|en\s+proceso)/i.test(x))return 'PENDIENTE';
  return 'EXITOSO';
}
/* Limpia el nombre: quita la columna de concepto vacía ("-") y los espacios
   de más que deja el pegado de renglones. */
function _pgTitular(s){
  return String(s||'').replace(/\s+/g,' ').replace(/(^|\s)[-–—]+(\s|$)/g,' ')
    .replace(/\s+/g,' ').trim();
}
/* Un nombre de verdad: si trae una fecha, "MXN" o un número largo, es que la
   expresión se comió el renglón siguiente y ese registro no se acepta. */
function _pgTitularOk(n){
  return n.length>=3&&/[A-ZÑÁÉÍÓÚ]{2}/i.test(n)&&!/\d{1,2}\/\d{1,2}\/\d{4}|MX[NP]|\d{3,}/i.test(n);
}
function parsePagoGlobal(t){
  t=' '+String(t||'').replace(/\s+/g,' ')+' ';
  const hallazgos=[];
  const cae=(ini,fin,y,mo,d,mask,nombre,estado,imp)=>{
    if(!(mo>=0&&mo<=11)||!(d>=1&&d<=31))return;
    const nom=_pgTitular(nombre); if(!_pgTitularOk(nom))return;
    hallazgos.push({ini,fin,r:{day:d,mes:mo,year:y,mask:String(mask),titular:nom,
      estado:_pgEstado(estado),importe:parseFloat(String(imp).replace(/,/g,''))}});
  };
  // FORMATO NUEVO: 28/08/2026 •9396 ARTURO VILLALOBOS MARTINEZ - Exitoso 2,400.26 MXN
  const rxNuevo=new RegExp('(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})\\s+[•*·∙●-]?\\s*(\\d{2,6})\\s+'+
    '(.{2,140}?)\\s+('+PG_ESTADOS+')\\s+([\\d,]+\\.\\d{2})\\s*MX[NP]','gi');
  // FORMATO ANTERIOR: 28 Ago. 2026 *0152 NOMBRE Exitoso 2,466.71 MXN
  const rxViejo=new RegExp('(\\d{1,2})\\s+([A-Za-zÁÉÍÓÚáéíóú]{3,4})\\.?\\s+(\\d{4})\\s+'+
    '[•*·]\\s*(\\d{2,6})\\s+(.{2,140}?)\\s+('+PG_ESTADOS+')\\s+([\\d,]+\\.\\d{2})\\s*MX[NP]','gi');
  let m;
  while((m=rxNuevo.exec(t)))cae(m.index,m.index+m[0].length,+m[3],+m[2]-1,+m[1],m[4],m[5],m[6],m[7]);
  while((m=rxViejo.exec(t))){
    const mo=_MABREV[m[2].toUpperCase().slice(0,3)];
    if(mo!=null)cae(m.index,m.index+m[0].length,+m[3],mo,+m[1],m[4],m[5],m[6],m[7]);
  }
  /* Si un PDF trajera los dos formatos, un renglón podría casar dos veces. Se
     descarta por TRASLAPE de posiciones, no por contenido: dos pagos iguales al
     mismo trabajador el mismo día (sueldo y finiquito, por ejemplo) son
     legítimos y tienen que sobrevivir. */
  hallazgos.sort((a,b)=>a.ini-b.ini);
  const records=[]; let hasta=-1;
  hallazgos.forEach(h=>{ if(h.ini>=hasta){records.push(h.r);hasta=h.fin;} });

  const gp=t.match(/Nombre del grupo de pago\s+(.{3,60}?)\s+(?:Tipo de pago|Tipo de procesamiento|Datos de)/i);
  const d=gp?gp[1].trim():(t.match(/\bNOMINA[A-Z0-9]{2,}\b/i)||[''])[0];
  const f=t.match(/\b([0-9A-F]{32})\b/);
  const fc=t.match(/(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+de\s+(\d{4})/i);
  let fecha=null; if(fc){const mo=_MABREV[fc[2].toUpperCase().slice(0,3)]; if(mo!=null)fecha={y:+fc[3],m:mo,d:+fc[1]};}
  /* El propio PDF dice cuántos registros trae y cuánto suman. Se devuelven para
     poder avisar si el lector se quedó corto: en una dispersión de 228 renglones
     un formato que cambia a media página se pasa de largo sin que nadie lo note,
     y eso significa gente marcada como NO pagada. */
  const nReg=t.match(/N[uú]mero de registros\s+(\d+)/i);
  const tot=t.match(/Importe total\s+([\d,]+\.\d{2})/i);
  return {records,descripcion:d||'',folio:f?f[1]:'',fecha,
    esperados:nReg?+nReg[1]:null,
    totalEsperado:tot?parseFloat(tot[1].replace(/,/g,'')):null};
}
/* Lee un comprobante de pago INDIVIDUAL (1 solo pago) de BBVA, en dos formatos:
   (A) "Dispersión de Nómina en Tiempo Real" (mismo banco, el nombre viene concatenado
       antes de "Descripción"), y (B) "Pago Interbancario" a OTRO banco (trae titular
       destino, banco destino, CLABE de depósito e importe). Tolera los espacios que
       pdf.js mete en los acentos. Devuelve un registro o null. */
function parsePagoIndividual(t){
  t=' '+String(t||'').replace(/\s+/g,' ')+' ';
  const im=t.match(/([\d,]+\.\d{2})\s*MX[PN]/i); if(!im)return null;
  const importe=parseFloat(im[1].replace(/,/g,''));
  /* "Rechazadas 0" del resumen NO es un rechazo: es el contador del encabezado.
     Se quitan los contadores antes de buscar la palabra, si no cualquier pago
     global que caiga aquí por error sale marcado RECHAZADO. */
  const tEstado=t.replace(/\b(Exitosas?|Rechazadas?|Devueltas?|Canceladas?)\s*:?\s*\d+/gi,' ');
  const estado=/(rechaz|devuel|cancel|no aplicad|fallid|no procesad)/i.test(tEstado)?'RECHAZADO':'EXITOSO';
  let banco='BBVA';
  const bm=t.match(/Nombre banco destino:\s*([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ .]+?)\s+(?:Fecha|Concepto|Referencia|$)/);
  if(bm)banco=bm[1].replace(/\s+/g,' ').trim().slice(0,24);
  // titular destino: el "Titular de la cuenta:" que va seguido de "Nombre banco destino"
  let titular='';
  const tb=t.match(/Titular de la cuenta:\s*([A-ZÑ][A-ZÑ ]+?)\s+Nombre banco destino/);
  if(tb)titular=tb[1].replace(/\s+/g,' ').trim();
  if(!titular){ // formato A: nombre concatenado antes de "Descripci ó n"
    const ta=t.match(/([A-ZÑ]{5,})\s+Descripci\s*[oó]?\s*n\b/);
    if(ta)titular=ta[1];
  }
  let cuenta=''; const cm=t.match(/Cuenta de dep\s*[oó]?\s*sito:\s*(\d{6,20})/i); if(cm)cuenta=cm[1];
  const mask=cuenta?cuenta.slice(-4):'';
  let fechaObj=null;
  const fm=t.match(/Fecha de (?:aplicaci|creaci)\s*[oó]?\s*n:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if(fm)fechaObj={y:+fm[3],m:+fm[2]-1,d:+fm[1]};
  else{const dm=t.match(/(\d{1,2}) de ([A-Za-zÁÉÍÓÚ]+) de (\d{4})/i);if(dm){const mo=_MABREV[dm[2].toUpperCase().slice(0,3)];if(mo!=null)fechaObj={y:+dm[3],m:mo,d:+dm[1]};}}
  const fecha=fechaObj?`${fechaObj.y}-${String(fechaObj.m+1).padStart(2,'0')}-${String(fechaObj.d).padStart(2,'0')}`:'';
  let folio=''; const fo=t.match(/Folio (?:de lote|interbancario|[uú]nico|de firma):\s*([A-Z0-9]{6,})/i)||t.match(/\b([0-9A-F]{32})\b/); if(fo)folio=fo[1];
  if(!titular&&!importe)return null;
  return {titular:titular||'(sin nombre)',importe,estado,banco,mask,cuenta,fecha,fechaObj,folio,descripcion:'PAGO INDIVIDUAL ('+banco+')'};
}
const _pgNorm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[^A-ZÑ ]/g,'').replace(/\s+/g,' ').trim();
function _pgNameEq(a,b){const A=_pgNorm(a).split(' ').filter(Boolean).sort().join(' '),B=_pgNorm(b).split(' ').filter(Boolean).sort().join(' ');return !!A&&A===B;}
function _pgOverlap(a,b){const A=new Set(_pgNorm(a).split(' ').filter(Boolean)),B=_pgNorm(b).split(' ').filter(Boolean);if(!B.length||!A.size)return 0;let c=0;B.forEach(w=>{if(A.has(w))c++;});return c/Math.max(A.size,B.length);}
const _pgLast=(s,n)=>String(s||'').replace(/\D/g,'').slice(-n);
function cuentaPagoValida(w){
  if(!w)return false;
  const cuenta=String(w.cuenta||'').replace(/\D/g,''),clabe=String(w.clabe||'').replace(/\D/g,'');
  return cuenta.length>=4||clabe.length>=10;
}
function metodoPagoPredeterminado(w,tipo){return String(tipo||'').toUpperCase()==='FINIQUITO'?'CHEQUE':cuentaPagoValida(w)?'TRANSFERENCIA':'POR DEFINIR';}
function pagoAcctMatch(w,mask){const m=String(mask||'').replace(/\D/g,'');if(m.length<3)return false;return _pgLast(w.cuenta,m.length)===m||_pgLast(w.clabe,m.length)===m;}
/* Empareja un renglón del reporte con un trabajador de la OBRA actual. */
function matchPagoWorker(titular,mask){
  const pool=WORKERS||[];
  const exact=pool.filter(w=>_pgNameEq(fullName(w),titular));
  if(exact.length===1)return exact[0];
  const acct=pool.filter(w=>pagoAcctMatch(w,mask));
  if(exact.length>1){const inter=exact.filter(w=>acct.includes(w));if(inter.length===1)return inter[0];return null;}
  // sin coincidencia exacta de nombre
  if(acct.length===1)return acct[0];
  // por traslape alto de palabras + cuenta
  if(acct.length>1){const best=acct.map(w=>({w,s:_pgOverlap(fullName(w),titular)})).sort((a,b)=>b.s-a.s);if(best[0]&&best[0].s>=0.6&&(!best[1]||best[1].s<best[0].s))return best[0].w;}
  const ov=pool.map(w=>({w,s:_pgOverlap(fullName(w),titular)})).filter(x=>x.s>=0.8).sort((a,b)=>b.s-a.s);
  if(ov.length===1)return ov[0].w;
  // fallback para NOMBRES CONCATENADOS (ej. "ANTONIOBAUTISTA" en el pago individual):
  // cuenta cuántos apellidos/nombres del trabajador aparecen como subcadena.
  const tl=_pgNorm(titular).replace(/ /g,'');
  if(tl.length>=6){
    const sc=pool.map(w=>{const toks=_pgNorm(fullName(w)).split(' ').filter(x=>x.length>=4);const hit=toks.filter(x=>tl.includes(x)).length;return {w,hit,n:toks.length};})
      .filter(x=>x.n>=2&&x.hit>=2&&x.hit>=x.n-1).sort((a,b)=>b.hit-a.hit);
    if(sc.length&&(!sc[1]||sc[1].hit<sc[0].hit))return sc[0].w;
  }
  return null;
}
/* Cheques NO cancelados del mismo trabajador en una semana (para detectar doble pago). */
function chequeMismaSemana(w,ns){
  if(!w||!ns)return [];
  return (CHEQUES||[]).filter(c=>!c.eliminado&&c.trabajador_id===w.id&&normSem(c.semana)===ns&&String(c.estatus||'').toUpperCase()!=='CANCELADO'&&(c.importe!=null&&c.importe!==''));
}
let PAGOIMP=null;
function openImportPago(){
  modal(`
    <div class="m-head"><h2>💸 Importar pagos por transferencia · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Sube el <b>pago global</b> ("Resumen general de Nómina en Tiempo Real") <b>o</b> comprobantes <b>individuales</b> (dispersión BBVA o pago interbancario a otro banco, ej. cuando el banco rechaza y se paga aparte). Puedes soltar <b>varios PDF a la vez</b>. La app empareja cada pago con el trabajador (nombre + últimos 4 de la cuenta) y lo cruza con los cheques de esa semana para avisar posibles pagos <b>duplicados</b>. Empareja con los trabajadores de la <b>obra actual</b>.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;align-items:end">
        <div><label>Semana de la nómina pagada</label><input id="pg-sem" placeholder="S18" oninput="if(PAGOIMP)pgRender()"></div>
        <div><input type="file" id="pg-file" accept=".pdf" multiple onchange="pgParse(this)"></div>
      </div>
      <div id="pg-head" style="margin-top:10px"></div>
      <div id="pg-out" style="margin-top:10px;max-height:400px;overflow:auto"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark hide" id="pg-btn" onclick="applyPagoImport()">💾 Registrar pagos seleccionados</button>
    </div>`,'lg');
}
/* ============================================================
   v36.2 · COMPROBANTES SIN CAPA DE TEXTO (impresos desde el navegador)
   Muchos comprobantes del banco llegan como PDF de IMAGEN: al imprimirlos
   desde el portal, el texto se convierte en dibujo y pdf.js no lee nada.
   En vez de rechazarlos, la app los RENDERIZA, adivina de quién son por el
   NOMBRE DEL ARCHIVO (ej. PAGO_JULIO_FLORES_PARRA.pdf) y pide capturar el
   importe viendo el comprobante al lado. El dinero SIEMPRE lo confirma una
   persona: no se adivina un importe con lectura automática de imagen.
   ============================================================ */
/* Palabras que NUNCA son parte de un nombre (aparecen en los archivos del banco) */
const _ARCH_BASURA=new Set(['PAGO','PAGOS','COMPROBANTE','COMPROBANTES','TRANSFERENCIA','TRANSFERENCIAS',
  'DISPERSION','DISPERSIÓN','NOMINA','NÓMINA','RECIBO','COPIA','SPEI','INTERBANCARIO','BBVA','BANCO',
  'OPERACION','OPERACIÓN','AUTORIZADA','FINAL','NUEVO','DOC','SCAN','IMG','WHATSAPP','IMAGE','SEMANA']);
/* Saca el nombre de la persona del nombre del archivo.
   Tira los pedazos que traen dígitos (folios, fechas, prefijos de subida como
   "718811c3-") y las palabras de relleno; conserva DE / LA / LOS, que sí son
   parte de muchos apellidos ("DE LA CRUZ"). */
function nombreDesdeArchivo(nombre){
  return String(nombre||'')
    .replace(/\.(pdf|jpg|jpeg|png)$/i,'')
    .split(/[\s_\-.()]+/)
    .filter(t=>t && !/\d/.test(t) && !_ARCH_BASURA.has(t.toUpperCase()))
    .join(' ')
    .replace(/\s+/g,' ')
    .trim().toUpperCase();
}
/* Huella de letras: mismas letras aunque cambie el orden y el espaciado.
   Resuelve los apellidos PEGADOS y el orden invertido del banco:
   "SERGIO ERICK TRUJILLOROJAS"  ==  "TRUJILLO ROJAS SERGIO ERICK". */
const _pgLetras=s=>_pgNorm(s).replace(/\s/g,'').split('').sort().join('');
/* Empareja por nombre de archivo: exacto → huella de letras → pegado → traslape.
   Solo acepta cuando hay UN único candidato (nunca adivina entre varios). */
function matchWorkerArchivo(nombreArchivo){
  const txt=nombreDesdeArchivo(nombreArchivo); if(!txt)return null;
  const exact=(WORKERS||[]).filter(w=>_pgNameEq(fullName(w),txt));
  if(exact.length===1)return exact[0];
  const huella=_pgLetras(txt);
  if(huella.length>=8){
    const porHuella=(WORKERS||[]).filter(w=>_pgLetras(fullName(w))===huella);
    if(porHuella.length===1)return porHuella[0];
  }
  const pegado=_pgNorm(txt).replace(/\s/g,'');
  const porPegado=(WORKERS||[]).filter(w=>{const f=_pgNorm(fullName(w)).replace(/\s/g,'');return f&&f.length>=8&&(f===pegado||pegado.includes(f)||f.includes(pegado));});
  if(porPegado.length===1)return porPegado[0];
  /* Todas las palabras del trabajador aparecen en el archivo (aunque el archivo
     traiga cosas de más). Sirve para "COPIA PAGO JUAN PEREZ LOPEZ semana19.pdf". */
  const tokens=new Set(_pgNorm(txt).split(' ').filter(Boolean));
  if(tokens.size>=2){
    const contenidos=(WORKERS||[]).filter(w=>{
      const ws=_pgNorm(fullName(w)).split(' ').filter(t=>t.length>2);
      return ws.length>=2 && ws.every(t=>tokens.has(t));
    });
    if(contenidos.length===1)return contenidos[0];
  }
  const cand=(WORKERS||[]).map(w=>({w,s:_pgOverlap(fullName(w),txt)})).sort((a,b)=>b.s-a.s);
  if(cand[0]&&cand[0].s>=0.6&&(!cand[1]||cand[1].s<cand[0].s))return cand[0].w;
  return null;
}
async function pgParse(inp){
  const files=inp.files?[...inp.files]:[]; if(!files.length)return;
  if(!window.pdfjsLib){toast('La librería de PDF no cargó. Revisa tu internet y reabre la app.','err');return;}
  $('pg-out').innerHTML=skeletonRows(6,'26px 1.5fr 1fr 1fr .9fr','Leyendo '+files.length+' comprobante(s) de pago...');
  const rows=[]; let sugFecha=null; const avisosPg=[];
  const yaHash=async h=>{try{const {data}=await sb.from('pagos').select('id').eq('hash',h).limit(1);return !!(data&&data.length);}catch(e){return false;}};
  for(const file of files){
    let txt='',hash='';
    try{const buf=await file.arrayBuffer();hash=await sha256Hex(buf.slice(0));txt=await pdfBytesToText(new Uint8Array(buf.slice(0)));}
    catch(e){rows.push({error:'No se pudo leer',titular:file.name,importe:0,estado:'',sel:false,wId:null});continue;}
    const g=parsePagoGlobal(txt);
    if(g.records.length){
      const ya=await yaHash(hash);
      g.records.forEach(r=>{
        const w=matchPagoWorker(r.titular,r.mask);
        rows.push({mask:r.mask,titular:r.titular,estado:r.estado,importe:r.importe,banco:'BBVA',
          fecha:`${r.year}-${String(r.mes+1).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`,
          folio:g.folio,descripcion:g.descripcion,hash,file:file.name,yaRep:ya,
          wId:w?w.id:null,sel:(!!w&&r.estado==='EXITOSO'&&!ya),already:false});
      });
      if(g.fecha&&!sugFecha)sugFecha=g.fecha;
      /* El PDF dice cuántos son y cuánto suman: si no cuadra, se avisa fuerte.
         Un renglón que el lector no reconoce es un trabajador que aparece como
         NO pagado, y eso no se puede quedar callado. */
      const sumaLeida=Math.round(g.records.reduce((s,r)=>s+(Number(r.importe)||0),0)*100)/100;
      if(g.esperados!=null&&g.records.length!==g.esperados)
        avisosPg.push(`⚠ ${file.name}: el PDF dice ${g.esperados} registro(s) y solo se leyeron ${g.records.length}. NO lo registres hasta revisar.`);
      else if(g.totalEsperado!=null&&Math.abs(sumaLeida-g.totalEsperado)>0.01)
        avisosPg.push(`⚠ ${file.name}: el PDF suma $${money(g.totalEsperado)} y lo leído suma $${money(sumaLeida)}.`);
    }else{
      const ind=parsePagoIndividual(txt);
      if(ind){
        const ya=await yaHash(hash);
        const w=matchPagoWorker(ind.titular,ind.mask);
        rows.push({mask:ind.mask,titular:ind.titular,estado:ind.estado,importe:ind.importe,banco:ind.banco||'BBVA',
          fecha:ind.fecha,folio:ind.folio,descripcion:ind.descripcion,hash,file:file.name,yaRep:ya,individual:true,
          wId:w?w.id:null,sel:(!!w&&ind.estado==='EXITOSO'&&!ya),already:false});
        if(ind.fechaObj&&!sugFecha)sugFecha=ind.fechaObj;
      }else if(String(txt||'').trim().length>200&&await (async()=>{
        /* Híbrido: el PDF SÍ trae texto pero ningún lector lo reconoció →
           se intenta con la IA antes de mandarlo a captura manual. */
        const ia=await extraerConIA('pago_individual',txt,'Comprobante de pago BBVA Net Cash');
        if(!ia||!ia.registros.length)return false;
        const ya=await yaHash(hash);
        ia.registros.forEach(r=>{
          const w=matchPagoWorker(r.titular||'',String(r.cuenta||'').slice(-4))||matchWorkerArchivo(file.name);
          rows.push({mask:String(r.cuenta||'').slice(-4),titular:r.titular||nombreDesdeArchivo(file.name),
            estado:/rechaz/i.test(String(r.estado||''))?'RECHAZADO':'EXITOSO',importe:r.importe,
            banco:r.banco||'BBVA',fecha:r.fecha||'',folio:r.folio||'',
            descripcion:'PAGO INDIVIDUAL (leído con IA)',hash,file:file.name,yaRep:ya,
            individual:true,porIA:true,wId:w?w.id:null,sel:false,already:false});
        });
        return true;
      })()){
        /* ya se agregaron las filas leídas por la IA */
      }else{
        /* Sin texto legible: se renderiza el comprobante y se captura a mano
           (el trabajador se adivina por el nombre del archivo). */
        let img='';
        try{const buf2=await file.arrayBuffer();img=(await pdfBytesToImgs(new Uint8Array(buf2),1.35))[0]||'';}catch(e){}
        const ya=await yaHash(hash);
        const w=matchWorkerArchivo(file.name);
        rows.push({titular:nombreDesdeArchivo(file.name)||file.name,estado:'EXITOSO',importe:null,banco:'',
          fecha:'',folio:'',descripcion:'PAGO INDIVIDUAL (captura manual)',hash,file:file.name,yaRep:ya,
          individual:true,manual:true,img,sinTexto:!String(txt||'').trim(),
          wId:w?w.id:null,sel:false,already:false});
      }
    }
  }
  if(!rows.filter(r=>!r.error).length){$('pg-out').innerHTML='<div class="empty">No encontré pagos en el/los PDF. ¿Es el reporte de BBVA (global) o un comprobante individual (dispersión / interbancario)?</div>';$('pg-btn').classList.add('hide');return;}
  if(sugFecha&&$('pg-sem')&&!$('pg-sem').value.trim()){const wk=isoWeekDe(OBRA,new Date(sugFecha.y,sugFecha.m,sugFecha.d,12,0,0));if(wk>0)$('pg-sem').value='S'+wk;}
  PAGOIMP={rows,avisos:avisosPg};
  pgRender();
}
function pgRender(){
  if(!PAGOIMP)return;
  const ns=normSem($('pg-sem')?$('pg-sem').value:'');
  const valid=PAGOIMP.rows.filter(r=>!r.error);
  const matched=valid.filter(r=>r.wId).length, sinM=valid.length-matched;
  const suma=valid.reduce((s,r)=>s+(r.importe||0),0);
  const nRech=valid.filter(r=>r.estado==='RECHAZADO').length;
  const bancos=[...new Set(valid.map(r=>r.banco).filter(Boolean))];
  const nInd=valid.filter(r=>r.individual).length;
  const avisos=(PAGOIMP.avisos||[]).length
    ?`<div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:8px;padding:9px 12px;font-size:12px;line-height:1.7;margin-bottom:8px">
       ${PAGOIMP.avisos.map(a=>`<div><b>${esc(a)}</b></div>`).join('')}
       <div style="color:var(--mut);font-size:11px">El PDF trae escrito cuántos pagos son y cuánto suman; lo leído no cuadra con eso.</div>
     </div>`:'';
  $('pg-head').innerHTML=(valid.some(r=>r.porIA)?IA_BANNER:'')+avisos+`<div style="background:var(--blue-bg,#eef3fb);border-radius:8px;padding:9px 12px;font-size:12px;line-height:1.7">
    <b>${valid.length} pago(s)</b> · total $${money(suma)}${nInd?` · ${nInd} individual(es)`:''}${bancos.length?` · banco(s): ${esc(bancos.join(', '))}`:''}</div>`;
  let nDup=0,nAuto=0;
  const body=PAGOIMP.rows.map((r,i)=>{
    if(r.error)return `<div class="imp-row" style="grid-template-columns:24px 1.7fr 1.4fr .8fr .8fr;background:var(--amber-bg)"><span></span><span>${esc(r.titular)}</span><span style="color:var(--red);font-size:11.5px">${esc(r.error)}</span><span></span><span class="imp-tag imp-SINREGISTRO">ERROR</span></div>`;
    const w=r.wId?WORKERS.find(x=>x.id===r.wId):null;
    let alert='';
    if(w&&ns){
      const chs=chequeMismaSemana(w,ns);
      if(chs.length){const c=chs.find(c=>['EXPEDIDO','ENTREGADO'].includes(c.estatus))||chs[0];
        const automatico=c.tipo_pago==='CHEQUE'&&c.estatus==='PENDIENTE'&&!c.num_cheque&&!c.consecutivo&&!c.lote_nomina_id&&['SIN_CUENTA','CIERRE_NOI'].includes(c.origen_generacion);
        if(automatico){nAuto++;alert+=`<div style="color:var(--amber);font-size:11px;margin-top:3px">Pendiente automático anterior; aún no es pago. Revisa la retirada en lote.</div>`;}
        else{nDup++;const expedido=['EXPEDIDO','ENTREGADO'].includes(c.estatus);alert+=`<div style="color:var(--red);font-weight:700;font-size:11px;margin-top:3px">⚠ ${expedido?'POSIBLE PAGO DOBLE':'REVISAR PENDIENTE, NO EXPEDIDO'}: cheque${c.num_cheque?' #'+esc(c.num_cheque):''} $${money(c.importe)} (${esc(c.estatus)}) <button class="btn danger" style="padding:1px 8px;font-size:10px" onclick="pagoCancelarCheque('${c.id}')">Revisar cheque</button></div>`;}}
    }
    if(r.estado==='RECHAZADO')alert+=`<div style="color:var(--red);font-weight:700;font-size:11px;margin-top:3px">✗ RECHAZADO — pago pendiente. Revisar desde el sábado 12:00; no crea cheque sin confirmar.</div>`;
    const ya=r.yaRep||(w&&ns&&(PAGOS||[]).some(p=>p.trabajador_id===w.id&&normSem(p.semana)===ns&&((r.folio&&p.folio_lote===r.folio)||(r.hash&&p.hash===r.hash))));
    r.already=!!ya; if(ya)r.sel=false;
    /* --- comprobante SIN texto: se ve la imagen y se captura el importe --- */
    if(r.manual){
      const listo=Number(r.importe)>0&&!!r.wId;
      if(!listo)r.sel=false;
      return `<div class="imp-row" style="grid-template-columns:24px 1fr;gap:12px;align-items:start;padding:12px 8px;border:1px solid var(--amber);border-radius:10px;margin-bottom:10px;background:var(--amber-bg)">
        <span><input type="checkbox" style="width:auto" ${r.sel?'checked':''} ${(!listo||ya)?'disabled':''} onchange="PAGOIMP.rows[${i}].sel=this.checked"></span>
        <span>
          <b style="color:var(--amber)">⚠ Comprobante sin texto (impresión de imagen)</b> — captura el importe viendo el comprobante.
          <div style="display:grid;grid-template-columns:minmax(220px,320px) 1fr;gap:14px;margin-top:8px;align-items:start">
            ${r.img?`<a href="${r.img}" target="_blank" title="Abrir en grande"><img src="${r.img}" style="width:100%;border:1px solid var(--border);border-radius:8px;background:#fff"></a>`
                   :'<div class="empty" style="padding:20px;font-size:12px">No se pudo mostrar el comprobante</div>'}
            <div style="display:grid;gap:8px">
              <div><label>Trabajador</label>
                <select onchange="PAGOIMP.rows[${i}].wId=this.value||null;pgRender()">
                  <option value="">— elige al trabajador —</option>
                  ${WORKERS.slice().sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9)).map(x=>`<option value="${x.id}" ${r.wId===x.id?'selected':''}>#${x.no_trab??'—'} ${esc(fullName(x))}</option>`).join('')}
                </select>
                <div class="fhint">${r.wId?'Detectado por el nombre del archivo: <b>'+esc(r.file)+'</b>':'No pude deducirlo del nombre del archivo — elígelo tú.'}</div>
              </div>
              <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
                <div><label>Importe pagado *</label>
                  <input type="number" step="0.01" value="${r.importe??''}" placeholder="0.00"
                    oninput="PAGOIMP.rows[${i}].importe=parseFloat(this.value)||null;PAGOIMP.rows[${i}].sel=(parseFloat(this.value)>0&&!!PAGOIMP.rows[${i}].wId);pgActualizaBoton()"></div>
                <div><label>Fecha del pago</label>
                  <input type="date" value="${esc(r.fecha||'')}" oninput="PAGOIMP.rows[${i}].fecha=this.value"></div>
              </div>
              <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
                <div><label>Banco destino</label>
                  <input value="${esc(r.banco||'')}" placeholder="AZTECA, BANCOPPEL, BBVA..." oninput="PAGOIMP.rows[${i}].banco=this.value.toUpperCase()"></div>
                <div><label>Folio / clave de rastreo</label>
                  <input value="${esc(r.folio||'')}" placeholder="opcional" oninput="PAGOIMP.rows[${i}].folio=this.value"></div>
              </div>
              ${ya?'<span class="imp-tag imp-SINREGISTRO">ESTE ARCHIVO YA SE IMPORTÓ</span>'
                  :listo?'<span class="imp-tag imp-COINCIDE">Listo para registrar</span>'
                        :'<span class="imp-tag imp-CONFLICTO">Falta trabajador y/o importe</span>'}
            </div>
          </div>
        </span>
      </div>`;
    }
    const tag=ya?'<span class="imp-tag imp-SINREGISTRO">YA IMPORTADO</span>':w?(r.estado==='RECHAZADO'?'<span class="imp-tag imp-CONFLICTO">RECHAZADO</span>':'<span class="imp-tag imp-COINCIDE">OK</span>'):'<span class="imp-tag imp-SINREGISTRO">SIN EMPAREJAR</span>';
    return `<div class="imp-row" style="grid-template-columns:24px 1.7fr 1.4fr .8fr .8fr${(alert&&/PAGO DOBLE|MISMA SEMANA/.test(alert))?';background:var(--amber-bg)':''}">
      <span><input type="checkbox" style="width:auto" ${r.sel?'checked':''} ${ya?'disabled':''} onchange="PAGOIMP.rows[${i}].sel=this.checked"></span>
      <span><b>${esc(r.titular)}</b>${r.banco&&r.banco!=='BBVA'?` <span class="imp-tag imp-ASIGNAR" style="font-size:9px">${esc(r.banco)}</span>`:''}<br><span style="color:var(--mut);font-size:11px">${r.mask?'*'+esc(r.mask)+' · ':''}$${money(r.importe)}${r.fecha?' · '+esc(r.fecha):''}${r.individual?' · individual':''}</span>${alert}</span>
      <span><select onchange="PAGOIMP.rows[${i}].wId=this.value||null;PAGOIMP.rows[${i}].sel=!!this.value&&PAGOIMP.rows[${i}].estado==='EXITOSO';pgRender()">
        <option value="">— emparejar trabajador —</option>
        ${WORKERS.slice().sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9)).map(x=>`<option value="${x.id}" ${r.wId===x.id?'selected':''}>#${x.no_trab??'—'} ${esc(fullName(x))}</option>`).join('')}
      </select></span>
      <span style="font-size:11px">${esc(r.estado)}</span>
      <span>${tag}</span>
    </div>`;
  }).join('');
  $('pg-out').innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <span class="imp-tag imp-COINCIDE">${matched} emparejado(s)</span>
      ${sinM?`<span class="imp-tag imp-SINREGISTRO">${sinM} sin emparejar</span>`:''}
      ${nRech?`<span class="imp-tag imp-CONFLICTO">${nRech} rechazado(s)</span>`:''}
      ${nDup?`<span class="imp-tag imp-CONFLICTO" style="background:var(--red);color:#fff">⚠ ${nDup} con cheque en la misma semana</span>`:''}
      ${nAuto?`<button class="btn" onclick="PLATINUM_PAGOS_SABADO.abrir(${Number(ns)},'RETIROS')">Revisar ${nAuto} pendientes automáticos en lote</button>`:''}
    </div>
    <div class="imp-row head" style="grid-template-columns:24px 1.7fr 1.4fr .8fr .8fr"><span></span><span>Pago</span><span>Trabajador (obra actual)</span><span>Estado</span><span></span></div>
    ${body}
    <p style="font-size:11px;color:var(--mut);margin-top:8px">Acepta pagos globales e individuales de cualquier banco. Un rechazo queda pendiente, no crea cheque. Un cheque pendiente no equivale a pago expedido. Los automáticos anteriores se revisan en lote sin tocar finiquitos ni comprobantes. Las imágenes sin texto permiten captura manual.</p>`;
  $('pg-btn').classList.remove('hide');
  pgActualizaBoton();
}
/* Habilita/deshabilita el botón de guardar según lo que esté listo */
function pgActualizaBoton(){
  const b=$('pg-btn'); if(!b||!PAGOIMP)return;
  const n=PAGOIMP.rows.filter(r=>!r.error&&r.sel&&r.wId&&!r.already&&(!r.manual||Number(r.importe)>0)).length;
  b.disabled=!n;
  b.textContent=n?`💾 Registrar ${n} pago(s)`:'💾 Registrar pagos seleccionados';
}
/* ============================================================
   v36.2 · CANDADO: un solo PAGO GLOBAL por semana (Script 53)
   Se revisa contra la BASE (no solo contra lo cargado en pantalla) antes de
   guardar. Los pagos INDIVIDUALES nunca se bloquean: son justo el camino para
   los rechazos que se repusieron y los pagos en otro banco.
   ============================================================ */
async function globalYaImportado(sem){
  try{
    /* Se traen TODOS los pagos de esa semana y se decide aquí. Así funciona
       igual con el Script 53 corrido (columna `origen`) que sin él o con datos
       viejos sin clasificar: un lote que comparten 2+ trabajadores es global. */
    const {data,error}=await fetchAllRows(()=>sb.from('pagos')
      .select('trabajador_id,folio_lote,fecha_pago,descripcion,importe,estado,origen,created_at')
      .eq('obra_id',OBRA.id).eq('semana',sem));
    if(error||!Array.isArray(data))throw Error(error?.message||'Respuesta incompleta de pagos');
    if(!data.length)return null;
    const marcados=data.filter(p=>p.origen==='GLOBAL');
    if(marcados.length)return {folio:marcados[0].folio_lote||'',filas:marcados};
    const porFolio={};
    data.forEach(p=>{const f=p.folio_lote||'';if(f)(porFolio[f]=porFolio[f]||[]).push(p);});
    const lote=Object.entries(porFolio)
      .find(([f,a])=>new Set(a.map(x=>x.trabajador_id)).size>1);
    return lote?{folio:lote[0],filas:lote[1]}:null;
  }catch(e){throw Error('No se pudo verificar el lote existente. No se importó: '+e.message);}
}
async function applyPagoImport(){
  if(!PAGOIMP)return;
  const raw=($('pg-sem')?$('pg-sem').value:'').trim().toUpperCase();
  const ns=raw.replace(/\D/g,'');
  if(!ns){toast('Escribe la semana de la nómina pagada (ej. S18).','err');return;}
  const sem='S'+ns;
  const sel=PAGOIMP.rows.filter(r=>!r.error&&r.sel&&r.wId&&!r.already&&(!r.manual||Number(r.importe)>0));
  if(!sel.length){toast('No hay pagos seleccionados con trabajador emparejado (y con importe, si es captura manual).','err');return;}

  /* ---- CANDADO: ¿esta semana ya tiene un pago global? ---- */
  const hayGlobales=sel.some(r=>!r.individual);
  if(hayGlobales){
    let ya;try{ya=await globalYaImportado(sem);}catch(e){toast(e.message,'err');return;}
    if(ya){
      const tot=(ya.filas||[]).filter(p=>String(p.estado||'').toUpperCase()!=='RECHAZADO').reduce((s,p)=>s+(Number(p.importe)||0),0);
      modal(`
        <div class="m-head"><h2>⛔ La semana ${esc(sem)} ya tiene su pago global</h2><button class="x" onclick="closeModal()">×</button></div>
        <div class="m-body">
          <p style="background:var(--red-bg);border-radius:8px;padding:11px 13px;font-size:13px;line-height:1.65">
            No se importó nada. Esta semana <b>ya tiene registrado un pago global</b> y solo se permite <b>uno por semana</b>,
            justo para que no se dupliquen los pagos como pasó antes.</p>
          <div class="kv"><b>Lote registrado</b><span>${esc(ya.folio||'(sin folio)')}</span></div>
          <div class="kv"><b>Trabajadores</b><span>${(ya.filas||[]).length}</span></div>
          <div class="kv"><b>Importe exitoso</b><span>$${money(tot)}</span></div>
          <div class="kv"><b>Fecha</b><span>${(ya.filas&&ya.filas[0]&&ya.filas[0].fecha_pago)?fmtD(ya.filas[0].fecha_pago):'—'}</span></div>
          <div class="sect">¿Qué sí puedes hacer?</div>
          <p style="font-size:13px;line-height:1.7">
            · Si a alguien <b>no le llegó</b> y se le pagó aparte, sube su <b>comprobante individual</b>: esos nunca se bloquean.<br>
            · Si el pago global que está registrado es el <b>equivocado</b>, elimínalo primero desde
              <b>Pagos BBVA → el lote → Eliminar</b> y vuelve a importar el correcto.<br>
            · Si solo quieres revisar quién quedó sin pago, usa <b>🔎 Revisar semana</b>.</p>
        </div>
        <div class="m-foot">
          <button class="btn" onclick="closeModal()">Entendido</button>
          <button class="btn" onclick="closeModal();openPagoLote('${esc(ya.folio||'')}')">👁 Ver el lote registrado</button>
          <button class="btn dark" onclick="closeModal();conciliarSemana('${esc(sem)}')">🔎 Revisar quién quedó sin pago</button>
        </div>`,'md');
      return;
    }
  }

  const nRech=sel.filter(r=>r.estado==='RECHAZADO').length;
  if(!confirm(`¿Registrar ${sel.length} pago(s) por transferencia de la semana ${sem}?${nRech?`\n\n(${nRech} vienen como RECHAZADO — se guardan como NO pagados.)`:''}`))return;
  $('pg-btn').innerHTML='<span class="spin"></span> Guardando...';
  markWrite();
  let ok=0,fail=0,faltaTabla=false,bloqueo='';
  for(const r of sel){
    const fila={obra_id:OBRA.id,trabajador_id:r.wId,semana:sem,medio:'TRANSFERENCIA',banco:r.banco||'BBVA',
      cuenta_mask:r.mask?'*'+r.mask:null,titular:r.titular,importe:r.importe,estado:r.estado,fecha_pago:r.fecha||null,
      folio_lote:r.folio||null,descripcion:r.descripcion||null,origen:r.individual?'INDIVIDUAL':'GLOBAL',
      nombre_archivo:(r.file||'').slice(0,120),hash:r.hash||null,creado_por:USER.email};
    let {error}=await sb.from('pagos').insert(fila);
    // si falta el Script 53 (columna `origen`), se guarda sin ella
    if(error&&/origen/i.test(error.message||'')){delete fila.origen;({error}=await sb.from('pagos').insert(fila));}
    if(error){
      if(/pagos.*does not exist|relation .*pagos/i.test(error.message||'')){faltaTabla=true;break;}
      if(/PAGO GLOBAL DUPLICADO|PAGO YA REGISTRADO/i.test(error.message||'')){bloqueo=error.message;break;}
      fail++;continue;
    }
    ok++;
  }
  if(bloqueo){
    $('pg-btn').innerHTML='💾 Registrar pagos seleccionados';
    toast(String(bloqueo).replace(/^.*(PAGO GLOBAL DUPLICADO|PAGO YA REGISTRADO)/i,'$1'),'err');
    if(ok)await loadObraData(OBRA.id);
    return;
  }
  $('pg-btn').innerHTML='💾 Registrar pagos seleccionados';
  if(faltaTabla){toast('Falta correr el Script 44 (tabla pagos) en Supabase.','err');return;}
  closeModal();
  toast(`Pagos registrados: ${ok}${fail?`, ${fail} con error`:''}.`,fail?'err':'ok');
  await loadObraData(OBRA.id);
  /* Tras importar el GLOBAL: revisar quién se quedó sin pago esa semana. */
  const finPorConciliar=ok&&CHEQUES.some(c=>!c.eliminado&&c.tipo_pago==='FINIQUITO'&&c.estatus==='PENDIENTE'&&!String(c.num_cheque||'').trim()&&!String(c.consecutivo||'').trim()
    &&normSem(c.semana)===normSem(sem)&&PAGOS.some(p=>p.trabajador_id===c.trabajador_id&&normSem(p.semana)===normSem(sem)&&p.estado==='EXITOSO'&&p.medio==='TRANSFERENCIA'&&Number(p.importe)===Number(c.importe)));
  if(finPorConciliar&&window.PLATINUM_PAGOS_SABADO)setTimeout(()=>window.PLATINUM_PAGOS_SABADO.abrir(Number(ns),'FINIQUITOS'),350);
  else if(ok&&hayGlobales)setTimeout(()=>conciliarSemana(sem),350);
}

/* ============================================================
   v36.2 · CONCILIACIÓN DE LA SEMANA — ¿a quién NO se le pagó?
   Después de importar el pago global (o cuando se pida), se cruza:
       activos de esa semana  vs  pagos (global + individuales)  vs  cheques
   Quien no aparezca en ninguno queda como PENDIENTE y se pregunta por qué:
     · pago rechazado que se reintentó
     · pago en otro banco
     · pago por cheque
   Si no aplica ninguna, salta la ALERTA URGENTE con los botones para
   registrar el cheque o subir el comprobante individual.
   El motivo se guarda en las observaciones del propio pago/cheque; si no hay
   ninguno todavía, se anota como nota de conciliación en el trabajador.
   ============================================================ */
function _semRango(sem){
  const W=parseInt(normSem(sem))||0; if(!W)return[null,null];
  const base=new Date((OBRA&&OBRA.fecha_inicio?String(OBRA.fecha_inicio).slice(0,10):SEMANA1)+'T12:00');
  const d1=new Date(base); d1.setDate(base.getDate()+(W-1)*7);
  const d2=new Date(d1);   d2.setDate(d1.getDate()+6);
  return [d1.toISOString().slice(0,10), d2.toISOString().slice(0,10)];
}
function ctrlCierreDeSemana(sem){
  const n=parseInt(normSem(sem))||0;
  return (CIERRES||[]).filter(c=>c.semana===n&&c.estado!=='CANCELADO').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0]||null;
}
function finTransDe(w,sem){
  const n=parseInt(normSem(sem))||0;
  if(!w||!n)return null;
  const [inicio]=semRange(n);
  const anio=Number(String(inicio||'').slice(0,4));
  return (FINTRANS||[]).find(x=>x.trabajador_id===w.id&&Number(x.semana)===n&&Number(x.anio)===anio)||null;
}
function ctrlEsperadosPagoSemana(sem){
  const n=parseInt(normSem(sem))||0,c=ctrlCierreDeSemana(n);
  if(c&&c.snapshot&&Array.isArray(c.snapshot.items)&&c.snapshot.items.length){
    return c.snapshot.items.map(x=>{
      const w=WORKERS.find(z=>z.id===x.trabajador_id)||WORKERS.find(z=>Number(z.no_trab)===Number(x.numero));if(!w)return null;
      const cn=(CTRLNOI||[]).find(z=>z.cierre_id===c.id&&z.trabajador_id===w.id&&z.tipo_calculo===(x.tipo||'NOMINA'));
      const finTrans=(x.tipo==='FINIQUITO')?finTransDe(w,n):null;
      return {w,tipo:x.tipo||'NOMINA',metodo:finTrans?'TRANSFERENCIA':((cn&&cn.metodo_pago)||x.metodo_pago||metodoPagoPredeterminado(w,x.tipo)),monto:(cn&&cn.monto_noi!=null)?Number(cn.monto_noi):Number(x.monto),cierre:c,finTrans};
    }).filter(Boolean);
  }
  const [d1,d2]=_semRango(n),sinServicio=asSinServicioSemana(d1);
  const normales=WORKERS.filter(w=>String(w.periodo_pago||'SEMANAL')!=='QUINCENAL'
    &&asVigenteSemana(w,d1,d2)&&!sinServicio.has(w.id)
    &&(w.estatus==='ACTIVO'||(w.estatus==='BAJA'&&w.fecha_baja>d2)))
    .map(w=>({w,tipo:'NOMINA',metodo:metodoPagoPredeterminado(w,'NOMINA'),monto:nominaEsperada(w),cierre:null}));
  const fin=WORKERS.filter(w=>w.estatus==='BAJA'&&w.fecha_baja&&w.fecha_baja>=d1&&w.fecha_baja<=d2&&Number(w.monto_finiquito)>0&&!sinServicio.has(w.id))
    .map(w=>{const finTrans=finTransDe(w,n);return {w,tipo:'FINIQUITO',metodo:finTrans?'TRANSFERENCIA':'CHEQUE',monto:Number(w.monto_finiquito),cierre:null,finTrans};});
  return normales.concat(fin);
}
function conciliaSemanaDatos(sem){
  const ns=normSem(sem),esperados=ctrlEsperadosPagoSemana(sem);
  const pagos=(PAGOS||[]).filter(p=>normSem(p.semana)===ns);
  const cheques=(CHEQUES||[]).filter(c=>!c.eliminado&&normSem(c.semana)===ns&&c.estatus!=='CANCELADO');
  return esperados.map(e=>{const w=e.w;
    const míos=pagos.filter(p=>p.trabajador_id===w.id);
    const comprobantes=míos.filter(p=>String(p.estado||'').toUpperCase()==='EXITOSO'
      &&(!e.finTrans||e.finTrans.pago_id===p.id));
    const exito=globalThis.PLATINUM_FLOWS?globalThis.PLATINUM_FLOWS.pagosUnicos(comprobantes):comprobantes;
    const rech =míos.filter(p=>String(p.estado||'').toUpperCase()==='RECHAZADO');
    const chq  =cheques.filter(c=>c.trabajador_id===w.id&&c.tipo_pago===(e.tipo==='FINIQUITO'?'FINIQUITO':'CHEQUE'));
    const entregado=chq.filter(c=>c.estatus==='ENTREGADO'),expedido=chq.filter(c=>c.estatus==='EXPEDIDO'),pendiente=chq.filter(c=>c.estatus==='PENDIENTE');
    let estado='OK', motivo='';
    if(e.tipo!=='FINIQUITO'&&exito.length&&(expedido.length||entregado.length)){estado='MÉTODO INCORRECTO';motivo='Hay transferencia y cheque expedido/entregado. Revisar posible pago doble.';}
    else if(e.tipo!=='FINIQUITO'&&exito.length&&e.monto!=null&&Math.round(exito.reduce((s,p)=>s+Number(p.importe||0),0)*100)!==Math.round(Number(e.monto)*100)){estado='MÉTODO INCORRECTO';motivo='Transferencia registrada con diferencia o pago parcial; conciliar saldo, no crear cheque completo.';}
    else if(e.tipo!=='FINIQUITO'&&exito.length){estado='OK';motivo='transferencia registrada; un pendiente no expedido no es otro pago';}
    else if(e.metodo==='CHEQUE'&&entregado.length){estado='CHEQUE ENTREGADO';motivo='cheque entregado'+(entregado[0].num_cheque?' #'+entregado[0].num_cheque:'');}
    else if(e.metodo==='CHEQUE'&&expedido.length){estado='CHEQUE EXPEDIDO';motivo='cheque expedido'+(expedido[0].num_cheque?' #'+expedido[0].num_cheque:'')+' · cubierto, pendiente de entrega física';}
    else if(e.metodo==='CHEQUE'&&pendiente.length){estado='CHEQUE PENDIENTE';motivo='cheque '+pendiente[0].estatus.toLowerCase()+(pendiente[0].num_cheque?' #'+pendiente[0].num_cheque:' · falta capturar número y consecutivo');}
    else if(e.metodo==='CHEQUE'&&exito.length){estado='MÉTODO INCORRECTO';motivo='se esperaba CHEQUE pero aparece transferencia; revisar antes de cerrar';}
    else if(exito.length){ estado='OK'; motivo=exito.some(p=>p.origen==='INDIVIDUAL'||!míos.some(q=>q.folio_lote&&q.folio_lote===p.folio_lote&&pagos.filter(z=>z.folio_lote===p.folio_lote).length>1))?'pago individual':'pago global'; }
    else if(entregado.length){ estado='CHEQUE ENTREGADO'; motivo='cheque entregado'+(entregado[0].num_cheque?' #'+entregado[0].num_cheque:''); }
    else if(expedido.length){ estado='CHEQUE EXPEDIDO'; motivo='cheque expedido'+(expedido[0].num_cheque?' #'+expedido[0].num_cheque:'')+' · cubierto, pendiente de entrega física'; }
    else if(pendiente.length){estado='CHEQUE PENDIENTE';motivo='cheque '+pendiente[0].estatus.toLowerCase()+(pendiente[0].num_cheque?' #'+pendiente[0].num_cheque:' · falta capturar número y consecutivo');}
    else if(e.finTrans&&e.finTrans.estado==='DECLARADO_POR_ADMIN'){
      estado='TRANSFERENCIA POR CONCILIAR';motivo='finiquito reportado por el administrador; falta vincular el pago BBVA';
    }
    else if(rech.length){ estado='RECHAZADO'; motivo='la transferencia rebotó y NO se ha repuesto'; }
    else { estado='SIN PAGO'; motivo='no aparece ni en el pago global ni en pagos individuales ni en cheques'; }
    return {w,estado,motivo,exito,rech,chq,esperado:e.monto!=null?e.monto:nominaEsperada(w),tipo:e.tipo,metodo:e.metodo};
  });
}
/* Neto que le tocaría esa semana (solo informativo; no toca el motor) */
function nominaEsperada(w){
  try{const n=nominaSemanal(w);return n&&n.neto!=null?n.neto:null;}catch(e){return null;}
}
async function ctrlSincronizarChequesCierre(sem){
  // Abrir una revisión ya no escribe ni regenera cheques. NOI los prepara atómicamente.
  return 0;
}
async function conciliarSemana(sem){
  const ns=normSem(sem); if(!ns){toast('Indica la semana.','err');return;}
  const S='S'+ns;
  const creados=await ctrlSincronizarChequesCierre(S);if(creados){await loadObraData(OBRA.id);toast(`${creados} cheque(s) pendiente(s) generado(s) desde el cierre.`,'ok');}
  const filas=conciliaSemanaDatos(S);
  const sinPago=filas.filter(f=>f.estado==='SIN PAGO');
  const rech   =filas.filter(f=>f.estado==='RECHAZADO');
  const chqEnt =filas.filter(f=>f.estado==='CHEQUE ENTREGADO');
  const chqExp =filas.filter(f=>f.estado==='CHEQUE EXPEDIDO');
  const chqPend=filas.filter(f=>f.estado==='CHEQUE PENDIENTE');
  const metodo =filas.filter(f=>f.estado==='MÉTODO INCORRECTO');
  const porConciliar=filas.filter(f=>f.estado==='TRANSFERENCIA POR CONCILIAR');
  const ok     =filas.filter(f=>f.estado==='OK');
  const acciones=[...sinPago,...rech,...chqPend,...metodo,...porConciliar];window._CONC={S,filas,acciones};
  const urgente=acciones.length;
  modal(`
    <div class="m-head"><h2>${urgente?'🚨':'✅'} Revisión de la semana ${esc(S)} · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      ${urgente?`<div style="background:var(--red-bg);border:1px solid var(--red);border-radius:10px;padding:12px 14px;margin-bottom:12px">
          <b style="color:var(--red);font-size:14px">🚨 ALERTA: ${urgente} caso(s) requieren revisión</b>
          <div style="font-size:12.5px;color:var(--txt);margin-top:4px;line-height:1.6">Aquí solo aparecen quienes no tienen pago, tienen una transferencia rechazada, un cheque todavía sin expedir o una discrepancia de método. <b>Los cheques EXPEDIDOS ya cuentan como cubiertos</b> y pasan al control de entrega física.</div>
        </div>`
        :`<div style="background:var(--green-bg);border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:13px"><b style="color:var(--green)">✅ Todos cubiertos.</b> Los ${filas.length} trabajadores activos de la semana ${esc(S)} tienen pago o cheque registrado.</div>`}
      <div class="stats">
        <div class="stat g"><div class="n">${ok.length}</div><div class="l">Con pago</div></div>
        <div class="stat g"><div class="n">${chqExp.length}</div><div class="l">Cheque expedido</div></div>
        <div class="stat b"><div class="n">${chqEnt.length}</div><div class="l">Cheque entregado</div></div>
        <div class="stat a"><div class="n">${chqPend.length}</div><div class="l">Cheque pendiente</div></div>
        <div class="stat a"><div class="n">${rech.length}</div><div class="l">Rechazados sin reponer</div></div>
        <div class="stat r"><div class="n">${sinPago.length}</div><div class="l">Sin ningún pago</div></div>
      </div>
      ${acciones.length?`<div class="sect">Requieren tu respuesta</div>
        ${acciones.map((f,i)=>concFila(f,i)).join('')}`:''}
      ${(ok.length+chqExp.length+chqEnt.length)?`<div class="sect">Ya cubiertos (${ok.length+chqExp.length+chqEnt.length})</div>
        <div style="max-height:190px;overflow:auto;border:1px solid var(--border);border-radius:8px">
        ${[...ok,...chqExp,...chqEnt].map(f=>`<div class="kv" style="padding:6px 10px"><b>#${f.w.no_trab??'—'} ${esc(fullName(f.w))}</b><span style="font-size:12px;color:var(--mut)">${esc(f.motivo)}</span></div>`).join('')}
        </div>`:''}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn" onclick="exportConciliacionSemana()">⬇ Exportar Excel</button>
      <button class="btn dark" onclick="closeModal();openImportPago()">💸 Subir pagos individuales</button>
    </div>`,'lg');
}
/* Un renglón con las 3 respuestas posibles + las acciones urgentes */
function concFila(f,i){
  const w=f.w;
  const esp=f.esperado!=null?'$'+money(f.esperado):'—';
  return `<div class="hist-item" style="border-color:var(--red);background:var(--red-bg)">
    <div class="hist-top">
      <span class="who">#${w.no_trab??'—'} ${esc(fullName(w))}</span>
      <span style="font-size:12px;color:var(--mut)">${esc(w.contratista||'')} · le tocaba ${esp}</span>
      <span class="badge ${f.estado==='RECHAZADO'?'PENDIENTE':'BAJA'}" style="margin-left:auto">${f.estado}</span>
    </div>
    <div style="font-size:12.5px;color:var(--txt);margin-bottom:8px">${esc(f.motivo)}</div>
    ${f.estado==='CHEQUE PENDIENTE'?`<div><button class="btn dark" onclick="closeModal();openChequeForm('${f.chq[0].id}')">🧾 Capturar número, consecutivo y estatus</button></div>`:f.estado==='MÉTODO INCORRECTO'?`<div><button class="btn" onclick="closeModal();openControlPagos()">🔁 Revisar medios de pago</button></div>`:`<div style="font-size:11.5px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">¿Qué pasó con este pago?</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button class="btn" onclick="concMotivo(${i},'REINTENTO')">🔄 Se rechazó y se reintentó</button>
      <button class="btn" onclick="concMotivo(${i},'OTRO_BANCO')">🏦 Se pagó en otro banco</button>
      <button class="btn" onclick="concMotivo(${i},'CHEQUE')">🧾 Se pagó con cheque</button>
    </div>`}
    <div id="conc-acc-${i}" style="margin-top:9px"></div>
  </div>`;
}
/* Al elegir el motivo se ofrece la acción REAL que lo resuelve */
function concMotivo(i,motivo){
  const st=window._CONC||{}; const filas=st.acciones||[];
  const f=filas[i]; if(!f)return;
  const w=f.w, S=st.S;
  const cajas={
    REINTENTO:`<div style="background:var(--amber-bg);border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.6">
        <b>Se rechazó y se volvió a pagar.</b> Sube el comprobante del <b>segundo intento</b> — los pagos individuales no los bloquea el candado.
        <div style="margin-top:8px;display:flex;gap:7px;flex-wrap:wrap">
          <button class="btn dark" onclick="closeModal();openImportPago()">💸 Subir el comprobante</button>
        </div></div>`,
    OTRO_BANCO:`<div style="background:var(--blue-bg);border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.6">
        <b>Se pagó en otro banco</b> (AZTECA, BANCOPPEL, etc.). Sube el comprobante interbancario: la app lo registra en la semana ${esc(S)}.
        ${w.banco&&w.banco!=='BBVA'?`<br><span style="color:var(--mut)">En su ficha ya está registrado el banco <b>${esc(w.banco)}</b>.</span>`:''}
        <div style="margin-top:8px;display:flex;gap:7px;flex-wrap:wrap">
          <button class="btn dark" onclick="closeModal();openImportPago()">💸 Subir el comprobante</button>
        </div></div>`,
    CHEQUE:`<div style="background:var(--green-bg);border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.6">
        <b>Se pagó con cheque.</b> Regístralo para que quede cuadrado (recuerda: solo 1 cheque de sueldo por semana).
        <div style="margin-top:8px;display:flex;gap:7px;flex-wrap:wrap">
          <button class="btn dark" onclick="closeModal();concNuevoCheque('${w.id}','${esc(S)}',${f.esperado!=null?f.esperado:'null'})">🧾 Registrar el cheque</button>
        </div></div>`
  };
  const el=$('conc-acc-'+i); if(el)el.innerHTML=cajas[motivo]||'';
}
/* Abre el formulario de cheque ya prellenado con el trabajador, semana e importe */
function concNuevoCheque(wid,sem,importe){
  return window.PLATINUM_PAGOS_SABADO.abrir(Number(normSem(sem)));
}
function exportConciliacionSemana(){
  const st=window._CONC; if(!st||!st.filas.length){toast('Nada que exportar.','err');return;}
  const rows=[],styles=[];
  rows.push([`REVISIÓN DE PAGOS — SEMANA ${st.S} — ${OBRA.nombre}`]);styles.push(ST.title);
  rows.push([`Generado el ${new Date().toLocaleDateString('es-MX')}`]);styles.push([ST.sub]);
  rows.push(['NO.','TRABAJADOR','CONTRATISTA','ESTADO','DETALLE','NETO ESPERADO','PAGADO','CHEQUE']);styles.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cell,ST.money,ST.money,ST.cell];
  st.filas.forEach(f=>{
    rows.push([f.w.no_trab??'',fullName(f.w),f.w.contratista||'',f.estado,f.motivo,
      f.esperado!=null?f.esperado:'',
      f.exito.reduce((s,p)=>s+(Number(p.importe)||0),0)||'',
      f.chq.map(c=>(c.num_cheque||'sin folio')+' $'+money(c.importe)).join(' | ')]);
    styles.push(rs);
  });
  const ws=buildSheet(rows,styles,[6,30,20,14,46,13,12,26],[{s:{r:0,c:0},e:{r:0,c:7}},{s:{r:1,c:0},e:{r:1,c:7}}],[{hpt:26},{hpt:16},{hpt:24}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:2,c:0},e:{r:2+st.filas.length,c:7}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'REVISION '+st.S);
  dl(wb,`REVISION_PAGOS_${st.S}_${OBRA.nombre.slice(0,14).replace(/\s+/g,'_')}_${today()}.xlsx`);
  toast('Revisión exportada.','ok');
}
/* ============================================================
   v36 · MÓDULO DE PAGOS BBVA (vista nueva)
   Hasta ahora los pagos por transferencia SE IMPORTABAN pero no tenían dónde
   consultarse: solo aparecían de refilón en "Control de pagos". Esta vista los
   muestra completos, con el mismo formato de la ficha individual del trabajador
   (secciones + renglones clave/valor), y separa:
     · PAGO GLOBAL     = dispersión de nómina; varios trabajadores comparten
                         el mismo folio de lote (un solo movimiento del banco).
     · PAGO INDIVIDUAL = comprobante suelto (mismo banco o interbancario).
   Se alimenta de la tabla `pagos` (Script 44). Solo lectura: no toca importes,
   no toca cheques, no toca el motor de nómina.
   ============================================================ */
const pagoSemNum=p=>parseInt(String(p.semana||'').replace(/\D/g,''))||0;
/* Un folio de lote con más de un pago = dispersión global. */
function pagosIndexados(){
  const trabajadores=new Map(WORKERS.map(w=>[w.id,w]));
  const porFolio={};
  (PAGOS||[]).forEach(p=>{const f=p.folio_lote||('__'+p.id);(porFolio[f]=porFolio[f]||[]).push(p);});
  return (PAGOS||[]).map(p=>{
    const f=p.folio_lote||('__'+p.id);
    const w=trabajadores.get(p.trabajador_id)||null;
    return {...p, w, nombre:w?fullName(w):(p.titular||'—'),
      no_trab:w?w.no_trab:null, contratista:w?(w.contratista||''):'',
      tipo:(porFolio[f].length>1?'GLOBAL':'INDIVIDUAL'), lote:f, enLote:porFolio[f].length};
  });
}
function pagosFiltered(indexados){
  const q=($('pg-v-q')&&$('pg-v-q').value||'').trim().toUpperCase();
  const fs=($('pg-v-sem')&&$('pg-v-sem').value)||'';
  const fe=($('pg-v-estado')&&$('pg-v-estado').value)||'';
  const ft=($('pg-v-tipo')&&$('pg-v-tipo').value)||'';
  return (indexados||pagosIndexados()).filter(p=>{
    if(fs&&String(pagoSemNum(p))!==fs)return false;
    if(fe&&String(p.estado||'').toUpperCase()!==fe)return false;
    if(ft&&p.tipo!==ft)return false;
    if(q){const hay=[p.nombre,p.titular,p.semana,p.banco,p.cuenta_mask,p.folio_lote,p.descripcion,p.no_trab,p.contratista].join(' ').toUpperCase();
      if(!hay.includes(q))return false;}
    return true;
  }).sort((a,b)=>pagoSemNum(b)-pagoSemNum(a)||String(a.nombre).localeCompare(String(b.nombre)));
}
/* ============================================================
   AUDITORÍA DE PAGOS · cheques que faltan por emitir
   La REGLA vive en la base (Script 57, ia_cheques_faltantes): un solo lugar
   donde está escrito qué es un faltante. Aquí solo se pide y se pinta. Así no
   hay dos versiones del mismo criterio, que es lo que nos ha costado caro.
   ============================================================ */
let AUDIT=null, AUDIT_SEM=null;
function auSemActual(){const v=$('au-sem')?parseInt($('au-sem').value):0;return v>0?v:semObra();}
/* Las opciones se arman UNA sola vez por obra.
   BUG QUE HABÍA: auCargar() llamaba a esta función ANTES de leer el selector, y
   aquí se reconstruía el innerHTML marcando como `selected` la semana ya cargada.
   Resultado: elegías la 18, se reescribía el selector de vuelta a la 22 y se
   recargaba la 22. Por eso "no hacía nada". Ahora no se toca si ya está armado. */
function auLlenaSemanas(){
  const sel=$('au-sem'); if(!sel)return;
  const hoy=semObra();
  if(sel.options.length&&Number(sel.dataset.hoy)===hoy)return;   // ya está: se respeta lo elegido
  const act=parseInt(sel.value)||AUDIT_SEM||hoy, ops=[];
  for(let w=hoy;w>=Math.max(1,hoy-25);w--)
    ops.push(`<option value="${w}">Semana ${w}${w===hoy?' (en curso)':''}</option>`);
  sel.innerHTML=ops.join('');
  sel.dataset.hoy=hoy;
  sel.value=String(Math.max(1,Math.min(act,hoy)));
}
function auLlenaObras(){
  const sel=$('au-obra'); if(!sel)return;
  if(sel.options.length&&sel.dataset.n===String((OBRAS||[]).length))return;
  sel.innerHTML='<option value="">Todas las obras que puedo ver</option>'+
    (OBRAS||[]).map(o=>`<option ${OBRA&&o.id===OBRA.id?'selected':''}>${esc(o.nombre)}</option>`).join('');
  sel.dataset.n=(OBRAS||[]).length;
}
function auModo(){return ($('au-modo')&&$('au-modo').value)||'semana';}
/* Al cambiar de modo se enseñan unos filtros u otros y se vuelve a consultar. */
function auCambiaModo(){
  const glob=auModo()==='global';
  const v=(id,ver)=>{const e=$(id);if(e)e.style.display=ver?'':'none';};
  v('au-sem',!glob); v('au-obra',glob); v('au-motivo',!glob);
  auCargar(true);
}
async function auCargar(forzar){
  if(!sb||!OBRA){$('au-body').innerHTML='<tr><td colspan="7"><div class="empty">Abre una obra para auditar.</div></td></tr>';return;}
  auLlenaSemanas(); auLlenaObras();
  if(auModo()==='global')return auCargarGlobal(forzar);
  const sem=auSemActual();
  if(!forzar&&AUDIT&&AUDIT_SEM===sem&&AUDIT.modo!=='global')return auRender();
  AUDIT_SEM=sem;
  $('au-body').innerHTML=Array.from({length:6},()=>
    '<tr>'+Array.from({length:7},(_,i)=>`<td><span class="skel" style="display:inline-block;width:${[80,55,60,40,45,70,50][i]}%"></span></td>`).join('')+'</tr>').join('');
  $('au-stats').innerHTML='';
  try{
    const {data,error}=await sb.rpc('ia_cheques_faltantes',{
      p_semana:sem, p_obras:[OBRA.nombre], p_contratista:null, p_cuadrilla:null,
      p_motivo:null, p_limite:500});
    if(error)throw error;
    AUDIT=Object.assign({faltantes:[]},data||{},{modo:'semana'});
    auLlenaFiltros();
    auRender();
  }catch(e){
    AUDIT=null;
    const falta=/does not exist|could not find|404|PGRST202/i.test(String(e.message||e));
    $('au-body').innerHTML=`<tr><td colspan="7"><div class="empty">
      <div class="big">${falta?'🧩':'⚠'}</div>
      ${falta?'Falta correr el <b>Script 57</b> en Supabase.<br><span style="color:var(--mut);font-size:12px">SQL Editor → pega <b>57_CHEQUES_FALTANTES.sql</b> → Run. Es de solo lectura y no toca ninguna tabla.</span>'
             :'No se pudo auditar: '+esc(String(e.message||e))}
      </div></td></tr>`;
  }
}
async function auCargarGlobal(forzar){
  const obra=($('au-obra')&&$('au-obra').value)||'';
  if(!forzar&&AUDIT&&AUDIT.modo==='global'&&AUDIT._obra===obra)return auRender();
  $('au-body').innerHTML=Array.from({length:6},()=>
    '<tr>'+Array.from({length:7},(_,i)=>`<td><span class="skel" style="display:inline-block;width:${[80,55,60,40,45,70,50][i]}%"></span></td>`).join('')+'</tr>').join('');
  $('au-stats').innerHTML='';
  try{
    const {data,error}=await sb.rpc('ia_reposiciones_pendientes',{
      p_obras:obra?[obra]:null, p_contratista:null, p_limite:800});
    if(error)throw error;
    AUDIT=Object.assign({faltantes:[]},data||{},{modo:'global',_obra:obra});
    auLlenaFiltros();
    auRender();
  }catch(e){
    AUDIT=null;
    const falta=/does not exist|could not find|404|PGRST202/i.test(String(e.message||e));
    $('au-body').innerHTML=`<tr><td colspan="7"><div class="empty">
      <div class="big">${falta?'🧩':'⚠'}</div>
      ${falta?'Falta volver a correr el <b>Script 57</b> en Supabase.<br><span style="color:var(--mut);font-size:12px">Trae la función nueva <b>ia_reposiciones_pendientes</b>. Es de solo lectura.</span>'
             :'No se pudo auditar: '+esc(String(e.message||e))}
      </div></td></tr>`;
  }
}
function auLlenaFiltros(){
  const f=(AUDIT&&AUDIT.faltantes)||[];
  const pon=(id,lbl,vals)=>{const sel=$(id);if(!sel)return;const cur=sel.value;
    sel.innerHTML=`<option value="">${lbl}</option>`+[...new Set(vals.filter(Boolean))].sort()
      .map(v=>`<option ${v===cur?'selected':''}>${esc(v)}</option>`).join('');};
  pon('au-contr','Contratista: todos',f.map(x=>x.contratista));
  const glob=AUDIT&&AUDIT.modo==='global';
  pon('au-cuad',glob?'Obra: todas':'Cuadrilla: todas',f.map(x=>glob?x.obra:x.cuadrilla));
}
function auFiltradas(){
  const f=(AUDIT&&AUDIT.faltantes)||[];
  const q=($('au-q')&&$('au-q').value||'').trim().toUpperCase();
  const c=($('au-contr')&&$('au-contr').value)||'';
  const cu=($('au-cuad')&&$('au-cuad').value)||'';
  const m=($('au-motivo')&&$('au-motivo').value)||'';
  return f.filter(x=>{
    if(c&&x.contratista!==c)return false;
    if(cu&&((AUDIT&&AUDIT.modo==='global')?x.obra:x.cuadrilla)!==cu)return false;
    if(m&&!String(x.motivo||'').includes(m))return false;
    if(q){const hay=[x.trabajador,x.contratista,x.cuadrilla,x.obra,x.semana,x.tipo_pago,x.motivo,x.folio_cancelado]
      .join(' ').toUpperCase(); if(!hay.includes(q))return false;}
    return true;
  });
}
function auRender(){
  if(!AUDIT)return;
  const glob=AUDIT.modo==='global';
  const f=auFiltradas();
  /* En el histórico la columna útil es la OBRA (puede haber varias); en el de la
     semana, la cuadrilla. El encabezado cambia con el modo. */
  const th=$('au-tbl').tHead.rows[0];
  th.cells[2].textContent=glob?'Obra':'Cuadrilla';
  th.cells[3].textContent='Semana';
  const rep=f.filter(x=>/REPOSICIÓN/.test(x.motivo)).length, emi=f.length-rep;
  if(glob){
    const imp=f.reduce((a,x)=>a+(Number(x.importe_cancelado)||0),0);
    const obras=[...new Set(f.map(x=>x.obra).filter(Boolean))];
    const viejo=f.reduce((a,x)=>Math.max(a,Number(x.dias_sin_reponer)||0),0);
    $('au-stats').innerHTML=`
      <div class="stat ${f.length?'r':'g'}"><div class="n">${f.length}</div><div class="l">Reposiciones pendientes · todas las semanas</div></div>
      <div class="stat r"><div class="n">$${money(imp)}</div><div class="l">Importe que quedó sin cobrar</div></div>
      <div class="stat a"><div class="n">${obras.length}</div><div class="l">Obra(s) con faltantes${obras.length===1?': '+esc(obras[0]):''}</div></div>
      <div class="stat b"><div class="n">${viejo}</div><div class="l">Días del más viejo sin reponer</div></div>`;
  }else{
    $('au-stats').innerHTML=`
      <div class="stat ${f.length?'r':'g'}"><div class="n">${f.length}</div><div class="l">Cheques faltantes · semana ${AUDIT_SEM}</div></div>
      <div class="stat a"><div class="n">${rep}</div><div class="l">Se canceló y no se repuso</div></div>
      <div class="stat a"><div class="n">${emi}</div><div class="l">Nunca se emitió</div></div>
      <div class="stat b"><div class="n">${esc(String(AUDIT.del||'').slice(5))} a ${esc(String(AUDIT.al||'').slice(5))}</div><div class="l">Periodo auditado</div></div>`;
  }
  if(!f.length){
    $('au-body').innerHTML=`<tr><td colspan="7"><div class="empty"><div class="big">✅</div>
      ${glob?'Ningún cheque cancelado quedó sin reponer. Nada pendiente en el histórico.'
            :`Sin pagos pendientes por revisar en la semana ${AUDIT_SEM}; no se exige cheque a quien tiene transferencia.`}</div></td></tr>`;
    return;
  }
  $('au-body').innerHTML=f.map(x=>{
    const esRep=/REPOSICIÓN/.test(x.motivo);
    return `<tr>
      <td><b>${esc(x.trabajador||'—')}</b>${x.no_trab?` <span style="color:var(--mut)">#${x.no_trab}</span>`:''}
        <div style="color:var(--mut);font-size:11.5px">${esc(x.detalle||'')}</div></td>
      <td>${esc(x.contratista||'—')}</td>
      <td>${glob?esc(x.obra||'—'):(x.cuadrilla?esc(x.cuadrilla):'<span style="color:var(--mut)">—</span>')}</td>
      <td style="text-align:center"><b>${esc(x.semana||'')}</b></td>
      <td style="text-align:center"><span class="badge ${x.tipo_pago==='FINIQUITO'?'PENDIENTE':'ENTREGADO'}">${esc(x.tipo_pago||'CHEQUE')}</span></td>
      <td><span class="badge ${esRep?'CANCELADO':'PENDIENTE'}">${esc(x.motivo)}</span>
        ${x.folio_cancelado?`<div style="color:var(--mut);font-size:11.5px">folio ${esc(x.folio_cancelado)}${x.importe_cancelado?' · $'+money(x.importe_cancelado):''}</div>`:''}</td>
      <td style="text-align:center">${x.trabajador_id?`<button class="btn" style="padding:4px 10px" onclick="auHacerCheque('${x.trabajador_id}','${esc(x.semana)}','${esc(x.tipo_pago||'CHEQUE')}','${esc(x.obra_id||'')}')">🧾 Revisar pago</button>`:'—'}</td>
    </tr>`;}).join('');
}
/* Abre el alta de cheque ya con el trabajador, la semana y el tipo puestos.
   No guarda nada solo: el importe y el folio los captura una persona. */
async function auHacerCheque(tid,sem,tipo,obraId){
  if(obraId&&OBRA?.id!==obraId){await selectObra(obraId);if(OBRA?.id!==obraId)return;}
  if(tipo!=='FINIQUITO')return window.PLATINUM_PAGOS_SABADO.abrir(Number(normSem(sem)));
  const w=(WORKERS||[]).find(x=>x.id===tid);
  if(!w){toast('Ese trabajador no está en la obra abierta.','err');return;}
  openChequeForm(null);
  /* Se llenan los campos del alta y se dispara chqAutofill(), que es quien trae
     puesto, CURP, contratista y el sueldo semanal. El FOLIO siempre lo captura
     una persona: esto ahorra tecleo, no inventa el cheque. */
  setTimeout(()=>{
    const nom=$('c-nombre');
    if(nom){nom.value=fullName(w); if(typeof chqAutofill==='function')chqAutofill();}
    const es=$('f-c-semana'), ep=$('f-c-periodo');
    if(es){es.value=sem; const n=parseInt(String(sem).replace(/\D/g,'')); if(ep&&n>0)ep.value=periodoCorto(n);}
    const et=$('c-tipo'); if(et)et.value=tipo;
    /* Un FINIQUITO no vale el sueldo de la semana: chqAutofill acaba de poner
       sal_semanal y aquí eso sería un error caro. Se pone el finiquito capturado
       en su ficha y, si no lo hay, se deja VACÍO para que se calcule (🧮 Prestaciones). */
    const ei=$('f-c-importe');
    if(ei&&tipo==='FINIQUITO')ei.value=(Number(w.monto_finiquito)>0)?w.monto_finiquito:'';
    if(ei)ei.focus();
  },140);
}
function auExport(){
  const f=auFiltradas();
  if(!f.length){toast('No hay faltantes que exportar.','err');return;}
  const glob=AUDIT&&AUDIT.modo==='global';
  const rows=[],styles=[];
  rows.push([glob?`AUDITORÍA DE PAGOS — REPOSICIONES PENDIENTES (TODAS LAS SEMANAS) · ${($('au-obra')&&$('au-obra').value)||'TODAS LAS OBRAS'}`
                 :`AUDITORÍA DE PAGOS — CHEQUES FALTANTES · SEMANA ${AUDIT_SEM} · ${OBRA.nombre}`]); styles.push(ST.title);
  rows.push(['TRABAJADOR','NO.','CONTRATISTA',glob?'OBRA':'CUADRILLA','SEMANA','TIPO','MOTIVO','DETALLE','FOLIO CANCELADO','IMPORTE']);
  styles.push(ST.head);
  const r1=[ST.cell,ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cell,ST.cell,ST.cellC,ST.money];
  f.forEach(x=>{rows.push([x.trabajador||'',x.no_trab??'',x.contratista||'',(glob?x.obra:x.cuadrilla)||'',
    x.semana||'',x.tipo_pago||'',x.motivo||'',x.detalle||'',x.folio_cancelado||'',
    Number(x.importe_cancelado)||'']); styles.push(r1);});
  const impT=f.reduce((a,x)=>a+(Number(x.importe_cancelado)||0),0);
  rows.push([glob?`TOTAL: ${f.length} reposición(es) pendiente(s) · $${money(impT)} sin cobrar`
                 :`TOTAL: ${f.length} faltante(s) · ${f.filter(x=>/REPOSICIÓN/.test(x.motivo)).length} sin reponer · ${f.filter(x=>/EMISIÓN/.test(x.motivo)).length} sin emitir`]);
  styles.push(ST.total);
  const ws=buildSheet(rows,styles,[34,7,16,24,9,11,24,44,15,12],
    [{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:9}}],[{hpt:26},{hpt:24}]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,glob?'REPOSICIONES PENDIENTES':`FALTANTES S${AUDIT_SEM}`);
  dl(wb,glob?`AUDITORIA_REPOSICIONES_PENDIENTES.xlsx`
           :`AUDITORIA_CHEQUES_SEMANA${AUDIT_SEM}_${OBRA.nombre.slice(0,16).replace(/\s+/g,'_')}.xlsx`);
  toast('Excel de la auditoría generado.','ok');
}
function renderPagosView(){
  if(!$('pg-v-tbody'))return;
  const todos=pagosIndexados();
  // selector de semanas (se arma con lo que de verdad hay importado)
  const sel=$('pg-v-sem');
  if(sel){
    const cur=sel.value;
    const sems=[...new Set(todos.map(pagoSemNum).filter(Boolean))].sort((a,b)=>b-a);
    sel.innerHTML='<option value="">Semana: todas</option>'+sems.map(s=>`<option value="${s}" ${String(s)===cur?'selected':''}>S${s}</option>`).join('');
  }
  const rows=pagosFiltered(todos);
  const ex=rows.filter(p=>String(p.estado||'').toUpperCase()!=='RECHAZADO');
  const re=rows.filter(p=>String(p.estado||'').toUpperCase()==='RECHAZADO');
  const suma=a=>a.reduce((s,p)=>s+(Number(p.importe)||0),0);
  const lotes=new Set(rows.filter(p=>p.tipo==='GLOBAL').map(p=>p.lote));
  $('pg-v-stats').innerHTML=`
    <div class="stat g"><div class="n">$${money(suma(ex))}</div><div class="l">Dispersado (exitoso)</div></div>
    <div class="stat b"><div class="n">${ex.length}</div><div class="l">Pagos exitosos</div></div>
    <div class="stat r"><div class="n">${re.length}</div><div class="l">Rechazados · $${money(suma(re))}</div></div>
    <div class="stat"><div class="n">${new Set(rows.map(p=>p.trabajador_id).filter(Boolean)).size}</div><div class="l">Trabajadores pagados</div></div>
    <div class="stat a"><div class="n">${lotes.size}</div><div class="l">Lotes globales</div></div>`;
  if(!todos.length){
    $('pg-v-tbody').innerHTML=`<tr><td colspan="9"><div class="empty"><div class="big">💸</div>Todavía no hay pagos importados en esta obra.<br><span style="font-size:12.5px">Impórtalos con <b>📥 Importar → 💸 Pago global BBVA</b> (acepta el resumen de dispersión y también comprobantes individuales).</span><br><button class="btn dark" style="margin-top:12px" onclick="openImportPago()">💸 Importar pagos BBVA</button></div></td></tr>`;
    return;
  }
  if(!rows.length){$('pg-v-tbody').innerHTML='<tr><td colspan="9"><div class="empty">Ningún pago coincide con el filtro.</div></td></tr>';return;}
  $('pg-v-tbody').innerHTML=rows.map(p=>{
    const rech=String(p.estado||'').toUpperCase()==='RECHAZADO';
    return `<tr onclick="${p.trabajador_id?`openPagoTrabajador('${p.trabajador_id}')`:`openPagoLote('${esc(p.lote)}')`}" title="Ver el detalle">
      <td>${p.no_trab??'—'}</td>
      <td><b>${esc(p.nombre)}</b>${p.contratista?`<br><span style="color:var(--mut);font-size:11px">${esc(p.contratista)}</span>`:''}</td>
      <td>${esc(p.semana||'—')}</td>
      <td>${p.fecha_pago?fmtD(p.fecha_pago):'—'}</td>
      <td style="text-align:right;font-weight:700${rech?';color:var(--red);text-decoration:line-through':''}">$${money(p.importe)}</td>
      <td>${esc(p.banco||'BBVA')}</td>
      <td>${esc(p.cuenta_mask||'—')}</td>
      <td><span class="badge ${rech?'BAJA':'ACTIVO'}">${esc(p.estado||'EXITOSO')}</span></td>
      <td><span class="badge ${p.tipo==='GLOBAL'?'ENTREGADO':'SEMANAL'}">${p.tipo}</span>${p.tipo==='GLOBAL'?`<br><span style="color:var(--mut);font-size:10.5px" onclick="event.stopPropagation();openPagoLote('${esc(p.lote)}')">lote ${esc(String(p.lote).slice(0,10))}… (${p.enLote})</span>`:''}</td>
    </tr>`;
  }).join('');
}
/* Detalle por trabajador — mismo formato que el recibo de nómina individual */
function openPagoTrabajador(id){
  const w=WORKERS.find(x=>x.id===id);
  const mios=pagosIndexados().filter(p=>p.trabajador_id===id).sort((a,b)=>pagoSemNum(a)-pagoSemNum(b));
  if(!mios.length){toast('Ese trabajador no tiene pagos registrados.','err');return;}
  const ex=mios.filter(p=>String(p.estado||'').toUpperCase()!=='RECHAZADO');
  const total=ex.reduce((s,p)=>s+(Number(p.importe)||0),0);
  const kv=(k,v)=>`<div class="kv"><b>${k}</b><span>${v}</span></div>`;
  const porSem={}; mios.forEach(p=>{(porSem[pagoSemNum(p)]=porSem[pagoSemNum(p)]||[]).push(p);});
  const semanas=Object.keys(porSem).map(Number).sort((a,b)=>a-b);
  modal(`
    <div class="m-head"><h2>💸 Pagos BBVA · ${esc(w?fullName(w):(mios[0].titular||''))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="stats">
        <div class="stat g"><div class="n">$${money(total)}</div><div class="l">Total transferido</div></div>
        <div class="stat b"><div class="n">${ex.length}</div><div class="l">Pagos exitosos</div></div>
        ${mios.length-ex.length?`<div class="stat r"><div class="n">${mios.length-ex.length}</div><div class="l">Rechazados</div></div>`:''}
        <div class="stat"><div class="n">${semanas.length}</div><div class="l">Semanas pagadas</div></div>
      </div>
      ${w?`<div class="sect">Datos del trabajador</div>
      ${kv('No. de trabajador',w.no_trab??'—')}
      ${kv('Contratista',esc(w.contratista||'—'))}
      ${kv('Puesto',esc(w.puesto||'—'))}
      ${kv('Cuenta / CLABE',esc(w.cuenta||'—')+(w.clabe?' · '+esc(w.clabe):''))}
      ${kv('Banco',esc(w.banco||'—'))}`:''}
      ${semanas.map(s=>{
        const ps=porSem[s];
        const tot=ps.filter(p=>String(p.estado||'').toUpperCase()!=='RECHAZADO').reduce((a,p)=>a+(Number(p.importe)||0),0);
        /* cruce solo-lectura contra el cheque de esa semana (aviso de pago doble) */
        const chq=(CHEQUES||[]).filter(c=>c.trabajador_id===id&&normSem(c.semana)===String(s)&&c.estatus!=='CANCELADO');
        return `<div class="sect">Semana S${s} · $${money(tot)}</div>
        ${ps.map(p=>{
          const rech=String(p.estado||'').toUpperCase()==='RECHAZADO';
          return `<div class="kv" ${rech?'style="background:var(--red-bg)"':''}>
            <b>${p.fecha_pago?fmtD(p.fecha_pago):'sin fecha'}</b>
            <span><b style="font-size:14px${rech?';color:var(--red)':''}">$${money(p.importe)}</b> · ${esc(p.banco||'BBVA')} ${esc(p.cuenta_mask||'')}
            · <span class="badge ${p.tipo==='GLOBAL'?'ENTREGADO':'SEMANAL'}">${p.tipo}</span>
            · <span class="badge ${rech?'BAJA':'ACTIVO'}">${esc(p.estado||'EXITOSO')}</span>
            ${p.descripcion?`<br><span style="color:var(--mut);font-size:11.5px">${esc(p.descripcion)}</span>`:''}
            ${p.folio_lote?`<br><span style="color:var(--mut);font-size:11px">Folio/lote ${esc(p.folio_lote)} ${p.enLote>1?`· <a href="#" onclick="closeModal();openPagoLote('${esc(p.lote)}');return false">ver el lote completo (${p.enLote})</a>`:''}</span>`:''}
            ${p.titular&&w&&p.titular.toUpperCase()!==fullName(w).toUpperCase()?`<br><span style="color:var(--mut);font-size:11px">Titular en el banco: ${esc(p.titular)}</span>`:''}
            </span></div>`;
        }).join('')}
        ${chq.length?`<div class="kv" style="background:var(--amber-bg)"><b style="color:var(--amber)">⚠ También hay cheque</b><span>${chq.map(c=>`${esc(c.tipo_pago)} $${money(c.importe)} · <span class="badge ${c.estatus}">${c.estatus}</span>`).join(' · ')} — revísalo en <b>🔁 Control de pagos</b> por posible pago doble.</span></div>`:''}`;
      }).join('')}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      ${w?`<button class="btn" onclick="closeModal();openDetail('${w.id}')">👤 Abrir ficha del trabajador</button>`:''}
      <button class="btn dark" onclick="exportPagoTrabajador('${id}')">⬇ Exportar sus pagos</button>
    </div>`,'lg');
}
/* Detalle de un pago GLOBAL (la dispersión completa de un lote) */
function openPagoLote(folio){
  const ps=pagosIndexados().filter(p=>p.lote===folio).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));
  if(!ps.length){toast('Lote no encontrado.','err');return;}
  const ex=ps.filter(p=>String(p.estado||'').toUpperCase()!=='RECHAZADO');
  const re=ps.filter(p=>String(p.estado||'').toUpperCase()==='RECHAZADO');
  const suma=a=>a.reduce((s,p)=>s+(Number(p.importe)||0),0);
  const p0=ps[0];
  window._PGLOTE=ps;
  modal(`
    <div class="m-head"><h2>🏦 Pago global BBVA · lote ${esc(String(p0.folio_lote||'—'))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="stats">
        <div class="stat g"><div class="n">$${money(suma(ex))}</div><div class="l">Total dispersado</div></div>
        <div class="stat b"><div class="n">${ex.length}</div><div class="l">Exitosos</div></div>
        ${re.length?`<div class="stat r"><div class="n">${re.length}</div><div class="l">Rechazados · $${money(suma(re))}</div></div>`:''}
        <div class="stat"><div class="n">${esc(p0.semana||'—')}</div><div class="l">Nómina pagada</div></div>
      </div>
      <div class="kv"><b>Descripción</b><span>${esc(p0.descripcion||'—')}</span></div>
      <div class="kv"><b>Fecha de dispersión</b><span>${p0.fecha_pago?fmtD(p0.fecha_pago):'—'}</span></div>
      <div class="kv"><b>Banco</b><span>${esc(p0.banco||'BBVA')}</span></div>
      <div class="kv"><b>Archivo importado</b><span>${esc(p0.nombre_archivo||'—')}</span></div>
      <div class="sect">Trabajadores del lote (${ps.length})</div>
      <div class="tbl-card" style="max-height:46vh">
        <table style="min-width:0">
          <thead><tr><th>No.</th><th>Trabajador</th><th>Cuenta</th><th style="text-align:right">Importe</th><th>Estado</th></tr></thead>
          <tbody>${ps.map(p=>{
            const rech=String(p.estado||'').toUpperCase()==='RECHAZADO';
            return `<tr ${p.trabajador_id?`onclick="closeModal();openPagoTrabajador('${p.trabajador_id}')"`:''} ${rech?'style="background:var(--red-bg)"':''}>
              <td>${p.no_trab??'—'}</td><td><b>${esc(p.nombre)}</b></td><td>${esc(p.cuenta_mask||'—')}</td>
              <td style="text-align:right">$${money(p.importe)}</td>
              <td><span class="badge ${rech?'BAJA':'ACTIVO'}">${esc(p.estado||'EXITOSO')}</span></td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="m-foot">
      ${esAdmin()?`<button class="btn danger" style="margin-right:auto" onclick="eliminarPagoLote('${esc(String(p0.folio_lote||''))}')">🗑 Eliminar este lote completo</button>`:''}
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn" onclick="conciliarSemana('${esc(p0.semana||'')}')">🔎 Revisar la semana</button>
      <button class="btn dark" onclick="exportPagoLote()">⬇ Exportar este lote</button>
    </div>`,'lg');
}
/* Elimina TODO un lote global (para volver a importar el correcto). Solo admin. */
async function eliminarPagoLote(folio){
  if(!esAdmin()){toast('Solo el administrador puede eliminar un lote de pagos.','err');return;}
  const ps=(PAGOS||[]).filter(p=>String(p.folio_lote||'')===String(folio));
  if(!ps.length){toast('Lote no encontrado.','err');return;}
  const tot=ps.filter(p=>String(p.estado||'').toUpperCase()!=='RECHAZADO').reduce((s,p)=>s+(Number(p.importe)||0),0);
  if(!confirm(`¿ELIMINAR el lote completo?\n\nLote: ${folio||'(sin folio)'}\nSemana: ${ps[0].semana||'—'}\nTrabajadores: ${ps.length}\nImporte: $${money(tot)}\n\nSe borran los ${ps.length} registros de pago de este lote. Los CHEQUES no se tocan.\nHazlo solo si te equivocaste de archivo y vas a importar el correcto.`))return;
  markWrite();
  const {error}=await sb.from('pagos').delete().eq('folio_lote',folio);
  if(error){toast('No se pudo eliminar: '+error.message,'err');return;}
  closeModal();
  toast(`Lote eliminado (${ps.length} pagos). Ya puedes importar el correcto.`,'ok');
  await loadObraData(OBRA.id);
}
/* Elegir la semana a revisar */
function openRevisarSemana(){
  const sems=[...new Set((PAGOS||[]).map(p=>parseInt(normSem(p.semana))).filter(Boolean))].sort((a,b)=>b-a);
  const sug=sems[0]||semObra();
  modal(`
    <div class="m-head"><h2>🔎 Revisar una semana</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Cruza a los <b>activos de la semana</b> contra los <b>pagos</b> (global e individuales) y los <b>cheques</b>, y te dice a quién le falta que le paguen.</p>
      <div class="grid" style="grid-template-columns:180px 1fr;align-items:end">
        <div><label>Semana</label><input id="rs-sem" value="S${sug}" placeholder="S19"></div>
        <div style="font-size:12px;color:var(--mut)">${sems.length?'Semanas con pagos importados: '+sems.slice(0,10).map(s=>'S'+s).join(', '):'Todavía no hay pagos importados.'}</div>
      </div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="const v=$('rs-sem').value;closeModal();conciliarSemana(v)">🔎 Revisar</button>
    </div>`,'md');
}
/* ---- Exports del módulo de pagos ---- */
function _pagosSheet(rows,titulo){
  const aoa=[],st=[];
  aoa.push([titulo]);st.push(ST.title);
  aoa.push([`Generado el ${new Date().toLocaleDateString('es-MX')} · ${OBRA.nombre}`]);st.push([ST.sub]);
  aoa.push(['NO.','TRABAJADOR','CONTRATISTA','SEMANA','FECHA','IMPORTE','BANCO','CUENTA','ESTADO','TIPO','FOLIO / LOTE','DESCRIPCIÓN']);st.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.money,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cell,ST.cell];
  rows.forEach(p=>{aoa.push([p.no_trab??'',p.nombre,p.contratista||'',p.semana||'',p.fecha_pago?fmtD(p.fecha_pago):'',
    Number(p.importe)||0,p.banco||'',p.cuenta_mask||'',p.estado||'',p.tipo,p.folio_lote||'',p.descripcion||'']);st.push(rs);});
  const tot=rows.filter(p=>String(p.estado||'').toUpperCase()!=='RECHAZADO').reduce((s,p)=>s+(Number(p.importe)||0),0);
  aoa.push(['','TOTAL EXITOSO','','','',tot,'','','','','','']);
  st.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total,ST.total,ST.total,ST.total,ST.total,ST.total]);
  const ws=buildSheet(aoa,st,[6,30,20,9,12,13,10,11,12,12,34,28],[{s:{r:0,c:0},e:{r:0,c:11}},{s:{r:1,c:0},e:{r:1,c:11}}],[{hpt:26},{hpt:16},{hpt:24}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:2,c:0},e:{r:2+rows.length,c:11}})};
  return ws;
}
function exportPagos(){
  const rows=pagosFiltered();
  if(!rows.length){toast('No hay pagos que exportar con el filtro actual.','err');return;}
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,_pagosSheet(rows,'PAGOS BBVA — DETALLE'),'DETALLE');
  // hoja de lotes globales
  const lotes={};
  rows.filter(p=>p.tipo==='GLOBAL').forEach(p=>{(lotes[p.lote]=lotes[p.lote]||[]).push(p);});
  const ks=Object.keys(lotes);
  if(ks.length){
    const aoa=[],st=[];
    aoa.push(['PAGOS GLOBALES BBVA — RESUMEN POR LOTE']);st.push(ST.title);
    aoa.push(['FOLIO / LOTE','DESCRIPCIÓN','SEMANA','FECHA','TRABAJADORES','EXITOSOS','RECHAZADOS','TOTAL DISPERSADO']);st.push(ST.head);
    const rs=[ST.cell,ST.cell,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.cellC,ST.money];
    ks.forEach(k=>{const g=lotes[k];const e=g.filter(p=>String(p.estado||'').toUpperCase()!=='RECHAZADO');
      aoa.push([g[0].folio_lote||k,g[0].descripcion||'',g[0].semana||'',g[0].fecha_pago?fmtD(g[0].fecha_pago):'',
        g.length,e.length,g.length-e.length,e.reduce((s,p)=>s+(Number(p.importe)||0),0)]);st.push(rs);});
    XLSX.utils.book_append_sheet(wb,buildSheet(aoa,st,[36,28,9,12,14,11,12,17],[{s:{r:0,c:0},e:{r:0,c:7}}],[{hpt:26},{hpt:24}]),'LOTES GLOBALES');
  }
  dl(wb,`PAGOS_BBVA_${OBRA.nombre.slice(0,16).replace(/\s+/g,'_')}_${today()}.xlsx`);
  toast(`Excel de pagos generado: ${rows.length} movimiento(s).`,'ok');
}
function exportPagoTrabajador(id){
  const rows=pagosIndexados().filter(p=>p.trabajador_id===id).sort((a,b)=>pagoSemNum(a)-pagoSemNum(b));
  if(!rows.length){toast('Sin pagos que exportar.','err');return;}
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,_pagosSheet(rows,'PAGOS BBVA — '+rows[0].nombre),'PAGOS');
  dl(wb,`PAGOS_${String(rows[0].nombre).replace(/\s+/g,'_').slice(0,28)}_${today()}.xlsx`);
  toast('Pagos del trabajador exportados.','ok');
}
function exportPagoLote(){
  const rows=window._PGLOTE||[];
  if(!rows.length){toast('Sin datos del lote.','err');return;}
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,_pagosSheet(rows,'PAGO GLOBAL BBVA — LOTE '+(rows[0].folio_lote||'')),'LOTE');
  dl(wb,`PAGO_GLOBAL_LOTE_${String(rows[0].folio_lote||'').slice(0,16)}_${today()}.xlsx`);
  toast('Lote exportado.','ok');
}

/* El finiquito cambia por el flujo conciliado, nunca por borrar sin vínculo. */
async function pagoCancelarCheque(id){
  const c=(CHEQUES||[]).find(x=>x.id===id); if(!c){toast('Cheque no encontrado.','err');return;}
  if(c.tipo_pago==='FINIQUITO'){
    if(c.estatus!=='PENDIENTE'||String(c.num_cheque||'').trim()||String(c.consecutivo||'').trim()){
      toast('Es un cheque físico. No se elimina ni se sustituye automáticamente; revisa la posible transferencia duplicada.','err');return;
    }
    if(!window.PLATINUM_PAGOS_SABADO){toast('No está disponible la conciliación de finiquitos. Recarga la versión actual.','err');return;}
    return window.PLATINUM_PAGOS_SABADO.abrir(Number(normSem(c.semana)),'FINIQUITOS');
  }
  if(!String(c.num_cheque||'').trim()&&!String(c.consecutivo||'').trim()){
    return eliminarChequeErroneo(id);
  }
  if(!String(c.num_cheque||'').trim()||!String(c.consecutivo||'').trim()){
    toast('Completa el número y consecutivo del cheque físico antes de cancelarlo. No se eliminó ni canceló nada.','err');return;
  }
  if(!confirm(`¿CANCELAR el cheque${c.num_cheque?' #'+c.num_cheque:''} de ${c.nombre||''} (semana ${c.semana}, $${money(c.importe)})?\n\nQueda marcado como CANCELADO (no se borra) porque a este trabajador ya se le pagó por transferencia esa semana.`))return;
  markWrite();
  const obs=(c.observaciones?c.observaciones+' · ':'')+'CANCELADO: ya pagado por transferencia (control de pagos '+today()+')';
  const {error}=await sb.from('cheques').update({estatus:'CANCELADO',observaciones:obs}).eq('id',id);
  if(error){toast('Error al cancelar el cheque: '+error.message,'err');return;}
  toast('Cheque marcado como CANCELADO.','ok');
  await loadObraData(OBRA.id);
  if($('pg-out')&&PAGOIMP)pgRender();
  else if($('cp-out'))cpBuild();
}
