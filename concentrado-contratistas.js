/* PLATINUM OS · Concentrado de nómina a demanda por centro y contratista.
   NOI es fuente fiscal; pagos/cheques y proyecciones se etiquetan sin inventar ISR/IMSS. */
const CC_CENT = v => Math.round(Number(v || 0) * 100) / 100;
const CC_TABLA = 'control_desglose_noi';
let CC_REPORTE = null;
async function ccAuditar(obra, accion, detalle = {}) {
  if (!sb || !USER || !obra) return;
  try { await sb.from('control_bitacora').insert({obra_id:obra.id,modulo:'CONCENTRADO_CONTRATISTAS',accion,detalle,actor_email:USER.email||''}); }
  catch(e) { console.warn('Bitácora concentrado:',e); }
}
function ccObra() {
  const id = document.getElementById('cc-obra')?.value;
  return OBRAS.find(o => o.id === id && empresaDeObra(o) === EMPRESA_ACTIVA);
}
function ccParametros() {
  const obra = ccObra(), anio = Number($('cc-anio')?.value), desde = Number($('cc-desde')?.value), hasta = Number($('cc-hasta')?.value);
  if (!obra || !Number.isInteger(anio) || anio < 2020 || anio > 2100 || !Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1 || hasta > 53 || desde > hasta)
    throw new Error('Revisa centro, año y rango de semanas.');
  return {obra, anio, desde, hasta, contratista: $('cc-contratista')?.value || ''};
}
function openCtrlConcentradoContratistas() {
  if (!OBRA) return toast('Selecciona un centro de trabajo.', 'err');
  const centros = obrasEmpresa(EMPRESA_ACTIVA);
  modal(ctrlNav('📒 Concentrado por contratista') + `<div class="m-body">
    <p class="fhint">Consulta por razón social y centro. NOI aporta los impuestos; un pago o proyección sin NOI solo aporta neto y queda identificado.</p>
    <div class="grid" style="grid-template-columns:2fr repeat(3,1fr);gap:8px">
      <div><label>Centro de trabajo</label><select id="cc-obra" onchange="ccCambiarObra()">${centros.map(o => `<option value="${o.id}" ${o.id === OBRA.id ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></div>
      <div><label>Año</label><input id="cc-anio" type="number" min="2020" max="2100" value="${new Date().getFullYear()}" onchange="ccCambiarObra()"></div>
      <div><label>Desde semana</label><input id="cc-desde" type="number" min="1" max="53" value="1"></div>
      <div><label>Hasta semana</label><input id="cc-hasta" type="number" min="1" max="53" value="${semObra()}"></div>
    </div>
    <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:10px">
      <div style="min-width:190px"><label>Contratista</label><select id="cc-contratista"><option value="">Todos</option></select></div>
      <button id="cc-generar" class="btn dark" onclick="ccGenerar()">Generar</button>
      <button id="cc-exportar" class="btn" onclick="ccExportar()" disabled>⬇ Excel</button>
      <button class="btn" onclick="ccAyuda()">? Guía</button>
    </div>
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:12px">
      <label>Importar desglose global NOI (.xlsx o .xls)</label>
      <div class="fhint">Pon la misma semana en Desde y Hasta. El archivo se asigna a todos los contratistas de este centro; no se sobrescribe un reporte ya importado.</div>
      <input id="cc-archivo" type="file" accept=".xlsx,.xls" onchange="ccImportar(this)">
    </div>
    <div id="cc-resultado" style="margin-top:12px"></div></div>`, 'lg');
  ccCambiarObra(); ccAuditar(OBRA,'ABRIR');
}
async function ccCambiarObra() {
  CC_REPORTE = null;
  const obra = ccObra(), sel = $('cc-contratista'); if (!obra || !sel) return;
  $('cc-exportar').disabled = true; $('cc-resultado').innerHTML = '';
  const anio=Number($('cc-anio')?.value)||new Date().getFullYear();
  const [actuales,historicos]=await Promise.all([
    fetchAllRows(() => sb.from('trabajadores').select('id,contratista').eq('obra_id', obra.id)),
    fetchAllRows(() => sb.from(CC_TABLA).select('contratista').eq('obra_id',obra.id).eq('anio',anio))
  ]);
  if (actuales.error||historicos.error) return toast((actuales.error||historicos.error).message,'err');
  const nombres = [...new Set([...actuales.data,...historicos.data].map(w => String(w.contratista || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'es'));
  if (!nombres.includes('SIN VINCULAR')) nombres.push('SIN VINCULAR');
  sel.innerHTML = '<option value="">Todos</option>' + nombres.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
}
function ccNombre(w) { return [w.primer_apellido, w.segundo_apellido, w.nombres].filter(Boolean).join(' '); }
function ccEvidencia(pagos, cheques, id, sem, neto, chequeRef) {
  const p = pagos.filter(x => x.trabajador_id === id && x.semana === `S${sem}`);
  const c = cheques.filter(x => x.trabajador_id === id && x.semana === `S${sem}`);
  if (chequeRef && !c.some(x => x.id === chequeRef.id)) c.push(chequeRef);
  const cobrado = c.filter(x => ['EXPEDIDO','ENTREGADO'].includes(x.estatus));
  const pagado = CC_CENT([...p, ...cobrado].reduce((s,x) => s + Number(x.importe || 0), 0));
  const forma = c.length ? (p.length ? 'MIXTO' : 'CHEQUE') : (p.length ? 'TRANSFERENCIA' : 'SIN PAGO');
  const estado = pagado ? (Math.abs(CC_CENT(pagado - neto)) <= .01 ? 'COINCIDE' : `DIF. $${money(CC_CENT(pagado - neto))}`) : (c.some(x => x.estatus === 'PENDIENTE') ? 'CHEQUE PENDIENTE' : 'SIN PAGO REGISTRADO');
  return {forma, estado, pagado};
}
async function ccGenerar() {
  let p; try { p = ccParametros(); } catch (e) { return toast(e.message, 'err'); }
  const btn = $('cc-generar'); btn.disabled = true; $('cc-resultado').innerHTML = '<div class="empty"><span class="spin"></span> Consultando fuentes...</div>';
  try {
    const {obra,anio,desde,hasta} = p, inicio = `${anio}-01-01`, fin = `${anio}-12-31`, finTs = `${anio+1}-01-01T00:00:00Z`;
    const [wr,nr,pr,cr,ar,rr] = await Promise.all([
      fetchAllRows(() => sb.from('trabajadores').select('id,no_trab,contratista,nombres,primer_apellido,segundo_apellido').eq('obra_id',obra.id)),
      fetchAllRows(() => sb.from(CC_TABLA).select('*').eq('obra_id',obra.id).eq('anio',anio).gte('semana',desde).lte('semana',hasta)),
      fetchAllRows(() => sb.from('pagos').select('id,trabajador_id,semana,importe,medio').eq('obra_id',obra.id).eq('estado','EXITOSO').gte('fecha_pago',inicio).lte('fecha_pago',fin)),
      fetchAllRows(() => sb.from('cheques').select('id,trabajador_id,semana,importe,estatus').eq('obra_id',obra.id).eq('eliminado',false).gte('created_at',inicio).lt('created_at',finTs)),
      fetchAllRows(() => sb.from('auditoria_calculos_nomina').select('id,trabajador_id,periodo,monto_aplicado,resultado,created_at').eq('obra_id',obra.id).eq('tipo_calculo','PROYECCION_NOMINA').eq('periodo',`S${isoWeekDe(obra,new Date())}`).gte('created_at',inicio).lt('created_at',finTs)),
      fetchAllRows(() => sb.from(CC_TABLA).select('cheque_referencia_id').eq('obra_id',obra.id).eq('anio',anio).not('cheque_referencia_id','is',null))
    ]);
    const error = [wr,nr,pr,cr,ar,rr].find(x => x.error)?.error; if (error) throw error;
    const workers = new Map(wr.data.map(w => [w.id,w])), pagos = pr.data, cheques = cr.data.filter(x => x.estatus !== 'CANCELADO');
    const asignados = new Set(rr.data.map(x => x.cheque_referencia_id).filter(Boolean));
    const chequesLibres = cheques.filter(x => !asignados.has(x.id));
    const filas = [], vistos = new Set();
    for (const x of nr.data) {
      vistos.add(`${x.semana}|${x.trabajador_id}`);
      const ref = x.cheque_referencia_id ? cheques.find(c => c.id === x.cheque_referencia_id) : null;
      const ev = ccEvidencia(pagos,chequesLibres,x.trabajador_id,x.semana,Number(x.neto),ref);
      const fuente = x.fuente_documental === 'HISTORICO_MANUAL' ? 'HISTÓRICO MANUAL' : 'NOI';
      filas.push({...x,fuente,forma:ev.pagado ? ev.forma : (x.metodo_pago_origen || ev.forma),estado_pago:ev.estado,pagado:ev.pagado});
    }
    const proyecciones = new Map(), semanaActual = isoWeekDe(obra,new Date());
    for (const x of ar.data) {
      const sem = Number(String(x.periodo || '').replace(/^S/,'')), k = `${sem}|${x.trabajador_id}`;
      if (anio !== new Date().getFullYear() || sem !== semanaActual || sem < desde || sem > hasta || vistos.has(k) || !workers.has(x.trabajador_id)) continue;
      if (!proyecciones.has(k) || x.created_at > proyecciones.get(k).created_at) proyecciones.set(k,x);
    }
    for (const [k,x] of proyecciones) {
      const sem = Number(x.periodo.slice(1)), w = workers.get(x.trabajador_id), neto = Number(x.monto_aplicado ?? x.resultado?.neto);
      if (!Number.isFinite(neto)) continue;
      vistos.add(k); filas.push({semana:sem,trabajador_id:w.id,trabajador_numero:w.no_trab,trabajador_nombre:ccNombre(w),contratista:w.contratista || 'SIN CONTRATISTA',percepciones:null,isr:null,imss:null,neto:CC_CENT(neto),fuente:'PROYECCIÓN',forma:'POR DEFINIR',estado_pago:'NO TIMBRADO',pagado:0});
    }
    const soloPago = new Map();
    for (const [tipo, items] of [['TRANSFERENCIA',pagos],['CHEQUE',chequesLibres.filter(x => ['EXPEDIDO','ENTREGADO'].includes(x.estatus))]]) {
      for (const x of items) {
        const sem = Number(String(x.semana || '').replace(/^S/,'')), w = workers.get(x.trabajador_id), k = `${sem}|${x.trabajador_id}`;
        if (!w || sem < desde || sem > hasta || vistos.has(k)) continue;
        const v = soloPago.get(k) || {sem,w,neto:0,formas:new Set()}; v.neto += Number(x.importe || 0); v.formas.add(tipo); soloPago.set(k,v);
      }
    }
    for (const x of soloPago.values()) filas.push({semana:x.sem,trabajador_id:x.w.id,trabajador_numero:x.w.no_trab,trabajador_nombre:ccNombre(x.w),contratista:x.w.contratista || 'SIN CONTRATISTA',percepciones:null,isr:null,imss:null,neto:CC_CENT(x.neto),fuente:'PAGO SIN NOI',forma:[...x.formas].join(' + '),estado_pago:'NOI PENDIENTE',pagado:CC_CENT(x.neto)});
    const lista = filas.filter(x => !p.contratista || x.contratista === p.contratista).sort((a,b) => a.semana-b.semana || a.contratista.localeCompare(b.contratista,'es') || a.trabajador_numero-b.trabajador_numero);
    CC_REPORTE = {...p,filas:lista}; $('cc-exportar').disabled = !lista.length;
    const grupos = new Map();
    for (const x of lista) {
      const k = `${x.semana}|${x.contratista}`, g = grupos.get(k) || {sem:x.semana,contr:x.contratista,n:0,noi:0,bruto:0,isr:0,imss:0,neto:0,pagado:0,proy:0,dif:0};
      g.n++;g.neto+=Number(x.neto);g.pagado+=Number(x.pagado);
      if (x.fuente === 'NOI' || x.fuente === 'HISTÓRICO MANUAL') {g.bruto+=Number(x.percepciones);g.isr+=Number(x.isr);g.imss+=Number(x.imss);}
      if (x.fuente === 'NOI') {g.noi++;if(x.estado_pago !== 'COINCIDE')g.dif++;}
      if (x.fuente === 'PROYECCIÓN')g.proy++;
      grupos.set(k,g);
    }
    const total = CC_CENT(lista.reduce((s,x) => s + Number(x.neto),0)), conNOI = lista.filter(x => x.fuente === 'NOI').length;
    $('cc-resultado').innerHTML = `<div class="stats"><div class="stat b"><div class="n">$${money(total)}</div><div class="l">Neto · incluye proyección</div></div><div class="stat g"><div class="n">${conNOI}/${lista.length}</div><div class="l">Con desglose NOI</div></div><div class="stat a"><div class="n">${lista.filter(x => x.fuente === 'PROYECCIÓN').length}</div><div class="l">Proyección sin timbrar</div></div></div>
      <p class="fhint" style="margin-top:8px">ISR/IMSS pueden provenir de NOI o del histórico manual: revisa la fuente de cada renglón en Excel. Las semanas sin fuente no se presentan como cero. “Pagado reg.” es evidencia bancaria o cheque expedido.</p>
      ${ctrlTabla(['SEMANA','CONTRATISTA','PERSONAS','CON NOI','PERCEPCIONES','ISR','IMSS','NETO','PAGADO REG.','PROY.','DIFERENCIAS'],[...grupos.values()].map(g => `<tr><td>S${g.sem}</td><td>${esc(g.contr)}</td><td>${g.n}</td><td>${g.noi}/${g.n}</td><td>${g.bruto?'$'+money(g.bruto):'—'}</td><td>${g.bruto?'$'+money(g.isr):'—'}</td><td>${g.bruto?'$'+money(g.imss):'—'}</td><td><b>$${money(g.neto)}</b></td><td>$${money(g.pagado)}</td><td>${g.proy}</td><td>${g.dif}</td></tr>`),'Sin NOI, pagos ni proyección en el rango elegido.')}`;
    await ccAuditar(obra,'GENERAR',{anio,desde,hasta,contratista:p.contratista,filas:lista.length});
  } catch (e) { $('cc-resultado').innerHTML = `<div class="empty">⚠️ ${esc(ctrlFaltaScript(e))}</div>`; } finally { btn.disabled = false; }
}
async function ccImportar(input) {
  const file = input.files?.[0]; if (!file) return;
  try {
    const p = ccParametros(); if (p.desde !== p.hasta) throw new Error('Para importar, Desde y Hasta deben indicar la misma semana.');
    const sem = p.desde, buf = await file.arrayBuffer(), book = XLSX.read(buf,{type:'array'});
    const matriz = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:'',raw:true,blankrows:true});
    const alias = {no:['CLAVE','NUMEROTRABAJADOR','NUMERO'],nombre:['NOMBREDELTRABAJADOR','NOMBRECOMPLETO'],per:['TOTALPERCEPCIONES'],isr:['TOTALISR'],imss:['TOTALIMSS'],sub:['SUBSIDIOEMPLEO'],ded:['TOTALDEDUCCIONES'],net:['NETOPAGADO','TOTALNETO']};
    let layout;
    for (let i=0;i<Math.min(matriz.length,120);i++) {
      const headers = (matriz[i] || []).map(ctrlNormHdr), pos = {};
      for (const [k,alts] of Object.entries(alias)) pos[k] = headers.findIndex(h => alts.includes(h));
      if (['no','per','isr','imss','ded','net'].every(k => pos[k] >= 0)) {layout={i,pos};break;}
    }
    if (!layout) throw new Error('Faltan encabezados fiscales de NOI: clave, percepciones, ISR, IMSS, deducciones y neto.');
    const {data:ant,error:eAnt} = await fetchAllRows(() => sb.from(CC_TABLA).select('trabajador_numero,archivo_sha256,fuente_documental,percepciones,isr,imss,subsidio,total_deducciones,neto').eq('obra_id',p.obra.id).eq('anio',p.anio).eq('semana',sem));
    if (eAnt) throw eAnt;
    const {data:trab,error:eTrab} = await fetchAllRows(() => sb.from('trabajadores').select('id,no_trab,contratista').eq('obra_id',p.obra.id));
    if (eTrab) throw eTrab;
    const [y,m,d]=String(p.obra.fecha_inicio || SEMANA1).slice(0,10).split('-').map(Number);
    const lunesSiguiente=new Date(Date.UTC(y,m-1,d+sem*7)).toISOString().slice(0,10);
    const corte=`${lunesSiguiente}T00:00:00-06:00`;
    const {data:cambios,error:eCambios} = await fetchAllRows(() => sb.from('historial').select('trabajador_id,fecha,datos_antes,datos_despues').eq('obra_id',p.obra.id).gte('fecha',corte));
    if (eCambios) throw eCambios;
    const primerCambio = new Map();for(const h of cambios){const antes=h.datos_antes?.contratista,despues=h.datos_despues?.contratista;
      if(!antes||antes===despues)continue;const old=primerCambio.get(h.trabajador_id);if(!old||h.fecha<old.fecha)primerCambio.set(h.trabajador_id,h);}
    const porNo = new Map(trab.map(w => [Number(w.no_trab),w])), hash = await ctrlSha(buf), filas = [], sinVinculo = [], duplicados = [], vistos = new Set();
    for (let i=layout.i+1;i<matriz.length;i++) {
      const r = matriz[i] || [], no = Number(String(r[layout.pos.no] ?? '').trim()); if (!Number.isInteger(no) || no <= 0) continue;
      const w = porNo.get(no),contratista=w?(primerCambio.get(w.id)?.datos_antes?.contratista||w.contratista):'';
      if (!w || !contratista) sinVinculo.push(no);
      if (vistos.has(no)) {duplicados.push(no);continue;} vistos.add(no);
      if (['per','ded','net'].some(k => r[layout.pos[k]] === '' || r[layout.pos[k]] == null)) throw new Error(`Falta importe fiscal en fila ${i+1}, trabajador #${no}.`);
      const valor = key => CC_CENT(ctrlNumero(r[layout.pos[key]]));
      const per=valor('per'),isr=valor('isr'),imss=valor('imss'),ded=valor('ded'),net=valor('net'),sub=layout.pos.sub>=0?valor('sub'):0;
      if ([per,isr,imss,ded,net,sub].some(x => !Number.isFinite(x)) || Math.abs(CC_CENT(per+sub-ded-net))>.01) throw new Error(`No cuadra la fila ${i+1}, trabajador #${no}.`);
      filas.push({obra_id:p.obra.id,anio:p.anio,semana:sem,trabajador_id:w?.id||null,trabajador_numero:no,trabajador_nombre:String(r[layout.pos.nombre] || `TRABAJADOR ${no}`).trim(),contratista:contratista||'SIN VINCULAR',tipo_calculo:'NOMINA',percepciones:per,isr,imss,subsidio:sub,total_deducciones:ded,neto:net,archivo_nombre:file.name,archivo_sha256:hash,fila_origen:i+1,nota_origen:contratista?'Contratista según historial al cierre de semana':'Clave NOI sin trabajador/contratista vinculado'});
    }
    if (duplicados.length) throw new Error(`Números duplicados en NOI: ${duplicados.join(', ')}. No se importó nada.`);
    if (!filas.length) throw new Error('No hay filas de trabajadores válidas.');
    const existentes = new Map(ant.map(x => [Number(x.trabajador_numero),x]));
    for (const x of filas) {const old = existentes.get(x.trabajador_numero);if (!old) continue;
      if (old.fuente_documental !== 'NOI' || old.archivo_sha256 !== hash || ['percepciones','isr','imss','subsidio','total_deducciones','neto'].some(k => Math.abs(CC_CENT(Number(old[k])-Number(x[k])))>.01))
        throw new Error(`S${sem} ya tiene un dato distinto para #${x.trabajador_numero}. No se sobrescribió; requiere revisión del origen.`);
    }
    const nuevas = filas.filter(x => !existentes.has(x.trabajador_numero));
    if (!nuevas.length) return toast('Todos los trabajadores de ese reporte ya estaban importados.','ok');
    if (!confirm(`¿Importar ${nuevas.length} filas fiscales NOI nuevas de S${sem} ${p.anio} para ${p.obra.nombre}? ${filas.length-nuevas.length} ya están verificadas con el mismo archivo.\n\nSIN VINCULAR (no se atribuyen a ningún contratista): ${[...new Set(sinVinculo)].join(', ')||'ninguno'}.`)) return;
    input.disabled=true; markWrite(); const {error} = await sb.from(CC_TABLA).insert(nuevas); if (error) throw error;
    await ccAuditar(p.obra,'IMPORTAR_NOI',{anio:p.anio,semana:sem,filas:nuevas.length,ya_existentes:filas.length-nuevas.length,sin_vincular:[...new Set(sinVinculo)],archivo:file.name,sha256:hash});
    toast(`${nuevas.length} filas NOI importadas para S${sem}.`,'ok'); await ccGenerar();
  } catch (e) { toast('No se importó NOI: '+ctrlFaltaScript(e),'err'); } finally { input.disabled=false;input.value=''; }
}
async function ccExportar() {
  const r = CC_REPORTE; if (!r?.filas.length) return toast('Genera primero el concentrado.','err');
  const obra=r.obra,empresa=empresaDeObra(obra),cols=['NO.','NOMBRE COMPLETO','PERCEPCIONES','IMPUESTO ISR','IMPUESTO IMSS','MONTO NETO','FORMA DE PAGO','NOTAS / FUENTE'];
  const celda={...ST.cell,font:{...ST.cell.font,color:{rgb:'14213D'}},fill:{patternType:'solid',fgColor:{rgb:'FFFFFF'}}};
  const moneda={...ST.money,font:{...ST.money.font,color:{rgb:'14213D'}},fill:{patternType:'solid',fgColor:{rgb:'FFFFFF'}}};
  const rows=[[`CONCENTRADO DE NÓMINA · S${r.desde} A S${r.hasta} · ${r.anio}`],[`${razonSocialEmpresa(empresa)} · ${obra.nombre} · ${r.contratista||'TODOS LOS CONTRATISTAS'}`],[]],styles=[ST.title,ST.sub,ST.cell],merges=[{s:{r:0,c:0},e:{r:0,c:7}},{s:{r:1,c:0},e:{r:1,c:7}}],heights=[{hpt:29},{hpt:22},{hpt:8}];
  const grupos=new Map();for(const x of r.filas){const k=`${x.semana}|${x.contratista}`;if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(x);}
  const resumen=[];
  for(const [clave,items] of grupos){const [sem,contr]=clave.split('|'),fisc=items.filter(x=>x.fuente==='NOI'||x.fuente==='HISTÓRICO MANUAL');
    const tot=k=>CC_CENT(fisc.reduce((s,x)=>s+Number(x[k]),0)),neto=CC_CENT(items.reduce((s,x)=>s+Number(x.neto),0));
    merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:7}});rows.push([`SEMANA ${sem} · CONTRATISTA ${contr} · ${items.length} TRABAJADOR(ES)`]);styles.push(ST.title);heights.push({hpt:23});
    rows.push(cols);styles.push(ST.head);heights.push({hpt:27});
    for(const x of items){const fiscal=x.fuente==='NOI'||x.fuente==='HISTÓRICO MANUAL';
      const nota=[x.fuente,x.estado_pago,x.nota_origen||'',x.ajuste_origen&&Number(x.ajuste_origen)!==0?`AJUSTE DE ORIGEN ${money(x.ajuste_origen)}`:''].filter(Boolean).join(' · ');
      rows.push([x.trabajador_numero,x.trabajador_nombre,fiscal?Number(x.percepciones):'',fiscal?Number(x.isr):'',fiscal?Number(x.imss):'',Number(x.neto),x.forma,nota]);
      styles.push(cols.map((_,i)=>i>=2&&i<=5?moneda:celda));heights.push({hpt:nota.length>80?37:22});
    }
    merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:1}});
    rows.push([`TOTAL SEMANA ${sem} · ${contr}`,'',fisc.length?tot('percepciones'):'',fisc.length?tot('isr'):'',fisc.length?tot('imss'):'',neto,'','']);styles.push([ST.total,ST.total,ST.totalMoney,ST.totalMoney,ST.totalMoney,ST.totalMoney,ST.total,ST.total]);heights.push({hpt:24});
    rows.push([]);styles.push(ST.cell);heights.push({hpt:9});resumen.push({sem,contr,neto});
  }
  merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:7}});rows.push(['RESUMEN POR SEMANA Y CONTRATISTA']);styles.push(ST.title);heights.push({hpt:24});
  rows.push(['SEMANA','CONTRATISTA','','','','MONTO NETO','','']);styles.push(ST.head);heights.push({hpt:24});
  for(const x of resumen){rows.push([`S${x.sem}`,x.contr,'','','',x.neto,'','']);styles.push([celda,celda,celda,celda,celda,moneda,celda,celda]);heights.push({hpt:21});}
  const total=CC_CENT(r.filas.reduce((s,x)=>s+Number(x.neto),0));merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:4}});rows.push(['TOTAL GENERAL · INCLUYE PROYECCIONES','','','','',total,'','']);styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total,ST.total]);heights.push({hpt:27});
  const ws=buildSheet(rows,styles,[10,38,18,16,16,18,24,70],merges,heights);
  for(let i=0;i<rows.length;i++){const cell=ws[`H${i+1}`];if(cell&&cell.v)cell.s={...(cell.s||{}),alignment:{vertical:'center',wrapText:true}};}
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,ws,'CONCENTRADO');book.__empresaPorHoja={CONCENTRADO:empresa};book.__auditObraIds=[obra.id];
  await dl(book,`CONCENTRADO_${obra.nombre.replace(/[^A-ZÑ0-9]+/gi,'_')}_S${r.desde}_S${r.hasta}_${r.anio}.xlsx`);
  await ccAuditar(obra,'EXPORTAR_EXCEL',{anio:r.anio,desde:r.desde,hasta:r.hasta,contratista:r.contratista,filas:r.filas.length});
  toast('Excel generado con razón social, logotipo y fuentes identificadas.','ok');
}
function ccAyuda() {
  modal(ctrlNav('❔ Guía · Concentrado por contratista','openCtrlConcentradoContratistas')+`<div class="m-body" style="line-height:1.55">
    <p><b>1.</b> Selecciona centro, año, semanas y contratista. Pulsa Generar. “Todos” muestra cada contratista por semana.</p>
    <p><b>2.</b> Para impuestos oficiales, fija Desde/Hasta a una semana e importa el reporte global NOI de ese centro. Se valida cada trabajador y el cuadre percepciones + subsidio − deducciones = neto. Un reporte distinto no sobrescribe cifras existentes. Las semanas históricas manuales conservan su propia etiqueta y sus ajustes de origen.</p>
    <p><b>3.</b> La fuente NOI prevalece. Si falta, un pago o proyección aporta únicamente neto, sin ISR/IMSS. El histórico manual sí muestra sus cifras fiscales, pero no se presume timbrado. Revisa diferencias y trabajadores “SIN PAGO”. El total puede incluir una semana proyectada.</p>
    <p><b>4.</b> Exporta el Excel corporativo. Incluye fuente, estado de pago, razón social y logo. Este control no sustituye CFDI, reporte final NOI ni comprobante bancario.</p></div>`,'md');
}

