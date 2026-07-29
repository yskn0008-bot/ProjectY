'use strict';
const CACHE='yos-taxi-projecty-v90-week-summary-readable';
const VERSION='90';
const STATIC=[
  './index.html','./calendar.html','./settings.html','./manifest.webmanifest',
  './v9.css','./v9.js','./drive-v44.css','./drive-v44.js','./drive-no-overlap-v69.css','./drive-no-overlap-v69.js',
  './calendar-v2.js','./calendar-v3.js','./calendar-v21.js','./calendar-v23-fix.js','./calendar-v26.css','./calendar-v28.css','./calendar-v32.css','./calendar-v38-urgent.css',
  './browser-bottom-v38.css','./browser-bottom-v38.js','./browser-bottom-v42.css','./report-sync-v43.js',
  './month-performance-v57.css','./month-performance-v57.js','./month-performance-v60.js','./month-layout-v59.css','./month-layout-v60.css','./month-nav-v61.css','./month-nav-v62.css',
  './month-grid-fit-v67.css','./month-grid-fit-v67.js','./month-row-fit-v80.css','./month-row-fit-v80.js',
  './week-money-fit-v68.css','./week-money-fit-v68.js','./week-nav-fit-v79.css','./week-nav-fit-v79.js','./week-date-sales-v82.css','./week-date-sales-v82.js','./week-value-only-v86.css','./week-summary-grid-v87.css','./week-summary-width-v88.css','./week-summary-readable-v90.css',
  './manage-stable-v77.css','./manage-stable-v77.js','./manage-nav-fit-v78.css','./manage-nav-fit-v78.js','./manage-card-grow-v81.css',
  './nav-icons-v62.js','./viewport-v28.js','./settings-v20.js','./ui-v24.css','./ui-v24.js','./ui-v24-fix.js',
  './page-motion-v49.css','./page-motion-v49.js','./week-fit-v50.css','./week-balance-v51.css','./week-readability-v52.css','./week-readability-v53.css','./week-readability-v54.css','./week-readability-v55.css','./week-space-v56.css',
  './se3-final-v37.css','./yos-suite-v38.js','./yos-nav-entry-v40.js','./v15.js'
];

const pageType=url=>url.pathname.endsWith('/taxi/')||url.pathname.endsWith('/taxi/index.html')?'index':url.pathname.endsWith('/taxi/calendar.html')?'calendar':url.pathname.endsWith('/taxi/settings.html')?'settings':'';

async function inject(response,type){
  let html=await response.text();
  const addCss=file=>{if(!html.includes(file))html=html.replace('</head>',`<link rel="stylesheet" href="./${file}?v=${VERSION}"></head>`) };
  const addJs=file=>{if(!html.includes(file))html=html.replace('</body>',`<script src="./${file}?v=${VERSION}"></script></body>`) };

  addCss('ui-v24.css');
  if(type==='calendar'){
    ['calendar-v26.css','calendar-v28.css','calendar-v32.css'].forEach(addCss);
  }
  addCss('se3-final-v37.css');
  if(type==='calendar')addCss('calendar-v38-urgent.css');
  addCss('browser-bottom-v38.css');
  addCss('browser-bottom-v42.css');

  if(type==='index'){
    addCss('v9.css');
    addCss('drive-v44.css');
    addJs('v9.js');
    addJs('yos-nav-entry-v40.js');
  }

  if(type==='calendar'){
    ['calendar-v2.js','calendar-v21.js','calendar-v23-fix.js','viewport-v28.js','report-sync-v43.js','month-performance-v57.js','month-performance-v60.js'].forEach(addJs);
  }
  if(type==='settings')addJs('settings-v20.js');

  if(!html.includes('page-motion-v49-marker'))html=html.replace('</body>','<script id="page-motion-v49-marker">document.querySelector("main.app")?.setAttribute("data-taxi-swipe-installed","1");</script></body>');
  addJs('ui-v24.js');
  if(type==='settings')addJs('ui-v24-fix.js');
  addJs('yos-suite-v38.js');
  addJs('browser-bottom-v38.js');
  if(type==='index')addJs('drive-v44.js');

  addCss('page-motion-v49.css');
  if(type==='calendar'){
    ['week-fit-v50.css','week-balance-v51.css','week-readability-v52.css','week-readability-v53.css','week-readability-v54.css','week-readability-v55.css','week-space-v56.css','month-performance-v57.css','month-layout-v59.css','month-layout-v60.css'].forEach(addCss);
  }
  addCss('month-nav-v61.css');
  addCss('month-nav-v62.css');
  if(type==='calendar'){
    ['month-grid-fit-v67.css','month-row-fit-v80.css','week-money-fit-v68.css','week-nav-fit-v79.css','week-date-sales-v82.css','week-value-only-v86.css','week-summary-grid-v87.css','week-summary-width-v88.css','week-summary-readable-v90.css','manage-stable-v77.css','manage-nav-fit-v78.css','manage-card-grow-v81.css'].forEach(addCss);
  }
  if(type==='index')addCss('drive-no-overlap-v69.css');

  addJs('page-motion-v49.js');
  addJs('nav-icons-v62.js');
  if(type==='calendar'){
    ['month-grid-fit-v67.js','month-row-fit-v80.js','week-money-fit-v68.js','week-nav-fit-v79.js','week-date-sales-v82.js','manage-stable-v77.js','manage-nav-fit-v78.js'].forEach(addJs);
  }
  if(type==='index')addJs('drive-no-overlap-v69.js');

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