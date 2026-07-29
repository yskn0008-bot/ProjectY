'use strict';
(()=>{
  if(window.__yosMonthRowFitV80)return;
  window.__yosMonthRowFitV80=true;

  let raf=0;

  const isMonth=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='month'||document.body?.dataset.calendarPage==='month'||document.body?.classList.contains('calendar-month-mode');
  };

  function apply(){
    raf=0;
    if(!isMonth())return;

    const grid=document.querySelector('#monthView .month-grid');
    if(!grid)return;

    const cells=Array.from(grid.children).filter(node=>node.classList?.contains('day'));
    if(cells.length<35)return;

    cells.forEach(cell=>cell.classList.remove('month-row-hidden-v80'));

    const finalRow=cells.slice(35,42);
    const hideFinalRow=finalRow.length===7&&finalRow.every(cell=>cell.classList.contains('other'));
    const rowCount=hideFinalRow?5:6;

    if(hideFinalRow)finalRow.forEach(cell=>cell.classList.add('month-row-hidden-v80'));

    document.body.dataset.monthRowCountV80=String(rowCount);
    document.body.style.setProperty('--month-row-count-v80',String(rowCount));
    grid.style.setProperty('--month-row-count-v80',String(rowCount));
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(apply));
  }

  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule);
  addEventListener('orientationchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});

  new MutationObserver(schedule).observe(document.documentElement,{
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['class','data-calendar-page']
  });

  const wait=setInterval(schedule,100);
  setTimeout(()=>clearInterval(wait),5000);
  schedule();
  setTimeout(schedule,250);
  setTimeout(schedule,800);
})();
