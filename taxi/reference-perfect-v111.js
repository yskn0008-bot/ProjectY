'use strict';
(()=>{
  if(window.__yosTaxiReferencePerfectV111)return;
  window.__yosTaxiReferencePerfectV111=true;

  const OPS_KEY='yos-taxi-ops-v1';
  const TAXI_KEY='yos-taxi-settings-v2';
  const CAL_KEY='yos-taxi-calendar-v1';
  const CAL_SET_KEY='yos-taxi-calendar-settings-v3';
  const LAST_CAL_KEY='yos-taxi-reference-calendar-v111';
  const SHELL_ID='yosReferencePerfectV111';
  const NAV_ID='taxiGlobalNavV24';
  const money=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n||0));
  const num=n=>Number.isFinite(Number(n))?Number(n):0;
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const pad=n=>String(n).padStart(2,'0');
  const keyOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const fromKey=k=>new Date(`${k}T12:00:00`);
  const businessToday=()=>{const d=new Date();if(d.getHours()<8)d.setDate(d.getDate()-1);return d};
  const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const isWork=s=>s==='work'||s==='transferWork';
  const isOff=s=>s==='off'||s==='transferOff';
  const timeHours=(start,end)=>{if(!start||!end)return 0;const [a,b]=[start,end].map(v=>v.split(':').map(Number)).map(v=>v[0]*60+v[1]);return Math.max(0,((b<=a?b+1440:b)-a)/60)};
  const monthKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  const weekStart=d=>{const s=new Date(d);s.setDate(s.getDate()-s.getDay());return s};
  const svg=name=>({
    drive:'<svg viewBox="0 0 24 24"><path d="M5 17h14l-1.1-5.7A2.4 2.4 0 0 0 15.5 9h-7a2.4 2.4 0 0 0-2.4 2.3L5 17Z"/><path d="M7 9l1.2-3h7.6L17 9M4 13h16M7 17v2M17 17v2"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/></svg>',
    today:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 9h16"/><path d="M9 13h6v4H9z"/></svg>',
    nav:'<svg viewBox="0 0 24 24"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>',
    calendar:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 9h18M7 13h3M14 13h3M7 17h3M14 17h3"/></svg>',
    manage:'<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5h6v2M4 12h16M10 12v2h4v-2"/></svg>',
    bell:'<svg viewBox="0 0 24 24"><path d="M6 17h12l-1.5-2V10a4.5 4.5 0 0 0-9 0v5L6 17Z"/><path d="M10 20h4"/></svg>',
    plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    chart:'<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/></svg>',
    wheel:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6M5 9l5 2M19 9l-5 2M7 18l4-5M17 18l-4-5"/></svg>',
    report:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></svg>',
    pin:'<svg viewBox="0 0 24 24"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>',
    gauge:'<svg viewBox="0 0 24 24"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 14l4-4M7 18h10"/></svg>',
    yen:'<svg viewBox="0 0 24 24"><path d="M7 4l5 7 5-7M8 12h8M8 16h8M12 11v9"/></svg>',
    target:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
    export:'<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 13v7h14v-7"/></svg>'
  }[name]||'');

  let focus=businessToday();
  let lastMarkup='';
  let raf=0;

  function page(){
    const path=location.pathname;
    if(path.endsWith('/taxi/')||path.endsWith('/taxi/index.html'))return'drive';
    if(path.endsWith('/taxi/settings.html'))return'settings';
    const q=new URLSearchParams(location.search).get('page');
    if(['today','week','month','manage'].includes(q))return q;
    return localStorage.getItem(LAST_CAL_KEY)||'month';
  }

  function data(){
    const ops=read(OPS_KEY,{businessDate:keyOf(businessToday()),status:'before',events:[]});
    const taxi=read(TAXI_KEY,{targetSales:0,vehicle:'',plannedStart:'17:30',plannedEnd:'03:30',areas:''});
    const cal=read(CAL_KEY,{monthlyGoals:{},days:{}});cal.monthlyGoals=cal.monthlyGoals||{};cal.days=cal.days||{};
    const calSet=read(CAL_SET_KEY,{shiftStart:'17:30',serviceEnd:'03:30',workEnd:'03:30',months:{}});calSet.months=calSet.months||{};
    return{ops,taxi,cal,calSet};
  }

  function dayData(ctx,key){
    const base={status:'unknown',shiftStart:ctx.calSet.shiftStart||'17:30',serviceEnd:ctx.calSet.serviceEnd||'03:30',workEnd:ctx.calSet.workEnd||ctx.calSet.serviceEnd||'03:30',actualHours:0,target:0,sales:0,weather:'未確認',event:'',reportTrips:0};
    return{...base,...(ctx.cal.days[key]||{})};
  }

  function browserBottom(){
    if(isStandalone())return 0;
    const vv=window.visualViewport;
    if(!vv)return 32;
    const measured=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));
    return Math.min(56,Math.max(28,measured||32));
  }

  function applyViewport(){
    document.documentElement.style.setProperty('--rp-browser-bottom',`${browserBottom()}px`);
    document.documentElement.classList.toggle('rp-standalone-v111',isStandalone());
  }

  function navMarkup(active){
    const items=[['drive','営業'],['today','今日'],['nav','ナビ'],['calendar','カレンダー'],['manage','管理']];
    return`<nav id="${NAV_ID}" class="rp-bottom-nav" data-nav-version="101" aria-label="YOS Taxi メニュー">${items.map(([key,label])=>`<button type="button" data-page="${key}" class="${active===key?'active':''}" aria-label="${label}" ${active===key?'aria-current="page"':''}><span>${svg(key)}</span><b>${label}</b></button>`).join('')}</nav>`;
  }

  function activeNav(current){return current==='drive'?'drive':current==='today'?'today':current==='manage'||current==='settings'?'manage':current==='week'||current==='month'?'calendar':''}

  function route(key){
    if(key==='nav'){location.href='../nav/';return}
    if(key==='drive'){location.href='./index.html';return}
    if(key==='today'){location.href='./calendar.html?page=today';return}
    if(key==='manage'){location.href='./calendar.html?page=manage';return}
    const last=['week','month'].includes(localStorage.getItem(LAST_CAL_KEY))?localStorage.getItem(LAST_CAL_KEY):'month';
    location.href=`./calendar.html?page=${last}`;
  }

  function bindNav(shell,current){
    shell.querySelectorAll(`#${NAV_ID} button[data-page]`).forEach(button=>button.onclick=()=>route(button.dataset.page));
    const nav=shell.querySelector(`#${NAV_ID}`);
    if(nav&&nav.parentElement!==document.body)document.body.appendChild(nav);
    if(nav){
      nav.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.page===activeNav(current)));
      nav.style.setProperty('bottom','calc(var(--rp-browser-bottom, 32px) + env(safe-area-inset-bottom) + 6px)','important');
    }
  }

  function shellBase(title,action=''){
    return`<header class="rp-header"><h1>${title}</h1>${action}</header>`;
  }

  function ring(pct,size='large'){
    const degree=Math.max(0,Math.min(100,pct))*3.6;
    return`<div class="rp-ring rp-ring-${size}" style="--rp-degree:${degree}deg"><div><strong>${Math.round(pct)}%</strong></div></div>`;
  }

  function driveView(ctx){
    const events=Array.isArray(ctx.ops.events)?ctx.ops.events:[];
    const rides=events.filter(e=>e.type==='降車');
    const sales=rides.reduce((sum,e)=>sum+num(e.fare)+num(e.tip),0);
    const target=num(ctx.taxi.targetSales||dayData(ctx,ctx.ops.businessDate||keyOf(businessToday())).target);
    const pct=target?sales/target*100:0;
    const distance=rides.reduce((sum,e)=>sum+num(e.distance),0);
    const tips=rides.reduce((sum,e)=>sum+num(e.tip),0);
    const avg=rides.length?sales/rides.length:0;
    const idle=ctx.ops.status==='available'&&ctx.ops.availableSince?Math.max(0,Date.now()-new Date(ctx.ops.availableSince).getTime()):0;
    const idleMin=Math.floor(idle/60000);
    const latest=events[0]||{};
    const area=latest.dropoff||latest.pickup||String(ctx.taxi.areas||'未確認').split('・')[0]||'未確認';
    const meta={before:['営業前','営業開始'],available:['空車・待機','乗車'],occupied:['乗車中','降車'],break:['休憩中','休憩終了'],ended:['営業終了','YOSへ送る']}[ctx.ops.status]||['営業前','営業開始'];
    const primaryId={before:'shiftButton',available:'rideButton',occupied:'dropoffButton',break:'breakButton',ended:'shareButton'}[ctx.ops.status]||'shiftButton';
    return`${shellBase('営業',`<button class="rp-header-icon" data-action="notice" aria-label="通知">${svg('bell')}</button>`)}
      <section class="rp-card rp-sales-card">
        <div class="rp-sales-copy"><span>本日の売上</span><strong>${money(sales)}</strong><small>目標 ${money(target)}</small><i><b style="width:${Math.min(100,pct)}%"></b></i></div>
        ${ring(pct)}
        <button class="rp-primary-action" data-proxy="${primaryId}">${escapeHtml(meta[1])}</button>
      </section>
      <section class="rp-three-metrics"><div><span>実車</span><strong>${rides.length}回</strong></div><div><span>走行</span><strong>${distance.toFixed(distance%1?1:0)}km</strong></div><div><span>チップ</span><strong>${money(tips)}</strong></div></section>
      <section class="rp-card rp-status-card"><h2>現在の状況</h2><dl><div><dt>状態</dt><dd>${escapeHtml(meta[0])}</dd></div><div><dt>エリア</dt><dd>${escapeHtml(area)}</dd></div><div><dt>平均単価</dt><dd>${money(avg)}</dd></div><div><dt>空車時間</dt><dd>${idleMin}分</dd></div></dl></section>
      <section class="rp-card rp-action-card"><h2>判断とアクション</h2><div class="rp-action-row"><button data-go="nav">エリア選択</button><button data-proxy="memoButton">状況メモ</button><button class="accent" data-go="nav">${svg('nav')}ナビ</button></div></section>
      <section class="rp-card rp-command-card"><h2>データと司令室</h2><div><button data-calendar="week">週間カレンダー</button><button data-calendar="month">月間カレンダー</button><button data-calendar="manage">月次管理</button><button data-go="nav">YOSナビ</button></div></section>
      <details class="rp-card rp-operations"><summary>その他の営業操作</summary><div><button data-proxy="breakButton">休憩</button><button data-proxy="settingsButton">設定</button><button data-proxy="shareButton">YOSへ送る</button><button data-proxy="endButton">営業終了</button></div></details>`;
  }

  function addMinutes(clock,minutes){
    const [h,m]=(clock||'00:00').split(':').map(Number);let total=h*60+m+minutes;while(total<0)total+=1440;total%=1440;return`${pad(Math.floor(total/60))}:${pad(total%60)}`;
  }

  function todayView(ctx){
    const key=keyOf(focus),v=dayData(ctx,key);
    const start=v.shiftStart||ctx.taxi.plannedStart||'17:30',service=v.serviceEnd||ctx.taxi.plannedEnd||'03:30',workEnd=v.workEnd||service;
    const entries=[[addMinutes(start,-60),'起床・準備'],[start,'営業開始'],['22:00','需要ピーク確認'],['00:30','休憩・再配置'],[service,'乗務終了'],[workEnd,'振り返り・記録']];
    const now=new Date(),today=key===keyOf(businessToday()),nowMinutes=(now.getHours()<8?1440:0)+now.getHours()*60+now.getMinutes();
    return`${shellBase('今日の予定','<button class="rp-header-icon" data-edit-day="1" aria-label="予定を編集">'+svg('plus')+'</button>')}
      <div class="rp-date-switch"><button data-shift-day="-1">‹</button><strong>${new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(focus)}</strong><button data-shift-day="1">›</button></div>
      <section class="rp-card rp-schedule-card"><h2>予定リスト</h2>${entries.map(([time,label])=>{const checked=today&&(nowMinutes>=((Number(time.split(':')[0])<8?1440:0)+Number(time.split(':')[0])*60+Number(time.split(':')[1])));return`<button class="rp-schedule-row ${checked?'done':''}" data-edit-day="1"><time>${time}</time><span>${label}</span><i>${checked?'✓':''}</i></button>`}).join('')}</section>
      <section class="rp-card rp-memo-card"><h2>メモ</h2><button data-edit-day="1">${escapeHtml(v.event||'メモを入力…')}</button></section>`;
  }

  function weekView(ctx){
    localStorage.setItem(LAST_CAL_KEY,'week');
    const start=weekStart(focus),end=new Date(start);end.setDate(start.getDate()+6);
    const cards=[];
    for(let i=0;i<7;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);const key=keyOf(d),v=dayData(ctx,key);const pct=num(v.target)?num(v.sales)/num(v.target)*100:0;
      cards.push(`<button class="rp-week-day ${isOff(v.status)?'off':''}" data-day-key="${key}"><div class="rp-week-date"><strong>${d.getMonth()+1}/${d.getDate()}</strong><small>${'日月火水木金土'[d.getDay()]}</small></div>${isOff(v.status)?'<div class="rp-off-panel"><b>☾</b><strong>公休</strong></div>':`<div class="rp-week-money"><strong>${money(v.sales)}</strong><small>${money(v.target)}</small></div>${ring(pct,'small')}<div class="rp-week-foot"><span>実車 ${num(v.reportTrips)||'—'}</span><span>実働 ${num(v.actualHours)?num(v.actualHours).toFixed(1):'—'}</span></div>`}</button>`);
    }
    return`${shellBase(`${start.getMonth()+1}/${start.getDate()}(${'日月火水木金土'[start.getDay()]}) 〜 ${end.getMonth()+1}/${end.getDate()}(${'日月火水木金土'[end.getDay()]})`,'<button class="rp-header-icon" data-switch-calendar="month" aria-label="月間カレンダー">'+svg('calendar')+'</button>')}
      <div class="rp-period-arrows"><button data-shift-week="-1">‹</button><button data-shift-week="1">›</button></div>
      <section class="rp-week-strip">${cards.join('')}</section>`;
  }

  function shortSales(n){if(!num(n))return'–';return`${Math.round(num(n)/1000)}K`}

  function monthView(ctx){
    localStorage.setItem(LAST_CAL_KEY,'month');
    const y=focus.getFullYear(),m=focus.getMonth(),start=new Date(y,m,1-new Date(y,m,1).getDay()),cells=[];
    for(let i=0;i<42;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);const key=keyOf(d),v=dayData(ctx,key),same=d.getMonth()===m,pct=num(v.target)?num(v.sales)/num(v.target)*100:0;
      const perf=num(v.sales)?(pct>=100?'achieved':pct<60?'shortfall':'near'):'';
      cells.push(`<button class="rp-month-cell ${same?'':'other'} ${isOff(v.status)?'off':''} ${key===keyOf(businessToday())?'today':''}" data-day-key="${key}"><span>${d.getDate()}</span>${isOff(v.status)?'<b class="rp-moon">☾</b><small>公休</small>':`<strong>${shortSales(v.sales||v.target)}</strong>${perf?`<i class="${perf}">${perf==='achieved'?'○':perf==='shortfall'?'▲':'△'}</i>`:''}`}</button>`);
    }
    return`${shellBase('月間カレンダー','<button class="rp-header-icon" data-switch-calendar="week" aria-label="週間カレンダー">'+svg('calendar')+'</button>')}
      <div class="rp-month-period"><button data-shift-month="-1">‹</button><strong>${y}年${m+1}月</strong><button data-shift-month="1">›</button></div>
      <div class="rp-week-head"><b>日</b><b>月</b><b>火</b><b>水</b><b>木</b><b>金</b><b>土</b></div>
      <section class="rp-month-grid">${cells.join('')}</section>
      <div class="rp-month-legend"><span class="green">○ 達成（100%以上）</span><span class="amber">△ 未達成（100%未満）</span><span class="red">▲ 大幅未達</span><span class="violet">☾ 公休日</span></div>`;
  }

  function monthlyMetrics(ctx){
    const mk=monthKey(focus),entries=Object.entries(ctx.cal.days).filter(([key])=>key.startsWith(mk)),cfg={hourLimit:288,carryHours:0,carrySales:0,...(ctx.calSet.months?.[mk]||{})};
    const goal=num(ctx.cal.monthlyGoals[mk]||770000),achieved=num(cfg.carrySales)+entries.reduce((s,[,v])=>s+num(v.sales),0),worked=num(cfg.carryHours)+entries.reduce((s,[,v])=>s+num(v.actualHours),0);
    const today=keyOf(businessToday()),leftDays=entries.filter(([key,v])=>key>=today&&isWork(v.status)).length;
    return{goal,achieved,remaining:Math.max(0,goal-achieved),leftDays,hourLimit:num(cfg.hourLimit||288),worked,remainingHours:Math.max(0,num(cfg.hourLimit||288)-worked),progress:goal?Math.round(achieved/goal*100):0};
  }

  function manageView(){
    const tiles=[['chart','売上管理','metrics'],['wheel','実車管理','drive'],['report','日報一覧','reports'],['pin','エリア分析','nav'],['gauge','走行データ','sheet'],['yen','収支管理','metrics'],['target','目標設定','settings'],['export','データ出力','export']];
    return`${shellBase('月次管理')}
      <div class="rp-manage-period"><button data-shift-month="-1">‹</button><strong>${focus.getFullYear()}年${focus.getMonth()+1}月</strong><button data-shift-month="1">›</button></div>
      <section class="rp-manage-grid">${tiles.map(([icon,label,action])=>`<button data-manage="${action}"><span>${svg(icon)}</span><b>${label}</b></button>`).join('')}</section>`;
  }

  function createManageDialog(ctx){
    document.getElementById('rpManageDialogV111')?.remove();
    const m=monthlyMetrics(ctx),dialog=document.createElement('dialog');dialog.id='rpManageDialogV111';dialog.className='rp-dialog';
    dialog.innerHTML=`<div class="rp-dialog-head"><h2>月次サマリー</h2><button>閉じる</button></div><div class="rp-dialog-metrics"><div><span>月目標</span><strong>${money(m.goal)}</strong></div><div><span>現在達成</span><strong class="green">${money(m.achieved)}</strong></div><div><span>残り金額</span><strong class="red">${money(m.remaining)}</strong></div><div><span>残り勤務日</span><strong>${m.leftDays}日</strong></div><div><span>実勤務時間</span><strong>${m.worked.toFixed(1)}時間</strong></div><div><span>売上達成率</span><strong>${m.progress}%</strong></div></div>`;
    document.body.appendChild(dialog);dialog.querySelector('button').onclick=()=>dialog.close();return dialog;
  }

  function exportData(){
    const payload={operations:read(OPS_KEY,{}),taxiSettings:read(TAXI_KEY,{}),calendar:read(CAL_KEY,{}),calendarSettings:read(CAL_SET_KEY,{})};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`yos-taxi-backup-${keyOf(businessToday())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function bind(shell,current,ctx){
    bindNav(shell,current);
    shell.querySelectorAll('[data-go="nav"]').forEach(el=>el.onclick=()=>route('nav'));
    shell.querySelectorAll('[data-proxy]').forEach(el=>el.onclick=()=>document.getElementById(el.dataset.proxy)?.click());
    shell.querySelectorAll('[data-calendar]').forEach(el=>el.onclick=()=>location.href=`./calendar.html?page=${el.dataset.calendar}`);
    shell.querySelectorAll('[data-shift-day]').forEach(el=>el.onclick=()=>{focus.setDate(focus.getDate()+Number(el.dataset.shiftDay));render(true)});
    shell.querySelectorAll('[data-shift-week]').forEach(el=>el.onclick=()=>{focus.setDate(focus.getDate()+7*Number(el.dataset.shiftWeek));render(true)});
    shell.querySelectorAll('[data-shift-month]').forEach(el=>el.onclick=()=>{focus.setMonth(focus.getMonth()+Number(el.dataset.shiftMonth));render(true)});
    shell.querySelectorAll('[data-switch-calendar]').forEach(el=>el.onclick=()=>location.href=`./calendar.html?page=${el.dataset.switchCalendar}`);
    shell.querySelectorAll('[data-edit-day],[data-day-key]').forEach(el=>el.onclick=()=>{const key=el.dataset.dayKey||keyOf(focus);if(typeof window.openDay==='function')window.openDay(key);else document.getElementById('editToday')?.click()});
    shell.querySelector('[data-action="notice"]')?.addEventListener('click',()=>alert('営業中の重要通知はここへ表示します。'));
    shell.querySelectorAll('[data-manage]').forEach(el=>el.onclick=()=>{
      const action=el.dataset.manage;
      if(action==='metrics'){createManageDialog(ctx).showModal();return}
      if(action==='drive'){location.href='./index.html';return}
      if(action==='reports'||action==='sheet'){location.href='https://docs.google.com/spreadsheets/d/1-Fszb0ksSDX-3xKiZBN1yV710QJtKCBfpAqdE04Mw5k/edit';return}
      if(action==='nav'){route('nav');return}
      if(action==='settings'){location.href='./settings.html';return}
      if(action==='export'){exportData()}
    });
  }

  function installSwipe(shell,current){
    if(!['drive','today','week','month','manage'].includes(current))return;
    const order=['drive','today','calendar','manage'];
    const key=current==='week'||current==='month'?'calendar':current;
    let sx=0,sy=0,tracking=false;
    shell.ontouchstart=e=>{if(e.touches.length!==1||e.target.closest('button,input,select,textarea,dialog'))return;tracking=true;sx=e.touches[0].clientX;sy=e.touches[0].clientY};
    shell.ontouchend=e=>{if(!tracking)return;tracking=false;const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.3)return;const index=order.indexOf(key),next=dx<0?index+1:index-1;if(next>=0&&next<order.length)route(order[next])};
  }

  function render(force=false){
    const current=page(),ctx=data();
    applyViewport();
    let shell=document.getElementById(SHELL_ID);
    if(!shell){shell=document.createElement('main');shell.id=SHELL_ID;shell.className='rp-shell';document.body.prepend(shell)}
    const source=document.querySelector('main.app');
    if(current!=='settings'&&source)source.classList.add('rp-source-hidden-v111');
    if(current==='settings'){
      source?.classList.remove('rp-source-hidden-v111');
      document.documentElement.classList.add('rp-settings-page-v111');
      let nav=document.getElementById(NAV_ID);if(!nav){const holder=document.createElement('div');holder.innerHTML=navMarkup('manage');nav=holder.firstElementChild;document.body.appendChild(nav)}
      nav.querySelectorAll('button').forEach(button=>button.onclick=()=>route(button.dataset.page));
      return;
    }
    document.documentElement.classList.remove('rp-settings-page-v111');
    const content=current==='drive'?driveView(ctx):current==='today'?todayView(ctx):current==='week'?weekView(ctx):current==='month'?monthView(ctx):manageView(ctx);
    const markup=`<div class="rp-page rp-page-${current}">${content}</div>${navMarkup(activeNav(current))}`;
    if(force||markup!==lastMarkup){document.querySelectorAll(`#${NAV_ID}`).forEach(node=>{if(!shell.contains(node))node.remove()});shell.innerHTML=markup;lastMarkup=markup;bind(shell,current,ctx);installSwipe(shell,current)}
  }

  function schedule(force=false){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>render(force))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(true),{once:true});else schedule(true);
  addEventListener('pageshow',()=>schedule(true));
  addEventListener('resize',()=>schedule(false),{passive:true});
  window.visualViewport?.addEventListener('resize',()=>schedule(false),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(true)});
  addEventListener('storage',()=>schedule(true));
  setInterval(()=>schedule(false),1000);
})();
