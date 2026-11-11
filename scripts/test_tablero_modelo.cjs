// Modelo común de indicadores del tablero (76-tablero-modelo.js): casos financieros del
// contrato con resultados esperados (scripts/fixtures/tablero/casos.json). Datos ficticios.
// Además comprueba que el módulo sea UMD puro: sin DOM, sin red y sin funciones globales.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
process.chdir(path.resolve(__dirname,'..'));
const archivo='frontend/modulos/76-tablero-modelo.js',codigo=fs.readFileSync(archivo,'utf8');
const M=require('../'+archivo);
const datos=JSON.parse(fs.readFileSync('scripts/fixtures/tablero/casos.json','utf8'));
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{assert.deepStrictEqual(a,b,m);n++;};
const AUSENTE='__AUSENTE__';

// ---- Forma del módulo ----
const acorn=require('acorn');
const ast=acorn.parse(codigo,{ecmaVersion:2022,sourceType:'script'});
eq(ast.body.length,1,'un solo enunciado de nivel superior (UMD)');
ok(!ast.body.some(s=>s.type==='FunctionDeclaration'||s.type==='VariableDeclaration'||s.type==='ClassDeclaration'),'sin declaraciones globales de nivel superior');
ok(!/\b(document|fetch|XMLHttpRequest|localStorage|sb\.|supabase)\b/.test(codigo.replace(/\/\*[\s\S]*?\*\//g,'')),'sin DOM, red ni Supabase');
const ctx={};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(codigo,ctx,{filename:archivo});
ok(ctx.PLATINUM_TABLERO_MODELO&&typeof ctx.PLATINUM_TABLERO_MODELO.calcular==='function','expone window.PLATINUM_TABLERO_MODELO en el navegador');
eq(Object.keys(ctx).sort(),['PLATINUM_TABLERO_MODELO','window'],'sólo agrega PLATINUM_TABLERO_MODELO al global');
ok(Object.isFrozen(M)&&Object.isFrozen(M.calendario),'API congelada');

// ---- Rutas de comprobación: a.b[0].c · lista{campo=valor}[0] · .length ----
function leer(obj,ruta){
 let cur=obj;
 for(const seg of ruta.match(/[^.{}\[\]]+|\{[^}]*\}|\[\d+\]/g)){
  if(cur===undefined||cur===null)return undefined;
  if(seg[0]==='{'){const [k,v]=seg.slice(1,-1).split('=');cur=cur.filter(x=>String(x[k])===v);}
  else if(seg[0]==='[')cur=cur[Number(seg.slice(1,-1))];
  else cur=Object.prototype.hasOwnProperty.call(cur,seg)||Array.isArray(cur)&&seg==='length'?cur[seg]:undefined;
 }
 return cur;
}
const plano=x=>JSON.parse(JSON.stringify(x===undefined?null:x));
function ejecutar(fuentes,c){
 const f=c.permisos?{...fuentes,permisos:c.permisos}:fuentes;
 switch(c.accion){
  case 'RESUMEN':return M.calcular(f,c.filtros,c.opciones);
  case 'TENDENCIA':return M.tendencia(f,c.filtros,c.opciones);
  case 'COMPARATIVOS':return M.comparativos(f,c.filtros,c.opciones);
  case 'EXCEPCIONES':return M.excepciones(f,c.filtros,c.opciones);
  case 'DETALLE':return M.detalle(f,c.filtros,c.opciones);
  case 'PLANTILLA':return M.plantilla(f,c.filtros,c.opciones);
  case 'CATALOGOS':return M.catalogos(f,c.filtros,c.opciones);
  default:throw Error('Acción desconocida '+c.accion);
 }
}
const MONETARIAS=['neto_conciliado','pagado_registrado','pagado_conciliado','saldo_por_cubrir','excedentes','sin_asignar','pendiente_conciliacion'];
const centavos=v=>Math.round(v*100);
for(const caso of datos.casos){
 for(const [i,c] of caso.comprobaciones.entries()){
  const r=ejecutar(caso.fuentes,c),et=`${caso.id}#${i} ${c.accion}`;
  for(const [ruta,esp] of Object.entries(c.esperado)){
   const v=leer(r,ruta);
   if(esp===AUSENTE)eq(v,undefined,`${et} ${ruta} no debe existir`);else eq(plano(v),esp,`${et} ${ruta}`);
  }
  if(c.accion==='RESUMEN'){
   const m=r.medidas,p=r.alcance.perspectiva;
   // Invariantes: cada peso en una sola casilla; nada se multiplica por unir filas.
   for(const k of MONETARIAS)ok(Number.isFinite(m[k].valor)&&Math.abs(centavos(m[k].valor)-m[k].valor*100)<1e-6,`${et} ${k} en centavos`);
   if(p==='PERIODO'){
    eq(centavos(m.neto_conciliado.valor),centavos(m.pagado_registrado.valor)+centavos(m.saldo_por_cubrir.valor),`${et} neto = registrado + saldo`);
   }else{
    eq(centavos(m.pagado_registrado.valor),centavos(m.pagado_conciliado.valor)+centavos(m.pendiente_conciliacion.valor)+centavos(m.excedentes.valor)+centavos(m.sin_asignar.valor),`${et} PAGO: registrado = conciliado + pendiente + excedentes + sin asignar`);
   }
   if(p==='PERIODO')eq(centavos(m.pagado_registrado.valor),centavos(m.pagado_conciliado.valor)+centavos(m.pendiente_conciliacion.valor),`${et} registrado = conciliado + pendiente`);
   eq(centavos(m.saldo_por_antiguedad.valor),Object.values(m.saldo_por_antiguedad.desglose).reduce((s,x)=>s+centavos(x),0),`${et} cubetas de antigüedad suman el saldo`);
   for(const [k,x] of Object.entries(m)){ok(typeof x.definicion==='string'&&x.definicion.length>10&&typeof x.formula==='string'&&x.formula.length>0,`${et} ${k} con definición y fórmula`);
    ok(['provisional','disponible','desglose','comparable','variacion','unidad','grano'].every(c=>c in x),`${et} ${k} con forma completa`);}
   ok(typeof r.huella==='string'&&r.huella.startsWith('v1|'),`${et} huella`);
   // Restringido: ningún valor de previsión aparece.
   const f=c.permisos||caso.fuentes.permisos;
   if(f&&!f.vip)ok(!JSON.stringify(m).includes('PREVISION_SOCIAL'),`${et} sin previsión social para usuario restringido`);
  }
  if(r&&r.filas&&r.total!==undefined)ok(r.filas.length<=Math.min(500,(c.opciones&&c.opciones.por_pagina)||100),`${et} paginado`);
 }
 // Determinismo: el mismo cálculo dos veces (y con las fuentes en otro orden) da el mismo JSON.
 const c0=caso.comprobaciones.find(x=>x.accion==='RESUMEN');
 if(c0){
  const inv={...caso.fuentes};for(const k of Object.keys(inv))if(Array.isArray(inv[k]))inv[k]=inv[k].slice().reverse();
  eq(plano(ejecutar(inv,c0)),plano(ejecutar(caso.fuentes,c0)),caso.id+' independiente del orden de filas');
 }
}
// Calendario
for(const c of datos.calendario)eq(plano(M.calendario[c.fn](...c.args)),c.esperado,`calendario.${c.fn}(${JSON.stringify(c.args)})`);
// Paginación y límites
{const caso=datos.casos.find(x=>x.id==='dos_medios');
 const r=M.excepciones(caso.fuentes,{desde:'2026-11-01',hasta:'2026-11-08'},{pagina:2,por_pagina:1});eq([r.pagina,r.por_pagina,r.filas.length],[2,1,1],'paginación');
 eq(M.excepciones(caso.fuentes,{desde:'2026-11-01',hasta:'2026-11-08'},{por_pagina:9999}).por_pagina,500,'por_pagina ≤ 500');
 assert.throws(()=>M.calcular(caso.fuentes,{desde:'2026-11-09',hasta:'2026-11-01'}),/Rango/);n++;
 assert.throws(()=>M.calcular({...caso.fuentes,ahora:undefined},{desde:'2026-11-01',hasta:'2026-11-08'}),/ahora/);n++;
}
// Redondeo exacto sólo al final (mitad lejos de cero) y sin errores de coma flotante.
eq(M.util.centavos(M.util.mic('0.105')),0.11,'0.105 → 0.11');eq(M.util.centavos(M.util.mic('-0.105')),-0.11,'−0.105 → −0.11');
eq(M.util.centavos(M.util.mic(0.1)+M.util.mic(0.2)),0.3,'0.1 + 0.2 = 0.30 exacto');
eq(M.util.centavos([...Array(3)].reduce(s=>s+M.util.mic('0.333'),0n)),1,'3 × 0.333 = 0.999 → 1.00 (se redondea al final, no por fila)');
eq(M.util.pct(M.util.mic(1),M.util.mic(3)),33.33,'1/3 = 33.33 %');eq(M.util.pct(1n,0n),null,'denominador cero → null');
// Escala: 1,500 personas × 4 semanas (6,000 obligaciones, 6,000 pagos, 1,000 cheques) sin
// comparaciones cuadráticas; los totales cuadran con la suma directa de las filas.
{const uid=(p,i)=>`${p}-0000-4000-8000-${String(i).padStart(12,'0')}`,O=uid('a0000000',1),f={ahora:'2026-11-11T18:00:00Z',permisos:{vip:true},
  obras:[{id:O,nombre:'ESCALA',empresa_codigo:'PLATINUM',fecha_inicio:'2026-03-30'}],trabajadores:[],cierres:[],versiones:[],flujo:[],obligaciones:[],evidencias:[],aplicaciones:[],pagos:[],cheques:[],historial:[]};
 let esperadoNeto=0,esperadoConc=0;
 for(const s of [29,30,31,32]){const c=uid('c0000000',s),v=uid('d0000000',s);f.cierres.push({id:c,obra_id:O,semana:s,periodo:'SEMANAL',estado:'AUTORIZADO'});
  f.versiones.push({id:v,cierre_origen:c,obra_id:O,version:1,snapshot:{}});f.flujo.push({cierre_id:c,sucio:false,version_id:v});}
 for(let t=1;t<=1500;t++){
  const w=uid('b0000000',t);f.trabajadores.push({id:w,obra_id:O,estatus:'ACTIVO',periodo_pago:'SEMANAL',fecha_alta:'2026-04-06',contratista:'C'+(t%7),no_trab:t});
  f.historial.push({id:t,trabajador_id:w,obra_id:O,accion:'ALTA',fecha:'2026-04-06T15:00:00Z',datos_despues:{contratista:'C'+(t%7),id_cuadrilla:null}});
  for(const s of [29,30,31,32]){const k=t*100+s,imp=(1000+t%97+s/100).toFixed(2),o=uid('e0000000',k);
   f.obligaciones.push({id:o,cierre_id:uid('c0000000',s),cierre_origen:uid('c0000000',s),version_id:uid('d0000000',s),obra_id:O,trabajador_id:w,semana:s,tipo:'NOMINA',importe:imp,metodo:'TRANSFERENCIA',contratista:'',vigente:true});
   esperadoNeto+=Math.round(imp*100);
   const fecha=['2026-10-16','2026-10-23','2026-10-30','2026-11-06'][s-29];
   if(t%3){f.pagos.push({id:uid('f0000000',k),obra_id:O,trabajador_id:w,semana:'S'+s,medio:'TRANSFERENCIA',banco:'BBVA',importe:imp,estado:'EXITOSO',fecha_pago:fecha,folio_lote:'L'+k,origen:'GLOBAL'});
    f.evidencias.push({id:uid('e1000000',k),obra_id:O,trabajador_id:w,semana:s,clave:'B'+k,importe:imp,pago_id:uid('f0000000',k)});
    f.aplicaciones.push({id:uid('a1000000',k),obra_id:O,obligacion_id:o,evidencia_id:uid('e1000000',k),importe:imp,created_at:'2026-11-01T00:00:00Z'});esperadoConc+=Math.round(imp*100);}
   else if(s===32&&t<=3000)f.cheques.push({id:uid('c1000000',k),obra_id:O,trabajador_id:w,semana:'S32',importe:imp,tipo_pago:'CHEQUE',estatus:'PENDIENTE',num_cheque:'',eliminado:false,created_at:'2026-11-05T00:00:00Z'});
  }
 }
 const t0=Date.now(),r=M.calcular(f,{desde:'2026-10-12',hasta:'2026-11-08',comparar:'ANTERIOR'}),ms=Date.now()-t0;
 eq(Math.round(r.medidas.neto_conciliado.valor*100),esperadoNeto,'escala: neto = suma directa de obligaciones');
 eq(Math.round(r.medidas.pagado_conciliado.valor*100),esperadoConc,'escala: conciliado = suma directa de aplicaciones');
 eq(Math.round(r.medidas.saldo_por_cubrir.valor*100),esperadoNeto-esperadoConc,'escala: saldo = diferencia');
 ok(ms<15000,`escala: RESUMEN con comparable en ${ms} ms`);if(process.env.TABLERO_TIEMPOS)console.log(`escala: ${f.obligaciones.length} obligaciones, RESUMEN ${ms} ms, neto ${r.medidas.neto_conciliado.valor}`);
 const t1=Date.now();M.excepciones(f,{desde:'2026-10-12',hasta:'2026-11-08'},{por_pagina:500});M.detalle(f,{desde:'2026-10-12',hasta:'2026-11-08',perspectiva:'PAGO'},{grano:'OPERACION'});
 ok(Date.now()-t1<15000,'escala: excepciones y detalle');
}
console.log(`PASS tablero modelo: ${n} comprobaciones en ${datos.casos.length} casos financieros (${datos.casos.reduce((s,c)=>s+c.comprobaciones.length,0)} consultas) y ${datos.calendario.length} de calendario.`);
