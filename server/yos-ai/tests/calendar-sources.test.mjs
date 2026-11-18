import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCalendarSources} from '../dist/tasks/calendar-sources.js';
const title=s=>({title:[{plain_text:s}]}),select=name=>({select:{name}}),date=start=>({date:{start}});
const row=(id,properties)=>({id:id.repeat(32),properties});
const fixtures={
 '30df9a73':[row('a',{'イベント名':title('実際の帰宅'),'発生日時':date('2026-11-17T16:00:00Z')})],
 '829c91b0':[row('b',{'人物・イベント':title('日付未確認の記念日'),'記念日':date('2026-11-18'),'事実の確度':select('未確認')})],
 'd0ed2cf0':[row('c',{'商品名':title('セール候補'),'セール予定日':date('2026-11-18')})],
 '95b30d16':[row('d',{'項目':title('支払予定'),'日付':date('2026-11-18'),'区分':select('支出'),'状態':select('予定'),'金額':{number:12000},'確度':select('未確認')}),row('e',{'項目':title('入金済'),'日付':date('2026-11-18'),'区分':select('収入'),'状態':select('実績'),'金額':{number:40000},'確度':select('確認済')})],
 '9205e5b7':[row('f',{'案件名':title('タスクと同じ案件'),'対応期限':date('2026-11-18'),'関連タスク':{relation:[{id:'a'.repeat(32)}]}})]
};
const mock=async(url,init)=>{assert.equal(init.method,'POST');assert.match(url,/^https:\/\/api.notion.com\/v1\/data_sources\//);const source=Object.keys(fixtures).find(k=>url.includes(k));return Response.json({results:fixtures[source]||[],has_more:false})};
test('existing sources keep real dates, uncertainty, actual/planned money; linked cases are not duplicate tasks',async()=>{
 const r=await loadCalendarSources({notionToken:'test-only',fetchImpl:mock});
 assert.equal(r.sources.length,5);assert.equal(r.sources.every(s=>s.status==='ok'),true);
 assert.equal(r.sources[0].items[0].date,'2026-11-18');assert.equal(r.sources[0].items[0].subtitle,'実績');
 assert.equal(r.sources[1].items[0].subtitle,'未確認');
 const m=r.sources.find(s=>s.name==='家計イベント・入出金予定').items;assert.equal(m[0].verification,'未確認');assert.equal(m[0].complete,false);assert.equal(m[1].complete,true);
 assert.equal(r.sources.at(-1).items.length,0);assert.equal(r.sources.at(-1).skippedLinked,1);
 assert.doesNotMatch(JSON.stringify(r),/test-only/);
});
test('unavailable or incomplete source never fabricates records; other sources remain available',async()=>{
 const r=await loadCalendarSources({notionToken:'test',fetchImpl:async(url,init)=>url.includes('30df9a73')?Response.json({results:[],has_more:true,next_cursor:'repeat'}):mock(url,init)});
 assert.equal(r.sources[0].status,'unavailable');assert.deepEqual(r.sources[0].items,[]);assert.equal(r.sources[1].status,'ok');
});
test('invalid financial amount fails only finance; transfer and cancellation are not spending',async()=>{
 const r=await loadCalendarSources({notionToken:'test',fetchImpl:async(url,init)=>url.includes('95b30d16')?Response.json({results:[row('a',{'項目':title('invalid'),'日付':date('2026-11-18'),'区分':select('支出'),'状態':select('実績'),'金額':{number:-1}})],has_more:false}):mock(url,init)});
 assert.equal(r.sources[3].status,'unavailable');assert.equal(r.sources[0].status,'ok');
});
