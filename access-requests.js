/* Pathfinder Track: access requests. Public submit; director-only review. */
(function(){
  "use strict";
  let loading=false;
  let requests=[];
  function locale(){ return (typeof uiLanguage==="string" && uiLanguage==="pt") ? "pt" : (typeof uiLanguage==="string" && uiLanguage==="es" ? "es" : "en"); }
  function t(en,pt,es){return locale()==="pt"?pt:(locale()==="es"?es:en);}
  function h(x){return esc(String(x??""));}
  function publicWidget(){
    return '<details style="margin-top:15px;padding:13px 0;border-top:1px solid var(--line)" id="accessRequestDetails"><summary style="cursor:pointer;font-weight:800;color:var(--forest-900)">'+
      t("Request read-only access","Solicitar acesso como visualizador","Solicitar acceso de visualización")+'</summary>'+
      '<p class="form-hint">'+t("A request does not give you an account. The club director must approve it and send an activation email.","O pedido não cria uma conta. O diretor precisa aprová-lo e enviar um convite por e-mail.","La solicitud no crea una cuenta. El director debe aprobarla y enviar una invitación.")+'</p>'+
      '<form id="viewerAccessRequestForm" autocomplete="on">'+
      '<div class="field"><label for="requestName">'+t("Full name","Nome completo","Nombre completo")+'</label><input id="requestName" maxlength="120" autocomplete="name" required></div>'+
      '<div class="field"><label for="requestEmail">'+t("Email for activation (guardian email for minors)","E-mail para ativação (responsável, se menor)","Correo para activación (tutor si es menor)")+'</label><input id="requestEmail" type="email" maxlength="254" autocomplete="email" required></div>'+
      '<div class="field"><label for="requestRelation">'+t("Relationship to the club","Vínculo com o clube","Relación con el club")+'</label><select id="requestRelation" class="filter-select" style="width:100%"><option value="member">'+t("Pathfinder/member","Desbravador/membro","Conquistador/miembro")+'</option><option value="parent">'+t("Parent","Pai ou mãe","Padre o madre")+'</option><option value="guardian">'+t("Legal guardian","Responsável legal","Tutor legal")+'</option><option value="other">'+t("Other","Outro","Otro")+'</option></select></div>'+
      '<div class="field" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden" aria-hidden="true"><label for="requestWebsite">Website</label><input id="requestWebsite" tabindex="-1" autocomplete="off"></div>'+
      '<button class="btn btn-primary" type="submit" id="requestAccessSend">'+t("Send request","Enviar solicitação","Enviar solicitud")+'</button>'+
      '<div id="requestAccessMessage" class="form-message" role="status" aria-live="polite"></div></form></details>';
  }
  function bindPublic(){
    const form=document.getElementById("viewerAccessRequestForm");if(!form)return;
    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=document.getElementById("requestAccessSend"),msg=document.getElementById("requestAccessMessage");
      btn.disabled=true;msg.style.color="var(--muted)";msg.textContent=t("Sending…","Enviando…","Enviando…");
      try{
        const payload={
          full_name:document.getElementById("requestName").value.trim(),
          email:document.getElementById("requestEmail").value.trim(),
          relationship:document.getElementById("requestRelation").value,
          website:document.getElementById("requestWebsite").value
        };
        const res=await fetch(SUPABASE_URL+"/functions/v1/viewer-access-request",{
          method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},
          body:JSON.stringify(payload)
        });
        let data={};try{data=await res.json();}catch{}
        if(!res.ok)throw Error(data.error||"Could not submit request");
        msg.style.color="var(--forest-700)";
        msg.textContent=t("Request received. The director will review it. If approved, you will receive an activation email.","Solicitação recebida. O diretor fará a análise. Se aprovada, você receberá um e-mail de ativação.","Solicitud recibida. El director la revisará. Si se aprueba, recibirá un correo de activación.");
        form.reset();
      }catch(error){
        msg.style.color="var(--red)";
        msg.textContent=error.message||"Request failed";
      }finally{btn.disabled=false;}
    };
  }
  function directorPanel(){
    return '<section class="card" style="margin:16px 0" id="viewerAccessDirectorPanel"><div class="card-head"><div><h3>'+
      t("Viewer access requests","Solicitações de acesso (visualizador)","Solicitudes de acceso (visualizador)")+
      '</h3><p>'+t("Only the Director can approve or reject requests. Approval sends an invitation for a read-only account.","Somente o Director aprova ou recusa. A aprovação envia um convite para uma conta somente de leitura.","Solo el Director puede aprobar o rechazar solicitudes.")+'</p></div>'+
      '<button class="btn btn-ghost" type="button" id="refreshViewerRequests">'+t("↻ Refresh","↻ Atualizar","↻ Actualizar")+'</button></div>'+
      '<div class="card-body"><div id="viewerAccessDirectorList" class="member-list">'+t("Loading requests…","Carregando solicitações…","Cargando solicitudes…")+'</div></div></section>';
  }
  function label(kind){return {member:t("Member","Membro","Miembro"),parent:t("Parent","Pai/mãe","Padre/madre"),guardian:t("Guardian","Responsável","Tutor"),other:t("Other","Outro","Otro")}[kind]||kind;}
  function renderDirector(){
    const host=document.getElementById("viewerAccessDirectorList");if(!host)return;
    if(!requests.length){host.innerHTML='<div class="member-empty">'+t("No pending access requests.","Nenhuma solicitação pendente.","No hay solicitudes pendientes.")+'</div>';return;}
    host.innerHTML=requests.map(x=>{
      const date=new Date(x.requested_at);
      const day=Number.isFinite(date.getTime())?date.toLocaleString():"—";
      return '<div class="member-row" style="grid-template-columns:minmax(0,1fr) auto;align-items:start"><div><strong>'+h(x.full_name)+'</strong><small>'+h(x.email)+' · '+h(label(x.relationship))+' · '+h(day)+'</small></div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-primary" type="button" data-viewer-approve="'+h(x.id)+'" style="width:auto;padding:10px">'+t("Approve","Aprovar","Aprobar")+'</button>'+
        '<button class="btn btn-ghost" type="button" data-viewer-reject="'+h(x.id)+'" style="width:auto;padding:10px">'+t("Reject","Recusar","Rechazar")+'</button></div></div>';
    }).join("");
    host.querySelectorAll("[data-viewer-approve]").forEach(b=>b.onclick=()=>decide(b.dataset.viewerApprove,true,b));
    host.querySelectorAll("[data-viewer-reject]").forEach(b=>b.onclick=()=>decide(b.dataset.viewerReject,false,b));
  }
  async function reload(){
    if(loading || state?.mode!=="live" || state?.user?.role!=="director")return;
    loading=true;
    const host=document.getElementById("viewerAccessDirectorList");if(host)host.textContent=t("Loading requests…","Carregando solicitações…","Cargando solicitudes…");
    try{
      requests=await sb("viewer_access_requests?club_id=eq."+encodeURIComponent(state.user.club_id)+
        "&status=eq.pending&select=id,full_name,email,relationship,requested_at,status&order=requested_at.desc&limit=100",state.token);
      renderDirector();
    }catch(error){
      if(host)host.textContent=t("Unable to load requests: ","Não foi possível carregar: ","No se pudo cargar: ")+(error.message||"Unknown error");
    }finally{loading=false;}
  }
  async function decide(id,approve,button){
    if(state?.mode!=="live" || state?.user?.role!=="director")return;
    const record=requests.find(x=>String(x.id)===String(id));if(!record)return;
    if(!confirm(approve?t("Approve read-only access for ","Aprovar acesso somente leitura para ","Aprobar acceso de solo lectura para ")+record.full_name+"?":t("Reject the request from ","Recusar o pedido de ","Rechazar la solicitud de ")+record.full_name+"?"))return;
    button.disabled=true;
    try{
      if(approve){
        // Never silently replace an existing Director/Instructor's role through a public request.
        const existingStaff=(state.staff||[]).find(p=>String(p.email||"").toLowerCase()===record.email.toLowerCase());
        if(existingStaff && existingStaff.role!=="viewer")
          throw Error(t("This email already belongs to a staff account. Review it in Staff instead.","Este e-mail já pertence a uma conta da diretoria. Revise em Staff.","Este correo ya pertenece a una cuenta directiva. Revíselo en Staff."));
        // The existing secure invitation function checks the Director JWT and club.
        await callEdgeFunction("staff-invite",{
          email:record.email,full_name:record.full_name,
          position_title:"Viewer",role:"viewer",unit_id:null,class_level_ids:[]
        });
      }
      await sbWrite("viewer_access_requests?id=eq."+encodeURIComponent(record.id)+"&club_id=eq."+encodeURIComponent(state.user.club_id)+
        "&status=eq.pending",state.token,{method:"PATCH",body:{status:approve?"approved":"rejected",reviewed_by:state.user.id,reviewed_at:new Date().toISOString()},prefer:"return=representation"});
      await reload();
      alert(approve?t("Access approved; invitation processed.","Acesso aprovado; convite processado.","Acceso aprobado; invitación procesada."):t("Request rejected.","Solicitação recusada.","Solicitud rechazada."));
    }catch(error){console.error(error);alert(t("Unable to process request: ","Não foi possível processar: ","No se pudo procesar: ")+(error.message||"Error"));button.disabled=false;}
  }
  function bindDirector(){
    const refresh=document.getElementById("refreshViewerRequests");if(!refresh)return;
    refresh.onclick=reload;
    reload();
  }
  window.PTAccessRequests={publicWidget,bindPublic,directorPanel,bindDirector};
})();