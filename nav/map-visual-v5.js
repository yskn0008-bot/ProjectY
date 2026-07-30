'use strict';
(()=>{
  if(window.__yosMapVisualV5)return;
  window.__yosMapVisualV5=true;
  const style=document.createElement('style');
  style.id='yos-map-visual-v5';
  style.textContent=`
  .yos-okinawa-map{position:relative;isolation:isolate;padding:14px;border:1px solid rgba(93,210,255,.34);border-radius:26px;background:
    radial-gradient(circle at 76% 8%,rgba(38,225,255,.18),transparent 28%),
    radial-gradient(circle at 18% 85%,rgba(80,255,169,.12),transparent 34%),
    linear-gradient(155deg,#0b1926 0%,#03070c 56%,#0c121b 100%);
    box-shadow:0 26px 70px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.06),0 0 36px rgba(31,184,255,.08)}
  .yos-okinawa-map:before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(120deg,transparent 0 46%,rgba(255,255,255,.035) 50%,transparent 54%);transform:translateX(-75%);animation:yos-map-sheen 8s ease-in-out infinite}
  .yos-okinawa-map__head{position:relative;z-index:4;align-items:center;padding:2px 2px 4px}
  .yos-okinawa-map__head b{font-size:19px;letter-spacing:.02em;text-shadow:0 0 18px rgba(126,220,255,.24)}
  .yos-okinawa-map__head small{font-size:10px;letter-spacing:.035em}
  .yos-okinawa-map__badge{position:relative;overflow:hidden;padding:6px 10px;border-color:rgba(99,255,182,.5);background:linear-gradient(135deg,rgba(53,224,132,.22),rgba(25,112,84,.12));color:#b8ffd4;box-shadow:0 0 24px rgba(63,246,148,.22),inset 0 1px rgba(255,255,255,.18);letter-spacing:.06em}
  .yos-okinawa-map__badge:before{content:'';display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%;background:#56ffa1;box-shadow:0 0 10px #56ffa1;animation:yos-live-dot 1.5s ease-in-out infinite}
  .yos-okinawa-map__badge:after{content:'';position:absolute;inset:-40% auto -40% -45%;width:35%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.58),transparent);transform:skewX(-18deg);animation:yos-v5-badge 3.8s ease-in-out infinite}
  .yos-okinawa-map__canvas{position:relative;margin-top:11px;border-color:rgba(98,210,255,.27);border-radius:21px;overflow:hidden;background:
    radial-gradient(circle at 50% 45%,rgba(31,146,191,.28),transparent 52%),
    radial-gradient(circle at 50% 50%,transparent 0 34%,rgba(35,173,225,.08) 34.5% 35%,transparent 35.5% 49%,rgba(35,173,225,.07) 49.5% 50%,transparent 50.5%),
    linear-gradient(180deg,#061722,#02080d);box-shadow:inset 0 0 70px rgba(0,0,0,.72),inset 0 1px rgba(255,255,255,.04),0 12px 34px rgba(0,0,0,.36)}
  .yos-okinawa-map__canvas:before{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;background:
    linear-gradient(90deg,transparent 49.8%,rgba(60,204,255,.08) 50%,transparent 50.2%),
    linear-gradient(180deg,transparent 49.8%,rgba(60,204,255,.08) 50%,transparent 50.2%),
    repeating-linear-gradient(180deg,rgba(255,255,255,.016) 0 1px,transparent 1px 4px);mix-blend-mode:screen}
  .yos-okinawa-map__canvas:after{content:'';position:absolute;inset:-35% -25%;z-index:2;pointer-events:none;background:linear-gradient(180deg,transparent 0 46%,rgba(37,225,255,.11) 50%,transparent 54%);animation:yos-map-scan 6s linear infinite}
  .yos-okinawa-map svg{filter:saturate(1.12) contrast(1.04)}
  .yos-okinawa-map__grid{stroke:#2d708a;opacity:.28;stroke-dasharray:2 5}
  .yos-okinawa-map__island{fill:url(#yos-island-gradient,#1a3038);stroke:#a4dfed;stroke-width:2;filter:drop-shadow(0 0 7px rgba(137,228,255,.46)) drop-shadow(0 12px 10px rgba(0,0,0,.42))}
  .yos-okinawa-map__road{stroke:#8ca8b1;stroke-width:1.6;opacity:.62;stroke-dasharray:3 5;filter:drop-shadow(0 0 2px rgba(255,255,255,.18))}
  .yos-okinawa-map__route{stroke-width:3.2;stroke-linecap:round;stroke-dasharray:3 8;filter:drop-shadow(0 0 4px currentColor) drop-shadow(0 0 11px currentColor);animation:yos-route-flow .78s linear infinite}
  .yos-okinawa-map__marker{transform-box:fill-box;transform-origin:center;transition:filter .2s ease}
  .yos-okinawa-map__marker .halo{opacity:.25;filter:blur(.5px)}
  .yos-okinawa-map__marker .core{stroke-width:2.4;filter:drop-shadow(0 0 5px #fff) drop-shadow(0 0 15px currentColor)}
  .yos-okinawa-map__marker.is-active{filter:drop-shadow(0 0 14px currentColor)}
  .yos-okinawa-map__marker.is-active .halo{animation:yos-marker-breathe 1.8s ease-out infinite}
  .yos-okinawa-map__marker.is-active .core{stroke:#fff;stroke-width:3;animation:yos-v5-core 1.7s ease-in-out infinite}
  .yos-okinawa-map__marker .score{font-size:13px;letter-spacing:-.03em}.yos-okinawa-map__marker .name{font-size:10px;stroke-width:4px;text-shadow:0 2px 8px #000}
  .yos-okinawa-map__current .pulse{fill:rgba(38,158,255,.34);transform-origin:center;animation:yos-current-pulse 1.65s ease-out infinite}
  .yos-okinawa-map__current .dot{fill:#e9f7ff;stroke:#269eff;stroke-width:3.5;filter:drop-shadow(0 0 8px #269eff) drop-shadow(0 0 15px rgba(38,158,255,.7))}
  .yos-okinawa-map__detail{margin-top:11px;padding:12px 13px;border-color:rgba(105,211,255,.19);border-radius:17px;background:linear-gradient(135deg,rgba(12,26,39,.86),rgba(5,11,18,.78));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:inset 0 1px rgba(255,255,255,.06),0 10px 25px rgba(0,0,0,.23)}
  .yos-okinawa-map__detail strong{font-size:18px;letter-spacing:.01em}.yos-okinawa-map__detail em{font-size:32px;line-height:1;color:#68f2a5;text-shadow:0 0 8px rgba(66,209,127,.62),0 0 24px rgba(66,209,127,.28)}
  .yos-okinawa-map__detail button{position:relative;overflow:hidden;min-width:98px;background:linear-gradient(135deg,#ffd25b 0%,#ff9b1a 46%,#ff6b00 100%);box-shadow:0 9px 28px rgba(255,112,0,.34),inset 0 1px rgba(255,255,255,.5);transition:transform .14s ease,filter .14s ease}
  .yos-okinawa-map__detail button:before{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.46) 46%,transparent 72%);transform:translateX(-130%);animation:yos-v5-cta 4.2s ease-in-out infinite}.yos-okinawa-map__detail button:active{transform:scale(.98);filter:brightness(.92)}
  .yos-okinawa-map__legend{padding-top:2px;gap:9px;opacity:.92}.yos-okinawa-map__legend i{box-shadow:0 0 9px currentColor}
  .yos-okinawa-map[data-theme='neon']{border-color:rgba(37,225,255,.58);box-shadow:0 24px 72px rgba(0,0,0,.48),0 0 42px rgba(37,225,255,.11),inset 0 1px rgba(255,255,255,.06)}
  .yos-okinawa-map[data-theme='neon'] .yos-okinawa-map__route{stroke:#31efff}.yos-okinawa-map[data-theme='neon'] .yos-okinawa-map__island{stroke:#b8f7ff;filter:drop-shadow(0 0 12px rgba(49,239,255,.6))}
  .yos-okinawa-map[data-theme='light']{background:linear-gradient(155deg,#f8fcff,#e8f3f8);border-color:rgba(45,123,160,.22);box-shadow:0 18px 44px rgba(48,91,122,.18),inset 0 1px #fff}
  .yos-okinawa-map[data-theme='light'] .yos-okinawa-map__canvas{background:radial-gradient(circle at 50% 45%,rgba(70,168,207,.14),transparent 58%),#dcecf5}
  @keyframes yos-route-flow{to{stroke-dashoffset:-18}}@keyframes yos-marker-breathe{0%{r:21;opacity:.48}100%{r:34;opacity:0}}@keyframes yos-current-pulse{0%{transform:scale(.72);opacity:.78}100%{transform:scale(2.05);opacity:0}}@keyframes yos-map-scan{from{transform:translateY(-38%)}to{transform:translateY(38%)}}@keyframes yos-map-sheen{0%,62%,100%{transform:translateX(-75%)}78%{transform:translateX(75%)}}@keyframes yos-live-dot{0%,100%{opacity:.55;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}@keyframes yos-v5-badge{0%,64%,100%{left:-45%}80%{left:125%}}@keyframes yos-v5-core{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}@keyframes yos-v5-cta{0%,58%,100%{transform:translateX(-130%)}76%{transform:translateX(130%)}}
  @media(max-width:390px){.yos-okinawa-map{padding:11px;border-radius:22px}.yos-okinawa-map__canvas{border-radius:16px}.yos-okinawa-map__head b{font-size:16px}.yos-okinawa-map__detail{padding:11px}.yos-okinawa-map__detail em{font-size:30px}}
  @media(prefers-reduced-motion:reduce){.yos-okinawa-map:before,.yos-okinawa-map__canvas:after,.yos-okinawa-map__route,.yos-okinawa-map__marker.is-active .halo,.yos-okinawa-map__marker.is-active .core,.yos-okinawa-map__current .pulse,.yos-okinawa-map__badge:before,.yos-okinawa-map__badge:after,.yos-okinawa-map__detail button:before{animation:none!important}}
  `;
  document.head.appendChild(style);
})();
