'use strict';
(()=>{
const KEYS={home:'yos-home-settings-v2',legacy:'yos-home-settings-v1',taxi:'yos-taxi-settings-v2',state:'yos-home-current-state-v1',life:'yos-life-v1',journeys:'hj-domain-journeys-v1',profile:'hj-user-profile-v1',scenes:'hj-daily-scenes-v1',idea:'yos-my-way-ideas-v1',legacyIdea:'yos-idea-memo-v1'};
const $=id=>document.getElementById(id);
const clean=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
const dateKey=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const settings=read(KEYS.home,{});
const state=read(KEYS.state,{});
const sharedUrl=()=>clean(settings.yosUrl||read(KEYS.legacy,{}).yosUrl||read(KEYS.taxi,{}).yosUrl,500);
const lifeData=()=>read(KEYS.life,null);
const todayData=(life=lifeData())=>life?.days?.[life.activeLifeDate||dateKey()]||life?.days?.[dateKey()]||null;
const set=(id,value)=>{const node=$(id);if(node)node.textContent=value};

function array(value){return Array.isArray(value)?value:[]}
function amountNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='string'||!value.trim())return null;
  const normalized=value.replace(/[¥￥円,\s]/g,'');
  return /^-?\d+(?:\.\d+)?$/.test(normalized)?Number(normalized):null;
}
function amountText(value,empty='未設定'){
  const number=amountNumber(value);
  if(number!==null)return `${number.toLocaleString('ja-JP')}円`;
  return clean(value,40)||empty;
}
function currentJourney(){
  const items=array(read(KEYS.journeys,[]));
  const focus=clean(read(KEYS.profile,{}).focusDomain,80);
  return items.find(item=>item?.id===focus)||items[0]||null;
}
function currentScenes(journey){
  const items=array(read(KEYS.scenes,[]));
  const scoped=journey?.id?items.filter(item=>!item?.domainId||item.domainId===journey.id):items;
  return [...scoped].sort((a,b)=>new Date(a?.occurredAt||a?.savedAt||0)-new Date(b?.occurredAt||b?.savedAt||0));
}
function renderIdentity(){
  const date=new Date();
  const hour=Number(new Intl.DateTimeFormat('ja-JP',{hour:'numeric',hourCycle:'h23',timeZone:'Asia/Tokyo'}).format(date));
  set('homeGreeting',`${hour<11?'おはよう':hour<18?'こんにちは':'こんばんは'}、ようすけ！`);
  set('homeDate',new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'numeric',day:'numeric',weekday:'short',timeZone:'Asia/Tokyo'}).format(date));
  set('moneyMonth',new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'long',timeZone:'Asia/Tokyo'}).format(date));
}
function renderHome(life,today,journey,scenes){
  const energy={low:'体力は低め',mid:'体力は普通',high:'体力は高め'}[state.energy];
  const checkin=[today?.checkin?.health&&`体調 ${today.checkin.health}/5`,today?.checkin?.mood&&`気分 ${today.checkin.mood}/5`].filter(Boolean).join('・');
  set('currentSummary',[energy,clean(state.focus,60)].filter(Boolean).join('。')||checkin||'未設定');
  set('destinationSummary',clean(journey?.theme)||clean(journey?.name)||'未設定');
  const tasks=array(today?.tasks).filter(task=>clean(task?.text,80));
  const completed=tasks.filter(task=>task.done).length;
  const routines=today?.routines&&typeof today.routines==='object'?Object.values(today.routines).reduce((sum,list)=>sum+array(list).length,0):0;
  const facts=[];
  if(tasks.length)facts.push(`タスク ${completed}/${tasks.length}`);
  if(routines)facts.push(`習慣 ${routines}件`);
  if(scenes.length)facts.push(`経験 ${scenes.length}件`);
  set('progressSummary',facts.join('・')||'データなし');
  const nextTask=tasks.find(task=>!task.done)?.text;
  set('nextSummary',clean(today?.nextAction)||clean(today?.priority)||clean(nextTask)||'未設定');
}
function renderMoney(life,today){
  const money=life?.moneySafety || today?.money || {};
  const income=money.income??money.monthlyIncome;
  const expense=money.expense??money.monthlyExpense??money.spentThisMonth;
  const explicitBalance=money.currentBalance??money.balance;
  const incomeNumber=amountNumber(income),expenseNumber=amountNumber(expense),balanceNumber=amountNumber(explicitBalance);
  const computedBalance=balanceNumber!==null?balanceNumber:incomeNumber!==null&&expenseNumber!==null?incomeNumber-expenseNumber:null;
  set('incomeSummary',amountText(income));
  set('expenseSummary',amountText(expense));
  set('balanceSummary',explicitBalance!==undefined&&explicitBalance!==null?amountText(explicitBalance,'未算出'):computedBalance!==null?amountText(computedBalance,'未算出'):'未算出');
  set('moneyRequired',amountText(money.requiredPayments));
  set('moneyProtected',amountText(money.protectedMoney));
  set('moneyFree',amountText(money.freeMoney,'未算出'));
  set('moneyNextPayment',clean(money.nextPayment,120)||'未設定');
  set('moneyGoal',clean(money.goal,120)||'未設定');
  const chartValues=[incomeNumber,expenseNumber,computedBalance].map(value=>value!==null?Math.max(0,value):null);
  const maximum=Math.max(0,...chartValues.filter(value=>value!==null));
  const hasChart=maximum>0&&chartValues.some(value=>value!==null);
  ['incomeBar','expenseBar','balanceBar'].forEach((id,index)=>$(id)?.style.setProperty('--value',hasChart&&chartValues[index]!==null?`${Math.max(5,Math.round(chartValues[index]/maximum*100))}%`:'0%'));
  document.querySelector('.money-chart')?.classList.toggle('has-data',hasChart);
  set('moneyChartState',hasChart?'実データを表示':'データなし');
  const donut=$('moneyDonut');
  const hasRatio=incomeNumber!==null&&incomeNumber>0&&expenseNumber!==null;
  if(donut)donut.style.setProperty('--spent',hasRatio?`${Math.min(360,Math.max(0,expenseNumber/incomeNumber*360))}deg`:'0deg');
  set('moneyDonutState',hasRatio?`支出 ${Math.round(expenseNumber/incomeNumber*100)}%`:'データなし');
}
function renderJourney(journey,scenes){
  const latest=scenes.at(-1);
  const sceneTitle=clean(latest?.title)||clean(latest?.fact)||clean(latest?.rawInput)||clean(latest?.choice)||clean(latest?.result);
  const sceneDetail=clean(latest?.reflection)||clean(latest?.result)||clean(latest?.next)||sceneTitle;
  set('journeyStage',clean(journey?.stage)||clean(journey?.name)||'未設定');
  set('journeyCount',scenes.length?`歩いてきた経験 ${scenes.length}件`:'経験データなし');
  set('journeyScene',sceneTitle||'データなし');
  set('recentExperience',sceneDetail||'データなし');
  set('nextTheme',clean(journey?.theme)||clean(latest?.next)||'未設定');
}
function renderIdea(){
  const primary=read(KEYS.idea,null);
  const legacy=read(KEYS.legacyIdea,{});
  const text=clean(primary?.text||primary?.memo||legacy?.text||legacy?.memo,1000);
  $('ideaMemo').value=text;
  set('recentIdea',text||'まだありません');
}
function render(){
  const life=lifeData(),today=todayData(life),journey=currentJourney(),scenes=currentScenes(journey);
  renderIdentity();renderHome(life,today,journey,scenes);renderMoney(life,today);renderJourney(journey,scenes);renderIdea();
}

