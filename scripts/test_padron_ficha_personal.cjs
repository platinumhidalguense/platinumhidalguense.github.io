const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const {parseHTML}=require('linkedom');
const {performance}=require('node:perf_hooks');
const dir='frontend/modulos/';
const template=parseHTML(fs.readFileSync('frontend/index.template.html','utf8')).document;
const {window,document}=parseHTML('<html><body>'+template.getElementById('view-trab').outerHTML+'<div id="modals"></div></body></html>');
let focus;
Object.defineProperty(document,'activeElement',{get:()=>focus});
window.HTMLElement.prototype.focus=function(){focus=this;};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._valor??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option[selected]')?.textContent??this.querySelector('option')?.getAttribute('value')??this.querySelector('option')?.textContent??'';},set(v){this._valor=v;}});
const $=id=>document.getElementById(id),paso=()=>new Promise(r=>setImmediate(r));
const alta={id:'a',obra_id:'A',no_trab:10,nombres:'PERSONA',primer_apellido:'FICTICIA',estatus:'ACTIVO',fecha_alta:'2026-10-01',fecha_baja:null,fecha_reingreso:null,contratista:'CONTRATISTA',puesto:'AYUDANTE',periodo_pago:'SEMANAL',semana_ingreso:'NOMINA 28',turno:'DIURNO',docs:{},updated_at:'2026-11-10T12:00:00Z',eliminado:false};
const w2={...alta,id:'b',no_trab:11,nombres:'SEGUNDA',estatus:'BAJA',fecha_baja:'2026-11-03'};
const futuro={...alta,id:'c',no_trab:12,nombres:'FUTURA',fecha_baja:'2026-11-03',fecha_reingreso:'2026-11-25'};
const traslado={...alta,id:'d',obra_id:'B',no_trab:10,nombres:'TRASLADADA'};
const bdd={trabajadores:[alta,w2,futuro,traslado],documentos:[],pagos:[],cheques:[],cuadrillas:[],historial:[],descuentos:[],vacaciones:[],actas:[],nom035:[]};
let editar=true,hold=null,errorTabla='',cero=false,activa='',guardas=0;
const peticiones=[],escrituras=[],toasts=[];
const result=(tabla,cond,ops,col,op,update,from,to)=>{
 peticiones.push({tabla,ops:[...ops],col});
 if(errorTabla===tabla)return {error:{message:'Fallo local simulado'}};
 if(op){
  escrituras.push({op,update,ops:[...ops]});
  if(cero)return {data:[]};
  return {data:[{...alta,...update,id:op==='insert'?'nuevo':ops.find(p=>p[0]==='id')[1],updated_at:'2026-11-10T15:00:00Z'}]};
 }
 return {data:(bdd[tabla]||[]).filter(r=>cond.every(f=>f(r))).slice(from,to+1)};
};
const sb={from(tabla){
 const cond=[],ops=[];let col='',op,update;
 const q={select(x){col=x;return q;},eq(k,v){ops.push([k,v]);cond.push(r=>r[k]===v);return q;},in(k,vs){cond.push(r=>vs.includes(r[k]));return q;},or(){return q;},order(){return q;},limit(){return q;},
  update(d){op='update';update=d;return q;},insert(d){op='insert';update=d;return q;},
  range(a,b){const pausa=hold?.(tabla,ops);return Promise.resolve(pausa).then(()=>result(tabla,cond,ops,col,op,update,a,b));},
  then(resolve,reject){return q.range(0,999).then(resolve,reject);}};
 return q;
},rpc:async()=>({data:{encontrado:false}})};
class FechaPrueba extends Date {
 constructor(...args){super(...(args.length?args:[2026,10,10,12]));}
 static now(){return new FechaPrueba().getTime();}
}
const c={window,document,$,performance,TextEncoder,Date:FechaPrueba,console,setTimeout,clearTimeout,sb,WORKERS:[alta,w2,futuro].map(({docs,...w})=>({...w})),DOCSX:[],ALTAS_CORTAS:[],CHEQUES:[],PAGOS:[],DESC:[],VAC:[],ACTAS:[],NOM:[],SUELDOSINT:[],CUADS:[],CONTRATISTAS:[],
 OBRA:{id:'A',nombre:'CENTRO A',empresa_codigo:'PLATINUM'},OBRA_CARGA_COMPLETA:false,OBRA_DATOS_ID:'A',OBRA_LECTURA_VERIFICADA:null,OBRAS:[{id:'A',nombre:'CENTRO A',empresa_codigo:'PLATINUM'},{id:'B',nombre:'CENTRO B',empresa_codigo:'JIRE'}],
 USER:{id:'u',email:'prueba@example.test'},EMPRESA_ACTIVA:'PLATINUM',NAV_STEP:'trabajadores',VIEW:'trab',NAV_MENU_ACCION:null,OBRA_APERTURA_HERRAMIENTAS:null,
 SORT:{k:'no_trab',asc:true},DOCS:['INE'],MOTIVOS_BAJA:['RENUNCIA'],EMPRESAS:{PLATINUM:{corto:'PLATINUM'}},
 esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),fmtD:v=>v||'',money:n=>Number(n||0).toFixed(2),fullName:w=>[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' '),today:()=>'2026-11-10',
 esVip:()=>false,esAdmin:()=>false,puedeEditarTrabajador:()=>editar,razonSocialEmpresa:()=> 'EMPRESA FICTICIA',logoEmpresa:()=>'',empresaDeObra:o=>o.empresa_codigo,obrasEmpresa:e=>c.OBRAS.filter(o=>o.empresa_codigo===e),
 catalogoPuestos:()=>['AYUDANTE'],cuadsDe:()=>[],cuadLider:()=>'',docsOk:()=>0,isoWeek:()=>33,weekBounds:()=>['2026-11-09','2026-11-15'],periodoPago:w=>w.periodo_pago,rpDe:()=> 'RP FICTICIO',tieneRPpropio:()=>false,
 saldoVac:()=>({saldo:0,derecho:12,anios:0}),fueraHoy:()=>null,esReciboPdf:()=>false,esCfdiXml:()=>false,normSem:s=>String(s||'').replace(/\D/g,''),bankFromClabe:()=> 'BBVA',
 toast:m=>toasts.push(m),confirm:()=>true,markWrite(){},refreshCounts(){},actualizarFiltrosPadron(){},navPuedeCambiar:()=>true,navSeguirModal(){},
 modal:(h,cl='')=>$('modals').innerHTML='<div class="overlay"><div class="modal '+cl+'">'+h+'</div></div>',
 modal2:(h,cl='')=>$('modals').insertAdjacentHTML('beforeend','<div class="overlay"><div class="modal '+cl+'">'+h+'</div></div>'),
 closeModal:()=>{const volver=window.PLATINUM_FICHA?.antesCerrar();$('modals').innerHTML='';volver?.();},closeModal2:()=>{$('modals').lastElementChild.remove();},
 loadObraData:async()=>{guardas++;return true;},formValidarSesion:async()=>true
};
function cargar(nombre,seleccion){
 const js=fs.readFileSync(dir+nombre,'utf8');
 if(!seleccion){vm.runInContext(js,c);return;}
 const ast=acorn.parse(js,{ecmaVersion:'latest'}).body;
 const codigo=ast.filter(n=>n.type==='FunctionDeclaration'&&seleccion.includes(n.id.name)||n.type==='VariableDeclaration'&&n.declarations.some(d=>seleccion.includes(d.id.name))).map(n=>js.slice(n.start,n.end)).join('\n');
 vm.runInContext(codigo,c);
}
vm.createContext(require('./soporte_puestos_vistas.cjs').instalar(c)||c);
cargar('00-configuracion-utilidades.js',['RX','isoADMY','dmyAiso','edad','fetchAllRows']);
cargar('01-sesion-centros-sincronizacion.js',['conCentroCompleto']);
cargar('03-navegacion-presentacion.js',['sbGo']);
cargar('04-padron-expedientes.js');
cargar('05-alta-edicion.js');
cargar('06-movimientos-historial.js',['doReactivar','saveReingreso']);
c.formValidarSesion=async()=>true;
cargar('64-datos-centro-en-vivo.js');
cargar('69-personal-lecturas.js');
cargar('70-padron-movimientos.js');
cargar('71-ficha-personal.js');
const modelo=window.PLATINUM_PADRON,personal=window.PLATINUM_PERSONAL;
const delMes=(clase,hs,esp=false)=>modelo.filasMovimientos(clase,[alta,w2,futuro,traslado],hs,'2026-11-01','2026-11-10','A','2026-11-10',esp);
const movimientos=[
 {id:1,accion:'BAJA',obra_id:'A',trabajador_id:'a',efectiva:'2026-11-01',fecha:'2026-11-11'},
 {id:2,accion:'BAJA',obra_id:'A',trabajador_id:'a',efectiva:'2026-11-05',fecha:'2026-11-11'},
 {id:3,accion:'BAJA',obra_id:'A',trabajador_id:'d',efectiva:'2026-11-05',fecha:'2026-11-08'},
 {id:4,accion:'BAJA',obra_id:'A',trabajador_id:'b',efectiva:null,fecha:'2026-11-07'},
 {id:5,accion:'REACTIVACION',obra_id:'A',trabajador_id:'a',efectiva:'2026-11-02',fecha:'2026-11-11'},
 {id:6,accion:'REACTIVACION',obra_id:'A',trabajador_id:'a',efectiva:'2026-11-06',fecha:'2026-11-11'}
];
(async()=>{
 assert.deepEqual(Array.from(delMes('bajas',movimientos).filter(m=>m.w.id==='a'),m=>m.fecha),['2026-11-01','2026-11-05']);
 assert(delMes('bajas',movimientos).some(m=>m.w.id==='d'&&m.h.obra_id==='A'));
 assert(delMes('bajas',movimientos).some(m=>m.w.id==='b'&&!m.fecha));
 assert.deepEqual(Array.from(delMes('reingresos',movimientos).filter(m=>m.w.id==='a'),m=>m.fecha),['2026-11-02','2026-11-06']);
 assert.equal(delMes('reingresos',[],true)[0].programado,true);
 assert.equal(modelo.programado(futuro,'2026-11-10'),'Reingreso programado');
 c.renderTable();assert.equal($('tbody').querySelectorAll('[data-padron-id]').length,1);
 assert.equal(document.querySelector('[data-padron-id]').dataset.padronId,'a');
 const boton=document.querySelector('[data-padron-id]'),lista=document.querySelector('.worker-list');lista.scrollTop=96;boton.focus();
 let release;hold=(t,ops)=>t==='trabajadores'&&ops.some(p=>p[0]==='id'&&p[1]==='a')?new Promise(r=>release=r):null;
 const abre=c.openDetail('a',undefined,{origen:boton,ids:['a','b']});
 assert.equal($('ficha-panel-titulo').textContent,'Resumen');assert($('ficha-editar').disabled);
 assert($('ficha-personal').textContent.includes('PERSONA'));assert.equal(guardas,0);
 $('ficha-siguiente').onclick();await paso();await paso();
 assert.match($('ficha-personal-titulo').textContent,/SEGUNDA/);assert(!$('ficha-editar').disabled);
 release();await abre;hold=null;
 assert.match($('ficha-personal-titulo').textContent,/SEGUNDA/);
 assert(!peticiones.some(p=>p.tabla==='documentos'));
 const ir=clave=>$('ficha-personal').querySelector('.ficha-personal-nav').onclick({target:$('ficha-personal').querySelector('[data-ficha-seccion="'+clave+'"]')});
 errorTabla='documentos';ir('expediente');await paso();await paso();
 assert.match($('ficha-panel-cuerpo').textContent,/Fallo local simulado/);
 errorTabla='';$('ficha-panel-cuerpo').querySelector('button').onclick();await paso();await paso();
 assert(peticiones.filter(x=>x.tabla==='documentos').every(p=>p.ops.some(([k,v])=>k==='trabajador_id'&&v==='b')));
 c.closeModal();assert.equal(document.activeElement?.dataset?.padronId,'a');assert.equal(lista.scrollTop,96);
 await c.openDetail('b');await c.openDetail('b');assert.equal(peticiones.filter(x=>x.tabla==='trabajadores'&&x.ops.some(([k,v])=>k==='id'&&v==='b')).length,1,'Reapertura reutiliza la fila verificada de la sesión');
 c.closeModal();
 c.doReactivar('b');$('reingreso-fecha').value='2026-11-25';
 cero=true;await c.saveReingreso();assert($('reingreso-guardar'));assert.match(toasts.at(-1),/ficha cambió/);
 cero=false;await c.saveReingreso();assert.equal(guardas,0);
 const rea=escrituras.at(-1);assert.equal(rea.update.estatus,'ACTIVO');assert.equal(rea.update.fecha_reingreso,'2026-11-25');assert(rea.ops.some(p=>p[0]==='updated_at'));
 c.openForm(null);assert($('worker-form-body'));await paso();await paso();assert.equal(guardas,0);
 assert.equal($('worker-form-body').querySelectorAll('.wf-panel').length,8);
 $('f-nombres').value='ALTA FICTICIA';$('f-curp').value='FICT000111MMCRRSA1';
 c.curpAssist();assert.equal($('f-fecha_nacimiento').value,'11/01/2000');assert.equal($('f-rfc').value,'FICT000111');
 assert.match($('h-rfc').textContent,/homoclave/);assert.match($('wf-edad').textContent,/\d+ años/);
 $('f-edo_nacimiento').value='QUERETARO';$('f-edo_nacimiento').removeAttribute('data-default');$('f-rfc').value='FICT000111AB1';
 c.curpAssist();assert.equal($('f-edo_nacimiento').value,'QUERETARO');assert.match($('h-edo_nacimiento').textContent,/Usar el de la CURP/);assert.equal($('f-rfc').value,'FICT000111AB1');
 assert.equal(vm.runInContext("edad('2000-11-11',new Date(2026,10,10,12))",c),25);
 assert.equal(vm.runInContext("edad('2000-11-11',new Date(2026,10,11,12))",c),26);
 c.workerFormPaso(3);c.openDireccionAsistente();
 for(const [k,v] of Object.entries({calle:'CALLE TEST',ext:'10',int:'B',col:'COLONIA PRUEBA',loc:'LOCALIDAD',cp:'01234',mun:'MUNICIPIO',edo:'HIDALGO'}))$('da-'+k).value=v;
 const direccion=c.dirTexto();assert.match(direccion,/NUM\. 10 INTERIOR B, COLONIA PRUEBA, C\.P\. 01234/);c.aplicarDireccion();assert.equal($('f-direccion').value,direccion);assert.equal($('f-cp').value,'01234');
 c.workerFormPaso(8);assert.equal($('f-nombres').value,'ALTA FICTICIA');$('f-nombres').value='';await c.saveWorker(null);
 assert.equal($('worker-form-body').dataset.step,'1');assert.equal(document.activeElement?.id,'f-nombres');assert.equal(escrituras.filter(x=>x.op==='insert').length,0);
 $('f-nombres').value='ALTA FICTICIA';await c.saveWorker(null);
 assert.equal(escrituras.at(-1).update.estatus,'PENDIENTE');assert.equal(escrituras.at(-1).update.cp,'01234');assert.match($('modals').textContent,/Abrir ficha/);
 c.closeModal();c.openForm(null);await paso();await paso();
 for(const [k,v] of Object.entries({primer_apellido:'PRUEBA',nombres:'ALTA COMPLETA',contratista:'CONTRATISTA',puesto:'AYUDANTE',sal_semanal:'2400',curp:'FICT000111MMCRRSA2',rfc:'FICT000111AB2',nss:'11111111111',telefono:'5555555555',correo:'prueba@example.test'}))$('f-'+k).value=v;
 await c.saveWorker(null);assert.equal(escrituras.at(-1).update.estatus,'ACTIVO');assert.equal(guardas,0);
 c.closeModal();editar=false;c.openForm(null);assert(!$('worker-form-body'));
 let terminarLectura,abiertas=[];
 c.loadObraData=()=>new Promise(r=>terminarLectura=r);
 const pesada=c.sbGo(function proyeccion(){abiertas.push('proyección anterior');});
 await paso();
 await c.sbGo(function openResumen(){abiertas.push('resumen directo');});
 terminarLectura(true);await pesada;
 assert.deepEqual(abiertas,['resumen directo'],'El clic vigente funciona mientras se verifica el paquete y una respuesta anterior no abre su modal');
 assert(personal.metricas().every(m=>!JSON.stringify(m).includes('PERSONA')));
 console.log('PASS padrón y ficha: episodios y traslado por ID, reingreso futuro, apertura sin paquete, vecinos y respuesta tardía, error de sección, foco/scroll, concurrencia, alta completa/pendiente, CURP/RFC, edad y domicilio con 01234.');
})().catch(e=>{console.error(e.stack,toasts);process.exitCode=1;});
