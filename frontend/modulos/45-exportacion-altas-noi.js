/* Layout de altas: catálogo confirmado por contabilidad (NOI 11).
   Adaptador de salida: no escribe fichas, contratos, sueldos ni movimientos.
   El Excel de importación conserva encabezado en fila 1 y exactamente A:BF. */
const NOI_PUESTOS_ALTAS=[
  'AYUDANTE ALBAÑIL','RESIDENTE DE OBRA','OPERADOR DE EXCAVADORA','OFICIAL ALBAÑIL',
  'OFICIAL FIERRERO','OFICIAL CARPINTERO','CABO DE OFICIOS','OPERADOR DE PIPA DE AGUA',
  'OPERADOR DE VIBROCOMPACTADOR','OPERADOR DE MOTOCONFORMADORA','OPERADOR DE TRANSPORTE',
  'OFICIAL PLOMERO','ALMACENISTA','PERSONAL DE LIMPIEZA','OFICIAL ELECTRICISTA','YESERO',
  'AYUDANTE GENERAL','OPERADOR DE MANIPULADOR'
];
const NOI_ANCHOS_ALTAS=[11,15.43,15.86,21.14,14.86,16.43,21.71,16.71,24.14,17.29,25.29,21.29,
  10.71,10.71,10.71,17.29,17.29,27.14,13.43,13.43,19.43,21.57,11,10.71,10.71,11,29.29,27.14,
  10.71,10.71,20.71,10.71,31.14,16.86,11,10.71,10.71,10.71,10.71,21.86,11,31.57,15.86,20.71,
  10.71,23.14,10.71,10.71,10.71,10.71,10.71,10.71,20.71,10.71,10.71,10.71,10.71,10.71];
