/*
 * YOS Health: reuse the existing Notion Inbox, YOS 日記 and Upstash.
 * Runs only following a successful authenticated existing Widget read.
 * No new DB, Shortcut, notification, credential, or third-party service.
 * Raw capture is never deleted; only explicit self-reported actions are journaled.
 */
import {UpstashRestClient} from '../../dist/storage/upstash-rest.js';

const API = 'https://api.notion.com/v1';
const VERSION = '2025-09-03';
const MAX_PAGES = 24;
const RECENT_DAYS = 2;
const MAX_EVENTS = 40;
const DAY = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo', year:'numeric',month:'2-digit',day:'2-digit'});
const CAPTURE_HEADER = /^(\d{4}-\d{2}-\d{2}T[^\s·]+)\s*·\s*(?:Memo|Clarity(?:\.Voice|\.Text)?|clarity\/(?:voice|text))\s*·\s*(clarity[:\-][A-Za-z0-9._:-]{3,128})(?:[^\n]*)/u;
const MEAL_ACTION = /(?:食べ(?:た|ました|てきた|たよ)|飲んだ|食事(?:した|済ませた)|(?:朝|昼|夕|夜)(?:ごはん|飯|食)(?:は|を|に|：|:))/u;
const MEAL_ITEM = /(?:豚汁|弁当|チャーハン|炒飯|そぼろ|ご飯|ごはん|食事|朝食|昼食|夕食|夜食|丼|うどん|そば|サラダ|スープ|ラーメン|パスタ|パン|カレー|おにぎり|米|肉|魚|卵|豆腐|野菜|ほっともっと|チキン|果物|納豆|ヨーグルト|昼飯|夕飯|朝飯)/u;
const ACTIVITY_ACTION = /(?:歩い(?:た|てきた)|歩きました|散歩(?:した|してきた)|ウォーキング(?:を)?(?:した|してきた)|スクワット[^。\n]{0,20}(?:した|やった)|筋トレ[^。\n]{0,20}(?:した|やった)|かかと上げ[^。\n]{0,20}(?:した|やった)|運動(?:を)?した)/u;
const NEGATION = /(?:食べ(?:てない|ていない|なかった|ない|ず)|飲まなかった|歩(?:いてない|いていない|かなかった|かない)|運動(?:してない|していない|しなかった)|スクワット(?:してない|しなかった)|散歩(?:してない|しなかった)|まだ(?:食べ|歩い)てない)/u;
const FUTURE = /(?:明日|来週|来月|これから|今から|予定|つもり|したい|食べたい|歩きたい|食べよう|歩こう|食べたら|歩いたら|したらどう|仮に|もし|場合|ほうがいい|方がいい)/u;
const OTHER_ACTOR = /(?:友達|家族|父|母|彼|彼女|妻|夫|子供|息子|娘|同僚)が[^。\n]{0,60}(?:食べ|飲ん|歩い|散歩|スクワット|運動)/u;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => String(v ?? '').replace(/[\u200b-\u200d\ufeff]/gu,'').trim();
export const japanDay = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? DAY.format(d) : null;
};
const notionText = (parts) => Array.isArray(parts) ? parts.map(x=>x?.plain_text??x?.text?.content??'').join('') : '';
const paragraphText = (b) => b?.type === 'paragraph' ? notionText(b.paragraph?.rich_text) : '';
const rich = (value) => {
  const s=String(value||''); const out=[];
  for(let i=0;i<s.length;i+=1800)out.push({type:'text',text:{content:s.slice(i,i+1800)}});
  return out;
};
function ageDays(now,iso){
  const a=Date.parse(japanDay(now)+'T00:00:00+09:00');
  const b=Date.parse(japanDay(iso)+'T00:00:00+09:00');
  return Math.round((a-b)/86400000);
}

export function classifyHealthReport(raw){
  const s=text(raw).slice(0,1600);
  if(!s||s.length>1000||/[?？]\s*$/u.test(s))return [];
  if(NEGATION.test(s)||FUTURE.test(s)||OTHER_ACTOR.test(s))return [];
  // Relative day references without explicit correction cannot safely be dated.
  // Spoken self-correction: "昨日の夜、昨日じゃない、今日の午前1時".
  // Only discard the discarded prefix if the speaker explicitly corrects
  // "yesterday" to "today" and then gives a today time reference.
  const corrected = /昨日(?:じゃない|ではない|じゃなく|ではなく)今日(?:の)?(?:今日の)?(?:午前|午後|[0-9０-９]|の午前|の午後)/u.test(s)
    ? s.slice(s.search(/昨日(?:じゃない|ではない|じゃなく|ではなく)今日/u)).replace(/^昨日(?:じゃない|ではない|じゃなく|ではなく)/u,'')
    : s;
  if(/(?:昨日|一昨日|先週|先月)/u.test(corrected))return [];
  const kinds=[];
  if(MEAL_ACTION.test(s)&&MEAL_ITEM.test(s))kinds.push('meal');
  if(ACTIVITY_ACTION.test(s))kinds.push('activity');
  return kinds;
}

