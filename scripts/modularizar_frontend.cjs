// Migración mecánica y única del monolito. No transpila, renombra ni recalcula funciones.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),acorn=require('acorn'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const matches=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const main=matches.find(m=>m[2].includes('/* ================== CONFIGURACIÓN'));
assert(main,'Ya modularizado o fuente principal no encontrada. No sobrescribir los módulos.');
const src=main[2],comments=[],tree=acorn.parse(src,{ecmaVersion:'latest',onComment:comments});
const top=comments.filter(c=>c.type==='Block'&&!tree.body.some(n=>n.start<c.start&&c.end<n.end));
const cuts=[
 ['00-configuracion-utilidades',null],['01-sesion-centros-sincronizacion','---------- arranque'],
 ['02-asistente-extractores','v37 · ASISTENTE INTELIGENTE'],['03-navegacion-presentacion','v36.1 · PANEL LATERAL'],
 ['04-padron-expedientes','---------- vista trabajadores'],['05-alta-edicion','---------- formulario alta / edición'],
 ['06-movimientos-historial','---------- baja / reactivar'],['07-exportacion-corporativa','---------- helpers de Excel'],
 ['08-retenciones-incidencias','---------- PERIODICIDAD DE PAGO'],['09-documentacion-reportes','---------- v34: REPORTE DE DOCUMENTACIÓN'],
 ['10-proyeccion-nomina','---------- PROYECCIÓN DE NÓMINA'],['11-expedientes-excel','---------- EXPEDIENTE INDIVIDUAL'],
 ['12-bloques-entregas','---------- BLOQUES Y REUNIONES'],['13-control-salarial-diferenciales','---------- CONTROL INTERNO SALARIAL'],
 ['14-importacion-documental','---------- IMPORTAR PDFs'],['15-banca-conciliacion','PAGOS POR TRANSFERENCIA — importar'],
 ['16-control-pagos-folios','---------- Control de pagos:'],['17-recepcion-papeles','CONTROL DE PAPELES — expedientes'],
 ['18-exportacion-banca-tarjetas','---------- EXPORTS CONTABLES'],['19-cheques','---------- MÓDULO DE CHEQUES'],
 ['20-movimientos-semanales','---------- MOVIMIENTOS POR SEMANA'],['21-cuadrillas','CUADRILLAS · grupos'],
 ['22-asistencia-directorio','---------- LISTAS DE ASISTENCIA'],['23-vacaciones','---------- VACACIONES Y PERMISOS'],
 ['24-actas-nom035','---------- ACTAS ADMINISTRATIVAS'],['25-validaciones-cfdi','---------- VALIDACIONES OFICIALES'],
 ['26-prestaciones-anuales','---------- MÓDULO ANUAL'],['27-fiscal-costos','================= V10: FISCAL'],
 ['28-personal-historico-plantilla','--- PERSONAL HISTÓRICO A FECHA'],['29-bajas-creditos-motor','--- NUEVA OBRA'],
 ['30-contratistas-alertas','---------- v21: CONTRATISTAS'],['31-documentos-laborales','---------- SOLICITUD DE EMPLEO'],
 ['32-legajos','---------- LEGAJOS PARA ENTREGA'],['33-finiquitos','---------- CALCULADORA DE PRESTACIONES'],
 ['34-dashboard-respaldos','---------- DASHBOARD Y REPORTE'],['35-centro-control','================== CONTROL EMPRESARIAL'],
 ['36-imss-sin-servicio-st7','El expediente IMSS es una sola lista'],['37-avisos-infonavit','AVISOS INFONAVIT POR REGISTRO PATRONAL'],
 ['38-adaptadores-arranque','Adaptador de coordinación:']
].map(([name,needle])=>{const c=needle?top.find(c=>c.value.includes(needle)):null;assert(!needle||c,'Marcador no encontrado: '+needle);return {name,start:c?c.start:0};});
cuts.forEach((c,i)=>assert(i===0||c.start>cuts[i-1].start,'Orden inválido: '+c.name));
const folder=path.join(root,'frontend/modulos');fs.mkdirSync(folder,{recursive:true});
const parts=cuts.map((c,i)=>({path:'frontend/modulos/'+c.name+'.js',source:src.slice(c.start,cuts[i+1]?.start??src.length)}));
assert.equal(parts.map(x=>x.source).join(''),src,'Se alteró el código durante el corte');
for(const p of parts)fs.writeFileSync(path.join(root,p.path),p.source);
const manifest={format:1,version:'2026-10-16.2',modules:parts.map(p=>p.path),originalSha256:crypto.createHash('sha256').update(src).digest('hex')};
fs.writeFileSync(path.join(root,'frontend/modulos.json'),JSON.stringify(manifest,null,2)+'\n');
const template=html.slice(0,main.index)+'<!-- PLATINUM_APP -->'+html.slice(main.index+main[0].length);
fs.writeFileSync(path.join(root,'frontend/index.template.html'),template);
console.log('Separados '+parts.length+' módulos; concatenación idéntica al original.');
