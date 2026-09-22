'use strict';
(()=>{
  const TZ='Asia/Tokyo';
  const clean=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
  const dateKey=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ}).format(d);
  const dayDiff=(a,b)=>Math.round((new Date(b+'T00:00:00+09:00')-new Date(a+'T00:00:00+09:00'))/86400000);
  function build(){
    const shared=window.YOSSharedStateV1?.snapshot?.()||{};
    const money=shared?.money||{};
    const privacy=Boolean(money.privacy);
    const today=dateKey();
    const payments=(Array.isArray(money.upcomingPayments)?money.upcomingPayments:[])
      .map(tx=>({id:clean(tx?.id,100),date:clean(tx?.date,10),label:clean(tx?.label,80),amount:privacy?null:(Number.isFinite(Number(tx?.amount))?Number(tx.amount):null)}))
      .map(tx=>({...tx,days_until:dayDiff(today,tx.date)}))
      .filter(tx=>Number.isFinite(tx.days_until)&&tx.days_until>=0&&tx.days_until<=3);
    return {schema:'yos-payment-alert-bridge-v1',generated_at:new Date().toISOString(),source:'yos-money-v2',privacy,payments};
  }
  function encode(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));let binary='';
    for(const b of bytes)binary+=String.fromCharCode(b);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function returnToShortcut(payload){
    const p=new URLSearchParams(location.search);
    const name=p.get('shortcut')||'Payment Alert';
    location.replace('shortcuts://run-shortcut?name='+encodeURIComponent(name)+'&input=text&text='+encodeURIComponent('YOS_PAYMENT_ALERT_V1:'+encode(payload)));
  }
  window.__yosPaymentAlertBridgeV1=Object.freeze({build,encode});
  if(new URLSearchParams(location.search).get('return')==='shortcut')returnToShortcut(build());
})();