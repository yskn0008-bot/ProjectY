// Variables used by Scriptable.
// icon-color: pink; icon-glyph: shopping-bag;
// YOS_SCRIPT_NAME: YOS Shopping
// Local-first Shopping UI: GitHub visual assets + native Notion API.
// No Vercel, Google login, public personal-data export, or new server.
// A Notion token is read exclusively from the existing Scriptable Keychain.
'use strict';
const NAME='YOS Shopping';
const NOTION_KEY='YOS_NOTION_INTEGRATION_TOKEN';
const SOURCE='d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc';
const VERSION='2026-03-11';
const UI_REF='021c65b7b50e55668a595cd45e8a9eb28751acd7';
const ASSETS='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/'+UI_REF+'/yos/shopping/';
const CATEGORIES=new Set(['食品','洗濯','掃除','衛生','美容','家電','家具','その他']);
const clean=(v,max=180)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const id32=x=>clean(x,45).replace(/-/g,'').toLowerCase();
const validId=x=>/^[0-9a-f]{32}$/.test(id32(x));
const prop=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const rich=(p,key)=>Array.isArray(prop(p)[key])?clean(p[key].map(v=>v?.plain_text||v?.text?.content||'').join(''),160):'';
const select=p=>clean(p?.select?.name,64);
const num=p=>Number.isFinite(p?.number)&&p.number>=0?p.number:null;
const date=p=>clean(p?.date?.start,70)||null;
function safeHttps(v){
 const s=clean(v,1600);if(!s||s.length>1500||!/^https:\/\//i.test(s))return null;
 // Scriptable's native JavaScript environment need not implement browser URL.
 const authority=s.slice(8).split(/[/?#]/,1)[0];
 if(!/^[a-z0-9.-]+(?::443)?$/i.test(authority)||authority.includes('..')||!authority.includes('.'))return null;
 return s;
}
function project(row){
 if(!row||row.archived||row.in_trash||!validId(row.id)||!row.properties)return null;
 const p=row.properties;
 const name=rich(p['商品名'],'title');if(!name)return null;
 const shops=Array.isArray(p['販売店']?.multi_select)?p['販売店'].multi_select.map(v=>clean(v?.name,80)).filter(Boolean):[];
 const cover=prop(row.cover);
 return {
  id:id32(row.id),name,category:select(p['分類']),type:select(p['区分']),
  state:select(p['買い物状態']),priority:select(p['優先度']),
  purchased:p['購入済']?.checkbox===true||select(p['買い物状態'])==='購入済',
  currentPrice:num(p['現在価格']),referencePrice:num(p['参考価格']),targetPrice:num(p['目標価格']),
  priceSource:select(p['価格情報元']),priceUpdatedAt:date(p['価格更新日']),
  shop:shops,url:safeHttps(p['商品URL']?.url),
  imageUrl:safeHttps(cover.file?.url)||safeHttps(cover.external?.url),
  stock:num(p['在庫数']),reorderAt:num(p['補充基準']),
  updatedAt:clean(row.last_edited_time,80)||null,
  memo:rich(p['メモ'],'rich_text')
 };
}
async function notion(token,path,method='GET',body=null){
 if(!token||token.length<10)throw Error('Notion接続情報がありません');
 const req=new Request('https://api.notion.com/v1/'+path);
 req.method=method;req.timeoutInterval=20;
 req.headers={Authorization:'Bearer '+token,'Notion-Version':VERSION,'Content-Type':'application/json',Accept:'application/json'};
 if(body!==null)req.body=JSON.stringify(body);
 let data;
 try{data=await req.loadJSON()}catch{throw Error('Notionから応答を読み取れません')}
 const code=req.response?.statusCode;
 if(code<200||code>=300)throw Error('Notion HTTP '+(code||'不明')+'。通信・接続権限を確認してください');
 if(!data||typeof data!=='object')throw Error('Notionの形式が不正です');
 return data;
}
async function list(token){
 let cursor=null;
 const result=[],seen=new Set();
 for(let i=0;i<4;i++){
  const data=await notion(token,'data_sources/'+SOURCE+'/query','POST',{page_size:100,...(cursor?{start_cursor:cursor}:{})});
  if(!Array.isArray(data.results)||typeof data.has_more!=='boolean')throw Error('Notionの一覧形式が不正です');
  for(const row of data.results){
   if(!validId(row?.id)||seen.has(id32(row.id)))throw Error('商品IDが不正・重複しています');
   seen.add(id32(row.id));const item=project(row);
   if(item)result.push(item);
  }
  if(!data.has_more)return result;
  const next=clean(data.next_cursor,200);
  if(!next||next===cursor)throw Error('Notionの取得続きを確認できません');
  cursor=next;
 }
 throw Error('400件を超えたため、一部だけの表示はしません');
}
function tokyoDay(){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
async function info(title,message){
 const a=new Alert();a.title=title;a.message=message;a.addAction('閉じる');await a.presentAlert();
}
async function add(token,known){
 const a=new Alert();
 a.title='YOS Shopping｜商品を追加';
 a.message='既存Notionに追加します。画像URLは省略できます。';
 a.addTextField('商品名（必須）','');
 a.addTextField('販売ページURL（任意）','');
 a.addTextField('写真URL（任意）','');
 a.addAction('追加する');a.addCancelAction('キャンセル');
 if(await a.presentAlert()!==0)return 'cancel';
 const name=clean(a.textFieldValue(0),120);
 const rawUrl=clean(a.textFieldValue(1),1550);
 const rawPhoto=clean(a.textFieldValue(2),1550);
 const url=rawUrl?safeHttps(rawUrl):null,photo=rawPhoto?safeHttps(rawPhoto):null;
 if(!name||name.length>120||rawUrl&&!url||rawPhoto&&!photo)
  throw Error('商品名とHTTPS URLを確認してください。未登録です');
 if(known.some(x=>x.name===name&&(url?x.url===url:!x.url)))
  throw Error('同名・同URLの商品が存在します。重複登録を中止しました');
 const row=await notion(token,'pages','POST',{
  parent:{type:'data_source_id',data_source_id:SOURCE},
  properties:{
   '商品名':{title:[{text:{content:name}}]},
   '区分':{select:{name:'欲しいもの'}},
   '分類':{select:{name:'その他'}},
   '買い物状態':{select:{name:'検討中'}},
   '購入済':{checkbox:false},
   '入力日':{date:{start:tokyoDay()}},
   ...(url?{'商品URL':{url}}:{})
  },
  ...(photo?{cover:{type:'external',external:{url:photo}}}:{})
 });
 if(!validId(row.id))throw Error('Notion登録の結果が不明です。再試行前に原本を確認してください');
 const saved=await notion(token,'pages/'+id32(row.id));
 if(id32(saved.parent?.data_source_id)!==SOURCE.replace(/-/g,'')||project(saved)?.name!==name)
  throw Error('Notion登録後の読戻し未確認。原本の確認が必要です');
 return 'added';
}
async function purchase(token,query){
 const id=id32(query.id),expected=clean(query.expectedEditedAt,80);
 if(!validId(id)||!expected)throw Error('購入済み更新の識別情報が不正です');
 const path='pages/'+id;
 const row=await notion(token,path);
 if(id32(row.parent?.data_source_id)!==SOURCE.replace(/-/g,''))
  throw Error('既存YOS Shoppingの商品以外は変更できません');
 const item=project(row);
 if(!item)throw Error('商品名・Notion情報を確認できません');
 if(item.purchased)return 'already';
 if(item.updatedAt!==expected)throw Error('他の操作で商品が更新されました。更新後にやり直してください');
 const a=new Alert();a.title='購入済みにする？';
 a.message=item.name+'\nNotionの記録だけ変更します。購入・決済は行いません。';
 a.addAction('購入済みにする');a.addCancelAction('キャンセル');
 if(await a.presentAlert()!==0)return 'cancel';
 // Confirm the upstream version again before a potentially irreversible write.
 const current=await notion(token,path);
 if(current.last_edited_time!==expected)throw Error('商品の状態が変更されています。今回の書込は中止しました');
 await notion(token,path,'PATCH',{properties:{
   '購入済':{checkbox:true},
   '買い物状態':{select:{name:'購入済'}},
   '購入日':{date:{start:tokyoDay()}}
 }});
 const check=await notion(token,path);
 if(!project(check)?.purchased)throw Error('更新後のNotion読戻し未確認。再試行前に原本を確認してください');
 return 'purchased';
}

function safeEditedRow(row,q){
 if(!row||!validId(q.id)||id32(row.id)!==id32(q.id)||id32(row.parent?.data_source_id)!==SOURCE.replace(/-/g,''))
  throw Error('既存Shoppingの対象商品を確認できません');
 const item=project(row);
 if(!item)throw Error('商品の詳細を確認できません');
 if(item.updatedAt!==clean(q.expectedEditedAt,80))throw Error('商品が更新されています。画面を開き直してください');
 return item;
}
function enteredAmount(raw,whole){
 const value=clean(raw,24);
 if(!value)return undefined;
 if(value==='-'||value==='－')return null;
 if(!/^(0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)||whole&&value.includes('.'))
  throw Error('金額・数量は0以上の数字を入力してください。削除する場合は - を入力');
 const result=Number(value);if(!Number.isFinite(result))throw Error('金額の形式が不正です');
 return result;
}
async function editItem(token,q){
 const path='pages/'+id32(q.id);
 const before=await notion(token,path);
 const item=safeEditedRow(before,q);
 const a=new Alert();a.title='価格と在庫を編集';
 a.message=item.name+'\\n販売ページで確認できた金額だけ記録してください。空欄は変更なし、- は未登録に戻します。';
 const keys=[
  ['現在価格（税・送料確認）','現在価格',false],
  ['参考価格','参考価格',false],
  ['目標価格','目標価格',false],
  ['在庫数','在庫数',true],
  ['補充基準','補充基準',true]
 ];
 for(const [label] of keys)a.addTextField(label,'');
 a.addAction('内容を確認');a.addCancelAction('キャンセル');
 if(await a.presentAlert()!==0)return 'cancel';
 const properties={},changes=[];
 let priceChanged=false;
 for(let i=0;i<keys.length;i++){
  const [label,key,whole]=keys[i],parsed=enteredAmount(a.textFieldValue(i),whole);
  if(parsed===undefined)continue;
  const attr={現在価格:'currentPrice',参考価格:'referencePrice',目標価格:'targetPrice',在庫数:'stock',補充基準:'reorderAt'}[key];
  if(item[attr]===parsed)continue;
  properties[key]={number:parsed};changes.push(label+' → '+(parsed===null?'未登録':String(parsed)));
  if(key==='現在価格')priceChanged=true;
 }
 if(!changes.length){await info('変更なし','入力がないためNotionは変更していません');return 'cancel'}
 if(priceChanged){
  properties['価格更新日']={date:{start:tokyoDay()}};
  properties['価格情報元']={select:{name:'手動'}};
 }
 const confirm=new Alert();confirm.title='変更内容を確認';
 confirm.message=item.name+'\\n\\n'+changes.join('\\n')+'\\n\\n現在価格は確認した時点の情報であり、購入時点の価格を保証しません。';
 confirm.addAction('Notionに保存');confirm.addCancelAction('中止');
 if(await confirm.presentAlert()!==0)return 'cancel';
 const current=await notion(token,path);
 safeEditedRow(current,q);
 await notion(token,path,'PATCH',{properties});
 const verified=await notion(token,path);
 const after=project(verified);
 if(!after)throw Error('更新後の商品を確認できません');
 for(const key of Object.keys(properties)){
  if(key==='価格更新日'){
   if(after.priceUpdatedAt!==tokyoDay())throw Error('更新日を読戻しできません');continue;
  }
  if(key==='価格情報元'){
   if(after.priceSource!=='手動')throw Error('情報元を読戻しできません');continue;
  }
  const attr={現在価格:'currentPrice',参考価格:'referencePrice',目標価格:'targetPrice',在庫数:'stock',補充基準:'reorderAt'}[key];
  if(after[attr]!==properties[key].number)throw Error('Notionへの保存結果を確認できません。重ねて保存せず元ページを確認してください');
 }
 return 'updated';
}
function photoPath(fm,id){
 const dir=fm.joinPath(fm.libraryDirectory(),'YOS Shopping Photos');
 return {dir,path:fm.joinPath(dir,id+'.jpg')};
}
async function setLocalPhoto(token,q){
 const row=await notion(token,'pages/'+id32(q.id));
 const item=safeEditedRow(row,q);
 if(typeof Photos==='undefined'||typeof FileManager==='undefined'||typeof Data==='undefined')
  throw Error('写真を追加できるScriptable実行環境ではありません');
 const pick=new Alert();pick.title='商品写真';
 pick.message=item.name+'\\niPhoneの写真から選び、この端末内だけに保存します。Notionや外部サーバーに画像は送信しません。';
 pick.addAction('iPhoneの写真を選ぶ');pick.addCancelAction('キャンセル');
 if(await pick.presentAlert()!==0)return 'cancel';
 const image=await Photos.fromLibrary();
 if(!image||!Number.isFinite(image.size?.width)||!Number.isFinite(image.size?.height))
  throw Error('写真を読み取れません');
 const ratio=Math.min(520/image.size.width,520/image.size.height,1);
 const w=Math.max(1,Math.round(image.size.width*ratio)),h=Math.max(1,Math.round(image.size.height*ratio));
 const canvas=new DrawContext();canvas.size=new Size(w,h);canvas.opaque=true;canvas.respectScreenScale=false;
 canvas.setFillColor(Color.white());canvas.fillRect(new Rect(0,0,w,h));
 canvas.drawImageInRect(image,new Rect(0,0,w,h));
 const jpeg=Data.fromJPEG(canvas.getImage());
 if(!jpeg||jpeg.toBase64String().length>750000)throw Error('選択した写真の容量が大きすぎます。別の画像を選んでください');
 const fm=FileManager.local(),paths=photoPath(fm,item.id);
 if(!fm.fileExists(paths.dir))fm.createDirectory(paths.dir,true);
 // An existing photo is never silently replaced without a second confirmation.
 if(fm.fileExists(paths.path)){
  const confirm=new Alert();confirm.title='既存写真を変更しますか？';
  confirm.message='現在のこの端末内の写真を、新しい選択写真に置き換えます。';
  confirm.addAction('置き換える');confirm.addCancelAction('中止');
  if(await confirm.presentAlert()!==0)return 'cancel';
 }
 fm.write(paths.path,jpeg);
 if(!fm.fileExists(paths.path)||!fm.read(paths.path))throw Error('写真の保存確認に失敗しました');
 return 'photo';
}

function photoMissingReason(item,manifest){
 if(/(?:商品名確認待ち|テスト商品|銘柄選定待ち|未確認)/.test(item.name))
  return '商品特定待ち';
 const entry=manifest.entries[item.id];
 if(entry?.signature===pictureSignature(item)&&entry.resolverVersion===PHOTO_RESOLVER_VERSION&&entry.failedAt)
  return '再検索予定';
 if(representativeSearch(item))return '参考写真未取得';
 if(item.imageUrl||trustedProductPage(item.url||''))return '商品写真未取得';
 return '写真情報不足';
}

function attachLocalPhotos(rows){
 if(typeof FileManager==='undefined'||typeof Data==='undefined')return rows;
 try{
  const fm=FileManager.local(),manifest=loadPictureManifest(fm);
  return rows.map(item=>{
   const personal=encodeLocalPicture(fm,photoPath(fm,item.id).path);
   if(personal)return {...item,localPhotoData:personal,photoKind:'product',photoSourceUrl:null};
   const cached=currentAutoPhoto(fm,item,manifest);
   if(cached)return {...item,localPhotoData:cached.data,photoKind:cached.kind,photoSourceUrl:cached.sourceUrl};
   return {...item,photoStatus:photoMissingReason(item,manifest)};
  });
 }catch{return rows}
}


const AUTO_PHOTO_DIR='YOS Shopping Auto Photos';
const PHOTO_MAX_NEW_PER_OPEN=8;
const PHOTO_RETRY_MS=12*60*60*1000;
const PHOTO_RESOLVER_VERSION=2;
const ALLOWED_PRODUCT_HOSTS=[
 'muji.com','kao-kirei.com','shop.rohto.co.jp','matsukiyococokara-online.com',
 'shiseido.co.jp','nitori-net.jp','amazon.co.jp','rakuten.co.jp','yodobashi.com',
 'biccamera.com','askul.co.jp'
];
const CATEGORY_PHOTO_QUERIES=[
 [/トイレットペーパー/,['toilet paper rolls','toilet paper']],
 [/トイレ洗剤/,['toilet cleaner bottle','toilet bowl cleaner']],
 [/柔軟剤/,['fabric softener bottle','fabric softener']],
 [/ボディソープ/,['body wash bottle','body wash']],
 [/キッチンペーパー/,['kitchen paper towels','paper towels']],
 [/シャンプー/,['shampoo bottle','shampoo']],
 [/歯磨き粉/,['toothpaste tube','toothpaste']],
 [/ティッシュペーパー/,['tissue box','tissue box']],
 [/食器用洗剤/,['dishwashing liquid bottle','dishwashing liquid']],
 [/洗濯洗剤/,['laundry detergent bottle','laundry detergent']],
 [/ハンドソープ/,['liquid hand soap','hand soap']],
 [/ゴミ袋/,['garbage bags','garbage bags']],
 [/脂性肌向け低刺激泡洗顔料/,['face cleanser bottle','face cleanser']],
 [/ラグ/,['area rug','rug']],
 [/椅子/,['chair furniture','chair']]
];
function pictureDir(fm){
 const dir=fm.joinPath(fm.libraryDirectory(),AUTO_PHOTO_DIR);
 return {dir,manifest:fm.joinPath(dir,'manifest-v1.json')};
}
function autoPicturePath(fm,id){return fm.joinPath(pictureDir(fm).dir,id+'.jpg')}
function pictureSignature(item){return [item.name,item.url||'',item.imageUrl||''].join('|')}
function loadPictureManifest(fm){
 try{
  const file=pictureDir(fm).manifest;
  if(fm.fileExists(file)){
   const obj=JSON.parse(fm.readString(file));
   if(obj&&obj.version===1&&obj.entries&&typeof obj.entries==='object')return obj;
  }
 }catch{}
 return {version:1,entries:{}};
}
function savePictureManifest(fm,manifest){
 const dir=pictureDir(fm).dir;
 if(!fm.fileExists(dir))fm.createDirectory(dir,true);
 fm.writeString(pictureDir(fm).manifest,JSON.stringify(manifest));
}
function encodeLocalPicture(fm,path){
 try{
  if(!fm.fileExists(path))return null;
  const data=fm.read(path),b64=data?.toBase64String();
  return b64&&b64.length>=20&&b64.length<=750000?'data:image/jpeg;base64,'+b64:null;
 }catch{return null}
}
function hostName(url){
 const safe=safeHttps(url);
 if(!safe)return '';
 return safe.slice(8).split(/[/?#]/,1)[0].toLowerCase().replace(/:443$/,'');
}
function trustedProductPage(url){
 const host=hostName(url);
 if(!ALLOWED_PRODUCT_HOSTS.some(domain=>host===domain||host.endsWith('.'+domain)))return false;
 const path=url.slice(8+host.length);
 if(/\/(?:s|search|campaign|list|searchresult)(?:[/?]|$)/i.test(path))return false;
 // Manufacturer stores legitimately place individual product pages inside /category/.
 if(/\/category(?:[/?]|$)/i.test(path)&&!/\d{4,}(?:\.html?)(?:[?#]|$)/i.test(path))return false;
 if(/amazon\.co\.jp$/.test(host)&&!/\/(?:dp|gp\/product)\/[a-z0-9]{10}/i.test(path))return false;
 if(/rakuten\.co\.jp$/.test(host)&&!/\.(?:html|htm)(?:[?#]|$)|\/item\//i.test(path))return false;
 return path.length>=9;
}
function htmlAttr(tag,key){
 const pattern=new RegExp('(?:^|\\s)'+key+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27)','i');
 const m=tag.match(pattern);return m?m[1]||m[2]||'':'';
}
function decodedHTML(text){
 return String(text||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function ogValue(html,names){
 const tags=html.match(/<meta\b[^>]*>/gi)||[];
 for(const name of names){
  for(const tag of tags){
   const key=(htmlAttr(tag,'property')||htmlAttr(tag,'name')).toLowerCase();
   if(key===name){const value=htmlAttr(tag,'content');if(value)return decodedHTML(value).trim()}
  }
 }
 return '';
}
function resolvedImageLink(pageUrl,raw){
 let image=decodedHTML(raw).trim();
 if(image.startsWith('//'))image='https:'+image;
 else if(image.startsWith('/'))image='https://'+hostName(pageUrl)+image;
 else if(image.startsWith('./'))image='https://'+hostName(pageUrl)+'/'+image.slice(2);
 // Never load data:, javascript:, internal hosts or accidentally copy tracker URLs.
 const host=hostName(image);
 if(!host||host==='localhost'||host.endsWith('.local')||host==='0.0.0.0'||/^\d+\.\d+\.\d+\.\d+$/.test(host))return null;
 if(/(?:logo|placeholder|noimage|default_image|tracking_pixel)/i.test(image))return null;
 return safeHttps(image);
}
function normalizePictureText(s){
 return String(s||'').normalize('NFKC').toLowerCase().replace(/[\s　・\-－_／/（）()]+/g,'');
}
function titleMatchesProduct(item,title,html,sourceUrl){
 const t=normalizePictureText(title);
 if(t.length<6)return false;
 // Search result and list pages can contain a brand but not a matching product.
 const tokens=item.name.normalize('NFKC').split(/[\s　・\-－_／/（）()]+/).map(normalizePictureText)
  .filter(x=>x.length>=3&&!/^\d+(?:\.\d+)?(?:ml|g|kg|cm|枚|個|本|枚入)$/i.test(x));
 // Barcode URL alone must not validate a different variant of the same brand.
 const matches=tokens.filter(x=>t.includes(x)).length;
 if(tokens.length===0||matches<Math.min(2,tokens.length))return false;
 const amount=item.name.normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*(ml|g|kg|cm|枚|個|本|枚入)/i);
 if(amount&&!normalizePictureText(title+' '+html.slice(0,16000)).includes(normalizePictureText(amount[0])))return false;
 return true;
}

function extractProductJsonLD(html,item,sourceUrl){
 // Product JSON-LD supplies images when generic og:image is merely a brand logo.
 const scripts=html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)||[];
 const walk=(entry,depth,out)=>{
  if(depth>5||out.length>24||!entry)return;
  if(Array.isArray(entry)){for(const child of entry.slice(0,24))walk(child,depth+1,out);return}
  if(typeof entry!=='object')return;
  if(entry['@graph'])walk(entry['@graph'],depth+1,out);
  const kind=entry['@type'];
  if((typeof kind==='string'&&/(?:^|\/)Product$/i.test(kind))||(Array.isArray(kind)&&kind.includes('Product')))out.push(entry);
  if(entry.mainEntity)walk(entry.mainEntity,depth+1,out);
 };
 for(const script of scripts.slice(0,10)){
  const raw=(script.match(/>([\s\S]*?)<\/script>/i)||[])[1]||'';
  if(!raw||raw.length>250000)continue;
  let parsed;try{parsed=JSON.parse(raw.trim())}catch{continue}
  const products=[];walk(parsed,0,products);
  for(const itemData of products){
   if(!titleMatchesProduct(item,String(itemData.name||''),html,sourceUrl))continue;
   const data=itemData.image;
   const images=typeof data==='string'?[data]:Array.isArray(data)?data:typeof data==='object'?[data]:[];
   for(const img of images.slice(0,10)){
    const raw=typeof img==='string'?img:typeof img?.url==='string'?img.url:typeof img?.contentUrl==='string'?img.contentUrl:'';
    const candidate=resolvedImageLink(sourceUrl,raw);
    if(candidate)return candidate;
   }
  }
 }
 return null;
}

async function findExactProductImage(item){
 if(!item.url||!trustedProductPage(item.url))return null;
 try{
  const req=new Request(item.url);req.timeoutInterval=6;
  req.headers={'Accept':'text/html','User-Agent':'Mozilla/5.0 (compatible; YOSShopping/1.0)'};
  const html=await req.loadString();
  if(req.response?.statusCode!==200||html.length>1700000||html.length<100)return null;
  const finalUrl=safeHttps(req.response?.url)||item.url;
  if(!trustedProductPage(finalUrl))return null;
  const title=ogValue(html,['og:title','twitter:title'])||decodedHTML((html.match(/<title[^>]*>([^<]+)<\/title>/i)||[])[1]||'');
  const structuredImage=extractProductJsonLD(html,item,finalUrl);
  const pageTitleMatches=titleMatchesProduct(item,title,html,finalUrl);
  if(!pageTitleMatches&&!structuredImage)return null;
  const raw=pageTitleMatches?ogValue(html,['og:image:secure_url','og:image','twitter:image']):'';
  const image=structuredImage||resolvedImageLink(finalUrl,raw);
  if(!image)return null;
  return {image,kind:'product',sourceUrl:finalUrl,notionCover:true};
 }catch{return null}
}
function representativeSearch(item){
 if(item.url&&trustedProductPage(item.url))return null;
 if(/(?:確認待ち|テスト商品|商品名未確認|不明)/.test(item.name))return null;
 for(const [pattern,terms] of CATEGORY_PHOTO_QUERIES)if(pattern.test(item.name))return terms;
 return null;
}
async function findRepresentativeImage(item){
 const terms=representativeSearch(item);
 if(!terms)return null;
 try{
  const endpoint='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch='+encodeURIComponent(terms[0])+
    '&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=380&format=json';
  const req=new Request(endpoint);req.timeoutInterval=6;
  req.headers={'Accept':'application/json','User-Agent':'YOSShopping/1.0 (private photo catalog)'};
  const data=await req.loadJSON();
  if(req.response?.statusCode!==200||!data?.query?.pages)return null;
  const pages=Object.values(data.query.pages);
  const keyword=terms[1].toLowerCase().split(' ')[0];
  for(const page of pages){
   const name=String(page.title||'').toLowerCase();
   const inf=page.imageinfo?.[0],mime=inf?.mime;
   if(!name.includes(keyword)||!['image/jpeg','image/png','image/webp'].includes(mime))continue;
   const img=safeHttps(inf.thumburl||inf.url);
   const info=safeHttps(inf.descriptionurl);
   if(img&&hostName(img).endsWith('wikimedia.org')&&info)
    return {image:img,kind:'representative',sourceUrl:info,notionCover:false};
  }
 }catch{}
 return null;
}
function jpegThumbnail(image){
 if(!image||!Number.isFinite(image.size?.width)||!Number.isFinite(image.size?.height)||image.size.width<90||image.size.height<90)
  return null;
 const w=image.size.width,h=image.size.height;
 const ratio=Math.max(w,h)/Math.min(w,h);
 if(ratio>3.5)return null;
 const scale=Math.min(400/w,400/h,1);
 const tw=Math.max(1,Math.round(w*scale)),th=Math.max(1,Math.round(h*scale));
 const canvas=new DrawContext();
 canvas.size=new Size(tw,th);canvas.opaque=true;canvas.respectScreenScale=false;
 canvas.setFillColor(Color.white());canvas.fillRect(new Rect(0,0,tw,th));
 canvas.drawImageInRect(image,new Rect(0,0,tw,th));
 const jpg=Data.fromJPEG(canvas.getImage());
 const b64=jpg?.toBase64String();
 return b64&&b64.length<=750000&&b64.length>=20?jpg:null;
}
async function downloadPhoto(source){
 try{
  const req=new Request(source.image);req.timeoutInterval=6;
  req.headers={'Accept':'image/avif,image/webp,image/png,image/jpeg,image/*','User-Agent':'Mozilla/5.0 (compatible; YOSShopping/1.0)'};
  if(source.kind==='product')req.headers.Referer=source.sourceUrl;
  const image=await req.loadImage();
  if(req.response?.statusCode!==200)return null;
  const mime=String(req.response?.mimeType||'').toLowerCase();
  if(mime&&!mime.startsWith('image/'))return null;
  return jpegThumbnail(image);
 }catch{return null}
}
function isExistingManualPhoto(fm,item){return Boolean(encodeLocalPicture(fm,photoPath(fm,item.id).path))}
function currentAutoPhoto(fm,item,manifest){
 const entry=manifest.entries[item.id];
 const signature=pictureSignature(item);
 if(!entry||entry.signature!==signature||!['product','representative'].includes(entry.kind))return null;
 const data=encodeLocalPicture(fm,autoPicturePath(fm,item.id));
 if(!data)return null;
 return {data,kind:entry.kind,sourceUrl:entry.sourceUrl};
}
async function tryEnrichPhoto(item){
 // Verify the exact SKU from the manufacturer's/seller's product page first.
 // Previously imported cover URLs may be broken or may point to another item.
 const exact=await findExactProductImage(item);
 if(exact){
  const jpg=await downloadPhoto(exact);
  if(jpg)return {jpg,kind:'product',sourceUrl:exact.sourceUrl,coverUrl:!item.imageUrl?exact.image:null};
 }
 if(item.imageUrl){
  const jpg=await downloadPhoto({image:item.imageUrl,kind:'product',sourceUrl:item.url||item.imageUrl});
  if(jpg)return {jpg,kind:'product',sourceUrl:item.url||item.imageUrl,coverUrl:null};
 }
 const generic=await findRepresentativeImage(item);
 if(generic){
  const jpg=await downloadPhoto(generic);
  if(jpg)return {jpg,kind:'representative',sourceUrl:generic.sourceUrl,coverUrl:null};
 }
 return null;
}
async function enrichShoppingPhotos(items,token){
 if(typeof FileManager==='undefined'||typeof Data==='undefined'||typeof DrawContext==='undefined')return items;
 const fm=FileManager.local();
 const manifest=loadPictureManifest(fm);
 const now=Date.now();
 const candidates=items.filter(item=>{
  if(isExistingManualPhoto(fm,item)||currentAutoPhoto(fm,item,manifest))return false;
  const entry=manifest.entries[item.id];
  if(entry?.signature===pictureSignature(item)&&entry.resolverVersion===PHOTO_RESOLVER_VERSION&&entry.failedAt&&now-entry.failedAt<PHOTO_RETRY_MS)return false;
  return Boolean(item.imageUrl||trustedProductPage(item.url||'')||representativeSearch(item));
 }).sort((a,b)=>Number(Boolean(b.imageUrl))-Number(Boolean(a.imageUrl))||
  Number(Boolean(trustedProductPage(b.url||'')))-Number(Boolean(trustedProductPage(a.url||''))));
 const pendingWrites=[];
 // Download a bounded batch in parallel. Every successful image is stored, so
 // following launches use local bytes even if the image host stops serving it.
 const todo=candidates.slice(0,PHOTO_MAX_NEW_PER_OPEN);
 const outcomes=await Promise.all(todo.map(async item=>({item,result:await tryEnrichPhoto(item)})));
 for(const {item,result} of outcomes){
  if(result){
   const path=autoPicturePath(fm,item.id);
   try{
    if(!fm.fileExists(pictureDir(fm).dir))fm.createDirectory(pictureDir(fm).dir,true);
    fm.write(path,result.jpg);
    if(!encodeLocalPicture(fm,path))throw Error('cache verify failed');
    manifest.entries[item.id]={
     signature:pictureSignature(item),kind:result.kind,
     sourceUrl:result.sourceUrl,checkedAt:now,resolverVersion:PHOTO_RESOLVER_VERSION
    };
    if(result.coverUrl)pendingWrites.push({item,url:result.coverUrl});
   }catch{manifest.entries[item.id]={signature:pictureSignature(item),failedAt:now,resolverVersion:PHOTO_RESOLVER_VERSION}}
  }else manifest.entries[item.id]={signature:pictureSignature(item),failedAt:now,resolverVersion:PHOTO_RESOLVER_VERSION};
 }
 try{savePictureManifest(fm,manifest)}catch{}
 // Only exact, publicly retrievable image URLs from matching product pages may
 // be written to Notion, never category examples. Do not overwrite existing covers.
 // Limit writes per opening and verify the page again to avoid changing a stale row.
 let written=0;
 for(const candidate of pendingWrites.slice(0,2)){
  try{
   const before=await notion(token,'pages/'+candidate.item.id);
   if(id32(before.parent?.data_source_id)!==SOURCE.replace(/-/g,'')||before.cover||
      project(before)?.name!==candidate.item.name)continue;
   await notion(token,'pages/'+candidate.item.id,'PATCH',{
    cover:{type:'external',external:{url:candidate.url}}
   });
   const after=await notion(token,'pages/'+candidate.item.id);
   if(after.cover?.external?.url===candidate.url)written++;
  }catch{}
 }
 // A Notion cover write changes last_edited_time, so refresh version-sensitive
 // actions rather than passing stale record timestamps to purchase/edit handlers.
 if(written){
  try{
   items=await list(token);
   // The Notion cover write changes the product signature. Keep the verified
   // local photo associated with the new source version without re-downloading.
   for(const item of items){
    const entry=manifest.entries[item.id];
    if(entry&&entry.checkedAt===now&&encodeLocalPicture(fm,autoPicturePath(fm,item.id)))
      entry.signature=pictureSignature(item);
   }
   savePictureManifest(fm,manifest);
  }catch{}
 }
 return items;
}


/* Read-only, source-linked public listing observations. These are NOT checkout
   prices, verified discounts, or a replacement for Notion's manual records. */
const PRICE_OBSERVATION_VERSION=1;
const PRICE_OBSERVATION_LIMIT=4;
const PRICE_OBSERVATION_TTL=24*60*60*1000;
const PRICE_OBSERVATION_RETRY=12*60*60*1000;
const PRICE_OBSERVATION_RETENTION=7*24*60*60*1000;
function priceObservationFile(fm){
 const dir=fm.joinPath(fm.libraryDirectory(),'YOS Shopping Price Observations');
 return {dir,path:fm.joinPath(dir,'manifest-v1.json')};
}
function priceObservationSignature(item){
 return [item.name,item.url||''].join('|');
}
function readPriceObservations(fm){
 try{
  const loc=priceObservationFile(fm);
  if(!fm.fileExists(loc.path))return {version:PRICE_OBSERVATION_VERSION,entries:{}};
  const obj=JSON.parse(fm.readString(loc.path));
  if(obj.version===PRICE_OBSERVATION_VERSION&&obj.entries&&typeof obj.entries==='object')return obj;
 }catch{}
 return {version:PRICE_OBSERVATION_VERSION,entries:{}};
}
function savePriceObservations(fm,manifest){
 const loc=priceObservationFile(fm);
 if(!fm.fileExists(loc.dir))fm.createDirectory(loc.dir,true);
 fm.writeString(loc.path,JSON.stringify(manifest));
}
function productJsonLdEntries(html){
 const results=[];
 const scripts=html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)||[];
 const walk=(value,depth)=>{
  if(depth>5||results.length>=30||!value)return;
  if(Array.isArray(value)){for(const x of value.slice(0,30))walk(x,depth+1);return}
  if(typeof value!=='object')return;
  const typ=value['@type'],types=Array.isArray(typ)?typ:[typ];
  if(types.some(x=>typeof x==='string'&&/(?:^|\/)Product$/i.test(x)))results.push(value);
  if(value['@graph'])walk(value['@graph'],depth+1);
  if(value.mainEntity)walk(value.mainEntity,depth+1);
 };
 for(const script of scripts.slice(0,12)){
  const raw=(script.match(/>([\s\S]*?)<\/script>/i)||[])[1]||'';
  if(!raw||raw.length>250000)continue;
  try{walk(JSON.parse(raw),0)}catch{}
 }
 return results;
}
function verifiedListingPrice(html,item,sourceUrl,checkedAt){
 for(const product of productJsonLdEntries(html)){
  if(!titleMatchesProduct(item,String(product.name||''),html,sourceUrl))continue;
  const offers=Array.isArray(product.offers)?product.offers:[product.offers];
  for(const offer of offers.slice(0,8)){
   if(!offer||typeof offer!=='object')continue;
   const type=Array.isArray(offer['@type'])?offer['@type']:[offer['@type']];
   // AggregateOffer, lowPrice and priceRange are not a purchasable offer.
   if(type.some(t=>typeof t==='string'&&/AggregateOffer/i.test(t))||
      offer.lowPrice!==undefined||offer.highPrice!==undefined)continue;
   const raw=offer.price;
   const currency=String(offer.priceCurrency||'').toUpperCase();
   if(currency!=='JPY'||typeof raw!=='string'&&typeof raw!=='number')continue;
   const text=String(raw).trim();
   if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(text))continue;
   const value=Number(text);
   if(!Number.isFinite(value)||value<1||value>9999999)continue;
   const until=offer.priceValidUntil;
   if(until&&typeof until==='string'){
    const end=Date.parse(until.length===10?until+'T23:59:59+09:00':until);
    if(!Number.isFinite(end)||end<Date.parse(checkedAt))continue;
   }
   return {
    webPrice:value,webPriceSourceUrl:sourceUrl,
    webPriceCheckedAt:checkedAt,webPriceStatus:'public-listing',
    webPriceAvailability:String(offer.availability||'').slice(0,160)
   };
  }
 }
 return null;
}
async function retrievePublicListingPrice(item){
 if(!item.url||!trustedProductPage(item.url))return null;
 try{
  const req=new Request(item.url);req.timeoutInterval=6;
  req.headers={'Accept':'text/html','User-Agent':'Mozilla/5.0 (compatible; YOSShopping/1.0)'};
  const html=await req.loadString();
  if(req.response?.statusCode!==200||html.length>1700000||html.length<100)return null;
  const finalUrl=safeHttps(req.response?.url)||item.url;
  if(!trustedProductPage(finalUrl))return null;
  return verifiedListingPrice(html,item,finalUrl,new Date().toISOString());
 }catch{return null}
}
function priceSnapshot(item,entry,now){
 if(!entry||entry.signature!==priceObservationSignature(item)||!entry.observation)return item;
 const info=entry.observation,age=now-Date.parse(info.webPriceCheckedAt);
 if(!Number.isFinite(age)||age<0||age>PRICE_OBSERVATION_RETENTION||
    !Number.isFinite(info.webPrice)||!safeHttps(info.webPriceSourceUrl))return item;
 return {...item,...info,webPriceFresh:age<=PRICE_OBSERVATION_TTL};
}
async function enrichShoppingPrices(rows){
 if(typeof FileManager==='undefined'||typeof Request==='undefined')return rows;
 const fm=FileManager.local(),manifest=readPriceObservations(fm);
 const now=Date.now();
 const todo=rows.filter(item=>{
  if(!trustedProductPage(item.url||''))return false;
  const e=manifest.entries[item.id];
  if(!e||e.signature!==priceObservationSignature(item))return true;
  if(e.failedAt&&now-e.failedAt<PRICE_OBSERVATION_RETRY)return false;
  if(e.observation){
   const t=Date.parse(e.observation.webPriceCheckedAt);
   return !Number.isFinite(t)||now-t>PRICE_OBSERVATION_TTL;
  }
  return true;
 }).sort((a,b)=>Number(b.state==='購入候補')-Number(a.state==='購入候補')||
  Number(!manifest.entries[a.id]?.observation)-Number(!manifest.entries[b.id]?.observation))
  .slice(0,PRICE_OBSERVATION_LIMIT);
 const results=await Promise.all(todo.map(async item=>({
  item,observation:await retrievePublicListingPrice(item)
 })));
 for(const {item,observation} of results){
  const original=manifest.entries[item.id];
  manifest.entries[item.id]={
   signature:priceObservationSignature(item),
   ...(observation?{observation}:original?.signature===priceObservationSignature(item)&&
      original.observation?{observation:original.observation}:{}),
   ...(observation?{}:{failedAt:now})
  };
 }
 try{savePriceObservations(fm,manifest)}catch{}
 // Assess freshness after requests finish: new observations can postdate the batch start.
 const snapshotNow=Date.now();
 return rows.map(item=>priceSnapshot(item,manifest.entries[item.id],snapshotNow));
}

async function asset(file,min,max,contains){
 const req=new Request(ASSETS+file);req.timeoutInterval=20;
 const value=await req.loadString();
 if(req.response?.statusCode!==200||typeof value!=='string'||value.length<min||value.length>max||!value.includes(contains))
  throw Error('Shopping画面 '+file+' の版を検証できません。以前の画面は変更しません');
 return value;
}
function inlineHTML(html,css,js,items){
 const stylesheet='<link rel="stylesheet" href="./shopping.css?v=1">';
 const script='<script defer src="./shopping.js?v=1"></script>';
 if(!html.includes(stylesheet)||!html.includes(script))throw Error('Shopping画面の部品が一致しません');
 // The token never enters HTML or any browser navigation. Only an item snapshot is injected.
 const data=JSON.stringify({schema:'yos-shopping-local-v1',items,checkedAt:new Date().toISOString()})
  .replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const safeCss=css.replace(/<\/style/gi,'<\\/style');
 const safeJs=js.replace(/<\/script/gi,'<\\/script');
 return html
  .replace('<html lang="ja">','<html lang="ja" class="scriptable-native">')
  .replace(stylesheet,'<style>'+safeCss+'</style>')
  .replace(script,'<script>globalThis.YOS_SHOPPING_NATIVE='+data+';</script><script>'+safeJs+'</script>')
  .replace(/href="\.\.\/\.\.\/yos\/"/g,'href="https://yskn0008-bot.github.io/ProjectY/yos/"');
}
async function main(){
 let token='';
 try{if(Keychain.contains(NOTION_KEY))token=Keychain.get(NOTION_KEY)||''}catch{}
 if(!token){await info('Notion未接続','既存ScriptableのNotion接続情報がこのiPhoneに見つかりません。新しいサーバーやログインは不要です。');return}
 const q=args?.queryParameters||{};
 const mode=clean(q.action,20);
 if(mode==='purchase'){
  const outcome=await purchase(token,q);
  if(outcome==='purchased')await info('更新確認','Notionを読み戻して購入済みを確認しました');
  if(outcome==='already')await info('確認','すでに購入済みです');
 }
 if(mode==='edit'){
  const outcome=await editItem(token,q);
  if(outcome==='updated')await info('編集完了','保存した価格・在庫をNotionから読み戻しました');
 }
 if(mode==='photo'){
  const outcome=await setLocalPhoto(token,q);
  if(outcome==='photo')await info('写真を設定しました','iPhone内に保存した商品写真を表示します。Notionの元データは変更していません');
 }
 let rows=await list(token);
 if(mode==='add'){
  const outcome=await add(token,rows);
  if(outcome==='added'){
   rows=await list(token);
   await info('追加確認','Notionの一覧から追加した商品を読み戻しました');
  }
 }
 rows=await enrichShoppingPhotos(rows,token);
 rows=await enrichShoppingPrices(rows);
 const [html,css,js]=await Promise.all([
  asset('index.html',3500,25000,'id="productGrid"'),
  asset('shopping.css',7000,30000,'.product-grid'),
  asset('shopping.js',9000,30000,'yos-shopping-local-v1')
 ]);
 const page=inlineHTML(html,css,js,attachLocalPhotos(rows));
 if(!page.includes('YOS_SHOPPING_NATIVE')||page.includes('project-y-yos-ai.vercel.app'))
  throw Error('Shopping表示の安全確認に失敗しました');
 await WebView.loadHTML(page,null,null,true);
}
try{await main()}catch(error){await info('YOS Shopping｜未完了',clean(error?.message||error,210))}
Script.complete();
