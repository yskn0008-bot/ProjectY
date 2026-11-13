import test from 'node:test';import assert from 'node:assert/strict';
import {shortcutURL} from '../shortcut-bridge.mjs';
test('encodes only validated commands for a single existing router',()=>{
 const url=shortcutURL('YOS Remote Router',{device:'floor',action:'brightness',value:20});
 assert.ok(url.startsWith('shortcuts://run-shortcut?'));
 const query=new URL(url).searchParams;
 assert.equal(query.get('name'),'YOS Remote Router');
 assert.deepEqual(JSON.parse(query.get('text')),{version:1,device:'floor',action:'brightness',value:20});
});
test('rejects unsafe or unsupported actions',()=>{
 assert.throws(()=>shortcutURL('',{device:'floor',action:'on'}));
 assert.throws(()=>shortcutURL('Router',{device:'tv',action:'shell'}));
 assert.throws(()=>shortcutURL('Router',{device:'floor',action:'brightness',value:1000}));
});
