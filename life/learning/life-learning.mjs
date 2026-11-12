/** YOS 生活学習: pure, read-only suggestion engine. No I/O or persistence. */
const ACTIONS = new Set(['executed','postponed','rejected','accepted','ignored']);
const critical = item => item.critical === true || item.kind === 'safety' || item.kind === 'payment_due';
const validDate = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
function normalize(records) {
  if (!Array.isArray(records)) return [];
  const seen = new Set();
  return records.filter(x => {
    if (!x || typeof x.id !== 'string' || !x.id || seen.has(x.id) || !ACTIONS.has(x.action) || !validDate(x.at)) return false;
    seen.add(x.id);return true;
  }).map(x => ({...x, atMs:Date.parse(x.at)})).sort((a,b)=>a.atMs-b.atMs);
}
export function evaluateLifeLearning({records=[],tasks=[],interruptions=[],now,proposals=[]}={}) {
  if (!validDate(now)) return {status:'unavailable',suggestions:[],reason:'valid current time required'};
  const events=normalize(records), time=Date.parse(now), out=[];
  const add=(x)=>{if(!out.some(y=>y.key===x.key)) out.push(x)};
  // Only observed, explicit actions count. Silence is NEVER a negative signal.
  const byTask=new Map();
  for(const e of events) if(typeof e.taskId==='string') {const a=byTask.get(e.taskId)||[];a.push(e);byTask.set(e.taskId,a)}
  for(const t of Array.isArray(tasks)?tasks:[]) {
    if(!t || typeof t.id!=='string' || t.done===true) continue;
    const history=byTask.get(t.id)||[];
    const last=history.at(-1);
    if(validDate(t.dueAt) && Date.parse(t.dueAt)>=time && Date.parse(t.dueAt)-time<=86400000 && t.confirmed===true) {
      add({key:'deadline:'+t.id,type:'prevent',taskId:t.id,reason:'確認済みの期限が24時間以内',priority:critical(t)?'critical':'normal',notify:critical(t)?'important':'digest',requiresApproval:false});
    }
    if(last?.action==='postponed' && t.confirmed===true && typeof last.reason==='string' && last.reason.trim()) {
      add({key:'postpone:'+t.id,type:'replan',taskId:t.id,reason:'本人が延期理由を記録',priority:'low',notify:'digest',requiresApproval:true});
    }
  }
  // Work resumption is only proposed when there is an explicit, not superseded checkpoint.
  for(const x of Array.isArray(interruptions)?interruptions:[]) {
    if(!x || typeof x.taskId!=='string' || typeof x.nextStep!=='string' || !x.nextStep.trim() || !validDate(x.at) || x.resolved===true || x.confirmed!==true) continue;
    if(time-Date.parse(x.at)<0) continue;
    add({key:'resume:'+x.taskId,type:'resume',taskId:x.taskId,reason:'本人が確定した中断時の次の一手が残っている',nextStep:x.nextStep,priority:'low',notify:'digest',requiresApproval:true});
  }
  // Repeated sequence must be supported by at least 3 distinct days of recorded executions.
  const pairs=new Map(); const grouped=new Map();
  for(const e of events.filter(x=>x.action==='executed' && x.confirmed===true && typeof x.taskId==='string' && typeof x.day==='string')) {
    const a=grouped.get(e.day)||[];a.push(e);grouped.set(e.day,a);
  }
  for(const [day,es] of grouped){
    es.sort((a,b)=>a.atMs-b.atMs);
    const daily=new Set();
    for(let i=1;i<es.length;i++) if(es[i].taskId!==es[i-1].taskId && es[i].atMs-es[i-1].atMs<=7200000) daily.add(es[i-1].taskId+'|'+es[i].taskId);
    for(const k of daily){const days=pairs.get(k)||new Set();days.add(day);pairs.set(k,days)}
  }
  for(const [k,days] of pairs) if(days.size>=3){const [before,after]=k.split('|');add({key:'sequence:'+k,type:'sequence',taskId:after,afterTaskId:before,reason:'記録済みの別日3日以上で同じ実行順',priority:'low',notify:'digest',requiresApproval:true})}
  // Feedback controls optional proposals, never critical alerts. Rejections must be explicit.
  for(const p of Array.isArray(proposals)?proposals:[]){
    if(!p || typeof p.id!=='string' || !p.id || !p.reason || !p.evidence || p.confirmed!==true) continue;
    const responses=events.filter(e=>e.proposalId===p.id && e.action!=='ignored');
    if(responses.at(-1)?.action==='rejected' && !critical(p)) continue;
    add({key:'experience:'+p.id,type:'experience',reason:p.reason,priority:'low',notify:'digest',requiresApproval:true});
  }
  return {status:'ok',suggestions:out,observedEvents:events.length};
}
