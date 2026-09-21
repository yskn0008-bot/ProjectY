'use strict';
(()=>{
const LIFE_KEY='yos-life-v1';
const HOME_KEY='yos-home-current-state-v1';
const MONEY_KEY='yos-life-v1';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
const clean=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const dateKey=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const amount=(value)=>{if(typeof value==='number'&&Number.isFinite(value))return `${value.toLocaleString('ja-JP')}円`;if(typeof value==='string'&&value.trim())return value.trim();return '未算出'};
function snapshot(){
 const life=read(LIFE_KEY,null); const today=life?.days?.[life.activeLifeDate||dateKey()]||life?.days?.[dateKey()]||{}; const state=read(HOME_KEY,{});
 const tasks=Array.isArray(today?.tasks)?today.tasks.filter(t=>clean(t?.text,80)):[];
 const nextTask=tasks.find(t=>!t.done)?.text;
 const schedule=Array.isArray(today?.schedule)?today.schedule:Array.isArray(today?.events)?today.events:[];
 const firstEvent=schedule[0];
 const shared=window.YOSSharedStateV1?.snapshot?.()?.money;
 const local=life?.moneySafety||today?.money||{};
 const free=shared?.connected?(shared.freeMoney??shared.balance):(local.freeMoney??local.balance??local.currentBalance);
 return {
  current:[state.energy?`体力 ${state.energy}`:'',clean(state.focus,48)].filter(Boolean).join('・')||'未設定',
  schedule:firstEvent?(clean(firstEvent.title||firstEvent.name,52)||'予定あり'):(schedule.length?`${schedule.length}件の予定`:'予定なし'),
  tasks:tasks.length?`${tasks.filter(t=>t.done).length}/${tasks.length} 完了`:'タスクなし',
  money:amount(free),
  next:clean(today?.nextAction)||clean(today?.priority)||clean(nextTask)||'未設定'
 };
}
function installStyle(){if(document.getElementById('my-way-dashboard-v2-style'))return;const style=document.createElement('style');style.id='my-way-dashboard-v2-style';style.textContent=`
:root{--mw-ivory:#f7f0df;--mw-sand:#eadfc5;--mw-green:#294f3d;--mw-gold:#b68a3c;--mw-glass:rgba(255,255,255,.72);--mw-line:rgba(46,74,57,.12)}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Hiragino Sans","Yu Gothic",sans-serif}
.home-v2-overview{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:12px 0 10px}
.home-v2-card{min-height:92px;padding:13px;border:1px solid var(--mw-line);border-radius:22px;background:linear-gradient(145deg,rgba(255,255,255,.84),rgba(247,240,223,.72));box-shadow:0 10px 28px rgba(52,65,50,.07);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);text-decoration:none;color:#263a30;display:flex;flex-direction:column;justify-content:space-between}
.home-v2-card small{font-size:10px;font-weight:800;color:#718076;letter-spacing:.04em}.home-v2-card strong{font-size:15px;line-height:1.35;letter-spacing:-.02em}.home-v2-card .mw-icon{font-size:18px;color:var(--mw-gold)}
.home-v2-card.next{grid-column:1/-1;min-height:104px;background:linear-gradient(135deg,#294f3d,#3c6a52);color:#fff;box-shadow:0 14px 32px rgba(41,79,61,.2)}.home-v2-card.next small{color:#dfeadf}.home-v2-card.next strong{font-size:19px}.home-v2-card.next .mw-icon{color:#f2d58d}
.home-v2-section-title{display:flex;align-items:end;justify-content:space-between;margin:18px 2px 8px}.home-v2-section-title div{display:grid;gap:2px}.home-v2-section-title small{font-size:9px;font-weight:900;color:#7b877e;letter-spacing:.13em}.home-v2-section-title b{font-size:18px;color:#24372d}.home-v2-section-title span{font-size:10px;color:#8a918b}
.home-scene{border-radius:30px!important}.yos-companion{border-radius:22px!important}.page{animation:mwFade .22s ease}@keyframes mwFade{from{opacity:.5;transform:translateY(3px)}to{opacity:1;transform:none}}
@media(max-width:360px){.home-v2-overview{gap:7px}.home-v2-card{padding:11px;min-height:88px}.home-v2-card strong{font-size:14px}}
`;
document.head.appendChild(style)}
function card(label,value,icon,href,extra=''){const a=document.createElement('a');a.className=`home-v2-card ${extra}`.trim();a.href=href;a.innerHTML=`<span class="mw-icon" aria-hidden="true">${icon}</span><small>${label}</small><strong></strong>`;a.querySelector('strong').textContent=value;return a}
function render(){const home=document.getElementById('homePage');if(!home)return;installStyle();let title=home.querySelector('.home-v2-section-title');let grid=home.querySelector('.home-v2-overview');if(!title){title=document.createElement('header');title.className='home-v2-section-title';title.innerHTML='<div><small>TODAY</small><b>今日の全体像</b></div><span>5つだけ見る</span>';const scene=home.querySelector('.home-scene');scene?.insertAdjacentElement('afterend',title)}if(!grid){grid=document.createElement('section');grid.className='home-v2-overview';grid.setAttribute('aria-label','MY WAY 今日の5領域');title.insertAdjacentElement('afterend',grid)}const s=snapshot();grid.replaceChildren(card('現在地',s.current,'◎','#'),card('予定',s.schedule,'◷','../life/'),card('タスク',s.tasks,'✓','../life/'),card('使える金',s.money,'¥','#money'),card('次の一手',s.next,'→','../life/','next'))}
window.addEventListener('storage',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();
