// YOS Scriptable Cleanup Assistant v1.0
// Classifies Scriptable scripts into: keep / safe-to-archive / review-needed.
// Never deletes. Safe candidates are archived as .js.bak only after explicit confirmation.

const KEEP_EXACT = new Set([
  'リモコン.js','リモコン更新.js','テレビリモコン.js','エアコンリモコン.js','エアコンウィジェット.js',
  '照明リモコン.js','照明ウィジェット.js','リモコン整理.js','スクリプト整理.js',
  'MY WAY Widgets.js','MY WAY Widget.js','MY_WAY_5_WIDGETS_v1.js','YOS Battery Widget.js'
]);

const SAFE_LEGACY = new Set([
  'YOS Remote Hub.js','YOS Remote Update Installer.js','YOS Remote Script Organizer.js',
  'YOS BRAVIA Remote.js','YOS AC Remote.js','YOS AC Widget.js','YOS Light Remote.js','YOS Light Widget.js','YOS Tapo H110 Core.js',
  '整理.js','整理スクリプト.js'
]);

const REMOTE_MARKERS = [
  'YOS Remote Hub','YOS Remote Update Installer','YOS Remote Script Organizer','YOS BRAVIA Remote',
  'YOS AC Remote','YOS AC Widget','YOS Light Remote','YOS Light Widget','YOS Tapo H110 Core',
  'MY REMOTE スクリプト整理完了','リモコン整理完了'
];

const ARCHIVE_ROOT = 'スクリプト整理';
const REPORT_NAME = '分類レポート.txt';

