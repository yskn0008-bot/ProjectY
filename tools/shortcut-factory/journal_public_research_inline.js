// Public-source discovery for YOS JOURNAL. Runs inside the new Research TEST Shortcut.
// No credentials, no private Notion lookup, no uploads. Hard-coded search terms only.
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
// exact UTC-day's public abstract notes; this cache never stores private input.
const CACHE_FILE = 'YOS JOURNAL Public Abstract Cache V1.json';
const HOLD = 'YOS_RESEARCH_HOLD_V1:THREE_VALID_SOURCES_UNAVAILABLE';
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
    encodeURIComponent(topic[1])+'&format=json&resultType=core&pageSize=5';
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
    if(matched.length===5)break;
  }
  if(!matched.length)throw Error('NO_PUBLIC_ABSTRACTS');
  return matched.map(r=>({...r,provider:'Europe PMC公式REST（抄録）'}));
}
async function fetchCrossref(topic){
  // Only publisher-deposited public metadata and abstracts; never treated as full text.
  const url='https://api.crossref.org/works?rows=5&query='+encodeURIComponent(topic[1]);
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
    if(matched.length===5)break;
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
  const day=Math.floor(Date.now()/86400000);
  const index=day%TOPICS.length;
  try{
    const previous=readCache(day);
    if(previous){Script.setShortcutOutput(previous);return;}
    const topics=[0,3,5].map(offset=>TOPICS[(index+offset)%TOPICS.length]);
    // Three independent topic searches in parallel; at most two bounded waves.
    const primary=await Promise.all(topics.map(t=>fetchStudies(t).catch(()=>[])));
    const seen=new Set();
    const choose=rows=>rows.find(r=>!seen.has(r.doi.toLowerCase()));
    const selected=primary.map(rows=>{const r=choose(rows);if(r)seen.add(r.doi.toLowerCase());return r;});
    const fallback=await Promise.all(topics.map((t,i)=>selected[i]?Promise.resolve([]):fetchCrossref(t).catch(()=>[])));
    for(let i=0;i<selected.length;i++)if(!selected[i]){const r=choose(fallback[i]);if(r){seen.add(r.doi.toLowerCase());selected[i]=r;}}
    if(selected.filter(Boolean).length!==3){
      const feeds=await Promise.all(FEEDS.map(f=>fetchEditorialFeed(f).catch(()=>[])));
      const used=new Set(selected.filter(Boolean).map(x=>x.url));
      for(let i=0;i<selected.length;i++)if(!selected[i]){
        const row=feeds.flat().find(x=>!used.has(x.url));
        if(row){selected[i]=row;used.add(row.url);}
      }
    }
    if(selected.filter(Boolean).length!==3){
      const partial=selected.filter(Boolean);
      Script.setShortcutOutput(HOLD+(partial.length?'\n'+format(partial,'取材候補','未完了','実取得資料のみ').replace('YOS_RESEARCH_ABSTRACT_V1','YOS_RESEARCH_PARTIAL_V1'):''));
      return;
    }
    const notes=format(selected,topics.map(t=>t[0]).join('／'),topics.map(t=>t[1]).join('／'),'各資料の取得元を参照');
    if(!validNotes(notes))throw Error('INVALID_NOTES');
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
