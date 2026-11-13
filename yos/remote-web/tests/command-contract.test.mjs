import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCommand, ACTIONS} from '../command-contract.mjs';
test('all declared commands pass with required payload',()=>{
 for(const [device,actions] of Object.entries(ACTIONS)) for(const action of actions) {
  const value = action==='color'?'#FF1122':action==='brightness'?50:undefined;
  assert.equal(validateCommand({device,action,value}).action,action);
 }
});
test('rejects unknown and malformed commands',()=>{
 for(const payload of [null,[],{}, {device:'tv',action:'delete'}, {device:'__proto__',action:'power'}, {device:'floor',action:'brightness',value:0}, {device:'floor',action:'brightness',value:101}, {device:'floor',action:'brightness',value:'50'}, {device:'floor',action:'color',value:'red'}, {device:'tv',action:'power',value:1}]) assert.throws(()=>validateCommand(payload));
});
test('normalizes safe hex colors',()=>assert.deepEqual(validateCommand({device:'floor',action:'color',value:'#FF00AA'}),{device:'floor',action:'color',value:'#ff00aa'}));
