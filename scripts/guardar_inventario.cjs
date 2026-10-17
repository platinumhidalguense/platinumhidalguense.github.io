// Reporte derivado del código, sin conexiones, datos de negocio ni credenciales.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),acorn=require('acorn'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');process.chdir(root);
const report=JSON.parse(execFileSync(process.execPath,['scripts/auditar_funciones.cjs'],{encoding:'utf8',maxBuffer:20e6}));
const archivos=[...new Set(report.funciones.map(f=>f.archivo))];
const compact={version:report.version,metodo:report.metodo,resumen:report.resumen,revision:'ANALIZADA_ESTATICAMENTE',prueba_individual:'NO_ACREDITADA_POR_EL_INVENTARIO',detalle:'Huellas de funciones globales; ejecutar auditar_funciones.cjs para callbacks y trazas completas.',archivos,botones:report.botones,funciones:report.funciones.filter(f=>f.global).map(({archivo,nombre,linea,fin,sha256})=>({archivo:archivos.indexOf(archivo),nombre,linea,fin,sha256}))};
fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/auditoria-funciones.json',JSON.stringify(compact)+'\n');
const base='frontend/funciones-originales.json',original='work/integracion_final_20261016/index_antes.html';
if(!fs.existsSync(base)&&fs.existsSync(original)){
 const js=[...fs.readFileSync(original,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].find(x=>x[2].includes('/* ================== CONFIGURACIÓN'))[2];
 const hashes=Object.fromEntries(acorn.parse(js,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,crypto.createHash('sha256').update(js.slice(n.start,n.end)).digest('hex')]));
 fs.writeFileSync(base,JSON.stringify({version:'2026-10-16.2',funciones:hashes},null,2)+'\n');
}
console.log(JSON.stringify({...report.resumen,botones_sin_destino:report.botones.filter(x=>!x.global_resuelto).map(x=>x.destino)}));