export function extractHealthCaptures(blocks, now=new Date()){
  if(!Array.isArray(blocks))throw new Error('Inbox block list must be an array');
  const result=[];const seen=new Set();
  for(let i=0;i<blocks.length;i++){
    const first=paragraphText(blocks[i]).trim();
    const match=CAPTURE_HEADER.exec(first);
    if(!match)continue;
    const dateValue=match[1];
    if(ageDays(now,dateValue)<0||ageDays(now,dateValue)>RECENT_DAYS)continue;
    let raw=first.slice(match[0].length).trim().replace(/^[-–—]+\s*/u,'').trim();
    if(!raw && i+1<blocks.length){
      const candidate=paragraphText(blocks[i+1]).trim();
      if(candidate && !CAPTURE_HEADER.test(candidate) && !/^[-–—]{3,}$/u.test(candidate)) raw=candidate;
    }
    raw=raw.replace(/\n\s*---\s*$/u,'').trim();
    for(const kind of classifyHealthReport(raw)){
      const id=match[2]+':'+kind;
      if(seen.has(id))continue;
      seen.add(id);
      result.push({id,captureId:match[2],kind,raw,day:japanDay(dateValue),reportedAt:dateValue});
    }
  }
  if(result.length>MAX_EVENTS)throw new Error('Too many health captures in the current window');
  return result;
}

function mealAdvice(raw){
  if(/豚汁|スープ|汁物/u.test(raw))return '汁物はすでに摂取。具材や野菜量は未確認のため、不足と決めつけない。';
  if(/チャーハン|炒飯/u.test(raw))return '次の調理時は、手持ちの野菜を少量加える方法もある。';
  if(/そぼろ/u.test(raw))return '次の調理時は、青菜を添えると野菜を増やしやすい。';
  return '食事量・一日全体の食事は未確認。必要なら野菜の種類や量を確認する。';
}
function eventLine(event){
  const timestamp=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(event.reportedAt));
  return '\n【Clarity健康記録｜'+(event.kind==='meal'?'食事':'運動')+'｜報告 '+timestamp+'】\n'+
    event.raw+'\n'+(event.kind==='meal'?mealAdvice(event.raw):'本人の運動実施報告。時間・負荷は本人申告の範囲でのみ扱う。')+ '\n'+
    '[YOS-health:'+event.id+']\n';
}
function captureAlreadyRecorded(existing,captureId,kind){
  return existing.includes('[YOS-health:'+captureId+':'+kind+']') ||
    // Compatibility with a manually migrated journal entry. Only skip the exact
    // original capture if its ID is present, rather than copying it twice.
    (kind==='meal' && existing.includes('Clarity報告ID: '+captureId));
}
export function mergeHealthJournal(existing,events){
  if(typeof existing!=='string'||!Array.isArray(events))throw new Error('Invalid journal merge');
  let updated=existing,added=0;
  for(const event of events){
    if(captureAlreadyRecorded(updated,event.captureId,event.kind))continue;
    const line=eventLine(event);
    if(updated.length+line.length>35000)throw new Error('Daily health log exceeded safe length');
    updated+=line;added++;
  }
  return {updated,added};
}

