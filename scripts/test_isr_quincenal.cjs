// Datos sintéticos; sin navegador, cuentas ni cambios en producción.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const functions=(file,names)=>{const s=fs.readFileSync(file,'utf8');return acorn.parse(s,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>s.slice(n.start,n.end)).join('\n');};
const fiscal=fs.readFileSync('frontend/modulos/27-fiscal-costos.js','utf8'),tarifa=fiscal.match(/const ISR_M=\[[\s\S]*?\];/)[0];
const box={console,Date,Map,Set,Number,Math,Error,window:{},FISC:()=>({anio:2026,sm:315.04,uma:117.31}),rangoRetencion:()=>['2026-10-16','2026-10-31']};
vm.createContext(box);
vm.runInContext("const PERIODOS={SEMANAL:{cve:'SEMANAL',dias:7,lab:6,etiqueta:'semanal'},QUINCENAL:{cve:'QUINCENAL',dias:15,lab:15,etiqueta:'quincenal'}};"+tarifa+
 functions('frontend/modulos/08-retenciones-incidencias.js',['perDe','periodoPago'])+functions('frontend/modulos/27-fiscal-costos.js',['isrTarifa','factorISR','isrPeriodo','redondearCentavos'])+functions('frontend/modulos/29-bajas-creditos-motor.js',['nominaPeriodo'])+fs.readFileSync('frontend/modulos/48-isr-mensual-quincenal.js','utf8'),box);
