'use strict';
(()=>{
  if(globalThis.__yosWeeklyReviewLiveV1)return;
  globalThis.__yosWeeklyReviewLiveV1=true;

  const SCHEMA='yos-weekly-review-v1';
  const SOURCE='yos-life-v1';
  const ROUTINES={
    wake:{label:'朝ルーティン',total:6},
    before:{label:'外出前ルーティン',total:4},
    home:{label:'帰宅後ルーティン',total:4}
  };
  const MECHANICAL=/(確認|チェック|記録|入力|転記|集計|更新|コピー|保存|登録|照合|同期|ログ|開く|起動)/u;
  const clean=(value,max=160)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
  const taskKey=value=>clean(value,100).toLocaleLowerCase('ja-JP');
  const addDays=(date,amount)=>{
    const value=new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate()+amount);
    return value.toISOString().slice(0,10);
  };
  const isSunday=date=>new Date(`${date}T12:00:00Z`).getUTCDay()===0;
  const inWindow=(date,start,end)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=start&&date<=end;
  const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

  function collectSignals(data,endDate){
    const days=asObject(asObject(data).days);
    const startDate=addDays(endDate,-6);
    const dates=Object.keys(days).filter(date=>inWindow(date,startDate,endDate)).sort();
    const tasks=new Map();
    const routines=Object.fromEntries(Object.keys(ROUTINES).map(key=>[key,{recordedDays:0,completed:0,evidenceIds:[]}]));
    for(const date of dates){
      const day=asObject(days[date]);
      const dayTasks=Array.isArray(day.tasks)?day.tasks:[];
      dayTasks.forEach((task,index)=>{
        const label=clean(task?.text,100);
        const key=taskKey(label);
        if(!key)return;
        const group=tasks.get(key)||{label,occurrences:0,doneCount:0,carriedCount:0,dates:new Set(),evidenceIds:[]};
        group.occurrences+=1;
        group.doneCount+=task?.done===true?1:0;
        group.carriedCount+=clean(task?.carriedFrom,10)?1:0;
        group.dates.add(date);
        group.evidenceIds.push(`life:${date}:task:${index}`);
        tasks.set(key,group);
      });
      const dayRoutines=day.routines;
      if(dayRoutines&&typeof dayRoutines==='object'){
        for(const [key,meta] of Object.entries(ROUTINES)){
          if(!Array.isArray(dayRoutines[key]))continue;
          const stat=routines[key];
          stat.recordedDays+=1;
          stat.completed+=Math.min(meta.total,new Set(dayRoutines[key]).size);
          stat.evidenceIds.push(`life:${date}:routine:${key}`);
        }
      }
    }

    const signals=[];
    for(const [key,group] of tasks){
      const distinctDays=group.dates.size;
      const completionRate=group.occurrences?group.doneCount/group.occurrences:0;
      const evidenceIds=[...new Set(group.evidenceIds)];
      if(distinctDays>=4&&group.doneCount===0&&group.carriedCount>=2){
        signals.push({
          id:`life-task-stop:${key}`,domain:'life',label:group.label,occurrences:distinctDays,
          outcome:'negative',value:'low',friction:'high',automatable:false,reversible:true,
          measuredMinutesPerWeek:null,manualStepsPerWeek:group.occurrences,evidenceIds
        });
        continue;
      }
      if(distinctDays>=3&&group.doneCount>=2&&MECHANICAL.test(group.label)){
        signals.push({
          id:`life-task-auto:${key}`,domain:'life',label:group.label,occurrences:distinctDays,
          outcome:'neutral',value:'medium',friction:'medium',automatable:true,reversible:true,
          measuredMinutesPerWeek:null,manualStepsPerWeek:group.occurrences,evidenceIds
        });
        continue;
      }
      if(distinctDays>=2&&group.doneCount>=2&&completionRate>=0.75){
        signals.push({
          id:`life-task-keep:${key}`,domain:'life',label:group.label,occurrences:distinctDays,
          outcome:'positive',value:'medium',friction:'low',automatable:false,reversible:true,
          measuredMinutesPerWeek:null,manualStepsPerWeek:null,evidenceIds
        });
      }
    }
    for(const [key,stat] of Object.entries(routines)){
      const meta=ROUTINES[key];
      const possible=stat.recordedDays*meta.total;
      const completionRate=possible?stat.completed/possible:0;
      if(stat.recordedDays>=3&&completionRate>=0.75){
        signals.push({
          id:`life-routine-keep:${key}`,domain:'life',label:meta.label,occurrences:stat.recordedDays,
          outcome:'positive',value:'medium',friction:'low',automatable:false,reversible:true,
          measuredMinutesPerWeek:null,manualStepsPerWeek:null,evidenceIds:stat.evidenceIds
        });
      }
    }
    return signals;
  }

  function buildReview(data,endDate,generatedAt=new Date().toISOString()){
    const engine=globalThis.YOSWeeklyReviewEngineV1;
    if(!engine||typeof engine.buildWeeklyReview!=='function')throw new Error('Weekly Review engine is unavailable');
    const signals=collectSignals(data,endDate);
    const result=engine.buildWeeklyReview(signals,{maxPerCategory:1,automateMinOccurrences:3,automateMinManualStepsPerWeek:3});
    return{
      schema:SCHEMA,source:SOURCE,generatedAt,windowStart:addDays(endDate,-6),windowEnd:endDate,
      sourceSignalCount:result.sourceSignalCount,continue:result.continue,stop:result.stop,automate:result.automate
    };
  }

  function runIfSunday(data,endDate,generatedAt=new Date().toISOString()){
    if(!isSunday(endDate))return{ran:false,reason:'not-sunday',review:null};
    const store=asObject(data);
    if(!store.days||typeof store.days!=='object')store.days={};
    const day=asObject(store.days[endDate]);
    const flow=asObject(day.lifeFlow);
    const existing=flow.weeklyReview;
    if(existing?.schema===SCHEMA&&existing?.windowEnd===endDate)return{ran:false,reason:'already-ran',review:existing};
    const review=buildReview(store,endDate,generatedAt);
    day.lifeFlow={...flow,weeklyReview:review};
    store.days[endDate]=day;
    return{ran:true,reason:'sunday',review};
  }

  function latestReview(data){
    const days=asObject(asObject(data).days);
    for(const date of Object.keys(days).sort().reverse()){
      const review=days[date]?.lifeFlow?.weeklyReview;
      if(review?.schema===SCHEMA)return review;
    }
    return null;
  }

  const DATA_KEY='yos-life-v1';
  const calendarDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  const activeLifeDate=data=>{
    const key=clean(data?.activeLifeDate,10);
    return key&&data?.days?.[key]&&!data.days[key]?.lifeFlow?.endedAt?key:calendarDate();
  };
  const readStore=()=>{try{return JSON.parse(globalThis.localStorage?.getItem(DATA_KEY)||'null')||{days:{}}}catch{return{days:{}}}};
  const writeStore=data=>globalThis.localStorage?.setItem(DATA_KEY,JSON.stringify(data));

  function runSundayFromNightReset(){
    const data=readStore();
    const key=activeLifeDate(data);
    try{
      const result=runIfSunday(data,key,new Date().toISOString());
      if(result.ran)writeStore(data);
      return result;
    }catch(error){
      globalThis.console?.warn?.('Weekly Review skipped',error);
      return{ran:false,reason:'engine-unavailable',review:null};
    }
  }

  function installNightResetHook(){
    if(!globalThis.document)return false;
    const button=document.getElementById('lifeEndDayV1');
    if(!button||button.dataset.weeklyReviewHook==='1')return Boolean(button);
    button.dataset.weeklyReviewHook='1';
    button.addEventListener('click',runSundayFromNightReset,{capture:true});
    return true;
  }

  function renderCard(){
    if(!globalThis.document)return false;
    const page=document.querySelector('.life-page-v1[data-page="improve"]');
    if(!page)return false;
    let card=document.getElementById('lifeWeeklyReviewV1');
    if(!card){
      card=document.createElement('section');
      card.id='lifeWeeklyReviewV1';
      card.className='card';
      page.prepend(card);
    }
    const review=latestReview(readStore());
    card.replaceChildren();
    const head=document.createElement('div');head.className='card-head';
    const title=document.createElement('h3');title.textContent='週次レビュー';
    const meta=document.createElement('span');meta.textContent=review?`${review.windowStart}〜${review.windowEnd}`:'日曜のNight Resetで自動作成';
    head.append(title,meta);card.appendChild(head);
    for(const [key,label] of [['continue','続ける'],['stop','やめる'],['automate','自動化する']]){
      const row=document.createElement('p');
      row.style.cssText='display:grid;grid-template-columns:92px 1fr;gap:8px;margin:8px 0;align-items:start';
      const name=document.createElement('b');name.textContent=label;
      const value=document.createElement('span');value.textContent=review?.[key]?.[0]?.label||'候補なし';
      row.append(name,value);card.appendChild(row);
    }
    const note=document.createElement('small');
    note.textContent=review?'候補は各1件まで。決定・実行は自動では行いません。':'直近7日分のMY LIFE実データから候補だけを作ります。';
    card.appendChild(note);
    return true;
  }

  function installUi(){
    if(!globalThis.document)return;
    const timer=setInterval(()=>{
      const hook=installNightResetHook();
      const card=renderCard();
      if(hook&&card)clearInterval(timer);
    },50);
    setTimeout(()=>clearInterval(timer),10000);
    globalThis.addEventListener?.('storage',renderCard);
    document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)renderCard()});
  }

  globalThis.__yosWeeklyReviewLiveV1Api=Object.freeze({SCHEMA,SOURCE,collectSignals,buildReview,runIfSunday,latestReview,runSundayFromNightReset});
  installUi();
})();
