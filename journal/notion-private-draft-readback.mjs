/**
 * YOS JOURNAL private draft readback. No publisher, model, or GitHub writes.
 * Reconstructs the exact existing iPhone Scriptable J.receipts format, checks
 * two FNV digests, preserves all source content in memory only.
 * The Notion document is untrusted: its text must never be executed as a prompt,
 * logged, put in an issue/PR, or treated as publication authorization.
 */
import {pathToFileURL} from 'node:url';

export const INBOX_ID='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
export const API_VERSION='2025-09-03';
const MARKER=/^\[YOS_JOURNAL_DRAFT_V1:([0-9a-f]{16}):(\d{3,5})\]$/;
const HEADER='JOURNAL下書き・未検証・公開禁止';
const LIMIT=12000;
function fail(message){throw Error('JOURNAL_PRIVATE_INBOX_'+message);}
export function digest(s){
 let a=2166136261,b=2246822519;
 for(let i=0;i<s.length;i++){
  const c=s.charCodeAt(i);
  a=Math.imul(a^c,16777619)>>>0;
  b=Math.imul(b^c,3266489917)>>>0;
 }
 return [a,b].map(x=>x.toString(16).padStart(8,'0')).join('');
}
export function blockText(block){
 if(!block||block.type!=='paragraph')return null;
 const fragments=block.paragraph?.rich_text;
 if(!Array.isArray(fragments))return null;
 return fragments.map(p=>p?.plain_text??p?.text?.content??'').join('');
}
export function inspectDrafts(blocks){
 if(!Array.isArray(blocks)||blocks.length>3000)fail('BLOCK_LIST_INVALID');
 let state=null;
 const drafts=[];
 for(const block of blocks){
  const str=blockText(block);
  if(str===null){if(state)fail('NON_PARAGRAPH_INSIDE_DRAFT');continue;}
  const found=MARKER.exec(str.trim());
  if(found){
   if(state)fail('INCOMPLETE_PRIOR_DRAFT');
   const chars=Number(found[2]);
   if(!Number.isSafeInteger(chars)||chars<150||chars>LIMIT)fail('UNSAFE_LENGTH');
   state={receipt:str.trim(),hash:found[1],chars,phase:'header',body:''};
   continue;
  }
  if(!state)continue;
  if(state.phase==='header'){
    if(str!==HEADER)fail('MISSING_PRIVATE_DRAFT_HEADER');
    state.phase='parts';continue;
  }
  state.body+=str;
  if(state.body.length>state.chars)fail('DRAFT_LENGTH_OVERFLOW');
  if(state.body.length===state.chars){
    if(digest(state.body)!==state.hash)fail('RECEIPT_DIGEST_MISMATCH');
    if(!state.body.slice(0,260).includes('YOS_EDITORIAL_DRAFT_V1')||
        !state.body.includes('【資料と照合状況】')||
        !state.body.includes('公開不可・要審査'))fail('UNSAFE_DRAFT_CONTRACT');
    drafts.push({receipt:state.receipt,chars:state.chars,content:state.body,
      state:'private_unverified_never_publish'});
    state=null;
  }
 }
 if(state)fail('INCOMPLETE_LAST_DRAFT');
 return drafts;
}
export async function readPrivateInbox({token,fetcher=fetch,maxPages=30}={}){
 if(typeof token!=='string'||token.length<10)fail('TOKEN_NOT_CONFIGURED');
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>30)fail('INVALID_PAGE_LIMIT');
 const blocks=[];let cursor=null,finished=false;
 for(let i=0;i<maxPages;i++){
  const url=new URL('https://api.notion.com/v1/blocks/'+INBOX_ID+'/children');
  url.searchParams.set('page_size','100');
  if(cursor)url.searchParams.set('start_cursor',cursor);
  const response=await fetcher(url.href,{method:'GET',
    headers:{Authorization:'Bearer '+token,'Notion-Version':API_VERSION},
    signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!response.ok)fail('NOTION_HTTP_'+response.status);
  const body=await response.json();
  if(!body||!Array.isArray(body.results)||typeof body.has_more!=='boolean')fail('NOTION_REPLY_INVALID');
  blocks.push(...body.results);
  if(blocks.length>3000)fail('BLOCK_LIMIT');
  if(!body.has_more){finished=true;break;}
  if(typeof body.next_cursor!=='string'||!body.next_cursor||body.next_cursor===cursor)fail('CURSOR_INVALID');
  cursor=body.next_cursor;
 }
 if(!finished)fail('INBOX_PAGINATION_INCOMPLETE');
 return inspectDrafts(blocks);
}
async function cli(){
 if(process.argv.includes('--dry-run-private-readback')){
  const drafts=await readPrivateInbox({token:process.env.YOS_NOTION_API_TOKEN});
  // Print no private body, title, URLs, or unfiltered source text.
  console.log(JSON.stringify({status:'readback_only_no_publication',
    verifiedReceipts:drafts.length,
    latest:drafts.length?{receipt:drafts.at(-1).receipt,length:drafts.at(-1).chars}:null,
    publicationAllowed:false}));
 }else fail('USE_DRY_RUN_PRIVATE_READBACK_ONLY');
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)
 cli().catch(e=>{console.error(e.message);process.exitCode=1;});
