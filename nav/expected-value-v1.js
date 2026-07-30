'use strict';
(()=>{
  if(window.__yosExpectedValueV1)return;
  window.__yosExpectedValueV1=true;
  window.__yosExpectedValueActive=true;
  // The former four-zone SVG used fixed reference scores. Disable it when the
  // report-based model is active so the screen never shows conflicting advice.
  window.__yosAreaMapV1=true;

  const STATIC_MODEL=window.__YOS_NAV_EXPECTED_VALUE_MODEL;
  if(!STATIC_MODEL)return;
  let MODEL=STATIC_MODEL;
  const params=new URLSearchParams(location.search);
  const explicitPlan=['primary','next','pass'].some(name=>params.has(name));
  const CRUISE_KEY='yos-nav-cruise-v1';
  const MODEL_API_KEY='yos-nav-model-api-v1';
  const MODEL_CACHE_KEY='yos-nav-live-model-v1';
  const MODEL_CACHE_MAX_AGE=7*24*60*60*1000;
  const MODEL_REFRESH_INTERVAL=15*60*1000;
  const MODEL_FETCH_TIMEOUT=10000;
  let modelSource='内蔵モデル';
  let modelFetchedAt=0;
  let modelFetchPromise=null;
  let lastModelAttempt=0;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const yen=value=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(value||0));
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const readCruise=()=>{
    const requested=params.get('cruise');
    if(requested==='1'||requested==='true')return true;
    if(requested==='0'||requested==='false')return false;
    try{return localStorage.getItem(CRUISE_KEY)==='1'}catch{return false}
  };
  let cruiseActive=readCruise();

  const validHttpsUrl=value=>{
    try{const url=new URL(String(value||''));return url.protocol==='https:'?url.toString():''}catch{return''}
  };
  const apiFromQuery=validHttpsUrl(params.get('modelApi'));
  if(apiFromQuery){try{localStorage.setItem(MODEL_API_KEY,apiFromQuery)}catch{}}
  const storedApi=(()=>{try{return validHttpsUrl(localStorage.getItem(MODEL_API_KEY))}catch{return''}})();
  const injectedApi=validHttpsUrl(window.__YOS_NAV_MODEL_API_URL);
  const inferredApi=location.hostname.endsWith('.vercel.app')?`${location.origin}/api/yos/nav-model`:'';
  const modelApi=apiFromQuery||injectedApi||storedApi||inferredApi;

  const businessDate=now=>{
    const value=new Date(now);
    if(value.getHours()<8)value.setDate(value.getDate()-1);
    return value;
  };
  const dayGroup=now=>{
    const day=businessDate(now).getDay();
    return day>=1&&day<=4?'weekday':'weekend';
  };
  const timeBin=now=>{
    const hour=now.getHours();
    if(hour>=14&&hour<18)return'14-18';
    if(hour>=18&&hour<20)return'18-20';
    if(hour>=20&&hour<22)return'20-22';
    if(hour>=22)return'22-24';
    if(hour<2)return'0-2';
    if(hour<5)return'2-5';
    return'14-18';
  };
  const haversineKm=(aLat,aLon,bLat,bLon)=>{
    const toRad=value=>value*Math.PI/180;
    const dLat=toRad(bLat-aLat),dLon=toRad(bLon-aLon);
    const sinLat=Math.sin(dLat/2),sinLon=Math.sin(dLon/2);
    const a=sinLat*sinLat+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*sinLon*sinLon;
    return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  };
  const distanceAdjustment=distance=>{
    if(!Number.isFinite(distance))return 0;
    if(distance<=3)return 8;
    if(distance<=7)return 4;
    if(distance<=12)return 0;
    if(distance<=20)return-7;
    if(distance<=30)return-14;
    return-22;
  };
  const currentLocation=()=>{
    const source=document.querySelector('.yos-location-status');
    if(!source)return null;
    const latitude=Number(source.dataset.latitude);
    const longitude=Number(source.dataset.longitude);
    const accuracy=Number(source.dataset.accuracy);
    const acquiredAt=Number(source.dataset.acquiredAt);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)||accuracy>200||!acquiredAt||Date.now()-acquiredAt>5*60*1000)return null;
    return{latitude,longitude,accuracy};
  };
  const confidenceText=value=>value>=75?'高':value>=45?'中':'低';
  const actionFor=(score,wait)=>score>=75?`今すぐ向かう・${wait}分検証`:score>=65?`優先・${wait}分検証`:score>=55?`近ければ${wait}分検証`:'通過しながら反応確認';
  const openMaps=destination=>{
    if(!navigator.onLine){alert('通信できません。通信復旧後、停車した状態で案内を開始してください');return;}
    const value=String(destination||'').trim();if(!value)return;
    const url=new URL('https://www.google.com/maps/dir/');
    const origin=currentLocation();
    url.searchParams.set('api','1');
    if(origin)url.searchParams.set('origin',`${origin.latitude},${origin.longitude}`);
    url.searchParams.set('destination',value);
    url.searchParams.set('travelmode','driving');
    url.searchParams.set('dir_action','navigate');
    location.href=url.toString();
  };

  function rank(now=new Date()){
    const group=dayGroup(now),bin=timeBin(now);
    const segment=MODEL.segments[group]?.[bin]||{};
    const location=currentLocation();
    const candidates=[];
    for(const [zone,profile] of Object.entries(MODEL.zoneProfiles)){
      const metric=segment[zone]||{
        score:profile.score,n:0,avgFare:profile.overall?.avg||0,medianFare:profile.overall?.median||0,
        confidence:30,label:profile.label,destination:profile.destination
      };
      let score=Number(metric.score||profile.score||45);
      let fieldRule=false;
      const hour=now.getHours();
      if(zone==='PARCO'&&cruiseActive){
        fieldRule=true;
        score=hour>=14&&hour<21?86:hour>=21&&hour<22?68:48;
      }
      const distance=location?haversineKm(location.latitude,location.longitude,profile.latitude,profile.longitude):null;
      score+=distanceAdjustment(distance);
      if(!fieldRule&&Number(metric.n||0)<3)score-=3;
      score=clamp(Math.round(score),20,95);
      const label=fieldRule?'PARCO CITY':metric.label||profile.label;
      const destination=fieldRule?'サンエー浦添西海岸 PARCO CITY':metric.destination||profile.destination;
      const confidence=fieldRule?55:Number(metric.confidence||30);
      candidates.push({
        zone,label,destination,score,distance,wait:profile.wait,
        n:Number(metric.n||0),avgFare:Number(metric.avgFare||profile.overall?.avg||0),
        medianFare:Number(metric.medianFare||profile.overall?.median||0),
        confidence,fieldRule,group,bin,
        chain:Number(profile.overall?.chain||0)
      });
    }
    return candidates.sort((a,b)=>b.score-a.score||b.confidence-a.confidence||b.n-a.n);
  }

  const style=document.createElement('style');
  style.textContent=`
    .yos-ev{margin:12px 0 0;padding:13px;border:1px solid rgba(66,209,127,.32);border-radius:20px;background:linear-gradient(150deg,rgba(18,50,38,.62),rgba(23,23,25,.98) 58%)}
    .yos-ev__head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.yos-ev__tools{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}
    .yos-ev__head b{display:block;font-size:17px}.yos-ev__head small{display:block;margin-top:3px;color:var(--muted);font-size:10px;line-height:1.45}
    .yos-ev__cruise,.yos-ev__sync{flex:none;min-height:36px;padding:0 10px;border:1px solid var(--line);border-radius:999px;background:#222226;color:var(--text);font-size:10px;font-weight:950}
    .yos-ev__cruise.is-on{border-color:rgba(244,200,77,.62);background:rgba(244,200,77,.14);color:#ffe48c}.yos-ev__sync.is-live{border-color:rgba(66,209,127,.5);background:rgba(66,209,127,.12);color:#9bf0bd}.yos-ev__sync:disabled{opacity:.58}
    .yos-ev__list{display:grid;gap:7px;margin-top:10px}.yos-ev__row{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(4,7,8,.46)}
    .yos-ev__rank{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#25292a;color:var(--muted);font-size:12px;font-weight:950}.yos-ev__row:first-child .yos-ev__rank{background:rgba(66,209,127,.16);color:var(--green)}
    .yos-ev__row b{display:block;font-size:14px}.yos-ev__row small{display:block;margin-top:2px;color:var(--muted);font-size:9px;line-height:1.4}
    .yos-ev__score{font-size:20px;font-weight:950;font-variant-numeric:tabular-nums}.yos-ev__score span{display:block;color:var(--muted);font-size:8px;text-align:right}
    .yos-ev__foot{margin:9px 1px 0;color:var(--muted);font-size:9px;line-height:1.5}
    @media(max-width:390px){.yos-ev__head{display:grid}.yos-ev__tools{justify-content:flex-start}}
  `;
  document.head.appendChild(style);

  const hero=document.querySelector('.hero');
  if(!hero)return;
  if(!explicitPlan)document.querySelector('.yos-area-map')?.remove();
  const section=document.createElement('section');
  section.className='yos-ev';
  section.innerHTML=`
    <div class="yos-ev__head"><div><b>日報自動学習</b><small class="yos-ev__meta"></small></div><div class="yos-ev__tools"><button type="button" class="yos-ev__sync"></button><button type="button" class="yos-ev__cruise"></button></div></div>
    <div class="yos-ev__list" aria-live="polite"></div>
    <div class="yos-ev__foot"></div>
  `;
  hero.insertAdjacentElement('afterend',section);
  const list=section.querySelector('.yos-ev__list');
  const meta=section.querySelector('.yos-ev__meta');
  const foot=section.querySelector('.yos-ev__foot');
  const cruiseButton=section.querySelector('.yos-ev__cruise');
  const syncButton=section.querySelector('.yos-ev__sync');

  function apply(){
    const now=new Date();
    const ranked=rank(now);
    const top=ranked.slice(0,3);
    const location=currentLocation();
    const sourceDate=MODEL.sourcePeriod?.from&&MODEL.sourcePeriod?.to?`${MODEL.sourcePeriod.from.slice(5).replace('-','/')}〜${MODEL.sourcePeriod.to.slice(5).replace('-','/')}`:'期間未確認';
    meta.textContent=`${modelSource}｜確定${MODEL.confirmedClassifiedRides}件｜${sourceDate}｜${dayGroup(now)==='weekday'?'月〜木':'金〜日'} ${timeBin(now)}`;
    cruiseButton.textContent=`クルーズ補正 ${cruiseActive?'ON':'OFF'}`;
    cruiseButton.classList.toggle('is-on',cruiseActive);
    syncButton.textContent=modelFetchPromise?'更新中…':modelApi?(modelSource==='自動学習'?'学習済み':'学習更新'):'未接続';
    syncButton.disabled=Boolean(modelFetchPromise)||!modelApi;
    syncButton.classList.toggle('is-live',modelSource==='自動学習');
    list.innerHTML=top.map((item,index)=>{
      const basis=item.fieldRule
        ?`現場経験補正・統計${MODEL.zoneProfiles.PARCO?.overall?.n||0}件`
        :`日報${item.n||'補完'}件・平均${yen(item.avgFare)}・連鎖${item.chain?item.chain.toFixed(1):'未算出'}%`;
      const distance=Number.isFinite(item.distance)?`・約${item.distance<10?item.distance.toFixed(1):Math.round(item.distance)}km`:'';
      return `<div class="yos-ev__row"><span class="yos-ev__rank">${index+1}</span><div><b>${escapeHtml(item.label)}</b><small>${escapeHtml(basis+distance)}｜信頼度 ${item.fieldRule?'経験':confidenceText(item.confidence)}</small></div><strong class="yos-ev__score">${item.score}<span>/100</span></strong></div>`;
    }).join('');
    const syncStatus=modelSource==='自動学習'&&modelFetchedAt?`Project75を${new Date(modelFetchedAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}に自動学習。`:modelSource==='前回学習'?'通信できないため前回学習モデルを使用。':modelApi?'Project75との接続を確認中。':'自動学習API未接続。内蔵モデルを使用。';
    const rankingNote=explicitPlan
      ?'URLで渡されたYOS指定を優先中。学習モデルは比較情報として表示しています。'
      :location
        ?'現在地までの距離を反映済み。需要45％・単価25％・次の実車への連鎖20％・回転10％で評価。'
        :'現在地未取得のため時間帯と日報実績で評価。停車後に現在地を取得すると距離補正します。';
    foot.textContent=`${syncStatus}${rankingNote}`;

    window.__yosNavRecommendations=top;
    if(!explicitPlan&&top.length>=3){
      const [primary,next,pass]=top;
      document.getElementById('primaryName').textContent=primary.label;
      document.getElementById('primaryAction').textContent=`${primary.score}点｜${actionFor(primary.score,primary.wait)}`;
      document.getElementById('nextName').textContent=next.label;
      document.getElementById('nextAction').textContent=`${next.score}点｜次候補・${next.wait}分検証`;
      document.getElementById('passName').textContent=pass.label;
      document.getElementById('passAction').textContent=`${pass.score}点｜通過しながら反応確認`;
      document.getElementById('avoidName').textContent='空港待機';
      document.getElementById('avoidAction').textContent='許可未取得・待機しない';
      document.getElementById('primaryGo').onclick=()=>openMaps(primary.destination);
      document.querySelector('[data-target="next"]').onclick=()=>openMaps(next.destination);
      document.querySelector('[data-target="pass"]').onclick=()=>openMaps(pass.destination);
      document.querySelector('[data-target="avoid"]').onclick=()=>alert('空港タクシー乗り場は許可未取得のため待機先にしません。');
    }
    window.dispatchEvent(new CustomEvent('yos-nav-recommendation',{detail:{recommendations:top,cruiseActive,modelSource,modelFetchedAt}}));
  }

  const isValidModel=value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    if(!Number.isInteger(value.confirmedClassifiedRides)||value.confirmedClassifiedRides<1)return false;
    if(!value.sourcePeriod||typeof value.sourcePeriod.from!=='string'||typeof value.sourcePeriod.to!=='string')return false;
    if(!value.zoneProfiles||typeof value.zoneProfiles!=='object'||Object.keys(value.zoneProfiles).length<3)return false;
    if(!value.segments||typeof value.segments!=='object'||!value.segments.weekday||!value.segments.weekend)return false;
    return Object.values(value.zoneProfiles).every(profile=>profile&&Number.isFinite(Number(profile.score))&&Number.isFinite(Number(profile.latitude))&&Number.isFinite(Number(profile.longitude))&&typeof profile.destination==='string');
  };
  const useModel=(value,source,fetchedAt)=>{
    if(!isValidModel(value))return false;
    MODEL=value;
    window.__YOS_NAV_EXPECTED_VALUE_MODEL=value;
    modelSource=source;
    modelFetchedAt=Number(fetchedAt)||Date.now();
    apply();
    return true;
  };
  const readCachedModel=()=>{
    try{
      const cached=JSON.parse(localStorage.getItem(MODEL_CACHE_KEY)||'null');
      if(!cached||Date.now()-Number(cached.fetchedAt||0)>MODEL_CACHE_MAX_AGE)return null;
      if(cached.api&&modelApi&&cached.api!==modelApi)return null;
      return isValidModel(cached.model)?cached:null;
    }catch{return null}
  };
  const writeCachedModel=(model,fetchedAt)=>{
    try{localStorage.setItem(MODEL_CACHE_KEY,JSON.stringify({model,fetchedAt,api:modelApi}))}catch{}
  };
  async function refreshModel(force=false){
    if(!modelApi||!navigator.onLine)return false;
    if(modelFetchPromise)return modelFetchPromise;
    lastModelAttempt=Date.now();
    modelFetchPromise=(async()=>{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),MODEL_FETCH_TIMEOUT);
      try{
        const url=new URL(modelApi);
        if(force)url.searchParams.set('refresh','1');
        const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error(`model ${response.status}`);
        const candidate=await response.json();
        if(!isValidModel(candidate))throw new Error('invalid model');
        const fetchedAt=Date.now();
        writeCachedModel(candidate,fetchedAt);
        return useModel(candidate,'自動学習',fetchedAt);
      }catch{
        if(modelSource==='内蔵モデル'){
          const cached=readCachedModel();
          if(cached)useModel(cached.model,'前回学習',cached.fetchedAt);
        }
        return false;
      }finally{
        clearTimeout(timeout);
        modelFetchPromise=null;
        apply();
      }
    })();
    apply();
    return modelFetchPromise;
  }

  cruiseButton.addEventListener('click',()=>{
    cruiseActive=!cruiseActive;
    try{localStorage.setItem(CRUISE_KEY,cruiseActive?'1':'0')}catch{}
    apply();
  });
  syncButton.addEventListener('click',()=>{refreshModel(true)});
  const locationSource=document.querySelector('.yos-location-status');
  if(locationSource)new MutationObserver(apply).observe(locationSource,{attributes:true,attributeFilter:['data-latitude','data-longitude','data-accuracy','data-acquired-at','data-acquiredAt']});
  window.addEventListener('pageshow',()=>{apply();if(Date.now()-lastModelAttempt>5*60*1000)refreshModel()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){apply();if(Date.now()-lastModelAttempt>5*60*1000)refreshModel()}});
  setInterval(apply,60*1000);
  setInterval(()=>refreshModel(),MODEL_REFRESH_INTERVAL);
  const cached=readCachedModel();
  if(cached)useModel(cached.model,'前回学習',cached.fetchedAt);
  else apply();
  refreshModel();
})();
