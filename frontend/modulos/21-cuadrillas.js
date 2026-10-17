/* ============================================================
   CUADRILLAS · grupos de trabajo dentro de un contratista (Script 56)
   Es OPCIONAL: un contratista sin cuadrillas se comporta exactamente igual que
   antes. La cuadrilla pertenece a UNA obra, así que aquí solo se ven las de la
   obra abierta — igual que el resto de los datos.
   ============================================================ */
const cuadDe=w=>(w&&w.id_cuadrilla)?(CUADS||[]).find(c=>c.id===w.id_cuadrilla)||null:null;
const cuadNombre=w=>{const c=cuadDe(w);return c?c.nombre:'';};
/* La cabeza puede ser un trabajador del padrón o un cabo externo con expediente
   entregado. El segundo caso solo identifica al responsable operativo de la
   cuadrilla: no lo incorpora al motor de nómina ni a la lista de personas pagables. */
const cuadLider=c=>{
  if(!c)return '';
  if(c.lider_id){
    const l=(WORKERS||[]).find(x=>x.id===c.lider_id);
    if(l)return fullName(l);
  }
  return String(c.lider_nombre_externo||'').trim();
};
const cuadsDe=contr=>(CUADS||[]).filter(c=>String(c.contratista||'').toUpperCase()===String(contr||'').toUpperCase())
  .sort((a,b)=>(a.orden??9999)-(b.orden??9999)||String(a.nombre).localeCompare(String(b.nombre),'es'));

/* Ordena y agrupa para las listas de asistencia:
     1) contratista, alfabético estricto
     2) cuadrilla (las que no tienen, al final de su contratista)
     3) nombre del trabajador dentro de la cuadrilla
   Devuelve [{contratista, cuadrilla, lider, gente:[...]}] — mismo criterio que
   fn_lista_asistencia() del Script 56, para que Excel y base no se contradigan. */
function asGruposCuadrilla(lista){
  const ordenContratista=['ARACELI','JP PLATINUM','LEO','MG','PLATINUM'];
  const CT=w=>String(w.contratista||'').trim().toUpperCase()||'ZZZ SIN CONTRATISTA';
  const mapa=new Map();
  (lista||[]).forEach(w=>{
    const c=cuadDe(w);
    const k=CT(w)+'\u0000'+(c?(String(c.orden??9999).padStart(4,'0')+'\u0000'+c.nombre):'ZZZZ\u0000');
    if(!mapa.has(k))mapa.set(k,{contratista:String(w.contratista||'').trim()||'(sin contratista)',
      cuadrilla:c?c.nombre:'', cuad_id:c?c.id:null, lider:c?cuadLider(c):'',orden:c?(c.orden??9999):9999,gente:[]});
    mapa.get(k).gente.push(w);
  });
  const rango=c=>{const i=ordenContratista.indexOf(String(c||'').trim().toUpperCase());return i<0?999:i;};
  const out=[...mapa.values()].sort((a,b)=>rango(a.contratista)-rango(b.contratista)
    ||String(a.contratista).localeCompare(String(b.contratista),'es')
    ||(a.orden??9999)-(b.orden??9999)
    ||String(a.cuadrilla).localeCompare(String(b.cuadrilla),'es'));
  /* ORDEN DENTRO DE LA CUADRILLA (2026-08-27): por NÚMERO DE TRABAJADOR, de menor
     a mayor. Antes iba alfabético por apellidos, que no corresponde a nada físico;
     el número sí es el que se usa para pasar lista y para cruzar contra nómina.
     Los que no tienen número van al final, y entre ellos sí por nombre.
     La misma regla vive en fn_lista_asistencia() (Script 56/59) para que el Excel
     y la base no se contradigan. */
  out.forEach(g=>g.gente.sort((a,b)=>
    ((a.no_trab??9e9)-(b.no_trab??9e9)) || fullName(a).localeCompare(fullName(b),'es')));
  return out;
}
/* Secuencia física compartida por las listas, el directorio y la revisión de
   firmas. Conserva intactos el orden y la pertenencia a cada cuadrilla.
   Los remanentes de 1 a 5 se absorben en páginas de hasta 11; si no caben,
   se equilibran en el mínimo número de páginas sin dejar una hoja casi vacía.
   Los remanentes de 6 a 9 mantienen su propia hoja. */
