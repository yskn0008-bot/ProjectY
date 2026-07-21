'use strict';
(()=>{
  if(window.__yosTaxiUiV24Loaded)return;
  window.__yosTaxiUiV24Loaded=true;

  const KEY='yos-taxi-ui-v24';
  const SETTINGS_TAB_KEY='yos-taxi-settings-tab-v20';
  const PAGE_META={
    drive:{label:'営業',icon:'🚖'},
    today:{label:'今日',icon:'◉'},
    week:{label:'週間',icon:'▦'},
    month:{label:'月間',icon:'▤'},
    manage:{label:'管理',icon:'⚙︎'}
  };
  const DEFAULT_ORDER=['drive','today','week','month','manage'];
  const THEMES={
    gold:{label:'YOS Gold',description:'黒・白・金',swatches:['#09090b','#ffb323','#fafafa']},
    taxi511:{label:'沖東交通',description:'アイボリー・オレンジ・濃紺',swatches:['#f7f2e9','#d9681b','#173f91']},
    ocean:{label:'Ocean',description:'濃紺・水色・白',swatches:['#071722','#38a9c6','#f1fbff']},
    mono:{label:'Mono',description:'白・黒・グレー',swatches:['#111214','#a5a7ac','#f7f7f8']}
  };

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const safeOrder=value=>{
    const source=Array.isArray(value)?value:[];
    const unique=source.filter((key,index)=>PAGE_META[key]&&source.indexOf(key)===index);
    return [...unique,...DEFAULT_ORDER.filter(key=>!unique.includes(key))].slice(0,DEFAULT_ORDER.length);
  };
  const stored=read(KEY,{});
  let prefs={...stored,pageOrder:safeOrder(stored.pageOrder),appearance:stored.appearance||'auto',theme:THEMES[stored.theme]?stored.theme:'gold'};
  const persist=()=>{prefs.pageOrder=safeOrder(prefs.pageOrder);write(KEY,prefs)};

  function resolvedAppearance(){
    if(prefs.appearance==='light'||prefs.appearance==='dark')return prefs.appearance;
    const hour=Number(new Intl.DateTimeFormat('en-US',{hour:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(new Date()));
    return hour>=6&&hour<18?'light':'dark';
  }

  function applyTheme(){
    const appearance=resolvedAppearance();
    document.documentElement.dataset.taxiAppearance=appearance;
    document.documentElement.dataset.taxiTheme=prefs.theme;
    document.documentElement.style.colorScheme=appearance;
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta){
      const colors={
        light:{gold:'#f5f1e7',taxi511:'#f7f2e9',ocean:'#eff9fc',mono:'#f3f3f4'},
        dark:{gold:'#09090b',taxi511:'#080d17',ocean:'#071722',mono:'#101114'}
      };
      meta.content=colors[appearance][prefs.theme];
    }
    paintControls();
  }

  function currentPage(){
    const path=location.pathname;
    if(path.endsWith('/taxi/')||path.endsWith('/taxi/index.html'))return'drive';
    if(path.endsWith('/taxi/settings.html'))return'manage';
    if(path.endsWith('/taxi/calendar.html')){
      const visible=document.body.dataset.calendarPage;
      if(['today','week','month','manage'].includes(visible))return visible;
      const query=new URLSearchParams(location.search).get('page');
      if(['today','week','month','manage'].includes(query))return query;
      return localStorage.getItem('yos-taxi-calendar-page-v21')||'today';
    }
    return'drive';
  }

  function pageUrl(key){
    if(key==='drive')return'./';
    return`./calendar.html?page=${key}`;
  }

  function activateCalendarPage(key,replaceUrl=true){
    if(!['today','week','month','manage'].includes(key))return false;
    const button=document.querySelector(`#calendarPagesV21 button[data-page="${key}"]`);
    if(!button)return false;
    button.click();
    if(replaceUrl){
      const url=new URL(location.href);
      url.searchParams.set('page',key);
      history.replaceState({},'',url);
    }
    updateNavActive(key);
    return true;
  }

  function navigatePage(key){
    if(!PAGE_META[key])return;
    if(location.pathname.endsWith('/taxi/calendar.html')&&key!=='drive'&&activateCalendarPage(key,true))return;
    location.href=pageUrl(key);
  }

  function buildBottomNav(){
    let nav=document.getElementById('taxiGlobalNavV24');
    if(!nav){
      nav=document.createElement('nav');
      nav.id='taxiGlobalNavV24';
      nav.className='taxi-global-nav-v24';
      document.body.appendChild(nav);
    }
    nav.innerHTML=prefs.pageOrder.map(key=>`<button type="button" data-page="${key}"><span>${PAGE_META[key].icon}</span><b>${PAGE_META[key].label}</b></button>`).join('');
    nav.querySelectorAll('button').forEach(button=>button.onclick=()=>navigatePage(button.dataset.page));
    updateNavActive(currentPage());
  }

  function updateNavActive(key=currentPage()){
    document.querySelectorAll('#taxiGlobalNavV24 button').forEach(button=>button.classList.toggle('active',button.dataset.page===key));
  }

  function installModeButton(){
    if(document.getElementById('taxiModeQuickV24'))return;
    const top=document.querySelector('header.top');
    if(!top)return;
    const button=document.createElement('button');
    button.id='taxiModeQuickV24';
    button.type='button';
    button.className='taxi-mode-quick-v24';
    button.setAttribute('aria-label','昼夜モードを切り替える');
    const last=top.lastElementChild;
    last?top.insertBefore(button,last):top.appendChild(button);
    button.onclick=()=>{
      prefs.appearance=prefs.appearance==='auto'?'light':prefs.appearance==='light'?'dark':'auto';
      persist();
      applyTheme();
    };
    paintControls();
  }

  function paintControls(){
    const quick=document.getElementById('taxiModeQuickV24');
    if(quick){
      quick.textContent=prefs.appearance==='light'?'☀️':prefs.appearance==='dark'?'🌙':'◐';
      quick.title=prefs.appearance==='light'?'昼モード':prefs.appearance==='dark'?'夜モード':'自動モード';
    }
    document.querySelectorAll('#taxiAppearanceV24 button').forEach(button=>button.classList.toggle('active',button.dataset.value===prefs.appearance));
    document.querySelectorAll('#taxiThemesV24 button').forEach(button=>button.classList.toggle('active',button.dataset.theme===prefs.theme));
  }

  function displayPanel(){
    const panel=document.createElement('section');
    panel.id='taxiDisplayPanelV24';
    panel.className='panel';
    panel.dataset.settingsGroup='display';
    panel.innerHTML=`<h2>画面表示 <small>ページ順・昼夜モード・配色を変更します。</small></h2>
      <div class="taxi-setting-block-v24"><div class="taxi-setting-label-v24">昼夜モード</div><div id="taxiAppearanceV24" class="taxi-segmented-v24"><button data-value="light">☀️ 昼</button><button data-value="dark">🌙 夜</button><button data-value="auto">◐ 自動</button></div></div>
      <div class="taxi-setting-block-v24"><div class="taxi-setting-label-v24">配色テーマ</div><div id="taxiThemesV24" class="taxi-theme-grid-v24">${Object.entries(THEMES).map(([key,value])=>`<button data-theme="${key}"><b>${value.label}</b><small>${value.description}</small><span>${value.swatches.map(color=>`<i style="background:${color}"></i>`).join('')}</span></button>`).join('')}</div></div>
      <div class="taxi-setting-block-v24"><div class="taxi-setting-label-v24">スワイプ・下部ページの順番</div><div id="taxiPageOrderV24" class="taxi-order-list-v24"></div></div>`;
    panel.querySelectorAll('#taxiAppearanceV24 button').forEach(button=>button.onclick=()=>{
      prefs.appearance=button.dataset.value;
      persist();
      applyTheme();
    });
    panel.querySelectorAll('#taxiThemesV24 button').forEach(button=>button.onclick=()=>{
      prefs.theme=button.dataset.theme;
      persist();
      applyTheme();
    });
    return panel;
  }

  function renderOrderControls(){
    const box=document.getElementById('taxiPageOrderV24');
    if(!box)return;
    prefs.pageOrder=safeOrder(prefs.pageOrder);
    box.innerHTML=prefs.pageOrder.map((key,index)=>`<div data-key="${key}"><span>${PAGE_META[key].icon}</span><b>${PAGE_META[key].label}</b><button data-dir="up" ${index===0?'disabled':''}>↑</button><button data-dir="down" ${index===prefs.pageOrder.length-1?'disabled':''}>↓</button></div>`).join('');
    box.querySelectorAll('button').forEach(button=>button.onclick=()=>{
      const row=button.closest('[data-key]');
      const index=prefs.pageOrder.indexOf(row.dataset.key);
      const next=button.dataset.dir==='up'?index-1:index+1;
      if(next<0||next>=prefs.pageOrder.length)return;
      [prefs.pageOrder[index],prefs.pageOrder[next]]=[prefs.pageOrder[next],prefs.pageOrder[index]];
      persist();
      renderOrderControls();
      buildBottomNav();
    });
  }

  function installSettingsDisplay(){
    if(!location.pathname.endsWith('/taxi/settings.html')||document.getElementById('taxiDisplayPanelV24'))return;
    const wait=setInterval(()=>{
      const tabs=document.getElementById('settingsTabsV20');
      const app=document.querySelector('main.app');
      if(!tabs||!app)return;
      clearInterval(wait);
      const panel=displayPanel();
      const actions=[...app.children].find(node=>node.classList?.contains('actions')&&!node.classList.contains('two'));
      actions?app.insertBefore(panel,actions):app.appendChild(panel);
      const button=document.createElement('button');
      button.type='button';
      button.dataset.tab='display';
      button.textContent='表示';
      tabs.appendChild(button);
      button.onclick=()=>{
        localStorage.setItem(SETTINGS_TAB_KEY,'display');
        document.querySelectorAll('main.app > .panel').forEach(item=>item.classList.toggle('settings-active-v20',item===panel));
        tabs.querySelectorAll('button').forEach(item=>item.classList.toggle('active',item===button));
      };
      if(localStorage.getItem(SETTINGS_TAB_KEY)==='display')button.click();
      renderOrderControls();
      paintControls();
    },60);
  }

  function installCalendarQuery(){
    if(!location.pathname.endsWith('/taxi/calendar.html'))return;
    const requested=new URLSearchParams(location.search).get('page');
    if(!['today','week','month','manage'].includes(requested))return;
    const wait=setInterval(()=>{
      if(activateCalendarPage(requested,false)){
        clearInterval(wait);
        updateNavActive(requested);
      }
    },60);
    setTimeout(()=>clearInterval(wait),6000);
  }

  function installSwipe(){
    const host=document.querySelector('main.app');
    if(!host||host.dataset.taxiSwipeInstalled==='1')return;
    host.dataset.taxiSwipeInstalled='1';
    let startX=0,startY=0,tracking=false,swiping=false,lastSwipeAt=0;

    host.addEventListener('touchstart',event=>{
      if(document.querySelector('dialog[open]')||event.touches.length!==1)return;
      const touch=event.touches[0];
      startX=touch.clientX;
      startY=touch.clientY;
      tracking=true;
      swiping=false;
    },{passive:true});

    host.addEventListener('touchmove',event=>{
      if(!tracking||event.touches.length!==1)return;
      const touch=event.touches[0];
      const dx=touch.clientX-startX;
      const dy=touch.clientY-startY;
      if(Math.abs(dx)>24&&Math.abs(dx)>Math.abs(dy)*1.25){
        swiping=true;
        event.preventDefault();
      }
    },{passive:false});

    host.addEventListener('touchend',event=>{
      if(!tracking)return;
      tracking=false;
      const touch=event.changedTouches[0];
      const dx=touch.clientX-startX;
      const dy=touch.clientY-startY;
      if(!swiping||Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.25)return;
      lastSwipeAt=Date.now();
      const order=safeOrder(prefs.pageOrder);
      const current=currentPage();
      const index=order.indexOf(current);
      if(index<0)return;
      const next=dx<0?index+1:index-1;
      if(next>=0&&next<order.length)navigatePage(order[next]);
    },{passive:true});

    host.addEventListener('click',event=>{
      if(Date.now()-lastSwipeAt<450){
        event.preventDefault();
        event.stopPropagation();
      }
    },true);
  }

  applyTheme();
  buildBottomNav();
  installModeButton();
  installSettingsDisplay();
  installCalendarQuery();
  installSwipe();
  setInterval(()=>{
    if(prefs.appearance==='auto')applyTheme();
    updateNavActive();
  },30000);
})();
