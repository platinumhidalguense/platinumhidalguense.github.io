// Horas extra y descansos laborados de extremo a extremo con código real de la
// plataforma y datos ficticios: calendario (57) → captura (96) → servidor →
// reapertura → prenómina (95) → proyección/exportación → fotografía y monto de
// la obligación. La parte pública usa respuestas del servidor con su forma
// real; si existe el paquete SQL privado, el mismo recorrido usa PostgreSQL
// local (pglite) con la migración real.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{parseHTML}=require('linkedom'),XLSX=require('xlsx-js-style');
const {window,document}=parseHTML('<html><body><div id="modals"></div><div id="toasts"></div><section id="cal-contenido"></section></body></html>');
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._valor??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._valor=v;}});
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{const j=x=>x===undefined?x:JSON.parse(JSON.stringify(x));assert.deepStrictEqual(j(a),j(b),m);n++;};
const tick=async(k=10)=>{for(let i=0;i<k;i++)await new Promise(r=>setImmediate(r));};
const espera=async(cond,ms=30000)=>{const t=Date.now();while(!cond()&&Date.now()-t<ms)await new Promise(r=>setTimeout(r,5));await tick(20);};
const r2=x=>Math.round((x+Number.EPSILON)*100)/100;

// ---------- código real ----------
const code=[],mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules;
for(const p of mods){
 const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.init&&['ISR_M','F_SEM','PERIODOS','ISR_TABLA','MOTOR_NOMINA_VERSION','SEMANA1'].includes(x.id.name)))code.push(s.slice(node.start,node.end));
}
const perfil={codigo:'FICTICIO_NOI',dias_fiscales:15.21,divisor_isr:365/12,factor_falta:7/6,criterio_limite_inferior:'NOI_SUPERIOR_ANTERIOR'};
const obras=[{id:'20000000-0000-4000-8000-000000000001',nombre:'OBRA FICTICIA',fecha_inicio:'2026-03-30',empresa_codigo:'PLATINUM',activa:true}],O=obras[0].id;
const W=(id,no,o)=>({id,obra_id:O,no_trab:no,nombres:'PERSONA '+no,primer_apellido:'FICTICIA',curp:'CURP'+no+'FICTICIA',estatus:'ACTIVO',periodo_pago:'SEMANAL',turno:'DIURNO',sd:400,sdi:420,sal_semanal:2500,fecha_alta:'2026-01-05',fecha_baja:null,fecha_reingreso:null,contratista:'MG',cuenta:'1234567890',banco:'BBVA',forma_pago:'TRANSFERENCIA',eliminado:false,...o});
const w1=W('30000000-0000-4000-8000-000000000001',1),w2=W('30000000-0000-4000-8000-000000000002',2),wq=W('30000000-0000-4000-8000-000000000011',11,{periodo_pago:'QUINCENAL'});
const tablas={control_jornada_eventos:[]};let rpcImpl=null;const llamadas=[];
const sb={from(t){const cond=[];const q={select(){return q;},eq(k,v){cond.push(r=>r[k]===v);return q;},in(k,vs){cond.push(r=>vs.includes(r[k]));return q;},order(){return q;},
  range(a,b){return Promise.resolve({data:(typeof tablas[t]==='function'?tablas[t]():tablas[t]||[]).filter(r=>cond.every(f=>f(r))).slice(a,b+1),error:null});},then(res,rej){return q.range(0,9999).then(res,rej);}};return q;},
 rpc:async(fn,args)=>{llamadas.push({fn,accion:args.p_accion,datos:JSON.parse(JSON.stringify(args.p_datos||{}))});try{return {data:await rpcImpl(fn,args.p_accion,args.p_datos),error:null};}catch(e){return {data:null,error:{message:e.message}};}}};
