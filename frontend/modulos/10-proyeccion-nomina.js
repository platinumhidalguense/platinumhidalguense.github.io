/* ---------- PROYECCIÓN DE NÓMINA (descuentos + neto + finiquitos) ---------- */
function proyFiniquitosSemana(personal,d1,d2,historicos=[]){
  if(!d1||!d2||d1>d2)return [];
  return personal.flatMap(w=>{
    if(!w.fecha_baja||w.fecha_baja<d1||w.fecha_baja>d2)return [];
    if(w.estatus==='BAJA'&&Number(w.monto_finiquito)>0)return [w];
    // Reingreso posterior al corte: rescatar el finiquito de la baja anterior,
    // sin volver a colocarlo en la ficha vigente ni en la nómina del reingreso.
    if(w.estatus!=='ACTIVO'||!w.fecha_reingreso||w.fecha_reingreso<=d2)return [];
    const a=historicos.find(x=>x.trabajador_id===w.id&&x.obra_id===w.obra_id&&x.periodo===w.fecha_baja);
    return a&&Number(a.monto_aplicado)>0?[{...w,monto_finiquito:Number(a.monto_aplicado)}]:[];
  });
}
async function proyCargarHistoricos(personal){
  return proyLeerFiniquitos(personal.filter(w=>w.estatus==='ACTIVO'&&w.fecha_baja&&w.fecha_reingreso>w.fecha_baja));
}
function pyCandidatos(d1,d2,periodo){
  // En una semana histórica, el estado actual no sustituye a las fechas de
  // alta, baja y reingreso. Una baja de esa semana va solo a finiquitos.
  const sinServicio=asSinServicioSemana(d1);
  let act=WORKERS.filter(w=>asVigenteSemana(w,d1,d2)&&!sinServicio.has(w.id)
    &&(w.estatus==='ACTIVO'||(w.estatus==='BAJA'&&w.fecha_baja>d2)));
  if(periodo!=='TODOS')act=act.filter(w=>(w.periodo_pago||'SEMANAL')===periodo);
  act.sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
  const fins=proyFiniquitosSemana(WORKERS.filter(w=>!sinServicio.has(w.id)),d1,d2,globalThis._PY_FINIQUITOS_HISTORICOS||[]);
  fins.sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
  return {act,fins};
}
/* La proyección usa importes ya guardados, no vuelve a ejecutar nominaPeriodo.
   Antes de mostrarla o exportarla se leen de nuevo sus tres fuentes: de lo
   contrario una incidencia corregida por otra sesión puede quedar obsoleta en
   WORKERS/DESC/DIFS aunque la base ya tenga el valor correcto. */
