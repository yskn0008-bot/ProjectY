/**
 * Read-only adapter for EXISTING Notion YOS Tasks and YOS 生活イベント rows.
 * No API calls, persistence, external effects, or guesses about user behavior.
 */
const knownState=new Set(['次にやる','実行中','待ち','本人操作','保留','完了']);
const knownKinds=new Set(['外出','帰宅','運動','掃除','就寝準備','その他']);
const text=x=>typeof x==='string'?x.trim():'';
const exactInstant=x=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x||'')&&/(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const sourceId=(x)=>{const m=text(x).match(/\/([0-9a-f]{32})(?:\?|$)/i);return m?.[1]||''};
function pullRows(value){
  if(Array.isArray(value))return value;
  if(Array.isArray(value?.results))return value.results;
  return null;
}
export function adaptExistingNotionRows({taskRows,eventRows}={}){
  const tasksIn=pullRows(taskRows),eventsIn=pullRows(eventRows);
  const available={tasks:!!tasksIn,events:!!eventsIn};
  const tasks=[],eventMarkers=[],seenTasks=new Set(),seenEvents=new Set();
  for(const row of tasksIn||[]){
    const id=sourceId(row?.url);
    const status=text(row?.['状態']);
    if(!id||seenTasks.has(id)||!knownState.has(status)||!text(row['やること']))continue;
    seenTasks.add(id);
    const rawDue=text(row['date:期限:start']);
    const timed=row['date:期限:is_datetime']===1&&exactInstant(rawDue);
    tasks.push({id,title:text(row['やること']),status,done:status==='完了',
      confirmed:true,dueAt:timed?rawDue:null,dueDate:rawDue||null,
      deadlinePrecision:timed?'instant':rawDue?'date_only':'missing',
      priority:text(row['優先度'])||null,source:'YOS Tasks'});
  }
  // Event kind ≠ completed task, feedback, sleep proof or geolocation.
  for(const row of eventsIn||[]){
    const id=sourceId(row?.url),kind=text(row?.['種類']),at=text(row?.['date:発生日時:start']);
    if(!id||seenEvents.has(id)||!knownKinds.has(kind)||!exactInstant(at)||row['date:発生日時:is_datetime']!==1)continue;
    seenEvents.add(id);
    eventMarkers.push({id,kind,at,source:'YOS 生活イベント',taskOutcome:'unknown'});
  }
  return {status:!available.tasks&&!available.events?'unavailable':'read_only',available,tasks,eventMarkers,feedbackRecords:[],interruptions:[],reason:'Existing event kinds do not prove task execution or user feedback'};
}

/** Evaluate existing Notion snapshots without live access, writes, or outgoing notifications. */
export function dueDateOnlyInAppHints(adapted, now){
  if(!adapted || adapted.status==='unavailable'||typeof now!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(now)||!Number.isFinite(Date.parse(now)))return [];
  const day=now.slice(0,10), today=Date.parse(day+'T00:00:00Z');
  const seen=new Set(), hints=[];
  for(const task of adapted.tasks||[]){
    if(!task || task.deadlinePrecision!=='date_only'||task.done||task.status==='保留'||task.status==='待ち'||!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate||'')||seen.has(task.id))continue;
    const offset=(Date.parse(task.dueDate+'T00:00:00Z')-today)/86400000;
    if(offset!==0 && offset!==1)continue;
    seen.add(task.id);
    hints.push({key:'date-only:'+task.id,taskId:task.id,type:'deadline_date_only',dueDate:task.dueDate,reason:offset===0?'確認済み期限日は今日。時刻は未確認':'確認済み期限日は明日。時刻は未確認',presentation:'in_app_only',requiresApproval:false});
  }
  return hints;
}
