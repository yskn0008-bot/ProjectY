import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const src=fs.readFileSync(new URL("./Notification-Bridge-v0.4.js",import.meta.url),"utf8");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction("args","FileManager","Keychain","Request","Script",src);
function env(){
  const file=new Map(),keys=new Map([["YOS_NOTION_INTEGRATION_TOKEN","mock-secret"]]),server=[],calls=[];
  const state={file,keys,server,calls,ambiguous:false,failPatch:false,failGet:false,failDisk:false};
  const fm={documentsDirectory:()=>"/documents",joinPath:(...x)=>x.join("/"),fileExists:x=>file.has(x),readString:x=>file.get(x),writeString:(k,v)=>{if(state.failDisk)throw Error("disk full");file.set(k,v)}};
  const FileManager={local:()=>fm}, Keychain={contains:k=>keys.has(k),get:k=>keys.get(k),set:(k,v)=>keys.set(k,v)};
  class Request{
    constructor(url){this.url=url;this.response={statusCode:200};this.method="GET";this.body=""}
    async loadJSON(){
      calls.push({method:this.method,url:this.url});
      if(this.method==="PATCH"){
        const rows=JSON.parse(this.body).children;
        if(!state.failPatch||state.ambiguous)server.push(...rows.map(x=>({paragraph:x.paragraph})));
        if(state.failPatch)throw Error("timeout after write");
        return {results:rows.map((_,i)=>({id:"mock-"+i}))}
      }
      if(state.failGet)throw Error("GET failed");
      return {results:server,has_more:false,next_cursor:null};
    }
  }
  async function invoke(input){
    const outputs=[];const Script={setShortcutOutput:s=>outputs.push(s),complete:()=>{}};
    await execute({shortcutParameter:input},FileManager,Keychain,Request,Script);
    return outputs.at(-1);
  }
  const queue=()=>JSON.parse(file.get("/documents/YOS_Notification_Pending.json")||"[]");
  const content=()=>server.map(x=>x.paragraph.rich_text[0].text.content).join("\n");
  return {state,invoke,queue,content};
}
test("Inbox save confirmed and pending drained",async()=>{
  const x=env();assert.match(await x.invoke("PayPay 決済 300円"),/保存確認/);
  assert.equal(x.state.server.length,1);assert.equal(x.queue().length,0);
});
test("Ambiguous write reconciles before retry",async()=>{
  const x=env();x.state.failPatch=true;x.state.ambiguous=true;
  assert.match(await x.invoke("督促通知 期限あり"),/未確認/);
  assert.equal(x.state.server.length,1);
  x.state.failPatch=false;x.state.ambiguous=false;
  assert.match(await x.invoke("督促通知 期限あり"),/保存確認/);
  assert.equal(x.state.server.length,1);
});
test("Remote lookup failure retains the original pending event",async()=>{
  const x=env();x.state.failPatch=true;x.state.ambiguous=true;
  await x.invoke("TEST 口座残高不足");
  x.state.failPatch=false;x.state.failGet=true;
  assert.match(await x.invoke("TEST 口座残高不足"),/未確認/);
  assert.equal(x.state.server.length,1);assert.equal(x.queue().length,1);
});
test("Repeated input shortly after confirmed write is not sent again",async()=>{
  const x=env();await x.invoke("請求のお知らせ");await x.invoke("請求のお知らせ");assert.equal(x.state.server.length,1);
});
test("OTP is not stored",async()=>{
  const x=env();await x.invoke("ログイン確認コード: 123456");
  assert.match(x.content(),/秘密の本文は保存せず/);
  assert.doesNotMatch(x.content(),/123456/);
});
test("Missed calls are archived as a separate category",async()=>{
  const x=env();await x.invoke({app:"電話",title:"不在着信",body:"知らない番号から"});
  assert.match(x.content(),/missed-call/);assert.match(x.content(),/不在着信/);
});
test("Existing v0.3 pending entry is reconciled, not duplicated",async()=>{
  const x=env();x.state.file.set("/documents/YOS_Notification_Pending.json",
    JSON.stringify([{id:"cafebeef",date:"2026-10-01T10:00:00Z",category:"information",body:"legacy pending"}]));
  x.state.server.push({paragraph:{rich_text:[{plain_text:"2026-10-01 · notification:cafebeef · information\nlegacy pending"}]}});
  assert.match(await x.invoke(null),/保存確認/);
  assert.equal(x.state.server.length,1);assert.equal(x.queue().length,0);
});
test("Unreadable queue is protected instead of being overwritten",async()=>{
  const x=env();x.state.file.set("/documents/YOS_Notification_Pending.json","{corrupt");
  assert.match(await x.invoke("test"),/保存前エラー/);
  assert.equal(x.state.file.get("/documents/YOS_Notification_Pending.json"),"{corrupt");
  assert.equal(x.state.server.length,0);
});
test("No network or app notifications beyond the existing Notion transport",()=>{
  assert.doesNotMatch(src,/new Notification\(/);
  assert.match(src,/api\.notion\.com/);
});
