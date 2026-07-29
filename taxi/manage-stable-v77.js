'use strict';
(()=>{
  if(window.__yosManageStableV77)return;
  window.__yosManageStableV77=true;

  let raf=0;

  const isManage=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='manage'||document.body?.dataset.calendarPage==='manage';
  };

  function fitValue(card){
    const value=card.querySelector('strong');
    if(!value)return;

    value.style.removeProperty('font-size');
    const base=parseFloat(getComputedStyle(value).fontSize)||30;
    const min=window.innerWidth<=375?16:18;
    let size=base;
    value.style.setProperty('font-size',`${size}px`,'important');

    while(size>min&&value.scrollWidth>value.clientWidth+1){
      size=Math.max(min,size-.5);
      value.style.setProperty('font-size',`${size}px`,'important');
    }
    value.title=value.textContent.trim();
  }

  function sync(){
    raf=0;
    if(!isManage())return;

    const html=document.documentElement;
    const body=document.body;
    const main=document.querySelector('main.app');
    const manage=document.getElementById('manageViewV21');
    if(!main||!manage)return;

    body.dataset.calendarPage='manage';
    html.classList.add('taxi-page-manage-v49');

    ['--manage-app-v73-height','--manage-app-v74-height','--manage-top-v75'].forEach(name=>main.style.removeProperty(name));
    ['--manage-view-v73-height','--manage-view-v74-height','height','max-height','position','top','right','bottom','left','inset','transform'].forEach(name=>manage.style.removeProperty(name));

    ['todayView','weekView','monthView'].forEach(id=>{
      const view=document.getElementById(id);
      if(!view)return;
      view.classList.remove('active','v21-active');
      view.style.setProperty('display','none','important');
      view.setAttribute('aria-hidden','true');
    });

    const tabs=document.getElementById('calendarPagesV21');
    if(tabs)tabs.style.setProperty('display','none','important');

    manage.classList.add('v21-active');
    manage.style.setProperty('display','flex','important');
    manage.removeAttribute('aria-hidden');
    manage.querySelectorAll('.summary .card').forEach(fitValue);
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(sync));
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
  setTimeout(schedule,200);
  setTimeout(schedule,700);
})();