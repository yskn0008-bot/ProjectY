'use strict';
(()=>{
  if(window.__yosCalendarV17Loaded)return;
  window.__yosCalendarV17Loaded=true;

  const WORK_DAYS=3,OFF_DAYS=1,CYCLE=WORK_DAYS+OFF_DAYS;
  const WEEKDAYS=['日','月','火','水','木','金','土'];
  const pad2=n=>String(n).padStart(2,'0');
  const keyOf=d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const dateOf=k=>new Date(`${k}T12:00:00`);
  const dayDiff=(a,b)=>Math.round((dateOf(a)-dateOf(b))/86400000);
  const monthDays=mk=>{
    const [y,m]=mk.split('-').map(Number),last=new Date(y,m,0).getDate(),keys=[];
    for(let d=1;d<=last;d++)keys.push(`${y}-${pad2(m)}-${pad2(d)}`);
    return keys;
  };
  const currentWeekStart=()=>Math.min(6,Math.max(0,num(settings.weekStart)));
  const confirmedWork=k=>{
    const v=data.days?.[k];
    return !!v&&(num(v.sales)>0||num(v.reportTrips)>0||v.reportSource||v.status==='transferWork');
  };

  function inferAnchor(){
    const futurePlanned=Object.entries(data.days||{}).filter(([k,v])=>k>=todayKey()&&(isWork(v.status)||isOff(v.status))).length;
    if(futurePlanned>=4&&settings.anchor)return settings.anchor;

    const keys=Object.keys(data.days||{}).filter(confirmedWork).sort();
    let latest='';
    for(let i=0;i<=keys.length-WORK_DAYS;i++){
      let consecutive=true;
      for(let j=1;j<WORK_DAYS;j++)if(dayDiff(keys[i+j],keys[i+j-1])!==1)consecutive=false;
      if(consecutive)latest=keys[i];
    }
    return latest||settings.anchor||todayKey();
  }

  function cycleStatus(k,anchor){
    const position=((dayDiff(k,anchor)%CYCLE)+CYCLE)%CYCLE;
    return position<WORK_DAYS?'work':'off';
  }

  function ensureSchedule(mk){
    settings.workDays=WORK_DAYS;
    settings.offDays=OFF_DAYS;
    settings.weekStart=currentWeekStart();
    settings.anchor=inferAnchor();

    const planned=timeHours(settings.shiftStart,settings.workEnd);
    let changed=false;
    for(const k of monthDays(mk)){
      const current=data.days[k]||defaultDay();
      if(isTransfer(current.status))continue;

      const status=num(current.sales)>0?'work':cycleStatus(k,settings.anchor);
      const next={
        ...current,
        status,
        shiftStart:current.shiftStart||settings.shiftStart,
        serviceEnd:current.serviceEnd||settings.serviceEnd,
        workEnd:current.workEnd||settings.workEnd,
        plannedHours:status==='work'?(num(current.plannedHours)||planned):0,
        actualHours:status==='off'?0:num(current.actualHours)
      };
      if(JSON.stringify(data.days[k]||null)!==JSON.stringify(next)){
        data.days[k]=next;
        changed=true;
      }
    }
    if(changed)save();else write(SET,settings);
  }

  function autoAllocate(mk){
    const today=todayKey(),cfg=monthCfg(mk),goal=num(data.monthlyGoals[mk]||770000);
    const entries=monthDays(mk).map(k=>[k,dayData(k)]);
    const achieved=num(cfg.carrySales)+entries.reduce((sum,[,v])=>sum+num(v.sales),0);
    const remaining=Math.max(0,goal-achieved);
    const future=entries.filter(([k,v])=>k>=today&&isWork(v.status));
    if(!future.length)return;

    const factors=Array.isArray(settings.weekdayFactors)&&settings.weekdayFactors.length===7
      ? settings.weekdayFactors
      : [1,0.9,0.9,0.9,1,1.2,1.3];
    const weighted=future.map(([k,v])=>{
      const weekday=dateOf(k).getDay();
      return {k,weight:Math.max(.1,num(factors[weekday])||1)*Math.max(.1,num(v.factor)||1)};
    });
    const totalWeight=weighted.reduce((sum,item)=>sum+item.weight,0)||1;
    const round=Math.max(100,num(settings.round)||500);
    const totalUnits=Math.ceil(remaining/round);
    let used=0;
    const allocated=weighted.map(item=>{
      const exact=totalUnits*item.weight/totalWeight;
      const units=Math.floor(exact);
      used+=units;
      return {...item,units,fraction:exact-units};
    });
    allocated.sort((a,b)=>b.fraction-a.fraction);
    for(let i=0;i<totalUnits-used;i++)allocated[i%allocated.length].units++;

    let changed=false;
    for(const item of allocated){
      const target=item.units*round;
      if(num(data.days[item.k]?.target)!==target){
        data.days[item.k]={...dayData(item.k),target};
        changed=true;
      }
    }
    if(changed)save();
  }

  function compactYen(value){
    return `¥${Math.round(num(value)).toLocaleString('ja-JP')}`;
  }

  function installUI(){
    if(!document.getElementById('calendarV17Styles')){
      const style=document.createElement('style');
      style.id='calendarV17Styles';
      style.textContent=`
        .week-start-control{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;padding:9px 11px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}
        .week-start-control label{font-size:11px;color:var(--muted);font-weight:900}
        .week-start-control select{min-height:38px;border:1px solid var(--line);border-radius:11px;padding:6px 10px;background:var(--panel2);color:var(--text);font-weight:900}
        .legend-v17{display:flex;gap:12px;flex-wrap:wrap;margin:0 2px 10px;color:var(--muted);font-size:11px}
        .legend-v17 i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;vertical-align:-1px}
        .legend-v17 .work{background:var(--green)}.legend-v17 .off{background:var(--red)}.legend-v17 .transfer{background:var(--violet)}
        .day{position:relative;min-height:118px;padding:8px 6px}
        .day::before{content:'';position:absolute;left:5px;right:5px;top:4px;height:3px;border-radius:999px;background:#4a4a52}
        .day.status-work::before{background:var(--green)}
        .day.status-off{background:rgba(255,107,115,.09)}.day.status-off::before{background:var(--red)}
        .day.status-transferWork,.day.status-transferOff{background:rgba(173,140,255,.08);border-color:rgba(173,140,255,.55)}
        .day.status-transferWork::before,.day.status-transferOff::before{background:var(--violet)}
        .month-money{display:block;margin-top:12px;font-size:12px;font-weight:950;line-height:1.15;letter-spacing:-.03em}
        .month-money.actual{color:var(--blue)}.month-money.target{color:#fff}
        .month-label{display:block;margin-top:2px;color:var(--muted);font-size:8px;font-weight:800}
        .month-sub{display:block;margin-top:5px;color:var(--muted);font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        @media(max-width:390px){.day{min-height:108px}.month-money{font-size:10px}.month-label,.month-sub{font-size:7px}}
      `;
      document.head.appendChild(style);
    }

    const monthView=$('monthView');
    if(monthView&&!$('weekStartV17')){
      monthView.insertAdjacentHTML('afterbegin',`<div class="week-start-control"><label for="weekStartV17">週の始まり</label><select id="weekStartV17">${WEEKDAYS.map((name,index)=>`<option value="${index}">${name}曜日</option>`).join('')}</select></div>`);
      $('weekStartV17').value=String(currentWeekStart());
      $('weekStartV17').onchange=()=>{
        settings.weekStart=num($('weekStartV17').value);
        write(SET,settings);
        render();
      };
    }

    const legend=monthView?.querySelector('.legend');
    if(legend){
      legend.className='legend-v17';
      legend.innerHTML='<span><i class="work"></i>勤務</span><span><i class="off"></i>公休</span><span><i class="transfer"></i>振替</span><span class="blue">青＝実績</span><span>白＝目標</span>';
    }
  }

  function updateWeekHeader(){
    const start=currentWeekStart();
    const head=document.querySelector('.week-head');
    if(head)head.innerHTML=Array.from({length:7},(_,i)=>`<div>${WEEKDAYS[(start+i)%7]}</div>`).join('');
  }

  weekStart=d=>{
    const start=new Date(d),delta=(start.getDay()-currentWeekStart()+7)%7;
    start.setDate(start.getDate()-delta);
    return start;
  };

  const originalSummary=summary;
  summary=()=>{
    const mk=monthKey(focus);
    ensureSchedule(mk);
    autoAllocate(mk);
    originalSummary();
  };

  renderMonth=()=>{
    const mk=monthKey(focus);
    ensureSchedule(mk);
    autoAllocate(mk);
    installUI();
    updateWeekHeader();

    const y=focus.getFullYear(),m=focus.getMonth(),first=new Date(y,m,1);
    const offset=(first.getDay()-currentWeekStart()+7)%7;
    const start=new Date(y,m,1-offset),out=[];
    for(let i=0;i<42;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);
      const k=keyOf(d),v=dayData(k),same=d.getMonth()===m;
      const hasSales=num(v.sales)>0,hasTarget=num(v.target)>0;
      const amount=hasSales
        ? `<span class="month-money actual">${compactYen(v.sales)}</span><span class="month-label">実績</span>`
        : isWork(v.status)&&hasTarget
          ? `<span class="month-money target">${compactYen(v.target)}</span><span class="month-label">目標</span>`
          : '';
      const sub=hasSales&&hasTarget?`<span class="month-sub">目標 ${compactYen(v.target)}</span>`:'';
      const aria=`${k} ${statusText(v.status)} ${hasSales?`実績${compactYen(v.sales)}`:hasTarget?`目標${compactYen(v.target)}`:''}`;
      out.push(`<button class="day ${same?'':'other'} ${k===todayKey()?'today':''} status-${v.status}" data-key="${k}" aria-label="${escapeHtml(aria)}"><span class="date">${d.getDate()}</span>${amount}${sub}</button>`);
    }
    $('calendar').innerHTML=out.join('');
    document.querySelectorAll('.day').forEach(button=>button.onclick=()=>{focus=fromKey(button.dataset.key);mode='today';render()});
  };

  installUI();
  updateWeekHeader();
  ensureSchedule(monthKey(focus));
  autoAllocate(monthKey(focus));
  render();
})();
