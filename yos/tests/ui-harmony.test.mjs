import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const identity=app.match(/function renderIdentity\(\)\{[\s\S]*?\n\}/)[0];
test('greeting uses Japanese hour parts across actual morning/day/evening boundaries',()=>{
 for(const [hour,want] of [[0,'おはよう'],[10,'おはよう'],[11,'こんにちは'],[17,'こんにちは'],[18,'こんばんは'],[23,'こんばんは']]){
 const D=Date;class Clock extends D{constructor(...a){super(...(a.length?a:[`2026-09-13T${String(hour).padStart(2,'0')}:00:00+09:00`]))}}
 const out={};vm.runInNewContext(identity+';renderIdentity()',{Date:Clock,Intl,set:(id,value)=>{out[id]=value}});assert.equal(out.homeGreeting,`${want}、ようすけ！`);
 }
});
test('invalid stored palette does not leak into style or change user data',()=>{
 const source=readFileSync(new URL('../ui-theme.js',import.meta.url),'utf8');
 for(const [stored,want] of [['mist','mist'],['sand','sand'],['bad','sage'],[null,'sage']]){const dataset={};vm.runInNewContext(source,{document:{documentElement:{dataset}},localStorage:{getItem:()=>stored}});assert.equal(dataset.mywayTheme,want)}
 const dataset={};vm.runInNewContext(source,{document:{documentElement:{dataset}},localStorage:{getItem:()=>{throw Error('blocked')}}});assert.equal(dataset.mywayTheme,'sage');
});
