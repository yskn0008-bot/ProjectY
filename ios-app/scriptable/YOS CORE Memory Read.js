// Variables used by Scriptable.
// icon-color: purple; icon-glyph: magnifying-glass;
// YOS_SCRIPT_NAME: YOS CORE Memory Read
// Read-only memory lookup. Local configuration only; no embedded account identifiers.
async function readMemory(input,getPage,now=()=>Date.now(),limits={pages:60,ms:18000}){
 const norm=s=>s.normalize("NFKC").toLowerCase();
 const out={mode:"memory_read",status:"held",complete:false,pages:0,matches:[],matchCount:0,issues:[]};
 if(typeof input==="string"){try{input=JSON.parse(input)}catch(_){return {...out,issues:["INVALID_INPUT"]}}}
 if(!input||input.mode!=="memory_read"||typeof input.query!=="string"||input.query.trim().length<2||input.query.length>100)return {...out,issues:["INVALID_INPUT"]};
 const q=norm(input.query.trim()),start=now(),seen=new Set(),records=new Map(),duplicates=new Set(),seenIds=new Set();
 const txt=b=>{const a=b?.[b.type]?.rich_text;return Array.isArray(a)?a.map(x=>typeof x.plain_text==="string"?x.plain_text:typeof x.text?.content==="string"?x.text.content:"").join(""):""};
 let cursor=null,active=null,finished=false;
 function issue(s){if(!out.issues.includes(s))out.issues.push(s)}
 function commit(){
  if(!active)return;
  if(active.label==="Clarity Text"&&active.parts.join("").trim()&&!active.invalid){
   if(records.has(active.id)){duplicates.add(active.id);issue("DUPLICATE_ID")}
   else records.set(active.id,{id:active.id,recordedAt:active.date,blockId:active.blockId,text:active.parts.join("")});
  }else if(active.label==="Clarity Text"){issue("INCOMPLETE_RECORD")}
  active=null;
 }
 for(let p=0;p<limits.pages;p++){
  if(now()-start>=limits.ms){issue("TIME_LIMIT");break}
  let page;
  try{page=await getPage(cursor)}catch(_){issue("READ_FAILED");break}
  if(!page||!Array.isArray(page.results)||typeof page.has_more!=="boolean"){issue("INVALID_PAGE");break}
  out.pages++;
  for(const b of page.results){
   if(!b||typeof b.type!=="string"){if(active)active.invalid=true;issue("INVALID_BLOCK");continue}
   const t=txt(b);
   const m=b.type==="paragraph"&&t.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) · (Clarity Text|Clarity Voice|Clarity Share(?: \[[^\]]+\])?|YOS JOURNAL Draft) · ((?:clarity|journal):[a-zA-Z0-9_-]+)$/);
   if(m){
    if(active?.label==="Clarity Text")issue("INCOMPLETE_RECORD");
    if(m[2]==="Clarity Text"){
     if(seenIds.has(m[3])){duplicates.add(m[3]);issue("DUPLICATE_ID")}
     seenIds.add(m[3]);
    }
    active={date:m[1],label:m[2],id:m[3],blockId:b.id,parts:[],invalid:!Number.isFinite(Date.parse(m[1]))||typeof b.id!=="string"||!b.id||(m[2]==="Clarity Text"&&!m[3].startsWith("clarity:"))};continue
   }
   // A different or unfamiliar record boundary must never be joined to a text record.
   if(b.type==="paragraph"&&/^\d{4}-\d{2}-\d{2}T[^\n]{0,40} · (?:Clarity |YOS JOURNAL )/.test(t)){
    if(active?.label==="Clarity Text")issue("INCOMPLETE_RECORD");active=null;continue
   }
   if(!active)continue;
   if(b.type==="divider"){commit();continue}
   if(b.type==="paragraph"&&active.parts.join("").length+t.length<=12000){active.parts.push(t)}
   else active.invalid=true;
  }
  if(!page.has_more){finished=true;break}
  if(typeof page.next_cursor!=="string"||!page.next_cursor||seen.has(page.next_cursor)){issue("CURSOR_INVALID");break}
  seen.add(page.next_cursor);cursor=page.next_cursor;
 }
 if(active?.label==="Clarity Text")issue("INCOMPLETE_RECORD");
 if(!finished&&out.issues.length===0)issue("PAGE_LIMIT");
 const hits=[...records.values()].filter(x=>!duplicates.has(x.id)&&norm(x.text).includes(q)).sort((a,b)=>Date.parse(b.recordedAt)-Date.parse(a.recordedAt)||a.id.localeCompare(b.id));
 out.matches=hits.slice(0,5).map(({text,...r})=>{const normalized=norm(text);const index=normalized.indexOf(q);const begin=Math.max(0,index-240);return {...r,excerpt:normalized.slice(begin,begin+1200),excerptNormalized:true,truncated:normalized.length>1200}});
 out.matchCount=hits.length;out.scope="Clarity Text only";out.complete=finished&&out.issues.length===0;out.status=out.complete?"ok":out.pages?"partial":"held";return out;
}

