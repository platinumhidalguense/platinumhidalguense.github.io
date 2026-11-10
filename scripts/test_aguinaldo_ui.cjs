// Aguinaldo: corrida en cuatro pasos, faltas históricas en la ficha, panel de
// finiquito y post-proceso de proyección. Datos ficticios; no usa Supabase.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{parseHTML}=require('linkedom');
const {window,document}=parseHTML('<html><body><div id="modals"></div><div id="ficha"></div></body></html>');
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._valor??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._valor=v;}});
let n=0;const ok=(c,m)=>{assert(c,m);n++;},eq=(a,b,m)=>{const j=x=>x===undefined?x:JSON.parse(JSON.stringify(x));assert.deepStrictEqual(j(a),j(b),m);n++;};
const tick=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setImmediate(r));};

// ---------- Código real de la plataforma ----------
const code=[],mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules;
for(const p of mods){
 const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.init&&['ISR_M','F_SEM','PERIODOS','ISR_TABLA','MOTOR_NOMINA_VERSION','SEMANA1'].includes(x.id.name)))code.push(s.slice(node.start,node.end));
}
const obras=[{id:'O',nombre:'OBRA FICTICIA',fecha_inicio:'2026-03-30',empresa_codigo:'PLATINUM',activa:true}];
const W=(id,no,o)=>({id,obra_id:'O',no_trab:no,nombres:'PERSONA '+no,primer_apellido:'FICTICIA',curp:'CURP'+no,estatus:'ACTIVO',periodo_pago:'SEMANAL',sd:500,sdi:524.65,sal_semanal:3000,fecha_alta:'2026-06-03',fecha_baja:null,fecha_reingreso:null,contratista:'MG',eliminado:false,...o});
const w1=W('w1',1),w2=W('w2',2),w3=W('w3',3,{fecha_alta:'2026-10-28'}),w4=W('w4',4,{estatus:'BAJA',fecha_baja:'2026-09-30'}),w5=W('w5',5,{periodo_pago:'QUINCENAL'});
const bdd={trabajadores:[w1,w2,w3,w4,w5],control_aguinaldo_lineas:[]};
const llamadas=[],toasts=[],descargas=[];let editar=true,rpc=null;
const sb={from(tabla){const cond=[];const q={select(){return q;},eq(k,v){cond.push(r=>r[k]===v);return q;},in(k,vs){cond.push(r=>vs.includes(r[k]));return q;},order(){return q;},
  range(a,b){return Promise.resolve({data:(bdd[tabla]||[]).filter(r=>cond.every(f=>f(r))).slice(a,b+1),error:null});}};return q;},
 rpc:async(fn,args)=>{llamadas.push({fn,args:JSON.parse(JSON.stringify(args))});return rpc(fn,args);},
 storage:{from:()=>({upload:async()=>({error:null}),createSignedUrl:async()=>({data:{signedUrl:'about:blank'}})})}};
const box={window:null,document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,setImmediate,
 OBRA:obras[0],OBRAS:obras,WORKERS:[w1,w2,w3,w4,w5],EMPRESA_ACTIVA:'PLATINUM',EMPRESAS:{PLATINUM:{nombre:'PLATINUM',corto:'PLATINUM'},JIRE:{nombre:'JIRE',corto:'JIRE'}},
 CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81}},CUADS:[],CONTRATISTAS:[],DESC:[],DIFS:[],FINTRANS:[],USER:{id:'u',email:'u@x'},sb,
 ST:Object.fromEntries(['title','sub','head','cell','cellC','money','fin','finMoney','total','totalMoney','sect'].map(k=>[k,{}])),
 crypto:{randomUUID:(()=>{let i=0;return()=>'00000000-0000-4000-8000-'+String(++i).padStart(12,'0');})()},
 confirm:()=>true,prompt:()=>'Motivo de prueba suficiente',scrollTo:()=>{},
 XLSX:{utils:{encode_col:i=>String.fromCharCode(65+i),book_new:()=>({SheetNames:[],Sheets:{}}),book_append_sheet:(wb,ws,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=ws;}}}};
