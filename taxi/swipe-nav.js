'use strict';
(()=>{
  // Legacy 3-page swipe navigation is retired.
  // The current Taxi UI handles 5-page navigation and swipe order in ui-v24.js.
  document.querySelectorAll('nav[aria-label="画面切り替え"]').forEach(node=>node.remove());
  const previewCard=document.getElementById('yosSwipePreviewCard');
  if(previewCard?.parentElement)previewCard.parentElement.remove();
  document.body.style.transform='';
  document.body.style.transition='';
  document.body.style.opacity='';

  // Confirmed paper-report results are merged into the calendar without
  // deleting targets, weather, events, transfers, or other user-entered data.
  const isCalendar=location.pathname.endsWith('/taxi/calendar.html');
  if(!isCalendar||typeof data==='undefined'||typeof save!=='function'||typeof render!=='function')return;

  const officialDays={
    '2026-07-26':{status:'work',sales:11100,note:'日報確定：9件・11,100円（表面未確認）'},
    '2026-07-27':{status:'work',sales:29500,actualHours:10+35/60},
    '2026-07-28':{status:'work',sales:30200,actualHours:12},
    '2026-07-29':{status:'work',sales:38000,actualHours:11+55/60},
    '2026-07-30':{status:'work',sales:22400,actualHours:11+15/60,note:'日報確定：11件・22,400円（明細2件の時刻・乗降地不明）'}
  };

  function applyOfficialDays(){
    let changed=false;
    for(const [date,patch] of Object.entries(officialDays)){
      const current=data.days[date]||{};
      const next={...current,status:patch.status,sales:patch.sales};
      if(Number.isFinite(patch.actualHours))next.actualHours=patch.actualHours;
      if(patch.note){
        const existing=String(current.event||'').trim();
        next.event=existing.includes(patch.note)?existing:[existing,patch.note].filter(Boolean).join('・');
      }
      if(JSON.stringify(current)!==JSON.stringify(next)){
        data.days[date]=next;
        changed=true;
      }
    }
    if(changed)save();
    return changed;
  }

  if(typeof syncTodayFromOperations==='function'){
    const originalSync=syncTodayFromOperations;
    syncTodayFromOperations=()=>{
      const operationsChanged=originalSync();
      const officialChanged=applyOfficialDays();
      return operationsChanged||officialChanged;
    };
  }

  if(applyOfficialDays())render();
})();