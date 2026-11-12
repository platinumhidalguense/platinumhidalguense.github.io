const assert=require('node:assert/strict');
const A=require('../frontend/modulos/72-aguinaldo-nucleo.js');

let comprobaciones=0;
function igual(actual,esperado,motivo){assert.deepEqual(actual,esperado,motivo);comprobaciones++;}
function cumple(condicion,motivo){assert.ok(condicion,motivo);comprobaciones++;}
const ficha=(cambios={})=>({id:'persona-ficticia',estatus:'ACTIVO',fecha_alta:'2026-04-20',
 fecha_baja:'2026-08-03',fecha_reingreso:'2026-08-31',...cambios});
const movimiento=(id,accion,fecha,despues,antes)=>({id,accion,fecha,datos_despues:despues,...(antes?{datos_antes:antes}:{})});
const baja=(id,fecha,efectiva)=>movimiento(id,'BAJA',fecha,{fecha_baja:efectiva});
const reingreso=(id,fecha,efectiva)=>movimiento(id,'REACTIVACION',fecha,{fecha_reingreso:efectiva});
const correccion=(id,fecha,antes,despues)=>movimiento(id,'MODIFICACION',fecha,{fecha_reingreso:despues},{fecha_reingreso:antes});
function reconstruir(w,movs){
 const original=structuredClone({w,movs});
 const eventos=A.eventosCorregidos(w,movs);
 const resultado=A.tramosServicio(w,eventos);
 igual({w,movs},original,'Reconstruir conserva la ficha y el historial antes/después recibidos');
 return {eventos,...resultado};
}
function fechas(tramos){return tramos.map(({desde,hasta})=>[desde,hasta]);}

// Patrón auditado de reactivación corregida mediante una modificación ordinaria.
for(const empresa_codigo of ['PLATINUM','JIRE']){
 const w=ficha({empresa_codigo});
 const movs=[
  baja('b1','2026-08-03T12:00:00Z','2026-08-03'),
  reingreso('r1','2026-09-01T10:00:00Z','2026-09-01'),
  correccion('c1','2026-09-01T10:00:10Z','2026-09-01','2026-08-31')
 ];
 const r=reconstruir(w,movs);
 igual(r.eventos.filter(e=>e.tipo==='REINGRESO').map(e=>e.fecha),['2026-08-31'],empresa_codigo+' utiliza un solo reingreso corregido');
 igual(fechas(r.tramos),[['2026-04-20','2026-08-03'],['2026-08-31',null]],'La corrección preserva la baja y el hueco de servicio');
 cumple(!r.avisos.some(a=>a.codigo==='BAJA_INTERMEDIA_FALTANTE'),'La corrección no produce una baja intermedia ficticia');
 igual(r.eventos.correcciones.map(c=>[c.id,c.fecha_anterior,c.fecha_corregida]),[['c1','2026-09-01','2026-08-31']],'La lectura conserva el origen y las dos fechas');
 cumple(A.seleccionar(r.tramos,{modo:'VINCULO',desde:'2026-01-01',hasta:'2026-11-11',fecha_estatus:'2026-11-11',estatus:'ACTIVOS_HOY'}).incluido,'La persona reingresada satisface el filtro de activos');
}

// La fecha de captura ordena las correcciones aunque el arreglo llegue invertido.
{
 const movs=[baja('b1','2026-08-03T12:00:00Z','2026-08-03'),
  reingreso('r1','2026-09-01T10:00:00Z','2026-09-01'),
  correccion('c1','2026-09-01T10:00:10Z','2026-09-01','2026-08-31'),
  correccion('c2','2026-09-01T10:00:20Z','2026-08-31','2026-08-30'),
  correccion('c3','2026-09-01T10:00:30Z','2026-08-30','2026-08-29')].reverse();
 const r=reconstruir(ficha({fecha_reingreso:'2026-08-29'}),movs);
 igual(r.eventos.filter(e=>e.tipo==='REINGRESO').length,1,'Tres correcciones forman una sola cadena de reingreso');
 igual(r.eventos.correcciones.map(c=>[c.id,c.fecha_anterior,c.fecha_corregida]),[
  ['c1','2026-09-01','2026-08-31'],['c2','2026-08-31','2026-08-30'],['c3','2026-08-30','2026-08-29']
 ],'Cada eslabón conserva su antecedente real');
 igual(r.eventos.filter(e=>e.tipo==='REINGRESO')[0].correcciones.length,3,'Las correcciones permanecen ligadas al evento original');
 cumple(!r.avisos.some(a=>a.bloquea),'Una cadena documentada y consistente está disponible para el cálculo');
}

