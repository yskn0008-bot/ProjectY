'use strict';
const CACHE_PREFIX='yos-taxi-projecty-';
const CACHE='yos-taxi-projecty-v145-ops-loop';
const VERSION='145';
const STATIC=[
  './','./index.html','./calendar.html','./settings.html','./manifest.webmanifest','./swipe-nav.js',
  './final-app-v131.css','./final-fix-v133.css','./final-app-v131.js',
  './report-sync-v43.js','./settings-v20.js','./projecty-live-sync-v1.js',
  './theme-v134.css','./theme-v134.js','./manage-layout-v136.css',
  './drive-minimal-v138.css','./drive-minimal-v138.js',
  './bulk-ux-v139.css','./bulk-ux-v139.js',
  './quick-controls-v141.css','./quick-controls-v141.js',
  './sync-diagnostics-v142.css','./sync-diagnostics-v142.js',
  './demand-calendar.html','./demand-calendar-v1.json','./demand-home-v144.css','./demand-home-v144.js',
  './decision-loop-v1.js','./ops-loop-v144.js','./ops-loop-ui-v144.js','./ops-loop-v144.css'
];
const INDEX_PATHS=new Set(['./','./index.html']);
function cachedAsset(path){ return `${path}?v=${VERSION}`; }
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  const path=`.${url.pathname.replace(self.registration.scope.replace(url.origin,''),'')}`.replace('./','./');
  event.respondWith((async()=>{
    if(INDEX_PATHS.has(path)){
      try{
        const response=await fetch(request);
        const html=await response.text();
        let injected=html;
        const addCss=file=>{ const tag=`<link rel="stylesheet" href="./${file}?v=${VERSION}">`; if(!injected.includes(file)) injected=injected.replace('</head>',`${tag}</head>`); };
        const addJs=file=>{ const tag=`<script src="./${file}?v=${VERSION}"></script>`; if(!injected.includes(file)) injected=injected.replace('</body>',`${tag}</body>`); };
        addCss('demand-home-v144.css');
        addJs('demand-home-v144.js');
        addJs('decision-loop-v1.js');
        addJs('ops-loop-v144.js');
        addJs('ops-loop-ui-v144.js');
        addCss('ops-loop-v144.css');
        addJs('projecty-live-sync-v1.js');
        addCss('drive-minimal-v138.css');
        addJs('drive-minimal-v138.js');
        addCss('quick-controls-v141.css');
        addJs('quick-controls-v141.js');
        addCss('sync-diagnostics-v142.css');
        addJs('sync-diagnostics-v142.js');
        return new Response(injected,{status:response.status,statusText:response.statusText,headers:response.headers});
      }catch(_error){
        const cached=await caches.match(request)||await caches.match('./index.html');
        if(cached) return cached;
        throw _error;
      }
    }
    const cached=await caches.match(request);
    if(cached) return cached;
    try{
      const response=await fetch(request);
      if(response.ok){ const cache=await caches.open(CACHE); cache.put(request,response.clone()); }
      return response;
    }catch(_error){
      return caches.match('./index.html');
    }
  })());
});
