// YOS Scriptable Cleanup Assistant v1.1
// Classifies Scriptable scripts into: keep / safe-to-archive / review-needed.
// Never deletes. User already approved safe cleanup in chat, so safe candidates are archived automatically as .js.bak.

const KEEP_EXACT = new Set([
  'リモコン.js','リモコン更新.js','テレビリモコン.js','エアコンリモコン.js','エアコンウィジェット.js',
  '照明リモコン.js','照明ウィジェット.js','リモコン整理.js','スクリプト整理.js',
  'MY_WAY_5_WIDGETS_v1.js','YOS Battery Widget.js'
]);

const REVIEW_OLD_MYWAY = new Set([
  'MY WAY Widgets.js','MY WAY Widget.js'
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
function isDefaultUntitled(text){
  const t=normalizeText(text);
  if(!t) return true;
  return /^\/\/ Variables used by Scriptable\.?\s*$/i.test(t) || /^\/\/ Scriptable\s*$/i.test(t);
}
function variantOf(base,name){
  const b=lower(stem(base)), n=lower(stem(name));
  if(n===b) return false;
  if(!n.startsWith(b)) return false;
  const suffix=n.slice(b.length).replace(/^[\s._-]+/,'');
  return /^(?:\(\d+\)|\d+|copy(?:\s*\d+)?|old(?:\s*\d+)?|backup(?:\s*\d+)?|bak(?:\s*\d+)?|legacy(?:\s*\d+)?|v\d+(?:[._-]\d+)*)$/i.test(suffix);
}
function knownVariant(name){
  for(const base of [...KEEP_EXACT,...REVIEW_OLD_MYWAY,...SAFE_LEGACY]) if(variantOf(base,name)) return true;
  return false;
}
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
async function scanStore(fm,kind){
  if(!fm) return {kind,items:[],contents:new Map()};
  const names=listRootJs(fm);
  const contents=new Map();
  for(const name of names) contents.set(name,normalizeText(await readScript(fm,name)));
  return {kind,items:names,contents};
}

function preferenceScore(name){
  if(KEEP_EXACT.has(name)) return 1000;
  if(REVIEW_OLD_MYWAY.has(name)) return 600;
  if(!isUntitled(name)) return 400 - Math.min(String(name).length,200);
  return 0;
}
function buildContentOwners(stores){
  const groups=new Map();
  for(const store of stores){
    for(const name of store.items){
      const text=store.contents.get(name)||'';
      if(!text) continue;
      if(!groups.has(text)) groups.set(text,[]);
      groups.get(text).push({kind:store.kind,name});
    }
  }
  const owners=new Map();
  for(const [text,items] of groups){
    const ranked=[...items].sort((a,b)=>preferenceScore(b.name)-preferenceScore(a.name)||a.name.localeCompare(b.name,'ja'));
    owners.set(text,{owner:ranked[0],count:items.length});
  }
  return owners;
}

function classifyOne(store,name,owners){
  const text=store.contents.get(name)||'';
  if(KEEP_EXACT.has(name)) return {bucket:'keep',reason:'現行として残す'};
  if(REVIEW_OLD_MYWAY.has(name)) return {bucket:'review',reason:'旧MY WAY候補。ホーム画面参照の可能性があるため確認必要'};
  if(SAFE_LEGACY.has(name)) return {bucket:'safe',reason:'既知の旧版'};
  if(knownVariant(name)) return {bucket:'safe',reason:'既知スクリプトの重複・旧版名'};

  const group=text?owners.get(text):null;
  if(group && group.count>1 && (group.owner.name!==name || group.owner.kind!==store.kind)){
    return {bucket:'safe',reason:`${group.owner.name} と内容が完全一致する重複`};
  }

  if(isUntitled(name)){
    if(isDefaultUntitled(text)) return {bucket:'safe',reason:'空またはScriptable初期テンプレート'};
    if(REMOTE_MARKERS.some(marker=>text.includes(marker))) return {bucket:'safe',reason:'Untitledだが旧MY REMOTE内容と確定'};
    if(text.includes('MY WAY by YOS — NOW Widget v1') || text.includes('MY_WAY_NOW_WIDGET')){
      return {bucket:'review',reason:'旧MY WAY NOW候補。ホーム画面参照の可能性があるため確認必要'};
    }
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

function reportText(result,moved=0){
  const section=(title,items)=>[title, ...items.map(x=>`- [${x.kind}] ${x.name} — ${x.reason}`), ''].join('\n');
  return [
    `Scriptable 自動分類 ${new Date().toLocaleString('ja-JP')}`,'',
    `残す: ${result.keep.length}件 / 安全に保管可能: ${result.safe.length}件 / 要確認: ${result.review.length}件 / 今回保管: ${moved}件`,'',
    section('【残す】',result.keep),section('【安全に保管可能】',result.safe),section('【要確認】',result.review),
    '※ 物理削除はしていません。安全候補だけ .js.bak として退避しています。'
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

  const runStamp=stamp();
  let moved=0;
  for(const store of stores){
    moved+=await archiveSafe(store,result.safe.filter(x=>x.kind===store.kind),runStamp);
  }
  saveReport(iCloud,reportText(result,moved));

  const done=new Alert();
  done.title='スクリプト整理完了';
  done.message=`${moved}件を一覧から外して .js.bak で保管しました。\n残す ${result.keep.length}件\n要確認 ${result.review.length}件\n\n要確認には触れていません。`;
  done.addAction('OK');
  await done.presentAlert();
}

try{ await main(); }
catch(error){
  const a=new Alert();a.title='スクリプト整理失敗';a.message=error&&error.message?error.message:String(error);a.addAction('OK');await a.presentAlert();
}
Script.complete();
