'use strict';
(()=>{
  if(window.__yosNavRuntimeDiagnosticsV64)return;
  window.__yosNavRuntimeDiagnosticsV64=true;

  const BUILD='v64';
  const isDiagnosticMode=new URL(location.href).searchParams.get('diagnostics')==='1';
  const snapshot=()=>{
    const locationEl=document.querySelector('.yos-location-status');
    const acquiredAt=Number(locationEl?.dataset.acquiredAt||0);
    const locationFresh=Boolean(acquiredAt&&Date.now()-acquiredAt<=5*60*1000);
    const checks={
      online:navigator.onLine,
      mapSection:Boolean(document.getElementById('yos-okinawa-area-map')),
      mapContainer:Boolean(document.getElementById('yos-real-map-v7')),
      leaflet:Boolean(window.L),
      tileReady:Boolean(document.querySelector('#yos-real-map-v7 .leaflet-tile-loaded')),
      tabCount:document.querySelectorAll('.yos-real-map-v7__tab').length,
      rankingButtons:document.querySelectorAll('.yos-real-map-v7__rank').length,
      recommendationCount:Array.isArray(window.__yosNavRecommendations)?window.__yosNavRecommendations.length:0,
      expectedValueModel:Boolean(window.__YOS_NAV_EXPECTED_VALUE_MODEL),
      locationFresh
    };
    const requiredReady=checks.mapSection&&checks.mapContainer&&checks.tabCount===3&&checks.expectedValueModel&&checks.recommendationCount>0;
    const mapReady=!checks.online||checks.tileReady;
    return Object.freeze({build:BUILD,checkedAt:new Date().toISOString(),ready:requiredReady&&mapReady,checks});
  };

  const publish=()=>{
    const report=snapshot();
    window.__YOS_NAV_DIAGNOSTICS=report;
    window.dispatchEvent(new CustomEvent('yos-nav-diagnostics',{detail:report}));
    return report;
  };

  const renderPanel=report=>{
    if(!isDiagnosticMode)return;
    let panel=document.getElementById('yos-nav-diagnostics-v64');
    if(!panel){
      panel=document.createElement('section');
      panel.id='yos-nav-diagnostics-v64';
      panel.setAttribute('aria-live','polite');
      panel.style.cssText='position:fixed;z-index:99999;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom) + 8px);max-height:44vh;overflow:auto;padding:12px;border:1px solid #31516b;border-radius:14px;background:rgba(3,10,16,.96);color:#eaf7ff;font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.45)';
      document.body.appendChild(panel);
    }
    const rows=Object.entries(report.checks).map(([key,value])=>`<div><b>${key}</b>: ${String(value)}</div>`).join('');
    panel.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px"><strong>YOSナビ 診断 ${report.build}</strong><span>${report.ready?'READY':'CHECK'}</span></div>${rows}`;
  };

  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      renderPanel(publish());
    });
  };

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-latitude','data-longitude','data-accuracy','data-acquired-at']});
  window.addEventListener('online',schedule);
  window.addEventListener('offline',schedule);
  window.addEventListener('pageshow',schedule);
  window.addEventListener('yos-nav-recommendation',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  schedule();
})();
