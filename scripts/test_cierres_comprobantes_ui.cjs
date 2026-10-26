const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
// Recorrido de botones con respuesta simulada; sin navegador ni pagos reales.
let checks=0,view='',messages=[],calls=[],confirm=true,fail=false,change=false,remaining=358,closed=false,incomplete=false;
const c={id:'C',obra_id:'O',semana:25,periodo:'SEMANAL',estado:'TIMBRADO',snapshot:{items:[]},total_neto:100};
const saldo={id:'B',obligacion_id:'B',cierre_id:'C',obra_id:'O',trabajador_id:'W',semana:25,numero:1,nombre:'PERSONA FICTICIA',tipo:'NOMINA',importe:100,saldo:100,vigente:true};
const plan=()=>({cierre_id:'C',semana:25,historico:true,puede_confirmar:true,plan_sha256:'PLAN',vinculables:remaining,pendientes:remaining,filas:[{...saldo,estado:'EXACTO_POR_VINCULAR',comprobante:{pago_id:'P',fuente:{folio:'FICTICIO'}}}]});
const elements={'flow-link-progress':{textContent:''},'flow-link-confirm':{disabled:false}};
const ctx={obra:{id:'O',nombre:'OBRA FICTICIA'},workers:[],empresaNombre:'PLATINUM',sb:{rpc:async(n,a)=>{
 calls.push(a);if(a.p_accion==='PERMISOS')return{data:{escritura:true,admin:true,aprobar_cierre:true}};
 if(a.p_accion==='DETALLE')return{data:{cierre:c,flujo:{version_id:'V',sucio:false},diagnostico:{filas:[]},saldos:remaining?[saldo]:[],versiones:[],solicitudes:[],pagos:[],cheques:[]}};
 if(a.p_accion==='APLICAR_CENTAVOS_APROBADOS')return{data:{aplicado:false}};
 if(a.p_accion==='PLAN_COMPROBANTES')return{data:plan()};
 if(a.p_accion==='VINCULAR_COMPROBANTES_LOTE'){if(fail)return{error:{message:'Fallo ficticio de lote'}};if(incomplete)return{data:{vinculados:1,restantes:null,plan_sha256:'PLAN'}};const n=Math.min(20,remaining);remaining-=n;if(change)ctx.obra={id:'OTRA'};return{data:{vinculados:n,restantes:remaining,plan_sha256:'PLAN'}};}
 if(a.p_accion==='TRANSICION'){closed=true;return{data:{ok:true}};}
 return{data:{ok:true}};
}}};
const box={Date,Intl,confirm:()=>confirm,prompt:()=>'',crypto:require('crypto').webcrypto};vm.createContext(box);vm.runInContext(fs.readFileSync('platinum-workflows.js','utf8'),box);
const f=box.PLATINUM_FLOWS;f.configure({context:()=>ctx,$:id=>elements[id],esc:x=>String(x??''),money:x=>Number(x??0).toFixed(2),table:(h,r)=>h.join('|')+r.join(''),modal:x=>view=x,toast:x=>messages.push(x),reload:async()=>{}});
(async()=>{
 // Acceso masivo directo desde listado, sin haber abierto antes la vista integrada.
 await f.revisarComprobantes('C');assert(view.includes('Vincular todos los coincidentes (358)'));assert(!closed);checks+=2;
 // Botón de pago también ofrece el mismo flujo, nunca 358 confirmaciones.
 await f.transicion('C','PAGADO');assert(view.includes('Comprobantes importados'));assert(!closed);checks+=2;
 assert(view.includes('Vincular todos los coincidentes (358)'));checks++;
 for(const m of view.matchAll(/onclick="PLATINUM_FLOWS\.(\w+)\(/g)){assert.equal(typeof f[m[1]],'function');checks++;}
 confirm=false;await f.confirmarVinculos('C');assert(!calls.some(x=>x.p_accion==='VINCULAR_COMPROBANTES_LOTE'));checks++;
 confirm=true;await f.confirmarVinculos('C');assert.equal(calls.filter(x=>x.p_accion==='VINCULAR_COMPROBANTES_LOTE').length,18);assert.equal(remaining,0);assert(!closed);checks+=3;
 assert(messages.at(-1).includes('358 vínculo(s)'));assert.equal(elements['flow-link-confirm'].disabled,false);checks+=2;
 remaining=1;fail=true;await f.revisarComprobantes('C');await f.confirmarVinculos('C');assert(messages.at(-1).includes('Fallo ficticio'));assert.equal(elements['flow-link-confirm'].disabled,false);assert(!closed);checks+=3;
 fail=false;incomplete=true;await f.revisarComprobantes('C');await f.confirmarVinculos('C');assert(messages.at(-1).includes('incompleto'));assert(!closed);checks+=2;
 incomplete=false;change=true;await f.revisarComprobantes('C');await f.confirmarVinculos('C');assert(messages.at(-1).includes('contexto'));assert(!closed);checks+=2;
 assert(calls.every(x=>!['TRANSICION','APLICAR_PAGO'].includes(x.p_accion)));checks++;
 console.log('PASS '+checks+' contratos de revisión bancaria: preflight al pagar, botones, doble confirmación, lotes, fallos, alcance y ningún pago implícito.');
})().catch(e=>{console.error(e);process.exitCode=1;});
