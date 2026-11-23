// Aguinaldo con continuidad laboral reconocida entre razones sociales (JIRE → PLATINUM).
// Usa el contexto REAL que devolvió el servidor para fichas ficticias en una transacción revertida
// (scripts/fixtures/aguinaldo-continuidad.json) y el código real de la plataforma (núcleo, corrida,
// evidencias, continuidad y motores). Sin red ni base de datos.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{parseHTML}=require('linkedom');
const {document}=parseHTML('<html><body><div id="modals"></div></body></html>');
let n=0;const ok=(c,m)=>{assert(c,m);n++;},eq=(a,b,m)=>{const j=x=>x===undefined?x:JSON.parse(JSON.stringify(x));assert.deepStrictEqual(j(a),j(b),m);n++;};
const code=[],mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules;
for(const p of mods){const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.init&&['ISR_M','F_SEM','PERIODOS','ISR_TABLA','MOTOR_NOMINA_VERSION','SEMANA1'].includes(x.id.name)))code.push(s.slice(node.start,node.end));}
const obras=[{id:'O-PLAT',nombre:'OBRA FICTICIA PLATINUM',fecha_inicio:'2026-03-30',empresa_codigo:'PLATINUM',activa:true},{id:'O-JIRE',nombre:'OBRA FICTICIA JIRE',fecha_inicio:'2026-07-27',empresa_codigo:'JIRE',activa:true},
 {id:'O-Q',nombre:'QUINCENAL FICTICIA',fecha_inicio:'2026-03-30',empresa_codigo:'PLATINUM',activa:true}];
const box={window:null,document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,
 OBRA:obras[0],OBRAS:obras,WORKERS:[],EMPRESA_ACTIVA:'PLATINUM',EMPRESAS:{PLATINUM:{nombre:'PLATINUM',corto:'PLATINUM'},JIRE:{nombre:'JIRE',corto:'JIRE'}},
 CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66,subsidio_semanal_metodo:'cuota_diaria_truncada'},
  motores_nomina:{QUINCENAL:{por_obra:{'O-Q':{codigo:'FICTICIO',dias_fiscales:15.21,divisor_isr:365/12,factor_falta:7/6,criterio_limite_inferior:'NOI_SUPERIOR_ANTERIOR'}}}}},
 CUADS:[],CONTRATISTAS:[],DESC:[],USER:{id:'u'},ST:{}};
box.window=box;box.globalThis=box;vm.createContext(box);
vm.runInContext(`const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fullName=w=>[w.primer_apellido,w.nombres].filter(Boolean).join(' ');const money=v=>Number(v).toFixed(2);
const fmtD=v=>{if(!v)return'';const[y,m,d]=String(v).slice(0,10).split('-');return d+'/'+m+'/'+y;};const today=()=>'2026-11-23';`+code.join('\n'),box);
for(const m of ['72-aguinaldo-nucleo','74-aguinaldo-corrida','77-aguinaldo-evidencias','87-continuidad-laboral'])vm.runInContext(fs.readFileSync('frontend/modulos/'+m+'.js','utf8'),box);
const A=box.PLATINUM_AGUINALDO,UI=box.PLATINUM_AGUINALDO_UI,C=box.PLATINUM_CONTINUIDAD,P=UI._pruebas;
const fx=JSON.parse(fs.readFileSync('scripts/fixtures/aguinaldo-continuidad.json','utf8')),X=()=>JSON.parse(JSON.stringify(fx.contexto));
const w={id:fx.contexto.trabajador_id,obra_id:'O-PLAT',no_trab:834,nombres:'PRUEBA',primer_apellido:'A',curp:'ZZZZ990101HDFAAA01',estatus:'ACTIVO',periodo_pago:'SEMANAL',
 sd:376,sdi:394.5425,sal_semanal:2484.74,fecha_alta:'2026-11-23',fecha_baja:null,fecha_reingreso:null,eliminado:false};
