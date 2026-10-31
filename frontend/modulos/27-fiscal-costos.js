/* ================= V10: FISCAL 2026, COSTOS, BAJAS LEGALES, VERIFICADOR ================= */
function FISC(){const f=CFGEMP['fiscal']||{};return {anio:Number(f.anio)||new Date().getFullYear(),sm:f.sm||315.04,uma:f.uma||117.31,umi:f.umi||100.81,isn:(f.isn!=null?f.isn:3.0),seg:(f.seguro_danos_bim!=null?f.seguro_danos_bim:15),ceav:f.ceav||[[1,3.150],[1.5,3.68],[2.0,4.85],[2.5,5.56],[3.0,6.03],[3.5,6.36],[4.0,6.61],[99,7.51]]};}
function redondearCentavos(v){return Math.round((Number(v)||0)*100+Number.EPSILON)/100;}
function catalogoPuestos(){
  const c=CFGEMP['catalogo_puestos'];
  // v13: LISTA CERRADA — los puestos con typo ya NO se cuelan al selector.
  const base=Array.isArray(c)?c:['OFICIAL ALBAÑIL','OFICIAL FIERRERO','OFICIAL CARPINTERO','OFICIAL MOLDERO','OFICIAL YESERO','OFICIAL PINTOR','OFICIAL PLOMERO','OFICIAL ELECTRICISTA','OFICIAL COLOCADOR DE PISO','CABO DE OFICIOS','AYUDANTE ALBAÑIL','AYUDANTE FIERRERO','AYUDANTE YESERO','AYUDANTE GENERAL','RESIDENTE DE OBRA','OPERADOR DE RETROEXCAVADORA','OPERADOR DE EXCAVADORA','OPERADOR DE TRACTOR','OPERADOR DE VIBROCOMPACTADOR','OPERADOR DE MOTOCONFORMADORA','OPERADOR DE MAQUINARIA','INSTALADOR DE PUERTAS Y VENTANAS','APLICADOR DE IMPERMEABILIZANTE','CHOFER DE OBRA','ALMACENISTA','VIGILANTE','PERSONAL DE LIMPIEZA','AUXILIAR ADMINISTRATIVO','ADMINISTRATIVO','CONTADOR','ABOGADA','ARQUITECTO','SUBGERENTE','VENTAS'];
  return [...base].sort();
}
/* --- ISR 2026 (Anexo 8 RMF, DOF 28/12/2025) --- */
const ISR_M=[[0.01,844.59,0,1.92],[844.60,7168.51,16.22,6.40],[7168.52,12598.02,420.95,10.88],[12598.03,14644.64,1011.68,16.00],[14644.65,17533.64,1339.14,17.92],[17533.65,35362.83,1856.84,21.36],[35362.84,55736.68,5665.16,23.52],[55736.69,106410.50,10457.09,30.00],[106410.51,141880.66,25659.23,32.00],[141880.67,425641.99,37009.69,34.00],[425642.00,1e12,133488.54,35.00]];
function isrTarifa(base,factor,raw){ // factor 1=mensual, 7*12/365=semanal
  // raw=true devuelve el ISR SIN redondear (para que el NETO del finiquito se
  // redondee una sola vez al final, como NOI). Por defecto (nómina semanal)
  // redondea a 2 decimales, EXACTAMENTE como antes — no afecta el motor.
  if(base<=0)return 0;
  for(const [li,ls,cf,pc] of ISR_M){
    const LI=li*factor,LS=ls*factor,CF=cf*factor;
    if(base>=LI&&base<=LS){const v=CF+(base-LI)*pc/100;return raw?v:Math.round(v*100)/100;}
  }
  return 0;
}
/* La tarifa mensual se proporciona a los días del periodo: 365/12 = 30.4167
   días al mes, así que el factor es dias×12/365 (7 → semanal, 15 → quincenal).
   Es la misma proporción con la que el SAT publica las tablas del Anexo 8. */
