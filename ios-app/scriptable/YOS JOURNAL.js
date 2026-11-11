// Variables used by Scriptable.
// icon-color: deep-blue; icon-glyph: book-open;
// YOS JOURNAL v1.6 — editorial clarity and preserved archive display
// Launch with Shortcuts "Run Script" or Scriptable.
const fm=FileManager.local(),dir=fm.joinPath(fm.documentsDirectory(),"YOS-JOURNAL"),file=fm.joinPath(dir,"latest.json");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=s=>{const v=String(s||"").trim();return /^https?:\/\/[^\s<>"\x27]+$/i.test(v)?v:""};
const valid=x=>{
 if(!x||!Array.isArray(x.articles))throw Error("articles 配列が必要です");
 const articles=x.articles.slice(0,15).map(a=>({
  category:String(a.category||"FEATURE").trim(),
  title:String(a.title||"").trim(),
  summary:String(a.summary||"").trim(),
  reason:String(a.reason||"").trim(),
  action:String(a.action||"").trim(),
  caveat:String(a.caveat||"").trim(),
  source:String(a.source||"").trim(),
  sourceDate:String(a.sourceDate||"").trim(),
  link:safeUrl(a.link),
  image:safeUrl(a.image),
  imageCaption:String(a.imageCaption||"").trim(),
  imageCredit:String(a.imageCredit||"").trim(),
  imageKind:a.imageKind==="illustrative"?"illustrative":"",
  keyPoints:Array.isArray(a.keyPoints)?a.keyPoints.slice(0,3).map(s=>String(s||"").trim()).filter(Boolean):[]
 })).filter(a=>a.title&&a.link&&a.summary&&a.reason&&a.source);
 if(!articles.length)throw Error("表示できる記事がありません");
 return {date:String(x.date||"発行日未確認"),issuedOn:/^\d{4}-\d{2}-\d{2}$/.test(x.issuedOn||"")?x.issuedOn:"",lead:String(x.lead||""),headline:String(x.headline||""),articles};
};

// YOS_JOURNAL_LOCAL_RELEVANCE_V1
// Device only. Public article JSON is never modified with private task data.
// Uses existing Scriptable Keychain credentials and existing private YOS sources.
const taskSourceId="965c6086-32c1-463d-93b4-87a9cb69b3ad";
// YOS_JOURNAL_TASK_SPECIFIC_V2: Do not treat a Money/Health area alone as article relevance.
// Requires at least two concrete task/article shared concepts; next actions are an additional gate.
const focusSignals=[
 ['家計',/家計/],['予算',/予算/],['食費',/食費/],['固定費',/固定費/],
 ['返済',/返済/],['借入',/借入|借金/],['支払',/支払|支払い/],['期限',/支払日|返済日|期限|期日/],
 ['銀行',/銀行/],['口座',/口座/],['残高',/残高/],['税金',/税金|所得税|住民税/],
 ['収入',/収入|給与|賃金/],['貯蓄',/貯金|貯蓄/],['給付',/給付|支援金/],
 ['就職',/就職|転職|求人|応募|採用/],['在宅',/在宅|リモート/],['面接',/面接/],
 ['タクシー',/タクシー|二種免許/],['勤務',/勤務|シフト/],['運転',/運転|免許/],
 ['健康',/健康|健康維持/],['睡眠',/睡眠|寝つき|入眠/],['ストレッチ',/ストレッチ|柔軟/],['運動',/運動|筋トレ/],
 ['皮膚',/皮膚|スキンケア/],['ニキビ',/ニキビ|にきび/],['毛穴',/毛穴/],
 ['眉毛',/眉毛|眉サロン|眉デザイン/],['美容室',/美容室|ヘアサロン/],['脱毛',/脱毛/],
 ['住宅',/住宅|住まい|賃貸/],['騒音',/騒音/],['防音',/防音/],['引越',/引越|引っ越し/],
 ['ごみ',/ごみ|ゴミ/],['収集',/収集日|収集曜日|分別|ごみ袋/],
 ['保証',/保証/],['返品',/返品|交換申請/],['配送',/配送|配達|再配達/],
];
const signalNames=text=>focusSignals.filter(([,re])=>re.test(String(text||''))).map(([name])=>name);
const taskScope=task=>{
 const m=String(task.area||'').match(/Money|Work|Health|Self|Life/i);
 return m?m[0]:'';
};
const propertyText=(p,key)=>Array.isArray(p?.[key])?p[key].map(x=>String(x?.plain_text||x?.text?.content||"")).join(""):"";
const propertyChoice=p=>p?.select?.name||p?.status?.name||"";
const currentStates=new Set(["次にやる","実行中","本人操作","待ち"]);
function normalizeNotionTask(row){
 const p=row?.properties||{};
 return {title:propertyText(p["やること"],"title").slice(0,180),
  state:propertyChoice(p["状態"]),priority:propertyChoice(p["優先度"]),
  due:p["期限"]?.date?.start||"",
  nextAction:propertyText(p["次の一手"],"rich_text").slice(0,240),
  blocker:propertyText(p["ブロッカー"],"rich_text").slice(0,240),
  completion:propertyText(p["完了条件"],"rich_text").slice(0,240),
  order:Number.isSafeInteger(p["実行順"]?.number)?p["実行順"].number:null,
  area:propertyChoice(p["領域"])};
}
async function readNotionTasks(token){
 let cursor=null,all=[];
 for(let i=0;i<5;i++){
  const req=new Request("https://api.notion.com/v1/data_sources/"+taskSourceId+"/query");
  req.method="POST";
  req.headers={"Authorization":"Bearer "+token,"Notion-Version":"2026-03-11","Content-Type":"application/json"};
  req.timeoutInterval=12;
  req.body=JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})});
  const data=await req.loadJSON();
  if(req.response?.statusCode!==200||!Array.isArray(data?.results))throw Error("Notionのタスク取得に失敗");
  all.push(...data.results.map(normalizeNotionTask));
  if(!data.has_more)return all;
  if(!data.next_cursor)throw Error("タスクの続きが不明");
  cursor=data.next_cursor;
 }
 throw Error("タスク取得上限のため現在地を確定できません");
}
async function readWidgetTasks(token){
 const req=new Request("https://project-y-yos-ai.vercel.app/api/yos/widget");
 req.method="GET";
 req.headers={"Authorization":"Bearer "+token,"Accept":"application/json"};
 req.timeoutInterval=10;
 const data=await req.loadJSON();
 if(req.response?.statusCode!==200||!Array.isArray(data?.tasks))throw Error("既存のTasks表示を取得できません");
 return data.tasks.map(t=>({title:String(t.title||""),state:String(t.state||""),
  priority:String(t.priority||""),due:String(t.due||""),nextAction:String(t.nextAction||""),
  blocker:"",completion:"",order:Number.isSafeInteger(t.order)?t.order:null,area:""}));
}
async function readLocalProgress(){
 if(typeof Keychain==="undefined")return {status:"unavailable",tasks:[],source:""};
 let error="";
 if(Keychain.contains("YOS_NOTION_INTEGRATION_TOKEN")){
  try{
   const token=String(Keychain.get("YOS_NOTION_INTEGRATION_TOKEN")||"").trim();
   if(token)return {status:"ready",tasks:await readNotionTasks(token),source:"notion"};
  }catch(e){error=String(e.message||e);}
 }
 if(Keychain.contains("MY_WAY_WIDGET_TOKEN")){
  try{
   const token=String(Keychain.get("MY_WAY_WIDGET_TOKEN")||"").trim();
   if(token)return {status:"partial",tasks:await readWidgetTasks(token),source:"widget"};
  }catch(e){error=String(e.message||e);}
 }
 return {status:error?"error":"unavailable",tasks:[],source:""};
}
function rankForLocalProgress(articles,progress,now=new Date()){
 const tasks=(progress.tasks||[]).filter(t=>['実行中','本人操作','次にやる'].includes(t.state)&&t.title).slice(0,500);
 const active=tasks.filter(t=>t.state==='実行中'||t.state==='本人操作');
 const next=tasks.filter(t=>t.state==='次にやる');
 const candidates=[...active,...next];
 const dateKey=new Date(now.getTime()+9*3600000).toISOString().slice(0,10);
 const today=Date.parse(dateKey+'T00:00:00Z');
 const ranked=articles.map((article,index)=>{
  const content=[article.title,article.summary,article.action,...(article.keyPoints||[])].join(' ');
  const articleSignals=signalNames(content); // Never count category or model-written 'reason' as evidence.
  const bodySignals=signalNames([article.summary,article.action,...(article.keyPoints||[])].join(' '));
  let best=null;
  for(const task of candidates){
   const taskContent=[task.title,task.nextAction,task.blocker,task.completion].join(' ');
   const taskSignals=signalNames(taskContent);
   const common=taskSignals.filter(sig=>articleSignals.includes(sig));
   // Two distinct concrete facts are required: e.g. '返済' AND '期日', not just 'Money'.
   if(common.length<2||!common.some(sig=>bodySignals.includes(sig)))continue;
   const nextSignals=signalNames([task.nextAction,task.blocker].join(' '));
   // If a concrete next action or blocker exists, the article must address it too.
   if(nextSignals.length&&!nextSignals.some(sig=>common.includes(sig)))continue;
   const level=(task.state==='実行中'||task.state==='本人操作')?2:1;
   const priority=({P0:60,P1:38,P2:16,P3:4})[task.priority]||0;
   const dueDate=Date.parse(task.due||'');
   const days=Number.isFinite(dueDate)?Math.floor((dueDate-today)/86400000):null;
   const deadline=days!==null&&days>=0&&days<=7?20:0;
   const taskOrder=Number.isSafeInteger(task.order)&&task.order>=1?Math.max(0,15-Math.min(task.order,15)):0;
   const score=priority+deadline+common.length*8+taskOrder;
   const match={level,score,state:task.state,scope:taskScope(task),evidence:common.slice(0,3)};
   if(!best||level>best.level||(level===best.level&&score>best.score))best=match;
  }
  return {...article,_yosMatch:best,_yosOriginalIndex:index};
 });
 if(!['ready','partial'].includes(progress.status))return {articles:ranked,status:'unavailable',matched:0,scope:'none'};
 // Exclude unrelated stories rather than promoting generic subject-matched articles.
 const matched=ranked.filter(a=>a._yosMatch).sort((a,b)=>
  b._yosMatch.level-a._yosMatch.level||b._yosMatch.score-a._yosMatch.score||a._yosOriginalIndex-b._yosOriginalIndex
 );
 const scope=matched.length?(matched[0]._yosMatch.level===2?'current':'next'):'none';
 return {articles:matched,status:progress.status,matched:matched.length,scope};
}
// End local-only progress logic.

