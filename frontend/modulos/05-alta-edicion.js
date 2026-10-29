/* ---------- formulario alta / edición ---------- */
function fld(id,label,val='',opts={}){
  const{type='text',cls='',hint='',ph='',list=''}=opts;
  return `<div class="${cls}"><label>${label}</label><input id="f-${id}" type="${type}" value="${esc(val)}" placeholder="${ph}" ${list?`list="${list}"`:''} ${opts.extra||''}><div class="fhint" id="h-${id}">${hint}</div></div>`;
}
/* Llena el selector de cuadrilla con las del contratista que se escribió.
   Si ese contratista no tiene cuadrillas, el selector queda en "—" y no estorba. */
function cuadRefresca(idSel){
  const sel=$('f-id_cuadrilla'); if(!sel)return;
  const contr=($('f-contratista')?$('f-contratista').value:'').trim();
  const actual=idSel!==undefined?idSel:sel.value;
  // No ofrecer cuadrillas retiradas en nuevas asignaciones; conservar la actual
  // al editar un registro histórico para no desasignarlo accidentalmente.
  const lista=cuadsDe(contr).filter(c=>c.activa!==false||c.id===actual);
  sel.innerHTML='<option value="">— sin cuadrilla —</option>'+
    lista.map(c=>`<option value="${c.id}" ${c.id===actual?'selected':''}>${esc(c.nombre)}${c.lider_id?' · cabeza: '+esc(cuadLider(c)):''}</option>`).join('');
  const h=$('h-id_cuadrilla');
  if(h)h.textContent=lista.length?`${lista.length} cuadrilla(s) de ${contr.toUpperCase()}`
    :(contr?`${contr.toUpperCase()} no tiene cuadrillas — se administran en 👷 Cuadrillas`:'Escribe el contratista para ver sus cuadrillas');
}
function openForm(id){
  if(!puedeEditarTrabajador()){toast('Tu usuario tiene acceso de consulta; no puede registrar ni modificar trabajadores.','err');return;}
  const w=id?WORKERS.find(x=>x.id===id):null;
  if(id&&!w){toast('No se encontró el trabajador. Actualiza el centro antes de editar.','err');return;}
  if(!OBRA){toast('Selecciona primero un centro de trabajo.','err');return;}
  const d=(w&&w.docs)||{};
  const nextNo=Math.max(0,...WORKERS.map(x=>x.no_trab||0))+1;
  const cuentaCrear=w?String(w.cuenta).toUpperCase()==='CREAR':true;
  const obrasAlta=obrasEmpresa(empresaDeObra(OBRA));
  modal(`
    <div class="m-head"><img class="wf-logo" src="${logoEmpresa(empresaDeObra(OBRA))}" alt="${esc(EMPRESAS[empresaDeObra(OBRA)].corto)}"><div><h2>${w?'Modificar · '+esc(fullName(w)):'Nueva alta'}</h2><p class="wf-context">${esc(EMPRESAS[empresaDeObra(OBRA)].corto)} · ${esc(OBRA.nombre)}</p></div><button class="x" onclick="closeModal()" aria-label="Cerrar registro">×</button></div>
    <div class="wf-stepper" role="group" aria-label="Pasos del registro">
      ${['Asignación','Datos personales','Documentos'].map((txt,i)=>`<button type="button" id="wf-tab-${i+1}" onclick="workerFormPaso(${i+1})"><span>${i+1}</span><b>${txt}</b></button>`).join('')}
    </div>
    <div class="m-body" id="worker-form-body" data-worker-id="${w?w.id:''}" data-worker-version="${esc(w?.updated_at||'')}" data-worker-obra="${esc(w?.obra_id||'')}" data-user-id="${esc(USER.id)}" data-step="1">
      <div class="sect">Obra y puesto</div>
      <div class="grid">
        <div class="c2"><label>Centro de trabajo · ${esc(EMPRESAS[EMPRESA_ACTIVA].corto)}</label><select id="f-obra_id">${obrasAlta.map(o=>`<option value="${o.id}" ${(w?w.obra_id:OBRA.id)===o.id?'selected':''}>${esc(o.nombre)}</option>`).join('')}</select><div class="fhint">Para cambiar de razón social usa “Transferir” y genera la baja/reingreso correspondiente.</div></div>
        ${fld('contratista','Contratista',w?w.contratista:'',{list:'dl-contr',extra:'oninput="cuadRefresca()"'})}
        <div><label>Cuadrilla <span style="color:var(--mut);font-weight:400">(opcional)</span></label>
          <select id="f-id_cuadrilla"></select>
          <div class="fhint" id="h-id_cuadrilla"></div></div>
        ${fld('no_trab','No. trabajador',w?(w.no_trab??''):nextNo,{type:'number'})}
        <div class="c2"><label>Puesto (catálogo unificado)</label>
          <select id="f-puesto" onchange="tabAssist()">
            <option value=""></option>
            ${catalogoPuestos().map(pu=>`<option ${(w&&w.puesto)===pu?'selected':''}>${esc(pu)}</option>`).join('')}
            ${(w&&w.puesto&&!catalogoPuestos().includes(w.puesto))?`<option selected value="${esc(w.puesto)}">${esc(w.puesto)} ⚠ (FUERA DE CATÁLOGO — elige el correcto)</option>`:''}
          </select><div class="fhint" id="h-puesto">Catálogo cerrado para no fragmentar puestos. Al elegir uno del tabulador, el salario se llena solo.</div></div>
        <div><label>Turno</label><select id="f-turno">${['DIURNO','NOCTURNO','MIXTO'].map(t=>`<option ${((w&&w.turno)||'DIURNO')===t?'selected':''}>${t}</option>`).join('')}</select></div>
        ${fld('funciones','Funciones',w?w.funciones:'',{cls:'c4'})}
        ${fld('fecha_alta','Fecha alta',w?(w.fecha_alta||''):today(),{type:'date'})}
        ${w?fld('fecha_reingreso','Fecha de reingreso',w.fecha_reingreso||'',{type:'date',hint:'Solo si volvió a entrar tras una baja. La antigüedad se cuenta desde aquí; déjala vacía para quitarla.'}):''}
        ${(w&&w.estatus!=='BAJA'&&w.fecha_baja)?fld('fecha_baja','Fecha de baja anterior',w.fecha_baja||'',{type:'date',hint:'De una baja previa (fue reactivado). Déjala vacía para eliminarla.'}):''}
        ${fld('semana_ingreso','Semana ingreso',w?w.semana_ingreso:'NOMINA '+isoWeek())}
        <div><label>Periodo de pago</label><select id="f-periodo_pago">${['SEMANAL','QUINCENAL'].map(p=>`<option ${((w&&w.periodo_pago)||'SEMANAL')===p?'selected':''}>${p}</option>`).join('')}</select></div>
        ${w&&w.estatus==='BAJA'?`
        <div class="c4" style="grid-column:span 4;background:var(--red-bg);border-radius:8px;padding:10px 12px">
          <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px">
            <div><label>Fecha de baja</label><input id="f-fecha_baja" type="date" value="${esc(w.fecha_baja||'')}"></div>
            <div><label>Monto finiquito ($)</label><input id="f-monto_finiquito" type="number" step="0.01" value="${w.monto_finiquito??''}"></div>
            <div><label>Motivo de baja</label><select id="f-motivo_baja">${MOTIVOS_BAJA.map(m2=>`<option ${(w.motivo_baja||'')===m2?'selected':''}>${m2}</option>`).join('')}</select></div>
          </div>
        </div>`:''}
        <div class="c2"><label>Tipo de contrato</label><select id="f-tipo_contrato">${['OBRA DETERMINADA','TIEMPO INDETERMINADO','TIEMPO DETERMINADO'].map(t2=>`<option ${((w&&w.tipo_contrato)||(OBRA.tipo==='OFICINA'?'TIEMPO INDETERMINADO':'OBRA DETERMINADA'))===t2?'selected':''}>${t2}</option>`).join('')}</select></div>
        ${fld('fecha_fin_contrato','Fin contrato (si es det.)',w?(w.fecha_fin_contrato||''):'',{type:'date'})}
        <div><label>SD ($)</label><input id="f-sd" type="number" step="0.01" value="${esc(w?(w.sd??''):'')}">
          <div class="fhint" id="h-sd">Mín. CONASAMI 2026: $315.04 · 
          <a href="#" onclick="event.preventDefault();smAssist(10)">SM+10</a> · <a href="#" onclick="event.preventDefault();smAssist(20)">SM+20</a> · <a href="#" onclick="event.preventDefault();smAssist(30)">SM+30</a></div></div>
        ${fld('sdi','SDI ($)',w?(w.sdi??''):'',{type:'number',extra:'step="any"',hint:'Conserva los decimales completos del reporte NOI; no redondear al capturar.'})}
        ${fld('sal_semanal','Salario del periodo ($)',w?(w.sal_semanal??''):'',{type:'number',extra:'step="0.01"',hint:'Monto que cobra por semana o por quincena según su periodo.'})}
      </div>
      <div class="sect">Datos personales</div>
      <div id="wf-privacy" class="wf-note">Antes de capturar datos, entrega el <a href="privacidad.html" target="_blank" rel="noopener">aviso de privacidad</a> de la razón social y verifica el consentimiento exigible para datos financieros o sensibles. No uses estado civil para decidir una contratación.</div>
      <div class="grid">
        ${fld('primer_apellido','Primer apellido',w?w.primer_apellido:'')}
        ${fld('segundo_apellido','Segundo apellido',w?w.segundo_apellido:'')}
        ${fld('nombres','Nombre(s) *',w?w.nombres:'',{cls:'c2'})}
        ${fld('curp','CURP',w?w.curp:'',{cls:'c2',hint:'18 caracteres. Llena fecha de nacimiento, género y estado de nacimiento automáticamente.',extra:'maxlength="18" oninput="curpAssist()"'})}
        ${fld('rfc','RFC',w?w.rfc:'',{hint:'13 caracteres con homoclave.',extra:'maxlength="13" oninput="rfcAssist()"'})}
        ${fld('nss','NSS',w?w.nss:'',{hint:'11 dígitos.',extra:'maxlength="11"'})}
        ${fld('fecha_nacimiento','Fecha nacimiento (DD/MM/AAAA)',w?isoADMY(w.fecha_nacimiento):'',{ph:'DD/MM/AAAA',hint:'Formato: día / mes / año',extra:'maxlength="10" inputmode="numeric" oninput="fechaDMYinput(this)"'})}
        <div><label>Género</label><select id="f-genero"><option value=""></option>${['MASCULINO','FEMENINO'].map(g=>`<option ${(w&&w.genero)===g?'selected':''}>${g}</option>`).join('')}</select></div>
        <div><label>Estado civil</label><select id="f-estado_civil"><option value=""></option>${['SOLTERO','CASADO','UNION LIBRE','DIVORCIADO','VIUDO'].map(x=>`<option ${(w&&w.estado_civil)===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div><label>Escolaridad</label><select id="f-escolaridad"><option value=""></option>${['SIN ESTUDIOS','PRIMARIA','SECUNDARIA','PREPA','CARRERA TECNICA','LICENCIATURA','POSGRADO'].map(x=>`<option ${(w&&w.escolaridad)===x?'selected':''}>${x}</option>`).join('')}</select></div>
        ${fld('nacionalidad','Nacionalidad',w?w.nacionalidad:'MEXICANA')}
        <div><label>Edo. nacimiento</label>
          <input id="f-edo_nacimiento" value="${esc(w?w.edo_nacimiento:'HIDALGO')}" ${(w&&String(w.edo_nacimiento||'').trim())?'':'data-default="1"'} oninput="this.removeAttribute('data-default')">
          <div class="fhint" id="h-edo_nacimiento">Se llena solo con la CURP (posiciones 12-13, catálogo RENAPO).</div>
        </div>
        <div class="c3"><label>Dirección</label>
          <div style="display:flex;gap:8px">
            <input id="f-direccion" value="${esc(w?w.direccion:'')}" style="flex:1">
            <button type="button" class="btn" style="padding:8px 12px;white-space:nowrap" onclick="openDireccionAsistente()">🏠 FORMATO OFICIAL</button>
          </div>
          <div class="fhint" id="h-direccion">El asistente arma el domicilio en el orden oficial de Correos de México y normaliza las abreviaturas.</div>
        </div>
        ${fld('cp','C.P.',w?w.cp:'',{extra:'maxlength="5"'})}
        ${fld('telefono','Teléfono',w?w.telefono:'',{hint:'10 dígitos.',extra:'maxlength="10"'})}
        <div class="c2"><label>Correo electrónico</label>
          <div style="display:flex;gap:8px">
            <input id="f-correo" value="${esc(w?w.correo:'')}" style="flex:1">
            <button type="button" class="btn" style="padding:8px 12px;white-space:nowrap" onclick="crearCorreo()">✉ CREAR CORREO</button>
          </div>
          <div class="fhint" id="h-correo">CREAR CORREO prepara la dirección y abre AtomicMail. Configura una contraseña única directamente con el proveedor.</div>
        </div>
        ${fld('beneficiario','Beneficiario',w?w.beneficiario:'')}
        ${fld('benef_parentesco','Parentesco del beneficiario',w?(w.benef_parentesco||''):'',{ph:'ej. ESPOSA, HIJO, MADRE'})}
        ${fld('benef_telefono','Teléfono del beneficiario',w?(w.benef_telefono||''):'')}
        ${fld('benef_porcentaje','Porcentaje asignado (%)',w?(w.benef_porcentaje??''):'',{type:'number',ph:'100'})}
      </div>
      <div class="sect">Datos bancarios</div>
      <div class="grid">
        <div class="c2"><label>Cuenta</label>
          <select id="f-cuenta-modo" onchange="cuentaModo()">
            <option value="CREAR" ${cuentaCrear?'selected':''}>CREAR — solicitar tarjeta BBVA (entra a la requisición)</option>
            <option value="NUM" ${!cuentaCrear?'selected':''}>El trabajador ya tiene cuenta</option>
          </select></div>
        ${fld('cuenta','Número de cuenta',w&&!cuentaCrear?w.cuenta:'',{cls:'c2',extra:'maxlength="20"'})}
        ${fld('clabe','CLABE interbancaria',w?w.clabe:'',{cls:'c2',hint:'18 dígitos. Detecta el banco automáticamente.',extra:'maxlength="18" oninput="clabeAssist()"'})}
        ${fld('banco','Banco',w?(w.banco||'BBVA'):'BBVA',{hint:'Se detecta por la CLABE.'})}
        <div><label>Forma de pago</label><select id="f-forma_pago">${['TRANSFERENCIA','EFECTIVO','CHEQUE'].map(x=>`<option ${((w&&w.forma_pago)||'TRANSFERENCIA')===x?'selected':''}>${x}</option>`).join('')}</select></div>
        ${fld('observaciones','Observaciones',w?w.observaciones:'',{cls:'c3',hint:'Si el banco no es BBVA, aquí se anota qué banco es.'})}
      </div>
      <div class="sect">Documentación</div>
      <div id="wf-documentos">${DOCS.map(k=>{
        const clave=k.replace(/[^A-Z]/g,''),v=d[k]||'PENDIENTE';
        return `<div class="wf-doc" data-status="${esc(v)}"><div><b>${esc(k)}</b><span id="doc-status-${clave}" class="wf-doc-status">${v==='ENTREGADO'?'Entregado':v==='NO APLICA'?'No aplica':'Pendiente'}</span></div>
          <input type="hidden" id="doc-${clave}" value="${esc(v)}">
          <label><input type="checkbox" id="doc-ent-${clave}" ${v==='ENTREGADO'?'checked':''} onchange="formDocEstado('${clave}','ENTREGADO',this.checked)"> Entregado</label>
          <label><input type="checkbox" id="doc-na-${clave}" ${v==='NO APLICA'?'checked':''} onchange="formDocEstado('${clave}','NO APLICA',this.checked)"> No aplica</label></div>`;
      }).join('')}</div>
      <div id="wf-drive" style="margin-top:12px"><label>Carpeta Drive del trabajador (opcional)</label><input id="f-drive_link" value="${esc(w?w.drive_link:'')}" placeholder="https://drive.google.com/..."></div>
      <datalist id="dl-contr">${[...new Set([...WORKERS.map(x=>x.contratista).filter(Boolean),...CONTRATISTAS.map(c=>c.nombre)])].sort().map(c=>`<option>${esc(c)}</option>`).join('')}</datalist>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <span id="wf-progress" class="wf-progress" role="status"></span>
      <button class="btn" id="wf-back" onclick="workerFormPaso(Number($('worker-form-body').dataset.step)-1)">← Anterior</button>
      <button class="btn dark" id="wf-next" onclick="workerFormPaso(Number($('worker-form-body').dataset.step)+1)">Siguiente →</button>
      <button class="btn dark" id="save-btn" onclick="saveWorker(${w?`'${w.id}'`:'null'})">💾 Guardar ${w?'cambios':'alta'}</button>
    </div>`,'worker-form');
  organizarFormularioTrabajador();
  cuentaModo();
  cuadRefresca(w?(w.id_cuadrilla||''):'');
  actualizarResumenFormulario();
  workerFormPaso(1,false);
}
function organizarFormularioTrabajador(){
  const root=$('worker-form-body');if(!root)return;
  const grupos=new Map(),usados=new Set();
  root.querySelectorAll('.grid input,.grid select').forEach(el=>{if(el.id)grupos.set(el.id.replace(/^f-/,''),el.closest('.grid > div'));});
  const datalists=Array.from(root.querySelectorAll('datalist')),privacy=$('wf-privacy');
  const titulos=['Asignación y condiciones de trabajo','Datos del trabajador','Documentos y revisión'];
  const textos=['Selecciona contratista y cuadrilla, confirma las fechas y el salario.','Captura su identidad, contacto y forma de pago. Los datos complementarios están desplegables.','Marca lo recibido, revisa el resumen y guarda. Ninguna casilla significa pendiente.'];
  const panels=titulos.map((titulo,i)=>{const p=document.createElement('section');p.id='wf-step-'+(i+1);p.className='wf-panel';p.innerHTML=`<h2 tabindex="-1">${titulo}</h2><p class="wf-intro">${textos[i]}</p>`;return p;});
  const tarjeta=(paso,titulo,ids,opcional=false)=>{
    const cont=document.createElement(opcional?'details':'article');cont.className=opcional?'wf-optional':'wf-card';
    cont.innerHTML=`<${opcional?'summary':'h3'}>${titulo}</${opcional?'summary':'h3'}><div class="wf-grid"></div>`;
    if(ids.includes('sd')){cont.classList.add('wf-wide');cont.lastElementChild.classList.add('wf-salarios');}
    const grid=cont.lastElementChild;
    ids.forEach(id=>{const g=grupos.get(id);if(g&&!usados.has(g)){if(id==='puesto')g.classList.remove('c2');usados.add(g);grid.appendChild(g);}});
    if(grid.children.length)panels[paso-1].appendChild(cont);
    return cont;
  };
  tarjeta(1,'Contratista y cuadrilla',['contratista','id_cuadrilla','puesto','no_trab']);
  tarjeta(1,'Centro y fechas',['obra_id','fecha_alta','fecha_reingreso','fecha_baja','semana_ingreso','periodo_pago','turno']);
  tarjeta(1,'Salario registrado',['sd','sdi','sal_semanal']);
  tarjeta(1,'Contrato y funciones · datos complementarios',['tipo_contrato','fecha_fin_contrato','funciones'],true);
  if(privacy)panels[1].appendChild(privacy);
  tarjeta(2,'Identidad',['primer_apellido','segundo_apellido','nombres','curp','rfc','nss']);
  tarjeta(2,'Contacto',['telefono','correo']);
  tarjeta(2,'Datos bancarios y forma de pago',['cuenta-modo','cuenta','clabe','banco','forma_pago','observaciones']);
  tarjeta(2,'Domicilio y datos personales complementarios',['fecha_nacimiento','genero','estado_civil','escolaridad','nacionalidad','edo_nacimiento','direccion','cp'],true);
  tarjeta(2,'Beneficiario · contacto y porcentaje',['beneficiario','benef_parentesco','benef_telefono','benef_porcentaje'],true);
  // Conserva cualquier campo legado/futuro que no esté en el mapeo explícito.
  const extras=[...grupos].filter(([,g])=>g&&!usados.has(g)).map(([id])=>id);
  tarjeta(2,'Otros datos del expediente',extras,true);
  const documentos=document.createElement('article');documentos.className='wf-card';documentos.innerHTML='<h3>Recepción de documentos <span id="wf-doc-count"></span></h3>';
  documentos.appendChild($('wf-documentos'));documentos.appendChild($('wf-drive'));panels[2].appendChild(documentos);
  const revision=document.createElement('article');revision.className='wf-card';revision.innerHTML='<h3>Antes de guardar</h3><dl class="wf-review" id="wf-review"></dl><p class="wf-note">El alta IMSS, sus acuses, el registro patronal propio y la prima de riesgo se gestionan después desde la ficha → Control IMSS. Esta lista registra recepción; no sustituye el archivo del documento.</p>';panels[2].appendChild(revision);
  root.replaceChildren(...panels,...datalists);
  root.querySelectorAll('label').forEach(label=>{if(!label.htmlFor&&!label.querySelector('input')){const control=label.parentElement.querySelector('input:not([type="hidden"]),select');if(control&&control.id)label.htmlFor=control.id;}});
  const cambio=()=>{root.dataset.dirty='1';actualizarResumenFormulario();};
  root.addEventListener('input',cambio);root.addEventListener('change',cambio);
}
function workerFormPaso(paso,enfocar=true){
  const root=$('worker-form-body');if(!root||root.dataset.busy==='1')return;
  const n=Math.max(1,Math.min(3,Number(paso)||1));root.dataset.step=String(n);
  [1,2,3].forEach(i=>{const p=$('wf-step-'+i),b=$('wf-tab-'+i);p.hidden=i!==n;if(i===n)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  $('wf-back').hidden=n===1;$('wf-next').hidden=n===3;$('save-btn').hidden=n!==3;
  $('wf-progress').textContent='PASO '+n+' DE 3';root.scrollTop=0;
  actualizarResumenFormulario();
  if(enfocar)$('wf-step-'+n).querySelector('h2').focus({preventScroll:true});
}
function formDocEstado(clave,estado,marcado){
  const valor=marcado?estado:'PENDIENTE';$('doc-'+clave).value=valor;
  $('doc-ent-'+clave).checked=valor==='ENTREGADO';$('doc-na-'+clave).checked=valor==='NO APLICA';
  const status=$('doc-status-'+clave);status.textContent=valor==='ENTREGADO'?'Entregado':valor==='NO APLICA'?'No aplica':'Pendiente';
  status.closest('.wf-doc').dataset.status=valor;
  $('worker-form-body').dataset.dirty='1';actualizarResumenFormulario();
}
function actualizarResumenFormulario(){
  const resumen=$('wf-review');if(!resumen)return;
  const valor=id=>($('f-'+id)?.value||'').trim();
  let entregados=0,noAplica=0;DOCS.forEach(k=>{const v=$('doc-'+k.replace(/[^A-Z]/g,''))?.value;entregados+=Number(v==='ENTREGADO');noAplica+=Number(v==='NO APLICA');});
  $('wf-doc-count').textContent=`· ${entregados} entregados · ${DOCS.length-entregados-noAplica} pendientes`;
  const obra=OBRAS.find(o=>o.id===valor('obra_id')),cuad=CUADS.find(q=>q.id===valor('id_cuadrilla'));
  const campos=[['Trabajador',[valor('primer_apellido'),valor('segundo_apellido'),valor('nombres')].filter(Boolean).join(' ')||'Nombre por capturar'],['Empresa y centro',`${EMPRESAS[empresaDeObra(obra||OBRA)].corto} · ${obra?.nombre||'—'}`],['Contratista y cuadrilla',[valor('contratista')||'Por capturar',cuad?.nombre||'Sin cuadrilla'].join(' · ')],['Ingreso / reingreso',fmtD(valor('fecha_reingreso')||valor('fecha_alta'))||'Por capturar'],['Salario del periodo',valor('sal_semanal')?'$'+money(valor('sal_semanal'))+' · '+valor('periodo_pago'):'Por capturar'],['Documentos',`${entregados} entregados · ${noAplica} no aplican · ${DOCS.length-entregados-noAplica} pendientes`]];
  resumen.innerHTML=campos.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
}
function formEnfocarError(){
  const root=$('worker-form-body'),el=root&&root.querySelector('.err');if(!el)return;
  const panel=el.closest('.wf-panel');if(panel)workerFormPaso(Number(panel.id.slice(-1)),false);
  let p=el.parentElement;while(p&&p!==root){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}
  el.focus();
}
function formGuardando(valor){
  const root=$('worker-form-body');if(root)root.dataset.busy=valor?'1':'0';
  ['save-btn','wf-back','wf-next','wf-tab-1','wf-tab-2','wf-tab-3'].forEach(id=>{const b=$(id);if(b)b.disabled=!!valor;});
  if($('save-btn'))$('save-btn').innerHTML=valor?'<span class="spin"></span> Guardando…':'💾 Guardar '+(root?.dataset.workerId?'cambios':'alta');
}
function openIMSSWorker(id){
  if(!puedeEditarTrabajador()){toast('Tu usuario solo puede consultar.','err');return;}
  const w=WORKERS.find(x=>x.id===id);if(!w)return;
  const estados=['SIN MOVIMIENTO','ALTA PRESENTADA','ALTA CON ACUSE','MODIFICACION PRESENTADA','MODIFICACION CON ACUSE','BAJA PRESENTADA','BAJA CON ACUSE'];
  const mov=w.movimiento_imss||'SIN MOVIMIENTO';if(!estados.includes(mov))estados.push(mov);
  window._IMSS_WORKER_EDIT={id,updated_at:w.updated_at};
  modal2(`<div class="m-head"><h2>🏥 Control IMSS · ${esc(fullName(w))}</h2><button class="x" onclick="closeModal2()">×</button></div>
    <div class="m-body"><p class="wf-note">Gestiona aquí la presentación del movimiento y las excepciones patronales. Marcar “ALTA PRESENTADA” no exige subir el acuse: su archivo se controla por separado. No cambies fechas para ocultar un aviso.</p>
      <article class="wf-card"><h3>Movimiento afiliatorio</h3><div class="wf-grid">
        <div><label for="imss-mov">Estado del movimiento</label><select id="imss-mov">${estados.map(s=>`<option value="${esc(s)}" ${s===mov?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
        <div><label for="imss-fecha">Fecha del movimiento IMSS</label><input type="date" id="imss-fecha" value="${esc(w.fecha_mov_imss||'')}"><div class="fhint">Captura la fecha correspondiente al alta, reingreso, modificación o baja que estás presentando.</div></div>
      </div><div style="margin-top:14px">${marcadoresIMSS(w)}</div></article>
      <details class="wf-optional" ${tieneRPpropio(w)?'open':''}><summary>Registro patronal propio y prima de riesgo · excepciones</summary><div class="wf-grid">
        <div><label for="imss-rp">Registro patronal propio</label><input id="imss-rp" maxlength="11" value="${esc(w.registro_patronal||'')}"><div class="fhint">Vacío = registro patronal del centro: ${esc(rpDe({...w,registro_patronal:null}))}.</div></div>
        <div><label for="imss-prima">Prima RT propia (%)</label><input type="number" step="0.00001" min="0" max="100" id="imss-prima" value="${esc(w.prima_rt??'')}"><div class="fhint">Vacío = prima del centro. Solo modifica si corresponde a su registro patronal.</div></div>
      </div></details>
    </div><div class="m-foot"><button class="btn" onclick="closeModal2()">Cancelar</button><button class="btn dark" id="imss-save" onclick="saveIMSSWorker('${w.id}')">Guardar control IMSS</button></div>`,'lg');
}
async function saveIMSSWorker(id){
  if(!puedeEditarTrabajador()){toast('Tu usuario solo puede consultar.','err');return;}
  const w=WORKERS.find(x=>x.id===id),btn=$('imss-save');
  if(!w||!btn||btn.disabled||window._IMSS_WORKER_EDIT?.id!==id)return;
  const rp=$('imss-rp').value.trim().toUpperCase(),prima=$('imss-prima').value.trim(),fecha=$('imss-fecha').value,mov=$('imss-mov').value;
  if(rp&&!/^[A-Z]\d{10}$/.test(rp)){toast('Registro patronal inválido: una letra y diez dígitos.','err');$('imss-rp').focus();return;}
  if(prima!==''&&(!Number.isFinite(Number(prima))||Number(prima)<0||Number(prima)>100)){toast('La prima debe ser un porcentaje válido entre 0 y 100.','err');return;}
  if(fecha&&!fechaAcuseISO(fecha)){toast('Fecha del movimiento inválida.','err');return;}
  if(mov!=='SIN MOVIMIENTO'&&!fecha){toast('Indica la fecha de este movimiento para distinguirlo de altas o reingresos anteriores.','err');$('imss-fecha').focus();return;}
  const cambios={movimiento_imss:mov,fecha_mov_imss:fecha||null,registro_patronal:rp||null,prima_rt:prima!==''?Number(prima):null,actualizado_por:USER.email};
  btn.disabled=true;btn.textContent='Guardando…';markWrite();
  try{
    let q=sb.from('trabajadores').update(cambios).eq('id',id).eq('obra_id',w.obra_id);
    if(window._IMSS_WORKER_EDIT.updated_at)q=q.eq('updated_at',window._IMSS_WORKER_EDIT.updated_at);
    const {data,error}=await q.select('id,updated_at');
    if(error)throw error;
    if(!data||data.length!==1)throw new Error('El registro cambió o no tienes permiso. Actualiza la ficha antes de volver a guardar.');
    Object.assign(w,cambios,{updated_at:data[0].updated_at});
    closeModal2();renderTable();openDetail(id);toast('Control IMSS actualizado; los datos generales se conservaron.','ok');
  }catch(e){toast('No se guardó: '+e.message,'err');}
  finally{if($('imss-save')===btn){btn.disabled=false;btn.textContent='Guardar control IMSS';}}
}
function sdiInicialSugerido(sd){
  // Primer año: aguinaldo 15 días y prima de 25% sobre 12 días de vacaciones.
  // Es una sugerencia; un SDI de NOI documentado siempre se conserva al editar.
  return (Number(sd)*(1+(15+12*.25)/365)).toFixed(4);
}
function tabAssist(){
  const tab=CFGEMP['tabulador']||{};
  const p=$('f-puesto').value.trim().toUpperCase();
  const sd=tab[p];
  if(!sd){if($('h-puesto'))$('h-puesto').textContent='Al elegir un puesto del tabulador, el salario se llena solo.';return;}
  $('f-sd').value=sd;
  const versionOriginal=$('worker-form-body')?.dataset?.workerId;
  const actual=Number($('f-sdi').value),sdAnterior=Number(WORKERS.find(w=>w.id===versionOriginal)?.sd);
  // Una sugerencia del tabulador no sustituye el SDI documentado al editar.
  if(!versionOriginal||!actual||Number(sd)!==sdAnterior)$('f-sdi').value=sdiInicialSugerido(sd);
  const nn=semanalNeto(sd,$('f-sdi').value);
  if(!$('f-sal_semanal').value)$('f-sal_semanal').value=nn.neto.toFixed(2);
  $('h-puesto').innerHTML=`<b>Tabulador aplicado:</b> SD $${sd} · SDI $${esc($('f-sdi').value)} · <b>semanal NETO $${money(nn.neto)}</b> = bruto $${money(nn.bruto)} − ISR $${money(nn.isr)}${nn.sub?` (ya con subsidio $${money(nn.sub)})`:''} − IMSS $${money(nn.imss)}. El SDI nuevo es una estimación de primer año (15 días de aguinaldo, 12 de vacaciones y prima 25%); valida antigüedad, prestaciones y valor de NOI.`;
}
function cuentaModo(){
  const crear=$('f-cuenta-modo').value==='CREAR';
  $('f-cuenta').disabled=crear;
  if(crear){$('f-cuenta').value='';$('h-cuenta').textContent='Se marcará CUENTA: CREAR y entrará a la próxima requisición de tarjetas.';}
  else $('h-cuenta').textContent='';
}
/* ---------- v32: autorrelleno desde CURP / RFC ----------
   Catálogo oficial de RENAPO: posiciones 12-13 de la CURP = entidad de
   nacimiento. Es una tabla fija publicada por el gobierno, así que esto
   funciona 100% sin internet y sin depender de ningún servicio externo. */
const CURP_EDOS={AS:'AGUASCALIENTES',BC:'BAJA CALIFORNIA',BS:'BAJA CALIFORNIA SUR',CC:'CAMPECHE',
  CL:'COAHUILA',CM:'COLIMA',CS:'CHIAPAS',CH:'CHIHUAHUA',DF:'CIUDAD DE MEXICO',DG:'DURANGO',
  GT:'GUANAJUATO',GR:'GUERRERO',HG:'HIDALGO',JC:'JALISCO',MC:'MEXICO',MN:'MICHOACAN',
  MS:'MORELOS',NT:'NAYARIT',NL:'NUEVO LEON',OC:'OAXACA',PL:'PUEBLA',QT:'QUERETARO',
  QR:'QUINTANA ROO',SP:'SAN LUIS POTOSI',SL:'SINALOA',SR:'SONORA',TC:'TABASCO',
  TS:'TAMAULIPAS',TL:'TLAXCALA',VZ:'VERACRUZ',YN:'YUCATAN',ZS:'ZACATECAS',NE:'NACIDO EN EL EXTRANJERO'};
/* Lee todo lo que la CURP contiene de forma determinista. No adivina nada:
   si un dato no está en la CURP, regresa vacío. */
function datosDeCurp(c){
  c=String(c||'').toUpperCase().replace(/\s/g,'');
  const out={fecha:'',genero:'',edo:'',rfcBase:''};
  if(!/^[A-Z]{4}\d{6}/.test(c))return out;
  const yy=+c.slice(4,6),mm=c.slice(6,8),dd=c.slice(8,10);
  // el siglo se decide por el carácter 17: dígito = 1900s, letra = 2000s (regla RENAPO)
  const c17=c[16]||'';
  const siglo=/[A-Z]/.test(c17)?2000:(c17?1900:(yy<=(new Date().getFullYear()%100)?2000:1900));
  const yyyy=siglo+yy;
  const f=`${yyyy}-${mm}-${dd}`;
  const d=new Date(f+'T12:00');
  if(!isNaN(d)&&d.getDate()===+dd&&d.getMonth()+1===+mm)out.fecha=f;
  if(c.length>=11)out.genero=c[10]==='H'?'MASCULINO':(c[10]==='M'?'FEMENINO':'');
  if(c.length>=13)out.edo=CURP_EDOS[c.slice(11,13)]||'';
  if(c.length>=10)out.rfcBase=c.slice(0,10); // los 10 primeros de la CURP = los 10 del RFC (persona física)
  return out;
}
function curpAssist(){
  const c=$('f-curp').value.toUpperCase().replace(/\s/g,'');$('f-curp').value=c;
  const d=datosDeCurp(c);
  const puestos=[];
  // solo rellena lo que esté VACÍO — nunca pisa un dato ya capturado a mano
  if(d.fecha&&!$('f-fecha_nacimiento').value){$('f-fecha_nacimiento').value=isoADMY(d.fecha);puestos.push('fecha de nacimiento');}
  if(d.genero&&!$('f-genero').value){$('f-genero').value=d.genero;puestos.push('género');}
  // El estado de nacimiento trae "HIDALGO" precargado por defecto en las altas nuevas.
  // Ese valor por defecto SÍ se reemplaza con lo que diga la CURP (marcado con
  // data-default); un valor escrito a mano NO se pisa: solo se avisa la discrepancia.
  const elEdo=$('f-edo_nacimiento');
  if(d.edo&&elEdo){
    const vacio=!String(elEdo.value||'').trim(), esDefault=elEdo.hasAttribute('data-default');
    if(vacio||esDefault){
      elEdo.value=d.edo; elEdo.removeAttribute('data-default');
      puestos.push('estado de nacimiento');
      $('h-edo_nacimiento').innerHTML='<span style="color:var(--green)">✔ Tomado de la CURP.</span>';
    }else if(String(elEdo.value).trim().toUpperCase()!==d.edo){
      $('h-edo_nacimiento').innerHTML=`<span class="bad">⚠ La CURP indica <b>${d.edo}</b>. <a href="#" onclick="event.preventDefault();$('f-edo_nacimiento').value='${d.edo}';$('h-edo_nacimiento').innerHTML='✔ Corregido con la CURP.';">Usar el de la CURP</a></span>`;
    }else{
      $('h-edo_nacimiento').innerHTML='<span style="color:var(--green)">✔ Coincide con la CURP.</span>';
    }
  }
  if(d.rfcBase&&$('f-rfc')&&!String($('f-rfc').value||'').trim()){
    $('f-rfc').value=d.rfcBase;
    $('h-rfc').innerHTML='<span style="color:var(--amber)">Se llenaron los 10 primeros del RFC desde la CURP. <b>Falta la homoclave (3 caracteres)</b> — cópiala de la Constancia de Situación Fiscal.</span>';
  }
  $('h-curp').innerHTML=puestos.length
    ?`<span style="color:var(--green)">✔ Se llenó solo: ${puestos.join(', ')}.</span>`
    :'18 caracteres. Llena fecha de nacimiento, género y estado de nacimiento automáticamente.';
  valMark('curp',c===''||RX.curp.test(c));
}
/* Cruza el RFC contra la CURP: la fecha de nacimiento debe coincidir. */
function rfcAssist(){
  const r=$('f-rfc').value.toUpperCase().replace(/\s/g,'');$('f-rfc').value=r;
  const c=String($('f-curp').value||'').toUpperCase();
  let msg='13 caracteres con homoclave.';
  const mR=r.match(/^[A-ZÑ&]{3,4}(\d{6})/);
  if(mR){
    const f=`${mR[1].slice(0,2)}-${mR[1].slice(2,4)}-${mR[1].slice(4,6)}`;
    const mC=c.match(/^[A-Z]{4}(\d{6})/);
    if(mC&&mC[1]!==mR[1])msg='<span class="bad">⚠ La fecha de nacimiento del RFC no coincide con la de la CURP. Revisa cuál está mal antes de guardar.</span>';
    else if(r.length<12)msg=`<span style="color:var(--amber)">Falta la homoclave: un RFC de persona física lleva 13 caracteres.</span>`;
    else msg=`<span style="color:var(--green)">✔ RFC consistente con la CURP (nac. ${f}).</span>`;
  }
  $('h-rfc').innerHTML=msg;
  valMark('rfc',r===''||RX.rfc.test(r));
}
/* ---------- v32: asistente de dirección en formato oficial SEPOMEX ----------
   Todo el procesamiento es local: normaliza abreviaturas y arma el domicilio
   en el orden que pide Correos de México. NO consulta ningún servicio externo. */
const DIR_ABREV=[[/\bC\.?\s+(?=[A-ZÑ])/g,'CALLE '],[/\bAV(?:DA|E)?\.?\s+/g,'AVENIDA '],
  [/\bBLVD?\.?\s+/g,'BOULEVARD '],[/\bCDA\.?\s+/g,'CERRADA '],[/\bPRIV\.?\s+/g,'PRIVADA '],
  [/\bAND\.?\s+/g,'ANDADOR '],[/\bCARR\.?\s+/g,'CARRETERA '],[/\bPROL\.?\s+/g,'PROLONGACION '],
  [/\bFRACC\.?\s+/g,'FRACCIONAMIENTO '],[/\bMZ(?:A|NA)?\.?\s*/g,'MANZANA '],[/\bLT(?:E)?\.?\s*/g,'LOTE '],
  [/\bNO\.?\s*(?=\d)/g,'NUM. '],[/\bNUM(?:ERO)?\.?\s*(?=\d)/g,'NUM. '],[/#\s*/g,'NUM. '],
  [/\bS\/N\b/g,'SIN NUMERO'],[/\bINT\.?\s*/g,'INTERIOR '],[/\bEXT\.?\s*/g,'EXTERIOR ']];
function normalizaDir(s){
  let t=String(s||'').toUpperCase()
    .replace(/[ÁÀÄÂ]/g,'A').replace(/[ÉÈËÊ]/g,'E').replace(/[ÍÌÏÎ]/g,'I')
    .replace(/[ÓÒÖÔ]/g,'O').replace(/[ÚÙÜÛ]/g,'U')
    .replace(/\s+/g,' ').trim();
  DIR_ABREV.forEach(([rx,rep])=>{t=t.replace(rx,rep);});
  return t.replace(/\s+/g,' ').replace(/\s+,/g,',').trim();
}
function openDireccionAsistente(){
  const actual=String($('f-direccion').value||'');
  // intento de separar lo que ya está capturado (best effort, el usuario corrige)
  const cpM=actual.match(/\b(\d{5})\b/);
  const colM=actual.match(/COL(?:ONIA)?\.?\s+([^,]+)/i);
  const partes=actual.split(',').map(s=>s.trim()).filter(Boolean);
  modal2(`
    <div class="m-head"><h2>🏠 Asistente de dirección · formato oficial</h2><button class="x" onclick="closeModal2()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px;font-size:12.5px">Captura por partes y la app arma el domicilio en el <b>orden oficial de Correos de México</b> (calle y número → colonia → C.P., municipio, estado), con las abreviaturas normalizadas (AV. → AVENIDA, COL. → COLONIA, etc.). Todo se procesa en tu computadora: <b>no se consulta ningún servicio externo</b>.</p>
      <div class="grid" style="grid-template-columns:2fr 1fr 1fr">
        <div><label>Calle / vialidad *</label><input id="da-calle" value="${esc(partes[0]||'')}" placeholder="CALLE HIDALGO"></div>
        <div><label>Número exterior</label><input id="da-ext" placeholder="45"></div>
        <div><label>Número interior</label><input id="da-int" placeholder="3-B"></div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:8px">
        <div><label>Colonia / asentamiento *</label><input id="da-col" value="${esc(colM?colM[1]:'')}" placeholder="CENTRO"></div>
        <div><label>Localidad (opcional)</label><input id="da-loc" placeholder="solo si es distinta al municipio"></div>
      </div>
      <div class="grid" style="grid-template-columns:.6fr 1fr 1fr;margin-top:8px">
        <div><label>C.P. *</label><input id="da-cp" maxlength="5" value="${esc(cpM?cpM[1]:String($('f-cp').value||''))}"></div>
        <div><label>Municipio / alcaldía *</label><input id="da-mun" placeholder="PACHUCA DE SOTO"></div>
        <div><label>Estado *</label><input id="da-edo" value="${esc(($('f-edo_nacimiento')&&$('f-edo_nacimiento').value)||'HIDALGO')}"></div>
      </div>
      <div style="margin-top:14px"><label>Vista previa (formato oficial)</label>
        <div id="da-prev" style="background:var(--blue-bg);border-radius:8px;padding:12px 14px;font-family:Consolas,monospace;font-size:12.5px;white-space:pre-line;min-height:44px"></div></div>
      <div class="fhint" style="margin-top:8px">El C.P. no se puede deducir solo de la calle sin un servicio de mapas de paga; tómalo del recibo de luz/agua del trabajador o consúltalo en <a href="https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/Descarga.aspx" target="_blank">el buscador oficial de Correos de México</a>.</div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal2()">Cancelar</button>
      <button class="btn dark" onclick="aplicarDireccion()">💾 Usar esta dirección</button>
    </div>`,'md');
  ['da-calle','da-ext','da-int','da-col','da-loc','da-cp','da-mun','da-edo'].forEach(id=>{
    if($(id))$(id).addEventListener('input',dirPreview);
  });
  dirPreview();
}
function dirTexto(){
  const g=id=>normalizaDir(($(id)&&$(id).value)||'');
  const calle=g('da-calle'),ext=g('da-ext'),int=g('da-int'),col=g('da-col'),
        loc=g('da-loc'),cp=(($('da-cp')&&$('da-cp').value)||'').replace(/\D/g,''),
        mun=g('da-mun'),edo=g('da-edo');
  const l1=[calle,ext?'NUM. '+ext:'',int?'INTERIOR '+int:''].filter(Boolean).join(' ');
  const l2=col?'COLONIA '+col.replace(/^COLONIA\s+/,''):'';
  const l3=[cp?'C.P. '+cp:'',loc,mun,edo].filter(Boolean).join(', ');
  return [l1,l2,l3].filter(Boolean).join(', ');
}
function dirPreview(){
  const t=dirTexto();
  $('da-prev').textContent=t||'(captura los datos y aquí verás el formato oficial)';
}
function aplicarDireccion(){
  const t=dirTexto();
  if(!t){toast('Captura al menos la calle.','err');return;}
  if($('f-direccion'))$('f-direccion').value=t;
  const cp=(($('da-cp')&&$('da-cp').value)||'').replace(/\D/g,'');
  if(cp.length===5&&$('f-cp'))$('f-cp').value=cp;
  closeModal2();
  toast('Dirección aplicada en formato oficial.','ok');
}
/* ---------- v32: autorrelleno masivo de los trabajadores YA capturados ---------- */
async function openAutorrellenar(){
  window._AUTOF={vacios:[],discrep:[]};
  toast('Revisando expedientes...');
  const {data:tw,error}=await leerPorEmpresa('trabajadores','*',q=>q.eq('eliminado',false));
  if(error){toast('Error: '+error.message,'err');return;}
  const vacios=[],discrep=[];
  (tw||[]).forEach(w=>{
    if(!w.curp||!RX.curp.test(String(w.curp).toUpperCase()))return;
    const d=datosDeCurp(w.curp);
    const upd={},dif={};
    if(d.fecha&&!w.fecha_nacimiento)upd.fecha_nacimiento=d.fecha;
    else if(d.fecha&&w.fecha_nacimiento&&String(w.fecha_nacimiento).slice(0,10)!==d.fecha)dif.fecha_nacimiento=[String(w.fecha_nacimiento).slice(0,10),d.fecha];
    if(d.genero&&!String(w.genero||'').trim())upd.genero=d.genero;
    else if(d.genero&&String(w.genero||'').trim().toUpperCase()!==d.genero)dif.genero=[w.genero,d.genero];
    if(d.edo&&!String(w.edo_nacimiento||'').trim())upd.edo_nacimiento=d.edo;
    else if(d.edo&&String(w.edo_nacimiento||'').trim().toUpperCase()!==d.edo)dif.edo_nacimiento=[w.edo_nacimiento,d.edo];
    if(Object.keys(upd).length)vacios.push({w,upd});
    if(Object.keys(dif).length)discrep.push({w,dif,upd:Object.fromEntries(Object.entries(dif).map(([k,v])=>[k,v[1]]))});
  });
  window._AUTOF={vacios,discrep};
  const sinCurp=(tw||[]).filter(w=>!w.curp||!RX.curp.test(String(w.curp).toUpperCase())).length;
  const etq={fecha_nacimiento:'Fecha nac.',genero:'Género',edo_nacimiento:'Edo. nacimiento'};
  modal(`
    <div class="m-head"><h2>🪄 Autorrellenar desde CURP · todas las obras</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px;font-size:12.5px">Lee la CURP (dato oficial de RENAPO) de cada trabajador capturado. Los <b>campos vacíos</b> se llenan sin riesgo; las <b>discrepancias</b> se listan aparte porque implican <u>corregir</u> un dato ya guardado, y ahí decides tú.</p>
      ${sinCurp?`<div class="fhint" style="margin-bottom:10px">${sinCurp} trabajador(es) no tienen CURP válida capturada y no se pueden completar así.</div>`:''}

      <div class="sect">1 · Campos vacíos por llenar (${vacios.length})</div>
      ${vacios.length?`
        <div class="imp-row head" style="grid-template-columns:2fr 1fr 1fr 1.2fr"><span>Trabajador</span><span>Fecha nac.</span><span>Género</span><span>Edo. nacimiento</span></div>
        <div style="max-height:220px;overflow:auto">
        ${vacios.map(c=>`<div class="imp-row" style="grid-template-columns:2fr 1fr 1fr 1.2fr">
          <span><b>${esc(fullName(c.w))}</b><br><span style="color:var(--mut);font-size:11px">${esc(c.w.curp)}</span></span>
          <span style="color:var(--green)">${c.upd.fecha_nacimiento?fmtD(c.upd.fecha_nacimiento):'—'}</span>
          <span style="color:var(--green)">${esc(c.upd.genero||'—')}</span>
          <span style="color:var(--green)">${esc(c.upd.edo_nacimiento||'—')}</span>
        </div>`).join('')}
        </div>`:'<div class="empty">Nada pendiente por llenar.</div>'}

      <div class="sect">2 · Discrepancias con la CURP (${discrep.length})</div>
      ${discrep.length?`
        <div style="background:var(--amber-bg);border-radius:8px;padding:10px 13px;margin-bottom:10px;font-size:12.5px;line-height:1.6">
          Estos expedientes tienen un dato distinto al que dice su CURP. Ojo: hasta la versión anterior el campo
          <b>Edo. nacimiento venía precargado con "HIDALGO"</b> en las altas nuevas, así que es normal que aparezcan
          varios así aunque el trabajador haya nacido en otro estado. <b>Aplicar la corrección sobrescribe</b> el dato
          guardado con el de la CURP.
        </div>
        <div class="imp-row head" style="grid-template-columns:2fr 1.2fr 1.6fr"><span>Trabajador</span><span>Campo</span><span>Guardado → CURP</span></div>
        <div style="max-height:240px;overflow:auto">
        ${discrep.map(c=>Object.entries(c.dif).map(([k,v])=>`<div class="imp-row" style="grid-template-columns:2fr 1.2fr 1.6fr">
          <span><b>${esc(fullName(c.w))}</b><br><span style="color:var(--mut);font-size:11px">${esc(c.w.curp)}</span></span>
          <span>${etq[k]||k}</span>
          <span><span style="color:var(--red)">${esc(k==='fecha_nacimiento'?fmtD(v[0]):v[0])||'(vacío)'}</span> → <b style="color:var(--green)">${esc(k==='fecha_nacimiento'?fmtD(v[1]):v[1])}</b></span>
        </div>`).join('')).join('')}
        </div>`:'<div class="empty">Ninguna discrepancia: todo coincide con las CURP.</div>'}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      ${vacios.length?`<button class="btn dark" onclick="aplicarAutorrellenar('vacios')">🪄 Llenar ${vacios.length} vacío(s)</button>`:''}
      ${discrep.length?`<button class="btn danger" onclick="aplicarAutorrellenar('discrep')">⚠ Corregir ${discrep.length} discrepancia(s) con la CURP</button>`:''}
    </div>`,'lg');
}
async function aplicarAutorrellenar(modo){
  const lote=(window._AUTOF||{})[modo]||[];
  if(!lote.length)return;
  const msg=modo==='discrep'
    ? `Se van a SOBRESCRIBIR datos ya guardados en ${lote.length} expediente(s) con lo que dice su CURP.\n\nEsta acción sí reemplaza información existente. ¿Continuar?`
    : `Se van a completar ${lote.length} expediente(s) con los datos de su CURP.\n\nSolo se llenan campos vacíos; nada se sobrescribe. ¿Continuar?`;
  if(!confirm(msg))return;
  markWrite();
  let ok=0,fail=0;
  for(const c of lote){
    const {error}=await sb.from('trabajadores').update({...c.upd,actualizado_por:USER.email}).eq('id',c.w.id);
    if(error)fail++;else ok++;
  }
  closeModal();
  toast(`${ok} expediente(s) ${modo==='discrep'?'corregidos':'completados'}${fail?`, ${fail} con error`:''}.`,fail?'err':'ok');
  await loadObraData(OBRA.id);
}
function clabeAssist(){
  const c=$('f-clabe').value.replace(/\D/g,'');$('f-clabe').value=c;
  if(RX.clabe.test(c)){
    const b=bankFromClabe(c);
    if(b){$('f-banco').value=b;
      if(b!=='BBVA'){$('h-banco').innerHTML=`<span class="bad">Banco distinto a BBVA (${b}). Se anotará en observaciones.</span>`;
        const o=$('f-observaciones');if(!o.value.toUpperCase().includes(b))o.value=(o.value?o.value+' | ':'')+'CUENTA '+b;
      } else $('h-banco').textContent='Detectado por la CLABE.';
    } else {$('h-banco').innerHTML='<span class="bad">CLABE de banco no identificado. Escribe el banco y anótalo en observaciones.</span>';}
  }
  valMark('clabe',c===''||RX.clabe.test(c));
}
function valMark(id,ok){const el=$('f-'+id);if(el)el.classList.toggle('err',!ok);}
function collectForm(){
  const g=id=>($('f-'+id)?$('f-'+id).value.trim():'');
  const anterior=WORKERS.find(w=>w.id===$('worker-form-body')?.dataset.workerId);
  const docs={...(anterior?.docs||{})};DOCS.forEach(k=>docs[k]=$('doc-'+k.replace(/[^A-Z]/g,'')).value);
  const crear=$('f-cuenta-modo').value==='CREAR';
  const out={
    obra_id:$('f-obra_id').value, contratista:g('contratista').toUpperCase(),
    id_cuadrilla:($('f-id_cuadrilla')&&$('f-id_cuadrilla').value)||null,
    no_trab:g('no_trab')?parseInt(g('no_trab')):null,
    puesto:g('puesto').toUpperCase(), turno:$('f-turno').value,
    funciones:g('funciones').toUpperCase(), fecha_alta:g('fecha_alta')||null, semana_ingreso:g('semana_ingreso').toUpperCase(),
    periodo_pago:$('f-periodo_pago').value,
    tipo_contrato:$('f-tipo_contrato').value, fecha_fin_contrato:g('fecha_fin_contrato')||null,
    sd:g('sd')?parseFloat(g('sd')):null, sdi:g('sdi')?parseFloat(g('sdi')):null, sal_semanal:g('sal_semanal')?parseFloat(g('sal_semanal')):null,
    primer_apellido:g('primer_apellido').toUpperCase(), segundo_apellido:g('segundo_apellido').toUpperCase(), nombres:g('nombres').toUpperCase(),
    curp:g('curp').toUpperCase(), rfc:g('rfc').toUpperCase(), nss:g('nss'),
    fecha_nacimiento:(dmyAiso(g('fecha_nacimiento'))||(/^\d{4}-\d{2}-\d{2}/.test(g('fecha_nacimiento'))?g('fecha_nacimiento').slice(0,10):null)), genero:$('f-genero').value,
    estado_civil:$('f-estado_civil').value, escolaridad:$('f-escolaridad').value,
    nacionalidad:g('nacionalidad').toUpperCase(), edo_nacimiento:g('edo_nacimiento').toUpperCase(),
    direccion:g('direccion').toUpperCase(), cp:g('cp'), telefono:g('telefono').replace(/\D/g,''), correo:g('correo').toLowerCase(),
    beneficiario:g('beneficiario').toUpperCase(),
    cuenta:crear?'CREAR':g('cuenta'), clabe:g('clabe'), banco:g('banco').toUpperCase()||'BBVA',
    forma_pago:$('f-forma_pago').value, observaciones:g('observaciones').toUpperCase(),
    docs, drive_link:g('drive_link')
  };
  // IMSS se administra en la ficha. Editar datos generales no borra ni
  // sobrescribe movimientos/registro patronal existentes (ni concurrentes).
  if($('f-movimiento_imss'))out.movimiento_imss=$('f-movimiento_imss').value;
  else if(!anterior)out.movimiento_imss='SIN MOVIMIENTO';
  if($('f-fecha_mov_imss'))out.fecha_mov_imss=g('fecha_mov_imss')||null;
  // edición de baja (solo si el formulario los muestra)
  if($('f-fecha_baja'))out.fecha_baja=g('fecha_baja')||null;
  if($('f-monto_finiquito'))out.monto_finiquito=g('monto_finiquito')?parseFloat(g('monto_finiquito')):null;
  if($('f-motivo_baja'))out.motivo_baja=$('f-motivo_baja').value;
  // fecha de reingreso editable (solo al editar; vacío = quitarla)
  if($('f-fecha_reingreso'))out.fecha_reingreso=g('fecha_reingreso')||null;
  // registro patronal / prima RT PROPIOS del trabajador (override; vacío = usa el de la obra)
  if($('f-rp_trab'))out.registro_patronal=g('rp_trab').toUpperCase()||null;
  if($('f-prima_trab'))out.prima_rt=g('prima_trab')!==''?parseFloat(g('prima_trab')):null;
  // datos del beneficiario (solo si el formulario los muestra = nuevas altas)
  if($('f-benef_parentesco'))out.benef_parentesco=g('benef_parentesco').toUpperCase()||null;
  if($('f-benef_telefono'))out.benef_telefono=g('benef_telefono').replace(/\D/g,'')||null;
  if($('f-benef_porcentaje'))out.benef_porcentaje=g('benef_porcentaje')!==''?parseFloat(g('benef_porcentaje')):null;
  return out;
}
function validateWorker(w,editId){
  // errs = BLOQUEAN el guardado (datos con formato inválido, duplicados).
  // warns = solo ADVIERTEN; el usuario puede guardar de todos modos (casos
  // reales y válidos, como una CURP y un RFC con inicio distinto).
  const errs=[], warns=[];
  const chk=(id,ok,msg)=>{valMark(id,ok);if(!ok)errs.push(msg);};
  chk('nombres',!!w.nombres,'El nombre es obligatorio.');
  chk('curp',!w.curp||RX.curp.test(w.curp),'CURP inválida (deben ser 18 caracteres con formato oficial).');
  chk('rfc',!w.rfc||RX.rfc.test(w.rfc),'RFC inválido (12-13 caracteres).');
  chk('nss',!w.nss||RX.nss.test(w.nss),'NSS inválido (deben ser 11 dígitos).');
  chk('clabe',!w.clabe||RX.clabe.test(w.clabe),'CLABE inválida (deben ser 18 dígitos).');
  chk('cp',!w.cp||RX.cp.test(w.cp),'C.P. inválido (5 dígitos).');
  chk('telefono',!w.telefono||RX.tel.test(w.telefono),'Teléfono inválido (10 dígitos).');
  chk('correo',!w.correo||RX.mail.test(w.correo),'Correo inválido.');
  chk('cuenta',w.cuenta==='CREAR'||!w.cuenta||/^\d{8,20}$/.test(w.cuenta),'Número de cuenta inválido.');
  if(w.clabe&&RX.clabe.test(w.clabe)){
    const b=bankFromClabe(w.clabe);
    if(b&&b!=='BBVA'&&!w.observaciones.includes(b))
      warns.push(`La cuenta es de ${b}: conviene anotarlo en observaciones (ej. "CUENTA ${b}").`);
    if(!b&&!w.observaciones)warns.push('Banco no identificado por la CLABE: conviene especificar el banco en observaciones.');
  }
  // CURP y RFC con inicio distinto: NO bloquea. Es un caso real y válido
  // (nombres compuestos, palabras que el SAT/RENAPO sustituyen, etc.); ambos
  // pueden ser correctos en sus instituciones. Solo se avisa para revisar.
  if(w.curp&&w.rfc&&RX.curp.test(w.curp)&&RX.rfc.test(w.rfc)&&w.curp.slice(0,4)!==w.rfc.slice(0,4))
    warns.push('El inicio de la CURP y el RFC no coincide. Puede ser correcto (hay casos válidos así en RENAPO y SAT); solo verifica que ambos estén bien capturados.');
  const dup=WORKERS.find(x=>x.curp&&w.curp&&x.curp===w.curp&&x.id!==editId);
  if(dup&&!editId)errs.push(`Ya existe un trabajador con esa CURP en esta obra: ${fullName(dup)} (${dup.estatus}).`);
  return {errs,warns};
}
/* Campos que deben estar completos para que un alta quede ACTIVO */
const CAMPOS_ALTA=[['primer_apellido','PRIMER APELLIDO'],['nombres','NOMBRE(S)'],['contratista','CONTRATISTA'],['puesto','PUESTO'],['fecha_alta','FECHA ALTA'],['sal_semanal','SALARIO'],['curp','CURP'],['rfc','RFC'],['nss','NSS'],['telefono','TELÉFONO'],['correo','CORREO']];
function datosFaltantes(w){
  const f=CAMPOS_ALTA.filter(([k])=>w[k]==null||w[k]==='').map(([,l])=>l);
  if(String(w.cuenta||'').toUpperCase()!=='CREAR'&&!w.cuenta&&!w.clabe)f.push('CUENTA/CLABE');
  return f;
}
/* v19: activa solos a los PENDIENTES "programados" (fecha de alta futura, expediente
   completo) en cuanto llega su fecha — sin que nadie tenga que entrar a darles clic.
   No toca a quien esté PENDIENTE por documentación incompleta ni a quien se puso en
   PENDIENTE a mano (pendiente_manual). Se llama cada vez que se carga la obra. */
async function activarProgramados(){
  if(!puedeEditarTrabajador())return;
  const hoy=today();
  const listos=WORKERS.filter(w=>w.estatus==='PENDIENTE'&&!w.pendiente_manual&&w.fecha_alta&&w.fecha_alta<=hoy&&datosFaltantes(w).length===0);
  if(!listos.length)return;
  const resultados=await Promise.all(listos.map(async w=>{
    try{
      const {data,error}=await sb.from('trabajadores').update({estatus:'ACTIVO'})
        .eq('id',w.id).eq('obra_id',w.obra_id).eq('estatus','PENDIENTE')
        .or('pendiente_manual.is.null,pendiente_manual.eq.false').eq('fecha_alta',w.fecha_alta).eq('eliminado',false).select('id,estatus');
      if(error||!Array.isArray(data)||data.length!==1||data[0].id!==w.id||data[0].estatus!=='ACTIVO')return false;
      w.estatus='ACTIVO';return true;
    }catch(e){return false;}
  }));
  if(resultados.some(ok=>!ok))toast('No se confirmó la activación de algunas altas programadas; su estado no se cambió en pantalla. Actualiza y revisa sus fichas.','err');
}
function formPedirSesion(){
  const root=$('worker-form-body');if(!root||!USER?.email)return;
  window._WF_RECONEXION={root,user_id:root.dataset.userId||USER.id,email:USER.email};
  modal2(`<div class="m-head"><h2>Reconectar sesión</h2><button class="x" onclick="closeModal2()">×</button></div>
    <div class="m-body"><p class="fhint">Tu captura permanece intacta. Inicia sesión con la misma cuenta y después vuelve a presionar Guardar.</p>
      <label>Correo</label><input type="email" value="${esc(USER.email)}" readonly autocomplete="username">
      <label>Contraseña</label><input id="wf-sesion-pass" type="password" autocomplete="current-password">
      <div id="wf-sesion-error" class="fhint" style="color:var(--red)" role="alert"></div></div>
    <div class="m-foot"><button class="btn" onclick="closeModal2()">Cancelar</button><button id="wf-sesion-conectar" class="btn dark" onclick="formReconectarSesion()">Reconectar</button></div>`,'md');
}
async function formReconectarSesion(){
  const ctx=window._WF_RECONEXION,btn=$('wf-sesion-conectar'),pass=$('wf-sesion-pass'),out=$('wf-sesion-error');
  if(!ctx||!btn||btn.disabled||$('worker-form-body')!==ctx.root)return;
  if(!pass?.value){if(out)out.textContent='Captura tu contraseña.';return;}
  btn.disabled=true;if(out)out.textContent='';
  try{
    const {data,error}=await sb.auth.signInWithPassword({email:ctx.email,password:pass.value});
    if(error)throw error;
    if(!data?.session||data.user?.id!==ctx.user_id)throw Error('La sesión no corresponde a la cuenta que inició esta captura.');
    USER=data.user;await cargaPermisos();
    if($('worker-form-body')!==ctx.root)return;
    closeModal2();window._WF_RECONEXION=null;
    toast('Sesión reconectada. Tus datos siguen capturados; vuelve a presionar Guardar.','ok');
  }catch(e){if(out)out.textContent='No se pudo reconectar. Verifica tu contraseña y conexión.';}
  finally{if(pass)pass.value='';if($('wf-sesion-conectar')===btn)btn.disabled=false;}
}
async function formValidarSesion(){
  const root=$('worker-form-body'),esperado=root?.dataset.userId||USER?.id;
  if(!root||!esperado){toast('Abre nuevamente la ficha antes de guardar.','err');return false;}
  try{
    const actual=await sb.auth.getSession();
    if(actual.error)throw actual.error;
    if(!actual.data?.session){formPedirSesion();return false;}
    let r=await sb.auth.getUser();
    if(r.error&&[401,403].includes(Number(r.error.status))){
      const refresco=await sb.auth.refreshSession();
      if(refresco.error||!refresco.data?.session){formPedirSesion();return false;}
      r=await sb.auth.getUser();
    }
    if(r.error)throw r.error;
    if(!r.data?.user){formPedirSesion();return false;}
    if(r.data.user.id!==esperado){toast('Cambió la cuenta de esta sesión. No se guardó; la captura sigue abierta.','err');return false;}
    USER=r.data.user;await cargaPermisos();
    if(!puedeEditarTrabajador()){toast('Tu usuario no tiene permiso para guardar trabajadores. La captura permanece abierta.','err');return false;}
    return true;
  }catch(e){
    if([401,403].includes(Number(e.status))||/AuthSessionMissing|session.*missing|refresh.*token/i.test(e.name+' '+e.message))formPedirSesion();
    else toast('No se pudo validar tu sesión. Revisa la conexión e intenta guardar otra vez; tu captura no se borró.','err');
    return false;
  }
}
async function saveWorker(id){
  if(!puedeEditarTrabajador()){toast('Tu usuario solo puede consultar.','err');return;}
  if($('save-btn')?.disabled)return;
  const w=collectForm();
  const {errs,warns}=validateWorker(w,id);
  if(errs.length){formEnfocarError();toast(errs[0],'err');if(errs.length>1)setTimeout(()=>toast(errs[1],'err'),350);return;}
  // advertencias: no bloquean, solo piden confirmar antes de guardar
  if(warns.length&&!confirm('⚠ Advertencia'+(warns.length>1?'s':'')+':\n\n• '+warns.join('\n\n• ')+'\n\n¿Guardar de todos modos?'))return;
  // candado de datos bancarios: avisa si se está CAMBIANDO una cuenta/CLABE que
  // ya existía (cambiar la cuenta de alguien que ya cobraba hace que rebote el pago)
  if(id){
    const pv=WORKERS.find(x=>x.id===id);
    if(pv){
      const ctaPrev=String(pv.cuenta||'').trim(), ctaNew=String(w.cuenta||'').trim();
      const claPrev=String(pv.clabe||'').trim(), claNew=String(w.clabe||'').trim();
      const chgCta=ctaPrev&&ctaPrev.toUpperCase()!=='CREAR'&&ctaPrev!==ctaNew;
      const chgCla=claPrev&&claPrev!==claNew;
      if(chgCta||chgCla){
        const det=[];
        if(chgCta)det.push('Cuenta:  '+ctaPrev+'  →  '+(ctaNew||'(vacío)'));
        if(chgCla)det.push('CLABE:  '+claPrev+'  →  '+(claNew||'(vacío)'));
        if(!confirm('⚠ ESTÁS CAMBIANDO LOS DATOS BANCARIOS de '+fullName(pv)+':\n\n'+det.join('\n')+'\n\nSi este trabajador ya cobraba con la cuenta anterior, cambiarla hará que le REBOTE el pago. El cambio queda registrado en el historial con tu usuario.\n\n¿Seguro que quieres cambiarla?'))return;
      }
    }
  }
  const formularioGuardando=$('worker-form-body');
  formGuardando(true);
  try{
  if(!await formValidarSesion())return;
  if($('worker-form-body')!==formularioGuardando)return;
  markWrite();
  const falt=datosFaltantes(w);
  // v19: corte semanal — si la fecha de alta cae DESPUÉS del domingo de la semana
  // en curso, el ingreso es de la próxima semana (o de otra futura) y no debe
  // activarse todavía, aunque el expediente esté completo.
  const finSemActual=weekBounds()[1];
  const esFuturo=w.fecha_alta&&w.fecha_alta>finSemActual;
  let error, msg;
  if(id){
    const prev=WORKERS.find(x=>x.id===id);
    if(prev&&prev.estatus==='PENDIENTE'&&!falt.length&&!prev.pendiente_manual&&!esFuturo)w.estatus='ACTIVO';
    ({error}=await guardarRegistroTrabajador(w,id));
    msg=w.estatus==='ACTIVO'&&prev&&prev.estatus==='PENDIENTE'
      ?'Expediente completo: el trabajador pasó automáticamente a ACTIVO.'
      :'Cambios guardados. Quedó registrado en el historial.';
  }else{
    w.creado_por=USER.email;
    w.estatus=(falt.length||esFuturo)?'PENDIENTE':'ACTIVO';
    if(esFuturo&&!falt.length)w.motivo_pendiente=`PROGRAMADO: ingresa el ${fmtD(w.fecha_alta)} (semana ${isoWeek(new Date(w.fecha_alta+'T12:00'))}). Pasa a ACTIVO solo automáticamente.`;
    ({error}=await guardarRegistroTrabajador(w,null));
    msg=esFuturo&&!falt.length
      ?`Alta guardada como PENDIENTE — su fecha de ingreso (${fmtD(w.fecha_alta)}) es de la próxima semana. No aparecerá en la dispersión de esta semana y pasará a ACTIVO solo cuando llegue su fecha.`
      :falt.length
        ?`Alta guardada como PENDIENTE — falta: ${falt.slice(0,4).join(', ')}${falt.length>4?'…':''}. Al completar sus datos pasará a ACTIVO.`
        :'Alta capturada correctamente como ACTIVO.';
  }
  // v.4: si faltan las columnas del Script 42 (registro patronal/prima propios),
  // reintenta sin ellas para no bloquear el guardado y avisa que corran el script.
  if(error&&/registro_patronal|prima_rt|benef_parentesco|benef_telefono|benef_porcentaje|id_cuadrilla/i.test(error.message||'')&&/column|does not exist|schema cache|could not find/i.test(error.message||'')){
    /* 2026-08-28: se agregó id_cuadrilla a la lista. Si faltaba el Script 56, el
       alta con cuadrilla fallaba ENTERA y el trabajador no se creaba; ahora se
       guarda sin cuadrilla y se avisa qué script falta, en vez de perder el alta. */
    const w2={...w}; delete w2.registro_patronal; delete w2.prima_rt; delete w2.benef_parentesco; delete w2.benef_telefono; delete w2.benef_porcentaje;
    const perdioCuad=/id_cuadrilla/i.test(error.message||'')&&w2.id_cuadrilla;
    if(perdioCuad)delete w2.id_cuadrilla;
    ({error}=await guardarRegistroTrabajador(w2,id));
    if(!error)toast(perdioCuad
      ?'Guardado, pero SIN CUADRILLA: falta correr el Script 56 en Supabase. Vuelve a asignársela después de correrlo.'
      :'Guardado, pero algunos campos nuevos (registro patronal/prima o datos del beneficiario) NO se aplicaron: falta correr el Script 42 o 47 en Supabase.','err');
  }
  if(error){toast('Error al guardar: '+error.message,'err');return;}
  closeModal(true);toast(msg,'ok');
  await loadObraData(OBRA.id);refreshCounts();
  // Alta NUEVA: ¿esta persona ya venía en el control de papeles?
  if(!id)await cpAvisaAlta(fullName(w));
  }catch(e){toast('No se pudo guardar: '+e.message,'err');}
  finally{if($('worker-form-body')===formularioGuardando)formGuardando(false);}
}
async function guardarRegistroTrabajador(valores,id){
  const form=$('worker-form-body');
  if(id&&(!form||form.dataset.workerId!==id||!form.dataset.workerVersion||!form.dataset.workerObra)){
    return {error:{message:'No se tiene la versión original de esta ficha. Vuelve a abrirla antes de guardar; tu captura no se ha enviado.'}};
  }
  // La versión pertenece a la ficha abierta, no al caché que Realtime puede renovar.
  // Impide que una edición antigua borre un reingreso o restaure un finiquito previo.
  let q=id?sb.from('trabajadores').update(valores).eq('id',id)
    .eq('obra_id',form.dataset.workerObra).eq('updated_at',form.dataset.workerVersion)
    :sb.from('trabajadores').insert(valores);
  const {data,error}=await q.select('id');
  if(error)return {error};
  if(!data||data.length!==1)return {error:{message:id
    ?'La ficha cambió desde que la abriste o ya no tienes acceso. No se sobrescribió ningún dato. Conserva tu captura y vuelve a abrir la ficha para revisar los cambios.'
    :'No se confirmó el registro. Verifica tus permisos y actualiza la ficha antes de reintentar.'}};
  return {data,error:null};
}
/* ---------- ¿EL QUE ACABO DE DAR DE ALTA VENÍA EN PAPELES? -------------
   El control de papeles es la antesala del padrón, así que dar de alta a
   alguien es justo el momento en que su renglón deja de tener sentido.
   Antes nadie se acordaba de ir a cerrarlo y seguía sumando semanas.

   Se avisa DESPUÉS de guardar, no antes: el alta no se bloquea ni se
   condiciona a esto. Y no se cierra solo — un nombre parecido no es una
   prueba, así que se pregunta. */
async function cpAvisaAlta(nombre){
  if(!OBRA||!nombre)return;
  let r=null;
  try{
    const {data,error}=await sb.rpc('buscar_pendiente_parecido',{p_obra:OBRA.id,p_nombre:nombre});
    if(error)throw error;
    r=data;
  }catch(e){ return; }   // sin el Script 65 el alta sigue funcionando igual
  if(!r||!r.encontrado||!r.fila)return;
  const f=r.fila, n=Number(f.semanas_adeudadas)||0;
  modal(`
    <div class="m-head" style="background:var(--amber-bg)"><h2>📂 Ya venía en el control de papeles</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="font-size:15px;line-height:1.7"><b>${esc(f.nombre_completo)}</b> llevaba <b style="color:var(--red);font-size:20px">${n}</b> semana(s) asistiendo sin entregar documentación.</p>
      <p style="color:var(--mut);font-size:12.5px">Como ya quedó dado de alta, ese renglón deja de tener sentido: si no se cierra, va a seguir contando semanas en la lista de pendientes.</p>
      <div class="kv"><b>Ingresó en la semana</b><span><b>${esc(f.semana_ingreso||'—')}</b></span></div>
      <div class="kv"><b>Última vez registrado</b><span>${esc(f.ultima_semana_registrada||'—')}</span></div>
      ${r.exacto?'':`<div class="kv" style="background:var(--amber-bg)"><b>Ojo</b><span>En el control de papeles está como <b>${esc(f.nombre_completo)}</b> y lo diste de alta como <b>${esc(nombre)}</b>. Si son dos personas distintas, no lo cierres.</span></div>`}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">No es la misma persona</button>
      <button class="btn dark" onclick="closeModal();cpCerrarPorAlta('${f.id}')">✔ Sí, cerrar su renglón</button>
    </div>`,'sm');
}
async function cpCerrarPorAlta(id){
  markWrite();
  const {error}=await sb.rpc('marcar_estado_pendiente',
    {p_id:id,p_estado:'ENTREGADO',p_semana:null,p_usuario:USER.email});
  if(error){toast('Error: '+error.message,'err');return;}
  toast('Cerrado en el control de papeles: ya quedó dado de alta.','ok');
  if(typeof PAPELES!=='undefined'&&VIEW==='papeles')await cpCargar();
}
async function doActivar(id){
  const w=WORKERS.find(x=>x.id===id);
  const falt=datosFaltantes(w);
  const msg=falt.length
    ?`A este trabajador aún le falta: ${falt.join(', ')}.\n\n¿Marcarlo como ACTIVO de todos modos?`
    :'¿Marcar a este trabajador como ACTIVO?';
  if(!confirm(msg))return;
  markWrite();
  const {error}=await sb.from('trabajadores').update({estatus:'ACTIVO',pendiente_manual:false,motivo_pendiente:''}).eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  closeModal();toast('Trabajador marcado como ACTIVO.','ok');
  await loadObraData(OBRA.id);refreshCounts();
}

