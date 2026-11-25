'use strict';
// Reused YOS wait-reduction candidate: target-only catalog reconciliation.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function catalogReconcile(current,base,candidate,id){
 const groups=["targets","additional_targets"],flat=o=>groups.flatMap(k=>o[k]||[]);
 for(const o of [current,base,candidate]){if(!o||o.schema!==1||!groups.every(k=>Array.isArray(o[k]))||new Set(flat(o).map(x=>x.id)).size!==flat(o).length)throw Error("invalid catalog");}
 const old=flat(base).find(x=>x.id===id),next=flat(candidate).find(x=>x.id===id),live=flat(current).find(x=>x.id===id);
 if(!old||!next||!live||!same(live,old))throw Error("target changed or missing");
 const meta=x=>{const {commit,sha256,...r}=x;return r};
 if(!same(meta(old),meta(next))||! /^[a-f0-9]{40}$/.test(next.commit)||! /^[a-f0-9]{64}$/.test(next.sha256))throw Error("invalid target revision");
 if(!same({...base,targets:[],additional_targets:[]},{...candidate,targets:[],additional_targets:[]}))throw Error("catalog metadata changed");
 if(groups.some(k=>!same(base[k].filter(x=>x.id!==id),candidate[k].filter(x=>x.id!==id))||!same(base[k].map(x=>x.id),candidate[k].map(x=>x.id))))throw Error("candidate changes other targets");
 return {...current,...Object.fromEntries(groups.map(k=>[k,current[k].map(x=>x.id===id?{...x,commit:next.commit,sha256:next.sha256}:x)]))};
}
function nativeScope(files,before,after,complete=true){
 if(!complete||!Array.isArray(files)||!files.length)return "full";
 const allow=["ios-app/scriptable/YOS AION OUTPUT.js","ios-app/tests/aion-output.test.mjs","ios-app/scriptable/yos-common-installer-catalog.json"];
 if(files.some(x=>!allow.includes(x))||!files.includes(allow[0]))return "full";
 if(files.includes(allow[2])){try{if(!same(catalogReconcile(before,before,after,"aion-output"),after))return "full";}catch(_){return "full";}}
 else if(!same(before,after))return "full";
 return "scriptable-only-candidate";
}

const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const catalogPath='ios-app/scriptable/yos-common-installer-catalog.json';
const sha=/^[a-f0-9]{40}$/;
const git=(repo,...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024});
function catalogAt(repo,commit){
 if(!sha.test(commit))throw Error('fixed commit required');
 return JSON.parse(git(repo,'show',commit+':'+catalogPath));
}
// Shadow classification only: no CI skip authority. Full on unknown, missing,
// non-modification, merge-base drift, or incomplete inputs.
function classifyGitDiff(repo,base,head){
 try{
  if(!sha.test(base)||!sha.test(head))return 'full';
  const mb=git(repo,'merge-base',base,head).trim();
  if(!sha.test(mb)||mb!==base)return 'full';
  const fields=git(repo,'diff','--name-status','-z','--no-renames',base,head,'--').split('\0');
  if(fields.pop()!==''||fields.length%2!==0)return 'full';
  const files=[];
  for(let i=0;i<fields.length;i+=2){if(fields[i]!=='M')return 'full';files.push(fields[i+1]);}
  return nativeScope(files,catalogAt(repo,base),catalogAt(repo,head),true);
 }catch(_){return 'full';}
}
// Read-only release plan. The integration owner must perform the existing
// expected-head compare-and-swap on the integration branch immediately before
// publishing, and serialize the final shared-catalog operation.
function planCatalogUpdate(repo,expectedHead,base,candidateHead,id){
 if(!sha.test(expectedHead)||!sha.test(base)||!sha.test(candidateHead))throw Error('fixed revision required');
 const actual=git(repo,'rev-parse','HEAD').trim();
 if(actual!==expectedHead)throw Error('HEAD changed');
 const current=catalogAt(repo,expectedHead),old=catalogAt(repo,base),proposed=catalogAt(repo,candidateHead);
 const catalog=catalogReconcile(current,old,proposed,id);
 const target=[...catalog.targets,...catalog.additional_targets].find(x=>x.id===id);
 if(typeof target.path!=='string'||!target.path.startsWith('ios-app/scriptable/')||target.path.includes('..'))throw Error('invalid script path');
 const bytes=execFileSync('git',['show',target.commit+':'+target.path],{cwd:repo,maxBuffer:16*1024*1024});
 if(createHash('sha256').update(bytes).digest('hex')!==target.sha256)throw Error('pinned source digest mismatch');
 if(git(repo,'rev-parse','HEAD').trim()!==expectedHead)throw Error('HEAD changed during plan');
 return {expectedHead,base,candidateHead,targetId:id,catalog,requiresCompareAndSwap:true};
}