// Capturas de una misma transacción con identificadores bigint.
{
 const marca='2026-09-01T10:00:00Z';
 const r=reconstruir(ficha({fecha_reingreso:'2026-08-30'}),[
  baja(8,'2026-08-03T12:00:00Z','2026-08-03'),
  reingreso(9,marca,'2026-09-01'),
  correccion(10,marca,'2026-09-01','2026-08-31'),
  correccion(11,marca,'2026-08-31','2026-08-30')
 ]);
 igual(r.eventos.filter(e=>e.tipo==='REINGRESO').map(e=>e.fecha),['2026-08-30'],'IDs bigint de igual timestamp conservan el orden 9, 10, 11');
 cumple(!r.avisos.some(a=>a.bloquea||a.codigo==='BAJA_INTERMEDIA_FALTANTE'),'Una cadena de la misma transacción no fabrica conflictos por orden textual');
}

// Identificadores bigint mayores que el entero seguro de JavaScript.
{
 const marca='2026-09-01T10:00:00Z';
 const r=reconstruir(ficha(),[
  correccion('9007199254740993',marca,'2026-09-01','2026-08-31'),
  reingreso('9007199254740992',marca,'2026-09-01'),
  baja('1','2026-08-03T12:00:00Z','2026-08-03')
 ]);
 igual(r.eventos.filter(e=>e.tipo==='REINGRESO').map(e=>e.fecha),['2026-08-31'],'El orden de ids bigint conserva precisión más allá de MAX_SAFE_INTEGER');
 cumple(!r.avisos.some(a=>a.bloquea),'IDs de 64 bits mantienen una cadena documentada válida');
}

// Ciclos reales e intervalos sin servicio reconocidos.
{
 const r=reconstruir(ficha({fecha_baja:'2026-10-10',fecha_reingreso:'2026-10-20'}),[
  baja('b1','2026-06-01T12:00:00Z','2026-06-01'),reingreso('r1','2026-06-15T12:00:00Z','2026-06-15'),
  baja('b2','2026-08-03T12:00:00Z','2026-08-03'),reingreso('r2','2026-09-01T10:00:00Z','2026-09-01'),
  correccion('c2','2026-09-01T10:00:10Z','2026-09-01','2026-08-31'),
  baja('b3','2026-10-10T12:00:00Z','2026-10-10'),reingreso('r3','2026-10-20T12:00:00Z','2026-10-20')
 ]);
 igual(fechas(r.tramos),[['2026-04-20','2026-06-01'],['2026-06-15','2026-08-03'],['2026-08-31','2026-10-10'],['2026-10-20',null]],'Se conservan los cuatro ciclos reales');
 for(const fecha of ['2026-06-02','2026-06-14','2026-08-04','2026-08-30','2026-10-11','2026-10-19']){
  igual(A.activoEnFecha(r.tramos,fecha),false,'El hueco de servicio excluye '+fecha);
 }
 const d=A.calcularDerecho({ejercicio:2026,salario_base:329,dias_pactados:15,corte:'2026-11-11',tramos:r.tramos,ausencias:{}});
 igual(d.dias_computables,157,'El derecho acumula los días de los cuatro ciclos y sus huecos');
 cumple(!r.avisos.some(a=>a.bloquea),'Los ciclos consistentes están disponibles para calcular');
}

// Compatibilidad con la corrección explícita de reingreso ya existente.
{
 const r=reconstruir(ficha(),[
  baja('b1','2026-08-03T12:00:00Z','2026-08-03'),
  reingreso('r1','2026-09-01T10:00:00Z','2026-09-01'),
  {id:'correccion-legada',accion:'CORRECCION_REINGRESO',fecha:'2026-09-01T10:00:10Z',fecha_reingreso:'2026-08-31'}
 ]);
 igual(r.eventos.filter(e=>e.tipo==='REINGRESO').map(e=>e.fecha),['2026-08-31'],'El contrato legado de corrección explícita conserva su efecto');
 igual(r.eventos.correcciones[0].fecha_anterior,'2026-09-01','La corrección legada identifica la fecha sustituida');
}

// Contradicción de antecedente y fecha civil inválida, con la referencia del movimiento.
{
 const r=reconstruir(ficha(),[baja('b1','2026-08-03T12:00:00Z','2026-08-03'),
  reingreso('r1','2026-09-01T10:00:00Z','2026-09-01'),
  correccion('antecedente-inexistente','2026-09-01T10:00:10Z','2026-09-02','2026-08-31')]);
 igual(r.eventos.filter(e=>e.tipo==='REINGRESO').map(e=>e.fecha),['2026-09-01'],'Un antecedente contradictorio no fabrica otro evento del historial');
 cumple(r.avisos.some(a=>a.codigo==='CORRECCION_SIN_ANTECEDENTE'&&a.bloquea&&a.texto.includes('antecedente-inexistente')),'El conflicto identifica su corrección de origen');
}
{
 const r=reconstruir(ficha({fecha_reingreso:'2026-09-01'}),[
  baja('b1','2026-08-03T12:00:00Z','2026-08-03'),reingreso('r1','2026-09-01T10:00:00Z','2026-09-01'),
  correccion('fecha-invalida','2026-09-01T10:00:10Z','2026-09-01','2026-02-30')]);
 igual(r.eventos.filter(e=>e.tipo==='REINGRESO').map(e=>e.fecha),['2026-09-01'],'La fecha civil inválida no altera el evento reconocido');
 cumple(r.avisos.some(a=>a.codigo==='FECHA_CORRECCION_INVALIDA'&&a.bloquea&&a.texto.includes('fecha-invalida')),'El bloqueo de fecha conserva el movimiento causante');
}

