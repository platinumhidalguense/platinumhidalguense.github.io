const fs=require('node:fs'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const fresh=JSON.parse(execFileSync(process.execPath,['scripts/auditar_funciones.cjs'],{encoding:'utf8',maxBuffer:20e6}));
const saved=JSON.parse(fs.readFileSync('docs/auditoria-funciones.json','utf8'));
const globals=fresh.funciones.filter(f=>f.global);assert.equal(saved.version,fresh.version);assert.equal(saved.funciones.length,globals.length);
assert.equal(saved.prueba_individual,'NO_ACREDITADA_POR_EL_INVENTARIO');
for(const [i,f]of globals.entries()){const s=saved.funciones[i];assert.equal(s.sha256,f.sha256);assert.equal(saved.archivos[s.archivo],f.archivo);assert.equal(s.linea,f.linea);}
assert.equal(fresh.botones.filter(b=>!b.global_resuelto).length,0);
console.log('PASS inventario íntegro: '+fresh.resumen.funciones_globales+' funciones globales / '+fresh.funciones.length+' funciones y callbacks; destinos literales resueltos. Auditoría estática, no prueba funcional universal.');
