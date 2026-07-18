'use strict';
(()=>{
  const page=location.pathname.endsWith('/calendar.html')?'calendar':location.pathname.endsWith('/settings.html')?'settings':'operations';
  const targets={
    operations:{left:'./calendar.html',right:'./settings.html'},
    calendar:{right:'./',left:null},
    settings:{left:'./',right:null}
  };
  const labels={settings:'設定',operations:'営業',calendar:'カレンダー'};
  const order=['settings','operations','calendar'];
  const indicator=document.createElement('nav');
  indicator.setAttribute('aria-label','画面切り替え');
  indicator.style.cssText='position:fixed;z-index:9998;left:50%;bottom:calc(env(safe-area-inset-bottom) + 8px);transform:translateX(-50%);display:flex;gap:7px;align-items:center;padding:7px 10px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(12,12,14,.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 8px 26px rgba(0,0,0,.25)';
  order.forEach(name=>{const a=document.createElement('a');a.href=name==='operations'?'./':`./${name}.html`;a.textContent=labels[name];a.style.cssText=`color:${name===page?'#ffb323':'#aaaab4'};text-decoration:none;font-size:10px;font-weight:900;padding:3px 5px`;indicator.appendChild(a)});
  document.body.appendChild(indicator);

  let startX=0,startY=0,startAt=0;
  const blocked=target=>target.closest('input,textarea,select,button,a,dialog,[contenteditable="true"]')||document.querySelector('dialog[open]');
  const occupied=()=>{try{return page==='operations'&&JSON.parse(localStorage.getItem('yos-taxi-ops-v1')||'{}').status==='occupied'}catch{return false}};
  addEventListener('touchstart',event=>{
    if(event.touches.length!==1||blocked(event.target)||occupied())return;
    const t=event.touches[0];
    if(t.clientX<28||t.clientX>innerWidth-28)return;
    startX=t.clientX;startY=t.clientY;startAt=Date.now();
  },{passive:true});
  addEventListener('touchend',event=>{
    if(!startAt||occupied()){startAt=0;return}
    const t=event.changedTouches[0],dx=t.clientX-startX,dy=t.clientY-startY,elapsed=Date.now()-startAt;
    startAt=0;
    if(elapsed>700||Math.abs(dx)<72||Math.abs(dx)<Math.abs(dy)*1.35)return;
    const direction=dx<0?'left':'right',url=targets[page]?.[direction];
    if(url)location.href=url;
  },{passive:true});
})();