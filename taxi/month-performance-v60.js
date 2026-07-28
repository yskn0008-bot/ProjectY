'use strict';
(()=>{
  if(window.__yosMonthPerformanceV60)return;
  window.__yosMonthPerformanceV60=true;

  const CAL='yos-taxi-calendar-v1';
  const OPS='yos-taxi-ops-v1';
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};

  // 万円表記を100円単位（小数点第2位）まで表示する。
  const compactHundredYen=value=>{
    const rounded=Math.round(number(value)/100)*100;
    return `${(rounded/10000).toFixed(2)}万`;
  };

  const isLive=key=>{
    const ops=read(OPS,null);
    return !!ops&&ops.businessDate===key&&!['before','ended'].includes(ops.status);
  };

  const resultState=(key,value)=>{
    const sales=number(value.sales),target=number(value.target);
    if(isLive(key))return'live';
    if(sales>0&&target>0)return sales>=target?'hit':'miss';
    if(sales>0)return'actual';
    if(target>0)return'target';
    return'none';
  };

  function updateLegend(){
    const legend=document.querySelector('#monthView .legend-v17, #monthView .legend');
    if(!legend)return;
    legend.querySelector('.actual-legend-v58')?.remove();
    if(legend.querySelector('.actual-legend-v60'))return;
    const item=document.createElement('span');
    item.className='actual-legend-v60';
    item.innerHTML='<i></i>橙＝実績';
    legend.appendChild(item);
  }

  let applying=false;
  let queued=false;
  function apply(){
    queued=false;
    if(applying)return;
    applying=true;
    try{
      updateLegend();
      const calendar=read(CAL,{days:{}});
      document.querySelectorAll('#monthView .day[data-key]').forEach(day=>{
        day.querySelector(':scope > .month-performance-v58')?.remove();
        day.classList.remove('has-performance-v58');

        const key=day.dataset.key;
        const value=calendar.days?.[key]||{};
        const sales=number(value.sales);
        const target=number(value.target);
        const rides=number(value.reportTrips||value.rides);
        const state=resultState(key,value);
        let box=day.querySelector(':scope > .month-performance-v60');

        if(state==='none'){
          box?.remove();
          day.classList.remove('has-month-value-v60');
          return;
        }

        day.classList.add('has-month-value-v60');
        const amount=sales>0?sales:target;
        const detail=sales>0?(rides>0?`${rides}回`:'実績'):'目標';
        const markup=`<strong>${compactHundredYen(amount)}</strong><small>${detail}</small>`;
        if(!box){
          box=document.createElement('span');
          day.appendChild(box);
        }
        const className=`month-performance-v60 ${state}`;
        if(box.className!==className)box.className=className;
        if(box.innerHTML!==markup)box.innerHTML=markup;

        const base=key;
        if(sales>0){
          day.setAttribute('aria-label',`${base} 営業実績${sales.toLocaleString('ja-JP')}円${rides>0?` ${rides}回`:''}${target>0?` 目標${target.toLocaleString('ja-JP')}円`:''}`);
        }else{
          day.setAttribute('aria-label',`${base} 目標${target.toLocaleString('ja-JP')}円`);
        }
      });
    }finally{
      applying=false;
    }
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(apply);
  }

  function observe(){
    const calendar=document.getElementById('calendar');
    if(!calendar)return false;
    if(!calendar.dataset.performanceObserverV60){
      new MutationObserver(schedule).observe(calendar,{childList:true});
      calendar.dataset.performanceObserverV60='1';
    }
    schedule();
    return true;
  }

  let attempts=0;
  const wait=setInterval(()=>{
    attempts++;
    if(observe()||attempts>120)clearInterval(wait);
  },100);

  addEventListener('storage',event=>{
    if(event.key===CAL||event.key===OPS)schedule();
  });
  addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  setInterval(schedule,3000);
})();