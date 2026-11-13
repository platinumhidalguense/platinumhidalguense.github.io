// Revisión independiente (A6) del tablero ejecutivo (76 modelo, 77 vista, 78 controlador) y del
// respaldo integral (79). Fixtures propios, resultados calculados a mano (no reutiliza los esperados
// de scripts/fixtures/tablero/casos.json). Datos ficticios; sin red.
// Todas las comprobaciones deben pasar. Los hallazgos H1–H10 de la revisión (work/…/A6_revision.md) quedaron
// como aserciones de regresión: fallan con el código anterior a las correcciones y pasan con el corregido.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const acorn=require('acorn'),{parseHTML}=require('linkedom'),XLSX=require('xlsx-js-style');
const root=path.resolve(__dirname,'..');process.chdir(root);
const M=require('../frontend/modulos/83-tablero-modelo.js');
// A6_SONDA=1: modo diagnóstico (no se detiene; informa qué regresiones fallan) para comprobar que fallan con el código anterior.
const SONDA=process.env.A6_SONDA==='1',fallas=[];
let n=0;const ok=(c,m)=>{if(SONDA){if(!c)fallas.push(m);n++;return;}assert.ok(c,m);n++;},eq=(a,b,m)=>{const j=x=>x===undefined?null:JSON.parse(JSON.stringify(x));if(SONDA){try{assert.deepStrictEqual(j(a),j(b),m);}catch(e){fallas.push(m);}n++;return;}assert.deepStrictEqual(j(a),j(b),m);n++;};
const abiertos=[];const abierto=(id,reproduce,texto)=>{if(reproduce)abiertos.push(id+': '+texto);};
const regresion=new Set();const reg=(id,cond,m)=>{ok(cond,id+' (regresión): '+m);regresion.add(id);};
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
 const trabajadores=[];for(let i=1;i<=11;i++)trabajadores.push({id:W(i),obra_id:i===9||i===11?X2:X1,no_trab:i,nombres:'PERSONA '+i,primer_apellido:'FICTICIA',estatus:'ACTIVO',eliminado:false,periodo_pago:'SEMANAL',fecha_alta:'2026-01-05',contratista:'CONTR A'});
 const C1=nid('C1'),C2=nid('C2'),V1=nid('V1'),V2=nid('V2'),C3=nid('C3'),V3=nid('V3'),H64='0'.repeat(64);
 const cierres=[{id:C1,obra_id:X1,semana:10,periodo:'SEMANAL',estado:'AUTORIZADO',snapshot:{},snapshot_sha256:H64,formula_version:'PRUEBA',creado_por:ACTOR,created_at:'2026-03-12T12:00:00Z'},
  {id:C2,obra_id:X2,semana:10,periodo:'SEMANAL',estado:'AUTORIZADO',snapshot:{},snapshot_sha256:H64,formula_version:'PRUEBA',creado_por:ACTOR,created_at:'2026-03-12T12:00:00Z'},
  {id:C3,obra_id:X1,semana:3,periodo:'SEMANAL',estado:'AUTORIZADO',snapshot:{},snapshot_sha256:H64,formula_version:'PRUEBA',creado_por:ACTOR,created_at:'2026-01-22T12:00:00Z'}];
 const ver=(id,cid,oid)=>({id,cierre_id:cid,cierre_origen:cid,obra_id:oid,version:1,estado_origen:'AUTORIZADO',semana:10,snapshot:{},snapshot_sha256:H64,fuente_sha256:H64,actor_id:ACTOR,created_at:'2026-03-12T12:00:00Z'});
 const versiones=[ver(V1,C1,X1),ver(V2,C2,X2),ver(V3,C3,X1)];
 const obligaciones=[];
 const ob=(t,i,tipo,importe,metodo='TRANSFERENCIA')=>obligaciones.push({id:nid(t),cierre_origen:i===9?C2:C1,cierre_id:i===9?C2:C1,version_id:i===9?V2:V1,obra_id:i===9?X2:X1,trabajador_id:W(i),semana:10,tipo,numero:i,
  nombre:'FICTICIA PERSONA '+i,contratista:'CONTR A',importe,metodo,vigente:true,created_at:'2026-03-12T12:00:00Z'});
 ob('O1n',1,'NOMINA','1000.00');ob('O1f',1,'FINIQUITO','500.00');ob('O1p',1,'PREVISION_SOCIAL','300.00');ob('O2',2,'NOMINA','800.00');ob('O3',3,'NOMINA','700.00','CHEQUE');
 ob('O4',4,'NOMINA','600.00','CHEQUE');ob('O5',5,'NOMINA','900.00');ob('O6',6,'NOMINA','1000.00');ob('O8',8,'NOMINA','200.00');ob('O9',9,'NOMINA','5000.00');
 ob('O11',11,'NOMINA','50.00');Object.assign(obligaciones[obligaciones.length-1],{obra_id:X1,cierre_id:C1,cierre_origen:C1,version_id:V1,contratista:''}); // ficha en otro centro; contratista sólo en bitácora
 ob('O10b',10,'NOMINA','100.00');ob('O10a',10,'NOMINA','100.00');Object.assign(obligaciones[obligaciones.length-1],{semana:3,cierre_id:C3,cierre_origen:C3,version_id:V3}); // semana 3 y semana 10
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
 pg('P10',10,'250.00','BBVA','F010','2026-01-23','GLOBAL');pagos[pagos.length-1].semana='S3'; // comprobante de semana 3 aplicado a semanas 3 y 10
 const cheques=[];
 const ch=(t,i,importe,estatus,num,extra={})=>cheques.push({id:nid(t),obra_id:X1,trabajador_id:W(i),nombre:'FICTICIA PERSONA '+i,semana:'S10',tipo_pago:'CHEQUE',estatus,eliminado:false,importe,num_cheque:num,
  created_at:'2026-03-13T16:00:00Z',updated_at:'2026-03-13T16:00:00Z',...extra});
 ch('Q3a',3,'700.00','CANCELADO','0001');ch('Q3b',3,'700.00','EXPEDIDO','0002',{reemplaza_cheque_id:I.Q3a});ch('Q4',4,'600.00','ENTREGADO','0003');
 const evidencias=[];
 const ev=(t,i,importe,ref)=>evidencias.push({id:nid(t),obra_id:X1,trabajador_id:W(i),semana:10,clave:'CLAVE-'+t,importe,pago_id:ref.startsWith('P')?I[ref]:null,cheque_id:ref.startsWith('Q')?I[ref]:null,created_at:'2026-03-13T12:00:00Z'});
 ev('E10',10,'250.00','P10');evidencias[evidencias.length-1].semana=3;ev('E1',1,'1800.00','P1');ev('E2',2,'800.00','P2a');ev('E3a',3,'700.00','Q3a');ev('E3b',3,'700.00','Q3b');ev('E4',4,'600.00','P4');ev('E4q',4,'600.00','Q4');ev('E5',5,'900.00','P5');ev('E6',6,'500.00','P6');
 const aplicaciones=[];
 const ap=(t,o,e,importe,ts,ret=null)=>{const id=nid(t);aplicaciones.push({id,obra_id:X1,obligacion_id:I[o],evidencia_id:I[e],version_id:V1,importe,created_at:ts,retirado_en:ret,retirado_por:ret?ACTOR:null,motivo_retiro:ret?'Retiro ficticio de prueba':null,actor_id:ACTOR,clave_idempotencia:id,motivo:'Aplicación ficticia de prueba'});};
 ap('A1n','O1n','E1','1000.00','2026-03-13T12:00:01Z');ap('A1f','O1f','E1','500.00','2026-03-13T12:00:02Z');ap('A1p','O1p','E1','300.00','2026-03-13T12:00:03Z');
 ap('A2','O2','E2','800.00','2026-03-13T12:00:04Z');
 ap('A3a','O3','E3a','700.00','2026-03-13T16:05:00Z','2026-03-14T10:00:00Z');ap('A3b','O3','E3b','700.00','2026-03-14T11:00:00Z');
 ap('A4','O4','E4','600.00','2026-03-13T12:00:05Z');ap('A4q','O4','E4q','600.00','2026-03-14T12:00:00Z'); // doble pago (transferencia + cheque)
 ap('A5','O5','E5','900.00','2026-03-13T12:00:06Z');ap('A10a','O10a','E10','100.00','2026-01-23T12:00:00Z');ap('A10b','O10b','E10','100.00','2026-03-13T12:00:09Z');
 ap('A6r','O6','E6','100.00','2026-03-13T12:00:07Z','2026-03-13T13:00:00Z');ap('A6','O6','E6','400.00','2026-03-13T14:00:00Z');
 const cfdi=[{documento_id:nid('D1x'),obra_id:X1,trabajador_id:W(1),uuid:'abc-0001',neto:'1000.00',desde:'2026-03-09',hasta:'2026-03-15',tipo:'NOMINA',formato:'XML',anulado:false},
  {documento_id:nid('D1p'),obra_id:X1,trabajador_id:W(1),uuid:'ABC-0001',neto:'1000.00',desde:'2026-03-09',hasta:'2026-03-15',tipo:'NOMINA',formato:'PDF',anulado:false},
  {documento_id:nid('D2x'),obra_id:X1,trabajador_id:W(2),uuid:'uu-0002',neto:'800.00',desde:'2026-03-09',hasta:'2026-03-15',tipo:'NOMINA',formato:'XML',anulado:false},
  {documento_id:nid('D2p'),obra_id:X1,trabajador_id:W(2),uuid:'UU-0002',neto:'799.50',desde:'2026-03-09',hasta:'2026-03-15',tipo:'NOMINA',formato:'PDF',anulado:false}];
 // Bitácora: adscripción de una persona con ficha en otro centro, baja/reingreso y fechas de cheques; ruido de documentos.
 const historial=[];let hid=1;const hi=(tid,obra,accion,fecha,antes,despues)=>historial.push({id:hid++,trabajador_id:tid,obra_id:obra,accion,fecha,datos_antes:antes,datos_despues:despues,usuario:'revisor@ejemplo.test'});
 hi(W(11),X2,'MODIFICACION','2026-02-01T18:00:00Z',{contratista:'CONTR VIEJO'},{contratista:'CONTR HIST',id_cuadrilla:null,estatus:'ACTIVO'});
 hi(W(11),X2,'MODIFICACION','2026-04-01T18:00:00Z',{contratista:'CONTR HIST'},{contratista:'CONTR NUEVO',estatus:'ACTIVO'});
 hi(W(11),X1,'BAJA','2026-03-11T18:00:00Z',{estatus:'ACTIVO'},{estatus:'BAJA',fecha_baja:'2026-03-11'});
 hi(W(11),X1,'REACTIVACION','2026-03-12T18:00:00Z',{estatus:'BAJA',fecha_baja:'2026-03-11'},{estatus:'ACTIVO',fecha_reingreso:'2026-03-12'});
 hi(W(3),X1,'CHEQUE-ALTA','2026-03-11T17:00:00Z',null,{id:I.Q3b,estatus:'PENDIENTE'});
 hi(W(3),X1,'CHEQUE-MODIFICACION','2026-03-12T17:00:00Z',{id:I.Q3b,estatus:'PENDIENTE'},{id:I.Q3b,estatus:'EXPEDIDO'}); // emisión 12/03 (captura 13/03)
 hi(W(3),X1,'CHEQUE-MODIFICACION','2026-03-14T17:00:00Z',{id:I.Q3a,estatus:'EXPEDIDO'},{id:'',estatus:'CANCELADO'});   // id vacío después: se toma el de antes
 hi(W(4),X1,'DOCUMENTO-MODIFICACION','2026-03-12T17:00:00Z',{id:I.Q4,estatus:'EXPEDIDO'},{id:I.Q4,estatus:'CANCELADO',contratista:'RUIDO'}); // no es de cheque ni de adscripción
 return {I,f:{ahora:'2026-06-01T18:00:00Z',obras,trabajadores,cuadrillas:[],cierres,versiones,flujo:[],obligaciones,evidencias,aplicaciones,pagos,cheques,entregas:[],historial,
  finiquitos_transferencia:[],desglose_noi:[],cfdi,efectivo_autorizado:[],errores:[]}};
}
const VIP={vip:true},REST={vip:false,obras:[X1],empresas:['PLATINUM']};
const MARZO={empresa:'PLATINUM',obras:[X1],desde:'2026-03-09',hasta:'2026-03-15'};
const conPermisos=(f,p)=>({...f,permisos:p});
const val=(r,k)=>r.medidas[k].valor;
const CLAVES=['neto_conciliado','pagado_registrado','pagado_conciliado','pendiente_conciliacion','saldo_por_cubrir','excedentes','sin_asignar','cobertura','trabajadores_con_pago'];
const resumen=r=>Object.fromEntries(CLAVES.map(k=>[k,val(r,k)]));
// Esperados calculados a mano (ver informe A6 §Cálculos).
const ESPERADO={ // incluye W10 (semana 10 cubierta con un comprobante de semana 3) y W11 (ficha en otro centro, 50 sin pago)
 VIP_PERIODO:{neto_conciliado:6150,pagado_registrado:5850,pagado_conciliado:4400,pendiente_conciliacion:1450,saldo_por_cubrir:300,excedentes:660,sin_asignar:350,cobertura:71.54,trabajadores_con_pago:8},
 VIP_PAGO:{neto_conciliado:6150,pagado_registrado:6500,pagado_conciliado:4300,pendiente_conciliacion:1250,saldo_por_cubrir:300,excedentes:600,sin_asignar:350,cobertura:71.54,trabajadores_con_pago:7},
 REST_PERIODO:{neto_conciliado:5850,pagado_registrado:5550,pagado_conciliado:4100,pendiente_conciliacion:1450,saldo_por_cubrir:300,excedentes:660,sin_asignar:350,cobertura:70.09,trabajadores_con_pago:8},
 REST_PAGO:{neto_conciliado:5850,pagado_registrado:6200,pagado_conciliado:4000,pendiente_conciliacion:1250,saldo_por_cubrir:300,excedentes:600,sin_asignar:350,cobertura:70.09,trabajadores_con_pago:7}};

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
 eq([rP.medidas.trabajadores_pago_parcial.valor,rP.medidas.pagado_registrado.desglose.operaciones],[1,9],'pago parcial (W6) y operaciones únicas del registrado PERIODO');
 eq(rP.medidas.cheques_por_estado.desglose.CANCELADO,{cantidad:1,importe:700},'cheque cancelado contado como cheque, no como pago');
 eq([rP.medidas.cheques_por_estado.valor,rP.medidas.cheques_por_estado.desglose.reposiciones],[3,1],'cheques del alcance y reposición');
 eq([rP.medidas.respaldo_fiscal.valor,rP.medidas.respaldo_fiscal.desglose.obligaciones],[1000,{COINCIDE:1,DIFERENCIA:0,SIN_CFDI:8,CONTRADICTORIO:1}],'CFDI+PDF del mismo UUID cuentan una vez; UUID con netos distintos no suma');
 eq(rP.calidad.map(x=>x.estado),['COMPLETO'],'calidad del centro');
 // Detalle por operación: P2 global + individual = una operación con dos representaciones.
 const op=M.detalle(fv,{...MARZO,perspectiva:'PERIODO'},{grano:'OPERACION',por_pagina:500});
 const o11=M.detalle(fv,{...MARZO},{grano:'OBLIGACION',por_pagina:500}).filas.find(x=>x.obligacion_id===I.O11);
 eq([o11.contratista,o11.fuente_adscripcion],['CONTR HIST','HISTORIAL'],'adscripción de bitácora a la fecha del periodo (persona con ficha en otro centro)');
 const q3b=M.detalle(fv,{...MARZO,perspectiva:'PAGO'},{grano:'OPERACION',por_pagina:500}).filas.find(x=>x.operacion_id==='CHQ:'+I.Q3b);
 eq([q3b.fecha_efectiva,q3b.fuente_fecha],['2026-03-12','EXPEDICION'],'cheque: emisión de la bitácora, no la captura');
 const pl=M.plantilla(fv,{...MARZO},{}).medidas;eq([pl.altas.valor,pl.bajas.valor,pl.reingresos.valor],[0,1,1],'plantilla: baja y reingreso de la bitácora en el centro');
 eq(op.total,12,'12 operaciones con piezas en el alcance (incluye el comprobante de otra semana)');
 const p2=op.filas.find(x=>x.operacion_id==='TRF:'+I.P2a);eq([p2.representaciones,p2.origenes,p2.importe],[2,['GLOBAL','INDIVIDUAL'],800],'global e individual unificados');
 ok(!op.filas.some(x=>x.operacion_id==='TRF:'+I.P1d||x.operacion_id==='TRF:'+I.P2b||x.operacion_id==='CHQ:'+I.Q3a),'duplicado, segunda representación y cheque cancelado no son operaciones');
 const opR=M.detalle(fr,{...MARZO,perspectiva:'PERIODO'},{grano:'OPERACION',por_pagina:500}).filas.find(x=>x.operacion_id==='TRF:'+I.P1);
 eq([opR.importe,opR.importe_operacion],[1500,null],'restringido: P1 sólo muestra la parte visible y oculta el importe total');
 // Excepciones esperadas (a mano).
 const ex=M.excepciones(fv,{...MARZO,perspectiva:'PERIODO'},{por_pagina:500}),tipos={};for(const x of ex.filas)tipos[x.tipo]=(tipos[x.tipo]||0)+1;
 eq(tipos,{SIN_PAGO:1,PAGO_PARCIAL:1,EXCEDENTE_APLICADO:1,CFDI_CONTRADICTORIO:1,POR_VINCULAR:3,EXCEDENTE_NO_APLICADO:1,SIN_ASIGNAR:2,OPERACION_ANULADA:1,POSIBLE_DUPLICADO:1,REPRESENTACIONES_UNIFICADAS:1,CHEQUE_POR_ENTREGAR:1,APLICACION_RETIRADA:2},'excepciones por tipo');
 // Previsión social: el importe completo de la operación sí llega al restringido por excepciones.
 const exR=M.excepciones(fr,{...MARZO,perspectiva:'PERIODO'},{por_pagina:500}).filas.find(x=>x.tipo==='POSIBLE_DUPLICADO');
 reg('H5',exR&&exR.importe===1500&&M.calcular(fr,{...MARZO}).medidas.pagado_registrado.desglose.excluidos.posibles_duplicados.importe===1500,'sin VIP, el posible duplicado muestra sólo la parte visible (1500), no el total con previsión (1800)');
 eq(M.excepciones(fv,{...MARZO},{por_pagina:500}).filas.find(x=>x.tipo==='POSIBLE_DUPLICADO').importe,1800,'con VIP, el posible duplicado muestra el total');
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
 reg('H6',c(val(rs,'pagado_registrado'))===c(6500-300),'operación sobreaplicada: PAGO no cuenta más que el importe de la operación');
 eq(M.excepciones(sob,{...MARZO,perspectiva:'PAGO'},{por_pagina:500}).filas.filter(x=>x.tipo==='OPERACION_SOBREAPLICADA').map(x=>x.importe),[300],'el exceso (300) queda como excepción');
 const sobP=M.calcular(sob,{...MARZO});ok(c(val(sobP,'neto_conciliado'))===c(val(sobP,'pagado_registrado'))+c(val(sobP,'saldo_por_cubrir')),'sobreaplicada: identidad PERIODO se conserva');
 // Medio de pago: COMPARATIVOS.por_medio agrupa el neto por método planeado y lo pagado por medio real.
 const pm=M.comparativos(fv,{...MARZO}).por_medio,cheque=pm.find(x=>x.clave==='CHEQUE');
 reg('H7',cheque&&cheque.cobertura===M.util.pct(BigInt(c(cheque.pagado_conciliado)),BigInt(c(cheque.neto_conciliado))),'COMPARATIVOS.por_medio PERIODO autoconsistente (método planeado): neto '+(cheque&&cheque.neto_conciliado)+', conciliado '+(cheque&&cheque.pagado_conciliado)+', cobertura '+(cheque&&cheque.cobertura));
 const cpPago=M.comparativos(fv,{...MARZO,perspectiva:'PAGO'});
 ok(cpPago.por_medio.every(x=>x.neto_conciliado===null&&x.cobertura===null)&&cpPago.por_medio.reduce((a,x)=>a+c(x.pagado_registrado),0)===c(6500),'por_medio PAGO: medio real, sin neto ni cobertura, Σ = registrado PAGO');
 ok(M.comparativos(fv,{...MARZO}).por_medio.reduce((a,x)=>a+c(x.pagado_conciliado),0)===c(4400),'por_medio PERIODO: Σ conciliado = resumen');
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
 const ultimos={};const sb={rpc:async(fn,a)=>{a=clon(a);const u=box.USER;llamadas.push(a.p_accion);ultimos[a.p_accion]=a.p_datos;await new Promise(r=>setImmediate(r));
   const datos=clon(servir(a.p_accion,a.p_datos,u)); // se calcula al recibir la solicitud (instantánea del servidor)
   if(retener&&retener(a.p_accion)){retener=null;await new Promise(r=>retenidas.push(r));}
   return {data:datos,error:null};},
  from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:null,error:null})};return q;},storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{message:'x'}})})}};
 const code=[];
 for(const p of JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules){if(/8[3-6]-(tablero|respaldo)/.test(p))continue;const s=fs.readFileSync(p,'utf8');
  for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.init&&['ST','BORD'].includes(x.id.name)))code.push(s.slice(node.start,node.end));}
 const descargas=[],errVista=[];
 box={window:null,document,console:{...console,error:(...a)=>errVista.push(a.map(String).join(' '))},Date,Math,JSON,Number,String,Array,Object,Set,Map,WeakMap,Promise,Error,RegExp,Symbol,Intl,BigInt,TextEncoder,setImmediate,setTimeout,clearTimeout,setInterval,clearInterval,
  performance:require('node:perf_hooks').performance,MutationObserver:window.MutationObserver,HTMLElement:window.HTMLElement,sb,USER:{id:'u-admin',email:'revisor@ejemplo.test'},
  OBRA:base.f.obras[0],OBRAS:base.f.obras,WORKERS:[],EMPRESA_ACTIVA:'PLATINUM',EMPRESAS:{PLATINUM:{nombre:'PLATINUM'}},CFGEMP:{},DOCSX:[],XLSX,confirm:()=>true,scrollTo:()=>{},open:()=>{}};
 box.window=box;box.globalThis=box;vm.createContext(box);
 vm.runInContext(`const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>v==null||v===''?'':Number(v).toFixed(2);const fmtD=v=>v?String(v).slice(0,10):'';const today=()=>'2026-06-01';`+code.join('\n'),box);
 for(const m of ['83-tablero-modelo','84-tablero-vista','85-tablero-ejecutivo'])vm.runInContext(fs.readFileSync('frontend/modulos/'+m+'.js','utf8'),box);
 Object.assign(box,{toast:()=>{},esVip:()=>box.USER.id==='u-admin',esAdmin:()=>box.USER.id==='u-admin',dl:async(wb,nombre)=>{descargas.push({wb,nombre});}});
 const T=box.PLATINUM_TABLERO,S=T._pruebas.S;
 T.configurar({hoy:'2026-06-01',debounce_filtros_ms:1,debounce_busqueda_ms:1,vigilancia_ms:0});
 const neto=()=>{const e=T.estado();return e&&e.resumen&&e.resumen.medidas.neto_conciliado.valor;};
 await T.abrir({obras:[X1],desde:'2026-03-09',hasta:'2026-03-15',preset:'PERSONALIZADO',comparar:'NINGUNO'});await tick();
 eq(neto(),6150,'controlador: resumen del servidor pintado');
 // 3.1 Respuesta tardía de filtros anteriores: se descarta.
 retener=a=>a==='RESUMEN';
 const p1=T.acciones.cambiarFiltros({desde:'2026-03-02',hasta:'2026-03-08'});await new Promise(r=>setTimeout(r,5));await tick();
 const p2=T.acciones.cambiarFiltros({desde:'2026-03-09',hasta:'2026-03-15'});await new Promise(r=>setTimeout(r,5));await tick();
 while(retenidas.length)retenidas.shift()();await Promise.all([p1,p2]);await tick(30);
 eq([T.estado().filtros.desde,neto()],['2026-03-09',6150],'respuesta tardía del rango anterior descartada');
 // 3.2 Aviso de cambio compartido mientras una lectura está en vuelo, seguido de «Actualizar».
 const antes=llamadas.filter(x=>x==='RESUMEN').length;
 retener=a=>a==='RESUMEN';
 const r1=T.acciones.reintentar('todo');await tick();
 fuentesServidor=clon(base.f);fuentesServidor.obligaciones.find(o=>o.id===base.I.O2).importe='900.00'; // el dato cambió en el servidor
 T.avisarCambio();
 const r2=T.acciones.reintentar('todo');await tick();
 while(retenidas.length)retenidas.shift()();await Promise.all([r1,r2]);await tick(30);
 const despues=llamadas.filter(x=>x==='RESUMEN').length-antes;
 reg('H1',neto()===6250&&despues>=2,`tras avisarCambio(), «Actualizar» pide una lectura nueva y muestra el dato vigente (neto ${neto()}, ${despues} RESUMEN)`);
 const cacheVieja=[...S.cache.values()].some(e=>e.data&&e.data.accion==='RESUMEN'&&e.data.medidas.neto_conciliado.valor===6150);
 reg('H1b',!cacheVieja,'la respuesta en vuelo previa a avisarCambio() no entra a la caché');
 // Aviso con una lectura normal (no forzada) en vuelo: los datos que llegan quedan marcados como desactualizados.
 retener=a=>a==='RESUMEN';const r3=T.acciones.cambiarFiltros({desde:'2026-03-02',hasta:'2026-03-15'});await new Promise(r=>setTimeout(r,5));await tick();
 T.avisarCambio();while(retenidas.length)retenidas.shift()();await r3;await tick(30);
 ok(T.estado().desactualizado===true,'lectura que cruza un aviso de cambio queda marcada «desactualizado»');
 await T.acciones.cambiarFiltros({desde:'2026-03-09',hasta:'2026-03-15'});await tick(30);
 fuentesServidor=clon(base.f);T._pruebas.limpiarCache();await T.acciones.reintentar('todo');await tick(30);
 const txt=document.body.textContent;
 reg('N2',txt.includes('por método de pago planeado')&&!txt.includes('Distribución por medio de pago'),'en PERIODO la gráfica se rotula «método de pago planeado» (no «medio de pago»)');
 reg('N1',!!document.querySelector('.tb-barra--fija')&&/Pagos sin obligación/.test(document.querySelector('.tb-barra--fija').textContent),'la fila de pagos sin obligación no es navegable');
 // Navegación desde la gráfica por método planeado (perspectiva periodo): el detalle debe filtrar ese método.
 await T.acciones.abrirDetalle('pagado_registrado',{dimension:'metodo_planeado',valor:'CHEQUE',origen:'grafica'});await tick(30);
 const dD=ultimos.DETALLE||{};
 reg('N4',Array.isArray(dD.medios)&&dD.medios.includes('CHEQUE'),`el clic en «Cheque» de la gráfica por método planeado filtra el detalle (medios=${JSON.stringify(dD.medios)})`);
 await T.acciones.cerrarDetalle();await tick(10);
 // 3.3 Exportación filtrada: cuadre al centavo, hojas, textos, anti-fórmula, división.
 T.configurar({limite_filas_hoja:4});
 fuentesServidor.obligaciones.find(o=>o.id===base.I.O2).contratista='=HYPERLINK("http://x","y")';fuentesServidor.obligaciones.find(o=>o.id===base.I.O4).nombre='+SUMA(1;2)';
 T._pruebas.limpiarCache();await T.acciones.reintentar('todo');await tick(30);
 const ex=await T.acciones.exportar('xlsx');
 ok(ex&&ex.ok,'exportación generada');
 eq(ex.cuadre.map(x=>x.resultado),ex.cuadre.map(()=>'CUADRA'),'CUADRE de la exportación: todo cuadra');
 const wb=ex.wb,nombres=wb.SheetNames;
 ok(nombres.every(x=>x.length<=31)&&new Set(nombres.map(x=>x.toLowerCase())).size===nombres.length,'hojas ≤31 caracteres y únicas: '+nombres.join(' | '));
 ok(nombres.filter(x=>x.startsWith('DETALLE OBLIGACIONES')).length===3,'detalle dividido por el límite configurado de filas por hoja (11 → 3 hojas de 4)');
 const filasHoja=nombre=>XLSX.utils.sheet_to_json(wb.Sheets[nombre],{header:1,raw:true});
 const partes=nombres.filter(x=>x.startsWith('DETALLE OBLIGACIONES')).map(filasHoja);
 const encab=partes[0][1],iImp=encab.findIndex(h=>/^Neto/.test(h)),iId=encab.indexOf('ID obligación');
 const datos=partes.flatMap((p,i)=>p.slice(2,i===partes.length-1?-1:undefined));
 eq([datos.length,Math.round(datos.reduce((s,r)=>s+r[iImp],0)*100)],[11,615000],'Σ neto de las hojas de detalle = 6,150.00 del resumen');
 const pie=partes[partes.length-1].slice(-1)[0];ok(Math.round(pie[iImp]*100)===615000,'el TOTAL de la última parte suma todas las partes');
 const sh=wb.Sheets[nombres.find(x=>x.startsWith('DETALLE OBLIGACIONES'))],celdaId=sh[XLSX.utils.encode_cell({r:2,c:iId})];
 eq([celdaId.t,celdaId.z],['s','@'],'IDs como texto con formato @');
 const todasCeldas=nombres.flatMap(nm=>Object.entries(wb.Sheets[nm]).filter(([k])=>k[0]!=='!').map(([,v])=>v));
 ok(todasCeldas.every(x=>!x.f),'ninguna celda es fórmula');
 const releido=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellFormula:true});
 ok(Object.values(releido.Sheets).every(s=>Object.entries(s).every(([k,v])=>k[0]==='!'||!v.f)),'releído: sin fórmulas');
 const hostiles=todasCeldas.filter(x=>typeof x.v==='string'&&/^'?(=HYPERLINK|\+SUMA)/.test(x.v));
 reg('H8',hostiles.length>=2&&hostiles.every(x=>x.v.startsWith("'")),`textos que empiezan con = + - @ se neutralizan con apóstrofo (${hostiles.length} celdas)`);
 ok(todasCeldas.every(x=>typeof x.v!=='string'||!/^[=+\-@]/.test(x.v)),'ninguna cadena del libro empieza con = + - @');
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
 await T.acciones.cambiarVista('GENERAL');await T.acciones.cambiarFiltros({perspectiva:'PAGO'});await tick(40);
 ok(errVista.length===0&&T.estado().comparativos.por_medio.every(x=>x.neto_conciliado===null),'vista: comparativos por medio real (neto nulo) en PAGO sin errores de pintura');
 const exP=await T.acciones.exportar('xlsx');ok(exP.ok&&exP.cuadre.every(x=>['CUADRA','NO APLICA'].includes(x.resultado)),'exportación en PAGO cuadra');
 T.cerrar();
}

