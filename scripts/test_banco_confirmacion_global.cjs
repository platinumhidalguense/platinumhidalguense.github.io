// Importación bancaria: marcar/desmarcar todas (un guardado) y confirmación global de operaciones listas con la misma acción CONFIRMAR.
// Servidor simulado con la semántica de control_importacion_bancaria: revisión, huellas (FUENTES_CAMBIARON), subtransacción por fila,
// idempotencia (repetido) y ERROR_RECUPERABLE. Datos ficticios; sin navegador ni red.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto'),{parseHTML}=require('linkedom');
const core=require('../frontend/modulos/58-conciliador-core.js'),api=require('../frontend/modulos/78-banco-historico-servicio.js');
let n=0;const j=x=>x===undefined?x:JSON.parse(JSON.stringify(x)),eq=(a,b,m)=>{assert.deepEqual(j(a),j(b),m);n++;},ok=(v,m)=>{assert(v,m);n++;};
const clone=x=>JSON.parse(JSON.stringify(x)),tick=async()=>{for(let i=0;i<25;i++)await new Promise(r=>setImmediate(r));};
const FIN=['CONCILIADO','CONCILIADO_REUTILIZADO','CHEQUE_CANCELADO'];
function servidor(total,estados={}){
 const s={estados,version:{},fallos:{},perdida:null,sinPermiso:false,llamadas:[],cheques:{},
  archivo:{id:'F',obra_id:'O',nombre:'LOTE.pdf',contexto:{empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:30},revision:5,estado:'LEIDO',resoluciones:[],
   propuesta:{paginas:[{numero:1,records:[]}],records:Array.from({length:total},(_,i)=>({titular:'PERSONA '+(i+1),cuenta:'1234567890',importe:100+i,folio:'REF'+i,fecha:'2026-07-20',pagina:1,seleccionado:false}))}}};
 const prev=f=>{const e=s.estados[f]||'LISTO';return{fila:f,estado:e,huella:'H'+f+'.'+(s.version[f]||0),accion_cheque:e==='CONFIRMACION_PENDIENTE'?'CONFIRMAR_CANCELACION':'NINGUNA',cheques:[],pagos_similares:[],explicacion:e==='LISTO'?null:'Motivo '+e};};
 const res=f=>s.archivo.resoluciones.find(r=>r.fila===f);
 s.rpc=async(fn,{p_accion:a,p_datos:d})=>{
  if(fn==='control_importacion_contexto')return{error:{code:'PGRST202',message:'Could not find the function'}};
  s.llamadas.push({a,filas:d.confirmaciones?.map(c=>c.fila)});
  if(a==='CONTEXTO')return{data:{obra_id:d.obra_id,personas:[],fuentes:[],archivos:[{id:'F',nombre:'LOTE.pdf',estado:'LEIDO'}],puede_importar:true}};
  if(a==='ABRIR')return{data:clone(s.archivo)};
  if(a==='PROPUESTA'){if(d.revision!==s.archivo.revision)return{error:{message:'La lectura cambió en otra sesión; actualiza el archivo'}};s.archivo.propuesta=clone(d.propuesta);s.archivo.revision++;return{data:clone(s.archivo)};}
  if(a==='PREVISUALIZAR')return{data:{archivo_id:'F',revision:s.archivo.revision,filas:s.archivo.propuesta.records.map((r,i)=>prev(i+1))}};
  if(a==='CONFIRMAR'){
   if(s.limite&&d.confirmaciones.length>s.limite)return{error:{code:'57014',message:'canceling statement due to statement timeout'}};
   if(s.sinPermiso)return{error:{code:'42501',message:'Sin permiso de pagos en este centro'}};
   const cs=d.confirmaciones;
   if(cs.length&&cs.every(c=>FIN.includes(res(c.fila)?.estado)))return{data:{archivo_id:'F',revision:s.archivo.revision,repetido:true,resultados:cs.map(c=>res(c.fila).resultado)}};
   if(d.revision!==s.archivo.revision)return{error:{message:'La lectura cambió en otra sesión; actualiza el archivo'}};
   for(const c of cs)if(s.archivo.propuesta.records[c.fila-1].seleccionado&&prev(c.fila).huella!==c.huella)return{error:{message:'FUENTES_CAMBIARON: actualiza la vista previa antes de confirmar'}};
   const out=[];
   for(const c of [...cs].sort((x,y)=>x.fila-y.fila)){if(!s.archivo.propuesta.records[c.fila-1].seleccionado)continue;let rr;
    if(s.fallos[c.fila]>0){s.fallos[c.fila]--;rr={fila:c.fila,estado:'ERROR_RECUPERABLE',explicacion:'deadlock detected'};}
    else{const e=prev(c.fila).estado;rr=e==='LISTO'?{fila:c.fila,estado:'CONCILIADO'}:e==='YA_CONCILIADO'?{fila:c.fila,estado:'CONCILIADO_REUTILIZADO'}:{fila:c.fila,estado:e,explicacion:'Pendiente '+e};
     if(c.decision)s.cheques[c.fila]=c.decision;s.archivo.resoluciones=s.archivo.resoluciones.filter(x=>x.fila!==c.fila).concat({fila:c.fila,estado:rr.estado,resultado:rr});}
    out.push(rr);}
   s.archivo.revision++;
   if(s.perdida!=null&&s.llamadas.filter(x=>x.a==='CONFIRMAR').length===s.perdida)return{error:{message:'Failed to fetch'}};
   return{data:{archivo_id:'F',revision:s.archivo.revision,estado:'PARCIAL',resultados:out,errores:out.filter(x=>x.estado==='ERROR_RECUPERABLE').length}};
  }
  throw Error('acción '+a);};
 return s;
}
const mezcla={45:'YA_CONCILIADO',46:'YA_CONCILIADO',47:'CONFIRMACION_PENDIENTE',48:'PAGO_PARCIAL',49:'IDENTIDAD_POR_REVISAR',50:'DUPLICADO_EN_ARCHIVO'};
async function abrir(srv){let alcance={obra_id:'O',usuario_id:'U',firma:'A'};
 const svc=api.crear({context:()=>alcance,core,rpc:(...a)=>srv.rpc(...a),hash:async()=>'',file:()=>({}),legacy:{},storage:{},paginas:async()=>[],fragmento:async()=>null,ia:async()=>({})});
 await svc.abrir({empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:30,concepto:'NOMINA'});await tick();await svc.seleccionar('F');
 return{svc,cambiar:x=>{alcance={...alcance,...x};}};}
