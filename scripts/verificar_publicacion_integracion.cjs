// Sólo consulta los dos archivos públicos publicados; no inicia sesiones ni navegador.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),vm=require('node:vm');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{
 const build=JSON.parse(fs.readFileSync('frontend/build.json','utf8'));
 for(const file of ['index.html','platinum-sync.js','platinum-workflows.js','platinum-rrhh.js','platinum-pagos-sabado.js',build.entry]){
  const expected=fs.readFileSync(file,'utf8'),url='https://platinumhidalguense.github.io/'+(file==='index.html'?'':file)+'?verificar='+Date.now();
  const res=await fetch(url,{cache:'no-store'});assert.equal(res.status,200,file+' HTTP');const actual=await res.text();
  assert.equal(sha(actual),sha(expected),file+' no coincide con el contenido probado');
  if(file.endsWith('.js'))new vm.Script(actual);
  else{for(const f of ['platinum-sync','platinum-workflows','platinum-rrhh','platinum-pagos-sabado'])assert(actual.includes('src="'+f+'.js?v='+build.version.replaceAll('-','')+'"'));assert(actual.includes('src="'+build.entry+'"'));assert(actual.includes(build.integrity));for(const s of actual.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/src=|application\/json/.test(s[1]))new vm.Script(s[2]);}
  if(file===build.entry){assert.equal(sha(actual),build.sha256);assert.equal('sha384-'+crypto.createHash('sha384').update(actual).digest('base64'),build.integrity);assert(actual.includes("const APP_VERSION='"+build.version+"'"));}
  console.log(JSON.stringify({file,http:res.status,sha256:sha(actual),coincide:true}));
 }
 console.log('Publicación verificada por HTTP y huellas. Sin validación visual ni sesión de usuario.');
})().catch(e=>{console.error(e);process.exitCode=1;});
