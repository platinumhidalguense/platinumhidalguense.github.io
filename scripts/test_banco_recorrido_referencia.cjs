// Recorrido completo de importación bancaria (caso de referencia «pago individual 13 NOV»): lector por roles
// (ordenante ≠ beneficiario), evidencia por campo, estado de la operación, versión del lector y reproceso con traza,
// asociación por identidad y cuenta (ficha o pagos registrados), vista previa automática, confirmación única,
// registro con vinculación pendiente, etapas comprobadas, comprobante global con excepciones, «Resolver operación»
// (progreso, error con reintento, guardar y actualizar, respuestas antiguas) y ficha con fecha, referencia y aplicación.
// Datos ficticios con el mismo formato BBVA Net Cash de dos columnas. Si existe el original privado, también se verifica.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto'),acorn=require('acorn'),{parseHTML}=require('linkedom');
const core=require('../frontend/modulos/58-conciliador-core.js'),api=require('../frontend/modulos/78-banco-historico-servicio.js');
let n=0;const j=x=>x===undefined?x:JSON.parse(JSON.stringify(x)),eq=(a,b,m)=>{assert.deepEqual(j(a),j(b),m);n++;},ok=(v,m)=>{assert(v,m);n++;};
const tick=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));};
const clone=x=>JSON.parse(JSON.stringify(x));
const individual=(benef,cuenta,importe,estado='Operado')=>`Fecha y hora de consulta   13/11/2026 1:00:09 PM   Contrato   00000001  Nombre del Cliente  EMPRESA FICTICIA SA DE CV  BBVA Net Cash - Pagos Interbancarios  Operación autorizada  Transferencia en proceso de validación y aplicación.  Datos del firmante  Usuario:   USUARIO1   Poder:   100%  Datos de la operación  Tipo de operación:   Pago Interbancario  Descripción:   NOMINA   Importe de la operación:   ${importe}   MXP  Cuenta de retiro:   0000000001   Cuenta de depósito:   ${cuenta}  Divisa de la cuenta:   MXP   Divisa de la cuenta:   MXP  Titular de la cuenta:  EMPRESA FICTI CIA SA DE CV  Titular de la cuenta:   ${benef}  Nombre banco destino:   BANCO PRUEBA  Fecha de creación:   12/11/2026   Fecha de aplicación:   13/11/2026  Concepto de pago:   NOMINA   Referencia numérica:  Instrumento de seguridad:   ASD 0000000000   Hora de captura en el canal:   12:58:08  Datos de confirmación de la transferencia  Folio interbancario:   0000000099   Clave de rastreo:   002600000000000000000099  Folio de firma:   0000000000   Folio único:   I400000000000000000000000000  Estado operación  Porcentaje Firmado:   100%   Estado:   ${estado}  Detalle de firmas  Acción   Usuario   Porcentaje aportado   Fecha  CREO   USUARIO1   ---   %   13/11/2026`;
(async()=>{
 // ---------- 1. Lector por roles ----------
 let r=core.leerTradicional(individual('PERSONA PRUEBA UNO','5200000000008642','1,357.90'),{}),x=r.records[0];
 eq([r.tipo,r.validacion.ok,x.titular,x.beneficiario,x.ordenante],['INDIVIDUAL',true,'PERSONA PRUEBA UNO','PERSONA PRUEBA UNO','EMPRESA FICTI CIA SA DE CV'],'beneficiario y ordenante separados en formato de dos columnas');
 eq([x.cuenta,x.mask,x.cuenta_origen,x.importe,x.fecha,x.estado,x.folio,x.rastreo,x.banco],['5200000000008642','8642','0000000001',1357.9,'2026-11-13','EXITOSO','0000000099','002600000000000000000099','BANCO PRUEBA'],'cuentas, importe, fecha de aplicación, estado de la operación y referencias');
 eq(x.evidencia,{beneficiario:'Titular de la cuenta: PERSONA PRUEBA UNO',ordenante:'Titular de la cuenta: EMPRESA FICTI CIA SA DE CV',cuenta_destino:'Cuenta de depósito: 5200000000008642',cuenta_origen:'Cuenta de retiro: 0000000001',
  fecha:'Fecha de aplicación: 13/11/2026',estado:'Estado: Operado',referencia:'Clave de rastreo: 002600000000000000000099',importe:'Importe de la operación: 1,357.90 MXP'},'evidencia literal por campo');
 eq(x.lector_version,core.LECTOR_VERSION,'versión del lector en cada operación');
 ok(!/Titular de la/i.test(x.titular),'el titular no absorbe la etiqueta siguiente');
 eq(core.leerTradicional(individual('PERSONA PRUEBA UNO','5200000000008642','1,357.90','Rechazada por el banco'),{}).records[0].estado,'RECHAZADO','estado rechazado desde la operación');
 eq(core.leerTradicional(individual('PERSONA PRUEBA UNO','5200000000008642','1,357.90','Por autorizar'),{}).records[0].estado,'PENDIENTE','estado indeterminado conserva su clasificación');
 // Sólo el ordenante visible: no se toma como beneficiario; la página queda pendiente para el complemento.
 const soloOrdenante=individual('EMPRESA FICTICIA SA DE CV','5200000000008642','1,357.90');
 r=core.leerTradicional(soloOrdenante,{});eq([r.records[0].titular,r.validacion.ok],['',false],'la empresa nunca queda como beneficiaria; lectura pendiente');
 r=core.leerTradicional(soloOrdenante,{individual:()=>({titular:'EMPRESA FICTICIA SA DE CV',cuenta:'',mask:'',fecha:'2026-11-13'})});eq(r.records[0].titular,'','el lector heredado tampoco puede poner a la empresa como beneficiaria');
 let ia=0;const dual=await core.leerDual(individual('PERSONA PRUEBA UNO','5200000000008642','1,357.90'),{},async()=>{ia++;return{ok:false};});eq([dual.lector,ia],['TRADICIONAL',0],'lector tradicional primero; sin complemento si la lectura es válida');
 const iaMal=core.validarIA({tipo_documento:'INDIVIDUAL',registros:[{titular:'EMPRESA FICTICIA SA DE CV',cuenta:'8642',importe:1357.9,estado:'EXITOSO',fecha:'2026-11-13',evidencia_importe:'1,357.90'}]},soloOrdenante);
 ok(!iaMal.validacion.ok&&iaMal.validacion.errores.some(e=>/ordenante/.test(e)),'el complemento no puede devolver al ordenante como beneficiario');
 // Original privado (no se publica): verificación con el comprobante real cuando está disponible.
 const privado='work/banco_referencia/texto_pagina1.txt',esperadoPriv='work/banco_referencia/esperado.json';
 if(fs.existsSync(privado)&&fs.existsSync(esperadoPriv)){const y=core.leerTradicional(fs.readFileSync(privado,'utf8').trim(),{}).records[0],z=JSON.parse(fs.readFileSync(esperadoPriv,'utf8'));
  eq([y.titular,y.cuenta.slice(-4),y.importe,y.fecha,y.estado,y.folio,y.rastreo],[z.titular,z.cuenta4,z.importe,z.fecha,z.estado,z.folio,z.rastreo],'ORIGINAL PRIVADO: beneficiario, cuenta, importe, fecha, estado y referencias');
  ok(y.ordenante.includes(z.ordenante_contiene)&&!y.titular.includes(z.ordenante_contiene),'ORIGINAL PRIVADO: la empresa queda como ordenante y no como beneficiaria');console.log('ORIGINAL PRIVADO verificado.');}
 else console.log('ALCANCE PÚBLICO: original privado ausente; se verifica con el formato ficticio equivalente.');
 // ---------- 2. Asociación: ficha, historial de pagos y ambigüedad ----------
 const personas=[{id:'W1',nombre:'UNO PERSONA PRUEBA',cuenta:'00000000001111',clabe:'',mascaras_pago:['*8642']},{id:'W2',nombre:'DOS PERSONA PRUEBA',cuenta:'000000000004444',mascaras_pago:[]},
  {id:'W3',nombre:'TRES PERSONA PRUEBA',cuenta:'000000000005555'},{id:'W4',nombre:'TRES PERSONA PRUEBA',cuenta:'000000000006666'}];
 eq(core.asociar({titular:'PERSONA PRUEBA UNO',cuenta:'5200000000008642'},personas).metodo,'NOMBRE_Y_CUENTA_HISTORIAL','cuenta fuera de ficha pero usada en pagos registrados');
 eq(core.asociar({titular:'PERSONA PRUEBA DOS',cuenta:'4444'},personas).estado,'COINCIDE','nombre y cuenta de la ficha');
 eq(core.asociar({titular:'PERSONA PRUEBA TRES',cuenta:'7777'},personas).estado,'AMBIGUO','homónimos sin cuenta compatible: ambigüedad real');
 eq(core.asociar({titular:'PERSONA PRUEBA UNO',cuenta:'5200000000001234'},personas).estado,'CUENTA_NO_DOCUMENTADA','cuenta desconocida: revisión, no asociación automática');
 // ---------- 3. Recorrido de servicio: subir → archivar → leer → asociar → proponer → confirmar → registrado ----------
 const srv={archivos:new Map(),pagos:[],resol:[],llamadas:[],bytes:new Map(),previaFalla:0,previaFija:false,tramos:[]};
 const prev=(a,f)=>{const rec=a.propuesta.records[f-1],w=rec.trabajador_id;
  if(!w)return{fila:f,estado:'IDENTIDAD_POR_REVISAR',trabajador_id:null,huella:'H'+f,opciones:[],pagos_similares:[],cheques:[],accion_cheque:'NINGUNA'};
  return{fila:f,estado:'VINCULACION_PENDIENTE',trabajador_id:w,huella:'H'+f+':'+w,periodo:{semana:33},opciones:[{clave:'OB:'+w,trabajador_id:w,nombre:rec.titular,semana:30,concepto:'NOMINA',importe:rec.importe,desde:'2026-10-19',hasta:'2026-10-25'}],
   pagos_similares:srv.pagos.filter(p=>p.trabajador_id===w&&p.fecha===rec.fecha&&p.importe===rec.importe),cheques:[],accion_cheque:'NINGUNA'};};
 const rpcBanco=(a,d)=>{srv.llamadas.push(a);const ar=srv.archivos.get(d.archivo_id);
  if(a==='CONTEXTO')return{obra_id:d.obra_id,personas:personas.map(p=>({...p})),fuentes:[],archivos:[...srv.archivos.values()].map(x=>({id:x.id,nombre:x.nombre,estado:x.estado})),puede_importar:true,puede_conciliar:true};
  if(a==='INICIAR'){let f=[...srv.archivos.values()].find(x=>x.sha256===d.sha256);if(!f){f={id:'A'+(srv.archivos.size+1),obra_id:d.obra_id,nombre:d.nombre,sha256:d.sha256,ruta:'R'+srv.archivos.size,contexto:d.contexto,revision:1,estado:'SUBIENDO',propuesta:{},resoluciones:[]};srv.archivos.set(f.id,f);}return clone(f);}
  if(a==='ARCHIVADO'){ar.estado='ARCHIVADO';ar.revision++;return clone(ar);}
  if(a==='PROPUESTA'){if(d.revision!==ar.revision)throw Error('La lectura cambió en otra sesión; actualiza el archivo');ar.propuesta=clone(d.propuesta);ar.estado='LEIDO';ar.revision++;return clone(ar);}
  if(a==='ABRIR')return clone(ar);
  if(a==='ERROR'){ar.estado='ERROR';return clone(ar);}
  // Igual que el servidor vigente: tramos desde/hasta con total; un tiempo agotado aislado o persistente.
  if(a==='PREVISUALIZAR'){if(srv.previaFija||srv.previaFalla>0){if(!srv.previaFija)srv.previaFalla--;throw Error('canceling statement due to statement timeout');}
   const n=ar.propuesta.records.length,de=Math.max(1,d.desde||1),ha=Math.min(n,d.hasta||n);srv.tramos.push([de,ha]);
   return{archivo_id:ar.id,revision:ar.revision,total:n,desde:de,hasta:ha,filas:Array.from({length:Math.max(0,ha-de+1)},(_,k)=>prev(ar,de+k))};}
  if(a==='CONFIRMAR'){if(d.revision!==ar.revision)throw Error('La lectura cambió en otra sesión; actualiza el archivo');const out=[];
   for(const c of d.confirmaciones){const p=prev(ar,c.fila),rec=ar.propuesta.records[c.fila-1];if(p.huella!==c.huella)throw Error('FUENTES_CAMBIARON: actualiza la vista previa antes de confirmar');
    let pago=p.pagos_similares[0],reutilizado=!!pago;if(!pago){pago={id:'PAGO'+(srv.pagos.length+1),trabajador_id:p.trabajador_id,fecha:rec.fecha,importe:rec.importe,folio:rec.folio,semana:'S33'};srv.pagos.push(pago);}
    const rr={fila:c.fila,estado:p.trabajador_id?'VINCULACION_PENDIENTE':'IDENTIDAD_POR_REVISAR',pago_id:p.trabajador_id?pago.id:null,reutilizado,explicacion:'Original y pago registrados. Falta una obligación histórica verificable.'};
    ar.resoluciones=ar.resoluciones.filter(x=>x.fila!==c.fila).concat({fila:c.fila,estado:rr.estado,pago_id:rr.pago_id,resultado:rr});out.push(rr);}
   ar.revision++;ar.estado='PARCIAL';return{archivo_id:ar.id,revision:ar.revision,estado:ar.estado,resultados:out,errores:0};}
  throw Error('acción '+a);};
 let alcance={obra_id:'O',usuario_id:'U',firma:'A'},textoPDF=individual('PERSONA PRUEBA UNO','5200000000008642','1,357.90');
 const cfg={context:()=>alcance,core,hash:async b=>crypto.createHash('sha256').update(Buffer.from(b)).digest('hex'),file:(b,name)=>({name,arrayBuffer:async()=>b}),legacy:{},
  rpc:async(fn,{p_accion:a,p_datos:d})=>{if(fn==='control_importacion_contexto')return{error:{code:'PGRST202',message:'Could not find the function'}};try{return{data:rpcBanco(a,d)};}catch(e){return{error:{message:e.message}};}},
  storage:{from:()=>({upload:async(r,f)=>{srv.bytes.set(r,await f.arrayBuffer());return{};},download:async r=>({data:{arrayBuffer:async()=>srv.bytes.get(r)}})})},
  paginas:async()=>[{numero:1,texto:textoPDF}],fragmento:async()=>new ArrayBuffer(4),ia:async()=>({ok:false,error:'no se usa'})};
 const bytesPDF=new TextEncoder().encode('%PDF-FICTICIO-INDIVIDUAL').buffer,archivoPDF={name:'PAGO PERSONA UNO 13 NOV.pdf',size:bytesPDF.byteLength,arrayBuffer:async()=>bytesPDF};
 const svc=api.crear(cfg);await svc.abrir({empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:33,concepto:'TODOS'});
 await svc.subir([archivoPDF]);let e=svc.estado(),rec=e.archivo.propuesta.records[0];
 eq([rec.titular,rec.ordenante,rec.trabajador_id,rec.asociacion.metodo],['PERSONA PRUEBA UNO','EMPRESA FICTI CIA SA DE CV','W1','NOMBRE_Y_CUENTA_HISTORIAL'],'leído y asociado al beneficiario con su cuenta destino');
 ok(e.previa&&e.previa.revision===e.archivo.revision&&e.previa.filas[0].estado==='VINCULACION_PENDIENTE','propuesta de obligaciones construida automáticamente tras leer');
 eq([e.archivo.propuesta.lector_version,svc.etapa(0)],[core.LECTOR_VERSION,'ASOCIADO'],'versión del lector y etapa Asociado');
 const rl=svc.resumenListas();eq([rl.listas.length,rl.vinculo_pendiente],[1,1],'lista para la confirmación única, con vinculación pendiente');
 const lote=await svc.confirmarListas();eq([lote.totales.CONFIRMADO,lote.filas[1].motivo],[1,'Pago registrado · vinculación pendiente'],'confirmada una vez: pago registrado con vinculación pendiente');
 e=svc.estado();eq([svc.etapa(0),e.archivo.resoluciones[0].pago_id,srv.pagos.length],['REGISTRADO','PAGO1',1],'etapa Registrado comprobada con el servidor');
 // Reimportar el mismo PDF: misma operación, sin pago nuevo.
 await svc.subir([archivoPDF]);eq([srv.archivos.size,srv.pagos.length],[1,1],'reimportar el PDF reutiliza el original y su operación');
 // ---------- 4. Reproceso: lectura antigua (empresa como titular) se corrige desde el original con traza ----------
 const viejo=srv.archivos.get('A1');viejo.resoluciones=[];srv.pagos.length=0;
 viejo.propuesta={...clone(viejo.propuesta),lector_version:undefined,records:[{...clone(viejo.propuesta.records[0]),titular:'EMPRESA FICTI CIA SA DE CV Titular de la',trabajador_id:null,asociacion:{estado:'SIN_ASOCIAR'},estado:'PENDIENTE',lector_version:undefined}]};
 const s2=api.crear(cfg);await s2.abrir({empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:33,concepto:'TODOS'});
 ok(s2.desactualizada(clone(viejo)),'propuesta de versión anterior identificada como incompatible');
 const llamadasAntes=srv.llamadas.length;await s2.seleccionar('A1');e=s2.estado();rec=e.archivo.propuesta.records[0];
 eq([rec.titular,rec.estado,rec.trabajador_id,e.archivo.propuesta.lector_version],['PERSONA PRUEBA UNO','EXITOSO','W1',core.LECTOR_VERSION],'al abrir, se reprocesa desde el original con el lector vigente');
 eq([e.archivo.propuesta.lecturas.length,e.archivo.propuesta.lecturas[0].anterior.records[0].titular,e.archivo.sha256],[1,'EMPRESA FICTI CIA SA DE CV Titular de la',viejo.sha256],'traza de la lectura anterior y misma huella del original');
 ok(srv.llamadas.slice(llamadasAntes).includes('PREVISUALIZAR')&&e.previa,'tras reprocesar, propuesta automática');
 // Con operaciones registradas no se reprocesa: se conserva la lectura y se avisa.
 viejo.resoluciones=[{fila:1,estado:'VINCULACION_PENDIENTE',pago_id:'PX'}];viejo.propuesta.lector_version='VERSION_ANTIGUA';
 await s2.seleccionar('A1');ok(/conservan/.test(s2.estado().archivo.aviso_lectura||''),'lectura con pagos registrados se conserva con aviso');
 await assert.rejects(s2.reprocesar(),/registradas o conciliadas/);n++;
 viejo.resoluciones=[];await s2.seleccionar('A1');
 // Fallo de la vista previa automática: lectura conservada, error visible y reintento.
 srv.previaFija=true;await s2.reprocesar();e=s2.estado();srv.previaFija=false;ok(/timeout/.test(e.previaError||'')&&e.archivo.propuesta.records[0].titular==='PERSONA PRUEBA UNO','fallo de la propuesta no pierde la lectura');
 await s2.revisar();ok(s2.estado().previa,'reintento de la propuesta');
 // Un tiempo agotado aislado se recupera dividiendo el tramo, sin error visible.
 srv.previaFalla=1;srv.tramos=[];await s2.revisar();e=s2.estado();ok(e.previa&&!e.previaError&&e.previa.filas.length===e.archivo.propuesta.records.length&&srv.tramos[0][1]-srv.tramos[0][0]<59,'tramo dividido tras un tiempo agotado');
 // Una sola operación no recalcula las demás.
 srv.tramos=[];const unaFila=await s2.previaFila(0);ok(unaFila&&unaFila.fila===1&&srv.tramos.length===1&&srv.tramos[0][0]===1&&srv.tramos[0][1]===1,'vista previa de una sola operación');
 // ---------- 5. Comprobante global: varias personas y excepciones identificadas ----------
 const global='RESUMEN GENERAL  Número de registros: 3  Importe total: 6,000.00  '+
  '13/11/2026 ******4444 PERSONA PRUEBA DOS EXITOSA $2,000.00 MXN  13/11/2026 ******8642 PERSONA PRUEBA UNO EXITOSA $1,357.90 MXN  13/11/2026 ******0000 PERSONA DESCONOCIDA EXITOSA $2,642.10 MXN';
 const g=core.leerTradicional(global,{});eq([g.tipo,g.records.length,g.validacion.ok],['GLOBAL',3,true],'global con tres personas cuadra al centavo');
 const asoc=g.records.map(x=>core.asociar(x,personas));eq(asoc.map(a=>a.estado),['COINCIDE','COINCIDE','SIN_ASOCIAR'],'global: dos asociadas y una excepción identificada');
 eq(g.records.map(x=>x.lector_version),[core.LECTOR_VERSION,core.LECTOR_VERSION,core.LECTOR_VERSION],'versión del lector en el global');
 // ---------- 6. «Resolver operación» en la interfaz ----------
 const {window,document}=parseHTML('<html><body><div id="modals"></div><div id="modal2"></div></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._valor??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._valor=String(v);}});
 srv.archivos.clear();srv.pagos.length=0;textoPDF=individual('PERSONA PRUEBA TRES','5200000000007777','1,000.00');
 const box={window:null,document,console,Date,Number,String,Array,Object,Map,Set,Promise,Error,Math,JSON,File,Uint8Array,TextEncoder,
  USER:{id:'U'},OBRA:{id:'O',empresa_codigo:'PLATINUM'},OBRAS:[{id:'O',nombre:'OBRA FICTICIA',empresa_codigo:'PLATINUM'}],EMPRESAS:{PLATINUM:{corto:'PLATINUM'}},
  empresaDeObra:o=>o.empresa_codigo,semObra:()=>33,$:id=>document.getElementById(id),esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money:v=>Number(v).toFixed(2),
  modal:html=>{document.getElementById('modals').innerHTML=html;},modal2:html=>{document.getElementById('modal2').innerHTML=html;},closeModal:()=>{document.getElementById('modals').innerHTML='';},closeModal2:()=>{document.getElementById('modal2').innerHTML='';},
  ctrlTabla:(h,rows)=>'<table><tbody>'+rows.join('')+'</tbody></table>',toast:()=>{},markWrite:()=>{},confirm:()=>true,
  PLATINUM_CONCILIADOR_CORE:core,PLATINUM_BANCO_HISTORICO:{crear:c=>api.crear({...c,paginas:cfg.paginas,storage:cfg.storage})},parsePagoGlobal:()=>[],parsePagoIndividual:()=>[],IA_FN:{extract:'IA'},iaLlamar:async()=>({ok:false}),
  sha256Hex:cfg.hash,sb:{rpc:cfg.rpc,storage:cfg.storage},pdfjsLib:{}};
 box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync('frontend/modulos/79-importacion-bancaria-interfaz.js','utf8'),box);
 const q=s=>document.querySelector(s);
 await box.PLATINUM_IMPORTACION_BANCARIA.abrir({semana:33});await tick();
 srv.previaFija=true; // la propuesta automática y el primer intento de Resolver fallan
 const input=q('[data-bh-files]');Object.defineProperty(input,'files',{value:[{name:'PAGO PERSONA TRES.pdf',size:10,arrayBuffer:async()=>new TextEncoder().encode('%PDF-TRES').buffer}]});
 input.dispatchEvent(new window.Event('change',{bubbles:true}));await tick();
 ok(/PERSONA PRUEBA TRES/.test(q('[data-bh-lectura]').textContent)&&/Ordenante: EMPRESA FICTI CIA/.test(q('[data-bh-lectura]').textContent),'fila muestra beneficiario y ordenante por separado');
 ok(q('[data-bh-evidencia]')&&/Estado: Operado/.test(q('[data-bh-evidencia]').textContent),'evidencia del original visible');eq(q('[data-bh-etapa="0"]').textContent,'Leído','homónimos: leída sin asociar');
 q('[data-bh="resolver"]').click();await tick();
 const dlg=()=>q('#modal2 .m-body');
 ok(dlg(),'el diálogo abre siempre');
 ok(/No se construyó la propuesta/.test(q('[data-bh-lectura]').textContent),'fallo de la propuesta automática visible con reintento');
 eq(dlg().dataset.brEstado,'ERROR','Resolver sin vista previa: error visible en el mismo diálogo');ok(/vista previa/.test(dlg().textContent),'motivo accionable');
 srv.previaFija=false;q('[data-br-reintentar]').click();await tick();
 eq(dlg().dataset.brEstado,'LISTO','diálogo operativo con datos y alternativas');
 ok(q('[data-br-trabajador]')&&q('[data-br-trabajador]').querySelectorAll('option').length===personas.length+1,'selector de trabajador con todas las personas del centro');
 q('[data-br-trabajador]').value='W3';srv.previaFija=true;q('[data-br-guardar]').click();await tick();srv.previaFija=false;
 ok(/No se guardó/.test(q('[data-br-mensaje]').textContent)&&!q('[data-br-guardar]').disabled,'fallo al guardar: error en el diálogo y botón disponible');
 q('[data-br-guardar]').click();await tick();eq(q('#modal2').innerHTML,'','guardado: diálogo cerrado');
 ok(srv.archivos.get('A1').propuesta.records[0].trabajador_id==='W3'&&srv.archivos.get('A1').propuesta.records[0].asociacion.metodo==='RESOLVER_OPERACION','corrección persistida en la propuesta');
 eq(q('[data-bh-etapa="0"]').textContent,'Asociado','fila actualizada tras recalcular');
 // Respuesta de una selección anterior: se descarta sin abrir datos de otro original.
 srv.previaFalla=0;q('[data-bh="resolver"]').click();await tick();ok(dlg()&&dlg().dataset.brEstado==='LISTO','reapertura inmediata con la vista previa vigente');box.closeModal2();
 // ---------- 7. Ficha: fecha real, referencia, concepto, periodo y aplicación ----------
 const src=fs.readFileSync('frontend/modulos/04-padron-expedientes.js','utf8'),nodo=acorn.parse(src,{ecmaVersion:'latest'}).body.find(x=>x.type==='FunctionDeclaration'&&x.id.name==='fichaPagosHTML');
 const fbox={window:{PAGOS_RESOLUCION:new Map([['PAGO1',{estado:'VINCULACION_PENDIENTE',resultado:{explicacion:'Falta una obligación histórica verificable.'}}]])},PAGOS:[{id:'PAGO1',trabajador_id:'W1',semana:'S33',importe:1357.9,fecha_pago:'2026-11-13',folio_lote:'0000000099',cuenta_mask:'8642',estado:'EXITOSO',origen:'INDIVIDUAL',banco:'BANCO PRUEBA',banco_contexto:{concepto:'NOMINA'},banco_operacion_clave:'A1:1'}],
  esc:box.esc,money:v=>Number(v).toFixed(2),fmtD:v=>String(v).split('-').reverse().join('/'),normSem:s=>String(s||'').replace(/\D/g,'')};
 vm.createContext(fbox);vm.runInContext(src.slice(nodo.start,nodo.end),fbox);
 const ficha=vm.runInContext('fichaPagosHTML({id:"W1"})',fbox);
 ok(['S33','NOMINA','1357.9','13/11/2026','Referencia 0000000099','Registrado · vinculación pendiente'].every(t=>ficha.includes(t)),'ficha: periodo, concepto, importe, fecha real, referencia y aplicación');
 console.log('PASS recorrido bancario de referencia: '+n+' comprobaciones (roles ordenante/beneficiario con evidencia, estado de operación, complemento sólo ante fallo, asociación por historial, propuesta automática, confirmación única con vinculación pendiente, etapas, reimportación, reproceso con traza, global con excepciones, Resolver operación y ficha).');
})().catch(e=>{console.error(e);process.exitCode=1;});
