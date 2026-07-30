'use strict';
(()=>{
  if(window.__yosTaxiReferenceDesignV104)return;
  window.__yosTaxiReferenceDesignV104=true;

  let queued=false;
  const isCalendar=()=>location.pathname.endsWith('/taxi/calendar.html');
  const isSettings=()=>location.pathname.endsWith('/taxi/settings.html');
  const isDrive=()=>location.pathname.endsWith('/taxi/')||location.pathname.endsWith('/taxi/index.html');

  function calendarPage(){
    const value=document.body?.dataset?.calendarPage||new URLSearchParams(location.search).get('page')||localStorage.getItem('yos-taxi-calendar-page-v21')||'today';
    return ['today','week','month','manage'].includes(value)?value:'today';
  }

  function title(){
    if(isDrive())return'営業';
    if(isSettings())return'営業設定';
    if(isCalendar())return({today:'今日の予定',week:'週間カレンダー',month:'月間カレンダー',manage:'月次管理'}[calendarPage()]||'営業カレンダー');
    return'YOS Taxi';
  }

  function labelDrive(){
    const statusLabel=document.querySelector('#quickDashV18 .quick-head-v18>div:first-child>span');
    const salesLabel=document.querySelector('#quickDashV18 .quick-sales-v18 small');
    if(statusLabel)statusLabel.textContent='現在の状況';
    if(salesLabel)salesLabel.textContent='本日の売上';

    const calendar=document.querySelector('#quickDashV18 .quick-tools-v18 a[href*="calendar"]');
    if(calendar)calendar.textContent='カレンダー';
    const detail=document.getElementById('quickDetailV18');
    if(detail)detail.textContent='詳細';
    const yos=document.getElementById('quickYosV18');
    if(yos)yos.textContent='YOS';
  }

  function labelCalendar(){
    if(!isCalendar())return;
    document.querySelector('#calendarPagesV21 [data-page="today"]')?.replaceChildren(document.createTextNode('今日'));
    document.querySelector('#calendarPagesV21 [data-page="week"]')?.replaceChildren(document.createTextNode('週間'));
    document.querySelector('#calendarPagesV21 [data-page="month"]')?.replaceChildren(document.createTextNode('月間'));
    document.querySelector('#calendarPagesV21 [data-page="manage"]')?.replaceChildren(document.createTextNode('管理'));

    document.querySelectorAll('.day.off:not(.other)').forEach(cell=>{
      cell.setAttribute('aria-label',`${cell.querySelector('.date')?.textContent||''}日 公休`);
    });
  }

  function paint(){
    queued=false;
    document.documentElement.dataset.referenceDesign='104';
    const heading=document.querySelector('.top h1');
    if(heading&&heading.textContent!==title())heading.textContent=title();
    labelDrive();
    labelCalendar();
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(paint);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});
  else queue();

  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-calendar-page']});
  addEventListener('pageshow',queue);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});
  setInterval(queue,1500);
})();
