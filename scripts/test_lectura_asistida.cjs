const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=Date.now(),timer;class Clock extends Date{static now(){return now;}}
const window={},box=vm.createContext({window,Date:Clock,AbortController,setTimeout:f=>(timer=f,1),clearTimeout:()=>{timer=null;}});
vm.runInContext(fs.readFileSync('frontend/modulos/85-lectura-asistida.js','utf8'),box);
const service=window.PLATINUM_LECTURA_ASISTIDA,region={campo:'rfc',pagina:2,valor:'PRUP900101AA1',texto:'RFC PRUP900101AA1'},p={usuario:'usuario-ficticio',obra_id:'obra-ficticia',huella:'a'.repeat(64),region};
(async()=>{
 let fases=[],llamadas=0;
 const good=async(body,signal)=>{llamadas++;assert.equal(body.tipo,'recibo_fragmento');assert.equal(body.usuario,undefined);assert.equal(body.original,undefined);assert(signal);return{data:{ok:true,literal:region.valor}};};
 assert.equal(await service.leer(p,good,s=>fases.push(s.estado)),region.valor);
 assert.deepEqual(fases,['PREPARANDO','LEYENDO','VALIDANDO','RESULTADO']);assert.equal(timer,null);
 await service.leer(p,good);assert.equal(llamadas,1,'Vista nueva conserva propuesta del mismo hash');
 await service.leer({...p,usuario:'otro'},good);assert.equal(llamadas,2,'No reutiliza otra sesión');
 const p2={...p,huella:'b'.repeat(64)},fecha=new Date(now+60000).toISOString();
 await assert.rejects(service.leer(p2,async()=>({error:{context:new Response(JSON.stringify({error:'Ocupado por proveedor',temporal:true,reintentar_en:fecha}),{status:503})}}),s=>fases.push(s.estado)),/Ocupado por proveedor.*Reintenta/);
 assert.equal(fases.at(-1),'PAUSADO');await assert.rejects(service.leer(p2,good),/pausa/);assert.equal(llamadas,2);
 now+=61000;assert.equal(await service.leer(p2,good),region.valor);assert.equal(llamadas,3);
 const fresh=h=>({...p,huella:h.repeat(64)});
 await assert.rejects(service.leer(fresh('c'),async()=>({error:{context:new Response(JSON.stringify({error:'Sin permiso en este centro'}),{status:403})}})),/Sin permiso/);
 await assert.rejects(service.leer(fresh('d'),async()=>({error:{message:'FunctionsFetchError'}})),/conexión/);
 await assert.rejects(service.leer(fresh('e'),async()=>({data:{ok:true,literal:'OTRO900101AA1'}})),/literalmente/);
 let resolver;const pending=service.leer(fresh('f'),()=>new Promise(r=>resolver=r));await assert.rejects(service.leer(fresh('f'),good),/ya se está leyendo/);resolver({data:{ok:true,literal:region.valor}});await pending;
 const timeout=service.leer(fresh('0'),()=>new Promise(()=>{}));timer();await assert.rejects(timeout,/tiempo de espera/);assert.equal(timer,null);
 now+=61000;await service.leer(fresh('0'),good);
 console.log('PASS lectura asistida: fases, red, permiso, 503, reintento, timeout, desbloqueo, literal y caché por usuario/hash.');
})().catch(e=>{console.error(e);process.exitCode=1;});
