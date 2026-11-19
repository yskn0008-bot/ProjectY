// Variables used by Scriptable.
// icon-color: blue; icon-glyph: clipboard-list;
// YOS_SCRIPT_NAME: YOS Scriptable 棚卸し
// Read-only inventory v1.0. No writes, network, deletes, or code export.
const LIMIT=350;
const report=[];
const found=[];
const failures=[];
const stores=[];
try { stores.push({label:'iCloud',fm:FileManager.iCloud()}); } catch(e){failures.push('iCloudに接続できません: '+String(e));}
try { stores.push({label:'このiPhone内',fm:FileManager.local()}); } catch(e){failures.push('本体に接続できません: '+String(e));}
function isFile(fm,p){try{return fm.isFile(p)}catch(_){return false}}
function isDir(fm,p){try{return fm.isDirectory(p)}catch(_){return false}}
function time(d){try{return d?new Date(d).toLocaleString('ja-JP'):'不明'}catch(_){return '不明'}}
function summarize(code){
 const first=code.split(/\r?\n/).slice(0,18);
 const versionLine=first.find(x=>/^\s*\/\/\s*(?:YOS_SCRIPT_NAME:|[^\n]*\bv\d+(?:\.\d+)+\b)/.test(x))||'';
 const version=versionLine.match(/\bv\d+(?:\.\d+)+\b/)?.[0]||'';
 const deps=[...code.matchAll(/(?:runExisting|importModule|Script\.name|URLScheme\.forRunningScript)\s*\(\s*['"]([^'"\n]{1,100})['"]/g)].map(x=>x[1]);
 const declared=[...new Set(deps)].slice(0,15);
 return {version,deps:declared};
}
async function walk(fm,label,dir,depth){
 if(depth>2||found.length>=LIMIT)return;
 let names=[];
 try{names=fm.listContents(dir)}catch(e){failures.push(label+'：一覧不可 '+String(e).slice(0,80));return}
 for(const name of names){
  if(found.length>=LIMIT)break;
  if(name==='YOS Common Installer Data'||name.startsWith('.'))continue;
  const path=fm.joinPath(dir,name);
  if(isDir(fm,path)){
   if(depth<2 && !['Library','Documents','Inbox','backups','node_modules'].includes(name))await walk(fm,label,path,depth+1);
   continue;
  }
  if(!isFile(fm,path)||!name.toLowerCase().endsWith('.js'))continue;
  const item={store:label,name:name.slice(0,-3),relative:depth?path.slice(dir.length+1):name,bytes:null,modified:'不明',version:'',deps:[],readable:false,code:null};
  try{const d=fm.modificationDate(path);item.modified=time(d)}catch(_){}
  try{
   if(fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(path) && fm.downloadFileFromiCloud)await fm.downloadFileFromiCloud(path);
   const code=fm.readString(path);
   item.code=code;item.bytes=code.length;item.readable=true;
   const s=summarize(code);item.version=s.version;item.deps=s.deps;
  }catch(e){failures.push(label+' / '+name+'：読取不可 '+String(e).slice(0,70))}
  found.push(item);
 }
}
for(const s of stores){try{await walk(s.fm,s.label,s.fm.documentsDirectory(),0)}catch(e){failures.push(s.label+'：'+String(e).slice(0,100))}}
const byName=new Map();
for(const f of found){if(!byName.has(f.name))byName.set(f.name,[]);byName.get(f.name).push(f)}
const duplicates=[...byName.entries()].filter(([k,v])=>v.length>1);
const knownRefs=new Set();for(const f of found)for(const dep of f.deps)knownRefs.add(dep);
report.push('YOS Scriptable 読み取り専用 棚卸し v1.0');
report.push('調査日時：'+time(new Date()));
report.push('件数：'+found.length+' ／ 同名グループ：'+duplicates.length+' ／ 読取失敗：'+failures.length);
report.push('※内容の全文・パスワード・認証情報は含みません。');
report.push('※未参照でもショートカット・ウィジェット・URLから利用される場合があります。削除可否は未確定です。');
report.push('');
report.push('【同名スクリプト】');
if(!duplicates.length)report.push('検出なし');
for(const [name,arr] of duplicates){
 const same=arr.every(x=>x.readable&&arr[0].readable&&x.code===arr[0].code);
 report.push('・'+name+'：'+arr.map(x=>x.store).join(' / ')+'｜内容 '+(same?'完全一致':'相違または未読取'));
}
report.push('');report.push('【全スクリプト】');
for(const f of found.sort((a,b)=>a.name.localeCompare(b.name,'ja')||a.store.localeCompare(b.store))){
 const flags=[];
 if(byName.get(f.name).length>1)flags.push('同名');
 if(knownRefs.has(f.name))flags.push('他コードから名前参照');
 if(!f.readable)flags.push('読取不可');
 report.push('■ '+f.name+'｜'+f.store+'｜'+(f.bytes??'?')+'文字｜更新 '+f.modified+(flags.length?'｜'+flags.join('、'):''));
 if(f.version)report.push('  先頭情報：'+f.version);
 if(f.deps.length)report.push('  コード内の呼出候補：'+f.deps.join('、'));
}
if(failures.length){report.push('');report.push('【読取エラー】');for(const e of failures)report.push('・'+e)}
report.push('');report.push('【重要】この報告だけで削除しないでください。実際のショートカット・ウィジェットからの使用は別途確認が必要です。');
const output=report.join('\n');
Pasteboard.copyString(output);
const alert=new Alert();alert.title='棚卸し完了（変更なし）';
alert.message='Scriptable '+found.length+'件を確認。\n同名：'+duplicates.length+'組\n読取失敗：'+failures.length+'件\n\n結果をコピーしました。ChatGPTに貼り付けてください。\nスクリプトは一切変更していません。';
alert.addAction('閉じる');await alert.present();
