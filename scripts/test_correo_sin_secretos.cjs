// No imprime ni utiliza la clave histórica. Verifica que ningún literal vuelva a publicarla.
const fs=require('node:fs'),assert=require('node:assert/strict'),acorn=require('acorn'),vm=require('node:vm');
const src=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules.map(p=>fs.readFileSync(p,'utf8')).join('');
const ast=acorn.parse(src,{ecmaVersion:'latest'}),fn=name=>{const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return src.slice(n.start,n.end);};
const cfg={},copied=[],opened=[],els={'f-nombres':{value:'PERSONA'},'f-primer_apellido':{value:'PRUEBA'},'f-correo':{},'h-correo':{}};
const box={CFGEMP:{correo_auto:{pwd:'CLAVE_FICTICIA_NO_USAR',dominio:'example.test'}},$:(id)=>els[id],WORKERS:[],toast:()=>{},esc:s=>s,navigator:{clipboard:{writeText:async s=>{copied.push(s);}}},window:{open:(...a)=>opened.push(a)}};
vm.createContext(box);vm.runInContext(['normCorreo','correoCfg','crearCorreo'].map(fn).join('\n'),box);
assert(!('pwd'in box.correoCfg()));box.crearCorreo();assert.equal(copied[0],'persona.prueba@example.test');assert.equal(opened[0][2],'noopener,noreferrer');assert(!JSON.stringify(els).includes('CLAVE_FICTICIA_NO_USAR'));
assert(!fn('openCorreos').includes('${esc(pwd)}'));assert(!fn('exportCorreos').includes("'CONTRASEÑA'"));assert(!fn('exportCorreos').includes('pwd'));
const base='work/integracion_final_20261016/index_antes.html';if(fs.existsSync(base)){
 const before=fs.readFileSync(base,'utf8'),line=before.split(/\r?\n/).find(l=>l.startsWith('function correoCfg(){'));
 const secret=line?.match(/pwd:c\.pwd\|\|(['"])(.*?)\1/)?.[2];if(secret&&secret.length>3)assert(!src.includes(secret),'La clave histórica no debe existir en ningún módulo');
}
console.log('PASS 7 contratos de correo: dirección y directorio conservados, sin claves en código, portapapeles, pantalla ni Excel. Rotación de credenciales anteriores pendiente del propietario.');
