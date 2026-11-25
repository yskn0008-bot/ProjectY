import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('UNIFIED diagnostic has no execution and rejects unsafe selections',async()=>{
 const source=await readFile(new URL('../scriptable/YOS 操作 診断 TEST.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/https?:\/\/|new Request|Keychain|FileManager|Safari\.open|fetch\s*\(/);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const execute=new AsyncFunction('args','Alert','UITable','UITableRow','WebView','Script',source);
 const names=['YOS CORE','TEST 予定','TEST 編集','TEST 重複','TEST 重複','操作'];
 async function run(mode,name,action,selection){
  let result,completed=0,rows=[];
  class Row{constructor(){this.buttons=[]}addText(n,s){this.name=n;this.sub=s;return {}}addButton(n){const b={name:n};this.buttons.push(b);return b}}
  class Table{addRow(r){rows.push(r)}async present(){const r=rows.find(x=>x.name===name);if(action==='edit')r?.buttons[0]?.onTap?.();else r?.onSelect?.()}}
  class Web{async loadHTML(h){assert.ok(h.includes("default-src 'none'"))}async present(){}async evaluateJavaScript(){return selection}}
  await execute({shortcutParameter:{names,pins:['TEST 予定'],mode}},class{},Table,Row,Web,{setShortcutOutput:s=>result=JSON.parse(s),complete:()=>completed++});
  assert.equal(completed,1);assert.equal(result.executed,false);return {result,rows};
 }
 let r=await run('native','TEST 予定','run');assert.equal(r.result.name,'TEST 予定');assert.equal(r.result.action,'run');assert.equal(r.rows.find(x=>x.name==='TEST 予定').buttons[0].dismissOnTap,true);
 r=await run('native','TEST 編集','edit');assert.equal(r.result.action,'edit');
 r=await run('native','TEST 重複','run');assert.equal(r.result.status,'cancel');assert.ok(r.rows.filter(x=>x.name==='TEST 重複').every(x=>!x.buttons.length&&!x.onSelect));
 r=await run('native','操作','run');assert.equal(r.result.status,'cancel');
 r=await run('web','','',{id:'2',action:'edit'});assert.equal(r.result.name,'TEST 編集');assert.equal(r.result.timing.tapToReturnMs,null);
 r=await run('web','','',{id:'999',action:'run'});assert.equal(r.result.status,'blocked');
 r=await run('web','','',{id:'0',action:'delete'});assert.equal(r.result.status,'cancel');
});
