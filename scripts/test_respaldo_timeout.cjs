// Regresión de timeout: fuentes ficticias a escala real, sin navegador ni datos personales.
'use strict';
const assert=require('node:assert/strict');
const {fixture,servidor,cargar,opt}=require('./test_respaldo_integral.cjs');
const api=cargar().PLATINUM_RESPALDO,T=api._pruebas;
let checks=0;function ok(x,m){assert.ok(x,m);checks++;}
async function main(){
 const db=fixture(2),obra=db.obras[0].id,w=db.trabajadores[0].id;
 db.historial=Array.from({length:44547},(_,i)=>({id:i*3+1,obra_id:obra,trabajador_id:w,accion:'PRUEBA',datos_antes:{valor:i},datos_despues:{valor:i+1}}));
 db.lecturas_fiscales_documentos=Array.from({length:11365},(_,i)=>({documento_id:'20000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),obra_id:obra,trabajador_id:w,datos:{neto:i/100}}));
 const before=JSON.stringify(db),events=[],sb=servidor(db,{cap:173,timeoutPage:'historial',timeoutInternal:'lecturas_fiscales_documentos',timeoutAbove:50,timeoutAfter:true});
 const result=await T.recolectar({...opt(sb,[],{intentos:3,progreso:p=>events.push(p.texto)}),sesion:()=>null});
 const platinum=result.conjuntos.find(x=>x.empresa==='PLATINUM');
 ok(platinum.datos.get('historial').length===44547,'historial completo a escala real');
 ok(platinum.datos.get('lecturas_fiscales_documentos').length===11365,'todas las lecturas fiscales');
 const ids=platinum.datos.get('historial').map(x=>x.id);
 ok(new Set(ids).size===44547&&ids[0]===1&&ids.at(-1)===133639,'sin huecos ni duplicados');
 const hr=sb.req.filter(x=>x.k==='historial');
 ok(hr.every(x=>x.a===0),'no OFFSET profundo en historial');
 ok(hr.some(x=>x.cursor!==null&&x.b-x.a+1===31),'reduce bloque desde cursor ya recibido');
 ok(hr.filter(x=>x.cursor===hr.find(y=>y.cursor!==null).cursor&&x.b-x.a+1===250).length===1,'timeout no repite mismo bloque tres veces');
 const ir=sb.rpcCalls.filter(x=>x.p_accion==='LEER'&&x.p_datos.fuente==='lecturas_fiscales_documentos').map(x=>x.p_datos);
 ok(ir.some(x=>x.despues&&x.limite===50),'fuente interna reduce sin perder cursor');
 ok(events.some(x=>/ajustando lectura/.test(x))&&events.some(x=>/44547 de 44547/.test(x)),'progreso visible de ajuste y completitud');
 ok(JSON.stringify(db)===before,'ningún dato alterado');
 // Claves bigint que JS no puede representar: conservarlas como texto al cursar.
 const large=fixture(1);large.historial=Array.from({length:1007},(_,i)=>({id:(90071992547409930n+BigInt(i*2)).toString(),obra_id:obra}));
 const ls=servidor(large,{cap:73}),all=await T.pagina({...opt(ls,[]),progreso:()=>{}},()=>ls.from('historial').select('id,obra_id'),['id'],1007,'historial');
 ok(all.length===1007&&all.at(-1).id==='90071992547411942','cursor textual exacto sin Number');
 ok(ls.req.every(x=>x.a===0),'clave única siempre sin OFFSET');
 // Error persistente: reducir hasta mínimo; no entregar un archivo truncado.
 const bad=servidor(fixture(),{timeoutPage:'historial',timeoutAbove:0}),downloads=[];
 await assert.rejects(()=>api.exportar(opt(bad,downloads,{intentos:3})),/historial|Cambio del expediente/);checks++;
 ok(downloads.length===0,'timeout definitivo nunca descarga');
 ok(bad.req.filter(x=>x.k==='historial').map(x=>x.b+1).join(',')==='250,125,62,31,15,10','reducción acotada, sin repetición inútil');
 const internal=fixture();internal.lecturas_fiscales_documentos=db.lecturas_fiscales_documentos.slice(0,2);
 const failing=servidor(internal,{timeoutInternal:'lecturas_fiscales_documentos',timeoutAbove:0}),files=[];
 await assert.rejects(()=>api.exportar(opt(failing,files)),/Importes fiscales leídos/);checks++;
 ok(files.length===0,'fallo fiscal tampoco descarga');
 console.log('PASS timeout respaldo: '+checks+' comprobaciones; 44,547 históricos y 11,365 lecturas, cursor y reducción adaptativa. Sin escrituras ni navegador.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
