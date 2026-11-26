/* Fuente única y sólo lectura. La confirmación vuelve a verificar su firma en PostgreSQL. */
(function(){
 'use strict';
 const lecturas=new Map(),clave=(w,f)=>[w.id,w.obra_id,w.updated_at,iniAntig(w),f,USER?.id].join('|');
 function obtener(w,f){return lecturas.get(clave(w,f))?.datos||null;}
 function registrar(w,f,d){
  if(d?.trabajador_id!==w.id||d.obra_id!==w.obra_id||d.corte!==f||d.inicio_ciclo!==iniAntig(w))throw Error('La fuente de prestaciones corresponde a otra ficha, fecha o ciclo.');
  lecturas.set(clave(w,f),{datos:d});return d;
 }
 async function cargar(w,f,{actualizar=false}={}){
  const k=clave(w,f),prev=lecturas.get(k);if(!actualizar&&prev?.datos)return prev.datos;if(!actualizar&&prev?.promesa)return prev.promesa;
  const usuario=USER?.id,turno={};
  const promesa=(async()=>{const {data,error}=await sb.rpc('prestaciones_fuentes',{p_trabajador:w.id,p_fecha:f});
   if(error)throw Error('No se pudieron leer faltas y aguinaldo: '+error.message);
   if(USER?.id!==usuario)throw Error('La sesión cambió durante la lectura.');
   if(lecturas.get(k)?.turno!==turno){const actual=lecturas.get(k);if(actual?.datos)return actual.datos;if(actual?.promesa)return await actual.promesa;throw Error('La lectura fue reemplazada. Actualiza la fecha de cálculo.');}
   return registrar(w,f,data);
  })();
  lecturas.set(k,{promesa,turno});try{return await promesa;}catch(e){if(lecturas.get(k)?.promesa===promesa)lecturas.delete(k);throw e;}
 }
 function decision(d){
  if(!d?.firma)throw Error('No se verificó la fuente de faltas y aguinaldo.');
  if(d.reservas?.length)throw Error('Hay aguinaldo reservado en una nómina abierta ('+d.reservas.map(r=>r.id).join(', ')+'). Retira o resuelve su aplicación en la corrida de aguinaldo antes de continuar.');
  if(d.exento_acreditado_pendiente){const refs=(d.referencias||[]).filter(r=>r.exento==null),por=d.cfdi_por_verificar||[];
   throw Error('Falta la parte exenta del aguinaldo de un pago anterior: '+refs.map(r=>r.fecha_pago?fmtD(r.fecha_pago):r.id).join(', ')+'. '+
    (por.length?'Su CFDI ya está archivado: usa «Verificar CFDI archivado» en el panel de faltas y aguinaldo.':'Usa «Subir XML/PDF timbrado del pago anterior» en el panel de faltas y aguinaldo.'));}
  return {puede_continuar:true,etiqueta:d.etiqueta,acreditado:Number(d.aguinaldo_acreditado)||0,documentos_informativos:d.informativos?.length||0};
 }
 function panel(d){return `<section class="bf-papel"><h4>${esc(d.etiqueta)}</h4><p>Ciclo ${esc(d.desde)} al ${esc(d.corte)} · ${d.dias_base} días base · ${ausencias(d)} · ${d.dias_aguinaldo} días de aguinaldo.</p>
  <p class="fhint">Se cuentan las ausencias una vez. Los descuentos monetarios ya aplicados no se vuelven a descontar del finiquito.</p>
  ${Number(d.aguinaldo_acreditado)?`<p>Aguinaldo acreditado del ciclo: $${money(d.aguinaldo_acreditado)} · ${d.referencias.map(r=>esc(r.id)).join(', ')}.</p>`:'<p>El aguinaldo causado pendiente se incluye en el finiquito.</p>'}
  ${d.reservas.length?'<p style="color:var(--amber)">Hay una reserva vigente: resuelve su cobertura en la corrida de aguinaldo.</p><button class="btn" type="button" onclick="window.PLATINUM_AGUINALDO_UI.abrir()">Ver corrida de aguinaldo</button>':''}
  ${d.informativos.length?'<p class="fhint">'+d.informativos.length+' documento(s) sin aplicación acreditada: son informativos, no equivalen a pago previo.</p>':''}
  ${d.exento_acreditado_pendiente?pendienteFiscal(d):''}
  <p class="fhint">${d.exento_acreditado_pendiente?'Exención anual anterior pendiente de verificar.':'Exención de aguinaldo ya utilizada en el año: $'+money(d.exento_ag_usado||0)+'.'}${(d.referencias||[]).some(r=>r.fiscal_cfdi?.estado==='VERIFICADO')?' Desglose recuperado de un CFDI verificado; la operación histórica se conserva.':''}</p>
  ${pendientes(d).length?'<p style="color:var(--amber)">Hay '+pendientes(d).length+' registro(s) con cobertura parcial o cantidad sin desglose. Se usan sólo las faltas verificables; no se asume que los periodos faltantes tuvieron cero faltas.</p>':''}
  ${aplicados(d)}
  <details><summary>Desglose y criterio aplicado</summary>${ctrlTabla(['Fuente','Referencia','Fecha / rango','Días','Tipo'],d.detalle.map(r=>`<tr><td>${esc(r.fuente)}</td><td>${esc(r.id)}</td><td>${esc(r.fecha||r.desde+' al '+r.hasta)}</td><td>${r.dias}${r.sustituido_por?' (documentados '+esc(r.dias_documentados)+')':''}</td><td>${r.tipo_aplicado==='EG'?'Incapacidad EG':'Falta tipo 2'}</td></tr>`))}</details></section>`;}
 /* Días que no computan para el aguinaldo: faltas tipo 2 e incapacidades por enfermedad general (LFT 42-II, criterio del núcleo 72). */
 function ausencias(d){const eg=Number(d.incapacidades_eg)||0,t2=d.faltas_tipo2!=null?Number(d.faltas_tipo2):Number(d.faltas)-eg;
  return eg?`${t2} falta(s) tipo 2 + ${eg} día(s) de incapacidad por enfermedad general = ${d.faltas} día(s) que no computan`:`${d.faltas} falta(s) tipo 2`;}
 const pendientes=d=>(d.limitaciones||[]).filter(x=>!x.informativo);
 /* Ajustes aplicados con aviso: el total histórico recortado a la fecha de cálculo y los descuentos semanales sustituidos por un total. */
 function aplicados(d){const inf=(d.limitaciones||[]).filter(x=>x.informativo);if(!inf.length)return '';
  return '<ul class="fhint" data-pf-ajustes>'+inf.map(x=>x.motivo==='TOTAL_RECORTADO_AL_CORTE'
   ?`<li>Total histórico ${esc(x.id)} (${esc(String(x.naturaleza||'').replace(/_/g,' ').toLowerCase())}) registrado hasta ${esc(fmtD(x.hasta_original))}: se aplica completo dentro del ciclo hasta ${esc(fmtD(x.hasta))}, último día antes de la fecha de cálculo.</li>`
   :x.motivo==='RANGO_SUSTITUIDO_POR_TOTAL'?`<li>Descuento ${esc(x.id)} (${esc(fmtD(x.desde))} al ${esc(fmtD(x.hasta))}, ${esc(x.dias)} día(s) documentados) sustituido por el total histórico ${esc(x.total)}: se cuenta una sola vez.</li>`
   :`<li>${esc(x.motivo)} · ${esc(x.id)}</li>`).join('')+'</ul>';}
 const invalidar=(w,f)=>lecturas.delete(clave(w,f));
 /* Exención de un aguinaldo anterior sin CFDI verificado: acciones en el mismo panel (baja y cálculo de prestaciones).
    Sólo se ofrecen CFDI de la misma ficha y centro (misma razón social); si no hay, se abre el archivo de ese centro
    en el periodo de la fecha del pago anterior. */
 function pendienteFiscal(d){
  const refs=(d.referencias||[]).filter(r=>r.exento==null),por=d.cfdi_por_verificar||[];
  return `<div class="bf-papel" data-pf-pendiente role="group" aria-label="Exención del aguinaldo anterior por verificar">
   <p><b>Falta la parte exenta del aguinaldo pagado antes</b> (${refs.map(r=>esc(r.fecha_pago?fmtD(r.fecha_pago):r.id)+' · $'+money(r.importe||0)).join(', ')}).
   Se toma del CFDI timbrado de ese pago (percepción SAT 002).</p>
   ${por.map(c=>`<p>CFDI archivado sin verificar · ${esc(c.uuid)} · ${esc(c.desde)} al ${esc(c.hasta)}
    <button type="button" class="btn dark" data-pf="verificar" data-doc="${esc(c.documento_id)}" data-obra="${esc(c.obra_id)}" data-trabajador="${esc(d.trabajador_id)}">Verificar CFDI archivado</button></p>`).join('')}
   <p>${por.length?'¿No es este el comprobante? ':''}<button type="button" class="btn" data-pf="archivo" data-obra="${esc(d.obra_id)}" data-trabajador="${esc(d.trabajador_id)}" data-fecha="${esc(refs[0]?.fecha_pago||'')}" data-corte="${esc(d.corte)}">Subir XML/PDF timbrado del pago anterior</button></p>
   <p class="fhint" data-pf-estado aria-live="polite"></p></div>`;
 }
 async function verificarCfdi({documento_id,obra_id}){
  const llamar=async accion=>{const {data,error}=await sb.rpc('control_revision_recibo',{p_accion:accion,p_datos:{obra_id,documento_id}});if(error)throw Error(error.message);return data;};
  const p=await llamar('PREPARAR');
  if(p?.estado==='VERIFICADO')return p;
  if(p?.estado!=='LISTO')throw Error(p?.motivo||'No se pudo preparar la verificación del CFDI ('+(p?.estado||'sin estado')+').');
  const r=await sb.functions.invoke('lectura-documental',{body:{lote_id:p.lote_id,token:p.token,individual:true}});
  const fin=await llamar('ESTADO');
  if(fin?.estado!=='VERIFICADO')throw Error(fin?.motivo||r?.error?.message||'El CFDI no quedó verificado.');
  return fin;
 }
 const avisar=trabajador_id=>{for(const k of [...lecturas.keys()])if(k.startsWith(trabajador_id+'|'))lecturas.delete(k);
  if(typeof document!=='undefined')document.dispatchEvent(new CustomEvent('platinum:fuente-prestaciones',{detail:{trabajador_id}}));};
 let enCurso=false;
 if(typeof document!=='undefined')document.addEventListener('click',async e=>{
  const b=e.target.closest?.('[data-pf]');if(!b||enCurso)return;
  const caja=b.closest('[data-pf-pendiente]'),estado=caja?.querySelector('[data-pf-estado]'),t=b.dataset.trabajador;
  const decir=x=>{if(estado)estado.textContent=x;};
  try{
   if(b.dataset.pf==='verificar'){
    enCurso=true;for(const x of caja?.querySelectorAll('button')||[])x.disabled=true;decir('Verificando el CFDI archivado…');
    await verificarCfdi({documento_id:b.dataset.doc,obra_id:b.dataset.obra});
    decir('CFDI verificado. Actualizando el cálculo…');avisar(t);
    // Fuera de la baja (cálculo de prestaciones) se recalcula aquí; la baja refresca su contexto al recibir el aviso.
    if(!b.closest('#bf-flujo')&&typeof calcPrestaciones==='function'&&document.getElementById('pr-out'))calcPrestaciones(t);
   }else if(b.dataset.pf==='archivo'){
    const enBaja=!!b.closest('#bf-flujo');
    if(enBaja&&!window.PLATINUM_BAJA?.antesCerrar())return;
    window.PLATINUM_ARCHIVO_LIBRE?.abrir({obra_id:b.dataset.obra,fecha:b.dataset.fecha||null,volver:enBaja?'baja':null,trabajador_id:t,fecha_baja:b.dataset.corte,
     aviso:'Sube el XML (y su PDF) timbrado del pago anterior en este periodo, confírmalo y verifica su timbrado. Luego pulsa «Volver» para recalcular la baja.'});
   }
  }catch(error){decir(error.message);}
  finally{if(enCurso){enCurso=false;for(const x of caja?.querySelectorAll('button')||[])if(x.isConnected)x.disabled=false;}}
 });
 window.PLATINUM_PRESTACIONES_FUENTES=Object.freeze({invalidar,cargar,obtener,registrar,decision,panel,verificarCfdi});
})();
