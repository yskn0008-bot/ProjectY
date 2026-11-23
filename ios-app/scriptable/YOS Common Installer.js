// Variables used by Scriptable.
// icon-color: gray; icon-glyph: arrow-down-circle;
// YOS_SCRIPT_NAME: YOS Common Installer
// YOS Common Installer v1.0 (draft; read-only catalog, guarded local installation).
// Initial registration is manual. Subsequent catalog and code reads use GitHub.
const OWNER='yskn0008-bot/ProjectY';
const ROOT='https://raw.githubusercontent.com/'+OWNER+'/';
const CATALOG=ROOT+'main/ios-app/scriptable/yos-common-installer-catalog.json';
const DATA_DIR='YOS Common Installer Data';
const SELF='YOS Common Installer';

// Remote Hub is deployed as the EXISTING Japanese on-device リモコン, not a new remote.
// Preserve all other scripts, existing layout keys and stored credentials.
const REMOTE_ID='remote-hub',REMOTE_NAME='リモコン',REMOTE_PATH='ios-app/scriptable/remote-widgets/YOS Remote Hub.js';
const REMOTE_PRIOR_HASHES=new Set([
 '49ca95b6ce3e0ad07397cfc561d4027d0b04764cf5362e959070956c5186a071',
 'd2784d53f571ed18c06b92f5c3b29a401ca0cd1980f37e485ff0042eee45304c',
 '43a354e348277dc5b65491b7131d0da1166c25c85b22f0380c70d33ed11f7324',
 '06366b88e0c2781dc7703952003074af538a7e3edbc504f9f7a15e715eb0ca66',
 '76088d615ab1add60ae0d41b591f55e631efa94ee79d8b320abee963e8abb90b'
]);
const REMOTE_NAME_MAP=[
 ['YOS Remote Hub','リモコン'],['YOS BRAVIA Remote','テレビリモコン'],
 ['YOS BRAVIA Widget','テレビウィジェット'],['YOS AC Remote','エアコンリモコン'],
 ['YOS AC Widget','エアコンウィジェット'],['YOS Light Remote','照明リモコン'],
 ['YOS Light Widget','照明ウィジェット'],['YOS Tapo H110 Core','リモコン/内部/Tapo共通']
];
function isRemoteEntry(e){return !!e&&e.id===REMOTE_ID&&e.name===REMOTE_NAME&&e.path===REMOTE_PATH}
function localizedCode(entry,raw){
 if(!isRemoteEntry(entry))return raw;
 if(!/^\/\/ YOS Remote Hub v6\.5\b/.test(raw))throw Error('BRAVIA元コードの形式が不明なため更新しません');
 let output=raw;
 for(const [from,to] of REMOTE_NAME_MAP)output=output.split(from).join(to);
 if(!output.includes('テレビリモコン')||!output.includes('リモコン/内部/Tapo共通'))throw Error('日本語リモコンの参照先が不明です');
 return output;
}