const box={window:null,document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,setImmediate,setTimeout,clearTimeout,
 OBRA:obras[0],OBRAS:obras,WORKERS:[w1,w2,wq],EMPRESA_ACTIVA:'PLATINUM',EMPRESAS:{PLATINUM:{nombre:'PLATINUM',corto:'PLATINUM'},JIRE:{nombre:'JIRE',corto:'JIRE'}},CUADS:[],CONTRATISTAS:[],DESC:[],DIFS:[],FINTRANS:[],USER:{id:'10000000-0000-4000-8000-000000000001',email:'admin@prueba.test'},sb,XLSX,
 CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81},motores_nomina:{QUINCENAL:{por_obra:{[O]:perfil}}}},
 ST:Object.fromEntries(['title','sub','head','cell','cellC','money','fin','finMoney','total','totalMoney','sect'].map(k=>[k,{}])),
 crypto:{randomUUID:(()=>{let i=0;return()=>'90000000-0000-4000-8000-'+String(++i).padStart(12,'0');})()},
 confirm:()=>true,prompt:()=>'Captura duplicada por error',scrollTo:()=>{}};
box.window=box;box.globalThis=box;vm.createContext(box);
vm.runInContext(`const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fullName=w=>[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' ').trim();
const money=v=>v==null||v===''?'':Number(v).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtD=v=>{if(!v)return'';const[y,m,d]=String(v).slice(0,10).split('-');return d+'/'+m+'/'+y;};
const today=()=>'2026-11-18';
`+code.join('\n'),box);
for(const m of ['56-calendario-core','57-calendario-trabajador','72-aguinaldo-nucleo','94-jornada-extra-core','96-jornada-extra-interfaz'])vm.runInContext(fs.readFileSync('frontend/modulos/'+m+'.js','utf8'),box);
vm.runInContext('puedeEditarTrabajador=()=>true;toast=(m)=>{(globalThis.TOASTS=globalThis.TOASTS||[]).push(m);};isoWeek=()=>34;',box);
const J=box.PLATINUM_JORNADA,UI=box.PLATINUM_JORNADA_UI;

// ---------- A. Prenómina y motores (público) ----------
const fila=(w,o)=>({w,fin:false,sueldo:2500,incidencias:0,creditos:0,otras:0,prevision:0,costo:2500,neto:2500,items:[],pago:'TRANSFERENCIA',...o});
const evento=(w,calc,o)=>({id:calc.id,obra_id:w.obra_id,trabajador_id:w.id,tipo:calc.tipo,fecha_trabajada:calc.fecha,periodicidad:w.periodo_pago,semana_origen:34,semana_aplicacion:34,
 desde_aplicacion:'2026-11-16',hasta_aplicacion:'2026-11-22',fecha_pago:'2026-11-20',bruto:calc.bruto,exento:calc.exento,gravado:calc.gravado,calculo:calc,retroactivo:false,estado:'APLICADO',version:1,...o});
const cap=x=>({jornada:{tipo:'DIURNA'},salario_base:400,sd_registrado:400,...x});
const calc=J.calcularSemana([{id:'e1',tipo:'HORAS_EXTRA',fecha:'2026-11-17',fecha_pago:'2026-11-20',orden:'1',captura:cap({minutos:600})},
 {id:'e2',tipo:'DESCANSO_OBLIGATORIO',fecha:'2026-11-16',fecha_pago:'2026-11-20',orden:'2',captura:cap({laboro:true})}]).eventos;