const F_SEM=7*12/365;
function factorISR(dias){return (Math.max(1,Number(dias)||7))*12/365;}
function isrPeriodo(b,dias,raw){return isrTarifa(b,factorISR(dias),raw);}
function isrSemanal(b){return isrTarifa(b,F_SEM);}
function isrMensual(b,raw){return isrTarifa(b,1,raw);}
/* --- INFONAVIT con seguro de daños ($15/bimestre, portal INFONAVIT) --- */
function diasBimestreActual(d=new Date()){
  if(!(d instanceof Date))d=new Date(String(d).slice(0,10)+'T12:00:00');
  const m=d.getMonth(); const b0=m-(m%2);
  return new Date(d.getFullYear(),b0+2,0).getDate()+new Date(d.getFullYear(),b0+1,0).getDate();
}
function fechaFinSemanaISO(semStr,anio=FISC().anio){
  const sem=Math.max(1,Math.min(53,parseInt(String(semStr||'').replace(/\D/g,''))||isoWeek()));
  const jan4=new Date(Date.UTC(Number(anio)||new Date().getFullYear(),0,4));
  const domingo=new Date(jan4);
  domingo.setUTCDate(jan4.getUTCDate()-((jan4.getUTCDay()||7)-1)+(sem-1)*7+6);
  return new Date(domingo.getUTCFullYear(),domingo.getUTCMonth(),domingo.getUTCDate(),12);
}
/* Fórmula SUA: (cuota bimestral + seguro de daños) ÷ días del bimestre ×
   días del periodo. Con 7 da la cuota semanal de obra; con 15, la quincenal
   de oficina. Antes el 7 estaba clavado y a los quincenales se les retenía
   media cuota. */
function cuotaPeriodoInfonavit(mensual,dias,fecha){
  const f=FISC();
  const dp=Math.max(0,Number(dias)||0), db=diasBimestreActual(fecha||new Date());
  return redondearCentavos(((Number(mensual)||0)*2+f.seg)/db*dp);
}
function cuotaSemanalInfonavit(mensual,fecha){return cuotaPeriodoInfonavit(mensual,7,fecha);}
function retencionInfonavitDesdeAviso(d,w,dias,fecha){
  if(d?.infonavit_avisos_historial?.length)d=infonavitCreditoAFecha(d,fecha||new Date());
  const factor=Number(d&&d.factor), dp=Math.max(0,Number(dias)||0);
  if(!(factor>0)||!(dp>0))return null;
  const f=FISC(), db=diasBimestreActual(fecha||new Date());
  const mod=String(d.modalidad||'CUOTA_FIJA').toUpperCase();
  const seguro=f.seg/db*dp;
  if(mod==='PORCENTAJE'){
    const sdi=Number(w&&(w.sdi||w.sd))||0;
    return sdi>0?redondearCentavos(sdi*factor/100*dp+seguro):null;
  }
  const mensual=mod==='VSM_UMI'?factor*f.umi:factor;
  return redondearCentavos(mensual*2/db*dp+seguro);
}
/* --- CUOTAS IMSS/ISN (LSS arts. 25,71,106,107,147,168,211; CEAV 2026 4o ajuste) ---
   v36: el módulo "Costo patronal · simulador" se eliminó del sistema por
   petición del usuario. Esta función se conserva porque es la calculadora de
   cuotas IMSS del proyecto (parte del motor fiscal, calibrada contra la EBA),
   NO parte del simulador: se deja disponible para cálculos futuros. */
function cuotasSemana(w,prima,diasCot,diasPeriodo){
  if(periodoPago(w)!=='SEMANAL')throw Error('Las cuotas semanales requieren un trabajador semanal.');
  const f=FISC(); const sbc=Math.min(Number(w.sdi)||Number(w.sd)||0, 25*f.uma);
  const dp=Math.max(1,Number(diasPeriodo)||7);
  if(dp>7)throw Error('Las cuotas semanales no pueden cubrir más de siete días.');
  const d=(diasCot==null?dp:Math.max(0,diasCot)); const B=sbc*d; // REGLA IMSS: con ausentismo se cotizan dias−faltas (LSS art. 31)
  const enUMA=sbc/f.uma;
  let ceav=f.ceav[f.ceav.length-1][1];
  if(Math.abs(sbc-f.sm)<0.01)ceav=f.ceav[0][1];
  else for(const [lim,t] of f.ceav.slice(1)){if(enUMA<=lim){ceav=t;break;}}
  const pat={
    eym_fija:f.uma*dp*0.2040, // la cuota fija EyM se paga todos los días del periodo aunque haya ausentismo (LSS 31-I)
    eym_exc:Math.max(0,sbc-3*f.uma)*d*0.0110,
    dinero:B*0.0070, gmp:B*0.0105, iyv:B*0.0175, guarderias:B*0.0100,
    retiro:B*0.02, ceav:B*ceav/100, rt:B*(prima||0)/100, infonavit:B*0.05
  };
  const obr={eym_exc:Math.max(0,sbc-3*f.uma)*d*0.0040, dinero:B*0.0025, gmp:B*0.00375, iyv:B*0.00625, ceav:B*0.01125};
  const r2=o=>Object.values(o).reduce((s,x)=>s+x,0);
  const bruto=(Number(w.sd)||0)*7;
  return {sbc,ceavPct:ceav,pat,obr,totPat:r2(pat),totObr:r2(obr),isn:bruto*f.isn/100,isr:isrPeriodo(bruto,dp),bruto,dias:dp};
}
