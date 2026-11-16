// Variables used by Scriptable.
// icon-color: blue; icon-glyph: calendar;
// YOS_SCRIPT_NAME: YOS Calendar Notion
// YOS Calendar: read-only Notion -> existing approved YOS Calendar.
// No Vercel, Google login, Face ID, new database, or Notion writes.
// The existing integration token stays exclusively in Scriptable Keychain.
'use strict';

const NOTION_KEY='YOS_NOTION_INTEGRATION_TOKEN';
// Pin the approved design: no live GitHub Pages navigation is required.
const UI_REF='8a09f912da184582ad8b2e01bce809b10ddb1c7d';
const UI_ASSETS='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/'+UI_REF+'/life/calendar/';
async function asset(name,minimum,maximum,check){
 const request=new Request(UI_ASSETS+name);
 request.timeoutInterval=20;
 const value=await request.loadString();
 if(request.response?.statusCode!==200||typeof value!=='string'||value.length<minimum||value.length>maximum||!value.includes(check))
  throw Error('カレンダーの画面部品 '+name+' を取得できません（表示は開始していません）');
 return value;
}
async function offlineHTML(){
 const [css,habit,approved]=await Promise.all([
  asset('approved-calendar.css',5000,90000,'#approvedCalendar'),
  asset('habit-calendar.js',500,10000,'YOS_CALENDAR_HABITS'),
  asset('approved-calendar.js',5000,90000,'YOS_APPROVED_CALENDAR')
 ]);
 // Only immutable project-approved sources are used, never Notion data or credentials.
 const safeScript=x=>x.replace(/<\/script/gi,'<\\/script');
 const safeCss=x=>x.replace(/<\/style/gi,'<\\/style');
 return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
 '<meta name="theme-color" content="#051522"><title>YOS CALENDAR</title><style>'+
 '[hidden]{display:none!important}html,body{margin:0;min-height:100%;background:#051522;color:#f7f8ff}'+safeCss(css)+
 '</style></head><body>'+
 '<div id="sourceOverview" hidden></div><section class="calendar-auth"><button type="button" id="calendarTasksRefresh">↻ Notionを更新</button></section>'+
 '<div id="sources"></div><div id="sourceLinks"></div><button type="button" id="reload">↻ Notionを更新</button>'+
 '<script>'+safeScript(habit)+'</script><script>'+safeScript(approved)+'</script></body></html>';
}
const VERSION='2026-03-11';
const BASE='https://api.notion.com/v1/data_sources/';
const sources=[
 {name:'YOS Tasks',id:'965c6086-32c1-463d-93b4-87a9cb69b3ad',title:'やること',date:'期限',kind:'task',area:''},
 {name:'YOS 生活イベント',id:'30df9a73-2ea7-4ff7-8187-2b62dc8f9da4',title:'イベント名',date:'発生日時',kind:'schedule',area:'Life'},
 {name:'YOS 人物・記念日',id:'829c91b0-08dc-4ab0-b8fd-b9725dd0d9d2',title:'人物・イベント',date:'記念日',kind:'schedule',area:'Life'},
 {name:'YOS Shopping',id:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc',title:'商品名',date:'セール予定日',kind:'schedule',area:'Life'},
 {name:'家計イベント・入出金予定',id:'95b30d16-7530-40c6-a320-dab99acad55d',title:'項目',date:'日付',kind:'money',area:'Money'},
 {name:'YOS 案件',id:'9205e5b7-f8b9-4497-9d6f-4727d67e4866',title:'案件名',date:'対応期限',kind:'task',area:''}
];
const clean=(v,n=100)=>String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const rich=p=>Array.isArray(p?.title)?clean(p.title.map(v=>v?.plain_text||v?.text?.content||'').join('')):Array.isArray(p?.rich_text)?clean(p.rich_text.map(v=>v?.plain_text||v?.text?.content||'').join('')):'';
const pick=p=>clean(p?.select?.name||p?.status?.name||'',40);
const id32=x=>typeof x==='string'?x.replace(/-/g,'').toLowerCase():'';
const tokyoDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
const tokyoTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function dated(start){
 if(typeof start!=='string'||!start)return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(start))return {day:start,clock:''};
 const ms=Date.parse(start);
 return Number.isFinite(ms)&&start.includes('T')?{day:tokyoDate.format(new Date(ms)),clock:tokyoTime.format(new Date(ms))}:null;
}
function zone(p){
 const names=Array.isArray(p?.['分野']?.multi_select)?p['分野'].multi_select.map(x=>x.name):[];
 const area=pick(p?.['領域'])||names[0]||'';
 return ({お金:'Money',仕事:'Work',健康:'Health',美容:'Self',自分磨き:'Self',生活:'Life',買い物:'Life',Shopping:'Life',Home:'Life',ProjectY:'Work'}[area]||(['Money','Work','Health','Self','Life'].includes(area)?area:'other'));
}
async function getRows(src,token){
 const rows=[],seen=new Set();let cursor=null;
 for(let page=0;page<4;page++){
  const req=new Request(BASE+src.id+'/query');
  req.method='POST';
  req.headers={Authorization:'Bearer '+token,'Notion-Version':VERSION,'Content-Type':'application/json',Accept:'application/json'};
  req.body=JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})});
  req.timeoutInterval=12;
  const data=await req.loadJSON();
  if(req.response?.statusCode!==200||!Array.isArray(data?.results)||typeof data.has_more!=='boolean')throw Error(src.name+'を取得できません');
  for(const row of data.results){
   const id=id32(row?.id);
   if(!/^[a-f0-9]{32}$/.test(id)||seen.has(id)||!row?.properties)throw Error(src.name+'の形式が不正です');
   seen.add(id);rows.push(row);
  }
  if(!data.has_more)return rows;
  if(typeof data.next_cursor!=='string'||!data.next_cursor||data.next_cursor===cursor)throw Error('ページ取得に失敗しました');
  cursor=data.next_cursor;
 }
 throw Error(src.name+'が400件を超えたため取得を完了できません');
}
function project(row,src){
 const p=row.properties,id=id32(row.id),title=rich(p[src.title]);
 const recurrence=pick(p['習慣周期']),value=p[src.date]?.date?.start;
 const at=dated(value)||(src.name==='YOS Tasks'&&recurrence?{day:tokyoDate.format(new Date()),clock:''}:null);
 if(!title||!at)return null;
 const status=pick(p['状態']);
 if(src.name==='YOS 案件'&&Array.isArray(p['関連タスク']?.relation)&&p['関連タスク'].relation.length)return null;
 if(src.kind==='money'){
  const kind=pick(p['区分']),certainty=pick(p['確度']),amount=p['金額']?.number;
  if(status==='取消'||kind==='資金移動')return null;
  if(!['収入','支出'].includes(kind)||!['実績','予定'].includes(status)||!Number.isFinite(amount)||amount<0)return null;
  return {id:'notion:money:'+id,sourceId:id,type:'money',date:at.day,title,area:'Money',
   subtitle:status+' · '+(certainty||'未確認'),moneyKind:kind==='収入'?'income':'expense',amount:Math.round(amount),
   verification:certainty||'未確認',complete:status==='実績',done:status==='実績',source:src.name,clock:at.clock,
   originalId:rich(p['原本ID'])};
 }
 if(src.name==='YOS 生活イベント'){
  const match=/^calendar:habit:([a-f0-9]{32}):(\d{4}-\d{2}-\d{2})$/.exec(rich(p['記録キー']));
  if(match&&match[2]===at.day)return {id:'notion:habit:'+id,sourceId:id,habitTaskId:match[1],type:'habit',
   date:at.day,title:title.replace(/^習慣｜/,''),area:'Life',subtitle:'実施済み（本人記録）',done:true,source:src.name};
 }
 const task=src.kind==='task',habit=src.name==='YOS Tasks'&&Boolean(recurrence);
 return {id:'notion:'+id,sourceId:task&&src.name==='YOS Tasks'?'notion-'+id:id,
  date:at.day,clock:at.clock,title:src.name==='YOS Tasks'&&title.startsWith('予定｜')?title.slice(3):title,
  area:src.area||zone(p),type:habit?'habit':task?'task':'schedule',
  done:status==='完了'||src.name==='YOS 生活イベント',
  subtitle:at.clock?(task?'期限 ':'')+at.clock:(src.name==='YOS Tasks'?'期限':src.name==='YOS 案件'?'対応期限':'終日'),
  source:src.name,...(habit?{habitCycle:recurrence}:{})};
}
async function loadNotion(token){
 const items=[],extra=[],fail=[];
 let verifiedMoney=false;
 for(const src of sources){
  try{
   const rows=await getRows(src,token);
   for(const row of rows){const item=project(row,src);if(item)items.push(item)}
   if(src.kind==='money')verifiedMoney=true;
   extra.push({name:src.name,status:'ready'});
  }catch(error){
   extra.push({name:src.name,status:'unavailable'});
   fail.push(src.name);
  }
 }
 // Do not send a partial item as an authoritative complete-source result.
 return {items,fail,checkedAt:new Date().toISOString(),moneyRead:verifiedMoney,
  otherSources:{status:Object.fromEntries(extra.map(x=>[x.name,x.status])),extraStatus:extra},
  demo:false,complete:()=>Promise.resolve({ok:false,reason:'Notionの元ページで完了してください'}),
  completeHabit:()=>Promise.resolve({ok:false,reason:'Notionの元ページで実施記録を確認してください'})};
}
const initialJS=String.raw`(function(){
 if(!window.YOS_APPROVED_CALENDAR)return false;
 const api=window.YOS_APPROVED_CALENDAR,original=api.update.bind(api);
 let current=null;
 api.update=function(data){
  if(data&&data.__nativeNotion===true){current=data;return original(data)}
  return original(current||data);
 };
 window.__yosNativeNotify=function(event){
  if(window.__yosNativeReply){const reply=window.__yosNativeReply;window.__yosNativeReply=null;reply(event)}
  else window.__yosNativeQueued=event;
 };
 for(const id of ['calendarTasksRefresh','reload']){
  const button=document.getElementById(id);
  if(!button)continue;
  button.textContent='↻ Notionを更新';
  button.addEventListener('click',function(ev){
   ev.preventDefault();ev.stopImmediatePropagation();window.__yosNativeNotify('refresh');
  },true);
 }
 return true;
})()`;
const waitJS=String.raw`(function(){
 if(window.__yosNativeQueued){const event=window.__yosNativeQueued;window.__yosNativeQueued=null;completion(event)}
 else window.__yosNativeReply=completion;
})()`;
async function showAlert(title,message){
 const a=new Alert();a.title=title;a.message=message;a.addAction('閉じる');await a.presentAlert();
}
async function main(){
 let token='';
 try{if(Keychain.contains(NOTION_KEY))token=Keychain.get(NOTION_KEY)||''}catch{}
 if(!token){await showAlert('Notion未接続','このiPhoneの既存KeychainにNotion接続情報が見つかりません。既存YOSのNotion連携を確認してください。');return}
 const data=await loadNotion(token);
 if(data.fail.length===sources.length){await showAlert('Notionを取得できません','すべての保存先への接続に失敗しました。Notionの権限と通信を確認してください。');return}
 const view=new WebView();
 // A dark blank WebView was observed with loadURL(GitHub Pages). Render the same
 // approved CSS/JS locally instead, and verify a live calendar root before present.
 const html=await offlineHTML();
 await view.loadHTML(html);
 const installed=await view.evaluateJavaScript(initialJS);
 const layout=await view.evaluateJavaScript("(function(){const host=document.getElementById('approvedCalendar');return {ready:document.readyState,exists:!!host,grid:!!document.getElementById('calGrid'),height:host?.getBoundingClientRect().height||0}})()");
 if(installed!==true||!layout?.exists||!layout?.grid)
  throw Error('カレンダーの初期表示に失敗しました。元のデータは変更していません');
 async function paint(next){
  // Preserve the existing Money privacy flag before placing private records in WebView.
  const hideMoney=await view.evaluateJavaScript("(function(){try{return JSON.parse(localStorage.getItem('yos-money-v2')||'null')?.privacy===true}catch{return false}})()");
  const visible=hideMoney?{...next,items:next.items.filter(x=>x.type!=='money'),moneyRead:false,moneyPrivate:true}:next;
  const payload={...visible,__nativeNotion:true};
  delete payload.fail;delete payload.complete;delete payload.completeHabit;
  const json=JSON.stringify(payload).replace(/</g,'\\u003c');
  const expression='(function(){var data='+json+';data.complete=function(){return Promise.resolve({ok:false,reason:"Notionの元ページで完了してください"})};data.completeHabit=data.complete;window.YOS_APPROVED_CALENDAR.update(data);return window.YOS_APPROVED_CALENDAR.inspect().items.length;})()';
  const count=await view.evaluateJavaScript(expression);
  if(count!==visible.items.length)throw Error('UIへ読み込んだ件数が一致しません');
 }
 await paint(data);
 const close=view.present(true).then(()=>({type:'close'}));
 let listening=view.evaluateJavaScript(waitJS,true).then(value=>({type:'event',value}),()=>({type:'close'}));
 for(;;){
  const event=await Promise.race([close,listening]);
  if(event.type==='close')break;
  if(event.value==='refresh'){
   const updated=await loadNotion(token);
   if(updated.fail.length<sources.length)await paint(updated);
  }
  listening=view.evaluateJavaScript(waitJS,true).then(value=>({type:'event',value}),()=>({type:'close'}));
 }
}
try{await main()}catch(e){await showAlert('YOS Calendar 接続エラー',clean(e?.message||e,200))}
Script.complete();
