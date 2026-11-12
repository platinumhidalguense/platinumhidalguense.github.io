const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const {parseHTML}=require('linkedom');

const html=fs.readFileSync('frontend/index.template.html','utf8');
const {document,window}=parseHTML(html);
const $=id=>document.getElementById(id);
const tabs=[...document.querySelectorAll('[role=tab]')];
const modulos=[...document.querySelectorAll('[role=tabpanel]')];
const botones=[...document.querySelectorAll('.nav-module button[data-nav-label]')];
const mapa=JSON.parse(fs.readFileSync('docs/navegacion-cinta.json','utf8'));
assert.deepEqual(tabs.map(x=>x.dataset.navTab),['inicio','empleados','expediente','asistencia','nomina','seguridad','pagos','contratistas','reportes','sistema']);
assert.equal(modulos.length,10);
assert.equal(botones.length,63);
assert.equal(new Set(botones.map(b=>b.getAttribute('onclick'))).size,botones.length);
for(const tab of tabs){
 const panel=$(tab.getAttribute('aria-controls'));
 assert(panel&&panel.getAttribute('aria-labelledby')===tab.id);
 assert.equal(panel.hidden,tab.getAttribute('aria-selected')!=='true');
}
for(const a of mapa.acciones){
 const b=botones.find(x=>x.dataset.navLabel===a.etiqueta);
 assert(b,a.etiqueta);assert.equal(b.getAttribute('onclick'),a.destino);assert.equal(b.id||null,a.id);
 const permiso=b.dataset.navPermiso||(b.classList.contains('hide')?'Visibilidad por rol al iniciar sesión':'Guardas de la herramienta');
 assert.equal(permiso,a.permiso);
 assert.equal(b.closest('[data-nav-module]').dataset.navTitle,a.moduloNuevo);
 assert.equal(b.closest('[data-nav-section]').dataset.navSection,a.grupoNuevo);
 assert.equal(b.querySelector('svg').getAttribute('aria-hidden'),'true');
 assert($(b.querySelector('use').getAttribute('href').slice(1)));
}
const original='work/cinta_20261109/base/frontend/index.template.html';
if(fs.existsSync(original)){
 const {document:antes}=parseHTML(fs.readFileSync(original,'utf8'));
 assert.deepEqual([...antes.querySelectorAll('.sb-module [data-nav-label]')].map(x=>x.getAttribute('onclick')).concat('sbGo(openCfdiImport,this,false)').sort(),botones.map(x=>x.getAttribute('onclick')).sort());
 assert.deepEqual([...antes.querySelectorAll('.sb-navigation button')].map(x=>x.getAttribute('onclick')),mapa.contexto);
}
const version=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).version;
assert.equal(document.querySelector('link[href^="assets/platinum-cinta.css?v="]')?.getAttribute('href'),'assets/platinum-cinta.css?v='+version.replaceAll('-',''));
const css=fs.readFileSync('assets/platinum-cinta.css','utf8');
assert.match(css,/prefers-reduced-motion:reduce/);
assert.match(css,/\.nav-tabs\{[^}]*overflow-x:auto/);
assert.match(css,/\.nav-ribbon\{[^}]*overflow-x:auto/);
assert.match(css,/\.wf-workspace\{[^}]*grid-template-columns:minmax\(155px,185px\)/);