const p={ejercicio:2026,modo:'VINCULO',desde:'2026-01-01',hasta:'2026-12-31',estatus:'ACTIVOS_HOY',fecha_estatus:'2026-11-23',corte:'2026-12-31',dias_pactados:15,respaldo_pactado:'',
 eg_computa:false,baja_inclusiva:true,exigir_cobertura:false,fecha_destino:'2026-12-07',metodo_isr:'ART96',periodicidad:'TODOS'};
const sinContinuidad=x=>{const y=JSON.parse(JSON.stringify(x));y.ciclo={...y.ciclo,inicio:y.ciclo.incorporacion,desde:y.ciclo.incorporacion};delete y.ciclo.continuidad;delete y.ciclo.incorporacion;
 y.faltas_semana=y.faltas_semana.filter(f=>!f.trabajador_origen);return y;};

// 1) Módulo de continuidad (puro).
const r=C.resumen(fx.contexto.ciclo);
eq([r.aplica,r.inicio,r.incorporacion,r.origen_empresa,r.fecha_traspaso],[true,'2026-02-10','2026-11-23','JIRE','2026-11-24'],'resumen: inicio reconocido, incorporación, origen y traspaso');
ok(/Antigüedad reconocida desde 10\/02\/2026 · incorporación a esta razón social 23\/11\/2026 · origen JIRE/.test(C.texto(fx.contexto.ciclo)),'texto para ficha y corrida');
eq(C.eslabones(r.cadena),['PLATINUM 23/11/2026–vigente','JIRE 10/02/2026–24/11/2026 (solape administrativo 2 día(s), contados una vez)'],'cadena legible con el solape');
eq(C.resumen({inicio:'2026-11-23'}).aplica,false,'sin reconocimiento no aplica');
eq(C.avisos({continuidad:{estado:'INVALIDA',texto:'cambió'}}).map(a=>[a.codigo,a.bloquea]),[['CONTINUIDAD_INVALIDA',true]],'reconocimiento invalidado bloquea');
eq(C.avisos({continuidad:{estado:'NO_APLICA_CICLO'}}).map(a=>[a.codigo,a.bloquea]),[['CONTINUIDAD_NO_APLICA',false]],'reingreso real posterior: aviso, ciclo nuevo');
// Cobertura de captura por tramo: JIRE capturó desde el 27/07; el hueco anterior queda señalado.
eq(C.cobertura(fx.contexto.ciclo,o=>({'O-JIRE':{desde:'2026-07-27'},'O-PLAT':{desde:'2026-03-30'}})[o],'O-PLAT'),{desde:'2026-07-27'},'cobertura por centro de cada tramo');
eq(C.cobertura(fx.contexto.ciclo,o=>({'O-JIRE':{desde:'2026-01-05'},'O-PLAT':{desde:'2026-03-30'}})[o],'O-PLAT'),{desde:'2026-02-10'},'cadena cubierta: sin hueco');
eq(C.cobertura({inicio:'2026-11-23'},()=>({desde:'2026-03-30'})),undefined,'sin continuidad usa la cobertura normal');
// Lote: inequívocos sin referencia extra; incompletos confirmables exigen referencia; no confirmables se rechazan.
const filas=[{trabajador_id:'a',nombre:'A',estado:'INEQUIVOCO',confirmable:true,huella:'h1'},{trabajador_id:'b',nombre:'B',estado:'INCOMPLETO',confirmable:true,huella:'h2'},
 {trabajador_id:'c',nombre:'C',estado:'INCOMPLETO',confirmable:false,huella:'h3'},{trabajador_id:'d',nombre:'D',estado:'INEQUIVOCO',confirmable:true,huella:'h4',vigente:{estado:'VIGENTE'}}];
