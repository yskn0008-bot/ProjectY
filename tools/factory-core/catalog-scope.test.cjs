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
