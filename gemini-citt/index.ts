// Lectura asistida de certificados IMSS. No guarda ni altera nómina.
// La imagen sólo se envía a Gemini tras una acción explícita del usuario.
const URL = Deno.env.get('SUPABASE_URL') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';
const ORIGINS = ['https://platinumhidalguense.github.io',
  'http://localhost:3000','http://127.0.0.1:3000','http://localhost:5500','http://127.0.0.1:5500',
  ...(Deno.env.get('ORIGENES_PERMITIDOS') || '').split(',').map(x=>x.trim()).filter(Boolean)];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const golpes = new Map<string,number[]>();

function headers(origin:string|null) {
  const h:Record<string,string> = {'Content-Type':'application/json','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin && ORIGINS.includes(origin))h['Access-Control-Allow-Origin']=origin;
  return h;
}
function reply(body:unknown,status:number,origin:string|null){return new Response(JSON.stringify(body),{status,headers:headers(origin)});}
async function db(jwt:string,path:string,body?:unknown){
  return fetch(`${URL}/rest/v1/${path}`,{method:body===undefined?'GET':'POST',
    headers:{apikey:ANON,Authorization:`Bearer ${jwt}`,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const str=(v:unknown,n=160)=>typeof v==='string'?v.trim().slice(0,n):null;
const iso=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  !Number.isNaN(Date.parse(v+'T12:00:00Z'))?v:null;
function sumarDias(inicio:string,dias:number){const d=new Date(inicio+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+dias-1);return d.toISOString().slice(0,10);}
const REINTENTABLE = new Set([408,429,500,502,503,504]);
type ResultadoGemini = {respuesta?:Response;error?:string;status?:number;retryable?:boolean};
async function llamarGemini(model:string,key:string,contenido:string):Promise<ResultadoGemini>{
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  for(let intento=0;intento<3;intento++){
    let respuesta:Response;
    try{
      respuesta=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
        body:contenido,signal:AbortSignal.timeout(25000)});
    }catch(e){
      console.error('gemini-citt: fallo temporal de conexión',intento+1,String((e as Error)?.name||'error'));
      if(intento===2)return {error:'La conexión con Gemini no respondió. Intenta de nuevo en unos minutos.',status:503,retryable:true};
      await new Promise(r=>setTimeout(r,1200*2**intento+Math.floor(Math.random()*400)));
      continue;
    }
    if(respuesta.ok)return {respuesta};
    console.error('gemini-citt: Gemini respondió',respuesta.status,'intento',intento+1,'modelo',model);
    if(!REINTENTABLE.has(respuesta.status))return {status:respuesta.status,retryable:false};
    if(intento===2)return {status:respuesta.status,retryable:true};
    const despues=Number(respuesta.headers.get('retry-after'));
    const espera=Number.isFinite(despues)&&despues>0?Math.min(despues*1000,5000):1200*2**intento+Math.floor(Math.random()*400);
    await new Promise(r=>setTimeout(r,espera));
  }
  return {status:503,retryable:true};
}

Deno.serve(async req=>{
  const origin=req.headers.get('Origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=='POST')return reply({error:'Método no permitido'},405,origin);
  if(origin&&!ORIGINS.includes(origin))return reply({error:'Origen no autorizado'},403,origin);
  if(!URL||!ANON||!Deno.env.get('GEMINI_API_KEY'))return reply({error:'Configuración del servicio incompleta'},503,origin);
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!jwt)return reply({error:'Sesión requerida'},401,origin);
  try{
    const auth=await fetch(`${URL}/auth/v1/user`,{headers:{apikey:ANON,Authorization:`Bearer ${jwt}`}});
    if(!auth.ok)return reply({error:'Sesión inválida'},401,origin);
    const user=await auth.json();
    const now=Date.now(),prev=(golpes.get(user.id)||[]).filter(t=>now-t<60000);
    if(prev.length>=4)return reply({error:'Límite temporal de lecturas; espera un minuto'},429,origin);
    prev.push(now);golpes.set(user.id,prev);if(golpes.size>500)golpes.clear();
    const body=await req.json();
    if(!UUID.test(body.obra_id||'')||!MIME.has(body.mime)||typeof body.imagen!=='string'||
       body.imagen.length>11_200_000||body.imagen.length<1000||
       !/^[A-Za-z0-9+/]+={0,2}$/.test(body.imagen))return reply({error:'Archivo o centro de trabajo inválido'},400,origin);
    const [salud,escritura,obra]=await Promise.all([
      db(jwt,'rpc/control_puede_ver_salud',{}),db(jwt,'rpc/app_puede_escribir',{}),
      db(jwt,'rpc/app_ve_obra',{p_obra:body.obra_id})]);
    if(!salud.ok||!escritura.ok||!obra.ok||
       await salud.json()!==true||await escritura.json()!==true||await obra.json()!==true)
      return reply({error:'Sin autorización de salud/escritura en este centro'},403,origin);
    const prompt=`Extrae sólo lo que sea legible de este CERTIFICADO DE INCAPACIDAD TEMPORAL PARA EL TRABAJO del IMSS.
Devuelve SOLO un objeto JSON. Jamás inventes, supongas o corrijas identificadores. Campos ausentes o ilegibles = null.
No transcribas diagnósticos ni detalles clínicos. Fechas AAAA-MM-DD. Días autorizados como entero.
Campos: documento ("CERTIFICADO_INCAPACIDAD_IMSS" o "OTRO"), nombre_asegurado, nss (solo dígitos), curp,
folio_certificado (serie y folio), tipo_certificado (INICIAL/SUBSECUENTE/ENLACE/RECAIDA/OTRO),
ramo_certificado (ENFERMEDAD_GENERAL/RIESGO_TRABAJO/MATERNIDAD/OTRO), probable_riesgo_trabajo (true/false/null),
fecha_inicio, dias_autorizados, fecha_expedicion, dias_acumulados, patron, unidad_medica_expedidora,
umf_adscripcion, delegacion_expedidora, delegacion_adscripcion, nivel_atencion, puesto_trabajo,
control_maternidad, medico, matricula_medico, numero_identificacion, agregado_medico, cve_ptal,
consultorio, turno, sexo, fecha_nacimiento, advertencias (lista breve de campos ilegibles o ambiguos).
"Probable riesgo: SI" NO significa riesgo calificado. NO deduzcas quién pagará ni días subsidiados.
Si no es un certificado IMSS, documento="OTRO".`;
    const key=Deno.env.get('GEMINI_API_KEY')!;
    const contenido=JSON.stringify({contents:[{parts:[{text:prompt},{inlineData:{mimeType:body.mime,data:body.imagen}}]}],
      generationConfig:{responseMimeType:'application/json',maxOutputTokens:3500,temperature:0}});
    const llamada=await llamarGemini(MODEL,key,contenido);
    if(!llamada.respuesta){
      const temporal=llamada.retryable===true;
      return reply({error:temporal?'Gemini está temporalmente saturado. Se intentó la lectura tres veces; conserva el archivo y vuelve a intentarlo en unos minutos.':
        `Gemini rechazó la lectura (${llamada.status}). Revisa la configuración del modelo o registra el certificado manualmente.`,retryable:temporal},
        temporal?503:502,origin);
    }
    const raw=await llamada.respuesta.json();
    const answer=(raw.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||'').join('');
    let x:any;try{x=JSON.parse(answer);}catch{return reply({error:'La lectura no produjo datos verificables'},502,origin);}
    if(x.documento!=='CERTIFICADO_INCAPACIDAD_IMSS')return reply({error:'La imagen no se reconoció como certificado IMSS'},422,origin);
    const inicio=iso(x.fecha_inicio),dias=Number(x.dias_autorizados);
    if(!inicio||!Number.isInteger(dias)||dias<1||dias>365||!str(x.nombre_asegurado))
      return reply({error:'No se pudieron verificar nombre, fecha y días. Captura el caso manualmente.'},422,origin);
    const enumVal=(v:unknown,permitidos:string[])=>permitidos.includes(String(v))?String(v):'SIN_CERTIFICADO';
    const dato={nombre_asegurado:str(x.nombre_asegurado),nss:str(x.nss,20)?.replace(/\D/g,''),
      curp:str(x.curp,20)?.toUpperCase(),folio_certificado:str(x.folio_certificado,80),
      tipo_certificado:enumVal(x.tipo_certificado,['INICIAL','SUBSECUENTE','ENLACE','RECAIDA']),
      ramo_certificado:enumVal(x.ramo_certificado,['ENFERMEDAD_GENERAL','RIESGO_TRABAJO','MATERNIDAD']),
      probable_riesgo_trabajo:x.probable_riesgo_trabajo===true,fecha_inicio:inicio,
      fecha_hasta:sumarDias(inicio,dias),dias_autorizados:dias,fecha_expedicion:iso(x.fecha_expedicion),
      dias_acumulados:Number.isInteger(Number(x.dias_acumulados))?Number(x.dias_acumulados):null,
      patron:str(x.patron,180),unidad_medica_expedidora:str(x.unidad_medica_expedidora),
      umf_adscripcion:str(x.umf_adscripcion),delegacion_expedidora:str(x.delegacion_expedidora),
      delegacion_adscripcion:str(x.delegacion_adscripcion),nivel_atencion:str(x.nivel_atencion,40),
      puesto_trabajo:str(x.puesto_trabajo),control_maternidad:str(x.control_maternidad,20),
      medico:str(x.medico),matricula_medico:str(x.matricula_medico,40),
      numero_identificacion:str(x.numero_identificacion,80),agregado_medico:str(x.agregado_medico,40),
      cve_ptal:str(x.cve_ptal,40),consultorio:str(x.consultorio,40),turno:str(x.turno,40),
      sexo:str(x.sexo,20),fecha_nacimiento:iso(x.fecha_nacimiento),
      advertencias:Array.isArray(x.advertencias)?x.advertencias.map((v:unknown)=>str(v,160)).filter(Boolean).slice(0,8):[]};
    if(!dato.folio_certificado||(!dato.nss&&!dato.curp))dato.advertencias.push('Identificador o folio no legible; revisa el original.');
    return reply({ok:true,modelo:MODEL,datos:dato},200,origin);
  }catch{return reply({error:'No se pudo procesar el certificado'},500,origin);}
});

