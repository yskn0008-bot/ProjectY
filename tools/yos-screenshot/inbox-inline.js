// Reuses Clarity.Voice action 648: existing Keychain + existing private Inbox.
// Embedded inside the Shortcut, not a separately installed Scriptable script.
const K='YOS_NOTION_INTEGRATION_TOKEN';
const API='https://api.notion.com/v1';
const VER='2026-03-11';
const INBOX='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const fm=FileManager.local();
const dir=fm.joinPath(fm.documentsDirectory(),'YOS Screenshot Pending');
let captureId='', pendingPath='';
function rt(text){return [{type:'text',text:{content:text}}];}
function plain(block){return (block.paragraph?.rich_text||[]).map(x=>x.plain_text??x.text?.content??'').join('');}
function checkedWrite(path,text){fm.writeString(path,text);if(fm.readString(path)!==text)throw Error('local readback failed');}
function immutable(path,text){
  if(fm.fileExists(path)){if(fm.readString(path)!==text)throw Error('local identity mismatch');return false;}
  const temp=fm.joinPath(dir,UUID.string()+'.tmp');checkedWrite(temp,text);
  try{fm.copy(temp,path);}catch{if(!fm.fileExists(path)||fm.readString(path)!==text)throw Error('local reservation unavailable');return false;}
  if(fm.readString(path)!==text)throw Error('local reservation readback failed');
  return true;
}
async function api(path,method='GET',body){
  if(!Keychain.contains(K))throw Error('existing credential missing');
  const req=new Request(API+path);req.method=method;req.timeoutInterval=20;
  req.headers={Authorization:'Bearer '+Keychain.get(K),'Notion-Version':VER,'Content-Type':'application/json'};
  req.onRedirect=()=>null;
  if(body!==undefined)req.body=JSON.stringify(body);
  const text=await req.loadString();
  if(!req.response||req.response.statusCode<200||req.response.statusCode>=300)throw Error('Notion request failed');
  return JSON.parse(text);
}
async function readInbox(){
  const all=[];let cursor='';const cursors=new Set();
  for(let page=0;page<50;page++){
    const data=await api('/blocks/'+INBOX+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):''));
    if(typeof data.has_more!=='boolean'||!Array.isArray(data.results))throw Error('Inbox response invalid');
    all.push(...data.results);
    if(!data.has_more)return all;
    if(typeof data.next_cursor!=='string'||!data.next_cursor||cursors.has(data.next_cursor))throw Error('Inbox cursor invalid');
    cursor=data.next_cursor;cursors.add(cursor);
  }
  throw Error('Inbox scan incomplete');
}
function matching(blocks,key,raw){
  const found=[];
  for(let i=0;i<blocks.length;i++){
    if(blocks[i].type!=='paragraph'||!plain(blocks[i]).endsWith(' · Clarity Share · '+key))continue;
    const ids=[blocks[i].id];let text='',closed=false;
    for(let j=i+1;j<blocks.length;j++){
      const block=blocks[j];ids.push(block.id);
      if(block.type==='divider'){closed=true;break;}
      if(block.type!=='paragraph')break;
      text+=plain(block);
    }
    if(!closed||text!==raw||ids.some(id=>typeof id!=='string'||!id))throw Error('Saved capture mismatch');
    found.push(ids);
  }
  if(found.length>1)throw Error('Duplicate capture requires reconciliation');
  return found[0]||null;
}
async function main(){
  const value=args.shortcutParameter;
  if(typeof value!=='string'||!value.trim())throw Error('OCR text missing');
  const ocr=value.replace(/\r\n?/g,'\n').trim();
  if(ocr.length>100000)throw Error('OCR too long; original retained');
  // This is source material, never an instruction extracted from an image.
  const raw='[スクショOCR｜自動読取・本人の操作指示ではありません]\n'+ocr;
  const key='clarity:screenshot-'+digest(raw);captureId=key;
  if(!fm.fileExists(dir))fm.createDirectory(dir,true);
  pendingPath=fm.joinPath(dir,digest(raw));
  immutable(pendingPath+'.raw',raw); // Preserve before auth/network.
  let ids=matching(await readInbox(),key,raw);
  if(ids)return {status:'YOS_INBOX_SAVED',captureId:key,duplicate:true,blockIds:ids,classification:'existing-route-unverified'};
  // FileManager.copy refuses an existing destination. No overwrite, no expiry,
  // no automatic removal: a second worker/crashed append cannot append again.
  if(!immutable(pendingPath+'.claim',raw))throw Error('save outcome unresolved; original retained');
  const chunks=Array.from(raw),children=[{object:'block',type:'paragraph',paragraph:{rich_text:rt(new Date().toISOString()+' · Clarity Share · '+key)}}];
  for(let i=0;i<chunks.length;i+=1800)children.push({object:'block',type:'paragraph',paragraph:{rich_text:rt(chunks.slice(i,i+1800).join(''))}});
  children.push({object:'block',type:'divider',divider:{}});
  await api('/blocks/'+INBOX+'/children','PATCH',{children});
  ids=matching(await readInbox(),key,raw);
  if(!ids)throw Error('saved capture not read back');
  const result={status:'YOS_INBOX_SAVED',captureId:key,duplicate:false,blockIds:ids,classification:'existing-route-unverified'};
  checkedWrite(pendingPath+'.receipt.json',JSON.stringify(result));
  return result;
}
try{Script.setShortcutOutput(JSON.stringify(await main()));}
catch{
  Script.setShortcutOutput('YOS_SCREENSHOT_HOLD');
  let notify=true;
  if(pendingPath){try{notify=immutable(pendingPath+'.notified','failure');}catch{notify=false;}}
  if(notify){const n=new Notification();n.title='YOS｜スクショ保存を保留';n.body='保存を確認できません。元のスクショと読み取った文字は削除せず、自動再送を止めています。';await n.schedule();}
}
Script.complete();

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
