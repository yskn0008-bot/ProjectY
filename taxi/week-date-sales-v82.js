'use strict';
(()=>{
  if(window.__yosWeekDateSalesV82)return;
  window.__yosWeekDateSalesV82=true;

  const CAL='yos-taxi-calendar-v1';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const yen=value=>`¥${Math.round(number(value)).toLocaleString('ja-JP')}`;
  const hours=value=>{
    const n=number(value);
    if(!n)return'0時間';
    return Number.isInteger(n)?`${n}時間`:`${n.toFixed(1)}時間`;
  };
  const isWork=status=>['work','transferWork'].includes(status);
  const weekdays=['日','月','火','水','木','金','土'];

  let raf=0;

  const isWeek=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='week'||document.body?.dataset.calendarPage==='week'||document.body?.classList.contains('calendar-week-mode');
  };

  const shortDate=key=>{
    const [y,m,d]=String(key||'').split('-').map(Number);
    if(!y||!m||!d)return key||'';
    const date=new Date(y,m-1,d);
    return `${m}/${d}(${weekdays[date.getDay()]})`;
  };

  function sync(){
    raf=0;
    if(!isWeek())return;

    const calendar=read(CAL,{days:{}});
    const items=Array.from(document.querySelectorAll('#weekView .week-item[data-key]'));
    if(!items.length)return;

    let totalTarget=0;
    let totalSales=0;
    let totalPlanned=0;
    let totalActual=0;

    items.forEach(item=>{
      const key=item.dataset.key;
      const value=calendar.days?.[key]||{};
      const target=number(value.target);
      const sales=number(value.sales);
      const planned=isWork(value.status)?number(value.plannedHours):0;
      const actual=number(value.actualHours);

      totalTarget+=target;
      totalSales+=sales;
      totalPlanned+=planned;
      totalActual+=actual;

      const dateNode=item.querySelector('.week-date');
      if(dateNode&&dateNode.textContent!==shortDate(key))dateNode.textContent=shortDate(key);

      const metricBlocks=item.querySelectorAll('.week-metrics>div');
      const targetNode=metricBlocks[0]?.querySelector('strong');
      const salesNode=metricBlocks[1]?.querySelector('strong');
      const plannedNode=metricBlocks[2]?.querySelector('strong');
      const actualNode=metricBlocks[3]?.querySelector('strong');

      if(targetNode&&targetNode.textContent!==yen(target))targetNode.textContent=yen(target);
      if(salesNode&&salesNode.textContent!==yen(sales))salesNode.textContent=yen(sales);
      if(plannedNode&&plannedNode.textContent!==hours(planned))plannedNode.textContent=hours(planned);
      if(actualNode&&actualNode.textContent!==hours(actual))actualNode.textContent=hours(actual);

      if(targetNode){
        targetNode.classList.remove('white','blue','red');
        if(target>0&&sales>=target)targetNode.classList.add('blue');
        else if(sales>0)targetNode.classList.add('red');
        else targetNode.classList.add('white');
      }
    });

    const values={
      weekTarget:yen(totalTarget),
      weekSales:yen(totalSales),
      weekPlanned:hours(totalPlanned),
      weekActual:hours(totalActual)
    };
    Object.entries(values).forEach(([id,text])=>{
      const node=document.getElementById(id);
      if(node&&node.textContent!==text)node.textContent=text;
    });

    window.dispatchEvent(new Event('resize'));
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(sync));
  }

  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule);
  addEventListener('orientationchange',schedule);
  addEventListener('storage',event=>{if(event.key===CAL)schedule()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});

  new MutationObserver(schedule).observe(document.documentElement,{
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['class','data-calendar-page']
  });

  schedule();
  setTimeout(schedule,200);
  setTimeout(schedule,700);
  setInterval(schedule,2000);
})();
