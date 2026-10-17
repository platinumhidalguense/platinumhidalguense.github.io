/* ---------- VALIDACIONES OFICIALES + CHECKID ---------- */
function openValidar(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const row=(l,v,url,nota)=>`<div class="kv"><b>${l}</b><span><b>${esc(v)||'—'}</b>
    ${v?`<button class="btn" style="padding:2px 9px;font-size:11px;margin-left:8px" onclick="copyTxt('${esc(v)}')">Copiar</button>
    <button class="btn" style="padding:2px 9px;font-size:11px" onclick="window.open('${url}','_blank')">Abrir consulta</button>`:''}
    <br><span style="font-size:11px;color:var(--mut)">${nota}</span></span></div>`;
  modal(`
    <div class="m-head"><h2>🔍 Validaciones oficiales · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      ${row('CURP (RENAPO)',w.curp,'https://www.gob.mx/curp/','Pega la CURP en el consultor oficial: confirma que existe y los datos coinciden.')}
      ${row('RFC (SAT)',w.rfc,'https://agsc.siat.sat.gob.mx/PTSC/ValidaRFC/index.jsf','Validador oficial del SAT: confirma que el RFC existe y está activo. El régimen (605 sueldos y salarios) se ve en la Constancia de Situación Fiscal o vía CheckID.')}
      ${row('NSS (IMSS)',w.nss,'https://serviciosdigitales.imss.gob.mx/gestionAsegurados-web-externo/vigencia','Consulta de vigencia de derechos del IMSS.')}
      <div class="sect">CheckID (verificación automática)</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <button class="btn dark" onclick="checkidConsulta('${id}','rfc')">Verificar RFC + régimen</button>
        <button class="btn" onclick="checkidConsulta('${id}','curp')">Verificar CURP</button>
        <button class="btn" onclick="checkidConsulta('${id}','nss')">Verificar NSS</button>
        <button class="btn" onclick="checkidSaldo()">Saldo de consultas</button>
      </div>
      <div id="ck-out" style="font-size:12.5px"></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'md');
}
async function ckInvoke(body){
  let r=await sb.functions.invoke('checkid',{body});
  if(r.error){const r2=await sb.functions.invoke('check-id',{body});if(!r2.error)return r2;}
  return r;
}
async function checkidConsulta(id,tipo){
  const w=WORKERS.find(x=>x.id===id);
  const valor=tipo==='rfc'?w.rfc:(tipo==='curp'?w.curp:(w.curp||w.rfc));
  if(!valor){toast(tipo==='nss'?'Para verificar el NSS se consulta con la CURP o RFC y no los tiene capturados.':'El trabajador no tiene '+tipo.toUpperCase()+' capturado.','err');return;}
  $('ck-out').innerHTML='<span class="spin" style="border-color:#ccc;border-top-color:var(--navy)"></span> Consultando CheckID...';
  try{
    const {data,error}=await ckInvoke({tipo,valor});
    if(error)throw error;
    const j=typeof data==='string'?JSON.parse(data):data;
    if(j&&j.exitoso===false)throw new Error((j.codigoError||'')+' '+(j.error||'Consulta no exitosa'));
    const r=(j&&j.resultado)||{};
    const li=[];
    if(r.rfc&&r.rfc.exitoso)li.push(`<b>RFC:</b> ${esc(r.rfc.rfc||'')} · ${esc(r.rfc.razonSocial||'')} · ${r.rfc.valido?'<b style="color:var(--green)">✔ VÁLIDO ANTE SAT</b>':'<b style="color:var(--red)">✘ NO VÁLIDO</b>'}`);
    const reg=(r.regimenFiscal&&r.regimenFiscal.regimenesFiscales)||'';
    if(reg)li.push(`<b>Régimen fiscal:</b> ${/605/.test(reg)?`<b style="color:var(--green)">✔ ${esc(reg)}</b>`:`<b style="color:var(--amber)">${esc(reg)} — no es 605</b>`}`);
    if(r.curp&&r.curp.exitoso)li.push(`<b>CURP:</b> ${esc(r.curp.curp||'')} · ${esc([r.curp.nombres,r.curp.primerApellido,r.curp.segundoApellido].filter(Boolean).join(' '))} · ${esc(r.curp.entidad||'')}`);
    if(r.nss&&r.nss.exitoso){
      const coincide=w.nss&&r.nss.nss===w.nss;
      li.push(`<b>NSS oficial:</b> ${esc(r.nss.nss||'')} ${w.nss?(coincide?'<b style="color:var(--green)">✔ coincide con la base</b>':`<b style="color:var(--red)">⚠ difiere (base: ${esc(w.nss)})</b>`):'<span style="color:var(--mut)">(sin NSS en la base para comparar)</span>'}`);
    }
    if(r.estado69o69B&&r.estado69o69B.exitoso)li.push(r.estado69o69B.conProblema?'<b style="color:var(--red)">⚠ APARECE EN LISTAS 69/69-B DEL SAT — revisar antes de contratar</b>':'<b style="color:var(--green)">✔ Sin problema en listas 69/69-B del SAT</b>');
    // v.9: comparar el NOMBRE de la base contra el oficial (RENAPO por CURP, o SAT).
    let alerta='';
    const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[^A-ZÑ ]/g,'').replace(/\s+/g,' ').trim();
    const baseNom=norm(fullName(w)); // primer_apellido segundo_apellido nombres
    let ofNombres='',ofAp1='',ofAp2='',fuente='';
    if(r.curp&&r.curp.exitoso&&(r.curp.nombres||r.curp.primerApellido)){
      ofNombres=r.curp.nombres||'';ofAp1=r.curp.primerApellido||'';ofAp2=r.curp.segundoApellido||'';fuente='RENAPO';
    }
    if(fuente){
      const ofFull=norm([ofAp1,ofAp2,ofNombres].filter(Boolean).join(' '));
      // coincide si los conjuntos de palabras son iguales (tolera distinto orden apellidos/nombres)
      const setEq=(a,b)=>{const A=a.split(' ').filter(Boolean).sort().join(' '),B=b.split(' ').filter(Boolean).sort().join(' ');return A===B;};
      if(baseNom&&ofFull&&!setEq(baseNom,ofFull)){
        window._CKNOM={id:w.id,nombres:norm(ofNombres),ap1:norm(ofAp1),ap2:norm(ofAp2)};
        alerta=`<div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:8px;padding:11px 13px;margin-bottom:10px;line-height:1.5">
          <b style="color:var(--amber)">⚠ El nombre en la base NO coincide con ${fuente}.</b><br>
          <span style="font-size:12px">En la base: <b>${esc(fullName(w))}</b></span><br>
          <span style="font-size:12px">En ${fuente}: <b>${esc([ofAp1,ofAp2,ofNombres].filter(Boolean).join(' '))}</b></span><br>
          <button class="btn dark" style="margin-top:8px" onclick="actualizarNombreRenapo()">✔ Actualizar el nombre conforme a ${fuente}</button>
        </div>`;
      } else if(baseNom&&ofFull){
        alerta=`<div style="background:var(--green-bg,#e8f5ee);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px"><b style="color:var(--green)">✔ El nombre coincide con ${fuente}.</b></div>`;
      }
    }
    $('ck-out').innerHTML=alerta+`<div style="background:var(--blue-bg);border-radius:8px;padding:12px 14px;line-height:2">${li.join('<br>')||'La consulta no devolvió datos.'}</div>`;
  }catch(e){
    $('ck-out').innerHTML=`<div style="background:var(--amber-bg);border-radius:8px;padding:10px 14px"><b>No se pudo consultar CheckID.</b> ${esc(String(e.message||e)).slice(0,160)}<br><span style="color:var(--mut);font-size:11px">Si aún no despliegas la función, sigue EDGE_FUNCTION_CHECKID.md. Cada consulta gasta 1 solicitud de tu plan.</span></div>`;
  }
}
async function checkidSaldo(){
  try{
    const {data,error}=await ckInvoke({tipo:'saldo'});
    if(error)throw error;
    const j=typeof data==='string'?JSON.parse(data):data;
    toast('Solicitudes CheckID restantes: '+(j&&j.resultado!=null?j.resultado:'?'),'ok');
  }catch(e){toast('No se pudo consultar el saldo: '+String(e.message||e).slice(0,80),'err');}
}
/* v.9: actualiza el nombre del trabajador conforme a RENAPO (tras CheckID).
   Solo escribe apellidos/nombres; no toca CURP, RFC ni nada más. */
async function actualizarNombreRenapo(){
  const n=window._CKNOM; if(!n||!n.id){toast('No hay datos de RENAPO para aplicar.','err');return;}
  const w=WORKERS.find(x=>x.id===n.id);
  if(!confirm(`¿Actualizar el nombre a:\n\n${[n.ap1,n.ap2,n.nombres].filter(Boolean).join(' ')}\n\n(Antes: ${w?fullName(w):''})`))return;
  markWrite();
  const {error}=await sb.from('trabajadores').update({
    primer_apellido:n.ap1||'', segundo_apellido:n.ap2||'', nombres:n.nombres||''
  }).eq('id',n.id);
  if(error){toast('Error al actualizar: '+error.message,'err');return;}
  toast('Nombre actualizado conforme a RENAPO.','ok');
  const {data}=await sb.from('trabajadores').select('*').eq('id',n.id).single();
  if(data){const i=WORKERS.findIndex(x=>x.id===n.id);if(i>=0)WORKERS[i]=data;}
  window._CKNOM=null;
  closeModal();
  if(typeof openDetail==='function')openDetail(n.id);
}

/* ---------- IMPORTAR CFDI TIMBRADOS (XML del PAC / NOI) ---------- */
let CFDIIMP=[];
function openCfdiImport(){
  modal(`
    <div class="m-head"><h2>🧾 Importar CFDI de nómina timbrados (XML)</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px">Sube los XML timbrados que salen de Aspel NOI / tu PAC. La app lee RFC, CURP, UUID, total y periodo de pago, los cruza solo con los trabajadores de este centro y propone la semana correcta. Nada se guarda sin tu confirmación.</p>
      <div class="grid" style="grid-template-columns:180px 1fr;align-items:end;margin-bottom:10px">
        <div><label>Forzar semana (opcional)</label><input id="cf-sem" placeholder="automática"></div>
        <div><input type="file" id="cf-files" accept=".xml" multiple onchange="parseCfdi(this)"></div>
      </div>
      <div id="cf-prev" style="max-height:380px;overflow:auto"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark hide" id="cf-btn" onclick="applyCfdi()">💾 Archivar seleccionados</button>
    </div>`,'lg');
}
async function parseCfdi(inp){
  CFDIIMP=[];
  $('cf-prev').innerHTML=skeletonRows(6,'26px 1.6fr 1.2fr 1fr','Leyendo los CFDI timbrados...');
  const {data:allW,error:werr}=await fetchAllRows(()=>sb.from('trabajadores')
    .select('id,obra_id,rfc,curp,primer_apellido,segundo_apellido,nombres')
    .eq('obra_id',OBRA.id).eq('eliminado',false));
  if(werr){$('cf-prev').innerHTML=`<div class="empty" style="color:var(--red)">No se pudo cargar el padrón: ${esc(werr.message)}</div>`;return;}
  const limpio=x=>String(x||'').toUpperCase().replace(/\s+/g,'');
  for(const file of inp.files){
    try{
      const txt=await file.text();
      const doc=new DOMParser().parseFromString(txt,'application/xml');
      if(doc.getElementsByTagName('parsererror').length)throw new Error('XML mal formado');
      const nodo=n=>Array.from(doc.getElementsByTagName('*')).find(x=>String(x.localName||x.nodeName).split(':').pop()===n);
      const rec=nodo('Receptor'),tfd=nodo('TimbreFiscalDigital'),nom=nodo('Nomina');
      const nomRec=Array.from(doc.getElementsByTagName('*')).find(x=>String(x.localName||x.nodeName).split(':').pop()==='Receptor'&&x.parentNode&&String(x.parentNode.localName||x.parentNode.nodeName).split(':').pop()==='Nomina');
      const comp=doc.documentElement;
      const rfc=limpio(rec?(rec.getAttribute('Rfc')||rec.getAttribute('rfc')):'');
      const curp=limpio(nomRec?(nomRec.getAttribute('Curp')||nomRec.getAttribute('CURP')):'');
      const nombre=(rec?rec.getAttribute('Nombre')||'':'')||'';
      const uuid=limpio(tfd?tfd.getAttribute('UUID'):'');
      const fecha=(comp.getAttribute('Fecha')||'').slice(0,10);
      const total=comp.getAttribute('Total')||'';
      const fechaPago=(nom?(nom.getAttribute('FechaPago')||''):'').slice(0,10);
      const periodoInicio=(nom?(nom.getAttribute('FechaInicialPago')||''):'').slice(0,10);
      const periodoFin=(nom?(nom.getAttribute('FechaFinalPago')||''):'').slice(0,10);
      const baseSem=periodoFin||fechaPago||fecha;
      const semSugerida=baseSem?'S'+isoWeekDe(OBRA,new Date(baseSem+'T12:00')):'';
      const w=(allW||[]).find(x=>limpio(x.rfc)&&limpio(x.rfc)===rfc)||(curp?(allW||[]).find(x=>limpio(x.curp)===curp):null);
      CFDIIMP.push({name:file.name,txt,rfc,curp,nombre,uuid,fecha,total,fechaPago,periodoInicio,periodoFin,semSugerida,w,sel:!!(w&&uuid)});
    }catch(e){CFDIIMP.push({name:file.name,error:String(e).slice(0,60),sel:false});}
  }
  // v31: duplicados — por folio fiscal (UUID) dentro del lote y contra lo ya archivado
  try{
    const vistos={};
    CFDIIMP.filter(x=>!x.error&&x.uuid).forEach(x=>{
      if(vistos[x.uuid]){x.dup='MISMO LOTE: '+vistos[x.uuid];x.sel=false;}
      else vistos[x.uuid]=x.name;
    });
    const uuids=[...new Set(CFDIIMP.filter(x=>!x.error&&!x.dup&&x.w&&x.uuid).map(x=>x.uuid))];
    if(uuids.length){
      const {data}=await fetchAllRows(()=>sb.from('documentos').select('cfdi_uuid,archivo,created_at')
        .eq('obra_id',OBRA.id).eq('anulado',false).in('cfdi_uuid',uuids));
      (data||[]).forEach(d=>{
        const x=CFDIIMP.find(z=>z.w&&z.uuid&&(z.uuid===d.cfdi_uuid||`${z.w.id}/CFDI_NOMINA/${z.uuid}.xml`===d.archivo));
        if(x&&!x.dup){x.dup=`YA ARCHIVADO (${fmtD(d.created_at)})`;x.sel=false;}
      });
    }
  }catch(e){/* la detección nunca bloquea la importación */}
  if(!CFDIIMP.length){$('cf-prev').innerHTML='<div class="empty">No se leyeron XML.</div>';return;}
  $('cf-prev').innerHTML=`
    <div class="imp-row head" style="grid-template-columns:26px 1.4fr 1.2fr 1fr .8fr"><span></span><span>Archivo / UUID</span><span>Receptor</span><span>Trabajador</span><span>Total</span></div>
    ${CFDIIMP.map((x,i)=>x.error
      ?`<div class="imp-row" style="grid-template-columns:26px 3fr 1fr"><span></span><span>${esc(x.name)} — <span style="color:var(--red)">${esc(x.error)}</span></span><span class="imp-tag imp-SINREGISTRO">ERROR</span></div>`
      :`<div class="imp-row" style="grid-template-columns:26px 1.4fr 1.2fr 1fr .8fr${x.dup?';background:var(--amber-bg)':''}">
        <span><input type="checkbox" style="width:auto" ${x.sel?'checked':''} onchange="CFDIIMP[${i}].sel=this.checked"></span>
        <span>${esc(x.name)}<br><span style="color:var(--mut);font-size:10.5px">${esc(x.uuid)||'SIN UUID (¿no timbrado?)'}</span>${x.dup?`<br><span style="color:var(--amber);font-size:11px;font-weight:700">⚠ DUPLICADO: ${esc(x.dup)}</span>`:''}</span>
        <span>${esc(x.nombre)}<br><span style="color:var(--mut);font-size:11px">${esc(x.rfc)}${x.curp?' · '+esc(x.curp):''}</span></span>
        <span class="imp-tag ${x.dup?'imp-SINREGISTRO':x.w?'imp-ASIGNAR':'imp-SINREGISTRO'}">${x.dup?'DUPLICADO':x.w?esc([x.w.primer_apellido,x.w.nombres].join(' ')).slice(0,22):'RFC NO ENCONTRADO'}</span>
        <span>$${esc(x.total)}<br><span style="color:var(--mut);font-size:10.5px">${esc(x.semSugerida||'semana no detectada')} · ${esc(x.periodoInicio||x.fecha)}${x.periodoFin?' a '+esc(x.periodoFin):''}</span></span>
      </div>`).join('')}
    ${CFDIIMP.some(x=>x.dup)?'<div class="fhint" style="margin-top:8px">Los marcados como DUPLICADO tienen el mismo folio fiscal (UUID) que uno ya archivado y vienen desmarcados.</div>':''}`;
  $('cf-btn').classList.remove('hide');
}
async function applyCfdi(){
  const sel=CFDIIMP.filter(x=>x.sel&&x.w&&x.uuid);
  if(!sel.length){toast('No hay CFDI válidos seleccionados (requieren UUID y RFC que exista en la base).','err');return;}
  if(!confirm(`¿Archivar ${sel.length} CFDI timbrado(s) en los expedientes?`))return;
  $('cf-btn').innerHTML='<span class="spin"></span> Archivando...';
  markWrite();
  const semManual=normSem($('cf-sem').value);
  let ok=0,fail=0;
  for(const x of sel){
    const sem='S'+(semManual||normSem(x.semSugerida)||normSem(semObra()));
    const path=`${x.w.id}/CFDI_NOMINA/${x.uuid}.xml`;
    const {error:e1}=await sb.storage.from('expedientes').upload(path,new Blob([x.txt],{type:'application/xml'}),{upsert:true});
    if(e1){fail++;continue;}
    const fila={trabajador_id:x.w.id,obra_id:x.w.obra_id,categoria:'CFDI_NOMINA',
      subtipo:'CFDI TIMBRADO',semana:sem,fecha_doc:x.fechaPago||x.fecha||null,archivo:path,nombre_archivo:`${x.uuid}.xml ($${x.total})`,subido_por:USER.email,
      cfdi_uuid:x.uuid,cfdi_total:Number(x.total)||null,cfdi_fecha_pago:x.fechaPago||null,periodo_inicio:x.periodoInicio||null,periodo_fin:x.periodoFin||null,mime_type:'application/xml',
      hash:await sha256Hex(new TextEncoder().encode(x.txt))};
    let {error:e2}=await sb.from('documentos').insert(fila);
    if(e2&&/hash/i.test(e2.message||'')){delete fila.hash;({error:e2}=await sb.from('documentos').insert(fila));}
    if(e2){fail++;continue;}
    ok++;
  }
  closeModal();
  toast(`CFDI archivados: ${ok}${fail?`, ${fail} con error`:''}. Quedan ligados por folio fiscal en cada expediente.`,fail?'err':'ok');
  await loadObraData(OBRA.id);
}
function toggleMenu(id){
  document.querySelectorAll('.menu.open').forEach(m=>{if(m.id!==id)m.classList.remove('open');});
  $(id).classList.toggle('open');
}
document.addEventListener('click',e=>{if(!e.target.closest('.menu'))document.querySelectorAll('.menu.open').forEach(m=>m.classList.remove('open'));});


