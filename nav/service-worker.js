'use strict';
const CACHE='yos-navi-strategy-v17';
const STATIC=['./','./index.html','./shift-phase-v1.js','./location-status-v1.js','./connectivity-status-v1.js'];
const CONNECTIVITY_SCRIPT='<script src="./connectivity-status-v1.js"></script>';
const injectConnectivity=async response=>{
  if(!response)return response;
  const html=await response.text();
  const content=html.includes('connectivity-status-v1.js')?html:html.replace('</body>',`${CONNECTIVITY_SCRIPT}\n</body>`);
  return new Response(content,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});
};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const requestUrl=new URL(event.request.url);
  const isNavPage=event.request.mode==='navigate'&&requestUrl.pathname.endsWith('/nav/');
  if(isNavPage){
    event.respondWith(fetch(event.request,{cache:'no-cache'}).then(injectConnectivity).catch(()=>caches.match('./index.html').then(injectConnectivity)));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{
    const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});