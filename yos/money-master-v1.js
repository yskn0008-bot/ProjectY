'use strict';
(()=>{
  const KEY='yos-money-v2';
  const MASTER_VERSION='2026-09-23-v5';
  const SOURCE='user-confirmed-2026-09-23';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
  const current=read();
  const base=current&&typeof current==='object'?current:{version:2,privacy:false,accounts:[],transactions:[],debts:[],goals:[],assets:[],rules:{}};
  base.accounts=Array.isArray(base.accounts)?base.accounts:[];
  base.transactions=Array.isArray(base.transactions)?base.transactions:[];
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

    const accountFacts=[
      {id:'master-account-paypay',name:'PayPay',type:'emoney',balance:4033,source:SOURCE},
      {id:'master-account-paypay-bank',name:'PayPay銀行',type:'bank',balance:133,source:SOURCE},
      {id:'master-account-cash',name:'現金',type:'cash',balance:422,source:SOURCE}
    ];
    base.accounts=accountFacts.map(fact=>{
      const prior=base.accounts.find(item=>item?.id===fact.id||String(item?.name||'').trim()===fact.name)||{};
      return {...prior,...fact,updatedAt:stamp};
    });

    const facts=[
      {id:'master-rental-income-2026-09',type:'income',label:'家賃収入',amount:160485,date:'2026-09-10',status:'received',source:SOURCE,certainty:'確定'},
      {id:'master-icloud-2026-09',type:'expense',label:'iCloud',amount:540,date:'2026-09-14',status:'paid',source:SOURCE,certainty:'確定'},
      {id:'master-car-insurance-2026-09',type:'expense',label:'車保険',amount:7060,date:'2026-09-26',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-rent-2026-09',type:'expense',label:'家賃',amount:68500,date:'2026-09-27',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-electricity-2026-09',type:'expense',label:'電気',amount:3710,date:'2026-09-27',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-repayment-2026-09',type:'debt',label:'返済',amount:10000,date:'2026-09-28',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-moneyforward-2026-09',type:'expense',label:'MoneyForward',amount:590,date:'2026-09-29',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-chatgpt-2026-09',type:'expense',label:'ChatGPT Plus',amount:3000,date:'2026-09-30',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-youtube-2026-09',type:'expense',label:'YouTube Premium',amount:1680,date:'2026-09-30',status:'planned',source:SOURCE,certainty:'確定'},
      {id:'master-rental-income-2026-10',type:'income',label:'家賃収入',amount:160485,date:'2026-10-13',status:'planned',source:SOURCE,certainty:'見込み',amountApproximate:true}
    ];
    for(const fact of facts){
      const i=base.transactions.findIndex(tx=>tx?.id===fact.id);
      if(i<0)base.transactions.push(fact);
      else base.transactions[i]={...base.transactions[i],...fact};
    }
    base.updatedAt=stamp;
  }

  base.masterFacts={
    ...(base.masterFacts||{}),
    version:MASTER_VERSION,
    source:SOURCE,
    currentBalance:4588,
    currentBalanceStatus:'本人確認済み 2026-09-23',
    accountBreakdown:{payPay:4033,payPayBank:133,cash:422},
    lastIncome:{date:'2026-09-10',label:'家賃収入',amount:160485,status:'received'},
    paid:{icloud:{date:'2026-09-14',label:'iCloud',amount:540,status:'paid'}},
    remainingPaymentsTotal:94540,
    shortfallToRequiredPayments:89952,
    nextIncome:{date:'2026-10-13',label:'家賃収入',amount:160485,certainty:'見込み',amountApproximate:true},
    monthlyIncomeEstimate:160485,
    monthlyIncomeLabel:'家賃収入・見込み',
    electricity:{provider:'沖縄ニューパワー',amount:3710,date:'2026-09-27',status:'確定',recurringDay:27},
    fixed:{rent:68500,carInsurance:7060,subscriptions:5810,remainingSubscriptions:5270},
    priority:'最新Money実データを正本として支払い前の不足を確認する'
  };
  try{localStorage.setItem(KEY,JSON.stringify(base))}catch{}
})();
