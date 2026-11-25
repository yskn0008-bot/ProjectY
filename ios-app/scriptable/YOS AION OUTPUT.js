// Variables used by Scriptable.
// icon-color: purple; icon-glyph: comment-alt;
// YOS_SCRIPT_NAME: YOS AION OUTPUT
// Local read-only display and explicit user selection.
function parseOutput(input){
 const fail=reason=>({ok:false,reason});
 if(typeof input==="string"){
  const trimmed=input.trim();
  if(trimmed.startsWith("{")&&input.length<=200000){try{const parsed=JSON.parse(input);if(parsed&&typeof parsed.answer==="string")input=parsed;else input={answer:input}}catch(_){input={answer:input}}}
  else input={answer:input};
 }
 if(!input||typeof input!=="object"||Array.isArray(input)||typeof input.answer!=="string"||!input.answer.trim())return fail("invalid_input");
 if(input.answer.length>120000)return fail("answer_too_long");
 const choices=Array.isArray(input.choices)&&input.choices.length<=6&&input.choices.every(x=>typeof x==="string"&&x.trim()&&x.length<=180)?input.choices.map(x=>x.trim()):[];
 return {ok:true,answer:input.answer,choices:[...new Set(choices)],canSave:input.canSave===true};
}

function decideOutput(packet,event){
 const fallback=reason=>({status:"held",action:"standard",reason,answer:packet?.ok?packet.answer:""});
 if(!packet?.ok)return fallback(packet?.reason||"invalid");
 if(!event||typeof event!=="object"||event.confirmed!==true)return {status:"ok",action:"finish",answer:packet.answer};
 if(event.action==="choice"&&Number.isInteger(event.index)&&event.index>=0&&event.index<packet.choices.length)return {status:"ok",action:"follow_up",answer:packet.answer,followUp:packet.choices[event.index],inputKind:"choice"};
 if(event.action==="text"&&typeof event.text==="string"&&event.text.trim()&&event.text.length<=4000)return {status:"ok",action:"follow_up",answer:packet.answer,followUp:event.text.trim(),inputKind:"text"};
 if(event.action==="save"&&packet.canSave)return {status:"ok",action:"save_request",answer:packet.answer};
 if(event.action==="standard"||event.action==="finish")return {status:"ok",action:event.action,answer:packet.answer};
 return fallback("invalid_event");
}

function nextTurn(history,currentUser,answer,followUp){
 const bad=reason=>({ok:false,reason});
 if(!Array.isArray(history)||history.length%2!==0||history.length>12||history.some((x,i)=>!x||x.role!==(i%2?"assistant":"user")||typeof x.text!=="string"||!x.text.trim()))return bad("invalid_history");
 if([currentUser,answer,followUp].some(x=>typeof x!=="string"||!x.trim())||followUp.length>4000)return bad("invalid_turn");
 if(history.length>=12)return bad("turn_limit");
 const payload={history:[...history.map(({role,text})=>({role,text})),{role:"user",text:currentUser},{role:"assistant",text:answer}],currentUser:followUp};
 if(JSON.stringify(payload).length>30000)return bad("context_limit");
 return {ok:true,...payload};
}

