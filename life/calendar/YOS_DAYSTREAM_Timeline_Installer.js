// Variables used by Scriptable.
// icon-color: gray; icon-glyph: clock;
// YOS DAYSTREAM: pinned UI update with known-version backup and readback.
const SOURCE='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/802af090cb7cbcbc81be56f38bdaceee1b825eea/life/calendar/YOS_DAYSTREAM_Timeline_Review_20261105.scriptable';
const TARGET='YOS DAYSTREAM Timeline 開発確認 20261105';
const SCRIPT_SHA='8ce8cb121b21063d4b287f0cef256f05203ee63a27f49217a292b07d9375407e';
const PREVIOUS_SCRIPT_SHA='b117fcd0c29c1227ef2205866dd19a0dea2564fc9f736806a5c54bdd49d5d1ca';
const PREVIOUS_SCRIPT_SHAS=[PREVIOUS_SCRIPT_SHA,'380b5fad7a68027e46bcca31608101e9f94924372ed1df7b5d0d7fad6c10d809','47d78c6fe61eaa5ad8b3f695250559f6e2686dafd8ff16a94eb40647e8469727'];
const SCRIPT_LENGTH=216893;
function sha256Hex(input){
  const K=[
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes=Array.from(unescape(encodeURIComponent(input)),c=>c.charCodeAt(0));
  const bitLength=bytes.length*8;
  if(bitLength>=0x20000000000000)throw Error('sha256 payload too long');
  bytes.push(0x80);while(bytes.length%64!==56)bytes.push(0);
  const high=Math.floor(bitLength/0x100000000),low=bitLength>>>0;
  for(let i=3;i>=0;i--)bytes.push((high>>>i*8)&255);
  for(let i=3;i>=0;i--)bytes.push((low>>>i*8)&255);
  const rr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let at=0;at<bytes.length;at+=64){
    const w=new Array(64).fill(0);
    for(let i=0;i<16;i++)w[i]=(bytes[at+i*4]<<24)|(bytes[at+i*4+1]<<16)|(bytes[at+i*4+2]<<8)|bytes[at+i*4+3];
    for(let i=16;i<64;i++){
      const a=w[i-15],b=w[i-2],s0=rr(a,7)^rr(a,18)^(a>>>3),s1=rr(b,17)^rr(b,19)^(b>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const s1=rr(e,6)^rr(e,11)^rr(e,25),ch=(e&f)^((~e)&g),t1=(h+s1+ch+K[i]+w[i])>>>0;
      const s0=rr(a,2)^rr(a,13)^rr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    for(const [i,x] of [a,b,c,d,e,f,g,h].entries())H[i]=(H[i]+x)>>>0;
  }
  return H.map(v=>v.toString(16).padStart(8,'0')).join('');
}

async function install(){
 const req=new Request(SOURCE);req.timeoutInterval=30;
 const raw=await req.loadString();if(req.response?.statusCode!==200)throw Error('固定版を取得できません');
 const pkg=JSON.parse(raw);
 if(pkg.name!==TARGET||typeof pkg.script!=='string'||pkg.script.length!==SCRIPT_LENGTH||sha256Hex(pkg.script)!==SCRIPT_SHA)throw Error('固定版の内容が一致しません。変更せず停止しました');
 const stores=[FileManager.iCloud(),FileManager.local()],found=[];
 for(const fm of stores){const path=fm.joinPath(fm.documentsDirectory(),TARGET+'.js');if(fm.fileExists(path)){
  if(fm.isFileStoredIniCloud&&fm.isFileStoredIniCloud(path)&&fm.downloadFileFromiCloud)await fm.downloadFileFromiCloud(path);
  found.push({fm,path,before:fm.readString(path)});
 }}
 if(found.length>1)throw Error('同名の候補が2か所にあるため、どちらも変更せず停止しました');
 const chosen=found[0]||{fm:stores[0],path:stores[0].joinPath(stores[0].documentsDirectory(),TARGET+'.js'),before:null};
 const {fm,path,before}=chosen;
 if(before!==null&&before!==pkg.script&&!PREVIOUS_SCRIPT_SHAS.includes(sha256Hex(before)))throw Error('同名の別コードがあります。上書きせず停止しました');
 if(before!==pkg.script){
  if((fm.fileExists(path)?fm.readString(path):null)!==before)throw Error('導入中にコードが変わりました。変更せず停止しました');
  if(before!==null){const backup=path+'.'+sha256Hex(before).slice(0,12)+'.previous.txt';if(fm.fileExists(backup)&&fm.readString(backup)!==before)throw Error('別のバックアップがあるため保護して停止しました');fm.writeString(backup,before);if(fm.readString(backup)!==before)throw Error('旧版のバックアップを確認できません。元のコードは変更していません');}
  try{fm.writeString(path,pkg.script);if(fm.readString(path)!==pkg.script)throw Error('保存後の読戻しが一致しません');}
  catch(e){let restored=false;try{if(before===null){if(fm.fileExists(path))fm.remove(path);restored=!fm.fileExists(path);}else{fm.writeString(path,before);restored=fm.readString(path)===before;}}catch(_){}throw Error(restored?'新UIの保存を確認できず、更新前の状態へ戻しました':'新UIの保存・復元を確認できません。バックアップを保持しています');}
 }
 Safari.open('scriptable:///run/'+encodeURIComponent(TARGET));
}
try{await install();}catch(e){const a=new Alert();a.title='DAYSTREAM更新未完了';a.message=String(e.message||e);a.addAction('閉じる');await a.presentAlert();}finally{Script.complete();}
