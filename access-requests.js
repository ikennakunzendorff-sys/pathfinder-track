/* Pathfinder Track — Parent / Pathfinder access request and Director verification. */
(function(){
  "use strict";
  let loading=false, requests=[],openId=null;
  const lang=()=>typeof uiLanguage==="string"?uiLanguage:"pt";
  const tr=(en,pt,es)=>lang()==="pt"?pt:(lang()==="es"?es:en);
  const h=v=>esc(String(v??""));
  function publicWidget(){
    return '<details id="accessRequestDetails" style="margin-top:12px;padding:12px;background:#fff;border:1px solid var(--line);border-radius:12px">'+
      '<summary style="cursor:pointer;font-weight:800">'+tr("Request access to the Pathfinder Portal","Solicitar acesso ao Portal do Desbravador","Solicitar acceso al Portal")+'</summary>'+
      '<p class="form-hint">'+tr("Parents can follow their children. Pathfinders can follow only their own progress. The Director verifies every request before sending an invitation.","Pais acompanham os filhos; Desbravadores acompanham somente seu progresso. Toda solicitação exige verificação e aprovação do Director.","Padres pueden seguir a sus hijos; Conquistadores, su propio progreso. Requiere aprobación.")+'</p>'+
      '<form id="portalAccessForm"><div class="field"><label for="portalRequestRole">'+tr("Who needs access?","Quem precisa de acesso?","¿Quién solicita acceso?")+'</label><select id="portalRequestRole" required><option value="parent">'+tr("Parent / Guardian","Pai, mãe ou responsável","Padre, madre o tutor")+'</option><option value="pathfinder">'+tr("Pathfinder (with guardian authorization)","Desbravador (com autorização do responsável)","Conquistador (con autorización)")+'</option></select></div>'+
      '<div class="field"><label for="portalRequestName">'+tr("Account holder’s name","Nome de quem terá a conta","Nombre del titular")+'</label><input id="portalRequestName" maxlength="120" required autocomplete="name"></div>'+
      '<div class="field"><label for="portalRequestEmail">'+tr("Activation email (guardian approval required for minors)","E-mail para ativação (menores precisam de autorização do responsável)","Correo de activación (menores requieren autorización)")+'</label><input id="portalRequestEmail" type="email" maxlength="254" required autocomplete="email"></div>'+
      '<div class="field"><label for="portalRequestMembers">'+tr("Pathfinder name(s) in the club","Nome(s) dos Desbravadores vinculados ao pedido","Nombre(s) de los Conquistadores")+'</label><input id="portalRequestMembers" maxlength="250" required placeholder="Nome completo dos Desbravadores"><span class="form-hint">'+tr("The Director will locate and verify existing records. Names alone do not grant access.","O Director localizará e verificará os cadastros. Informar nomes não concede acesso.","El Director verificará los registros; los nombres no conceden acceso.")+'</span></div>'+
      '<div style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"><label for="portalRequestWebsite">Website</label><input id="portalRequestWebsite" autocomplete="off" tabindex="-1"></div>'+
      '<button class="btn btn-primary" id="portalAccessSubmit" type="submit">'+tr("Send request","Enviar solicitação","Enviar solicitud")+'</button>'+
      '<div class="form-message" id="portalAccessMessage" role="status" aria-live="polite"></div></form></details>';
  }
  function bindPublic(){
    const form=document.getElementById("portalAccessForm");if(!form)return;
    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=document.getElementById("portalAccessSubmit"),msg=document.getElementById("portalAccessMessage");btn.disabled=true;
      msg.style.color="var(--muted)";msg.textContent=tr("Sending…","Enviando…","Enviando…");
      const role=document.getElementById("portalRequestRole").value;
      try{
        const body={
          requested_role:role,
          relationship:role==="pathfinder"?"member":"parent",
          full_name:document.getElementById("portalRequestName").value.trim(),
          email:document.getElementById("portalRequestEmail").value.trim(),
          member_names:document.getElementById("portalRequestMembers").value.trim(),
          website:document.getElementById("portalRequestWebsite").value
        };
        const res=await fetch(SUPABASE_URL+"/functions/v1/viewer-access-request",{
          method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)
        });let payload={};try{payload=await res.json();}catch{}
        if(!res.ok)throw Error(payload.error||"Request could not be submitted");
        msg.style.color="var(--forest-700)";msg.textContent=tr("Request received. The Director will verify identity and member links before approval.","Solicitação recebida. O Director verificará a identidade e os vínculos antes da aprovação.","Solicitud recibida. El Director verificará identidad y vínculos.");
        form.reset();
      }catch(err){msg.style.color="var(--red)";msg.textContent=err.message||"Request failed";}
      finally{btn.disabled=false;}
    };
  }
  function directorPanel(){
    return '<section class="card" style="margin:16px 0" id="portalReviewPanel"><div class="card-head"><div><h3>'+
      tr("Parent & Pathfinder portal requests","Solicitações do Portal — Pais e Desbravadores","Solicitudes del Portal")+
      '</h3><p>'+tr("Verify identity, select the exact existing Pathfinder records and confirm guardian authorization before approving.","Verifique a identidade, selecione os cadastros existentes corretos e confirme a autorização do responsável.","Verifique la identidad y vincule los registros correctos.")+
      '</p></div><button class="btn btn-ghost" id="portalRequestsRefresh" type="button">'+tr("Refresh","Atualizar","Actualizar")+'</button></div>'+
      '<div class="card-body"><div id="portalRequestsList" class="member-list">…</div></div></section>';
  }
  function render(){
    const host=document.getElementById("portalRequestsList");if(!host)return;
    const members=(state?.allMembers||[]).filter(x=>x.active!==false).slice().sort((a,b)=>a.full_name.localeCompare(b.full_name));
    if(!requests.length){host.innerHTML='<div class="member-empty">'+tr("No pending requests.","Nenhuma solicitação pendente.","Sin solicitudes pendientes.")+'</div>';return;}
    host.innerHTML=requests.map(req=>{
      const role=req.requested_role==="pathfinder"?"Pathfinder":"Parent / Guardian";
      const checked=openId===req.id;
      const options=members.map(m=>'<label style="display:flex;align-items:center;gap:8px;margin:6px 0"><input type="checkbox" data-portal-link="'+h(req.id)+'" value="'+h(m.id)+'">'+h(m.full_name)+' · '+h(unitName(m.unit_id))+'</label>').join("");
      return '<section class="member-row" style="display:block;margin:10px 0;padding:14px;border:1px solid var(--line);border-radius:12px"><strong>'+h(req.full_name)+'</strong> · '+h(role)+
        '<div class="form-hint">'+h(req.email)+' · '+h(new Date(req.requested_at).toLocaleString())+'</div>'+
        '<div style="margin-top:6px"><strong>'+tr("Requested members","Desbravadores informados","Conquistadores indicados")+':</strong> '+h(req.member_names||"—")+'</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-primary" type="button" data-portal-open="'+h(req.id)+'" style="width:auto">'+tr("Review / Approve","Analisar / Aprovar","Revisar / Aprobar")+'</button>'+
        '<button class="btn btn-ghost" type="button" data-portal-reject="'+h(req.id)+'" style="width:auto">'+tr("Reject","Recusar","Rechazar")+'</button></div>'+
        (checked?'<div style="padding:12px;margin-top:12px;border:1px solid var(--line);border-radius:10px"><p style="margin:0"><strong>'+tr("Select verified Pathfinder records","Selecione os cadastros verificados","Seleccione registros verificados")+'</strong></p>'+
          '<p class="form-hint">'+(req.requested_role==="pathfinder"?tr("Select exactly one Pathfinder.","Selecione exatamente um Desbravador.","Seleccione exactamente uno."):tr("Select every child whose relationship has been verified (maximum 8).","Selecione os filhos com vínculo verificado (máximo 8).","Seleccione hasta ocho hijos verificados."))+'</p>'+
          '<div style="max-height:200px;overflow:auto">'+options+'</div>'+
          '<label style="display:flex;gap:8px;align-items:start;margin-top:10px"><input type="checkbox" id="portalVerifyIdentity_'+h(req.id)+'">'+tr("I independently verified the requester’s identity and relationship.","Confirmei a identidade e o vínculo com os Desbravadores por meio independente.","Verifiqué la identidad y el vínculo.")+'</label>'+
          '<label style="display:flex;gap:8px;align-items:start;margin-top:10px"><input type="checkbox" id="portalVerifyGuardian_'+h(req.id)+'">'+tr("Guardian authorization for youth access is documented or the account belongs to the verified guardian.","A autorização do responsável está confirmada, ou a conta pertence ao responsável verificado.","Confirmo autorización del responsable.")+'</label>'+
          '<button class="btn btn-primary" type="button" data-portal-confirm="'+h(req.id)+'" style="width:auto;margin-top:12px">'+tr("Approve and send invitation","Aprovar e enviar convite","Aprobar y enviar invitación")+'</button></div>':'')+
        '</section>';
    }).join("");
    host.querySelectorAll("[data-portal-open]").forEach(btn=>btn.onclick=()=>{openId=openId===btn.dataset.portalOpen?null:btn.dataset.portalOpen;render();});
    host.querySelectorAll("[data-portal-reject]").forEach(btn=>btn.onclick=()=>decide(btn.dataset.portalReject,false,btn));
    host.querySelectorAll("[data-portal-confirm]").forEach(btn=>btn.onclick=()=>decide(btn.dataset.portalConfirm,true,btn));
  }
  async function reload(){
    if(loading||state?.mode!=="live"||state?.user?.role!=="director")return;
    loading=true;
    const host=document.getElementById("portalRequestsList");if(host)host.textContent=tr("Loading…","Carregando…","Cargando…");
    try{requests=await sb("viewer_access_requests?club_id=eq."+encodeURIComponent(state.user.club_id)+"&status=eq.pending&requested_role=in.(parent,pathfinder)&select=id,full_name,email,requested_role,relationship,member_names,requested_at&order=requested_at.desc&limit=100",state.token);render();}
    catch(err){if(host)host.textContent=err.message||"Unable to load requests";}
    finally{loading=false;}
  }
  async function decide(id,approve,btn){
    const request=requests.find(x=>String(x.id)===String(id));
    if(!request||state?.user?.role!=="director")return;
    let body={action:approve?"approve":"reject",request_id:id};
    if(approve){
      const selected=Array.from(document.querySelectorAll('[data-portal-link="'+id+'"]:checked')).map(el=>el.value);
      if(selected.length<1||(request.requested_role==="pathfinder"&&selected.length!==1)||(request.requested_role==="parent"&&selected.length>8)){
        alert(tr("Check the selected Pathfinder records.","Confira os Desbravadores selecionados.","Revise los Conquistadores seleccionados."));return;
      }
      const identity=document.getElementById("portalVerifyIdentity_"+id)?.checked;
      const guardian=document.getElementById("portalVerifyGuardian_"+id)?.checked;
      if(!identity||!guardian){alert(tr("Both verification confirmations are required.","Confirme as duas verificações obrigatórias.","Confirme ambas verificaciones."));return;}
      body={...body,member_ids:selected,identity_verified:true,guardian_authorization_confirmed:true};
    }
    if(!confirm(approve?tr("Approve this account and member links?","Aprovar esta conta e os vínculos?","¿Aprobar cuenta y vínculos?"):tr("Reject this request?","Recusar esta solicitação?","¿Rechazar solicitud?")))return;
    btn.disabled=true;
    try{
      const result=await callEdgeFunction("portal-access-review",body);
      if(approve)await refreshStaffFromDb();
      openId=null;await reload();
      alert(approve?tr("Access approved. Invitation processed.","Acesso aprovado. Convite processado.","Acceso aprobado. Invitación procesada."):tr("Request rejected.","Solicitação recusada.","Solicitud rechazada."));
    }catch(err){console.error(err);alert(err.message||"Unable to process request");btn.disabled=false;}
  }
  function bindDirector(){
    const btn=document.getElementById("portalRequestsRefresh");if(!btn)return;
    btn.onclick=reload;reload();
  }
  window.PTAccessRequests={publicWidget,bindPublic,directorPanel,bindDirector};
})();
