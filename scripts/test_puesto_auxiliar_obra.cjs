// Puesto NOI 21 · AUXILIAR DE OBRA (SD 376, SDI 394.5425, semanal neto 2,484.74).
// Recorre las funciones reales que usan puestos, claves y salarios: catálogo/selector, alta nueva,
// cambio de puesto en la ficha, Excel NOI de altas y TXT de altas SUA. Datos ficticios; sin red ni base.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},ok=(v,m)=>{assert(v,m);n++;};
const VARS=['PERIODOS','ISR_M','F_SEM','SEMANA1','normSem','NOI_HDR','EDO_CURP','NOI_ANCHOS_ALTAS'];
const code=[];for(const p of JSON.parse(fs.readFileSync('frontend/modulos.json')).modules){const s=fs.readFileSync(p,'utf8');
 for(const x of acorn.parse(s,{ecmaVersion:'latest'}).body)if(x.type==='FunctionDeclaration'||x.type==='VariableDeclaration'&&x.declarations.some(d=>VARS.includes(d.id?.name)))code.push(s.slice(x.start,x.end));}
const catalogo=JSON.parse(fs.readFileSync('scripts/fixtures/puestos-noi.json','utf8'));
// Tabulador vigente en producción tras la migración (sólo puestos y SD; sin personas).
const tabulador={'OFICIAL ALBAÑIL':362,'AYUDANTE GENERAL':329,'AUXILIAR DE OBRA':376};
const fiscal={anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66,subsidio_semanal_metodo:'cuota_diaria_truncada',
 ceav:[[1,3.15],[1.5,3.68],[2,4.85],[2.5,5.56],[3,6.03],[3.5,6.36],[4,6.61],[99,7.51]],seguro_danos_bim:15,isn:3};
const nodo=v=>({value:v,dataset:{},innerHTML:'',textContent:''});
let els={};
const box={console,window:{},CFGEMP:{fiscal,tabulador,puestos_central:structuredClone(catalogo)},WORKERS:[],OBRA:{id:'o1',registro_patronal:'B6918617105'},
 XLSX:null,texts:[],messages:[]};
vm.createContext(box);
vm.runInContext(fs.readFileSync('frontend/modulos/80-puestos-central.js','utf8'),box);
vm.runInContext(code.join('\n'),box);
Object.assign(box,{$:id=>els[id],esc:s=>String(s??''),money:v=>Number(v).toFixed(2),empresaDeObra:()=> 'PLATINUM',empresaDeTrabajador:()=> 'PLATINUM',
 toast:(m,t)=>box.messages.push({m,t}),dlText:(text,name)=>box.texts.push({text,name}),rpDe:w=>w.registro_patronal||box.OBRA.registro_patronal,
 fullName:w=>[w.primer_apellido,w.segundo_apellido,w.nombres].filter(Boolean).join(' ')});
const formulario=(w,puesto)=>{els={'f-puesto':nodo(puesto),'f-sd':nodo(w?String(w.sd):''),'f-sdi':nodo(w?String(w.sdi):''),'f-sal_semanal':nodo(w?String(w.sal_semanal):''),
 'h-puesto':nodo(''),'f-periodo_pago':nodo('SEMANAL'),'worker-form-body':{dataset:{workerId:w?.id||''}}};};
const valores=()=>[els['f-sd'].value,els['f-sdi'].value,els['f-sal_semanal'].value].map(String);

// 1) Catálogo y selector: la clave 21 aparece después de las 20 autorizadas, sin reordenarlas.
const lista=box.catalogoPuestos();
eq(lista.length,21,'21 puestos en el selector de alta, cambio de puesto y recepción de papeles');
eq(lista[20],'AUXILIAR DE OBRA','AUXILIAR DE OBRA es la clave 21');
eq(lista.slice(0,20),catalogo.catalogo.slice(0,20).map(c=>c.descripcion),'claves 1–20 intactas y en su orden');
for(const v of ['AUXILIAR DE OBRA','auxiliar  de obra',' Auxiliar de Obra '])eq(box.puestoResolver(v).clave,21,'resuelve «'+v+'»');
eq(box.puestoNombre({puesto:'auxiliar de obra'}),'AUXILIAR DE OBRA','descripción de salida');
for(const v of ['AUXILIAR ADMINISTRATIVO','AUXILIAR','AUXILIAR DE OBRAS CIVILES'])eq(box.puestoResolver(v).resuelto,false,'no inventa equivalencia para «'+v+'»');
eq(box.noiPuestoClave('OFICIAL PINTOR'),20,'la clave 20 no cambia');

