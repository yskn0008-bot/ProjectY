'use strict';

(()=>{
  if(window.__yosNavTaxiLiveContextV1)return;
  window.__yosNavTaxiLiveContextV1=true;

  const KEY='yos-shared-taxi-state-v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
  const money=value=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(value||0));
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function ensureStyle(){
    if(document.getElementById('yos-nav-taxi-live-v1-style'))return;
    const style=document.createElement('style');
    style.id='yos-nav-taxi-live-v1-style';
    style.textContent=`
      .yos-nav-taxi-live-v1{margin:8px 0 10px;padding:11px 12px;border:1px solid rgba(255,190,62,.3);border-radius:16px;background:linear-gradient(145deg,rgba(75,48,8,.34),rgba(7,15,24,.94));color:#f7fbff}
      .yos-nav-taxi-live-v1__top{display:flex;align-items:center;justify-content:space-between;gap:10px}.yos-nav-taxi-live-v1__top b{font-size:14px}.yos-nav-taxi-live-v1__top span{padding:5px 8px;border-radius:999px;background:rgba(0,0,0,.24);color:#ffd77b;font-size:9px;font-weight:900}
      .yos-nav-taxi-live-v1__grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9px}.yos-nav-taxi-live-v1__grid div{padding:8px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:rgba(0,0,0,.16)}.yos-nav-taxi-live-v1__grid small{display:block;color:#9eb0bd;font-size:8px}.yos-nav-taxi-live-v1__grid strong{display:block;margin-top:3px;font-size:15px}
      @media(max-width:390px){.yos-nav-taxi-live-v1__grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function render(){
    ensureStyle();
    const data=read();
    let section=document.getElementById('yos-nav-taxi-live-v1');
    const anchor=document.querySelector('.app-links')||document.querySelector('header')||document.querySelector('main');
    if(!anchor)return;
    if(!section){
      section=document.createElement('section');
      section.id='yos-nav-taxi-live-v1';
      section.className='yos-nav-taxi-live-v1';
      anchor.insertAdjacentElement('afterend',section);
    }
    if(!data){
      section.innerHTML='<div class="yos-nav-taxi-live-v1__top"><b>Taxi連動</b><span>未記録</span></div><div style="margin-top:7px;color:#9eb0bd;font-size:10px">Taxiを一度開くと、売上・空車・残り目標を反映します。</div>';
      return;
    }
    const sync=data.pendingSync>0?`${data.pendingSync}件未送信`:'同期済み';
    section.innerHTML=`<div class="yos-nav-taxi-live-v1__top"><b>${esc(data.statusLabel||'営業状態')}</b><span>${esc(sync)}</span></div><div class="yos-nav-taxi-live-v1__grid"><div><small>売上</small><strong>${money(data.sales)}</strong></div><div><small>残り</small><strong>${money(data.remainingSales)}</strong></div><div><small>空車</small><strong>${Number(data.idleMinutes||0)}分</strong></div><div><small>乗車</small><strong>${Number(data.rides||0)}件</strong></div></div>`;
  }

  render();
  setInterval(render,15000);
  window.addEventListener('storage',event=>{if(event.key===KEY)render()});
  window.addEventListener('pageshow',render);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
})();
