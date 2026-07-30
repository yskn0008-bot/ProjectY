'use strict';
(()=>{
  if(window.__yosAreaMapV1)return;
  window.__yosAreaMapV1=true;

  const params=new URLSearchParams(location.search);
  const numberParam=(name,fallback)=>{
    const raw=params.get(name);
    if(raw===null||raw==='')return fallback;
    const value=Number(raw);
    return Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):fallback;
  };
  const areas=[
    {key:'primary',tone:'green',rank:'最優先',label:params.get('primaryLabel')||'久茂地',destination:params.get('primary')||'那覇市久茂地',action:params.get('primaryAction')||'今すぐ向かう',score:numberParam('primaryScore',82),latitude:26.215419,longitude:127.682000},
    {key:'next',tone:'blue',rank:'次候補',label:params.get('nextLabel')||'松山',destination:params.get('next')||'那覇市松山',action:params.get('nextAction')||'到着後10分待機',score:numberParam('nextScore',71),latitude:26.220482,longitude:127.680233},
    {key:'pass',tone:'yellow',rank:'条件付き',label:params.get('passLabel')||'若狭',destination:params.get('pass')||'那覇市若狭',action:params.get('passAction')||'流しながら確認',score:numberParam('passScore',55),latitude:26.221434,longitude:127.675664},
    {key:'avoid',tone:'red',rank:'回避',label:params.get('avoidLabel')||'空港',destination:params.get('avoid')||'那覇空港',action:params.get('avoidAction')||'今は行かない',score:numberParam('avoidScore',24),latitude:26.189333,longitude:127.637167}
  ];

  const bounds={west:127.632,east:127.688,south:26.185,north:26.226};
  const frame={left:24,right:336,top:24,bottom:220};
  const project=(latitude,longitude)=>({
    x:frame.left+((longitude-bounds.west)/(bounds.east-bounds.west))*(frame.right-frame.left),
    y:frame.bottom-((latitude-bounds.south)/(bounds.north-bounds.south))*(frame.bottom-frame.top)
  });
  const inBounds=(latitude,longitude)=>latitude>=bounds.south&&latitude<=bounds.north&&longitude>=bounds.west&&longitude<=bounds.east;
  const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  const THEME_KEY='yos-nav-map-theme-v1';
  const themes=[
    {value:'stylish',label:'A スタイリッシュ'},
    {value:'neon',label:'B ネオン'},
    {value:'radar',label:'D レーダー'},
    {value:'light',label:'F ライト'}
  ];
  const validTheme=value=>themes.some(theme=>theme.value===value);
  const readTheme=()=>{
    try{return localStorage.getItem(THEME_KEY)||'';}catch{return '';}
  };
  const writeTheme=value=>{
    try{localStorage.setItem(THEME_KEY,value);}catch{}
  };
  const initialTheme=validTheme(params.get('mapTheme'))?params.get('mapTheme'):(validTheme(readTheme())?readTheme():'stylish');

  const style=document.createElement('style');
  style.textContent=`
    .yos-area-map{
      --map-panel-a:rgba(19,45,65,.86);--map-panel-b:rgba(13,15,20,.98);--map-panel-c:rgba(23,23,25,.98);
      --map-border:rgba(111,168,255,.28);--map-text:#fff;--map-muted:var(--muted);--map-control:#222226;
      --map-stat:rgba(5,7,10,.55);--map-canvas:#07131d;--map-sea:#081723;--map-grid:#163040;
      --map-land:#172129;--map-land-stroke:#43515c;--map-district:#2a3b47;--map-road:#4b5560;
      --map-route:var(--accent);--map-detail:rgba(6,8,11,.72);--map-overlay-top:rgba(255,255,255,.035);--map-overlay-bottom:rgba(0,0,0,.2);
      margin:12px 0 0;padding:13px;border:1px solid var(--map-border);border-radius:22px;
      background:linear-gradient(160deg,var(--map-panel-a),var(--map-panel-b) 54%,var(--map-panel-c));
      color:var(--map-text);overflow:hidden;box-shadow:inset 0 1px rgba(255,255,255,.05)
    }
    .yos-area-map__head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:9px}
    .yos-area-map__head b{display:block;color:var(--map-text);font-size:18px}
    .yos-area-map__head small{display:block;margin-top:4px;color:var(--map-muted);font-size:11px;line-height:1.45}
    .yos-area-map__toggle{flex:none;min-height:36px;padding:0 11px;border:1px solid var(--map-border);border-radius:999px;background:var(--map-control);color:var(--map-text);font-size:11px;font-weight:900}
    .yos-area-map__settings{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
    .yos-area-map__badge{flex:none;padding:5px 8px;border:1px solid rgba(244,200,77,.4);border-radius:999px;background:rgba(244,200,77,.1);color:var(--yellow);font-size:10px;font-weight:950}
    .yos-area-map__theme-label{display:flex;min-width:0;flex:1;align-items:center;gap:7px;color:var(--map-muted);font-size:10px;font-weight:900}
    .yos-area-map__theme-label span{flex:none}
    .yos-area-map__theme{min-width:0;width:100%;height:36px;border:1px solid var(--map-border);border-radius:11px;padding:0 30px 0 10px;background:var(--map-control);color:var(--map-text);font-size:12px;font-weight:900}
    .yos-area-map__stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:9px}
    .yos-area-map__stat{padding:8px 6px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:var(--map-stat);text-align:center}
    .yos-area-map__stat span{display:block;color:var(--map-muted);font-size:9px;font-weight:900}.yos-area-map__stat b{display:block;margin-top:2px;font-size:15px}
    .yos-area-map__stat.green b{color:var(--green)}.yos-area-map__stat.blue b{color:var(--blue)}.yos-area-map__stat.yellow b{color:var(--yellow)}.yos-area-map__stat.red b{color:var(--red)}
    .yos-area-map__canvas{position:relative;border:1px solid var(--map-border);border-radius:18px;overflow:hidden;background:var(--map-canvas)}
    .yos-area-map__canvas:after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,var(--map-overlay-top),transparent 35%,var(--map-overlay-bottom))}
    .yos-area-map svg{display:block;width:100%;height:auto;touch-action:manipulation}
    .yos-area-map__sea{fill:var(--map-sea)}.yos-area-map__grid{stroke:var(--map-grid);stroke-width:.6;opacity:.6}
    .yos-area-map__land{fill:var(--map-land);stroke:var(--map-land-stroke);stroke-width:1.3}
    .yos-area-map__district{fill:none;stroke:var(--map-district);stroke-width:1;stroke-dasharray:3 3;opacity:.75}
    .yos-area-map__road{fill:none;stroke:var(--map-road);stroke-width:3;stroke-linecap:round;opacity:.85}.yos-area-map__road.minor{stroke-width:1.3;opacity:.65}
    .yos-area-map__route{fill:none;stroke:var(--map-route);stroke-width:2.4;stroke-dasharray:7 6;stroke-linecap:round;opacity:.82}
    .yos-area-map__radar{display:none;pointer-events:none}.yos-area-map__radar circle{fill:none;stroke:#7cff82;stroke-width:.8;opacity:.28}.yos-area-map__radar path{fill:rgba(89,255,104,.13)}
    .yos-area-map__zone{cursor:pointer;outline:none}.yos-area-map__zone .halo{opacity:.17}.yos-area-map__zone .core{stroke-width:2.2;filter:drop-shadow(0 0 7px currentColor)}
    .yos-area-map__zone text{pointer-events:none;text-anchor:middle;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic',sans-serif}.yos-area-map__zone .score{fill:#fff;font-size:15px;font-weight:950}.yos-area-map__zone .name{fill:#fff;font-size:11px;font-weight:900;paint-order:stroke;stroke:rgba(0,0,0,.7);stroke-width:2px}
    .yos-area-map__zone.green{color:var(--green)}.yos-area-map__zone.blue{color:var(--blue)}.yos-area-map__zone.yellow{color:var(--yellow)}.yos-area-map__zone.red{color:var(--red)}
    .yos-area-map__zone .halo,.yos-area-map__zone .core{fill:currentColor}.yos-area-map__zone.green .core{stroke:#9bf0bd}.yos-area-map__zone.blue .core{stroke:#b8d1ff}.yos-area-map__zone.yellow .core{stroke:#ffe69a}.yos-area-map__zone.red .core{stroke:#ffb2b9}
    .yos-area-map__zone[aria-pressed='true'] .halo{opacity:.4;animation:yos-map-pulse 1.5s ease-in-out infinite}.yos-area-map__zone[aria-pressed='true'] .core{stroke:#fff;stroke-width:3}.yos-area-map__zone:focus-visible .core{stroke:#fff;stroke-width:4}
    @keyframes yos-map-pulse{50%{opacity:.12}}
    .yos-area-map__current{display:none;pointer-events:none}.yos-area-map__current.is-visible{display:block}.yos-area-map__current circle:first-child{fill:rgba(36,139,255,.24)}.yos-area-map__current circle:last-child{fill:#fff;stroke:#1677ff;stroke-width:3}.yos-area-map__current text{fill:#fff;font-size:9px;font-weight:950;text-anchor:middle;paint-order:stroke;stroke:rgba(0,0,0,.7);stroke-width:2px}
    .yos-area-map__detail{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin-top:10px;padding:12px;border:1px solid var(--map-border);border-radius:16px;background:var(--map-detail)}
    .yos-area-map__detail strong{display:flex;align-items:baseline;gap:6px;color:var(--map-text);font-size:18px}.yos-area-map__detail strong em{font-style:normal;color:var(--accent);font-size:31px;line-height:1}.yos-area-map__detail p{margin:5px 0 0;color:var(--map-muted);font-size:12px;line-height:1.5}
    .yos-area-map__detail button{min-height:46px;padding:0 14px;border:0;border-radius:13px;background:linear-gradient(145deg,#ffb323,#ff7a00);color:#17100a;font-size:13px;font-weight:950}.yos-area-map__detail button:disabled{background:#2b2b30;color:var(--muted);cursor:not-allowed}
    .yos-area-map__legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;color:var(--map-muted);font-size:11px}.yos-area-map__legend span{display:flex;align-items:center;gap:5px}.yos-area-map__legend i{width:8px;height:8px;border-radius:50%}
    .yos-area-map__legend .green{background:var(--green)}.yos-area-map__legend .blue{background:var(--blue)}.yos-area-map__legend .yellow{background:var(--yellow)}.yos-area-map__legend .red{background:var(--red)}
    .yos-area-map.theme-neon{--map-panel-a:rgba(18,8,45,.96);--map-panel-b:rgba(4,7,24,.99);--map-panel-c:rgba(5,26,42,.98);--map-border:rgba(55,220,255,.48);--map-control:#10102a;--map-stat:rgba(9,5,29,.78);--map-canvas:#040616;--map-sea:#030514;--map-grid:#1e2868;--map-land:#0d1231;--map-land-stroke:#2b6d99;--map-district:#223b79;--map-road:#314f99;--map-route:#29efff;--map-detail:rgba(8,5,28,.82)}
    .yos-area-map.theme-neon{box-shadow:inset 0 1px rgba(255,255,255,.06),0 0 0 1px rgba(194,55,255,.12)}
    .yos-area-map.theme-neon .yos-area-map__zone .core{filter:drop-shadow(0 0 10px currentColor)}.yos-area-map.theme-neon .yos-area-map__route{filter:drop-shadow(0 0 4px #29efff)}
    .yos-area-map.theme-radar{--map-panel-a:rgba(12,32,12,.98);--map-panel-b:rgba(4,12,6,.99);--map-panel-c:rgba(8,24,10,.99);--map-border:rgba(107,255,115,.35);--map-control:#0c1c0d;--map-stat:rgba(5,19,7,.82);--map-canvas:#031006;--map-sea:#020b04;--map-grid:#17421b;--map-land:#0b2210;--map-land-stroke:#2c6e31;--map-district:#275d2b;--map-road:#34743a;--map-route:#75ff7d;--map-detail:rgba(4,18,6,.86);--map-overlay-top:rgba(128,255,137,.025)}
    .yos-area-map.theme-radar .yos-area-map__radar{display:block}.yos-area-map.theme-radar .yos-area-map__route{stroke-dasharray:3 5}.yos-area-map.theme-radar .yos-area-map__canvas{box-shadow:inset 0 0 22px rgba(89,255,104,.08)}
    .yos-area-map.theme-light{--map-panel-a:#f7fafc;--map-panel-b:#edf3f7;--map-panel-c:#f8fafb;--map-border:rgba(55,83,103,.22);--map-text:#12202b;--map-muted:#5a6b78;--map-control:#fff;--map-stat:rgba(255,255,255,.84);--map-canvas:#dcebf2;--map-sea:#d4edf7;--map-grid:#bbd2dc;--map-land:#eef2e8;--map-land-stroke:#9eb3a8;--map-district:#b5c2b8;--map-road:#a3adb4;--map-route:#ef8f16;--map-detail:rgba(255,255,255,.9);--map-overlay-top:rgba(255,255,255,.15);--map-overlay-bottom:rgba(30,55,70,.06)}
    .yos-area-map.theme-light{box-shadow:inset 0 1px rgba(255,255,255,.8)}.yos-area-map.theme-light .yos-area-map__stat{border-color:rgba(55,83,103,.13)}
    .yos-area-map.theme-light .yos-area-map__zone .core{filter:none}.yos-area-map.theme-light .yos-area-map__detail button:disabled{background:#d7dde1;color:#6f7d87}
    .yos-area-map.is-collapsed .yos-area-map__settings,.yos-area-map.is-collapsed .yos-area-map__stats,.yos-area-map.is-collapsed .yos-area-map__canvas,.yos-area-map.is-collapsed .yos-area-map__detail,.yos-area-map.is-collapsed .yos-area-map__legend{display:none}.yos-area-map.is-collapsed .yos-area-map__head{margin-bottom:0}
    @media(max-width:390px){.yos-area-map__head{align-items:center}.yos-area-map__settings{align-items:stretch;flex-direction:column}.yos-area-map__badge{align-self:flex-start}.yos-area-map__detail{grid-template-columns:1fr}.yos-area-map__detail button{width:100%}.yos-area-map__stats{grid-template-columns:1fr 1fr}}
    @media(prefers-reduced-motion:reduce){.yos-area-map__zone[aria-pressed='true'] .halo{animation:none}}
  `;
  document.head.appendChild(style);

  const hero=document.querySelector('.hero');
  if(!hero)return;
  const zoneMarkup=areas.map(area=>{
    const point=project(area.latitude,area.longitude);
    return `<g class="yos-area-map__zone ${area.tone}" data-key="${area.key}" role="button" tabindex="0" aria-label="${escapeHtml(area.label)} 参考スコア ${area.score}" aria-pressed="false" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})"><circle class="halo" r="31"></circle><circle class="core" r="21"></circle><text class="score" y="5">${area.score}</text><text class="name" y="39">${escapeHtml(area.label)}</text></g>`;
  }).join('');
  const statsMarkup=areas.map(area=>`<div class="yos-area-map__stat ${area.tone}"><span>${area.rank}</span><b>${area.score}</b></div>`).join('');
  const routePoints=areas.filter(area=>area.key!=='avoid').map(area=>{const point=project(area.latitude,area.longitude);return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;}).join(' ');
  const themeOptions=themes.map(theme=>`<option value="${theme.value}">${theme.label}</option>`).join('');

  const section=document.createElement('section');
  section.className='yos-area-map';
  section.setAttribute('aria-label','営業エリアマップ');
  section.innerHTML=`
    <div class="yos-area-map__head"><div><b>営業エリアマップ</b><small>位置・優先度・移動順を一画面で確認</small></div><button type="button" class="yos-area-map__toggle" aria-expanded="true">地図を閉じる</button></div>
    <div class="yos-area-map__settings"><label class="yos-area-map__theme-label"><span>マップデザイン</span><select class="yos-area-map__theme" aria-label="マップデザイン">${themeOptions}</select></label><span class="yos-area-map__badge">参考スコア</span></div>
    <div class="yos-area-map__stats">${statsMarkup}</div>
    <div class="yos-area-map__canvas">
      <svg viewBox="0 0 360 244" role="img" aria-label="那覇中心部と空港周辺の概略営業マップ">
        <rect class="yos-area-map__sea" width="360" height="244"></rect>
        <path class="yos-area-map__grid" d="M0 48H360M0 96H360M0 144H360M0 192H360M72 0V244M144 0V244M216 0V244M288 0V244"></path>
        <path class="yos-area-map__land" d="M122 0H360V244H56C72 226 83 209 86 190C91 160 79 142 93 117C105 96 119 82 123 58C126 39 119 19 122 0Z"></path>
        <path class="yos-area-map__district" d="M122 62C172 55 222 64 360 53M96 118C168 111 246 122 360 111M87 170C166 160 247 176 360 164M151 0C146 71 160 153 151 244M228 0C220 74 238 152 225 244"></path>
        <path class="yos-area-map__road" d="M75 211C111 186 137 163 164 136C191 109 216 78 253 31"></path><path class="yos-area-map__road" d="M112 92C155 103 199 111 260 112C299 113 323 108 347 99"></path><path class="yos-area-map__road minor" d="M116 145C152 138 190 134 234 135C278 136 317 145 352 160"></path><path class="yos-area-map__road minor" d="M153 39C169 75 175 103 178 138C181 170 175 201 171 234"></path>
        <g class="yos-area-map__radar" aria-hidden="true"><circle cx="180" cy="154" r="38"></circle><circle cx="180" cy="154" r="76"></circle><circle cx="180" cy="154" r="114"></circle><path d="M180 154L326 88A160 160 0 0 1 328 219Z"></path></g>
        <polyline class="yos-area-map__route" points="${routePoints}"></polyline>
        <text x="18" y="22" fill="#4a6574" font-size="9" font-weight="900">東シナ海</text>${zoneMarkup}<g class="yos-area-map__current" aria-hidden="true"><circle r="14"></circle><circle r="6"></circle><text y="-18">現在地</text></g>
      </svg>
    </div>
    <div class="yos-area-map__detail" aria-live="polite"><div><strong><span class="yos-area-map__selected-name">久茂地</span><em class="yos-area-map__selected-score">82</em><small>/100</small></strong><p class="yos-area-map__selected-action">最優先・今すぐ向かう。数値は現時点では参考表示です。</p></div><button type="button">ここへ行く</button></div>
    <div class="yos-area-map__legend"><span><i class="green"></i>最優先</span><span><i class="blue"></i>次候補</span><span><i class="yellow"></i>条件付き</span><span><i class="red"></i>回避</span></div>`;
  hero.insertAdjacentElement('afterend',section);

  const selectedName=section.querySelector('.yos-area-map__selected-name');
  const selectedScore=section.querySelector('.yos-area-map__selected-score');
  const selectedAction=section.querySelector('.yos-area-map__selected-action');
  const goButton=section.querySelector('.yos-area-map__detail button');
  const toggle=section.querySelector('.yos-area-map__toggle');
  const themeSelect=section.querySelector('.yos-area-map__theme');
  const zones=[...section.querySelectorAll('.yos-area-map__zone')];
  let selected=areas[0];

  const applyTheme=value=>{
    const theme=validTheme(value)?value:'stylish';
    themes.forEach(item=>section.classList.remove(`theme-${item.value}`));
    section.classList.add(`theme-${theme}`);
    themeSelect.value=theme;
    section.dataset.theme=theme;
  };
  applyTheme(initialTheme);
  themeSelect.addEventListener('change',event=>{
    const value=validTheme(event.currentTarget.value)?event.currentTarget.value:'stylish';
    applyTheme(value);writeTheme(value);
  });

  const openMaps=destination=>{
    if(!navigator.onLine){alert('通信できません。通信復旧後、停車した状態で案内を開始してください');return;}
    const value=String(destination||'').trim();if(!value)return;
    const url=new URL('https://www.google.com/maps/dir/');
    const source=document.querySelector('.yos-location-status');
    const latitude=source?.dataset.latitude,longitude=source?.dataset.longitude;
    const accuracy=Number(source?.dataset.accuracy||NaN),acquiredAt=Number(source?.dataset.acquiredAt||0);
    if(latitude&&longitude&&acquiredAt>0&&Date.now()-acquiredAt<=5*60*1000&&Number.isFinite(accuracy)&&accuracy<=200)url.searchParams.set('origin',`${latitude},${longitude}`);
    url.searchParams.set('api','1');url.searchParams.set('destination',value);url.searchParams.set('travelmode','driving');url.searchParams.set('dir_action','navigate');location.href=url.toString();
  };
  const selectArea=key=>{
    const area=areas.find(item=>item.key===key);if(!area)return;selected=area;
    zones.forEach(zone=>zone.setAttribute('aria-pressed',String(zone.dataset.key===key)));
    selectedName.textContent=area.label;selectedScore.textContent=String(area.score);
    const isAvoid=area.key==='avoid';
    selectedAction.textContent=isAvoid?`${area.rank}・${area.action}。この場所へのナビは開始しません。`:`${area.rank}・${area.action}。数値は現時点では参考表示です。`;
    goButton.textContent=isAvoid?'回避地点':'ここへ行く';goButton.disabled=isAvoid;
  };
  zones.forEach(zone=>{zone.addEventListener('click',()=>selectArea(zone.dataset.key));zone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectArea(zone.dataset.key);}});});
  goButton.addEventListener('click',()=>{if(selected.key!=='avoid')openMaps(selected.destination);});
  toggle.addEventListener('click',()=>{const collapsed=section.classList.toggle('is-collapsed');toggle.setAttribute('aria-expanded',String(!collapsed));toggle.textContent=collapsed?'地図を開く':'地図を閉じる';});
  selectArea('primary');

  const currentMarker=section.querySelector('.yos-area-map__current');
  const syncCurrentLocation=()=>{
    const source=document.querySelector('.yos-location-status');if(!source)return;
    const latitude=Number(source.dataset.latitude),longitude=Number(source.dataset.longitude);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!inBounds(latitude,longitude)){currentMarker.classList.remove('is-visible');currentMarker.setAttribute('aria-hidden','true');return;}
    const point=project(latitude,longitude);currentMarker.setAttribute('transform',`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);currentMarker.classList.add('is-visible');currentMarker.setAttribute('aria-hidden','false');
  };
  syncCurrentLocation();
  const locationSource=document.querySelector('.yos-location-status');
  if(locationSource)new MutationObserver(syncCurrentLocation).observe(locationSource,{attributes:true,attributeFilter:['data-latitude','data-longitude']});
})();
