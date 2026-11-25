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

function pageHTML(packet){
 const data=JSON.stringify(packet).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
 return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><style>
 :root{color-scheme:light dark;--bg:#f5eedf;--fg:#292820;--panel:#faf3e5;--muted:#665f51;--line:#d5c9b4;--accent:#365b8a;--fs:15px} @media(prefers-color-scheme:dark){:root{--bg:#131417;--fg:#eaecef;--panel:#202227;--muted:#b0b3bc;--line:#383b43;--accent:#8db5ff}} :root[data-theme="dark"]{color-scheme:dark;--bg:#131417;--fg:#eaecef;--panel:#202227;--muted:#b0b3bc;--line:#383b43;--accent:#8db5ff} :root[data-theme="light"]{color-scheme:light;--bg:#f5eedf;--fg:#292820;--panel:#faf3e5;--muted:#665f51;--line:#d5c9b4;--accent:#365b8a}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:var(--fs)/1.42 -apple-system,BlinkMacSystemFont,sans-serif;overflow-wrap:anywhere}header{position:sticky;top:0;z-index:2;background:var(--bg);padding:10px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:7px;flex-wrap:wrap}header strong{margin-right:auto;letter-spacing:.08em}button,textarea{font:inherit;color:inherit;background:var(--panel);border:1px solid var(--line);border-radius:10px}button{min-height:44px;padding:6px 10px;cursor:pointer}button:disabled{opacity:.4}main{max-width:760px;margin:auto;padding:10px 16px 112px}article{white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}article .blank{height:.38em;line-height:.38em}article>h2:first-child{margin-top:0}h2{font-size:1.2em;line-height:1.4;margin:.55em 0 .2em}section{border-top:1px solid var(--line);margin-top:10px;padding-top:8px}#choices button{display:block;width:100%;text-align:left;margin:4px 0}textarea{width:100%;min-height:88px;padding:10px;resize:vertical;font-size:max(16px,var(--fs))}.row{display:flex;gap:7px;flex-wrap:wrap}.primary{color:var(--accent);font-weight:600}.note{font-size:13px;color:var(--muted)}#status{margin:0 0 4px;min-height:1.3em;color:var(--muted)}.confirmbar{position:fixed;z-index:3;bottom:0;left:0;right:0;padding:8px 16px calc(8px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--line)}#send{display:block;width:100%;max-width:760px;margin:auto;min-height:46px;background:var(--accent);color:var(--bg);font-weight:700;letter-spacing:.08em}button[aria-pressed="true"]{border:2px solid var(--accent);font-weight:600}.confirmbar .note{max-width:760px;margin:0 auto 4px}[hidden]{display:none!important}
 </style></head><body><header><strong>AION</strong><button id="minus" aria-label="文字を小さく">A−</button><button id="plus" aria-label="文字を大きく">A＋</button><button id="theme" aria-label="配色切替">配色</button></header><main><article id="answer"></article><section><h2>続ける</h2><div id="choices"></div><label for="follow">追加質問・自由入力</label><textarea id="follow" maxlength="4000" placeholder="続きを入力"></textarea><div class="row"><button id="standard">標準対話へ</button><button id="save">保存を依頼</button><button id="finish">終了</button></div><p class="note">保存・外部操作はこの画面では実行されません。閉じるだけでは送信されません。</p></section></main><footer class="confirmbar"><p id="status" role="status" class="note">選択または入力して確定してください。</p><button id="send" type="button">確定</button></footer><script>
 const packet=${data};const $=id=>document.getElementById(id);let size=15,theme=0,pending=null;window.aionResult=null;
 const answer=$("answer");
 let blank=false;
 for(const line of packet.answer.split("\\n")){
  if(!line.trim()){
   if(blank)continue;
   blank=true;const el=document.createElement("div");el.className="blank";el.textContent="\\u00a0";answer.appendChild(el);continue;
  }
  blank=false;
  const match=line.match(/^#{1,6}\\s+(.+)$/);const el=document.createElement(match?"h2":"div");el.textContent=match?match[1]:line;answer.appendChild(el);
 }
 function change(delta){size=Math.min(24,Math.max(11,size+delta));document.documentElement.style.setProperty("--fs",size+"px");$("minus").disabled=size===11;$("plus").disabled=size===24}
 $("minus").onclick=()=>change(-1);$("plus").onclick=()=>change(1);
 $("theme").onclick=()=>{theme=(theme+1)%3;document.documentElement.dataset.theme=["","dark","light"][theme]};
 const controls=[];
 function choose(event,label,button){pending={event,label};window.aionResult=null;for(const c of controls){if(c.setAttribute)c.setAttribute("aria-pressed",c===button?"true":"false")} $("send").textContent="確定";$("status").textContent=label+"：未確定";}
 packet.choices.forEach((choice,index)=>{const button=document.createElement("button");button.type="button";button.textContent=choice;controls.push(button);button.onclick=()=>choose({action:"choice",index},"選択 "+(index+1),button);$("choices").appendChild(button)});
 $("follow").oninput=()=>{const text=$("follow").value;choose(text.trim()?{action:"text",text}:null,text.trim()?"追加質問":"入力なし",null)};
 $("send").onclick=()=>{
  if(!pending?.event){window.aionResult=null;$("status").textContent="選択または入力してください。";return}
  const event=pending.event;
  if(event.action==="text"&&(!event.text.trim()||event.text.length>4000)){window.aionResult=null;$("status").textContent="入力内容を確認してください。";return}
  window.aionResult={confirmed:true,...event};$("send").textContent="確定済み";$("status").textContent=pending.label+"：確定しました。画面の完了／閉じるで戻ります。";
 };
 for(const [id,action,label] of [["standard","standard","標準対話"],["save","save","保存依頼"],["finish","finish","終了"]]){
  const button=$(id);controls.push(button);if(id==="save")button.hidden=!packet.canSave;
  button.onclick=()=>{if(id!=="save"||packet.canSave)choose({action},label,button)};
 }
 </script></body></html>`;
}

async function main(input,WebView){
 const packet=parseOutput(input);
 if(!packet.ok)return {status:"held",action:"standard",reason:packet.reason};
 try{
  const view=new WebView();await view.loadHTML(pageHTML(packet));await view.present(true);
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

function demoPacket(){return {answer:"AION 共通OUTPUT｜表示テスト\n\n# 長文を読む\n右上の A− / A＋ で文字サイズを調整できます。配色を切り替えてください。\n\n"+Array.from({length:10},(_,i)=>"## "+(i+1)+". 表示確認\nこの文章は架空のテストです。長い文章をスクロールし、最後の選択肢または自由入力を試してください。").join("\n\n"),choices:["選択回答のテスト","続けて比較する"],canSave:false}}
async function entry(input,runsInApp,WebView){
 if((input===null||input===undefined||input==="")&&runsInApp===true){
  const viewer=await main(demoPacket(),WebView);
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
let result;
try{result=await entry(args.shortcutParameter,typeof config!=="undefined"&&config.runsInApp===true,WebView)}catch(_){result={status:"held",action:"standard",reason:"runtime_failed"}}
Script.setShortcutOutput(JSON.stringify(result));
Script.complete();
