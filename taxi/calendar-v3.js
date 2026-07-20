'use strict';
(()=>{
  const CYCLE_WORK=3,CYCLE_OFF=1,CYCLE=CYCLE_WORK+CYCLE_OFF;
  const pad2=n=>String(n).padStart(2,'0');
  const keyOf=d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const dateOf=k=>new Date(`${k}T12:00:00`);
  const daysBetween=(a,b)=>Math.round((dateOf(a)-dateOf(b))/86400000);
  const monthDays=mk=>{
    const [y,m]=mk.split('-').map(Number),last=new Date(y,m,0).getDate(),out=[];
    for(let d=1;d<=last;d++)out.push(`${y}-${pad2(m)}-${pad2(d)}`);
    return out;
  };
  const confirmedWork=k=>{
    const v=data.days?.[k];
    return !!v&&(num(v.sales)>0||num(v.reportTrips)>0||v.reportSource||v.status==='transferWork');
  };
  function inferAnchor(){
    const keys=Object.keys(data.days||{}).filter(confirmedWork).sort();
    let candidate='';
    for(let i=0;i<=keys.length-CYCLE_WORK;i++){
      let consecutive=true;
      for(let j=1;j<CYCLE_WORK;j++)if(daysBetween(keys[i+j],keys[i+j-1])!==1)consecutive=false;
      if(consecutive)candidate=keys[i];
    }
    return candidate||settings.anchor||todayKey();
  }
  function cycleStatus(k,anchor){
    const pos=((daysBetween(k,anchor)%CYCLE)+CYCLE)%CYCLE;
    return pos<CYCLE_WORK?'work':'off';
  }
  function ensureSchedule(mk){
    settings.workDays=CYCLE_WORK;
    settings.offDays=CYCLE_OFF;
    const anchor=inferAnchor();
    settings.anchor=anchor;
    const planned=timeHours(settings.shiftStart,settings.workEnd);
    let changed=false;
    for(const k of monthDays(mk)){
      const current=data.days[k]||defaultDay();
      if(isTransfer(current.status))continue;
      const derived=num(current.sales)>0?'work':cycleStatus(k,anchor);
      const next={...current,status:derived,shiftStart:current.shiftStart||settings.shiftStart,serviceEnd:current.serviceEnd||settings.serviceEnd,workEnd:current.workEnd||settings.workEnd,plannedHours:derived==='work'?(num(current.plannedHours)||planned):0,actualHours:derived==='off'?0:num(current.actualHours)};
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
    const achieved=num(cfg.carrySales)+entries.reduce((s,[,v])=>s+num(v.sales),0);
    const remaining=Math.max(0,goal-achieved);
    const future=entries.filter(([k,v])=>k>=today&&isWork(v.status));
    if(!future.length)return;
    const factors=Array.isArray(settings.weekdayFactors)&&settings.weekdayFactors.length===7?settings.weekdayFactors:[1,0.9,0.9,0.9,1,1.2,1.3];
    const weighted=future.map(([k,v])=>{
      const w=dateOf(k).getDay();
      return [k,Math.max(.1,num(factors[w])||1)*Math.max(.1,num(v.factor)||1)];
    });
    const total=weighted.reduce((s,[,w])=>s+w,0)||1,round=num(settings.round)||500;
    let changed=false;
    weighted.forEach(([k,w])=>{
      const target=Math.ceil((remaining*w/total)/round)*round;
      if(num(data.days[k]?.target)!==target){data.days[k]={...dayData(k),target};changed=true}
    });
    if(changed)save();
  }
  function compactYen(n){
    const value=num(n);
    return `¥${Math.round(value).toLocaleString('ja-JP')}`;
  }
  function installMonthStyles(){
    if(document.getElementById('calendarV3Styles'))return;
    const style=document.createElement('style');
    style.id='calendarV3Styles';
    style.textContent=`
      .day{min-height:124px;padding:7px 5px}.month-money{display:block;margin-top:5px;font-size:12px;font-weight:950;line-height:1.15;letter-spacing:-.02em}.month-money.actual{color:var(--blue)}.month-money.target{color:#fff}.month-label{display:block;margin-top:1px;color:var(--muted);font-size:8px;font-weight:800}.month-sub{display:block;margin-top:4px;color:var(--muted);font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.day.off .month-money{color:var(--muted)}
      @media(max-width:390px){.day{min-height:112px}.month-money{font-size:10px}.month-label,.month-sub{font-size:7px}}
    `;
    document.head.appendChild(style);
  }
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
    installMonthStyles();
    const y=focus.getFullYear(),m=focus.getMonth(),start=new Date(y,m,1-new Date(y,m,1).getDay()),out=[];
    for(let i=0;i<42;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);
      const k=keyOf(d),v=dayData(k),same=d.getMonth()===m;
      const hasSales=num(v.sales)>0,hasTarget=num(v.target)>0;
      const money=hasSales?`<span class="month-money actual">${compactYen(v.sales)}</span><span class="month-label">実績</span>`:isWork(v.status)&&hasTarget?`<span class="month-money target">${compactYen(v.target)}</span><span class="month-label">目標</span>`:'';
      const extra=[v.weather!=='未確認'?v.weather:'',v.event].filter(Boolean).join('・');
      out.push(`<button class="day ${same?'':'other'} ${k===todayKey()?'today':''} ${isOff(v.status)?'off':''} ${isTransfer(v.status)?'transfer':''}" data-key="${k}"><span class="date">${d.getDate()}</span><span class="tag ${v.status}">${statusText(v.status)}</span>${money}${hasSales&&hasTarget?`<span class="month-sub">目標 ${compactYen(v.target)}</span>`:''}${extra?`<span class="month-sub">${escapeHtml(extra)}</span>`:''}</button>`);
    }
    $('calendar').innerHTML=out.join('');
    document.querySelectorAll('.day').forEach(b=>b.onclick=()=>{focus=fromKey(b.dataset.key);mode='today';render()});
  };
  const initialMonth=monthKey(focus);
  ensureSchedule(initialMonth);
  autoAllocate(initialMonth);
  render();
})();
