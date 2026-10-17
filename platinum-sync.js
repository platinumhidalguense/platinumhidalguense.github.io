/* PLATINUM OS · sincronización de lectura. Sin reglas de nómina ni escrituras.
   Los eventos son avisos de invalidación; el dato autorizado se vuelve a leer
   con la sesión del usuario y la RLS. No se usan importes del evento como pago. */
(function(root){
  'use strict';
  const SOURCES=Object.freeze([
    'trabajadores','cheques','obras','descuentos','documentos','vacaciones',
    'actas','nom035','pagos','prima_pagos','cuadrillas','diferenciales',
    'bloques_cheques','control_cierres_nomina','control_conciliacion_noi',
    'control_altas_bajas_cortas','control_finiquitos_transferencia'
  ]);
  function createQueue(options){
    const later=options.setTimer||setTimeout,cancel=options.clearTimer||clearTimeout;
    let timer=null,running=false,dirty=false,stopped=false,deferred=false;
    const state=s=>{if(options.onState)options.onState(s);};
    function request(){
      if(stopped)return;
      dirty=true;
      if(running)return;
      if(timer!==null)cancel(timer);
      timer=later(drain,options.delay??600);
    }
    async function drain(){
      timer=null;
      if(stopped||running||!dirty)return;
      if(!options.canRefresh()){
        deferred=true;state('pending');
        if(options.onDeferred)options.onDeferred();
        return;
      }
      deferred=false;dirty=false;running=true;state('loading');
      try{
        const ok=await options.refresh();
        if(!stopped)state(ok===true?'fresh':'error');
      }catch(e){if(!stopped)state('error');}
      finally{
        running=false;
        if(dirty&&!stopped)request();
      }
    }
    return Object.freeze({request,
      resume(){if(deferred||dirty)request();},
      stop(){stopped=true;dirty=false;if(timer!==null)cancel(timer);timer=null;},
      inspect:()=>({running,dirty,deferred,stopped})
    });
  }
  function relevant(payload,obraId){
    if(payload?.table==='obras')return true;
    if(!obraId)return false;
    // DELETE puede contener sólo la PK. No inferir a qué obra pertenecía:
    // invalidar y releer sólo el alcance seleccionado, nunca trasladar filas.
    const ids=[payload?.new?.obra_id,payload?.old?.obra_id].filter(Boolean);
    return !ids.length||ids.includes(obraId);
  }
  function connect(options){
    let active=true,transport='connecting',dataState='fresh',online=0,subscribed=false,lastFocus=0;
    const state=()=>{if(active)options.onStatus({transport,dataState,online});};
    const queue=createQueue({
      canRefresh:options.canRefresh,refresh:options.refresh,
      onState:s=>{dataState=s;state();},onDeferred:options.onDeferred,
      setTimer:options.setTimer,clearTimer:options.clearTimer,delay:options.delay
    });
    const channel=options.client.channel('platinum-rt',{config:{presence:{key:options.userId}}});
    for(const table of SOURCES)channel.on('postgres_changes',{event:'*',schema:'public',table},payload=>{
      if(active&&relevant({...payload,table},options.getObraId()))queue.request();
    });
    channel.on('presence',{event:'sync'},()=>{
      if(!active)return;
      try{online=Object.keys(channel.presenceState()).length;state();}catch(e){}
    }).subscribe(async status=>{
      if(!active)return;
      if(status==='SUBSCRIBED'){
        transport='connected';state();
        // No publicar correos ni nombres en el canal compartido de presencia.
        try{await channel.track({online:true});}catch(e){}
        if(subscribed)queue.request();
        subscribed=true;
      }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
        transport='offline';state();
      }
    });
    const focus=()=>{
      const now=(options.now||Date.now)();
      if(!active||!options.getObraId()||options.document?.visibilityState==='hidden'||now-lastFocus<30000)return;
      lastFocus=now;queue.request();
    };
    options.window?.addEventListener('focus',focus);
    options.document?.addEventListener('visibilitychange',focus);
    state();
    return Object.freeze({channel,request:queue.request,resume:queue.resume,
      stop(){
        if(!active)return;active=false;queue.stop();
        options.window?.removeEventListener('focus',focus);
        options.document?.removeEventListener('visibilitychange',focus);
        const leaving=options.client.removeChannel(channel);
        if(leaving?.catch)leaving.catch(()=>{});
      }
    });
  }
  root.PLATINUM_SYNC=Object.freeze({version:'2026-10-16.1',sources:SOURCES,createQueue,relevant,connect});
})(typeof window==='undefined'?globalThis:window);
