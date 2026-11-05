/* Pathfinder Track — Phase 3 activity review panel (staff only). */
(function(){
"use strict";
let submissions=[],loading=false,loaded=false;
function html(value){return esc(String(value??""));}
function allowed(){return state?.mode==="live"&&["director","instructor"].includes(state.user?.role);}
function panel(){
 if(!allowed())return "";
 return '<section class="card" style="margin-bottom:18px;padding:18px" id="ptReviewPanel">'+
   '<div class="card-head"><div><h3>Atividades enviadas para avaliação</h3>'+
   '<p>Envios não alteram automaticamente o cumprimento de requisitos.</p></div>'+
   '<button class="btn btn-ghost" type="button" id="ptReviewRefresh" style="width:auto">Atualizar</button></div>'+
   '<div id="ptReviewRows" role="region" aria-label="Atividades pendentes">'+
   '<p class="form-hint">Carregando atividades…</p></div></section>';
}
function renderRows(){
 const root=document.getElementById("ptReviewRows");
 if(!root)return;
 root.innerHTML=submissions.length?submissions.map(s=>{
   const member=s.members?.full_name||"Desbravador";
   const req=s.requirements?.title||"Requisito";
   return '<article style="padding:15px 0;border-top:1px solid var(--line)" data-review-id="'+html(s.id)+'">'+
     '<strong>'+html(member)+'</strong><p>'+html(s.requirements?.code||"")+' · '+html(req)+'</p>'+
     '<p style="white-space:pre-wrap;overflow-wrap:anywhere">'+html(s.evidence_text)+'</p>'+
     '<label for="reviewNotes_'+html(s.id)+'">Orientações (obrigatórias ao pedir correção)</label>'+
     '<textarea id="reviewNotes_'+html(s.id)+'" rows="2" maxlength="1000" style="width:100%" placeholder="Comentários para o Desbravador"></textarea>'+
     '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">'+
     '<button class="btn btn-primary" style="width:auto" data-review-action="approved" data-id="'+html(s.id)+'">Aprovar envio</button>'+
     '<button class="btn btn-ghost" style="width:auto" data-review-action="revision_requested" data-id="'+html(s.id)+'">Solicitar correção</button>'+
     '</div><p role="status" aria-live="polite" class="form-hint" data-review-message></p></article>';
 }).join(""):'<p class="form-hint">Nenhuma atividade aguardando avaliação.</p>';
 root.querySelectorAll('[data-review-action]').forEach(btn=>btn.onclick=()=>review(btn));
}
async function reload(){
 if(!allowed()||loading)return;
 const root=document.getElementById("ptReviewRows");
 if(!root)return;
 loading=true;root.textContent="Carregando atividades…";
 try{
   const token=await getValidAccessToken(state.token,false);
   submissions=await sb("activity_submissions?status=eq.submitted&select=id,member_id,requirement_id,evidence_text,created_at,members(full_name),requirements(code,title)&order=created_at.asc&limit=100",token);
   loaded=true;renderRows();
 }catch(err){root.textContent="Não foi possível carregar atividades: "+err.message;}
 finally{loading=false;}
}
async function review(btn){
 const id=btn.dataset.id,action=btn.dataset.reviewAction;
 const card=btn.closest('[data-review-id]');
 const note=card.querySelector('textarea').value.trim();
 const msg=card.querySelector('[data-review-message]');
 if(action==="revision_requested"&&!note){msg.textContent="Informe o que precisa ser corrigido.";return;}
 if(action==="approved"&&!confirm("Aprovar o envio? A conclusão do requisito ainda deve ser lançada na classe."))return;
 const controls=card.querySelectorAll('button');
 controls.forEach(b=>b.disabled=true);msg.textContent="Processando avaliação…";
 try{
   const token=await getValidAccessToken(state.token,false);
   await sbWrite("activity_submissions?id=eq."+encodeURIComponent(id),token,{
     method:"PATCH",body:{status:action,review_notes:note||null,reviewed_by:state.user.id}
   });
   await reload();
 }catch(err){msg.textContent=err.message||"Erro na avaliação.";controls.forEach(b=>b.disabled=false);}
}
function bind(){
 if(!allowed())return;
 const refresh=document.getElementById("ptReviewRefresh");
 if(refresh)refresh.onclick=reload;
 if(!loaded)reload();else renderRows();
}
window.PTActivityReviews={panel,bind};
})();