// Public-source discovery for YOS JOURNAL. Runs inside the new Research TEST Shortcut.
// Existing Notion Keychain: read only reviewed source IDs; public searches use fixed terms only. No uploads.
// Returns abstract-level study leads, NOT independently verified full-text conclusions.
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
// Shortcuts extensions may be killed on long network waits. Reuse only the
// exact JST-day's public abstract notes; this cache never stores private input.
const CACHE_FILE = 'YOS JOURNAL Public Abstract Cache V1.json';
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
  if(dates.has(date)||textOf(blocks[i+3])!=='本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。')throw Error('HISTORY_EDITION_INVALID');
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
function cacheEligible(notes,history){
 const keys=(notes.match(/^(?:論文|出典)リンク: https:\/\/[^\s]+$/gm)||[]).map(line=>sourceKey(line.slice(line.indexOf('https://'))));
 return keys.length===3&&new Set(keys).size===3&&keys.every(k=>k&&!history.has(k));
}

const validNotes=s=>typeof s==='string'&&s.startsWith('YOS_RESEARCH_ABSTRACT_V1')&&s.includes('自動公開禁止')&&[...new Set((s.match(/^(?:論文|出典)リンク: https:\/\/[^\s]+$/gm)||[]).map(x=>x.toLowerCase()))].length===3&&(s.match(/^資料[123]｜/gm)||[]).length===3;
function cacheStore(){
  try{
    const fm=FileManager.local();
    return {fm,path:fm.joinPath(fm.documentsDirectory(),CACHE_FILE)};
  }catch(_){return null;}
}
function readCache(day){
  const store=cacheStore();
  if(!store)return null;
  try{
    if(!store.fm.fileExists(store.path))return null;
    const obj=JSON.parse(store.fm.readString(store.path));
    if(!obj||obj.day!==day||typeof obj.notes!=='string'||
      obj.notes.length>10000||!obj.notes.startsWith('YOS_RESEARCH_ABSTRACT_V1')||
      !validNotes(obj.notes)||
      typeof obj.savedAt!=='number'||Date.now()-obj.savedAt>24*60*60*1000||
      Date.now()<obj.savedAt)return null;
    return obj.notes;
  }catch(_){return null;}
}
function writeCache(day,notes){
  const store=cacheStore();
  if(!store||typeof notes!=='string'||notes.length>10000)return;
  try{
    const obj={day,notes,savedAt:Date.now()};
    const json=JSON.stringify(obj);
    store.fm.writeString(store.path,json);
    if(store.fm.readString(store.path)!==json)throw Error('CACHE_WRITE_FAILED');
  }catch(_){/* backup cache may be unavailable; do not break a successful output */}
}
const safeDoi=x=>typeof x==='string'&&/^10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]{1,160}$/.test(x)?x:null;
const makeRecord=x=>{
  const title=clean(x?.title).slice(0,240);
  const abstract=clean(x?.abstractText).slice(0,2400);
  const doi=safeDoi(x?.doi);
  const year=Number(x?.pubYear);
  const pmid=String(x?.pmid||'');
  if(title.length<25||abstract.length<250||!Number.isInteger(year)||year<2015||year>new Date().getFullYear()||
    !doi)return null;
  const url=doi?'https://doi.org/'+doi:'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/';
  return {title,year,doi:doi||'',url,abstract};
};
function format(records,topic,query,provider){
  return ['YOS_RESEARCH_ABSTRACT_V1','状態: 公開資料の実取得済み／本文の意味照合待ち／自動公開禁止',
    '選択テーマ: '+topic,'検索語: '+query,'情報源: '+provider+'／原典の研究発表・内容は未独立照合',
    ...records.map((r,i)=>['資料'+(i+1)+'｜'+r.title,'出版年: '+r.year,'DOI: '+r.doi,
       (r.doi?'論文リンク: ':'出典リンク: ')+r.url,'取得元: '+r.provider,'取得資料（抜粋・翻訳ではない）: '+r.abstract,
       '取り扱い: 元の研究条件と解釈は別途照合。誇張・因果断定禁止。'].join('\n')),
    '事実確認: 資料の文字列は実取得したが、研究結果や主張の独立した意味照合は未実施。',
    '執筆ルール: 研究の対象者・効果量・設計・限界が不明なら創作せず【要裏取り】。資料にない事実や数字を追加しない。'
  ].join('\n\n');
}
async function fetchStudies(topic){
  const q='https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='+
    encodeURIComponent(topic[1])+'&format=json&resultType=core&pageSize=12';
  const r=new Request(q);
  r.method='GET';r.timeoutInterval=4;
  r.headers={'Accept':'application/json'};
  // Preserve only same-origin HTTPS redirects; never follow to an arbitrary server.
  r.onRedirect=next=>String(next?.url||'').startsWith('https://www.ebi.ac.uk/europepmc/')?next:null;
  const result=await r.loadJSON();
  if(!r.response||r.response.statusCode!==200)throw Error('HTTP_NOT_OK');
  const rows=Array.isArray(result?.resultList?.result)?result.resultList.result:[];
  const seen=new Set(),matched=[];
  for(const row of rows){
    const v=makeRecord(row);
    if(!v||seen.has(v.url))continue;
    matched.push(v);seen.add(v.url);
    if(matched.length===12)break;
  }
  if(!matched.length)throw Error('NO_PUBLIC_ABSTRACTS');
  return matched.map(r=>({...r,provider:'Europe PMC公式REST（抄録）'}));
}
async function fetchCrossref(topic){
  // Only publisher-deposited public metadata and abstracts; never treated as full text.
  const url='https://api.crossref.org/works?rows=12&query='+encodeURIComponent(topic[1]);
  const r=new Request(url);
  r.method='GET';r.timeoutInterval=3;
  r.headers={'Accept':'application/json'};
  r.onRedirect=next=>String(next?.url||'').startsWith('https://api.crossref.org/')?next:null;
  const payload=await r.loadJSON();
  if(!r.response||r.response.statusCode!==200)throw Error('CROSSREF_HTTP_NOT_OK');
  const items=Array.isArray(payload?.message?.items)?payload.message.items:[];
  const seen=new Set(),matched=[];
  for(const x of items){
    if(x?.type!=='journal-article')continue;
    const parts=x?.published?.['date-parts']?.[0];
    const v=makeRecord({
      title:Array.isArray(x.title)?x.title[0]:'',
      abstractText:x.abstract,
      pubYear:Array.isArray(parts)?parts[0]:null,
      doi:x.DOI
    });
    if(!v||seen.has(v.url))continue;
    seen.add(v.url);matched.push(v);
    if(matched.length===12)break;
  }
  if(!matched.length)throw Error('NO_CROSSREF_ABSTRACTS');
  return matched.map(r=>({...r,provider:'Crossref公式REST（登録抄録・全文未確認）'}));
}
// Public editorial RSS, no API key. Feed summaries are leads, not full-text verification.
const FEEDS=[
 ['https://www.theguardian.com/science/rss','www.theguardian.com','The Guardian 科学'],
 ['https://feeds.bbci.co.uk/news/science_and_environment/rss.xml','www.bbc.com','BBC 科学・環境']
];
async function fetchEditorialFeed([url,host,provider]){
 const r=new Request(url);r.method='GET';r.timeoutInterval=3;
 r.onRedirect=next=>String(next?.url||'')===url?next:null;
 const xml=await r.loadString();
 if(r.response?.statusCode!==200||typeof xml!=='string')return [];
 const field=(item,name)=>clean((item.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'))||[])[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1'));
 const rows=[];
 for(const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
  const title=field(match[1],'title'),abstract=field(match[1],'description'),link=field(match[1],'link'),date=Date.parse(field(match[1],'pubDate'));
  const allowed=link.startsWith('https://'+host+'/')||(host==='www.bbc.com'&&link.startsWith('https://www.bbc.co.uk/'));
  if(!allowed||title.length<15||abstract.length<80||!Number.isFinite(date)||date>Date.now()+86400000||Date.now()-date>30*86400000)continue;
  rows.push({title:title.slice(0,240),abstract:abstract.slice(0,1200),url:link,doi:'',year:new Date(date).getUTCFullYear(),provider:provider+'（RSS要約・本文未確認）'});
  if(rows.length===5)break;
 }
 return rows;
}
async function main(){
  // Daily theme rotation, never transmit shortcut input or personal data in a query.
  const day=Math.floor((Date.now()+9*3600000)/86400000);
  const index=day%TOPICS.length;
  try{
    let history;
    try{history=await reviewedHistory();}catch(_){Script.setShortcutOutput(HISTORY_HOLD);return;}
    const previous=readCache(day);
    if(previous&&cacheEligible(previous,history)){Script.setShortcutOutput(previous);return;}
    const topics=[0,3,5].map(offset=>TOPICS[(index+offset)%TOPICS.length]);
    // Three independent topic searches in parallel; at most two bounded waves.
    const primary=await Promise.all(topics.map(t=>fetchStudies(t).catch(()=>[])));
    const seen=new Set(history);
    const choose=rows=>rows.find(r=>sourceKey(r.url)&&!seen.has(sourceKey(r.url)));
    const selected=primary.map(rows=>{const r=choose(rows);if(r)seen.add(sourceKey(r.url));return r;});
    const [fallback,feeds]=await Promise.all([
      Promise.all(topics.map((t,i)=>selected[i]?Promise.resolve([]):fetchCrossref(t).catch(()=>[]))),
      selected.every(Boolean)?Promise.resolve([]):Promise.all(FEEDS.map(f=>fetchEditorialFeed(f).catch(()=>[])))
    ]);
    for(let i=0;i<selected.length;i++)if(!selected[i]){const r=choose(fallback[i]);if(r){seen.add(sourceKey(r.url));selected[i]=r;}}
    if(selected.filter(Boolean).length!==3){
      const used=new Set(selected.filter(Boolean).map(x=>x.url));
      for(let i=0;i<selected.length;i++)if(!selected[i]){
        const row=feeds.flat().find(x=>sourceKey(x.url)&&!seen.has(sourceKey(x.url))&&!used.has(x.url));
        if(row){selected[i]=row;used.add(row.url);seen.add(sourceKey(row.url));}
      }
    }
    if(selected.filter(Boolean).length!==3){
      const partial=selected.filter(Boolean);
      Script.setShortcutOutput(HOLD+(partial.length?'\n'+format(partial,'取材候補','未完了','実取得資料のみ').replace('YOS_RESEARCH_ABSTRACT_V1','YOS_RESEARCH_PARTIAL_V1'):''));
      return;
    }
    const notes=format(selected,topics.map(t=>t[0]).join('／'),topics.map(t=>t[1]).join('／'),'各資料の取得元を参照');
    if(!validNotes(notes)||!cacheEligible(notes,history))throw Error('INVALID_NOTES');
    // Always output before optional cache write; local file errors are non-fatal.
    Script.setShortcutOutput(notes);
    writeCache(day,notes);
  }catch(err){
    // Source unavailable: never invent a verified article or retry indefinitely.
    Script.setShortcutOutput(HOLD);
  }
}
try{await main();}
finally{Script.complete();}
