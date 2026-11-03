/* Pathfinder Track — Phase 1 parent/pathfinder portal: linked-member read-only dashboard. */
(function(){
 "use strict";
 function h(x){return esc(String(x??""));}
 function isPortalRole(){return state?.mode==="live"&&["parent","pathfinder"].includes(state.user?.role);}
 async function load(profile,token){
   const enc=encodeURIComponent(profile.club_id);
   const [clubs,units,years,links,classLevels,requirements]=await Promise.all([
     sb("clubs?id=eq."+enc+"&select=id,name,location",token),
     sb("units?club_id=eq."+enc+"&select=id,name,active&order=name",token),
     sb("club_years?club_id=eq."+enc+"&select=id,label,start_date,end_date,active&order=start_date.desc",token),
     sb("portal_member_links?user_id=eq."+encodeURIComponent(profile.id)+"&active=eq.true&select=id,user_id,member_id,link_type,active",token),
     sb("class_levels?select=id,name,order_index&order=order_index",token),
     sb("requirements?select=id,class_level_id,code,title,is_advanced&order=sort_index",token)
   ]);
   const ids=links.map(x=>x.member_id);
   const filter=ids.length?"&id=in.("+ids.join(",")+")":"&id=eq.00000000-0000-0000-0000-000000000000";
   const [members,statuses,attendance,scores,meetings]=await Promise.all([
     sb("members?club_id=eq."+enc+filter+"&select=id,full_name,school_grade,current_class_level_id,unit_id,active,created_at,class_levels(name)&order=full_name",token),
     ids.length?sb("member_requirement_status?member_id=in.("+ids.join(",")+")&select=member_id,requirement_id,status,completed_at",token):Promise.resolve([]),
     ids.length?sb("attendance?member_id=in.("+ids.join(",")+")&select=meeting_id,member_id,present",token):Promise.resolve([]),
     ids.length?sb("meeting_scores?member_id=in.("+ids.join(",")+")&select=meeting_id,member_id,points_awarded,max_points_snapshot",token):Promise.resolve([]),
     ids.length?sb("meetings?club_id=eq."+enc+"&select=id,meeting_date,title,unit_id,club_year_id,meeting_type&order=meeting_date.desc&limit=500",token):Promise.resolve([])
   ]);
   const own=new Set(ids.map(String));
   const verified=members.filter(m=>own.has(String(m.id))&&m.active!==false);
   state={
     mode:"live",token:readAuthSession()?.access_token||token,user:profile,
     club:clubs[0]||{name:"Pathfinder Track"},units,clubYears:years,
     clubYear:years.find(y=>y.active)||null,
     allMembers:verified,members:[],portalLinks:links,portalAttendance:attendance,
     portalScores:scores,portalSelectedMemberId:verified[0]?.id||null,
     classLevels,requirements,requirementStatuses:statuses,meetings,
     categories:[],staff:[],staffClassLinks:[],auditLogs:[],scoreboardMeetings:[],
     scoreboardScores:[],scoreboardAttendance:[],scoreboardLoaded:false,
     auditLoaded:false,unit:units[0]||{},selectedUnitId:null,meeting:null
   };
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
   const classReqs=(state.requirements||[]).filter(r=>String(r.class_level_id)===String(person.current_class_level_id)&&!r.is_advanced);
   const completed=new Set(statuses.filter(x=>x.status==="completed").map(x=>String(x.requirement_id)));
   const done=classReqs.filter(x=>completed.has(String(x.id))).length;
   const possible=classReqs.length,pct=possible?Math.round(100*done/possible):0;
   const scores=(state.portalScores||[]).filter(x=>String(x.member_id)===id);
   const earned=scores.reduce((sum,r)=>sum+Number(r.points_awarded||0),0);
   const maximum=scores.reduce((sum,r)=>sum+Number(r.max_points_snapshot||0),0);
   const attend=(state.portalAttendance||[]).filter(x=>String(x.member_id)===id);
   const present=attend.filter(x=>x.present===true).length;
   const attPct=attend.length?Math.round(100*present/attend.length):0;
   const meetingIndex=new Map((state.meetings||[]).map(m=>[String(m.id),m]));
   const latest=attend.slice().sort((a,b)=>String(meetingIndex.get(String(b.meeting_id))?.meeting_date||"").localeCompare(String(meetingIndex.get(String(a.meeting_id))?.meeting_date||""))).slice(0,6).map(x=>{
      const meeting=meetingIndex.get(String(x.meeting_id));
      const date=meeting?.meeting_date||"—";
      return '<div class="member-row"><div><strong>'+h(meeting?.title||"Reunião")+'</strong><small>'+h(date)+'</small></div><span class="status-pill">'+(x.present?"Presente":"Ausente")+'</span></div>';
   }).join("");
   return '<div class="director-dashboard">'+header()+
     choose+
     '<section class="card" style="padding:20px;margin-top:14px"><div class="eyebrow">Meu Progresso · Somente leitura</div><h2>'+h(person.full_name)+'</h2><p>'+
       h(person.current_class_level_id?(person.class_levels?.name||"Classe atribuída"):"Sem classe atribuída")+' · '+h((state.units||[]).find(u=>u.id===person.unit_id)?.name||"Sem unidade")+
     '</p></section>'+
     '<section class="director-kpis" style="margin-top:14px">'+
       '<div class="director-kpi"><span>Progresso da classe</span><strong>'+pct+'%</strong><small>'+done+' / '+possible+' requisitos básicos</small></div>'+
       '<div class="director-kpi"><span>Presença registrada</span><strong>'+attPct+'%</strong><small>'+present+' / '+attend.length+' registros</small></div>'+
       '<div class="director-kpi"><span>Pontuação individual</span><strong>'+earned+'</strong><small>'+maximum+' pontos possíveis salvos</small></div>'+
     '</section>'+
     '<section class="card" style="margin-top:14px"><div class="card-head"><div><h3>Minhas últimas reuniões</h3><p>Somente reuniões com presença individual registrada.</p></div></div><div class="card-body">'+(latest||'<div class="member-empty">Nenhuma presença registrada.</div>')+'</div></section>'+
     '<section class="card" style="margin-top:14px;padding:20px"><h3>Biblioteca de Classes</h3><p>Em desenvolvimento. Futuramente, atividades e evidências poderão ser enviadas para avaliação do instrutor.</p></section>'+
     '<p class="form-hint" style="margin-top:14px">Os resultados são somente para consulta e podem depender do lançamento das reuniões e requisitos pela liderança. Não é possível alterar requisitos nem pontuações por este portal.</p>'+
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
   if(select)select.onchange=()=>{state.portalSelectedMemberId=select.value;renderApp();};
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
