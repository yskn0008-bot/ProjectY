// Variables used by Scriptable.
// icon-color: blue; icon-glyph: shield-check;
// YOS_SCRIPT_NAME: YOS BRAVIA 消画安全復旧
// One-time rescue for the existing BRAVIA Picture Off only.
// Does NOT run a TV command; does NOT access Keychain, remotes or other devices.
// Do not overwrite a script edited outside known immutable ProjectY releases.
const TARGET_NAME='YOS BRAVIA Picture Off';
const TARGET_ID='bravia-picture-off';
const TARGET_PATH='ios-app/scriptable/remote-widgets/YOS BRAVIA Picture Off.js';
const OLD_SHA='402901e68dc2e21b6206dc0702d6d7cfdff0865b33fd0a49e589377140a6d2ce';
const NEW_SHA='a3fd9ef9193eb856ae3242626ae830d9020d8b4b2c2263cdc59d99fb8dc44a8d';
const NEW_COMMIT='4b1ede82c2e1282f8441119371a0802331838c1e';
const REPO='yskn0008-bot/ProjectY';
const DATA_DIR='YOS Common Installer Data';
const REPAIR_DIR='picture-off-repair-backups';
const PIN_URL='https://raw.githubusercontent.com/'+REPO+'/'+NEW_COMMIT+'/'+
  'ios-app/scriptable/remote-widgets/YOS%20BRAVIA%20Picture%20Off.js';
const API_URL='https://api.github.com/repos/'+REPO+'/contents/'+TARGET_PATH.split('/').map(encodeURIComponent).join('/')+'?ref='+NEW_COMMIT;

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