let L=C.itemsLote(filas,new Set(['a','b']),{b:'corta'});eq(L.items,[{trabajador_id:'a',huella:'h1'}],'sólo el inequívoco');ok(/referencia documental/.test(L.errores[0]),'incompleto sin referencia suficiente');
L=C.itemsLote(filas,new Set(['a','b','c','d']),{b:'Oficio RH-2026-118 firmado'});
eq(L.items,[{trabajador_id:'a',huella:'h1'},{trabajador_id:'b',huella:'h2',confirmar_faltantes:true,referencia_faltantes:'Oficio RH-2026-118 firmado'}],'con referencia entra; ya reconocido y no confirmable no');
eq(L.errores.length,2,'dos rechazos explicados');
eq(C.conflictos({details:'[{"trabajador_id":"a","motivo":"FUENTES_CAMBIARON"}]'})[0].motivo,'FUENTES_CAMBIARON','conflictos del servidor legibles');

// 2) Cálculo de la corrida con el contexto real: mismos días que el servidor.
const f=P.calcularPersona(w,X(),p),d=f.fila.derecho;
eq([d.tramos[0].desde,d.tramos[0].hasta,d.dias_vinculo,d.faltas_afectan,d.dias_computables],['2026-02-10','2026-12-31',fx.derecho_servidor.dias_vinculo,fx.derecho_servidor.faltas_afectan,fx.derecho_servidor.dias_computables],
 'periodo desde el ingreso reconocido; días = servidor (325 − 4 = 321)');
eq(d.bruto,4960.11,'bruto 376 × 15 × 321 ÷ 365');
eq(f.fila.estado,'LISTA','lista para aplicar');eq(f.fila.observaciones.filter(o=>o.bloquea),[],'sin bloqueos');
eq(d.ausencias.detalle.filter(a=>a.desde==='2026-05-11').length,1,'falta de la ficha JIRE recuperada');
eq(d.ausencias.detalle.filter(a=>a.desde==='2026-11-23').length,1,'semana reflejada en ambas fichas: una vez');
ok(f.fila.fiscal.exento>0&&f.fila.fiscal.neto>0,'fiscal con el motor vigente');
eq(f.fila.fiscal.exento_usado,0,'la exención usa el acumulado del RFC actual');
const linea=P.lineaDe(f);
eq([linea.ciclo.inicio,linea.ciclo.incorporacion,linea.ciclo.continuidad.id,linea.dias_computables,linea.acreditado_externo,linea.bruto_causado],
 ['2026-02-10','2026-11-23',fx.contexto.ciclo.continuidad.id,321,0,4960.11],'la línea lleva el ciclo reconocido que valida el servidor');
// Presentación: corrida y papel de cálculo.
const html=P.vistaContinuidad({...f,x:X()}).replace(/\s+/g,' ');
ok(/Antigüedad reconocida desde <b>10\/02\/2026<\/b>/.test(html)&&/origen <b>JIRE<\/b>/.test(html)&&/traspaso 24\/11\/2026/.test(html),'desglose: reconocida, incorporación, origen y traspaso');
ok(/Periodo de devengo considerado: 10\/02\/2026 a 31\/12\/2026/.test(html),'desglose: periodo de devengo');
ok(/Incidencias recuperadas de JIRE: 11\/05\/2026 a 17\/05\/2026/.test(html),'desglose: incidencias de la ficha de origen');

// 3) Sin traspaso (mismo trabajador, ciclo de la ficha): resultado igual que antes de la corrección.
const g=P.calcularPersona(w,sinContinuidad(X()),p);
eq([g.fila.derecho.tramos[0].desde,g.fila.derecho.dias_vinculo,g.fila.derecho.faltas_afectan,g.fila.derecho.dias_computables,g.fila.derecho.bruto],['2026-11-23',39,3,36,556.27],'ciclo desde la incorporación de la ficha');
const sinModulo=box.PLATINUM_CONTINUIDAD;box.PLATINUM_CONTINUIDAD=undefined;
eq(P.calcularPersona(w,sinContinuidad(X()),p).fila.derecho.bruto,556.27,'sin el módulo 87 el cálculo es el mismo');box.PLATINUM_CONTINUIDAD=sinModulo;

