/* Archivo, lectura fiscal y pago son estados distintos. Sólo verifica documentos. */
(function(root){
 'use strict';let state=null;
 const ctx=()=>({obra:OBRA?.id,user:USER?.id}),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function vigente(s){const c=ctx();return state===s&&c.obra===s.obra&&c.user===s.user;}
 function comprobar(s){const c=ctx();if(c.obra!==s.obra||c.user!==s.user)throw Error('Cambió el centro o la sesión; se detuvo la verificación.');}
 async function rpc(action,p){if(['RECIBO','RECIBO_ERROR'].includes(action)&&typeof markWrite==='function')markWrite();const r=await sb.rpc('control_flujo_operar',{p_accion:action,p_datos:p});if(r.error)throw Error(r.error.message||'No se confirmó la operación');if(!r.data)throw Error('Respuesta incompleta del servidor');return r.data;}
 async function reintentar(fn){let last;for(let i=0;i<3;i++){try{return await fn();}catch(e){last=e;if(i===2||!/429|50[234]|network|fetch|red|temporal|timeout/i.test(e.message||''))throw e;await new Promise(r=>setTimeout(r,400*(i+1)));}}throw last;}
 async function concurrente(n,trabajo){let error=null;await Promise.all(Array.from({length:n},async()=>{try{await trabajo(()=>!!error);}catch(e){error=e;}}));if(error)throw error;}
 async function verificar(doc,tipos,contexto,{bytes=null,fiscal=true,cierre=null,cache=null}={}){
  let etapa='LECTURA';try{
   comprobar(contexto);const key=doc.hash||doc.archivo;let info;
   if(cache){if(!cache.has(key))cache.set(key,reintentar(()=>leerReciboArchivado(doc,bytes)));info=await cache.get(key);}
   else info=await reintentar(()=>leerReciboArchivado(doc,bytes));
   comprobar(contexto);if(!Number.isFinite(info.neto)||!info.datos||info.errores?.length)throw Error(info.errores?.join('; ')||'No se extrajo un recibo válido.');
   etapa='CONCEPTO';const fuentes=[...new Set((tipos||[]).filter(x=>['NOMINA','FINIQUITO'].includes(x)))],tipo=info.tipo||(fuentes.length===1?fuentes[0]:null);
   if(tipo&&fuentes.length&&!fuentes.includes(tipo))throw Error('El concepto del PDF contradice las fuentes de esa semana. Revisa nómina/finiquito.');
   if(!tipo&&(!info.datos.cfdi_uuid||!info.datos.evidencia_timbrado))throw Error('Faltan concepto y evidencia de timbrado; revisa el PDF o su XML.');
   etapa='GUARDADO';const payload={documento_id:doc.id,hash:doc.hash,neto:info.neto,tipo,datos:info.datos,solo_archivo:!tipo};if(cierre)payload.cierre_id=cierre;
   const saved=await reintentar(()=>{comprobar(contexto);return rpc('RECIBO',payload);});
   if(saved.documento_id!==doc.id||Number(saved.neto)!==Number(info.neto))throw Error('No se confirmó la lectura guardada.');
   etapa='TIMBRADO';if(fiscal&&(!info.datos.cfdi_uuid||!info.datos.evidencia_timbrado))throw Error('Importes leídos; falta evidencia verificable de UUID y sello SAT. Revisa el PDF o utiliza su XML timbrado.');
   return{ok:true,documento_id:doc.id};
  }catch(e){
   comprobar(contexto);
   if(/inicia.*sesi[oó]n|JWT|401|403|42501|sin permiso|no tienes permiso|failed to fetch|network/i.test(e.message||''))throw e;
   let registro='';try{await rpc('RECIBO_ERROR',{documento_id:doc.id,hash:doc.hash,etapa,mensaje:e.message});}catch(err){registro=' No se pudo guardar la causa: '+err.message;}
   return{ok:false,documento_id:doc.id,nombre:'#'+(doc.no_trab??'—')+' '+(doc.nombre||doc.trabajador_id),etapa,causa:e.message+registro};
  }
 }
 function render(s){if(!vigente(s))return;
  const r=s.resumen||{semanas:[]},semanas=r.semanas||[],total=semanas.filter(x=>!s.sem||Number(x.semana)===s.sem).reduce((n,x)=>n+Number(x.pendientes),0);
  modal(`<div class="m-head"><h2>Verificación de recibos archivados</h2><button class="x" onclick="PLATINUM_RECIBOS_VERIFICACION.pausar();closeModal()">×</button></div>
   <div class="m-body"><p>PDF archivado, CFDI verificado y pago aplicado se controlan por separado. Esta función no paga, no autoriza ni modifica el cierre.</p>
   <label>Semana</label><select id="rv-sem" onchange="PLATINUM_RECIBOS_VERIFICACION.semana(this.value)" ${s.running?'disabled':''}><option value="0">Todas las semanas del centro</option>${semanas.filter(x=>x.semana!=null).map(x=>`<option value="${x.semana}" ${s.sem===Number(x.semana)?'selected':''}>S${x.semana} · ${x.pendientes} PDF por verificar</option>`).join('')}</select>
   <p id="rv-progreso" role="status">${s.done} procesados · ${s.ok} verificados · ${s.failed.length} por revisar${s.paused?' · Pausado':''}.</p>
   <p class="fhint">${total} PDF por verificar en la selección. Los ya verificados no se descargan de nuevo. Un CFDI histórico puede verificarse sin asignarle un concepto de pago; ese concepto se revisará con el cierre.</p>
   ${ctrlTabla(['Semana','Archivados','Leídos','Verificados fiscalmente','Por verificar','Concepto por clasificar','Con error registrado'],semanas.filter(x=>!s.sem||s.sem===Number(x.semana)).map(x=>`<tr><td>${x.semana==null?'Sin semana':'S'+x.semana}</td><td>${x.archivados}</td><td>${x.leidos}</td><td>${x.verificados}</td><td>${x.pendientes}</td><td>${x.concepto_pendiente||0}</td><td>${x.errores}</td></tr>`),'Sin PDF archivados.')}
   <div id="rv-errores">${erroresHTML(s)}</div></div><div class="m-foot"><button class="btn" onclick="PLATINUM_RECIBOS_VERIFICACION.pausar()">Pausar</button>
   <button class="btn dark" id="rv-iniciar" onclick="PLATINUM_RECIBOS_VERIFICACION.iniciar()" ${s.running||!r.escritura?'disabled':''}>${s.paused?'Continuar':'Verificar pendientes'}</button></div>`,'lg');
 }
 function erroresHTML(s){return s.failed.length?'<details open><summary>Documentos por revisar</summary>'+ctrlTabla(['Trabajador','Etapa','Causa'],s.failed.map(x=>`<tr><td>${esc(x.nombre)}</td><td>${esc(x.etapa)}</td><td>${esc(x.causa)}</td></tr>`),'')+'</details>':'';}
 function progreso(s){if(!vigente(s))return;const n=$('rv-progreso');if(n)n.textContent=`${s.done} procesados · ${s.ok} verificados · ${s.failed.length} por revisar${s.paused?' · Pausado':''}.`;const e=$('rv-errores');if(e)e.innerHTML=erroresHTML(s);}
 async function abrir(sem=0){if(state?.running){toast('Hay una verificación en curso. Páusala antes de abrir otra.','err');return;}
  const c=ctx();if(!c.obra)return;const s={...c,sem:Number(sem)||0,resumen:null,cursor:null,queue:[],next:0,done:0,ok:0,failed:[],paused:false,running:false,completed:false,processed:new Set(),cache:new Map()};state=s;
  try{s.resumen=await rpc('RECIBOS_RESUMEN',{obra_id:s.obra});if(vigente(s))render(s);}catch(e){toast('No se pudo consultar la verificación: '+e.message,'err');}
 }
 function semana(v){if(!state||state.running)return;Object.assign(state,{sem:Number(v)||0,cursor:null,queue:[],next:0,done:0,ok:0,failed:[],paused:false,completed:false,processed:new Set(),cache:new Map()});render(state);}
 function pausar(){if(state){state.paused=true;progreso(state);}}
 async function iniciar(){const s=state;if(!s||s.running||!s.resumen?.escritura)return;
  if(s.completed)Object.assign(s,{cursor:null,queue:[],next:0,done:0,ok:0,failed:[],cache:new Map(),processed:new Set(),completed:false});
  s.running=true;s.paused=false;const btn=$('rv-iniciar');if(btn)btn.disabled=true;
  try{while(!s.paused){comprobar(s);if(!vigente(s))break;
    if(s.next>=s.queue.length){const p={obra_id:s.obra,limite:25};if(s.sem)p.semana=s.sem;if(s.cursor)p.cursor=s.cursor;
      const batch=await rpc('RECIBOS_PENDIENTES',p);comprobar(s);
      if(batch.obra_id!==s.obra||!Array.isArray(batch.filas))throw Error('Respuesta de documentos incompleta o de otro centro.');
      if(!batch.filas.length){s.completed=true;break;}if(!batch.cursor||batch.cursor===s.cursor)throw Error('No avanzó la paginación de documentos.');
      s.cursor=batch.cursor;s.queue=batch.filas;s.next=0;
    }
    await concurrente(Math.min(3,s.queue.length-s.next),async cancelado=>{while(!cancelado()&&!s.paused&&s.next<s.queue.length){if(!$('rv-progreso')){s.paused=true;break;}comprobar(s);const index=s.next++,doc=s.queue[index];if(s.processed.has(doc.id))continue;
      let r;try{r=await verificar(doc,doc.tipos_fuente,s,{cache:s.cache});}catch(e){s.paused=true;s.next=Math.min(s.next,index);throw e;}
      s.processed.add(doc.id);if(r.ok)s.ok++;else s.failed.push(r);s.done++;progreso(s);}});
   }
   if(vigente(s)){s.resumen=await rpc('RECIBOS_RESUMEN',{obra_id:s.obra});toast(`${s.ok} recibos verificados; ${s.failed.length} requieren revisión${s.paused?' · Verificación pausada':''}.`,s.failed.length?'err':'ok');}
  }catch(e){s.paused=true;toast('Verificación detenida: '+e.message,'err');}
  finally{s.running=false;if(vigente(s)){progreso(s);render(s);}}
 }
 async function procesarCierre(d,fiscal=false){const c=ctx(),s={...c},failed=[],cache=new Map();let next=0,ok=0,done=0;const docs=d.recibos_sin_leer||[];
  if(c.obra!==d.cierre.obra_id)throw Error('El cierre no corresponde al centro abierto.');
  await concurrente(Math.min(3,docs.length),async cancelado=>{while(!cancelado()&&next<docs.length){const doc=docs[next++],items=(d.cierre.snapshot.items||[]).filter(x=>x.trabajador_id===doc.trabajador_id);
    const r=await verificar({...doc,no_trab:items[0]?.numero,nombre:items[0]?.nombre},items.map(x=>x.tipo||'NOMINA'),s,{fiscal,cierre:d.cierre.id,cache});
    if(r.ok)ok++;else failed.push(r);done++;if($('flow-progress'))$('flow-progress').textContent=`Verificando PDF ${done}/${docs.length} · ${ok} correctos · ${failed.length} por revisar…`;
  }});return{ok,failed};
 }
 async function trasImportar(docs){if(!docs.length)return;const c=ctx(),s={...c},cache=new Map();let ok=0;const failed=[];
  for(let offset=0;offset<docs.length;offset+=25){comprobar(s);const subset=docs.slice(offset,offset+25),map=new Map(subset.map(d=>[d.id,d]));
   const batch=await rpc('RECIBOS_PENDIENTES',{obra_id:s.obra,ids:subset.map(d=>d.id),limite:50});
   if(batch.obra_id!==s.obra||!Array.isArray(batch.filas))throw Error('No se confirmó el lote de recibos importados.');let next=0;
   await concurrente(Math.min(3,batch.filas.length),async cancelado=>{while(!cancelado()&&next<batch.filas.length){const doc=batch.filas[next++],r=await verificar(doc,doc.tipos_fuente,s,{cache,bytes:map.get(doc.id)?.bytes});if(r.ok)ok++;else failed.push(r);}});
  }
  toast(`${ok} PDF importados y verificados${failed.length?`; ${failed.length} archivados con lectura por revisar`:''}.`,failed.length?'err':'ok');return{ok,failed};
 }
 root.PLATINUM_RECIBOS_VERIFICACION=Object.freeze({abrir,semana,iniciar,pausar,procesarCierre,trasImportar});
})(window);
