/* Una lectura por contexto. Sin suscripciones ni temporizadores; las respuestas
   anteriores nunca sustituyen la semana, obra o sesión que está visible. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_CONCILIACION_SEMANAL=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function useConciliacionSemanal(cfg){
  let token=0,controller=null,state={loading:false,data:null,error:null,seleccion:null};
  const vigente=c=>{const now=cfg.context();return c.obra_id===now.obra_id&&c.usuario_id===now.usuario_id&&now.visible!==false;};
  const emitir=()=>cfg.onChange?.(state);
  function invalidar(){token++;controller?.abort();controller=null;state={loading:false,data:null,error:null,seleccion:null};}
  async function cargar(semana=null,cierre=null,opt={}){
   const c={...cfg.context()};if(!c.obra_id||!c.usuario_id)throw Error('Selecciona un centro con sesión válida');
   if(semana!=null&&(!Number.isInteger(Number(semana))||Number(semana)<1||Number(semana)>53))throw Error('Semana no válida');
   controller?.abort();controller=new AbortController();const current=++token;
   const previa=opt.conservar&&state.data?.semana===Number(semana)&&state.data?.obra_id===c.obra_id?state.data:null;state={contexto:c,loading:true,data:previa,error:null,seleccion:{semana:semana==null?null:Number(semana),cierre}};emitir();
   try{
    const request=cfg.rpc('control_conciliacion_semanal',{p_obra:c.obra_id,p_semana:state.seleccion.semana,p_cierre:cierre});
    const r=await(request.abortSignal?request.abortSignal(controller.signal):request);
    if(current!==token||!vigente(c))return null;
    if(r.error)throw Error(r.error.message||'No se pudo consultar la semana');
    const d=r.data;if(!d||d.obra_id!==c.obra_id||(semana!=null&&d.semana!==Number(semana))||(cierre&&d.detalle?.cierre?.id!==cierre))throw Error('El servidor devolvió otro contexto');
    state={contexto:c,loading:false,data:d,error:null,seleccion:{semana:d.semana,cierre:d.detalle?.cierre?.id||null}};emitir();return d;
   }catch(e){if(current!==token||!vigente(c))return null;state={...state,loading:false,data:null,error:e.message||String(e)};emitir();throw e;}
  }
  return Object.freeze({cargar,invalidar,estado:()=>state});
 }
 return Object.freeze({useConciliacionSemanal});
});
