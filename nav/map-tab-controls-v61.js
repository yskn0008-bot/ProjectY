'use strict';
(()=>{
  if(window.__yosMapTabControlsV62)return;
  window.__yosMapTabControlsV62=true;

  const style=document.createElement('style');
  style.id='yos-map-tab-controls-v62-style';
  style.textContent=`
    .yos-real-map-v7__tab{cursor:pointer;touch-action:manipulation}
    .yos-real-map-v7__tab:focus-visible{outline:2px solid #7bd4ff;outline-offset:-3px}
    .yos-real-map-v7__tab[aria-selected='true']{color:#4cbcff;border-bottom-color:#2c9eff}
    .yos-real-map-v7__rank{cursor:pointer;touch-action:manipulation}
    .yos-real-map-v7__rank[aria-pressed='true']{border-color:#4cbcff;background:#0d2131;box-shadow:inset 0 0 0 1px rgba(76,188,255,.28)}
    .yos-real-map-v7__rank:focus-visible{outline:2px solid #7bd4ff;outline-offset:2px}
    .yos-map-v61-hidden{display:none!important}
    @media(max-width:390px){
      .yos-real-map-v7__tab{min-height:44px;font-size:12px}
      .yos-real-map-v7__rank{min-height:58px}
    }
  `;
  document.head.appendChild(style);

  let mountedFirstTab=null;
  const mount=()=>{
    const section=document.getElementById('yos-okinawa-area-map');
    if(!section)return false;
    const tabs=[...section.querySelectorAll('.yos-real-map-v7__tab')];
    const mapWrap=section.querySelector('.yos-real-map-v7__map-wrap');
    const summary=section.querySelector('.yos-real-map-v7__summary');
    const ranking=section.querySelector('.yos-real-map-v7__ranking');
    if(tabs.length<3||!mapWrap||!summary||!ranking)return false;
    if(mountedFirstTab===tabs[0])return true;
    mountedFirstTab=tabs[0];

    const activate=index=>{
      tabs.forEach((tab,tabIndex)=>{
        const active=tabIndex===index;
        tab.setAttribute('aria-selected',active?'true':'false');
        tab.setAttribute('tabindex',active?'0':'-1');
        tab.classList.toggle('is-active',active);
      });
      if(index===0){
        mapWrap.classList.remove('yos-map-v61-hidden');
        ranking.classList.add('yos-map-v61-hidden');
        summary.classList.remove('yos-map-v61-hidden');
        setTimeout(()=>window.dispatchEvent(new Event('resize')),60);
      }else if(index===1){
        mapWrap.classList.add('yos-map-v61-hidden');
        ranking.classList.remove('yos-map-v61-hidden');
        summary.classList.remove('yos-map-v61-hidden');
      }else{
        location.href=new URL('../taxi/calendar.html',location.href).href;
      }
    };

    tabs.forEach((tab,index)=>{
      tab.setAttribute('role','tab');
      tab.id=['yos-map-tab-map','yos-map-tab-ranking','yos-map-tab-history'][index];
      tab.setAttribute('aria-selected',index===0?'true':'false');
      tab.setAttribute('tabindex',index===0?'0':'-1');
      tab.classList.toggle('is-active',index===0);
      tab.addEventListener('click',()=>activate(index));
      tab.addEventListener('keydown',event=>{
        let nextIndex=null;
        if(event.key==='ArrowRight')nextIndex=(index+1)%tabs.length;
        if(event.key==='ArrowLeft')nextIndex=(index-1+tabs.length)%tabs.length;
        if(event.key==='Home')nextIndex=0;
        if(event.key==='End')nextIndex=tabs.length-1;
        if(nextIndex===null)return;
        event.preventDefault();
        tabs[nextIndex].focus();
        activate(nextIndex);
      });
    });

    mapWrap.setAttribute('role','tabpanel');
    mapWrap.setAttribute('aria-labelledby',tabs[0].id);
    ranking.setAttribute('role','tabpanel');
    ranking.setAttribute('aria-labelledby',tabs[1].id);
    ranking.classList.add('yos-map-v61-hidden');

    const syncRankState=button=>{
      section.querySelectorAll('.yos-real-map-v7__rank').forEach(item=>item.setAttribute('aria-pressed',item===button?'true':'false'));
    };
    const rankButtons=[...section.querySelectorAll('.yos-real-map-v7__rank')];
    rankButtons.forEach(button=>{
      button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>syncRankState(button),{once:false});
    });
    if(rankButtons[0])syncRankState(rankButtons[0]);
    return true;
  };

  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;mount()});
  };
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('yos-nav-recommendation',schedule);
  window.addEventListener('pageshow',schedule);
  schedule();
})();
