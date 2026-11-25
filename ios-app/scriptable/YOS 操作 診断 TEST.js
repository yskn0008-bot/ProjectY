// Variables used by Scriptable.
// icon-color: blue; icon-glyph: list;
// YOS_SCRIPT_NAME: YOS 操作 診断 TEST
function launcherCore(input) {
  const normalize = s => s.normalize("NFKC").toLocaleLowerCase("ja").trim().replace(/\s+/g," ");
  if(!input || !Array.isArray(input.names) || input.names.length>5000) throw Error("NAMES_UNAVAILABLE");
  const counts=new Map();
  for(const n of input.names) {
    if(typeof n!=="string"||!n.trim()||n.length>500||/[\u0000-\u001f]/.test(n)) throw Error("INVALID_NAME");
    counts.set(n,(counts.get(n)||0)+1);
  }
  const rows=[...counts].filter(([n,c])=>n!=="操作").map(([name,count],id)=>({id:String(id),name,count,ambiguous:count!==1}));
  const byId=new Map(rows.map(r=>[r.id,r]));
  const validIds = names => Array.isArray(names)?[...new Set(names)].filter(n=>typeof n==="string").map(n=>rows.find(r=>r.name===n&&!r.ambiguous)).filter(Boolean).map(r=>r.id):[];
  const pins=validIds(input.pins).slice(0,6), recent=validIds(input.recent).slice(0,4);
  const aliases=new Map([["yos core","ai 相談 判断"],["daystream","予定 タスク 今日"],["yos taxi","仕事 営業"],["journal","記事 読む"]]);
  function search(query) {
    if(typeof query!=="string"||query.length>500) return [];
    const q=normalize(query), tokens=q.split(" ").filter(Boolean);
    return rows.map(r=>{
      const n=normalize(r.name), a=[...aliases].filter(([k])=>n===k||n===`yos ${k}`).map(([,v])=>v).join(" ");
      const text=n+" "+a;
      if(!tokens.every(t=>text.includes(t)))return null;
      const rank=q?(n===q?100:n.startsWith(q)?70:n.includes(q)?50:20):0;
      return {r,rank:rank+(pins.includes(r.id)?4:0)+(recent.includes(r.id)?2:0)};
    }).filter(Boolean).sort((a,b)=>b.rank-a.rank||a.r.name.localeCompare(b.r.name,"ja")).map(x=>x.r);
  }
  function resolve(selection) {
    if(!selection||typeof selection!=="object"||!["run","edit","ai"].includes(selection.action)||typeof selection.id!=="string")return {status:"cancel"};
    const r=byId.get(selection.id);
    if(!r||r.ambiguous)return {status:"blocked",reason:"UNKNOWN_OR_DUPLICATE"};
    if(selection.action==="ai"&&r.name!=="YOS CORE")return {status:"blocked",reason:"AI_TARGET"};
    return {status:"selected",action:selection.action,name:r.name};
  }
  return {rows,pins,recent,search,resolve};
}

