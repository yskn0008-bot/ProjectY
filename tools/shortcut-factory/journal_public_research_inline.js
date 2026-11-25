// Public-source discovery for YOS JOURNAL. Runs inside the new Research TEST Shortcut.
// Existing Notion Keychain: read only reviewed source IDs; public searches use fixed terms only. No uploads.
// Retrieves full-text original sections for a separate pre-writing semantic reviewer.
'use strict';
const TOPICS = Object.freeze([
  ['魅力と第一印象','facial attractiveness first impressions'],
  ['肌と魅力の知覚','skin colour facial attractiveness perception'],
  ['芸術と感性','aesthetic experience art neuroscience'],
  ['音楽と感情','music listening emotion cognition'],
  ['睡眠と夜間の認知','night shift sleep cognition'],
  ['魅力と健康の思い込み','facial attractiveness immune health'],
  ['会話と人間関係','social interactions positive emotions study'],
  ['好奇心と学習','curiosity memory neuroscience'],
]);
const clean=x=>String(x||'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot);/g,' ').replace(/\s+/g,' ').trim();
const HOLD = 'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE';

// Read only source identifiers from the EXISTING private reviewed reading page.
// No page text, credentials, titles or private history are sent to research providers.
const REVIEW_PAGE='4215ca88-2895-816f-bdd3-c48c6cf700ae';
const HISTORY_HOLD='YOS_RESEARCH_HOLD_V1:REVIEWED_HISTORY_UNAVAILABLE';
const textOf=b=>(b?.[b.type]?.rich_text||[]).map(x=>x.plain_text??x.text?.content??'').join('');
function sourceKey(url){
 if(typeof url!=='string')return '';
 const doi=/^https:\/\/doi\.org\/(10\.\d{4,9}\/[A-Za-z0-9._;()/:+%-]{1,300})$/i.exec(url);
 if(doi){try{return 'doi:'+decodeURIComponent(doi[1]).toLowerCase()}catch{return ''}}
 return /^https:\/\/(?:www\.theguardian\.com|www\.bbc\.com|www\.bbc\.co\.uk)\/[^\s?#]+$/i.test(url)?url.toLowerCase():'';
}
function historyFromBlocks(blocks){
 if(!Array.isArray(blocks)||blocks.length>3000)throw Error('HISTORY_INVALID');
 const dates=new Set(),seen=new Set();let count=0;
 for(let i=0;i<blocks.length;i++){
  const b=blocks[i],m=b?.type==='heading_2'&&/^YOS JOURNAL｜(\d{4})\.(\d{2})\.(\d{2})(?:\s|$)/u.exec(textOf(b));
  if(!m)continue;
  const date=m.slice(1).join('-');
  if(dates.has(date)||!['本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。',"本人用の非公開読書版。原著抜粋とGPTの執筆前・最終照合を実施。全文の独立審査は未実施。外部公開・配信は行っていない。"].includes(textOf(blocks[i+3])))throw Error('HISTORY_EDITION_INVALID');
  dates.add(date);let cursor=i+4;
  for(let n=1;n<=3;n++){
   if(blocks[cursor]?.type==='divider')cursor++;
   if(blocks[cursor]?.type!=='heading_3'||!new RegExp('^0'+n+'\\s*/\\s*[A-Z]+｜').test(textOf(blocks[cursor])))throw Error('HISTORY_ARTICLE_INVALID');
   const parts=blocks.slice(cursor+1,cursor+6);
   if(parts.length!==5||parts.some(x=>x.type!=='paragraph'))throw Error('HISTORY_ARTICLE_INCOMPLETE');
   const b=parts[4],links=(b.paragraph?.rich_text||[]).map(x=>x.href??x.text?.link?.url).filter(Boolean);
   const key=links.length===1&&sourceKey(links[0]);
   if(!key||!textOf(b).startsWith('原著論文'))throw Error('HISTORY_SOURCE_INVALID');
   seen.add(key);cursor+=6;
  }
  if(blocks[cursor]?.type!=='divider')throw Error('HISTORY_BOUNDARY_INVALID');
  count++;i=cursor;
 }
 if(!count)throw Error('HISTORY_NO_REVIEWED_EDITION');
 return seen;
}
async function reviewedHistory(){
 if(typeof Keychain==='undefined'||!Keychain.contains('YOS_NOTION_INTEGRATION_TOKEN'))throw Error('HISTORY_KEY_MISSING');
 const token=Keychain.get('YOS_NOTION_INTEGRATION_TOKEN');
 const base='https://api.notion.com/v1/blocks/'+REVIEW_PAGE+'/children?page_size=100';
 let cursor='',blocks=[],deadline=Date.now()+10000;
 for(let p=0;p<30;p++){
  const remaining=deadline-Date.now();if(remaining<500)throw Error('HISTORY_TIMEOUT');
  const r=new Request(base+(cursor?'&start_cursor='+encodeURIComponent(cursor):''));
  r.method='GET';r.timeoutInterval=Math.min(4,remaining/1000);
  r.headers={Authorization:'Bearer '+token,'Notion-Version':'2025-09-03',Accept:'application/json'};
  r.onRedirect=()=>null;
  const body=await r.loadJSON();
  if(r.response?.statusCode!==200||!Array.isArray(body.results)||typeof body.has_more!=='boolean')throw Error('HISTORY_HTTP');
  blocks.push(...body.results);
  if(!body.has_more)return historyFromBlocks(blocks);
  if(typeof body.next_cursor!=='string'||!body.next_cursor||body.next_cursor===cursor)throw Error('HISTORY_CURSOR');
  cursor=body.next_cursor;
 }
 throw Error('HISTORY_INCOMPLETE');
}

// Public full-text acquisition only. No abstract-only or RSS fallback.
// Keep only the original article sections required for editorial screening.
const tidy=x=>clean(String(x||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'"));
const safeDoi=x=>typeof x==='string'&&/^10\.\d{4,9}\/[A-Za-z0-9._;()/:%-]{1,160}$/.test(x)?x:null;
const safePmc=x=>typeof x==='string'&&/^PMC[1-9]\d{3,11}$/.test(x)?x:null;
const POOL='YOS_RESEARCH_FULLTEXT_POOL_V1';
function parseFullText(xml,record){
 if(typeof xml!=='string'||xml.length<1000||xml.length>2000000||/<!ENTITY/i.test(xml))return null;
 const front=/<front\b[^>]*>([\s\S]*?)<\/front>/i.exec(xml)?.[1]||'';
 const doi=/<article-id\b[^>]*pub-id-type=["']doi["'][^>]*>([\s\S]*?)<\/article-id>/i.exec(front)?.[1];
 const pmc=/<article-id\b[^>]*pub-id-type=["'](?:pmc|pmcid)["'][^>]*>([\s\S]*?)<\/article-id>/i.exec(front)?.[1];
 if(!doi||tidy(doi).toLowerCase()!==record.doi.toLowerCase()||!pmc||('PMC'+tidy(pmc).replace(/^PMC/i,'')).toUpperCase()!==record.pmcid)return null;
 if(/<article\b[^>]*article-type=["'](?:retraction|correction|editorial|letter|news|review-article)["']/i.test(xml))return null;
 const title=tidy(/<article-title\b[^>]*>([\s\S]*?)<\/article-title>/i.exec(front)?.[1]);
 if(title.length<20)return null;
 const body=/<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xml)?.[1];if(!body)return null;
 // Capture top-level section text up to the next title. Never invent a section.
 const sections=[...body.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>([\s\S]*?)(?=<title\b|$)/gi)].map(m=>({title:tidy(m[1]),body:tidy(m[2].replace(/<(?:fig|table-wrap)\b[\s\S]*?<\/(?:fig|table-wrap)>/gi,' '))}));
 const pick=re=>sections.filter(s=>re.test(s.title)&&s.body.length>=120).map(s=>s.body).join(' ').slice(0,1800);
 const methods=pick(/^(?:materials and methods|methods|methodology|participants|study design|procedure|experimental design)\b/i);
 const results=pick(/^(?:results|findings|main results)\b/i);
 const discussion=pick(/^(?:discussion|limitations|conclusions?|strengths and limitations)\b/i);
 if(!methods||!results||!discussion)return null;
 return {...record,title,methods,results,discussion,original:'https://europepmc.org/articles/'+record.pmcid};
}
async function request(url,json,seconds){
 const r=new Request(url);r.method='GET';r.timeoutInterval=seconds;
 r.headers={Accept:json?'application/json':'application/xml'};
 r.onRedirect=()=>null;
 const x=json?await r.loadJSON():await r.loadString();
 if(r.response?.statusCode!==200)throw Error('PUBLIC_HTTP');
 return x;
}
async function fetchStudies(topic){
 const q='https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='+encodeURIComponent('('+topic[1]+') AND OPEN_ACCESS:Y AND HAS_FT:Y AND NOT PUB_TYPE:review AND NOT PUB_TYPE:retracted-publication')+'&format=json&resultType=core&pageSize=12';
 const result=await request(q,true,4);
 const rows=Array.isArray(result?.resultList?.result)?result.resultList.result:[];
 return rows.flatMap(x=>{
  const doi=safeDoi(x.doi),pmcid=safePmc(x.pmcid),year=Number(x.pubYear);
  if(!doi||!pmcid||!Number.isInteger(year)||year<2015||year>new Date().getFullYear()||/retract/i.test(String(x.pubType||'')))return [];
  return [{doi,pmcid,year,url:'https://doi.org/'+doi,topic:topic[0]}];
 });
}
async function getFullText(record){
 const url='https://www.ebi.ac.uk/europepmc/webservices/rest/'+record.pmcid+'/fullTextXML';
 const xml=await request(url,false,4);
 return parseFullText(xml,record);
}
async function main(){
 const day=Math.floor((Date.now()+9*3600000)/86400000);
 const index=day%TOPICS.length;
 let history;
 try{history=await reviewedHistory();}catch(_){Script.setShortcutOutput(HISTORY_HOLD);return;}
 const seen=new Set(history);
 const topics=[0,3,5].map(offset=>TOPICS[(index+offset)%TOPICS.length]);
 try{
  const groups=await Promise.all(topics.map(t=>fetchStudies(t).catch(()=>[])));
  const queues=groups.map(g=>g.filter(r=>!seen.has(sourceKey(r.url))));
  const accepted=[];
  // 3 bounded waves, up to 6 parallel original documents per wave.
  // Keep a reserve so the semantic reviewer can reject unsuitable candidates
  // before any article is written. Each topic has a separate candidate queue.
  for(let wave=0;wave<3;wave++){
   const batch=[];
   for(let g=0;g<queues.length;g++){
    if(accepted.filter(x=>x.group===g).length>=2)continue;
    let slots=2-accepted.filter(x=>x.group===g).length;
    while(slots>0&&queues[g].length){
     const r=queues[g].shift(),key=sourceKey(r.url);
     if(!key||seen.has(key))continue;
     seen.add(key);batch.push({...r,group:g});slots--;
    }
   }
   if(!batch.length)break;
   const results=await Promise.all(batch.map(r=>getFullText(r).catch(()=>null)));
   accepted.push(...results.filter(Boolean));
   if(accepted.length===6)break;
  }
  if(accepted.length<3||new Set(accepted.map(r=>r.group)).size!==3){Script.setShortcutOutput(HOLD);return;}
  const records=accepted.map((r,i)=>({...r,id:'S'+(i+1)}));
  // Machine-checked access and section presence only, not semantic approval.
  const out=POOL+'\n'+JSON.stringify(records);
  if(out.length>40000)throw Error('POOL_TOO_LARGE');
  Script.setShortcutOutput(out);
 }catch(_){Script.setShortcutOutput(HOLD);}
}
try{await main();}
finally{Script.complete();}
