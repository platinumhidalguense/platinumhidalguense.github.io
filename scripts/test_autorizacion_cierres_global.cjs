// Adaptador al flujo transaccional; permisos comprobados en PostgreSQL.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),html=require('./fuente_frontend.cjs').html();
const a=html.indexOf('async function ctrlCambiarCierre('),b=html.indexOf('async function openCtrlConciliacionSelector(',a);
(async()=>{
 const messages=[],calls=[],ctx={window:{},toast:m=>messages.push(m)};vm.createContext(ctx);vm.runInContext(html.slice(a,b),ctx);
 await ctx.ctrlCambiarCierre('c','AUTORIZADO');assert(messages[0].includes('No cargó'));assert.equal(calls.length,0);
 ctx.window.PLATINUM_FLOWS={transicion:async(...x)=>{calls.push(x);return 'confirmado';}};
 assert.equal(await ctx.ctrlCambiarCierre('c','AUTORIZADO'),'confirmado');assert.deepEqual(calls[0],['c','AUTORIZADO']);
 assert(!html.slice(a,b).includes('.update('),'No autorizar por una vía alternativa');
 console.log('OK transición delegada, sin falso éxito cuando falta el módulo. Permisos y doble aprobación probados en PostgreSQL.');
})().catch(e=>{console.error(e);process.exitCode=1;});
