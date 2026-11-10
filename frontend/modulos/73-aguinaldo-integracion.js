/* Aguinaldo aplicado a la nómina ordinaria: integración con la proyección.
   Post-proceso del modelo: proyModelo, los motores 52/53 y el ajuste ISR
   mensual quedan intactos. Sólo las filas con una aplicación vigente en su
   periodo reciben el campo `aguinaldo` y su neto aumenta en el neto del
   aguinaldo (bruto − ISR incremental). El sueldo y la previsión social no
   cambian, como exige la validación de la fotografía quincenal. */
function aguinaldoSinEsquema(error){
  const c=String(error?.code||''),m=String(error?.message||'');
  return c==='PGRST205'||c==='42P01'||(/control_aguinaldo_lineas/.test(m)&&/does not exist|could not find|schema cache/i.test(m));
}
/* Aplicaciones vigentes de los centros indicados. Sin la migración aún no
   hay aplicaciones; cualquier otro error detiene la proyección. */
async function aguinaldoLeerLineas(obraIds){
  const ids=[...new Set((obraIds||[]).filter(Boolean))];
  if(!ids.length)return [];
  const {data,error}=await fetchAllRows(()=>sb.from('control_aguinaldo_lineas')
    .select('id,lote_id,obra_id,empresa_codigo,trabajador_id,ejercicio,periodicidad,semana,periodo_desde,periodo_hasta,fecha_pago,bruto,exento,gravado,isr,neto,metodo_isr,estado,version')
    .in('obra_id',ids).eq('estado','APLICADO'));
  if(error){if(aguinaldoSinEsquema(error))return [];throw Error('No se pudieron consultar los aguinaldos aplicados: '+error.message);}
  return data||[];
}
function aguinaldoLineaValida(l){
  const n=k=>Number(l[k]),r=redondearCentavos;
  const ok=['bruto','exento','gravado','isr','neto'].every(k=>Number.isFinite(n(k))&&n(k)>=0)&&n('bruto')>0
    &&r(n('exento')+n('gravado'))===r(n('bruto'))&&r(n('bruto')-n('isr'))===r(n('neto'))&&n('isr')<=n('gravado')
    &&/^\d{4}-\d\d-\d\d$/.test(l.periodo_desde||'')&&/^\d{4}-\d\d-\d\d$/.test(l.periodo_hasta||'');
  if(!ok)throw Error('Aplicación de aguinaldo con importes inconsistentes ('+String(l.id||'').slice(0,8)+'). Revísala en Prestaciones → Aguinaldo antes de exportar.');
  return l;
}
/* Periodo de la línea según el calendario vigente del centro para la semana
   proyectada. Un cambio de periodicidad posterior deja la línea sin fila y
   se informa; nunca se reubica en otro periodo. */
