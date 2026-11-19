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
const UI_REF='9b2676090eebf85f8d8bfe2a1f067ab3a8a0cba1';
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
 const s=clean(v,1600);if(!s||s.length>1500)return null;
 try{const u=new URL(s);return u.protocol==='https:'?u.href:null}catch{return null}
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
 const page=inlineHTML(html,css,js,rows);
 if(!page.includes('YOS_SHOPPING_NATIVE')||page.includes('project-y-yos-ai.vercel.app'))
  throw Error('Shopping表示の安全確認に失敗しました');
 await WebView.loadHTML(page,null,null,true);
}
try{await main()}catch(error){await info('YOS Shopping｜未完了',clean(error?.message||error,210))}
Script.complete();
