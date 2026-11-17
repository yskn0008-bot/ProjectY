import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateCandidate, publicIssue, prepareFiles, writePrepared} from '../gpt-editorial-gate.mjs';

const NOW = new Date('2026-11-18T00:20:00Z'); // Nov 18 JST.
function candidate() {
  const original = 'https://www.pref.okinawa.lg.jp/kurashikankyo/';
  return {
    schemaVersion: 1, publicOnly: true, editorialKind: 'gpt-source-reviewed',
    issue: { issuedOn: '2026-11-18', date: '2026.11.18 / WED',
      headline: '沖縄の公式情報から、今の暮らしを見直す新しいヒント。',
      lead: '公式の解説を読んで暮らしや健康の判断を改善するために、公開条件と注意事項を明示して紹介する。',
      edition: 'PUBLIC-SOURCE PERSONAL EDIT', articles: [{
        category: 'LIFE / PRACTICAL', editorialLane: 'DIRECTION',
        title: '沖縄県の暮らしの案内を、原文から確認する方法。',
        summary: '沖縄県の公式ホームページには、暮らしと環境に関わる制度情報が掲載されている。内容は分野ごとに整理されており、自分が知りたい手続きや制度の対象条件を確認する際の入口になる。具体的な対象や期限は個別の案内を確認する必要がある。',
        reason: '暮らしの手続きや生活の選択をする前に、情報の出どころと適用条件を把握する助けになる。',
        action: '公式ページを開き、必要な制度の対象条件と申請方法が自分の状況に適合するか確かめる。',
        caveat: 'この例は静的なテスト用データであり、実際の公開・記事内容の真偽は別途確認が必要。',
        source: '沖縄県公式Webサイト', sourceDate: '公開日未確認／2026-11-18確認', link: original,
        image: '', imageCaption: '', imageKind: '', keyPoints: ['県公式ホームページの原文から制度情報を確認する']
      }]
    },
    verification: [{link: original, checkedOn: '2026-11-18', sourceType: 'official',
      sourceDateStatus: 'unknown-disclosed',
      evidence: '公式サイトに暮らしと環境の案内が掲載されることを想定したテスト用の証跡。',
      limitations: 'テスト用のため情報の真実性までは証明していない。',
      audienceMatch: '公的手続きと生活環境に関する情報を読むための入口として役立つ。'}]
  };
}
function rejects(edit, match, opts={}) { const x=candidate(); edit(x); assert.throws(() => validateCandidate(x,{now:NOW,...opts}), match); }

