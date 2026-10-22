// Contratos de lecturas heredadas con 1001 filas, dos razones sociales y respuestas tardías.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const files=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules,src=files.map(f=>fs.readFileSync(f,'utf8')).join('');
const ast=acorn.parse(src,{ecmaVersion:'latest'}),f=name=>{const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return src.slice(n.start,n.end);};
const data=Array.from({length:1001},(_,i)=>({id:String(i).padStart(6,'0'),obra_id:'p'})).concat([{id:'j1',obra_id:'j'}]);
let fail=false,late=false,requests=[];
const box={console,EMPRESA_ACTIVA:'PLATINUM',OBRAS:[{id:'p',empresa_codigo:'PLATINUM'},{id:'j',empresa_codigo:'JIRE'}],empresaDeObra:o=>o.empresa_codigo,
 sb:{from:table=>({select:columns=>{const filters=[];const q={in:(k,v)=>(filters.push([k,v]),q),eq:()=>q,order:()=>q,range:async(a,b)=>{requests.push({table,columns,filters,a,b});if(late)box.EMPRESA_ACTIVA='JIRE';return fail&&a>0?{data:null,error:{message:'Fallo simulado'}}:{data:data.filter(r=>filters.every(([k,v])=>v.includes(r[k]))).slice(a,b+1),error:null};}};return q;}})}};
vm.createContext(box);vm.runInContext(f('fetchAllRows')+'\n'+f('leerPorEmpresa'),box);
(async()=>{
 let n=0,r=await box.leerPorEmpresa('trabajadores','id,obra_id',q=>q.eq('eliminado',false));assert.equal(r.data.length,1001);assert(!r.error);assert.equal(requests.length,2);assert(requests.every(q=>q.filters[0][1].length===1&&q.filters[0][1][0]==='p'));n++;
 fail=true;r=await box.leerPorEmpresa('trabajadores');assert(r.error);assert.equal(r.data,null,'Nunca devolver una lista parcial como válida');n++;
 fail=false;late=true;r=await box.leerPorEmpresa('trabajadores');assert.match(r.error.message,/Cambió la empresa/);assert.equal(r.data,null);n++;
 late=false;r=await box.leerPorEmpresa('trabajadores');assert.equal(r.data.length,1);assert.equal(r.data[0].obra_id,'j');n++;
 box.OBRAS=[];requests=[];r=await box.leerPorEmpresa('trabajadores');assert.equal(r.data.length,0);assert.equal(requests.length,0);n++;
 for(const name of ['openAutorrellenar','openControlSalarios','parseImportExp','parseImport','openAltasSemana','parseImportVac','ptuCargar','verificarNOI'])assert(f(name).includes('leerPorEmpresa('),name);n++;
 assert(f('parseImportVac').includes('if(vacError)'));assert(f('aplicarVN').includes('if(ocupadosError)'));n++;
 assert(f('cpCargar').includes('if(OBRA?.id!==obraId)return'));for(const name of ['guardarCuadrilla','guardarEditCuadrilla']){assert(f(name).includes('if(recargaError)'));assert(f(name).includes('if(OBRA?.id!==obraId)return'));}n++;
 const imss=f('ctrlAplicarSemanaIMSS');assert(imss.includes(".in('estado',['AUTORIZADO','TIMBRADO','PAGADO'])"));assert(imss.includes('ctrlImporteIMSSPeriodo(c,s.semana)'));assert(f('ctrlImporteIMSSPeriodo').includes('descuentoFaltasNOI(w,0,0,undefined,sin).monto'));n++;
 console.log('PASS '+n+' contratos de paginación, empresas, error parcial, contexto y bloqueo IMSS.');
})().catch(e=>{console.error(e);process.exitCode=1;});