box.window=box;box.globalThis=box;vm.createContext(box);
vm.runInContext(`const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fullName=w=>[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' ').trim();
const money=v=>v==null||v===''?'':Number(v).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtD=v=>{if(!v)return'';const[y,m,d]=String(v).slice(0,10).split('-');return d+'/'+m+'/'+y;};
const today=()=>'2026-11-10';
const dmyAiso=v=>{const m=String(v||'').trim().match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):null;};
`+code.join('\n'),box);
for(const m of ['72-aguinaldo-nucleo','74-aguinaldo-corrida','75-faltas-historicas'])vm.runInContext(fs.readFileSync('frontend/modulos/'+m+'.js','utf8'),box);
Object.assign(box,{toast:(s,t)=>toasts.push({s,t}),puedeEditarTrabajador:()=>editar,razonSocialEmpresa:()=>'RAZÓN FICTICIA',dl:async(wb,name)=>{descargas.push({wb,name});},
 buildSheet:(rows,styles,widths,merges)=>{const ws={_rows:rows,_widths:widths,_merges:merges};rows.forEach((row,r)=>row.forEach((v,c)=>ws[String.fromCharCode(65+c)+(r+1)]={t:typeof v==='number'?'n':'s',v}));return ws;}});
const A=box.PLATINUM_AGUINALDO,UI=box.PLATINUM_AGUINALDO_UI,FH=box.PLATINUM_FALTAS_HIST,$=id=>document.getElementById(id);
const click=el=>{assert(el,'elemento inexistente');el.dispatchEvent(new window.Event('click',{bubbles:true}));};
const valor=(id,v)=>{const el=$(id);assert(el,id);el.value=v;el.setAttribute?.('value',v);};

// ---------- Contexto ficticio del servidor ----------
const persona=(w,o={})=>({trabajador_id:w.id,obra_id:w.obra_id,empresa_codigo:'PLATINUM',identidad:w.curp,huella_fuentes:'H-'+w.id,movimientos:[],calendario:[],faltas_semana:[],historicas:[],aplicaciones:[],papeles:[],finiquitos:[],...o});
let ctx={w1:persona(w1),w2:persona(w2,{calendario:[{id:'c1',fecha:'2026-07-07',id_incidencia:2},{id:'c2',fecha:'2026-08-11',id_incidencia:9}]}),w3:persona(w3),
 w4:persona(w4,{finiquitos:[{id:'f4',periodo:'2026-09-30',monto_aplicado:5200,aguinaldo:null}]}),w5:persona(w5)};
let historial=[],aplicar=null;
const servidor=(fn,a)=>{
 const d=a.p_datos||{};
 if(fn==='control_aguinaldo'&&a.p_accion==='CONTEXTO')return {data:{ejercicio:d.ejercicio,salud:true,coberturas:[{obra_id:'O',inicio_centro:'2026-03-30',primera_captura_calendario:'2026-04-02',primera_semana_descuentos:1}],personas:d.trabajadores.map(id=>ctx[id]).filter(Boolean)}};
 if(fn==='control_aguinaldo'&&a.p_accion==='HISTORIAL')return {data:{lineas:historial}};
 if(fn==='control_aguinaldo'&&a.p_accion==='APLICAR')return aplicar(d);
 if(fn==='control_aguinaldo'&&a.p_accion==='RETIRAR')return {data:{id:d.id,estado:'RETIRADO'}};
 throw Error('RPC no esperada '+fn+' '+a.p_accion);
};
rpc=servidor;

