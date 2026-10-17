/* ---------- EXPEDIENTE INDIVIDUAL A EXCEL (2026-08-27) ----------------
   Todo lo que la plataforma sabe de UN trabajador, en vertical: columna A
   el nombre del campo, columna B su valor. Se arma en el navegador con
   xlsx-js-style, igual que el resto de los exportes.
   REGLA: ningún hueco se queda en blanco. Lo que no esté capturado sale
   como "Sin información", para que quien reciba la hoja sepa que falta el
   dato y no que se perdió al exportar. */
const EXP_VACIO='Sin información';
/* Un valor listo para la celda. null, undefined, '' y NaN → "Sin información". */
function expVal(v,fmt){
  if(v===null||v===undefined)return EXP_VACIO;
  if(typeof v==='number'&&!isFinite(v))return EXP_VACIO;
  if(typeof v==='string'&&!v.trim())return EXP_VACIO;
  if(Array.isArray(v))return v.length?v.join(', '):EXP_VACIO;
  if(typeof v==='boolean')return v?'Sí':'No';
  try{
    if(fmt==='money')  return '$'+money(v);
    if(fmt==='fecha')  return fmtD(v)||EXP_VACIO;
    if(fmt==='pct')    return (Number(v)||0)+'%';
  }catch(e){ /* si el formateador falla, se devuelve el valor tal cual */ }
  const t=String(v).trim();
  return t||EXP_VACIO;
}
/* Los campos del expediente de UN trabajador, en el orden en que van a
   quedar en la hoja. Una cadena suelta abre sección; un arreglo es
   [etiqueta, valor, formato]. Se saca aparte porque lo usan tanto el
   expediente individual como el export global de la obra. */
