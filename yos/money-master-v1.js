'use strict';
(()=>{
  const KEY='yos-money-v2';
  const MASTER_VERSION='2026-09-15';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
  const current=read();
  const base=current&&typeof current==='object'?current:{version:2,privacy:false,accounts:[],transactions:[],debts:[],goals:[],assets:[],rules:{}};
  base.accounts=Array.isArray(base.accounts)?base.accounts:[];
  base.transactions=Array.isArray(base.transactions)?base.transactions:[];
  base.debts=Array.isArray(base.debts)?base.debts:[];
  base.goals=Array.isArray(base.goals)?base.goals:[];
  base.assets=Array.isArray(base.assets)?base.assets:[];
  base.rules={monthlyEssential:0,qualityBudget:0,emergencyMonths:1,note:'生活を壊さず、安全を確保した上で高金利返済を優先する。',...(base.rules||{})};

  const facts=[
    {id:'master-car-insurance-2026-09',type:'expense',label:'車保険',amount:7060,date:'2026-09-26',status:'planned',source:'00_Money'},
    {id:'master-rent-2026-09',type:'expense',label:'家賃',amount:68500,date:'2026-09-27',status:'planned',source:'00_Money'}
  ];
  for(const fact of facts){
    const i=base.transactions.findIndex(tx=>tx?.id===fact.id);
    if(i<0)base.transactions.push(fact);
    else base.transactions[i]={...base.transactions[i],...fact};
  }

  base.masterFacts={
    version:MASTER_VERSION,
    source:'00_Money',
    monthlyIncomeEstimate:160485,
    monthlyIncomeLabel:'家賃収入・見込み',
    electricity:{provider:'沖縄ニューパワー',amount:null,date:'2026-09-26',status:'金額未確認'},
    currentBalance:null,
    currentBalanceStatus:'正本の最新残高は未確定',
    priority:'Cash Gapを確認し、高金利Debt返済を優先'
  };
  base.updatedAt=new Date().toISOString();
  try{localStorage.setItem(KEY,JSON.stringify(base))}catch{}
})();