function launcherHTML(input, coreSource) {
 const payload=JSON.stringify(input).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
 return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><title>操作</title><style>
 :root{color-scheme:light dark;--bg:#eef1f4;--card:#fff;--ink:#203045;--muted:#536578;--line:#dce3eb;--accent:#425f91;--soft:#e2eaf7;--green:#deebe5;--violet:#e9e3f3}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px -apple-system,BlinkMacSystemFont,sans-serif}main{max-width:550px;margin:auto;padding:24px 18px 140px}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}h1{font-size:34px;margin:4px 0;letter-spacing:-1px}h2{font-size:17px;margin:22px 0 10px}small,.muted{color:var(--muted);font-size:13px}button,input{font:inherit;color:inherit}button{border:0;border-radius:14px;min-height:44px;background:var(--card);cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}button:disabled{opacity:.5}#pins{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pin{text-align:left;padding:14px;min-height:84px;background:var(--soft);overflow-wrap:anywhere}.pin:nth-child(2n){background:var(--green)}.pin:nth-child(3n){background:var(--violet)}.row{display:flex;gap:6px;align-items:stretch;border-bottom:1px solid var(--line);padding:4px}.row:last-child{border:0}.row button:first-child{flex:1;text-align:left;min-width:0;padding:10px;overflow-wrap:anywhere}.row button:last-child{min-width:48px;color:var(--accent);font-weight:600}.list{background:var(--card);border-radius:16px;overflow:hidden}.dock{position:fixed;bottom:0;left:0;right:0;background:var(--bg);padding:10px 16px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--line)}.dockinner{display:flex;gap:8px;max-width:550px;margin:auto}input{width:100%;min-width:0;border:1px solid var(--line);background:var(--card);border-radius:14px;padding:12px;min-height:48px;font-size:16px}#ai{background:var(--accent);color:white;min-width:56px;padding:0 12px}#status{padding:6px 0;min-height:22px;max-width:550px;margin:auto}#cancel{padding:0 12px;color:var(--muted)}[hidden]{display:none!important}@media(prefers-color-scheme:dark){:root{--bg:#19202a;--card:#252e3a;--ink:#f3f5f9;--muted:#bac7d6;--line:#3a4657;--accent:#7695ce;--soft:#303f58;--green:#29483f;--violet:#41364e}#ai{color:#142134}}@media(prefers-reduced-motion:no-preference){button{transition:background-color .1s}button:active{opacity:.78}}@media(max-width:340px){main{padding-inline:12px}.pin{padding:10px}}</style></head><body><main><header><div><small>YOS / COMMAND CENTER</small><h1>操作</h1><div class="muted" id="scope"></div></div><button id="cancel" type="button">取消</button></header><section id="home"><h2>お気に入り</h2><div id="pins"></div><p id="noPins" class="muted" hidden>固定された項目はありません。</p><h2>最近の操作</h2><div id="recent" class="list"></div><p id="noRecent" class="muted" hidden>履歴はまだありません。</p></section><h2 id="heading">ショートカット</h2><div id="results" class="list"></div><p class="muted" id="more"></p></main><footer class="dock"><div id="status" class="muted" role="status">検索・実行・編集</div><div class="dockinner"><input id="q" type="search" placeholder="機能名・キーワードを検索" aria-label="ショートカット検索" maxlength="500" autocomplete="off"><button id="ai" type="button" aria-label="YOS COREを選択">AI</button></div></footer><script>
 const input=${payload};const core=(${coreSource})(input);let selection=null;let limit=80;const $=id=>document.getElementById(id);const mk=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
 function choose(r,action){if(selection)return;if(r.ambiguous)return;const choice={id:r.id,action};if(core.resolve(choice).status!=="selected")return;selection=choice;$("status").textContent="選択："+r.name+"／"+({run:"実行",edit:"編集",ai:"AI"}[action])+"。画面を閉じて確定。";document.querySelectorAll("button").forEach(b=>b.disabled=b.id!=="cancel");$("q").disabled=true}
 function row(r){const div=mk("div");div.className="row";const b=mk("button",r.name+(r.ambiguous?"（同名・選択不可）":""));b.type="button";b.disabled=r.ambiguous;b.onclick=()=>choose(r,"run");const edit=mk("button","編集");edit.type="button";edit.disabled=r.ambiguous;edit.setAttribute("aria-label",r.name+" を編集");edit.onclick=()=>choose(r,"edit");div.append(b,edit);return div}
 function render(){const q=$("q").value;const matches=core.search(q);$("home").hidden=!!q.trim();$("heading").textContent=q.trim()?"検索結果":"ショートカット";$("results").replaceChildren(...matches.slice(0,limit).map(row));$("more").replaceChildren(mk("span",matches.length+" 件"));if(matches.length>limit){const b=mk("button","さらに表示");b.type="button";b.onclick=()=>{limit+=80;render()};$("more").append(b)}if(!matches.length)$("results").append(mk("p","該当なし"))}
 const index=new Map(core.rows.map(r=>[r.id,r]));$("scope").textContent="今回取得：ショートカット "+core.rows.length+" 種類（他の資産は未接続）";$("noPins").hidden=!!core.pins.length;$("noRecent").hidden=!!core.recent.length;for(const id of core.pins){const r=index.get(id);const b=mk("button",r.name);b.className="pin";b.type="button";b.onclick=()=>choose(r,"run");$("pins").append(b)}$("recent").replaceChildren(...core.recent.map(id=>row(index.get(id))));$("q").addEventListener("input",()=>{limit=80;render()});const ai=core.rows.find(r=>r.name==="YOS CORE"&&!r.ambiguous);$("ai").disabled=!ai;$("ai").onclick=()=>{if(ai)choose(ai,"ai")};$("cancel").onclick=()=>{selection={action:"cancel"};$("status").textContent="取消。画面を閉じて終了。";document.querySelectorAll("button").forEach(b=>b.disabled=true);$("q").disabled=true};window.readLauncherSelection=()=>selection;render();
 </script></body></html>`;
}

function prepareLauncherPayload(raw) {
  if(typeof raw==="string"){if(raw.length>3000000)throw Error("INPUT_TOO_LARGE");raw=JSON.parse(raw)}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("INPUT_INVALID");
  const copy={names:Array.isArray(raw.names)?raw.names.slice():null,pins:Array.isArray(raw.pins)?raw.pins.slice(0,100):[],recent:Array.isArray(raw.recent)?raw.recent.slice(0,100):[]};
  launcherCore(copy);
  return {input:copy,mode:raw.mode==="native"?"native":"web"};
}

async function showLauncherDiagnostic(raw, deps) {
  let prepared, core;
  try{prepared=prepareLauncherPayload(raw);core=launcherCore(prepared.input)}catch(_){return {status:"blocked",reason:"INVALID_INPUT",diagnostic:true}}
  let selected=null;
  try{
    if(prepared.mode==="native"){
      const t=new deps.UITable(), index=new Map(core.rows.map(r=>[r.id,r]));
      t.showSeparators=true;
      const choose=(r,action)=>{if(selected===null&&core.resolve({id:r.id,action}).status==="selected")selected={id:r.id,action}};
      const heading=(title,sub)=>{const row=new deps.UITableRow();row.isHeader=true;row.height=48;row.addText(title,sub);t.addRow(row)};
      const add=(r,action,subtitle)=>{if(!r)return;const row=new deps.UITableRow();row.height=56;row.addText(r.name,subtitle);if(!r.ambiguous){row.dismissOnSelect=true;row.onSelect=()=>choose(r,action)}t.addRow(row)};
      heading("操作","診断：選択のみ。機能は実行しません。");
      const ai=core.rows.find(r=>r.name==="YOS CORE"&&!r.ambiguous);
      if(ai)add(ai,"ai","AIに任せる");
      if(core.pins.length){heading("お気に入り","固定");for(const id of core.pins)add(index.get(id),"run","実行")}
      if(core.recent.length){heading("最近の操作","選択履歴");for(const id of core.recent)add(index.get(id),"run","実行")}
      heading("すべてのショートカット","検索はWeb表示または標準選択へ");
      // Limit the native test UI; do not silently hide scope.
      for(const r of core.search("").slice(0,200)){
        add(r,"run",r.ambiguous?"同名のため選択不可":"実行");
        if(!r.ambiguous)add(r,"edit","編集");
      }
      if(core.rows.length>200)heading("表示上限","残りは標準選択またはWeb検索へ");
      await t.present(true);
    }else{
      const w=new deps.WebView();
      await w.loadHTML(launcherHTML(prepared.input,launcherCore.toString()));
      await w.present(true);
      selected=await w.evaluateJavaScript("window.readLauncherSelection ? window.readLauncherSelection() : null",false);
    }
    const choice=core.resolve(selected);
    return {...choice,mode:prepared.mode,diagnostic:true,executed:false};
  }catch(_){return {status:"blocked",reason:"DISPLAY_OR_RETURN_FAILED",mode:prepared.mode,diagnostic:true,executed:false}}
}

function resolveLauncherHandoff(receipt, freshNames) {
  if(!receipt||receipt.status!=="selected"||receipt.diagnostic!==true||receipt.executed!==false||!["run","edit","ai"].includes(receipt.action)||typeof receipt.name!=="string"||receipt.name==="操作")return {status:"blocked"};
  if(!Array.isArray(freshNames)||freshNames.some(n=>typeof n!=="string")||freshNames.filter(n=>n===receipt.name).length!==1)return {status:"blocked"};
  if(receipt.action==="ai"&&receipt.name!=="YOS CORE")return {status:"blocked"};
  // This is only an execution plan, not authorization or an actual launch.
  return {status:"ready_for_explicit_confirmation",name:receipt.name,action:receipt.action,...(receipt.action==="edit"?{editURL:"shortcuts://open-shortcut?name="+encodeURIComponent(receipt.name)}:{})};
}

function diagnosticFixture(mode) {
  return {names:["TEST 予定","TEST 記録","TEST 検索","TEST 共有","TEST 編集","TEST 重複","TEST 重複","YOS CORE"],pins:["TEST 予定","TEST 記録","TEST 検索","TEST 共有"],recent:[],mode};
}

async function launcherV03(raw,deps) {
 const clock=deps.clock;
 const start=clock();
 let rawInput=raw, fixture=false, prepared, core;
 if(raw===undefined||raw===null){fixture=true;const a=new deps.Alert();a.title="操作｜速度・返却 TEST";a.message="架空データのみ。機能は実行せず、選択結果と時間を表示します。";a.addAction("高品質画面（Web）");a.addAction("高速画面（Native）");a.addCancelAction("終了");const m=await a.presentSheet();if(m!==0&&m!==1)return {status:"cancel",diagnostic:true,executed:false,fixture:true};rawInput=diagnosticFixture(m===0?"web":"native");}
 try{prepared=prepareLauncherPayload(rawInput);core=launcherCore(prepared.input)}catch(_){return {status:"blocked",reason:"INVALID_INPUT",diagnostic:true,executed:false,fixture}}
 let selected=null, ready=null, tap=null;const init=clock();
 const choose=(r,action)=>{if(selected!==null)return;if(core.resolve({id:r.id,action}).status==="selected"){selected={id:r.id,action};tap=clock()}};
 try{
  if(prepared.mode==="native"){
   const table=new deps.UITable(), index=new Map(core.rows.map(r=>[r.id,r]));table.showSeparators=true;
   const heading=(title,detail)=>{const row=new deps.UITableRow();row.isHeader=true;row.height=48;row.addText(title,detail);table.addRow(row)};
   const add=(r,subtitle)=>{if(!r)return;const row=new deps.UITableRow();row.height=58;const label=row.addText(r.name,r.ambiguous?"同名・選択不可":subtitle);if(label)label.widthWeight=76;
    if(!r.ambiguous){row.dismissOnSelect=true;row.onSelect=()=>choose(r,"run");const b=row.addButton("編集");b.widthWeight=24;b.dismissOnTap=true;b.onTap=()=>choose(r,"edit")}table.addRow(row)};
   heading("操作",fixture?"架空データ・診断のみ":"今回取得した実名・診断のみ");
   const ai=core.rows.find(r=>r.name==="YOS CORE"&&!r.ambiguous);if(ai){const row=new deps.UITableRow();row.height=58;row.addText("AIに任せる","選択のみ");row.dismissOnSelect=true;row.onSelect=()=>choose(ai,"ai");table.addRow(row)}
   if(core.pins.length){heading("お気に入り","固定");for(const id of core.pins)add(index.get(id),"実行")}
   if(core.recent.length){heading("最近の操作","選択履歴");for(const id of core.recent)add(index.get(id),"実行")}
   heading("ショートカット","最大200種類・検索はWebで");
   for(const r of core.search("").slice(0,200))add(r,"実行");
   if(core.rows.length>200)heading("表示上限","残りはWeb検索へ");
   ready=clock();await table.present(true);
  }else{
   const w=new deps.WebView();await w.loadHTML(launcherHTML(prepared.input,launcherCore.toString()));ready=clock();await w.present(true);
   selected=await w.evaluateJavaScript("window.readLauncherSelection ? window.readLauncherSelection() : null",false);
  }
  const end=clock(), choice=core.resolve(selected);
  const elapsed=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>=a?Math.round(b-a):null;
  return {...choice,mode:prepared.mode,diagnostic:true,executed:false,fixture,scope:core.rows.length,timing:{prepareMs:elapsed(init,ready),presentToReturnMs:elapsed(ready,end),tapToReturnMs:elapsed(tap,end),totalMs:elapsed(start,end),includesModeMenu:fixture},timingNote:"prepareはpresent呼出し前まで。描画完了・目的達成の時間ではない。Webのtap時刻は未取得。"};
 }catch(_){return {status:"blocked",reason:"DISPLAY_OR_RETURN_FAILED",mode:prepared.mode,diagnostic:true,executed:false,fixture}}
}

async function launcherV03Entry(raw,deps){
 const receipt=await launcherV03(raw,deps);
 if(receipt.fixture&&receipt.status!=="cancel"){const a=new deps.Alert();a.title=receipt.status==="selected"?"選択返却："+receipt.name:"診断停止";a.message=JSON.stringify(receipt,null,2);a.addAction("閉じる");await a.presentAlert();}
 deps.Script.setShortcutOutput(JSON.stringify(receipt));deps.Script.complete();return receipt;
}

// Isolated test; no real operation.
await launcherV03Entry(args.shortcutParameter,{Alert,UITable,UITableRow,WebView,Script,clock:()=>Date.now()});
