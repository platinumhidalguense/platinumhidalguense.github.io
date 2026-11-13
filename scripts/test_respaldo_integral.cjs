// Respaldo integral (RESPALDO_INTEGRAL_V1): código real del módulo 79 en VM, xlsx-js-style y JSZip
// reales, Supabase simulado con RLS y marcas del servidor. Datos ficticios. El libro se relee con un
// lector independiente (scripts/verificar_respaldo_xlsx.py, openpyxl) contra el JSON de fuentes del corte.
// RESPALDO_VOLUMEN=produccion mide con un volumen parecido al de producción.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),acorn=require('acorn'),{spawnSync}=require('node:child_process');
const XLSX=require('xlsx-js-style'),JSZip=require('jszip');
const root=path.resolve(__dirname,'..'),MOD=path.join(root,'frontend/modulos/86-respaldo-integral.js');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{assert.deepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);n++;};
const salida=fs.mkdtempSync(path.join(os.tmpdir(),'respaldo-'));
const PROD=path.join(root,'work/respaldo_20261111/prod_columnas.json'),meta=fs.existsSync(PROD)?JSON.parse(fs.readFileSync(PROD,'utf8')):null;
const fmt=t=>({timestamptz:'timestamp with time zone',timestamp:'timestamp without time zone'}[t]||t);
const columnasDe=tabla=>{if(!meta)return null;const [e,t]=tabla.includes('.')?tabla.split('.'):['public',tabla];const s=meta[e]&&meta[e][t];return s?s.split(' ').map(c=>{const nn=c.endsWith('!'),[a,b]=c.replace(/!$/,'').split(':');return [a,fmt(b),nn];}):null;};

// ---------- módulo real (sin funciones globales de nivel superior) ----------
const src=fs.readFileSync(MOD,'utf8'),ast=acorn.parse(src,{ecmaVersion:'latest'});
ok(ast.body.length===1&&ast.body[0].type==='ExpressionStatement','el módulo es una sola IIFE sin declaraciones globales');
ok(!/\bfunction\s+exportRespaldo\b/.test(src),'no redefine exportRespaldo (la delegación la hace el integrador en 34)');
function cargar(conModelo){
 const box={console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise,Error,RegExp,Symbol,Intl,Uint8Array,ArrayBuffer,BigInt,TextEncoder,setTimeout,clearTimeout,setImmediate,crypto:crypto.webcrypto,URL};
 box.window=box;box.globalThis=box;vm.createContext(box);
 if(conModelo)vm.runInContext(fs.readFileSync(path.join(root,'frontend/modulos/83-tablero-modelo.js'),'utf8'),box);
 vm.runInContext(src,box);return box;
}
const BOX=cargar(true),API=BOX.PLATINUM_RESPALDO,T=API._pruebas;
ok(API&&API.FORMATO==='RESPALDO_INTEGRAL_V1','expone window.PLATINUM_RESPALDO');
const FUENTES=JSON.parse(JSON.stringify(API.fuentes()));

// ---------- unidades ----------
{
 const u=new Set();const a=T.nombreHoja('CENTRO DE TRABAJO CON NOMBRE MUY LARGO NORTE',u),b=T.nombreHoja('CENTRO DE TRABAJO CON NOMBRE MUY LARGO SUR',u);
 ok(a.length<=31&&b.length<=31&&a!==b&&b.endsWith('(2)'),'mismo prefijo de 31: nombres únicos');
 eq(T.nombreHoja('A/B:C*D?[E]',new Set()),'A B C D E','caracteres inválidos');
 eq(T.nombreHoja('history',new Set()),'History_','nombre reservado History');
 const s='x'.repeat(29999)+'😀'+'y'.repeat(5);const p=T.partirTexto(s,30000);
 eq(p.join(''),s,'partes recomponen el texto');ok(p[0].length===29999,'no parte pares sustitutos');
 eq(T.celda('=SUMA(A1)','TEXTO'),{t:'s',v:'=SUMA(A1)',s:{numFmt:'@'}},'fórmula como texto');
 ok(T.celda(null,'IMPORTE').v==='∅ NULL'&&T.celda('','TEXTO')===null&&T.celda(0,'IMPORTE').v===0,'nulo, vacío y cero distintos');
 eq(T.celda('∅ NULL','TEXTO').v,'∅∅ NULL','valor real con ∅ se escapa');
 eq(T.valorLogico(42,'ID'),'42','bigint de historial como texto');
 eq(T.tipoDe('clabe','text'),'TEXTO');eq(T.tipoDe('importe','numeric'),'IMPORTE');eq(T.tipoDe('sdi','numeric'),'IMPORTE');eq(T.tipoDe('factor','numeric'),'NUMERO');eq(T.tipoDe('id','bigint'),'ID');
 eq([T.tipoDe('cuenta',undefined,123),T.tipoDe('clabe',undefined,12345678901234567),T.tipoDe('nss',undefined,1),T.tipoDe('folio_st7',undefined,7)],['TEXTO','TEXTO','TEXTO','TEXTO'],'sin metadatos, columnas sensibles siguen como texto');
 ok(!/platinum_internal\.|correo_creados|admin_papelera/.test(src),'el cliente no enumera tablas internas ni claves de credenciales');
 const cfg=T.CONFIG_PERMITIDA('PLATINUM');ok(!('correo_creados' in cfg)&&!('admin_papelera' in cfg)&&!JSON.stringify(cfg).includes('pwd'),'configuración nunca incluye credenciales');
}

// ---------- base ficticia ----------
const U=(p,i)=>p+'0000000-0000-4000-8000-'+String(i).padStart(12,'0');
const O1=U('a',1),O2=U('a',2),O3=U('a',3);
const USUARIOS={admin:{id:U('9',1),email:'admin@prueba.test',vip:true,salud:true,admin:true,empresas:['PLATINUM','JIRE'],obras:[]},
 consulta:{id:U('9',2),email:'consulta@prueba.test',vip:false,salud:false,admin:false,empresas:['PLATINUM'],obras:[]},
 restringido:{id:U('9',3),email:'restringido@prueba.test',vip:false,salud:false,admin:false,empresas:['PLATINUM'],obras:[O1]}};
