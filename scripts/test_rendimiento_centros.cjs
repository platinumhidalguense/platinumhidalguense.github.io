// Sólo datos ficticios y VM. No abre navegador ni consulta producción.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{performance}=require('node:perf_hooks');
const manifest=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8'));
const source=manifest.modules.map(p=>fs.readFileSync(p,'utf8')).join('');
const ast=acorn.parse(source,{ecmaVersion:'latest'}),functions=new Map(ast.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,source.slice(n.start,n.end)]));
const fn=n=>{assert(functions.has(n),n);return functions.get(n);};
const c={console,Map,Set,Date,Number,String,Array,parseInt,WORKERS:[],DOCSX:[],PAGOS:[],CHEQUES:[],DESC:[],CONTRATISTAS:[],OBRA:{},DOCS:[],RECALCINF:undefined,
 today:()=> '2026-10-20',fullName:w=>w.nombres,recSetGlobal:()=>new Set(),faltantesReciboDe:()=>[],isoWeekDe:()=>30,normSem:v=>String(v).replace(/\D/g,''),esRecibo:d=>d.categoria==='RECIBO_NOMINA',conciliaSemanaDatos:()=>[],datosFaltantes:()=>[],docsOk:()=>0,catalogoPuestos:()=>['OFICIAL'],FISC:()=>({sm:300}),
 $:()=>({value:''}),money:v=>String(v),esc:v=>String(v),fmtD:v=>String(v)};
