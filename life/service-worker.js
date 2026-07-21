'use strict';
const CACHE='yos-life-os-v3';
const STATIC=['./','./index.html','./manifest.webmanifest','./v3.css','./v3.js'];
const isAppPage=url=>url.pathname.endsWith('/life/')||url.pathname.endsWith('/life/index.html');
async function inject(response){
  let html=await response.text();
  if(!html.includes('v3.js'))html=html.replace('</body>','<script src="./v3.js?v=3"></script></body>');
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(STATIC);
  for(const path of ['./','./index.html']){
    const response=await fetch(path,{cache:'reload'});
    await cache.put(path,await inject(response));
  }
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin&&isAppPage(url)){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      const transformed=await inject(response),copy=transformed.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return transformed;
    }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)));
});
