'use strict';
const CACHE_PREFIX='yos-unified-';
const CACHE_NAME=CACHE_PREFIX+'v3-shared-state';
const STATIC=[
  './','./index.html','./manifest.webmanifest','./assets/yos-icon-180.png','./assets/yos-icon-512.png',
  './yos/','./yos/index.html','./yos/styles.css','./yos/readability-final.css',
  './yos/task-dashboard.css','./yos/task-dashboard.js','./yos/shared-state-v1.js','./yos/app.js',
  './yos/money-v2.css','./yos/money-master-v1.js','./yos/money-v2.js',
  './yos/money-reference-v1.css','./yos/money-reference-v1.js','./yos/money-polish-v2.css','./yos/money-readable-v3.css',
  './yos/assets/home-life-path-watercolor-v1.webp','./yos/assets/journey-valley-watercolor-v1.webp',
  './yos/taxi-live-v1.js','./yos/hj-entry.js','./yos/journey.html','./yos/journey.css','./yos/journey.js',
  './life/','./life/index.html','./life/home-v1.css','./life/home-priority-v1.css','./life/readability-final.css',
  './life/yos-suite-v3.js','./life/home-v1.js','./life/daily-flow-orchestrator-v1.js','./life/task-quick-add-v1.js',
  './yos/hj/','./yos/hj/index.html','./yos/hj/styles.css','./yos/hj/onboarding.css','./yos/hj/scenes.css','./yos/hj/completion.css',
  './yos/hj/archetypes.js','./yos/hj/bootstrap.js','./yos/hj/app.js','./yos/hj/profile.js','./yos/hj/yos-ai-client.js','./yos/hj/yos-auth.js',
  './yos/hj/scenes.js','./yos/hj/history.js','./yos/hj/editor.js','./yos/hj/story-image.js','./yos/hj/data-complete.js','./yos/hj/current-location.js',
  './system/','./system/index.html','./data/mission-control.json','./data/yos-assets.json','./data/yos-user-tasks.json'
];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);for(const path of STATIC){try{await cache.add(new Request(path,{cache:'reload'}));}catch(error){console.warn('YOS precache skipped',path,error);}}await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));await self.clients.claim();})());});
function fallbackPath(url){const path=url.pathname;if(path.endsWith('/yos/')||path.endsWith('/yos/index.html'))return './yos/index.html';if(path.endsWith('/life/')||path.endsWith('/life/index.html'))return './life/index.html';if(path.endsWith('/yos/hj/')||path.endsWith('/yos/hj/index.html'))return './yos/hj/index.html';if(path.endsWith('/system/')||path.endsWith('/system/index.html'))return './system/index.html';return './index.html';}
async function cacheResponse(request,response){if(response&&response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone());}return response;}
async function networkFirst(request){try{const response=await fetch(request,{cache:'no-store'});if(response&&response.ok)await cacheResponse(request,response);return response;}catch{return caches.match(request,{ignoreSearch:true});}}
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith((async()=>{const response=await networkFirst(event.request);if(response)return response;return caches.match(fallbackPath(url),{ignoreSearch:true});})());return;}event.respondWith((async()=>{const cached=await caches.match(event.request,{ignoreSearch:true});if(cached){fetch(event.request,{cache:'no-cache'}).then(response=>cacheResponse(event.request,response)).catch(()=>{});return cached;}const response=await networkFirst(event.request);return response||new Response('',{status:504,statusText:'Offline'});})());});
