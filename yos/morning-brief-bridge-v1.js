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
    const privacy=Boolean(money.privacy);
    const payments=(Array.isArray(money.upcomingPayments)?money.upcomingPayments:[]).map(tx=>({
      date:clean(tx?.date,10),label:clean(tx?.label,80),amount:privacy?null:(Number.isFinite(Number(tx?.amount))?Number(tx.amount):null)
    })).slice(0,5);
    const tasks=[...new Set([...life.tasks,...projectTasks()])].slice(0,5);
    return {
      schema:'yos-morning-brief-bridge-v1',
      generated_at:new Date().toISOString(),
      source:{money:'yos-money-v2',life:'yos-life-v1',my_way:'existing task projection/cache'},
      today:{tasks,carryover:life.carry,first_step:life.firstStep},
      money:{
        privacy,
        today_usable:privacy?null:(money.daily??null),
        today_usable_text:privacy?'非表示':(clean(money.dailyText,40)||(money.daily!==null&&money.daily!==undefined?moneyText(money.daily):'')),
        payments,
        next_payment:money.nextPayment?{date:clean(money.nextPayment?.date,10),label:clean(money.nextPayment?.label,80),amount:privacy?null:(Number.isFinite(Number(money.nextPayment?.amount))?Number(money.nextPayment.amount):null)}:null,
        next_income:money.nextIncome?{date:clean(money.nextIncome?.date,10),label:clean(money.nextIncome?.label,80),amount:privacy?null:(Number.isFinite(Number(money.nextIncome?.amount))?Number(money.nextIncome.amount):null)}:null,
        projected_after_next_payment:privacy?null:(money.projectedAfterNextPayment??null),
        shortage_possible:Boolean(money.shortagePossible),
        shortfall:privacy?null:(money.shortfall??0)
      }
    };
  }

  function md(value){
    const v=clean(value,10);if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(v))return v;
    const [,m,d]=v.split('-').map(Number);return m+'/'+d;
  }
  function briefMoneyText(payload){
    const money=payload?.money||{};
    const amount=v=>money.privacy?'非表示':moneyText(v);
    const lines=['YOS_MORNING_MONEY_V1'];
    lines.push('今日使える金額：'+(clean(money.today_usable_text,40)||'未算出'));
    if(money.next_payment)lines.push('次の支払い：'+md(money.next_payment.date)+' '+clean(money.next_payment.label,80)+' '+amount(money.next_payment.amount));
    else lines.push('次の支払い：予定なし');
    if(money.next_income)lines.push('次の入金：'+md(money.next_income.date)+' '+clean(money.next_income.label,80)+' '+amount(money.next_income.amount));
    else lines.push('次の入金：予定なし');
    if(money.privacy)lines.push('支払い後：非表示');
    else if(Number.isFinite(Number(money.projected_after_next_payment))){
      const after=Number(money.projected_after_next_payment);
      lines.push(after<0?'支払い後：'+moneyText(Math.abs(after))+'不足見込み':'支払い後：残高見込み '+moneyText(after));
    }
    return lines.join('\\n');
  }

  function encode(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    let binary=''; for(const b of bytes)binary+=String.fromCharCode(b);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function returnToShortcut(payload){
    const p=new URLSearchParams(location.search);
    const name=p.get('shortcut')||'Morning Brief';
    const text=p.get('format')==='brief-text'?briefMoneyText(payload):'YOS_MORNING_BRIDGE_V1:'+encode(payload);
    const url='shortcuts://run-shortcut?name='+encodeURIComponent(name)+'&input=text&text='+encodeURIComponent(text);
    // Give the launching Morning Brief enough time to execute its Stop Shortcut
    // action before Safari starts a second run of the same shortcut.
    setTimeout(()=>location.replace(url),1200);
  }

  window.__yosMorningBriefBridgeV1=Object.freeze({build,encode,briefMoneyText});
  const p=new URLSearchParams(location.search);
  if(p.get('return')==='shortcut')returnToShortcut(build());
})();