function asPaginas(grupos){
  const paginas=[];
  (grupos||[]).forEach(grupo=>{
    const n=grupo.gente.length,resto=n%10;
    const partes=Math.max(1,resto>=6?Math.ceil(n/10):Math.ceil(n/11));
    let desde=0;
    for(let i=0;i<partes;i++){
      const tam=resto>=6?(i<partes-1?10:resto):Math.floor(n/partes)+(i<n%partes?1:0);
      paginas.push({grupo,gente:grupo.gente.slice(desde,desde+tam),
        parte:i+1,partes,numero:paginas.length+1});
      desde+=tam;
    }
  });
  return paginas;
}

/* ---------- ADMINISTRAR CUADRILLAS ---------- */
function openCuadrillas(){
  const cs=(CUADS||[]).filter(c=>c.activa!==false).slice().sort((a,b)=>String(a.contratista).localeCompare(String(b.contratista),'es')
    ||(a.orden??9999)-(b.orden??9999)||String(a.nombre).localeCompare(String(b.nombre),'es'));
  const cuenta=id=>(WORKERS||[]).filter(w=>w.id_cuadrilla===id&&w.estatus==='ACTIVO').length;
  const contrs=[...new Set((WORKERS||[]).map(w=>String(w.contratista||'').trim()).filter(Boolean))].sort();
  modal(`
    <div class="m-head"><h2>👷 Cuadrillas · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Los contratistas grandes reparten a su gente en <b>cuadrillas</b> con una <b>cabeza</b>. Es opcional: el contratista que no las use se queda igual. Las listas de asistencia salen <b>una hoja por cuadrilla</b>.</p>
      <div class="grid" style="grid-template-columns:1.1fr 1.4fr 1.6fr .6fr auto;gap:8px;align-items:end">
        <div><label>Contratista</label><input id="cu-contr" list="dl-contr-cu" placeholder="MG">
          <datalist id="dl-contr-cu">${contrs.map(c=>`<option>${esc(c)}</option>`).join('')}</datalist></div>
        <div><label>Nombre de la cuadrilla</label><input id="cu-nom" placeholder="ALBAÑILES"></div>
        <div><label>Cabeza (opcional)</label>
          <select id="cu-lider"><option value="">— sin asignar —</option>
            ${(WORKERS||[]).filter(w=>w.estatus==='ACTIVO').sort((a,b)=>fullName(a).localeCompare(fullName(b),'es'))
              .map(w=>`<option value="${w.id}">${esc(fullName(w))}</option>`).join('')}</select></div>
        <div><label>Orden</label><input id="cu-orden" type="number" min="1" placeholder="1"></div>
        <div><button class="btn dark" onclick="guardarCuadrilla()">➕ Agregar</button></div>
      </div>
      <div class="sect" style="margin-top:16px">Cuadrillas registradas (${cs.length})</div>
      ${cs.length?`<table class="tb"><thead><tr><th>Contratista</th><th>Cuadrilla</th><th>Cabeza</th><th style="text-align:right">Activos</th><th></th></tr></thead><tbody>
        ${cs.map(c=>`<tr><td><b>${esc(c.contratista)}</b></td><td>${esc(c.nombre)}</td>
          <td>${esc(cuadLider(c)||'—')}</td><td style="text-align:right">${cuenta(c.id)}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn" style="padding:3px 8px" onclick="openEditCuadrilla('${c.id}')" title="Cambiar nombre, cabeza u orden">✎</button>
            <button class="btn" style="padding:3px 8px" onclick="borrarCuadrilla('${c.id}')" title="Borrar">🗑</button></td></tr>`).join('')}
        </tbody></table>`:'<div class="empty"><div class="big">👷</div>Todavía no hay cuadrillas en esta obra.</div>'}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn" onclick="openImportCuadrillas()">📄 Importar del PDF del contratista</button>
    </div>`,'lg');
}
async function guardarCuadrilla(){
  const obraId=OBRA.id;
  const contr=($('cu-contr').value||'').trim().toUpperCase();
  const nom=($('cu-nom').value||'').trim().toUpperCase();
  if(!contr||!nom){toast('Falta el contratista o el nombre de la cuadrilla.','err');return;}
  const {error}=await sb.from('cuadrillas').insert({obra_id:obraId,contratista:contr,nombre:nom,
    lider_id:$('cu-lider').value||null, orden:parseInt($('cu-orden').value)||null, creado_por:USER.email});
  if(error){toast(/ux_cuadrilla/.test(error.message)?`Ya existe una cuadrilla "${nom}" de ${contr} en esta obra.`:'Error: '+error.message,'err');return;}
  const {data,error:recargaError}=await fetchAllRows(()=>sb.from('cuadrillas').select('*').eq('obra_id',obraId));
  if(OBRA?.id!==obraId)return;
  if(recargaError){toast('La cuadrilla sí se guardó, pero faltó actualizar la lista. Recarga el centro; no la vuelvas a crear.','err');return;}
  CUADS=data||CUADS;
  toast(`Cuadrilla ${nom} de ${contr} creada.`,'ok');
  openCuadrillas();
}
/* Editar una cuadrilla: nombre, cabeza, orden y si sigue activa.
   Cambiar el nombre NO desasigna a nadie: la gente apunta al id, no al texto. */
