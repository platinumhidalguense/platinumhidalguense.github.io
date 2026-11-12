/* Resolutor único. Las claves son datos del servidor, nunca posiciones de un array. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_PUESTOS=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const normal=t=>String(t??'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
 function resolver(datos,w,empresa='*'){
  const original=typeof w==='string'?w:w?.puesto||'',variante=normal(original),observaciones=normal(typeof w==='object'?w?.observaciones:'');
  const mapa=new Map((datos?.catalogo||[]).filter(c=>c.activo).map(c=>[Number(c.clave),c]));
  const es=(datos?.equivalencias||[]).filter(e=>normal(e.variante)===variante&&['*',empresa].includes(e.empresa)
   &&(!e.especialidad||observaciones.includes('ESPECIALIDAD: '+normal(e.especialidad)))&&mapa.has(Number(e.clave)))
   .sort((a,b)=>Number(b.empresa===empresa)-Number(a.empresa===empresa)||String(b.especialidad).length-String(a.especialidad).length);
  const e=es[0],c=e?mapa.get(Number(e.clave)):null;
  return {original,normalizado:variante,clave:c?Number(c.clave):null,descripcion:c?.descripcion||null,especialidad:e?.especialidad||'',
   empresa,equivalencia:e?.referencia||null,resuelto:!!c};
 }
 return Object.freeze({normal,resolver});
});
function puestoDatosCentral(){return typeof CFGEMP==='undefined'?null:CFGEMP.puestos_central||null;}
function puestoEmpresa(w){return typeof w==='object'&&w?.obra_id&&typeof empresaDeTrabajador==='function'?empresaDeTrabajador(w):typeof OBRA!=='undefined'&&OBRA?empresaDeObra(OBRA):'*';}
function puestoResolver(w,empresa){return window.PLATINUM_PUESTOS.resolver(puestoDatosCentral(),w,empresa||puestoEmpresa(w));}
function puestoNombre(w){const r=puestoResolver(w);return r.descripcion||r.original;}
async function abrirCatalogoPuestos(){
 const obra=OBRA?.id,usuario=USER?.id;
 modal2(`<div class="m-head"><h2>Catálogo central de puestos NOI</h2><button class="x" onclick="closeModal2()" aria-label="Cerrar">×</button></div><div class="m-body" id="pc-central" aria-live="polite">Consultando catálogo y puestos existentes…</div>`,'lg');
 const host=$('pc-central'),vigente=()=>host?.isConnected&&OBRA?.id===obra&&USER?.id===usuario;
 try{
  const leer=async(a,p={})=>{const r=await sb.rpc('control_puestos',{p_accion:a,p});if(r.error)throw Error(r.error.message);return r.data;};
  const [d,u]=await Promise.all([leer('LEER'),leer('USOS')]);if(!vigente())return;
  CFGEMP.puestos_central=d;
  host.innerHTML=`<p>Claves explícitas compartidas por captura, ficha y exportaciones. Las equivalencias conservan los puestos originales y sólo cambian su descripción de salida. Los puestos fuera del catálogo autorizado no se ofrecen en nuevas altas.</p>
   ${ctrlTabla(['Clave','Descripción NOI'],d.catalogo.filter(c=>c.activo).map(c=>`<tr><td>${c.clave}</td><td>${esc(c.descripcion)}</td></tr>`))}
   <h3>Puestos registrados · resumen por empresa</h3>${ctrlTabla(['Empresa','Original','Personas','Clave y descripción externa'],u.filas.map(f=>`<tr><td>${esc(f.empresa)}</td><td>${esc(f.puesto)}</td><td>${f.personas}</td><td>${f.resolucion.resuelto?f.resolucion.clave+' · '+esc(f.resolucion.descripcion):'Sin equivalencia respaldada'}</td></tr>`))}
   ${d.puede_editar?`<details><summary>Configurar equivalencia documentada</summary><p class="fhint">No fusionar ayudantes con oficiales ni especialidades distintas. Un cambio se aplica a todas las salidas de esa variante.</p>
    <label>Ámbito<select id="pc-empresa"><option value="*">Catálogo compartido</option>${[...new Set(u.filas.map(f=>f.empresa))].map(e=>`<option>${esc(e)}</option>`).join('')}</select></label>
    <label>Denominación original<input id="pc-variante" maxlength="160"></label><label>Especialidad conservada (opcional)<input id="pc-especialidad" maxlength="160"></label>
    <label>Clave NOI<select id="pc-clave">${d.catalogo.filter(c=>c.activo).map(c=>`<option value="${c.clave}">${c.clave} · ${esc(c.descripcion)}</option>`).join('')}</select></label>
    <label>Referencia del catálogo o autorización<input id="pc-ref" maxlength="300"></label><button class="btn dark" id="pc-guardar">Confirmar equivalencia</button></details>
    <details><summary>Añadir una nueva clave respaldada por NOI</summary><p class="fhint">Úsalo únicamente cuando exista una clave nueva en el catálogo autorizado. No reasigna ni elimina las claves 1–20.</p><label>Nueva clave<input type="number" id="pc-nueva-clave" min="21" max="9999"></label><label>Descripción exacta<input id="pc-nueva-descripcion" maxlength="160"></label><label>Referencia del catálogo actualizado<input id="pc-nueva-ref" maxlength="300"></label><button class="btn" id="pc-nueva">Confirmar nueva clave documentada</button></details>`:''}<p id="pc-estado" role="status"></p>`;
  const nueva=host.querySelector('#pc-nueva');if(nueva)nueva.onclick=async()=>{
   const val=k=>host.querySelector('#pc-nueva-'+k).value.trim(),clave=Number(val('clave'));
   if(!Number.isInteger(clave)||clave<=20||!val('descripcion')||val('ref').length<3){host.querySelector('#pc-estado').textContent='Indica una clave nueva, descripción y referencia acreditada.';return;}
   if(!confirm('¿Confirmas que la clave '+clave+' consta en el catálogo NOI y debe habilitarse?'))return;
   nueva.disabled=true;
   try{const n=await leer('PUESTO',{obra_id:obra,clave,descripcion:val('descripcion'),referencia:val('ref'),confirmado:true});if(!vigente())return;CFGEMP.puestos_central=n;closeModal2();if($('na-lista'))naLista();toast('Nueva clave documentada registrada.','ok');}
   catch(e){if(vigente())host.querySelector('#pc-estado').textContent=e.message;}finally{if(nueva.isConnected)nueva.disabled=false;}
  };
  const boton=host.querySelector('#pc-guardar');if(!boton)return;
  boton.onclick=async()=>{
   const val=k=>host.querySelector('#pc-'+k).value.trim(),variante=window.PLATINUM_PUESTOS.normal(val('variante')),especialidad=window.PLATINUM_PUESTOS.normal(val('especialidad')),empresa=val('empresa');
   const anterior=d.equivalencias.find(e=>e.empresa===empresa&&e.variante===variante&&e.especialidad===especialidad);
   if(!variante||val('ref').length<3){host.querySelector('#pc-estado').textContent='Captura denominación y referencia.';return;}
   if(!confirm('¿Guardar esta equivalencia central para todas las salidas correspondientes?'))return;
   boton.disabled=true;
   try{const n=await leer('EQUIVALENCIA',{obra_id:obra,empresa,variante,especialidad,clave:Number(val('clave')),referencia:val('ref'),revision:anterior?.revision||0,confirmado:true});
    if(!vigente())return;CFGEMP.puestos_central=n;closeModal2();if($('na-lista'))naLista();toast('Equivalencia central guardada con auditoría.','ok');
   }catch(e){if(vigente())host.querySelector('#pc-estado').textContent=e.message;}finally{if(boton.isConnected)boton.disabled=false;}
  };
 }catch(e){if(vigente())host.textContent=e.message;}
}
