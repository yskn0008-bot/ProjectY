'use strict';
(()=>{
  if(window.__yosMapVisualV3)return;
  window.__yosMapVisualV3=true;
  const style=document.createElement('style');
  style.id='yos-map-visual-v3';
  style.textContent=`
  .yos-okinawa-map{padding:14px;border-radius:26px;border-color:rgba(75,194,255,.34);background:
    radial-gradient(circle at 78% 0%,rgba(37,225,255,.18),transparent 28%),
    radial-gradient(circle at 12% 92%,rgba(66,209,127,.12),transparent 32%),
    linear-gradient(155deg,#0b1722 0%,#05090f 54%,#111820 100%);
    box-shadow:0 24px 70px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.06),0 0 0 1px rgba(37,225,255,.035)}
  .yos-okinawa-map__head{align-items:flex-start;padding:2px 2px 4px}
  .yos-okinawa-map__head b{font-size:19px;letter-spacing:.01em;text-shadow:0 0 18px rgba(112,217,255,.16)}
  .yos-okinawa-map__head small{font-size:10px;letter-spacing:.035em}
  .yos-okinawa-map__badge{position:relative;padding:6px 10px;border-color:rgba(77,255,160,.52);background:linear-gradient(180deg,rgba(64,220,138,.20),rgba(27,129,82,.12));color:#b8ffd4;box-shadow:0 0 22px rgba(66,209,127,.18),inset 0 1px rgba(255,255,255,.12)}
  .yos-okinawa-map__badge:before{content:'';display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%;background:#56ffa1;box-shadow:0 0 10px #56ffa1;animation:yos-live-dot 1.5s ease-in-out infinite}
  .yos-okinawa-map__canvas{margin-top:11px;border-radius:21px;border-color:rgba(105,210,255,.18);background:
    radial-gradient(ellipse at 51% 47%,rgba(36,144,187,.23),transparent 48%),
    radial-gradient(circle at 50% 50%,#0a2633 0%,#04131d 58%,#020a10 100%);
    box-shadow:inset 0 0 70px rgba(0,0,0,.62),0 16px 34px rgba(0,0,0,.31),0 0 28px rgba(25,170,225,.06)}
  .yos-okinawa-map__canvas:before{background:
    repeating-linear-gradient(180deg,rgba(255,255,255,.018) 0 1px,transparent 1px 4px),
    linear-gradient(90deg,transparent 49.8%,rgba(64,196,244,.07) 50%,transparent 50.2%)}
  .yos-okinawa-map__canvas:after{background:linear-gradient(180deg,transparent 0 47%,rgba(52,210,255,.14) 50%,transparent 53%);filter:blur(.2px)}
  .yos-okinawa-map__grid{stroke:#2b6a80;opacity:.28;stroke-dasharray:2 5}
  .yos-okinawa-map__island{fill:url(#yos-island-gradient,#1a3038);stroke:#9adff0;stroke-width:1.9;filter:drop-shadow(0 0 16px rgba(63,193,230,.34)) drop-shadow(0 12px 18px rgba(0,0,0,.38))}
  .yos-okinawa-map__road{stroke:#9cb7bf;stroke-width:1.25;opacity:.55;stroke-dasharray:3 5}
  .yos-okinawa-map__route{stroke-width:3.1;stroke-linecap:round;stroke-dasharray:7 8;filter:drop-shadow(0 0 4px rgba(255,133,77,.95)) drop-shadow(0 0 11px rgba(255,94,61,.42));animation-duration:1.05s}
  .yos-okinawa-map__marker{transform-box:fill-box;transform-origin:center;transition:filter .2s ease}
  .yos-okinawa-map__marker:before{content:attr(data-index)}
  .yos-okinawa-map__marker .halo{opacity:.18;filter:blur(.2px)}
  .yos-okinawa-map__marker .core{stroke-width:2.2;filter:drop-shadow(0 0 8px currentColor) drop-shadow(0 0 16px currentColor)}
  .yos-okinawa-map__marker .score{font-size:13px;letter-spacing:-.02em}
  .yos-okinawa-map__marker .name{font-size:9.4px;stroke-width:3.5px}
  .yos-okinawa-map__marker.is-active .core{stroke:#fff;stroke-width:3}
  .yos-okinawa-map__marker.is-active{filter:drop-shadow(0 0 14px currentColor)}
  .yos-okinawa-map__current .dot{fill:#e9f7ff;stroke:#269eff;stroke-width:3.5;filter:drop-shadow(0 0 8px #269eff) drop-shadow(0 0 15px rgba(38,158,255,.7))}
  .yos-okinawa-map__current .pulse{fill:rgba(38,158,255,.34)}
  .yos-okinawa-map__detail{margin-top:11px;padding:12px 13px;border-radius:17px;border-color:rgba(255,255,255,.10);background:linear-gradient(145deg,rgba(14,27,39,.82),rgba(7,12,18,.74));box-shadow:inset 0 1px rgba(255,255,255,.055),0 12px 30px rgba(0,0,0,.2)}
  .yos-okinawa-map__detail strong{font-size:18px}
  .yos-okinawa-map__detail em{font-size:33px;line-height:1;color:#68f2a5;text-shadow:0 0 18px rgba(82,242,159,.40)}
  .yos-okinawa-map__detail p{font-size:10.5px}
  .yos-okinawa-map__detail button{position:relative;overflow:hidden;min-width:98px;background:linear-gradient(145deg,#ffc83d 0%,#ff8a13 58%,#ff6b00 100%);box-shadow:0 10px 28px rgba(255,115,0,.31),inset 0 1px rgba(255,255,255,.48)}
  .yos-okinawa-map__detail button:before{content:'';position:absolute;inset:-40% auto -40% -45%;width:34%;transform:skewX(-18deg);background:rgba(255,255,255,.34);animation:yos-button-glint 4.2s ease-in-out infinite}
  .yos-okinawa-map__legend{padding:1px 2px 0;gap:9px;font-size:9px;opacity:.92}
  .yos-okinawa-map__legend i{box-shadow:0 0 8px currentColor}
  .yos-okinawa-map[data-theme='neon']{border-color:rgba(37,225,255,.58);box-shadow:0 24px 72px rgba(0,0,0,.48),0 0 42px rgba(37,225,255,.11),inset 0 1px rgba(255,255,255,.06)}
  .yos-okinawa-map[data-theme='neon'] .yos-okinawa-map__route{stroke:#36e8ff;filter:drop-shadow(0 0 5px #36e8ff) drop-shadow(0 0 14px rgba(54,232,255,.55))}
  .yos-okinawa-map[data-theme='light']{background:linear-gradient(155deg,#f8fcff,#e8f3f8);border-color:rgba(45,123,160,.22);box-shadow:0 18px 44px rgba(28,74,96,.16),inset 0 1px #fff}
  .yos-okinawa-map[data-theme='light'] .yos-okinawa-map__canvas{background:radial-gradient(circle at 50% 48%,#d9f3ff,#badbea 72%,#a9cedf)}
  @keyframes yos-live-dot{0%,100%{opacity:.55;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
  @keyframes yos-button-glint{0%,58%,100%{left:-45%}74%{left:125%}}
  @media(max-width:390px){.yos-okinawa-map{padding:12px;border-radius:22px}.yos-okinawa-map__head b{font-size:17px}.yos-okinawa-map__detail{padding:11px}.yos-okinawa-map__detail em{font-size:30px}}
  @media(prefers-reduced-motion:reduce){.yos-okinawa-map__badge:before,.yos-okinawa-map__detail button:before{animation:none!important}}
  `;
  document.head.appendChild(style);
})();