// Build one catalog-only commit against the exact reviewed integration HEAD.
// An isolated index prevents any staged/working-tree changes. The source must
// already be present at that HEAD; a catalog update never imports source code.
function prepareCatalogCommit(repo,expectedHead,base,candidateHead,id){
 const plan=planCatalogUpdate(repo,expectedHead,base,candidateHead,id);
 const target=[...plan.catalog.targets,...plan.catalog.additional_targets].find(x=>x.id===id);
 const bytes=execFileSync('git',['show',expectedHead+':'+target.path],{cwd:repo,maxBuffer:16*1024*1024});
 if(createHash('sha256').update(bytes).digest('hex')!==target.sha256)throw Error('integration source differs from reviewed pin');
 // The pin must be durable on the remote, not an unpushed local Git object.
 try{git(repo,'merge-base','--is-ancestor',target.commit,expectedHead);}catch(_){throw Error('reviewed pin must be reachable from integration HEAD');}
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yos-catalog-index-'));
 try{
  const env={...process.env,GIT_INDEX_FILE:path.join(dir,'index')};
  const run=(args,input)=>execFileSync('git',args,{cwd:repo,env,input,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
  const mode=git(repo,'ls-tree',expectedHead,'--',catalogPath).split(' ')[0];
  if(mode!=='100644')throw Error('unexpected catalog file mode');
  run(['read-tree',expectedHead]);
  const blob=run(['hash-object','-w','--stdin'],JSON.stringify(plan.catalog,null,2)+'\n');
  run(['update-index','--cacheinfo',mode,blob,catalogPath]);
  const tree=run(['write-tree']);
  if(git(repo,'rev-parse','HEAD').trim()!==expectedHead)throw Error('HEAD changed before commit');
  const commit=run(['commit-tree',tree,'-p',expectedHead,'-m','Reconcile reviewed installer target: '+id]);
  if(git(repo,'diff','--name-only',expectedHead,commit,'--').trim()!==catalogPath)throw Error('not a catalog-only change');
  return {expectedHead,commit,targetId:id};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
// The remote ref is the serialization point. Never write main or create refs.
// A competing publisher must reread the remote head and replan, not force
// overwrite. The commit must be the exact single-parent child of the lease.
function publishCatalogCommit(repo,branch,expectedHead,base,candidateHead,id){
 if(typeof branch!=='string'||!branch.includes('/')||/^(main|master|HEAD)(\/|$)/i.test(branch))throw Error('dedicated integration branch required');
 const ref='refs/heads/'+branch;
 git(repo,'check-ref-format',ref);
 const remote=git(repo,'ls-remote','--refs','origin',ref).trim();
 if(remote!==expectedHead+'\t'+ref)throw Error('remote integration HEAD changed or missing');
 const result=prepareCatalogCommit(repo,expectedHead,base,candidateHead,id);
 // Exact lease is required even if a concurrent writer rewinds the ref.
 // prepareCatalogCommit creates a direct child, so no intentional history rewrite.
 if(git(repo,'rev-list','--parents','-n','1',result.commit).trim()!==result.commit+' '+expectedHead)throw Error('unexpected commit parent');
 git(repo,'push','--no-follow-tags','--recurse-submodules=no','--force-with-lease='+ref+':'+expectedHead,'origin',result.commit+':'+ref);
 if(git(repo,'ls-remote','--refs','origin',ref).trim()!==result.commit+'\t'+ref)throw Error('published ref changed; inspect before retry');
 return result;
}

if(require.main===module){
 const [mode,...args]=process.argv.slice(2);
 if(mode==='scope') console.log(classifyGitDiff('.',args[0]||'',args[1]||''));
 else if(mode==='reconcile') {
  try{console.log(JSON.stringify(planCatalogUpdate('.',...args),null,2));}
  catch(e){console.error(String(e.message));process.exitCode=1;}
 }else if(mode==='publish'){
  try{console.log(JSON.stringify(publishCatalogCommit('.',...args),null,2));}
  catch(e){console.error(String(e.message));process.exitCode=1;}
 }else {console.error('usage: catalog-scope.cjs scope BASE HEAD | reconcile EXPECTED_HEAD BASE CANDIDATE_HEAD ID | publish BRANCH EXPECTED_HEAD BASE CANDIDATE_HEAD ID');process.exitCode=2;}
}
module.exports={catalogReconcile,nativeScope,classifyGitDiff,planCatalogUpdate,prepareCatalogCommit,publishCatalogCommit};
