const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');let pruebas=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);pruebas++;};const window={};vm.runInNewContext(fs.readFileSync('frontend/modulos/83-recibos-contexto-servicio.js','utf8'),{window,Uint8Array,Date});
(async()=>{
 const llamadas=[],originales=new Map();let s,busy,up=0,read=0,fail=false,vigente=true,gemini=0,verif=0;
 const dep={vigente:()=>vigente,cambio:(e,b)=>{s=e;busy=b;},hash:async()=> 'a'.repeat(64),archivo:(data,name)=>({name,size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer}),
  rpc:async(name,{p_accion:a,p_datos:j})=>{llamadas.push(a);
   if(name==='control_revision_recibo')return{data:a==='PREPARAR'?{estado:'LISTO',lote_id:'l',token:'test'}:{estado:'VERIFICADO'}};
   assert.equal(j.modo_archivo,'INDEPENDIENTE');assert(!j.cierre_id||a.includes('VINCUL'));
   if(a==='CONTEXTO')return{data:{contexto:{...j.contexto,desde:'2026-05-25',hasta:'2026-05-31'},archivos:[],cierres:[],escritura:true}};
   if(a==='INICIAR'){const f=originales.get(j.archivo.huella)||{id:'a',datos:j.archivo,huella:j.archivo.huella,ruta:'privado',estado:'RECIBIENDO'};originales.set(j.archivo.huella,f);return{data:{...f,ya_subido:up>0}};}
   if(a==='RECIBIDO')return{data:{estado:'PENDIENTE'}};
   if(a==='LECTURA')return{data:{estado:j.lectura.neto?'VALIDO':'REVISAR',trabajador_id:'w'}};
   if(a==='REGISTRAR'){eq(j.confirmado,true);return{data:{estado:'ARCHIVADO',documento_id:'d'}};}
   if(a==='ABRIR')return{data:{...originales.values().next().value,ya_subido:true}};
   if(a==='PROPONER_VINCULOS')return{data:{estado:'VINCULO_PROPUESTO'}};
   if(a==='VINCULAR')return{data:{estado:'VINCULADO'}};assert.fail(a);
  },storage:{from:()=>({upload:async()=>{llamadas.push('UPLOAD');up++;return{};},download:async()=>({data:new Uint8Array([1,2,3])})})},
  leer:async f=>{llamadas.push('LEER');read++;assert(up>0,'original antes de leer');if(fail)throw Error('Texto ilegible');f.huella='a'.repeat(64);f.datos={neto:'2000.00'};f.lectura={datos:{neto:2000,recibos:1,percepciones:2500,deducciones:500},errores:[],pendientes:[]};},
  verificar:async()=>{verif++;return{};},fragmento:async()=>{gemini++;return{error:{context:{status:503}}};},incorporar:()=>{}};
 const svc=window.PLATINUM_RECIBOS_CONTEXTO.crear(dep),ctx={empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:9};await svc.abrir('o',ctx);
 const file={name:'recibo.pdf',size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};await svc.subir([file]);eq(s.archivos[0].estado,'VALIDO');eq(up,1);eq(llamadas.indexOf('UPLOAD')<llamadas.indexOf('LEER'),true);eq(busy,false);
 await svc.confirmar('a');eq(verif,1);eq(s.archivos[0].estado,'VERIFICADO');eq(llamadas.includes('PREPARAR'),true);eq(llamadas.includes('CREAR_CIERRE'),false);
 await svc.subir([file]);eq(up,1,'reimportación no sustituye original');
 await svc.reanudar('a');eq(read,3);eq((await svc.vincular('a','c')).estado,'VINCULO_PROPUESTO');eq((await svc.vincular('a','c',true)).estado,'VINCULADO');
 fail=true;await svc.reanudar('a');eq(s.archivos[0].estado,'REVISAR');eq(llamadas.at(-1),'LECTURA','fallo queda registrado');
 s.archivos[0].lectura.pendientes=[{region:{texto:'RFC por leer'}}];await assert.rejects(svc.completar('a',0,'',true),/temporalmente ocupado/);pruebas++;
 await assert.rejects(svc.completar('a',0,'',true),/pausa/);pruebas++;eq(gemini,1,'no bucle IA');
 let resolver;const rpc=dep.rpc;dep.rpc=async(...a)=>{if(a[1].p_accion==='CONTEXTO'&&a[1].p_datos.contexto.semana===10)await new Promise(r=>resolver=r);return rpc(...a);};
 const primero=svc.abrir('o',{...ctx,semana:10});await svc.abrir('o',{...ctx,semana:11});resolver();await primero;eq(svc.estado().contexto.semana,11,'respuesta tardía descartada');
 svc.cerrar();vigente=false;eq(busy,false);console.log('PASS recibos contexto servicio:',pruebas);
})().catch(e=>{console.error(e);process.exitCode=1;});
