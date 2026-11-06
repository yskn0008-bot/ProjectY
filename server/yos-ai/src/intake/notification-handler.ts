import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';
const MAX_BODY_BYTES = 8192;
const PAGE_LIMIT = 30;
const MAX_EVENTS = 120;
const STATE_SET = new Set(['read','pending','done']);
const OTP = /認証コード|確認コード|ワンタイム|二段階認証|ログインコード|パスワードリセット|verification\s*code|one.?time|\bOTP\b|\b2FA\b|security\s*code|reset\s*password/iu;
const TEST = /テスト|動作確認|架空|simulation|\btest\b/iu;
type Category = 'missed-call'|'money-review'|'legal'|'security'|'information';
type Status = 'unread'|'read'|'pending'|'done';
type Event = {id:string; at:string; category:Category; text:string; status:Status; source:string; blockId:string};
type Capture = {text:string; sourceApp:string; occurredAt:string; eventId:string};
type NotionBlock = {
  id?:string;
  type?:string;
  paragraph?:{
    rich_text?:Array<{plain_text?:string; text?:{content?:string}}>;
  };
};

function result(body:Record<string,unknown>,status=200):Response {
  return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
function asRecord(x:unknown):x is Record<string,unknown>{return !!x&&typeof x==='object'&&!Array.isArray(x)}
function textOf(block:NotionBlock):string {
  return (block.paragraph?.rich_text??[]).map(x=>x.plain_text??x.text?.content??'').join('');
}
function rich(value:string) {
  const chunks:string[]=[];
  for(let i=0;i<value.length;i+=1900)chunks.push(value.slice(i,i+1900));
  return chunks.map(content=>({type:'text',text:{content}}));
}
function normalizeId(value:string):string {
  const id=value.replaceAll('-','').trim().toLowerCase();
  if(!/^[0-9a-f]{32}$/u.test(id))throw new Error('Invalid Notion Inbox ID');
  return id;
}
function sha256Hex(s:string):Promise<string> {
  return crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)).then(d=>[...new Uint8Array(d)].map(n=>n.toString(16).padStart(2,'0')).join(''));
}
function safeText(raw:string):string {
  if(OTP.test(raw))return '認証・ログイン関連の通知（秘密の本文は保存していません）';
  return raw.replace(/(?:password|パスワード|token|APIキー|secret)\s*[:：=]\s*\S+/giu,'[秘密非表示]')
    .replace(/((?:口座番号|カード番号|取引番号)\s*[:：=#]?\s*)[\w*-]{4,}/giu,'$1[番号非表示]')
    .replace(/(^|[^\d])(?:\d[\s-]?){12,27}\d(?=[^\d]|$)/gu,'$1[長い番号非表示]')
    .replace(/\b0\d{9,10}\b/gu,'[電話番号非表示]')
    .replace(/https?:\/\/\S+/giu,'[URL非表示]').slice(0,1500).trim();
}
function categoryOf(s:string):Category {
  if(/不在着信|missed[ -]?call|応答なしの着信/iu.test(s))return 'missed-call';
  if(/差押|差し押さえ|督促|裁判所|訴状|訴訟/iu.test(s))return 'legal';
  if(/認証|不正アクセス|不審なログイン|不正利用|口座凍結/iu.test(s))return 'security';
  if(/支払|請求|返済|決済|入金|出金|振込|引落|PayPay|銀行|残高|チャージ/iu.test(s))return 'money-review';
  return 'information';
}
function triage(raw:string,category:Category):{decision:'YOS_SILENT'|'YOS_ALERT';alertText:string} {
  if(TEST.test(raw)||OTP.test(raw)||/不正利用(?:は|が)(?:確認|検出)されません/iu.test(raw))return {decision:'YOS_SILENT',alertText:''};
  if(category==='missed-call')return {decision:'YOS_SILENT',alertText:''};
  const risk=/口座凍結|差押|差し押さえ|不正利用|不正送金|訴状|引き落としに失敗|引落失敗|支払期限.{0,12}(?:本日|今日|明日)|期限切れ/iu.test(raw);
  if(!risk)return {decision:'YOS_SILENT',alertText:''};
  const safe=safeText(raw).replace(/\s+/gu,' ').slice(0,150);
  return {decision:'YOS_ALERT',alertText:'YOS｜要確認\n'+safe+'\n元アプリで事実と期限を確認してください。'};
}
function parseCapture(body:unknown,now:Date):{ok:true;value:Capture}|{ok:false;reason:string} {
  if(!asRecord(body))return {ok:false,reason:'JSON object required'};
  const text=body.text;
  if(typeof text!=='string'||!text.trim()||text.length>2000)return {ok:false,reason:'text must be a nonempty string (max 2000)'};
  const sourceApp=typeof body.sourceApp==='string'?body.sourceApp.trim().slice(0,90):'iPhone通知';
  const occurredAt=typeof body.occurredAt==='string'?body.occurredAt:now.toISOString();
  if(occurredAt.length>80||!Number.isFinite(Date.parse(occurredAt)))return {ok:false,reason:'Invalid occurredAt'};
  if(Math.abs(now.getTime()-Date.parse(occurredAt))>32*86400000)return {ok:false,reason:'occurredAt outside accepted range'};
  const eventId=typeof body.eventId==='string'?body.eventId.trim():'';
  if(eventId&&!/^[a-zA-Z0-9._:-]{8,128}$/u.test(eventId))return {ok:false,reason:'Invalid eventId'};
  return {ok:true,value:{text:text.trim(),sourceApp,occurredAt,eventId}};
}
function eventBlock(event:{id:string;at:string;category:Category;text:string;sourceApp:string}):string {
  return event.at+' · Native Notification · notification:'+event.id+' · '+event.category+'\n発信元: '+safeText(event.sourceApp).slice(0,90)+'\n'+event.text+'\n---';
}
const RECORD=/^(\S+)\s*·\s*(Native Notification|Clarity Notification)\s*·\s*notification:([0-9a-f]{8,64})\s*·\s*(missed-call|money-review|legal|security|information)/iu;
const STATE=/^(\S+)\s*·\s*Notification State\s*·\s*notification:([0-9a-f]{8,64})\s*·\s*(read|pending|done)/iu;
function parseRows(rows:NotionBlock[]):Event[] {
  const statuses=new Map<string,Status>(),events=new Map<string,Event>();
  for(const row of rows){
    if(row.type!=='paragraph')continue;
    const value=textOf(row),state=STATE.exec(value);
    if(state&&state[2]&&state[3]){statuses.set(state[2],state[3] as Status);continue}
    const match=RECORD.exec(value);
    if(!match||!row.id||!match[1]||!match[2]||!match[3]||!match[4])continue;
    const body=value.slice(match[0].length).replace(/^\s*/u,'').replace(/\s*---\s*$/u,'').slice(0,1500);
    events.set(match[3],{id:match[3],at:match[1],category:match[4] as Category,
      text:body,status:'unread',source:match[2],blockId:row.id});
  }
  return [...events.values()].map(x=>({...x,status:statuses.get(x.id)??'unread'})).sort((a,b)=>b.at.localeCompare(a.at));
}
export function createNotificationHandler(options:{
  tokenSha256:string;notionToken:string;notionPageId:string;redis:RedisCommandClient;
  fetchImpl?:FetchLike;now?:()=>Date
}):(request:Request)=>Promise<Response> {
  const expected=options.tokenSha256.trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/u.test(expected)||!options.notionToken)throw new Error('Notification API credentials missing');
  const page=normalizeId(options.notionPageId),fetchImpl=options.fetchImpl??fetch,now=options.now??(()=>new Date());

  async function notion(method:string,path:string,payload?:unknown):Promise<Record<string,any>> {
    const response=await fetchImpl(NOTION_BASE+path,{
      method,headers:{'Authorization':'Bearer '+options.notionToken,'Notion-Version':NOTION_VERSION,'Content-Type':'application/json'},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})
    });
    if(!response.ok)throw new Error('Notion '+String(response.status));
    const json=await response.json();
    if(!asRecord(json))throw new Error('Notion response invalid');
    return json;
  }
  async function listBlocks():Promise<{blocks:NotionBlock[];complete:boolean}> {
    const blocks:NotionBlock[]=[];let cursor:string|null=null;
    for(let i=0;i<PAGE_LIMIT;i++){
      const path='/blocks/'+page+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):'');
      const response=await notion('GET',path);
      if(!Array.isArray(response.results))throw new Error('Notion Inbox malformed');
      blocks.push(...response.results as NotionBlock[]);
      if(!response.has_more)return {blocks,complete:true};
      if(!response.next_cursor||response.next_cursor===cursor)throw new Error('Notion pagination invalid');
      cursor=String(response.next_cursor);
    }
    return {blocks,complete:false};
  }
  async function append(row:string):Promise<void> {
    const response=await notion('PATCH','/blocks/'+page+'/children',{
      children:[{object:'block',type:'paragraph',paragraph:{rich_text:rich(row)}}]
    });
    if(!Array.isArray(response.results)||response.results.length!==1)throw new Error('Notion append not confirmed');
  }
  async function authorized(request:Request):Promise<boolean> {
    const token=/^Bearer ([^\s]{16,512})$/u.exec(request.headers.get('authorization')??'')?.[1];
    if(!token)return false;
    const digest=await sha256Hex(token);
    let difference=0;
    for(let i=0;i<expected.length;i++)difference|=digest.charCodeAt(i)^expected.charCodeAt(i);
    return digest.length===expected.length&&difference===0;
  }
  return async(request:Request):Promise<Response>=>{
    if(!['GET','POST'].includes(request.method))return result({error:'Method not allowed'},405);
    if(!(await authorized(request)))return result({error:'Unauthorized'},401);
    if(request.method==='GET'){
      try{
        const {blocks,complete}=await listBlocks();
        const events=parseRows(blocks).slice(0,MAX_EVENTS);
        return result({ok:true,events,complete,visible:events.length});
      }catch{return result({error:'Inbox temporarily unavailable'},503)}
    }
    if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')
      return result({error:'JSON required'},415);
    let raw='';
    try{raw=await request.text()}catch{return result({error:'Body invalid'},400)}
    if(new TextEncoder().encode(raw).length>MAX_BODY_BYTES)return result({error:'Payload too large'},413);
    let body:unknown;
    try{body=JSON.parse(raw)}catch{return result({error:'Invalid JSON'},400)}
    if(asRecord(body)&&body.action==='mark'){
      const id=body.id,status=body.status;
      if(typeof id!=='string'||!/^[0-9a-f]{8,64}$/u.test(id)||typeof status!=='string'||!STATE_SET.has(status))
        return result({error:'Invalid status update'},400);
      try{
        const {blocks,complete}=await listBlocks();
        if(!complete)return result({error:'Inbox reconciliation incomplete'},503);
        const found=parseRows(blocks).find(e=>e.id===id);
        if(!found)return result({error:'Notification not found'},404);
        if(found.status===status)return result({ok:true,id,status,duplicate:true});
        await append(now().toISOString()+' · Notification State · notification:'+id+' · '+status);
        return result({ok:true,id,status,duplicate:false});
      }catch{return result({error:'Status update not confirmed'},503)}
    }
    const parsed=parseCapture(body,now());
    if(!parsed.ok)return result({error:parsed.reason},400);
    const event=parsed.value;
    const coarseTime=new Date(Math.floor(Date.parse(event.occurredAt)/300000)*300000).toISOString();
    const digest=await sha256Hex(event.eventId?'id:'+event.sourceApp+':'+event.eventId:
      'fallback:'+event.sourceApp+':'+event.text+':'+coarseTime);
    const id=digest.slice(0,24),category=categoryOf(event.text),safe=safeText(event.text),decision=triage(event.text,category);
    const key='yos:notification:inbox:v1:'+id,lock=key+':lock';
    try{
      const claimed=await options.redis.command<string|null>(['SET',lock,'processing','NX','EX',120]);
      if(claimed!=='OK')return result({error:'Notification is already being saved'},409);
      const prior=await options.redis.command<string|null>(['GET',key]);
      if(prior==='done')return result({ok:true,id,duplicate:true,category,decision:decision.decision,alertText:''});
      // A previously ambiguous PATCH must be checked against Notion before any retry.
      if(prior==='pending'){
        const {blocks,complete}=await listBlocks();
        if(!complete)throw new Error('Inbox reconciliation incomplete');
        if(parseRows(blocks).some(x=>x.id===id)){
          await options.redis.command<string>(['SET',key,'done','EX',2592000]);
          return result({ok:true,id,duplicate:true,category,decision:decision.decision,alertText:''});
        }
      } else {
        // The durable pending receipt is written BEFORE Notion; normal fresh input
        // therefore avoids expensive Inbox scans on a locked iPhone.
        await options.redis.command<string>(['SET',key,'pending','EX',2592000]);
      }
      // Classification is metadata, not an instruction to record a payment or create a task.
      await append(eventBlock({id,at:event.occurredAt,category,text:safe,sourceApp:event.sourceApp}));
      await options.redis.command<string>(['SET',key,'done','EX',2592000]);
      return result({ok:true,id,duplicate:false,category,decision:decision.decision,alertText:decision.alertText},201);
    }catch{
      // Keep the pending receipt: a timed-out PATCH may have actually succeeded.
      return result({error:'Inbox saving unconfirmed; original notification remains'},503);
    }finally{
      // Failure to release a lock is harmless; it expires within 120 seconds.
      try{await options.redis.command<number>(['DEL',lock])}catch{}
    }
  };
}
export const notificationInternals={safeText,categoryOf,triage,parseRows,parseCapture};
