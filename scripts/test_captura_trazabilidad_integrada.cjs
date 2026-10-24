// Regresión del flujo real de captura + modelo + selección + referencias.
// Datos ficticios; RPC simulado, sin navegador ni escrituras de producción.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const adapter=fs.readFileSync('frontend/modulos/38-adaptadores-arranque.js','utf8');
function functions(file,names){const src=fs.readFileSync(file,'utf8');return acorn.parse(src,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>src.slice(n.start,n.end)).join('\n');}
const w={id:'W',obra_id:'O',no_trab:1,nombres:'FICTICIA',estatus:'ACTIVO',fecha_alta:'2026-06-01',periodo_pago:'SEMANAL',sal_semanal:1000,cuenta:'1234567890'};
let historical=true,failModel=false,failRefs=false,changed=false;
let historic=[{id:'D',obra_id:'O',trabajador_id:'W',tipo:'INFONAVIT',activo:true,recurrente:true,monto:100}],live=[{...historic[0],activo:false,monto:200}];
const b={Date,Intl,WORKERS:[w],DESC:live,DIFS:[],FINTRANS:[],OBRA:{id:'O',nombre:'OBRA FICTICIA'},_PY_BAJAS_HISTORICAS:[],
 semRange:()=>['2026-09-21','2026-09-27'],today:()=>historical?'2026-10-24':'2026-09-20',pyDatosFrescos:async()=>true,
 proyLeerContextoHistorico:async()=>({personal:b.WORKERS,descuentos:historic,trazabilidad:{version:1}}),
 pyCandidatos:()=>({act:b.WORKERS,fins:[]}),proyLeerFiniquitos:async()=>{if(changed)b.DESC=[];return[];},
 perDe:()=>({dias:7,cve:'SEMANAL'}),adaptarRetencionPeriodo:d=>d,descuentoVigenteSemana:()=>true,
 montoDescuento:d=>d.monto,retencionEvaluada:d=>({monto:d.monto,estado:'NORMAL',extra:0}),retencionAplicadaPeriodo:d=>{if(failModel)throw Error('Fallo de modelo ficticio');return{monto:d.monto,estado:'NORMAL',extra:0};},
 difDe:()=>0,finTransDe:()=>null,fullName:x=>x.nombres,empresaDeObra:()=> 'PLATINUM',MOTOR_NOMINA_VERSION:'PRUEBA',
 redondearCentavos:x=>Math.round(x*100)/100,money:x=>Number(x).toFixed(2)};
