const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),acorn=require('acorn'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync(path.join(root,'frontend/modulos.json'),'utf8')),b=JSON.parse(fs.readFileSync(path.join(root,'frontend/build.json'),'utf8'));
const source=m.modules.map(x=>fs.readFileSync(path.join(root,x),'utf8')).join(''),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
assert.equal(sha(source),b.sha256);assert.equal(fs.readFileSync(path.join(root,b.entry),'utf8'),source);new vm.Script(source);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(html.includes('src="'+b.entry+'"'));assert(html.includes(b.integrity));
assert.equal('sha384-'+crypto.createHash('sha384').update(source).digest('base64'),b.integrity);
const ast=acorn.parse(source,{ecmaVersion:'latest'}),names=ast.body.filter(n=>n.type==='FunctionDeclaration').map(n=>n.id.name);
assert.equal(new Set(names).size,names.length,'No crear funciones globales repetidas');
assert(!html.includes('function proyModelo('),'El código de la aplicación ya no vive en el HTML');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'frontend/funciones-originales.json'),'utf8')).funciones;
const exceptions=JSON.parse(fs.readFileSync(path.join(root,'frontend/revision-auditada.json'),'utf8'));
const actual=Object.fromEntries(ast.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,sha(source.slice(n.start,n.end))]));
for(const[name,hash]of Object.entries(baseline)){assert(actual[name],'Función original perdida: '+name);if(!exceptions[name])assert.equal(actual[name],hash,'Función alterada sin revisión: '+name);}
console.log('PASS huellas públicas de '+Object.keys(baseline).length+' funciones originales; verificación reproducible sin copias privadas.');
const before=path.join(root,'work/integracion_final_20261016/index_antes.html');
if(fs.existsSync(before)){
 const original=[...fs.readFileSync(before,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].find(x=>x[2].includes('/* ================== CONFIGURACIÓN'))[2];
 const old=acorn.parse(original,{ecmaVersion:'latest'}),funcs=x=>new Map(x.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,n]));
 const reviewed=JSON.parse(fs.readFileSync(path.join(root,'frontend/revision-auditada.json'),'utf8'));
 const protectedNames=['proyFiniquito','retencionEvaluada','descuentosDe','calcPrestaciones','calcularPrestaciones','fonacotMontoPeriodo','infonavitRetencionPeriodo'];
 for(const name of protectedNames)assert(!reviewed[name],'No autorizar cambios de fórmula por esta lista');
 const beforeFuncs=funcs(old),afterFuncs=funcs(ast);let untouched=0;for(const[name,node]of beforeFuncs){assert(afterFuncs.has(name),'Función perdida: '+name);const next=afterFuncs.get(name);if(reviewed[name])assert(reviewed[name].length>30);else{assert.equal(source.slice(next.start,next.end),original.slice(node.start,node.end),'Función alterada sin revisión: '+name);untouched++;}}
 const projection=n=>n.replace(',motor_nomina:motorNominaDe(w),motor_config:motorNominaConfiguracion(w)','').replace(',motores_esquema:1','');
 const oldP=beforeFuncs.get('proyModelo'),newP=afterFuncs.get('proyModelo');assert.equal(projection(source.slice(newP.start,newP.end)),original.slice(oldP.start,oldP.end),'La separación sólo permite metadatos en la composición de proyección');
 const router=afterFuncs.get('nominaPeriodo');assert(/return periodoPago\(w\)==='QUINCENAL'\?nominaQuincenal\(w,opts\):nominaSemanal\(w,opts\);/.test(source.slice(router.start,router.end)),'El adaptador de motor no debe contener fórmulas');
 const incidencias=afterFuncs.get('descuentoFaltasNOI');assert(/return periodoPago\(w\)==='QUINCENAL'\?descuentoFaltasQuincenal\(w,faltas,premios,dias,incapacidadIMSS,contexto\):descuentoFaltasSemanal\(w,faltas,premios,dias,incapacidadIMSS\);/.test(source.slice(incidencias.start,incidencias.end)),'El adaptador de incidencias sólo debe seleccionar motor');
 console.log('PASS '+beforeFuncs.size+' funciones conservadas; '+untouched+' idénticas y '+Object.keys(reviewed).length+' cambios revisados. Separación de motores autorizada; composición monetaria de proyección conservada.');
}
console.log('PASS '+m.modules.length+' módulos: concatenación, sintaxis, orden, ámbito global y huella de carga íntegra.');
