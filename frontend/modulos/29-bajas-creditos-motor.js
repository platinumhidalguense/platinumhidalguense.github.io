/* --- NUEVA OBRA --- */
function openNuevaObra(){
  if(!esAdmin()){toast('Solo el administrador puede crear centros de trabajo.','err');return;}
  modal(`
    <div class="m-head"><h2>➕ Nueva obra / centro de trabajo</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="c2" style="grid-column:span 2"><label>Nombre *</label><input id="no-nombre" placeholder="OBRA BIENESTAR TIZAYUCA"></div>
        <div class="c2" style="grid-column:span 2"><label>Ubicación</label><input id="no-ubic"></div>
        <div><label>Empresa propietaria</label><select id="no-empresa">${Object.values(EMPRESAS).map(e=>`<option value="${e.codigo}" ${EMPRESA_ACTIVA===e.codigo?'selected':''}>${esc(e.nombre)}</option>`).join('')}</select></div>
        <div><label>Tipo</label><select id="no-tipo"><option>OBRA</option><option>OFICINA</option></select></div>
        <div><label>Registro patronal IMSS</label><input id="no-rp"></div>
        <div><label>Registro SIROC</label><input id="no-siroc"></div>
        <div><label>Prima de riesgo (%)</label><input id="no-prima" type="number" step="0.00001" placeholder="7.58875"></div>
      </div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
    <button class="btn dark" onclick="saveNuevaObra()">💾 Crear obra</button></div>`,'md');
}
async function saveNuevaObra(){
  if(!esAdmin()){toast('Solo el administrador puede crear centros de trabajo.','err');return;}
  const n=$('no-nombre').value.trim().toUpperCase();
  if(!n){toast('Ponle nombre a la obra.','err');return;}
  const empresa=$('no-empresa').value;
  markWrite();
  const {data:creada,error}=await sb.from('obras').insert({nombre:n,ubicacion:$('no-ubic').value.trim().toUpperCase(),empresa_codigo:empresa,tipo:$('no-tipo').value,
    registro_patronal:$('no-rp').value.trim().toUpperCase(),registro_siroc:$('no-siroc').value.trim().toUpperCase(),
    prima_rt:$('no-prima').value?parseFloat($('no-prima').value):null,orden:OBRAS.length+1}).select().single();
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast('Obra creada.','ok');
  const {data}=await sb.from('obras').select('*').order('orden');
  OBRAS=data||OBRAS;EMPRESA_ACTIVA=empresa;
  if(creada)await selectObra(creada.id);else renderObraBar();
}
/* --- VERIFICADOR DE NÚMEROS VS REPORTE NOI (PDF) --- */
function openVerificadorNOI(){
  modal(`
    <div class="m-head"><h2>🔢 Verificar números vs reporte de nómina NOI</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Sube el PDF "Reporte de la nómina" de NOI (acepta <b>clásico</b>, <b>moderno semanal</b> y <b>moderno quincenal</b> de oficina). Leo cada trabajador (clave, NSS, RFC, CURP, <b>SD, SDI</b> y el neto <b>quincenal/semanal</b>) y lo cruzo contra la base: te muestro las diferencias y eliges cuáles aplicar. Nada se modifica sin tu confirmación.</p>
      <input type="file" id="vn-file" accept=".pdf" onchange="verificarNOI(this)">
      <div id="vn-out" style="margin-top:14px;max-height:420px;overflow:auto"></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'lg');
}
async function verificarNOI(inp){
  window._VN=[];
  const file=inp.files[0]; if(!file)return;
  $('vn-out').innerHTML=skeletonRows(8,'1.5fr 1fr 1fr 1fr','Leyendo el reporte de NOI y cruzando contra la base...');
  try{
    const buf=await file.arrayBuffer();
    const doc=await pdfjsLib.getDocument({data:buf}).promise;
    let txt='';
    for(let p=1;p<=doc.numPages;p++){const tc=await(await doc.getPage(p)).getTextContent();txt+=tc.items.map(i=>i.str).join(' ')+' \n';}
    // Acepta AMBOS formatos del reporte NOI y se queda con lo que encuentre cada uno:
    //  · CLÁSICO: clave 7.00 … NSS(11) RFC CURP SD (ese orden).
    //  · MODERNO: clave NOMBRE … RFC CURP … SD(diario) NSS(11) fecha_alta.
    // Se corren los dos y se unen por CURP (un PDF es de un solo formato, así que
    // no chocan). El clásico queda EXACTO como estaba: solo se AGREGA el moderno.
    // Se corren TRES lectores y se unen por CURP (cada PDF es de un solo formato):
    //  · CLÁSICO: clave 7.00 … NSS(11) RFC CURP SD.
    //  · MODERNO (semanal): clave NOMBRE … RFC CURP fecha NSS SD SDI.
    //  · MODERNO 2 (quincenal, oficina): clave días … NSS RFC CURP SD fecha …
    //    Completa … NOMBRE SDI 8. Trae SDI y el NETO (quincenal si la quincena
    //    está completa). pdf.js revuelve columnas: patrón deducido del texto real.
    const nnum=s=>parseFloat(String(s).replace(/,/g,''));
    const rxClasico=/(\d{1,4})\s+7\.00[\s\S]{0,220}?(\d{11})\s+([A-ZÑ&]{4}\d{6}[A-Z0-9]{2,3})\s+([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\s+([\d,]+\.\d{2})/g;
    const rxModerno=/(\d{1,5})\s+[^\d\n]{3,60}?\s+([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\s+([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\s+\d{2}\/\d{2}\/\d{4}\s+(\d{10,11})\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?/g;
    const rxModerno2=/(\d{1,5})\s+([\d.,]+)\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)\s+(?:[\d.,]+\s+){5}(\d{10,11})\s+([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3})\s+([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\s+([\d,]+\.\d{2})\s+\d{2}\/\d{2}\/\d{4}[\s\S]{0,40}?Completa\s+[\d.,]+\s+[\d.,]+\s+[A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ ]+?\s+([\d,]+(?:\.\d+)?)\s+[\d,]+(?:\.\d+)?\s+8\b/g;
    const porCurp=new Map();let m;
    while((m=rxClasico.exec(txt))!==null){const e={clave:parseInt(m[1]),nss:m[2],rfc:m[3],curp:m[4],sd:nnum(m[5]),sdi:null,quincenal:null};if(!porCurp.has(e.curp))porCurp.set(e.curp,e);}
    while((m=rxModerno.exec(txt))!==null){const e={clave:parseInt(m[1]),rfc:m[2],curp:m[3],nss:m[4],sd:nnum(m[5]),sdi:m[6]?nnum(m[6]):null,quincenal:null};if(!porCurp.has(e.curp))porCurp.set(e.curp,e);}
    while((m=rxModerno2.exec(txt))!==null){const dias=nnum(m[2]),neto=nnum(m[3]);const e={clave:parseInt(m[1]),nss:m[4],rfc:m[5],curp:m[6],sd:nnum(m[7]),sdi:nnum(m[8]),quincenal:(dias>=15?neto:null)};if(!porCurp.has(e.curp))porCurp.set(e.curp,e);}
    const encontrados=[...porCurp.values()];
    if(!encontrados.length){$('vn-out').innerHTML='<div class="empty">No pude extraer trabajadores del PDF (¿es el "Reporte de la nómina" de NOI, clásico o moderno?).</div>';return;}
    const {data:allW,error:padronError}=await leerPorEmpresa('trabajadores','id,obra_id,no_trab,nss,curp,rfc,sd,sdi,sal_semanal,periodo_pago,primer_apellido,segundo_apellido,nombres,estatus',q=>q.eq('eliminado',false));
    if(padronError){toast('No se pudo comparar NOI: '+padronError.message,'err');return;}
    const difs=[];let ok=0;
    encontrados.forEach(e=>{
      const w=(allW||[]).find(x=>x.curp===e.curp)||(allW||[]).find(x=>x.nss===e.nss);
      if(!w){difs.push({e,tipo:'NO ESTÁ EN LA BASE',det:''});return;}
      const d=[];let numDif=false,sdDif=false,sdiDif=false,quinDif=false;
      if((w.no_trab??null)!==e.clave){d.push(`número: base #${w.no_trab??'—'} vs NOI #${e.clave}`);numDif=true;}
      if(w.nss!==e.nss)d.push(`NSS: base ${w.nss||'—'} vs NOI ${e.nss}`);
      if(Math.abs((Number(w.sd)||0)-e.sd)>0.01){d.push(`SD: base $${money(w.sd)} vs NOI $${money(e.sd)}`);sdDif=true;}
      if(e.sdi!=null&&Number(w.sdi)!==Number(e.sdi)
        &&((String(e.sdi).split('.')[1]||'').length>2||(String(w.sdi).split('.')[1]||'').length<=2||Math.abs(Number(w.sdi)-Number(e.sdi))>.01)){
        d.push(`SDI: base $${esc(w.sdi??'—')} vs NOI $${esc(e.sdi)}`);sdiDif=true;
      }
      if(e.quincenal!=null&&Math.abs((Number(w.sal_semanal)||0)-e.quincenal)>0.01){d.push(`${(w.periodo_pago==='QUINCENAL'?'quincenal':'sueldo')}: base $${money(w.sal_semanal)} vs NOI $${money(e.quincenal)}`);quinDif=true;}
      if(d.length)difs.push({e,w,tipo:'DIFERENCIA',det:d.join(' · '),numDif,sdDif,sdiDif,quinDif}); else ok++;
    });
    // números NOI no usados y duplicados en base
    $('vn-out').innerHTML=`
      <div class="stats" style="margin-bottom:10px">
        <div class="stat g"><div class="n">${ok}</div><div class="l">Coinciden al 100%</div></div>
        <div class="stat r"><div class="n">${difs.length}</div><div class="l">Con diferencias</div></div>
        <div class="stat b"><div class="n">${encontrados.length}</div><div class="l">Leídos del NOI</div></div>
      </div>
      ${difs.map((d,i)=>`<div class="hist-item"><div class="hist-top"><span class="badge ${d.tipo==='DIFERENCIA'?'PENDIENTE':'BAJA'}">${d.tipo}</span>
        <span class="who">${esc(d.w?fullName(d.w):('CURP '+d.e.curp))} · NOI #${d.e.clave}</span></div>
        <div style="font-size:12.5px;color:var(--txt)">${esc(d.det)||'Alta en NOI pero sin registro en la base'}</div>
        ${d.w?`<div style="margin-top:5px;font-size:12px;display:flex;flex-wrap:wrap;gap:6px 14px">
          ${d.numDif?`<label><input type="checkbox" id="vn-n-${i}" checked> ✔ número NOI <b>#${d.e.clave}</b></label>`:''}
          ${d.sdDif?`<label><input type="checkbox" id="vn-s-${i}" checked> ✔ SD NOI <b>$${money(d.e.sd)}</b></label>`:''}
          ${d.sdiDif?`<label><input type="checkbox" id="vn-sdi-${i}" checked> ✔ SDI NOI <b>$${esc(d.e.sdi)}</b></label>`:''}
          ${d.quinDif?`<label><input type="checkbox" id="vn-q-${i}" checked> ✔ ${d.w.periodo_pago==='QUINCENAL'?'quincenal':'sueldo'} NOI <b>$${money(d.e.quincenal)}</b></label>`:''}
        </div>`:''}</div>`).join('')||'<div class="empty">✔ Todo cuadra con NOI.</div>'}
      ${difs.some(d=>d.w&&(d.numDif||d.sdDif||d.sdiDif||d.quinDif))?`<div style="margin-top:12px">
        <button class="btn dark" onclick="aplicarVN()">💾 Aplicar a la base los cambios marcados</button>
        <div class="fhint" style="margin-top:6px">Los números se cambian en dos fases (se liberan y se reasignan) respetando el candado anti-duplicados; si un número lo tiene alguien que no está en la lista, se omite y se te avisa. El NSS nunca se cambia automático. Todo queda en el historial.</div>
      </div>`:''}`;
    window._VN=difs;
  }catch(e){$('vn-out').innerHTML='<div class="empty">Error al leer: '+esc(String(e.message||e))+'</div>';}
}
/* --- ASISTENTE SALARIO MÍNIMO CONASAMI --- */
function smAssist(extra){
  const f=FISC();
  const sd=Math.round((f.sm+extra)*100)/100;
  $('f-sd').value=sd;
  $('f-sdi').value=sdiInicialSugerido(sd);
  let nn;try{nn=sueldoNetoPeriodo(sd,$('f-sdi').value,trabajadorNominaFormulario());}catch(e){$('h-sd').textContent=e.message;return;}
  if(!$('f-sal_semanal').value)$('f-sal_semanal').value=nn.neto.toFixed(2);
  $('h-sd').innerHTML=`<b>SD = mínimo CONASAMI 2026 ($${f.sm}) + $${extra}</b> (DOF 09/12/2025) · <b>${nn.periodo.toLowerCase()} NETO estimado $${money(nn.neto)}</b> (bruto − ISR/subsidio − IMSS, con su motor correspondiente).`;
}

/* --- BAJAS CON MOTIVO LEGAL Y DOCUMENTO SEGÚN MOTIVO --- */
const MOTIVOS_BAJA=['RENUNCIA VOLUNTARIA','TERMINO DE CONTRATO U OBRA','MUTUO ACUERDO','ABANDONO DE TRABAJO','DESPIDO JUSTIFICADO (ART. 47 LFT)','DEFUNCION','OTRO'];
function altaBajaMismaSemana(w,fechaBaja){
  if(!w?.fecha_alta||!fechaBaja||fechaBaja<w.fecha_alta||!OBRA||w.obra_id!==OBRA.id)return false;
  const sem=isoWeekDe(OBRA,new Date(fechaBaja+'T12:00'));
  if(sem<1||sem>53)return false;
  const [inicio,fin]=semRange(sem);
  return w.fecha_alta>=inicio&&w.fecha_alta<=fin;
}
function bajaCortaPreview(id){
  const w=WORKERS.find(x=>x.id===id),el=$('b-corta-alert');if(!el)return;
  const fecha=$('b-fecha')?.value||'';
  el.style.display=altaBajaMismaSemana(w,fecha)?'block':'none';
}
function openBaja(id){
  const w=WORKERS.find(x=>x.id===id);
  modal(`
    <div class="m-head"><h2>Dar de baja · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="margin-bottom:14px;color:var(--mut)">El registro <b>no se elimina</b>: cambia a BAJA con su motivo legal y se genera el documento que corresponde (renuncia, convenio de terminación o aviso de rescisión).</p>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Fecha de baja *</label><input id="b-fecha" type="date" value="${today()}" oninput="bajaCortaPreview('${id}')"></div>
        <div><label>Motivo (define el documento) *</label><select id="b-motivo-cat">${MOTIVOS_BAJA.map(m=>`<option>${m}</option>`).join('')}</select></div>
        <div><label>Monto finiquito ($)</label><input id="b-finiquito" type="number" step="0.01" placeholder="0.00" oninput="$('b-chq-wrap').style.opacity=this.value>0?1:.45"></div>
        <div><label>Detalle / observación</label><input id="b-motivo" placeholder="Detalle adicional (opcional)"></div>
      </div>
      <div id="b-corta-alert" class="fhint" style="display:none;margin-top:12px;color:var(--amber)">⚠ El alta y la baja corresponden a la misma semana de esta obra. Al confirmar, el caso aparecerá automáticamente en <b>Centro de control → Altas y bajas sin servicio</b>, con estado <b>PENDIENTE de verificar</b>. No se asumirá que no trabajó: revisa horas, acuses IDSE y NOI antes de confirmar esa clasificación.</div>
      <div id="b-chq-wrap" style="margin-top:14px;background:var(--amber-bg);border-radius:8px;padding:12px 14px;opacity:.45">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:13px;color:var(--txt)">
          <input type="checkbox" id="b-cheque" checked style="width:auto">
          Registrar el finiquito como <b>CHEQUE PENDIENTE</b> en la sección de cheques
        </label>
      </div>
      <p style="margin-top:10px;font-size:11.5px;color:var(--mut)">Renuncia → carta de renuncia + recibo · Término de contrato/obra o mutuo acuerdo → convenio de terminación (art. 53 LFT) + recibo · Despido justificado → aviso de rescisión (art. 47: entregar por escrito o dar aviso al Tribunal en 5 días) · Abandono → acta de hechos · Defunción → pago a beneficiarios (art. 115).</p>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn danger" id="baja-btn" onclick="doBaja('${id}')">Confirmar BAJA</button>
    </div>`,'md');
  bajaCortaPreview(id);
}
async function doBaja(id){
  const f=$('b-fecha').value; if(!f){toast('Indica la fecha de baja.','err');return;}
  const cat=$('b-motivo-cat').value;
  const w=WORKERS.find(x=>x.id===id);
  const corta=altaBajaMismaSemana(w,f);
  if(!confirm(corta
    ?`¿Confirmas la BAJA por ${cat}?\n\nAlta y baja en la misma semana: se abrirá automáticamente un caso PENDIENTE en el Centro de control. Solo después de verificar que no hubo trabajo efectivo se podrá marcar «sin servicio confirmado».`
    :'¿Confirmas la BAJA por '+cat+'?'))return;
  const fin=$('b-finiquito').value?parseFloat($('b-finiquito').value):null;
  const validacionSeparacion=globalThis._PR_AUDIT&&globalThis._PR_AUDIT.trabajador_id===id&&globalThis._PR_AUDIT.entradas&&globalThis._PR_AUDIT.entradas.separacion_legal?globalThis._PR_AUDIT:null;
  if(validacionSeparacion&&(!esAdmin()||w.estatus==='BAJA'||validacionSeparacion.requiere_revision_legal||validacionSeparacion.periodo!==f||cat!==prMotivoSeparacion(validacionSeparacion.entradas.escenario_separacion)||!$('b-motivo').value.trim().toUpperCase().startsWith('SEPARACION LFT ['+validacionSeparacion.entradas.escenario_separacion+']')||!Number.isFinite(fin)||redondearCentavos(fin)!==validacionSeparacion.monto_aplicado)){
    toast('La separación validada cambió o ya existe una baja. Recalcula y concilia con NOI antes de aplicarla.','err');return;
  }
  const det=$('b-motivo').value.trim().toUpperCase();
  const conCheque=$('b-cheque').checked&&fin>0;
  const obs=((w.observaciones?w.observaciones+' | ':'')+'BAJA: '+cat+(det?' — '+det:''));
  markWrite();
  const {error}=await sb.from('trabajadores').update({estatus:'BAJA',fecha_baja:f,monto_finiquito:fin,motivo_baja:cat,observaciones:obs}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  if(conCheque){
    const semBaja=isoWeek(new Date(f+'T12:00'));
    await sb.from('cheques').insert({obra_id:w.obra_id,trabajador_id:w.id,no_trab:w.no_trab,contratista:w.contratista,
      nombre:fullName(w),puesto:w.puesto,curp:w.curp,semana:'S'+semBaja,
      periodo:periodoCorto(semBaja),importe:fin,tipo_pago:'FINIQUITO',estatus:'PENDIENTE',observaciones:cat,creado_por:USER.email});
  }
  const previo=globalThis._PR_AUDIT&&globalThis._PR_AUDIT.trabajador_id===id?globalThis._PR_AUDIT:null;
  const modelo=previo?previo.monto_modelo:null,aplicado=fin==null?0:redondearCentavos(fin);
  await registrarBitacoraNomina([previo?{...previo,tipo_calculo:'FINIQUITO_APLICADO',periodo:f,monto_aplicado:aplicado,
    ajuste_noi:modelo==null?null:redondearCentavos(aplicado-modelo),resultado:{...previo.resultado,monto_aplicado:aplicado,motivo_baja:cat,cheque_pendiente:conCheque}}
    :{obra_id:w.obra_id,empresa_codigo:empresaDeTrabajador(w),trabajador_id:w.id,trabajador_numero:w.no_trab,trabajador_nombre:fullName(w),
      tipo_calculo:'FINIQUITO_APLICADO',periodo:f,entradas:{origen:'captura_directa',motivo_baja:cat},resultado:{monto_aplicado:aplicado,cheque_pendiente:conCheque},
      monto_modelo:null,monto_aplicado:aplicado,ajuste_noi:null}],{silencioso:false});
  globalThis._PR_AUDIT=null;
  closeModal();toast('Baja por '+cat+' registrada. Generando documento...','ok');
  await loadObraData(OBRA.id);refreshCounts();
  setTimeout(()=>generarBajaDoc(id),400);
}
function generarBajaDoc(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const cat=w.motivo_baja||'RENUNCIA VOLUNTARIA';
  if(cat==='OTRO'&&/SEPARACION LFT \[(SI|ART50)\]/.test(w.observaciones||'')){
    toast('Separación con indemnización: prepara el convenio revisado jurídicamente. No se genera una renuncia ni un término de obra para este supuesto.','ok');return;
  }
  if(cat==='RENUNCIA VOLUNTARIA')return openRenuncia(id);
  if(cat==='DESPIDO JUSTIFICADO (ART. 47 LFT)')return openRescision(id);
  if(cat==='ABANDONO DE TRABAJO')return openActaForm ? openActaAbandono(id) : null;
  if(cat==='DEFUNCION')return openDefuncion(id);
  return openConvenio(id); // TERMINO DE CONTRATO U OBRA, MUTUO ACUERDO, OTRO
}
/* v.4: generar el DOCUMENTO de separación aunque el trabajador siga ACTIVO
   (renuncia + recibo, convenio, aviso de rescisión, acta de abandono, defunción)
   SIN darlo de baja ni tocar la base. Útil para imprimirlo y recabar firma antes
   de procesar la baja. Parchea los datos en memoria solo para armar el documento
   y los restaura enseguida. Si además se quiere registrar la baja, se usa "Dar de
   BAJA". */
function openSeparacionDoc(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  modal(`
    <div class="m-head"><h2>📄 Documento de separación · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px">Genera el documento (renuncia + recibo de finiquito, convenio, aviso de rescisión, acta de abandono o pago a beneficiarios) <b>sin dar de baja</b> al trabajador — queda ACTIVO. Ideal para imprimirlo y recabar la firma antes de procesar la baja. Cuando ya vayas a formalizarla, usa <b>“Dar de BAJA”</b>.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Fecha de separación *</label><input id="sd-fecha" type="date" value="${today()}"></div>
        <div><label>Motivo (define el documento) *</label><select id="sd-motivo">${MOTIVOS_BAJA.map(m=>`<option ${m===(w.motivo_baja||'')?'selected':''}>${m}</option>`).join('')}</select></div>
        <div><label>Monto finiquito ($)</label><input id="sd-fin" type="number" step="0.01" value="${w.monto_finiquito??''}" placeholder="usa 🧮 Prestaciones para calcularlo"></div>
        <div><label>Detalle / observación</label><input id="sd-det" placeholder="opcional"></div>
      </div>
      <p style="margin-top:10px;font-size:11.5px;color:var(--mut)">Renuncia → carta de renuncia + recibo · Término de contrato/obra o mutuo acuerdo → convenio de terminación (art. 53 LFT) + recibo · Despido justificado → aviso de rescisión (art. 47) · Abandono → acta de hechos · Defunción → pago a beneficiarios (art. 115). <b>No cambia el estatus del trabajador.</b></p>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark" onclick="generarSeparacionDoc('${id}')">📄 Generar documento</button>
    </div>`,'md');
}
function generarSeparacionDoc(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const f=$('sd-fecha').value||today();
  const cat=$('sd-motivo').value;
  const fin=$('sd-fin').value?parseFloat($('sd-fin').value):null;
  const det=$('sd-det').value.trim().toUpperCase();
  // parche EN MEMORIA (no se guarda; no cambia el estatus). Se restaura enseguida.
  const bak={fecha_baja:w.fecha_baja,monto_finiquito:w.monto_finiquito,motivo_baja:w.motivo_baja,observaciones:w.observaciones};
  w.fecha_baja=f; w.monto_finiquito=fin; w.motivo_baja=cat;
  if(det)w.observaciones=(w.observaciones?w.observaciones+' | ':'')+'SEPARACION (borrador): '+cat+' — '+det;
  closeModal();
  try{ generarBajaDoc(id); }         // los generadores leen w.* de forma síncrona
  finally{ Object.assign(w,bak); }   // restaura los valores originales de inmediato
  toast('Documento generado (borrador, sin baja). El trabajador sigue ACTIVO.','ok');
}
function bajaDocBase(w){
  const cc=cartaCfg();
  const e=CFGEMP['empresa_'+empresaDeTrabajador(w)]||{razon:'COMERCIALIZADORA PLATINUM HIDALGUENSE'};
  const fmtL=d=>{const x=new Date((d||today())+'T12:00');return `${x.getDate()} de ${MES[x.getMonth()].toLowerCase()} de ${x.getFullYear()}`;};
  return {cc,e,fmtL,EMP:`&ldquo;<b>${esc(e.razon)}</b>&rdquo; ${esc(cc.sufijo)}`};
}
function docWin(html,titulo){
  const win=window.open('','_blank');
  if(!win){toast('Permite ventanas emergentes.','err');return;}
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
  <style>body{font-family:'Times New Roman',serif;font-size:13px;line-height:1.7;color:#111;max-width:700px;margin:40px auto;padding:0 34px;text-align:justify}
  h1{font-size:15px;text-align:center;letter-spacing:1px}
  .fecha{text-align:right;margin:18px 0}
  .firmas{display:flex;justify-content:space-between;gap:26px;margin-top:80px;text-align:center}
  .firmas div{flex:1;border-top:1px solid #111;padding-top:6px;font-size:11px}
  @media print{body{margin:10mm auto}}</style></head><body>${html}
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  win.document.close();
}
function openConvenio(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const {cc,fmtL,EMP}=bajaDocBase(w);
  const monto=Number(w.monto_finiquito)||0;
  docWin(`
  <h1>CONVENIO DE TERMINACIÓN DE LA RELACIÓN DE TRABAJO</h1>
  <div class="fecha">${esc(cc.lugar)}, a ${fmtL(w.fecha_baja)}</div>
  <p>Convenio que celebran ${EMP} ("EL PATRÓN") y <b>${esc(fullName(w))}</b> ("EL TRABAJADOR"), quien prestó servicios como <b>${esc(w.puesto||'TRABAJADOR')}</b> desde el ${fmtL(w.fecha_alta)}, para dar por <b>terminada la relación de trabajo por ${esc((w.motivo_baja==='MUTUO ACUERDO')?'mutuo consentimiento':'conclusión de la obra o etapa para la cual fue contratado')}</b>, con fundamento en el artículo 53 fracción${w.motivo_baja==='MUTUO ACUERDO'?' I':' III'} de la Ley Federal del Trabajo, a partir del ${fmtL(w.fecha_baja)}.</p>
  <p>"EL TRABAJADOR" recibe en este acto la cantidad de <b>$${money(monto)} (${numLetras(monto)})</b> por concepto de finiquito, que comprende las partes proporcionales de aguinaldo, vacaciones, prima vacacional y demás prestaciones devengadas, manifestando que no se le adeuda cantidad alguna por salario, tiempo extraordinario ni prestación legal o contractual, por lo que otorga a "EL PATRÓN" el más amplio finiquito que en derecho proceda, sin reservarse acción ni derecho alguno que ejercitar.</p>
  <p>Leído el presente y enteradas las partes de su contenido, lo firman por duplicado.</p>
  <div class="firmas"><div><b>"EL PATRÓN"</b><br><br>${esc((CFGEMP['empresa_PLATINUM']||{}).representante||'')}</div><div><b>"EL TRABAJADOR"</b><br><br>${esc(fullName(w))}<br>FIRMA Y HUELLA</div></div>
  <div class="firmas"><div><b>TESTIGO</b></div><div><b>TESTIGO</b></div></div>`,'Convenio '+fullName(w));
}
function openRescision(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const {cc,fmtL,EMP}=bajaDocBase(w);
  docWin(`
  <h1>AVISO DE RESCISIÓN DE LA RELACIÓN DE TRABAJO<br>(ARTÍCULO 47 DE LA LEY FEDERAL DEL TRABAJO)</h1>
  <div class="fecha">${esc(cc.lugar)}, a ${fmtL(w.fecha_baja)}</div>
  <p><b>C. ${esc(fullName(w))}</b><br>Trabajador con puesto de ${esc(w.puesto||'')}<br>P R E S E N T E</p>
  <p>Por este conducto, ${EMP} le comunica que con fecha <b>${fmtL(w.fecha_baja)}</b> se rescinde la relación de trabajo <b>sin responsabilidad para el patrón</b>, con fundamento en el artículo 47 de la Ley Federal del Trabajo, por la(s) siguiente(s) causa(s):</p>
  <p style="border:1px solid #999;border-radius:4px;padding:10px;min-height:70px"><b>CONDUCTA(S) Y FECHA(S) EN QUE SE INCURRIÓ:</b><br>${esc((w.observaciones||'').split('BAJA:').pop()||'')}&nbsp;</p>
  <p>Se le hace saber que las prestaciones devengadas (partes proporcionales de aguinaldo, vacaciones y prima vacacional) están a su disposición. El presente aviso se le entrega personalmente en términos del artículo 47; en caso de negativa a recibirlo, el patrón lo hará del conocimiento del Tribunal competente dentro de los cinco días hábiles siguientes, proporcionando su último domicilio registrado.</p>
  <div class="firmas"><div><b>POR LA EMPRESA</b></div><div><b>RECIBÍ ORIGINAL — EL TRABAJADOR</b><br><br>${esc(fullName(w))}<br>FECHA Y HORA: ________________</div></div>
  <div class="firmas"><div><b>TESTIGO</b></div><div><b>TESTIGO</b></div></div>`,'Rescisión '+fullName(w));
}
function openActaAbandono(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const {cc,fmtL,EMP}=bajaDocBase(w);
  docWin(`
  <h1>ACTA ADMINISTRATIVA DE HECHOS — ABANDONO DE TRABAJO</h1>
  <div class="fecha">${esc(cc.lugar)}, a ${fmtL(w.fecha_baja)}</div>
  <p>En las instalaciones de ${esc(OBRA.nombre)}, de ${EMP}, se hace constar que el trabajador <b>${esc(fullName(w))}</b> (${esc(w.puesto||'')}, NSS ${esc(w.nss||'—')}) dejó de presentarse a laborar sin causa justificada ni aviso, configurando faltas de asistencia injustificadas en términos del artículo 47 fracción X de la Ley Federal del Trabajo.</p>
  <p><b>DÍAS DE INASISTENCIA:</b> _______________________________________________</p>
  <p>Se levantó la presente ante dos testigos para los efectos legales conducentes, quedando a disposición del trabajador sus prestaciones devengadas.</p>
  <div class="firmas"><div><b>POR LA EMPRESA</b></div><div><b>TESTIGO</b></div><div><b>TESTIGO</b></div></div>`,'Abandono '+fullName(w));
}
function openDefuncion(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  const {cc,fmtL,EMP}=bajaDocBase(w);
  const monto=Number(w.monto_finiquito)||0;
  docWin(`
  <h1>CONSTANCIA DE PRESTACIONES A FAVOR DE BENEFICIARIOS<br>(ARTÍCULO 115 DE LA LEY FEDERAL DEL TRABAJO)</h1>
  <div class="fecha">${esc(cc.lugar)}, a ${fmtL(w.fecha_baja)}</div>
  <p>${EMP} hace constar el sensible fallecimiento del trabajador <b>${esc(fullName(w))}</b> (${esc(w.puesto||'')}), con fecha ${fmtL(w.fecha_baja)}, y que las prestaciones devengadas y no cobradas ascienden a <b>$${money(monto)} (${numLetras(monto)})</b>.</p>
  <p>Conforme al artículo 115 de la LFT, dichas cantidades se entregarán a los beneficiarios designados${w.beneficiario?` — designación registrada: <b>${esc(w.beneficiario)}</b> —`:''} previa declaración del Tribunal competente. Documento informativo para el trámite correspondiente.</p>
  <div class="firmas"><div><b>POR LA EMPRESA</b></div><div><b>RECIBÍ (BENEFICIARIO)</b></div></div>`,'Defunción '+fullName(w));
}
/* ---------- RECÁLCULO BIMESTRAL DEL INFONAVIT (2026-09-01) -------------
   El cálculo y la aplicación viven en la base (Script 63): un cron corre
   el día 1 de cada bimestre y actualiza las retenciones solo. Aquí NO se
   recalcula nada — solo se lee la bitácora para poder decir cuándo fue la
   última vez, que es lo único que Recursos Humanos necesita saber.
   Si se calculara también aquí habría dos verdades para el mismo número,
   y eso ya salió caro dos veces en este proyecto. */
let RECALCINF;                       // undefined = todavía no se consulta
const MESES_BIM=['ENE-FEB','MAR-ABR','MAY-JUN','JUL-AGO','SEP-OCT','NOV-DIC'];
function bimestreActual(d=new Date()){
  return MESES_BIM[Math.floor(d.getMonth()/2)]+' '+d.getFullYear();
}
/* Hay TRES estados distintos y confundirlos manda a buscar el problema
   donde no está:
     null         → la vista no existe: falta correr el Script 63.
     {nunca:true} → el script SÍ está, pero el recálculo todavía no se ha
                    aplicado ni una vez. Es lo que pasa justo después de
                    correr el script: al final solo hace una SIMULACIÓN,
                    que a propósito no escribe en la bitácora.
     {…fila}      → ya corrió; la fila dice cuándo y de qué bimestre. */
async function cargarRecalcInfonavit(){
  try{
    const {data,error}=await sb.from('v_ultimo_recalculo_infonavit').select('*').maybeSingle();
    RECALCINF=error?null:(data||{nunca:true});
  }catch(e){ RECALCINF=null; }
  return RECALCINF;
}
/* La etiqueta que se ve en el módulo de retenciones. */
function recalcBadge(){
  const r=RECALCINF;
  if(r===undefined)return '<span style="color:var(--mut);font-size:11.5px">Consultando el último recálculo…</span>';
  if(!r)return `<span style="color:var(--mut);font-size:11.5px" title="Falta correr el Script 63 en Supabase">⚙ El recálculo automático del INFONAVIT no está instalado</span>`;
  if(r.nunca)return `<span style="color:var(--amber);font-size:11.5px;font-weight:600"
     title="Corre en el editor SQL de Supabase:  select recalcular_creditos_infonavit();">
     ⏳ Instalado, pero todavía no se aplica ninguna vez · córrelo con <b>select recalcular_creditos_infonavit();</b></span>`;
  if(r.resultado==='ERROR')
    return `<span style="color:var(--red);font-size:11.5px;font-weight:700" title="${esc(String(r.mensaje||''))}">⚠ El último recálculo automático FALLÓ (${fmtD(r.created_at)})</span>`;
  const alDia=!!r.es_bimestre_actual;
  return `<span style="color:${alDia?'var(--green)':'var(--amber)'};font-size:11.5px;font-weight:600"
     title="${esc(r.mensaje||'')} · ${r.afectados} de ${r.revisados} crédito(s) ajustados">
     ${alDia?'✔':'⏳'} Último recálculo automático aplicado: ${fmtD(r.created_at)} · bimestre ${esc(r.bimestre||'—')}
     ${r.afectados?` · ${r.afectados} crédito(s) ajustados`:' · sin cambios'}</span>`;
}
/* --- dsCalc bimestral (sustituye al mensual) --- */
/* La modalidad solo aplica al INFONAVIT: para lo demás se esconde y se
   captura el monto directo, como siempre. */
function dsModalidad(){
  const tipo=($('ds-tipo')||{}).value,esInf=tipo==='INFONAVIT',esFon=tipo==='FONACOT';
  const wrap=$('ds-mod-wrap'); if(wrap)wrap.style.display=esInf?'':'none';
  const creditoWrap=$('ds-credito-wrap');if(creditoWrap)creditoWrap.style.display=esInf?'':'none';
  const fonWrap=$('ds-fonacot-wrap');if(fonWrap)fonWrap.style.display=esFon?'':'none';
  const infHint=$('ds-inf-hint');if(infHint)infHint.style.display=esInf?'':'none';
  const mod=esInf?(($('ds-mod')||{}).value||'CUOTA_FIJA'):'CUOTA_FIJA';
  const lbl=$('ds-lbl-factor');
  if(lbl)lbl.textContent=esFon?'Cuota mensual de la cédula FONACOT ($)':!esInf?'Cuota mensual pactada, opcional ($)'
    :mod==='VSM_UMI'?'Factor: veces la UMI'
    :mod==='PORCENTAJE'?'Factor: % del salario'
    :'Cuota MENSUAL del aviso ($)';
  dsCalc();
}
/* Misma fórmula que infonavit_retencion() del Script 63. Aquí solo para
   que el capturista vea el número al momento; quien manda es la base. */
function dsMensualEquivalente(mod,factor,w){
  const f=FISC(), x=Number(factor)||0;
  if(x<=0)return 0;
  if(mod==='VSM_UMI')return x*f.umi;
  if(mod==='PORCENTAJE'){const sdi=Number(w&&(w.sdi||w.sd))||0;return sdi*30.4*x/100;}
  return x;
}
function dsCalc(){
  const P=window._DSPER||PERIODOS.SEMANAL;
  const w=window._DSW||null;
  const tipo=($('ds-tipo')||{}).value,esInf=tipo==='INFONAVIT',esFon=tipo==='FONACOT';
  const mod=esInf?(($('ds-mod')||{}).value||'CUOTA_FIJA'):'CUOTA_FIJA';
  const factor=parseFloat($('ds-mensual').value);
  if(!(factor>0)){
    $('ds-hint').textContent=esFon?'Captura la cuota mensual de la cédula FONACOT o cambia a importe fijo capturado.':esInf?'Captura el factor del aviso INFONAVIT.':'Puedes capturar directamente el monto por periodo.';
    return;
  }
  const men=dsMensualEquivalente(mod,factor,w);
  if(!(men>0)){
    if(mod==='PORCENTAJE')$('ds-hint').innerHTML='<b>Falta el SDI del trabajador</b> para poder calcular un crédito por porcentaje. Captúraselo en su ficha.';
    return;
  }
  if(esFon){
    const calendario=$('ds-fonacot-metodo').value==='DIAS_CALENDARIO';
    const [desde,hasta]=rangoRetencion(w,'S'+isoWeek());
    const c=calendario?cuotaFonacotCalendario(men,desde,hasta):redondearCentavos(men/(P.cve==='QUINCENAL'?2:30/P.dias));
    $('ds-monto').value=c.toFixed(2);
    $('ds-hint').innerHTML=calendario
      ?`<b>Estimación para ${esc(desde)}–${esc(hasta)}: $${money(c)}</b>. En cada proyección se suma cuota mensual ÷ días reales del mes para cada fecha (sin seguro INFONAVIT). Coteja el total mensual con la cédula FONACOT y NOI.`
      :`<b>Importe fijo de referencia: $${money(c)}</b>. Puedes editarlo para que coincida con NOI; no variará automáticamente entre meses.`;
    return;
  }
  if(!esInf){
    const c=redondearCentavos(men/(P.cve==='QUINCENAL'?2:30/P.dias));
    $('ds-monto').value=c.toFixed(2);
    $('ds-hint').textContent='Estimación orientativa desde la cuota mensual. Para préstamos u otros conceptos, captura el importe pactado por periodo y verifica la autorización del trabajador.';
    return;
  }
  const c=mod==='PORCENTAJE'
    ?retencionInfonavitDesdeAviso({modalidad:mod,factor},w,P.dias,new Date())
    :cuotaPeriodoInfonavit(men,P.dias,new Date());
  $('ds-monto').value=c.toFixed(2);
  const comoSale=mod==='VSM_UMI'?`${factor} × UMI $${FISC().umi} = $${money(men)} mensuales, y de ahí `
    :mod==='PORCENTAJE'?`${factor}% × SDI × ${P.dias} días, más seguro proporcional = `:'';
  $('ds-hint').innerHTML=`<b>Por ${P.unidad.toLowerCase()}: $${c.toFixed(2)}</b> = ${comoSale}(mensual×2 + $${FISC().seg} seguro de daños) ÷ ${diasBimestreActual()} días del bimestre × ${P.dias} — fórmula validada contra tu EBA (Cenobio $1,203.51 ✔). <b>Cada bimestre se recalcula solo.</b>`;
}


/* Entrada compatible: selecciona el motor por la periodicidad del trabajador.
   No calcula impuestos, incidencias ni calendarios en este adaptador. */
function nominaPeriodo(w,opts){
  return periodoPago(w)==='QUINCENAL'?nominaQuincenal(w,opts):nominaSemanal(w,opts);
}
/* Diferencia de NETO entre semana normal y semana con faltas — esto es lo que se descuenta
   en la proyección para cuadrar AL CENTAVO con el neto de NOI. */
function descuentoFaltasNOI(w,faltas,premios,dias,incapacidadIMSS,contexto){
  return periodoPago(w)==='QUINCENAL'?descuentoFaltasQuincenal(w,faltas,premios,dias,incapacidadIMSS,contexto):descuentoFaltasSemanal(w,faltas,premios,dias,incapacidadIMSS);
}

/* ---------- v11: EXPORT ALTAS PARA CONTADORA (NOI + SUA + TXT) ---------- */
const EDO_CURP={AS:'01',BC:'02',BS:'03',CC:'04',CL:'05',CM:'06',CS:'07',CH:'08',DF:'09',DG:'10',GT:'11',GR:'12',HG:'13',JC:'14',MC:'15',MN:'16',MS:'17',NT:'18',NL:'19',OC:'20',PL:'21',QT:'22',QR:'23',SP:'24',SL:'25',SR:'26',TC:'27',TS:'28',TL:'29',VZ:'30',YN:'31',ZS:'32',NE:'88'};
function edoCurp(curp){const c=String(curp||'').toUpperCase();return EDO_CURP[c.slice(11,13)]||'13';}
function xlDate(f){if(!f)return '';const [y,m,d]=String(f).slice(0,10).split('-').map(Number);return Math.round((Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000);}
function fechaDDMMAAAA(f){if(!f)return '';const [y,m,d]=String(f).slice(0,10).split('-');return d+m+y;}
function suaConcat(w){
  return (rpDe(w)||'')+String(w.nss||'')+String(w.rfc||'')+String(w.curp||'')+
    String(w.primer_apellido||'')+'$'+String(w.segundo_apellido||'')+'$'+String(w.nombres||'')+
    '30'+fechaDDMMAAAA(w.fecha_alta)+'00'+String(Math.round((Number(w.sdi)||0)*100));
}
function dlText(text,name){
  const out=new Blob([text],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(out);a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
const NOI_HDR=['Clave trabajador','A. paterno','A. materno','Nombre (s)','Salario diario','Sexo','Fecha de nacimiento','Fecha de alta','IMSS','Lugar de Nacimiento','CURP','RFC','Calle','Colonia','Población','Código postal','Código postal Fiscal','Entidad federativa','Teléfono 1','Teléfono 2','Correo electrónico','Correo electrónico 2','Nivel de estudios','Profesión','Estado civil','Tipo de sangre','Nombre de Emergencia','Telefono de Emergencia','Forma de pago','Banco operador','Localidad / sucursal','Control de banco','','Tipo de empleado','Tipo de jornada','Turno','Unidad médica familiar','Descuenta pensión alimenticia','Registro patronal','Clasificación','Departamento','Puesto','Tipo de contrato','Clave de Régimen de contrato','País','Tipo ingreso','Base cotización','Clave de tipo contrato V12','Clave de tipo jornada','Clave de entidad federativa V12','Ruta plantilla','Clave Régimen','Clave de banco','Tabla de vacaciones','Tabla de sal. Diario','ModalidaTrabajo','SDI capturado','Dias contrato'];
function openAltasNOI(){
  const [d1,d2]=weekBounds();window._NA_OBRA=OBRA.id;
  modal(`
    <div class="m-head"><h2>⬇ Altas para contadora · NOI y TXT</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px">Excel con una sola hoja <b>Trabajadores NUEVOS</b>, en el orden de columnas del formato de contabilidad. Departamento <b>1</b>, contrato <b>3</b> y puesto con su <b>clave NOI</b>. El TXT conserva únicamente las altas SUA. No incluye SUA AFILIACIÓN ni INFONAVIT.</p>
      <div class="kv"><b>Registro patronal</b><span>${esc(OBRA.registro_patronal)||'⚠ FALTA — agrégalo en la configuración del centro'}</span></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">
        <div><label>Altas del día</label><input id="na-d1" type="date" value="${d1}" oninput="naLista()"></div>
        <div><label>al día</label><input id="na-d2" type="date" value="${d2}" oninput="naLista()"></div>
      </div>
      <div class="fhint">Las claves elegidas aquí sólo se usan al exportar; no modifican la ficha del trabajador.</div>
      <div id="na-lista" style="margin-top:12px"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn" id="na-txt" onclick="exportAltasSUATxt()">⬇ TXT de altas SUA</button>
      <button class="btn dark" id="na-excel" onclick="exportAltasNOIExcel()">⬇ Excel · Trabajadores NUEVOS</button>
    </div>`,'lg');
  naLista();
}
function naLista(){
  const d1=$('na-d1').value,d2=$('na-d2').value;
  if(!noiFechaValida(d1)||!noiFechaValida(d2)||d1>d2){window._NA=[];$('na-lista').innerHTML='<p style="color:var(--red)">Revisa el rango de fechas.</p>';return;}
  const ws=WORKERS.filter(w=>w.fecha_alta&&w.fecha_alta>=d1&&w.fecha_alta<=d2&&w.estatus!=='BAJA').sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
  window._NA=ws;
  $('na-lista').innerHTML=ws.length?`<div class="sect">${ws.length} alta(s) en el rango — desmarca las que no quieras incluir</div>`+
    ws.map((w,i)=>{
      const falta=['nss','rfc','curp'].filter(k=>!w[k]),sinSdi=!(Number(w.sdi)>0),clave=noiPuestoClave(w.puesto);
      return `<div style="padding:8px 2px;border-bottom:1px solid var(--border)">
      <label style="display:block;font-size:12.5px${(falta.length||sinSdi)?';color:var(--red)':''}">
      <input type="checkbox" id="na-${i}" ${falta.length?'':'checked'}> #${w.no_trab??'—'} ${esc(fullName(w))} · ${esc(w.puesto||'sin puesto')} · alta ${fmtD(w.fecha_alta)} · SDI $${money(w.sdi||0)}${falta.length?` ⚠ falta ${falta.join(', ').toUpperCase()}`:''}${sinSdi?' ⚠ SIN SDI':''}${w.estatus==='PENDIENTE'?' · PENDIENTE':''}</label>
      ${clave?`<div class="fhint">Puesto NOI: ${clave} · ${esc(NOI_PUESTOS_ALTAS[clave-1])}</div>`:
        `<div class="fhint" style="color:var(--amber)">Sin equivalencia automática. Elige la clave para el Excel:</div>
        <select id="na-puesto-${i}" aria-label="Clave de puesto NOI para trabajador ${w.no_trab??i+1}">
        <option value="">Seleccionar puesto NOI…</option>${NOI_PUESTOS_ALTAS.map((p,k)=>`<option value="${k+1}">${k+1} · ${esc(p)}</option>`).join('')}</select>`}
      </div>`;
    }).join('')
    :'<p style="color:var(--mut)">No hay altas en ese rango de fechas.</p>';
}
function naSel(){return (window._NA||[]).filter((w,i)=>$('na-'+i)&&$('na-'+i).checked);}
async function exportAltasNOIExcel(){
  const sel=noiPrepararAltas(true);if(!sel)return;
  noiEstadoExportacion(true);
  try{
    await dl(noiLibroAltas(sel),`ALTAS_CONTADORA_NOI_${$('na-d1').value}_a_${$('na-d2').value}.xlsx`);
    toast(`Excel generado con ${sel.length} alta(s), hoja Trabajadores NUEVOS y claves de puesto NOI.`,'ok');
  }catch(e){toast('No se pudo generar el Excel de altas: '+e.message,'err');}
  finally{noiEstadoExportacion(false);}
}
function exportAltasSUATxt(){
  const sel=noiPrepararAltas(false);if(!sel)return;
  dlText(sel.map(noiLineaSUA).join('\r\n')+'\r\n',`ALTAS_SUA_${$('na-d1').value}_a_${$('na-d2').value}.txt`);
  toast(`TXT generado con ${sel.length} línea(s) de altas SUA.`,'ok');
}

/* ---------- v11: PENDIENTE MANUAL (pausar sin dar de baja) ---------- */
function openPendiente(id){
  const w=WORKERS.find(x=>x.id===id); if(!w)return;
  modal(`
    <div class="m-head"><h2>⏸ Pasar a PENDIENTE · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px">El trabajador se <b>pausa sin darlo de baja</b>: no saldrá en la <b>proyección / dispersión</b> ni en la requisición, no cuenta como baja y conserva todo su expediente e historial. <b>No se reactiva solo</b> — vuelve a ACTIVO únicamente con el botón "Marcar ACTIVO".</p>
      <div><label>Motivo *</label><select id="pd-motivo">
        <option>SIN RÉGIMEN DE SUELDOS Y SALARIOS (605) — EN TRÁMITE ANTE EL SAT</option>
        <option>DOCUMENTACIÓN INCOMPLETA / EN TRÁMITE</option>
        <option>NSS / IMSS EN ACLARACIÓN</option>
        <option>OTRO</option></select></div>
      <div style="margin-top:10px"><label>Detalle (opcional)</label><input id="pd-detalle" placeholder="EJ. RFC EN RÉGIMEN 626, CITA SAT 20/07..."></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="doPendiente('${id}')">⏸ Pausar (PENDIENTE)</button>
    </div>`,'md');
}
async function doPendiente(id){
  const mot=($('pd-motivo').value+($('pd-detalle').value?' — '+$('pd-detalle').value.trim().toUpperCase():''));
  markWrite();
  const {error}=await sb.from('trabajadores').update({estatus:'PENDIENTE',pendiente_manual:true,motivo_pendiente:mot}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast('Trabajador pausado como PENDIENTE: no saldrá en la proyección hasta reactivarlo.','ok');
  await loadObraData(OBRA.id);refreshCounts();
}

/* ---------- v11: EXCEPCIONES DE DESCUENTO POR SEMANA (suspender / doble) ---------- */
function exResumen(d){const ex=d.excepciones||{};const ks=Object.keys(ex);return ks.length?' · '+ks.map(k=>k+(ex[k]==='DOBLE'?' ×2':' ⏸')).join(' '):'';}
function openAjusteRetencion(id,semN){
  const d=DESC.find(x=>x.id===id&&x.obra_id===OBRA.id&&x.recurrente);
  if(!d)return;
  const w=WORKERS.find(x=>x.id===d.trabajador_id);if(!w)return;
  const sem='S'+(semN||isoWeek()),aj=(d.ajustes_semana||{})[sem]||{};
  const [inicio]=rangoRetencion(w,sem);
  modal(`<div class="m-head"><h2>🧮 Ajuste de retención · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p class="fhint">${esc(d.tipo)} · Cuota de referencia $${money(d.monto)}. El cambio sólo aplica a la semana elegida; la cuota base y el historial permanecen intactos. Los días extra se valoran con el mes/bimestre de su <b>fecha de origen</b>, no con el mes de pago.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
        <div><label>Semana de descuento</label><input id="ar-sem" type="number" min="1" max="53" value="${String(sem).slice(1)}" oninput="arCambiarSemana('${id}')"></div>
        <div><label>Importe base de esta semana ($) — opcional</label><input id="ar-base" type="number" min="0" step="0.01" placeholder="Usar cálculo automático" value="${aj.importe_base??''}" oninput="arVistaPrevia('${id}')"></div>
        <div><label>Primer día adicional de periodo anterior</label><input id="ar-desde" type="date" max="${inicio}" value="${aj.dias_extra_desde||''}" oninput="arVistaPrevia('${id}')"></div>
        <div><label>Número de días adicionales</label><input id="ar-dias" type="number" min="0" max="31" step="1" value="${aj.dias_extra||0}" oninput="arVistaPrevia('${id}')"></div>
      </div>
      <div style="margin-top:10px"><label>Motivo y respaldo del ajuste *</label><input id="ar-motivo" maxlength="300" value="${esc(aj.motivo||'')}" placeholder="Ej. 4 días pendientes del 01 al 04/oct según cédula y NOI"></div>
      <div id="ar-preview" class="fhint" style="margin-top:12px"></div>
      <p style="font-size:11.5px;color:var(--mut);margin-top:10px">FONACOT: cotejar cédula y límite de la LFT. INFONAVIT: conservar aviso y verificar retención/seguro del bimestre. No cambia nóminas ya timbradas ni comprobantes emitidos.</p>
    </div><div class="m-foot"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn dark" onclick="saveAjusteRetencion('${id}')">💾 Guardar ajuste</button></div>`,'md');
  arVistaPrevia(id);
}
function arCambiarSemana(id){
  const d=DESC.find(x=>x.id===id),w=d&&WORKERS.find(x=>x.id===d.trabajador_id);
  if(!w)return;
  const sem='S'+(parseInt($('ar-sem').value)||isoWeek()),aj=(d.ajustes_semana||{})[sem]||{};
  $('ar-base').value=aj.importe_base??'';$('ar-desde').value=aj.dias_extra_desde||'';
  $('ar-dias').value=aj.dias_extra||0;$('ar-motivo').value=aj.motivo||'';
  $('ar-desde').max=rangoRetencion(w,sem)[0];arVistaPrevia(id);
}
function arVistaPrevia(id){
  const d=DESC.find(x=>x.id===id),w=d&&WORKERS.find(x=>x.id===d.trabajador_id),out=$('ar-preview');
  if(!w||!out)return;
  const sem='S'+(parseInt($('ar-sem').value)||isoWeek()),P=perDe(w);
  const base=$('ar-base').value!==''?Number($('ar-base').value):retencionAplicadaPeriodo(d,w,sem,P).base;
  const desde=$('ar-desde').value,dias=Number($('ar-dias').value)||0;
  const extra=desde&&dias>0?retencionDiasExtra(d,w,desde,dias):0;
  const tope=d.tipo==='FONACOT'?limiteFonacotPeriodo(w,sem):null;
  out.innerHTML=`<b>Semana ${esc(sem)}:</b> $${money(base)} base + $${money(extra)} ${dias>0?'('+dias+' día(s) '+esc(desde)+' a '+esc(retSumarDias(desde,dias-1))+')':''} = <b>$${money(base+extra)}</b>.${tope?` Tope FONACOT ${tope.porcentaje}%: $${money(tope.monto)}${base+extra>tope.monto+.005?' <b style="color:var(--red)">— EXCEDIDO</b>':''}.`:''}`;
}
async function saveAjusteRetencion(id){
  const d=DESC.find(x=>x.id===id&&x.obra_id===OBRA.id&&x.recurrente),w=d&&WORKERS.find(x=>x.id===d.trabajador_id);
  if(!w)return;
  const num=parseInt($('ar-sem').value),sem='S'+num,baseTxt=$('ar-base').value.trim();
  const desde=$('ar-desde').value,dias=Number($('ar-dias').value),motivo=$('ar-motivo').value.trim();
  if(!(num>=1&&num<=53)||!Number.isInteger(dias)||dias<0||dias>31||baseTxt!==''&&(!Number.isFinite(Number(baseTxt))||Number(baseTxt)<0)){
    toast('Revisa semana, importe y días (0 a 31).','err');return;
  }
  if((dias>0&&!desde)||(desde&&dias===0)){toast('Captura fecha y número de días juntos.','err');return;}
  if(dias>0){
    const [inicio]=rangoRetencion(w,sem);
    if(!/^\d{4}-\d\d-\d\d$/.test(desde)||!Number.isFinite(retFecha(desde).getTime())||retISO(retFecha(desde))!==desde){toast('La fecha de los días adicionales no es válida.','err');return;}
    const fin=retSumarDias(desde,dias-1);
    if(fin>=inicio){toast('Los días adicionales deben ser anteriores al periodo que recibirá el descuento.','err');return;}
    for(const [s,otro] of Object.entries(d.ajustes_semana||{})){
      if(s===sem||!otro.dias_extra_desde||!(Number(otro.dias_extra)>0))continue;
      const f2=retSumarDias(otro.dias_extra_desde,Number(otro.dias_extra)-1);
      if(desde<=f2&&otro.dias_extra_desde<=fin){toast('Esos días ya están capturados como adicionales en '+s+'.','err');return;}
    }
  }
  if((baseTxt!==''||dias>0)&&motivo.length<8){toast('Explica el motivo del ajuste (mínimo 8 caracteres).','err');return;}
  if((baseTxt!==''||dias>0)&&(d.excepciones||{})[sem]==='SUSPENDER'){
    toast('Esa retención está suspendida en la semana. Quita la suspensión antes de capturar un ajuste.','err');return;
  }
  if(d.tipo==='FONACOT'){
    const P=perDe(w),base=baseTxt!==''?Number(baseTxt):retencionAplicadaPeriodo(d,w,sem,P).base;
    const extra=dias?retencionDiasExtra(d,w,desde,dias):0,tope=limiteFonacotPeriodo(w,sem);
    if(tope&&base+extra+otrosFonacotPeriodo(w,sem,id)>tope.monto+.005){
      toast(`El total conjunto FONACOT ($${money(base+extra+otrosFonacotPeriodo(w,sem,id))}) supera el ${tope.porcentaje}% del salario del periodo ($${money(tope.monto)}). Distribuye los días pendientes en otra nómina.`, 'err');return;
    }
  }
  const ajustes={...(d.ajustes_semana||{})};
  if(baseTxt===''&&dias===0)delete ajustes[sem];
  else ajustes[sem]={importe_base:baseTxt===''?null:redondearCentavos(Number(baseTxt)),dias_extra_desde:dias?desde:null,dias_extra:dias,motivo,editado_por:USER.email,editado_en:new Date().toISOString()};
  markWrite();
  const {data,error}=await sb.from('descuentos').update({ajustes_semana:ajustes,actualizado_por:USER.email})
    .eq('id',id).eq('obra_id',OBRA.id).eq('updated_at',d.updated_at).select('id');
  if(error){toast('No se guardó el ajuste: '+error.message,'err');return;}
  if(!data?.length){toast('Alguien modificó esta retención. Recarga la ficha antes de guardar.','err');await loadObraData(OBRA.id);return;}
  closeModal();toast('Ajuste semanal guardado con historial. Verifica la proyección antes de cerrar NOI.','ok');
  await loadObraData(OBRA.id);
}
function openExcepcion(id){
  const d=DESC.find(x=>x.id===id); if(!d)return;
  const w=WORKERS.find(x=>x.id===d.trabajador_id);
  const ex=d.excepciones||{};
  modal(`
    <div class="m-head"><h2>⏸/×2 Excepción semanal · ${esc(d.tipo)} de ${esc(w?fullName(w):'')}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px">Cuota semanal normal: <b>$${money(d.monto)}</b>. <b>⏸ Suspender</b> = esa semana NO se retiene. <b>×2 Doble</b> recalcula los 14 días desde el aviso y redondea una sola vez (p. ej. para compensar una semana suspendida). Solo afecta la semana elegida; las demás siguen normal y la proyección lo refleja automáticamente.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Semana</label><input id="ex-sem" type="number" value="${isoWeek()}"></div>
        <div><label>Acción</label><select id="ex-acc"><option value="SUSPENDER">⏸ Suspender (no retener)</option><option value="DOBLE">×2 Retener doble</option><option value="NORMAL">Quitar excepción (retener normal)</option></select></div>
      </div>
      ${Object.keys(ex).length?`<div class="fhint" style="margin-top:10px">Excepciones activas: ${Object.entries(ex).map(([s,a])=>`<b>${s}</b> ${a==='DOBLE'?'×2 doble':'⏸ suspendida'}`).join(' · ')}</div>`:''}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="saveExcepcion('${id}')">💾 Aplicar</button>
    </div>`,'md');
}
async function saveExcepcion(id){
  const d=DESC.find(x=>x.id===id); if(!d)return;
  const sem='S'+($('ex-sem').value||isoWeek());
  const acc=$('ex-acc').value;
  const ex={...(d.excepciones||{})};
  if(acc==='NORMAL')delete ex[sem]; else ex[sem]=acc;
  if(acc==='SUSPENDER'&&(d.ajustes_semana||{})[sem]){
    toast('La semana tiene un importe/días adicionales. Quita primero ese ajuste para suspender sin perderlo de vista.','err');return;
  }
  if(d.tipo==='FONACOT'&&acc==='DOBLE'){
    const w=WORKERS.find(x=>x.id===d.trabajador_id),tope=w&&limiteFonacotPeriodo(w,sem);
    const previsto=w?retencionAplicadaPeriodo({...d,excepciones:ex},w,sem,perDe(w)).monto:0;
    if(tope&&previsto+otrosFonacotPeriodo(w,sem,id)>tope.monto+.005){
      toast(`La retención doble excedería el ${tope.porcentaje}% del salario del periodo. Usa un ajuste menor y justifícalo.`, 'err');return;
    }
  }
  markWrite();
  const {error}=await sb.from('descuentos').update({excepciones:ex}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();
  const w=WORKERS.find(x=>x.id===d.trabajador_id), P=perDe(w);
  toast(acc==='NORMAL'?`Excepción de ${sem} eliminada: se retiene normal.`:acc==='SUSPENDER'?`Retención SUSPENDIDA en ${sem}: no se descuenta esa semana.`:`Retención DOBLE en ${sem}: $${money(montoDobleDescuento(d,w,P,sem))}.`,'ok');
  await loadObraData(OBRA.id);
}

/* ---------- v17: semanal NETO sugerido (motor NOI) ---------- */
function semanalNeto(sd,sdi){
  const r=nominaSemanal({sd:Number(sd)||0,sdi:Number(sdi)||((Number(sd)||0)*1.0493)},{faltas:0});
  return {neto:r.neto,isr:r.isr,imss:r.imssObr,sub:r.subsidio,bruto:r.bruto};
}

/* ---------- v18: TRANSFERENCIA DE TRABAJADORES ENTRE OBRAS ---------- */
function isoWeekDe(obra,d=new Date()){
  const base=(obra&&obra.fecha_inicio)?String(obra.fecha_inicio).slice(0,10):SEMANA1;
  const a=new Date(base+'T12:00');const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));
  return Math.round((x-a)/604800000)+1;
}
function openTransferencia(preId){
  const cands=WORKERS.filter(w=>w.estatus==='ACTIVO').sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
  if(!cands.length){toast('No hay activos en esta obra.','err');return;}
  const dests=OBRAS.filter(o=>o.id!==OBRA.id&&o.activa!==false);
  if(!dests.length){toast('No hay otra obra registrada. Crea la obra destino con ➕ en la barra de obras.','err');return;}
  window._TR=cands;
  modal(`
    <div class="m-head"><h2>🔁 Transferir trabajadores · desde ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1.2fr 1.6fr 160px">
        <div><label>Centro destino <span style="color:var(--red)">*</span></label><select id="tr-dest" style="border-color:var(--accent)" onchange="trModoUI()"><option value="">— Elige el centro destino —</option>${dests.map(o=>`<option value="${o.id}">${esc(EMPRESAS[empresaDeObra(o)].corto)} · ${esc(o.nombre)}${o.tipo==='OFICINA'?' · oficina':''}</option>`).join('')}</select></div>
        <div><label>Modo</label><select id="tr-modo" onchange="trModoUI()">
          <option value="A">Cambio de obra — MISMA antigüedad y expediente (sin baja)</option>
          <option value="B">Baja con finiquito + reingreso — antigüedad DESDE CERO</option>
          <option value="C">Baja con finiquito + reingreso — CONSERVA antigüedad</option>
        </select></div>
        <div><label>Fecha efectiva</label><input id="tr-fecha" type="date" value="${today()}"></div>
      </div>
      <div id="tr-hint" class="fhint" style="margin-top:8px"></div>
      <div style="margin:10px 0 6px;font-size:12px;color:var(--mut)">
        <label id="tr-chq-wrap" class="hide"><input type="checkbox" id="tr-cheque" checked> Generar cheque de finiquito PENDIENTE por cada monto capturado</label>
        · <a href="#" onclick="window._TR.forEach((w,i)=>$('tr-'+i).checked=true);return false">marcar todos</a>
        · <a href="#" onclick="window._TR.forEach((w,i)=>$('tr-'+i).checked=false);return false">ninguno</a>
        · <input id="tr-q" placeholder="buscar..." style="width:150px;padding:3px 8px" oninput="trFiltra()">
      </div>
      <div style="max-height:340px;overflow:auto">
        ${cands.map((w,i)=>`<div id="tr-row-${i}" style="display:flex;gap:10px;align-items:center;padding:3px 2px;font-size:12.5px">
          <label style="flex:1"><input type="checkbox" id="tr-${i}" ${preId===w.id?'checked':''}> #${w.no_trab??'—'} ${esc(fullName(w))} · ${esc(w.puesto||'')} · alta ${fmtD(w.fecha_alta)}</label>
          <span class="tr-fin hide">Finiquito $ <input id="tr-f-${i}" type="number" min="0" step="0.01" style="width:110px;padding:3px 6px"></span>
        </div>`).join('')}
      </div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="execTransferencia()">🔁 Transferir seleccionados</button>
    </div>`,'lg');
  trModoUI();
}
function trModoUI(){
  const dest=OBRAS.find(o=>o.id===($('tr-dest')&&$('tr-dest').value));
  const cambiaEmpresa=!!(dest&&empresaDeObra(dest)!==empresaDeObra(OBRA));
  const sel=$('tr-modo'),opDirecto=sel&&sel.options[0];if(opDirecto)opDirecto.disabled=cambiaEmpresa;
  if(cambiaEmpresa&&sel.value==='A')sel.value='B';
  const m=sel.value;
  const conBaja=m!=='A';
  document.querySelectorAll('.tr-fin').forEach(x=>x.classList.toggle('hide',!conBaja));
  $('tr-chq-wrap').classList.toggle('hide',!conBaja);
  $('tr-hint').innerHTML=(cambiaEmpresa?'<div style="color:var(--amber);margin-bottom:5px"><b>Cambio de razón social:</b> requiere baja y reingreso; el traslado directo quedó bloqueado para proteger la separación laboral y documental.</div>':'')+(m==='A'
    ?'<b>Cambio de obra:</b> conserva su expediente, historial, antigüedad y descuentos; recibe número nuevo consecutivo en la obra destino. Si la obra destino tiene otro registro patronal, se marca 🆕 para que las contadoras presenten el alta IMSS.'
    :(m==='B'
      ?'<b>Baja + reingreso (antigüedad desde cero):</b> se da de BAJA en esta obra (motivo TÉRMINO DE CONTRATO U OBRA, con el finiquito que captures y su cheque) y se crea de nuevo en la obra destino con fecha de alta = fecha efectiva. Vuelve a generarse su documentación (renuncia/finiquito desde su ficha de baja). Los descuentos fijos activos (INFONAVIT/FONACOT) se copian al nuevo registro.'
      :'<b>Baja + reingreso (conserva antigüedad):</b> igual que el anterior, pero el nuevo registro conserva la fecha de alta ORIGINAL — vacaciones, aguinaldo y prima siguen contando desde su ingreso real. Los descuentos fijos activos se copian al nuevo registro.'));
}
function trFiltra(){
  const q=($('tr-q').value||'').toUpperCase();
  window._TR.forEach((w,i)=>{$('tr-row-'+i).style.display=(!q||fullName(w).toUpperCase().includes(q))?'flex':'none';});
}
async function execTransferencia(){
  const destId=$('tr-dest').value, dest=OBRAS.find(o=>o.id===destId);
  if(!dest){toast('Elige la obra destino.','err');return;}
  const modo=$('tr-modo').value, f=$('tr-fecha').value||today();
  if(empresaDeObra(dest)!==empresaDeObra(OBRA)&&modo==='A'){
    toast('Entre empresas distintas se requiere baja y reingreso; el cambio directo no está permitido.','err');return;
  }
  const sel=window._TR.map((w,i)=>({w,chk:$('tr-'+i)&&$('tr-'+i).checked,fin:parseFloat(($('tr-f-'+i)||{}).value)||0})).filter(x=>x.chk);
  if(!sel.length){toast('Marca al menos un trabajador.','err');return;}
  if(modo!=='A'&&sel.some(x=>!(x.fin>0))&&!confirm(`${sel.filter(x=>!(x.fin>0)).length} seleccionado(s) SIN monto de finiquito capturado — su baja quedará sin finiquito. ¿Continuar?`))return;
  const {data:dw}=await sb.from('trabajadores').select('no_trab').eq('obra_id',destId);
  let next=Math.max(0,...((dw||[]).map(x=>Number(x.no_trab)||0)),0)+1;
  const rpCambia=(dest.registro_patronal||'')!==(OBRA.registro_patronal||'');
  const semDest='NOMINA '+isoWeekDe(dest,new Date(f+'T12:00'));
  if(!confirm(`¿Transferir ${sel.length} trabajador(es) a ${dest.nombre}?\nModo: ${$('tr-modo').selectedIndex+1} — ${modo==='A'?'cambio directo (sin baja)':'baja con finiquito y reingreso'}\nRecibirán números consecutivos desde el #${next} en la obra destino.\nTodo queda en el historial.`))return;
  markWrite();let ok=0,err=0;
  for(const x of sel){
    const w=x.w;
    if(modo==='A'){
      const obs=(w.observaciones?w.observaciones+' | ':'')+`TRANSFERIDO DE ${OBRA.nombre} EL ${f}`+(rpCambia?' — REQUIERE ALTA IMSS EN EL NUEVO REG. PATRONAL':'');
      const upd={obra_id:destId,no_trab:next++,semana_ingreso:semDest,observaciones:obs};
      if(rpCambia)upd.movimiento_imss='SIN MOVIMIENTO';
      const {error}=await sb.from('trabajadores').update(upd).eq('id',w.id);
      if(error){err++;continue;}
      await sb.from('descuentos').update({obra_id:destId}).eq('trabajador_id',w.id);
      ok++;
    }else{
      const obsB=(w.observaciones?w.observaciones+' | ':'')+`BAJA POR TRANSFERENCIA A ${dest.nombre} EL ${f}`;
      const {error:e1}=await sb.from('trabajadores').update({estatus:'BAJA',fecha_baja:f,motivo_baja:'TERMINO DE CONTRATO U OBRA',monto_finiquito:x.fin||null,observaciones:obsB}).eq('id',w.id);
      if(e1){err++;continue;}
      if(x.fin>0&&$('tr-cheque').checked){
        const sB=isoWeek(new Date(f+'T12:00'));
        await sb.from('cheques').insert({obra_id:w.obra_id,trabajador_id:w.id,no_trab:w.no_trab,contratista:w.contratista,nombre:fullName(w),puesto:w.puesto,curp:w.curp,semana:'S'+sB,periodo:periodoCorto(sB),importe:x.fin,tipo_pago:'FINIQUITO',estatus:'PENDIENTE',observaciones:'TRANSFERENCIA A '+dest.nombre,creado_por:USER.email});
      }
      const nuevo={obra_id:destId,no_trab:next++,estatus:'ACTIVO',
        primer_apellido:w.primer_apellido,segundo_apellido:w.segundo_apellido,nombres:w.nombres,
        puesto:w.puesto,contratista:w.contratista,sd:w.sd,sdi:w.sdi,sal_semanal:w.sal_semanal,
        rfc:w.rfc,curp:w.curp,nss:w.nss,fecha_nacimiento:w.fecha_nacimiento,genero:w.genero,
        estado_civil:w.estado_civil,nacionalidad:w.nacionalidad,edo_nacimiento:w.edo_nacimiento,
        direccion:w.direccion,cp:w.cp,telefono:w.telefono,correo:w.correo,beneficiario:w.beneficiario,
        cuenta:w.cuenta,clabe:w.clabe,banco:w.banco,periodo_pago:w.periodo_pago,forma_pago:w.forma_pago,
        turno:w.turno,tipo_contrato:w.tipo_contrato,docs:w.docs||{},
        fecha_alta:(modo==='C'?w.fecha_alta:f),semana_ingreso:semDest,movimiento_imss:'SIN MOVIMIENTO',
        observaciones:`REINGRESO POR TRANSFERENCIA DESDE ${OBRA.nombre} EL ${f}`+(modo==='C'?` — CONSERVA ANTIGÜEDAD DESDE ${w.fecha_alta}`:' — ANTIGÜEDAD REINICIADA')+(x.fin>0?` · FINIQUITO PREVIO $${money(x.fin)}`:''),
        creado_por:USER.email};
      const {data:nw,error:e2}=await sb.from('trabajadores').insert(nuevo).select('id').single();
      if(e2){err++;continue;}
      // copiar descuentos fijos activos (los créditos siguen aunque cambie de obra)
      const fijos=DESC.filter(d=>d.trabajador_id===w.id&&d.recurrente&&d.activo);
      for(const d of fijos){
        await sb.from('descuentos').insert({trabajador_id:(nw&&nw.id)||null,obra_id:destId,tipo:d.tipo,motivo:d.motivo,monto:d.monto,recurrente:true,creado_por:USER.email,
          periodicidad:d.periodicidad||'SEMANAL',cuota_mensual:d.cuota_mensual??null});
      }
      ok++;
    }
  }
  closeModal();
  toast(err?`Transferencia con ${err} error(es) — revisa el historial.`:`✔ ${ok} trabajador(es) transferidos a ${dest.nombre}.`,err?'err':'ok');
  await loadObraData(OBRA.id);refreshCounts();
}