const de=(srv,a)=>srv.llamadas.filter(x=>x.a===a);
const mapa=srv=>Object.fromEntries(srv.archivo.resoluciones.map(r=>[r.fila,r.estado]));
(async()=>{
 // 1. Marcar y desmarcar todas: un solo guardado cada vez.
 const s1=servidor(50,{...mezcla}),{svc}=await abrir(s1);
 await svc.marcarTodas(true);eq(de(s1,'PROPUESTA').length,1,'marcar todas = un guardado');ok(s1.archivo.propuesta.records.every(r=>r.seleccionado),'todas marcadas');
 await svc.marcarTodas(false);eq(de(s1,'PROPUESTA').length,2,'desmarcar todas = un guardado');ok(s1.archivo.propuesta.records.every(r=>!r.seleccionado),'todas desmarcadas');
 await svc.marcarTodas(false);eq(de(s1,'PROPUESTA').length,2,'sin cambios no guarda');
 await svc.marcarTodas(true);eq(svc.resumenListas(),null,'la vista previa anterior deja de valer tras cambiar la selección');
 // 2. Confirmación global: revalida vista previa, sólo listas y marcadas, tramos secuenciales; excluidas aparte con motivo.
 const l1=await svc.confirmarListas();
 ok(de(s1,'PREVISUALIZAR').length===1&&s1.llamadas.findIndex(x=>x.a==='PREVISUALIZAR')<s1.llamadas.findIndex(x=>x.a==='CONFIRMAR'),'actualiza la vista previa antes de confirmar');
 eq(de(s1,'CONFIRMAR').map(x=>x.filas.length),[20,20,6],'tramos de 20 en secuencia');
 eq(l1.totales,{CONFIRMADO:44,YA_EXISTENTE:2,FALLIDO:0,PENDIENTE:0,total:46,procesados:46},'totales');
 eq(Object.fromEntries(Object.entries(l1.excluidas).map(([k,v])=>[k,v.map(x=>x.fila)])),{CHEQUE:[47],IMPORTE:[48],REVISION:[49],DUPLICADO:[50]},'excluidas por categoría');
 ok(l1.excluidas.CHEQUE[0].motivo&&l1.excluidas.REVISION[0].motivo,'cada excluida con motivo');
 eq(s1.cheques,{},'ningún cheque se decide en lote');eq(mapa(s1)[47],undefined,'cheque pendiente intacto');
 // 3. Equivalencia con la confirmación por selección (misma acción CONFIRMAR, una llamada).
 const s2=servidor(50,{...mezcla}),b=await abrir(s2);await b.svc.marcarTodas(true);await b.svc.revisar();
 const cs=b.svc.estado().previa.filas.filter(p=>['LISTO','YA_CONCILIADO'].includes(p.estado)).map(p=>({fila:p.fila,huella:p.huella}));
 await b.svc.confirmar(cs);eq(mapa(s1),mapa(s2),'mismo resultado que la confirmación por selección equivalente');
 // 4. Repetir: idempotente, sin llamadas nuevas a CONFIRMAR.
 const antes=de(s1,'CONFIRMAR').length,l2=await svc.confirmarListas();eq(l2.totales.total,0,'nada pendiente');eq(de(s1,'CONFIRMAR').length,antes,'no vuelve a confirmar');
 // 5. Exclusión por casilla, fallo intermedio y reintento sólo de fallidas.
 const s3=servidor(30),c=await abrir(s3);await c.svc.marcarTodas(true);await c.svc.editar(1,{seleccionado:false});await c.svc.editar(2,{seleccionado:false});s3.fallos[7]=1;s3.fallos[25]=1;
 const l3=await c.svc.confirmarListas();
 eq(l3.totales,{CONFIRMADO:26,YA_EXISTENTE:0,FALLIDO:2,PENDIENTE:0,total:28,procesados:28},'fallidas no detienen a las demás; desmarcadas fuera');
 ok(/deadlock/.test(l3.filas[7].motivo),'fallida conserva su error');eq(mapa(s3)[2],undefined,'desmarcada intacta');
 const c0=de(s3,'CONFIRMAR').length,l4=await c.svc.reintentarFallidas();
 eq(de(s3,'CONFIRMAR').slice(c0).map(x=>x.filas),[[7,25]],'reintenta sólo las fallidas');eq(l4.totales,{CONFIRMADO:28,YA_EXISTENTE:0,FALLIDO:0,PENDIENTE:0,total:28,procesados:28},'éxitos conservados');
 // 6. Respuesta perdida: lo guardado se recupera y el siguiente tramo usa la revisión vigente.
 const s4=servidor(45),d=await abrir(s4);await d.svc.marcarTodas(true);s4.perdida=1;const l5=await d.svc.confirmarListas();
 eq(l5.totales.CONFIRMADO,45,'todas confirmadas pese a la respuesta perdida');eq(l5.filas[1].motivo,'Respuesta recuperada del servidor','recuperada con ABRIR');
 eq(Object.keys(mapa(s4)).length,45,'sin duplicados');
 // 7. Versión cambiada entre tramos: nueva vista previa; sigue sólo lo que continúa listo.
 const s5=servidor(45),e=await abrir(s5);await e.svc.marcarTodas(true);
 const orig=s5.rpc;s5.rpc=async(fn,x)=>{const r=await orig(fn,x);if(x.p_accion==='CONFIRMAR'&&de(s5,'CONFIRMAR').length===1){s5.version[30]=1;s5.estados[31]='IDENTIDAD_POR_REVISAR';}return r;};
 const l6=await e.svc.confirmarListas();
 eq(l6.filas[30].estado,'CONFIRMADO','huella nueva revalidada y confirmada');eq(l6.filas[31].estado,'PENDIENTE','ya no lista: no se confirma');ok(/cambió/.test(l6.filas[31].motivo),'motivo de versión');eq(mapa(s5)[31],undefined,'sin resolución para la cambiada');
 // 8. Doble clic: el mismo lote; sin llamadas duplicadas.
 const s6=servidor(25),f=await abrir(s6);await f.svc.marcarTodas(true);const p1=f.svc.confirmarListas(),p2=f.svc.confirmarListas();ok(p1===p2,'doble clic devuelve el mismo lote');
 await assert.rejects(f.svc.marcarTodas(false),/Espera/);n++;await p1;eq(de(s6,'CONFIRMAR').length,2,'una ejecución');
 // 9. Permisos o sesión: lote detenido con motivo visible.
 const s7=servidor(45),g=await abrir(s7);await g.svc.marcarTodas(true);s7.sinPermiso=true;const l7=await g.svc.confirmarListas();
 ok(/permiso/.test(l7.detenido),'detenido por permisos');eq(de(s7,'CONFIRMAR').length,1,'no sigue enviando');ok(Object.values(l7.filas).every(x=>x.estado==='PENDIENTE'&&x.motivo),'pendientes con motivo');
 const s8=servidor(45),h=await abrir(s8);await h.svc.marcarTodas(true);const o8=s8.rpc;s8.rpc=async(fn,x)=>{const r=await o8(fn,x);if(x.p_accion==='CONFIRMAR')h.cambiar({usuario_id:'OTRO'});return r;};
 const l8=await h.svc.confirmarListas();ok(/sesión/.test(l8.detenido),'cambio de sesión detiene el lote');eq(de(s8,'CONFIRMAR').length,1,'sin tramos con otra sesión');
 // 9b. Tiempo agotado en servidor: el tramo se divide y se reintenta sin perder lo confirmado.
 const s9=servidor(45),t9=await abrir(s9);await t9.svc.marcarTodas(true);s9.limite=6;const l9=await t9.svc.confirmarListas();
 eq(l9.totales.CONFIRMADO,45,'todas confirmadas con tramos divididos');ok(de(s9,'CONFIRMAR').every(x=>x.filas.length<=20)&&de(s9,'CONFIRMAR').some(x=>x.filas.length<=6),'divide hasta caber en el límite');eq(Object.keys(mapa(s9)).length,45,'sin duplicados');
 // 10. Interfaz: casilla marcar/desmarcar todas, conteo, resumen único, progreso y reintento.
 const {window,document}=parseHTML('<html><body><div id="modals"></div><div id="modal2"></div></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._valor??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._valor=String(v);}});
 const sv=servidor(25,{24:'CONFIRMACION_PENDIENTE',25:'PAGO_PARCIAL'});sv.fallos[3]=1;const preguntas=[];
 const box={window:null,document,console,Date,Number,String,Array,Object,Map,Set,Promise,Error,Math,JSON,File,Uint8Array,
  USER:{id:'U'},OBRA:{id:'O',empresa_codigo:'PLATINUM'},OBRAS:[{id:'O',nombre:'OBRA FICTICIA',empresa_codigo:'PLATINUM'}],EMPRESAS:{PLATINUM:{corto:'PLATINUM'}},
  empresaDeObra:o=>o.empresa_codigo,semObra:()=>30,$:id=>document.getElementById(id),esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money:x=>Number(x).toFixed(2),
  modal:html=>{document.getElementById('modals').innerHTML=html;},modal2:()=>{},closeModal:()=>{document.getElementById('modals').innerHTML='';},closeModal2:()=>{},
  ctrlTabla:(heads,rows)=>'<table><tbody>'+rows.join('')+'</tbody></table>',toast:()=>{},markWrite:()=>{},confirm:t=>{preguntas.push(t);return true;},
  PLATINUM_CONCILIADOR_CORE:core,PLATINUM_BANCO_HISTORICO:api,parsePagoGlobal:()=>[],parsePagoIndividual:()=>[],IA_FN:{extract:'IA'},iaLlamar:async()=>{throw Error('sin IA');},
  sha256Hex:async x=>crypto.createHash('sha256').update(Buffer.from(x)).digest('hex'),sb:{rpc:(...a)=>sv.rpc(...a),storage:{from:()=>({})}}};
 box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync('frontend/modulos/79-importacion-bancaria-interfaz.js','utf8'),box);
 const q=x=>document.querySelector(x),cambio=async el=>{el.dispatchEvent(new window.Event('change',{bubbles:true}));await tick();};
 await box.PLATINUM_IMPORTACION_BANCARIA.abrir({semana:30,archivo_id:'F'});await tick();
 ok(q('[data-bh-todas]')&&!q('[data-bh-todas]').hasAttribute('checked'),'casilla marcar/desmarcar todas visible');ok(/0 de 25/.test(q('[data-bh-global]').textContent),'conteo de marcadas');
 q('[data-bh-todas]').checked=true;await cambio(q('[data-bh-todas]'));ok(/25 de 25/.test(q('[data-bh-global]').textContent)&&q('[data-bh-todas]').hasAttribute('checked'),'todas marcadas desde la interfaz');
 ok([...document.querySelectorAll('[data-bh-sel]')].every(x=>x.hasAttribute('checked')),'casillas por fila marcadas');
 const una=q('[data-bh-sel="0"]');una.checked=false;await cambio(una);ok(q('[data-bh-todas]').indeterminate&&/24 de 25/.test(q('[data-bh-global]').textContent),'estado intermedio al desmarcar una');
 ok(/listas \(—\)/.test(q('[data-bh="lote"]').textContent),'sin vista previa vigente: conteo pendiente');
 q('[data-bh="lote"]').click();await tick();
 eq(preguntas.length,1,'un solo resumen');ok(/Se confirmarán 22 operación/.test(preguntas[0])&&/Desmarcadas por ti: 1/.test(preguntas[0])&&/decisión de cheque.*: 1/.test(preguntas[0])&&/Importe por revisar.*: 1/.test(preguntas[0]),'resumen con listas, desmarcadas y excluidas');
 ok(/Confirmadas 21 · ya existentes 0 · fallidas 1 · pendientes 0/.test(q('[data-bh-lote-estado]').textContent),'progreso y totales');ok(q('progress'),'barra de progreso');
 ok(/Fallida · deadlock/.test(q('[data-bh-lote-fila="3"]').textContent),'fila fallida con su error');
 q('[data-bh="reintentar-fallidas"]').click();await tick();
 ok(/Confirmadas 22 · ya existentes 0 · fallidas 0/.test(q('[data-bh-lote-estado]').textContent),'reintento conserva éxitos');eq(preguntas.length,1,'sin preguntas por operación');
 eq(sv.cheques,{},'cheque por decidir sin cambios');ok(q('[data-bh="confirmar"]'),'confirmación por selección conservada');
 console.log('PASS confirmación global bancaria: '+n+' comprobaciones (marcar/desmarcar todas, tramos, excluidas por motivo, equivalencia, idempotencia, fallo y reintento, respuesta perdida, versión cambiada, doble clic, permisos y sesión, interfaz).');
})().catch(e=>{console.error(e);process.exitCode=1;});
