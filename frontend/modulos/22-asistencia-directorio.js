/* ---------- LISTAS DE ASISTENCIA + DIRECTORIO ---------- */
/* Las listas y el directorio usan la vigencia histórica del trabajador.
   Los pendientes que ingresaron antes siguen apareciendo, mientras altas y
   reingresos futuros no contaminan semanas anteriores. La RPC aplica la misma
   regla (Script 92). */
/* Vigencia histórica: una baja anterior solo deja de excluir si hubo reingreso
   antes del domingo consultado. Una baja posterior a la semana sí pertenecía
   a esa plantilla, aunque hoy el trabajador figure como BAJA. */
function asVigenteSemana(w,d1,d2){
  if(!d1||!d2||d1>d2)return false;
  const alta=String(w.fecha_alta||'').slice(0,10);
  const baja=String(w.fecha_baja||'').slice(0,10);
  const reingreso=String(w.fecha_reingreso||'').slice(0,10);
  if(!alta||alta>d2)return false;
  if(reingreso>d2)return !!baja&&baja>d1&&baja<reingreso;
  if(reingreso)return !baja||baja<reingreso||baja>Math.max(d1,reingreso);
  return !baja||baja>d1;
}
function asSinServicioSemana(d1,obra=OBRA,registros=ALTAS_CORTAS){
  if(!d1||!obra)return new Set();
  const anio=Number(d1.slice(0,4)),semana=isoWeekDe(obra,new Date(d1+'T12:00'));
  return new Set((registros||[]).filter(a=>(!a.obra_id||a.obra_id===obra.id)&&Number(a.anio)===anio&&Number(a.semana)===semana&&a.estado_servicio==='SIN_SERVICIO_CONFIRMADO').map(a=>a.trabajador_id));
}
function asActivosSemana(d1,d2){
  const sinServicio=asSinServicioSemana(d1);
  return WORKERS.filter(w=>!sinServicio.has(w.id)&&asVigenteSemana(w,d1,d2))
    .sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
}
/* Los mismos de arriba, pero en el orden de las LISTAS: contratista → cuadrilla →
   nombre. Se arma con asGruposCuadrilla para que el Excel y la consulta de la
   base (fn_lista_asistencia, Script 56) den exactamente el mismo resultado. */
function asOrdenados(d1,d2){
  return asGruposCuadrilla(asActivosSemana(d1,d2)).flatMap(g=>g.gente);
}
/* Red de seguridad: compara solo activos vigentes en la semana, nunca altas
   de un periodo posterior. */
