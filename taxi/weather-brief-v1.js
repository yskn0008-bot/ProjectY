'use strict';
(function(root){
  const API={};
  const URL='https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=26.2124&lon=127.6809';
  const CACHE_KEY='yos-taxi-naha-weather-v1';
  const HOUR=60*60*1000;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtTime=(value)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  API.extract=(payload,now=Date.now())=>{
    const series=payload?.properties?.timeseries;
    const updated=Date.parse(payload?.properties?.meta?.updated_at||'');
    if(!Array.isArray(series)||!series.length||!Number.isFinite(updated)||updated>now+5*60000||now-updated>6*HOUR)throw new Error('forecast metadata unavailable or outdated');
    const rows=series.map(x=>({
      time:Date.parse(x.time),
      rain:Number(x?.data?.next_1_hours?.details?.precipitation_amount)
    })).filter(x=>Number.isFinite(x.time)&&x.time>=now-15*60000&&x.time<now+6*HOUR&&Number.isFinite(x.rain)&&x.rain>=0&&x.rain<200);
    if(!rows.length)throw new Error('no next-six-hour forecast');
    const wet=rows.filter(x=>x.rain>=0.5);
    const peak=rows.reduce((p,x)=>x.rain>p.rain?x:p,rows[0]);
    return{updatedAt:new Date(updated).toISOString(),hours:rows.length,wetHours:wet.length,peakRain:peak.rain,peakTime:new Date(peak.time).toISOString(),firstWet:wet[0]?new Date(wet[0].time).toISOString():null};
  };
  API.wording=(item)=>{
    if(!item)return '予報は取得できませんでした。公式情報を確認してください。';
    if(item.wetHours===0)return '直近約6時間の予報では、強めの雨は見込まれていません。急な変化は気象庁で再確認。';
    return '直近約6時間のうち約'+item.wetHours+'時間で0.5mm以上の雨予報。最大'+item.peakRain.toFixed(1)+'mm/h（'+fmtTime(item.peakTime)+'頃）。';
  };
  const read=()=>{try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch{return null}};
  const write=v=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify(v))}catch{}};
  API.mount=async()=>{
    const target=document.getElementById('nahaAutoWeather');
    if(!target)return;
    const current=read(),now=Date.now();
    const paint=(summary,label)=>{
      target.innerHTML='<p class="notes">'+esc(API.wording(summary))+'</p>'+
        '<p class="small">'+esc(label)+'</p>'+
        '<p class="small">出典：<a href="https://api.met.no/" target="_blank" rel="noopener">MET Norway（CC BY 4.0）</a>の数値予報を加工。観測実況・乗車需要の実績ではありません。<a href="https://www.jma.go.jp/bosai/nowc/" target="_blank" rel="noopener">気象庁の雨雲を確認</a></p>';
    };
    if(current&&now-current.fetchedAt<60*60000){
      if(current.summary){paint(current.summary,'予報発表 '+fmtTime(current.summary.updatedAt)+'／取得 '+fmtTime(current.fetchedAt)+'（60分以内の保存情報）');return}
      paint(null,'取得失敗後の再試行待ち（60分以内）');return;
    }
    target.textContent='那覇中心部の雨予報を取得しています…';
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),9000);
    try{
      const response=await fetch(URL,{signal:ctrl.signal,mode:'cors',cache:'default'});
      if(!response.ok)throw new Error('forecast provider HTTP '+response.status);
      const data=await response.json();
      const summary=API.extract(data,Date.now());
      write({fetchedAt:Date.now(),summary});
      paint(summary,'予報発表 '+fmtTime(summary.updatedAt)+'／取得 '+fmtTime(Date.now()));
    }catch{
      write({fetchedAt:Date.now(),summary:null});
      paint(null,'外部気象サービスに接続できません。現在の天候は未確認。');
    }finally{clearTimeout(timeout)}
  };
  root.YosTaxiNahaWeather=API;
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',API.mount,{once:true});
    else API.mount();
  }
})(globalThis);
