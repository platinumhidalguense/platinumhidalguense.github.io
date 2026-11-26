// Baja con faltas e incapacidades por enfermedad general corregidas en faltas históricas (caso #280): la fuente común
// (prestaciones_ausencias v2) suma 27 días de incapacidad EG y 7 faltas tipo 2 (total histórico de 5 que sustituye el
// descuento semanal de 7, más 2 del descuento S31); el panel y el cálculo lo explican y CONFIRMAR lleva esos días.
// Código real de la plataforma (baja 76, fuentes 81, cálculo 33, papel 46, motores) con el contexto real del servidor
// (fixture con identidad ficticia). Sin red ni base de datos.
// BAJA_FIXTURE=<ruta> usa otro contexto (p. ej. el privado del caso real); BAJA_SALIDA=<ruta> guarda el payload de CONFIRMAR.
// BAJA_MODULO_81=<ruta> sustituye el módulo 81 (prueba de mutación).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{parseHTML}=require('linkedom');
const {document,window:win}=parseHTML('<html><body><div id="modals"></div><div id="modals2"></div></body></html>');
Object.defineProperty(win.HTMLSelectElement.prototype,'value',{configurable:true,
 get(){return this.valor??this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(v){this.valor=v;}});
let n=0;const ok=(c,m)=>{assert(c,m);n++;},eq=(a,b,m)=>{assert.deepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);n++;};
const fx=JSON.parse(fs.readFileSync(process.env.BAJA_FIXTURE||'scripts/fixtures/baja-incapacidad-eg.json','utf8'));
const ctx=fx.antes||fx,w=ctx.trabajador,fecha=ctx.fecha,F=ctx.prestaciones_fuente;
const obra=fx.obra||{id:ctx.obra_id,nombre:'OBRA',fecha_inicio:'2026-03-30',empresa_codigo:ctx.empresa,activa:true};
const code=[],mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules;
const m81=process.env.BAJA_MODULO_81||'frontend/modulos/81-prestaciones-fuentes.js',completos=[m81,'frontend/modulos/76-baja-finiquito.js'];
const constantes=['ISR_M','F_SEM','PERIODOS','ISR_TABLA','MOTOR_NOMINA_VERSION','SEMANA1','MOTIVOS_BAJA','PPF_TARIFA_2026'];
for(const p of mods){if(p==='frontend/modulos/81-prestaciones-fuentes.js'||completos.includes(p))continue;const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.id.type==='Identifier'&&x.init&&
  (constantes.includes(x.id.name)||['ArrowFunctionExpression','FunctionExpression'].includes(x.init.type)&&!['$','today'].includes(x.id.name))))code.push(s.slice(node.start,node.end));}
let confirmado=null;
const sb={rpc:async(fn,a)=>{
  if(fn==='control_baja_finiquito'){
   if(a.p_accion==='CONTEXTO')return {data:JSON.parse(JSON.stringify(ctx))};
   if(a.p_accion==='ESTADO')return {data:confirmado||{estado:'NO_REGISTRADA'}};
   if(a.p_accion==='CONFIRMAR'){confirmado={estado:'REGISTRADA',operacion_id:a.p.operacion_id,fecha:a.p.fecha,neto:a.p.calculo.monto_aplicado,destino:a.p.destino,
     trabajador:{...w,estatus:'BAJA',fecha_baja:a.p.fecha},payload:a.p};return {data:confirmado};}
  }
  if(fn==='prestaciones_fuentes')return {data:JSON.parse(JSON.stringify(F))};
  throw Error('RPC no esperado '+fn+' '+(a.p_accion||''));
 },functions:{invoke:async()=>({data:{}})},from:()=>({select:()=>({eq:()=>({})})})};
const box={window:null,document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,CustomEvent:win.CustomEvent,Event:win.Event,
 OBRA:obra,OBRAS:[obra],WORKERS:[w],USER:{id:'u'},EMPRESA_ACTIVA:obra.empresa_codigo,EMPRESAS:{PLATINUM:{nombre:'PLATINUM',corto:'PLATINUM'},JIRE:{nombre:'JIRE',corto:'JIRE'}},
 CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66,subsidio_semanal_metodo:'cuota_diaria_truncada'},motores_nomina:{}},
 CUADS:[],CONTRATISTAS:[],DESC:[],ST:{},SOLO_CONTRATOS:false,sb,structuredClone,setTimeout,clearTimeout,queueMicrotask};
box.window=box;box.globalThis=box;box.HTMLElement=win.HTMLElement;vm.createContext(box);
vm.runInContext(`const $=id=>document.getElementById(id);const today=()=>'2026-11-26';`+code.join('\n')+`
 function toast(m,t){(globalThis.__toasts||(globalThis.__toasts=[])).push([m,t]);}
 function puedeEditarTrabajador(){return true;} function esAdmin(){return true;} function markWrite(){}
 function _uuid(){return 'c0ffee00-0000-4000-8000-000000000280';}`,box);
