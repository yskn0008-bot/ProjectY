'use strict';
const CACHE_PREFIX='yos-navi-strategy-';
const CACHE='yos-navi-strategy-v74-offline-cache-diagnostics';
const STATIC=['./','./index.html','./shift-phase-v1.js','./location-status-v1.js','./connectivity-status-v1.js','./area-map-v1.js','./niche-demand-v1.js','./expected-value-model-v1.js','./expected-value-v1.js','./map-theme-v1.js','./okinawa-area-map-v1.js','./map-theme-sync-v1.js','./map-visual-v5.js','./map-approved-layout-v1.js','./map-premium-v6.js','./imada-efficiency-v47.js','./map-label-safety-v49.js','./location-map-sync-v50.js','./map-real-v7.js','./taxi-live-context-v1.js','./map-load-safety-v58.js','./map-tab-controls-v61.js','./map-loading-visibility-v63.js','./runtime-diagnostics-v64.js','./pwa-update-notice-v68.js'];
const REQUIRED_SCRIPTS=['./connectivity-status-v1.js','./niche-demand-v1.js','./expected-value-model-v1.js','./expected-value-v1.js','./map-theme-v1.js','./okinawa-area-map-v1.js','./map-theme-sync-v1.js','./map-visual-v5.js','./map-approved-layout-v1.js','./map-premium-v6.js','./imada-efficiency-v47.js','./map-label-safety-v49.js','./location-map-sync-v50.js','./map-real-v7.js','./taxi-live-context-v1.js','./map-load-safety-v58.js','./map-tab-controls-v61.js','./map-loading-visibility-v63.js','./runtime-diagnostics-v64.js','./pwa-update-notice-v68.js'];
const CRITICAL_ASSETS=['./index.html',...REQUIRED_SCRIPTS];
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
const getOfflineCacheStatus=async()=>{
  const cache=await caches.open(CACHE);
  const missing=[];
  for(const src of CRITICAL_ASSETS){
    if(!(await cache.match(src)))missing.push(src);
  }
  return {offlineReady:missing.length===0,missingCriticalAssets:missing};
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
self.addEventListener('message',event=>{
  if(event.data?.type!=='YOS_NAV_STATUS_REQUEST')return;
  const replyPort=event.ports?.[0];
  if(!replyPort)return;
  event.waitUntil(
    getOfflineCacheStatus()
      .then(status=>replyPort.postMessage({cache:CACHE,...status}))
      .catch(()=>replyPort.postMessage({cache:CACHE,offlineReady:false,missingCriticalAssets:['status-unavailable']}))
  );
});
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
