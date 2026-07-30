'use strict';
(()=>{
  if(window.__yosMapVisualV4)return;
  window.__yosMapVisualV4=true;
  const style=document.createElement('style');
  style.id='yos-map-visual-v4';
  style.textContent=`
  .yos-okinawa-map{border:1px solid rgba(93,210,255,.34);background:
    radial-gradient(circle at 76% 8%,rgba(38,225,255,.18),transparent 28%),
    radial-gradient(circle at 18% 85%,rgba(80,255,169,.12),transparent 34%),
    linear-gradient(155deg,#0b1926 0%,#03070c 56%,#0c121b 100%);
    box-shadow:0 26px 70px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.06),0 0 36px rgba(31,184,255,.08)}
  .yos-okinawa-map__head{position:relative;z-index:4;align-items:center}
  .yos-okinawa-map__head b{letter-spacing:.02em;text-shadow:0 0 18px rgba(126,220,255,.24)}
  .yos-okinawa-map__badge{position:relative;overflow:hidden;border-color:rgba(99,255,182,.5);background:linear-gradient(135deg,rgba(53,224,132,.22),rgba(25,112,84,.12));box-shadow:0 0 24px rgba(63,246,148,.22),inset 0 1px rgba(255,255,255,.18)}
  .yos-okinawa-map__badge:after{content:'';position:absolute;inset:-40% auto -40% -45%;width:35%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.58),transparent);transform:skewX(-18deg);animation:yos-v4-badge 3.8s ease-in-out infinite}
  .yos-okinawa-map__canvas{border-color:rgba(98,210,255,.27);background:
    radial-gradient(circle at 50% 45%,rgba(31,146,191,.28),transparent 52%),
    radial-gradient(circle at 50% 50%,transparent 0 34%,rgba(35,173,225,.08) 34.5% 35%,transparent 35.5% 49%,rgba(35,173,225,.07) 49.5% 50%,transparent 50.5%),
    linear-gradient(180deg,#061722,#02080d);box-shadow:inset 0 0 70px rgba(0,0,0,.72),inset 0 1px rgba(255,255,255,.04),0 12px 34px rgba(0,0,0,.36)}
  .yos-okinawa-map__canvas:before{background:
    linear-gradient(90deg,transparent 49.8%,rgba(60,204,255,.08) 50%,transparent 50.2%),
    linear-gradient(180deg,transparent 49.8%,rgba(60,204,255,.08) 50%,transparent 50.2%),
    repeating-linear-gradient(180deg,rgba(255,255,255,.016) 0 1px,transparent 1px 4px)}
  .yos-okinawa-map svg{filter:saturate(1.12) contrast(1.04)}
  .yos-okinawa-map__grid{stroke:#2d708a;opacity:.28}
  .yos-okinawa-map__island{stroke:#a4dfed;stroke-width:2;filter:drop-shadow(0 0 7px rgba(137,228,255,.46)) drop-shadow(0 12px 10px rgba(0,0,0,.42))}
  .yos-okinawa-map__road{stroke:#8ca8b1;stroke-width:1.6;opacity:.62;filter:drop-shadow(0 0 2px rgba(255,255,255,.18))}
  .yos-okinawa-map__route{stroke-width:3.2;stroke-linecap:round;stroke-dasharray:3 8;filter:drop-shadow(0 0 4px currentColor) drop-shadow(0 0 11px currentColor);animation:yos-route-flow .78s linear infinite}
  .yos-okinawa-map__marker .halo{opacity:.25;filter:blur(.5px)}
  .yos-okinawa-map__marker .core{stroke-width:2.4;filter:drop-shadow(0 0 5px #fff) drop-shadow(0 0 15px currentColor)}
  .yos-okinawa-map__marker.is-active .core{animation:yos-v4-core 1.7s ease-in-out infinite}
  .yos-okinawa-map__marker .score{font-size:13px;letter-spacing:-.03em}
  .yos-okinawa-map__marker .name{font-size:10px;stroke-width:4px;text-shadow:0 2px 8px #000}
  .yos-okinawa-map__current .dot{filter:drop-shadow(0 0 6px #fff) drop-shadow(0 0 15px #248bff)}
  .yos-okinawa-map__detail{border-color:rgba(105,211,255,.19);background:linear-gradient(135deg,rgba(12,26,39,.86),rgba(5,11,18,.78));box-shadow:inset 0 1px rgba(255,255,255,.06),0 10px 25px rgba(0,0,0,.23)}
  .yos-okinawa-map__detail strong{letter-spacing:.01em}.yos-okinawa-map__detail em{font-size:32px;text-shadow:0 0 8px rgba(66,209,127,.62),0 0 24px rgba(66,209,127,.28)}
  .yos-okinawa-map__detail button{position:relative;overflow:hidden;background:linear-gradient(135deg,#ffd25b 0%,#ff9b1a 46%,#ff6b00 100%);box-shadow:0 9px 28px rgba(255,112,0,.34),inset 0 1px rgba(255,255,255,.5)}
  .yos-okinawa-map__detail button:before{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.46) 46%,transparent 72%);transform:translateX(-130%);animation:yos-v4-cta 4.2s ease-in-out infinite}
  .yos-okinawa-map__legend{padding-top:2px}.yos-okinawa-map__legend i{box-shadow:0 0 9px currentColor}
  .yos-okinawa-map[data-theme='neon'] .yos-okinawa-map__route{stroke:#31efff}.yos-okinawa-map[data-theme='neon'] .yos-okinawa-map__island{stroke:#b8f7ff;filter:drop-shadow(0 0 12px rgba(49,239,255,.6))}
  .yos-okinawa-map[data-theme='light']{box-shadow:0 18px 44px rgba(48,91,122,.18)}.yos-okinawa-map[data-theme='light'] .yos-okinawa-map__canvas{background:radial-gradient(circle at 50% 45%,rgba(70,168,207,.14),transparent 58%),#dcecf5}
  @keyframes yos-v4-badge{0%,64%,100%{left:-45%}80%{left:125%}}
  @keyframes yos-v4-core{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
  @keyframes yos-v4-cta{0%,58%,100%{transform:translateX(-130%)}76%{transform:translateX(130%)}}
  @media(max-width:390px){.yos-okinawa-map{padding:11px}.yos-okinawa-map__canvas{border-radius:16px}.yos-okinawa-map__head b{font-size:16px}.yos-okinawa-map__detail em{font-size:30px}}
  @media(prefers-reduced-motion:reduce){.yos-okinawa-map__badge:after,.yos-okinawa-map__detail button:before,.yos-okinawa-map__marker.is-active .core{animation:none!important}}
  `;
  document.head.appendChild(style);
})();