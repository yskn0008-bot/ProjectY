'use strict';
(()=>{
  const install=()=>{
    if(location.pathname.endsWith('/calendar.html')||location.pathname.endsWith('/settings.html'))return;
    if(document.querySelector('[data-yos-nav-entry="1"]'))return;
    const links=[...document.querySelectorAll('.links')];
    const target=links.find(group=>group.querySelector('a[href="./calendar.html"]'))||links[0];
    if(!target)return;
    const entry=document.createElement('a');
    entry.className='link';
    entry.href='../nav/';
    entry.dataset.yosNavEntry='1';
    entry.textContent='YOSナビ';
    entry.setAttribute('aria-label','YOSナビを開く');
    target.insertBefore(entry,target.firstChild);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
