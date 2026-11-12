// Revisión independiente (A6) del tablero ejecutivo (76 modelo, 77 vista, 78 controlador) y del
// respaldo integral (79). Fixtures propios, resultados calculados a mano (no reutiliza los esperados
// de scripts/fixtures/tablero/casos.json). Datos ficticios; sin red.
// Las comprobaciones (ok/eq) deben pasar. Los «hallazgos» documentan comportamientos que la revisión
// considera defectos o riesgos: se reproducen y se informan sin detener la prueba.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const acorn=require('acorn'),{parseHTML}=require('linkedom'),XLSX=require('xlsx-js-style');
const root=path.resolve(__dirname,'..');process.chdir(root);
const M=require('../frontend/modulos/76-tablero-modelo.js');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{const j=x=>x===undefined?null:JSON.parse(JSON.stringify(x));assert.deepStrictEqual(j(a),j(b),m);n++;};
const hallazgos=[];const hallazgo=(id,reproduce,texto)=>hallazgos.push({id,reproduce:!!reproduce,texto});
const c=v=>Math.round(Number(v)*100); // centavos de un valor ya redondeado
const clon=x=>JSON.parse(JSON.stringify(x));

/* =====================================================================
   1. Fixture propio (centro con inicio 2026-01-05: semana interna 10 = 09–15/03, pago viernes 13/03)
   ===================================================================== */
const U=k=>'a6000000-0000-4000-8000-'+String(k).padStart(12,'0');
const X1=U(1),X2=U(2),W=i=>U(10+i),ACTOR=U(999);
function fuentesBase(){
 const I={};let k=100;const nid=t=>(I[t]=U(k++));
 const obras=[{id:X1,nombre:'CENTRO UNO',empresa_codigo:'PLATINUM',fecha_inicio:'2026-01-05',activa:true},{id:X2,nombre:'CENTRO DOS',empresa_codigo:'PLATINUM',fecha_inicio:'2026-01-05',activa:true}];
 const trabajadores=[];for(let i=1;i<=10;i++)trabajadores.push({id:W(i),obra_id:i===9?X2:X1,no_trab:i,nombres:'PERSONA '+i,primer_apellido:'FICTICIA',estatus:'ACTIVO',eliminado:false,periodo_pago:'SEMANAL',fecha_alta:'2026-01-05',contratista:'CONTR A'});
 const C1=nid('C1'),C2=nid('C2'),V1=nid('V1'),V2=nid('V2'),H64='0'.repeat(64);
 const cierres=[{id:C1,obra_id:X1,semana:10,periodo:'SEMANAL',estado:'AUTORIZADO',snapshot:{},snapshot_sha256:H64,formula_version:'PRUEBA',creado_por:ACTOR,created_at:'2026-03-12T12:00:00Z'},
  {id:C2,obra_id:X2,semana:10,periodo:'SEMANAL',estado:'AUTORIZADO',snapshot:{},snapshot_sha256:H64,formula_version:'PRUEBA',creado_por:ACTOR,created_at:'2026-03-12T12:00:00Z'}];
 const ver=(id,cid,oid)=>({id,cierre_id:cid,cierre_origen:cid,obra_id:oid,version:1,estado_origen:'AUTORIZADO',semana:10,snapshot:{},snapshot_sha256:H64,fuente_sha256:H64,actor_id:ACTOR,created_at:'2026-03-12T12:00:00Z'});
 const versiones=[ver(V1,C1,X1),ver(V2,C2,X2)];
 const obligaciones=[];
 const ob=(t,i,tipo,importe,metodo='TRANSFERENCIA')=>obligaciones.push({id:nid(t),cierre_origen:i===9?C2:C1,cierre_id:i===9?C2:C1,version_id:i===9?V2:V1,obra_id:i===9?X2:X1,trabajador_id:W(i),semana:10,tipo,numero:i,
  nombre:'FICTICIA PERSONA '+i,contratista:'CONTR A',importe,metodo,vigente:true,created_at:'2026-03-12T12:00:00Z'});
 ob('O1n',1,'NOMINA','1000.00');ob('O1f',1,'FINIQUITO','500.00');ob('O1p',1,'PREVISION_SOCIAL','300.00');ob('O2',2,'NOMINA','800.00');ob('O3',3,'NOMINA','700.00','CHEQUE');
 ob('O4',4,'NOMINA','600.00','CHEQUE');ob('O5',5,'NOMINA','900.00');ob('O6',6,'NOMINA','1000.00');ob('O8',8,'NOMINA','200.00');ob('O9',9,'NOMINA','5000.00');
 const pagos=[];
 const pg=(t,i,importe,banco,folio,fecha,origen,estado='EXITOSO',hora='10:00:00')=>pagos.push({id:nid(t),obra_id:i===9?X2:X1,trabajador_id:i?W(i):null,semana:'S10',medio:'TRANSFERENCIA',banco,importe,estado,
  fecha_pago:fecha,folio_lote:folio,origen,created_at:fecha+'T'+hora+'Z'});
 pg('P1',1,'1800.00','BBVA','F001','2026-03-13','GLOBAL');                     // un pago para tres conceptos
 pg('P1d',1,'1800.00','AZTECA','Z900','2026-03-13','INDIVIDUAL','EXITOSO','11:00:00'); // posible duplicado (otro banco y folio)
 pg('P2a',2,'800.00','BBVA','AB 12','2026-03-13','GLOBAL');                     // global e individual: misma operación
 pg('P2b',2,'800.00','bbva ','ab12','2026-03-13','INDIVIDUAL','EXITOSO','11:00:00');
 pg('P4',4,'600.00','BBVA','F004','2026-03-13','GLOBAL');
 pg('P5',5,'900.00','BBVA','F005','2026-03-13','GLOBAL');
 pg('P5r',5,'900.00','BBVA','F005','2026-03-20','GLOBAL','RECHAZADO');         // reverso de P5 (aplicada)
 pg('P6',6,'500.00','BBVA','F006','2026-03-13','GLOBAL');
 pg('P6b',6,'250.00','BBVA','F066','2026-03-14','GLOBAL');                      // sin aplicar: por vincular
 pg('P7',7,'300.00','BBVA','F007','2026-03-13','GLOBAL');                       // persona sin obligación
 pg('P8',0,'50.00','BBVA','F008','2026-03-13','GLOBAL');                        // sin trabajador
 pg('P9',8,'260.00','BBVA','F009','2026-03-20','GLOBAL');                       // 200 por vincular + 60 excedente
 const cheques=[];
 const ch=(t,i,importe,estatus,num,extra={})=>cheques.push({id:nid(t),obra_id:X1,trabajador_id:W(i),nombre:'FICTICIA PERSONA '+i,semana:'S10',tipo_pago:'CHEQUE',estatus,eliminado:false,importe,num_cheque:num,
  created_at:'2026-03-13T16:00:00Z',updated_at:'2026-03-13T16:00:00Z',...extra});
 ch('Q3a',3,'700.00','CANCELADO','0001');ch('Q3b',3,'700.00','EXPEDIDO','0002',{reemplaza_cheque_id:I.Q3a});ch('Q4',4,'600.00','ENTREGADO','0003');
 const evidencias=[];
 const ev=(t,i,importe,ref)=>evidencias.push({id:nid(t),obra_id:X1,trabajador_id:W(i),semana:10,clave:'CLAVE-'+t,importe,pago_id:ref.startsWith('P')?I[ref]:null,cheque_id:ref.startsWith('Q')?I[ref]:null,created_at:'2026-03-13T12:00:00Z'});
 ev('E1',1,'1800.00','P1');ev('E2',2,'800.00','P2a');ev('E3a',3,'700.00','Q3a');ev('E3b',3,'700.00','Q3b');ev('E4',4,'600.00','P4');ev('E4q',4,'600.00','Q4');ev('E5',5,'900.00','P5');ev('E6',6,'500.00','P6');
 const aplicaciones=[];
 const ap=(t,o,e,importe,ts,ret=null)=>{const id=nid(t);aplicaciones.push({id,obra_id:X1,obligacion_id:I[o],evidencia_id:I[e],version_id:V1,importe,created_at:ts,retirado_en:ret,retirado_por:ret?ACTOR:null,motivo_retiro:ret?'Retiro ficticio de prueba':null,actor_id:ACTOR,clave_idempotencia:id,motivo:'Aplicación ficticia de prueba'});};
 ap('A1n','O1n','E1','1000.00','2026-03-13T12:00:01Z');ap('A1f','O1f','E1','500.00','2026-03-13T12:00:02Z');ap('A1p','O1p','E1','300.00','2026-03-13T12:00:03Z');
 ap('A2','O2','E2','800.00','2026-03-13T12:00:04Z');
 ap('A3a','O3','E3a','700.00','2026-03-13T16:05:00Z','2026-03-14T10:00:00Z');ap('A3b','O3','E3b','700.00','2026-03-14T11:00:00Z');
 ap('A4','O4','E4','600.00','2026-03-13T12:00:05Z');ap('A4q','O4','E4q','600.00','2026-03-14T12:00:00Z'); // doble pago (transferencia + cheque)
 ap('A5','O5','E5','900.00','2026-03-13T12:00:06Z');
 ap('A6r','O6','E6','100.00','2026-03-13T12:00:07Z','2026-03-13T13:00:00Z');ap('A6','O6','E6','400.00','2026-03-13T14:00:00Z');
 const cfdi=[{documento_id:nid('D1x'),obra_id:X1,trabajador_id:W(1),uuid:'abc-0001',neto:'1000.00',desde:'2026-03-09',hasta:'2026-03-15',tipo:'NOMINA',formato:'XML',anulado:false},
  {documento_id:nid('D1p'),obra_id:X1,trabajador_id:W(1),uuid:'ABC-0001',neto:'1000.00',desde:'2026-03-09',hasta:'2026-03-15',tipo:'NOMINA',formato:'PDF',anulado:false},
  {documento_id:nid('D2x'),obra_id:X1,trabajador_id:W(2),uuid:'uu-0002',neto:'800.00',desde:'2026-03-09',hasta:'2026-03-15',tipo:'NOMINA',formato:'XML',anulado:false},
  {documento_id:nid('D2p'),obra_id:X1,trabajador_id:W(2),uuid:'UU-0002',neto:'799.50',desde:'2026-03-09',hasta:'2026-03-15',tipo:'NOMINA',formato:'PDF',anulado:false}];
 return {I,f:{ahora:'2026-06-01T18:00:00Z',obras,trabajadores,cuadrillas:[],cierres,versiones,flujo:[],obligaciones,evidencias,aplicaciones,pagos,cheques,entregas:[],historial:[],
  finiquitos_transferencia:[],desglose_noi:[],cfdi,efectivo_autorizado:[],errores:[]}};
}
const VIP={vip:true},REST={vip:false,obras:[X1],empresas:['PLATINUM']};
const MARZO={empresa:'PLATINUM',obras:[X1],desde:'2026-03-09',hasta:'2026-03-15'};
const conPermisos=(f,p)=>({...f,permisos:p});
const val=(r,k)=>r.medidas[k].valor;
const CLAVES=['neto_conciliado','pagado_registrado','pagado_conciliado','pendiente_conciliacion','saldo_por_cubrir','excedentes','sin_asignar','cobertura','trabajadores_con_pago'];
const resumen=r=>Object.fromEntries(CLAVES.map(k=>[k,val(r,k)]));
// Esperados calculados a mano (ver informe A6 §Cálculos).
const ESPERADO={
 VIP_PERIODO:{neto_conciliado:6000,pagado_registrado:5750,pagado_conciliado:4300,pendiente_conciliacion:1450,saldo_por_cubrir:250,excedentes:660,sin_asignar:350,cobertura:71.67,trabajadores_con_pago:7},
 VIP_PAGO:{neto_conciliado:6000,pagado_registrado:6500,pagado_conciliado:4300,pendiente_conciliacion:1250,saldo_por_cubrir:250,excedentes:600,sin_asignar:350,cobertura:71.67,trabajadores_con_pago:7},
 REST_PERIODO:{neto_conciliado:5700,pagado_registrado:5450,pagado_conciliado:4000,pendiente_conciliacion:1450,saldo_por_cubrir:250,excedentes:660,sin_asignar:350,cobertura:70.18,trabajadores_con_pago:7},
 REST_PAGO:{neto_conciliado:5700,pagado_registrado:6200,pagado_conciliado:4000,pendiente_conciliacion:1250,saldo_por_cubrir:250,excedentes:600,sin_asignar:350,cobertura:70.18,trabajadores_con_pago:7}};