for(const p of completos)vm.runInContext(fs.readFileSync(p,'utf8'),box);
const $=id=>document.getElementById(id),tick=async(k=30)=>{for(let i=0;i<k;i++)await new Promise(r=>setImmediate(r));};
const clic=async(sel,k)=>{const b=typeof sel==='string'?document.querySelector(sel):sel;assert(b,'botón inexistente: '+sel);assert(!b.disabled,'botón deshabilitado: '+sel);b.dispatchEvent(new win.Event('click',{bubbles:true}));await tick(k);};
const aviso=()=>$('bf-aviso')?.textContent||'',plano=x=>String(x||'').replace(/\s+/g,' ');
(async()=>{
 const B=box.window.PLATINUM_BAJA;
 const eg=Number(F.incapacidades_eg),t2=Number(F.faltas_tipo2),total=Number(F.faltas),dag=Number(F.dias_aguinaldo);
 ok(eg>0&&t2+eg===total&&F.dias_base-total===dag,'fuente v2 con desglose coherente: '+JSON.stringify({eg,t2,total,dag}));
 await B.abrir(w.id);
 $('bf-fecha').value=fecha;$('bf-causal').value='RENUNCIA VOLUNTARIA';
 await clic('[data-bf="calcular"]',60);
 ok($('pr-out'),'paso 2: cálculo visible · '+aviso());
 // Panel de faltas y aguinaldo: desglose de faltas e incapacidades EG y ajustes aplicados.
 const panel=plano($('pr-faltas-hist')?.textContent);
 ok(panel.includes(`${t2} falta(s) tipo 2 + ${eg} día(s) de incapacidad por enfermedad general = ${total} día(s) que no computan`),'panel con el desglose: '+panel.slice(0,300));
 ok(panel.includes(`${dag} días de aguinaldo`),'panel con los días de aguinaldo');
 const ajustes=document.querySelector('[data-pf-ajustes]');
 ok(ajustes&&/se aplica completo dentro del ciclo/.test(ajustes.textContent)&&/se cuenta una sola vez/.test(ajustes.textContent),'ajustes aplicados visibles (total recortado y descuento sustituido)');
 ok(!/cobertura parcial o cantidad sin desglose/.test(panel),'los ajustes informativos no se presentan como cobertura parcial');
 const tipos=[...document.querySelectorAll('#pr-faltas-hist details td:last-child')].map(x=>x.textContent);
 ok(tipos.includes('Incapacidad EG')&&tipos.includes('Falta tipo 2'),'desglose con el tipo legible: '+tipos.join(','));
 // Cálculo del finiquito: los días que no computan reducen el aguinaldo proporcional.
 const out=plano($('pr-out').textContent);
 ok(out.includes(`Faltas e incapacidades que reducen aguinaldo−${total} día(s) (${t2} falta(s) y ${eg} día(s) de incapacidad por enfermedad general)`)||
  out.includes(`Faltas e incapacidades que reducen aguinaldo −${total} día(s) (${t2} falta(s) y ${eg} día(s) de incapacidad por enfermedad general)`),'renglón del cálculo con el desglose: '+out.slice(0,600));
 const aguinaldo=Math.round(Number(w.sd)*15*dag/365*100)/100;
 ok(out.includes('15 días × '+dag+'/365'),'aguinaldo proporcional con '+dag+' días');
 // Revisar y confirmar: el payload lleva los días de la fuente común (el servidor exige que coincidan).
 await clic('[data-bf="revisar"]',60);
 ok($('baja-btn'),'paso 3: revisión con «Confirmar baja» · aviso: '+aviso());
 const destino=$('bf-destino');destino.value=[...destino.querySelectorAll('option')].map(o=>o.value)[0];
 await B.confirmar(w.id);await tick(40);
 ok(confirmado?.payload,'CONFIRMAR enviado · '+aviso());
 const P=confirmado.payload,E=P.calculo?.entradas||{},EP=P.entradas_papel||{};
 eq([P.trabajador_id,P.fecha,P.firma],[w.id,fecha,ctx.firma],'payload con la firma del contexto');
 eq([Number(E.faltas_aguinaldo),Number(E.dias_aguinaldo),E.fuente_prestaciones?.firma],[total,dag,F.firma],'entradas del cálculo con faltas e incapacidades de la fuente');
 eq([Number(EP.faltas_aguinaldo),String(EP.dias_aguinaldo)],[total,String(dag)],'papel con los mismos días');
 eq(Number(P.calculo?.resultado?.aguinaldo),aguinaldo,'aguinaldo del finiquito = SD × 15 × '+dag+'/365');
 ok(/Baja registrada/.test(aviso()),'baja registrada en la interfaz');
 if(process.env.BAJA_SALIDA)fs.writeFileSync(process.env.BAJA_SALIDA,JSON.stringify(P));
 console.log('PASS baja con incapacidad EG y faltas históricas: '+n+' comprobaciones ('+t2+' faltas + '+eg+' días EG = '+total+'; '+dag+' días de aguinaldo).');
})().catch(e=>{console.error(e);process.exit(1);});
