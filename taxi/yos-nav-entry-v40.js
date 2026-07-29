'use strict';
(()=>{
  if(window.__yosTaxiNavEntryV97)return;
  window.__yosTaxiNavEntryV97=true;

  const NAV_URL='../nav/';

  function installDataLink(){
    if(document.querySelector('[data-yos-nav-entry="1"]'))return;
    const links=[...document.querySelectorAll('.links')];
    const target=links.find(group=>group.querySelector('a[href="./calendar.html"]'))||links[0];
    if(!target)return;

    const entry=document.createElement('a');
    entry.className='link';
    entry.href=NAV_URL;
    entry.dataset.yosNavEntry='1';
    entry.textContent='🗺️ YOSナビ';
    entry.setAttribute('aria-label','YOSナビを開く');
    target.insertBefore(entry,target.firstChild);
  }

  function installQuickEntry(){
    if(document.getElementById('quickYosNavV97'))return;
    const decision=document.querySelector('.quick-decision-v18');
    if(!decision)return;

    const entry=document.createElement('a');
    entry.id='quickYosNavV97';
    entry.className='quick-nav-v97';
    entry.href=NAV_URL;
    entry.textContent='🗺️ ナビ';
    entry.setAttribute('aria-label','YOSナビを開く');
    decision.appendChild(entry);
  }

  function install(){
    if(location.pathname.endsWith('/calendar.html')||location.pathname.endsWith('/settings.html'))return;
    installDataLink();
    installQuickEntry();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  const observer=new MutationObserver(install);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(install,200);
  setTimeout(install,700);
  setTimeout(()=>observer.disconnect(),10000);
})();