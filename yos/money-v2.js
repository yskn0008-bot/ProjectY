'use strict';
(()=>{
  const KEY='yos-money-v2';
  const LIFE_KEY='yos-life-v1';
  const HOME_KEY='yos-home-settings-v2';
  const LEGACY_HOME_KEY='yos-home-settings-v1';
  const TAXI_KEY='yos-taxi-settings-v2';
  const TZ='Asia/Tokyo';

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
  const txSign=tx=>tx.type==='income'?1:-1;

  function defaultState(){
    return {version:2,privacy:false,accounts:[],transactions:[],debts:[],goals:[],assets:[],rules:{monthlyEssential:0,qualityBudget:0,emergencyMonths:1,note:'生活を壊さず、安全を確保した上で高金利返済を優先する。'},updatedAt:null};
  }
  function state(){
    const saved=read(KEY,null),base=defaultState();
    if(!saved||typeof saved!=='object')return base;
    return {...base,...saved,accounts:Array.isArray(saved.accounts)?saved.accounts:[],transactions:Array.isArray(saved.transactions)?saved.transactions:[],debts:Array.isArray(saved.debts)?saved.debts:[],goals:Array.isArray(saved.goals)?saved.goals:[],assets:Array.isArray(saved.assets)?saved.assets:[],rules:{...base.rules,...(saved.rules||{})}};
  }
  let data=state();
  let activeTab='dashboard';
  let calendarMonth=monthKey();
  function save(){data.updatedAt=new Date().toISOString();write(KEY,data);render();}

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
  function monthTransactions(mk=calendarMonth){return data.transactions.filter(tx=>String(tx.date||'').slice(0,7)===mk)}
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
    const future=data.transactions.filter(tx=>tx.status!=='done'&&tx.date>=today&&String(tx.date).slice(0,7)===month).sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
    if(liquid===null)return {liquid:null,projected:null,shortfall:null,firstBreak:null,nextPayment:null,nextIncome:null,daily:null,daysToNextPayment:null};
    let running=liquid,firstBreak=null;
    for(const tx of future){running+=txSign(tx)*n(tx.amount);if(running<0&&!firstBreak)firstBreak={tx,balance:running}}
    const nextPayment=future.find(isOutgoing)||null,nextIncome=future.find(tx=>tx.type==='income')||null;
    const endDay=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
    const anchor=nextIncome?.date||`${month}-${String(endDay).padStart(2,'0')}`;
    const outgoingUntilAnchor=future.filter(tx=>isOutgoing(tx)&&tx.date<=anchor).reduce((s,tx)=>s+n(tx.amount),0);
    const days=Math.max(1,daysBetween(parseDate(today),parseDate(anchor))+1);
    return {liquid,projected:running,shortfall:firstBreak?Math.abs(firstBreak.balance):0,firstBreak,nextPayment,nextIncome,daily:Math.floor(Math.max(0,liquid-outgoingUntilAnchor)/days),daysToNextPayment:nextPayment?Math.max(0,daysBetween(parseDate(today),parseDate(nextPayment.date))):null};
  }
  const totalDebt=()=>data.debts.reduce((s,d)=>s+n(d.balance),0);
  const emergencyGoal=()=>data.goals.find(g=>g.type==='emergency')||null;
  const primaryGoal=()=>[...data.goals].sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0))[0]||null;
  const netWorth=()=> (currentLiquid()??0)+data.assets.reduce((s,a)=>s+n(a.value),0)-totalDebt();
  const signedYen=value=>`${n(value)>=0?'+':'−'}${yen(Math.abs(n(value)))}`;
  const formatMD=date=>{const d=parseDate(date);return d?`${d.getMonth()+1}/${d.getDate()}`:date};
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
    host.innerHTML=`<header class="money2-heading"><div class="money2-title"><span>¥</span><div><small>MY WAY MONEY</small><h1>お金の現在地</h1><p>今日から未来まで、資金繰りを見通す。</p></div></div><button id="moneyPrivacy" class="money2-icon-btn" type="button" aria-label="金額表示を切り替える">◉</button></header><nav class="money2-tabs" aria-label="Money画面"><button data-money-tab="dashboard" class="active">Dashboard</button><button data-money-tab="accounts">口座・支払い</button><button data-money-tab="rules">目標・ルール</button><button data-money-tab="assets">資産</button></nav><div id="money2Body"></div><button id="moneyQuickAdd" class="money2-fab" type="button" aria-label="入出金を追加">＋</button><dialog id="money2Dialog" class="money2-dialog"><form method="dialog" id="money2DialogForm"></form></dialog>`;
    host.addEventListener('click',handleClick);
    return host;
  }
  function render(){
    const host=installShell();if(!host)return;
    const body=document.getElementById('money2Body');if(!body)return;
    qa('[data-money-tab]',host).forEach(btn=>btn.classList.toggle('active',btn.dataset.moneyTab===activeTab));
    const privacy=document.getElementById('moneyPrivacy');if(privacy){privacy.textContent=data.privacy?'◌':'◉';privacy.title=data.privacy?'金額を表示':'金額を隠す'}
    body.innerHTML=activeTab==='dashboard'?renderDashboard():activeTab==='accounts'?renderAccounts():activeTab==='rules'?renderRules():renderAssets();
  }
  function renderDashboard(){
    const s=summary(),plan=futurePlan(),status=moneyStatus(plan),debt=totalDebt(),eGoal=emergencyGoal(),goal=primaryGoal();
    return `<section class="money2-status ${status.tone}"><div><small>${escapeHtml(status.label)}</small><strong>${escapeHtml(status.title)}</strong><p>${escapeHtml(status.text)}</p></div><button type="button" data-money-action="yos-review">YOSと見直す</button></section>${renderCalendar()}<section class="money2-metrics"><article><small>今月の収入</small><strong>${s.hasData?privacyAmount(s.income):'未設定'}</strong></article><article><small>支出合計</small><strong>${s.hasData?privacyAmount(s.outgoing):'未設定'}</strong></article><article><small>防衛資金</small><strong>${eGoal?(data.privacy?'••••':Math.round(n(eGoal.current)/Math.max(1,n(eGoal.target))*100)+'%'):'未設定'}</strong></article><article><small>借金残高</small><strong>${debt?privacyAmount(debt):'未設定'}</strong></article><article class="wide"><small>今日から1日に使える目安</small><strong>${plan.daily===null?'未算出':privacyAmount(plan.daily)}</strong><em>${plan.nextIncome?`次の入金 ${formatMD(plan.nextIncome.date)} まで`:'月末まで'}</em></article></section>${renderNextPayment(plan.nextPayment,plan.daysToNextPayment)}${renderGoal(goal)}<section class="money2-advice"><span>YOS</span><p>${escapeHtml(buildAdvice(plan,goal))}</p></section>`;
  }
  function renderCalendar(){
    const [year,month]=calendarMonth.split('-').map(Number),first=new Date(year,month-1,1),last=new Date(year,month,0),start=(first.getDay()+6)%7,today=isoToday(),txs=monthTransactions(),cells=[];
    for(let i=0;i<start;i++)cells.push('<div class="money2-day empty"></div>');
    for(let day=1;day<=last.getDate();day++){
      const date=`${calendarMonth}-${String(day).padStart(2,'0')}`,all=txs.filter(tx=>tx.date===date),items=all.slice(0,2);
      const chips=items.map(tx=>`<span class="money2-chip ${tx.type} ${tx.status==='done'?'done':''}">${tx.type==='income'?'+':'−'}${data.privacy?'••':compactAmount(tx.amount)}</span>`).join('');
      cells.push(`<button class="money2-day ${date===today?'today':''}" data-money-date="${date}" type="button"><b>${day}</b>${chips}${all.length>items.length?`<i>+${all.length-items.length}</i>`:''}</button>`);
    }
    return `<section class="money2-calendar-card"><header><button type="button" data-money-action="prev-month">‹</button><div><small>資金カレンダー</small><strong>${year}年${month}月</strong></div><button type="button" data-money-action="next-month">›</button></header><div class="money2-week"><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span></div><div class="money2-calendar">${cells.join('')}</div><footer><span><i class="income"></i>収入</span><span><i class="expense"></i>支出</span><button type="button" data-money-action="add-entry">＋ 入出金</button></footer></section>`;
  }
  function renderNextPayment(tx,days){
    if(!tx)return `<section class="money2-row-card empty"><div><small>次の支払い</small><strong>予定なし</strong><p>カレンダーに支払い予定を追加できます。</p></div><button data-money-action="add-entry" type="button">追加</button></section>`;
    return `<section class="money2-row-card"><div><small>次の支払いまで ${days}日</small><strong>${escapeHtml(tx.label||'支払い')} ${data.privacy?'••••••':yen(tx.amount)}</strong><p>${formatMD(tx.date)} ${tx.status==='done'?'支払済み':'支払い予定'}</p></div><button data-money-action="payment" data-id="${escapeHtml(tx.id)}" type="button">${tx.status==='done'?'確認':'支払う'}</button></section>`;
  }
  function renderGoal(goal){
    if(!goal)return `<section class="money2-goal-card empty"><div><small>今の目標</small><strong>まだ設定されていません</strong><p>防衛資金・返済・欲しいもの・投資などを設定できます。</p></div><button type="button" data-money-action="add-goal">目標を作る</button></section>`;
    const target=Math.max(1,n(goal.target)),current=n(goal.current),pct=Math.min(100,Math.max(0,Math.round(current/target*100)));
    return `<section class="money2-goal-card"><header><div><small>今の目標</small><strong>${escapeHtml(goal.name)}</strong></div><span>${pct}%</span></header><div class="money2-progress"><i style="width:${pct}%"></i></div><p>${data.privacy?'残額は非表示':`あと ${yen(Math.max(0,target-current))}`}${goal.deadline?` ・ 期限 ${formatMD(goal.deadline)}`:''}</p></section>`;
  }
  function buildAdvice(plan,goal){
    if(plan.liquid===null)return 'まず現在の口座・電子マネー残高を登録すると、赤字になる日と1日予算を計算できます。';
    if(plan.firstBreak)return `${formatMD(plan.firstBreak.tx.date)}の「${clean(plan.firstBreak.tx.label,20)}」で資金不足予測です。不足分を埋める収入か、同額以上の支出調整を先に考えましょう。`;
    const debt=[...data.debts].sort((a,b)=>n(b.apr)-n(a.apr))[0];
    if(debt&&n(debt.balance)>0)return `生活に必要なお金を確保した上で、現在は金利${n(debt.apr)}%の「${clean(debt.name,16)}」を優先返済する設定が合理的です。生活の質を守る予算はルール画面で調整できます。`;
    if(goal)return `今月は赤字予測なし。余剰は「${clean(goal.name,18)}」への配分を検討できます。目標変更時はYOSと配分を見直せます。`;
    return '今月は登録済み予定では赤字予測なし。次に「守るお金」と目標を設定すると、余剰資金の行き先まで判断できます。';
  }
  function renderAccounts(){
    const total=currentLiquid();
    const rows=data.accounts.length?data.accounts.map(a=>`<button class="money2-account" type="button" data-money-action="edit-account" data-id="${escapeHtml(a.id)}"><span>${accountIcon(a.type)}</span><div><strong>${escapeHtml(a.name)}</strong><small>${accountType(a.type)}${a.updatedAt?` ・ ${formatUpdated(a.updatedAt)}`:''}</small></div><b>${privacyAmount(a.balance)}</b></button>`).join(''):`<div class="money2-empty">銀行口座・現金・電子マネーを登録すると、合計残高と資金繰りに反映されます。</div>`;
    const payments=data.transactions.filter(tx=>isOutgoing(tx)&&tx.status!=='done'&&tx.date>=isoToday()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
    return `<section class="money2-account-total"><small>使えるお金の現在地</small><strong>${total===null?'未設定':privacyAmount(total)}</strong><div><button type="button" data-money-action="refresh-balances">↻ 残高を更新</button><button type="button" data-money-action="add-account">＋ 口座</button></div><p>現在は端末内で手動更新。金融API連携用の入口はこのまま残します。</p></section><section class="money2-list-card"><header><h2>口座・電子マネー</h2><span>${data.accounts.length}件</span></header>${rows}</section><section class="money2-list-card"><header><h2>これからの支払い</h2><button type="button" data-money-action="add-entry">＋追加</button></header>${payments.length?payments.map(tx=>`<div class="money2-payment-line"><div><strong>${formatMD(tx.date)} ${escapeHtml(tx.label)}</strong><small>${tx.type==='debt'?'返済':'支払い予定'}</small></div><b>${data.privacy?'••••':yen(tx.amount)}</b><button type="button" data-money-action="payment" data-id="${escapeHtml(tx.id)}">支払う</button></div>`).join(''):'<div class="money2-empty">未払い予定はありません。</div>'}</section>`;
  }
  const accountIcon=type=>({bank:'▣',cash:'◯',emoney:'◈'}[type]||'▣');
  const accountType=type=>({bank:'銀行',cash:'現金',emoney:'電子マネー'}[type]||'その他');
  function formatUpdated(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:TZ}).format(d)}
  function renderRules(){
    const debtTotal=totalDebt();
    const goals=data.goals.map(g=>{const target=Math.max(1,n(g.target)),pct=Math.min(100,Math.round(n(g.current)/target*100));return `<button class="money2-rule-row" type="button" data-money-action="edit-goal" data-id="${escapeHtml(g.id)}"><div><strong>${escapeHtml(g.name)}</strong><small>${goalType(g.type)}${g.deadline?` ・ ${formatMD(g.deadline)}まで`:''}</small></div><span>${pct}%</span></button>`}).join('');
    const debts=data.debts.map(d=>`<button class="money2-rule-row" type="button" data-money-action="edit-debt" data-id="${escapeHtml(d.id)}"><div><strong>${escapeHtml(d.name)}</strong><small>金利 ${n(d.apr)}% ・ 最低返済 ${data.privacy?'非表示':yen(d.minPayment)}</small></div><span>${data.privacy?'••••':yen(d.balance)}</span></button>`).join('');
    return `<section class="money2-rule-intro"><small>MONEY RULE ENGINE</small><h2>現在地に合わせて、配分を変える。</h2><ol><li>生活と確定支払いを守る</li><li>最低限の防衛資金を作る</li><li>高金利の借金を優先返済</li><li>目標と生活の満足を両立</li><li>条件が整ったら投資へ</li></ol><button type="button" data-money-action="edit-rules">基本設定を変更</button></section><section class="money2-list-card"><header><h2>目標</h2><button type="button" data-money-action="add-goal">＋追加</button></header>${goals||'<div class="money2-empty">期限・金額・優先度を持つ目標を作れます。</div>'}</section><section class="money2-list-card"><header><h2>借金・返済</h2><span>${debtTotal?privacyAmount(debtTotal):'未設定'}</span><button type="button" data-money-action="add-debt">＋追加</button></header>${debts||'<div class="money2-empty">残高・金利・最低返済額を登録すると、高金利順に返済優先度を計算できます。</div>'}</section><section class="money2-settings-summary"><div><small>最低生活費 / 月</small><strong>${data.rules.monthlyEssential?privacyAmount(data.rules.monthlyEssential):'未設定'}</strong></div><div><small>生活の質を守る予算 / 月</small><strong>${data.rules.qualityBudget?privacyAmount(data.rules.qualityBudget):'未設定'}</strong></div><div><small>防衛資金</small><strong>${n(data.rules.emergencyMonths)}か月分</strong></div></section>`;
  }
  const goalType=type=>({emergency:'生活防衛資金',purchase:'欲しいもの',saving:'貯金',investment:'投資',debt:'返済目標'}[type]||'目標');
  function renderAssets(){
    const debt=totalDebt(),liquid=currentLiquid()??0,assets=data.assets.reduce((s,a)=>s+n(a.value),0),net=netWorth();
    return `<section class="money2-networth"><small>純資産</small><strong>${data.privacy?'••••••':signedYen(net)}</strong><p>現金・預金＋資産−借金</p></section><section class="money2-asset-grid"><article><small>現金・預金</small><strong>${data.privacy?'••••':yen(liquid)}</strong></article><article><small>投資・その他資産</small><strong>${data.privacy?'••••':yen(assets)}</strong></article><article><small>借金・負債</small><strong>${data.privacy?'••••':yen(debt)}</strong></article></section><section class="money2-list-card"><header><h2>資産</h2><button type="button" data-money-action="add-asset">＋追加</button></header>${data.assets.length?data.assets.map(a=>`<button class="money2-rule-row" type="button" data-money-action="edit-asset" data-id="${escapeHtml(a.id)}"><div><strong>${escapeHtml(a.name)}</strong><small>${assetType(a.type)}</small></div><span>${data.privacy?'••••':yen(a.value)}</span></button>`).join(''):'<div class="money2-empty"><strong>将来の資産管理枠を準備済み。</strong><br>投資・その他資産を追加すると純資産に反映されます。</div>'}</section><section class="money2-future"><span>FUTURE</span><div><strong>資産連携</strong><p>銀行・証券・電子マネーの自動連携を後から追加できる構造にしています。</p></div></section>`;
  }
  const assetType=type=>({investment:'投資',other:'その他資産'}[type]||'資産');

  function handleClick(event){
    const btn=event.target.closest('button');if(!btn)return;
    if(btn.dataset.moneyTab){activeTab=btn.dataset.moneyTab;render();return}
    const action=btn.dataset.moneyAction;
    if(btn.id==='moneyPrivacy'){data.privacy=!data.privacy;save();return}
    if(btn.id==='moneyQuickAdd'){openEntryDialog(isoToday());return}
    if(btn.dataset.moneyDate){openEntryDialog(btn.dataset.moneyDate);return}
    if(!action)return;
    if(action==='prev-month'||action==='next-month'){const [y,m]=calendarMonth.split('-').map(Number),d=new Date(y,m-1+(action==='next-month'?1:-1),1);calendarMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;render();return}
    if(action==='add-entry')openEntryDialog(isoToday());
    if(action==='add-account')openAccountDialog();
    if(action==='edit-account')openAccountDialog(data.accounts.find(x=>x.id===btn.dataset.id));
    if(action==='refresh-balances')openBalanceDialog();
    if(action==='payment')openPaymentDialog(data.transactions.find(x=>x.id===btn.dataset.id));
    if(action==='add-goal')openGoalDialog();
    if(action==='edit-goal')openGoalDialog(data.goals.find(x=>x.id===btn.dataset.id));
    if(action==='add-debt')openDebtDialog();
    if(action==='edit-debt')openDebtDialog(data.debts.find(x=>x.id===btn.dataset.id));
    if(action==='edit-rules')openRulesDialog();
    if(action==='add-asset')openAssetDialog();
    if(action==='edit-asset')openAssetDialog(data.assets.find(x=>x.id===btn.dataset.id));
    if(action==='yos-review')openYosReview();
  }
  const dialog=()=>document.getElementById('money2Dialog');
  const form=()=>document.getElementById('money2DialogForm');
  function openDialog(title,body,onSubmit,submitLabel='保存'){
    const d=dialog(),f=form();if(!d||!f)return;
    f.innerHTML=`<header><div><small>MY WAY MONEY</small><h2>${escapeHtml(title)}</h2></div><button type="button" data-dialog-close>×</button></header><div class="money2-form-body">${body}</div><footer><button type="button" data-dialog-close>キャンセル</button><button class="primary" type="submit">${escapeHtml(submitLabel)}</button></footer>`;
    f.querySelectorAll('[data-dialog-close]').forEach(b=>b.addEventListener('click',()=>d.close()));
    f.onsubmit=e=>{e.preventDefault();onSubmit(new FormData(f),d)};d.showModal();
  }
  const field=(label,name,type='text',value='',attrs='')=>`<label><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}></label>`;
  const selectField=(label,name,options,value)=>`<label><span>${escapeHtml(label)}</span><select name="${name}">${options.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></label>`;

  function openEntryDialog(date,tx){
    const editing=!!tx,target=tx||{date,type:'expense',label:'',amount:'',status:'planned'};
    openDialog(editing?'入出金を編集':'入出金を追加',`${field('日付','date','date',target.date||date,'required')}${selectField('種類','type',[['income','収入'],['expense','支出'],['debt','借金返済'],['saving','貯金・積立'],['investment','投資']],target.type)}${field('内容','label','text',target.label,'placeholder="例：家賃 / 給料" required')}${field('金額','amount','number',target.amount,'min="0" inputmode="numeric" required')}${selectField('状態','status',[['planned','予定'],['done','完了・支払済み']],target.status||'planned')}`,fd=>{const item={id:target.id||uid('tx'),date:clean(fd.get('date'),10),type:clean(fd.get('type'),20),label:clean(fd.get('label'),60),amount:Math.max(0,n(fd.get('amount'))),status:clean(fd.get('status'),20)||'planned'};data.transactions=editing?data.transactions.map(x=>x.id===item.id?item:x):[...data.transactions,item];dialog().close();save()});
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
    openDialog('支払い',`<div class="money2-payment-confirm"><small>${formatMD(tx.date)}</small><strong>${escapeHtml(tx.label)}</strong><b>${data.privacy?'金額非表示':yen(tx.amount)}</b><p>MY WAYから実際の銀行振込はまだ行いません。銀行・決済アプリで支払った後に「支払済み」にしてください。</p></div>`,()=>{if(tx.status!=='done')data.transactions=data.transactions.map(x=>x.id===tx.id?{...x,status:'done'}:x);dialog().close();save()},tx.status==='done'?'閉じる':'支払済みにする');
  }
  function openGoalDialog(goal){
    const editing=!!goal,target=goal||{name:'',type:'saving',target:'',current:'',deadline:'',priority:1};
    openDialog(editing?'目標を編集':'目標を追加',`${field('目標名','name','text',target.name,'placeholder="例：生活防衛資金 / 欲しいもの" required')}${selectField('種類','type',[['emergency','生活防衛資金'],['purchase','欲しいもの'],['saving','貯金'],['investment','投資'],['debt','返済目標']],target.type)}${field('目標金額','target','number',target.target,'min="0" required')}${field('現在額','current','number',target.current,'min="0"')}${field('期限（任意）','deadline','date',target.deadline||'')}${field('優先度 1〜5','priority','number',target.priority||1,'min="1" max="5"')}`,fd=>{const item={id:target.id||uid('goal'),name:clean(fd.get('name'),60),type:clean(fd.get('type'),20),target:Math.max(0,n(fd.get('target'))),current:Math.max(0,n(fd.get('current'))),deadline:clean(fd.get('deadline'),10),priority:Math.min(5,Math.max(1,n(fd.get('priority'))||1))};data.goals=editing?data.goals.map(x=>x.id===item.id?item:x):[...data.goals,item];dialog().close();save()});
  }
  function openDebtDialog(debt){
    const editing=!!debt,target=debt||{name:'',balance:'',apr:'',minPayment:''};
    openDialog(editing?'借金を編集':'借金を追加',`${field('名称','name','text',target.name,'placeholder="例：カードローン" required')}${field('残高','balance','number',target.balance,'min="0" required')}${field('年利 %','apr','number',target.apr,'min="0" step="0.01" required')}${field('最低返済額 / 月','minPayment','number',target.minPayment,'min="0" required')}`,fd=>{const item={id:target.id||uid('debt'),name:clean(fd.get('name'),60),balance:Math.max(0,n(fd.get('balance'))),apr:Math.max(0,n(fd.get('apr'))),minPayment:Math.max(0,n(fd.get('minPayment')))};data.debts=editing?data.debts.map(x=>x.id===item.id?item:x):[...data.debts,item];dialog().close();save()});
  }
  function openRulesDialog(){
    openDialog('基本ルール',`${field('最低生活費 / 月','monthlyEssential','number',data.rules.monthlyEssential,'min="0"')}${field('生活の質を守る予算 / 月','qualityBudget','number',data.rules.qualityBudget,'min="0"')}${field('生活防衛資金の目標（月数）','emergencyMonths','number',data.rules.emergencyMonths,'min="0" max="24" step="0.5"')}<label><span>基本方針</span><textarea name="note" rows="3">${escapeHtml(data.rules.note)}</textarea></label>`,fd=>{data.rules={...data.rules,monthlyEssential:Math.max(0,n(fd.get('monthlyEssential'))),qualityBudget:Math.max(0,n(fd.get('qualityBudget'))),emergencyMonths:Math.max(0,n(fd.get('emergencyMonths'))),note:clean(fd.get('note'),240)};dialog().close();save()});
  }
  function openAssetDialog(asset){
    const editing=!!asset,target=asset||{name:'',type:'investment',value:''};
    openDialog(editing?'資産を編集':'資産を追加',`${field('名称','name','text',target.name,'placeholder="例：NISA / その他資産" required')}${selectField('種類','type',[['investment','投資'],['other','その他資産']],target.type)}${field('現在価値','value','number',target.value,'min="0" required')}`,fd=>{const item={id:target.id||uid('asset'),name:clean(fd.get('name'),60),type:clean(fd.get('type'),20),value:Math.max(0,n(fd.get('value'))),updatedAt:new Date().toISOString()};data.assets=editing?data.assets.map(x=>x.id===item.id?item:x):[...data.assets,item];dialog().close();save()});
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
    installShell();render();
    window.addEventListener('storage',e=>{if(e.key===KEY){data=state();render()}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){data=state();render()}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
