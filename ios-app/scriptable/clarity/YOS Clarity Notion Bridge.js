// YOS Clarity Notion Bridge
// Writes only to the user's EXISTING Notion pages/data sources.
// Token is stored only in Scriptable Keychain. No secret belongs in GitHub/Shortcut source.

const VERSION = "2026-10-20";
const NOTION_VERSION = "2026-03-11";
const KEY = Object.freeze({ token: "yos.clarity.notion.token" });

const NOTION = Object.freeze({
  inboxPage: "3d35ca88-2895-81ef-9dc8-d5f11ff8e213",
  finance: "95b30d16-7530-40c6-a320-dab99acad55d",
  balance: "94fc7e9f-fd20-4073-bbcf-02efe8e95c5c",
  tasks: "965c6086-32c1-463d-93b4-87a9cb69b3ad",
  life: "30df9a73-2ea7-4ff7-8187-2b62dc8f9da4",
  decisions: "28bcd894-b709-4b23-9fdc-c9dc43043bfc"
});

const FINANCE_CATEGORIES = new Set([
  "住居","光熱","食費","日用品","車・交通","通信・サブスク","保険",
  "税金・社会保険","貯金","返済","給与・事業収入","家賃収入","その他"
]);
const TASK_AREAS = new Set(["Money","Work","ProjectY","Life","Home","Idea","Admin","Shopping"]);
const TASK_PRIORITIES = new Set(["P0","P1","P2","P3"]);
const LIFE_KINDS = new Set(["外出","帰宅","運動","掃除","就寝準備","その他"]);
const DECISION_AREAS = new Set(["お金","予定","家族・人間関係","健康","生活","開発","その他"]);