/* ---------- Editar contratistas por trabajador (2026-07-30) ----------
   Cada trabajador puede tener distinto contratista; esto permite corregirlos
   en bloque sin abrir ficha por ficha. Solo cambia trabajadores.contratista
   (los cheques/descuentos ya emitidos conservan el contratista de su momento). */
function openEditContratistas(){
  const act=WORKERS.filter(w=>w.estatus==='ACTIVO').sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
  if(!act.length){toast('No hay activos en esta obra.','err');return;}
  window._EC=act.map(w=>({id:w.id,no:w.no_trab,name:fullName(w),orig:w.contratista||''}));
  const contrs=[...new Set(WORKERS.map(w=>w.contratista).filter(Boolean))].sort();
  modal(`
    <div class="m-head"><h2>👷 Editar contratistas · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:8px">Cambia el contratista de cada trabajador. Solo se guardan los que modifiques. No afecta cheques ni descuentos ya emitidos (esos guardan el contratista de su momento).</p>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <input id="ec-q" placeholder="buscar trabajador..." style="flex:1;min-width:140px;padding:5px 9px" oninput="ecFiltra()">
        <span style="font-size:11.5px;color:var(--mut)">Aplicar a los filtrados: <input id="ec-bulk" list="ec-dl" style="width:150px;padding:4px 8px" placeholder="contratista"> <button class="btn" style="padding:3px 10px" onclick="ecAplicaBulk()">Aplicar</button></span>
      </div>
      <datalist id="ec-dl">${contrs.map(c=>`<option>${esc(c)}</option>`).join('')}</datalist>
      <div style="max-height:400px;overflow:auto">
        ${window._EC.map((r,i)=>`<div class="ec-row" id="ec-row-${i}" style="display:grid;grid-template-columns:40px 1fr 220px;gap:8px;align-items:center;padding:3px 2px;font-size:12.5px">
          <span style="color:var(--mut)">#${r.no??'—'}</span>
          <span>${esc(r.name)}</span>
          <input id="ec-${i}" list="ec-dl" value="${esc(r.orig)}" style="padding:4px 8px">
        </div>`).join('')}
      </div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="saveEditContratistas()">💾 Guardar cambios</button>
    </div>`,'lg');
}
function ecFiltra(){const q=($('ec-q').value||'').toUpperCase();window._EC.forEach((r,i)=>{$('ec-row-'+i).style.display=(!q||r.name.toUpperCase().includes(q)||String(r.no).includes(q))?'grid':'none';});}
function ecAplicaBulk(){const v=($('ec-bulk').value||'').toUpperCase();if(!v){toast('Escribe el contratista a aplicar.','err');return;}let n=0;window._EC.forEach((r,i)=>{if($('ec-row-'+i).style.display!=='none'){$('ec-'+i).value=v;n++;}});toast(`Aplicado a ${n} visible(s). Revisa y guarda.`,'ok');}
async function saveEditContratistas(){
  const cambios=window._EC.map((r,i)=>({id:r.id,orig:(r.orig||'').toUpperCase(),val:($('ec-'+i).value||'').trim().toUpperCase()})).filter(x=>x.val!==x.orig);
  if(!cambios.length){toast('No cambiaste ningún contratista.','ok');return;}
  if(!confirm(`¿Guardar ${cambios.length} cambio(s) de contratista?`))return;
  markWrite();let ok=0,err=0;
  for(const c of cambios){const {error}=await sb.from('trabajadores').update({contratista:c.val}).eq('id',c.id);if(error)err++;else ok++;}
  closeModal();
  toast(err?`${ok} guardados, ${err} con error.`:`✔ ${ok} contratista(s) actualizados.`,err?'err':'ok');
  await loadObraData(OBRA.id);
}
/* ---------- v16: aplicar a la base los cambios del reporte NOI ---------- */
async function aplicarVN(){
  const difs=window._VN||[];
  const selN=[],selS=[],selSDI=[],selQ=[];
  difs.forEach((d,i)=>{
    if(!d.w)return;
    if(d.numDif&&$('vn-n-'+i)&&$('vn-n-'+i).checked)selN.push({id:d.w.id,obra_id:d.w.obra_id,num:d.e.clave,nombre:fullName(d.w)});
    if(d.sdDif&&$('vn-s-'+i)&&$('vn-s-'+i).checked)selS.push({id:d.w.id,sd:d.e.sd,oldSd:Number(d.w.sd)||0,oldSem:Number(d.w.sal_semanal)||0,nombre:fullName(d.w)});
    if(d.sdiDif&&$('vn-sdi-'+i)&&$('vn-sdi-'+i).checked)selSDI.push({id:d.w.id,sdi:d.e.sdi});
    if(d.quinDif&&$('vn-q-'+i)&&$('vn-q-'+i).checked)selQ.push({id:d.w.id,q:d.e.quincenal});
  });
  if(!selN.length&&!selS.length&&!selSDI.length&&!selQ.length){toast('No hay cambios marcados.','err');return;}
  // conflictos: el número destino lo tiene alguien FUERA de la selección (misma obra)
  const obraIds=[...new Set(selN.map(x=>x.obra_id))];
  const {data:occ,error:ocupadosError}=obraIds.length?await fetchAllRows(()=>sb.from('trabajadores').select('id,no_trab,obra_id').eq('eliminado',false).in('obra_id',obraIds)):{data:[],error:null};
  if(ocupadosError){toast('No se pudo verificar la numeración; no se aplicó ningún cambio: '+ocupadosError.message,'err');return;}
  const selIds=new Set(selN.map(x=>x.id));
  const conflictos=selN.filter(x=>(occ||[]).some(o=>o.obra_id===x.obra_id&&o.no_trab===x.num&&!selIds.has(o.id)));
  const aplicar=selN.filter(x=>!conflictos.includes(x));
  if(conflictos.length)toast(`⚠ ${conflictos.length} número(s) ocupados por trabajadores fuera de la lista — omitidos: ${conflictos.map(c=>'#'+c.num+' ('+c.nombre.split(' ')[0]+')').join(', ')}`,'err');
  if(!aplicar.length&&!selS.length&&!selSDI.length&&!selQ.length)return;
  if(!confirm(`¿Aplicar del NOI: ${aplicar.length} número(s), ${selS.length} SD, ${selSDI.length} SDI y ${selQ.length} sueldo(s) quincenal/semanal?\n\nTodo queda registrado en el historial.`))return;
  markWrite();
  let ok=0,err=0;
  // FASE 1: liberar números
  for(const x of aplicar){const {error}=await sb.from('trabajadores').update({no_trab:null}).eq('id',x.id);if(error)err++;}
  // FASE 2: asignar números del NOI
  for(const x of aplicar){const {error}=await sb.from('trabajadores').update({no_trab:x.num}).eq('id',x.id);error?err++:ok++;}
  // SD del NOI (si el semanal era SD×7, se sincroniza también)
  for(const x of selS){
    const upd={sd:x.sd};
    if(Math.abs(x.oldSem-x.oldSd*7)<0.02)upd.sal_semanal=Math.round(x.sd*7*100)/100;
    const {error}=await sb.from('trabajadores').update(upd).eq('id',x.id);error?err++:ok++;
  }
  // SDI exacto del NOI
  for(const x of selSDI){const {error}=await sb.from('trabajadores').update({sdi:x.sdi}).eq('id',x.id);error?err++:ok++;}
  // sueldo quincenal/semanal = NETO del NOI (solo cuando la quincena venía completa)
  for(const x of selQ){const {error}=await sb.from('trabajadores').update({sal_semanal:x.q}).eq('id',x.id);error?err++:ok++;}
  toast(err?`Aplicado con ${err} error(es) — revisa el historial.`:`✔ ${ok} cambio(s) del NOI aplicados a la base.`,err?'err':'ok');
  closeModal();await loadObraData(OBRA.id);refreshCounts();
}

