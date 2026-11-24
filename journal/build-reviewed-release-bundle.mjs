/**
 * YOS JOURNAL: produce a reviewable, non-deployed edition bundle from the
 * existing publication contract. Never writes into the live repo or calls
 * GitHub/Notion. Bundle is explicitly NOT an authorization to publish.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {prepareFiles} from './gpt-editorial-gate.mjs';
import {previewReviewedCandidate} from './preview-reviewed-candidate.mjs';
import {validateIndependentDossier} from './reviewed-evidence-gate.mjs';

export async function buildReviewBundle(candidate,dossier,repo,output,{now=new Date()}={}){
 const root=resolve(repo),dest=resolve(output);
 if(dest===root||dest.startsWith(root+'/'))throw Error('Bundle output must be outside checkout repository');
 const reviewed=validateIndependentDossier(dossier);
 const preview=await previewReviewedCandidate(candidate,dossier,root,{now});
 if(preview.publicationAllowed!==false)throw Error('Unintended automatic publication authorization');
 const prepared=await prepareFiles(candidate,root,{now});
 const relativePaths=prepared.paths.map(x=>relative(root,x));
 if(relativePaths.some(x=>x.startsWith('..')||x.startsWith('/')||x.includes('\\')))
  throw Error('Unsafe output path');
 if(relativePaths.length!==3||new Set(relativePaths).size!==3)throw Error('Unexpected publication file contract');
 const manifest={
  status:'REVIEW_ONLY_NOT_PUBLISHED',
  editionDate:prepared.issue.issuedOn,
  candidateCount:prepared.issue.articles.length,
  privateNotionInputIncluded:false,
  originalPublisherReviewedClaims:reviewed.claims.supported,
  notSupportedClaimsRecordedInDossier:reviewed.claims.unsupported,
  fullArticleSemanticVerificationNotGuaranteed:true,
  independentReviewStatus:preview.independentReviewStatus,
  requiresExplicitEditorialApproval:true,
  requiresPublicationMerge:true,
  requiresLivePagesAndDeviceReadback:true,
  files:relativePaths
 };
 for(const p of relativePaths){
  const destFile=join(dest,p);
  await mkdir(dirname(destFile),{recursive:true});
  await writeFile(destFile,prepared.serialized,{flag:'wx'});
 }
 await writeFile(join(dest,'RELEASE_NOT_APPROVED.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return manifest;
}
async function cli(args){
 if(args.length!==8||args[0]!=='--candidate'||args[2]!=='--dossier'||args[4]!=='--repo'||args[6]!=='--output')
   throw Error('Usage: node journal/build-reviewed-release-bundle.mjs --candidate PATH --dossier PATH --repo PATH --output /tmp/DEST');
 const [candidate,dossier]=await Promise.all([
  readFile(resolve(args[1]),'utf8').then(JSON.parse),
  readFile(resolve(args[3]),'utf8').then(JSON.parse)
 ]);
 const result=await buildReviewBundle(candidate,dossier,args[5],args[7]);
 console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
 cli(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
