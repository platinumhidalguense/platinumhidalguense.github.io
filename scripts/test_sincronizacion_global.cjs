const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('platinum-sync.js','utf8'),html=require('./fuente_frontend.cjs').html();
const box={setTimeout,clearTimeout};vm.createContext(box);vm.runInContext(code,box);const core=box.PLATINUM_SYNC;
function fn(name){const start=html.indexOf(name);assert(start>=0,name);const next=/\n(?:async )?function |\n\/\* /g;next.lastIndex=start+name.length;return html.slice(start,next.exec(html).index);}
function clock(){let n=0;const tasks=new Map();return {setTimer:f=>{tasks.set(++n,f);return n;},clearTimer:id=>tasks.delete(id),async tick(){const all=[...tasks.values()];tasks.clear();await Promise.all(all.map(f=>f()));},get size(){return tasks.size;}};}
(async()=>{
 assert.equal(core.sources.length,18);assert(core.sources.includes('control_eventos_integracion'));assert(!core.sources.includes('sueldos_internos'));
 assert(!core.sources.includes('control_casos_imss'),'No ampliar suscripciones a diagnósticos clínicos');
 for(const table of ['pagos','cuadrillas','diferenciales','control_cierres_nomina','control_conciliacion_noi'])assert(core.sources.includes(table),table);
 assert(core.relevant({table:'pagos',new:{obra_id:'a'}},'a'));
 assert(!core.relevant({table:'pagos',new:{obra_id:'b'}},'a'));
 assert(core.relevant({table:'trabajadores',new:{obra_id:'b'},old:{obra_id:'a'}},'a'));
 assert(core.relevant({table:'cheques',eventType:'DELETE',old:{id:'c'}},'a'));
 assert(!core.relevant({table:'pagos'},null));assert(core.relevant({table:'obras'},null));
 {
  const c=clock(),states=[];let calls=0,allowed=true;
  const q=core.createQueue({...c,canRefresh:()=>allowed,refresh:async()=>{calls++;return true},onState:s=>states.push(s)});
  for(let i=0;i<100;i++)q.request();assert.equal(c.size,1);await c.tick();assert.equal(calls,1);assert.equal(states.at(-1),'fresh');
  allowed=false;q.request();await c.tick();assert.equal(calls,1);assert(q.inspect().deferred);assert.equal(states.at(-1),'pending');
  allowed=true;q.resume();await c.tick();assert.equal(calls,2);
  q.stop();q.request();await c.tick();assert.equal(calls,2);
 }
 {
  const c=clock(),states=[];let release,calls=0;
  const gate=new Promise(r=>release=r);
  const q=core.createQueue({...c,canRefresh:()=>true,onState:s=>states.push(s),refresh:async()=>{if(++calls===1)await gate;return true;}});
  q.request();const tick=c.tick();await Promise.resolve();q.request();q.request();assert.equal(calls,1);
  release();await tick;assert.equal(c.size,1);await c.tick();assert.equal(calls,2,'Releer si cambió mientras se cargaba');
 }
 for(const fail of ['false','throw']){
  const c=clock(),states=[];const q=core.createQueue({...c,canRefresh:()=>true,onState:s=>states.push(s),refresh:async()=>{if(fail==='throw')throw Error('offline');return false;}});
  q.request();await c.tick();assert.equal(states.at(-1),'error','No anunciar actualización exitosa');
 }
 {
  const c=clock(),handlers=[],events={},removed=[],status=[];let calls=0,now=100000;
  const fakeWindow={addEventListener:(n,f)=>events[n]=f,removeEventListener:(n,f)=>{assert.equal(events[n],f);delete events[n];}};
  const doc={visibilityState:'visible',addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]};
  const channel={on(kind,filter,cb){handlers.push({kind,filter,cb});return this;},subscribe(f){this.status=f;return this;},track:async data=>{channel.tracked=data;},presenceState:()=>({a:[{}],b:[{}]})};
  const conn=core.connect({...c,client:{channel:(name,config)=>{assert(!JSON.stringify(config).includes('@'));return channel;},removeChannel:async ch=>removed.push(ch)},userId:'opaque-id',window:fakeWindow,document:doc,getObraId:()=> 'a',now:()=>now,canRefresh:()=>true,refresh:async()=>{calls++;return true},onStatus:s=>status.push(s)});
  assert.equal(handlers.filter(h=>h.kind==='postgres_changes').length,18);
  await channel.status('SUBSCRIBED');assert.deepEqual(JSON.parse(JSON.stringify(channel.tracked)),{online:true});assert.equal(c.size,0,'Inicio no duplica lectura');
  const payment=handlers.find(h=>h.filter.table==='pagos');payment.cb({new:{obra_id:'b'}});assert.equal(c.size,0);
  payment.cb({new:{obra_id:'a'}});await c.tick();assert.equal(calls,1);
  handlers.find(h=>h.kind==='presence').cb();assert.equal(status.at(-1).online,2);
  await channel.status('CHANNEL_ERROR');assert.equal(status.at(-1).transport,'offline');
  await channel.status('SUBSCRIBED');await c.tick();assert.equal(calls,2,'Reconexión relee cambios perdidos');
  events.focus();await c.tick();assert.equal(calls,3);events.visibilitychange();await c.tick();assert.equal(calls,3,'No repetir foco/visibilidad');
  now+=31000;doc.visibilityState='hidden';events.visibilitychange();await c.tick();assert.equal(calls,3);
  doc.visibilityState='visible';events.visibilitychange();await c.tick();assert.equal(calls,4);
  conn.stop();conn.stop();assert.equal(removed.length,1);assert.equal(Object.keys(events).length,0);
  payment.cb({new:{obra_id:'a'}});await c.tick();assert.equal(calls,4);
 }
 {
  const element={innerHTML:''},messages=[];const a={id:'a',empresa_codigo:'JIRE'};
  const ctx={console,OBRA:a,OBRAS:[a],NAV_STEP:'trabajadores',NAV_BUSY:false,EMPRESA_ACTIVA:'JIRE',window:{},
   $:()=>element,renderObraBar(){},empresaDeObra:o=>o.empresa_codigo,toast:m=>messages.push(m),loadObraData:async()=>true,
   sb:{from:()=>({select(){return this;},order:async()=>({data:[a],error:null})})}};
  vm.createContext(ctx);vm.runInContext(fn('async function softRefresh(')+'\n'+fn('function actualizarDatosCompartidos('),ctx);
  assert.equal(await ctx.softRefresh(),true);assert.equal(messages.length,1);messages.length=0;
  ctx.loadObraData=async()=>false;assert.equal(await ctx.softRefresh(),false);assert.equal(messages.length,0,'Fallo no anuncia éxito');
  ctx.sb.from=()=>({select(){return this},order:async()=>({data:null,error:{message:'sin acceso'}})});
  assert.equal(await ctx.softRefresh(),false);assert.equal(ctx.OBRA,a);assert(messages[0].includes('No se pudo actualizar'));
  let requested=0;ctx.window._PLATINUM_RT={request:()=>requested++};element.innerHTML='formulario sin guardar';ctx.actualizarDatosCompartidos();assert.equal(requested,0);assert.equal(element.innerHTML,'formulario sin guardar');assert(ctx.window._pendingRT);
  element.innerHTML='';ctx.actualizarDatosCompartidos();assert.equal(requested,1);
 }
 assert(html.indexOf('src="platinum-sync.js')<html.indexOf('/* ================== CONFIGURACIÓN'));
 console.log('OK: 18 fuentes, alcance por centro, eventos agrupados, concurrencia, modales preservados, reconexión, foco, desconexión y fallos visibles; sin correos en presencia ni escrituras financieras.');
})().catch(e=>{console.error(e);process.exitCode=1;});
