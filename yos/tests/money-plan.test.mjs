import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../money-v2.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('  function futurePlan(){'),source.indexOf('  const totalDebt='));
function plan(liquid,transactions){
 const ctx={data:{transactions},isoToday:()=> '2026-09-19',monthKey:()=> '2026-09',currentLiquid:()=>liquid,isOutgoing:t=>t.type==='expense',isComplete:t=>['done','paid','completed','received'].includes(String(t?.status||'').toLowerCase()),txSign:t=>t.type==='income'?1:-1,n:Number,parseDate:s=>new Date(s+'T12:00:00+09:00'),daysBetween:(a,b)=>Math.ceil((b-a)/86400000),Date};
 return vm.runInNewContext(fn+'futurePlan()',ctx);
}
const tx=[{id:'p',type:'expense',date:'2026-09-26',amount:7000},{id:'i',type:'income',date:'2026-09-28',amount:20000}];
test('unknown balance preserves known payment and income without inventing forecast',()=>{const p=plan(null,tx);assert.equal(p.nextPayment.id,'p');assert.equal(p.nextIncome.id,'i');assert.equal(p.daysToNextPayment,7);assert.equal(p.projected,null);assert.equal(p.daily,null);assert.equal(p.afterNextPayment,null);assert.equal(p.shortageAfterNextPayment,null)});
test('known balance keeps forecast and excludes completed payments',()=>{const p=plan(10000,[...tx,{id:'done',type:'expense',status:'done',date:'2026-09-20',amount:99999}]);assert.equal(p.projected,23000);assert.equal(p.nextPayment.id,'p')});
test('empty schedule and unknown balance stay unknown',()=>{const p=plan(null,[]);assert.equal(p.nextPayment,null);assert.equal(p.daysToNextPayment,null);assert.equal(p.projected,null)});

test('paid/completed items are excluded and next income may be in a later month',()=>{const p=plan(10000,[{id:'paid',type:'expense',status:'paid',date:'2026-09-20',amount:9000},{id:'next',type:'expense',date:'2026-09-26',amount:2000},{id:'income',type:'income',date:'2026-10-02',amount:5000}]);assert.equal(p.nextPayment.id,'next');assert.equal(p.nextIncome.id,'income');assert.equal(p.afterNextPayment,8000);assert.equal(p.shortageAfterNextPayment,false)});
