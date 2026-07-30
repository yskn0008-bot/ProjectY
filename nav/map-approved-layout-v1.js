'use strict';
(()=>{
  if(window.__yosApprovedMapLayoutV1)return;
  window.__yosApprovedMapLayoutV1=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style=document.createElement('style');
  style.id='yos-approved-map-layout-v1';
  style.textContent=`
  body.yos-approved-map{background:radial-gradient(circle at 50% 20%,rgba(30,109,170,.14),transparent 38%),#02070d}
  body.yos-approved-map .app{max-width:560px;padding-left:10px;padding-right:10px}
  body.yos-approved-map h1{display:flex;align-items:center;gap:9px;font-size:25px;letter-spacing:.01em}
  body.yos-approved-map h1:before{content:'Y';display:grid;place-items:center;width:33px;height:33px;border:1px solid rgba(98,210,255,.55);border-radius:10px;color:#eaffff;background:linear-gradient(145deg,#14baf0,#3b75ff);box-shadow:0 0 22px rgba(37,181,255,.35);font-size:21px;font-weight:950}
  body.yos-approved-map .sub{margin-left:43px;color:#8ca7b7}
  body.yos-approved-map .app-links{margin-bottom:10px}
  body.yos-approved-map .app-links a{background:rgba(6,15,23,.88);border-color:rgba(83,154,198,.24);backdrop-filter:blur(10px)}
  body.yos-approved-map .yos-okinawa-map{margin-top:10px;border-radius:25px;border-color:rgba(86,190,255,.42);background:linear-gradient(155deg,rgba(9,25,39,.98),rgba(2,8,14,.99));box-shadow:0 24px 70px rgba(0,0,0,.52),0 0 42px rgba(37,164,255,.1)}
  body.yos-approved-map .yos-okinawa-map__head b{font-size:20px}
  body.yos-approved-map .yos-okinawa-map__head b:before{content:'YOSナビ ';color:#7fe7ff}
  body.yos-approved-map .yos-okinawa-map__canvas{position:relative;border-color:rgba(86,190,255,.32);background:radial-gradient(circle at 50% 55%,rgba(27,116,166,.28),transparent 50%),#020912}
  body.yos-approved-map .yos-okinawa-map__canvas:before{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(circle at 50% 56%,transparent 0 19%,rgba(49,183,255,.12) 19.4% 19.8%,transparent 20.2% 33%,rgba(49,183,255,.1) 33.4% 33.8%,transparent 34.2% 49%,rgba(49,183,255,.08) 49.4% 49.8%,transparent 50.2%)}
  body.yos-approved-map .yos-approved-score-rail{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:9px}
  body.yos-approved-map .yos-approved-score{min-width:0;padding:9px 6px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(4,12,19,.82);text-align:center}
  body.yos-approved-map .yos-approved-score small{display:block;color:#9bb0bd;font-size:8px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  body.yos-approved-map .yos-approved-score b{display:block;margin-top:2px;font-size:20px;line-height:1}
  body.yos-approved-map .yos-approved-score:nth-child(1){border-color:rgba(255,87,98,.42);color:#ff6570;box-shadow:inset 0 0 18px rgba(255,70,81,.08)}
  body.yos-approved-map .yos-approved-score:nth-child(2){border-color:rgba(77,169,255,.35);color:#63b8ff}
  body.yos-approved-map .yos-approved-score:nth-child(3){border-color:rgba(91,228,137,.35);color:#65e896}
  body.yos-approved-map .yos-approved-score:nth-child(4){color:#b7bec5}
  body.yos-approved-map .yos-okinawa-map__detail{border-color:rgba(255,91,102,.24);background:linear-gradient(135deg,rgba(39,12,18,.84),rgba(8,13,20,.9))}
  body.yos-approved-map .yos-okinawa-map__detail strong:before{content:'♛';display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg,#ff6b70,#ba2431);box-shadow:0 0 18px rgba(255,77,86,.3);font-size:18px}
  body.yos-approved-map .yos-okinawa-map__detail button{background:linear-gradient(145deg,#ff6f75,#e1323e);color:#fff;box-shadow:0 9px 26px rgba(221,48,60,.3),inset 0 1px rgba(255,255,255,.34)}
  body.yos-approved-map .hero,body.yos-approved-map .grid,body.yos-approved-map .timer,body.yos-approved-map .manual{border-color:rgba(87,145,181,.18);background:rgba(7,15,23,.78)}
  body.yos-approved-map .hero{margin-top:12px}
  @media(max-width:390px){body.yos-approved-map .yos-approved-score-rail{gap:4px}body.yos-approved-map .yos-approved-score{padding:8px 3px}body.yos-approved-map .yos-approved-score b{font-size:18px}}
  `;
  document.head.appendChild(style);
  const render=()=>{
    const section=document.getElementById('yos-okinawa-area-map');
    const rec=Array.isArray(window.__yosNavRecommendations)?window.__yosNavRecommendations:[];
    if(!section||!rec.length)return false;
    document.body.classList.add('yos-approved-map');
    const headTitle=section.querySelector('.yos-okinawa-map__head b');
    if(headTitle)headTitle.textContent='エリアマップ';
    let rail=section.querySelector('.yos-approved-score-rail');
    if(!rail){rail=document.createElement('div');rail.className='yos-approved-score-rail';section.querySelector('.yos-okinawa-map__canvas')?.insertAdjacentElement('afterend',rail)}
    const labels=['最優先','次候補','条件付き','回避'];
    const fallback=[86,69,48,18];
    rail.innerHTML=labels.map((label,index)=>{const item=rec[index];const score=Number.isFinite(Number(item?.score))?Math.round(Number(item.score)):fallback[index];return `<div class="yos-approved-score"><small>${label}${item?.label?`・${esc(item.label)}`:''}</small><b>${score}</b></div>`}).join('');
    const links=document.querySelector('.app-links');
    if(links&&section.previousElementSibling!==links)links.insertAdjacentElement('afterend',section);
    return true;
  };
  render();
  window.addEventListener('yos-nav-recommendation',render);
  window.addEventListener('pageshow',render);
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true});
})();