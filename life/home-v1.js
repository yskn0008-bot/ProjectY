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
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function loadStyles(){
    if(document.getElementById('lifeHomeV1Styles'))return;
    const link=document.createElement('link');
    link.id='lifeHomeV1Styles';
    link.rel='stylesheet';
    link.href='./home-v1.css?v=1';
    document.head.appendChild(link);
  }

  function dayData(){
    const data=readJson(DATA_KEY,{days:{}});
    const day=data.days?.[today()]||{};
    return {
      schedule:Array.isArray(day.schedule)?day.schedule:[],
      tasks:Array.isArray(day.tasks)?day.tasks:[],
      routines:day.routines||{wake:[],before:[],home:[]},
      checkin:day.checkin||{sleep:'',health:'',mood:''},
      note:day.note||''
    };
  }

  function completion(day){
    const routineDone=Object.values(day.routines).reduce((sum,list)=>sum+(Array.isArray(list)?list.length:0),0);
    const routineTotal=Object.values(ROUTINE_TOTAL).reduce((sum,value)=>sum+value,0);
    const tasks=day.tasks.filter(task=>String(task.text||'').trim());
    const taskDone=tasks.filter(task=>task.done).length;
    const total=routineTotal+tasks.length;
    return total?Math.round((routineDone+taskDone)/total*100):0;
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

  function statusMessage(day){
    const sleep=Number(day.checkin.sleep),health=Number(day.checkin.health),mood=Number(day.checkin.mood);
    if(!sleep&&!health&&!mood)return{tone:'neutral',title:'まず、今の状態を記録',detail:'30秒の記録から今日の流れを整えます。'};
    if(health&&health<=2)return{tone:'rest',title:'今日は回復を優先',detail:'予定を減らし、安全と休養を最優先にします。'};
    if(sleep&&sleep<6)return{tone:'rest',title:'睡眠不足を前提に動く',detail:'重要なことを一つに絞り、無理を増やしません。'};
    if(mood&&mood<=2)return{tone:'care',title:'小さく始めれば十分',detail:'気分を変えようとせず、できる一歩だけ選びます。'};
    return{tone:'good',title:'今日の流れは整えられる',detail:'次の一つだけに集中して進めます。'};
  }

  function nextAction(day){
    const task=day.tasks.find(item=>String(item.text||'').trim()&&!item.done);
    const event=upcomingEvent(day);
    if(task)return{eyebrow:'次にやること',title:task.text,detail:event?`${fmtTime(event.start)}から「${event.title||'予定'}」`:'完了したら次を考える'};
    if(event)return{eyebrow:'次の予定',title:event.title||'予定',detail:`${fmtTime(event.start)}〜${fmtTime(event.end)}${event.location?`・${event.location}`:''}`};
    return{eyebrow:'次にやること',title:'空き時間を自分のために使う',detail:'休む・整える・楽しむから一つ選ぶ'};
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
      <section class="home-next-v1 card">
        <div><small id="homeNextEyebrowV1">次にやること</small><h3 id="homeNextTitleV1">読み込み中</h3><p id="homeNextDetailV1"></p></div>
        <button type="button" data-open-page="schedule">予定を見る</button>
      </section>
      <section class="home-glance-v1" aria-label="今日の状態">
        <button type="button" class="glance-card-v1 sleep" data-open-page="record"><span>🌙 睡眠</span><strong id="homeSleepV1">—</strong><small>時間</small></button>
        <button type="button" class="glance-card-v1 health" data-open-page="record"><span>💚 体調</span><strong id="homeHealthV1">—</strong><small>5段階</small></button>
        <button type="button" class="glance-card-v1 mood" data-open-page="record"><span>🙂 気分</span><strong id="homeMoodV1">—</strong><small>5段階</small></button>
      </section>
      <section class="home-actions-v1" aria-label="すぐ使う">
        <button type="button" data-open-page="schedule"><span>📅</span><b>予定</b><small>今日の流れ</small></button>
        <button type="button" data-open-page="record"><span>✍️</span><b>記録</b><small>体調を残す</small></button>
        <button type="button" data-open-page="improve"><span>🌱</span><b>改善</b><small>習慣を整える</small></button>
      </section>
      <section class="home-tip-v1 card">
        <span>💡</span><div><small>今日の生活改善</small><b id="homeTipV1">今の状態を記録すると、次の判断が簡単になります。</b></div>
      </section>`;
    section.addEventListener('click',event=>{
      const button=event.target.closest('[data-open-page]');
      if(button)activatePage(button.dataset.openPage,true);
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
    nav.innerHTML=Object.entries(PAGE_META).map(([key,item])=>`<button type="button" class="nav" data-page="${key}"><span>${item.icon}</span><b>${item.label}</b></button>`).join('');
    nav.addEventListener('click',event=>{
      const button=event.target.closest('button[data-page]');
      if(button)activatePage(button.dataset.page,true);
    });
  }

  function refreshDashboard(){
    const root=document.getElementById('lifeHomeDashboardV1');
    if(!root)return;
    const day=dayData(),percent=completion(day),status=statusMessage(day),next=nextAction(day);
    const ring=document.getElementById('homeRingV1');
    ring?.style.setProperty('--progress',`${percent*3.6}deg`);
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value};
    set('homeCompletionV1',`${percent}%`);
    set('homeStatusTitleV1',status.title);
    set('homeStatusDetailV1',status.detail);
    root.dataset.tone=status.tone;
    set('homeNextEyebrowV1',next.eyebrow);
    set('homeNextTitleV1',next.title);
    set('homeNextDetailV1',next.detail);
    set('homeSleepV1',day.checkin.sleep?`${day.checkin.sleep}h`:'—');
    set('homeHealthV1',day.checkin.health?`${day.checkin.health}/5`:'—');
    set('homeMoodV1',day.checkin.mood?`${day.checkin.mood}/5`:'—');
    const tip=status.tone==='rest'?'予定を一つ減らし、休む時間を先に確保します。':status.tone==='care'?'5分で終わる行動を一つだけ選びます。':percent>=80?'新しいことを増やさず、気持ちよく終えます。':'次の一つを終えるまで、他のことを増やしません。';
    set('homeTipV1',tip);
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

    pages.home.append(sunrise,week,buildDashboard());
    [scheduleCard,taskCard,planCard].filter(Boolean).forEach(card=>pages.schedule.appendChild(card));
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

  const timer=setInterval(()=>{if(install())clearInterval(timer)},40);
  setTimeout(()=>clearInterval(timer),10000);
})();
