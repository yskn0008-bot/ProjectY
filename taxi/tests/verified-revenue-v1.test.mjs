import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('../verified-revenue-v1.js',import.meta.url),'utf8');
let counter=0;
const storage=(raw=null)=>{
 const data=new Map([['yos-taxi-ui-v2-live-20261117','protected-old-ledger'],
   ['yos-taxi-ops-v1','protected-legacy'],['yos-taxi-wait-clock-v1','protected-timer'],
   ['yos-taxi-field-reports-v1','protected-observations']]);
 if(raw!==null)data.set('yos-taxi-confirmed-reports-v1',raw);
 return {data,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v)};
};
function env(raw=null) {
 const localStorage=storage(raw),window={localStorage,crypto:{randomUUID:()=> 'report-'+(++counter)}};
 runInNewContext(code,{window,Date,Set,String,Number,Object,JSON});
 return {api:window.YosTaxiConfirmedRevenueV1,store:localStorage};
}
const sha=c=>'sha256:'+c.repeat(64);
const receipt=(overrides={})=>({businessDate:'2026-11-21',amountYen:21950,
 taxBasis:'unconfirmed',reportClock:null,photoSha256:sha('a'),photoKind:'paper-total',...overrides});
function assertLegacyUntouched(store){
 for(const [key,want] of [['yos-taxi-ui-v2-live-20261117','protected-old-ledger'],
  ['yos-taxi-ops-v1','protected-legacy'],['yos-taxi-wait-clock-v1','protected-timer'],
  ['yos-taxi-field-reports-v1','protected-observations']])assert.equal(store.getItem(key),want);
}
test('Nov 21 photographed paper ledger TOTAL 21,950 is not confused with CASH 10,400',()=>{
 const e=env(),recognized=e.api.detectText('令和8年11月21日 総収入 21,950 現 金 10,400');
 assert.equal(recognized.kind,'paper-total');assert.equal(recognized.grossYen,21950);
 assert.equal(e.api.detectText('総収入 21,950 総収入 22,950').grossYen,null);
 assert.equal(e.api.detectText('現金 10,400').grossYen,null);
});
test('Nov 22 ride-history photograph does not become cumulative sales',()=>{
 const e=env();
 const result=e.api.detectText('営業履歴 (15) 一般乗車 ¥750 ¥2250 ¥2200');
 assert.equal(result.kind,'ride-history');assert.equal(result.grossYen,null);
 assert.equal(e.api.confirm(receipt({photoKind:'ride-history'}),e.store).status,'invalid');
 assert.equal(e.api.latest('2026-11-21',e.store),null);
});
test('a first confirmed photo creates an independent local record, never a Notion update',()=>{
 const e=env(),result=e.api.confirm(receipt(),e.store,()=> 'unique-1');
 assert.equal(result.status,'saved');
 assert.equal(e.api.latest('2026-11-21',e.store).amountYen,21950);
 assert.equal(e.api.latest('2026-11-22',e.store),null);
 assertLegacyUntouched(e.store);
});
test('reimported photo is rejected, and equal cumulative total does not add',()=>{
 const e=env();
 assert.equal(e.api.confirm(receipt(),e.store,()=> 'r1').status,'saved');
 assert.equal(e.api.confirm(receipt(),e.store,()=> 'r2').status,'duplicate-photo');
 assert.equal(e.api.confirm(receipt({photoSha256:sha('b')}),e.store,()=> 'r3').status,'duplicate-total');
 assert.equal(e.api.list(e.store).length,1);
});
test('later snapshot replaces instead of summing and preserves the previous version',()=>{
 const e=env(),first=receipt({reportClock:'23:55'});
 assert.equal(e.api.confirm(first,e.store,()=> 'r1').status,'saved');
 const later=receipt({reportClock:'00:10',amountYen:24000,photoSha256:sha('b')});
 assert.equal(e.api.confirm(later,e.store,()=> 'r2').status,'saved');
 assert.equal(e.api.latest('2026-11-21',e.store).amountYen,24000);
 assert.equal(e.api.list(e.store).length,2);
 assert.equal(e.api.list(e.store)[1].supersedesId,'r1');
 assertLegacyUntouched(e.store);
});
test('stale report and lower gross are blocked unless user explicitly corrects',()=>{
 const e=env(),start=receipt({reportClock:'22:00'});
 e.api.confirm(start,e.store,()=> 'r1');
 assert.equal(e.api.confirm(receipt({amountYen:22500,photoSha256:sha('b'),reportClock:'20:00'}),e.store).status,'stale-report');
 assert.equal(e.api.confirm(receipt({amountYen:20000,photoSha256:sha('b'),reportClock:'23:00'}),e.store).status,'decrease-needs-review');
 assert.equal(e.api.confirm(receipt({amountYen:20000,photoSha256:sha('b'),reportClock:'23:00',correctionOf:'r1'}),e.store,()=> 'r2').status,'saved');
 assert.equal(e.api.list(e.store).length,2);
 assert.equal(e.api.latest('2026-11-21',e.store).amountYen,20000);
});
test('untimed second photo needs explicit correction, and wrong revision never wins',()=>{
 const e=env();
 e.api.confirm(receipt(),e.store,()=> 'r1');
 assert.equal(e.api.confirm(receipt({amountYen:23000,photoSha256:sha('b')}),e.store).status,'needs-correction-confirmation');
 assert.equal(e.api.confirm(receipt({amountYen:23000,photoSha256:sha('b'),correctionOf:'missing'}),e.store).status,'needs-correction-confirmation');
 assert.equal(e.api.confirm(receipt({amountYen:23000,photoSha256:sha('b'),correctionOf:'r1'}),e.store,()=> 'r2').status,'saved');
 assert.equal(e.api.latest('2026-11-21',e.store).amountYen,23000);
});
test('malformed storage, failed writes and impossible dates are fail-closed',()=>{
 const broken=env('{bad');assert.equal(broken.api.confirm(receipt(),broken.store).status,'corrupt-preserved');
 assert.equal(broken.store.getItem(broken.api.KEY),'{bad');
 const e=env();const bad=['2026-02-30','2026-13-01','2026-00-01'];
 for(const day of bad)assert.equal(e.api.confirm(receipt({businessDate:day}),e.store).status,'invalid');
 const failing=env();failing.store.setItem=()=>{throw Error('quota')};
 assert.equal(failing.api.confirm(receipt(),failing.store,()=> 'r1').status,'storage-error');
 assertLegacyUntouched(failing.store);
});
test('wrong tax basis, corrupt hashes and unsafe amounts are rejected',()=>{
 const e=env();
 for(const amount of ['-1','1.5','¥21950','999999999999','abc'])assert.equal(e.api.confirm(receipt({amountYen:amount}),e.store).status,'invalid');
 for(const taxBasis of ['','guess'])assert.equal(e.api.confirm(receipt({taxBasis}),e.store).status,'invalid');
 assert.equal(e.api.confirm(receipt({photoSha256:'not-a-sha'}),e.store).status,'invalid');
 assert.equal(e.store.getItem(e.api.KEY),null);
});


