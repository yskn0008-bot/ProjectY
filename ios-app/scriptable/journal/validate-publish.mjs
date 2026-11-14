// Independent public-data gate for editorial publication. Defaults to refusal.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {jstDate,sources} from './daily-editor.mjs';
function fail(message){throw Error('JOURNAL publication refused: '+message)}
export function validatePublication(issue,now=new Date()){
 const today=jstDate(now);
 if(issue?.issuedOn!==today||!Array.isArray(issue.articles)||issue.articles.length<1||issue.articles.length>5)fail('not an eligible new issue');
 if(typeof issue.headline!=='string'||issue.headline.length<10||issue.headline.length>150)fail('bad cover headline');
 const used=new Set();
 for(const a of issue.articles){
  if(!a||typeof a.title!=='string'||a.title.length<10||a.title.length>170)fail('bad title');
  let u;try{u=new URL(a.link)}catch{fail('invalid original URL')}
  const source=sources.find(s=>s.name===a.source&&s.hosts.includes(u.hostname));
  if(!source||u.protocol!=='https:'||u.username||u.password||u.port||used.has(a.link))fail('unverified or repeated source');
  used.add(a.link);
  const day=Date.parse(a.sourceDate+'T00:00:00Z'),age=(Date.parse(today+'T00:00:00Z')-day)/86400000;
  if(!Number.isFinite(day)||age<0||age>3)fail('stale or unverified source date');
  for(const field of ['summary','reason','action','caveat']){
   if(typeof a[field]!=='string'||a[field].trim().length<10||a[field].length>300)fail('incomplete '+field);
  }
  if(!a.caveat.includes('AI要約'))fail('AI summaries must be labeled');
  if(a.image||a.imageCaption||a.imageKind||a.imageCredit)fail('unlicensed image not permitted');
  const text=JSON.stringify(a);
  if(/(口座番号|暗証番号|あなたの借入|あなたの残高|キャネット|LINE Pay借入|マイナンバー)/i.test(text))fail('personal-data pattern');
 }
 return true;
}
async function main(){
 if(!process.argv[2])fail('candidate file required');
 const data=JSON.parse(await readFile(process.argv[2],'utf8'));
 validatePublication(data);
 console.log('Safe publication structure: '+data.issuedOn+' '+data.articles.length+' original links. Editorial factual review remains required.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1});