async function pyDatosFrescos(){
  globalThis._PY_FRESCOS=false;
  const id=OBRA&&OBRA.id;
  if(!id)return false;
  const [{data:tw,error:e1},{data:ds,error:e2},{data:df,error:e3},{data:ab,error:e4},{data:ft,error:e5}]=await Promise.all([
    fetchAllRows(()=>sb.from('trabajadores').select('*').eq('obra_id',id).eq('eliminado',false)),
    fetchAllRows(()=>sb.from('descuentos').select('*').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('diferenciales').select('*').eq('obra_id',id).eq('activo',true)),
    fetchAllRows(()=>sb.from('control_altas_bajas_cortas').select('obra_id,trabajador_id,anio,semana,estado_servicio').eq('obra_id',id)),
    fetchAllRows(()=>sb.from('control_finiquitos_transferencia').select('*').eq('obra_id',id))
  ]);
  if(OBRA.id!==id)return false;
  if(e1||e2||e3||e4||e5||[tw,ds,df,ab,ft].some(x=>!Array.isArray(x))){
    const error=e1||e2||e3||e4||e5||{message:'Respuesta incompleta de nómina'};
    if($('py-prev'))$('py-prev').innerHTML='<div class="fhint" style="color:var(--red)">No se pudieron actualizar los datos de la proyección. Cierra y vuelve a abrir esta ventana antes de exportar.</div>';
    if($('py-btn'))$('py-btn').disabled=true;
    if($('py-ambas'))$('py-ambas').disabled=true;
    toast('No se generó la proyección con datos obsoletos: '+error.message,'err');
    return false;
  }
  try{
    const historicos=await proyCargarHistoricos(tw||[]);
    if(OBRA.id!==id)return false;
    globalThis._PY_FINIQUITOS_HISTORICOS=historicos;
  }catch(e){
    if($('py-prev'))$('py-prev').innerHTML='<div class="fhint" style="color:var(--red)">No se pudieron consultar los finiquitos históricos. Vuelve a abrir la proyección.</div>';
    for(const bid of ['py-btn','py-ambas'])if($(bid))$(bid).disabled=true;
    toast(e.message,'err');return false;
  }
  WORKERS=tw||[];DESC=ds||[];DIFS=df||[];ALTAS_CORTAS=ab||[];FINTRANS=ft||[];
  globalThis._PY_FRESCOS=true;
  if($('py-prev'))pyPreview();
  return true;
}
function openProyeccion(){
  const [d1,d2]=weekBounds();
  modal(`
    <div class="m-head"><h2>💰 Proyección de nómina</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:14px">Obra: <b>${esc(OBRA.nombre)}</b>. Incluye activos y bajas de la semana. Los finiquitos son por cheque salvo excepción de transferencia autorizada por el administrador. En dispersión, la nómina sin cuenta ni CLABE aparece al final con método POR DEFINIR. La proyección para contratistas conserva únicamente el total general. Los totales del Excel llevan fórmulas.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr">
        <div><label>No. de semana</label><input id="py-sem" type="number" value="${semObra()}" oninput="semSincroniza('py-sem','py-d1','py-d2',pyPreview)"></div>
        <div><label>Del día</label><input id="py-d1" type="date" value="${d1}" oninput="pyPreview()"></div>
        <div><label>Al día</label><input id="py-d2" type="date" value="${d2}" oninput="pyPreview()"></div>
        <div><label>Periodo</label><select id="py-periodo" onchange="pyPreview()">
          <option value="SEMANAL">Solo semanales</option><option value="QUINCENAL">Solo quincenales</option><option value="TODOS">Todos</option>
        </select></div>
      </div>
      <div id="py-prev" style="margin-top:14px">Actualizando trabajadores y retenciones...</div>
      ${proySelector('py-destino')}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="openProyContratista()">👷 Por contratista</button>
      <button class="btn" onclick="openDiferenciales()" title="Monto extra por trabajador para esta semana (opcional)">➕ Agregar diferencial</button>
      <button class="btn dark" id="py-btn" onclick="exportProyeccion()" disabled>⬇ Generar Excel</button>
      <button class="btn" id="py-ambas" onclick="exportProyeccion('AMBAS')" disabled>Generar ambas</button>
    </div>`,'md');
  pyDatosFrescos();
}
async function pyPreview(){
  const version=(window._PY_PREVIEW_VERSION||0)+1;window._PY_PREVIEW_VERSION=version;
  if(!$('py-prev'))return;
  for(const id of ['py-btn','py-ambas'])if($(id))$(id).disabled=true;
  if(globalThis._PY_FRESCOS===false)return;
  const sem='S'+($('py-sem').value||semObra()),destino=$('py-destino')?.value||'DISPERSION';
  let {act,fins}=pyCandidatos($('py-d1').value,$('py-d2').value,$('py-periodo').value);
  try{
    const versiones=window.PLATINUM_FLOWS?await window.PLATINUM_FLOWS.obtenerVersiones([OBRA.id],sem):null;
    if(versiones)({act,fins}=window.PLATINUM_FLOWS.filtrarAbiertos(act,fins,versiones));
    const audits=await proyLeerFiniquitos(fins);
    if(version!==window._PY_PREVIEW_VERSION||!$('py-prev'))return;
    let m=proyModelo(act,fins,sem,audits);
    if(window.__PLATINUM_REQUIERE_FLUJO&&!window.PLATINUM_FLOWS)throw Error('El módulo de coordinación no cargó. Recarga la plataforma.');
    if(window.PLATINUM_FLOWS)m=await window.PLATINUM_FLOWS.versionarModelo(m,{obras:[OBRA.id],sem,periodo:$('py-periodo').value,desde:$('py-d1').value,hasta:$('py-d2').value,versiones});
    if(version!==window._PY_PREVIEW_VERSION||!$('py-prev'))return;
    const inc=m.filas.reduce((s,x)=>s+x.incidencias,0),creditos=m.filas.reduce((s,x)=>s+x.creditos,0);
    $('py-prev').innerHTML=`<div style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="stat g" style="flex:1"><div class="n">${m.filas.length}</div><div class="l">Trabajadores · incluye ${fins.length} finiquitos</div></div>
      <div class="stat a" style="flex:1"><div class="n">$${money(inc)}</div><div class="l">Descuentos por incidencias</div></div>
      <div class="stat b" style="flex:1"><div class="n">$${money(creditos)}</div><div class="l">Créditos · no reducen importe del contratista</div></div>
      <div class="stat b" style="flex:1"><div class="n">$${money(destino==='CONTRATISTA'?m.costo:m.neto)}</div><div class="l">${destino==='CONTRATISTA'?'Total para contratista · sin previsión social':'Total para dispersión · incluye previsión social aparte'}</div></div>
    </div>`;
    for(const id of ['py-btn','py-ambas'])if($(id))$(id).disabled=window._PROY_EXPORTANDO||!m.filas.length;
  }catch(e){
    if(version!==window._PY_PREVIEW_VERSION||!$('py-prev'))return;
    $('py-prev').innerHTML=`<div class="fhint" style="color:var(--red)">${esc(e.message)}</div>`;
  }
}
/* ---------- v12: núcleo compartido de proyección (con fórmulas vivas) ---------- */
/* Dos presentaciones de la MISMA instantánea. No recalculan salario, ISR,
   incidencias ni créditos: usan los importes que ya guarda el motor. */
