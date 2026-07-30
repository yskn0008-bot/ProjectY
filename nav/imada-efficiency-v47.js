'use strict';
(()=>{
  if(window.__yosImadaEfficiencyV47)return;
  window.__yosImadaEfficiencyV47=true;
  const params=new URLSearchParams(location.search);
  const explicitPlan=['primary','next','pass'].some(name=>params.has(name));
  const yen=value=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(value||0));
  const number=value=>Number.isFinite(Number(value))?Number(value):null;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  const currentModel=()=>window.__YOS_NAV_EXPECTED_VALUE_MODEL||null;
  const metricFor=item=>{
    const model=currentModel();
    if(!model||!item)return{};
    return model.segments?.[item.group]?.[item.bin]?.[item.zone]||model.zoneProfiles?.[item.zone]?.overall||{};
  };
  const waitFor=metric=>{
    const actual=number(metric.predictedIdleMinutes);
    const cycle=number(metric.predictedCycleMinutes);
    const actualSamples=number(metric.actualIdleSamples)||0;
    return actualSamples>=3&&actual!==null?actual:cycle;
  };
  const efficiencyText=(item,metric)=>{
    if(item.fieldRule)return`現場経験補正・統計${currentModel()?.zoneProfiles?.PARCO?.overall?.n||0}件`;
    const actual=number(metric.predictedIdleMinutes);
    const cycle=number(metric.predictedCycleMinutes);
    const turns=number(metric.tripsPerHour);
    const hourly=number(metric.expectedHourlyRevenue);
    const actualSamples=number(metric.actualIdleSamples)||0;
    const sameZoneSamples=number(metric.sameZoneSamples)||0;
    let idle='空車時間 未測定';
    if(actualSamples>=3&&actual!==null)idle=`空車 ${actual}分（実測${actualSamples}件）`;
    else if(actualSamples>0&&actual!==null&&cycle!==null)idle=`空車実測 ${actual}分/${actualSamples}件・判断は乗車間隔 ${cycle}分`;
    else if(cycle!==null)idle=`乗車間隔 ${cycle}分（推定${sameZoneSamples}件）`;
    const turnsText=turns===null?'回転 未算出':`回転 ${turns.toFixed(2)}件/時`;
    const hourlyText=hourly===null?'期待時給 未算出':`期待時給 ${yen(hourly)}`;
    return`${idle}・${turnsText}・${hourlyText}`;
  };
  const actionText=(item,metric,rank)=>{
    if(item.fieldRule)return rank===0?'帰船需要を確認して優先':'クルーズ需要の反応確認';
    const wait=waitFor(metric);
    if(wait===null)return rank===0?`${item.score}点｜10分検証`:`${item.score}点｜次候補`;
    if(wait<=10)return`予測${wait}分｜今すぐ向かう`;
    if(wait<=15)return`予測${wait}分｜15分上限で優先`;
    return`予測${wait}分｜流して反応確認`;
  };
  const openMaps=destination=>{
    if(!navigator.onLine){alert('通信できません。通信復旧後、停車した状態で案内を開始してください');return;}
    const value=String(destination||'').trim();if(!value)return;
    const url=new URL('https://www.google.com/maps/dir/');
    const status=document.querySelector('.yos-location-status');
    const latitude=Number(status?.dataset.latitude);
    const longitude=Number(status?.dataset.longitude);
    const accuracy=Number(status?.dataset.accuracy);
    const acquiredAt=Number(status?.dataset.acquiredAt);
    url.searchParams.set('api','1');
    if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&Number.isFinite(accuracy)&&accuracy<=200&&acquiredAt&&Date.now()-acquiredAt<=5*60*1000){
      url.searchParams.set('origin',`${latitude},${longitude}`);
    }
    url.searchParams.set('destination',value);
    url.searchParams.set('travelmode','driving');
    url.searchParams.set('dir_action','navigate');
    location.href=url.toString();
  };

  function render(recommendations=window.__yosNavRecommendations){
    if(!Array.isArray(recommendations)||recommendations.length<1)return;
    const section=document.querySelector('.yos-ev');
    const list=section?.querySelector('.yos-ev__list');
    const foot=section?.querySelector('.yos-ev__foot');
    const title=section?.querySelector('.yos-ev__head b');
    if(!section||!list||!foot||!title)return;
    title.textContent='IMada自動学習';
    const top=recommendations.slice(0,3);
    list.innerHTML=top.map((item,index)=>{
      const metric=metricFor(item);
      const distance=Number.isFinite(item.distance)?`・約${item.distance<10?item.distance.toFixed(1):Math.round(item.distance)}km`:'';
      const risk=number(metric.noResponseRisk);
      const riskText=risk===null?'':`・移動発生${risk}%`;
      const confidence=number(metric.efficiencyConfidence);
      const confidenceText=confidence===null?'未算出':confidence>=70?'高':confidence>=40?'中':'低';
      return`<div class="yos-ev__row"><span class="yos-ev__rank">${index+1}</span><div><b>${escapeHtml(item.label)}</b><small>${escapeHtml(efficiencyText(item,metric)+riskText+distance)}｜信頼度 ${item.fieldRule?'経験':confidenceText}</small></div><strong class="yos-ev__score">${item.score}<span>/100</span></strong></div>`;
    }).join('');
    const model=currentModel();
    const rules=model?.operationalRules||{};
    const noResponse=Number(rules.noResponseMinutes)||15;
    const lowFare=Number(rules.lowFareThreshold)||1000;
    const lowCount=Number(rules.consecutiveLowFareLimit)||2;
    const halfHour=Number(rules.halfHourSalesThreshold)||2000;
    foot.textContent=explicitPlan
      ?'YOSの当日指示を優先中。IMadaモデルは比較情報として表示。'
      :`判断順：空車時間50％ → 回転30％ → 期待時給20％。${noResponse}分無反応、${yen(lowFare)}以下${lowCount}件連続、30分売上${yen(halfHour)}未満で隣接エリアへ。操作は停車中のみ。`;

    if(!explicitPlan&&top.length>=3){
      const [primary,next,pass]=top;
      const primaryMetric=metricFor(primary);
      const nextMetric=metricFor(next);
      const passMetric=metricFor(pass);
      document.getElementById('primaryName').textContent=primary.label;
      document.getElementById('primaryAction').textContent=actionText(primary,primaryMetric,0);
      document.getElementById('nextName').textContent=next.label;
      document.getElementById('nextAction').textContent=actionText(next,nextMetric,1);
      document.getElementById('passName').textContent=pass.label;
      document.getElementById('passAction').textContent=actionText(pass,passMetric,2);
      document.getElementById('primaryGo').onclick=()=>openMaps(primary.destination);
      document.querySelector('[data-target="next"]').onclick=()=>openMaps(next.destination);
      document.querySelector('[data-target="pass"]').onclick=()=>openMaps(pass.destination);
    }
    installFifteenMinuteTimer(noResponse);
  }

  function installFifteenMinuteTimer(minutes){
    const current=document.querySelector('.timer');
    if(!current||current.dataset.imadaTimer==='1')return;
    const timer=current.cloneNode(true);
    timer.dataset.imadaTimer='1';
    current.replaceWith(timer);
    const text=timer.querySelector('#timerText');
    const status=timer.querySelector('#timerStatus');
    const start=timer.querySelector('#timerStart');
    const reset=timer.querySelector('#timerReset');
    const label=timer.querySelector('.timer-head span');
    if(!text||!status||!start||!reset)return;
    if(label)label.textContent='無反応上限';
    const key='yos-nav-imada-timer-v47';
    let deadline=0;
    let interval=null;
    const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
    const write=value=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
    const clear=()=>{try{localStorage.removeItem(key)}catch{}};
    const paint=()=>{
      const seconds=deadline?Math.max(0,Math.ceil((deadline-Date.now())/1000)):minutes*60;
      text.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
      if(deadline&&seconds===0){
        if(interval)clearInterval(interval);interval=null;deadline=0;
        status.textContent='移動判断';
        write({finished:true,minutes,updatedAt:Date.now()});
        navigator.vibrate?.([200,100,200]);
      }
    };
    const saved=read();
    if(saved&&Number(saved.minutes)===minutes&&Number(saved.deadline)>Date.now()){
      deadline=Number(saved.deadline);status.textContent='計測中';interval=setInterval(paint,250);
    }else if(saved?.finished){status.textContent='移動判断';text.textContent='00:00';}
    else paint();
    start.onclick=()=>{
      if(deadline)return;
      deadline=Date.now()+minutes*60*1000;
      status.textContent='計測中';
      write({deadline,minutes,updatedAt:Date.now()});
      interval=setInterval(paint,250);paint();
    };
    reset.onclick=()=>{
      if(interval)clearInterval(interval);interval=null;deadline=0;clear();status.textContent='未開始';paint();
    };
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)paint()});
    window.addEventListener('pageshow',paint);
  }

  window.addEventListener('yos-nav-recommendation',event=>render(event.detail?.recommendations));
  window.addEventListener('pageshow',()=>setTimeout(()=>render(),0));
  const observer=new MutationObserver(()=>render());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>{render();observer.disconnect()},2500);
})();
