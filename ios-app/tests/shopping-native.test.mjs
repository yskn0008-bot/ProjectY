import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT=new URL('../',import.meta.url);
const CODE=fs.readFileSync(new URL('scriptable/YOS Shopping.js',ROOT),'utf8');
const HTML=fs.readFileSync(new URL('../yos/shopping/index.html',ROOT),'utf8');
const CSS=fs.readFileSync(new URL('../yos/shopping/shopping.css',ROOT),'utf8');
const JS=fs.readFileSync(new URL('../yos/shopping/shopping.js',ROOT),'utf8');
const ID='42a5ca88289581a4b66ae9a3ad05c363';
const NOW='2026-11-19T10:00:00.000Z';

function row(opts={}){
 const item={
  id:ID,archived:false,last_edited_time:NOW,
  parent:{type:'data_source_id',data_source_id:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc'},
  cover:{type:'external',external:{url:'https://example.com/real-photo.png'}},
  properties:{
   商品名:{title:[{plain_text:'テスト用 洗顔 120g'}]},
   区分:{select:{name:'欲しいもの'}},
   分類:{select:{name:'美容'}},
   買い物状態:{select:{name:'検討中'}},
   購入済:{checkbox:false},
   現在価格:{number:null},参考価格:{number:1980},目標価格:{number:1500},
   価格更新日:{date:null},価格情報元:{select:null},
   販売店:{multi_select:[{name:'Amazon'}]},
   商品URL:{url:'https://example.com/product'},
   在庫数:{number:null},補充基準:{number:null}
  }
 };
 return Object.assign(item,opts);
}
async function run(config={}){
 const log={urls:[],requests:[],alerts:[],pages:[],completed:false};
 const pages=config.pages||[row()];
 const token=config.token===false?'':'scriptable-private-notion-token';
 const id=ID;
 class MockRequest{
  constructor(url){this.url=url;this.body='';this.headers={};this.method='GET';this.response=null;log.urls.push(url)}
  async loadJSON(){
   log.requests.push({url:this.url,method:this.method,headers:this.headers,body:this.body});
   this.response={statusCode:200,url:this.url};
   if(config.autoPhotos&&this.url.includes('commons.wikimedia.org/w/api.php')){
    if(config.commonsPhotos)return {query:{pages:{
      17:{title:'File:Toilet_paper_rolls.jpg',imageinfo:[{mime:'image/jpeg',
        thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Toilet_paper_rolls.jpg',
        descriptionurl:'https://commons.wikimedia.org/wiki/File:Toilet_paper_rolls.jpg'}]}
    }}};
    return {query:{pages:{}}};
   }
   if(this.url.includes('/data_sources/')&&this.url.endsWith('/query'))
    return {results:pages,has_more:false};
   if(this.url.endsWith('/pages/'+id)){
    if(this.method==='PATCH'){
      const patch=JSON.parse(this.body);
      if(patch.properties)for(const [key,value] of Object.entries(patch.properties))pages[0].properties[key]=value;
      if(patch.cover)pages[0].cover=patch.cover;
      pages[0].last_edited_time='2026-11-19T10:01:00.000Z';
    }
    return pages[0];
   }
   if(this.url.endsWith('/pages')&&this.method==='POST'){
     const request=JSON.parse(this.body);
     const name=request.properties['商品名'].title[0].text.content;
     if(pages.some(p=>p.properties.商品名.title[0].plain_text===name))
       throw Error('duplicate write should never happen');
     const created=row({id:'5'.repeat(32),last_edited_time:'2026-11-19T10:02:00.000Z',
       properties:{...pages[0].properties,商品名:{title:[{plain_text:name}]}}});
     pages.push(created);return created;
   }
   if(this.url.endsWith('/pages/'+'5'.repeat(32)))return pages[1];
   throw Error('unexpected Notion path '+this.url);
  }
  async loadString(){
   this.response={statusCode:config.assetFailure?500:200};
   if(this.url.endsWith('/index.html'))return HTML;
   if(this.url.endsWith('/shopping.css'))return CSS;
   if(this.url.endsWith('/shopping.js'))return JS;
   if(config.autoPhotos&&config.priceOffer&&this.url.includes('www.muji.com')){
    return '<html><head><script type="application/ld+json">'+JSON.stringify({
      '@context':'https://schema.org','@type':'Product',
      name:config.priceWrongItem?'無印良品 化粧水 150g':'無印良品 マイルドジェルクレンジング 150g',
      offers:config.priceAggregate?{'@type':'AggregateOffer',priceCurrency:'JPY',lowPrice:'330',highPrice:'690'}:{
        '@type':'Offer',price:config.priceValue||'690',
        priceCurrency:config.priceCurrency||'JPY',
        ...(config.priceExpired?{priceValidUntil:'2020-01-01'}:{})
      }
    })+'</script></head><body>マイルドジェルクレンジング 150g 価格情報</body></html>';
   }
   if(config.autoPhotos&&config.jsonLdOnly&&this.url.includes('www.muji.com')){
    return '<html><head><meta property="og:title" content="無印良品 公式ネットストア">'+
      '<meta property="og:image" content="https://www.muji.com/img/brand-logo.jpg">'+
      '<script type="application/ld+json">'+JSON.stringify({
        '@context':'https://schema.org','@type':'Product',
        name:config.badVariant?'無印良品 化粧水 150g':'無印良品 マイルドジェルクレンジング 150g',
        image:'https://www.muji.com/img/cleansing-gel-150g.jpg'
      })+'</script></head><body>化粧水 ジェルクレンジング 150g 商品一覧</body></html>';
   }
   if(config.autoPhotos&&this.url.includes('www.muji.com')){
    return '<html><head><meta property="og:title" content="'+(config.badTitle?'関係ない商品':'無印良品 マイルドジェルクレンジング')+
      '"><meta property="og:image" content="https://www.muji.com/img/product-photo.jpg"></head><body>商品写真 150g ジェルクレンジング 商品情報</body></html>';
   }
   if(config.autoPhotos&&this.url.includes('www.shop.rohto.co.jp')){
    return '<html><head><meta property="og:title" content="スキンアクア スーパーモイスチャーUVジェル 110g">'+
      '<meta property="og:image" content="https://www.shop.rohto.co.jp/img/product-190850.jpg"></head><body>商品写真 110g ロート公式商品情報</body></html>';
   }
   throw Error('Unexpected static asset '+this.url);
  }
  async loadImage(){
   log.requests.push({url:this.url,method:'IMAGE',headers:this.headers});
   if(config.failImages)throw Error('Network image unavailable');
   this.response={statusCode:200,mimeType:'image/jpeg',url:this.url};
   return {size:{width:320,height:400}};
  }
 }
 class MockAlert{
  constructor(){this.title='';this.message='';this.actions=[];this.fields=[]}
  addAction(label){this.actions.push(label)}
  addCancelAction(label){this.actions.push(label)}
  addTextField(label,defaultValue){this.fields.push({label,defaultValue})}
  textFieldValue(index){return config.fields?.[index]??''}
  async presentAlert(){log.alerts.push({title:this.title,message:this.message,actions:this.actions});
   return typeof config.choice==='number'?config.choice:0}
 }
 const sandbox={
  Request:MockRequest,Alert:MockAlert,URL,Date,Intl,
  Keychain:{contains:()=>Boolean(token),get:()=>token},
  args:{queryParameters:config.query||{}},
  WebView:{loadHTML:async(html,...rest)=>{log.pages.push(html);assert.equal(rest.at(-1),true)}},
  Script:{complete(){log.completed=true}},
  console
 };
 if(config.autoPhotos){
  const files=config.storage||new Map();
  const fakeImage=Buffer.from('mock-local-jpeg-image-data').toString('base64');
  sandbox.FileManager={local:()=>({
    libraryDirectory:()=>'/local',
    joinPath:(base,name)=>base+'/'+name,
    fileExists:path=>files.has(path),
    createDirectory:path=>files.set(path,{dir:true}),
    write:(path,value)=>files.set(path,value),
    read:path=>files.get(path),
    readString:path=>files.get(path),
    writeString:(path,value)=>files.set(path,value)
  })};
  sandbox.Data={fromJPEG:()=>({toBase64String:()=>fakeImage})};
  sandbox.DrawContext=class{
   set size(x){this._size=x}
   set opaque(x){}
   set respectScreenScale(x){}
   setFillColor(){}
   fillRect(){}
   drawImageInRect(){}
   getImage(){return {size:this._size}}
  };
  sandbox.Color={white:()=>({})};
  sandbox.Size=class {constructor(width,height){this.width=width;this.height=height}};
  sandbox.Rect=class {constructor(x,y,w,h){Object.assign(this,{x,y,w,h})}};
 }

 await vm.runInNewContext('(async()=>{'+CODE+'\n})()',sandbox,{timeout:10000});
 return {log,pages};
}

test('Scriptable shopping uses native Keychain and Notion without Vercel or leaking a token',async()=>{
 const {log}=await run();
 assert.equal(log.pages.length,1);
 assert.match(log.pages[0],/テスト用 洗顔 120g/);
 assert.match(log.pages[0],/example.com\/real-photo.png/);
 assert.match(log.pages[0],/yos-shopping-local-v1/);
 assert.match(log.pages[0],/<html lang="ja" class="scriptable-native">/);
 assert.doesNotMatch(log.pages[0],/scriptable-private-notion-token/);
 assert.doesNotMatch(log.pages[0],/project-y-yos-ai\.vercel\.app/);
 assert.ok(log.urls.every(u=>u.startsWith('https://api.notion.com/')||u.startsWith('https://raw.githubusercontent.com/')));
 assert.ok(log.requests.every(x=>x.headers.Authorization==='Bearer scriptable-private-notion-token'));
 assert.equal(log.completed,true);
});

test('missing native token shows safe error and never retrieves data',async()=>{
 const {log}=await run({token:false});
 assert.equal(log.pages.length,0);
 assert.equal(log.urls.length,0);
 assert.match(log.alerts[0].title,/未接続/);
});

test('stale edit token rejects purchase without a Notion PATCH',async()=>{
 const {log}=await run({query:{action:'purchase',id:ID,expectedEditedAt:'2026-10-01T00:00:00.000Z'}});
 assert.equal(log.pages.length,0);
 assert.equal(log.requests.some(x=>x.method==='PATCH'),false);
 assert.match(log.alerts[0].message,/更新|変更/);
});

test('explicit purchase confirmation updates Notion and checks readback',async()=>{
 const {log,pages}=await run({query:{action:'purchase',id:ID,expectedEditedAt:NOW}});
 assert.equal(log.requests.filter(x=>x.method==='PATCH').length,1);
 assert.equal(pages[0].properties.購入済.checkbox,true);
 assert.equal(log.pages.length,1);
 assert.match(log.pages[0],/"purchased":true/);
});

test('cancelled purchase leaves the original Notion record untouched',async()=>{
 const {log,pages}=await run({query:{action:'purchase',id:ID,expectedEditedAt:NOW},choice:-1});
 assert.equal(log.requests.filter(x=>x.method==='PATCH').length,0);
 assert.equal(pages[0].properties.購入済.checkbox,false);
});

test('existing item is protected against duplicate creation',async()=>{
 const {log}=await run({query:{action:'add'},fields:['テスト用 洗顔 120g','https://example.com/product','']});
 assert.equal(log.requests.some(x=>x.method==='POST'&&x.url.endsWith('/pages')),false);
 assert.match(log.alerts.at(-1).message,/重複登録/);
});

test('unavailable interface assets do not cause Notion writes or fabricated data',async()=>{
 const {log}=await run({assetFailure:true});
 assert.equal(log.pages.length,0);
 assert.equal(log.requests.filter(x=>x.method==='PATCH').length,0);
 assert.match(log.alerts[0].message,/検証できません/);
});

test('shopping HTML uses the requested compact 2-column photo cards',()=>{
 assert.match(CSS,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(HTML,/id="productGrid"/);
 assert.match(JS,/値引き候補/);
 assert.match(JS,/open\.scriptable\.app\/run/);
 assert.doesNotMatch(JS,/\.vercel\.app|Authorization:|google\.accounts/);
 assert.doesNotThrow(()=>new Function(JS));
});


test('reference price stays reference, and candidate status is separate from confirmed buying time',()=>{
 assert.match(JS,/参考 '\+yen\(item.referencePrice\)/);
 assert.match(JS,/selected=item=>/);
 assert.match(JS,/\bitem\.state==='購入候補'/);
 assert.match(JS,/product-heading-row/);
 assert.match(CSS,/\.product-heading-row/);
 assert.match(CSS,/-webkit-line-clamp:3/);
 assert.match(JS,/値引き候補/);
});

test('native item editor updates current price only after confirmation, and verifies Notion readback',async()=>{
 const {log,pages}=await run({
  query:{action:'edit',id:ID,expectedEditedAt:NOW},
  fields:['1680','','1350','2','1']
 });
 const patches=log.requests.filter(x=>x.method==='PATCH');
 assert.equal(patches.length,1);
 const body=JSON.parse(patches[0].body);
 assert.equal(body.properties.現在価格.number,1680);
 assert.equal(body.properties.目標価格.number,1350);
 assert.equal(body.properties.在庫数.number,2);
 assert.equal(body.properties.補充基準.number,1);
 assert.equal(body.properties.価格情報元.select.name,'手動');
 assert.equal(pages[0].properties.現在価格.number,1680);
 assert.equal(log.pages.length,1);
 assert.match(log.pages[0],/"currentPrice":1680/);
});

test('native price edit cannot update stale item and does not write',async()=>{
 const {log}=await run({query:{action:'edit',id:ID,expectedEditedAt:'2026-01-01T00:00:00.000Z'},fields:['100']});
 assert.equal(log.requests.some(x=>x.method==='PATCH'),false);
 assert.match(log.alerts.at(-1).message,/更新/);
});

test('native price edit rejects malformed money and preserves record',async()=>{
 const {log,pages}=await run({query:{action:'edit',id:ID,expectedEditedAt:NOW},fields:['abc']});
 assert.equal(log.requests.some(x=>x.method==='PATCH'),false);
 assert.equal(pages[0].properties.現在価格.number,null);
 assert.match(log.alerts.at(-1).message,/数字/);
});

test('native photo picker requires Scriptable Photos permission; no Notion image upload',async()=>{
 const {log}=await run({query:{action:'photo',id:ID,expectedEditedAt:NOW}});
 assert.equal(log.requests.some(x=>x.method==='PATCH'),false);
 assert.match(log.alerts.at(-1).message,/写真を追加できる/);
});

test('purchased candidate count is distinct from confirmed sale and price buy timing',()=>{
 assert.match(HTML,/id="recommendReason"/);
 assert.match(HTML,/data-filter="selected"/);
 assert.match(HTML,/id="chipSelectedCount"/);
 assert.match(JS,/case 'selected':return selected\(item\)/);
 assert.match(JS,/const selectedCount=count\(selected\)/);
 assert.match(JS,/購入候補\$\{selectedCount\}件を含む/);
 assert.match(JS,/const buy=item=>/);
 assert.match(JS,/recentPrice\(item\)/);
 // 22:26 iPhone screenshot: 6px/8px overrides put Shopping behind Close and status bar.
 assert.match(CSS,/\.shopping-app\{[^}]*env\(safe-area-inset-top\)/);
 assert.doesNotMatch(CSS,/html\.scriptable-native\s+\.shopping-app\s*\{[^}]*padding-top\s*:/);
 assert.doesNotMatch(CSS,/@media[^}]*\}\s*html\.scriptable-native\s+\.shopping-app\s*\{[^}]*padding-top\s*:/);
 assert.doesNotThrow(()=>new Function(JS));
});


test('automatic product photo is downloaded, cached and reused with zero image requests on second open',async()=>{
 const storage=new Map();
 const first=await run({autoPhotos:true,storage});
 assert.equal(first.log.pages.length,1);
 assert.match(first.log.pages[0],/data:image\/jpeg;base64/);
 assert.equal(first.log.requests.filter(x=>x.method==='IMAGE').length,1);
 assert.ok([...storage.keys()].some(k=>k.endsWith('/'+ID+'.jpg')));
 assert.doesNotMatch(first.log.pages[0],/scriptable-private-notion-token/);
 const again=await run({autoPhotos:true,storage});
 assert.equal(again.log.pages.length,1);
 assert.equal(again.log.requests.filter(x=>x.method==='IMAGE').length,0);
 assert.match(again.log.pages[0],/data:image\/jpeg;base64/);
});

test('blocked image download does not replace existing Notion cover or mislabel an unknown item',async()=>{
 const storage=new Map();
 const first=await run({autoPhotos:true,storage,failImages:true});
 assert.equal(first.log.pages.length,1);
 assert.equal(first.log.requests.filter(x=>x.method==='PATCH').length,0);
 assert.doesNotMatch(first.log.pages[0],/data:image\/jpeg;base64/);
 const second=await run({autoPhotos:true,storage,failImages:true});
 assert.equal(second.log.requests.filter(x=>x.method==='IMAGE').length,0,'negative cache avoids repeat network delays');
});

test('exact official product page can supply cover only after matching product title',async()=>{
 const muji=row({
  cover:null,
  properties:{...row().properties,
   商品名:{title:[{plain_text:'無印良品 マイルドジェルクレンジング 150g'}]},
   商品URL:{url:'https://www.muji.com/jp/ja/store/cmdty/detail/4550583941178'}
  }
 });
 const storage=new Map();
 const {log,pages}=await run({autoPhotos:true,storage,pages:[muji]});
 const coverRequests=log.requests.filter(x=>x.url.endsWith('/pages/'+ID)&&x.method==='PATCH');
 assert.equal(coverRequests.length,1);
 assert.match(JSON.stringify(coverRequests[0].body),/product-photo\.jpg/);
 assert.equal(pages[0].cover.external.url,'https://www.muji.com/img/product-photo.jpg');
 assert.match(log.pages[0],/data:image\/jpeg;base64/);
 assert.ok([...storage.keys()].some(k=>k.endsWith('/'+ID+'.jpg')));
});

test('incorrect product title does not overwrite Notion or invent an exact product photo',async()=>{
 const muji=row({
  cover:null,
  properties:{...row().properties,
   商品名:{title:[{plain_text:'無印良品 マイルドジェルクレンジング 150g'}]},
   商品URL:{url:'https://www.muji.com/jp/ja/store/cmdty/detail/4550583941178'}
  }
 });
 const {log,pages}=await run({autoPhotos:true,pages:[muji],badTitle:true});
 assert.equal(log.requests.filter(x=>x.method==='PATCH').length,0);
 assert.equal(pages[0].cover,null);
 assert.doesNotMatch(log.pages[0],/data:image\/jpeg;base64/);
});

test('category imagery is marked as representative and must never be written to Notion cover',()=>{
 assert.match(CODE,/kind:'representative'/);
 assert.match(CODE,/notionCover:false/);
 assert.match(CODE,/if\(result\.coverUrl\)pendingWrites\.push/);
 assert.match(CODE,/PHOTO_MAX_NEW_PER_OPEN=8/);
 assert.match(JS,/参考写真/);
 assert.match(JS,/カテゴリの参考画像（実商品とは異なります）/);
 assert.match(CSS,/reference-photo-label/);
 assert.doesNotThrow(()=>new vm.Script('(async()=>{'+CODE+'\n})()'));
});


test('generic toilet-paper row uses a clearly labeled Commons representative photo and never changes Notion',async()=>{
 const basic=row({cover:null,properties:{...row().properties,
   商品名:{title:[{plain_text:'トイレットペーパー'}]},商品URL:{url:null},分類:{select:{name:'衛生'}}
 }});
 const storage=new Map();
 const {log,pages}=await run({autoPhotos:true,commonsPhotos:true,pages:[basic],storage});
 assert.equal(log.requests.filter(x=>x.method==='PATCH').length,0);
 assert.equal(pages[0].cover,null);
 assert.match(log.pages[0],/data:image\/jpeg;base64/);
 assert.match(log.pages[0],/参考写真/);
 assert.match(log.pages[0],/カテゴリの参考画像/);
 const reloaded=await run({autoPhotos:true,commonsPhotos:true,pages:[basic],storage});
 assert.equal(reloaded.log.requests.filter(x=>x.method==='IMAGE').length,0);
 assert.equal(reloaded.log.requests.filter(x=>x.url.includes('commons.wikimedia.org/w/api.php')).length,0);
});

test('official exact Rohto product within /category/ is eligible for validated image acquisition',async()=>{
 const rohto=row({cover:null,properties:{...row().properties,
  商品名:{title:[{plain_text:'スキンアクア スーパーモイスチャーUVジェル 110g'}]},
  商品URL:{url:'https://www.shop.rohto.co.jp/category/skincare/skin-aqua/super-moisture/190850.html'}
 }});
 const {log,pages}=await run({autoPhotos:true,pages:[rohto]});
 assert.equal(log.requests.filter(x=>x.method==='IMAGE').length,1);
 assert.match(log.pages[0],/data:image\/jpeg;base64/);
 assert.equal(pages[0].cover.external.url,'https://www.shop.rohto.co.jp/img/product-190850.jpg');
});


test('Product JSON-LD supplies exact image even when og:title and og:image are store-wide',async()=>{
 const muji=row({cover:null,properties:{...row().properties,
  商品名:{title:[{plain_text:'無印良品 マイルドジェルクレンジング 150g'}]},
  商品URL:{url:'https://www.muji.com/jp/ja/store/cmdty/detail/4550583941178'}
 }});
 const {log,pages}=await run({autoPhotos:true,pages:[muji],jsonLdOnly:true});
 assert.equal(log.requests.filter(x=>x.method==='IMAGE').length,1);
 assert.equal(pages[0].cover.external.url,'https://www.muji.com/img/cleansing-gel-150g.jpg');
 assert.doesNotMatch(log.pages[0],/brand-logo\.jpg/);
});
test('schema.org JSON-LD for a different product must be rejected despite identical brand and JAN page URL',async()=>{
 const muji=row({cover:null,properties:{...row().properties,
  商品名:{title:[{plain_text:'無印良品 マイルドジェルクレンジング 150g'}]},
  商品URL:{url:'https://www.muji.com/jp/ja/store/cmdty/detail/4550583941178'}
 }});
 const {log,pages}=await run({autoPhotos:true,pages:[muji],jsonLdOnly:true,badVariant:true});
 assert.equal(log.requests.filter(x=>x.method==='IMAGE').length,0);
 assert.equal(log.requests.filter(x=>x.method==='PATCH').length,0);
 assert.equal(pages[0].cover,null);
});
test('legacy 48-hour negative cache retries with new resolver then pauses repeated failures',async()=>{
 const muji=row({cover:null,properties:{...row().properties,
  商品名:{title:[{plain_text:'無印良品 マイルドジェルクレンジング 150g'}]},
  商品URL:{url:'https://www.muji.com/jp/ja/store/cmdty/detail/4550583941178'}
 }});
 const sig='無印良品 マイルドジェルクレンジング 150g|https://www.muji.com/jp/ja/store/cmdty/detail/4550583941178|';
 const file='/local/YOS Shopping Auto Photos/manifest-v1.json';
 const storage=new Map([[file,JSON.stringify({version:1,entries:{[ID]:{signature:sig,failedAt:Date.now()}}})]]);
 const first=await run({autoPhotos:true,pages:[muji],storage,failImages:true});
 assert.equal(first.log.requests.filter(x=>x.method==='IMAGE').length,1,'new resolver retries old negative cache');
 assert.match(first.log.pages[0],/再検索予定/);
 const second=await run({autoPhotos:true,pages:[muji],storage,failImages:true});
 assert.equal(second.log.requests.filter(x=>x.method==='IMAGE').length,0,'same resolver caches failed attempt');
});
test('no longer misleadingly claims images are actively being searched after page is rendered',()=>{
 assert.doesNotMatch(JS,/写真を自動検索中/);
 assert.match(JS,/item\.photoStatus\|\|'写真未取得'/);
 assert.match(CODE,/PHOTO_RESOLVER_VERSION=2/);
});


test('source-linked JPY listing is visible but never promoted to a Notion current price or discount',async()=>{
 const muji=row({cover:null,properties:{...row().properties,
   商品名:{title:[{plain_text:'無印良品 マイルドジェルクレンジング 150g'}]},
   商品URL:{url:'https://www.muji.com/jp/ja/store/cmdty/detail/4550583941178'},
   現在価格:{number:null},参考価格:{number:690},目標価格:{number:600}
 }});
 const storage=new Map();
 const first=await run({autoPhotos:true,storage,pages:[muji],priceOffer:true});
 assert.match(first.log.pages[0],/"webPrice":690/);
 assert.match(first.log.pages[0],/"webPriceStatus":"public-listing"/);
 assert.match(first.log.pages[0],/"webPriceFresh":true/);
 assert.match(first.log.pages[0],/Web掲載/);
 assert.match(first.log.pages[0],/掲載元を確認/);
 assert.equal(first.log.requests.filter(x=>x.method==='PATCH').length,0);
 assert.equal(muji.properties.現在価格.number,null);
 const second=await run({autoPhotos:true,storage,pages:[muji],priceOffer:true});
 const network=second.log.urls.filter(x=>x.startsWith('https://www.muji.com'));
 assert.equal(network.length,0,'cached price and failed photo must not trigger repeated manufacturer requests');
 assert.match(second.log.pages[0],/"webPrice":690/);
});
test('rejects mismatched, wrong currency, AggregateOffer and expired listing without Notion writes',async()=>{
 const muji=row({cover:null,properties:{...row().properties,
  商品名:{title:[{plain_text:'無印良品 マイルドジェルクレンジング 150g'}]},
  商品URL:{url:'https://www.muji.com/jp/ja/store/cmdty/detail/4550583941178'}
 }});
 for(const invalid of [{priceWrongItem:true},{priceCurrency:'USD'},{priceAggregate:true},{priceExpired:true}]){
  const {log}=await run({autoPhotos:true,pages:[muji],priceOffer:true,...invalid});
  assert.doesNotMatch(log.pages[0],/"webPrice":/);
  assert.equal(log.requests.filter(x=>x.method==='PATCH').length,0);
 }
});
test('browser-only preview remains clearly labeled and real-data evidence is displayed separately',()=>{
 assert.match(HTML,/id="dataHealth"/);
 assert.match(HTML,/確認する商品/);
 assert.match(JS,/商品URL .*?24時間内のWeb掲載/s);
 assert.match(JS,/state\.demo\?/);
 assert.match(JS,/Web掲載/);
 assert.match(JS,/過去の登録/);
 assert.match(JS,/登録価格差/);
 assert.match(CODE,/PRICE_OBSERVATION_LIMIT=4/);
 assert.match(CODE,/PRICE_OBSERVATION_TTL=24\*60\*60\*1000/);
 assert.match(CODE,/async function enrichShoppingPrices/);
 assert.doesNotThrow(()=>new Function(JS));
 assert.doesNotThrow(()=>new vm.Script('(async()=>{'+CODE+'\n})()'));
});
