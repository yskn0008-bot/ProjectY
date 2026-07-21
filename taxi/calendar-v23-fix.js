'use strict';
(()=>{
  if(window.__yosCalendarV23FixRequested)return;
  window.__yosCalendarV23FixRequested=true;

  const wait=setInterval(()=>{
    if(typeof renderMonth!=='function'||typeof render!=='function'||typeof dayData!=='function')return;
    clearInterval(wait);
    install();
  },60);

  function install(){
    if(window.__yosCalendarV23FixLoaded)return;
    window.__yosCalendarV23FixLoaded=true;

    const style=document.createElement('style');
    style.id='calendarV23FixCss';
    style.textContent=`
      .month-money.actual-record{color:#fff}
      .month-label.actual-record{color:var(--muted)}
    `;
    document.head.appendChild(style);

    const baseRenderMonth=renderMonth;
    renderMonth=()=>{
      baseRenderMonth();
      document.querySelectorAll('#calendar .day[data-key]').forEach(button=>{
        const key=button.dataset.key;
        const value=dayData(key);
        const sales=Number(value.sales||0);
        const target=Number(value.target||0);
        if(sales<=0||target>0)return;
        button.classList.remove('result-none');
        button.classList.add('result-actual');
        const date=button.querySelector('.date')?.outerHTML||'';
        button.innerHTML=`${date}<span class="month-money actual-record">¥${Math.round(sales).toLocaleString('ja-JP')}</span><span class="month-label actual-record">実績</span>`;
        button.setAttribute('aria-label',`${key} 実績 ¥${Math.round(sales).toLocaleString('ja-JP')} 目標記録なし`);
      });
    };

    render();
  }
})();
