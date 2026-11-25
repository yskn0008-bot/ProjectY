/**
 * Prepublication, read-only bridge:
 *   one independently reviewed public evidence dossier -> one public-safe
 *   YOS JOURNAL article candidate -> existing ProjectY issue writer dry run.
 *
 * Nothing here reads Notion, publishes to main, writes files, changes any
 * calendar/automation or schedules notifications. No new DB or API token.
 */
import { readFile } from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCandidate, prepareFiles} from './gpt-editorial-gate.mjs';
import {validateIndependentDossier} from './reviewed-evidence-gate.mjs';

function stop(message){throw new Error('YOS JOURNAL reviewed preview refused: '+message);}
function sourceURLs(dossier){
 return new Set(dossier.sources.map(s=>new URL(s.url).href));
}
export async function previewReviewedCandidate(candidate,dossier,root,{
  now=new Date()
}={}){
  const review=validateIndependentDossier(dossier);
  validateCandidate(candidate,{now});
  const allowed=sourceURLs(dossier);
  for(const [index,a] of candidate.issue.articles.entries()){
    const url=new URL(a.link).href;
    if(!allowed.has(url))stop('article source missing from independent review: '+(index+1));
    const verification=candidate.verification[index];
    if(verification.checkedOn!==dossier.reviewedOn)
      stop('independent source review date mismatch');
    const boundSource = dossier.sources.find(s=>new URL(s.url).href===url);
    if (!Array.isArray(verification.reviewClaimIds) || !verification.reviewClaimIds.length)
      stop('article missing independent reviewed claim IDs');
    const validClaims = new Map(dossier.claims.map(c=>[c.id,c]));
    for (const id of verification.reviewClaimIds) {
      const claim=validClaims.get(id);
      if (!claim || claim.sourceId !== boundSource.id || claim.status !== 'supported_in_study')
        stop('unsupported, unreviewed or mismatched claim in article: '+id);
    }
    // Review does not establish that all prose is correct: do not convert
    // the existence of matching source URLs into approval.
  }
  const prepared=await prepareFiles(candidate,root,{now});
  return {
    stage:'editorial_preview_only',
    publicationAllowed:false,
    independentReviewStatus:review.disposition,
    sourceReviewedClaims:review.claims.supported,
    notSupportedClaims:review.claims.unsupported,
    articles:prepared.issue.articles.map(a=>({title:a.title,source:a.link})),
    plannedIssuePaths:prepared.paths.map(p=>p.slice(resolve(root).length+1)),
    issueBytes:Buffer.byteLength(prepared.serialized),
    nextRequired:'Article-level semantic and privacy/copyright review, explicit editorial authorization, then existing reviewed PR and deployment verification.'
  };
}
async function main(args){
  if(args.length!==6||args[0]!=='--candidate'||args[2]!=='--dossier'||args[4]!=='--root')
    stop('Usage: node journal/preview-reviewed-candidate.mjs --candidate PATH --dossier PATH --root REPO');
  const candidate=JSON.parse(await readFile(resolve(args[1]),'utf8'));
  const dossier=JSON.parse(await readFile(resolve(args[3]),'utf8'));
  const result=await previewReviewedCandidate(candidate,dossier,resolve(args[5]));
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
}