function seccionModelo(){
 const {I,f}=fuentesBase(),fv=conPermisos(f,VIP),fr=conPermisos(f,REST);
 const rP=M.calcular(fv,{...MARZO,perspectiva:'PERIODO'}),rG=M.calcular(fv,{...MARZO,perspectiva:'PAGO'});
 eq(resumen(rP),ESPERADO.VIP_PERIODO,'VIP PERIODO: medidas calculadas a mano');
 eq(resumen(rG),ESPERADO.VIP_PAGO,'VIP PAGO: medidas calculadas a mano');
 eq(resumen(M.calcular(fr,{...MARZO,perspectiva:'PERIODO'})),ESPERADO.REST_PERIODO,'restringido PERIODO: sin previsión social');
 eq(resumen(M.calcular(fr,{...MARZO,perspectiva:'PAGO'})),ESPERADO.REST_PAGO,'restringido PAGO: sin la pieza de previsión social de P1');
 // Identidades.
 for(const r of [rP,M.calcular(fr,{...MARZO,perspectiva:'PERIODO'})]){
  ok(c(val(r,'neto_conciliado'))===c(val(r,'pagado_registrado'))+c(val(r,'saldo_por_cubrir')),'PERIODO: neto = registrado + saldo');
  ok(c(val(r,'pagado_registrado'))===c(val(r,'pagado_conciliado'))+c(val(r,'pendiente_conciliacion')),'PERIODO: registrado = conciliado + pendiente');
 }
 ok(c(val(rG,'pagado_registrado'))===c(val(rG,'pagado_conciliado'))+c(val(rG,'pendiente_conciliacion'))+c(val(rG,'excedentes'))+c(val(rG,'sin_asignar')),'PAGO: registrado = conciliado + pendiente + excedentes + sin asignar');
 // PAGO = cada operación real del rango una sola vez: P1 1800 + P2 800 + Q3b 700 + P4 600 + Q4 600 + P5 900 + P6 500 + P6b 250 + P7 300 + P8 50.
 ok(c(val(rG,'pagado_registrado'))===c(1800+800+700+600+600+900+500+250+300+50),'PAGO: global+individual, cheque cancelado y duplicado no multiplican');
 eq(rP.medidas.pendiente_conciliacion.desglose.por_motivo.map(x=>[x.motivo,x.importe,x.operaciones]),[['POR_VINCULAR',550,3],['OPERACION_ANULADA',900,1]],'pendiente por motivo (reverso con aplicación vigente)');
 eq([rP.medidas.trabajadores_pago_parcial.valor,rP.medidas.pagado_registrado.desglose.operaciones],[1,8],'pago parcial (W6) y operaciones únicas del registrado PERIODO');
 eq(rP.medidas.cheques_por_estado.desglose.CANCELADO,{cantidad:1,importe:700},'cheque cancelado contado como cheque, no como pago');
 eq([rP.medidas.cheques_por_estado.valor,rP.medidas.cheques_por_estado.desglose.reposiciones],[3,1],'cheques del alcance y reposición');
 eq([rP.medidas.respaldo_fiscal.valor,rP.medidas.respaldo_fiscal.desglose.obligaciones],[1000,{COINCIDE:1,DIFERENCIA:0,SIN_CFDI:6,CONTRADICTORIO:1}],'CFDI+PDF del mismo UUID cuentan una vez; UUID con netos distintos no suma');
 eq(rP.calidad.map(x=>x.estado),['COMPLETO'],'calidad del centro');
 // Detalle por operación: P2 global + individual = una operación con dos representaciones.
 const op=M.detalle(fv,{...MARZO,perspectiva:'PERIODO'},{grano:'OPERACION',por_pagina:500});
 eq(op.total,11,'11 operaciones con piezas en el alcance');
 const p2=op.filas.find(x=>x.operacion_id==='TRF:'+I.P2a);eq([p2.representaciones,p2.origenes,p2.importe],[2,['GLOBAL','INDIVIDUAL'],800],'global e individual unificados');
 ok(!op.filas.some(x=>x.operacion_id==='TRF:'+I.P1d||x.operacion_id==='TRF:'+I.P2b||x.operacion_id==='CHQ:'+I.Q3a),'duplicado, segunda representación y cheque cancelado no son operaciones');
 const opR=M.detalle(fr,{...MARZO,perspectiva:'PERIODO'},{grano:'OPERACION',por_pagina:500}).filas.find(x=>x.operacion_id==='TRF:'+I.P1);
 eq([opR.importe,opR.importe_operacion],[1500,null],'restringido: P1 sólo muestra la parte visible y oculta el importe total');
 // Excepciones esperadas (a mano).
 const ex=M.excepciones(fv,{...MARZO,perspectiva:'PERIODO'},{por_pagina:500}),tipos={};for(const x of ex.filas)tipos[x.tipo]=(tipos[x.tipo]||0)+1;
 eq(tipos,{PAGO_PARCIAL:1,EXCEDENTE_APLICADO:1,CFDI_CONTRADICTORIO:1,POR_VINCULAR:3,EXCEDENTE_NO_APLICADO:1,SIN_ASIGNAR:2,OPERACION_ANULADA:1,POSIBLE_DUPLICADO:1,REPRESENTACIONES_UNIFICADAS:1,CHEQUE_POR_ENTREGAR:1,APLICACION_RETIRADA:2},'excepciones por tipo');
 // Previsión social: el importe completo de la operación sí llega al restringido por excepciones.
 const exR=M.excepciones(fr,{...MARZO,perspectiva:'PERIODO'},{por_pagina:500}).filas.find(x=>x.tipo==='POSIBLE_DUPLICADO');
 hallazgo('H5',exR&&exR.importe===1800,'Restringido (sin VIP) ve en EXCEPCIONES/desglose el importe total de una operación que incluye previsión social (1800) aunque DETALLE oculta importe_operacion (null) y su parte visible es 1500.');
 // Cobertura: denominador nulo vs cero.
 const vacio=M.calcular(fv,{...MARZO,desde:'2026-05-04',hasta:'2026-05-10'});
 eq([vacio.medidas.cobertura.valor,vacio.medidas.cobertura.disponible,/No disponible/.test(vacio.medidas.cobertura.motivo_no_disponible),vacio.medidas.promedio_pagado_trabajador.valor],[null,false,true,null],'denominador cero: cobertura y promedio «No disponible»');
 const x2=M.calcular(fv,{...MARZO,obras:[X2]});
 eq([val(x2,'neto_conciliado'),val(x2,'cobertura'),x2.medidas.cobertura.disponible,val(x2,'saldo_por_cubrir')],[5000,0,true,5000],'cobertura 0 (con exigible) distinta de no disponible');
 // Restringido pide otro centro.
 const fuera=M.calcular(fr,{...MARZO,obras:[X2]});
 eq([fuera.alcance.obras,fuera.alcance.restringido.obras_no_autorizadas,val(fuera,'neto_conciliado'),val(fuera,'cobertura')],[[],1,0,null],'restringido: centro fuera de alcance no se resuelve');
 eq([M.detalle(fr,{...MARZO,obras:[X2]},{grano:'OBLIGACION'}).total,M.excepciones(fr,{...MARZO,obras:[X2]},{}).total],[0,0],'restringido: sin detalle ni excepciones del otro centro');
 const todoR=M.detalle(fr,{empresa:'PLATINUM',desde:'2026-03-09',hasta:'2026-03-15'},{grano:'OBLIGACION',por_pagina:500});
 ok(todoR.filas.every(x=>x.obra_id===X1&&x.concepto!=='PREVISION_SOCIAL'),'restringido sin filtro de centro: sólo su centro y sin previsión social');
 const catR=M.catalogos(fr,{empresa:'PLATINUM'});eq([catR.obras.map(o=>o.id),catR.conceptos],[[X1],['FINIQUITO','NOMINA']],'catálogos del restringido');
 // Determinismo con orden distinto de filas.
 const inv={...fv};for(const k of Object.keys(inv))if(Array.isArray(inv[k]))inv[k]=inv[k].slice().reverse();
 eq(M.calcular(inv,{...MARZO,perspectiva:'PERIODO'}).huella,rP.huella,'misma huella con filas en orden inverso');
 // Redondeo al centavo (mitad lejos de cero) y sin deriva de flotantes.
 const U2=M.util;
 eq([U2.centavos(U2.mic('0.125')),U2.centavos(U2.mic('-0.125')),U2.centavos(U2.mic(0.1+0.2)),U2.centavos(U2.mic(2.675)),U2.pct(1n,3n),U2.pct(2n,3n),U2.pct(1n,0n)],[0.13,-0.13,0.3,2.68,33.33,66.67,null],'redondeo y porcentajes');
 const r2={...fv,obligaciones:[{...fv.obligaciones[0],id:U(500),importe:0.1,trabajador_id:W(10)},{...fv.obligaciones[0],id:U(501),importe:0.2,trabajador_id:W(10),tipo:'FINIQUITO'},{...fv.obligaciones[0],id:U(502),importe:'2.675',trabajador_id:W(10),tipo:'PREVISION_SOCIAL'}],
  pagos:[],cheques:[],evidencias:[],aplicaciones:[],cfdi:[]};
 const rr=M.calcular(r2,{...MARZO});
 eq([val(rr,'neto_conciliado'),val(rr,'saldo_por_cubrir'),val(rr,'cobertura')],[2.98,2.98,0],'suma exacta en millonésimas y redondeo sólo al final');
 // Pago con importe mayor que sus aplicaciones (no lo permite aplicar_pago; defensa en profundidad).
 const sob=clon(fv);sob.aplicaciones.find(a=>a.id===I.A1p).importe='300.00';sob.evidencias.find(e=>e.id===I.E1).importe='1500.00';sob.pagos.find(p=>p.id===I.P1).importe='1500.00';sob.pagos.find(p=>p.id===I.P1d).importe='1500.00';
 const rs=M.calcular(sob,{...MARZO,perspectiva:'PAGO'});
 hallazgo('H6',c(val(rs,'pagado_registrado'))===c(6500),'Operación sobreaplicada (Σ aplicaciones 1800 > importe 1500): en PAGO el registrado suma 1800 por esa operación; sólo se marca la excepción OPERACION_SOBREAPLICADA.');
 // Medio de pago: COMPARATIVOS.por_medio agrupa el neto por método planeado y lo pagado por medio real.
 const pm=M.comparativos(fv,{...MARZO}).por_medio,cheque=pm.find(x=>x.clave==='CHEQUE');
 hallazgo('H7',cheque&&cheque.cobertura!==M.util.pct(BigInt(c(cheque.pagado_conciliado)),BigInt(c(cheque.neto_conciliado))),
  `COMPARATIVOS.por_medio mezcla ejes: fila CHEQUE con neto ${cheque&&cheque.neto_conciliado} (método planeado), conciliado ${cheque&&cheque.pagado_conciliado} (medio real) y cobertura ${cheque&&cheque.cobertura}% (conciliado por método planeado); la fila no es autoconsistente.`);
 return {I,f};
}

