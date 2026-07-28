'use strict';
(()=>{
  if(window.__yosTaxiNavIconsV62)return;
  window.__yosTaxiNavIconsV62=true;

  const meta={
    drive:{icon:'🚖',label:'営業'},
    today:{icon:'1️⃣',label:'今日'},
    week:{icon:'7️⃣',label:'週間'},
    month:{icon:'🗓️',label:'月間'},
    manage:{icon:'⚙️',label:'管理'}
  };

  let applying=false;
  function apply(){
    if(applying)return;
    applying=true;
    try{
      const nav=document.getElementById('taxiGlobalNavV24');
      if(!nav)return;
      nav.querySelectorAll('button[data-page]').forEach(button=>{
        const page=button.dataset.page;
        const item=meta[page];
        if(!item)return;
        const icon=button.querySelector('span');
        const label=button.querySelector('b');
        if(icon&&icon.textContent!==item.icon)icon.textContent=item.icon;
        if(label&&label.textContent!==item.label)label.textContent=item.label;
        button.setAttribute('aria-label',item.label);
        button.title=item.label;
        if(button.classList.contains('active'))button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      });
    }finally{
      applying=false;
    }
  }

  const observer=new MutationObserver(apply);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',apply);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)apply()});
  apply();
  setInterval(apply,2000);
})();