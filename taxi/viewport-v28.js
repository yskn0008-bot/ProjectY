'use strict';
(()=>{
  if(!location.pathname.endsWith('/taxi/calendar.html'))return;
  const root=document.documentElement;
  root.classList.add('taxi-calendar-v28');

  const sync=()=>{
    const height=Math.max(320,Math.round(window.visualViewport?.height||window.innerHeight));
    root.style.setProperty('--taxi-visual-height',`${height}px`);
    if(window.scrollX||window.scrollY)window.scrollTo(0,0);
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
  };

  let startX=0,startY=0;
  document.addEventListener('touchstart',event=>{
    if(event.touches.length!==1)return;
    const touch=event.touches[0];
    startX=touch.clientX;
    startY=touch.clientY;
  },{passive:true});

  document.addEventListener('touchmove',event=>{
    if(event.touches.length!==1)return;
    if(event.target.closest('dialog[open],input,textarea,select'))return;
    const touch=event.touches[0];
    const dx=touch.clientX-startX;
    const dy=touch.clientY-startY;
    if(Math.abs(dy)>=Math.abs(dx))event.preventDefault();
  },{passive:false});

  const lockScroll=()=>{
    if(window.scrollX||window.scrollY)window.scrollTo(0,0);
  };

  sync();
  window.visualViewport?.addEventListener('resize',sync,{passive:true});
  window.visualViewport?.addEventListener('scroll',sync,{passive:true});
  window.addEventListener('scroll',lockScroll,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(sync,120),{passive:true});
  window.addEventListener('resize',sync,{passive:true});
})();
