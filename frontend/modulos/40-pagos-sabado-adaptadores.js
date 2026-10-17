/* Único coordinador de revisión; no contiene cálculos monetarios. */
if(window.PLATINUM_PAGOS_SABADO)window.PLATINUM_PAGOS_SABADO.configure({
 context:()=>({sb,obra:OBRA,empresaNombre:OBRA?razonSocialEmpresa(empresaDeObra(OBRA)):''}),
 $,esc,money,table:ctrlTabla,modal:modal2,close:closeModal2,toast,week:semObra,
 reload:async id=>{if(OBRA?.id===id)await loadObraData(id);},
 onChange:()=>{if($('pg-out')&&PAGOIMP)pgRender();},
 banner:d=>{const e=$('pago-sabado-aviso');if(!e)return;e.hidden=!d||!d.habilitado;if(!e.hidden)e.innerHTML=`<span>💳 S${Number(d.semana)} · revisión de pagos disponible. Un pendiente no crea cheque sin confirmar.</span> <button class="btn" onclick="PLATINUM_PAGOS_SABADO.abrir(${Number(d.semana)})">Revisar pagos</button>`;}
});
