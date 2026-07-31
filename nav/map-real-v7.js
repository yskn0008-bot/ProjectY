'use strict';
(()=>{
  if(window.__yosRealMapV7)return;
  window.__yosRealMapV7=true;

  const LEAFLET_CSS='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_JS='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
  const TILE_URL='https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number=value=>Number.isFinite(Number(value))?Number(value):null;
  const yen=value=>number(value)===null?'—':new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(value));
  const tone=score=>score>=80?'critical':score>=60?'watch':score>=40?'good':'low';
  const current=()=>{
    const el=document.querySelector('.yos-location-status');
    const latitude=Number(el?.dataset.latitude);
    const longitude=Number(el?.dataset.longitude);
    const accuracy=Number(el?.dataset.accuracy);
    const acquiredAt=Number(el?.dataset.acquiredAt);
    return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Number.isFinite(accuracy)&&accuracy<=200&&acquiredAt>0&&Date.now()-acquiredAt<=5*60*1000?{latitude,longitude,accuracy}:null;
  };
  const metricFor=item=>{
    const model=window.__YOS_NAV_EXPECTED_VALUE_MODEL;
    return model?.segments?.[item?.group]?.[item?.bin]?.[item?.zone]||model?.zoneProfiles?.[item?.zone]?.overall||{};
  };
  const openMaps=destination=>{
    if(!navigator.onLine){alert('通信できません。通信復旧後、停車した状態で案内を開始してください');return;}
    const value=String(destination||'').trim();
    if(!value)return;
    const url=new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api','1');
    const here=current();
    if(here)url.searchParams.set('origin',`${here.latitude},${here.longitude}`);
    url.searchParams.set('destination',value);
    url.searchParams.set('travelmode','driving');
    url.searchParams.set('dir_action','navigate');
    location.href=url.toString();
  };

  const style=document.createElement('style');
  style.id='yos-real-map-v7-style';
  style.textContent=`
  body.yos-real-map-v7{background:#020912;color:#f5fbff}
  body.yos-real-map-v7 .app{max-width:760px;padding:calc(env(safe-area-inset-top) + 10px) 10px calc(env(safe-area-inset-bottom) + 110px)}
  body.yos-real-map-v7 h1{display:flex;align-items:center;gap:10px;font-size:27px}
  body.yos-real-map-v7 h1::first-letter{color:#5cc9ff}
  body.yos-real-map-v7 .sub{margin-left:0;color:#94a8b6}
  body.yos-real-map-v7 .app-links{grid-template-columns:repeat(2,1fr);margin-bottom:8px}
  body.yos-real-map-v7 .app-links a{border-radius:12px;background:#07121e;border-color:#183149;color:#cfe7f5}
  body.yos-real-map-v7 #yos-okinawa-area-map{margin:8px 0 12px;padding:0;border:1px solid #173a56;border-radius:24px;background:#040b13;box-shadow:0 22px 70px rgba(0,0,0,.48);overflow:hidden}
  body.yos-real-map-v7 #yos-okinawa-area-map .yos-okinawa-map__head{padding:14px 14px 10px;border-bottom:1px solid #13283a;background:linear-gradient(180deg,#081522,#050b12)}
  body.yos-real-map-v7 #yos-okinawa-area-map .yos-okinawa-map__head b{font-size:20px}
  body.yos-real-map-v7 #yos-okinawa-area-map .yos-okinawa-map__head small{font-size:11px;color:#8fa8b7}
  body.yos-real-map-v7 #yos-okinawa-area-map .yos-okinawa-map__badge{border-color:rgba(72,255,151,.4);background:rgba(30,146,82,.18);color:#83ffb5}
  .yos-real-map-v7__tabs{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #173047;background:#06101a}
  .yos-real-map-v7__tab{min-height:46px;border:0;border-bottom:3px solid transparent;background:transparent;color:#9eb1bf;font-weight:850}
  .yos-real-map-v7__tab.is-active{color:#4cbcff;border-bottom-color:#2c9eff}
  .yos-real-map-v7__map-wrap{position:relative;height:540px;background:#06121b}
  .yos-real-map-v7__map{position:absolute;inset:0;z-index:1}
  .yos-real-map-v7__loading{position:absolute;inset:0;z-index:3;display:grid;place-items:center;padding:24px;background:linear-gradient(180deg,#06121b,#030810);color:#a9c2d1;text-align:center}
  .yos-real-map-v7__loading.is-hidden{display:none}
  .yos-real-map-v7__legend{position:absolute;left:12px;top:12px;z-index:500;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(3,9,15,.82);backdrop-filter:blur(10px);font-size:11px;line-height:1.8}
  .yos-real-map-v7__legend i{display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:50%}
  .yos-real-map-v7__legend .critical{background:#ff4054}.yos-real-map-v7__legend .watch{background:#f4b400}.yos-real-map-v7__legend .good{background:#58d13b}.yos-real-map-v7__legend .low{background:#8a939e}
  .yos-real-map-v7__marker{display:grid;place-items:center;min-width:58px;padding:6px 9px;border:1px solid currentColor;border-radius:12px;background:rgba(3,9,15,.9);color:#fff;box-shadow:0 0 18px currentColor;font-weight:900;transform:translate(-50%,-100%)}
  .yos-real-map-v7__marker span{font-size:10px;white-space:nowrap}.yos-real-map-v7__marker b{font-size:20px;line-height:1.05}
  .yos-real-map-v7__marker.critical{color:#ff4054;background:rgba(75,5,14,.92)}.yos-real-map-v7__marker.watch{color:#f4b400;background:rgba(60,40,2,.9)}.yos-real-map-v7__marker.good{color:#58d13b;background:rgba(8,52,14,.9)}.yos-real-map-v7__marker.low{color:#a0a7b0}
  .yos-real-map-v7__current{width:18px;height:18px;border:3px solid #fff;border-radius:50%;background:#1e8cff;box-shadow:0 0 0 8px rgba(30,140,255,.2),0 0 24px #1e8cff}
  .yos-real-map-v7__summary{margin:12px;padding:14px;border:1px solid rgba(255,62,82,.72);border-radius:18px;background:linear-gradient(135deg,#17101a,#080d14);box-shadow:0 0 28px rgba(255,62,82,.12)}
  .yos-real-map-v7__summary-grid{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:14px;align-items:center}
  .yos-real-map-v7__score{display:grid;place-items:center;min-height:108px;border-right:1px solid #24303a;color:#ff4d61}
  .yos-real-map-v7__score small{font-size:10px}.yos-real-map-v7__score strong{font-size:46px;line-height:1}
  .yos-real-map-v7__summary h2{margin:0 0 10px;font-size:24px}.yos-real-map-v7__metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.yos-real-map-v7__metric small{display:block;color:#91a6b5;font-size:10px}.yos-real-map-v7__metric b{display:block;margin-top:4px;font-size:21px;color:#ff5265}
  .yos-real-map-v7__go{min-height:52px;padding:0 18px;border:1px solid #ff5a6b;border-radius:13px;background:linear-gradient(145deg,#a61124,#650813);color:#fff;font-weight:950}
  .yos-real-map-v7__ranking{margin:12px;padding:14px;border:1px solid #14283a;border-radius:18px;background:#07111b}.yos-real-map-v7__ranking h3{margin:0 0 10px;font-size:16px}
  .yos-real-map-v7__rank-list{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.yos-real-map-v7__rank{padding:10px 6px;border:1px solid #233547;border-radius:12px;background:#09141f;text-align:center}.yos-real-map-v7__rank small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a7bac6;font-size:10px}.yos-real-map-v7__rank b{display:block;margin-top:5px;font-size:21px}
  body.yos-real-map-v7 .hero,body.yos-real-map-v7 .grid{display:none}
  .leaflet-container{background:#06121b;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic',sans-serif}.leaflet-control-attribution{background:rgba(2,8,13,.72)!important;color:#9ab0bd!important}.leaflet-control-attribution a{color:#8fd4ff!important}
  @media(max-width:520px){.yos-real-map-v7__map-wrap{height:480px}.yos-real-map-v7__summary-grid{grid-template-columns:88px 1fr}.yos-real-map-v7__go{grid-column:1/-1;width:100%}.yos-real-map-v7__metrics{grid-template-columns:1fr 1fr}.yos-real-map-v7__metric:last-child{grid-column:1/-1}.yos-real-map-v7__rank-list{grid-template-columns:repeat(3,1fr)}.yos-real-map-v7__score{min-height:96px}.yos-real-map-v7__score strong{font-size:40px}}
  @media(max-width:390px){.yos-real-map-v7__map-wrap{height:430px}.yos-real-map-v7__legend{font-size:10px}.yos-real-map-v7__summary{margin:9px;padding:11px}.yos-real-map-v7__summary h2{font-size:21px}.yos-real-map-v7__metric b{font-size:18px}}
  `;
  document.head.appendChild(style);

  const loadLeaflet=()=>new Promise((resolve,reject)=>{
    if(window.L){resolve(window.L);return;}
    if(!document.querySelector(`link[href="${LEAFLET_CSS}"]`)){
      const link=document.createElement('link');link.rel='stylesheet';link.href=LEAFLET_CSS;document.head.appendChild(link);
    }
    const existing=document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if(existing){existing.addEventListener('load',()=>resolve(window.L),{once:true});existing.addEventListener('error',reject,{once:true});return;}
    const script=document.createElement('script');script.src=LEAFLET_JS;script.defer=true;script.onload=()=>resolve(window.L);script.onerror=reject;document.head.appendChild(script);
  });

  let map=null;
  let signature='';
  const render=async()=>{
    const section=document.getElementById('yos-okinawa-area-map');
    const recommendations=Array.isArray(window.__yosNavRecommendations)?window.__yosNavRecommendations:[];
    const model=window.__YOS_NAV_EXPECTED_VALUE_MODEL;
    if(!section||!recommendations.length||!model)return false;
    document.body.classList.add('yos-real-map-v7');
    const items=recommendations.slice(0,8).map((item,index)=>{
      const profile=model.zoneProfiles?.[item.zone]||{};
      return{...item,index,latitude:Number(profile.latitude),longitude:Number(profile.longitude),metric:metricFor(item)};
    }).filter(item=>Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));
    if(!items.length)return false;
    const nextSignature=JSON.stringify(items.map(item=>[item.zone,item.score,item.latitude,item.longitude]));
    if(signature===nextSignature&&map)return true;
    signature=nextSignature;
    section.querySelector('.yos-okinawa-map__head b').textContent='YOSナビ エリアマップ';
    section.querySelector('.yos-okinawa-map__head small').textContent='実地図・期待値・現在地を一画面で確認';
    section.querySelector('.yos-okinawa-map__badge').textContent='LIVE';
    section.innerHTML=`
      <div class="yos-okinawa-map__head"><div><b>YOSナビ エリアマップ</b><small>実地図・期待値・現在地を一画面で確認</small></div><span class="yos-okinawa-map__badge">LIVE</span></div>
      <div class="yos-real-map-v7__tabs"><button class="yos-real-map-v7__tab is-active" type="button">エリアマップ</button><button class="yos-real-map-v7__tab" type="button">期待値ランキング</button><button class="yos-real-map-v7__tab" type="button">営業履歴</button></div>
      <div class="yos-real-map-v7__map-wrap"><div class="yos-real-map-v7__map" id="yos-real-map-v7"></div><div class="yos-real-map-v7__loading">実地図を読み込み中…<br><small>地図が取得できない場合もYOSの営業判断は継続します。</small></div><div class="yos-real-map-v7__legend"><div><i class="critical"></i>80以上</div><div><i class="watch"></i>60–79</div><div><i class="good"></i>40–59</div><div><i class="low"></i>40未満</div></div></div>
      <div class="yos-real-map-v7__summary"></div>
      <div class="yos-real-map-v7__ranking"><h3>上位エリア（期待値スコア順）</h3><div class="yos-real-map-v7__rank-list"></div></div>`;
    const loading=section.querySelector('.yos-real-map-v7__loading');
    const summary=section.querySelector('.yos-real-map-v7__summary');
    const ranking=section.querySelector('.yos-real-map-v7__rank-list');
    ranking.innerHTML=items.slice(0,5).map((item,index)=>`<button type="button" class="yos-real-map-v7__rank" data-index="${index}"><small>${index+1}・${esc(item.label)}</small><b>${Math.round(Number(item.score)||0)}</b></button>`).join('');
    const paintSummary=index=>{
      const item=items[index]||items[0];
      const metric=item.metric||{};
      const idle=number(metric.predictedIdleMinutes)??number(metric.predictedCycleMinutes);
      const trips=number(metric.tripsPerHour);
      const hourly=number(metric.expectedHourlyRevenue);
      summary.innerHTML=`<div class="yos-real-map-v7__summary-grid"><div class="yos-real-map-v7__score"><small>期待値スコア</small><strong>${Math.round(Number(item.score)||0)}</strong></div><div><small style="color:#ff7080;font-weight:900">最優先エリア</small><h2>${esc(item.label)}</h2><div class="yos-real-map-v7__metrics"><div class="yos-real-map-v7__metric"><small>期待時給（推定）</small><b>${yen(hourly)}</b></div><div class="yos-real-map-v7__metric"><small>予測空車時間</small><b>${idle===null?'—':`${idle}分`}</b></div><div class="yos-real-map-v7__metric"><small>予測回転数</small><b>${trips===null?'—':`${trips.toFixed(1)}件/h`}</b></div></div></div><button type="button" class="yos-real-map-v7__go">ここへ向かう</button></div>`;
      summary.querySelector('button').onclick=()=>openMaps(item.destination);
    };
    paintSummary(0);
    ranking.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>paintSummary(Number(button.dataset.index))));
    try{
      const L=await loadLeaflet();
      if(!document.getElementById('yos-real-map-v7'))return false;
      if(map){map.remove();map=null;}
      map=L.map('yos-real-map-v7',{zoomControl:true,attributionControl:true,preferCanvas:true,minZoom:8,maxZoom:15});
      L.tileLayer(TILE_URL,{subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(map);
      const bounds=[];
      items.forEach((item,index)=>{
        const css=tone(Number(item.score)||0);
        const icon=L.divIcon({className:'',html:`<div class="yos-real-map-v7__marker ${css}"><span>${esc(item.label)}</span><b>${Math.round(Number(item.score)||0)}</b></div>`,iconSize:[1,1],iconAnchor:[0,0]});
        const marker=L.marker([item.latitude,item.longitude],{icon,title:item.label,keyboard:true}).addTo(map);
        marker.on('click',()=>paintSummary(index));
        bounds.push([item.latitude,item.longitude]);
      });
      const here=current();
      if(here){
        const icon=L.divIcon({className:'',html:'<div class="yos-real-map-v7__current" aria-label="現在地"></div>',iconSize:[18,18],iconAnchor:[9,9]});
        L.marker([here.latitude,here.longitude],{icon,interactive:false}).addTo(map);bounds.push([here.latitude,here.longitude]);
      }
      if(bounds.length>1)map.fitBounds(bounds,{padding:[34,34],maxZoom:11});else map.setView(bounds[0]||[26.45,127.95],10);
      loading.classList.add('is-hidden');
      setTimeout(()=>map.invalidateSize(),100);
    }catch(error){
      loading.innerHTML='実地図を読み込めませんでした。<br><small>通信復旧後に再読み込みしてください。YOSの営業判断機能は継続します。</small>';
    }
    return true;
  };
  const schedule=()=>setTimeout(render,0);
  render();
  window.addEventListener('yos-nav-recommendation',schedule);
  window.addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){schedule();setTimeout(()=>map?.invalidateSize(),120)}});
})();
