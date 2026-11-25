import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
async function exercise(source){
 const assert=(v,n)=>{if(!v)throw Error(n);passed.push(n)},passed=[];
 const AF=Object.getPrototypeOf(async function(){}).constructor;
 const script=new AF("args","FileManager","Keychain","Request","Script",source);
 const fakeId="11111111-2222-3333-4444-555555555555",fake2="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
 const config=id=>`const CFG = Object.freeze({\n inboxId: '${id}',\n tokenKey: 'YOS_NOTION_INTEGRATION_TOKEN',\n version: '2025-09-03'\n});`;
 const b=(type,text="",id="fixture-block")=>({id,type,[type]:{rich_text:[{plain_text:text}]}});
 const h=(id,label="Clarity Text",date="2026-01-01T00:00:00.000Z")=>b("paragraph",`${date} · ${label} · clarity:${id}`,"block-"+id);
 const rec=(id,t,label,date)=>[h(id,label,date),b("paragraph",t),b("divider")];
 const page=(results,has_more=false,next_cursor=null)=>({results,has_more,next_cursor});
 const input={mode:"memory_read",query:"記憶"};
 async function run({pages=[page(rec("abcdefgh","記憶"))],local=config(fakeId),cloud=null,auth=true,param=input,token="dummy-test-only"}={}){
  let calls=[],files=0,output,complete=0,index=0;
  const fm=s=>({documentsDirectory:()=>"/test",joinPath:(a,b)=>a+"/"+b,fileExists:()=>s!==null,isFileStoredIniCloud:()=>false,readString:()=>{files++;return s}});
  class R{constructor(url){this.url=url;calls.push(this)}async loadJSON(){const p=pages[index++];if(p instanceof Error)throw p;this.response={statusCode:200};return p}}
  await script({shortcutParameter:param},{local:()=>fm(local),iCloud:()=>fm(cloud)},{contains:()=>auth,get:()=>token},R,{setShortcutOutput:s=>{output=JSON.parse(s)},complete:()=>complete++});
  if(complete!==1||!output)throw Error("missing completion");
  return {output,calls,files};
 }
 let r=await run();assert(r.output.complete&&r.output.matchCount===1,"valid lookup");assert(r.calls.length===1&&r.calls[0].method==="GET"&&r.calls[0].url===`https://api.notion.com/v1/blocks/${fakeId}/children?page_size=100`,"fixed GET endpoint");assert(!JSON.stringify(r.output).includes("dummy-test-only"),"no secret in output");
 r=await run({pages:[page(rec("abcdefgh","other"))]});assert(r.output.complete&&r.output.matchCount===0,"zero match");
 r=await run({pages:[page([h("abcdefgh"),b("paragraph","記")],true,"cursor 1"),page([b("paragraph","憶"),b("divider")])]});assert(r.output.matchCount===1&&r.calls[1].url.endsWith("start_cursor=cursor%201"),"pagination");
 r=await run({pages:[page([],true,"same"),page([],true,"same")]});assert(r.output.issues.includes("CURSOR_INVALID"),"cursor loop");
 r=await run({pages:[page([...rec("abcdefgh","記憶"),h("abcdefgh")])]});assert(!r.output.complete&&r.output.matchCount===0,"incomplete duplicate suppressed");
 r=await run({pages:[page(rec("abcdefgh","記憶","Clarity Voice"))]});assert(r.output.matchCount===0,"voice excluded");
 r=await run({pages:[page([h("abcdefgh"),b("paragraph","記憶"),b("paragraph","2026-01-01T00:00:00Z · Clarity Notification · notification:dummy"),b("paragraph","notification"),b("divider")])]});assert(!r.output.complete&&r.output.matchCount===0,"notification boundary");
 r=await run({pages:[page([h("abcdefgh"),b("paragraph","記憶")])]});assert(!r.output.complete&&r.output.matchCount===0,"incomplete record");
 r=await run({pages:[page([null])]});assert(!r.output.complete&&r.output.issues.includes("INVALID_BLOCK"),"bad block");
 r=await run({pages:[page(rec("abcdefgh","ＡＢＣ"))],param:{mode:"memory_read",query:"abc"}});assert(r.output.matches[0].excerpt==="abc","NFKC");
 r=await run({pages:[page(Array.from({length:7},(_,i)=>rec("record"+i,"記憶",undefined,`2026-01-${10+i}T00:00:00Z`)).flat())]});assert(r.output.matches.length===5&&r.output.matches[0].id==="clarity:record6","latest five");
 r=await run({pages:[page(rec("abcdefgh","記憶"),true,"next"),new Error("private details")]});assert(!r.output.complete&&r.output.matchCount===1&&!JSON.stringify(r.output).includes("private details"),"partial network failure");
 r=await run({local:null,cloud:config(fakeId)});assert(r.output.complete,"icloud config");
 r=await run({cloud:config(fake2)});assert(r.calls.length===0&&r.output.issues.includes("CONFIG_CONFLICT"),"conflict no network");
 r=await run({local:null});assert(r.calls.length===0&&r.output.issues.includes("CONFIG_MISSING"),"missing config");
 r=await run({local:"invalid"});assert(r.calls.length===0&&r.output.issues.includes("CONFIG_INVALID"),"invalid config");
 r=await run({auth:false});assert(r.calls.length===0&&r.output.issues.includes("AUTH_MISSING"),"missing auth");
 r=await run({param:{mode:"write",query:"記憶"}});assert(r.calls.length===0&&r.files===0&&r.output.status==="held","invalid mode no side effects");
 r=await run({param:JSON.stringify(input)});assert(r.output.complete,"JSON dictionary");
 assert(!/https?:\/\/(?!api\.notion\.com\/)/.test(source)&&!/\b(?:writeString|remove|eval|fetch|loadString)\s*\(/.test(source),"read-only static allowlist");
 assert(!/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i.test(source)&&!/(?:sk-[A-Za-z0-9_-]{15,}|ntn_[A-Za-z0-9]{15,}|secret_[A-Za-z0-9]{15,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/.test(source),"no embedded IDs or secrets");
 return passed;
}
test('AION memory reader: local configuration, GET-only, privacy, boundaries', async()=>{
 const source=await readFile(new URL('../scriptable/YOS CORE Memory Read.js',import.meta.url),'utf8');
 const passed=await exercise(source);
 console.log(passed.length+' checks: '+passed.join(', '));
});
