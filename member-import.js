/* Pathfinder Track - bulk Pathfinder import (director only). */
(function () {
  "use strict";
  var importRows = [];
  var importing = false;
  var messages = {en:{title:"Import Pathfinders",hint:"CSV or XLSX · up to 500 rows · 2 MB. Preview and validate before saving. Existing names are never overwritten.",choose:"Choose CSV or Excel file",template:"Download CSV template",submit:"Import valid rows",close:"Close",empty:"Select a file to preview.",row:"Row",name:"Full name",grade:"Grade",unit:"Unit",level:"Class",status:"Validation",ready:"Ready",duplicate:"Duplicate",invalid:"Invalid",count:"Ready",cancel:"Cancel"},
  pt:{title:"Importar Desbravadores",hint:"CSV ou XLSX · até 500 linhas · 2 MB. Confira os dados antes de salvar. Cadastros existentes nunca serão sobrescritos.",choose:"Escolher arquivo CSV ou Excel",template:"Baixar modelo CSV",submit:"Importar linhas válidas",close:"Fechar",empty:"Selecione um arquivo para visualizar.",row:"Linha",name:"Nome completo",grade:"Série escolar",unit:"Unidade",level:"Classe",status:"Validação",ready:"Pronto",duplicate:"Duplicado",invalid:"Inválido",count:"Prontos",cancel:"Cancelar"},
  es:{title:"Importar Conquistadores",hint:"CSV o XLSX · hasta 500 filas · 2 MB. Revise los datos antes de guardar. Los registros existentes no se sobrescriben.",choose:"Elegir archivo CSV o Excel",template:"Descargar plantilla CSV",submit:"Importar filas válidas",close:"Cerrar",empty:"Seleccione un archivo para ver la vista previa.",row:"Fila",name:"Nombre completo",grade:"Grado escolar",unit:"Unidad",level:"Clase",status:"Validación",ready:"Listo",duplicate:"Duplicado",invalid:"Inválido",count:"Listos",cancel:"Cancelar"}};
  function tr(){return messages[typeof uiLanguage==="string" && messages[uiLanguage] ? uiLanguage : "en"];}
  function norm(v){return String(v==null?"":v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();}
  function html(v){return esc(String(v==null?"":v));}
  function str(v){return String(v==null?"":v).trim();}
  function csvParse(text) {
    text=String(text).replace(/^\uFEFF/,"");
    var data=[],row=[],field="",quoted=false,closed=false;
    for(var i=0;i<text.length;i++){
      var c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
      else if(c==='"'){if(field!=="" || closed)throw Error("Invalid CSV quotation on row "+(data.length+1));quoted=true;}
      else if(c===','){row.push(field);field="";closed=false;}
      else if(c==='\n' || c==='\r'){row.push(field);if(row.some(function(v){return str(v)!=="";}))data.push(row);row=[];field="";closed=false;if(c==='\r' && text[i+1]==='\n')i++;}
      else {if(closed && !/\s/.test(c))throw Error("Unexpected characters after a CSV quotation");field+=c;}
    }
    if(quoted)throw Error("Unclosed CSV quotation");
    row.push(field);if(row.some(function(v){return str(v)!=="";}))data.push(row);
    return data;
  }
  function lookup(value,items){
    var key=norm(value);
    if(!key)return {id:null};
    var found=items.filter(function(item){return norm(item.name)===key || String(item.id).toLowerCase()===key;});
    return found.length===1 ? {id:found[0].id} : {error:found.length ? "Ambiguous value: "+value : "Not found: "+value};
  }
  function mapHeaders(head){
    var aliases={
      full_name:["full_name","name","nome","nome completo","nome_completo","pathfinder","desbravador"],
      school_grade:["school_grade","grade","serie","serie escolar","série escolar","ano escolar","grau"],
      unit:["unit","unit_name","unidade","nome da unidade","unidade_nome"],
      class_level:["class","class_level","classe","classe de desbravadores","classe_desbravador"]
    };
    var mapped={};
    Object.keys(aliases).forEach(function(field){
      var indexes=head.map(function(h,i){return aliases[field].some(function(k){return norm(h).replace(/_/g," ")===norm(k).replace(/_/g," ");})?i:-1;}).filter(function(i){return i>=0;});
      if(indexes.length>1)throw Error("Duplicate column: "+field);
      mapped[field]=indexes.length?indexes[0]:-1;
    });
    if(["full_name","school_grade","unit"].some(function(f){return mapped[f]===-1;}))throw Error("Missing required columns: full_name, school_grade, unit");
    return mapped;
  }
  function existingKeys(members){return new Set((members||[]).map(function(m){return norm(m.full_name);}).filter(Boolean));}
  function buildPreview(data,members){
    if(!data.length)throw Error("Empty file");
    if(data.length>501)throw Error("Maximum 500 data rows per import");
    var head=mapHeaders(data[0]),existing=existingKeys(members),seen=new Set();
    var units=(state.units||[]).filter(function(u){return u.active!==false;});
    var classes=state.classLevels||[];
    return data.slice(1).map(function(row,i){
      var name=str(row[head.full_name]),gradeRaw=str(row[head.school_grade]),unitRaw=str(row[head.unit]);
      var classRaw=head.class_level===-1?"":str(row[head.class_level]),issues=[],kind="ready";
      var grade=/^(?:[1-9]|1[0-2])$/.test(gradeRaw)?Number(gradeRaw):null;
      var u=lookup(unitRaw,units),c=lookup(classRaw,classes),key=norm(name);
      if(!name || name.length>120 || /[\u0000-\u001f]/.test(name))issues.push("Invalid name (1–120 characters)");
      if(!grade)issues.push("Grade must be 1–12");
      if(!unitRaw || u.error)issues.push(u.error||"Unit required");
      if(c.error)issues.push(c.error);
      if(!issues.length && (existing.has(key)||seen.has(key))){kind="duplicate";issues.push(existing.has(key)?"Already registered":"Repeated in file");}
      else if(issues.length)kind="invalid";
      if(key)seen.add(key);
      return {line:i+2,name:name,grade:grade,unit_id:u.id,class_id:c.id,unit_label:unitRaw,class_label:classRaw,kind:kind,reason:issues.join("; ")};
    });
  }
  function summary(){var ready=importRows.filter(function(x){return x.kind==="ready";}).length,duplicate=importRows.filter(function(x){return x.kind==="duplicate";}).length,invalid=importRows.filter(function(x){return x.kind==="invalid";}).length;return {ready:ready,duplicate:duplicate,invalid:invalid};}
  function panel(){var t=tr();return '<section class="card" id="bulkImportPanel" hidden style="margin-bottom:18px">'+
    '<div class="card-head"><div><h3>'+t.title+'</h3><p>'+t.hint+'</p></div><button type="button" class="btn btn-ghost" id="bulkImportClose">'+t.close+'</button></div>'+
    '<div class="card-body"><div class="members-toolbar"><input type="file" id="bulkImportFile" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="'+t.choose+'"><button type="button" class="btn btn-ghost" id="bulkImportTemplate">'+t.template+'</button></div>'+
    '<p id="bulkImportMessage" class="form-hint" role="status" aria-live="polite">'+t.empty+'</p>'+
    '<div id="bulkImportPreview" style="overflow-x:auto"></div><div style="margin-top:14px"><button type="button" class="btn btn-primary" id="bulkImportSave" style="width:auto" disabled>'+t.submit+'</button></div></div></section>';
  }
  function status(text,error){
    var el=document.getElementById("bulkImportMessage");if(el){el.textContent=text;el.style.color=error?"var(--red)":"var(--forest-700)";}
  }
  function preview(){
    var host=document.getElementById("bulkImportPreview"),button=document.getElementById("bulkImportSave");if(!host)return;
    var t=tr(),s=summary();button.disabled=importing || !s.ready;
    if(!importRows.length){host.innerHTML="";return;}
    var table='<div class="form-hint">'+s.ready+' '+t.ready+' · '+s.duplicate+' '+t.duplicate+' · '+s.invalid+' '+t.invalid+'</div>'+
    '<table class="report-table" style="min-width:650px;width:100%"><thead><tr><th>'+t.row+'</th><th>'+t.name+'</th><th>'+t.grade+'</th><th>'+t.unit+'</th><th>'+t.level+'</th><th>'+t.status+'</th></tr></thead><tbody>';
    importRows.forEach(function(x){table+='<tr><td>'+x.line+'</td><td>'+html(x.name)+'</td><td>'+html(x.grade)+'</td><td>'+html(x.unit_label)+'</td><td>'+html(x.class_label||"—")+'</td><td>'+html(x.kind==="ready"?t.ready:(x.kind==="saved"?"Saved":(x.kind==="duplicate"?t.duplicate:t.invalid)))+(x.reason?' · '+html(x.reason):"")+'</td></tr>';});
    host.innerHTML=table+'</tbody></table>';
  }
  function show(){if(state?.mode!=="live" || state?.user?.role!=="director")return;var el=document.getElementById("bulkImportPanel");if(el){el.hidden=false;el.scrollIntoView({behavior:"smooth",block:"start"});preview();}}
  function hide(){if(importing)return;var el=document.getElementById("bulkImportPanel");if(el)el.hidden=true;}
  function template(){
    var text="\uFEFFfull_name,school_grade,unit,class_level\r\n";
    var blob=new Blob([text],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="pathfinder-members-template.csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  function loadXlsxLibrary(){
    if(window.XLSX && window.XLSX.read)return Promise.resolve();
    if(window._ptXlsxPromise)return window._ptXlsxPromise;
    window._ptXlsxPromise=new Promise(function(resolve,reject){
      var script=document.createElement("script");
      script.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.onload=function(){window.XLSX&&window.XLSX.read?resolve():reject(Error("Excel parser did not load"));};
      script.onerror=function(){reject(Error("Excel reader unavailable. Export as CSV and retry."));};
      document.head.appendChild(script);
    }).catch(function(error){window._ptXlsxPromise=null;throw error;});
    return window._ptXlsxPromise;
  }
  async function readFile(file){
    if(!file)throw Error("Select a CSV or XLSX file");
    if(file.size>2*1024*1024)throw Error("File exceeds 2 MB");
    if(/\.csv$/i.test(file.name))return csvParse(await file.text());
    if(/\.xlsx$/i.test(file.name)){
      await loadXlsxLibrary();
      var workbook=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:false});
      if(!workbook.SheetNames.length)throw Error("Excel workbook has no worksheets");
      return window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:"",raw:false,blankrows:false});
    }
    throw Error("Only .csv and .xlsx files are supported");
  }
  async function fileChanged(e){
    importRows=[];preview();var file=e.target.files&&e.target.files[0];if(!file)return;
    status("Reading and validating "+file.name+"…",false);
    try{
      var fresh=await sb("members?club_id=eq."+encodeURIComponent(state.user.club_id)+"&select=id,full_name&limit=10000",state.token);
      var data=await readFile(file);
      importRows=buildPreview(data,fresh);preview();
      var s=summary();status(s.ready+" ready · "+s.duplicate+" duplicates skipped · "+s.invalid+" invalid. Review preview before importing.",s.invalid>0);
    }catch(err){importRows=[];preview();status(err.message||"Could not read this file",true);}
  }
  async function save(){
    if(importing || state?.mode!=="live" || state?.user?.role!=="director")return;
    var candidates=importRows.filter(function(x){return x.kind==="ready";});
    if(!candidates.length)return;
    if(!confirm("Import "+candidates.length+" Pathfinders? Only validated rows will be created. Existing members will not be changed."))return;
    importing=true;preview();var created=0,skipped=0,failures=[];
    try{
      var fresh=await sb("members?club_id=eq."+encodeURIComponent(state.user.club_id)+"&select=id,full_name&limit=10000",state.token);
      var existing=existingKeys(fresh);
      for(var i=0;i<candidates.length;i++){
        var x=candidates[i],key=norm(x.name);
        if(existing.has(key)){x.kind="duplicate";x.reason="Registered by another operation";skipped++;continue;}
        try{
          await sbWrite("members",state.token,{body:[{club_id:state.user.club_id,full_name:x.name,school_grade:x.grade,unit_id:x.unit_id,current_class_level_id:x.class_id||null,active:true}],prefer:"return=representation"});
          existing.add(key);x.kind="saved";created++;
        }catch(err){
          x.kind="invalid";x.reason=err.message||"Database insert failed";failures.push("Row "+x.line+": "+x.reason);
          if(/unauthoriz|permission|token|session|401|403|jwt/i.test(x.reason))break;
        }
        if((i+1)%10===0)status("Importing "+(i+1)+"/"+candidates.length+"…",false);
      }
      await refreshMembersFromDb();
      state.auditLoaded=false;state.scoreboardLoaded=false;
      status(created+" created; "+skipped+" skipped as duplicates; "+failures.length+" failed."+(failures.length?" Please review errors.":""),failures.length>0);
      preview();
      // Re-render the updated member directory without hiding the result message.
      var directory=document.getElementById("memberDirectory");
      if(directory)directory.innerHTML=(state.allMembers||[]).map(function(m){return memberDirectoryRow(m,true);}).join("");
      filterMemberDirectory();
    }catch(err){status("Import stopped: "+(err.message||String(err))+". "+created+" records may have been created. Refresh before retrying.",true);}
    finally{importing=false;preview();}
  }
  function bind(){
    var showBtn=document.getElementById("bulkImportOpen"),closeBtn=document.getElementById("bulkImportClose"),file=document.getElementById("bulkImportFile"),tmpl=document.getElementById("bulkImportTemplate"),saveBtn=document.getElementById("bulkImportSave");
    if(showBtn)showBtn.onclick=show;
    if(closeBtn)closeBtn.onclick=hide;
    if(file)file.onchange=fileChanged;
    if(tmpl)tmpl.onclick=template;
    if(saveBtn)saveBtn.onclick=save;
  }
  window.PTMemberImport={panel:panel,bind:bind,parseCSV:csvParse,buildPreview:buildPreview,summary:summary};
})();