vm.createContext(b);
vm.runInContext(functions('frontend/modulos/08-retenciones-incidencias.js',['retencionesDePeriodo','descuentosDe']),b);
vm.runInContext(functions('frontend/modulos/10-proyeccion-nomina.js',['proyRetenciones','proyModelo','proyFiniquito']),b);
vm.runInContext(functions('frontend/modulos/39-rrhh-adaptadores.js',['rrhhReferenciasModelo']),b);
const actualRefs=b.rrhhReferenciasModelo;b.rrhhReferenciasModelo=(...args)=>{if(failRefs)throw Error('Fallo de referencias ficticio');return actualRefs(...args);};
vm.runInContext(functions('frontend/modulos/38-adaptadores-arranque.js',['proySnapshotIntegrado']),b);
let calls=[],view='',messages=[],capturePayload;
const closure={id:'C',obra_id:'O',semana:26,periodo:'SEMANAL',estado:'BORRADOR',total_neto:800,snapshot:{items:[],modelo:{filas:[]}}};
const detail=()=>({cierre:closure,flujo:{sucio:false},diagnostico:{filas:[],pendientes:0},saldos:[],versiones:[],solicitudes:[]});
const sb={rpc:async(name,args)=>{calls.push(args);const a=args.p_accion;
 if(a==='FUENTE')return{data:{fuente:'FUENTE_FICTICIA'}};
 if(a==='PERMISOS')return{data:{escritura:true,admin:false,aprobar_cierre:false}};
 if(a==='DETALLE')return{data:detail()};
 if(a==='CREAR'){capturePayload=args.p_datos;return{data:{cierre_id:'C'}};}
 return{data:{ok:true}};
}};
vm.runInContext(fs.readFileSync('platinum-workflows.js','utf8'),b);
b.window=b;
const elements={'cc-sem':{value:'26'},'cc-per':{value:'SEMANAL'},'cc-obs':{value:''},'flow-reason':{value:'Prueba ficticia'}};
b.PLATINUM_FLOWS.configure({context:()=>({sb,obra:b.OBRA,workers:b.WORKERS,empresaNombre:'PLATINUM'}),$:id=>elements[id],esc:x=>String(x??''),money:b.money,table:(h,r)=>r.join(''),modal:s=>view=s,toast:s=>messages.push(s),reload:async()=>{},capture:b.proySnapshotIntegrado});
const sources=()=>({workers:b.WORKERS,desc:b.DESC,ciclos:b._PY_BAJAS_HISTORICAS,difs:b.DIFS,transfer:b.FINTRANS});
let checks=0;
function restored(before){for(const [key,val]of Object.entries(sources())){assert.strictEqual(val,before[key]);checks++;}}
function coherent(r){const f=r.snapshot.modelo.filas[0],refs=r.snapshot.trazabilidad.trabajadores.W.retenciones;
 assert.equal(f.items.length,refs.length);for(let i=0;i<refs.length;i++){assert.equal(refs[i].id,historic[i].id);assert.equal(refs[i].tipo,historic[i].tipo);assert.equal(refs[i].monto_usado,f.items[i].monto);assert.equal(refs[i].entradas.monto_capturado,historic[i].monto);checks+=4;}checks++;
 assert.equal(r.snapshot.total_neto,1000-historic.reduce((s,d)=>s+d.monto,0));checks++;
}
(async()=>{
 const before=sources();const original=JSON.stringify({live,historic,w});
 // El crédito inactivo HOY sí se retuvo en la semana: reproduce el fallo real.
 let r=await b.proySnapshotIntegrado(26,'SEMANAL');coherent(r);restored(before);
 assert.equal(JSON.stringify({live,historic,w}),original);checks++;
 // Igual cantidad de conceptos, diferente cuota y tipo: referencias del pasado.
 b.DESC=live=[{...historic[0],tipo:'FONACOT',monto:300}];r=await b.proySnapshotIntegrado(26,'SEMANAL');coherent(r);assert.strictEqual(b.DESC,live);checks++;
 historic=[historic[0],{...historic[0],id:'F',tipo:'FALTA',recurrente:false,semana:'S26',monto:50},{...historic[0],id:'FC',tipo:'FONACOT',monto:75}];
 r=await b.proySnapshotIntegrado(26,'SEMANAL');coherent(r);
 // Volver a capturar produce la misma propuesta, no mezcla ni muta fuentes.
 assert.equal(JSON.stringify((await b.proySnapshotIntegrado(26,'SEMANAL')).snapshot),JSON.stringify(r.snapshot));checks++;
 for(const stage of ['modelo','referencias']){const prev=sources();failModel=stage==='modelo';failRefs=stage==='referencias';await assert.rejects(b.proySnapshotIntegrado(26,'SEMANAL'),/Fallo de/);checks++;restored(prev);failModel=false;failRefs=false;}
 // Los rechazos reales de fuentes incoherentes siguen habilitados.
 assert.throws(()=>actualRefs(r.snapshot.modelo.filas,[],'S26','F'),/fuente de retenciones|no coinciden/);checks++;
 changed=true;await assert.rejects(b.proySnapshotIntegrado(26,'SEMANAL'),/Cambió el contexto/);checks++;changed=false;b.DESC=live;
 // Semana actual y quincenas siguen tomando su propia fuente, no histórico.
 historical=false;r=await b.proySnapshotIntegrado(26,'SEMANAL');assert.equal(r.snapshot.contexto_historico,undefined);assert.equal(r.snapshot.total_neto,700);checks+=2;
 historical=true;r=await b.proySnapshotIntegrado(26,'QUINCENAL');assert.equal(r.snapshot.contexto_historico,undefined);assert.equal(r.snapshot.total_neto,700);checks+=2;
 // Recorrer los botones reales: crear tras eliminación y preparar existente.
 calls=[];messages=[];await b.PLATINUM_FLOWS.crearCierre();assert(calls.some(x=>x.p_accion==='CREAR'));coherent(capturePayload);assert(!messages.some(x=>/Cambió|no coinciden/.test(x)));checks+=2;
 calls=[];await b.PLATINUM_FLOWS.abrirCierre('C');await b.PLATINUM_FLOWS.preparar('C');assert(view.includes('regularización histórica'));assert(!calls.some(x=>x.p_accion==='PREPARAR'));checks+=2;
 await b.PLATINUM_FLOWS.enviarPropuesta('C');const request=calls.find(x=>x.p_accion==='SOLICITAR');assert(request);coherent(request.p_datos.propuesta);checks++;
 assert(calls.every(x=>!['TRANSICION','VINCULAR_PAGO'].includes(x.p_accion)));checks++;
 console.log('PASS '+checks+' comprobaciones integradas: captura real, modelo, retenciones y referencias; botones crear/preparar/solicitar, restauración, repetibilidad y guardas. Sin navegador ni producción.');
})().catch(e=>{console.error(e);process.exitCode=1;});
