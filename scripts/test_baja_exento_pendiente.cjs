// Baja y finiquito con la exención de un aguinaldo anterior pendiente (caso JIRE): el panel de faltas y aguinaldo ofrece
// «Verificar CFDI archivado» y «Subir XML/PDF timbrado del pago anterior»; al verificar, la baja recalcula sin perder la
// captura y llega a Confirmar. Código real de la plataforma (baja 76, fuentes 81, cálculo 33, papel 46, motores) con el
// contexto real del servidor (fixture con identidades ficticias). Sin red ni base de datos.
// BAJA_FIXTURE=<ruta> usa otro contexto (p. ej. el privado del caso real); BAJA_SALIDA=<ruta> guarda el payload de CONFIRMAR.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{parseHTML}=require('linkedom');
const {document,window:win}=parseHTML('<html><body><div id="modals"></div><div id="modals2"></div></body></html>');
Object.defineProperty(win.HTMLSelectElement.prototype,'value',{configurable:true,
 get(){return this.valor??this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(v){this.valor=v;}});
let n=0;const ok=(c,m)=>{assert(c,m);n++;},eq=(a,b,m)=>{assert.deepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);n++;};
const fx=JSON.parse(fs.readFileSync(process.env.BAJA_FIXTURE||'scripts/fixtures/baja-exento-pendiente.json','utf8'));
const w=fx.antes.trabajador,obra=fx.obra,fecha=fx.antes.fecha;
const code=[],mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules,completos=['frontend/modulos/81-prestaciones-fuentes.js','frontend/modulos/76-baja-finiquito.js'];
const constantes=['ISR_M','F_SEM','PERIODOS','ISR_TABLA','MOTOR_NOMINA_VERSION','SEMANA1','MOTIVOS_BAJA','PPF_TARIFA_2026'];
for(const p of mods){if(completos.includes(p))continue;const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.id.type==='Identifier'&&x.init&&
  (constantes.includes(x.id.name)||['ArrowFunctionExpression','FunctionExpression'].includes(x.init.type)&&!['$','today'].includes(x.id.name))))code.push(s.slice(node.start,node.end));}
const llamadas=[],toasts=[];let fase='antes',confirmado=null,invocaciones=[];
const sb={rpc:async(fn,a)=>{
  llamadas.push(fn+':'+(a.p_accion||''));
  if(fn==='control_baja_finiquito'){
   if(a.p_accion==='CONTEXTO')return {data:JSON.parse(JSON.stringify(fx[fase]))};
   if(a.p_accion==='ESTADO')return {data:confirmado||{estado:'NO_REGISTRADA'}};
   if(a.p_accion==='CONFIRMAR'){confirmado={estado:'REGISTRADA',operacion_id:a.p.operacion_id,fecha:a.p.fecha,neto:a.p.calculo.monto_aplicado,destino:a.p.destino,
     trabajador:{...w,estatus:'BAJA',fecha_baja:a.p.fecha},payload:a.p};return {data:confirmado};}
  }
  if(fn==='control_revision_recibo'){
   eq([a.p_datos.documento_id,a.p_datos.obra_id],[fx.antes.prestaciones_fuente.cfdi_por_verificar[0].documento_id,obra.id],'verifica el CFDI archivado del mismo centro (misma razón social)');
   if(a.p_accion==='PREPARAR')return {data:{estado:'LISTO',lote_id:'lote',token:'t'}};
   if(a.p_accion==='ESTADO'){fase='despues';return {data:{estado:'VERIFICADO'}};}
  }
  if(fn==='prestaciones_fuentes')return {data:JSON.parse(JSON.stringify(fx[fase].prestaciones_fuente))};
  throw Error('RPC no esperado '+fn+' '+(a.p_accion||''));
 },functions:{invoke:async(nombre,{body})=>{invocaciones.push([nombre,body]);return {data:{procesados:1,correctos:1}};}},from:()=>({select:()=>({eq:()=>({})})})};
const box={window:null,document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,CustomEvent:win.CustomEvent,Event:win.Event,
 OBRA:obra,OBRAS:[obra],WORKERS:[w],USER:{id:'u'},EMPRESA_ACTIVA:obra.empresa_codigo,EMPRESAS:{PLATINUM:{nombre:'PLATINUM',corto:'PLATINUM'},JIRE:{nombre:'JIRE',corto:'JIRE'}},
 CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66,subsidio_semanal_metodo:'cuota_diaria_truncada'},motores_nomina:{}},
 CUADS:[],CONTRATISTAS:[],DESC:[],ST:{},SOLO_CONTRATOS:false,sb,structuredClone,setTimeout,clearTimeout,queueMicrotask};
box.window=box;box.globalThis=box;box.HTMLElement=win.HTMLElement;vm.createContext(box);
vm.runInContext(`const $=id=>document.getElementById(id);const today=()=>'2026-11-26';`+code.join('\n')+`
 function toast(m,t){(globalThis.__toasts||(globalThis.__toasts=[])).push([m,t]);}
 function puedeEditarTrabajador(){return true;} function esAdmin(){return true;} function markWrite(){}
 function _uuid(){return 'c0ffee00-0000-4000-8000-000000000038';}`,box);
