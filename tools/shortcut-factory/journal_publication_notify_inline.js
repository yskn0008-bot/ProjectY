// YOS JOURNAL reader notification sensor. This NEVER publishes or uploads.
// Must only run after a separate daily iOS automation trigger (e.g. 08:00 JST).
// It checks the existing PUBLIC main/latest.json and notifies only the current JST issue.
'use strict';
const SOURCE='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/ios-app/scriptable/journal/latest.json';
const READER='https://yskn0008-bot.github.io/ProjectY/journal-v2/';
const STATE_FILE='YOS JOURNAL Published Notification V1.json';
const SENSITIVE=/(?:sk-proj-|ntn_[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]{16,}|Bearer\s+\S+|口座番号|暗証番号|マイナンバー|あなたの残高|ようすけ|陽介)/i;
function dayJST(date){
  const chunks=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const p={};for(const item of chunks){if(item.type!=='literal')p[item.type]=item.value;}
  return p.year+'-'+p.month+'-'+p.day;
}
function statusStore(){
  try{
    const fm=FileManager.local();
    return {fm,path:fm.joinPath(fm.documentsDirectory(),STATE_FILE)};
  }catch(_){return null;}
}
function lastSent(store){
  if(!store)return null;
  try{return store.fm.fileExists(store.path)?JSON.parse(store.fm.readString(store.path)):null;}
  catch(_){return null;}
}
function isPublicToday(data,now){
  if(!data||typeof data!=='object'||Array.isArray(data))return false;
  if(data.issuedOn!==dayJST(now)||!/^\d{4}-\d{2}-\d{2}$/.test(data.issuedOn))return false;
  if(!Array.isArray(data.articles)||data.articles.length<1||data.articles.length>6)return false;
  if(typeof data.headline!=='string'||data.headline.trim().length<12||data.headline.length>160)return false;
  const input=JSON.stringify(data);
  if(input.length>65000||SENSITIVE.test(input))return false;
  for(const x of data.articles){
    if(!x||typeof x!=='object'||typeof x.title!=='string'||x.title.length<8||x.title.length>160)return false;
    if(typeof x.link!=='string'||!x.link.startsWith('https://'))return false;
    const url=x.link.match(/^https:\/\/([a-z0-9.-]+)(?=\/|$)/i);
    if(!url||!url[1].includes('.')||url[1].endsWith('.invalid')||x.link.includes('@'))return false;
  }
  return true;
}
async function execute(){
  const now=new Date(),currentDay=dayJST(now);
  try{
    const req=new Request(SOURCE+'?v='+encodeURIComponent(currentDay));
    req.method='GET';req.timeoutInterval=6;req.headers={Accept:'application/json'};
    req.onRedirect=next=>String(next?.url||'').startsWith('https://raw.githubusercontent.com/yskn0008-bot/ProjectY/')?next:null;
    const issue=await req.loadJSON();
    if(!req.response||req.response.statusCode!==200){Script.setShortcutOutput('YOS_JOURNAL_NOTIFY_HOLD:HTTP');return;}
    if(!isPublicToday(issue,now)){Script.setShortcutOutput('YOS_JOURNAL_NOTIFY_HOLD:NO_CURRENT_PUBLIC_ISSUE');return;}
    const store=statusStore();
    if(!store){Script.setShortcutOutput('YOS_JOURNAL_NOTIFY_HOLD:NO_PRIVATE_STATE');return;}
    const key=issue.issuedOn;
    const seen=lastSent(store);
    if(seen&&seen.date===key){Script.setShortcutOutput('YOS_JOURNAL_NOTIFY_ALREADY_SENT');return;}
    const notification=new Notification();
    notification.identifier='YOS-JOURNAL-ISSUE-'+key;
    notification.title='YOS JOURNAL｜今日の特集';
    notification.body=issue.headline.trim().slice(0,130);
    notification.openURL=READER;
    notification.setTriggerDate(new Date(Date.now()+3000));
    await notification.schedule();
    const payload=JSON.stringify({date:key,issuedAt:new Date().toISOString()});
    store.fm.writeString(store.path,payload);
    if(store.fm.readString(store.path)!==payload)throw Error('NOTIFICATION_STATE_PERSIST_FAILED');
    Script.setShortcutOutput('YOS_JOURNAL_NOTIFY_SCHEDULED');
  }catch(_){
    // A notification may have been scheduled when state writes fail:
    // fixed identifier helps avoid duplicate scheduled notifications.
    Script.setShortcutOutput('YOS_JOURNAL_NOTIFY_HOLD:ERROR');
  }
}
try{await execute();}finally{Script.complete();}
