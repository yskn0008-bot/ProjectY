'use strict';
(()=>{
  if(window.__yosMonthGridFitV67)return;
  window.__yosMonthGridFitV67=true;

  let raf=0;
  let lastHeight=-1;

  const isMonth=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='month'||document.body?.dataset.calendarPage==='month'||document.body?.classList.contains('calendar-month-mode');
  };

  function fit(){
    raf=0;
    if(!isMonth())return;

    const main=document.querySelector('main.app');
    const view=document.getElementById('monthView');
    const grid=view?.querySelector('.month-grid');
    const nav=document.getElementById('taxiGlobalNavV24');
    if(!main||!view||!grid||!nav)return;

    // Remove the old absolute-size instructions before measuring.
    for(const name of ['position','top','right','bottom','left','inset','width','height','min-height','max-height','margin','padding','display','flex-direction','gap','overflow']){
      view.style.removeProperty(name);
    }
    view.style.setProperty('position','static','important');
    view.style.setProperty('inset','auto','important');
    view.style.setProperty('display','flex','important');
    view.style.setProperty('flex-direction','column','important');
    view.style.setProperty('height','auto','important');
    view.style.setProperty('min-height','0','important');
    view.style.setProperty('margin','0','important');
    view.style.setProperty('padding','0','important');
    view.style.setProperty('gap','0','important');
    view.style.setProperty('overflow','visible','important');

    grid.style.removeProperty('height');
    grid.style.removeProperty('min-height');
    grid.style.removeProperty('max-height');
    grid.style.setProperty('flex','0 0 auto','important');

    const gridTop=Math.round(grid.getBoundingClientRect().top);
    const navTop=Math.round(nav.getBoundingClientRect().top);
    const height=Math.floor(navTop-gridTop-1);
    if(height<240)return;

    if(height!==lastHeight){
      lastHeight=height;
      main.style.setProperty('--month-grid-v67-height',`${height}px`);
      grid.style.setProperty('height',`${height}px`,'important');
      grid.style.setProperty('min-height',`${height}px`,'important');
      grid.style.setProperty('max-height',`${height}px`,'important');
    }
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
  window.visualViewport?.addEventListener('scroll',schedule);

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-calendar-page']});

  const wait=setInterval(()=>{
    schedule();
    if(document.getElementById('calendar')&&document.getElementById('taxiGlobalNavV24'))clearInterval(wait);
  },100);
  setTimeout(()=>clearInterval(wait),5000);

  schedule();
  setTimeout(schedule,250);
  setTimeout(schedule,800);
})();
