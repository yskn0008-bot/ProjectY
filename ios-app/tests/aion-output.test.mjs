import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
async function exercise(source){
 const passed=[];function check(v,n){if(!v)throw Error(n);passed.push(n)}
 const cut=source.indexOf("\nlet result;\ntry{result=await entry");
 const {parseOutput,decideOutput,nextTurn,pageHTML,routeOutput,main,entry}=new Function(source.slice(0,cut)+";return {parseOutput,decideOutput,nextTurn,pageHTML,routeOutput,main,entry}")();
 const packet=parseOutput({answer:"回答\n# 見出し\n</script><img src=x onerror=alert(1)>",choices:[" 比較 ","保留"],canSave:true});
 check(parseOutput("plain").ok,"plain text");check(!parseOutput(null).ok,"invalid");check(!parseOutput("x".repeat(120001)).ok,"oversize");check(parseOutput("長".repeat(120000)).answer.length===120000,"long text");check(parseOutput({answer:"a",choices:[" x ","x"]}).choices.length===1,"dedup");check(parseOutput({answer:"a",choices:[{action:"execute"}]}).choices.length===0,"invalid choices");
 check(decideOutput(packet,null).action==="finish","dismiss");check(decideOutput(packet,{action:"save"}).action==="finish","unconfirmed");check(decideOutput(packet,{confirmed:true,action:"choice",index:0}).followUp==="比較","choice");check(decideOutput(packet,{confirmed:true,action:"choice",index:7}).status==="held","invalid choice");check(decideOutput(packet,{confirmed:true,action:"text",text:" 次 "}).followUp==="次","text");check(decideOutput(packet,{confirmed:true,action:"text",text:" "}).status==="held","empty input");check(decideOutput(packet,{confirmed:true,action:"text",text:"x".repeat(4001)}).status==="held","long input");check(decideOutput(packet,{confirmed:true,action:"save"}).action==="save_request","save request");check(decideOutput(parseOutput("a"),{confirmed:true,action:"save"}).status==="held","save denied");check(decideOutput(packet,{confirmed:true,action:"delete"}).status==="held","arbitrary action denied");check(decideOutput(packet,{confirmed:true,action:"standard"}).action==="standard","standard");check(decideOutput(packet,{confirmed:true,action:"finish"}).answer===packet.answer,"original answer");
 const html=pageHTML(packet),ui=html.match(/<script>([\s\S]+?)<\/script>/)[1];
 check(!html.includes("</script><img src=x")&&html.includes("\\u003c/script\\u003e"),"HTML injection encoded");check(html.includes("connect-src 'none'"),"CSP");
 const nodes=new Map(),make=(tag="div")=>({tag,children:[],textContent:"",value:"",hidden:false,disabled:false,appendChild(x){this.children.push(x)}});
 const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,make());return nodes.get(id)},createElement:make,documentElement:{style:{setProperty:(k,v)=>{doc.font=v}},dataset:{}}};const w={};new Function("document","window",ui)(doc,w);
 check(nodes.get("answer").children.some(x=>x.textContent==="</script><img src=x onerror=alert(1)>"),"DOM literal");check(nodes.get("answer").children.some(x=>x.tag==="h2"&&x.textContent==="見出し"),"heading");
 for(let i=0;i<20;i++)nodes.get("minus").onclick();check(doc.font==="11px"&&nodes.get("minus").disabled,"font minimum");for(let i=0;i<30;i++)nodes.get("plus").onclick();check(doc.font==="24px"&&nodes.get("plus").disabled,"font maximum");
 nodes.get("theme").onclick();check(doc.documentElement.dataset.theme==="dark","dark");nodes.get("theme").onclick();check(doc.documentElement.dataset.theme==="light","light");nodes.get("send").onclick();check(w.aionResult===null,"empty confirmation");nodes.get("choices").children[1].onclick();check(w.aionResult===null,"choice is pending");nodes.get("send").onclick();check(w.aionResult.index===1&&w.aionResult.confirmed,"choice confirmed");const fresh=()=>{nodes.clear();new Function("document","window",ui)(doc,w)};
 check(nodes.get("send").disabled&&nodes.get("follow").disabled,"send locks");nodes.get("choices").children[0].onclick();nodes.get("send").onclick();check(w.aionResult.index===1,"duplicate and late edits ignored");
 fresh();nodes.get("choices").children[1].onclick();nodes.get("follow").value="追記";nodes.get("follow").oninput();check(w.aionResult===null,"edit clears");let deliveries=0;w.aionDeliver=()=>deliveries++;nodes.get("send").onclick();nodes.get("send").onclick();check(w.aionResult.text==="追記"&&deliveries===1,"free input delivered once");
 fresh();nodes.get("save").onclick();check(w.aionResult===null,"save pending");nodes.get("send").onclick();check(w.aionResult.action==="save","save confirmed");
 fresh();nodes.get("finish").onclick();check(w.aionResult===null,"finish pending");nodes.get("send").onclick();check(w.aionResult.action==="finish","finish confirmed");check(html.includes('class="confirmbar"')&&html.includes('id="send" type="button">送信'),"persistent confirm");check(html.includes("--bg:#f5eedf")&&html.includes("--panel:#faf3e5")&&!html.includes("--panel:#fff"),"cream theme");check(html.includes("/1.42")&&html.includes("height:.38em"),"compact spacing");
 const p={answer:"回答",currentUser:"質問",history:[],choices:[" 比較 "],canSave:true};
 const evt=(action,rest={})=>decideOutput(parseOutput(p),{confirmed:true,action,...rest});
 check(routeOutput(p,evt("choice",{index:0})).context.currentUser==="比較","normalized choice context");check(routeOutput(p,evt("text",{text:"次"})).context.history[1].text==="回答","history");check(JSON.stringify(routeOutput(p,evt("save")).packet)===JSON.stringify({source:"text",rawText:"回答",routeMode:"raw-only"}),"existing save request");check(routeOutput({...p,canSave:false},evt("save")).route==="native","save deny route");check(routeOutput(p,{...evt("save"),answer:"改変"}).route==="native","answer mismatch");check(routeOutput(p,{...evt("choice",{index:0}),followUp:"改変"}).route==="native","unknown choice");check(routeOutput(p,null).route==="native","no result");check(routeOutput(p,decideOutput(parseOutput(p),null)).route==="finish","dismiss route");check(routeOutput(p,evt("standard")).route==="native","standard route");check(nextTurn([],"q","x".repeat(30000),"f").reason==="context_limit","budget");check(nextTurn(Array.from({length:12},(_,i)=>({role:i%2?"assistant":"user",text:"x"})),"q","a","f").reason==="turn_limit","turn bound");check(!nextTurn([{role:"system",text:"x"},{role:"assistant",text:"y"}],"q","a","f").ok,"invalid roles");
 let calls=[];class WV{async loadHTML(h){calls.push("load")}async present(x){calls.push(x===true?"full":"small")}async evaluateJavaScript(_script,callback){if(callback)return new Promise(()=>{});calls.push("read");return JSON.stringify({confirmed:true,action:"choice",index:0})}}
 let result=await entry(p,false,WV);check(calls.join(",")==="load,full,read"&&result.route.context.currentUser==="比較","viewer route");
 result=await entry(JSON.stringify(p),false,WV);check(result.route.route==="model","JSON input");
 result=await entry(undefined,true,WV);check(result.action==="demo_complete"&&result.demoAction==="follow_up","standalone demo");
 result=await entry(undefined,false,WV);check(result.status==="held","no input in shortcut");
 class Fail extends WV{async evaluateJavaScript(){throw Error("private")}}
 result=await main(p,Fail);check(result.action==="standard"&&result.answer===p.answer&&!JSON.stringify(result).includes("private"),"bridge fallback");
 class Bad extends WV{async evaluateJavaScript(){return undefined}}
 result=await main(p,Bad);check(result.status==="held","missing bridge result");
 const AF=Object.getPrototypeOf(async function(){}).constructor;let out,done=0;await new AF("args","config","WebView","Script",source)({shortcutParameter:p},{runsInApp:true},WV,{setShortcutOutput:s=>out=JSON.parse(s),complete:()=>done++});check(out.route.route==="model"&&done===1,"whole script");
 check(!/\b(?:Request|Keychain|FileManager|fetch|XMLHttpRequest|localStorage)\b/.test(source),"no network/storage APIs");check(!/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}|(?:sk-|ntn_|secret_)[A-Za-z0-9_-]{15,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i.test(source),"no private identifiers or tokens");

 const metaPacket={answer:"本文全体\n**重要**\n末尾",currentUser:"質問",history:[],choices:["詳細"],canSave:false,presentation:{mode:"decide",title:"判断する内容",summary:"短い要約",sources:["<img src=x onerror=alert(1)>"],canSave:true,action:"delete"}};
 const getMeta=new Function(source.slice(0,cut)+";return {displayMeta,demoPacket}")();
 const m=getMeta.displayMeta(metaPacket);const h=pageHTML({...parseOutput(metaPacket),display:m,demo:false});const script=h.match(/<script>([\s\S]+?)<\/script>/)[1];
 nodes.clear();let jump=0,resize;
 doc.getElementById("actions").scrollIntoView=()=>jump++;
 w.visualViewport={height:520,scale:1,addEventListener:(k,cb)=>resize=cb};
 const vars={};doc.documentElement.style={setProperty:(k,v)=>vars[k]=v,removeProperty:k=>delete vars[k]};
 new Function("document","window",script)(doc,w);
 check(nodes.get("mode").textContent==="判断する"&&nodes.get("title").textContent==="判断する内容","display metadata mode");
 check(nodes.get("summary").textContent==="短い要約"&&nodes.get("answer").hidden,"explicit summary");
 nodes.get("viewToggle").onclick();check(!nodes.get("answer").hidden&&nodes.get("answer").children.some(n=>n.textContent==="末尾"),"full text retained");
 check(nodes.get("answer").children.some(n=>n.children.some(c=>c.tag==="strong"&&c.textContent==="重要")),"safe bold");
 check(nodes.get("sources").children[0].textContent==="<img src=x onerror=alert(1)>"&&!h.includes("<img src=x onerror=alert(1)>"),"source literal");
 check(nodes.get("save").hidden,"metadata cannot grant save");
 doc.getElementById("settingsPanel").hidden=true;nodes.get("settings").onclick();check(!nodes.get("settingsPanel").hidden,"settings opens");nodes.get("settings").onclick();check(nodes.get("settingsPanel").hidden,"settings closes");
 nodes.get("jump").onclick();check(jump===1&&w.aionResult===null,"jump without selection");
 nodes.get("density").onclick();check(vars["--lh"]==="1.60","spacious");nodes.get("density").onclick();check(vars["--lh"]==="1.42","compact");
 check(vars["--viewport-height"]==="520px","viewport");w.visualViewport.height=300;resize();check(vars["--viewport-height"]==="300px","resize");w.visualViewport.scale=2;resize();check(vars["--viewport-height"]===undefined,"zoom fallback");
 check(getMeta.displayMeta({presentation:{mode:"invalid",summary:"x".repeat(1801),sources:[null,{}]}}).mode==="read"&&getMeta.displayMeta({}).summary==="","invalid metadata fallback");
 check(getMeta.demoPacket().presentation.summary.length>0&&!getMeta.demoPacket().canSave,"demo uses features without save");
 check(h.includes("OUTPUT · v4.1")&&h.includes('id="jump"'),"version and action navigation");
 check(routeOutput({...metaPacket,canSave:true},decideOutput(parseOutput({...metaPacket,canSave:true}),{confirmed:true,action:"save"})).packet.rawText===metaPacket.answer,"save original");
 let bridgeCalls=0,readCalls=0;
 class Early extends WV{present(){return new Promise(()=>{})}async evaluateJavaScript(script,callback){if(callback){bridgeCalls++;check(script.includes("completion(JSON.stringify(value))"),"official completion bridge");return JSON.stringify({confirmed:true,action:"choice",index:0})}readCalls++;throw Error("must not wait for close")}}
 result=await entry(p,false,Early);check(result.route.context.currentUser==="比較"&&bridgeCalls===1&&readCalls===0,"send returns before close");
 class Cancel extends WV{async evaluateJavaScript(_,callback){if(callback)return new Promise(()=>{});return "null"}}
 result=await entry(p,false,Cancel);check(result.route.route==="finish","close without send cancels");
 class Unsupported extends WV{async evaluateJavaScript(script,callback){if(callback)throw Error("callback unsupported");return JSON.stringify({confirmed:true,action:"text",text:"fallback"})}}
 result=await entry(p,false,Unsupported);check(result.route.context.currentUser==="fallback","callback error fallback");
 class Invalid extends WV{async evaluateJavaScript(script,callback){if(callback)return "invalid";return JSON.stringify({confirmed:true,action:"text",text:"recovered"})}}
 result=await entry(p,false,Invalid);check(result.route.context.currentUser==="recovered","invalid callback fallback");
 let earlyOut,earlyDone=0;await new AF("args","config","WebView","Script",source)({shortcutParameter:p},{runsInApp:false},Early,{setShortcutOutput:v=>earlyOut=JSON.parse(v),complete:()=>earlyDone++});check(earlyDone===1&&earlyOut.route.route==="model","send completes shortcut once");
 return passed;
}
test('AION OUTPUT local display, choices, context and safety',async()=>{const source=await readFile(new URL('../scriptable/YOS AION OUTPUT.js',import.meta.url),'utf8');const passed=await exercise(source);console.log(passed.length+' checks: '+passed.join(', '));});
