'use strict';
/* YOS Taxi v96 — always open sales settings at the top */
(()=>{
  const dialog=document.getElementById('settingsDialog');
  if(!dialog)return;
  const body=dialog.querySelector('.dialog-body');
  const reset=()=>requestAnimationFrame(()=>{
    dialog.scrollTop=0;
    if(body)body.scrollTop=0;
  });

  new MutationObserver(()=>{
    if(dialog.hasAttribute('open'))reset();
  }).observe(dialog,{attributes:true,attributeFilter:['open']});

  document.getElementById('settingsButton')?.addEventListener('click',()=>setTimeout(reset,0),true);
})();