function asFaltantes(lst,d1,d2){
  const dentro=new Set(lst.map(w=>w.id));
  const sinServicio=asSinServicioSemana(d1);
  return (WORKERS||[]).filter(w=>w.estatus==='ACTIVO'&&!sinServicio.has(w.id)&&asVigenteSemana(w,d1,d2)&&!dentro.has(w.id));
}
function asUpdateStat(){
  const d1=$('as-d1')?$('as-d1').value:'', d2=$('as-d2')?$('as-d2').value:'';
  const lst=asActivosSemana(d1,d2), pend=lst.filter(w=>w.estatus==='PENDIENTE').length;
  if($('as-stat-n'))$('as-stat-n').textContent=lst.length;
  if($('as-stat-l'))$('as-stat-l').innerHTML=`En la lista de esa semana → ${asPaginas(asGruposCuadrilla(lst)).length} hojas${pend?` · incluye <b>${pend}</b> sin expediente completo (ya están asistiendo)`:''}`;
  const av=$('as-alerta'); if(!av)return;
  const falta=asFaltantes(lst,d1,d2);
  if(!falta.length){ av.innerHTML=''; av.style.display='none'; return; }
  av.style.display='';
  av.innerHTML=`<div class="kv" style="background:var(--red-bg,#fde8e8)"><b style="color:var(--red)">⚠ ${falta.length} ACTIVO(S) FUERA DE LA LISTA</b>
    <span>${falta.slice(0,8).map(w=>`<b>${esc(fullName(w))}</b>${w.no_trab?' (Nº '+w.no_trab+')':''}`).join(' · ')}${falta.length>8?` y ${falta.length-8} más`:''}.
    Todo trabajador vigente en esa semana debe salir en la lista. Avísale a quien lleva el sistema.</span></div>`;
}
function openAsistencia(){
  const [d1,d2]=weekBounds();
  const lst=asActivosSemana(d1,d2);
  modal(`
    <div class="m-head"><h2>📝 Listas de asistencia · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:14px">Genera el Excel con hojas ajustadas a cada cuadrilla (hasta 11 trabajadores), más las hojas de <b>NUEVO INGRESO</b> en blanco que pidas, y el <b>directorio alfabético para vigilancia</b>. Incluye solo a quienes tuvieron vigencia en la semana elegida, incluso pendientes que ya ingresaron; excluye altas y reingresos de semanas futuras y casos confirmados sin servicio. Cada hoja va <b>ordenada por número de trabajador</b> dentro de su cuadrilla.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr">
        <div><label>No. de semana</label><input id="as-sem" type="number" value="${semObra()}" oninput="semSincroniza('as-sem','as-d1','as-d2');asUpdateStat()"></div>
        <div><label>Del (lunes)</label><input id="as-d1" type="date" value="${d1}" onchange="asUpdateStat()"></div>
        <div><label>Al (domingo)</label><input id="as-d2" type="date" value="${d2}" onchange="asUpdateStat()"></div>
        <div><label>Hojas NUEVO INGRESO</label><input id="as-extra" type="number" min="0" value="3"></div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr;margin-top:12px">
        <div><label>Entrada L-V</label><input id="as-h1" value="8:00"></div>
        <div><label>Salida L-V</label><input id="as-h2" value="17:00"></div>
        <div><label>Entrada sábado</label><input id="as-h3" value="9:00"></div>
        <div><label>Salida sábado</label><input id="as-h4" value="13:00"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <div class="stat g" style="flex:1"><div class="n" id="as-stat-n">${lst.length}</div><div class="l" id="as-stat-l">En la lista de esa semana → ${asPaginas(asGruposCuadrilla(lst)).length} hojas</div></div>
      </div>
      <div id="as-alerta" style="margin-top:10px;display:none"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="openRevisarFirmas()">🖊️ Revisar firmas (foto)</button>
      <button class="btn" onclick="exportDirectorioExcel()">📗 Directorio (Excel)</button>
      <button class="btn" onclick="exportDirectorio()">👮 Directorio para imprimir</button>
      <button class="btn dark" onclick="exportAsistencia()">⬇ Generar listas + directorio</button>
    </div>`,'md');
  asUpdateStat();   // deja armada la comprobación de "ningún ACTIVO se quedó fuera"
}
const AS={
  t:{font:{bold:true,sz:13,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'1F3864'}},alignment:{horizontal:'center',vertical:'center'}},
  lb:{font:{bold:true,sz:9,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'2F5496'}},alignment:{horizontal:'left',vertical:'center'}},
  lv:{font:{sz:9,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'2F5496'}},alignment:{horizontal:'left',vertical:'center'}},
  /* Encabezado de la lista de asistencia, en grande: se lee de lejos y con la
     hoja en la mano. Solo se usa en OBRA / PERÍODO / CUADRILLA. */
  lb2:{font:{bold:true,sz:12,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'2F5496'}},alignment:{horizontal:'left',vertical:'center'}},
  lv2:{font:{bold:true,sz:12,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'2F5496'}},alignment:{horizontal:'left',vertical:'center'}},
  h:{font:{bold:true,sz:9,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'2E75B6'}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:BORD},
  h2:{font:{bold:true,sz:7,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'2E75B6'}},alignment:{horizontal:'center',vertical:'center'},border:BORD},
  h3:{font:{sz:7,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'2E75B6'}},alignment:{horizontal:'center',vertical:'center'},border:BORD},
  w:{font:{sz:9,name:'Calibri'},fill:{fgColor:{rgb:'EBF3FB'}},border:BORD,alignment:{vertical:'center'}},
  wn:{font:{sz:9,name:'Calibri'},fill:{fgColor:{rgb:'EBF3FB'}},border:BORD,alignment:{vertical:'center',wrapText:true}},
  wc:{font:{sz:9,name:'Calibri'},fill:{fgColor:{rgb:'EBF3FB'}},border:BORD,alignment:{horizontal:'center',vertical:'center'}},
  b:{font:{sz:9,name:'Calibri'},border:BORD},
  f:{font:{bold:true,sz:9,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'1F3864'}},alignment:{horizontal:'center',vertical:'center'}},
  pagina:{font:{bold:true,sz:10,color:{rgb:'1F3864'},name:'Calibri'},alignment:{horizontal:'center',vertical:'center'}}
};
/* Ancho de una columna a la medida de su contenido, en unidades de Excel
   (1 unidad ≈ 1 carácter). Se acota entre min y max para que ni se corte ni
   se coma el espacio que necesita la firma. */
