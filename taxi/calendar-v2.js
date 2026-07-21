'use strict';
(()=>{
  const CAL='yos-taxi-calendar-v1',EXT='yos-taxi-calendar-settings-v2',OPS='yos-taxi-ops-v1',TAXI='yos-taxi-settings-v2';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const ext=()=>({carrySales:0,shiftStart:'17:30',shiftEnd:'03:30',workDays:3,offDays:1,...read(EXT,{})});
  const calcHours=(start,end)=>{const [a,b]=[start,end].map(v=>String(v||'').split(':').map(Number)).map(v=>v[0]*60+v[1]);return Math.max(0,((b<=a?b+1440:b)-a)/60)};

  function addSettingsLink(){
    if(document.getElementById('openAdvancedSettings'))return;
    const button=document.createElement('a');
    button.id='openAdvancedSettings';
    button.href='./settings.html';
    button.className='settings';
    button.style.cssText='display:flex;align-items:center;justify-content:center;text-decoration:none;margin-bottom:10px';
    button.textContent='⚙️ 詳細設定・勤務周期・目標配分';
    const basic=document.getElementById('openMonth');
    if(basic){basic.textContent='月目標の簡易設定';basic.insertAdjacentElement('afterend',button)}
  }

  function syncTodayFromOperations(){
    const ops=read(OPS,null);if(!ops?.businessDate)return false;
    const rides=(ops.events||[]).filter(event=>event.type==='降車');
    const sales=rides.reduce((sum,event)=>sum+Number(event.fare||0)+Number(event.tip||0),0);
    const taxi=read(TAXI,{}),cfg=ext(),current=dayData(ops.businessDate);
    const target=Number(taxi.targetSales||current.target||0);
    const hours=Number(current.hours||calcHours(taxi.plannedStart||cfg.shiftStart,taxi.plannedEnd||cfg.shiftEnd));
    const next={...current,status:current.status==='off'?'off':(ops.status==='before'&&current.status==='unknown'?'unknown':'work'),hours:current.status==='off'?0:hours,target,sales};
    const before=JSON.stringify(data.days[ops.businessDate]||null),after=JSON.stringify(next);
    if(before!==after){data.days[ops.businessDate]=next;save();return true}
    return false;
  }

  const originalSummary=summary;
  summary=()=>{
    originalSummary();
    const cfg=ext(),mk=monthKey(focus),goal=Number(data.monthlyGoals[mk]||770000),entries=Object.entries(data.days).filter(([key])=>key.startsWith(mk));
    const achieved=entries.reduce((sum,[,value])=>sum+Number(value.sales||0),Number(cfg.carrySales||0));
    const remaining=Math.max(0,goal-achieved);
    document.getElementById('achieved').textContent=yen(achieved);
    document.getElementById('remaining').textContent=yen(remaining);
    document.getElementById('progress').textContent=goal?`${Math.min(999,Math.round(achieved/goal*100))}%`:'0%';
  };

  function hydrateCalendarFromStorage(){
    const restored=read(CAL,{monthlyGoals:{},days:{}});
    data.monthlyGoals={...(restored.monthlyGoals||{})};
    data.days={...(restored.days||{})};
  }

  function loadCalendarV22(){
    if(window.__yosCalendarV17Requested||document.querySelector('script[src*="calendar-v3.js"]'))return;
    window.__yosCalendarV17Requested=true;
    const script=document.createElement('script');
    script.src='./calendar-v3.js?v=22';
    script.dataset.yosCalendarV17='1';
    document.head.appendChild(script);
  }

  function loadEnhancements(){
    if(window.__yosReportHistoryRequested){hydrateCalendarFromStorage();loadCalendarV22();return}
    window.__yosReportHistoryRequested=true;
    const script=document.createElement('script');
    script.src='./v15.js?v=22';
    script.dataset.yosReportHistoryV15='1';
    script.onload=()=>{
      hydrateCalendarFromStorage();
      loadCalendarV22();
      render();
    };
    script.onerror=()=>{
      hydrateCalendarFromStorage();
      loadCalendarV22();
      render();
    };
    document.head.appendChild(script);
  }

  addSettingsLink();
  syncTodayFromOperations();
  render();
  loadEnhancements();
  setInterval(()=>{if(syncTodayFromOperations())render();else summary()},15000);
})();