for(const p of completos)vm.runInContext(fs.readFileSync(p,'utf8'),box);
const $=id=>document.getElementById(id),tick=async(k=30)=>{for(let i=0;i<k;i++)await new Promise(r=>setImmediate(r));};
const clic=async(sel,k)=>{const b=typeof sel==='string'?document.querySelector(sel):sel;assert(b,'botón inexistente: '+sel);assert(!b.disabled,'botón deshabilitado: '+sel);b.dispatchEvent(new win.Event('click',{bubbles:true}));await tick(k);};
const aviso=()=>$('bf-aviso')?.textContent||'';
(async()=>{
 const B=box.window.PLATINUM_BAJA;
 // 1) Datos de la baja.
 await B.abrir(w.id);
 ok($('bf-fecha')&&$('bf-causal'),'paso 1 visible');
 $('bf-fecha').value=fecha;$('bf-causal').value='RENUNCIA VOLUNTARIA';
 await clic('[data-bf="calcular"]',60);
 ok($('pr-out'),'paso 2: cálculo y papel visibles');
 // 2) Fuente con exención anterior pendiente: acciones en el mismo panel (antes no había ninguna).
 const caja=document.querySelector('[data-pf-pendiente]');
 ok(caja,'panel de faltas y aguinaldo muestra la exención pendiente');
 const ver=caja.querySelector('[data-pf="verificar"]'),sub=caja.querySelector('[data-pf="archivo"]');
 ok(ver&&ver.textContent.includes('Verificar CFDI archivado'),'botón «Verificar CFDI archivado»');
 ok(caja.textContent.includes(fx.antes.prestaciones_fuente.cfdi_por_verificar[0].uuid),'muestra el UUID del CFDI archivado');
 eq([sub?.dataset.obra,sub?.dataset.fecha],[obra.id,fx.antes.prestaciones_fuente.referencias[0].fecha_pago],'«Subir XML/PDF» apunta al centro de la ficha y a la fecha del pago anterior');
 // Continuar sin verificar: el bloqueo indica qué botón usar (antes: «Importa o verifica…» sin acción disponible).
 await clic('[data-bf="revisar"]',40);
 ok(/Verificar CFDI archivado/.test(aviso())&&!$('baja-btn'),'continuar sin verificar se bloquea con la acción concreta');
 // 3) Verificar el CFDI archivado → la baja recalcula con la exención verificada, sin perder la captura.
 $('f-pr-dias').value='0';$('f-pr-dias').dispatchEvent(new win.Event('input',{bubbles:true}));
 const llamadasAntes=llamadas.length;
 ok(!ver.isConnected||document.querySelector('[data-pf="verificar"]'),'el botón sigue disponible tras recalcular');
 await clic('[data-pf="verificar"]',120);
 eq(llamadas.slice(llamadasAntes).filter(x=>!x.startsWith('prestaciones_fuentes')),['control_revision_recibo:PREPARAR','control_revision_recibo:ESTADO','control_baja_finiquito:CONTEXTO'],'PREPARAR → lector → ESTADO → contexto de la baja');
 eq(invocaciones.map(x=>[x[0],x[1].lote_id,x[1].individual]),[['lectura-documental','lote',true]],'lector documental del servidor con el lote autorizado');
 ok(!document.querySelector('[data-pf-pendiente]'),'la exención pendiente desaparece');
 ok(/Exención del aguinaldo anterior verificada \(\$385\.44\)/.test(aviso()),'mensaje con la exención verificada: '+aviso());
 ok($('pr-faltas-hist').textContent.includes('385.44'),'panel con la exención usada en el año');
 ok($('pr-out')&&$('bf-fecha')===null,'sigue en el paso 2 (no reinicia la baja)');
 // 4) Revisar y confirmar.
 await clic('[data-bf="revisar"]',60);
 ok($('baja-btn'),'paso 3: revisión con «Confirmar baja» · aviso: '+aviso());
 const destino=$('bf-destino');destino.value=[...destino.querySelectorAll('option')].map(o=>o.value)[0];
 await B.confirmar(w.id);await tick(40);
 ok(confirmado?.payload,'CONFIRMAR enviado');
 const P=confirmado.payload;
 eq([P.trabajador_id,P.obra_id,P.fecha,P.motivo,P.firma],[w.id,obra.id,fecha,'RENUNCIA VOLUNTARIA',fx.despues.firma],'payload con la firma del contexto verificado');
 eq([P.entradas_papel?.exento_ag_usado,P.entradas_papel?.fuente_prestaciones?.firma],[String(fx.despues.prestaciones_fuente.exento_ag_usado),fx.despues.prestaciones_fuente.firma].map((x,i)=>i===0&&P.entradas_papel?.exento_ag_usado!==undefined&&typeof P.entradas_papel.exento_ag_usado==='number'?Number(x):x),'papel con la exención usada verificada y la firma de la fuente');
 ok(/Baja registrada/.test(aviso()),'baja registrada en la interfaz');
 if(process.env.BAJA_SALIDA)fs.writeFileSync(process.env.BAJA_SALIDA,JSON.stringify(P));
 // 5) «Subir XML/PDF timbrado del pago anterior» abre el archivo del centro de la ficha y vuelve a la baja.
 const abiertos=[];box.window.PLATINUM_ARCHIVO_LIBRE={abrir:o=>abiertos.push(o)};
 document.querySelectorAll('.overlay').forEach(x=>x.remove());box.BAJA_FLUJO=null;
 fase='antes';confirmado=null;
 vm.runInContext('BAJA_FLUJO=null',box);await B.abrir(w.id);$('bf-fecha').value=fecha;$('bf-causal').value='RENUNCIA VOLUNTARIA';await clic('[data-bf="calcular"]',60);
 await clic('[data-pf="archivo"]',20);
 eq(abiertos.map(o=>[o.obra_id,o.fecha,o.volver,o.trabajador_id,o.fecha_baja]),[[obra.id,fx.antes.prestaciones_fuente.referencias[0].fecha_pago,'baja',w.id,fecha]],'archivo del mismo centro, periodo del pago anterior y regreso a la baja');
 console.log('PASS baja con exención anterior pendiente: '+n+' comprobaciones (verificar CFDI archivado desde la baja, recálculo sin perder captura, confirmación, archivo con regreso).');
})().catch(e=>{console.error(e);process.exit(1);});
