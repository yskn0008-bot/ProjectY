'use strict';
(()=>{
  if(window.__yosTaxiUnifiedNavV106)return;
  window.__yosTaxiUnifiedNavV106=true;

  const root=document.documentElement;
  let resizeObserver=null;
  let queued=false;

  function nav(){return document.getElementById('taxiGlobalNavV24')}

  function measure(element){
    const height=Math.max(58,Math.ceil(element?.getBoundingClientRect().height||68));
    root.style.setProperty('--yos-unified-nav-height',`${height}px`,'important');
  }

  function normalize(){
    queued=false;
    root.dataset.taxiNavFixed='106';
    const element=nav();
    if(!element)return;

    /* A fixed element must live directly under body to avoid transformed ancestors. */
    if(element.parentElement!==document.body)document.body.appendChild(element);

    const important=(name,value)=>element.style.setProperty(name,value,'important');
    important('position','fixed');
    important('grid-row','auto');
    important('left','50%');
    important('right','auto');
    important('top','auto');
    important('bottom','max(6px, env(safe-area-inset-bottom))');
    important('transform','translateX(-50%)');
    important('width','min(calc(100% - 14px), 760px)');
    important('max-width','760px');
    important('min-height','0');
    important('margin','0');
    important('z-index','2147483000');

    measure(element);
    if(!resizeObserver){
      resizeObserver=new ResizeObserver(()=>measure(element));
      resizeObserver.observe(element);
    }
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>requestAnimationFrame(normalize));
  }

  root.dataset.taxiNavFixed='106';
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});
  else queue();

  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',queue);
  addEventListener('resize',queue,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(queue,220),{passive:true});
  window.visualViewport?.addEventListener('resize',queue,{passive:true});
  window.visualViewport?.addEventListener('scroll',queue,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});
  setInterval(queue,1200);
})();
