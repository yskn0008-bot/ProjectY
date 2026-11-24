// YOS Common Installer safe one-time repair for Issue #900.
// Delivered ONLY in the existing Shortcut Factory v3 signed Shortcut, via
// Scriptable Run Inline Script. Never runs or modifies the installer currently
// executing; does not install a new permanent Scriptable script.
// No Keychain reads/writes, telemetry, credential collection, or device commands.
const OFFICIAL_NAME='YOS Common Installer';
const PIN='8bb289519b0f4f6c907b27f336a623bc5669e669';
const EXPECTED='0f0af090deec3c9c523ee885d37f4d5394321bd009f8e04962deff91ea3fc0b0';
const OLD_TRUSTED=new Set([
 'e8f6ad7ab426ee53cfca3c9528f12418b1659d6d5be88558181721a9cc221507',
 '92a40d07db2f89594f05e9daa8236035df93c0ee5bccd126cd8a94beac87ea5c',
 '1867267e2f4eeea9a4b3a8f7122e44a1c9b5e90296316266630a00eb92fcb743',
 '1b5559662a51067737f4d37e91e6399d65f617c13f2673b7b07b488a98c49bbb',
 'af7fc5faa4723a5fe7fc559c49f46ab7230e60f360dd4d602f33bdc440e9bdb7',
 '3a8efc66f8d196c74ad851534d8d9a73860026f6a4300a4df77ed5fff478b35f',
 '069c2a556fbdc5eb72ef9dfda5f545e41bb252baa45b59637a4f5d9f6d1ce547'
]);
const PICTURE='YOS BRAVIA Picture Off';
const PICTURE_OLD='402901e68dc2e21b6206dc0702d6d7cfdff0865b33fd0a49e589377140a6d2ce';
const PICTURE_NEW='a3fd9ef9193eb856ae3242626ae830d9020d8b4b2c2263cdc59d99fb8dc44a8d';
const RAW='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/'+PIN+'/ios-app/scriptable/YOS%20Common%20Installer.js';
const API='https://api.github.com/repos/yskn0008-bot/ProjectY/contents/ios-app/scriptable/YOS%20Common%20Installer.js?ref='+PIN;
const DATA_DIR='YOS Common Installer Data';

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

