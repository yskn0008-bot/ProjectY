'use strict';
const CACHE='yos-taxi-projecty-v15';
const STATIC=['./','./index.html','./calendar.html','./settings.html','./manifest.webmanifest','./v9.css','./v9.js','./swipe-nav.js','./v14.css','./v14.js','./v15.js'];
const isIndex=url=>url.pathname.endsWith('/taxi/')||url.pathname.endsWith('/taxi/index.html');
const isAppPage=url=>isIndex(url)||url.pathname.endsWith('/taxi/calendar.html')||url.pathname.endsWith('/taxi/settings.html');
async function inject(response,url){
  const html=await response.text();
  let body=html;
  if(isIndex(url)&&!body.includes('v9.css'))body=body.replace('</head>','<link rel="stylesheet" href="./v9.css"></head>').replace('</body>','<script src="./v9.js"></script></body>');
  if(!body.includes('swipe-nav.js'))body=body.replace('</body>','<script src="./swipe-nav.js"></script></body>');
  if(!body.includes('v14.css'))body=body.replace('</head>','<link rel="stylesheet" href="./v14.css"></head>');
  if(!body.includes('v14.js'))body=body.replace('</body>','<script src="./v14.js"></script></body>');
  if(!body.includes('v15.js'))body=body.replace('</body>','<script src="./v15.js"></script></body>');
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(STATIC.filter(path=>!['./','./index.html','./calendar.html','./settings.html'].includes(path)));
  for(const path of ['./','./index.html','./calendar.html','./settings.html']){
    const response=await fetch(path),url=new URL(path,self.location.href);
    await cache.put(path,await inject(response,url));
  }
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin&&isAppPage(url)){
    event.respondWith(fetch(event.request).then(async response=>{
      const transformed=await inject(response,url),copy=transformed.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return transformed;
    }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match(url.pathname.endsWith('calendar.html')?'./calendar.html':url.pathname.endsWith('settings.html')?'./settings.html':'./index.html'))));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});
