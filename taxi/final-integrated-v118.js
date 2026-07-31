'use strict';
(()=>{
  if(window.__yosTaxiFinalIntegratedV118)return;
  window.__yosTaxiFinalIntegratedV118=true;

  const OPS_KEY='yos-taxi-ops-v1';
  const TAXI_KEY='yos-taxi-settings-v2';
  const CAL_KEY='yos-taxi-calendar-v1';
  const CAL_SET_KEY='yos-taxi-calendar-settings-v3';
  const ROOT_CLASSES=['yos-final-drive-v118','yos-final-today-v118','yos-final-week-v118','yos-final-month-v118','yos-final-manage-v118'];
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const money=value=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(num(value));
  const compact=value=>{const n=num(value);return n?`${Math.round(n/1000)}K`:'—'};
  const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const isOff=status=>status==='off'||status==='transferOff';
  const pad=n=>String(n).padStart(2,'0');
  const monthKey=key=>String(key||'').slice(0,7);

  function context(){
    const ops=read(OPS_KEY,{status:'before',events:[]});
    const taxi=read(TAXI_KEY,{targetSales:0});
    const cal=read(CAL_KEY,{monthlyGoals:{},days:{}});cal.days=cal.days||{};cal.monthlyGoals=cal.monthlyGoals||{};
    const calSet=read(CAL_SET_KEY,{months:{}});calSet.months=calSet.months||{};
    return{ops,taxi,cal,calSet};
  }

  function performance(actual,target){
    const a=num(actual),t=num(target);
    if(!a)return'muted';
    if(!t)return'normal';
    if(a>=t)return'achieved';
    if(a<t*.8)return'danger';
    return'near';
  }

  function setPageClass(type){
    document.documentElement.classList.remove(...ROOT_CLASSES);
    if(type)document.documentElement.classList.add(`yos-final-${type}-v118`);
  }

  function pageType(page){
    return(page?.className.match(/rp-page-(drive|today|week|month|manage)/)||[])[1]||'';
  }

  function fitFixedPage(page){
    if(!page||!['week','month','manage'].includes(pageType(page)))return;
    requestAnimationFrame(()=>{
      const nav=document.getElementById('taxiGlobalNavV24');
      if(!nav)return;
      const top=Math.round(page.getBoundingClientRect().top);
      const navTop=Math.round(nav.getBoundingClientRect().top);
      const height=Math.max(430,navTop-top-8);
      page.style.setProperty('--yf-page-height',`${height}px`);
    });
  }

  function bindProxy(button,id){
    if(!button)return;
    button.onclick=()=>document.getElementById(id)?.click();
  }

  function drive(page,ctx){
    if(page.dataset.finalV118==='1')return;
    page.dataset.finalV118='1';
    page.querySelector('.rp-command-card')?.remove();
    page.querySelector('.rp-operations')?.remove();

    const state=ctx.ops.status||'before';
    const idle=state==='available'&&ctx.ops.availableSince?Math.max(0,Math.floor((Date.now()-new Date(ctx.ops.availableSince).getTime())/60000)):0;
    const advice={
      before:'営業開始で記録を始める',
      occupied:'安全運転を最優先',
      break:'休憩後にYOSナビで再配置',
      ended:'日報を確認してYOSへ送る'
    }[state]||(idle>=15?'空車15分超。エリアを見直す':'現在地で営業を継続');

    const status=page.querySelector('.rp-status-card');
    if(status){
      const card=document.createElement('section');
      card.className='rp-card yf-advice-v118';
      card.innerHTML=`<span>YOS判断</span><strong>${esc(advice)}</strong><button type="button">›</button>`;
      status.insertAdjacentElement('afterend',card);
      card.onclick=()=>location.href='../nav/';
    }

    const row=page.querySelector('.rp-action-row');
    if(row){
      row.innerHTML='<button type="button" data-yf="ride">乗車</button><button type="button" data-yf="dropoff">降車</button><button type="button" class="accent" data-yf="nav">ナビ</button><button type="button" data-yf="memo">メモ</button>';
      bindProxy(row.querySelector('[data-yf="ride"]'),'rideButton');
      bindProxy(row.querySelector('[data-yf="dropoff"]'),'dropoffButton');
      bindProxy(row.querySelector('[data-yf="memo"]'),'memoButton');
      row.querySelector('[data-yf="nav"]').onclick=()=>location.href='../nav/';
    }
  }

  function selectedDateKey(page){
    const text=page.querySelector('.rp-date-switch strong')?.textContent||'';
    const m=text.match(/(\d{4})年(\d+)月(\d+)日/);
    return m?`${m[1]}-${pad(m[2])}-${pad(m[3])}`:'';
  }

  function today(page,ctx){
    if(page.dataset.finalV118==='1')return;
    page.dataset.finalV118='1';
    const key=selectedDateKey(page);
    const day=ctx.cal.days[key]||{};
    const actual=num(day.sales);
    const target=num(day.target||ctx.taxi.targetSales);
    const pct=target?Math.round(actual/target*100):0;
    const summary=document.createElement('section');
    summary.className='rp-card yf-today-summary-v118';
    summary.innerHTML=`<div><span>今日の目標</span><strong>${money(target)}</strong></div><div><span>現在実績</span><strong class="${performance(actual,target)}">${money(actual)}</strong></div><div><span>達成率</span><strong>${pct}%</strong></div>`;
    page.querySelector('.rp-date-switch')?.insertAdjacentElement('afterend',summary);
  }

  function week(page,ctx){
    if(page.dataset.finalV118==='1')return;
    page.dataset.finalV118='1';
    const strip=page.querySelector('.rp-week-strip');
    if(!strip)return;
    const buttons=[...strip.querySelectorAll('[data-day-key]')];
    let sumActual=0,sumTarget=0;
    buttons.forEach(button=>{
      const key=button.dataset.dayKey;
      const d=new Date(`${key}T12:00:00`);
      const v=ctx.cal.days[key]||{};
      const actual=num(v.sales),target=num(v.target),pct=target?Math.round(actual/target*100):0;
      sumActual+=actual;sumTarget+=target;
      button.className=`yf-week-row-v118 ${isOff(v.status)?'off':''}`;
      button.innerHTML=isOff(v.status)
        ?`<span class="date"><b>${d.getMonth()+1}/${d.getDate()}</b><small>${'日月火水木金土'[d.getDay()]}</small></span><strong class="off-label">☾ 公休</strong>`
        :`<span class="date"><b>${d.getMonth()+1}/${d.getDate()}</b><small>${'日月火水木金土'[d.getDay()]}</small></span><span class="actual"><small>実績</small><strong class="${performance(actual,target)}">${actual?money(actual):'—'}</strong></span><span class="target"><small>目標</small><strong>${target?money(target):'—'}</strong></span><span class="meta"><b>${pct}%</b><small>${num(v.reportTrips)||'—'}回</small></span>`;
    });
    const total=document.createElement('section');
    total.className='rp-card yf-week-summary-v118';
    total.innerHTML=`<div><span>週間実績</span><strong class="${performance(sumActual,sumTarget)}">${money(sumActual)}</strong></div><div><span>週間目標</span><strong>${money(sumTarget)}</strong></div>`;
    strip.insertAdjacentElement('beforebegin',total);
    fitFixedPage(page);
  }

  function month(page,ctx){
    if(page.dataset.finalV118==='1')return;
    page.dataset.finalV118='1';
    const grid=page.querySelector('.rp-month-grid');
    if(!grid)return;
    const keys=[...grid.querySelectorAll('[data-day-key]')].map(cell=>cell.dataset.dayKey);
    const mk=monthKey(keys.find(key=>!grid.querySelector(`[data-day-key="${key}"]`)?.classList.contains('other'))||keys[10]);
    let actualSum=0;
    Object.entries(ctx.cal.days).forEach(([key,v])=>{if(key.startsWith(mk))actualSum+=num(v.sales)});
    const targetSum=num(ctx.cal.monthlyGoals[mk]);
    const summary=document.createElement('section');
    summary.className='rp-card yf-month-summary-v118';
    summary.innerHTML=`<div><span>月目標</span><strong>${money(targetSum)}</strong></div><div><span>月実績</span><strong class="${performance(actualSum,targetSum)}">${money(actualSum)}</strong></div><i><b style="width:${targetSum?Math.min(100,actualSum/targetSum*100):0}%"></b></i>`;
    page.querySelector('.rp-month-period')?.insertAdjacentElement('afterend',summary);

    [...grid.querySelectorAll('[data-day-key]')].forEach(cell=>{
      const key=cell.dataset.dayKey;
      const d=new Date(`${key}T12:00:00`);
      const v=ctx.cal.days[key]||{};
      const actual=num(v.sales),target=num(v.target);
      const wasOther=cell.classList.contains('other');
      const wasToday=cell.classList.contains('today');
      cell.className=`yf-month-cell-v118 ${wasOther?'other':''} ${wasToday?'today':''} ${isOff(v.status)?'off':''}`;
      cell.innerHTML=isOff(v.status)
        ?`<span class="day">${d.getDate()}</span><b class="moon">☾</b><small>公休</small>`
        :`<span class="day">${d.getDate()}</span><strong class="actual ${performance(actual,target)}">${actual?compact(actual):'—'}</strong><small class="target">${target?compact(target):''}</small>`;
    });
    const legend=page.querySelector('.rp-month-legend');
    if(legend)legend.innerHTML='<span class="green">● 達成実績</span><span class="amber">● 未達実績</span><span class="red">● 大幅未達</span><span class="violet">☾ 公休日</span><span class="goal">目標＝白</span>';
    fitFixedPage(page);
  }

  function manage(page){
    if(page.dataset.finalV118==='1')return;
    page.dataset.finalV118='1';
    page.querySelectorAll('.rp-manage-grid button').forEach(button=>{
      const label=button.querySelector('b')?.textContent||'';
      if(label==='走行データ'||label==='収支管理')button.hidden=true;
    });
    fitFixedPage(page);
  }

  function enhance(){
    const page=document.querySelector('#yosReferencePerfectV111 .rp-page');
    if(!page)return;
    const type=pageType(page);
    setPageClass(type);
    const ctx=context();
    if(type==='drive')drive(page,ctx);
    if(type==='today')today(page,ctx);
    if(type==='week')week(page,ctx);
    if(type==='month')month(page,ctx);
    if(type==='manage')manage(page,ctx);
  }

  let raf=0;
  const schedule=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;enhance()})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  setInterval(schedule,1000);
})();
