/* Jornada extraordinaria y descansos laborados: núcleo legal puro y versionado.
   Sin DOM ni red. El servidor (control_jornada) replica este cálculo y es la
   autoridad: la pantalla sólo previsualiza. Todos los importes se calculan en
   centavos enteros con redondeo half-up exacto para que JS y PostgreSQL
   coincidan centavo a centavo. Los límites de programación sólo generan
   avisos: nunca quitan horas efectivamente trabajadas del pago. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PLATINUM_JORNADA=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const VERSION='JORNADA_EXTRA_V1';
 const TIPOS=Object.freeze(['HORAS_EXTRA','DESCANSO_SEMANAL','DESCANSO_OBLIGATORIO']);

 /* ---------- fechas ---------- */
 function fecha(s){
  if(!/^\d{4}-\d\d-\d\d$/.test(s||''))throw Error('Fecha inválida: '+s);
  const d=new Date(s+'T12:00:00Z');if(d.toISOString().slice(0,10)!==s)throw Error('Fecha inválida: '+s);return d;
 }
 const iso=d=>d.toISOString().slice(0,10);
 function sumar(s,n){const d=fecha(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
 const dow=s=>fecha(s).getUTCDay();              // 0 = domingo
 const lunes=s=>sumar(s,-((dow(s)+6)%7));          // semana de servicios lunes–domingo
 const DIAS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

 /* ---------- centavos exactos ---------- */
 const cent=n=>{const x=Number(n);if(n==null||n===''||!Number.isFinite(x)||x<0)throw Error('Importe inválido.');const c=Math.round(x*100);if(Math.abs(x*100-c)>1e-6)throw Error('Importe con más de dos decimales.');return c;};
 // floor((2N + D) / 2D): N/D redondeado half-up, sólo enteros (N, D ≥ 0).
 const div=(n,d)=>Math.floor((2*n+d)/(2*d));
 const pesos=c=>c/100;

 /* ---------- reglas laborales por fecha trabajada ----------
    Reforma LFT publicada en el DOF el 01/05/2026 (reducción de jornada).
    Transitorio: la jornada máxima semanal y el umbral de horas dobles del
    art. 66 se alcanzan por año calendario, a partir del 1 de enero. */
 const REFORMA='2026-05-01';
 const TRANSICION=Object.freeze([
  {anio:2026,ordinaria:48,umbral:9},{anio:2027,ordinaria:46,umbral:9},{anio:2028,ordinaria:44,umbral:10},
  {anio:2029,ordinaria:42,umbral:11},{anio:2030,ordinaria:40,umbral:12}]);
 const FUENTE_PREVIA='LFT arts. 61, 66, 67 y 68 (texto anterior al decreto DOF 01/05/2026): hasta 3 h diarias y no más de 3 veces por semana; dobles hasta 9 h semanales; el excedente se paga triple.';
 const FUENTE_REFORMA='Decreto LFT DOF 01/05/2026 (arts. 61, 66 y 68 y transitorio cuarto): jornada semanal 48/46/44/42/40 h y umbral de horas dobles 9/9/10/11/12 h en 2026–2030 desde el 1 de enero; hasta 4 h diarias en no más de 4 días; el excedente se paga triple sin rebasar 4 h semanales; jornada total no mayor a 12 h diarias. Cotejo literal con el DOF pendiente.';
 function regla(f){
  fecha(f);
  if(f<REFORMA)return Object.freeze({id:'LFT_PREVIA',vigencia:'hasta 2026-04-30',ordinaria:48,umbral:9,max_diario:3,max_dias:3,max_triples:null,max_total_diario:null,fuente:FUENTE_PREVIA});
  const a=Number(f.slice(0,4)),t=TRANSICION.find(x=>x.anio===Math.min(a,2030));
  return Object.freeze({id:'LFT_2026_05_'+t.anio,vigencia:a>=2030?'2030 en adelante':String(a),ordinaria:t.ordinaria,umbral:t.umbral,max_diario:4,max_dias:4,max_triples:4,max_total_diario:12,fuente:FUENTE_REFORMA});
 }

 /* ---------- parámetros fiscales con vigencia ---------- */
 const SM=Object.freeze([
  {desde:'2025-01-01',hasta:'2025-12-31',general:278.80,frontera:419.88,fuente:'DOF 23/12/2024'},
  {desde:'2026-01-01',hasta:'2026-12-31',general:315.04,frontera:440.87,fuente:'DOF 09/12/2025'}]);
 const UMA=Object.freeze([
  {desde:'2025-02-01',hasta:'2026-01-31',diaria:113.14,fuente:'INEGI, UMA 2025'},
  {desde:'2026-02-01',hasta:'2027-01-31',diaria:117.31,fuente:'INEGI, UMA 2026'}]);
 function smVigente(f){fecha(f);const s=SM.find(x=>f>=x.desde&&f<=x.hasta);if(!s)throw Error('No hay salario mínimo validado para '+f+'.');return s;}
 function umaVigente(f){fecha(f);const u=UMA.find(x=>f>=x.desde&&f<=x.hasta);if(!u)throw Error('No hay UMA validada para la fecha de pago '+f+'.');return u;}

 /* ---------- jornada documentada (art. 60 y 61 LFT) ---------- */
 const JORNADAS=Object.freeze({DIURNA:8,NOCTURNA:7,MIXTA:7.5});
 function jornadaDe(j){
  const tipo=String(j?.tipo||'DIURNA').toUpperCase();
  if(JORNADAS[tipo])return {tipo,horas:JORNADAS[tipo],fuente:'Art. 61 LFT: máximo diario de la jornada '+tipo.toLowerCase()};
  if(tipo!=='PACTADA')throw Error('Jornada no reconocida: '+tipo);
  const h=Number(j.horas),limite=JORNADAS[String(j.base||'DIURNA').toUpperCase()];
  if(!limite||!Number.isFinite(h)||h<=0||h>limite||Math.round(h*4)!==h*4)throw Error('Jornada pactada inválida: horas en múltiplos de 15 minutos, sin rebasar el máximo legal de la jornada '+String(j.base||'DIURNA').toLowerCase()+'.');
  if(!String(j.referencia||'').trim())throw Error('La jornada pactada requiere la referencia del contrato o convenio.');
  return {tipo,horas:h,base:String(j.base||'DIURNA').toUpperCase(),referencia:String(j.referencia).trim().slice(0,200),fuente:'Jornada pactada documentada (art. 59 LFT)'};
 }

 /* ---------- captura de tiempo ---------- */
 function hm(s){const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(s||'');if(!m)throw Error('Hora inválida (HH:MM): '+s);return Number(m[1])*60+Number(m[2]);}
 function tiempo(c){
  if(Array.isArray(c?.intervalos)&&c.intervalos.length){
   // Intervalos en orden cronológico del turno: cada inicio se ubica en o
   // después del inicio anterior (un turno nocturno continúa tras medianoche).
   const tramos=[];let pi=null,pf=null;
   for(const x of c.intervalos){
    let a=hm(x.inicio);if(pi!=null)while(a<pi)a+=1440;
    let b=hm(x.fin)+Math.floor(a/1440)*1440;if(b<=a)b+=1440;        // cruza medianoche: no se duplica
    const d=Number(x.descanso_min||0);
    if(!Number.isInteger(d)||d<0||d>=b-a)throw Error('El descanso no pagado debe ser menor al intervalo.');
    if(pf!=null&&a<pf)throw Error('Los intervalos capturados se traslapan.');
    tramos.push({inicio:x.inicio,fin:x.fin,desde:a,hasta:b,descanso_min:d,minutos:b-a-d,cruza_medianoche:b>1440});pi=a;pf=b;
   }
   const minutos=tramos.reduce((s,t)=>s+t.minutos,0);
   if(minutos<=0||minutos>1440)throw Error('El tiempo capturado debe ser mayor a 0 y no rebasar 24 h.');
   return {minutos,tramos,inicio:tramos[0].desde};
  }
  const m=Number(c?.minutos);
  if(!Number.isInteger(m)||m<=0||m>1440)throw Error('Captura horas y minutos (mayor a 0, hasta 24 h) o intervalos de inicio y fin.');
  return {minutos:m,tramos:[],inicio:null};
 }

 /* ---------- descansos obligatorios (art. 74 LFT) ---------- */
 function nLunes(anio,mes,n){const d=`${anio}-${String(mes).padStart(2,'0')}-01`;return sumar(d,((8-dow(d))%7)+7*(n-1));}
 function primerDomingoJunio(anio){const d=`${anio}-06-01`;return sumar(d,(7-dow(d))%7);}
 function descansosObligatorios(anio,electorales){
  const a=Number(anio);if(!Number.isInteger(a)||a<2000||a>2100)throw Error('Año inválido.');
  const p=n=>String(n).padStart(2,'0'),xs=[
   {fecha:`${a}-01-01`,motivo:'1 de enero',fraccion:'I'},
   {fecha:nLunes(a,2,1),motivo:'Primer lunes de febrero (5 de febrero)',fraccion:'II'},
   {fecha:nLunes(a,3,3),motivo:'Tercer lunes de marzo (21 de marzo)',fraccion:'III'},
   {fecha:`${a}-05-01`,motivo:'1 de mayo',fraccion:'IV'},
   {fecha:`${a}-09-16`,motivo:'16 de septiembre',fraccion:'V'},
   {fecha:nLunes(a,11,3),motivo:'Tercer lunes de noviembre (20 de noviembre)',fraccion:'VI'},
   {fecha:`${a}-12-25`,motivo:'25 de diciembre',fraccion:'VIII'}];
  if((a-2024)%6===0)xs.push({fecha:`${a}-10-01`,motivo:'1 de octubre: transmisión del Poder Ejecutivo Federal',fraccion:'VII'});
  if((a-2024)%3===0)xs.push({fecha:primerDomingoJunio(a),motivo:'Jornada electoral federal ordinaria (primer domingo de junio, art. 22 LGIPE)',fraccion:'IX'});
  for(const e of electorales||[])if(String(e?.fecha||'').startsWith(a+'-')){fecha(e.fecha);xs.push({fecha:e.fecha,motivo:String(e.motivo||'Jornada electoral local'),fraccion:'IX'});}
  return xs.sort((x,y)=>x.fecha.localeCompare(y.fecha)).map(x=>({...x,fundamento:'Art. 74-'+x.fraccion+' LFT'}));
 }
 /* Motivos detectados para una fecha. Sólo informa: nunca crea pagos. */
 function motivosDescanso(f,opciones){
  const o=opciones||{},xs=[],ds=Number.isInteger(o.descanso_semanal)?o.descanso_semanal:0;
  if(dow(f)===ds)xs.push({tipo:'DESCANSO_SEMANAL',motivo:'Descanso semanal documentado ('+DIAS[ds]+')',fundamento:'Arts. 69 y 73 LFT'});
  for(const d of descansosObligatorios(f.slice(0,4),o.electorales))if(d.fecha===f)xs.push({tipo:'DESCANSO_OBLIGATORIO',motivo:d.motivo,fundamento:d.fundamento+' y art. 75'});
  return xs;
 }

 /* ---------- validación de una captura ---------- */
 function normalizar(e){
  if(!TIPOS.includes(e?.tipo))throw Error('Tipo de percepción no reconocido.');
  fecha(e.fecha);fecha(e.fecha_pago);
  const c=e.captura||{},j=jornadaDe(c.jornada),base=cent(c.salario_base),sd=cent(c.sd_registrado);
  if(!(sd>0))throw Error('Falta el salario diario registrado del trabajador.');
  if(base<sd)throw Error('La base salarial no puede ser menor al salario diario registrado: no se elige en silencio la base menor.');
  if(base>sd&&!String(c.base_referencia||'').trim())throw Error('Una base mayor al salario registrado requiere documentar su origen (salario ordinario real).');
  const t=e.tipo==='HORAS_EXTRA'?tiempo(c):(c.intervalos?.length||c.minutos?tiempo(c):{minutos:0,tramos:[],inicio:null});
  if(e.tipo!=='HORAS_EXTRA'&&c.laboro!==true)throw Error('Confirma que el trabajador efectivamente laboró en su día de descanso; un descanso no laborado no genera pago.');
  const pa=!!(c.prima_dominical&&c.prima_dominical.aplica===true),pd=pa?Number(c.prima_dominical.pct):0;
  if(pa){if(dow(e.fecha)!==0)throw Error('La prima dominical sólo procede por domingo laborado.');if(!Number.isFinite(pd)||pd<25||pd>100||Math.round(pd*100)!==pd*100)throw Error('Prima dominical: mínimo 25% (art. 71 LFT), con hasta dos decimales.');}
  return {...e,j,base,sd,t,pd100:Math.round(pd*100),ordinario_incluido:c.ordinario_incluido!==false};
 }
 // Orden binario (equivale a COLLATE "C" en PostgreSQL), no dependiente del idioma.
 const cmp=(x,y)=>{x=String(x??'');y=String(y??'');return x<y?-1:x>y?1:0;};
 function orden(a,b){
  return cmp(a.fecha,b.fecha)||(a.t.inicio??-1)-(b.t.inicio??-1)||cmp(a.orden,b.orden)||cmp(a.id,b.id);
 }

 /* ---------- cálculo de la semana de servicios ----------
    eventos: capturas vigentes del mismo trabajador (identidad) y patrón en la
    misma semana lunes–domingo. Los congelados (periodo autorizado, timbrado o
    pagado) conservan su cálculo y consumen primero horas y tope; los abiertos
    se asignan en orden cronológico y se recalculan completos. */
 function calcularSemana(eventos,opciones){
  // opciones.parametros sólo para pruebas: {sm(fecha), uma(fechaPago)} con años aún no validados.
  const P=opciones&&opciones.parametros||{},SMf=P.sm||smVigente,UMAf=P.uma||umaVigente;
  const xs=(eventos||[]).filter(Boolean);if(!xs.length)return {version:VERSION,lunes:null,eventos:[],totales:null};
  const sem=lunes(xs[0].fecha);
  for(const e of xs)if(lunes(e.fecha)!==sem)throw Error('Las capturas no pertenecen a la misma semana de servicios.');
  const congelados=xs.filter(e=>e.congelado),abiertos=xs.filter(e=>!e.congelado).map(normalizar).sort(orden);
  const st={min:0,dia:new Map(),capUsado:0,domingos:new Set(),descansos:new Map()},out=[];
  for(const e of congelados.slice().sort((a,b)=>cmp(a.fecha,b.fecha)||cmp(a.orden,b.orden)||cmp(a.id,b.id))){
   const c=e.congelado,m=Number(c.minutos||0);
   if(e.tipo==='HORAS_EXTRA'){st.min+=m;st.dia.set(e.fecha,(st.dia.get(e.fecha)||0)+m);}
   else st.descansos.set(e.fecha,e.id);
   st.capUsado+=c.fraccion==='93-II'?cent(c.exento_extra):0;
   if(Number(c.prima_dominical)>0)st.domingos.add(e.fecha);
   out.push({...c,id:e.id,congelado:true});
  }
  for(const e of abiertos){
   const R=regla(e.fecha),s=SMf(e.fecha),u=UMAf(e.fecha_pago),avisos=[];
   const D=e.j.horas*60;                     // minutos de la jornada (entero: horas en múltiplos de 15 min)
   let mD=0,mT=0,mE=0,cD=0,cT=0,cE=0,cAd=0,cOrd=0;
   if(e.tipo==='HORAS_EXTRA'){
    const m=e.t.minutos,U=R.umbral*60;
    mD=Math.max(0,Math.min(m,U-st.min));mT=m-mD;
    const antes=st.dia.get(e.fecha)||0,dias=new Set([...st.dia.keys()].filter(k=>st.dia.get(k)>0));
    const nDia=dias.has(e.fecha)?[...dias].sort().indexOf(e.fecha)+1:dias.size+1;
    mE=nDia<=R.max_dias?Math.max(0,Math.min(mD,R.max_diario*60-antes)):0;
    cD=div(e.base*mD*2,D);cT=div(e.base*mT*3,D);cE=Math.min(cD,div(e.base*mE*2,D));
    if(antes+m>R.max_diario*60)avisos.push({codigo:'LIMITE_DIARIO',texto:`Rebasa ${R.max_diario} h extra en el día (${R.id}). Se paga completo; la parte fuera del límite no goza de exención ni de exclusión del SBC.`});
    if(nDia>R.max_dias)avisos.push({codigo:'LIMITE_DIAS',texto:`Tiempo extra en más de ${R.max_dias} días de la semana (${R.id}). Se paga completo y se documenta la infracción.`});
    if(mT>0)avisos.push({codigo:'TRIPLES',texto:`La semana rebasa ${R.umbral} h extra: ${(mT/60).toFixed(2)} h se pagan triples (art. 68 LFT).`});
    if(R.max_triples!=null&&st.min+m-U>R.max_triples*60)avisos.push({codigo:'LIMITE_TRIPLES',texto:`El excedente rebasa ${R.max_triples} h semanales permitidas: infracción documentada; las horas se pagan completas.`});
    if(R.max_total_diario!=null&&e.j.horas+m/60>R.max_total_diario)avisos.push({codigo:'LIMITE_TOTAL_DIARIO',texto:`Jornada ordinaria más extraordinaria mayor a ${R.max_total_diario} h en el día (art. 68).`});
    st.min+=m;st.dia.set(e.fecha,antes+m);
   }else{
    if(st.descansos.has(e.fecha))throw Error('Ya existe un descanso laborado registrado para '+e.fecha+': un mismo día de descanso no se paga dos veces aunque coincidan el semanal y el obligatorio.');
    st.descansos.set(e.fecha,e.id);
    cAd=2*e.base;cOrd=e.ordinario_incluido?0:e.base;cE=cAd;
    if(e.t.minutos>D)avisos.push({codigo:'EXCEDE_JORNADA',texto:'Laboró más que su jornada en el descanso: captura el excedente como horas extra de ese día.'});
    if(e.t.minutos&&e.t.minutos<D)avisos.push({codigo:'JORNADA_PARCIAL',texto:'Laboró parte de la jornada: se paga el salario doble del día (arts. 73 y 75 LFT) sin prorratear en perjuicio del trabajador.'});
   }
   let cP=0,cPE=0;
   if(e.pd100){
    if(st.domingos.has(e.fecha))throw Error('La prima dominical de '+e.fecha+' ya está registrada en otra captura.');
    st.domingos.add(e.fecha);cP=div(e.base*e.pd100,10000);cPE=Math.min(cP,cent(u.diaria));
   }
   if(R.ordinaria<48&&e.j.horas*6>R.ordinaria)avisos.push({codigo:'JORNADA_SEMANAL',texto:`Con ${e.j.horas} h diarias en 6 días la jornada documentada rebasa la máxima semanal de ${R.ordinaria} h (${R.vigencia}): las horas excedentes son extraordinarias.`});
   const esSM=e.sd<=cent(s.general),fraccion=esSM?'93-I':'93-II',tope=esSM?null:cent(u.diaria)*5;
   let cExE;
   if(esSM)cExE=cE;
   else{cExE=Math.min(div(cE,2),Math.max(0,tope-st.capUsado));st.capUsado+=cExE;}
   if(!esSM&&div(cE,2)>cExE)avisos.push({codigo:'TOPE_5_UMA',texto:'Se agotó el tope semanal de 5 UMA: el excedente es gravado (art. 93-II LISR).'});
   const bruto=cD+cT+cAd+cOrd+cP,exento=cExE+cPE;
   out.push({id:e.id,tipo:e.tipo,fecha:e.fecha,fecha_pago:e.fecha_pago,semana_servicio:sem,regla:R.id,regla_fuente:R.fuente,umbral_horas:R.umbral,ordinaria_semanal:R.ordinaria,
    jornada:e.j.tipo,horas_jornada:e.j.horas,salario_base:pesos(e.base),sd_registrado:pesos(e.sd),valor_hora:pesos(div(e.base*60,D)),
    minutos:e.t.minutos,minutos_dobles:mD,minutos_triples:mT,minutos_elegibles:mE,
    importe_dobles:pesos(cD),importe_triples:pesos(cT),descanso_adicional:pesos(cAd),ordinario_adicional:pesos(cOrd),ordinario_incluido:e.ordinario_incluido,
    prima_dominical:pesos(cP),prima_pct:e.pd100/100,bruto:pesos(bruto),elegible_exencion:pesos(cE),exento_extra:pesos(cExE),exento_prima:pesos(cPE),
    exento:pesos(exento),gravado:pesos(bruto-exento),fraccion,salario_minimo:s.general,uma:u.diaria,tope_semanal:tope==null?null:pesos(tope),
    sbc_variable:pesos(cT+(cD-Math.min(cD,cE))+cAd+cP),avisos,congelado:false});
  }
  const t=k=>pesos(out.reduce((a,x)=>a+cent(x[k]??0),0)),mm=k=>out.reduce((a,x)=>a+(Number(x[k])||0),0);
  return {version:VERSION,lunes:sem,eventos:out,totales:{bruto:t('bruto'),exento:t('exento'),gravado:t('gravado'),minutos_dobles:mm('minutos_dobles'),minutos_triples:mm('minutos_triples'),sbc_variable:t('sbc_variable')}};
 }

 /* ---------- agregado por periodo de aplicación ---------- */
 function agregarPeriodo(calculos){
  const xs=(calculos||[]).filter(Boolean),s=k=>pesos(xs.reduce((a,x)=>a+cent(x[k]),0));
  return {eventos:xs.map(x=>x.id).sort(),bruto:s('bruto'),exento:s('exento'),gravado:s('gravado'),importe_dobles:s('importe_dobles'),importe_triples:s('importe_triples'),
   descanso_adicional:s('descanso_adicional'),ordinario_adicional:s('ordinario_adicional'),prima_dominical:s('prima_dominical'),sbc_variable:s('sbc_variable'),
   minutos_dobles:xs.reduce((a,x)=>a+x.minutos_dobles,0),minutos_triples:xs.reduce((a,x)=>a+x.minutos_triples,0)};
 }
 /* Efecto ISR: nómina completa con y sin el concepto en el mismo contexto.
    isr(gravadoAdicional) debe devolver {isr, subsidio} del motor real. */
 function efectoIsr(gravado,isrCon){
  const sin=isrCon(0),con=isrCon(gravado),r=n=>Math.round(n*100+Number.EPSILON*100)/100;
  return {isr_sin:sin.isr,isr_con:con.isr,isr:r(Math.max(0,con.isr-sin.isr)),subsidio_sin:sin.subsidio,subsidio_con:con.subsidio,efecto_subsidio:r(sin.subsidio-con.subsidio)};
 }

 return Object.freeze({VERSION,TIPOS,REFORMA,TRANSICION,SM,UMA,JORNADAS,regla,smVigente,umaVigente,jornadaDe,tiempo,lunes,dow,sumar,
  descansosObligatorios,motivosDescanso,calcularSemana,agregarPeriodo,efectoIsr,_div:div});
});
