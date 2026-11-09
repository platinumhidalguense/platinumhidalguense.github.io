const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const {parseHTML}=require('linkedom');

const plantilla=fs.readFileSync('frontend/index.template.html','utf8');
const menu=plantilla.match(/<nav class="sb-nav"[\s\S]*?<\/nav>/)[0];
const {document,window}=parseHTML('<html><body><div id="scr-app"><aside id="sidebar">'+menu+'</aside><button id="burger"></button><div id="sb-scrim"></div><nav id="crumbs"></nav><div id="modals"></div></div></body></html>');
const $=id=>document.getElementById(id);
const modulos=[...document.querySelectorAll('[data-nav-module]')];
assert.deepEqual(modulos.map(x=>x.dataset.navModule),['inicio','empleados','asistencia','nomina','seguridad','pagos','conciliacion','rrhh','reportes','administracion']);
assert(modulos.every(x=>x.getAttribute('name')==='platinum-modulos'&&x.querySelector('[data-nav-section] [data-nav-label]')));
const botones=[...document.querySelectorAll('.sb-module button')];
assert.equal(botones.length,62);
assert.equal(new Set(botones.map(b=>b.getAttribute('onclick'))).size,botones.length);
const original='work/modular_20261108/index.template.antes.html';
if(fs.existsSync(original)){
 const anterior=fs.readFileSync(original,'utf8').match(/<nav class="sb-nav"[\s\S]*?<\/nav>/)[0];
 for(const [,accion] of anterior.matchAll(/onclick="([^"]+)"/g)){
  const destino=accion.startsWith('sbGo(')?accion.slice(0,-1)+',this)':accion.replace(/^setView/,'navVista').replace(/^showNavStep/,'navPaso').replace(/^openAvisosInfonavit\(\)$/,'sbGo(()=>openAvisosInfonavit(),this,false)');
  assert([...document.querySelectorAll('.sb-nav button')].some(b=>b.getAttribute('onclick')===destino),accion);
 }
}

function extraer(path,nombres){
 const s=fs.readFileSync(path,'utf8');
 return acorn.parse(s,{ecmaVersion:'latest'}).body
  .filter(n=>n.type==='FunctionDeclaration'&&nombres.includes(n.id.name))
  .map(n=>s.slice(n.start,n.end)).join('\n');
}
const llamadas=[],avisos=[];
let admin=false,editor=false,enCaptura=false;
const c={document,window,$,MutationObserver:window.MutationObserver,
 NAV_STEP:'trabajadores',NAV_BUSY:false,OBRA:{id:'p',nombre:'Obra P'},USER:{id:'u'},VIEW:'trab',
 EMPRESA_ACTIVA:'PLATINUM',EMPRESAS:{PLATINUM:{corto:'PLATINUM'},JIRE:{corto:'JIRE'}},VISTAS:{trab:{txt:'Trabajadores'},conciliador:{txt:'Conciliador General'}},
 esc:x=>String(x??''),toast:m=>avisos.push(m),
 esAdmin:()=>admin,puedeEditarTrabajador:()=>editor,
 showNavStep:x=>llamadas.push(['paso',x]),setView:v=>{c.VIEW=v;llamadas.push(['vista',v]);c.renderCrumbs();},
 conCentroCompleto:f=>{llamadas.push(['carga',c.OBRA.id]);return f();}
};
window.PLATINUM_CONCILIADOR={estaCapturando:()=>enCaptura};
let tab='flujo';
window.PLATINUM_CONCILIADOR_SEMANAL={pestana:()=>tab,cheques(){tab='cheques';c.setView('conciliador');},flujo(){tab='flujo';c.setView('conciliador');}};
vm.createContext(c);
vm.runInContext('let NAV_MENU_ACCION=null,NAV_MENU_MODAL=null;\n'+extraer('frontend/modulos/03-navegacion-presentacion.js',['sidebarVisible','toggleSidebar','navActualizarPermisos','navPuedeCambiar','navPaso','navVista','navGestionCheques','navRutaActual','navSeguirModal','sbGo'])+'\n'+extraer('frontend/modulos/01-sesion-centros-sincronizacion.js',['renderCrumbs']),c);
const alta=botones.find(b=>b.dataset.navPermiso==='edicion');
const crearCentro=botones.find(b=>b.dataset.navPermiso==='admin');
const btn=botones.find(b=>b.dataset.navLabel==='Proyección de nómina');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 c.toggleSidebar(true);
 assert(alta.hidden&&crearCentro.hidden);
 editor=true;c.navActualizarPermisos();assert(!alta.hidden&&crearCentro.hidden);
 admin=true;c.navActualizarPermisos();assert(!crearCentro.hidden);
 assert.equal(llamadas.length,0,'Abrir o filtrar menú no consulta ni ejecuta operaciones');
 c.renderCrumbs();
 assert.match($('crumbs').innerHTML,/PLATINUM.*Obra P.*Empleados y Expedientes/s);
 assert.equal($('vb-trab').getAttribute('aria-current'),'location');
 await c.navGestionCheques();assert.match($('crumbs').innerHTML,/Pagos, Bancos y Cheques.*Gestión de Cheques/s);
 assert.equal($('vb-cheques').getAttribute('aria-current'),'location');
 await c.navVista('conciliador');assert.match($('crumbs').innerHTML,/Conciliación y Comprobantes/);
 const apertura=await c.sbGo(()=>{$('modals').innerHTML='<div class="overlay"><input value="captura"></div>';},btn);
 assert.equal(apertura,undefined);assert.match($('crumbs').innerHTML,/Cálculo y proyecciones.*Proyección de nómina/s);
 const count=llamadas.length;
 c.navPaso('empresa');c.navVista('trab');await c.sbGo(()=>assert.fail(),btn);
 assert.equal(llamadas.length,count);assert.equal($('modals').querySelector('input').value,'captura');
 assert.match(avisos.at(-1),/captura/);
 $('modals').innerHTML='';await tick();assert.match($('crumbs').innerHTML,/Conciliación y Comprobantes/);
 enCaptura=true;c.navPaso('obra');assert.equal(llamadas.length,count);enCaptura=false;
 let resolve;const pend=c.sbGo(()=>new Promise(r=>resolve=r),btn);await tick();
 c.navPaso('obra');assert.equal(llamadas.length,count+1);resolve();await pend;
 assert.match($('crumbs').innerHTML,/Conciliación y Comprobantes/);
 const tardia=c.sbGo(()=>assert.fail('No abrir otra obra desde la captura anterior'),btn);
 c.OBRA={id:'j',nombre:'Obra J'};c.EMPRESA_ACTIVA='JIRE';await tardia;
 c.renderCrumbs();assert.match($('crumbs').innerHTML,/JIRE.*Obra J/s);
 c.navPaso('obra');assert.deepEqual(llamadas.at(-1),['paso','obra']);
 console.log('PASS navegación modular: diez módulos, 62 entradas, accesos anteriores, tres perfiles, empresa/centro, rutas, captura, carga bajo demanda y una sola vista financiera.');
})().catch(e=>{console.error(e);process.exitCode=1;});