/* =====================================================================
   2. Escenarios aleatorios propios (generador distinto al de A1) respetando las guardas del servidor
   ===================================================================== */
function seccionAleatoria(){
 let s=20261111;const rnd=()=>{s=(s+0x6D2B79F5)|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
 const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1)),cent=x=>(x/100).toFixed(2);
 for(let esc=0;esc<24;esc++){
  let k=1;const id=p=>'r'+esc+'-'+p+'-'+(k++);
  const obras=[{id:'RA',nombre:'R A',empresa_codigo:'PLATINUM',fecha_inicio:'2026-01-05'},{id:'RB',nombre:'R B',empresa_codigo:'PLATINUM',fecha_inicio:'2026-01-07'}];
  const F={ahora:'2026-04-30T18:00:00Z',obras,trabajadores:[],cuadrillas:[],cierres:[],versiones:[],flujo:[],obligaciones:[],evidencias:[],aplicaciones:[],pagos:[],cheques:[],entregas:[],historial:[],cfdi:[],efectivo_autorizado:[],errores:[]};
  let reales=0,psTotal=0,obTotal=0;
  for(const o of obras){
   for(let w=1;w<=5;w++)F.trabajadores.push({id:o.id+'W'+w,obra_id:o.id,estatus:'ACTIVO',periodo_pago:'SEMANAL',fecha_alta:'2026-01-05'});
   for(let sem=1;sem<=8;sem++){
    const cid=id('C');F.cierres.push({id:cid,obra_id:o.id,semana:sem,periodo:'SEMANAL',estado:'AUTORIZADO',snapshot:{}});
    const viernes=M.calendario.periodo(o,sem,'SEMANAL').fecha_pago;
    for(let w=1;w<=5;w++){
     const tid=o.id+'W'+w,obs=[];
     for(const tipo of ['NOMINA','FINIQUITO','PREVISION_SOCIAL']){if(tipo==='NOMINA'?rnd()<0.85:rnd()<0.15){const imp=ri(1,250000);const x={id:id('O'),cierre_id:cid,obra_id:o.id,trabajador_id:tid,semana:sem,tipo,importe:cent(imp),metodo:'TRANSFERENCIA',vigente:true,contratista:'K'+(w%2)};F.obligaciones.push(x);obs.push({x,imp,usado:0});obTotal+=imp;if(tipo==='PREVISION_SOCIAL')psTotal+=imp;}}
     const modo=ri(0,6);if(!obs.length&&modo<5)continue;
     const total=obs.reduce((a,b)=>a+b.imp,0);
     let imp=modo===0?0:modo===1?total:modo===2?Math.max(1,Math.floor(total/2)):modo===3?total+ri(1,5000):modo===4?total:ri(100,9000);
     if(!imp)continue;
     const fecha=M.calendario.sumar(viernes,ri(0,25));
     const conCheque=modo===4&&obs.length===1&&obs[0].x.tipo==='NOMINA';
     let evid;
     if(conCheque){const q={id:id('Q'),obra_id:o.id,trabajador_id:tid,semana:'S'+sem,tipo_pago:'CHEQUE',estatus:rnd()<0.5?'EXPEDIDO':'ENTREGADO',eliminado:false,importe:cent(imp),created_at:fecha+'T17:00:00Z'};F.cheques.push(q);
      evid={id:id('E'),obra_id:o.id,trabajador_id:tid,semana:sem,importe:cent(imp),cheque_id:q.id,created_at:q.created_at};}
     else{const folio='F'+esc+'-'+k,p={id:id('P'),obra_id:o.id,trabajador_id:tid,semana:'S'+sem,medio:'TRANSFERENCIA',banco:'BBVA',importe:cent(imp),estado:'EXITOSO',fecha_pago:fecha,folio_lote:folio,origen:'GLOBAL',created_at:fecha+'T10:00:00Z'};F.pagos.push(p);
      if(rnd()<0.3)F.pagos.push({...p,id:id('P'),origen:'INDIVIDUAL',folio_lote:' '+folio.toLowerCase()+' ',created_at:fecha+'T11:00:00Z'}); // segunda representación
      evid={id:id('E'),obra_id:o.id,trabajador_id:tid,semana:sem,importe:cent(imp),pago_id:p.id,created_at:p.created_at};}
     reales+=imp;
     if(modo===5){if(rnd()<0.5){/* operación sin obligación de su semana */}}
     if(rnd()<0.75&&modo!==5){ // aplicaciones dentro de las guardas: Σ por evidencia ≤ importe; Σ por obligación ≤ importe
      F.evidencias.push(evid);let resto=imp;
      for(const b of obs){const a=Math.min(resto,b.imp-b.usado);if(a<=0)continue;b.usado+=a;resto-=a;F.aplicaciones.push({id:id('A'),obra_id:o.id,obligacion_id:b.x.id,evidencia_id:evid.id,importe:cent(a),created_at:fecha+'T12:00:0'+(k%10)+'Z',retirado_en:null});}
     }
    }
   }
  }
  const todo={empresa:'PLATINUM',desde:'2026-01-01',hasta:'2026-12-31'},fv={...F,permisos:{vip:true}},fr={...F,permisos:{vip:false}};
  const rPa=M.calcular(fv,{...todo,perspectiva:'PAGO'}),rPe=M.calcular(fv,{...todo,perspectiva:'PERIODO'});
  ok(c(val(rPa,'pagado_registrado'))===reales,`esc ${esc}: PAGO total = Σ operaciones reales (una vez)`);
  ok(c(val(rPe,'neto_conciliado'))===obTotal,`esc ${esc}: neto = Σ obligaciones`);
  ok(c(val(M.calcular(fr,{...todo}),'neto_conciliado'))===obTotal-psTotal,`esc ${esc}: restringido = neto − previsión social`);
  eq(val(M.calcular(fr,{...todo,conceptos:['NOMINA']}),'pagado_conciliado'),val(M.calcular(fv,{...todo,conceptos:['NOMINA']}),'pagado_conciliado'),`esc ${esc}: el permiso no reasigna lo conciliado de nómina`);
  for(let q=0;q<4;q++){
   const d=M.calendario.sumar('2026-01-05',ri(0,70)),h=M.calendario.sumar(d,ri(0,40)),fl={empresa:'PLATINUM',desde:d,hasta:h,obras:rnd()<0.5?['RA']:[],perspectiva:rnd()<0.5?'PAGO':'PERIODO'};
   for(const fx of [fv,fr]){
    const r=M.calcular(fx,fl),v=k2=>c(val(r,k2));
    if(fl.perspectiva==='PERIODO'){ok(v('neto_conciliado')===v('pagado_registrado')+v('saldo_por_cubrir')&&v('pagado_registrado')===v('pagado_conciliado')+v('pendiente_conciliacion'),`esc ${esc}: identidades PERIODO`);}
    else ok(v('pagado_registrado')===v('pagado_conciliado')+v('pendiente_conciliacion')+v('excedentes')+v('sin_asignar'),`esc ${esc}: identidad PAGO`);
    const dO=M.detalle(fx,fl,{grano:'OBLIGACION',por_pagina:500}),dP=M.detalle(fx,fl,{grano:'OPERACION',por_pagina:500});
    const S=(xs,f)=>xs.reduce((a,x)=>a+c(f(x)),0),obR=fl.perspectiva==='PAGO'?dO.filas.filter(o=>o.fecha_pago>=d&&o.fecha_pago<=h):dO.filas;
    ok(S(obR,x=>x.importe)===v('neto_conciliado')&&S(obR,x=>x.saldo)===v('saldo_por_cubrir'),`esc ${esc}: detalle por obligación cuadra con neto y saldo`);
    ok(S(dP.filas,x=>x.conciliado)===v('pagado_conciliado')&&S(dP.filas,x=>x.pendiente_conciliacion)===v('pendiente_conciliacion'),`esc ${esc}: detalle por operación cuadra`);
    if(fl.perspectiva==='PAGO')ok(S(dP.filas,x=>x.importe)===v('pagado_registrado'),`esc ${esc}: Σ importe por operación = registrado PAGO`);
    const t=M.tendencia(fx,fl).filas,cp=M.comparativos(fx,fl).por_centro;
    ok(S(t,x=>x.pagado_registrado)===v('pagado_registrado')&&S(cp,x=>x.pagado_conciliado)===v('pagado_conciliado'),`esc ${esc}: tendencia y comparativos cuadran`);
    // Paginación sin repetidos ni huecos.
    const pags=[];for(let p=1;p<=Math.ceil(dO.total/7)||p===1;p++){pags.push(...M.detalle(fx,fl,{grano:'OBLIGACION',por_pagina:7,pagina:p}).filas);if(p>200)break;}
    eq(pags.map(x=>x.obligacion_id),dO.filas.map(x=>x.obligacion_id),`esc ${esc}: páginas de 7 = listado completo`);
   }
  }
 }
}