function crearBase(V){
 const db={},ins=(t,r)=>{(db[t]||(db[t]=[])).push(r);return r;};
 let seq=1;const id=p=>U(p,seq++),ts=(d,h=12)=>new Date(Date.UTC(2026,3,1+d,h)).toISOString().replace('.000Z','+00:00');
 ins('obras',{id:O1,nombre:'CENTRO DE TRABAJO CON NOMBRE MUY LARGO NORTE',ubicacion:null,tipo:'OBRA',activa:true,orden:1,registro_patronal:'A12-34567-10-1',registro_siroc:null,prima_rt:7.58875,fecha_inicio:'2026-03-30',empresa_codigo:'PLATINUM',__txt:{prima_rt:'7.58875'}});
 ins('obras',{id:O2,nombre:'CENTRO DE TRABAJO CON NOMBRE MUY LARGO SUR',ubicacion:'',tipo:'OBRA',activa:false,orden:2,registro_patronal:'A12-34567-10-1',registro_siroc:null,prima_rt:null,fecha_inicio:'2026-03-30',empresa_codigo:'PLATINUM'});
 ins('obras',{id:O3,nombre:'OBRA JIRE',ubicacion:null,tipo:'OBRA',activa:true,orden:3,registro_patronal:'B99-00000-10-9',registro_siroc:null,prima_rt:0.5,fecha_inicio:'2026-03-30',empresa_codigo:'JIRE'});
 ins('catalogo_incidencias',{id:2,nombre:'FALTA',clase:'AUSENTISMO',afecta_septimo:true,afecta_ptu:true,afecta_infonavit:true,automatismo:'',fuente:'CAT'});
 ins('catalogo_incidencias',{id:9,nombre:'INCAPACIDAD',clase:'INCAPACIDAD',afecta_septimo:false,afecta_ptu:false,afecta_infonavit:true,automatismo:'',fuente:'CAT'});
 for(const [k,v] of Object.entries({app_version:{v:'2026-11-10.2',nota:'x'},fiscal:{anio:2026,uma:117.31,sm:315.04},tabulador:{AYUDANTE:350.5,'OFICIAL ALBAÑIL':500},
  correo_creados:{dominio:'example.test',pwd:'CLAVE_FICTICIA_NO_USAR'},admin_papelera:{email:'admin@prueba.test'},empresa_PLATINUM:{razon:'RAZÓN FICTICIA',rfc:'XAXX010101000',token:'NO_DEBE_SALIR'},empresa_JIRE:{razon:'JIRE FICTICIA'}}))
  ins('config',{clave:k,valor:v,actualizado_por:'admin@prueba.test',updated_at:ts(1)});
 for(const u of Object.values(USUARIOS))ins('app_usuarios',{user_id:u.id,email:u.email,nombre:null,rol:u.admin?'ADMIN':'CONSULTA',full_access:u.vip,obras_permitidas:u.obras,areas_permitidas:[],puede_escribir:false,puede_eliminar:u.admin,activo:true,notas:'NOTA INTERNA',creado_por:null,created_at:ts(0),updated_at:ts(0),empresas_permitidas:u.empresas,solo_contratos:false});
 const obrasP=[O1,O2,O3];let hid=1,no=0;
 const persona=(obra,i,extra={})=>{
  no++;const w={id:id('b'),obra_id:obra,contratista:'CONTRATISTA '+(i%3),estatus:'ACTIVO',no_trab:i,fecha_alta:'2026-04-06',fecha_baja:null,monto_finiquito:null,semana_ingreso:'S2',
   primer_apellido:'FICTICIO',segundo_apellido:'PRUEBA'+i,nombres:'PERSONA '+no,estado_civil:'SOLTERO',escolaridad:null,funciones:'APOYO',puesto:'AYUDANTE',area:null,beneficiario:'BENEFICIARIO '+i,
   sd:500,sdi:524.6575,sal_semanal:3500,rfc:'XAXX0101010'+String(no%100).padStart(2,'0'),curp:'XAXX010101HDFXXX'+String(no%100).padStart(2,'0'),nacionalidad:'MEXICANA',fecha_nacimiento:'1990-01-01',
   nss:'0'+String(1000000000+no),cuenta:'000'+String(1000000+no),clabe:'002180'+String(700000000000+no),banco:'BANAMEX',edo_nacimiento:'HIDALGO',direccion:'CALLE '+i+' COL. CENTRO',cp:'01000',telefono:'0445512345',
   correo:null,genero:'H',turno:'MATUTINO',forma_pago:'TRANSFERENCIA',num_tarjeta:'0'+String(4152310000000000+no),observaciones:null,docs:{INE:'ENTREGADO','CURP (documento)':'ENTREGADO'},drive_link:null,
   creado_por:'admin@prueba.test',actualizado_por:null,created_at:ts(5),updated_at:ts(6),periodo_pago:'SEMANAL',movimiento_imss:'ALTA',fecha_mov_imss:'2026-04-06',tipo_contrato:'OBRA',fecha_fin_contrato:null,
   motivo_baja:null,pendiente_manual:false,motivo_pendiente:'',eliminado:false,eliminado_en:null,eliminado_por:null,motivo_eliminacion:null,fecha_reingreso:null,registro_patronal:null,prima_rt:null,
   benef_parentesco:'HIJO',benef_telefono:null,benef_porcentaje:100,id_cuadrilla:null,__txt:{sd:'500.00',sdi:'524.657500',sal_semanal:'3500.00',benef_porcentaje:'100'},...extra};
  return ins('trabajadores',w);
 };
 const snap=(w,mod)=>{const o={...w};delete o.__txt;return {...o,...mod};};
 const hist=(w,accion,antes,despues,fecha)=>ins('historial',{id:hid++,trabajador_id:w.id,trabajador_nombre:w.nombres,obra_id:w.obra_id,usuario:'captura@prueba.test',accion,datos_antes:antes,datos_despues:despues,fecha});
 for(const obra of obrasP){
  const k=obra===O3?Math.max(3,Math.round(V/4)):V;
  for(let i=1;i<=k;i++){
   const w=persona(obra,i);
   hist(w,'ALTA',null,snap(w,{}),ts(5));
   for(let e=0;e<8;e++)hist(w,'MODIFICACION',snap(w,{puesto:'AYUDANTE'}),snap(w,{puesto:e%2?'OFICIAL':'AYUDANTE',observaciones:'cambio '+e}),ts(10+e));
   for(let d=0;d<4;d++)ins('documentos',{id:id('d'),trabajador_id:w.id,obra_id:obra,categoria:d?'RECIBO_NOMINA':'ACUSE_IMSS',subtipo:null,semana:'S'+(d+1),fecha_doc:'2026-04-10',archivo:obra+'/'+w.id+'/'+d+'.pdf',
    nombre_archivo:'recibo '+d+'.pdf',notas:null,anulado:d===3&&i%7===0,subido_por:'captura',created_at:ts(12),hash:crypto.createHash('sha256').update(w.id+d).digest('hex'),anulado_por:null,anulado_en:null,motivo_anulacion:null,
    cfdi_uuid:null,cfdi_total:null,cfdi_fecha_pago:null,periodo_inicio:null,periodo_fin:null,mime_type:'application/pdf',nomina_neto:d?3200.15:null,nomina_tipo:null,nomina_lector:null,conciliacion_archivo_id:null});
   for(let p=0;p<3;p++)ins('pagos',{id:id('p'),obra_id:obra,trabajador_id:w.id,semana:'S'+(p+1),medio:'TRANSFERENCIA',banco:'BANAMEX',cuenta_mask:'****'+String(no).padStart(4,'0'),titular:w.nombres,importe:3200.15+p,estado:'PAGADO',fecha_pago:'2026-04-1'+p,
    folio_lote:'L'+p,descripcion:null,archivo:null,nombre_archivo:null,hash:null,creado_por:'captura',created_at:ts(20+p),origen:'GLOBAL',conciliacion_archivo_id:null,conciliacion_linea:null});
   ins('auditoria_calculos_nomina',{id:id('e'),lote_id:U('f',1),obra_id:obra,empresa_codigo:obra===O3?'JIRE':'PLATINUM',trabajador_id:w.id,trabajador_numero:i,trabajador_nombre:w.nombres,tipo_calculo:'PROYECCION_NOMINA',periodo:'S5',
    formula_version:'PRUEBA',entradas:{sd:500,dias:7,faltas:[]},resultado:{neto:3200.155555,isr:120.123456},monto_modelo:3200.155555,monto_aplicado:3200.16,ajuste_noi:null,actor_id:USUARIOS.admin.id,actor_email:'admin@prueba.test',created_at:ts(25),huella_sha256:id('h')});
  }
 }
 // Casos especiales en O1.
 const W=db.trabajadores.filter(w=>w.obra_id===O1);
 const w1=W[0];Object.assign(w1,{fecha_reingreso:'2026-08-03',estatus:'ACTIVO',fecha_baja:'2026-07-15'});
 const bajaRev=hist(w1,'BAJA',snap(w1,{estatus:'ACTIVO',fecha_baja:null}),snap(w1,{estatus:'BAJA',fecha_baja:'2026-05-10'}),ts(40));
 ins('control_reversiones_baja',{id:id('w'),historial_id:bajaRev.id,obra_id:O1,trabajador_id:w1.id,estado:'APLICADA',transaccion:123456789,actor_id:USUARIOS.admin.id,actor_email:'admin@prueba.test',created_at:ts(41),antes:{estatus:'BAJA'},restaurar:{estatus:'ACTIVO'},efectos:{papeles:1},resultado:{ok:true}});
 hist(w1,'REACTIVACION',snap(w1,{estatus:'BAJA',fecha_reingreso:null}),snap(w1,{estatus:'ACTIVO',fecha_reingreso:'2026-06-01'}),ts(61));
 hist(w1,'BAJA',snap(w1,{estatus:'ACTIVO',fecha_baja:'2026-05-10'}),snap(w1,{estatus:'BAJA',fecha_baja:'2026-07-15'}),ts(105));
 hist(w1,'REACTIVACION',snap(w1,{estatus:'BAJA',fecha_reingreso:'2026-06-01'}),snap(w1,{estatus:'ACTIVO',fecha_reingreso:'2026-08-03'}),ts(124));
 const w2=W[1];Object.assign(w2,{segundo_apellido:'',correo:null,monto_finiquito:0,observaciones:'=HYPERLINK("http://example.test","clic")',funciones:'+52 55 0000',beneficiario:'-5',escolaridad:'@SUMA',direccion:'∅ NULL',
  clabe:'002180700123456789',cuenta:'0001234567',nss:'01234567890',cp:'01000',drive_link:'https://drive.example.test/carpeta'});
 const w3=W[2];Object.assign(w3,{eliminado:true,eliminado_en:ts(50),eliminado_por:'admin@prueba.test',motivo_eliminacion:'DUPLICADO'});
 const w4=W[3];Object.assign(w4,{fecha_reingreso:'2026-09-01'});
 // Texto largo (>32,767) en observaciones de una persona y en la fotografía de un cierre.
 W[4].observaciones='L'.repeat(40000)+'FIN';
 const cierre=ins('control_cierres_nomina',{id:id('c'),obra_id:O1,semana:5,periodo:'SEMANAL',estado:'AUTORIZADO',total_nomina:100000.5,total_prevision:1234.56,total_retenciones:10,total_finiquitos:0,total_neto:99990.5,total_trabajadores:V,
  formula_version:'PRUEBA',snapshot:{modelo:{filas:W.slice(0,Math.min(W.length,120)).map(w=>({w:snap(w,{}),neto:3200.15}))},items:[]},snapshot_sha256:'x',archivo_noi:null,archivo_noi_sha256:null,observaciones:null,
  creado_por:USUARIOS.admin.id,creado_por_email:'admin@prueba.test',revisado_por:null,revisado_por_email:null,revisado_en:null,autorizado_por:null,autorizado_por_email:null,autorizado_en:null,timbrado_por:null,timbrado_por_email:null,timbrado_en:null,pagado_por:null,pagado_por_email:null,pagado_en:null,bloqueado_en:null,created_at:ts(30),updated_at:ts(31)});
 const ver1=ins('control_cierre_versiones',{id:id('v'),cierre_origen:cierre.id,obra_id:O1,version:1,estado_origen:'BORRADOR',snapshot:{v:1},snapshot_sha256:'a',fuente_sha256:'b',actor_id:USUARIOS.admin.id,created_at:ts(29)});
 const ver2=ins('control_cierre_versiones',{id:id('v'),cierre_origen:cierre.id,obra_id:O1,version:2,estado_origen:'AUTORIZADO',snapshot:{v:2},snapshot_sha256:'c',fuente_sha256:'d',actor_id:USUARIOS.admin.id,created_at:ts(30)});
 ins('control_flujo_cierres',{cierre_id:cierre.id,obra_id:O1,revision:2,fuente_sha256:'d',preparado_sha256:null,sucio:false,version_id:ver2.id,reapertura_id:null,preparado_por:null,preparado_en:null,updated_at:ts(31)});
 const ob=[],evs=[];
 for(const [k,w] of W.slice(5,25).entries()){
  ob.push(ins('control_obligaciones_pago',{id:id('o'),cierre_origen:cierre.id,cierre_id:cierre.id,version_id:ver2.id,obra_id:O1,trabajador_id:w.id,semana:5,tipo:k===0?'PREVISION_SOCIAL':'NOMINA',numero:w.no_trab,nombre:w.nombres,contratista:w.contratista,importe:3200.15,metodo:'TRANSFERENCIA',vigente:k!==1,created_at:ts(31),updated_at:ts(31)}));
  evs.push(ins('control_evidencias_pago',{id:id('x'),obra_id:O1,trabajador_id:w.id,semana:5,clave:'CLAVE'+k,importe:3200.15,pago_id:null,cheque_id:null,created_at:ts(32)}));
  ins('control_pago_aplicaciones',{id:id('y'),obra_id:O1,obligacion_id:ob[k].id,evidencia_id:evs[k].id,version_id:ver2.id,importe:3200.15,actor_id:USUARIOS.admin.id,clave_idempotencia:id('k'),motivo:'APLICAR',created_at:ts(33),retirado_en:k===2?ts(34):null,retirado_por:null,motivo_retiro:k===2?'RETIRO':null});
 }
 ins('cheques',{id:id('q'),obra_id:O1,trabajador_id:W[5].id,no_trab:6,contratista:'C',nombre:'X',puesto:null,curp:null,semana:'S5',periodo:null,importe:1500.5,tipo_pago:'FINIQUITO',num_cheque:'0001234',consecutivo:'007',estatus:'CANCELADO',
  observaciones:null,creado_por:null,actualizado_por:null,created_at:ts(35),updated_at:ts(35),eliminado:false,eliminado_por:null,eliminado_en:null,motivo_eliminado:null,cierre_id:null,origen_generacion:'MANUAL',lote_nomina_id:null,reemplaza_cheque_id:null});
 ins('cheques',{id:id('q'),obra_id:O1,trabajador_id:W[5].id,no_trab:6,contratista:'C',nombre:'X',puesto:null,curp:null,semana:'S5',periodo:null,importe:1500.5,tipo_pago:'FINIQUITO',num_cheque:'0001235',consecutivo:'008',estatus:'PENDIENTE',
  observaciones:null,creado_por:null,actualizado_por:null,created_at:ts(36),updated_at:ts(36),eliminado:false,eliminado_por:null,eliminado_en:null,motivo_eliminado:null,cierre_id:null,origen_generacion:'MANUAL',lote_nomina_id:null,reemplaza_cheque_id:db.cheques[0].id});
 ins('cheques',{id:id('q'),obra_id:O1,trabajador_id:W[6].id,no_trab:7,contratista:'C',nombre:'Y',puesto:null,curp:null,semana:'S5',periodo:null,importe:10,tipo_pago:'CHEQUE',num_cheque:'0009999',consecutivo:'009',estatus:'PENDIENTE',
  observaciones:null,creado_por:null,actualizado_por:null,created_at:ts(36),updated_at:ts(36),eliminado:true,eliminado_por:'admin',eliminado_en:ts(37),motivo_eliminado:'ERROR',cierre_id:null,origen_generacion:'MANUAL',lote_nomina_id:null,reemplaza_cheque_id:null});
 ins('descuentos',{id:id('s'),trabajador_id:W[7].id,obra_id:O1,tipo:'INFONAVIT',motivo:null,monto:0,recurrente:true,semana:null,activo:false,creado_por:null,actualizado_por:null,created_at:ts(8),updated_at:ts(9),excepciones:[],periodicidad:null,cuota_mensual:1234.5678,modalidad:'VSM',factor:12.3456,
  recalculo_auto:null,ultimo_recalculo:null,numero_credito:'0012345678',fonacot_prorrateo:'NINGUNO',ajustes_semana:{},fonacot_prorrateo_desde:null,infonavit_avisos_historial:[],calendario_evento_id:null,__txt:{monto:'0.00',cuota_mensual:'1234.5678',factor:'12.3456'}});
 const cad=id('z');
 ins('control_faltas_historicas',{id:id('z'),cadena_id:cad,version:1,anterior_id:null,estado:'SUSTITUIDA',empresa_codigo:'PLATINUM',obra_id:O1,trabajador_id:W[8].id,ejercicio:2026,tramo_inicio:null,modo:'TOTAL_AL_CORTE',rango_desde:'2026-04-01',fecha_corte:'2026-06-30',fechas:[],total_acreditado:8,digitales_al_registrar:3,naturaleza:'FALTA_INJUSTIFICADA',motivo:'LISTA',fuente:'PAPEL',referencia:'',soporte_archivo:null,clave_idempotencia:id('k'),actor_id:USUARIOS.admin.id,actor_email:'a',created_at:ts(70),cerrado_por:null,cerrado_en:ts(71),motivo_cierre:'CORREGIDO',huella:'h1'});
 ins('control_faltas_historicas',{id:id('z'),cadena_id:cad,version:2,anterior_id:db.control_faltas_historicas[0].id,estado:'VIGENTE',empresa_codigo:'PLATINUM',obra_id:O1,trabajador_id:W[8].id,ejercicio:2026,tramo_inicio:null,modo:'FECHAS',rango_desde:'2026-04-01',fecha_corte:'2026-06-30',fechas:['2026-04-07','2026-05-05'],total_acreditado:null,digitales_al_registrar:3,naturaleza:'FALTA_INJUSTIFICADA',motivo:'LISTA',fuente:'PAPEL',referencia:'',soporte_archivo:null,clave_idempotencia:id('k'),actor_id:USUARIOS.admin.id,actor_email:'a',created_at:ts(71),cerrado_por:null,cerrado_en:null,motivo_cierre:null,huella:'h2'});
 ins('incidencias_empleados',{id:id('i'),obra_id:O1,empleado_id:W[9].id,fecha_aplicacion:'2026-05-05',id_incidencia:2,percepcion_id:null,prestamo_id:null,credito_id:null,clase:'AUSENCIA',naturaleza_importe:null,pagador:null,ramo:null,folio:null,monto_valor:0,semana_origen:6,semana_aplicacion:6,desde_origen:'2026-05-05',hasta_origen:'2026-05-05',desde_aplicacion:'2026-05-05',hasta_aplicacion:'2026-05-05',retroactivo:false,estado:'APLICADO',descuento_id:null,detalle:{},clave_idempotencia:id('k'),firma_solicitud:'f',version:1,creado_por:USUARIOS.admin.id,created_at:ts(36),updated_at:ts(36)});
 ins('incidencias_empleados',{id:id('i'),obra_id:O1,empleado_id:W[9].id,fecha_aplicacion:'2026-05-12',id_incidencia:9,percepcion_id:null,prestamo_id:null,credito_id:null,clase:'INCAPACIDAD',naturaleza_importe:null,pagador:'IMSS',ramo:'EG',folio:'AB123',monto_valor:0,semana_origen:7,semana_aplicacion:7,desde_origen:'2026-05-12',hasta_origen:'2026-05-14',desde_aplicacion:'2026-05-12',hasta_aplicacion:'2026-05-14',retroactivo:false,estado:'APLICADO',descuento_id:null,detalle:{dx:'SENSIBLE'},clave_idempotencia:id('k'),firma_solicitud:'f',version:1,creado_por:USUARIOS.admin.id,created_at:ts(37),updated_at:ts(37)});
 ins('sueldos_internos',{trabajador_id:W[10].id,obra_id:O1,sueldo_imss:3500,sueldo_real:4200.5,notas:null,actualizado_por:null,updated_at:ts(5)});
 const caso=ins('control_casos_imss',{id:id('m'),obra_id:O1,trabajador_id:W[9].id,incidente_id:null,tipo_caso:'ENFERMEDAD',fecha_evento:'2026-05-12',ramo_certificado:'EG',tipo_certificado:'INICIAL',probable_riesgo_trabajo:false,calificacion_rt:'NO_APLICA',certificado_desde:'2026-05-12',certificado_hasta:'2026-05-14',dias_certificados:3,folio_certificado:'AB123',folio_st7:null,folio_st9:null,folio_st2:null,referencia_evidencia:null,observaciones_operativas:null,estado:'ABIERTO',creado_por:null,created_at:ts(37),updated_at:ts(37),eliminado_en:null,eliminado_por:null,motivo_eliminacion:null,certificado_archivo:null,certificado_mime:null,datos_documento:null,extraccion_modelo:null,extraccion_revisada_en:null});
 ins('control_casos_imss_semanas',{id:id('m'),caso_id:caso.id,anio:2026,semana:7,dias_pagados_empresa:0,dias_sin_salario_patronal:3,descuento_id:null,neto_noi:null,estado:'PENDIENTE',nota:null,created_at:ts(37),updated_at:ts(37),detalle_dias:null,dias_imss_estimados:3,dias_sin_subsidio:0});
 ins('control_cierres_eliminados',{id:id('c'),obra_id:O1,semana:3,periodo:'SEMANAL',estado_anterior:'BORRADOR',snapshot_sha256:'x',cierre:{a:1},conciliacion:[],cheques_vinculados:[],motivo:'DUPLICADO',actor_id:USUARIOS.admin.id,actor_email:'admin@prueba.test',eliminado_en:ts(28)});
 ins('control_documentos_cumplimiento',{id:id('g'),obra_id:O1,tipo:'REPSE',titulo:'Registro',tercero:null,folio:'0007',fecha_emision:'2026-01-01',fecha_vencimiento:'2027-01-01',alerta_dias:30,
  evidencia_url:'https://proyecto.supabase.co/storage/v1/object/sign/expedientes/a.pdf?token=eyJFICTICIO',responsable:null,estado_manual:'VIGENTE',observaciones:null,creado_por:USUARIOS.admin.id,creado_por_email:'a',created_at:ts(1),updated_at:ts(1)});
 const lote=ins('control_aguinaldo_lotes',{id:id('l'),operacion_id:id('k'),empresa_codigo:'PLATINUM',ejercicio:2026,parametros:{dias_pactados:15},reglas_version:'R',motor_version:'M',total_bruto:3000,total_isr:10.5,total_neto:2989.5,lineas:1,actor_id:USUARIOS.admin.id,actor_email:'a',created_at:ts(200),huella:'h'});
 ins('control_aguinaldo_lineas',{id:id('l'),lote_id:lote.id,obra_id:O1,empresa_codigo:'PLATINUM',trabajador_id:W[11].id,identidad:'CURP',ejercicio:2026,periodicidad:'SEMANAL',semana:37,periodo_desde:'2026-12-07',periodo_hasta:'2026-12-13',fecha_pago:'2026-12-11',salario_base:500,dias_pactados:15,dias_computables:212,denominador:365,bruto_causado:4356.16,acreditado_previo:0,bruto:4356.16,exento:3519.3,gravado:836.86,isr:149.96,neto:4206.2,metodo_isr:'ART96',uma:117.31,exento_usado:0,desglose:{fiscal:{isr:149.96}},huella_fuentes:'H',estado:'APLICADO',version:1,retirado_por:null,retirado_en:null,motivo_retiro:null,created_at:ts(200)});
 const re=ins('reuniones_entrega_cheques',{id:id('r'),empresa_codigo:'PLATINUM',fecha_hora:ts(40),lugar:'OFICINA',responsable:'R',estado:'CERRADA',notas:null,creada_por:USUARIOS.admin.id,creada_por_email:'a',cerrada_por:null,cerrada_por_email:null,cerrada_en:null,created_at:ts(40),updated_at:ts(41)});
 ins('reuniones_entrega_cheques',{id:id('r'),empresa_codigo:'JIRE',fecha_hora:ts(40),lugar:'OFICINA',responsable:'R',estado:'ABIERTA',notas:null,creada_por:USUARIOS.admin.id,creada_por_email:'a',cerrada_por:null,cerrada_por_email:null,cerrada_en:null,created_at:ts(40),updated_at:ts(41)});
 ins('reunion_cheques_entrega',{id:id('r'),reunion_id:re.id,cheque_id:db.cheques[1].id,origen:'MANUAL',entregado:true,entregado_en:ts(41),entregado_por:null,entregado_por_email:null,activo:true,liberado_en:null,observaciones:null,created_at:ts(41),updated_at:ts(41)});
 const imp=ins('infonavit_avisos_importaciones',{id:id('n'),empresa_codigo:'PLATINUM',registro_patronal:'A1234567101',archivo_nombre:'avisos.zip',archivo_sha256:'s',fecha_corte:'2026-05-01T00:00:00',avisos:[{folio:'1'}],comparacion:{},estado:'CONFIRMADA',creado_por:USUARIOS.admin.id,creado_en:ts(45)});
 ins('infonavit_avisos_archivos',{importacion_id:imp.id,contenido:'\\x504b0304'});
 ins('historial_automatizaciones',{id:id('t'),proceso:'RECALCULO',resultado:'OK',mensaje:null,afectados:1,revisados:2,bimestre:'2026-3',detalle:{},ejecutado_por:'sistema',created_at:ts(46)});
 ins('platinum_internal.bajas_operaciones',{id:id('u'),obra_id:O1,trabajador_id:W[12].id,inicio_ciclo:'2026-04-06',fecha_baja:'2026-06-30',actor:USUARIOS.admin.id,firma_solicitud:'f',resultado:{finiquito:1234.5},created_at:ts(90)});
 ins('platinum_internal.bajas_operaciones',{id:id('u'),obra_id:O3,trabajador_id:db.trabajadores.find(w=>w.obra_id===O3).id,inicio_ciclo:'2026-04-06',fecha_baja:'2026-06-30',actor:USUARIOS.admin.id,firma_solicitud:'f',resultado:{},created_at:ts(90)});
 ins('platinum_internal.excepciones_noi_individuales',{id:id('u'),cierre_id:cierre.id,trabajador_id:W[5].id,archivo_sha256:'s',neto_original:3200.15,nomina_transferencia:3000,finiquito_efectivo:200.15,pago_nomina_id:null,autorizacion_origen:'CORREO',autorizacion_texto:'AUTORIZADO',registrado_en:ts(95)});
 const imb=ins('control_importaciones_bancarias',{id:id('j'),obra_id:O1,empresa_codigo:'PLATINUM',contexto:{banco:'BANAMEX'},nombre:'estado.pdf',sha256:'abc',ruta:O1+'/banco/estado.pdf',tamano:1024,mime:'application/pdf',padre_id:null,paginas:['1','2'],estado:'APLICADO',propuesta:{filas:2},revision:1,error:null,creado_por:USUARIOS.admin.id,created_at:ts(60),updated_at:ts(61)});
 ins('control_banco_resoluciones',{id:id('j'),archivo_id:imb.id,fila:1,operacion_id:id('k'),obra_id:O1,trabajador_id:W[5].id,pago_id:db.pagos[0].id,obligacion_id:null,cheque_id:null,aplicacion_id:null,estado:'RESUELTA',revision:1,propuesta:{},resultado:{},actor_id:USUARIOS.admin.id,created_at:ts(61),updated_at:ts(61)});
 ins('control_aguinaldo_conciliaciones',{id:id('j'),operacion_id:id('k'),empresa_codigo:'PLATINUM',obra_id:O1,trabajador_id:W[12].id,ejercicio:2026,fecha_baja:'2026-06-30',version:1,anterior_id:null,estado:'VIGENTE',estado_operacion:'CONCILIADO',importe_bruto:1234.56,exento:1234.56,fecha_pago:'2026-07-03',fuente_clave:'F1',respaldo_clave:'R1',motivo:'BAJA',referencia:'',fuente:{a:1},respaldo:{b:2},firma_solicitud:'f',actor_id:USUARIOS.admin.id,actor_email:'a',created_at:ts(92)});
 ins('control_puestos_catalogo',{clave:7,descripcion:'AYUDANTE',activo:true,referencia:null,revision:1,updated_at:ts(1),actor_id:null});
 ins('control_puestos_equivalencias',{empresa:'PLATINUM',variante:'AYUDANTE GRAL',especialidad:'',clave:7,referencia:null,revision:1,updated_at:ts(1),actor_id:null});
 Object.assign(db.pagos[0],{banco_contexto:{archivo:imb.id,fila:1},banco_operacion_clave:'000123'});
 ins('control_bitacora',{id:id('t'),obra_id:O1,modulo:'CIERRE_NOMINA',accion:'AUTORIZAR',entidad_tipo:'control_cierres_nomina',entidad_id:cierre.id,detalle:{antes:{estado:'REVISADO'},despues:{estado:'AUTORIZADO'}},actor_id:USUARIOS.admin.id,actor_email:'a',created_at:ts(31)});
 for(const t of Object.keys(db))for(const r of db[t])if(r.__txt===undefined)Object.defineProperty(r,'__txt',{value:undefined,enumerable:false,writable:true});
 for(const t of Object.keys(db))for(const r of db[t])if(r.__txt)Object.defineProperty(r,'__txt',{value:r.__txt,enumerable:false,writable:true});
 return db;
}

