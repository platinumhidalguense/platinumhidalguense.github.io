/* ISR mensual ordinario: composición exclusiva de quincenas. No sustituye
   nominaPeriodo, tarifas semanales, créditos ni importes históricos sellados. */
function isrQNumero(v,nombre){
  if(v==null||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))||Number(v)<0)throw Error('Falta o es inválido '+nombre+'.');
  return Number(v);
}
function isrQPeriodo(desde,hasta){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(desde||'')||!/^\d{4}-\d{2}-\d{2}$/.test(hasta||''))throw Error('Fechas fiscales inválidas.');
  const a=new Date(desde+'T12:00:00Z'),b=new Date(hasta+'T12:00:00Z');
  if(a.toISOString().slice(0,10)!==desde||b.toISOString().slice(0,10)!==hasta||desde.slice(0,7)!==hasta.slice(0,7)||a.getUTCDate()!==16||b.getUTCDate()!==new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+1,0)).getUTCDate())throw Error('El ajuste corresponde únicamente a la segunda quincena completa del mes.');
  if(a.getUTCFullYear()!==2026)throw Error('La tarifa validada es 2026. Se requiere validar la tarifa del nuevo ejercicio.');
  return {desde,hasta,mes:desde.slice(0,7)};
}
function isrQCalcular(j){
  const p=isrQPeriodo(j.desde,j.hasta),r=redondearCentavos;
  const acumulado=isrQNumero(j.gravable_acumulado,'gravable acumulado'),actual=isrQNumero(j.gravable_actual,'gravable actual'),local=isrQNumero(j.impuesto_local,'impuesto local');
  const retenido=isrQNumero(j.isr_acumulado,'ISR retenido previo'),ordinario=isrQNumero(j.isr_ordinario,'ISR ordinario sin ajuste'),dias=isrQNumero(j.dias_subsidio,'días para subsidio');
  if(dias>30.4||local>acumulado+actual||local>r((acumulado+actual)*.05))throw Error('Revisa días de subsidio o impuesto local: no son válidos.');
  const base=r(acumulado+actual-local),tramo=ISR_M.find(t=>base>=t[0]&&base<=t[1]);
  if(base>0&&!tramo)throw Error('Base fuera de la tarifa mensual.');
  const impuestoRaw=tramo?tramo[2]+(base-tramo[0])*tramo[3]/100:0;
  // UMA mensual publicada para 2026; enero tiene porcentaje transitorio.
  const cuota=p.mes.endsWith('-01')?r(3439.46*.1559):r(3566.22*.1502);
  const subsidio=base>0&&base<=11492.66?r(cuota*Math.min(1,dias/30.4)):0;
  const mensualRaw=Math.max(0,impuestoRaw-subsidio),mensual=r(mensualRaw),quincenalRaw=mensualRaw-retenido;
  const saldoFavor=r(Math.max(0,-quincenalRaw)),isr=r(Math.max(0,quincenalRaw));
  return {version:'ISR_MENSUAL_QUINCENAL_2026_V1',...p,base_mensual:base,limite_inferior:tramo?.[0]||0,tasa:tramo?.[3]||0,cuota_fija:tramo?.[2]||0,
    impuesto_raw:impuestoRaw,subsidio_mensual:subsidio,isr_mensual_raw:mensualRaw,isr_mensual:mensual,isr_acumulado:retenido,isr_ordinario:ordinario,
    isr_quincenal_raw:quincenalRaw,isr_quincenal:isr,delta_isr:r(isr-ordinario),saldo_favor:saldoFavor};
}
function nominaQuincenalAjustada(w,opts,fuente){
  const base=nominaPeriodo(w,opts);
  if(periodoPago(w)!=='QUINCENAL')return base;
  const a=isrQCalcular(fuente);
  if(a.saldo_favor>0)throw Error('El ISR previo excede al mensual; requiere revisión de saldo a favor.');
  return {...base,isr:a.isr_quincenal,neto:redondearCentavos(base.neto+base.isr-a.isr_quincenal),ajuste_mensual:a};
}
function isrQAplicarFila(f,s){
  if(f.fin||periodoPago(f.w)!=='QUINCENAL')return f;
  if(f.isr_mensual){if(f.isr_mensual.fuente_id!==s.id)throw Error('La fila ya tiene otro ajuste ISR.');return f;}
  const a=isrQCalcular(s),r=redondearCentavos;
  const previsionOrigen=s.prevision_referencia!=null?'CONTROL_INTERNO_QUINCENAL':'DIFERENCIAL_CAPTURADO';
  if(s.prevision_referencia!=null){
    const prevision=r(isrQNumero(s.prevision_referencia,'previsión del control interno'));
    f={...f,prevision,neto:r(Math.max(0,f.sueldo+prevision-f.incidencias-f.creditos-f.otras))};
  }
  if(a.saldo_favor>0)throw Error(`#${f.w.no_trab}: ISR acumulado mayor al mensual; revisar saldo a favor.`);
  if(s.resultado&&r(s.resultado.isr_quincenal)!==a.isr_quincenal)throw Error('El cálculo fiscal difiere del respaldo guardado.');
  const sueldo=r(f.sueldo-a.delta_isr),prevision=r(f.prevision+a.delta_isr);
  if(sueldo-f.incidencias<0||prevision<0||(a.delta_isr!==0&&f.prevision<=0))throw Error(`#${f.w.no_trab}: previsión o neto fiscal insuficiente para compensar ISR. Revisión requerida.`);
  const neto=r(Math.max(0,sueldo+prevision-f.incidencias-f.creditos-f.otras));
  if(neto!==f.neto)throw Error('El ajuste ISR no conservó el neto previo.');
  return {...f,sueldo,prevision,costo:r(f.costo-a.delta_isr),neto,
    isr_mensual:{...a,fuente_id:s.id,fuente_sha256:s.archivo_sha256,revision:s.revision,sueldo_sin_ajuste:f.sueldo,prevision_sin_ajuste:f.prevision,prevision_origen:previsionOrigen}};
}
async function isrQAplicarModelo(modelo){
  const candidatas=modelo.filas.filter(f=>!f.fin&&periodoPago(f.w)==='QUINCENAL');
  if(!candidatas.length)return modelo;
  const grupos=new Map();
  for(const f of candidatas){
    const [desde,hasta]=rangoRetencion(f.w,modelo.sem);
    if(desde<'2026-10-16'||desde.slice(-2)!=='16')continue;
    const k=f.w.obra_id+'|'+desde; if(!grupos.has(k))grupos.set(k,{obra_id:f.w.obra_id,desde,hasta});
  }
  if(!grupos.size)return modelo;
  const lecturas=await Promise.all([...grupos.values()].map(async g=>{
    const {data,error}=await sb.rpc('control_isr_quincenal',{p_accion:'LEER',p_datos:{...g,semana:modelo.sem}});
    if(error||!Array.isArray(data?.filas))throw Error('No se verificó el ajuste mensual ISR: '+(error?.message||'respuesta incompleta'));
    return [g.obra_id+'|'+g.desde,data.filas];
  }));
  const fuentes=new Map(lecturas);
  const filas=modelo.filas.map(f=>{
    if(f.fin||periodoPago(f.w)!=='QUINCENAL')return f;
    const [desde]=rangoRetencion(f.w,modelo.sem),g=fuentes.get(f.w.obra_id+'|'+desde);
    if(!g)return f;
    const matches=g.filter(s=>s.trabajador_id===f.w.id);
    if(matches.length!==1||matches[0].vigente!==true)throw Error(`#${f.w.no_trab}: falta un ajuste ISR mensual vigente para ${desde.slice(0,7)}. Abre «ISR mensual quincenal» y valida sus acumulados.`);
    return isrQAplicarFila(f,matches[0]);
  });
  return {...modelo,filas,items:filas.flatMap(f=>f.items),costo:redondearCentavos(filas.reduce((n,f)=>n+f.costo,0)),neto:redondearCentavos(filas.reduce((n,f)=>n+f.neto,0))};
}
function isrQHoja(modelo){
  const filas=modelo.filas.filter(f=>f.isr_mensual),rows=[['AJUSTE MENSUAL ISR · SEGUNDA QUINCENA'],['NO.','TRABAJADOR','PERIODO','BASE MENSUAL','ISR MENSUAL','ISR PREVIO','ISR ORDINARIO Q2','ISR AJUSTADO Q2','DIFERENCIA ISR','PREVISIÓN ANTERIOR','PREVISIÓN AJUSTADA','NETO A PAGAR','FUENTE / REVISIÓN']];
  for(const f of filas){const a=f.isr_mensual;rows.push([f.w.no_trab,fullName(f.w),a.desde+' / '+a.hasta,a.base_mensual,a.isr_mensual,a.isr_acumulado,a.isr_ordinario,a.isr_quincenal,a.delta_isr,a.prevision_sin_ajuste,f.prevision,f.neto,a.fuente_id+' · '+a.revision]);}
  return filas.length?buildSheet(rows,[ST.title,ST.head,...filas.map(()=>[ST.cellC,ST.cell,ST.cell,...Array(9).fill(ST.money),ST.cell])],[8,38,26,18,18,18,20,20,20,20,20,20,42],[{s:{r:0,c:0},e:{r:0,c:12}}]):null;
}
async function openISRQuincenal(){
  if(!OBRA)return;
  const obra=OBRA.id,fecha=today().slice(0,7)+'-16',hasta=retISO(new Date(Date.UTC(+fecha.slice(0,4),+fecha.slice(5,7),0,12)));
  modal(ctrlNav('🧮 ISR mensual quincenal')+`<div class="m-body"><p>Segunda quincena: acumula ingresos gravados e ISR previamente retenido. Compensa únicamente el cambio de ISR en el diferencial existente; conserva su clasificación fiscal. Faltas y créditos se mantienen.</p><div class="grid"><div><label>Desde</label><input type="date" id="iq-desde" value="${fecha}"></div><div><label>Hasta</label><input type="date" id="iq-hasta" value="${hasta}"></div></div><button class="btn" onclick="isrQCargar()">Consultar periodo</button>${puedeEditarTrabajador()?'<input type="file" id="iq-file" accept=".xls,.xlsx" onchange="isrQLeerArchivo()"><p class="fhint">Importa el «Desglose de ISR Ajustado» de NOI. Verifica la propuesta antes de confirmar. Si hay incidencias o cambia el sueldo, captura el ISR ordinario respaldado por NOI.</p>':''}<div id="iq-out"></div></div>`,'lg');
  window._ISRQ={obra};await isrQCargar();
}
async function isrQCargar(){
  const st=window._ISRQ;if(!st||OBRA?.id!==st.obra)return;
  try{const desde=$('iq-desde').value,hasta=$('iq-hasta').value;isrQPeriodo(desde,hasta);
    const {data,error}=await sb.rpc('control_isr_quincenal',{p_accion:'LEER',p_datos:{obra_id:st.obra,desde,hasta}});if(error)throw error;
    if(OBRA?.id!==st.obra||!$('iq-out')||desde!==$('iq-desde').value||hasta!==$('iq-hasta').value)return;
    if(!Array.isArray(data?.filas))throw Error('Respuesta ISR incompleta.');
    $('iq-out').innerHTML=ctrlTabla(['No.','Trabajador','ISR mensual','ISR Q2','Diferencia ISR','Estado'],data.filas.map(s=>`<tr><td>${esc(s.no_trab)}</td><td>${esc(s.nombre)}</td><td>$${money(s.resultado.isr_mensual)}</td><td>$${money(s.resultado.isr_quincenal)}</td><td>$${money(s.resultado.delta_isr)}</td><td>${s.vigente?'Vigente':'Revalidar fuentes'} · revisión ${s.revision}</td></tr>`),'Sin acumulados confirmados para el periodo.');
  }catch(e){if($('iq-out'))$('iq-out').textContent=e.message;}
}
function isrQNormalizar(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function isrQParsearLibro(wb,personal,desde,hasta){
  isrQPeriodo(desde,hasta);
  const resultados=[];
  for(const nombre of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[nombre],{header:1,defval:''});
    if(!rows.some(r=>String(r[0]).toUpperCase().includes('TIPO')&&String(r[0]).toUpperCase().includes('ISR')&&String(r[0]).toUpperCase().includes('AJUSTADO')))continue;
    const h=rows.findIndex(r=>isrQNormalizar(r[0])==='TRABAJADOR'&&isrQNormalizar(r[3])==='GRAVABLEACUMULADO');
    if(h<0)throw Error('No se encontraron las columnas del desglose ajustado.');
    const factor=String(rows.find(r=>String(r[0]).includes('Factor Mensual'))?.[0]||'').match(/:\s*([\d.]+)\s*$/);
    if(!factor||Number(factor[1])!==1)throw Error('El archivo usa otro factor mensual. Debe revisarse antes de aplicar el ajuste.');
    const periodo=String(rows.find(r=>String(r[0]).includes('Periodo de Pago:'))?.[0]||'');
    const fechas=[...periodo.matchAll(/(\d{1,2})\/([A-Za-zÁÉÍÓÚáéíóú]+)\/(\d{2,4})/g)].map(m=>{const mes=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'].indexOf(m[2].slice(0,3).toUpperCase())+1;return (m[3].length===2?'20':'')+m[3]+'-'+String(mes).padStart(2,'0')+'-'+m[1].padStart(2,'0');});
    if(fechas.length!==2||fechas[0]!==desde||fechas[1]!==hasta)throw Error('El periodo del archivo no corresponde al seleccionado.');
    for(let i=h+1;i<rows.length;i++){
      const x=rows[i];if(!String(x[0]).trim()&&!x[1])continue;
      const personas=personal.filter(w=>periodoPago(w)==='QUINCENAL'&&Number(w.no_trab)===Number(x[0])&&isrQNormalizar([w.nombres,w.primer_apellido,w.segundo_apellido].join(' '))===isrQNormalizar(x[1]));
      if(personas.length!==1)throw Error(`Fila ${i+1}: número y nombre no identifican inequívocamente al trabajador de este centro.`);
      const w=personas[0];if(Number(w.sd)!==Number(x[2]))throw Error(`Fila ${i+1}: SD distinto de la ficha; verifica el periodo.`);
      const j={trabajador_id:w.id,no_trab:w.no_trab,nombre:String(x[1]),sd:Number(x[2]),desde,hasta,gravable_acumulado:isrQNumero(x[3],'gravable acumulado'),gravable_actual:isrQNumero(x[4],'gravable actual'),impuesto_local:isrQNumero(x[5],'impuesto local'),isr_acumulado:isrQNumero(x[21],'ISR previo'),isr_ordinario:null,dias_subsidio:30.4,isr_noi_raw:isrQNumero(x[22],'ISR ajustado NOI'),fila:i+1};
      // No inferir el ISR ordinario de Q2 a partir de Q1: puede haber cambios
      // de salario, premios, incidencias o subsidio aun con una base similar.
      resultados.push(j);
    }
  }
  if(!resultados.length||new Set(resultados.map(x=>x.trabajador_id)).size!==resultados.length)throw Error('Archivo vacío o con trabajadores repetidos.');
  return resultados;
}
async function isrQLeerArchivo(){
  const st=window._ISRQ,file=$('iq-file')?.files?.[0];if(!st||!file||!puedeEditarTrabajador())return;
  try{const desde=$('iq-desde').value,hasta=$('iq-hasta').value,bytes=await file.arrayBuffer(),hash=await sha256Hex(new Uint8Array(bytes));
    const r=await fetchAllRows(()=>sb.from('trabajadores').select('id,obra_id,no_trab,nombres,primer_apellido,segundo_apellido,sd,periodo_pago').eq('obra_id',st.obra).eq('eliminado',false));if(r.error)throw r.error;
    if(OBRA?.id!==st.obra||!$('iq-out')||desde!==$('iq-desde').value||hasta!==$('iq-hasta').value)return;
    const filas=isrQParsearLibro(XLSX.read(bytes,{type:'array'}),r.data,desde,hasta);
    st.propuesta={obra_id:st.obra,desde,hasta,archivo_nombre:file.name,archivo_sha256:hash,filas};
    $('iq-out').innerHTML='<p>ISR Q2 = ISR mensual − ISR retenido Q1. Para compensar sólo su variación, captura también el ISR ordinario Q2 que ya contemplaba el sueldo registrado, respaldado por NOI.</p>'+ctrlTabla(['No.','Trabajador','ISR previo','ISR ordinario Q2','ISR Q2 ajustado NOI'],filas.map((s,i)=>`<tr><td>${s.no_trab}</td><td>${esc(s.nombre)}</td><td>$${money(s.isr_acumulado)}</td><td><input type="number" min="0" step="0.0001" id="iq-normal-${i}" value="${s.isr_ordinario??''}"></td><td>$${money(s.isr_noi_raw)}</td></tr>`))+'<button class="btn primary" id="iq-confirmar" onclick="isrQConfirmar()">Confirmar acumulados e ISR ordinario</button>';
  }catch(e){if($('iq-out'))$('iq-out').textContent=e.message;}
}
async function isrQConfirmar(){
  const st=window._ISRQ,p=st?.propuesta,btn=$('iq-confirmar');if(!p||!btn||btn.disabled)return;
  btn.disabled=true;
  try{if(OBRA?.id!==st.obra||$('iq-desde').value!==p.desde||$('iq-hasta').value!==p.hasta)throw Error('Cambió el centro o periodo. Vuelve a importar.');
    const filas=p.filas.map((x,i)=>({...x,isr_ordinario:isrQNumero($('iq-normal-'+i).value,'ISR ordinario Q2')}));
    for(const f of filas)if(redondearCentavos(isrQCalcular(f).isr_quincenal)!==redondearCentavos(f.isr_noi_raw))throw Error(`#${f.no_trab}: el ISR mensual no coincide con NOI. Revisa subsidio y acumulados.`);
    const {error}=await sb.rpc('control_isr_quincenal',{p_accion:'GUARDAR',p_datos:{...p,filas,confirmado:true}});if(error)throw error;
    delete st.propuesta;toast('Ajuste mensual guardado con trazabilidad. Prepara nuevamente las fotografías abiertas.','ok');await isrQCargar();
  }catch(e){toast(e.message,'err');}finally{if($('iq-confirmar'))$('iq-confirmar').disabled=false;}
}
