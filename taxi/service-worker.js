'use strict';
const CACHE_PREFIX='yos-taxi-projecty-';
const CACHE='yos-taxi-projecty-v148-shift-start-gate';
const VERSION='148';
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

const pageType=url=>url.pathname.endsWith('/taxi/')||url.pathname.endsWith('/taxi/index.html')?'index':url.pathname.endsWith('/taxi/calendar.html')?'calendar':url.pathname.endsWith('/taxi/settings.html')?'settings':'';

async function inject(response,type){
  let html=await response.text();
  const addCss=file=>{if(!html.includes(file))html=html.replace('</head>',`<link rel="stylesheet" href="./${file}?v=${VERSION}"></head>`)};
  const addJs=file=>{if(!html.includes(file))html=html.replace('</body>',`<script src="./${file}?v=${VERSION}"></script></body>`)};
  addCss('theme-v134.css');
  addCss('manage-layout-v136.css');
  addCss('bulk-ux-v139.css');
  if(type==='calendar')addJs('report-sync-v43.js');
  if(type==='settings')addJs('settings-v20.js');
  else{addCss('final-app-v131.css');addCss('final-fix-v133.css');addJs('final-app-v131.js')}
  if(type==='index'){
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
  }
  addJs('theme-v134.js');
  addJs('bulk-ux-v139.js');
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function cachedAsset(request){const cache=await caches.open(CACHE);return cache.match(request,{ignoreSearch:true})}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);await cache.addAll(STATIC);
  for(const path of ['./','./index.html','./calendar.html','./settings.html']){
    const response=await fetch(path,{cache:'reload'});
    const type=path.includes('calendar')?'calendar':path.includes('settings')?'settings':'index';
    await cache.put(path,await inject(response,type));
  }
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),sameOrigin=url.origin===self.location.origin,type=sameOrigin?pageType(url):'';
  if(type){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{const transformed=await inject(response,type);const copy=transformed.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return transformed}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match(type==='calendar'?'./calendar.html':type==='settings'?'./settings.html':'./index.html'))));
    return;
  }
  if(!sameOrigin){event.respondWith(fetch(event.request));return}
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(async()=>await cachedAsset(event.request)||Response.error()));
});
