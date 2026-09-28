'use strict';
(()=>{
  const KEY='yos-money-v2';
  const LIFE_KEY='yos-life-v1';
  const HOME_KEY='yos-home-settings-v2';
  const LEGACY_HOME_KEY='yos-home-settings-v1';
  const TAXI_KEY='yos-taxi-settings-v2';
  const TZ='Asia/Tokyo';
  const MONEY_SHADOW_TOKEN_KEY='yos-money-shadow-token-v1';
  const MONEY_SHADOW_ENDPOINT='https://project-y-yos-ai.vercel.app/api/yos/widget?mode=money-shadow';

  const q=(sel,root=document)=>root.querySelector(sel);
  const qa=(sel,root=document)=>[...root.querySelectorAll(sel)];
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const uid=(prefix='m')=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const n=value=>Number.isFinite(Number(value))?Number(value):0;
  const clean=(value,max=100)=>String(value??'').trim().slice(0,max);
  const yen=value=>`${Math.round(n(value)).toLocaleString('ja-JP')}円`;
  const isoToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ}).format(new Date());
  const monthKey=(date=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit'}).format(date).slice(0,7);
  const parseDate=s=>{const d=new Date(`${s}T12:00:00+09:00`);return Number.isNaN(d.getTime())?null:d};
  const daysBetween=(a,b)=>Math.ceil((b.getTime()-a.getTime())/86400000);
  const isOutgoing=tx=>['expense','debt','saving','investment'].includes(tx.type);
  const isComplete=tx=>{const status=clean(tx?.status,20).toLowerCase();return tx?.completed===true||tx?.paid===true||tx?.received===true||['done','paid','completed','received'].includes(status)};
  const txSign=tx=>tx.type==='income'?1:-1;

  function defaultState(){
    return {version:2,privacy:false,accounts:[],transactions:[],recurring:[],debts:[],goals:[],assets:[],rules:{monthlyEssential:0,qualityBudget:0,emergencyMonths:1,note:'生活を壊さず、安全を確保した上で高金利返済を優先する。'},updatedAt:null};
  }
  function state(){
    const saved=read(KEY,null),base=defaultState();
    if(!saved||typeof saved!=='object')return base;
    return {...base,...saved,accounts:Array.isArray(saved.accounts)?saved.accounts:[],transactions:Array.isArray(saved.transactions)?saved.transactions:[],recurring:Array.isArray(saved.recurring)?saved.recurring:[],debts:Array.isArray(saved.debts)?saved.debts:[],goals:Array.isArray(saved.goals)?saved.goals:[],assets:Array.isArray(saved.assets)?saved.assets:[],rules:{...base.rules,...(saved.rules||{})}};
  }
  function decodeLocalImport(raw){
    try{
      if(!raw||raw.length>6000)return null;
      const normalized=raw.replace(/-/g,'+').replace(/_/g,'/');
      const padded=normalized+'='.repeat((4-normalized.length%4)%4);
      const bytes=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
      const json=new TextDecoder().decode(bytes);
      const value=JSON.parse(json);
      return value&&typeof value==='object'?value:null;
    }catch{return null}
  }
  function applyLocalImportFromHash(){
    const fragment=String(location.hash||'').replace(/^#/,'');
    const parts=fragment.split('&');
    const rawPart=parts.find(part=>part.startsWith('mi='));
    if(!rawPart)return false;
    const payload=decodeLocalImport(rawPart.slice(3));
    if(!payload||payload.v!==1||!Array.isArray(payload.ops))return false;
    let changed=false;
    for(const op of payload.ops.slice(0,20)){
      if(!op||typeof op!=='object')continue;
      if(op.kind==='account-balance'){
        const name=clean(op.name,50),type=['bank','cash','emoney'].includes(op.type)?op.type:'cash',balance=n(op.balance);
        if(!name||!Number.isFinite(balance))continue;
        let index=data.accounts.findIndex(a=>clean(a.name,50)===name);
        if(index<0&&type==='cash')index=data.accounts.findIndex(a=>a.type==='cash');
        const now=new Date().toISOString();
        if(index>=0)data.accounts=data.accounts.map((a,i)=>i===index?{...a,name:a.name||name,type:a.type||type,balance,updatedAt:now}:a);
        else data.accounts=[...data.accounts,{id:uid('acct'),type,name,balance,updatedAt:now}];
        changed=true;
      }else if(op.kind==='replace-liquid'){
        const amount=Math.max(0,n(op.amount)),now=new Date().toISOString();
        const liquidTypes=new Set(['bank','cash','emoney']);
        let cashIndex=data.accounts.findIndex(a=>a.type==='cash'||clean(a.name,50)==='現金');
        if(cashIndex<0){
          data.accounts=[...data.accounts,{id:uid('acct'),type:'cash',name:'現金',balance:amount,updatedAt:now}];
          cashIndex=data.accounts.length-1;
        }
        data.accounts=data.accounts.map((a,i)=>{
          if(i===cashIndex)return {...a,type:'cash',name:a.name||'現金',balance:amount,updatedAt:now};
          return {...a,balance:0,updatedAt:now};
        });
        changed=true;
      }else if(op.kind==='upsert-transaction'){
        const date=clean(op.date,10),label=clean(op.label,60),amount=Math.max(0,n(op.amount));
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!label||!amount)continue;
        const id=clean(op.id,80)||`import-${date}-${amount}-${label}`;
        const item={id,date,type:['income','expense','debt','saving','investment'].includes(op.type)?op.type:'expense',category:clean(op.category,30)||'other',label,amount,status:op.status==='done'?'done':'planned',imported:true};
        const exists=data.transactions.findIndex(tx=>tx.id===id||(tx.date===date&&n(tx.amount)===amount&&clean(tx.label,60)===label));
        data.transactions=exists>=0?data.transactions.map((tx,i)=>i===exists?{...tx,...item,id:tx.id||id}:tx):[...data.transactions,item];
        changed=true;
      }else if(op.kind==='mark-paid'){
        const date=clean(op.date,10),label=clean(op.label,60),amount=Math.max(0,n(op.amount));
        let tx=data.transactions.find(x=>x.date===date&&n(x.amount)===amount&&(!label||clean(x.label,60)===label))
          ||data.transactions.find(x=>x.date===date&&n(x.amount)===amount&&isOutgoing(x));
        if(tx){
          data.transactions=data.transactions.map(x=>x.id===tx.id?{...x,status:'done'}:x);changed=true;continue;
        }
        tx=expandedTransactions(date,date).find(x=>isOutgoing(x)&&x.date===date&&n(x.amount)===amount&&(!label||clean(x.label,60)===label))
          ||expandedTransactions(date,date).find(x=>isOutgoing(x)&&x.date===date&&n(x.amount)===amount);
        if(tx){
          const concrete={...tx,id:uid('tx'),status:'done',paid:true,completed:true};delete concrete.virtualRecurring;
          data.transactions=[...data.transactions,concrete];changed=true;
        }else if(date&&amount){
          data.transactions=[...data.transactions,{id:uid('tx'),date,type:'debt',category:'debt',label:label||'返済',amount,status:'done',paid:true,completed:true,imported:true}];
          changed=true;
        }
      }
    }
    if(changed){
      data.updatedAt=new Date().toISOString();
      write(KEY,data);
    }
    history.replaceState(null,'',`${location.pathname}${location.search}#money`);
    return changed;
  }
  let data=state();
  let activeTab='dashboard';
  let calendarMonth=monthKey();
  let selectedCalendarDate=isoToday();
  let transactionQuery='';
  let transactionFilter='all';
  function save(){data.updatedAt=new Date().toISOString();const saved=write(KEY,data);render();if(saved){const shared=window.YOSSharedStateV1?.refresh?.('money');void syncMoneyShadow(shared?.money)}}

  function randomToken(){
    const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function moneyShadowToken(){
    let token='';try{token=localStorage.getItem(MONEY_SHADOW_TOKEN_KEY)||''}catch{}
    if(/^[A-Za-z0-9_-]{43}$/.test(token))return token;
    token=randomToken();try{localStorage.setItem(MONEY_SHADOW_TOKEN_KEY,token)}catch{}
    return token;
  }
  const shadowTx=tx=>tx?{date:clean(tx.date,10),label:clean(tx.label,80),amount:Number.isFinite(Number(tx.amount))?Number(tx.amount):null}:null;
  function moneyShadowPayload(money){
    const value=money||window.YOSSharedStateV1?.snapshot?.()?.money||null;
    if(!value||value.connected===false)return null;
    return {
      updated_at:clean(value.updatedAt,40)||new Date().toISOString(),
      privacy:Boolean(value.privacy),
      balance:Number.isFinite(Number(value.balance))?Number(value.balance):null,
      today_usable:Number.isFinite(Number(value.daily))?Number(value.daily):null,
      spent_today:Number.isFinite(Number(value.spentToday))?Number(value.spentToday):null,
      next_payment:shadowTx(value.nextPayment),
      next_income:shadowTx(value.nextIncome),
      upcoming_payments:Array.isArray(value.upcomingPayments)?value.upcomingPayments.slice(0,5).map(shadowTx).filter(Boolean):[],
      projected_after_next_payment:Number.isFinite(Number(value.projectedAfterNextPayment))?Number(value.projectedAfterNextPayment):null,
      shortage_after_next_payment:value.shortageAfterNextPayment===true,
      shortfall_after_next_payment:Number.isFinite(Number(value.shortfallAfterNextPayment))?Number(value.shortfallAfterNextPayment):null,
      shortage_possible:value.shortagePossible===true,
      shortfall:Number.isFinite(Number(value.shortfall))?Number(value.shortfall):null
    };
  }
  async function syncMoneyShadow(money){
    if(typeof fetch!=='function'||(typeof navigator!=='undefined'&&navigator.onLine===false))return false;
    const payload=moneyShadowPayload(money);if(!payload)return false;
    try{
      const response=await fetch(MONEY_SHADOW_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json','X-YOS-Money-Token':moneyShadowToken()},
        body:JSON.stringify(payload),
        cache:'no-store',
        credentials:'omit',
        keepalive:true
      });
      return response.ok;
    }catch{return false}
  }
  async function copyMoneyAlertToken(button){
    const token=moneyShadowToken();
    try{
      await navigator.clipboard.writeText(token);
      if(button){button.textContent='コピー済み';button.disabled=true;setTimeout(()=>{button.textContent='Money Alert 接続コードをコピー';button.disabled=false},1200)}
      return true;
    }catch{
      window.prompt('この接続コードをコピーしてください',token);
      return false;
    }
  }

  function legacyMoney(){
    const life=read(LIFE_KEY,null);
    const day=life?.days?.[life?.activeLifeDate||isoToday()]||life?.days?.[isoToday()]||null;
    return life?.moneySafety||day?.money||{};
  }
  function amountNumber(value){
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(typeof value!=='string'||!value.trim())return null;
    const normalized=value.replace(/[¥￥円,\s]/g,'');
    return /^-?\d+(?:\.\d+)?$/.test(normalized)?Number(normalized):null;
  }
  const CATEGORIES=[
    ['housing','住居','⌂'],['utilities','光熱・通信','◫'],['food','食費','◉'],['daily','日用品','◇'],
    ['transport','交通','↗'],['health','健康','＋'],['entertainment','娯楽','☆'],['debt','返済','↘'],
    ['saving','貯蓄・投資','△'],['income','収入','＋'],['other','その他','•']
  ];
  const categoryInfo=id=>{const found=CATEGORIES.find(([key])=>key===id)||CATEGORIES[CATEGORIES.length-1];return {id:found[0],label:found[1],icon:found[2]}};
  function inferredCategory(tx){
    if(tx?.type==='income')return 'income';
    if(tx?.type==='debt')return 'debt';
    if(['saving','investment'].includes(tx?.type))return 'saving';
    const label=String(tx?.label||'').toLowerCase();
    if(/家賃|住宅|管理費/.test(label))return 'housing';
    if(/電気|ガス|水道|通信|携帯|ネット|icloud|chatgpt|youtube|moneyforward/.test(label))return 'utilities';
    if(/食|コンビニ|スーパー|マック|スタバ/.test(label))return 'food';
    if(/交通|電車|バス|タクシー|ガソリン|車保険/.test(label))return 'transport';
    if(/病院|薬|健康|診療/.test(label))return 'health';
    return 'other';
  }
  const transactionCategory=tx=>categoryInfo(clean(tx?.category,30)||inferredCategory(tx));
  const categorySelectOptions=selected=>CATEGORIES.map(([id,label])=>[id,label]);
  const monthKeysBetween=(start,end)=>{
    const out=[];let [y,m]=String(start).slice(0,7).split('-').map(Number);const [ey,em]=String(end).slice(0,7).split('-').map(Number);
    while(y<ey||(y===ey&&m<=em)){out.push(`${y}-${String(m).padStart(2,'0')}`);m++;if(m===13){m=1;y++}}
    return out;
  };
  function recurringForMonth(mk){
    const [year,month]=mk.split('-').map(Number),lastDay=new Date(year,month,0).getDate();
    return data.recurring.flatMap(rule=>{
      if(rule?.enabled===false||clean(rule.frequency,20)!=='monthly')return [];
      const start=clean(rule.startDate,10)||`${mk}-01`,end=clean(rule.endDate,10);
      if(mk<start.slice(0,7)||(end&&mk>end.slice(0,7)))return [];
      const day=Math.min(lastDay,Math.max(1,Math.round(n(rule.day)||Number(start.slice(8,10))||1)));
      const date=`${mk}-${String(day).padStart(2,'0')}`;
      if(date<start||(end&&date>end))return [];
      if(data.transactions.some(tx=>(tx.recurringId===rule.id&&tx.date===date)||(tx.date===date&&tx.type===rule.type&&clean(tx.label,60)===clean(rule.label,60)&&n(tx.amount)===n(rule.amount))))return [];
      return [{id:`rec-${rule.id}-${date}`,recurringId:rule.id,virtualRecurring:true,date,type:rule.type,label:rule.label,amount:rule.amount,category:rule.category,status:'planned'}];
    });
  }
  function monthTransactions(mk=calendarMonth){
    const explicit=data.transactions.filter(tx=>String(tx.date||'').slice(0,7)===mk&&clean(tx.status,20)!=='deleted');
    return [...explicit,...recurringForMonth(mk)].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id||'').localeCompare(String(b.id||'')));
  }
  function expandedTransactions(start,end){
    const explicit=data.transactions.filter(tx=>clean(tx.status,20)!=='deleted'&&String(tx.date||'')>=start&&String(tx.date||'')<=end);
    const virtual=monthKeysBetween(start,end).flatMap(recurringForMonth).filter(tx=>tx.date>=start&&tx.date<=end);
    return [...explicit,...virtual].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id||'').localeCompare(String(b.id||'')));
  }
  function dateMonthsAhead(months){
    const d=parseDate(isoToday())||new Date();d.setMonth(d.getMonth()+months);
    return new Intl.DateTimeFormat('sv-SE',{timeZone:TZ}).format(d);
  }
  function findTransactionById(id){
    return data.transactions.find(tx=>tx.id===id)||expandedTransactions(isoToday(),dateMonthsAhead(13)).find(tx=>tx.id===id)||null;
  }
  function currentLiquid(){
    if(data.accounts.length)return data.accounts.reduce((sum,a)=>sum+n(a.balance),0);
    const legacy=legacyMoney();
    const fallback=amountNumber(legacy.currentBalance??legacy.balance);
    return fallback===null?null:fallback;
  }
  function summary(mk=calendarMonth){
    const list=monthTransactions(mk);
    const income=list.filter(tx=>tx.type==='income').reduce((s,tx)=>s+n(tx.amount),0);
    const outgoing=list.filter(isOutgoing).reduce((s,tx)=>s+n(tx.amount),0);
    const legacy=legacyMoney();
    const legacyIncome=amountNumber(legacy.income??legacy.monthlyIncome);
    const legacyExpense=amountNumber(legacy.expense??legacy.monthlyExpense??legacy.spentThisMonth);
    return {income:list.length?income:(legacyIncome??0),outgoing:list.length?outgoing:(legacyExpense??0),hasData:list.length>0||legacyIncome!==null||legacyExpense!==null||currentLiquid()!==null};
  }
  function futurePlan(){
    const today=isoToday(),month=monthKey(),liquid=currentLiquid();
    const futureAll=expandedTransactions(today,dateMonthsAhead(13)).filter(tx=>!isComplete(tx)).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id||'').localeCompare(String(b.id||'')));
    const future=futureAll.filter(tx=>String(tx.date||'').slice(0,7)===month);
    const nextPayment=futureAll.find(isOutgoing)||null,nextIncome=futureAll.find(tx=>tx.type==='income')||null;
    if(liquid===null)return {liquid:null,projected:null,shortfall:null,firstBreak:null,nextPayment,nextIncome,daily:null,afterNextPayment:null,shortageAfterNextPayment:null,daysToNextPayment:nextPayment?Math.max(0,daysBetween(parseDate(today),parseDate(nextPayment.date))):null};
    let running=liquid,firstBreak=null;
    for(const tx of future){running+=txSign(tx)*n(tx.amount);if(running<0&&!firstBreak)firstBreak={tx,balance:running}}
    const endDay=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
    const anchor=nextIncome?.date||`${month}-${String(endDay).padStart(2,'0')}`;
    const outgoingUntilAnchor=futureAll.filter(tx=>isOutgoing(tx)&&tx.date<=anchor).reduce((s,tx)=>s+n(tx.amount),0);
    const days=Math.max(1,daysBetween(parseDate(today),parseDate(anchor))+1);
    const afterNextPayment=nextPayment?liquid-n(nextPayment.amount):liquid;
    return {liquid,projected:running,shortfall:firstBreak?Math.abs(firstBreak.balance):0,firstBreak,nextPayment,nextIncome,daily:Math.floor(Math.max(0,liquid-outgoingUntilAnchor)/days),afterNextPayment,shortageAfterNextPayment:nextPayment?afterNextPayment<0:false,daysToNextPayment:nextPayment?Math.max(0,daysBetween(parseDate(today),parseDate(nextPayment.date))):null};
  }
  const totalDebt=()=>data.debts.reduce((s,d)=>s+n(d.balance),0);
  function debtPlan(){
    const urgency=d=>clean(d.status,30)==='legal_notice'?3:clean(d.status,30)==='overdue'?2:1;
    const debts=data.debts.filter(d=>n(d.balance)>0||d.balanceKnown===false||clean(d.status,30)).map(d=>{
      const balanceKnown=d.balanceKnown!==false,balance=Math.max(0,n(d.balance)),apr=Math.max(0,n(d.apr)),minPayment=Math.max(0,n(d.minPayment));
      const plannedPayment=Math.max(minPayment,n(d.plannedPayment)||minPayment),monthlyRate=apr/1200,monthlyInterest=balanceKnown?balance*monthlyRate:0;
      let payoffMonths=Math.max(0,Math.round(n(d.payoffMonthsManual)))||null;
      if(balanceKnown&&balance<=0)payoffMonths=0;
      else if(balanceKnown&&!payoffMonths&&plannedPayment>0&&monthlyRate===0)payoffMonths=Math.ceil(balance/plannedPayment);
      else if(balanceKnown&&!payoffMonths&&plannedPayment>monthlyInterest&&monthlyRate>0){
        payoffMonths=Math.ceil(-Math.log(1-monthlyRate*balance/plannedPayment)/Math.log(1+monthlyRate));
        if(!Number.isFinite(payoffMonths)||payoffMonths>1200)payoffMonths=null;
      }
      const estimatedFees=Math.max(0,n(d.estimatedFees)),estimatedTotal=balanceKnown?balance+estimatedFees:null;
      return {...d,balanceKnown,balance,apr,minPayment,plannedPayment,monthlyInterest,payoffMonths,estimatedFees,estimatedTotal,urgency:urgency(d)};
    }).sort((a,b)=>b.urgency-a.urgency||Number(a.balanceKnown)-Number(b.balanceKnown)||b.apr-a.apr||b.balance-a.balance);
    const known=debts.filter(d=>d.balanceKnown);
    const total=known.reduce((s,d)=>s+d.balance,0),minimum=known.reduce((s,d)=>s+d.minPayment,0),planned=known.reduce((s,d)=>s+d.plannedPayment,0),interest=known.reduce((s,d)=>s+d.monthlyInterest,0),fees=known.reduce((s,d)=>s+d.estimatedFees,0);
    const unknownCount=debts.filter(d=>!d.balanceKnown).length,focus=debts[0]||null;
    const plan=futurePlan();
    let guidance='借金を登録すると返済順を判定します。';
    if(debts.some(d=>d.status==='legal_notice')){
      guidance='回収・訴訟予告のある未払いを最優先で管理。金額未確認は未確認のまま保持し、判明後に更新する。';
    }else if(debts.length){
      if(plan.firstBreak||currentMonthShortfall()>0)guidance='まず今月の必須支払いと最低返済を守り、延滞を避ける。追加返済は資金不足を解消してから。';
      else if(focus&&focus.apr>0)guidance=`最低返済を全件確保し、余剰は年利 ${focus.apr}% の「${clean(focus.name,20)}」から優先。`;
      else guidance='最低返済を全件確保。手数料・金利・期限を見ながら追加返済先を決める。';
    }
    return {debts,total,minimum,planned,interest,fees,unknownCount,focus,guidance};
  }
  const emergencyGoal=()=>data.goals.find(g=>g.type==='emergency')||null;
  const primaryGoal=()=>[...data.goals].sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0))[0]||null;
  const netWorth=()=> (currentLiquid()??0)+data.assets.reduce((s,a)=>s+n(a.value),0)-totalDebt();
  const signedYen=value=>`${n(value)>=0?'+':'−'}${yen(Math.abs(n(value)))}`;
  const formatMD=date=>{const d=parseDate(date);return d?new Intl.DateTimeFormat('ja-JP',{timeZone:TZ,month:'numeric',day:'numeric'}).format(d):date};
  const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const privacyAmount=value=>data.privacy?'••••••':yen(value);
  const compactAmount=value=>{const v=Math.abs(n(value));return v>=10000?`${Math.round(v/1000)/10}万`:Math.round(v).toLocaleString('ja-JP')};

  function moneyStatus(plan){
    if(plan.liquid===null)return {tone:'neutral',label:'現在地を入力',title:'まず残高を登録しよう',text:'口座・電子マネー残高を登録すると、支払日までの資金繰りを自動計算します。'};
    if(plan.firstBreak){const tx=plan.firstBreak.tx;return {tone:'danger',label:'赤字予測',title:`${formatMD(tx.date)}「${clean(tx.label,18)}」で不足`,text:`このままでは ${data.privacy?'金額非表示':yen(Math.abs(plan.firstBreak.balance))} 足りません。支出削減または追加収入が必要です。`}}
    return {tone:'safe',label:'黒字見込み',title:`月末予測 ${data.privacy?'非表示':signedYen(plan.projected)}`,text:plan.nextPayment?`次の支払いまであと${plan.daysToNextPayment}日。現在の予定なら資金は足りる見込みです。`:'今月の登録済み支払いでは赤字予測はありません。'};
  }

  function installShell(){
    const host=document.getElementById('moneyPage');
    if(!host||host.dataset.moneyV2==='1')return host;
    host.dataset.moneyV2='1';
    host.innerHTML=`<header class="money5-header">
      <button class="money5-brand" type="button" data-money-action="back-home" aria-label="MY WAYへ戻る"><span class="money5-brand-mark" aria-hidden="true">¥</span><span><strong>MY MONEY</strong><small>by YOS</small></span></button>
      <div class="money5-header-actions"><button class="money5-notify" type="button" data-money-action="verify-data" aria-label="Moneyの通知・実データ確認"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 9.5a5.2 5.2 0 0 1 10.4 0v3.2l1.5 2.2H5.3l1.5-2.2V9.5Zm3 7.4a2.3 2.3 0 0 0 4.4 0"/></svg><i aria-hidden="true"></i></button><button id="moneyMenuButton" type="button" aria-label="メニューを開く">•••</button></div>
    </header>
    <div id="money2Body" class="money5-body"></div>
    <button id="moneyQuickAdd" class="money2-fab" type="button" aria-label="入出金を追加">＋</button>
    <nav class="money5-subnav" aria-label="MY MONEY">
      <button data-money-tab="dashboard" class="active"><span aria-hidden="true">⌂</span><b>ホーム</b></button>
      <button data-money-tab="transactions"><span aria-hidden="true">≡</span><b>取引</b></button>
      <button data-money-tab="calendar"><span aria-hidden="true">□</span><b>カレンダー</b></button>
      <button data-money-tab="categories"><span aria-hidden="true">◫</span><b>カテゴリー</b></button>
      <button data-money-tab="rules"><span aria-hidden="true">◇</span><b>計画</b></button>
      <button data-money-tab="assets"><span aria-hidden="true">△</span><b>資産</b></button>
    </nav>
    <dialog id="money2Dialog" class="money2-dialog"><form method="dialog" id="money2DialogForm"></form></dialog>`;
    host.addEventListener('click',handleClick);
    host.addEventListener('input',handleInput);
    return host;
  }
  function render(){
    const host=installShell();if(!host)return;
    const body=document.getElementById('money2Body');if(!body)return;
    qa('[data-money-tab]',host).forEach(btn=>btn.classList.toggle('active',btn.dataset.moneyTab===activeTab));
    body.innerHTML=activeTab==='dashboard'?renderDashboard():activeTab==='transactions'?renderTransactions():activeTab==='calendar'?renderCalendarPage():activeTab==='categories'?renderCategories():activeTab==='rules'?renderRules():renderAssets();
  }
  function transactionRow(tx){
    const cat=transactionCategory(tx),incoming=tx.type==='income',done=isComplete(tx);
    const action=tx.virtualRecurring?'edit-recurring':'edit-entry';
    return `<button class="money3-transaction ${done?'done':''}" type="button" data-money-action="${action}" data-id="${escapeHtml(tx.virtualRecurring?tx.recurringId:tx.id)}"><span class="money3-cat" aria-hidden="true">${escapeHtml(cat.icon)}</span><span class="money3-tx-copy"><strong>${escapeHtml(tx.label||'名称未設定')}</strong><small>${formatMD(tx.date)} ・ ${escapeHtml(cat.label)}${tx.virtualRecurring?' ・ 定期':''}${done?' ・ 完了':''}</small></span><b class="${incoming?'income':'expense'}">${incoming?'+':'−'}${data.privacy?'••••':yen(tx.amount)}</b><i>›</i></button>`;
  }
  function currentMonthShortfall(){
    const liquid=currentLiquid();if(liquid===null)return null;
    const remaining=monthTransactions(monthKey()).filter(tx=>isOutgoing(tx)&&!isComplete(tx)).reduce((sum,tx)=>sum+n(tx.amount),0);
    return Math.max(0,remaining-liquid);
  }
  function moneyAmount(value,{signed=false,approx=false}={}){
    if(data.privacy)return '••••••';
    const amount=Math.round(n(value)).toLocaleString('ja-JP');
    return `${approx?'約':''}${signed?(n(value)>=0?'+':'−'):''}¥${amount}`;
  }
  function nextMoneyCard(kind,tx){
    const payment=kind==='payment',emptyTitle=payment?'次の支払い':'次の入金';
    if(!tx)return `<article class="money5-next-card ${payment?'payment':'income'} empty"><small>${emptyTitle}</small><strong>予定なし</strong><p>—</p></article>`;
    const approx=!payment&&Boolean(tx.amountApproximate||tx.certainty==='見込み');
    return `<article class="money5-next-card ${payment?'payment':'income'}"><small>${emptyTitle}</small><time>${escapeHtml(formatMD(tx.date))}</time><strong>${escapeHtml(tx.label||emptyTitle)}</strong><b>${moneyAmount(tx.amount,{approx})}</b></article>`;
  }
  function renderFeatureEntrances(){
    return `<section class="money5-feature-grid" aria-label="Money機能">
      <button type="button" data-money-tab-jump="transactions"><span>≡</span><b>取引</b></button>
      <button type="button" data-money-tab-jump="calendar"><span>□</span><b>カレンダー</b></button>
      <button type="button" data-money-tab-jump="categories"><span>◫</span><b>カテゴリー</b></button>
      <button type="button" data-money-tab-jump="rules"><span>◇</span><b>計画</b></button>
      <button type="button" data-money-tab-jump="assets"><span>△</span><b>資産</b></button>
    </section>`;
  }
  function renderEmergencyFund(){
    const goal=emergencyGoal();
    if(!goal)return `<section class="money5-defense"><header><div><small>SAFETY FUND</small><h2>生活防衛費</h2></div><button type="button" data-money-action="add-goal">目標設定</button></header><strong>未設定</strong></section>`;
    const target=Math.max(1,n(goal.target)),current=Math.max(0,n(goal.current)),pct=Math.min(100,Math.max(0,Math.round(current/target*100)));
    return `<section class="money5-defense"><header><div><small>SAFETY FUND</small><h2>生活防衛費</h2></div><button type="button" data-money-action="edit-goal" data-id="${escapeHtml(goal.id)}">目標設定</button></header><div class="money5-defense-value"><strong>${pct}%</strong><span>${data.privacy?'••••••':`${yen(current)} / ${yen(target)}`}</span></div><div class="money5-defense-bar"><i style="width:${pct}%"></i></div></section>`;
  }
  function renderDashboard(){
    const s=summary(monthKey()),plan=futurePlan(),monthShortfall=currentMonthShortfall(),goal=emergencyGoal();
    const monthNet=s.income-s.outgoing;
    const advice=monthShortfall>0
      ?`${plan.nextPayment?`${formatMD(plan.nextPayment.date)}に${clean(plan.nextPayment.label,22)} ${data.privacy?'金額非表示':yen(plan.nextPayment.amount)} の支払い。 `:''}月末まで ${data.privacy?'不足見込み':yen(monthShortfall)+'不足見込み'}。`
      :buildAdvice(plan,goal);
    const status=monthShortfall>0?'不足見込み':monthNet>=0?'黒字見込み':'要確認';
    const target=goal?Math.max(1,n(goal.target)):0,current=goal?Math.max(0,n(goal.current)):0,pct=goal?Math.min(100,Math.max(0,Math.round(current/target*100))):0;
    const remainingThisMonth=monthTransactions(monthKey()).filter(tx=>isOutgoing(tx)&&!isComplete(tx)).reduce((sum,tx)=>sum+n(tx.amount),0);
    const spendable=plan.liquid===null?null:Math.max(0,plan.liquid-remainingThisMonth);
    const today=parseDate(isoToday()),monthEnd=new Date(Number(monthKey().slice(0,4)),Number(monthKey().slice(5,7)),0,12);
    const daysLeft=Math.max(1,daysBetween(today,monthEnd)+1),dayBudget=spendable===null?null:Math.floor(spendable/daysLeft);
    const warning=plan.firstBreak?`${formatMD(plan.firstBreak.tx.date)}に残高不足`:monthShortfall>0?'月末までに資金不足':'登録済み予定では残高不足なし';
    return `<section class="money6-home money13-home">
      <header class="money6-balance">
        <div><small>今使えるお金</small><strong>${plan.liquid===null?'未設定':moneyAmount(plan.liquid)}</strong></div>
        <span class="${monthShortfall>0?'danger':'safe'}">${status}</span>
      </header>
      <div class="money10-budget">
        <div class="hero"><small>今月あと使える</small><b>${spendable===null?'—':moneyAmount(spendable)}</b></div>
        <div><small>1日あたり</small><b>${dayBudget===null?'—':moneyAmount(dayBudget)}</b></div>
      </div>
      <div class="money6-timeline">
        ${plan.nextPayment?`<div class="money13-next-payment-wrap"><button class="money13-next-payment" type="button" data-money-action="payment" data-id="${escapeHtml(plan.nextPayment.id)}"><small>次の支払い</small><b>${escapeHtml(formatMD(plan.nextPayment.date))}　${escapeHtml(plan.nextPayment.label||'支払い')}</b><strong class="expense">${moneyAmount(plan.nextPayment.amount)}</strong></button><button class="money13-paid" type="button" data-money-action="mark-paid" data-id="${escapeHtml(plan.nextPayment.id)}">支払済み</button></div>`:'<div><small>次の支払い</small><b>予定なし</b></div>'}
        <span>→</span>
        <div><small>次の入金</small>${plan.nextIncome?`<b>${escapeHtml(formatMD(plan.nextIncome.date))}　${escapeHtml(plan.nextIncome.label||'入金')}</b><strong class="income">${moneyAmount(plan.nextIncome.amount,{approx:Boolean(plan.nextIncome.amountApproximate||plan.nextIncome.certainty==='見込み')})}</strong>`:'<b>予定なし</b>'}</div>
      </div>
      <div class="money6-divider"></div>
      <div class="money6-metrics">
        <div class="danger"><small>月末不足</small><b>${monthShortfall===null?'—':monthShortfall>0?yen(monthShortfall)+'不足':'0円'}</b></div>
        <div class="${monthNet>=0?'income':'danger'}"><small>今月収支</small><b>${s.hasData?moneyAmount(monthNet,{signed:true}):'—'}</b></div>
        <div class="${plan.firstBreak||monthShortfall>0?'danger':'income'}"><small>未来予測</small><b class="text">${escapeHtml(warning)}</b></div>
      </div>
      <div class="money6-divider"></div>
      <div class="money6-action">
        <span class="money5-yos-mark">YOS</span><div><small>今いちばん重要</small><p>${escapeHtml(advice).replace(/\n/g,'<br>')}</p></div>
      </div>
      <div class="money6-divider"></div>
      <button class="money6-safety" type="button" data-money-action="${goal?'edit-goal':'add-goal'}" ${goal?`data-id="${escapeHtml(goal.id)}"`:''}>
        <div><small>生活防衛費</small><b>${goal?`${pct}%　${data.privacy?'••••••':yen(current)+' / '+yen(target)}`:'未設定'}</b></div><span>›</span>
      </button>
      <button class="money6-assets" type="button" data-money-tab-jump="assets">口座・資産の内訳 <span>›</span></button>
    </section>`;
  }
  function renderTransactions(){
    let list=monthTransactions(calendarMonth).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id||'').localeCompare(String(a.id||'')));
    if(transactionFilter==='income')list=list.filter(tx=>tx.type==='income');
    if(transactionFilter==='expense')list=list.filter(tx=>tx.type!=='income');
    if(transactionFilter==='recurring')list=list.filter(tx=>tx.virtualRecurring||tx.recurringId);
    const qv=transactionQuery.trim().toLowerCase();
    if(qv)list=list.filter(tx=>String(tx.label||'').toLowerCase().includes(qv)||transactionCategory(tx).label.includes(transactionQuery.trim()));
    const [year,month]=calendarMonth.split('-').map(Number);
    return `<section class="money3-ledger-head"><div class="money3-month-nav"><button type="button" data-money-action="prev-month">‹</button><strong>${year}年${month}月</strong><button type="button" data-money-action="next-month">›</button></div><label class="money3-search"><span>⌕</span><input data-money-search type="search" value="${escapeHtml(transactionQuery)}" placeholder="取引を検索"></label><div class="money3-filters">${[['all','すべて'],['expense','支出'],['income','収入'],['recurring','定期']].map(([id,label])=>`<button type="button" data-money-filter="${id}" class="${transactionFilter===id?'active':''}">${label}</button>`).join('')}</div></section>
    <section class="money3-panel"><header><div><small>LEDGER</small><h2>取引履歴</h2></div><button type="button" data-money-action="add-entry">＋追加</button></header><div class="money3-feed">${list.length?list.map(transactionRow).join(''):'<p class="money3-empty">条件に合う取引はありません。</p>'}</div></section>`;
  }
  function renderCalendar(){
    const [year,month]=calendarMonth.split('-').map(Number),first=new Date(year,month-1,1),last=new Date(year,month,0),start=(first.getDay()+6)%7,today=isoToday(),txs=monthTransactions(),cells=[];
    for(let i=0;i<start;i++)cells.push('<div class="money2-day empty"></div>');
    for(let day=1;day<=last.getDate();day++){
      const date=`${calendarMonth}-${String(day).padStart(2,'0')}`,all=txs.filter(tx=>tx.date===date),items=all.slice(0,2);
      const chips=items.map(tx=>`<span class="money2-chip ${tx.type} ${isComplete(tx)?'done':''}">${tx.type==='income'?'+':'−'}${data.privacy?'••':compactAmount(tx.amount)}</span>`).join('');
      cells.push(`<button class="money2-day ${date===today?'today':''}" data-money-date="${date}" type="button"><b>${day}</b>${chips}${all.length>items.length?`<i>+${all.length-items.length}</i>`:''}</button>`);
    }
    return `<section class="money2-calendar-card"><header><button type="button" data-money-action="prev-month">‹</button><div><small>資金カレンダー</small><strong>${year}年${month}月</strong></div><button type="button" data-money-action="next-month">›</button></header><div class="money2-week"><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span></div><div class="money2-calendar">${cells.join('')}</div><footer><span><i class="income"></i>収入</span><span><i class="expense"></i>支出</span><button type="button" data-money-action="add-entry">＋ 入出金</button></footer></section>`;
  }
  function renderNextPayment(tx,days){
    if(!tx)return `<section class="money2-row-card empty"><div><small>次の支払い</small><strong>予定なし</strong><p>カレンダーに支払い予定を追加できます。</p></div><button data-money-action="add-entry" type="button">追加</button></section>`;
    return `<section class="money2-row-card"><div><small>次の支払いまで ${days}日</small><strong>${escapeHtml(tx.label||'支払い')} ${data.privacy?'••••••':yen(tx.amount)}</strong><p>${formatMD(tx.date)} ${isComplete(tx)?'支払済み':'支払い予定'}</p></div><button data-money-action="payment" data-id="${escapeHtml(tx.id)}" type="button">${isComplete(tx)?'確認':'支払う'}</button></section>`;
  }
  function renderGoal(goal){
    if(!goal)return `<section class="money2-goal-card empty"><div><small>今の目標</small><strong>まだ設定されていません</strong><p>防衛資金・返済・欲しいもの・投資などを設定できます。</p></div><button type="button" data-money-action="add-goal">目標を作る</button></section>`;
    const target=Math.max(1,n(goal.target)),current=n(goal.current),pct=Math.min(100,Math.max(0,Math.round(current/target*100)));
    const checkpoint=Math.max(0,n(goal.checkpoint));
    const amountLine=data.privacy?'積立額は非表示':`${compactAmount(current)}円 / ${compactAmount(target)}円${checkpoint?` ・ 第1 ${compactAmount(Math.min(current,checkpoint))}円 / ${compactAmount(checkpoint)}円`:''}`;
    const purpose=clean(goal.purpose,160);
    return `<section class="money2-goal-card"${purpose?` title="${escapeHtml(purpose)}"`:''}><header><div><small>今の目標</small><strong>${escapeHtml(goal.name)}</strong></div><span>${pct}%</span></header><div class="money2-progress"><i style="width:${pct}%"></i></div><p>${amountLine}${goal.deadline?` ・ 期限 ${formatMD(goal.deadline)}`:''}</p></section>`;
  }
  function renderDataReadiness(plan){
    const ready=plan.daily!==null&&Boolean(plan.nextPayment)&&Boolean(plan.nextIncome)&&plan.afterNextPayment!==null;
    const payment=plan.nextPayment?`${formatMD(plan.nextPayment.date)} ${clean(plan.nextPayment.label,24)}`:'未入力';
    const income=plan.nextIncome?`${formatMD(plan.nextIncome.date)} ${clean(plan.nextIncome.label,24)}`:'未入力';
    return `<section class="money2-row-card ${ready?'':'empty'}"><div><small>依存機能の実データ接続</small><strong>${ready?'準備OK':'未入力あり'}</strong><p>支払い ${escapeHtml(payment)} ／ 入金 ${escapeHtml(income)}</p></div><button type="button" data-money-action="verify-data">確認</button></section>`;
  }
  function buildAdvice(plan,goal){
    if(plan.liquid===null)return 'まず現在の口座・電子マネー残高を登録すると、赤字になる日と1日予算を計算できます。';
    if(plan.firstBreak)return `${formatMD(plan.firstBreak.tx.date)}の「${clean(plan.firstBreak.tx.label,20)}」で資金不足予測です。不足分を埋める収入か、同額以上の支出調整を先に考えましょう。`;
    const debt=[...data.debts].sort((a,b)=>n(b.apr)-n(a.apr))[0];
    if(debt&&n(debt.balance)>0)return `生活に必要なお金を確保した上で、現在は金利${n(debt.apr)}%の「${clean(debt.name,16)}」を優先返済する設定が合理的です。生活の質を守る予算はルール画面で調整できます。`;
    if(goal)return `今月は赤字予測なし。余剰は「${clean(goal.name,18)}」への配分を検討できます。目標変更時はYOSと配分を見直せます。`;
    return '今月は登録済み予定では赤字予測なし。次に「守るお金」と目標を設定すると、余剰資金の行き先まで判断できます。';
  }
  function renderCalendarPage(){
    const list=monthTransactions(calendarMonth),dayItems=list.filter(tx=>tx.date===selectedCalendarDate).sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));
    const income=list.filter(tx=>tx.type==='income').reduce((s,tx)=>s+n(tx.amount),0);
    const outgoing=list.filter(isOutgoing).reduce((s,tx)=>s+n(tx.amount),0);
    const fixed=list.filter(tx=>isOutgoing(tx)&&(tx.virtualRecurring||tx.recurringId)).reduce((s,tx)=>s+n(tx.amount),0);
    const variable=Math.max(0,outgoing-fixed),net=income-outgoing;
    const remaining=list.filter(tx=>isOutgoing(tx)&&!isComplete(tx)&&String(tx.date||'')>=isoToday()).reduce((s,tx)=>s+n(tx.amount),0);
    const liquid=currentLiquid(),spendable=liquid===null?null:Math.max(0,liquid-remaining);
    const today=parseDate(isoToday()),[cy,cm]=calendarMonth.split('-').map(Number),monthEnd=new Date(cy,cm,0,12),daysLeft=calendarMonth===monthKey()?Math.max(1,daysBetween(today,monthEnd)+1):new Date(cy,cm,0).getDate();
    const daily=spendable===null?null:Math.floor(spendable/daysLeft);
    const next=list.filter(tx=>!isComplete(tx)&&String(tx.date||'')>=isoToday()).sort((a,b)=>String(a.date).localeCompare(String(b.date)))[0]||null;
    return `<section class="money5-page-title"><div><small>CALENDAR</small><h1>カレンダー</h1><p>支払い・入金・定期収支を月で確認。</p></div></section>
      <section class="money5-panel money5-calendar-page">${renderCalendar()}</section>
      <section class="money8-month-summary">
        <div class="primary"><small>今月あと使える</small><strong>${spendable===null?'—':moneyAmount(spendable)}</strong></div>
        <div class="primary"><small>1日あたり</small><strong>${daily===null?'—':moneyAmount(daily)}</strong></div>
        <div class="income"><small>今月の収入</small><strong>${moneyAmount(income)}</strong></div>
        <div><small>固定支出</small><strong>${moneyAmount(fixed)}</strong></div>
        <div><small>変動支出</small><strong>${moneyAmount(variable)}</strong></div>
        <div class="${net>=0?'income':'danger'}"><small>今月収支</small><strong>${moneyAmount(net,{signed:true})}</strong></div>
        <div><small>残りの支払い</small><strong>${moneyAmount(remaining)}</strong></div>
        <div><small>次の予定</small><strong class="text">${next?`${escapeHtml(formatMD(next.date))} ${escapeHtml(next.label||'予定')}`:'予定なし'}</strong></div>
      </section>
      <section class="money5-panel money7-selected"><header><div><small>SELECTED DAY</small><h2>${escapeHtml(formatMD(selectedCalendarDate))}</h2></div><button type="button" data-money-action="add-selected-date">＋取引</button></header><div class="money3-feed">${dayItems.length?dayItems.map(transactionRow).join(''):'<p class="money3-empty">この日の取引はありません。</p>'}</div></section>`;
  }
  function previousMonthKey(mk){
    const [y,m]=mk.split('-').map(Number),d=new Date(y,m-2,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function renderCategories(){
    const list=monthTransactions(calendarMonth).filter(isOutgoing),total=list.reduce((sum,tx)=>sum+n(tx.amount),0);
    const previous=monthTransactions(previousMonthKey(calendarMonth)).filter(isOutgoing),prevTotal=previous.reduce((sum,tx)=>sum+n(tx.amount),0);
    const delta=prevTotal>0?Math.round((total-prevTotal)/prevTotal*100):null;
    const grouped=CATEGORIES.filter(([id])=>id!=='income').map(([id,label,icon])=>{
      const amount=list.filter(tx=>transactionCategory(tx).id===id).reduce((sum,tx)=>sum+n(tx.amount),0);
      return {id,label,icon,amount,pct:total>0?Math.round(amount/total*100):0};
    }).filter(item=>item.amount>0).sort((a,b)=>b.amount-a.amount);
    const [year,month]=calendarMonth.split('-').map(Number);
    return `<section class="money5-page-title"><div><small>CATEGORIES</small><h1>カテゴリー</h1><p>未設定の既存取引も内容から表示分類します。</p></div><div class="money3-month-nav"><button type="button" data-money-action="prev-month">‹</button><strong>${year}年${month}月</strong><button type="button" data-money-action="next-month">›</button></div></section>
      <section class="money5-category-summary"><div><small>月合計</small><strong>${data.privacy?'••••••':yen(total)}</strong></div><div><small>先月比</small><strong class="${delta!==null&&delta>0?'danger':delta!==null&&delta<0?'income':''}">${delta===null?'—':`${delta>0?'+':''}${delta}%`}</strong></div></section>
      <section class="money5-panel"><header><div><small>BREAKDOWN</small><h2>カテゴリー別支出</h2></div><span>予定含む</span></header><div class="money5-category-list">${grouped.length?grouped.map(item=>`<article><span class="money5-category-icon">${escapeHtml(item.icon)}</span><div><header><strong>${escapeHtml(item.label)}</strong><b>${data.privacy?'••••':yen(item.amount)}</b></header><div class="money5-category-bar"><i style="width:${item.pct}%"></i></div><small>${item.pct}%</small></div></article>`).join(''):'<p class="money3-empty">この月の支出はありません。</p>'}</div></section>`;
  }
  function renderAccounts(){
    const total=currentLiquid();
    const rows=data.accounts.length?data.accounts.map(a=>`<button class="money2-account" type="button" data-money-action="edit-account" data-id="${escapeHtml(a.id)}"><span>${accountIcon(a.type)}</span><div><strong>${escapeHtml(a.name)}</strong><small>${accountType(a.type)}${a.updatedAt?` ・ ${formatUpdated(a.updatedAt)}`:''}</small></div><b>${privacyAmount(a.balance)}</b></button>`).join(''):`<div class="money2-empty">銀行口座・現金・電子マネーを登録すると、合計残高と資金繰りに反映されます。</div>`;
    const payments=data.transactions.filter(tx=>isOutgoing(tx)&&!isComplete(tx)&&tx.date>=isoToday()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
    return `<section class="money2-account-total"><small>使えるお金の現在地</small><strong>${total===null?'未設定':privacyAmount(total)}</strong><div><button type="button" data-money-action="refresh-balances">↻ 残高を更新</button><button type="button" data-money-action="add-account">＋ 口座</button></div><p>現在は端末内で手動更新。金融API連携用の入口はこのまま残します。</p></section><section class="money2-list-card"><header><h2>口座・電子マネー</h2><span>${data.accounts.length}件</span></header>${rows}</section><section class="money2-list-card"><header><h2>これからの支払い</h2><button type="button" data-money-action="add-entry">＋追加</button></header>${payments.length?payments.map(tx=>`<div class="money2-payment-line"><div><strong>${formatMD(tx.date)} ${escapeHtml(tx.label)}</strong><small>${tx.type==='debt'?'返済':'支払い予定'}</small></div><b>${data.privacy?'••••':yen(tx.amount)}</b><button type="button" data-money-action="payment" data-id="${escapeHtml(tx.id)}">支払う</button></div>`).join(''):'<div class="money2-empty">未払い予定はありません。</div>'}</section>`;
  }
  const accountIcon=type=>({bank:'▣',cash:'◯',emoney:'◈'}[type]||'▣');
  const accountType=type=>({bank:'銀行',cash:'現金',emoney:'電子マネー'}[type]||'その他');
  function formatUpdated(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:TZ}).format(d)}
  function recurringSummary(){
    const active=data.recurring.filter(rule=>rule?.enabled!==false&&clean(rule.frequency,20)==='monthly');
    const incomeRules=active.filter(rule=>rule.type==='income');
    const outgoingRules=active.filter(isOutgoing);
    const income=incomeRules.reduce((sum,rule)=>sum+n(rule.amount),0);
    const outgoing=outgoingRules.reduce((sum,rule)=>sum+n(rule.amount),0);
    const net=income-outgoing;
    const today=isoToday(),candidates=[];
    for(const rule of outgoingRules){
      for(const mk of monthKeysBetween(monthKey(),dateMonthsAhead(2).slice(0,7))){
        const [year,month]=mk.split('-').map(Number),lastDay=new Date(year,month,0).getDate();
        const day=Math.min(lastDay,Math.max(1,Math.round(n(rule.day)||1)));
        const date=`${mk}-${String(day).padStart(2,'0')}`;
        const start=clean(rule.startDate,10),end=clean(rule.endDate,10);
        if(date<today||(start&&date<start)||(end&&date>end))continue;
        candidates.push({...rule,nextDate:date});
        break;
      }
    }
    candidates.sort((a,b)=>String(a.nextDate).localeCompare(String(b.nextDate))||n(b.amount)-n(a.amount));
    return {active,incomeRules,outgoingRules,income,outgoing,net,nextOutgoing:candidates[0]||null};
  }

  function renderRules(){
    const dp=debtPlan(),fixed=recurringSummary();
    const recurringRow=rule=>{
      const paused=rule?.enabled===false;
      const meta=[`毎月${Math.max(1,Math.round(n(rule.day)||1))}日`,transactionCategory(rule).label,paused?'一時停止':'有効'].join(' ・ ');
      return `<button class="money12-fixed-row ${paused?'paused':''}" type="button" data-money-action="edit-recurring" data-id="${escapeHtml(rule.id)}"><div><strong>${escapeHtml(rule.label)}</strong><small>${escapeHtml(meta)}</small></div><b class="${rule.type==='income'?'income':'expense'}">${rule.type==='income'?'+':'−'}${data.privacy?'••••':yen(rule.amount)}</b><span>›</span></button>`;
    };
    const activeIncome=data.recurring.filter(rule=>rule?.enabled!==false&&rule.type==='income');
    const activeOutgoing=data.recurring.filter(rule=>rule?.enabled!==false&&isOutgoing(rule));
    const paused=data.recurring.filter(rule=>rule?.enabled===false);
    const goals=data.goals.map(g=>{const target=Math.max(1,n(g.target)),current=n(g.current),pct=Math.min(100,Math.round(current/target*100)),checkpoint=Math.max(0,n(g.checkpoint)),priority=clean(g.priorityLabel,10)||(n(g.priority)>=4?'高':n(g.priority)>=2?'中':'低');const details=[goalType(g.type),data.privacy?'金額非表示':`${yen(current)} / ${yen(target)}`,checkpoint?`第1チェック ${data.privacy?'非表示':yen(checkpoint)}`:'',`優先度 ${priority}`,g.deadline?`${formatMD(g.deadline)}まで`:''].filter(Boolean).join(' ・ ');return `<button class="money2-rule-row" type="button" data-money-action="edit-goal" data-id="${escapeHtml(g.id)}"><div><strong>${escapeHtml(g.name)}</strong><small>${escapeHtml(details)}</small></div><span>${pct}%</span></button>`}).join('');
    const debts=dp.debts.map((d,index)=>{
      const payoff=!d.balanceKnown?'金額未確認':d.payoffMonths===0?'完済':d.payoffMonths?`${d.payoffMonthsManual?'シミュレーション':'概算'} ${d.payoffMonths}回`:(d.plannedPayment<=d.monthlyInterest&&d.apr>0?'返済額不足':'期間未算出');
      const due=d.dueDate?`期限 ${formatMD(d.dueDate)} ・ `:(d.dueDay?`毎月${Math.min(31,Math.max(1,Math.round(n(d.dueDay))))}日 ・ `:'');
      const fees=d.estimatedFees?` ・ 手数料見込 ${data.privacy?'非表示':yen(d.estimatedFees)}`:'';
      const status=d.status==='legal_notice'?'回収・訴訟予告':d.status==='overdue'?'期限超過':'返済中';
      const verified=d.verification==='confirmed'?'確認済み':d.verification==='estimate'?'概算':d.verification==='self_reported'?'本人申告':'未確認';
      return `<button class="money11-debt-row" type="button" data-money-action="edit-debt" data-id="${escapeHtml(d.id)}">
        <div class="money11-debt-rank">${index+1}</div>
        <div><strong>${escapeHtml(d.name)} <em class="money11-status ${escapeHtml(d.status||'active')}">${status}</em></strong><small>${verified} ・ ${due}${d.apr>0?'年利 '+d.apr+'% ・ ':''}${d.plannedPayment>0?'月 '+(data.privacy?'非表示':yen(d.plannedPayment))+' ・ ':''}${payoff}${fees}</small></div>
        <b>${data.privacy?'••••':(d.balanceKnown?yen(d.balance):'未確認')}</b>
      </button>`;
    }).join('');
    const nextFixed=fixed.nextOutgoing?`${formatMD(fixed.nextOutgoing.nextDate)} ${clean(fixed.nextOutgoing.label,18)} ${data.privacy?'金額非表示':yen(fixed.nextOutgoing.amount)}`:'予定なし';
    return `<section class="money12-fixed">
      <header><div><small>AUTO</small><h2>毎月決まってる収支</h2></div><button type="button" data-money-action="add-recurring">＋追加</button></header>
      <div class="money12-fixed-summary">
        <div class="income"><small>固定収入 / 月</small><strong>${data.privacy?'••••':yen(fixed.income)}</strong></div>
        <div class="expense"><small>固定支出 / 月</small><strong>${data.privacy?'••••':yen(fixed.outgoing)}</strong></div>
        <div class="${fixed.net>=0?'income':'expense'}"><small>固定収支差額</small><strong>${data.privacy?'••••':signedYen(fixed.net)}</strong></div>
        <div><small>次の固定支出</small><strong class="text">${escapeHtml(nextFixed)}</strong></div>
      </div>
      <div class="money12-fixed-group"><h3>固定収入</h3>${activeIncome.length?activeIncome.map(recurringRow).join(''):'<p class="money3-empty">登録なし</p>'}</div>
      <div class="money12-fixed-group"><h3>固定支出</h3>${activeOutgoing.length?activeOutgoing.map(recurringRow).join(''):'<p class="money3-empty">登録なし</p>'}</div>
      ${paused.length?`<div class="money12-fixed-group"><h3>一時停止</h3>${paused.map(recurringRow).join('')}</div>`:''}
    </section>
    <section class="money3-panel"><header><div><small>GOALS</small><h2>目標</h2></div><button type="button" data-money-action="add-goal">＋追加</button></header>${goals||'<p class="money3-empty">防衛資金・返済・欲しいものを設定できます。</p>'}</section>
    <section class="money11-debt">
      <header><div><small>DEBT PLAN</small><h2>借金・返済</h2></div><button type="button" data-money-action="add-debt">＋追加</button></header>
      <div class="money11-debt-summary">
        <div><small>確認済み・概算残高</small><strong>${dp.total?privacyAmount(dp.total):'¥0'}</strong></div>
        <div><small>金額未確認</small><strong>${dp.unknownCount}件</strong></div>
        <div><small>返済予定 / 月</small><strong>${data.privacy?'••••':yen(dp.planned)}</strong></div>
        <div><small>手数料見込</small><strong>${data.privacy?'••••':yen(dp.fees)}</strong></div>
      </div>
      <div class="money11-guidance"><span class="money5-yos-mark">YOS</span><div><small>返済方針</small><p>${escapeHtml(dp.guidance)}</p></div></div>
      <div class="money11-debt-list">${debts||'<p class="money3-empty">残高・金利・最低返済・支払日を登録すると、返済優先順位と完済目安を出せます。</p>'}</div>
    </section>
    <section class="money2-settings-summary"><div><small>最低生活費 / 月</small><strong>${data.rules.monthlyEssential?privacyAmount(data.rules.monthlyEssential):'未設定'}</strong></div><div><small>生活の質を守る予算 / 月</small><strong>${data.rules.qualityBudget?privacyAmount(data.rules.qualityBudget):'未設定'}</strong></div><div><small>防衛資金</small><strong>${n(data.rules.emergencyMonths)}か月分</strong></div><button type="button" data-money-action="edit-rules">基本設定を変更</button></section>`;
  }
    const goalType=type=>({emergency:'生活防衛資金',purchase:'欲しいもの',saving:'貯金',investment:'投資',debt:'返済目標'}[type]||'目標');
  function renderAssets(){
    const debt=totalDebt(),liquid=currentLiquid()??0,assets=data.assets.reduce((sum,a)=>sum+n(a.value),0),net=netWorth();
    const accounts=data.accounts.length?data.accounts.map(a=>`<button class="money2-account" type="button" data-money-action="edit-account" data-id="${escapeHtml(a.id)}"><span>${accountIcon(a.type)}</span><div><strong>${escapeHtml(a.name)}</strong><small>${accountType(a.type)}${a.updatedAt?` ・ ${formatUpdated(a.updatedAt)}`:''}</small></div><b>${privacyAmount(a.balance)}</b></button>`).join(''):'<p class="money3-empty">口座・現金・電子マネーを登録できます。</p>';
    return `<section class="money5-page-title"><div><small>ASSETS</small><h1>資産</h1><p>口座・資産・負債を一つの現在地で確認。</p></div><button id="moneyPrivacy" class="money5-privacy-toggle" type="button">${data.privacy?'金額を表示':'金額を隠す'}</button></section><section class="money3-networth"><div><small>純資産</small><strong>${data.privacy?'••••••':signedYen(net)}</strong><p>現金・預金＋資産−借金</p></div><div class="money3-networth-mini"><span><small>現金等</small><b>${data.privacy?'••••':yen(liquid)}</b></span><span><small>資産</small><b>${data.privacy?'••••':yen(assets)}</b></span><span><small>負債</small><b>${data.privacy?'••••':yen(debt)}</b></span></div></section>
    <section class="money3-panel"><header><div><small>ACCOUNTS</small><h2>口座・現金</h2></div><button type="button" data-money-action="refresh-balances">残高更新</button><button type="button" data-money-action="add-account">＋追加</button></header>${accounts}</section>
    <section class="money3-panel"><header><div><small>ASSETS</small><h2>投資・その他資産</h2></div><button type="button" data-money-action="add-asset">＋追加</button></header>${data.assets.length?data.assets.map(a=>`<button class="money2-rule-row" type="button" data-money-action="edit-asset" data-id="${escapeHtml(a.id)}"><div><strong>${escapeHtml(a.name)}</strong><small>${assetType(a.type)}</small></div><span>${data.privacy?'••••':yen(a.value)}</span></button>`).join(''):'<p class="money3-empty">投資・その他資産を追加すると純資産に反映されます。</p>'}</section>
    <section class="money3-panel money9-public"><header><div><small>PUBLIC</small><h2>税金・年金</h2></div></header>
      <button class="money9-public-row" type="button" data-money-action="tax-return"><div><strong>確定申告</strong><small>Moneyの取引を申告準備に使い、e-Taxへ</small></div><span>›</span></button>
      <button class="money9-public-row" type="button" data-money-action="pension-check"><div><strong>年金見込額</strong><small>ねんきんネットの公式試算を確認</small></div><span>›</span></button>
    </section>`;
  }
  const assetType=type=>({investment:'投資',other:'その他資産'}[type]||'資産');

  function handleClick(event){
    const btn=event.target.closest('button');if(!btn)return;
    if(btn.dataset.moneyTab){activeTab=btn.dataset.moneyTab;render();return}
    if(btn.dataset.moneyTabJump){activeTab=btn.dataset.moneyTabJump;render();return}
    if(btn.dataset.moneyFilter){transactionFilter=btn.dataset.moneyFilter;render();return}
    const action=btn.dataset.moneyAction;
    if(btn.id==='moneyMenuButton'){document.getElementById('menuDialog')?.showModal();return}
    if(btn.id==='moneyPrivacy'){data.privacy=!data.privacy;save();return}
    if(btn.id==='moneyQuickAdd'){openEntryDialog(isoToday());return}
    if(btn.dataset.moneyDate){selectedCalendarDate=btn.dataset.moneyDate;activeTab='calendar';render();return}
    if(!action)return;
    if(action==='back-home'){document.querySelector('.home-nav')?.click();return}
    if(action==='prev-month'||action==='next-month'){const [y,m]=calendarMonth.split('-').map(Number),d=new Date(y,m-1+(action==='next-month'?1:-1),1);calendarMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;selectedCalendarDate=`${calendarMonth}-01`;render();return}
    if(action==='add-entry')openEntryDialog(isoToday());
    if(action==='add-selected-date')openEntryDialog(selectedCalendarDate);
    if(action==='edit-entry')openEntryDialog(isoToday(),data.transactions.find(x=>x.id===btn.dataset.id));
    if(action==='add-recurring')openRecurringDialog();
    if(action==='edit-recurring')openRecurringDialog(data.recurring.find(x=>x.id===btn.dataset.id));
    if(action==='add-account')openAccountDialog();
    if(action==='edit-account')openAccountDialog(data.accounts.find(x=>x.id===btn.dataset.id));
    if(action==='refresh-balances')openBalanceDialog();
    if(action==='payment')openPaymentDialog(findTransactionById(btn.dataset.id));
    if(action==='mark-paid'){
      const tx=findTransactionById(btn.dataset.id);
      if(tx&&!isComplete(tx)){
        if(tx.virtualRecurring){const concrete={...tx,id:uid('tx'),status:'done'};delete concrete.virtualRecurring;data.transactions=[...data.transactions,concrete]}
        else data.transactions=data.transactions.map(x=>x.id===tx.id?{...x,status:'done'}:x);
        save();
      }
    }
    if(action==='add-goal')openGoalDialog();
    if(action==='edit-goal')openGoalDialog(data.goals.find(x=>x.id===btn.dataset.id));
    if(action==='add-debt')openDebtDialog();
    if(action==='edit-debt')openDebtDialog(data.debts.find(x=>x.id===btn.dataset.id));
    if(action==='edit-rules')openRulesDialog();
    if(action==='add-asset')openAssetDialog();
    if(action==='edit-asset')openAssetDialog(data.assets.find(x=>x.id===btn.dataset.id));
    if(action==='verify-data')openDataVerification();
    if(action==='yos-review')openYosReview();
    if(action==='tax-return')location.href='https://www.keisan.nta.go.jp/kyoutu/ky/sm/top#bsctrl';
    if(action==='pension-check')location.href='https://www.nenkin.go.jp/n_net/';
  }
  function handleInput(event){
    if(!event.target?.matches?.('[data-money-search]'))return;
    transactionQuery=event.target.value;
    const needle=transactionQuery.trim().toLowerCase();
    qa('.money3-feed .money3-transaction',document.getElementById('moneyPage')).forEach(row=>{row.hidden=Boolean(needle)&&!row.textContent.toLowerCase().includes(needle)});
  }
  const dialog=()=>document.getElementById('money2Dialog');
  const form=()=>document.getElementById('money2DialogForm');
  function openDialog(title,body,onSubmit,submitLabel='保存'){
    const d=dialog(),f=form();if(!d||!f)return;
    f.innerHTML=`<header><div><small>MY MONEY</small><h2>${escapeHtml(title)}</h2></div><button type="button" data-dialog-close>×</button></header><div class="money2-form-body">${body}</div><footer><button type="button" data-dialog-close>キャンセル</button><button class="primary" type="submit">${escapeHtml(submitLabel)}</button></footer>`;
    f.querySelectorAll('[data-dialog-close]').forEach(b=>b.addEventListener('click',()=>d.close()));
    f.onsubmit=e=>{e.preventDefault();onSubmit(new FormData(f),d)};d.showModal();
  }
  const field=(label,name,type='text',value='',attrs='')=>`<label><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}></label>`;
  const selectField=(label,name,options,value)=>`<label><span>${escapeHtml(label)}</span><select name="${name}">${options.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></label>`;

  function addDeleteButton(kind,onDelete){
    const f=form(),footer=f?.querySelector('footer');if(!footer)return;
    const button=document.createElement('button');button.type='button';button.className='danger';button.textContent='削除';
    button.addEventListener('click',()=>{if(confirm(`${kind}を削除しますか？`))onDelete()});
    footer.prepend(button);
  }
  function openEntryDialog(date,tx){
    const editing=!!tx,target=tx||{date,type:'expense',label:'',amount:'',category:'other',status:'planned'};
    openDialog(editing?'取引を編集':'入出金を追加',`${field('日付','date','date',target.date||date,'required')}${selectField('種類','type',[['income','収入'],['expense','支出'],['debt','借金返済'],['saving','貯金・積立'],['investment','投資']],target.type)}${selectField('カテゴリー','category',categorySelectOptions(target.category),transactionCategory(target).id)}${field('内容','label','text',target.label,'placeholder="例：家賃 / 給料" required')}${field('金額','amount','number',target.amount,'min="0" inputmode="numeric" required')}${selectField('状態','status',[['planned','予定'],['done','完了・支払済み']],isComplete(target)?'done':'planned')}`,fd=>{const item={...target,id:target.id||uid('tx'),date:clean(fd.get('date'),10),type:clean(fd.get('type'),20),category:clean(fd.get('category'),30),label:clean(fd.get('label'),60),amount:Math.max(0,n(fd.get('amount'))),status:clean(fd.get('status'),20)||'planned'};delete item.virtualRecurring;data.transactions=editing?data.transactions.map(x=>x.id===item.id?item:x):[...data.transactions,item];dialog().close();save()});
    if(editing)addDeleteButton('この取引',()=>{data.transactions=data.transactions.filter(x=>x.id!==target.id);dialog().close();save()});
  }
  function openRecurringDialog(rule){
    const editing=!!rule,target=rule||{frequency:'monthly',startDate:isoToday(),day:Number(isoToday().slice(8,10)),type:'expense',category:'other',label:'',amount:'',enabled:true};
    openDialog(editing?'定期収支を編集':'定期収支を追加',`${selectField('種類','type',[['income','収入'],['expense','支出'],['debt','借金返済'],['saving','貯金・積立'],['investment','投資']],target.type)}${selectField('カテゴリー','category',categorySelectOptions(target.category),transactionCategory(target).id)}${field('内容','label','text',target.label,'placeholder="例：家賃 / 給料 / サブスク" required')}${field('金額','amount','number',target.amount,'min="0" inputmode="numeric" required')}${field('毎月の日','day','number',target.day,'min="1" max="31" inputmode="numeric" required')}${field('開始日','startDate','date',target.startDate||isoToday(),'required')}${field('終了日（任意）','endDate','date',target.endDate||'')}${selectField('状態','enabled',[['true','有効'],['false','一時停止']],String(target.enabled!==false))}`,fd=>{
      const item={...target,id:target.id||uid('rec'),frequency:'monthly',type:clean(fd.get('type'),20),category:clean(fd.get('category'),30),label:clean(fd.get('label'),60),amount:Math.max(0,n(fd.get('amount'))),day:Math.min(31,Math.max(1,Math.round(n(fd.get('day')))||1)),startDate:clean(fd.get('startDate'),10),endDate:clean(fd.get('endDate'),10),enabled:fd.get('enabled')!=='false'};
      data.recurring=editing?data.recurring.map(x=>x.id===item.id?item:x):[...data.recurring,item];dialog().close();save()
    });
    if(editing)addDeleteButton('この定期収支',()=>{data.recurring=data.recurring.filter(x=>x.id!==target.id);dialog().close();save()});
  }
  function openAccountDialog(account){
    const editing=!!account,target=account||{type:'bank',name:'',balance:''};
    openDialog(editing?'口座を編集':'口座を追加',`${selectField('種類','type',[['bank','銀行'],['cash','現金'],['emoney','電子マネー']],target.type)}${field('名前','name','text',target.name,'placeholder="例：メイン口座 / PayPay" required')}${field('現在残高','balance','number',target.balance,'inputmode="numeric" required')}`,fd=>{const item={id:target.id||uid('acct'),type:clean(fd.get('type'),20),name:clean(fd.get('name'),50),balance:n(fd.get('balance')),updatedAt:new Date().toISOString()};data.accounts=editing?data.accounts.map(x=>x.id===item.id?item:x):[...data.accounts,item];dialog().close();save()});
  }
  function openBalanceDialog(){
    if(!data.accounts.length){openAccountDialog();return}
    openDialog('残高を更新',data.accounts.map(a=>field(a.name,`balance_${a.id}`,'number',a.balance,'inputmode="numeric"')).join(''),fd=>{const now=new Date().toISOString();data.accounts=data.accounts.map(a=>({...a,balance:n(fd.get(`balance_${a.id}`)),updatedAt:now}));dialog().close();save()},'更新する');
  }
  function openPaymentDialog(tx){
    if(!tx)return;
    openDialog('支払い',`<div class="money2-payment-confirm"><small>${formatMD(tx.date)}</small><strong>${escapeHtml(tx.label)}</strong><b>${data.privacy?'金額非表示':yen(tx.amount)}</b><p>MY WAYから実際の銀行振込はまだ行いません。銀行・決済アプリで支払った後に「支払済み」にしてください。</p></div>`,()=>{if(!isComplete(tx)){if(tx.virtualRecurring){const concrete={...tx,id:uid('tx'),status:'done'};delete concrete.virtualRecurring;data.transactions=[...data.transactions,concrete]}else data.transactions=data.transactions.map(x=>x.id===tx.id?{...x,status:'done'}:x)}dialog().close();save()},isComplete(tx)?'閉じる':'支払済みにする');
  }
  function openGoalDialog(goal){
    const editing=!!goal,target=goal||{name:'',type:'saving',target:'',current:'',checkpoint:'',purpose:'',deadline:'',priority:1};
    openDialog(editing?'目標を編集':'目標を追加',`${field('目標名','name','text',target.name,'placeholder="例：生活防衛資金 / 欲しいもの" required')}${selectField('種類','type',[['emergency','生活防衛資金'],['purchase','欲しいもの'],['saving','貯金'],['investment','投資'],['debt','返済目標']],target.type)}${field('目標金額','target','number',target.target,'min="0" required')}${field('現在額','current','number',target.current,'min="0"')}${field('第1チェックポイント','checkpoint','number',target.checkpoint||'','min="0"')}${field('目的','purpose','text',target.purpose||'','maxlength="160"')}${field('期限（任意）','deadline','date',target.deadline||'')}${field('優先度 1〜5','priority','number',target.priority||1,'min="1" max="5"')}`,fd=>{const priority=Math.min(5,Math.max(1,n(fd.get('priority'))||1));const item={...target,id:target.id||uid('goal'),name:clean(fd.get('name'),60),type:clean(fd.get('type'),20),target:Math.max(0,n(fd.get('target'))),current:Math.max(0,n(fd.get('current'))),checkpoint:Math.max(0,n(fd.get('checkpoint'))),purpose:clean(fd.get('purpose'),160),deadline:clean(fd.get('deadline'),10),priority,priorityLabel:priority>=4?'高':priority>=2?'中':'低'};data.goals=editing?data.goals.map(x=>x.id===item.id?item:x):[...data.goals,item];dialog().close();save()});
  }
  function openDebtDialog(debt){
    const editing=!!debt,target=debt||{name:'',balance:'',balanceKnown:true,verification:'confirmed',status:'active',apr:'',minPayment:'',plannedPayment:'',dueDay:'',payoffMonthsManual:'',estimatedFees:''};
    openDialog(editing?'借金を編集':'借金を追加',
      `${field('名称','name','text',target.name,'placeholder="例：カードローン / リボ / 奨学金" required')}
      ${selectField('残高の確度','verification',[['confirmed','確認済み'],['estimate','概算'],['unconfirmed','金額未確認']],target.balanceKnown===false?'unconfirmed':(target.verification||'confirmed'))}
      ${field('残高','balance','number',target.balance,'min="0" inputmode="numeric"')}
      ${selectField('状態','status',[['active','返済中'],['overdue','期限超過'],['legal_notice','回収・訴訟予告あり']],target.status||'active')}
      ${field('年利 %','apr','number',target.apr,'min="0" step="0.01" inputmode="decimal"')}
      ${field('最低返済額 / 月','minPayment','number',target.minPayment,'min="0" inputmode="numeric"')}
      ${field('実際に返す予定額 / 月','plannedPayment','number',target.plannedPayment||target.minPayment,'min="0" inputmode="numeric"')}
      ${field('毎月の支払日','dueDay','number',target.dueDay||'','min="1" max="31" inputmode="numeric"')}
      ${field('完済までの回数（公式シミュレーションがある場合）','payoffMonthsManual','number',target.payoffMonthsManual||'','min="1" inputmode="numeric"')}
      ${field('手数料総額見込み（公式シミュレーションがある場合）','estimatedFees','number',target.estimatedFees||'','min="0" inputmode="numeric"')}`,
      fd=>{
        const minPayment=Math.max(0,n(fd.get('minPayment')));
        const verification=clean(fd.get('verification'),20)||'confirmed',balanceKnown=verification!=='unconfirmed';
        const item={...target,id:target.id||uid('debt'),name:clean(fd.get('name'),60),balance:balanceKnown?Math.max(0,n(fd.get('balance'))):0,balanceKnown,verification,status:clean(fd.get('status'),30)||'active',apr:Math.max(0,n(fd.get('apr'))),minPayment,plannedPayment:Math.max(minPayment,n(fd.get('plannedPayment'))||minPayment),dueDay:Math.min(31,Math.max(0,Math.round(n(fd.get('dueDay'))))),payoffMonthsManual:Math.max(0,Math.round(n(fd.get('payoffMonthsManual')))),estimatedFees:Math.max(0,n(fd.get('estimatedFees')))};
        data.debts=editing?data.debts.map(x=>x.id===item.id?item:x):[...data.debts,item];
        dialog().close();save();
      });
    if(editing)addDeleteButton('この借金',()=>{data.debts=data.debts.filter(x=>x.id!==target.id);dialog().close();save()});
  }
  function openRulesDialog(){
    openDialog('基本ルール',`${field('最低生活費 / 月','monthlyEssential','number',data.rules.monthlyEssential,'min="0"')}${field('生活の質を守る予算 / 月','qualityBudget','number',data.rules.qualityBudget,'min="0"')}${field('生活防衛資金の目標（月数）','emergencyMonths','number',data.rules.emergencyMonths,'min="0" max="24" step="0.5"')}<label><span>基本方針</span><textarea name="note" rows="3">${escapeHtml(data.rules.note)}</textarea></label>`,fd=>{data.rules={...data.rules,monthlyEssential:Math.max(0,n(fd.get('monthlyEssential'))),qualityBudget:Math.max(0,n(fd.get('qualityBudget'))),emergencyMonths:Math.max(0,n(fd.get('emergencyMonths'))),note:clean(fd.get('note'),240)};dialog().close();save()});
  }
  function openAssetDialog(asset){
    const editing=!!asset,target=asset||{name:'',type:'investment',value:''};
    openDialog(editing?'資産を編集':'資産を追加',`${field('名称','name','text',target.name,'placeholder="例：NISA / その他資産" required')}${selectField('種類','type',[['investment','投資'],['other','その他資産']],target.type)}${field('現在価値','value','number',target.value,'min="0" required')}`,fd=>{const item={id:target.id||uid('asset'),name:clean(fd.get('name'),60),type:clean(fd.get('type'),20),value:Math.max(0,n(fd.get('value'))),updatedAt:new Date().toISOString()};data.assets=editing?data.assets.map(x=>x.id===item.id?item:x):[...data.assets,item];dialog().close();save()});
  }
  function openDataVerification(){
    const plan=futurePlan();
    const completedFuture=data.transactions.filter(tx=>isOutgoing(tx)&&isComplete(tx)&&String(tx.date||'')>=isoToday());
    const paidExcluded=!plan.nextPayment||!completedFuture.some(tx=>tx.id===plan.nextPayment.id);
    const checks=[
      ['今日使える金額',plan.daily!==null,plan.daily===null?'残高または予定不足':privacyAmount(plan.daily)],
      ['次の支払い',Boolean(plan.nextPayment),plan.nextPayment?`${formatMD(plan.nextPayment.date)} ${clean(plan.nextPayment.label,28)} ${data.privacy?'金額非表示':yen(plan.nextPayment.amount)}`:'未入力'],
      ['支払済み除外',paidExcluded,paidExcluded?'除外済み':'要確認'],
      ['次の入金',Boolean(plan.nextIncome),plan.nextIncome?`${formatMD(plan.nextIncome.date)} ${clean(plan.nextIncome.label,28)} ${data.privacy?'金額非表示':yen(plan.nextIncome.amount)}`:'未入力'],
      ['支払い後の不足判定',plan.afterNextPayment!==null,plan.afterNextPayment===null?'残高未入力':(plan.shortageAfterNextPayment?`不足 ${data.privacy?'金額非表示':yen(Math.abs(plan.afterNextPayment))}`:`残高見込み ${data.privacy?'金額非表示':yen(plan.afterNextPayment)}`)]
    ];
    const passed=checks.every(([,ok])=>ok);
    openDialog('Money 実データ確認',`<div class="money2-payment-confirm"><strong>${passed?'PASS':'未完了'}</strong>${checks.map(([name,ok,value])=>`<p>${ok?'✓':'△'} ${escapeHtml(name)}：${escapeHtml(value)}</p>`).join('')}<p>Money本体はこの端末の既存 yos-money-v2 が正本です。Money Alert用には必要最小限の読み取りキャッシュだけを同期します。</p><button type="button" class="primary" data-money-copy-alert-token>Money Alert 接続コードをコピー</button></div>`,()=>dialog().close(),'閉じる');
    const copyButton=form()?.querySelector('[data-money-copy-alert-token]');
    copyButton?.addEventListener('click',()=>{void copyMoneyAlertToken(copyButton)});
  }
  async function openYosReview(){
    const plan=futurePlan(),debt=[...data.debts].sort((a,b)=>n(b.apr)-n(a.apr))[0],goal=primaryGoal();
    const prompt=`【YOS｜Money設定見直し】\n現在地をもとに、生活の質を守りながら返済・貯金・目標・投資の配分を一緒に見直したい。\n\n現在のMoney事実：\n- 口座等残高：${plan.liquid===null?'未設定':yen(plan.liquid)}\n- 月末予測：${plan.projected===null?'未算出':signedYen(plan.projected)}\n- 借金：${totalDebt()?yen(totalDebt()):'未設定'}${debt?`（最高金利 ${n(debt.apr)}%）`:''}\n- 主目標：${goal?`${goal.name} あと${yen(Math.max(0,n(goal.target)-n(goal.current)))}`:'未設定'}\n- 最低生活費：${data.rules.monthlyEssential?yen(data.rules.monthlyEssential):'未設定'}\n- 生活の質予算：${data.rules.qualityBudget?yen(data.rules.qualityBudget):'未設定'}\n\n不足情報を必要最小限ヒアリングして、現在の最適配分を提案して。変更による返済速度・生活余力・目標への影響も示して。`;
    try{await navigator.clipboard.writeText(prompt)}catch{}
    const settings=read(HOME_KEY,{}),url=clean(settings.yosUrl||read(LEGACY_HOME_KEY,{}).yosUrl||read(TAXI_KEY,{}).yosUrl,500);
    if(url.startsWith('https://chatgpt.com/'))location.href=url;else alert('YOSチャットURLが未設定です。MY WAYの設定から登録してください。');
  }
  function boot(){
    if(!document.getElementById('moneyPage'))return;
    applyLocalImportFromHash();
    installShell();render();void syncMoneyShadow();
    window.addEventListener('online',()=>{void syncMoneyShadow()});
    window.addEventListener('storage',e=>{if(e.key===KEY){data=state();render();void syncMoneyShadow()}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){data=state();render()}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
