// Confirmación global de registros PDF/XML: reutiliza la confirmación individual (REGISTRAR + verificación), sólo elegibles,
// grupos por UUID (XML primero, un solo CFDI), cola con concurrencia limitada, idempotencia, reintento de fallidos,
// revalidación de contexto/versiones y detención por permisos o sesión. Datos ficticios; sin navegador ni red.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{parseHTML}=require('linkedom');
let n=0;const j=x=>x===undefined?x:JSON.parse(JSON.stringify(x)),eq=(a,b,m)=>{assert.deepEqual(j(a),j(b),m);n++;},ok=(v,m)=>{assert(v,m);n++;};
const tick=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
const clone=x=>JSON.parse(JSON.stringify(x));
const U1='11111111-AAAA-4AAA-8AAA-000000000001',U2='11111111-AAAA-4AAA-8AAA-000000000002',U3='11111111-AAAA-4AAA-8AAA-000000000003';
const fila=(id,formato,trab,uuid,neto,extra={})=>({id,documento_id:null,huella:id.padEnd(64,'0'),ruta:'privado/'+id,formato,estado:'CONFLICTO',trabajador_id:trab,
 datos:{nombre:id+'.'+formato.toLowerCase(),uuid,neto,desde:'2026-05-25',hasta:'2026-05-31',concepto:'NOMINA',resultado:{estado:'VALIDO',trabajador_id:trab}},...extra});
