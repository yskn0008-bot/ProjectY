// YOS Inbox classifier for Scriptable. No new Shortcut or Notion database.
const K='YOS_NOTION_INTEGRATION_TOKEN';
const DB='965c6086-32c1-463d-93b4-87a9cb69b3ad';
const SHOPPING='d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc';
const DIARY='fe0e0973-d1cc-4bde-b138-1cb1da64ac68';
const INBOX='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const TEST_CAPTURE_ID='clarity:yos-test-20261101-0649';
const API='https://api.notion.com/v1',VERSION='2025-09-03';
const fm=FileManager.local();
const stateFile=fm.joinPath(fm.documentsDirectory(),'yos-inbox-classifier-state.json');
function readState(){try{return JSON.parse(fm.readString(stateFile))}catch{return {}}}
function saveState(x){fm.writeString(stateFile,JSON.stringify(x))}
async function api(path,method='GET',body){
 const req=new Request(API+path);req.method=method;req.headers={'Authorization':'Bearer '+Keychain.get(K),'Notion-Version':VERSION,'Content-Type':'application/json'};
 if(body!==undefined)req.body=JSON.stringify(body);
 const response=await req.loadJSON();if(req.response.statusCode>=300)throw Error('Notion '+req.response.statusCode+': '+JSON.stringify(response).slice(0,250));return response;
}
// Read saved Inbox blocks. Clarity capture actions are not modified.
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
  if(!raw){
   // Notion may retain an empty paragraph between the metadata and the raw text.
   // Never cross another capture header or a nonempty separator while looking ahead.
   for(let j=i+1;j<Math.min(blocks.length,i+5);j++){
    const next=blocks[j];
    if(next.type==='divider')break;
    if(next.type!=='paragraph')break;
    const candidate=blockText(next).trim();
    if(!candidate)continue;
    if(candidate==='---'||/^\d{4}-\d\d-\d\dT\S+\s*·/.test(candidate))break;
    raw=candidate;break;
   }
  }
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
 const t={title:rich(p.title)},ref={rich_text:rich(key)};
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
 const mode=String(args.queryParameters?.mode||'test');
 if(!['test','run'].includes(mode))throw Error('不明な実行モード');
 const selected=mode==='test'?captures.filter(c=>c.id===TEST_CAPTURE_ID):captures;
 if(mode==='test'&&selected.length!==1)throw Error('安全なテスト入力をInboxで確認できません');
 const state=readState(),receipts=state.inboxReceipts||{};
 let created=0,duplicates=0,held=0;const errors=[];
 for(const c of selected){
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
  if(created>=(mode==='test'?1:10))break;
 }
 const a=new Alert();a.title=errors.length?'Inbox仕分け：保留あり':'Inbox仕分け完了';
 a.message=`登録 ${created}件／既存 ${duplicates}件／保留 ${held}件`+(errors.length?'\n'+errors[0].slice(0,250):'');a.addAction('閉じる');await a.present();
}
try{await inboxSync()}
catch(e){const a=new Alert();a.title='Inboxを仕分けできませんでした';a.message=String(e.message||e);a.addAction('閉じる');await a.present()}
Script.complete();
