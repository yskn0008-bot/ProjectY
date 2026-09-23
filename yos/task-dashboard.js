'use strict';
(()=>{
  const API='https://project-y-yos-ai.vercel.app';
  const AUTH_ORIGIN='https://yskn0008-bot.github.io';
  const GOOGLE_SCRIPT_URL='https://accounts.google.com/gsi/client';
  const CACHE_KEY='yos-task-dashboard-cache-v1';
  const CACHE_MAX_MS=6*60*60*1000;
  const LIFE_KEY='yos-life-v1';
  const HOME_STATE_KEY='yos-home-current-state-v1';
  const JOURNEYS_KEY='hj-domain-journeys-v1';
  const PROFILE_KEY='hj-user-profile-v1';
  const MONEY_KEY='yos-money-v2';
  const IDEA_KEY='yos-my-way-ideas-v1';
  const SHARED_KEY='yos-shared-state-v1';
  let credential='';
  let initialized=false;
  let authSetupPromise=null;
  let latestTaskData={tasks:[]};

  function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
  function clean(value,max=140){return typeof value==='string'?value.trim().slice(0,max):''}
  function cleanTitle(value){return String(value||'').replace(/^\d{1,3}\s*[｜|]\s*/u,'').trim()||'名称未設定'}
  function padOrder(value){return String(Number(value)||0).padStart(2,'0')}
  function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
  function dateKey(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date())}
  function dueLabel(value){if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(d)}
  function timeLabel(value){if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';return new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(d)}
  function amountNumber(value){if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value!=='string'||!value.trim())return null;const normalized=value.replace(/[¥￥円,\s]/g,'');return /^-?\d+(?:\.\d+)?$/.test(normalized)?Number(normalized):null}
  function amountText(value,empty='未連携'){const number=amountNumber(value);if(number!==null)return `${number.toLocaleString('ja-JP')}円`;return clean(value,40)||empty}
  function meta(task){const bits=[];const due=dueLabel(task.due);if(due)bits.push(`期限 ${due}`);if(task.state)bits.push(task.state);if(task.owner)bits.push(`担当 ${task.owner}`);return bits}
  function detailLine(label,value){if(!value)return null;const p=el('p');p.append(el('b','',label),document.createTextNode(value));return p}
  function canPrepareAuth(){return location.origin===AUTH_ORIGIN}

  function taskRow(task){
    const details=el('details','task-row');const summary=el('summary');summary.append(el('span','task-order',padOrder(task.order)));
    const copy=el('span','task-copy');copy.append(el('b','',cleanTitle(task.title)));const small=el('small');for(const bit of meta(task))small.append(el('span','',bit));copy.append(small);summary.append(copy,el('span','task-state',task.priority||task.state||'Task'));details.append(summary);
    const body=el('div','task-details');for(const line of [detailLine('次の一手',task.nextAction),detailLine('完了条件',task.completion),detailLine('ブロッカー',task.blocker),detailLine('確認済み証拠',task.evidence)])if(line)body.append(line);if(!body.childElementCount)body.append(el('p','task-empty','詳細はまだありません'));details.append(body);return details;
  }

  function groupTasks(tasks){
    const ordered=[...tasks].sort((a,b)=>Number(a.order)-Number(b.order));
    const active=ordered.filter(t=>t.state==='実行中'||t.state==='本人操作');
    return {active,next:ordered.filter(t=>t.state==='次にやる'),waiting:ordered.filter(t=>t.state==='待ち'),hold:ordered.filter(t=>t.state==='保留'),done:ordered.filter(t=>t.state==='完了')};
  }

  function sharedSnapshot(){return window.YOSSharedStateV1?.snapshot?.()||readLocal(SHARED_KEY,null)}
  function localSnapshot(){
    const life=readLocal(LIFE_KEY,null);
    const today=life?.days?.[life.activeLifeDate||dateKey()]||life?.days?.[dateKey()]||null;
    const state=readLocal(HOME_STATE_KEY,{});
    const profile=readLocal(PROFILE_KEY,{});
    const journeysValue=readLocal(JOURNEYS_KEY,[]);
    const journeys=Array.isArray(journeysValue)?journeysValue:[];
    const journey=journeys.find(item=>item?.id===profile.focusDomain)||journeys[0]||null;
    const shared=sharedSnapshot();
    const money=shared?.money||null;
    const idea=shared?.idea||readLocal(IDEA_KEY,null);
    return {life,today,state,journey,money,idea,shared};
  }

  function scheduleSnapshot(today){
    const now=Date.now();
    const events=(Array.isArray(today?.schedule)?today.schedule:[]).filter(event=>event?.start&&event?.end).map(event=>({...event,startMs:new Date(event.start).getTime(),endMs:new Date(event.end).getTime()})).filter(event=>Number.isFinite(event.startMs)&&Number.isFinite(event.endMs)).sort((a,b)=>a.startMs-b.startMs);
    const current=events.find(event=>event.startMs<=now&&event.endMs>now)||null;
    const upcoming=events.filter(event=>event.endMs>now).slice(0,2);
    return {events,current,upcoming};
  }

  const moneyOutgoing=tx=>['expense','debt','saving','investment'].includes(tx?.type);
  const moneyComplete=tx=>Boolean(tx?.completed||tx?.paid||tx?.received)||['done','paid','completed','received'].includes(clean(tx?.status,20).toLowerCase());
  function moneyDateParts(date){
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));
    if(!match)return null;
    const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
    const value=new Date(Date.UTC(year,month-1,day));
    if(value.getUTCFullYear()!==year||value.getUTCMonth()+1!==month||value.getUTCDate()!==day)return null;
    return {year,month,day,weekday:value.getUTCDay(),nth:Math.floor((day-1)/7)+1};
  }
  function moneyAddDays(date,amount){
    const value=new Date(`${date}T12:00:00+09:00`);
    value.setDate(value.getDate()+amount);
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(value);
  }
  function moneyMonthEnd(date=dateKey()){
    const parts=moneyDateParts(date);if(!parts)return date;
    return `${parts.year}-${String(parts.month).padStart(2,'0')}-${String(new Date(parts.year,parts.month,0).getDate()).padStart(2,'0')}`;
  }
  function moneyCalendarMatch(item,date){
    const parts=moneyDateParts(date),rule=item?.rule||{};if(!parts)return false;
    if(rule.type==='weekly')return Array.isArray(rule.weekdays)&&rule.weekdays.includes(parts.weekday);
    if(rule.type==='nth-weekday')return Number(rule.weekday)===parts.weekday&&Array.isArray(rule.nth)&&rule.nth.includes(parts.nth);
    if(rule.type==='monthly')return Number(rule.day)===parts.day;
    if(rule.type==='monthly-next-weekday'){
      const base=`${parts.year}-${String(parts.month).padStart(2,'0')}-${String(Number(rule.day)).padStart(2,'0')}`;
      const bp=moneyDateParts(base);if(!bp)return false;
      const shift=bp.weekday===6?2:bp.weekday===0?1:0;
      return moneyAddDays(base,shift)===date;
    }
    if(rule.type==='interval-months'){
      const anchor=/^(\d{4})-(\d{2})$/.exec(String(rule.anchorMonth||''));
      if(!anchor||Number(rule.day)!==parts.day)return false;
      const interval=Math.max(1,Number(rule.intervalMonths)||1);
      const months=(parts.year-Number(anchor[1]))*12+parts.month-Number(anchor[2]);
      return months>=0&&months%interval===0;
    }
    return false;
  }
  function moneyTitleKey(value){
    return clean(value,120).toLowerCase().replace(/[（(][^）)]*[）)]/g,'').replace(/住居|支払い|料金|プレミアム/g,'').replace(/[\s　・+＋\-ー_]/g,'');
  }
  function sameMoneyCalendarTitle(a,b){
    const left=moneyTitleKey(a),right=moneyTitleKey(b);
    return Boolean(left&&right&&(left===right||left.includes(right)||right.includes(left)));
  }
  function moneyDateFromCalendar(tx,life){
    const own=clean(tx?.date,10);if(moneyDateParts(own))return own;
    const calendar=Array.isArray(life?.lifeCalendar)?life.lifeCalendar:[];
    const item=calendar.find(entry=>entry?.enabled!==false&&sameMoneyCalendarTitle(tx?.label,entry?.title));
    if(!item)return'';
    for(let offset=0;offset<=62;offset++){
      const candidate=moneyAddDays(dateKey(),offset);
      if(moneyCalendarMatch(item,candidate))return candidate;
    }
    return'';
  }
  function moneyMD(value){
    const parts=moneyDateParts(value);return parts?`${parts.month}/${parts.day}`:clean(value,10);
  }
  function moneyYen(value){
    const number=amountNumber(value);return number===null?'':`${Math.round(number).toLocaleString('ja-JP')}円`;
  }
  function moneyEventText(tx,privacy=false){
    if(!tx)return'';
    const date=moneyMD(tx.viewDate||tx.date),label=clean(tx.label,70)||'名称未設定',number=amountNumber(tx.amount);
    const approx=tx.type==='income'&&(tx.amountApproximate===true||clean(tx.certainty,20)==='見込み');
    const amount=number===null?'':privacy?'非表示':`${approx?'約':''}${moneyYen(number)}`;
    return [date,label,amount].filter(Boolean).join(' ');
  }
  function moneyTimeline(events,nextIncome){
    const grouped=new Map();
    for(const tx of events){
      const date=tx.viewDate||tx.date;if(!date)continue;
      if(!grouped.has(date))grouped.set(date,[]);
      const labels=grouped.get(date),label=clean(tx.label,40)||'名称未設定';
      if(!labels.some(item=>moneyTitleKey(item)===moneyTitleKey(label)))labels.push(label);
    }
    const groups=[...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,labels])=>({date,text:`${moneyMD(date)} ${labels.join('・')}`}));
    if(groups.length<=4)return groups;
    const incomeDate=nextIncome?.viewDate||nextIncome?.date||'';
    const incomeGroup=incomeDate?groups.find(group=>group.date===incomeDate):null;
    const result=groups.filter(group=>!incomeGroup||group.date!==incomeGroup.date).slice(0,3);
    if(incomeGroup)result.push(incomeGroup);else result.push(groups[3]);
    return result.sort((a,b)=>a.date.localeCompare(b.date));
  }
  function moneySnapshot(sharedMoney,life,today){
    const raw=readLocal(MONEY_KEY,null);
    if(sharedMoney?.connected||raw){
      const privacy=Boolean(sharedMoney?.privacy??raw?.privacy);
      const rawTransactions=Array.isArray(raw?.transactions)?raw.transactions:[];
      const seen=new Set();
      const events=rawTransactions
        .filter(tx=>tx&&['income','expense','debt','saving','investment'].includes(tx.type)&&!moneyComplete(tx))
        .map(tx=>({...tx,viewDate:moneyDateFromCalendar(tx,life)}))
        .filter(tx=>tx.viewDate&&tx.viewDate>=dateKey())
        .sort((a,b)=>a.viewDate.localeCompare(b.viewDate)||String(a.id||'').localeCompare(String(b.id||'')))
        .filter(tx=>{const key=[tx.viewDate,moneyTitleKey(tx.label),amountNumber(tx.amount),tx.type].join('|');if(seen.has(key))return false;seen.add(key);return true});
      const nextPayment=events.find(moneyOutgoing)||sharedMoney?.nextPayment||null;
      const nextIncome=events.find(tx=>tx.type==='income')||sharedMoney?.nextIncome||null;
      const balanceNumber=amountNumber(sharedMoney?.balance);
      const goalObject=sharedMoney?.goal&&typeof sharedMoney.goal==='object'?sharedMoney.goal:null;
      const goalCurrent=amountNumber(sharedMoney?.goalCurrent??goalObject?.current);
      const goalTarget=amountNumber(sharedMoney?.goalTarget??goalObject?.target);
      const goalCheckpoint=amountNumber(sharedMoney?.goalCheckpoint??goalObject?.checkpoint);
      const rawGoalProgress=Number(sharedMoney?.goalProgressPercent);
      const rawCheckpointProgress=Number(sharedMoney?.goalCheckpointProgressPercent);
      const goalProgressPercent=Number.isFinite(rawGoalProgress)?Math.min(100,Math.max(0,Math.round(rawGoalProgress))):(goalTarget!==null&&goalTarget>0?Math.min(100,Math.max(0,Math.round((goalCurrent||0)/goalTarget*100))):null);
      const goalCheckpointProgressPercent=Number.isFinite(rawCheckpointProgress)?Math.min(100,Math.max(0,Math.round(rawCheckpointProgress))):(goalCheckpoint!==null&&goalCheckpoint>0?Math.min(100,Math.max(0,Math.round((goalCurrent||0)/goalCheckpoint*100))):null);
      const anchor=clean(nextIncome?.viewDate||nextIncome?.date,10)||moneyMonthEnd();
      const outgoingUntilAnchor=events.filter(tx=>moneyOutgoing(tx)&&tx.viewDate<=anchor).reduce((sum,tx)=>sum+(amountNumber(tx.amount)||0),0);
      const balanceAfterRequiredPayments=balanceNumber===null?null:balanceNumber-outgoingUntilAnchor;
      const shortagePossible=balanceAfterRequiredPayments!==null&&balanceAfterRequiredPayments<0;
      const shortfall=shortagePossible?Math.abs(balanceAfterRequiredPayments):0;
      const latestPayment=events.filter(tx=>moneyOutgoing(tx)&&tx.viewDate<=anchor).at(-1)||null;
      const monthEnd=moneyMonthEnd();
      const shortageScope=latestPayment&&latestPayment.viewDate<=monthEnd&&(!nextIncome||anchor>monthEnd)?'月末まで':nextIncome?'次の入金まで':'今後の支払いで';
      return {
        connected:true,
        privacy,
        balance:privacy&&balanceNumber!==null?'非表示':balanceNumber!==null?moneyYen(balanceNumber):(clean(sharedMoney?.balanceText,40)||'未設定'),
        balanceNumber,
        nextPayment,
        nextPaymentText:moneyEventText(nextPayment,privacy),
        nextIncome,
        nextIncomeText:moneyEventText(nextIncome,privacy),
        shortagePossible,
        shortfall,
        shortageText:shortagePossible?(privacy?`${shortageScope} 不足あり`:`${shortageScope} ${moneyYen(shortfall)}不足`):'',
        timeline:moneyTimeline(events,nextIncome),
        goal:clean(sharedMoney?.goalText,100),
        goalCurrent,
        goalTarget,
        goalCheckpoint,
        goalProgressPercent,
        goalCheckpointProgressPercent,
        goalPurpose:clean(sharedMoney?.goalPurpose||goalObject?.purpose,160),
        goalPriorityLabel:clean(sharedMoney?.goalPriorityLabel||goalObject?.priorityLabel,20),
        events
      };
    }
    const money=life?.moneySafety||today?.money||{};
    const income=money.income??money.monthlyIncome;
    const expense=money.expense??money.monthlyExpense??money.spentThisMonth;
    const explicitBalance=money.currentBalance??money.balance;
    const incomeNumber=amountNumber(income),expenseNumber=amountNumber(expense),balanceNumber=amountNumber(explicitBalance);
    const computedBalance=balanceNumber!==null?balanceNumber:incomeNumber!==null&&expenseNumber!==null?incomeNumber-expenseNumber:null;
    return {
      balance:computedBalance!==null?amountText(computedBalance):amountText(explicitBalance),
      balanceNumber:computedBalance,
      nextPayment:null,
      nextPaymentText:clean(money.nextPayment,100),
      nextIncome:null,
      nextIncomeText:'',
      shortagePossible:false,
      shortfall:0,
      shortageText:'',
      timeline:[],
      goal:clean(money.goal,100),
      goalCurrent:null,
      goalTarget:null,
      goalCheckpoint:null,
      goalProgressPercent:null,
      goalCheckpointProgressPercent:null,
      goalPurpose:'',
      goalPriorityLabel:'',
      connected:Boolean(Object.keys(money).length)
    };
  }

  function lifeOpenTasks(today){return (Array.isArray(today?.tasks)?today.tasks:[]).filter(task=>clean(task?.text,120)&&!task.done)}
  function taskSummary(task){if(!task)return'';return clean(task.nextAction,160)||cleanTitle(task.title)}

  function cockpitFacts(data){
    const groups=groupTasks(Array.isArray(data?.tasks)?data.tasks:[]);
    const {life,today,state,journey,money:sharedMoney,idea}=localSnapshot();
    const schedule=scheduleSnapshot(today);
    const money=moneySnapshot(sharedMoney,life,today);
    const lifeTasks=lifeOpenTasks(today);
    const activeTask=groups.active[0]||null;
    const secondActive=groups.active[1]||null;
    const nextTask=groups.next[0]||null;
    const currentEvent=schedule.current;
    const firstUpcoming=schedule.upcoming[0]||null;
    const secondUpcoming=schedule.upcoming[1]||null;

    const nowText=taskSummary(activeTask)||clean(today?.nextAction,160)||clean(today?.priority,160)||clean(lifeTasks[0]?.text,160)||(currentEvent?`${clean(currentEvent.title,100)||'予定'} を実行中`:'今すぐの指定なし');
    const nextText=taskSummary(secondActive)||taskSummary(nextTask)||clean(lifeTasks[1]?.text,160)||clean(journey?.quest,160)||(firstUpcoming&&!currentEvent?`${timeLabel(firstUpcoming.start)} ${clean(firstUpcoming.title,100)||'予定'}`:secondUpcoming?`${timeLabel(secondUpcoming.start)} ${clean(secondUpcoming.title,100)||'予定'}`:'次の指定なし');

    const health=today?.checkin?.health?`体調 ${today.checkin.health}/5`:'';
    const mood=today?.checkin?.mood?`気分 ${today.checkin.mood}/5`:'';
    const energy={low:'体力低め',mid:'体力ふつう',high:'体力高め'}[state.energy]||'';
    const todayBits=[new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date()),energy||health,mood,`${schedule.events.length}予定`,`${lifeTasks.length}未完了`].filter(Boolean);

    const manual=groups.active.find(task=>task.state==='本人操作');
    const blocked=[...groups.active,...groups.next].find(task=>clean(task.blocker,160));
    const important=manual?`本人操作：${taskSummary(manual)}`:blocked?`ブロッカー：${clean(blocked.blocker,160)}`:money.nextPaymentText?`近い支払い：${money.nextPaymentText}`:clean(today?.note,160)?clean(today.note,160):clean(journey?.theme,160)?`今のテーマ：${clean(journey.theme,160)}`:clean(idea?.text||idea?.memo,160)?`最近のIdea：${clean(idea.text||idea.memo,160)}`:'特記事項なし';

    const schedulePrimary=currentEvent?`進行中 ${timeLabel(currentEvent.start)}–${timeLabel(currentEvent.end)} ${clean(currentEvent.title,100)||'予定'}`:firstUpcoming?`${timeLabel(firstUpcoming.start)} ${clean(firstUpcoming.title,100)||'予定'}`:schedule.events.length?'今日の予定は終了':'予定なし';
    const scheduleSecondary=currentEvent&&firstUpcoming&&firstUpcoming!==currentEvent?`次 ${timeLabel(firstUpcoming.start)} ${clean(firstUpcoming.title,80)||'予定'}`:secondUpcoming?`次 ${timeLabel(secondUpcoming.start)} ${clean(secondUpcoming.title,80)||'予定'}`:life?'Life連携済み':'Life未連携';
    return {groups,today:todayBits.join(' ・ '),nowText,nextText,schedulePrimary,scheduleSecondary,money,important};
  }

  function cockpitCard(label,value,sub,kind){
    const article=el('article',`cockpit-card ${kind||''}`.trim());article.append(el('small','cockpit-label',label),el('strong','cockpit-value',value));if(sub)article.append(el('span','cockpit-sub',sub));return article;
  }

  function moneyDecisionCard(money){
    const article=el('article','cockpit-card money-decision-card cockpit-link');
    article.tabIndex=0;article.setAttribute('role','button');article.setAttribute('aria-label','Money詳細を開く');
    const open=()=>document.querySelector('.money-nav')?.click();
    article.addEventListener('click',open);
    article.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});

    const head=el('div','money-decision-head');
    const goalPct=Number.isFinite(Number(money?.goalProgressPercent))?Math.min(100,Math.max(0,Math.round(Number(money.goalProgressPercent)))):null;
    const goalProgressLabel=money?.goal?`${money.goal}${goalPct===null?'':` ${goalPct}%`} ›`:'Money ›';
    const goalOpen=el('span','money-decision-open',goalProgressLabel);
    if(money?.goal&&money.goalCurrent!==null&&money.goalTarget!==null){
      const checkpoint=money.goalCheckpoint!==null&&money.goalCheckpoint>0?` ・ 第1チェック ${moneyYen(money.goalCheckpoint)}`:'';
      goalOpen.setAttribute('aria-label',`${money.goal} 進捗 ${moneyYen(money.goalCurrent)} / ${moneyYen(money.goalTarget)}${checkpoint}`);
    }
    head.append(el('small','cockpit-label','お金'),goalOpen);
    article.append(head);

    const top=el('div','money-decision-top');
    const current=el('div','money-decision-current');
    current.append(el('small','','今使える'),el('strong','',money?.balance||'未設定'));
    top.append(current);
    if(money?.shortageText){
      const warning=el('div','money-decision-warning');
      warning.append(el('small','','不足見込み'),el('strong','',money.shortageText));
      top.append(warning);
    }
    article.append(top);

    const next=el('div','money-decision-next');
    const payment=el('div');payment.append(el('small','','次の支払い'),el('strong','',money?.nextPaymentText||'予定なし'));
    const income=el('div');income.append(el('small','','次の入金'),el('strong','',money?.nextIncomeText||'未設定'));
    next.append(payment,income);article.append(next);

    if(Array.isArray(money?.timeline)&&money.timeline.length){
      const timeline=el('div','money-mini-timeline');
      timeline.append(el('small','','時系列'));
      const list=el('ol');
      money.timeline.forEach(item=>list.append(el('li','',item.text)));
      timeline.append(list);article.append(timeline);
    }
    return article;
  }

  function render(data,statusText='最新の状態'){
    latestTaskData=data&&Array.isArray(data.tasks)?data:{tasks:[]};
    const host=document.getElementById('taskDashboardBody');if(!host)return;host.replaceChildren();const facts=cockpitFacts(latestTaskData);
    const status=document.getElementById('taskDashboardStatus');if(status)status.textContent=statusText;

    host.append(cockpitCard('今日',facts.today||'今日の状態を確認中','', 'today-card'));
    host.append(cockpitCard('今やる',facts.nowText,'最優先はこれだけ','now-card'));

    const grid=el('div','cockpit-grid');
    grid.append(cockpitCard('次',facts.nextText,'今が終わったら','next-card'));
    const scheduleCard=cockpitCard('予定',facts.schedulePrimary,facts.scheduleSecondary,'schedule-card cockpit-link');scheduleCard.tabIndex=0;scheduleCard.setAttribute('role','button');scheduleCard.addEventListener('click',()=>{location.href='../life/'});scheduleCard.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();location.href='../life/'}});grid.append(scheduleCard);
    grid.append(moneyDecisionCard(facts.money));
    grid.append(cockpitCard('重要なこと',facts.important,'見落とし防止','important-card'));
    host.append(grid);

    document.getElementById('taskDashboardDetails')?.remove();
    const details=el('details','cockpit-details task-dashboard-details');details.id='taskDashboardDetails';const summary=el('summary','','タスク詳細を見る');details.append(summary);
    const activeTitle=el('div','task-section-title');activeTitle.append(el('h3','','今やる'),el('span','',`${facts.groups.active.length}件`));details.append(activeTitle);
    const activeList=el('div','task-list');facts.groups.active.slice(0,3).forEach(t=>activeList.append(taskRow(t)));if(!activeList.childElementCount)activeList.append(el('p','task-empty','今すぐのタスクはありません'));details.append(activeList);
    const nextTitle=el('div','task-section-title');nextTitle.append(el('h3','','次'),el('span','',`${facts.groups.next.length}件`));details.append(nextTitle);
    const nextList=el('div','task-list task-next-list');facts.groups.next.slice(0,4).forEach(t=>nextList.append(taskRow(t)));if(!nextList.childElementCount)nextList.append(el('p','task-empty','次のタスクはありません'));details.append(nextList);
    const buckets=el('div','task-buckets');[['待ち',facts.groups.waiting],['保留',facts.groups.hold],['完了',facts.groups.done]].forEach(([label,list])=>{const d=el('details');const s=el('summary');s.append(el('b','',label),el('span','',String(list.length)));d.append(s);const content=el('div','bucket-content');list.forEach(t=>content.append(taskRow(t)));if(!list.length)content.append(el('p','task-empty','ありません'));d.append(content);buckets.append(d)});details.append(buckets);document.getElementById('taskDashboard')?.after(details);
    const auth=document.getElementById('taskDashboardAuth');if(auth)auth.hidden=true;
  }

  function readCache(){try{const parsed=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(!parsed||!Array.isArray(parsed.data?.tasks))return null;return parsed}catch{return null}}
  function writeCache(data){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch{}}

  async function loadTasks(token){
    const response=await fetch(`${API}/api/yos/tasks`,{method:'GET',headers:{Authorization:`Bearer ${token}`,'Accept':'application/json'},cache:'no-store',credentials:'omit'});if(!response.ok)throw new Error(`tasks ${response.status}`);const data=await response.json();if(!Array.isArray(data.tasks))throw new Error('invalid tasks');writeCache(data);render(data,'更新済み');
  }

  async function loadPublicConfig(){const response=await fetch(`${API}/api/yos/public-config`,{headers:{Accept:'application/json'},cache:'no-store',credentials:'omit'});if(!response.ok)throw new Error('config');const config=await response.json();if(typeof config.googleClientId!=='string'||!config.googleClientId.endsWith('.apps.googleusercontent.com'))throw new Error('google client');return config}
  function loadGoogleScript(){return new Promise((resolve,reject)=>{if(globalThis.google?.accounts?.id)return resolve(globalThis.google.accounts.id);const existing=document.querySelector(`script[src="${GOOGLE_SCRIPT_URL}"]`);const s=existing||document.createElement('script');const timeout=setTimeout(()=>reject(new Error('google timeout')),15000);const ready=()=>{clearTimeout(timeout);if(globalThis.google?.accounts?.id)resolve(globalThis.google.accounts.id);else reject(new Error('google unavailable'))};s.addEventListener('load',ready,{once:true});s.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('google unavailable'))},{once:true});if(!existing){s.src=GOOGLE_SCRIPT_URL;s.async=true;s.defer=true;s.referrerPolicy='strict-origin-when-cross-origin';s.dataset.yosTasksGoogle='1';document.head.append(s)}})}

  async function setupAuth(){
    if(!canPrepareAuth()||initialized)return;
    if(authSetupPromise)return authSetupPromise;
    authSetupPromise=Promise.all([loadPublicConfig(),loadGoogleScript()]).then(([config,googleId])=>{
      const host=document.getElementById('taskDashboardGoogleButton');if(!host)throw new Error('google host');
      googleId.initialize({client_id:config.googleClientId,callback:async response=>{credential=String(response?.credential||'').trim();if(!credential){showAuth('Google本人確認に失敗しました。もう一度お試しください。');return}document.getElementById('taskDashboardStatus').textContent='更新中';try{await loadTasks(credential)}catch{showAuth('更新できませんでした。もう一度お試しください。')}},auto_select:false,cancel_on_tap_outside:true,context:'signin',itp_support:true,use_fedcm_for_prompt:true});
      host.replaceChildren();
      googleId.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(320,Math.max(220,Math.floor(host.getBoundingClientRect().width||280)))});
      initialized=true;
    }).catch(()=>{showAuth('Google本人確認を読み込めませんでした。ページを再読み込みしてください。')}).finally(()=>{authSetupPromise=null});
    return authSetupPromise;
  }
  function showAuth(message){const auth=document.getElementById('taskDashboardAuth');if(!auth)return;auth.hidden=false;const p=auth.querySelector('p');if(p)p.textContent=message}

  function install(){
    const home=document.getElementById('homePage');const scene=home?.querySelector('.home-scene');if(!home||!scene||document.getElementById('taskDashboard'))return;
    const dashboard=el('section','task-dashboard cockpit-dashboard');dashboard.id='taskDashboard';dashboard.setAttribute('aria-label','今日の運転席');
    const header=el('header');const title=el('div');title.append(el('small','','TODAY'),el('h2','','今日の運転席'));const status=el('span','task-dashboard-status','端末データ');status.id='taskDashboardStatus';header.append(title,status);dashboard.append(header);
    const body=el('div','cockpit-body');body.id='taskDashboardBody';body.append(el('p','task-empty','今日の状態を読み込んでいます'));dashboard.append(body);
    const auth=el('div','task-auth');auth.id='taskDashboardAuth';auth.hidden=true;auth.append(el('p','','YOS Tasksを最新にするにはGoogle本人確認が必要です。'));const googleButton=el('div','task-google-button');googleButton.id='taskDashboardGoogleButton';auth.append(googleButton);dashboard.append(auth);scene.before(dashboard);
    const map=el('details','life-map-details');const summary=el('summary','','人生ナビ・詳細を見る');scene.before(map);map.append(summary,scene);home.classList.add('task-dashboard-ready','cockpit-ready');
    const cached=readCache();if(cached){const age=Date.now()-Number(cached.savedAt||0);render(cached.data,age<CACHE_MAX_MS?'前回のTasks':'Tasks更新待ち');if(age>=CACHE_MAX_MS){showAuth('YOS Tasksは更新待ちです。Google本人確認で最新化できます。');setupAuth()}}else{render({tasks:[]},'端末連携');showAuth('GitHub Tasksは未連携です。本人確認すると「今やる」「次」に追加統合します。');setupAuth()}
  }

  window.addEventListener('storage',event=>{if([LIFE_KEY,HOME_STATE_KEY,JOURNEYS_KEY,PROFILE_KEY,MONEY_KEY,IDEA_KEY,SHARED_KEY,CACHE_KEY].includes(event.key))render(readCache()?.data||latestTaskData,'更新');});
  window.addEventListener('yos:shared-state-changed',()=>render(readCache()?.data||latestTaskData,'端末連携'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render(readCache()?.data||latestTaskData,document.getElementById('taskDashboardStatus')?.textContent||'更新')});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