// Servidor simulado con la semántica de platinum_internal.control_recibo_libre REGISTRAR (idempotente, CFDI por UUID sólo desde XML).
function servidor(filas){
 const s={filas:new Map(filas.map(f=>[f.id,clone(f)])),docs:[],llamadas:[],enVuelo:0,maxVuelo:0,escritura:true,fallos:{},perdidas:{},sinPermisoEn:null,contexto:null,demora:0};
 s.rpc=async(name,{p_accion:a,p_datos:j})=>{
  s.llamadas.push(a+(j.archivo_id?':'+j.archivo_id:''));
  if(name==='control_revision_recibo')return{data:a==='PREPARAR'?{estado:'LISTO',lote_id:'l',token:'t'}:{estado:'VERIFICADO'}};
  if(a==='CONTEXTO')return{data:{contexto:s.contexto||{...j.contexto,desde:'2026-05-25',hasta:'2026-05-31'},archivos:[...s.filas.values()].map(clone),cierres:[],escritura:s.escritura}};
  const f=s.filas.get(j.archivo_id);
  if(a==='ABRIR')return{data:{...clone(f),ya_subido:true}};
  if(a==='REGISTRAR'){
   s.enVuelo++;s.maxVuelo=Math.max(s.maxVuelo,s.enVuelo);await new Promise(r=>setTimeout(r,s.demora));s.enVuelo--;
   if(s.sinPermisoEn===j.archivo_id)return{error:{code:'42501',message:'Sin permiso de escritura en este centro'}};
   if(s.fallos[j.archivo_id]>0){s.fallos[j.archivo_id]--;return{error:{message:'Failed to fetch'}};}
   if(f.documento_id)return{data:{estado:'ARCHIVADO',documento_id:f.documento_id}};
   if(!j.confirmado)throw Error('sin confirmación');
   const r=f.datos.resultado;if(r.estado!=='VALIDO')return{data:r};
   let doc=s.docs.find(d=>d.hash===f.huella)||(f.datos.uuid&&s.docs.find(d=>d.cfdi_uuid===f.datos.uuid&&d.trab===f.trabajador_id&&d.neto===f.datos.neto));
   if(!doc){doc={id:'D'+(s.docs.length+1),hash:f.huella,trab:f.trabajador_id,neto:f.datos.neto,cfdi_uuid:f.formato==='XML'?f.datos.uuid:null,categoria:f.formato==='XML'?'CFDI_NOMINA':'RECIBO_NOMINA'};s.docs.push(doc);}
   f.documento_id=doc.id;f.estado='ARCHIVADO';
   if(s.perdidas[j.archivo_id]>0){s.perdidas[j.archivo_id]--;return{error:{message:'NetworkError when attempting to fetch resource'}};}
   return{data:{...r,estado:'ARCHIVADO',documento_id:doc.id,vinculacion:'PENDIENTE'}};
  }
  throw Error('acción '+a);
 };
 return s;
}
const window={},box=vm.createContext({window,Uint8Array,Date,AbortController,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync('frontend/modulos/83-recibos-contexto-servicio.js','utf8'),box);
async function abrir(filas,opciones={}){
 const srv=servidor(filas);let estado,busy,vigente=true,usuario='U',verif=0;
 const dep={vigente:()=>vigente,cambio:(e,b)=>{estado=e;busy=b;},usuario:()=>usuario,rpc:(...a)=>srv.rpc(...a),verificar:async()=>{verif++;return{};},hash:async()=>'',leer:async()=>{},incorporar:()=>{}};
 const svc=box.window.PLATINUM_RECIBOS_CONTEXTO.crear(dep);await svc.abrir('o',{empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:22});
 return{srv,svc,get estado(){return estado;},get busy(){return busy;},set vigente(x){vigente=x;},set usuario(x){usuario=x;},get verif(){return verif;}};
}
const base=()=>[fila('A1','PDF','W1',U1,'2000.00'),fila('A2','XML','W1',U1,'2000.00'),fila('B1','XML','W2',U2,'1500.00'),fila('C1','PDF','W3',null,'1800.00')];
const reg=srv=>srv.llamadas.filter(x=>x.startsWith('REGISTRAR'));
const vista=t=>({docs:t.srv.docs.map(d=>({cat:d.categoria,trab:d.trab,uuid:d.cfdi_uuid,neto:d.neto})).sort((a,b)=>(a.trab+a.cat).localeCompare(b.trab+b.cat)),
 archivos:[...t.srv.filas.values()].map(f=>({id:f.id,estado:f.estado,doc:f.documento_id&&t.srv.docs.find(d=>d.id===f.documento_id).trab+'/'+t.srv.docs.find(d=>d.id===f.documento_id).categoria}))});
(async()=>{
 // 1. Lote válido = mismas confirmaciones individuales equivalentes (XML antes que PDF del mismo UUID).
 const ind=await abrir(base());for(const id of ['A2','A1','B1','C1'])await ind.svc.confirmar(id);
 const glo=await abrir(base());const r0=glo.svc.resumen();
 eq(r0.listos.length,4,'cuatro registros listos');eq(r0.cfdi,3,'PDF y XML del mismo UUID cuentan como un CFDI');eq(r0.grupos[0],['A2','A1'],'XML primero dentro del grupo');
 const l=await glo.svc.confirmarLote();
 eq(l.totales,{CONFIRMADO:4,YA_EXISTENTE:0,FALLIDO:0,PENDIENTE:0,total:4,procesados:4},'totales del lote');
 eq(vista(glo),vista(ind),'mismo resultado que las confirmaciones individuales');
 eq(glo.srv.docs.filter(d=>d.uuid===U1||d.cfdi_uuid===U1).length,1,'un solo CFDI para PDF+XML del mismo UUID');
 eq(glo.srv.filas.get('A1').documento_id,glo.srv.filas.get('A2').documento_id,'ambos originales conservados y ligados al mismo comprobante');
 eq(glo.verif,4,'verificación posterior igual que la individual');eq(glo.busy,false,'operación liberada');
 ok(glo.srv.llamadas[0]==='CONTEXTO'&&glo.srv.llamadas[1]==='CONTEXTO','revalida contexto antes de confirmar');
 eq(glo.svc.resumen().listos.length,0,'tras el lote ya no quedan elegibles');eq(glo.svc.resumen().registrados,4,'quedan como registrados');
 // 2. Lote mixto: pendientes de lectura, discrepancias, errores y duplicados aparte, con motivo.
 const mix=[...base(),fila('P1','PDF','W4',null,'1.00',{estado:'PENDIENTE',datos:{nombre:'P1.pdf'}}),
  fila('R1','PDF','W5',null,'1.00',{datos:{nombre:'R1.pdf',resultado:{estado:'REVISAR',motivo:'El emisor no corresponde'}}}),
  fila('E1','XML','W6',null,'1.00',{estado:'FALLO',motivo:'Selecciona PDF/XML individuales de hasta 25 MB.'}),
  fila('D1','PDF','W7',U3,'900.00'),fila('D2','XML','W7',U3,'950.00'),fila('A3','PDF','W1',U1,'2000.00')];
 const m=await abrir(mix),rm=m.svc.resumen();
 eq(rm.listos,['A2','A1','B1','C1'],'sólo elegibles');
 eq(rm.excluidos.LECTURA.map(x=>x.id),['P1'],'pendiente de lectura aparte');eq(rm.excluidos.DISCREPANCIA.map(x=>[x.id,x.motivo]),[['R1','El emisor no corresponde']],'discrepancia con motivo');
 eq(rm.excluidos.ERROR.map(x=>x.id),['E1'],'error aparte');ok(rm.excluidos.ERROR[0].motivo.includes('25 MB'),'motivo del error');
 eq(rm.excluidos.DUPLICADO.map(x=>x.id).sort(),['A3','D1','D2'],'duplicados: UUID con importes distintos y segundo PDF del mismo UUID');
 ok(rm.excluidos.DUPLICADO.every(x=>x.motivo),'cada duplicado con motivo');
 const lm=await m.svc.confirmarLote(['C1']);eq(Object.keys(lm.filas).sort(),['A1','A2','B1'],'fila excluida por el usuario no se procesa');
 eq(reg(m.srv).length,3,'sólo se registran los listos incluidos');eq(m.srv.filas.get('P1').documento_id,null,'pendiente intacto');
 // 3. Fallo intermedio, respuesta perdida, reintento de fallidos, concurrencia limitada.
 const muchas=Array.from({length:9},(_,i)=>fila('F'+i,'PDF','W'+i,null,(100+i)+'.00'));
 const f=await abrir(muchas);f.srv.demora=5;f.srv.fallos.F3=1;f.srv.perdidas.F5=1;
 const lf=await f.svc.confirmarLote();
 eq(lf.totales.FALLIDO,1,'una fila fallida');eq(lf.filas.F3.estado,'FALLIDO','conserva su error');ok(/fetch/.test(lf.filas.F3.motivo),'motivo visible');
 eq(lf.totales.CONFIRMADO,8,'las demás continúan (incluida la respuesta recuperada)');eq(lf.filas.F5.motivo,'Respuesta recuperada del servidor','respuesta perdida verificada con ABRIR');
 ok(f.srv.maxVuelo<=3&&f.srv.maxVuelo>1,'concurrencia limitada a 3 ('+f.srv.maxVuelo+')');
 const antes=reg(f.srv).length,lr=await f.svc.reintentarFallidos();
 eq(reg(f.srv).length-antes,1,'reintenta sólo la fallida');eq(lr.totales,{CONFIRMADO:9,YA_EXISTENTE:0,FALLIDO:0,PENDIENTE:0,total:9,procesados:9},'éxitos conservados');
 eq(f.srv.docs.length,9,'sin documentos duplicados por reintentos');
 // 4. Doble clic: la misma ejecución; sin llamadas duplicadas; individual bloqueada durante el lote.
 const d=await abrir(base());d.srv.demora=5;const p1=d.svc.confirmarLote(),p2=d.svc.confirmarLote();
 ok(p1===p2,'doble clic devuelve el mismo lote');await assert.rejects(d.svc.confirmar('C1'),/Espera/);n++;
 await p1;eq(reg(d.srv).length,4,'una sola llamada por registro');
 const otra=await d.svc.confirmarLote();eq(otra.totales.total,0,'repetir el lote no vuelve a registrar');eq(reg(d.srv).length,4,'idempotente');
 // 5. Revalidación de versiones: lectura cambiada o registrada en otra sesión.
 const v=await abrir(base());v.srv.filas.get('B1').datos.neto='1600.00';v.srv.filas.get('C1').documento_id='DX';
 const lv=await v.svc.confirmarLote();
 eq(lv.filas.B1.estado,'PENDIENTE','versión cambiada: no se confirma');ok(/cambió/.test(lv.filas.B1.motivo),'motivo de versión');
 eq(lv.filas.C1.estado,'YA_EXISTENTE','registrado en otra sesión');eq(reg(v.srv).filter(x=>/B1|C1/.test(x)).length,0,'sin llamadas para filas revalidadas');
 // 6. Permisos o sesión cambian: lote detenido con motivo visible.
 const p=await abrir(muchas);p.srv.sinPermisoEn='F0';const lp=await p.svc.confirmarLote();
 ok(/permiso/i.test(lp.detenido),'detenido por permisos');ok(reg(p.srv).length<=3,'no sigue enviando tras el rechazo ('+reg(p.srv).length+')');
 ok(Object.values(lp.filas).filter(x=>x.estado==='PENDIENTE').every(x=>x.motivo),'pendientes con motivo');
 const sp=await abrir(muchas);sp.srv.escritura=false;const ls=await sp.svc.confirmarLote();ok(/permiso/.test(ls.detenido),'sin escritura: no inicia');eq(reg(sp.srv).length,0,'sin registros');
 const se=await abrir(muchas);se.srv.demora=5;const pe=se.svc.confirmarLote();await new Promise(r=>setTimeout(r,8));se.usuario='OTRO';const le=await pe;
 ok(/sesión/.test(le.detenido),'cambio de sesión detiene el lote');ok(reg(se.srv).length<9,'no completa con otra sesión');
 const sc=await abrir(base());sc.srv.contexto={semana:23};const lc=await sc.svc.confirmarLote();ok(/periodo/.test(lc.detenido),'contexto cambiado en servidor');eq(reg(sc.srv).length,0,'sin registros fuera de contexto');
 // 7. Interfaz: botón con elegibles, exclusión, resumen único, progreso, totales y reintento.
 const {document,window:w}=parseHTML('<div id="modals"></div>'),$=id=>document.getElementById(id);
 const srv=servidor([...base(),fila('P1','PDF','W4',null,'1.00',{estado:'PENDIENTE',datos:{nombre:'P1.pdf'}})]);srv.fallos.B1=1;let preguntas=[];
 const ctx={window:w,document,$,USER:{id:'u'},OBRA:{id:'o',empresa_codigo:'PLATINUM',nombre:'Centro'},OBRAS:[{id:'o',empresa_codigo:'PLATINUM',nombre:'Centro'}],EMPRESAS:{},empresaDeObra:o=>o.empresa_codigo,
  modal:h=>{$('modals').innerHTML=h;},closeModal:()=>{},semObra:()=>22,sha256Hex:async()=>'',sb:{rpc:(...a)=>srv.rpc(...a),storage:{},functions:{invoke:async()=>({})}},Date,File:class{},setTimeout,clearTimeout,AbortController,Uint8Array,
  toast:assert.fail,confirm:t=>{preguntas.push(t);return true;},esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
 vm.createContext(ctx);w.PLATINUM_ARCHIVO_RECIBOS={leerArchivo:()=>{}};
 for(const m of ['83-recibos-contexto-servicio','84-recibos-contexto-interfaz'])vm.runInContext(fs.readFileSync('frontend/modulos/'+m+'.js','utf8'),ctx);
 const host=()=>$('modals').firstElementChild,q=x=>host().querySelector(x);
 await w.PLATINUM_ARCHIVO_LIBRE.abrir({semana:22,anio:2026});await tick();
 ok(/Confirmar todos los registros listos \(4\)/.test(q('[data-rl="lote"]').textContent),'botón con número de elegibles');
 ok(/Pendientes de lectura: 1/.test(q('[data-rl-cat="LECTURA"]').textContent),'pendientes de lectura visibles aparte');
 eq(host().querySelectorAll('[data-rl-incluir]').length,4,'casilla de exclusión por fila elegible');eq(host().querySelectorAll('[data-rl="confirmar"]').length,4,'confirmación individual conservada');
 const c1=q('[data-rl-incluir="C1"]');c1.checked=false;await host().onchange({target:c1});
 ok(/\(3\)/.test(q('[data-rl="lote"]').textContent),'excluir una fila actualiza el conteo');
 await host().onclick({target:q('[data-rl="lote"]')});await tick();
 eq(preguntas.length,1,'un solo resumen antes de comenzar');ok(/3 original\(es\).*2 CFDI/.test(preguntas[0])&&/Excluidos por ti: 1/.test(preguntas[0])&&/no timbra/.test(preguntas[0]),'resumen con conteos y alcance');
 ok(/Confirmados 2 · ya existentes 0 · fallidos 1 · pendientes 0/.test(q('[data-rl-lote-estado]').textContent),'progreso y totales');
 ok(/Fallido/.test(q('[data-rl-resultado="B1"]').textContent),'fila fallida con su error');ok(q('progress'),'barra de progreso');
 await host().onclick({target:q('[data-rl="reintentar-fallidos"]')});await tick();
 ok(/Confirmados 3 · ya existentes 0 · fallidos 0/.test(q('[data-rl-lote-estado]').textContent),'reintento de fallidos conserva éxitos');eq(preguntas.length,1,'reintento sin volver a preguntar por fila');
 ok(/\(0\)/.test(q('[data-rl="lote"]').textContent)&&q('[data-rl-incluir="C1"]')&&!q('[data-rl-incluir="C1"]').checked,'la fila excluida sigue elegible pero fuera del lote');eq(srv.filas.get('C1').documento_id,null,'excluida intacta');
 const todas=q('[data-rl-todas]');ok(todas&&!todas.hasAttribute('checked'),'casilla marcar/desmarcar todas, desmarcada con una exclusión');
 todas.checked=true;await host().onchange({target:todas});ok(/\(1\)/.test(q('[data-rl="lote"]').textContent)&&q('[data-rl-todas]').hasAttribute('checked'),'marcar todas incluye las elegibles');
 q('[data-rl-todas]').checked=false;await host().onchange({target:q('[data-rl-todas]')});ok(/\(0\)/.test(q('[data-rl="lote"]').textContent),'desmarcar todas excluye las elegibles');
 console.log('PASS confirmación global de recibos: '+n+' comprobaciones (equivalencia con individual, mixto, PDF/XML por UUID, fallo intermedio, respuesta perdida, reintento, doble clic, versiones, permisos y sesión, interfaz).');
})().catch(e=>{console.error(e);process.exitCode=1;});
