// Panel real y archivo ficticio. Sin navegador ni conexión a producción.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseHTML}=require('linkedom'),XLSX=require('xlsx-js-style');
const {window,document}=parseHTML('<html><body><main></main></body></html>');
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._valor??this.querySelector('option[selected]')?.value??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._valor=v;}});
const ws={B11:{t:'s',v:'AGUINALDO'},G11:{t:'n',v:1772.3712328767124},B18:{t:'s',v:'AGUINALDO'},C18:{t:'n',v:1772.3712328767124},'!ref':'B1:G32'};
const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'SEMANA FICTICIA');
const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),sha=crypto.createHash('sha256').update(bytes).digest('hex');
let checks=0,acepta=false,falla=false,lecturaMala=false,vinculos=0,recalculados=0,consultas=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert(a,m);checks++;};
const tick=async()=>{for(let i=0;i<14;i++)await new Promise(r=>setImmediate(r));};
const datos={trabajador_id:'W',huella:'FUENTES_1',permisos:{captura:true,correccion:true},bajas:[{fecha_baja:'2026-08-03',ciclo_desde:'2026-04-20',version:0,estado:'PENDIENTE',fuentes:[
 {clave:'PAPEL:P',tipo:'PAPEL',id:'P',aguinaldo:1772.37,neto:3507.85,exento:null,fuente_sha256:sha,hoja:'SEMANA FICTICIA',fila:2,datos:{aguinaldo:{celda:'G11'}}}],
 respaldos:[{clave:'CHEQUE:C',tipo:'CHEQUE',neto:3507.85,estado:'PAGADO',fecha_pago:'2026-08-07'}]}]};
const box={window:null,document,console,Date,Number,String,Array,Object,Set,Map,JSON,Promise,Error,RegExp,Math,Uint8Array,
 crypto:crypto.webcrypto,atob:s=>Buffer.from(s,'base64').toString('binary'),XLSX,USER:{id:'U'},OBRA:{id:'O'},
 $:id=>document.getElementById(id),esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 fullName:()=> 'PERSONA FICTICIA',fmtD:d=>d||'—',money:n=>Number(n).toFixed(2),
 ctrlTabla:(cols,rows)=>'<table><tbody>'+rows.join('')+'</tbody></table>',confirm:()=>acepta,
 modal2:html=>{document.querySelector('main').innerHTML=html;},closeModal2:()=>{document.querySelector('main').innerHTML='';},
 sb:{rpc:async(fn,a)=>{eq(fn,'control_aguinaldo_evidencias','RPC única del panel');if(a.p_accion==='LEER'){consultas++;return{data:structuredClone(datos)};}
   if(falla)return{error:{message:'Las fuentes cambiaron. Vuelve a revisar esta persona'}};
   eq(a.p_datos.importe_bruto,1772.37,'valor de aguinaldo exacto');eq(a.p_datos.exento,1772.37,'exento del original verificado');
   eq(a.p_datos.estado_operacion,'PAGADO','respaldo entregado');ok(a.p_datos.operacion_id,'identificador de reintento');
   vinculos++;return{data:{id:'RESOLUCION',version:1}};},
  from:tabla=>{eq(tabla,'prestaciones_fuentes_historicas','original bajo demanda');const q={select(){return q;},eq(){return q;},async single(){return{data:{contenido_base64:bytes.toString('base64'),sha256:lecturaMala?'INCORRECTA':sha,archivo:'ORIGINAL_FICTICIO.xlsx'}};}};return q;}}};
box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync('frontend/modulos/77-aguinaldo-evidencias.js','utf8'),box);
const sel=q=>document.querySelector(q),click=async q=>{sel(q).click();await tick();},cambiar=(q,v)=>{sel(q).value=v;sel(q).dispatchEvent(new window.Event('change',{bubbles:true}));};
(async()=>{
 await box.PLATINUM_AGUINALDO_EVIDENCIAS.abrir({trabajador:{id:'W',no_trab:1,obra_id:'O'},ejercicio:2026,alResolver:()=>recalculados++});
 ok(sel('[data-ae-fuente]'),'selector disponible');eq(sel('[data-ae-exento]').value,'','no inventa exención');
 eq(consultas,1,'lectura inicial acotada');
 lecturaMala=true;await click('[data-ae="original"]');ok(sel('[data-ae-aviso]').textContent.includes('huella'),'rechazo de original distinto');
 lecturaMala=false;await click('[data-ae="original"]');eq(sel('[data-ae-exento]').value,'1772.37','propuesta leída del original');
 ok(sel('[data-ae-original]').textContent.includes('G11'),'celda de procedencia visible');ok(sel('[data-ae-original]').textContent.includes('C18'),'celda exenta visible');
 cambiar('[data-ae-respaldo]','CHEQUE:C');eq(sel('[data-ae-fecha]').value,'2026-08-07','fecha del respaldo');
 sel('[data-ae-motivo]').value='Verificado el original ficticio';
 await click('[data-ae="vincular"]');eq(vinculos,0,'confirmación negativa no escribe');
 acepta=true;falla=true;await click('[data-ae="vincular"]');eq(vinculos,0,'error de servidor no confirma vínculo');
 ok(sel('[data-ae-aviso]').textContent.includes('fuentes cambiaron'),'conflicto accionable');
 falla=false;await click('[data-ae="vincular"]');eq(vinculos,1,'único vínculo confirmado');eq(recalculados,1,'recalcula sólo la persona resuelta');
 await click('[data-ae="cerrar"]');eq(document.querySelector('main').innerHTML,'','cerrar funciona');
 console.log('PASS panel de evidencias: '+checks+' comprobaciones de lectura, huella, original, confirmación, error, vínculo y recálculo.');
})().catch(e=>{console.error(e);process.exitCode=1;});