function aguinaldoEnPeriodo(l,w,sem){
  if(l.trabajador_id!==w.id||l.obra_id!==w.obra_id)return false;
  const p=calendarioNominaDe(w,sem);
  return p.desde===l.periodo_desde&&p.hasta===l.periodo_hasta&&periodoPago(w)===String(l.periodicidad||'').toUpperCase();
}
function aguinaldoAplicarModelo(m,lineas){
  const xs=(lineas||[]).filter(l=>l&&l.estado==='APLICADO').map(aguinaldoLineaValida);
  if(!xs.length||!m?.filas?.length)return m;
  for(const f of m.filas.filter(f=>f.fin))
    if(xs.some(l=>aguinaldoEnPeriodo(l,f.w,m.sem)))throw Error(`#${f.w.no_trab} (${fullName(f.w)}) tiene aguinaldo aplicado en este periodo y ahora es finiquito: retira la aplicación en Prestaciones → Aguinaldo y concilia el aguinaldo dentro del finiquito.`);
  const r=redondearCentavos,s=(ls,k)=>r(ls.reduce((a,l)=>a+Number(l[k]),0));let toca=false;
  const filas=m.filas.map(f=>{
    if(f.fin||f.aguinaldo)return f;
    const ls=xs.filter(l=>aguinaldoEnPeriodo(l,f.w,m.sem));
    if(!ls.length)return f;
    toca=true;
    const ag={lineas:ls.map(l=>l.id).sort(),ejercicio:ls[0].ejercicio,fecha_pago:ls[0].fecha_pago,periodo_desde:ls[0].periodo_desde,periodo_hasta:ls[0].periodo_hasta,
      metodo_isr:[...new Set(ls.map(l=>l.metodo_isr))].join('+'),bruto:s(ls,'bruto'),exento:s(ls,'exento'),gravado:s(ls,'gravado'),isr:s(ls,'isr'),neto:s(ls,'neto')};
    return {...f,aguinaldo:ag,neto:r(f.neto+ag.neto)};
  });
  if(!toca)return m;
  const total=k=>r(filas.reduce((a,f)=>a+(f.aguinaldo?Number(f.aguinaldo[k]):0),0));
  return {...m,filas,items:filas.flatMap(x=>x.items),neto:r(filas.reduce((a,f)=>a+f.neto,0)),
    aguinaldo:{bruto:total('bruto'),exento:total('exento'),gravado:total('gravado'),isr:total('isr'),neto:total('neto'),trabajadores:filas.filter(f=>f.aguinaldo).length}};
}
/* Aplicaciones del periodo que no quedaron en ninguna fila del modelo final
   (después de sustituir los periodos sellados). Se revisa contra el alcance
   de la exportación: centro, periodicidad y, si aplica, contratista. */
function aguinaldoSinFila(m,lineas,alcance){
  const a=alcance||{},enModelo=new Set((m?.filas||[]).flatMap(f=>f.aguinaldo?.lineas||[]));
  return (lineas||[]).filter(l=>l&&l.estado==='APLICADO'&&!enModelo.has(l.id)
    &&(!a.trabajadores||a.trabajadores.has(l.trabajador_id))
    &&(!a.periodo||a.periodo==='TODOS'||String(l.periodicidad).toUpperCase()===a.periodo)
    &&(()=>{const p=calendarioNominaDe({periodo_pago:l.periodicidad},m.sem);return p.desde===l.periodo_desde&&p.hasta===l.periodo_hasta;})());
}
function aguinaldoExigirCompleto(m,lineas,alcance){
  const faltan=aguinaldoSinFila(m,lineas,alcance);
  if(faltan.length)throw Error(`${faltan.length} aplicación(es) de aguinaldo de este periodo no tienen fila de nómina (baja, cambio de periodicidad o centro). Retíralas o corrígelas en Prestaciones → Aguinaldo; no se exporta una nómina incompleta.`);
  return m;
}
/* Columna de importe genérica para las hojas de proyección. Misma mecánica
   que la columna de previsión social: valores por fila y SUM por bloques. */