function noiPuestoClave(puesto){
  const normal=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/\s+/g,' ');
  let nombre=normal(puesto);
  // Equivalencia ortográfica explícita. No confundir maquinaria o jerarquías.
  if(nombre==='AYUDANTE DE ALBANIL')nombre='AYUDANTE ALBANIL';
  return NOI_PUESTOS_ALTAS.findIndex(p=>normal(p)===nombre)+1;
}
function noiPuestoSeleccionado(w){
  const auto=noiPuestoClave(w.puesto);if(auto)return auto;
  const i=(window._NA||[]).findIndex(x=>x.id===w.id),n=Number($('na-puesto-'+i)?.value);
  return Number.isInteger(n)&&n>=1&&n<=NOI_PUESTOS_ALTAS.length?n:0;
}
function noiFechaValida(fecha){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha||'')))return false;
  const d=new Date(fecha+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===fecha;
}
function noiProblemasAlta(w,excel){
  const errores=[],nss=String(w.nss||'').trim(),rfc=String(w.rfc||'').trim().toUpperCase(),curp=String(w.curp||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{11}$/.test(String(rpDe(w)||'').trim().toUpperCase()))errores.push('registro patronal de 11 caracteres');
  if(!/^\d{11}$/.test(nss))errores.push('NSS de 11 dígitos (con sus ceros iniciales)');
  if(!/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/.test(rfc))errores.push('RFC de persona física');
  if(!/^[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp))errores.push('CURP de 18 caracteres');
  if(!noiFechaValida(w.fecha_alta))errores.push('fecha de alta válida');
  if(!(Number(w.sdi)>0)||!Number.isFinite(Number(w.sdi)))errores.push('SDI positivo');
  for(const [k,label] of [['primer_apellido','primer apellido'],['nombres','nombre(s)']])
    if(!String(w[k]||'').trim())errores.push(label);
  if(['primer_apellido','segundo_apellido','nombres'].some(k=>/[\r\n$]/.test(String(w[k]||''))))errores.push('nombre sin saltos de línea ni separador $');
  if(excel){
    if(!Number.isSafeInteger(Number(w.no_trab))||Number(w.no_trab)<=0)errores.push('número de trabajador');
    if(!(Number(w.sd)>0)||!Number.isFinite(Number(w.sd)))errores.push('salario diario positivo');
    if(!noiFechaValida(w.fecha_nacimiento))errores.push('fecha de nacimiento válida');
    if(!noiPuestoSeleccionado(w))errores.push('seleccionar clave de puesto NOI');
  }
  return errores;
}
function noiPrepararAltas(excel){
  if(window._NA_EXPORTANDO){toast('Espera a que termine la exportación actual.','err');return null;}
  if(!OBRA?.id||window._NA_OBRA!==OBRA.id){toast('Cambió el centro de trabajo. Vuelve a abrir la exportación de altas.','err');return null;}
  const d1=$('na-d1')?.value,d2=$('na-d2')?.value;
  if(!noiFechaValida(d1)||!noiFechaValida(d2)||d1>d2){toast('Revisa el rango de fechas de las altas.','err');return null;}
  const sel=naSel();
  if(!sel.length){toast('No hay trabajadores seleccionados.','err');return null;}
  const problemas=[],nssVistos=new Set(),numeros=new Set();
  for(const w of sel){
    const errores=noiProblemasAlta(w,excel),nss=String(w.nss||'').trim();
    if(w.obra_id!==OBRA.id||w.eliminado||w.fecha_alta<d1||w.fecha_alta>d2)errores.push('trabajador fuera del centro/rango seleccionado');
    if(nssVistos.has(nss))errores.push('NSS repetido en la selección');nssVistos.add(nss);
    if(excel&&numeros.has(Number(w.no_trab)))errores.push('número de trabajador repetido');numeros.add(Number(w.no_trab));
    if(errores.length)problemas.push('#'+(w.no_trab??'—')+' '+fullName(w)+': '+errores.join(', '));
  }
  if(problemas.length){
    toast('No se generó un archivo incompleto. '+problemas.slice(0,3).join(' · ')+(problemas.length>3?' · y '+(problemas.length-3)+' trabajador(es) más.':''),'err');
    return null;
  }
  return sel.slice().sort((a,b)=>Number(a.no_trab)-Number(b.no_trab));
}
function noiFilaAlta(w,clavePuesto){
  const r=new Array(NOI_HDR.length).fill('');
  r[0]=Number(w.no_trab);r[1]=w.primer_apellido||'';r[2]=w.segundo_apellido||'';r[3]=w.nombres||'';
  r[4]=Number(w.sd);r[5]=String(w.genero||'').toUpperCase().startsWith('F')?'F':'M';
  r[6]=xlDate(w.fecha_nacimiento);r[7]=xlDate(w.fecha_alta);r[8]=String(w.nss).trim();r[9]=edoCurp(w.curp);
  r[10]=String(w.curp).trim().toUpperCase();r[11]=String(w.rfc).trim().toUpperCase();r[12]=w.direccion||'';
  r[15]=String(w.cp||'');r[16]=String(w.cp_fiscal||w.cp||'');r[18]=String(w.telefono||'');
  r[20]=w.correo||'';r[24]=w.estado_civil||'';r[28]=w.forma_pago==='CHEQUE'?'Cheque':'Transferencia';
  r[33]='C';r[38]=rpDe(w);r[40]=1;r[41]=clavePuesto;r[42]=3;
  r[44]='México';r[46]='F';r[47]='02';r[48]='01';r[49]='HID';r[51]='02';
  r[53]=5;r[54]=4;r[56]=Number(w.sdi);r[57]=365;
  return r;
}
function noiLineaSUA(w){
  // Normalización sólo del archivo: no cambia los datos de la ficha.
  return suaConcat({...w,registro_patronal:String(rpDe(w)).trim(),nss:String(w.nss).trim(),
    rfc:String(w.rfc).trim().toUpperCase(),curp:String(w.curp).trim().toUpperCase(),
    primer_apellido:String(w.primer_apellido).trim(),segundo_apellido:String(w.segundo_apellido||'').trim(),
    nombres:String(w.nombres).trim()});
}
function noiLibroAltas(sel){
  const filas=[NOI_HDR,...sel.map(w=>noiFilaAlta(w,noiPuestoSeleccionado(w)))],ws=XLSX.utils.aoa_to_sheet(filas);
  const texto=new Set([8,9,10,11,15,16,18,19,38,47,48,49,51]);
  for(let ri=0;ri<filas.length;ri++)for(let ci=0;ci<NOI_HDR.length;ci++){
    const addr=XLSX.utils.encode_cell({r:ri,c:ci}),cell=ws[addr];if(!cell)continue;
    const fmt=ri&&texto.has(ci)?'@':ri&&[6,7].includes(ci)?'dd/mm/yyyy':'General';
    cell.s={font:{name:'Arial',sz:10,color:{rgb:'000000'}},fill:{patternType:'solid',fgColor:{rgb:'FFFFFF'}},
      alignment:{vertical:'center',wrapText:true},numFmt:fmt};
    cell.z=fmt;
    if(ri&&texto.has(ci)){cell.t='s';cell.v=String(cell.v??'');}
  }
  ws['!cols']=NOI_ANCHOS_ALTAS.map(wch=>({wch}));
  ws['!rows']=[{hpt:42},...sel.map(()=>({hpt:30}))];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Trabajadores NUEVOS');
  wb.__empresaPorHoja={'Trabajadores NUEVOS':empresaDeObra(OBRA)};wb.__auditObraIds=[OBRA.id];
  return wb;
}
function noiEstadoExportacion(ocupado){
  window._NA_EXPORTANDO=ocupado;
  for(const id of ['na-excel','na-txt'])if($(id))$(id).disabled=ocupado;
}
