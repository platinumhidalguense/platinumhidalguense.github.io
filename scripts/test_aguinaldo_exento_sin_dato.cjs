// Aguinaldo: «exención usada en el año desconocida» se toma como $0 (ambas razones sociales).
// Usa el contexto REAL que devolvió el servidor para fichas ficticias en una transacción revertida
// (scripts/fixtures/aguinaldo-exento-sin-dato.json: baja anterior en el año sin fuente fiscal verificada)
// y el código real de la plataforma (núcleo, corrida y motores). Sin red ni base de datos.
// Con AG_LINEAS=<ruta> escribe las líneas de APLICAR para la prueba revertida en producción.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{parseHTML}=require('linkedom');
const {document}=parseHTML('<html><body><div id="modals"></div></body></html>');
let n=0;const ok=(c,m)=>{assert(c,m);n++;},eq=(a,b,m)=>{const j=x=>x===undefined?x:JSON.parse(JSON.stringify(x));assert.deepStrictEqual(j(a),j(b),m);n++;};
const code=[],mods=JSON.parse(fs.readFileSync('frontend/modulos.json','utf8')).modules;
for(const p of mods){const s=fs.readFileSync(p,'utf8');
 for(const node of acorn.parse(s,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'||node.type==='VariableDeclaration'&&node.declarations.every(x=>x.init&&['ISR_M','F_SEM','PERIODOS','ISR_TABLA','MOTOR_NOMINA_VERSION','SEMANA1'].includes(x.id.name)))code.push(s.slice(node.start,node.end));}
const fx=JSON.parse(fs.readFileSync('scripts/fixtures/aguinaldo-exento-sin-dato.json','utf8'));
const obras=fx.casos.map(c=>({...c.obra,activa:true}));
const box={window:null,document,console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,
 OBRA:obras[0],OBRAS:obras,WORKERS:[],EMPRESA_ACTIVA:'PLATINUM',EMPRESAS:{PLATINUM:{nombre:'PLATINUM',corto:'PLATINUM'},JIRE:{nombre:'JIRE',corto:'JIRE'}},
 CFGEMP:{fiscal:{anio:2026,sm:315.04,uma:117.31,umi:100.81,subsidio_pct:15.02,subsidio_tope_mensual:11492.66,subsidio_semanal_metodo:'cuota_diaria_truncada'},motores_nomina:{}},
 CUADS:[],CONTRATISTAS:[],DESC:[],USER:{id:'u'},ST:{}};
box.window=box;box.globalThis=box;vm.createContext(box);
vm.runInContext(`const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fullName=w=>[w.primer_apellido,w.nombres].filter(Boolean).join(' ');const money=v=>Number(v).toFixed(2);
const fmtD=v=>{if(!v)return'';const[y,m,d]=String(v).slice(0,10).split('-');return d+'/'+m+'/'+y;};const today=()=>'2026-11-25';`+code.join('\n'),box);
for(const m of ['72-aguinaldo-nucleo','74-aguinaldo-corrida','77-aguinaldo-evidencias','87-continuidad-laboral'])vm.runInContext(fs.readFileSync('frontend/modulos/'+m+'.js','utf8'),box);
const A=box.PLATINUM_AGUINALDO,P=box.PLATINUM_AGUINALDO_UI._pruebas,clone=x=>JSON.parse(JSON.stringify(x));
const p={ejercicio:2026,modo:'VINCULO',desde:'2026-01-01',hasta:'2026-12-31',estatus:'ACTIVOS_HOY',fecha_estatus:'2026-11-25',corte:'2026-12-31',dias_pactados:15,respaldo_pactado:'',
 eg_computa:false,baja_inclusiva:true,exigir_cobertura:false,metodo_isr:'ART96',periodicidad:'TODOS'};
const ficha=c=>({id:c.contexto.trabajador_id,obra_id:c.obra.id,no_trab:c.no_trab,nombres:'FICTICIA',primer_apellido:'PRUEBA',curp:c.curp,estatus:'ACTIVO',periodo_pago:'SEMANAL',
 sd:376,sdi:394.5425,sal_semanal:2632,fecha_alta:'2026-02-02',fecha_baja:'2026-05-25',fecha_reingreso:'2026-08-31',eliminado:false});
const calc=(c,fa)=>{box.OBRA=obras.find(o=>o.id===c.obra.id);box.EMPRESA_ACTIVA=c.empresa;const x=clone(c.contexto);if(fa)x.fiscal_anual={...x.fiscal_anual,...fa};return P.calcularPersona(ficha(c),x,{...p,fecha_destino:c.fecha_destino});};
const cod=f=>f.fila.observaciones.map(o=>[o.codigo,o.bloquea]);
const lineas={};

// 1) Ambas razones sociales con el contexto real del servidor: baja anterior sin fuente fiscal → exención usada $0.
for(const c of fx.casos){
 eq(c.contexto.fiscal_anual.pendientes.map(x=>x.motivo),['BAJA_ANTERIOR_SIN_FUENTE_FISCAL_VERIFICADA'],c.empresa+': el servidor informa el dato desconocido');
 const f=calc(c),x=f.fila.fiscal;
 eq([f.fila.estado,f.estado_revision,f.puede_aplicar],['LISTA','LISTA',true],c.empresa+': lista para Excel y aplicación (antes FISCAL_PENDIENTE)');
 ok(cod(f).some(([k,b])=>k==='EXENTO_SIN_DATO_CERO'&&b===false),c.empresa+': aviso no bloqueante con el motivo');
 ok(!cod(f).some(([k])=>k==='FISCAL_ANUAL_PENDIENTE'),c.empresa+': sin bloqueo fiscal anual');
 eq([f.fila.derecho.dias_computables,f.fila.derecho.bruto,f.fila.conciliacion.exento_usado,f.fila.conciliacion.exento_desconocido,f.fila.conciliacion.exento_sin_dato],[123,1900.6,0,false,1],c.empresa+': bruto 376×15×123/365 y usado $0');
 eq([x.tope,x.exento_usado,x.exento,x.gravado,x.isr,x.neto],[3519.3,0,1900.6,0,0,1900.6],c.empresa+': exento = mín(bruto, 30 UMA − 0)');
 const l=P.lineaDe(f);
 eq([l.exento_usado,l.exento,l.gravado,l.bruto,l.huella_fuentes,l.fecha_pago],[0,1900.6,0,1900.6,c.contexto.huella_fuentes,c.contexto.fecha_pago],c.empresa+': línea de APLICAR con usado = fiscal_anual.exento_usado del servidor');
 ok(l.desglose.observaciones.some(o=>o.codigo==='EXENTO_SIN_DATO_CERO'),c.empresa+': el desglose guardado conserva el aviso');
 const dx=A.desgloseExencion(f.fila,f.x.fiscal_anual,[]);
 eq([dx.consumido,dx.disponible,dx.exento],[0,3519.3,1900.6],c.empresa+': desglose de exención (pantalla y Excel de análisis)');
 lineas[c.empresa]=l;
}
// 2) Lo verificado sí se descuenta; sólo la parte desconocida vale $0.
{const c=fx.casos[0];
 const f=calc(c,{exento_usado:2000,fuentes:[{id:'D1',uuid:'UUID-FICTICIO',bruto:2000,exento:2000}],pendientes:[{motivo:'CFDI_SIN_DESGLOSE_SAT_002',documento_id:'D2'},{motivo:'BAJA_ANTERIOR_SIN_FUENTE_FISCAL_VERIFICADA',fecha_baja:'2026-05-25'}]});
 eq([f.fila.estado,f.fila.fiscal.exento_usado,f.fila.fiscal.exento,f.fila.fiscal.gravado,f.fila.conciliacion.exento_sin_dato],['LISTA',2000,1519.3,381.3,2],'conocido $2,000 + desconocidos $0: disponible $1,519.30, gravado $381.30');
 ok(f.fila.fiscal.isr>0&&f.fila.fiscal.neto===Math.round((1900.6-f.fila.fiscal.isr)*100)/100,'ISR del gravado y neto = bruto − ISR');
 ok(/se toma como \$0; se descuenta sólo lo verificado \(\$2000\.00\)/.test(f.fila.observaciones.find(o=>o.codigo==='EXENTO_SIN_DATO_CERO').texto),'el aviso dice cuánto se descontó');
 for(const m of ['CFDI_SAT_002_INCOMPLETO','CFDI_FECHA_PAGO_PENDIENTE','CFDI_UUID_PENDIENTE'])eq(calc(c,{pendientes:[{motivo:m}]}).fila.estado,'LISTA',m+' = dato desconocido → $0');
}
// 3) Las contradicciones (y cualquier motivo nuevo) siguen bloqueando: no son «desconocido».
{const c=fx.casos[1];
 for(const m of ['CFDI_UUID_IMPORTES_CONTRADICTORIOS','EXENCION_APLICACION_CFDI_DISTINTA','MOTIVO_NUEVO']){
  const f=calc(c,{pendientes:[{motivo:'BAJA_ANTERIOR_SIN_FUENTE_FISCAL_VERIFICADA'},{motivo:m}]});
  eq([f.fila.estado,f.estado_revision,f.puede_aplicar,f.fila.fiscal==null,f.fila.conciliacion.exento_desconocido],['BLOQUEADA','FISCAL_PENDIENTE',false,true,true],m+' bloquea');
  assert.throws(()=>P.lineaDe(f),/información pendiente/);n++;
 }
}
// 4) Ruta sin fiscal_anual (revisión): un pago del año sin parte exenta se toma como $0 sin bloquear.
{const r=A.calcularFila({ejercicio:2026,salario_base:376,dias_pactados:15,corte:'2026-12-31',hoy:'2026-11-25',tramos:[{desde:'2026-08-31',hasta:null}],avisos:[],
  ausencias:{digitales:[],rangos:[],historicas:[]},
  evidencias:[{id:'E1',origen:'CFDI_DESGLOSADO',estado:'APLICADO',desglosado:true,importe_bruto:100,exento:null,fecha_pago:'2026-08-07'},{id:'E2',origen:'CFDI_DESGLOSADO',estado:'APLICADO',desglosado:true,importe_bruto:50,exento:50,fecha_pago:'2026-08-08'}],
  fecha_pago:'2026-11-27',metodo_isr:'ART174',ingreso_mensual_ordinario:11000,tarifa_mensual:vm.runInContext('ISR_M',box)});
 eq([r.conciliacion.exento_usado,r.conciliacion.exento_sin_dato,r.conciliacion.exento_desconocido,r.estado],[50,1,false,'LISTA'],'conciliación: sólo cuenta el exento informado y no bloquea');
 ok(r.observaciones.some(o=>o.codigo==='EXENTO_SIN_DATO_CERO'&&!o.bloquea)&&!r.observaciones.some(o=>o.codigo==='EXENCION_DESCONOCIDA'),'aviso no bloqueante en la ruta de revisión');
 eq([r.fiscal.exento_usado,r.fiscal.exento],[50,Math.min(r.bruto_a_pagar,3469.3)],'exención disponible = 30 UMA − $50 conocidos');
}
if(process.env.AG_LINEAS)fs.writeFileSync(process.env.AG_LINEAS,JSON.stringify({p,lineas,motor:vm.runInContext('MOTOR_NOMINA_VERSION',box),reglas:A.VERSION}));
console.log('PASS aguinaldo exento sin dato = $0: '+n+' comprobaciones (PLATINUM y JIRE con contexto real del servidor, conocidos + desconocidos, contradicciones, línea de APLICAR).');
