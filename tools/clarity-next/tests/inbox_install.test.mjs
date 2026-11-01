import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const installer=fs.readFileSync(new URL('../YOS_Inbox_Install.js',import.meta.url),'utf8');
const candidate=fs.readFileSync(new URL('../YOS_Inbox_Classifier.js',import.meta.url),'utf8');
async function install(download,path='/scriptable/YOS Inbox Sort.js'){
 let file=installer,alertTitle='',writes=0;
 class Request{async loadString(){return download;}}
 class Alert{addAction(){} async present(){alertTitle=this.title;}}
 const fm={documentsDirectory:()=>'/scriptable',readString:()=>file,writeString:(_,s)=>{writes++;file=s;}};
 const ctx={Request,Alert,FileManager:{iCloud:()=>({documentsDirectory:()=>'/icloud'}),local:()=>fm},module:{filename:path},Script:{complete(){}},Math,Error,String};
 await vm.runInNewContext('(async()=>{'+installer+'})()',ctx);
 return {file,alertTitle,writes};
}
test('one paste installs exactly the pinned source to its own Scriptable file',async()=>{
 const r=await install(candidate);assert.equal(r.file,candidate);assert.equal(r.writes,1);assert.equal(r.alertTitle,'YOS Inbox｜準備完了');
});
test('changed download and unknown device path never write',async()=>{
 const changed=await install(candidate+' ');assert.equal(changed.writes,0);assert.equal(changed.alertTitle,'導入できませんでした');
 const path=await install(candidate,'/other/unsafe.js');assert.equal(path.writes,0);
});
test('installer accepts pasted code even when its leading comment was omitted',async()=>{
 const withoutComment=installer.split('\n').slice(2).join('\n');
 let file=withoutComment,writes=0,alertTitle='';
 class Request{async loadString(){return candidate;}}
 class Alert{addAction(){} async present(){alertTitle=this.title;}}
 const fm={documentsDirectory:()=>'/scriptable',readString:()=>file,writeString:(_,s)=>{writes++;file=s;}};
 await vm.runInNewContext('(async()=>{'+withoutComment+'})()',{Request,Alert,FileManager:{iCloud:()=>({documentsDirectory:()=>'/icloud'}),local:()=>fm},module:{filename:'/scriptable/Untitled Script 22.js'},Script:{complete(){}},Math,Error,String});
 assert.equal(writes,1);assert.equal(file,candidate);assert.equal(alertTitle,'YOS Inbox｜準備完了');
});
