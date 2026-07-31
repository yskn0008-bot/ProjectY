'use strict';
const CACHE_PREFIX='yos-navi-strategy-';
const CACHE='yos-navi-strategy-v55';
const STATIC=['./','./index.html','./shift-phase-v1.js','./location-status-v1.js','./connectivity-status-v1.js','./area-map-v1.js','./niche-demand-v1.js','./expected-value-model-v1.js','./expected-value-v1.js','./map-theme-v1.js','./okinawa-area-map-v1.js','./map-theme-sync-v1.js','./map-visual-v5.js','./map-approved-layout-v1.js','./map-premium-v6.js','./imada-efficiency-v47.js','./map-label-safety-v49.js','./location-map-sync-v50.js'];
const REQUIRED_SCRIPTS=['./connectivity-status-v1.js','./niche-demand-v1.js','./expected-value-model-v1.js','./expected-value-v1.js','./map-theme-v1.js','./okinawa-area-map-v1.js','./map-theme-sync-v1.js','./map-visual-v5.js','./map-approved-layout-v1.js','./map-premium-v6.js','./imada-efficiency-v47.js','./map-label-safety-v49.js','./location-map-sync-v50.js'];
const injectRequiredScripts=async response=>{
  if(!response)return response;
  let html=await response.text();
  REQUIRED_SCRIPTS.forEach(src=>{
    const filename=src.split('/').pop();
    if(!html.includes(filename))html=html.replace('</body>',`<script src="${src}"></script>\n</body>`);
  });
  return new Response(html,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});
};
const cacheOptionalAssets=async cache=>{
  const optional=STATIC.filter(src=>src!=='./index.html');
  await Promise.allSettled(optional.map(async src=>{
    const response=await fetch(src,{cache:'no-cache'});
    if(response.ok)await cache.put(src,response);
  }));
};
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(async cache=>{
    await cache.add('./index.html');
    await cacheOptionalAssets(cache);
  }).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const requestUrl=new URL(event.request.url);
  const isNavPage=event.request.mode==='navigate'&&(requestUrl.pathname.endsWith('/nav/')||requestUrl.pathname.endsWith('/nav/index.html'));
  if(isNavPage){
    event.respondWith(fetch(event.request,{cache:'no-cache'}).then(injectRequiredScripts).catch(()=>caches.match('./index.html').then(injectRequiredScripts)));
    return;
  }
  const networkRequest=fetch(event.request,{cache:'no-cache'});
  event.waitUntil(networkRequest.then(response=>{
    if(!response.ok||requestUrl.origin!==self.location.origin)return;
    return caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
  }).catch(()=>undefined));
  event.respondWith(networkRequest.catch(()=>caches.match(event.request).then(hit=>hit||Response.error())));
});