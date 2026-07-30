'use strict';
(()=>{
if(window.__yosMapPremiumV6)return;window.__yosMapPremiumV6=true;
const s=document.createElement('style');s.id='yos-map-premium-v6';s.textContent=`
body.yos-approved-map{background:radial-gradient(circle at 50% -10%,rgba(24,145,255,.24),transparent 32%),linear-gradient(180deg,#03111e,#010408)}
body.yos-approved-map .app{max-width:620px;padding:8px 10px 108px}
body.yos-approved-map .yos-okinawa-map{overflow:hidden;border-radius:30px;border-color:rgba(104,219,255,.44);background:radial-gradient(circle at 76% 5%,rgba(55,231,255,.2),transparent 24%),linear-gradient(160deg,#0c2235,#02080f 58%,#07121d);box-shadow:0 34px 100px rgba(0,0,0,.62),0 0 48px rgba(35,184,255,.14),inset 0 1px rgba(255,255,255,.08)}
body.yos-approved-map .yos-okinawa-map__head b{font-size:22px;text-shadow:0 0 22px rgba(96,225,255,.38)}
body.yos-approved-map .yos-okinawa-map__canvas{min-height:430px;border-radius:24px;border-color:rgba(90,211,255,.36);background:radial-gradient(circle at 50% 50%,rgba(28,164,224,.22),transparent 40%),radial-gradient(circle at 50% 50%,transparent 0 20%,rgba(51,207,255,.14) 20.3% 20.7%,transparent 21% 34%,rgba(51,207,255,.11) 34.3% 34.7%,transparent 35% 49%,rgba(51,207,255,.08) 49.3% 49.7%,transparent 50%),linear-gradient(180deg,#061a29,#020914);box-shadow:inset 0 0 90px rgba(0,0,0,.78),0 18px 42px rgba(0,0,0,.36)}
body.yos-approved-map .yos-okinawa-map svg{transform:scale(1.04);filter:saturate(1.35) contrast(1.08) drop-shadow(0 24px 18px rgba(0,0,0,.45))}
body.yos-approved-map .yos-okinawa-map__island{fill:#173641;stroke:#baf4ff;stroke-width:2.4;filter:drop-shadow(0 0 10px rgba(112,233,255,.68)) drop-shadow(0 15px 9px rgba(0,0,0,.52))}
body.yos-approved-map .yos-okinawa-map__road{stroke:#9ac0ca;stroke-width:1.8;opacity:.72}
body.yos-approved-map .yos-okinawa-map__route{stroke-width:4;stroke-dasharray:4 10;filter:drop-shadow(0 0 5px currentColor) drop-shadow(0 0 16px currentColor);animation:yos-v6-route .58s linear infinite}
body.yos-approved-map .yos-okinawa-map__marker .core{stroke:#fff;stroke-width:3;filter:drop-shadow(0 0 8px #fff) drop-shadow(0 0 20px currentColor)}
body.yos-approved-map .yos-okinawa-map__marker.is-active .halo{animation:yos-v6-marker 1.45s ease-out infinite}
body.yos-approved-map .yos-okinawa-map__marker .score{font-size:15px;font-weight:950;paint-order:stroke;stroke:#02070d;stroke-width:4px}
body.yos-approved-map .yos-okinawa-map__marker .name{font-size:11px;font-weight:900;paint-order:stroke;stroke:#02070d;stroke-width:5px}
body.yos-approved-map .yos-okinawa-map__current .pulse{fill:rgba(55,174,255,.38);animation:yos-v6-current 1.25s ease-out infinite}
body.yos-approved-map .yos-approved-score{border-radius:14px;background:linear-gradient(180deg,rgba(12,25,38,.92),rgba(3,9,15,.9));box-shadow:inset 0 1px rgba(255,255,255,.06),0 8px 20px rgba(0,0,0,.22)}
body.yos-approved-map .yos-approved-score b{font-size:22px;text-shadow:0 0 14px currentColor}
body.yos-approved-map .yos-okinawa-map__detail{border-radius:20px;border-color:rgba(255,92,107,.32);background:radial-gradient(circle at 8% 20%,rgba(255,79,92,.2),transparent 35%),linear-gradient(135deg,#2a0e15,#060d15);box-shadow:0 16px 36px rgba(0,0,0,.32)}
body.yos-approved-map .yos-okinawa-map__detail em{font-size:36px;color:#71f7ab;text-shadow:0 0 12px rgba(75,255,159,.65)}
body.yos-approved-map .yos-okinawa-map__detail button{min-width:112px;padding:12px 16px;border-radius:14px;background:linear-gradient(145deg,#ff7a80,#dd2e3d);box-shadow:0 12px 32px rgba(228,48,62,.38)}
@keyframes yos-v6-route{to{stroke-dashoffset:-28}}@keyframes yos-v6-marker{0%{transform:scale(.75);opacity:.7}100%{transform:scale(1.8);opacity:0}}@keyframes yos-v6-current{0%{transform:scale(.65);opacity:.85}100%{transform:scale(2.4);opacity:0}}
@media(max-width:390px){body.yos-approved-map .yos-okinawa-map__canvas{min-height:390px}body.yos-approved-map .yos-okinawa-map__head b{font-size:18px}body.yos-approved-map .yos-approved-score b{font-size:19px}body.yos-approved-map .yos-okinawa-map__detail em{font-size:32px}}
@media(prefers-reduced-motion:reduce){body.yos-approved-map .yos-okinawa-map__route,body.yos-approved-map .yos-okinawa-map__marker.is-active .halo,body.yos-approved-map .yos-okinawa-map__current .pulse{animation:none!important}}
`;document.head.appendChild(s);
})();