const input={desde:'2026-10-16',hasta:'2026-10-31',gravable_acumulado:10000,gravable_actual:10000,impuesto_local:0,isr_acumulado:1050,isr_ordinario:1000,dias_subsidio:30.4};
let checks=0;const plain=x=>x===undefined?'__undefined__':JSON.parse(JSON.stringify(x));const eq=(a,b)=>{assert.deepEqual(plain(a),plain(b));checks++;};
const bad=(f,re)=>{assert.throws(f,re);checks++;};
(async()=>{
 const a=box.isrQCalcular(input);eq(a.isr_mensual,2383.65);eq(a.isr_quincenal,1333.65);eq(a.delta_isr,333.65);
 for(const [m,last]of[['02','28'],['04','30'],['10','31']])eq(box.isrQCalcular({...input,desde:`2026-${m}-16`,hasta:`2026-${m}-${last}`}).isr_quincenal,1333.65);
 bad(()=>box.isrQCalcular({...input,desde:'2026-10-01',hasta:'2026-10-15'}),/segunda/);
 bad(()=>box.isrQCalcular({...input,desde:'2026-02-16',hasta:'2026-02-29'}),/quincena|fiscales/);
 bad(()=>box.isrQCalcular({...input,desde:'2027-01-16',hasta:'2027-01-31'}),/2026/);
 for(const key of ['gravable_acumulado','gravable_actual','impuesto_local','isr_acumulado','isr_ordinario','dias_subsidio'])for(const value of [null,'',NaN,Infinity,-1])bad(()=>box.isrQCalcular({...input,[key]:value}),/inválid|Falta|Revisa/);
 bad(()=>box.isrQCalcular({...input,dias_subsidio:31}),/Revisa/);
 bad(()=>box.isrQCalcular({...input,impuesto_local:1001}),/Revisa/);
 const low=box.isrQCalcular({...input,gravable_acumulado:5000,gravable_actual:5000,isr_acumulado:80});eq(low.subsidio_mensual,535.65);
 eq(box.isrQCalcular({...input,gravable_acumulado:0,gravable_actual:0,isr_acumulado:0,isr_ordinario:0}).isr_quincenal,0);
 const row={w:{id:'FICTICIO',no_trab:1,obra_id:'OBRA',periodo_pago:'QUINCENAL'},fin:false,sueldo:10000,prevision:2000,incidencias:400,creditos:500,otras:50,costo:9600,neto:11050,items:[]};
 const source={...input,id:'FUENTE',revision:1};
 const f=box.isrQAplicarFila(row,source);eq(f.sueldo,9666.35);eq(f.prevision,2333.65);eq(f.neto,row.neto);eq([f.incidencias,f.creditos,f.otras],[400,500,50]);eq(row.sueldo,10000);
 eq(box.isrQAplicarFila(f,source),f);bad(()=>box.isrQAplicarFila(f,{...source,id:'OTRA'}),/otro ajuste/);
 const down=box.isrQAplicarFila(row,{...source,isr_ordinario:1500});eq(down.prevision,1833.65);eq(down.sueldo,10166.35);eq(down.neto,row.neto);
 const interna=box.isrQAplicarFila({...row,prevision:0,neto:9050},{...source,prevision_referencia:2000});eq(interna.neto,11050);eq(interna.prevision,2333.65);eq(interna.isr_mensual.prevision_origen,'CONTROL_INTERNO_QUINCENAL');
 bad(()=>box.isrQAplicarFila({...row,prevision:0},source),/insuficiente/);
 bad(()=>box.isrQAplicarFila({...row,prevision:10},{...source,isr_ordinario:1500}),/insuficiente/);
 bad(()=>box.isrQAplicarFila(row,{...source,isr_acumulado:9999}),/saldo a favor/);
 eq(box.isrQAplicarFila({...row,fin:true},source),{...row,fin:true});
 let calls=0;box.sb={rpc:async()=>{calls++;return {data:{filas:[{...source,trabajador_id:'FICTICIO',vigente:true}]}};}};
 const model={filas:[row],items:[],sem:'S30',costo:9600,neto:11050};
 const out=await box.isrQAplicarModelo(model);eq(out.filas[0].neto,11050);eq(calls,1);
 box.sb.rpc=async()=>({data:{filas:[]}});await assert.rejects(box.isrQAplicarModelo(model),/falta un ajuste/);checks++;
 box.sb.rpc=async()=>({data:{filas:[{...source,trabajador_id:'FICTICIO',vigente:false}]}});await assert.rejects(box.isrQAplicarModelo(model),/vigente/);checks++;
 const weekly={...model,filas:[{...row,w:{...row.w,periodo_pago:'SEMANAL'}}]};eq(await box.isrQAplicarModelo(weekly),weekly);
 box.rangoRetencion=()=>['2026-10-01','2026-10-15'];eq(await box.isrQAplicarModelo(model),model);
 // Barrido de regresión semanal: el motor original conserva toda su salida.
 for(const sd of [315.04,329,362,500,1000,3500])for(let faltas=0;faltas<=7;faltas++)for(const incapacidadIMSS of [0,1,7]){
  const w={sd,sdi:sd*1.0493,periodo_pago:'SEMANAL'},opts={faltas,incapacidadIMSS,premios:123.45};
  eq(box.nominaQuincenalAjustada(w,opts,null),box.nominaPeriodo(w,opts));
 }
 const q={sd:600,sdi:630,periodo_pago:'QUINCENAL'},base=box.nominaPeriodo(q,{}),adjusted=box.nominaQuincenalAjustada(q,{},input);
 eq(adjusted.isr,1333.65);eq(adjusted.neto,box.redondearCentavos(base.neto+base.isr-1333.65));eq(adjusted.imssObr,base.imssObr);
 const sourceRows=[['Tipo de Cálculo de ISR: Ajustado'],['Periodo de Pago: Del 16/Oct/26 al 31/Oct/26'],['Factor Mensual (Días Mes/ Días Nómina): 1.000000'],['Trabajador','Nombre','SD','Gravable Acumulado']];
 const record=Array(26).fill('');Object.assign(record,{0:1,1:'PERSONA FICTICIA PRUEBA',2:600,3:10000,4:10000,5:0,21:1050,22:1333.65236});sourceRows.push(record);
 box.XLSX={utils:{sheet_to_json:s=>s.rows}};
 const wb={SheetNames:['Ejemplo'],Sheets:{Ejemplo:{rows:sourceRows}}},personas=[{id:'W',no_trab:1,nombres:'PERSONA',primer_apellido:'FICTICIA',segundo_apellido:'PRUEBA',sd:600,periodo_pago:'QUINCENAL'}];
 const parsed=box.isrQParsearLibro(wb,personas,input.desde,input.hasta);eq(parsed.length,1);eq(parsed[0].isr_ordinario,null);
 bad(()=>box.isrQParsearLibro(wb,[{...personas[0],no_trab:2}],input.desde,input.hasta),/identifican/);
 bad(()=>box.isrQParsearLibro(wb,[{...personas[0],sd:601}],input.desde,input.hasta),/SD distinto/);
 bad(()=>box.isrQParsearLibro(wb,personas,'2026-11-16','2026-11-30'),/periodo del archivo/);
 const els={'iq-desde':{value:input.desde},'iq-hasta':{value:input.hasta},'iq-confirmar':{disabled:false},'iq-normal-0':{value:'1000'},'iq-out':{innerHTML:''}};
 box.$=id=>els[id];box.OBRA={id:'OBRA'};box.esc=String;box.money=String;box.ctrlTabla=()=>'<table>RESULTADO</table>';box.toast=()=>{};
 box.window._ISRQ={obra:'OBRA',propuesta:{obra_id:'OBRA',desde:input.desde,hasta:input.hasta,filas:[{...input,isr_noi_raw:1333.65236}]}};
 let writes=0;box.sb.rpc=async(name,args)=>{if(args.p_accion==='GUARDAR'){writes++;eq(args.p_datos.confirmado,true);return {data:{guardados:1}};}return {data:{filas:[]}};};
 await box.isrQConfirmar();eq(writes,1);eq(box.window._ISRQ.propuesta,undefined);
 box.window._ISRQ.propuesta={obra_id:'OBRA',desde:input.desde,hasta:input.hasta,filas:[{...input,isr_noi_raw:1333.65236}]};box.OBRA={id:'OTRA'};await box.isrQConfirmar();eq(writes,1);
 console.log('PASS ISR quincenal: '+checks+' comprobaciones de cálculo, fechas, compensación, fuentes, quincena y regresión semanal.');
})().catch(e=>{console.error(e);process.exitCode=1;});