function storage(){
 const list=[];
 try{const c=FileManager.iCloud();if(c&&c.documentsDirectory())list.push({fm:c,kind:'iCloud'});}catch(_){}
 const l=FileManager.local();
 if(!l||!l.documentsDirectory())throw Error('Scriptable保存先を取得できません');
 list.push({fm:l,kind:'local'});
 return list;
}
async function read(fm,path){
 if(fm.isFileStoredIniCloud&&fm.isFileStoredIniCloud(path)&&fm.downloadFileFromiCloud)
  await fm.downloadFileFromiCloud(path);
 return fm.readString(path);
}
async function verifiedWrite(fm,path,value){
 fm.writeString(path,value);
 if(await read(fm,path)!==value)throw Error('保存内容の読戻しに失敗');
}
function paths(fm){
 const root=fm.documentsDirectory();
 const data=fm.joinPath(root,DATA_DIR);
 return {
  target:fm.joinPath(root,TARGET_NAME+'.js'),data,
  receipt:fm.joinPath(data,encodeURIComponent(TARGET_NAME)+'.receipt.json'),
  installerPending:fm.joinPath(data,encodeURIComponent(TARGET_NAME)+'.pending.json'),
  repairPending:fm.joinPath(data,'picture-off-repair.pending.json'),
  backupRoot:fm.joinPath(data,REPAIR_DIR)
 };
}
function exactGeneratedHeader(value){
 const pattern=/^\/\/ Variables used by Scriptable\.\n\/\/ These must be at the very top of the file\. Do not edit\.\n\/\/ icon-color: [a-z0-9-]+; icon-glyph: [a-z0-9-]+;\n(?=\/\/ Variables used by Scriptable\.)/;
 const matched=value.match(pattern);
 return matched?value.slice(matched[0].length):null;
}
function trustedOld(value){
 const stripped=exactGeneratedHeader(value);
 return digest(value)===OLD_SHA||(stripped!==null&&digest(stripped)===OLD_SHA);
}
function receiptOk(obj,kind){
 if(!obj||obj.schema!==1||obj.name!==TARGET_NAME||obj.id!==TARGET_ID||
 obj.path!==TARGET_PATH||obj.storage!==kind)return false;
 if(obj.sha256!==OLD_SHA)return false;
 return obj.commit===undefined||typeof obj.commit==='string'&&/^[a-f0-9]{40}$/.test(obj.commit);
}
async function notice(title,message,ask=false){
 const a=new Alert();a.title=title;a.message=message;
 a.addAction(ask?'バックアップして消画のみ更新':'閉じる');
 if(ask)a.addCancelAction('中止');
 return await a.presentAlert()===0;
}
async function downloadNew(){
 try{
  const q=new Request(PIN_URL);q.timeoutInterval=18;
  const raw=await q.loadString();
  if(q.response?.statusCode===200&&digest(raw)===NEW_SHA)return raw;
 }catch(_){}
 try{
  const q=new Request(API_URL);q.timeoutInterval=18;
  q.headers={'Accept':'application/vnd.github+json','User-Agent':'YOS-BRAVIA-Repair'};
  const response=await q.loadJSON();
  if(q.response?.statusCode!==200||response.encoding!=='base64'||
      typeof response.content!=='string'||response.size>30000)throw Error('invalid');
  const obj=Data.fromBase64String(response.content.replace(/\s/g,''));
  if(!obj)throw Error('invalid base64');
  const raw=obj.toRawString();
  if(digest(raw)===NEW_SHA)return raw;
 }catch(_){}
 throw Error('GitHubの消画最新版を検証できません。コード変更なし');
}
function ensure(fm,p){if(!fm.fileExists(p))fm.createDirectory(p,true);if(!fm.fileExists(p))throw Error('バックアップ保存先を作成できません');}
async function preserve(fm,p,value){
 if(fm.fileExists(p)){
  if(await read(fm,p)!==value)throw Error('以前のバックアップと内容が異なります。元コードは変更しません');
 }else await verifiedWrite(fm,p,value);
}
async function restoreInterrupted(fm,p){
 const t=JSON.parse(await read(fm,p.repairPending));
 if(!t||t.schema!==1||t.name!==TARGET_NAME||t.target!==p.target||
    t.receipt!==p.receipt||t.oldHash==null||t.newHash!==NEW_SHA||
    !/^[a-f0-9]{64}$/.test(t.oldHash))throw Error('中断記録の形式が不明です。保護して停止');
 const oldFile=fm.joinPath(p.backupRoot,TARGET_NAME+'-'+t.oldHash+'.js');
 const oldReceipt=fm.joinPath(p.backupRoot,TARGET_NAME+'-'+t.oldHash+'.receipt.json');
 if(!fm.fileExists(oldFile)||!fm.fileExists(oldReceipt))throw Error('中断前バックアップを確認できません。保護して停止');
 const before=await read(fm,oldFile),beforeRec=await read(fm,oldReceipt);
 if(digest(before)!==t.oldHash||!trustedOld(before)||digest(beforeRec)!==t.receiptHash||
    !receiptOk(JSON.parse(beforeRec),t.storage))throw Error('復旧元のハッシュ・受領証が一致しません。保護して停止');
 const live=await read(fm,p.target),rec=await read(fm,p.receipt);
 const liveHash=digest(live);
 const newReceipt=JSON.stringify({schema:1,name:TARGET_NAME,id:TARGET_ID,path:TARGET_PATH,sha256:NEW_SHA,storage:t.storage,commit:NEW_COMMIT});
 if(![t.oldHash,NEW_SHA].includes(liveHash)||![beforeRec,newReceipt].includes(rec))throw Error('中断後に第三者が変更した可能性があります。保護して停止');
 if(liveHash!==t.oldHash)await verifiedWrite(fm,p.target,before);
 if(rec!==beforeRec)await verifiedWrite(fm,p.receipt,beforeRec);
 if(await read(fm,p.target)!==before||await read(fm,p.receipt)!==beforeRec)throw Error('復元を確認できません。バックアップを残します');
 fm.remove(p.repairPending);
 if(fm.fileExists(p.repairPending))throw Error('中断状態を解除できません。バックアップを残します');
 await notice('消画｜前回の中断を復旧','元の消画コードと管理記録をバックアップから復元しました。\n安全のため、更新は行っていません。再実行してください。');
}
async function run(){
 const locations=storage();
 const entries=[];
 for(const s of locations){
  const p=paths(s.fm);
  if(s.fm.fileExists(p.target))entries.push({...s,p});
 }
 if(entries.length!==1){await notice('消画の安全確認','既存消画スクリプトが'+entries.length+'件あります。二重保存を避けるため何も変更しません。');return;}
 const {fm,kind,p}=entries[0];
 for(const x of locations){
  if(x.fm!==fm){
   const other=paths(x.fm);
   if(x.fm.fileExists(other.receipt)||x.fm.fileExists(other.installerPending)||x.fm.fileExists(other.repairPending)){
    await notice('消画の管理記録を保護','別の保存先に管理記録があります。何も更新しません。');return;
   }
  }
 }
 if(fm.fileExists(p.installerPending)){await notice('消画の中断記録あり','既存インストーラーの中断状態があるため変更しません。');return;}
 if(fm.fileExists(p.repairPending)){await restoreInterrupted(fm,p);return;}
 if(!fm.fileExists(p.receipt)){await notice('消画の受領証がありません','既存消画コードは変更せず保護しました。');return;}
 const old=await read(fm,p.target),oldHash=digest(old),oldReceipt=await read(fm,p.receipt);
 let previous;
 try{previous=JSON.parse(oldReceipt)}catch(_){await notice('消画の受領証が読めません','安全のため何も変更しません。');return;}
 if(!receiptOk(previous,kind)){await notice('消画の受領証が不明です','旧公式版の管理記録を特定できず保護しました。コード・受領証を変更していません。');return;}
 if(!trustedOld(old)){
  if(oldHash===NEW_SHA){await notice('消画コードは既に最新版','コードはGitHub最新版と一致しますが、受領証が旧版です。自動修復せず保護しました。');return;}
  await notice('既存の消画コードを保護','旧公式版と一致しないため更新しません（識別 '+oldHash.slice(0,12)+'）。');return;
 }
 const next=await downloadNew();
 if(!next.startsWith('// Variables used by Scriptable.\n// YOS_SCRIPT_NAME: YOS BRAVIA Picture Off\n'))throw Error('ダウンロードしたコードの正式名称が違います');
 const summary='消画スクリプトのみ旧公式版と照合できました。元ファイルと受領証をバックアップし、診断表示付きの最新版へ更新します。\n既存4台リモコン・テレビ設定・共通インストーラーは変更しません。\n\n保存先：'+kind;
 if(!await notice('BRAVIA 消画だけの安全復旧',summary,true))return;
 if(await read(fm,p.target)!==old||await read(fm,p.receipt)!==oldReceipt||fm.fileExists(p.installerPending)||fm.fileExists(p.repairPending))throw Error('承認前から内容が変化しました。何も変更しません');
 ensure(fm,p.data);ensure(fm,p.backupRoot);
 const oldPath=fm.joinPath(p.backupRoot,TARGET_NAME+'-'+oldHash+'.js');
 const oldReceiptPath=fm.joinPath(p.backupRoot,TARGET_NAME+'-'+oldHash+'.receipt.json');
 await preserve(fm,oldPath,old);await preserve(fm,oldReceiptPath,oldReceipt);
 if(await read(fm,p.target)!==old||await read(fm,p.receipt)!==oldReceipt)throw Error('更新直前に内容が変化。元ファイル保護');
 const newReceipt=JSON.stringify({schema:1,name:TARGET_NAME,id:TARGET_ID,path:TARGET_PATH,sha256:NEW_SHA,storage:kind,commit:NEW_COMMIT});
 const marker=JSON.stringify({schema:1,name:TARGET_NAME,target:p.target,receipt:p.receipt,oldHash,newHash:NEW_SHA,receiptHash:digest(oldReceipt),storage:kind});
 await verifiedWrite(fm,p.repairPending,marker);
 try{
  await verifiedWrite(fm,p.target,next);
  await verifiedWrite(fm,p.receipt,newReceipt);
  if(digest(await read(fm,p.target))!==NEW_SHA||
     await read(fm,p.receipt)!==newReceipt)throw Error('消画ファイルの検証に失敗');
  fm.remove(p.repairPending);
  if(fm.fileExists(p.repairPending))throw Error('中断記録が残っています');
 }catch(_){
  let restored=false;
  try{
   const live=await read(fm,p.target);
   const liveRec=await read(fm,p.receipt);
   if([old,next].includes(live)&&[oldReceipt,newReceipt].includes(liveRec)){
    if(live!==old)await verifiedWrite(fm,p.target,old);
    if(liveRec!==oldReceipt)await verifiedWrite(fm,p.receipt,oldReceipt);
    restored=await read(fm,p.target)===old&&await read(fm,p.receipt)===oldReceipt;
    if(restored&&fm.fileExists(p.repairPending))fm.remove(p.repairPending);
   }
  }catch(_){}
  throw Error(restored?'更新できなかったため、元の消画コードと受領証を復元しました。':
   '更新・復旧の検証を完了できません。バックアップを保護しました。');
 }
 const done=new Alert();done.title='BRAVIA 消画｜コード更新済み';
 done.message='消画コード・受領証の保存と読戻しを確認。\nテレビが実際に消えるかはまだ未確認です。';
 done.addAction('消画スクリプトを開く');done.addCancelAction('閉じる');
 if((await done.presentAlert())===0)Safari.open('scriptable:///open/'+encodeURIComponent(TARGET_NAME));
}
try{await run();}
catch(e){await notice('消画復旧は未完了',String(e?.message||e).slice(0,320)+'\nスクリプトを削除・改名しないでください。');}
finally{Script.complete();}
