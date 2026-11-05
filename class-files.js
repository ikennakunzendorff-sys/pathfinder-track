/* Phase 3.2: private class resources and evidence files. */
(function(){
"use strict";
const allowedTypes={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
const maxBytes=5*1024*1024;
const h=x=>esc(String(x??""));
const uuid=()=>crypto.randomUUID();
function validate(file){
 if(!file||!allowedTypes[file.type])throw Error("Use PDF, JPG, PNG ou WebP.");
 if(file.size<=0||file.size>maxBytes)throw Error("Cada arquivo deve ter até 5 MB.");
 return allowedTypes[file.type];
}
async function upload(bucket,path,file,token){
 const res=await authenticatedFetch(SUPABASE_URL+"/storage/v1/object/"+bucket+"/"+path,{
   method:"POST",headers:{"Content-Type":file.type,"x-upsert":"false","cache-control":"max-age=3600"},body:file
 },token);
 if(!res.ok){let detail="Falha no upload ("+res.status+").";try{const p=await res.json();detail=p.message||p.error||detail;}catch{}throw Error(detail);}
 return res.json();
}
async function open(bucket,path){
 // Open synchronously from the user gesture so mobile popup blockers do not discard the download.
 const tab=window.open("about:blank","_blank");
 if(tab)tab.opener=null;
 try{
   const token=await getValidAccessToken(state.token,false);
   const res=await authenticatedFetch(SUPABASE_URL+"/storage/v1/object/sign/"+bucket+"/"+path,{
     method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expiresIn:60})
   },token);
   if(!res.ok)throw Error("Sem permissão para abrir este arquivo.");
   const data=await res.json();
   const signed=data.signedURL||data.signedUrl;
   if(!signed)throw Error("Não foi possível gerar o link temporário.");
   const url=new URL(signed,SUPABASE_URL).href;
   if(tab)tab.location.replace(url);else window.location.assign(url);
 }catch(err){if(tab)tab.close();throw err;}
}
function bindOpens(root=document){
 root.querySelectorAll("[data-private-file]").forEach(btn=>btn.onclick=async()=>{
   btn.disabled=true;
   try{await open(btn.dataset.privateBucket,btn.dataset.privateFile);}
   catch(e){alert(e.message);}
   finally{btn.disabled=false;}
 });
}
async function evidenceFilesFor(submissionIds,token){
 if(!submissionIds?.length)return [];
 return sb("activity_evidence_files?submission_id=in.("+submissionIds.join(",")+")&select=id,submission_id,display_name,file_path&order=created_at.asc",token);
}
async function uploadEvidence(submission,memberId,fileList,token){
 const files=Array.from(fileList||[]);
 if(files.length>5)throw Error("Máximo de 5 arquivos por atividade.");
 const existing=await evidenceFilesFor([submission.id],token);
 if(existing.length+files.length>5)throw Error("Máximo de 5 arquivos por atividade.");
 for(const file of files){
   const ext=validate(file),id=uuid();
   const path=[state.user.club_id,memberId,submission.id,id+"."+ext].join("/");
   await sbWrite("activity_evidence_files",token,{body:{
     id,submission_id:submission.id,club_id:state.user.club_id,member_id:memberId,
     file_path:path,display_name:file.name.slice(0,180),uploaded_by:state.user.id
   }});
   try{
     await upload("pt-activity-evidence",path,file,token);
   }catch(err){
     try{await sbWrite("activity_evidence_files?id=eq."+encodeURIComponent(id),token,{method:"DELETE"});}
     catch(cleanupError){console.warn("Evidence metadata cleanup failed",cleanupError);}
     throw err;
   }
 }
}
function linkButtons(files,bucket){
 return (files||[]).map(f=>'<button type="button" class="btn btn-ghost" style="width:auto;margin:5px 5px 5px 0" data-private-bucket="'+h(bucket)+
 '" data-private-file="'+h(f.file_path)+'">📎 '+h(f.display_name||f.title||"Abrir arquivo")+'</button>').join("");
}
let portalFiles=[],portalMaterials=[];
async function loadPortalFiles(token,member){
 if(!member?.current_class_level_id){portalFiles=[];portalMaterials=[];return {files:[],materials:[]};}
 const ids=(state.activitySubmissions||[]).filter(s=>String(s.member_id)===String(member.id)).map(s=>s.id);
 const [files,materials]=await Promise.all([
   evidenceFilesFor(ids,token),
   sb("class_library_materials?class_level_id=eq."+encodeURIComponent(member.current_class_level_id)+"&select=id,class_level_id,requirement_id,title,description,external_url,file_path&order=created_at.desc",token)
 ]);
 portalFiles=files;portalMaterials=materials;
 return {files,materials};
}
function portalLibrary(member){
 const rows=portalMaterials.filter(m=>String(m.class_level_id)===String(member.current_class_level_id)).map(m=>
  '<div class="member-row" style="display:block"><strong>'+h(m.title)+'</strong><p>'+h(m.description||"")+'</p>'+
  (m.file_path?linkButtons([{file_path:m.file_path,display_name:m.title}],"pt-class-library"):
   '<a href="'+h(m.external_url)+'" target="_blank" rel="noopener noreferrer">Abrir material ↗</a>')+
  '</div>').join("");
 return '<section class="card" style="margin-top:14px"><div class="card-head"><div><h3>Biblioteca de Classes</h3>'+
   '<p>Materiais da sua classe. Arquivos abrem com links temporários e privados.</p></div></div>'+
   '<div class="card-body" id="ptPortalLibrary">'+(rows||'<p class="form-hint">Nenhum material publicado ainda.</p>')+'</div></section>';
}
function portalEvidenceFor(submissionId){return linkButtons(portalFiles.filter(x=>String(x.submission_id)===String(submissionId)),"pt-activity-evidence");}
let staffMaterials=[],loading=false;
function staffPanel(){
 if(!["director","instructor"].includes(state?.user?.role)||state.mode!=="live")return "";
 const classes=availableClassLevels();
 return '<section class="card" id="ptLibraryStaff" style="padding:18px;margin-bottom:18px"><h3>Biblioteca de Classes</h3>'+
 '<p class="form-hint">Publique PDFs, imagens ou links HTTPS. Arquivos privados: até 5 MB.</p>'+
 '<div style="display:flex;flex-wrap:wrap;gap:9px;align-items:end">'+
 '<label>Classe<select id="ptLibraryClass">'+classes.map(c=>'<option value="'+h(c.id)+'">'+h(c.name)+'</option>').join("")+'</select></label>'+
 '<label>Requisito (opcional)<select id="ptLibraryReq"><option value="">Material geral</option></select></label></div>'+
 '<label>Título<input id="ptLibraryTitle" maxlength="160" placeholder="Título do material"></label>'+
 '<label>Descrição<input id="ptLibraryDesc" maxlength="2000" placeholder="Resumo opcional"></label>'+
 '<label>Link HTTPS (ou escolha um arquivo)<input id="ptLibraryURL" type="url" placeholder="https://"></label>'+
 '<label>Arquivo PDF/imagem<input id="ptLibraryUpload" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"></label>'+
 '<button class="btn btn-primary" style="width:auto" id="ptLibrarySave">Publicar material</button>'+
 '<p id="ptLibraryMessage" role="status" aria-live="polite"></p><div id="ptLibraryRows"></div></section>';
}
function staffRows(){
 const root=document.getElementById("ptLibraryRows");if(!root)return;
 const selected=document.getElementById("ptLibraryClass")?.value;
 const rows=staffMaterials.filter(x=>String(x.class_level_id)===String(selected));
 root.innerHTML=rows.length?rows.map(m=>'<div class="member-row" style="display:block"><strong>'+h(m.title)+'</strong> '+h(m.description||"")+
 (m.file_path?linkButtons([{file_path:m.file_path,display_name:m.title}],"pt-class-library"):
 '<p><a href="'+h(m.external_url)+'" rel="noopener noreferrer" target="_blank">Abrir link ↗</a></p>')+'</div>').join(""):'<p class="form-hint">Nenhum material nesta classe.</p>';
 bindOpens(root);
}
async function reloadStaff(){
 if(loading)return;loading=true;
 const msg=document.getElementById("ptLibraryMessage");
 try{
   const token=await getValidAccessToken(state.token,false);
   staffMaterials=await sb("class_library_materials?club_id=eq."+encodeURIComponent(state.user.club_id)+
     "&select=id,class_level_id,requirement_id,title,description,external_url,file_path&order=created_at.desc",token);
   staffRows();if(msg)msg.textContent="";
 }catch(err){if(msg)msg.textContent=err.message;}
 finally{loading=false;}
}
function bindStaff(){
 const select=document.getElementById("ptLibraryClass");if(!select)return;
 const req=document.getElementById("ptLibraryReq");
 function fillRequirements(){
  req.innerHTML='<option value="">Material geral</option>'+
   (state.requirements||[]).filter(r=>String(r.class_level_id)===String(select.value))
   .map(r=>'<option value="'+h(r.id)+'">'+h((r.code||"")+" "+r.title)+'</option>').join("");
  staffRows();
 }
 select.onchange=fillRequirements;
 const save=document.getElementById("ptLibrarySave");
 save.onclick=async()=>{
   const msg=document.getElementById("ptLibraryMessage");
   const title=document.getElementById("ptLibraryTitle").value.trim();
   const desc=document.getElementById("ptLibraryDesc").value.trim();
   const url=document.getElementById("ptLibraryURL").value.trim();
   const file=document.getElementById("ptLibraryUpload").files[0];
   if(title.length<3||Boolean(file)===Boolean(url)){msg.textContent="Informe o título e escolha um link OU um arquivo.";return;}
   if(url&&!/^https:\/\//i.test(url)){msg.textContent="Use apenas links HTTPS.";return;}
   let ext;
   try{if(file)ext=validate(file);}catch(err){msg.textContent=err.message;return;}
   save.disabled=true;save.textContent="Publicando…";msg.textContent="";
   try{
    const token=await getValidAccessToken(state.token,false);
    const id=uuid(),path=file?[state.user.club_id,id,uuid()+"."+ext].join("/"):null;
    await sbWrite("class_library_materials",token,{body:{
      id,club_id:state.user.club_id,class_level_id:select.value,requirement_id:req.value||null,
      title,description:desc||null,external_url:url||null,file_path:path,created_by:state.user.id
    }});
    if(file){
      try{await upload("pt-class-library",path,file,token);}
      catch(err){
        try{await sbWrite("class_library_materials?id=eq."+encodeURIComponent(id),token,{method:"DELETE"});}
        catch(cleanupError){console.warn("Library metadata cleanup failed",cleanupError);}
        throw err;
      }
    }
    document.getElementById("ptLibraryTitle").value="";
    document.getElementById("ptLibraryDesc").value="";
    document.getElementById("ptLibraryURL").value="";
    document.getElementById("ptLibraryUpload").value="";
    await reloadStaff();msg.textContent="Material publicado.";
   }catch(err){msg.textContent=err.message||"Erro ao publicar.";}
   finally{save.disabled=false;save.textContent="Publicar material";}
 };
 fillRequirements();reloadStaff();
}
window.PTClassFiles={validate,uploadEvidence,evidenceFilesFor,loadPortalFiles,portalLibrary,portalEvidenceFor,staffPanel,bindStaff,bindOpens,linkButtons};
})();