/* ---------- MÓDULO ANUAL: PTU (arts. 117-131 LFT) Y AGUINALDO (art. 87 LFT) ---------- */
/* ---------- DÍAS TRABAJADOS EN EL AÑO (arts. 87 y 123 LFT) -------------
   BUG CORREGIDO (04/09/2026). Antes esto era un solo tramo y se cortaba en
   la fecha_baja:
       let fin = `${anio}-12-31`;
       if (w.fecha_baja && w.fecha_baja < fin) fin = w.fecha_baja;
   Como el REINGRESO conserva a propósito la fecha_baja anterior (es su
   historial; ver doReactivar), a un reingresado se le truncaba el año en
   una baja que ya no estaba vigente y se le borraban todos los días
   trabajados DESPUÉS de volver. A quien salió el 15 de junio y regresó el
   1 de julio se le contaba enero–junio y se le tiraba julio–diciembre.

   POR QUÉ SE SUMAN LOS DOS TRAMOS — la ley habla de TIEMPO TRABAJADO EN EL
   AÑO, no de antigüedad:

     Art. 87 LFT, 2º párrafo (aguinaldo):
       "...tendrán derecho a que se les pague la parte proporcional del
        mismo, CONFORME AL TIEMPO QUE HUBIEREN TRABAJADO, cualquiera que
        fuere éste."
     Art. 123 LFT (PTU):
       "...tomando en consideración el NÚMERO DE DÍAS TRABAJADOS por cada
        uno EN EL AÑO..."
     Art. 127 fr. VII LFT (PTU de eventuales):
       "...cuando hayan trabajado SESENTA DÍAS DURANTE EL AÑO, por lo menos."

   Ese último importa mucho: quien trabajó 40 días antes de la baja y 40
   después del reingreso lleva 80 en el año y SÍ participa del reparto. Con
   el error se le contaban 40 y se le negaba un derecho.

   LA DISTINCIÓN QUE HAY QUE RESPETAR: la ANTIGÜEDAD sí se reinicia con el
   reingreso —la relación laboral anterior terminó—, y por eso vacaciones y
   prima vacacional usan iniAntig(). Los DÍAS TRABAJADOS EN EL AÑO, no: son
   los que de verdad se trabajaron, vengan de uno o de dos tramos.

   `hasta` acota el corte (para una PROVISIÓN contable se corta hoy, no a
   fin de año). Si se omite, el año completo. */