test('allows an independently reviewed public-source format with no private data', () => {
  const v=candidate(); assert.equal(validateCandidate(v,{now:NOW}),true);
  const result=publicIssue(v,{now:NOW}); assert.equal(result.issuedOn,'2026-11-18');
  assert.equal(result.articles.length,1);
  assert.equal('verification' in result,false);
  assert.equal(result.articles[0].image,'');
});
test('does not issue fake dates, future or stale source checks', () => {
  rejects(v=>{v.issue.issuedOn='2026-11-17'},/not current/);
  rejects(v=>{v.verification[0].checkedOn='2026-11-14'},/source check/);
  rejects(v=>{v.verification[0].checkedOn='2026-11-19'},/source check/);
  rejects(v=>{v.verification[0].checkedOn='2026-02-31'},/source check/);
});
test('requires explicit checks and article facts rather than generic category match',()=>{
  rejects(v=>{v.verification=[]},/count mismatch/);
  rejects(v=>{v.verification[0].link='https://www.city.ginowan.lg.jp/'},/mismatch/);
  rejects(v=>{v.verification[0].evidence='unverified'},/evidence/);
  rejects(v=>{v.issue.articles[0].summary='生活の情報'},/article summary/);
  rejects(v=>{v.issue.articles[0].editorialLane='FINANCE'},/lane/);
});
test('rejects private personal content even in source notes',()=>{
  rejects(v=>{v.issue.articles[0].reason='陽介は今日お金を出す。個人の予定として確認しないといけない。'},/private/);
  rejects(v=>{v.verification[0].limitations='source notes: sk-proj-xxxxxxxxxxxxxxxxxxxxxx'},/private/);
  rejects(v=>{v.issue.articles[0].action='私の連絡先は private@example.org。公式サイトを見よう。'},/private/);
  rejects(v=>{v.sourceNotes='nonexistent extra'},/unexpected field/);
});
test('rejects unsafe source URLs and unlicensed media',()=>{
  rejects(v=>{v.issue.articles[0].link='http://www.pref.okinawa.lg.jp/abc'},/unsafe/);
  rejects(v=>{v.issue.articles[0].link='https://127.0.0.1/'},/unsafe/);
  rejects(v=>{v.issue.articles[0].link='https://attacker.invalid/'},/unsafe/);
  rejects(v=>{v.issue.articles[0].link='https://www.pref.okinawa.lg.jp/?token=secret'},/credentialed/);
  rejects(v=>{v.issue.articles[0].image='https://example.com/photo.jpg'},/unlicensed/);
});
test('does not duplicate the same URL in this issue or recent issues',()=>{
  rejects(v=>{v.issue.articles.push({...v.issue.articles[0]});v.verification.push({...v.verification[0]})},/duplicate/);
  rejects(_=>{},/duplicate/,{recent:[{articles:[{link:'https://www.pref.okinawa.lg.jp/kurashikankyo/'}]}]});
});
async function tmpRoot(f) {
  const root = await mkdtemp(join(tmpdir(), 'yos-journal-gpt-'));
  await mkdir(join(root,'journal','editions'),{recursive:true});
  await mkdir(join(root,'ios-app','scriptable','journal'),{recursive:true});
  try { await f(root); } finally { await rm(root,{recursive:true,force:true}); }
}
test('dry-run has no side effects, and cannot overwrite existing dated issue',async()=>tmpRoot(async(root)=>{
  const v=candidate();
  await writeFile(join(root,'ios-app/scriptable/journal/latest.json'),JSON.stringify({issuedOn:'2026-11-17',articles:[]}));
  let p=await prepareFiles(v,root,{now:NOW}); assert.equal(p.paths.length,3);
  await assert.rejects(()=>readFile(p.paths[0],'utf8'),/ENOENT/);
  await assert.rejects(()=>writePrepared(v,root,{now:NOW}),/explicit editorial review/);
  await writeFile(p.paths[0], JSON.stringify({issuedOn:'2026-11-18'}));
  await assert.rejects(()=>writePrepared(v,root,{now:NOW,approved:true}),/already exists/);
}));
test('approved branch publication writes identical 3 public files; no verification notes leak',async()=>tmpRoot(async(root)=>{
  await writeFile(join(root,'ios-app/scriptable/journal/latest.json'),JSON.stringify({issuedOn:'2026-11-17',articles:[]}));
  const x=await writePrepared(candidate(),root,{now:NOW,approved:true});
  const all=await Promise.all(x.paths.map(p=>readFile(p,'utf8')));
  assert.equal(new Set(all).size,1);assert.equal(JSON.parse(all[0]).issuedOn,'2026-11-18');
  assert.ok(!all[0].includes('sourceStatus'));
  assert.ok(!all[0].includes('checkedOn'));
}));
test('prevents publication of an issue earlier than existing latest',async()=>tmpRoot(async(root)=>{
  await writeFile(join(root,'ios-app/scriptable/journal/latest.json'),JSON.stringify({issuedOn:'2026-11-20',articles:[]}));
  await assert.rejects(()=>prepareFiles(candidate(),root,{now:NOW}),/latest is newer/);
}));
test('malformed existing latest fails closed rather than silently overwriting',async()=>tmpRoot(async(root)=>{
  await writeFile(join(root,'ios-app/scriptable/journal/latest.json'),'NOT JSON');
  await assert.rejects(()=>prepareFiles(candidate(),root,{now:NOW}),/latest cannot be read/);
}));