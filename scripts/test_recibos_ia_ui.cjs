// Simula todos los botones nuevos con recibos ficticios. Sin navegador ni red.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');let tests=0;const ok=(v,m)=>{assert.ok(v,m);tests++;};
const src=fs.readFileSync('frontend/modulos/42-recibos-lectura-ia.js','utf8'),isolated=src.slice(0,src.indexOf('window.PLATINUM_RECIBOS_IA.configure('));
const nodes=new Map(),calls=[],errors=[],opened=[],reads=[];let can=true,pending=null,changed=0,confirm=true;
const body={innerHTML:''},ctx={obra:{id:'O'},sb:{rpc:async(name,args)=>{calls.push({name,args});if(args.p_accion==='CONFIRMAR')return{data:{ok:true}};return{data:{obra_id:args.p_datos.obra_id,semana:args.p_datos.semana,total:40,puede_leer:can,filas:Array.from({length:20},(_,i)=>({id:'D'+i,numero:i+1,nombre:'PERSONA FICTICIA '+i,archivo:'privado/'+i+'.pdf'}))}};}}};
const box={window:{},Map,Set,Number,String,Object,Error};vm.createContext(box);vm.runInContext(isolated,box);const api=box.window.PLATINUM_RECIBOS_IA;
api.configure({context:()=>ctx,$:id=>nodes.get(id),esc:String,modal:()=>nodes.set('ri-body',body),confirm:()=>confirm,toast:(...x)=>errors.push(x),changed:()=>changed++,pdf:async p=>opened.push(p),extract:async args=>{reads.push(args);if(pending)return new Promise(resolve=>pending.resolve=resolve);return{ok:true,propuesta:{id:'L'+args.documento_id,documento_id:args.documento_id,obra_id:'O',estado:'PROPUESTA',datos:{neto:1800,percepciones:2000,deducciones:200,evidencia_neto:'NETO PAGADO 1800'}}};}});
(async()=>{
 await api.abrir(2);ok(calls.at(-1).args.p_datos.semana===2,'Abre semana exacta');ok(body.innerHTML.includes('40 recibo(s)'),'Muestra pendientes totales paginados');ok(body.innerHTML.includes('checkbox'),'Selección nativa operable');
 await api.leer();ok(errors.at(-1)[0].includes('entre 1 y 5'),'No envía lote vacío');
 for(let i=0;i<6;i++)api.seleccionar(i,true);await api.leer();ok(reads.length===0,'No envía más de cinco recibos');for(let i=0;i<6;i++)api.seleccionar(i,false);
 api.seleccionar(0,true);confirm=false;await api.leer();ok(reads.length===0,'Confirma envío a Gemini');confirm=true;await api.leer();ok(reads[0].documento_id==='D0'&&reads[0].obra_id==='O','Sólo identidad del documento, no URL ni importe al modelo');ok(body.innerHTML.includes('Revisar y confirmar neto'),'Propuesta revisable');ok(!calls.some(x=>x.args.p_accion==='CONFIRMAR'),'Lectura no guarda automáticamente');
 await api.pdf(0);ok(opened[0]==='privado/0.pdf','Abre original para cotejar');confirm=false;await api.confirmar(0);ok(changed===0,'No confirma sin aceptación');confirm=true;await api.confirmar(0);ok(calls.some(x=>x.args.p_accion==='CONFIRMAR'&&x.args.p_datos.lectura_id==='LD0'),'Guarda lectura exacta confirmada');ok(changed===1,'Notifica sincronización de documentos');
 await api.pagina(1);ok(calls.at(-1).args.p_datos.pagina===1,'Siguiente página');await api.pagina(1);ok(calls.at(-1).args.p_datos.pagina===1,'Límite de página');await api.pagina(-1);ok(calls.at(-1).args.p_datos.pagina===0,'Anterior');
 api.seleccionar(0,true);api.seleccionar(1,true);pending={};const running=api.leer();await new Promise(r=>setImmediate(r));api.detener();pending.resolve({ok:false,error:'Gemini 503'});await running;pending=null;ok(body.innerHTML.includes('Gemini 503'),'Error por recibo visible');ok(reads.length===2,'Detiene antes de leer el siguiente');
 can=false;await api.actualizar();api.seleccionar(0,true);await api.leer();ok(errors.at(-1)[0].includes('consulta'),'Consulta no lee IA');
 ctx.obra={id:'OTRA'};await api.confirmar(0);ok(errors.at(-1)[0].includes('centro'),'Bloquea cambio de centro durante captura');
 ok(calls.every(x=>x.name==='control_recibos_ia'),'Todas las acciones usan coordinador autorizado');
 console.log(`PASS ${tests} contratos VM de recibos IA: lote, selección, permisos, PDF, revisión, confirmación, paginación, detener y sincronización.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
