'use strict';
(()=>{
  if(window.__yosMonthFitV66)return;
  window.__yosMonthFitV66=true;

  let frame=0;
  const isMonth=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='month'||document.body?.dataset.calendarPage==='month'||document.body?.classList.contains('calendar-month-mode');
  };

  function fit(){
    frame=0;
    if(!isMonth())return;

    const main=document.querySelector('main.app');
    const view=document.getElementById('monthView');
    const nav=document.getElementById('taxiGlobalNavV24');
    const toolbar=main?.querySelector('.toolbar');
    if(!main||!view||!nav||!toolbar)return;

    const mainRect=main.getBoundingClientRect();
    const toolbarRect=toolbar.getBoundingClientRect();
    const navRect=nav.getBoundingClientRect();

    const top=Math.max(0,Math.round(toolbarRect.bottom-mainRect.top));
    const navTop=Math.round(navRect.top-mainRect.top);
    const height=Math.max(0,navTop-top);
    if(height<240)return;

    main.style.setProperty('position','relative','important');
    main.style.setProperty('overflow','hidden','important');
    main.style.setProperty('padding-bottom','0','important');

    view.style.setProperty('position','absolute','important');
    view.style.setProperty('top',`${top}px`,'important');
    view.style.setProperty('left','0','important');
    view.style.setProperty('right','0','important');
    view.style.setProperty('bottom','auto','important');
    view.style.setProperty('width','auto','important');
    view.style.setProperty('height',`${height}px`,'important');
    view.style.setProperty('min-height','0','important');
    view.style.setProperty('margin','0','important');
    view.style.setProperty('padding','0','important');
    view.style.setProperty('display','flex','important');
    view.style.setProperty('flex-direction','column','important');
    view.style.setProperty('gap','0','important');
    view.style.setProperty('overflow','hidden','important');

    const grid=view.querySelector('.month-grid');
    if(grid){
      grid.style.setProperty('flex','1 1 0','important');
      grid.style.setProperty('height','auto','important');
      grid.style.setProperty('min-height','0','important');
      grid.style.setProperty('margin','0','important');
      grid.style.setProperty('padding','0','important');
      grid.style.setProperty('gap','0','important');
      grid.style.setProperty('overflow','hidden','important');
    }
  }

  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(()=>requestAnimationFrame(fit));
  }

  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule);
  addEventListener('orientationchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);

  new MutationObserver(schedule).observe(document.documentElement,{
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['class','data-calendar-page']
  });

  schedule();
  setTimeout(schedule,250);
  setTimeout(schedule,800);
  setInterval(schedule,2000);
})();
