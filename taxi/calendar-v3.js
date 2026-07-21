'use strict';
(()=>{
  if(window.__yosCalendarV19Loaded)return;
  window.__yosCalendarV19Loaded=true;

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
  const operations=()=>read(OPS,null);
  const isLiveDay=k=>{
    const ops=operations();
    return !!ops&&ops.businessDate===k&&!['before','ended'].includes(ops.status);
  };

  function inferAnchor(){
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

  function futureWorkEntries(mk){
    const today=todayKey();
    return monthDays(mk)
      .map(k=>[k,dayData(k)])
      .filter(([k,v])=>k>=today&&isWork(v.status)&&num(v.sales)===0);
  }

  function autoAllocate(mk){
    const cfg=monthCfg(mk),goal=num(data.monthlyGoals[mk]||770000);
    const entries=monthDays(mk).map(k=>[k,dayData(k)]);
    const achieved=num(cfg.carrySales)+entries.reduce((sum,[,v])=>sum+num(v.sales),0);
    const remaining=Math.max(0,goal-achieved);
    const future=futureWorkEntries(mk);
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
    const roundedPool=Math.floor(remaining/round)*round;
    const tail=remaining-roundedPool;
    const totalUnits=Math.floor(roundedPool/round);
    let used=0;
    const allocated=weighted.map(item=>{
      const exact=totalUnits*item.weight/totalWeight;
      const units=Math.floor(exact);
      used+=units;
      return {...item,units,fraction:exact-units};
    });
    allocated.sort((a,b)=>b.fraction-a.fraction||a.k.localeCompare(b.k));
    for(let i=0;i<totalUnits-used;i++)allocated[i%allocated.length].units++;
    if(tail>0)allocated[0].tail=tail;

    let changed=false;
    for(const item of allocated){
      const target=item.units*round+num(item.tail);
      if(num(data.days[item.k]?.target)!==target){
        data.days[item.k]={...dayData(item.k),target,autoTarget:true};
        changed=true;
      }
    }
    if(changed)save();
  }

  function compactYen(value){return `¥${Math.round(num(value)).toLocaleString('ja-JP')}`}
  function signedYen(value){const n=Math.round(num(value));return `${n>=0?'+':'−'}¥${Math.abs(n).toLocaleString('ja-JP')}`}
  function resultState(k,v){
    const target=num(v.target),sales=num(v.sales);
    if(!target)return'none';
    if(isLiveDay(k))return'live';
    if(sales>0||k<todayKey())return sales>=target?'hit':'miss';
    return'target';
  }

  targetClass=(k,v)=>({hit:'green',miss:'red',live:'blue',target:'white',none:'white'})[resultState(k,v)]||'white';

  function installUI(){
    if(!document.getElementById('calendarV19Styles')){
      const style=document.createElement('style');
      style.id='calendarV19Styles';
      style.textContent=`
        .week-start-control{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 8px;padding:8px 10px;border:1px solid var(--line);border-radius:13px;background:var(--panel)}
        .week-start-control label{font-size:10px;color:var(--muted);font-weight:900}
        .week-start-control select{min-height:34px;border:1px solid var(--line);border-radius:10px;padding:5px 9px;background:var(--panel2);color:var(--text);font-weight:900}
        .legend-v17{display:flex;gap:9px;flex-wrap:wrap;margin:0 2px 7px;color:var(--muted);font-size:9px}
        .legend-v17 i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:3px;vertical-align:0}
        .legend-v17 .work{background:#5c5c64}.legend-v17 .off{background:#8a8a92}.legend-v17 .transfer{background:var(--violet)}
        .day{position:relative;min-height:64px;padding:5px 4px;background:rgba(21,21,23,.96)}
        .day::before{content:'';position:absolute;left:4px;right:4px;top:3px;height:2px;border-radius:999px;background:#4a4a52}
        .day.status-off{background:rgba(255,255,255,.025)}.day.status-off::before{background:#77777f}
        .day.status-transferWork,.day.status-transferOff{background:rgba(173,140,255,.055);border-color:rgba(173,140,255,.35)}
        .day.status-transferWork::before,.day.status-transferOff::before{background:var(--violet)}
        .day.today{outline:2px solid var(--amber);outline-offset:0}
        .month-money{display:block;margin-top:8px;font-size:10px;font-weight:950;line-height:1.05;letter-spacing:-.04em;color:#fff}
        .month-money.hit{color:var(--green)}.month-money.miss{color:var(--red)}.month-money.live{color:var(--blue)}.month-money.target{color:#fff}
        .month-label{display:block;margin-top:2px;color:var(--muted);font-size:7px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .month-label.hit{color:var(--green)}.month-label.miss{color:var(--red)}.month-label.live{color:var(--blue)}
        .month-sub{display:block;margin-top:2px;color:var(--muted);font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .green{color:var(--green)!important}.red{color:var(--red)!important}.blue{color:var(--blue)!important}.white{color:#fff!important}
        body.calendar-month-mode .app{padding:calc(env(safe-area-inset-top) + 5px) 6px calc(env(safe-area-inset-bottom) + 8px)}
        body.calendar-month-mode .top{margin-bottom:5px;align-items:center}body.calendar-month-mode .top .eyebrow{display:none}body.calendar-month-mode .top h1{font-size:19px}body.calendar-month-mode .back{min-height:34px;padding:0 9px;font-size:11px}
        body.calendar-month-mode .summary{grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:5px}body.calendar-month-mode .summary .card{padding:6px 3px;border-radius:10px;text-align:center}body.calendar-month-mode .summary .card strong{font-size:12px}body.calendar-month-mode .summary .card span{font-size:7px}body.calendar-month-mode .summary .card:nth-child(n+5){display:none}
        body.calendar-month-mode .view-tabs{margin:4px 0;gap:4px}body.calendar-month-mode .view-tab{min-height:34px;border-radius:10px;font-size:11px}
        body.calendar-month-mode .toolbar{grid-template-columns:38px 1fr 38px;margin:3px 0;gap:5px}body.calendar-month-mode .toolbar button{min-height:34px;border-radius:10px}body.calendar-month-mode .period{font-size:14px}
        body.calendar-month-mode #jumpToday,body.calendar-month-mode .settings,body.calendar-month-mode .notice,body.calendar-month-mode .week-start-control{display:none!important}
        body.calendar-month-mode .week-head div{font-size:9px;padding:3px 0}body.calendar-month-mode .week-head,body.calendar-month-mode .month-grid{gap:3px}
        body.calendar-week-mode .summary .card:nth-child(n+5),body.calendar-today-mode .summary .card:nth-child(n+5){display:none}
        body.calendar-week-mode .week-item{padding:8px 10px;border-radius:13px}body.calendar-week-mode .week-list{gap:5px}body.calendar-week-mode .week-extra{display:none}body.calendar-week-mode .week-metrics{margin-top:5px}
        @media(max-width:390px){.day{min-height:58px}.month-money{font-size:9px}.month-label,.month-sub{font-size:6px}}
      `;
      document.head.appendChild(style);
    }

    const monthView=$('monthView');
    if(monthView&&!$('weekStartV17')){
      monthView.insertAdjacentHTML('afterbegin',`<div class="week-start-control"><label for="weekStartV17">週の始まり</label><select id="weekStartV17">${WEEKDAYS.map((name,index)=>`<option value="${index}">${name}曜日</option>`).join('')}</select></div>`);
      $('weekStartV17').value=String(currentWeekStart());
      $('weekStartV17').onchange=()=>{settings.weekStart=num($('weekStartV17').value);write(SET,settings);render()};
    }

    const legend=monthView?.querySelector('.legend');
    if(legend){
      legend.className='legend-v17';
      legend.innerHTML='<span><i class="work"></i>勤務</span><span><i class="off"></i>公休</span><span><i class="transfer"></i>振替</span><span class="green">緑＝達成</span><span class="red">赤＝未達</span><span class="blue">青＝営業中</span>';
    }
  }

  function updateModeClass(){
    document.body.classList.remove('calendar-today-mode','calendar-week-mode','calendar-month-mode');
    document.body.classList.add(`calendar-${mode}-mode`);
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
    const future=futureWorkEntries(mk);
    if($('workDays'))$('workDays').textContent=`${future.length}日`;
  };

  const originalRender=render;
  render=()=>{updateModeClass();originalRender();updateModeClass()};

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
      const k=keyOf(d),v=dayData(k),same=d.getMonth()===m,state=resultState(k,v);
      const target=num(v.target),sales=num(v.sales),diff=sales-target;
      let amount='',label='',sub='';
      if(state==='live'){
        amount=`<span class="month-money live">${compactYen(sales)}</span>`;
        label='<span class="month-label live">営業中</span>';
        sub=target?`<span class="month-sub">目標 ${compactYen(target)}</span>`:'';
      }else if(state==='hit'){
        amount=`<span class="month-money hit">${compactYen(sales)}</span>`;
        label=`<span class="month-label hit">✓ 達成 ${signedYen(diff)}</span>`;
      }else if(state==='miss'){
        amount=`<span class="month-money miss">${compactYen(sales)}</span>`;
        label=`<span class="month-label miss">未達 ${signedYen(diff)}</span>`;
      }else if(isWork(v.status)&&target){
        amount=`<span class="month-money target">${compactYen(target)}</span>`;
        label='<span class="month-label">目標</span>';
      }
      const aria=`${k} ${statusText(v.status)} ${state==='hit'?'目標達成':state==='miss'?'目標未達':state==='live'?'営業中':target?`目標${compactYen(target)}`:''}`;
      out.push(`<button class="day ${same?'':'other'} ${k===todayKey()?'today':''} status-${v.status} result-${state}" data-key="${k}" aria-label="${escapeHtml(aria)}"><span class="date">${d.getDate()}</span>${amount}${label}${sub}</button>`);
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
