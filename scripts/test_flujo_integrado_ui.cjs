// VM de JavaScript: sin navegador, cuentas, red ni datos reales.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./fuente_frontend.cjs').html(),source=fs.readFileSync('platinum-workflows.js','utf8');
let checks=0;
for(const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/src=|application\/json/.test(s[1])){new vm.Script(s[2]);checks++;}
const elements={'flow-reason':{value:'Motivo ficticio suficiente'},'flow-decision':{value:'Decisión ficticia suficiente'}};
let ctx={obra:{id:'o',nombre:'Obra ficticia'},workers:[],empresaNombre:'PLATINUM'},permission={escritura:true,admin:false,transferencia:false},calls=[],messages=[],view='',release=null;
const closure={id:'c',obra_id:'o',semana:29,periodo:'SEMANAL',estado:'REVISADO',total_neto:2000};
const data=()=>({cierre:closure,flujo:{version_id:'v',sucio:false},diagnostico:{filas:[],pendientes:0},saldos:[],versiones:[],recibos_sin_leer:[],solicitudes:[],pagos:[],cheques:[],aplicaciones:[]});
const box={Date,Intl,crypto:require('node:crypto').webcrypto,confirm:()=>true,prompt:()=> 'AUTORIZAR S29'};vm.createContext(box);vm.runInContext(source,box);
ctx.sb={rpc:async(name,args)=>{assert.equal(name,'control_flujo_operar');calls.push(args);
 if(args.p_accion==='PERMISOS')return {data:permission};
 if(args.p_accion==='DETALLE')return {data:data()};
 if(args.p_accion==='TRANSICION'&&release)return await new Promise(r=>{release.resolve=()=>r({data:{ok:true}});});
 return {data:{ok:true,filas:1}};
}};
const flow=box.PLATINUM_FLOWS;flow.configure({context:()=>ctx,$:id=>elements[id],esc:s=>String(s??''),money:x=>Number(x||0).toFixed(2),table:(h,r)=>r.join(''),modal:s=>view=s,toast:(s,t)=>messages.push([s,t]),reload:async()=>{},openNoi:async()=>{},fullName:w=>w.nombre,openControl:()=>{},go:async()=>{},exportRows:async()=>{}});
(async()=>{
 await flow.transicion('c','AUTORIZADO');assert(!calls.some(x=>x.p_accion==='TRANSICION'));checks++;
 permission={escritura:false,admin:false};await flow.transicion('c','REVISADO');assert(!calls.some(x=>x.p_accion==='TRANSICION'));checks++;
 permission={escritura:true,admin:true,aprobar_cierre:true};release={};const first=flow.transicion('c','AUTORIZADO');while(!release.resolve)await new Promise(r=>setImmediate(r));
 await flow.transicion('c','AUTORIZADO');assert.equal(calls.filter(x=>x.p_accion==='TRANSICION').length,1);checks++;release.resolve();await first;release=null;
 const frozen={filas:[{w:{id:'w',obra_id:'o',contratista:'MG',periodo_pago:'SEMANAL'},fin:false,neto:2000,costo:2200,items:[]}]};
 const model=await flow.versionarModelo({filas:[{w:{id:'w',obra_id:'o'},neto:9999,costo:9999,items:[]}]},{obras:['o'],sem:'S29',periodo:'SEMANAL',versiones:{cierres:[{obra_id:'o',estado:'AUTORIZADO',periodo:'SEMANAL',version_id:'v',snapshot:{modelo:frozen}}]}});
 assert.equal(model.neto,2000);assert.equal(model.costo,2200);checks++;
 await assert.rejects(flow.versionarModelo({filas:[]},{obras:['o'],sem:'S29',versiones:{cierres:[{obra_id:'o',estado:'AUTORIZADO',periodo:'SEMANAL',version_id:null}]}}),/sin desglose sellado/);checks++;
 assert.equal(flow.filtrarAbiertos([{id:'w',obra_id:'o'}],[],{cierres:[{obra_id:'o',estado:'AUTORIZADO',periodo:'TODOS'}]}).act.length,0);checks++;
 const pay={id:'a',obra_id:'o',trabajador_id:'w',semana:'S29',banco:'BBVA',folio_lote:'12345',fecha_pago:'2026-10-16',importe:2000};
 assert.equal(flow.pagosUnicos([pay,{...pay,id:'b',origen:'INDIVIDUAL'}]).length,1);assert.equal(flow.pagosUnicos([pay,{...pay,id:'c',folio_lote:'67890'}]).length,2);checks++;
 calls=[];await flow.importarNOI({rows:[{monto_noi:2000}],file:{name:'PRUEBA.xlsx'},hash:'a'.repeat(64)},{id:'c',snapshot_sha256:'revision'});
 assert.equal(calls.length,1);assert.equal(calls[0].p_accion,'IMPORTAR_NOI');assert.equal(calls[0].p_datos.revision,'revision');checks++;
 await flow.abrirCierre('c');flow.manual();
 for(const m of (view+source).matchAll(/onclick="PLATINUM_FLOWS\.(\w+)\(/g))assert.equal(typeof flow[m[1]],'function','Botón sin destino: '+m[1]);checks++;
 for(const name of ['ctrlCrearCierre','ctrlGuardarNOI','chqResolverNeto']){const a=html.indexOf('async function '+name+'('),b=html.indexOf('\n}',a);assert(a>0);assert(!/\.insert\(|\.delete\(|\.update\(/.test(html.slice(a,b)));}checks++;
 assert(html.includes('capture:proySnapshotIntegrado'));assert(html.includes('window.__PLATINUM_REQUIERE_FLUJO=true'));checks++;
 console.log('PASS '+checks+' contratos UI: botones, permisos, doble envío, NOI atómico, versión fija, duplicados y adaptadores. Sin prueba visual.');
})().catch(e=>{console.error(e);process.exitCode=1;});
