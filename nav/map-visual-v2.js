'use strict';
(()=>{
  if(window.__yosMapVisualV2)return;
  window.__yosMapVisualV2=true;
  const style=document.createElement('style');
  style.id='yos-map-visual-v2';
  style.textContent=`
  .yos-okinawa-map{position:relative;isolation:isolate;background:
    radial-gradient(circle at 82% 12%,rgba(37,225,255,.13),transparent 31%),
    radial-gradient(circle at 14% 78%,rgba(66,209,127,.10),transparent 36%),
    linear-gradient(165deg,#0b1620 0%,#05090e 58%,#11151b 100%);
    box-shadow:0 20px 55px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.04)}
  .yos-okinawa-map:before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(120deg,transparent 0 46%,rgba(255,255,255,.035) 50%,transparent 54%);transform:translateX(-70%);animation:yos-map-sheen 8s ease-in-out infinite}
  .yos-okinawa-map__badge{box-shadow:0 0 18px rgba(66,209,127,.18);letter-spacing:.06em}
  .yos-okinawa-map__canvas{position:relative;background:
    radial-gradient(circle at 50% 42%,rgba(30,111,148,.23),transparent 55%),#041019;
    box-shadow:inset 0 0 45px rgba(0,0,0,.55),0 10px 26px rgba(0,0,0,.24)}
  .yos-okinawa-map__canvas:before{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;background:repeating-linear-gradient(180deg,rgba(255,255,255,.018) 0 1px,transparent 1px 4px);mix-blend-mode:screen}
  .yos-okinawa-map__canvas:after{content:'';position:absolute;inset:-35% -25%;z-index:2;pointer-events:none;background:linear-gradient(180deg,transparent 0 46%,rgba(37,225,255,.11) 50%,transparent 54%);animation:yos-map-scan 6s linear infinite}
  .yos-okinawa-map__island{fill:url(#yos-island-gradient,#18262c);stroke:#86b9c8;stroke-width:1.8;filter:drop-shadow(0 0 12px rgba(53,182,219,.28))}
  .yos-okinawa-map__road{stroke:#7a969f;opacity:.72}
  .yos-okinawa-map__route{stroke-dasharray:10 8;animation:yos-route-flow 1.4s linear infinite;filter:drop-shadow(0 0 5px rgba(255,123,97,.66))}
  .yos-okinawa-map__marker{transition:transform .22s ease,filter .22s ease}
  .yos-okinawa-map__marker:hover,.yos-okinawa-map__marker:focus-visible,.yos-okinawa-map__marker.is-active{filter:drop-shadow(0 0 10px currentColor)}
  .yos-okinawa-map__marker.is-active .halo{animation:yos-marker-breathe 1.8s ease-out infinite}
  .yos-okinawa-map__marker.is-active .core{stroke-width:2.5}
  .yos-okinawa-map__current .pulse{transform-origin:center;animation:yos-current-pulse 1.65s ease-out infinite}
  .yos-okinawa-map__detail{backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:inset 0 1px rgba(255,255,255,.035)}
  .yos-okinawa-map__detail em{text-shadow:0 0 16px rgba(66,209,127,.35)}
  .yos-okinawa-map__detail button{box-shadow:0 8px 24px rgba(255,122,0,.26),inset 0 1px rgba(255,255,255,.32);transition:transform .14s ease,filter .14s ease}
  .yos-okinawa-map__detail button:active{transform:scale(.98);filter:brightness(.92)}
  .yos-okinawa-map[data-theme='neon']{border-color:rgba(37,225,255,.5);box-shadow:0 0 0 1px rgba(37,225,255,.08),0 20px 60px rgba(0,0,0,.42),0 0 34px rgba(37,225,255,.09)}
  .yos-okinawa-map[data-theme='neon'] .yos-okinawa-map__canvas{background:radial-gradient(circle at 50% 45%,rgba(18,94,122,.33),transparent 58%),#020b12}
  @keyframes yos-route-flow{to{stroke-dashoffset:-18}}
  @keyframes yos-marker-breathe{0%{r:21;opacity:.48}100%{r:34;opacity:0}}
  @keyframes yos-current-pulse{0%{transform:scale(.72);opacity:.78}100%{transform:scale(2.05);opacity:0}}
  @keyframes yos-map-scan{from{transform:translateY(-38%)}to{transform:translateY(38%)}}
  @keyframes yos-map-sheen{0%,62%,100%{transform:translateX(-75%)}78%{transform:translateX(75%)}}
  @media(prefers-reduced-motion:reduce){.yos-okinawa-map:before,.yos-okinawa-map__canvas:after,.yos-okinawa-map__route,.yos-okinawa-map__marker.is-active .halo,.yos-okinawa-map__current .pulse{animation:none!important}}
  `;
  document.head.appendChild(style);
})();