function expedienteCampos(w){
  const cu=cuadDe(w), si=sueldoInternoDe(w.id), d=w.docs||{};
  const vac=saldoVac(w), fh=fueraHoy(w);
  const chq=(CHEQUES||[]).filter(c=>c.trabajador_id===w.id&&!c.eliminado);
  const des=(DESC||[]).filter(x=>x.trabajador_id===w.id&&x.activo);
  const recs=recibosDe(w.id);
  const nActas=(ACTAS||[]).filter(a=>a.trabajador_id===w.id&&a.activo!==false).length;
  const nom=(NOM||[]).filter(n=>n.trabajador_id===w.id&&n.activo!==false)
    .sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)))[0];

  /* [etiqueta, valor, formato] · una cadena sola = título de sección */
  const F=[
    'IDENTIFICACIÓN',
    ['Número de trabajador',w.no_trab],
    ['Nombre completo',fullName(w)],
    ['Primer apellido',w.primer_apellido],
    ['Segundo apellido',w.segundo_apellido],
    ['Nombres',w.nombres],
    ['CURP',w.curp],
    ['RFC',w.rfc],
    ['NSS',w.nss],
    ['Fecha de nacimiento',w.fecha_nacimiento,'fecha'],
    ['Género',w.genero],
    ['Estado civil',w.estado_civil],
    ['Escolaridad',w.escolaridad],
    ['Nacionalidad',w.nacionalidad],
    ['Estado de nacimiento',w.edo_nacimiento],
    'CONTACTO Y DOMICILIO',
    ['Dirección',w.direccion],
    ['Código postal',w.cp],
    ['Teléfono',w.telefono],
    ['Correo electrónico',w.correo],
    'ADSCRIPCIÓN',
    ['Obra',(OBRA&&OBRA.nombre)||null],
    ['Contratista',w.contratista],
    ['Cuadrilla',cu?cu.nombre:null],
    ['Cabeza de la cuadrilla',cu?cuadLider(cu):null],
    ['Puesto',w.puesto],
    ['Funciones',w.funciones],
    ['Turno',w.turno],
    'ALTA, BAJA Y CONTRATO',
    ['Estatus',w.estatus],
    ['Fecha de alta',w.fecha_alta,'fecha'],
    ['Semana de ingreso',w.semana_ingreso],
    ['Fecha de reingreso',w.fecha_reingreso,'fecha'],
    ['Tipo de contrato',w.tipo_contrato],
    ['Fin de contrato',w.fecha_fin_contrato,'fecha'],
    ['Fecha de baja',w.fecha_baja,'fecha'],
    ['Motivo de baja',w.motivo_baja],
    ['Monto de finiquito',w.monto_finiquito,'money'],
    ['Motivo de pendiente',w.motivo_pendiente],
    'SUELDO Y PAGO',
    ['Salario diario (SD)',w.sd,'money'],
    ['Salario diario integrado (SDI)',w.sdi,'money'],
    ['Sueldo por periodo ('+perDe(w).etiqueta+')',w.sal_semanal,'money'],
    ['Periodo de pago',w.periodo_pago||'SEMANAL'],
    ['Días que cubre el pago',perDe(w).dias],
    ['Forma de pago',w.forma_pago],
    ['Banco',w.banco],
    ['Cuenta',w.cuenta],
    ['CLABE interbancaria',w.clabe],
    'IMSS E INFONAVIT',
    ['Movimiento IMSS',w.movimiento_imss],
    ['Fecha del movimiento IMSS',w.fecha_mov_imss,'fecha'],
    ['Registro patronal propio',w.registro_patronal],
    ['Prima de riesgo propia',w.prima_rt],
    // el monto se muestra YA llevado al periodo del trabajador, que es lo que
    // de verdad se le retiene en cada nómina
    ['Créditos y descuentos activos',des.length?des.map(x=>`${x.tipo||'DESCUENTO'} $${money(x.recurrente?montoDescuento(x,perDe(w)):x.monto)}`):null],
    'BENEFICIARIO',
    ['Beneficiario',w.beneficiario],
    ['Parentesco',w.benef_parentesco],
    ['Teléfono del beneficiario',w.benef_telefono],
    ['Porcentaje',w.benef_porcentaje,'pct'],
    'VACACIONES, ACTAS Y NOM-035',
    ['Antigüedad (años)',vac?vac.anios:null],
    ['Días de vacaciones por ley',vac?vac.derecho:null],
    ['Saldo de vacaciones',vac?vac.saldo:null],
    ['Ausencia vigente',fh?`${fh.tipo} hasta ${fmtD(fh.fecha_fin)}`:null],
    ['Actas administrativas',nActas||null],
    ['NOM-035',nom?`${nom.guia} · ${fmtD(nom.fecha)} · ${nom.resultado}`:null],
    'EXPEDIENTE',
    ...DOCS.map(k=>[k,d[k]]),
    ['Recibos de nómina archivados',recs.length||null],
    ['Cheques emitidos',chq.length||null],
    ['Carpeta en Drive',w.drive_link],
  ];
  /* El control interno salarial SOLO va si quien exporta es VIP: si no,
     ni siquiera tiene las cifras (la base no se las manda). */
  if(esVip()){
    F.push('CONTROL INTERNO SALARIAL (SOLO VIP)',
      ['Sueldo registrado (IMSS)',si?si.sueldo_imss:null,'money'],
      ['Sueldo real',si?si.sueldo_real:null,'money'],
      ['Diferencia',(si&&si.sueldo_imss!=null&&si.sueldo_real!=null)?(Number(si.sueldo_real)-Number(si.sueldo_imss)):null,'money'],
      ['Notas del control interno',si?si.notas:null]);
  }
  F.push('REGISTRO',
    ['Capturado por',w.creado_por],
    ['Última modificación',w.actualizado_por],
    ['Fecha de la última modificación',w.updated_at,'fecha'],
    ['Exportado por',USER&&USER.email],
    ['Fecha de exportación',new Date().toLocaleString('es-MX')]);
  return F;
}
const EX={
    tit:{font:{bold:true,sz:14,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'1F3864'}},alignment:{horizontal:'center',vertical:'center'}},
    sub:{font:{sz:10,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'2F5496'}},alignment:{horizontal:'center',vertical:'center'}},
    sec:{font:{bold:true,sz:11,color:{rgb:'FFFFFF'},name:'Calibri'},fill:{fgColor:{rgb:'2E75B6'}},alignment:{vertical:'center'}},
    et :{font:{bold:true,sz:10,name:'Calibri'},fill:{fgColor:{rgb:'EBF3FB'}},border:BORD,alignment:{vertical:'center'}},
    va :{font:{sz:10,name:'Calibri'},border:BORD,alignment:{vertical:'center',wrapText:true}},
    /* Lo que falta se marca en ámbar: se ve de un vistazo qué hay que capturar. */
    vf :{font:{sz:10,italic:true,color:{rgb:'8A6D1A'},name:'Calibri'},fill:{fgColor:{rgb:'FFF7E6'}},border:BORD,alignment:{vertical:'center'}}
  };
/* La hoja de UN trabajador. Devuelve también cuántos campos salieron
   vacíos, que es lo que se le reporta al usuario al terminar. */
