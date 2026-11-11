/* Fuente única y sólo lectura. La confirmación vuelve a verificar su firma en PostgreSQL. */
(function(){
 'use strict';
 const lecturas=new Map(),clave=(w,f)=>[w.id,w.obra_id,w.updated_at,iniAntig(w),f,USER?.id].join('|');
 function obtener(w,f){return lecturas.get(clave(w,f))?.datos||null;}
 function registrar(w,f,d){
  if(d?.trabajador_id!==w.id||d.obra_id!==w.obra_id||d.corte!==f||d.inicio_ciclo!==iniAntig(w))throw Error('La fuente de prestaciones corresponde a otra ficha, fecha o ciclo.');
  lecturas.set(clave(w,f),{datos:d});return d;
 }
 async function cargar(w,f,{actualizar=false}={}){
  const k=clave(w,f),prev=lecturas.get(k);if(!actualizar&&prev?.datos)return prev.datos;if(!actualizar&&prev?.promesa)return prev.promesa;
  const usuario=USER?.id,turno={};
  const promesa=(async()=>{const {data,error}=await sb.rpc('prestaciones_fuentes',{p_trabajador:w.id,p_fecha:f});
   if(error)throw Error('No se pudieron leer faltas y aguinaldo: '+error.message);
   if(USER?.id!==usuario)throw Error('La sesión cambió durante la lectura.');
   if(lecturas.get(k)?.turno!==turno){const actual=lecturas.get(k);if(actual?.datos)return actual.datos;if(actual?.promesa)return await actual.promesa;throw Error('La lectura fue reemplazada. Actualiza la fecha de cálculo.');}
   return registrar(w,f,data);
  })();
  lecturas.set(k,{promesa,turno});try{return await promesa;}catch(e){if(lecturas.get(k)?.promesa===promesa)lecturas.delete(k);throw e;}
 }
 function decision(d){
  if(!d?.firma)throw Error('No se verificó la fuente de faltas y aguinaldo.');
  if(d.reservas?.length)throw Error('Hay aguinaldo reservado en una nómina abierta ('+d.reservas.map(r=>r.id).join(', ')+'). Retira o resuelve su aplicación en la corrida de aguinaldo antes de continuar.');
  if(d.exento_acreditado_pendiente)throw Error('Falta la parte exenta del aguinaldo acreditado: '+d.referencias.map(r=>r.id).join(', ')+'. Vincula ese desglose antes de aplicar.');
  return {puede_continuar:true,etiqueta:d.etiqueta,acreditado:Number(d.aguinaldo_acreditado)||0,documentos_informativos:d.informativos?.length||0};
 }
 function panel(d){return `<section class="bf-papel"><h4>${esc(d.etiqueta)}</h4><p>Ciclo ${esc(d.desde)} al ${esc(d.corte)} · ${d.dias_base} días base · ${d.faltas} falta(s) tipo 2 · ${d.dias_aguinaldo} días de aguinaldo.</p>
  <p class="fhint">Se cuentan las ausencias una vez. Los descuentos monetarios ya aplicados no se vuelven a descontar del finiquito.</p>
  ${Number(d.aguinaldo_acreditado)?`<p>Aguinaldo acreditado del ciclo: $${money(d.aguinaldo_acreditado)} · ${d.referencias.map(r=>esc(r.id)).join(', ')}.</p>`:'<p>El aguinaldo causado pendiente se incluye en el finiquito.</p>'}
  ${d.reservas.length?'<p style="color:var(--amber)">Hay una reserva vigente: resuelve su cobertura en la corrida de aguinaldo.</p><button class="btn" type="button" onclick="window.PLATINUM_AGUINALDO_UI.abrir()">Ver corrida de aguinaldo</button>':''}
  ${d.informativos.length?'<p class="fhint">'+d.informativos.length+' documento(s) sin aplicación acreditada: son informativos, no equivalen a pago previo.</p>':''}
  ${d.limitaciones.length?'<p style="color:var(--amber)">Hay '+d.limitaciones.length+' registro(s) con cobertura parcial o cantidad sin desglose. Se usan sólo las faltas verificables; no se asume que los periodos faltantes tuvieron cero faltas.</p>':''}
  <details><summary>Desglose y criterio aplicado</summary>${ctrlTabla(['Fuente','Referencia','Fecha / rango','Días','Tipo'],d.detalle.map(r=>`<tr><td>${esc(r.fuente)}</td><td>${esc(r.id)}</td><td>${esc(r.fecha||r.desde+' al '+r.hasta)}</td><td>${r.dias}</td><td>${r.tipo_aplicado}</td></tr>`))}</details></section>`;}
 const invalidar=(w,f)=>lecturas.delete(clave(w,f));
 window.PLATINUM_PRESTACIONES_FUENTES=Object.freeze({invalidar,cargar,obtener,registrar,decision,panel});
})();
