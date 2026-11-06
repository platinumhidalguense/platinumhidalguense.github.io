/* Engranes puros: adaptadores de captura; no contienen fórmulas fiscales. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_CALENDARIO_CORE=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const errorBruto='El motor actual no soporta gravamen dinámico para este concepto. Capture el importe Neto Autorizado';
 const fecha=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Fecha inválida');const d=new Date(s+'T12:00:00Z');if(d.toISOString().slice(0,10)!==s)throw Error('Fecha inválida');return d;};
 const iso=d=>d.toISOString().slice(0,10),cent=x=>Math.round((Number(x)||0)*100)/100;
 function celdasMes(mes){const d=fecha(mes+'-01'),desde=iso(d);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const hasta=iso(d),n=d.getUTCDate(),prev=(fecha(desde).getUTCDay()+6)%7;return{desde,hasta,celdas:[...Array(prev).fill(null),...Array.from({length:n},(_,i)=>mes+'-'+String(i+1).padStart(2,'0'))]};}
 function useInyectorPercepciones(j){if(j.naturaleza_importe!=='NETO_DIRECTO')throw Error(errorBruto);const monto=Number(j.monto);if(!Number.isFinite(monto)||monto<=0)throw Error('Captura un importe neto positivo');return{otros_pagos:[{neto:cent(monto),naturaleza_importe:'NETO_DIRECTO',tratamiento_fiscal:'EXTERNO_NO_DETERMINADO'}]};}
 function useCalculoRetencion(w,j,descuentos,calcular){const d=descuentos.find(d=>d.id===j.credito_id&&d.activo&&d.recurrente&&['INFONAVIT','FONACOT'].includes(d.tipo));if(!d)throw Error('Selecciona un crédito activo');const n=Number(j.dias_extra);if(!Number.isInteger(n)||n<1||n>31)throw Error('Captura de 1 a 31 días adicionales');return cent(calcular(d,w,j.fecha,n));}
 function useIncidencias(w,j,q,catalogo,calcular){
  const cat=catalogo.find(c=>c.id===Number(j.id_incidencia));if(!cat)throw Error('Selecciona el tipo de falta');
  if(cat.clase==='INCAPACIDAD')throw Error('Gestiona el certificado y sus pagadores en el expediente IMSS de esta ficha');
  const originales=(q.eventos||[]).filter(e=>e.clase==='AUSENCIA'&&!e.retroactivo&&e.estado==='APLICADO'),dias=originales.filter(e=>e.id!==j.retirar_id);
  if(!j.retirar_id&&dias.some(e=>e.fecha_aplicacion===j.fecha))throw Error('Ese día ya tiene una ausencia aplicada');
  const periodo=q.destino,iguales=d=>d.ajustes_semana?._periodo_nomina?d.ajustes_semana._periodo_nomina.desde===periodo.desde&&d.ajustes_semana._periodo_nomina.hasta===periodo.hasta:d.semana==='S'+periodo.semana;
  const descuentos=(q.descuentos||[]).filter(d=>d.activo&&iguales(d)),anterior=descuentos.filter(d=>d.calendario_evento_id&&d.ajustes_semana?._grupo_calendario).reduce((s,d)=>s+Number(d.monto),0);
  const contrato=meta=>({_periodo_nomina:{desde:periodo.desde,hasta:periodo.hasta},_calculo_incidencia:meta});
  if(j.manual_validado||cat.automatismo!=='FALTA'||dias.some(e=>e.id_incidencia!==2)){
   if(!j.manual_validado||!Number.isFinite(Number(j.monto_manual))||Number(j.monto_manual)<0)throw Error('Esta combinación NOI requiere el importe neto validado del periodo; no se aplicará la regla de falta injustificada');
   const total=cent(j.monto_manual);if(total<anterior&&!q.retroactivo&&!j.retirar_id)throw Error('El importe grupal no puede disminuir al agregar otra fecha; revisa la captura anterior');
   return{monto:q.retroactivo?total:Math.abs(cent(total-anterior)),monto_grupo:total,contrato:contrato({modo:'MANUAL_CONFIRMADO',tipo_noi:cat.id})};
  }
  const contexto=q.retroactivo?{...q.origen,dias:Math.round((fecha(q.origen.hasta)-fecha(q.origen.desde))/86400000)+1}:{...periodo,dias:Math.round((fecha(periodo.hasta)-fecha(periodo.desde))/86400000)+1};
  let calculado=w;
  if(q.retroactivo){const h=q.trabajador_origen;if(!h||!(Number(h.sd)>0)||!(Number(h.sdi)>0)||h.sal_semanal==null)throw Error('La fotografía histórica no conserva SD/SDI suficientes; no se recalculará con el sueldo actual. Requiere importe neto respaldado.');if(Number(q.incidencias_origen)>0)throw Error('El periodo histórico ya tenía incidencias: captura sólo el ajuste neto validado para no repetir descuentos.');calculado={...w,...h};}
  const f=q.retroactivo?1:dias.length+(j.retirar_id?0:1),bases=descuentos.filter(d=>d.ajustes_semana?._imss_certificados);
  if(bases.length>1)throw Error('Hay más de una incidencia IMSS para el periodo; concilia su fuente antes de agregar faltas');
  const base=bases[0],calendario=base?(base.ajustes_semana._imss_certificados||[]).flatMap(c=>c.dias||[]):[];
  if(calendario.some(d=>d.fecha===j.fecha)&&!j.retirar_id)throw Error('Ese día está cubierto por un certificado IMSS; no dupliques una falta');
  const i=q.retroactivo?0:new Set(calendario.filter(d=>['IMSS','SIN_PAGO'].includes(d.pagador)).map(d=>d.fecha)).size;
  if(f+i>contexto.dias)throw Error('Los días de ausencia superan los días del periodo');
  const r=calcular(calculado,f,0,undefined,i,contexto);let total=r.monto;
  if(i){const imss=calcular(calculado,0,0,undefined,i,contexto);if(cent(imss.monto)!==cent(base.monto))throw Error('La incidencia IMSS cambió; actualiza su calendario antes de combinar faltas');total=cent(r.monto-imss.monto);}
  const meta={version:1,motor_nomina:w.periodo_pago==='QUINCENAL'?'QUINCENAL_V1':'SEMANAL_V1',modo:i&&f?'INCREMENTAL_IMSS':'AUTOMATICO',faltas:f,incapacidad_imss:i&&f?i:0,premios:0,sd:Number(calculado.sd),sdi:Number(calculado.sdi),sueldo_registrado:Number(calculado.sal_semanal),dias:contexto.dias};if(i&&f)meta.descuento_base_id=base.id;
  return{monto:q.retroactivo?total:Math.abs(cent(total-anterior)),monto_grupo:total,contrato:contrato(meta),resultado:r};
 }
 function alertasLegales({sd,sm,dias,salarioDisponible,infonavit=0,fonacot=0,prestamos=0,ausencia=false,sbc=false,extra=0}){
  const a=[],base=Math.max(0,Number(sd)*dias),min=Math.max(0,Number(sm)*dias);
  if(infonavit+fonacot+prestamos+extra>Math.max(0,salarioDisponible))a.push({nivel:'rojo',codigo:'CAPACIDAD',texto:'Créditos y préstamos superan el neto disponible. Revise capacidad y prelación; no se ajustarán importes automáticamente.'});
  if(prestamos>Math.max(0,(base-min)*.30))a.push({nivel:'ambar',codigo:'LFT110I',texto:'Préstamo/anticipo supera el 30% del excedente del salario mínimo del periodo; revise acuerdo y art.110-I LFT.'});
  if(fonacot>base*(sd<=sm?.10:.20))a.push({nivel:'ambar',codigo:'FONACOT',texto:'Revise el límite FONACOT y la aceptación del trabajador (arts.97-IV y110-VII LFT).'});
  if(sd<=sm&&infonavit>base*.20)a.push({nivel:'ambar',codigo:'LFT97III',texto:'Revise límite INFONAVIT de salario mínimo, aviso y artículo97-III LFT.'});
  if(ausencia&&infonavit>0)a.push({nivel:'ambar',codigo:'INF29',texto:'La ausencia/incapacidad no suspende automáticamente el descuento INFONAVIT (art.29). Revise aviso, salario disponible y tratamiento aplicable; no invente una retención.'});
  if(sbc)a.push({nivel:'ambar',codigo:'SBC',texto:'Este concepto requiere revisar integración al SBC. La captura neta no modifica SDI ni determina exención fiscal.'});
  return a;
 }
 return Object.freeze({celdasMes,useIncidencias,useCalculoRetencion,useInyectorPercepciones,alertasLegales,errorBruto});
});
