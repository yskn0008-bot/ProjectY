'use strict';
const CACHE='yos-life-home-v19-my-way-refinement';
const LIFE_CACHE_PREFIX='yos-life-';
const STATIC=[
  './',
  './index.html',
  './manifest.webmanifest',
  './yos-suite-v3.js?v=8',
  './home-v1.js?v=8',
  './home-v1.css?v=8',
  './home-priority-v1.css?v=4',
  './readability-final.css?v=2'
];
async function inject(response){
  let html=await response.text();
  html=html.replace(/<link rel="stylesheet" href="\.\/readability-final\.css\?v=1">/g,'<link rel="stylesheet" href="./readability-final.css?v=2">');
  if(!html.includes('life-preinstall-guard'))html=html.replace('</head>','<style id="life-preinstall-guard">main.app{visibility:hidden}</style><link rel="stylesheet" href="./readability-final.css?v=2"></head>');
  else if(!html.includes('readability-final.css'))html=html.replace('</head>','<link rel="stylesheet" href="./readability-final.css?v=2"></head>');
  if(!html.includes('yos-suite-v3.js'))html=html.replace('</body>','<script src="./yos-suite-v3.js?v=8"></script></body>');
  html=html.replace(/<script id="life-final-reveal">[\s\S]*?<\/script>/g,'');
  const reveal='<script id="life-final-reveal-v2">(()=>{const ready=()=>document.getElementById("lifePageHostV1")&&!document.querySelector("main.app .layout")&&document.getElementById("lifeBottomNavV1")&&document.querySelector("#lifePageHostV1 [data-page=\\"home\\"]");const show=()=>{const app=document.querySelector("main.app");if(app)app.style.setProperty("visibility","visible");document.getElementById("life-preinstall-guard")?.remove()};const t=setInterval(()=>{if(ready()){requestAnimationFrame(()=>requestAnimationFrame(()=>{show();clearInterval(t)}))}},16);setTimeout(()=>{if(ready())show()},3000)})();</script>';
  if(!html.includes('life-final-reveal-v2'))html=html.replace('</body>',reveal+'</body>');
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
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys
      .filter(key=>key.startsWith(LIFE_CACHE_PREFIX)&&key!==CACHE)
      .map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const isPage=url.origin===self.location.origin&&(url.pathname.endsWith('/life/')||url.pathname.endsWith('/life/index.html'));
  if(isPage){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      const transformed=await inject(response),copy=transformed.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return transformed;
    }).catch(()=>caches.match(event.request).then(async hit=>hit?inject(hit):caches.match('./index.html').then(inject))));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});