function proySelector(id){
  return `<div class="sect" style="margin-top:14px">Destino de la proyección</div>
    <select id="${id}" onchange="${id==='py-destino'?'pyPreview()':''}">
      <option value="CONTRATISTA">Para presentar al contratista</option>
      <option value="DISPERSION" selected>Para dispersión de nómina</option>
    </select>
    <div class="fhint">Contratista: sueldo menos incidencias, créditos informativos en amarillo (INFONAVIT) y verde (FONACOT), y un solo total general; sin previsión social. Dispersión: neto a pagar y totales por forma de pago. Ambas incluyen el detalle de retenciones en su segunda hoja.</div>`;
}
function proyRetenciones(w,sem){
  const P=perDe(w), d=descuentosDe(w,sem);
  return d.ds.map(x=>{
    const ev=x.recurrente?retencionEvaluada(x,w,sem,P):{monto:Number(x.monto)||0,estado:'NORMAL',extra:0};
    const tipo=String(x.tipo||'').toUpperCase();
    const clase=['INFONAVIT','FONACOT'].includes(tipo)?'CREDITO':['FALTA','INCIDENCIA'].includes(tipo)?'INCIDENCIA':'OTRA';
    return {w,tipo,clase,monto:redondearCentavos(ev.monto),estado:ev.estado,
      motivo:(x.motivo||tipo)+(ev.extra?` · Días extra: $${money(ev.extra)}`:''),origen:x.recurrente?'CRÉDITO / AJUSTE SEMANAL':'INCIDENCIA GUARDADA'};
  });
}
async function proyLeerFiniquitos(fins){
  if(!fins.length)return [];
  const out=[];
  // Consulta filtrada y paginada. No trae toda la bitácora ni calcula un
  // crédito semanal para un finiquito cuyo proporcional ya fue aplicado.
  for(let i=0;i<fins.length;i+=100){
    const {data,error}=await fetchAllRows(()=>sb.from('auditoria_calculos_nomina')
      .select('id,obra_id,trabajador_id,periodo,resultado,monto_aplicado,created_at')
      .in('trabajador_id',fins.slice(i,i+100).map(w=>w.id)).eq('tipo_calculo','FINIQUITO_APLICADO').order('created_at',{ascending:false}));
    if(error)throw Error('No se pudo consultar el desglose de finiquitos: '+error.message);
    out.push(...(data||[]));
    const hr=await fetchAllRows(()=>sb.from('historial')
      .select('id,obra_id,trabajador_id,datos_despues,fecha')
      .in('trabajador_id',fins.slice(i,i+100).map(w=>w.id)).eq('accion','AJUSTE_FINIQUITO_NOI')
      .order('fecha',{ascending:false}));
    if(hr.error)throw Error('No se pudieron consultar los ajustes de finiquitos NOI: '+hr.error.message);
    for(const h of hr.data||[]){
      const r=h.datos_despues||{};
      if(r.version!=='AJUSTE_NOI_CONCEPTOS_V1'||!r.periodo||!r.resultado||r.monto_aplicado==null)continue;
      out.push({id:'hist-'+h.id,obra_id:h.obra_id,trabajador_id:h.trabajador_id,
        periodo:r.periodo,monto_aplicado:r.monto_aplicado,resultado:r.resultado,created_at:h.fecha});
    }
  }
  return out.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.id||'').localeCompare(String(a.id||'')));
}
function proyFiniquito(w,audits){
  const neto=redondearCentavos(Number(w.monto_finiquito)||0);
  const a=audits.find(x=>x.trabajador_id===w.id&&x.obra_id===w.obra_id&&x.periodo===w.fecha_baja&&
    x.monto_aplicado!=null&&redondearCentavos(Number(x.monto_aplicado))===neto);
  const creditos=DESC.filter(d=>d.trabajador_id===w.id&&['INFONAVIT','FONACOT'].includes(String(d.tipo||'').toUpperCase()));
  const r=a&&a.resultado||{}, items=[];
  for(const tipo of ['INFONAVIT','FONACOT']){
    const key=tipo.toLowerCase(), valor=r[key];
    if(valor==null&&creditos.some(d=>String(d.tipo||'').toUpperCase()===tipo)){
      throw Error(`Falta el desglose ${tipo} del finiquito #${w.no_trab} (${fullName(w)}). No se estimará ni duplicará una retención: valida y guarda el desglose del finiquito antes de exportarlo.`);
    }
    const monto=valor==null?0:Number(valor);
    if(!Number.isFinite(monto)||monto<0)throw Error(`Retención ${tipo} inválida en el finiquito #${w.no_trab}.`);
    if(monto>0)items.push({w,tipo,clase:'CREDITO',monto:redondearCentavos(monto),estado:'APLICADO',
      motivo:'Proporcional retenido en el finiquito registrado',origen:'FINIQUITO APLICADO'});
  }
  const credito=redondearCentavos(items.reduce((s,x)=>s+x.monto,0));
  return {w,fin:true,sueldo:redondearCentavos(neto+credito),incidencias:0,creditos:credito,otras:0,prevision:0,
    costo:redondearCentavos(neto+credito),neto,items,fuente:a?'FINIQUITO APLICADO':'NETO GUARDADO SIN CRÉDITO',
    pago:'CHEQUE'};
}
function proyModelo(act,fins,sem,audits=[]){
  const suma=xs=>redondearCentavos(xs.reduce((s,x)=>s+x.monto,0));
  const normales=act.map(w=>{
    const items=proyRetenciones(w,sem), sueldo=redondearCentavos(Number(w.sal_semanal)||0);
    const incidencias=suma(items.filter(x=>x.clase==='INCIDENCIA')),creditos=suma(items.filter(x=>x.clase==='CREDITO')),
      otras=suma(items.filter(x=>x.clase==='OTRA')),prevision=redondearCentavos(difDe(w.id,sem));
    const tieneCuenta=String(w.cuenta||'').toUpperCase()!=='CREAR'&&String(w.cuenta||'').replace(/\D/g,'').length>=6||String(w.clabe||'').replace(/\D/g,'').length>=10;
    return {w,fin:false,sueldo,incidencias,creditos,otras,prevision,
      costo:redondearCentavos(Math.max(0,sueldo-incidencias)),
      neto:redondearCentavos(Math.max(0,sueldo+prevision-incidencias-creditos-otras)),items,
      pago:!tieneCuenta?'POR DEFINIR':(w.forma_pago||'TRANSFERENCIA')==='TRANSFERENCIA'?'TRANSFERENCIA':'CHEQUE',sinCuenta:!tieneCuenta};
  });
  const bajas=fins.map(w=>({...proyFiniquito(w,audits),pago:finTransDe(w,sem)?'TRANSFERENCIA':'CHEQUE'}));
  const filas=[...normales,...bajas];
  return {filas,items:filas.flatMap(x=>x.items),act,fins,sem,
    costo:redondearCentavos(filas.reduce((s,x)=>s+x.costo,0)),neto:redondearCentavos(filas.reduce((s,x)=>s+x.neto,0))};
}
/* Dispersión compacta: el motor sigue siendo la única fuente de los importes.
   Las deducciones se consultan en RETENCIONES, no se vuelven a descontar aquí. */
