// Pruebas aisladas con datos ficticios. No escribe en Supabase.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./fuente_frontend.cjs').html();
function block(a,b){const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return html.slice(i,j);}
function fn(name){const a=html.indexOf(name),m=/\n(?:async )?function |\n\/\* ----------/g;m.lastIndex=a+name.length;const n=m.exec(html);assert(a>=0&&n,name);return html.slice(a,n.index);}
for(const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/src=|application\/json/.test(s[1]))new vm.Script(s[2]);
const pad=n=>Math.round((n+Number.EPSILON)*100)/100;
const workers=[
 {id:'uno',obra_id:'obra',no_trab:1,contratista:'MG',estatus:'ACTIVO',sal_semanal:2000,cuenta:'12345678'},
 {id:'dos',obra_id:'obra',no_trab:2,contratista:'MG',estatus:'ACTIVO',sal_semanal:2000,cuenta:'CREAR'},
 {id:'tres',obra_id:'obra',no_trab:3,contratista:'MG',estatus:'BAJA',monto_finiquito:950,fecha_baja:'2026-10-05'}
];
const ds=[{id:'i',trabajador_id:'uno',tipo:'FALTA',monto:400,recurrente:false,semana:'S28',activo:true,motivo:'1 falta'},
 {id:'c',trabajador_id:'uno',tipo:'INFONAVIT',monto:500,recurrente:true,activo:true,motivo:'Crédito 111'},
 {id:'f',trabajador_id:'dos',tipo:'FONACOT',monto:300,recurrente:true,activo:true,motivo:'Crédito 222'},
 {id:'p',trabajador_id:'tres',tipo:'INFONAVIT',monto:500,recurrente:true,activo:true}];
const audit={id:'audit',trabajador_id:'tres',obra_id:'obra',periodo:'2026-10-05',monto_aplicado:950,resultado:{infonavit:50},created_at:'2026-10-05'};
const elements=Object.fromEntries(Object.entries({'py-sem':'28','py-d1':'2026-10-05','py-d2':'2026-10-11','py-periodo':'SEMANAL','py-destino':'DISPERSION','pc-sem':'28','pc-d1':'2026-10-05','pc-d2':'2026-10-11','pc-periodo':'SEMANAL','pc-destino':'DISPERSION','pc-obra':'obra','pc-ct-0':''}).map(([id,value])=>[id,{value,checked:true,disabled:false}]));
for(const id of ['py-btn','py-ambas','py-prev','pc-btn','pc-ambas'])elements[id]={disabled:false,innerHTML:''};
const fakeXLSX={utils:{encode_col:i=>String.fromCharCode(65+i),book_new:()=>({SheetNames:[],Sheets:{}}),
 book_append_sheet:(wb,ws,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=ws;}}};
const box={console,Date,Number,Math,Error,Set,Map,Uint8Array,window:{},DESC:ds,DIFS:[],FINTRANS:[],WORKERS:workers,OBRA:{id:'obra',nombre:'Obra prueba'},
 OBRAS:[{id:'obra',nombre:'Obra prueba'},{id:'otra',nombre:'Otra obra'}],EMPRESA_ACTIVA:'PLATINUM',CFGEMP:{},EMPRESAS:{PLATINUM:{nombre:'Comercializadora PLATINUM Hidalguense',corto:'PLATINUM'}},
 redondearCentavos:pad,money:n=>Number(n).toFixed(2),fullName:w=>'PERSONA '+w.no_trab,empresaDeTrabajador:()=> 'PLATINUM',empresaDeObra:()=> 'PLATINUM',
 perDe:()=>({dias:7,cve:'SEMANAL'}),descuentoVigenteSemana:()=>true,montoDescuento:d=>d.monto,
 retencionEvaluada:d=>({monto:d.monto,estado:d.excepciones?'PAUSADO':'NORMAL',extra:0}),difDe:id=>id==='uno'?200:0,finTransDe:()=>null,
 XLSX:fakeXLSX,ST:Object.fromEntries(['title','sub','head','cell','cellC','money','fin','finMoney','total','totalMoney','sect'].map(k=>[k,{}])),
 $:id=>elements[id],esc:x=>String(x),semObra:()=>28,isoWeek:()=>28,fmtD:x=>x,rangoTexto:(a,b)=>a+' a '+b,
 toast:(s,t)=>{box.messages.push({s,t});},messages:[],closeModal:()=>{box.closed++;},closed:0,
 pyDatosFrescos:async()=>true,pyPreview:()=>{},pyCandidatos:()=>({act:workers.slice(0,2),fins:[workers[2]]}),
 dl:async(wb,name)=>{box.downloads.push({wb,name});},downloads:[],registrarBitacoraNomina:async rs=>{box.audits.push(rs);return true;},audits:[],
 buildSheet:(rows,styles,widths,merges,hs)=>{const ws={'!rows':hs,'!cols':widths.map(w=>({wch:w})),'!merges':merges,_rows:rows};rows.forEach((row,r)=>row.forEach((v,c)=>ws[String.fromCharCode(65+c)+(r+1)]={t:typeof v==='number'?'n':'s',v,s:Array.isArray(styles[r])?styles[r][c]:styles[r]}));return ws;},
 fetchAllRows:async()=>({data:[audit],error:null}),sb:{from:()=>({select(){return this;},in(){return this;},eq(){return this;},order(){return this;}})},
 asSinServicioSemana:()=>new Set(),asVigenteSemana:()=>true};
