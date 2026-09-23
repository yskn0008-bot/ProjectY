'use strict';
(()=>{
  const clean=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
  function build(){
    const shared=window.YOSSharedStateV1?.snapshot?.()||{};
    const money=shared?.money||{};
    const privacy=Boolean(money.privacy);
    const alerts=[];
    if(money.shortagePossible===true){
      alerts.push({kind:'projected_shortage',title:'支払い前に資金不足の可能性',amount:privacy?null:(Number.isFinite(Number(money.shortfall))?Number(money.shortfall):null)});
    }
    const budget=Number(money.todayBudget),spent=Number(money.spentToday);
    if(Number.isFinite(budget)&&Number.isFinite(spent)&&spent>budget){
      alerts.push({kind:'daily_budget_over',title:'今日使える金額を超過',amount:privacy?null:spent-budget});
    }
    return {
      schema:'yos-money-alert-bridge-v1',
      generated_at:new Date().toISOString(),
      source:'yos-money-v2',
      privacy,
      current_balance:privacy?null:(money.balance??null),
      today_usable:privacy?null:(money.daily??null),
      next_payment:money.nextPayment?{date:clean(money.nextPayment?.date,10),label:clean(money.nextPayment?.label,80),amount:privacy?null:(Number.isFinite(Number(money.nextPayment?.amount))?Number(money.nextPayment.amount):null)}:null,
      next_income:money.nextIncome?{date:clean(money.nextIncome?.date,10),label:clean(money.nextIncome?.label,80),amount:privacy?null:(Number.isFinite(Number(money.nextIncome?.amount))?Number(money.nextIncome.amount):null)}:null,
      alerts
    };
  }
  function moneyText(v){return Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString('ja-JP')+'円':'';}
  function md(value){const v=clean(value,10);if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(v))return v;const [,m,d]=v.split('-').map(Number);return m+'/'+d;}
  function alertText(payload){
    const lines=['YOS_MONEY_ALERT_V1'];
    if(payload?.current_balance!=null)lines.push('現在残高：'+moneyText(payload.current_balance));
    if(payload?.today_usable!=null)lines.push('今日使える金額：'+moneyText(payload.today_usable));
    if(payload?.next_payment)lines.push('次の支払い：'+md(payload.next_payment.date)+' '+clean(payload.next_payment.label,80)+' '+(payload.privacy?'非表示':moneyText(payload.next_payment.amount)));
    if(payload?.next_income)lines.push('次の入金：'+md(payload.next_income.date)+' '+clean(payload.next_income.label,80)+' '+(payload.privacy?'非表示':moneyText(payload.next_income.amount)));
    const alerts=Array.isArray(payload?.alerts)?payload.alerts:[];
    if(!alerts.length)lines.push('緊急Money Alertなし');
    for(const a of alerts){
      if(a.kind==='projected_shortage')lines.push('警告：支払い前に資金不足の可能性'+(a.amount!=null?' '+moneyText(a.amount):''));
      else if(a.kind==='daily_budget_over')lines.push('警告：今日使える金額を超過'+(a.amount!=null?' '+moneyText(a.amount):''));
      else lines.push('警告：'+clean(a.title,100));
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
    const name=p.get('shortcut')||'Money Alert';
    const text=p.get('format')==='alert-text'?alertText(payload):'YOS_MONEY_ALERT_V1:'+encode(payload);
    const url='shortcuts://run-shortcut?name='+encodeURIComponent(name)+'&input=text&text='+encodeURIComponent(text);
    setTimeout(()=>location.replace(url),1200);
  }
  window.__yosMoneyAlertBridgeV1=Object.freeze({build,encode,alertText});
  if(new URLSearchParams(location.search).get('return')==='shortcut')returnToShortcut(build());
})();