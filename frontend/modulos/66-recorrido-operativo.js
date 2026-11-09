/* La preparación conecta lecturas y entradas existentes. No concede permisos ni cambia estados. */
(function(){
  'use strict';
  const core=window.PLATINUM_RECORRIDO_CORE;
  const sensibles=new Set(['trabajadores','historial','descuentos','incidencias_empleados','vacaciones','control_casos_imss','documentos','control_cierres_nomina','control_conciliacion_noi','control_eventos_integracion','pagos','cheques']);
  const local={actual:null};
  const contexto=()=>JSON.stringify([USER?.id,EMPRESA_ACTIVA,OBRA?.id]);
  const visible=s=>local.actual===s&&s.dueno===contexto()&&!!$('ro-cuerpo');
  const vigente=(s,t)=>visible(s)&&s.seq===t;
  const finanzas=s=>Boolean(s.permisos?.vip||s.permisos?.admin);
  const fecha=s=>String(s||'').slice(0,10);
  const rango=s=>[fecha(s?.desde),fecha(s?.hasta)].filter(Boolean).join(' a ');
  function periodo(s){
    if(s.cierre)return s.d?.detalle?.cierre?.snapshot;
    const d=s.d;
    if(s.preferencia==='QUINCENAL'&&d?.desde&&d?.hasta)return calendarioNominaQuincenal(d.desde,d.hasta);
    return d;
  }
  const m=v=>v==null?'Sin dato':'$'+money(v);
  const mc=v=>v==null?'—':m(v/100);
  const btn=(label,accion,extra='')=>'<button type="button" class="btn" data-ro="'+accion+'" '+extra+'>'+esc(label)+'</button>';
  const opt=(v,l,selected)=>'<option value="'+esc(v)+'" '+(v===selected?'selected':'')+'>'+esc(l)+'</option>';
  const cell=v=>'<td>'+esc(v??'—')+'</td>';
  function centro(s){return OBRAS.find(o=>o.id===s.obra&&o.activa!==false&&empresaDeObra(o)===EMPRESA_ACTIVA);}
  function centros(){return OBRAS.filter(o=>o.activa!==false&&empresaDeObra(o)===EMPRESA_ACTIVA);}
  async function leer(q,s){
    const r=await(q.abortSignal?q.abortSignal(s.ctrl.signal):q);
    if(r.error)throw Error(r.error.message);
    if(r.data==null)throw Error('La fuente no confirmó datos.');
    return r.data;
  }
  function rrhh(a,p,s){return leer(sb.rpc('control_rrhh_operar',{p_accion:a,p_datos:p}),s);}
  function abrir(sem=null,trabajador=null,cierre=null,preferencia=null){
    if(!USER?.id||!OBRA||SOLO_CONTRATOS)return;
    if($('worker-form-body')||window.PLATINUM_CONCILIADOR?.estaCapturando?.()||window.PLATINUM_RRHH?.estaCapturando?.()){
      toast('Termina o cierra la captura actual antes de abrir la preparación.','err');
      return;
    }
    const anterior=local.actual;
    anterior?.ctrl?.abort();
    const dueno=contexto();
    const retoma=anterior?.dueno===dueno&&
      ((sem==null&&!trabajador&&!cierre&&!preferencia)||
      (Number(sem)===anterior.sem&&(trabajador||null)===(anterior.trabajador||null)&&(cierre||null)===(anterior.cierre||null)&&!preferencia));
    const s=retoma?anterior:{
      dueno,obra:OBRA.id,sem:sem==null?null:Number(sem),trabajador,cierre,preferencia,
      vista:'pendientes',tipo:'',estado:'',rol:'',responsable:'',q:'',p:0,rr:0,vp:0,seq:0,rev:0
    };
    local.actual=s;
    modal('<div class="m-head"><h2>Preparación del periodo</h2><button class="x" onclick="closeModal()">×</button></div>'+
      '<div class="m-body" id="ro-panel"><style>.ro-linea{display:flex;flex-wrap:wrap;gap:9px;align-items:end;margin:8px 0 12px}.ro-linea label{display:grid;gap:4px}.ro-alerta{color:var(--amber);margin:10px 0}.ro-tabla{overflow:auto;max-height:53vh}.ro-tabla table{min-width:660px}</style>'+
      '<div id="ro-controles"></div><div id="ro-aviso" class="ro-alerta" role="status"></div><div id="ro-cuerpo"></div></div>','xl');
    $('ro-panel').onclick=e=>{const b=e.target.closest('[data-ro]');if(b)seguro(()=>accion(s,b));};
    $('ro-panel').onchange=e=>seguro(()=>filtro(s,e.target));
    return recargar(s);
  }
  function seguro(fn){return Promise.resolve().then(fn).catch(e=>toast(e.message,'err'));}
  function controles(s){
    const d=s.d,op=s.permisos||{},periodos=(d?.cierres||[]).filter(c=>Number(c.semana)===s.sem);
    $('ro-controles').innerHTML='<p class="fhint">'+esc(razonSocialEmpresa(EMPRESA_ACTIVA))+' · '+esc(centro(s)?.nombre)+' · '+esc(rango(periodo(s))||'Intervalo sin confirmar')+
      (s.comprobado?' · comprobado '+esc(new Date(s.comprobado).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})):'')+'</p>'+
      '<div class="ro-linea"><label>Centro permitido<select id="ro-centro">'+centros().map(o=>opt(o.id,o.nombre,s.obra)).join('')+'</select></label>'+
      '<label>Semana del centro<input type="number" min="1" max="53" id="ro-semana" value="'+esc(s.sem??'')+'"></label>'+
      (finanzas(s)?'<label>Cierre y periodicidad<select id="ro-cierre">'+opt('','Seleccione un cierre',s.cierre||'')+
      periodos.map(c=>opt(c.id,c.periodo+' · '+c.estado,s.cierre)).join('')+'</select></label>':'')+
      btn('Revalidar fuentes','revalidar')+btn('Solicitudes y aprobaciones','solicitudes')+
      (op.admin?btn('Consolidado de administración','consolidado'):'')+'</div>'+
      '<div class="ro-linea">'+btn('Pendientes','vista','data-vista="pendientes"')+
      (finanzas(s)?btn('Obligaciones y pagos','vista','data-vista="pagos"')+btn('Comparar versiones','vista','data-vista="comparar"'):'')+
      (s.trabajador?btn('Quitar filtro de trabajador','quitar'):'')+'</div>';
    if(s.obra!==OBRA.id)$('ro-controles').insertAdjacentHTML('beforeend','<p class="fhint">Consulta de otro centro autorizado. Para abrir sus herramientas, selecciónalo primero en el menú de centros.</p>');
  }
  async function recargar(s){
    if(!visible(s)||!centro(s))return;
    if(s.sem!=null&&(!Number.isInteger(s.sem)||s.sem<1||s.sem>53))throw Error('Semana fuera de rango.');
    s.ctrl?.abort();s.ctrl=new AbortController();
    const t=++s.seq,rev=s.rev;
    s.d=null;s.lista=null;s.corte=null;s.permisos=null;s.responsables=[];s.p=0;s.vp=0;
    s.comprobado=null;s.errores=[];s.compare=null;s.versiones=null;s.refs=new Map();s.a='';s.b='';
    controles(s);
    $('ro-aviso').textContent='';
    $('ro-cuerpo').innerHTML='<p role="status">Consultando fuentes del periodo…</p>';
    try{
      const p=await rrhh('PERMISOS',{},s);
      if(!vigente(s,t))return;
      if(p.usuario_id!==USER.id)throw Error('La consulta de permisos pertenece a otra sesión.');
      s.permisos=p;
    }catch(e){
      if(!vigente(s,t))return;
      s.errores.push('Permisos RRHH: '+e.message);
      s.vista='pendientes';
      controles(s);mostrar(s);return;
    }
    if(!finanzas(s)){
      s.vista='pendientes';s.cierre=null;
      s.sem??=Math.max(1,Math.min(53,isoWeekDe(centro(s))));
    }else try{
      const d=await leer(sb.rpc('control_conciliacion_semanal',{p_obra:s.obra,p_semana:s.sem,p_cierre:s.cierre}),s);
      if(!vigente(s,t))return;
      const c=d.detalle?.cierre;
      if(d.obra_id!==s.obra||(s.sem!=null&&d.semana!==s.sem)||(s.cierre&&c?.id!==s.cierre)||
        (d.detalle&&(!c||c.obra_id!==s.obra||c.semana!==d.semana))){
        s.errores.push('La consulta de nómina devolvió otro contexto.');
      }else{
        s.d=d;s.sem=d.semana;
        const candidatos=(d.cierres||[]).filter(c=>c.semana===s.sem);
        if(!s.cierre&&(candidatos.length<=1||s.preferencia)){
          const preferido=s.preferencia&&candidatos.find(c=>c.periodo===s.preferencia);
          if(preferido&&preferido.id!==d.detalle?.cierre.id){s.cierre=preferido.id;return recargar(s);}
          if(!s.preferencia||preferido)s.cierre=d.detalle?.cierre.id||null;
        }
      }
    }catch(e){if(vigente(s,t))s.errores.push('Nómina y pagos: '+e.message);}
    if(s.permisos?.admin){
      try{
        const r=await rrhh('RESPONSABLES',{obra_id:s.obra},s);
        if(!vigente(s,t))return;
        s.responsables=r.usuarios||[];
      }catch(e){if(vigente(s,t))s.errores.push('Responsables: '+e.message);}
    }
    if(s.sem!=null){
      try{
        const r=await rrhh('SEMANA',{obra_id:s.obra,semana:s.sem,pagina:s.rr},s);
        if(!vigente(s,t))return;
        s.lista=r;
        if(r.corte_id){
          const corte=await rrhh('PROCESO',{obra_id:s.obra,id:r.corte_id},s);
          if(!vigente(s,t))return;
          if(corte.proceso?.obra_id!==s.obra||Number(corte.proceso?.semana)!==s.sem)throw Error('El corte devuelto pertenece a otro periodo.');
          s.corte=corte;
        }
      }catch(e){if(vigente(s,t))s.errores.push('Corte y procesos: '+e.message);}
    }
    if(!vigente(s,t))return;
    s.comprobado=Date.now();s.obsoleto=s.rev!==rev;
    controles(s);mostrar(s);
  }
  function filas(s){
    const d=s.d,detail=s.cierre?d?.detalle:null,rows=[];
    const add=(tipo,estado,motivo,accion,more={})=>rows.push({tipo,estado,motivo,accion,...more});
    if(!s.lista)add('Corte','SIN DATOS','No se obtuvo el corte del periodo.','corte');
    else if(!s.lista.corte_id)add('Corte','PENDIENTE','Corte sin iniciar. Revisa movimientos e incidencias en sus fuentes.','corte');
    if(s.corte){
      for(const t of s.corte.tareas||[]){
        add('Corte',t.requiere_revision?'REVALIDAR':t.estado,t.titulo,'corte',{
          rol:t.rol_responsable,responsable:t.responsable_id,
          evidencia:t.evidencia?.detalle||'Verifica la comprobación en el corte.',
          documentos:t.evidencia?.documentos,fecha:t.fecha_objetivo
        });
      }
    }
    for(const p of s.lista?.procesos||[]){
      if(p.obra_id!==s.obra||Number(p.semana)!==s.sem||s.trabajador&&p.trabajador_id!==s.trabajador)continue;
      for(const t of p.tareas||[]){
        add(p.tipo,t.estado,t.titulo,'proceso',{rol:t.rol,responsable:t.responsable_id,
          persona:p.trabajador?.nombre,trabajador:p.trabajador_id,id:p.id,fecha:p.fecha_evento,
          evidencia:'Estado guardado. Abre el proceso para verificar la evidencia y la dependencia.'});
      }
    }
    if(d&&!detail)add('Nómina','PENDIENTE',s.cierre?'Detalle sin confirmar':(d.cierres||[]).some(c=>c.semana===s.sem)?'Selecciona la periodicidad del cierre.':'Sin fotografía guardada para esta semana.','cierre');
    if(detail){
      const c=detail.cierre;
      add('Nómina',detail.flujo?.sucio?'REVALIDAR':c.estado,detail.flujo?.sucio?'Cambió una fuente de la fotografía.':'Estado guardado de la fotografía.','cierre',{fecha:detail.flujo?.preparado_en});
      const dx=detail.diagnostico;
      if(dx&&(dx.pendientes||dx.fuera_snapshot))add('NOI / respaldo','OBSERVADO','El diagnóstico del cierre reporta diferencias o filas fuera de fotografía.','cierre',
        {evidencia:(dx.pendientes||0)+' pendientes; '+(dx.fuera_snapshot||0)+' fuera de fotografía.'});
      const sinLeer=(detail.recibos_sin_leer||[]).filter(f=>!s.trabajador||f.trabajador_id===s.trabajador).length;
      if(sinLeer)add('Fiscal','PENDIENTE','Hay recibos archivados que requieren verificación.','cierre',{evidencia:sinLeer+' PDF pendientes de lectura o cotejo.'});
      const fiscal={
        SIN_XML_O_PDF_TIMBRADO:'Falta XML o PDF fiscal verificable',
        CONTRADICCION_FISCAL:'Existe contradicción fiscal o XML inválido',
        DIFERENCIA_TIMBRADO:'El importe fiscal difiere del respaldo timbrado'
      };
      const porEstado=new Map();
      for(const f of detail.timbrado?.filas||[]){
        if(fiscal[f.estado]&&(!s.trabajador||f.tid===s.trabajador))
          porEstado.set(f.estado,(porEstado.get(f.estado)||0)+1);
      }
      for(const [estado,n] of porEstado)add('Fiscal',estado,fiscal[estado],'cierre',
        {evidencia:n+' caso(s) según validación interna. Vigencia SAT sin consultar.'});
    }
    for(const a of d?.alertas||[]){
      if(s.trabajador&&a.trabajador_id!==s.trabajador)continue;
      add('Pagos y cheques',a.severidad==='ROJO'?'OBSERVADO':'PENDIENTE',a.descripcion,'semana-pagos',{
        persona:a.nombre,trabajador:a.trabajador_id,evidencia:'Aviso de la semana del centro, sin atribución automática a este cierre.'
      });
    }
    const select=s.trabajador;
    if(select)add('Expediente','CONSULTA','Consulta movimientos, calendario, incidencias y evidencias de la persona.','expediente',{trabajador:select});
    return rows;
  }
  function mostrar(s){
    if(!visible(s))return;
    $('ro-aviso').textContent=[s.obsoleto?'Cambió una fuente desde la comprobación. Revalida antes de continuar.':'',...(s.errores||[])].filter(Boolean).join(' ');
    if(s.vista==='comparar')return mostrarComparador(s);
    if(s.vista==='pagos')return mostrarObligaciones(s);
    const all=filas(s);
    const rows=all.filter(r=>(!s.tipo||r.tipo===s.tipo)&&(!s.estado||r.estado===s.estado)&&
      (!s.rol||r.rol===s.rol)&&(!s.responsable||(s.responsable==='sin'?!r.responsable:
        s.responsable==='asignado'?!!r.responsable:r.responsable===(s.responsable==='mio'?USER.id:s.responsable)))&&
      (!s.q||[r.persona,r.motivo,r.evidencia].some(x=>String(x||'').toLocaleLowerCase('es-MX').includes(s.q.toLocaleLowerCase('es-MX')))));
    const opciones=(id,etiqueta,valores,sel)=>'<label>'+etiqueta+'<select id="'+id+'">'+opt('','Todos',sel)+[...new Set(valores.filter(Boolean))].sort().map(x=>opt(x,x,sel)).join('')+'</select></label>';
    s.rutas=rows;
    const filters='<div class="ro-linea">'+opciones('ro-tipo','Tipo',all.map(r=>r.tipo),s.tipo)+opciones('ro-estado','Estado',all.map(r=>r.estado),s.estado)+
      opciones('ro-rol','Rol responsable',all.map(r=>r.rol),s.rol)+
      '<label>Asignación<select id="ro-responsable">'+opt('','Todas',s.responsable)+opt('mio','A mi cargo',s.responsable)+
      opt('asignado','Asignadas',s.responsable)+opt('sin','Sin asignar',s.responsable)+s.responsables.filter(u=>u.id!==USER.id)
        .map(u=>opt(u.id,u.nombre,s.responsable)).join('')+'</select></label>'+
      '<label>Buscar en esta página<input id="ro-q" value="'+esc(s.q)+'"></label></div>';
    const ini=s.p*25;
    $('ro-cuerpo').innerHTML='<div class="ro-linea">'+btn('Corte semanal','corte')+btn('Procesos','procesos')+
      btn('Calendario e incidencias','calendario')+(s.permisos?.salud?btn('Expediente IMSS','imss'):'')+
      (s.sem?btn('Movimientos de la semana','movimientos'):'')+
      (s.d?.modo==='ACTUAL'?btn('Proyección del periodo','proyeccion'):'')+
      (finanzas(s)?btn('Conciliador del periodo','cierre'):'')+'</div>'+
      (!finanzas(s)?'<p class="fhint">Tu vista de preparación incluye el corte y el expediente dentro de tu alcance. El detalle financiero requiere permiso adicional.</p>':'')+
      '<p class="fhint">Los avisos de preparación se distinguen del diagnóstico que usa el servidor para autorizar. Tareas y alertas de semana pueden incluir más de una periodicidad.</p>'+filters+
      tabla(['Tipo / estado','Motivo / persona','Responsable / fecha','Fuente o dependencia','Acción'],
      rows.slice(ini,ini+25).map((r,i)=>'<tr>'+cell(r.tipo+' · '+r.estado)+cell([r.motivo,r.persona].filter(Boolean).join(' · '))+
        cell([r.rol,r.responsable?(r.responsable===USER.id?'A tu cargo':s.responsables.find(u=>u.id===r.responsable)?.nombre||'Asignado'):'Sin asignar',fecha(r.fecha)].filter(Boolean).join(' · '))+
        cell(r.evidencia||'Verifica la fuente original.')+'<td>'+btn('Ir al origen','fila','data-i="'+(ini+i)+'"')+
        (r.documentos?.[0]?.id?btn('Ver evidencia','documento','data-i="'+(ini+i)+'"'):'')+'</td></tr>'))+
      paginar(s.p,rows.length,25,'p')+(s.lista?'<p class="fhint">Procesos en página de fuente '+(s.rr+1)+' de '+Math.max(1,Math.ceil(s.lista.total/s.lista.por_pagina))+'. Los filtros de arriba se aplican a la página cargada.</p>'+paginar(s.rr,s.lista.total,s.lista.por_pagina,'rr'):'');
  }
  function tabla(h,rows){return '<div class="ro-tabla">'+ctrlTabla(h,rows,'Sin registros para esta selección.')+'</div>';}
  function paginar(p,total,n,t){return '<div class="ro-linea"><span>'+total+' registro(s) · página '+(p+1)+'</span>'+
    (p>0?btn('Anterior','pagina','data-t="'+t+'" data-d="-1"'):'')+
    ((p+1)*n<total?btn('Siguiente','pagina','data-t="'+t+'" data-d="1"'):'')+'</div>';}
  function mostrarObligaciones(s){
    const detalle=s.cierre?s.d?.detalle:null;
    const rows=detalle&&finanzas(s)?core.obligaciones(s.d,true)
      .filter(({o})=>!s.trabajador||o.trabajador_id===s.trabajador):[];
    $('ro-cuerpo').innerHTML='<p class="fhint">'+esc(detalle?.flujo?.version_id?'Versión vigente '+detalle.flujo.version_id:'Selecciona un cierre con versión. Un saldo sin fuente no se considera cubierto.')+'</p>'+
      tabla(['Trabajador / concepto','Obligación / método','Pago registrado','Saldo y estado','Entrega pendiente','Aplicaciones vigentes'],
      rows.slice(s.p*25,(s.p+1)*25).map(({o,aplicaciones})=>'<tr>'+cell('#'+o.numero+' '+o.nombre+' · '+o.tipo)+cell(m(o.importe)+' · '+o.metodo)+
        cell(m(o.pago_registrado))+cell(m(o.saldo)+' · '+o.estado_pago)+cell(m(o.entrega_pendiente))+
        '<td>'+aplicaciones.map(a=>'<div>'+esc((a.cheque_id?'Cheque físico':a.pago_id?'Pago':'Evidencia')+' · '+m(a.importe)+' · '+fecha(a.created_at))+'</div>').join('')+'</td></tr>'))+
      paginar(s.p,rows.length,25,'p')+btn('Abrir Conciliador','cierre');
  }
  async function listarVersiones(s){
    if(!finanzas(s))throw Error('Comparativo fuera de tu permiso.');
    const t=++s.seq;
    const q=sb.from('control_cierre_versiones').select('id,cierre_origen,obra_id,version,estado_origen,snapshot_sha256,created_at')
      .eq('obra_id',s.obra).order('created_at',{ascending:false}).order('id').range(s.vp*50,s.vp*50+49);
    const r=await leer(q,s);
    if(!vigente(s,t)||s.vista!=='comparar')return;
    if(!Array.isArray(r)||r.some(v=>v.obra_id!==s.obra))throw Error('Versiones fuera de contexto.');
    s.masVersiones=r.length===50;
    s.versiones=r.filter(v=>(s.d?.cierres||[]).some(c=>c.id===v.cierre_origen));
    for(const v of s.versiones)s.refs.set(v.id,v);
    mostrarComparador(s);
  }
  async function comparar(s){
    if(!finanzas(s))throw Error('Comparativo fuera de tu permiso.');
    if(!s.a||!s.b||s.a===s.b)throw Error('Selecciona dos versiones distintas.');
    const t=++s.seq,a=s.a,b=s.b,refs=s.refs;
    if(!refs.has(a)||!refs.has(b))throw Error('La versión no está en el ámbito consultado.');
    const r=await leer(sb.from('control_cierre_versiones').select('id,cierre_origen,obra_id,version,estado_origen,snapshot_sha256,snapshot')
      .eq('obra_id',s.obra).in('id',[a,b]),s);
    if(!vigente(s,t)||s.vista!=='comparar'||s.a!==a||s.b!==b)return;
    if(r.length!==2||r.some(v=>v.obra_id!==s.obra||v.snapshot?.empresa_codigo!==EMPRESA_ACTIVA||
      refs.get(v.id)?.snapshot_sha256!==v.snapshot_sha256||refs.get(v.id)?.cierre_origen!==v.cierre_origen))throw Error('No se pudieron confirmar ambas versiones seleccionadas.');
    const A=r.find(x=>x.id===a),B=r.find(x=>x.id===b);
    s.compare={...core.comparar(A,B),A,B};s.p=0;
    mostrarComparador(s);
  }
  function compararFilas(s){
    const q=String(s.qc||'').toLocaleLowerCase('es-MX');
    return s.compare.filas.filter(f=>(!s.cc||f.cambio===s.cc)&&(!q||[f.numero,f.nombre,f.tipo].some(x=>String(x||'').toLocaleLowerCase('es-MX').includes(q))));
  }
  function mostrarComparador(s){
    if(!finanzas(s)){$('ro-cuerpo').textContent='Comparativo fuera de tu permiso.';return;}
    if(!s.versiones){$('ro-cuerpo').innerHTML='<p>Consulta las versiones guardadas de este centro.</p>'+btn('Buscar versiones','versiones');return;}
    const opciones=sel=>opt('','Seleccionar',sel)+[...new Map([s.refs.get(sel),...s.versiones].filter(Boolean).map(v=>[v.id,v])).values()].map(v=>{
      const c=s.d.cierres.find(c=>c.id===v.cierre_origen);
      return opt(v.id,'S'+c.semana+' · '+c.periodo+' · v'+v.version+' · '+v.estado_origen,sel);
    }).join('');
    const datos=s.compare;
    const rows=datos?compararFilas(s):[];
    const cols=['fiscal','prevision','retenciones','neto'];
    $('ro-cuerpo').innerHTML='<div class="ro-linea"><label>Versión A<select id="ro-a">'+opciones(s.a)+'</select></label>'+
      '<label>Versión B<select id="ro-b">'+opciones(s.b)+'</select></label>'+btn('Comparar fotografías','comparar')+
      (s.vp>0?btn('Versiones más recientes','vp','data-d="-1"'):'')+(s.masVersiones?btn('Versiones anteriores','vp','data-d="1"'):'')+'</div>'+
      '<p class="fhint">Fotografías persistidas. Las filas y los conceptos ausentes se distinguen de los importes en cero. Puedes elegir versiones en páginas distintas.</p>'+
      (datos?'<p>A · '+esc(rango(datos.A.snapshot))+' · v'+esc(datos.A.version)+' · '+esc(datos.A.snapshot.formula_version)+' · '+esc(datos.A.snapshot_sha256)+'<br>B · '+esc(rango(datos.B.snapshot))+' · v'+esc(datos.B.version)+' · '+esc(datos.B.snapshot.formula_version)+' · '+esc(datos.B.snapshot_sha256)+'</p>'+
        (datos.intervaloDistinto?'<p class="ro-alerta">Los intervalos guardados son diferentes. Revisa calendario y plantilla antes de atribuir una causa.</p>':'')+
        '<div class="ro-linea"><label>Trabajador o concepto<input id="ro-qc" value="'+esc(s.qc||'')+'"></label><label>Cambio<select id="ro-cc">'+opt('','Todos',s.cc||'')+
        ['Cambió','Sólo en A','Sólo en B','Desglose incompleto','Igual'].map(k=>opt(k,k,s.cc)).join('')+'</select></label>'+btn('Exportar comparativo','exportar')+'</div>'+
        tabla(['Trabajador / concepto','Cambio','Fiscal A → B (Δ)','Previsión A → B (Δ)','Retenciones A → B (Δ)','Neto A → B (Δ)','% neto'],
          rows.slice(s.p*25,(s.p+1)*25).map(f=>'<tr>'+cell('#'+f.numero+' '+f.nombre+' · '+f.tipo)+cell(f.cambio)+
            cols.map(k=>cell(mc(f.anterior[k])+' → '+mc(f.actual[k])+' ('+mc(f.diferencia[k])+')')).join('')+
            cell(f.porcentaje==null?'Indefinido':f.porcentaje.toFixed(2)+' %')+'</tr>'))+paginar(s.p,rows.length,25,'p'):'');
  }
  function exportar(s){
    if(!s.compare||s.obsoleto||!finanzas(s))throw Error('Revalida las fuentes y vuelve a comparar.');
    const cols=['fiscal','prevision','retenciones','neto'];
    const headers=['NÚMERO','TRABAJADOR','CONCEPTO','CAMBIO',...cols.flatMap(c=>[c+' A',c+' B','Δ '+c]),'% neto'];
    const rows=compararFilas(s).map(f=>[f.numero,f.nombre,f.tipo,f.cambio,...cols.flatMap(c=>[f.anterior[c],f.actual[c],f.diferencia[c]].map(x=>x==null?'':x/100)),f.porcentaje??'']);
    const {A,B}=s.compare;
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers,...rows]),'Comparativo');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['LADO','EMPRESA','CENTRO','PERIODICIDAD','DESDE','HASTA','CIERRE','VERSIÓN','MOTOR','HUELLA'],...[A,B].map((v,i)=>[i?'B':'A',v.snapshot.empresa_codigo,centro(s).nombre,v.snapshot.periodo,v.snapshot.desde,v.snapshot.hasta,v.cierre_origen,v.version,v.snapshot.formula_version,v.snapshot_sha256])]),'Fuentes');
    XLSX.writeFile(wb,'Comparativo_PLATINUM.xlsx');
  }
  async function filtro(s,b){
    if(!visible(s))return;
    if(b.id==='ro-centro'){
      if(!centros().some(o=>o.id===b.value))throw Error('Centro no autorizado.');
      s.obra=b.value;s.sem=null;s.cierre=null;s.preferencia=null;s.trabajador=null;s.rr=0;
      return recargar(s);
    }
    if(b.id==='ro-semana'){
      const n=Number(b.value);
      if(!Number.isInteger(n)||n<1||n>53){b.value=s.sem??'';throw Error('Semana fuera de rango.');}
      s.sem=n;s.cierre=null;s.preferencia=null;s.rr=0;return recargar(s);
    }
    if(b.id==='ro-cierre'){
      if(b.value&&!(s.d?.cierres||[]).some(c=>c.id===b.value&&c.semana===s.sem))throw Error('Cierre fuera del periodo seleccionado.');
      s.cierre=b.value||null;s.preferencia=null;
      if(!s.cierre){s.p=0;mostrar(s);return;}
      return recargar(s);
    }
    const k=b.id.slice(3);
    if(!['tipo','estado','rol','responsable','q','a','b','qc','cc'].includes(k))return;
    s[k]=b.value;s.p=0;
    if(k==='a'||k==='b'){s.seq++;s.compare=null;}
    mostrar(s);
  }
  async function accion(s,b){
    if(!visible(s))return;
    const a=b.dataset.ro;
    if(a==='revalidar')return recargar(s);
    if(a==='vista'){
      if(!['pendientes','pagos','comparar'].includes(b.dataset.vista))return;
      if(b.dataset.vista!=='pendientes'&&!finanzas(s))throw Error('Detalle financiero fuera de tu permiso.');
      s.vista=b.dataset.vista;s.p=0;mostrar(s);return;
    }
    if(a==='pagina'){
      const key=b.dataset.t;
      if(!['p','rr'].includes(key)||!['-1','1'].includes(b.dataset.d))return;
      s[key]=Math.max(0,s[key]+Number(b.dataset.d));
      return key==='rr'?recargar(s):mostrar(s);
    }
    if(a==='quitar'){s.trabajador=null;s.p=0;return mostrar(s);}
    if(a==='versiones')return listarVersiones(s);
    if(a==='vp'&&['-1','1'].includes(b.dataset.d)){s.vp=Math.max(0,s.vp+Number(b.dataset.d));return listarVersiones(s);}
    if(a==='comparar')return comparar(s);
    if(a==='exportar')return exportar(s);
    if(s.obra!==OBRA.id)throw Error('Selecciona primero ese centro en el menú de centros.');
    if(!s.permisos)throw Error('Revalida los permisos de tu sesión antes de continuar.');
    const r=s.rutas?.[Number(b.dataset.i)];
    if(a==='documento'&&r?.documentos?.[0]?.id)return rrhhAbrirDocumento(r.documentos[0].id);
    const destino=a==='fila'?r?.accion:a;
    if(!destino)return;
    if(destino==='solicitudes'||destino==='consolidado')return window.PLATINUM_FLOWS.bandeja(destino==='consolidado',true);
    if(destino==='cierre'||destino==='semana-pagos'){
      if(!finanzas(s))throw Error('Detalle financiero fuera de tu permiso.');
      if(destino==='cierre'&&s.d?.cierres?.filter(c=>c.semana===s.sem).length>1&&!s.cierre)throw Error('Selecciona primero la periodicidad y el cierre.');
      return window.PLATINUM_CONCILIADOR_SEMANAL.abrir(null,s.sem,destino==='cierre'?s.cierre:null);
    }
    if(destino==='corte'||destino==='procesos'||destino==='proceso')return window.PLATINUM_RRHH.abrir(destino==='corte'?'corte':'procesos',r?.trabajador||null,s.sem,s.cierre,r?.id||null);
    const trabajador=r?.trabajador||s.trabajador;
    if(destino==='expediente')return window.PLATINUM_RRHH.abrir('expediente',trabajador,s.sem,s.cierre);
    if(destino==='calendario'){
      const mes=fecha(periodo(s)?.desde).slice(0,7)||undefined;
      return conCentroCompleto(()=>{
        if(!visible(s))return;
        if(!trabajador)return window.PLATINUM_CALENDARIO.elegir();
        return WORKERS.some(w=>w.id===trabajador)?openDetail(trabajador,mes):
          window.PLATINUM_RRHH.abrir('expediente',trabajador,s.sem,s.cierre);
      });
    }
    if(destino==='imss'&&s.permisos?.salud)return conCentroCompleto(()=>visible(s)?
      (trabajador?openFichaIncidentes(trabajador):openCtrlIncidentes()):undefined);
    if(destino==='movimientos'&&s.sem)return conCentroCompleto(()=>visible(s)?openMovimientos(s.sem):undefined);
    if(destino==='proyeccion'&&s.d?.modo==='ACTUAL'){
      if(!s.cierre&&s.d.cierres.filter(c=>c.semana===s.sem).length>1)throw Error('Selecciona primero la periodicidad y el cierre.');
      const f=periodo(s);
      if(!f?.desde||!f?.hasta)throw Error('Verifica el intervalo en la fotografía de origen.');
      return conCentroCompleto(()=>visible(s)?openProyeccion({
        semana:s.sem,periodo:s.cierre?s.d.detalle.cierre.periodo:s.preferencia,desde:f.desde,hasta:f.hasta
      }):undefined);
    }
  }
  function avisarCambio(e){
    const s=local.actual;
    if(!s||s.dueno!==contexto())return;
    if(e&&(!sensibles.has(e.table)||(e.new?.obra_id||e.old?.obra_id)&&(e.new?.obra_id||e.old?.obra_id)!==s.obra))return;
    s.rev++;s.obsoleto=true;
    if(visible(s))$('ro-aviso').textContent='Cambió una fuente. Revalida antes de continuar.';
  }
  function coincide(d){
    const s=local.actual;
    return Boolean(s&&d&&s.dueno===contexto()&&s.obra===d.obra_id&&s.sem===d.semana&&
      (!s.cierre||s.cierre===d.detalle?.cierre?.id));
  }
  window.PLATINUM_RECORRIDO=Object.freeze({abrir,avisarCambio,coincide});
})();
