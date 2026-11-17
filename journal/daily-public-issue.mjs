import {readFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

// Official, public RSS feeds only. No Notion, personal context, or AI model endpoint.
export const SOURCES=[
 {name:'沖縄県公式',feed:'https://www.pref.okinawa.lg.jp/news.rss',hosts:['www.pref.okinawa.lg.jp','www.pref.okinawa.jp']},
 {name:'沖縄県報道発表',feed:'https://www.pref.okinawa.lg.jp/press_news.rss',hosts:['www.pref.okinawa.lg.jp','www.pref.okinawa.jp']},
 {name:'宜野湾市公式',feed:'https://www.city.ginowan.lg.jp/cgi-bin/feed.php?categoryNo=5176',hosts:['www.city.ginowan.lg.jp']}
];
const EXCLUDE=/(入札|プロポーザル|採用|求人|職員募集|事業者募集|募集要項|履歴書|人事異動|審議会議事録|会議録|会計年度任用)/;
const LANES=[
 {name:'SELF / WELLBEING',lane:'DIRECTION',score:10,pattern:/(肌|皮膚|ニキビ|美容|歯科|口腔|健康|運動|睡眠|食育|栄養|生活習慣)/,reason:'身だしなみ・健康習慣を考える際、公式情報に照らして選択肢を確認できる話題です。',action:'原文を開き、自分に当てはまる条件と注意事項があるか確かめる。'},
 {name:'WORK / MOBILITY',lane:'ACTION',score:9,pattern:/(タクシー|旅客|配車|道路交通|交通規制|道路規制|交通安全|公共交通|渋滞|道路通行|観光交通|運輸)/,reason:'沖縄での移動や安全運行に関わる可能性があり、事実関係を把握する材料になります。',action:'原文で対象地域・日時・交通規制の有無を確認する。'},
 {name:'DISCOVERY / CULTURE',lane:'DISCOVERY',score:8,pattern:/(ライブ|音楽|コンサート|演奏|フェス|音楽祭|文化祭|展示|展覧|美術|芸術|工芸|映画祭|イベント|祭り|体験会)/,reason:'沖縄県内で楽しめる文化や体験の候補として、新しい発見につながる話題です。',action:'公式案内で開催日・場所・参加条件を確認する。'},
 {name:'LIFE / PRACTICAL',lane:'DIRECTION',score:6,pattern:/(給付|減免|支援制度|補助金|暮らし|住まい|住宅|消費生活|消費者|詐欺|生活相談|生活支援|物価|防災)/,reason:'暮らしの制度や安全について、対象と利用条件を原文で確認する価値がある話題です。',action:'制度の対象者・期限・必要な手続きがあるか確認する。'},
 {name:'LIFE / DIGITAL',lane:'DIRECTION',score:4,pattern:/(デジタル|スマートフォン|アプリ|ICT|人工知能|生成AI|DX)/,reason:'日常の操作や情報管理をより簡単にする方法を考える材料になります。',action:'公式情報で利用条件と実際に使える範囲を確認する。'}
];
const PRIVATE=/(口座番号|暗証番号|あなたの借入|あなたの残高|キャネット|LINE Pay借入|マイナンバー|sk-proj-|ntn_|Bearer\s+[a-zA-Z0-9_-]{10,})/i;
const DAY=86400000;
export function jstDate(date=new Date()){
 const f=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
 const p=Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function decode(t){return String(t||'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,e)=>{
 const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
 if(e[0]==='#'){const n=e[1]?.toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
 return named[e.toLowerCase()]||'';
});}
function clean(raw){return decode(String(raw||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ')).trim();}
function field(item,name){return clean(item.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'');}
export function parseRSS(xml){
 if(!/<(?:rss|rdf:RDF)\b/i.test(xml)||xml.length>1800000)return [];
 return (xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[]).slice(0,100).map(v=>({title:field(v,'title'),link:field(v,'link'),description:field(v,'description'),published:field(v,'pubDate')||field(v,'dc:date')}));
}
function trusted(url,source){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&source.hosts.includes(u.hostname)?u.href:null;}catch{return null;}}
function brief(text){const t=clean(text);if(t.length<30)return '';let s=t.slice(0,170);const e=Math.max(s.lastIndexOf('。'),s.lastIndexOf('．'));if(e>=35)s=s.slice(0,e+1);else if(t.length>170)s=s.slice(0,157)+'…';return s;}
export function pickFrom(items,source,now=new Date()){
 const dateMs=Date.parse(jstDate(now)+'T00:00:00Z');
 return items.flatMap(x=>{
  const url=trusted(x.link,source);if(!url||x.title.length<7||x.title.length>170||EXCLUDE.test(x.title)||PRIVATE.test(JSON.stringify(x)))return [];
  const d=new Date(x.published);if(Number.isNaN(d.getTime()))return [];
  const sourceDate=jstDate(d),age=(dateMs-Date.parse(sourceDate+'T00:00:00Z'))/DAY;
  if(age<0||age>3)return [];
  const lane=LANES.find(l=>l.pattern.test(x.title));if(!lane)return [];
  const summary=brief(x.description);if(!summary)return [];
  return [{category:lane.name,editorialLane:lane.lane,title:x.title,summary,reason:lane.reason,action:lane.action,caveat:'公式RSSに掲載された説明の抜粋です。日付・適用条件・変更の有無は原文で確認してください。',source:source.name,sourceDate,link:url,image:'',imageKind:'',imageCaption:'',keyPoints:[],_score:lane.score*100-age*7}];
 });
}
export async function collect({fetcher=fetch,now=new Date()}={}){
 const picked=[];let working=0;
 for(const source of SOURCES){try{
  const res=await fetcher(source.feed,{signal:AbortSignal.timeout(12000),headers:{accept:'application/rss+xml, application/xml, text/xml'}});
  if(!res.ok)continue;const xml=await res.text();if(xml.length>1800000||!/<(?:rss|rdf:RDF)\b/i.test(xml))continue;
  working++;picked.push(...pickFrom(parseRSS(xml),source,now));
 }catch{}}
 const seen=new Set();return {working,items:picked.sort((a,b)=>b._score-a._score).filter(x=>{if(seen.has(x.link))return false;seen.add(x.link);return true;})};
}
export function validateIssue(issue,now=new Date()){
 if(issue?.issuedOn!==jstDate(now)||!Array.isArray(issue.articles)||issue.articles.length<1||issue.articles.length>4)throw Error('invalid date/count');
 const used=new Set(),today=Date.parse(issue.issuedOn+'T00:00:00Z');
 for(const a of issue.articles){const source=SOURCES.find(s=>s.name===a.source);if(!source||!trusted(a.link,source)||used.has(a.link))throw Error('invalid/duplicate source');used.add(a.link);
  if(!LANES.some(l=>l.name===a.category&&l.lane===a.editorialLane&&l.pattern.test(a.title)))throw Error('unmatched category');
  if(a.title.length>170||a.summary.length<30||a.summary.length>170||a.reason.length<15||a.action.length<10)throw Error('incomplete article');
  const n=Date.parse(a.sourceDate+'T00:00:00Z');if(!Number.isFinite(n)||(today-n)/DAY<0||(today-n)/DAY>3)throw Error('stale source');
  if(a.image||a.imageCaption||a.imageKind||PRIVATE.test(JSON.stringify(a)))throw Error('private content/unlicensed image');
  if(!a.caveat.includes('公式RSS'))throw Error('missing excerpt label');
 }
 return true;
}
export function makeIssue(candidates,{now=new Date(),previousLinks=[]}={}){
 const blocked=new Set(previousLinks),articles=[];
 for(const a of candidates){if(blocked.has(a.link)||PRIVATE.test(JSON.stringify(a)))continue;const {_score,...rest}=a;articles.push(rest);blocked.add(a.link);if(articles.length===4)break;}
 if(!articles.length)return null;
 const issuedOn=jstDate(now),weekday=['SUN','MON','TUE','WED','THU','FRI','SAT'][new Date(issuedOn+'T00:00:00Z').getUTCDay()];
 const issue={issuedOn,date:issuedOn.replace(/-/g,'.')+' / '+weekday,headline:articles[0].title,lead:'公式の新着情報から、実際に確認する価値のある話題だけを紹介。記事の条件は原文で確かめてください。',edition:'OFFICIAL SOURCE EDIT',articles};
 validateIssue(issue,now);return issue;
}
const readJSON=async p=>{try{return JSON.parse(await readFile(p,'utf8'));}catch{return null;}};
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function build({fetcher=fetch,now=new Date(),rootPath=ROOT}={}){
 const day=jstDate(now),dated=resolve(rootPath,'journal/editions',day+'.json');
 try{await access(dated);return {status:'already-published',issue:null};}catch{}
 const history=await Promise.all([readJSON(resolve(rootPath,'ios-app/scriptable/journal/latest.json')),readJSON(resolve(rootPath,'journal/editions',jstDate(new Date(now.getTime()-DAY))+'.json')),readJSON(resolve(rootPath,'journal/editions',jstDate(new Date(now.getTime()-2*DAY))+'.json'))]);
 const previousLinks=history.flatMap(x=>x?.articles||[]).map(x=>x.link).filter(Boolean);
 const got=await collect({fetcher,now});if(!got.working)return {status:'sources-unavailable',issue:null};
 const issue=makeIssue(got.items,{now,previousLinks});return issue?{status:'ready',issue}:{status:'no-eligible-new-articles',issue:null};
}
export async function writeIssue(issue,rootPath=ROOT,now=new Date()){
 validateIssue(issue,now);
 const dated=resolve(rootPath,'journal/editions',issue.issuedOn+'.json');
 try{await access(dated);throw Error('Existing dated issue is immutable');}catch(e){if(e.code!=='ENOENT')throw e;}
 const serialized=JSON.stringify(issue,null,2)+'\n';
 await writeFile(dated,serialized,{flag:'wx'});
 await writeFile(resolve(rootPath,'ios-app/scriptable/journal',issue.issuedOn+'.json'),serialized,{flag:'wx'});
 await writeFile(resolve(rootPath,'ios-app/scriptable/journal/latest.json'),serialized);
}
async function main(){const result=await build();console.log('JOURNAL editorial status: '+result.status);if(!result.issue)return;
 console.log('Candidate date='+result.issue.issuedOn+' stories='+result.issue.articles.length);
 if(process.argv.includes('--write')){await writeIssue(result.issue);console.log('Candidate files saved; publication still requires Git commit and push.');}
 else console.log(JSON.stringify(result.issue,null,2));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1;});