function openEditCuadrilla(id){
  const c=(CUADS||[]).find(x=>x.id===id); if(!c){toast('Esa cuadrilla ya no existe.','err');return;}
  const gente=(WORKERS||[]).filter(w=>w.id_cuadrilla===id);
  /* La cabeza se elige entre la gente de ESA cuadrilla, o entre los del mismo
     contratista si aún no tiene a nadie asignado. */
  const cands=(gente.length?gente:(WORKERS||[]).filter(w=>String(w.contratista||'').trim().toUpperCase()===String(c.contratista||'').trim().toUpperCase()))
    .filter(w=>w.estatus!=='BAJA').sort((a,b)=>(a.no_trab||9e9)-(b.no_trab||9e9));
  modal2(`
    <div class="m-head"><h2>✎ ${esc(c.contratista)} · ${esc(c.nombre)}</h2><button class="x" onclick="closeModal2()">×</button></div>
    <div class="m-body">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Nombre de la cuadrilla</label><input id="ec-nom" value="${esc(c.nombre)}"></div>
        <div><label>Orden en las listas</label><input id="ec-orden" type="number" min="1" value="${c.orden??''}" placeholder="1"></div>
      </div>
      <div class="fld" style="margin-top:10px"><label>Cabeza de la cuadrilla</label>
        <select id="ec-lider"><option value="">— sin asignar —</option>
          ${cands.map(w=>`<option value="${w.id}" ${w.id===c.lider_id?'selected':''}>#${w.no_trab??'—'} · ${esc(fullName(w))}</option>`).join('')}</select>
        <div class="fhint">${gente.length?`Se elige entre los ${gente.length} de esta cuadrilla.`:`Todavía no hay nadie asignado: se listan los de ${esc(c.contratista)}.`}</div></div>
      <div class="fld" style="margin-top:10px"><label>Estado</label>
        <select id="ec-activa"><option value="1" ${c.activa!==false?'selected':''}>Activa</option><option value="0" ${c.activa===false?'selected':''}>Inactiva (no sale en listas ni en el alta)</option></select></div>
      <div class="kv" style="margin-top:12px"><b>Gente asignada</b><span>${gente.length?gente.map(w=>`#${w.no_trab??'—'} ${esc(fullName(w))}`).join(' · '):'<span style="color:var(--mut)">nadie todavía</span>'}</span></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal2()">Cancelar</button>
      <button class="btn dark" onclick="guardarEditCuadrilla('${id}')">Guardar cambios</button>
    </div>`,'md');
}
async function guardarEditCuadrilla(id){
  const obraId=OBRA.id;
  const nom=($('ec-nom').value||'').trim().toUpperCase();
  if(!nom){toast('La cuadrilla necesita un nombre.','err');return;}
  const fila={nombre:nom, lider_id:$('ec-lider').value||null,
    orden:parseInt($('ec-orden').value)||null, activa:$('ec-activa').value==='1',
    updated_at:new Date().toISOString()};
  const {error}=await sb.from('cuadrillas').update(fila).eq('id',id).eq('obra_id',obraId);
  if(error){toast(/ux_cuadrilla/.test(error.message)?`Ya hay otra cuadrilla con el nombre "${nom}" en ese contratista.`:'Error: '+error.message,'err');return;}
  const {data,error:recargaError}=await fetchAllRows(()=>sb.from('cuadrillas').select('*').eq('obra_id',obraId));
  if(OBRA?.id!==obraId)return;
  if(recargaError){toast('La cuadrilla sí se actualizó, pero faltó refrescar la lista. Recarga el centro.','err');return;}
  CUADS=data||CUADS;
  closeModal2(); openCuadrillas();
  toast('Cuadrilla actualizada.','ok');
}
async function borrarCuadrilla(id){
  const c=(CUADS||[]).find(x=>x.id===id); if(!c)return;
  const n=(WORKERS||[]).filter(w=>w.id_cuadrilla===id).length;
  if(!confirm(`¿Borrar la cuadrilla ${c.contratista} · ${c.nombre}?` +
    (n?`\n\n${n} trabajador(es) quedarán SIN cuadrilla. No se borra a nadie.`:'')))return;
  const {error}=await sb.from('cuadrillas').delete().eq('id',id);
  if(error){toast('Error: '+error.message,'err');return;}
  CUADS=(CUADS||[]).filter(x=>x.id!==id);
  (WORKERS||[]).forEach(w=>{if(w.id_cuadrilla===id)w.id_cuadrilla=null;});
  toast('Cuadrilla borrada.','ok'); openCuadrillas();
}

/* ============================================================
   IMPORTAR CUADRILLAS DESDE EL PDF DEL CONTRATISTA
   El contratista manda su gente repartida en cuadrillas, con encabezados del
   estilo "ALBAÑILES - RICARDO" y debajo los nombres. Vienen con erratas, así que
   el emparejamiento es DIFUSO contra el padrón.
   NO toca el contratista de nadie: el PDF entero es de un solo contratista y ese
   dato ya está bien capturado. Solo asigna CUADRILLA, y nada se guarda hasta que
   se revisa y se confirma en pantalla.
   ============================================================ */
const _sinAc=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/Ñ/g,'N').replace(/ñ/g,'n').toUpperCase();
/* Palabras que no ayudan a identificar a nadie */
const _RUIDO=new Set(['DE','DEL','LA','LAS','LOS','Y','SR','SRA','C','EL']);
function _tokens(nom){
  return _sinAc(nom).replace(/[^A-Z0-9 ]/g,' ').split(/\s+/)
    .filter(t=>t.length>1&&!_RUIDO.has(t));
}
/* Distancia de Levenshtein con dos filas (barata en memoria) */
function _lev(a,b){
  if(a===b)return 0;
  if(!a.length)return b.length; if(!b.length)return a.length;
  let prev=Array.from({length:b.length+1},(_,i)=>i), cur=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){
    cur[0]=i;
    for(let j=1;j<=b.length;j++){
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
    }
    [prev,cur]=[cur,prev];
  }
  return prev[b.length];
}
const _simPal=(a,b)=>{const m=Math.max(a.length,b.length);return m?1-_lev(a,b)/m:0;};
/* Parecido entre dos nombres completos: se comparan TOKEN a TOKEN sin importar el
   orden (el PDF a veces pone "NOMBRE APELLIDO" y la base "APELLIDO NOMBRE") y se
   penaliza que sobren o falten palabras. */
function simNombre(a,b){
  const A=_tokens(a), B=_tokens(b);
  if(!A.length||!B.length)return 0;
  const [chico,grande]=A.length<=B.length?[A,B]:[B,A];
  const usados=new Array(grande.length).fill(false);
  let suma=0;
  for(const t of chico){
    let mejor=0,idx=-1;
    grande.forEach((u,i)=>{if(usados[i])return;const sc=_simPal(t,u);if(sc>mejor){mejor=sc;idx=i;}});
    if(idx>=0&&mejor>=0.6){usados[idx]=true;suma+=mejor;}
  }
  // promedio sobre el nombre MÁS LARGO: así "JUAN" no empata al 100% con "JUAN PEREZ LOPEZ"
  return suma/grande.length;
}
/* Lee el PDF y arma [{cuadrilla, lider, nombres:[...]}].
   Un renglón es ENCABEZADO si trae guion/dos puntos y su parte izquierda parece
   un oficio (ALBAÑILES, BLOQUEROS...), o si viene en una sola palabra en plural. */
/* Mayúsculas y espacios parejos, pero CONSERVANDO la Ñ y los acentos: esto es el
   nombre que se va a guardar y a imprimir ("ALBAÑILES", no "ALBANILES"). */
const _limpNom=t=>String(t||'').replace(/\s+/g,' ').trim().toUpperCase();
/* Palabras del papeleo que NUNCA son una cuadrilla, aunque vengan con guion o
   dos puntos: "OBRA: INFONAVIT...", "RELACION DE PERSONAL - CONTRATISTA MG". */
const _NO_CUADRILLA=new Set(['RELACION','PERSONAL','LISTA','LISTADO','OBRA','FECHA','CONTRATISTA',
  'EMPRESA','DIRECCION','DOMICILIO','TELEFONO','TOTAL','PAGINA','HOJA','NOMBRE','NOMBRES','PUESTO',
  'SEMANA','NOTA','NOTAS','OBSERVACIONES','RFC','NSS','CURP','FIRMA','REGISTRO','PATRONAL','SIROC']);
/* Oficios que el contratista escribe DESPUÉS del nombre, en el mismo renglón:
   "Ivan Palafox Vite albañileria", "Juan Hernandez Ayudante gral.".
   Se recortan para que no ensucien la comparación de nombres. */
const _PUESTOS=new Set(['CABEZA','AYUDANTE','AYUDANTES','GRAL','GRAL.','GENERAL','OFICIAL','ALBANIL',
  'ALBANILES','ALBANILERIA','BLOQUERO','BLOQUEROS','CARPINTERO','CARPINTEROS','COLADOR','COLADORES',
  'BOQUILLERO','BOQUILLEROS','PASTERO','PASTEROS','FIERRERO','FIERREROS','ELECTRICO','ELECTRICOS',
  'EXCAVADOR','EXCAVADORES','YESERO','YESEROS','LOSETERO','LOSETEROS','PLOMERO','PLOMEROS','PULIDOR',
  'PULIDORES','RESIDENTE','OPERADOR','LIMPIEZA','PRACTICANTE','ALMACEN','ALMACENISTA','SOLDADOR',
  'VELADOR','CHOFER','JARDINERO','TOPOGRAFO','CABO','MAESTRO','SUPERVISOR','AUXILIAR','INTENDENCIA']);
const _NEXO=new Set(['DE','DEL','LA','LAS','LOS']);
/* Quita el puesto del final del renglón y dice si esa persona es la CABEZA.
   Nunca recorta por debajo de 2 palabras: más vale dejar basura que borrar el
   apellido de alguien. */
function _quitaPuesto(linea){
  let w=String(linea||'').replace(/\s+/g,' ').trim().split(' ');
  let cabeza=false, corto=false;
  while(w.length>2){
    const u=_sinAc(w[w.length-1]).replace(/\./g,'');
    if(_PUESTOS.has(u)||_PUESTOS.has(u+'.')){
      if(u==='CABEZA')cabeza=true;
      w.pop(); corto=true; continue;
    }
    // "residente DE almacén": el nexo solo se quita si ya se recortó algo después
    if(corto&&_NEXO.has(u)){w.pop();continue;}
    break;
  }
  return {nombre:w.join(' ').trim(), cabeza};
}
const _esOficio=izq=>{
  const t=_tokens(izq);
  if(!t.length||t.some(x=>_NO_CUADRILLA.has(x)))return false;
  // un oficio es una palabra sola (ALBAÑILES) o varias que terminan en plural
  return t.length===1||/(ES|OS|AS)$/.test(_sinAc(t[t.length-1]));
};
/* Lee el texto del PDF y arma [{cuadrilla, lider, nombres:[{nombre,cabeza}]}].
   El nombre de la cuadrilla es el ENCABEZADO COMPLETO ("ALBAÑILES - RICARDO"),
   porque el contratista repite el oficio con distinta cabeza: hay cuatro
   CARPINTEROS y sin el líder no se distinguirían. */
function parseCuadrillasPDF(texto){
  const lineas=String(texto||'').split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  const grupos=[]; let actual=null; let sueltos=0; let contratista='';
  const BASURA=/^(p[áa]gina|hoja|total|firma|no\.?\s|n[úu]mero)/i;
  const ENCABEZADO=/^([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ.\s]{2,30}?)\s*(?:[-–—:]\s*(.+))?$/;
  for(const l of lineas){
    if(BASURA.test(l))continue;
    // El contratista suele venir solo, en su propio renglón, al principio.
    if(!grupos.length&&!contratista&&/^[A-ZÁÉÍÓÚÑ&. ]{2,18}$/.test(l)&&_tokens(l).length<=2&&!_esOficio(l)){
      contratista=_limpNom(l); continue;
    }
    const m=l.match(ENCABEZADO);
    if(m&&l===l.toUpperCase()&&_esOficio(m[1])
       &&(!m[2]||(_tokens(m[2]).length<=4&&!_tokens(m[2]).some(x=>_NO_CUADRILLA.has(x))))){
      actual={cuadrilla:_limpNom(l), oficio:_limpNom(m[1]), lider:m[2]?_limpNom(m[2]):'', nombres:[]};
      grupos.push(actual); continue;
    }
    // Antes del primer encabezado va la gente del contratista SIN cuadrilla
    // (residentes, limpieza, operadores). No se les asigna nada.
    if(!actual){ if(_tokens(l).length>=2)sueltos++; continue; }
    if(/[:]/.test(l)&&_tokens(l).some(x=>_NO_CUADRILLA.has(x)))continue;
    const limpio=l.replace(/^\d{1,3}[).\-\s]+/,'').trim();   // quita la numeración
    const q=_quitaPuesto(limpio);
    if(_tokens(q.nombre).length>=2)actual.nombres.push(q);
  }
  return {contratista, sueltos, grupos:grupos.filter(g=>g.nombres.length)};
}
let IMPCU=null;
function openImportCuadrillas(){
  modal(`
    <div class="m-head"><h2>📄 Importar cuadrillas del PDF · ${esc(OBRA.nombre)}</h2><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-body">
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Sube el PDF que manda el contratista con su gente repartida en cuadrillas. La app empareja cada nombre contra el padrón <b>aguantando erratas</b>, te enseña qué encontró y <b>tú confirmas</b>. <b>No cambia el contratista de nadie</b>: solo asigna la cuadrilla.</p>
      <div class="grid" style="grid-template-columns:1.2fr 1fr 1fr;gap:10px">
        <div><label>Contratista del PDF</label><input id="ic-contr" list="dl-contr-ic" value="MG" oninput="this.dataset.tocado=1">
          <datalist id="dl-contr-ic">${[...new Set((WORKERS||[]).map(w=>w.contratista).filter(Boolean))].sort().map(c=>`<option>${esc(c)}</option>`).join('')}</datalist></div>
        <div><label>Confianza mínima</label><select id="ic-umbral">
          <option value="0.85">Alta · 85% (recomendada)</option>
          <option value="0.75">Media · 75%</option>
          <option value="0.92">Muy alta · 92%</option></select></div>
        <div><label>Archivo</label><input id="ic-file" type="file" accept="application/pdf" onchange="icLeer(event)"></div>
      </div>
      <div id="ic-out" style="margin-top:14px"><div class="empty"><div class="big">📄</div>Sube el PDF para empezar.</div></div>
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn" id="ic-orf" style="display:none" onclick="icExportarOrfanos()">⬇ Reporte de no encontrados</button>
      <button class="btn dark" id="ic-ok" style="display:none" onclick="icAplicar()">💾 Aplicar lo seleccionado</button>
    </div>`,'lg');
}
async function icLeer(ev){
  const f=ev.target.files&&ev.target.files[0]; if(!f)return;
  const contr=($('ic-contr').value||'').trim().toUpperCase();
  if(!contr){toast('Escribe de qué contratista es el PDF.','err');return;}
  $('ic-out').innerHTML=skeletonTabla?skeletonTabla(6):'<div class="empty">Leyendo...</div>';
  let texto='';
  try{
    const buf=await f.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    for(let i=1;i<=pdf.numPages;i++){
      const pg=await pdf.getPage(i);
      const tc=await pg.getTextContent();
      // se reconstruyen los renglones por su posición vertical
      const filas={};
      tc.items.forEach(it=>{const y=Math.round(it.transform[5]);
        (filas[y]=filas[y]||[]).push({x:it.transform[4],s:it.str});});
      Object.keys(filas).sort((a,b)=>b-a).forEach(y=>{
        texto+=filas[y].sort((a,b)=>a.x-b.x).map(o=>o.s).join(' ').replace(/\s+/g,' ').trim()+'\n';
      });
    }
  }catch(e){$('ic-out').innerHTML=`<div class="empty">No pude leer el PDF: ${esc(e.message)}</div>`;return;}
  const doc=parseCuadrillasPDF(texto);
  if(!doc.grupos.length){
    $('ic-out').innerHTML='<div class="empty"><div class="big">🤔</div>No reconocí encabezados de cuadrilla en ese PDF.<br><span style="color:var(--mut);font-size:12px">Se esperan renglones tipo <b>ALBAÑILES - RICARDO</b> y debajo los nombres.</span></div>';
    return;
  }
  // Si el PDF trae el contratista en su primer renglón, manda ese.
  if(doc.contratista&&$('ic-contr')&&!$('ic-contr').dataset.tocado)$('ic-contr').value=doc.contratista;
  const contrFinal=($('ic-contr').value||contr).trim().toUpperCase();
  // padrón contra el que se compara: todos los que no son baja, para que se vea
  // si alguien está capturado hoy con otro contratista.
  const padron=(WORKERS||[]).filter(w=>w.estatus!=='BAJA');
  const umbral=parseFloat($('ic-umbral').value)||0.85;
  const usados=new Set();
  IMPCU={contratista:contrFinal,umbral,sueltos:doc.sueltos,grupos:doc.grupos.map(g=>({...g,filas:g.nombres.map(n=>{
    const nom=n.nombre;
    let mejor=null,score=0,segundo=0;
    padron.forEach(w=>{const sc=simNombre(nom,fullName(w));
      if(sc>score){segundo=score;score=sc;mejor=w;}else if(sc>segundo)segundo=sc;});
    const dup=mejor&&usados.has(mejor.id);
    if(mejor&&score>=umbral&&!dup)usados.add(mejor.id);
    return {pdf:nom, cabeza:!!n.cabeza, w:(score>=umbral&&!dup)?mejor:null, cand:mejor, score, segundo,
            dup:!!dup, aceptar:score>=umbral&&!dup};
  })}))};
  icPinta();
}
function icPinta(){
  if(!IMPCU)return;
  const pct=x=>Math.round(x*100)+'%';
  const orf=[];
  const html=IMPCU.grupos.map((g,gi)=>{
    const filas=g.filas.map((f,fi)=>{
      if(!f.w)orf.push({cuadrilla:g.cuadrilla,pdf:f.pdf,parecido:f.cand?fullName(f.cand):'',score:f.score,dup:f.dup});
      const col=f.w?'var(--green)':(f.score>=0.6?'var(--amber)':'var(--red)');
      const otro=f.w&&String(f.w.contratista||'').toUpperCase()!==IMPCU.contratista;
      return `<tr>
        <td style="text-align:center"><input type="checkbox" ${f.aceptar?'checked':''} ${f.w?'':'disabled'}
          onchange="IMPCU.grupos[${gi}].filas[${fi}].aceptar=this.checked;icResumen()"></td>
        <td>${esc(f.pdf)}${f.cabeza?' <span class="badge ACTIVO" style="font-size:10px">CABEZA</span>':''}</td>
        <td>${f.w?esc(fullName(f.w))+` <span style="color:var(--mut)">#${f.w.no_trab??'—'}</span>`
              :(f.cand?`<span style="color:var(--mut)">¿${esc(fullName(f.cand))}?</span>`:'<span style="color:var(--mut)">—</span>')}</td>
        <td style="text-align:right;color:${col};font-weight:700">${pct(f.score)}</td>
        <td style="font-size:11.5px;color:var(--mut)">${f.dup?'ya emparejado con otro renglón'
          :(otro?'ojo: hoy está como '+esc(f.w.contratista):(f.w?'':'sin coincidencia clara'))}</td></tr>`;
    }).join('');
    const ok=g.filas.filter(f=>f.aceptar).length;
    return `<div class="sect">${esc(g.cuadrilla)}${g.lider?' — cabeza: '+esc(g.lider):''} <span style="color:var(--mut);font-weight:400">(${ok}/${g.filas.length} emparejados)</span></div>
      <table class="tb"><thead><tr><th style="width:34px"></th><th>Como viene en el PDF</th><th>En la plataforma</th><th style="text-align:right">Confianza</th><th>Nota</th></tr></thead><tbody>${filas}</tbody></table>`;
  }).join('');
  IMPCU.orfanos=orf;
  $('ic-out').innerHTML=`<div id="ic-res"></div>${html}`;
  $('ic-ok').style.display='';
  $('ic-orf').style.display=orf.length?'':'none';
  icResumen();
}
function icResumen(){
  if(!IMPCU)return;
  const tot=IMPCU.grupos.reduce((n,g)=>n+g.filas.length,0);
  const ok=IMPCU.grupos.reduce((n,g)=>n+g.filas.filter(f=>f.aceptar).length,0);
  const el=$('ic-res'); if(!el)return;
  el.innerHTML=`<div class="stats" style="margin-bottom:10px">
    <div class="stat b"><div class="n">${IMPCU.grupos.length}</div><div class="l">Cuadrillas en el PDF</div></div>
    <div class="stat g"><div class="n">${ok}</div><div class="l">Se van a asignar</div></div>
    <div class="stat r"><div class="n">${tot-ok}</div><div class="l">Sin emparejar (no se tocan)</div></div>
  </div>${IMPCU.sueltos?`<p style="color:var(--mut);font-size:12px;margin:-4px 0 10px">El PDF trae además <b>${IMPCU.sueltos}</b> persona(s) antes del primer encabezado (residentes, limpieza, operadores). Esos no pertenecen a ninguna cuadrilla y no se tocan.</p>`:''}`;
}
async function icAplicar(){
  if(!IMPCU)return;
  const contr=IMPCU.contratista;
  const aplicar=IMPCU.grupos.map(g=>({g,filas:g.filas.filter(f=>f.aceptar&&f.w)})).filter(x=>x.filas.length);
  if(!aplicar.length){toast('No hay nada marcado.','err');return;}
  const total=aplicar.reduce((n,x)=>n+x.filas.length,0);
  if(!confirm(`Se va a asignar la cuadrilla a ${total} trabajador(es) de ${contr}.\n\nEl contratista NO se modifica. ¿Continuar?`))return;
  const btn=$('ic-ok'); if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  let creadas=0,asignados=0,errores=[];
  for(const {g,filas} of aplicar){
    try{
      // ¿ya existe esa cuadrilla en esta obra?
      let cu=(CUADS||[]).find(c=>String(c.contratista).toUpperCase()===contr
        &&_sinAc(c.nombre)===_sinAc(g.cuadrilla));
      if(!cu){
        /* La cabeza viene MARCADA en el PDF (su puesto dice "Cabeza"), así que no
           hay que adivinarla. Si ese renglón no se emparejó, se cae al nombre del
           encabezado ("ALBAÑILES - RICARDO" → RICARDO). */
        let lider=(filas.find(f=>f.cabeza)||{}).w||null;
        if(!lider&&g.lider){let mej=0;filas.forEach(f=>{const sc=simNombre(g.lider,fullName(f.w));
          if(sc>mej&&sc>=0.7){mej=sc;lider=f.w;}});}
        const {data,error}=await sb.from('cuadrillas').insert({obra_id:OBRA.id,contratista:contr,
          nombre:g.cuadrilla,lider_id:lider?lider.id:null,creado_por:USER.email}).select().single();
        if(error)throw error;
        cu=data; CUADS.push(cu); creadas++;
      }
      const ids=filas.map(f=>f.w.id);
      const {error:e2}=await sb.from('trabajadores').update({id_cuadrilla:cu.id}).in('id',ids);
      if(e2)throw e2;
      ids.forEach(id=>{const w=(WORKERS||[]).find(x=>x.id===id);if(w)w.id_cuadrilla=cu.id;});
      asignados+=ids.length;
    }catch(e){errores.push(`${g.cuadrilla}: ${e.message||e}`);}
  }
  if(btn){btn.disabled=false;btn.textContent='💾 Aplicar lo seleccionado';}
  const orf=(IMPCU.orfanos||[]).length;
  toast(`${asignados} trabajador(es) asignados · ${creadas} cuadrilla(s) creada(s)`+
    (orf?` · ${orf} sin emparejar (revisa el reporte)`:'')+(errores.length?` · ${errores.length} error(es)`:''),
    errores.length?'err':'ok');
  if(errores.length)console.warn('Cuadrillas — errores:',errores);
  renderTable&&renderTable();
  if(!orf)closeModal(); else icPinta();
}
/* REPORTE DE NO ENCONTRADOS: exactamente los del PDF que no casaron con nadie. */
function icExportarOrfanos(){
  const orf=(IMPCU&&IMPCU.orfanos)||[];
  if(!orf.length){toast('No hay trabajadores sin emparejar.','ok');return;}
  const rows=[],styles=[];
  rows.push([`NO ENCONTRADOS EN LA PLATAFORMA — ${IMPCU.contratista} — ${OBRA.nombre}`]); styles.push(ST.title);
  rows.push(['CUADRILLA','NOMBRE COMO VIENE EN EL PDF','PARECIDO MÁS CERCANO','CONFIANZA','MOTIVO']); styles.push(ST.head);
  const r=[ST.cell,ST.cell,ST.cell,ST.cellC,ST.cell];
  orf.forEach(o=>{rows.push([o.cuadrilla,o.pdf,o.parecido||'—',Math.round(o.score*100)+'%',
    o.dup?'El parecido ya se usó para otro renglón del PDF':'Ninguna coincidencia pasó la confianza mínima']);styles.push(r);});
  rows.push([`TOTAL SIN EMPAREJAR: ${orf.length}`]); styles.push(ST.total);
  const ws=buildSheet(rows,styles,[22,34,34,12,44],
    [{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:4}}],[{hpt:26},{hpt:22}]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'NO ENCONTRADOS');
  dl(wb,`CUADRILLAS_NO_ENCONTRADOS_${IMPCU.contratista}_${today()}.xlsx`);
  toast('Reporte generado.','ok');
}
/* El mismo reporte en JSON, por si se quiere procesar fuera */
function icOrfanosJSON(){return JSON.stringify({contratista:IMPCU&&IMPCU.contratista,
  obra:OBRA&&OBRA.nombre, umbral:IMPCU&&IMPCU.umbral,
  no_encontrados:(IMPCU&&IMPCU.orfanos)||[]},null,2);}

