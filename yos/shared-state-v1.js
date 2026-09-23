'use strict';
(()=>{
  if(window.YOSSharedStateV1)return;
  const KEYS={
    shared:'yos-shared-state-v1',
    life:'yos-life-v1',
    money:'yos-money-v2',
    journeys:'hj-domain-journeys-v1',
    profile:'hj-user-profile-v1',
    idea:'yos-my-way-ideas-v1',
    legacyIdea:'yos-idea-memo-v1',
    home:'yos-home-current-state-v1'
  };
  const WATCHED=new Set(Object.values(KEYS).filter(key=>key!==KEYS.shared));
  const TZ='Asia/Tokyo';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
  const clean=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
  const number=value=>Number.isFinite(Number(value))?Number(value):null;
  const dateKey=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ}).format(new Date());
  const monthKey=()=>dateKey().slice(0,7);
  const moneyText=value=>value===null||value===undefined?'':Math.round(Number(value)).toLocaleString('ja-JP')+'円';
  const outgoing=tx=>['expense','debt','saving','investment'].includes(tx?.type);
  const completeStatus=tx=>{const status=clean(tx?.status,20).toLowerCase();return tx?.completed===true||tx?.paid===true||tx?.received===true||['done','paid','completed','received'].includes(status)};

  function lifeSnapshot(){
    const life=read(KEYS.life,null);
    const date=life?.activeLifeDate||dateKey();
    const day=life?.days?.[date]||life?.days?.[dateKey()]||null;
    const schedule=Array.isArray(day?.schedule)?day.schedule:[];
    const tasks=Array.isArray(day?.tasks)?day.tasks:[];
    return {
      connected:Boolean(life),
      date,
      scheduleCount:schedule.length,
      openTaskCount:tasks.filter(task=>clean(task?.text,120)&&!task.done).length,
      nextAction:clean(day?.nextAction,160)||clean(day?.priority,160)||clean(tasks.find(task=>clean(task?.text,120)&&!task.done)?.text,160),
      lastSync:clean(day?.lastSync,40),
      day,
      raw:life
    };
  }

  function moneySnapshot(){
    const data=read(KEYS.money,null);
    const life=read(KEYS.life,null);
    const today=life?.days?.[life?.activeLifeDate||dateKey()]||life?.days?.[dateKey()]||null;
    const legacy=life?.moneySafety||today?.money||{};
    const accounts=Array.isArray(data?.accounts)?data.accounts:[];
    const transactions=Array.isArray(data?.transactions)?data.transactions:[];
    const privacy=Boolean(data?.privacy);
    const accountBalance=accounts.length?accounts.reduce((sum,item)=>sum+(number(item?.balance)||0),0):null;
    const legacyBalance=number(legacy?.currentBalance??legacy?.balance);
    const balance=accountBalance!==null?accountBalance:legacyBalance;
    const month=monthKey();
    const monthly=transactions.filter(tx=>String(tx?.date||'').slice(0,7)===month);
    const income=monthly.filter(tx=>tx?.type==='income').reduce((sum,tx)=>sum+(number(tx?.amount)||0),0);
    const expense=monthly.filter(outgoing).reduce((sum,tx)=>sum+(number(tx?.amount)||0),0);
    const future=transactions.filter(tx=>!completeStatus(tx)&&String(tx?.date||'')>=dateKey()).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id||'').localeCompare(String(b.id||'')));
    const nextPayment=future.find(outgoing)||null;
    const nextIncome=future.find(tx=>tx?.type==='income')||null;
    const upcomingPayments=future.filter(outgoing).slice(0,5);
    const upcomingIncomes=future.filter(tx=>tx?.type==='income').slice(0,5);
    const todayDate=new Date(dateKey()+'T12:00:00+09:00');
    const monthEnd=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12);
    const anchorDate=nextIncome?.date?new Date(nextIncome.date+'T12:00:00+09:00'):monthEnd;
    const outgoingUntilAnchor=future.filter(tx=>outgoing(tx)&&String(tx?.date||'')<=new Intl.DateTimeFormat('sv-SE',{timeZone:TZ}).format(anchorDate)).reduce((sum,tx)=>sum+(number(tx?.amount)||0),0);
    const days=Math.max(1,Math.ceil((anchorDate.getTime()-todayDate.getTime())/86400000)+1);
    const daily=balance===null?null:Math.floor(Math.max(0,balance-outgoingUntilAnchor)/days);
    const projectedAfterNextPayment=balance===null||!nextPayment?null:balance-(number(nextPayment?.amount)||0);
    const shortageAfterNextPayment=projectedAfterNextPayment!==null&&projectedAfterNextPayment<0;
    const shortfallAfterNextPayment=shortageAfterNextPayment?Math.abs(projectedAfterNextPayment):0;
    const balanceAfterRequiredPayments=balance===null?null:balance-outgoingUntilAnchor;
    const shortagePossible=balanceAfterRequiredPayments!==null&&balanceAfterRequiredPayments<0;
    const shortfall=shortagePossible?Math.abs(balanceAfterRequiredPayments):0;
    const spentToday=transactions.filter(tx=>outgoing(tx)&&String(tx?.date||'')===dateKey()&&completeStatus(tx)).reduce((sum,tx)=>sum+(number(tx?.amount)||0),0);
    const goals=Array.isArray(data?.goals)?data.goals:[];
    const goal=[...goals].sort((a,b)=>(Number(b?.priority)||0)-(Number(a?.priority)||0))[0]||null;
    const goalCurrent=number(goal?.current),goalTarget=number(goal?.target),goalCheckpoint=number(goal?.checkpoint);
    const goalProgressPercent=goalTarget!==null&&goalTarget>0?Math.min(100,Math.max(0,Math.round((goalCurrent||0)/goalTarget*100))):null;
    const goalCheckpointProgressPercent=goalCheckpoint!==null&&goalCheckpoint>0?Math.min(100,Math.max(0,Math.round((goalCurrent||0)/goalCheckpoint*100))):null;
    const hasData=Boolean(data)&&(
      accounts.length>0||transactions.length>0||goals.length>0||balance!==null
    );
    const hidden=privacy?'非表示':'';
    return {
      connected:hasData||Boolean(Object.keys(legacy||{}).length),
      privacy,
      balance,
      balanceText:privacy&&balance!==null?hidden:(balance!==null?moneyText(balance):clean(legacy?.currentBalance??legacy?.balance,40)),
      income:monthly.length?income:number(legacy?.income??legacy?.monthlyIncome),
      expense:monthly.length?expense:number(legacy?.expense??legacy?.monthlyExpense??legacy?.spentThisMonth),
      daily,
      todayBudget:daily,
      dailyText:daily===null?'':(privacy?hidden:moneyText(daily)),
      spentToday,
      nextPayment,
      nextPaymentText:nextPayment?((nextPayment.date||'')+' '+clean(nextPayment.label,70)+(privacy?'':' '+moneyText(number(nextPayment.amount)||0))).trim():clean(legacy?.nextPayment,120),
      upcomingPayments,
      nextIncome,
      nextIncomeText:nextIncome?((nextIncome.date||'')+' '+clean(nextIncome.label,70)+(privacy?'':' '+moneyText(number(nextIncome.amount)||0))).trim():'',
      nextIncomeDate:clean(nextIncome?.date,10)||clean(legacy?.nextIncomeDate,10),
      upcomingIncomes,
      projectedAfterNextPayment,
      shortageAfterNextPayment,
      shortfallAfterNextPayment,
      balanceAfterRequiredPayments,
      shortagePossible,
      shortfall,
      goal,
      goalText:clean(goal?.name||goal?.label,100)||clean(legacy?.goal,100),
      goalCurrent,
      goalTarget,
      goalCheckpoint,
      goalProgressPercent,
      goalCheckpointProgressPercent,
      goalPurpose:clean(goal?.purpose,160),
      goalPriorityLabel:clean(goal?.priorityLabel,20),
      updatedAt:clean(data?.updatedAt,40)
    };
  }

  function journeySnapshot(){
    const journeysValue=read(KEYS.journeys,[]);
    const journeys=Array.isArray(journeysValue)?journeysValue:[];
    const profile=read(KEYS.profile,{});
    const journey=journeys.find(item=>item?.id===profile?.focusDomain)||journeys[0]||null;
    return {
      connected:Boolean(journey),
      id:clean(journey?.id,80),
      name:clean(journey?.name,80),
      stage:journey?.stageUnknown?'分からない':clean(journey?.stage,80),
      theme:clean(journey?.theme,160),
      quest:clean(journey?.quest,180),
      updatedAt:clean(journey?.updatedAt,40)
    };
  }

  function ideaSnapshot(){
    const primary=read(KEYS.idea,null);
    const legacy=read(KEYS.legacyIdea,{});
    const text=clean(primary?.text||primary?.memo||legacy?.text||legacy?.memo,1000);
    return {connected:Boolean(text),text,savedAt:clean(primary?.savedAt,40)};
  }

  function snapshot(){
    return {
      schema:'yos-shared-state-v1',
      generatedAt:new Date().toISOString(),
      life:lifeSnapshot(),
      money:moneySnapshot(),
      journey:journeySnapshot(),
      idea:ideaSnapshot(),
      home:read(KEYS.home,{})
    };
  }

  function refresh(source='local'){
    const data=snapshot();
    try{localStorage.setItem(KEYS.shared,JSON.stringify({...data,source}))}catch{}
    window.dispatchEvent(new CustomEvent('yos:shared-state-changed',{detail:{source,data}}));
    return data;
  }

  window.YOSSharedStateV1=Object.freeze({KEYS,snapshot,refresh});
  window.addEventListener('storage',event=>{
    if(event.key===KEYS.shared){
      window.dispatchEvent(new CustomEvent('yos:shared-state-changed',{detail:{source:'storage',data:read(KEYS.shared,null)}}));
      return;
    }
    if(WATCHED.has(event.key))refresh('storage');
  });
  window.addEventListener('hj:data-changed',()=>refresh('journey'));
  window.addEventListener('yos-life-record-saved',()=>refresh('life'));
  refresh('boot');
})();
