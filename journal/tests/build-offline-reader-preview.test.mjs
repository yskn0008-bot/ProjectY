import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildOfflineReaderPreview} from '../build-offline-reader-preview.mjs';

const html=await readFile(new URL('../../journal-v2/index.html',import.meta.url),'utf8');
const candidate=JSON.parse(await readFile(new URL('../editorial-candidates/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const copy=o=>structuredClone(o);
test('offline reader uses existing production reader template without modifying shared assets',()=>{
 const out=buildOfflineReaderPreview(html,copy(candidate));
 assert.ok(out.toLowerCase().startsWith('<!doctype html>'));
 assert.ok(out.includes('非公開の編集プレビュー'));
 assert.ok(out.includes('const today="2026-11-20";'));
 assert.ok(out.includes('301人と307人の実験'));
 assert.ok(out.includes('0.22ポイント'));
 assert.ok(out.includes('journal/editions/'));
 assert.ok(!out.includes("navigator.serviceWorker.register('./service-worker.js')"));
 assert.ok(!out.includes('const today=new Date().toLocaleDateString'));
 assert.ok(!out.includes('api.notion.com'));
 assert.ok(!out.includes('YOS_NOTION_INTEGRATION_TOKEN'));
 assert.ok(!out.includes('sk-proj-'));
 assert.ok(!html.includes('yos-editorial-preview-banner'));
});
test('rejects source template drift and non public candidate',()=>{
 assert.throws(()=>buildOfflineReaderPreview('<html>not the real reader</html>',copy(candidate)),/unexpected real reader/);
 const x=copy(candidate);x.publicOnly=false;
 assert.throws(()=>buildOfflineReaderPreview(html,x),/unsupported candidate contract/);
});
test('refuses private data before generating preview',()=>{
 const x=copy(candidate);
 x.issue.articles[0].summary+=' 陽介の非公開メモを引用。';
 assert.throws(()=>buildOfflineReaderPreview(html,x),/private content/);
});
test('HTML injection cannot terminate embedded preview script',()=>{
 const x=copy(candidate);
 x.issue.articles[0].title='研究の印象を考える：</script><script>alert(1)</script>という悪意のある表記';
 const out=buildOfflineReaderPreview(html,x);
 assert.ok(out.includes('\\u003c/script'));
 assert.ok(!out.includes('</script><script>alert(1)</script>'));
});
