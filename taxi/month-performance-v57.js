'use strict';
(()=>{
  if(window.__yosMonthPerformanceV57)return;
  window.__yosMonthPerformanceV57=true;

  const CAL='yos-taxi-calendar-v1';
  const OPS='yos-taxi-ops-v1';
  const confirmed={
    '2026-07-01':{sales:31000,taxExclusiveSales:28182,rides:24,actualHours:11.25},
    '2026-07-02':{sales:23100,taxExclusiveSales:21000,rides:15,actualHours:11.8333333333},
    '2026-07-03':{sales:38100,taxExclusiveSales:34636,rides:22,actualHours:12.3333333333},
    '2026-07-05':{sales:26700,taxExclusiveSales:24273,rides:26,actualHours:10.75},
    '2026-07-06':{sales:35900,taxExclusiveSales:32636,rides:22,actualHours:12.4166666667},
    '2026-07-07':{sales:24600,taxExclusiveSales:22364,rides:22,actualHours:9.6666666667},
    '2026-07-09':{sales:25300,taxExclusiveSales:23000,rides:19,actualHours:11.4166666667},
    '2026-07-10':{sales:36600,taxExclusiveSales:33273,rides:24,actualHours:11.8333333333},
    '2026-07-11':{sales:14700,taxExclusiveSales:13364,rides:12,actualHours:8.9166666667},
    '2026-07-14':{sales:29700,taxExclusiveSales:27000,rides:15,actualHours:11.3833333333},
    '2026-07-18':{sales:48500,taxExclusiveSales:44091,rides:41,actualHours:13.0333333333},
    '2026-07-19':{sales:54400,taxExclusiveSales:49455,rides:35,actualHours:11.9166666667},
    '2026-07-21':{sales:41500,taxExclusiveSales:37727,rides:24,actualHours:12.5833333333}
  };

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const compactYen=value=>{
    const amount=Math.round(number(value));
    if(amount>=10000){
      const man=amount/10000;
      return `¥${Number.isInteger(man)?man:man.toFixed(1)}万`;
    }
    return `¥${amount.toLocaleString('ja-JP')}`;
  };

  function mergeConfirmed(){
    const calendar=read(CAL,{monthlyGoals:{},days:{}});
    calendar.monthlyGoals=calendar.monthlyGoals||{};
    calendar.days=calendar.days||{};
    let changed=false;

    Object.entries(confirmed).forEach(([date,report])=>{
      const current=calendar.days[date]||{};
      const next={
        ...current,
        status:current.status==='transferWork'?'transferWork':'work',
        sales:report.sales,
        taxExclusiveSales:report.taxExclusiveSales,
        actualHours:report.actualHours,
        reportTrips:report.rides,
        reportSource:'ProjectY 運行データ／日報集計_確認済',
        reportConfirmed:true
      };
      if(JSON.stringify(current)!==JSON.stringify(next)){
        calendar.days[date]=next;
        changed=true;
      }
    });

    const ops=read(OPS,null);
    if(ops?.businessDate){
      const rides=(ops.events||[]).filter(event=>event.type==='降車');
      const liveSales=rides.reduce((sum,event)=>sum+number(event.fare)+number(event.tip),0);
      if(liveSales>0){
        const current=calendar.days[ops.businessDate]||{};
        const next={...current,status:current.status==='transferWork'?'transferWork':'work',sales:liveSales,reportTrips:rides.length,liveSource:true};
        if(JSON.stringify(current)!==JSON.stringify(next)){
          calendar.days[ops.businessDate]=next;
          changed=true;
        }
      }
    }

    if(changed)write(CAL,calendar);
    try{
      if(typeof data!=='undefined'){
        data.monthlyGoals={...(data.monthlyGoals||{}),...calendar.monthlyGoals};
        data.days={...(data.days||{}),...calendar.days};
      }
    }catch(error){console.warn('YOS month performance data sync',error)}
    return calendar;
  }

  function applyPerformance(){
    const calendar=read(CAL,{days:{}});
    document.querySelectorAll('#monthView .day[data-key]').forEach(day=>{
      const key=day.dataset.key;
      const value=calendar.days?.[key]||{};
      const sales=number(value.sales);
      if(sales<=0)return;

      day.classList.add('has-performance-v57');
      let money=day.querySelector('.month-money');
      if(!money){
        money=document.createElement('span');
        money.className='month-money actual-v57';
        const date=day.querySelector('.date');
        date?.insertAdjacentElement('afterend',money);
      }
      money.textContent=compactYen(sales);
      if(!money.classList.contains('hit')&&!money.classList.contains('miss')&&!money.classList.contains('live'))money.classList.add('actual-v57');

      let label=day.querySelector('.month-label');
      if(!label){
        label=document.createElement('span');
        label.className='month-label actual-v57';
        label.textContent=`実績${number(value.reportTrips)>0?` ${number(value.reportTrips)}回`:''}`;
        money.insertAdjacentElement('afterend',label);
      }

      const previous=day.getAttribute('aria-label')||key;
      if(!previous.includes('営業実績'))day.setAttribute('aria-label',`${previous} 営業実績${sales.toLocaleString('ja-JP')}円`);
    });
  }

  function install(){
    mergeConfirmed();
    if(typeof renderMonth!=='function'||!window.__yosCalendarV19Loaded)return false;
    if(!renderMonth.__yosMonthPerformanceV57){
      const base=renderMonth;
      const enhanced=function(){
        base();
        requestAnimationFrame(applyPerformance);
      };
      enhanced.__yosMonthPerformanceV57=true;
      renderMonth=enhanced;
    }
    try{if(typeof render==='function')render()}catch(error){console.warn('YOS month performance render',error)}
    applyPerformance();
    return true;
  }

  let attempts=0;
  const wait=setInterval(()=>{
    attempts++;
    if(install()||attempts>120)clearInterval(wait);
  },100);
  addEventListener('storage',event=>{if(event.key===CAL||event.key===OPS){mergeConfirmed();try{render()}catch{};applyPerformance()}});
})();