// 2) Alta nueva: el tabulador llena SD, SDI de primer año y semanal neto del motor real.
formulario(null,'AUXILIAR DE OBRA');box.tabAssist();
eq(valores(),['376','394.5425','2484.74'],'alta: SD 376 · SDI 394.5425 · semanal 2,484.74');
ok(/SD \$376 · SDI \$394\.5425/.test(els['h-puesto'].innerHTML)&&/NETO estimado \$2484\.74/.test(els['h-puesto'].innerHTML),'alta: desglose visible');
const nn=box.sueldoNetoPeriodo(376,'394.5425',{periodo_pago:'SEMANAL'});
eq([nn.bruto,nn.isr,nn.imss,nn.sub,nn.neto,nn.motor],[2632,80.47,66.79,123.27,2484.74,'SEMANAL_V1'],'motor semanal: bruto 2,632 − ISR 80.47 − IMSS 66.79 = 2,484.74');
// Elegir otro puesto y volver: las sugerencias se actualizan (antes el semanal se quedaba con el primero).
els['f-puesto'].value='AYUDANTE GENERAL';box.tabAssist();eq(valores()[0],'329','alta: otro puesto cambia el SD');
ok(valores()[2]!=='2484.74','alta: el semanal sugerido sigue al puesto elegido');
els['f-puesto'].value='AUXILIAR DE OBRA';box.tabAssist();eq(valores(),['376','394.5425','2484.74'],'alta: volver al puesto restablece la sugerencia');
// Un salario escrito a mano no se sustituye; se avisa la diferencia.
els['f-sal_semanal'].value='2500.00';els['f-puesto'].value='AUXILIAR DE OBRA';box.tabAssist();
eq(valores()[2],'2500.00','alta: importe capturado a mano conservado');ok(/Se conservó el salario del periodo capturado \(\$2500\.00\); el tabulador sugiere \$2484\.74/.test(els['h-puesto'].innerHTML),'alta: aviso de diferencia');

// 3) Cambio de puesto en la ficha: OFICIAL ALBAÑIL (362 / 379.8521 / 2,400.26) → AUXILIAR DE OBRA.
const w={id:'w1',obra_id:'o1',no_trab:7,puesto:'OFICIAL ALBAÑIL',sd:362,sdi:379.8521,sal_semanal:2400.26,periodo_pago:'SEMANAL'};
box.WORKERS=[w];const antes=JSON.stringify(w);
formulario(w,'AUXILIAR DE OBRA');box.tabAssist();
eq(valores(),['376','394.5425','2484.74'],'cambio de puesto: SD, SDI y semanal del puesto nuevo');
ok(/Salario del periodo: \$2400\.26 → \$2484\.74/.test(els['h-puesto'].innerHTML),'cambio de puesto: muestra el salario anterior y el nuevo');
// Volver al puesto original sin guardar restaura los importes documentados de la ficha.
els['f-puesto'].value='OFICIAL ALBAÑIL';box.tabAssist();
eq(valores(),['362','379.8521','2400.26'],'cambio revertido: SD, SDI y semanal documentados');
eq(JSON.stringify(w),antes,'el formulario no modifica la ficha hasta guardar');
// Un SDI documentado distinto (NOI) se conserva si el SD no cambia.
const w2={...w,id:'w2',sdi:400.408123};box.WORKERS=[w2];formulario(w2,'OFICIAL ALBAÑIL');box.tabAssist();
eq(valores().slice(1),['400.408123','2400.26'],'mismo SD: SDI de NOI y semanal de la ficha conservados');
// Ya con AUXILIAR DE OBRA guardado, reabrir la ficha no altera nada.
const w3={...w,id:'w3',puesto:'AUXILIAR DE OBRA',sd:376,sdi:394.5425,sal_semanal:2484.74};box.WORKERS=[w3];formulario(w3,'AUXILIAR DE OBRA');box.tabAssist();
eq(valores(),['376','394.5425','2484.74'],'ficha AUXILIAR DE OBRA: idempotente al reabrir');

// 4) Layouts: Excel NOI de altas (clave de puesto 21, SD y SDI) y TXT de altas SUA (SDI en centavos).
const alta={...w3,id:'w4',primer_apellido:'GARCIA',segundo_apellido:'PEREZ',nombres:'JUAN',nss:'00123456789',curp:'GAPJ900101HHGRRN01',rfc:'GAPJ900101AB1',
 fecha_nacimiento:'1990-01-01',fecha_alta:'2026-11-16',genero:'MASCULINO',cp:'01234',estatus:'ACTIVO'};
eq(Array.from(box.noiProblemasAlta(alta,true)),[],'alta completa sin observaciones (incluye clave de puesto NOI)');
eq(box.noiPuestoSeleccionado(alta),21,'Excel NOI: puesto con clave 21');
const fila=box.noiFilaAlta(alta,box.noiPuestoSeleccionado(alta));
eq([fila[4],fila[40],fila[41],fila[42],fila[56],fila[57]],[376,1,21,3,394.5425,365],'Excel NOI: SD 376, depto 1, puesto 21, contrato 3, SDI 394.5425, 365 días');
eq(Array.from(vm.runInContext('[NOI_HDR[4],NOI_HDR[41],NOI_HDR[56]]',box)),['Salario diario','Puesto','SDI capturado'],'columnas E = Salario diario, AP = Puesto, BE = SDI capturado');
const sua=box.noiLineaSUA(alta);
eq(sua,'B691861710500123456789GAPJ900101AB1GAPJ900101HHGRRN01GARCIA$PEREZ$JUAN30161120260039454','TXT SUA: SDI 394.5425 → 0039454 (394.54)');
ok(!/AUXILIAR/.test(sua),'el layout SUA no lleva puesto: sólo identificación, fecha y SDI');
// Sin clave NOI el Excel no se genera (no se inventa la clave).
eq(box.noiProblemasAlta({...alta,puesto:'AUXILIAR ADMINISTRATIVO'},true).includes('seleccionar clave de puesto NOI'),true,'puesto sin clave bloquea el Excel');
console.log('PASS puesto 21 AUXILIAR DE OBRA: '+n+' comprobaciones (selector 21 claves, resolución exacta, alta 376/394.5425/2,484.74 con motor real, cambio de puesto y reversión, importe manual conservado, Excel NOI clave 21, TXT SUA SDI 394.54)');
