'use strict';
(()=>{
  if(!location.pathname.endsWith('/taxi/calendar.html'))return;
  const root=document.documentElement;
  root.classList.add('taxi-calendar-v28');
  const sync=()=>{
    const height=Math.max(320,Math.round(window.visualViewport?.height||window.innerHeight));
    root.style.setProperty('--taxi-visual-height',`${height}px`);
    if(window.scrollY)window.scrollTo(0,0);
  };
  sync();
  window.visualViewport?.addEventListener('resize',sync,{passive:true});
  window.visualViewport?.addEventListener('scroll',sync,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(sync,120),{passive:true});
  window.addEventListener('resize',sync,{passive:true});
})();
