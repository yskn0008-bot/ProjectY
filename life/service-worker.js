'use strict';
const CACHE='yos-life-home-v1';
const STATIC=['./','./index.html','./manifest.webmanifest','./yos-suite-v3.js','./home-v1.js','./home-v1.css'];
async function inject(response){
  let html=await response.text();
  if(!html.includes('yos-suite-v3.js'))html=html.replace('</body>','<script src="./yos-suite-v3.js?v=4"></script></body>');
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(STATIC.filter(path=>!['./','./index.html'].includes(path)));
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
  const isPage=url.origin===self.location.origin&&(url.pathname.endsWith('/life/')||url.pathname.endsWith('/life/index.html'));
  if(isPage){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      const transformed=await inject(response),copy=transformed.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return transformed;
    }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});