// 4) Ingreso a JIRE en 2024 y continuidad por traspasos: devengo del ejercicio desde el 1 de enero, un solo año.
const x24=X();x24.ciclo.inicio='2024-03-01';x24.ciclo.continuidad.inicio_reconocido='2024-03-01';
const h=P.calcularPersona(w,x24,p);
eq([h.fila.derecho.tramos[0].desde,h.fila.derecho.dias_vinculo,h.fila.derecho.dias_computables],['2026-01-01',365,361],'2024: desde el 1 de enero de 2026');
ok(h.fila.derecho.bruto<=376*15,'nunca más de un año de aguinaldo');

// 5) Filtros: ingreso reconocido vs. incorporación a la razón social.
const rango={modo:'FECHA_ALTA',desde:'2026-11-01',hasta:'2026-11-30'};
eq(P.calcularPersona(w,X(),{...p,...rango}).sel.incluido,false,'por ingreso reconocido: el traspaso de noviembre no cuenta como ingreso');
eq(P.calcularPersona(w,X(),{...p,...rango,modo:'INCORPORACION'}).sel.incluido,true,'por incorporación: sí entra en noviembre');
eq(P.calcularPersona(w,X(),{...p,modo:'FECHA_ALTA',desde:'2026-02-01',hasta:'2026-02-28'}).sel.incluido,true,'por ingreso reconocido: febrero');
eq(P.calcularPersona(w,X(),{...p,modo:'VINCULO',desde:'2026-03-01',hasta:'2026-03-31'}).sel.incluido,true,'por vínculo: marzo (antes de la incorporación) no excluye');

// 6) Conflicto de faltas entre fichas y reconocimiento invalidado: bloquean con su causa.
const xc=X();xc.faltas_semana.push({id:'CONFLICTO:2026-11-23|2026-11-29',tipo:'FALTA',semana:48,motivo:'FALTAS DISTINTAS ENTRE FICHAS DE LA CONTINUIDAD',monto:null,recalculo_auto:null,calculo:null,
 periodo:{desde:'2026-11-23',hasta:'2026-11-29'},conflicto_continuidad:true,ids:['a','b']});
const fc=P.calcularPersona(w,xc,p);
ok(fc.fila.observaciones.some(o=>o.codigo==='FALTAS_CONTINUIDAD_DISTINTAS'&&o.bloquea),'semana con faltas distintas: bloquea');
ok(!fc.fila.observaciones.some(o=>o.codigo==='FALTA_SIN_CANTIDAD'),'no se confunde con una falta sin desglose');
const xi=X();xi.ciclo={...xi.ciclo,activo:false,motivo:'CONTINUIDAD_INVALIDA',inicio:xi.ciclo.incorporacion,continuidad:{estado:'INVALIDA',texto:'Las fichas o movimientos de la cadena cambiaron.'}};
const fi=P.calcularPersona(w,xi,p);
ok(fi.fila.observaciones.some(o=>o.codigo==='CONTINUIDAD_INVALIDA'&&o.bloquea&&/cambiaron/.test(o.texto)),'invalidada: bloquea con el motivo');
ok(!fi.fila.observaciones.some(o=>o.codigo==='CICLO_NO_ACTIVO'),'sin el aviso genérico');

