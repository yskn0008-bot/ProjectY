import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublication} from '../scriptable/journal/validate-publish.mjs';
const now=new Date('2026-11-12T01:00:00Z');
const valid={date:'2026年11月12日（木）',issuedOn:'2026-11-12',headline:'沖縄県の生活支援について公式発表',
 articles:[{title:'沖縄県の生活支援について公式発表',summary:'県の公式ページで支援内容を確認できるようになりました。',
  reason:'生活情報を把握するために役立つ公的な案内です。',
  action:'公式サイトで対象となる条件を確認します。',
  caveat:'AI要約のため必ず原文で確認してください。',
  source:'沖縄県公式',sourceDate:'2026-11-12',link:'https://www.pref.okinawa.lg.jp/news/101.html',
  image:'',imageCaption:'',imageKind:'',keyPoints:[]}]};
const check=issue=>validatePublication(issue,now);
test('accepts fresh source-limited public issue with no unlicensed images',()=>assert.equal(check(valid),true));
test('rejects stale or fake today issues',()=>{
 assert.throws(()=>check({...valid,issuedOn:'2026-11-04'}),/not an eligible/);
 assert.throws(()=>check({...valid,articles:[{...valid.articles[0],sourceDate:'2026-11-01'}]}),/source date/);
});
test('rejects outside URLs and source impersonation',()=>{
 assert.throws(()=>check({...valid,articles:[{...valid.articles[0],link:'https://attacker.invalid/news'}]}),/unverified/);
 assert.throws(()=>check({...valid,articles:[{...valid.articles[0],source:'Official Bank'}]}),/unverified/);
});
test('rejects any image without rights review and private data',()=>{
 assert.throws(()=>check({...valid,articles:[{...valid.articles[0],image:'https://example.com/photo'}]}),/image/);
 assert.throws(()=>check({...valid,articles:[{...valid.articles[0],reason:'あなたの残高がいくらかを知らせる記事です。'}]}),/personal-data/);
});
test('rejects unqualified AI-generated summaries and duplicate links',()=>{
 assert.throws(()=>check({...valid,articles:[{...valid.articles[0],caveat:'確認してください。根拠を確認してください。'}]}),/AI summaries/);
 assert.throws(()=>check({...valid,articles:[...valid.articles,valid.articles[0]]}),/repeated/);
});
