'use strict';
(()=>{
  if(window.__yosFinalAppV131)return;
  window.__yosFinalAppV131=true;

  const OPS_KEY='yos-taxi-ops-v1';
  const TAXI_KEY='yos-taxi-settings-v2';
  const CAL_KEY='yos-taxi-calendar-v1';
  const CAL_SET_KEY='yos-taxi-calendar-settings-v3';
  const LAST_CAL_KEY='yos-taxi-final-calendar-v131';
  const ROOT_ID='yosFinalAppV131';
  const VERSION='131';

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const money=value=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(num(value));
  const compact=value=>num(value)?`${Math.round(num(value)/1000)}K`:'—';
  const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const pad=value=>String(value).padStart(2,'0');
  const keyOf=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  const businessToday=()=>{const d=new Date();if(d.getHours()<8)d.setDate(d.getDate()-1);return d};
  const isOff=status=>status==='off'||status==='transferOff';
  const monthKey=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}`;
  const weekStart=date=>{const d=new Date(date);d.setDate(d.getDate()-d.getDay());return d};
  const timeHours=(start,end)=>{if(!start||!end)return 0;const toMin=value=>{const [h,m]=String(value).split(':').map(Number);return h*60+m};const a=toMin(start),b=toMin(end);return Math.max(0,((b<=a?b+1440:b)-a)/60)};

  let focus=businessToday();
  let refreshTimer=0;
  let viewportRaf=0;

  const svg=name=>({
    drive:'<svg viewBox="0 0 24 24"><path d="M5 17h14l-1.1-5.7A2.4 2.4 0 0 0 15.5 9h-7a2.4 2.4 0 0 0-2.4 2.3L5 17Z"/><path d="M7 9l1.2-3h7.6L17 9M4 13h16M7 17v2M17 17v2"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/></svg>',
    today:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 9h16"/><path d="M9 13h6v4H9z"/></svg>',
    nav:'<svg viewBox="0 0 24 24"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>',
    calendar:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 9h18M7 13h3M14 13h3M7 17h3M14 17h3"/></svg>',
    manage:'<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5h6v2M4 12h16M10 12v2h4v-2"/></svg>',
    bell:'<svg viewBox="0 0 24 24"><path d="M6 17h12l-1.5-2V10a4.5 4.5 0 0 0-9 0v5L6 17Z"/><path d="M10 20h4"/></svg>',
    chart:'<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/></svg>',
    wheel:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6M5 9l5 2M19 9l-5 2M7 18l4-5M17 18l-4-5"/></svg>',
    report:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></svg>',
    pin:'<svg viewBox="0 0 24 24"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>',
    target:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
    export:'<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 13v7h14v-7"/></svg>'
  }[name]||'');

  function pageType(){
    if(location.pathname.endsWith('/taxi/')||location.pathname.endsWith('/taxi/index.html'))return'drive';
    if(location.pathname.endsWith('/taxi/settings.html'))return'settings';
    const query=new URLSearchParams(location.search).get('page');
    return['today','week','month','manage'].includes(query)?query:'month';
  }

  function context(){
    const ops=read(OPS_KEY,{businessDate:keyOf(businessToday()),status:'before',events:[]});
    const taxi=read(TAXI_KEY,{targetSales:0,plannedStart:'17:30',plannedEnd:'03:30',areas:''});
    const cal=read(CAL_KEY,{monthlyGoals:{},days:{}});cal.days=cal.days||{};cal.monthlyGoals=cal.monthlyGoals||{};
    const calSet=read(CAL_SET_KEY,{shiftStart:'17:30',serviceEnd:'03:30',workEnd:'03:30',months:{}});calSet.months=calSet.months||{};
    return{ops,taxi,cal,calSet};
  }

  function dayData(c,key){return{status:'unknown',shiftStart:c.calSet.shiftStart||'17:30',serviceEnd:c.calSet.serviceEnd||'03:30',workEnd:c.calSet.workEnd||'03:30',actualHours:0,target:0,sales:0,reportTrips:0,event:'',...(c.cal.days[key]||{})}}
  function performance(actual,target){const a=num(actual),t=num(target);if(!a)return'yos131-muted';if(!t)return'yos131-gold';if(a>=t)return'yos131-green';if(a<t*.8)return'yos131-red';return'yos131-gold'}

  function updateViewport(){
    viewportRaf=0;
    const vv=window.visualViewport;
    const top=Math.max(0,Math.round(vv?.offsetTop||0));
    const height=Math.max(320,Math.round(vv?.height||window.innerHeight));
    document.documentElement.style.setProperty('--yos131-vv-top',`${top}px`);
    document.documentElement.style.setProperty('--yos131-vv-height',`${height}px`);
  }
  function scheduleViewport(){if(viewportRaf)return;viewportRaf=requestAnimationFrame(updateViewport)}

  function route(key){
    if(key==='nav'){location.href='../nav/';return}
    if(key==='drive'){location.href=`./index.html?v=${VERSION}`;return}
    if(key==='today'){location.href=`./calendar.html?page=today&v=${VERSION}`;return}
    if(key==='manage'){location.href=`./calendar.html?page=manage&v=${VERSION}`;return}
    const last=localStorage.getItem(LAST_CAL_KEY)==='week'?'week':'month';
    location.href=`./calendar.html?page=${last}&v=${VERSION}`;
  }

  function nav(active){
    const items=[['drive','営業'],['today','今日'],['nav','ナビ'],['calendar','カレンダー'],['manage','管理']];
    return`<nav class="yos131-nav" aria-label="YOS Taxi メニュー">${items.map(([key,label])=>`<button type="button" data-nav="${key}" class="${active===key?'active':''}">${svg(key)}<b>${label}</b></button>`).join('')}</nav>`;
  }
  function header(title,left='',right=''){return`<header class="yos131-header"><div>${left}</div><h1>${title}</h1><div>${right}</div></header>`}

  function drive(c){
    const events=Array.isArray(c.ops.events)?c.ops.events:[];
    const rides=events.filter(event=>event.type==='降車');
    const sales=rides.reduce((sum,event)=>sum+num(event.fare)+num(event.tip),0);
    const target=num(c.taxi.targetSales||dayData(c,c.ops.businessDate||keyOf(businessToday())).target);
    const pct=target?Math.min(100,Math.round(sales/target*100)):0;
    const avg=rides.length?Math.round(sales/rides.length):0;
    const work=timeHours(c.taxi.plannedStart||'17:30',c.taxi.plannedEnd||'03:30');
    const rideHours=rides.reduce((sum,event)=>sum+num(event.durationMs)/3600000,0);
    const util=work?Math.round(rideHours/work*100):0;
    const latest=events[0]||{};
    const area=latest.dropoff||latest.pickup||String(c.taxi.areas||'未確認').split(/[・,]/)[0]||'未確認';
    const idle=c.ops.status==='available'&&c.ops.availableSince?Math.max(0,Math.floor((Date.now()-new Date(c.ops.availableSince))/60000)):0;
    const meta={before:['営業前','営業開始','shiftButton'],available:['空車','乗車','rideButton'],occupied:['乗車中','降車','dropoffButton'],break:['休憩中','休憩終了','breakButton'],ended:['営業終了','YOSへ送る','shareButton']}[c.ops.status]||['営業前','営業開始','shiftButton'];
    const advice=c.ops.status==='before'?'営業開始で記録を始める':c.ops.status==='occupied'?'安全運転を最優先':c.ops.status==='break'?'休憩後にYOSナビで再配置':idle>=15?'空車15分超。エリアを見直す':'現在地で営業を継続';
    return`<main class="yos131-page yos131-drive">
      ${header('営業','',`<button class="yos131-icon-btn" data-notice>${svg('bell')}</button>`)}
      <section class="yos131-card yos131-sales">
        <div class="yos131-sales-copy"><span>本日の売上</span><strong>${money(sales)}</strong><small>目標 ${money(target)}</small><div class="yos131-progress"><b style="width:${pct}%"></b></div></div>
        <div class="yos131-ring" style="--pct:${pct*3.6}deg"><strong>${pct}%</strong></div>
        <div class="yos131-state"><div><small>状態</small><b>${esc(meta[0])}</b></div><div><small>エリア</small><b>${esc(area)}</b></div><div><small>空車</small><b>${idle}分</b></div></div>
        <button class="yos131-primary" data-proxy="${meta[2]}">${meta[1]}</button>
      </section>
      <section class="yos131-card yos131-advice" data-go-nav><span>YOS判断</span><strong>${esc(advice)}</strong><span class="arrow">›</span></section>
      <section class="yos131-kpis"><div><span>実車</span><strong>${rides.length}回</strong></div><div><span>実車率</span><strong>${util}%</strong></div><div><span>平均単価</span><strong>${money(avg)}</strong></div></section>
      <section class="yos131-card yos131-actions"><button data-proxy="breakButton">休憩</button><button data-proxy="memoButton">メモ</button><button class="accent" data-go-nav>ナビ</button><button data-proxy="endButton">終了</button></section>
    </main>`;
  }

  function addMinutes(clock,minutes){const [h,m]=(clock||'00:00').split(':').map(Number);let total=h*60+m+minutes;while(total<0)total+=1440;total%=1440;return`${pad(Math.floor(total/60))}:${pad(total%60)}`}

  function today(c){
    const key=keyOf(focus),v=dayData(c,key),target=num(v.target||c.taxi.targetSales),actual=num(v.sales),pct=target?Math.round(actual/target*100):0;
    const start=v.shiftStart||c.taxi.plannedStart||'17:30',service=v.serviceEnd||c.taxi.plannedEnd||'03:30',workEnd=v.workEnd||service;
    const rows=[[addMinutes(start,-60),'起床・準備'],[start,'営業開始'],['22:00','需要ピーク確認'],['00:30','休憩・再配置'],[service,'乗務終了'],[workEnd,'振り返り・記録']];
    return`<main class="yos131-page yos131-today">
      ${header('今日の予定','',`<button class="yos131-icon-btn" data-edit-day="${key}">＋</button>`)}
      <section class="yos131-card yos131-summary3"><div><span>目標</span><strong>${money(target)}</strong></div><div><span>実績</span><strong class="${performance(actual,target)}">${money(actual)}</strong></div><div><span>達成率</span><strong>${pct}%</strong></div></section>
      <div class="yos131-datebar"><button data-day-shift="-1">‹</button><strong>${new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'short'}).format(focus)}</strong><button data-day-shift="1">›</button></div>
      <section class="yos131-card yos131-schedule">${rows.map(([time,label])=>`<button class="yos131-schedule-row" data-edit-day="${key}"><time>${time}</time><span>${label}</span><i></i></button>`).join('')}</section>
      <section class="yos131-card yos131-memo"><button data-edit-day="${key}">${esc(v.event||'今日の注意・イベントを入力')}</button></section>
    </main>`;
  }

  function week(c){
    localStorage.setItem(LAST_CAL_KEY,'week');
    const start=weekStart(focus),end=new Date(start);end.setDate(start.getDate()+6);let actualSum=0,targetSum=0,rows='';
    for(let i=0;i<7;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);const key=keyOf(d),v=dayData(c,key),actual=num(v.sales),target=num(v.target),pct=target?Math.round(actual/target*100):0;actualSum+=actual;targetSum+=target;
      rows+=isOff(v.status)
        ?`<button class="yos131-week-row off" data-edit-day="${key}"><span class="date"><b>${d.getMonth()+1}/${d.getDate()}</b><small>${'日月火水木金土'[d.getDay()]}</small></span><strong class="off-label">☾ 公休</strong></button>`
        :`<button class="yos131-week-row" data-edit-day="${key}"><span class="date"><b>${d.getMonth()+1}/${d.getDate()}</b><small>${'日月火水木金土'[d.getDay()]}</small></span><span class="actual"><small>実績</small><strong class="${performance(actual,target)}">${actual?money(actual):'—'}</strong></span><span class="target"><small>目標</small><strong>${target?money(target):'—'}</strong></span><span class="meta"><b>${pct}%</b><small>${num(v.reportTrips)||'—'}回</small></span></button>`;
    }
    return`<main class="yos131-page yos131-week">
      ${header(`${start.getMonth()+1}/${start.getDate()}〜${end.getMonth()+1}/${end.getDate()}`,`<button data-week-shift="-1">‹</button>`,`<button data-switch="month">▦</button>`)}
      <section class="yos131-card yos131-week-summary"><div><span>週間実績</span><strong class="${performance(actualSum,targetSum)}">${money(actualSum)}</strong></div><div><span>週間目標</span><strong>${money(targetSum)}</strong></div></section>
      <section class="yos131-week-list">${rows}</section>
    </main>`;
  }

  function month(c){
    localStorage.setItem(LAST_CAL_KEY,'month');
    const year=focus.getFullYear(),month=focus.getMonth(),start=new Date(year,month,1-new Date(year,month,1).getDay());let cells='',actualSum=0;
    Object.entries(c.cal.days).forEach(([key,value])=>{if(key.startsWith(`${year}-${pad(month+1)}`))actualSum+=num(value.sales)});
    const targetSum=num(c.cal.monthlyGoals[`${year}-${pad(month+1)}`]),pct=targetSum?Math.min(100,Math.round(actualSum/targetSum*100)):0;
    for(let i=0;i<42;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);const key=keyOf(d),v=dayData(c,key),actual=num(v.sales),target=num(v.target),same=d.getMonth()===month,todayKey=key===keyOf(businessToday());
      cells+=isOff(v.status)
        ?`<button class="yos131-month-cell off ${same?'':'other'} ${todayKey?'today':''}" data-edit-day="${key}"><span class="day">${d.getDate()}</span><b class="moon">☾</b><small>公休</small></button>`
        :`<button class="yos131-month-cell ${same?'':'other'} ${todayKey?'today':''}" data-edit-day="${key}"><span class="day">${d.getDate()}</span><strong class="actual ${performance(actual,target)}">${actual?compact(actual):'—'}</strong><small class="target">${target?compact(target):''}</small></button>`;
    }
    return`<main class="yos131-page yos131-month">
      ${header(`${year}年${month+1}月`,`<button data-month-shift="-1">‹</button>`,`<button data-switch="week">▦</button>`)}
      <section class="yos131-card yos131-month-summary"><div><span>月目標</span><strong>${money(targetSum)}</strong></div><div><span>月実績</span><strong class="${performance(actualSum,targetSum)}">${money(actualSum)}</strong></div><i><b style="width:${pct}%"></b></i></section>
      <div class="yos131-week-head">${'日月火水木金土'.split('').map(label=>`<b>${label}</b>`).join('')}</div>
      <section class="yos131-month-grid">${cells}</section>
      <div class="yos131-legend"><span class="yos131-green">●達成</span><span class="yos131-gold">●未達</span><span class="yos131-red">●大幅未達</span><span class="off">☾公休</span><span>目標=白</span></div>
    </main>`;
  }

  function monthlyMetrics(c){
    const mk=monthKey(focus),entries=Object.entries(c.cal.days).filter(([key])=>key.startsWith(mk)),cfg={hourLimit:288,carryHours:0,carrySales:0,...(c.calSet.months?.[mk]||{})};
    const goal=num(c.cal.monthlyGoals[mk]||0),actual=num(cfg.carrySales)+entries.reduce((sum,[,value])=>sum+num(value.sales),0),worked=num(cfg.carryHours)+entries.reduce((sum,[,value])=>sum+num(value.actualHours),0);
    return{goal,actual,remain:Math.max(0,goal-actual),worked,progress:goal?Math.round(actual/goal*100):0};
  }

  function manage(c){
    const metrics=monthlyMetrics(c),tiles=[['chart','売上管理','metrics'],['wheel','実車管理','drive'],['report','日報一覧','reports'],['pin','エリア分析','nav'],['target','目標設定','settings'],['export','データ出力','export']];
    return`<main class="yos131-page yos131-manage">
      ${header('管理')}
      <section class="yos131-card yos131-manage-summary"><div><span>月目標</span><strong>${money(metrics.goal)}</strong></div><div><span>実績</span><strong class="${performance(metrics.actual,metrics.goal)}">${money(metrics.actual)}</strong></div><div><span>残り</span><strong>${money(metrics.remain)}</strong></div><div><span>達成率</span><strong>${metrics.progress}%</strong></div></section>
      <section class="yos131-tiles">${tiles.map(([icon,label,action])=>`<button class="yos131-tile" data-manage="${action}">${svg(icon)}<b>${label}</b></button>`).join('')}</section>
    </main>`;
  }

  function moveDialogsToBody(){document.querySelectorAll('dialog').forEach(dialog=>{if(dialog.parentElement!==document.body)document.body.appendChild(dialog)})}
  function removeLegacyUi(){
    document.getElementById('yosFinalAppV130')?.remove();
    document.getElementById('yosReferencePerfectV111')?.remove();
    document.querySelectorAll('#taxiGlobalNavV24,.rp-bottom-nav,.yos130-nav').forEach(node=>node.remove());
  }

  function render(){
    updateViewport();
    moveDialogsToBody();
    removeLegacyUi();
    document.documentElement.classList.add('yos-final-app-v131');
    const type=pageType(),c=context();
    let root=document.getElementById(ROOT_ID);
    if(!root){root=document.createElement('div');root.id=ROOT_ID;document.body.appendChild(root)}
    const active=type==='drive'?'drive':type==='today'?'today':type==='manage'?'manage':type==='week'||type==='month'?'calendar':'';
    const content=type==='drive'?drive(c):type==='today'?today(c):type==='week'?week(c):type==='month'?month(c):manage(c);
    root.innerHTML=`<div class="yos131-shell">${content}</div>${nav(active)}`;
    bind(root,c);
  }

  function proxy(id){document.getElementById(id)?.click()}
  function editDay(key){if(typeof window.openDay==='function')window.openDay(key);else document.getElementById('editToday')?.click()}

  function bind(root,c){
    root.querySelectorAll('[data-nav]').forEach(button=>button.onclick=()=>route(button.dataset.nav));
    root.querySelectorAll('[data-proxy]').forEach(button=>button.onclick=()=>proxy(button.dataset.proxy));
    root.querySelectorAll('[data-go-nav]').forEach(button=>button.onclick=()=>route('nav'));
    root.querySelector('[data-notice]')?.addEventListener('click',()=>alert('重要通知はここへ表示します。'));
    root.querySelectorAll('[data-edit-day]').forEach(button=>button.onclick=()=>editDay(button.dataset.editDay));
    root.querySelectorAll('[data-day-shift]').forEach(button=>button.onclick=()=>{focus.setDate(focus.getDate()+Number(button.dataset.dayShift));render()});
    root.querySelectorAll('[data-week-shift]').forEach(button=>button.onclick=()=>{focus.setDate(focus.getDate()+7*Number(button.dataset.weekShift));render()});
    root.querySelectorAll('[data-month-shift]').forEach(button=>button.onclick=()=>{focus.setMonth(focus.getMonth()+Number(button.dataset.monthShift));render()});
    root.querySelectorAll('[data-switch]').forEach(button=>button.onclick=()=>location.href=`./calendar.html?page=${button.dataset.switch}&v=${VERSION}`);
    root.querySelectorAll('[data-manage]').forEach(button=>button.onclick=()=>{
      const action=button.dataset.manage;
      if(action==='drive'){route('drive');return}
      if(action==='nav'){route('nav');return}
      if(action==='settings'){location.href=`./settings.html?v=${VERSION}`;return}
      if(action==='reports'){location.href='https://docs.google.com/spreadsheets/d/1-Fszb0ksSDX-3xKiZBN1yV710QJtKCBfpAqdE04Mw5k/edit';return}
      if(action==='export'){
        const blob=new Blob([JSON.stringify({operations:c.ops,taxiSettings:c.taxi,calendar:c.cal,calendarSettings:c.calSet},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download=`yos-taxi-backup-${keyOf(businessToday())}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
      }
      alert('管理データへ接続済みです。');
    });
  }

  function start(){
    render();
    clearInterval(refreshTimer);
    refreshTimer=setInterval(()=>{if(pageType()==='drive')render()},30000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  addEventListener('pageshow',render);
  addEventListener('storage',render);
  addEventListener('resize',scheduleViewport,{passive:true});
  window.visualViewport?.addEventListener('resize',scheduleViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',scheduleViewport,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
})();