/* =====================================================================
   4. Respaldo integral (79): funciones puras, hojas, textos, división y cuadre
   ===================================================================== */
function seccionRespaldo(){
 const box={console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,BigInt,TextEncoder,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto};box.window=box;box.globalThis=box;vm.createContext(box);
 const src=fs.readFileSync('frontend/modulos/86-respaldo-integral.js','utf8');vm.runInContext(src,box);
 const R=box.PLATINUM_RESPALDO,P=R._pruebas;
 const usados=new Set(['manifiesto']),nom=[];for(let i=0;i<40;i++)nom.push(P.nombreHoja('CENTRO DE TRABAJO CON NOMBRE MUY LARGO [A]/B:'+(i%3),usados));
 ok(nom.every(x=>x.length<=31&&!/[\\\/?*\[\]:]/.test(x))&&new Set(nom.map(x=>x.toLowerCase())).size===40,'40 hojas con el mismo prefijo: únicas, ≤31 y sin caracteres prohibidos');
 eq([P.nombreHoja('History',new Set()),P.nombreHoja('manifiesto',new Set(['manifiesto'])),P.nombreHoja("'x'",new Set())],['History_','manifiesto (2)','x'],'nombres reservados');
 for(const v of ['=1+1','+52 771','-5','@SUMA(A1)','012345678901234567','XEXX010101HNEXXXA4','12345678901']){const cel=P.celda(P.valorLogico(v,'TEXTO'),'TEXTO');ok(cel.t==='s'&&cel.v===v&&cel.s.numFmt==='@'&&!cel.f,'texto literal sin fórmula: '+v);}
 eq([P.celda(null,'TEXTO').v,P.celda('','TEXTO'),P.celda(0,'IMPORTE').v,P.celda(0,'IMPORTE').t,P.celda('∅x','TEXTO').v],[R.NULO,null,0,'n','∅∅x'],'nulo ≠ vacío ≠ cero; ∅ real escapado');
 eq([P.valorLogico(12345678901,'ID'),P.tipoDe('clabe','text'),P.tipoDe('nss',undefined,'12345678901'),P.tipoDe('importe','numeric(14,2)'),P.tipoDe('cuenta',undefined,123)],['12345678901','TEXTO','TEXTO','IMPORTE','TEXTO'],'tipos: IDs/CLABE/NSS texto, importes numéricos');
 reg('H9',P.tipoDe('clabe',undefined,12345678901234567)==='TEXTO'&&P.tipoDe('nss','integer')==='TEXTO'&&P.tipoDe('folio_lote',undefined,7)==='TEXTO'&&P.tipoDe('importe',undefined,7)==='IMPORTE','CUENTA/CLABE/NSS/folios son texto aun sin metadatos; importes siguen numéricos');
 const largo='a'.repeat(29999)+'😀'+'b'.repeat(40000),tro=P.partirTexto(largo);
 ok(tro.join('')===largo&&tro.every(x=>x.length<=30000)&&tro.every(x=>!/[\uD800-\uDBFF]$/.test(x)),'texto largo en partes ≤30,000 sin partir pares sustitutos');
 const L={nombre:'HOJA LOGICA CON NOMBRE DE MAS DE VEINTISEIS',fuente:'x',dominio:'D',cols:[{campo:'a'}],filas:Array.from({length:23},(_,i)=>['fila '+i])};
 const L2={...L,nombre:'HOJA LOGICA CON NOMBRE DE MAS DE VEINTISEIS',filas:Array.from({length:5},(_,i)=>['otra '+i])};
 const partes=P.planificar([L,L2],{limiteFilas:6,presupuesto:120});
 const hojas=partes.flatMap(p=>p.hojas),nombresH=hojas.map(h=>h.nombre);
 ok(nombresH.every(x=>x.length<=31)&&new Set(nombresH.map(x=>x.toLowerCase())).size===nombresH.length,'división: nombres únicos ≤31 entre partes y hojas lógicas homónimas');
 eq(hojas.filter(h=>h.L===L).flatMap(h=>h.filas),L.filas,'división: filas completas, en orden y sin repetir');
 ok(hojas.every(h=>h.filas.length<=5)&&partes.length>1,'división: respeta filas por hoja (límite − encabezado) y presupuesto por archivo');
 ok(/precision/.test(src)&&/LIM_CELDA=32767/.test(src)&&/LIM_FILAS_EXCEL=1048576/.test(src),'límites de Excel declarados (celda 32,767; filas 1,048,576)');
}

