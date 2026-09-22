'use strict';
(()=>{
  if(window.__yosNightCheckinLifeBridgeV1)return;
  window.__yosNightCheckinLifeBridgeV1=true;

  const DATA_KEY='yos-life-v1';
  const SCHEMA='yos-night-checkin-v1';
  const clean=(value,max=1200)=>String(value??'').trim().slice(0,max);
  const calendarDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const decodeBase64Url=value=>{
    const padded=String(value||'').replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((String(value||'').length+3)%4);
    const binary=atob(padded);
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };
  const encodeBase64Url=value=>{
    const bytes=new TextEncoder().encode(String(value||''));
    let binary=''; bytes.forEach(byte=>{binary+=String.fromCharCode(byte)});
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };

  function normalize(payload){
    const source=asObject(payload);
    return {
      schema:SCHEMA,
      raw_input:clean(source.raw_input,4000),
      summary:clean(source.summary,1200),
      mood_state:clean(source.mood_state,600),
      tomorrow:clean(source.tomorrow,1200),
      discoveries:clean(source.discoveries,2400),
      three_line_diary:clean(source.three_line_diary,1800),
      tomorrow_message:clean(source.tomorrow_message,600),
      generated_at:clean(source.generated_at,60)||new Date().toISOString()
    };
  }

  function activeDate(data){
    const key=clean(data?.activeLifeDate,10);
    return key&&data?.days?.[key]&&!data.days[key]?.lifeFlow?.endedAt?key:calendarDate();
  }

  function saveInto(data,payload,date){
    const store=asObject(data);
    if(!store.days||typeof store.days!=='object'||Array.isArray(store.days))store.days={};
    const key=clean(date,10)||activeDate(store);
    const day=asObject(store.days[key]);
    const flow=asObject(day.lifeFlow);
    const record=normalize(payload);
    day.lifeFlow={...flow,nightCheckin:record};
    store.days[key]=day;
    return {data:store,date:key,record};
  }

  function historyFrom(data,beforeDate,limit=30){
    const store=asObject(data);
    const before=clean(beforeDate,10)||calendarDate();
    const max=Math.max(1,Math.min(30,Number(limit)||30));
    return Object.keys(asObject(store.days))
      .filter(date=>date<before&&store.days[date]?.lifeFlow?.nightCheckin)
      .sort((a,b)=>b.localeCompare(a))
      .slice(0,max)
      .reverse()
      .map(date=>{
        const day=store.days[date]||{};
        const n=asObject(day.lifeFlow?.nightCheckin);
        return {
          date,
          summary:clean(n.summary,700),
          mood_state:clean(n.mood_state,300),
          tomorrow:clean(n.tomorrow,500),
          discoveries:clean(n.discoveries,900),
          three_line_diary:clean(n.three_line_diary,700),
          generated_at:clean(n.generated_at,60),
          planned_tasks:(Array.isArray(day.tasks)?day.tasks:[]).filter(t=>clean(t?.text,70)).map(t=>({text:clean(t.text,70),done:Boolean(t.done)})).slice(0,8)
        };
      });
  }

  window.__yosNightCheckinLifeBridgeV1Api=Object.freeze({normalize,saveInto,historyFrom,encodeBase64Url,decodeBase64Url});
  if(typeof document==='undefined'||typeof localStorage==='undefined'||typeof location==='undefined')return;

  const readStore=()=>{try{return JSON.parse(localStorage.getItem(DATA_KEY)||'null')||{days:{}}}catch{return{days:{}}}};
  const writeStore=data=>localStorage.setItem(DATA_KEY,JSON.stringify(data));

  function clearBridgeParams(){
    const url=new URL(location.href);
    ['night','night_history','night_limit','shortcut'].forEach(key=>url.searchParams.delete(key));
    history.replaceState({},'',url.pathname+(url.search?'?'+url.searchParams.toString():'')+url.hash);
  }

  function importNight(params){
    const encoded=params.get('night');
    if(!encoded)return false;
    const payload=JSON.parse(decodeBase64Url(encoded));
    const result=saveInto(readStore(),payload,payload.date);
    writeStore(result.data);
    clearBridgeParams();
    window.dispatchEvent(new StorageEvent('storage',{key:DATA_KEY,newValue:JSON.stringify(result.data)}));
    return true;
  }

  function returnHistory(params){
    if(params.get('night_history')!=='1')return false;
    const shortcut=clean(params.get('shortcut'),120)||'Night Check-in';
    const limit=Math.max(1,Math.min(30,Number(params.get('night_limit'))||30));
    const data=readStore();
    const date=activeDate(data);
    const payload={schema:'yos-night-history-v1',before_date:date,records:historyFrom(data,date,limit)};
    clearBridgeParams();
    const target='shortcuts://run-shortcut?name='+encodeURIComponent(shortcut)+'&input=text&text='+encodeURIComponent(JSON.stringify(payload));
    location.replace(target);
    return true;
  }

  try{
    const params=new URLSearchParams(location.search);
    if(importNight(params))return;
    returnHistory(params);
  }catch(error){
    console.warn('Night Check-in Life bridge skipped',error);
  }
})();
