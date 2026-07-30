'use strict';
(()=>{
  if(window.__yosTaxiBottomNavV101)return;
  window.__yosTaxiBottomNavV101=true;

  /* v101 owns navigation, icons and swipe order. */
  window.__yosPageMotionV49=true;
  window.__yosPageMotionV48=true;
  window.__yosPageSwipeV47=true;
  window.__yosTaxiNavIconsV62=true;

  const ENTRY='yos-taxi-page-entry-v101';
  const SWIPE_ORDER=['drive','today','calendar','manage'];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let entryApplied=false;
  let syncQueued=false;

  const ICONS={
    drive:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14l-1.2-6.2A2.3 2.3 0 0 0 15.5 9h-7a2.3 2.3 0 0 0-2.3 1.8L5 17Z"/><path d="M7 9l1.2-3h7.6L17 9M4 13h16M7 17v2M17 17v2"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/></svg>',
    today:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 9h16"/><path d="M10 12h4v4h-4z"/></svg>',
    nav:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 9h18M7 13h3M14 13h3M7 17h3M14 17h3"/></svg>',
    manage:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5h6v2M4 12h16M10 12v2h4v-2"/></svg>'
  };

  const ITEMS=[
    ['drive','営業'],
    ['today','今日'],
    ['nav','ナビ'],
    ['calendar','カレンダー'],
    ['manage','管理']
  ];

  const isCalendarPath=()=>location.pathname.endsWith('/taxi/calendar.html');

  function calendarPage(){
    const bodyPage=document.body?.dataset?.calendarPage;
    if(['week','month'].includes(bodyPage))return bodyPage;
    const query=new URLSearchParams(location.search).get('page');
    if(['week','month'].includes(query))return query;
    const stored=localStorage.getItem('yos-taxi-calendar-page-v21');
    return ['week','month'].includes(stored)?stored:'month';
  }

  function currentKey(){
    const path=location.pathname;
    if(path.endsWith('/taxi/')||path.endsWith('/taxi/index.html'))return'drive';
    if(path.endsWith('/taxi/settings.html'))return'manage';
    if(isCalendarPath()){
      const page=document.body?.dataset?.calendarPage||new URLSearchParams(location.search).get('page')||localStorage.getItem('yos-taxi-calendar-page-v21')||'today';
      if(page==='today')return'today';
      if(page==='manage')return'manage';
      return'calendar';
    }
    return'drive';
  }

  function pageUrl(key){
    if(key==='drive')return'./index.html';
    if(key==='today')return'./calendar.html?page=today';
    if(key==='calendar')return`./calendar.html?page=${calendarPage()}`;
    if(key==='manage')return'./calendar.html?page=manage';
    return'../nav/';
  }

  function activateCalendar(page){
    if(!isCalendarPath())return false;
    const button=document.querySelector(`#calendarPagesV21 button[data-page="${page}"]`);
    if(!button)return false;
    button.click();
    const url=new URL(location.href);
    url.searchParams.set('page',page);
    history.replaceState({},'',url);
    queueSync();
    return true;
  }

  function go(key,direction='next'){
    if(key==='nav'){
      location.href='../nav/';
      return;
    }

    const page=key==='calendar'?calendarPage():key;
    if(activateCalendar(page))return;

    const host=document.querySelector('main.app');
    sessionStorage.setItem(ENTRY,direction==='next'?'fromRight':'fromLeft');
    if(reduced||!host){location.href=pageUrl(key);return}
    const offset=direction==='next'?-42:42;
    host.style.transition='transform 170ms cubic-bezier(.22,1,.36,1),opacity 150ms ease';
    host.style.transform=`translate3d(${offset}px,0,0) scale(.994)`;
    host.style.opacity='.9';
    setTimeout(()=>{location.href=pageUrl(key)},120);
  }

  function applyEntry(){
    if(entryApplied)return;
    const host=document.querySelector('main.app');
    const entry=sessionStorage.getItem(ENTRY);
    if(!host||!entry)return;
    entryApplied=true;
    sessionStorage.removeItem(ENTRY);
    if(reduced)return;
    const start=entry==='fromRight'?28:-28;
    host.style.transition='none';
    host.style.transform=`translate3d(${start}px,0,0) scale(.995)`;
    host.style.opacity='.9';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      host.style.transition='transform 290ms cubic-bezier(.22,1,.36,1),opacity 230ms ease';
      host.style.transform='translate3d(0,0,0) scale(1)';
      host.style.opacity='1';
      setTimeout(()=>{host.style.transition=''},320);
    }));
  }

  function markup(){
    return ITEMS.map(([key,label])=>`<button type="button" data-page="${key}" aria-label="${label}"><span class="taxi-nav-icon-v101">${ICONS[key]}</span><b>${label}</b></button>`).join('');
  }

  function installNav(){
    let nav=document.getElementById('taxiGlobalNavV24');
    if(!nav){
      nav=document.createElement('nav');
      nav.id='taxiGlobalNavV24';
      nav.className='taxi-global-nav-v24';
      document.body.appendChild(nav);
    }
    if(nav.dataset.navVersion!=='101'){
      nav.dataset.navVersion='101';
      nav.setAttribute('aria-label','YOS Taxi メニュー');
      nav.innerHTML=markup();
      nav.querySelectorAll('button[data-page]').forEach(button=>{
        button.onclick=()=>{
          const from=SWIPE_ORDER.indexOf(currentKey());
          const to=SWIPE_ORDER.indexOf(button.dataset.page);
          go(button.dataset.page,to>=from?'next':'prev');
        };
      });
    }
    return nav;
  }

  function simplifyCalendarTabs(){
    const tabs=document.getElementById('calendarPagesV21');
    if(!tabs)return;
    if(tabs.dataset.navVersion!=='101')tabs.dataset.navVersion='101';
    const week=tabs.querySelector('[data-page="week"]');
    const month=tabs.querySelector('[data-page="month"]');
    if(week&&week.textContent!=='週間')week.textContent='週間';
    if(month&&month.textContent!=='月間')month.textContent='月間';
    week?.setAttribute('aria-label','週間カレンダー');
    month?.setAttribute('aria-label','月間カレンダー');
  }

  function simplifyDisplaySettings(){
    const box=document.getElementById('taxiPageOrderV24');
    const block=box?.closest('.taxi-setting-block-v24');
    if(!block||block.dataset.navVersion==='101')return;
    block.dataset.navVersion='101';
    block.innerHTML='<div class="taxi-setting-label-v24">下部メニュー</div><div class="taxi-nav-fixed-note-v101">営業・今日・ナビ・カレンダー・管理の5項目で固定しています。YOSナビは中央から1タップで開きます。</div>';
  }

  function sync(){
    syncQueued=false;
    const nav=installNav();
    const current=currentKey();
    nav.querySelectorAll('button[data-page]').forEach(button=>{
      const active=button.dataset.page===current;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    document.documentElement.dataset.taxiNavPage=current;
    simplifyCalendarTabs();
    simplifyDisplaySettings();
    installSwipe();
    applyEntry();
  }

  function queueSync(){
    if(syncQueued)return;
    syncQueued=true;
    requestAnimationFrame(sync);
  }

  function installSwipe(){
    const host=document.querySelector('main.app');
    if(!host||host.dataset.bottomNavSwipeV101==='1')return;
    host.dataset.bottomNavSwipeV101='1';
    let tracking=false,horizontal=false,startX=0,startY=0,dx=0,dy=0,lastX=0,lastAt=0,velocity=0,target=null,raf=0;
    const blocked=node=>node.closest('input,textarea,select,button,a,dialog,[contenteditable="true"],#taxiGlobalNavV24,[data-no-page-swipe]');

    const paint=()=>{
      raf=0;
      const index=SWIPE_ORDER.indexOf(currentKey());
      const next=dx<0?index+1:index-1;
      target=next>=0&&next<SWIPE_ORDER.length?SWIPE_ORDER[next]:null;
      const limit=target?26:12;
      const travel=Math.sign(dx||1)*Math.min(limit,Math.abs(dx)*.15);
      host.style.transition='none';
      host.style.transform=`translate3d(${travel}px,0,0) scale(.996)`;
      host.style.opacity=String(1-Math.min(1,Math.abs(travel)/26)*.025);
    };

    host.addEventListener('touchstart',event=>{
      if(event.touches.length!==1||blocked(event.target)||document.querySelector('dialog[open]'))return;
      const touch=event.touches[0];
      tracking=true;horizontal=false;dx=dy=velocity=0;target=null;
      startX=lastX=touch.clientX;startY=touch.clientY;lastAt=performance.now();
    },{passive:true});

    host.addEventListener('touchmove',event=>{
      if(!tracking||event.touches.length!==1)return;
      const touch=event.touches[0];
      dx=touch.clientX-startX;dy=touch.clientY-startY;
      if(!horizontal){
        if(Math.hypot(dx,dy)<10)return;
        if(Math.abs(dx)<=Math.abs(dy)*1.3){tracking=false;return}
        horizontal=true;
      }
      event.preventDefault();
      const now=performance.now();
      velocity=(touch.clientX-lastX)/Math.max(1,now-lastAt);
      lastX=touch.clientX;lastAt=now;
      if(!raf)raf=requestAnimationFrame(paint);
    },{passive:false});

    const reset=()=>{
      host.style.transition='transform 270ms cubic-bezier(.22,1,.36,1),opacity 210ms ease';
      host.style.transform='translate3d(0,0,0) scale(1)';
      host.style.opacity='1';
      setTimeout(()=>{host.style.transition=''},300);
    };

    const finish=()=>{
      if(!tracking)return;
      tracking=false;
      if(raf){cancelAnimationFrame(raf);raf=0;paint()}
      if(!horizontal)return;
      const commit=target&&(Math.abs(dx)>Math.max(innerWidth,320)*.22||(Math.abs(velocity)>.5&&Math.abs(dx)>38));
      if(commit){go(target,dx<0?'next':'prev');return}
      reset();
    };

    host.addEventListener('touchend',finish,{passive:true});
    host.addEventListener('touchcancel',()=>{tracking=false;horizontal=false;reset()},{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queueSync,{once:true});
  else queueSync();

  const observer=new MutationObserver(queueSync);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',queueSync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueSync()});
  setInterval(queueSync,1500);
})();