/* Respaldo de punta a punta con un servidor simulado: marcas con tiempo agotado (H2) y cuadre con efectivo (H3). */
async function seccionRespaldoExportar(){
 const box={console,Date,Math,JSON,Number,String,Array,Object,Set,Map,WeakMap,Promise,Error,RegExp,Symbol,Intl,BigInt,TextEncoder,Uint8Array,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto};box.window=box;box.globalThis=box;vm.createContext(box);
 for(const m of ['83-tablero-modelo','86-respaldo-integral'])vm.runInContext(fs.readFileSync('frontend/modulos/'+m+'.js','utf8'),box);
 const {I,f}=fuentesBase(),oF=f.obligaciones.find(o=>o.id===I.O1f);
 // Baja revertida: el respaldo exporta el historial crudo y la tabla de reversiones; el tablero usa el historial efectivo.
 const hRaw=[...f.historial,{id:100,trabajador_id:W(11),obra_id:X1,accion:'MODIFICACION',fecha:'2026-03-13T18:00:00Z',datos_antes:{contratista:'CONTR HIST'},datos_despues:{contratista:'CONTR BAJA',estatus:'BAJA'}}];
 const revs=[{id:U(850),historial_id:3,obra_id:X1,trabajador_id:W(11),estado:'APLICADA',created_at:'2026-03-20T00:00:00Z',restaurar:{estatus:'ACTIVO',fecha_baja:null,contratista:'CONTR REST'}}];
 const efectivo=(hs,rv)=>{const fuera=new Set(rv.map(r=>r.historial_id));return hs.filter(h=>!fuera.has(h.id)).map(h=>{const r=rv.find(r=>{const b=hs.find(x=>x.id===r.historial_id);return h.accion==='MODIFICACION'&&r.trabajador_id===h.trabajador_id&&b&&h.fecha>b.fecha&&h.fecha<r.created_at;});
  return r?{...h,datos_despues:{...h.datos_despues,...r.restaurar}}:h;});};
 const exc={id:U(800),cierre_id:oF.cierre_id,trabajador_id:oF.trabajador_id,finiquito_efectivo:'500.00',neto_original:'1500.00',nomina_transferencia:'1000.00',registrado_en:'2026-03-13T18:00:00Z'};
 const tablas={obras:f.obras,trabajadores:f.trabajadores,control_cierres_nomina:f.cierres,control_cierre_versiones:f.versiones,control_obligaciones_pago:f.obligaciones,
  control_evidencias_pago:f.evidencias,control_pago_aplicaciones:f.aplicaciones,pagos:f.pagos,cheques:f.cheques,historial:hRaw,control_reversiones_baja:revs},internas={excepciones_noi_individuales:[exc]};
 const filasDe=k=>tablas[k]||internas[k]||[],TAB=Object.fromEntries(box.PLATINUM_RESPALDO.fuentes().map(x=>[x.tabla,x.clave]));
 let lento=true;const marca=k=>({tipo:'COMPLETA',filas:filasDe(k).length,max_actualizado:null,max_creado:null,huella:'h'+filasDe(k).length,por_obra:{}});
 const sb={rpc:async(fn,a)=>{
   if(fn==='control_puede_ver_salud')return {data:false,error:null};const d=a.p_datos;
   if(a.p_accion==='MARCAS'){if(lento&&(d.fuentes.length>8||d.fuentes.includes('historial')))return {data:null,error:{code:'57014',message:'canceling statement due to statement timeout'}};
    return {data:{version:'RESPALDO_MARCAS_V1',generado_en:'2026-06-01T18:00:00Z',empresa:'PLATINUM',obras:[X1,X2],obras_rechazadas:[],permisos:{registrado:true,vip:true,salud:false,admin:true},
     marcas:Object.fromEntries(d.fuentes.map(k=>[k,marca(k)])),columnas:d.columnas?{}:null},error:null};}
   if(a.p_accion==='LEER')return {data:{fuente:d.fuente,filas:d.despues?[]:filasDe(d.fuente),siguiente:null},error:null};
   return {data:null,error:{message:'no simulado'}};},
  from:t=>{const q=new Proxy({},{get:(_,k)=>k==='range'?((a,b)=>Promise.resolve({data:filasDe(TAB[t]||t).slice(a,b+1),error:null})):k==='then'?undefined:()=>q});return q;}};
 const ahora=new Date('2026-06-01T18:00:00Z');let r=null,err=null;
 try{r=await box.PLATINUM_RESPALDO.exportar({sb,XLSX,JSZip:null,obrasCatalogo:f.obras,empresa:'PLATINUM',espera:0,marca:false,registrar:false,descargar:async()=>{},reloj:()=>ahora});}catch(e){err=e;}
 reg('H2',r&&r.estado==='INCOMPLETO'&&r.motivos.includes('SIN_MARCA_TABLA')&&r.fuentes.historial.estado==='LEIDA_SIN_MARCA'&&r.fuentes.control_obligaciones_pago.estado==='LEIDA',
  'MARCAS con tiempo agotado en una tabla: el respaldo se genera INCOMPLETO en lugar de abortar'+(err?' ('+err.message+')':''));
 // H3 con marcas normales (independiente de H2).
 lento=false;const r2=await box.PLATINUM_RESPALDO.exportar({sb,XLSX,JSZip:null,obrasCatalogo:f.obras,empresa:'PLATINUM',espera:0,marca:false,registrar:false,descargar:async()=>{},reloj:()=>ahora});
 ok(r2.estado==='COMPLETO'&&r2.fuentes.pagos.tipo_marca==='COMPLETA','respaldo con marcas normales: COMPLETO y tipo de marca por fuente registrado ('+r2.motivos.join(',')+')');
 const fila=(k,p)=>(r2.cuadre.filas.find(x=>x[1]===k&&x[2]==='PLATINUM_TABLERO_MODELO · '+p)||[])[11];
 const base={...f,ahora:ahora.toISOString(),cfdi:[],permisos:{vip:true,obras:[X1,X2],empresas:['PLATINUM']}},rango={empresa:'PLATINUM',obras:[X1,X2],desde:'2000-01-01',hasta:'2099-12-31'};
 const conE=M.calcular({...base,efectivo_autorizado:[{obligacion_id:oF.id,importe:'500.00',fecha:'2026-03-13'}]},rango),sinE=M.calcular({...base,efectivo_autorizado:[]},rango);
 reg('H3',conE.huella!==sinE.huella&&['pendiente_conciliacion','excedentes','saldo_por_cubrir','pagado_registrado'].every(k=>fila(k,'PERIODO')===String(c(val(conE,k)))),
  'CONTROL del respaldo cuadra con el tablero incluyendo el finiquito en efectivo autorizado (pendiente '+fila('pendiente_conciliacion','PERIODO')+' centavos)');
 // Con baja revertida: las medidas monetarias y la huella del CONTROL (historial crudo) = tablero (historial efectivo).
 const efe=M.calcular({...base,historial:efectivo(hRaw,revs),efectivo_autorizado:[{obligacion_id:oF.id,importe:'500.00',fecha:'2026-03-13'}]},rango);
 const huellaCtl=(r2.cuadre.filas.find(x=>x[1]==='huella_tablero'&&/PERIODO/.test(x[2]))||[])[12]||'';
 ok(['neto_conciliado','pagado_registrado','pagado_conciliado','saldo_por_cubrir','excedentes','sin_asignar','pendiente_conciliacion'].every(k=>fila(k,'PERIODO')===String(c(val(efe,k))))&&huellaCtl.endsWith(efe.huella),
  'baja revertida: el CONTROL del respaldo (historial crudo) cuadra en dinero y huella con el tablero (historial efectivo)');
 const dE=M.calcular({...base,historial:efectivo(hRaw,revs)},{...rango,obras:[X1]}),dR=M.calcular({...base,historial:hRaw},{...rango,obras:[X1]});
 ok(dE.medidas.bajas.valor!==dR.medidas.bajas.valor,'con historial crudo el modelo contaría la baja revertida (bajas/rotación/adscripción difieren; no forman parte del CONTROL)');
}

