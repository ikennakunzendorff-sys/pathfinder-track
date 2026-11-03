/* Pathfinder Track service worker. Only public static assets are cached. */
const CACHE_NAME='pt-static-v1';
const OFFLINE_URL='/offline.html';
const STATIC_ASSETS=[OFFLINE_URL,'/manifest.webmanifest','/member-import.js','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png'];
self.addEventListener('install',event=>{
  // A new worker stays waiting until users approve an update.
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_ASSETS)));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('pt-static-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
  if(event.data&&event.data.type==='CLEAR_STATIC_CACHE'){
    event.waitUntil(caches.delete(CACHE_NAME));
  }
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  // Never cache session, user, Supabase API, query strings or application HTML.
  if(request.mode==='navigate'){
    event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>caches.match(OFFLINE_URL)));
    return;
  }
  if(url.search)return;
  if(!STATIC_ASSETS.includes(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await cache.match(url.pathname);
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok&&response.type==='basic')await cache.put(url.pathname,response.clone());
    return response;
  })());
});
