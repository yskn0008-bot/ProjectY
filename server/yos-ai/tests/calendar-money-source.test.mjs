import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNotionCalendarMoney} from '../dist/widget/morning.js';

const sourceId='95b30d16753040c6a320dab99acad55d';
const now=new Date('2026-11-14T00:00:00Z');
const title=value=>({title:[{plain_text:value}]});
const select=name=>({select:{name}});
const money=(id,patch={})=>({object:'page',id,last_edited_time:'2026-11-13T02:00:00Z',properties:{
 '項目':title('支払い予定'),'日付':{date:{start:'2026-11-20'}},
 '金額':{number:11000},'区分':select('支出'),
 '状態':select('予定'),'確度':select('確認済'),...patch
}});
function fetchMock(pages){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url:String(url),method:init.method});
  if(String(url).endsWith('/search'))return Response.json({results:[{
   object:'data_source',id:sourceId,title:[{plain_text:'家計イベント・入出金予定'}]}]});
  if(String(url).endsWith('/query'))return Response.json({results:pages,has_more:false,next_cursor:null});
  throw Error('unexpected endpoint');
 };
 return {fetchImpl,calls};
}
test('Notion money projection includes only verified, newly confirmed future income/payments',async()=>{
 const pages=[
 money('a'.repeat(32)),
 money('b'.repeat(32),{'項目':title('入金予定'),'金額':{number:200000},'区分':select('収入'),'日付':{date:{start:'2026-11-18'}}}),
 money('c'.repeat(32),{'確度':select('未確認')}),
 money('d'.repeat(32),{'状態':select('実績')}),
 money('e'.repeat(32),{'区分':select('資金移動')}),
 money('f'.repeat(32),{'日付':{date:{start:'2027-01-01'}}}),
 {...money('g'.repeat(32)),last_edited_time:'2026-10-01T00:00:00Z'}
 ];
 const mock=fetchMock(pages);
 const r=await loadNotionCalendarMoney({notionToken:'fake-notion-token',fetchImpl:mock.fetchImpl,now});
 assert.equal(r.status,'ok');assert.equal(r.complete,true);
 assert.deepEqual(r.items.map(x=>({title:x.title,kind:x.kind,amount:x.amount})),[
 {title:'入金予定',kind:'income',amount:200000},
 {title:'支払い予定',kind:'expense',amount:11000}
 ]);
 assert.deepEqual(mock.calls.map(x=>x.method),['POST','POST']);
 assert.deepEqual(Object.keys(r.items[0]).sort(),['amount','date','id','kind','title']);
});
test('missing, duplicate or unsafe confirmed record IDs fail the source without claiming a partial result',async()=>{
 for(const rows of [[money('invalid')],[money('a'.repeat(32)),money('a'.repeat(32))]]){
  const mock=fetchMock(rows);
  await assert.rejects(()=>loadNotionCalendarMoney({notionToken:'fake-notion-token',fetchImpl:mock.fetchImpl,now}),/ID|duplicate/);
 }
});
test('source read failure never creates a financial event',async()=>{
 const mock=fetchMock([]);
 const x=await loadNotionCalendarMoney({notionToken:'fake-notion-token',fetchImpl:mock.fetchImpl,now});
 assert.equal(x.items.length,0);
 await assert.rejects(()=>loadNotionCalendarMoney({notionToken:'fake-notion-token',now,fetchImpl:async()=>{throw Error('not available')}}));
});
