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

    const verifiedReports={
      '2026-07-01':{sales:31000,netSales:28182,rides:24,shiftStart:'17:10',serviceEnd:'04:25',workEnd:'04:25',actualHours:11.25},
      '2026-07-02':{sales:23100,netSales:21000,rides:15,shiftStart:'17:25',serviceEnd:'05:15',workEnd:'05:15',actualHours:11.8333333333},
      '2026-07-03':{sales:38100,netSales:34636,rides:22,shiftStart:'16:10',serviceEnd:'04:30',workEnd:'04:30',actualHours:12.3333333333},
      '2026-07-05':{sales:26700,netSales:24273,rides:26,shiftStart:'17:15',serviceEnd:'04:00',workEnd:'04:00',actualHours:10.75},
      '2026-07-06':{sales:35900,netSales:32636,rides:22,shiftStart:'17:00',serviceEnd:'05:25',workEnd:'05:25',actualHours:12.4166666667},
      '2026-07-07':{sales:24600,netSales:22364,rides:22,shiftStart:'16:55',serviceEnd:'02:35',workEnd:'02:35',actualHours:9.6666666667},
      '2026-07-09':{sales:25300,netSales:23000,rides:19,shiftStart:'17:00',serviceEnd:'04:25',workEnd:'04:25',actualHours:11.4166666667},
      '2026-07-10':{sales:36600,netSales:33273,rides:24,shiftStart:'16:35',serviceEnd:'04:25',workEnd:'04:25',actualHours:11.8333333333},
      '2026-07-11':{sales:14700,netSales:13364,rides:12,shiftStart:'17:30',serviceEnd:'02:25',workEnd:'02:25',actualHours:8.9166666667},
      '2026-07-14':{sales:29700,netSales:27000,rides:15,shiftStart:'17:15',serviceEnd:'04:38',workEnd:'04:38',actualHours:11.3833333333},
      '2026-07-18':{sales:48500,netSales:44091,rides:41,shiftStart:'15:20',serviceEnd:'04:22',workEnd:'04:22',actualHours:13.0333333333},
      '2026-07-19':{sales:54400,netSales:49455,rides:35,shiftStart:'16:35',serviceEnd:'04:30',workEnd:'04:30',actualHours:11.9166666667},
      '2026-07-21':{sales:41500,netSales:37727,rides:24,shiftStart:'14:00',serviceEnd:'02:35',workEnd:'02:35',actualHours:12.5833333333}
    };

    data.monthlyGoals=data.monthlyGoals||{};
    data.days=data.days||{};
    if(!Number(data.monthlyGoals['2026-07']))data.monthlyGoals['2026-07']=770000;

    Object.entries(verifiedReports).forEach(([key,report])=>{
      const current=data.days[key]||{};
      data.days[key]={
        ...current,
        ...report,
        status:current.status==='transferWork'?'transferWork':'work',
        plannedHours:Number(current.plannedHours||report.actualHours),
        reportSource:'ProjectY 乗務日報／Taxi Lab 03_Reports',
        reportVerified:true,
        reportVersion:'2026-07-27-v43'
      };
    });

    try{
      old.carrySales=0;
      localStorage.setItem('yos-taxi-calendar-settings-v2',JSON.stringify({...old,carrySales:0}));
    }catch{}
    try{
      settings.months=settings.months||{};
      settings.months['2026-07']={...(settings.months['2026-07']||{}),carrySales:0};
      localStorage.setItem('yos-taxi-calendar-settings-v3',JSON.stringify(settings));
    }catch{}
    try{save()}catch{localStorage.setItem('yos-taxi-calendar-v1',JSON.stringify(data))}

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
