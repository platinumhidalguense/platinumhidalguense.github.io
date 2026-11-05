// VM/DOM sintético: no navegador, red, usuarios ni expedientes reales.
const fs=require('fs'),vm=require('vm'),acorn=require('acorn'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const texto=fs.readFileSync('frontend/modulos/31-documentos-laborales.js','utf8'),n=acorn.parse(texto,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='generarContrato');
let escrituras=0,impresiones=[],descargas=[],llamadas=[];
const {document,window}=parseHTML('<html><body><div id="scr-app"></div><div id="scr-login"></div></body></html>');
// linkedom no implementa la selección de formularios del navegador.
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value||this.querySelector('option')?.getAttribute('value')||'';},set(v){this._value=v;}});
const w={id:'persona-ficticia',no_trab:1,empresa_codigo:'PLATINUM',obra_id:'obra-ficticia',obra_nombre:'OBRA FICTICIA',nombres:'PERSONA <script>alert(1)</script>',primer_apellido:'PRUEBA',fecha_alta:'2026-01-01',sd:300,periodo_pago:'SEMANAL',estatus:'ACTIVO',tipo_contrato:'OBRA DETERMINADA'},e={razon:'EMPRESA FICTICIA',rfc:'FIC010101AAA',representante:'REPRESENTANTE',domicilio:'DOMICILIO FICTICIO'};
const box={window,document,SOLO_CONTRATOS:true,USER:{id:'legal-ficticio',email:'legal@prueba.test'},WORKERS:[w],OBRA:{nombre:w.obra_nombre},CFGEMP:{empresa_PLATINUM:e},MES:['ENERO'],today:()=> '2026-01-01',fullName:x=>x.primer_apellido+' '+x.nombres,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),puedeEditarTrabajador:()=>true,numLetras:()=> 'TRESCIENTOS',toast(){},markWrite(){escrituras++;},closeModal(){},loadObraData(){escrituras++;},doLogout(){},$:id=>document.getElementById(id),setTimeout(){},Blob,URL:{createObjectURL(){descargas.push(1);return 'blob:ficticio';},revokeObjectURL(){}},XLSX:require('xlsx-js-style'),JSZip:require('jszip'),sb:{from(){escrituras++;throw Error('No debe escribir');},rpc:async(name,p)=>{llamadas.push([name,p]);const a=p.p_accion;return{data:a==='INICIO'?{obras:[{id:w.obra_id,nombre:w.obra_nombre,empresa_codigo:w.empresa_codigo}],empresas:{PLATINUM:e}}:a==='LISTAR'?{filas:[w],total:1,hay_mas:false}:{filas:[]}};}}};
box.money=x=>'$'+Number(x).toFixed(2);
window.open=()=>{const v={document:{open(){},write(h){impresiones.push(h);},close(){}},close(){}};return v;};
vm.createContext(box);vm.runInContext(texto.slice(n.start,n.end),box);vm.runInContext(fs.readFileSync('frontend/modulos/55-contratos-consulta.js','utf8'),box);
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const h=await box.generarContrato(w.id,{soloLectura:true,devolverHTML:true,trabajador:w,obra:box.OBRA,empresa:e,datos:{emp:'PLATINUM',tipo:w.tipo_contrato,fecha:w.fecha_alta,razon:e.razon,rfc:e.rfc,rep:e.representante,dom:e.domicilio}});assert(h.includes('PRIMERA'));assert(h.includes('&lt;script&gt;'));assert.equal(escrituras,0);
 await window.PLATINUM_CONTRATOS_CONSULTA.abrir();assert(document.getElementById('scr-app').classList.contains('hide'));assert(document.getElementById('legal-tabla').textContent.includes('PERSONA'));assert(!document.getElementById('legal-portal').textContent.includes('Sueldos'));
 document.querySelector('[data-accion="imprimir"]').click();await settle();assert(impresiones.some(h=>h.includes('PRIMERA')));assert.equal(escrituras,0);
 document.querySelector('[data-export="lote-imprimir"]').click();await settle();await settle();assert(impresiones.some(h=>h.includes('contrato-lote')));
 document.querySelector('[data-accion="formato"]').click();await settle();assert.equal(descargas.length,1);
 const sesion=fs.readFileSync('frontend/modulos/01-sesion-centros-sincronizacion.js','utf8'),entrada=acorn.parse(sesion,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='enterApp');
 const chip=document.createElement('div');chip.id='user-chip';document.body.appendChild(chip);box.cargaPermisos=async()=>{};vm.runInContext(sesion.slice(entrada.start,entrada.end),box);await box.enterApp();assert(document.getElementById('scr-app').classList.contains('hide'),'El perfil legal no inicializa el resto de la aplicación');
 document.getElementById('legal-archivados').click();await settle();assert(document.getElementById('legal-tabla').textContent.includes('No hay registros'));
 assert(llamadas.every(([name])=>name==='control_consulta_contratos'));assert.equal(escrituras,0);
 box.SOLO_CONTRATOS=false;box.sb.from=()=>({upsert:async()=>{escrituras++;},update:()=>({eq:async()=>{escrituras++;}})});
 await box.generarContrato(w.id,{devolverHTML:true,trabajador:w,obra:box.OBRA,empresa:e,datos:{emp:'PLATINUM',tipo:w.tipo_contrato,fecha:w.fecha_alta}});assert.equal(escrituras,3,'La ruta de edición conserva los dos guardados y su marca local');
 console.log('PASS contratos UI: portal exclusivo, escape HTML, contrato oficial individual/lote, archivos vacíos, sólo RPC acotada y cero escrituras.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
