/* Pathfinder Track — Phase 2 read-only family and Pathfinder progress portal. */
(function(){
 "use strict";
 function h(x){return esc(String(x??""));}
 function isPortalRole(){return state?.mode==="live"&&["parent","pathfinder"].includes(state.user?.role);}
 async function load(profile,token){
   const enc=encodeURIComponent(profile.club_id);
   const [clubs,units,years,links,classLevels,requirements,settings]=await Promise.all([
     sb("clubs?id=eq."+enc+"&select=id,name,location",token),
     sb("units?club_id=eq."+enc+"&select=id,name,active&order=name",token),
     sb("club_years?club_id=eq."+enc+"&select=id,label,start_date,end_date,active&order=start_date.desc",token),
     sb("portal_member_links?user_id=eq."+encodeURIComponent(profile.id)+"&active=eq.true&select=id,user_id,member_id,link_type,active",token),
     sb("class_levels?select=id,name,order_index&order=order_index",token),
     sb("requirements?select=id,class_level_id,code,title,description,category,is_advanced,sort_index&order=sort_index",token),
     sb("club_settings?club_id=eq."+enc+"&select=excellence_score_weight,excellence_attendance_weight,excellence_class_weight,excellence_min_meetings,excellence_min_attendance",token)
   ]);
   const ids=links.map(x=>x.member_id);
   const filter=ids.length?"&id=in.("+ids.join(",")+")":"&id=eq.00000000-0000-0000-0000-000000000000";
   const [members,statuses,attendance,scores,meetings,maxima,submissions]=await Promise.all([
     sb("members?club_id=eq."+enc+filter+"&select=id,full_name,school_grade,current_class_level_id,unit_id,active,created_at,class_levels(name)&order=full_name",token),
     ids.length?sb("member_requirement_status?member_id=in.("+ids.join(",")+")&select=member_id,requirement_id,status,completed_at",token):Promise.resolve([]),
     ids.length?sb("attendance?member_id=in.("+ids.join(",")+")&select=meeting_id,member_id,present",token):Promise.resolve([]),
     ids.length?sb("meeting_scores?member_id=in.("+ids.join(",")+")&select=meeting_id,member_id,points_awarded,max_points_snapshot",token):Promise.resolve([]),
     ids.length?sb("meetings?club_id=eq."+enc+"&select=id,meeting_date,title,unit_id,club_year_id,meeting_type&order=meeting_date.desc&limit=500",token):Promise.resolve([]),
     ids.length?Promise.all(ids.map(id=>sb("rpc/portal_meeting_maxima?target_member_id="+encodeURIComponent(id),token))):Promise.resolve([]),
     ids.length?sb("activity_submissions?member_id=in.("+ids.join(",")+")&select=id,member_id,requirement_id,status,evidence_text,review_notes,updated_at",token):Promise.resolve([])
   ]);
   const own=new Set(ids.map(String));
   const verified=members.filter(m=>own.has(String(m.id))&&m.active!==false);
   state={
     mode:"live",token:readAuthSession()?.access_token||token,user:profile,
     club:clubs[0]||{name:"Pathfinder Track"},units,clubYears:years,
     clubYear:years.find(y=>y.active)||null,portalSettings:settings[0]||null,
     allMembers:verified,members:[],portalLinks:links,portalAttendance:attendance,
     portalMaxima:Object.fromEntries(ids.map((id,i)=>[id,maxima[i]||[]])),
     portalScores:scores,portalSelectedMemberId:verified[0]?.id||null,
     classLevels,requirements,requirementStatuses:statuses,meetings,activitySubmissions:submissions,
     categories:[],staff:[],staffClassLinks:[],auditLogs:[],scoreboardMeetings:[],
     scoreboardScores:[],scoreboardAttendance:[],scoreboardLoaded:false,
     auditLoaded:false,unit:units[0]||{},selectedUnitId:null,meeting:null
   };
   if(verified[0]) await window.PTClassFiles?.loadPortalFiles(token,verified[0]);
 }
 function view(){
   if(!isPortalRole())return "";
   const person=state.allMembers.find(x=>String(x.id)===String(state.portalSelectedMemberId))||state.allMembers[0];
   const own=state.allMembers||[];
   const choose=state.user.role==="parent"&&own.length>1?
      '<div class="members-toolbar" style="margin:12px 0"><label for="portalMemberSelect">Desbravador</label><select id="portalMemberSelect">'+
      own.map(m=>'<option value="'+h(m.id)+'"'+(person?.id===m.id?' selected':'')+'>'+h(m.full_name)+'</option>').join("")+
      '</select></div>':"";
   if(!person)return '<div class="director-dashboard">'+header()+
      '<section class="card" style="padding:22px;margin-top:16px"><h3>Nenhum Desbravador vinculado</h3>'+
      '<p>O Director precisa verificar e vincular seu cadastro antes que você possa consultar informações individuais.</p></section><button class="btn btn-ghost" type="button" data-portal-logout style="width:auto;margin-top:15px">Sair</button></div>';
   const id=String(person.id);
   const statuses=(state.requirementStatuses||[]).filter(x=>String(x.member_id)===id);
   const classReqs=(state.requirements||[]).filter(r=>String(r.class_level_id)===String(person.current_class_level_id)&&!r.is_advanced).sort((a,b)=>(a.sort_index||0)-(b.sort_index||0));
   const completed=new Set(statuses.filter(x=>x.status==="completed"||x.completed_at).map(x=>String(x.requirement_id)));
   const done=classReqs.filter(x=>completed.has(String(x.id))).length;
   const possible=classReqs.length,pct=possible?Math.round(100*done/possible):0;
   const scores=(state.portalScores||[]).filter(x=>String(x.member_id)===id);
   const earned=scores.reduce((sum,r)=>sum+Number(r.points_awarded||0),0);
   const maximum=scores.reduce((sum,r)=>sum+Number(r.max_points_snapshot||0),0);
   const attend=(state.portalAttendance||[]).filter(x=>String(x.member_id)===id);
   const index=new Map(attend.map(x=>[String(x.meeting_id),x]));
   const yearStart=String(state.clubYear?.start_date||'0000-01-01');
   const memberStart=String(person.created_at||yearStart).slice(0,10);
   const effectiveStart=memberStart>yearStart?memberStart:yearStart;
   const opportunities=(state.meetings||[]).filter(m=>
     String(m.unit_id)===String(person.unit_id)
     && String(m.meeting_type||'regular')==='regular'
     && String(m.meeting_date)>=effectiveStart
     && (!state.clubYear?.end_date||String(m.meeting_date)<=String(state.clubYear.end_date))
   );
   const present=opportunities.filter(m=>index.get(String(m.id))?.present===true).length;
   const attPct=opportunities.length?Math.round(1000*present/opportunities.length)/10:0;
   const scoreRows=(state.portalScores||[]).filter(x=>String(x.member_id)===id);
   const earnedByMeeting=new Map(),individualMaximum=new Map();
   for(const row of scoreRows){
     const key=String(row.meeting_id);
     earnedByMeeting.set(key,(earnedByMeeting.get(key)||0)+Number(row.points_awarded||0));
     individualMaximum.set(key,(individualMaximum.get(key)||0)+Number(row.max_points_snapshot||0));
   }
   const possibleByMeeting=new Map((state.portalMaxima?.[id]||[]).map(x=>[String(x.meeting_id),Number(x.possible||0)]));
   const regularEarned=opportunities.reduce((sum,m)=>sum+(earnedByMeeting.get(String(m.id))||0),0);
   const regularPossible=opportunities.reduce((sum,m)=>sum+(possibleByMeeting.get(String(m.id))||0),0);
   const efficiency=regularPossible?Math.round(1000*regularEarned/regularPossible)/10:0;
   const cfg=state.portalSettings||{};
   const weightScore=Number(cfg.excellence_score_weight??50);
   const weightAttendance=Number(cfg.excellence_attendance_weight??30);
   const weightClass=Number(cfg.excellence_class_weight??20);
   const minMeetings=Number(cfg.excellence_min_meetings??3);
   const minAttendance=Number(cfg.excellence_min_attendance??60);
   const excellence=Math.round((efficiency*weightScore/100+attPct*weightAttendance/100+pct*weightClass/100)*10)/10;
   const eligible=opportunities.length>=minMeetings&&attPct>=minAttendance&&regularPossible>0;
   const eligibilityReason=opportunities.length<minMeetings
     ?'Faltam '+(minMeetings-opportunities.length)+' oportunidade(s) de reunião regular'
     :attPct<minAttendance?'Frequência abaixo de '+minAttendance+'%'
     :!regularPossible?'Pontuação ainda não lançada':'Elegível';
   const meetingIndex=new Map((state.meetings||[]).map(m=>[String(m.id),m]));
   const latest=Array.from(new Set([...opportunities.map(m=>String(m.id)),...attend.map(a=>String(a.meeting_id))]))
     .map(meetingId=>meetingIndex.get(meetingId)).filter(Boolean)
     .sort((a,b)=>String(b.meeting_date).localeCompare(String(a.meeting_date))).slice(0,10)
     .map(meeting=>{
       const marked=index.get(String(meeting.id));
       const ownPoints=earnedByMeeting.get(String(meeting.id))||0;
       const maxPoints=individualMaximum.get(String(meeting.id))||0;
       const note=marked?(marked.present?'Presente':'Ausente'):'Não registrado';
       return '<div class="member-row" style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><strong>'+
         h(meeting.title||'Reunião')+'</strong><small>'+h(meeting.meeting_date)+' · '+h(meeting.meeting_type||'regular')+
         '</small></div><div style="text-align:right"><strong>'+h(note)+'</strong><small>'+
         (maxPoints?ownPoints+' / '+maxPoints+' pts':'Sem pontuação individual')+'</small></div></div>';
     }).join('');
   const activityMap=new Map((state.activitySubmissions||[]).filter(x=>String(x.member_id)===id).map(x=>[String(x.requirement_id),x]));
   const progressRows=(state.requirements||[]).filter(r=>String(r.class_level_id)===String(person.current_class_level_id))
     .sort((a,b)=>Number(a.is_advanced)-Number(b.is_advanced)||(a.sort_index||0)-(b.sort_index||0));
   const classItems=progressRows.map(req=>{
     const status=statuses.find(x=>String(x.requirement_id)===String(req.id));
     const evidence=activityMap.get(String(req.id));
     const doneReq=status?.status==='completed'||!!status?.completed_at;
     const inProgress=!doneReq&&status?.status==='in_progress';
     return '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);align-items:start">'+
       '<span aria-hidden="true" style="font-size:18px">'+(doneReq?'✓':inProgress?'◐':'○')+'</span><div style="min-width:0;flex:1"><strong>'+
       h(req.code?req.code+' — '+req.title:req.title)+'</strong><small style="display:block">'+
       h(req.category||'Requisitos')+(req.is_advanced?' · Avançado':' · Regular')+'</small>'+
       (req.description?'<p class="form-hint">'+h(req.description)+'</p>':'')+
       (evidence?'<p class="form-hint">Envio: '+h(evidence.status==='approved'?'Aprovado':evidence.status==='revision_requested'?'Correção solicitada':'Aguardando avaliação')+
       (evidence.review_notes?' · '+h(evidence.review_notes):'')+'</p>'+window.PTClassFiles.portalEvidenceFor(evidence.id):'')+
       (!doneReq&&(!evidence||evidence.status==='revision_requested'||evidence.status==='submitted')
         ?'<button class="btn btn-ghost" style="width:auto;margin-top:8px" type="button" data-activity-open="'+h(req.id)+'">'+
         (evidence?.status==='submitted'?'Adicionar anexos':evidence?'Corrigir envio':'Enviar atividade')+'</button>':'')+
       '</div><small>'+
       (doneReq?'Concluído':inProgress?'Em andamento':'Pendente')+'</small></div>';
   }).join('');
   const activityForm='<section class="card" id="portalActivityForm" hidden style="margin-top:14px;padding:20px"><h3>Enviar atividade</h3>'+
      '<p id="portalActivityTitle"></p><label for="portalActivityEvidence">Resposta ou evidência (10–4000 caracteres)</label>'+
      '<textarea id="portalActivityEvidence" rows="5" maxlength="4000" style="width:100%;margin-top:8px" required></textarea>'+ 
      '<label for="portalActivityFiles">Anexos PDF ou imagem (até 5 arquivos de 5 MB)</label>'+ 
      '<input id="portalActivityFiles" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" style="width:100%;margin:8px 0 12px">'+
      '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:12px">'+
      '<button class="btn btn-primary" type="button" id="portalActivitySave">Enviar para avaliação</button>'+
      '<button class="btn btn-ghost" type="button" id="portalActivityCancel">Cancelar</button></div>'+
      '<p id="portalActivityMessage" role="status" aria-live="polite"></p></section>';
   const basicPending=classReqs.filter(x=>!completed.has(String(x.id))).length;
   const advancedReqs=progressRows.filter(r=>r.is_advanced);
   const advancedDone=advancedReqs.filter(r=>completed.has(String(r.id))).length;
   return '<div class="director-dashboard">'+header()+choose+
     '<section class="card" style="padding:20px;margin-top:14px"><div class="eyebrow">Meu Progresso · Somente leitura</div><h2>'+h(person.full_name)+'</h2><p>'+
     h(person.current_class_level_id?(person.class_levels?.name||'Classe atribuída'):'Sem classe atribuída')+' · '+
     h((state.units||[]).find(u=>u.id===person.unit_id)?.name||'Sem unidade')+'</p></section>'+
     '<section class="director-kpis" style="margin-top:14px">'+
     '<div class="director-kpi"><span>Progresso da classe</span><strong>'+pct+'%</strong><small>'+
       done+' / '+possible+' básicos · '+basicPending+' pendentes</small></div>'+
     '<div class="director-kpi"><span>Frequência nas reuniões regulares</span><strong>'+attPct+'%</strong><small>'+
       present+' / '+opportunities.length+' oportunidades</small></div>'+
     '<div class="director-kpi"><span>Eficiência de pontuação</span><strong>'+efficiency+'%</strong><small>'+
       regularEarned+' / '+regularPossible+' pontos possíveis</small></div></section>'+
     '<section class="card" style="padding:20px;margin-top:14px"><h3>Desbravador Excelência</h3><div class="eyebrow">'+
       (eligible?'Elegível para classificação':'Em qualificação')+'</div>'+
       '<h2 style="margin:10px 0">'+(eligible?excellence.toFixed(1)+' / 100':'—')+'</h2>'+
       '<p>'+(eligible?'Pontuação calculada pelos critérios da diretoria.':h(eligibilityReason))+'</p>'+
       '<p class="form-hint">Composição: '+weightScore+'% pontuação, '+weightAttendance+
       '% frequência, '+weightClass+'% requisitos básicos. Elegibilidade: '+minMeetings+
       ' oportunidades e '+minAttendance+'% de frequência mínima. Eventos especiais excluídos.</p></section>'+
     '<section class="card" style="margin-top:14px"><div class="card-head"><div><h3>Requisitos da classe</h3><p>'+
       done+' concluídos, '+basicPending+' pendentes · Avançados: '+advancedDone+' / '+advancedReqs.length+
       '</p></div></div><div class="card-body">'+(classItems||'<div class="member-empty">Nenhum requisito cadastrado para esta classe.</div>')+'</div></section>'+
     activityForm+
     '<section class="card" style="margin-top:14px"><div class="card-head"><div><h3>Histórico de reuniões</h3>'+
       '<p>Reuniões regulares do ano, com presença e pontuação lançadas; eventos especiais aparecem quando houver registro individual.</p>'+
     '</div></div><div class="card-body">'+(latest||'<div class="member-empty">Nenhuma reunião disponível.</div>')+'</div></section>'+
     window.PTClassFiles.portalLibrary(person)+
     '<p class="form-hint" style="margin-top:14px">Dados oficiais lançados pela liderança. Nenhuma edição de requisitos, frequência ou pontuação é permitida neste portal.</p>'+
     '<button class="btn btn-ghost" type="button" data-portal-logout style="width:auto;margin-top:12px">Sair</button></div>';
 }
 function header(){
   return '<div class="topbar"><div><div class="eyebrow">Portal do Desbravador</div><h1>Olá, '+h((state.user.full_name||"").split(" ")[0])+'</h1><p>'+
      h(state.club.name||"")+' · '+h(state.clubYear?.label||"Ano do clube")+'</p></div><div class="top-actions"><button type="button" class="btn btn-ghost" id="logoutBtn">Sair</button></div></div>';
 }
 function bind(){
   const logout=document.getElementById("logoutBtn");if(logout)logout.onclick=signOut;
   document.querySelectorAll("[data-portal-logout]").forEach(btn=>btn.onclick=signOut);
   const select=document.getElementById("portalMemberSelect");
   if(select)select.onchange=async()=>{
     state.portalSelectedMemberId=select.value;
     try{await window.PTClassFiles.loadPortalFiles(await getValidAccessToken(state.token,false),state.allMembers.find(m=>String(m.id)===String(select.value)));}
     catch(err){console.error('Library load',err);}
     renderApp();
   };
   window.PTClassFiles?.bindOpens(document);
   let activeRequirement=null;
   const form=document.getElementById("portalActivityForm");
   document.querySelectorAll("[data-activity-open]").forEach(btn=>btn.onclick=()=>{
     activeRequirement=btn.dataset.activityOpen;
     const req=(state.requirements||[]).find(x=>String(x.id)===String(activeRequirement));
     const sub=(state.activitySubmissions||[]).find(x=>String(x.member_id)===String(state.portalSelectedMemberId)&&String(x.requirement_id)===String(activeRequirement));
     document.getElementById("portalActivityTitle").textContent=req?.title||"Atividade";
     document.getElementById("portalActivityEvidence").value=sub?.evidence_text||"";
     const onlyFiles=sub?.status==='submitted';
     document.getElementById("portalActivityEvidence").readOnly=onlyFiles;
     document.getElementById("portalActivitySave").textContent=onlyFiles?'Anexar arquivos':'Enviar para avaliação';
     document.getElementById("portalActivityMessage").textContent=onlyFiles?'A atividade já está em avaliação. Você pode adicionar anexos, sem alterar a resposta.':'';
     form.hidden=false;form.scrollIntoView({block:"nearest",behavior:"smooth"});
   });
   const cancel=document.getElementById("portalActivityCancel");
   if(cancel)cancel.onclick=()=>{form.hidden=true;activeRequirement=null;};
   const save=document.getElementById("portalActivitySave");
   if(save)save.onclick=async()=>{
     if(!activeRequirement)return;
     const memberId=state.portalSelectedMemberId;
     const textValue=document.getElementById("portalActivityEvidence").value.trim();
     const message=document.getElementById("portalActivityMessage");
     if(textValue.length<10){message.textContent="Escreva pelo menos 10 caracteres.";return;}
     const prev=(state.activitySubmissions||[]).find(x=>String(x.member_id)===String(memberId)&&String(x.requirement_id)===String(activeRequirement));
     const files=Array.from(document.getElementById('portalActivityFiles').files||[]);
     try{files.forEach(window.PTClassFiles.validate);if(files.length>5)throw Error('Máximo de 5 anexos.');}
     catch(err){message.textContent=err.message;return;}
     if(prev?.status==='submitted'&&!files.length){message.textContent='Selecione um arquivo para anexar.';return;}
     save.disabled=true;save.textContent="Enviando...";
     let submissionCommitted=false;
     try{
       const token=await getValidAccessToken(state.token,false);
       let submission=prev;
       if(prev){
         if(prev.status==='revision_requested'){
           await sbWrite("activity_submissions?id=eq."+encodeURIComponent(prev.id),token,{method:"PATCH",
             body:{evidence_text:textValue,status:"submitted"}});
           submissionCommitted=true;
         }else if(prev.status==='submitted')submissionCommitted=true;
         else throw Error('Este envio já está aprovado.');
       }else{
         const created=await sbWrite("activity_submissions",token,{prefer:"return=representation",body:{
           club_id:state.user.club_id,member_id:memberId,requirement_id:activeRequirement,
           submitted_by:state.user.id,evidence_text:textValue
         }});
         submission=created?.[0];
         if(!submission?.id)throw Error('Atividade registrada, mas não foi possível recuperar o identificador.');
         submissionCommitted=true;
       }
       if(files.length)await window.PTClassFiles.uploadEvidence(submission,memberId,files,token);
       state.activitySubmissions=await sb("activity_submissions?member_id=in.("+
          state.allMembers.map(m=>m.id).join(",")+")&select=id,member_id,requirement_id,status,evidence_text,review_notes,updated_at",token);
       await window.PTClassFiles.loadPortalFiles(token,state.allMembers.find(m=>String(m.id)===String(memberId)));
       renderApp();
     }catch(err){
       const reason=err.message||'Não foi possível enviar.';
       if(submissionCommitted){
         try{
           const token=await getValidAccessToken(state.token,false);
           state.activitySubmissions=await sb('activity_submissions?member_id=in.('+state.allMembers.map(m=>m.id).join(',')+')&select=id,member_id,requirement_id,status,evidence_text,review_notes,updated_at',token);
           await window.PTClassFiles.loadPortalFiles(token,state.allMembers.find(m=>String(m.id)===String(memberId)));
           renderApp();alert('A resposta foi salva, mas houve um problema no anexo: '+reason+' Abra a atividade novamente para tentar anexar.');
           return;
         }catch(refreshErr){console.error(refreshErr);}
       }
       message.textContent=reason;save.disabled=false;save.textContent='Enviar para avaliação';
     }
   };
 }
 function nav(){
   return '<aside class="sidebar">'+brand()+languageControl()+
     '<nav class="nav"><button class="active" data-route="dashboard">⌂ Meu Progresso</button></nav>'+
     '<div class="sidebar-spacer"></div><div class="profile-mini"><div class="avatar">'+initials(state.user.full_name||"Portal")+'</div>'+
     '<div><strong>'+h(state.user.full_name||"")+'</strong><small>'+(state.user.role==="parent"?"Responsável":"Desbravador")+'</small></div></div></aside>';
 }
 function mobileNav(){
   return '<nav class="bottom-nav" style="grid-template-columns:1fr"><button data-route="dashboard" class="active">⌂<br>Meu Progresso</button></nav>';
 }
 window.PTPortal={load,view,bind,nav,mobileNav,isPortalRole};
})();
