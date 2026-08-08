import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const js=await readFile(new URL('../sync-diagnostics-v142.js',import.meta.url),'utf8');
const css=await readFile(new URL('../sync-diagnostics-v142.css',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');

test('diagnostics never exposes the stored token value',()=>{
  assert.match(js,/TOKEN_KEY='yos-taxi-sync-token-v1'/);
  assert.match(js,/tokenConfigured:Boolean\(token\)/);
  assert.doesNotMatch(js,/innerHTML[^;]*\$\{token\}/);
});

test('diagnostics exposes actionable states and manual retry',()=>{
  for(const text of ['オフライン','API未設定','トークン未設定','送信エラー','送信待ち','接続準備OK','今すぐ再送'])assert.ok(js.includes(text),text);
  assert.match(js,/function forceRetry\(\)/);
  assert.match(js,/queue\.map\(item=>\(\{\.\.\.item,nextAttemptAt:0,lastError:''\}\)\)/);
  assert.match(js,/write\(QUEUE_KEY,retryQueue\)/);
  assert.match(js,/dispatchEvent\(new Event\('online'\)\)/);
  assert.match(js,/data\.pending\?'':'disabled'/);
});

test('current service worker refreshes cached diagnostics assets only on index',()=>{
  for(const file of ['sync-diagnostics-v142.css','sync-diagnostics-v142.js']){
    assert.ok(sw.includes(`'./${file}'`));
    assert.ok(sw.includes(`add${file.endsWith('.css')?'Css':'Js'}('${file}')`));
  }
  const versionMatch=sw.match(/const VERSION='([^']+)'/);
  const cacheMatch=sw.match(/const CACHE='([^']+)'/);
  assert.ok(versionMatch,'Service Worker VERSION');
  assert.ok(cacheMatch,'Service Worker CACHE');
  assert.ok(cacheMatch[1].startsWith(`yos-taxi-projecty-v${versionMatch[1]}`));
  assert.match(sw,/if\(type==='index'\)/);
});

test('small-screen layout remains compact',()=>{
  assert.match(css,/@media\(max-height:680px\)/);
  assert.match(css,/min-height:40px/);
});