(async()=>{
 // ---------- 1. Corrida: parámetros y cálculo ----------
 UI.abrir();ok($('agc'),'abre la corrida');
 eq([...document.querySelectorAll('[data-agc-paso]')].map(b=>b.disabled),[false,true,true,true],'pasos 2 a 4 bloqueados hasta calcular');
 valor('agc-centro','O');valor('agc-desde','2026-03-30');valor('agc-hasta','2026-10-27');valor('agc-fecha_destino','2026-12-09');
 valor('agc-hasta','2026-03-01');click(document.querySelector('[data-agc-acc="calcular"]'));await tick();
 ok(toasts.at(-1).s.includes('invertido'),'rango invertido rechazado');
 valor('agc-hasta','2026-10-27');valor('agc-dias_pactados','20');click(document.querySelector('[data-agc-acc="calcular"]'));await tick();
 ok(toasts.at(-1).s.includes('respalda más de 15'),'días superiores a 15 exigen respaldo');
 valor('agc-dias_pactados','15');click(document.querySelector('[data-agc-acc="calcular"]'));await tick(20);
 const S=UI._pruebas.estado();
 eq(S.paso,1,'pasa a personal y cálculo');
 eq(S.filas.map(f=>f.w.no_trab),[1,2,5],'incluidos: vínculo en el rango y activos hoy');
 const f1=S.filas[0],f2=S.filas[1],f5=S.filas[2];
 eq([f1.fila.derecho.dias_computables,f1.fila.bruto_causado],[212,4356.16],'caso de referencia: 212 días, $500, 15 días');
 eq([f2.fila.derecho.faltas_afectan,f2.fila.derecho.dias_computables,f2.fila.bruto_causado],[2,210,4315.07],'dos faltas (catálogo 2 y 9) → 210 días');
 eq([f1.dest.semana,f1.dest.desde,f1.dest.hasta,f1.dest.fecha_pago],[37,'2026-12-07','2026-12-13','2026-12-11'],'nómina destino por calendario del centro');
 eq([f1.fila.fiscal.exento,f1.fila.fiscal.gravado],[3519.3,836.86],'exento 30 UMA 2026 por fecha de pago');
 const N=box.nominaSemanal(w1,{faltas:0}),i96=A.isrArt96Semanal({bruto_ordinario:N.bruto,dias:7,gravado:836.86},box.FISC(),box.isrPeriodo);
 eq([f1.fila.fiscal.isr,f1.fila.fiscal.neto],[i96.isr,Math.round((4356.16-i96.isr)*100)/100],'ISR incremental art. 96 del motor semanal');
 ok(i96.isr>0&&i96.isr<836.86,'ISR acotado al gravado');
 ok(f5.fila.estado==='BLOQUEADA'&&f5.fila.observaciones.some(o=>o.codigo==='FISCAL_INCOMPLETO'),'quincenal sin perfil validado: fiscal incompleto, no se aplica');
 eq(S.fuera.map(f=>[f.w.no_trab,f.motivo]),[[3,'EXCLUIDO_POR_FILTRO'],[4,'EXCLUIDO_POR_FILTRO']],'alta 28/10 y baja quedan fuera de esta corrida');
 ok(S.fuera[0].sel.detalle.includes('2026-10-27'),'explica el límite del rango');
 ok([...S.sel].length===2,'preselecciona sólo filas listas');
 const tabla=$('agc-cuerpo').textContent;
 ok(tabla.includes('4,356.16')&&tabla.includes('4,315.07')&&tabla.includes('Fuera de esta corrida'),'tabla con bruto causado y sección de excluidos');
 ok(tabla.includes('8,671.23'),'total de filas seleccionadas');
 // Cambiar el rango a 28/10 incluye el alta del 28; FECHA_ALTA desde 30/03 sólo altas del rango.
 const p={...S.p,hasta:'2026-10-28'};
 eq(UI._pruebas.calcularPersona(w3,ctx.w3,p).sel.incluido,true,'mover el límite un día incluye el alta del 28/10');
 eq(UI._pruebas.calcularPersona(w1,ctx.w1,{...p,modo:'FECHA_ALTA',desde:'2026-06-04'}).sel.incluido,false,'FECHA_ALTA: sólo altas dentro del rango');
 eq(UI._pruebas.calcularPersona(w1,ctx.w1,{...p,modo:'FECHA_ALTA',desde:'2026-06-04'}).fila.bruto_causado,4356.16,'el filtro no cambia lo causado');
 // Baja con saldo: va al finiquito; finiquito global = evidencia pendiente.
 const b4=UI._pruebas.calcularPersona(w4,ctx.w4,{...p,estatus:'BAJAS_CON_SALDO',fecha_estatus:'2026-11-10'});
 ok(b4.sel.incluido&&b4.fila.observaciones.some(o=>o.codigo==='BAJA_FINIQUITO')&&b4.fila.observaciones.some(o=>o.codigo==='EVIDENCIA_PENDIENTE'),'baja: saldo por finiquito y finiquito global pendiente de desglose');
 // Segunda quincena con ajuste mensual: art. 96 bloqueado; art. 174 permitido.
 const q2=UI._pruebas.calcularPersona(w5,ctx.w5,{...p,fecha_destino:'2026-12-23'});
 ok(q2.dest.desde==='2026-12-16'&&q2.fila.observaciones.some(o=>o.codigo==='FISCAL_INCOMPLETO'&&o.texto.includes('174')),'Q2 con ajuste mensual exige art. 174');
 const q2b=UI._pruebas.calcularPersona(w5,ctx.w5,{...p,fecha_destino:'2026-12-23',metodo_isr:'ART174'});
 ok(q2b.fila.estado==='LISTA'&&q2b.fila.fiscal.isr_detalle.metodo==='ART174'&&q2b.dest.fecha_pago==='2026-12-31','art. 174: quincena 16–31, pago al cierre');
 // Pagos anteriores: aplicación autorizada acredita; CFDI y pago de la misma operación una vez.
 const pre=persona(w1,{aplicaciones:[{id:'L0',estado:'APLICADO',estado_destino:'PAGADO',bruto:2000,exento:2000,fecha_pago:'2026-11-06',semana:32,obra_id:'O'}]});
 const r1=UI._pruebas.calcularPersona(w1,pre,p);
 eq([r1.fila.conciliacion.acreditado,r1.fila.saldo,r1.fila.fiscal.exento,r1.fila.fiscal.gravado],[2000,2356.16,1519.3,836.86],'parcialidad: saldo y exención restante');
 eq(UI._pruebas.lineaDe(r1).acreditado_externo,0,'lo aplicado no se declara como externo');
 const dup=UI._pruebas.evidenciasDe(persona(w1,{finiquitos:[{id:'a',periodo:'2026-05-31',aguinaldo:900,exento_ag:900}],papeles:[{id:'p',fecha_baja:'2026-05-31',revision:2,aguinaldo:900,exento_ag:900}]}),[],2026);
 eq(A.conciliar(4000,dup,'2026').acreditado,900,'finiquito y sus papeles: la misma operación cuenta una vez');
 eq(UI._pruebas.cantidadFaltas({tipo:'FALTA',motivo:'2 faltas sueltas'}),null,'no infiere faltas de notas libres');
 eq(UI._pruebas.cantidadFaltas({tipo:'FALTA',calculo:{modo:'AUTOMATICO',faltas:2,incapacidad_imss:0}}).faltas,2,'usa el desglose del motor');

 // ---------- 2. Desglose y conciliación ----------
 click(document.querySelector('[data-agc-acc="desglose"][data-i="0"]'));
 const des=document.querySelectorAll('.overlay')[1].textContent;
 ok(des.includes('500.00 × 15 × 212 ÷ 365')&&des.includes('3,519.30')&&des.includes('Art. 96'),'desglose individual: fórmula, exención e ISR');
 box.closeModal2();
 click(document.querySelector('[data-agc-paso="2"]'));ok($('agc-cuerpo').textContent.includes('Acreditado'),'paso de conciliación');

 // ---------- 3. Excel para firmas ----------
 click(document.querySelector('[data-agc-acc="ir"][data-paso="3"]'));await tick();
 click(document.querySelector('#agc-pie [data-agc-acc="excel"]'));await tick();
 const xl=descargas.at(-1).wb.Sheets['AGUINALDO 2026']._rows;
 ok(xl[2].includes('FIRMA DE RECIBIDO')&&xl.filter(r=>typeof r[0]==='number').length===2,'Excel para firmas con las filas seleccionadas');

 // ---------- 4. Aplicación ----------
 let pedido=null;aplicar=d=>{pedido=d;return {data:{lote_id:'LOTE',lineas:d.lineas.length,bruto:0,isr:0,neto:0}};};
 click(document.querySelector('[data-agc-acc="aplicar"]'));await tick(20);
 ok(pedido&&pedido.lineas.length===2,'un lote por centro y periodicidad');
 const l1=pedido.lineas.find(l=>l.trabajador_id==='w1');
 eq([l1.periodicidad,l1.semana,l1.periodo_desde,l1.periodo_hasta,l1.fecha_pago,l1.denominador,l1.dias_computables,l1.bruto_causado,l1.bruto],['SEMANAL',37,'2026-12-07','2026-12-13','2026-12-11',365,212,4356.16,4356.16],'línea con el contrato del servidor');
 eq(Math.round(l1.salario_base*l1.dias_pactados*l1.dias_computables/l1.denominador*100)/100,l1.bruto_causado,'el servidor puede reproducir el bruto');
 eq([l1.exento,l1.gravado,l1.isr,l1.desglose.fiscal.isr_detalle.isr,l1.huella_fuentes,l1.acreditado_externo,l1.exento_usado],[3519.3,836.86,i96.isr,i96.isr,'H-w1',0,0],'exento, gravado, ISR y huella');
 ok(pedido.operacion_id&&pedido.parametros.dias_pactados===15&&pedido.reglas_version===A.VERSION,'idempotencia y parámetros del lote');
 ok(toasts.some(t=>t.s.includes('lote(s) aplicados')),'confirma la aplicación');
 ok(document.querySelector('[data-agc-acc="aplicar"]').disabled,'un lote aplicado no se reenvía sin recalcular');
 click(document.querySelector('[data-agc-paso="1"]'));click(document.querySelector('[data-agc-acc="calcular"]'));await tick(20);
 ok(UI._pruebas.estado().paso===1&&UI._pruebas.estado().filas.length===3&&UI._pruebas.estado().lotes.size===0,'recalcular desde el paso 2 usa los parámetros vigentes');
 click(document.querySelector('[data-agc-paso="3"]'));
 // Conflicto todo-o-nada: no hay aplicación parcial y el reintento conserva el identificador.
 const ops=[];aplicar=d=>{ops.push(d.operacion_id);return {error:{message:'CONFLICTO_AGUINALDO',details:JSON.stringify([{trabajador_id:'w1',motivo:'FUENTES_CAMBIARON'}])}};};
 click(document.querySelector('[data-agc-acc="aplicar"]'));await tick(20);
 click(document.querySelector('[data-agc-acc="aplicar"]'));await tick(20);
 ok(ops.length===2&&ops[0]===ops[1],'mismo identificador al reintentar sin recalcular');
 ok(toasts.at(-1).s.includes('cambiaron sus fuentes'),'informa qué recalcular');
 // Historial: retiro sólo mientras la nómina sea editable.
 historial=[{id:'L1',trabajador_id:'w1',estado:'APLICADO',estado_destino:'BORRADOR',version:1,periodicidad:'SEMANAL',periodo_desde:'2026-12-07',periodo_hasta:'2026-12-13',bruto:4356.16,isr:i96.isr,neto:4356.16-i96.isr,created_at:'2026-11-10'},
  {id:'L2',trabajador_id:'w2',estado:'APLICADO',estado_destino:'AUTORIZADO',version:1,periodicidad:'SEMANAL',periodo_desde:'2026-11-30',periodo_hasta:'2026-12-06',bruto:100,isr:0,neto:100,created_at:'2026-11-09'}];
 S.historial=null;click(document.querySelector('[data-agc-paso="3"]'));click(document.querySelector('[data-agc-acc="historial"]'));await tick(10);
 ok(document.querySelectorAll('[data-agc-acc="retirar"]').length===1&&$('agc-cuerpo').textContent.includes('ajuste autorizado'),'retiro sólo en borrador; protegido → ajuste autorizado');
 click(document.querySelector('[data-agc-acc="retirar"]'));await tick(10);
 const ret=llamadas.find(c=>c.args.p_accion==='RETIRAR');eq([ret.args.p_datos.id,ret.args.p_datos.version],['L1',1],'retira con versión y motivo');
 editar=false;box.PLATINUM_AGUINALDO_UI._pruebas.estado().paso=3;click(document.querySelector('[data-agc-paso="3"]'));
 ok(document.querySelector('[data-agc-acc="aplicar"]').disabled,'consulta: no aplica');editar=true;
 box.closeModal();

 // ---------- 5. Faltas históricas en la ficha ----------
 const fw=W('fw',7);const reg=[];let permisos={captura:true,correccion:true};
 ctx.fw=persona(fw,{calendario:['2026-07-07','2026-07-14','2026-08-04'].map((f,i)=>({id:'d'+i,fecha:f,id_incidencia:2}))});
 rpc=(fn,a)=>{
  const d=a.p_datos||{};
  if(fn==='control_faltas_historicas'&&a.p_accion==='LEER')return {data:{registros:reg,cobertura:{},permisos}};
  if(fn==='control_faltas_historicas'&&['REGISTRAR','CORREGIR'].includes(a.p_accion)){
   const x={id:'h'+(reg.length+1),cadena_id:d.id?reg.find(r=>r.id===d.id).cadena_id:'cad'+(reg.length+1),version:d.id?2:1,estado:'VIGENTE',ejercicio:d.ejercicio,modo:d.modo,rango_desde:d.rango_desde,fecha_corte:d.fecha_corte,
    fechas:d.fechas||[],total_acreditado:d.total_acreditado??null,digitales_al_registrar:3,naturaleza:d.naturaleza,motivo:d.motivo,fuente:d.fuente,referencia:d.referencia,actor_email:'u@x',created_at:'2026-11-10'};
   if(d.id)reg.find(r=>r.id===d.id).estado='SUSTITUIDA';reg.push(x);ctx.fw.historicas=reg.filter(r=>r.ejercicio===2026);return {data:x};}
  if(fn==='control_faltas_historicas'&&a.p_accion==='REVERTIR'){reg.find(r=>r.id===d.id).estado='REVERTIDA';return {data:{estado:'REVERTIDA'}};}
  return servidor(fn,a);
 };
 const host=$('ficha');await FH.montar(host,fw,()=>true);
 const txt=()=>host.textContent;
 ok(txt().includes('Faltas digitales')&&host.querySelector('#fh-resumen').textContent.includes('3'),'resumen con faltas digitales');
 click(host.querySelector('[data-fh="total"]'));
 valor('fh-desde','2026-06-03');valor('fh-corte','2026-09-30');valor('fh-total','8');valor('fh-motivo','Lista firmada de la obra');
 host.querySelector('#fh-total').dispatchEvent(new window.Event('input',{bubbles:true}));
 ok($('fh-vista').textContent.includes('complemento 5'),'8 acreditadas − 3 digitales = complemento 5');
 valor('fh-total','2');host.querySelector('#fh-total').dispatchEvent(new window.Event('input',{bubbles:true}));
 ok($('fh-vista').textContent.includes('Discrepancia')&&$('fh-vista').textContent.includes('siguen visibles'),'respaldo 2 vs sistema 3: discrepancia visible');
 valor('fh-total','200');click(host.querySelector('[data-fh="guardar"]'));await tick();ok(toasts.at(-1).s.includes('Cantidad imposible'),'cantidad imposible rechazada');
 valor('fh-total','8');valor('fh-corte','2026-05-01');click(host.querySelector('[data-fh="guardar"]'));await tick();ok(toasts.at(-1).s.includes('invertido'),'rango invertido rechazado');
 valor('fh-corte','2026-11-20');click(host.querySelector('[data-fh="guardar"]'));await tick();ok(toasts.at(-1).s.includes('futura'),'corte futuro rechazado');
 valor('fh-corte','2026-09-30');click(host.querySelector('[data-fh="guardar"]'));await tick(20);
 const alta=llamadas.filter(c=>c.fn==='control_faltas_historicas'&&c.args.p_accion==='REGISTRAR').at(-1).args.p_datos;
 eq([alta.modo,alta.total_acreditado,alta.rango_desde,alta.fecha_corte,alta.naturaleza,alta.fuente,alta.trabajador_id],['TOTAL_AL_CORTE',8,'2026-06-03','2026-09-30','FALTA_INJUSTIFICADA','RESPALDO_PAPEL','fw'],'registro auditado');
 ok(/^[0-9a-f-]{36}$/.test(alta.clave_idempotencia),'clave de idempotencia');
 const stats=()=>[...host.querySelectorAll('#fh-resumen .stat .n')].map(x=>x.textContent);
 eq(stats().slice(0,5),['161','3','5','8','153'],'al día de hoy: 161 días base, digitales 3 + complemento 5 = 8 que afectan, 153 computables');
 // Falta posterior al corte → 9; importar una antigua del rango → sigue en 9.
 ctx.fw.calendario.push({id:'d9',fecha:'2026-10-06',id_incidencia:2});host.querySelector('#fh-ej').dispatchEvent(new window.Event('change',{bubbles:true}));await tick(20);
 eq(stats()[3],'9','falta posterior suma');
 ctx.fw.calendario.push({id:'d8',fecha:'2026-08-18',id_incidencia:2});host.querySelector('#fh-ej').dispatchEvent(new window.Event('change',{bubbles:true}));await tick(20);
 eq(stats()[3],'9','importar una falta antigua del rango no duplica');
 // Corrección versionada y reversión.
 click(host.querySelector('[data-fh="corregir"]'));valor('fh-total','9');valor('fh-motivo','Se encontró otra hoja firmada');click(host.querySelector('[data-fh="guardar"]'));await tick(20);
 const cor=llamadas.filter(c=>c.args.p_accion==='CORREGIR').at(-1).args.p_datos;
 eq([cor.id,cor.version,cor.total_acreditado,cor.motivo_cambio],['h1',1,9,'Se encontró otra hoja firmada'],'corrección crea versión con motivo');
 ok(txt().includes('v2')&&txt().includes('Versiones anteriores'),'historial de versiones visible');
 click(host.querySelector('[data-fh="revertir"]'));await tick(20);
 ok(llamadas.some(c=>c.args.p_accion==='REVERTIR'&&c.args.p_datos.id==='h2'),'reversión con motivo');
 permisos={captura:false,correccion:false};host.querySelector('#fh-ej').dispatchEvent(new window.Event('change',{bubbles:true}));await tick(20);
 ok(!host.querySelector('[data-fh="total"]')&&txt().includes('sólo puede consultar'),'consulta: sin captura ni corrección');
 ok(!llamadas.some(c=>/descuentos|imss|vacaciones/i.test(JSON.stringify(c))),'la captura no crea descuentos, IMSS ni vacaciones');

 // ---------- 6. Finiquito: fuente común informativa ----------
 const pf=document.createElement('div');document.body.appendChild(pf);
 await FH.panelFiniquito(pf,fw,'2026-09-30',2);
 ok(pf.textContent.includes('Días base')&&pf.textContent.includes('Faltas históricas')&&pf.textContent.includes('Aguinaldo ya acreditado'),'finiquito: días base, faltas y acreditado');
 ok(pf.textContent.includes('La fórmula del finiquito no cambia'),'advierte diferencia sin cambiar la fórmula');
 const fuente33=fs.readFileSync('frontend/modulos/33-finiquitos.js','utf8'),fuente71=fs.readFileSync('frontend/modulos/71-ficha-personal.js','utf8');
 ok(fuente71.includes("faltas:'Faltas históricas y acumulado'")&&fuente71.includes('PLATINUM_FALTAS_HIST.montar'),'sección en la ficha');
 ok(fuente33.includes('pr-faltas-hist')&&!/function calcPrestaciones[\s\S]{0,4000}PLATINUM_FALTAS_HIST/.test(fuente33),'panel fuera de calcPrestaciones');

 // ---------- 7. Proyección: post-proceso, Excel, fotografía y auditoría ----------
 const fila=(w,o)=>({w,fin:false,sueldo:3000,incidencias:0,creditos:0,otras:0,prevision:200,costo:3000,neto:3200,items:[],pago:'TRANSFERENCIA',...o});
 const base={sem:'S37',filas:[fila(w1),fila(w2,{prevision:0,neto:3000}),fila(w4,{fin:true,sueldo:5200,prevision:0,costo:5200,neto:5200,pago:'CHEQUE'})],items:[],neto:11400,costo:11200};
 const L=(o)=>({id:'L1',obra_id:'O',trabajador_id:'w1',estado:'APLICADO',periodicidad:'SEMANAL',ejercicio:2026,periodo_desde:'2026-12-07',periodo_hasta:'2026-12-13',fecha_pago:'2026-12-11',bruto:4356.16,exento:3519.3,gravado:836.86,isr:i96.isr,neto:Math.round((4356.16-i96.isr)*100)/100,metodo_isr:'ART96',...o});
 ok(box.aguinaldoAplicarModelo(base,[])===base,'sin aplicaciones: el modelo no cambia');
 const m=box.aguinaldoAplicarModelo(base,[L()]),r=m.filas[0];
 eq([r.sueldo,r.prevision,r.costo,r.neto],[3000,200,3000,Math.round((3200+L().neto)*100)/100],'neto con aguinaldo; sueldo, previsión y costo intactos');
 eq([m.costo,m.neto,m.aguinaldo.bruto,m.filas[1]],[11200,Math.round((11400+L().neto)*100)/100,4356.16,base.filas[1]],'totales y filas sin aguinaldo intactas');
 assert.throws(()=>box.aguinaldoAplicarModelo(base,[L({trabajador_id:'w4'})]),/finiquito/);n++;
 assert.throws(()=>box.aguinaldoAplicarModelo(base,[L({neto:1})]),/inconsistentes/);n++;
 eq(box.aguinaldoSinFila(m,[L(),L({id:'L9',trabajador_id:'w3'})],{periodo:'SEMANAL'}).map(l=>l.id),['L9'],'detecta aplicación sin fila');
 assert.throws(()=>box.aguinaldoExigirCompleto(m,[L(),L({id:'L9',trabajador_id:'w3'})],{periodo:'SEMANAL'}),/no tienen fila/);n++;
 eq(box.aguinaldoSinFila(m,[L({id:'Q',periodicidad:'QUINCENAL',periodo_desde:'2026-12-01',periodo_hasta:'2026-12-15'})],{periodo:'SEMANAL'}).length,0,'otra periodicidad no se mezcla');
 const meta={titulo:'S37',sub:'S',pie:'P',colB:'CONTRATISTA',codigo:'PLATINUM'};
 const disp=box.proyLibro(m,'DISPERSION',meta),cont=box.proyLibro(m,'CONTRATISTA',meta),dws=disp.Sheets[disp.SheetNames[0]],cws=cont.Sheets[cont.SheetNames[0]];
 const dh=dws._rows[2],ch=cws._rows[2];
 eq(dh.slice(6),['SUELDO REGISTRADO / FINIQUITO','PREVISIÓN SOCIAL','AGUINALDO BRUTO','NETO A PAGAR','FORMA DE PAGO'],'dispersión: aguinaldo bruto antes del neto');
 eq(dws._rows.find(r=>r[0]===1).slice(6,10),[3000,200,4356.16,r.neto],'fila con bruto y neto incluido');
 const tot=dws._rows.findIndex(r=>String(r[0]).startsWith('TOTAL ·'))+1;ok(/^SUM\(I/.test(dws['I'+tot]?.f||'')||dws._rows[tot-1][8]===4356.16,'total de aguinaldo bruto');
 ok(ch.includes('AGUINALDO BRUTO')&&cws._rows.find(r=>r[0]===1)[6]===3000,'contratista: columna aparte, costo sin cambio');
 ok(disp.SheetNames.includes('AGUINALDO')&&disp.Sheets.AGUINALDO._rows[2].slice(6,12).join()===[4356.16,3519.3,836.86,i96.isr,'LISR 96',L().neto].join(),'hoja de desglose fiscal');
 const sin=box.proyLibro(base,'DISPERSION',meta);ok(!sin.SheetNames.includes('AGUINALDO')&&!sin.Sheets[sin.SheetNames[0]]._rows[2].includes('AGUINALDO BRUTO'),'sin aguinaldo: libro anterior');
 eq(box.aguinaldoCamposItem(r),{aguinaldo_bruto:4356.16,aguinaldo_exento:3519.3,aguinaldo_gravado:836.86,aguinaldo_isr:i96.isr,aguinaldo_neto:L().neto,aguinaldo_lineas:['L1']},'campos de fotografía');
 eq([box.aguinaldoCamposItem(base.filas[1]),box.aguinaldoCamposSnapshot(base.filas)],[{},{}],'fotografía sin aguinaldo conserva su forma');
 box.empresaDeTrabajador=()=> 'PLATINUM';
 const au=box.proyAuditoria(m,['DISPERSION']);ok(au[0].entradas.aguinaldo.bruto===4356.16&&!('aguinaldo' in au[1].entradas),'auditoría con desglose sólo donde aplica');
 console.log(`PASS aguinaldo UI: ${n} comprobaciones; corrida en cuatro pasos (filtros, cálculo, desglose, conciliación, Excel, aplicación, conflicto y retiro), faltas históricas versionadas en la ficha, panel de finiquito y columna de aguinaldo en proyección y fotografía.`);
})().catch(e=>{console.error(e);process.exit(1);});
