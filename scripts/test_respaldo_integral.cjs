// Respaldo V2: módulo productivo, servidor simulado por alcance, XLSX/ZIP reales.
// Sólo datos ficticios. No se exportan registros reales ni se escribe en Supabase.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const XLSX=require('xlsx-js-style'),JSZip=require('jszip'),{parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'frontend/modulos/93-respaldo-integral.js'),'utf8');
function cargar(extra={}){const b={console,Date,Math,JSON,Number,String,Array,Object,Map,Set,Promise,Error,RegExp,Symbol,TextEncoder,Uint8Array,URL,setTimeout,clearTimeout,crypto:crypto.webcrypto,...extra};b.window=b;vm.createContext(b);const util=fs.readFileSync(path.join(root,'frontend/modulos/00-configuracion-utilidades.js'),'utf8');vm.runInContext(util.slice(util.indexOf('const edad='),util.indexOf('const docsOk=')),b);vm.runInContext(source,b);return b;}
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);n++;};
const box=cargar(),API=box.PLATINUM_RESPALDO,T=API._pruebas,F=API.fuentes();
const id=(n)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),O1=id(1),O2=id(2),O3=id(3),W1=id(101),W2=id(102),W3=id(103);
function fixture(vol=7){
 const db=Object.fromEntries(F.map(f=>[f.clave,[]]));
 db.obras=[{id:O1,nombre:'CENTRO A',empresa_codigo:'PLATINUM',activa:true},{id:O2,nombre:'CENTRO B',empresa_codigo:'PLATINUM',activa:false},{id:O3,nombre:'CENTRO C',empresa_codigo:'JIRE',activa:true}];
 for(let i=0;i<vol;i++)db.trabajadores.push({id:id(101+i),obra_id:i===2?O3:i%2?O2:O1,no_trab:i+1,nombres:i<3?'MISMO NOMBRE':'PERSONA '+i,primer_apellido:'PRUEBA',segundo_apellido:'PEREZ',estatus:i%2?'BAJA':'ACTIVO',eliminado:i===4,fecha_alta:'2026-01-01',fecha_baja:i%2?'2026-03-15':null,fecha_reingreso:i===0?'2026-05-01':null,escolaridad:'SECUNDARIA',estado_civil:'CASADO',fecha_nacimiento:'1991-05-02',genero:'M',telefono:'0012345678',benef_telefono:'00000099',correo:null,direccion:'CALLE PRUEBA 15',cp:'01000',sd:329,sdi:345.22345678,sdi__origen:'345.22345678',sal_semanal:0,rfc:'AABC990101ABC',curp:'CURP-FICTICIA-00001',nss:'00123456789',banco:'BBVA',cuenta:'000012345678',clabe:'001234567890123456',docs:{INE:'ENTREGADO',RFC:'PENDIENTE'},id_cuadrilla:id(9),tipo_contrato:'TIEMPO DETERMINADO',fecha_fin_contrato:'2026-12-31',observaciones:i===0?'=HYPERLINK("https://ejemplo.test","x")':''});
 db.cuadrillas=[{id:id(9),obra_id:O1,nombre:'CUADRILLA HISTÓRICA',contratista:'PRUEBA',lider_id:W1}];
 const h=(i,accion,a,d)=>({id:i,trabajador_id:W1,obra_id:O1,accion,fecha:'2026-06-01T12:00:00Z',usuario:'rrhh@prueba.test',datos_antes:a,datos_despues:d});
 db.historial=[h(1,'ALTA',null,{fecha_alta:'2026-01-01',sd:300}),h(2,'BAJA',{estatus:'ACTIVO'},{estatus:'BAJA',fecha_baja:'2026-02-01',motivo_baja:'RENUNCIA'}),h(3,'REACTIVACION',{estatus:'BAJA'},{estatus:'ACTIVO',fecha_reingreso:'2026-03-01'}),h(4,'BAJA',{estatus:'ACTIVO'},{estatus:'BAJA',fecha_baja:'2026-04-01'}),h(5,'REACTIVACION',{estatus:'BAJA'},{estatus:'ACTIVO',fecha_reingreso:'2026-05-01'}),h(6,'MODIFICACION',{sd:300,escolaridad:'PRIMARIA'},{sd:329,escolaridad:'SECUNDARIA'})];
 db.sueldos_internos=[{trabajador_id:W1,obra_id:O1,sueldo_real:8000,sueldo_imss:5000}];
 db.descuentos=[{id:id(18),trabajador_id:W1,obra_id:O1,tipo:'INFONAVIT',numero_credito:'0001234567',cuota_mensual:1500.1234,factor:12.3456,monto:0,activo:false,recurrente:true}];
 db.prestamos_empleados=[{id:id(19),empleado_id:W2,obra_id:O2,monto_inicial:1000,interes:0,autorizacion_referencia:'ACUERDO FICTICIO'}];
 db.incidencias_empleados=[{id:id(22),obra_id:O2,empleado_id:W2,prestamo_id:id(19),clase:'ABONO',fecha_aplicacion:'2026-06-01',monto_valor:200,estado:'APLICADO',detalle:{cobro:'PENDIENTE'}}];
 db.control_casos_imss=[{id:id(20),trabajador_id:W1,obra_id:O1,dias_certificados:3,certificado_desde:'2026-05-01',datos_documento:{folio:'0012',token:'NO_EXPORTAR',archivo:'https://x.supabase.co/storage/v1/object/sign/bucket/f.pdf?token=secreto'}}];
 db.control_casos_imss_semanas=[{id:id(21),caso_id:id(20),semana:6,dias_pagados_empresa:0,dias_imss_estimados:3}];
 db.documentos=[{id:id(30),trabajador_id:W1,obra_id:O1,categoria:'RECIBO_NOMINA',nomina_neto:123.45,archivo:O1+'/x.pdf',nombre_archivo:'recibo.pdf',anulado:false}];
 db.recibos_ia=[{id:id(31),documento_id:id(30),obra_id:O1,datos:{neto:123.45,desde:'2026-01-01',hasta:'2026-01-07',texto_completo:'PDF DUPLICADO'.repeat(100)},estado:'CONFIRMADO'}];
 db.constancias_laborales=[{id:id(32),trabajador_id:W1,obra_id:O1,snapshot:{trabajador:{id:W1,nss:'00123456789'},domicilio:'CALLE HISTÓRICA'},tipo_constancia:'LABORAL'}];
 db.pagos=[{id:id(40),trabajador_id:W1,obra_id:O1,importe:123.45,semana:'S1',estado:'EXITOSO'}];
 db.control_evidencias_pago=[{id:id(41),trabajador_id:W1,obra_id:O1,pago_id:id(40),importe:123.45}];
 db.control_obligaciones_pago=[{id:id(42),trabajador_id:W1,obra_id:O1,importe:123.45,tipo:'NOMINA',vigente:true}];
 db.control_pago_aplicaciones=[{id:id(43),obligacion_id:id(42),evidencia_id:id(41),obra_id:O1,importe:123.45}];
 db.cheques=[{id:id(45),trabajador_id:W2,obra_id:O2,importe:222.22,num_cheque:'000123',consecutivo:'00451',estatus:'CANCELADO',eliminado:false}];
 db.control_cierres_nomina=[{id:id(50),obra_id:O1,semana:1,periodo:'SEMANAL',estado:'PAGADO',snapshot:{items:[{trabajador_id:W1,numero:1,nombre:'PRUEBA',tipo:'NOMINA',monto:123.45,prevision_social:25}],modelo:{filas:[{w:{id:W1,sd:329},neto:123.45,retenciones:[{tipo:'FALTA',monto:20}]}]},total_neto:999999,sql:'NO_INCLUIR'}}];
 db.control_jornada_eventos=[{id:id(51),obra_id:O1,trabajador_id:W1,bruto:150,calculo:{horas:3}}];
 db.prestaciones_papeles=[{id:id(52),obra_id:O2,trabajador_id:W2,numero:2,resultado:{isr_precision:6.0224,neto:764.65},entradas:{folio_credito:'0000001'},fuente:{sha256:'HASH-FICTICIO-001',hoja:'S10'}}];
 db.prestaciones_archivos_historicos=[{id:id(53),obra_id:O2,semana:10,contenido:{bloques:22,original_completo_disponible:true}}];
 db.prestaciones_fuentes_historicas=[{obra_id:O2,sha256:'HASH-FICTICIO-001',archivo:'PAPEL HISTÓRICO FICTICIO.xlsx',created_at:'2026-06-01T00:00:00Z',contenido_base64:'NO_LEER_BINARIO'}];
 db.prestaciones_papeles.push({id:id(54),obra_id:O2,trabajador_id:null,nombre:'ANTECEDENTE SIN ID',numero:88,resultado:{neto:42}});
 return db;
}
function servidor(db,op={}){
 const req=[],rpc=[],allowed=op.centros||[O1,O2,O3],perm={registrado:true,vip:op.vip!==false,salud:op.salud!==false,admin:op.admin!==false};
 const fkey=new Map((op.fuentes||F).map(f=>[f.clave,{...F.find(x=>x.clave===f.clave),...f}]));let cambios=0;
 const visible=(k,obraids)=>{
  const f=fkey.get(k);let rows=(db[k]||[]).filter(r=>!r.obra_id||obraids.includes(r.obra_id));
  if(k==='obras')rows=rows.filter(r=>obraids.includes(r.id));
  if(f?.alcance==='global')rows=db[k];
  if(f?.alcance==='padre'&&rows.length){const ids=new Set((db[f.padre.fuente]||[]).filter(r=>obraids.includes(r.obra_id)).map(r=>r[f.padre.campo]));rows=rows.filter(r=>ids.has(r[f.padre.destino]));}
  if(!perm.admin&&['trabajadores','cheques'].includes(k))rows=rows.filter(r=>!r.eliminado);
  if(!perm.vip&&k==='control_obligaciones_pago')rows=rows.filter(r=>r.tipo!=='PREVISION_SOCIAL');return rows;
 };
 function from(k){const fil=[],ord=[];let sel='';const q={select(s){sel=s;return q;},or(){return q;},eq(k,v){fil.push(r=>r[k]===v);return q;},neq(k,v){fil.push(r=>r[k]!==v);return q;},in(k,vs){fil.push(r=>vs.includes(r[k]));return q;},order(k){ord.push(k);return q;},async range(a,b){req.push({k,sel,a,b});if(op.fail===k)return {error:{message:'FALLO DE PRUEBA '+k}};
   let rows=visible(k,allowed).filter(r=>fil.every(f=>f(r))).sort((x,y)=>{for(const o of ord){const a=x[o],b=y[o];if(a!==b)return a>b?1:-1;}return 0;}).slice(a,Math.min(b+1,a+(op.cap||1000)));
   if(op.repeat&&k==='trabajadores'&&a)rows=visible(k,allowed).slice(0,1);
   if(op.early&&k==='trabajadores'&&a)rows=[];
   const projected=rows.map(r=>{const rr={};for(const c of sel.split(',')){if(c==='*'){Object.assign(rr,r);}else if(c.includes(':snapshot->')){const [key,p]=c.split(':');rr[key]=p.split('->').slice(1).reduce((v,k)=>v?.[k],r.snapshot)??null;}else if(c.includes('__origen:')){const key=c.split(':')[0],src=key.replace('__origen','');rr[key]=r[key]??(r[src]==null?null:String(r[src]));}else if(c in r)rr[c]=r[c];}return rr;});
   return {data:JSON.parse(JSON.stringify(projected)),error:null};}};return q;
 }
 return {req,rpc,async rpc(name,args){rpc.push(args);const p=args.p_datos,k=p.fuente;if(name!=='control_respaldo')throw Error('RPC inesperada');if(op.denied)return {error:{code:'42501',message:'Sin permiso operativo'}};
   const obras=db.obras.filter(o=>o.empresa_codigo===p.empresa&&allowed.includes(o.id)).map(o=>o.id);
   if(args.p_accion==='LEER'){const rows=visible(k,obras).filter(r=>!p.despues||r[fkey.get(k).pk[0]]>p.despues).slice(0,1000);return {data:{filas:JSON.parse(JSON.stringify(rows)),siguiente:rows.length===1000?rows.at(-1)[fkey.get(k).pk[0]]:null}};}
   if(op.timeoutGroup&&p.fuentes.length>1)return {error:{code:'57014',message:'canceling statement due to timeout'}};
   const marcas={};for(const key of p.fuentes){const f=fkey.get(key);if((f?.permiso==='vip'&&!perm.vip)||(f?.permiso==='salud'&&!perm.salud)||(f?.permiso==='vip_salud'&&(!perm.vip||!perm.salud))){marcas[key]={omitida:'PERMISO'};continue;}const rows=visible(key,obras);marcas[key]={filas:rows.length,huella:crypto.createHash('md5').update(JSON.stringify(rows)).digest('hex'),tipo:'COMPLETA'};if(op.concurrent&&key==='trabajadores')marcas[key].huella=String(++cambios);}
   return {data:{obras,permisos:perm,marcas}};},from};
}
const opt=(sb,files,extra={})=>({sb,XLSX,JSZip,espera:0,intentos:1,reloj:()=>new Date('2026-11-18T18:00:00Z'),descargar:async(bytes,nombre)=>files.push({bytes,nombre}),...extra});
function rows(wb,name){const n=wb.SheetNames.find(n=>n===name);return n?XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:null}):[];}
async function main(){
 ok(API.FORMATO==='RESPALDO_TRABAJADORES_V2','contrato nuevo');
 ok(F.length>=50&&!F.some(f=>['config','app_usuarios','control_bitacora','historial_automatizaciones','control_presupuestos_obra'].includes(f.clave)),'catálogo sólo de expedientes');
 for(const f of F.filter(f=>f.alcance!=='interna'))ok(!f.select.includes('*'),'proyección explícita '+f.clave);
 for(const [key,v] of [['NSS','00123456789'],['CLABE','001234567890123456'],['Teléfono','0012345'],['Código postal','01000'],['Cuenta','0000009'],['RFC','XEXX010101000']]){const c=T.tipoCelda(key,v);ok(c.t==='s'&&c.v===v&&c.z==='@'&&!c.f,key+' exacto texto');}
 for(const v of ['=1+1','+52 77','-5','@SUMA(A1)']){const c=T.tipoCelda('Observaciones',v);ok(c.t==='s'&&!c.f&&c.v===v,'no evaluar '+v);}
 eq([T.tipoCelda('Dato',null).v,T.tipoCelda('Dato','').v,T.tipoCelda('Importe',0).v],['Sin dato','',0],'nulo/vacío/cero distintos');
 const db=fixture(1007),antes=JSON.stringify(db),sb=servidor(db,{cap:173}),files=[];
 const r=await API.exportar(opt(sb,files,{obras:[O1],empresa:'PLATINUM'}));
 ok(files.length===1&&r.archivos.length===1,'único archivo, ignora selección de centro/empresa de pantalla');
 eq(r.trabajadores,1007,'todos los trabajadores sin corte de servidor');ok(JSON.stringify(db)===antes,'cero modificaciones a las fuentes');
 const wb=XLSX.read(files[0].bytes,{type:'array',cellStyles:true});
 const pad=rows(wb,'Padrón completo');eq(pad.length,1007,'una fila por ID, no por nombre/relación');ok(new Set(pad.map(r=>r['Referencia del trabajador'])).size===1007,'IDs estables');
 ok(pad.some(r=>r['Estatus laboral']==='BAJA')&&pad.some(r=>r['En papelera']==='Sí')&&pad.some(r=>r['Razón social']==='JIRE'),'bajas, papelera autorizada y otra razón incluidas');
 const mov=rows(wb,'Altas bajas y reingresos').filter(r=>r['Referencia del trabajador']===W1);eq(mov.length,5,'dos reingresos: cinco movimientos conservados');eq(mov.map(r=>r['Fecha efectiva registrada']),['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01'],'todas las fechas de ciclos');
 ok(mov.every(r=>r['Ciclo registrado']==='Sin dato'),'no inventar ciclos inexistentes');
 const personal=rows(wb,'Datos personales y contacto').find(r=>r['Referencia del trabajador']===W1);eq([personal['Escolaridad'],personal['NSS'],personal['Teléfono']],['SECUNDARIA','00123456789','0012345678'],'fidelidad datos fuera de padrón principal');
 eq(personal['Edad a la fecha del respaldo (años)'],35,'edad reutiliza helper de ficha con fecha del respaldo');
 const bancos=rows(wb,'Datos bancarios').find(r=>r['Referencia del trabajador']===W1);eq([bancos.Cuenta,bancos.CLABE],['000012345678','001234567890123456'],'datos bancarios exactos');
 const dom=rows(wb,'Domicilios').find(r=>r['Referencia del trabajador']===W1);eq([dom['Domicilio registrado'],dom['Código postal']],['CALLE PRUEBA 15','01000'],'domicilio sin dividir o inventar componentes');
 const salarios=rows(wb,'Salarios e historial');ok(salarios.some(r=>r['SDI / SBC registrado']===345.22345678)&&salarios.some(r=>r['Valor anterior']===300&&r['Valor posterior']===329),'SDI completo e historial salarial');
 const inc=rows(wb,'Incidencias e incapacidades');ok(inc.some(r=>r['Referencia del trabajador']===W1&&r['Días imss estimados']===3)||inc.some(r=>r['Referencia del trabajador']===W1&&r['Días IMSS estimados']===3),'semana IMSS ligada por caso');
 const cred=rows(wb,'Créditos y préstamos');ok(cred.some(r=>r['Numero credito']==='0001234567'&&r['Cuota mensual']===1500.1234&&r['Activo']==='No'),'crédito inactivo con número y precisión completos');ok(cred.some(r=>r['Referencia del trabajador']===W2&&r['Monto inicial']===1000&&r['Interes']===0),'préstamo ligado por empleado_id sin inventar cobro');
 const nom=rows(wb,'Nóminas individuales');eq(nom.length,1,'un concepto individual, no duplicar por fila del modelo');eq(nom[0].Monto,123.45,'importe de fotografía conservado');
 const pagos=rows(wb,'Pagos y cheques');eq(pagos.filter(r=>r['Tipo de registro']==='Pago registrado').length,1,'pago aparece una sola vez');ok(pagos.some(r=>r['Número de cheque']==='000123'&&r['Estatus']==='CANCELADO'),'cheque cancelado original conservado');
 const prest=rows(wb,'Prestaciones y finiquitos');ok(prest.some(r=>r['Archivo histórico de origen']==='PAPEL HISTÓRICO FICTICIO.xlsx'),'metadatos del original histórico unidos por referencia sin leer binario');ok(r.sinVinculo>0&&prest.some(r=>r['Vínculo del expediente']==='Sin vínculo verificable al padrón'),'antecedente sin ID conservado y advertido, sin asignar por nombre');
 const todo=JSON.stringify(wb);ok(!/NO_EXPORTAR|NO_LEER_BINARIO|PDF DUPLICADO|NO_INCLUIR|token=|object\/sign/.test(todo),'sin credenciales, texto OCR ni estructura técnica general');
 ok(!wb.SheetNames.some(n=>/MANIFIESTO|DICCIONARIO|CONFIG|ACCESOS|CENTROS|PRESUPUESTO/.test(n)),'sin hojas técnicas ni catálogos');
 ok(r.matriz.some(x=>x.fuente==='trabajadores.escolaridad')&&r.matriz.some(x=>x.fuente==='trabajadores.clabe'),'matriz dato-fuente-destino');
 const zip=await JSZip.loadAsync(files[0].bytes);for(let i=1;i<=wb.SheetNames.length;i++){const x=await zip.file('xl/worksheets/sheet'+i+'.xml').async('string');ok(/state="frozen"/.test(x)&&/<autoFilter/.test(x),'filtro y encabezado inmovilizado hoja '+i);ok(!/<f[ >]/.test(x),'sin fórmulas inyectadas hoja '+i);}
 const rest=[],rsb=servidor(fixture(),{centros:[O1],vip:false,salud:false,admin:false});const rr=await API.exportar(opt(rsb,rest));const rw=XLSX.read(rest[0].bytes,{type:'array'});ok(rows(rw,'Padrón completo').every(r=>r['Centro actual del expediente']==='CENTRO A'&&r['En papelera']!=='Sí'),'alcance restringido exacto');
 ok(rr.omisiones.some(x=>x.fuente==='Sueldo interno vigente')&&!JSON.stringify(rw).includes('Sueldo real del periodo (control interno)'),'restricción VIP conservada');ok(!rsb.req.some(x=>x.k==='control_cierres_nomina'&&/snapshot->(items|modelo)/.test(x.sel)),'no solicitar ramas restringidas sin VIP');
 for(const o of [{fail:'pagos'},{early:true},{repeat:true},{concurrent:true},{denied:true}]){let count=0;await assert.rejects(()=>API.exportar(opt(servidor(fixture(1007),{...o,cap:173}),[],{descargar:()=>count++})));eq(count,0,'falla no descarga ni anuncia completo '+JSON.stringify(o));}
 const lento=[];await API.exportar(opt(servidor(fixture(),{timeoutGroup:true}),lento));eq(lento.length,1,'timeout por grupo reintenta por fuente');
 const corto=[],cd=fixture();cd.trabajadores[0].observaciones='a'.repeat(29999)+'😀'+'b'.repeat(35000);const cr=await API.exportar(opt(servidor(cd),corto,{limiteFilas:5}));const cw=XLSX.read(corto[0].bytes,{type:'array'});eq(corto.length,1,'límite real divide hojas, nunca archivos');ok(cw.SheetNames.some(x=>x.startsWith('Padrón completo 2')),'continuación dentro del libro');const trozos=cw.SheetNames.filter(x=>x.startsWith('Textos extensos')).flatMap(x=>rows(cw,x)).filter(x=>x.Dato==='Observaciones').map(x=>x.Texto);eq(trozos.join(''),cd.trabajadores[0].observaciones,'texto largo completo y Unicode exacto');
 let ses='a',descargas=0;await assert.rejects(()=>API.exportar(opt(servidor(fixture()),[],{sesion:()=>ses,progreso:()=>{ses='b';},descargar:()=>descargas++})));eq(descargas,0,'cambio de sesión bloquea entrega');
 // UI real montada en DOM sintético. Sin navegador ni atribuir validación visual.
 const {document}=parseHTML('<html><body><div id="modal"></div></body></html>'),b=cargar({document,esc:s=>String(s),modal:h=>{document.getElementById('modal').innerHTML=h;},closeModal:()=>{},confirm:()=>true,sb:servidor(fixture()),XLSX,JSZip,USER:{id:'admin'}});
 const uiFiles=[];b.PLATINUM_RESPALDO.abrir(opt(servidor(fixture()),uiFiles));ok(document.getElementById('rsi-generar').textContent.includes('Exportar respaldo completo de trabajadores')&&!document.getElementById('rsi-empresa'),'UI alcance completo sin selector restrictivo');
 const guardar=document.getElementById('rsi-generar').onclick,run=guardar(),duplicado=guardar();await Promise.all([run,duplicado]);eq(uiFiles.length,1,'doble clic UI sólo inicia una exportación');ok(document.getElementById('rsi-estado').textContent.includes('Respaldo completo descargado'),'resultado visible');
 b.PLATINUM_RESPALDO.abrir(opt(servidor(fixture(),{fail:'pagos'}),uiFiles));await document.getElementById('rsi-generar').onclick();ok(document.getElementById('rsi-estado').textContent.includes('No se completó el respaldo'),'error visible');eq(uiFiles.length,1,'fallo de UI sin archivo parcial');ok(!document.getElementById('rsi-generar').disabled,'botón habilitado para reintentar');
 // Pruebas sintéticas independientes de forma y volumen; los bytes se guardan sólo si QA lo pide.
 const out=process.env.RESPALDO_QA_DIR;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'respaldo_ficticio.xlsx'),files[0].bytes);fs.writeFileSync(path.join(out,'matriz.json'),JSON.stringify(r.matriz,null,2));fs.writeFileSync(path.join(out,'resultado.json'),JSON.stringify({trabajadores:r.trabajadores,bytes:files[0].bytes.length,hojas:r.hojas,comprobaciones:n},null,2));}
 console.log('PASS respaldo de expedientes: '+n+' comprobaciones; '+r.trabajadores+' trabajadores, '+r.archivos[0].hojas.length+' hojas, '+r.archivos[0].bytes+' bytes. Sólo lecturas; sin navegador.');
 return {comprobaciones:n,bytes:files[0].bytes.length};
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main,fixture,servidor,cargar,opt,rows};
