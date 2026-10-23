// Importador real en VM: datos enteramente ficticios, sin navegador ni red.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const src=fs.readFileSync('frontend/modulos/35-centro-control.js','utf8');
const names=['ctrlNormHdr','ctrlNumero','ctrlPuntajeColNOI','ctrlDetectarLayoutNOI','ctrlExtraerFilasNOI','ctrlIdentificadorNOI','ctrlNombreIdentidadNOI','ctrlCruzarIdentidadNOI','ctrlRespaldosCeroNOI','ctrlLeerArchivoNOI','ctrlRenderConciliacion','ctrlActualizarFotoNOI'];
const code=acorn.parse(src,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>src.slice(n.start,n.end)).join('\n');
const messages=[],elements={'noi-preview':{innerHTML:''}},w={id:'w',obra_id:'o',no_trab:1,nombres:'ANA',primer_apellido:'PRUEBA',estatus:'BAJA',fecha_baja:'2026-10-20',monto_finiquito:0};
const matrix=[['Clave','Nombre del trabajador','Neto pagado'],[9,'ANA PRUEBA',0]],file={name:'FICTICIO.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)};
let facts=[],rpcFail=false,hist=[],calls=0,confirmed=true;
const c={id:'c',estado:'BORRADOR',snapshot:{items:[],desde:'2026-10-19',hasta:'2026-10-25'}};
const box={window:{_CTRL_CIERRE:c},OBRA:{id:'o'},WORKERS:[w],USER:{email:'ficticio@test.invalid'},
 $:id=>elements[id]||null,esc:String,money:n=>Number(n).toFixed(2),ctrlEstado:String,ctrlTabla:(h,r)=>h.join(' ')+r.join(''),toast:m=>messages.push(m),confirm:()=>confirmed,
 redondearCentavos:n=>Math.round(Number(n)*100)/100,finTransDe:()=>false,ctrlSha:async()=> 'b'.repeat(64),
 sb:{rpc:async()=>{calls++;return{data:facts,error:rpcFail?{message:'Falla ficticia'}:null};}},
 proyCargarHistoricos:async()=>hist,proyFiniquitosSemana:(p,d1,d2,h)=>p.filter(x=>h.includes(x.id)),
 XLSX:{read:()=>({SheetNames:['FICTICIO'],Sheets:{FICTICIO:matrix}}),utils:{sheet_to_json:s=>s}}};
vm.createContext(box);vm.runInContext(code,box);
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;},read=()=>box.ctrlLeerArchivoNOI({files:[file]});
(async()=>{
 facts=[{trabajador_id:'w',caso_id:'caso',desde:'2026-10-19',hasta:'2026-10-25'}];await read();
 let r=box.window._CTRLNOI.rows[0];ok(r.trabajador_id==='w'&&r.trabajador_numero===1,'Conserva UUID y número del padrón aunque NOI tenga otra clave');
 ok(r.monto_platinum===0&&r.monto_noi===0,'Cero confirmado contra cero real');
 ok(r.detalle.sin_servicio_confirmado.caso_id==='caso','Respaldo por caso, no por importe solamente');
 ok(elements['noi-preview'].innerHTML.includes('SIN SERVICIO CONFIRMADO · sin pago'),'No afirma pago pendiente');
 ok(!elements['noi-preview'].innerHTML.includes('SIN_PLATINUM'),'No hay falso faltante');
 ok(!box.ctrlRenderConciliacion([{...r,diferencia:0,estatus:'COINCIDE'}]).includes('PAGO PENDIENTE'),'Vista guardada coincide con vista previa');
 ok(r.detalle.identidad_noi.numero_noi===9,'Clave NOI trazable');
 facts=[];await read();r=box.window._CTRLNOI.rows[0];ok(r.monto_platinum===null&&elements['noi-preview'].innerHTML.includes('SIN_PLATINUM'),'Sin respaldo no se oculta un cero');
 matrix[1][2]=0.01;const before=calls;facts=[{trabajador_id:'w',caso_id:'caso'}];await read();
 ok(calls===before&&box.window._CTRLNOI.rows[0].monto_platinum===null,'Importe positivo no usa excepción de cero');matrix[1][2]=0;
 facts=[];hist=['w'];await read();r=box.window._CTRLNOI.rows[0];
 ok(r.tipo_calculo==='FINIQUITO'&&r.monto_platinum===null,'Finiquito cero respaldado exige incluirse en fotografía, no se confunde con nómina');
 ok(elements['noi-preview'].innerHTML.includes('id="noi-foto"'),'Acción explícita para preparar sin borrar el cierre');
 ok(box.window._CTRLNOI.finiquitosFuera[0]==='w','Recuerda qué finiquito falta incorporar');
 const st=box.window._CTRLNOI;let prepared=0;
 box.window.PLATINUM_FLOWS={abrirCierre:async()=>{},preparar:async()=>{prepared++;},call:async()=>({cierre:c})};
 confirmed=false;await box.ctrlActualizarFotoNOI();ok(prepared===0,'Cancelar no prepara');confirmed=true;
 c.estado='AUTORIZADO';await box.ctrlActualizarFotoNOI();ok(prepared===0&&messages.at(-1).includes('reapertura'),'Fotografía autorizada no se modifica');c.estado='BORRADOR';
 st.actualizando=true;await box.ctrlActualizarFotoNOI();ok(prepared===0,'Doble clic bloqueado');st.actualizando=false;
 await box.ctrlActualizarFotoNOI();ok(prepared===1&&messages.at(-1).includes('no se ha aplicado'),'No anuncia éxito si el flujo rechazó preparación o requiere regularización histórica');
 box.ctrlOpenConciliacion=async()=>{box.window._CTRL_CIERRE={...c};box.window._CTRLNOI=null;};
 box.window.PLATINUM_FLOWS.preparar=async()=>{c.snapshot.items=[{trabajador_id:'w',numero:1,nombre:'PRUEBA ANA',tipo:'FINIQUITO',monto:0,retenciones:0}];};
 await box.ctrlActualizarFotoNOI();
 ok(box.window._CTRLNOI.rows[0].tipo_calculo==='FINIQUITO'&&box.window._CTRLNOI.rows[0].monto_platinum===0,'Prepara y relee el mismo archivo con fotografía verificada');
 ok(elements['noi-preview'].innerHTML.includes('FINIQUITO NETO $0 · sin cheque'),'No genera pago ficticio por finiquito compensado');
 ok(!elements['noi-preview'].innerHTML.includes('id="noi-foto"'),'Acción desaparece al resolver fotografía');
 c.snapshot.items=[];box.window._CTRL_CIERRE=c;hist=[];rpcFail=true;await read();
 ok(box.window._CTRLNOI===null&&messages.at(-1).includes('respaldo'),'Falla de consulta no se interpreta como cero válido');rpcFail=false;
 box.sb.rpc=async()=>{box.OBRA.id='otra';return{data:facts,error:null};};await read();
 ok(box.window._CTRLNOI===null&&messages.at(-1).includes('Cambió'),'Descarta respuesta tardía de otro centro');
 console.log('PASS '+checks+' contratos UI: ceros confirmados, sin respaldo, finiquito auditado, preparación, reapertura, cancelación y contexto.');
})().catch(e=>{console.error(e);process.exitCode=1;});
