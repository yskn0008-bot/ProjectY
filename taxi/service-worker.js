'use strict';
const CACHE='yos-taxi-projecty-v34-stable';
const STATIC=['./index.html','./calendar.html','./settings.html','./manifest.webmanifest','./v9.css','./v9.js','./calendar-v2.js','./calendar-v3.js','./calendar-v21.js','./calendar-v23-fix.js','./calendar-v26.css','./calendar-v28.css','./calendar-v32.css','./viewport-v28.js','./settings-v20.js','./ui-v24.css','./ui-v24.js','./ui-v24-fix.js','./v15.js'];
const pageType=url=>url.pathname.endsWith('/taxi/')||url.pathname.endsWith('/taxi/index.html')?'index':url.pathname.endsWith('/taxi/calendar.html')?'calendar':url.pathname.endsWith('/taxi/settings.html')?'settings':'';
async function inject(response,type){
  let html=await response.text();
  if(!html.includes('ui-v24.css'))html=html.replace('</head>','<link rel="stylesheet" href="./ui-v24.css?v=34"></head>');
  if(type==='calendar'&&!html.includes('calendar-v26.css'))html=html.replace('</head>','<link rel="stylesheet" href="./calendar-v26.css?v=34"></head>');
  if(type==='calendar'&&!html.includes('calendar-v28.css'))html=html.replace('</head>','<link rel="stylesheet" href="./calendar-v28.css?v=34"></head>');
  if(type==='calendar'&&!html.includes('calendar-v32.css'))html=html.replace('</head>','<link rel="stylesheet" href="./calendar-v32.css?v=34"></head>');
  if(type==='index'){
    if(!html.includes('v9.css'))html=html.replace('</head>','<link rel="stylesheet" href="./v9.css?v=34"></head>');
    if(!html.includes('v9.js'))html=html.replace('</body>','<script src="./v9.js?v=34"></script></body>');
  }
  if(type==='calendar'){
    if(!html.includes('calendar-v2.js'))html=html.replace('</body>','<script src="./calendar-v2.js?v=34"></script></body>');
    if(!html.includes('calendar-v21.js'))html=html.replace('</body>','<script src="./calendar-v21.js?v=34"></script></body>');
    if(!html.includes('calendar-v23-fix.js'))html=html.replace('</body>','<script src="./calendar-v23-fix.js?v=34"></script></body>');
    if(!html.includes('viewport-v28.js'))html=html.replace('</body>','<script src="./viewport-v28.js?v=34"></script></body>');
  }
  if(type==='settings'&&!html.includes('settings-v20.js'))html=html.replace('</body>','<script src="./settings-v20.js?v=34"></script></body>');
  if(!html.includes('disable-all-swipe-v34'))html=html.replace('</body>','<script id="disable-all-swipe-v34">document.querySelector("main.app")?.setAttribute("data-taxi-swipe-installed","1");document.documentElement.dataset.swipeDisabled="1";</script></body>');
  if(!html.includes('ui-v24.js'))html=html.replace('</body>','<script src="./ui-v24.js?v=34"></script></body>');
  if(type==='settings'&&!html.includes('ui-v24-fix.js'))html=html.replace('</body>','<script src="./ui-v24-fix.js?v=34"></script></body>');
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
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
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const type=url.origin===self.location.origin?pageType(url):'';
  if(type){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(async response=>{
          const transformed=await inject(response,type);
          const copy=transformed.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
          return transformed;
        })
        .catch(()=>caches.match(event.request).then(hit=>hit||caches.match(type==='calendar'?'./calendar.html':type==='settings'?'./settings.html':'./index.html')))
    );
    return;
  }
  event.respondWith(
    fetch(event.request,{cache:'no-cache'})
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html')))
  );
});