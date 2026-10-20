// Regresiones de los casos reportados. VM y datos ficticios, sin navegador.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn');
const nodes=new Map(),calls=[],messages=[];let mode='PROPUESTA',confirm=true,phrase='CREAR CHEQUES CONFIRMADOS',close=0,opened=null,reloads=0;
const normal=[{trabajador_id:'pagado',numero:1,estado:'TRANSFERENCIA_REGISTRADA',importe:2000},{trabajador_id:'pendiente',numero:646,estado:'PENDIENTE_AUTORIZACION',importe:2000,cierre_id:'cierre'},{trabajador_id:'listo',numero:652,estado:'ELEGIBLE_CONFIRMACION',importe:2000},{trabajador_id:'cero',numero:7,estado:'SIN_OBLIGACION',importe:0}];
const fins=[{id:'q1',trabajador_id:'w1',numero:443,estado:'LISTO_TRANSFERENCIA',pago_id:'p1',importe:388.98},{id:'q2',trabajador_id:'w2',numero:444,estado:'SIN_TRANSFERENCIA',importe:427.99,motivo:'Falta importar comprobante'},{id:'q3',trabajador_id:'w3',numero:470,estado:'CHEQUE_FISICO',importe:221.32,motivo:'No retirar cheque físico'}];
let permissions={confirmar:true,retirar:true,transferencia:true};let failTransfer=false;
const context={obra:{id:'obra',nombre:'Prueba'},empresaNombre:'Prueba',sb:{rpc:async(name,args)=>{
 calls.push({name,args});const a=args.p_accion;
 if(a==='PERMISOS')return{data:permissions};if(a==='AVISO')return{data:{semana:29,habilitado:true}};
 if(a==='TRANSFERIR_FINIQUITO')return failTransfer?{error:{message:'El pago cambió'}}:{data:{estado:'CONCILIADO_BANCO'}};
 if(a==='CREAR')return{data:{creados:1}};
 mode=a;return{data:{filas:a==='FINIQUITOS'?fins:normal,retiros:[],huella:'huella-'+a,habilitado:true,pagina:0,por_pagina:50,total:4,resumen:{PENDIENTE_AUTORIZACION:1}}};
}}};
function scan(html){for(const m of html.matchAll(/id="([^"]+)"/g))if(!nodes.has(m[1]))nodes.set(m[1],{value:'',textContent:'',hidden:false,innerHTML:''});}
const body={html:'',get innerHTML(){return this.html;},set innerHTML(v){this.html=v;scan(v);}};nodes.set('pago-sabado-body',body);
const box={console,Date,Intl,Map,Set,setInterval:()=>1,clearInterval(){},crypto:{randomUUID:()=> 'key'},confirm:()=>confirm,prompt:()=>phrase};
vm.createContext(box);vm.runInContext(fs.readFileSync('platinum-pagos-sabado.js','utf8'),box);const api=box.PLATINUM_PAGOS_SABADO;
api.configure({context:()=>context,$:id=>nodes.get(id),esc:x=>String(x??''),money:x=>String(x),table:(h,r)=>r.join(''),modal:scan,close:()=>close++,toast:(m,t)=>messages.push({m,t}),week:()=>29,reload:async()=>reloads++,onChange(){},banner(){},openCierre:async id=>opened=id});
const checkbox=id=>body.innerHTML.match(new RegExp('<input[^>]+onchange="PLATINUM_PAGOS_SABADO.seleccionar\\(\''+id+'\'[^>]*>'))?.[0];
const writes=()=>calls.filter(x=>['CREAR','RETIRAR','TRANSFERIR_FINIQUITO'].includes(x.args.p_accion));
const checked=id=>/\schecked(?:\s|>)/.test(checkbox(id));
(async()=>{
 await api.abrir(29);assert.equal(calls.find(x=>x.args.p_accion==='PROPUESTA').args.p_datos.estado,'PENDIENTES');
 assert(!checkbox('pendiente').includes('disabled'),'El pendiente se puede marcar para revisar aunque falte autorización');assert(checkbox('pagado').includes('disabled'));assert(checkbox('cero').includes('disabled'));
 api.seleccionar('pendiente',true);assert(checked('pendiente'));assert(body.innerHTML.includes('1 por resolver'));nodes.get('pago-sabado-reason').value='Revisión de prueba suficiente';await api.confirmar();assert.equal(writes().length,0,'Marcar no elimina candados de autorización');
 api.limpiar();assert(!checked('pendiente'));api.seleccionarVisibles();assert(checked('pendiente'));assert(checked('listo'));assert(!checked('pagado'));
 api.seleccionarListos();assert(!checked('pendiente'));assert(checked('listo'));await api.confirmar();assert.equal(writes().at(-1).args.p_accion,'CREAR');assert.deepEqual(JSON.parse(JSON.stringify(writes().at(-1).args.p_datos.ids)),['listo']);
 await api.abrir(29);await api.abrirCierre('ajeno');assert.equal(opened,null);await api.abrirCierre('cierre');assert.equal(opened,'cierre');assert.equal(close,1);
 await api.abrir(27,'FINIQUITOS');assert(!checkbox('q1').includes('disabled'));assert(checkbox('q2').includes('disabled'));assert(checkbox('q3').includes('disabled'));
 api.seleccionarVisibles();const n=writes().length;phrase='INCORRECTA';await api.confirmar();assert.equal(writes().length,n);phrase='CONFIRMAR TRANSFERENCIA';confirm=false;await api.confirmar();assert.equal(writes().length,n);confirm=true;
 await api.confirmar();const t=writes().at(-1);assert.equal(t.name,'control_flujo_operar');assert.equal(t.args.p_accion,'TRANSFERIR_FINIQUITO');assert.equal(t.args.p_datos.pago_id,'p1');assert.equal(t.args.p_datos.trabajador_id,'w1');assert.equal(t.args.p_datos.semana,27);assert(reloads>0);
 api.seleccionar('q1',true);failTransfer=true;await api.confirmar();assert(messages.some(x=>x.t==='err'&&x.m.includes('El pago cambió')),'No declara éxito ante fallo servidor');failTransfer=false;
 permissions={confirmar:false,retirar:false,transferencia:false};await api.abrir(27,'FINIQUITOS');assert(checkbox('q1').includes('disabled'));const prior=writes().length;api.seleccionarVisibles();await api.confirmar();assert.equal(writes().length,prior);
 // El acceso del importador no borra el cheque de finiquito por fuera del flujo.
 const src=fs.readFileSync('frontend/modulos/15-banca-conciliacion.js','utf8'),ast=acorn.parse(src,{ecmaVersion:'latest'}),f=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='pagoCancelarCheque');
 let routed=null,deletes=0;const q={id:'q',tipo_pago:'FINIQUITO',semana:'S27',estatus:'PENDIENTE',num_cheque:'',consecutivo:''};const ctx={CHEQUES:[q],toast(){},normSem:x=>String(x).replace(/\D/g,''),window:{PLATINUM_PAGOS_SABADO:{abrir:(...args)=>routed=args}},eliminarChequeErroneo:()=>deletes++};vm.createContext(ctx);vm.runInContext(src.slice(f.start,f.end),ctx);
 await ctx.pagoCancelarCheque('q');assert.deepEqual(routed,[27,'FINIQUITOS']);assert.equal(deletes,0);routed=null;q.num_cheque='100';await ctx.pagoCancelarCheque('q');assert.equal(routed,null);assert.equal(deletes,0);
 assert(src.includes(".abrir(Number(ns),'FINIQUITOS')"),'La importación ofrece conciliar, no cancela ni elimina automáticamente');
 console.log('PASS regresiones de selección real en HTML/VM: pendientes marcables, bloqueo de expedición, filtros, cierre correcto, doble confirmación, permiso, finiquito sin pago, cheque físico y fallo bancario.');
})().catch(e=>{console.error(e);process.exitCode=1;});
