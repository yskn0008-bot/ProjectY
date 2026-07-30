'use strict';
(()=>{
  if(window.__yosMapLabelSafetyV49)return;
  window.__yosMapLabelSafetyV49=true;
  const style=document.createElement('style');
  style.id='yos-map-label-safety-v49';
  style.textContent=`
  body.yos-approved-map .yos-okinawa-map__marker .name{font-size:10px;letter-spacing:-.03em}
  body.yos-approved-map .yos-okinawa-map__marker[data-index='1'] .name,
  body.yos-approved-map .yos-okinawa-map__marker[data-index='3'] .name,
  body.yos-approved-map .yos-okinawa-map__marker[data-index='5'] .name{transform:translateY(-54px)}
  body.yos-approved-map .yos-okinawa-map__marker[data-index='2'] .name,
  body.yos-approved-map .yos-okinawa-map__marker[data-index='4'] .name{transform:translateX(6px)}
  body.yos-approved-map .yos-okinawa-map__marker:focus-visible .core{stroke:#fff;stroke-width:4;filter:drop-shadow(0 0 10px #fff) drop-shadow(0 0 24px currentColor)}
  body.yos-approved-map .yos-okinawa-map__marker:focus-visible .name{fill:#fff;stroke-width:6px}
  @media(max-width:390px){body.yos-approved-map .yos-okinawa-map__marker .name{font-size:8.5px}body.yos-approved-map .yos-okinawa-map__marker[data-index='2'] .name,body.yos-approved-map .yos-okinawa-map__marker[data-index='4'] .name{transform:translateX(4px)}}
  `;
  document.head.appendChild(style);
})();
