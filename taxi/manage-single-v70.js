'use strict';
(()=>{
  if(window.__yosManageSingleV70)return;
  window.__yosManageSingleV70=true;

  let raf=0;

  const isManage=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='manage'||document.body?.dataset.calendarPage==='manage';
  };

  function fitValue(node){
    if(!node)return;
    node.style.removeProperty('font-size');
    const base=parseFloat(getComputedStyle(node).fontSize)||24;
    const min=window.innerWidth<=375?16:18;
    let size=base;
    node.style.setProperty('font-size',`${size}px`,'important');
    while(node.scrollWidth>node.clientWidth+1&&size>min){
      size=Math.max(min,size-.5);
      node.style.setProperty('font-size',`${size}px`,'important');
    }
    node.title=node.textContent.trim();
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

    if(manage){
      manage.classList.add('v21-active');
      manage.style.setProperty('display','grid','important');
      manage.style.setProperty('width','100%','important');
      manage.style.setProperty('height','100%','important');
      manage.removeAttribute('aria-hidden');
      manage.querySelectorAll('.summary .card strong').forEach(fitValue);
    }
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
