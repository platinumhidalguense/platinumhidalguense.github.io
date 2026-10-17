// Para pruebas estáticas antiguas: reconstruye la misma vista HTML lógica, sin ejecutar scripts ni abrir navegador.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
function html(file='index.html'){
 const real=path.isAbsolute(file)?file:path.resolve(root,file),s=fs.readFileSync(real,'utf8');
 return s.replace(/<script\b[^>]*src="(assets\/platinum-app\.[a-f0-9]+\.js)"[^>]*><\/script>/g,(_,entry)=>'<script>'+fs.readFileSync(path.join(root,entry),'utf8')+'</script>');
}
module.exports={html};
