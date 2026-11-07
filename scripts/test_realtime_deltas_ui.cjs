// Dos réplicas ficticias, sin red, sin navegador ni trabajadores reales.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const source=fs.readFileSync('frontend/modulos/64-datos-centro-en-vivo.js','utf8');
const rt=fs.readFileSync('platinum-sync.js','utf8');
function session(){
 const {document}=parseHTML('<html><body><div><div class="worker-list"></div><div id="pages"></div></div></body></html>');
 const frames=[],handlers=new Map(),estado=[],timers=new Map();let seq=0,reads=0,draws=0,cal=0;
 const worker={id:'worker',obra_id:'centro',nombres:'PRUEBA',estatus:'ACTIVO',updated_at:'2026-11-07T12:00:00.000001Z'};
 const c={document,OBRA:{id:'centro'},USER:{id:'session'},OBRA_DATOS_ID:'centro',OBRA_CARGA_COMPLETA:true,NAV_STEP:'trabajadores',VIEW:'trab',WORKERS:[worker],
  window:{requestAnimationFrame:f=>frames.push(f),PLATINUM_CALENDARIO:{eventoEnVivo:()=>cal++}},
  actualizarFiltrosPadron:()=>{},renderTable:()=>draws++,pintarVistaObra:()=>{}};
 for(const key of ['CHEQUES','DESC','DOCSX','VAC','ACTAS','NOM','PAGOS','PRIMAS','CUADS','DIFS','BLOQUES','SUELDOSINT','CIERRES','CTRLNOI','ALTAS_CORTAS','FINTRANS'])c[key]=[];
 vm.createContext(c);vm.runInContext(source,c);vm.runInContext(rt,c);
 const api=c.window.PLATINUM_DATOS,channel={on(tipo,f,cb){if(tipo==='postgres_changes')handlers.set(f.table,cb);return this;},subscribe(cb){this.status=cb;return this;},track:async()=>{}};
 const conn=c.window.PLATINUM_SYNC.connect({client:{channel:()=>channel,removeChannel:async()=>{}},userId:'session',apply:api.aplicar,getObraId:()=>c.OBRA?.id,canRefresh:()=>true,refresh:async()=>{reads++;return true;},
  onStatus:s=>estado.push(s),setTimer:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clearTimer:id=>timers.delete(id)});
 return{c,api,worker,conn,channel,document,frames,handlers,timers,reads:()=>reads,draws:()=>draws,cal:()=>cal,flush:()=>{while(frames.length)frames.shift()();}};
}
const p=(fila,stamp='2026-11-07T12:00:02Z')=>({eventType:'UPDATE',new:fila,commit_timestamp:stamp});
(async()=>{
 const a=session(),b=session(),baja={...a.worker,estatus:'BAJA',updated_at:'2026-11-07T12:00:01.000002Z'};
 const obra=a.c.OBRA;a.c.OBRA=null;b.c.OBRA=null;await a.channel.status('SUBSCRIBED');await b.channel.status('SUBSCRIBED');a.c.OBRA=obra;b.c.OBRA=obra;
 let settle;const write=a.api.optimista('trabajadores',a.worker,{estatus:'BAJA'},()=>new Promise(r=>settle=r));
 assert.equal(a.api.vista('trabajadores',a.c.WORKERS)[0].estatus,'BAJA');assert.equal(a.c.WORKERS[0].estatus,'ACTIVO','El motor no ve la baja pendiente');
 assert.equal(b.c.WORKERS[0].estatus,'ACTIVO');b.handlers.get('trabajadores')(p(baja));assert.equal(b.c.WORKERS[0].estatus,'BAJA');assert.equal(b.timers.size,0);
 settle({data:baja});await write;assert.equal(a.c.WORKERS[0].estatus,'BAJA');assert(!a.api.vista('trabajadores',a.c.WORKERS)[0]._pendiente_visual);
 const q={id:'q',obra_id:'centro',estatus:'PENDIENTE',importe:190,updated_at:'2026-11-07T12:00:04Z'};
 b.handlers.get('cheques')(p(q));assert.equal(b.c.CHEQUES.length,1);
 let fail;const rejected=b.api.optimista('cheques',q,{estatus:'ENTREGADO'},()=>new Promise(r=>fail=r));
 assert.equal(b.api.vista('cheques',b.c.CHEQUES)[0].estatus,'ENTREGADO');
 const nuevo={...q,estatus:'EXPEDIDO',updated_at:'2026-11-07T12:00:05.000002Z'};b.handlers.get('cheques')(p(nuevo));
 fail({error:{message:'Bloqueado'}});await assert.rejects(rejected,/Bloqueado/);assert.equal(b.api.vista('cheques',b.c.CHEQUES)[0].estatus,'EXPEDIDO');
 const ticket=b.api.iniciar();b.handlers.get('descuentos')(p({id:'d',obra_id:'centro',monto:20,activo:true}));assert.equal(b.c.DESC[0].monto,20);
 assert.equal(b.api.publicar(ticket,[],'descuentos')[0].id,'d','No perder un evento durante una lectura');
 b.api.cerrar(ticket);
 b.handlers.get('incidencias_empleados')(p({id:'inc',obra_id:'centro',empleado_id:'worker'}));assert.equal(b.cal(),1);
 b.handlers.get('trabajadores')(p({...baja,obra_id:'otra'},'2026-11-07T12:00:05Z'));assert.equal(b.c.WORKERS.length,0);
 b.handlers.get('trabajadores')(p(baja));assert.equal(b.c.WORKERS.length,0,'Una notificación anterior no repone un traslado');
 b.handlers.get('trabajadores')(p({...baja,id:'otro',obra_id:'ajeno'}));assert.equal(b.c.WORKERS.length,0);
 b.handlers.get('control_eventos_integracion')(p({id:'evento',obra_id:'centro',accion:'SALIDA_CENTRO',tabla:'cheques',entidad_id:'q'},'2026-11-07T12:00:08Z'));assert.equal(b.c.CHEQUES.length,0);
 b.handlers.get('descuentos')({eventType:'DELETE',old:{id:'d'},commit_timestamp:'2026-11-07T12:00:09Z'});assert.equal(b.c.DESC.length,0);
 b.flush();const draw=b.draws();const start=performance.now();
 for(let i=0;i<600;i++)b.handlers.get('trabajadores')(p({...baja,id:'nuevo',nombres:'CAMBIO '+i,updated_at:'2026-11-07T12:00:20Z'},'2026-11-07T12:00:20Z'));
 const elapsed=performance.now()-start;assert.equal(b.c.WORKERS[0].nombres,'CAMBIO 599');assert.equal(b.timers.size,0);assert.equal(b.reads(),0);
 assert.equal(b.frames.length,1);b.flush();assert.equal(b.draws(),draw+1);
 const host=b.document.getElementById('pages'),full=Array.from({length:985},(_,i)=>i);
 let shown;const render=()=>{shown=b.api.pagina('trabajadores',full,host,'',render,80);};render();assert.equal(shown.length,80);assert.equal(shown[0],0);host.querySelectorAll('button')[1].onclick();assert.equal(shown[0],80);assert.equal(full.length,985);
 b.channel.status('CHANNEL_ERROR');await b.channel.status('SUBSCRIBED');assert.equal(b.timers.size,1);await [...b.timers.values()][0].fn();assert.equal(b.reads(),1,'Reconexión verifica una vez');
 b.conn.stop();
 console.log('PASS dos sesiones: 600 deltas sin HTTP, bajas/cheques/descuentos, rollback sin pisar cambios remotos, alcance, salidas, borrado, lectura concurrente, paginación y reconexión.');
 console.log('Tiempo del procesamiento sintético de 600 eventos (sin red): '+elapsed.toFixed(2)+' ms.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
