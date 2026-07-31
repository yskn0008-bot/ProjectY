'use strict';

(()=>{
  if(window.__yosTaxiLiveV1)return;
  window.__yosTaxiLiveV1=true;

  const KEY='yos-shared-taxi-state-v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
  const money=value=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(value||0));
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function ensureStyle(){
    if(document.getElementById('yos-taxi-live-v1-style'))return;
    const style=document.createElement('style');
    style.id='yos-taxi-live-v1-style';
    style.textContent=`
      .yos-taxi-live-v1{margin:0 0 18px;padding:17px;border:1px solid rgba(255,185,45,.28);border-radius:22px;background:linear-gradient(145deg,rgba(68,43,5,.32),rgba(14,17,25,.96));box-shadow:0 16px 42px rgba(0,0,0,.18)}
      .yos-taxi-live-v1__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.yos-taxi-live-v1__head p{margin:0;color:#f5b83f;font-size:10px;font-weight:900;letter-spacing:.13em}.yos-taxi-live-v1__head h2{margin:3px 0 0;font-size:20px}.yos-taxi-live-v1__chip{padding:7px 10px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(0,0,0,.22);font-size:10px;font-weight:900}
      .yos-taxi-live-v1__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.yos-taxi-live-v1__grid div{padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(0,0,0,.18)}.yos-taxi-live-v1__grid small{display:block;color:#a8acb8;font-size:9px}.yos-taxi-live-v1__grid b{display:block;margin-top:4px;font-size:18px}
      .yos-taxi-live-v1__foot{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:12px;color:#a8acb8;font-size:10px}.yos-taxi-live-v1__foot a{display:inline-flex;align-items:center;min-height:38px;padding:0 13px;border-radius:999px;background:#f5b83f;color:#17110a;text-decoration:none;font-weight:950}
      @media(max-width:390px){.yos-taxi-live-v1__grid{grid-template-columns:1fr 1fr}.yos-taxi-live-v1__grid div:last-child{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function render(){
    ensureStyle();
    const data=read();
    let section=document.getElementById('yos-taxi-live-v1');
    const anchor=document.querySelector('.command-card')||document.querySelector('.hero');
    if(!anchor)return;
    if(!section){
      section=document.createElement('section');
      section.id='yos-taxi-live-v1';
      section.className='yos-taxi-live-v1';
      anchor.insertAdjacentElement('afterend',section);
    }
    if(!data){
      section.innerHTML=`<div class="yos-taxi-live-v1__head"><div><p>TAXI LIVE</p><h2>Taxiは未連動</h2></div><span class="yos-taxi-live-v1__chip">未記録</span></div><div class="yos-taxi-live-v1__foot"><span>Taxiを一度開くと、営業状態がここへ反映されます。</span><a href="../taxi/">Taxiを開く</a></div>`;
      return;
    }
    const chip=data.pendingSync>0?(data.syncConfigured?`未送信 ${data.pendingSync}`:'端末保存'):'連動済み';
    section.innerHTML=`
      <div class="yos-taxi-live-v1__head"><div><p>TAXI LIVE</p><h2>${esc(data.statusLabel||'営業状態')}</h2></div><span class="yos-taxi-live-v1__chip">${esc(chip)}</span></div>
      <div class="yos-taxi-live-v1__grid"><div><small>売上</small><b>${money(data.sales)}</b></div><div><small>乗車</small><b>${Number(data.rides||0)}件</b></div><div><small>残り目標</small><b>${money(data.remainingSales)}</b></div></div>
      <div class="yos-taxi-live-v1__foot"><span>空車 ${Number(data.idleMinutes||0)}分・平均 ${money(data.averageFare)}</span><a href="../taxi/">Taxiへ</a></div>`;
  }

  render();
  setInterval(render,15000);
  window.addEventListener('storage',event=>{if(event.key===KEY)render()});
  window.addEventListener('pageshow',render);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
})();