// Optional display-only metadata; never grants an execution permission.
function displayMeta(input){
 const p=input?.presentation;
 const text=(v,max)=>typeof v==="string"&&v.trim()&&v.length<=max?v.trim():"";
 if(!p||typeof p!=="object"||Array.isArray(p))return {mode:"read",title:"回答",summary:"",sources:[]};
 const mode=["read","decide","act"].includes(p.mode)?p.mode:"read";
 return {mode,title:text(p.title,80)||({read:"回答",decide:"確認・判断",act:"次の行動"}[mode]),summary:text(p.summary,1800),sources:Array.isArray(p.sources)?p.sources.slice(0,12).map(x=>text(x,500)).filter(Boolean):[]};
}
function pageHTML(packet){
 const data=JSON.stringify(packet).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
 return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><style>
 :root{color-scheme:light dark;--bg:#f5eedf;--fg:#292820;--panel:#faf3e5;--muted:#665f51;--line:#d5c9b4;--accent:#365b8a;--fs:16px;--lh:1.42;--viewport-height:100dvh} @media(prefers-color-scheme:dark){:root{--bg:#131417;--fg:#eaecef;--panel:#202227;--muted:#b0b3bc;--line:#383b43;--accent:#8db5ff}} :root[data-theme="dark"]{color-scheme:dark;--bg:#131417;--fg:#eaecef;--panel:#202227;--muted:#b0b3bc;--line:#383b43;--accent:#8db5ff} :root[data-theme="light"]{color-scheme:light;--bg:#f5eedf;--fg:#292820;--panel:#faf3e5;--muted:#665f51;--line:#d5c9b4;--accent:#365b8a}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:var(--fs)/1.42 -apple-system,BlinkMacSystemFont,sans-serif;overflow-wrap:anywhere;line-height:var(--lh);height:100vh;height:var(--viewport-height);display:flex;flex-direction:column;overflow:hidden}header{position:sticky;top:0;z-index:2;background:var(--bg);padding:5px 12px;flex:none;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:7px;flex-wrap:wrap}header strong{margin-right:auto;letter-spacing:.08em}button,textarea{font:inherit;color:inherit;background:var(--panel);border:1px solid var(--line);border-radius:10px}button{min-width:44px;min-height:44px;padding:6px 10px;cursor:pointer}button:disabled{opacity:.4}main{width:100%;max-width:760px;margin:0 auto;padding:12px 16px 16px;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scroll-padding-bottom:20px}article{white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}article .blank{height:.38em;line-height:.38em}article strong{font-weight:650}article li{margin:2px 0}article div{min-width:0}h1{font-size:1.28em;line-height:1.3;margin:3px 0 8px;font-weight:680}.eyebrow{font-size:12px;color:var(--muted);margin:0 0 2px}.summary{border-left:3px solid var(--accent);padding:3px 0 3px 12px;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:10px}#viewToggle{margin:0 0 10px;color:var(--accent)}details{margin:8px 0}summary{min-height:44px;display:list-item;padding:10px 0;cursor:pointer;color:var(--accent)}#sources p{font-size:13px;overflow-wrap:anywhere;margin:4px 0}#demoNote{font-size:12px;color:var(--muted);margin-bottom:8px}#status{overflow-wrap:anywhere}button:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button[aria-pressed="true"]{background:var(--panel);box-shadow:inset 0 0 0 1px var(--accent)}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}article>h2:first-child{margin-top:0}h2{font-size:1.2em;line-height:1.4;margin:.55em 0 .2em}section{border-top:1px solid var(--line);margin-top:10px;padding-top:8px}#choices button{display:block;width:100%;text-align:left;margin:4px 0}textarea{width:100%;min-height:88px;padding:10px;resize:vertical;font-size:max(16px,var(--fs))}.row{display:flex;gap:7px;flex-wrap:wrap}.primary{color:var(--accent);font-weight:600}.note{font-size:13px;color:var(--muted)}#status{margin:0 0 4px;min-height:1.3em;color:var(--muted)}.confirmbar{position:relative;flex:none;z-index:3;padding:8px 16px calc(8px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--line)}#send{display:block;width:100%;max-width:760px;margin:auto;min-height:46px;background:var(--accent);color:var(--bg);font-weight:700;letter-spacing:.08em}button[aria-pressed="true"]{border:2px solid var(--accent);font-weight:600}.confirmbar .note{max-width:760px;margin:0 auto 4px}[hidden]{display:none!important}
 
 /* Shared AION visual refinement. */
 header{padding:6px 16px;gap:8px;flex-wrap:nowrap}header strong{font-size:17px;letter-spacing:.15em;line-height:1.2}header strong small{display:block;font-size:10px;letter-spacing:.02em;font-weight:400;margin-top:3px}#settings{font-size:13px;color:var(--muted);border:0;background:transparent;padding:0 8px}#settingsPanel{flex:none;padding:4px 16px 8px;border-bottom:1px solid var(--line);display:flex;gap:4px;flex-wrap:wrap}#settingsPanel button{font-size:13px;flex:1}main{padding:18px 18px 16px}h1{font-size:1.4em;font-weight:700;line-height:1.32;letter-spacing:.005em;margin:5px 0 10px}.eyebrow{font-size:11px;font-weight:650;letter-spacing:.12em;color:var(--accent)}.summary{border-left:0;padding:0;line-height:var(--lh);margin:0 0 6px;font-size:1.08em}#viewToggle{border:0;background:transparent;padding:0;margin:0;color:var(--accent);font-size:13px}#sourceBox{margin:0}#sourceBox summary{font-size:13px;padding:11px 0}section{margin-top:12px;padding-top:10px}section h2{font-size:14px;color:var(--muted);font-weight:650;letter-spacing:.03em;margin:0 0 6px}#choices{border-top:1px solid var(--line);margin-bottom:10px}#choices button{display:flex;align-items:center;gap:10px;min-height:44px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;margin:0;padding:10px 2px;line-height:1.35}#choices button::before{content:'';flex:0 0 17px;width:17px;height:17px;border:1.5px solid var(--muted);border-radius:50%;box-sizing:border-box}#choices button[aria-pressed="true"]{box-shadow:none;color:var(--accent);font-weight:650}#choices button[aria-pressed="true"]::before{border:5px solid var(--accent)}#followLabel{font-size:13px;color:var(--muted)}textarea{display:block;margin:4px 0 6px;min-height:64px;border-radius:12px;padding:10px 12px}.row{gap:4px}.row button{font-size:13px;border:0;background:transparent;color:var(--accent);padding:6px 8px}.row button[aria-pressed="true"]{border:1px solid var(--accent);border-radius:8px}.note{font-size:12px}.confirmbar{padding:7px 16px calc(8px + env(safe-area-inset-bottom));}#status{font-size:12px;line-height:1.4;margin:0 auto 5px;max-width:760px;min-height:17px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.footerRow{display:flex;gap:8px;max-width:760px;margin:auto}#jump{font-size:13px;flex:0 0 84px;color:var(--accent);background:transparent}#send{flex:1;min-width:0;font-size:16px;border:0;border-radius:12px;letter-spacing:.05em}#send:active,#jump:active{opacity:.8}button:active{opacity:.8}@media(max-height:340px){header{padding:0 12px}main{padding:8px 12px}.confirmbar{padding:3px 12px}#status{-webkit-line-clamp:1}}
 </style></head><body><header><strong>AION <small>OUTPUT · v4</small></strong><button id="settings" type="button" aria-expanded="false" aria-controls="settingsPanel">表示設定</button></header><div id="settingsPanel" hidden><button id="density" aria-label="行間切替">行間</button><button id="minus" aria-label="文字を小さく">A−</button><button id="plus" aria-label="文字を大きく">A＋</button><button id="theme" aria-label="配色切替">配色</button></div><main id="scroll"><div id="demoNote" hidden>表示テスト：GPTやNotionには接続しません。</div><p class="eyebrow" id="mode"></p><h1 id="title"></h1><div id="summary" class="summary" hidden></div><button id="viewToggle" type="button" hidden>全文を表示</button><article id="answer"></article><details id="sourceBox" hidden><summary>参考情報・出典</summary><div id="sources"></div></details><section id="actions"><h2>次の操作</h2><div id="choices"></div><label id="followLabel" for="follow">追加質問・自由入力</label><textarea id="follow" maxlength="4000" placeholder="続きを入力"></textarea><div class="row"><button id="standard">標準対話へ</button><button id="save">保存を依頼</button><button id="finish">終了</button></div><p class="note">保存・実行は次の処理で確認します。</p></section></main><footer class="confirmbar"><p id="status" role="status" class="note">選択または入力して確定してください。</p><div class="footerRow"><button id="jump" type="button">操作へ ↓</button><button id="send" type="button">確定</button></div></footer><script>
 const packet=${data};const $=id=>document.getElementById(id);let size=16,theme=0,pending=null,spacious=false;window.aionResult=null;
 const answer=$("answer"),meta=packet.display||{mode:"read",title:"回答",summary:"",sources:[]};
 $("mode").textContent=({read:"読む",decide:"判断する",act:"行動する"})[meta.mode]||"読む";
 $("title").textContent=meta.title;
 $("demoNote").hidden=packet.demo!==true;
 $("summary").textContent=meta.summary;
 $("summary").hidden=!meta.summary;
 $("viewToggle").hidden=!meta.summary;
 answer.hidden=!!meta.summary;
 $("viewToggle").onclick=()=>{answer.hidden=!answer.hidden;$("viewToggle").textContent=answer.hidden?"全文を表示":"全文をたたむ"};
 $("sourceBox").hidden=!meta.sources.length;
 for(const source of meta.sources){const p=document.createElement("p");p.textContent=source;$("sources").appendChild(p)}
 $("settings").onclick=()=>{const el=$("settingsPanel");el.hidden=!el.hidden;if($("settings").setAttribute)$("settings").setAttribute("aria-expanded",String(!el.hidden))};
 $("jump").onclick=()=>{const el=$("actions");if(el.scrollIntoView)el.scrollIntoView({block:"start",behavior:"auto"})};
 $("density").onclick=()=>{spacious=!spacious;document.documentElement.style.setProperty("--lh",spacious?"1.60":"1.42");$("density").textContent=spacious?"ゆったり":"コンパクト"};
 // Actual viewport changes, not a guessed keyboard height. Native WKWebView behavior still needs device acceptance.
 function resizeViewport(){const v=window.visualViewport;if(v&&Math.abs(v.scale-1)<.05&&Number.isFinite(v.height)&&v.height>100)document.documentElement.style.setProperty("--viewport-height",Math.round(v.height)+"px");else if(document.documentElement.style.removeProperty)document.documentElement.style.removeProperty("--viewport-height")}
 if(window.visualViewport?.addEventListener){window.visualViewport.addEventListener("resize",resizeViewport);resizeViewport()}

 let blank=false;
 for(const line of packet.answer.split("\\n")){
  if(!line.trim()){
   if(blank)continue;
   blank=true;const el=document.createElement("div");el.className="blank";el.textContent="\\u00a0";answer.appendChild(el);continue;
  }
  blank=false;
  const match=line.match(/^#{1,6}\\s+(.+)$/);const el=document.createElement(match?"h2":"div");const value=match?match[1]:line;
  if(!match&&value.split("**").length%2===1&&value.includes("**")){for(const [i,part] of value.split("**").entries()){const span=document.createElement(i%2?"strong":"span");span.textContent=part;el.appendChild(span)}}else el.textContent=value;
  answer.appendChild(el);
 }
 function change(delta){size=Math.min(24,Math.max(11,size+delta));document.documentElement.style.setProperty("--fs",size+"px");$("minus").disabled=size===11;$("plus").disabled=size===24}
 $("minus").onclick=()=>change(-1);$("plus").onclick=()=>change(1);
 $("theme").onclick=()=>{theme=(theme+1)%3;document.documentElement.dataset.theme=["","dark","light"][theme]};
 const controls=[];
 function choose(event,label,button){pending={event,label};window.aionResult=null;for(const c of controls){if(c.setAttribute)c.setAttribute("aria-pressed",c===button?"true":"false")} $("send").textContent="確定";$("status").textContent=label+"（未確定）";if($("status").setAttribute)$("status").setAttribute("title",label);}
 packet.choices.forEach((choice,index)=>{const button=document.createElement("button");button.type="button";button.textContent=choice;controls.push(button);button.onclick=()=>choose({action:"choice",index},"選択 "+(index+1)+"："+choice,button);$("choices").appendChild(button)});
 $("follow").oninput=()=>{const text=$("follow").value;choose(text.trim()?{action:"text",text}:null,text.trim()?"追加質問":"入力なし",null)};
 $("send").onclick=()=>{
  if(!pending?.event){window.aionResult=null;$("status").textContent="選択または入力してください。";return}
  const event=pending.event;
  if(event.action==="text"&&(!event.text.trim()||event.text.length>4000)){window.aionResult=null;$("status").textContent="入力内容を確認してください。";return}
  window.aionResult={confirmed:true,...event};$("send").textContent="確定済み";$("status").textContent=(packet.demo?"テスト成功：":"確定済み：")+pending.label+"。画面の完了／閉じるで戻ります。";
 };
 for(const [id,action,label] of [["standard","standard","標準対話"],["save","save","保存依頼"],["finish","finish","終了"]]){
  const button=$(id);controls.push(button);if(id==="save")button.hidden=!packet.canSave;
  button.onclick=()=>{if(id!=="save"||packet.canSave)choose({action},label,button)};
 }
 </script></body></html>`;
}

async function main(input,WebView,demo=false){
 const packet=parseOutput(input);
 if(!packet.ok)return {status:"held",action:"standard",reason:packet.reason};
 try{
  const view=new WebView();await view.loadHTML(pageHTML({...packet,display:displayMeta(input),demo:demo===true}));await view.present(true);
  const event=await view.evaluateJavaScript("JSON.stringify(window.aionResult || null)");
  if(typeof event!=="string")throw Error("invalid bridge result");
  const parsed=JSON.parse(event);
  return decideOutput(packet,parsed);
 }catch(_){return {status:"held",action:"standard",reason:"display_or_bridge_failed",answer:packet.answer}}
}

function routeOutput(input,viewer){
 const normal=reason=>({route:"native",reason,originalAnswer:input?.answer??""});
 if(!input||typeof input.answer!=="string"||!input.answer.trim()||typeof input.currentUser!=="string"||!input.currentUser.trim())return normal("input_invalid");
 if(!viewer||viewer.status!=="ok"||viewer.answer!==input.answer)return normal("viewer_unverified");
 if(viewer.action==="finish")return {route:"finish",originalAnswer:input.answer};
 if(viewer.action==="standard")return normal("user_selected_native");
 if(viewer.action==="save_request"&&input.canSave===true)return {route:"confirm_existing_save",originalAnswer:input.answer,packet:{source:"text",rawText:input.answer,routeMode:"raw-only"}};
 if(viewer.action==="follow_up"){
  if(viewer.inputKind==="choice"&&!parseOutput(input).choices?.includes(viewer.followUp))return normal("unknown_choice");
  if(!["choice","text"].includes(viewer.inputKind))return normal("invalid_kind");
  const next=nextTurn(input.history,input.currentUser,input.answer,viewer.followUp);
  return next.ok?{route:"model",context:next}:normal(next.reason);
 }
 return normal("unknown_action");
}

function demoPacket(){return {answer:"画面の見やすさと操作を試すための架空の回答です。\n\n# 今日からできること\n**表示設定**で文字サイズ・行間・配色を変更できます。\n\n"+Array.from({length:8},(_,i)=>"## "+(i+1)+". 表示確認\nこの文章は架空のテストです。下部の「操作へ」で選択肢や自由入力へ移動できます。").join("\n\n"),choices:["もう少し詳しく","別の方法を比較する","自由入力を試す"],canSave:false,presentation:{mode:"read",title:"共通OUTPUTの表示テスト",summary:"表示設定から読みやすさを調整できます。全文を展開し、選択または自由入力を確定してみてください。",sources:["架空の参考情報（表示テスト用）"]}}}
async function entry(input,runsInApp,WebView){
 if((input===null||input===undefined||input==="")&&runsInApp===true){
  const viewer=await main(demoPacket(),WebView,true);
  return {status:viewer.status,action:"demo_complete",demoAction:viewer.action,inputKind:viewer.inputKind??null,followUp:viewer.followUp??null,reason:viewer.reason??null};
 }
 let original=input;
 if(typeof input==="string"&&input.trim().startsWith("{")&&input.length<=200000){try{const parsed=JSON.parse(input);if(parsed&&typeof parsed.answer==="string")original=parsed}catch(_){}}
 const viewer=await main(original,WebView);
 if(original&&typeof original==="object"&&typeof original.currentUser==="string"){
  const route=routeOutput(original,viewer);
  return {...viewer,route};
 }
 return viewer;
}

// Opt-in transport for the existing shortcut. No network, clipboard or cloud storage.
function createAionHandoff(fm,now=()=>Date.now(),random=()=>UUID.string(),scope="live"){
 const held=reason=>({status:"held",action:"standard",reason});
 const valid=id=>typeof id==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
 if(!["live","probe"].includes(scope))throw Error("invalid_scope");
 const dir=fm.joinPath(fm.documentsDirectory(),scope==="probe"?"YOS AION Handoff Probe":"YOS AION Handoff");
 const ttl=600000,marker="yos-aion-handoff-v1";
 const p=(id,suffix="")=>fm.joinPath(dir,id.toLowerCase()+suffix+".json");
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function normalize(v){
  if(v?.status==="ok"&&v.action==="follow_up"&&typeof v.followUp==="string"&&v.followUp.trim()&&v.followUp.length<=4000&&["choice","text"].includes(v.inputKind))return {status:"ok",action:"follow_up",followUp:v.followUp.trim(),inputKind:v.inputKind};
  if(v?.status==="ok"&&v.action==="finish")return {status:"ok",action:"finish"};
  return held("native_fallback");
 }
 function parse(raw,id){
  if(typeof raw!=="string"||raw.length>32000)return null;
  let x;try{x=JSON.parse(raw)}catch(_){return null}
  if(x?.marker!==marker||x.session!==id.toLowerCase()||!Number.isFinite(x.created)||!same(x.result,normalize(x.result)))return null;
  return x;
 }
 function clean(){
  if(!fm.fileExists(dir)||!fm.isDirectory(dir))return;
  for(const name of fm.listContents(dir).slice(0,128)){
   const m=/^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\.claim|\.stage\.[0-9a-f-]{36})?\.json$/i.exec(name);
   if(!m)continue;
   try{const fp=fm.joinPath(dir,name);if(fm.isDirectory(fp))continue;const x=parse(fm.readString(fp),m[1]);if(x&&now()-x.created>ttl)fm.remove(fp)}catch(_){}
  }
 }
 function write(id,viewer){
  if(!valid(id))return held("invalid_session");
  try{
   clean();if(!fm.fileExists(dir))fm.createDirectory(dir,true);if(!fm.isDirectory(dir))return held("directory_invalid");
   const final=p(id),claim=p(id,".claim");if(fm.fileExists(final)||fm.fileExists(claim))return held("session_exists");
   const nonce=random();if(!valid(nonce))return held("invalid_nonce");
   const stage=p(id,".stage."+nonce.toLowerCase());if(fm.fileExists(stage))return held("stage_exists");
   const raw=JSON.stringify({marker,session:id.toLowerCase(),created:now(),result:normalize(viewer)});
   fm.writeString(stage,raw);if(fm.readString(stage)!==raw)return held("write_unverified");
   fm.copy(stage,final);if(fm.readString(final)!==raw)return held("publish_unverified");fm.remove(stage);
   return {status:"ok",action:"handoff_ready",session:id.toLowerCase()};
  }catch(_){return held("write_failed")}
 }
 function read(id){
  if(!valid(id))return held("invalid_session");
  try{
   const final=p(id),claim=p(id,".claim");
   if(fm.fileExists(claim))return held("already_claimed");
   if(!fm.fileExists(final))return held("result_missing");
   const raw=fm.readString(final),x=parse(raw,id);
   if(!x)return held("invalid_result");
   if(now()<x.created||now()-x.created>ttl){clean();return held("expired_result")}
   fm.copy(final,claim);if(fm.readString(claim)!==raw)return held("claim_unverified");
   fm.remove(final);if(fm.fileExists(final))return held("consume_unverified");
   // Keep a content-free tombstone until expiry to reject a replay of the same session.
   fm.writeString(claim,JSON.stringify({...x,result:{status:"ok",action:"finish"}}));
   if(!parse(fm.readString(claim),id))return held("claim_unverified");
   return x.result;
  }catch(_){return held("read_failed")}
 }
 return {write,read};
}
async function handoffEntry(input,runsInApp,WebView,fm,clock,nonce){
 // Opt-in is a Shortcut dictionary, not a JSON string returned by a model.
 if(!input||typeof input!=="object"||Array.isArray(input)||!["aion_handoff_write_v1","aion_handoff_read_v1"].includes(input.mode))return entry(input,runsInApp,WebView);
 const held=reason=>({status:"held",action:"standard",reason});
 if(typeof input.session!=="string"||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.session))return held("invalid_session");
 if(input.mode==="aion_handoff_read_v1"){if(runsInApp)return held("read_requires_background");return createAionHandoff(fm(),clock,nonce).read(input.session)}
 if(!runsInApp)return held("display_requires_app");
 const packet={answer:input.answer,choices:input.choices,canSave:false,presentation:input.presentation};
 if(!parseOutput(packet).ok)return held("invalid_input");
 const result=await entry(packet,true,WebView);
 return createAionHandoff(fm(),clock,nonce).write(input.session,result);
}


// Fixed synthetic probe; does not render, call a model, or read user data.
async function diagnosticEntry(input,runsInApp,WebView,fm,clock,nonce){
 if(input&&typeof input==="object"&&!Array.isArray(input)&&["aion_probe_write_v1","aion_probe_read_v1"].includes(input.mode)){
  const held=reason=>({status:"held",action:"standard",reason});
  if(typeof input.session!=="string"||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.session))return held("invalid_session");
  const probe=createAionHandoff(fm(),clock,nonce,"probe");
  if(input.mode==="aion_probe_write_v1"){
   if(!runsInApp)return held("probe_requires_app");
   return probe.write(input.session,{status:"ok",action:"follow_up",followUp:"AION_PROBE_V1",inputKind:"text"});
  }
  if(runsInApp)return held("probe_requires_background");
  const result=probe.read(input.session);
  if(result.status==="ok"&&result.action==="follow_up"&&result.followUp==="AION_PROBE_V1")return {status:"ok",action:"probe_pass"};
  return held(result.status==="held"?result.reason:"probe_payload_mismatch");
 }
 return handoffEntry(input,runsInApp,WebView,fm,clock,nonce);
}

let result;
try{result=await diagnosticEntry(args.shortcutParameter,typeof config!=="undefined"&&config.runsInApp===true,WebView,()=>FileManager.local())}catch(_){result={status:"held",action:"standard",reason:"runtime_failed"}}
Script.setShortcutOutput(JSON.stringify(result));
Script.complete();
