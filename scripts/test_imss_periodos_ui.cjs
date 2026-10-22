// Sólo datos sintéticos; no usa navegador ni red.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
function funciones(file,names){const src=fs.readFileSync(file,'utf8');return acorn.parse(src,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>src.slice(n.start,n.end)).join('\n');}
const dias=(a,b)=>{const out=[];for(let d=new Date(a+'T12:00Z');d<=new Date(b+'T12:00Z');d.setUTCDate(d.getUTCDate()+1))out.push(d.toISOString().slice(0,10));return out;};
const semRange=n=>{const d=new Date('2026-03-30T12:00Z');d.setUTCDate(d.getUTCDate()+(n-1)*7);const a=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return[a,d.toISOString().slice(0,10)];};
const rango=(w,s)=>{const r=semRange(Number(String(s).replace('S','')));if(w.periodo_pago!=='QUINCENAL')return r;const d=new Date(r[1]+'T12:00Z'),a=d.getUTCFullYear(),m=d.getUTCMonth(),n=d.getUTCDate();return[n<=15?`${a}-${String(m+1).padStart(2,'0')}-01`:`${a}-${String(m+1).padStart(2,'0')}-16`,n<=15?`${a}-${String(m+1).padStart(2,'0')}-15`:new Date(Date.UTC(a,m+1,0,12)).toISOString().slice(0,10)];};
const w={id:'ficticio',obra_id:'obra',periodo_pago:'QUINCENAL',sal_semanal:7000};
const c={id:'caso',trabajador_id:w.id,obra_id:w.obra_id,certificado_desde:'2026-08-10',certificado_hasta:'2026-11-01',control_casos_imss_semanas:[]};
for(let n=20;n<=31;n++)c.control_casos_imss_semanas.push({semana:n,estado:'PENDIENTE',detalle_dias:dias(...semRange(n)).map(fecha=>({fecha,pagador:'IMSS'}))});
const llamadas=[];const box={window:{_CTRLIMSS:[c]},WORKERS:[w],DESC:[],periodoPago:w=>w.periodo_pago,semRange,rangoRetencion:rango,
 redondearCentavos:v=>Math.round(v*100)/100,descuentoFaltasNOI:(...args)=>{llamadas.push(args);return{monto:args[4]*200};},
 perDe:w=>({dias:w.periodo_pago==='QUINCENAL'?15:7,cve:w.periodo_pago}),descuentoVigenteSemana:()=>true,montoDescuento:d=>d.monto,montoDobleDescuento:d=>d.monto*2,retencionDiasExtra:()=>0};
vm.createContext(box);
vm.runInContext(funciones('frontend/modulos/36-imss-sin-servicio-st7.js',['ctrlFechasIMSS','ctrlImporteIMSSPeriodo','ctrlQuincenaIMSSAplicada'])+'\n'+funciones('frontend/modulos/08-retenciones-incidencias.js',['retencionEvaluada','descuentoCorrespondePeriodo','adaptarRetencionPeriodo','retencionAplicadaPeriodo','retencionesDePeriodo','descuentosDe']),box);
assert.equal(box.ctrlImporteIMSSPeriodo(c,28),7000);assert.equal(llamadas.length,0);
assert.equal(box.ctrlImporteIMSSPeriodo(c,30),7000);assert.equal(llamadas.length,0);
assert.equal(box.ctrlImporteIMSSPeriodo(c,31),200);assert.equal(llamadas.at(-1)[4],1);
assert.equal(box.ctrlImporteIMSSPeriodo(c,32),200);assert.equal(box.ctrlImporteIMSSPeriodo(c,34),0);
const d={id:'periodo',trabajador_id:w.id,activo:true,recurrente:false,semana:'S31',tipo:'INCIDENCIA',monto:200,ajustes_semana:{_periodo_nomina:{desde:'2026-11-01',hasta:'2026-11-15'}}};
box.DESC=[d];const originales=box.DESC;for(const s of ['S31','S32','S33'])assert.equal(box.retencionesDePeriodo(w,s).total,200);assert.equal(box.retencionesDePeriodo(w,'S30').total,0);assert.equal(box.retencionesDePeriodo(w,'S34').total,0);assert.strictEqual(box.DESC,originales);assert.equal(d.semana,'S31');
const credito={...d,id:'credito',recurrente:true,tipo:'FONACOT',monto:1000,ajustes_semana:{_periodos:[{desde:'2026-10-01',hasta:'2026-10-15',importe_base:900}]}};
assert.equal(box.retencionAplicadaPeriodo(credito,w,'S28',box.perDe(w)).monto,900);assert.equal(box.retencionAplicadaPeriodo(credito,w,'S30',box.perDe(w)).monto,1000);assert.equal(credito.ajustes_semana.S28,undefined);
const copia=JSON.parse(JSON.stringify(c));copia.control_casos_imss_semanas=copia.control_casos_imss_semanas.filter(s=>s.semana!==30);box.window._CTRLIMSS=[copia];assert.throws(()=>box.ctrlImporteIMSSPeriodo(copia,30),/Completa el calendario/);
box.window._CTRLIMSS=[c,{...c,id:'duplicado',control_casos_imss_semanas:c.control_casos_imss_semanas.map(s=>({...s,detalle_dias:s.detalle_dias.map(d=>({...d,pagador:'EMPRESA'}))}))}];assert.throws(()=>box.ctrlImporteIMSSPeriodo(c,28),/contradictorios/);
box.window._CTRLIMSS=[c,{id:'sin-fechas',trabajador_id:w.id,obra_id:w.obra_id}];assert.equal(box.ctrlImporteIMSSPeriodo(c,28),7000);
w.periodo_pago='SEMANAL';box.window._CTRLIMSS=[c];assert.equal(box.ctrlImporteIMSSPeriodo(c,28),1400);assert.equal(llamadas.at(-1)[4],7);
console.log('PASS incapacidad por periodo: quincenas 15/16, noviembre parcial, retención única, ajuste NOI sólo en sus fechas, conflicto y calendario incompleto; rama semanal conservada.');
