// Datos ficticios; sin red, navegador ni escrituras a la base.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=require('./fuente_frontend.cjs').html();
const legacy=fs.readFileSync('frontend/modulos/29-bajas-creditos-motor.js','utf8');
const code=fs.readFileSync('frontend/modulos/45-exportacion-altas-noi.js','utf8');
const col=i=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
const XLSX={utils:{encode_cell:({r,c})=>col(c)+(r+1),aoa_to_sheet:rows=>{
 const ws={'!ref':'A1:BF'+rows.length};rows.forEach((row,r)=>row.forEach((v,c)=>ws[col(c)+(r+1)]={t:typeof v==='number'?'n':'s',v}));return ws;
},book_new:()=>({Sheets:{},SheetNames:[]}),book_append_sheet:(wb,ws,n)=>{wb.Sheets[n]=ws;wb.SheetNames.push(n);}}};
const els={'na-d1':{value:'2026-10-19'},'na-d2':{value:'2026-10-25'},'na-lista':{},'na-excel':{},'na-txt':{}};
const box={console,XLSX,window:{},OBRA:{id:'o1',registro_patronal:'B6918617105'},WORKERS:[],messages:[],downloads:[],texts:[],
 $:id=>els[id],toast:(m,t)=>box.messages.push({m,t}),rpDe:w=>w.registro_patronal||box.OBRA.registro_patronal,
 fullName:w=>[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' '),empresaDeObra:()=> 'PLATINUM',
 esc:s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),fmtD:s=>s,money:n=>Number(n).toFixed(2),
 dl:async(wb,name)=>box.downloads.push({wb,name}),weekBounds:()=>['2026-10-19','2026-10-25'],modal:s=>{box.modalHtml=s;}};
vm.createContext(box);
const start=legacy.indexOf('const EDO_CURP='),end=legacy.indexOf('/* ---------- v11: PENDIENTE MANUAL',start);
vm.runInContext(legacy.slice(start,end)+'\n'+code,box);
box.dlText=(text,name)=>box.texts.push({text,name});
const good={id:'ficticio',obra_id:'o1',no_trab:7,primer_apellido:'GARCIA',segundo_apellido:'PEREZ',nombres:'JUAN',
 puesto:'OFICIAL ALBAÑIL',sd:362,sdi:379.85,nss:'00123456789',curp:'GAPJ900101HHGRRN01',rfc:'GAPJ900101AB1',
 fecha_nacimiento:'1990-01-01',fecha_alta:'2026-10-19',genero:'MASCULINO',cp:'01234',telefono:'0123456789',correo:'prueba@example.invalid',estatus:'ACTIVO'};
