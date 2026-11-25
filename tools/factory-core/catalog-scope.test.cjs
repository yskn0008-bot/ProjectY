'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {catalogReconcile,nativeScope,classifyGitDiff,planCatalogUpdate}=require('./catalog-scope.cjs');
const original=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../ios-app/scriptable/yos-common-installer-catalog.json'),'utf8'));
const cp=x=>JSON.parse(JSON.stringify(x));
const list=x=>[...x.targets,...x.additional_targets];
const find=(x,id)=>list(x).find(t=>t.id===id);
const id='aion-output';
const source='ios-app/scriptable/YOS AION OUTPUT.js';
const testFile='ios-app/tests/aion-output.test.mjs';
const cat='ios-app/scriptable/yos-common-installer-catalog.json';
const next=cp(original),other=cp(original);
const old=find(original,id),oldOther=list(other).find(t=>t.id!==id);
Object.assign(find(next,id),{commit:'a'.repeat(40),sha256:'b'.repeat(64)});
oldOther.commit='c'.repeat(40);oldOther.sha256='d'.repeat(64);
test('real catalog: preserve all unrelated entries and original order',()=>{
 const r=catalogReconcile(other,original,next,id);
 assert.deepEqual(list(r).map(x=>x.id),list(other).map(x=>x.id));
 assert.deepEqual(list(r).filter(x=>x.id!==id),list(other).filter(x=>x.id!==id));
 assert.deepEqual(find(r,id),find(next,id));
 assert.notDeepEqual(find(other,id),find(next,id));
 assert.deepEqual(find(original,id),old);
});
test('same-target drift, unrelated candidate edits, invalid pin, duplicate and reordered entries rejected',()=>{
 assert.throws(()=>catalogReconcile(next,original,next,id));
 const mixed=cp(next);list(mixed).find(t=>t.id!==id).commit='e'.repeat(40);
 assert.throws(()=>catalogReconcile(other,original,mixed,id));
 const bad=cp(next);find(bad,id).sha256='invalid';assert.throws(()=>catalogReconcile(other,original,bad,id));
 const dup=cp(next);dup.additional_targets.push(cp(dup.targets[0]));assert.throws(()=>catalogReconcile(other,original,dup,id));
 const order=cp(next);order.targets.reverse();assert.throws(()=>catalogReconcile(other,original,order,id));
});
test('native shadow is narrow and fails closed for unknown, incomplete and shared changes',()=>{
 assert.equal(nativeScope([source,testFile,cat],original,next),'scriptable-only-candidate');
 assert.equal(nativeScope([source],original,original),'scriptable-only-candidate');
 for(const paths of [[],[testFile],[cat],[source,'yos/daystream/index.html'],[source,'ios-app/scriptable/YOS Common Installer.js'],[source,'ios-app/plugins/x.swift'],[source,'unknown']])
  assert.equal(nativeScope(paths,original,next),'full');
 assert.equal(nativeScope([source,testFile,cat],original,next,false),'full');
 assert.equal(nativeScope([source],original,next),'full');
 assert.equal(classifyGitDiff('.','invalid','invalid'),'full');
 assert.throws(()=>planCatalogUpdate('.','invalid','invalid','invalid',id));
});

