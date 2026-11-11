const assert=require('assert/strict'),crypto=require('crypto');
const core=require('../frontend/modulos/58-conciliador-core.js'),api=require('../frontend/modulos/78-banco-historico-servicio.js');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},ok=(v,m)=>{assert(v,m);n++;};
const ctx={empresa_codigo:'PLATINUM',anio:2026,periodicidad:'SEMANAL',semana:26,concepto:'FINIQUITO'};
let alcance={obra_id:'O',usuario_id:'U',firma:'CONTEXTO'},iaFalla=true,falloRespuesta=false,confirmaciones=0,fragmentos=[],lecturas=0,eventos=[],archivos=new Map(),bytes=new Map();
const fuentes=[{trabajador_id:'A',nombre:'PERSONA PRUEBA',cuenta:'1234567890'},{trabajador_id:'B',nombre:'OTRA PRUEBA',cuenta:'1234567891'}];
const hash=async b=>crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const cfg={context:()=>alcance,core,hash,file:(b,name)=>({name,arrayBuffer:async()=>b}),legacy:{},
 rpc:async(fn,{p_accion:a,p_datos:j})=>{eq(fn,'control_importacion_bancaria','servicio único');eventos.push(a);let f=archivos.get(j.archivo_id);
  if(a==='CONTEXTO')return{data:{obra_id:alcance.obra_id,fuentes,archivos:[...archivos.values()].filter(f=>!f.padre_id).map(clone),puede_importar:true}};
  if(a==='INICIAR'){f=[...archivos.values()].find(f=>f.sha256===j.sha256);if(!f){f={id:'F'+(archivos.size+1),obra_id:j.obra_id,nombre:j.nombre,sha256:j.sha256,contexto:j.contexto,ruta:'R'+archivos.size,revision:1,estado:'SUBIENDO',propuesta:{},padre_id:j.padre_id};archivos.set(f.id,f);}return{data:clone(f)};}
  if(a==='ABRIR')return{data:clone(f)};
  if(a==='ARCHIVADO'){f.estado='ARCHIVADO';f.revision++;return{data:clone(f)};}
  if(a==='PROPUESTA'){eq(f.revision,j.revision,'revisión de lectura vigente');f.propuesta=clone(j.propuesta);f.estado='LEIDO';f.revision++;return{data:clone(f)};}
  if(a==='PREVISUALIZAR')return{data:{archivo_id:f.id,revision:f.revision,filas:f.propuesta.records.map((r,i)=>({fila:i+1,huella:'H'+i,estado:'LISTO'}))}};
  if(a==='CONFIRMAR'){confirmaciones++;f.revision++;f.resoluciones=j.confirmaciones.map(x=>({resultado:{fila:x.fila,estado:'CONCILIADO',pago_id:'P'+x.fila}}));if(falloRespuesta){falloRespuesta=false;return{error:{message:'Respuesta de red perdida'}};}return{data:{archivo_id:f.id,resultados:f.resoluciones.map(x=>x.resultado)}};}
  if(a==='ERROR'){f.estado='ERROR';f.error=j.error;f.revision++;return{data:clone(f)};}throw Error(a);
 },
 storage:{from:()=>({upload:async(r,file)=>{bytes.set(r,await file.arrayBuffer());return{};},download:async r=>({data:{arrayBuffer:async()=>bytes.get(r)}})})},
 paginas:async()=>{lecturas++;eventos.push('LECTURA');return[{numero:1,texto:'Resumen general Número de registros: 2 Importe total: 1,000.00 01/11/2026 •7890 PERSONA PRUEBA Exitoso 500.00 MXN'},{numero:2,texto:''}];},
 fragmento:async(b,p)=>{fragmentos.push(p);return new TextEncoder().encode('%PDF-PAGINA'+p).buffer;},
 ia:async()=>iaFalla?{ok:false,error:'Servicio temporalmente no disponible (503)'}:{ok:true,tipo_documento:'GLOBAL',registros:[{titular:'OTRA PRUEBA',cuenta:'1234567891',importe:500,estado:'EXITOSO',fecha:'2026-11-01',banco:'BBVA',folio:'FOLIO-2',evidencia_importe:'500.00'}]},
};
const original=new TextEncoder().encode('%PDF-ORIGINAL-FICTICIO').buffer,file={name:'ORIGINAL.pdf',size:original.byteLength,arrayBuffer:async()=>original};
(async()=>{
 let s=api.crear(cfg);await s.abrir(ctx);await s.subir([file]);
 eq(s.estado().archivo.propuesta.records.length,1,'conserva la página correcta cuando falla IA');
 ok(s.estado().archivo.propuesta.paginas[1].error.includes('503'),'fallo recuperable visible');eq(fragmentos,[2],'sólo envía el fragmento pendiente');
 ok(eventos.indexOf('ARCHIVADO')<eventos.indexOf('LECTURA'),'archiva antes de leer');
 const id=s.estado().archivo.id;await s.editar(0,{fuente_clave:'OBLIGACION:A'});s.cerrar();
 s=api.crear(cfg);await s.abrir(ctx);await s.seleccionar(id);iaFalla=false;await s.completar(2);
 eq(lecturas,1,'reanudar no relee páginas correctas');eq(s.estado().archivo.propuesta.records.length,2,'completa sólo la operación faltante');
 eq(s.estado().archivo.propuesta.records[0].fuente_clave,'OBLIGACION:A','conserva revisión previa de la página correcta');
 eq(s.estado().archivo.propuesta.validacion.ok,true,'suma y contador global cuadran');
 const anterior=clone(s.estado().archivo.propuesta.records[0]);
 await s.completar(2);eq(s.estado().archivo.propuesta.records.length,2,'reintento de fragmento no duplica operaciones');eq(s.estado().archivo.propuesta.records[0],anterior,'no sobrescribe lectura correcta');
 await s.revisar();falloRespuesta=true;
 const recuperado=await s.confirmar(s.estado().previa.filas);eq(recuperado.recuperado,true,'recupera la respuesta confirmada en servidor');
 eq(confirmaciones,1,'respuesta perdida no repite la mutación por sí sola');
 await s.seleccionar(id);eq(s.estado().resultados.length,2,'recupera resultados guardados al reabrir');
 alcance={...alcance,firma:'OTRA_SEMANA'};
 await assert.rejects(s.revisar(),/Cambió/);n++;
 s.cerrar();eq(s.estado(),null,'desmontaje libera contexto');
 const repetidas=api.combinarPagina([{titular:'X',importe:10},{titular:'X',importe:10}],[{titular:'X',importe:10},{titular:'X',importe:10}],core);
 eq(repetidas.length,2,'dos operaciones iguales conservan sus dos ocurrencias');
 console.log('PASS servicio bancario histórico: '+n+' comprobaciones de archivo, fragmentos, errores, persistencia y alcance.');
})().catch(e=>{console.error(e);process.exitCode=1;});
