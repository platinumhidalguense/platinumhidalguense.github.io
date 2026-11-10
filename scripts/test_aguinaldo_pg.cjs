// Aguinaldo aplicado y faltas históricas en PostgreSQL local (pglite), datos ficticios.
// Requiere el paquete SQL privado: la migración *_aguinaldo_faltas_historicas.sql y
// work/aguinaldo_20261110 con las definiciones vigentes de producción. Sin él se omite.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations'),priv=path.join(root,'work/aguinaldo_20261110');
const mig=fs.readdirSync(dir).find(n=>n.endsWith('_aguinaldo_faltas_historicas.sql'));
if(!mig||!fs.existsSync(path.join(priv,'prod_base.sql'))){console.log('ALCANCE PÚBLICO AGUINALDO: las pruebas PostgreSQL requieren el paquete privado; no se cuentan como ejecutadas.');process.exit(0);}
const {makeDatabase,ids,actor,owner}=require('./soporte_flujo_pg.cjs');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};
const uuid=i=>'40000000-0000-4000-8000-'+String(i).padStart(12,'0');
async function call(db,who,fn,acc,datos){await actor(db,who);try{return (await db.query(`select public.${fn}($1,$2::jsonb) r`,[acc,JSON.stringify(datos)])).rows[0].r;}finally{await db.exec('reset role');}}
async function falla(db,who,fn,acc,datos,re,m){let e=null;try{await call(db,who,fn,acc,datos);}catch(x){e=x;}await db.exec('reset role');assert.ok(e&&re.test(e.message+' '+(e.detail||'')),m+' → '+(e?e.message:'sin error'));n++;return e;}
(async()=>{
 const db=await makeDatabase();
 await db.exec(fs.readFileSync(path.join(priv,'prod_base.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(priv,'prod_fuente_antes.sql'),'utf8'));
 const captura='10000000-0000-4000-8000-000000000009';ids.captura=captura;
 await owner(db,"insert into auth.users(id) values($1)",[captura]);
 await owner(db,"insert into public.app_usuarios(user_id,email,rol,activo,full_access,puede_escribir,puede_eliminar,empresas_permitidas,obras_permitidas) values($1,'captura@prueba.test','CAPTURISTA',true,false,true,false,'{PLATINUM}','{}')",[captura]);
 await owner(db,"update public.obras set fecha_inicio='2026-03-30'");
 await owner(db,"update public.trabajadores set curp='PEPR800101HHGRRS0'||no_trab, fecha_alta='2026-03-30', sd=500, sdi=524.65, sal_semanal=3200, periodo_pago='SEMANAL' where obra_id=$1",[ids.obra]);
 await owner(db,"update public.trabajadores set periodo_pago='QUINCENAL' where id=$1",[ids.w2]);
 // Fuentes de varias semanas antes de la migración.
 await owner(db,"insert into public.descuentos(id,trabajador_id,obra_id,tipo,motivo,monto,recurrente,semana,activo) values($1,$2,$3,'FALTA','1 FALTA',457.14,false,'S20',true)",[uuid(1),ids.w,ids.obra]);
 await owner(db,"insert into public.diferenciales(id,obra_id,trabajador_id,semana,monto,motivo,activo) values($1,$2,$3,36,100,'DIF',true)",[uuid(2),ids.obra,ids.w]);
 const semanas=[20,36,37,38];
 const huellas=async()=>Object.fromEntries(await Promise.all(semanas.map(async s=>[s,(await owner(db,'select platinum_internal.fuente($1,$2) h',[ids.obra,s])).rows[0].h])));
 const antes=await huellas();
 await actor(db,'admin');const entAntes=(await db.query('select public.control_entradas_nomina_rapidas($1,37) r',[ids.obra])).rows[0].r;await db.exec('reset role');
 await db.exec(fs.readFileSync(path.join(dir,mig),'utf8'));
 await db.exec(fs.readFileSync(path.join(dir,mig),'utf8'));ok(true,'la migración es reaplicable');
 eq(await huellas(),antes,'sin aguinaldo, la huella de cada periodo es idéntica a la anterior');
 await actor(db,'admin');eq((await db.query('select public.control_entradas_nomina_rapidas($1,37) r',[ids.obra])).rows[0].r,entAntes,'entradas rápidas idénticas sin aguinaldo');await db.exec('reset role');

 // ---------- Faltas históricas ----------
 for(const [i,f] of ['2026-04-06','2026-05-04','2026-06-01'].entries())
  await owner(db,"insert into public.incidencias_empleados(obra_id,empleado_id,fecha_aplicacion,id_incidencia,clase,desde_origen,hasta_origen,desde_aplicacion,hasta_aplicacion) values($1,$2,$3,2,'AUSENCIA',$3,$3,$3,$3)",[ids.obra,ids.w,f]);
 const reg={trabajador_id:ids.w,modo:'TOTAL_AL_CORTE',ejercicio:2026,rango_desde:'2026-03-30',fecha_corte:'2026-07-31',total_acreditado:8,naturaleza:'FALTA_INJUSTIFICADA',motivo:'Lista de asistencia física',fuente:'Archivo de obra',referencia:'Caja 3',clave_idempotencia:uuid(10)};
 let r=await call(db,'captura','control_faltas_historicas','REGISTRAR',reg);
 eq([Number(r.digitales_al_registrar),Number(r.diferencia_digitales),r.version,r.estado],[3,5,1,'VIGENTE'],'8 acreditadas, 3 digitales → complemento 5');
 eq((await call(db,'captura','control_faltas_historicas','REGISTRAR',reg)).repetido,true,'idempotente');
 await falla(db,'captura','control_faltas_historicas','REGISTRAR',{...reg,clave_idempotencia:uuid(11)},/solapa/,'complemento solapado');
 await falla(db,'captura','control_faltas_historicas','REGISTRAR',{...reg,clave_idempotencia:uuid(12),rango_desde:'2026-08-10',fecha_corte:'2026-08-01'},/invertido/,'rango invertido');
 await falla(db,'captura','control_faltas_historicas','REGISTRAR',{...reg,clave_idempotencia:uuid(13),rango_desde:'2026-08-01',fecha_corte:'2026-08-05',total_acreditado:9},/imposible/,'cantidad imposible');
 await falla(db,'captura','control_faltas_historicas','REGISTRAR',{...reg,clave_idempotencia:uuid(14),rango_desde:'2026-08-01',fecha_corte:'2026-08-05',total_acreditado:1.5},/imposible/,'fracción imposible');
 await falla(db,'consulta','control_faltas_historicas','REGISTRAR',{...reg,clave_idempotencia:uuid(15)},/consultar/,'consulta no captura');
 await falla(db,'jire','control_faltas_historicas','LEER',{trabajador_id:ids.w},/alcance/,'otra razón social no ve');
 await falla(db,'captura','control_faltas_historicas','CORREGIR',{trabajador_id:ids.w,id:r.id,version:1,motivo_cambio:'ajuste'},/corrección/,'captura no corrige');
 const v2=await call(db,'admin','control_faltas_historicas','CORREGIR',{...reg,id:r.id,version:1,total_acreditado:2,motivo_cambio:'Respaldo correcto: 2 faltas',clave_idempotencia:uuid(16)});
 eq([v2.version,v2.cadena_id,v2.discrepancia],[2,r.cadena_id,true],'corrección versionada; 2 contra 3 digitales abre discrepancia');
 const vers=(await owner(db,'select estado,version from public.control_faltas_historicas where cadena_id=$1 order by version',[r.cadena_id])).rows;
 eq(vers,[{estado:'SUSTITUIDA',version:1},{estado:'VIGENTE',version:2}],'la versión anterior se conserva sustituida');
 let e=null;try{await owner(db,"update public.control_faltas_historicas set total_acreditado=1 where id=$1",[v2.id]);}catch(x){e=x;}ok(e&&/auditado|inmutable/.test(e.message),'sin escritura directa');
 e=null;try{await owner(db,"delete from public.control_faltas_historicas where id=$1",[v2.id]);}catch(x){e=x;}ok(e&&/no se borran/.test(e.message),'no se borra');
 e=null;try{await actor(db,'admin');await db.query("insert into public.control_faltas_historicas(cadena_id,empresa_codigo,obra_id,trabajador_id,ejercicio,modo,rango_desde,fecha_corte,naturaleza,motivo,fuente,clave_idempotencia,actor_id,huella) values($1,'PLATINUM',$2,$3,2026,'FECHAS','2026-01-01','2026-01-02','FALTA_INJUSTIFICADA','xxxxx','xxx',$1,$1,'x')",[uuid(17),ids.obra,ids.w]);}catch(x){e=x;}await db.exec('reset role');
 ok(e&&/permission|denied|row-level/i.test(e.message),'el cliente no inserta directo');
 const fz=await call(db,'captura','control_faltas_historicas','REGISTRAR',{trabajador_id:ids.w,modo:'FECHAS',ejercicio:2026,rango_desde:'2026-08-01',fecha_corte:'2026-08-31',fechas:['2026-08-04','2026-08-04','2026-08-11'],naturaleza:'FALTA_INJUSTIFICADA',motivo:'Reporte de residente',fuente:'Bitácora de obra',clave_idempotencia:uuid(18)});
 eq(fz.fechas,['2026-08-04','2026-08-11'],'fechas únicas');
 const rev=await call(db,'admin','control_faltas_historicas','REVERTIR',{trabajador_id:ids.w,id:fz.id,version:1,motivo_cambio:'Capturado por error'});eq(rev.estado,'REVERTIDA');
 const leer=await call(db,'consulta','control_faltas_historicas','LEER',{trabajador_id:ids.w});
 eq([leer.registros.length,leer.permisos.captura,leer.cobertura.primera_captura_calendario],[3,false,'2026-04-06'],'consulta lee versiones y cobertura');
 const bit=(await owner(db,"select accion from public.control_bitacora where modulo='PRESTACIONES' order by created_at")).rows.map(x=>x.accion);
 ok(bit.includes('REGISTRAR_FALTAS_HISTORICAS')&&bit.includes('CORREGIR_FALTAS_HISTORICAS')&&bit.includes('REVERTIR_FALTAS_HISTORICAS'),'bitácora con antes y después');

 // ---------- Aguinaldo: contexto ----------
 let ctx=await call(db,'admin','control_aguinaldo','CONTEXTO',{ejercicio:2026,trabajadores:[ids.w,ids.w2,ids.wOtra]});
 eq(ctx.personas.length,3);const pw=ctx.personas.find(p=>p.trabajador_id===ids.w);
 eq([pw.calendario.length,pw.historicas.length,pw.faltas_semana.length,pw.faltas_semana[0].periodo],[3,3,1,{desde:'2026-08-10',hasta:'2026-08-16'}]);
 eq([pw.faltas_semana[0].tipo,pw.faltas_semana[0].motivo,pw.faltas_semana[0].calculo],['FALTA','1 FALTA',null],'la falta semanal trae su tipo y desglose (sin inferir de la nota)');
 eq([ctx.coberturas.length,...['inicio_centro','primera_semana_descuentos'].map(k=>ctx.coberturas.find(c=>c.obra_id===ids.obra)[k])],[2,'2026-03-30',20],'inicio de captura digital por centro');
 eq((await call(db,'captura','control_aguinaldo','CONTEXTO',{ejercicio:2026,trabajadores:[ids.w,ids.wOtra]})).personas.length,1,'el contexto respeta la razón social');
 // ---------- Aguinaldo: aplicar ----------
 const linea=(p,o)=>{const bruto=Math.round(500*15*212/365*100)/100,ex=Math.min(bruto,3519.30),grav=Math.round((bruto-ex)*100)/100,isr=Math.round(grav*0.1792*100)/100;
  return {trabajador_id:p.trabajador_id,huella_fuentes:p.huella_fuentes,periodicidad:'SEMANAL',semana:37,periodo_desde:'2026-12-07',periodo_hasta:'2026-12-13',fecha_pago:'2026-12-11',
   salario_base:500,dias_pactados:15,dias_computables:212,denominador:365,bruto_causado:bruto,acreditado_externo:0,bruto,exento_usado:0,exento:ex,gravado:grav,isr,metodo_isr:'ART96',
   desglose:{fiscal:{isr_detalle:{metodo:'ART96',isr}}},...o};};
 const lote=(op,lineas,o)=>({operacion_id:op,empresa_codigo:'PLATINUM',ejercicio:2026,parametros:{dias_pactados:15},reglas_version:'AGUINALDO_2026_V1',motor_version:'SEMANAL_V1',lineas,...o});
 const L=linea(pw);
 await falla(db,'consulta','control_aguinaldo','APLICAR',lote(uuid(20),[L]),/consultar/,'consulta no aplica');
 await falla(db,'jire','control_aguinaldo','APLICAR',lote(uuid(21),[L]),/razón social|alcance/,'otra razón social no aplica');
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(22),[{...L,huella_fuentes:'otra'}]),/CONFLICTO_AGUINALDO[\s\S]*FUENTES_CAMBIARON/,'fuentes cambiadas → recalcular');
 eq(Number((await owner(db,'select count(*) c from public.control_aguinaldo_lineas')).rows[0].c),0,'todo o nada');
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(23),[{...L,exento:3000,gravado:L.bruto-3000}]),/inconsistentes/,'exento mal calculado');
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(24),[{...L,bruto_causado:L.bruto+1}]),/no se reproduce/,'bruto no reproducible');
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(25),[L],{parametros:{dias_pactados:20}}),/requieren contrato/,'pacto superior sin respaldo');
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(26),[{...L,fecha_pago:'2026-12-13'}]),/Fecha de pago/,'fecha de pago fuera del calendario');
 const ap=await call(db,'captura','control_aguinaldo','APLICAR',lote(uuid(27),[L]));
 eq([ap.lineas,Number(ap.bruto)],[1,L.bruto],'aplicado al borrador');
 eq((await call(db,'captura','control_aguinaldo','APLICAR',lote(uuid(27),[L]))).repetido,true,'doble clic / reintento: una sola aplicación');
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(27),[{...L,isr:0,desglose:{fiscal:{isr_detalle:{isr:0}}}}]),/reutilizada/,'misma operación con otros datos');
 ctx=await call(db,'admin','control_aguinaldo','CONTEXTO',{ejercicio:2026,trabajadores:[ids.w]});
 const p2=ctx.personas[0];ok(p2.huella_fuentes!==pw.huella_fuentes,'la aplicación cambia la huella de la persona');
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(28),[linea(p2,{semana:38,periodo_desde:'2026-12-14',periodo_hasta:'2026-12-20',fecha_pago:'2026-12-18'})]),/SALDO_INSUFICIENTE/,'el mismo saldo no se aplica en otro periodo');
 eq(p2.aplicaciones[0].estado_destino,'SIN_CIERRE');
 const despues=await huellas();
 ok(despues[37]!==antes[37]&&despues[36]===antes[36]&&despues[38]===antes[38],'sólo la huella del periodo destino cambia');
 await actor(db,'admin');const ent=(await db.query('select public.control_entradas_nomina_rapidas($1,37) r',[ids.obra])).rows[0].r;await db.exec('reset role');
 eq(ent.aguinaldos.length,1,'entradas rápidas incluyen la aplicación');ok(!('desglose' in ent.aguinaldos[0]));
 const evento=(await owner(db,"select count(*) c from public.control_eventos_integracion where tabla='control_aguinaldo_lineas'")).rows[0].c;ok(Number(evento)>=1,'avisa a las sesiones abiertas');
 e=null;try{await actor(db,'admin');await db.query('update public.control_aguinaldo_lineas set bruto=1');}catch(x){e=x;}await db.exec('reset role');ok(e,'sin escritura directa a líneas');
 // retiro en borrador y reaplicación
 const lid=(await owner(db,'select id,version from public.control_aguinaldo_lineas')).rows[0];
 await falla(db,'captura','control_aguinaldo','RETIRAR',{id:lid.id,version:9,motivo:'Error de captura'},/cambió/,'versión vieja');
 const ret=await call(db,'captura','control_aguinaldo','RETIRAR',{id:lid.id,version:lid.version,motivo:'Se pagará en la semana 38'});eq(ret.estado,'RETIRADO');
 eq((await huellas())[37],antes[37],'retirar devuelve la huella del periodo a la original');
 ctx=await call(db,'admin','control_aguinaldo','CONTEXTO',{ejercicio:2026,trabajadores:[ids.w]});
 const ap2=await call(db,'captura','control_aguinaldo','APLICAR',lote(uuid(29),[linea(ctx.personas[0],{semana:38,periodo_desde:'2026-12-14',periodo_hasta:'2026-12-20',fecha_pago:'2026-12-18'})]));eq(ap2.lineas,1,'reaplicable tras retiro');
 // quincenal (persona 2): la semana 37 cae en la primera quincena de diciembre
 await owner(db,"update public.trabajadores set curp='OTRA800101HHGRRS09' where id=$1",[ids.w2]);
 ctx=await call(db,'admin','control_aguinaldo','CONTEXTO',{ejercicio:2026,trabajadores:[ids.w2]});
 const parcial=(p,o)=>linea(p,{periodicidad:'QUINCENAL',bruto:2000,exento:2000,gravado:0,isr:0,desglose:{fiscal:{isr_detalle:{isr:0}}},...o});
 const Q=parcial(ctx.personas[0],{periodo_desde:'2026-12-01',periodo_hasta:'2026-12-15',fecha_pago:'2026-12-15'});
 const apq=await call(db,'captura','control_aguinaldo','APLICAR',lote(uuid(31),[Q]));eq(apq.lineas,1,'quincenal con su calendario natural; parcialidad legítima');
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(34),[Q]),/FUENTES_CAMBIARON/,'la aplicación previa vuelve obsoleta la simulación');
 ctx=await call(db,'admin','control_aguinaldo','CONTEXTO',{ejercicio:2026,trabajadores:[ids.w2]});
 const hq=ctx.personas[0].huella_fuentes,Q2={semana:39,periodo_desde:'2026-12-16',periodo_hasta:'2026-12-31',fecha_pago:'2026-12-31'};
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(32),[{...Q,huella_fuentes:hq,periodicidad:'SEMANAL'}]),/Periodicidad/,'no mezcla periodicidades');
 // exención: la parcialidad anterior del mismo año ya consumió $2,000 de las 30 UMA
 await falla(db,'captura','control_aguinaldo','APLICAR',lote(uuid(35),[parcial(ctx.personas[0],{...Q2,huella_fuentes:hq})]),/EXENCION_CONSUMIDA/,'no se declara menos exención consumida de la que consta');
 const ex2=Math.round((3519.30-2000)*100)/100;
 const segunda=parcial(ctx.personas[0],{...Q2,huella_fuentes:hq,exento_usado:2000,exento:ex2,gravado:Math.round((2000-ex2)*100)/100,isr:10,desglose:{fiscal:{isr_detalle:{isr:10}}}});
 eq((await call(db,'captura','control_aguinaldo','APLICAR',lote(uuid(36),[segunda]))).lineas,1,'segunda parcialidad con exención restante $1,519.30');
 const exq=(await owner(db,"select sum(exento) e from public.control_aguinaldo_lineas where trabajador_id=$1 and estado='APLICADO'",[ids.w2])).rows[0].e;
 eq(Number(exq),3519.3,'la exención anual del patrón no se rebasa');
 // baja: no entra a la nómina ordinaria
 await owner(db,"update public.trabajadores set estatus='BAJA',fecha_baja='2026-12-03' where id=$1",[ids.wOtra]);
 ctx=await call(db,'admin','control_aguinaldo','CONTEXTO',{ejercicio:2026,trabajadores:[ids.wOtra]});
 await falla(db,'admin','control_aguinaldo','APLICAR',lote(uuid(33),[linea(ctx.personas[0])],{empresa_codigo:'JIRE'}),/flujo de baja/,'baja → flujo de finiquito o pago extraordinario');
 // periodo protegido: ni aplicar ni retirar
 await owner(db,"insert into public.control_cierres_nomina(id,obra_id,semana,periodo,estado,snapshot,snapshot_sha256,formula_version) values($1,$2,38,'SEMANAL','AUTORIZADO','{}','x','PRUEBA')",[uuid(30),ids.obra]);
 const l2=(await owner(db,"select id,version from public.control_aguinaldo_lineas where estado='APLICADO' and trabajador_id=$1",[ids.w])).rows[0];
 await falla(db,'captura','control_aguinaldo','RETIRAR',{id:l2.id,version:l2.version,motivo:'Corregir importe'},/flujo autorizado de ajuste/,'periodo autorizado: el retiro va por ajuste');
 ctx=await call(db,'admin','control_aguinaldo','CONTEXTO',{ejercicio:2026,trabajadores:[ids.w]});
 eq(ctx.personas[0].aplicaciones.find(a=>a.estado==='APLICADO').estado_destino,'AUTORIZADO','el estado del destino distingue autorizado de borrador');
 await falla(db,'captura','control_aguinaldo','RETIRAR',{id:l2.id,version:l2.version,motivo:'x'},/flujo autorizado|motivo/,'sin motivo o protegido');
 const hist=await call(db,'consulta','control_aguinaldo','HISTORIAL',{obra_id:ids.obra,ejercicio:2026});
 eq(hist.lineas.map(x=>x.estado).sort(),['APLICADO','APLICADO','APLICADO','RETIRADO'],'historial con retiro conservado');
 console.log(`PASS aguinaldo PostgreSQL: ${n} comprobaciones; huellas y entradas idénticas sin aguinaldo, faltas históricas versionadas, aplicación idempotente y todo-o-nada, saldo por patrón, periodos protegidos, retiro y periodicidades separadas.`);
 await db.close();
})().catch(e=>{console.error(e);process.exit(1);});
