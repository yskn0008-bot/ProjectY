'use strict';
(()=>{
  if(window.__yosMapTabControlsV61)return;
  window.__yosMapTabControlsV61=true;

  const style=document.createElement('style');
  style.id='yos-map-tab-controls-v61-style';
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

  let mountedSection=null;
  const mount=()=>{
    const section=document.getElementById('yos-okinawa-area-map');
    if(!section||section===mountedSection&&!section.querySelector('.yos-real-map-v7__tabs'))return false;
    const tabs=[...section.querySelectorAll('.yos-real-map-v7__tab')];
    const mapWrap=section.querySelector('.yos-real-map-v7__map-wrap');
    const summary=section.querySelector('.yos-real-map-v7__summary');
    const ranking=section.querySelector('.yos-real-map-v7__ranking');
    if(tabs.length<3||!mapWrap||!summary||!ranking)return false;
    mountedSection=section;

    tabs.forEach((tab,index)=>{
      tab.setAttribute('role','tab');
      tab.setAttribute('aria-selected',index===0?'true':'false');
      tab.classList.toggle('is-active',index===0);
    });
    tabs[0].id='yos-map-tab-map';
    tabs[1].id='yos-map-tab-ranking';
    tabs[2].id='yos-map-tab-history';
    mapWrap.setAttribute('role','tabpanel');
    mapWrap.setAttribute('aria-labelledby',tabs[0].id);
    ranking.setAttribute('role','tabpanel');
    ranking.setAttribute('aria-labelledby',tabs[1].id);

    const activate=index=>{
      tabs.forEach((tab,tabIndex)=>{
        const active=tabIndex===index;
        tab.setAttribute('aria-selected',active?'true':'false');
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
        location.href='../taxi/calendar.html';
      }
    };

    tabs.forEach((tab,index)=>tab.addEventListener('click',()=>activate(index)));
    ranking.classList.add('yos-map-v61-hidden');

    const syncRankState=button=>{
      section.querySelectorAll('.yos-real-map-v7__rank').forEach(item=>item.setAttribute('aria-pressed',item===button?'true':'false'));
    };
    const rankButtons=[...section.querySelectorAll('.yos-real-map-v7__rank')];
    rankButtons.forEach(button=>{
      button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>syncRankState(button));
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