function stamp(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
function lower(v){ return String(v||'').trim().toLowerCase(); }
function normalizeText(v){ return String(v||'').replace(/\r\n/g,'\n').trim(); }
function stem(name){ return String(name).replace(/\.js$/i,'').trim(); }
function isJs(name){ return /\.js$/i.test(String(name)); }
function isUntitled(name){ return /^untitled script(?: \d+)?\.js$/i.test(String(name)); }
function variantOf(base,name){
  const b=lower(stem(base)), n=lower(stem(name));
  if(n===b) return false;
  if(!n.startsWith(b)) return false;
  const suffix=n.slice(b.length).replace(/^[\s._-]+/,'');
  return /^(?:\(\d+\)|\d+|copy(?:\s*\d+)?|old(?:\s*\d+)?|backup(?:\s*\d+)?|bak(?:\s*\d+)?|legacy(?:\s*\d+)?|v\d+(?:[._-]\d+)*)$/i.test(suffix);
}
function knownVariant(name){
  for(const base of [...KEEP_EXACT,...SAFE_LEGACY]) if(variantOf(base,name)) return true;
  return false;
}
function parent(path){ const i=String(path).lastIndexOf('/'); return i<=0?'/':String(path).slice(0,i); }
function ensureDir(fm,path){ if(!fm.fileExists(path)) fm.createDirectory(path,true); }
async function ensureLocal(fm,path){
  if(!fm || !fm.fileExists(path)) return;
  try{ if(typeof fm.isFileStoredIniCloud==='function' && fm.isFileStoredIniCloud(path)) await fm.downloadFileFromiCloud(path); }catch(_){}
}
function listRootJs(fm){
  try{return fm.listContents(fm.documentsDirectory()).filter(isJs);}catch(_){return[];}
}
async function readScript(fm,name){
  const path=fm.joinPath(fm.documentsDirectory(),name);
  try{await ensureLocal(fm,path);return fm.readString(path);}catch(_){return'';}
}
function canonicalKeepNames(names){ return new Set(names.filter(n=>KEEP_EXACT.has(n))); }

async function scanStore(fm,kind){
  if(!fm) return {kind,items:[],contents:new Map()};
  const names=listRootJs(fm);
  const contents=new Map();
  for(const name of names) contents.set(name,normalizeText(await readScript(fm,name)));
  return {kind,items:names,contents};
}

function buildContentOwners(stores){
  const owners=new Map();
  for(const store of stores){
    for(const name of store.items){
      if(!KEEP_EXACT.has(name)) continue;
      const text=store.contents.get(name)||'';
      if(text) owners.set(text,{kind:store.kind,name});
    }
  }
  return owners;
}

function classifyOne(store,name,owners){
  const text=store.contents.get(name)||'';
  if(KEEP_EXACT.has(name)) return {bucket:'keep',reason:'現行として残す'};
  if(SAFE_LEGACY.has(name)) return {bucket:'safe',reason:'既知の旧版'};
  if(knownVariant(name)) return {bucket:'safe',reason:'既知スクリプトの重複・旧版名'};
  const owner=text?owners.get(text):null;
  if(owner && owner.name!==name) return {bucket:'safe',reason:`現行 ${owner.name} と内容が完全一致`};
  if(isUntitled(name)){
    if(REMOTE_MARKERS.some(marker=>text.includes(marker))) return {bucket:'safe',reason:'Untitledだが旧MY REMOTE内容と確定'};
    return {bucket:'review',reason:'Untitledのため中身確認が必要'};
  }
  if(REMOTE_MARKERS.some(marker=>text.includes(marker))) return {bucket:'safe',reason:'旧MY REMOTE内容と確定'};
  return {bucket:'review',reason:'用途を自動確定できない'};
}

function classify(stores){
  const owners=buildContentOwners(stores);
  const out={keep:[],safe:[],review:[]};
  for(const store of stores){
    for(const name of store.items){
      const c=classifyOne(store,name,owners);
      out[c.bucket].push({kind:store.kind,name,reason:c.reason});
    }
  }
  return out;
}

function reportText(result){
  const section=(title,items)=>[title, ...items.map(x=>`- [${x.kind}] ${x.name} — ${x.reason}`), ''].join('\n');
  return [
    `Scriptable 自動分類 ${new Date().toLocaleString('ja-JP')}`,'',
    `残す: ${result.keep.length}件 / 安全に保管可能: ${result.safe.length}件 / 要確認: ${result.review.length}件`,'',
    section('【残す】',result.keep),section('【安全に保管可能】',result.safe),section('【要確認】',result.review),
    '※ 物理削除はしません。安全候補は実行時の確認後に .js.bak として保管します。'
  ].join('\n');
}

function uniquePath(fm,dir,name){
  const base=String(name).replace(/\.js$/i,'');
  let path=fm.joinPath(dir,base+'.js.bak'),i=2;
  while(fm.fileExists(path)) path=fm.joinPath(dir,`${base} ${i++}.js.bak`);
  return path;
}
async function archiveSafe(store,items,runStamp){
  if(!store.fm || !items.length) return 0;
  const docs=store.fm.documentsDirectory();
  const dir=store.fm.joinPath(docs,`${ARCHIVE_ROOT}/保管 ${runStamp}`);
  ensureDir(store.fm,dir);
  let moved=0;
  for(const item of items){
    const src=store.fm.joinPath(docs,item.name);
    if(!store.fm.fileExists(src)) continue;
    await ensureLocal(store.fm,src);
    const dst=uniquePath(store.fm,dir,item.name);
    store.fm.move(src,dst);
    if(store.fm.fileExists(src)||!store.fm.fileExists(dst)) throw new Error(`${item.name} の保管確認に失敗しました`);
    moved++;
  }
  return moved;
}
function saveReport(fm,text){
  const docs=fm.documentsDirectory();
  const dir=fm.joinPath(docs,ARCHIVE_ROOT);
  ensureDir(fm,dir);
  fm.writeString(fm.joinPath(dir,REPORT_NAME),text);
}

async function main(){
  const iCloud=FileManager.iCloud();
  const local=typeof FileManager.local==='function'?FileManager.local():null;
  const scanned=[await scanStore(iCloud,'iCloud'),await scanStore(local,'ローカル')].filter(Boolean);
  const stores=scanned.map(s=>({...s,fm:s.kind==='iCloud'?iCloud:local}));
  const result=classify(stores);
  const text=reportText(result);
  saveReport(iCloud,text);

  const a=new Alert();
  a.title='スクリプト整理';
  const safePreview=result.safe.slice(0,8).map(x=>'• '+x.name).join('\n');
  const reviewPreview=result.review.slice(0,8).map(x=>'• '+x.name).join('\n');
  a.message=`残す ${result.keep.length}件\n安全に保管可能 ${result.safe.length}件\n要確認 ${result.review.length}件`+
    (safePreview?`\n\n【安全候補】\n${safePreview}${result.safe.length>8?'\n…':''}`:'')+
    (reviewPreview?`\n\n【要確認】\n${reviewPreview}${result.review.length>8?'\n…':''}`:'')+
    `\n\n詳細はiCloud Drive/Scriptable/${ARCHIVE_ROOT}/${REPORT_NAME} に保存しました。`;
  a.addAction('安全候補を保管');
  a.addCancelAction('見るだけ');
  const choice=await a.presentAlert();
  if(choice!==0) return;

  const runStamp=stamp();
  let moved=0;
  for(const store of stores){
    moved+=await archiveSafe(store,result.safe.filter(x=>x.kind===store.kind),runStamp);
  }
  const done=new Alert();
  done.title='スクリプト整理完了';
  done.message=`${moved}件を削除せず .js.bak として保管しました。\n要確認 ${result.review.length}件には触れていません。`;
  done.addAction('OK');
  await done.presentAlert();
}

try{ await main(); }
catch(error){
  const a=new Alert();a.title='スクリプト整理失敗';a.message=error&&error.message?error.message:String(error);a.addAction('OK');await a.presentAlert();
}
Script.complete();
