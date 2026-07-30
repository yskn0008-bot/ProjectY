'use strict';
(()=>{
  if(window.__yosMapThemeV1)return;
  window.__yosMapThemeV1=true;

  const THEME_KEY='yos-nav-map-theme-v1';
  const THEMES={
    dark:'A スタイリッシュダーク',
    neon:'B ネオンサイバー',
    light:'F シンプルライト'
  };

  const readTheme=()=>{
    try{
      const value=localStorage.getItem(THEME_KEY);
      return THEMES[value]?value:'dark';
    }catch{return'dark'}
  };
  const writeTheme=value=>{
    try{localStorage.setItem(THEME_KEY,value)}catch{}
  };

  const style=document.createElement('style');
  style.textContent=`
    .yos-ev,.yos-area-map{
      --yos-theme-panel:linear-gradient(160deg,rgba(13,24,35,.98),rgba(7,11,16,.99) 58%,rgba(18,20,24,.99));
      --yos-theme-border:rgba(86,153,214,.42);
      --yos-theme-row:rgba(8,14,21,.78);
      --yos-theme-row-border:rgba(255,255,255,.09);
      --yos-theme-copy:var(--text);
      --yos-theme-muted:var(--muted);
      --yos-theme-accent:#ff7b61;
      --yos-theme-shadow:inset 0 1px rgba(255,255,255,.05),0 14px 34px rgba(0,0,0,.16);
      position:relative;
      border-color:var(--yos-theme-border)!important;
      background:var(--yos-theme-panel)!important;
      color:var(--yos-theme-copy)!important;
      box-shadow:var(--yos-theme-shadow)!important;
      overflow:hidden;
    }
    .yos-ev:before,.yos-area-map:before{content:'';position:absolute;inset:0 auto auto 0;width:100%;height:2px;background:linear-gradient(90deg,transparent,var(--yos-theme-accent),transparent);opacity:.9;pointer-events:none}
    .yos-ev[data-theme='neon'],.yos-area-map[data-theme='neon']{
      --yos-theme-panel:linear-gradient(155deg,rgba(18,7,38,.99),rgba(3,10,27,.99) 52%,rgba(21,3,38,.99));
      --yos-theme-border:rgba(37,225,255,.62);
      --yos-theme-row:rgba(8,6,31,.82);
      --yos-theme-row-border:rgba(37,225,255,.2);
      --yos-theme-copy:#f8fbff;
      --yos-theme-muted:#a8b9d6;
      --yos-theme-accent:#25e1ff;
      --yos-theme-shadow:0 0 24px rgba(37,225,255,.13),inset 0 1px rgba(255,255,255,.08);
    }
    .yos-ev[data-theme='light'],.yos-area-map[data-theme='light']{
      --yos-theme-panel:linear-gradient(160deg,#ffffff,#eef4f8);
      --yos-theme-border:#c7d4de;
      --yos-theme-row:rgba(255,255,255,.9);
      --yos-theme-row-border:#d7e1e8;
      --yos-theme-copy:#17212b;
      --yos-theme-muted:#5c6b76;
      --yos-theme-accent:#ff6d78;
      --yos-theme-shadow:0 12px 30px rgba(25,45,60,.1);
    }
    .yos-ev__head b,.yos-area-map__head b,.yos-ev__row b,.yos-area-map__detail strong{color:var(--yos-theme-copy)!important}
    .yos-ev__head small,.yos-ev__row small,.yos-ev__foot,.yos-area-map__head small,.yos-area-map__legend,.yos-area-map__detail p{color:var(--yos-theme-muted)!important}
    .yos-ev__row,.yos-area-map__stat,.yos-area-map__detail{background:var(--yos-theme-row)!important;border-color:var(--yos-theme-row-border)!important}
    .yos-ev__row:first-child{border-color:color-mix(in srgb,var(--yos-theme-accent) 58%,transparent)!important;box-shadow:inset 3px 0 var(--yos-theme-accent)}
    .yos-ev__score{color:var(--yos-theme-copy)!important}.yos-ev__row:first-child .yos-ev__score{color:var(--yos-theme-accent)!important}
    .yos-ev__cruise,.yos-ev__sync,.yos-area-map__toggle,.yos-area-map__theme{background:var(--yos-theme-row)!important;border-color:var(--yos-theme-border)!important;color:var(--yos-theme-copy)!important}
    .yos-map-theme-control{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:0 8px;border:1px solid var(--yos-theme-border);border-radius:999px;background:var(--yos-theme-row);color:var(--yos-theme-copy);font-size:10px;font-weight:900}
    .yos-map-theme-control span{white-space:nowrap}.yos-map-theme-select{max-width:122px;border:0;background:transparent;color:inherit;font:inherit;font-weight:900;outline:none}
    .yos-map-theme-select option{color:#111;background:#fff}
    .yos-ev[data-theme='neon'] .yos-ev__score,.yos-area-map[data-theme='neon'] .yos-area-map__selected-score{text-shadow:0 0 9px currentColor}
    .yos-ev[data-theme='light'] .yos-ev__rank{background:#e7eef3;color:#52616c}.yos-ev[data-theme='light'] .yos-ev__row:first-child .yos-ev__rank{background:#ffe4df;color:#b64031}
    @media(max-width:390px){.yos-map-theme-control{width:100%;justify-content:space-between}.yos-map-theme-select{max-width:none;flex:1;min-width:0}}
    @media(prefers-reduced-motion:reduce){.yos-ev,.yos-area-map{scroll-behavior:auto}}
  `;
  document.head.appendChild(style);

  const applyTheme=value=>{
    const theme=THEMES[value]?value:'dark';
    document.querySelectorAll('.yos-ev,.yos-area-map').forEach(section=>{section.dataset.theme=theme});
    document.querySelectorAll('.yos-map-theme-select').forEach(select=>{select.value=theme});
  };

  const mount=()=>{
    const targets=[...document.querySelectorAll('.yos-ev__tools,.yos-area-map__tools')];
    if(!targets.length)return false;
    targets.forEach(target=>{
      if(target.querySelector('.yos-map-theme-control'))return;
      const label=document.createElement('label');
      label.className='yos-map-theme-control';
      const caption=document.createElement('span');
      caption.textContent='デザイン';
      const select=document.createElement('select');
      select.className='yos-map-theme-select';
      select.setAttribute('aria-label','YOSナビのマップデザイン');
      Object.entries(THEMES).forEach(([value,text])=>{
        const option=document.createElement('option');
        option.value=value;
        option.textContent=text;
        select.appendChild(option);
      });
      select.value=readTheme();
      select.addEventListener('change',event=>{
        const value=event.currentTarget.value;
        writeTheme(value);
        applyTheme(value);
      });
      label.append(caption,select);
      target.prepend(label);
    });
    applyTheme(readTheme());
    return true;
  };

  mount();
  const observer=new MutationObserver(()=>mount());
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('yos-nav-recommendation',()=>mount());
  window.addEventListener('pageshow',()=>applyTheme(readTheme()));
})();
