'use strict';
(function(root){
  const API={};
  const KEY='yos-taxi-revenue-goal-v1';
  const CAL='yos-taxi-calendar-v1';
  const CAL_SETTINGS='yos-taxi-calendar-settings-v3';
  const OPS='yos-taxi-ops-v1';
  const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v);
  const finite=v=>typeof v==='number'?Number.isFinite(v)?v:null:typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
  const money=v=>Math.max(0,finite(v)??0);
  const clamp=(value,min,max,fallback)=>{const n=finite(value);return n===null?fallback:Math.max(min,Math.min(max,n))};
  const dateParts=at=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(at);
    const pick=type=>parts.find(p=>p.type===type)?.value||'';
    return{date:pick('year')+'-'+pick('month')+'-'+pick('day'),hour:Number(pick('hour'))};
  };
  API.businessDate=at=>{
    const p=dateParts(at);
    if(p.hour>=8)return p.date;
    const d=new Date(p.date+'T00:00:00+09:00');d.setUTCDate(d.getUTCDate()-1);
    return dateParts(d).date;
  };
  API.defaultMonth=(at=new Date())=>{
    const month=dateParts(at).date.slice(0,7);
    return month<'2026-12'?'2026-12':month;
  };
  API.normalizedOptions=value=>({
    goal:Math.round(clamp(value?.goal,100000,10000000,1000000)),
    plannedShifts:Math.round(clamp(value?.plannedShifts,1,31,23)),
    plannedHours:clamp(value?.plannedHours,1,300,175),
    assumedFare:Math.round(clamp(value?.assumedFare,500,30000,1500)),
    month:/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value?.month||''))?value.month:API.defaultMonth()
  });
  API.compute=(cal,settings,ops,options,at=new Date())=>{
    const o=API.normalizedOptions(options);
    const days=cal&&typeof cal.days==='object'&&cal.days&&!Array.isArray(cal.days)?cal.days:{};
    const settingsMonths=settings&&typeof settings.months==='object'&&settings.months?settings.months:{};
    const cfg=settingsMonths[o.month]||{};
    const nowKey=API.businessDate(at);
    const live=ops&&ops.businessDate===nowKey&&nowKey.startsWith(o.month+'-')&&['available','occupied','break'].includes(ops.status);
    const map=new Map();
    for(const [date,data] of Object.entries(days)){
      if(!new RegExp('^'+o.month+'-\\d{2}$').test(date)||!data||typeof data!=='object')continue;
      const sales=money(data.sales);
      const hours=finite(data.actualHours);
      if(sales===0&&data.status!=='work'&&data.status!=='transferWork'&&!(hours>0))continue;
      map.set(date,{date,sales,hours:hours!==null&&hours>0&&hours<=24?hours:null,source:'営業カレンダー',status:data.status});
    }
    if(live){
      const rides=Array.isArray(ops.events)?ops.events.filter(e=>e?.type==='降車'):[];
      const liveSales=rides.reduce((sum,e)=>sum+money(e.fare)+money(e.tip),0);
      let liveHours=null;
      if(ops.shiftStart){
        const start=Date.parse(ops.shiftStart);
        const elapsed=(at.getTime()-start)/3600000;
        if(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<=24){
          const endBreaks=Array.isArray(ops.events)?ops.events.filter(e=>e?.type==='休憩終了'):[];
          let breakMs=endBreaks.reduce((sum,e)=>sum+money(e.durationMs),0);
          if(ops.status==='break'&&ops.breakStart){
            const b=Date.parse(ops.breakStart);
            if(Number.isFinite(b))breakMs+=Math.max(0,at.getTime()-b);
          }
          liveHours=Math.max(0,(elapsed*3600000-breakMs)/3600000);
        }
      }
      map.set(nowKey,{date:nowKey,sales:liveSales,hours:liveHours,source:'Taxi営業中',status:ops.status});
    }
    const entries=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const carrySales=money(cfg.carrySales);
    const carryHours=clamp(cfg.carryHours,0,300,0);
    const totalSales=entries.reduce((s,d)=>s+d.sales,carrySales);
    const worked=entries.length;
    const remainingSales=Math.max(0,o.goal-totalSales);
    const remainingShifts=Math.max(0,o.plannedShifts-worked);
    const hoursKnown=entries.every(e=>e.hours!==null)&&(!carrySales||carryHours>0);
    const recordedHours=entries.reduce((s,e)=>s+(e.hours??0),carryHours);
    const remainingHours=hoursKnown?Math.max(0,o.plannedHours-recordedHours):null;
    const perShift=remainingShifts>0?Math.ceil(remainingSales/remainingShifts):remainingSales===0?0:null;
    const perHour=remainingHours!==null&&remainingHours>0?Math.ceil(remainingSales/remainingHours):remainingSales===0?0:null;
    const ridesPerShift=perShift!==null?Math.ceil(perShift/o.assumedFare):null;
    const cycleMinutes=ridesPerShift&&remainingHours!==null&&remainingShifts>0?remainingHours/remainingShifts*60/ridesPerShift:null;
    const dailyAverage=worked?Math.round(entries.reduce((s,d)=>s+d.sales,0)/worked):null;
    return{
      month:o.month,goal:o.goal,plannedShifts:o.plannedShifts,plannedHours:o.plannedHours,
      assumedFare:o.assumedFare,entries,carrySales,worked,totalSales,remainingSales,
      remainingShifts,remainingHours,recordedHours,hoursKnown,perShift,perHour,
      ridesPerShift,cycleMinutes,dailyAverage,hasRecords:entries.length>0||carrySales>0,
      progress:Math.min(100,Math.max(0,totalSales/o.goal*100)),
      baselinePerHour:Math.ceil(o.goal/o.plannedHours),
      baselinePerShift:Math.ceil(o.goal/o.plannedShifts),
      live:!!live
    };
  };
  API.format=yen;
  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}};
  const get=id=>document.getElementById(id);
  const set=(id,value)=>{const el=get(id);if(el)el.textContent=String(value)};
  const value=(num,unit='')=>num===null||!Number.isFinite(num)?'未確認':num.toLocaleString('ja-JP')+unit;
  const showYen=num=>num===null?'未確認':yen(num);
  const fmtMonth=month=>{const [y,m]=month.split('-');return y+'年'+Number(m)+'月'};
  const describe=result=>{
    if(!result.hasRecords)return'この月の実績は端末内で確認できません。過去の運行シートとはまだ同期していません。';
    if(!result.hoursKnown)return'売上のある日でも、実働時間が未記録の日があります。残りの必要時給は確定できません。';
    if(result.remainingShifts===0&&result.remainingSales>0)return'設定した乗務数を使い切っています。勤務条件の範囲で計画を再確認してください。';
    return'実績と目標の差から計算しています。売上の予測や達成保証ではありません。';
  };
  function render(){
    const o=API.normalizedOptions({
      month:get('goalMonth')?.value,goal:get('targetValue')?.value,
      plannedShifts:get('plannedShifts')?.value,plannedHours:get('plannedHours')?.value,
      assumedFare:get('assumedFare')?.value
    });
    const r=API.compute(read(CAL,{}),read(CAL_SETTINGS,{}),read(OPS,null),o,new Date());
    set('monthLabel',fmtMonth(r.month));
    set('targetTop',yen(r.goal));
    set('actualSales',r.hasRecords?yen(r.totalSales):'未記録');
    set('remainingSales',yen(r.remainingSales));
    set('neededDaily',showYen(r.perShift));
    set('neededHourly',showYen(r.perHour===null&&!r.hasRecords?r.baselinePerHour:r.perHour));
    set('targetShifts',String(r.plannedShifts)+'乗務');
    set('targetHours',value(r.plannedHours,'時間'));
    set('progressText',r.hasRecords?r.progress.toFixed(1)+'%':'記録待ち');
    set('currentDays',String(r.worked)+'乗務');
    set('leftShifts',String(r.remainingShifts)+'乗務');
    set('expectedRides',r.ridesPerShift===null?'未確認':value(r.ridesPerShift,'回/乗務'));
    set('cycleMinutes',r.cycleMinutes===null?'未確認':value(Math.round(r.cycleMinutes*10)/10,'分/回'));
    set('baselineLabel','計画全体の必要売上 '+yen(r.baselinePerHour)+'/時（'+r.plannedHours+'時間で計算）');
    set('dataNotice',describe(r));
    set('sourceStatus',r.live?'営業中の端末記録を反映':'営業カレンダー／端末内記録');
    const bar=get('progressBar');
    if(bar){bar.style.width=r.progress.toFixed(2)+'%';bar.setAttribute('aria-valuenow',r.progress.toFixed(1))}
    const list=get('recentDays');
    if(list){
      list.replaceChildren();
      if(!r.entries.length){
        const p=document.createElement('p');p.className='empty-state';p.textContent='この月の乗務実績はまだありません。営業開始後、既存の記録を読み取ります。';list.append(p);
      }else{
        for(const row of r.entries.slice(-6).reverse()){
          const item=document.createElement('div');item.className='day-row';
          const date=document.createElement('span');date.textContent=row.date.slice(5).replace('-','/');
          const amount=document.createElement('strong');amount.textContent=yen(row.sales);
          const source=document.createElement('small');source.textContent=row.source+(row.hours===null?'・実働時間未記録':'・'+Math.round(row.hours*10)/10+'時間');
          item.append(date,amount,source);list.append(item);
        }
      }
    }
    return r;
  }
  API.mount=()=>{
    const initial=API.normalizedOptions({...read(KEY,{}),month:read(KEY,{}).month||API.defaultMonth()});
    const controls={goalMonth:initial.month,targetValue:initial.goal,plannedShifts:initial.plannedShifts,plannedHours:initial.plannedHours,assumedFare:initial.assumedFare};
    for(const [id,v] of Object.entries(controls)){const el=get(id);if(el)el.value=String(v)}
    const onChange=()=>{
      const opts=API.normalizedOptions({month:get('goalMonth')?.value,goal:get('targetValue')?.value,plannedShifts:get('plannedShifts')?.value,plannedHours:get('plannedHours')?.value,assumedFare:get('assumedFare')?.value});
      try{localStorage.setItem(KEY,JSON.stringify(opts))}catch{}
      render();
    };
    for(const id of Object.keys(controls))get(id)?.addEventListener('change',onChange);
    get('reloadData')?.addEventListener('click',render);
    window.addEventListener('focus',render);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
    window.addEventListener('storage',render);
    render();
  };
  root.YosTaxiRevenueGoalV1=API;
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',API.mount,{once:true});
    else API.mount();
  }
})(globalThis);
