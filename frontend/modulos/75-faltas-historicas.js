/* Ficha del trabajador → Faltas históricas y acumulado (PLATINUM y JIRE).
   Complementa, con auditoría, las faltas anteriores al inicio de la captura
   digital. Es la fuente común del aguinaldo y de los finiquitos. Registrar
   aquí NO crea descuentos, movimientos IMSS ni ajustes de vacaciones. Cada
   corrección crea una versión nueva (antes/después, actor, motivo, fuente);
   los permisos se verifican en el servidor. */
(function(){
 'use strict';
 const A=()=>window.PLATINUM_AGUINALDO,F=()=>window.PLATINUM_AGUINALDO_UI?.fuentes;
 const FUENTES=[['RESPALDO_PAPEL','Respaldo en papel / lista firmada'],['NOI','Reporte de Aspel NOI'],['LISTA_ASISTENCIA','Lista de asistencia'],['CONTRATISTA','Reporte del contratista'],['OTRO','Otro documento']];
 const iso=/^\d{4}-\d\d-\d\d$/,r2s=v=>redondearCentavos(v);
 const ESTADOS={VIGENTE:'Vigente',SUSTITUIDA:'Sustituida por corrección',REVERTIDA:'Revertida'};

 /* Resumen del ejercicio con las mismas reglas del aguinaldo. */
 async function resumen(w,ejercicio,corte,inicioCiclo=null){
  if(!A()||!F())throw Error('No cargaron las reglas de aguinaldo. Recarga la plataforma.');
  const {data,error}=await sb.rpc('control_aguinaldo',{p_accion:'CONTEXTO',p_datos:{ejercicio,trabajadores:[w.id]}});
  if(error){if(/control_aguinaldo|could not find the function|PGRST202/i.test(error.message+' '+(error.code||'')))throw Error('El servidor todavía no tiene la migración de faltas históricas.');throw Error(error.message);}
  const x=(data.personas||[])[0];if(!x)throw Error('Este trabajador está fuera de tu alcance.');
  const fin=`${ejercicio}-12-31`,c=corte&&corte<fin?corte:fin;
  const {tramos,avisos}=A().tramosServicio(w,F().eventosDe(w,x.movimientos)),aus=F().ausenciasDe(x);
  const entrada={ejercicio,salario_base:Number(w.sd)>0?Number(w.sd):1,dias_pactados:15,corte:c,hoy:today(),tramos,
   ausencias:{digitales:aus.digitales,rangos:aus.rangos,historicas:aus.historicas}};
  const d=A().calcularDerecho(entrada);
  const ev=F().evidenciasDe(x,tramos,ejercicio),conc=A().conciliar(d.bruto,ev,null);
  let ciclo=null;
  if(inicioCiclo){
   if(!iso.test(inicioCiclo)||inicioCiclo>c)throw Error('El inicio del ciclo no corresponde a la fecha de cálculo.');
   const pertenece=f=>!iso.test(f||'')||f>=inicioCiclo&&f<=c;
   const tramosCiclo=tramos.filter(t=>t.desde<=c&&(!t.hasta||t.hasta>=inicioCiclo))
    .map(t=>({...t,desde:t.desde<inicioCiclo?inicioCiclo:t.desde,hasta:t.hasta>c?null:t.hasta}));
   const fuentes={...x,
    aplicaciones:(x.aplicaciones||[]).filter(a=>iso.test(a.periodo_desde||'')&&iso.test(a.periodo_hasta||'')
     ?a.periodo_hasta>=inicioCiclo&&a.periodo_desde<=c:pertenece(a.fecha_pago)),
    finiquitos:(x.finiquitos||[]).filter(f=>pertenece(f.periodo)),
    // El papel abierto se revisa junto al cálculo de la baja actual.
    papeles:(x.papeles||[]).filter(p=>pertenece(p.fecha_baja)&&p.fecha_baja!==c)};
   const derecho=A().calcularDerecho({...entrada,tramos:tramosCiclo});
   ciclo={desde:inicioCiclo,hasta:c,d:derecho,conc:A().conciliar(derecho.bruto,F().evidenciasDe(fuentes,tramosCiclo,ejercicio),null)};
  }
  return {x,d,conc,ciclo,avisos:[...avisos,...aus.avisos],aus,cobertura:F().coberturaDe((data.coberturas||[]).find(o=>o.obra_id===w.obra_id)),sinSalario:!(Number(w.sd)>0)};
 }
 /* Faltas digitales que la regla de aguinaldo cuenta dentro de un rango. */
 function digitalesEnRango(aus,desde,hasta,politica){
  const n=(aus.digitales||[]).filter(a=>a.fecha>=desde&&a.fecha<=hasta&&A().computaNaturaleza(a.naturaleza,politica)===false).length;
  return n+(aus.rangos||[]).filter(g=>g.desde>=desde&&g.hasta<=hasta&&A().computaNaturaleza(g.naturaleza||'FALTA_INJUSTIFICADA',politica)===false).reduce((s,g)=>s+Number(g.cantidad||0),0);
 }
 const stat=(n,l,c='')=>`<div class="stat ${c}" style="flex:1;min-width:140px"><div class="n">${n}</div><div class="l">${l}</div></div>`;

 async function montar(host,w,vigente){
  const ok=()=>vigente()&&host.isConnected,hoy=today(),ejActual=Number(hoy.slice(0,4));
  const est={w,ej:ejActual,leer:null,res:null,form:null};
  host.innerHTML=`<section aria-label="Faltas históricas y acumulado">
   <p class="fhint">Complemento auditado de faltas anteriores al inicio de la captura digital. Alimenta el aguinaldo y los finiquitos. <b>No crea descuentos, movimientos IMSS ni ajustes de vacaciones.</b></p>
   <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:8px 0"><div><label for="fh-ej">Ejercicio</label><select id="fh-ej">${[ejActual,ejActual-1].map(y=>`<option value="${y}">${y}</option>`).join('')}</select></div>
    <div id="fh-acciones" style="display:flex;gap:8px;flex-wrap:wrap"></div></div>
   <div id="fh-resumen" role="status" class="fhint">Consultando…</div><div id="fh-form"></div><div id="fh-registros"></div></section>`;
  const $h=id=>host.querySelector('#'+id);
  async function cargar(){
   const t=est.turno=(est.turno||0)+1;
   $h('fh-resumen').innerHTML='<p class="fhint">Consultando faltas y pagos del ejercicio…</p>';
   try{
    const [l,r]=await Promise.all([sb.rpc('control_faltas_historicas',{p_accion:'LEER',p_datos:{trabajador_id:w.id}}),resumen(w,est.ej,est.ej===ejActual?hoy:null)]);
    if(!ok()||t!==est.turno)return;
    if(l.error)throw Error(l.error.message);
    est.leer=l.data;est.res=r;pintar();
   }catch(e){if(ok()&&t===est.turno){$h('fh-resumen').innerHTML=`<p class="fhint" role="alert" style="color:var(--red)">${esc(e.message)}</p>`;$h('fh-acciones').innerHTML='';$h('fh-registros').innerHTML='';}}
  }
  function pintar(){
   const r=est.res,d=r.d,c=r.conc,p=est.leer.permisos||{};
   const disc=d.ausencias.discrepancias,pend=d.ausencias.pendientes,cob=r.cobertura;
   const huecos=cob?.desde?d.tramos.filter(t=>t.desde<cob.desde):[];
   $h('fh-resumen').innerHTML=`<div class="stats" style="display:flex;gap:8px;flex-wrap:wrap">
     ${stat(d.dias_vinculo,`Días base del vínculo ${est.ej}${est.ej===ejActual?' al día de hoy':''}`)}${stat(d.faltas_digitales,'Faltas digitales (calendario e incidencias)')}
     ${stat(d.faltas_historicas,'Faltas históricas (complemento)','b')}${stat(d.faltas_afectan,'Faltas que afectan','a')}${stat(d.dias_computables,'Días computables','g')}
     ${stat('$'+money(c.acreditado),`Aguinaldo acreditado${c.reservado?` · $${money(c.reservado)} en borrador`:''}`,'g')}</div>
    ${disc.map(x=>`<p role="alert" style="color:var(--red);font-size:12px">⛔ Discrepancia: ${esc(x.texto)} Se conservan visibles las ${x.digitales} capturas del sistema.</p>`).join('')}
    ${pend.map(x=>`<p style="color:var(--amber);font-size:12px">⚠ ${esc(x.fuente)} ${esc(x.motivo==='SIN_CLASIFICAR'?'sin clasificar':x.motivo==='AGREGADO_SIN_DESGLOSE'?'agregado que el corte del cálculo parte; sólo se consume si el cálculo cubre todo su rango':'sin días exactos dentro del corte')}${x.desde?` (${fmtD(x.desde)} a ${fmtD(x.hasta)})`:''}.</p>`).join('')}
    ${r.avisos.map(a=>`<p style="color:${a.bloquea?'var(--red)':'var(--amber)'};font-size:12px">${a.bloquea?'⛔':'⚠'} ${esc(a.texto)}</p>`).join('')}
    ${huecos.length?`<p class="fhint">Captura digital desde ${fmtD(cob.desde)}. Antes de esa fecha (${huecos.map(t=>fmtD(t.desde)).join(', ')}) las faltas sólo constan si se registran aquí; un total de cero también se puede acreditar.</p>`:''}
    ${c.pendiente.length?`<p style="color:var(--amber);font-size:12px">⚠ ${c.pendiente.length} pago(s) anterior(es) sin desglose del aguinaldo (finiquito global o baja sin papeles).</p>`:''}
    ${r.sinSalario?'<p class="fhint">Sin salario diario en la ficha: los importes no son representativos.</p>':''}`;
   $h('fh-acciones').innerHTML=p.captura?`<button type="button" class="btn" data-fh="fechas">＋ Capturar faltas históricas</button><button type="button" class="btn" data-fh="total">Corregir total acumulado al corte</button>`:'<span class="fhint">Tu usuario sólo puede consultar.</span>';
   const regs=(est.leer.registros||[]).filter(x=>Number(x.ejercicio)===est.ej),cadenas=new Map();
   for(const x of regs){if(!cadenas.has(x.cadena_id))cadenas.set(x.cadena_id,[]);cadenas.get(x.cadena_id).push(x);}
   const filas=[...cadenas.values()].map(vs=>{vs.sort((a,b)=>b.version-a.version);const v=vs[0];
    const contenido=v.modo==='FECHAS'?`${(v.fechas||[]).length} fecha(s): ${(v.fechas||[]).slice(0,8).map(fmtD).join(', ')}${(v.fechas||[]).length>8?'…':''}`:`Total al corte: <b>${Number(v.total_acreditado)}</b> · digitales al registrar ${Number(v.digitales_al_registrar)}`;
    return `<tr><td>${fmtD(v.rango_desde)} a ${fmtD(v.fecha_corte)}</td><td>${contenido}</td><td>${esc(A().NATURALEZAS[v.naturaleza]?.etiqueta||v.naturaleza)}</td>
     <td>${esc(v.motivo)}<div class="fhint">${esc((FUENTES.find(f=>f[0]===v.fuente)||[0,v.fuente])[1])}${v.referencia?' · '+esc(v.referencia):''}${v.soporte_archivo?' · <button type="button" class="btn" style="padding:2px 6px" data-fh="soporte" data-ruta="'+esc(v.soporte_archivo)+'">Soporte</button>':''}</div></td>
     <td>v${v.version} · ${esc(ESTADOS[v.estado]||v.estado)}<div class="fhint">${esc(v.actor_email||'')} · ${fmtD(String(v.created_at).slice(0,10))}</div>
      ${vs.length>1?`<details><summary class="fhint">Versiones anteriores</summary>${vs.slice(1).map(o=>`<div class="fhint">v${o.version} · ${esc(ESTADOS[o.estado]||o.estado)} · ${o.modo==='FECHAS'?(o.fechas||[]).length+' fecha(s)':'total '+Number(o.total_acreditado)} · ${esc(o.motivo_cierre||'')}</div>`).join('')}</details>`:''}</td>
     <td>${v.estado==='VIGENTE'&&p.correccion?`<button type="button" class="btn" data-fh="corregir" data-id="${esc(v.id)}">Corregir</button> <button type="button" class="btn" data-fh="revertir" data-id="${esc(v.id)}">Revertir</button>`:''}</td></tr>`;});
   $h('fh-registros').innerHTML=`<div class="sect" style="margin-top:12px">Registros históricos ${est.ej}</div>${ctrlTabla(['Rango','Faltas','Naturaleza','Motivo y fuente','Versión',''],filas,'Sin registros históricos en este ejercicio.')}`;
  }
  function formulario(modo,previo){
   const ej=est.ej,inicio=est.res.d.tramos[0]?.desde||`${ej}-01-01`,hoyEj=ej===ejActual?hoy:`${ej}-12-31`;
   const v=previo||{rango_desde:inicio,fecha_corte:hoyEj,naturaleza:'FALTA_INJUSTIFICADA',fuente:'RESPALDO_PAPEL',fechas:[],total_acreditado:''};
   est.form={modo,previo};
   $h('fh-form').innerHTML=`<div class="tbl-card" style="padding:12px;margin:10px 0"><div class="sect">${previo?'Corregir registro (nueva versión)':modo==='FECHAS'?'Capturar faltas históricas por fecha':'Corregir total acumulado al corte'}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
     <div><label for="fh-desde">Rango: del</label><input id="fh-desde" type="date" value="${esc(v.rango_desde)}"></div>
     <div><label for="fh-corte">${modo==='FECHAS'?'al':'Fecha de corte'}</label><input id="fh-corte" type="date" value="${esc(v.fecha_corte)}" max="${hoy}"></div>
     ${modo==='FECHAS'?`<div style="grid-column:1/-1"><label for="fh-fechas">Fechas de falta (una por renglón, DD/MM/AAAA)</label><textarea id="fh-fechas" rows="3">${(v.fechas||[]).map(fmtD).join('\n')}</textarea></div>`
      :`<div><label for="fh-total">Total acreditado al corte</label><input id="fh-total" type="number" min="0" step="1" value="${esc(v.total_acreditado??'')}"><div class="fhint" id="fh-complemento"></div></div>`}
     <div><label for="fh-nat">Naturaleza</label><select id="fh-nat">${Object.entries(A().NATURALEZAS).filter(([k])=>k!=='SIN_CLASIFICAR').map(([k,n])=>`<option value="${k}" ${k===v.naturaleza?'selected':''}>${esc(n.etiqueta)}</option>`).join('')}</select></div>
     <div><label for="fh-fuente">Fuente</label><select id="fh-fuente">${FUENTES.map(([k,n])=>`<option value="${k}" ${k===v.fuente?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
     <div><label for="fh-ref">Referencia del documento</label><input id="fh-ref" maxlength="200" value="${esc(v.referencia||'')}" placeholder="Folio, semana, hoja…"></div>
     <div style="grid-column:1/-1"><label for="fh-motivo">${previo?'Motivo de la corrección':'Motivo'}</label><input id="fh-motivo" maxlength="500" placeholder="Por qué se registra y qué se revisó"></div>
     <div><label for="fh-soporte">Soporte (PDF o imagen, privado)</label><input id="fh-soporte" type="file" accept="application/pdf,image/jpeg,image/png"></div>
    </div><div id="fh-vista" class="fhint" style="margin-top:8px"></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn" data-fh="cancelar">Cancelar</button><button type="button" class="btn dark" data-fh="guardar">${previo?'Guardar versión':'Registrar'}</button></div></div>`;
   vista();
  }
  function datosFormulario(){
   const f=est.form,ej=est.ej,desde=$h('fh-desde').value,corte=$h('fh-corte').value,nat=$h('fh-nat').value;
   if(!iso.test(desde)||!iso.test(corte))throw Error('Captura el rango completo.');
   if(desde>corte)throw Error('El rango está invertido.');
   if(desde.slice(0,4)!==String(ej)||corte.slice(0,4)!==String(ej))throw Error('El rango debe pertenecer al ejercicio '+ej+'.');
   if(corte>hoy)throw Error('El corte no puede ser una fecha futura.');
   const j={trabajador_id:w.id,ejercicio:ej,modo:f.modo,rango_desde:desde,fecha_corte:corte,naturaleza:nat,fuente:$h('fh-fuente').value,referencia:$h('fh-ref').value.trim(),
    motivo:$h('fh-motivo').value.trim(),tramo_inicio:est.res.d.tramos.find(t=>t.desde<=desde&&t.hasta>=desde)?.desde||null};
   if(f.modo==='FECHAS'){
    const fs=[...new Set($h('fh-fechas').value.split(/[\s,;]+/).filter(Boolean).map(x=>dmyAiso(x)||(iso.test(x)?x:'')))];
    if(!fs.length||fs.some(x=>!x))throw Error('Revisa las fechas: usa DD/MM/AAAA, una por renglón.');
    if(fs.some(x=>x<desde||x>corte))throw Error('Todas las fechas deben estar dentro del rango.');
    j.fechas=fs.sort();
   }else{
    const n=Number($h('fh-total').value),max=A().util.dias(desde,corte);
    if($h('fh-total').value===''||!Number.isInteger(n)||n<0)throw Error('El total acreditado debe ser un número entero de días.');
    if(n>max)throw Error(`Cantidad imposible: el rango sólo tiene ${max} días.`);
    j.total_acreditado=n;
   }
   if(j.motivo.length<5)throw Error('Escribe el motivo (mínimo 5 caracteres).');
   return j;
  }
  function vista(){
   const out=$h('fh-vista');if(!out||!est.form)return;
   try{
    const j=datosFormulario(),aus=est.res.aus,dig=digitalesEnRango(aus,j.rango_desde,j.fecha_corte);
    if(j.modo==='FECHAS'){
     const ya=j.fechas.filter(f=>aus.digitales.some(a=>a.fecha===f));
     out.textContent=`${j.fechas.length} fecha(s)${ya.length?`; ${ya.length} ya están en el calendario y no se duplican`:''}.`;
    }else{
     const comp=j.total_acreditado-dig;
     out.innerHTML=comp>=0?`Respaldo ${j.total_acreditado} − ${dig} digital(es) en el sistema = <b>complemento ${comp}</b>. Las faltas que se capturen después del corte se suman aparte; importar después una falta antigua del rango no duplica.`
      :`<span style="color:var(--red)">Discrepancia: el respaldo reporta ${j.total_acreditado} y el sistema tiene ${dig} en el mismo rango. Se guarda, pero el aguinaldo quedará bloqueado hasta resolver cuál capturar; las ${dig} capturas siguen visibles.</span>`;
    }
   }catch(e){out.textContent=e.message;}
  }
  async function subirSoporte(){
   const file=$h('fh-soporte')?.files?.[0];if(!file)return null;
   if(!['application/pdf','image/jpeg','image/png'].includes(file.type))throw Error('El soporte debe ser PDF, JPG o PNG.');
   if(file.size>10*1024*1024)throw Error('El soporte no puede pesar más de 10 MB.');
   const safe=file.name.replace(/[^A-Za-z0-9._-]+/g,'_').slice(-60),ruta=`${w.id}/FALTAS_HISTORICAS/${Date.now()}_${safe}`;
   const {error}=await sb.storage.from('expedientes').upload(ruta,file,{upsert:false,contentType:file.type});
   if(error)throw Error('No se pudo guardar el soporte: '+error.message);
   return ruta;
  }
  async function guardar(btn){
   const j=datosFormulario(),f=est.form;
   if(f.previo&&!confirm('La corrección crea una versión nueva y conserva la anterior como sustituida. ¿Continuar?'))return;
   btn.disabled=true;
   try{
    const ruta=await subirSoporte();if(!ok())return;
    const datos={...j,clave_idempotencia:f.clave||(f.clave=crypto.randomUUID()),...(ruta?{soporte_archivo:ruta}:{}),
     ...(f.previo?{id:f.previo.id,version:f.previo.version,motivo_cambio:j.motivo}:{})};
    const {data,error}=await sb.rpc('control_faltas_historicas',{p_accion:f.previo?'CORREGIR':'REGISTRAR',p_datos:datos});
    if(error)throw Error(error.message);
    toast(data?.discrepancia?'Registrado con discrepancia: revisa cuál dato capturar.':'Registro guardado con su bitácora.',data?.discrepancia?'err':'ok');
    est.form=null;$h('fh-form').innerHTML='';await cargar();
   }finally{if(btn.isConnected)btn.disabled=false;}
  }
  async function revertir(id){
   const v=(est.leer.registros||[]).find(x=>x.id===id);if(!v)return;
   const motivo=prompt('Motivo para revertir este registro (queda en la bitácora):');if(motivo==null)return;
   if(motivo.trim().length<5)throw Error('Escribe el motivo.');
   const {error}=await sb.rpc('control_faltas_historicas',{p_accion:'REVERTIR',p_datos:{trabajador_id:w.id,id,version:v.version,motivo_cambio:motivo.trim()}});
   if(error)throw Error(error.message);toast('Registro revertido; la versión anterior queda en el historial.','ok');await cargar();
  }
  async function soporte(ruta){
   const {data,error}=await sb.storage.from('expedientes').createSignedUrl(ruta,120);
   if(error||!data?.signedUrl)throw Error('No se pudo abrir el soporte: '+(error?.message||''));
   window.open(data.signedUrl,'_blank','noopener');
  }
  host.addEventListener('click',e=>{
   const b=e.target.closest('[data-fh]');if(!b||!ok())return;
   const a=b.dataset.fh;
   (async()=>{
    if(a==='fechas'||a==='total')return formulario(a==='fechas'?'FECHAS':'TOTAL_AL_CORTE');
    if(a==='corregir'){const v=(est.leer.registros||[]).find(x=>x.id===b.dataset.id);if(v)formulario(v.modo,v);return;}
    if(a==='cancelar'){est.form=null;$h('fh-form').innerHTML='';return;}
    if(a==='guardar')return guardar(b);
    if(a==='revertir')return revertir(b.dataset.id);
    if(a==='soporte')return soporte(b.dataset.ruta);
   })().catch(x=>toast(x.message,'err'));
  });
  host.addEventListener('input',e=>{if(e.target.closest('#fh-form'))vista();});
  host.addEventListener('change',e=>{if(e.target.id==='fh-ej'){est.ej=Number(e.target.value);est.form=null;$h('fh-form').innerHTML='';cargar();}});
  await cargar();
 }

 /* Finiquito nuevo o abierto: muestra la fuente común sin cambiar la fórmula
    del finiquito (protegida y conciliada con NOI). Si difiere de las faltas
    que el finiquito toma de las incidencias semanales, lo advierte. */
 async function panelFiniquito(host,w,fecha,faltasFiniquito,lectura=null){
  if(!host||!w)return;
  const f=iso.test(fecha||'')?fecha:today(),ej=Number(f.slice(0,4)),turno=(host._turno=(host._turno||0)+1);
  host.innerHTML='<p class="fhint">Consultando faltas históricas y aguinaldo acreditado…</p>';
  try{
   const r=await (lectura||resumen(w,ej,f));if(!host.isConnected||turno!==host._turno)return;
   if(!r)throw Error('No se verificaron las fuentes del ejercicio.');
   const base=r.ciclo||r,d=base.d,c=base.conc,distinto=Number.isFinite(faltasFiniquito)&&faltasFiniquito!==d.faltas_afectan;
   host.innerHTML=`<div class="tbl-card" style="padding:10px 12px"><div class="sect">Aguinaldo del ejercicio ${ej} · fuente común</div>
    ${base.desde?`<p class="fhint">Ciclo de esta baja del ${fmtD(base.desde)} al ${fmtD(base.hasta)}. Consulta el acumulado anual en la ficha para ver los ciclos anteriores.</p>`:''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${stat(d.dias_vinculo,'Días base al '+fmtD(f))}${stat(d.faltas_digitales,'Faltas digitales')}${stat(d.faltas_historicas,'Faltas históricas','b')}${stat(d.dias_computables,'Días computables','g')}${stat('$'+money(r2s(c.acreditado+c.reservado)),'Aguinaldo ya acreditado','g')}</div>
    ${distinto?`<p style="color:var(--amber);font-size:12px">⚠ El finiquito toma ${faltasFiniquito} falta(s) de las incidencias semanales y la fuente común reporta ${d.faltas_afectan}. La fórmula del finiquito no cambia aquí: valida los días de aguinaldo con el ajuste NOI si corresponde.</p>`:''}
    ${d.ausencias.discrepancias.length?'<p style="color:var(--red);font-size:12px">⛔ Hay una discrepancia de faltas históricas: revísala en la ficha antes de cerrar el finiquito.</p>':''}
    ${c.acreditado+c.reservado>0?'<p class="fhint">Si ya se pagó o aplicó aguinaldo este año, el finiquito sólo debe incluir el saldo.</p>':''}</div>`;
  }catch(e){if(host.isConnected&&turno===host._turno)host.innerHTML=`<p class="fhint">${esc(e.message)}</p>`;}
 }
 window.PLATINUM_FALTAS_HIST=Object.freeze({montar,panelFiniquito,resumen,_pruebas:{digitalesEnRango}});
})();
