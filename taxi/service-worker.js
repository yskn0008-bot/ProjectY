'use strict';
const CACHE_PREFIX='yos-taxi-projecty-';
const CACHE='yos-taxi-projecty-v112-large-readable-type';
const VERSION='112';
const STATIC=[
  './','./index.html','./calendar.html','./settings.html','./manifest.webmanifest','./swipe-nav.js',
  './reference-perfect-v111.css','./reference-perfect-v111.js','./large-type-v112.css','./report-sync-v43.js','./settings-v20.js'
];

const pageType=url=>url.pathname.endsWith('/taxi/')||url.pathname.endsWith('/taxi/index.html')?'index':url.pathname.endsWith('/taxi/calendar.html')?'calendar':url.pathname.endsWith('/taxi/settings.html')?'settings':'';

async function inject(response,type){
  let html=await response.text();
  const addCss=file=>{if(!html.includes(file))html=html.replace('</head>',`<link rel="stylesheet" href="./${file}?v=${VERSION}"></head>`)};
  const addJs=file=>{if(!html.includes(file))html=html.replace('</body>',`<script src="./${file}?v=${VERSION}"></script></body>`)};

  /* v111 clean rebuild, followed by the v112 readability layer. */
  addCss('reference-perfect-v111.css');
  addCss('large-type-v112.css');
  if(type==='calendar')addJs('report-sync-v43.js');
  if(type==='settings')addJs('settings-v20.js');
  addJs('reference-perfect-v111.js');

  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function cachedAsset(request){
  const cache=await caches.open(CACHE);
  return cache.match(request,{ignoreSearch:true});
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(STATIC);
  for(const path of ['./','./index.html','./calendar.html','./settings.html']){
    const response=await fetch(path,{cache:'reload'});
    const type=path.includes('calendar')?'calendar':path.includes('settings')?'settings':'index';
    await cache.put(path,await inject(response,type));
  }
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const sameOrigin=url.origin===self.location.origin;
  const type=sameOrigin?pageType(url):'';

  if(type){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      const transformed=await inject(response,type);
      const copy=transformed.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return transformed;
    }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match(type==='calendar'?'./calendar.html':type==='settings'?'./settings.html':'./index.html'))));
    return;
  }

  if(!sameOrigin){event.respondWith(fetch(event.request));return}

  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{
    if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
    return response;
  }).catch(async()=>await cachedAsset(event.request)||Response.error()));
});
