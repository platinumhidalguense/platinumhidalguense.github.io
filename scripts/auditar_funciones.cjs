// Inventario por AST y trazabilidad por función. Revisión estática, nunca etiqueta una función como probada por existir.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),acorn=require('acorn');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'frontend/modulos.json'),'utf8'));
const paths=[...manifest.modules,'platinum-sync.js','platinum-workflows.js','platinum-rrhh.js','concentrado-contratistas.js'];
const literal=n=>n?.type==='Literal'?n.value:null,member=n=>n?.type==='MemberExpression'?(n.computed?literal(n.property):n.property.name):null;
const entries=[],buttons=new Map(),declarations=new Set();
function visit(n,fn,parents=[]){if(!n||typeof n!=='object'||!n.type)return;fn(n,parents);for(const[k,v]of Object.entries(n))if(!['start','end','loc','range'].includes(k)){if(Array.isArray(v))v.forEach(x=>visit(x,fn,[...parents,n]));else if(v&&typeof v==='object'&&v.type)visit(v,fn,[...parents,n]);}}
for(const file of paths){
 const src=fs.readFileSync(path.join(root,file),'utf8'),tree=acorn.parse(src,{ecmaVersion:'latest',locations:true});
 visit(tree,(n,parents)=>{
  if(n.type==='Literal'&&typeof n.value==='string'||n.type==='TemplateElement'){
   const text=n.type==='Literal'?n.value:n.value.raw;for(const m of text.matchAll(/\bon(?:click|change|input|submit)\s*=\s*["'](?:return\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)){if(!buttons.has(m[1]))buttons.set(m[1],new Set());buttons.get(m[1]).add(file);}
  }
  if(n.type==='VariableDeclarator'&&n.id?.type==='Identifier'&&['FunctionExpression','ArrowFunctionExpression'].includes(n.init?.type))declarations.add(n.id.name);
  if(!['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type))return;
  const p=parents.at(-1);let name=n.id?.name||p?.id?.name||(p?.type==='Property'?(p.key.name||p.key.value):null)||'(callback @'+n.loc.start.line+')';
  const top=n.type==='FunctionDeclaration'&&parents.at(-1)?.type==='Program';if(top)declarations.add(name);
  const body=src.slice(n.start,n.end),queries=[],rpcs=[],calls=new Set();
  visit(n.body,(x,anc)=>{
   if(x.type!=='CallExpression')return;
   if(x.callee.type==='Identifier')calls.add(x.callee.name);
   const method=member(x.callee);if(method==='rpc')rpcs.push(literal(x.arguments[0])||'(dinámico)');
   if(method!=='from')return;const table=literal(x.arguments[0]);if(typeof table!=='string')return;
   let chain=x;for(let i=anc.length-1;i>=0;i--){const a=anc[i];if(a.type==='MemberExpression'&&a.object===chain)chain=a;else if(a.type==='CallExpression'&&a.callee===chain)chain=a;else break;}
   const text=src.slice(chain.start,chain.end);if(!/\.select\s*\(/.test(text))return;
   const write=/\.(?:insert|update|delete|upsert)\s*\(/.test(text),pages=anc.some(a=>a.type==='CallExpression'&&a.callee.type==='Identifier'&&a.callee.name==='fetchAllRows')||/\.range\s*\(/.test(text);
   queries.push({tabla:table,escritura_con_retorno:write,paginada:pages,solo_conteo:/head\s*:\s*true/.test(text),acotada:/\.(?:single|maybeSingle|limit)\s*\(/.test(text),alcance:/\.(?:eq|in)\(['"](?:obra_id|trabajador_id|id|cierre_id|caso_id|user_id|importacion_id)['"]/.test(text),linea:x.loc.start.line});
  });
  entries.push({archivo:file,nombre:name,tipo:n.type,global:top,linea:n.loc.start.line,fin:n.loc.end.line,sha256:crypto.createHash('sha256').update(body).digest('hex'),llamadas:[...calls].sort(),rpc:[...new Set(rpcs)],consultas:queries,
   revision:'ANALIZADA_ESTATICAMENTE',prueba_individual:'NO_ACREDITADA_POR_EL_INVENTARIO',indicadores:{muta:/\.(?:insert|update|upsert|delete)\s*\(/.test(body),comprueba_error:/\.error|\berror\b|catch\s*\(/.test(body),actualiza_interfaz:/loadObraData|render|cargar|closeModal|\.innerHTML|PLATINUM_FLOWS/.test(body)}});
 });
}
const out={version:manifest.version,metodo:'AST Acorn; incluye callbacks. Cada indicador requiere interpretación. Las consultas acotadas y catálogos pueden no necesitar paginación; no se declaran bugs sólo por coincidencia de texto.',
 resumen:{funciones_globales:entries.filter(e=>e.global).length,funciones_y_callbacks:entries.length,archivos:paths.length,botones_literales:buttons.size},
 botones:[...buttons].filter(([destino])=>destino!=='if').map(([destino,files])=>({destino,archivos:[...files],global_resuelto:declarations.has(destino)||/^PLATINUM_|^(?:window|document|this|event)\./.test(destino)})),
 funciones:entries};
console.log(JSON.stringify(out));
