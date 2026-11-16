import type {FetchLike} from '../http.js';
// Existing, schema-verified sources only. No discovery from arbitrary client IDs.
const SOURCES = [
  {id:'30df9a73-2ea7-4ff7-8187-2b62dc8f9da4',name:'YOS 生活イベント',title:'イベント名',date:'発生日時',kind:'schedule',area:'Life'},
  {id:'829c91b0-08dc-4ab0-b8fd-b9725dd0d9d2',name:'YOS 人物・記念日',title:'人物・イベント',date:'記念日',kind:'schedule',area:'Life'},
  {id:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc',name:'YOS Shopping',title:'商品名',date:'セール予定日',kind:'schedule',area:'Life'},
  {id:'95b30d16-7530-40c6-a320-dab99acad55d',name:'家計イベント・入出金予定',title:'項目',date:'日付',kind:'money',area:'Money'},
  {id:'9205e5b7-f8b9-4497-9d6f-4727d67e4866',name:'YOS 案件',title:'案件名',date:'対応期限',kind:'task',area:''}
] as const;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(p:any)=>Array.isArray(p?.title)?p.title.map((r:any)=>r?.plain_text??r?.text?.content??'').join('').slice(0,100):'';
const select=(p:any)=>p?.select?.name||p?.status?.name||'';
function date(value:unknown){
 if(typeof value!=='string')return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value)return {day:value,at:''};
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return null;
 return {day:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)),at:value};
}
export async function loadCalendarSources({notionToken,fetchImpl,now=new Date()}:{notionToken:string;fetchImpl:FetchLike;now?:Date}) {
 const sources=await Promise.all(SOURCES.map(async source=>{
  try{
   const pages:any[]=[],seen=new Set<string>();let cursor:string|undefined;
   for(let page=0;page<4;page++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    let res;try{res=await fetchImpl('https://api.notion.com/v1/data_sources/'+source.id+'/query',{method:'POST',headers:{Authorization:'Bearer '+notionToken,'Notion-Version':'2025-09-03','Content-Type':'application/json'},body:JSON.stringify({page_size:100,filter:{property:source.date,date:{is_not_empty:true}},...(cursor?{start_cursor:cursor}:{})}),signal:controller.signal})}finally{clearTimeout(timer)}
    if(!res.ok)throw Error('unavailable');const body=await res.json();
    if(!object(body)||!Array.isArray(body.results)||typeof body.has_more!=='boolean')throw Error('invalid');
    pages.push(...body.results);if(!body.has_more){cursor=undefined;break}
    if(typeof body.next_cursor!=='string'||seen.has(body.next_cursor))throw Error('pagination');seen.add(body.next_cursor);cursor=body.next_cursor;
   }
   if(cursor)throw Error('capacity');
   const items:any[]=[];let skippedLinked=0,skippedUndated=0;
   const ids=new Set<string>();
   for(const row of pages){
    if(!object(row)||row.archived||row.in_trash)continue;
    const id=typeof row.id==='string'?row.id.replaceAll('-','').toLowerCase():'';
    if(!/^[a-f0-9]{32}$/.test(id)||ids.has(id)||!object(row.properties))throw Error('invalid');ids.add(id);
    const p=row.properties,title=text(p[source.title]),at=date(p[source.date]?.date?.start);if(!title||!at){skippedUndated++;continue}
    // Cases track referenced tasks. Do not count both as separate work.
    if(source.name==='YOS 案件'&&Array.isArray(p['関連タスク']?.relation)&&p['関連タスク'].relation.length){skippedLinked++;continue}
    const state=select(p['状態']),verification=select(p['事実の確度']);
    if(source.kind==='money'){
      const kind=select(p['区分']),certainty=select(p['確度']),amount=p['金額']?.number;
      if(state==='取消'||kind==='資金移動')continue;
      if(!['収入','支出'].includes(kind)||!['予定','実績'].includes(state)||typeof amount!=='number'||!Number.isFinite(amount)||amount<0)throw Error('invalid money');
      const original=Array.isArray(p['原本ID']?.rich_text)?p['原本ID'].rich_text.map((r:any)=>r?.plain_text??r?.text?.content??'').join('').slice(0,120):'';
      items.push({id,type:'money',title,date:at.day,dueAt:at.at,area:'Money',done:state==='実績',complete:state==='実績',amount:Math.round(amount),moneyKind:kind==='収入'?'income':'expense',verification:certainty||'未確認',originalId:original,subtitle:state+' · '+(certainty||'未確認'),source:source.name});continue;
    }
    const area=source.name==='YOS 案件'?({お金:'Money',仕事:'Work',健康:'Health',生活:'Life',買い物:'Life'} as Record<string,string>)[p['分野']?.multi_select?.[0]?.name]||'':source.area;
    items.push({id,type:source.kind,title,date:at.day,dueAt:at.at,area,done:source.name==='YOS 生活イベント'||state==='完了',
      subtitle:source.name==='YOS 生活イベント'?'実績':source.name==='YOS 案件'?'期限 · '+(verification||'未確認'):source.name==='YOS 人物・記念日'?(verification||'未確認'):'予定',source:source.name});
   }
   return {name:source.name,status:'ok' as const,complete:true,items,skippedLinked,skippedUndated};
  }catch{return {name:source.name,status:'unavailable' as const,complete:false,items:[]}}
 }));
 return {checkedAt:now.toISOString(),sources};
}
