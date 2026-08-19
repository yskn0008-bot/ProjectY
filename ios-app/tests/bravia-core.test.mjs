import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeHost,parseRemoteControllerInfo,resolveCommands,quickSettingsCandidates,irccEnvelope,cursorPlan,SonyRemote,GoogleTvTextAdapter} from '../shell/bravia-core.js';
test('host validation accepts dynamic hosts and rejects paths',()=>{assert.equal(normalizeHost('living-room-tv.local'),'living-room-tv.local');assert.throws(()=>normalizeHost('tv.local/path'));});
test('Sony response produces a dynamic map',()=>{const map=parseRemoteControllerInfo({result:[{},[{name:'Home',value:'runtime-code'},{name:'ActionMenu',value:'candidate'}]]});assert.equal(resolveCommands(map).home.code,'runtime-code');assert.equal(resolveCommands(map).mute,null);assert.deepEqual(quickSettingsCandidates(map),[{name:'ActionMenu',code:'candidate'}]);});
test('IRCC envelope escapes runtime values',()=>assert.match(irccEnvelope('a&b'),/<IRCCCode>a&amp;b<\/IRCCCode>/));
test('cursor dead zone and acceleration are bounded',()=>{assert.equal(cursorPlan(4,3,10),null);assert.deepEqual(cursorPlan(1000,1,1),{action:'right',repeats:8});});
test('authentication failure does not expose credentials',async()=>{const client=new SonyRemote('tv.local',{get:async()=>'runtime-value'},async()=>({ok:false,status:403}));await assert.rejects(client.discover(),/PSK認証/);});
test('Google TV adapter fails closed',async()=>{const adapter=new GoogleTvTextAdapter();assert.equal(adapter.available,false);await assert.rejects(adapter.sendText('hello'),/利用できません/);});