vm.createContext(c);
for(const n of ['fechaAcuseISO','indiceAcusesIMSS','estadoAcuseIMSS','altaImssPendiente','acuseAltaPendiente','computeAlertas','pintarVistaObra','pagosIndexados','pagosFiltered','renderPagosView','cargarAcusesTrabajadores'])vm.runInContext(fn(n),c);
const plain=s=>JSON.parse(JSON.stringify(s));
(async()=>{
 const draws=[];for(const name of ['renderTable','renderChqStats','renderCheques','renderPagosView','renderVacViews','renderActasView','renderNomView','renderAnualView'])c[name]=()=>draws.push(name);
 c.VIEW='trab';c.pintarVistaObra();assert.deepEqual(draws,['renderTable'],'No construir tablas ocultas');
 for(const [view,names]of Object.entries({chq:['renderChqStats','renderCheques'],pagos:['renderPagosView'],vac:['renderVacViews'],actas:['renderActasView'],nom:['renderNomView'],anual:['renderAnualView']})){
  draws.length=0;c.VIEW=view;c.pintarVistaObra();assert.deepEqual(draws,names);
 }
 draws.length=0;c.VIEW='pagos';c.pintarVistaObra('trab');assert.deepEqual(draws,['renderTable'],'Cambiar centro abre trabajadores, no la vista previa');
 assert(fn('setView').includes('pintarVistaObra(v)'),'Cada herramienta se pinta al abrirla');
 let accesses=0;
 c.WORKERS=Array.from({length:700},(_,i)=>({id:'w'+i,no_trab:i+1,nombres:'PERSONA '+i,estatus:i%5?'ACTIVO':'BAJA',fecha_alta:'2026-09-07',fecha_baja:'2026-09-28',movimiento_imss:i%3?'':'ALTA PRESENTADA',sd:350,puesto:'OFICIAL'}));
 c.DOCSX=Array.from({length:6300},(_,i)=>({id:'d'+i,get trabajador_id(){accesses++;return 'w'+(i%700);},categoria:i%2?'ACUSE_IMSS':'RECIBO_NOMINA',subtipo:i%4?'ALTA':'BAJA',fecha_doc:i%11?'2026-09-07':null,semana:'S25'}));
 // Recuperar la regla previa sin índice: mismas funciones, fechas y conjunto.
 const legacy=fn('computeAlertas').replace('const acuses=indiceAcusesIMSS(DOCSX);','').replaceAll(',acuses)',')').replace('function computeAlertas(','function legacyAlertas(');
 vm.runInContext(legacy,c);accesses=0;let t=performance.now();const before=plain(c.legacyAlertas()),beforeMs=performance.now()-t,beforeScans=accesses;
 accesses=0;t=performance.now();const after=plain(c.computeAlertas()),afterMs=performance.now()-t,afterScans=accesses;
 assert.deepEqual(after,before,'Todas las alertas, no sólo su cantidad, deben coincidir');assert(afterScans<beforeScans/100,'Evita búsquedas repetidas en documentos');
 const alertBenchmark={workers:700,docs:6300,beforeMs:Math.round(beforeMs),afterMs:Math.round(afterMs),beforeScans,afterScans};
 // No conserva un índice antiguo tras añadir/anular un documento.
 c.WORKERS=[{id:'nuevo',nombres:'NUEVO',estatus:'ACTIVO',fecha_alta:'2026-10-19'}];c.DOCSX=[];assert(c.computeAlertas().some(a=>a.k==='IMSSP'));
 c.DOCSX=[{trabajador_id:'nuevo',categoria:'ACUSE_IMSS',subtipo:'ALTA',fecha_doc:'2026-10-19'}];assert(!c.computeAlertas().some(a=>a.k==='IMSSP'));c.DOCSX[0].anulado=true;assert(c.computeAlertas().some(a=>a.k==='IMSSP'));
 // Paralelismo acotado, >1,000 filas por lote, errores no son ausencia de acuses.
 let active=0,max=0;c.sb={from:()=>{const q={select:()=>q,eq:()=>q,in:(k,ids)=>{q.ids=ids;return q;}};return q;}};
 c.fetchAllRows=async factory=>{const q=factory();active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,q.ids[0]==='p0'?12:1));active--;return {data:Array.from({length:1200},(_,j)=>({id:q.ids[0]+'-'+j})),error:null};};
 const result=await c.cargarAcusesTrabajadores(Array.from({length:925},(_,i)=>({id:'p'+i})));
 assert.equal(max,4);assert.equal(result.data.length,12000);assert.equal(result.data[1200].id,'p100-0');assert.equal(result.data.at(-1).id,'p900-1199');
 c.fetchAllRows=async()=>({data:null,error:{message:'sin acceso'}});assert.equal((await c.cargarAcusesTrabajadores([{id:'p'}])).error.message,'sin acceso');
 // Vista de pagos: todos los registros e importes; un solo índice por dibujo.
 vm.runInContext('const pagoSemNum=p=>parseInt(String(p.semana||"").replace(/\\D/g,""))||0;',c);
 vm.runInContext(fn('renderPagosView'),c);c.WORKERS=Array.from({length:700},(_,i)=>({id:'w'+i,nombres:'PERSONA '+i,no_trab:i,contratista:'MG'}));
 c.PAGOS=Array.from({length:3507},(_,i)=>({id:'p'+i,trabajador_id:'w'+i%700,folio_lote:'L'+Math.floor(i/400),importe:i/100,estado:i%9?'EXITOSO':'RECHAZADO',semana:'S'+(17+i%13)}));
 const legacyIndex=fn('pagosIndexados').replace('const trabajadores=new Map(WORKERS.map(w=>[w.id,w]));','').replace('trabajadores.get(p.trabajador_id)','WORKERS.find(x=>x.id===p.trabajador_id)').replace('function pagosIndexados(','function legacyIndex(');vm.runInContext(legacyIndex,c);
 assert.deepEqual(plain(c.pagosIndexados()),plain(c.legacyIndex()));
 const indexed=c.pagosIndexados;let calls=0;c.pagosIndexados=()=>{calls++;return indexed();};const els={};c.$=id=>els[id]||(els[id]={value:'',innerHTML:''});
 c.renderPagosView();assert.equal(calls,1);assert.equal((els['pg-v-tbody'].innerHTML.match(/<tr /g)||[]).length,3507);
 assert.equal(c.PAGOS.length,3507);console.log('PASS rendimiento: vistas bajo demanda, alertas idénticas, documentos frescos, 4 lotes máximo, 12,000 acuses íntegros y 3,507 pagos sin alterar.');
 console.log('BENCHMARK VM (no latencia total de pantalla): '+JSON.stringify(alertBenchmark));
})().catch(e=>{console.error(e);process.exitCode=1;});