const catalogo=['AYUDANTE ALBAÑIL','RESIDENTE DE OBRA','OPERADOR DE EXCAVADORA','OFICIAL ALBAÑIL','OFICIAL FIERRERO','OFICIAL CARPINTERO','CABO DE OFICIOS','OPERADOR DE PIPA DE AGUA','OPERADOR DE VIBROCOMPACTADOR','OPERADOR DE MOTOCONFORMADORA','OPERADOR DE TRANSPORTE','OFICIAL PLOMERO','ALMACENISTA','PERSONAL DE LIMPIEZA','OFICIAL ELECTRICISTA','YESERO','AYUDANTE GENERAL','OPERADOR DE MANIPULADOR'];
catalogo.forEach((p,i)=>assert.equal(box.noiPuestoClave(p),i+1));
assert.equal(box.noiPuestoClave('  oficial  albanil '),4);assert.equal(box.noiPuestoClave('AYUDANTE DE ALBAÑIL'),1);
for(const p of ['OPERADOR DE RETROEXCAVADORA','AYUDANTE DE CARPINTERO','JEFE DE OBRA','20',''])assert.equal(box.noiPuestoClave(p),0,'No inventar equivalencias: '+p);
const preparar=ws=>{
 box.WORKERS=ws;box.window._NA_OBRA='o1';box.window._NA_EXPORTANDO=false;box.naLista();
 ws.forEach(w=>{const i=box.window._NA.findIndex(x=>x.id===w.id);if(i>=0)els['na-'+i]={checked:true};});
};
preparar([good]);const snapshot=JSON.stringify(good);
assert.deepEqual(Array.from(box.noiProblemasAlta(good,true)),[]);
const fila=box.noiFilaAlta(good,4);
assert.equal(fila.length,58);
for(const [i,v] of [[0,7],[4,362],[8,'00123456789'],[15,'01234'],[28,'Transferencia'],[40,1],[41,4],[42,3],[47,'02'],[48,'01'],[53,5],[54,4],[56,379.85],[57,365]])assert.equal(fila[i],v);
const book=box.noiLibroAltas([good]),ws=book.Sheets['Trabajadores NUEVOS'];
assert.deepEqual(Array.from(book.SheetNames),['Trabajadores NUEVOS']);
assert.equal(ws['!ref'],'A1:BF2');assert.equal(ws['!cols'].length,58);
assert.equal(ws.AP2.v,4);assert.equal(ws.AO2.v,1);assert.equal(ws.AQ2.v,3);assert.equal(ws.BB2.v,5);assert.equal(ws.BF2.v,365);
for(const a of ['I2','P2','Q2','S2','AV2','AW2','AZ2']){assert.equal(ws[a].t,'s');assert.equal(ws[a].z,'@');}
assert.equal(ws.G2.t,'n');assert.equal(ws.H2.t,'n');assert.equal(ws.G2.z,'dd/mm/yyyy');
assert.equal(JSON.stringify(good),snapshot);
for(const empresa of ['JIRE','PLATINUM']){box.empresaDeObra=()=>empresa;assert.equal(box.noiLibroAltas([good]).__empresaPorHoja['Trabajadores NUEVOS'],empresa);}
assert(!Object.values(ws).some(c=>c&&typeof c==='object'&&c.f),'Sin fórmulas inyectadas en la plantilla');
assert(box.noiFechaValida('2024-02-29'));for(const f of ['2026-02-29','2026-13-01','2026-04-31','19/10/2026',''])assert(!box.noiFechaValida(f));
for(const [k,v] of [['nss','1234567890'],['rfc',''],['curp',''],['sdi',0],['sd',-1],['fecha_alta','2026-02-30'],['fecha_nacimiento',''],['primer_apellido',''],['nombres','UN$NOMBRE']])assert(box.noiProblemasAlta({...good,[k]:v},true).length,k);
const desconocido={...good,id:'desconocido',puesto:'OTRO PUESTO'};
preparar([desconocido]);assert(box.noiProblemasAlta(desconocido,true).includes('seleccionar clave de puesto NOI'));
assert(!box.noiProblemasAlta(desconocido,false).length,'Puesto NOI no es requisito del TXT');
els['na-puesto-0']={value:'17'};assert.equal(box.noiPuestoSeleccionado(desconocido),17);assert(!box.noiProblemasAlta(desconocido,true).length);
els['na-puesto-0'].value='99';assert.equal(box.noiPuestoSeleccionado(desconocido),0);
preparar([good,{...good,id:'futuro',no_trab:8,fecha_alta:'2026-10-26'},{...good,id:'baja',no_trab:9,estatus:'BAJA'}]);
assert.deepEqual(Array.from(box.window._NA,w=>w.id),['ficticio']);
box.window._NA_OBRA='otra';assert.equal(box.noiPrepararAltas(true),null);
preparar([good,{...good,id:'dupe',no_trab:8}]);assert.equal(box.noiPrepararAltas(false),null,'NSS repetido');
preparar([good]);els['na-0'].checked=false;assert.equal(box.noiPrepararAltas(true),null);
els['na-0'].checked=true;els['na-d1'].value='2026-10-26';assert.equal(box.noiPrepararAltas(true),null);els['na-d1'].value='2026-10-19';
box.openAltasNOI();assert(box.modalHtml.includes('id="na-excel"'));assert(box.modalHtml.includes('id="na-txt"'));assert(box.modalHtml.includes('Trabajadores NUEVOS'));
const download=box.dl;
(async()=>{
 preparar([good]);await box.exportAltasNOIExcel();assert.equal(box.downloads.length,1);assert.equal(box.window._NA_EXPORTANDO,false);assert.equal(els['na-excel'].disabled,false);
 box.exportAltasSUATxt();assert.equal(box.texts.length,1);
 assert.equal(box.texts[0].text,'B691861710500123456789GAPJ900101AB1GAPJ900101HHGRRN01GARCIA$PEREZ$JUAN30191020260037985\r\n');
 const sucio={...good,nss:' '+good.nss+' ',rfc:good.rfc.toLowerCase()},antes=JSON.stringify(sucio);
 assert.equal(box.noiLineaSUA(sucio),box.noiLineaSUA(good));assert.equal(JSON.stringify(sucio),antes);
 box.dl=async()=>{throw Error('Fallo simulado');};await box.exportAltasNOIExcel();assert(!box.window._NA_EXPORTANDO);assert.equal(els['na-txt'].disabled,false);assert(box.messages.at(-1).m.includes('Fallo simulado'));box.dl=download;
 box.noiEstadoExportacion(true);await box.exportAltasNOIExcel();assert.equal(box.downloads.length,1);box.noiEstadoExportacion(false);
 preparar([desconocido]);delete els['na-puesto-0'];await box.exportAltasNOIExcel();assert.equal(box.downloads.length,1);box.exportAltasSUATxt();assert.equal(box.texts.length,2);
 preparar([{...good,nss:'123'}]);box.exportAltasSUATxt();assert.equal(box.texts.length,2);
 const many=Array.from({length:1205},(_,i)=>({...good,id:'n'+i,no_trab:i+1,nss:String(i+10000000000)}));
 preparar(many);const selected=box.noiPrepararAltas(true);assert.equal(selected.length,1205);assert.equal(box.noiLibroAltas(selected).Sheets['Trabajadores NUEVOS']['!ref'],'A1:BF1206');
 console.log('PASS altas NOI: 18 claves, 58 columnas, una hoja, constantes confirmadas, ceros iniciales, fechas, contexto, TXT CRLF, selección manual sin escrituras, errores/doble clic y 1205 altas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
