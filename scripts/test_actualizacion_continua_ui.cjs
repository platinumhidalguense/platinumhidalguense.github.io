// Regresiones del parpadeo comunicado por el usuario. Sin navegador ni cuentas.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');let tests=0;
const ok=(v,m)=>{assert.ok(v,m);tests++;},html=require('./fuente_frontend.cjs').html();
const source=html.slice(html.indexOf('let OBRA_CARGA_SECUENCIA='),html.indexOf('let CFGEMP={}'));
function fixture(){
 const nodes=new Map(),writes=[],scroll={scrollTop:600,scrollLeft:40};let draws=0,alerts=0;
 const get=id=>{if(!nodes.has(id)){let value='';nodes.set(id,{value:'',get innerHTML(){return value;},set innerHTML(v){value=v;writes.push([id,v]);},classList:{add(){},remove(){},toggle(){}}});}return nodes.get(id);};
 const a={id:'a'},b={id:'b'},arrays=['WORKERS','CHEQUES','DESC','DOCSX','VAC','ACTAS','NOM','PAGOS','PRIMAS','CUADS','DIFS','BLOQUES','SUELDOSINT','CIERRES','CTRLNOI','ALTAS_CORTAS','FINTRANS'];
 let dataset={trabajadores:[{id:'w',no_trab:1,nombres:'PERSONA FICTICIA',estatus:'ACTIVO',puesto:'OFICIAL'}]},acuses=[];
 const c={OBRA:a,VIEW:'trab',window:{},document:{querySelector:()=>scroll},Array,Set,Map,String,Number,Date,JSON,parseInt,$:get,esc:String,toast(){},skeletonTabla:id=>{get(id).innerHTML='ESQUELETO';},renderTable:()=>{draws++;get('tbody').innerHTML=c.WORKERS.map(w=>w.nombres+':'+w.estatus).join('|');scroll.scrollTop=0;},renderStats(){},updateAlertas:()=>alerts++,activarProgramados:async()=>{},sincronizarContratistas:async()=>{},cargarRecalcInfonavit:async()=>{},cargarAcusesTrabajadores:async()=>({data:structuredClone(acuses)})};
 for(const x of arrays)c[x]=[];
 c.sb={from:table=>({table,select(){return this;},eq(){return this;}})};
 c.fetchAllRows=async build=>({data:structuredClone(dataset[build().table]||[])});
 vm.createContext(c);vm.runInContext(source,c);
 return{c,a,b,nodes,get,writes,scroll,arrays,set:(table,rows)=>dataset[table]=rows,acuses:x=>acuses=x,draws:()=>draws,alerts:()=>alerts};
}
(async()=>{
 const f=fixture(),{c,get,writes,scroll}=f;await c.loadObraData('a');ok(writes.filter(x=>x[1]==='ESQUELETO').length===3,'Sólo la entrada inicial muestra esqueletos');
 const original=get('tbody').innerHTML,baseDraws=f.draws();writes.length=0;let release;const gate=new Promise(r=>release=r),reader=c.fetchAllRows;
 c.fetchAllRows=async build=>{await gate;return reader(build);};const loading=c.loadObraData('a',{segundoPlano:true});
 ok(get('tbody').innerHTML===original&&writes.length===0,'La tabla permanece durante una consulta lenta');get('q').value='BUSQUEDA';scroll.scrollTop=900;
 release();ok(await loading,'Intercambio completo confirmado');ok(f.draws()===baseDraws&&writes.every(x=>x[0]!=='tbody'),'Respuesta idéntica no reemplaza filas');ok(scroll.scrollTop===900&&get('q').value==='BUSQUEDA','Conserva posición y texto de búsqueda');
 c.fetchAllRows=reader;f.set('pagos',[{id:'p',importe:1800}]);await c.loadObraData('a',{segundoPlano:true});ok(c.PAGOS.length===1&&f.draws()===baseDraws,'Un pago nuevo actualiza datos y avisos sin reconstruir trabajadores');
 f.set('documentos',[{id:'r',categoria:'RECIBO_NOMINA'}]);await c.loadObraData('a',{segundoPlano:true});ok(c.DOCSX.some(d=>d.id==='r')&&f.draws()===baseDraws,'Un recibo nuevo llega sin parpadeo de padrón');
 f.set('trabajadores',[{id:'w',no_trab:1,nombres:'NOMBRE ACTUALIZADO',estatus:'ACTIVO'}]);await c.loadObraData('a',{segundoPlano:true});ok(get('tbody').innerHTML.includes('NOMBRE ACTUALIZADO')&&f.draws()===baseDraws+1,'Cambio real se muestra');ok(scroll.scrollTop===900&&scroll.scrollLeft===40,'Repintado real conserva desplazamiento');
 f.acuses([{id:'d',trabajador_id:'w',categoria:'ACUSE_IMSS'}]);await c.loadObraData('a',{segundoPlano:true});ok(f.draws()===baseDraws+2,'Acuse nuevo actualiza marcadores');f.acuses([]);await c.loadObraData('a',{segundoPlano:true});ok(f.draws()===baseDraws+3,'Anulación de acuse no deja marcador obsoleto');
 const saved=c.WORKERS,visible=get('tbody').innerHTML;c.fetchAllRows=async()=>({error:{message:'sin red'}});await c.loadObraData('a',{segundoPlano:true});ok(c.WORKERS===saved&&get('tbody').innerHTML===visible,'Fallo conserva datos y DOM verificados');
 c.fetchAllRows=reader;get('modals').innerHTML='CAPTURA SIN GUARDAR';const options={segundoPlano:true};await c.loadObraData('a',options);ok(options.diferida&&c.WORKERS===saved,'Captura abierta difiere intercambio de fuentes');get('modals').innerHTML='';ok(await c.loadObraData('a',{segundoPlano:true}),'Reanuda al cerrar captura');
 f.set('trabajadores',[{id:'w',estatus:'PENDIENTE',nombres:'PROGRAMADA'}]);await c.loadObraData('a');c.activarProgramados=async()=>c.WORKERS[0].estatus='ACTIVO';await c.loadObraData('a');ok(get('tbody').innerHTML.includes('ACTIVO'),'Activación programada se compara después de confirmarse');
 c.WORKERS[0].nombres='CAMBIO LOCAL CONFIRMADO';f.set('trabajadores',structuredClone(c.WORKERS));await c.loadObraData('a');ok(get('tbody').innerHTML.includes('CAMBIO LOCAL CONFIRMADO'),'Recarga explícita tras una mutación local sí actualiza filas');
 c.OBRA=f.b;let finish;const wait=new Promise(r=>finish=r);c.fetchAllRows=async build=>{await wait;return reader(build);};const other=c.loadObraData('b');ok(get('tbody').innerHTML==='ESQUELETO','No muestra datos del centro anterior bajo otro centro');finish();await other;
 ok(f.alerts()>=9,'Las alertas se siguen recalculando, no se desactiva la sincronización');
 const coreBox={};vm.createContext(coreBox);vm.runInContext(fs.readFileSync('platinum-sync.js','utf8'),coreBox);const core=coreBox.PLATINUM_SYNC;
 let now=0,id=0,revision=0,applied=0,calls=0;const tasks=new Map(),starts=[];
 const clock={now:()=>now,setTimer:(f,delay)=>{tasks.set(++id,{f,at:now+delay});return id;},clearTimer:id=>tasks.delete(id)};
 async function advance(ms){const end=now+ms;for(;;){const due=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;tasks.delete(due[0]);await due[1].f();}now=end;}
 const q=core.createQueue({...clock,delay:1200,minInterval:10000,canRefresh:()=>true,refresh:async()=>{calls++;starts.push(now);applied=revision;return true;}});
 for(let i=0;i<600;i++){revision++;q.request();await advance(100);}ok(calls<=6,'600 señales en un minuto no generan 600 consultas');await advance(12000);ok(applied===revision,'No pierde el último cambio de una ráfaga continua');ok(starts.every((s,i)=>!i||s-starts[i-1]>=10000),'Intervalo mínimo comprobado con reloj controlado');
 q.request(true);await advance(0);ok(starts.at(-1)===now,'Actualización manual inmediata sin esperar intervalo');q.stop();const previous=calls;q.request();await advance(12000);ok(calls===previous,'Desconexión limpia detiene consultas');
 ok(html.includes('refresh:cambio=>softRefresh(false,cambio)'),'Tiempo real conserva origen de cambios y no añade avisos de éxito invasivos');
 console.log(`PASS ${tests} regresiones de actualización continua: tabla visible, fuentes íntegras, cambios reales, acuses, búsqueda, scroll, capturas y 600 señales agrupadas.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
