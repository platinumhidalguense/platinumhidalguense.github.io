/* Guardado NOI comprobable. No calcula nómina ni escribe tablas: orquesta servicios existentes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_CONCILIADOR_NOI=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const canon=x=>x&&typeof x==='object'?Array.isArray(x)?x.map(canon):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
 const igual=(a,b)=>JSON.stringify(canon(a))===JSON.stringify(canon(b));
 function useGuardadoNOI(cfg){
  let vuelo=null;
  function exigir(){if(!cfg.vigente()){const e=Error('Cambió el centro, cierre, sesión o lectura. Recupera el periodo; el resultado no se aplicará a otra pantalla.');e.obsoleto=true;throw e;}}
  async function ejecutar(captura){
   const {cierre:c,archivo:a,lectura:st}=captura;
   exigir();
   if(!c?.id||!a?.id||a.etapa!==1||!st?.rows?.length||!st.file||!st.hash)throw Error('Retoma la lectura del original antes de guardar.');
   if(!captura.escritura)throw Error('Tu usuario sólo puede consultar.');
   if(a.sha256!==st.hash||a.propuesta?.hash!==st.hash||a.propuesta?.snapshot_sha256!==c.snapshot_sha256||!igual(a.propuesta.rows,st.rows))throw Error('La captura no corresponde al original y fotografía seleccionados. Retoma ese original.');
   if(await cfg.hash(await st.file.arrayBuffer())!==st.hash)throw Error('La huella del original no coincide con la lectura.');
   exigir();
   const comprobarContexto=d=>{exigir();const x=d?.cierre;if(!x||x.id!==c.id||x.obra_id!==c.obra_id||x.semana!==c.semana||x.periodo!==c.periodo||x.snapshot?.empresa_codigo!==c.snapshot?.empresa_codigo)throw Error('El servidor devolvió otro periodo o razón social.');if(x.snapshot_sha256!==c.snapshot_sha256)throw Error('La fotografía cambió desde la lectura. Retoma el original archivado para compararlo con la fotografía actual.');return d;};
   const prueba=d=>d.cierre.archivo_noi_sha256===st.hash&&d.resumen?.noi?.guardado===true&&Number(d.resumen.noi.filas_guardadas)===st.rows.length&&d.resumen.noi.fotografia_sha256===c.snapshot_sha256;
   let d=comprobarContexto(await cfg.leer()),recuperado=prueba(d),respuesta=null;
   const actual=d.archivos?.find(x=>x.id===a.id);
   if(!actual||actual.sha256!==a.sha256||actual.propuesta?.hash!==st.hash||actual.propuesta?.snapshot_sha256!==c.snapshot_sha256||!igual(actual.propuesta.rows,st.rows))throw Error('Otro usuario cambió la propuesta seleccionada. Retoma el original para revisarla.');
   if(!recuperado){
    if(!['BORRADOR','REVISADO'].includes(d.cierre.estado))throw Error('El periodo está protegido; solicita reapertura antes de sustituir el reporte.');
    cfg.estado?.('Conciliación guardándose…');
    try{respuesta=await cfg.importar(st,c);exigir();if(!respuesta||Number(respuesta.filas)!==st.rows.length||!respuesta.diagnostico)throw Error('El servidor no confirmó las filas y el diagnóstico del guardado.');}
    catch(error){exigir();try{d=comprobarContexto(await cfg.leer());}catch(verificacion){error.message+=' No fue posible comprobar si se guardó. Conserva el original y reintenta de forma segura.';throw error;}if(!prueba(d))throw error;recuperado=true;}
    d=comprobarContexto(await cfg.leer());if(!prueba(d))throw Error('El guardado no coincide con el reporte, las filas o la fotografía vigente. No se habilitó el avance.');
   }
   cfg.estado?.('Conciliación guardada; comprobando vínculo del original…');
   try{
    const original=d.archivos.find(x=>x.id===a.id);
    if(!original.propuesta.guardado||original.propuesta.filas_guardadas!==st.rows.length)await cfg.vincular(original,{...original.propuesta,guardado:true,filas_guardadas:st.rows.length,snapshot_sha256:c.snapshot_sha256,hash:st.hash});
    d=comprobarContexto(await cfg.leer());if(!prueba(d))throw Error('Otro reporte sustituyó la conciliación durante la comprobación.');
    const vinculado=d.archivos.find(x=>x.id===a.id);if(!vinculado?.propuesta?.guardado||vinculado.propuesta.snapshot_sha256!==c.snapshot_sha256||vinculado.propuesta.hash!==st.hash)throw Error('El original aún no confirma el vínculo.');
   }catch(error){exigir();return {guardado:true,vinculo_pendiente:true,recuperado,datos:d,error:error.message};}
   return {guardado:true,vinculo_pendiente:false,recuperado,datos:d};
  }
  function guardar(captura){if(vuelo)return vuelo;vuelo=ejecutar(captura).finally(()=>{vuelo=null;});return vuelo;}
  return Object.freeze({guardar,ocupado:()=>!!vuelo});
 }
 return Object.freeze({useGuardadoNOI});
});
