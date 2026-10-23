/* Papeles de prestaciones: evidencia versionada, no órdenes de pago.
   El motor monetario existente permanece intacto. PostgreSQL recalcula al
   guardar y atribuye usuario, revisión y confirmación; nunca acepta un neto
   enviado por el navegador. El histórico conserva sus fórmulas originales. */
let PPF={obra:null,semana:0,ejercicio:2026,filas:[],archivo:null,editor:null,token:0};
const PPF_TARIFA_2026=[
 [.01,844.59,0,1.92],[844.60,7168.51,16.22,6.40],[7168.52,12598.02,420.95,10.88],
 [12598.03,14644.64,1011.68,16],[14644.65,17533.64,1339.14,17.92],
 [17533.65,35362.83,1856.84,21.36],[35362.84,55736.68,5665.16,23.52],
 [55736.69,106410.50,10457.09,30],[106410.51,141880.66,25659.23,32],
 [141880.67,425641.99,37009.69,34],[425642,999999999999,133488.54,35]
];
function ppfTablasHTML(){
 return `<details style="margin-top:14px"><summary>Tablas y reglas del papel · 2026</summary>
 <p class="fhint">Finiquito ordinario: aguinaldo mínimo 15 días; vacaciones 12, 14, 16, 18, 20 días en años 1–5; 22 en años 6–10, después +2 por cada 5 años; prima mínima 25%. Revisa prestaciones superiores, vacaciones devengadas no disfrutadas y exenciones usadas antes de aplicar. Incapacidad IMSS no se convierte en falta injustificada.</p>
 <p class="fhint">Se conserva el criterio de días del motor conciliado (aguinaldo sin día de baja, vacaciones inclusivas / 365); no es una regla legal universal. El método mensual de este papel no incluye subsidio, ajuste anual, otros ingresos del mes, ni el procedimiento opcional del art. 174 RLISR. Indemnizaciones se calculan en el apartado jurídico individual.</p>
 ${ctrlTabla(['Límite inferior','Límite superior','Cuota fija','Tasa'],PPF_TARIFA_2026.map(t=>`<tr><td>$${money(t[0])}</td><td>${t[1]>1e11?'En adelante':'$'+money(t[1])}</td><td>$${money(t[2])}</td><td>${t[3]}%</td></tr>`))}
 <p class="fhint">Anexo 8 RMF 2026, tarifa mensual. Aguinaldo exento hasta 30 UMA y prima vacacional hasta 15 UMA, descontando exención ya usada en el año. UMA: $113.14 hasta enero; $117.31 desde febrero 2026. No se recalcula el archivo histórico con tablas nuevas.</p>
 <p class="fhint"><a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf" target="_blank" rel="noopener">LFT arts. 76, 79, 80 y 87</a> · <a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf" target="_blank" rel="noopener">LISR arts. 93 y 96</a> · <a href="https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-8-RMF-2026_DOF-28122025.pdf" target="_blank" rel="noopener">Anexo 8 oficial</a></p></details>`;
}
function ppfDia(fecha){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)))throw Error('Fecha inválida');
 const d=new Date(fecha+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==fecha)throw Error('Fecha inválida');return d;
}
function ppfRed(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;}
function ppfNumero(v,nombre,max=1e7){
 if(!/^\d+(?:\.\d{1,12})?$/.test(String(v))||!Number.isFinite(Number(v))||Number(v)>max)throw Error(nombre+': usa un número no negativo, hasta 12 decimales');
 return Number(v);
}
function ppfModelo(e){
 const alta=ppfDia(e.fecha_alta),baja=ppfDia(e.fecha_baja),pago=ppfDia(e.fecha_pago);
 if(baja<alta||pago.getUTCFullYear()!==2026)throw Error('Revisa fechas. Tarifa disponible: 2026');
 const sd=ppfNumero(e.sd,'SD',1e6),da=ppfNumero(e.dias_aguinaldo,'Días aguinaldo',366),dv=ppfNumero(e.dias_vacaciones,'Días vacaciones',366),tv=ppfNumero(e.tabla_vacaciones,'Tabla vacaciones',100),dp=ppfNumero(e.dias_pendientes,'Días pendientes',366);
 if(sd<=0||tv<12)throw Error('SD o tabla de vacaciones inválidos');
 const ag=sd*15*da/365,vac=sd*tv*dv/365,pv=vac*.25,sp=sd*dp,uma=e.fecha_pago<'2026-02-01'?113.14:117.31;
 const exag=Math.min(ag,Math.max(0,30*uma-ppfNumero(e.exento_ag_usado,'Exención aguinaldo usada'))),expv=Math.min(pv,Math.max(0,15*uma-ppfNumero(e.exento_pv_usado,'Exención prima usada'))),grav=sp+vac+ag-exag+pv-expv;
 const t=[...PPF_TARIFA_2026].reverse().find(t=>ppfRed(grav)>=t[0])||[0,0,0,0];
 const isr=Math.max(0,(grav-t[0])*t[3]/100+t[2]),aplicado=e.isr_precision===''?isr:ppfNumero(e.isr_precision,'ISR');
 const bruto=ag+vac+pv+sp,brutoNOI=ppfRed(ag)+ppfRed(vac)+ppfRed(pv)+ppfRed(sp),neto=ppfRed(bruto-aplicado),d001=e.d001===''?ppfRed(aplicado):ppfNumero(e.d001,'D001'),credito=ppfNumero(e.credito,'Créditos');
 if(aplicado>bruto||d001>brutoNOI||Math.abs(ppfRed(d001)-d001)>1e-8)throw Error('ISR mayor al bruto o D001 con más de dos decimales');
 return {version:'PAPEL_2026_V1',aguinaldo_raw:ag,vacaciones_raw:vac,prima_raw:pv,aguinaldo:ppfRed(ag),vacaciones:ppfRed(vac),prima:ppfRed(pv),salarios:ppfRed(sp),uma,exento_ag:exag,exento_pv:expv,gravado:grav,limite_inferior:t[0],tasa:t[3],cuota_fija:t[2],isr_calculado:isr,isr_precision:aplicado,d001,d001_propuesto:ppfRed(brutoNOI-neto),bruto,bruto_noi:ppfRed(brutoNOI),neto_papel:neto,neto_noi:ppfRed(brutoNOI-d001),credito,neto_con_credito:Math.max(0,ppfRed(brutoNOI-d001-credito))};
}
function ppfEntradas(w,fecha,audit=null,validacion=null){
 const alta=iniAntig(w),dias=Math.round((ppfDia(fecha)-ppfDia(alta))/86400000)+1;
 if(dias<1)throw Error('El reingreso es posterior al cálculo; consulta el papel histórico de la baja anterior');
 const anios=Math.floor(dias/365.25),desde=Math.max(+ppfDia(alta),+ppfDia(fecha.slice(0,4)+'-01-01'));
 const diasAgBase=Math.round((ppfDia(fecha)-desde)/86400000),faltas=Math.min(diasAgBase,faltasAguinaldo(w,fecha));
 const a=audit?.entradas||{},r=audit?.resultado||{},vFuente=validacion||a.validacion_noi,val=vFuente&&vFuente.fecha_antiguedad===alta&&Number(vFuente.sd)===Number(w.sd)?vFuente:null;
 let info=0,infoDias=0;const credito=creditoInfonavitActivo(w,fecha);
 if(credito){infoDias=ppfDia(fecha).getUTCDay()===1?1:0;if(infoDias){
   // Mismo prorrateo ya utilizado por el cálculo individual; no crea crédito.
   const exacta=retencionInfonavitDesdeAviso(credito,w,infoDias,new Date(fecha+'T12:00'));
   const periodo=perDe(w);info=exacta==null?montoDescuento(credito,periodo)/periodo.dias*infoDias:exacta;
   if(!Number.isFinite(info))throw Error('No se pudo calcular el crédito activo; abre la ficha para revisarlo');
 }}
 return {fecha_alta:alta,fecha_baja:fecha,fecha_pago:fecha,sd:String(w.sd),nss:String(w.nss||''),
 dias_aguinaldo:String(a.dias_aguinaldo??val?.dias_aguinaldo??Math.max(0,diasAgBase-faltas)),
 dias_vacaciones:String(a.dias_anio??Math.round(dias-anios*365.25)),tabla_vacaciones:String(a.dias_vacaciones_tabla??diasVacaciones(anios+1)),
 dias_pendientes:String(a.dias_salario_pendiente??0),faltas_aguinaldo:faltas,
 credito:String(r.infonavit??(val?.credito_infonavit_id===credito?.id&&Number(val?.dias_infonavit)===infoDias&&Number(val?.factor_infonavit)===Number(credito?.factor)?val?.infonavit:null)??ppfRed(info)),dias_infonavit:a.dias_infonavit_no_retenidos??infoDias,numero_credito:numeroCreditoInfonavit(credito),
 exento_ag_usado:'0',exento_pv_usado:'0',isr_precision:'',d001:a.isr_noi_manual!=null?String(a.isr_noi_manual):val?.isr!=null?String(val.isr):'',
 origen_dias:audit?'Cálculo individual':val?'Días confirmados con NOI':'Motor vigente · revisar antes de aplicar',
 aviso_antiguedad:anios>=1?'Revisa vacaciones acumuladas/disfrutadas y continuidad; este papel sólo calcula el proporcional del año en curso.':''};
}
async function openPapelesFiniquito(semana=null){
 if(!OBRA)return toast('Selecciona un centro.','err');
 const n=Number(semana)||semObra();PPF.obra=OBRA.id;PPF.semana=n;PPF.ejercicio=Number(semRange(n)[0].slice(0,4));
 modal(`${ctrlNav('🧮 Papeles de prestaciones')}<div class="m-body"><p class="fhint">Papeles versionados por baja. Guardar no cambia salarios, finiquitos aplicados, cheques ni cierres. Histórico: consulta de la fuente original.</p>
 <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><div><label>Semana del centro</label><input id="ppf-sem" type="number" min="1" max="999" value="${n}"></div>
 <button class="btn" onclick="ppfCargarSemana()">Consultar</button><button class="btn" id="ppf-preparar" onclick="ppfPrepararSemana()" ${puedeEditarTrabajador()?'':'disabled'}>Preparar bajas de la semana</button>
 <button class="btn dark" id="ppf-export" onclick="ppfExportar()" disabled>↓ Excel de cálculos nuevos</button><button class="btn" id="ppf-historico" onclick="ppfExportarHistorico()" disabled>↓ Histórico original S15–S30</button></div>
 <div style="margin-top:12px"><label>Buscar por número o nombre</label><input id="ppf-buscar" oninput="ppfPintar()" placeholder="Buscar en esta semana"></div><div id="ppf-lista" aria-live="polite">Consultando…</div>${ppfTablasHTML()}</div>`,'lg');
 await ppfCargarSemana();
}
async function ppfCargarSemana(){
 const token=++PPF.token,obra=OBRA.id,n=Number($('ppf-sem')?.value||PPF.semana);
 if(!Number.isInteger(n)||n<1||n>999)return toast('Semana inválida.','err');
 const ej=Number(semRange(n)[0].slice(0,4));
 $('ppf-lista').textContent='Consultando papeles…';$('ppf-export').disabled=true;$('ppf-historico').disabled=true;
 try{
  const [a,b]=await Promise.all([
   fetchAllRows(()=>sb.from('prestaciones_papeles').select('*').eq('obra_id',obra).eq('semana',n).eq('ejercicio',ej),'created_at'),
   sb.from('prestaciones_archivos_historicos').select('id,hoja,fuente_sha256').eq('obra_id',obra).eq('semana',n).eq('ejercicio',ej).maybeSingle()
  ]);
  if(token!==PPF.token||OBRA.id!==obra||!$('ppf-lista'))return;
  if(a.error||b.error)throw Error((a.error||b.error).message);
  PPF={...PPF,obra,semana:n,ejercicio:ej,filas:a.data||[],archivo:b.data};ppfPintar();
 }catch(e){if(token===PPF.token&&$('ppf-lista'))$('ppf-lista').textContent='No se pudo consultar: '+e.message;}
}
function ppfActuales(){
 const mapa=new Map();for(const r of PPF.filas.filter(x=>x.origen!=='HISTORICO')){const k=r.trabajador_id+'|'+r.fecha_baja;if(!mapa.has(k)||mapa.get(k).revision<r.revision)mapa.set(k,r);}
 return [...mapa.values()].sort((a,b)=>(a.numero??9e9)-(b.numero??9e9));
}
function ppfHistoricosActuales(){
 const mapa=new Map();for(const r of PPF.filas.filter(x=>x.origen==='HISTORICO')){const k=r.fuente.sha256+'|'+r.fuente.hoja+'|'+r.fuente.fila;if(!mapa.has(k)||mapa.get(k).revision<r.revision)mapa.set(k,r);}
 return [...mapa.values()];
}
function ppfPintar(){
 if(!$('ppf-lista'))return;const filtro=String($('ppf-buscar')?.value||'').toUpperCase(),actuales=ppfActuales();
 const filas=[...actuales,...ppfHistoricosActuales()].filter(r=>(r.numero+' '+r.nombre).toUpperCase().includes(filtro));
 $('ppf-lista').innerHTML=ctrlTabla(['No.','Trabajador','Origen / revisión','Baja','ISR preciso','D001','Neto papel','Neto con créditos','Acciones'],filas.map(r=>`<tr><td>${esc(r.numero??'—')}</td><td>${esc(r.nombre||'Bloque sin nombre')} ${r.trabajador_id?'':'<small>· sin vínculo automático</small>'}</td><td>${esc(r.origen)} · ${r.revision}</td><td>${esc(r.fecha_baja||'—')}</td><td>${esc(r.resultado.isr_precision??r.resultado.isr_aplicado??'—')}</td><td>${r.resultado.d001==null?'Fuente original':'$'+money(r.resultado.d001)}</td><td>$${money(r.resultado.neto_papel??r.resultado.neto??0)}</td><td>${r.origen==='HISTORICO'?'No recalculado':'$'+money(r.resultado.neto_con_credito)}</td><td><button class="btn" onclick="ppfVer('${r.id}')">${r.origen==='HISTORICO'?'Ver fuente':'Ver / nueva revisión'}</button></td></tr>`));
 $('ppf-export').disabled=!actuales.length;$('ppf-historico').disabled=!PPF.archivo;
}
async function ppfVer(id){
 const r=PPF.filas.find(x=>x.id===id);if(!r)return;
 if(r.origen==='HISTORICO'){
  modal(`${ctrlNav('Papel histórico de consulta','openPapelesFiniquito')}<div class="m-body"><h3>${esc(r.nombre||'Bloque sin nombre')}</h3><p>Semana ${r.semana} · ${esc(r.fuente.hoja)} · fila ${esc(r.fuente.fila)}</p><p class="fhint">Valores y fórmulas de la fuente, sin recalcular ni modificar finiquitos/pagos. ${esc(r.fuente.vinculo||'')}</p>
  ${ctrlTabla(['Concepto','Valor en el archivo','Fórmula original'],Object.entries(r.entradas.datos||{}).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v.v??'—')}</td><td>${esc(v.f||'Capturado')}</td></tr>`))}<p>SHA-256 de la fuente: ${esc(r.fuente.sha256)}</p></div>`,'lg');return;
 }
 await ppfAbrirEditor(r.trabajador_id,r.fecha_baja,r);
}
async function ppfDesdeFicha(id){
 calcPrestaciones(id);const a=globalThis._PR_AUDIT;
 if(!a||a.invalido||a.trabajador_id!==id)return toast('Espera a que termine el cálculo individual.','err');
 if(a.entradas?.escenario_separacion!=='NO')return toast('El papel ordinario no sustituye el cálculo jurídico de indemnizaciones.','err');
 await ppfAbrirEditor(id,a.periodo,null,structuredClone(a));
}
async function ppfAbrirEditor(id,fecha,papel=null,audit=null){
 const obra=OBRA.id;
 try{
  const [wr,prev,aj]=await Promise.all([
   sb.from('trabajadores').select('*').eq('id',id).eq('obra_id',obra).single(),
   sb.from('prestaciones_papeles').select('*').eq('obra_id',obra).eq('trabajador_id',id).eq('fecha_baja',fecha).neq('origen','HISTORICO').order('revision',{ascending:false}).limit(1).maybeSingle(),
   sb.from('historial').select('datos_despues').eq('obra_id',obra).eq('trabajador_id',id).eq('accion','AJUSTE_FINIQUITO_NOI').order('fecha',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(OBRA.id!==obra)return;if(wr.error||prev.error||aj.error)throw Error((wr.error||prev.error||aj.error).message);
  const w=wr.data,v=aj.data?.datos_despues,validacion=v?.periodo===fecha?v.validacion_noi:null;
  // Una revisión guardada es la base; no sobrescribirla silenciosamente con una ficha.
  const e=prev.data?structuredClone(prev.data.entradas):ppfEntradas(w,fecha,audit,validacion);
  if(audit&&w.updated_at!==WORKERS.find(x=>x.id===id)?.updated_at)throw Error('La ficha cambió; vuelve a abrir Prestaciones antes de guardar');
  PPF.editor={w,e,prev:prev.data,op:_uuid(),audit,confirmado:null,guardando:false};
  ppfEditorHTML();
 }catch(e){toast('No se abrió el papel: '+e.message,'err');}
}
function ppfEditorHTML(){
 const d=PPF.editor,e=d.e,w=d.w,edit=puedeEditarTrabajador();
 const campo=(id,label,tipo='number')=>`<div><label>${label}</label><input id="ppfe-${id}" type="${tipo}" ${tipo==='number'?'min="0" step="any"':''} value="${esc(e[id]??'')}" oninput="ppfPrevisualizar()" ${edit?'':'disabled'}></div>`;
 modal(`${ctrlNav('🧮 Papel de prestaciones · '+esc(fullName(w)),'openPapelesFiniquito')}<div class="m-body"><p class="fhint">#${w.no_trab} · SD $${money(w.sd)} · alta/reingreso ${esc(e.fecha_alta)} · ${esc(e.origen_dias||'')} · ${d.prev?'Nueva revisión de '+d.prev.revision:'Papel nuevo'}. No cambia el finiquito aplicado.</p>
 <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
 ${campo('fecha_baja','Fecha de baja / cálculo','date')}${campo('fecha_pago','Fecha prevista de pago','date')}${campo('dias_aguinaldo','Días que devengan aguinaldo')}${campo('dias_vacaciones','Días proporcionales de vacaciones')}${campo('tabla_vacaciones','Días de vacaciones por año')}${campo('dias_pendientes','Días de salario pendientes')}
 ${campo('credito','Retención de créditos ($)')}${campo('exento_ag_usado','Exención aguinaldo ya usada ($)')}${campo('exento_pv_usado','Exención prima ya usada ($)')}
 ${campo('isr_precision','ISR del papel · precisión completa (opcional)')}${campo('d001','ISR D001 a centavos (opcional)')}</div>
 <p class="fhint">El campo vacío conserva el cálculo automático. Retención precargada: ${esc(e.numero_credito||'sin crédito identificado')} · ${e.dias_infonavit||0} día(s) INFONAVIT. Revisa retenciones pendientes de otras semanas y FONACOT; el monto no altera la ficha ni el crédito.</p>
 ${e.aviso_antiguedad?'<p class="fhint" style="color:var(--amber)">'+esc(e.aviso_antiguedad)+'</p>':''}
 <div id="ppfe-out" aria-live="polite"></div>
 <button class="btn" id="ppfe-proponer" onclick="ppfAceptarD001()" ${edit?'':'disabled'}>Usar propuesta D001 (requiere confirmar al guardar)</button>
 <div id="ppfe-estado" class="fhint" style="margin-top:8px"></div><button class="btn" style="margin-top:8px" onclick="ppfVersiones()">Ver trazabilidad y revisiones</button>${ppfTablasHTML()}</div>
 <div class="m-foot"><button class="btn" onclick="openPapelesFiniquito()">Volver</button><button class="btn dark" id="ppfe-guardar" onclick="ppfGuardar()" ${edit?'':'disabled'}>Guardar revisión</button><button class="btn" id="ppfe-ficha" onclick="ppfLlevarFicha()" disabled>Usar D001 en cálculo individual</button></div>`,'lg');ppfPrevisualizar();
}
function ppfLeerEditor(){
 const e={...PPF.editor.e};for(const k of ['fecha_baja','fecha_pago','dias_aguinaldo','dias_vacaciones','tabla_vacaciones','dias_pendientes','credito','exento_ag_usado','exento_pv_usado','isr_precision','d001'])e[k]=$('ppfe-'+k).value;
 return e;
}
function ppfPrevisualizar(){
 const d=PPF.editor;if(!d||!$('ppfe-out'))return;
 $('ppfe-ficha').disabled=true;d.guardado=null;
 try{
  const e=ppfLeerEditor(),r=ppfModelo(e);d.e=e;d.r=r;
  $('ppfe-out').innerHTML=ctrlTabla(['Concepto','Precisión interna','NOI a centavos'],[
   ['Aguinaldo',r.aguinaldo_raw,r.aguinaldo],['Vacaciones',r.vacaciones_raw,r.vacaciones],['Prima vacacional',r.prima_raw,r.prima],['Salarios pendientes',r.salarios,r.salarios],['ISR matemático',r.isr_calculado,ppfRed(r.isr_calculado)],['ISR del papel / D001',r.isr_precision,r.d001]
  ].map(x=>`<tr><td>${x[0]}</td><td>${Number(x[1]).toFixed(8)}</td><td>$${money(x[2])}</td></tr>`))+
  `<div class="kv"><b>ISR calculado / propuesta D001</b><span>${r.isr_calculado.toFixed(8)} / $${money(r.d001_propuesto)}</span></div><div class="kv"><b>Neto del papel / neto NOI antes de créditos</b><span>$${money(r.neto_papel)} / $${money(r.neto_noi)}</span></div><div class="kv franja-total"><b>Neto NOI después de créditos</b><span>$${money(r.neto_con_credito)}</span></div><p class="fhint">Propuesta = percepciones a centavos − neto redondeado del papel. No se aplica automáticamente y no convierte el redondeo en una tarifa fiscal.</p>`;
  $('ppfe-guardar').disabled=!puedeEditarTrabajador()||d.guardando;
  $('ppfe-proponer').disabled=!puedeEditarTrabajador()||r.d001_propuesto<0||r.d001_propuesto>r.bruto_noi;
 }catch(e){d.r=null;$('ppfe-out').textContent=e.message;$('ppfe-guardar').disabled=true;$('ppfe-proponer').disabled=true;}
}
function ppfAceptarD001(){
 if(!puedeEditarTrabajador()||!PPF.editor?.r)return;
 $('ppfe-d001').value=PPF.editor.r.d001_propuesto.toFixed(2);ppfPrevisualizar();
 $('ppfe-estado').textContent='Propuesta capturada. Se pedirá confirmación antes de guardar; el ISR matemático se conserva.';
}
async function ppfGuardar(){
 const d=PPF.editor;if(!puedeEditarTrabajador()||!d||d.guardando||!d.r||OBRA.id!==d.w.obra_id)return;
 const e=ppfLeerEditor(),firma=JSON.stringify(e),manual=e.isr_precision!==''||e.d001!=='';
 if(e.fecha_baja!==d.e.fecha_baja)return toast('Vuelve a previsualizar.','err');
 if(manual&&!confirm('¿Confirmas guardar el ISR de este papel?\n\nISR matemático: '+d.r.isr_calculado.toFixed(8)+'\nISR del papel: '+d.r.isr_precision+'\nD001: $'+money(d.r.d001)+'\n\nQuedarán registrados tu usuario, la fecha, el valor anterior y el nuevo. No cambia pagos ni cierres.'))return;
 d.guardando=true;$('ppfe-guardar').disabled=true;
 try{
  const {data,error}=await sb.rpc('prestaciones_guardar',{p:{operacion_id:d.op,trabajador_id:d.w.id,origen:d.audit?'FICHA':'SEMANAL',version_trabajador:d.w.updated_at,anterior_id:d.prev?.id||null,entradas:e},confirmar_isr:manual});
  if(error)throw Error(error.message);
  if(PPF.editor!==d||!$('ppfe-estado'))return;
  d.prev=data;d.op=_uuid();d.r=data.resultado;
  if(JSON.stringify(ppfLeerEditor())!==firma){$('ppfe-estado').textContent='Se guardó la revisión, pero cambiaste campos durante el guardado. Guarda una nueva revisión antes de usarla.';return;}
  d.guardado=data;$('ppfe-estado').textContent='Revisión '+data.revision+' guardada · '+data.actor_email+' · '+new Date(data.created_at).toLocaleString('es-MX')+' · no modifica pagos';
  $('ppfe-ficha').disabled=!puedeEditarTrabajador();toast('Papel guardado con trazabilidad.');
 }catch(e){toast('No se guardó: '+e.message,'err');}finally{d.guardando=false;if(PPF.editor===d&&$('ppfe-guardar'))$('ppfe-guardar').disabled=false;}
}
async function ppfLlevarFicha(){
 const d=PPF.editor,r=d?.guardado;if(!r||!puedeEditarTrabajador())return;
 // Puente explícito: no modifica trabajadores ni da bajas automáticamente.
 const id=d.w.id;if(!confirm('¿Abrir el cálculo individual con el D001 confirmado?\nLa baja y el pago conservan sus validaciones habituales.'))return;
 openPrestaciones(id);
 const estado=globalThis._PR_NOI_AJUSTE;
 await estado.promesa;
 if(!$('pr-fecha')||globalThis._PR_NOI_AJUSTE!==estado)return;
 if(estado.estado!=='LISTO')return toast('No se cargaron los ajustes de la ficha; no se aplicó el D001.','err');
 $('pr-fecha').value=r.entradas.fecha_baja;$('f-pr-dias').value=r.entradas.dias_pendientes;$('pr-isr-noi').value=r.resultado.d001;
 if($('f-pr-info-dias'))$('f-pr-info-dias').value=r.entradas.dias_infonavit||0;
 calcPrestaciones(id);
 const a=globalThis._PR_AUDIT;
 if(a&&!a.invalido){a.papel_prestaciones_id=r.id;a.papel_prestaciones_huella=r.huella;}
 toast('D001 cargado. Revisa días, créditos y total del cálculo individual antes de aplicar.');
}
async function ppfPrepararSemana(){
 if(!puedeEditarTrabajador()||PPF.obra!==OBRA.id)return;
 const obra=OBRA.id,n=Number($('ppf-sem').value);if(n!==PPF.semana)return toast('Consulta primero la semana seleccionada.','err');
 $('ppf-preparar').disabled=true;
 try{
  if(!await pyDatosFrescos())throw Error('No fue posible actualizar las fuentes');
  if(OBRA.id!==obra||!$('ppf-lista'))return;
  const [d1,d2]=semRange(n),sin=asSinServicioSemana(d1),ya=new Set(ppfActuales().map(r=>r.trabajador_id+'|'+r.fecha_baja));
  const candidatos=WORKERS.filter(w=>w.obra_id===obra&&w.fecha_baja>=d1&&w.fecha_baja<=d2&&!sin.has(w.id)&&!ya.has(w.id+'|'+w.fecha_baja)).sort((a,b)=>a.no_trab-b.no_trab);
  if(!candidatos.length)return toast('No hay bajas nuevas para preparar. Los casos sin servicio se excluyen.');
  if(!confirm('¿Preparar '+candidatos.length+' papeles de consulta para S'+n+'?\nNo aplicará D001 propuesto ni modificará finiquitos/pagos. Los datos dudosos se dejarán para revisión.'))return;
  let ok=0;const errores=[];
  for(const w of candidatos){
   if(OBRA.id!==obra)break;
   try{
    const h=await sb.from('historial').select('datos_despues').eq('obra_id',obra).eq('trabajador_id',w.id).eq('accion','AJUSTE_FINIQUITO_NOI').order('fecha',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle();
    if(h.error)throw Error(h.error.message);const v=h.data?.datos_despues,validacion=v?.periodo===w.fecha_baja?v.validacion_noi:null;
    const e=ppfEntradas(w,w.fecha_baja,null,validacion);
    // ISR previamente ajustado se revisa individualmente; no confirmar en lote.
    if(e.d001!=='')throw Error('ISR validado con NOI: abre el cálculo individual y confirma el papel');
    const q=await sb.rpc('prestaciones_guardar',{p:{operacion_id:_uuid(),trabajador_id:w.id,origen:'SEMANAL',version_trabajador:w.updated_at,anterior_id:null,entradas:e},confirmar_isr:false});
    if(q.error)throw Error(q.error.message);ok++;
   }catch(e){errores.push('#'+w.no_trab+' '+fullName(w)+': '+e.message);}
  }
  await ppfCargarSemana();if($('ppf-lista'))$('ppf-lista').insertAdjacentHTML('afterbegin',`<p class="fhint">${ok} papeles preparados. ${errores.length} por revisar.</p>${errores.length?'<details open><summary>Casos por revisar</summary><p>'+errores.map(esc).join('<br>')+'</p></details>':''}`);
 }catch(e){toast(e.message,'err');}finally{if($('ppf-preparar'))$('ppf-preparar').disabled=!puedeEditarTrabajador();}
}
async function ppfGuardarDesdeFicha(id,audit){
 const w=WORKERS.find(x=>x.id===id);if(!w||globalThis._PPF_FICHA_GUARDANDO)return null;
 globalThis._PPF_FICHA_GUARDANDO=true;
 try{
  if(audit.papel_prestaciones_id){
   const papel=await sb.from('prestaciones_papeles').select('*').eq('id',audit.papel_prestaciones_id).eq('obra_id',w.obra_id).eq('trabajador_id',id).single();
   if(papel.error)throw Error(papel.error.message);const g=papel.data;
   if(g.huella!==audit.papel_prestaciones_huella||g.fecha_baja!==audit.periodo||Number(g.resultado.d001)!==Number(audit.resultado.isr)
    ||Number(g.entradas.dias_aguinaldo)!==Number(audit.entradas.dias_aguinaldo)||Number(g.entradas.dias_vacaciones)!==Number(audit.entradas.dias_anio)
    ||Number(g.entradas.dias_pendientes)!==Number(audit.entradas.dias_salario_pendiente))throw Error('La ficha no coincide con el papel guardado; revisa días e ISR antes de aplicar');
   return g;
  }
  const e=ppfEntradas(w,audit.periodo,audit),manual=e.d001!=='';
  if(manual&&!confirm('¿Confirmas guardar el ISR D001 de $'+money(e.d001)+'?\n\nSe conservarán el ISR matemático, el ajuste, tu usuario y la fecha. No se requiere escribir motivo.'))return null;
  const q=await sb.from('prestaciones_papeles').select('id').eq('obra_id',w.obra_id).eq('trabajador_id',id).eq('fecha_baja',audit.periodo).neq('origen','HISTORICO').order('revision',{ascending:false}).limit(1).maybeSingle();
  if(q.error)throw Error(q.error.message);
  const res=await sb.rpc('prestaciones_guardar',{p:{operacion_id:_uuid(),trabajador_id:id,origen:'FICHA',version_trabajador:w.updated_at,anterior_id:q.data?.id||null,entradas:e},confirmar_isr:manual});
  if(res.error)throw Error(res.error.message);return res.data;
 }catch(e){toast('No se aplicó: no pudo guardarse el papel de prestaciones. '+e.message,'err');return null;}
 finally{globalThis._PPF_FICHA_GUARDANDO=false;}
}
async function ppfVersiones(){
 const d=PPF.editor;if(!d||OBRA.id!==d.w.obra_id)return;
 try{
  const q=await fetchAllRows(()=>sb.from('prestaciones_papeles').select('*').eq('obra_id',d.w.obra_id).eq('trabajador_id',d.w.id).eq('fecha_baja',d.e.fecha_baja).neq('origen','HISTORICO'),'created_at');
  if(q.error)throw Error(q.error.message);if(PPF.editor!==d||OBRA.id!==d.w.obra_id)return;
  const html=ctrlTabla(['Rev.','Autor / fecha','ISR matemático','ISR capturado','D001 anterior → nuevo','Confirmación'],(q.data||[]).sort((a,b)=>b.revision-a.revision).map(p=>`<tr><td>${p.revision}</td><td>${esc(p.actor_email)}<br>${esc(p.created_at)}</td><td>${esc(p.resultado.isr_calculado)}</td><td>${esc(p.entradas.isr_precision||'Automático')}</td><td>${esc(p.fuente.d001_anterior??'—')} → ${esc(p.resultado.d001)}</td><td>${p.fuente.manual_isr_confirmado?'ISR confirmado mediante botón':'Sin modificación manual de ISR'}</td></tr>`));
  $('ppfe-estado').innerHTML=html;
 }catch(e){toast('No se consultó la trazabilidad: '+e.message,'err');}
}
function ppfConstruirLibro(papeles){
 const wb=XLSX.utils.book_new(),ws={},merges=[],rows=[];
 const style={font:{name:'Arial',sz:9,color:{rgb:'000000'}},fill:{patternType:'solid',fgColor:{rgb:'FFFFFF'}},alignment:{vertical:'center'},border:BORD};
 const put=(addr,value,s={})=>{ws[addr]={t:typeof value==='number'?'n':'s',v:value,s:{...style,...s}};};
 const formula=(addr,f,v,s={})=>{put(addr,v,{numFmt:'0.00',...s});ws[addr].f=f;};
 const merge=(a,b)=>merges.push(XLSX.utils.decode_range(a+':'+b));
 for(let ix=0;ix<papeles.length;ix++){
  const p=papeles[ix],e=p.entradas,r=p.resultado,b=ix*34,n=k=>k+b;
  const raw=(c,k)=>c+n(k),bold={font:{name:'Arial',sz:9,bold:true}},num={numFmt:'0.00'},date=x=>Math.round((ppfDia(x)-Date.UTC(1899,11,30,12))/86400000);
  put(raw('B',1),'PAPEL DE TRABAJO · SEMANA '+p.semana,{...bold,fill:{fgColor:{rgb:'E9EDF5'}}});merge(raw('B',1),raw('I',1));
  put(raw('B',2),'NOMBRE DEL TRABAJADOR',bold);put(raw('C',2),p.nombre,bold);merge(raw('C',2),raw('J',2));
  put(raw('B',3),'NSS');put(raw('C',3),e.nss||'',{numFmt:'@'});
  for(const [k,label,val]of[[4,'FECHA DE ALTA',e.fecha_alta],[5,'FECHA DE BAJA',e.fecha_baja]]){put(raw('B',k),label);put(raw('C',k),date(val),{numFmt:'dd/mm/yyyy'});}
  put(raw('B',6),'SUELDO DIARIO');put(raw('C',6),Number(e.sd),{numFmt:'0.0000'});
  put(raw('B',7),'SUELDO SEMANAL');formula(raw('C',7),`C${n(6)}*7`,Number(e.sd)*7);
  put(raw('B',8),'DÍAS LABORADOS');formula(raw('C',8),`C${n(5)}-C${n(4)}+1`,Math.round((ppfDia(e.fecha_baja)-ppfDia(e.fecha_alta))/86400000)+1);
  ['DÍAS POR LEY','DÍAS LABORADOS','DÍAS DEL AÑO','SUELDO DIARIO','PARTE PROPORCIONAL'].forEach((h,i)=>put(raw(String.fromCharCode(67+i),10),h,{...bold,alignment:{wrapText:true,vertical:'center'}}));
  put(raw('B',11),'AGUINALDO');put(raw('C',11),15);put(raw('D',11),Number(e.dias_aguinaldo));put(raw('E',11),365);formula(raw('F',11),`C${n(6)}`,Number(e.sd));formula(raw('G',11),`C${n(11)}*D${n(11)}/E${n(11)}*F${n(11)}`,Number(r.aguinaldo_raw));
  put(raw('B',12),'VACACIONES');put(raw('C',12),Number(e.tabla_vacaciones));put(raw('D',12),Number(e.dias_vacaciones));put(raw('E',12),365);formula(raw('F',12),`C${n(6)}`,Number(e.sd));formula(raw('G',12),`C${n(12)}*D${n(12)}/E${n(12)}*F${n(12)}`,Number(r.vacaciones_raw));
  put(raw('B',13),'PRIMA VACACIONAL');put(raw('C',13),.25,{numFmt:'0%'});formula(raw('G',13),`G${n(12)}*C${n(13)}`,Number(r.prima_raw));
  put(raw('B',14),'RETENCIÓN DE ISR');merge(raw('B',14),raw('F',14));
  if(e.isr_precision==='')formula(raw('G',14),`D${n(28)}`,Number(r.isr_precision),{fill:{fgColor:{rgb:'F8CBAD'}}});
  else put(raw('G',14),Number(e.isr_precision),{...num,numFmt:'0.############',fill:{fgColor:{rgb:'F8CBAD'}}});
  put(raw('B',15),'MONTO NETO DEL FINIQUITO');merge(raw('B',15),raw('F',15));
  formula(raw('G',15),`SUM(G${n(11)}:G${n(13)})+C${n(6)}*${Number(e.dias_pendientes)}-G${n(14)}`,Number(r.bruto)-Number(r.isr_precision),{numFmt:'0.0000',fill:{fgColor:{rgb:'92D050'}}});
  formula(raw('H',15),`ROUND(G${n(15)},2)`,Number(r.neto_papel));
  put(raw('C',17),'EXENTO',bold);put(raw('D',17),'GRAVADO',bold);
  for(const [k,label]of[[18,'AGUINALDO'],[19,'VACACIONES'],[20,'PRIMA VACACIONAL']])put(raw('B',k),label);
  formula(raw('C',18),`MIN(G${n(11)},MAX(0,30*${Number(r.uma)}-${Number(e.exento_ag_usado)}))`,Number(r.exento_ag));
  formula(raw('D',18),`G${n(11)}-C${n(18)}`,Number(r.aguinaldo_raw)-Number(r.exento_ag));
  formula(raw('D',19),`G${n(12)}`,Number(r.vacaciones_raw));
  formula(raw('C',20),`MIN(G${n(13)},MAX(0,15*${Number(r.uma)}-${Number(e.exento_pv_usado)}))`,Number(r.exento_pv));
  formula(raw('D',20),`G${n(13)}-C${n(20)}`,Number(r.prima_raw)-Number(r.exento_pv));
  for(const [k,label]of[[22,'TOTAL GRAVADO'],[23,'LÍMITE INFERIOR'],[24,'EXCEDENTE DEL LÍMITE INFERIOR'],[25,'%'],[26,'IMPUESTO MARGINAL'],[27,'CUOTA FIJA'],[28,'RETENCIÓN DE ISR']]){put(raw('B',k),label,bold);merge(raw('B',k),raw('C',k));}
  // Salarios pendientes integran la base del papel; no se disfrazan de días de crédito.
  formula(raw('D',22),`SUM(D${n(18)}:D${n(20)})+C${n(6)}*${Number(e.dias_pendientes)}`,Number(r.gravado));
  formula(raw('D',23),`IF(ROUND(D${n(22)},2)<0.01,0,LOOKUP(ROUND(D${n(22)},2),G${n(18)}:G${n(28)}))`,Number(r.limite_inferior));
  formula(raw('D',24),`MAX(0,D${n(22)}-D${n(23)})`,Math.max(0,Number(r.gravado)-Number(r.limite_inferior)));
  formula(raw('D',25),`IF(D${n(23)}=0,0,LOOKUP(D${n(23)},G${n(18)}:G${n(28)},J${n(18)}:J${n(28)}))`,Number(r.tasa)/100,{numFmt:'0.00%'});
  formula(raw('D',26),`D${n(24)}*D${n(25)}`,Math.max(0,Number(r.gravado)-Number(r.limite_inferior))*Number(r.tasa)/100);
  formula(raw('D',27),`IF(D${n(23)}=0,0,LOOKUP(D${n(23)},G${n(18)}:G${n(28)},I${n(18)}:I${n(28)}))`,Number(r.cuota_fija));
  formula(raw('D',28),`D${n(26)}+D${n(27)}`,Number(r.isr_calculado));
  ['Límite inferior','Límite superior','Cuota fija','% excedente'].forEach((h,i)=>put(raw(String.fromCharCode(71+i),17),h,{...bold,alignment:{wrapText:true}}));
  PPF_TARIFA_2026.forEach((t,i)=>t.forEach((v,j)=>put(raw(String.fromCharCode(71+j),18+i),i===10&&j===1?'En adelante':j===3?v/100:v,{numFmt:j===3?'0.00%':'#,##0.00'})));
  put(raw('B',30),'SALARIOS PENDIENTES',bold);put(raw('D',30),Number(r.salarios),num);put(raw('E',30),'CRÉDITOS',bold);put(raw('F',30),Number(r.credito),num);
  put(raw('G',30),r.confirmado?'D001 · REVISADO':'D001 · AUTOMÁTICO',bold);put(raw('H',30),Number(r.d001),num);
  put(raw('B',31),'NETO NOI CON CRÉDITOS',bold);merge(raw('B',31),raw('C',31));
  formula(raw('D',31),`MAX(0,ROUND(G${n(11)},2)+ROUND(G${n(12)},2)+ROUND(G${n(13)},2)+D${n(30)}-H${n(30)}-F${n(30)})`,Number(r.neto_con_credito),{fill:{fgColor:{rgb:'D6E4F7'}}});
  put(raw('B',32),'Rev. '+p.revision+' · '+p.actor_email+' · '+p.created_at,{font:{name:'Arial',sz:8}});merge(raw('B',32),raw('J',32));
  put(raw('B',33),'Consulta · no autoriza pagos · ISR matemático visible en D'+n(28),{font:{name:'Arial',sz:8}});merge(raw('B',33),raw('J',33));
  for(let k=0;k<34;k++)rows[b+k]={hpt:[1,9,16,29].includes(k)?25:15};
 }
 for(let row=1;row<=papeles.length*34;row++)for(let col=1;col<=9;col++){
  const addr=String.fromCharCode(65+col)+row;if(!ws[addr])ws[addr]={t:'s',v:'',s:{font:style.font,fill:style.fill}};
 }
 ws['!ref']='B1:J'+papeles.length*34;ws['!merges']=merges;ws['!rows']=rows;
 ws['!cols']=[{wch:2},...([33,17,17,16,15,22,17,17,16].map(wch=>({wch})))];
 ws['!margins']={left:.25,right:.25,top:.45,bottom:.3,header:.15,footer:.15};
 XLSX.utils.book_append_sheet(wb,ws,'SEMANA '+papeles[0].semana);
 wb.Workbook={Names:[{Name:'_xlnm.Print_Area',Sheet:0,Ref:"'SEMANA "+papeles[0].semana+"'!$B$1:$J$"+papeles.length*34}]};return wb;
}
async function ppfDescargarLibro(wb,nombre,bloques=0){
 // Ruta específica: conserva fórmulas/estilos y saltos del papel, sin cambiar
 // las reglas de impresión de las otras exportaciones de la plataforma.
 if(!window.JSZip)throw Error('No está disponible el componente de Excel. Recarga antes de exportar');
 const zip=await JSZip.loadAsync(XLSX.write(wb,{type:'array',bookType:'xlsx'}));
 if(bloques){
  const path='xl/worksheets/sheet1.xml';let xml=await zip.file(path).async('string');
  const setup='<pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
  xml=xml.replace(/<pageSetup\b[^>]*\/>/g,'').replace(/<rowBreaks[\s\S]*?<\/rowBreaks>/g,'');
  const saltos=bloques>1?`<rowBreaks count="${bloques-1}" manualBreakCount="${bloques-1}">${Array.from({length:bloques-1},(_,i)=>`<brk id="${(i+1)*34}" max="16383" man="1"/>`).join('')}</rowBreaks>`:'';
  if(!/<sheetPr\b/.test(xml))xml=xml.replace(/(<worksheet[^>]*>)/,'$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
  const pos=xml.search(/<(headerFooter|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|picture|oleObjects|controls|webPublishItems|tableParts|extLst)[ \/>]/);
  xml=pos>=0?xml.slice(0,pos)+setup+saltos+xml.slice(pos):xml.replace('</worksheet>',setup+saltos+'</worksheet>');zip.file(path,xml);
  await aplicarMarcaCorporativaXlsx(zip,wb);
 }
 const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
 await registrarExportacion(wb,nombre);
}
async function ppfExportar(){
 if(PPF.obra!==OBRA.id)return;if(Number($('ppf-sem')?.value)!==PPF.semana)return toast('Consulta primero la semana seleccionada.','err');const filas=ppfActuales();if(!filas.length)return;
 try{await ppfDescargarLibro(ppfConstruirLibro(filas),'PAPEL_PRESTACIONES_'+empresaDeObra(OBRA)+'_S'+PPF.semana+'.xlsx',filas.length);}catch(e){toast('No se exportó: '+e.message,'err');}
}
async function ppfExportarHistorico(){
 if(PPF.obra!==OBRA.id||!PPF.archivo)return;
 if(Number($('ppf-sem')?.value)!==PPF.semana)return toast('Consulta primero la semana seleccionada.','err');
 try{
  const obra=OBRA.id,{data,error}=await sb.from('prestaciones_fuentes_historicas').select('contenido_base64,archivo,sha256').eq('sha256',PPF.archivo.fuente_sha256).eq('obra_id',obra).single();
  if(error)throw Error(error.message);if(OBRA.id!==obra)return;
  // Archivo original byte por byte, todas las semanas: conserva incluso
  // fórmulas, ajustes y estilos que una reserialización podría transformar.
  const bytes=Uint8Array.from(atob(data.contenido_base64),c=>c.charCodeAt(0));
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==data.sha256)throw Error('No coincide la huella del archivo histórico');
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  a.href=url;a.download=data.archivo;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
 }catch(e){toast('No se exportó el histórico: '+e.message,'err');}
}