// Anulación explícita de una reactivación errónea.
{
 const r=reconstruir(ficha({estatus:'BAJA',fecha_reingreso:null}),[
  baja('b1','2026-08-03T12:00:00Z','2026-08-03'),reingreso('r1','2026-09-01T10:00:00Z','2026-09-01'),
  correccion('anular','2026-09-01T10:00:10Z','2026-09-01',null)]);
 igual(r.eventos.filter(e=>e.tipo==='REINGRESO').length,0,'La reactivación anulada sale de la lectura efectiva');
 igual(r.eventos.correcciones.map(c=>[c.fecha_anterior,c.fecha_corregida]),[['2026-09-01',null]],'La anulación conserva su trazabilidad');
 igual(fechas(r.tramos),[['2026-04-20','2026-08-03']],'La baja original delimita el servicio tras la anulación');
 igual(A.activoEnFecha(r.tramos,'2026-09-20'),false,'La anulación no deja un vínculo abierto');
}

// Un reingreso futuro y una baja vigente tienen estados efectivos distintos.
{
 const r=reconstruir(ficha({fecha_reingreso:'2026-11-15'}),[
  baja('b1','2026-08-03T12:00:00Z','2026-08-03'),reingreso('r1','2026-11-11T12:00:00Z','2026-11-15')]);
 const s=A.seleccionar(r.tramos,{modo:'VINCULO',desde:'2026-01-01',hasta:'2026-11-11',fecha_estatus:'2026-11-11',estatus:'ACTIVOS_HOY'});
 igual(s.incluido,false,'El ingreso futuro no se considera activo hoy');
 cumple(s.programado&&s.detalle.includes('Programado'),'El motivo de filtro describe el ingreso programado');
 igual(A.activoEnFecha(r.tramos,'2026-11-15'),true,'El vínculo futuro inicia en la fecha efectiva');
}
{
 const w=ficha({estatus:'BAJA',fecha_baja:'2026-11-04'});
 const r=reconstruir(w,[baja('b1','2026-08-03T12:00:00Z','2026-08-03'),
  reingreso('r1','2026-09-01T10:00:00Z','2026-09-01'),correccion('c1','2026-09-01T10:00:10Z','2026-09-01','2026-08-31'),
  baja('b2','2026-11-04T12:00:00Z','2026-11-04')]);
 igual(A.activoEnFecha(r.tramos,'2026-11-11'),false,'La baja vigente cierra el último ciclo');
 const filtro={modo:'VINCULO',desde:'2026-01-01',hasta:'2026-11-11',fecha_estatus:'2026-11-11'};
 igual(A.seleccionar(r.tramos,{...filtro,estatus:'ACTIVOS_HOY'}).incluido,false,'La baja queda fuera de activos');
 igual(A.seleccionar(r.tramos,{...filtro,estatus:'BAJAS_CON_SALDO'}).incluido,true,'La baja está disponible para revisar su saldo mediante el filtro previsto');
}

// La ficha y el historial discrepantes quedan identificados, sin autorizar una fecha por inferencia.
{
 const r=reconstruir(ficha(),[baja('b1','2026-08-03T12:00:00Z','2026-08-03'),
  reingreso('r1','2026-09-01T10:00:00Z','2026-09-01')]);
 cumple(r.avisos.some(a=>a.codigo==='REINGRESO_FICHA_DIFIERE'&&a.bloquea&&a.texto.includes('r1')&&a.texto.includes('2026-08-31')),'El conflicto señala evento y fecha de ficha');
}

// Una reversión explícita no produce un nuevo ciclo ni mantiene la baja original.
{
 const wb=ficha({estatus:'ACTIVO',fecha_reingreso:'2026-08-31',fecha_baja:'2026-08-03'});
 const e=baja('err','2026-11-04T12:00:00Z','2026-11-04');
 const r=reconstruir(wb,[baja('prev','2026-08-03T12:00:00Z','2026-08-03'),reingreso('r','2026-08-31T12:00:00Z','2026-08-31'),e,
 {id:'rev',accion:'BAJA_REVERTIDA',fecha:'2026-11-05T12:00:00Z',datos_antes:{estatus:'BAJA',fecha_baja:'2026-11-04'},datos_despues:{estatus:'ACTIVO',fecha_baja:'2026-08-03',reversion_historial_id:'err'}}]);
 igual(A.activoEnFecha(r.tramos,'2026-11-11'),true,'La baja revertida no cierra el ciclo vigente');
 igual(r.eventos.filter(x=>x.tipo==='REINGRESO').length,1,'Sólo conserva el reingreso legítimo');
}

console.log('PASS revisión independiente del núcleo de aguinaldo: '+comprobaciones+' comprobaciones de correcciones, ciclos, fechas, trazabilidad y selección efectiva.');
