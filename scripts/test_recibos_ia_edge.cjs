// Prueba de contrato de la Edge Function con PDF y respuestas ficticias.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
(async()=>{const path=require('node:path').resolve('supabase/functions/gemini-recibos/core.mjs');if(!fs.existsSync(path)){console.log('ALCANCE PÚBLICO: núcleo Edge privado no incluido. No se ejecutan sus pruebas.');return;}
 const{handle,googleRead,storagePath,parseResult}=await import(require('node:url').pathToFileURL(path));
 const bytes=new TextEncoder().encode('%PDF-1.4 FICTICIO'),calls=[],data={recibos:1,neto:1800};
 const opts={headers:{'Content-Type':'application/json'},auth:async()=>({id:'FICTICIO'}),limit:()=>false,model:'modelo-prueba',hash:async()=>'a'.repeat(64),download:async()=>bytes,read:async()=>data,rpc:async(u,a,j)=>{calls.push([a,j]);return a==='PREPARAR'?{archivo:'obra/recibo.pdf',revision:'REV'}:{id:'LECTURA',datos:j.datos};}};
 const req=body=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body||{obra_id:'O',documento_id:'D'})});
 let r=await handle(req(),opts);ok(r.status===200&&(await r.json()).ok,'Lectura propone sin guardar neto');ok(calls.map(x=>x[0]).join(',')==='PREPARAR,PROPONER','No confirma importes automáticamente');
 r=await handle(req(),{...opts,auth:async()=>null});ok(r.status===401,'Sesión obligatoria');
 r=await handle(req(),{...opts,limit:()=>true});ok(r.status===429,'Límite por usuario');
 r=await handle(req(),{...opts,rpc:async()=>{throw Error('Sin permiso');},download:()=>{throw Error('No debe descargar');}});ok(r.status===422,'Scope antes de descargar');
 r=await handle(req(),{...opts,download:async()=>new TextEncoder().encode('NO PDF')});ok(r.status===422,'No acepta archivo disfrazado');
 r=await handle(req(),{...opts,download:async()=>new Uint8Array(12*1024*1024+1)});ok(r.status===422,'Límite de tamaño');
 r=await handle(req(),{...opts,rpc:async()=>({archivo:'o/r.pdf',hash:'b'.repeat(64)})});ok(r.status===422,'Huella original verificada');
 r=await handle(req(),{...opts,read:async()=>{throw Error('Gemini 503');}});ok(r.status===422&&(await r.json()).error.includes('503'),'Error visible y sin importe');
 for(const path of ['https://evil.test/a','../b','o/../a','\\a','/a']){assert.throws(()=>storagePath(path));n++;}ok(storagePath('o/a b.pdf')==='o/a%20b.pdf','Ruta privada codificada');
 const response=data=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]});ok(parseResult(response(data)).neto===1800,'JSON estructurado');assert.throws(()=>parseResult({candidates:[{finishReason:'MAX_TOKENS'}]}));n++;
 let tries=0;const answer=await googleRead({bytes,mime:'application/pdf',model:'modelo-prueba',key:'FICTICIA',sleep:async()=>{},fetcher:async(url,opts)=>{tries++;ok(!url.includes('FICTICIA')&&opts.headers['x-goog-api-key']==='FICTICIA','Llave no en URL');return tries<3?new Response('busy',{status:503}):new Response(JSON.stringify(response(data)));}});ok(tries===3&&answer.neto===1800,'Reintenta 503 en forma acotada');
 await assert.rejects(googleRead({bytes,mime:'application/pdf',model:'modelo-prueba',key:'FICTICIA',sleep:async()=>{},fetcher:async()=>new Response('busy',{status:503})}),/503/);n++;
 console.log(`PASS ${n} contratos Edge IA: autorización, PDF privado, huella, límites, JSON completo, reintentos y no confirmación automática.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