// ---------- Supabase simulado ----------
const PERM=Object.fromEntries(FUENTES.map(f=>[f.clave,f.permiso]));
const TABLA=Object.fromEntries(FUENTES.map(f=>[f.clave,f.alcance==='interna'?'platinum_internal.'+f.clave:f.tabla]));
function servidor(db,usuario,op={}){
 const u=USUARIOS[usuario],vis=id=>{const o=db.obras.find(x=>x.id===id);return !!o&&(u.vip||(u.empresas.includes(o.empresa_codigo)&&(!u.obras.length||u.obras.includes(id))));};
 const aus=new Set(db.catalogo_incidencias.filter(c=>c.clase==='AUSENTISMO').map(c=>c.id));
 const prevision=new Set((db.control_obligaciones_pago||[]).filter(o=>o.tipo==='PREVISION_SOCIAL').map(o=>o.id));
 // Regla del servidor (espejo del catálogo SQL) para MARCAS y LEER.
 const regla=(clave,c)=>{
  const enO=r=>c.obras.has(r.obra_id);
  switch(clave){
   case 'obras':return r=>c.obras.has(r.id);
   case 'contratistas':return r=>enO(r)||(u.vip&&r.obra_id==null);
   case 'trabajadores':case 'cheques':return r=>enO(r)&&(u.admin||!r.eliminado);
   case 'rrhh_procesos':return r=>enO(r)&&(r.tipo!=='INCAPACIDAD'||u.salud);
   case 'incidencias_empleados':return r=>enO(r)&&(u.salud||r.id_incidencia==null||aus.has(r.id_incidencia));
   case 'control_obligaciones_pago':return r=>enO(r)&&(u.vip||r.tipo!=='PREVISION_SOCIAL');
   case 'control_pago_aplicaciones':return r=>enO(r)&&(u.vip||!prevision.has(r.obligacion_id));
   case 'control_aguinaldo_lotes':return r=>(db.control_aguinaldo_lineas||[]).some(l=>l.lote_id===r.id&&c.obras.has(l.obra_id));
   case 'reuniones_entrega_cheques':case 'infonavit_avisos_importaciones':return r=>r.empresa_codigo===c.empresa;
   case 'reunion_cheques_entrega':case 'reunion_bloques_cheques':return r=>(db.reuniones_entrega_cheques||[]).some(x=>x.id===r.reunion_id&&x.empresa_codigo===c.empresa);
   case 'infonavit_avisos_archivos':return r=>(db.infonavit_avisos_importaciones||[]).some(x=>x.id===r.importacion_id&&x.empresa_codigo===c.empresa);
   case 'control_casos_imss_semanas':return r=>(db.control_casos_imss||[]).some(x=>x.id===r.caso_id&&c.obras.has(x.obra_id));
   case 'excepciones_noi_individuales':case 'correcciones_centavos_aprobadas':return r=>(db.control_cierres_nomina||[]).some(x=>x.id===r.cierre_id&&c.obras.has(x.obra_id));
   case 'estado_conciliacion_nomina':return r=>enO(r)&&(r.cierre_id!=null||u.admin);
   case 'config':return r=>Object.keys(T.CONFIG_PERMITIDA(c.empresa)).includes(r.clave);
   case 'control_puestos_catalogo':case 'control_puestos_equivalencias':case 'catalogo_incidencias':case 'catalogo_percepciones_extra':case 'puesto_sinonimos':case 'rrhh_plantillas':case 'folios_cheque':case 'historial_automatizaciones':case 'app_usuarios':case 'control_permisos_cheques':return ()=>true;
   default:return enO;
  }
 };
 const permitida=p=>!p||(p==='vip'&&u.vip)||(p==='salud'&&u.salud)||(p==='admin'&&u.admin)||(p==='admin_vip'&&u.admin&&u.vip)||(p==='vip_salud'&&u.vip&&u.salud);
 const alcance=d=>{const pedidas=d.obras||[];const obras=db.obras.filter(o=>o.empresa_codigo===d.empresa&&vis(o.id)&&(!pedidas.length||pedidas.includes(o.id))).map(o=>o.id).sort();
  return {empresa:d.empresa,obras:new Set(obras),lista:obras,rechazadas:pedidas.filter(x=>!obras.includes(x))};};
 const filasDe=(clave,c)=>(db[TABLA[clave]]||[]).filter(regla(clave,c));
 const FECHAS={updated_at:'updated_at',created_at:'created_at'};
 let llamadasMarcas=0;
 const rpc=async(fn,args)=>{
  if(op.sinRpc&&fn==='control_respaldo')return {data:null,error:{code:'PGRST202',message:'Could not find the function public.control_respaldo(p_accion, p_datos)'}};
  if(fn==='control_puede_ver_salud')return {data:u.salud,error:null};
  if(fn!=='control_respaldo')return {data:null,error:{message:'rpc inesperada '+fn}};
  const d=args.p_datos,c=alcance(d);
  if(!u.empresas.includes(d.empresa)&&!u.vip)return {data:null,error:{code:'42501',message:'Sin permiso para esta razón social'}};
  if(args.p_accion==='MARCAS'){
   if(op.timeoutMarcas&&op.timeoutMarcas(d.fuentes))return {data:null,error:{code:'57014',message:'canceling statement due to statement timeout'}};
   llamadasMarcas++;op.antesDeMarcas&&op.antesDeMarcas(llamadasMarcas,db);
   const marcas={},columnas={};
   for(const k of d.fuentes){
    if(!permitida(PERM[k])){marcas[k]={omitida:'PERMISO_'+String(PERM[k]).toUpperCase()};continue;}
    const fs_=filasDe(k,c),max=campo=>fs_.reduce((m,x)=>x[campo]&&String(x[campo])>m?String(x[campo]):m,'')||null;
    const huella=crypto.createHash('md5').update(fs_.map(x=>JSON.stringify(x)).sort().join('|')).digest('hex');
    const por_obra={};for(const x of fs_)if(x.obra_id)por_obra[x.obra_id]=(por_obra[x.obra_id]||0)+1;
    if(k==='obras')for(const x of fs_)por_obra[x.id]=1;
    marcas[k]={tipo:'COMPLETA',filas:fs_.length,max_actualizado:max('updated_at'),max_creado:max('created_at'),huella,por_obra};
    if(d.columnas)columnas[k]=columnasDe(TABLA[k]);
   }
   return {data:{version:'RESPALDO_MARCAS_V1',generado_en:new Date(Date.UTC(2026,10,11,18,0,llamadasMarcas)).toISOString(),empresa:d.empresa,obras:c.lista,obras_rechazadas:c.rechazadas,
    permisos:{registrado:true,vip:u.vip,salud:u.salud,admin:u.admin},desconocidas:[],marcas,columnas:d.columnas?columnas:null},error:null};
  }
  if(args.p_accion==='LEER'){
   const k=d.fuente;if(!TABLA[k]||!TABLA[k].startsWith('platinum_internal.'))return {data:null,error:{message:'Fuente no válida'}};
   if(!permitida(PERM[k]))return {data:null,error:{code:'42501',message:'requiere permiso'}};
   const llave=FUENTES.find(f=>f.clave===k).pk[0],lim=Math.min(d.limite||500,1000);
   const fs_=filasDe(k,c).slice().sort((a,b)=>String(a[llave]).localeCompare(String(b[llave]))).filter(x=>!d.despues||String(x[llave])>d.despues).slice(0,lim);
   return {data:{fuente:k,filas:JSON.parse(JSON.stringify(fs_)),siguiente:fs_.length===lim?fs_[lim-1][llave]:null},error:null};
  }
  return {data:null,error:{message:'Acción no válida'}};
 };
 // RLS del cliente (espejo de pg_policies) y cadena de PostgREST.
 const rls=(tabla,r)=>{
  if(tabla.startsWith('platinum_internal.'))return false;
  if(tabla==='obras')return vis(r.id);
  if(tabla==='sueldos_internos')return u.vip;
  if(['control_casos_imss','control_st7_acuses'].includes(tabla))return u.salud&&vis(r.obra_id);
  if(tabla==='control_cierres_eliminados')return u.admin&&vis(r.obra_id);
  if(tabla==='incidencias_empleados')return vis(r.obra_id)&&(r.id_incidencia==null||aus.has(r.id_incidencia)||u.salud);
  if(tabla==='app_usuarios')return r.user_id===u.id||u.vip;
  if(tabla==='contratistas')return u.vip||vis(r.obra_id);
  if('obra_id' in r)return u.vip||vis(r.obra_id);
  return true;
 };
 const valor=(r,k)=>{const v=r[k];return v===undefined?undefined:v;};
 const proyectar=(r,sel)=>{
  if(sel==='*')return JSON.parse(JSON.stringify(r));
  const out={};
  for(const tok of sel.split(',')){
   if(tok==='*'){Object.assign(out,JSON.parse(JSON.stringify(r)));continue;}
   const m=/^(\w+):(\w+)::text$/.exec(tok);
   if(m){const v=r[m[2]];out[m[1]]=v==null?null:(r.__txt&&r.__txt[m[2]]!==undefined?r.__txt[m[2]]:String(v));continue;}
   out[tok]=r[tok]===undefined?null:JSON.parse(JSON.stringify(r[tok]));
  }
  return out;
 };
 const llamadas=[];
 const from=tabla=>{
  const filtros=[],orden=[];let sel='*';
  const q={select(s){sel=s;return q;},in(k,vs){filtros.push(r=>vs.includes(valor(r,k)));return q;},eq(k,v){filtros.push(r=>valor(r,k)===v);return q;},neq(k,v){filtros.push(r=>valor(r,k)!==v);return q;},
   is(k,v){filtros.push(r=>valor(r,k)==null);return q;},
   or(s){const m=/^obra_id\.in\.\(([^)]*)\),obra_id\.is\.null$/.exec(s);assert.ok(m,'filtro or no soportado: '+s);const ids=m[1].split(',');filtros.push(r=>r.obra_id==null||ids.includes(r.obra_id));return q;},
   order(k){orden.push(k);return q;},
   range(a,b){
    llamadas.push({tabla,a});
    const f=op.falla&&op.falla(tabla,a);
    if(f)return Promise.resolve({data:null,error:{code:'XX000',message:'falla simulada en '+tabla+' desde '+a}});
    let rows=(db[tabla]||[]).filter(r=>rls(tabla,r)&&filtros.every(fn=>fn(r)));
    rows=rows.slice().sort((x,y)=>{for(const k of orden){const p=x[k],s=y[k];if(p===s)continue;return typeof p==='number'&&typeof s==='number'?p-s:String(p).localeCompare(String(s));}return 0;});
    return Promise.resolve({data:rows.slice(a,b+1).map(r=>proyectar(r,sel)),error:null});
   }};
  return q;
 };
 // Fuente esperada (verdad del servidor) para el lector independiente.
 const esperado=(d,claves)=>{const c=alcance(d),out={};for(const k of claves){const f=FUENTES.find(x=>x.clave===k);
  const sel=f.alcance==='interna'?'*':(['prestaciones_fuentes_historicas','infonavit_avisos_archivos','app_usuarios'].includes(k)?null:'*');
  const fd=api=>api;out[k]=filasDe(k,c).map(r=>{
   if(k==='prestaciones_fuentes_historicas'||k==='infonavit_avisos_archivos'||k==='app_usuarios'){const cols=({prestaciones_fuentes_historicas:'obra_id,sha256,archivo,created_at',infonavit_avisos_archivos:'importacion_id',app_usuarios:'user_id,email,nombre,rol,activo,full_access,puede_escribir,puede_eliminar,solo_contratos,empresas_permitidas,obras_permitidas,areas_permitidas,created_at,updated_at'})[k];return proyectar(r,cols);}
   const extra=(PRECISION[k]||[]).map(c2=>c2+'__origen:'+c2+'::text');return proyectar(r,['*',...extra].join(','));});
 }return out;};
 return {sb:{from,rpc},esperado,llamadas,get marcas(){return llamadasMarcas;}};
}
const PRECISION={trabajadores:['sd','sdi','sal_semanal','prima_rt','monto_finiquito','benef_porcentaje'],obras:['prima_rt'],sueldos_internos:['sueldo_imss','sueldo_real'],diferenciales:['monto'],control_altas_bajas_cortas:['neto_noi','faltas_modelo_noi','dias_pagados_noi'],
 descuentos:['monto','cuota_mensual','factor'],incidencias_empleados:['monto_valor'],control_faltas_historicas:['total_acreditado','digitales_al_registrar'],control_aguinaldo_lineas:['salario_base','dias_pactados','dias_computables','bruto_causado','acreditado_previo','bruto','exento','gravado','isr','neto','uma','exento_usado'],
 auditoria_calculos_nomina:['monto_modelo','monto_aplicado','ajuste_noi'],control_conciliacion_noi:['monto_platinum','monto_noi','diferencia'],control_desglose_noi:['percepciones','isr','imss','subsidio','total_deducciones','neto','ajuste_origen']};

