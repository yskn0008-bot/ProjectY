'use strict';
(()=>{
  if(window.__yosTaxiBrowserCalendarFitV108)return;
  window.__yosTaxiBrowserCalendarFitV108=true;

  const root=document.documentElement;
  let queued=false;
  let resizeObserver=null;

  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const nav=()=>document.getElementById('taxiGlobalNavV24');
  const isMonth=()=>document.body?.dataset.calendarPage==='month'||document.body?.classList.contains('calendar-month-mode')||new URLSearchParams(location.search).get('page')==='month';

  function browserInset(){
    if(standalone())return 0;
    const vv=window.visualViewport;
    if(!vv)return 32;
    const measured=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));
    if(measured<8)return 32;
    return Math.min(48,Math.max(28,measured));
  }

  function fitMonth(element){
    if(!isMonth())return;
    const main=document.querySelector('main.app');
    const grid=document.querySelector('#monthView .month-grid');
    if(!main||!grid||!element)return;

    const gridTop=Math.round(grid.getBoundingClientRect().top);
    const navTop=Math.round(element.getBoundingClientRect().top);
    const height=Math.floor(navTop-gridTop-8);
    if(height<240)return;

    main.style.setProperty('--month-grid-v67-height',`${height}px`);
    grid.style.setProperty('height',`${height}px`,'important');
    grid.style.setProperty('min-height',`${height}px`,'important');
    grid.style.setProperty('max-height',`${height}px`,'important');
  }

  function apply(){
    queued=false;
    root.dataset.taxiNavFixed='108';
    const element=nav();
    if(!element)return;

    if(element.parentElement!==document.body)document.body.appendChild(element);

    const inset=browserInset();
    root.style.setProperty('--yos-browser-bottom',`${inset}px`,'important');
    root.classList.toggle('yos-standalone-mode',standalone());
    root.classList.toggle('yos-browser-mode',!standalone());

    const important=(name,value)=>element.style.setProperty(name,value,'important');
    important('position','fixed');
    important('left','50%');
    important('right','auto');
    important('top','auto');
    important('bottom','calc(var(--yos-browser-bottom, 0px) + env(safe-area-inset-bottom) + var(--yos-unified-nav-browser-gap, 6px))');
    important('transform','translateX(-50%)');
    important('width','min(calc(100% - 14px), 760px)');
    important('max-width','760px');
    important('min-height','0');
    important('margin','0');
    important('z-index','2147483000');

    element.querySelectorAll('button').forEach(button=>{
      button.style.setProperty('margin','0','important');
      button.style.setProperty('transform','none','important');
    });

    const height=Math.max(52,Math.ceil(element.getBoundingClientRect().height||56));
    root.style.setProperty('--yos-unified-nav-height',`${height}px`,'important');

    requestAnimationFrame(()=>requestAnimationFrame(()=>fitMonth(element)));

    if(!resizeObserver){
      resizeObserver=new ResizeObserver(queue);
      resizeObserver.observe(element);
    }
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>requestAnimationFrame(apply));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});
  else queue();

  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-calendar-page','style']});
  addEventListener('pageshow',queue);
  addEventListener('resize',queue,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(queue,220),{passive:true});
  window.visualViewport?.addEventListener('resize',queue,{passive:true});
  window.visualViewport?.addEventListener('scroll',queue,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});
  setInterval(queue,1200);
})();