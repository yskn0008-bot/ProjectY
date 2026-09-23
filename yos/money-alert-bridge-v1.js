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
  const DELIVERY_KEY='yos-money-alert-delivery-v1';
  const DIRECT_MIGRATION_KEY='yos-money-alert-direct-v1';

  function alertSignature(payload){
    const alerts=(Array.isArray(payload?.alerts)?payload.alerts:[]).map(a=>[
      clean(a?.kind,60),clean(a?.title,120),Number.isFinite(Number(a?.amount))?Number(a.amount):null
    ]);
    const p=payload?.next_payment||null;
    const i=payload?.next_income||null;
    return JSON.stringify({
      alerts,
      next_payment:p?[clean(p.date,10),clean(p.label,80),Number.isFinite(Number(p.amount))?Number(p.amount):null]:null,
      next_income:i?[clean(i.date,10),clean(i.label,80),Number.isFinite(Number(i.amount))?Number(i.amount):null]:null
    });
  }

  function deliveryDecision(payload){
    const alerts=Array.isArray(payload?.alerts)?payload.alerts:[];
    if(!alerts.length){
      try{localStorage.removeItem(DELIVERY_KEY);}catch(_){}
      return {show:false,reason:'clear',signature:''};
    }
    const signature=alertSignature(payload);
    let seen='',migrated=false;
    try{
      seen=localStorage.getItem(DELIVERY_KEY)||'';
      migrated=localStorage.getItem(DIRECT_MIGRATION_KEY)==='1';
    }catch(_){}
    if(!migrated){
      try{
        localStorage.setItem(DIRECT_MIGRATION_KEY,'1');
        localStorage.setItem(DELIVERY_KEY,signature);
      }catch(_){}
      return {show:false,reason:'migration',signature};
    }
    if(seen===signature) return {show:false,reason:'duplicate',signature};
    try{localStorage.setItem(DELIVERY_KEY,signature);}catch(_){}
    return {show:true,reason:'changed',signature};
  }

  function directLines(payload){
    const lines=[];
    if(payload?.current_balance!=null)lines.push(['現在残高',moneyText(payload.current_balance)]);
    if(payload?.today_usable!=null)lines.push(['今日使える金額',moneyText(payload.today_usable)]);
    if(payload?.next_payment)lines.push(['次の支払い',md(payload.next_payment.date)+' '+clean(payload.next_payment.label,80)+' '+(payload.privacy?'非表示':moneyText(payload.next_payment.amount))]);
    if(payload?.next_income)lines.push(['次の入金',md(payload.next_income.date)+' '+clean(payload.next_income.label,80)+' '+(payload.privacy?'非表示':moneyText(payload.next_income.amount))]);
    return lines;
  }

  function renderDirect(payload){
    const decision=deliveryDecision(payload);
    document.title='YOS Money Alert';
    document.body.innerHTML='';
    const main=document.createElement('main');
    main.className='money-alert-direct';
    if(!decision.show){
      const status=document.createElement('div');
      status.className='money-alert-status';
      status.textContent=decision.reason==='migration'?'重複通知を停止しました':'新しいMoney Alertはありません';
      main.appendChild(status);
      document.body.appendChild(main);
      setTimeout(()=>location.replace('./'),700);
      return decision;
    }

    const card=document.createElement('section');
    card.className='money-alert-card';
    const eyebrow=document.createElement('div');
    eyebrow.className='money-alert-eyebrow';
    eyebrow.textContent='MY MONEY';
    card.appendChild(eyebrow);
    const title=document.createElement('h1');
    title.textContent='Money 注意';
    card.appendChild(title);

    for(const a of payload.alerts||[]){
      const box=document.createElement('div');
      box.className='money-alert-warning';
      const h=document.createElement('strong');
      h.textContent=clean(a.title,120)||'Money Alert';
      box.appendChild(h);
      if(a.amount!=null){
        const amount=document.createElement('div');
        amount.textContent='不足見込み：'+moneyText(a.amount);
        box.appendChild(amount);
      }
      card.appendChild(box);
    }

    const facts=directLines(payload);
    if(facts.length){
      const dl=document.createElement('dl');
      for(const [k,v] of facts){
        const dt=document.createElement('dt');dt.textContent=k;
        const dd=document.createElement('dd');dd.textContent=v;
        dl.appendChild(dt);dl.appendChild(dd);
      }
      card.appendChild(dl);
    }

    const ok=document.createElement('a');
    ok.className='money-alert-ok';
    ok.href='./';
    ok.textContent='OK';
    card.appendChild(ok);
    main.appendChild(card);
    document.body.appendChild(main);
    return decision;
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
  window.__yosMoneyAlertBridgeV1=Object.freeze({build,encode,alertText,alertSignature,deliveryDecision,renderDirect});
  const params=new URLSearchParams(location.search);
  const payload=build();
  if(params.get('format')==='alert-text'&&params.get('native')!=='1')renderDirect(payload);
  else if(params.get('return')==='shortcut')returnToShortcut(payload);
})();