function stores(){
 const a=[];
 try{const c=FileManager.iCloud();if(c&&c.documentsDirectory())a.push({fm:c,kind:'iCloud'});}
 catch(_){}
 const l=FileManager.local();
 if(!l||!l.documentsDirectory())throw Error('このiPhoneの保存先が取得できません');
 a.push({fm:l,kind:'local'});
 return a;
}
async function readFile(fm,path){
 if(fm.isFileStoredIniCloud&&fm.isFileStoredIniCloud(path)&&fm.downloadFileFromiCloud)
  await fm.downloadFileFromiCloud(path);
 return fm.readString(path);
}
function generatedHeaderOriginal(value){
 const match=value.match(/^\/\/ Variables used by Scriptable\.\n\/\/ These must be at the very top of the file\. Do not edit\.\n\/\/ icon-color: [a-z0-9-]+; icon-glyph: [a-z0-9-]+;\n(?=\/\/ Variables used by Scriptable\.)/);
 return match?value.slice(match[0].length):null;
}
function trustedCode(value){
 const candidate=generatedHeaderOriginal(value);
 return digest(value)===EXPECTED || OLD_TRUSTED.has(digest(value)) ||
   (candidate!==null&&(digest(candidate)===EXPECTED||OLD_TRUSTED.has(digest(candidate))));
}
async function loadPinned(){
 let raw=null;
 try{
  const r=new Request(RAW);r.timeoutInterval=20;
  raw=await r.loadString();
  if(r.response&&r.response.statusCode===200&&digest(raw)===EXPECTED)return raw;
 }catch(_){}
 try{
  const req=new Request(API);req.timeoutInterval=20;
  req.headers={Accept:'application/vnd.github+json','User-Agent':'YOS-Common-Installer-Repair'};
  const result=await req.loadJSON();
  if(req.response?.statusCode!==200||result.encoding!=='base64'||
      typeof result.content!=='string'||result.size>100000)throw Error('invalid GitHub API response');
  const bytes=Data.fromBase64String(result.content.replace(/\s/g,''));
  if(!bytes)throw Error('invalid Base64 content');
  raw=bytes.toRawString();
  if(digest(raw)===EXPECTED)return raw;
 }catch(_){}
 throw Error('GitHubの配布コードを検証できません。変更せず停止しました');
}
async function alert(title,message,confirm){
 const a=new Alert();a.title=title;a.message=message;
 a.addAction(confirm?'バックアップして更新':'閉じる');
 if(confirm)a.addCancelAction('中止');
 return await a.presentAlert()===0;
}
async function pictureSummary(locations){
 const found=[];
 for(const s of locations){
  const p=s.fm.joinPath(s.fm.documentsDirectory(),PICTURE+'.js');
  if(!s.fm.fileExists(p))continue;
  try{
   const data=await readFile(s.fm,p);
   const hash=digest(data);
   const normal=generatedHeaderOriginal(data);
   const normalized=normal===null?'':digest(normal);
   const state=[hash,normalized].includes(PICTURE_NEW)?'診断版と一致':
     [hash,normalized].includes(PICTURE_OLD)?'旧正式版と一致':'内容未照合（保護）';
   const receipt=s.fm.joinPath(s.fm.joinPath(s.fm.documentsDirectory(),DATA_DIR),
       encodeURIComponent(PICTURE)+'.receipt.json');
   let receiptStatus='受領証なし';
   if(s.fm.fileExists(receipt)){
    try{
     const x=JSON.parse(await readFile(s.fm,receipt));
     receiptStatus=x&&typeof x.sha256==='string'&&x.sha256===hash?'受領証一致':'受領証不一致／要確認';
    }catch(_){receiptStatus='受領証読取不可';}
   }
   found.push((s.kind==='iCloud'?'iCloud':'このiPhone')+'：'+state+'／'+receiptStatus+'（識別 '+hash.slice(0,12)+'）');
  }catch(_){found.push((s.kind==='iCloud'?'iCloud':'このiPhone')+'：読取不可（保護）');}
 }
 return found.length?found.join('\n'):'YOS BRAVIA Picture Off：見つかりません';
}
async function main(){
 const locations=stores();
 const matches=[];
 for(const s of locations){
  const path=s.fm.joinPath(s.fm.documentsDirectory(),OFFICIAL_NAME+'.js');
  if(s.fm.fileExists(path))matches.push({...s,path});
 }
 const picture=await pictureSummary(locations);
 if(matches.length!==1){
  await alert('共通インストーラー保護',
    '正式名の既存本体が'+matches.length+'件です。削除・改名せず停止しました。\n'+picture,false);
  return;
 }
 const chosen=matches[0],fm=chosen.fm,old=await readFile(fm,chosen.path);
 const currentHash=digest(old);
 const known=trustedCode(old);
 const where=chosen.kind==='iCloud'?'iCloud':'このiPhone内';
 if(!known){
  await alert('既存コードを保護して停止',
    'YOS Common Installer／'+where+'\nGitHub正式履歴に一致しません（識別 '+currentHash.slice(0,12)+'）。\nコード・受領証は一切変更していません。\n\n消画：'+picture,false);
  return;
 }
 if(currentHash===EXPECTED||digest(generatedHeaderOriginal(old)||'')===EXPECTED){
  await alert('共通インストーラーは最新版',
    '更新不要です。既存本体は変更していません。\n\n消画：'+picture+
    '\n消画の不一致原因をこの画面だけで判断せず、既存ファイルを保護してください。',false);
  return;
 }
 const newCode=await loadPinned();
 if(!newCode.startsWith('// Variables used by Scriptable.\n')||
    !newCode.includes('// YOS_SCRIPT_NAME: YOS Common Installer')||
    !newCode.includes('async function install(entry)'))throw Error('配布コードの形式を確認できません');
 const ok=await alert('共通インストーラーだけ安全更新',
   '対象：YOS Common Installer／'+where+
   '\nGitHubで正式公開された旧版と一致しています。' +
   '\n元コードをバックアップし、同じ名前の本体だけ更新します。' +
   '\n「最新版」など別名のスクリプトや受領証、家電設定は変更しません。',true);
 if(!ok)return;
 // Do not update on a stale observation; another app/Shortcuts may have edited it.
 if(!fm.fileExists(chosen.path)||await readFile(fm,chosen.path)!==old)
   throw Error('更新直前に内容が変わりました。何も変更せず停止');
 for(const s of locations){
  const p=s.fm.joinPath(s.fm.documentsDirectory(),OFFICIAL_NAME+'.js');
  if(s.fm!==fm&&s.fm.fileExists(p))throw Error('別の保存先で同名を発見。変更せず停止');
 }
 const dataDir=fm.joinPath(fm.documentsDirectory(),DATA_DIR);
 const backupDir=fm.joinPath(dataDir,'bootstrap-backups');
 if(!fm.fileExists(dataDir))fm.createDirectory(dataDir,true);
 if(!fm.fileExists(backupDir))fm.createDirectory(backupDir,true);
 const backup=fm.joinPath(backupDir,'YOS Common Installer-'+currentHash+'.js');
 if(fm.fileExists(backup)){
  if(await readFile(fm,backup)!==old)throw Error('既存バックアップの内容が異なります。変更せず停止');
 }else{
  fm.writeString(backup,old);
  if(await readFile(fm,backup)!==old)throw Error('バックアップ検証失敗。元コードは変更せず停止');
 }
 if(await readFile(fm,chosen.path)!==old)throw Error('更新直前の読戻し不一致。元コードは保護');
 try{
  fm.writeString(chosen.path,newCode);
  if(await readFile(fm,chosen.path)!==newCode ||
     digest(await readFile(fm,chosen.path))!==EXPECTED)throw Error('更新後の検証に失敗');
 }catch(error){
  let restored=false;
  try{
   const live=fm.fileExists(chosen.path)?await readFile(fm,chosen.path):null;
   // Never overwrite a third-party concurrently edited version.
   if(live===null||live===newCode||digest(live)===EXPECTED||trustedCode(live)){
    fm.writeString(chosen.path,old);
    restored=await readFile(fm,chosen.path)===old;
   }
  }catch(_){}
  throw Error(restored?'更新できなかったため元コードに復元しました。バックアップは保護':
     '更新・復元の確認ができません。バックアップを保護したので手作業で消去しないでください');
 }
 await alert('共通インストーラー更新完了',
   '同じ名前のコードだけを更新し、読戻しまで確認しました。元コードのバックアップは残っています。'+
   '\n\n消画：'+picture+
   '\n次は既存の共通インストーラーで消画を安全に更新します。',false);
}
try{await main();}
catch(error){await alert('共通インストーラー修復は未完了',
 String(error?.message||error).slice(0,350)+'\n既存コードやバックアップを削除しないでください。',false);}
finally{Script.complete();}
