// Reescritura mecánica de lectores estáticos: no modifica escenarios ni aserciones.
const fs=require('node:fs'),path=require('node:path'),acorn=require('acorn');
let changed=0;
for(const file of fs.readdirSync(__dirname).filter(x=>/^(test_|verificar_integracion_primera_entrega|inventario_integracion_global).*\.(cjs|js)$/.test(x))){
 const p=path.join(__dirname,file),s=fs.readFileSync(p,'utf8'),ast=acorn.parse(s,{ecmaVersion:'latest',sourceType:'script'}),edits=[];
 function walk(n){if(!n||typeof n!=='object')return;
  if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='readFileSync'){
   const a=n.arguments[0],value=a&&s.slice(a.start,a.end);
   if(value&&(/^(?:'index\.html'|"index\.html")$/.test(value)||/path\.join\(__dirname,\s*['"]\.\.['"],\s*['"]index\.html['"]\)/.test(value)))edits.push({start:n.start,end:n.end,text:"require('./fuente_frontend.cjs').html()"});
  }
  for(const [k,v]of Object.entries(n))if(k!=='start'&&k!=='end')if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);
 }walk(ast);if(!edits.length)continue;
 let next=s;for(const e of edits.sort((a,b)=>b.start-a.start))next=next.slice(0,e.start)+e.text+next.slice(e.end);
 fs.writeFileSync(p,next);changed++;
}
console.log('Lectores actualizados: '+changed+'. Escenarios y aserciones conservados.');
