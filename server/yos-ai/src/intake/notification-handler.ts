import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';
const MAX_BODY_BYTES = 8192;
const PAGE_LIMIT = 30;
const MAX_EVENTS = 120;
// Release a lease only when its unique owner still holds it (Redis atomic compare-and-delete).
const RELEASE_OWNED_LOCK = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const STATE_SET = new Set(['read','pending','done']);
const OTP = /認証コード|確認コード|ワンタイム|二段階認証|ログインコード|パスワードリセット|verification\s*code|one.?time|\bOTP\b|\b2FA\b|security\s*code|reset\s*password/iu;
const TEST_NOTICE = /^\s*(?:【(?:通知テスト|テスト通知|動作確認|架空)[^】]*】|(?:これは|この通知は|本通知は)?\s*(?:架空の通知テスト|架空のテスト|テスト通知|架空の通知|模擬通知|動作確認(?:用|通知)|test\s+(?:message|notification)|simulation\b))/iu;
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
  // Keep a non-secret incident description even if the same notice includes an OTP.
  if(OTP.test(raw)&&!/(?:口座凍結|差押|差し押さえ|不正(?:送金|利用|アクセス)|訴状|督促|引落失敗|振込失敗)/iu.test(raw))
    return '認証・ログイン関連の通知（秘密の本文は保存していません）';
  const redacted=OTP.test(raw)
    ? raw.replace(/(?<![A-Za-z0-9])(?:\d[ \t-]?){3,11}\d(?![A-Za-z0-9])/gu,'[認証値非表示]')
      .replace(/((?:認証コード|確認コード|本人確認コード|ログインコード|ワンタイム(?:認証)?コード|verification\s*code|security\s*code|OTP)\s*[:：=]?\s*)[A-Za-z0-9_-]{4,20}/giu,'$1[認証値非表示]')
    : raw;
  return redacted.replace(/(?:password|パスワード|token|APIキー|secret)\s*[:：=]\s*\S+/giu,'[秘密非表示]')
    .replace(/((?:口座番号|カード番号|取引番号)\s*[:：=#]?\s*)[\w*-]{4,}/giu,'$1[番号非表示]')
    .replace(/(^|[^\d])(?:\d[\s-]?){12,27}\d(?=[^\d]|$)/gu,'$1[長い番号非表示]')
    .replace(/\b0\d{9,10}\b/gu,'[電話番号非表示]')
    .replace(/https?:\/\/\S+/giu,'[URL非表示]').slice(0,1500).trim();
}
function categoryOf(s:string):Category {
  if(/不在着信|missed[ -]?call|応答なしの着信/iu.test(s))return 'missed-call';
  if(/差押|差し押さえ|督促|裁判所|訴状|訴訟/iu.test(s))return 'legal';
  if(/認証|不正アクセス|不審なログイン|不正利用|口座凍結/iu.test(s))return 'security';
  if(/支払|請求|返済|決済|入金|出金|振込|引落|引き落とし|口座振替|PayPay|銀行|残高|チャージ/iu.test(s))return 'money-review';
  return 'information';
}
function triage(raw:string,category:Category):{decision:'YOS_SILENT'|'YOS_ALERT';alertText:string} {
  const silent={decision:'YOS_SILENT' as const,alertText:''};
  if(TEST_NOTICE.test(raw))return silent;
  if(category==='missed-call')return silent;
  // Remove only resolved/negated risk phrases. Other active risks in the same message still count.
  const actionable=raw.replace(
    /(?:不正(?:利用|送金|アクセス)|口座凍結|差押|差し押さえ|振込失敗|引落失敗)(?:(?:は|が|を)?(?:確認|検知|検出|発生)(?:されませんでした|されていません|されなかった|されていない|しなかった|していません|しませんでした)|(?:は|が)?(?:ありませんでした|ありません|ない)|(?:は|が)?解除(?:されました|済み|しました)|(?:の|する)?予定は(?:ありません|ない))/giu,
    ''
  );
  const p0=/口座凍結|差押|差し押さえ|不正送金|不正利用|不正アクセス|不審なログイン.{0,12}(?:検知|確認)|訴状/iu.test(actionable);
  const p1=/引き落としに失敗|引落失敗|振込失敗|(?:引き落とし|引落とし|引落し|口座振替)(?:が|を)?(?:できませんでした|できなかった|できません|できず)|支払期限.{0,12}(?:本日|今日|明日)|期限切れ|督促状(?:が|を)?(?:届きました|受領しました|発行されました)|督促を受けました/iu.test(actionable);
  if(!p0&&!p1)return silent;
  const priority=p0?'P0':'P1',facts=safeText(raw).replace(/\s+/gu,' ').slice(0,180);
  const amount=/(?:[￥¥]\s*[\d,]+|[\d,]+\s*円)/u.exec(raw)?.[0]??'';
  const due=/(?:支払期限|引落日|期限|締切|締め切り)[：:\s]*(?:20\d{2}年)?\s*\d{1,2}月\d{1,2}日|(?:支払期限|期限)[：:\s]*(?:本日|今日|明日)/u.exec(raw)?.[0]??'';
  const caution=category==='legal'?'法的な対応期限や財産への影響があり得ます（未確認）。'
    :category==='money-review'?'支払い・利用停止などの影響があり得ます（未確認）。'
    :'安全・金融への影響があり得ます（未確認）。';
  const lines=['【YOS重要｜'+priority+'】','事実: '+facts];
  if(amount)lines.push('記載金額: '+amount);
  if(due)lines.push('記載期限: '+due);
  lines.push('影響: '+caution,'次の一手: 通知のリンクではなく元アプリを開き、事実と期限を確認する。','根拠: 受信通知の本文。真偽と現在の状況は未照合。');
  return {decision:'YOS_ALERT',alertText:lines.join('\n')};
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
    // Preserve old Inbox records while exposing legacy missed calls in the dedicated filter.
    const legacyMissedCall=match[2]==='Clarity Notification'&&match[4]==='information'&&
      body.split(/\r?\n/u).some(line=>line.trim()==='不在着信');
    events.set(match[3],{id:match[3],at:match[1],category:legacyMissedCall?'missed-call':match[4] as Category,
      text:body,status:'unread',source:match[2],blockId:row.id});
  }
  return [...events.values()].map(x=>({...x,status:statuses.get(x.id)??'unread'})).sort((a,b)=>b.at.localeCompare(a.at));
}
export function createNotificationHandler(options:{
  tokenSha256:string;notionToken:string;notionPageId:string;redis:RedisCommandClient;
  fetchImpl?:FetchLike;now?:()=>Date;viewerAuth?:(token:string)=>Promise<boolean>
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
  // A successful Inbox save is not proof that the iPhone displayed the alert.
  // Replays remain available until the device confirms presentation separately.
  async function replayUnacknowledgedAlert(id:string,decision:{decision:'YOS_SILENT'|'YOS_ALERT';alertText:string}):
    Promise<{decision:'YOS_SILENT'|'YOS_ALERT';alertText:string;alertRequiresAck:boolean}> {
    if(decision.decision!=='YOS_ALERT')return {...decision,alertRequiresAck:false};
    const acknowledged=await options.redis.command<string|null>(['GET','yos:notification:inbox:v1:'+id+':alert-ack']);
    return acknowledged==='done'
      ? {decision:'YOS_SILENT',alertText:'',alertRequiresAck:false}
      : {...decision,alertRequiresAck:true};
  }
  async function authorized(request:Request):Promise<'capture'|'viewer'|null> {
    const token=/^Bearer ([^\s]{16,512})$/u.exec(request.headers.get('authorization')??'')?.[1];
    if(!token)return null;
    const digest=await sha256Hex(token);
    let difference=0;
    for(let i=0;i<expected.length;i++)difference|=digest.charCodeAt(i)^expected.charCodeAt(i);
    if(digest.length===expected.length&&difference===0)return 'capture';
    if(options.viewerAuth){
      try{if(await options.viewerAuth(token))return 'viewer'}catch{}
    }
    return null;
  }
  return async(request:Request):Promise<Response>=>{
    if(!['GET','POST'].includes(request.method))return result({error:'Method not allowed'},405);
    const role=await authorized(request);
    if(!role)return result({error:'Unauthorized'},401);
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
    if(asRecord(body)&&body.action==='ack-alert'){
      if(role!=='capture')return result({error:'Device authorization required'},403);
      const id=body.id;
      if(typeof id!=='string'||!/^[0-9a-f]{8,64}$/u.test(id))
        return result({error:'Invalid notification ID'},400);
      try{
        const receipt='yos:notification:inbox:v1:'+id;
        if(await options.redis.command<string|null>(['GET',receipt])!=='done')
          return result({error:'Notification save not yet confirmed'},409);
        await options.redis.command<string>(['SET',receipt+':alert-ack','done','EX',2592000]);
        return result({ok:true,id,alertAcknowledged:true});
      }catch{return result({error:'Alert acknowledgement not confirmed'},503)}
    }
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
    if(role!=='capture')return result({error:'Notification capture requires device authorization'},403);
    const parsed=parseCapture(body,now());
    if(!parsed.ok)return result({error:parsed.reason},400);
    const event=parsed.value;
    const coarseTime=new Date(Math.floor(Date.parse(event.occurredAt)/300000)*300000).toISOString();
    const digest=await sha256Hex(event.eventId?'id:'+event.sourceApp+':'+event.eventId:
      'fallback:'+event.sourceApp+':'+event.text+':'+coarseTime);
    const id=digest.slice(0,24),category=categoryOf(event.text),safe=safeText(event.text),decision=triage(event.text,category);
    const key='yos:notification:inbox:v1:'+id,lock=key+':lock';
    const lockOwner=crypto.randomUUID();
    let ownsLock=false;
    try{
      const claimed=await options.redis.command<string|null>(['SET',lock,lockOwner,'NX','EX',120]);
      if(claimed!=='OK')return result({error:'Notification is already being saved'},409);
      ownsLock=true;
      const prior=await options.redis.command<string|null>(['GET',key]);
      if(prior==='done'){
        const alert=await replayUnacknowledgedAlert(id,decision);
        return result({ok:true,id,duplicate:true,category,...alert});
      }
      // A previously ambiguous PATCH must be checked against Notion before any retry.
      if(prior==='pending'){
        const {blocks,complete}=await listBlocks();
        if(!complete)throw new Error('Inbox reconciliation incomplete');
        if(parseRows(blocks).some(x=>x.id===id)){
          await options.redis.command<string>(['SET',key,'done','EX',2592000]);
          const alert=await replayUnacknowledgedAlert(id,decision);
          return result({ok:true,id,duplicate:true,category,...alert});
        }
      } else {
        // The durable pending receipt is written BEFORE Notion; normal fresh input
        // therefore avoids expensive Inbox scans on a locked iPhone.
        await options.redis.command<string>(['SET',key,'pending','EX',2592000]);
      }
      // Classification is metadata, not an instruction to record a payment or create a task.
      await append(eventBlock({id,at:event.occurredAt,category,text:safe,sourceApp:event.sourceApp}));
      await options.redis.command<string>(['SET',key,'done','EX',2592000]);
      return result({ok:true,id,duplicate:false,category,...decision,alertRequiresAck:decision.decision==='YOS_ALERT'},201);
    }catch{
      // Keep the pending receipt: a timed-out PATCH may have actually succeeded.
      return result({error:'Inbox saving unconfirmed; original notification remains'},503);
    }finally{
      // Never delete another request's active lock, including a lock reacquired after expiry.
      // If Redis is unavailable the owned lock expires naturally after 120 seconds.
      if(ownsLock){
        try{await options.redis.command<number>(['EVAL',RELEASE_OWNED_LOCK,1,lock,lockOwner])}catch{}
      }
    }
  };
}
export const notificationInternals={safeText,categoryOf,triage,parseRows,parseCapture};