// ---------- ejecución de escenarios ----------
const OBRAS_CAT=()=>[{id:O1,nombre:'CENTRO DE TRABAJO CON NOMBRE MUY LARGO NORTE',empresa_codigo:'PLATINUM',activa:true},{id:O2,nombre:'CENTRO DE TRABAJO CON NOMBRE MUY LARGO SUR',empresa_codigo:'PLATINUM',activa:false},{id:O3,nombre:'OBRA JIRE',empresa_codigo:'JIRE',activa:true}];
async function correr(nombre,db,usuario,opS={},opE={}){
 const srv=servidor(db,usuario,opS),dir=path.join(salida,nombre);fs.mkdirSync(dir,{recursive:true});
 const archivos=[],registros=[];
 const t0=Date.now();
 const r=await API.exportar({sb:srv.sb,XLSX,JSZip,obrasCatalogo:OBRAS_CAT(),empresa:'PLATINUM',espera:0,marca:false,versionApp:'2026-11-11.0',reloj:()=>new Date('2026-11-11T18:00:00Z'),
  registrar:async(wb,nom)=>{registros.push({nom,hojas:wb.SheetNames.length,obras:wb.__auditObraIds});},
  descargar:async(bytes,nom)=>{const p=path.join(dir,nom);fs.writeFileSync(p,Buffer.from(bytes));archivos.push(p);},...opE});
 const ms=Date.now()-t0;
 return {r,ms,archivos,registros,srv,dir};
}
function verificar(res,db,usuario,opE,etiqueta){
 const py=spawnSync('python3',['-c','import openpyxl'],{encoding:'utf8'});
 if(py.status!==0){console.log('AVISO: python3/openpyxl no disponible; se omite el lector independiente ('+etiqueta+').');return null;}
 const claves=Object.entries(res.r.fuentes).filter(([k,v])=>v.estado==='LEIDA').map(([k])=>k);
 const fuentes=res.srv.esperado({empresa:'PLATINUM',obras:opE.obras||[]},claves);
 const j=path.join(res.dir,'fuentes.json');fs.writeFileSync(j,JSON.stringify({fuentes,precision:PRECISION}));
 const t0=Date.now(),p=spawnSync('python3',['-I',path.join(__dirname,'verificar_respaldo_xlsx.py'),'--fuentes',j,...res.archivos],{encoding:'utf8',maxBuffer:64e6});
 if(p.status!==0){console.error(p.stdout.slice(-4000),p.stderr.slice(-4000));}
 assert.equal(p.status,0,'lector independiente '+etiqueta);n++;
 const rep=JSON.parse(p.stdout);rep.ms=Date.now()-t0;return rep;
}
const libro=archivo=>XLSX.read(fs.readFileSync(archivo),{type:'buffer'});
const hoja=(wb,nom)=>XLSX.utils.sheet_to_json(wb.Sheets[nom],{defval:undefined,raw:true});
const manif=wb=>hoja(wb,'MANIFIESTO');