/* Marca LIGERA del respaldo (> 5,000 filas): ¿detecta ediciones concurrentes en tablas que sí se editan? */
async function seccionMarcasLigeras(sqls){
 const priv='work/respaldo_20261111';
 if(!sqls.respaldo||!fs.existsSync(priv+'/generar_prod_base.cjs')){console.log('ALCANCE PÚBLICO: marcas del respaldo omitidas.');return;}
 require(path.join(root,priv,'generar_prod_base.cjs'));
 const {makeDatabase,ids,actor}=require('./soporte_flujo_pg.cjs');
 const db=await makeDatabase();await db.exec(fs.readFileSync(priv+'/prod_base.sql','utf8'));await db.exec(sqls.respaldo);
 const emp=(await db.query('select coalesce(empresa_codigo,$2) e from public.obras where id=$1',[ids.obra,'PLATINUM'])).rows[0].e;
 await db.exec('set session_replication_role=replica');
 const plantilla=async(t,base)=>{const cs=(await db.query(`select column_name c,data_type t from information_schema.columns where table_schema='public' and table_name=$1 and is_nullable='NO' and column_default is null`,[t])).rows;
  const r={...base};for(const c of cs)if(!(c.c in r))r[c.c]=c.t==='uuid'?ids.w:/int|numeric/.test(c.t)?1:c.t==='jsonb'?{}:c.t==='boolean'?false:/timestamp/.test(c.t)?'2026-03-13T12:00:00Z':c.t==='date'?'2026-03-13':'Dato ficticio de prueba';return r;};
 const masivo=async(t,base,n)=>{const r=await plantilla(t,base),ks=Object.keys(r).filter(k=>k!=='id');
  await db.query(`insert into public.${t}(id,${ks.map(k=>'"'+k+'"').join(',')}) select gen_random_uuid(),${ks.map(k=>'x."'+k+'"').join(',')} from generate_series(1,${n}) g cross join jsonb_populate_record(null::public.${t},$1::jsonb) x`,[JSON.stringify(r)]);};
 await masivo('documentos',{obra_id:ids.obra,trabajador_id:ids.w,categoria:'RECIBO_NOMINA',archivo:'ruta/x',notas:'nota',anulado:false},5001);
 await masivo('pagos',{obra_id:ids.obra,trabajador_id:ids.w,importe:100,estado:'EXITOSO',medio:'TRANSFERENCIA',fecha_pago:'2026-03-13',folio_lote:'F'},5001);
 await masivo('cheques',{obra_id:ids.obra,importe:100,estatus:'EXPEDIDO',eliminado:false},20);
 await db.query(`insert into public.historial(id,trabajador_id,obra_id,accion,fecha,datos_despues) select 2000000+g,$2,$1,'DOCUMENTO-ALTA',now(),'{}'::jsonb from generate_series(1,5001) g`,[ids.obra,ids.w]);
 await db.exec('set session_replication_role=origin');
 const marcas=async()=>{await actor(db,'admin');try{return (await db.query('select public.control_respaldo($1,$2::jsonb) r',['MARCAS',JSON.stringify({empresa:emp,obras:[ids.obra],fuentes:['documentos','pagos','cheques','historial']})])).rows[0].r.marcas;}finally{await db.exec('reset role');}};
 const firma=m=>[m.filas,m.max_actualizado,m.max_creado,m.huella].join('|');
 const a=await marcas();
 eq([a.documentos.tipo,a.pagos.tipo,a.cheques.tipo,a.historial.tipo],['COMPLETA','COMPLETA','COMPLETA','LIGERA'],'marca LIGERA sólo en tablas de sólo-inserción (historial > 5,000 filas); documentos y pagos > 5,000 con marca COMPLETA');
 await db.exec('set session_replication_role=replica'); // edición concurrente simulada (sin disparadores de validación)
 await db.exec(`update public.documentos set notas='EDITADA' where id=(select id from public.documentos order by id limit 1);
  update public.pagos set estado='RECHAZADO' where id=(select id from public.pagos order by id limit 1);
  update public.cheques set importe=999 where id=(select id from public.cheques order by id limit 1)`);
 await db.exec('set session_replication_role=origin');
 const b=await marcas();
 ok(firma(a.cheques)!==firma(b.cheques),'marca COMPLETA detecta la edición de un cheque');
 reg('N3',firma(a.documentos)!==firma(b.documentos)&&firma(a.pagos)!==firma(b.pagos),'con > 5,000 filas, la edición concurrente de un documento y de un pago cambia la marca (respaldo no puede salir COMPLETO sin detectarla)');
 const c2=await marcas();ok(firma(c2.historial)===firma(b.historial)&&firma(c2.documentos)===firma(b.documentos),'marcas estables sin cambios');
 await db.exec('set session_replication_role=replica');await db.query(`insert into public.historial(id,trabajador_id,obra_id,accion,fecha,datos_despues) values(3000000,$2,$1,'DOCUMENTO-ALTA',now(),'{}')`,[ids.obra,ids.w]);await db.exec('set session_replication_role=origin');
 ok(firma((await marcas()).historial)!==firma(c2.historial),'marca LIGERA de historial detecta altas');
}

