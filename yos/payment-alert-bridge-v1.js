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
  function moneyText(v){return Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString('ja-JP')+'円':'';}
  function md(value){const v=clean(value,10);if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(v))return v;const [,m,d]=v.split('-').map(Number);return m+'/'+d;}
  function alertText(payload){
    const lines=['YOS_PAYMENT_ALERT_V1'];
    const payments=Array.isArray(payload?.payments)?payload.payments:[];
    if(!payments.length){lines.push('支払いアラートなし');return lines.join('\\n');}
    for(const p of payments){
      const when=p.days_until===0?'今日':p.days_until===1?'明日':p.days_until+'日後';
      const amount=payload.privacy?'非表示':moneyText(p.amount);
      lines.push(when+' '+md(p.date)+' '+clean(p.label,80)+' '+amount);
    }
    return lines.join('\\n');
  }
  function encode(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));let binary='';
    for(const b of bytes)binary+=String.fromCharCode(b);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function returnToShortcut(payload){
    const p=new URLSearchParams(location.search);
    const name=p.get('shortcut')||'PaymentAlert';
    const text=p.get('format')==='alert-text'?alertText(payload):'YOS_PAYMENT_ALERT_V1:'+encode(payload);
    const url='shortcuts://run-shortcut?name='+encodeURIComponent(name)+'&input=text&text='+encodeURIComponent(text);
    setTimeout(()=>location.replace(url),1200);
  }
  window.__yosPaymentAlertBridgeV1=Object.freeze({build,encode,alertText});
  if(new URLSearchParams(location.search).get('return')==='shortcut')returnToShortcut(build());
})();