const evs=[evento(w1,calc.find(x=>x.id==='e1')),evento(w1,calc.find(x=>x.id==='e2'))];
const base={filas:[fila(w1,{prevision:1500,neto:4000}),fila(w2)],items:[],sem:'S34',neto:6500,costo:5000};
const congelado=JSON.stringify(base);
// Cero capturas: el modelo es exactamente el mismo objeto.
ok(box.jornadaAplicarModelo(base,[])===base,'sin capturas: modelo idéntico');
ok(box.jornadaAplicarModelo(base,evs.map(e=>({...e,trabajador_id:'otro'})))===base,'capturas de otra persona: modelo idéntico');
eq(box.jornadaCamposItem(base.filas[1]),{},'fotografía sin campos nuevos');eq(box.jornadaCamposSnapshot(base.filas),{},'huella de fotografía intacta');
const m=box.jornadaAplicarModelo(base,evs),f=m.filas[0];
eq(JSON.stringify(base),congelado,'no muta el modelo original');
const N=box.nominaSemanal(w1,{faltas:0}),isrSin=J.efectoIsr(0,g=>box.PLATINUM_AGUINALDO.isrSemanalMotor(r2(N.bruto+g),7,box.FISC(),box.isrPeriodo));
const brutoEsp=r2(calc.reduce((s,x)=>s+x.bruto,0)),gravEsp=r2(calc.reduce((s,x)=>s+x.gravado,0));
const isrCon=box.PLATINUM_AGUINALDO.isrSemanalMotor(r2(N.bruto+gravEsp),7,box.FISC(),box.isrPeriodo).isr,isrBase=box.PLATINUM_AGUINALDO.isrSemanalMotor(N.bruto,7,box.FISC(),box.isrPeriodo).isr;
eq([f.jornada.bruto,f.jornada.gravado,f.jornada.isr],[brutoEsp,gravEsp,r2(isrCon-isrBase)],'semanal: ISR = nómina completa con − sin, mismo motor');
eq([f.sueldo,f.prevision,f.neto],[2500,1500,r2(4000+brutoEsp-f.jornada.isr)],'diferencial conservado; la percepción no se absorbe');
eq(m.neto,r2(6500+f.jornada.neto),'total del modelo cuadra');eq(m.filas[1],base.filas[1],'otras filas intactas');
ok(f.jornada.isr>0&&f.jornada.isr<f.jornada.gravado,'ISR acotado por el gravado');
eq(f.jornada.minutos_dobles+f.jornada.minutos_triples,600,'horas completas');eq(f.jornada.eventos,['e1','e2'],'eventos ligados');
// Con aguinaldo en la misma fila: ISR(ord+ag+jor) − ISR(ord+ag); suma de ambos ISR = ISR total − ordinario.
const conAg=box.jornadaAplicarModelo({...base,filas:[{...base.filas[0],aguinaldo:{gravado:1000,isr:0}},base.filas[1]]},evs).filas[0];
const isrAg=box.PLATINUM_AGUINALDO.isrSemanalMotor(r2(N.bruto+1000),7,box.FISC(),box.isrPeriodo).isr,isrTodo=box.PLATINUM_AGUINALDO.isrSemanalMotor(r2(N.bruto+1000+gravEsp),7,box.FISC(),box.isrPeriodo).isr;
eq(conAg.jornada.isr,r2(isrTodo-isrAg),'sin doble retención con aguinaldo en el periodo');
// Quincenal: perfil y días fiscales del motor 53.
const evq=evs.map(e=>({...e,id:e.id+'q',trabajador_id:wq.id,periodicidad:'QUINCENAL',desde_aplicacion:'2026-11-16',hasta_aplicacion:'2026-11-30',fecha_pago:'2026-11-30',calculo:{...e.calculo,id:e.id+'q'}}));
const mq=box.jornadaAplicarModelo({...base,filas:[fila(wq)]},evq),fq=mq.filas[0];
const pq=box.calendarioNominaDe(wq,'S34'),Nq=box.nominaQuincenal(wq,{dias:pq.dias,desde:pq.desde,hasta:pq.hasta});
const q=g=>box.isrOrdinarioQuincenal(r2(Nq.bruto+g),perfil.dias_fiscales,perfil,{...box.FISC(),mes:pq.desde.slice(0,7)});
eq([fq.jornada.isr,fq.jornada.isr_detalle.metodo],[r2(q(gravEsp).isr-q(0).isr),'ART96_QUINCENAL'],'quincenal: perfil y días fiscales');
// Finiquito con capturas: se bloquea; capturas sin fila: se exige completar.
assert.throws(()=>box.jornadaAplicarModelo({...base,filas:[{...fila(w1),fin:true}]},evs),/finiquito/);n++;
eq(box.jornadaSinFila(m,evs,{periodo:'SEMANAL'}),[],'todas con fila');
assert.throws(()=>box.jornadaExigirCompleto(box.jornadaAplicarModelo({...base,filas:[fila(w2)]},evs),evs,{periodo:'SEMANAL'}),/no tienen fila/);n++;
assert.throws(()=>box.jornadaAplicarModelo(base,[{...evs[0],bruto:1}]),/inconsistentes/);n++;
eq(box.jornadaCamposItem(f),{jornada_bruto:f.jornada.bruto,jornada_exento:f.jornada.exento,jornada_gravado:f.jornada.gravado,jornada_isr:f.jornada.isr,jornada_neto:f.jornada.neto,jornada_eventos:['e1','e2']},'fotografía con desglose');
// Exportación: columna nueva sólo con capturas; hoja de desglose cuadra.
const meta={titulo:'PROYECCIÓN FICTICIA',sub:'Empresa / centro',pie:'Periodo ficticio',colB:'CONTRATISTA',codigo:'PLATINUM'};
const libro=(mm,d)=>box.proyLibro(mm,d,meta),hoja=(wb)=>XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
const base0={...base,filas:base.filas.map(x=>({...x,prevision:0,neto:2500})),neto:5000},m0=box.jornadaAplicarModelo(base0,evs);
for(const destino of ['DISPERSION','CONTRATISTA'])for(const [bb,mm,compacto] of [[base,m,true],[base0,m0,false]]){
 const sin=libro(bb,destino),con=libro(mm,destino),hs=hoja(sin),hc=hoja(con),et=destino+(compacto?' compacto':'');
 ok(!sin.SheetNames.includes('HORAS EXTRA')&&!hs[2].includes('HORAS EXTRA Y DESCANSOS BRUTO'),'sin capturas: formato vigente '+et);
 ok(con.SheetNames.includes('HORAS EXTRA'),'hoja de desglose '+et);
 if(compacto)eq(hc[2],hs[2],'formato de tres importes conservado '+et);
 else{const c=hc[2].indexOf('HORAS EXTRA Y DESCANSOS BRUTO');ok(c>0,'columna informativa '+et);eq(hc.find(r=>r[0]===1)[c],mm.filas[0].jornada.bruto,'bruto en la fila '+et);
  eq(hc[2].length,hs[2].length+1,'una sola columna nueva '+et);}
 if(destino==='DISPERSION')ok(hc.some(r=>r.includes(mm.neto)),'el total exportado incluye el neto adicional '+et);
 const d=XLSX.utils.sheet_to_json(con.Sheets['HORAS EXTRA'],{header:1,defval:''}),tot=d.find(r=>r[0]==='TOTAL');
 eq([tot[11],tot[12],tot[13],tot[14],tot[15]],[f.jornada.bruto,f.jornada.exento,f.jornada.gravado,f.jornada.isr,f.jornada.neto],'hoja de desglose cuadra '+destino);
 eq(r2(tot[12]+tot[13]),tot[11],'exento + gravado = bruto');ok(/019 horas extra/.test(d.at(-1)[0])&&/020 prima dominical/.test(d.at(-1)[0]),'claves SAT de referencia sin inventar la del descanso');
}
eq(box.proyAuditoria(m,['DISPERSION'])[0].entradas.jornada.eventos,['e1','e2'],'auditoría del cálculo');
ok(!box.proyAuditoria(base,['DISPERSION'])[0].entradas.jornada,'auditoría sin capturas: sin campo');
// Contrato estático: los mismos puntos de integración que el aguinaldo.
const src=m=>fs.readFileSync('frontend/modulos/'+m+'.js','utf8');
ok(/jornadaExigirCompleto\(jornadaAplicarModelo\(live,globalThis\._PY_JORNADAS\)/.test(src('38-adaptadores-arranque'))&&/jornadaCamposItem\(f\)/.test(src('38-adaptadores-arranque')),'fotografía autorizada');
ok(/jornadaAplicarModelo\(aguinaldoAplicarModelo\(m,datos\.aguinaldos\),datos\.jornadas\)/.test(src('13-control-salarial-diferenciales')),'control salarial');
ok(/jornadaAplicarModelo\(modelo,\(globalThis\._PY_JORNADAS/.test(src('39-rrhh-adaptadores')),'RR. HH.');
for(const mo of ['52-motor-nomina-semanal','53-motor-nomina-quincenal'])ok(!/jornada/i.test(src(mo)),'motor intacto '+mo);
ok(!/NETO_DIRECTO/.test(src('96-jornada-extra-interfaz')+src('95-jornada-extra-integracion')),'no usa la inyección neta');

// ---------- B. Calendario → captura → servidor → reapertura → prenómina → obligación ----------
async function recorrido(llamar,leer,etiqueta){
 llamadas.length=0;
 rpcImpl=async(fn,acc,datos)=>{
  if(fn==='control_calendario_trabajador')return {eventos:[],catalogo:[{id:2,nombre:'FALTA',clase:'FALTA'}],percepciones:[],prestamos:[],creditos:[],anteriores:[],certificados:[]};
  if(fn==='control_jornada')return llamar(acc,datos);
  throw Error('rpc inesperada '+fn);
 };
 tablas.control_jornada_eventos=leer;
 await box.PLATINUM_CALENDARIO.montar(w1.id,'2026-11');await espera(()=>document.querySelector('[data-cal="dia"]'));
 const host=document.getElementById('cal-contenido');
 ok(/Descanso obligatorio/.test(host.innerHTML),etiqueta+': el festivo se muestra sólo como información');
 eq(llamadas.filter(x=>x.accion==='CONFIRMAR').length,0,etiqueta+': ver un festivo no crea pagos');
 host.querySelector('[data-cal="dia"][data-fecha="2026-11-17"]').click();await tick();
 const sel=document.getElementById('cal-clase');ok(sel.innerHTML.includes('JORNADA_HORAS_EXTRA')&&sel.innerHTML.includes('JORNADA_DESCANSO_OBLIGATORIO'),etiqueta+': opciones dentro del calendario');
 sel.value='JORNADA_HORAS_EXTRA';sel.dispatchEvent(new window.Event('change',{bubbles:true}));await espera(()=>document.getElementById('jx-horas')||document.getElementById('jx-error')?.textContent);
 const $=id=>document.getElementById('jx-'+id);
 ok(/OBRA FICTICIA/.test($('form').innerHTML)&&/MG/.test($('form').innerHTML)&&/SEMANAL/.test($('form').innerHTML),etiqueta+': contexto recuperado (razón social, centro, contratista, periodicidad)');
 $('horas').value='2';$('horas').dispatchEvent(new window.Event('input',{bubbles:true}));
 $('revisar').click();await espera(()=>/Vista previa/.test($('previa').innerHTML)||$('error').textContent);
 ok(/Vista previa/.test($('previa').innerHTML),etiqueta+': vista previa '+$('error').textContent+' | '+$('previa').textContent.slice(0,80));
 ok(/\$200\.00/.test($('previa').innerHTML)&&/50\.00/.test($('previa').innerHTML),etiqueta+': $50/h y 2 h dobles = $200');
 ok(/Efecto en ISR/.test($('previa').innerHTML)&&/Neto adicional/.test($('previa').innerHTML),etiqueta+': ISR y neto en la vista previa');
 // Cambiar horas invalida la vista previa.
 $('minutos').value='30';$('minutos').dispatchEvent(new window.Event('input',{bubbles:true}));
 ok($('guardar').disabled&&$('previa').innerHTML==='',etiqueta+': un cambio invalida la vista previa');
 $('minutos').value='';$('minutos').dispatchEvent(new window.Event('input',{bubbles:true}));
 $('revisar').click();await espera(()=>/Vista previa/.test($('previa').innerHTML)||$('error').textContent);
 // Doble clic: una sola confirmación.
 $('guardar').click();$('guardar').click();await espera(()=>!document.getElementById('jx-form'));await espera(()=>/Horas extra 2:00/.test(document.getElementById('cal-contenido').innerHTML),5000);
 eq(llamadas.filter(x=>x.accion==='CONFIRMAR').length,1,etiqueta+': doble clic no duplica');
 ok(!document.getElementById('jx-form'),etiqueta+': modal cerrado al confirmar · '+(document.getElementById('jx-error')?.textContent||''));
 eq(document.querySelectorAll('#modals .overlay').length,0,etiqueta+': un solo diálogo en todo el recorrido');
 // Reapertura: el calendario relee y muestra la captura con sus importes.
 await tick(20);
 ok(/Horas extra 2:00 h/.test(host.innerHTML)&&/\$200\.00 bruto/.test(host.innerHTML),etiqueta+': reapertura muestra la captura');
 // Prenómina → proyección → fotografía → obligación.
 const leidos=await box.jornadaLeerEventos([O]);eq(leidos.length,1,etiqueta+': una captura vigente');
 const mm=box.jornadaAplicarModelo({filas:[fila(w1)],items:[],sem:'S34',neto:2500,costo:2500},leidos),ff=mm.filas[0];
 eq([ff.jornada.bruto,ff.jornada.exento,ff.jornada.gravado],[200,100,100],etiqueta+': prenómina con desglose');
 const item={monto:ff.neto,...box.jornadaCamposItem(ff)};
 eq(item.monto,r2(2500+200-ff.jornada.isr),etiqueta+': la obligación usa el neto con la percepción (una sola obligación por trabajador)');
 const wb=box.proyLibro(mm,'DISPERSION',{titulo:'T',sub:'S',pie:'P',colB:'CONTRATISTA',codigo:'PLATINUM'});ok(wb.SheetNames.includes('HORAS EXTRA'),etiqueta+': exportación');
 return {item,ff};
}
(async()=>{
 // Respuestas con la forma real del servidor, calculadas con el mismo núcleo.
 const guardados=[];
 const ctx=()=>({version:'JORNADA_EXTRA_V1',trabajador:{id:w1.id,no_trab:1,obra_id:O,centro:'OBRA FICTICIA',empresa:'PLATINUM',contratista:'MG',registro_patronal:null,periodo_pago:'SEMANAL',sd:400,sdi:420,turno:'DIURNO',fecha_alta:'2026-01-05',fecha_baja:null,fecha_reingreso:null,curp_documentada:true},
  regla:J.regla('2026-11-17'),festivos:[],origen:{desde:'2026-11-16',hasta:'2026-11-22',semana:34},destino:{desde:'2026-11-16',hasta:'2026-11-22',semana:34},retroactivo:false,fecha_pago:'2026-11-20',semana_servicio:'2026-11-16',ciclo_anterior:false,conflictos:[],semana:[]});
 const simulado=async(acc,d)=>{
  if(acc==='LISTAR')return {eventos:guardados};
  if(acc==='CONTEXTO')return ctx();
  const c={...d.captura,sd_registrado:400,jornada:d.captura.jornada||{tipo:'DIURNA'}};if(c.salario_base==null)c.salario_base=400;
  const e=J.calcularSemana([{id:d.clave_idempotencia,tipo:d.tipo,fecha:d.fecha,fecha_pago:'2026-11-20',orden:'9',captura:c}]).eventos[0];
  const q={...ctx(),firma:'F-'+JSON.stringify(c),evento:e,totales:{bruto:e.bruto,exento:e.exento,minutos_dobles:e.minutos_dobles,minutos_triples:e.minutos_triples},redistribucion:[],captura:c,periodicidad:'SEMANAL'};
  if(acc==='PREVIA')return q;
  if(acc==='CONFIRMAR'){if(d.firma!==q.firma)throw Error('La vista previa cambió');await tick(3);guardados.push({...evento(w1,e),id:d.clave_idempotencia,protegido:false});return {id:d.clave_idempotencia,semana_aplicacion:34,redistribuidas:0};}
 };
 await recorrido(simulado,()=>guardados,'simulado');

 const dir=path.join(__dirname,'..','supabase/migrations'),mig=fs.existsSync(dir)&&fs.readdirSync(dir).find(x=>x.endsWith('_jornada_extra_descansos_laborados.sql')),priv=path.join(__dirname,'..','work/jornada_20261118/prod_calendario.sql');
 if(!mig||!fs.existsSync(priv)){console.log(`OK test_jornada_extra_recorrido: ${n} comprobaciones (servidor real omitido: paquete SQL privado ausente)`);return;}
 const {makeDatabase,ids,actor,owner}=require('./soporte_flujo_pg.cjs');
 const db=await makeDatabase();
 await db.exec(`create table if not exists public.catalogo_incidencias(id smallint primary key,nombre text);
  create table if not exists public.incidencias_empleados(id uuid primary key default gen_random_uuid(),obra_id uuid,empleado_id uuid,fecha_aplicacion date,id_incidencia smallint,clase text,estado text default 'APLICADO');`);
 await db.exec(fs.readFileSync(priv,'utf8'));
 await db.exec("create or replace function platinum_internal.calendario_hoy() returns date language sql stable as $$select date '2026-11-18'$$");
 await owner(db,"update obras set fecha_inicio='2026-03-30'");
 await owner(db,"update trabajadores set sd=400,sdi=420,curp='CURP'||no_trab||'FICTICIA',periodo_pago='SEMANAL',turno='DIURNO',fecha_alta='2026-01-05',contratista='MG'");
 await db.exec(fs.readFileSync(path.join(dir,mig),'utf8'));
 const real=async(acc,d)=>{await actor(db,'admin');try{return (await db.query('select public.control_jornada($1,$2::jsonb) r',[acc,JSON.stringify(d)])).rows[0].r;}finally{await db.exec('reset role');}};
 const filas=()=>[];let cache=[];
 const leer=()=>cache;
 const llamar=async(acc,d)=>{let r;try{r=await real(acc,d);}catch(e){if(process.env.JDBG)console.log('RPC',acc,e.message);throw e;}if(process.env.JDBG)console.log('RPC ok',acc);cache=(await owner(db,"select id,obra_id,trabajador_id,tipo,fecha_trabajada::text,periodicidad,semana_origen,semana_aplicacion,desde_aplicacion::text,hasta_aplicacion::text,fecha_pago::text,bruto::float8 bruto,exento::float8 exento,gravado::float8 gravado,calculo,retroactivo,estado,version from control_jornada_eventos")).rows;return r;};
 guardados.length=0;
 const {item}=await recorrido(llamar,leer,'servidor real');
 eq(Number((await owner(db,'select count(*) c from control_jornada_eventos')).rows[0].c),1,'servidor: una sola fila');
 eq(Number((await owner(db,"select count(*) c from control_bitacora where modulo='JORNADA'")).rows[0].c),1,'servidor: una entrada de bitácora');
 // Registrar no paga: no hay pagos, cheques ni obligaciones nuevas.
 for(const t of ['pagos','cheques'])eq(Number((await owner(db,`select count(*) c from ${t}`)).rows[0].c),0,'sin '+t+' creados');
 ok(item.jornada_eventos.length===1,'la fotografía liga la captura');
 console.log(`OK test_jornada_extra_recorrido: ${n} comprobaciones (incluye servidor real en pglite)`);
})().catch(e=>{console.error(e);process.exit(1);});
