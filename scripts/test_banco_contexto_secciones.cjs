// Contexto bancario por secciones: permisos mínimos primero, paginación completa, fuentes acotadas por periodo
// o por fechas de las operaciones, caché por contexto, respuestas antiguas descartadas y error/reintento por sección.
// Datos ficticios. Sin navegador ni red.
const assert=require('assert/strict'),crypto=require('crypto');
const core=require('../frontend/modulos/58-conciliador-core.js'),api=require('../frontend/modulos/78-banco-historico-servicio.js');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},ok=(v,m)=>{assert(v,m);n++;};
const tick=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));};
const clone=x=>JSON.parse(JSON.stringify(x));
let alcance={obra_id:'O',usuario_id:'U',firma:'A'},llamadas=[],fallaFuentes=0,fallaContexto=null,retenerPersonas=null,archivos=new Map(),bytes=new Map();
const personas=Array.from({length:1030},(_,i)=>({id:'W'+String(i).padStart(5,'0'),nombre:'PERSONA '+i,cuenta:String(1000000000+i)}));
const lista=Array.from({length:73},(_,i)=>({id:'A'+String(i).padStart(3,'0'),nombre:'ORIGINAL '+i+'.pdf',estado:'LEIDO',created_at:'2026-11-'+String(1+(i%28)).padStart(2,'0')}));
const fuente=(sem,id,clase)=>({clave:clase+':'+id,trabajador_id:'X'+id,nombre:'PERSONA PRUEBA',cuenta:'1234567890',semana:sem,concepto:'NOMINA'});
const cfg={context:()=>alcance,core,hash:async b=>crypto.createHash('sha256').update(Buffer.from(b)).digest('hex'),file:(b,name)=>({name,arrayBuffer:async()=>b}),legacy:{},
 rpc:async(fn,{p_accion:a,p_datos:j})=>{llamadas.push({fn,a,j:clone(j)});
  if(fn==='control_importacion_contexto'){
   if(a==='CONTEXTO'){if(fallaContexto)return{error:fallaContexto};return{data:{version:'CONTEXTO_V2',obra_id:j.obra_id,empresa_codigo:'PLATINUM',puede_importar:true,puede_conciliar:true,totales:{personas:personas.length,archivos:lista.length}}};}
   if(a==='PERSONAS'){if(retenerPersonas)await retenerPersonas;const i=j.despues?personas.findIndex(p=>p.id===j.despues)+1:0,f=personas.slice(i,i+j.limite);return{data:{filas:f,siguiente:f.length===j.limite?f.at(-1).id:null}};}
   if(a==='ARCHIVOS'){const i=j.despues_id?lista.findIndex(p=>p.id===j.despues_id)+1:0,f=lista.slice(i,i+j.limite);return{data:{filas:f,siguiente:f.length===j.limite?{despues_fecha:f.at(-1).created_at,despues_id:f.at(-1).id}:null}};}
   if(a==='ANTERIORES')return{data:{filas:[{id:'V1',nombre:'ANTERIOR.pdf'}],siguiente:null}};
   if(a==='FUENTES'){if(fallaFuentes>0){fallaFuentes--;return{error:{message:'canceling statement due to statement timeout',code:'57014'}};}
    const sem=j.semanas?.length?j.semanas:[...new Set((j.fechas||[]).map(f=>Math.floor((Date.parse(f)-Date.parse('2026-03-30'))/6048e5)+1))];
    return{data:{semanas:sem,fuentes:sem.flatMap(s=>[fuente(s,'O'+s,'OBLIGACION'),fuente(s,'C'+s,'CFDI')])}};}
   throw Error('acción '+a);}
  let f=archivos.get(j.archivo_id);
  if(a==='INICIAR'){f=[...archivos.values()].find(x=>x.sha256===j.sha256);if(!f){f={id:'F'+(archivos.size+1),obra_id:j.obra_id,nombre:j.nombre,sha256:j.sha256,contexto:j.contexto,ruta:'R'+archivos.size,revision:1,estado:'SUBIENDO',propuesta:{}};archivos.set(f.id,f);}return{data:clone(f)};}
  if(a==='ARCHIVADO'){f.estado='ARCHIVADO';f.revision++;return{data:clone(f)};}
  if(a==='PROPUESTA'){f.propuesta=clone(j.propuesta);f.estado='LEIDO';f.revision++;return{data:clone(f)};}
  if(a==='ABRIR')return{data:clone(f)};if(a==='ERROR'){f.estado='ERROR';f.error=j.error;f.revision++;return{data:clone(f)};}
  if(a==='CONTEXTO')return{data:{obra_id:j.obra_id,fuentes:[],personas:[],archivos:[],puede_importar:true}};throw Error(a);},
 storage:{from:()=>({upload:async(r,file)=>{bytes.set(r,await file.arrayBuffer());return{};},download:async r=>({data:{arrayBuffer:async()=>bytes.get(r)}})})},
 paginas:async()=>[{numero:1,texto:'Beneficiario: PERSONA PRUEBA Banco: BBVA Cuenta destino: 1234567890 Fecha de operación: 23/10/2026 Importe: 500.00 MXN Operación exitosa Folio: REFERENCIA123456'}],
 fragmento:async()=>new ArrayBuffer(4),ia:async()=>({ok:false,error:'no se usa'})};
