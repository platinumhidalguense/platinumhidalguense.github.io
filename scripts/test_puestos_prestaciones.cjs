// Integración sintética de los adaptadores. Sin navegador ni peticiones de red.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const catalogo=JSON.parse(fs.readFileSync('scripts/fixtures/puestos-noi.json','utf8'));
const w={id:'ficticio',obra_id:'obra',sd:362,sdi:379.85,estatus:'ACTIVO',fecha_alta:'2026-09-01',updated_at:'2026-11-11T12:00:00Z',puesto:'YESERO'};
const nodes=Object.fromEntries(Object.entries({'pr-fecha':'2026-11-11','pr-despido':'NO','f-pr-dias':'0','pr-isr-noi':'','pr-noi':''}).map(([k,value])=>[k,{value,isConnected:true}]));
nodes['pr-out']={innerHTML:'',isConnected:true};nodes['pr-faltas-hist']={innerHTML:'',isConnected:true};nodes['pr-usar']={disabled:true};
const box={window:{},USER:{id:'usuario'},WORKERS:[w],DESC:[],CFGEMP:{puestos_central:structuredClone(catalogo)},OBRA:{id:'obra'},
 $:id=>nodes[id],iniAntig:x=>x.fecha_reingreso||x.fecha_alta,empresaDeObra:()=> 'PLATINUM',empresaDeTrabajador:()=> 'PLATINUM',
 fullName:()=> 'PERSONA FICTICIA',esc:s=>String(s??''),money:v=>Number(v).toFixed(2),today:()=> '2026-11-11',ctrlTabla:()=>'',numeroCreditoInfonavit:()=>'',
 sb:{rpc:async()=>{throw Error('No se debe leer fuera de los fixtures');}}};
vm.createContext(box);
for(const f of ['27-fiscal-costos','33-finiquitos','46-papeles-prestaciones','80-puestos-central','81-prestaciones-fuentes'])vm.runInContext(fs.readFileSync('frontend/modulos/'+f+'.js','utf8'),box);
box.prAjusteNoiAplicable=()=>null;box.numeroCreditoInfonavit=()=>'';
const P=box.window.PLATINUM_PRESTACIONES_FUENTES;
let checks=0;const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
// Reordenar la tabla no puede cambiar las claves externas.
box.CFGEMP.puestos_central.catalogo.reverse();
for(const [p,k]of[['YESERO',16],['OFICIAL PINTOR',20],['OPERADOR DE MAQUINARIA',19],['OPERADOR DE VIBROCOMPACTADOR',9]])eq(box.noiPuestoClave?box.noiPuestoClave(p):box.puestoResolver(p).clave,k,p);
eq(box.puestoResolver('AYUDANTE YESERO').resuelto,false);eq(box.catalogoPuestos().length,20,'selector sin administrativos ni especialidades no autorizadas');
const fuente={firma:'firma-fixture',trabajador_id:w.id,obra_id:w.obra_id,inicio_ciclo:w.fecha_alta,desde:w.fecha_alta,corte:'2026-11-11',dias_base:71,faltas:5,dias_aguinaldo:66,aguinaldo_acreditado:200,exento_ag_usado:200,etiqueta:'Cálculo con faltas registradas disponibles',referencias:[{id:'pago-anterior',importe:200}],reservas:[],informativos:[{id:'papel-no-aplicado'}],detalle:[],limitaciones:[]};
P.registrar(w,fuente.corte,fuente);const antes=JSON.stringify({w,desc:box.DESC});
box.calcPrestaciones(w.id);eq(box._PR_AUDIT.entradas.faltas_aguinaldo,5,'individual usa fuente histórica común');
let e=box.ppfEntradas(w,fuente.corte,box._PR_AUDIT),r=box.ppfModelo(e);
eq(Number(e.dias_aguinaldo),66,'papel no recalcula otras faltas');eq(Number(e.aguinaldo_acreditado),200,'concepto respaldado separado de los días');
nodes['pr-isr-noi'].value=String(r.d001);box.calcPrestaciones(w.id);
eq(box._PR_AUDIT.resultado.aguinaldo,r.aguinaldo,'individual y papel mismo aguinaldo');eq(box._PR_AUDIT.monto_modelo,r.neto_con_credito,'mismo neto a centavos');
eq(P.decision(fuente).puede_continuar,true,'un papel no aplicado no bloquea');
assert.throws(()=>P.decision({...fuente,reservas:[{id:'reserva'}]}),/reservado/);checks++;
assert.throws(()=>P.decision({...fuente,exento_acreditado_pendiente:true}),/parte exenta/);checks++;
eq(JSON.stringify({w,desc:box.DESC}),antes,'no reescribe persona ni crea descuento monetario');
// La reimpresión de una constancia usa su snapshot, nunca equivalencias nuevas.
const acorn=require('acorn'),laboral=fs.readFileSync('frontend/modulos/31-documentos-laborales.js','utf8');
vm.runInContext(acorn.parse(laboral,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&['clFechaLarga','constanciaLaboralHTML'].includes(n.id.name)).map(n=>laboral.slice(n.start,n.end)).join('\n'),box);
box.logoEmpresa=()=>'';box.MES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const reg={folio:'CL-FICTICIO',fecha_expedicion:'2026-11-11',snapshot:{empresa:{codigo:'PLATINUM'},trabajador:{nombre:'PERSONA FICTICIA',puesto:'YESERO',estatus:'ACTIVO'},documento:{periodo_desde:'2026-09-01'}}};
const archivo=box.constanciaLaboralHTML(reg);eq(archivo.includes('<b>YESERO</b>'),true,'constancia anterior conserva el puesto original');
reg.snapshot.resolucion_puesto={clave:16,descripcion:'OFICIAL YESERO'};const nueva=box.constanciaLaboralHTML(reg);
box.CFGEMP.puestos_central={catalogo:[],equivalencias:[]};eq(box.constanciaLaboralHTML(reg),nueva,'constancia nueva conserva la resolución archivada aunque cambie catálogo');
for(const p of ['frontend/modulos/52-motor-nomina-semanal.js','frontend/modulos/53-motor-nomina-quincenal.js']){
 const original=cp.execFileSync('git',['show','HEAD:'+p]);eq(fs.readFileSync(p).equals(original),true,'motor intacto '+p);
}
(async()=>{
 P.invalidar(w,fuente.corte);let llamadas=0,resolver;
 box.sb.rpc=()=>{llamadas++;return new Promise(r=>resolver=r);};
 const a=P.cargar(w,fuente.corte),b=P.cargar(w,fuente.corte);resolver({data:fuente});await Promise.all([a,b]);eq(llamadas,1,'una lectura compartida para llamadas concurrentes');
 P.invalidar(w,fuente.corte);box.sb.rpc=async()=>({error:{message:'Fallo sintético'}});await assert.rejects(P.cargar(w,fuente.corte),/Fallo sintético/);checks++;eq(P.obtener(w,fuente.corte),null,'fallo de lectura no equivale a cero');
 assert.throws(()=>P.registrar(w,'2026-11-12',fuente),/otra ficha, fecha o ciclo/);checks++;
 console.log('PASS '+checks+' comprobaciones: catálogo20 estable, cálculo individual/papel común, acreditaciones/reservas, sin mutaciones, dos motores intactos, concurrencia y error de lectura.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
