// YOS Apple -> Notion mirror (Scriptable, no server)
// Existing behavior remains the default. Linked mode only reconciles previously tagged events.
// One-time: create Notion integration at https://www.notion.so/profile/integrations
// Grant integration access to the existing YOS Tasks database.
// Scriptable runs this script manually or via an existing iOS Shortcut automation.
const K='YOS_NOTION_INTEGRATION_TOKEN';
const DB='965c6086-32c1-463d-93b4-87a9cb69b3ad'; // Existing YOS Tasks data source
const API='https://api.notion.com/v1';
const VERSION='2025-09-03'; // Preserve existing Notion data-source API contract
const INBOX='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const SHOPPING='d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc';
const DIARY='fe0e0973-d1cc-4bde-b138-1cb1da64ac68';
const fm=FileManager.iCloud();
const stateFile=fm.joinPath(fm.documentsDirectory(),'yos-notion-sync-state.json');
function readState(){try{return JSON.parse(fm.readString(stateFile))}catch{return {}}}
function saveState(x){fm.writeString(stateFile,JSON.stringify(x))}
async function api(path,method='GET',body){
 const req=new Request(API+path);req.method=method;
 req.headers={'Authorization':'Bearer '+Keychain.get(K),'Notion-Version':VERSION,'Content-Type':'application/json'};
 if(body!==undefined)req.body=JSON.stringify(body);
 const response=await req.loadJSON();
 if(req.response.statusCode>=300)throw Error('Notion '+req.response.statusCode+': '+JSON.stringify(response).slice(0,250));
 return response;
}
function title(s){return [{text:{content:String(s||'無題').slice(0,1800)}}]}
function iso(d){return d instanceof Date&&!isNaN(d)?d.toISOString():null}
async function ensureToken(){
 if(Keychain.contains(K))return true;
 const a=new Alert();a.title='Notion連携';a.message='Notionのインテグレーションシークレットを入力（端末のKeychainに保存）';a.addSecureTextField('secret_...');a.addAction('保存');a.addCancelAction('キャンセル');
 if(await a.present()!==0)return false;
 const token=a.textFieldValue(0).trim();if(!token)throw Error('認証情報がありません');Keychain.set(K,token);return true;
}
async function sync(){
 if(!await ensureToken())return;
 // Only mirror upcoming events; never remove existing Notion records.
 const start=new Date();start.setDate(start.getDate()-1);
 const end=new Date();end.setDate(end.getDate()+14);
 const calendars=await Calendar.forEvents();
 const events=await CalendarEvent.between(start,end,calendars);
 const reminders=await Reminder.allIncomplete();
 const items=[
  ...events.slice(0,30).map(x=>({key:'calendar:'+x.identifier,name:x.title||'無題の予定',date:iso(x.startDate),url:null,type:'calendar'})),
  ...reminders.slice(0,30).map(x=>({key:'reminder:'+x.identifier,name:x.title||'無題のリマインダー',date:iso(x.dueDate),url:null,type:'reminder'}))
 ];
 const state=readState();let created=0,updated=0,failed=[];
 // Avoid modifying records with keys from unrelated integrations.
 const seen=new Set();
 // Confirm database permission before attempting any writes.
 try { await api('/data_sources/'+DB); } catch(e) { throw Error('YOS Tasksへの接続権限を確認してください: '+String(e.message||e)); }
 // Do not archive or delete items; preserve all existing Notion records.
 // The existing Notion YOS Tasks source uses Japanese property names.
 // Use a database search for stable keys; never delete or archive omitted records.
 for(const x of items){
  if(seen.has(x.key))continue;seen.add(x.key);
  try{
   const result=await api('/data_sources/'+DB+'/query','POST',{filter:{property:'同期キー',rich_text:{equals:x.key}},page_size:2});
   if(result.results.length>1)throw Error('重複した同期キー');
   const props={'やること':{title:title(x.name)},'同期キー':{rich_text:title(x.key)},'最終同期':{date:{start:new Date().toISOString()}},'正本・根拠':{rich_text:title(x.type==='calendar'?'Apple Calendar':'Apple Reminders')}};
   if(x.date)props['期限']={date:{start:x.date}};
   if(!result.results.length){props['種類']={select:{name:'Task'}};props['領域']={select:{name:'Life'}};props['状態']={select:{name:'次にやる'}};}
   // An absent date must not erase a previously recorded date.
   if(result.results.length){
    // Only update records that were explicitly created by this sync key.
    await api('/pages/'+result.results[0].id,'PATCH',{properties:props});updated++
   }
   else{await api('/pages','POST',{parent:{type:'data_source_id',data_source_id:DB},properties:props});created++}
  }catch(e){failed.push(x.key+' '+String(e.message||e));if(failed.length>=5)break}
 }
 state.lastAttempt=new Date().toISOString();state.created=created;state.updated=updated;state.errors=failed;saveState(state);
 const a=new Alert();a.title=failed.length?'Notion同期：要確認':'Notion同期完了';a.message=`新規 ${created}件／更新 ${updated}件`+(failed.length?'\n'+failed.join('\n').slice(0,800):'');a.addAction('OK');await a.present();
}

