// YOS Common Installer 2 — first installation only. No personal data or credentials.
const NAME='YOS Common Installer 2';
const PIN='ed5a0dd48a73f3602eeef0fe8017ddd2a22682a5';
const EXPECTED='c113d032e377be85acb8767672a67ebd5c473e66fa0b3b0ee34d90dc6681c301';
const PATH='ios-app/scriptable/YOS%20Common%20Installer%202.js';
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

async function read(fm,p){if(fm.isFileStoredIniCloud&&fm.isFileStoredIniCloud(p)&&fm.downloadFileFromiCloud)await fm.downloadFileFromiCloud(p);return fm.readString(p)}
async function alert(title,message,confirm=false){const a=new Alert();a.title=title;a.message=message;a.addAction(confirm?'登録する':'閉じる');if(confirm)a.addCancelAction('中止');return await a.presentAlert()===0}
function locations(){const c=FileManager.iCloud(),l=FileManager.local();if(!c||!l||!c.documentsDirectory()||!l.documentsDirectory())throw Error('保存先を両方確認できないため停止しました');return [c,l].map(fm=>({fm,target:fm.joinPath(fm.documentsDirectory(),NAME+'.js'),stage:fm.joinPath(fm.documentsDirectory(),'.yos-installer-2-'+PIN+'.tmp')}))}
function present(loc){return loc.filter(s=>s.fm.fileExists(s.target))}
async function loadPinned(){let raw;
 try{const req=new Request('https://raw.githubusercontent.com/yskn0008-bot/ProjectY/'+PIN+'/'+PATH);req.timeoutInterval=20;raw=await req.loadString();if(req.response?.statusCode===200&&typeof raw==='string'&&raw.length<100000&&digest(raw)===EXPECTED)return raw}catch(_){}
 try{const req=new Request('https://api.github.com/repos/yskn0008-bot/ProjectY/contents/'+PATH+'?ref='+PIN);req.timeoutInterval=20;req.headers={Accept:'application/vnd.github+json','User-Agent':'YOS-Installer-2'};const p=await req.loadJSON();if(req.response?.statusCode!==200||p.encoding!=='base64'||p.size>100000)throw Error('response');raw=Data.fromBase64String(p.content.replace(/\s/g,'')).toRawString();if(digest(raw)===EXPECTED)return raw}catch(_){}
 throw Error('固定コードを照合できません。変更していません');
}
async function main(){
 const loc=locations();const found=present(loc);
 if(found.length){if(found.length===1&&digest(await read(found[0].fm,found[0].target))===EXPECTED){await alert('登録済み',NAME+' は既に登録されています。変更なし。');return}throw Error('同名コードが存在します。既存コードを保護して停止しました')}
 const raw=await loadPinned();
 if(!raw.split('\n').slice(0,20).includes('// YOS_SCRIPT_NAME: '+NAME))throw Error('正式名称が一致しません');
 if(!await alert('2号機の初回登録','YOS Common Installer 2 だけを新規登録します。1号機と既存アプリは変更しません。',true))return;
 const s=loc[0],fm=s.fm;
 if(present(loc).length)throw Error('登録直前に同名コードを検出しました。変更しません');
 if(loc.some(x=>x.fm.fileExists(x.stage)))throw Error('中断ファイルが残っています。上書きせず停止しました');
 try{
  fm.writeString(s.stage,raw);
  if(digest(await read(fm,s.stage))!==EXPECTED)throw Error('準備ファイルの照合失敗');
  if(present(loc).length)throw Error('登録直前の同名衝突');
  fm.move(s.stage,s.target);
  if(present(loc).length!==1||digest(await read(fm,s.target))!==EXPECTED)throw Error('登録後の確認失敗');
 }catch(e){
  if(fm.fileExists(s.stage)){try{if(digest(await read(fm,s.stage))===EXPECTED)fm.remove(s.stage)}catch(_){}}
  throw Error('登録を確認できません。未知のファイルは削除しません。'+String(e.message||e));
 }
 await alert('登録完了','YOS Common Installer 2 を保存し、読み戻し照合しました。Scriptable一覧から起動してください。');
}
try{await main()}catch(e){await alert('安全停止',String(e.message||e))}finally{Script.complete()}
