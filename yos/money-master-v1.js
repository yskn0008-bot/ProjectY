'use strict';
(()=>{
  const KEY='yos-money-v2';
  const MASTER_VERSION='2026-09-29-v7';
  const SOURCE='user-confirmed-2026-09-28';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
  const current=read();
  const base=current&&typeof current==='object'?current:{version:2,privacy:false,accounts:[],transactions:[],debts:[],goals:[],assets:[],rules:{}};
  base.accounts=Array.isArray(base.accounts)?base.accounts:[];
  base.transactions=Array.isArray(base.transactions)?base.transactions:[];
  base.recurring=Array.isArray(base.recurring)?base.recurring:[];
  base.debts=Array.isArray(base.debts)?base.debts:[];
  base.goals=Array.isArray(base.goals)?base.goals:[];
  base.assets=Array.isArray(base.assets)?base.assets:[];
  base.rules={monthlyEssential:0,qualityBudget:0,emergencyMonths:1,note:'生活を壊さず、安全を確保した上で高金利返済を優先する。',...(base.rules||{})};

  const migrate=base?.masterFacts?.version!==MASTER_VERSION;
  if(migrate){
    const stamp=new Date().toISOString();
    const emergencyGoalFact={
      id:'master-goal-emergency-fund',
      name:'生活防衛費',
      type:'emergency',
      target:600000,
      current:0,
      checkpoint:100000,
      priority:5,
      priorityLabel:'高',
      purpose:'収入減・急な支払い・入金遅延があっても生活を維持するため',
      source:SOURCE
    };
    const emergencyGoalIndex=base.goals.findIndex(goal=>goal?.id===emergencyGoalFact.id||String(goal?.name||'').trim()===emergencyGoalFact.name);
    const priorEmergencyGoal=emergencyGoalIndex>=0?base.goals[emergencyGoalIndex]:null;
    const emergencyCurrent=priorEmergencyGoal&&Number.isFinite(Number(priorEmergencyGoal.current))?Math.max(0,Number(priorEmergencyGoal.current)):0;
    const emergencyGoal={...priorEmergencyGoal,...emergencyGoalFact,current:emergencyCurrent,updatedAt:stamp};
    if(emergencyGoalIndex<0)base.goals.push(emergencyGoal);else base.goals[emergencyGoalIndex]=emergencyGoal;

    // v6: live balances must never be reseeded from old 2026-09-23 constants.
    // Correct only the exact stale seed state that was confirmed to be wrong.
    const byName=name=>base.accounts.find(item=>String(item?.name||'').trim()===name);
    const staleSeed=Number(byName('PayPay')?.balance)===4033
      && Number(byName('PayPay銀行')?.balance)===133
      && Number(byName('現金')?.balance)===422;
    if(staleSeed){
      base.accounts=[
        {...(byName('PayPay')||{}),id:byName('PayPay')?.id||'master-account-paypay',name:'PayPay',type:'emoney',balance:0,source:SOURCE,updatedAt:stamp},
        {...(byName('PayPay銀行')||{}),id:byName('PayPay銀行')?.id||'master-account-paypay-bank',name:'PayPay銀行',type:'bank',balance:0,source:SOURCE,updatedAt:stamp},
        {...(byName('現金')||{}),id:byName('現金')?.id||'master-account-cash',name:'現金',type:'cash',balance:1453,source:SOURCE,updatedAt:stamp}
      ];
    }

    const facts=[
      {id:'master-rental-income-2026-09',type:'income',label:'家賃収入',amount:160485,date:'2026-09-10',status:'received',source:SOURCE,certainty:'確定'},
      {id:'master-icloud-2026-09',type:'expense',label:'iCloud',amount:540,date:'2026-09-14',status:'paid',source:SOURCE,certainty:'確定'},
      {id:'master-car-insurance-2026-09',type:'expense',label:'車保険',amount:7060,date:'2026-09-26',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-rent-2026-09',type:'expense',label:'家賃',amount:68500,date:'2026-09-27',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-electricity-2026-09',type:'expense',label:'電気',amount:3710,date:'2026-09-27',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-repayment-2026-09',type:'debt',label:'返済',amount:10000,date:'2026-09-28',status:'paid',paid:true,completed:true,source:SOURCE,certainty:'確定'},
      {id:'master-moneyforward-2026-09',type:'expense',label:'MoneyForward',amount:590,date:'2026-09-29',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-chatgpt-2026-09',type:'expense',label:'ChatGPT Plus',amount:3000,date:'2026-09-30',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-youtube-2026-09',type:'expense',label:'YouTube Premium',amount:1680,date:'2026-09-30',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-rental-income-2026-10',type:'income',label:'家賃収入',amount:160485,date:'2026-10-13',status:'planned',source:SOURCE,certainty:'見込み',amountApproximate:true},
      {id:'master-repayment-2026-10-10',type:'debt',label:'返済',amount:30000,date:'2026-10-10',status:'planned',source:SOURCE,certainty:'確定'}
    ];
    for(const fact of facts){
      const i=base.transactions.findIndex(tx=>tx?.id===fact.id);
      if(i<0)base.transactions.push(fact);
      else if(fact.id==='master-repayment-2026-09')base.transactions[i]={...base.transactions[i],...fact};
      else base.transactions[i]={...fact,...base.transactions[i]};
    }

    const recurringFacts=[
      {id:'master-rec-rental-income',frequency:'monthly',type:'income',category:'income',label:'家賃収入',amount:160485,day:13,startDate:'2026-10-01',enabled:true,amountApproximate:true,certainty:'見込み',source:SOURCE},
      {id:'master-rec-rent',frequency:'monthly',type:'expense',category:'housing',label:'家賃',amount:68500,day:27,startDate:'2026-10-01',enabled:true,source:SOURCE},
      {id:'master-rec-car-insurance',frequency:'monthly',type:'expense',category:'transport',label:'車保険',amount:7060,day:26,startDate:'2026-10-01',enabled:true,source:SOURCE},
      {id:'master-rec-electricity',frequency:'monthly',type:'expense',category:'utilities',label:'電気',amount:3710,day:27,startDate:'2026-10-01',enabled:true,source:SOURCE},
      {id:'master-rec-icloud',frequency:'monthly',type:'expense',category:'utilities',label:'iCloud',amount:540,day:14,startDate:'2026-10-01',enabled:true,source:SOURCE},
      {id:'master-rec-moneyforward',frequency:'monthly',type:'expense',category:'utilities',label:'MoneyForward',amount:590,day:29,startDate:'2026-10-01',enabled:true,source:SOURCE},
      {id:'master-rec-chatgpt',frequency:'monthly',type:'expense',category:'utilities',label:'ChatGPT Plus',amount:3000,day:30,startDate:'2026-10-01',enabled:true,source:SOURCE},
      {id:'master-rec-youtube',frequency:'monthly',type:'expense',category:'utilities',label:'YouTube Premium',amount:1680,day:30,startDate:'2026-10-01',enabled:true,source:SOURCE}
    ];
    for(const fact of recurringFacts){
      if(!base.recurring.some(rule=>rule?.id===fact.id||(
        String(rule?.label||'').trim()===fact.label
        && rule?.frequency==='monthly'
        && Number(rule?.amount)===fact.amount
      ))) base.recurring.push({...fact,createdAt:stamp});
    }
    base.updatedAt=stamp;
  }

  const liveBalance=base.accounts.length?base.accounts.reduce((sum,item)=>sum+(Number.isFinite(Number(item?.balance))?Number(item.balance):0),0):null;
  const liveBreakdown=Object.fromEntries(base.accounts.map(item=>[String(item?.name||item?.id||'口座'),Number.isFinite(Number(item?.balance))?Number(item.balance):0]));
  const openTransactions=base.transactions
    .filter(tx=>['expense','debt','saving','investment'].includes(tx?.type))
    .filter(tx=>!Boolean(tx?.completed||tx?.paid||tx?.received)&&!['done','paid','completed','received'].includes(String(tx?.status||'').toLowerCase()))
    .sort((a,b)=>String(a?.date||'').localeCompare(String(b?.date||'')));
  const nextIncomeTx=base.transactions
    .filter(tx=>tx?.type==='income')
    .filter(tx=>!Boolean(tx?.completed||tx?.paid||tx?.received)&&!['done','paid','completed','received'].includes(String(tx?.status||'').toLowerCase()))
    .sort((a,b)=>String(a?.date||'').localeCompare(String(b?.date||'')))[0]||null;
  const remainingPaymentsTotal=openTransactions.reduce((sum,tx)=>sum+(Number.isFinite(Number(tx?.amount))?Number(tx.amount):0),0);
  const shortfallToRequiredPayments=liveBalance===null?null:Math.max(0,remainingPaymentsTotal-liveBalance);
  base.masterFacts={
    ...(base.masterFacts||{}),
    version:MASTER_VERSION,
    source:'live-yos-money-v2',
    currentBalance:liveBalance,
    currentBalanceStatus:base.updatedAt?'yos-money-v2 live':'未更新',
    accountBreakdown:liveBreakdown,
    remainingPaymentsTotal,
    shortfallToRequiredPayments,
    nextIncome:nextIncomeTx?{date:nextIncomeTx.date,label:nextIncomeTx.label,amount:nextIncomeTx.amount,certainty:nextIncomeTx.certainty||'',amountApproximate:Boolean(nextIncomeTx.amountApproximate)}:null,
    priority:'最新Money実データを正本として支払い前の不足を確認する'
  };
  try{localStorage.setItem(KEY,JSON.stringify(base))}catch{}
})();