function proyTransferenciaOtroBanco(w){
  const banco=String(w.banco||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const clabe=String(w.clabe||'').replace(/\D/g,'');
  if(/^\d{18}$/.test(clabe))return clabe.slice(0,3)!=='012';
  if(/BBVA|BANCOMER/.test(banco)||/^0?12$/.test(banco))return false;
  return !!banco&&!/^(?:—|-|N\/A|SIN BANCO|SIN ASIGNAR|POR DEFINIR|PENDIENTE|CREAR)$/.test(banco);
}
function buildProyDispersionWS({titulo,sub,pie,colB,modelo}){
  const cols=['NO.',colB==='OBRA'?'OBRA':'CONTRATISTA','NOMBRE COMPLETO','CLABE','CUENTA','BANCO','NETO A PAGAR','FORMA DE PAGO'];
  const rows=[[titulo],[sub],cols],styles=[{...ST.title,font:{...ST.title.font,sz:12},alignment:{...ST.title.alignment,wrapText:true}},ST.sub,ST.head];
  const hs=[{hpt:42},{hpt:24},{hpt:44}],merges=[],dataRows=[],fx=[];
  const bVal=w=>colB==='OBRA'?(OBRAS.find(o=>o.id===w.obra_id)?.nombre||''):w.contratista||'';
  const orden=(a,b)=>(colB==='OBRA'?String(bVal(a.w)).localeCompare(String(bVal(b.w)),'es'):0)
    ||(Number(a.w.no_trab)||0)-(Number(b.w.no_trab)||0);
  const suma=rs=>{
    if(!rs.length)return '0';
    const bloques=[];let a=rs[0],b=a;
    for(const r of rs.slice(1)){if(r===b+1)b=r;else{bloques.push(`G${a}:G${b}`);a=b=r;}}
    bloques.push(`G${a}:G${b}`);return `SUM(${bloques.join(',')})`;
  };
  const secciones=[
    ['NÓMINA POR TRANSFERENCIA',x=>!x.fin&&!x.sinCuenta&&x.pago==='TRANSFERENCIA'],
    ['FINIQUITOS POR TRANSFERENCIA',x=>x.fin&&x.pago==='TRANSFERENCIA'],
    ['NÓMINA POR CHEQUE',x=>!x.fin&&!x.sinCuenta&&x.pago==='CHEQUE'],
    ['FINIQUITOS POR CHEQUE',x=>x.fin&&x.pago==='CHEQUE'],
    ['NÓMINA SIN CUENTA · POR DEFINIR',x=>!x.fin&&x.sinCuenta]
  ];
  for(const [nombre,elegir] of secciones){
    const grupo=modelo.filas.filter(elegir).sort(orden);if(!grupo.length)continue;
    merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:7}});
    rows.push([`${nombre} · ${grupo.length} trabajadores`]);
    styles.push({...ST.sect,font:{...ST.sect.font,color:{rgb:'000000'}},
      fill:{patternType:'solid',fgColor:{rgb:nombre==='NÓMINA POR TRANSFERENCIA'?'D8E4BC':'FFF3D6'}}});hs.push({hpt:22});
    const rs=[];
    for(const x of grupo){
      if(!Number.isFinite(x.neto))throw Error(`Neto inválido para el trabajador #${x.w.no_trab}. Revisa su cálculo antes de exportar.`);
      const w=x.w,clabe=String(w.clabe||'').replace(/\D/g,''),cuenta=String(w.cuenta||'').trim();
      rows.push([w.no_trab??'',bVal(w),fullName(w),clabe.length>=10?'/'+clabe:'—',
        cuenta.toUpperCase()!=='CREAR'&&cuenta.replace(/\D/g,'').length>=6?cuenta:'—',w.banco||'—',x.neto,x.pago]);
      dataRows.push(rows.length);rs.push(rows.length);
      const otroBanco=x.pago==='TRANSFERENCIA'&&proyTransferenciaOtroBanco(w);
      styles.push(cols.map((_,i)=>{
        const st=i===6?(x.fin?ST.finMoney:ST.money):x.fin?ST.fin:i===0?ST.cellC:ST.cell;
        return {...st,alignment:{...st.alignment,...(i===0?{horizontal:'center'}:i!==6?{wrapText:true}:{})},
          fill:otroBanco?{patternType:'solid',fgColor:{rgb:'FFFF00'}}:st.fill||{patternType:'solid',fgColor:{rgb:'FFFFFF'}}};
      }));hs.push({hpt:28});
    }
    rows.push([`SUBTOTAL ${nombre}`,'','','','','',redondearCentavos(grupo.reduce((s,x)=>s+x.neto,0)),'']);
    styles.push(cols.map((_,i)=>i===6?ST.totalMoney:ST.total));hs.push({hpt:28});
    merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:5}});fx.push(['G'+rows.length,suma(rs)]);
  }
  if(dataRows.length!==modelo.filas.length)throw Error('Hay trabajadores con método de pago sin clasificar. No se generó una dispersión incompleta.');
  rows.push([`TOTAL · ${modelo.filas.length} TRABAJADORES`,'','','','','',modelo.neto,'']);
  styles.push(cols.map((_,i)=>i===6?ST.totalMoney:ST.total));hs.push({hpt:28});
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:5}});fx.push(['G'+rows.length,suma(dataRows)]);
  rows.push([pie]);styles.push(ST.sub);hs.push({hpt:22});
  merges.push({s:{r:0,c:0},e:{r:0,c:6}},{s:{r:1,c:0},e:{r:1,c:7}},
    {s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:7}});
  const ws=buildSheet(rows,styles,[8,20,38,24,17,12,18,18],merges,hs);
  ws.H1={t:'s',v:'',s:ST.title};
  for(const r of dataRows)for(const col of ['D','E']){
    const cell=ws[col+r];cell.t='s';cell.v=String(cell.v??'');cell.z='@';cell.s={...cell.s,numFmt:'@'};
  }
  for(const [a,f] of fx){ws[a].t='n';ws[a].f=f;}
  return ws;
}
/* Presentación del contratista: G conserva el costo después de incidencias.
   H e I son desgloses informativos; los créditos no se restan de ese costo.
   No utiliza la previsión social ni vuelve a ejecutar el motor de nómina. */
