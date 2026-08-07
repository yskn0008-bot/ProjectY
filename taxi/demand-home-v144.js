'use strict';
(()=>{
  const API={};
  const pad=value=>String(value).padStart(2,'0');
  const dateKey=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;

  API.businessDate=(now=new Date())=>{
    const date=new Date(now);
    if(date.getHours()<8)date.setDate(date.getDate()-1);
    return dateKey(date);
  };

  const businessMinute=now=>{
    const minute=now.getHours()*60+now.getMinutes();
    return minute<480?minute+1440:minute;
  };
  const parseWindow=value=>{
    const match=String(value).match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if(!match)return null;
    let start=Number(match[1])*60+Number(match[2]);
    let end=Number(match[3])*60+Number(match[4]);
    if(start<480)start+=1440;
    if(end<480)end+=1440;
    if(end<=start)end+=1440;
    return{label:value,start,end};
  };
  const applies=(event,key)=>event.date<=key&&(event.endDate||event.date)>=key;
  const demandWeight={high:3,medium:2,low:1};
  const confidenceWeight={confirmed:3,provisional:2,unverified:1};

  API.selectDemand=(data,now=new Date())=>{
    const key=API.businessDate(now),minute=businessMinute(now),candidates=[];
    for(const event of Array.isArray(data?.events)?data.events:[]){
      if(!applies(event,key))continue;
      const windows=event.demandWindows?.length?event.demandWindows:['時刻未確認'];
      for(const label of windows){
        const parsed=parseWindow(label);
        const phase=!parsed?2:minute>=parsed.start&&minute<=parsed.end?0:minute<parsed.start?1:3;
        candidates.push({event,window:label,phase,start:parsed?.start??Infinity});
      }
    }
    candidates.sort((a,b)=>a.phase-b.phase||a.start-b.start||
      (demandWeight[b.event.demandLevel]||0)-(demandWeight[a.event.demandLevel]||0)||
      (confidenceWeight[b.event.confidence]||0)-(confidenceWeight[a.event.confidence]||0));
    return candidates[0]||null;
  };

  const labels={high:'高',medium:'中',low:'低',confirmed:'確認済み',provisional:'暫定',unverified:'未確認'};
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const card=(selection,updatedAt)=>{
    if(!selection)return`<section class="yos131-card demand-home" data-demand-state="empty"><div><span>今日の需要</span><strong>本日の登録情報なし</strong><small>営業前に需要カレンダーを確認</small></div><a href="./demand-calendar.html">需要カレンダー</a></section>`;
    const event=selection.event;
    return`<section class="yos131-card demand-home" data-demand-state="ready"><div><span>今日の需要</span><strong>${escape(event.title)}</strong><small>${escape(selection.window)}｜${escape(event.area)}｜需要 ${labels[event.demandLevel]||escape(event.demandLevel)}｜信頼度 ${labels[event.confidence]||escape(event.confidence)}</small><a class="demand-source" href="${escape(event.sourceUrl)}" target="_blank" rel="noopener">公式情報・取得日 ${escape(event.sourceCheckedAt||String(updatedAt||'').slice(0,10))}</a></div><a href="./demand-calendar.html">需要カレンダー</a></section>`;
  };
  const failure=()=>`<section class="yos131-card demand-home" data-demand-state="error"><div><span>今日の需要</span><strong>需要情報を確認できません</strong><small>推測せず、停車後に公式情報を確認</small></div><a href="./demand-calendar.html">需要カレンダー</a></section>`;

  let loading=false;
  async function mount(){
    const drive=document.querySelector('.yos131-drive');
    if(!drive||drive.querySelector('.demand-home')||loading)return;
    loading=true;
    const placeholder=document.createElement('div');
    placeholder.className='demand-home-slot';
    drive.querySelector('.yos131-advice')?.after(placeholder);
    try{
      const response=await fetch('./demand-calendar-v1.json',{cache:'no-cache'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      placeholder.outerHTML=card(API.selectDemand(data,new Date()),data.updatedAt);
    }catch{
      placeholder.outerHTML=failure();
    }finally{loading=false;queueMicrotask(mount)}
  }
  API.mount=mount;
  globalThis.YosTaxiDemandHome=API;
  if(typeof document!=='undefined'){
    const observer=new MutationObserver(()=>mount());
    const start=()=>{observer.observe(document.body,{childList:true,subtree:true});mount()};
    document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
  }
})();