let issue=null,warning="";
try{
 let incoming=args.shortcutParameter;
 if(incoming&&typeof incoming==="object"&&incoming.json)incoming=incoming.json;
 if(typeof incoming==="string"&&incoming.trim().startsWith("{")){issue=valid(JSON.parse(incoming));if(!fm.fileExists(dir))fm.createDirectory(dir,true);fm.writeString(file,JSON.stringify(issue))}
 if(!issue){try{const req=new Request("https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/ios-app/scriptable/journal/latest.json");req.timeoutInterval=12;const response=await req.loadString();if(req.response?.statusCode!==200)throw Error("HTTP "+req.response?.statusCode);issue=valid(JSON.parse(response));if(!fm.fileExists(dir))fm.createDirectory(dir,true);fm.writeString(file,JSON.stringify(issue))}catch(e){warning="最新版取得不可："+String(e.message||e)}}
 if(!issue&&fm.fileExists(file))issue=valid(JSON.parse(fm.readString(file)));
}catch(e){warning=String(e.message||e)}
let relevance={status:"unavailable",matched:0,articles:issue?.articles||[]};
try{
 if(issue){const local=await readLocalProgress();relevance=rankForLocalProgress(issue.articles,local);}
}catch(_){relevance={status:"unavailable",matched:0,articles:issue?.articles||[]};}
if(issue)issue.articles=relevance.articles;
const issueHeadline=issue?.articles?.[0]?.title||(relevance.status!=='unavailable'?'今のタスクに直接役立つ記事は未発見':issue?.headline)||'今日の視点を、明日の力に。';
const todayJst=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const issueStatus=!issue?"取得できませんでした":issue.issuedOn?(issue.issuedOn===todayJst?"本日号":issue.issuedOn<todayJst?"保存済みの過去号":"発行日を確認してください"):"発行日未確認";
const ageDays=issue?.issuedOn&&/^\d{4}-\d{2}-\d{2}$/.test(issue.issuedOn)
 ?Math.floor((Date.parse(todayJst+"T00:00:00Z")-Date.parse(issue.issuedOn+"T00:00:00Z"))/86400000):null;