test('real Git remote: two competing publishers, stale lease rejected, replan retains both pins',()=>{
 const os=require('node:os'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
 const {prepareCatalogCommit,publishCatalogCommit}=require('./catalog-scope.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yos-catalog-race-'));
 const work=path.join(root,'work'),remote=path.join(root,'remote.git');
 const run=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const g=(...args)=>run(work,...args);
 const sha=()=>g('rev-parse','HEAD');
 const put=(p,s)=>{const pth=path.join(work,p);fs.mkdirSync(path.dirname(pth),{recursive:true});fs.writeFileSync(pth,s);};
 const digest=s=>createHash('sha256').update(s).digest('hex');
 const commit=m=>{g('add','.');g('commit','-m',m);return sha();};
 try{
  fs.mkdirSync(work);run(root,'init','--bare',remote);g('init');g('config','user.name','Test');g('config','user.email','test@example.invalid');
  const pa='ios-app/scriptable/A.js',pb='ios-app/scriptable/B.js';
  put(pa,'old A');put(pb,'old B');const oldSource=commit('old source');
  const original={schema:1,targets:[{id:'a',path:pa,commit:oldSource,sha256:digest('old A')},{id:'b',path:pb,commit:oldSource,sha256:digest('old B')}],additional_targets:[]};
  put(cat,JSON.stringify(original));const base=commit('base catalog');
  put(pa,'new A');put(pb,'new B');const integrated=commit('reviewed sources');
  const candidateA=cp(original);Object.assign(candidateA.targets[0],{commit:integrated,sha256:digest('new A')});
  const candidateB=cp(original);Object.assign(candidateB.targets[1],{commit:integrated,sha256:digest('new B')});
  g('checkout','-b','candidate/a');put(cat,JSON.stringify(candidateA));const a=commit('reviewed A pin');
  g('checkout','--detach',integrated);g('checkout','-b','candidate/b');put(cat,JSON.stringify(candidateB));const b=commit('reviewed B pin');
  g('checkout','--detach',integrated);
  g('checkout','-b','candidate/local-pin');put('local-only.txt','not on remote');const localOnly=commit('local object');
  const unreachable=cp(candidateA);unreachable.targets[0].commit=localOnly;put(cat,JSON.stringify(unreachable));const localCandidate=commit('unreachable pin');
  g('checkout','--detach',integrated);g('remote','add','origin',remote);
  assert.throws(()=>prepareCatalogCommit(work,integrated,base,localCandidate,'a'),/reviewed pin must be reachable/);
  g('push','origin',integrated+':refs/heads/integration/release');
  const before=g('status','--porcelain');
  const staged=prepareCatalogCommit(work,integrated,base,a,'a');
  assert.equal(g('diff','--name-only',integrated,staged.commit),cat);
  assert.equal(g('status','--porcelain'),before);
  const stale=prepareCatalogCommit(work,integrated,base,b,'b');
  const first=publishCatalogCommit(work,'integration/release',integrated,base,a,'a');
  assert.equal(sha(),integrated);
  assert.throws(()=>g('push','--force-with-lease=refs/heads/integration/release:'+integrated,'origin',stale.commit+':refs/heads/integration/release'));
  assert.throws(()=>publishCatalogCommit(work,'integration/release',integrated,base,b,'b'),/remote integration HEAD changed/);
  assert.throws(()=>publishCatalogCommit(work,'main',integrated,base,b,'b'),/dedicated integration branch/);
  g('checkout','--detach',first.commit);
  const second=publishCatalogCommit(work,'integration/release',first.commit,base,b,'b');
  const final=JSON.parse(g('show',second.commit+':'+cat));
  assert.deepEqual(final.targets,[candidateA.targets[0],candidateB.targets[1]]);
  assert.equal(g('diff','--name-only',first.commit,second.commit),cat);
  assert.throws(()=>prepareCatalogCommit(work,first.commit,base,a,'a'),/target changed/);
  assert.equal(run(remote,'rev-parse','refs/heads/integration/release'),second.commit);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('actual workflow scope shell: exact AION candidate only; all unknown inputs use full builds',()=>{
 const os=require('node:os'),{execFileSync}=require('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yos-native-scope-'));
 const repoRoot=path.resolve(__dirname,'../..');
 const workflows=['yos-bravia-safety.yml','yos-capture-safety.yml'].map(n=>fs.readFileSync(path.join(repoRoot,'.github/workflows',n),'utf8'));
 const primary=fs.readFileSync(path.join(repoRoot,'.github/workflows/yos-ios-app-safety.yml'),'utf8');
 const extract=y=>y.split('      - name: Classify reviewed base and exact candidate tree\n')[1].split('        run: |\n')[1].split('\n\n  ')[0].split('\n').map(l=>l.slice(10)).join('\n');
 const shell=extract(workflows[0]);assert.equal(shell,extract(workflows[1]));
 for(const y of workflows){
  assert.match(y,/needs\.native-scope\.result == 'success' && needs\.native-scope\.outputs\.mode == 'scriptable-only-candidate'/);
  assert.match(y,/test "\$SCOPE_RESULT" = success/);assert.match(y,/test "\$SCOPE_MODE" = scriptable-only-candidate/);
  assert.match(y,/NOT_RUN/);assert.match(y,/npm test/);assert.match(y,/xcodebuild/);
 }
 for(const s of ['runs-on: macos-latest','NSLocalNetworkUsageDescription','NSAllowsLocalNetworking','NSCalendarsFullAccessUsageDescription','NSRemindersFullAccessUsageDescription','com.apple.security.application-groups','CODE_SIGN_ENTITLEMENTS','Build without signing'])assert.ok(primary.includes(s),s);
 const g=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const put=(p,s)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
 const commit=m=>{g('add','.');g('commit','-m',m);return g('rev-parse','HEAD');};
 const classify=(eligible,base,head)=>{
  const output=path.join(root,'../'+path.basename(root)+'-output'),summary=output+'-summary';
  try{
   fs.writeFileSync(output,'');fs.writeFileSync(summary,'');
   execFileSync('bash',['-euo','pipefail','-c',shell],{cwd:root,env:{...process.env,ELIGIBLE:eligible,BASE_SHA:base,HEAD_SHA:head,RUNNER_TEMP:os.tmpdir(),GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary},stdio:['ignore','pipe','pipe']});
   return fs.readFileSync(output,'utf8').trim();
  }finally{fs.rmSync(output,{force:true});fs.rmSync(summary,{force:true});}
 };
 try{
  g('init');g('config','user.name','Test');g('config','user.email','test@example.invalid');
  put(source,'old');put(testFile,'old test');put(cat,JSON.stringify(original));
  put('tools/factory-core/catalog-scope.cjs',fs.readFileSync(path.join(__dirname,'catalog-scope.cjs'),'utf8'));
  const base=commit('trusted base');
  put(source,'new');put(testFile,'new test');put(cat,JSON.stringify(next));const narrow=commit('narrow');
  assert.equal(classify('true',base,narrow),'mode=scriptable-only-candidate');
  assert.equal(classify('false',base,narrow),'mode=full');
  assert.equal(classify('true','invalid',narrow),'mode=full');
  put('ios-app/shell/capture.js','changed');const broad=commit('broader');
  assert.equal(classify('true',base,broad),'mode=full');
  assert.equal(classify('true',base,narrow),'mode=full'); // checked-out tree differs
  g('checkout','--detach',narrow);
  put('tools/factory-core/catalog-scope.cjs','console.log("scriptable-only-candidate")');const tampered=commit('candidate classifier tampering');
  assert.equal(classify('true',base,tampered),'mode=full');
  g('checkout','--detach',base);put(source,'parallel');const diverged=commit('diverged');
  g('checkout','--detach',narrow);
  assert.equal(classify('true',diverged,narrow),'mode=full');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
