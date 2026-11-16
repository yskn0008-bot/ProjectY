/* Clarity Device Pilot v4: one input, multiple independent, verified routes.
 * AI may only suggest {text,target,confidence} items. It cannot issue commands.
 * Original Inbox capture must already be saved and read back before ANY route.
 * One stable captureId + item index is used as destination sync key.
 */
const V3={
  tokenKey:'YOS_NOTION_INTEGRATION_TOKEN',
  file:'YOS Clarity Device Pilot v4 Receipts.json',
  version:'2025-09-03',maxItems:6,
  sources:{
    task:{id:'965c6086-32c1-463d-93b4-87a9cb69b3ad',title:'やること',key:'同期キー'},
    shopping:{id:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc',title:'商品名',key:'メモ'},
    diary:{id:'fe0e0973-d1cc-4bde-b138-1cb1da64ac68',title:'日記',key:'記録キー'},
    life:{id:'30df9a73-2ea7-4ff7-8187-2b62dc8f9da4',title:'イベント名',key:'記録キー'}
  }
};
const trim=s=>String(s??'').trim();
const plain=rs=>(rs||[]).map(x=>x.plain_text??x.text?.content??'').join('');
const rich=s=>[{type:'text',text:{content:String(s)}}];
const propTitle=s=>({title:rich(s)});
const propText=s=>({rich_text:rich(s)});
const day=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
const clean=s=>trim(s).replace(/[。!！]+$/u,'').trim();
const unsafe=/(?:削除|キャンセル|取り消し|登録しない|追加しない|記録しない|買わない|欲しくない|したくない|中止|やめる)/u;
const finance=/(?:残高|支払|入金|出金|返済|振込|送金|口座|銀行|PayPay|クレジット|請求|引落|\d[\d,]*\s*円)/iu;
const dateRisk=/(?:明日|あした|明後日|今週|来週|来月|来年|再来週|今日|今夜|今度|月末|\d{1,2}\s*[日月時]|\d{1,4}[-/]\d{1,2}|予定|期限|締切|予約)/u;
function decide(segment){
  if(!segment||typeof segment!=='object'||!['task','shopping','diary','life'].includes(segment.target))return null;
  const conf=Number(segment.confidence);
  if(!Number.isFinite(conf)||conf<0.95||conf>1)return null;
  const raw=trim(segment.text).normalize('NFKC');
  if(raw.length<3||raw.length>1000||/[?？]/u.test(raw)||unsafe.test(raw)||finance.test(raw))return null;
  if((segment.target==='task'||segment.target==='shopping')&&dateRisk.test(raw))return null;
  let title='',m;
  if(segment.target==='task'){
    m=/^(?:タスク|やること)(?:に)?\s*[:：]\s*(.+)$/u.exec(raw)||/^(.+?)を(?:タスク|やること)に(?:登録|追加|入れて)(?:して)?[。!！]?$/u.exec(raw);
    title=clean(m?.[1]||(/^[^\n]{2,80}(?:する|片付ける|掃除する)[。!！]?$/u.test(raw)&&conf>=0.98?raw:''));
  } else if(segment.target==='shopping'){
    m=/^(?:買い物リスト|買い物|欲しいもの)(?:に)?\s*[:：]\s*(.+)$/u.exec(raw)
     || /^(.+?)を(?:買い物リスト|欲しいもの)に(?:追加|登録|入れて)(?:して)?[。!！]?$/u.exec(raw);
    title=clean(m?.[1]||(/^[^\n]{2,90}(?:を|が)?(?:買いたい|買わなきゃ|欲しい)[。!！]?$/u.test(raw)&&conf>=0.98?raw.replace(/(?:を|が)?(?:買いたい|買わなきゃ|欲しい)[。!！]?$/u,''):''));
    title=title.replace(/(?:も|を|が)$/u,'').trim();
  } else if(segment.target==='diary'){
    m=/^(?:日記に|日記\s*[:：])\s*(.+?)(?:を(?:記録|保存)して)?[。!！]?$/u.exec(raw);
    title=clean(m?.[1]||'');
  } else if(segment.target==='life'){
    m=/^(?:生活記録\s*[:：])\s*(.+)$/u.exec(raw)||/^生活記録に\s*(.+?)を(?:記録|保存)して[。!！]?$/u.exec(raw);
    title=clean(m?.[1]||'');
  }
  if(!title||title.length>120||/[\r\n]/u.test(title)||/^(?:テスト|試験)$/u.test(title))return null;
  return {target:segment.target,title,raw};
}
function parsePlan(json,raw){
  let items;
  try{items=JSON.parse(json);}catch(_){throw Error('BAD_MODEL_JSON');}
  if(!Array.isArray(items)||items.length<1||items.length>V3.maxItems)throw Error('BAD_MODEL_ITEMS');
  // All suggestions must be anchored to the exact user's original text.
  // Detect overlap; never let GPT invent content outside the captured input.
  const taken=[];
  for(const item of items){
    if(!item||typeof item.text!=='string'||item.text.length<3||item.text.length>1000||!['task','shopping','diary','life','hold','timer','brightness'].includes(item.target)||typeof item.confidence!=='number'||item.confidence<0||item.confidence>1)throw Error('BAD_MODEL_ITEM');
    const text=item.text.trim();let p=raw.indexOf(text),found=-1;
    while(p>=0){if(taken.every(([a,b])=>p+text.length<=a||p>=b)){found=p;break;}p=raw.indexOf(text,p+1);}
    if(found<0)throw Error('MODEL_TEXT_NOT_IN_ORIGINAL');
    taken.push([found,found+text.length]);
  }
  // Do not require full coverage; any unmentioned text remains in Inbox.
  return items;
}
async function notion(method,path,token,body){
  const req=new Request('https://api.notion.com/v1'+path);req.method=method;
  req.headers={'Authorization':'Bearer '+token,'Notion-Version':V3.version,'Content-Type':'application/json'};
  if(body!==undefined)req.body=JSON.stringify(body);
  let v;try{v=await req.loadJSON();}catch(_){throw Error('NOTION_UNKNOWN');}
  const status=req.response?.statusCode??0;
  if(status<200||status>=300)throw Error('NOTION_HTTP_'+status);
  return v;
}
function keyValue(page,source){const p=page.properties?.[source.key];return plain(p?.rich_text||p?.title);}
function matchingKey(page,source,target,key){const v=keyValue(page,source);return target==='shopping'?v.split(/\r?\n/u).includes(key):v===key;}
async function query(token,source,property,filter){
  const type=property===source.title?'title':'rich_text';
  const result=await notion('POST','/data_sources/'+source.id+'/query',token,{filter:{property,[type]:filter},page_size:2});
  if(result.has_more||(result.results||[]).length>1)throw Error('AMBIGUOUS');
  return result.results||[];
}
function props(decision,row,key){
  const {target,title,raw}=decision;
  if(target==='task')return {'やること':propTitle(title),'同期キー':propText(key),'正本・根拠':propText('YOS Inbox '+row.captureId),'種類':{select:{name:'Task'}},'状態':{select:{name:'次にやる'}}};
  if(target==='shopping')return {'商品名':propTitle(title),'メモ':propText(raw+'\n'+key),'区分':{select:{name:'欲しいもの'}},'買い物状態':{select:{name:'検討中'}}};
  if(target==='diary')return {'日記':propTitle(day(row.startedAt)+'｜Clarity'),'本文':propText(title),'日付':{date:{start:day(row.startedAt)}},'記録元':{select:{name:'Clarity'}},'記録キー':propText(key)};
  return {'イベント名':propTitle(title),'備考':propText(raw),'記録キー':propText(key),'取得元':{select:{name:'Clarity'}},'種類':{select:{name:'その他'}}};
}
function save(fm,path,rows){const value=JSON.stringify(rows);fm.writeString(path,value);if(fm.readString(path)!==value)throw Error('LOCAL_READBACK_FAIL');}
async function run(){
  const text=String(args.shortcutParameter??'');const boundary='\n__YOS_V4_RAW__\n';const idx=text.indexOf(boundary);
  if(idx<1)return 'AI応答の形式が不正。Inbox原文は保護';
  const json=text.slice(0,idx).trim(),raw=text.slice(idx+boundary.length).trim();
  const fm=FileManager.local(),path=fm.joinPath(fm.documentsDirectory(),V3.file);
  let rows;try{rows=JSON.parse(fm.readString(path));if(!Array.isArray(rows))throw Error();}catch(_){return '端末の原文確認に失敗。仕分け停止';}
  const row=rows.filter(x=>x?.raw===raw).sort((a,b)=>Number(b.startedAt)-Number(a.startedAt))[0];
  if(!row||row.inboxStatus!=='confirmed')return 'Inbox未確認。仕分け停止・原文保持';
  let items;try{items=parsePlan(json,row.raw);}catch(_){return 'AI出力が不正。仕分け停止・原文保持';}
  if(!Keychain.contains(V3.tokenKey)||!Keychain.get(V3.tokenKey))return 'Inbox保存済み／認証なし。仕分け保留';
  const token=Keychain.get(V3.tokenKey);
  const planSignature=JSON.stringify(items.map(item=>[item.text.trim(),item.target]));
  if(row.planSignature&&row.planSignature!==planSignature)return '前回とAI分類が異なるため、安全停止。原文はInbox保持';
  if(!row.planSignature){row.planSignature=planSignature;try{save(fm,path,rows);}catch(_){return '端末の分類状態を保存できず、安全停止';}}
  row.items ||= {};
  let completed=0,duplicates=0,held=0,unknown=0;const results=[];
  let deviceCommand=null;
  const decideDevice=(item)=>{
    if(!item||!['timer','brightness'].includes(item.target)||Number(item.confidence)<0.98)return null;
    const t=trim(item.text).normalize('NFKC');
    if(/[\r\n?？]|(消|停止|削除|解除|取消|しない|なくして|やめて)/u.test(t))return null;
    if(item.target==='timer'){
      const m=/^(?:タイマー\s*[:：]\s*([1-9]\d?)\s*分(?:\s*(?:に設定|開始|スタート))?|([1-9]\d?)\s*分(?:の)?タイマー(?:を)?(?:かけて|開始|スタート))$/u.exec(t);
      const n=Number(m?.[1]||m?.[2]);
      return n>=1&&n<=60?{operation:'start_timer',value:n}:null;
    }
    const m=/^(?:画面の)?明るさ\s*[:：]\s*(100|[1-9]\d?)\s*%(?:\s*にして)?$/u.exec(t);
    const n=Number(m?.[1]);
    return n>=5&&n<=100?{operation:'set_brightness',value:n}:null;
  };
  for(let i=0;i<items.length;i++){
    const item=items[i],num=String(i+1).padStart(2,'0'),state=row.items[num]||{};
    if(state.status==='confirmed'){completed++;results.push(num+':済');continue;}
    if(item.target==='timer'||item.target==='brightness'){
      const candidate=decideDevice(item);
      if(!candidate){held++;results.push(num+':操作保留');continue;}
      // Reject a standalone command quoted in a longer context or negated elsewhere in the input.
      if(/(?:実行しない|操作しない|セットしない|しないで|禁止|見本|例文|引用|転記|架空|仮定|サンプル|通知本文|メール本文|共有文)/u.test(row.raw)){
        held++;results.push(num+':引用・否定などの文脈で保留');continue;
      }
      if(!row.raw.split(/\r?\n/u).some(line=>line.trim()===trim(item.text))){held++;results.push(num+':独立した操作行でないため保留');continue;}
      // One device dispatch per capture, even after the first action has returned.
      if(row.deviceOperationKey&&row.deviceOperationKey!==num){held++;results.push(num+':同一受付で2件目の操作は保留');continue;}
      if(deviceCommand){held++;results.push(num+':2件目の操作保留');continue;}
      if(state.status==='device_action_returned'){duplicates++;results.push(num+':操作済み記録');continue;}
      // Fail closed on any uncertain prior run. No blind re-execution.
      if(state.attempts>0){unknown++;results.push(num+':前回の端末操作結果不明');continue;}
      // Mark dispatch before the iOS action runs; if the shortcut crashes, do NOT replay.
      row.deviceOperationKey=num;
      row.items[num]={attempts:1,status:'device_dispatching',target:item.target,
        operation:candidate.operation,value:candidate.value};
      try{save(fm,path,rows);}catch(_){return JSON.stringify({operation:'none',value:0,key:'',summary:'端末への操作依頼状態を記録できず安全停止'});}
      deviceCommand={...candidate,key:'inbox:'+row.captureId+':'+num};
      results.push(num+':端末操作依頼');
      continue;
    }
    const decision=decide(item);
    if(!decision){held++;results.push(num+':保留');continue;}
    const src=V3.sources[decision.target],key='inbox:'+row.captureId+':'+num;
    const sameKeyFilter=decision.target==='shopping'?{contains:key}:{equals:key};
    try{
      const existing=await query(token,src,src.key,sameKeyFilter);
      if(existing.length){
        const pg=await notion('GET','/pages/'+existing[0].id,token);
        if(!matchingKey(pg,src,decision.target,key))throw Error('KEY_MISMATCH');
        row.items[num]={status:'confirmed',target:decision.target,pageId:existing[0].id};save(fm,path,rows);
        duplicates++;results.push(num+':既存確認');continue;
      }
      // After an uncertain write, do not blindly create again.
      if(state.attempts>0){unknown++;results.push(num+':前回結果不明');continue;}
      const name=decision.target==='diary'?day(row.startedAt)+'｜Clarity':decision.title;
      if((await query(token,src,src.title,{equals:name})).length){held++;results.push(num+':同名保留');continue;}
      if(decision.target==='diary'){
        const d=await notion('POST','/data_sources/'+src.id+'/query',token,{filter:{property:'日付',date:{equals:day(row.startedAt)}},page_size:2});
        if(d.has_more||(d.results||[]).length){held++;results.push(num+':既存日記保留');continue;}
      }
    }catch(_){unknown++;results.push(num+':照合失敗');continue;}
    row.items[num]={attempts:1,status:'unknown',target:decision.target};
    try{save(fm,path,rows);}catch(_){return '安全停止：登録前状態を保存できず。Inbox原文は保持';}
    try{
      const created=await notion('POST','/pages',token,{parent:{type:'data_source_id',data_source_id:src.id},properties:props(decision,row,key)});
      if(!created.id)throw Error('MISSING_ID');
      const readback=await notion('GET','/pages/'+created.id,token);
      if(!matchingKey(readback,src,decision.target,key))throw Error('READBACK_MISMATCH');
      row.items[num]={status:'confirmed',target:decision.target,pageId:created.id};
      save(fm,path,rows);completed++;results.push(num+':'+decision.target+'成功');
    }catch(_){unknown++;results.push(num+':登録結果不明');/* continue, but never retry this item blindly */}
  }
  // Any text excluded by model or >6 items is still kept in Inbox.
  return JSON.stringify({operation:deviceCommand?.operation||'none',value:deviceCommand?.value||0,key:deviceCommand?.key||'',summary:'Inbox保存済｜登録'+completed+'件／既存'+duplicates+'件／保留'+held+'件／未確認'+unknown+'件 '+results.join(' ')});
}
try{
  const result=await run();
  let payload;
  try{payload=JSON.parse(result);}catch(_){payload={operation:'none',value:0,key:'',summary:String(result)};}
  if(!payload||typeof payload!=='object'||typeof payload.operation!=='string')payload={operation:'none',value:0,key:'',summary:'結果の形式が不明'};
  Script.setShortcutOutput(JSON.stringify(payload));
}catch(_){Script.setShortcutOutput(JSON.stringify({operation:'none',value:0,key:'',summary:'振り分け保護停止。Inbox原文は保持'}));}
Script.complete();
