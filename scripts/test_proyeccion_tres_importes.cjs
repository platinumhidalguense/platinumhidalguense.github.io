// Formato real XLSX y vista previa real con importes ficticios; no usa la red.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),acorn=require('acorn'),XLSX=require('xlsx-js-style');
const fuente=fs.readFileSync('frontend/modulos/10-proyeccion-nomina.js','utf8'),excel=fs.readFileSync('frontend/modulos/07-exportacion-corporativa.js','utf8');
const caja={window:{},XLSX,console,Date,Map,Set,Number,Math,OBRAS:[{id:'o',nombre:'Centro ficticio'}],redondearCentavos:n=>Math.round((n+Number.EPSILON)*100)/100,fullName:w=>w.nombres,money:n=>Number(n).toFixed(2),esc:x=>String(x??''),proyColumnaConcepto:()=>null};
vm.createContext(caja);vm.runInContext(excel.slice(0,excel.indexOf('function dlPlain')),caja);
vm.runInContext(fuente.slice(fuente.indexOf('function proySelector('),fuente.indexOf('function buildProyWS(')),caja);
const preview=acorn.parse(fuente,{ecmaVersion:'latest'}).body.find(x=>x.id?.name==='pyPreview');vm.runInContext(fuente.slice(preview.start,preview.end),caja);
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};const round=caja.redondearCentavos;
function fila(no,sueldo,prevision,inc=0,credito=0,otras=0,op={}){
 const w={id:'w'+no,obra_id:'o',no_trab:no,nombres:'PERSONA '+no,contratista:'MG',cuenta:'1234567890',banco:'BBVA',periodo_pago:'SEMANAL'};
 const x={w,fin:false,sinCuenta:false,pago:'TRANSFERENCIA',sueldo,prevision,incidencias:inc,creditos:credito,otras,costo:sueldo-inc,neto:round(sueldo+prevision-inc-credito-otras),...op};
 x.items=[['FALTA',inc],['INFONAVIT',credito],['OTRA',otras]].filter(([,m])=>m).map(([tipo,monto])=>({w,tipo,monto,clase:tipo==='FALTA'?'INCIDENCIA':tipo==='INFONAVIT'?'CREDITO':'OTRA',origen:'FUENTE FICTICIA',estado:'NORMAL',motivo:tipo}));return x;
}
const filas=[fila(1,5000,3000,0,500),fila(2,5000,3000),fila(3,5000,3000,400,500,25),fila(4,4999.51,3000.49,0,500),fila(5,900,0,0,0,0,{fin:true,pago:'CHEQUE'}),fila(6,4000,1000,0,0,0,{sinCuenta:true,pago:'POR DEFINIR'})];
const modelo={filas,items:filas.flatMap(x=>x.items),sem:'S33',neto:round(filas.reduce((s,x)=>s+x.neto,0)),costo:round(filas.reduce((s,x)=>s+x.costo,0))},original=JSON.stringify(modelo);
const esperado=[[4500,3000,7500],[5000,3000,8000],[4075,3000,7075],[4499.51,3000.49,7500],[900,0,900],[4000,1000,5000]];
for(const [i,x]of filas.entries()){const m=caja.proyTresImportes(x);eq([m.registrado,m.prevision,m.neto],esperado[i]);}
const meta={titulo:'PROYECCIÓN FICTICIA',sub:'Empresa / centro',pie:'Periodo ficticio',colB:'CONTRATISTA',codigo:'PLATINUM'};
const montos=[];
for(const empresa of ['PLATINUM','JIRE'])for(const destino of ['CONTRATISTA','DISPERSION']){
 const wb=caja.proyLibro(modelo,destino,{...meta,codigo:empresa}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
 eq(rows[2].slice(6,9),['SUELDO REGISTRADO MENOS RETENCIONES','PREVISIÓN SOCIAL','NETO TOTAL A PAGAR']);eq(rows[2].length,10);eq(rows[2][9],'FORMA DE PAGO');
 const rr=rows.map((r,i)=>({r,n:i+1})).filter(x=>typeof x.r[0]==='number');eq(rr.map(x=>x.r[0]),[1,2,3,4,5,6]);
 for(const {r,n:f}of rr){eq(r.slice(6,9),esperado[r[0]-1]);eq(ws['I'+f].f,`G${f}+H${f}`);eq(round(ws['G'+f].v+ws['H'+f].v),ws['I'+f].v);eq(ws['G'+f].s.numFmt,'$#,##0.00');}
 const tr=rows.findIndex(r=>String(r[0]).startsWith('TOTAL ·'))+1;eq(ws['I'+tr].v,modelo.neto);eq(round(ws['G'+tr].v+ws['H'+tr].v),modelo.neto);eq(ws['H'+tr].v,13000.49);assert(ws['I'+tr].f.startsWith('SUM('));n++;
 const sum=rr.reduce((s,x)=>s+x.r[8],0);eq(round(sum),modelo.neto);eq(ws['!cols'].length,10);assert(ws['!merges'].every(m=>m.e.c<10));n++;
 const ret=wb.Sheets.RETENCIONES,det=XLSX.utils.sheet_to_json(ret,{header:1,defval:''});eq(det.filter(r=>typeof r[0]==='number').length,modelo.items.length);eq(det.at(-1)[6],1925);
 const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),restaurado=XLSX.read(buffer,{type:'buffer',cellFormula:true,cellStyles:true}).Sheets[wb.SheetNames[0]];
 for(const {n:f}of rr)for(const c of ['G','H','I']){eq(restaurado[c+f].v,ws[c+f].v);eq(restaurado[c+f].f,ws[c+f].f);}
 montos.push(ws['I'+tr].v);
}
eq(new Set(montos).size,1);eq(JSON.stringify(modelo),original,'no muta el modelo ni aplica retenciones otra vez');
const vista=caja.proyVistaTresImportes(modelo);for(const a of esperado)for(const v of a)assert(vista.includes('$'+v.toFixed(2)));assert(vista.includes(modelo.neto.toFixed(2)));n++;
const e={'py-prev':{innerHTML:''},'py-btn':{},'py-ambas':{},'py-sem':{value:'33'},'py-destino':{value:'CONTRATISTA'},'py-d1':{value:'2026-11-09'},'py-d2':{value:'2026-11-15'},'py-periodo':{value:'SEMANAL'}};
Object.assign(caja,{$:id=>e[id],semObra:()=>33,OBRA:{id:'o'},pyCandidatos:()=>({act:[],fins:[]}),proyLeerFiniquitos:async()=>[],proyModelo:()=>modelo,aguinaldoAplicarModelo:m=>m,aguinaldoSinFila:()=>[]});
(async()=>{await caja.pyPreview();assert(e['py-prev'].innerHTML.includes(vista));assert(e['py-prev'].innerHTML.includes('Neto total a pagar'));eq(e['py-btn'].disabled,false);
 e['py-destino'].value='DISPERSION';await caja.pyPreview();assert(e['py-prev'].innerHTML.includes(vista));eq(modelo.neto,35975);
 const sin={...modelo,filas:modelo.filas.map(x=>({...x,prevision:0}))};eq(caja.proyTienePrevision(sin),false);eq(caja.proyVistaTresImportes(sin),'');
 assert.throws(()=>caja.proyTresImportes({...filas[0],prevision:NaN}),/Previsión/);n++;
 const negativo=caja.proyTresImportes(fila(9,100,50,0,200));eq(round(negativo.registrado+negativo.prevision),negativo.neto);
 console.log('PASS tres importes:',n,'comprobaciones; ejemplo obligatorio, sin retenciones, incidencia + crédito, ISR ya integrado, dos destinos/empresas, vista y XLSX serializado');
})().catch(e=>{console.error(e);process.exitCode=1;});