function configId(source){
 if(typeof source!=="string"||source.length>150000)return null;
 const matches=[...source.matchAll(/^\s*const CFG\s*=\s*Object\.freeze\(\{\s*inboxId:\s*['"]([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})['"]\s*,\s*tokenKey:\s*['"]YOS_NOTION_INTEGRATION_TOKEN['"]\s*,/gmi)];
 return matches.length===1?matches[0][1].toLowerCase():null;
}
async function localInboxId(FileManager){
 const ids=[];
 for(const fm of [FileManager.local(),FileManager.iCloud()]){
  const path=fm.joinPath(fm.documentsDirectory(),"YOS Clarity Inbox Bridge.js");
  if(!fm.fileExists(path))continue;
  if(fm.isFileStoredIniCloud(path))await fm.downloadFileFromiCloud(path);
  const id=configId(fm.readString(path));
  if(!id)throw Error("CONFIG_INVALID");
  ids.push(id);
 }
 if(!ids.length)throw Error("CONFIG_MISSING");
 if(ids.some(id=>id!==ids[0]))throw Error("CONFIG_CONFLICT");
 return ids[0];
}
async function main(input,FileManager,Keychain,Request){
 let inbox,token,configIssue=null;
 const out=await readMemory(input,async cursor=>{
  if(!inbox){
   try{inbox=await localInboxId(FileManager)}catch(e){configIssue=["CONFIG_INVALID","CONFIG_MISSING","CONFIG_CONFLICT"].includes(e.message)?e.message:"CONFIG_UNAVAILABLE";throw Error(configIssue)}
   if(!Keychain.contains("YOS_NOTION_INTEGRATION_TOKEN")){configIssue="AUTH_MISSING";throw Error(configIssue)}
   token=Keychain.get("YOS_NOTION_INTEGRATION_TOKEN");
   if(typeof token!=="string"||token.length<10){configIssue="AUTH_INVALID";throw Error(configIssue)}
  }
  const req=new Request("https://api.notion.com/v1/blocks/"+inbox+"/children?page_size=100"+(cursor?"&start_cursor="+encodeURIComponent(cursor):""));
  req.method="GET";req.timeoutInterval=5;
  req.headers={Authorization:"Bearer "+token,"Notion-Version":"2025-09-03"};
  const data=await req.loadJSON();
  if(!req.response||req.response.statusCode!==200)throw Error("HTTP_FAILED");
  return data;
 });
 if(configIssue)out.issues=[configIssue];
 return out;
}
let result;
try{result=await main(args.shortcutParameter,FileManager,Keychain,Request)}catch(_){result={mode:"memory_read",status:"held",complete:false,matches:[],issues:["READ_FAILED"]}}
Script.setShortcutOutput(JSON.stringify(result));
Script.complete();
