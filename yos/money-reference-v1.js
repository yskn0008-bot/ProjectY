'use strict';
(()=>{
  const KEY='yos-money-v2';
  const TZ='Asia/Tokyo';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ}).format(new Date());
  const parse=s=>{const d=new Date(`${s}T12:00:00+09:00`);return Number.isNaN(d.getTime())?null:d};
  const days=(a,b)=>{const x=parse(a),y=parse(b);return x&&y?Math.max(0,Math.ceil((y-x)/86400000)):null};
  const outgoing=tx=>['expense','debt','saving','investment'].includes(tx?.type);
  const monthKey=()=>today().slice(0,7);

  let syncing=false;

  function ensureHero(){
    const host=$('#moneyPage');
    const head=$('.money2-heading',host);
    if(!host||!head)return;
    host.classList.add('money-reference-v1');
    const small=$('.money2-title small',head),title=$('.money2-title h1',head),sub=$('.money2-title p',head),icon=$('.money2-title>span',head);
    if(small)small.textContent='MY WAY  |  自分らしい、これからを。';
    if(title)title.textContent='Money';
    if(sub)sub.textContent='今月のお金の見通し';
    if(icon)icon.setAttribute('aria-hidden','true');
    if(!$('.money-ref-hero-meta',head)){
      const meta=document.createElement('div');
      meta.className='money-ref-hero-meta';
      meta.innerHTML='<span class="money-ref-safety">◎ <b>入力待ち</b></span><span class="money-ref-forecast"><small>月末予測</small><strong>未算出</strong></span>';
      head.append(meta);
    }
    if(!$('#moneyRefMenu',head)){
      const menu=document.createElement('button');
      menu.id='moneyRefMenu';
      menu.className='money-ref-menu';
      menu.type='button';
      menu.setAttribute('aria-label','Moneyメニュー');
      menu.textContent='•••';
      menu.addEventListener('click',()=>$('.money2-tabs',host)?.classList.toggle('money-ref-open'));
      head.append(menu);
    }
    const privacy=$('#moneyPrivacy',head);
    if(privacy){privacy.classList.add('money-ref-privacy');privacy.setAttribute('aria-label','金額の表示・非表示を切り替える');privacy.setAttribute('title','金額の表示・非表示')}
  }

  function state(){const d=read(KEY,{});return d&&typeof d==='object'?d:{}}

  function syncHero(){
    const host=$('#moneyPage');
    const status=$('.money2-status',host);
    const safety=$('.money-ref-safety',host);
    const forecast=$('.money-ref-forecast strong',host);
    if(!status||!safety||!forecast)return;
    let label='入力待ち';
    if(status.classList.contains('safe'))label='安全';
    if(status.classList.contains('danger'))label='注意';
    safety.classList.toggle('danger',label==='注意');
    safety.classList.toggle('safe',label==='安全');
    const b=$('b',safety);if(b)b.textContent=label;
    const text=$('strong',status)?.textContent?.trim()||'';
    const m=text.match(/月末予測\s*(.*)$/);
    forecast.textContent=m?.[1]||'未算出';
  }

  function summaryValues(){
    const d=state();
    const txs=Array.isArray(d.transactions)?d.transactions:[];
    const now=today();
    const future=txs.filter(tx=>tx?.status!=='done'&&String(tx?.date||'')>=now).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const pay=future.find(outgoing)||null;
    const income=future.find(tx=>tx?.type==='income')||null;
    const daily=$('.money2-metrics article.wide strong')?.textContent?.trim()||'未算出';
    return {payDays:pay?days(now,pay.date):null,incomeDays:income?days(now,income.date):null,daily};
  }

  function syncCalendarSummary(){
    const card=$('.money2-calendar-card');if(!card)return;
    let wrap=$('.money-ref-calendar-summary',card);
    if(!wrap){wrap=document.createElement('div');wrap.className='money-ref-calendar-summary';wrap.innerHTML='<article><span>▣</span><div><small>次の支払いまで</small><strong data-ref-pay>—</strong></div></article><article><span>▤</span><div><small>次の入金まで</small><strong data-ref-income>—</strong></div></article><article><span>◔</span><div><small>安全な1日予算</small><strong data-ref-daily>未算出</strong></div></article>';card.append(wrap)}
    const v=summaryValues();
    const p=$('[data-ref-pay]',wrap),i=$('[data-ref-income]',wrap),d=$('[data-ref-daily]',wrap);
    if(p)p.textContent=v.payDays===null?'予定なし':`${v.payDays}日`;
    if(i)i.textContent=v.incomeDays===null?'予定なし':`${v.incomeDays}日`;
    if(d)d.textContent=v.daily;
  }

  function decorateSections(){
    const host=$('#moneyPage');if(!host)return;
    const metrics=$('.money2-metrics',host);if(metrics&&!$('.money-ref-heading',metrics)){const h=document.createElement('header');h.className='money-ref-heading';h.innerHTML='<h2>↻ 今月の収支状況</h2><small>今月も、計画どおりに。</small>';metrics.prepend(h)}
    const next=$('.money2-row-card',host);if(next&&!$('.money-ref-heading',next)){const h=document.createElement('header');h.className='money-ref-heading';h.innerHTML='<h2>▣ 次の支払い</h2><small>支払いを済ませて、すっきりと。</small>';next.prepend(h)}
    const status=$('.money2-status',host);if(status&&!$('.money-ref-heading',status)){const h=document.createElement('header');h.className='money-ref-heading';h.innerHTML='<h2>▥ 今月の予測</h2><small>この先も、安心して進める。</small>';status.prepend(h)}
    const goal=$('.money2-goal-card',host);if(goal&&!$('.money-ref-section-label',goal)){const label=document.createElement('div');label.className='money-ref-section-label';label.textContent='目標';goal.prepend(label)}
    const advice=$('.money2-advice',host);if(advice&&!$('.money-ref-advice-label',advice)){const label=document.createElement('div');label.className='money-ref-advice-label';label.textContent='💡 YOSからの提案';advice.prepend(label)}
  }

  function sync(){
    if(syncing)return;syncing=true;
    try{ensureHero();syncHero();syncCalendarSummary();decorateSections()}finally{syncing=false}
  }

  function boot(){
    if(!$('#moneyPage'))return;
    sync();
    const body=$('#money2Body');
    if(body){const observer=new MutationObserver(()=>requestAnimationFrame(sync));observer.observe(body,{childList:true,subtree:true,characterData:true})}
    window.addEventListener('storage',e=>{if(e.key===KEY)requestAnimationFrame(sync)});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestAnimationFrame(sync)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
