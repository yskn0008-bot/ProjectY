'use strict';
const CACHE='yos-taxi-projecty-v17';
const STATIC=['./calendar.html','./settings.html','./manifest.webmanifest','./v9.css','./v9.js','./calendar-v2.js','./calendar-v3.js','./swipe-nav.js','./v15.js'];
const pageType=url=>url.pathname.endsWith('/taxi/')||url.pathname.endsWith('/taxi/index.html')?'index':url.pathname.endsWith('/taxi/calendar.html')?'calendar':'';
async function inject(response,type){
  let html=await response.text();
  if(type==='index'){
    if(!html.includes('v9.css'))html=html.replace('</head>','<link rel="stylesheet" href="./v9.css"></head>');
    if(!html.includes('v9.js'))html=html.replace('</body>','<script src="./v9.js"></script></body>');
    if(!html.includes('swipe-nav.js'))html=html.replace('</body>','<script src="./swipe-nav.js"></script></body>');
  }
  if(type==='calendar'){
    if(!html.includes('calendar-v2.js'))html=html.replace('</body>','<script src="./calendar-v2.js?v=17"></script></body>');
    if(!html.includes('swipe-nav.js'))html=html.replace('</body>','<script src="./swipe-nav.js"></script></body>');
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);await cache.addAll(STATIC);
  for(const path of ['./','./index.html','./calendar.html']){
    const response=await fetch(path,{cache:'reload'}),type=path.includes('calendar')?'calendar':'index';
    await cache.put(path,await inject(response,type));
  }
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),type=url.origin===self.location.origin?pageType(url):'';
  if(type){event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{const transformed=await inject(response,type),copy=transformed.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return transformed}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match(type==='calendar'?'./calendar.html':'./index.html'))));return}
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});