// 7) Anticipo aplicado en JIRE por días incluidos: se acredita una vez; un borrador queda reservado; la exención no cambia.
for(const [estado,clase] of [['PAGADO','acreditado'],['SIN_CIERRE','reservado']]){
 const xa=X();xa.evidencias_ciclo=[{id:'apl-jire',operacion:'APL:apl-jire',origen:'APLICACION',estado,importe_bruto:500,exento:500,fecha_pago:'2026-10-09',semana:10,obra_id:'O-JIRE',aplicado:true,empresa_origen:'JIRE',continuidad:true}];
 const fa=P.calcularPersona(w,xa,p),c=fa.fila.conciliacion;
 eq([c[clase],fa.fila.bruto_a_pagar,fa.fila.fiscal.exento_usado],[500,4460.11,0],`aplicación JIRE ${estado}: ${clase}, saldo 4,460.11, exención del RFC actual intacta`);
 eq(P.lineaDe(fa).acreditado_externo,500,'acreditado externo = evidencias del ciclo (lo que valida el servidor)');
}
const xd=X();xd.evidencias_ciclo=[{id:'d1',operacion:'CFDI:UUID-1',origen:'CFDI_DESGLOSADO',estado:'APLICADO',importe_bruto:300,exento:300,desglosado:true,empresa_origen:'JIRE',continuidad:true},
 {id:'d2',operacion:'CFDI:UUID-1',origen:'CFDI_DESGLOSADO',estado:'APLICADO',importe_bruto:300,exento:300,desglosado:true,empresa_origen:'JIRE',continuidad:true}];
eq(P.calcularPersona(w,xd,p).fila.conciliacion.acreditado,300,'PDF y XML del mismo UUID de JIRE: una vez');

// 8) Quincenal: el mismo ciclo reconocido con el motor quincenal.
const wq={...w,id:'wq',obra_id:'O-Q',periodo_pago:'QUINCENAL',sd:500};
const xq=X();xq.trabajador_id='wq';xq.obra_id='O-Q';
const fq=P.calcularPersona(wq,xq,{...p,fecha_destino:'2026-12-07'});
eq([fq.dest.periodicidad,fq.fila.derecho.dias_computables,fq.fila.derecho.bruto],['QUINCENAL',321,6595.89],'quincenal: 500 × 15 × 321 ÷ 365');
ok(fq.fila.fiscal&&fq.fila.estado==='LISTA','quincenal con fiscal del motor quincenal');

// 9) Excel de análisis: columnas de continuidad.
let libro=null;box.dl=async(wb)=>{libro=wb;};box.buildSheet=rows=>({_rows:rows});box.XLSX={utils:{book_new:()=>({SheetNames:[],Sheets:{}}),book_append_sheet:(wb,ws,nm)=>{wb.SheetNames.push(nm);wb.Sheets[nm]=ws;}}};
box.razonSocialEmpresa=()=>'RAZÓN FICTICIA';box.modal=h=>{document.getElementById('modals').innerHTML=h;};box.closeModal=()=>{};box.toast=()=>{};
if(!P.estado())UI.abrir();const S=P.estado();S.p=p;S.empresa='PLATINUM';S.filas=[f,g];S.sel=new Set([f.w.id]);f.puede_revisar=true;f.estado_revision='LISTA';
P.excelAnalisis();
const enc=libro.Sheets['ANÁLISIS']._rows[2],fila=libro.Sheets['ANÁLISIS']._rows[3];
eq(enc.slice(30),['ANTIGÜEDAD RECONOCIDA DESDE','INCORPORACIÓN A LA RAZÓN SOCIAL','ORIGEN Y TRASPASO'],'encabezados nuevos al final');
eq(fila.slice(30,32),['2026-02-10','2026-11-23'],'fechas reconocida e incorporación');ok(/^JIRE OBRA FICTICIA JIRE · traspaso 2026-11-24/.test(fila[32]),'origen y traspaso');
console.log('PASS continuidad JIRE→PLATINUM: '+n+' comprobaciones (contexto real del servidor = días de la corrida, mismo año y desde 2024, solape y semana reflejada una vez, faltas JIRE recuperadas, filtros reconocido/incorporación, conflicto e invalidación bloquean, anticipo JIRE acreditado sin tocar la exención, quincenal, sin traspaso igual, Excel)');
