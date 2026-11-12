const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const file=path.resolve('supabase/functions/gemini-extract/banco.mjs');
if(!fs.existsSync(file)){console.log('ALCANCE PRIVADO: adaptador bancario Edge no disponible.');process.exit(0);}
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};
(async()=>{
 const {handleBanco,BANK_SYSTEM,BANK_SCHEMA}=await import(pathToFileURL(file));
 const pdf=new TextEncoder().encode('%PDF-fragmento-ficticio');let descargas=0,lecturas=0,paginas=[2],sinPermiso=false,huella=true;
 const cfg={headers:{'Content-Type':'application/json'},rpc:async(a,j)=>{eq(a,'PREPARAR_IA');if(sinPermiso)throw Error('Sin permiso para el centro');return{archivo:'bancos-historicos/obra/fragmento.pdf',hash:'HASH',paginas,archivo_original_id:'ORIGINAL'};},
  download:async()=>{descargas++;return pdf;},hash:async()=>huella?'HASH':'OTRO',read:async(b,contract)=>{lecturas++;eq(b,pdf,'lee el fragmento archivado');eq(contract.system,BANK_SYSTEM,'mismo contrato bancario');eq(contract.schema,BANK_SCHEMA,'mismo esquema');return{registros:[{importe:500,estado:'EXITOSO'}]};}};
 let r=await handleBanco({tipo:'bbva_historico_fragmento',archivo_id:'FRAGMENTO'},cfg);eq(r.status,200);eq((await r.json()).requiere_confirmacion,true);
 paginas=[1,2];r=await handleBanco({tipo:'bbva_historico_fragmento',archivo_id:'FRAGMENTO'},cfg);eq(r.status,422,'rechaza el documento completo como fallback');eq(lecturas,1,'no reenvía páginas correctas');
 paginas=[2];huella=false;r=await handleBanco({tipo:'bbva_historico_fragmento',archivo_id:'FRAGMENTO'},cfg);eq(r.status,422,'rechaza original cambiado');eq(lecturas,1);
 huella=true;sinPermiso=true;const antes=descargas;r=await handleBanco({tipo:'bbva_historico_fragmento',archivo_id:'FRAGMENTO'},cfg);eq(r.status,422);eq(descargas,antes,'no descarga sin autorización');
 sinPermiso=false;paginas=[2];cfg.read=async()=>{throw Object.assign(Error('Proveedor temporalmente no disponible'),{retryable:true});};r=await handleBanco({tipo:'bbva_historico_fragmento',archivo_id:'FRAGMENTO'},cfg);eq(r.status,503,'fallo recuperable conservado');eq((await r.json()).retryable,true);
 // La ruta previa conserva cierre, archivo y transporte.
 cfg.read=async()=>({registros:[]});r=await handleBanco({tipo:'bbva_conciliador',cierre_id:'CIERRE',archivo_id:'ORIGINAL'},cfg);eq(r.status,200,'compatibilidad bancaria previa');
 console.log('PASS Edge bancario histórico: '+n+' comprobaciones de fragmento, autorización, huella, 503 y compatibilidad.');
})().catch(e=>{console.error(e);process.exitCode=1;});