const ageLabel=issueStatus==="保存済みの過去号"&&Number.isFinite(ageDays)&&ageDays>=1?" · "+ageDays+"日前":"";
const editionLabel=issueStatus+ageLabel;
const issueNote=warning||issueStatus!=="本日号"?`<div class="notice" role="status"><strong>${esc(editionLabel)}</strong>${issue?.issuedOn?`<p>発行日：${esc(issue.issuedOn)}</p>`:""}${warning?`<p>${esc(warning)}</p>`:""}</div>`:"";
const relevanceLabel=relevance.status==='ready'
 ?relevance.matched?(relevance.scope==='current'?'取り組み中タスクに対応する記事候補 ':'次にやるタスクに対応する記事候補 ')+relevance.matched+'件':'現在のタスクに具体的に一致する記事は、この号にありません'
 :relevance.status==='partial'?'既存タスク表示（最大3件）の部分照合 · '+relevance.matched+'件'
 :'Notionの現在地は未照合 · 一般記事を表示中';
const relevanceBadge='<div class="notice" role="status"><strong>'+esc(relevanceLabel)+'</strong><p>記事とタスクの具体的な共通点を確認した参考候補です。制度の対象条件・本人への適用・最新の事実は未検証です。</p></div>';
const leadArticle=issue?.articles?.[0];
const coverPhoto=leadArticle?.image?`<div class="cover-photo"><img src="${esc(leadArticle.image)}" alt="${esc(leadArticle.imageCaption||"巻頭記事の写真")}" />${leadArticle.imageKind==="illustrative"?'<span class="image-label">イメージ写真</span>':""}</div>`:"";
const stories=(issue?.articles||[]).map((a,i)=>{
 const number=String(i+1).padStart(2,"0");
 const photo=a.image?`<figure class="story-photo"><img loading="lazy" src="${esc(a.image)}" alt="${esc(a.imageCaption||a.title)}"/>${a.imageCaption||a.imageKind==="illustrative"||a.imageCredit?`<figcaption>${a.imageKind==="illustrative"?"イメージ写真":""}${a.imageCaption?` · ${esc(a.imageCaption)}`:""}${a.imageCredit?` · 写真：${esc(a.imageCredit)}`:""}</figcaption>`:""}</figure>`:"";
 const keyPoints=a.keyPoints.length?`<ul class="key-points">${a.keyPoints.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>`:"";
 const brief=a.summary?`<section class="brief"><div class="section-label"><span>THE BRIEF</span><span>この記事の要約</span></div><p>${esc(a.summary)}</p>${keyPoints}</section>`:"";
 const localReason=a._yosMatch?'<div class="local-match">'+esc(a._yosMatch.scope||'タスク')+' · '+esc(a._yosMatch.state)+' · 記事と一致する具体項目：'+esc(a._yosMatch.evidence.join('・'))+'（適用条件は未確認）</div>':"";
 const reason=a.reason?`<section class="personal"><div class="section-label"><span>WHY IT MATTERS</span><span>今の自分に必要な理由</span></div><p>${esc(a.reason)}</p></section>`:"";
 const caveat=a.caveat?`<p class="caveat"><b>確認事項</b> ${esc(a.caveat)}</p>`:"";
 const action=a.action?`<section class="next-move"><span>YOUR NEXT MOVE / 今日の一歩</span><p>${esc(a.action)}</p></section>`:"";
 return `<article id="story-${i+1}" class="story ${i===0?"top-story":""}">${photo}<div class="inner"><div class="story-topline"><span>${number} / ${String(issue.articles.length).padStart(2,"0")}</span><span>${esc(a.category)}</span></div><h2>${esc(a.title)}</h2>${brief}${localReason}${reason}${caveat}${action}<a class="read-link" href="${esc(a.link)}" rel="noopener noreferrer" target="_blank">元の記事を読む <span aria-hidden="true">↗</span></a><footer><strong>出典：</strong> ${esc(a.source)}<span class="source-date">掲載・更新日：${esc(a.sourceDate||"未確認")}</span></footer></div></article>`;
}).join("");
const indexNav=issue?.articles?.length?`<nav class="issue-index" aria-label="今号の記事目次"><div class="index-heading"><span>IN THIS ISSUE</span><span>${issue.articles.length} STORIES</span></div><ol>${issue.articles.map((a,i)=>`<li><a href="#story-${i+1}"><span>${String(i+1).padStart(2,"0")} · ${esc(a.category)}</span><strong>${esc(a.title)}</strong></a></li>`).join("")}</ol></nav>`:"";
const css=`*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#151719;color:#f6f2ea;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN",sans-serif;-webkit-font-smoothing:antialiased}
.cover{position:relative;min-height:530px;padding:calc(env(safe-area-inset-top) + 30px) 25px 30px;display:flex;flex-direction:column;justify-content:space-between;isolation:isolate;background:linear-gradient(145deg,#292a2a,#101214);overflow:hidden}.cover-photo{position:absolute;inset:0;z-index:-2}.cover-photo img{width:100%;height:100%;object-fit:cover;filter:brightness(.57) saturate(.78)}.cover-photo:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,7,8,.52) 0%,rgba(7,8,9,.10) 38%,rgba(0,0,0,.90) 100%)}
.mast{display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:1px solid rgba(255,255,255,.42);padding-bottom:15px;color:#f6f2ea;font-weight:700;letter-spacing:.18em;font-size:10px}.logo{font-size:clamp(49px,13vw,76px);letter-spacing:-.085em;font-family:Georgia,"Times New Roman",serif;line-height:.84;font-weight:700;margin:24px 0 14px}.logo span{display:block}.cover-tag{color:#e6b29a;letter-spacing:.14em;font-size:10px;font-weight:700}.cover-main{padding-top:45px}.cover-number{display:block;color:#edb18d;font-size:10px;font-weight:800;letter-spacing:.17em;margin-bottom:18px}.cover-headline{font-size:clamp(29px,8vw,42px);line-height:1.3;font-weight:800;letter-spacing:-.045em;margin:0;text-wrap:pretty}.cover-lead{font-size:15px;line-height:1.75;color:#e2ded7;margin:17px 0}.issue-meta{display:flex;justify-content:space-between;gap:8px;border-top:1px solid rgba(255,255,255,.35);padding-top:12px;color:#dcd5cd;letter-spacing:.07em;font-size:11px}.image-label{position:absolute;top:90px;right:15px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:4px 8px}
.notice{margin:16px;padding:15px 18px;background:#332d24;color:#f5d6b0;border-left:3px solid #e6b29a}.notice p{margin:6px 0 0;font-size:12px;line-height:1.6}
main{padding:0 0 35px}.story{background:#f5f2eb;color:#17191b;margin:18px 13px 24px;overflow:hidden;border-radius:2px}.story.top-story{margin-top:24px}.story-photo{margin:0;background:#d3cfca}.story-photo img{display:block;width:100%;height:260px;object-fit:cover}.story-photo figcaption{color:#555b5d;font-size:11px;padding:8px 17px;background:#ebe6df}.inner{padding:24px 21px 28px}.story-topline{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #bbb7af;padding-bottom:13px;gap:12px;font-size:10px;letter-spacing:.12em;font-weight:800;color:#a55a3d}.story h2{font-size:clamp(28px,8vw,40px);letter-spacing:-.055em;line-height:1.31;font-weight:850;margin:21px 0 24px;text-wrap:pretty}.top-story h2{font-size:clamp(30px,9vw,44px)}.section-label{display:flex;gap:8px;align-items:baseline;justify-content:space-between;font-size:10px;letter-spacing:.11em;font-weight:800;color:#a45f46;border-bottom:1px solid #d2cdc4;padding-bottom:9px}.section-label span:last-child{font-size:11px;letter-spacing:0;color:#6c6862}.brief p{font-size:17px;line-height:1.85;letter-spacing:.01em;color:#262a2d;margin:14px 0 23px;overflow-wrap:anywhere}.key-points{margin:-2px 0 23px;padding-left:22px;color:#3f4548;font-size:15px;line-height:1.75}.key-points li{margin:8px 0}.personal{background:#ece8e0;padding:17px 16px;margin-bottom:19px}.personal .section-label{border-color:#c9c0b6}.personal p{font-size:15px;line-height:1.75;color:#3d4145;margin:12px 0 0}.caveat{font-size:13px;line-height:1.7;color:#725336;margin:0 0 15px}.next-move{background:#20272e;color:#fff;padding:19px 17px}.next-move span{font-size:10px;letter-spacing:.13em;color:#e3b99b;font-weight:800}.next-move p{margin:10px 0 0;font-size:16px;line-height:1.7;color:#f5f2ea;font-weight:600}.read-link{display:flex;align-items:center;justify-content:space-between;background:transparent;color:#1c252d;text-decoration:none;border-bottom:2px solid #1c252d;padding:15px 0;margin-top:15px;font-weight:800;font-size:15px}.read-link span{font-size:20px}footer{color:#6c6f70;font-size:11px;line-height:1.6;margin-top:16px}.empty{padding:55px 25px 90px}.empty h2{font-size:30px}.empty p{color:#bbb;font-size:16px;line-height:1.7}@media(max-width:360px){.cover{min-height:480px;padding-left:20px;padding-right:20px}.inner{padding:22px 17px}.story{margin-left:9px;margin-right:9px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;
const editorialCss=`
.edition-state{display:inline-block;border:1px solid rgba(255,255,255,.55);padding:6px 10px;margin:0 0 15px;border-radius:2px;font-size:12px;font-weight:800;letter-spacing:.04em;background:rgba(14,17,20,.58);color:#fff}
.edition-state.past{background:#4a3227;border-color:#e0ae8f;color:#fff1df}
.issue-index{margin:0 13px 16px;padding:22px 20px 10px;background:#24282b;color:#f3ede3;border-top:2px solid #dfad86}
.index-heading{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.13em;font-weight:800;color:#e3b99b;padding-bottom:12px;border-bottom:1px solid #596063}
.issue-index ol{list-style:none;margin:0;padding:0}.issue-index li+li{border-top:1px solid #44494a}
.issue-index a{display:flex;flex-direction:column;gap:7px;padding:14px 0;text-decoration:none;color:#f6f2ea}
.issue-index a span{font-size:11px;font-weight:800;letter-spacing:.07em;color:#e3b99b}
.issue-index a strong{font-size:16px;line-height:1.55;font-weight:700}
.source-date{display:block;margin-top:5px}.story:target{outline:2px solid #b16c49;outline-offset:2px}
.story:not(.top-story) .story-photo img{height:205px}.story:not(.top-story) .inner{padding-top:20px}
@media(min-width:700px){.issue-index{max-width:900px;margin:0 auto 24px}.issue-index ol{display:grid;grid-template-columns:1fr 1fr;column-gap:28px}.issue-index li:nth-child(2){border-top:0}.story{max-width:900px;margin-left:auto;margin-right:auto}}
`;
const localCss='.local-match{padding:12px 15px;background:#2e3836;border-left:3px solid #a3c0b1;margin:17px 0;color:#f6f2ea;font-size:12px;font-weight:700;line-height:1.7}';
const html=`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta charset="utf-8"><title>YOS JOURNAL</title><style>${css}${editorialCss}${localCss}</style></head><body><header class="cover">${coverPhoto}<div><div class="mast"><span>PERSONAL MAGAZINE</span><span>DAILY / YOS</span></div><h1 class="logo"><span>YOS</span><span>JOURNAL.</span></h1><div class="cover-tag">THE EDITION MADE FOR ONE.</div></div><div class="cover-main"><span class="edition-state ${issueStatus==="保存済みの過去号"?"past":""}">${esc(editionLabel)}</span><span class="cover-number">COVER STORY — 01</span><h2 class="cover-headline">${esc(issueHeadline)}</h2><p class="cover-lead">${esc(issue?.lead||"今の自分に、読む価値のある情報だけを。")}</p><div class="issue-meta"><span>${esc(issue?.date||new Date().toLocaleDateString("ja-JP"))}</span><span>${issue?.articles.length||0} STORIES</span></div></div></header>${issueNote}${relevanceBadge}${indexNav}<main>${stories||`<section class="empty"><small>AWAITING EDITION</small><h2>朝刊を取得できませんでした。</h2><p>通信状況と公開状況を確認してください。</p>${warning?`<p>${esc(warning)}</p>`:""}</section>`}</main></body></html>`;
const web=new WebView();await web.loadHTML(html);await web.present(false);Script.complete();
