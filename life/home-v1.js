'use strict';
(()=>{
  if(window.__yosLifeHomeV1)return;
  window.__yosLifeHomeV1=true;

  const DATA_KEY='yos-life-v1';
  const PAGE_KEY='yos-life-home-page-v1';
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
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};

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
              if(Object.prototype.hasOwnProperty.call(currentDay,'doneToday')&&!Object.prototype.hasOwnProperty.call(incomingDay,'doneToday')){
                incomingDay.doneToday=currentDay.doneToday;
              }
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
      priority.href='./home-priority-v1.css?v=1';
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
      doneToday:String(day.doneToday||'')
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
    requestAnimationFrame(()=>{refreshQueued=false;refreshDashboard()});
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

    pages.home.append(week,buildDashboard());
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