function digest(text){
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes=Array.from(unescape(encodeURIComponent(text)),x=>x.charCodeAt(0));
  const bitlen=bytes.length*8;if(bitlen>=0x20000000000000)throw Error('検証対象が大きすぎます');
  bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
  for(let k=3;k>=0;k--)bytes.push((Math.floor(bitlen/0x100000000)>>>k*8)&255);
  for(let k=3;k>=0;k--)bytes.push(((bitlen>>>0)>>>k*8)&255);
  const rr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let i=0;i<bytes.length;i+=64){
    const w=new Array(64).fill(0);
    for(let j=0;j<16;j++)w[j]=(bytes[i+j*4]<<24)|(bytes[i+j*4+1]<<16)|(bytes[i+j*4+2]<<8)|bytes[i+j*4+3];
    for(let j=16;j<64;j++){const a=w[j-15],b=w[j-2];w[j]=(w[j-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[j-7]+(rr(b,17)^rr(b,19)^(b>>>10)))>>>0}
    let [a,b,c,d,e,f,g,h]=H;
    for(let j=0;j<64;j++){
      const s1=rr(e,6)^rr(e,11)^rr(e,25),choice=(e&f)^((~e)&g);
      const t1=(h+s1+choice+K[j]+w[j])>>>0;
      const s0=rr(a,2)^rr(a,13)^rr(a,22),majority=(a&b)^(a&c)^(b&c);
      const t2=(s0+majority)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    for(const [j,v] of [a,b,c,d,e,f,g,h].entries())H[j]=(H[j]+v)>>>0;
  }
  return H.map(x=>x.toString(16).padStart(8,'0')).join('');
}
function scriptName(entry,code){
  if(isRemoteEntry(entry)){
    if(!/^\/\/ YOS Remote Hub v6\.5\b/.test(code))throw Error('BRAVIA元コードの形式が不正です');
    return REMOTE_NAME;
  }
  const first=code.split(/\r?\n/).slice(0,20).join('\n');
  const header=first.match(/^\/\/ YOS_SCRIPT_NAME:\s*(.+)\s*$/m);
  const base=entry.path.split('/').pop().slice(0,-3);
  const name=(header?header[1]:base).trim();
  if(name!==entry.name||!name||name.length>60||name===SELF||name.startsWith('Untitled Script')||/[\\/:*?"<>|\r\n]/.test(name)||name==='.'||name==='..')throw Error('正式名称が一致しません');
  return name;
}
function validateCatalog(data){
  if(!data||data.schema!==1||!Array.isArray(data.targets)||data.targets.length<1||data.targets.length>30)throw Error('配布一覧が無効です');
  const ids=new Set(),names=new Set();
  for(const t of data.targets){
    if(typeof t.id!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(t.id)||ids.has(t.id))throw Error('配布IDが無効です');
    if(typeof t.name!=='string'||!t.name||t.name.length>60||t.name===SELF||names.has(t.name)||/[\\/:*?"<>|\r\n]/.test(t.name))throw Error('配布名が無効です');
    if(typeof t.path!=='string'||!t.path.startsWith('ios-app/scriptable/')||!t.path.endsWith('.js')||/[\\?#%]/.test(t.path)||t.path.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('配布先が無効です');
    if(typeof t.commit!=='string'||!/^[0-9a-f]{40}$/.test(t.commit)||typeof t.sha256!=='string'||!/^[0-9a-f]{64}$/.test(t.sha256))throw Error('検証用ハッシュが無効です');
    if((t.id===REMOTE_ID||t.name===REMOTE_NAME||t.path===REMOTE_PATH)&&!isRemoteEntry(t))throw Error('日本語リモコン配布定義が不正です');
    ids.add(t.id);names.add(t.name);
  }
  return data.targets;
}
async function get(url){
  const request=new Request(url);request.timeoutInterval=30;
  const value=await request.loadString();
  if(request.response?.statusCode!==200||!value||value.length>1200000)throw Error('GitHub取得に失敗しました');
  return value;
}
// Fetch the exact pinned GitHub bytes. The raw endpoint may be normalized or
// cached by iOS networking; a second GitHub API route is independently verified.
// Neither route is ever trusted without matching the manifest SHA-256.
async function verifiedSource(entry,url){
  const expected=entry.sha256;
  let raw=null,first='未取得',second='未取得';
  try{
    raw=await get(url);
    const actual=digest(raw);
    if(actual===expected)return raw;
    first='RAW:'+actual.slice(0,12)+' ('+raw.length+'文字)';
  }catch(error){first='RAW取得:'+String(error.message||error).slice(0,60)}
  try{
    const apiUrl='https://api.github.com/repos/'+OWNER+'/contents/'+entry.path.split('/').map(encodeURIComponent).join('/')+'?ref='+entry.commit;
    const req=new Request(apiUrl);req.timeoutInterval=30;
    req.headers={'Accept':'application/vnd.github+json','User-Agent':'YOS-Common-Installer'};
    const payload=await req.loadJSON();
    if(req.response?.statusCode!==200||payload.encoding!=='base64'||typeof payload.content!=='string'||payload.size>1200000)throw Error('GitHub API応答が不正');
    const bytes=Data.fromBase64String(payload.content.replace(/\\s/g,''));
    if(!bytes)throw Error('Base64データの復元に失敗');
    const candidate=bytes.toRawString();
    const actual=digest(candidate);
    if(actual===expected)return candidate;
    second='API:'+actual.slice(0,12)+' ('+candidate.length+'文字)';
  }catch(error){second='API取得:'+String(error.message||error).slice(0,60)}
  throw Error('配布元の検証が2経路とも不一致。変更していません。対象:'+entry.id+' / 期待:'+expected.slice(0,12)+' / '+first+' / '+second);
}
function stores(){
  const out=[];
  try{const cloud=FileManager.iCloud();if(cloud&&cloud.documentsDirectory())out.push({fm:cloud,kind:'iCloud'})}catch(_){}
  const local=FileManager.local();
  if(!local||!local.documentsDirectory())throw Error('Scriptableの保存先を取得できません');
  out.push({fm:local,kind:'local'});
  return out;
}
async function readable(fm,path){
  if(fm.isFileStoredIniCloud&&fm.isFileStoredIniCloud(path)&&fm.downloadFileFromiCloud)await fm.downloadFileFromiCloud(path);
  return fm.readString(path);
}
function basePath(fm){return fm.joinPath(fm.documentsDirectory(),DATA_DIR)}
function metadataPath(fm,name,suffix){return fm.joinPath(basePath(fm),encodeURIComponent(name)+suffix)}
function ensureDir(fm,path){if(!fm.fileExists(path))fm.createDirectory(path,true);if(!fm.fileExists(path))throw Error('保存先の作成に失敗しました')}
async function readJSON(fm,path){
  if(!fm.fileExists(path))return null;
  return JSON.parse(await readable(fm,path));
}
function writeChecked(fm,path,content){
  fm.writeString(path,content);
  if(fm.readString(path)!==content)throw Error('保存後の読戻しに失敗しました');
}

// Scriptable adds an icon metadata banner on editing/opening scripts.
// Permit an update ONLY when removing this exact generated header restores
// a byte-for-byte match to the recorded, previously trusted script SHA-256.
// Never strip arbitrary edits, and always back up the original raw file.
function hasOnlyScriptableIconHeader(source,expectedHash){
  if(typeof source!=='string'||typeof expectedHash!=='string')return false;
  const header=/^\/\/ Variables used by Scriptable\.\n\/\/ These must be at the very top of the file\. Do not edit\.\n\/\/ icon-color: [a-z0-9-]+; icon-glyph: [a-z0-9-]+;\n(?=\/\/ Variables used by Scriptable\.)/;
  const match=source.match(header);
  return !!match&&digest(source.slice(match[0].length))===expectedHash;
}
function receiptFor(entry,hash,kind){return {schema:1,name:entry.name,id:entry.id,path:entry.path,sha256:hash,storage:kind,commit:entry.commit}}
function receiptMatches(receipt,entry,kind){
  return !!receipt&&receipt.schema===1&&receipt.name===entry.name&&receipt.id===entry.id&&receipt.path===entry.path&&receipt.storage===kind&&typeof receipt.sha256==='string'&&/^[0-9a-f]{64}$/.test(receipt.sha256);
}
function assertReceipt(receipt,entry,kind){
  if(!receiptMatches(receipt,entry,kind))throw Error('管理情報が不一致です。既存スクリプトは保護しました');
}
async function explainReceiptConflict(entry,kind,currentHash,previous,desiredHash=entry.sha256){
  const where=kind==='iCloud'?'iCloud':'このiPhone内';
  const exact=currentHash===desiredHash;
  const summary=exact?'コード本体はGitHubの検証済み配布版と一致しています。':'同名コードが存在しますが、GitHub配布版とは内容が異なります。';
  const reason=previous?'管理記録の名前・配布ID・保存場所などが一致しません。':'このコードに対応する管理記録がありません。';
  await inform('管理記録の安全診断','対象：'+entry.name+'\n保存先：'+where+'\n'+summary+'\n'+reason+'\nコード・管理記録は変更していません。'+(exact?'編集画面から確認できます。':'上書きせず保護してください。'),exact?entry.name:null);
}
async function confirm(title,message,label){
  const a=new Alert();a.title=title;a.message=message;a.addAction(label);a.addCancelAction('中止');return (await a.presentAlert())===0;
}
async function inform(title,message,name){
  const a=new Alert();a.title=title;a.message=message;
  if(name)a.addAction('スクリプトを開く');
  a.addCancelAction('閉じる');
  const click=await a.presentAlert();
  if(name&&click===0)Safari.open('scriptable:///open/'+encodeURIComponent(name));
}
async function recoverPending(fm,target,markerFile,receiptFile,name){
  const p=await readJSON(fm,markerFile);
  if(!p||p.schema!==1||p.name!==name||p.receiptFile!==receiptFile||typeof p.newHash!=='string'||!/^[0-9a-f]{64}$/.test(p.newHash))throw Error('中断記録の内容が不明です。元のコードを保護して停止しました');
  const live=fm.fileExists(target)?await readable(fm,target):null;
  const liveHash=live===null?null:digest(live);
  const actualReceipt=await readJSON(fm,receiptFile);
  const receiptHash=actualReceipt?.sha256||null;
  if(p.oldHash){
    const originalUnmanaged=name===REMOTE_NAME&&p.oldReceipt===null&&REMOTE_PRIOR_HASHES.has(p.oldHash);
    if(!/^[0-9a-f]{64}$/.test(p.oldHash)||typeof p.backup!=='string'||p.backup!==fm.joinPath(fm.joinPath(basePath(fm),'backups'),encodeURIComponent(name)+'-'+p.oldHash+'.txt')||!fm.fileExists(p.backup)||(!originalUnmanaged&&typeof p.oldReceipt!=='string'))throw Error('復旧用バックアップを特定できません');
    const before=await readable(fm,p.backup),previous=originalUnmanaged?null:JSON.parse(p.oldReceipt);
    const oldReceiptHash=originalUnmanaged?p.oldHash:previous.sha256;
    const allowedReceiptHashes=originalUnmanaged?[null,p.newHash]:[oldReceiptHash,p.newHash];
    if(digest(before)!==p.oldHash||(previous&&(!((previous.sha256===p.oldHash)||hasOnlyScriptableIconHeader(before,previous.sha256))||previous.name!==name))||![p.oldHash,p.newHash].includes(liveHash)||!allowedReceiptHashes.includes(receiptHash))throw Error('復旧記録とファイルに矛盾があります。変更しません');
    if(liveHash!==p.oldHash)writeChecked(fm,target,before);
    if(originalUnmanaged){if(receiptHash===p.newHash)fm.remove(receiptFile);}
    else if(receiptHash!==p.oldHash)writeChecked(fm,receiptFile,p.oldReceipt);
    if(digest(await readable(fm,target))!==p.oldHash||(originalUnmanaged?fm.fileExists(receiptFile):JSON.parse(await readable(fm,receiptFile)).sha256!==oldReceiptHash))throw Error('復旧の確認に失敗しました');
  }else{
    if(p.oldHash!==null||p.backup!==null||p.oldReceipt!==null||![null,p.newHash].includes(liveHash)||![null,p.newHash].includes(receiptHash))throw Error('初回登録の中断状態が不明です。変更しません');
    if(liveHash===p.newHash)fm.remove(target);
    if(receiptHash===p.newHash)fm.remove(receiptFile);
    if(fm.fileExists(target)||fm.fileExists(receiptFile))throw Error('新規登録の復旧確認に失敗しました');
  }
  fm.remove(markerFile);
  if(fm.fileExists(markerFile))throw Error('中断記録を消去できませんでした');
}

// Read-only collision report: never writes, removes, renames, or executes either copy.
// Display only short SHA-256 fingerprints, not users' script contents or credentials.
async function diagnoseDuplicate(entry,existing,desiredHash=entry.sha256){
  const report=[];
  for(const {fm,kind,target} of existing){
    try{
      const data=await readable(fm,target);
      if(typeof data!=='string'||data.length>1200000)throw Error('invalid size');
      const sha=digest(data);
      report.push({kind,sha,match:sha===desiredHash,readable:true});
    }catch(_){report.push({kind,readable:false});}
  }
  const bothReadable=report.every(x=>x.readable);
  const same=bothReadable&&report[0].sha===report[1].sha;
  const canonical=report.filter(x=>x.match).map(x=>x.kind==='iCloud'?'iCloud':'このiPhone内');
  const result=!bothReadable?'一部を読み取れません。原因は未確定です。'
    :same?(canonical.length===2?'両方とも配布正本と同一です。':'両方の内容は同一ですが、配布正本とは異なります。')
    :canonical.length===1?'内容は異なります。配布正本と一致するのは'+canonical[0]+'側です。'
    :'内容が異なり、両方とも配布正本とは一致しません。';
  const detail=report.map(x=>(x.kind==='iCloud'?'iCloud':'このiPhone内')+'：'+
    (x.readable?'検証値 '+x.sha.slice(0,12)+'…／配布正本 '+(x.match?'一致':'不一致'):'読み取り不可')).join('\n');
  await inform('同名スクリプトの安全診断',
    '対象：'+entry.name+'\n'+detail+'\n'+result+'\nどちらも変更していません。削除・上書きせず保護してください。',null);
}

async function install(entry){
  const path=entry.path.split('/').map(encodeURIComponent).join('/');
  const url=ROOT+entry.commit+'/'+path;
  const raw=await verifiedSource(entry,url);
  if(!(raw.startsWith('// Variables used by Scriptable.')||(isRemoteEntry(entry)&&/^\/\/ YOS Remote Hub v6\.5\b/.test(raw))))throw Error('GitHub元コードの形式が不一致です。変更していません');
  const name=scriptName(entry,raw),code=localizedCode(entry,raw),desiredHash=digest(code),locations=stores();
  const existing=[];
  for(const s of locations){
    const target=s.fm.joinPath(s.fm.documentsDirectory(),name+'.js');
    if(s.fm.fileExists(target))existing.push({...s,target});
  }
  if(existing.length>1){await diagnoseDuplicate(entry,existing,desiredHash);return;}
  if(isRemoteEntry(entry)&&!existing.length)throw Error('既存の「リモコン」がありません。重複防止のため新しいリモコンは作成しません');
  // When a receipt exists without its .js, select that exact storage only.
  // Never create a new script alongside an unresolved cross-storage receipt.
  const orphaned=[];
  if(existing.length===0){
    for(const loc of locations){
      if(loc.fm.fileExists(metadataPath(loc.fm,name,'.receipt.json')))orphaned.push(loc);
    }
    if(orphaned.length>1)throw Error('「'+name+'」の管理記録が両方の保存先にあります。本体を変更せず停止しました');
  }
  const chosen=existing[0]||orphaned[0]||locations[0],fm=chosen.fm;
  const target=chosen.target||fm.joinPath(fm.documentsDirectory(),name+'.js');
  const receiptFile=metadataPath(fm,name,'.receipt.json');
  const markerFile=metadataPath(fm,name,'.pending.json');
  const dataDir=basePath(fm);
  if(fm.fileExists(markerFile)){await recoverPending(fm,target,markerFile,receiptFile,name);throw Error('前回の中断状態を復旧しました。安全のため再度選択してください');}
  const current=existing.length?await readable(fm,target):null;
  const currentHash=current===null?null:digest(current);
  const previous=await readJSON(fm,receiptFile);
  if(currentHash===desiredHash||(current!==null&&hasOnlyScriptableIconHeader(current,desiredHash))){
    if(previous&&!receiptMatches(previous,entry,chosen.kind)){await explainReceiptConflict(entry,chosen.kind,currentHash,previous,desiredHash);return;}
    // Identical existing code is never overwritten or automatically adopted.
    await inform('登録済み','「'+name+'」は既に同じコードです。既存ファイルは変更していません。',name);
    return;
  }
  if(current!==null){
    const trustedPrior=isRemoteEntry(entry)&&previous===null&&REMOTE_PRIOR_HASHES.has(currentHash);
    if(!trustedPrior&&!receiptMatches(previous,entry,chosen.kind)){await explainReceiptConflict(entry,chosen.kind,currentHash,previous,desiredHash);return;}
    if(!trustedPrior&&previous.sha256!==currentHash&&!hasOnlyScriptableIconHeader(current,previous.sha256))throw Error('Scriptable内で変更されたコードです。上書きしません');
    const approved=await confirm(trustedPrior?'既存リモコンの安全更新':'更新の確認',
      trustedPrior?'既知の旧版「リモコン」と完全一致しました。現在の本体をバックアップし、テレビ・照明・エアコンを保持した新しい画質機能付きリモコンに更新しますか？':
      '「'+name+'」をGitHub検証済みの版へ更新します。現在のコードをバックアップしてから変更します。','バックアップして更新');
    if(!approved)return;
  }else if(previous){
    // Only recover an *exact* immutable release; receipt must be preserved byte for byte.
    if(!receiptMatches(previous,entry,chosen.kind)||previous.sha256!==desiredHash||previous.commit!==entry.commit){
      await inform('保存本体が見つからない安全診断',
        '対象：'+name+'\n保存先：'+(chosen.kind==='iCloud'?'iCloud':'このiPhone内')+
        '\n本体が見つからず、管理記録と現在の配布版を完全には照合できません。\nファイル・管理記録は変更していません。',null);
      return;
    }
    for(const loc of locations){
      if(loc.fm.fileExists(loc.fm.joinPath(loc.fm.documentsDirectory(),name+'.js')))
        throw Error('同名スクリプトが新たに見つかりました。変更せず停止しました');
      if(loc.fm!==fm&&loc.fm.fileExists(metadataPath(loc.fm,name,'.receipt.json')))
        throw Error('別の保存先にも管理記録があります。変更せず停止しました');
    }
    const rawReceipt=await readable(fm,receiptFile);
    const approved=await confirm('検証済みコードの本体だけ復元',
      '対象：'+name+'\n保存先：'+(chosen.kind==='iCloud'?'iCloud':'このiPhone内')+
      '\nコードがありませんが管理記録は現在のGitHub配布版と完全一致しています。管理記録や旧スクリプトを変更せず、新しい同名コード本体だけ作成します。','本体だけ復元');
    if(!approved)return;
    if(fm.fileExists(target)||await readable(fm,receiptFile)!==rawReceipt||fm.fileExists(markerFile))
      throw Error('復元直前に保存状態が変わりました。何も変更していません');
    for(const loc of locations){
      if(loc.fm.fileExists(loc.fm.joinPath(loc.fm.documentsDirectory(),name+'.js'))||
          (loc.fm!==fm&&loc.fm.fileExists(metadataPath(loc.fm,name,'.receipt.json'))))
        throw Error('別の保存先で競合を検出しました。何も変更していません');
    }
    try{writeChecked(fm,target,code)}
    catch(_){throw Error('本体の復元後確認に失敗しました。管理記録や既存コードは変更していません。ファイル状態を確認してください')}
    if(!fm.fileExists(target)||digest(await readable(fm,target))!==desiredHash||
       await readable(fm,receiptFile)!==rawReceipt)
      throw Error('本体または管理記録の読戻し確認に失敗しました。元の記録は変更していません');
    await inform('本体の復元完了','「'+name+'」の検証済みコード本体を作成しました。管理記録は変更していません。自動実行もしません。',name);
    return;
  }
  // Check the other storage for an orphaned receipt before first registration.
  if(current===null){
    for(const s of locations)if(s.fm!==fm&&s.fm.fileExists(metadataPath(s.fm,name,'.receipt.json')))throw Error('別の保存先に管理記録があり、安全のため停止しました');
  }
  ensureDir(fm,dataDir);
  let backup=null;
  if(current!==null){
    const folder=fm.joinPath(dataDir,'backups');ensureDir(fm,folder);
    backup=fm.joinPath(folder,encodeURIComponent(name)+'-'+currentHash+'.txt');
    if(fm.fileExists(backup)){if(await readable(fm,backup)!==current)throw Error('同名のバックアップが異なります');}
    else writeChecked(fm,backup,current);
  }
  const oldReceipt=previous?JSON.stringify(previous):null;
  const receipt=JSON.stringify(receiptFor(entry,desiredHash,chosen.kind));
  const marker=JSON.stringify({schema:1,name,oldHash:currentHash,newHash:desiredHash,backup,receiptFile,oldReceipt});
  writeChecked(fm,markerFile,marker);
  try{
    if(fm.fileExists(target)&&digest(await readable(fm,target))!==currentHash)throw Error('更新直前に内容が変わりました');
    writeChecked(fm,target,code);
    writeChecked(fm,receiptFile,receipt);
    fm.remove(markerFile);
    await inform(current===null?'登録完了':'更新完了','「'+name+'」を保存・確認しました。自動実行せず編集画面を開けます。',name);
  }catch(error){
    let restored=false;
    try{
      if(current===null){
        if(fm.fileExists(target)&&digest(await readable(fm,target))===desiredHash)fm.remove(target);
        if(fm.fileExists(receiptFile)&&await readable(fm,receiptFile)===receipt)fm.remove(receiptFile);
        restored=!fm.fileExists(target)&&!fm.fileExists(receiptFile);
      }else{
        if(fm.fileExists(target)&&digest(await readable(fm,target))===desiredHash)writeChecked(fm,target,current);
        if(fm.fileExists(receiptFile)&&await readable(fm,receiptFile)===receipt){
          if(oldReceipt!==null)writeChecked(fm,receiptFile,oldReceipt);
          else fm.remove(receiptFile);
        }
        restored=fm.fileExists(target)&&digest(await readable(fm,target))===currentHash&&(oldReceipt!==null||!fm.fileExists(receiptFile));
      }
      if(restored&&fm.fileExists(markerFile))fm.remove(markerFile);
    }catch(_){}
    throw Error(restored?'更新に失敗したため、元のコードを復元しました':'更新に失敗し、復旧確認ができません。バックアップを保護しました');
  }
}
// Self-update is intentionally opt-in. The release manifest is separate from
// the code to avoid a self-referential SHA256; it is published only after merge.
const SELF_MANIFEST=ROOT+'main/ios-app/scriptable/yos-common-installer-release.json';
function validateSelfRelease(release){
  if(!release||release.schema!==1||release.name!==SELF||
    release.path!=='ios-app/scriptable/YOS Common Installer.js'||
    typeof release.commit!=='string'||!/^[a-f0-9]{40}$/.test(release.commit)||
    typeof release.sha256!=='string'||!/^[a-f0-9]{64}$/.test(release.sha256))
    throw Error('自己更新の配布情報が不正です。変更していません');
  return release;
}
async function updateSelf(){
  const locations=stores(),matches=[];
  for(const loc of locations){
    const target=loc.fm.joinPath(loc.fm.documentsDirectory(),SELF+'.js');
    if(loc.fm.fileExists(target))matches.push({...loc,target});
  }
  if(matches.length!==1)throw Error('正規インストーラーが'+matches.length+'件です。保存先を一意に特定できないため停止しました');
  const selected=matches[0],{fm,target}=selected;
  // Do not touch the separately named orange copy.
  const original=await readable(fm,target),oldHash=digest(original);
  if(!original.includes('// YOS_SCRIPT_NAME: '+SELF))
    throw Error('既存本体の正式名称を確認できません。変更していません');
  const release=validateSelfRelease(JSON.parse(await get(SELF_MANIFEST)));
  if(oldHash===release.sha256||hasOnlyScriptableIconHeader(original,release.sha256)){
    await inform('更新不要','共通インストーラーは検証済みの最新版です。',null);return;
  }
  const url=ROOT+release.commit+'/'+release.path.split('/').map(encodeURIComponent).join('/');
  const next=await verifiedSource({...release,id:'installer-self'},url);
  if(!next.startsWith('// Variables used by Scriptable.')||
    !next.split(/\r?\n/).slice(0,12).includes('// YOS_SCRIPT_NAME: '+SELF)||
    digest(next)!==release.sha256)throw Error('新しいインストーラーの検証に失敗しました');
  const ok=await confirm('共通インストーラーの自己更新',
    '保存先：'+selected.kind+'\n現在：'+oldHash.slice(0,16)+'\n更新：'+release.sha256.slice(0,16)+
    '\n既存本体をバックアップし、同じ名前の本体だけを更新します。別名の「最新版」は変更しません。','バックアップして更新');
  if(!ok)return;
  // No writes before consent. Preserve backup if any later step fails.
  const backupDir=fm.joinPath(basePath(fm),'backups');
  ensureDir(fm,backupDir);
  const backup=fm.joinPath(backupDir,encodeURIComponent(SELF)+'-'+oldHash+'.txt');
  if(fm.fileExists(backup)){
    if(await readable(fm,backup)!==original)throw Error('バックアップが一致しません。更新を停止しました');
  }else writeChecked(fm,backup,original);
  if(digest(await readable(fm,target))!==oldHash)throw Error('更新直前に本体が変更されました');
  for(const loc of locations){
    if(loc!==selected&&loc.fm.fileExists(loc.fm.joinPath(loc.fm.documentsDirectory(),SELF+'.js')))
      throw Error('別の保存先に同名本体が見つかりました');
  }
  try{
    writeChecked(fm,target,next);
    await inform('共通インストーラー更新完了','バックアップ保存済み。次回起動時に新しいコードが使われます。',null);
  }catch(error){
    try{
      if(digest(await readable(fm,target))===release.sha256)writeChecked(fm,target,original);
      if(digest(await readable(fm,target))===oldHash)throw Error('更新に失敗したため元の本体に復旧しました');
    }catch(recovery){
      if(String(recovery.message||'').includes('復旧しました'))throw recovery;
    }
    throw Error('更新失敗。復旧確認できません。バックアップは保護しました');
  }
}
// Read-only bootstrap inventory: never select, rewrite, or delete either installer.
async function diagnoseInstallerCopies(){
  const names=[SELF,SELF+' 最新版'],found=[],locations=stores();
  for(const loc of locations){
    for(const name of names){
      const path=loc.fm.joinPath(loc.fm.documentsDirectory(),name+'.js');
      if(!loc.fm.fileExists(path))continue;
      try{
        const code=await readable(loc.fm,path);
        const sha=digest(code);
        const normalized=code.replace(/^\/\/ Variables used by Scriptable\.\r?\n\/\/ These must be at the very top of the file\. Do not edit\.\r?\n\/\/ icon-color: [a-z0-9-]+; icon-glyph: [a-z0-9-]+;\r?\n/,'');
        found.push({name,kind:loc.kind,sha,normalizedSha:digest(normalized),bytes:code.length});
      }catch(error){throw Error('インストーラーを読み取れません：'+name+' / '+loc.kind+'。変更していません');}
    }
  }
  const summary=found.length?found.map(x=>x.name+' / '+x.kind+' / SHA256 '+x.sha.slice(0,16)+' / 本文 '+x.normalizedSha.slice(0,16)).join('\n'):'対象スクリプトが見つかりません';
  await inform('インストーラーの読み取り診断',summary+'\n診断のみ。更新・削除・改名・受領証変更はしていません。',null);
  return found;
}
try{
  const chosenId=typeof args==='undefined'?'':String(args.shortcutParameter||args.queryParameters?.script||'');
  if(chosenId==='installer-self-update'){
    await updateSelf();
  }else if(chosenId==='installer-diagnose'){
    await diagnoseInstallerCopies();
  }else{
  const targets=validateCatalog(JSON.parse(await get(CATALOG)));
  let entry;
  if(chosenId){
    entry=targets.find(x=>x.id===chosenId);
    if(!entry)throw Error('指定された配布IDが見つかりません');
  }else{
    const a=new Alert();a.title='YOS 共通インストーラー';a.message='GitHubの検証済みコードを正式名称で導入します。既存の別コードは保護します。';
    for(const t of targets)a.addAction(t.name);
    a.addAction('共通インストーラーを更新');
    a.addAction('共通インストーラーの安全診断（読み取りのみ）');
    a.addCancelAction('中止');
    const index=await a.presentAlert();
    if(index===targets.length)await updateSelf();
    else if(index===targets.length+1)await diagnoseInstallerCopies();
    else if(index>=0)entry=targets[index];
  }
  if(entry)await install(entry);
  }
}catch(error){await inform('YOS導入・更新は未完了',String(error.message||error)+'\n元のコードを確認してから再試行してください。',null)}
finally{Script.complete()}
