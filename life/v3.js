'use strict';
(()=>{
  if(window.__yosLifeV3Requested)return;
  window.__yosLifeV3Requested=true;

  const DATA_KEY='yos-life-v1';
  const SETTINGS_KEY='yos-life-settings-v1';
  const PAGE_META={
    today:{label:'今日',icon:'◉',description:'今日の流れ'},
    habits:{label:'習慣',icon:'✓',description:'習慣と状態'},
    month:{label:'月間',icon:'▦',description:'月の積み重ね'},
    manage:{label:'管理',icon:'⚙︎',description:'表示と設定'}
  };
  const DEFAULT_ORDER=['today','habits','month','manage'];
  const THEMES={
    sunrise:{label:'Sunrise',description:'明るい多色',swatches:['#ff7868','#ffbf3f','#54c9a2']},
    taxi511:{label:'511 Taxi',description:'白・橙・濃紺',swatches:['#f7f2e9','#d9681b','#173f91']},
    gold:{label:'YOS Gold',description:'黒・白・金',swatches:['#0b0b0d','#ffb323','#f7f4ed']},
    ocean:{label:'Ocean',description:'青・水色・白',swatches:['#0f5d8f','#3db7c7','#eef8fb']}
  };
  const ROUTINE_TOTAL={wake:6,before:4,home:4};

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const safeOrder=value=>{
    const source=Array.isArray(value)?value:[];
    const unique=source.filter((item,index)=>PAGE_META[item]&&source.indexOf(item)===index);
    return [...unique,...DEFAULT_ORDER.filter(item=>!unique.includes(item))].slice(0,DEFAULT_ORDER.length);
  };
  let prefs={...read(SETTINGS_KEY,{}),pageOrder:safeOrder(read(SETTINGS_KEY,{}).pageOrder),appearance:read(SETTINGS_KEY,{}).appearance||'auto',theme:read(SETTINGS_KEY,{}).theme||'taxi511',lastPage:read(SETTINGS_KEY,{}).lastPage||'today'};
  let activePage=PAGE_META[prefs.lastPage]?prefs.lastPage:'today';
  let monthFocus=new Date();
  monthFocus=new Date(monthFocus.getFullYear(),monthFocus.getMonth(),1,12);
  let installed=false;

  const ready=setInterval(()=>{
    if(installed)return clearInterval(ready);
    const layout=document.querySelector('main.app .layout');
    const nav=document.querySelector('.bottom-nav');
    if(!layout||!nav||!document.querySelector('.sunrise')||!document.getElementById('week'))return;
    clearInterval(ready);
    install(layout,nav);
  },50);

  function persist(){
    prefs.pageOrder=safeOrder(prefs.pageOrder);
    write(SETTINGS_KEY,prefs);
  }

  function resolvedAppearance(){
    if(prefs.appearance==='light'||prefs.appearance==='dark')return prefs.appearance;
    const hour=Number(new Intl.DateTimeFormat('en-US',{hour:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(new Date()));
    return hour>=6&&hour<18?'light':'dark';
  }

  function applyTheme(){
    const appearance=resolvedAppearance();
    const theme=THEMES[prefs.theme]?prefs.theme:'taxi511';
    document.documentElement.dataset.lifeAppearance=appearance;
    document.documentElement.dataset.lifeTheme=theme;
    document.documentElement.style.colorScheme=appearance;
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta){
      const colors={
        light:{sunrise:'#fff8ef',taxi511:'#f5f0e8',gold:'#f5f1e7',ocean:'#eef8fb'},
        dark:{sunrise:'#16131a',taxi511:'#080d17',gold:'#080809',ocean:'#07141d'}
      };
      meta.content=colors[appearance][theme];
    }
    paintAppearanceControls();
  }

  function injectStyles(){
    if(document.getElementById('lifeV3Styles'))return;
    const link=document.createElement('link');link.id='lifeV3Styles';link.rel='stylesheet';link.href='./v3.css?v=3';document.head.appendChild(link);
  }

  function cardByTitle(cards,text){return cards.find(card=>card.querySelector('h3')?.textContent.includes(text));}

  function install(layout,nav){
    installed=true;
    injectStyles();
    applyTheme();

    const app=document.querySelector('main.app');
    const top=app.querySelector('.top');
    const clock=top.querySelector('.clock');
    const modeButton=document.createElement('button');
    modeButton.type='button';
    modeButton.id='lifeModeQuickV3';
    modeButton.className='mode-quick-v3';
    modeButton.setAttribute('aria-label','昼夜モードを切り替える');
    top.insertBefore(modeButton,clock);
    modeButton.onclick=()=>{
      prefs.appearance=prefs.appearance==='auto'?'light':prefs.appearance==='light'?'dark':'auto';
      persist();
      applyTheme();
    };

    const host=document.createElement('div');
    host.id='lifePageHostV3';
    host.className='life-page-host';
    const pages={};
    Object.keys(PAGE_META).forEach(key=>{
      const page=document.createElement('section');
      page.className='life-page';
      page.dataset.page=key;
      page.setAttribute('aria-label',PAGE_META[key].label);
      host.appendChild(page);
      pages[key]=page;
    });
    top.insertAdjacentElement('afterend',host);

    const sunrise=document.querySelector('.sunrise');
    const week=document.getElementById('week');
    const cards=[...layout.querySelectorAll(':scope > .card')];
    const scheduleCard=cardByTitle(cards,'今日の予定');
    const routineCard=cardByTitle(cards,'今日のルーティン');
    const taskCard=cardByTitle(cards,'今日やる3つ');
    const planCard=cardByTitle(cards,'24時間スケジュール');
    const stateCard=cardByTitle(cards,'今日の状態');
    const yosCard=cardByTitle(cards,'YOSへ渡す');

    [sunrise,week,scheduleCard,taskCard,planCard].filter(Boolean).forEach(node=>pages.today.appendChild(node));
    [routineCard,stateCard].filter(Boolean).forEach(node=>pages.habits.appendChild(node));
    pages.month.innerHTML='<div id="lifeMonthV3" class="month-shell-v3"></div>';
    pages.manage.appendChild(buildManageCard());
    if(yosCard)pages.manage.appendChild(yosCard);
    layout.remove();

    nav.innerHTML='';
    nav.id='lifeBottomNavV3';
    renderNav(nav,pages);
    renderOrderControls();
    activatePage(activePage,nav,pages,false);
    renderMonthPage();

    let startX=0,startY=0;
    host.addEventListener('touchstart',event=>{const t=event.changedTouches[0];startX=t.clientX;startY=t.clientY},{passive:true});
    host.addEventListener('touchend',event=>{
      const t=event.changedTouches[0],dx=t.clientX-startX,dy=t.clientY-startY;
      if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.4)return;
      const order=safeOrder(prefs.pageOrder),index=order.indexOf(activePage),next=dx<0?index+1:index-1;
      if(next>=0&&next<order.length)activatePage(order[next],nav,pages,true);
    },{passive:true});

    setInterval(()=>{if(prefs.appearance==='auto')applyTheme();if(activePage==='month')renderMonthPage()},30000);
  }

  function buildManageCard(){
    const card=document.createElement('section');
    card.className='card';
    card.id='lifeManageCardV3';
    card.innerHTML=`
      <div><h2 class="manage-title-v3">表示とページ</h2><p class="manage-copy-v3">変更はすぐ保存されます。</p></div>
      <div class="setting-block-v3"><div class="setting-label-v3">昼夜モード</div><div id="appearanceChoicesV3" class="segmented-v3"><button data-value="light">☀️ 昼</button><button data-value="dark">🌙 夜</button><button data-value="auto">◐ 自動</button></div></div>
      <div class="setting-block-v3"><div class="setting-label-v3">配色テーマ</div><div id="themeChoicesV3" class="theme-grid-v3">${Object.entries(THEMES).map(([key,value])=>`<button class="theme-choice-v3" data-theme="${key}"><b>${value.label}</b><small>${value.description}</small><span class="swatches-v3">${value.swatches.map(color=>`<i style="background:${color}"></i>`).join('')}</span></button>`).join('')}</div></div>
      <div class="setting-block-v3"><div class="setting-label-v3">ページの順番</div><div id="pageOrderV3" class="order-list-v3"></div></div>
      <div class="manage-links-v3"><button id="openOldSettingsV3">YOS設定</button><a href="../taxi/">Taxiを開く</a></div>
    `;
    card.querySelectorAll('#appearanceChoicesV3 button').forEach(button=>button.onclick=()=>{prefs.appearance=button.dataset.value;persist();applyTheme()});
    card.querySelectorAll('#themeChoicesV3 button').forEach(button=>button.onclick=()=>{prefs.theme=button.dataset.theme;persist();applyTheme()});
    card.querySelector('#openOldSettingsV3').onclick=()=>document.getElementById('settingsButton')?.click();
    return card;
  }

  function renderNav(nav,pages){
    prefs.pageOrder=safeOrder(prefs.pageOrder);
    nav.innerHTML=prefs.pageOrder.map(key=>`<button class="nav" data-page="${key}"><span>${PAGE_META[key].icon}</span>${PAGE_META[key].label}</button>`).join('');
    nav.querySelectorAll('button').forEach(button=>button.onclick=()=>activatePage(button.dataset.page,nav,pages,true));
  }

  function activatePage(key,nav,pages,saveState){
    if(!PAGE_META[key])key='today';
    activePage=key;
    Object.entries(pages).forEach(([pageKey,page])=>page.classList.toggle('active',pageKey===key));
    nav.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.page===key));
    const subtitle=document.querySelector('.brand p');
    if(subtitle)subtitle.textContent=PAGE_META[key].description;
    if(key==='month')renderMonthPage();
    if(saveState){prefs.lastPage=key;persist()}
  }

  function paintAppearanceControls(){
    const mode=document.getElementById('lifeModeQuickV3');
    if(mode)mode.textContent=prefs.appearance==='light'?'☀️':prefs.appearance==='dark'?'🌙':'◐';
    document.querySelectorAll('#appearanceChoicesV3 button').forEach(button=>button.classList.toggle('active',button.dataset.value===prefs.appearance));
    document.querySelectorAll('#themeChoicesV3 button').forEach(button=>button.classList.toggle('active',button.dataset.theme===prefs.theme));
  }

  function renderOrderControls(){
    const box=document.getElementById('pageOrderV3');
    if(!box)return;
    prefs.pageOrder=safeOrder(prefs.pageOrder);
    box.innerHTML=prefs.pageOrder.map((key,index)=>`<div class="order-row-v3" data-key="${key}"><span class="order-icon-v3">${PAGE_META[key].icon}</span><b>${PAGE_META[key].label}</b><button data-direction="up" ${index===0?'disabled':''}>↑</button><button data-direction="down" ${index===prefs.pageOrder.length-1?'disabled':''}>↓</button></div>`).join('');
    box.querySelectorAll('button').forEach(button=>button.onclick=()=>{
      const row=button.closest('.order-row-v3'),key=row.dataset.key,index=prefs.pageOrder.indexOf(key),next=button.dataset.direction==='up'?index-1:index+1;
      if(next<0||next>=prefs.pageOrder.length)return;
      [prefs.pageOrder[index],prefs.pageOrder[next]]=[prefs.pageOrder[next],prefs.pageOrder[index]];
      persist();
      const nav=document.getElementById('lifeBottomNavV3');
      const pages=Object.fromEntries([...document.querySelectorAll('.life-page')].map(page=>[page.dataset.page,page]));
      renderNav(nav,pages);
      activatePage(activePage,nav,pages,false);
      renderOrderControls();
    });
  }

  function lifeData(){return read(DATA_KEY,{days:{}})}
  function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
  function dayCompletion(value){
    if(!value)return null;
    const routines=value.routines||{};
    const routineDone=Object.values(routines).reduce((sum,list)=>sum+(Array.isArray(list)?list.length:0),0);
    const taskSet=(value.tasks||[]).filter(task=>String(task.text||'').trim());
    const taskDone=taskSet.filter(task=>task.done).length;
    const total=Object.values(ROUTINE_TOTAL).reduce((a,b)=>a+b,0)+taskSet.length;
    const has=Boolean(value.checkin&&(value.checkin.sleep||value.checkin.health||value.checkin.mood))||routineDone>0||taskSet.length>0||Array.isArray(value.schedule)&&value.schedule.length>0;
    if(!has)return null;
    return total?Math.round((routineDone+taskDone)/total*100):0;
  }
  function avg(values,digits=1){
    const valid=values.map(Number).filter(value=>Number.isFinite(value)&&value>0);
    if(!valid.length)return'—';
    return (valid.reduce((a,b)=>a+b,0)/valid.length).toFixed(digits).replace(/\.0$/,'');
  }

  function renderMonthPage(){
    const root=document.getElementById('lifeMonthV3');
    if(!root)return;
    const data=lifeData(),days=data.days||{};
    const y=monthFocus.getFullYear(),m=monthFocus.getMonth();
    const first=new Date(y,m,1,12),last=new Date(y,m+1,0,12),keys=[];
    for(let d=1;d<=last.getDate();d++)keys.push(dateKey(new Date(y,m,d,12)));
    const values=keys.map(key=>days[key]).filter(Boolean);
    const completions=keys.map(key=>dayCompletion(days[key])).filter(value=>value!==null);
    const recorded=keys.filter(key=>dayCompletion(days[key])!==null).length;
    const sleep=avg(values.map(value=>value.checkin?.sleep));
    const health=avg(values.map(value=>value.checkin?.health));
    const completionAvg=completions.length?Math.round(completions.reduce((a,b)=>a+b,0)/completions.length):0;
    const monthLabel=new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'long'}).format(first);
    const start=new Date(y,m,1-first.getDay(),12);
    const cells=[];
    for(let i=0;i<42;i++){
      const date=new Date(start);date.setDate(start.getDate()+i);
      const key=dateKey(date),value=days[key],pct=dayCompletion(value),same=date.getMonth()===m,isToday=key===dateKey(new Date());
      const sleepValue=value?.checkin?.sleep;
      cells.push(`<button class="month-day-v3${same?'':' other'}${isToday?' today':''}" data-date="${key}"><b>${date.getDate()}</b>${pct===null?'':`<strong>${pct}%</strong>`}${sleepValue?`<small>睡眠 ${sleepValue}h</small>`:''}</button>`);
    }
    const rows=Array.from({length:6},(_,row)=>`<div class="month-row-v3">${cells.slice(row*7,row*7+7).join('')}</div>`).join('');
    root.innerHTML=`
      <div class="month-head-v3"><button id="monthPrevV3">‹</button><div class="month-title-v3"><strong>${monthLabel}</strong><span>習慣・睡眠・状態の記録</span></div><button id="monthNextV3">›</button></div>
      <div class="month-stats-v3"><div class="month-stat-v3"><strong>${recorded}日</strong><span>記録日</span></div><div class="month-stat-v3"><strong>${completionAvg}%</strong><span>平均完了</span></div><div class="month-stat-v3"><strong>${sleep}${sleep==='—'?'':'h'}</strong><span>平均睡眠</span></div><div class="month-stat-v3"><strong>${health}${health==='—'?'':'/5'}</strong><span>平均体調</span></div></div>
      <div class="month-calendar-v3"><div class="month-week-v3">${['日','月','火','水','木','金','土'].map(day=>`<span>${day}</span>`).join('')}</div>${rows}</div>`;
    document.getElementById('monthPrevV3').onclick=()=>{monthFocus=new Date(y,m-1,1,12);renderMonthPage()};
    document.getElementById('monthNextV3').onclick=()=>{monthFocus=new Date(y,m+1,1,12);renderMonthPage()};
    root.querySelectorAll('.month-day-v3').forEach(button=>button.onclick=()=>showDaySummary(button.dataset.date,days[button.dataset.date]));
  }

  function showDaySummary(key,value){
    if(!value)return;
    let dialog=document.getElementById('lifeDayDialogV3');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='lifeDayDialogV3';dialog.innerHTML='<div class="dialog"><h3 id="lifeDayTitleV3"></h3><div id="lifeDayBodyV3"></div><div class="dialog-actions"><button id="lifeDayCloseV3">閉じる</button></div></div>';document.body.appendChild(dialog);dialog.querySelector('#lifeDayCloseV3').onclick=()=>dialog.close()}
    const completion=dayCompletion(value),tasks=(value.tasks||[]).filter(task=>task.text),done=tasks.filter(task=>task.done).length;
    document.getElementById('lifeDayTitleV3').textContent=new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'long'}).format(new Date(`${key}T12:00:00+09:00`));
    document.getElementById('lifeDayBodyV3').innerHTML=`<div class="metrics"><div class="metric"><span>習慣</span><strong>${completion??0}%</strong><small>その日の完了率</small></div><div class="metric"><span>睡眠</span><strong>${value.checkin?.sleep||'—'}${value.checkin?.sleep?'h':''}</strong><small>休息</small></div><div class="metric"><span>体調</span><strong>${value.checkin?.health||'—'}${value.checkin?.health?'/5':''}</strong><small>状態</small></div><div class="metric"><span>タスク</span><strong>${done}/${tasks.length}</strong><small>完了</small></div></div>`;
    dialog.showModal();
  }
})();
