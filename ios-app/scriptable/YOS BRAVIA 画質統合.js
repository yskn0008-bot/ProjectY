// Variables used by Scriptable.
// icon-color: blue; icon-glyph: tv;
// YOS_SCRIPT_NAME: YOS BRAVIA 画質統合
// Verified, opt-in updater for the EXISTING Untitled Script 9. No new remote.
const CURRENT="fb1316a915ed8b0194a14fc40db5e2736f18c009";
const NEXT="af58747da86a12bde07ade94b38df4a320675408";
const OWNER="yskn0008-bot/ProjectY";
const OLD_PATH="/ios-app/scriptable/remote-widgets/";
const NEXT_PATH="/ios-app/scriptable/remote-widgets/picture-v66/";
const NAME="Untitled Script 9";
const FILES=[
 {name:"YOS Remote Hub.js",sha256:"7640359fe0bf3aec3e512fe7689e5f2a1a3ebd64ce088af872cdfce06ec34c7f"},
 {name:"YOS Tapo H110 Core.js",sha256:"810e7536920e991ce49728cf03b6be9092b9f3f0539d231dd214852c20778e1d"},
 {name:"YOS Light Widget.js",sha256:"b43652b3835adcce9581810a0aa63768ac95b8c0a6d317f23362028308e8b0ec"},
 {name:"YOS AC Widget.js",sha256:"b1ce685b69206371501a65b2dd955ca2f01630be6827b0867c05529f200a7a89"}
];
const cloud=FileManager.iCloud(),local=FileManager.local();
const target=cloud.joinPath(cloud.documentsDirectory(),NAME+".js");
const alt=local.joinPath(local.documentsDirectory(),NAME+".js");
const dataDir=cloud.joinPath(cloud.documentsDirectory(),"YOS Common Installer Data");
const backupDir=cloud.joinPath(dataDir,"backups");
const RELEASE_RE=/(const\s+RELEASE\s*=\s*["'])([0-9a-f]{40})(["']\s*;)/g;
const BASE_RE=/(["'])\/ios-app\/scriptable\/remote-widgets\/\1/g;
function isFile(fm,p){return fm.fileExists(p)&&!fm.isDirectory(p)}
function ensureFolder(p){if(!cloud.fileExists(p))cloud.createDirectory(p,true);if(!cloud.isDirectory(p))throw Error("保管先が利用できません")}
function writeChecked(p,s){cloud.writeString(p,s);if(cloud.readString(p)!==s)throw Error("書き込み後の照合に失敗しました")}
async function readCurrent(){
 if(!isFile(cloud,target)||local.fileExists(alt))throw Error("起動元が一意ではありません。iCloudの「Untitled Script 9」1本だけの場合に対応します");
 if(cloud.isFileStoredIniCloud&&cloud.isFileStoredIniCloud(target))await cloud.downloadFileFromiCloud(target);
 return cloud.readString(target)
}
function verifyShape(s){
 if(!s.includes("// YOS Remote 4台版 v6.6 直接起動"))throw Error("既存ランチャーの識別子が違います");
 if(!s.includes("YOS_Remote_v66_cache.json"))throw Error("既存キャッシュの構造が違います");
 for(const f of FILES)if(!s.includes('"'+f.name+'"')&&!s.includes("'"+f.name+"'"))throw Error("既存ランチャーの依存が不足: "+f.name);
 const releases=[...s.matchAll(RELEASE_RE)],bases=[...s.matchAll(BASE_RE)];
 if(releases.length!==1||bases.length!==1)throw Error("リリース参照が複数または不明です");
 return releases[0][2]
}
function patch(s){
 const release=verifyShape(s);
 if(release!==CURRENT)throw Error("現在のリリースが既知のv6.6と異なります。変更しません");
 if(s.length!==4003)throw Error("実機調査時の起動コード(4003文字)から変化しています。変更しません");
 const a=s.replace(RELEASE_RE,(_,left,_value,right)=>left+NEXT+right);
 const b=a.replace(BASE_RE,(_,q)=>q+NEXT_PATH+q);
 if(a===s||b===a||b===s)throw Error("差分が作成できません");
 if(b.replace(NEXT,CURRENT).replace(NEXT_PATH,OLD_PATH)!==s)throw Error("元のスクリプトを正確に復元できないため中止");
 return b
}
async function confirmedSource(item){
 const path=NEXT_PATH.slice(1).split('/').map(encodeURIComponent).join('/')+encodeURIComponent(item.name);
 const raw="https://raw.githubusercontent.com/"+OWNER+"/"+NEXT+"/"+path;
 try{
  const req=new Request(raw);req.timeoutInterval=25;
  const result=await req.loadString();
  if(req.response?.statusCode===200&&digest(result)===item.sha256)return result;
 }catch(_){}
 const api="https://api.github.com/repos/"+OWNER+"/contents/"+path+"?ref="+NEXT;
 const req=new Request(api);req.timeoutInterval=25;
 req.headers={"Accept":"application/vnd.github+json","User-Agent":"YOS-Scriptable"};
 const obj=await req.loadJSON();
 if(req.response?.statusCode!==200||obj.encoding!=="base64"||typeof obj.content!=="string")throw Error(item.name+" の取得ができません");
 const data=Data.fromBase64String(obj.content.replace(/\s/g,""));
 if(!data)throw Error(item.name+" の復元に失敗");
 const text=data.toRawString();
 if(digest(text)!==item.sha256)throw Error(item.name+" のSHA-256照合に失敗。変更していません");
 return text
}
async function notify(title,message){
 const a=new Alert();a.title=title;a.message=message;a.addAction("閉じる");await a.presentAlert()
}
async function ask(){
 const a=new Alert();a.title="使っている4台リモコンに画質設定を追加";
 a.message="対象：iCloud / Untitled Script 9\n\n4台操作・ボタン配置・設定を保持したまま、BRAVIAの画質・明るさ・昼/夜/映画保存・消画を組み込みます。\n既存スクリプトをバックアップし、GitHub検証済み4ファイルを確認してから起動先2箇所のみ書き換えます。\nテレビの設定は変更しません。";
 a.addAction("バックアップして更新");a.addCancelAction("中止");
 return await a.presentAlert()===0
}
async function main(){
 const s=await readCurrent();
 if(s.includes(NEXT)&&s.includes(NEXT_PATH)){await notify("画質統合は導入済み","同じ起動スクリプトに新しい参照先が設定されています。普段のリモコンから画質ボタンを確認してください。");return}
 const next=patch(s),originalHash=digest(s),nextHash=digest(next);
 await Promise.all(FILES.map(confirmedSource));
 if(!await ask())return;
 if(await readCurrent()!==s)throw Error("承認中に既存コードが変化しました。変更していません");
 ensureFolder(dataDir);ensureFolder(backupDir);
 const backup=cloud.joinPath(backupDir,encodeURIComponent(NAME)+"-"+originalHash+"-before-picture-v66.txt");
 const marker=cloud.joinPath(dataDir,encodeURIComponent(NAME)+".picture-pending.json");
 if(cloud.fileExists(marker))throw Error("前回の更新記録が残っています。自動上書きを停止します");
 if(cloud.fileExists(backup)){if(cloud.readString(backup)!==s)throw Error("同名のバックアップ内容が異なります")}
 else writeChecked(backup,s);
 if(digest(cloud.readString(backup))!==originalHash)throw Error("バックアップの整合確認に失敗");
 const state=JSON.stringify({schema:1,name:NAME,originalHash,nextHash,backup,release:NEXT});
 writeChecked(marker,state);
 let done=false;
 try{
  if(await readCurrent()!==s)throw Error("書き込み直前にコードが変化しました");
  writeChecked(target,next);
  if(digest(await readCurrent())!==nextHash)throw Error("更新後のSHA-256照合に失敗");
  done=true;cloud.remove(marker);
  await notify("画質統合が完了","既存の「Untitled Script 9」を更新しました。新しいリモコンはまだ自動実行していません。\n普段の起動方法で開き、テレビ→画質を確認してください。\nバックアップは保持しています。");
 }catch(e){
  if(!done){
   try{writeChecked(target,s);if(digest(await readCurrent())!==originalHash)throw Error("読戻し不一致");cloud.remove(marker)}
   catch(_){throw Error("自動復旧が確認できません。バックアップを保護し、元のリモコンの実行を控えてください")}
  }
  throw e
 }
}
try{await main()}catch(e){await notify("画質統合は未完了",String(e&&e.message||e)+"\n既存のほかのリモコンは変更していません。")}
finally{Script.complete()}
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
