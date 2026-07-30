'use strict';
(()=>{
  if(window.__yosTaxiReferenceDesignV104)return;
  window.__yosTaxiReferenceDesignV104=true;

  let queued=false;
  const isCalendar=()=>location.pathname.endsWith('/taxi/calendar.html');
  const isSettings=()=>location.pathname.endsWith('/taxi/settings.html');
  const isDrive=()=>location.pathname.endsWith('/taxi/')||location.pathname.endsWith('/taxi/index.html');
  const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value};

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
    setText(document.querySelector('#quickDashV18 .quick-head-v18>div:first-child>span'),'現在の状況');
    setText(document.querySelector('#quickDashV18 .quick-sales-v18 small'),'本日の売上');
    setText(document.querySelector('#quickDashV18 .quick-tools-v18 a[href*="calendar"]'),'カレンダー');
    setText(document.getElementById('quickDetailV18'),'詳細');
    setText(document.getElementById('quickYosV18'),'YOS');
  }

  function labelCalendar(){
    if(!isCalendar())return;
    setText(document.querySelector('#calendarPagesV21 [data-page="today"]'),'今日');
    setText(document.querySelector('#calendarPagesV21 [data-page="week"]'),'週間');
    setText(document.querySelector('#calendarPagesV21 [data-page="month"]'),'月間');
    setText(document.querySelector('#calendarPagesV21 [data-page="manage"]'),'管理');

    document.querySelectorAll('.day.off:not(.other)').forEach(cell=>{
      const value=`${cell.querySelector('.date')?.textContent||''}日 公休`;
      if(cell.getAttribute('aria-label')!==value)cell.setAttribute('aria-label',value);
    });
  }

  function paint(){
    queued=false;
    document.documentElement.dataset.referenceDesign='104';
    setText(document.querySelector('.top h1'),title());
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