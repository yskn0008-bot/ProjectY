/* Clarity Voice Pilot v3 — stage 1, Raw First.
 * Keep existing Clarity unchanged. This code is executed inside Scriptable Run Inline Script.
 * Its one job is durable local capture + verified YOS Inbox append.
 */
const YOS2={
  inboxId:'3d35ca88-2895-81ef-9dc8-d5f11ff8e213',
  tokenKey:'YOS_NOTION_INTEGRATION_TOKEN',
  file:'YOS Clarity Voice Pilot v3 Receipts.json',
  version:'2025-09-03',maxChars:14000
};
function sanitize(v){return String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();}
function richText(b){return (b?.[b.type]?.rich_text||[]).map(x=>x.plain_text??x.text?.content??'').join('');}
function paragraph(s){return {object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:s}}]}};}
function parts(text,n=1600){const r=[];for(let i=0;i<text.length;i+=n)r.push(text.slice(i,i+n));return r;}
function receiptPath(){const fm=FileManager.local();return {fm,path:fm.joinPath(fm.documentsDirectory(),YOS2.file)};}
function loadRows(fm,path){if(!fm.fileExists(path))return [];const v=JSON.parse(fm.readString(path));if(!Array.isArray(v))throw Error('CORRUPT_RECEIPTS');return v;}
function saveRows(fm,path,rows){
  const latest=rows.filter(x=>x&&x.inboxStatus==='confirmed').slice(-100);
  const outstanding=rows.filter(x=>!x||x.inboxStatus!=='confirmed');
  const data=JSON.stringify([...latest,...outstanding]);
  fm.writeString(path,data);
  if(fm.readString(path)!==data)throw Error('LOCAL_READBACK_FAILED');
}
function newCaptureId(){return 'clarity:trial2-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1e9).toString(36);}
async function notion(method,path,token,body){
  const req=new Request('https://api.notion.com/v1'+path);
  req.method=method;
  req.headers={'Authorization':'Bearer '+token,'Notion-Version':YOS2.version,'Content-Type':'application/json'};
  if(body!==undefined)req.body=JSON.stringify(body);
  let result;
  try{result=await req.loadJSON();}catch(_){throw Error('NETWORK_RESULT_UNKNOWN');}
  const status=req.response?.statusCode??0;
  if(status<200||status>=300)throw Error('NOTION_HTTP_'+status);
  return result;
}
async function stage1(){
  const raw=sanitize(args.shortcutParameter);
  if(!raw)return '入力なし（保存なし）';
  const {fm,path}=receiptPath();let rows;
  try{rows=loadRows(fm,path);}catch(_){return '保存記録の読込み失敗。既存記録保護のため停止';}
  const now=Date.now();
  let row=rows.find(x=>x&&x.raw===raw&&now-Number(x.startedAt)<86400000);
  if(!row){row={captureId:newCaptureId(),startedAt:now,raw,inboxStatus:'pending',inboxAttempts:0,routeStatus:'pending',routeAttempts:0};rows.push(row);}
  try{saveRows(fm,path,rows);}catch(_){return '端末保存・読戻し失敗。Notion送信は停止';}
  if(row.inboxStatus==='confirmed')return 'Inbox保存確認済み: '+row.captureId;
  if(row.inboxAttempts>0)return '前回送信の結果不明。重複防止のため再送保留: '+row.captureId;
  if(raw.length>YOS2.maxChars)return '原文のみ端末保存（長文は送信保留）: '+row.captureId;
  if(!Keychain.contains(YOS2.tokenKey))return '原文のみ端末保存（既存Notion認証なし）: '+row.captureId;
  const token=Keychain.get(YOS2.tokenKey);
  if(!token)return '原文のみ端末保存（既存Notion認証なし）: '+row.captureId;
  row.inboxAttempts=1;
  row.inboxStatus='unknown';
  try{saveRows(fm,path,rows);}catch(_){return '送信前状態を保護できず停止';}
  const chunks=parts(raw);
  const meta=new Date(row.startedAt).toISOString()+' · Clarity.Text · '+row.captureId;
  const blocks=[paragraph(meta),...chunks.map(paragraph),{object:'block',type:'divider',divider:{}}];
  try{
    const written=await notion('PATCH','/blocks/'+YOS2.inboxId+'/children',token,{children:blocks});
    const items=written.results||[];
    if(items.length!==blocks.length||items.some(x=>!x.id))throw Error('INBOX_WRITE_REPLY_UNKNOWN');
    if(richText(items[0])!==meta||chunks.some((s,i)=>richText(items[i+1])!==s))throw Error('INBOX_RESPONSE_MISMATCH');
    // Read back every raw block. PATCH response alone is insufficient.
    for(let i=0;i<items.length-1;i++){
      const block=await notion('GET','/blocks/'+items[i].id,token);
      if(richText(block)!==(i===0?meta:chunks[i-1]))throw Error('INBOX_READBACK_MISMATCH');
    }
    row.inboxStatus='confirmed';row.inboxConfirmedAt=Date.now();
    saveRows(fm,path,rows);
    return 'Inbox保存・読戻し成功: '+row.captureId;
  }catch(_){
    row.inboxStatus='unknown';
    try{saveRows(fm,path,rows);}catch(_e){}
    return '端末保存済み。Notion結果不明・再送停止: '+row.captureId;
  }
}
try{Script.setShortcutOutput(await stage1());}catch(_){Script.setShortcutOutput('保護停止。端末・Notion保存結果を確認してください');}
Script.complete();
