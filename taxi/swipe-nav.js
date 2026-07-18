'use strict';
(()=>{
  const page=location.pathname.endsWith('/calendar.html')?'calendar':location.pathname.endsWith('/settings.html')?'settings':'operations';
  const order=['settings','operations','calendar'];
  const index=order.indexOf(page);
  const urls={settings:'./settings.html',operations:'./',calendar:'./calendar.html'};
  const meta={
    settings:{icon:'⚙️',title:'設定',hint:'勤務時間・目標・周期'},
    operations:{icon:'🚖',title:'営業',hint:'記録・判断・売上'},
    calendar:{icon:'📅',title:'カレンダー',hint:'予定・実績・残り時間'}
  };
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targetFor=direction=>{
    const next=index+(direction==='left'?1:-1);
    return next>=0&&next<order.length?order[next]:null;
  };
  const blocked=target=>target.closest('input,textarea,select,button,a,dialog,[contenteditable="true"]')||document.querySelector('dialog[open]');
  const occupied=()=>{try{return page==='operations'&&JSON.parse(localStorage.getItem('yos-taxi-ops-v1')||'{}').status==='occupied'}catch{return false}};

  document.documentElement.style.overflowX='hidden';
  document.body.style.overflowX='hidden';
  document.body.style.touchAction='pan-y';
  document.body.style.willChange='transform';

  const indicator=document.createElement('nav');
  indicator.setAttribute('aria-label','画面切り替え');
  indicator.style.cssText='position:fixed;z-index:9997;left:50%;bottom:calc(env(safe-area-inset-bottom) + 10px);transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 12px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(13,13,16,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 14px 40px rgba(0,0,0,.28)';
  order.forEach(name=>{
    const a=document.createElement('a');a.href=urls[name];a.setAttribute('aria-label',meta[name].title);
    a.style.cssText=`display:flex;align-items:center;gap:5px;color:${name===page?'#ffb323':'#7f8089'};text-decoration:none;font-size:10px;font-weight:900;padding:3px 5px;transition:color .2s ease,transform .2s ease`;
    a.innerHTML=`<span style="width:${name===page?'8px':'6px'};height:${name===page?'8px':'6px'};border-radius:50%;background:currentColor;display:block;transition:.2s ease"></span>${name===page?meta[name].title:''}`;
    indicator.appendChild(a);
  });
  document.body.appendChild(indicator);

  const preview=document.createElement('div');
  preview.setAttribute('aria-hidden','true');
  preview.style.cssText='position:fixed;z-index:9995;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 45%,rgba(255,179,35,.13),transparent 34%),#09090b;transition:opacity .08s linear';
  preview.innerHTML='<div id="yosSwipePreviewCard" style="min-width:210px;padding:24px 26px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:rgba(23,23,27,.92);box-shadow:0 30px 80px rgba(0,0,0,.36);text-align:center;transform:scale(.92);opacity:.72"><div id="yosSwipePreviewIcon" style="font-size:34px"></div><strong id="yosSwipePreviewTitle" style="display:block;margin-top:9px;font-size:25px"></strong><span id="yosSwipePreviewHint" style="display:block;margin-top:5px;color:#aaaab4;font-size:11px"></span></div>';
  document.body.insertBefore(preview,document.body.firstChild);
  const card=preview.querySelector('#yosSwipePreviewCard'),icon=preview.querySelector('#yosSwipePreviewIcon'),title=preview.querySelector('#yosSwipePreviewTitle'),hint=preview.querySelector('#yosSwipePreviewHint');

  let startX=0,startY=0,startAt=0,dragging=false,axis='',dx=0,currentTarget=null;

  function showPreview(name,progress){
    if(!name){preview.style.opacity='0';return}
    currentTarget=name;icon.textContent=meta[name].icon;title.textContent=meta[name].title;hint.textContent=meta[name].hint;
    preview.style.opacity=String(Math.min(.96,.16+progress*.82));
    card.style.transform=`scale(${.9+progress*.1}) translateX(${(name==='calendar'?1:-1)*(1-progress)*18}px)`;
    card.style.opacity=String(.55+progress*.45);
  }
  function reset(immediate=false){
    dragging=false;axis='';startAt=0;dx=0;currentTarget=null;
    if(immediate||reduced){document.body.style.transform='';document.body.style.transition='';preview.style.opacity='0';return}
    document.body.style.transition='transform 360ms cubic-bezier(.2,.9,.2,1.08)';
    document.body.style.transform='translate3d(0,0,0)';
    preview.style.transition='opacity 240ms ease';
    preview.style.opacity='0';
    setTimeout(()=>{document.body.style.transition='';preview.style.transition='opacity .08s linear'},380);
  }
  function navigate(name,direction){
    if(!name){reset();return}
    sessionStorage.setItem('yos-swipe-enter',direction);
    if(reduced){location.href=urls[name];return}
    const out=direction==='left'?-innerWidth:innerWidth;
    document.body.style.transition='transform 240ms cubic-bezier(.22,1,.36,1),opacity 210ms ease';
    document.body.style.transform=`translate3d(${out}px,0,0)`;
    document.body.style.opacity='.72';
    preview.style.transition='opacity 180ms ease';
    preview.style.opacity='1';
    setTimeout(()=>{location.href=urls[name]},210);
  }

  addEventListener('touchstart',event=>{
    if(event.touches.length!==1||blocked(event.target)||occupied())return;
    const t=event.touches[0];
    if(t.clientX<24||t.clientX>innerWidth-24)return;
    startX=t.clientX;startY=t.clientY;startAt=performance.now();dragging=true;axis='';dx=0;
    document.body.style.transition='none';preview.style.transition='opacity .08s linear';
  },{passive:true});

  addEventListener('touchmove',event=>{
    if(!dragging||occupied())return;
    const t=event.touches[0],moveX=t.clientX-startX,moveY=t.clientY-startY;
    if(!axis&&Math.hypot(moveX,moveY)>9)axis=Math.abs(moveX)>Math.abs(moveY)*1.18?'x':'y';
    if(axis==='y'){dragging=false;return}
    if(axis!=='x')return;
    event.preventDefault();
    const direction=moveX<0?'left':'right',name=targetFor(direction),resistance=name?1:.18;
    dx=moveX*resistance;
    const limit=innerWidth*.88;dx=Math.max(-limit,Math.min(limit,dx));
    const progress=Math.min(1,Math.abs(dx)/(innerWidth*.42));
    document.body.style.transform=`translate3d(${dx}px,0,0)`;
    showPreview(name,progress);
  },{passive:false});

  addEventListener('touchend',event=>{
    if(!dragging||axis!=='x'){reset(true);return}
    const elapsed=Math.max(1,performance.now()-startAt),velocity=Math.abs(dx)/elapsed,direction=dx<0?'left':'right',name=targetFor(direction);
    const commit=name&&(Math.abs(dx)>innerWidth*.22||velocity>.58);
    dragging=false;
    if(commit)navigate(name,direction);else reset();
  },{passive:true});
  addEventListener('touchcancel',()=>reset(),{passive:true});

  const enter=sessionStorage.getItem('yos-swipe-enter');
  if(enter){
    sessionStorage.removeItem('yos-swipe-enter');
    if(!reduced){
      const from=enter==='left'?innerWidth*.22:-innerWidth*.22;
      document.body.style.opacity='.82';document.body.style.transform=`translate3d(${from}px,0,0)`;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        document.body.style.transition='transform 300ms cubic-bezier(.22,1,.36,1),opacity 260ms ease';
        document.body.style.transform='translate3d(0,0,0)';document.body.style.opacity='1';
        setTimeout(()=>document.body.style.transition='',320);
      }));
    }
  }
})();