function proyColumnaConcepto(tabla,filas,totales,pos,titulo,valor){
  const importes=new Map(filas.map(({r,x})=>{const n=Number(valor(x)??0);if(!Number.isFinite(n))throw Error(titulo+' inválido. Revisa la aplicación antes de exportar.');return [r,n];}));
  if(![...importes.values()].some(n=>n!==0))return null;
  const col=XLSX.utils.encode_col(pos),formulas=[];
  tabla.rows.forEach((row,i)=>{
    if(i===2)row.splice(pos,0,titulo);
    else if(row.length>pos)row.splice(pos,0,importes.get(i+1)??0);
    const st=tabla.styles[i];if(Array.isArray(st))st.splice(pos,0,{...st[6],alignment:{...st[6]?.alignment,indent:1}});
  });
  for(const {r,datos} of totales){
    tabla.rows[r-1][pos]=redondearCentavos(datos.reduce((s,n)=>s+(importes.get(n)||0),0));
    const ranges=[];let a=null,b=null;
    for(const n of datos){if(a==null)a=b=n;else if(n===b+1)b=n;else{ranges.push(`${col}${a}:${col}${b}`);a=b=n;}}
    if(a!=null)ranges.push(`${col}${a}:${col}${b}`);
    formulas.push([col+r,ranges.length?`SUM(${ranges.join(',')})`:'0']);
  }
  tabla.widths.splice(pos,0,18);
  tabla.merges.forEach(m=>{if(m.s.c>=pos)m.s.c++;if(m.e.c>=pos||(m.s.r===0&&m.e.c===pos-1))m.e.c++;});
  return {col,formulas};
}
/* Hoja de desglose fiscal: bruto, exento (LISR 93-XIV), gravado, ISR y neto. */
function aguinaldoHojaProyeccion(modelo,colB){
  const filas=modelo.filas.filter(f=>f.aguinaldo).sort((a,b)=>(Number(a.w.no_trab)||0)-(Number(b.w.no_trab)||0));
  const rows=[[`AGUINALDO APLICADO · ${modelo.sem} · ART. 87 LFT · LISR 93-XIV Y 96 / RLISR 174`],
    ['NO.','NOMBRE COMPLETO',colB==='OBRA'?'OBRA':'CONTRATISTA','EJERCICIO','PERIODO','FECHA DE PAGO','AGUINALDO BRUTO','EXENTO','GRAVADO','ISR AGUINALDO','MÉTODO ISR','AGUINALDO NETO']];
  const styles=[ST.title,ST.head],money=[6,7,8,9,11];
  for(const f of filas){
    const a=f.aguinaldo;
    rows.push([f.w.no_trab??'',fullName(f.w),colB==='OBRA'?(OBRAS.find(o=>o.id===f.w.obra_id)?.nombre||''):f.w.contratista||'',a.ejercicio,
      `${fmtD(a.periodo_desde)} – ${fmtD(a.periodo_hasta)}`,fmtD(a.fecha_pago),a.bruto,a.exento,a.gravado,a.isr,a.metodo_isr==='ART174'?'RLISR 174':'LISR 96',a.neto]);
    styles.push(rows[1].map((_,i)=>money.includes(i)?ST.money:i===1||i===2?ST.cell:ST.cellC));
  }
  const t=rows.length+1,ultima=rows.length;
  const suma=k=>redondearCentavos(filas.reduce((s,f)=>s+Number(f.aguinaldo[k]),0));
  rows.push(['TOTAL','','','','','',suma('bruto'),suma('exento'),suma('gravado'),suma('isr'),'',suma('neto')]);
  styles.push(rows[1].map((_,i)=>money.includes(i)?ST.totalMoney:ST.total));
  rows.push(['Exento por patrón y año de pago: 30 UMA de la fecha de pago menos lo ya consumido. ISR incremental del periodo (art. 96) o procedimiento opcional del art. 174 RLISR. Concepto SAT 002 (gratificación anual). El neto del aguinaldo está incluido en el neto a pagar de la nómina.']);
  styles.push(ST.sub);
  const ws=buildSheet(rows,styles,[8,36,22,10,24,13,16,14,14,14,12,16],[{s:{r:0,c:0},e:{r:0,c:11}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:11}}],[{hpt:30},{hpt:32},...filas.map(()=>({hpt:24})),{hpt:24},{hpt:36}]);
  for(const c of ['G','H','I','J','L'])if(ws[c+t]){ws[c+t].t='n';ws[c+t].f=filas.length?`SUM(${c}3:${c}${ultima})`:'0';}
  return ws;
}
/* Campos de la fotografía: sólo existen cuando hay aguinaldo aplicado, para
   que las fotografías sin aguinaldo conserven exactamente su huella. */
function aguinaldoCamposItem(f){
  const a=f&&f.aguinaldo;if(!a)return {};
  return {aguinaldo_bruto:a.bruto,aguinaldo_exento:a.exento,aguinaldo_gravado:a.gravado,aguinaldo_isr:a.isr,aguinaldo_neto:a.neto,aguinaldo_lineas:a.lineas};
}
function aguinaldoCamposSnapshot(filas){
  const xs=(filas||[]).filter(f=>f.aguinaldo);if(!xs.length)return {};
  const s=k=>redondearCentavos(xs.reduce((a,f)=>a+Number(f.aguinaldo[k]),0));
  return {total_aguinaldo_bruto:s('bruto'),total_aguinaldo_isr:s('isr'),total_aguinaldo_neto:s('neto')};
}