// Linked Notion -> Apple Calendar date reconciliation (opt-in, no new events).
// Preconditions: existing event notes contain BOTH exact markers below; Notion page must
// still be in the original YOS Tasks data source. Never touch untagged events.
const LINK_MARKER='YOS-TASK-ID:';
const KIND_MARKER='YOS-SYNC-KIND:calendar-booking-task-v1';
const ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function linkedPageId(notes){
 const raw=String(notes||'');
 if(!raw.split(/\r?\n/).some(s=>s.trim()===KIND_MARKER))return null;
 const values=raw.split(/\r?\n/).filter(s=>s.trim().startsWith(LINK_MARKER));
 if(values.length!==1)return null;
 const id=values[0].trim().slice(LINK_MARKER.length).trim();
 return ID_RE.test(id)?id.toLowerCase():null;
}
function planningResult(event,page){
 const props=page&&page.properties;
 const parent=page&&page.parent;
 if(!props||!parent||parent.type!=='data_source_id'||String(parent.data_source_id||'').replace(/-/g,'').toLowerCase()!==DB.replace(/-/g,''))return {status:'skip',reason:'対象外のNotionページ'};
 if(props['状態']?.select?.name==='完了')return {status:'skip',reason:'タスク完了済み（予定は削除しない）'};
 const dated=props['期限']?.date;
 const start=dated?.start;
 if(typeof start!=='string'||!start.includes('T'))return {status:'skip',reason:'Notionに時刻付き期限がない'};
 const when=new Date(start);
 const endDate=dated.end ? new Date(dated.end) : null;
 const oldStart=new Date(event.startDate),oldEnd=new Date(event.endDate);
 if(!Number.isFinite(+when)||!Number.isFinite(+oldStart)||!Number.isFinite(+oldEnd))return {status:'skip',reason:'日時の形式が不正'};
 if(event.isAllDay===true)return {status:'skip',reason:'終日予定は対象外'};
 const duration=endDate? +endDate - +when : +oldEnd - +oldStart;
 if(!Number.isFinite(duration)||duration<=0||duration>8*3600000)return {status:'skip',reason:'終了日時または所要時間が不正'};
 const until=new Date(+when+duration);
 if(Math.abs(+when-(+oldStart))<60000&&Math.abs(+until-(+oldEnd))<60000)return {status:'same'};
 return {status:'change',startDate:when,endDate:until,title:String(event.title||'予定')};
}
async function linkedCalendarSync(){
 if(!await ensureToken())return;
 // Bound the operation and don't use the old Apple -> Notion mirror write path here.
 const start=new Date();start.setDate(start.getDate()-7);
 const end=new Date();end.setDate(end.getDate()+90);
 const calendars=(await Calendar.forEvents()).filter(c=>c.allowsContentModifications!==false);
 const events=(await CalendarEvent.between(start,end,calendars)).filter(e=>linkedPageId(e.notes));
 if(events.length>100)throw Error('識別済み予定が多すぎます。自動変更せず停止します。');
 const idCounts=new Map();for(const e of events){const id=linkedPageId(e.notes);idCounts.set(id,(idCounts.get(id)||0)+1)}
 const proposals=[];const skipped=[];
 for(const event of events){
  const id=linkedPageId(event.notes);
  if(idCounts.get(id)!==1){skipped.push('同じNotionタスクに紐づく予定が複数あります。操作しません。');continue;}
  const page=await api('/pages/'+id);
  if(page.id?.replace(/-/g,'').toLowerCase()!==id.replace(/-/g,'')){skipped.push('NotionページID不一致');continue;}
  const plan=planningResult(event,page);
  if(plan.status==='change')proposals.push({event,id,plan});
  else if(plan.status==='skip')skipped.push(plan.reason);
 }
 const a=new Alert();a.title='YOS｜日時の照合';
 if(!proposals.length){a.message=`変更なし。対象${events.length}件／除外${skipped.length}件`;a.addAction('閉じる');await a.present();return;}
 const preview=proposals.slice(0,5).map(x=>x.plan.title+' → '+x.plan.startDate.toLocaleString('ja-JP')).join('\n');
 a.message=`変更候補${proposals.length}件（対象${events.length}件）\n\n${preview}${proposals.length>5?'\nほか':''}\n\nNotionの期限に合わせて既存iCloud予定の日時だけを更新。新規作成・削除はしません。`;
 a.addAction('今回の候補を更新');a.addCancelAction('変更しない');
 if(await a.present()!==0)return;
 // Small bounded batch; confirm by reading existing saved event, never silently create.
 if(proposals.length>5)throw Error('一度に更新できるのは5件までです。');
 let updated=0;const failures=[];
 for(const x of proposals){
  try{
   // Recheck immediately before editing; refuse if event changed since preview.
   const source=await CalendarEvent.between(new Date(+new Date(x.event.startDate)-60000),new Date(+new Date(x.event.endDate)+60000),[x.event.calendar]);
   const current=source.find(y=>y.identifier===x.event.identifier);
   if(!current||linkedPageId(current.notes)!==x.id||+new Date(current.startDate)!==+new Date(x.event.startDate)||+new Date(current.endDate)!==+new Date(x.event.endDate))throw Error('予定が変更済みのため更新を停止');
   current.startDate=x.plan.startDate;current.endDate=x.plan.endDate;
   await current.save();
   const reread=await CalendarEvent.between(new Date(+x.plan.startDate-60000),new Date(+x.plan.endDate+60000),[x.event.calendar]);
   const verified=reread.some(y=>y.identifier===x.event.identifier&&Math.abs(+new Date(y.startDate)-(+x.plan.startDate))<60000&&linkedPageId(y.notes)===x.id);
   if(!verified)throw Error('更新後の読戻し未確認');
   updated++;
  }catch(e){
   failures.push(String(e.message||e));
   // Do not blindly roll back an uncertain remote write; user can inspect calendar.
   if(failures.length>=2)break;
  }
 }
 const b=new Alert();b.title=failures.length?'YOS｜確認が必要':'YOS｜日時更新';b.message=`更新確認${updated}件／失敗・未確認${failures.length}件`+(failures.length?'\n'+failures.join('\n').slice(0,300):'');b.addAction('閉じる');await b.present();
}

