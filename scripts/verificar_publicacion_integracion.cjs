// Sólo consulta los dos archivos públicos publicados; no inicia sesiones ni navegador.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),vm=require('node:vm');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{
 for(const file of ['index.html','platinum-sync.js','platinum-workflows.js']){
  const expected=fs.readFileSync(file,'utf8'),url='https://platinumhidalguense.github.io/'+(file==='index.html'?'':file)+'?verificar='+Date.now();
  const res=await fetch(url,{cache:'no-store'});assert.equal(res.status,200,file+' HTTP');const actual=await res.text();
  assert.equal(sha(actual),sha(expected),file+' no coincide con el contenido probado');
  if(file.endsWith('.js'))new vm.Script(actual);
  else{assert(actual.includes('src="platinum-sync.js?v=20261016.2"'));assert(actual.includes('src="platinum-workflows.js?v=20261016.2"'));assert(actual.includes("const APP_VERSION='2026-10-16.2'"));for(const s of actual.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/src=|application\/json/.test(s[1]))new vm.Script(s[2]);}
  console.log(JSON.stringify({file,http:res.status,sha256:sha(actual),coincide:true}));
 }
 console.log('Publicación verificada por HTTP y huellas. Sin validación visual ni sesión de usuario.');
})().catch(e=>{console.error(e);process.exitCode=1;});