/* =====================================================================
   3. Controlador (78) + vista (77) en VM: concurrencia, caché, exportación, XSS
   ===================================================================== */
async function seccionControlador(base){
 const {window,document}=parseHTML('<html><head></head><body><div id="modals"></div><div id="toasts"></div></body></html>');
 let activo=null;Object.defineProperty(document,'activeElement',{configurable:true,get(){return activo&&activo.isConnected?activo:document.body;}});
 window.HTMLElement.prototype.focus=function(){activo=this;};
 const tick=async(k=10)=>{for(let i=0;i<k;i++)await new Promise(r=>setImmediate(r));};
 let fuentesServidor=clon(base.f);const llamadas=[];let retener=null;const retenidas=[];
 const permisosDe=u=>u.id==='u-rest'?REST:VIP;
 const servir=(acc,d,u)=>{const f={...fuentesServidor,permisos:permisosDe(u)};return {CATALOGOS:()=>M.catalogos(f,d),RESUMEN:()=>M.calcular(f,d),TENDENCIA:()=>M.tendencia(f,d),COMPARATIVOS:()=>M.comparativos(f,d),
  EXCEPCIONES:()=>M.excepciones(f,d,d),DETALLE:()=>M.detalle(f,d,d),PLANTILLA:()=>M.plantilla(f,d,d)}[acc]();};
 let box;
 const sb={rpc:async(fn,a)=>{a=clon(a);const u=box.USER;llamadas.push(a.p_accion);await new Promise(r=>setImmediate(r));
   const datos=clon(servir(a.p_accion,a.p_datos,u)); // se calcula al recibir la solicitud (instantánea del servidor)
   if(retener&&retener(a.p_accion)){retener=null;await new Promise(r=>retenidas.push(r));}
   return {data:datos,error:null};},
  from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})};return q;},storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{message:'x'}})})}};
 const code=[];
 for(const p of JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules){if(/7[6-9]-/.test(p))continue;const s=fs.readFileSync(p,'utf8');
  for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.init&&['ST','BORD'].includes(x.id.name)))code.push(s.slice(node.start,node.end));}
 const descargas=[];
 box={window:null,document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,WeakMap,Promise,Error,RegExp,Symbol,Intl,BigInt,TextEncoder,setImmediate,setTimeout,clearTimeout,setInterval,clearInterval,
  performance:require('node:perf_hooks').performance,MutationObserver:window.MutationObserver,HTMLElement:window.HTMLElement,sb,USER:{id:'u-admin',email:'revisor@ejemplo.test'},
  OBRA:base.f.obras[0],OBRAS:base.f.obras,WORKERS:[],EMPRESA_ACTIVA:'PLATINUM',EMPRESAS:{PLATINUM:{nombre:'PLATINUM'}},CFGEMP:{},DOCSX:[],XLSX,confirm:()=>true,scrollTo:()=>{},open:()=>{}};
 box.window=box;box.globalThis=box;vm.createContext(box);
 vm.runInContext(`const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>v==null||v===''?'':Number(v).toFixed(2);const fmtD=v=>v?String(v).slice(0,10):'';const today=()=>'2026-06-01';`+code.join('\n'),box);
 for(const m of ['76-tablero-modelo','77-tablero-vista','78-tablero-ejecutivo'])vm.runInContext(fs.readFileSync('frontend/modulos/'+m+'.js','utf8'),box);
 Object.assign(box,{toast:()=>{},esVip:()=>box.USER.id==='u-admin',esAdmin:()=>box.USER.id==='u-admin',dl:async(wb,nombre)=>{descargas.push({wb,nombre});}});
 const T=box.PLATINUM_TABLERO,S=T._pruebas.S;
 T.configurar({hoy:'2026-06-01',debounce_filtros_ms:1,debounce_busqueda_ms:1,vigilancia_ms:0});
 const neto=()=>{const e=T.estado();return e&&e.resumen&&e.resumen.medidas.neto_conciliado.valor;};
 await T.abrir({obras:[X1],desde:'2026-03-09',hasta:'2026-03-15',preset:'PERSONALIZADO',comparar:'NINGUNO'});await tick();
 eq(neto(),6000,'controlador: resumen del servidor pintado');
 // 3.1 Respuesta tardía de filtros anteriores: se descarta.
 retener=a=>a==='RESUMEN';
 const p1=T.acciones.cambiarFiltros({desde:'2026-03-02',hasta:'2026-03-08'});await new Promise(r=>setTimeout(r,5));await tick();
 const p2=T.acciones.cambiarFiltros({desde:'2026-03-09',hasta:'2026-03-15'});await new Promise(r=>setTimeout(r,5));await tick();
 while(retenidas.length)retenidas.shift()();await Promise.all([p1,p2]);await tick(30);
 eq([T.estado().filtros.desde,neto()],['2026-03-09',6000],'respuesta tardía del rango anterior descartada');
 // 3.2 Aviso de cambio compartido mientras una lectura está en vuelo, seguido de «Actualizar».
 const antes=llamadas.filter(x=>x==='RESUMEN').length;
 retener=a=>a==='RESUMEN';
 const r1=T.acciones.reintentar('todo');await tick();
 fuentesServidor=clon(base.f);fuentesServidor.obligaciones.find(o=>o.id===base.I.O2).importe='900.00'; // el dato cambió en el servidor
 T.avisarCambio();
 const r2=T.acciones.reintentar('todo');await tick();
 while(retenidas.length)retenidas.shift()();await Promise.all([r1,r2]);await tick(30);
 const despues=llamadas.filter(x=>x==='RESUMEN').length-antes;
 hallazgo('H1',neto()===6000&&T.estado().desactualizado===false,`Tras avisarCambio(), «Actualizar» reutiliza la lectura en vuelo previa al cambio (S.enVuelo no se limpia): ${despues} RESUMEN nuevo(s), neto mostrado ${neto()} (vigente 6100) y la marca «desactualizado» queda en falso.`);
 const cacheVieja=[...S.cache.values()].some(e=>e.data&&e.data.accion==='RESUMEN'&&e.data.medidas.neto_conciliado.valor===6000);
 hallazgo('H1b',cacheVieja,'La respuesta en vuelo previa a avisarCambio() se guarda en caché después de vaciarla (TTL 3 min): una apertura posterior la sirve como vigente.');
 await T.acciones.reintentar('todo');await tick(30);
 eq(neto(),6100,'un segundo «Actualizar» ya trae el dato vigente');
 fuentesServidor=clon(base.f);T._pruebas.limpiarCache();await T.acciones.reintentar('todo');await tick(30);
 // 3.3 Exportación filtrada: cuadre al centavo, hojas, textos, anti-fórmula, división.
 T.configurar({limite_filas_hoja:4});
 fuentesServidor.obligaciones.find(o=>o.id===base.I.O2).contratista='=HYPERLINK("http://x","y")';fuentesServidor.obligaciones.find(o=>o.id===base.I.O4).nombre='+SUMA(1;2)';
 T._pruebas.limpiarCache();await T.acciones.reintentar('todo');await tick(30);
 const ex=await T.acciones.exportar('xlsx');
 ok(ex&&ex.ok,'exportación generada');
 eq(ex.cuadre.map(x=>x.resultado),ex.cuadre.map(()=>'CUADRA'),'CUADRE de la exportación: todo cuadra');
 const wb=ex.wb,nombres=wb.SheetNames;
 ok(nombres.every(x=>x.length<=31)&&new Set(nombres.map(x=>x.toLowerCase())).size===nombres.length,'hojas ≤31 caracteres y únicas: '+nombres.join(' | '));
 ok(nombres.filter(x=>x.startsWith('DETALLE OBLIGACIONES')).length===3,'detalle dividido por el límite configurado de filas por hoja (9 → 3 hojas de 4)');
 const filasHoja=nombre=>XLSX.utils.sheet_to_json(wb.Sheets[nombre],{header:1,raw:true});
 const partes=nombres.filter(x=>x.startsWith('DETALLE OBLIGACIONES')).map(filasHoja);
 const encab=partes[0][1],iImp=encab.findIndex(h=>/^Neto/.test(h)),iId=encab.indexOf('ID obligación');
 const datos=partes.flatMap((p,i)=>p.slice(2,i===partes.length-1?-1:undefined));
 eq([datos.length,Math.round(datos.reduce((s,r)=>s+r[iImp],0)*100)],[9,600000],'Σ neto de las hojas de detalle = 6,000.00 del resumen');
 const pie=partes[partes.length-1].slice(-1)[0];ok(Math.round(pie[iImp]*100)===600000,'el TOTAL de la última parte suma todas las partes');
 const sh=wb.Sheets[nombres.find(x=>x.startsWith('DETALLE OBLIGACIONES'))],celdaId=sh[XLSX.utils.encode_cell({r:2,c:iId})];
 eq([celdaId.t,celdaId.z],['s','@'],'IDs como texto con formato @');
 const todasCeldas=nombres.flatMap(nm=>Object.entries(wb.Sheets[nm]).filter(([k])=>k[0]!=='!').map(([,v])=>v));
 ok(todasCeldas.every(x=>!x.f),'ninguna celda es fórmula');
 const releido=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellFormula:true});
 ok(Object.values(releido.Sheets).every(s=>Object.entries(s).every(([k,v])=>k[0]==='!'||!v.f)),'releído: sin fórmulas');
 const crudos=todasCeldas.filter(x=>typeof x.v==='string'&&/^[=+\-@]/.test(x.v)&&/HYPERLINK|SUMA/.test(x.v));
 hallazgo('H8',crudos.length>0,`La exportación del tablero (78) escribe textos que empiezan con = + - @ sin neutralizar (${crudos.length} celdas); son t:'s' en XLSX (no se evalúan), pero el contrato §8 pide anti-fórmula y un «Guardar como CSV» los convertiría en fórmulas.`);
 T.configurar({limite_filas_hoja:1000000});
 // 3.4 Usuario restringido: exportación sólo de su alcance.
 box.USER={id:'u-rest',email:'consulta@ejemplo.test'};T._pruebas.vigilar();await tick(40);
 await T.acciones.cambiarFiltros({obras:[X1,X2],desde:'2026-03-09',hasta:'2026-03-15',preset:'PERSONALIZADO'});await tick(40);
 const exR=await T.acciones.exportar('xlsx');
 const textoLibro=JSON.stringify(Object.values(exR.wb.Sheets).map(s=>Object.values(s).map(x=>x&&x.v)));
 ok(exR.ok&&!textoLibro.includes(X2)&&!textoLibro.includes(base.I.O1p)&&!textoLibro.includes(base.I.O9),'restringido: el Excel no contiene el otro centro ni la obligación de previsión social');
 eq(exR.wb.__auditObraIds,[X1],'bitácora de exportación con el alcance resuelto por el servidor');
 ok(/fuera de tu alcance/.test(textoLibro),'centro solicitado fuera de alcance rotulado');
 T.cerrar();
 // 3.5 Vista: textos hostiles no se interpretan como HTML.
 box.USER={id:'u-admin',email:'revisor@ejemplo.test'};
 fuentesServidor=clon(base.f);fuentesServidor.obras[0].nombre='<img src=x onerror="globalThis.__xss=1">';
 for(const o of fuentesServidor.obligaciones){o.contratista='<b id="inyectado">X</b>';o.nombre='<svg onload="x()"></svg>';}
 box.OBRAS=fuentesServidor.obras;box.OBRA=fuentesServidor.obras[0];T._pruebas.limpiarCache();
 await T.abrir({obras:[X1],desde:'2026-03-09',hasta:'2026-03-15',preset:'PERSONALIZADO'});await tick(40);
 await T.acciones.abrirDetalle('neto_conciliado',{origen:'indicador'});await T.acciones.cargarExcepciones();await T.acciones.cambiarVista('CONCILIACION');await tick(40);
 ok(document.querySelector('#tablero-host')&&!document.querySelector('img[onerror],#inyectado,svg[onload]')&&document.body.innerHTML.includes('&lt;b id='),'vista: nombres de centro, contratista y trabajador escapados');
 T.cerrar();
}