// Inbox processing is opt-in. The established Apple mirror remains the default.
function rich(s){const a=Array.from(String(s||'')),parts=[];for(let i=0;i<a.length;i+=1800)parts.push({type:'text',text:{content:a.slice(i,i+1800).join('')}});return parts;}
function plain(x){return (x||[]).map(v=>v.plain_text||v.text?.content||'').join('');}
function blockText(b){return plain(b?.[b.type]?.rich_text);}
function localDay(iso){const d=new Date(iso);if(!Number.isFinite(+d))return null;return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function captureFromBlocks(blocks){
 const out=[];const seen=new Set();
 for(let i=0;i<blocks.length;i++){
  const b=blocks[i],line=blockText(b);
  // The active Voice/Text route uses a metadata paragraph followed by a raw paragraph.
  // Notifications are third-party text, never user commands.
  const m=line.match(/^(\d{4}-\d\d-\d\dT\S+)\s*·\s*([^·\n]+)\s*·\s*(clarity:[a-z\d_-]+)/i);
  if(!m||/Notification|Email/i.test(m[2])||seen.has(m[3]))continue;
  let raw=line.slice(m[0].length).trim();
  if(!raw){const next=blocks[i+1];if(next?.type!=='paragraph')continue;raw=blockText(next).trim();}
  if(!raw||raw==='---'||raw.length>12000)continue;
  seen.add(m[3]);out.push({id:m[3],raw,at:m[1],source:m[2].trim(),blockId:b.id});
 }
 return out;
}
function classifyCapture(c){
 const s=c.raw.trim().normalize('NFKC');
 if(!localDay(c.at)||s.length>1800||/[?？]/.test(s)||/^(もし|仮に|相談|質問|調べて|比較して)/.test(s))return {status:'hold',reason:'相談・曖昧'};
 // Shared web text, OCR and forwarded material cannot authorize a write by themselves.
 if(/Share/i.test(c.source))return {status:'hold',reason:'共有内容は指示とみなさない'};
 if(/(?:残高|支払|入金|出金|返済|円|PayPay|銀行)/i.test(s))return {status:'hold',reason:'Money照合待ち'};
 if(/^(?:生活記録|Life Log|通知)に/.test(s))return {status:'hold',reason:'接続先の確認待ち'};
 let m=s.match(/^(?:タスク|やること)(?:に)?[：:]\s*(.+)$/) || s.match(/^(.+?)を(?:タスク|やること)に(?:登録|追加|入れて)(?:して)?[。！!]?$/);
 if(m){const name=m[1].trim();if(!name||/(?:明日|来週|今日|\d{1,2}時|\d{1,2}日)/.test(name))return {status:'hold',reason:'期限の解釈待ち'};return {status:'write',target:'task',title:name};}
 m=s.match(/^(.+?)を(?:欲しいもの|買い物リスト)に(?:登録|追加|入れて)(?:して)?[。！!]?$/);
 if(m&&m[1].trim())return {status:'write',target:'shopping',title:m[1].trim()};
 m=s.match(/^(?:日記に|日記[：:])\s*(.+?)(?:を(?:記録|保存)して)?[。！!]?$/);
 if(m&&m[1].trim())return {status:'write',target:'diary',title:localDay(c.at)+'｜Clarity',body:m[1].trim()};
 return {status:'hold',reason:'登録意図が未確認'};
}
async function allInboxBlocks(){
 const blocks=[];let cursor=null;
 for(let page=0;page<50;page++){
  const q='?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):'');
  const r=await api('/blocks/'+INBOX+'/children'+q);
  blocks.push(...(r.results||[]));
  if(!r.has_more)return blocks;
  if(!r.next_cursor||r.next_cursor===cursor)throw Error('Inbox取得位置を確認できません');
  cursor=r.next_cursor;
 }
 throw Error('Inboxが取得上限を超えました。原文は保持されています');
}
async function matches(ds,filter){const r=await api('/data_sources/'+ds+'/query','POST',{filter,page_size:2});if(r.has_more||r.results?.length>1)throw Error('既存データが複数一致。登録を保留');return r.results||[];}
async function saveCapture(c,p){
 const ds={task:DB,shopping:SHOPPING,diary:DIARY}[p.target];
 const key='inbox:'+c.id;
 const keyField={task:'同期キー',shopping:'メモ',diary:'記録キー'}[p.target];
 const contains=p.target==='shopping';
 const byKey=await matches(ds,{property:keyField,rich_text:contains?{contains:key}:{equals:key}});
 if(byKey.length){const page=await api('/pages/'+byKey[0].id);if(plain(page.properties?.[keyField]?.rich_text).includes(key))return 'duplicate';throw Error('同期キーの読戻し不一致');}
 const titleField={task:'やること',shopping:'商品名',diary:'日記'}[p.target];
 const sameTitle=await matches(ds,{property:titleField,title:{equals:p.title}});
 if(sameTitle.length)throw Error('同名の既存項目あり。原文を保持して保留');
 if(p.target==='diary'){
  const sameDay=await matches(ds,{property:'日付',date:{equals:localDay(c.at)}});
  if(sameDay.length)throw Error('その日の日記が既にあります。上書きせず保留');
 }
 const t={title:rich(p.title)},x={rich_text:rich(c.raw)},ref={rich_text:rich(key)};
 let props;
 if(p.target==='task')props={'やること':t,'同期キー':ref,'正本・根拠':{rich_text:rich('YOS Inbox '+c.id)},'種類':{select:{name:'Task'}},'状態':{select:{name:'次にやる'}}};
 if(p.target==='shopping')props={'商品名':t,'メモ':{rich_text:rich(c.raw+'\n'+key)},'区分':{select:{name:'欲しいもの'}},'買い物状態':{select:{name:'検討中'}}};
 if(p.target==='diary')props={'日記':t,'本文':{rich_text:rich(p.body)},'日付':{date:{start:localDay(c.at)}},'記録元':{select:{name:'Clarity'}},'記録キー':ref};
 const created=await api('/pages','POST',{parent:{type:'data_source_id',data_source_id:ds},properties:props});
 if(!created.id)throw Error('Notionが作成IDを返しませんでした');
 const page=await api('/pages/'+created.id);
 if(!plain(page.properties?.[keyField]?.rich_text).includes(key))throw Error('作成後の読戻し不一致。再実行前に照合');
 return 'created';
}
async function inboxSync(){
 if(!Keychain.contains(K))throw Error('既存Notion認証情報がありません');
 const captures=captureFromBlocks(await allInboxBlocks());
 const state=readState(),receipts=state.inboxReceipts||{};
 let created=0,duplicates=0,held=0;const errors=[];
 for(const c of captures){
  if(receipts[c.id])continue;
  const p=classifyCapture(c);
  if(p.status!=='write'){held++;continue;}
  try{
   const result=await saveCapture(c,p);if(result==='created')created++;else duplicates++;
   receipts[c.id]={target:p.target,blockId:c.blockId,at:new Date().toISOString()};
   const keys=Object.keys(receipts);if(keys.length>3000)for(const k of keys.slice(0,keys.length-3000))delete receipts[k];
   state.inboxReceipts=receipts;saveState(state);
  }
  catch(e){errors.push(c.id+': '+String(e.message||e));break;}
  if(created>=10)break;
 }
 const a=new Alert();a.title=errors.length?'Inbox仕分け：保留あり':'Inbox仕分け完了';
 a.message=`登録 ${created}件／既存 ${duplicates}件／保留 ${held}件`+(errors.length?'\n'+errors[0].slice(0,250):'');a.addAction('閉じる');await a.present();
}
const MODE=String(typeof args==='object'&&args.queryParameters?.mode||'');
try{if(MODE==='linked')await linkedCalendarSync();else if(MODE==='inbox')await inboxSync();else await sync()}
catch(e){const a=new Alert();a.title='同期できませんでした';a.message=String(e.message||e);a.addAction('OK');await a.present()}
Script.complete();
