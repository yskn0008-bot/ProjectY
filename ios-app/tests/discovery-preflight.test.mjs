import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {test} from "node:test";
import assert from "node:assert/strict";
const src=readFileSync(new URL("../scriptable/YOS DISCOVERY 実行検証 TEST.js",import.meta.url),"utf8");
const catalog=JSON.parse(readFileSync(new URL("../scriptable/yos-common-installer-catalog.json",import.meta.url),"utf8"));
const entry=catalog.additional_targets.find(e=>e.id==="discovery-preflight-test");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function testPreflight(run){
 const tests=[],assert=(v,m)=>{if(!v)throw Error(m)},test=async(n,f)=>{await f();tests.push(n)};
 const now=1764060000000;
 const make=(opts={})=>{
  const store=new Map(),calls=[];let tick=now;
  const files={documentsDirectory:()=>"/local",joinPath:(a,b)=>a+"/"+b,fileExists:k=>store.has(k),readString:k=>{if(!store.has(k))throw Error("NO_FILE");return opts.badRead?"bad":store.get(k)},writeString:(k,v)=>{store.set(k,v)}};
  const makeRequest=url=>({response:null,async loadString(){calls.push(url);tick++;assert(this.method==="GET"&&this.timeoutInterval===5&&this.allowInsecureRequest===false&&this.onRedirect()===null,"request settings");if(opts.offline)throw Error("offline");this.response={statusCode:opts.http||200,url:opts.redirect?"https://example.org":url};if(url.includes("/search?"))return JSON.stringify({resultList:{result:[{pmcid:"PMC123",title:"Paper"},{pmcid:"PMC124",title:"Second"}]}});return "<article><article-meta><article-id pub-id-type='pmc'>"+(opts.wrongId?"999":"123")+"</article-id></article-meta><body><p>"+"Fixture body ".repeat(20)+"</p></body></article>"}});
  const deps={parameter:"collect",clock:()=>tick,makeRequest,files,nonce:()=>"test-123"};
  return {deps,store,calls,advance:n=>{tick+=n}};
 };
 await test("public diagnostic and two request maximum",async()=>{const {deps,calls,store}=make();const a=await run(deps);assert(a.status==="public_fetch_pass"&&calls.length===2&&store.size===1&&!a.researchComplete&&!a.notionWrite,JSON.stringify(a))});
 await test("offline no receipt",async()=>{const {deps,store}=make({offline:true});const a=await run(deps);assert(a.status==="held"&&a.reason==="TRANSPORT_FAILED"&&store.size===0,"offline")});
 await test("HTTP status observable",async()=>{const {deps,store}=make({http:503});const a=await run(deps);assert(a.reason==="HTTP_503"&&store.size===0,"HTTP")});
 await test("redirect fail closed",async()=>{const {deps,store}=make({redirect:true});assert((await run(deps)).reason==="REDIRECT_OR_URL_MISMATCH"&&store.size===0,"redirect")});
 await test("wrong article id fail closed",async()=>{const {deps,store}=make({wrongId:true});assert((await run(deps)).status==="held"&&store.size===0,"id")});
 await test("readback mismatch not pass",async()=>{const {deps}=make({badRead:true});assert((await run(deps)).reason==="READBACK_FAILED","readback")});
 await test("existing receipt protected",async()=>{const {deps,calls}=make();await run(deps);assert((await run(deps)).reason==="ID_COLLISION"&&calls.length===2,"collision")});
 await test("valid model token no extra request",async()=>{const {deps,calls}=make();const a=await run(deps);const b=await run({...deps,parameter:"YOS_DISCOVERY_PREFLIGHT_V2|"+a.runId+"|"+a.evidenceId});assert(b.status==="model_roundtrip_pass"&&calls.length===2&&!b.researchComplete,"model")});
 await test("invalid token no fetch",async()=>{const {deps,calls}=make();assert((await run({...deps,parameter:"https://example.org"})).reason==="INVALID_TOKEN"&&calls.length===0,"invalid")});
 await test("expired model token rejected",async()=>{const {deps,advance}=make();const a=await run(deps);advance(3600001);assert((await run({...deps,parameter:"YOS_DISCOVERY_PREFLIGHT_V2|"+a.runId+"|"+a.evidenceId})).reason==="RECEIPT_MISMATCH","expired")});
 return tests;
}
test("DISCOVERY public-only isolated diagnostic",async()=>{new AsyncFunction(src);const run=new Function(src.slice(0,src.indexOf("\nlet result;\n"))+"\nreturn runPreflightV2;")();assert.equal((await testPreflight(run)).length,10);assert.ok(!/Keychain|api\.notion\.com|Notification\(|Pasteboard|eval\(|new Function|importModule|FileManager\.iCloud/.test(src));assert.equal(entry.name,"YOS DISCOVERY 実行検証 TEST");assert.equal(entry.sha256,createHash("sha256").update(src,"utf8").digest("hex"));});

test("DISCOVERY release passes the actual installer source-format gate",async()=>{
 const installer=readFileSync(new URL("../scriptable/YOS Common Installer.js",import.meta.url),"utf8");
 const start=installer.indexOf("async function install(entry){");
 const end=installer.indexOf("  const existing=[];",start);
 assert.ok(start>=0&&end>start);
 const extract=name=>{const at=installer.indexOf("function "+name+"(");assert.ok(at>=0);return installer.slice(at,installer.indexOf("\n}",at)+2)};
 const prefix=installer.slice(start,end)+"return name;\n}";
 const gate=new Function("raw","const ROOT='https://example.invalid/';const SELF='YOS Common Installer';const isRemoteEntry=()=>false;const verifiedSource=async()=>raw;const localizedCode=(e,r)=>r;const stores=()=>[];"+extract("digest")+"\n"+extract("scriptName")+"\n"+prefix+"\nreturn install;");
 assert.equal(await gate(src)(entry),entry.name);
 const header="// Variables used by Scriptable.\n// icon-color: blue; icon-glyph: microscope;\n";
 assert.ok(src.startsWith(header));
 await assert.rejects(gate(src.slice(header.length))(entry),/GitHub元コードの形式が不一致/);
});