/* =====================================================================
   5. Regresiones, globales y seguridad de publicación
   ===================================================================== */
function seccionRegresiones(){
 const mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules,vistos=new Map(),dup=[],funcs=new Map();
 for(const p of mods){const s=fs.readFileSync(p,'utf8'),ast=acorn.parse(s,{ecmaVersion:'latest'});
  for(const nd of ast.body){const ns=nd.type==='FunctionDeclaration'?[nd.id.name]:nd.type==='VariableDeclaration'?nd.declarations.flatMap(d=>d.id.type==='Identifier'?[d.id.name]:[]):nd.type==='ClassDeclaration'?[nd.id.name]:[];
   for(const x of ns){if(vistos.has(x))dup.push(x);else vistos.set(x,p);}if(nd.type==='FunctionDeclaration')funcs.set(nd.id.name,s.slice(nd.start,nd.end));}
  if(/8[3-6]-(tablero|respaldo)/.test(p))eq(ast.body.length,1,'módulo nuevo con un único enunciado de nivel superior: '+path.basename(p));}
 eq(dup,[],'sin nombres globales duplicados en los '+mods.length+' módulos');
 const nuevos=['83-tablero-modelo','84-tablero-vista','85-tablero-ejecutivo','86-respaldo-integral'].map(m=>'frontend/modulos/'+m+'.js');
 ok(nuevos.every(p=>mods.includes(p))&&mods.indexOf(nuevos[0])<mods.indexOf(nuevos[1])&&mods.indexOf(nuevos[1])<mods.indexOf(nuevos[2]),'83→84→85→86 en modulos.json');
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
 const base=g('git rev-parse --verify -q 921f202');
 if(base){for(const m of ['52','53']){const fs2=fs.readdirSync('frontend/modulos').filter(x=>x.startsWith(m+'-'));for(const x of fs2)eq(g('git show 921f202:frontend/modulos/'+x),fs.readFileSync('frontend/modulos/'+x,'utf8'),'motor '+x+' byte-idéntico a la base');}
  const cambiados=(g('git diff --name-only 921f202 -- frontend/modulos')||'').trim().split('\n').filter(Boolean).sort();
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
   reg('H10',internas.every(x=>x==='platinum_internal.calendario_motor_quincenal')&&!/correo_creados, admin_papelera/.test(s),'el bundle no enumera tablas internas ni las claves de credenciales ('+internas.join(', ')+')');}
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
 await db.exec(sqls.tablero);await db.exec(sqls.tablero);ok(true,'migración del tablero carga y es reaplicable');
 const def=(await db.query("select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') auth from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname='control_tablero') or (n.nspname='platinum_internal' and p.proname='tablero_rpc')")).rows;
 const ct=def.find(x=>x.proname==='control_tablero'),tr=def.find(x=>x.proname==='tablero_rpc');
 eq([ct.prosecdef,ct.proconfig,ct.anon,ct.auth],[true,['search_path=""'],false,true],'control_tablero: SECURITY DEFINER, search_path vacío, sin anon');
 eq([tr.anon,tr.auth],[false,false],'tablero_rpc interna sin EXECUTE para anon/authenticated');
 const T={obras:'obras',trabajadores:'trabajadores',historial:'historial',cierres:'control_cierres_nomina',versiones:'control_cierre_versiones',obligaciones:'control_obligaciones_pago',evidencias:'control_evidencias_pago',aplicaciones:'control_pago_aplicaciones',pagos:'pagos',cheques:'cheques'};
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
 // Baja revertida (producción 2026-11-12): la BAJA de W11 (historial 3) se revierte el 20/03; una MODIFICACION del 13/03
 // (posterior a la baja y anterior a la reversión) dejó otro contratista y la vista efectiva la reescribe con `restaurar`.
 const revisable=!!(await db.query("select to_regclass('public.control_reversiones_baja') r,to_regclass('public.historial_laboral_efectivo') v")).rows.every(x=>x.r&&x.v);
 if(revisable){
  await db.query(`insert into public.historial(id,trabajador_id,obra_id,accion,fecha,datos_antes,datos_despues) values(100,$1,$2,'MODIFICACION','2026-03-13T18:00:00Z','{"contratista":"CONTR HIST","estatus":"BAJA"}','{"contratista":"CONTR BAJA","estatus":"BAJA"}')`,[W(11),X1]);
  await db.query(`insert into public.control_reversiones_baja(historial_id,obra_id,trabajador_id,estado,created_at,restaurar) values(3,$1,$2,'APLICADA','2026-03-20T00:00:00Z','{"estatus":"ACTIVO","fecha_baja":null,"contratista":"CONTR REST"}')`,[X1,W(11)]);
 }
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
 eq(dif,[],'SQL (A3) = valores calculados a mano y totales del modelo');
 if(revisable){
  const o11=(await llamarInt(uV,'DETALLE',{filtros:MARZO,opciones:{grano:'OBLIGACION',por_pagina:500}})).filas.find(x=>x.trabajador_id===W(11));
  const plE=(await llamarInt(uV,'PLANTILLA',{filtros:MARZO,opciones:{}})).medidas;
  eq([o11&&o11.contratista,plE.bajas.valor,plE.reingresos.valor],['CONTR REST',0,1],'baja revertida: adscripción con la MODIFICACION reescrita por `restaurar` y la baja revertida fuera de bajas/rotación');
 }
 // SQL = modelo en todas las acciones y rangos (incluye la poda por periodo de H4 con un comprobante de otra semana).
 const leidas={};for(const [k,t] of Object.entries(T))leidas[k]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(x)),'[]') j from public.${t==='historial'&&revisable?'historial_laboral_efectivo':t} x`)).rows[0].j; // el modelo recibe el historial efectivo
 const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v===undefined?null:v);
 const primera=(a,b,p='$')=>{if(canon(a)===canon(b))return null;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const d=primera(a[k],b[k],p+'.'+k);if(d)return d;}}return p+': SQL '+JSON.stringify(a)?.slice(0,160)+' ≠ JS '+JSON.stringify(b)?.slice(0,160);};
 const FN={RESUMEN:'calcular',TENDENCIA:'tendencia',COMPARATIVOS:'comparativos',EXCEPCIONES:'excepciones',DETALLE:'detalle',PLANTILLA:'plantilla',CATALOGOS:'catalogos'};
 const rangos=[[ '2026-03-09','2026-03-15'],['2026-03-16','2026-03-22'],['2026-01-19','2026-03-31'],['2026-03-01','2026-03-31']];
 const difs=[];
 for(const [d,h] of rangos)for(const persp of ['PERIODO','PAGO'])for(const [uid,p] of [[uV,VIP],[uR,REST]])for(const [acc,op] of [['RESUMEN',{}],['TENDENCIA',{}],['COMPARATIVOS',{}],['EXCEPCIONES',{por_pagina:500}],['DETALLE',{grano:'OBLIGACION',por_pagina:500}],['DETALLE',{grano:'OPERACION',por_pagina:500}],['PLANTILLA',{por_pagina:500}],['CATALOGOS',{}]]){
  const fl={empresa:'PLATINUM',desde:d,hasta:h,perspectiva:persp,comparar:acc==='RESUMEN'?'ANTERIOR':null};
  const sq=await llamarInt(uid,acc,{filtros:fl,opciones:op});
  const js=clon(M[FN[acc]]({...base.f,...leidas,ahora:sq.actualizado_en||base.f.ahora,permisos:p},fl,op));
  const df=primera(clon(sq),js);if(df)difs.push(`${acc} ${op.grano||''} ${persp} ${d}…${h} ${p.vip?'VIP':'REST'}: ${df}`);n++;
 }
 eq(difs.slice(0,3),[],'SQL acotado = modelo JS con la vista efectiva COMPLETA, al centavo, en 128 consultas (4 rangos × 2 perspectivas × 2 perfiles × 8 acciones, con bitácora y baja revertida)');
 if(revisable){ // Reversión cuyo trabajador_id no coincide con la fila revertida (nulo): la vista la excluye por historial_id.
  await db.exec('set session_replication_role=replica');
  await db.query(`insert into public.historial(id,trabajador_id,obra_id,accion,fecha,datos_antes,datos_despues) values(5000,$1,$2,'BAJA','2026-03-10T18:00:00Z','{"estatus":"ACTIVO"}','{"estatus":"BAJA","fecha_baja":"2026-03-10"}')`,[W(5),X1]);
  await db.query(`insert into public.control_reversiones_baja(historial_id,obra_id,trabajador_id,estado,created_at,restaurar) values(5000,$1,null,'APLICADA','2026-03-21T00:00:00Z','{"estatus":"ACTIVO"}')`,[X1]);
  await db.exec('set session_replication_role=origin');
  const hv=(await db.query(`select coalesce(jsonb_agg(to_jsonb(x)),'[]') j from public.historial_laboral_efectivo x`)).rows[0].j;
  const sqP=await llamarInt(uV,'PLANTILLA',{filtros:MARZO,opciones:{por_pagina:500}}),jsP=clon(M.plantilla({...base.f,...leidas,historial:hv,ahora:base.f.ahora,permisos:VIP},MARZO,{por_pagina:500}));
  abierto('N5',sqP.medidas.bajas.valor!==jsP.medidas.bajas.valor,`reversión con trabajador_id nulo o distinto del de la fila revertida: la lectura acotada (personas de control_reversiones_baja.trabajador_id) cuenta la baja revertida (SQL ${sqP.medidas.bajas.valor} vs vista ${jsP.medidas.bajas.valor}); confirmar NOT NULL/coincidencia en producción o derivar las personas uniendo historial por historial_id`);
 }
 // Dependencias: ningún objeto o columna que sólo exista en los fixtures (inventario de producción de A4 + vista verificada por A7).
 const prodF='work/respaldo_20261111/prod_columnas.json';
 if(fs.existsSync(prodF)){
  const prod=JSON.parse(fs.readFileSync(prodF,'utf8'));
  // Cambios de producción del 2026-11-12 (work/equipo_20261111/cambios_produccion_20261112.md, sólo metadatos):
  // tablas, vistas y columnas nuevas que el inventario de A4 (2026-11-11) aún no tenía.
  const NUEVAS={control_reversiones_baja:'id historial_id obra_id trabajador_id estado transaccion actor_id actor_email created_at antes restaurar efectos resultado',
   control_banco_resoluciones:'id archivo_id fila operacion_id obra_id trabajador_id pago_id obligacion_id cheque_id aplicacion_id estado revision propuesta resultado actor_id created_at updated_at',
   control_importaciones_bancarias:'id obra_id empresa_codigo contexto nombre sha256 ruta tamano mime padre_id paginas estado propuesta revision error creado_por created_at updated_at',
   control_aguinaldo_conciliaciones:'id operacion_id empresa_codigo obra_id trabajador_id ejercicio fecha_baja version anterior_id estado estado_operacion importe_bruto exento fecha_pago fuente_clave respaldo_clave motivo referencia fuente respaldo firma_solicitud actor_id actor_email created_at',
   control_puestos_catalogo:'clave descripcion activo referencia revision updated_at actor_id',control_puestos_equivalencias:'empresa variante especialidad clave referencia revision updated_at actor_id',
   historial_laboral_efectivo:String(prod.public.historial)};
  for(const [t,c] of Object.entries(NUEVAS))prod.public[t]=c;
  for(const [t,c] of [['pagos','banco_contexto banco_operacion_clave'],['control_obligaciones_pago','fuente_documentada'],['control_altas_bajas_cortas','baja_operacion_id reversion_baja_id'],['documentos','conciliacion_archivo_id']])
   if(prod.public[t])prod.public[t]+=' '+c;
  const colsProd=(sch,t)=>prod[sch]&&prod[sch][t]?new Set(String(prod[sch][t]).split(/\s+/).map(x=>x.split(':')[0]).filter(Boolean)):null;
  const sql=sqls.tablero.replace(/--[^\n]*/g,''),propias=new Set([...sql.matchAll(/create or replace function (?:public|platinum_internal)\.([a-z_0-9]+)/g)].map(m=>m[1]));
  const FUNC_PROD=new Set(['app_registrado','app_ve_obra','app_ve_empresa','app_es_vip','excepcion_noi']);
  const VISTA_FISCAL=['id','obra_id','trabajador_id','cfdi_uuid','categoria','cfdi_total','nomina_neto','periodo_inicio','periodo_fin','nomina_tipo','anulado']; // A7: columnas verificadas en producción
  const malos=[],rels=new Set();
  for(const m of sql.matchAll(/\b(public|platinum_internal)\.([a-z_0-9]+)\b(\s*\()?/g)){
   const [,sch,nom,par]=m;if(propias.has(nom))continue;
   const indice=/\bon\s*$/i.test(sql.slice(Math.max(0,m.index-6),m.index));
   if(par&&!indice){if(!FUNC_PROD.has(nom))malos.push('función '+sch+'.'+nom);continue;}
   if(sch==='platinum_internal'&&nom==='documentos_fiscales'){rels.add(sch+'.'+nom);continue;}
   if(!colsProd(sch,nom))malos.push('relación '+sch+'.'+nom);else rels.add(sch+'.'+nom);
  }
  ok(!/public\.documentos_fiscales/.test(sql)&&rels.has('platinum_internal.documentos_fiscales'),'vista fiscal en platinum_internal (como en producción)');
  const fis=sql.slice(sql.indexOf('platinum_internal.documentos_fiscales d')-1200,sql.indexOf('platinum_internal.documentos_fiscales d')+400);
  const usadasFis=[...new Set([...fis.matchAll(/\bd\.([a-z_]+)/g)].map(m=>m[1]))];
  eq(usadasFis.filter(c=>!VISTA_FISCAL.includes(c)),[],'columnas de la vista fiscal existentes en producción ('+usadasFis.join(',')+')');
  const extra=[];
  for(const r of rels){const [sch,t]=r.split('.');if(t==='documentos_fiscales')continue;const pc=colsProd(sch,t);
   const lc=(await db.query('select column_name c from information_schema.columns where table_schema=$1 and table_name=$2',[sch,t])).rows.map(x=>x.c);
   for(const c of lc)if(!pc.has(c)&&new RegExp('\\.'+c+'\\b').test(sql)&&![...rels].some(r2=>r2!==r&&colsProd(...r2.split('.'))?.has(c)))extra.push(r+'.'+c);}
  eq([malos,extra],[[],[]],'el SQL del tablero sólo usa relaciones, columnas y funciones de producción ('+rels.size+' relaciones)');
 }
 // Índices aditivos de historial: forma, tamaño y tiempo de creación con volumen real simulado (40,400 filas, JSON ~1.6 KB).
 const idx=[...sqls.tablero.matchAll(/create\s+(unique\s+)?index[^;]*?\bon\s+public\.[^;]*;/gi)].map(m=>m[0]);
 ok(idx.length===3&&idx.every(x=>/^create index if not exists historial_tablero_[a-z_]+ on public\.historial/i.test(x))&&!/drop index[^;]*public\.|unique index[^;]*public\./i.test(sqls.tablero),'sólo 3 índices aditivos en historial (if not exists, no únicos, sin drop)');
 await db.exec('reset role');await db.exec('set session_replication_role=replica');
 await db.exec(`insert into public.historial(id,trabajador_id,obra_id,accion,fecha,datos_antes,datos_despues)
  select 1000000+g,md5((g%980)::text)::uuid,md5((g%8)::text)::uuid,case when g%100<41 then 'DOCUMENTO-MODIFICACION' when g%100<75 then 'DOCUMENTO-ALTA' when g%100<92 then 'MODIFICACION' when g%100<97 then 'CHEQUE-MODIFICACION' else 'CHEQUE-ALTA' end,
   timestamptz '2026-01-01'+g*interval '5 minutes',jsonb_build_object('id',md5((g%980)::text)::uuid::text,'p',repeat('x',700)),jsonb_build_object('id',md5((g%980)::text)::uuid::text,'p',repeat('y',800))
  from generate_series(1,40400) g`);
 await db.exec('set session_replication_role=origin');
 const info=[];
 for(const x of idx){const nom=x.match(/historial_tablero_[a-z_]+/)[0];await db.exec('drop index public.'+nom);const t1=Date.now();await db.exec(x);const ms=Date.now()-t1;
  const kb=Math.round((await db.query('select pg_relation_size($1::regclass) b',['public.'+nom])).rows[0].b/1024);info.push(`${nom} ${kb} KiB ${ms} ms`);ok(kb<20480&&ms<8000,'índice '+nom+' pequeño y rápido de crear');}
 console.log('INFO índices de historial (PGlite, 40,400 filas): '+info.join(' · '));
 return {dif};
}

(async()=>{
 const t0=Date.now();
 const base=seccionModelo();
 seccionAleatoria();
 await seccionControlador(base);
 seccionRespaldo();
 await seccionRespaldoExportar();
 seccionRegresiones();
 const sqls=estaticoSQL();
 const pg=await seccionPG(fuentesBase(),sqls);
 await seccionMarcasLigeras(sqls);
 for(const x of abiertos)console.log('ABIERTO '+x);
 if(SONDA){console.log('SONDA: '+fallas.length+' comprobaciones fallan');for(const m of fallas)console.log(' - '+m.slice(0,160));return;}
 console.log(`PASS revisión tablero/respaldo: ${n} comprobaciones · regresiones cerradas ${[...regresion].sort().join(', ')} · abiertos ${abiertos.map(x=>x.split(':')[0]).join(', ')||'ninguno'} · SQL ${pg.omitido?'omitido (paquete privado ausente)':'= modelo y = cálculo a mano'} · ${((Date.now()-t0)/1000).toFixed(1)} s`);
})().catch(e=>{console.error(e);process.exit(1);});
