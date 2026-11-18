/**
 * YOS 生活学習 -> existing DAYSTREAM source-shape bridge.
 * The Scriptable source already retrieves and safely filters taskSource.items.
 * This module only projects that snapshot into read-only proposal cards.
 * It does not connect to iPhone, call Notion, inject UI, or schedule alerts.
 */
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const ID=/^[0-9a-f]{32}$/i;
const ACTIVE=new Set(['次にやる','実行中','本人操作']);
const clean=(x,n=140)=>typeof x==='string'?x.trim().slice(0,n):'';
const validDay=s=>DAY.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const normalizeId=id=>clean(id,36).replace(/-/g,'').toLowerCase();
function dayDifference(a,b){return (Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000;}
export function prepareDaystreamLearningSnapshot({taskSource,now}={}){
  // Fail closed on interrupted/unauthorized source reads.
  const state=taskSource?.status;
  const nowDay=typeof now==='string'?now.slice(0,10):'';
  if(!validDay(nowDay)||!Number.isFinite(Date.parse(now))||!['ok','partial'].includes(state)||!Array.isArray(taskSource?.items)){
    return {status:'unavailable',complete:false,checkedAt:null,cards:[],reason:'DAYSTREAM task snapshot or current time unavailable'};
  }
  const seen=new Set(),cards=[];
  for(const item of taskSource.items){
    if(!item||typeof item!=='object')continue;
    const id=normalizeId(item.id),title=clean(item.title,120),status=clean(item.status,32),due=clean(item.due,10);
    if(!ID.test(id)||seen.has(id)||!title||!ACTIVE.has(status)||!validDay(due))continue;
    seen.add(id);
    const delta=dayDifference(due,nowDay);
    if(delta!==0&&delta!==1)continue;
    cards.push({
      key:'yos-life-learning:due-day:'+id,taskId:id,title,source:'YOS Tasks',
      type:'deadline_date_only',dueDate:due,reason:delta===0?'期限日は今日（期限時刻は未確認）':'期限日は明日（期限時刻は未確認）',
      status:'suggested',placement:'in_app_only',requiresApproval:false,
      changesOriginal:false,kind:'suggestion'
    });
  }
  return {status:'read_only',complete:state==='ok',checkedAt:typeof taskSource.checkedAt==='string'?taskSource.checkedAt:null,
    cards,reason:state==='partial'?'取得が一部のみのため候補も一部。未取得タスクは無いと判断しない':'確認済みの既存Tasksだけを候補化'};
}
