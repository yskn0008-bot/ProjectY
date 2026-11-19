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
const safeDoi=x=>typeof x==='string'&&/^10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]{1,160}$/.test(x)?x:null;
const makeRecord=x=>{
  const title=clean(x?.title).slice(0,240);
  const abstract=clean(x?.abstractText).slice(0,2400);
  const doi=safeDoi(x?.doi);
  const year=Number(x?.pubYear);
  const pmid=String(x?.pmid||'');
  if(title.length<25||abstract.length<250||!Number.isInteger(year)||year<2015||year>new Date().getFullYear()||
    !doi&&!/^\d{6,9}$/.test(pmid))return null;
  const url=doi?'https://doi.org/'+doi:'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/';
  return {title,year,doi:doi||'',url,abstract};
};
function format(records,topic,query){
  return ['YOS_RESEARCH_ABSTRACT_V1','状態: 公開抄録の実取得済み／本文原典の意味照合待ち／自動公開禁止',
    '選択テーマ: '+topic,'検索語: '+query,'情報源: Europe PMC公式REST／原典の研究発表・内容は未独立照合',
    ...records.map((r,i)=>['資料'+(i+1)+'｜'+r.title,'出版年: '+r.year,'DOI: '+r.doi,
       '論文リンク: '+r.url,'原典抄録（抜粋・翻訳ではない）: '+r.abstract,
       '取り扱い: 元の研究条件と解釈は別途照合。誇張・因果断定禁止。'].join('\n')),
    '事実確認: 抄録の文字列は実取得したが、研究結果や主張の独立した意味照合は未実施。',
    '執筆ルール: 研究の対象者・効果量・設計・限界が不明なら創作せず【要裏取り】。資料にない事実や数字を追加しない。'
  ].join('\n\n');
}
async function fetchStudies(topic){
  const q='https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='+
    encodeURIComponent(topic[1])+'&format=json&resultType=core&pageSize=8';
  const r=new Request(q);
  r.method='GET';r.timeoutInterval=9;
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
    if(matched.length===2)break;
  }
  if(!matched.length)throw Error('NO_PUBLIC_ABSTRACTS');
  return format(matched,topic[0],topic[1]);
}
async function main(){
  // Daily theme rotation, never transmit shortcut input or personal data in a query.
  const index=Math.floor(new Date().getTime()/86400000)%TOPICS.length;
  try{
    const notes=await fetchStudies(TOPICS[index]);
    Script.setShortcutOutput(notes);
  }catch(err){
    // Do not generate a speculative article after unavailable/blocked sources.
    Script.setShortcutOutput('YOS_RESEARCH_HOLD_V1:SOURCE_UNAVAILABLE');
  }
}
try{await main();}
finally{Script.complete();}