function q(name){ return String((args.queryParameters||{})[name]||"").trim(); }
function token(){ return Keychain.contains(KEY.token) ? Keychain.get(KEY.token).trim() : ""; }
function titleText(value){ return [{type:"text",text:{content:String(value||"").slice(0,180)}}]; }
function richText(value){ const v=String(value||""); return v ? [{type:"text",text:{content:v.slice(0,1900)}}] : []; }
function firstLine(value,max=100){ return String(value||"").split(/\r?\n/).map(x=>x.trim()).find(Boolean)?.slice(0,max)||""; }
function isoDate(value){
  const s=String(value||"").trim();
  if(!s) return "";
  const d=new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
function amountNumber(value){
  const n=Number(String(value||"").replace(/[¥￥,円\s]/g,""));
  return Number.isFinite(n) ? Math.abs(n) : null;
}
function fnv1a(value){
  let h=0x811c9dc5;
  for(const ch of String(value||"")){h^=ch.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0;}
  return h.toString(16).padStart(8,"0");
}
function stableKey(target,raw,provided){
  if(provided) return provided.slice(0,120);
  return "clarity:"+target+":"+fnv1a(String(raw||"").normalize("NFKC"));
}
async function notion(path,method="GET",body=null,authToken=token()){
  if(!authToken) throw new Error("Notionトークン未設定");
  const r=new Request("https://api.notion.com/v1/"+path.replace(/^\//,""));
  r.method=method;
  r.headers={
    Authorization:"Bearer "+authToken,
    "Content-Type":"application/json",
    "Notion-Version":NOTION_VERSION
  };
  if(body!==null) r.body=JSON.stringify(body);
  const text=await r.loadString();
  let json={};
  try{json=text?JSON.parse(text):{};}catch(_){json={raw:text};}
  const status=r.response?r.response.statusCode:0;
  if(status<200||status>=300){
    const message=json&&json.message?json.message:("HTTP "+status);
    throw new Error("Notion: "+message);
  }
  return json;
}
async function createPage(dataSourceId,properties){
  return notion("pages","POST",{parent:{type:"data_source_id",data_source_id:dataSourceId},properties});
}
async function exists(dataSourceId,filter){
  const out=await notion("data_sources/"+dataSourceId+"/query","POST",{page_size:1,filter});
  return Array.isArray(out.results)&&out.results.length>0;
}
async function appendInbox(raw,label="Clarity"){
  const meta=new Date().toISOString()+" · "+label;
  return notion("blocks/"+NOTION.inboxPage+"/children","PATCH",{children:[
    {object:"block",type:"paragraph",paragraph:{rich_text:richText(meta)}},
    {object:"block",type:"paragraph",paragraph:{rich_text:richText(raw)}},
    {object:"block",type:"divider",divider:{}}
  ]});
}
async function setup(){
  const a=new Alert();
  a.title="Clarity × Notion";
  a.message="Notionの内部インテグレーション用トークンを1回だけ保存します。YOS 管理とBASE HOMEをその接続へ共有してから入力してください。";
  a.addSecureTextField("Notion token","");
  a.addAction("保存して確認");
  a.addCancelAction("キャンセル");
  const i=await a.presentAlert();
  if(i<0) return false;
  const candidate=a.textFieldValue(0).trim();
  if(candidate.length<20) throw new Error("トークンが短すぎます");
  // Verify one page from each existing top-level area before persisting.
  await notion("pages/"+NOTION.inboxPage,"GET",null,candidate);
  await notion("data_sources/"+NOTION.finance,"GET",null,candidate);
  Keychain.set(KEY.token,candidate);
  const ok=new Alert();
  ok.title="接続確認";
  ok.message="Notion接続を保存しました。";
  ok.addAction("OK");
  await ok.presentAlert();
  return true;
}
async function saveFinance(p){
  const raw=p.raw, amount=amountNumber(p.amount), date=isoDate(p.date);
  if(amount===null||!date){
    await appendInbox("[家計・未確認]\n"+raw,"Clarity finance fallback");
    return {fallback:true};
  }
  const key=stableKey("finance_event",raw,p.key);
  if(await exists(NOTION.finance,{property:"原本ID",rich_text:{equals:key}})) return {duplicate:true};
  const kind={income:"収入",expense:"支出",transfer:"資金移動"}[p.kind]||"支出";
  const certainty={confirmed:"確認済",expected:"見込み",unverified:"未確認"}[p.certainty]||"未確認";
  const state=certainty==="見込み"?"予定":"実績";
  const props={
    "項目":{title:titleText(p.title||firstLine(raw,80)||"家計記録")},
    "金額":{number:amount},
    "日付":{date:{start:date}},
    "区分":{select:{name:kind}},
    "状態":{select:{name:state}},
    "確度":{select:{name:certainty}},
    "原本ID":{rich_text:richText(key)},
    "確認元":{rich_text:richText(p.source||"Clarity")},
    "メモ":{rich_text:richText(raw)}
  };
  if(p.category&&FINANCE_CATEGORIES.has(p.category)) props["分類"]={select:{name:p.category}};
  if(p.account) props["支払元"]={rich_text:richText(p.account)};
  return createPage(NOTION.finance,props);
}
async function saveBalance(p){
  const amount=amountNumber(p.amount), date=isoDate(p.date);
  if(amount===null||!date||!p.account){
    await appendInbox("[残高・未確認]\n"+p.raw,"Clarity balance fallback");
    return {fallback:true};
  }
  const same=await exists(NOTION.balance,{and:[
    {property:"口座・資産",title:{equals:p.account.slice(0,100)}},
    {property:"確認日",date:{equals:date}}
  ]});
  if(same) return {duplicate:true};
  return createPage(NOTION.balance,{
    "口座・資産":{title:titleText(p.account)},
    "金額":{number:amount},
    "資産区分":{select:{name:"銀行"}},
    "確認日":{date:{start:date}},
    "確認状況":{select:{name:p.source==="本人"||p.source==="Clarity"?"本人確認":"連携サービス記録"}},
    "原本":{rich_text:richText(p.source||"Clarity")},
    "注記":{rich_text:richText(p.raw)}
  });
}
async function saveTask(p){
  const key=stableKey("task",p.raw,p.key);
  if(await exists(NOTION.tasks,{property:"同期キー",rich_text:{equals:key}})) return {duplicate:true};
  const props={
    "やること":{title:titleText(p.title||firstLine(p.raw,120)||"Clarityタスク")},
    "状態":{select:{name:"次にやる"}},
    "担当":{select:{name:"陽介"}},
    "種類":{select:{name:"Task"}},
    "優先度":{select:{name:TASK_PRIORITIES.has(p.priority)?p.priority:"P2"}},
    "領域":{select:{name:TASK_AREAS.has(p.area)?p.area:"Life"}},
    "同期キー":{rich_text:richText(key)},
    "正本・根拠":{rich_text:richText("Clarity: "+p.raw)}
  };
  const date=isoDate(p.date);
  if(date) props["期限"]={date:{start:date}};
  return createPage(NOTION.tasks,props);
}
async function saveLife(p){
  const key=stableKey("life_event",p.raw,p.key);
  if(await exists(NOTION.life,{property:"記録キー",rich_text:{equals:key}})) return {duplicate:true};
  const date=isoDate(p.date);
  if(!date){
    await appendInbox("[生活イベント・日時未確認]\n"+p.raw,"Clarity life fallback");
    return {fallback:true};
  }
  return createPage(NOTION.life,{
    "イベント名":{title:titleText(p.title||firstLine(p.raw,100)||"生活イベント")},
    "発生日時":{date:{start:date}},
    "種類":{select:{name:LIFE_KINDS.has(p.category)?p.category:"その他"}},
    "取得元":{select:{name:"Clarity"}},
    "記録キー":{rich_text:richText(key)},
    "備考":{rich_text:richText(p.raw)}
  });
}
async function saveDecision(p){
  const date=isoDate(p.date)||new Date().toISOString();
  return createPage(NOTION.decisions,{
    "判断・経験":{title:titleText(p.title||firstLine(p.raw,120)||"判断・経験")},
    "判断日":{date:{start:date}},
    "分野":{select:{name:DECISION_AREAS.has(p.area)?p.area:"その他"}},
    "本人の決定":{rich_text:richText(p.raw)},
    "根拠・参照":{rich_text:richText("Clarity")},
    "状態":{select:{name:"実行中"}}
  });
}
async function main(){
  const action=q("action"), target=q("target");
  if(action==="setup"||(!target&&!token())){await setup();return;}
  if(action==="reset"){
    const a=new Alert();a.title="Notion接続を削除";a.message="iPhone内のClarity用Notionトークンだけを削除します。";a.addDestructiveAction("削除");a.addCancelAction("キャンセル");
    if(await a.presentAlert()===0&&Keychain.contains(KEY.token))Keychain.remove(KEY.token);
    return;
  }
  if(!token()){if(!(await setup()))return;}
  if(!target){throw new Error("保存先がありません");}
  const p={
    target, raw:q("raw"), title:q("title"), amount:q("amount"), date:q("date"),
    kind:q("kind"), category:q("category"), account:q("account"), certainty:q("certainty"),
    source:q("source")||"Clarity", priority:q("priority"), area:q("area"), key:q("key")
  };
  if(!p.raw) throw new Error("保存する原文がありません");
  let result;
  if(target==="inbox") result=await appendInbox(p.raw,"Clarity inbox");
  else if(target==="finance_event") result=await saveFinance(p);
  else if(target==="balance") result=await saveBalance(p);
  else if(target==="task") result=await saveTask(p);
  else if(target==="life_event") result=await saveLife(p);
  else if(target==="decision") result=await saveDecision(p);
  else throw new Error("未許可のNotion保存先です: "+target);
  if(!config.runsInWidget){
    const n=new Notification();
    n.title="Clarity";
    n.body=result&&result.duplicate?"すでに記録済みです":result&&result.fallback?"未確認としてInboxへ保存しました":"Notionへ記録しました";
    await n.schedule();
  }
}
try{await main();}
catch(e){
  const a=new Alert();
  a.title="Clarity × Notion";
  a.message=(e&&e.message)?e.message:String(e);
  a.addAction("OK");
  await a.presentAlert();
}
Script.complete();
