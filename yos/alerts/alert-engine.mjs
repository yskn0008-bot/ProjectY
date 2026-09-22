export const PRIORITY = ['emergency','payment','money','task','routine','morning','night'];
const clean=v=>String(v??'').trim();
const dayKey=v=>{const d=new Date(v); return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(d)};
const stableKey=e=>clean(e.sourceId||e.id)||[e.kind,clean(e.title),clean(e.dueAt||e.date),Number(e.amount||0)].join('|');
export function classifyAlert(event, now=new Date()){
  const e={...event};
  if(e.completed||e.paid) return null;
  if(e.emergency===true || e.requiresImmediateAction===true || e.delayCausesMaterialHarm===true) return 'emergency';
  if(e.kind==='payment') return 'payment';
  if(e.kind==='money_anomaly') return 'money';
  if(e.kind==='task') return e.nativeReminderNotifies ? null : 'task';
  if(e.kind==='routine') return e.existingAutomationNotifies ? null : 'routine';
  return e.deferToNight ? 'night' : 'morning';
}
export function selectAlerts(events,{now=new Date(),notifiedKeys=[]}={}){
  const sent=new Set(notifiedKeys.map(clean)); const winners=new Map();
  for(const event of events||[]){ const channel=classifyAlert(event,now); if(!channel) continue; const key=stableKey(event); if(!key||sent.has(key)) continue; const prior=winners.get(key); if(!prior || PRIORITY.indexOf(channel)<PRIORITY.indexOf(prior.channel)) winners.set(key,{...event,key,channel}); }
  return [...winners.values()].sort((a,b)=>PRIORITY.indexOf(a.channel)-PRIORITY.indexOf(b.channel));
}
export function paymentCandidates(transactions,{now=new Date(),days=3}={}){
  const today=dayKey(now); const base=new Date(today+'T00:00:00+09:00');
  return (transactions||[]).filter(t=>t&&t.type==='expense'&&!['done','paid','completed'].includes(clean(t.status).toLowerCase())).map(t=>{ const date=clean(t.dueDate||t.date); const due=new Date(date+'T00:00:00+09:00'); const delta=Math.round((due-base)/86400000); return {...t,kind:'payment',dueAt:date,daysUntil:delta,sourceId:t.id||`money:${date}:${t.amount}:${t.title||t.merchant||''}`}; }).filter(t=>Number.isFinite(t.daysUntil)&&t.daysUntil>=0&&t.daysUntil<=days);
}
export function moneyCandidates({currentBalance=null,todayBudget=null,spentToday=null,transactions=[]}={}){
  const out=[]; const balance=Number(currentBalance), budget=Number(todayBudget), spent=Number(spentToday);
  if(Number.isFinite(budget)&&Number.isFinite(spent)&&spent>budget) out.push({kind:'money_anomaly',id:'money:daily-budget',title:'今日使える金額を超える見込み',amount:spent-budget});
  const pending=(transactions||[]).filter(t=>t&&t.type==='expense'&&!['done','paid','completed'].includes(clean(t.status).toLowerCase())).reduce((s,t)=>s+Number(t.amount||0),0);
  if(Number.isFinite(balance)&&balance-pending<0) out.push({kind:'money_anomaly',id:'money:projected-shortage',title:'近日中に資金不足の見込み',amount:Math.abs(balance-pending)});
  return out;
}