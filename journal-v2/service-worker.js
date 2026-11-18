'use strict';
const CACHE='yos-journal-original-restored-v1-20261118';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./cover.jpg','./skin.jpg','./taxi.jpg','./life.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('yos-journal-pageflip-')||key.startsWith('yos-journal-original-restored-'))&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==self.location.origin)return;
 const scope=new URL('./',self.location.href).pathname;
 if(!url.pathname.startsWith(scope))return; // Never cache private sibling paths or personal API responses.
 event.respondWith(fetch(req).then(response=>{if(response.ok){const cloned=response.clone();caches.open(CACHE).then(c=>c.put(req,cloned)).catch(()=>{})}return response}).catch(()=>caches.match(req).then(hit=>hit||caches.match('./index.html'))));
});