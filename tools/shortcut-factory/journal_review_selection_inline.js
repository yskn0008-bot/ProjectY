// No network or Keychain access. Bind reviewer decisions to the collected original excerpts.
const HOLD='YOS_REVIEW_HOLD_V1';
function approve(input){
 if(typeof input!=='string'||input.length>55000)throw Error('INPUT');
 const parts=input.split('\n<<YOS_REVIEW_SELECTION_V1>>\n');
 if(parts.length!==2||!parts[0].startsWith('YOS_RESEARCH_FULLTEXT_POOL_V1\n'))throw Error('POOL');
 const pool=JSON.parse(parts[0].split('\n').slice(1).join('\n'));
 const review=JSON.parse(parts[1].trim());
 if(!Array.isArray(pool)||pool.length<3||pool.length>6||!Array.isArray(review)||review.length!==3)throw Error('COUNT');
 const chosen=new Set(),links=new Set(),groups=new Set();
 const valid=(s,min,max)=>typeof s==='string'&&s.trim().length>=min&&s.length<=max&&!/[\r\n\u0000-\u001f]/.test(s);
 const out=[];
 for(const x of review){
  if(!x||Object.keys(x).sort().join()!=='id,limitQuote,methodQuote,question,resultQuote'||chosen.has(x.id))throw Error('REVIEW');
  const found=pool.filter(r=>r.id===x.id);
  if(found.length!==1)throw Error('UNKNOWN_SOURCE');
  const r=found[0],url=r.url;
  if(!/^https:\/\/doi\.org\/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]{1,160}$/i.test(url)||links.has(url.toLowerCase())||groups.has(r.group))throw Error('DUPLICATE');
  if(!valid(x.question,8,150))throw Error('QUESTION');
  for(const [field,source] of [['methodQuote','methods'],['resultQuote','results'],['limitQuote','discussion']]){
   if(!valid(x[field],35,350)||typeof r[source]!=='string'||!r[source].includes(x[field]))throw Error('UNSUPPORTED_EXCERPT');
  }
  chosen.add(x.id);links.add(url.toLowerCase());groups.add(r.group);
  out.push(['資料'+(out.length+1)+'｜'+r.title,'出版年: '+r.year,'DOI: '+r.doi,'論文リンク: '+url,'原典取得: Europe PMC '+r.pmcid,'採用する問い: '+x.question,'方法の原文: '+x.methodQuote,'結果の原文: '+x.resultQuote,'考察・限界の原文: '+x.limitQuote,'取扱い: 引用された範囲のみに基づき執筆。因果・一般化は研究設計に従う。'].join('\n'));
 }
 return 'YOS_RESEARCH_APPROVED_V1\n状態: 原著の方法・結果・考察取得／執筆前GPT審査／原文一致検査済み／自動公開禁止\n'+out.join('\n\n');
}
try{Script.setShortcutOutput(approve(args.shortcutParameter));}catch(_){Script.setShortcutOutput(HOLD);}
finally{Script.complete();}