vm.createContext(box);
vm.runInContext(['descuentoCorrespondePeriodo','adaptarRetencionPeriodo','retencionAplicadaPeriodo','retencionesDePeriodo'].map(n=>fn('function '+n+'(')).join('\n')+'\n'+fn('function proyFiniquitosSemana(')+'\n'+fn('function descuentosDe(')+'\n'+block('function proySelector(','function buildProyWS(')+'\n'+fn('async function exportProyeccion(')+'\n'+fn('async function exportProyContratista('),box);
const model=box.proyModelo(workers.slice(0,2),[workers[2]],'S28',[audit]);
assert.equal(model.costo,4600);assert.equal(model.neto,3950);
assert.deepEqual(Array.from(model.filas,x=>[x.costo,x.neto,x.prevision,x.creditos]),[[1600,1300,200,500],[2000,1700,0,300],[1000,950,0,50]]);
assert.deepEqual(Array.from(model.filas,x=>x.pago),['TRANSFERENCIA','POR DEFINIR','CHEQUE']);
assert.equal(workers[1].cuenta,'CREAR');assert.equal(workers[1].forma_pago,undefined);
const meta={titulo:'PROYECCIÓN S28',sub:'Comercializadora PLATINUM Hidalguense · Obra prueba',pie:'5 al 11 octubre 2026',colB:'CONTRATISTA',codigo:'PLATINUM'};
const cost=box.proyLibro(model,'CONTRATISTA',meta),disp=box.proyLibro(model,'DISPERSION',meta);
assert.equal(cost.SheetNames.length,2);assert.equal(disp.SheetNames.length,2);
const cws=cost.Sheets[cost.SheetNames[0]],dws=disp.Sheets[disp.SheetNames[0]];
const dnet=dws._rows[2].indexOf('NETO A PAGAR');
assert.equal(dnet,8);assert.equal(dws._rows[2].length,10);
assert.deepEqual(Array.from(dws._rows[2]).slice(6,9),['SUELDO REGISTRADO / FINIQUITO','PREVISIÓN SOCIAL','NETO A PAGAR']);
assert.deepEqual(Array.from(dws._rows.find(r=>r[0]===1)).slice(6,9),[2000,200,1300]);
assert.equal(dws._rows.find(r=>r[0]===1)[dnet],1300);
assert.equal(dws._rows.find(r=>r[0]==='TOTAL · 3 TRABAJADORES')[dnet],3950);
// Contratista: formato aprobado, sin deducir créditos ni previsión del costo.
assert.equal(cws._rows[2].length,11);assert(cws._rows[2].includes('PREVISIÓN SOCIAL'));assert(!cws._rows.join().includes('TOTAL TRANSFERENCIA'));
assert.equal(cws._rows.filter(r=>String(r[0]).startsWith('TOTAL')).length,1);
assert.deepEqual(Array.from(cws._rows.filter(r=>typeof r[0]==='number'),r=>r[0]),[1,3,2]);
assert(cws._rows.join().includes('POR DEFINIR'));assert(cws._rows[2].includes('FORMA DE PAGO'));
assert.deepEqual(Array.from(cws._rows.find(r=>r[0]===3)).slice(6),[1000,0,50,0,'CHEQUE']);
assert.deepEqual(Array.from(dws._rows.filter(r=>typeof r[0]==='number'),r=>r[0]),[1,3,2]);
assert.equal(dws._rows.find(r=>r[0]===2).at(-1),'POR DEFINIR');
assert.equal(dws._rows.find(r=>r[0]==='SUBTOTAL NÓMINA POR TRANSFERENCIA')[dnet],1300);assert.equal(dws._rows.find(r=>r[0]==='SUBTOTAL FINIQUITOS POR CHEQUE')[dnet],950);
assert.equal(dws._rows.find(r=>r[0]==='SUBTOTAL NÓMINA SIN CUENTA · POR DEFINIR')[dnet],1700);
assert.equal(dws._rows.find(r=>r[0]==='TOTAL · 3 TRABAJADORES')[dnet],3950);
// Un finiquito por transferencia queda antes de cheques sin perder su distinción ni autorización.
box.finTransDe=()=>({autorizado:true});
const transferModel=box.proyModelo(workers.slice(0,2),[workers[2]],'S28',[audit]);
const transferWS=box.buildProyDestinoWS({...meta,modelo:transferModel,destino:'DISPERSION'});
assert.deepEqual(Array.from(transferWS._rows.filter(r=>typeof r[0]==='number'),r=>r[0]),[1,3,2]);
assert.equal(transferWS._rows.find(r=>r[0]===3).at(-1),'TRANSFERENCIA');
assert.equal(transferWS._rows.find(r=>r[0]==='SUBTOTAL NÓMINA POR TRANSFERENCIA')[dnet]+transferWS._rows.find(r=>r[0]==='SUBTOTAL FINIQUITOS POR TRANSFERENCIA')[dnet],2250);
assert(!transferWS._rows.some(r=>r[0]==='SUBTOTAL FINIQUITOS POR CHEQUE'));
box.finTransDe=()=>null;
// Cuenta válida, sólo CLABE, cheque de nómina y número consecutivo en cada bloque.
const mixedWorkers=[{...workers[1],id:'clabe',no_trab:8,clabe:'012345678901234567'},
 {...workers[0],id:'cheque',no_trab:9,forma_pago:'CHEQUE'},
 {...workers[1],id:'sinCuenta',no_trab:4,cuenta:'123',forma_pago:'CHEQUE'},workers[0]];
