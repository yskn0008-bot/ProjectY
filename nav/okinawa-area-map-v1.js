'use strict';
(()=>{
  if(window.__yosOkinawaAreaMapV1)return;
  window.__yosOkinawaAreaMapV1=true;

  const MAP_ID='yos-okinawa-area-map';
  const THEME_KEY='yos-nav-map-theme-v1';
  const BOUNDS={west:127.58,east:128.35,south:26.08,north:26.90};
  const FRAME={left:34,right:326,top:18,bottom:424};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const project=(latitude,longitude)=>({
    x:FRAME.left+((longitude-BOUNDS.west)/(BOUNDS.east-BOUNDS.west))*(FRAME.right-FRAME.left),
    y:FRAME.bottom-((latitude-BOUNDS.south)/(BOUNDS.north-BOUNDS.south))*(FRAME.bottom-FRAME.top)
  });
  const scoreTone=score=>score>=70?'high':score>=55?'mid':'low';
  const currentTheme=()=>{try{return localStorage.getItem(THEME_KEY)||'dark'}catch{return'dark'}};
  const currentLocation=()=>{
    const source=document.querySelector('.yos-location-status');
    if(!source)return null;
    const latitude=Number(source.dataset.latitude);
    const longitude=Number(source.dataset.longitude);
    const accuracy=Number(source.dataset.accuracy);
    const acquiredAt=Number(source.dataset.acquiredAt||source.dataset.acquiredAt);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)||accuracy>300)return null;
    if(acquiredAt&&Date.now()-acquiredAt>10*60*1000)return null;
    return{latitude,longitude};
  };
  const openMaps=destination=>{
    if(!navigator.onLine){alert('通信できません。通信復旧後、停車した状態で案内を開始してください');return;}
    const value=String(destination||'').trim();
    if(!value)return;
    const url=new URL('https://www.google.com/maps/dir/');
    const origin=currentLocation();
    url.searchParams.set('api','1');
    if(origin)url.searchParams.set('origin',`${origin.latitude},${origin.longitude}`);
    url.searchParams.set('destination',value);
    url.searchParams.set('travelmode','driving');
    url.searchParams.set('dir_action','navigate');
    location.href=url.toString();
  };

  const style=document.createElement('style');
  style.textContent=`
    .yos-okinawa-map{margin:12px 0 0;padding:13px;border:1px solid var(--yos-theme-border,rgba(86,153,214,.42));border-radius:22px;background:var(--yos-theme-panel,linear-gradient(160deg,#0d1823,#070b10 58%,#121418));color:var(--yos-theme-copy,var(--text));box-shadow:var(--yos-theme-shadow,0 14px 34px rgba(0,0,0,.16));overflow:hidden}
    .yos-okinawa-map__head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.yos-okinawa-map__head b{display:block;font-size:17px}.yos-okinawa-map__head small{display:block;margin-top:3px;color:var(--yos-theme-muted,var(--muted));font-size:10px;line-height:1.45}.yos-okinawa-map__badge{flex:none;padding:5px 8px;border:1px solid rgba(66,209,127,.45);border-radius:999px;background:rgba(66,209,127,.12);color:#9bf0bd;font-size:9px;font-weight:950}
    .yos-okinawa-map__canvas{position:relative;margin-top:10px;border:1px solid var(--yos-theme-row-border,rgba(255,255,255,.09));border-radius:18px;overflow:hidden;background:radial-gradient(circle at 55% 35%,rgba(34,92,119,.22),transparent 42%),#06121b}.yos-okinawa-map svg{display:block;width:100%;height:auto}.yos-okinawa-map__sea{fill:#071923}.yos-okinawa-map__grid{stroke:#163442;stroke-width:.6;opacity:.55}.yos-okinawa-map__island{fill:#18262c;stroke:#6d8d98;stroke-width:1.6;filter:drop-shadow(0 0 8px rgba(76,157,188,.22))}.yos-okinawa-map__road{fill:none;stroke:#51656c;stroke-width:1.5;stroke-dasharray:5 5;opacity:.8}.yos-okinawa-map__route{fill:none;stroke:#ff7b61;stroke-width:2.6;stroke-linecap:round;stroke-dasharray:8 6;opacity:.92}.yos-okinawa-map__marker{cursor:pointer;outline:none}.yos-okinawa-map__marker .halo{opacity:.2}.yos-okinawa-map__marker .core{stroke:#fff;stroke-width:2;filter:drop-shadow(0 0 7px currentColor)}.yos-okinawa-map__marker.high{color:#42d17f}.yos-okinawa-map__marker.mid{color:#f4c84d}.yos-okinawa-map__marker.low{color:#ff6d78}.yos-okinawa-map__marker .halo,.yos-okinawa-map__marker .core{fill:currentColor}.yos-okinawa-map__marker text{pointer-events:none;text-anchor:middle;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic',sans-serif}.yos-okinawa-map__marker .score{fill:#fff;font-size:13px;font-weight:950}.yos-okinawa-map__marker .name{fill:#fff;font-size:9px;font-weight:900;paint-order:stroke;stroke:#07131d;stroke-width:3px}.yos-okinawa-map__marker.is-active .halo{opacity:.42;animation:yos-okinawa-pulse 1.5s ease-in-out infinite}.yos-okinawa-map__current{display:none;pointer-events:none}.yos-okinawa-map__current.is-visible{display:block}.yos-okinawa-map__current .pulse{fill:rgba(36,139,255,.25);animation:yos-okinawa-current 1.8s ease-out infinite}.yos-okinawa-map__current .dot{fill:#fff;stroke:#248bff;stroke-width:3}.yos-okinawa-map__current text{fill:#fff;font-size:9px;font-weight:950;text-anchor:middle;paint-order:stroke;stroke:#07131d;stroke-width:3px}
    .yos-okinawa-map__detail{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin-top:10px;padding:11px;border:1px solid var(--yos-theme-row-border,rgba(255,255,255,.09));border-radius:15px;background:var(--yos-theme-row,rgba(8,14,21,.78))}.yos-okinawa-map__detail strong{display:flex;align-items:baseline;gap:7px;font-size:17px}.yos-okinawa-map__detail strong em{font-style:normal;color:#42d17f;font-size:29px;line-height:1}.yos-okinawa-map__detail p{margin:4px 0 0;color:var(--yos-theme-muted,var(--muted));font-size:10px;line-height:1.5}.yos-okinawa-map__detail button{min-height:44px;padding:0 14px;border:0;border-radius:13px;background:linear-gradient(145deg,#ffb323,#ff7a00);color:#17100a;font-size:12px;font-weight:950}.yos-okinawa-map__legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:9px;color:var(--yos-theme-muted,var(--muted));font-size:9px}.yos-okinawa-map__legend span{display:flex;align-items:center;gap:5px}.yos-okinawa-map__legend i{width:8px;height:8px;border-radius:50%}.yos-okinawa-map__legend .high{background:#42d17f}.yos-okinawa-map__legend .mid{background:#f4c84d}.yos-okinawa-map__legend .low{background:#ff6d78}
    .yos-okinawa-map[data-theme='neon'] .yos-okinawa-map__route{stroke:#25e1ff;filter:drop-shadow(0 0 6px #25e1ff)}.yos-okinawa-map[data-theme='neon'] .yos-okinawa-map__canvas{background:radial-gradient(circle at 55% 35%,rgba(37,225,255,.15),transparent 43%),#020617}.yos-okinawa-map[data-theme='light'] .yos-okinawa-map__canvas{background:#dcecf5}.yos-okinawa-map[data-theme='light'] .yos-okinawa-map__sea{fill:#dcecf5}.yos-okinawa-map[data-theme='light'] .yos-okinawa-map__island{fill:#f8fbfd;stroke:#7e98a8}.yos-okinawa-map[data-theme='light'] .yos-okinawa-map__grid{stroke:#adc2cf}.yos-okinawa-map[data-theme='light'] .yos-okinawa-map__road{stroke:#8ea1ac}.yos-okinawa-map[data-theme='light'] .yos-okinawa-map__marker .name,.yos-okinawa-map[data-theme='light'] .yos-okinawa-map__current text{fill:#17212b;stroke:#eef4f8}
    @keyframes yos-okinawa-pulse{50%{opacity:.08}}@keyframes yos-okinawa-current{to{r:22;opacity:0}}@media(max-width:390px){.yos-okinawa-map__detail{grid-template-columns:1fr}.yos-okinawa-map__detail button{width:100%}}@media(prefers-reduced-motion:reduce){.yos-okinawa-map__marker.is-active .halo,.yos-okinawa-map__current .pulse{animation:none}}
  `;
  document.head.appendChild(style);

  const recommendations=()=>Array.isArray(window.__yosNavRecommendations)?window.__yosNavRecommendations:[];
  const modelProfile=item=>window.__YOS_NAV_EXPECTED_VALUE_MODEL?.zoneProfiles?.[item.zone]||{};
  const build=()=>{
    const items=recommendations();
    if(!items.length)return false;
    let section=document.getElementById(MAP_ID);
    if(!section){
      section=document.createElement('section');
      section.id=MAP_ID;
      section.className='yos-okinawa-map';
      section.setAttribute('aria-label','沖縄本島営業エリアマップ');
      const anchor=document.querySelector('.yos-ev');
      if(!anchor)return false;
      anchor.insertAdjacentElement('afterend',section);
    }
    section.dataset.theme=currentTheme();
    const top=items.slice(0,6).map((item,index)=>{
      const profile=modelProfile(item);
      return{...item,latitude:Number(profile.latitude),longitude:Number(profile.longitude),index};
    }).filter(item=>Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));
    if(!top.length)return false;
    const route=top.slice(0,3).map(item=>{const p=project(item.latitude,item.longitude);return`${p.x.toFixed(1)},${p.y.toFixed(1)}`}).join(' ');
    const markers=top.map(item=>{
      const p=project(item.latitude,item.longitude);
      const tone=scoreTone(item.score);
      return`<g class="yos-okinawa-map__marker ${tone}${item.index===0?' is-active':''}" data-index="${item.index}" role="button" tabindex="0" aria-label="${escapeHtml(item.label)} 期待値${item.score}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><circle class="halo" r="25"></circle><circle class="core" r="17"></circle><text class="score" y="4">${item.score}</text><text class="name" y="31">${escapeHtml(item.label)}</text></g>`;
    }).join('');
    const current=currentLocation();
    const currentPoint=current?project(current.latitude,current.longitude):null;
    const currentTransform=currentPoint?`translate(${currentPoint.x.toFixed(1)} ${currentPoint.y.toFixed(1)})`:'';
    const primary=top[0];
    section.innerHTML=`
      <div class="yos-okinawa-map__head"><div><b>沖縄本島エリアマップ</b><small>日報期待値と現在地から営業候補を可視化</small></div><span class="yos-okinawa-map__badge">LIVE期待値</span></div>
      <div class="yos-okinawa-map__canvas"><svg viewBox="0 0 360 450" role="img" aria-label="沖縄本島の営業候補エリア">
        <rect class="yos-okinawa-map__sea" width="360" height="450"></rect>
        <path class="yos-okinawa-map__grid" d="M0 75H360M0 150H360M0 225H360M0 300H360M0 375H360M72 0V450M144 0V450M216 0V450M288 0V450"></path>
        <path class="yos-okinawa-map__island" d="M287 20C303 31 306 52 295 69C283 86 278 100 281 119C285 139 273 151 260 164C247 177 240 194 235 213C230 232 215 244 201 257C186 271 184 289 178 307C172 327 157 340 143 353C127 368 118 386 104 404C95 416 83 428 67 424C52 420 49 405 58 392C69 375 80 360 89 342C99 323 109 306 123 291C139 274 148 257 154 236C160 215 173 199 188 184C203 169 210 150 215 130C220 110 233 95 246 80C258 66 262 48 272 31C277 23 282 18 287 20Z"></path>
        <path class="yos-okinawa-map__road" d="M73 413C107 367 132 329 158 286C181 248 194 211 219 174C241 141 255 101 285 48"></path>
        <polyline class="yos-okinawa-map__route" points="${route}"></polyline>
        ${markers}
        <g class="yos-okinawa-map__current${currentPoint?' is-visible':''}" transform="${currentTransform}" aria-hidden="true"><circle class="pulse" r="9"></circle><circle class="dot" r="6"></circle><text y="-14">現在地</text></g>
      </svg></div>
      <div class="yos-okinawa-map__detail"><div><strong><span>${escapeHtml(primary.label)}</span><em>${primary.score}</em><small>/100</small></strong><p>${escapeHtml(primary.distance?`現在地から約${primary.distance<10?primary.distance.toFixed(1):Math.round(primary.distance)}km。`:'')}${escapeHtml(primary.destination)}へ向かう候補。</p></div><button type="button">ここへ行く</button></div>
      <div class="yos-okinawa-map__legend"><span><i class="high"></i>70以上</span><span><i class="mid"></i>55〜69</span><span><i class="low"></i>54以下</span><span>※道路案内図ではなく営業判断用</span></div>`;
    let selected=0;
    const renderDetail=index=>{
      const item=top[index]||top[0];selected=index;
      section.querySelectorAll('.yos-okinawa-map__marker').forEach(marker=>marker.classList.toggle('is-active',Number(marker.dataset.index)===index));
      const strong=section.querySelector('.yos-okinawa-map__detail strong');
      const p=section.querySelector('.yos-okinawa-map__detail p');
      strong.innerHTML=`<span>${escapeHtml(item.label)}</span><em>${item.score}</em><small>/100</small>`;
      p.textContent=`${Number.isFinite(item.distance)?`現在地から約${item.distance<10?item.distance.toFixed(1):Math.round(item.distance)}km。`:''}${item.destination}へ向かう候補。`;
    };
    section.querySelectorAll('.yos-okinawa-map__marker').forEach(marker=>{
      const activate=()=>renderDetail(Number(marker.dataset.index));
      marker.addEventListener('click',activate);
      marker.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});
    });
    section.querySelector('button').addEventListener('click',()=>openMaps((top[selected]||top[0]).destination));
    return true;
  };

  build();
  window.addEventListener('yos-nav-recommendation',build);
  window.addEventListener('pageshow',build);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)build()});
  const source=document.querySelector('.yos-location-status');
  if(source)new MutationObserver(build).observe(source,{attributes:true,attributeFilter:['data-latitude','data-longitude','data-accuracy','data-acquired-at','data-acquiredAt']});
})();
