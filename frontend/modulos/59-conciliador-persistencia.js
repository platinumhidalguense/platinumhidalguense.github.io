/* Estado durable por cierre; la pestaña sólo conserva referencias, nunca el único original. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_CONCILIADOR_PERSISTENCIA=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function useEstadoConciliacion(cfg){
  let actual=null,token=0,cola=Promise.resolve();
  const contexto=()=>cfg.context(),vigente=s=>actual===s&&contexto().obra_id===s.obra_id&&contexto().usuario_id===s.usuario_id;
  function exigir(s){if(!vigente(s))throw Error('Cambió el centro, el cierre o la sesión. La operación no se aplicará a otra nómina.');}
  async function rpc(accion,datos){const r=await cfg.rpc('control_conciliador_general',{p_accion:accion,p_datos:datos});if(r.error)throw Error(r.error.message||'No se pudo guardar el conciliador');if(!r.data||typeof r.data!=='object')throw Error('Respuesta incompleta del conciliador');return r.data;}
  function serial(fn){const trabajo=cola.catch(()=>{}).then(fn);cola=trabajo.catch(()=>{});return trabajo;}
  async function abrir(cierre_id){const t=++token,c=contexto(),d=await rpc('ABRIR',{obra_id:c.obra_id,cierre_id});if(t!==token||contexto().obra_id!==c.obra_id||contexto().usuario_id!==c.usuario_id)throw Error('Se descartó una respuesta de otra sesión o centro');if(d.obra_id!==c.obra_id||d.cierre_id!==cierre_id)throw Error('El servidor devolvió otro cierre');actual={...d,usuario_id:c.usuario_id};return actual;}
  function adoptar(d){const c=contexto();if(d.obra_id!==c.obra_id)throw Error('El expediente pertenece a otro centro');token++;actual={...d,usuario_id:c.usuario_id};return actual;}
  async function asegurar(s){exigir(s);if(s.solo_lectura)throw Error('Acceso de consulta');if(!s.estado.id){const d=await rpc('ABRIR',{obra_id:s.obra_id,cierre_id:s.cierre_id});exigir(s);Object.assign(s,d);}}
  async function refrescar(){const s=actual;exigir(s);const d=await rpc('ESTADO',{obra_id:s.obra_id,cierre_id:s.cierre_id});exigir(s);Object.assign(s,d);return s;}
  async function paso(n){const s=actual;return serial(async()=>{exigir(s);if(!s.solo_lectura&&n>1&&!s.resumen?.noi?.cero)throw Error('Guarda NOI con cero diferencias antes de avanzar');if(s.solo_lectura){s.estado={...s.estado,paso_actual:n};return s;}await asegurar(s);const d=await rpc('PASO',{obra_id:s.obra_id,cierre_id:s.cierre_id,revision:s.estado.revision,paso:n});exigir(s);s.estado=d;return s;});}
  function fila(s,a){const i=s.archivos.findIndex(x=>x.id===a.id);if(i<0)s.archivos.push(a);else s.archivos[i]=a;return a;}
  const mime=file=>file.type||({pdf:'application/pdf',xml:'application/xml',csv:'text/csv',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[String(file.name).split('.').pop().toLowerCase()]||'application/octet-stream');
  async function subir(file,etapa){const s=actual;exigir(s);if(s.solo_lectura)throw Error('Acceso de consulta');if(!(file.size>0&&file.size<=12582912))throw Error('El archivo debe pesar de 1 byte a 12 MB');const bytes=await file.arrayBuffer(),sha256=await cfg.hash(bytes);exigir(s);
   return serial(async()=>{await asegurar(s);let a=await rpc('ARCHIVO_INICIAR',{cierre_id:s.cierre_id,obra_id:s.obra_id,etapa,nombre:file.name,sha256,tamano:bytes.byteLength,mime:mime(file)});exigir(s);fila(s,a);if(a.estado!=='SUBIENDO')return a;
    const r=await cfg.storage.from('conciliacion-nomina').upload(a.ruta,file,{contentType:mime(file),upsert:false});exigir(s);if(r.error&&!/already exists|Duplicate|resource exists/i.test(r.error.message||''))throw Error(r.error.message);
    a=await rpc('ARCHIVO_FINALIZAR',{cierre_id:s.cierre_id,archivo_id:a.id});exigir(s);return fila(s,a);
   });
  }
  async function actualizarArchivo(a,accion,datos){const s=actual;const copia=JSON.parse(JSON.stringify(datos));return serial(async()=>{exigir(s);const vigente=s.archivos.find(x=>x.id===a.id)||a;const d=await rpc(accion,{obra_id:s.obra_id,cierre_id:s.cierre_id,archivo_id:a.id,revision:vigente.revision,...copia});exigir(s);return fila(s,d);});}
  const propuesta=(a,p)=>actualizarArchivo(a,'PROPUESTA',{propuesta:p}),errorArchivo=(a,e)=>actualizarArchivo(a,'ERROR_ARCHIVO',{error:String(e?.message||e).slice(0,700)});
  async function importarBanco(a){const s=actual;return serial(async()=>{exigir(s);const vigente=s.archivos.find(x=>x.id===a.id)||a;const r=await rpc('IMPORTAR_BANCO',{obra_id:s.obra_id,cierre_id:s.cierre_id,archivo_id:a.id,revision:vigente.revision,confirmar:true});exigir(s);await refrescar();return r;});}
  async function descargar(a){const s=actual;exigir(s);const r=await cfg.storage.from('conciliacion-nomina').download(a.ruta);exigir(s);if(r.error||!r.data)throw Error(r.error?.message||'El original privado no está disponible');const bytes=await r.data.arrayBuffer();if(await cfg.hash(bytes)!==a.sha256)throw Error('La huella del archivo cambió; no se utilizará otra versión');exigir(s);return cfg.file(bytes,a.nombre,a.mime);}
  async function ver(a){const s=actual;exigir(s);const r=await cfg.storage.from('conciliacion-nomina').createSignedUrl(a.ruta,60);exigir(s);if(r.error||!r.data?.signedUrl)throw Error('No se pudo abrir el original privado');cfg.open(r.data.signedUrl);}
  function invalidar(){token++;actual=null;}
  return Object.freeze({adoptar,abrir,refrescar,paso,subir,propuesta,errorArchivo,importarBanco,descargar,ver,invalidar,estado:()=>actual});
 }
 return Object.freeze({useEstadoConciliacion});
});