const funciones=fs.readFileSync('frontend/modulos/03-navegacion-presentacion.js','utf8').split('/* ============================================================\n   v36 · TEMA')[0];
const sesion=fs.readFileSync('frontend/modulos/01-sesion-centros-sincronizacion.js','utf8');
const migas=acorn.parse(sesion,{ecmaVersion:'latest'}).body.find(x=>x.type==='FunctionDeclaration'&&x.id.name==='renderCrumbs');
const llamadas=[],avisos=[];
let admin=false,editor=false,enCaptura=false,foco,tab='flujo';
Object.defineProperty(document,'activeElement',{get:()=>foco});
window.HTMLElement.prototype.focus=function(){foco=this;};
const c={document,window,$,MutationObserver:window.MutationObserver,
 NAV_STEP:'trabajadores',NAV_BUSY:false,OBRA:{id:'p',nombre:'Obra P'},USER:{id:'u'},VIEW:'trab',EMPRESA_ACTIVA:'PLATINUM',
 VISTAS:{trab:{txt:'Trabajadores'},conciliador:{txt:'Conciliador General'}},razonSocialEmpresa:x=>x==='JIRE'?'Grupo JIRE':'Comercializadora PLATINUM',
 esc:x=>String(x??''),toast:m=>avisos.push(m),esAdmin:()=>admin,puedeEditarTrabajador:()=>editor,
 closeModal2:()=>{$('modals').lastElementChild?.remove();},
 showNavStep:x=>llamadas.push(['paso',x]),
 setView:v=>{c.VIEW=v;llamadas.push(['vista',v]);c.renderCrumbs();},
 conCentroCompleto:f=>{llamadas.push(['carga',c.OBRA.id]);return f();}
};
window.PLATINUM_CONCILIADOR={estaCapturando:()=>enCaptura};
window.PLATINUM_CONCILIADOR_SEMANAL={pestana:()=>tab,cheques(){tab='cheques';c.setView('conciliador');},flujo(){tab='flujo';c.setView('conciliador');}};
vm.createContext(require('./soporte_puestos_vistas.cjs').instalar(c)||c);vm.runInContext(funciones+'\n'+sesion.slice(migas.start,migas.end),c);
const alta=botones.find(b=>b.dataset.navPermiso==='edicion');
const crearCentro=botones.find(b=>b.dataset.navPermiso==='admin');
const proyeccion=botones.find(b=>b.dataset.navLabel==='Proyección de nómina');
const tick=()=>new Promise(r=>setImmediate(r));
const key=(target,k)=>{
 const e=new window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(e,'key',{value:k});
 target.dispatchEvent(e);return e.defaultPrevented;
};
(async()=>{
 c.initSidebar();c.renderCrumbs();
 assert(alta.hidden&&crearCentro.hidden);assert.match($('crumbs').textContent,/Comercializadora PLATINUM.*Obra P.*Empleados/s);
 await c.sbGo(()=>assert.fail('Acción oculta'),alta);
 editor=true;c.navActualizarPermisos();assert(!alta.hidden&&crearCentro.hidden);
 admin=true;c.navActualizarPermisos();assert(!crearCentro.hidden);
 assert.equal(llamadas.length,0);
 const t=$('nav-tab-empleados');t.focus();assert(key(t,'ArrowRight'));assert.equal(foco.id,'nav-tab-expediente');
 assert.equal(foco.getAttribute('tabindex'),'0');assert.equal(t.getAttribute('tabindex'),'-1');
 assert.equal(t.hasAttribute('data-tool-active'),true);
 assert.match($('crumbs').textContent,/Padrón de trabajadores/);
 key(foco,'End');assert.equal(foco.id,'nav-tab-sistema');key(foco,'Home');assert.equal(foco.id,'nav-tab-inicio');
 key(foco,'ArrowLeft');assert.equal(foco.id,'nav-tab-sistema');
 $('nav-tab-contratistas').dispatchEvent(new window.Event('click',{bubbles:true}));
 assert.equal($('nav-tab-contratistas').getAttribute('aria-selected'),'true');
 assert.equal(llamadas.length,0,'Explorar pestañas no ejecuta acciones ni consulta datos');
 const accesos=[...$('nav-panel-contratistas').querySelectorAll('button')];
 const nombres=['openCuadrillas','openContratistas','openEditContratistas','openProyContratista','openResumen','openCtrlConcentradoContratistas'];
 assert.equal(accesos.length,nombres.length);
 for(const n of nombres)c[n]=()=>llamadas.push([n,c.OBRA.id,c.EMPRESA_ACTIVA]);
 for(let i=0;i<accesos.length;i++){
  c.boton=accesos[i];
  vm.runInContext('(function(){'+accesos[i].getAttribute('onclick')+'}).call(boton)',c);
  await tick();assert.deepEqual(llamadas.at(-1),[nombres[i],'p','PLATINUM']);
 }
 await c.navGestionCheques();assert.match($('crumbs').textContent,/Pagos y conciliación.*Gestión de Cheques/s);
 await c.navVista('conciliador');assert.match($('crumbs').textContent,/Conciliación.*Conciliador General/s);
 assert.equal($('nav-tab-contratistas').getAttribute('aria-selected'),'true');
 c.navSeleccionarModulo($('nav-tab-nomina'));proyeccion.focus();
 await c.sbGo(()=>{$('modals').innerHTML='<div class="overlay"><header class="m-head"><h2>Proyección de nómina</h2></header><input value="captura"></div>';},proyeccion);
 assert.equal(foco.tagName,'H2');
 assert.match($('crumbs').textContent,/Cálculo y proyecciones.*Proyección de nómina/s);
 const count=llamadas.length;
 c.navSeleccionarModulo($('nav-tab-contratistas'));
 c.navPaso('empresa');c.navVista('trab');await c.sbGo(()=>assert.fail(),accesos[0]);
 assert.equal(llamadas.length,count);assert.equal($('modals').querySelector('input').value,'captura');
 assert.match(avisos.at(-1),/captura/);
 $('modals').innerHTML='<div class="overlay"><header class="m-head"><h2>Preparación del periodo</h2></header><div id="ro-panel"></div></div>';
 await tick();assert.match($('crumbs').textContent,/Inicio.*Preparación del periodo/s);
 key($('modals'),'Escape');await tick();assert.equal(foco.id,'nav-tab-contratistas');
 assert.match($('crumbs').textContent,/Conciliador General/);assert(c.sidebarVisible());
 key(foco,'Escape');assert(!c.sidebarVisible());assert.equal(foco.id,'burger');
 assert.equal($('burger').getAttribute('aria-expanded'),'false');
 enCaptura=true;c.navPaso('obra');assert.equal(llamadas.length,count);enCaptura=false;
 let release;
 c.conCentroCompleto=f=>new Promise(r=>release=()=>r(f()));
 const tardia=c.sbGo(()=>assert.fail('Callback tardío con otro centro'),proyeccion);
 await tick();
 assert.equal(proyeccion.getAttribute('aria-busy'),'true');
 c.OBRA={id:'j',nombre:'Obra J'};c.EMPRESA_ACTIVA='JIRE';release();await tardia;
 assert(!proyeccion.hasAttribute('aria-busy'));c.renderCrumbs();assert.match($('crumbs').textContent,/Grupo JIRE.*Obra J/s);
 c.navPaso('obra');assert.deepEqual(llamadas.at(-1),['paso','obra']);
 const form=fs.readFileSync('frontend/modulos/05-alta-edicion.js','utf8');
 const nombresForm=new Set(['fld','cuadRefresca','openForm','dibujarFormularioTrabajador','organizarFormularioTrabajador','workerFormPaso']);
 const funcionesForm=acorn.parse(form,{ecmaVersion:'latest'}).body
   .filter(n=>n.type==='FunctionDeclaration'&&nombresForm.has(n.id.name)).map(n=>form.slice(n.start,n.end)).join('\n');
 Object.assign(c,{EMPRESAS:{JIRE:{corto:'JIRE'}},WORKERS:[],CONTRATISTAS:[],DOCS:['INE','NSS'],logoEmpresa:()=>'',empresaDeObra:o=>o.empresa_codigo,
  obrasEmpresa:e=>e==='JIRE'?[{...c.OBRA,empresa_codigo:'JIRE'}]:[],catalogoPuestos:()=>['AYUDANTE'],
  today:()=>'2026-11-09',isoWeek:()=>32,cuadsDe:()=>[],cuentaModo(){},actualizarResumenFormulario(){},
  modal:html=>{$('modals').innerHTML='<div class="overlay"><div class="modal worker-form">'+html+'</div></div>';},
  conCentroCompleto:f=>f()
 });
 c.OBRA={...c.OBRA,empresa_codigo:'JIRE'};
 vm.runInContext(form.match(/^const WF_SECCIONES=.*;$/m)[0]+'\n'+funcionesForm,c);
 c.boton=alta;
 vm.runInContext('(function(){'+alta.getAttribute('onclick')+'}).call(boton)',c);
 await tick();
 assert.equal($('worker-form-body').parentElement.className,'wf-workspace');
 assert.equal($('wf-tab-1').getAttribute('aria-current'),'step');
 assert.equal($('f-obra_id').options[0].value,'j');
 assert(!$('save-btn').hidden&&$('wf-step-2').hidden);
 c.workerFormPaso(2);
 $('f-nombres').value='Persona de ejemplo';
 c.workerFormPaso(1);c.workerFormPaso(8);
 assert.equal($('f-nombres').value,'Persona de ejemplo');
 assert.equal($('wf-tab-8').getAttribute('aria-current'),'step');
 assert(!$('save-btn').hidden&&$('wf-next').hidden);
 assert.equal($('save-btn').getAttribute('onclick'),'saveWorker(null)');
 assert.match($('crumbs').textContent,/Grupo JIRE.*Nueva alta/s);
 console.log('PASS cinta: 63 rutas, seis accesos de contratistas, tres perfiles, teclado, foco, pliegue, contexto y capturas, tardíos, alta por secciones y ambas pestañas financieras.');
})().catch(e=>{console.error(e);process.exitCode=1;});
