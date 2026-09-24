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

  function parseNativeRecord(recordText){
    const source=String(recordText||'').replace(/\r\n/g,'\n').trim();
    if(!source.startsWith('YOS_NIGHT_RECORD_V1'))throw new Error('Unsupported native Night record');
    const take=(start,end)=>{
      const from=source.indexOf(start);
      if(from<0)return '';
      const valueStart=from+start.length;
      const to=end?source.indexOf(end,valueStart):-1;
      return source.slice(valueStart,to<0?source.length:to).trim();
    };
    const date=clean(take('date: ','\nsummary: '),10);
    if(!/^\d{4}-\d{2}-\d{2}$/u.test(date))throw new Error('Native Night record date missing');
    return {
      date,
      payload:{
        raw_input:take('\nraw_input:\n',''),
        summary:take('\nsummary: ','\nmood_state: '),
        mood_state:take('\nmood_state: ','\ntomorrow: '),
        tomorrow:take('\ntomorrow: ','\ndiscoveries: '),
        discoveries:take('\ndiscoveries: ','\nthree_line_diary:\n'),
        three_line_diary:take('\nthree_line_diary:\n','\ntomorrow_message: '),
        tomorrow_message:take('\ntomorrow_message: ','\nraw_input:\n')
      }
    };
  }

  window.__yosNightCheckinLifeBridgeV1Api=Object.freeze({normalize,saveInto,historyFrom,encodeBase64Url,decodeBase64Url,parseNativeRecord});
  if(typeof document==='undefined'||typeof localStorage==='undefined'||typeof location==='undefined')return;

  const readStore=()=>{try{return JSON.parse(localStorage.getItem(DATA_KEY)||'null')||{days:{}}}catch{return{days:{}}}};
  const writeStore=data=>localStorage.setItem(DATA_KEY,JSON.stringify(data));
  const decodeParam=(params,key,max)=>{
    const value=params.get(key);
    if(!value)return '';
    try{return clean(decodeBase64Url(value),max)}catch{return''}
  };

  function clearBridgeParams(){
    const url=new URL(location.href);
    [
      'night','night_save','night_raw_b64','night_summary_b64','night_mood_b64',
      'night_tomorrow_b64','night_discoveries_b64','night_diary_b64',
      'night_message_b64','night_display_b64','night_history','night_limit','shortcut'
    ].forEach(key=>url.searchParams.delete(key));
    history.replaceState({},'',url.pathname+(url.search?'?'+url.searchParams.toString():'')+url.hash);
  }

  function importNight(params){
    let payload=null;
    let displayText='';

    if(params.get('night_save')==='1'){
      payload={
        raw_input:decodeParam(params,'night_raw_b64',4000),
        summary:decodeParam(params,'night_summary_b64',1200),
        mood_state:decodeParam(params,'night_mood_b64',600),
        tomorrow:decodeParam(params,'night_tomorrow_b64',1200),
        discoveries:decodeParam(params,'night_discoveries_b64',2400),
        three_line_diary:decodeParam(params,'night_diary_b64',1800),
        tomorrow_message:decodeParam(params,'night_message_b64',600)
      };
      displayText=decodeParam(params,'night_display_b64',4000);
    }else{
      const encoded=params.get('night');
      if(!encoded)return false;
      payload=JSON.parse(decodeBase64Url(encoded));
      displayText=clean(payload?.display_text,4000);
    }

    const callback=clean(params.get('shortcut'),120);
    const result=saveInto(readStore(),payload,payload?.date);
    writeStore(result.data);
    clearBridgeParams();
    window.dispatchEvent(new StorageEvent('storage',{key:DATA_KEY,newValue:JSON.stringify(result.data)}));

    if(callback){
      const historyPayload={
        schema:'yos-night-history-cache-v1',
        as_of_date:result.date,
        records:historyFrom(result.data,'9999-12-31',14)
      };
      const ack={
        schema:'yos-night-save-ok-v1',
        date:result.date,
        display_text:displayText,
        history_text:JSON.stringify(historyPayload)
      };
      const target='shortcuts://run-shortcut?name='+encodeURIComponent(callback)+'&input=text&text='+encodeURIComponent(JSON.stringify(ack));
      // Match the proven Morning Brief callback timing: let the launching
      // Shortcut finish its Stop Shortcut action before starting the callback.
      setTimeout(()=>location.replace(target),1200);
    }
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

  function importNativeHash(){
    const rawHash=String(location.hash||'').replace(/^#/,'');
    if(!rawHash)return false;
    const params=new URLSearchParams(rawHash);
    const encoded=params.get('night_native_b64');
    if(!encoded)return false;
    const parsed=parseNativeRecord(decodeBase64Url(encoded));
    const result=saveInto(readStore(),parsed.payload,parsed.date);
    writeStore(result.data);
    history.replaceState({},'',location.pathname+location.search);
    window.dispatchEvent(new StorageEvent('storage',{key:DATA_KEY,newValue:JSON.stringify(result.data)}));
    window.dispatchEvent(new CustomEvent('yos-life-record-saved',{detail:{source:'native-night-sync',date:result.date}}));
    return true;
  }

  try{
    if(importNativeHash())return;
    const params=new URLSearchParams(location.search);
    if(importNight(params))return;
    returnHistory(params);
  }catch(error){
    console.warn('Night Check-in Life bridge skipped',error);
  }
})();