async function notion(fetchImpl,token,path,method='GET',body){
  const response=await fetchImpl(API+path,{method,headers:{Authorization:'Bearer '+token,'Notion-Version':VERSION,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok)throw new Error('Notion unavailable: HTTP '+response.status);
  const data=await response.json();
  if(!isObject(data))throw new Error('Notion result invalid');
  return data;
}
async function allInboxBlocks(fetchImpl,token,inboxId){
  const blocks=[];let cursor=null;
  for(let page=0;page<MAX_PAGES;page++){
    const path='/blocks/'+inboxId+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):'');
    const result=await notion(fetchImpl,token,path);
    if(!Array.isArray(result.results))throw new Error('Inbox pagination malformed');
    blocks.push(...result.results);
    if(!result.has_more)return blocks;
    if(typeof result.next_cursor!=='string'||!result.next_cursor||cursor===result.next_cursor)throw new Error('Inbox cursor malformed');
    cursor=result.next_cursor;
  }
  // Fail closed on incomplete results. Newer entries may reside on later pages.
  throw new Error('Inbox pagination limit reached');
}
async function diaryDataSource(fetchImpl,token){
  const result=await notion(fetchImpl,token,'/search','POST',{
    query:'YOS 日記',filter:{property:'object',value:'data_source'},page_size:100
  });
  const matches=(result.results||[]).filter(row=>row?.object==='data_source'&&notionText(row.title)==='YOS 日記');
  if(matches.length!==1)throw new Error('Exactly one existing YOS diary data source must be accessible');
  const id=matches[0].id;
  if(typeof id!=='string'||!/^[-a-f0-9]{32,36}$/iu.test(id))throw new Error('Invalid YOS diary ID');
  return id;
}
async function matchingJournal(fetchImpl,token,diaryId,day){
  const result=await notion(fetchImpl,token,'/data_sources/'+diaryId+'/query','POST',{
    filter:{property:'記録キー',rich_text:{equals:'health:'+day}},page_size:5
  });
  if(!Array.isArray(result.results)||result.results.length>1)throw new Error('Health record key is not unique');
  const page=result.results[0]??null;
  if(page&&(
    notionText(page.properties?.['記録キー']?.rich_text)!=='health:'+day ||
    page.properties?.['記録元']?.select?.name!=='Clarity' ||
    page.properties?.['日付']?.date?.start?.slice(0,10)!==day))throw new Error('Health journal source and day mismatch');
  return page;
}
async function writeJournal(fetchImpl,token,diaryId,day,events){
  let page=await matchingJournal(fetchImpl,token,diaryId,day);
  if(!page){
    // A concurrent create can be ambiguous after a connection failure. Re-query
    // its stable key before attempting another create on a later invocation.
    const first=mergeHealthJournal('',events);
    const props={
      '日記':{title:rich(day+'｜健康・食事・運動記録（Clarity）')},
      '日付':{date:{start:day}},'記録元':{select:{name:'Clarity'}},
      '記録キー':{rich_text:rich('health:'+day)},
      '本文':{rich_text:rich(first.updated)},
      'YOS要約':{rich_text:rich('本人がClarityで報告した食事・運動を記録。未報告は未確認。')}
    };
    try{
      await notion(fetchImpl,token,'/pages','POST',{parent:{type:'data_source_id',data_source_id:diaryId},properties:props});
    }catch(e){
      const recovered=await matchingJournal(fetchImpl,token,diaryId,day);
      if(!recovered)throw e;
    }
    page=await matchingJournal(fetchImpl,token,diaryId,day);
    if(!page)throw new Error('New health journal was not found after create');
    const saved=notionText(page.properties?.['本文']?.rich_text);
    if(events.some(e=>!captureAlreadyRecorded(saved,e.captureId,e.kind)))throw new Error('Health journal creation readback mismatch');
    return {added:first.added,created:true};
  }
  const original=notionText(page.properties?.['本文']?.rich_text);
  const merge=mergeHealthJournal(original,events);
  if(!merge.added)return {added:0,created:false};
  const id=page.id;
  if(typeof id!=='string')throw new Error('Invalid existing daily health page');
  try{
    await notion(fetchImpl,token,'/pages/'+id,'PATCH',{properties:{'本文':{rich_text:rich(merge.updated)}}});
  }catch(e){
    const recovered=await notion(fetchImpl,token,'/pages/'+id);
    const saved=notionText(recovered.properties?.['本文']?.rich_text);
    if(events.some(ev=>!captureAlreadyRecorded(saved,ev.captureId,ev.kind)))throw e;
  }
  const reread=await notion(fetchImpl,token,'/pages/'+id);
  const saved=notionText(reread.properties?.['本文']?.rich_text);
  if(events.some(e=>!captureAlreadyRecorded(saved,e.captureId,e.kind)))throw new Error('Health journal update readback mismatch');
  return {added:merge.added,created:false};
}

/** A best-effort bounded background sync, always outside the original widget response. */
export async function synchronizeHealthInbox({environment=process.env,fetchImpl=fetch,redis,now=new Date()}={}){
  const token=environment.YOS_NOTION_API_TOKEN?.trim();
  const inboxId=environment.YOS_NOTION_INBOX_PAGE_ID?.trim();
  if(!token||!inboxId) return {status:'disabled:missing-existing-config'};
  if(!/^[-a-f0-9]{32,36}$/iu.test(inboxId))return {status:'disabled:invalid-inbox-id'};
  const client=redis??new UpstashRestClient({url:environment.UPSTASH_REDIS_REST_URL,token:environment.UPSTASH_REDIS_REST_TOKEN});
  const lock='yos:health-inbox-sync:v1:lock';
  const cooldown='yos:health-inbox-sync:v1:cooldown';
  const claimed=await client.command(['SET',lock,'1','NX','EX',180]);
  if(claimed!=='OK')return {status:'in-progress'};
  let throttled=false,failed=false;
  try{
    const ready=await client.command(['SET',cooldown,'1','NX','EX',600]);
    if(ready!=='OK'){throttled=true;return {status:'cooldown'};}
    const blocks=await allInboxBlocks(fetchImpl,token,inboxId);
    const captures=extractHealthCaptures(blocks,now);
    if(!captures.length)return {status:'no-report',scanned:blocks.length};
    const diaryId=await diaryDataSource(fetchImpl,token);
    const byDay=new Map();
    for(const item of captures){const a=byDay.get(item.day)||[];a.push(item);byDay.set(item.day,a);}
    let added=0,created=0;
    for(const [day,events] of byDay){
      const result=await writeJournal(fetchImpl,token,diaryId,day,events);
      added+=result.added;created+=Number(result.created);
    }
    return {status:'verified',scanned:blocks.length,candidates:captures.length,added,created};
  }catch(e){failed=true;throw e;}
  finally{
    if(failed&&!throttled){try{await client.command(['DEL',cooldown]);}catch{}}
    try{await client.command(['DEL',lock]);}catch{}
  }
}