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
    {
      key:'primary',tone:'green',label:params.get('primaryLabel')||'久茂地',
      destination:params.get('primary')||'那覇市久茂地',
      action:params.get('primaryAction')||'今すぐ向かう',score:numberParam('primaryScore',82),
      latitude:26.215419,longitude:127.682000
    },
    {
      key:'next',tone:'blue',label:params.get('nextLabel')||'松山',
      destination:params.get('next')||'那覇市松山',
      action:params.get('nextAction')||'次の候補・到着後10分待機',score:numberParam('nextScore',71),
      latitude:26.220482,longitude:127.680233
    },
    {
      key:'pass',tone:'yellow',label:params.get('passLabel')||'若狭',
      destination:params.get('pass')||'那覇市若狭',
      action:params.get('passAction')||'流しながら確認',score:numberParam('passScore',55),
      latitude:26.221434,longitude:127.675664
    },
    {
      key:'avoid',tone:'red',label:params.get('avoidLabel')||'空港',
      destination:params.get('avoid')||'那覇空港',
      action:params.get('avoidAction')||'今は行かない',score:numberParam('avoidScore',24),
      latitude:26.189333,longitude:127.637167
    }
  ];

  const bounds={west:127.632,east:127.688,south:26.185,north:26.226};
  const frame={left:24,right:336,top:24,bottom:220};
  const project=(latitude,longitude)=>({
    x:frame.left+((longitude-bounds.west)/(bounds.east-bounds.west))*(frame.right-frame.left),
    y:frame.bottom-((latitude-bounds.south)/(bounds.north-bounds.south))*(frame.bottom-frame.top)
  });
  const inBounds=(latitude,longitude)=>latitude>=bounds.south&&latitude<=bounds.north&&longitude>=bounds.west&&longitude<=bounds.east;
  const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  const style=document.createElement('style');
  style.textContent=`
    .yos-area-map{margin:12px 0 0;padding:13px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(155deg,rgba(111,168,255,.08),rgba(23,23,25,.96) 58%);overflow:hidden}
    .yos-area-map__head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
    .yos-area-map__head b{display:block;font-size:15px}.yos-area-map__head small{display:block;margin-top:3px;color:var(--muted);font-size:9px;line-height:1.4}
    .yos-area-map__badge{flex:none;padding:5px 8px;border:1px solid rgba(244,200,77,.4);border-radius:999px;background:rgba(244,200,77,.1);color:var(--yellow);font-size:9px;font-weight:950}
    .yos-area-map__canvas{position:relative;border:1px solid #303039;border-radius:17px;overflow:hidden;background:#0e1117}
    .yos-area-map svg{display:block;width:100%;height:auto;touch-action:manipulation}
    .yos-area-map__sea{fill:#0b1720}.yos-area-map__land{fill:#15191d;stroke:#30363d;stroke-width:1.2}.yos-area-map__road{fill:none;stroke:#343a42;stroke-width:3;stroke-linecap:round;opacity:.8}.yos-area-map__road.minor{stroke-width:1.3;opacity:.65}
    .yos-area-map__zone{cursor:pointer;outline:none}.yos-area-map__zone .halo{opacity:.2}.yos-area-map__zone .core{stroke-width:2}.yos-area-map__zone text{pointer-events:none;text-anchor:middle;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif}.yos-area-map__zone .score{fill:#fff;font-size:15px;font-weight:950}.yos-area-map__zone .name{fill:#fff;font-size:10px;font-weight:900}.yos-area-map__zone.green .halo,.yos-area-map__zone.green .core{fill:var(--green)}.yos-area-map__zone.green .core{stroke:#9bf0bd}.yos-area-map__zone.blue .halo,.yos-area-map__zone.blue .core{fill:var(--blue)}.yos-area-map__zone.blue .core{stroke:#b8d1ff}.yos-area-map__zone.yellow .halo,.yos-area-map__zone.yellow .core{fill:var(--yellow)}.yos-area-map__zone.yellow .core{stroke:#ffe69a}.yos-area-map__zone.red .halo,.yos-area-map__zone.red .core{fill:var(--red)}.yos-area-map__zone.red .core{stroke:#ffb2b9}.yos-area-map__zone[aria-pressed="true"] .halo{opacity:.34;animation:yos-map-pulse 1.5s ease-in-out infinite}.yos-area-map__zone:focus-visible .core{stroke:#fff;stroke-width:4}
    @keyframes yos-map-pulse{50%{opacity:.12}}
    .yos-area-map__current{display:none;pointer-events:none}.yos-area-map__current.is-visible{display:block}.yos-area-map__current circle:first-child{fill:rgba(255,255,255,.22)}.yos-area-map__current circle:last-child{fill:#fff;stroke:#0e1117;stroke-width:2}.yos-area-map__current text{fill:#fff;font-size:9px;font-weight:950;text-anchor:middle}
    .yos-area-map__detail{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin-top:10px;padding:11px;border:1px solid var(--line);border-radius:15px;background:rgba(14,14,16,.82)}
    .yos-area-map__detail strong{display:flex;align-items:baseline;gap:5px;font-size:16px}.yos-area-map__detail strong em{font-style:normal;color:var(--accent);font-size:27px;line-height:1}.yos-area-map__detail p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.45}.yos-area-map__detail button{min-height:44px;padding:0 13px;border:0;border-radius:13px;background:linear-gradient(145deg,#ffb323,#ff7a00);color:#17100a;font-size:11px;font-weight:950}
    .yos-area-map__legend{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px;color:var(--muted);font-size:9px}.yos-area-map__legend span{display:flex;align-items:center;gap:4px}.yos-area-map__legend i{width:7px;height:7px;border-radius:50%}.yos-area-map__legend .green{background:var(--green)}.yos-area-map__legend .blue{background:var(--blue)}.yos-area-map__legend .yellow{background:var(--yellow)}.yos-area-map__legend .red{background:var(--red)}
    @media (prefers-reduced-motion:reduce){.yos-area-map__zone[aria-pressed="true"] .halo{animation:none}}
  `;
  document.head.appendChild(style);

  const hero=document.querySelector('.hero');
  if(!hero)return;

  const zoneMarkup=areas.map(area=>{
    const point=project(area.latitude,area.longitude);
    return `<g class="yos-area-map__zone ${area.tone}" data-key="${area.key}" role="button" tabindex="0" aria-label="${escapeHtml(area.label)} 期待スコア ${area.score}" aria-pressed="false" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})"><circle class="halo" r="28"></circle><circle class="core" r="20"></circle><text class="score" y="5">${area.score}</text><text class="name" y="36">${escapeHtml(area.label)}</text></g>`;
  }).join('');

  const section=document.createElement('section');
  section.className='yos-area-map';
  section.setAttribute('aria-label','営業エリアマップ');
  section.innerHTML=`
    <div class="yos-area-map__head"><div><b>営業エリアマップ</b><small>色と期待スコアで、候補エリアをひと目で比較</small></div><span class="yos-area-map__badge">試作・参考表示</span></div>
    <div class="yos-area-map__canvas">
      <svg viewBox="0 0 360 244" role="img" aria-label="那覇中心部と空港周辺の概略営業マップ">
        <rect class="yos-area-map__sea" width="360" height="244"></rect>
        <path class="yos-area-map__land" d="M122 0H360V244H56C72 226 83 209 86 190C91 160 79 142 93 117C105 96 119 82 123 58C126 39 119 19 122 0Z"></path>
        <path class="yos-area-map__road" d="M75 211C111 186 137 163 164 136C191 109 216 78 253 31"></path>
        <path class="yos-area-map__road" d="M112 92C155 103 199 111 260 112C299 113 323 108 347 99"></path>
        <path class="yos-area-map__road minor" d="M116 145C152 138 190 134 234 135C278 136 317 145 352 160"></path>
        <path class="yos-area-map__road minor" d="M153 39C169 75 175 103 178 138C181 170 175 201 171 234"></path>
        <text x="20" y="22" fill="#4a6574" font-size="9" font-weight="900">東シナ海</text>
        ${zoneMarkup}
        <g class="yos-area-map__current" aria-hidden="true"><circle r="13"></circle><circle r="6"></circle><text y="-17">現在地</text></g>
      </svg>
    </div>
    <div class="yos-area-map__detail" aria-live="polite"><div><strong><span class="yos-area-map__selected-name">久茂地</span><em class="yos-area-map__selected-score">82</em><small>/100</small></strong><p class="yos-area-map__selected-action">今すぐ向かう。数値は表示確認用の暫定スコアです。</p></div><button type="button">ここへ行く</button></div>
    <div class="yos-area-map__legend"><span><i class="green"></i>最優先</span><span><i class="blue"></i>次候補</span><span><i class="yellow"></i>条件付き</span><span><i class="red"></i>回避</span></div>
  `;
  hero.insertAdjacentElement('afterend',section);

  const selectedName=section.querySelector('.yos-area-map__selected-name');
  const selectedScore=section.querySelector('.yos-area-map__selected-score');
  const selectedAction=section.querySelector('.yos-area-map__selected-action');
  const goButton=section.querySelector('.yos-area-map__detail button');
  const zones=[...section.querySelectorAll('.yos-area-map__zone')];
  let selected=areas[0];

  const openMaps=destination=>{
    const value=String(destination||'').trim();
    if(!value)return;
    const url=new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api','1');
    url.searchParams.set('destination',value);
    url.searchParams.set('travelmode','driving');
    url.searchParams.set('dir_action','navigate');
    location.href=url.toString();
  };
  const selectArea=key=>{
    const area=areas.find(item=>item.key===key);
    if(!area)return;
    selected=area;
    zones.forEach(zone=>zone.setAttribute('aria-pressed',String(zone.dataset.key===key)));
    selectedName.textContent=area.label;
    selectedScore.textContent=String(area.score);
    selectedAction.textContent=`${area.action}。数値は表示確認用の暫定スコアです。`;
    goButton.textContent=area.key==='avoid'?'場所を確認':'ここへ行く';
  };
  zones.forEach(zone=>{
    zone.addEventListener('click',()=>selectArea(zone.dataset.key));
    zone.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();selectArea(zone.dataset.key);}
    });
  });
  goButton.addEventListener('click',()=>openMaps(selected.destination));
  selectArea('primary');

  const currentMarker=section.querySelector('.yos-area-map__current');
  const syncCurrentLocation=()=>{
    const source=document.querySelector('.yos-location-status');
    if(!source)return;
    const latitude=Number(source.dataset.latitude);
    const longitude=Number(source.dataset.longitude);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!inBounds(latitude,longitude)){
      currentMarker.classList.remove('is-visible');
      currentMarker.setAttribute('aria-hidden','true');
      return;
    }
    const point=project(latitude,longitude);
    currentMarker.setAttribute('transform',`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
    currentMarker.classList.add('is-visible');
    currentMarker.setAttribute('aria-hidden','false');
  };
  syncCurrentLocation();
  const locationSource=document.querySelector('.yos-location-status');
  if(locationSource)new MutationObserver(syncCurrentLocation).observe(locationSource,{attributes:true,attributeFilter:['data-latitude','data-longitude']});
})();
