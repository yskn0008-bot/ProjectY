'use strict';
(()=>{
  if(window.__yosLifeHomeV1)return;
  window.__yosLifeHomeV1=true;

  const DATA_KEY='yos-life-v1';
  const PAGE_KEY='yos-life-home-page-v1';
  const HJ_SCHEMA='life-hj-export-v1';
  const ROUTINE_TOTAL={wake:6,before:4,home:4};
  const PAGE_META={
    home:{label:'ホーム',icon:'⌂'},
    schedule:{label:'予定',icon:'◷'},
    record:{label:'記録',icon:'＋'},
    improve:{label:'改善',icon:'↗'}
  };
  let activePage='home';
  let refreshQueued=false;

  const qs=(selector,root=document)=>root.querySelector(selector);
  const qsa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const calendarDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const clean=(value,max=400)=>String(value||'').trim().slice(0,max);
  const numberOrNull=(value)=>value===''||value==null?null:Number.isFinite(Number(value))?Number(value):null;
  const addDays=(date,amount)=>{
    const value=new Date(`${date}T12:00:00+09:00`);
    value.setDate(value.getDate()+amount);
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(value);
  };
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
          if(incoming?.days&&current?.days){
            Object.entries(current.days).forEach(([date,currentDay])=>{
              const incomingDay=incoming.days[date];
              if(!incomingDay||!currentDay)return;
              ['doneToday','lifeFlow','money','hjSnapshot'].forEach(field=>{
                if(Object.prototype.hasOwnProperty.call(currentDay,field)&&!Object.prototype.hasOwnProperty.call(incomingDay,field))incomingDay[field]=currentDay[field];
              });
            });
            ['activeLifeDate','lastClosedLifeDate','moneySafety'].forEach(field=>{
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
      base.href='./home-v1.css?v=2';
      document.head.appendChild(base);
    }
    if(!document.getElementById('lifeHomePriorityV1Styles')){
      const priority=document.createElement('link');
      priority.id='lifeHomePriorityV1Styles';
      priority.rel='stylesheet';
      priority.href='./home-priority-v1.css?v=2';
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
    if(!sleep&&!health&&!mood)return{tone:'neutral',title:'まず、今の状態を記録',detail:'30秒の記録から今日の流れを整えます。'};
    if(health&&health<=2)return{tone:'rest',title:'今日は回復を優先',detail:'予定を減らし、安全と休養を最優先にします。'};
    if(sleep&&sleep<6)return{tone:'rest',title:'睡眠不足を前提に動く',detail:'重要なことを一つに絞り、無理を増やしません。'};
    if(mood&&mood<=2)return{tone:'care',title:'小さく始めれば十分',detail:'気分を変えようとせず、できる一歩だけ選びます。'};
    return{tone:'good',title:'今日の流れは整えられる',detail:'次の一つだけに集中して進めます。'};
  }

  function saveFocusTask(){
    const input=document.getElementById('homeFocusInputV1');
    if(!input)return;
    const index=Number(input.dataset.taskIndex||0);
    const value=input.value.trim();
    const row=qsa('.task')[index]||qsa('.task')[0];
    const sourceInput=row&&qs('input',row);
    if(sourceInput){
      if(sourceInput.value!==value){
        sourceInput.value=value;
        sourceInput.dispatchEvent(new Event('change',{bubbles:true}));
      }
      return;
    }
    updateToday(day=>{
      day.tasks=Array.isArray(day.tasks)?day.tasks:[];
      while(day.tasks.length<=index)day.tasks.push({text:'',done:false,category:'personal'});
      day.tasks[index]={...day.tasks[index],text:value,category:day.tasks[index].category||'personal'};
    });
  }

  function toggleFocusTask(){
    const input=document.getElementById('homeFocusInputV1');
    if(!input)return;
    const before=focusTask(dayData());
    saveFocusTask();
    const index=Number(input.dataset.taskIndex||before.index||0);
    const row=qsa('.task')[index]||qsa('.task')[0];
    const button=row&&qs('button',row);
    if(button)button.click();
    else updateToday(day=>{
      day.tasks=Array.isArray(day.tasks)?day.tasks:[];
      while(day.tasks.length<=index)day.tasks.push({text:'',done:false,category:'personal'});
      day.tasks[index].done=!day.tasks[index].done;
    });
    if(!before.done&&input.value.trim()&&!dayData().doneToday){
      saveDoneToday(input.value.trim());
    }
  }

  function saveDoneToday(value){
    updateToday(day=>{day.doneToday=String(value||'').trim()});
    const button=document.getElementById('homeDoneSaveV1');
    if(button){
      button.textContent='保存済み';
      setTimeout(()=>{button.textContent='保存'},1000);
    }
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
          <label>睡眠<input id="lifeMorningSleepV1" type="number" min="0" max="24" step="0.5" inputmode="decimal" placeholder="時間"></label>
          <label>体調<input id="lifeMorningHealthV1" type="number" min="1" max="5" step="1" inputmode="numeric" placeholder="1〜5"></label>
        </div>
        <label>気分 1〜5<input id="lifeMorningMoodV1" type="number" min="1" max="5" step="1" inputmode="numeric" placeholder="今の値"></label>
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
      const tab=event.target.closest('[data-life-flow-tab]');
      if(tab){activateFlowPane(tab.dataset.lifeFlowTab);return}
      if(event.target.closest('#lifeStartDayV1')){saveMorning();return}
      if(event.target.closest('#lifeEndDayV1')){saveNight();return}
      if(event.target.closest('#lifeCopySnapshotV1'))copySnapshot();
    });
    return section;
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
    section.className='home-dashboard-v1';
    section.innerHTML=`
      <section class="home-status-v1 card">
        <div class="status-ring-v1" id="homeRingV1"><div><strong id="homeCompletionV1">0%</strong><span>今日の進み</span></div></div>
        <div class="status-copy-v1"><small>YOS LIFE</small><h2 id="homeStatusTitleV1">今日を整える</h2><p id="homeStatusDetailV1">今の状態から、無理のない順番をつくります。</p></div>
      </section>
      <section class="home-focus-v1 card">
        <button type="button" id="homeFocusDoneV1" class="home-focus-check-v1" aria-label="今日やることを完了">✓</button>
        <div><small>今日やること1つ</small><input id="homeFocusInputV1" maxlength="70" placeholder="今日いちばん大事な1件"><p id="homeFocusDetailV1"></p></div>
      </section>
      <section class="home-glance-v1" aria-label="今日の状態">
        <button type="button" class="glance-card-v1 sleep" data-open-page="record"><span>🌙 睡眠</span><strong id="homeSleepV1">—</strong><small>時間</small></button>
        <button type="button" class="glance-card-v1 health" data-open-page="record"><span>💚 体調</span><strong id="homeHealthV1">—</strong><small>5段階</small></button>
        <button type="button" class="glance-card-v1 mood" data-open-page="record"><span>🙂 気分</span><strong id="homeMoodV1">—</strong><small>5段階</small></button>
      </section>
      <section class="home-overview-v1 card">
        <button type="button" class="home-habit-v1" data-open-page="improve"><span>🌱 習慣</span><b id="homeHabitV1">0/14</b><i><em id="homeHabitBarV1"></em></i></button>
        <label class="home-done-v1"><span>✨ 今日できたこと</span><input id="homeDoneInputV1" maxlength="100" placeholder="完了すると自動で入ります"></label>
        <button type="button" id="homeDoneSaveV1" class="home-done-save-v1">保存</button>
      </section>`;

    section.addEventListener('click',event=>{
      const pageButton=event.target.closest('[data-open-page]');
      if(pageButton){activatePage(pageButton.dataset.openPage,true);return}
      if(event.target.closest('#homeFocusDoneV1')){toggleFocusTask();return}
      if(event.target.closest('#homeDoneSaveV1')){
        saveDoneToday(document.getElementById('homeDoneInputV1')?.value||'');
      }
    });

    const focusInput=qs('#homeFocusInputV1',section);
    focusInput.addEventListener('change',saveFocusTask);
    focusInput.addEventListener('keydown',event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      saveFocusTask();
      focusInput.blur();
    });
    const doneInput=qs('#homeDoneInputV1',section);
    doneInput.addEventListener('change',()=>saveDoneToday(doneInput.value));
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
    nav.innerHTML=Object.entries(PAGE_META).map(([key,item])=>`<button type="button" class="nav" data-page="${key}"><span>${item.icon}</span><b>${item.label}</b></button>`).join('');
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
    const focusInput=document.getElementById('homeFocusInputV1');
    if(focusInput){
      focusInput.dataset.taskIndex=String(focus.index);
      if(document.activeElement!==focusInput)focusInput.value=focus.text;
    }
    const focusButton=document.getElementById('homeFocusDoneV1');
    if(focusButton){
      focusButton.classList.toggle('done',focus.done);
      focusButton.setAttribute('aria-pressed',String(focus.done));
    }
    set('homeFocusDetailV1',focusDetail(day));
    set('homeSleepV1',day.checkin.sleep?`${day.checkin.sleep}h`:'—');
    set('homeHealthV1',day.checkin.health?`${day.checkin.health}/5`:'—');
    set('homeMoodV1',day.checkin.mood?`${day.checkin.mood}/5`:'—');
    set('homeHabitV1',`${habit.done}/${habit.total}`);
    const habitBar=document.getElementById('homeHabitBarV1');
    if(habitBar)habitBar.style.width=`${habit.pct}%`;
    const doneInput=document.getElementById('homeDoneInputV1');
    if(doneInput&&document.activeElement!==doneInput)doneInput.value=day.doneToday;
  }

  function queueRefresh(){
    if(refreshQueued)return;
    refreshQueued=true;
    requestAnimationFrame(()=>{refreshQueued=false;refreshDailyFlow();refreshDashboard()});
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

    pages.home.append(buildDailyFlow(),week,buildDashboard());
    [sunrise,scheduleCard,taskCard,planCard].filter(Boolean).forEach(card=>pages.schedule.appendChild(card));
    if(stateCard)pages.record.appendChild(stateCard);
    [routineCard,yosCard].filter(Boolean).forEach(card=>pages.improve.appendChild(card));
    layout.remove();

    renderNav(nav);
    const saved=localStorage.getItem(PAGE_KEY);
    activatePage(PAGE_META[saved]?saved:'home',false);

    const observer=new MutationObserver(queueRefresh);
    [scheduleCard,taskCard,stateCard,routineCard].filter(Boolean).forEach(node=>observer.observe(node,{subtree:true,childList:true,characterData:true,attributes:true}));
    window.addEventListener('storage',queueRefresh);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueRefresh()});
    setInterval(queueRefresh,30000);
    queueRefresh();
    return true;
  }

  installDataExtensionGuard();
  const timer=setInterval(()=>{if(install())clearInterval(timer)},40);
  setTimeout(()=>clearInterval(timer),10000);
})();