const mixed=box.proyModelo(mixedWorkers,[workers[2]],'S28',[audit]);
const mixedWS=box.buildProyDestinoWS({...meta,modelo:mixed,destino:'DISPERSION'});
assert.deepEqual(Array.from(mixedWS._rows.filter(r=>typeof r[0]==='number'),r=>r[0]),[1,8,9,3,4]);
assert.equal(mixedWS._rows.find(r=>r[0]===8).at(-1),'TRANSFERENCIA');
assert.equal(mixedWS._rows.find(r=>r[0]===4).at(-1),'POR DEFINIR');
assert.equal(mixedWS._rows.filter(r=>typeof r[0]==='number').length,mixed.filas.length);
const mixedCost=box.buildProyDestinoWS({...meta,modelo:mixed,destino:'CONTRATISTA'});
assert.deepEqual(Array.from(mixedCost._rows.filter(r=>typeof r[0]==='number'),r=>r[0]),[1,8,9,3,4]);
assert.equal(mixedCost._rows.filter(r=>String(r[0]).startsWith('TOTAL')).length,1);
const casosTotales=[];
for(const prevision of [0,200])for(const otras of [0,25]){
 const filas=model.filas.map(x=>({...x,prevision:x.fin?0:prevision,otras:x.fin?0:otras,
  neto:pad(Math.max(0,x.sueldo+(x.fin?0:prevision)-x.incidencias-x.creditos-(x.fin?0:otras)))}));
 const modelo={...model,filas,neto:pad(filas.reduce((s,x)=>s+x.neto,0))};
 const ws=box.buildProyDestinoWS({...meta,modelo,destino:'DISPERSION'}),heads=ws._rows[2];
 assert.equal(heads.length,prevision?10:9);assert.equal(heads.includes('PREVISIÓN SOCIAL'),prevision!==0);assert(!heads.includes('OTRAS RETENCIONES'));
 for(const x of filas){const row=ws._rows.find(r=>r[0]===x.w.no_trab),r=ws._rows.indexOf(row)+1;
  for(const [label,esperado] of [['SUELDO REGISTRADO / FINIQUITO',x.sueldo],['NETO A PAGAR',x.neto]]){
   const c=heads.indexOf(label),celda=String.fromCharCode(65+c)+r;
   assert.equal(row[c],esperado);assert.equal(ws[celda].t,'n');assert.equal(ws[celda].f,undefined);
  }
 }
 assert.equal(ws._rows.find(r=>r[0]===`TOTAL · ${filas.length} TRABAJADORES`)[heads.indexOf('NETO A PAGAR')],modelo.neto);
 casosTotales.push({nombre:`DISPERSION_P${prevision}_O${otras}`,modelo});
}
// El método precede al número: cheque #5 NO debe adelantarse a transferencia #8.
// Los finiquitos autorizados por transferencia tampoco pueden quedar detrás de cheques.
const pagoWorkers=[...mixedWorkers,{...workers[0],id:'chequeTemprano',no_trab:5,forma_pago:'CHEQUE'}];
for(const transferFin of [false,true]){
 box.finTransDe=()=>transferFin?{autorizado:true}:null;
 const ordered=box.proyModelo(pagoWorkers,[workers[2]],'S28',[audit]);
 const snapshot=JSON.stringify(ordered);
 for(const destino of ['CONTRATISTA','DISPERSION']){
  const ws=box.buildProyDestinoWS({...meta,modelo:ordered,destino});
  const data=ws._rows.filter(r=>typeof r[0]==='number');
  assert.deepEqual(Array.from(data,r=>r[0]),transferFin?[1,8,3,5,9,4]:[1,8,5,9,3,4]);
  assert.equal(data.length,ordered.filas.length);
  assert.equal(new Set(data.map(r=>r[0])).size,ordered.filas.length);
  const ranks=data.map(r=>({TRANSFERENCIA:0,CHEQUE:1,'POR DEFINIR':2})[ordered.filas.find(x=>x.w.no_trab===r[0]).pago]);
  assert(ranks.every((rank,i)=>i===0||rank>=ranks[i-1]),'Orden de métodos de pago');
  const totalCol=destino==='DISPERSION'?ws._rows[2].indexOf('NETO A PAGAR'):6;
  const key=destino==='DISPERSION'?'neto':'costo';
  assert.equal(pad(data.reduce((sum,r)=>sum+r[totalCol],0)),ordered[key]);
  for(const row of data){
   const n=ws._rows.indexOf(row)+1,x=ordered.filas.find(x=>x.w.no_trab===row[0]);
   assert.equal(row[totalCol],x[key]);
   assert.equal(ws[String.fromCharCode(65+totalCol)+n].f,undefined,'Importe del modelo sin segunda deducción');
  }
  assert.equal(ws._rows.find(r=>r[0]===`TOTAL · ${ordered.filas.length} TRABAJADORES`)[totalCol],ordered[key]);
  if(destino==='CONTRATISTA')assert.equal(ws._rows.filter(r=>String(r[0]).startsWith('TOTAL')).length,1);
  assert.equal(JSON.stringify(ordered),snapshot,'Ordenar no modifica la instantánea ni los importes');
 }
}
box.finTransDe=()=>null;
const withAccount=box.proyModelo([workers[0]],[workers[2]],'S28',[audit]);
for(const destino of ['CONTRATISTA','DISPERSION']){
 const ws=box.buildProyDestinoWS({...meta,modelo:withAccount,destino});
 assert.deepEqual(Array.from(ws._rows.filter(r=>typeof r[0]==='number'),r=>r[0]),[1,3]);
 assert(!ws._rows.some(r=>String(r[0]).startsWith('NÓMINA SIN CUENTA')));
}
assert.equal(dws._rows.find(r=>String(r[0]).startsWith('TOTAL ·'))[dnet],3950);
assert.equal(disp.Sheets.RETENCIONES._rows.length,cost.Sheets.RETENCIONES._rows.length);
assert.equal(cost.Sheets.RETENCIONES._rows.find(r=>r[0]===3)[6],50);
assert.throws(()=>box.proyModelo(workers.slice(0,2),[workers[2]],'S28',[]),/Falta el desglose INFONAVIT/);
assert.throws(()=>box.proyModelo([], [workers[2]],'S28',[{...audit,monto_aplicado:999}]),/Falta el desglose/);
const empty=box.proyModelo([{...workers[1],id:'sin',no_trab:8}],[],'S28',[]);
const noRet=box.proyLibro(empty,'DISPERSION',meta);assert.equal(noRet.SheetNames.length,2);assert(!noRet.Sheets[noRet.SheetNames[0]]._rows[2].join().includes('PREVISIÓN'));
assert(noRet.Sheets.RETENCIONES._rows[2][0].startsWith('Sin retenciones'));
const many=box.proyModelo(Array.from({length:1001},(_,i)=>({...workers[1],id:'nuevo'+i,no_trab:i+1})),[],'S28',[]);
const big=box.proyLibro(many,'CONTRATISTA',meta);assert.equal(many.costo,2002000);const last=big.Sheets[big.SheetNames[0]]._rows.findIndex(r=>r[0]==='TOTAL · 1001 TRABAJADORES')+1;assert.equal(big.Sheets[big.SheetNames[0]]['G'+last].f,'SUM(G5:G1005)');
// Valores y fórmula comparten el mismo tope a cero; ni blancos ni créditos
// producen #VALUE! en Excel. Cambiar la previsión NO cambia el costo.
box.DESC.push({...ds[0],trabajador_id:'dos',monto:2500});const clamped=box.proyModelo([workers[1]],[],'S28',[]);assert.equal(clamped.neto,0);assert.equal(clamped.costo,0);box.DESC.pop();
console.log('OK importes intactos, contratista diez columnas, orden dispersión, finiquitos cheque/transferencia, POR DEFINIR separado y 1001 filas');
// Colores exclusivos del contratista: combinados con dos colores, detalle separado.
const rowOf=(ws,no)=>ws._rows.findIndex(r=>r[0]===no)+1;
assert.equal(cws['I'+rowOf(cws,1)].s.fill.fgColor.rgb,'FFFF00');
assert.equal(cws['I'+rowOf(cws,2)].s.fill.fgColor.rgb,'92D050');
assert.equal(cost.Sheets.RETENCIONES.D4.s.fill.fgColor.rgb,'FFFF00');
assert.equal(disp.Sheets.RETENCIONES.D4.s.fill.fgColor.rgb,'FFFFFF');
const bothItem={...model.items.find(x=>x.tipo==='INFONAVIT'),tipo:'FONACOT',monto:20};
const both={...model,items:[...model.items,bothItem],filas:model.filas.map(x=>x.w.id==='uno'?{...x,creditos:x.creditos+20}:x)};
const bothWS=box.proyLibro(both,'CONTRATISTA',meta).Sheets['SEMANA 28'];
assert.equal(bothWS['I'+rowOf(bothWS,1)].v,520);
assert.equal(bothWS['I'+rowOf(bothWS,1)].s.fill.patternType,'darkDown');
assert.equal(bothWS['I'+rowOf(bothWS,1)].s.fill.fgColor.rgb,'FFFF00');
assert.equal(bothWS['I'+rowOf(bothWS,1)].s.fill.bgColor.rgb,'92D050');
assert.equal(bothWS['G'+rowOf(bothWS,1)].v,1600,'Los créditos no reducen costo');
for(const empresa of ['JIRE','PLATINUM'])for(const colB of ['OBRA','CONTRATISTA']){
 const book=box.proyLibro(model,'CONTRATISTA',{...meta,codigo:empresa,colB});
 assert(Object.values(book.__empresaPorHoja).every(x=>x===empresa));
 assert.equal(book.Sheets['SEMANA 28']._rows[2][1],colB);
}
const noRows=box.proyLibro({filas:[],items:[],sem:'S1',costo:0,neto:0},'CONTRATISTA',meta);
assert.equal(noRows.Sheets['SEMANA 1'].G4.f,'0');
assert.throws(()=>box.buildProyDestinoWS({...meta,modelo:model,destino:'OTRO'}),/destino/);
assert.throws(()=>box.buildProyContratistaWS({...meta,modelo:{...model,filas:[{...model.filas[0],pago:'OTRO'}]}}),/sin clasificar/);
assert.throws(()=>box.buildProyContratistaWS({...meta,modelo:{...model,filas:[{...model.filas[0],costo:NaN}]}}),/inválido/);
assert.equal(cws['D'+rowOf(cws,1)].t,'s');
assert.equal(cws.K1.v,'');
assert.equal(cws._rows.filter(r=>String(r[0]).startsWith('SUBTOTAL')).length,0);
assert.equal(cws['H'+(cws._rows.length-1)].v,400);
assert.equal(cws['I'+(cws._rows.length-1)].v,850);
console.log('OK colores INFONAVIT/FONACOT, doble crédito, ambas empresas/alcances, totales y rechazo de importes inválidos');
// Previsión informativa: ambos destinos, cuentas/cheques, subtotales y versiones.
for(const destino of ['CONTRATISTA','DISPERSION'])for(const colB of ['OBRA','CONTRATISTA']){
 const copy=JSON.stringify(model),ws=box.buildProyDestinoWS({...meta,colB,modelo:model,destino});
 const p=ws._rows[2].indexOf('PREVISIÓN SOCIAL'),letter=String.fromCharCode(65+p);
 assert.equal(p,destino==='CONTRATISTA'?9:7);
 for(const f of model.filas){const r=rowOf(ws,f.w.no_trab);assert.equal(ws[letter+r].v,f.prevision);assert.equal(ws[letter+r].t,'n');assert.equal(ws[letter+r].f,undefined);}
 const total=ws._rows.findIndex(r=>String(r[0]).startsWith('TOTAL ·'))+1;
 assert.equal(ws[letter+total].v,200);assert.equal(ws[letter+total].t,'n');assert(ws[letter+total].f.startsWith('SUM('));
 assert.equal(ws[(destino==='CONTRATISTA'?'G':'I')+total].v,destino==='CONTRATISTA'?4600:3950,'No añade la previsión otra vez al total');
 const width=ws._rows[2].length;assert.equal(ws['!cols'].length,width);
 const title=ws['!merges'].find(m=>m.s.r===0);assert.equal(title.e.c,width-2);assert.equal(ws[String.fromCharCode(64+width)+'1'].v,'','Logo fuera del título');
 assert.equal(JSON.stringify(model),copy,'Adaptador de presentación sin mutación del modelo');
 const noDiff={...model,filas:model.filas.map(x=>({...x,prevision:0}))};
 const no=box.buildProyDestinoWS({...meta,colB,modelo:noDiff,destino});assert(!no._rows[2].includes('PREVISIÓN SOCIAL'));assert.equal(no['!cols'].length,width-1);
 const missing={...model,filas:model.filas.map(({prevision,...x})=>x)};assert(!box.buildProyDestinoWS({...meta,modelo:missing,destino})._rows[2].includes('PREVISIÓN SOCIAL'));
 assert.throws(()=>box.buildProyDestinoWS({...meta,modelo:{...model,filas:[{...model.filas[0],prevision:NaN}]},destino}),/Previsión social inválida/);
 if(destino==='DISPERSION'){
  assert.equal(ws['G'+total].v,5000,'Sueldo completo anterior a incidencias y créditos; finiquito completo');
  assert.equal(ws['G'+total].f,'SUM(G5:G5,G8:G8,G11:G11)');
  assert.equal(ws['I'+total].f,'SUM(I5:I5,I8:I8,I11:I11)');
  for(const f of model.filas){const r=rowOf(ws,f.w.no_trab);assert.equal(ws['G'+r].v,f.sueldo);assert.equal(ws['G'+r].t,'n');}
  assert.equal(no._rows[2].indexOf('NETO A PAGAR'),7,'Sin previsión el neto se desplaza a H');
  assert.throws(()=>box.buildProyDestinoWS({...meta,modelo:{...model,filas:[{...model.filas[0],sueldo:undefined}]},destino}),/Sueldo registrado o neto inválido/);
  assert.equal(ws._rows.find(r=>r[0]==='SUBTOTAL NÓMINA POR TRANSFERENCIA')[p],200);
  assert.equal(ws._rows.find(r=>r[0]==='SUBTOTAL FINIQUITOS POR CHEQUE')[p],0);
  assert.equal(ws._rows.find(r=>r[0]==='SUBTOTAL NÓMINA SIN CUENTA · POR DEFINIR')[p],0);
 }
}
console.log('OK previsión social condicional en ambas proyecciones, numérica y con totales propios; netos, costo y modelo intactos.');
(async()=>{
 // Serialización: no basta con ver dos colores en el objeto de estilos.
 vm.runInContext(block('const _xmlEsc=','function _uuid('),box);
 const inicial='<styleSheet><fills><fill><patternFill patternType="darkDown"><fgColor rgb="FFFFFF00"/><bgColor/></patternFill></fill></fills></styleSheet>';
 const fakeZip=()=>{const files={'xl/styles.xml':inicial,'[Content_Types].xml':'<Types></Types>'};return {files,file(p,v){if(v!==undefined){files[p]=v;return this;}return files[p]===undefined?null:{async:async()=>files[p]};}};};
 const zipDual=fakeZip();await box.aplicarMarcaCorporativaXlsx(zipDual,{SheetNames:[],__retencionesContratista:true});
 assert(zipDual.files['xl/styles.xml'].includes('<bgColor rgb="FF92D050"/>'));
 const zipDisp=fakeZip();await box.aplicarMarcaCorporativaXlsx(zipDisp,{SheetNames:[],__retencionesContratista:false});
 assert.equal(zipDisp.files['xl/styles.xml'],inicial,'La serialización de dispersión no cambia');
 await box.exportProyeccion('AMBAS');assert.equal(box.downloads.length,2);assert.equal(box.audits.length,1);assert.equal(box.closed,1);assert(!box.window._PROY_EXPORTANDO);
 assert(box.downloads.every(x=>x.wb.SheetNames[1]==='RETENCIONES'));assert(box.downloads[0].name.includes('CONTRATISTA'));assert(box.downloads[1].name.includes('DISPERSION'));
 box.window._PCEMP='PLATINUM';box.window._PCCT=['MG'];box.pcDatosFrescos=async()=>({all:[...workers,{...workers[0],id:'fuera',obra_id:'otra',no_trab:99}],desc:ds,difs:[],altas:[],fintrans:[]});
 const prev=box.DESC;await box.exportProyContratista('AMBAS');assert.equal(box.downloads.length,4);assert.equal(box.audits.length,2);assert.equal(box.DESC,prev);
 assert.equal(box.audits[1].length,3);assert(!box.audits[1].some(x=>x.trabajador_id==='fuera'));
 box.pcDatosFrescos=async()=>{throw Error('Fallo de red de prueba');};await box.exportProyContratista('AMBAS');assert.equal(box.downloads.length,4);assert.equal(box.DESC,prev);assert(!elements['pc-btn'].disabled);
 console.log('OK botones generar/ambas, obra actual, instantánea compartida, auditoría única, restauración y bloqueo por fallo de datos');
 // Exportes de comprobación con la MISMA librería que usa la plataforma.
 if(process.argv.includes('--xlsx')){
   const url=html.match(/<script src="(https:[^"]+xlsx-js-style[^"]+)"/)[1];
   const response=await fetch(url);assert(response.ok,'No se pudo obtener xlsx-js-style');const ctx={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer};vm.createContext(ctx);vm.runInContext(await response.text(),ctx);box.XLSX=ctx.XLSX;
   vm.runInContext('const BORD={top:{style:"thin",color:{rgb:"CCCCCC"}},bottom:{style:"thin",color:{rgb:"CCCCCC"}}};\n'+block('const ST=','function dlPlain('),box);
   box.ST=vm.runInContext('ST',box);
   box.atob=s=>Buffer.from(s,'base64').toString('binary');
   box.logoEmpresa=()=>html.match(/const LOGO_PLATINUM_IMG='([^']+)';/)?.[1]||null;
   if(!box.logoEmpresa())throw Error('Falta el logo de prueba');
   box.razonSocialEmpresa=()=>meta.sub.split(' · ')[0];
   const JSZip=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/jszip');
   const out='work/proyecciones_destinos_qa';fs.mkdirSync(out,{recursive:true});
   for(const dest of ['CONTRATISTA','DISPERSION']){
     const wb=box.proyLibro(model,dest,meta),zip=await JSZip.loadAsync(box.XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
     await box.aplicarMarcaCorporativaXlsx(zip,wb);
     assert(zip.file('xl/media/marcaEmpresa1.jpeg')||zip.file('xl/media/marcaEmpresa1.png'));
     const drawing=await zip.file('xl/drawings/drawingMarca1.xml').async('string');assert(drawing.includes('<xdr:row>0</xdr:row>'));
     fs.writeFileSync(out+'/'+dest+'.xlsx',await zip.generateAsync({type:'nodebuffer'}));
   }
   for(const caso of casosTotales){
     const wb=box.proyLibro(caso.modelo,'DISPERSION',meta),zip=await JSZip.loadAsync(box.XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
     await box.aplicarMarcaCorporativaXlsx(zip,wb);
     fs.writeFileSync(out+'/'+caso.nombre+'.xlsx',await zip.generateAsync({type:'nodebuffer'}));
   }
   // Referencia oficial S29: todas las personas e importes se conservan.
   const cp=require('node:child_process');
   const source=cp.spawnSync('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['scripts/inspect_dispersion_s29.py','--json'],{encoding:'utf8',maxBuffer:4e6});
   assert.equal(source.status,0,source.stderr);const ref=JSON.parse(source.stdout),main=ref.sheets[0],detail=ref.sheets[1];
   const people=main.rows.map((r,i)=>({r,i:i+1})).filter(x=>typeof x.r[0]==='number');
   const filas=people.map(({r,i})=>{const fin=main.finiquitos.includes(i),sinCuenta=String(r[3])==='—'&&String(r[4])==='—';
     return {w:{id:'s29-'+r[0],obra_id:'obra',no_trab:r[0],contratista:r[1],nombre:r[2],clabe:r[3],cuenta:r[4],banco:r[5]},fin,sinCuenta:!fin&&sinCuenta,
       neto:r[6],pago:!fin&&sinCuenta?'POR DEFINIR':r[7],sueldo:r[6],incidencias:0,creditos:0,otras:0,prevision:0,costo:r[6]};});
   const byNo=new Map(filas.map(x=>[x.w.no_trab,x]));
   const items=detail.rows.filter(r=>typeof r[0]==='number').map(r=>({w:byNo.get(r[0]).w,tipo:r[3],origen:r[4],estado:r[5],monto:r[6],motivo:r[7]}));
   const fuente={filas,items,sem:'S29',neto:pad(filas.reduce((s,x)=>s+x.neto,0))};
   const oldFull=box.fullName;box.fullName=w=>w.nombre||oldFull(w);
   const wb=box.proyLibro(fuente,'DISPERSION',{...meta,titulo:main.rows[0][0].replace(' · PARA DISPERSIÓN',''),sub:main.rows[1][0],pie:main.rows.at(-1)[0]});
   const ws=wb.Sheets[wb.SheetNames[0]],data=box.XLSX.utils.sheet_to_json(ws,{header:1}).filter(r=>typeof r[0]==='number');
   assert.equal(data.length,426);assert.equal(new Set(data.map(r=>r[0])).size,426);
   const netIndex=box.XLSX.utils.sheet_to_json(ws,{header:1})[2].indexOf('NETO A PAGAR');
   for(const {r} of people){const out=data.find(o=>o[0]===r[0]);assert(out);assert.equal(out[netIndex],r[6]);assert.equal(out[2],r[2]);}
   const expectedYellow=people.filter(x=>main.yellow.includes(x.i)).map(x=>x.r[0]);
   for(const r of expectedYellow)assert.equal(box.proyTransferenciaOtroBanco(byNo.get(r).w),true);
   const yellowNos=[];for(const [addr,cell] of Object.entries(ws)){if(/^A\d+$/.test(addr)&&cell.t==='n'&&cell.s?.fill?.fgColor?.rgb==='FFFF00')yellowNos.push(cell.v);}
   const eligible=filas.filter(x=>x.pago==='TRANSFERENCIA'&&box.proyTransferenciaOtroBanco(x.w)).map(x=>x.w.no_trab);
   assert.deepEqual(yellowNos.sort((a,b)=>a-b),eligible.sort((a,b)=>a-b));
   assert(expectedYellow.every(no=>yellowNos.includes(no)));
   assert.equal(data.find(r=>r[0]===646).at(-1),'POR DEFINIR');assert.equal(data.find(r=>r[0]===652).at(-1),'POR DEFINIR');
   assert.equal(data.find(r=>r[0]===485).at(-1),'TRANSFERENCIA');assert.equal(data.find(r=>r[0]===557).at(-1),'TRANSFERENCIA');
   assert.equal(pad(data.reduce((s,r)=>s+r[netIndex],0)),fuente.neto);
   assert.equal(wb.Sheets.RETENCIONES['G'+(3+items.length)].v,pad(items.reduce((s,x)=>s+x.monto,0)));
   for(const w of [{banco:' bbva méxico '},{banco:'BANCOMER'},{banco:'',clabe:'012180015542699801'},{banco:'—'}])assert.equal(box.proyTransferenciaOtroBanco(w),false);
   for(const w of [{banco:'BANCO AZTECA'},{banco:'MERCADO PAGO'},{banco:'',clabe:'137560100628897351'},{banco:'BBVA',clabe:'137560100628897351'}])assert.equal(box.proyTransferenciaOtroBanco(w),true);
   const zip=await JSZip.loadAsync(box.XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));await box.aplicarMarcaCorporativaXlsx(zip,wb);
   fs.writeFileSync(out+'/REFERENCIA_S29.xlsx',await zip.generateAsync({type:'nodebuffer'}));
   box.fullName=oldFull;
   console.log(JSON.stringify({referenciaS29:true,trabajadores:data.length,total:fuente.neto,resaltadosOriginal:expectedYellow.length,resaltadosCorrectos:yellowNos.length,retenciones:items.length}));
   console.log('OK archivos de prueba generados con xlsx-js-style');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
