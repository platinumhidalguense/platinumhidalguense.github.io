// VM/DOM sintético: reutiliza el entorno de ficha; no abre navegador ni opera datos reales.
const fs=require('node:fs');
const harness=fs.readFileSync('scripts/test_padron_ficha_personal.cjs','utf8').split('(async()=>{')[0];
const escenario=String.raw`
return (async()=>{
 const multi={...alta,id:'multi',no_trab:4,nombres:'VARIOS CICLOS',fecha_alta:'2026-09-01',fecha_baja:'2026-10-20',fecha_reingreso:'2026-11-02'};
 const bajaMulti={...multi,id:'baja-multi',no_trab:6,nombres:'BAJA VARIOS CICLOS',estatus:'BAJA',fecha_baja:'2026-11-08'};
 const sinFecha={...alta,id:'sin-fecha',no_trab:7,nombres:'SIN FECHAS',estatus:'PENDIENTE',fecha_alta:null};
 const fuente=[alta,w2,futuro,multi,bajaMulti,sinFecha,traslado,{...alta,id:'papelera',eliminado:true},{...multi}];
 c.WORKERS=fuente;c.OBRA_CARGA_COMPLETA=true;c.CUADS=[];
 const ids=()=>[...$('tbody').querySelectorAll('[data-padron-trabajador]')].map(r=>r.dataset.padronTrabajador);
 const fila=id=>$('tbody').querySelector('[data-padron-trabajador="'+id+'"]');
 const campo=(id,k)=>fila(id).querySelector('[data-activity-field="'+k+'"]');
 const antes=JSON.stringify(c.WORKERS);
 c.renderTable();await paso();
 assert.deepEqual([...ids()].sort(),['a','b','baja-multi','c','multi','sin-fecha'].sort());
 assert.equal(new Set(ids()).size,ids().length);
 assert.equal($('stats').textContent.includes('6'),true,'Resumen usa personas del contexto, no eventos ni duplicados');
 assert.deepEqual([...$('padron-columnas').children].map(x=>x.textContent),['Número','Nombre completo','Contratista','Estatus laboral','Fecha de alta','Fecha de baja','Reingresos','Estatus IMSS','Acciones']);
 assert.equal(document.querySelectorAll('[data-padron-vista]').length,0);
 assert.equal(campo('a','ESTATUS').textContent,'ACTIVO');
 assert.match(campo('multi','ESTATUS').textContent,/ACTIVO.*Con reingreso/);
 assert.equal(campo('multi','ALTA').textContent,multi.fecha_alta);
 assert.equal(campo('multi','BAJA').textContent,'—','Baja anterior no se muestra como vigente');
 assert.equal(campo('baja-multi','BAJA').textContent,bajaMulti.fecha_baja);
 assert.equal(campo('sin-fecha','ALTA').textContent,'—');
 assert.match(campo('c','ESTATUS').textContent,/ACTIVO.*Reingreso programado/);
 assert([...document.querySelectorAll('[data-padron-historial]')].every(d=>!d.open));
 assert.equal(peticiones.filter(p=>p.tabla==='historial').length,0,'No consulta historiales al abrir el padrón');
 // Cada acción sigue el ID estable incluso con nombres/números repetidos y nuevo orden.
 const abiertos=[],reactivados=[];c.openDetail=(id,mes,op)=>abiertos.push({id,op});c.doReactivar=id=>reactivados.push(id);
 c.setSort('nombre');c.setSort('nombre');
 let b=fila('b').querySelector('[data-padron-id]');$('tbody').onclick({target:b});assert.equal(abiertos.at(-1).id,'b');assert.equal(new Set(abiertos.at(-1).op.ids).size,6);
 b=fila('multi').querySelector('[data-padron-seccion]');$('tbody').onclick({target:b});assert.equal(abiertos.at(-1).id,'multi');assert.equal(abiertos.at(-1).op.seccion,'imss');
 $('f-estatus').value='BAJA';c.renderTable();assert.deepEqual([...ids()].sort(),['b','baja-multi']);
 b=fila('baja-multi').querySelector('[data-padron-reingreso]');$('tbody').onclick({target:b});assert.deepEqual(reactivados,['baja-multi']);
 editar=false;$('tbody').onclick({target:b});assert.equal(reactivados.length,1,'Revalida permiso al pulsar');c.renderTable();assert.equal(document.querySelectorAll('[data-padron-reingreso]').length,0);assert($('padron-nueva').hidden);editar=true;
 $('f-estatus').value='';$('q').value='VARIOS CICLOS';c.renderTable();assert.deepEqual([...ids()].sort(),['baja-multi','multi']);
 $('q').value='';$('flt-contratista').value='OTRO';c.renderTable();assert.equal(ids().length,0);$('flt-contratista').value='';
 // IMSS separado: la presentación no se confunde con la existencia del acuse.
 c.WORKERS=c.WORKERS.map(w=>w.id==='b'?{...w,movimiento_imss:'BAJA PRESENTADA',fecha_mov_imss:'2026-11-03'}:w);
 c.renderTable();assert.match(campo('b','ACUSES').textContent,/Baja presentada/);assert.match(campo('b','ACUSES').textContent,/Baja pendiente/);assert.equal(campo('b','ESTATUS').textContent,'BAJA');
 assert.match(campo('multi','ACUSES').textContent,/Reingreso por presentar/);
 const hist=(id,accion,f,estado)=>({id,obra_id:'A',trabajador_id:'multi',accion,fecha:f,estado,estado_anterior:estado==='BAJA'?'ACTIVO':'BAJA',fecha_alta:'2026-09-01',fecha_baja:accion==='BAJA'?f:null,fecha_reingreso:accion==='REACTIVACION'?f:null});
 bdd.historial=[hist(1,'ALTA','2026-09-01','ACTIVO'),hist(2,'BAJA','2026-09-20','BAJA'),hist(3,'REACTIVACION','2026-09-21','ACTIVO'),hist(4,'BAJA','2026-10-20','BAJA'),hist(5,'REACTIVACION','2026-11-02','ACTIVO')];
 let d=fila('multi').querySelector('details');d.open=true;d.ontoggle();await paso();await paso();
 assert.match(d.querySelector('summary').textContent,/2 reingresos/);
 const fechas=[...d.querySelectorAll('time')].map(t=>t.textContent);assert.deepEqual(fechas,[...fechas].sort());
 assert.match(d.textContent,/Baja histórica/);assert.equal(campo('multi','BAJA').textContent,'—');
 assert(!d.querySelector('[onclick]'),'Detalle de consulta, sin restaurar ni escribir movimientos');
 const lecturas=peticiones.filter(p=>p.tabla==='historial');assert(lecturas.every(p=>p.ops.some(([k,v])=>k==='trabajador_id'&&v==='multi')&&p.ops.some(([k,v])=>k==='obra_id'&&v==='A')));
 assert(lecturas.every(p=>p.col!=='*'&&!p.col.includes('cuenta')),'Sólo campos necesarios del historial');
 c.renderTable();d=fila('multi').querySelector('details');assert(!d.open);assert.match(d.querySelector('summary').textContent,/2 reingresos/);
 const prev=peticiones.filter(p=>p.tabla==='historial').length;d.open=true;d.ontoggle();await paso();assert.equal(peticiones.filter(p=>p.tabla==='historial').length,prev,'Reutiliza historial leído');
 // Antecedentes registrados aunque el campo resumido no venga en la fila ligera.
 c.WORKERS=c.WORKERS.map(w=>w.id==='multi'?{...w,fecha_reingreso:null}:w);modelo.invalidar('trabajadores');c.renderTable();d=fila('multi').querySelector('details');d.open=true;d.ontoggle();await paso();await paso();assert.equal(campo('multi','REINGRESO').querySelector('[data-padron-ultima]').textContent,'2026-11-02');assert.match(campo('multi','ESTATUS').textContent,/Con reingreso/);
 // Baja revertida: etiqueta existente, sin convertir el antecedente en baja vigente.
 bdd.historial.push({...hist(6,'BAJA_REVERTIDA','2026-11-03','ACTIVO'),reversion_historial_id:'4'});modelo.invalidar('trabajadores');c.renderTable();d=fila('multi').querySelector('details');d.open=true;d.ontoggle();await paso();await paso();assert.match(d.textContent,/Baja revertida/);assert.equal(campo('multi','BAJA').textContent,'—');
 // Más de mil movimientos: reutiliza paginación de lectura, sin límite silencioso de 400.
 bdd.historial=Array.from({length:1005},(_,i)=>{const f=new Date(Date.UTC(2024,1,1+i)).toISOString().slice(0,10);return hist(100+i,'REACTIVACION',f,'ACTIVO');});
 const esperados=new Set(bdd.historial.map(h=>h.fecha_reingreso)).size,lecturasAntes=peticiones.filter(p=>p.tabla==='historial').length;
 modelo.invalidar('trabajadores');c.renderTable();d=fila('multi').querySelector('details');d.open=true;d.ontoggle();await paso();await paso();assert.match(d.querySelector('summary').textContent,new RegExp(esperados+' reingresos'));assert(peticiones.filter(p=>p.tabla==='historial').length>=lecturasAntes+2);
 // Error y reintento, sin convertir fallo en historial vacío.
 errorTabla='historial';d=fila('b').querySelector('details');d.open=true;d.ontoggle();await paso();await paso();assert.match(d.textContent,/No se pudo verificar/);assert(!d.querySelector('summary').textContent.includes('0 reingresos'));
 errorTabla='';$('tbody').onclick({target:d.querySelector('[data-padron-refrescar]')});await paso();await paso();assert.match(d.querySelector('summary').textContent,/0 reingresos/);
 // Cambio de centro mientras llega un historial: descarta respuesta tardía.
 let release;hold=t=>t==='historial'?new Promise(r=>release=r):null;d=fila('baja-multi').querySelector('details');d.open=true;d.ontoggle();await paso();
 const texto=d.textContent;c.OBRA={id:'B',empresa_codigo:'JIRE'};modelo.reset();release();await paso();await paso();hold=null;assert.equal(d.textContent,texto);
 c.OBRA={id:'A',nombre:'CENTRO A',empresa_codigo:'PLATINUM'};modelo.reset();
 // Mismo paginador, 80 filas; la lista no solicita historiales en volumen.
 c.WORKERS=Array.from({length:700},(_,i)=>({...alta,id:'p'+i,no_trab:i+1,estatus:i%3?'ACTIVO':'BAJA'}));
 c.SORT.k='no_trab';c.SORT.asc=true;
 const consultaAntes=peticiones.length,t=performance.now();c.renderTable();const ms=performance.now()-t;
 assert.equal(ids().length,80);assert.match($('worker-count').textContent,/700 visibles/);assert.equal(peticiones.length,consultaAntes);
 const botones=[...$('worker-pagina').querySelectorAll('button')];assert(botones.length>=2);botones.at(-1).onclick();assert.equal(ids().length,80);assert.equal(ids()[0],'p80');
 assert.equal(escrituras.length,0,'Lista, filtros, acciones de consulta e historial no guardan datos');
 assert.equal(JSON.stringify(fuente),antes,'No modifica los objetos originales del padrón');
 // El historial habitual conserva su consulta y su componente operativo.
 const contratos=[];c.sb={from:tabla=>{const pasos=[['tabla',tabla]],q={select:v=>{pasos.push(['select',v]);return q;},eq:(k,v)=>{pasos.push(['eq',k,v]);return q;},order:(k,v)=>{pasos.push(['order',k,v]);return q;},limit:v=>{pasos.push(['limit',v]);return q;},then:resolve=>{contratos.push(pasos);return Promise.resolve(resolve({data:[],error:null}));}};return q;}};
 let pintados=0;c.renderHist=()=>pintados++;c.modal=()=>{};cargar('06-movimientos-historial.js',['openHistorial']);
 await c.openHistorial('multi');assert(contratos.at(-1).some(x=>x[0]==='select'&&x[1]==='*'));assert(contratos.at(-1).some(x=>x[0]==='eq'&&x[1]==='trabajador_id'&&x[2]==='multi'));assert(contratos.at(-1).some(x=>x[0]==='order'&&x[1]==='fecha'&&x[2].ascending===false));assert(contratos.at(-1).some(x=>x[0]==='limit'&&x[1]===400));
 await c.openHistorial(null);assert(!contratos.at(-1).some(x=>x[0]==='eq'));assert(contratos.at(-1).some(x=>x[0]==='limit'&&x[1]===1200));assert.equal(pintados,2);assert.equal(escrituras.length,0);

 console.log('PASS lista única: contexto e IDs, nueve columnas, estados/fechas/IMSS separados, historial cronológico a demanda, permisos/acciones, filtros/orden/paginación, error/reintento/tardíos y cero escrituras. DOM sintético, sin navegador.');
 console.log('RENDER SINTÉTICO: 700 personas, 80 filas visibles, '+ms.toFixed(1)+' ms; no es latencia real de Supabase.');
})();`;
new Function('require','process',harness+escenario)(require,process).catch(e=>{console.error(e.stack);process.exitCode=1;});
