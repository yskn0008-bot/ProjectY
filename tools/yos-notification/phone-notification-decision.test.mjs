import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { decidePhoneNotification: decide } = require('./Phone-Notification-Decision-v0.1.js');
const base = {kind:'missed_call',voicemail:{present:false},isSavedContact:false};
test('identified unknown caller',()=>assert.equal(decide({...base,lookup:{exactNumberMatch:true,name:'Example Shop',sourceType:'official'}}).notify,true));
test('unknown caller no search hit',()=>assert.equal(decide({...base,lookup:{status:'not_found'}}).notify,false));
test('unknown caller with voicemail',()=>assert.equal(decide({...base,voicemail:{present:true,transcript:'折り返してください'}}).reason,'voicemail'));
test('saved contact no voicemail',()=>assert.equal(decide({...base,isSavedContact:true}).notify,false));
test('saved contact with voicemail',()=>assert.equal(decide({...base,isSavedContact:true,voicemail:{present:true}}).notify,true));
test('unknown voicemail state is pending',()=>assert.equal(decide({...base,voicemail:{}}).pending,true));
test('spam report only does not identify caller',()=>assert.equal(decide({...base,lookup:{exactNumberMatch:true,name:'spam',sourceType:'spam_report'}}).notify,false));
test('other notification is ignored',()=>assert.equal(decide({kind:'message'}).notify,false));

const { missedCallArchive } = require('./Phone-Notification-Decision-v0.1.js');
test('every missed call has an archive candidate even when silent',()=>{
 const event={kind:'missed_call',voicemail:{present:false},isSavedContact:true};
 assert.equal(decide(event).notify,false);
 const archive=missedCallArchive(event);
 assert.equal(archive?.kind,'missed-call');
 assert.equal(archive?.reviewStatus,'未確認');
 assert.equal(archive?.handled,false);
});
test('unknown caller is not identified by guessing a number',()=>{
 const a=missedCallArchive({kind:'missed_call',displayNumber:'01234567890'});
 assert.equal(a.displayName,'発信者未確認');
 assert.equal(a.time,null);
});
test('voicemail presence is not inferred from missing data',()=>{
 const a=missedCallArchive({kind:'missed_call',contactName:'テスト'});
 assert.equal(a.voicemailStatus,'未確認');
});
test('a non-call event is not archived as a missed call',()=>assert.equal(missedCallArchive({kind:'message'}),null));
