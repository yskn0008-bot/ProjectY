'use strict';
const CACHE='yos-taxi-projecty-v77-manage-stable';
const STATIC=['./index.html','./calendar.html','./settings.html','./manifest.webmanifest','./v9.css','./v9.js','./drive-v44.css','./drive-v44.js','./drive-no-overlap-v69.css','./drive-no-overlap-v69.js','./calendar-v2.js','./calendar-v3.js','./calendar-v21.js','./calendar-v23-fix.js','./calendar-v26.css','./calendar-v28.css','./calendar-v32.css','./calendar-v38-urgent.css','./browser-bottom-v38.css','./browser-bottom-v38.js','./browser-bottom-v42.css','./report-sync-v43.js','./month-performance-v57.css','./month-performance-v57.js','./month-performance-v60.js','./month-layout-v59.css','./month-layout-v60.css','./month-nav-v61.css','./month-nav-v62.css','./month-grid-fit-v67.css','./month-grid-fit-v67.js','./week-money-fit-v68.css','./week-money-fit-v68.js','./manage-stable-v77.css','./manage-stable-v77.js','./nav-icons-v62.js','./viewport-v28.js','./settings-v20.js','./ui-v24.css','./ui-v24.js','./ui-v24-fix.js','./page-motion-v49.css','./page-motion-v49.js','./week-fit-v50.css','./week-balance-v51.css','./week-readability-v52.css','./week-readability-v53.css','./week-readability-v54.css','./week-readability-v55.css','./week-space-v56.css','./se3-final-v37.css','./yos-suite-v38.js','./yos-nav-entry-v40.js','./v15.js'];
const pageType=url=>url.pathname.endsWith('/taxi/')||url.pathname.endsWith('/taxi/index.html')?'index':url.pathname.endsWith('/taxi/calendar.html')?'calendar':url.pathname.endsWith('/taxi/settings.html')?'settings':'';
async function inject(response,type){
  let html=await response.text();
  if(!html.includes('ui-v24.css'))html=html.replace('</head>','<link rel="stylesheet" href="./ui-v24.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('calendar-v26.css'))html=html.replace('</head>','<link rel="stylesheet" href="./calendar-v26.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('calendar-v28.css'))html=html.replace('</head>','<link rel="stylesheet" href="./calendar-v28.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('calendar-v32.css'))html=html.replace('</head>','<link rel="stylesheet" href="./calendar-v32.css?v=77"></head>');
  if(!html.includes('se3-final-v37.css'))html=html.replace('</head>','<link rel="stylesheet" href="./se3-final-v37.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('calendar-v38-urgent.css'))html=html.replace('</head>','<link rel="stylesheet" href="./calendar-v38-urgent.css?v=77"></head>');
  if(!html.includes('browser-bottom-v38.css'))html=html.replace('</head>','<link rel="stylesheet" href="./browser-bottom-v38.css?v=77"></head>');
  if(!html.includes('browser-bottom-v42.css'))html=html.replace('</head>','<link rel="stylesheet" href="./browser-bottom-v42.css?v=77"></head>');
  if(type==='index'){
    if(!html.includes('v9.css'))html=html.replace('</head>','<link rel="stylesheet" href="./v9.css?v=77"></head>');
    if(!html.includes('drive-v44.css'))html=html.replace('</head>','<link rel="stylesheet" href="./drive-v44.css?v=77"></head>');
    if(!html.includes('v9.js'))html=html.replace('</body>','<script src="./v9.js?v=77"></script></body>');
    if(!html.includes('yos-nav-entry-v40.js'))html=html.replace('</body>','<script src="./yos-nav-entry-v40.js?v=77"></script></body>');
  }
  if(type==='calendar'){
    if(!html.includes('calendar-v2.js'))html=html.replace('</body>','<script src="./calendar-v2.js?v=77"></script></body>');
    if(!html.includes('calendar-v21.js'))html=html.replace('</body>','<script src="./calendar-v21.js?v=77"></script></body>');
    if(!html.includes('calendar-v23-fix.js'))html=html.replace('</body>','<script src="./calendar-v23-fix.js?v=77"></script></body>');
    if(!html.includes('viewport-v28.js'))html=html.replace('</body>','<script src="./viewport-v28.js?v=77"></script></body>');
    if(!html.includes('report-sync-v43.js'))html=html.replace('</body>','<script src="./report-sync-v43.js?v=77"></script></body>');
    if(!html.includes('month-performance-v57.js'))html=html.replace('</body>','<script src="./month-performance-v57.js?v=77"></script></body>');
    if(!html.includes('month-performance-v60.js'))html=html.replace('</body>','<script src="./month-performance-v60.js?v=77"></script></body>');
  }
  if(type==='settings'&&!html.includes('settings-v20.js'))html=html.replace('</body>','<script src="./settings-v20.js?v=77"></script></body>');
  if(!html.includes('page-motion-v49-marker'))html=html.replace('</body>','<script id="page-motion-v49-marker">document.querySelector("main.app")?.setAttribute("data-taxi-swipe-installed","1");</script></body>');
  if(!html.includes('ui-v24.js'))html=html.replace('</body>','<script src="./ui-v24.js?v=77"></script></body>');
  if(type==='settings'&&!html.includes('ui-v24-fix.js'))html=html.replace('</body>','<script src="./ui-v24-fix.js?v=77"></script></body>');
  if(!html.includes('yos-suite-v38.js'))html=html.replace('</body>','<script src="./yos-suite-v38.js?v=77"></script></body>');
  if(!html.includes('browser-bottom-v38.js'))html=html.replace('</body>','<script src="./browser-bottom-v38.js?v=77"></script></body>');
  if(type==='index'&&!html.includes('drive-v44.js'))html=html.replace('</body>','<script src="./drive-v44.js?v=77"></script></body>');
  if(!html.includes('page-motion-v49.css'))html=html.replace('</head>','<link rel="stylesheet" href="./page-motion-v49.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('week-fit-v50.css'))html=html.replace('</head>','<link rel="stylesheet" href="./week-fit-v50.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('week-balance-v51.css'))html=html.replace('</head>','<link rel="stylesheet" href="./week-balance-v51.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('week-readability-v52.css'))html=html.replace('</head>','<link rel="stylesheet" href="./week-readability-v52.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('week-readability-v53.css'))html=html.replace('</head>','<link rel="stylesheet" href="./week-readability-v53.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('week-readability-v54.css'))html=html.replace('</head>','<link rel="stylesheet" href="./week-readability-v54.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('week-readability-v55.css'))html=html.replace('</head>','<link rel="stylesheet" href="./week-readability-v55.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('week-space-v56.css'))html=html.replace('</head>','<link rel="stylesheet" href="./week-space-v56.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('month-performance-v57.css'))html=html.replace('</head>','<link rel="stylesheet" href="./month-performance-v57.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('month-layout-v59.css'))html=html.replace('</head>','<link rel="stylesheet" href="./month-layout-v59.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('month-layout-v60.css'))html=html.replace('</head>','<link rel="stylesheet" href="./month-layout-v60.css?v=77"></head>');
  if(!html.includes('month-nav-v61.css'))html=html.replace('</head>','<link rel="stylesheet" href="./month-nav-v61.css?v=77"></head>');
  if(!html.includes('month-nav-v62.css'))html=html.replace('</head>','<link rel="stylesheet" href="./month-nav-v62.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('month-grid-fit-v67.css'))html=html.replace('</head>','<link rel="stylesheet" href="./month-grid-fit-v67.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('week-money-fit-v68.css'))html=html.replace('</head>','<link rel="stylesheet" href="./week-money-fit-v68.css?v=77"></head>');
  if(type==='index'&&!html.includes('drive-no-overlap-v69.css'))html=html.replace('</head>','<link rel="stylesheet" href="./drive-no-overlap-v69.css?v=77"></head>');
  if(type==='calendar'&&!html.includes('manage-stable-v77.css'))html=html.replace('</head>','<link rel="stylesheet" href="./manage-stable-v77.css?v=77"></head>');
  if(!html.includes('page-motion-v49.js'))html=html.replace('</body>','<script src="./page-motion-v49.js?v=77"></script></body>');
  if(!html.includes('nav-icons-v62.js'))html=html.replace('</body>','<script src="./nav-icons-v62.js?v=77"></script></body>');
  if(type==='calendar'&&!html.includes('month-grid-fit-v67.js'))html=html.replace('</body>','<script src="./month-grid-fit-v67.js?v=77"></script></body>');
  if(type==='calendar'&&!html.includes('week-money-fit-v68.js'))html=html.replace('</body>','<script src="./week-money-fit-v68.js?v=77"></script></body>');
  if(type==='index'&&!html.includes('drive-no-overlap-v69.js'))html=html.replace('</body>','<script src="./drive-no-overlap-v69.js?v=77"></script></body>');
  if(type==='calendar'&&!html.includes('manage-stable-v77.js'))html=html.replace('</body>','<script src="./manage-stable-v77.js?v=77"></script></body>');
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
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const type=url.origin===self.location.origin?pageType(url):'';
  if(type){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      const transformed=await inject(response,type);
      const copy=transformed.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return transformed;
    }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match(type==='calendar'?'./calendar.html':type==='settings'?'./settings.html':'./index.html'))));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});