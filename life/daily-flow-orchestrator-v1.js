'use strict';
(()=>{
  if(window.__yosDailyFlowOrchestratorV1)return;
  window.__yosDailyFlowOrchestratorV1=true;

  const DATA_KEY='yos-life-v1';
  const clean=(value,max=400)=>String(value||'').trim().slice(0,max);
  const addDays=(date,amount)=>{
    const value=new Date(`${date}T12:00:00+09:00`);
    value.setDate(value.getDate()+amount);
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(value);
  };
  const taskIdentity=value=>clean(value,70).replace(/\s+/g,' ').toLocaleLowerCase('ja-JP');

  function prepareNextDay(data,key,important='',preparedAt=new Date().toISOString()){
    if(!data||typeof data!=='object')data={};
    if(!data.days||typeof data.days!=='object')data.days={};
    const day=data.days[key]&&typeof data.days[key]==='object'?data.days[key]:(data.days[key]={});
    const remaining=(Array.isArray(day.tasks)?day.tasks:[])
      .filter(task=>clean(task?.text,70)&&!task?.done)
      .map(task=>({...task,text:clean(task.text,70),done:false}));
    const nextDate=addDays(key,1);
    const next=data.days[nextDate]&&typeof data.days[nextDate]==='object'?data.days[nextDate]:(data.days[nextDate]={});
    next.tasks=Array.isArray(next.tasks)?next.tasks:[];
    const seen=new Set(next.tasks.map(task=>taskIdentity(task?.text)).filter(Boolean));
    const carried=[];
    remaining.forEach(task=>{
      const identity=taskIdentity(task.text);
      if(!identity||seen.has(identity))return;
      seen.add(identity);
      next.tasks.push({...task,done:false,carriedFrom:key});
      carried.push(task.text);
    });
    const firstStep=clean(next.tasks.find(task=>clean(task?.text,70)&&!task?.done)?.text,70);
    const importantText=clean(important,180);
    const summary={preparedAt,nextDate,remainingCount:remaining.length,carriedCount:carried.length,firstStep,important:importantText};
    day.lifeFlow={...(day.lifeFlow&&typeof day.lifeFlow==='object'?day.lifeFlow:{}),nightReset:summary};
    next.lifeFlow={
      ...(next.lifeFlow&&typeof next.lifeFlow==='object'?next.lifeFlow:{}),
      preparedFromNight:{sourceDate:key,preparedAt,carriedCount:carried.length,firstStep,important:importantText}
    };
    return summary;
  }

  window.__yosDailyFlowOrchestratorV1Api=Object.freeze({prepareNextDay});
  if(typeof document==='undefined'||typeof localStorage==='undefined')return;

  const readStore=()=>{try{return JSON.parse(localStorage.getItem(DATA_KEY)||'null')||{days:{}}}catch{return{days:{}}}};
  const calendarDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  const activeLifeDate=data=>{
    const key=clean(data?.activeLifeDate,10);
    return key&&data?.days?.[key]&&!data.days[key].lifeFlow?.endedAt?key:calendarDate();
  };

  function prepareNightResetFromUi(){
    const data=readStore();
    if(!data.days||typeof data.days!=='object')data.days={};
    const key=activeLifeDate(data);
    const important=document.getElementById('lifeTomorrowImportantV1')?.value||data.days?.[key]?.lifeFlow?.tomorrowImportant||'';
    prepareNextDay(data,key,important);
    localStorage.setItem(DATA_KEY,JSON.stringify(data));
  }

  function ensureNightNote(){
    const button=document.getElementById('lifeEndDayV1');
    if(!button||document.getElementById('lifeNightAutoResetV1'))return;
    const note=document.createElement('p');
    note.id='lifeNightAutoResetV1';
    note.className='life-flow-next-v1';
    note.textContent='おやすみ1回で、未完了を翌日に重複なく整理します。';
    button.insertAdjacentElement('beforebegin',note);
  }

  function renderMorningPrepared(){
    const anchor=document.getElementById('lifeMorningNextEventV1');
    if(!anchor)return;
    let node=document.getElementById('lifeMorningPreparedV1');
    if(!node){
      node=document.createElement('p');
      node.id='lifeMorningPreparedV1';
      node.className='life-flow-next-v1 life-flow-prepared-v1';
      anchor.insertAdjacentElement('beforebegin',node);
    }
    const data=readStore();
    const key=activeLifeDate(data);
    const prepared=data.days?.[key]?.lifeFlow?.preparedFromNight;
    if(!prepared?.sourceDate){
      if(!node.hidden)node.hidden=true;
      if(node.textContent)node.textContent='';
      return;
    }
    const text=prepared.firstStep
      ?`昨夜の準備済み｜最初の一歩「${clean(prepared.firstStep,70)}」`
      :'昨夜の準備済み｜未完了はありません';
    if(node.hidden)node.hidden=false;
    if(node.textContent!==text)node.textContent=text;
  }

  function bind(){
    const button=document.getElementById('lifeEndDayV1');
    if(button&&!button.dataset.nightResetOrchestratorV1){
      button.dataset.nightResetOrchestratorV1='1';
      button.addEventListener('click',()=>{
        try{prepareNightResetFromUi()}catch(error){console.warn('Night Reset prepare skipped',error)}
      },{capture:true});
    }
    ensureNightNote();
    renderMorningPrepared();
    return Boolean(button&&document.getElementById('lifeMorningNextEventV1'));
  }

  let attempts=0;
  const timer=setInterval(()=>{
    attempts+=1;
    if(bind()||attempts>=120)clearInterval(timer);
  },50);
  const observer=new MutationObserver(()=>bind());
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('storage',event=>{if(event.key===DATA_KEY)bind()});
})();
