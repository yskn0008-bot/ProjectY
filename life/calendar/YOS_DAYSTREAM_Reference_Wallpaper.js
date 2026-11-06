// YOS LIFE FLOW — exact supplied image, static design foundation only.
/* Literal reference-image viewport. No recreated typography, cards or effects. */
(function(root){
 'use strict';
 function geometry(ref,width){
  const c=ref.crop;
  if(!Number.isFinite(width)||width<=0||!c||c.x<0||c.y<0||c.width<=0||c.height<=0||c.x+c.width>ref.sourceWidth||c.y+c.height>ref.sourceHeight)throw Error('Invalid reference viewport');
  const scale=width/c.width;
  return {width,height:c.height*scale,imageWidth:ref.sourceWidth*scale,imageHeight:ref.sourceHeight*scale,left:-c.x*scale,top:-c.y*scale,scale};
 }
 function html(ref,dataURL){
  if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataURL))throw Error('Invalid image data');
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>YOS LIFE FLOW｜静止画の土台</title><style>*{box-sizing:border-box}html,body{margin:0;background:#f5f6fb}#reference{position:relative;width:100%;overflow:hidden}#source{position:absolute;max-width:none;pointer-events:none;user-select:none;-webkit-user-select:none}body{overflow-x:hidden}</style></head><body><main id="reference" aria-label="指定画像そのままの静止画。時刻・予定・効果表示は画像内の見本です。"><img id="source" draggable="false" alt="YOS LIFE FLOWの指定デザイン原本。今回は静止画の土台です。" src="'+dataURL+'"></main><script>const ref='+JSON.stringify(ref)+';const geometry='+geometry.toString()+';const frame=document.getElementById("reference"),image=document.getElementById("source");function layout(){const g=geometry(ref,document.documentElement.clientWidth);frame.style.height=g.height+"px";image.style.width=g.imageWidth+"px";image.style.height=g.imageHeight+"px";image.style.left=g.left+"px";image.style.top=g.top+"px"}layout();addEventListener("resize",layout);</script></body></html>';
 }
 const api={geometry,html};root.YOSReferenceWallpaper=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

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
const REFERENCE_IMAGES={"glass": {"file": "design/reference-glass-original.jpeg", "sourceWidth": 1199, "sourceHeight": 1312, "crop": {"x": 45, "y": 87, "width": 557, "height": 1135}, "sha256": "666692a535a28ac283be8feec193b5495ce40e19b955a65d5001af03ad4ef1c9", "bytes": 405642, "url": "https://raw.githubusercontent.com/yskn0008-bot/ProjectY/bd67b996c0da7e54e99b7a3528c2a3233e329c6b/life/calendar/design/reference-glass-original.jpeg", "base64SHA256": "4f5aaeaeccc4fad1fef5df96a9390ff9d0ad31b6252b5773d59bec662df9ed89"}, "compact": {"file": "design/reference-compact-original.jpeg", "sourceWidth": 1214, "sourceHeight": 1295, "crop": {"x": 28, "y": 68, "width": 338, "height": 797}, "sha256": "89ab70c02ebe7ce7ff406f29ad1d57ffe85ee9bc703d04ec7ad93d11cc796a69", "bytes": 480879, "url": "https://raw.githubusercontent.com/yskn0008-bot/ProjectY/bd67b996c0da7e54e99b7a3528c2a3233e329c6b/life/calendar/design/reference-compact-original.jpeg", "base64SHA256": "83adfe30a70802bcd3082e89cf6c81a194929f4f001573f3ac3f8da731ee2ecd"}};
try{
 const kind=(typeof args!=='undefined'&&(args.shortcutParameter==='compact'||args.queryParameters?.reference==='compact'))?'compact':'glass';
 const ref=REFERENCE_IMAGES[kind],request=new Request(ref.url);request.timeoutInterval=30;
 const data=await request.load();
 if(request.response?.statusCode!==200)throw Error('原本画像を取得できませんでした');
 const encoded=data.toBase64String();
 if(sha256Hex(encoded)!==ref.base64SHA256)throw Error('原本画像の内容を確認できませんでした');
 const web=new WebView();await web.loadHTML(YOSReferenceWallpaper.html(ref,'data:image/jpeg;base64,'+encoded));await web.present(true);
}catch(e){const alert=new Alert();alert.title='LIFE FLOW 画像の表示';alert.message=String(e.message||e);alert.addAction('閉じる');await alert.presentAlert();}finally{Script.complete();}
