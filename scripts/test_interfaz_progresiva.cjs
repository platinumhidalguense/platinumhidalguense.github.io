const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const html=require('./fuente_frontend.cjs').html();
const fn=name=>{const m=html.match(new RegExp('(?:async )?function '+name+'\\([^\\n]*\\)[^{]*\\{[\\s\\S]*?\\n\\}'));assert(m,'Función '+name);return m[0];};
class Text{constructor(text){this.nodeType=3;this.textContent=text;}remove(){if(this.parentNode)this.parentNode.childNodes=this.parentNode.childNodes.filter(x=>x!==this);}cloneNode(){return new Text(this.textContent);}}
class El{
  constructor(tag='div'){this.tagName=tag;this.nodeType=1;this.childNodes=[];this.attrs={};this.dataset={};this.value='';this.innerHTML='';this.classes=new Set();this.classList={contains:c=>this.classes.has(c),add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),toggle:(c,on)=>{if(on===undefined)on=!this.classes.has(c);on?this.classes.add(c):this.classes.delete(c);}};}
  set className(v){this.classes=new Set(v.split(' '));}get className(){return [...this.classes].join(' ');}get children(){return this.childNodes.filter(x=>x.nodeType===1);}get textContent(){return this.childNodes.map(x=>x.textContent).join('');}set textContent(v){this.childNodes=[new Text(v)];this.childNodes[0].parentNode=this;}
  appendChild(n){n.remove();this.childNodes.push(n);n.parentNode=this;return n;}remove(){if(this.parentNode)this.parentNode.childNodes=this.parentNode.childNodes.filter(x=>x!==this);this.parentNode=null;}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}focus(){this.focused=true;}
  querySelectorAll(tag){return this.children.flatMap(x=>[...(x.tagName===tag?[x]:[]),...x.querySelectorAll(tag)]);}cloneNode(deep){const x=new El(this.tagName);x.className=this.className;x.id=this.id;if(deep)this.childNodes.forEach(n=>x.appendChild(n.cloneNode(true)));return x;}
}
const ids=new Map(),$=id=>{if(!ids.has(id))ids.set(id,new El());return ids.get(id);};
const c={console,Date,Math,Number,String,Set,Map,parseInt,$,window:{scrollTo(){},_NAVIDS:[]},document:{querySelector:()=>null,querySelectorAll:()=>[],createElement:t=>new El(t)},localStorage:{setItem(){},getItem(){return null;}},toast(){},USER:{email:'test@example.test'},WORKERS:[],DOCSX:[],ALTAS_CORTAS:[],CHEQUES:[],DESC:[],CUADS:[],ACTAS:[],NOM:[],VIEW:'trab',SORT:{k:'no_trab',asc:true},OBRA:null,OBRAS:[{id:'p',nombre:'PLATINUM',empresa_codigo:'PLATINUM'},{id:'j',nombre:'JIRE',empresa_codigo:'JIRE'}],EMPRESA_ACTIVA:'PLATINUM',EMPRESAS:{PLATINUM:{corto:'PLATINUM',nombre:'Comercializadora PLATINUM'},JIRE:{corto:'JIRE',nombre:'Grupo JIRE'}},VISTAS:{trab:{txt:'Trabajadores',ic:'👷'},chq:{txt:'Cheques',ic:'🧾'}},NAV_STEP:'empresa',NAV_BUSY:false,esAdmin:()=>false,esVip:()=>false,empresaDeObra:o=>o.empresa_codigo,obrasEmpresa:code=>c.OBRAS.filter(o=>o.empresa_codigo===(code||c.EMPRESA_ACTIVA)),esc:v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),fullName:w=>[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' '),fmtD:v=>v||'',money:v=>Number(v||0).toFixed(2),renderStats(){},renderPagosView(){},auCargar(){},cpCargar(){},renderObraBar(){},pintarLogo(){},refreshCounts(){}};
Object.assign(c,{SOLO_CONTRATOS:false,puedeEditarTrabajador:()=>false,repintarInstantaneaObra(){},pintarVistaObra(v){if(v==='trab')c.renderTable();}});vm.createContext(require('./soporte_puestos_vistas.cjs').instalar(c)||c);
c.navRutaActual=()=>null;
c.razonSocialEmpresa=code=>c.EMPRESAS[code].nombre;
c.navObservarModal=()=>{};
['sidebarVisible','toggleSidebar','navActualizarPermisos','initSidebar','showNavStep','resetWorkerFilters','selectEmpresa','selectObra','setView','renderCrumbs','fechaAcuseISO','indiceAcusesIMSS','estadoAcuseIMSS','altaImssPendiente','altaImssPresentada','marcadorAcuseIMSS','marcadoresIMSS','baseFiltered','renderTable','fichaResumenHTML','openDetail','enterApp'].forEach(n=>vm.runInContext(fn(n),c));
async function main(){
  c.sb={from:()=>({select:()=>({order:async()=>({data:c.OBRAS})})})};Object.assign(c,{cargaPermisos:async()=>{},iaMostrarFab(){},loadConfig:async()=>{},chequearVersion(){},chequearVersionEnVivo(){},setInterval(){},cargarContratistas:async()=>{},startRealtime(){}});
  let loads=0;c.loadPadronRapido=async()=>{loads++;return true;};c.activarPadronProgramado=async()=>{};c.OBRA_DATOS_ID=null;c.OBRA_CARGA_COMPLETA=true;
  await c.enterApp();assert.equal(c.NAV_STEP,'empresa');assert.equal(loads,0,'No abre una obra automáticamente');assert.equal($('scr-app').attrs['data-nav'],'empresa');
  await c.selectEmpresa('JIRE');assert.equal(c.NAV_STEP,'obra');assert.equal(loads,0);assert.equal(c.EMPRESA_ACTIVA,'JIRE');
  await c.selectObra('j');assert.equal(c.NAV_STEP,'trabajadores');assert.equal(c.OBRA.id,'j');assert.equal(loads,1);assert.equal(c.VIEW,'trab');assert(c.sidebarVisible());
  c.toggleSidebar(false);assert(!c.sidebarVisible());assert.equal($('burger').attrs['aria-expanded'],'false');c.setView('chq');assert(!c.sidebarVisible());c.showNavStep('empresa');assert.equal(c.NAV_STEP,'empresa');
  await c.selectEmpresa('PLATINUM');c.loadPadronRapido=async()=>false;await c.selectObra('p');assert.equal(c.NAV_STEP,'obra');assert.equal(c.OBRA.id,'j','Carga fallida no expone datos de otra obra');assert.equal(c.NAV_BUSY,false);
  let release;c.loadPadronRapido=()=>new Promise(r=>release=r);const pending=c.selectObra('p');await c.selectObra('j');assert.equal(c.OBRA.id,'p','Bloquea selecciones concurrentes');release(true);await pending;
  const w={id:'w',no_trab:10,primer_apellido:'PRUEBA',nombres:'UNO',estatus:'ACTIVO',fecha_alta:'2026-09-01',contratista:'MG',puesto:'ALBAÑIL',sd:350,sdi:370,sal_semanal:2400,cuenta:'SECRET_ACCOUNT',telefono:'SECRET_PHONE',docs:{}};
  c.DOCSX=[];assert.match(c.marcadoresIMSS(w),/Alta pendiente/);assert.doesNotMatch(c.marcadoresIMSS(w),/Baja/);
  c.DOCSX=[{trabajador_id:'other',categoria:'ACUSE_IMSS',subtipo:'ALTA',fecha_doc:'2026-09-01'}];assert.match(c.marcadoresIMSS(w),/Alta pendiente/);
  c.DOCSX=[{trabajador_id:'w',categoria:'ACUSE_IMSS',subtipo:'ALTA',fecha_doc:'2026-09-01'}];assert.match(c.marcadoresIMSS(w),/Alta con acuse/);
  assert.match(c.marcadoresIMSS({...w,fecha_reingreso:'2026-10-01'}),/Reingreso pendiente/,'No reutiliza un acuse anterior');
  c.DOCSX=[{trabajador_id:'w',categoria:'ACUSE_IMSS',subtipo:'ALTA',created_at:'2026-10-07'}];assert.match(c.marcadoresIMSS(w),/por cotejar/,'La fecha de subida no prueba el movimiento');
  c.DOCSX=[{trabajador_id:'w',categoria:'ACUSE_IMSS',subtipo:'BAJA',fecha_doc:'2026-10-01',anulado:true}];assert.match(c.marcadoresIMSS({...w,estatus:'BAJA',fecha_baja:'2026-10-01'}),/Baja pendiente/);
  c.DOCSX[0].anulado=false;assert.match(c.marcadoresIMSS({...w,estatus:'BAJA',fecha_baja:'2026-10-01'}),/Baja con acuse/);
  c.WORKERS=[w];c.renderTable();assert.equal(($('tbody').innerHTML.match(/<td/g)||[]).length,6);assert.doesNotMatch($('tbody').innerHTML,/SECRET_ACCOUNT|SECRET_PHONE|2400|ALBAÑIL/);assert.match($('tbody').innerHTML,/ALTA IMSS/);w.movimiento_imss='ALTA PRESENTADA';c.renderTable();assert.doesNotMatch($('tbody').innerHTML,/ALTA IMSS/);assert.match($('tbody').innerHTML,/Alta pendiente|por cotejar/);
  $('q').value='10';assert.equal(c.baseFiltered().length,1);c.resetWorkerFilters();assert.equal($('q').value,'');
  // La ficha por secciones se prueba con DOM en test_padron_ficha_personal.cjs.
  for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
  console.log('OK: inicio, empresa/obra, menú, carga fallida/concurrente, búsqueda, seis columnas, acuses por episodio. Sin acceso a producción.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
