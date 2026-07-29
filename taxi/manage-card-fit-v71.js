'use strict';
(()=>{
  if(window.__yosManageCardFitV71)return;
  window.__yosManageCardFitV71=true;

  let raf=0;

  const isManage=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='manage'||document.body?.dataset.calendarPage==='manage';
  };

  function fitValue(card){
    const value=card.querySelector('strong');
    const label=card.querySelector('span');
    if(!value||!label)return;

    value.style.removeProperty('font-size');
    value.style.setProperty('line-height','.94','important');
    value.style.setProperty('white-space','nowrap','important');
    value.style.setProperty('overflow','hidden','important');
    value.style.setProperty('text-overflow','clip','important');

    const cardStyle=getComputedStyle(card);
    const padY=(parseFloat(cardStyle.paddingTop)||0)+(parseFloat(cardStyle.paddingBottom)||0);
    const gap=parseFloat(cardStyle.rowGap)||0;
    const availableHeight=Math.max(18,card.clientHeight-padY-label.offsetHeight-gap);
    const base=parseFloat(getComputedStyle(value).fontSize)||28;
    const min=window.innerWidth<=375?15:17;
    let size=base;

    value.style.setProperty('font-size',`${size}px`,'important');
    while(size>min){
      const tooWide=value.scrollWidth>value.clientWidth+1;
      const tooTall=value.getBoundingClientRect().height>availableHeight+1;
      if(!tooWide&&!tooTall)break;
      size=Math.max(min,size-.5);
      value.style.setProperty('font-size',`${size}px`,'important');
    }

    value.dataset.manageFitV71=size<base?'1':'0';
    value.title=value.textContent.trim();
  }

  function sync(){
    raf=0;
    const views=['todayView','weekView','monthView'].map(id=>document.getElementById(id));
    const manage=document.getElementById('manageViewV21');

    if(!isManage()){
      views.forEach(view=>{
        if(!view)return;
        view.style.removeProperty('display');
        view.removeAttribute('aria-hidden');
      });
      return;
    }

    views.forEach(view=>{
      if(!view)return;
      view.style.setProperty('display','none','important');
      view.setAttribute('aria-hidden','true');
      view.classList.remove('v21-active','active');
    });

    if(!manage)return;
    manage.classList.add('v21-active');
    manage.style.setProperty('display','grid','important');
    manage.style.setProperty('width','100%','important');
    manage.style.setProperty('height','100%','important');
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
  setInterval(schedule,2000);
})();
