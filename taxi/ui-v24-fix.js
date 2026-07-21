'use strict';
(()=>{
  if(window.__yosTaxiUiV24FixLoaded)return;
  window.__yosTaxiUiV24FixLoaded=true;
  const wait=setInterval(()=>{
    const tabs=document.getElementById('settingsTabsV20');
    const panel=document.getElementById('taxiDisplayPanelV24');
    if(!tabs||!panel)return;
    clearInterval(wait);
    tabs.querySelectorAll('button:not([data-tab="display"])').forEach(button=>button.addEventListener('click',()=>panel.classList.remove('settings-active-v20')));
  },60);
  setTimeout(()=>clearInterval(wait),6000);
})();