function proyColorCredito(items){
  const tipos=new Set((items||[]).filter(x=>Number(x.monto)>0).map(x=>String(x.tipo||'').toUpperCase()));
  const inf=tipos.has('INFONAVIT'),fon=tipos.has('FONACOT');
  if(inf&&fon)return {patternType:'darkDown',fgColor:{rgb:'FFFF00'},bgColor:{rgb:'92D050'}};
  return inf||fon?{patternType:'solid',fgColor:{rgb:inf?'FFFF00':'92D050'}}:null;
}
function buildProyContratistaWS({titulo,sub,pie,colB,modelo}){
  const cols=['NO.',colB==='OBRA'?'OBRA':'CONTRATISTA','NOMBRE COMPLETO','CLABE','CUENTA','BANCO',
    'SUELDO REGISTRADO / FINIQUITO','RETENCIÓN POR INCIDENCIAS','RETENCIÓN INFONAVIT / FONACOT','FORMA DE PAGO'];
  const rows=[[titulo],[sub],cols],styles=[{...ST.title,font:{...ST.title.font,sz:12},alignment:{...ST.title.alignment,wrapText:true}},ST.sub,ST.head];
  const hs=[{hpt:42},{hpt:24},{hpt:44}],merges=[],dataRows=[];
  const bVal=w=>colB==='OBRA'?(OBRAS.find(o=>o.id===w.obra_id)?.nombre||''):w.contratista||'';
  const orden=(a,b)=>(colB==='OBRA'?String(bVal(a.w)).localeCompare(String(bVal(b.w)),'es'):0)
    ||(Number(a.w.no_trab)||0)-(Number(b.w.no_trab)||0);
  const secciones=[
    ['NÓMINA POR TRANSFERENCIA',x=>!x.fin&&!x.sinCuenta&&x.pago==='TRANSFERENCIA','C4D79B'],
    ['FINIQUITOS POR TRANSFERENCIA',x=>x.fin&&x.pago==='TRANSFERENCIA','FFF3D6'],
    ['NÓMINA POR CHEQUE',x=>!x.fin&&!x.sinCuenta&&x.pago==='CHEQUE','FFF3D6'],
    ['FINIQUITOS POR CHEQUE',x=>x.fin&&x.pago==='CHEQUE','FFF3D6'],
    ['NÓMINA SIN CUENTA · POR DEFINIR',x=>!x.fin&&x.sinCuenta,'CCC0DA']
  ];
  const itemsPorTrabajador=new Map();
  for(const item of modelo.items||[]){
    const clave=String(item.w.obra_id)+'|'+String(item.w.id);
    if(!itemsPorTrabajador.has(clave))itemsPorTrabajador.set(clave,[]);
    itemsPorTrabajador.get(clave).push(item);
  }
  for(const [nombre,elegir,color] of secciones){
    const grupo=modelo.filas.filter(elegir).sort(orden);if(!grupo.length)continue;
    merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:9}});
    rows.push([`${nombre} · ${grupo.length} trabajadores`]);
    styles.push({...ST.sect,font:{...ST.sect.font,color:{rgb:'000000'}},fill:{patternType:'solid',fgColor:{rgb:color}}});hs.push({hpt:22});
    for(const x of grupo){
      if(['sueldo','incidencias','creditos','costo'].some(k=>!Number.isFinite(x[k])||x[k]<0))
        throw Error(`Importe inválido para el trabajador #${x.w.no_trab}. Revisa su cálculo antes de exportar.`);
      const w=x.w,clabe=String(w.clabe||'').replace(/\D/g,''),cuenta=String(w.cuenta||'').trim();
      rows.push([w.no_trab??'',bVal(w),fullName(w),clabe.length>=10?'/'+clabe:'—',
        cuenta.toUpperCase()!=='CREAR'&&cuenta.replace(/\D/g,'').length>=6?cuenta:'—',w.banco||'—',
        x.costo,x.incidencias,x.creditos,x.sinCuenta&&!x.fin?'POR DEFINIR':x.pago]);
      dataRows.push(rows.length);
      const colorCredito=proyColorCredito(itemsPorTrabajador.get(String(w.obra_id)+'|'+String(w.id))||x.items);
      styles.push(cols.map((_,i)=>{
        const st=i>=6&&i<=8?(x.fin?ST.finMoney:ST.money):x.fin?ST.fin:i===0?ST.cellC:ST.cell;
        return {...st,alignment:{...st.alignment,...(i===0?{horizontal:'center'}:i<6||i===9?{wrapText:true}:{})},
          fill:i===8&&colorCredito?colorCredito:st.fill||{patternType:'solid',fgColor:{rgb:'FFFFFF'}}};
      }));hs.push({hpt:28});
    }
  }
  if(dataRows.length!==modelo.filas.length)throw Error('Hay trabajadores con método de pago sin clasificar. No se generó una proyección incompleta.');
  const suma=col=>{
    if(!dataRows.length)return '0';
    const rangos=[];let a=dataRows[0],b=a;
    for(const r of dataRows.slice(1)){if(r===b+1)b=r;else{rangos.push(`${col}${a}:${col}${b}`);a=b=r;}}
    rangos.push(`${col}${a}:${col}${b}`);return `SUM(${rangos.join(',')})`;
  };
  const total=rows.length+1;
  rows.push([`TOTAL · ${modelo.filas.length} TRABAJADORES`,'','','','','',modelo.costo,
    redondearCentavos(modelo.filas.reduce((s,x)=>s+x.incidencias,0)),redondearCentavos(modelo.filas.reduce((s,x)=>s+x.creditos,0)),'']);
  styles.push(cols.map((_,i)=>i>=6&&i<=8?ST.totalMoney:ST.total));hs.push({hpt:28});
  // Un solo total general. La etiqueta no invade las columnas de importes.
  merges.push({s:{r:total-1,c:0},e:{r:total-1,c:5}});
  rows.push([pie]);styles.push(ST.sub);hs.push({hpt:22});
  merges.push({s:{r:0,c:0},e:{r:0,c:8}},{s:{r:1,c:0},e:{r:1,c:9}},
    {s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:9}});
  const ws=buildSheet(rows,styles,[8,20,38,24,17,12,20,18,20,18],merges,hs);
  ws.J1={t:'s',v:'',s:ST.title};
  for(const r of dataRows)for(const col of ['D','E']){
    const cell=ws[col+r];cell.t='s';cell.v=String(cell.v??'');cell.z='@';cell.s={...cell.s,numFmt:'@'};
  }
  for(const col of ['G','H','I']){ws[col+total].t='n';ws[col+total].f=suma(col);}
  return ws;
}
function buildProyDestinoWS({titulo,sub,pie,colB,modelo,destino}){
  if(destino==='DISPERSION')return buildProyDispersionWS({titulo,sub,pie,colB,modelo});
  if(destino==='CONTRATISTA')return buildProyContratistaWS({titulo,sub,pie,colB,modelo});
  throw Error('Selecciona el destino de la proyección antes de exportar.');
}
function buildProyRetencionesWS(modelo,colB,destino){
  const rows=[[`DETALLE DE RETENCIONES · ${modelo.sem}`],['NO.','NOMBRE COMPLETO',colB==='OBRA'?'OBRA':'CONTRATISTA','TIPO','CONCEPTO','ESTADO','MONTO RETENIDO','MOTIVO']],styles=[ST.title,ST.head];
  const items=modelo.items.slice().sort((a,b)=>(Number(a.w.no_trab)||0)-(Number(b.w.no_trab)||0)||String(a.tipo).localeCompare(String(b.tipo)));
  for(const x of items){rows.push([x.w.no_trab??'',fullName(x.w),colB==='OBRA'?(OBRAS.find(o=>o.id===x.w.obra_id)?.nombre||''):x.w.contratista||'',x.tipo,x.origen,x.estado,x.monto,x.motivo]);styles.push([ST.cellC,ST.cell,ST.cell,ST.cell,ST.cell,ST.cellC,ST.money,ST.cell].map((st,i)=>({...st,alignment:{...st.alignment,...([1,2,4,7].includes(i)?{wrapText:true}:{})},fill:{patternType:'solid',fgColor:{rgb:'FFFFFF'}}})));}
  if(!items.length){rows.push(['Sin retenciones registradas en el personal seleccionado.']);styles.push(ST.sub);}
  const t=rows.length+1;rows.push(['TOTAL RETENCIONES','','','','','',redondearCentavos(items.reduce((s,x)=>s+x.monto,0)),'']);styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total]);
  const ws=buildSheet(rows,styles,[8,38,23,16,27,17,18,54],[{s:{r:0,c:0},e:{r:0,c:6}}],[{hpt:32},{hpt:34},...items.map(x=>({hpt:Math.max(34,Math.ceil(String(x.motivo).length/50)*14)}))]);
  ws.H1={t:'s',v:'',s:ST.title};
  if(destino==='CONTRATISTA')items.forEach((x,i)=>{
    const fill=proyColorCredito([x]);if(fill)ws['D'+(i+3)].s={...ws['D'+(i+3)].s,fill};
  });
  if(ws['G'+t]){ws['G'+t].t='n';ws['G'+t].f=items.length?`SUM(G3:G${2+items.length})`:'0';}
  return ws;
}
function proyLibro(modelo,destino,meta){
  const wb=XLSX.utils.book_new(),label=destino==='CONTRATISTA'?'PARA CONTRATISTA':'PARA DISPERSIÓN';
  wb.__retencionesContratista=destino==='CONTRATISTA';
  XLSX.utils.book_append_sheet(wb,buildProyDestinoWS({...meta,modelo,destino,titulo:meta.titulo+' · '+label}),`SEMANA ${String(modelo.sem).replace('S','')}`);
  XLSX.utils.book_append_sheet(wb,buildProyRetencionesWS(modelo,meta.colB,destino),'RETENCIONES');
  wb.__empresaPorHoja={};wb.SheetNames.forEach(n=>wb.__empresaPorHoja[n]=meta.codigo);wb.__auditObraIds=[...new Set(modelo.filas.map(x=>x.w.obra_id))];
  return wb;
}
function proyAuditoria(modelo,destinos){
  return modelo.filas.map(x=>({obra_id:x.w.obra_id,empresa_codigo:empresaDeTrabajador(x.w),trabajador_id:x.w.id,trabajador_numero:x.w.no_trab,trabajador_nombre:fullName(x.w),
    tipo_calculo:x.fin?'FINIQUITO_EN_PROYECCION':'PROYECCION_NOMINA',periodo:modelo.sem,
    entradas:{destinos,sueldo_registrado:x.sueldo,incidencias:x.incidencias,creditos:x.creditos,otras:x.otras,prevision_social:x.prevision,fuente_finiquito:x.fuente||null},
    resultado:{importe_contratista:x.costo,neto:x.neto,forma_pago:x.pago},monto_modelo:x.neto,monto_aplicado:x.neto,ajuste_noi:0}));
}
function buildProyWS({titulo,sub,pie,act,fins,sem,colB}){
  /* MONTO TOTAL = SUELDO NÓMINA + PREVISIÓN SOCIAL − RETENCIONES.
     El diferencial se muestra separado como PREVISIÓN SOCIAL para que Excel
     no lo oculte dentro del monto y contabilidad pueda conciliar ambos pagos. */
  const mostrarPrevision=act.some(w=>difDe(w.id,sem)!==0);
  const dsInfo=w=>{const d=descuentosDe(w,sem), dif=difDe(w.id,sem);
    return {ret:d.total, dif, neto:redondearCentavos(Math.max(0,(Number(w.sal_semanal)||0)+dif-d.total))};};
  const empCodigo=w=>typeof empresaDeTrabajador==='function'?empresaDeTrabajador(w):'PLATINUM';
  // v12.1: SOLO cuentan datos reales — cuenta con 6+ dígitos, CLABE con 10+ dígitos.
  const digitos=v=>String(v??'').replace(/\D/g,'');
  const ctaOk=w=>{const c=String(w.cuenta??'').trim();return (c&&c.toUpperCase()!=='CREAR'&&digitos(c).length>=6)?c:'';};
  const clOk=w=>{const c=String(w.clabe??'').trim();return digitos(c).length>=10?c:'';};
  const tieneCta=w=>!!(ctaOk(w)||clOk(w));
  const oIdx=id=>{const i=OBRAS.findIndex(o=>o.id===id);return i<0?99:i;};
  const bVal=w=>{if(colB!=='OBRA')return w.contratista;const o=OBRAS.find(x=>x.id===w.obra_id);return o?o.nombre.replace(/^OBRA /,''):'';};
  const cmp=(a,b)=>colB==='OBRA'?(oIdx(a.obra_id)-oIdx(b.obra_id)||((a.no_trab||9e9)-(b.no_trab||9e9))):((a.no_trab||9e9)-(b.no_trab||9e9));
  const transf=act.filter(w=>tieneCta(w)&&(w.forma_pago||'TRANSFERENCIA')==='TRANSFERENCIA').sort(cmp);
  const chqAct=act.filter(w=>tieneCta(w)&&w.forma_pago==='CHEQUE');
  const sinCta=act.filter(w=>!tieneCta(w)).sort(cmp);
  // dif viaja en cada renglón y tiene su propia columna en el Excel.
  const finTrans=fins.filter(w=>!!finTransDe(w,sem)).sort(cmp);
  const chequeRows=[...fins.filter(w=>!finTransDe(w,sem)).map(w=>({w,ret:0,dif:0,imp:Number(w.monto_finiquito)||0,fin:true})),...chqAct.map(w=>{const x=dsInfo(w);return {w,ret:x.ret,dif:x.dif,imp:x.neto,fin:false};})].sort((a,b)=>cmp(a.w,b.w));
  const rows=[],styles=[],hs=[],secRows=[],fx=[];
  rows.push([titulo]); styles.push(ST.title); hs.push({hpt:26});
  rows.push([sub]); styles.push(ST.sub); hs.push({hpt:18});
  rows.push(['NO. DE\nTRABAJADOR',colB==='OBRA'?'OBRA':'CONTRATISTA','NOMBRE COMPLETO','CLABE INTERBANCARIA','CUENTA','BANCO','SUELDO NÓMINA\n/ FINIQUITO','PREVISIÓN\nSOCIAL','RETENCIÓN\n(CRÉDITOS/FALTAS)','MONTO\nTOTAL','FORMA DE PAGO']); styles.push(ST.head); hs.push({hpt:32});
  const rowSt=[ST.cellC,ST.cellC,ST.cell,ST.cell,ST.cellC,ST.cellC,ST.money,ST.money,ST.money,ST.money,ST.cellC];
  const finSt=[ST.fin,ST.fin,ST.fin,ST.fin,ST.fin,ST.fin,ST.finMoney,ST.finMoney,ST.finMoney,ST.finMoney,ST.fin];
  const penSt=rowSt.map(x=>({...x,fill:{fgColor:{rgb:'FFF3D6'}}}));
  let tT=0,tC=0,tP=0,tR=0,tNom=0,tDif=0,trRange=null,finRange=null,chRange=null,pendRange=null;
  const xr=()=>rows.length+1;
  secRows.push(rows.length);
  rows.push([`◆  TRANSFERENCIA BANCARIA  —  ${transf.length} trabajadores`]); styles.push(ST.sect2); hs.push({hpt:18});
  if(transf.length){const a=xr();
    transf.forEach(w=>{const x=dsInfo(w), sueldo=Number(w.sal_semanal)||0;tT+=x.neto;tR+=x.ret;tNom+=sueldo;tDif+=x.dif;
      const r=xr();
      rows.push([w.no_trab??'',bVal(w),fullName(w),clOk(w)?'/'+clOk(w):'—',ctaOk(w)||'—',w.banco||'BBVA',sueldo,x.dif||'',x.ret||'',x.neto,'TRANSFERENCIA']);
      fx.push({r});
      styles.push(rowSt);hs.push(null);});
    trRange=[a,xr()-1];}
  if(finTrans.length){
    secRows.push(rows.length);
    rows.push([`◆  FINIQUITOS POR TRANSFERENCIA  —  ${finTrans.length} trabajadores`]);styles.push(ST.sect2);hs.push({hpt:18});
    const a=xr();
    finTrans.forEach(w=>{const imp=Number(w.monto_finiquito)||0;tT+=imp;tNom+=imp;
      rows.push([w.no_trab??'',bVal(w),fullName(w),clOk(w)?'/'+clOk(w):'—',ctaOk(w)||'—',w.banco||'—',imp,'','',imp,'TRANSFERENCIA']);
      styles.push(finSt);hs.push(null);
    });
    finRange=[a,xr()-1];
  }
  if(chequeRows.length){
    secRows.push(rows.length);
    rows.push([`◆  CHEQUE / FINIQUITO  —  ${chequeRows.length} trabajadores`]); styles.push({...ST.sect,fill:{fgColor:{rgb:'FCE4D6'}},font:{bold:true,sz:10.5,color:{rgb:'B3261E'},name:'Calibri'}}); hs.push({hpt:18});
    const a=xr();
    chequeRows.forEach(x=>{const sueldo=x.fin?x.imp:(Number(x.w.sal_semanal)||0);tC+=x.imp;tR+=x.ret;tNom+=sueldo;tDif+=x.dif||0;
      const r=xr();
      rows.push([x.w.no_trab??'',bVal(x.w),fullName(x.w),clOk(x.w)?'/'+clOk(x.w):'—',ctaOk(x.w)||'—',x.w.banco||'—',sueldo,x.dif||'',x.ret||'',x.imp||'','CHEQUE']);
      if(!x.fin)fx.push({r});
      styles.push(finSt);hs.push(null);});
    chRange=[a,xr()-1];}
  if(sinCta.length){
    secRows.push(rows.length);
    rows.push([`◆  SIN CUENTA NI CLABE — PENDIENTE  —  ${sinCta.length} trabajadores  (PAGO CON CHEQUE)`]); styles.push(ST.sect); hs.push({hpt:18});
    const a=xr();
    sinCta.forEach(w=>{const x=dsInfo(w), sueldo=Number(w.sal_semanal)||0;tP+=x.neto;tR+=x.ret;tNom+=sueldo;tDif+=x.dif;
      const r=xr();
      rows.push([w.no_trab??'',bVal(w),fullName(w),'—','—',w.banco||'—',sueldo,x.dif||'',x.ret||'',x.neto,'CHEQUE']);
      fx.push({r});
      styles.push(penSt);hs.push(null);});
    pendRange=[a,xr()-1];}
  tT=redondearCentavos(tT);tC=redondearCentavos(tC);tP=redondearCentavos(tP);
  tR=redondearCentavos(tR);tNom=redondearCentavos(tNom);tDif=redondearCentavos(tDif);
  const total=redondearCentavos(tT+tC+tP), nTot=transf.length+finTrans.length+chequeRows.length+sinCta.length;
  const firstData=5, lastData=rows.length, rTot=rows.length+1, rT2=rows.length+2, rT3=rows.length+3;
  rows.push([`TOTAL TRABAJADORES: ${nTot}`,'',`Transf. ${transf.length+finTrans.length}  |  Cheque ${chequeRows.length}  |  Pendientes ${sinCta.length} (pagan con cheque)`,'','','',tNom,tDif,tR,total,'']);
  styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.totalMoney,ST.totalMoney,ST.totalMoney,ST.total]); hs.push({hpt:20});
  rows.push(['TOTAL TRANSFERENCIA:','',tT,'TOTAL CHEQUE (INCLUYE PENDIENTES):','',Math.round((tC+tP)*100)/100,'TOTAL RETENCIONES:','',tR,'','']);
  styles.push([ST.total,ST.total,ST.totalMoney,ST.total,ST.total,ST.totalMoney,ST.total,ST.total,ST.totalMoney,ST.total,ST.total]); hs.push({hpt:20});
  rows.push(['TOTAL GENERAL A DISPERSAR:','','','','','','','','',total,'']);
  styles.push([{...ST.total,alignment:{horizontal:'right',vertical:'center'}},ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total]); hs.push({hpt:22});
  rows.push([pie]); styles.push(ST.sub); hs.push({hpt:15});
  const widths=[11,13,34,23,15,11,15,15,14,15,15];
  if(!mostrarPrevision){
    rows.forEach(row=>row.splice(7,1));
    styles.forEach((st,i)=>{if(Array.isArray(st))styles[i]=st.filter((_,c)=>c!==7);});
    widths.splice(7,1);
  }
  const lastCol=mostrarPrevision?10:9, retCol=mostrarPrevision?'I':'H', totalCol=mostrarPrevision?'J':'I';
  const merges=[{s:{r:0,c:0},e:{r:0,c:lastCol}},{s:{r:1,c:0},e:{r:1,c:lastCol}},...secRows.map(r=>({s:{r,c:0},e:{r,c:lastCol}})),
    {s:{r:rT2-1,c:0},e:{r:rT2-1,c:1}},{s:{r:rT2-1,c:3},e:{r:rT2-1,c:4}},
    ...(mostrarPrevision?[{s:{r:rT2-1,c:6},e:{r:rT2-1,c:7}}]:[]),
    {s:{r:rT3-1,c:0},e:{r:rT3-1,c:lastCol-2}},
    {s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:lastCol}}];
  const ws=buildSheet(rows,styles,widths,merges,hs);
  // FÓRMULAS VIVAS
  const F=(addr,f)=>{if(ws[addr]){ws[addr].t='n';ws[addr].f=f;}};
  // SUM ignora las celdas vacías que xlsx-js-style exporta como texto vacío.
  fx.forEach(x=>F(totalCol+x.r,`ROUND(SUM(G${x.r}${mostrarPrevision?`:H${x.r}`:''})-SUM(${retCol}${x.r}),2)`));
  F('G'+rTot,`SUM(G${firstData}:G${lastData})`);
  if(mostrarPrevision)F('H'+rTot,`SUM(H${firstData}:H${lastData})`);
  F(retCol+rTot,`SUM(${retCol}${firstData}:${retCol}${lastData})`);
  F(totalCol+rTot,`SUM(${totalCol}${firstData}:${totalCol}${lastData})`);
  const fTrans=[];
  if(trRange)fTrans.push(`SUM(${totalCol}${trRange[0]}:${totalCol}${trRange[1]})`);
  if(finRange)fTrans.push(`SUM(${totalCol}${finRange[0]}:${totalCol}${finRange[1]})`);
  if(fTrans.length)F('C'+rT2,fTrans.join('+'));
  const fCheq=[];
  if(chRange)fCheq.push(`SUM(${totalCol}${chRange[0]}:${totalCol}${chRange[1]})`);
  if(pendRange)fCheq.push(`SUM(${totalCol}${pendRange[0]}:${totalCol}${pendRange[1]})`);
  if(fCheq.length)F('F'+rT2,fCheq.join('+'));
  F(retCol+rT2,retCol+rTot);
  F(totalCol+rT3,totalCol+rTot);
  const auditoria=[
    ...act.map(w=>{const x=dsInfo(w),sueldo=redondearCentavos(Number(w.sal_semanal)||0);return {
      obra_id:w.obra_id,empresa_codigo:empCodigo(w),trabajador_id:w.id,trabajador_numero:w.no_trab,trabajador_nombre:fullName(w),
      tipo_calculo:'PROYECCION_NOMINA',periodo:sem,entradas:{sueldo_nomina:sueldo,prevision_social:x.dif,retenciones:x.ret,forma_pago:w.forma_pago||'TRANSFERENCIA'},
      resultado:{neto:x.neto},monto_modelo:x.neto,monto_aplicado:x.neto,ajuste_noi:0
    };}),
    ...fins.map(w=>({obra_id:w.obra_id,empresa_codigo:empCodigo(w),trabajador_id:w.id,trabajador_numero:w.no_trab,trabajador_nombre:fullName(w),
      tipo_calculo:'FINIQUITO_EN_PROYECCION',periodo:sem,entradas:{fecha_baja:w.fecha_baja||null,origen:'monto_finiquito_guardado'},
      resultado:{forma_pago:finTransDe(w,sem)?'TRANSFERENCIA':'CHEQUE',neto:redondearCentavos(Number(w.monto_finiquito)||0)},monto_modelo:null,monto_aplicado:redondearCentavos(Number(w.monto_finiquito)||0),ajuste_noi:null}))
  ];
  return {ws,tT,tC,tP,tR,tNom,tDif,total,nTot,auditoria};
}