const titles={home:'MY WAY',money:'MY MONEY',journey:'MY JOURNEY',idea:'MY IDEA',archive:'MY WAY'};
function showPage(name){
  if(!titles[name])name='home';
  document.querySelectorAll('[data-page-panel]').forEach(panel=>{const active=panel.dataset.pagePanel===name;panel.hidden=!active;panel.classList.toggle('active',active)});
  document.querySelectorAll('.bottom-nav [data-page]').forEach(item=>item.classList.toggle('active',item.dataset.page===name));
  set('brandTitle',titles[name]);
  document.body.dataset.domain=name;
  const nextHash=name==='home'?'':`#${name}`;
  if(location.hash!==nextHash)history.replaceState(null,'',`${location.pathname}${location.search}${nextHash}`);
  const resetScroll=()=>{document.documentElement.scrollTop=0;document.body.scrollTop=0;window.scrollTo(0,0)};
  resetScroll();
  requestAnimationFrame(resetScroll);
}
async function openYos(prompt){
  try{await navigator.clipboard.writeText(prompt)}catch{}
  const url=sharedUrl();
  $('menuDialog').close();
  if(url.startsWith('https://chatgpt.com/')){location.href=url;return}
  set('appStatus','現在のYOSチャットURLを設定してください。');
  $('yosUrl').value=url;
  $('settingsDialog').showModal();
}
document.querySelectorAll('[data-page]').forEach(item=>item.addEventListener('click',()=>showPage(item.dataset.page)));
document.querySelectorAll('[data-prompt]').forEach(item=>item.addEventListener('click',()=>openYos(item.dataset.prompt)));
$('openMenu').addEventListener('click',()=>$('menuDialog').showModal());
$('menuDialog').querySelector('.close').addEventListener('click',()=>$('menuDialog').close());
$('openSettings').addEventListener('click',()=>{$('menuDialog').close();$('yosUrl').value=sharedUrl();$('settingsDialog').showModal()});
$('saveUrl').addEventListener('click',()=>{settings.yosUrl=clean($('yosUrl').value,500);write(KEYS.home,settings)});
$('focusIdea').addEventListener('click',()=>$('ideaMemo').focus());
$('saveIdea').addEventListener('click',()=>{
  const text=clean($('ideaMemo').value,1000);
  const saved=write(KEYS.idea,{text,memo:text,savedAt:new Date().toISOString()});
  set('recentIdea',text||'まだありません');
  set('appStatus',saved?'アイデアメモを保存しました。':'保存できませんでした。');
});
render();
const initial=location.hash.slice(1);
showPage(['money','journey','idea','archive'].includes(initial)?initial:'home');
window.addEventListener('storage',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
})();
