import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';
import {loadNotionTaskDashboard} from '../widget/notion-source.js';
const EVENTS='30df9a732ea74ff781872b62dc8f9da4',API='https://api.notion.com/v1';
const plain=(v:any)=>Array.isArray(v)?v.map(x=>x?.plain_text??x?.text?.content??'').join(''):'';
const rich=(s:string)=>[{type:'text',text:{content:s}}];
const cleanId=(s:unknown)=>typeof s==='string'?s.replaceAll('-','').toLowerCase():'';
const day=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
function validDay(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s}
export function isHabitOccurrence(cycle:string,anchor:string|null,target:string,today:string){
 if(!validDay(target)||target>today||Date.parse(today)-Date.parse(target)>31*86400000)return false;
 if(!anchor)return cycle==='毎日'&&target===today;
 const base=anchor.includes('T')?day(new Date(anchor)):anchor;
 if(!validDay(base)||target<base)return false;
 const delta=(Date.parse(target)-Date.parse(base))/86400000;
 if(cycle==='毎日')return true;
 if(cycle==='毎週')return delta%7===0;
 if(cycle==='毎月')return target.slice(8)===base.slice(8);
 return target===base;
}
export async function completeHabitOccurrence(o:{notionToken:string;notionDataSourceId:string;fetchImpl:FetchLike;redis:RedisCommandClient;pageId:string;occurrenceDay:string;expectedEditedAt:string;now?:Date}){
 const now=o.now??new Date(),id=cleanId(o.pageId),source=cleanId(o.notionDataSourceId);
 if(!/^[a-f0-9]{32}$/.test(id)||!validDay(o.occurrenceDay))throw Error('Invalid habit occurrence');
 async function api(path:string,method='GET',body?:unknown){
  const response=await o.fetchImpl(API+path,{method,headers:{Authorization:'Bearer '+o.notionToken,'Notion-Version':'2025-09-03','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok)throw Error('Notion habit source unavailable');return response.json() as Promise<Record<string,any>>;
 }
 const key='calendar:habit:'+id+':'+o.occurrenceDay;
 async function existing(){
  const found=await api('/data_sources/'+EVENTS+'/query','POST',{page_size:2,filter:{property:'記録キー',rich_text:{equals:key}}});
  if(!Array.isArray(found.results)||found.has_more!==false||found.results.length>1)throw Error('Habit identity is ambiguous');
  if(!found.results.length)return null;
  const page=await api('/pages/'+found.results[0].id);
  if(cleanId(page.parent?.data_source_id)!==EVENTS||page.archived||page.in_trash||plain(page.properties?.['記録キー']?.rich_text)!==key||page.properties?.['発生日時']?.date?.start!==o.occurrenceDay)throw Error('Habit readback mismatch');
  const meta=JSON.parse(plain(page.properties?.['備考']?.rich_text));
  if(!/^[a-f0-9]{32}$/.test(cleanId(page.id))||meta?.schema!=='yos-calendar-habit-occurrence-v1'||meta.taskId!==id||meta.date!==o.occurrenceDay)throw Error('Habit receipt metadata mismatch');
  return {id:cleanId(page.id),taskId:id,date:o.occurrenceDay,done:true};
 }
 const habitPage=await api('/pages/'+id);
 if(cleanId(habitPage.parent?.data_source_id)!==source||habitPage.archived||habitPage.in_trash)throw Error('Habit parent mismatch');
 // Reuse the existing strict task parser without broadening the completion API.
 const parsed=await loadNotionTaskDashboard({notionToken:o.notionToken,notionDataSourceId:o.notionDataSourceId,calendar:true,fetchImpl:async(input,init)=>String(input).endsWith('/query')?Response.json({results:[habitPage],has_more:false}):o.fetchImpl(input,init)});
 const task=parsed.tasks[0];
 if(!task||task.sourceKind!=='task'||!task.habitCycle||!['次にやる','実行中','本人操作'].includes(task.state)||!isHabitOccurrence(task.habitCycle,task.due,o.occurrenceDay,day(now)))throw Error('Habit is not active on this day');
 const saved=await existing();if(saved)return saved;
 if(!o.expectedEditedAt||task.lastEditedAt!==o.expectedEditedAt)throw Error('Habit changed; refresh before saving');
 // A non-expiring reservation deliberately survives uncertain creation. A retry
 // may read the same receipt, but cannot blindly create a second Notion page.
 const reserved=await o.redis.command<string|null>(['SET','yos:'+key,'pending','NX']);
 if(reserved!=='OK'){const retry=await existing();if(retry)return retry;throw Error('Habit save pending; refresh to verify before any retry')}
 const meta={schema:'yos-calendar-habit-occurrence-v1',taskId:id,date:o.occurrenceDay,recordedAt:now.toISOString(),area:task.area||''};
 const created=await api('/pages','POST',{parent:{type:'data_source_id',data_source_id:EVENTS},properties:{
  'イベント名':{title:rich('習慣｜'+task.title.slice(0,100))},'記録キー':{rich_text:rich(key)},
  '備考':{rich_text:rich(JSON.stringify(meta))},'発生日時':{date:{start:o.occurrenceDay}},'種類':{select:{name:'その他'}},'取得元':{select:{name:'手動'}}
 }});
 if(!/^[a-f0-9]{32}$/.test(cleanId(created.id)))throw Error('Habit creation result uncertain');
 const result=await existing();if(!result||result.id!==cleanId(created.id))throw Error('Habit completion not read back');
 return result;
}
