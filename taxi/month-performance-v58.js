'use strict';
(()=>{
  if(window.__yosMonthPerformanceV58)return;
  window.__yosMonthPerformanceV58=true;

  const CAL='yos-taxi-calendar-v1';
  const OPS='yos-taxi-ops-v1';
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};

  const compact=value=>{
    const amount=Math.round(number(value));
    if(amount>=10000){
      const man=Math.round(amount/1000)/10;
      return `${Number.isInteger(man)?man:man.toFixed(1)}万`;
    }
    return amount.toLocaleString('ja-JP');
  };

  const isLive=key=>{
    const ops=read(OPS,null);
    return !!ops&&ops.businessDate===key&&!['before','ended'].includes(ops.status);
  };

  const resultState=(key,value)=>{
    const sales=number(value.sales),target=number(value.target);
    if(isLive(key))return'live';
    if(target>0)return sales>=target?'hit':'miss';
    return'actual';
  };

  function updateLegend(){
    const legend=document.querySelector('#monthView .legend-v17, #monthView .legend');
    if(!legend||legend.querySelector('.actual-legend-v58'))return;
    const item=document.createElement('span');
    item.className='actual-legend-v58';
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
        const key=day.dataset.key;
        const value=calendar.days?.[key]||{};
        const sales=number(value.sales);
        let box=day.querySelector(':scope > .month-performance-v58');

        if(sales<=0){
          box?.remove();
          day.classList.remove('has-performance-v58');
          return;
        }

        day.classList.add('has-performance-v58');
        const state=resultState(key,value);
        const rides=number(value.reportTrips||value.rides);
        const markup=`<strong>${compact(sales)}</strong><small>${rides>0?`${rides}回`:'実績'}</small>`;
        if(!box){
          box=document.createElement('span');
          day.appendChild(box);
        }
        const className=`month-performance-v58 ${state}`;
        if(box.className!==className)box.className=className;
        if(box.innerHTML!==markup)box.innerHTML=markup;

        const current=day.getAttribute('aria-label')||key;
        if(!current.includes('営業実績'))day.setAttribute('aria-label',`${current} 営業実績${sales.toLocaleString('ja-JP')}円${rides>0?` ${rides}回`:''}`);
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
    if(!calendar.dataset.performanceObserverV58){
      new MutationObserver(schedule).observe(calendar,{childList:true});
      calendar.dataset.performanceObserverV58='1';
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
