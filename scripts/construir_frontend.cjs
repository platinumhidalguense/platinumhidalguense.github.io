// Empaquetado determinista de scripts clásicos: conserva ámbito global, orden y hoisting.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'frontend/modulos.json'),'utf8'));
const data=manifest.modules.map(p=>({path:p,source:fs.readFileSync(path.join(root,p),'utf8')}));
const source=data.map(x=>x.source).join('');new vm.Script(source);
// No generar una publicación cuyo aviso se considere antiguo a sí mismo.
const versions=[...source.matchAll(/const APP_VERSION='([^']+)';/g)];
if(versions.length!==1||versions[0][1]!==manifest.version)throw Error('APP_VERSION debe coincidir con frontend/modulos.json antes de publicar');
const sha=crypto.createHash('sha256').update(source).digest('hex'),sri=crypto.createHash('sha384').update(source).digest('base64');
const entry='assets/platinum-app.'+sha.slice(0,16)+'.js';fs.mkdirSync(path.join(root,'assets'),{recursive:true});fs.writeFileSync(path.join(root,entry),source);
const template=fs.readFileSync(path.join(root,'frontend/index.template.html'),'utf8');if(!template.includes('<!-- PLATINUM_APP -->'))throw Error('Plantilla sin punto de entrada');
const tag=`<script src="${entry}" integrity="sha384-${sri}" crossorigin="anonymous"></script>`;
fs.writeFileSync(path.join(root,'index.html'),template.replace('<!-- PLATINUM_APP -->',tag));
const build={version:manifest.version,entry,sha256:sha,integrity:'sha384-'+sri,modules:data.map(x=>({path:x.path,sha256:crypto.createHash('sha256').update(x.source).digest('hex')}))};
fs.writeFileSync(path.join(root,'frontend/build.json'),JSON.stringify(build,null,2)+'\n');console.log(JSON.stringify({entry,modules:data.length,sha256:sha}));
