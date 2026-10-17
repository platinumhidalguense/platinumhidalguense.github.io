/* ---------- v34: REPORTE DE DOCUMENTACIÓN (por obra) ----------
   Se elige PRIMERO la obra. Las obras de campo (Bienestar, Jardines) se
   separan por SEMANA DE INGRESO (secciones); las de oficina (tipo OFICINA)
   salen en una lista general sin semanas. La semana se calcula con la fecha
   de inicio de la obra; se protege contra semanas <1 (agrupadas como
   "S1 o anterior") para que nunca aparezcan semanas negativas. */
function rdSemDe(o,w){
  if(!w.fecha_alta)return null;
  const n=isoWeekDe(o,new Date(w.fecha_alta+'T12:00'));
  return (n==null||isNaN(n))?null:Math.max(1,n); // nunca negativa ni cero
}
async function openReporteDocs(){
  toast('Cargando trabajadores...');
  const {data:tw,error}=await fetchAllRows(()=>sb.from('trabajadores').select('*').in('obra_id',obrasEmpresa(EMPRESA_ACTIVA).map(o=>o.id)).eq('eliminado',false).eq('estatus','ACTIVO'));
  if(error){toast('Error: '+error.message,'err');return;}
  window._RDOCS=tw||[];
  modal(`
    <div class="m-head"><h2>📋 Reporte de documentación</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);margin-bottom:12px;font-size:12.5px">Una <b>columna por documento</b> del expediente: <b style="color:var(--green)">COMPLETO</b> si está entregado, <b style="color:var(--red)">FALTANTE</b> en rojo si le falta, NO APLICA en gris. Elige la obra: las de campo se separan <b>por semana de ingreso</b>; oficina sale en lista general.</p>
      <div class="grid" style="grid-template-columns:1fr;gap:10px">
        <div><label>Obra *</label>
          <select id="rd-obra" onchange="rdObraCambia()">
            <option value="">— elige una obra —</option>
            ${OBRAS.map(o=>{const n=(tw||[]).filter(w=>w.obra_id===o.id).length;return `<option value="${o.id}">${esc(o.nombre)} (${n} activos)${o.tipo==='OFICINA'?' · oficina':''}</option>`;}).join('')}
          </select></div>
      </div>
      <div id="rd-semwrap" style="margin-top:12px"></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn dark" onclick="exportReporteDocs()">⬇ Generar Excel de documentación</button>
    </div>`,'lg');
}
function rdObraCambia(){
  const oid=$('rd-obra').value, o=OBRAS.find(x=>x.id===oid), tw=window._RDOCS||[];
  const wrap=$('rd-semwrap'); if(!o){wrap.innerHTML='';return;}
  if(o.tipo==='OFICINA'){
    const n=tw.filter(w=>w.obra_id===oid).length;
    wrap.innerHTML=`<div class="fhint">Oficina: el reporte saldrá como <b>lista general</b> (sin separar por semana), con sus ${n} activos.</div>`;
    return;
  }
  const gente=tw.filter(w=>w.obra_id===oid);
  const semanas=[...new Set(gente.map(w=>rdSemDe(o,w)).filter(n=>n!=null))].sort((a,b)=>a-b);
  wrap.innerHTML=`
    <div class="sect">Semanas de ingreso — desmarca las que no quieras</div>
    <div style="margin-bottom:6px">
      <a href="#" onclick="document.querySelectorAll('.rd-sem').forEach(c=>c.checked=true);return false">todas</a> ·
      <a href="#" onclick="document.querySelectorAll('.rd-sem').forEach(c=>c.checked=false);return false">ninguna</a>
    </div>
    <div style="max-height:160px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px">
      ${semanas.map(nn=>{const cnt=gente.filter(w=>rdSemDe(o,w)===nn).length;
        return `<label style="display:inline-block;min-width:150px;padding:3px 6px;font-size:12.5px"><input type="checkbox" class="rd-sem" value="${nn}" checked> Semana ${nn} <span style="color:var(--mut)">(${cnt})</span></label>`;}).join('')||'<span style="color:var(--mut)">Sin trabajadores con semana de ingreso.</span>'}
    </div>`;
}
function exportReporteDocs(){
  const oid=$('rd-obra').value, o=OBRAS.find(x=>x.id===oid), tw=window._RDOCS||[];
  if(!o){toast('Elige primero una obra.','err');return;}
  const esOficina=o.tipo==='OFICINA';
  let gente=tw.filter(w=>w.obra_id===oid);
  if(!esOficina){
    const sel=new Set([...document.querySelectorAll('.rd-sem')].filter(c=>c.checked).map(c=>parseInt(c.value)));
    gente=gente.filter(w=>{const s=rdSemDe(o,w);return s==null?true:sel.has(s);});
  }
  if(!gente.length){toast('No hay trabajadores con ese filtro.','err');return;}
  const stOK={font:{sz:9.5,bold:true,color:{rgb:'0F7B4D'},name:'Calibri'},fill:{fgColor:{rgb:'E6F4EE'}},border:BORD,alignment:{horizontal:'center',vertical:'center'}};
  const stFalta={font:{sz:9.5,bold:true,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'B3261E'}},border:BORD,alignment:{horizontal:'center',vertical:'center'}};
  const stNA={font:{sz:9.5,color:{rgb:'6B7482'},name:'Calibri'},fill:{fgColor:{rgb:'EEF1F5'}},border:BORD,alignment:{horizontal:'center',vertical:'center'}};
  const rows=[],styles=[]; const nDoc=DOCS.length; const lastCol=5+nDoc+2;
  rows.push([`REPORTE DE DOCUMENTACIÓN — ${o.nombre} — ${new Date().toLocaleDateString('es-MX')}`]); styles.push(ST.title);
  rows.push(['NO.','NOMBRE COMPLETO','CONTRATISTA','PUESTO','SEM. ING.',...DOCS,'ENTREGADOS','% COMPLETO']); styles.push(ST.head);
  const merges=[{s:{r:0,c:0},e:{r:0,c:lastCol}}];
  let tOk=0,tTot=0;
  const filaTrab=w=>{
    const d=w.docs||{}, s=rdSemDe(o,w); const cels=[],est=[]; let ent=0;
    DOCS.forEach(k=>{const v=d[k];
      if(v==='ENTREGADO'){cels.push('COMPLETO');est.push(stOK);ent++;}
      else if(v==='NO APLICA'){cels.push('NO APLICA');est.push(stNA);}
      else{cels.push('FALTANTE');est.push(stFalta);}});
    if(ent===nDoc)tOk++; tTot++;
    rows.push([w.no_trab??'',fullName(w),w.contratista||'',w.puesto||'',s!=null?('S'+s):'—',...cels,`${ent}/${nDoc}`,Math.round(ent/nDoc*100)/100]);
    styles.push([ST.cellC,ST.cell,ST.cell,ST.cell,ST.cellC,...est,ST.cellC,{...ST.cellC,numFmt:'0%'}]);
  };
  const seccion=txt=>{merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:lastCol}});rows.push([txt]);styles.push(ST.sect);};
  if(esOficina){
    gente.sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9)).forEach(filaTrab);
  }else{
    // secciones por semana de ingreso
    const porSem={};gente.forEach(w=>{const s=rdSemDe(o,w)??0;(porSem[s]=porSem[s]||[]).push(w);});
    Object.keys(porSem).map(Number).sort((a,b)=>a-b).forEach(s=>{
      const g=porSem[s].sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
      const okSem=g.filter(w=>DOCS.every(k=>(w.docs||{})[k]==='ENTREGADO'||(w.docs||{})[k]==='NO APLICA')).length;
      seccion(`◆  SEMANA ${s}  —  ${g.length} trabajador(es)`);
      g.forEach(filaTrab);
    });
  }
  merges.push({s:{r:rows.length,c:0},e:{r:rows.length,c:lastCol}});
  rows.push([`TOTAL: ${tTot} activos · ${tOk} con expediente COMPLETO · ${tTot-tOk} con documentos FALTANTES`]); styles.push(ST.sub);
  const widths=[7,32,16,20,9,...DOCS.map(()=>13),12,12];
  const ws=buildSheet(rows,styles,widths,merges,[{hpt:26},{hpt:34}]);
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:1,c:0},e:{r:1,c:lastCol}})};
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,('DOC '+o.nombre).slice(0,31).replace(/[\\\/\?\*\[\]:]/g,' '));
  dl(wb,`REPORTE_DOCUMENTACION_${o.nombre.replace(/[^A-ZÑ0-9]+/gi,'_')}_${today()}.xlsx`);
  closeModal();
  toast(`Reporte de ${o.nombre}: ${tTot} activos, ${tOk} con expediente completo.`,'ok');
}

