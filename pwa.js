/* Pathfinder Track PWA: installation, connection state and explicit updates. */
(() => {
  "use strict";
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  let deferredInstall = null;
  let acceptedUpdate = false;
  let updateWorker = null;
  let registration = null;
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isiOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isPortuguese = () => (localStorage.getItem("pt_language") || navigator.language || "").toLowerCase().startsWith("pt");
  const text = (en, pt) => isPortuguese() ? pt : en;
  function button(label, callback, primary = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText = "border:0;border-radius:9px;padding:8px 11px;cursor:pointer;font:600 12px system-ui;";
    btn.style.background = primary ? "#173f32" : "#e9f3ee";
    btn.style.color = primary ? "#fff" : "#173f32";
    btn.addEventListener("click", callback);
    return btn;
  }
  function createNotice() {
    let notice = document.getElementById("pt-pwa-notice");
    if (notice) return notice;
    notice = document.createElement("aside");
    notice.id = "pt-pwa-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.style.cssText = "position:fixed;bottom:calc(12px + env(safe-area-inset-bottom));right:12px;z-index:120;max-width:min(340px,calc(100vw - 24px));background:white;color:#173f32;border:1px solid #dae6dd;box-shadow:0 10px 35px #173f3225;border-radius:14px;padding:13px;font:13px/1.4 system-ui;display:none;";
    document.body.appendChild(notice);
    return notice;
  }
  function offer(title, description, actions, dismiss = true) {
    const notice = createNotice();
    notice.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = title;
    heading.style.display = "block";
    heading.style.marginBottom = "3px";
    const copy = document.createElement("div");
    copy.textContent = description;
    copy.style.cssText = "font-size:12px;color:#4c6256;";
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;";
    for (const action of actions) footer.appendChild(button(action.label, action.onClick, action.primary));
    if (dismiss) footer.appendChild(button(text("Not now","Agora não"), () => notice.style.display = "none"));
    notice.append(heading,copy,footer);
    notice.style.display = "block";
  }
  async function install() {
    if (!deferredInstall) return;
    const prompt = deferredInstall;
    deferredInstall = null;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome !== "accepted") createNotice().style.display = "none";
    } catch (error) { console.warn("PWA install request was rejected.", error); }
  }
  function offerInstall() {
    if (standalone()) return;
    if (deferredInstall) {
      offer("Pathfinder Track", text("Install the app on this device.","Instalar o aplicativo neste dispositivo."),
        [{label:text("Install app","Instalar app"),onClick:install,primary:true}]);
    } else if (isiOS()) {
      offer("Pathfinder Track", text("To install, tap Share in Safari, then Add to Home Screen.","No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."),[]);
    }
  }
  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();
    deferredInstall = event;
    offerInstall();
  });
  window.addEventListener("appinstalled",()=>{
    deferredInstall=null;
    createNotice().style.display="none";
  });
  window.addEventListener("offline",()=>{
    offer(text("You are offline","Sem conexão"),text("Saving and syncing are unavailable. Reconnect before changing club records.","Não é possível salvar ou sincronizar. Reconecte antes de alterar registros do clube."),[],false);
  });
  window.addEventListener("online",()=>{
    const notice=document.getElementById("pt-pwa-notice");if(notice)notice.style.display="none";
  });
  function promptUpdate(worker) {
    if (!worker || acceptedUpdate) return;
    updateWorker = worker;
    offer(text("Update available","Atualização disponível"),
      text("A new version of Pathfinder Track is ready. Save pending changes before updating.","Uma nova versão do Pathfinder Track está pronta. Salve as alterações pendentes antes de atualizar."),
      [{label:text("Update now","Atualizar agora"),onClick:()=>{
        if (!confirm(text("Reload the app now? Unsaved changes will be lost.","Recarregar o aplicativo agora? Alterações não salvas serão perdidas."))) return;
        acceptedUpdate = true;
        updateWorker.postMessage({type:"SKIP_WAITING"});
        createNotice().style.display="none";
      },primary:true}]);
  }
  function watchRegistration(reg) {
    registration = reg;
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener("updatefound",()=>{
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange",()=>{
        if (installing.state === "installed" && navigator.serviceWorker.controller) promptUpdate(reg.waiting || installing);
      });
    });
  }
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if (acceptedUpdate) window.location.reload();
  });
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"})
      .then(reg=>{watchRegistration(reg); if(navigator.onLine) reg.update().catch(()=>{});})
      .catch(error=>console.warn("PWA service worker could not register.",error));
  });
  if (isiOS() && !standalone()) {
    window.addEventListener("load",()=>{
      if (!sessionStorage.getItem("pt_pwa_ios_hint")) {
        sessionStorage.setItem("pt_pwa_ios_hint","1");
        offerInstall();
      }
    });
  }
})();
