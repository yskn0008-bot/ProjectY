'use strict';
(()=>{
  const LIFE_KEY='yos-life-v1';
  const TASK_CACHE_KEY='yos-task-dashboard-cache-v1';
  const TZ='Asia/Tokyo';
  const clean=(v,max=180)=>typeof v==='string'?v.trim().slice(0,max):'';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
  const dateKey=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ}).format(d);
  const moneyText=v=>Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString('ja-JP')+'円':'';
  const taskText=t=>clean(t?.nextAction,160)||clean(t?.text,160)||clean(String(t?.title||'').replace(/^\d{1,3}\s*[｜|]\s*/u,''),160);

  function lifeFacts(){
    const life=read(LIFE_KEY,null);
    const todayKey=dateKey();
    const day=life?.days?.[todayKey]||life?.days?.[life?.activeLifeDate]||{};
    const prepared=day?.lifeFlow?.preparedFromNight||{};
    const tasks=(Array.isArray(day?.tasks)?day.tasks:[]).filter(t=>taskText(t)&&!t.done);
    const carry=tasks.filter(t=>t?.carriedFrom).map(taskText).filter(Boolean);
    const nightImportant=clean(prepared?.important,180);
    const firstStep=clean(prepared?.firstStep,180);
    return {todayKey,tasks:tasks.map(taskText).filter(Boolean).slice(0,5),carry:[...new Set([nightImportant,...carry].filter(Boolean))].slice(0,4),firstStep};
  }

  function projectTasks(){
    const cache=read(TASK_CACHE_KEY,null);
    const tasks=Array.isArray(cache?.data?.tasks)?cache.data.tasks:[];
    return tasks.filter(t=>['実行中','本人操作','次にやる'].includes(t?.state)).sort((a,b)=>(Number(a?.order)||999)-(Number(b?.order)||999)).map(taskText).filter(Boolean).slice(0,5);
  }

  function build(){
    const life=lifeFacts();
    const shared=window.YOSSharedStateV1?.snapshot?.()||read('yos-shared-state-v1',null)||{};
    const money=shared?.money||{};
    const payments=(Array.isArray(money.upcomingPayments)?money.upcomingPayments:[]).map(tx=>({
      date:clean(tx?.date,10),label:clean(tx?.label,80),amount:money.privacy?null:(Number.isFinite(Number(tx?.amount))?Number(tx.amount):null)
    })).slice(0,5);
    const tasks=[...new Set([...life.tasks,...projectTasks()])].slice(0,5);
    return {
      schema:'yos-morning-brief-bridge-v1',
      generated_at:new Date().toISOString(),
      source:{money:'yos-money-v2',life:'yos-life-v1',my_way:'existing task projection/cache'},
      today:{tasks,carryover:life.carry,first_step:life.firstStep},
      money:{privacy:Boolean(money.privacy),today_usable:money.daily??null,today_usable_text:clean(money.dailyText,40)||(money.daily!==null&&money.daily!==undefined?moneyText(money.daily):''),payments}
    };
  }

  function encode(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    let binary=''; for(const b of bytes)binary+=String.fromCharCode(b);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function returnToShortcut(payload){
    const p=new URLSearchParams(location.search);
    const name=p.get('shortcut')||'Morning Brief';
    const url='shortcuts://run-shortcut?name='+encodeURIComponent(name)+'&input=text&text='+encodeURIComponent('YOS_MORNING_BRIDGE_V1:'+encode(payload));
    location.replace(url);
  }

  window.__yosMorningBriefBridgeV1=Object.freeze({build,encode});
  const p=new URLSearchParams(location.search);
  if(p.get('return')==='shortcut')returnToShortcut(build());
})();