function _diasEntre(a,b){
  return Math.round((new Date(b+'T12:00')-new Date(a+'T12:00'))/86400000)+1;
}
function tramosEnAnio(w,anio,hasta){
  const ene1=`${anio}-01-01`, dic31=`${anio}-12-31`;
  const tope=(hasta&&hasta<dic31)?hasta:dic31;
  const alta=w&&w.fecha_alta?String(w.fecha_alta):null;
  if(!alta||alta>dic31)return {dias:0,tramos:[],aviso:null};
  const baja=w.fecha_baja?String(w.fecha_baja):null;
  const rei =w.fecha_reingreso?String(w.fecha_reingreso):null;
  let crudos, aviso=null;
  if(rei&&baja&&baja<rei){
    // Caso normal de reingreso: la baja es la ANTERIOR. Dos tramos.
    crudos=[[alta,baja,'1er periodo'],[rei,tope,'tras el reingreso']];
  }else if(rei&&baja){
    /* Le volvieron a dar de baja DESPUÉS de reingresar. La primera baja se
       perdió: `fecha_baja` es una sola columna y doBaja la sobrescribe, así
       que no se sabe cuándo terminó el primer tramo. Se cuenta corrido y se
       avisa, porque inventar un hueco sería inventar días que no sabemos.
       Art. 18 LFT: en caso de duda, lo más favorable al trabajador. */
    crudos=[[alta,baja,'alta a baja']]; aviso='NO_SE_CONOCE_LA_BAJA_ANTERIOR';
  }else if(rei){
    crudos=[[alta,tope,'alta a la fecha']]; aviso='REINGRESO_SIN_BAJA_REGISTRADA';
  }else{
    crudos=[[alta,baja||tope,baja?'alta a baja':'alta a la fecha']];
  }
  const tramos=[];
  crudos.forEach(([a,b,etq])=>{
    const i=a>ene1?a:ene1, f=(b&&b<tope)?b:tope;   // recortado al año y al corte
    if(!f||f<i)return;
    const d=_diasEntre(i,f);
    if(d>0)tramos.push({ini:i,fin:f,dias:d,etiqueta:etq});
  });
  /* Tope: el año no puede dar más de 365 días de proporción. Se divide entre
     365 fijos, que es la convención de nómina en México y hace que un año
     completo dé exactamente los 15 días del art. 87. */
  const suma=tramos.reduce((s,t)=>s+t.dias,0);
  return {dias:Math.min(365,Math.max(0,suma)),tramos,aviso};
}
function diasEnAnio(w,anio,hasta){return tramosEnAnio(w,anio,hasta).dias;}
function renderAnualView(){
  if(!$('anual-cards'))return;
  const anio=new Date().getFullYear();
  const act=WORKERS.filter(w=>w.estatus==='ACTIVO');
  /* La tarjeta dice "corte hoy" y ahora de verdad corta hoy. Antes pasaba
     el año completo, así que una provisión de septiembre ya traía dentro
     octubre, noviembre y diciembre: no era lo devengado, era el cierre
     proyectado. Una provisión contable es lo ACUMULADO a la fecha. */
  const prov=act.reduce((s,w)=>s+(Number(w.sd)||0)*15*(diasEnAnio(w,anio,today())/365),0);
  const p=CFGEMP['ptu_ultimo']||null;
  $('anual-cards').innerHTML=`
    <div class="stat b" style="min-width:280px"><div class="n">$${money(prov)}</div><div class="l">Provisión de aguinaldo ${anio} (activos, 15 días, corte hoy)</div></div>
    <div class="stat g" style="min-width:280px"><div class="n">${p?'$'+money(p.utilidad):'—'}</div><div class="l">${p?`Última PTU calculada: utilidad ${p.anio} (${p.fecha})`:'PTU: sin cálculo guardado'}</div></div>`;
}
/* ===== PTU ===== */
async function openPTU(){
  const p=CFGEMP['ptu_ultimo']||{};
  modal(`
    <div class="m-head"><h2>🪙 Reparto de utilidades (PTU) — arts. 117 a 131 LFT</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="background:var(--blue-bg);border-radius:8px;padding:12px 14px;font-size:12.5px;margin-bottom:14px;line-height:1.7">
        <b>Base legal:</b> se reparte el <b>10% de la renta gravable</b> de la declaración anual (art. 117 y 120). La bolsa se divide en dos partes iguales:
        50% por <b>días trabajados</b> y 50% por <b>salarios devengados</b> (art. 123). El salario base es la <b>cuota diaria (SD)</b>, sin tiempo extra (art. 124).
        <b>Tope por trabajador (art. 127-VIII):</b> 3 meses de salario o el promedio de PTU de los últimos 3 años, lo más favorable (aquí se aplica el tope de 3 meses; si el promedio histórico es mayor, ajústalo manualmente).
        Se excluyen: director/administrador general y <b>eventuales con menos de 60 días</b> trabajados en el año (art. 127). Ex-trabajadores del año con 60+ días <b>sí participan</b>.
        <b>Plazo de pago:</b> dentro de los 60 días siguientes a la declaración anual (para personas morales, a más tardar el 30 de mayo).
      </div>
      <div class="grid" style="grid-template-columns:1fr 1.4fr 1fr 1fr">
        <div><label>Ejercicio fiscal (año)</label><input id="ptu-anio" type="number" value="${p.anio||new Date().getFullYear()-1}"></div>
        <div><label>Renta gravable de la declaración anual ($)</label><input id="ptu-utilidad" type="number" step="0.01" value="${p.utilidad||''}" placeholder="Utilidad fiscal del SAT"></div>
        <div><label>Alcance</label><select id="ptu-alcance"><option value="OBRA">Obra actual</option><option value="TODAS">Todas las obras de esta empresa</option></select></div>
        <div style="display:flex;align-items:end"><button class="btn dark" style="width:100%" onclick="ptuCargar()">Cargar trabajadores</button></div>
      </div>
      <div id="ptu-tabla" style="margin-top:14px;max-height:380px;overflow:auto"></div>
      <div id="ptu-tot" style="margin-top:10px"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn" id="ptu-calc" disabled onclick="ptuCalcular()">🧮 Calcular reparto</button>
      <button class="btn dark hide" id="ptu-exp" onclick="ptuExportar()">⬇ Exportar Excel para firmas</button>
    </div>`,'lg');
}
async function ptuCargar(){
  const anio=parseInt($('ptu-anio').value)||new Date().getFullYear()-1;
  let lista=WORKERS;
  if($('ptu-alcance').value==='TODAS'){
    const {data,error}=await leerPorEmpresa('trabajadores','*',q=>q.eq('eliminado',false));
    if(error){toast('Error: '+error.message,'err');return;}
    lista=data||[];
  }
  /* Los días salen de tramosEnAnio, que SUMA el periodo anterior a la baja y
     el posterior al reingreso (art. 123: "número de días trabajados por cada
     uno EN EL AÑO"). Aquí eso no es solo dinero: el art. 127 fr. VII exige 60
     días en el año para que un eventual participe, y antes, al truncar en la
     baja vieja, alguien con 40 + 40 días aparecía con 40 y quedaba EXCLUIDO
     del reparto. Se le negaba un derecho, no se le pagaba de menos. */
  const rows=lista.map(w=>{
    const t=tramosEnAnio(w,anio);
    return {w,dias:t.dias,tramos:t.tramos,aviso:t.aviso,
      sal:Math.round((Number(w.sd)||0)*t.dias*100)/100,incluir:t.dias>=60};
  }).filter(r=>r.dias>0).sort((a,b)=>(a.w.no_trab||9e9)-(b.w.no_trab||9e9));
  if(!rows.length){toast('Nadie tiene días trabajados en '+anio+'.','err');return;}
  window._PTUR=rows;
  $('ptu-tabla').innerHTML=`
    <div class="imp-row head" style="grid-template-columns:26px 1.8fr .6fr .7fr .9fr .9fr"><span></span><span>Trabajador</span><span>SD</span><span>Días ${anio}</span><span>Salario devengado</span><span>Estatus</span></div>
    ${rows.map((r,i)=>`<div class="imp-row" style="grid-template-columns:26px 1.8fr .6fr .7fr .9fr .9fr">
      <span><input type="checkbox" style="width:auto" ${r.incluir?'checked':''} onchange="window._PTUR[${i}].incluir=this.checked"></span>
      <span><b>${esc(fullName(r.w))}</b>${r.dias<60?' <span style="color:var(--amber);font-size:10.5px">&lt;60 días (art. 127)</span>':''}${
        r.tramos.length>1?`<div style="font-size:10.5px;color:var(--mut)">${r.tramos.map(t=>`${t.etiqueta}: ${t.dias} d`).join(' + ')} = <b>${r.dias}</b> días en ${anio}</div>`:''}${
        r.aviso?`<div style="font-size:10.5px;color:var(--amber)">⚠ ${r.aviso==='NO_SE_CONOCE_LA_BAJA_ANTERIOR'?'reingresó y volvió a causar baja: no se conserva la baja anterior, los días van corridos. Ajústalos si hace falta.':'reingreso sin baja registrada: los días van corridos desde el alta. Ajústalos si hace falta.'}</div>`:''}</span>
      <span>$${money(r.w.sd)}</span>
      <input type="number" min="0" max="365" value="${r.dias}" oninput="window._PTUR[${i}].dias=parseInt(this.value)||0;window._PTUR[${i}].sal=Math.round((Number(window._PTUR[${i}].w.sd)||0)*(parseInt(this.value)||0)*100)/100">
      <span>$${money(r.sal)}</span>
      <span><span class="badge ${r.w.estatus}">${r.w.estatus}</span></span>
    </div>`).join('')}`;
  $('ptu-calc').disabled=false;
  $('ptu-exp').classList.add('hide');
  toast(rows.length+' trabajadores con días en '+anio+'. Ajusta días/exclusiones y calcula.','ok');
}
function ptuCalcular(){
  const utilidad=parseFloat($('ptu-utilidad').value);
  if(!utilidad||utilidad<=0){toast('Captura la renta gravable de la declaración anual.','err');return;}
  const rows=(window._PTUR||[]).filter(r=>r.incluir&&r.dias>0);
  if(!rows.length){toast('No hay participantes.','err');return;}
  const bolsa=utilidad*0.10, mitad=bolsa/2;
  const sumD=rows.reduce((s,r)=>s+r.dias,0), sumS=rows.reduce((s,r)=>s+r.sal,0);
  let repartido=0, topados=0;
  rows.forEach(r=>{
    r.p1=mitad*r.dias/sumD;
    r.p2=sumS?mitad*r.sal/sumS:0;
    r.bruto=r.p1+r.p2;
    r.tope=(Number(r.w.sd)||0)*90; // 3 meses de salario (art. 127-VIII)
    r.final=Math.min(r.bruto,r.tope);
    r.topado=r.bruto>r.tope;
    if(r.topado)topados++;
    repartido+=r.final;
  });
  window._PTUCALC={anio:$('ptu-anio').value,utilidad,bolsa,rows,repartido,topados};
  $('ptu-tot').innerHTML=`
    <div class="stats">
      <div class="stat b"><div class="n">$${money(bolsa)}</div><div class="l">Bolsa PTU (10% de $${money(utilidad)})</div></div>
      <div class="stat g"><div class="n">$${money(repartido)}</div><div class="l">Total a repartir (${rows.length} participantes)</div></div>
      <div class="stat a"><div class="n">${topados}</div><div class="l">Con tope de 3 meses aplicado</div></div>
    </div>`;
  $('ptu-exp').classList.remove('hide');
  // guardar parámetros
  CFGEMP['ptu_ultimo']={anio:$('ptu-anio').value,utilidad,fecha:new Date().toLocaleDateString('es-MX')};
  try{sb.from('config').upsert({clave:'ptu_ultimo',valor:CFGEMP['ptu_ultimo'],actualizado_por:USER.email}).then(()=>{});}catch(e){}
  renderAnualView();
}
function ptuExportar(){
  const c=window._PTUCALC; if(!c)return;
  const rows=[],styles=[];
  rows.push([`REPARTO DE UTILIDADES (PTU) — EJERCICIO ${c.anio} — ARTS. 117-131 LFT`]); styles.push(ST.title);
  rows.push([`Renta gravable declarada: $${money(c.utilidad)}   |   Bolsa (10%): $${money(c.bolsa)}   |   50% por días + 50% por salarios (art. 123)`]); styles.push(ST.sub);
  rows.push(['NO.','TRABAJADOR','NSS','SD','DÍAS','SALARIO DEVENGADO','PARTE POR DÍAS','PARTE POR SALARIO','PTU BRUTA','TOPE 3 MESES','PTU A PAGAR','FIRMA']); styles.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cellC,ST.money,ST.cellC,ST.money,ST.money,ST.money,ST.money,ST.money,ST.money,ST.cell];
  const hs=[{hpt:26},{hpt:20},{hpt:26}];
  c.rows.forEach((r,i)=>{rows.push([r.w.no_trab??'',fullName(r.w),r.w.nss||'',Number(r.w.sd)||0,r.dias,r.sal,Math.round(r.p1*100)/100,Math.round(r.p2*100)/100,Math.round(r.bruto*100)/100,r.topado?r.tope:'',Math.round(r.final*100)/100,'']);styles.push(rs);hs.push({hpt:26});});
  rows.push(['','TOTALES','','',c.rows.reduce((s,r)=>s+r.dias,0),c.rows.reduce((s,r)=>s+r.sal,0),'','','','',Math.round(c.repartido*100)/100,'']);
  styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total]); hs.push({hpt:22});
  rows.push(['Pago dentro de los 60 días siguientes a la declaración anual (art. 122 LFT). El tope aplicado es de 3 meses de salario; si el promedio de PTU de los últimos 3 años resulta más favorable al trabajador, prevalece (art. 127-VIII).']);
  styles.push(ST.sub); hs.push({hpt:18});
  const ws=buildSheet(rows,styles,[6,32,13,10,7,14,12,12,12,12,12,20],[{s:{r:0,c:0},e:{r:0,c:11}},{s:{r:1,c:0},e:{r:1,c:11}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:11}}],hs);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,`PTU ${c.anio}`);
  dl(wb,`PTU_${c.anio}_${today()}.xlsx`);
  toast('PTU exportada con columna de firma.','ok');
}
/* ===== AGUINALDO ===== */
function openAguinaldo(){
  const anio=new Date().getFullYear();
  modal(`
    <div class="m-head"><h2>🎄 Aguinaldo — art. 87 LFT</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <div style="background:var(--blue-bg);border-radius:8px;padding:12px 14px;font-size:12.5px;margin-bottom:14px;line-height:1.7">
        <b>Base legal (art. 87 LFT):</b> mínimo <b>15 días de salario</b>, pagadero <b>antes del 20 de diciembre</b>.
        Quien no haya cumplido el año recibe la <b>parte proporcional</b> a los días trabajados. Se calcula con la cuota diaria (SD).
        Las bajas del año normalmente ya recibieron su proporcional en el finiquito — por eso el cálculo considera solo activos (puedes incluir bajas si hace falta).
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr">
        <div><label>Año</label><input id="ag-anio" type="number" value="${anio}"></div>
        <div><label>Días de aguinaldo</label><input id="ag-dias" type="number" min="15" value="15"><div class="fhint">15 es el mínimo de ley.</div></div>
        <div><label>Incluir</label><select id="ag-alcance"><option value="ACTIVOS">Solo activos</option><option value="TODOS">Activos + bajas del año</option></select></div>
        <div style="display:flex;align-items:end"><button class="btn dark" style="width:100%" onclick="agCalcular()">🧮 Calcular</button></div>
      </div>
      <div id="ag-tabla" style="margin-top:14px;max-height:380px;overflow:auto"></div>
      <div id="ag-tot" style="margin-top:10px"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn dark hide" id="ag-exp" onclick="agExportar()">⬇ Exportar Excel para firmas</button>
    </div>`,'lg');
}
function agCalcular(){
  const anio=parseInt($('ag-anio').value)||new Date().getFullYear();
  const diasAg=Math.max(15,parseInt($('ag-dias').value)||15);
  let lista=WORKERS.filter(w=>w.estatus==='ACTIVO');
  if($('ag-alcance').value==='TODOS')lista=WORKERS.filter(w=>w.estatus!=='PENDIENTE');
  const rows=lista.map(w=>{
    const t=tramosEnAnio(w,anio);
    const monto=Math.round((Number(w.sd)||0)*diasAg*(t.dias/365)*100)/100;
    return {w,dias:t.dias,tramos:t.tramos,aviso:t.aviso,monto};
  }).filter(r=>r.dias>0).sort((a,b)=>(a.w.no_trab||9e9)-(b.w.no_trab||9e9));
  if(!rows.length){toast('Nadie tiene días en '+anio+'.','err');return;}
  const total=rows.reduce((s,r)=>s+r.monto,0);
  window._AGC={anio,diasAg,rows,total};
  /* A quien reingresó en el año se le muestra DE DÓNDE salen sus días. Si
     además se le pagó finiquito en la baja anterior, ese finiquito ya debió
     traer el aguinaldo proporcional del primer tramo (art. 87, 2º párrafo),
     así que se avisa para no pagarlo dos veces. NO se descuenta solo: el
     monto del finiquito es un total y no consta qué parte era aguinaldo. */
  const conTramos=rows.filter(r=>r.tramos.length>1||r.aviso);
  $('ag-tabla').innerHTML=`
    <div class="imp-row head" style="grid-template-columns:.5fr 2fr .7fr .8fr .9fr"><span>No.</span><span>Trabajador</span><span>SD</span><span>Días ${anio}</span><span>Aguinaldo</span></div>
    ${rows.map(r=>`<div class="imp-row" style="grid-template-columns:.5fr 2fr .7fr .8fr .9fr">
      <span>${r.w.no_trab??''}</span><span><b>${esc(fullName(r.w))}</b> <span class="badge ${r.w.estatus}" style="font-size:9.5px">${r.w.estatus}</span>${
        r.tramos.length>1?`<div style="font-size:10.5px;color:var(--mut)">${r.tramos.map(t=>`${t.etiqueta}: ${fmtD(t.ini)} a ${fmtD(t.fin)} = <b>${t.dias}</b> d`).join(' · ')}${
          r.w.monto_finiquito?` · <b style="color:var(--amber)">se le pagó finiquito de $${money(r.w.monto_finiquito)}: revisa si ya traía el aguinaldo del 1er periodo</b>`:''}</div>`:''}${
        r.aviso?`<div style="font-size:10.5px;color:var(--amber)">⚠ ${r.aviso==='NO_SE_CONOCE_LA_BAJA_ANTERIOR'?'reingresó y volvió a causar baja: no se conserva la fecha de la baja anterior, así que los días van corridos. Verifícalos.':'tiene reingreso sin baja registrada: los días van corridos desde el alta. Verifícalos.'}</div>`:''}</span>
      <span>$${money(r.w.sd)}</span><span>${r.dias}</span><span><b>$${money(r.monto)}</b></span>
    </div>`).join('')}`;
  $('ag-tot').innerHTML=`<div class="stats">
    <div class="stat g"><div class="n">$${money(total)}</div><div class="l">Total aguinaldo ${anio} (${rows.length} trabajadores, ${diasAg} días)</div></div>
    <div class="stat a"><div class="n">20 DIC</div><div class="l">Fecha límite de pago (art. 87)</div></div>
    ${conTramos.length?`<div class="stat b"><div class="n">${conTramos.length}</div><div class="l">Con reingreso en ${anio}: revisa el desglose</div></div>`:''}</div>`;
  $('ag-exp').classList.remove('hide');
}
function agExportar(){
  const c=window._AGC; if(!c)return;
  const rows=[],styles=[];
  rows.push([`AGUINALDO ${c.anio} — ART. 87 LFT — ${c.diasAg} DÍAS DE SALARIO — PAGO ANTES DEL 20 DE DICIEMBRE`]); styles.push(ST.title);
  rows.push(['NO.','TRABAJADOR','NSS','SD','DÍAS TRABAJADOS','PROPORCIÓN','AGUINALDO','FIRMA DE RECIBIDO']); styles.push(ST.head);
  const rs=[ST.cellC,ST.cell,ST.cellC,ST.money,ST.cellC,ST.cellC,ST.money,ST.cell];
  const hs=[{hpt:26},{hpt:26}];
  c.rows.forEach(r=>{rows.push([r.w.no_trab??'',fullName(r.w),r.w.nss||'',Number(r.w.sd)||0,r.dias,(r.dias/365*100).toFixed(1)+'%',r.monto,'']);styles.push(rs);hs.push({hpt:28});});
  rows.push(['','TOTAL','','','','',Math.round(c.total*100)/100,'']);
  styles.push([ST.total,ST.total,ST.total,ST.total,ST.total,ST.total,ST.totalMoney,ST.total]); hs.push({hpt:22});
  const ws=buildSheet(rows,styles,[6,34,13,10,13,11,12,26],[{s:{r:0,c:0},e:{r:0,c:7}}],hs);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,`AGUINALDO ${c.anio}`);
  dl(wb,`AGUINALDO_${c.anio}_${OBRA.nombre.slice(0,14).replace(/\s+/g,'_')}.xlsx`);
  toast('Aguinaldo exportado con columna de firma.','ok');
}


