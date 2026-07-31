'use strict';

(()=>{
  if(window.__yosProjectYLiveSyncV1)return;
  window.__yosProjectYLiveSyncV1=true;

  const OPS_KEY='yos-taxi-ops-v1';
  const SETTINGS_KEY='yos-taxi-settings-v2';
  const CALENDAR_KEY='yos-taxi-calendar-v1';
  const SHARED_KEY='yos-shared-taxi-state-v1';
  const QUEUE_KEY='yos-taxi-sync-queue-v1';
  const SENT_KEY='yos-taxi-sync-sent-v1';
  const API_KEY='yos-taxi-sync-api-v1';
  const TOKEN_KEY='yos-taxi-sync-token-v1';
  const NAV_API_KEY='yos-nav-model-api-v1';
  const MAX_QUEUE=250;
  const SYNC_INTERVAL=15000;
  const RETRY_BASE=15000;
  const RETRY_MAX=15*60*1000;

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const money=value=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(number(value));
  const validHttps=value=>{try{const url=new URL(String(value||''));return url.protocol==='https:'?url.toString():''}catch{return''}};
  const statusLabel=status=>({before:'営業前',available:'空車',occupied:'乗車中',break:'休憩中',ended:'営業終了'}[status]||status||'未確認');
  const now=()=>new Date().toISOString();

  let flushing=false;
  let lastFingerprint='';

  function endpoint(){
    const explicit=validHttps(localStorage.getItem(API_KEY));
    if(explicit)return explicit;
    const navApi=validHttps(localStorage.getItem(NAV_API_KEY));
    if(navApi){
      try{
        const url=new URL(navApi);
        url.pathname=url.pathname.replace(/\/api\/yos\/nav-model\/?$/u,'/api/yos/taxi-event');
        url.search='';
        return url.toString();
      }catch{}
    }
    return location.hostname.endsWith('.vercel.app')?`${location.origin}/api/yos/taxi-event`:'';
  }

  function token(){return String(localStorage.getItem(TOKEN_KEY)||'').trim()}

  function rides(state){return Array.isArray(state.events)?state.events.filter(event=>event?.type==='降車'):[]}

  function eventPayload(state,settings,event){
    return{
      version:1,
      eventId:String(event.id||`${state.businessDate}-${event.end||event.at||Date.now()}`),
      businessDate:String(state.businessDate||''),
      vehicle:String(settings.vehicle||''),
      rideStartedAt:event.start||null,
      rideEndedAt:event.end||event.at||null,
      pickup:String(event.pickup||''),
      pickupCoords:String(event.pickupCoords||''),
      dropoff:String(event.dropoff||''),
      dropoffCoords:String(event.dropoffCoords||''),
      fare:number(event.fare),
      tip:number(event.tip),
      payment:String(event.payment||''),
      dispatch:String(event.dispatch||''),
      distance:number(event.distance),
      durationMs:number(event.durationMs),
      waitMs:number(event.waitMs),
      memo:String(event.memo||''),
      clientUpdatedAt:state.updatedAt||now()
    };
  }

  function queueNewRides(state,settings){
    const queue=read(QUEUE_KEY,[]);
    const sent=new Set(read(SENT_KEY,[]));
    const queued=new Set(queue.map(item=>item?.payload?.eventId));
    let changed=false;
    for(const event of rides(state).slice().reverse()){
      const payload=eventPayload(state,settings,event);
      if(!payload.eventId||sent.has(payload.eventId)||queued.has(payload.eventId))continue;
      queue.push({payload,createdAt:now(),attempts:0,nextAttemptAt:0,lastError:''});
      queued.add(payload.eventId);
      changed=true;
    }
    if(queue.length>MAX_QUEUE)queue.splice(0,queue.length-MAX_QUEUE);
    if(changed)write(QUEUE_KEY,queue);
    return queue;
  }

  function sharedSummary(state,settings,queue){
    const finished=rides(state);
    const sales=finished.reduce((sum,event)=>sum+number(event.fare)+number(event.tip),0);
    const target=number(settings.targetSales);
    const idleMs=state.status==='available'&&state.availableSince?Math.max(0,Date.now()-new Date(state.availableSince).getTime()):0;
    const pending=queue.length;
    const syncApi=endpoint();
    return{
      version:1,
      businessDate:state.businessDate||'',
      status:state.status||'before',
      statusLabel:statusLabel(state.status),
      shiftStart:state.shiftStart||null,
      shiftEnd:state.shiftEnd||null,
      availableSince:state.availableSince||null,
      currentPickup:state.activeRide?.pickup||'',
      currentDispatch:state.activeRide?.dispatch||'',
      sales,
      rides:finished.length,
      averageFare:finished.length?Math.round(sales/finished.length):0,
      targetSales:target,
      remainingSales:Math.max(0,target-sales),
      idleMinutes:Math.floor(idleMs/60000),
      vehicle:String(settings.vehicle||''),
      pendingSync:pending,
      syncConfigured:Boolean(syncApi&&token()),
      syncState:pending?(syncApi&&token()?'pending':'local-only'):'synced',
      updatedAt:state.updatedAt||now()
    };
  }

  function updateCalendar(summary){
    if(!summary.businessDate)return;
    const calendar=read(CALENDAR_KEY,{monthlyGoals:{},days:{}});
    calendar.days=calendar.days||{};
    const current=calendar.days[summary.businessDate]||{};
    calendar.days[summary.businessDate]={
      ...current,
      status:summary.status==='before'?'unknown':'work',
      sales:summary.sales,
      rides:summary.rides,
      reportTrips:summary.rides,
      shiftStart:summary.shiftStart?new Date(summary.shiftStart).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false}):current.shiftStart,
      source:'YOS Taxi ライブ記録',
      live:true,
      liveUpdatedAt:summary.updatedAt
    };
    write(CALENDAR_KEY,calendar);
  }

  function publish(){
    const state=read(OPS_KEY,null);
    if(!state)return null;
    const settings=read(SETTINGS_KEY,{});
    const queue=queueNewRides(state,settings);
    const summary=sharedSummary(state,settings,queue);
    write(SHARED_KEY,summary);
    updateCalendar(summary);
    render(summary);
    window.dispatchEvent(new CustomEvent('yos-taxi-shared-update',{detail:summary}));
    return summary;
  }

  async function flush(){
    if(flushing||!navigator.onLine)return;
    const api=endpoint();
    const secret=token();
    if(!api||!secret){publish();return}
    const queue=read(QUEUE_KEY,[]);
    if(!queue.length){publish();return}
    flushing=true;
    try{
      const item=queue[0];
      if(number(item.nextAttemptAt)>Date.now())return;
      const response=await fetch(api,{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${secret}`},
        body:JSON.stringify(item.payload),
        cache:'no-store',
        credentials:'omit'
      });
      if(response.ok||response.status===409){
        queue.shift();
        const sent=read(SENT_KEY,[]);
        sent.push(item.payload.eventId);
        if(sent.length>1000)sent.splice(0,sent.length-1000);
        write(SENT_KEY,sent);
        write(QUEUE_KEY,queue);
      }else{
        throw new Error(`HTTP ${response.status}`);
      }
    }catch(error){
      const queue=read(QUEUE_KEY,[]);
      if(queue[0]){
        queue[0].attempts=number(queue[0].attempts)+1;
        queue[0].lastError=String(error?.message||'送信失敗').slice(0,120);
        queue[0].nextAttemptAt=Date.now()+Math.min(RETRY_MAX,RETRY_BASE*(2**Math.min(6,queue[0].attempts-1)));
        write(QUEUE_KEY,queue);
      }
    }finally{
      flushing=false;
      publish();
    }
  }

  function configure(){
    const currentApi=endpoint();
    const api=prompt('ProjectY連携APIのHTTPS URLを入力してください。未設定なら空欄で閉じてください。',currentApi||'');
    if(api===null)return;
    const validated=validHttps(api.trim());
    if(api.trim()&&!validated){alert('HTTPSのURLを確認してください。');return}
    if(validated)localStorage.setItem(API_KEY,validated);else localStorage.removeItem(API_KEY);
    const currentToken=token();
    const secret=prompt('端末連携トークンを入力してください。トークンはこのiPhone内だけに保存されます。',currentToken?'設定済み（変更する場合だけ入力）':'');
    if(secret!==null&&secret.trim()&&!secret.startsWith('設定済み'))localStorage.setItem(TOKEN_KEY,secret.trim());
    publish();
    flush();
  }

  function render(summary){
    let card=document.getElementById('yos-projecty-live-sync-v1');
    const anchor=document.querySelector('.rp-command-card')||document.querySelector('.rp-status-card')||document.querySelector('main');
    if(!anchor)return;
    if(!card){
      card=document.createElement('section');
      card.id='yos-projecty-live-sync-v1';
      card.className='rp-card';
      card.style.cssText='margin-top:10px;padding:12px;border:1px solid rgba(72,209,125,.28);border-radius:16px;background:rgba(13,30,23,.8)';
      anchor.insertAdjacentElement('afterend',card);
    }
    const configured=summary.syncConfigured;
    const state=summary.pendingSync?configured?`未送信 ${summary.pendingSync}件`:`端末保存 ${summary.pendingSync}件`:'同期済み';
    card.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><b style="display:block;font-size:14px">YOS連動</b><small style="color:#aaaab4">${state}・YOS／ナビ／カレンダーへ反映</small></div><button type="button" data-live-setup style="min-height:38px;padding:0 12px;border:1px solid #3a6b52;border-radius:999px;background:#173326;color:#b9f3cf;font-weight:900">${configured?'接続設定':'ProjectY接続'}</button></div>`;
    card.querySelector('[data-live-setup]').onclick=configure;
  }

  function tick(){
    const state=localStorage.getItem(OPS_KEY)||'';
    if(state!==lastFingerprint){lastFingerprint=state;publish()}
    flush();
  }

  publish();
  flush();
  setInterval(tick,SYNC_INTERVAL);
  window.addEventListener('online',flush);
  window.addEventListener('pageshow',()=>{publish();flush()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){publish();flush()}});
})();