test('OCR text that identifies an individual ride-history screen cannot be treated as a daily total',()=>{
 const e=env();
 for(const text of ['営業履歴 (15) ¥750 ¥2250','営業履歴（15） 総収入 21,950']){
   const result=e.api.detectText(text);
   assert.equal(result.kind,'ride-history');
   assert.equal(result.grossYen,null);
 }
});


test('month totals keep only the latest snapshot per day and remain provisional',()=>{
 const e=env();
 assert.equal(e.api.confirm(receipt({reportClock:'21:00',taxBasis:'tax-included'}),e.store,()=> 'r1').status,'saved');
 assert.equal(e.api.confirm(receipt({amountYen:24000,reportClock:'22:00',taxBasis:'tax-included',photoSha256:sha('b')}),e.store,()=> 'r2').status,'saved');
 assert.equal(e.api.confirm(receipt({businessDate:'2026-11-22',amountYen:14750,taxBasis:'tax-included',photoSha256:sha('c')}),e.store,()=> 'r3').status,'saved');
 const result=e.api.monthSummary('2026-11',e.store);
 assert.equal(result.status,'partial');
 assert.equal(result.dayCount,2);
 assert.equal(result.taxBasis,'tax-included');
 assert.equal(result.totalYen,38750); // 24,000 + 14,750 (not 21,950+24,000+14,750)
 assertLegacyUntouched(e.store);
});
test('month rejects mixing tax-included and tax-excluded daily figures',()=>{
 const e=env();
 e.api.confirm(receipt({taxBasis:'tax-included'}),e.store,()=> 'r1');
 e.api.confirm(receipt({businessDate:'2026-11-22',taxBasis:'tax-excluded',photoSha256:sha('b')}),e.store,()=> 'r2');
 const result=e.api.monthSummary('2026-11',e.store);
 assert.equal(result.status,'mixed-basis');assert.equal(result.dayCount,2);
 assert.equal(result.totalYen,null);
});
test('month rejects aggregating amounts whose tax treatment remains unconfirmed',()=>{
 const e=env();
 e.api.confirm(receipt(),e.store,()=> 'r1');
 e.api.confirm(receipt({businessDate:'2026-11-22',photoSha256:sha('b')}),e.store,()=> 'r2');
 const result=e.api.monthSummary('2026-11',e.store);
 assert.equal(result.status,'basis-unconfirmed');assert.equal(result.totalYen,null);
 assert.equal(e.api.latest('2026-11-21',e.store).amountYen,21950);
});
test('month handles invalid months, empty months, and corrupt saved records without deleting them',()=>{
 const e=env();
 for(const month of ['2026-13','2026-00','2026-11-01'])assert.equal(e.api.monthSummary(month,e.store).status,'invalid-month');
 assert.equal(e.api.monthSummary('2026-11',e.store).status,'no-data');
 const bad=env('corrupted and preserved');
 assert.equal(bad.api.monthSummary('2026-11',bad.store).status,'corrupt-preserved');
 assert.equal(bad.store.getItem(bad.api.KEY),'corrupted and preserved');
 assertLegacyUntouched(bad.store);
});
