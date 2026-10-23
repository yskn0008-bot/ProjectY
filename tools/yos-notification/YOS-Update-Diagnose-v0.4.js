// YOS Notification v0.4 | one-time update + Notion read-only diagnostic
// Changes only existing Notification Context. Never modifies a Shortcut, Bridge or Money.
const BASE='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/feat/yos-notification-v03-20261022/tools/yos-notification/';
const NAME=['Notification Context.js','YOS Notification Context.js'];
const PREV='28db70dd', NEXT='acb86b40';
const TK='YOS_NOTION_INTEGRATION_TOKEN';
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')}
async function output(s){const a=new Alert();a.title='YOS通知｜更新・接続診断';a.message=s;a.addAction('OK');await a.present()}
const places=[FileManager.local()];try{places.push(FileManager.iCloud())}catch(_){}
try{
 let hits=[];
 for(const fm of places)for(const n of NAME){const path=fm.joinPath(fm.documentsDirectory(),n);if(fm.fileExists(path))hits.push({fm,path})}
 if(hits.length!==1)throw Error('Context保存先が'+hits.length+'件。安全のため未更新');
 const item=hits[0];if(item.fm.isFileStoredIniCloud?.(item.path))await item.fm.downloadFileFromiCloud(item.path);
 const original=item.fm.readString(item.path);
 if(!original.includes('YOS Notification Context'))throw Error('既存Contextの識別に失敗。未更新');
 const current=hash(original);
 if(current!==PREV&&current!==NEXT)throw Error('既存Contextが別の版です。未更新（識別値'+current+'）');
 let updated=false;
 if(current===PREV){
   const req=new Request(BASE+'Notification-Context-v0.4.js');req.timeoutInterval=15;
   const newCode=await req.loadString();
   if(req.response?.statusCode!==200||hash(newCode)!==NEXT||!newCode.includes('YOS Notification Context v0.4'))throw Error('配布コードの検証失敗。未更新');
   const backup=item.path+'.YOS-v03-'+Date.now()+'.backup';
   item.fm.writeString(backup,original);
   if(item.fm.readString(backup)!==original)throw Error('バックアップ失敗。未更新');
   try{item.fm.writeString(item.path,newCode);if(item.fm.readString(item.path)!==newCode)throw Error('書込み後の照合失敗');updated=true}
   catch(e){try{item.fm.writeString(item.path,original)}catch(_){}throw Error('更新失敗・復旧試行済：'+String(e.message||e))}
 }
 // Probe Notion credentials without reading or displaying account data.
 const base='https://api.notion.com/v1/';
 async function probe(path,body,validate){
   if(!Keychain.contains(TK))return '認証なし';
   try{
     const r=new Request(base+path);r.method=body?'POST':'GET';r.timeoutInterval=8;
     r.headers={'Authorization':'Bearer '+Keychain.get(TK),'Notion-Version':'2025-09-03','Content-Type':'application/json'};
     if(body)r.body=JSON.stringify(body);
     const data=await r.loadJSON(),code=r.response?.statusCode;
     if(code!==200)return 'HTTP '+(code||'不明');
     return validate(data)?'取得OK':'内容未確認';
   }catch(e){return '通信失敗'}
 }
 const [rules,tasks,money,balance]=await Promise.all([
   probe('blocks/3fc5ca88289581a9955cf33b6aeea87d/children?page_size=100',null,x=>(x.results??[]).some(b=>JSON.stringify(b).includes('YOSの最上位判断方針'))),
   probe('data_sources/965c608632c1463d93b487a9cb69b3ad/query',{page_size:1},x=>Array.isArray(x.results)),
   probe('data_sources/95b30d16753040c6a320dab99acad55d/query',{page_size:1},x=>Array.isArray(x.results)),
   probe('data_sources/94fc7e9ffd204073bbcf02efe8e95c5c/query',{page_size:1},x=>Array.isArray(x.results))
 ]);
 await output((updated?'Context v0.4 更新成功':'Context v0.4 更新済み')+'\n運用ルール：'+rules+'\nYOS Tasks：'+tasks+'\n家計予定：'+money+'\n残高DB：'+balance+'\n\n機密の本文・金額・認証情報は表示しません。\n重要アラートの実通知は別途未確認。');
}catch(e){await output('更新未完了：'+String(e.message||e).slice(0,180)+'\n既存の通知設定は維持してください。')}
Script.complete();