/* =====================================================================
   4. Respaldo integral (79): funciones puras, hojas, textos, división y cuadre
   ===================================================================== */
function seccionRespaldo(){
 const box={console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,BigInt,TextEncoder,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto};box.window=box;box.globalThis=box;vm.createContext(box);
 const src=fs.readFileSync('frontend/modulos/79-respaldo-integral.js','utf8');vm.runInContext(src,box);
 const R=box.PLATINUM_RESPALDO,P=R._pruebas;
 const usados=new Set(['manifiesto']),nom=[];for(let i=0;i<40;i++)nom.push(P.nombreHoja('CENTRO DE TRABAJO CON NOMBRE MUY LARGO [A]/B:'+(i%3),usados));
 ok(nom.every(x=>x.length<=31&&!/[\\\/?*\[\]:]/.test(x))&&new Set(nom.map(x=>x.toLowerCase())).size===40,'40 hojas con el mismo prefijo: únicas, ≤31 y sin caracteres prohibidos');
 eq([P.nombreHoja('History',new Set()),P.nombreHoja('manifiesto',new Set(['manifiesto'])),P.nombreHoja("'x'",new Set())],['History_','manifiesto (2)','x'],'nombres reservados');
 for(const v of ['=1+1','+52 771','-5','@SUMA(A1)','012345678901234567','XEXX010101HNEXXXA4','12345678901']){const cel=P.celda(P.valorLogico(v,'TEXTO'),'TEXTO');ok(cel.t==='s'&&cel.v===v&&cel.s.numFmt==='@'&&!cel.f,'texto literal sin fórmula: '+v);}
 eq([P.celda(null,'TEXTO').v,P.celda('','TEXTO'),P.celda(0,'IMPORTE').v,P.celda(0,'IMPORTE').t,P.celda('∅x','TEXTO').v],[R.NULO,null,0,'n','∅∅x'],'nulo ≠ vacío ≠ cero; ∅ real escapado');
 eq([P.valorLogico(12345678901,'ID'),P.tipoDe('clabe','text'),P.tipoDe('nss',undefined,'12345678901'),P.tipoDe('importe','numeric(14,2)'),P.tipoDe('cuenta',undefined,123)],['12345678901','TEXTO','TEXTO','IMPORTE','NUMERO'],'tipos: IDs/CLABE/NSS texto, importes numéricos');
 hallazgo('H9',P.tipoDe('cuenta',undefined,123)==='NUMERO'&&P.tipoDe('clabe',undefined,12345678901234567)==='NUMERO','tipoDe sin metadato de columna (respaldo sin RPC de marcas) infiere NUMERO para CUENTA/CLABE/NSS numéricos: perdería ceros a la izquierda si la base los entregara como número (hoy son text en producción).');
 const largo='a'.repeat(29999)+'😀'+'b'.repeat(40000),tro=P.partirTexto(largo);
 ok(tro.join('')===largo&&tro.every(x=>x.length<=30000)&&tro.every(x=>!/[\uD800-\uDBFF]$/.test(x)),'texto largo en partes ≤30,000 sin partir pares sustitutos');
 const L={nombre:'HOJA LOGICA CON NOMBRE DE MAS DE VEINTISEIS',fuente:'x',dominio:'D',cols:[{campo:'a'}],filas:Array.from({length:23},(_,i)=>['fila '+i])};
 const L2={...L,nombre:'HOJA LOGICA CON NOMBRE DE MAS DE VEINTISEIS',filas:Array.from({length:5},(_,i)=>['otra '+i])};
 const partes=P.planificar([L,L2],{limiteFilas:6,presupuesto:120});
 const hojas=partes.flatMap(p=>p.hojas),nombresH=hojas.map(h=>h.nombre);
 ok(nombresH.every(x=>x.length<=31)&&new Set(nombresH.map(x=>x.toLowerCase())).size===nombresH.length,'división: nombres únicos ≤31 entre partes y hojas lógicas homónimas');
 eq(hojas.filter(h=>h.L===L).flatMap(h=>h.filas),L.filas,'división: filas completas, en orden y sin repetir');
 ok(hojas.every(h=>h.filas.length<=5)&&partes.length>1,'división: respeta filas por hoja (límite − encabezado) y presupuesto por archivo');
 // Cuadre del CONTROL contra el tablero: el respaldo no entrega efectivo autorizado al modelo.
 const cuerpo=src.slice(src.indexOf('function cuadreTablero'),src.indexOf('/* ---------- partes y hojas'));
 const sinEfectivo=/efectivo_autorizado:\[\]/.test(cuerpo);
 const b=fuentesBase().f,o=b.obligaciones.find(x=>x.tipo==='FINIQUITO');
 const con=M.calcular({...b,permisos:VIP,efectivo_autorizado:[{obligacion_id:o.id,importe:'0',fecha:null}],aplicaciones:b.aplicaciones.filter(a=>a.obligacion_id!==o.id)},MARZO);
 const efe=M.calcular({...b,permisos:VIP,efectivo_autorizado:[{obligacion_id:o.id,importe:'500.00',fecha:'2026-03-13'}],aplicaciones:b.aplicaciones.filter(a=>a.obligacion_id!==o.id)},MARZO);
 hallazgo('H3',sinEfectivo&&con.huella!==efe.huella,`El CONTROL del respaldo calcula el cuadre con efectivo_autorizado:[] y cfdi:[]: con un finiquito en efectivo autorizado (existe en producción) sus medidas difieren del tablero (pendiente ${val(con,'pendiente_conciliacion')} vs ${val(efe,'pendiente_conciliacion')}; excedentes ${val(con,'excedentes')} vs ${val(efe,'excedentes')}).`);
 ok(/precision/.test(src)&&/LIM_CELDA=32767/.test(src)&&/LIM_FILAS_EXCEL=1048576/.test(src),'límites de Excel declarados (celda 32,767; filas 1,048,576)');
}