function asAncho(valores,min,max,holgura){
  let n=0;
  (valores||[]).forEach(v=>String(v==null?'':v).split('\n')
    .forEach(l=>{ if(l.length>n)n=l.length; }));
  return Math.max(min,Math.min(max,n+(holgura===undefined?2:holgura)));
}
function asDias(d1){
  const DN=['LUNES','MARTES','MIÉ.','JUEVES','VIERNES','SÁBADO'];
  const M3=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const out=[];const base=new Date(d1+'T12:00');
  for(let i=0;i<6;i++){const d=new Date(base);d.setDate(base.getDate()+i);out.push(`${DN[i]}\n${d.getDate()}/${M3[d.getMonth()]}`);}
  return out;
}
function asSheet(grupo,cfg,blanco){
  // blanco (nuevo ingreso): solo NOMBRE + EMPRESA/CONTRATISTA + 12 columnas de días = 14
  // lista normal: NO. + NOMBRE + NSS + 12 columnas de días = 15
  /* Columnas de datos: la lista normal lleva 3 (No., nombre, NSS) y la de nuevo
     ingreso solo 2 (nombre y puesto). Las 12 restantes son las de firma. */
  const base=blanco?2:3;
  const nc=base+12;
  const rows=[],styles=[],hs=[];
  const dias=asDias(cfg.d1);
  const mrow=(arr)=>{while(arr.length<nc)arr.push('');return arr;};
  /* ENCABEZADO (2026-08-27): se quitaron EMPRESA, R. PATRONAL y NO. SIROC —el que
     recibe la hoja en obra no los usa y le robaban dos renglones al espacio útil.
     Quedan solo OBRA, PERÍODO y CUADRILLA, cada uno en su propio renglón y a todo
     lo ancho, con fuente más grande (AS.lb2/AS.lv2) para que se lean de lejos y
     el nombre de la cuadrilla NUNCA se corte. */
  rows.push(mrow(['LISTA DE ASISTENCIA DE OBRA'+(cfg.hoja?' · HOJA '+cfg.hoja:'')])); styles.push(AS.t); hs.push({hpt:26});
  rows.push(mrow(['OBRA:','',cfg.obra])); styles.push([AS.lb2,AS.lb2].concat(new Array(nc-2).fill(AS.lv2))); hs.push({hpt:20});
  rows.push(mrow(['PERÍODO:','',cfg.periodo])); styles.push([AS.lb2,AS.lb2].concat(new Array(nc-2).fill(AS.lv2))); hs.push({hpt:20});
  const gTxt=cfg.grupo?(cfg.grupo.contratista+(cfg.grupo.cuadrilla?' · '+cfg.grupo.cuadrilla:'')
    +(cfg.grupo.lider?'  —  CABEZA: '+cfg.grupo.lider:'')+(cfg.parte?'  ('+cfg.parte+')':'')):'';
  rows.push(mrow(['CUADRILLA:','',gTxt||'—'])); styles.push([AS.lb2,AS.lb2].concat(new Array(nc-2).fill(AS.lv2))); hs.push({hpt:20});
  const head1=blanco?['NOMBRE COMPLETO','PUESTO']:['NO.\nTRAB.','NOMBRE COMPLETO','NSS'];
  dias.forEach(d=>{head1.push(d,'');});
  rows.push(mrow(head1.slice(0,nc))); styles.push(AS.h); hs.push({hpt:26});
  const head2=new Array(base).fill('');
  for(let i=0;i<6;i++)head2.push('ENTRADA','SALIDA');
  rows.push(mrow(head2.slice(0,nc))); styles.push(AS.h2); hs.push({hpt:12});
  const head3=new Array(base).fill('');
  for(let i=0;i<5;i++)head3.push(cfg.h1,cfg.h2);
  head3.push(cfg.h3,cfg.h4);
  rows.push(mrow(head3.slice(0,nc))); styles.push(AS.h3); hs.push({hpt:11});
  const wSt=[],bSt=[];
  const nameCol=blanco?0:1; // la columna del NOMBRE (con ajuste de texto para que no se corte)
  for(let c=0;c<nc;c++){
    let st;
    if(c>=base)st=AS.b;
    else if(c===nameCol)st=AS.wn;
    else if(c===0&&!blanco)st=AS.wc;
    else st=AS.w;
    wSt.push(st); bSt.push(AS.b);
  }
  /* La altura se reparte en el mismo espacio imprimible de siempre. Se reserva
     un mínimo de seis renglones para cuadrillas diminutas, sin estirar una sola
     firma hasta ocupar media hoja. Las hojas normales usan 6 a 11 renglones. */
  const plazas=blanco?10:Math.max(6,grupo.length);
  const altoFila=Math.round(347/plazas*10)/10;
  for(let i=0;i<plazas;i++){
    const w=grupo[i];
    if(w&&!blanco)rows.push(mrow([w.no_trab??'',fullName(w),w.nss||'']));
    else rows.push(mrow([]));
    styles.push(w&&!blanco?wSt:bSt); hs.push({hpt:altoFila});
  }
  rows.push(mrow([blanco?'TOTAL DE TRABAJADORES: ______':'TOTAL DE TRABAJADORES: '+grupo.length])); styles.push(AS.f); hs.push({hpt:15});
  rows.push(mrow([Number.isInteger(cfg.hoja)?`HOJA ${cfg.hoja}`:''])); styles.push(AS.pagina); hs.push({hpt:18});
  const last=nc-1;
  /* Cada dato del encabezado ocupa su renglón completo: la etiqueta en A:B y el
     valor de C hasta la última columna. Así la cuadrilla dispone de todo el ancho
     de la hoja y no hay forma de que se corte, por largo que sea el nombre. */
  const merges=[{s:{r:0,c:0},e:{r:0,c:last}},
    {s:{r:1,c:0},e:{r:1,c:1}},{s:{r:1,c:2},e:{r:1,c:last}},
    {s:{r:2,c:0},e:{r:2,c:1}},{s:{r:2,c:2},e:{r:2,c:last}},
    {s:{r:3,c:0},e:{r:3,c:1}},{s:{r:3,c:2},e:{r:3,c:last}},
    {s:{r:7+plazas,c:0},e:{r:7+plazas,c:last}},
    {s:{r:8+plazas,c:0},e:{r:8+plazas,c:last}}];
  for(let i=0;i<6;i++)merges.push({s:{r:4,c:base+i*2},e:{r:4,c:base+i*2+1}});
  for(let c=0;c<base;c++)merges.push({s:{r:4,c},e:{r:6,c}});
  /* ANCHOS (2026-08-27) · CARTA HORIZONTAL con márgenes de 0.25" = 10.5" útiles.
     En unidades de Excel eso son ~130 caracteres. Las columnas de datos se
     ajustan a SU contenido —ni cortan ni sobra— y TODO lo que sobra se reparte
     entre las 12 columnas de firma, que es donde de verdad hace falta espacio.
     Antes iban fijas en 5.8 y quedaban ~12 unidades de la hoja sin usar. */
  /* 117 es el presupuesto REAL, medido contra la lista que ya se imprimía bien:
     sus anchos sumaban 117 y Excel les agrega ~0.8 de relleno a cada columna,
     así que el archivo terminaba en ~129, que es justo lo que cabe en carta
     horizontal. Con 130 la hoja se pasaba a 11.5" y se partía en dos páginas. */
  const ANCHO_UTIL=117;
  const widths = blanco
    ? [ asAncho(['NOMBRE COMPLETO'],24,26), asAncho(['PUESTO'],14,16) ]
    : [ asAncho(['NO.','TRAB.'].concat(grupo.map(w=>w.no_trab)),4,5,1),
        /* El nombre lleva ajuste de texto y el renglón mide 38 pt: si alguno es
           larguísimo se parte en dos líneas y se lee igual, así que se acota
           para que el espacio sobrante se vaya a las firmas. */
        asAncho(['NOMBRE COMPLETO'].concat(grupo.map(w=>fullName(w))),16,24),
        asAncho(['NSS'].concat(grupo.map(w=>w.nss||'')),11,12,1) ];
  const sobra=Math.max(0,ANCHO_UTIL-widths.reduce((a,b)=>a+b,0));
  const wFirma=Math.max(5.8,Math.round((sobra/12)*10)/10);
  while(widths.length<nc)widths.push(wFirma);
  const ws=buildSheet(rows,styles,widths,merges,hs);
  // Margen superior amplio: baja todo el contenido para dejar el espacio en
  // blanco arriba (lado del encabezado) y poder perforar SIN tocar el encabezado.
  ws['!margins']={left:0.25,right:0.25,top:0.95,bottom:0.2,header:0.2,footer:0.1};
  return ws;
}
/* Nombre de hoja válido para Excel: 31 caracteres y sin \\ / ? * [ ] : */
function hojaNombre(base,usados){
  let n=String(base).replace(/[\\\/\?\*\[\]:]/g,'-').replace(/\s+/g,' ').trim().slice(0,31)||'LISTA';
  if(usados.has(n)){let i=2;while(usados.has((n.slice(0,28)+'~'+i)))i++;n=n.slice(0,28)+'~'+i;}
  usados.add(n); return n;
}
function exportAsistencia(){
  const sem=$('as-sem').value||semObra(), d1=$('as-d1').value, d2=$('as-d2').value;
  const extra=Math.max(0,parseInt($('as-extra').value)||0);
  /* ORDEN operativo de INFONAVIT SAN CRISTÓBAL: ARACELI → JP PLATINUM → LEO →
     MG → PLATINUM. Dentro de cada contratista se respeta orden/nombre de la
     cuadrilla y, dentro de ella, número de trabajador ascendente. */
  const grupos=asGruposCuadrilla(asActivosSemana(d1,d2));
  const act=grupos.flatMap(g=>g.gente);
  if(!act.length){toast('No hay trabajadores activos ni altas programadas para esa semana.','err');return;}
  // El encabezado ya no lleva empresa, registro patronal ni SIROC.
  const cfg={obra:OBRA.ubicacion||OBRA.nombre,
    periodo:`${rangoTexto(d1,d2)}   |   SEMANA ${sem}`, d1,
    h1:$('as-h1').value||'8:00', h2:$('as-h2').value||'17:00', h3:$('as-h3').value||'9:00', h4:$('as-h4').value||'13:00'};
  const wb=XLSX.utils.book_new(); const usados=new Set();
  wb.__asistencia=true;
  /* Páginas equilibradas dentro de cada cuadrilla, sin mezclar trabajadores de
     otras cuadrillas; la numeración es la misma que usa el directorio. */
  const paginas=asPaginas(grupos);
  paginas.forEach(p=>{
      const g=p.grupo,c2={...cfg,grupo:g,parte:p.partes>1?`${p.parte}/${p.partes}`:'',hoja:p.numero};
      const etq=(g.contratista+(g.cuadrilla?' '+g.cuadrilla:''))+(p.partes>1?` ${p.parte}`:'');
      XLSX.utils.book_append_sheet(wb,asSheet(p.gente,c2,false),hojaNombre(etq,usados));
  });
  for(let i=0;i<extra;i++)
    XLSX.utils.book_append_sheet(wb,asSheet([],{...cfg,hoja:paginas.length+i+1},true),hojaNombre(`NUEVO INGRESO ${i+1}`,usados));
  dl(wb,`LISTA_DE_ASISTENCIA_SEMANA_${sem}.xlsx`);
  const nCu=grupos.filter(g=>g.cuadrilla).length;
  const nPend=act.filter(w=>w.estatus==='PENDIENTE').length;
  toast(`Listas generadas: ${paginas.length} hojas (${grupos.length} grupo(s)${nCu?`, ${nCu} con cuadrilla`:''}) + ${extra} de nuevo ingreso${nPend?` · incluye ${nPend} sin expediente completo`:''}. Imprimir HORIZONTAL. Generando directorio...`,'ok');
  setTimeout(exportDirectorioExcel,600);
  setTimeout(exportDirectorio,1400);
}
function exportDirectorio(){
  const sem=$('as-sem')?($('as-sem').value||semObra()):semObra();
  const d1=$('as-d1')?$('as-d1').value:'', d2=$('as-d2')?$('as-d2').value:'';
  // mismo padrón que las listas (activos + altas programadas de la semana),
  // pero en orden alfabético para vigilancia
  const rango=d1&&d2?[d1,d2]:semRange(Number(sem));
  const act=asActivosSemana(rango[0],rango[1])
    .slice().sort((a,b)=>fullName(a).localeCompare(fullName(b),'es'));
  if(!act.length){toast('No hay trabajadores activos.','err');return;}
  const empKey='PLATINUM';
  const emp=CFGEMP['empresa_'+empKey]||{razon:'Comercializadora Platinum Hidalguense'};
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Directorio S${sem}</title>
  <style>
  body{font-family:'Segoe UI',Arial,sans-serif;margin:0;color:#111}
  .head{background:#1F3864;color:#fff;text-align:center;padding:12px 8px 8px}
  .head h1{margin:0;font-size:16px;letter-spacing:.5px}
  .head p{margin:4px 0 0;font-size:11px;color:#cdd8ee}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th{background:#2E75B6;color:#fff;padding:6px 10px;text-align:left;font-size:10.5px}
  th:last-child{text-align:center;width:130px}
  td{padding:4.5px 10px;border-bottom:1px solid #dfe6ef}
  td:last-child{text-align:center;font-weight:700;font-size:12.5px}
  tr:nth-child(even) td{background:#EBF3FB}
  .foot{font-size:9.5px;color:#666;text-align:center;padding:8px;background:#f2f6fc}
  @media print{.head{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  th,td,tr:nth-child(even) td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  thead{display:table-header-group}}
  </style></head><body>
  <div class="head"><h1>DIRECTORIO DE TRABAJADORES — ${esc(OBRA.nombre)}</h1>
  <p>${esc(OBRA.ubicacion||'')} · ${esc(emp.razon||'')} · Semana ${sem}</p></div>
  <table><thead><tr><th>NOMBRE COMPLETO DEL TRABAJADOR</th><th>NO. TRABAJADOR</th></tr></thead><tbody>
  ${act.map(w=>`<tr><td>${esc(fullName(w))}</td><td>${w.no_trab??'—'}</td></tr>`).join('')}
  </tbody></table>
  <div class="foot">Lista alfabética · Plantilla de la semana (${act.length}) · '—' = nuevo ingreso pendiente de número asignado · Generado el ${new Date().toLocaleDateString('es-MX')}</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`;
  const win=window.open('','_blank');
  if(!win){toast('Permite ventanas emergentes para generar el directorio.','err');return;}
  win.document.write(html);win.document.close();
  toast(`Directorio generado: ${act.length} trabajadores de la semana en orden alfabético. Guárdalo como PDF.`,'ok');
}

/* ---------- DIRECTORIO EN EXCEL (2026-08-28) ---------------------------
   El directorio impreso de vigilancia (arriba) solo trae nombre y número.
   Esta es la versión de trabajo: NOMBRE, NÚMERO, PUESTO, CONTRATISTA,
   CUADRILLA y HOJA de asistencia, para ubicar a alguien sin abrir la plataforma.

   El nombre va por APELLIDOS primero —que es como lo arma fullName() y como
   se busca en obra— y toda la hoja va alfabética por esos apellidos. Quien
   no trae cuadrilla NO se queda con la celda vacía: dice "Sin cuadrilla",
   para que se distinga de un dato que faltó capturar. */
const DIR_SIN_CUADRILLA='Sin cuadrilla';
function dirFilas(lista){
  return asPaginas(asGruposCuadrilla(lista)).flatMap(p=>p.gente.map(w=>({
    w,nombre:fullName(w),no:w.no_trab,puesto:w.puesto||'',
    contratista:p.grupo.contratista,
    cuadrilla:p.grupo.cuadrilla||DIR_SIN_CUADRILLA,hoja:p.numero
  }))).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
}
function exportDirectorioExcel(){
  const sem=$('as-sem')?($('as-sem').value||semObra()):semObra();
  const d1=$('as-d1')?$('as-d1').value:'', d2=$('as-d2')?$('as-d2').value:'';
  // mismo padrón que las listas de asistencia, para que no haya dos verdades
  const rango=d1&&d2?[d1,d2]:semRange(Number(sem));
  const base=asActivosSemana(rango[0],rango[1]);
  const filas=dirFilas(base);
  if(!filas.length){toast('No hay trabajadores activos para el directorio.','err');return;}
  const rows=[],styles=[],hs=[];
  rows.push(['DIRECTORIO DE TRABAJADORES','','','','','']); styles.push(ST.title); hs.push({hpt:26});
  rows.push([`${OBRA.nombre}${OBRA.ubicacion?' · '+OBRA.ubicacion:''} · Semana ${sem} · ${filas.length} trabajador(es)`,'','','','','']);
  styles.push(ST.sub); hs.push({hpt:18});
  rows.push(['NOMBRE COMPLETO','NO. TRABAJADOR','PUESTO','CONTRATISTA','CUADRILLA','HOJA']);
  styles.push(ST.head); hs.push({hpt:24});
  filas.forEach(f=>{
    rows.push([f.nombre, f.no??'—', f.puesto||'—', f.contratista, f.cuadrilla, f.hoja]);
    // el que no tiene cuadrilla se ve de un vistazo, sin tener que leer
    const sc=f.cuadrilla===DIR_SIN_CUADRILLA
      ? {...ST.cell,font:{sz:10,name:'Calibri',italic:true,color:{rgb:'8A6D1A'}},fill:{fgColor:{rgb:'FFF7E6'}}}
      : ST.cell;
    styles.push([ST.cell,ST.cellC,ST.cell,ST.cellC,sc,ST.cellC]); hs.push(null);
  });
  const merges=[{s:{r:0,c:0},e:{r:0,c:5}},{s:{r:1,c:0},e:{r:1,c:5}}];
  const ws=buildSheet(rows,styles,[38,14,26,18,26,9],merges,hs);
  ws['!margins']={left:0.4,right:0.4,top:0.5,bottom:0.4,header:0.2,footer:0.2};
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:2,c:0},e:{r:rows.length-1,c:5}})};
  ws['!freeze']={xSplit:0,ySplit:3};
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'DIRECTORIO');
  dl(wb,`DIRECTORIO_SEMANA_${sem}.xlsx`);
  const sinCu=filas.filter(f=>f.cuadrilla===DIR_SIN_CUADRILLA).length;
  toast(`Directorio en Excel: ${filas.length} trabajador(es)${sinCu?` · ${sinCu} sin cuadrilla asignada`:''}.`,'ok');
}

/* ---------- REVISAR FIRMAS DE LISTA ESCANEADA (v.10) ----------
   La app NO lee nombres de la foto: usa la lista que ella misma generó
   (nombres y orden por número). El usuario sube la foto de la hoja, marca
   las 4 esquinas del bloque de firmas (6 a 11 filas × N días), y por cada celda
   se mide la densidad de trazo: con tinta = firmó, en blanco = no firmó.
   Las celdas de firma salen EN BLANCO en la plantilla (los horarios impresos
   solo van en el encabezado), por eso cualquier trazo dentro = firma. */
function openRevisarFirmas(){
  const d1=$('as-d1')?$('as-d1').value:weekBounds()[0],d2=$('as-d2')?$('as-d2').value:weekBounds()[1];
  const paginas=asPaginas(asGruposCuadrilla(asActivosSemana(d1,d2)));
  const act=paginas.flatMap(p=>p.gente);
  window._RF={corners:[],nRows:paginas[0]?Math.max(6,paginas[0].gente.length):10,nDias:6,cut:120,thr:0.03,pag:0,d1,d2,paginas,actAll:act,workers:paginas[0]?paginas[0].gente:[]};
  const opts=paginas.map((p,i)=>`<option value="${i}">HOJA ${p.numero} — ${esc(p.grupo.contratista)}${p.grupo.cuadrilla?' · '+esc(p.grupo.cuadrilla):''}</option>`);
  modal(`
    <div class="m-head"><h2>🖊️ Revisar firmas de lista escaneada · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:10px">Sube la <b>foto de UNA hoja</b> de la lista de asistencia de ${esc(fmtD(d1))} a ${esc(fmtD(d2))}. Elige el mismo número de hoja que aparece impreso; solo detecta en qué celdas hay firma y en cuáles no. Ajusta la sensibilidad si hace falta; la cuadrícula azul muestra dónde está midiendo.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
        <div><label>¿Qué hoja es?</label><select id="rf-pag" onchange="rfSetPag()">${opts.join('')}</select></div>
        <div><label>Días en la hoja</label><input id="rf-dias" type="number" min="1" max="7" value="6" onchange="window._RF.nDias=Math.max(1,Math.min(7,parseInt(this.value)||6));rfRedraw()"></div>
        <div><input type="file" id="rf-file" accept="image/*" onchange="rfFile(this)"></div>
      </div>
      <div id="rf-hint" style="font-size:12px;color:var(--navy);margin:8px 0">Sube la foto para empezar.</div>
      <div style="overflow:auto;max-height:340px;border:1px solid var(--border);border-radius:8px;background:#fafafa"><canvas id="rf-cv" onclick="rfClick(event)" style="display:block;cursor:crosshair"></canvas></div>
      <div class="grid" style="grid-template-columns:1fr 1fr auto;gap:12px;align-items:center;margin-top:10px">
        <div><label style="font-size:11px">Sensibilidad (menos = exige más trazo): <b id="rf-thrv">0.030</b></label>
          <input type="range" min="0.01" max="0.12" step="0.005" value="0.03" oninput="window._RF.thr=parseFloat(this.value);$('rf-thrv').textContent=this.value;" onchange="if(window._RF.corners.length===4)rfAnalizar()"></div>
        <div><label style="font-size:11px">Umbral de oscuro: <b id="rf-cutv">120</b></label>
          <input type="range" min="80" max="170" step="5" value="120" oninput="window._RF.cut=parseInt(this.value);$('rf-cutv').textContent=this.value;" onchange="if(window._RF.corners.length===4)rfAnalizar()"></div>
        <div><button class="btn dark" onclick="rfAnalizar()">🔎 Analizar</button></div>
      </div>
      <div id="rf-out" style="margin-top:12px"></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">Cerrar</button></div>`,'lg');
}
function rfSetPag(){const i=parseInt($('rf-pag').value)||0;window._RF.pag=i;window._RF.workers=window._RF.paginas[i]?window._RF.paginas[i].gente:[];window._RF.nRows=Math.max(6,window._RF.workers.length);window._RF.corners=[];if($('rf-out'))$('rf-out').innerHTML='';rfRedraw();}
function rfFile(inp){
  const f=inp.files[0]; if(!f)return;
  const img=new Image();
  img.onload=()=>{
    const off=document.createElement('canvas');off.width=img.naturalWidth;off.height=img.naturalHeight;
    const octx=off.getContext('2d');octx.drawImage(img,0,0);
    let data;try{data=octx.getImageData(0,0,off.width,off.height);}catch(e){toast('No se pudo leer la imagen (¿formato raro?).','err');return;}
    window._RF.img=img;window._RF.natW=img.naturalWidth;window._RF.natH=img.naturalHeight;window._RF.data=data;window._RF.corners=[];
    rfRedraw();
    $('rf-hint').innerHTML='Haz clic en las <b>4 esquinas del bloque de firmas</b>, en orden: (1) arriba-izquierda, (2) arriba-derecha, (3) abajo-derecha, (4) abajo-izquierda. Marca solo el área de las casillas de firma (sin las columnas de nombre/NSS).';
  };
  img.onerror=()=>toast('No se pudo abrir la imagen.','err');
  img.src=URL.createObjectURL(f);
}
function rfMap(u,v){const c=window._RF.corners;
  const tx=c[0].x+(c[1].x-c[0].x)*u, ty=c[0].y+(c[1].y-c[0].y)*u;
  const bx=c[3].x+(c[2].x-c[3].x)*u, by=c[3].y+(c[2].y-c[3].y)*u;
  return {x:tx+(bx-tx)*v, y:ty+(by-ty)*v};
}
function rfRedraw(){
  const cv=$('rf-cv'); if(!cv||!window._RF.img)return;
  const maxW=Math.min(600,window._RF.natW), sc=maxW/window._RF.natW; window._RF.sc=sc;
  cv.width=Math.round(window._RF.natW*sc); cv.height=Math.round(window._RF.natH*sc);
  const ctx=cv.getContext('2d'); ctx.drawImage(window._RF.img,0,0,cv.width,cv.height);
  const cs=window._RF.corners;
  ctx.font='bold 13px sans-serif';
  cs.forEach((p,i)=>{const x=p.x*sc,y=p.y*sc;ctx.fillStyle='#e11';ctx.beginPath();ctx.arc(x,y,5,0,7);ctx.fill();ctx.fillText(String(i+1),x+7,y-7);});
  if(cs.length===4){
    const R=window._RF.nRows,C=window._RF.nDias*2;
    ctx.strokeStyle='rgba(11,87,208,.6)';ctx.lineWidth=1;
    for(let r=0;r<=R;r++){ctx.beginPath();for(let c=0;c<=C;c++){const p=rfMap(c/C,r/R);const x=p.x*sc,y=p.y*sc;c?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
    for(let c=0;c<=C;c++){ctx.beginPath();for(let r=0;r<=R;r++){const p=rfMap(c/C,r/R);const x=p.x*sc,y=p.y*sc;r?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
  }
}
function rfClick(ev){
  if(!window._RF.img)return;
  const cv=$('rf-cv'),rect=cv.getBoundingClientRect(),sc=window._RF.sc;
  const x=(ev.clientX-rect.left)/sc, y=(ev.clientY-rect.top)/sc;
  if(window._RF.corners.length>=4)window._RF.corners=[];
  window._RF.corners.push({x,y}); rfRedraw();
  if(window._RF.corners.length===4)$('rf-hint').innerHTML='4 esquinas marcadas. Revisa que la <b>cuadrícula azul</b> caiga sobre las casillas. Si no, haz clic para reiniciar. Luego pulsa <b>Analizar</b>.';
}
function rfInkCell(r,c,R,C){
  const d=window._RF.data,W=window._RF.natW,H=window._RF.natH,cut=window._RF.cut;
  const cen=rfMap((c+0.5)/C,(r+0.5)/R);
  const a=rfMap(c/C,r/R),b=rfMap((c+1)/C,r/R),e=rfMap(c/C,(r+1)/R);
  const cw=Math.hypot(b.x-a.x,b.y-a.y),ch=Math.hypot(e.x-a.x,e.y-a.y);
  const hw=Math.max(2,cw*0.30),hh=Math.max(2,ch*0.32);
  const stepX=Math.max(1,Math.round(hw/12)),stepY=Math.max(1,Math.round(hh/12));
  let dark=0,tot=0;
  for(let dy=-hh;dy<=hh;dy+=stepY)for(let dx=-hw;dx<=hw;dx+=stepX){
    const x=Math.round(cen.x+dx),y=Math.round(cen.y+dy);
    if(x<0||y<0||x>=W||y>=H)continue;
    const i=(y*W+x)*4, lum=0.299*d.data[i]+0.587*d.data[i+1]+0.114*d.data[i+2];
    tot++; if(lum<cut)dark++;
  }
  return tot?dark/tot:0;
}
function rfAnalizar(){
  if(!window._RF.data){toast('Sube primero la foto de la hoja.','err');return;}
  if(window._RF.corners.length!==4){toast('Marca las 4 esquinas del bloque de firmas.','err');return;}
  const R=window._RF.nRows,nD=window._RF.nDias,C=nD*2,ws=window._RF.workers,thr=window._RF.thr;
  const DN=['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'].slice(0,nD);
  const faltan=DN.map(()=>[]);
  let body='';
  for(let r=0;r<R;r++){
    const w=ws[r]; let cells='';
    for(let dd=0;dd<nD;dd++){
      const firmo=Math.max(rfInkCell(r,2*dd,R,C),rfInkCell(r,2*dd+1,R,C))>thr;
      if(w&&!firmo)faltan[dd].push(fullName(w));
      cells+=`<td style="text-align:center;font-weight:700;color:${firmo?'var(--green)':'var(--red)'}">${w?(firmo?'✓':'✗'):''}</td>`;
    }
    body+=`<tr><td style="font-size:11px;white-space:nowrap">${w?esc(fullName(w)):'<span style="color:var(--mut)">(fila '+(r+1)+')</span>'}</td>${cells}</tr>`;
  }
  // La revisión de una lista histórica no debe mezclar altas de hoy.
  const nuevos=window._RF.actAll.filter(w=>(w.fecha_alta>=window._RF.d1&&w.fecha_alta<=window._RF.d2)
    ||(w.fecha_reingreso>=window._RF.d1&&w.fecha_reingreso<=window._RF.d2));
  const nuevosHtml=nuevos.length?`<div class="sect">🆕 Ingresos de la semana revisada — solicitar documentación</div>`+
    nuevos.map(w=>{const ok=(typeof docsOk==='function')?docsOk(w):0,tot=(typeof DOCS!=='undefined')?DOCS.length:7;
      const ingreso=w.fecha_reingreso>=window._RF.d1&&w.fecha_reingreso<=window._RF.d2?w.fecha_reingreso:w.fecha_alta;
      return `<div class="kv"><b>${esc(fullName(w))}</b><span>ingreso ${fmtD(ingreso)} · <b style="color:${ok<tot?'var(--red)':'var(--green)'}">${ok}/${tot} docs</b></span></div>`;}).join(''):
    '<div class="sect">🆕 Ingresos de la semana</div><div style="color:var(--mut);font-size:12px">Sin ingresos en la semana revisada.</div>';
  const resumen=DN.map((dn,i)=>`<div class="kv"><b>${dn}</b><span>${faltan[i].length?('<b style="color:var(--red)">'+faltan[i].length+' sin firma</b>: '+faltan[i].map(esc).join(', ')):'<b style="color:var(--green)">todos firmaron</b>'}</span></div>`).join('');
  $('rf-out').innerHTML=`
    <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr><th style="text-align:left;padding:4px 6px;border-bottom:2px solid var(--border)">TRABAJADOR</th>${DN.map(d=>`<th style="padding:4px 6px;border-bottom:2px solid var(--border)">${d}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody></table></div>
    <div class="sect">Resumen: quién NO firmó cada día</div>${resumen}
    ${nuevosHtml}
    <p style="font-size:11px;color:var(--mut);margin-top:10px">✓ = se detectó trazo en la casilla · ✗ = casilla en blanco. Si ves errores, ajusta la <b>sensibilidad</b> o el <b>umbral de oscuro</b> y vuelve a analizar. Verifica siempre contra la hoja física antes de descontar.</p>`;
}