function expedienteWS(w){
  const F=expedienteCampos(w);
  const rows=[],styles=[],hs=[];
  rows.push(['EXPEDIENTE DEL TRABAJADOR','']); styles.push(EX.tit); hs.push({hpt:26});
  rows.push([fullName(w)+'   ·   No. '+expVal(w.no_trab),'']); styles.push(EX.sub); hs.push({hpt:18});
  let faltan=0;
  F.forEach(f=>{
    if(typeof f==='string'){ rows.push([f,'']); styles.push(EX.sec); hs.push({hpt:20}); return; }
    const v=expVal(f[1],f[2]);
    if(v===EXP_VACIO)faltan++;
    rows.push([f[0],v]);
    styles.push([EX.et, v===EXP_VACIO?EX.vf:EX.va]);
    hs.push({hpt:16});
  });
  const merges=[{s:{r:0,c:0},e:{r:0,c:1}},{s:{r:1,c:0},e:{r:1,c:1}}];
  styles.forEach((st,r)=>{ if(st===EX.sec)merges.push({s:{r,c:0},e:{r,c:1}}); });
  const ws=buildSheet(rows,styles,[34,52],merges,hs);
  ws['!margins']={left:0.5,right:0.5,top:0.5,bottom:0.5,header:0.2,footer:0.2};
  return {ws,faltan};
}
function exportExpediente(id){
  const w=WORKERS.find(x=>x.id===id);
  if(!w){toast('No encontré a ese trabajador.','err');return;}
  const {ws,faltan}=expedienteWS(w);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'EXPEDIENTE');
  const safe=fullName(w).replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/g,'_').slice(0,60);
  dl(wb,`EXPEDIENTE_${w.no_trab??'SN'}_${safe}.xlsx`);
  toast(`Expediente de ${fullName(w)} exportado${faltan?` · ${faltan} campo(s) sin información`:' · completo'}.`,faltan?'':'ok');
}

/* ---------- EXPEDIENTES DE TODA LA OBRA (2026-08-28) ------------------
   Un solo libro con una pestaña por trabajador. Lo pesado no es armar las
   hojas sino nombrarlas: Excel no acepta \ / ? * [ ] : en el nombre de una
   pestaña, lo corta a 31 caracteres y NO tolera dos pestañas que se llamen
   igual. Cualquiera de las tres cosas revienta el archivo al abrirlo, y con
   apellidos largos ("MARTÍNEZ DE LA CRUZ FRANCISCO JAVIER") las tres pasan
   a la vez. Por eso el nombre se limpia, se corta y se numera si choca. */
const HOJA_PROHIBIDO=/[\\\/\?\*\[\]:]/g;
function expNombreHoja(nombre,usados){
  let base=String(nombre||'').replace(HOJA_PROHIBIDO,' ').replace(/\s+/g,' ').trim();
  base=base.replace(/^'+|'+$/g,'').trim();      // Excel tampoco lo quiere con apóstrofo en los extremos
  if(!base)base='SIN NOMBRE';
  base=base.slice(0,31).trim();
  if(!usados.has(base.toUpperCase())){usados.add(base.toUpperCase());return base;}
  for(let i=2;i<1000;i++){                       // homónimos: " 2", " 3", ...
    const suf=' '+i, cand=(base.slice(0,31-suf.length).trim()+suf);
    if(!usados.has(cand.toUpperCase())){usados.add(cand.toUpperCase());return cand;}
  }
  const ult=String(Date.now()).slice(-6);
  usados.add(ult); return ult;
}
function exportExpedientesGlobal(){
  if(!OBRA){toast('Abre una obra primero.','err');return;}
  // Respeta el filtro que tengas puesto arriba (contratista, puesto, periodo):
  // así el mismo botón saca toda la obra o nada más la oficina quincenal.
  const gente=baseFiltered().filter(w=>w.estatus==='ACTIVO')
    .sort((a,b)=>((a.no_trab??9e9)-(b.no_trab??9e9))||fullName(a).localeCompare(fullName(b),'es'));
  if(!gente.length){toast('No hay trabajadores activos con el filtro actual.','err');return;}
  if(!confirm(`¿Generar un Excel con ${gente.length} expediente(s) de ${OBRA.nombre}?\n\nUna pestaña por trabajador, con todos sus datos. Lo que no esté capturado sale como "${EXP_VACIO}".${gente.length>120?'\n\nSon muchas hojas: el archivo puede tardar y pesar bastante.':''}`))return;
  const wb=XLSX.utils.book_new(), usados=new Set();
  let faltan=0;
  gente.forEach(w=>{
    const r=expedienteWS(w);
    faltan+=r.faltan;
    XLSX.utils.book_append_sheet(wb,r.ws,expNombreHoja(fullName(w),usados));
  });
  const safeObra=String(OBRA.nombre||'OBRA').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/g,'_').slice(0,50);
  dl(wb,`EXPEDIENTES_${safeObra}_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast(`${gente.length} expediente(s) exportados · ${faltan} campo(s) sin información en total.`,'ok');
}