/* =====================================================================
   5. Regresiones, globales y seguridad de publicación
   ===================================================================== */
function seccionRegresiones(){
 const mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules,vistos=new Map(),dup=[],funcs=new Map();
 for(const p of mods){const s=fs.readFileSync(p,'utf8'),ast=acorn.parse(s,{ecmaVersion:'latest'});
  for(const nd of ast.body){const ns=nd.type==='FunctionDeclaration'?[nd.id.name]:nd.type==='VariableDeclaration'?nd.declarations.flatMap(d=>d.id.type==='Identifier'?[d.id.name]:[]):nd.type==='ClassDeclaration'?[nd.id.name]:[];
   for(const x of ns){if(vistos.has(x))dup.push(x);else vistos.set(x,p);}if(nd.type==='FunctionDeclaration')funcs.set(nd.id.name,s.slice(nd.start,nd.end));}
  if(/7[6-9]-/.test(p))eq(ast.body.length,1,'módulo nuevo con un único enunciado de nivel superior: '+path.basename(p));}
 eq(dup,[],'sin nombres globales duplicados en los '+mods.length+' módulos');
 const nuevos=['76-tablero-modelo','77-tablero-vista','78-tablero-ejecutivo','79-respaldo-integral'].map(m=>'frontend/modulos/'+m+'.js');
 ok(nuevos.every(p=>mods.includes(p))&&mods.indexOf(nuevos[0])<mods.indexOf(nuevos[1])&&mods.indexOf(nuevos[1])<mods.indexOf(nuevos[2]),'76→77→78→79 en modulos.json');
 // Globales que expone cada módulo nuevo.
 for(const [p,esperado] of [[nuevos[0],['PLATINUM_TABLERO_MODELO']],[nuevos[1],['PLATINUM_TABLERO_VISTA']],[nuevos[2],['PLATINUM_TABLERO']],[nuevos[3],['PLATINUM_RESPALDO']]]){
  const {window:w2,document:d2}=parseHTML('<html><body></body></html>');const bx={console,Date,Math,JSON,Number,String,Array,Object,Set,Map,WeakMap,Promise,Error,RegExp,Symbol,Intl,BigInt,TextEncoder,setTimeout,clearTimeout,document:d2};
  bx.window=bx;bx.globalThis=bx;vm.createContext(bx);const k0=new Set(Object.keys(bx));vm.runInContext(fs.readFileSync(p,'utf8'),bx);
  eq(Object.keys(bx).filter(k=>!k0.has(k)).sort(),esperado,'globales expuestos por '+path.basename(p));}
 // Funciones originales: alteradas sólo con revisión registrada; protegidas intactas.
 const orig=JSON.parse(fs.readFileSync('frontend/funciones-originales.json','utf8')).funciones,rev=JSON.parse(fs.readFileSync('frontend/revision-auditada.json','utf8'));
 const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
 const alteradas=Object.keys(orig).filter(k=>funcs.has(k)&&sha(funcs.get(k))!==orig[k]);
 eq(alteradas.filter(k=>!(k in rev)),[],'toda función original alterada está en revision-auditada.json');
 ok(alteradas.includes('openDashboard')&&alteradas.includes('exportRespaldo')&&rev.openDashboard&&rev.exportRespaldo,'openDashboard y exportRespaldo alteradas y registradas');
 const protegidas=['proyModelo','calcPrestaciones','retencionEvaluada','descuentosDe','calcularPrestaciones','fonacotMontoPeriodo','infonavitRetencionPeriodo'];
 for(const k of protegidas)if(funcs.has(k)){const s=funcs.get(k);ok(!/PLATINUM_TABLERO|PLATINUM_RESPALDO/.test(s)&&(!(k in orig)||sha(s)===orig[k]||(k in rev)),'función protegida sin cambios del tablero/respaldo: '+k);}
 const g=(cmd)=>{try{return require('node:child_process').execSync(cmd,{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch(e){return null;}};
 const base=g('git rev-parse --verify -q dc42457');
 if(base){for(const m of ['52','53']){const fs2=fs.readdirSync('frontend/modulos').filter(x=>x.startsWith(m+'-'));for(const x of fs2)eq(g('git show dc42457:frontend/modulos/'+x),fs.readFileSync('frontend/modulos/'+x,'utf8'),'motor '+x+' byte-idéntico a la base');}
  const cambiados=(g('git diff --name-only dc42457 -- frontend/modulos')||'').trim().split('\n').filter(Boolean).sort();
  eq(cambiados,['frontend/modulos/01-sesion-centros-sincronizacion.js','frontend/modulos/34-dashboard-respaldos.js',...nuevos].sort(),'sólo 01 y 34 cambian entre los módulos existentes');}
 // Seguridad de publicación.
 const ign=g('git check-ignore -q supabase/migrations/20261111100000_tablero_indicadores.sql && git check-ignore -q supabase/migrations/20261111100100_respaldo_marcas.sql && git check-ignore -q work/x && echo si');
 if(ign!==null)eq((ign||'').trim(),'si','migraciones privadas y work/ ignoradas por git');
 const tracked=g('git ls-files');
 if(tracked!==null){
  const lista=tracked.split('\n');ok(!lista.some(x=>/^work\/|_tablero_indicadores\.sql$|_respaldo_marcas\.sql$/.test(x)),'ningún archivo privado versionado');
  const publicos=['docs/MODELO_INDICADORES.md','docs/TABLERO_DISENO.md','docs/RESPALDO_COBERTURA.md','assets/platinum-tablero.css','scripts/fixtures/tablero/casos.json',...nuevos,'scripts/test_tablero_modelo.cjs','scripts/test_tablero_vista.cjs','scripts/test_tablero_ui.cjs','scripts/test_respaldo_integral.cjs'];
  const patrones=[/postgres(ql)?:\/\/[^\s'"]+@/i,/eyJhbGciOi/,/sk_(live|test)_/,/service_role_key/i,/\/home\/|\/Users\/|C:\\\\Users/,/[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[0-9A-Z]\d/,/@(gmail|hotmail|outlook|yahoo)\.com/i];
  for(const p of publicos)if(fs.existsSync(p)){const s=fs.readFileSync(p,'utf8');ok(!patrones.some(r=>r.test(s)),'sin credenciales, CURP, correos reales ni rutas privadas: '+p);}
  const bundle=lista.find(x=>/^assets\/platinum-app\.[0-9a-f]+\.js$/.test(x)&&fs.existsSync(x)&&fs.readFileSync('index.html','utf8').includes(path.basename(x)));
  if(bundle){const s=fs.readFileSync(bundle,'utf8');ok(s.includes('PLATINUM_TABLERO_MODELO')&&s.includes('PLATINUM_RESPALDO')&&!/control_tablero\(p_accion text|create or replace function public\.control_respaldo/.test(s),'bundle publicado: módulos nuevos sin SQL privado');
   const internas=[...new Set((s.match(/platinum_internal\.[a-z_]+/g)||[]))];
   hallazgo('H10',internas.length>5,`El bundle público ahora enumera ${internas.length} tablas internas (platinum_internal.*) y nombra las claves de configuración con credenciales (correo_creados, admin_papelera); hoy sin GRANT a authenticated/anon, pero es información de superficie que antes no se publicaba.`);}
 }
}

/* =====================================================================
   6. SQL del tablero (A3) y del respaldo (A4): análisis estático y, si existe el paquete privado, PGlite
   ===================================================================== */
function estaticoSQL(){
 const dir='supabase/migrations',res={};
 for(const [k,re] of [['tablero',/_tablero_indicadores\.sql$/],['respaldo',/_respaldo_marcas\.sql$/]]){
  const f=fs.existsSync(dir)&&fs.readdirSync(dir).find(x=>re.test(x));if(!f)continue;const s=fs.readFileSync(path.join(dir,f),'utf8');res[k]=s;
  const pub=[...s.matchAll(/create or replace function (public\.[a-z_]+)\(([^)]*)\)[\s\S]*?(?=\bas\s+\$)/gi)];
  for(const m of pub){const cab=m[0];ok(/security definer/i.test(cab)&&/set search_path\s*(to|=)\s*''/i.test(cab),k+': '+m[1]+' SECURITY DEFINER con search_path vacío');}
  ok(!/grant[^;]*\banon\b/i.test(s)&&/revoke all on function public\.[a-z_]+\(text,\s*jsonb\) from (public,\s*anon|anon)/i.test(s),k+': sin grant a anon y con revoke explícito');
  ok(/app_registrado\(\)/.test(s)&&/app_ve_obra\(/.test(s)&&/app_ve_empresa\(/.test(s)&&/app_es_vip\(\)/.test(s),k+': autoriza en el servidor (registrado, centro, razón social, VIP)');
  const dinamico=[...s.matchAll(/execute\s+format\(([\s\S]*?)\)\s*(using|;)/gi)].map(m=>m[1]);
  ok(dinamico.every(x=>!/p_datos|j->>|fl->>|op->>/.test(x)),k+': SQL dinámico sin texto del cliente concatenado');
  ok(!/\|\|\s*(p_datos|j|fl|op)->>/.test(s.replace(/--.*$/gm,'').replace(/raise exception[^;]*;/gi,'').split(/execute/i).slice(1).map(x=>x.slice(0,400)).join('')),k+': execute sin concatenar parámetros');
 }
 return res;
}
async function seccionPG(base,sqls){
 const priv='work/tablero_20261111',bases=['work/aguinaldo_20261110/prod_base.sql',priv+'/prod_base.sql',priv+'/prod_base_a3.sql'];
 if(!sqls.tablero||!bases.every(f=>fs.existsSync(f))){console.log('ALCANCE PÚBLICO: comparación SQL del tablero omitida (requiere el paquete privado).');return {omitido:true};}
 const {makeDatabase}=require('./soporte_flujo_pg.cjs');const db=await makeDatabase();
 for(const f of bases)await db.exec(fs.readFileSync(f,'utf8'));
 try{await db.exec(sqls.tablero);}catch(e){hallazgo('H0',true,'La migración del tablero no carga en PGlite: '+e.message);return {error:true};}
 const def=(await db.query("select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') auth from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname='control_tablero') or (n.nspname='platinum_internal' and p.proname='tablero_rpc')")).rows;
 const ct=def.find(x=>x.proname==='control_tablero'),tr=def.find(x=>x.proname==='tablero_rpc');
 eq([ct.prosecdef,ct.proconfig,ct.anon,ct.auth],[true,['search_path=""'],false,true],'control_tablero: SECURITY DEFINER, search_path vacío, sin anon');
 eq([tr.anon,tr.auth],[false,false],'tablero_rpc interna sin EXECUTE para anon/authenticated');
 const T={obras:'obras',trabajadores:'trabajadores',cierres:'control_cierres_nomina',versiones:'control_cierre_versiones',obligaciones:'control_obligaciones_pago',evidencias:'control_evidencias_pago',aplicaciones:'control_pago_aplicaciones',pagos:'pagos',cheques:'cheques'};
 const cols={};for(const t of [...Object.values(T),'documentos'])cols[t]=(await db.query(`select column_name c,data_type t,is_nullable='NO' and column_default is null and is_generated='NEVER' and identity_generation is null req from information_schema.columns where table_schema='public' and table_name=$1`,[t])).rows;
 const relleno=(cc,r,i)=>cc.t==='uuid'?(r.id||U(7000+i)):/int|numeric/.test(cc.t)?0:cc.t==='jsonb'?{}:cc.t==='boolean'?false:/timestamp/.test(cc.t)?'2026-03-01T00:00:00Z':cc.t==='date'?'2026-03-01':cc.t==='ARRAY'?[]:'Dato ficticio de prueba';
 let fila=0;
 const insertar=async(t,filas)=>{for(const r0 of filas){fila++;const r={};for(const cc of cols[t]){if(r0[cc.c]!==undefined)r[cc.c]=r0[cc.c];else if(cc.req)r[cc.c]=relleno(cc,r0,fila);}
  const ks=Object.keys(r);await db.query(`insert into public.${t}(${ks.map(k=>'"'+k+'"').join(',')}) select ${ks.map(k=>'"'+k+'"').join(',')} from jsonb_populate_record(null::public.${t},$1::jsonb)`,[JSON.stringify(r)]);}};
 await db.exec('reset role');await db.exec('set session_replication_role=replica');
 for(const [k,t] of Object.entries(T))await insertar(t,base.f[k]);
 const xml=d=>d.formato==='XML';
 await insertar('documentos',base.f.cfdi.map(d=>({id:d.documento_id,obra_id:d.obra_id,trabajador_id:d.trabajador_id,categoria:xml(d)?'CFDI_NOMINA':'RECIBO_NOMINA',archivo:'ficticio/'+d.documento_id,hash:'',cfdi_uuid:xml(d)?d.uuid:null,cfdi_total:xml(d)?d.neto:null,nomina_tipo:d.tipo,periodo_inicio:d.desde,periodo_fin:d.hasta,anulado:false})));
 for(const d of base.f.cfdi.filter(x=>!xml(x)))await db.query(`insert into platinum_internal.lecturas_fiscales_documentos(documento_id,obra_id,trabajador_id,archivo,hash,uuid,neto,desde,hasta,tipo,concepto_estado,datos,lote_id) values($1,$2,$3,$4,'',$5,$6,$7,$8,$9,'UNICO','{}',$1)`,[d.documento_id,d.obra_id,d.trabajador_id,'ficticio/'+d.documento_id,d.uuid,d.neto,d.desde,d.hasta,d.tipo]);
 await db.exec('set session_replication_role=origin');
 const usuario=async(k,p)=>{const id=U(9000+k);await db.query('insert into auth.users(id) values($1) on conflict do nothing',[id]);
  await db.query(`insert into public.app_usuarios(user_id,email,rol,activo,full_access,puede_escribir,puede_eliminar,empresas_permitidas,obras_permitidas) values($1,$2,$3,true,$4,false,false,$5,$6) on conflict do nothing`,[id,'r'+k+'@prueba.test',p.vip?'ADMIN':'CONSULTA',!!p.vip,['PLATINUM'],p.obras||[]]);return id;};
 const uV=await usuario(1,VIP),uR=await usuario(2,REST);
 const llamar=async(uid,acc,datos,rol='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,role:rol})]);await db.exec('set role '+rol);
  try{return (await db.query('select public.control_tablero($1,$2::jsonb) r',[acc,JSON.stringify(datos)])).rows[0].r;}finally{await db.exec('reset role');}};
 const llamarInt=async(uid,acc,datos)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,role:'authenticated'})]);
  return (await db.query('select platinum_internal.tablero_rpc($1,$2::jsonb,$3::timestamptz) r',[acc,JSON.stringify(datos),base.f.ahora])).rows[0].r;};
 let anonRechazado=false;try{await llamar(null,'RESUMEN',MARZO,'anon');}catch(e){anonRechazado=/permission|permiso|denied|Sin acceso/i.test(e.message);}
 ok(anonRechazado,'anon no puede ejecutar control_tablero');
 const viaPublica=await llamar(uV,'RESUMEN',{...MARZO,desde:'2026-03-09',hasta:'2026-03-15'});ok(viaPublica&&viaPublica.accion==='RESUMEN','control_tablero responde a un usuario autenticado');
 const dif=[];
 for(const [et,uid,p,persp] of [['VIP_PERIODO',uV,VIP,'PERIODO'],['VIP_PAGO',uV,VIP,'PAGO'],['REST_PERIODO',uR,REST,'PERIODO'],['REST_PAGO',uR,REST,'PAGO']]){
  const r=await llamarInt(uid,'RESUMEN',{...MARZO,perspectiva:persp});const got=resumen(r);
  for(const k of CLAVES)if(Number(got[k])!==ESPERADO[et][k])dif.push(`${et}.${k}: SQL ${got[k]} ≠ ${ESPERADO[et][k]} (a mano)`);
  n++;
  for(const [acc,op] of [['DETALLE',{grano:'OBLIGACION',por_pagina:500}],['DETALLE',{grano:'OPERACION',por_pagina:500}],['EXCEPCIONES',{por_pagina:500}]]){
   const s=await llamarInt(uid,acc,{filtros:{...MARZO,perspectiva:persp},opciones:op});
   const j=clon(acc==='DETALLE'?M.detalle({...base.f,permisos:p},{...MARZO,perspectiva:persp},op):M.excepciones({...base.f,permisos:p},{...MARZO,perspectiva:persp},op));
   if(s.total!==j.total)dif.push(`${et} ${acc} ${op.grano||''}: total SQL ${s.total} ≠ modelo ${j.total}`);n++;
  }
 }
 const fuera=await llamarInt(uR,'RESUMEN',{...MARZO,obras:[X2]});
 eq([fuera.alcance.obras,fuera.alcance.restringido.obras_no_autorizadas,fuera.medidas.cobertura.valor],[[],1,null],'SQL: restringido no resuelve el otro centro');
 const detR=await llamarInt(uR,'DETALLE',{filtros:{empresa:'PLATINUM',desde:'2026-03-01',hasta:'2026-03-31'},opciones:{grano:'OBLIGACION',por_pagina:500}});
 ok(detR.filas.every(x=>x.obra_id===X1&&x.concepto!=='PREVISION_SOCIAL'),'SQL: detalle del restringido sin otro centro ni previsión social');
 const nObras=(await db.query('select count(*)::int n from public.obras')).rows[0].n;
 let iny=null;try{iny=await llamarInt(uV,'RESUMEN',{...MARZO,obras:["x') or true --"],contratistas:["'; drop table public.obras; --"]});}catch(e){iny=e;}
 ok(!(iny instanceof Error)||!/syntax/i.test(iny.message),'SQL: filtros con comillas no alteran la consulta');
 ok((await db.query('select count(*)::int n from public.obras')).rows[0].n===nObras&&nObras>=2,'SQL: tablas intactas tras filtros hostiles');
 if(dif.length)hallazgo('H11',true,'SQL (A3) difiere de los esperados a mano: '+dif.slice(0,6).join(' · '));
 return {dif};
}

(async()=>{
 const t0=Date.now();
 const base=seccionModelo();
 seccionAleatoria();
 await seccionControlador(base);
 seccionRespaldo();
 seccionRegresiones();
 const sqls=estaticoSQL();
 const pg=await seccionPG(fuentesBase(),sqls);
 const rep=hallazgos.filter(h=>h.reproduce);
 for(const h of rep)console.log('HALLAZGO '+h.id+': '+h.texto);
 for(const h of hallazgos.filter(h=>!h.reproduce))console.log('NO REPRODUCIDO '+h.id);
 console.log(`PASS revisión tablero/respaldo: ${n} comprobaciones · ${rep.length} hallazgos reproducidos (${rep.map(h=>h.id).join(', ')||'ninguno'}) · SQL ${pg.omitido?'omitido (paquete privado ausente)':pg.error?'no cargó':'comparado'} · ${((Date.now()-t0)/1000).toFixed(1)} s`);
})().catch(e=>{console.error(e);process.exit(1);});
