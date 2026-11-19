/**
 * YOS JOURNAL independent source-review dossier gate.
 * Inspects the provenance and status of manually reviewed claims.
 * Does NOT infer truth from a URL, a language model or a text similarity score.
 * Does NOT publish issues, update GitHub, contact Notion or schedule notifications.
 */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {safeSourceUrl} from './source-evidence-audit.mjs';

const PRIVATE=/(?:sk-proj-|ntn_[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]{16,}|Bearer\s+\S+|口座番号|暗証番号|マイナンバー|ようすけ|陽介|個人の残高)/i;
const VALID_CLAIMS=new Set(['supported_in_study','not_supported','unresolved']);
const VALID_ACCESS=new Set(['publisher_full_text','publisher_abstract','official_primary_document']);

function keys(x,allowed,name){
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Invalid '+name);
 for(const k of Object.keys(x))if(!allowed.includes(k))throw Error('Unexpected '+name+' field '+k);
}
function str(x,min,max,label){
 if(typeof x!=='string'||x.trim().length<min||x.length>max||/[\x00-\x1f]/.test(x))
  throw Error('Invalid '+label);
 return x.trim();
}
export function validateIndependentDossier(d){
 keys(d,['schemaVersion','publicOnly','reviewedOn','topic','reviewerMethod','sources','claims','articleAssessment'],'dossier');
 if(d.schemaVersion!==1||d.publicOnly!==true)throw Error('Not a public-only dossier');
 const raw=JSON.stringify(d);
 if(raw.length>48000||PRIVATE.test(raw))throw Error('Private evidence not accepted');
 const reviewed=str(d.reviewedOn,10,10,'review date');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(reviewed)||Number.isNaN(Date.parse(reviewed)))throw Error('Invalid review date');
 str(d.topic,25,300,'topic');str(d.reviewerMethod,50,600,'review method');
 if(!/original publisher|original source|directly opened/i.test(d.reviewerMethod))
   throw Error('Independent original-source method not described');
 if(!Array.isArray(d.sources)||d.sources.length<1||d.sources.length>8)throw Error('Invalid sources');
 if(!Array.isArray(d.claims)||d.claims.length<1||d.claims.length>50)throw Error('Invalid claims');
 const ids=new Set(), urls=new Set();
 for(const s of d.sources){
  keys(s,['id','url','title','publicationYear','originalAccess','status'],'source');
  if(!/^S[1-9]\d*$/.test(s.id)||ids.has(s.id))throw Error('Duplicate source id');
  ids.add(s.id);
  const url=safeSourceUrl(s.url);
  if(urls.has(url))throw Error('Duplicate source URL');
  urls.add(url);
  str(s.title,20,250,'source title');
  if(!Number.isInteger(s.publicationYear)||s.publicationYear<1900||s.publicationYear>Number(reviewed.slice(0,4)))throw Error('Invalid publication year');
  if(!VALID_ACCESS.has(s.originalAccess)||s.status!=='examined')throw Error('Original source examination required');
 }
 const seen=new Set(), count={supported:0,unsupported:0,unresolved:0};
 for(const c of d.claims){
  keys(c,['id','sourceId','claim','status','basis','limitations'],'claim');
  if(!/^C[1-9]\d*$/.test(c.id)||seen.has(c.id))throw Error('Invalid or duplicate claim id');
  seen.add(c.id);
  if(!ids.has(c.sourceId))throw Error('Orphan claim source');
  str(c.claim,40,500,'claim text');
  str(c.basis,35,750,'review basis');
  str(c.limitations,35,750,'limitations');
  if(!VALID_CLAIMS.has(c.status))throw Error('Unknown claim status');
  if(c.status==='supported_in_study')count.supported++;
  else if(c.status==='not_supported')count.unsupported++;
  else count.unresolved++;
 }
 keys(d.articleAssessment,['status','verifiedCoverage','publishDecision','reason','requiresNext'],'article assessment');
 str(d.articleAssessment.verifiedCoverage,40,600,'coverage');
 str(d.articleAssessment.reason,40,900,'reason');
 str(d.articleAssessment.requiresNext,40,900,'next step');
 if(!['reviewed_with_limitations','partial_review'].includes(d.articleAssessment.status))throw Error('Invalid review status');
 if(!['hold','requires_editor_approval'].includes(d.articleAssessment.publishDecision))throw Error('Invalid publish review decision');
 return {reviewedOn:reviewed,sources:d.sources.length,claims:count,
   canPublishAutomatically:false,
   disposition:d.articleAssessment.publishDecision==='hold'?'hold':'editor_approval_and_publication_gate_required'};
}

async function cli(args){
 if(args.length!==2||args[0]!=='--dossier')throw Error('Usage: node journal/reviewed-evidence-gate.mjs --dossier /path/to/review.json');
 const d=JSON.parse(await readFile(args[1],'utf8'));
 const result=validateIndependentDossier(d);
 console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 cli(process.argv.slice(2)).catch(e=>{console.error('Source review dossier rejected: '+e.message);process.exitCode=1;});
}