(async()=>{
 const V=process.env.RESPALDO_VOLUMEN==='produccion'?480:120;
 const medidas=[];
 // 1) Administrador, volumen representativo, con configuración explícita.
 let db=crearBase(V);
 const tot=Object.values(db).reduce((s,x)=>s+x.length,0);
 let res=await correr('admin',db,'admin',{},{incluirConfiguracion:true});
 eq([res.r.estado,res.r.motivos],['COMPLETO',[]],'respaldo completo del administrador');
 eq(res.archivos.length,1,'un archivo');ok(/^RESPALDO_INTEGRAL_V1_PLATINUM_2026-11-11_\d{4}\.xlsx$/.test(path.basename(res.archivos[0])),'nombre versionado');
 eq(res.registros.length,1,'registra la exportación en bitácora');eq(res.registros[0].obras.sort(),[O1,O2].sort(),'bitácora con los centros respaldados');
 let wb=libro(res.archivos[0]);
 const hist=hoja(wb,'HISTORIAL');ok(hist.length>500&&hist.length===db.historial.filter(h=>h.obra_id!==O3).length,'historial completo (>500 eventos), sin límite silencioso');
 ok(hist.every(h=>typeof h.id==='string'),'IDs bigint de historial como texto');
 const padron=hoja(wb,'PADRON'),w2=db.trabajadores.filter(w=>w.obra_id===O1)[1],p2=padron.find(x=>x.id===w2.id);
 eq([p2.clabe,p2.cuenta,p2.nss,p2.cp,p2.segundo_apellido,p2.correo,p2.monto_finiquito],['002180700123456789','0001234567','01234567890','01000',undefined,'∅ NULL',0],'ceros iniciales, vacío, nulo y cero');
 eq([p2.observaciones,p2.funciones,p2.beneficiario,p2.escolaridad,p2.direccion],['=HYPERLINK("http://example.test","clic")','+52 55 0000','-5','@SUMA','∅∅ NULL'],'cadenas con = + - @ y ∅ quedan como texto');
 const ws=wb.Sheets.PADRON,cOb=Object.keys(ws).find(k=>ws[k].v==='observaciones');ok(Object.values(ws).every(c=>!c||!c.f),'ninguna fórmula en el padrón');
 eq([p2.sdi,p2.sdi__origen,p2.sd__origen],[524.6575,'524.657500','500.00'],'precisión de origen como texto adicional');
 ok(padron.some(x=>x.eliminado===true),'el administrador respalda la papelera con su estado');
 eq(padron.find(x=>x.id===db.trabajadores.filter(w=>w.obra_id===O1)[0].id).fecha_reingreso,'2026-08-03','fecha_reingreso vigente en el padrón');
 const mov=hoja(wb,'MOVIMIENTOS_LABORALES'),m1=mov.filter(x=>x.trabajador_id===db.trabajadores.filter(w=>w.obra_id===O1)[0].id);
 eq(m1.map(x=>[x.ciclo,x.tipo_evento,x.fecha_efectiva,x.fuente]),[[1,'ALTA','2026-04-06','HISTORIAL'],[1,'BAJA','2026-05-10','HISTORIAL'],[2,'REINGRESO','2026-06-01','HISTORIAL'],[2,'BAJA','2026-07-15','HISTORIAL'],[3,'REINGRESO','2026-08-03','HISTORIAL']]
  .map(x=>x),'reingresos múltiples: un evento por movimiento con su fecha y ciclo; la fecha vigente no sustituye la anterior');
 const rev=db.control_reversiones_baja[0],mr=mov.find(x=>x.historial_id===String(rev.historial_id));
 eq([mr.tipo_evento,mr.revertida,mr.reversion_id],['BAJA','SI',rev.id],'baja revertida señalada en movimientos');
 ok(hist.some(h=>h.id===String(rev.historial_id)&&h.accion==='BAJA'),'el historial crudo conserva la baja revertida');
 eq(padron.find(x=>x.id===rev.trabajador_id).bajas_revertidas,1,'padrón con conteo de bajas revertidas');
 eq(hoja(wb,'PAGOS').find(x=>x.id===db.pagos[0].id).banco_operacion_clave,'000123','columna nueva de pagos como texto');
 ok(['REVERSIONES_BAJA','BANCO_RESOLUCIONES','IMPORTACIONES_BANCO','AGUINALDO_CONCILIACION','CAT_PUESTOS_CLAVE','CAT_PUESTOS_EQUIV'].every(h=>wb.SheetNames.includes(h)),'tablas nuevas de producción respaldadas');
 const w4=db.trabajadores.filter(w=>w.obra_id===O1)[3];
 eq(mov.filter(x=>x.trabajador_id===w4.id&&x.tipo_evento==='REINGRESO').map(x=>[x.fecha_efectiva,x.fuente,x.evidencia]),[['2026-09-01','PADRON_VIGENTE','SOLO_PADRON_VIGENTE']],'reingreso sin evento: se conserva y se marca la limitación');
 const largos=hoja(wb,'TEXTOS_LARGOS');ok(largos.length>=3,'textos largos en partes');
 const obsL=padron.find(x=>x.id===db.trabajadores.filter(w=>w.obra_id===O1)[4].id).observaciones;ok(/^∅ TEXTO_LARGO ref=TL\d{6} partes=2 longitud=40003$/.test(obsL),'marca de texto largo');
 const ref=obsL.split(' ')[2].slice(4);eq(largos.filter(x=>x.ref===ref).sort((a,b)=>a.parte-b.parte).map(x=>x.fragmento).join(''),'L'.repeat(40000)+'FIN','texto largo recuperable');
 const nombres=wb.SheetNames;ok(nombres.includes('CENTRO DE TRABAJO CON NOMBRE MU')&&nombres.filter(x=>x.startsWith('CENTRO DE TRABAJO CON NOMBR')).length===2,'hojas por centro con mismo prefijo: únicas y ≤31');
 ok(nombres.every(x=>x.length<=31)&&new Set(nombres.map(x=>x.toLowerCase())).size===nombres.length,'nombres de hoja válidos y únicos');
 const leg=hoja(wb,'CENTRO DE TRABAJO CON NOMBRE MU'),encLeg=XLSX.utils.sheet_to_json(wb.Sheets['CENTRO DE TRABAJO CON NOMBRE MU'],{header:1})[0];
 eq(encLeg.slice(0,3).concat(encLeg.slice(-3)),['CONTRATISTA','ESTATUS','NO. TRAB.','DOCS ENTREGADOS','FECHA REINGRESO','ID TRABAJADOR'],'hoja V0 con columnas originales y agregados al final');
 ok(leg.every(x=>x['ID TRABAJADOR']!==db.trabajadores.filter(w=>w.obra_id===O1)[2].id),'V0 sin papelera, como antes');
 const fv=hoja(wb,'FALTAS_HISTORICAS');eq(fv.map(x=>[x.version,x.estado]).sort(),[[1,'SUSTITUIDA'],[2,'VIGENTE']],'versiones de faltas históricas');
 eq(hoja(wb,'CIERRE_VERSIONES').length,2,'versiones de cierre');
 const ap=hoja(wb,'APLICACIONES');ok(ap.some(x=>x.retirado_en&&x.retirado_en!=='∅ NULL'),'aplicaciones retiradas con su estado');
 const cfg=hoja(wb,'CONFIGURACION');ok(cfg.length>0&&cfg.every(x=>!['correo_creados','admin_papelera'].includes(x.clave))&&!cfg.some(x=>x.campo==='token'),'configuración explícita sin credenciales');
 const todo=JSON.stringify(Object.values(wb.Sheets).map(s=>Object.values(s).map(c=>c&&c.v)));ok(!todo.includes('CLAVE_FICTICIA_NO_USAR')&&!todo.includes('NO_DEBE_SALIR')&&!todo.includes('token=eyJ'),'sin credenciales ni URLs firmadas en el libro');
 ok(hoja(wb,'ACCESOS').every(x=>!('notas' in x)),'accesos con campos explícitos');
 ok(hoja(wb,'INFONAVIT_ARCHIVOS').every(x=>!('contenido' in x)),'sin archivos incrustados');
 const M=manif(wb);
 ok(M.some(x=>x.SECCION==='CAMPO_OMITIDO'&&x.CLAVE==='INFONAVIT_ARCHIVOS.contenido'),'manifiesto declara campos no exportados');
 ok(M.some(x=>x.SECCION==='GENERAL'&&x.CLAVE==='originales'&&/Storage privado/.test(x.VALOR)),'manifiesto declara originales en Storage privado');
 ok(M.some(x=>x.SECCION==='EXCLUSION'),'exclusiones visibles con motivo');
 ok(M.filter(x=>x.SECCION==='FUENTE').length>=70,'manifiesto por fuente');
 ok(M.some(x=>x.SECCION==='FUENTE_MARCA'&&x.CLAVE==='documentos'&&x.VALOR==='COMPLETA'&&/cualquier alta, baja o edición/.test(x.DETALLE)),'manifiesto: tipo de marca y alcance de detección por fuente');
 const ctl=hoja(wb,'CONTROL');
 const cp=ctl.find(x=>x.FUENTE==='pagos'&&x.OBRA_ID==='(TOTAL)');eq([cp.FILAS_EXPORTADAS,cp.FILAS_SERVIDOR,cp.COINCIDE],[db.pagos.filter(p=>p.obra_id!==O3).length,db.pagos.filter(p=>p.obra_id!==O3).length,'SI'],'control de pagos contra el servidor');
 eq(cp.TOTAL_CENTAVOS,String(db.pagos.filter(p=>p.obra_id!==O3).reduce((s,p)=>s+Math.round(p.importe*100),0)),'total al centavo');
 ok(ctl.some(x=>x.DOMINIO==='CUADRE_TABLERO'&&x.FUENTE.startsWith('PLATINUM_TABLERO_MODELO')),'cuadre con el modelo del tablero');
 const dic=hoja(wb,'DICCIONARIO');ok(dic.some(x=>x.HOJA==='PADRON'&&x.CAMPO==='clabe'&&x.TIPO==='TEXTO')&&dic.some(x=>x.HOJA==='APLICACIONES'&&x.CAMPO==='obligacion_id'&&x.RELACION==='OBLIGACIONES.id'),'diccionario con tipos y relaciones');
 const zip=await JSZip.loadAsync(fs.readFileSync(res.archivos[0]));const x1=await zip.file('xl/worksheets/sheet3.xml').async('string');
 ok(/<pane ySplit="1"[^>]*state="frozen"/.test(x1)&&/<autoFilter ref=/.test(x1),'encabezados inmovilizados y autofiltro');
 const rep1=verificar(res,db,'admin',{},'administrador');
 if(rep1){ok(rep1.ok&&rep1.hojas>=60&&rep1.filas>=tot*0.5,'lector independiente: conteos, claves, relaciones e importes');eq(rep1.urls_saneadas,1,'URL firmada saneada y contada');}
 medidas.push(['administrador',tot,res.ms,rep1?rep1.ms:null,res.r.archivos.reduce((s,a)=>s+a.bytes,0)]);

 // 2) División controlada: filas por hoja y capacidad por archivo.
 res=await correr('division',db,'admin',{},{limiteFilas:1001,presupuesto:2.5e6});
 eq(res.r.estado,'COMPLETO','división sin pérdida');ok(res.archivos.length>=2,'varios archivos por capacidad');
 wb=libro(res.archivos[0]);const Md=manif(wb);
 ok(Md.filter(x=>x.SECCION==='ARCHIVO').length===res.archivos.length,'el manifiesto lista todas las partes');
 const hHist=Md.filter(x=>x.SECCION==='HOJA'&&x.HOJA_LOGICA==='HISTORIAL');ok(hHist.length>=2&&hHist.every(x=>Number(x.VALOR)<=1000),'historial dividido en hojas de ≤ límite');
 eq(hHist.reduce((s,x)=>s+Number(x.VALOR),0),db.historial.filter(h=>h.obra_id!==O3).length,'las partes suman el total');
 const rep2=verificar(res,db,'admin',{},'división');if(rep2)ok(rep2.ok&&rep2.archivos===res.archivos.length,'lector independiente sobre todas las partes');

 // 3) Usuario restringido: su mismo alcance (un centro, sin salud, sin VIP, sin papelera).
 res=await correr('restringido',db,'restringido',{},{obras:[O1,O2]});
 eq(res.r.estado,'COMPLETO','respaldo del usuario restringido');eq(res.r.manifiestoBase.obras,[O1],'sólo su centro');
 wb=libro(res.archivos[0]);const Mr=manif(wb);
 ok(Mr.some(x=>x.SECCION==='CENTRO_EXCLUIDO'&&x.CLAVE==='Centro '+O2),'centro fuera de alcance declarado');
 ok(!wb.SheetNames.includes('SUELDOS_INTERNOS')&&!wb.SheetNames.includes('CASOS_IMSS')&&!wb.SheetNames.includes('BAJAS_OPERACIONES')&&!wb.SheetNames.includes('CIERRES_ELIMINADOS'),'sin hojas VIP, salud, internas ni papelera');
 ok(hoja(wb,'PADRON').every(x=>x.obra_id===O1&&x.eliminado===false),'padrón de su centro sin papelera');
 ok(hoja(wb,'INCIDENCIAS').every(x=>x.id_incidencia===2),'incidencias de salud excluidas');
 ok(hoja(wb,'OBLIGACIONES').every(x=>x.tipo!=='PREVISION_SOCIAL')&&!hoja(wb,'CIERRES').some(x=>'snapshot' in x||'total_prevision' in x),'previsión social y fotografías sólo VIP');
 ok(Mr.some(x=>x.SECCION==='CAMPO_OMITIDO'&&x.CLAVE==='CIERRES.snapshot'),'campo omitido por permiso declarado (distinto de vacío)');
 ok(Mr.some(x=>x.SECCION==='FUENTE'&&x.CLAVE==='sueldos_internos'&&x.VALOR==='OMITIDA_PERMISO'),'fuente omitida por permiso declarada');
 const cr=hoja(wb,'CONTROL').filter(x=>x.FUENTE==='trabajadores');ok(cr.every(x=>x.OBRA_ID===O1||x.OBRA_ID==='(TOTAL)')&&cr.every(x=>x.COINCIDE==='SI'),'conteos con el mismo alcance que el servidor');
 const rep3=verificar(res,db,'restringido',{obras:[O1,O2]},'restringido');if(rep3)ok(rep3.ok,'lector independiente con alcance restringido');

 // 4) Falla transitoria en una consulta intermedia: se reintenta y queda completo.
 let veces=1;res=await correr('transitoria',db,'admin',{falla:(t,a)=>t==='historial'&&a===1000&&veces-->0},{});
 eq(res.r.estado,'COMPLETO','falla transitoria recuperada');ok(res.r.fuentes.historial.reintentos>=1,'reintento registrado');
 // 5) Falla persistente: INCOMPLETO, visible, y reintento posterior completo.
 let romper=true;res=await correr('persistente',db,'admin',{falla:(t,a)=>romper&&t==='historial'&&a===1000},{});
 eq([res.r.estado,res.r.motivos.includes('ERROR_LECTURA'),res.r.fuentes.historial.estado],['INCOMPLETO',true,'ERROR'],'error intermedio → INCOMPLETO');
 ok(/_INCOMPLETO\.xlsx$/.test(res.archivos[0]),'el archivo se nombra INCOMPLETO');
 wb=libro(res.archivos[0]);ok(manif(wb).some(x=>x.SECCION==='ERROR'&&x.CLAVE==='historial'),'error visible en el manifiesto');
 romper=false;const otra=await res.r.reintentar();eq(otra.estado,'COMPLETO','el reintento completa el respaldo');

 // 6) Cambio concurrente una vez: se detecta por marcas y se relee.
 const extra=()=>({id:U('p',900000+Math.floor(Math.random()*99999)),obra_id:O1,trabajador_id:db.trabajadores[0].id,semana:'S9',medio:'TRANSFERENCIA',banco:null,cuenta_mask:null,titular:null,importe:1,estado:'PAGADO',fecha_pago:'2026-11-11',folio_lote:null,descripcion:null,archivo:null,nombre_archivo:null,hash:null,creado_por:'x',created_at:new Date().toISOString(),origen:'INDIVIDUAL',conciliacion_archivo_id:null,conciliacion_linea:null});
 const antes=db.pagos.length;
 res=await correr('concurrente',db,'admin',{antesDeMarcas:(k,d)=>{if(k===2)d.pagos.push(extra());}},{});
 eq(res.r.estado,'COMPLETO','cambio concurrente detectado y releído');ok(res.srv.marcas>=3,'se tomaron marcas adicionales');
 wb=libro(res.archivos[0]);eq(hoja(wb,'PAGOS').length,db.pagos.filter(p=>p.obra_id!==O3).length,'la relectura incluye el cambio');ok(db.pagos.length===antes+1,'un pago nuevo');
 // 7) Cambio persistente: INCOMPLETO por CAMBIO_CONCURRENTE.
 res=await correr('cambiante',db,'admin',{antesDeMarcas:(k,d)=>{if(k>=2)d.pagos.push(extra());}},{});
 eq([res.r.estado,res.r.fuentes.pagos.estado],['INCOMPLETO','CAMBIO_CONCURRENTE'],'cambios persistentes → INCOMPLETO');
 // 8) Servidor sin la función de marcas: se respalda lo legible y queda INCOMPLETO.
 res=await correr('sinrpc',db,'consulta',{sinRpc:true},{});
 eq([res.r.estado,res.r.motivos.includes('SIN_MARCAS_SERVIDOR')],['INCOMPLETO',true],'sin marcas no se declara completo');
 ok(res.r.fuentes.bajas_operaciones.estado==='OMITIDA_PERMISO','tablas internas no se leen sin la función');

 // 8b) Tiempo agotado en MARCAS: se parte por tabla; si una tabla sigue excediendo queda sin marca; nunca aborta.
 res=await correr('timeout_grupo',db,'admin',{timeoutMarcas:f=>f.length>1&&f.includes('historial')},{});
 eq([res.r.estado,res.r.fuentes.historial.estado],['COMPLETO','LEIDA'],'marcas por tabla recuperan el tiempo agotado');
 res=await correr('timeout_tabla',db,'admin',{timeoutMarcas:f=>f.includes('historial')},{});
 eq([res.r.estado,res.r.motivos.includes('SIN_MARCA_TABLA'),res.r.fuentes.historial.estado,res.r.fuentes.pagos.estado],['INCOMPLETO',true,'LEIDA_SIN_MARCA','LEIDA'],'tabla sin marca → INCOMPLETO sin abortar');
 ok(manif(libro(res.archivos[0])).some(x=>x.SECCION==='LIMITACION'&&/historial excedió/.test(x.DETALLE)),'limitación declarada en el manifiesto');
 res=await correr('timeout_total',db,'admin',{timeoutMarcas:()=>true},{});
 eq([res.r.estado,res.r.motivos.includes('SIN_MARCAS_SERVIDOR'),res.archivos.length],['INCOMPLETO',true,1],'marcas sin respuesta → respaldo INCOMPLETO con archivo, no aborta');
 ok(typeof res.r.reintentar==='function','ofrece reintento');

 // 9) Cuadre con el modelo del tablero (A1) sobre las mismas hojas exportadas.
 const casos=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/tablero/casos.json'),'utf8')).casos;
 const caso=casos.find(c=>c.id==='dos_medios');const F=caso.fuentes,dc={};
 const mapa={obras:'obras',trabajadores:'trabajadores',cierres:'control_cierres_nomina',versiones:'control_cierre_versiones',flujo:'control_flujo_cierres',obligaciones:'control_obligaciones_pago',evidencias:'control_evidencias_pago',
  aplicaciones:'control_pago_aplicaciones',pagos:'pagos',cheques:'cheques',historial:'historial',cuadrillas:'cuadrillas'};
 for(const [k,t] of Object.entries(mapa))dc[t]=JSON.parse(JSON.stringify(F[k]||[]));
 dc.catalogo_incidencias=[];dc.config=[];for(const t of ['control_obligaciones_pago'])dc[t]=dc[t]||[];
 const resC=await (async()=>{const save=OBRAS_CAT;return correr('cuadre',dc,'admin',{},{obrasCatalogo:dc.obras,reloj:()=>new Date(F.ahora)});})();
 eq(resC.r.estado,'COMPLETO','respaldo del caso de tablero');
 const ctlC=hoja(libro(resC.archivos[0]),'CONTROL').filter(x=>x.DOMINIO==='CUADRE_TABLERO'&&x.FUENTE==='PLATINUM_TABLERO_MODELO · PERIODO');
 const directo=BOX.PLATINUM_TABLERO_MODELO.calcular({...F,permisos:{vip:true,obras:dc.obras.map(o=>o.id),empresas:['PLATINUM']},entregas:[],cfdi:[],efectivo_autorizado:[],errores:[],finiquitos_transferencia:[],desglose_noi:[]},
  {empresa:'PLATINUM',obras:dc.obras.map(o=>o.id),perspectiva:'PERIODO',desde:'2000-01-01',hasta:'2099-12-31'});
 ok(ctlC.length>=5,'medidas del tablero en CONTROL');
 for(const x of ctlC.filter(x=>x.HOJA!=='huella_tablero'))eq(x.TOTAL_CENTAVOS,String(Math.round(directo.medidas[x.HOJA].valor*100)),'cuadre al centavo: '+x.HOJA);
 eq(ctlC.find(x=>x.HOJA==='huella_tablero').NOTA.split(' ')[1],directo.huella,'misma huella del modelo');
 // Con finiquito en efectivo autorizado (excepción NOI) y CFDI: mismo resultado que el tablero.
 const F2=JSON.parse(JSON.stringify(F)),o2=F2.obligaciones[0];o2.tipo='FINIQUITO';
 const dc2=JSON.parse(JSON.stringify(dc));dc2.control_obligaciones_pago.find(x=>x.id===o2.id).tipo='FINIQUITO';
 dc2['platinum_internal.excepciones_noi_individuales']=[{id:U('u',77),cierre_id:o2.cierre_id,trabajador_id:o2.trabajador_id,archivo_sha256:'s',neto_original:o2.importe,nomina_transferencia:0,finiquito_efectivo:o2.importe,pago_nomina_id:null,autorizacion_origen:'CORREO',autorizacion_texto:'AUTORIZADO',registrado_en:'2026-11-05T23:30:00Z'}];
 dc2.documentos=[{id:U('d',77),trabajador_id:o2.trabajador_id,obra_id:o2.obra_id,categoria:'CFDI_NOMINA',subtipo:null,semana:'S1',fecha_doc:null,archivo:'x',nombre_archivo:'a.xml',notas:null,anulado:false,subido_por:null,created_at:'2026-11-01T00:00:00Z',hash:null,anulado_por:null,anulado_en:null,motivo_anulacion:null,cfdi_uuid:'AAAA-0001',cfdi_total:o2.importe,cfdi_fecha_pago:null,periodo_inicio:null,periodo_fin:null,mime_type:null,nomina_neto:null,nomina_tipo:'FINIQUITO',nomina_lector:null,conciliacion_archivo_id:null}];
 const resE=await correr('cuadre_efectivo',dc2,'admin',{},{obrasCatalogo:dc2.obras,reloj:()=>new Date(F.ahora)});
 const ctlE=hoja(libro(resE.archivos[0]),'CONTROL').filter(x=>x.DOMINIO==='CUADRE_TABLERO'&&x.FUENTE==='PLATINUM_TABLERO_MODELO · PERIODO');
 const base2={...F2,permisos:{vip:true,obras:dc2.obras.map(o=>o.id),empresas:['PLATINUM']},entregas:[],errores:[],finiquitos_transferencia:[],desglose_noi:[],
  cfdi:[{documento_id:U('d',77),obra_id:o2.obra_id,trabajador_id:o2.trabajador_id,uuid:'AAAA-0001',neto:o2.importe,desde:null,hasta:null,tipo:'FINIQUITO',formato:'XML',anulado:false}]};
 const filt={empresa:'PLATINUM',obras:dc2.obras.map(o=>o.id),perspectiva:'PERIODO',desde:'2000-01-01',hasta:'2099-12-31'};
 const conE=BOX.PLATINUM_TABLERO_MODELO.calcular({...base2,efectivo_autorizado:[{obligacion_id:o2.id,importe:o2.importe,fecha:'2026-11-05'}]},filt);
 const sinE=BOX.PLATINUM_TABLERO_MODELO.calcular({...base2,efectivo_autorizado:[]},filt);
 ok(conE.huella!==sinE.huella,'el efectivo autorizado cambia las medidas (caso significativo)');
 for(const x of ctlE.filter(x=>x.HOJA!=='huella_tablero'))eq(x.TOTAL_CENTAVOS,String(Math.round(conE.medidas[x.HOJA].valor*100)),'cuadre con efectivo y CFDI: '+x.HOJA);
 eq(ctlE.find(x=>x.HOJA==='huella_tablero').NOTA.split(' ')[1],conE.huella,'misma huella que el tablero con efectivo autorizado');
 // Sin modelo del tablero: queda el gancho y se avisa.
 const BOX2=cargar(false),r2=await BOX2.PLATINUM_RESPALDO.exportar({sb:servidor(dc,'admin').sb,XLSX,JSZip,obrasCatalogo:dc.obras,empresa:'PLATINUM',espera:0,marca:false,registrar:false,descargar:async()=>{}});
 ok(r2.control.some(x=>x[0]==='CUADRE_TABLERO'&&x[2]==='NO_DISPONIBLE'),'sin modelo: el gancho queda declarado');

 for(const [k,t,ms,msv,b] of medidas)console.log(`MEDIDA ${k}: ${t} filas fuente · exportación ${ms} ms · lector independiente ${msv??'–'} ms · ${Math.round(b/1024)} KiB`);
 console.log(`PASS respaldo integral: ${n} comprobaciones; historial completo, vacío/nulo/cero, ceros iniciales, textos largos, hojas con mismo prefijo, versiones, reingresos por evento, errores e INCOMPLETO con reintento, marcas concurrentes, usuario restringido, división controlada, cuadre con tablero y lector independiente.`);
 if(!process.env.RESPALDO_CONSERVAR)fs.rmSync(salida,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1);});
