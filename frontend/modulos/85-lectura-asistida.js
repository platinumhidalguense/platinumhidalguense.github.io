/* Estado acotado de lectura asistida; nunca envía el recibo completo. */
(function(root){
 'use strict';
 const resultados=new Map(),procesos=new Map();let pausa=0;
 const clave=p=>JSON.stringify([p.usuario,p.obra_id,p.huella,p.region]);
 const hora=t=>new Date(t).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 async function leer(p,invocar,cambio=()=>{}){
  const k=clave(p);if(!p.region)throw Error('Selecciona una región concreta del original antes de leer.');
  if(procesos.has(k))throw Error('Este campo ya se está leyendo.');
  const avisar=(estado,texto)=>cambio({estado,texto,reintentar_en:pausa||null});
  avisar('PREPARANDO','Preparando página '+p.region.pagina+' · '+p.region.campo+'…');
  if(resultados.has(k)){avisar('RESULTADO','Propuesta recuperada del mismo original.');return resultados.get(k);}
  if(Date.now()<pausa){avisar('PAUSADO','Puedes reintentar a las '+hora(pausa)+'.');throw Error('Lectura temporalmente en pausa. Reintenta a las '+hora(pausa)+'.');}
  const controlador=new AbortController();let timer;
  procesos.set(k,true);
  try{
   avisar('LEYENDO','Leyendo sólo el campo '+p.region.campo+' en la página '+p.region.pagina+'…');
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controlador.abort();reject(Object.assign(Error('La lectura agotó el tiempo de espera. Reintenta este campo.'),{temporal:true}));},35000);});
   const r=await Promise.race([invocar({tipo:'recibo_fragmento',obra_id:p.obra_id,huella:p.huella,region:p.region},controlador.signal),timeout]);
   let data=r.data||{};const status=r.error?.context?.status;
   if(r.error?.context?.json){try{data=await (r.error.context.clone?.()||r.error.context).json();}catch{}}
   avisar('VALIDANDO','Validando la respuesta y su coincidencia literal con el original…');
   if(r.error||!data.ok){
    const temporal=data.temporal||[429,503].includes(status),fecha=Date.parse(data.reintentar_en||'');
    if(temporal)pausa=Number.isFinite(fecha)?Math.max(Date.now(),fecha):Date.now()+45000;
    const causa=data.error||(status===401||status===403?'La sesión no tiene permiso para esta lectura.':r.error?'No se pudo contactar al lector. Verifica la conexión.':'El lector no devolvió una transcripción válida.');
    throw Object.assign(Error(causa+(temporal?' Reintenta a las '+hora(pausa)+'.':'')),{temporal});
   }
   if(typeof data.literal!=='string'||data.literal!==p.region.valor)throw Error('La propuesta no coincide literalmente con la región. Revisa el original.');
   resultados.set(k,data.literal);if(resultados.size>100)resultados.delete(resultados.keys().next().value);
   avisar('RESULTADO','Transcripción recibida; se comprobará y conservará con la huella del original.');return data.literal;
  }catch(e){if(e.temporal&&pausa<=Date.now())pausa=Date.now()+45000;avisar(e.temporal?'PAUSADO':'ERROR',e.message+(e.temporal?' Reintento disponible a las '+hora(pausa)+'.':''));throw e;}
  finally{clearTimeout(timer);procesos.delete(k);}
 }
 root.PLATINUM_LECTURA_ASISTIDA=Object.freeze({leer});
})(window);
