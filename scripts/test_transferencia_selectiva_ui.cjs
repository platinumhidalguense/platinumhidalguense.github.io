// Datos y relojes ficticios: sin navegador, sesiones reales ni escrituras.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('frontend/modulos/01-sesion-centros-sincronizacion.js','utf8');
const reader=src.slice(src.indexOf('let OBRA_CARGA_SECUENCIA='),src.indexOf('let CFGEMP={}'));
const sync=fs.readFileSync('platinum-sync.js','utf8');
const tables=['trabajadores','cheques','descuentos','documentos','vacaciones','actas','nom035','pagos','prima_pagos','cuadrillas','diferenciales','bloques_cheques','sueldos_internos','control_cierres_nomina','control_conciliacion_noi','control_altas_bajas_cortas','control_finiquitos_transferencia'];
const arrays=['WORKERS','CHEQUES','DESC','DOCSX','VAC','ACTAS','NOM','PAGOS','PRIMAS','CUADS','DIFS','BLOQUES','SUELDOSINT','CIERRES','CTRLNOI','ALTAS_CORTAS','FINTRANS'];
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
function fixture(){
 let now=0,vip=true,acuseReads=0,bytes=0;
 const nodes={},requests=[],data=Object.fromEntries(tables.map(t=>[t,[{id:t+'1',obra_id:'a',nota:'x'.repeat(10000)}]]));
 data.trabajadores=[{id:'w',no_trab:1,nombres:'FICTICIO',puesto:'OFICIAL',estatus:'ACTIVO',contratista:'MG'}];
 data.documentos=[{id:'doc',categoria:'RECIBO_NOMINA',importe:100}];
 const box={console,Array,Set,Map,String,Number,parseInt,JSON,Date:class extends Date{static now(){return now;}},OBRA:{id:'a'},VIEW:'trab',USER:{id:'u1'},window:{},esVip:()=>vip,
  $:id=>nodes[id]||(nodes[id]={value:'',innerHTML:''}),esc:String,toast(){},skeletonTabla(){},renderTable(){},renderStats(){},updateAlertas(){},activarProgramados:async()=>{},sincronizarContratistas:async()=>{},cargarRecalcInfonavit:async()=>{},
  cargarAcusesTrabajadores:async()=>{acuseReads++;return {data:[{id:'acuse',trabajador_id:'w',categoria:'ACUSE_IMSS'}]};}};
 arrays.forEach(a=>box[a]=[]);
 box.sb={from:t=>({table:t,select(){return this;},eq(){return this;}})};
 box.fetchAllRows=async factory=>{const table=factory().table;requests.push(table);const rows=structuredClone(data[table]);bytes+=Buffer.byteLength(JSON.stringify(rows));return {data:rows};};
 vm.createContext(box);vm.runInContext(reader,box);
 return{box,data,requests,clock:t=>now=t,vip:v=>vip=v,acuses:()=>acuseReads,bytes:()=>bytes,clear:()=>{requests.length=0;bytes=0;}};
}
const partial=sources=>({segundoPlano:true,fuentes:sources});
(async()=>{
 const f=fixture(),c=f.box;eq(await c.loadObraData('a'),true,'Carga inicial');eq(f.requests.length,17);const fullBytes=f.bytes();f.clear();
 f.data.pagos.push({id:'p2',importe:200});eq(await c.loadObraData('a',partial(['pagos'])),true);eq(f.requests,['pagos'],'Pago no descarga 16 fuentes ajenas');eq(c.PAGOS.length,2);eq(f.acuses(),1,'Pago no repite acuses');
 const partialBytes=f.bytes();assert(partialBytes<fullBytes/10);checks++;
 f.clear();await c.loadObraData('a',partial(['cuadrillas','descuentos']));eq(f.requests,['descuentos','cuadrillas'],'Ráfaga de fuentes se agrupa');
 f.clear();await c.loadObraData('a',partial(['trabajadores']));eq(f.requests,['trabajadores']);eq(f.acuses(),2,'Padrón modificado vuelve a verificar acuses de todos sus UUID');
 f.clear();await c.loadObraData('a',partial(['documentos']));eq(f.requests,['documentos']);eq(f.acuses(),3,'Documento nuevo/anulado verifica acuses');
 c.CHEQUES[0].nota='CAMBIO LOCAL NO GUARDADO';f.clear();await c.loadObraData('a',partial(['pagos']));eq(c.CHEQUES[0].nota,'x'.repeat(10000),'Copia aislada de referencias de UI');
 for(const options of [{},partial(undefined),partial([]),partial(['control_eventos_integracion']),partial(['obras']),partial(['desconocida'])]){f.clear();await c.loadObraData('a',options);eq(f.requests.length,17,'Lectura completa para '+JSON.stringify(options));}
 f.clock(59999);f.clear();await c.loadObraData('a',partial(['pagos']));eq(f.requests.length,1);
 f.clock(60000);f.clear();await c.loadObraData('a',partial(['pagos']));eq(f.requests.length,17,'TTL no se prolonga por lecturas parciales');
 c.USER.id='otro';f.clear();await c.loadObraData('a',partial(['pagos']));eq(f.requests.length,17,'No reutilizar entre sesiones');
 f.vip(false);f.clear();await c.loadObraData('a',partial(['pagos']));eq(f.requests.length,17,'Cambio de permisos VIP invalida');
 c.OBRA={id:'b'};f.clear();await c.loadObraData('b',partial(['pagos']));eq(f.requests.length,17,'Otra obra/empresa requiere todas las fuentes');
 c.OBRA={id:'a'};await c.loadObraData('a');const saved=c.PAGOS,normal=c.fetchAllRows;
 c.fetchAllRows=async()=>({error:{message:'sin permiso'}});eq(await c.loadObraData('a',partial(['pagos'])),false);eq(c.PAGOS,saved,'Fallo no sustituye fuentes por vacío');
 c.fetchAllRows=normal;f.clear();await c.loadObraData('a',partial(['pagos']));eq(f.requests.length,17,'Después de fallo se comprueba todo');
 c.$('modals').innerHTML='CAPTURA';const opt=partial(['pagos']);eq(await c.loadObraData('a',opt),false);eq(opt.diferida,true);c.$('modals').innerHTML='';f.clear();await c.loadObraData('a',partial(['pagos']));eq(f.requests.length,17,'Captura diferida no instala caché');
 c.activarProgramados=async()=>c.WORKERS[0].estatus='ACTIVO_CONFIRMADO';await c.loadObraData('a');c.activarProgramados=async()=>{};await c.loadObraData('a',partial(['pagos']));eq(c.WORKERS[0].estatus,'ACTIVO_CONFIRMADO');
 // El contexto debe seguir coincidiendo también al terminar las consultas.
 let finishRead;const gateRead=new Promise(r=>finishRead=r);const readBefore=c.fetchAllRows;
 c.fetchAllRows=async f=>{await gateRead;return readBefore(f);};const before=c.WORKERS,late=c.loadObraData('a',partial(['trabajadores']));c.USER.id='sesion-nueva';finishRead();eq(await late,false);eq(c.WORKERS,before,'Una respuesta de otra sesión nunca se aplica');c.fetchAllRows=readBefore;
 // El límite temporal no permite reutilizar si el reloj del equipo retrocede.
 f.clock(120000);await c.loadObraData('a');f.clock(119000);f.clear();await c.loadObraData('a',partial(['pagos']));eq(f.requests.length,17,'Reloj hacia atrás obliga a comprobación completa');
 const coreBox={setTimeout,clearTimeout};vm.createContext(coreBox);vm.runInContext(sync,coreBox);const core=coreBox.PLATINUM_SYNC;
 let seq=0,allowed=true,answer=true,release;const timers=new Map(),calls=[];
 const q=core.createQueue({setTimer:f=>{timers.set(++seq,f);return seq;},clearTimer:i=>timers.delete(i),canRefresh:()=>allowed,refresh:async o=>{calls.push(JSON.parse(JSON.stringify(o)));if(release)await new Promise(r=>release=r);return answer;}});
 const tick=async()=>{const jobs=[...timers.values()];timers.clear();await Promise.all(jobs.map(f=>f()));};
 q.request(false,'pagos');q.request(false,'cheques');await tick();eq(calls.at(-1),{sources:['pagos','cheques']});
 q.request(false,'pagos');q.request(true);await tick();eq(calls.at(-1),{sources:null},'Manual exige completa');
 allowed=false;q.request(false,'trabajadores');await tick();allowed=true;q.resume();await tick();eq(calls.at(-1),{sources:null},'Modal preserva cambios y reanuda con verificación completa');
 answer=false;q.request(false,'pagos');await tick();answer=true;q.request(false,'cheques');await tick();eq(calls.at(-1),{sources:null},'Fallo no pierde invalidaciones');
 answer='pending';q.request(false,'pagos');await tick();eq(q.inspect().deferred,true);answer=true;q.resume();await tick();eq(calls.at(-1),{sources:null});
 release=()=>{};q.request(false,'pagos');const running=tick();await Promise.resolve();q.request(false,'documentos');release();release=null;await running;await tick();eq(calls.at(-1),{sources:['documentos']},'Cambio durante consulta no se pierde');
 q.stop();const n=calls.length;q.request(false,'pagos');await tick();eq(calls.length,n);
 eq(sync.includes('queue.request(false,table)'),true);eq(src.includes('refresh:cambio=>softRefresh(false,cambio)'),true);
 console.log(`PASS ${checks} verificaciones de ahorro: lectura selectiva, sesión, empresa, permisos, TTL, acuses, altas, errores, modales, concurrencia y carga manual. Modelo de 17 fuentes: ${fullBytes} bytes frente a ${partialBytes} en cambio de pagos; no es una medición de producción.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
