'use strict';
(()=>{
  if(window.__yosLifeHomeV1)return;
  window.__yosLifeHomeV1=true;

  const DATA_KEY='yos-life-v1';
  const PAGE_KEY='yos-life-home-page-v1';
  const HJ_SCHEMA='life-hj-export-v1';
  const ROUTINE_TOTAL={wake:6,before:4,home:4};
  const LIFE_CALENDAR_SOURCE='life-calendar-default-v1';
  const DEFAULT_LIFE_CALENDAR=[
    {id:'garbage-resources-mon',title:'缶・ビン・紙・有害ゴミ',category:'garbage',rule:{type:'weekly',weekdays:[1]},time:'08:00',timeLabel:'朝8時まで',source:LIFE_CALENDAR_SOURCE},
    {id:'garbage-burn-tue-fri',title:'燃やすゴミ',category:'garbage',rule:{type:'weekly',weekdays:[2,5]},time:'08:00',timeLabel:'朝8時まで',source:LIFE_CALENDAR_SOURCE},
    {id:'garbage-nonburn-2-4-wed',title:'燃やさないゴミ',category:'garbage',rule:{type:'nth-weekday',weekday:3,nth:[2,4]},time:'08:00',timeLabel:'朝8時まで',source:LIFE_CALENDAR_SOURCE},
    {id:'garbage-pet-2-4-sat',title:'ペットボトル',category:'garbage',rule:{type:'nth-weekday',weekday:6,nth:[2,4]},time:'08:00',timeLabel:'朝8時まで',source:LIFE_CALENDAR_SOURCE},
    {id:'payment-management-maintenance',title:'管理費・修繕費',category:'payment',rule:{type:'monthly',day:5},timeLabel:'支払日',source:LIFE_CALENDAR_SOURCE},
    {id:'income-rent',title:'家賃収入',category:'income',rule:{type:'monthly-next-weekday',day:10},timeLabel:'入金日',source:LIFE_CALENDAR_SOURCE},
    {id:'payment-gas',title:'ガス',category:'payment',rule:{type:'monthly',day:15},timeLabel:'支払日',source:LIFE_CALENDAR_SOURCE},
    {id:'payment-electricity',title:'電気',category:'payment',rule:{type:'monthly',day:26},timeLabel:'支払日',source:LIFE_CALENDAR_SOURCE},
    {id:'payment-car-insurance',title:'車保険',category:'payment',rule:{type:'monthly',day:26},timeLabel:'支払日',source:LIFE_CALENDAR_SOURCE},
    {id:'payment-rent',title:'家賃',category:'payment',rule:{type:'monthly',day:27},timeLabel:'支払日',source:LIFE_CALENDAR_SOURCE},
    {id:'payment-water',title:'水道',category:'payment',rule:{type:'interval-months',day:27,intervalMonths:2,anchorMonth:'2026-07'},timeLabel:'支払日',source:LIFE_CALENDAR_SOURCE},
    {id:'income-taxi-salary',title:'タクシー給与',category:'income',rule:{type:'monthly',day:10},timeLabel:'入金日',source:LIFE_CALENDAR_SOURCE}
  ];
  const PAGE_META={
    home:{label:'ホーム',icon:'⌂'},
    schedule:{label:'予定',icon:'◷'},
    record:{label:'記録',icon:'＋'},
    improve:{label:'改善',icon:'↗'}
  };
  const DOMAIN_NAV=[
    {label:'Home',icon:'⌂',href:'../yos/'},
    {label:'Life',icon:'♡',page:'home'},
    {label:'Money',icon:'¥',href:'../yos/#money'},
    {label:"Hero's Journey",icon:'△',href:'../yos/hj/'},
    {label:'Idea',icon:'✦',href:'../yos/#idea'}
  ];
  let activePage='home';
  let refreshQueued=false;

  const qs=(selector,root=document)=>root.querySelector(selector);
  const qsa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const calendarDateFor=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(value);
  const calendarDate=()=>calendarDateFor(new Date());
  const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const clean=(value,max=400)=>String(value||'').trim().slice(0,max);
  const numberOrNull=(value)=>value===''||value==null?null:Number.isFinite(Number(value))?Number(value):null;
  const addDays=(date,amount)=>{
    const value=new Date(`${date}T12:00:00+09:00`);
    value.setDate(value.getDate()+amount);
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(value);
  };
  const dateParts=date=>{
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));
    if(!match)return null;
    const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
    const value=new Date(Date.UTC(year,month-1,day));
    if(value.getUTCFullYear()!==year||value.getUTCMonth()+1!==month||value.getUTCDate()!==day)return null;
    return{year,month,day,weekday:value.getUTCDay(),nth:Math.floor((day-1)/7)+1};
  };
  const dateString=(year,month,day)=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const nextWeekday=date=>{
    const parts=dateParts(date);
    if(!parts)return'';
    const shift=parts.weekday===6?2:parts.weekday===0?1:0;
    return addDays(date,shift);
  };
  const calendarRules=['weekly','nth-weekday','monthly','monthly-next-weekday','interval-months'];
  const normalizedLifeCalendar=data=>(Array.isArray(data?.lifeCalendar)?data.lifeCalendar:[])
    .filter(item=>item&&typeof item==='object'&&item.enabled!==false&&calendarRules.includes(item.rule?.type))
    .map(item=>({
      ...item,
      id:clean(item.id,80),
      title:clean(item.title,100),
      category:['garbage','payment','income','health','maintenance','other'].includes(item.category)?item.category:'other',
      time:clean(item.time,5),
      timeLabel:clean(item.timeLabel,40)
    }))
    .filter(item=>item.id&&item.title);
  function ensureLifeCalendar(){
    const data=readJson(DATA_KEY,{days:{}});
    if(Array.isArray(data.lifeCalendar))return data.lifeCalendar;
    data.lifeCalendar=DEFAULT_LIFE_CALENDAR.map(item=>({...item,rule:{...item.rule}}));
    localStorage.setItem(DATA_KEY,JSON.stringify(data));
    return data.lifeCalendar;
  }
  function matchesCalendarRule(item,date){
    const parts=dateParts(date),rule=item.rule||{};
    if(!parts)return false;
    if(rule.type==='weekly')return Array.isArray(rule.weekdays)&&rule.weekdays.includes(parts.weekday);
    if(rule.type==='nth-weekday')return Number(rule.weekday)===parts.weekday&&Array.isArray(rule.nth)&&rule.nth.includes(parts.nth);
    if(rule.type==='monthly')return Number(rule.day)===parts.day;
    if(rule.type==='monthly-next-weekday'){
      const base=dateString(parts.year,parts.month,Number(rule.day));
      return dateParts(base)&&nextWeekday(base)===date;
    }
    if(rule.type==='interval-months'){
      const anchor=/^(\d{4})-(\d{2})$/.exec(String(rule.anchorMonth||''));
      if(!anchor||Number(rule.day)!==parts.day)return false;
      const interval=Math.max(1,Number(rule.intervalMonths)||1);
      const months=(parts.year-Number(anchor[1]))*12+parts.month-Number(anchor[2]);
      return months>=0&&months%interval===0;
    }
    return false;
  }
  function lifeCalendarItemsForDate(data,date){
    return normalizedLifeCalendar(data)
      .filter(item=>matchesCalendarRule(item,date))
      .map(item=>({id:item.id,date,title:item.title,category:item.category,time:item.time,timeLabel:item.timeLabel}));
  }
  const activeLifeDate=(data=readJson(DATA_KEY,{days:{}}))=>{
    const key=clean(data.activeLifeDate,10);
    return key&&data.days?.[key]&&!data.days[key].lifeFlow?.endedAt?key:calendarDate();
  };
  const today=()=>activeLifeDate();

  function installDataExtensionGuard(){
    if(window.__yosLifeDataExtensionGuardV1)return;
    window.__yosLifeDataExtensionGuardV1=true;
    const originalSetItem=Storage.prototype.setItem;
    const originalGetItem=Storage.prototype.getItem;
    Storage.prototype.setItem=function(key,value){
      let nextValue=value;
      if(this===localStorage&&key===DATA_KEY){
        try{
          const incoming=JSON.parse(value);
          const current=JSON.parse(originalGetItem.call(this,key)||'null');
          if(incoming&&current){
            if(incoming.days&&current.days){
              Object.entries(current.days).forEach(([date,currentDay])=>{
                const incomingDay=incoming.days[date];
                if(!incomingDay||!currentDay)return;
                ['doneToday','lifeFlow','money','hjSnapshot'].forEach(field=>{
                  if(Object.prototype.hasOwnProperty.call(currentDay,field)&&!Object.prototype.hasOwnProperty.call(incomingDay,field))incomingDay[field]=currentDay[field];
                });
              });
            }
            ['activeLifeDate','lastClosedLifeDate','moneySafety','lifeCalendar'].forEach(field=>{
              if(Object.prototype.hasOwnProperty.call(current,field)&&!Object.prototype.hasOwnProperty.call(incoming,field))incoming[field]=current[field];
            });
          }
          nextValue=JSON.stringify(incoming);
        }catch{}
      }
      return originalSetItem.call(this,key,nextValue);
    };
  }

  function loadStyles(){
    if(!document.getElementById('lifeHomeV1Styles')){
      const base=document.createElement('link');
      base.id='lifeHomeV1Styles';
      base.rel='stylesheet';
      base.href='./home-v1.css?v=4';
      document.head.appendChild(base);
    }
    if(!document.getElementById('lifeHomePriorityV1Styles')){
      const priority=document.createElement('link');
      priority.id='lifeHomePriorityV1Styles';
      priority.rel='stylesheet';
      priority.href='./home-priority-v1.css?v=4';
      document.head.appendChild(priority);
    }
  }

  function dayData(){
    const data=readJson(DATA_KEY,{days:{}});
    const day=data.days?.[today()]||{};
    return {
      schedule:Array.isArray(day.schedule)?day.schedule:[],
      tasks:Array.isArray(day.tasks)?day.tasks:[],
      routines:day.routines||{wake:[],before:[],home:[]},
      checkin:day.checkin||{sleep:'',health:'',mood:''},
      note:day.note||'',
      doneToday:String(day.doneToday||''),
      lifeFlow:day.lifeFlow&&typeof day.lifeFlow==='object'?day.lifeFlow:{},
      money:day.money&&typeof day.money==='object'?day.money:{},
      hjSnapshot:day.hjSnapshot&&typeof day.hjSnapshot==='object'?day.hjSnapshot:null
    };
  }

  function updateToday(mutator){
    const data=readJson(DATA_KEY,{days:{},activeGroup:'wake'});
    if(!data.days||typeof data.days!=='object')data.days={};
    const key=today();
    if(!data.days[key]||typeof data.days[key]!=='object')data.days[key]={};
    mutator(data.days[key]);
    localStorage.setItem(DATA_KEY,JSON.stringify(data));
    queueRefresh();
  }

  function completion(day){
    const routineDone=Object.values(day.routines).reduce((sum,list)=>sum+(Array.isArray(list)?list.length:0),0);
    const routineTotal=Object.values(ROUTINE_TOTAL).reduce((sum,value)=>sum+value,0);
    const tasks=day.tasks.filter(task=>String(task.text||'').trim());
    const taskDone=tasks.filter(task=>task.done).length;
    const total=routineTotal+tasks.length;
    return total?Math.round((routineDone+taskDone)/total*100):0;
  }

  function habitProgress(day){
    const done=Object.values(day.routines).reduce((sum,list)=>sum+(Array.isArray(list)?list.length:0),0);
    const total=Object.values(ROUTINE_TOTAL).reduce((sum,value)=>sum+value,0);
    return {done,total,pct:total?Math.round(done/total*100):0};
  }

  function focusTask(day){
    let index=day.tasks.findIndex(task=>String(task.text||'').trim()&&!task.done);
    if(index<0)index=day.tasks.findIndex(task=>String(task.text||'').trim());
    if(index<0)index=0;
    const task=day.tasks[index]||{text:'',done:false};
    return {index,text:String(task.text||''),done:Boolean(task.done)};
  }

  function fmtTime(value){
    if(!value)return'--:--';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return String(value).slice(11,16)||'--:--';
    return new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(date);
  }

  function upcomingEvent(day){
    const now=Date.now();
    return [...day.schedule]
      .filter(event=>event.start&&new Date(event.end||event.start).getTime()>=now)
      .sort((a,b)=>new Date(a.start)-new Date(b.start))[0]||null;
  }

  function focusDetail(day){
    const event=upcomingEvent(day);
    const open=day.tasks.filter(task=>String(task.text||'').trim()&&!task.done).length;
    if(event)return`次の予定 ${fmtTime(event.start)}「${event.title||'予定'}」・残り${open}件`;
    return open?`未完了は${open}件。今はこの1件だけに集中。`:'今日の予定に余白があります。';
  }

  function statusMessage(day){
    const sleep=Number(day.checkin.sleep),health=Number(day.checkin.health),mood=Number(day.checkin.mood);
    if(!sleep&&!health&&!mood)return{tone:'neutral',title:'今日はここだけ見れば大丈夫',detail:'記録したい時だけ、下の「記録」から追加できます。'};
    if(health&&health<=2)return{tone:'rest',title:'今日は回復を優先',detail:'予定を減らし、安全と休養を最優先にします。'};
    if(sleep&&sleep<6)return{tone:'rest',title:'睡眠不足を前提に動く',detail:'重要なことを一つに絞り、無理を増やしません。'};
    if(mood&&mood<=2)return{tone:'care',title:'小さく始めれば十分',detail:'気分を変えようとせず、できる一歩だけ選びます。'};
    return{tone:'good',title:'今日の流れは整えられる',detail:'次の一つだけに集中して進めます。'};
  }

  function toggleTaskAt(index){
    const beforeDay=dayData();
    const before=beforeDay.tasks[index]||{text:'',done:false};
    if(!String(before.text||'').trim())return;
    if(typeof window.__yosLifeToggleTaskV1==='function')window.__yosLifeToggleTaskV1(index);
    else updateToday(day=>{
      day.tasks=Array.isArray(day.tasks)?day.tasks:[];
      while(day.tasks.length<=index)day.tasks.push({text:'',done:false,category:'personal'});
      day.tasks[index].done=!day.tasks[index].done;
    });
    if(!before.done&&!dayData().doneToday){
      saveDoneToday(String(before.text||'').trim());
    }
  }

  function toggleFocusTask(){
    toggleTaskAt(focusTask(dayData()).index);
  }

  function saveDoneToday(value){
    updateToday(day=>{day.doneToday=String(value||'').trim()});
  }

  function firstEvent(day){
    return [...(day.schedule||[])]
      .filter(event=>event?.start)
      .sort((a,b)=>new Date(a.start)-new Date(b.start))[0]||null;
  }

  function readMoneySafety(data){
    const value=data.moneySafety&&typeof data.moneySafety==='object'?data.moneySafety:{};
    return {
      currentBalance:clean(value.currentBalance,40),
      nextIncomeDate:clean(value.nextIncomeDate,10),
      requiredPayments:clean(value.requiredPayments,120),
      protectedMoney:clean(value.protectedMoney,40),
      freeMoney:clean(value.freeMoney,40),
      todayBudget:clean(value.todayBudget,40),
      nextPayment:clean(value.nextPayment,120),
      danger:['none','watch','urgent'].includes(value.danger)?value.danger:'none'
    };
  }

  function buildSnapshot(date,day){
    const flow=day.lifeFlow||{};
    return {
      schema:HJ_SCHEMA,
      date,
      generatedAt:new Date().toISOString(),
      sleepHours:numberOrNull(day.checkin?.sleep),
      health:numberOrNull(day.checkin?.health),
      mood:numberOrNull(day.checkin?.mood),
      schedule:(day.schedule||[]).map(event=>({
        title:clean(event.title,140),
        start:clean(event.start,40),
        end:clean(event.end,40),
        category:clean(event.category,40)
      })),
      habits:{
        wake:{completed:[...(day.routines?.wake||[])],total:ROUTINE_TOTAL.wake},
        before:{completed:[...(day.routines?.before||[])],total:ROUTINE_TOTAL.before},
        home:{completed:[...(day.routines?.home||[])],total:ROUTINE_TOTAL.home}
      },
      doneToday:clean(day.doneToday,100),
      selfReport:{
        fact:clean(flow.fact),
        choice:clean(flow.choice),
        result:clean(flow.result),
        discomfort:clean(flow.discomfort),
        spentToday:clean(day.money?.spentToday,40),
        remainingTasks:(day.tasks||[]).filter(task=>clean(task.text,70)&&!task.done).map(task=>clean(task.text,70)),
        tomorrowImportant:clean(flow.tomorrowImportant,180)
      }
    };
  }

  function fieldValue(id){return document.getElementById(id)?.value||''}
  function writeField(id,value){
    const node=document.getElementById(id);
    if(node&&document.activeElement!==node)node.value=value??'';
  }

  function saveMorning(){
    const data=readJson(DATA_KEY,{days:{},activeGroup:'wake'});
    if(!data.days||typeof data.days!=='object')data.days={};
    const current=activeLifeDate(data);
    const key=data.days?.[current]?.lifeFlow?.startedAt&&!data.days[current].lifeFlow.endedAt?current:calendarDate();
    const day=data.days[key]&&typeof data.days[key]==='object'?data.days[key]:(data.days[key]={});
    day.checkin={
      ...(day.checkin||{}),
      sleep:clean(fieldValue('lifeMorningSleepV1'),5),
      health:clean(fieldValue('lifeMorningHealthV1'),1),
      mood:clean(fieldValue('lifeMorningMoodV1'),1)
    };
    day.tasks=Array.isArray(day.tasks)?day.tasks:[];
    while(day.tasks.length<3)day.tasks.push({text:'',done:false,category:'personal'});
    day.tasks[0]={...day.tasks[0],text:clean(fieldValue('lifeMorningTaskV1'),70),category:day.tasks[0].category||'personal'};
    day.lifeFlow={
      ...(day.lifeFlow||{}),
      workMode:['work','rest','unknown'].includes(fieldValue('lifeWorkModeV1'))?fieldValue('lifeWorkModeV1'):'unknown',
      protect:clean(fieldValue('lifeProtectV1'),180),
      desiredScene:clean(fieldValue('lifeDesiredSceneV1'),180),
      startedAt:day.lifeFlow?.startedAt||new Date().toISOString(),
      endedAt:''
    };
    data.moneySafety={
      ...(data.moneySafety&&typeof data.moneySafety==='object'?data.moneySafety:{}),
      currentBalance:clean(fieldValue('lifeMoneyBalanceV1'),40),
      nextIncomeDate:clean(fieldValue('lifeMoneyIncomeDateV1'),10),
      requiredPayments:clean(fieldValue('lifeMoneyRequiredV1'),120),
      protectedMoney:clean(fieldValue('lifeMoneyProtectedV1'),40),
      freeMoney:clean(fieldValue('lifeMoneyFreeV1'),40),
      todayBudget:clean(fieldValue('lifeMoneyBudgetV1'),40),
      nextPayment:clean(fieldValue('lifeMoneyNextPaymentV1'),120),
      danger:['none','watch','urgent'].includes(fieldValue('lifeMoneyDangerV1'))?fieldValue('lifeMoneyDangerV1'):'none'
    };
    data.activeLifeDate=key;
    localStorage.setItem(DATA_KEY,JSON.stringify(data));
    localStorage.setItem(PAGE_KEY,'home');
    location.reload();
  }

  function saveNight(){
    const data=readJson(DATA_KEY,{days:{},activeGroup:'wake'});
    if(!data.days||typeof data.days!=='object')data.days={};
    const key=activeLifeDate(data);
    const day=data.days[key]&&typeof data.days[key]==='object'?data.days[key]:(data.days[key]={});
    day.doneToday=clean(fieldValue('lifeNightDoneV1'),100);
    day.money={...(day.money||{}),spentToday:clean(fieldValue('lifeNightSpentV1'),40)};
    day.lifeFlow={
      ...(day.lifeFlow||{}),
      fact:clean(fieldValue('lifeNightFactV1')),
      choice:clean(fieldValue('lifeNightChoiceV1')),
      result:clean(fieldValue('lifeNightResultV1')),
      discomfort:clean(fieldValue('lifeNightDiscomfortV1')),
      tomorrowImportant:clean(fieldValue('lifeTomorrowImportantV1'),180),
      endedAt:new Date().toISOString()
    };
    day.hjSnapshot=buildSnapshot(key,day);
    data.activeLifeDate=key;
    data.lastClosedLifeDate=key;
    localStorage.setItem(DATA_KEY,JSON.stringify(data));
    localStorage.setItem(PAGE_KEY,'home');
    location.reload();
  }

  async function copySnapshot(){
    const data=readJson(DATA_KEY,{days:{}});
    const key=clean(data.lastClosedLifeDate,10)||activeLifeDate(data);
    const snapshot=data.days?.[key]?.hjSnapshot;
    if(!snapshot)return;
    const value=JSON.stringify(snapshot,null,2);
    try{await navigator.clipboard.writeText(value)}catch{return}
    const button=document.getElementById('lifeCopySnapshotV1');
    if(button){button.textContent='コピー済み';setTimeout(()=>{button.textContent='事実スナップショットをコピー'},1200)}
  }

  function buildLifeCalendar(){
    const section=document.createElement('section');
    section.id='lifeCalendarV1';
    section.className='life-calendar-v1 card';
    section.innerHTML=`
      <header class="life-calendar-head-v1">
        <div><small>LIFE CALENDAR</small><h2>生活カレンダー</h2><p>覚えるのはLife。今日は必要なことだけ。</p></div>
        <span id="lifeCalendarDateV1"></span>
      </header>
      <div class="life-calendar-glance-v1">
        <section aria-labelledby="lifeCalendarTodayLabelV1"><h3 id="lifeCalendarTodayLabelV1">今日</h3><div id="lifeCalendarTodayV1"></div></section>
        <section aria-labelledby="lifeCalendarTomorrowLabelV1"><h3 id="lifeCalendarTomorrowLabelV1">明日</h3><div id="lifeCalendarTomorrowV1"></div></section>
        <section aria-labelledby="lifeCalendarSoonLabelV1"><h3 id="lifeCalendarSoonLabelV1">もうすぐ</h3><div id="lifeCalendarSoonV1"></div></section>
      </div>
      <details class="life-calendar-details-v1">
        <summary>予定を見る</summary>
        <div id="lifeCalendarUpcomingV1"></div>
      </details>
      <p class="life-calendar-note-v1">金額と支払い済み／未払いは、確認できる情報がある時だけ表示します。通知はYOSの役割です。</p>`;
    return section;
  }

  function dateLabel(date){
    const value=new Date(`${date}T12:00:00+09:00`);
    return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short',timeZone:'Asia/Tokyo'}).format(value);
  }

  function calendarItemDisplay(item,now=new Date()){
    const label=item.timeLabel||'';
    const time=/^(\d{2}):(\d{2})$/.exec(item.time||'');
    if(!time)return{past:false,label};
    const currentDate=calendarDateFor(now);
    let past=item.date<currentDate;
    if(item.date===currentDate){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('ja-JP',{
        hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Tokyo'
      }).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
      const currentMinutes=Number(parts.hour)*60+Number(parts.minute);
      const deadlineMinutes=Number(time[1])*60+Number(time[2]);
      past=currentMinutes>deadlineMinutes;
    }
    return{
      past,
      label:past&&label.endsWith('まで')?`${label.slice(0,-2)}を過ぎました`:label
    };
  }

  function calendarRow(item,showDate=false){
    const row=document.createElement('div');
    row.className=`life-calendar-row-v1 ${item.category}`;
    const display=calendarItemDisplay(item);
    if(display.past){
      row.classList.add('past');
      row.dataset.status='past';
    }
    const marker=document.createElement('span');
    marker.className='life-calendar-marker-v1';
    marker.setAttribute('aria-hidden','true');
    const copy=document.createElement('div');
    if(showDate){
      const date=document.createElement('small');
      date.textContent=dateLabel(item.date);
      copy.appendChild(date);
    }
    const title=document.createElement('strong');
    title.textContent=item.title;
    copy.appendChild(title);
    const meta=document.createElement('span');
    meta.textContent=display.label;
    row.append(marker,copy,meta);
    return row;
  }

  function renderCalendarList(target,items,{showDate=false,empty='必要な予定はありません'}={}){
    if(!target)return;
    target.replaceChildren();
    target.className='life-calendar-list-v1';
    if(!items.length){
      const message=document.createElement('p');
      message.className='life-calendar-empty-v1';
      message.textContent=empty;
      target.appendChild(message);
      return;
    }
    items.forEach(item=>target.appendChild(calendarRow(item,showDate)));
  }

  function upcomingCalendarItems(data,start,fromDay,toDay){
    const items=[];
    for(let offset=fromDay;offset<=toDay;offset+=1){
      const date=addDays(start,offset);
      items.push(...lifeCalendarItemsForDate(data,date));
    }
    return items;
  }

  function refreshLifeCalendar(){
    const root=document.getElementById('lifeCalendarV1');
    if(!root)return;
    const data=readJson(DATA_KEY,{days:{}}),date=calendarDate(),tomorrow=addDays(date,1);
    const todayItems=lifeCalendarItemsForDate(data,date);
    const tomorrowItems=lifeCalendarItemsForDate(data,tomorrow);
    const soonItems=upcomingCalendarItems(data,date,2,14).slice(0,4);
    const allItems=upcomingCalendarItems(data,date,0,31);
    const label=document.getElementById('lifeCalendarDateV1');
    if(label)label.textContent=dateLabel(date);
    renderCalendarList(document.getElementById('lifeCalendarTodayV1'),todayItems);
    renderCalendarList(document.getElementById('lifeCalendarTomorrowV1'),tomorrowItems);
    renderCalendarList(document.getElementById('lifeCalendarSoonV1'),soonItems,{showDate:true,empty:'近い期限はありません'});
    renderCalendarList(document.getElementById('lifeCalendarUpcomingV1'),allItems,{showDate:true,empty:'31日以内の予定はありません'});
  }

  function buildDailyFlow(){
    const section=document.createElement('section');
    section.id='lifeDailyFlowV1';
    section.className='life-daily-flow-v1 card';
    section.innerHTML=`
      <header class="life-flow-head-v1">
        <div><small>起床から就寝までを一日として記録</small><h2 id="lifeFlowTitleV1">おはよう</h2><p id="lifeFlowMetaV1"></p></div>
        <span id="lifeFlowDateV1"></span>
      </header>
      <div class="life-flow-tabs-v1" role="tablist" aria-label="一日の入口">
        <button type="button" data-life-flow-tab="morning" class="active">おはよう</button>
        <button type="button" data-life-flow-tab="night">おやすみ</button>
      </div>
      <section class="life-flow-pane-v1 active" data-life-flow-pane="morning">
        <p id="lifeMorningNextEventV1" class="life-flow-next-v1"></p>
        <div class="life-flow-three-v1">
          <label>勤務／休み<select id="lifeWorkModeV1"><option value="unknown">まだ決めない</option><option value="work">勤務</option><option value="rest">休み</option></select></label>
          <label>睡眠（任意）<input id="lifeMorningSleepV1" type="number" min="0" max="24" step="0.5" inputmode="decimal" placeholder="時間"></label>
        </div>
        <div class="life-rating-field-v1"><span>体調</span><input id="lifeMorningHealthV1" type="hidden"><div class="life-rating-v1" role="group" aria-label="体調 1〜5">${[1,2,3,4,5].map(value=>`<button type="button" data-life-rating-target="lifeMorningHealthV1" data-life-rating-value="${value}" aria-pressed="false">${value}</button>`).join('')}</div></div>
        <div class="life-rating-field-v1"><span>気分</span><input id="lifeMorningMoodV1" type="hidden"><div class="life-rating-v1" role="group" aria-label="気分 1〜5">${[1,2,3,4,5].map(value=>`<button type="button" data-life-rating-target="lifeMorningMoodV1" data-life-rating-value="${value}" aria-pressed="false">${value}</button>`).join('')}</div></div>
        <details class="life-money-v1">
          <summary><span>Money｜今日の生活安全</span><b id="lifeMoneySummaryV1">未入力</b></summary>
          <div class="life-money-grid-v1">
            <label>現在残高<input id="lifeMoneyBalanceV1" inputmode="decimal" placeholder="自分で確認した額"></label>
            <label>次の収入日<input id="lifeMoneyIncomeDateV1" type="date"></label>
            <label>必須支払い<input id="lifeMoneyRequiredV1" maxlength="120" placeholder="合計または項目"></label>
            <label>守るお金<input id="lifeMoneyProtectedV1" inputmode="decimal"></label>
            <label>自由に使えるお金<input id="lifeMoneyFreeV1" inputmode="decimal"></label>
            <label>今日使える目安<input id="lifeMoneyBudgetV1" inputmode="decimal"></label>
            <label>次の支払い<input id="lifeMoneyNextPaymentV1" maxlength="120" placeholder="日付・項目・額"></label>
            <label>危険の有無<select id="lifeMoneyDangerV1"><option value="none">危険なし</option><option value="watch">要確認</option><option value="urgent">急ぎで確認</option></select></label>
          </div>
          <p>入力した事実だけを表示します。投資・税務・支払い判断を自動で断定しません。</p>
        </details>
        <label>今日守るもの1つ<input id="lifeProtectV1" maxlength="180" placeholder="例：睡眠、安全、約束"></label>
        <label>今日やること1つ<input id="lifeMorningTaskV1" maxlength="70" placeholder="一件だけ"></label>
        <label>今日の最後に迎えたいシーン1つ<input id="lifeDesiredSceneV1" maxlength="180" placeholder="例：歯を磨いて横になる"></label>
        <button id="lifeStartDayV1" type="button" class="life-flow-primary-v1">今日を始める</button>
      </section>
      <section class="life-flow-pane-v1" data-life-flow-pane="night">
        <p id="lifeNightSummaryV1" class="life-flow-next-v1"></p>
        <label>今日できたこと<input id="lifeNightDoneV1" maxlength="100" placeholder="小さくても、そのまま"></label>
        <label>今日使った金額<input id="lifeNightSpentV1" inputmode="decimal" placeholder="確認できる額"></label>
        <div id="lifeRemainingTasksV1" class="life-remaining-v1"></div>
        <label>今日の事実<textarea id="lifeNightFactV1" rows="2" maxlength="400" placeholder="実際に起きたこと"></textarea></label>
        <label>自分が選んだこと<textarea id="lifeNightChoiceV1" rows="2" maxlength="400"></textarea></label>
        <label>確認できた結果<textarea id="lifeNightResultV1" rows="2" maxlength="400"></textarea></label>
        <label>違和感・まだ分からないこと<textarea id="lifeNightDiscomfortV1" rows="2" maxlength="400"></textarea></label>
        <label>明日の重要予定<input id="lifeTomorrowImportantV1" maxlength="180" placeholder="一件だけ。なければ空欄"></label>
        <button id="lifeEndDayV1" type="button" class="life-flow-primary-v1 night">おやすみ</button>
        <details class="life-snapshot-v1"><summary>HJへ渡せる事実を確認</summary><pre id="lifeSnapshotPreviewV1"></pre><button id="lifeCopySnapshotV1" type="button">事実スナップショットをコピー</button></details>
      </section>`;
    section.addEventListener('click',event=>{
      const rating=event.target.closest('[data-life-rating-target]');
      if(rating){
        const target=document.getElementById(rating.dataset.lifeRatingTarget);
        if(target)target.value=rating.dataset.lifeRatingValue;
        refreshLifeRating(rating.dataset.lifeRatingTarget,rating.dataset.lifeRatingValue);
        return;
      }
      const tab=event.target.closest('[data-life-flow-tab]');
      if(tab){activateFlowPane(tab.dataset.lifeFlowTab);return}
      if(event.target.closest('#lifeStartDayV1')){saveMorning();return}
      if(event.target.closest('#lifeEndDayV1')){saveNight();return}
      if(event.target.closest('#lifeCopySnapshotV1'))copySnapshot();
    });
    return section;
  }

  function refreshLifeRating(targetId,value){
    qsa(`[data-life-rating-target="${targetId}"]`).forEach(button=>{
      const active=button.dataset.lifeRatingValue===String(value||'');
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }

  function activateFlowPane(name){
    const key=name==='night'?'night':'morning';
    qsa('[data-life-flow-pane]').forEach(node=>node.classList.toggle('active',node.dataset.lifeFlowPane===key));
    qsa('[data-life-flow-tab]').forEach(node=>node.classList.toggle('active',node.dataset.lifeFlowTab===key));
  }

  function refreshDailyFlow(){
    const root=document.getElementById('lifeDailyFlowV1');
    if(!root)return;
    const data=readJson(DATA_KEY,{days:{}}),date=activeLifeDate(data),day=data.days?.[date]||{},flow=day.lifeFlow||{},money=readMoneySafety(data);
    const open=Boolean(flow.startedAt&&!flow.endedAt);
    const closedDate=clean(data.lastClosedLifeDate,10),closed=closedDate?data.days?.[closedDate]:null;
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value};
    set('lifeFlowTitleV1',open?'今日を生きる':closed&&closedDate===calendarDate()?'今日を閉じました':'おはよう');
    set('lifeFlowMetaV1',open?'始めた日の続きです。0時で分けません。':'今の状態を確認し、今日の一手を1つ決めます。');
    set('lifeFlowDateV1',date);
    const next=upcomingEvent({...day,schedule:Array.isArray(day.schedule)?day.schedule:[]});
    set('lifeMorningNextEventV1',next?`次の予定 ${fmtTime(next.start)}「${clean(next.title,80)||'予定'}」`:'次の予定は未登録です。');
    writeField('lifeWorkModeV1',flow.workMode||'unknown');
    writeField('lifeMorningSleepV1',day.checkin?.sleep||'');
    writeField('lifeMorningHealthV1',day.checkin?.health||'');
    writeField('lifeMorningMoodV1',day.checkin?.mood||'');
    refreshLifeRating('lifeMorningHealthV1',day.checkin?.health||'');
    refreshLifeRating('lifeMorningMoodV1',day.checkin?.mood||'');
    writeField('lifeProtectV1',flow.protect||'');
    writeField('lifeMorningTaskV1',focusTask({...day,tasks:Array.isArray(day.tasks)?day.tasks:[]}).text);
    writeField('lifeDesiredSceneV1',flow.desiredScene||'');
    writeField('lifeMoneyBalanceV1',money.currentBalance);
    writeField('lifeMoneyIncomeDateV1',money.nextIncomeDate);
    writeField('lifeMoneyRequiredV1',money.requiredPayments);
    writeField('lifeMoneyProtectedV1',money.protectedMoney);
    writeField('lifeMoneyFreeV1',money.freeMoney);
    writeField('lifeMoneyBudgetV1',money.todayBudget);
    writeField('lifeMoneyNextPaymentV1',money.nextPayment);
    writeField('lifeMoneyDangerV1',money.danger);
    const danger={none:'危険なし',watch:'要確認',urgent:'急ぎで確認'}[money.danger];
    set('lifeMoneySummaryV1',money.todayBudget?`今日 ${money.todayBudget}｜${danger}`:danger);
    writeField('lifeNightDoneV1',day.doneToday||'');
    writeField('lifeNightSpentV1',day.money?.spentToday||'');
    writeField('lifeNightFactV1',flow.fact||'');
    writeField('lifeNightChoiceV1',flow.choice||'');
    writeField('lifeNightResultV1',flow.result||'');
    writeField('lifeNightDiscomfortV1',flow.discomfort||'');
    writeField('lifeTomorrowImportantV1',flow.tomorrowImportant||'');
    const remaining=(day.tasks||[]).filter(task=>clean(task.text,70)&&!task.done).map(task=>clean(task.text,70));
    set('lifeRemainingTasksV1',remaining.length?`残っているタスク：${remaining.join('、')}`:'残っているタスク：なし');
    const tomorrow=firstEvent(data.days?.[addDays(date,1)]||{});
    set('lifeNightSummaryV1',tomorrow?`明日の予定 ${fmtTime(tomorrow.start)}「${clean(tomorrow.title,80)||'予定'}」`:'明日の予定は未登録です。');
    const snapshot=day.hjSnapshot||closed?.hjSnapshot;
    set('lifeSnapshotPreviewV1',snapshot?JSON.stringify(snapshot,null,2):'おやすみを保存すると、本人が入力した事実だけのスナップショットを作ります。');
    if(open)activateFlowPane('night');
  }

  function buildDashboard(){
    const section=document.createElement('section');
    section.id='lifeHomeDashboardV1';
    section.className='home-dashboard-v1 life-planner-v2';
    section.innerHTML=`
      <section class="life-day-ribbon-v2">
        <header><div><small>今日</small><h2>今日のくらし</h2><p>暮らしを、ひとつずつ整える。</p></div><button type="button" data-open-page="schedule" aria-label="カレンダーを開く"><span aria-hidden="true">◷</span><small>カレンダー</small><b id="lifeTodayDateV2">----</b></button></header>
        <div id="homeWeekV2" class="life-week-v2" aria-label="今週のカレンダー"></div>
      </section>
      <section class="life-paper-grid-v2">
        <article class="life-schedule-sheet-v2"><header><h3>今日の予定</h3><button type="button" data-open-page="schedule">すべて ›</button></header><div id="homeSchedulePreviewV1">予定を確認しています</div></article>
        <article class="life-task-sheet-v2"><header><div><small>次のタスク</small><h3>今日のタスク</h3></div><button type="button" data-open-page="schedule" aria-label="タスクを追加">＋</button></header><div id="homeTaskListV2"></div></article>
      </section>
      <section class="life-rhythm-v2">
        <header><div><small>暮らしのリズム</small><h3>習慣 <span id="homeHabitV1">0/14</span></h3></div><button type="button" data-open-page="improve">整える ›</button></header>
        <div id="homeHabitGroupsV2" class="life-habit-groups-v2"></div><i><em id="homeHabitBarV1"></em></i>
      </section>
      <section class="life-memo-v2">
        <button type="button" class="life-memo-copy-v2" data-open-page="record"><small>メモ</small><strong id="homeMemoPreviewV2">まだありません</strong><span>書き留める ›</span></button>
        <div class="life-plant-v2" aria-hidden="true"><svg viewBox="0 0 92 84"><path d="M43 69c-8-18-4-37 10-54M45 48c-11-14-21-15-28-15 3 13 12 21 28 22M50 36c5-13 14-19 25-20-1 14-9 23-25 26M43 69c9-13 20-17 32-15-3 14-13 21-31 21" fill="none" stroke="#5f8668" stroke-width="4" stroke-linecap="round"/><path d="M31 67h29l-4 15H35z" fill="#b88054"/><path d="M29 67h33" stroke="#77543d" stroke-width="4" stroke-linecap="round"/></svg></div>
      </section>
      <button class="life-yos-companion-v2" type="button" data-open-page="improve"><span class="life-yos-face-v2" aria-hidden="true">••</span><span><b>YOSに相談</b><small>今日の暮らしを、一緒に整える。</small></span><i>›</i></button>
      <div hidden><span id="homeCompletionV1">0%</span><span id="homeStatusTitleV1"></span><span id="homeStatusDetailV1"></span><span id="homeRingV1"></span><button type="button" id="homeFocusDoneV1"></button><span id="homeFocusValueV1"></span><span id="homeFocusDetailV1"></span><span id="homeSleepV1"></span><span id="homeHealthV1"></span><span id="homeMoodV1"></span><span id="homeMoneyBudgetV1"></span><span id="homeMoneyDetailV1"></span><span id="homeDoneValueV1"></span></div>`;

    section.addEventListener('click',event=>{
      const taskButton=event.target.closest('[data-home-task-index]');
      if(taskButton){toggleTaskAt(Number(taskButton.dataset.homeTaskIndex));return}
      const pageButton=event.target.closest('[data-open-page]');
      if(pageButton){activatePage(pageButton.dataset.openPage,true);return}
      if(event.target.closest('#homeFocusDoneV1')){toggleFocusTask();return}
    });
    return section;
  }

  function cardByTitle(cards,text){return cards.find(card=>qs('h3',card)?.textContent.includes(text));}

  function activatePage(key,remember=false){
    if(!PAGE_META[key])key='home';
    activePage=key;
    qsa('.life-page-v1').forEach(page=>page.classList.toggle('active',page.dataset.page===key));
    qsa('#lifeBottomNavV1 button').forEach(button=>button.classList.toggle('active',button.dataset.page===key));
    const subtitle=qs('.brand p');
    if(subtitle){
      const copy={home:'今日の全体像',schedule:'予定とやること',record:'体調と気分',improve:'習慣と相談'};
      subtitle.textContent=copy[key];
    }
    if(remember)localStorage.setItem(PAGE_KEY,key);
    window.scrollTo({top:0,behavior:'smooth'});
    queueRefresh();
  }

  function renderNav(nav){
    nav.id='lifeBottomNavV1';
    nav.innerHTML=DOMAIN_NAV.map(item=>item.href
      ?`<a href="${item.href}"><span>${item.icon}</span><b>${item.label}</b></a>`
      :`<button type="button" class="nav active" data-page="${item.page}"><span>${item.icon}</span><b>${item.label}</b></button>`).join('')+
      '<button type="button" class="life-nav-compat-v1" data-page="record" tabindex="-1" aria-hidden="true"></button>';
    nav.addEventListener('click',event=>{
      const button=event.target.closest('button[data-page]');
      if(button)activatePage(button.dataset.page,true);
    });
  }

  function refreshDashboard(){
    const root=document.getElementById('lifeHomeDashboardV1');
    if(!root)return;
    const day=dayData(),percent=completion(day),status=statusMessage(day),focus=focusTask(day),habit=habitProgress(day);
    const ring=document.getElementById('homeRingV1');
    ring?.style.setProperty('--progress',`${percent*3.6}deg`);
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value};
    set('homeCompletionV1',`${percent}%`);
    set('homeStatusTitleV1',status.title);
    set('homeStatusDetailV1',status.detail);
    root.dataset.tone=status.tone;
    const activeDate=today(),parts=dateParts(activeDate);
    set('lifeTodayDateV2',dateLabel(activeDate));
    const week=document.getElementById('homeWeekV2');
    if(week&&parts){
      week.replaceChildren();
      const labels=['日','月','火','水','木','金','土'];
      const start=addDays(activeDate,-parts.weekday);
      labels.forEach((label,index)=>{
        const date=addDays(start,index),datePart=dateParts(date),item=document.createElement('span');
        if(date===activeDate)item.className='active';
        const dayName=document.createElement('small');dayName.textContent=label;
        const dayNumber=document.createElement('b');dayNumber.textContent=String(datePart?.day||'');
        item.append(dayName,dayNumber);week.appendChild(item);
      });
    }
    set('homeFocusValueV1',focus.text||'まだありません');
    const focusButton=document.getElementById('homeFocusDoneV1');
    if(focusButton){
      focusButton.classList.toggle('done',focus.done);
      focusButton.setAttribute('aria-pressed',String(focus.done));
      focusButton.disabled=!focus.text;
    }
    set('homeFocusDetailV1',focusDetail(day));
    const preview=document.getElementById('homeSchedulePreviewV1');
    if(preview){
      preview.replaceChildren();
      const items=(day.schedule||[]).slice().sort((a,b)=>new Date(a.start||0)-new Date(b.start||0)).slice(0,4);
      if(!items.length){const empty=document.createElement('p');empty.className='empty-preview-v1';empty.textContent='今日の予定はありません\n空いた時間も、今日の余白。';preview.appendChild(empty)}
      items.forEach(item=>{const row=document.createElement('p'),time=document.createElement('time'),copy=document.createElement('span');time.textContent=fmtTime(item.start);copy.textContent=clean(item.title,80)||'予定';row.append(time,copy);preview.appendChild(row)});
    }
    const taskList=document.getElementById('homeTaskListV2');
    if(taskList){
      taskList.replaceChildren();
      const items=day.tasks.map((task,index)=>({task,index})).filter(item=>clean(item.task.text,70)).slice(0,3);
      if(!items.length){const empty=document.createElement('p');empty.className='empty-preview-v1';empty.textContent='タスクはまだありません\n＋から一つだけ残せます。';taskList.appendChild(empty)}
      items.forEach(({task,index})=>{const button=document.createElement('button');button.type='button';button.dataset.homeTaskIndex=String(index);button.className=task.done?'done':'';button.setAttribute('aria-pressed',String(Boolean(task.done)));const mark=document.createElement('span');mark.textContent=task.done?'✓':'';const copy=document.createElement('b');copy.textContent=clean(task.text,70);button.append(mark,copy);taskList.appendChild(button)});
    }
    set('homeSleepV1',day.checkin.sleep?`${day.checkin.sleep}h`:'—');
    set('homeHealthV1',day.checkin.health?`${day.checkin.health}/5`:'—');
    set('homeMoodV1',day.checkin.mood?`${day.checkin.mood}/5`:'—');
    set('homeHabitV1',`${habit.done}/${habit.total}`);
    const habitGroups=document.getElementById('homeHabitGroupsV2');
    if(habitGroups){
      habitGroups.replaceChildren();
      [['wake','朝'],['before','外出前'],['home','帰宅後']].forEach(([key,label])=>{const group=document.createElement('span');const done=Array.isArray(day.routines[key])?day.routines[key].length:0;group.classList.toggle('done',done>=ROUTINE_TOTAL[key]);const mark=document.createElement('b');mark.textContent=done>=ROUTINE_TOTAL[key]?'✓':'○';const copy=document.createElement('small');copy.textContent=`${label} ${done}/${ROUTINE_TOTAL[key]}`;group.append(mark,copy);habitGroups.appendChild(group)});
    }
    const habitBar=document.getElementById('homeHabitBarV1');
    if(habitBar)habitBar.style.width=`${habit.pct}%`;
    set('homeMemoPreviewV2',clean(day.note,100)||'まだありません');
    set('homeDoneValueV1',day.doneToday||'まだありません');
    const money=readMoneySafety(readJson(DATA_KEY,{days:{}}));
    const danger={none:'危険なし',watch:'要確認',urgent:'急ぎで確認'}[money.danger];
    set('homeMoneyBudgetV1',money.todayBudget?`今日使える目安 ${money.todayBudget}｜${danger}`:money.nextPayment?`次の支払い ${money.nextPayment}`:'確認済み情報はまだありません');
    set('homeMoneyDetailV1',money.nextPayment&&money.todayBudget?`次の支払い ${money.nextPayment}`:'必要な時だけ記録できます。');
  }

  function queueRefresh(){
    if(refreshQueued)return;
    refreshQueued=true;
    requestAnimationFrame(()=>{refreshQueued=false;refreshLifeCalendar();refreshDailyFlow();refreshDashboard()});
  }

  function install(){
    const app=qs('main.app'),top=qs('.top',app),sunrise=qs('.sunrise',app),week=document.getElementById('week'),layout=qs('.layout',app),nav=qs('.bottom-nav');
    if(!app||!top||!sunrise||!week||!layout||!nav)return false;
    loadStyles();

    const cards=qsa(':scope > .card',layout);
    const scheduleCard=cardByTitle(cards,'今日の予定');
    const routineCard=cardByTitle(cards,'今日のルーティン');
    const taskCard=cardByTitle(cards,'今日やる3つ');
    const planCard=cardByTitle(cards,'24時間スケジュール');
    const stateCard=cardByTitle(cards,'今日の状態');
    const yosCard=cardByTitle(cards,'YOSへ渡す');

    const host=document.createElement('div');
    host.id='lifePageHostV1';
    host.className='life-page-host-v1';
    const pages={};
    Object.keys(PAGE_META).forEach(key=>{
      const page=document.createElement('section');
      page.className='life-page-v1';
      page.dataset.page=key;
      page.setAttribute('aria-label',PAGE_META[key].label);
      host.appendChild(page);
      pages[key]=page;
    });
    top.insertAdjacentElement('afterend',host);

    const lifeCalendar=buildLifeCalendar();
    pages.home.append(buildDashboard());
    [sunrise,lifeCalendar,week,scheduleCard,taskCard,planCard].filter(Boolean).forEach(card=>pages.schedule.appendChild(card));
    pages.record.appendChild(buildDailyFlow());
    if(stateCard){
      const details=document.createElement('details');
      details.className='life-legacy-record-v1 card';
      details.innerHTML='<summary>以前の状態入力を開く</summary>';
      details.appendChild(stateCard);
      pages.record.appendChild(details);
    }
    [routineCard,yosCard].filter(Boolean).forEach(card=>pages.improve.appendChild(card));
    layout.remove();

    renderNav(nav);
    activatePage('home',false);

    const observer=new MutationObserver(queueRefresh);
    [scheduleCard,taskCard,stateCard,routineCard].filter(Boolean).forEach(node=>observer.observe(node,{subtree:true,childList:true,characterData:true,attributes:true}));
    window.addEventListener('storage',queueRefresh);
    window.addEventListener('yos-life-record-saved',()=>activatePage('home',true));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueRefresh()});
    setInterval(queueRefresh,30000);
    queueRefresh();
    return true;
  }

  installDataExtensionGuard();
  ensureLifeCalendar();
  window.__yosLifeCalendarV1={
    defaults:()=>DEFAULT_LIFE_CALENDAR.map(item=>({...item,rule:{...item.rule}})),
    itemsForDate:(data,date)=>lifeCalendarItemsForDate(data,date),
    upcoming:(data,date,fromDay,toDay)=>upcomingCalendarItems(data,date,fromDay,toDay),
    displayFor:(item,now)=>calendarItemDisplay(item,now)
  };
  const timer=setInterval(()=>{if(install())clearInterval(timer)},40);
  setTimeout(()=>clearInterval(timer),10000);
})();