/* ---------- v13.1: RECEPCIÓN DE TARJETAS INDEPENDIENTE ---------- */
function openRecepcionTarjetas(){
  const dig=v=>String(v??'').replace(/\D/g,'');
  const cands=WORKERS.filter(w=>w.estatus==='ACTIVO'&&String(w.cuenta||'').toUpperCase()!=='CREAR'&&dig(w.cuenta).length>=6)
    .sort((a,b)=>fullName(a).localeCompare(fullName(b)));
  if(!cands.length){toast('No hay activos con cuenta asignada en esta obra.','err');return;}
  window._RT=cands;
  const semAct=isoWeek();
  modal(`
    <div class="m-head"><h2>✍ Recepción de tarjetas · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px">Genera el <b>acuse de recibo para firmas</b> de la semana que elijas (hoja carta horizontal, ocupa toda la hoja). Marca a quienes se les entregará tarjeta. Los que importaste del banco con 🏦 ya traen su cuenta y su resolución. Por default se marcan los ingresos de la semana elegida.<br><b>El Excel sale con una hoja por contratista</b> (más una hoja RESUMEN), para entregar y firmar por cuadrilla.</p>
      <div class="grid" style="grid-template-columns:160px 1fr;align-items:end">
        <div><label>No. de semana</label><input id="rt-sem" type="number" value="${semAct}" oninput="rtMarcaSemana()"></div>
        <div style="font-size:12px;color:var(--mut)">
          <a href="#" onclick="window._RT.forEach((w,i)=>$('rt-'+i).checked=true);return false">marcar todos</a> ·
          <a href="#" onclick="window._RT.forEach((w,i)=>$('rt-'+i).checked=false);return false">ninguno</a> ·
          <input id="rt-q" placeholder="buscar..." style="width:160px;padding:3px 8px" oninput="rtFiltra()">
        </div>
      </div>
      <div id="rt-lista" style="margin-top:10px;max-height:380px;overflow:auto">
        ${cands.map((w,i)=>`<label id="rt-row-${i}" style="display:block;padding:3px 2px;font-size:12.5px">
          <input type="checkbox" id="rt-${i}"> #${w.no_trab??'—'} ${esc(fullName(w))} · cta ${esc(w.cuenta)} · <span style="color:var(--mut)">${esc(w.contratista||'SIN CONTRATISTA')}</span>${(w.observaciones||'').includes('EXISTENTE')?' · <span class="badge PENDIENTE">YA TENÍA CUENTA</span>':''}</label>`).join('')}
      </div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="exportRecepcionTarjetas()">⬇ Generar acuse para firmas</button>
    </div>`,'lg');
  rtMarcaSemana();
}
function rtMarcaSemana(){
  const sem=String($('rt-sem').value||isoWeek());
  window._RT.forEach((w,i)=>{$('rt-'+i).checked=String(w.semana_ingreso||'').replace(/\D/g,'')===sem;});
}
function rtFiltra(){
  const q=($('rt-q').value||'').toUpperCase();
  window._RT.forEach((w,i)=>{$('rt-row-'+i).style.display=(!q||fullName(w).toUpperCase().includes(q))?'':'none';});
}
function exportRecepcionTarjetas(){
  const sem=$('rt-sem').value||isoWeek();
  const sel=window._RT.filter((w,i)=>$('rt-'+i)&&$('rt-'+i).checked);
  if(!sel.length){toast('Marca al menos un trabajador.','err');return;}
  const lista=sel.map(w=>({nombre:fullName(w),cuenta:w.cuenta,contratista:w.contratista||'',
    res:(w.observaciones||'').includes('EXISTENTE')?'YA TENÍA CUENTA/TARJETA':'TARJETA NUEVA'}));
  closeModal();
  exportAcuseTarjetas(lista,sem);
}

