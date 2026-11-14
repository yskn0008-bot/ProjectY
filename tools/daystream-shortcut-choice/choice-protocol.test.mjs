import test from 'node:test';import assert from 'node:assert/strict';import {acceptChoice} from './choice-protocol.mjs';
const nonce='YOS_PICK_V1:12345678-1234-1234';
const packet=(name,token=nonce)=>token+'\n'+Buffer.from(name).toString('base64');
test('Japanese selection matches the initiating request and can be consumed once',()=>{
 const p={nonce,createdAt:100};assert.deepEqual(acceptChoice(p,packet('朝の準備'),200),{name:'朝の準備',identity:'name-only'});assert.throws(()=>acceptChoice(p,packet('朝の準備'),201));
});
test('old, future, unrelated and malformed clipboard results never consume the pending selection',()=>{
 for(const [text,now] of [[packet('別の選択','YOS_PICK_V1:unrelated123456789'),200],[packet('朝'),700001],[packet('朝'),99],['普通のコピー',200],[nonce+'\n!!!!',200],[packet('危険\n名前'),200],[packet('x'.repeat(101)),200]]){const p={nonce,createdAt:100};assert.throws(()=>acceptChoice(p,text,now));assert.equal(p.consumed,undefined)}
});
test('HTML-like names remain plain strings and are never evaluated',()=>{const p={nonce,createdAt:100};assert.equal(acceptChoice(p,packet('<script>alert(1)</script>'),200).name,'<script>alert(1)</script>')});

test('native base64 line wrapping preserves long Japanese names',()=>{const p={nonce,createdAt:100},name='朝'.repeat(100),encoded=Buffer.from(name).toString('base64').match(/.{1,64}/g).join('\r\n');assert.equal(acceptChoice(p,nonce+'\r\n'+encoded,200).name,name)});
