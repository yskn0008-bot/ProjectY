// Read only the existing private, editorial-reviewed JOURNAL reading page.
const PAGE='4215ca88-2895-816f-bdd3-c48c6cf700ae';
const HEAD=/^YOS JOURNAL｜(\d{4})\.(\d{2})\.(\d{2})(?:\s|$)/u;
const STORY=/^0([123])\s*\/\s*([A-Z]+)｜(.+)$/u;
const text=b=>(b?.[b.type]?.rich_text||[]).map(x=>x.plain_text??x.text?.content??'').join('');
const link=b=>{const a=(b?.[b.type]?.rich_text||[]).map(x=>x.href??x.text?.link?.url).filter(Boolean);return a.length===1?a[0]:''};
const safeLink=s=>/^https:\/\/doi\.org\/10\.\d{4,9}\/[A-Za-z0-9._;()/:%-]{1,300}$/u.test(s)?s:'';
export function parseReviewedEdition(blocks){
 if(!Array.isArray(blocks)||blocks.length>500)throw Error('invalid blocks');
 const starts=blocks.map((b,i)=>b.type==='heading_2'&&HEAD.test(text(b))?i:-1).filter(i=>i>=0);
 if(starts.length!==1)throw Error('edition ambiguous');
 let i=starts[0],m=HEAD.exec(text(blocks[i])),issuedOn=m.slice(1).join('-');
 const dt=new Date(issuedOn+'T00:00:00Z');if(!Number.isFinite(+dt)||dt.toISOString().slice(0,10)!==issuedOn)throw Error('date invalid');
 const header=blocks.slice(i+1,i+4).map(text);
 if(header.length!==3||!header[0]||!header[1]||header[2]!=='本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。')throw Error('review marker absent');
 i+=4;const articles=[];
 for(let n=1;n<=3;n++){
  if(blocks[i]?.type==='divider')i++;
  const b=blocks[i++],s=b?.type==='heading_3'&&STORY.exec(text(b));
  if(!s||Number(s[1])!==n)throw Error('article heading invalid');
  const parts=blocks.slice(i,i+5);i+=5;
  if(parts.length!==5||parts.some(x=>x.type!=='paragraph'))throw Error('article blocks invalid');
  const [summary,reason,action,caveat,source]=parts.map(text);
  const url=safeLink(link(parts[4]));
  if(!summary||!reason||!action.startsWith('日常への視点')||!caveat.startsWith('研究の限界')||!source.startsWith('原著論文')||!url)throw Error('article contract invalid');
  articles.push({category:s[2],title:s[3],summary,reason,action:action.replace(/^日常への視点[：:]\s*/u,''),caveat:caveat.replace(/^研究の限界[：:]\s*/u,''),source,link:url,keyPoints:[]});
 }
 if(blocks[i]?.type!=='divider'||new Set(articles.map(a=>a.link.toLowerCase())).size!==3)throw Error('edition boundary invalid');
 return {issuedOn,headline:header[0],lead:header[1],articles};
}
export function createJournalReader({authorize,notionToken,origins,fetcher=fetch}){
 return async request=>{
  const origin=request.headers.get('origin')||'',allowed=origins.includes(origin);
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(allowed?{'Access-Control-Allow-Origin':origin}:{})};
  const reply=(body,status)=>Response.json(body,{status,headers});
  if(!allowed)return reply({error:'Origin not allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'Authorization','Access-Control-Allow-Methods':'GET, OPTIONS'}});
  if(request.method!=='GET')return reply({error:'Method not allowed'},405);
  const token=/^Bearer ([^\s]{16,8192})$/u.exec(request.headers.get('authorization')||'')?.[1];
  if(!token)return reply({error:'Unauthorized'},401);
  try{if(await authorize(token)!==true)return reply({error:'Unauthorized'},401)}catch{return reply({error:'Unauthorized'},401)}
  if(!notionToken)return reply({error:'Unavailable'},503);
  try{
   let cursor='',blocks=[];
   for(let p=0;p<5;p++){
    const u='https://api.notion.com/v1/blocks/'+PAGE+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):'');
    const response=await fetcher(u,{headers:{Authorization:'Bearer '+notionToken,'Notion-Version':'2025-09-03'},redirect:'error',cache:'no-store'});
    if(!response.ok)throw Error('read failed');
    const data=await response.json();if(!Array.isArray(data.results)||typeof data.has_more!=='boolean')throw Error('invalid reply');
    blocks.push(...data.results);if(!data.has_more)return reply({source:'notion-reviewed-private',edition:parseReviewedEdition(blocks)},200);
    if(typeof data.next_cursor!=='string'||!data.next_cursor||data.next_cursor===cursor)throw Error('invalid cursor');cursor=data.next_cursor;
   }
   throw Error('incomplete');
  }catch{return reply({error:'Reviewed edition unavailable'},503)}
 };
}
export default {async fetch(request){
 const env=process.env;
 const origins=(env.YOS_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(s=>s==='https://yskn0008-bot.github.io');
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_ALLOWED_SUBJECT_HASH)return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});
 const {createGoogleIdentityVerifier}=await import('../../dist/auth/google-runtime.js');
 const {IdentityGate}=await import('../../dist/auth/identity-gate.js');
 const verifier=createGoogleIdentityVerifier(env.GOOGLE_CLIENT_ID);
 const gate=new IdentityGate({expectedAudience:env.GOOGLE_CLIENT_ID,allowedSubjectHash:env.GOOGLE_ALLOWED_SUBJECT_HASH,requireEmailVerified:true});
 return createJournalReader({origins,notionToken:env.YOS_NOTION_API_TOKEN,authorize:async token=>{await gate.authorize(await verifier.verify(token));return true}})(request);
}};
