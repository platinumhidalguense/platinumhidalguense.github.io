// Contrato de recuperación; los ensayos con SQL real se ejecutan aparte, sin datos operativos.
'use strict';
const assert=require('node:assert/strict'),{useGuardadoNOI}=require('../frontend/modulos/97-conciliador-noi-guardado.js');
const clone=x=>JSON.parse(JSON.stringify(x));let n=0;const ok=(x,m)=>{assert.ok(x,m);n++;};
function fixture(op={}){
 const hash='a'.repeat(64),c={id:'c',obra_id:'o',semana:34,periodo:'SEMANAL',estado:'BORRADOR',snapshot_sha256:'foto',snapshot:{empresa_codigo:'PLATINUM'}};
 const rows=[{trabajador_id:'w',monto_noi:100}],a={id:'a',etapa:1,sha256:hash,propuesta:{hash,snapshot_sha256:'foto',rows:clone(rows)}};
 const st={hash,rows:clone(rows),file:{arrayBuffer:async()=>new ArrayBuffer(1)}};
 let vigente=true,imports=0,links=0,reads=0,release=null;
 const remote={cierre:clone(c),resumen:{noi:{guardado:false,filas_guardadas:0,fotografia_sha256:'foto',cero:false}},archivos:[clone(a)]};
 const mark=()=>{remote.cierre.archivo_noi_sha256=hash;remote.resumen.noi={guardado:true,filas_guardadas:1,fotografia_sha256:'foto',cero:!op.sucio,fuente_pendiente:!!op.sucio};};
 if(op.saved)mark();
 const cfg={vigente:()=>vigente,hash:async()=>op.hashError?'otro':hash,leer:async()=>{reads++;if(op.readError&&reads>1)throw Error('RED');return clone(remote);},importar:async()=>{imports++;if(op.pause)await new Promise(r=>release=r);if(op.noPersist)throw Error('57014 timeout');mark();if(op.lost)throw Error('RED PERDIDA');return{filas:1,diagnostico:{pendientes:0}};},vincular:async(_,p)=>{links++;if(op.linkError)throw Error('RED VINCULO');remote.archivos[0].propuesta=clone(p);},estado:()=>{}};
 const service=useGuardadoNOI(cfg),capture={cierre:c,archivo:a,lectura:st,escritura:true};
 return{service,capture,remote,mark,info:()=>({imports,links,reads}),change:()=>vigente=false,release:()=>release?.()};
}
(async()=>{
 let f=fixture(),r=await f.service.guardar(f.capture);ok(r.guardado&&!r.vinculo_pendiente,'confirmación completa');ok(f.info().imports===1&&f.remote.archivos[0].propuesta.guardado,'importa y vincula después de comprobar');
 f=fixture({lost:true});r=await f.service.guardar(f.capture);ok(r.guardado&&r.recuperado,'respuesta perdida recupera SQL confirmado');ok(f.info().imports===1,'no repite insert tras respuesta perdida');
 f=fixture({saved:true});r=await f.service.guardar(f.capture);ok(r.guardado&&f.info().imports===0,'reabrir guardado sólo confirma vínculo');
 f=fixture({linkError:true});r=await f.service.guardar(f.capture);ok(r.guardado&&r.vinculo_pendiente,'fallo posterior se distingue de fallo de guardado');ok(f.remote.resumen.noi.guardado,'no se deshace una conciliación ya confirmada');
 f=fixture({noPersist:true});await assert.rejects(f.service.guardar(f.capture),/57014/);n++;ok(!f.remote.resumen.noi.guardado&&f.info().links===0,'error SQL no marca bandera');
 f=fixture({sucio:true});r=await f.service.guardar(f.capture);ok(r.guardado&&!r.datos.resumen.noi.cero,'fuente desactualizada no habilita avanzar');
 for(const change of [f=>f.capture.escritura=false,f=>f.capture.archivo.propuesta.snapshot_sha256='anterior',f=>f.capture.archivo.sha256='otro',f=>f.capture.lectura.rows[0].monto_noi=99]){f=fixture();change(f);await assert.rejects(f.service.guardar(f.capture));n++;ok(f.info().imports===0,'captura inválida no llega a importar');}
 f=fixture({hashError:true});await assert.rejects(f.service.guardar(f.capture),/huella/);n++;
 f=fixture();f.remote.cierre.snapshot_sha256='nueva';await assert.rejects(f.service.guardar(f.capture),/fotografía cambió/);n++;ok(f.info().imports===0,'fotografía cambió: conserva original');
 f=fixture();f.remote.archivos[0].propuesta.rows[0].monto_noi=20;await assert.rejects(f.service.guardar(f.capture),/Otro usuario/);n++;
 f=fixture({pause:true});const p=f.service.guardar(f.capture),p2=f.service.guardar(f.capture);ok(p===p2,'doble clic comparte operación');for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));f.release();await Promise.all([p,p2]);ok(f.info().imports===1,'un solo envío');
 f=fixture({pause:true});const late=f.service.guardar(f.capture);for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));f.change();f.release();await assert.rejects(late,e=>e.obsoleto===true);n++;ok(f.info().links===0,'cambio contexto no vincula respuesta tardía');
 f=fixture();f.remote.cierre.periodo='QUINCENAL';await assert.rejects(f.service.guardar(f.capture),/otro periodo/);n++;
 console.log('PASS guardado NOI: '+n+' comprobaciones de persistencia, fuentes, recuperación, huellas, permisos y concurrencia. Adaptadores unitarios; SQL real en prueba privada separada.');
})().catch(e=>{console.error(e);process.exitCode=1;});
