// YOS DAYSTREAM native preview bridge — Scriptable (development only)
// Existing Scriptable Keychain; read-only Notion / Apple Calendar. No new shortcuts or servers.
// Requires the unchanged production Clarity / Notion Inbox setup only for credentials.
'use strict';
const PREVIEW_URL = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/refs/heads/feat/yos-calendar-web-preview-20261101/life/calendar/daystream-native.html';
const HTML_SHA256 = 'eb4f404fad19b0b1b1ede7910931e2382ca887cbdbe44f304182a9fd867b4898';
// Compatibility marker for the already-installed iPhone launcher; actual HTML integrity is checked against HTML_SHA256.
const INSTALLED_LAUNCHER_MARKER = 'b31ebae6e68de7f8d718cb28bd849e808efb147aedaa78b7e7b0c1b491655e90';
function sha256Hex(input){
  const K=[
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes=Array.from(unescape(encodeURIComponent(input)),c=>c.charCodeAt(0));
  const bitLength=bytes.length*8;
  if(bitLength>=0x20000000000000)throw Error('sha256 payload too long');
  bytes.push(0x80);while(bytes.length%64!==56)bytes.push(0);
  const high=Math.floor(bitLength/0x100000000),low=bitLength>>>0;
  for(let i=3;i>=0;i--)bytes.push((high>>>i*8)&255);
  for(let i=3;i>=0;i--)bytes.push((low>>>i*8)&255);
  const rr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let at=0;at<bytes.length;at+=64){
    const w=new Array(64).fill(0);
    for(let i=0;i<16;i++)w[i]=(bytes[at+i*4]<<24)|(bytes[at+i*4+1]<<16)|(bytes[at+i*4+2]<<8)|bytes[at+i*4+3];
    for(let i=16;i<64;i++){
      const a=w[i-15],b=w[i-2],s0=rr(a,7)^rr(a,18)^(a>>>3),s1=rr(b,17)^rr(b,19)^(b>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const s1=rr(e,6)^rr(e,11)^rr(e,25),ch=(e&f)^((~e)&g),t1=(h+s1+ch+K[i]+w[i])>>>0;
      const s0=rr(a,2)^rr(a,13)^rr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    for(const [i,x] of [a,b,c,d,e,f,g,h].entries())H[i]=(H[i]+x)>>>0;
  }
  return H.map(v=>v.toString(16).padStart(8,'0')).join('');
}

const NOTION_KEY = 'YOS_NOTION_INTEGRATION_TOKEN'; // existing Scriptable key: never shared with WebView
const TASK_SOURCE = '965c6086-32c1-463d-93b4-87a9cb69b3ad'; // existing YOS Tasks
const MONEY_SOURCE = '95b30d16-7530-40c6-a320-dab99acad55d'; // existing 家計イベント・入出金予定
const TZ='Asia/Tokyo';
const dateKey=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const addDays=(date,n)=>{const d=new Date(date.getFullYear(),date.getMonth(),date.getDate()+n,12);return d};
const clean=(value,limit=120)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').trim().slice(0,limit);
const rich=(value,type)=>Array.isArray(value?.[type])?clean(value[type].map(x=>x.plain_text||x.text?.content||'').join(''),120):'';
const select=x=>clean(x?.select?.name,30);
const dateVal=x=>{const raw=x?.date?.start;if(typeof raw!=='string')return '';if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const d=new Date(raw);return Number.isFinite(d.getTime())?dateKey(d):'';};
const validDay=k=>/^\d{4}-\d{2}-\d{2}$/.test(k);

async function queryNotion(source,field,start,end,token){
  const result=[],filter={and:[
    {property:field,date:{on_or_after:start}},
    {property:field,date:{on_or_before:end}}
  ]};
  let cursor=null;
  for(let page=0;page<4;page++){
    const req=new Request('https://api.notion.com/v1/data_sources/'+source+'/query');
    req.method='POST';req.headers={
      Authorization:'Bearer '+token,'Content-Type':'application/json',
      'Notion-Version':'2026-03-11',Accept:'application/json'
    };
    req.timeoutInterval=8;
    req.body=JSON.stringify({page_size:100,filter,...(cursor?{start_cursor:cursor}:{})});
    const res=await req.loadJSON();
    if(req.response?.statusCode!==200 || !res || !Array.isArray(res.results))throw Error('Notion query unavailable');
    result.push(...res.results);
    if(res.has_more!==true)return {rows:result,complete:true};
    if(typeof res.next_cursor!=='string'||!res.next_cursor)throw Error('Notion cursor missing');
    cursor=res.next_cursor;
  }
  return {rows:result,complete:false};
}
function parseTask(row){
  const p=row?.properties;if(!p)return null;
  const title=rich(p['やること'],'title'),date=dateVal(p['期限']),status=select(p['状態']);
  if(!title||!validDay(date)||['中止','完了','キャンセル','取り消し'].includes(status))return null;
  const nextAction=rich(p['次の一手'],'rich_text'),completion=rich(p['完了条件'],'rich_text'),blocker=rich(p['ブロッカー'],'rich_text');
  const provenance=rich(p['正本・根拠'],'rich_text'),syncKey=rich(p['同期キー'],'rich_text');
  // Only calendar-origin copies may be hidden. Never infer a mirror from title alone.
  const calendarMirror=provenance==='Apple Calendar'||syncKey.startsWith('calendar:');
  // A human-added action or blocker remains independently actionable, even with a matching event.
  const explicitAction=Boolean(nextAction.trim()||completion.trim()||blocker.trim());
  const priority=select(p['優先度']),order=p['実行順']?.number;
  const rawStart=p['期限']?.date?.start,ts=typeof rawStart==='string'&&rawStart.includes('T')?new Date(rawStart):null;
  const fixedTime=ts&&Number.isFinite(ts.getTime())?new Intl.DateTimeFormat('ja-JP',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(ts):'';
  return {type:'task',date,title,subtitle:status||'状態未確認',nextAction,completion,blocker,done:false,source:'Notion Tasks',id:clean(row.id||title,70),calendarMirror,explicitAction,
    priority:['P0','P1','P2','P3'].includes(priority)?priority:'',order:Number.isFinite(order)?order:null,fixedTime};
}
function parseMoney(row){
  const p=row?.properties;if(!p)return null;
  const title=rich(p['項目'],'title'),date=dateVal(p['日付']),amount=p['金額']?.number;
  const category=select(p['区分']),status=select(p['状態']),verification=select(p['確度']);
  if(!title||!validDay(date)||!Number.isFinite(amount)||amount<0||amount>1000000000||status==='取消')return null;
  const kind=category==='収入'?'income':category==='支出'?'expense':null;
  if(!kind)return null; // Exclude transfers, avoiding double counting.
  const complete=status==='実績'&&verification==='確認済';
  const reviewRequired=status==='実績'&&!complete;
  const subtitle=complete?'実績（確認済）':status==='実績'?'実績報告（要照合）':verification==='確認済'?'予定（確認済）':'予定・未確認';
  return {type:'money',date,title,subtitle,amount:Math.round(amount),moneyKind:kind,complete,reviewRequired,source:'Notion家計',id:clean(row.id||title,70)};
}
async function readApple(start,end){
  try{
    const from=new Date(start+'T00:00:00+09:00'),to=new Date(end+'T00:00:00+09:00');
    to.setDate(to.getDate()+1);
    const events=await CalendarEvent.between(from,to);
    // Remove reference-only taxi-demand entries before applying the display cap.
    // Otherwise 250 reference events can crowd out genuine appointments.
    const eligible=(Array.isArray(events)?events:[]).filter(x=>
      x?.title&&!/^[\s　]*[［\[【]\s*タクシー需要/.test(x.title)&&
      !/タクシー需要/.test(x.calendar?.title||'')
    );
    // Deduplicate visually identical all-day events (e.g. holidays imported
    // from multiple calendars). Timed appointments and source data stay intact.
    const seenAllDay=new Map();
    const duplicates=[];
    const unique=eligible.filter(x=>{
      if(!x.isAllDay)return true;
      const begin=new Date(x.startDate);
      if(!Number.isFinite(begin.getTime()))return true;
      const key=dateKey(begin)+'|'+clean(x.title,100).normalize('NFKC').trim();
      if(seenAllDay.has(key)){
        const first=seenAllDay.get(key);
        duplicates.push({date:dateKey(begin),title:clean(x.title,100),
          firstCalendar:clean(first.calendar?.title||'不明',80),
          duplicateCalendar:clean(x.calendar?.title||'不明',80),
          sameIdentifier:String(first.identifier||'')===String(x.identifier||'')});
        return false;
      }
      seenAllDay.set(key,x);return true;
    });
    // Diagnostics stay in Scriptable's local console. No calendar changes,
    // no remote uploads, and no additional UI prompts.
    if(duplicates.length){
      console.log('[DAYSTREAM] Apple終日予定の重複 '+duplicates.length+'件: '+JSON.stringify(duplicates.slice(0,30)));
    }
    const rows=unique.slice(0,170).flatMap((x,i)=>{
      const begin=new Date(x.startDate);if(!Number.isFinite(begin.getTime()))return [];
      const date=dateKey(begin);
      if(date<start||date>end)return [];
      const time=x.isAllDay?'終日':new Intl.DateTimeFormat('ja-JP',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(begin);
      return [{type:'schedule',date,title:clean(x.title,100),subtitle:time,source:'Appleカレンダー',id:clean(x.identifier||i,70)}];
    });
    return {status:unique.length>170?'partial':'ok',rows};
  }catch{return {status:'error',rows:[]}};
}
async function readNotion(source,field,parse,start,end,token){
  if(!token)return {status:'unavailable',rows:[]};
  try{
    const result=await queryNotion(source,field,start,end,token);
    const parsed=result.rows.map(parse).filter(Boolean);
    return {status:result.complete&&parsed.length<=165?'ok':'partial',rows:parsed.slice(0,165)};
  }catch{return {status:'error',rows:[]}};
}
async function readPreview(){
  const req=new Request(PREVIEW_URL);req.timeoutInterval=12;
  const html=await req.loadString();
  if(req.response?.statusCode!==200 || sha256Hex(html)!==HTML_SHA256 || !html.startsWith('<!doctype html>') ||
    !html.includes('window.YOS_DAYSTREAM_NATIVE_V1=') ||
    html.includes('<script src=') || html.includes('fetch(') || html.includes('XMLHttpRequest') ||
    !html.includes("const PLAN_KEY='yos-daystream-plan-v1'") ||
    html.split('localStorage.'+'setItem(').length!==2 ||
    !html.split('localStorage.'+'setItem(')[1].startsWith('PLAN_KEY,encoded)'))throw Error('Preview HTML is not compatible');
  return html;
}
async function main(){
  const now=new Date(),start=dateKey(addDays(now,-14)),end=dateKey(addDays(now,46));
  let token='';try{if(Keychain.contains(NOTION_KEY))token=Keychain.get(NOTION_KEY)||''}catch{}
  const [apple,tasks,money,html]=await Promise.all([
    readApple(start,end),
    readNotion(TASK_SOURCE,'期限',parseTask,start,end,token),
    readNotion(MONEY_SOURCE,'日付',parseMoney,start,end,token),
    readPreview()
  ]);
  const seenAllDay=new Set();
  const uniqueApple=apple.rows.filter(x=>{
    if(x.type!=='schedule'||x.subtitle!=='終日')return true;
    const key=x.date+'|'+String(x.title||'').normalize('NFKC').replace(/[\\s　]+/g,'').trim();
    if(seenAllDay.has(key))return false;
    seenAllDay.add(key);
    return true;
  });
  // Each source has a reserved quota (170/165/165): one full calendar must not displace money or Tasks.
  // Apple/Notion sometimes hold the same calendar event under separate IDs.
  // Collapse only a proven calendar mirror with matching day+title. Notion rows remain intact.
  const visibleKey=item=>item.date+'|'+clean(item.title,100).normalize('NFKC').split(/\s+/).join(' ').trim().toLocaleLowerCase('ja-JP');
  const appleTitles=new Set(uniqueApple.map(visibleKey));
  const uniqueTasks=tasks.rows.filter(item=>!(
    item.calendarMirror===true && item.explicitAction!==true &&
    appleTitles.has(visibleKey(item))
  ));
  // Don't send mirror metadata to WebView, only fields needed for the view.
  const taskEntries=uniqueTasks.map(({calendarMirror,explicitAction,...viewItem})=>viewItem);
  const allEntries=[...uniqueApple,...taskEntries,...money.rows];
  const entries=allEntries.slice(0,500);
  // The UI accepts at most 500 items. Never report a complete source when
  // the combined cap silently excludes records from the visible calendar.
  if(allEntries.length>500){
    if(apple.status==='ok')apple.status='partial';
    if(tasks.status==='ok')tasks.status='partial';
    if(money.status==='ok')money.status='partial';
  }
  const snapshot={schema:'yos-daystream-native-v1',generatedAt:new Date().toISOString(),
    range:{start,end},sources:{apple:{status:apple.status},tasks:{status:tasks.status},money:{status:money.status}},items:entries};
  const web=new WebView();
  await web.loadHTML(html);
  // Never include Notion API tokens, credentials or internal notes in this payload.
  const ok=await web.evaluateJavaScript('window.YOS_DAYSTREAM_NATIVE_V1('+JSON.stringify(snapshot)+')',false);
  if(ok!==true)throw Error('Native bridge was not accepted by calendar');
  await web.present(true);
}
try {await main();} catch(error){
  const alert=new Alert();alert.title='DAYSTREAMプレビューを表示できません';
  alert.message='接続・読み取りを確認できませんでした。既存のカレンダーやNotionは変更していません。';
  alert.addAction('閉じる');await alert.presentAlert();
} finally {Script.complete();}
