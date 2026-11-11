import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRSS,shortlist,issueFrom,collect,generate,jstDate,sources} from '../scriptable/journal/daily-editor.mjs';
const now=new Date('2026-11-12T00:30:00Z'),date='Thu, 12 Nov 2026 00:30:00 GMT';
const link='https://www.pref.okinawa.lg.jp/news/abc.html';
const item={title:'沖縄の生活支援に関する新着情報',link,date,description:'沖縄県の公式新着情報として生活支援に関する案内が公開されました。対象条件は本文にあります。'};
const xml='<rss version="2.0"><channel><item><title><![CDATA['+item.title+']]></title><link>'+link+'</link><pubDate>'+date+'</pubDate><description>'+item.description+'</description></item></channel></rss>';
const publicItem=(n=now)=>shortlist([item],sources[0],n)[0];
test('date uses Asia/Tokyo, not runtime UTC',()=>{
 assert.equal(jstDate(new Date('2026-11-11T20:00:00Z')),'2026-11-12');
});
test('official RSS parsing preserves first-party article source metadata',()=>{
 const parsed=parseRSS(xml);assert.equal(parsed[0].title,item.title);assert.equal(parsed[0].link,link);
 assert.equal(shortlist(parsed,sources[0],now).length,1);
});
test('rejects stale, invented, private or third-party links',()=>{
 assert.equal(shortlist([{...item,link:'https://attacker.invalid/abc'}],sources[0],now).length,0);
 assert.equal(shortlist([{...item,date:'2026-10-02'}],sources[0],now).length,0);
 assert.equal(shortlist([{...item,title:'一般競争入札の公告'}],sources[0],now).length,0);
 assert.equal(shortlist([{...item,description:''}],sources[0],now).length,0);
});
test('model cannot fabricate links, original source or date',()=>{
 const x=publicItem();
 const issue=issueFrom({picks:[{id:x.id,title:'FAKE',link:'https://attacker.invalid',source:'FAKE',date:'2099-01-01',
  summary:'公式の案内で生活支援に関する情報を公開しています。対象や期間については原文の確認が必要です。',
  reason:'沖縄で暮らす人が制度の対象と申請要件を確認する際の判断材料です。'}]},[x],now);
 assert.equal(issue.articles[0].link,link);assert.equal(issue.articles[0].title,item.title);
 assert.equal(issue.articles[0].source,'沖縄県公式');assert.equal(issue.articles[0].sourceDate,'2026-11-12');
 assert.equal(issue.issuedOn,'2026-11-12');assert.equal(issue.articles[0].image,'');
});
test('no eligible article does not create a fake dated edition',()=>{
 const x=publicItem();
 assert.throws(()=>issueFrom({picks:[{id:'made-up',summary:'これは不明な情報です。確認する必要がある内容です。',reason:'根拠となる対象が不明なので公開するべきではありません。'}]},[x],now));
 assert.throws(()=>issueFrom({picks:[]},[x],now));
 assert.throws(()=>issueFrom({picks:[{id:x.id,summary:'あなたの借入はあります。口座番号は公開しないでください。',reason:'個人的な情報が含まれている場合は公開してはいけません。'}]},[x],now));
});
test('previous issue source is not repeated or marked as new',()=>{
 const x=publicItem();
 assert.throws(()=>issueFrom({picks:[{id:x.id,summary:'沖縄県の生活支援案内の対象条件は公式ページを参照します。',reason:'生活する地域の制度情報を理解するために確認する価値があります。'}]},[x],now,{articles:[{link:x.link}]}));
});
test('source outage causes no issue overwrite and never calls the model',async()=>{
 let calls=0;
 const mock=async()=>{calls++;throw Error('offline')};
 await assert.rejects(()=>generate({fetcher:mock,now,token:'TEST'}),/No new official/);
 assert.equal(calls,sources.length);
});
test('end to end mock only calls model with bounded official feed facts',async()=>{
 let modelCalled=false;
 const fetcher=async url=>{
  if(url.includes('models.github.ai')){modelCalled=true;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({picks:[{
    id:publicItem().id,summary:'沖縄県の公式情報によれば生活支援に関する案内が公開されています。対象条件は原文確認が必要です。',
    reason:'沖縄県内で暮らす人が支援の対象や確認方法を調べる際の参考になります。'}]})}}]})};}
  return {ok:true,text:async()=>xml};
 };
 const output=await generate({fetcher,now,token:'TEST'});
 assert.equal(modelCalled,true);assert.equal(output.articles.length,1);
 assert.equal(output.articles[0].link,link);assert.match(output.articles[0].caveat,/AI要約/);
});