const original=new TextEncoder().encode('%PDF-FICTICIO').buffer,archivo={name:'ORIGINAL.pdf',size:original.byteLength,arrayBuffer:async()=>original};
const de=(a,fn='control_importacion_contexto')=>llamadas.filter(x=>x.fn===fn&&x.a===a);
(async()=>{
 // 1. Contexto mínimo antes que cualquier consulta pesada; secciones en segundo plano.
 let s=api.crear(cfg);const ctx={empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:30,concepto:'NOMINA'};
 const e=await s.abrir(ctx);
 eq(llamadas[0].a,'CONTEXTO','primera solicitud: permisos y contexto');ok(e.puede_importar,'habilita carga con el contexto autorizado');
 eq(e.secciones.contexto.estado,'LISTO','contexto listo sin esperar secciones');
 await tick();
 eq(s.estado().personas.length,1030,'personas con paginación completa (sin tope de 1000)');eq(de('PERSONAS').length,3,'tres páginas de personas');
 eq(s.estado().secciones.personas.aviso,null,'total de personas cuadra con el servidor');
 eq(s.estado().archivos.length,50,'primera página de archivos');ok(s.estado().secciones.archivos.mas,'avisa que hay más archivos');
 await s.mas('archivos');eq(s.estado().archivos.length,73,'segunda página sin duplicados');eq(s.estado().secciones.archivos.mas,false,'sin más páginas');
 eq(de('FUENTES').length,1,'fuentes de la semana elegida al abrir');eq(de('FUENTES')[0].j.semanas,[30],'filtro de periodo');eq(de('FUENTES')[0].j.concepto,'NOMINA','filtro de concepto');
 ok(de('FUENTES')[0].j.obra_id==='O'&&de('FUENTES')[0].j.anio===2026&&de('FUENTES')[0].j.periodicidad==='SEMANAL','centro, año y periodicidad en cada consulta');
 eq(s.estado().fuentes.map(f=>f.clave),['OBLIGACION:O30','CFDI:C30'],'fuentes con y sin cierre');
 // 2. Reutiliza las fuentes ya consultadas en el mismo contexto.
 await s.subir([archivo]);eq(de('FUENTES').length,1,'misma semana: no repite la consulta');
 ok(de('INICIAR',`control_importacion_bancaria`).length===1&&de('ARCHIVADO','control_importacion_bancaria').length===1,'archiva el original');
 s.cerrar();
 // 3. Lote mixto: sin semana; consulta los periodos de las fechas leídas.
 llamadas=[];s=api.crear(cfg);await s.abrir({...ctx,semana:null,concepto:'TODOS'});await tick();
 eq(de('FUENTES').length,0,'sin semana no consulta fuentes al abrir');
 archivos.clear();await s.subir([archivo]);
 eq(de('FUENTES').length,1,'consulta fuentes al leer el comprobante');eq(de('FUENTES')[0].j.fechas,['2026-10-23'],'usa las fechas de las operaciones');eq(de('FUENTES')[0].j.concepto,null,'lote mixto sin concepto');
 s.cerrar();
 // 4. Fuente con error: el original se archiva y la sección conserva su error con reintento.
 llamadas=[];archivos.clear();fallaFuentes=1;s=api.crear(cfg);await s.abrir({...ctx,semana:null,concepto:'TODOS'});await tick();
 const r=await s.subir([archivo]);ok(!r[0].error,'el comprobante se archiva y se lee aunque falten fuentes');
 eq(s.estado().secciones.fuentes.estado,'ERROR','sección de fuentes en error visible');ok(/timeout/.test(s.estado().secciones.fuentes.error),'motivo visible');
 ok(s.estado().archivo.propuesta.records.length>=1,'conserva la lectura');
 await s.reintentar('fuentes');eq(s.estado().secciones.fuentes.estado,'LISTO','reintento de la sección');eq(de('FUENTES').length,2,'reintenta sólo fuentes');
 s.cerrar();
 // 5. Cambio de filtros o sesión durante la carga: respuestas antiguas descartadas.
 llamadas=[];let soltar;retenerPersonas=new Promise(x=>soltar=x);s=api.crear(cfg);await s.abrir(ctx);
 eq(s.estado().secciones.personas.estado,'CARGANDO','personas en curso');
 alcance={...alcance,firma:'B'};soltar();retenerPersonas=null;await tick();
 eq(s.estado().personas.length,0,'respuesta de personas del contexto anterior descartada');
 await s.abrir({...ctx,semana:31});await tick();eq(s.estado().personas.length,1030,'nuevo contexto carga completo');eq(s.estado().fuentes.map(f=>f.semana),[31,31],'fuentes sólo del nuevo periodo');
 alcance={...alcance,usuario_id:'OTRO'};const antes=s.estado().archivos.length;eq(await s.reintentar('archivos'),false,'otra sesión: no consulta ni mezcla resultados');eq(s.estado().archivos.length<=antes,true,'sin resultados de otra sesión');alcance={...alcance,usuario_id:'U'};
 s.cerrar();
 // 6. Histórico y quincenal: año anterior y días de la quincena como periodo.
 llamadas=[];s=api.crear(cfg);await s.abrir({empresa_codigo:'PLATINUM',anio:2025,periodicidad:'QUINCENAL',semana:null,mes:3,quincena:2,concepto:'TODOS'});await tick();
 ok(llamadas.filter(x=>x.fn==='control_importacion_contexto').every(x=>x.j.anio===2025&&x.j.periodicidad==='QUINCENAL'),'contexto histórico en todas las secciones');
 eq(de('FUENTES')[0].j.fechas,['2025-03-16','2025-03-22','2025-03-28','2025-03-31'],'segunda quincena de marzo como periodo');
 s.cerrar();
 // 7. Error de permisos en el contexto: no habilita carga.
 llamadas=[];fallaContexto={code:'42501',message:'Sin permiso de pagos en este centro'};s=api.crear(cfg);
 await assert.rejects(s.abrir(ctx),/Sin permiso/);n++;eq(s.estado().secciones.contexto.estado,'ERROR','contexto con error visible');
 eq(llamadas.filter(x=>x.a!=='CONTEXTO').length,0,'sin consultas pesadas sin permiso');fallaContexto=null;s.cerrar();
 console.log('PASS contexto bancario por secciones: '+n+' comprobaciones de permisos previos, paginación completa, fuentes por periodo y por fechas, caché, error y reintento por sección, respuestas antiguas, histórico y quincenal.');
})().catch(e=>{console.error(e);process.exitCode=1;});
