'use strict';
(()=>{
  if(window.__yosWeekMoneyFitV68)return;
  window.__yosWeekMoneyFitV68=true;

  let raf=0;
  const isWeek=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='week'||document.body?.dataset.calendarPage==='week'||document.body?.classList.contains('calendar-week-mode');
  };

  function fitOne(node){
    node.style.removeProperty('font-size');
    node.style.removeProperty('letter-spacing');
    node.style.setProperty('white-space','nowrap','important');
    node.style.setProperty('overflow','hidden','important');
    node.style.setProperty('text-overflow','clip','important');

    const base=parseFloat(getComputedStyle(node).fontSize)||17;
    const min=window.innerWidth<=375?15.5:17;
    let size=base;
    node.style.setProperty('font-size',`${size}px`,'important');

    while(node.scrollWidth>node.clientWidth+1&&size>min){
      size=Math.max(min,size-.5);
      node.style.setProperty('font-size',`${size}px`,'important');
    }

    if(node.scrollWidth>node.clientWidth+1){
      node.style.setProperty('letter-spacing','-.075em','important');
    }

    node.dataset.weekMoneyFitV68=size<base?'1':'0';
    node.title=node.textContent.trim();
  }

  function fit(){
    raf=0;
    if(!isWeek())return;
    document.querySelectorAll('#weekView .week-metrics strong').forEach(fitOne);
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(fit));
  }

  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule);
  addEventListener('orientationchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  window.visualViewport?.addEventListener('resize',schedule);

  new MutationObserver(schedule).observe(document.documentElement,{
    childList:true,
    subtree:true,
    characterData:true,
    attributes:true,
    attributeFilter:['class','data-calendar-page']
  });

  schedule();
  setTimeout(schedule,250);
  setTimeout(schedule,800);
  setInterval(schedule,2000);
})();
