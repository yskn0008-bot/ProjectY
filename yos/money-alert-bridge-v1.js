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
  function encode(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));let binary='';
    for(const b of bytes)binary+=String.fromCharCode(b);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function returnToShortcut(payload){
    const p=new URLSearchParams(location.search);
    const name=p.get('shortcut')||'Money Alert';
    location.replace('shortcuts://run-shortcut?name='+encodeURIComponent(name)+'&input=text&text='+encodeURIComponent('YOS_MONEY_ALERT_V1:'+encode(payload)));
  }
  window.__yosMoneyAlertBridgeV1=Object.freeze({build,encode});
  if(new URLSearchParams(location.search).get('return')==='shortcut')returnToShortcut(build());
})();