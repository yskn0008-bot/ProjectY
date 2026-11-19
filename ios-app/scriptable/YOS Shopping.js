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
const UI_REF='39be6907ef7598510b92d8082d6e385039933286';
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
function attachLocalPhotos(rows){
 if(typeof FileManager==='undefined'||typeof Data==='undefined')return rows;
 try{
  const fm=FileManager.local();
  return rows.map(item=>{
   const file=photoPath(fm,item.id).path;
   if(!fm.fileExists(file))return item;
   try{
    const raw=fm.read(file),base64=raw?.toBase64String();
    if(!base64||base64.length>750000)return item;
    return {...item,localPhotoData:'data:image/jpeg;base64,'+base64};
   }catch{return item}
  });
 }catch{return rows}
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
