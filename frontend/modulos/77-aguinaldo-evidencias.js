/* Lectura y conciliación del aguinaldo de bajas anteriores. El vínculo se
   confirma en servidor con versión y huella de fuentes. */
(function(){
 'use strict';
 const iso=/^\d{4}-\d{2}-\d{2}$/;
 const estadosAcreditados=new Set(['APLICADO','PAGADO','CERO_VERIFICADO']);
 const numero=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
 const centavos=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
 const fechaBaja=e=>String(e.fecha_baja||String(e.operacion||'').replace(/^BAJA:/,'')||e.fecha_pago||'').slice(0,10);
 function evidenciasDe(x,tramos,ejercicio){
  const ev=[];
  for(const a of x.aplicaciones||[])ev.push({id:a.id,operacion:'APL:'+a.id,origen:'APLICACION',
   estado:a.estado==='APLICADO'?a.estado_destino:a.estado,importe_bruto:numero(a.bruto),exento:numero(a.exento),
   fecha_pago:a.fecha_pago,semana:a.semana,obra_id:a.obra_id,aplicado:a.estado==='APLICADO'});
  if(x.contrato_version==='AG_CICLO_V1')return [...ev,...(x.evidencias_ciclo||[])];
  if(Array.isArray(x.evidencias_aguinaldo)){
   for(const fuente of x.evidencias_aguinaldo){
    const e={...fuente},f=fechaBaja(e),importe=numero(e.importe_bruto);
    if(f&&!e.operacion)e.operacion='BAJA:'+f;
    if(!e.fecha_baja&&iso.test(f))e.fecha_baja=f;
    const conciliada=e.origen==='CONCILIACION_VERIFICADA'&&e.acreditacion_confirmada===true&&estadosAcreditados.has(e.estado);
    const aplicada=e.origen==='FINIQUITO_DESGLOSADO'&&estadosAcreditados.has(e.estado);
    if((conciliada||aplicada)&&importe!=null&&importe>=0)e.importe_bruto=importe;
    else if(e.origen!=='APLICACION'){
     e.origen=e.origen==='BAJA_SIN_EVIDENCIA'?'BAJA_SIN_EVIDENCIA':'PAPEL_CALCULO';
     e.importe_bruto=importe??0;e.importe_confirmado=false;
    }
    ev.push(e);
   }
   return ev;
  }
  const delAnio=f=>String(f||'').slice(0,4)===String(ejercicio);
  const baja=f=>'BAJA:'+String(f||'').slice(0,10);
  const fins=(x.finiquitos||[]).filter(f=>delAnio(f.periodo));
  for(const f of fins)if(numero(f.aguinaldo)!=null)ev.push({id:f.id,operacion:baja(f.periodo),fecha_baja:f.periodo,
   origen:'FINIQUITO_DESGLOSADO',estado:'APLICADO',importe_bruto:numero(f.aguinaldo),exento:numero(f.exento_ag),fecha_pago:f.periodo});
  const papeles=(x.papeles||[]).filter(p=>p.ejercicio!=null?Number(p.ejercicio)===Number(ejercicio):delAnio(p.fecha_baja))
   .sort((a,b)=>Number(b.revision||0)-Number(a.revision||0));
  const vistos=new Set();
  for(const p of papeles){
   const clave=baja(p.fecha_baja);if(vistos.has(clave))continue;vistos.add(clave);
   const importe=numero(p.aguinaldo??p.resultado?.aguinaldo??p.entradas?.datos?.aguinaldo?.v);
   ev.push({id:p.id,operacion:clave,fecha_baja:p.fecha_baja,origen:'PAPEL_CALCULO',estado:'PENDIENTE',
    importe_bruto:importe??0,importe_confirmado:false,importe_calculado:importe,exento:numero(p.exento_ag),fecha_pago:p.fecha_pago||p.fecha_baja,
    procedencia:p.fuente,revision:p.revision});
  }
  for(const f of fins)if(numero(f.aguinaldo)==null)ev.push({id:f.id,operacion:baja(f.periodo),fecha_baja:f.periodo,
   origen:'FINIQUITO_GLOBAL',estado:'PENDIENTE',importe_bruto:numero(f.monto_aplicado)??0,exento:null,fecha_pago:f.periodo});
  for(const t of tramos||[])if(t.hasta&&delAnio(t.hasta)&&!ev.some(e=>e.operacion===baja(t.hasta)))
   ev.push({id:'baja-'+t.hasta,operacion:baja(t.hasta),fecha_baja:t.hasta,origen:'BAJA_SIN_EVIDENCIA',estado:'PENDIENTE',
    importe_bruto:0,importe_confirmado:false,exento:null,fecha_pago:t.hasta});
  return ev;
 }
 function importeTexto(v){const n=numero(v);return n==null?'Por determinar':'$'+money(n);}
 function estadoTexto(v){return ({APLICADO:'Operación aplicada',PAGADO:'Pago acreditado',CERO_VERIFICADO:'Cero respaldado',
  PENDIENTE:'Pendiente de conciliación',VALIDADO:'Cálculo revisado',CALCULO:'Papel de cálculo',LECTURA_PENDIENTE:'Pendiente de lectura',
  LECTURA_FALLIDA:'Lectura fallida',SIN_DOCUMENTO:'Información ausente',DISCREPANCIA:'Discrepancia'})[v]||v||'Por revisar';}
 async function abrir(opciones){
  const w=opciones.trabajador,ej=Number(opciones.ejercicio);
  if(!w?.id||!Number.isInteger(ej))return;
  const raiz='ag-evidencia-'+crypto.randomUUID(),usuario=typeof USER==='undefined'?null:USER?.id,obra=typeof OBRA==='undefined'?null:OBRA?.id;
  modal2(`<div id="${raiz}" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden">
   <div class="m-head"><h2>Revisar aguinaldo de la baja anterior</h2><button type="button" class="x" data-ae="cerrar" aria-label="Cerrar">×</button></div>
   <div class="m-body" style="min-height:0;overflow:auto"><p><strong>#${esc(w.no_trab)} ${esc(fullName(w))}</strong> · ejercicio ${ej}</p>
    <div data-ae-aviso role="status" aria-live="polite">Consultando las fuentes de esta baja…</div><div data-ae-cuerpo></div></div>
   <div class="m-foot"><button type="button" class="btn" data-ae="cerrar">Cerrar</button>
    <button type="button" class="btn" data-ae="recargar">Actualizar fuentes</button>
    <button type="button" class="btn dark" data-ae="vincular" disabled>Confirmar vínculo y recalcular</button></div></div>`,'lg prestaciones-form');
  const host=$(raiz),s={datos:null,ocupado:false,fecha:null,lectura:0,operacion:crypto.randomUUID()};
  const nodo=q=>host.querySelector(q),aviso=t=>{nodo('[data-ae-aviso]').textContent=t;};
  const vigente=()=>host.isConnected&&(typeof USER==='undefined'||USER?.id===usuario)&&(typeof OBRA==='undefined'||OBRA?.id===obra);
  const bajaActual=()=>s.datos?.bajas?.find(b=>b.fecha_baja===s.fecha);
  const fuenteActual=()=>bajaActual()?.fuentes?.find(f=>f.clave===nodo('[data-ae-fuente]')?.value);
  const respaldoActual=()=>bajaActual()?.respaldos?.find(r=>r.clave===nodo('[data-ae-respaldo]')?.value);
  async function rpc(accion,datos){
   const r=await sb.rpc('control_aguinaldo_evidencias',{p_accion:accion,p_datos:{trabajador_id:w.id,ejercicio:ej,...datos}});
   if(r.error)throw Error(r.error.message||'La base no confirmó la operación.');
   if(!r.data)throw Error('El servidor devolvió una respuesta incompleta.');
   return r.data;
  }
  function habilitar(){
   const f=fuenteActual(),b=bajaActual();
   nodo('[data-ae="vincular"]').disabled=s.ocupado||!s.datos?.permisos?.captura||!s.datos.huella||!b||numero(f?.aguinaldo)==null;
   for(const e of host.querySelectorAll('[data-ae="recargar"], [data-ae="original"]'))e.disabled=s.ocupado;
  }
  function pintar(){
   const bajas=s.datos?.bajas||[],b=bajaActual(),cuerpo=nodo('[data-ae-cuerpo]');
   cuerpo.innerHTML=`<label>Baja por conciliar<select data-ae-baja>${bajas.map(a=>`<option value="${esc(a.fecha_baja)}" ${a.fecha_baja===s.fecha?'selected':''}>${fmtD(a.fecha_baja)} · ${esc(estadoTexto(a.estado))}</option>`).join('')}</select></label>
    ${!b?'<p>No hay bajas anteriores por conciliar en este ejercicio.</p>':`<p>Ciclo desde ${fmtD(b.ciclo_desde)} · baja ${fmtD(b.fecha_baja)} · ${esc(estadoTexto(b.estado))}</p>
    <p class="fhint">Revisa el concepto del papel, su operación aplicada y el comprobante de pago. El vínculo registra la procedencia y la confirmación.</p>
    <h3>Fuentes del cálculo</h3>${(b.fuentes||[]).length?ctrlTabla(['Fuente','Aguinaldo','Exento','Neto','Situación','Procedencia'],b.fuentes.map(f=>`<tr><td>${esc(f.tipo)} ${esc(f.id||'')}</td><td>${importeTexto(f.aguinaldo)}</td><td>${importeTexto(f.exento)}</td><td>${importeTexto(f.neto)}</td><td>${esc(estadoTexto(f.estado_operacion||f.estado))}</td><td>${esc(typeof f.procedencia==='string'?f.procedencia:f.procedencia?.archivo||f.archivo||'')}${f.hoja?' · '+esc(f.hoja):''}${f.fila?' · fila '+esc(f.fila):''}${f.fuente_sha256?'<div class="fhint">SHA-256 '+esc(f.fuente_sha256)+'</div>':''}</td></tr>`)):'<p>Información ausente. Se necesita un documento con el aguinaldo de esta baja o una aclaración respaldada.</p>'}
    <label>Concepto que se vinculará<select data-ae-fuente><option value="">Selecciona una fuente</option>${(b.fuentes||[]).map(f=>`<option value="${esc(f.clave)}">${esc(f.tipo)} · ${importeTexto(f.aguinaldo)}${f.revision?' · revisión '+esc(f.revision):''}</option>`).join('')}</select></label>
    <div style="margin:10px 0"><button type="button" class="btn" data-ae="original">Consultar original del papel</button></div><div data-ae-original></div>
    <h3>Respaldo de la operación</h3>${(b.respaldos||[]).length?ctrlTabla(['Tipo','Importe','Estado','Fecha','Referencia'],b.respaldos.map(r=>`<tr><td>${esc(r.tipo)}</td><td>${importeTexto(r.neto)}</td><td>${esc(estadoTexto(r.estado))}</td><td>${fmtD(r.fecha_pago)}</td><td>${esc(r.id||r.clave)}</td></tr>`)):'<p>Falta vincular el comprobante o la operación que respalde el importe acreditado.</p>'}
    <label>Respaldo que se reconocerá<select data-ae-respaldo><option value="">Selecciona un respaldo</option>${(b.respaldos||[]).map(r=>`<option value="${esc(r.clave)}">${esc(r.tipo)} · ${importeTexto(r.neto)} · ${esc(estadoTexto(r.estado))}</option>`).join('')}</select></label>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px">
     <label>Aguinaldo acreditado ($)<input data-ae-importe type="number" step=".01" min="0"></label>
     <label>Parte exenta acreditada ($)<input data-ae-exento type="number" step=".01" min="0" placeholder="Si consta en el soporte"></label>
     <label>Fecha de pago respaldada<input data-ae-fecha type="date"></label>
     <label>Situación de la operación<select data-ae-estado><option value="APLICADO">Operación aplicada</option><option value="PAGADO">Pago acreditado</option><option value="CERO_VERIFICADO">Cero verificado con respaldo</option></select></label>
    </div><label>Motivo del vínculo<input data-ae-motivo maxlength="600"></label><label>Referencia del soporte<input data-ae-referencia maxlength="600"></label>
    <p class="fhint">Una parcialidad respaldada se acredita por el importe capturado. El saldo pendiente se recalcula después de confirmar.</p>
    ${b.resolucion?`<details><summary>Resolución registrada</summary><p>${esc(estadoTexto(b.resolucion.estado_operacion||b.resolucion.estado))} · ${importeTexto(b.resolucion.importe_bruto)} · versión ${esc(b.resolucion.version||b.version)}</p><p>${esc(b.resolucion.referencia||'')}</p></details>`:''}`}`;
   if(b){
    const primera=(b.fuentes||[]).find(f=>numero(f.aguinaldo)!=null);
    if(primera)nodo('[data-ae-fuente]').value=primera.clave;
    fuenteCambiada();
    if(!s.datos.permisos?.captura)for(const n of cuerpo.querySelectorAll('input,select'))n.disabled=true;
   }
   habilitar();
  }
  function fuenteCambiada(){
   const f=fuenteActual();if(!nodo('[data-ae-importe]'))return;
   nodo('[data-ae-importe]').value=numero(f?.aguinaldo)==null?'':centavos(f.aguinaldo).toFixed(2);
   nodo('[data-ae-exento]').value=numero(f?.exento)==null?'':centavos(f.exento).toFixed(2);
   nodo('[data-ae-original]').textContent='';
   nodo('[data-ae-referencia]').value=f?.hoja?`${f.hoja}, fila ${f.fila||'por verificar'}`:'';
   habilitar();
  }
  async function cargar(){
   const turno=++s.lectura;s.ocupado=true;habilitar();aviso('Consultando fuentes y relaciones…');
   try{
    const datos=await rpc('LEER',{});if(!vigente()||turno!==s.lectura)return;
    if(datos.trabajador_id!==w.id)throw Error('Las fuentes corresponden a otro trabajador.');
    s.datos=datos;
    const pendientes=new Set((opciones.pendientes||[]).map(fechaBaja));
    if(!datos.bajas?.some(b=>b.fecha_baja===s.fecha))s.fecha=datos.bajas?.find(b=>pendientes.has(b.fecha_baja))?.fecha_baja||datos.bajas?.[0]?.fecha_baja;
    pintar();aviso('Fuentes actualizadas. Revisa el concepto y su respaldo.');
   }catch(e){if(vigente())aviso('Lectura fallida. '+e.message);}
   finally{if(vigente()&&turno===s.lectura){s.ocupado=false;habilitar();}}
  }
  function leerImporte(selector,nombre,nullable=false){
   const texto=nodo(selector).value.trim();if(nullable&&texto==='')return null;
   if(!/^\d+(?:\.\d{1,2})?$/.test(texto))throw Error('Captura '+nombre+' con hasta dos decimales.');
   const n=Number(texto);if(!Number.isFinite(n))throw Error('Revisa '+nombre+'.');return n;
  }
  async function vincular(){
   const b=bajaActual(),f=fuenteActual(),r=respaldoActual();
   if(!b||!f||!r)throw Error('Selecciona la fuente del concepto y su respaldo.');
   if(!s.datos.permisos?.captura)throw Error('Tu usuario tiene acceso de consulta.');
   const importe=leerImporte('[data-ae-importe]','el aguinaldo acreditado'),exento=leerImporte('[data-ae-exento]','la parte exenta',true);
   if(importe>centavos(f.aguinaldo)||exento!=null&&exento>importe)throw Error('El importe debe quedar respaldado por la fuente y la parte exenta no puede superar el aguinaldo.');
   const fecha=nodo('[data-ae-fecha]').value,estado=nodo('[data-ae-estado]').value;
   if(!iso.test(fecha))throw Error('Captura la fecha de pago respaldada.');
   if(importe===0&&estado!=='CERO_VERIFICADO')throw Error('Un cero requiere seleccionar Cero verificado y conservar su respaldo.');
   const motivo=nodo('[data-ae-motivo]').value.trim(),referencia=nodo('[data-ae-referencia]').value.trim();
   if(motivo.length<5||referencia.length<3)throw Error('Captura el motivo y la referencia del soporte.');
   if(!confirm(`¿Confirmas vincular $${money(importe)} de aguinaldo de la baja del ${fmtD(b.fecha_baja)}? Se registrarán tu usuario, fecha, motivo, referencia y versión.`))return;
   s.ocupado=true;habilitar();aviso('Confirmando el vínculo…');
   try{
    const resultado=await rpc('VINCULAR',{operacion_id:s.operacion,fecha_baja:b.fecha_baja,fuente_clave:f.clave,respaldo_clave:r.clave,importe_bruto:importe,
     exento,fecha_pago:fecha,estado_operacion:estado,motivo,referencia,version:b.version??0,huella:s.datos.huella,confirmado:true});
    if(!vigente())return;
    const datos=await rpc('LEER',{});if(!vigente())return;
    if(datos.trabajador_id!==w.id)throw Error('La respuesta corresponde a otro trabajador.');
    s.datos=datos;pintar();aviso('Vínculo registrado. Se recalculará esta persona con las fuentes actualizadas.');
    s.operacion=crypto.randomUUID();
    await opciones.alResolver?.(resultado,datos);
   }catch(e){if(vigente())aviso(e.message);}
   finally{if(vigente()){s.ocupado=false;habilitar();}}
  }
  async function original(){
   const f=fuenteActual();if(!f?.fuente_sha256)throw Error('Selecciona un papel con archivo original archivado.');
   s.ocupado=true;habilitar();aviso('Leyendo el archivo original y verificando su huella…');
   try{
    const {data,error}=await sb.from('prestaciones_fuentes_historicas').select('contenido_base64,archivo,sha256').eq('sha256',f.fuente_sha256).eq('obra_id',w.obra_id).single();
    if(error||!data)throw Error(error?.message||'El archivo no está disponible.');
    if(!vigente())return;
    const bytes=Uint8Array.from(atob(data.contenido_base64),c=>c.charCodeAt(0));
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==f.fuente_sha256||data.sha256!==hash)throw Error('La huella del original no coincide.');
    if(typeof XLSX==='undefined')throw Error('No cargó el lector del archivo Excel.');
    const wb=XLSX.read(bytes,{type:'array',cellFormula:true}),ws=wb.Sheets[f.hoja];
    if(!ws||!Number.isInteger(Number(f.fila)))throw Error('El papel no identifica la hoja y fila del original.');
    const fila=Number(f.fila),datos=f.datos||f.entradas?.datos||{};
    let celda=datos.aguinaldo?.celda,celdaExento=null;
    for(let i=fila;i<fila+34;i++){
     const etiqueta=String(ws['B'+i]?.v||'').trim().toUpperCase();
     if(etiqueta!=='AGUINALDO')continue;
     if(!celda&&numero(ws['G'+i]?.v)!=null)celda='G'+i;
     if(numero(ws['C'+i]?.v)!=null)celdaExento='C'+i;
    }
    const bruto=numero(ws[celda]?.v),exento=numero(ws[celdaExento]?.v);
    if(bruto==null)throw Error('El original no tiene un importe de aguinaldo legible en este bloque.');
    if(!vigente()||fuenteActual()?.clave!==f.clave)return;
    nodo('[data-ae-original]').innerHTML=`<p>Original verificado · ${esc(data.archivo)} · ${esc(f.hoja)}!${esc(celda)} · aguinaldo con precisión original ${esc(bruto)}${exento==null?'':` · exento ${esc(f.hoja)}!${esc(celdaExento)} ${esc(exento)}`}</p>`;
    nodo('[data-ae-importe]').value=centavos(bruto).toFixed(2);
    if(exento!=null)nodo('[data-ae-exento]').value=centavos(exento).toFixed(2);
    nodo('[data-ae-referencia]').value=`${data.archivo} · ${f.hoja}!${celda}${celdaExento?' / '+celdaExento:''} · SHA-256 ${hash}`;
    aviso('Original verificado. Los importes propuestos requieren confirmar el vínculo.');
   }finally{if(vigente()){s.ocupado=false;habilitar();}}
  }
  host.addEventListener('change',e=>{
   if(e.target.matches('[data-ae-baja]')){s.fecha=e.target.value;pintar();}
   if(e.target.matches('[data-ae-fuente]'))fuenteCambiada();
   if(e.target.matches('[data-ae-respaldo]')){
    const r=respaldoActual();
    if(r?.fecha_pago)nodo('[data-ae-fecha]').value=r.fecha_pago;
    nodo('[data-ae-estado]').value=['ENTREGADO','EXITOSO','PAGADO'].includes(r?.estado)?'PAGADO':'APLICADO';
   }
  });
  host.addEventListener('click',e=>{
   const a=e.target.closest('[data-ae]')?.dataset.ae;if(!a||!vigente()||s.ocupado)return;
   if(a==='cerrar'){closeModal2();return;}
   const tarea=a==='recargar'?cargar:a==='vincular'?vincular:a==='original'?original:null;
   if(tarea)Promise.resolve().then(tarea).catch(error=>{if(vigente())aviso(error.message);});
  });
  await cargar();
 }
 window.PLATINUM_AGUINALDO_EVIDENCIAS=Object.freeze({evidenciasDe,abrir});
})();
