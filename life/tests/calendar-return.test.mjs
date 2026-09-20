import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const fn=html.slice(html.indexOf('function importFromUrl(){'),html.indexOf('function taxiUrl(){'));
test('only requested MY WAY return follows successful save',()=>{
 for(const [after,fail,expected] of [['myway',false,['save','clean','../yos/']],['myway',true,['save','error']],['',false,['save','clean']],['https://other.invalid',false,['save','clean']]]){
 const calls=[];
 vm.runInNewContext(fn+';importFromUrl()',{URLSearchParams,location:{search:'?sync=payload&after='+encodeURIComponent(after),pathname:'/life/',replace:x=>calls.push(x)},decodeBase64Url:()=> '{}',importPayload:()=>{calls.push('save');if(fail)throw Error('storage failed')},history:{replaceState:()=>calls.push('clean')},alert:()=>calls.push('error')});
 assert.deepEqual(calls,expected);
 }
});
