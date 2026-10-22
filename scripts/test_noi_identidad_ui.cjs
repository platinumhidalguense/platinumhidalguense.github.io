// Identidades ficticias. Importador real en VM, sin navegador ni escrituras.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const src=fs.readFileSync('frontend/modulos/35-centro-control.js','utf8');
const names=['ctrlNormHdr','ctrlNumero','ctrlPuntajeColNOI','ctrlDetectarLayoutNOI','ctrlExtraerFilasNOI','ctrlIdentificadorNOI','ctrlNombreIdentidadNOI','ctrlCruzarIdentidadNOI','ctrlLeerArchivoNOI'];
const code=acorn.parse(src,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>src.slice(n.start,n.end)).join('\n');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;},el={innerHTML:''},messages=[];
const w1={id:'a',obra_id:'o',no_trab:7,rfc:'PRUA900101AB1',nss:'01234567890',nombre:'PRUEBA ALFA ANA'},w2={id:'b',obra_id:'o',no_trab:3,rfc:'PRUB900101AB2',nombre:'PRUEBA BETA LUIS'};
const items=[{trabajador_id:'a',numero:7,nombre:w1.nombre,monto:100,tipo:'NOMINA'},{trabajador_id:'b',numero:3,nombre:w2.nombre,monto:100,tipo:'NOMINA'}];
const matrix=[['Clave','Nombre del trabajador','RFC','NSS','Neto pagado'],[3,'ANA PRUEBA ALFA',w1.rfc,1234567890,100],[7,'LUIS PRUEBA BETA',w2.rfc,'',100]];
const box={window:{_CTRL_CIERRE:{id:'c',snapshot:{items}}},OBRA:{id:'o'},WORKERS:[w1,w2],USER:{email:'fixture@test.invalid'},
 redondearCentavos:n=>Math.round(Number(n)*100)/100,finTransDe:()=>false,esc:String,$:()=>el,ctrlSha:async()=> 'a'.repeat(64),toast:m=>messages.push(m),ctrlRenderConciliacion:r=>{box.preview=r;return '';},
 XLSX:{read:()=>({SheetNames:['FICTICIO'],Sheets:{FICTICIO:matrix}}),utils:{sheet_to_json:s=>s}}};
vm.createContext(box);vm.runInContext(code,box);
const layout=box.ctrlDetectarLayoutNOI(matrix),rows=box.ctrlExtraerFilasNOI(matrix,layout,'FICTICIO'),cross=(r=rows,w=[w1,w2])=>box.ctrlCruzarIdentidadNOI(r,items,w,'o');
ok(rows[0].nss===1234567890&&rows[0].rfc===w1.rfc,'Conserva identificadores de la fila');
ok(box.ctrlExtraerFilasNOI([...matrix,[9,'NOMBRE','','','']],layout,'FICTICIO').length===2,'Un neto vacío no se convierte en pago cero');
ok(cross()[0].w.id==='a'&&cross()[1].w.id==='b','Números intercambiados y netos iguales no intercambian personas');
ok(cross()[0].identidad.numero_noi===3&&cross()[0].identidad.numero_plataforma===7,'Conserva ambas numeraciones');
ok(box.ctrlIdentificadorNOI('nss',1234567890)==='01234567890','Conserva cero inicial NSS');
ok(box.ctrlNombreIdentidadNOI('ÁNA Prueba Alfa')===box.ctrlNombreIdentidadNOI('PRUEBA ALFA ANA'),'Orden del nombre y acentos');
assert.throws(()=>cross([{...rows[0],rfc:w2.rfc,nss:''}]),/contradictorios|no concuerdan/);checks++;
assert.throws(()=>cross([{...rows[0],nss:w1.nss,rfc:w2.rfc}]),/personas distintas/);checks++;
assert.throws(()=>cross(rows,[w1,w2,{...w1,id:'duplicado'}]),/duplicada/);checks++;
assert.throws(()=>cross([{...rows[0],rfc:'',nss:'',nombre:'',curp:''}]),/por sí solo/);checks++;
assert.throws(()=>cross([{...rows[0],rfc:'',nss:''}],[w1,{...w1,id:'dup',rfc:''}]),/ambiguo/);checks++;
assert.throws(()=>cross([rows[0],{...rows[0],m:101}]),/datos distintos/);checks++;
ok(cross([rows[0],{...rows[0]}]).length===1,'Duplicado exacto no suma dos veces');
ok(cross([{...rows[0],rfc:'',nss:''}])[0].w.id==='a','Nombre completo único sin identificadores');
ok(cross([{...rows[0],rfc:'',nss:'',nombre:'OTRA PERSONA'}])[0].w===undefined,'No acepta sólo el mismo número');
ok(cross([{...rows[0],rfc:'PRUC900101AB3',nss:'',nombre:'OTRA PERSONA'}],[{...w1,obra_id:'otra'}])[0].w===undefined,'Identidad de otro centro no cruza');
(async()=>{
 await box.ctrlLeerArchivoNOI({files:[{name:'FICTICIO.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)}]});
 ok(!messages.length,messages.join(' '));ok(box.preview.length===2&&box.preview.every(x=>x.estatus==='COINCIDE'),'Importador completo cruza por UUID, sin falsos faltantes');
 ok(box.window._CTRLNOI.rows[0].detalle.identidad_noi.numero_noi===3,'Fuente trazable en payload');
 matrix[1][2]=w2.rfc;
 await box.ctrlLeerArchivoNOI({files:[{name:'ERROR.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)}]});
 ok(box.window._CTRLNOI===null&&messages.length===1,'Fallo invalida conciliación anterior sin permitir guardarla');matrix[1][2]=w1.rfc;
 const previous=box.window._CTRL_CIERRE;
 await box.ctrlLeerArchivoNOI({files:[{name:'CAMBIO.xlsx',arrayBuffer:async()=>{box.window._CTRL_CIERRE={...previous};return new ArrayBuffer(0);}}]});
 ok(box.window._CTRLNOI===null&&messages.at(-1).includes('Cambió'),'Descarta lectura al cambiar cierre');
 console.log('PASS '+checks+' contratos de identidad NOI: claves cruzadas, igualdad engañosa, duplicados, contradicciones, alcance y contexto.');
})().catch(e=>{console.error(e);process.exitCode=1;});
